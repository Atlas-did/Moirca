// popup 逻辑(双形态,构建期 mode 决定 UI 分支):
// - readonly:页面只读问答闭环(通道②):提取当前页正文/选区 → POST /api/context/ask → 渲染回答
//   (选区优先、解读视角、一键复制、后端地址设置 —— 交互文案移植自 moirca-webbridge,按新契约实现)
// - pro:daemon 连接状态 + 托管标签数(仅展示;pro 问答走 MCP 工具,不经 popup)
import { getMode } from '../mode.js';
import { wbExtractContext } from '../readonly/readonly-extract.js';
import { contextAsk, pingBackend, getBackendBase, CONTEXT_TEXT_MAX_CHARS, QUESTION_MAX_CHARS, DEFAULT_BACKEND_BASE } from '../readonly/ask-client.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- 只读工具(与老版一致的安全渲染) ----------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 极简 markdown 渲染(安全:先整体转义,再生成受控标签) */
function renderMarkdown(text: string): string {
  let html = escapeHtml(text || '');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ---------- readonly:页面只读问答(通道②) ----------

async function handleAsk(): Promise<void> {
  const questionEl = $<HTMLTextAreaElement>('question');
  const answerEl = $('answer');
  const metaEl = $('meta');
  const statusEl = $('status');
  const errorEl = $('error');
  const copyBtn = $<HTMLButtonElement>('copy');
  const askBtn = $<HTMLButtonElement>('ask');
  const agentSel = $<HTMLSelectElement>('agent');
  const sourceLabel: Record<string, string> = { selection: '选中文字', page: '整页正文', none: '无页面内容' };

  const question = questionEl.value.trim();
  errorEl.textContent = '';
  metaEl.textContent = '';
  copyBtn.disabled = true;
  if (!question) {
    errorEl.textContent = '请先填写你的问题。';
    return;
  }
  if (question.length > QUESTION_MAX_CHARS) {
    errorEl.textContent = `问题超过 ${QUESTION_MAX_CHARS} 字,请精简。`;
    return;
  }
  askBtn.disabled = true;
  answerEl.innerHTML = '解读中…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') throw new Error('找不到当前标签页');

    // 按需注入提取(activeTab+scripting;受限页 chrome:// 注入失败则无上下文提问)
    type PageExtract = Awaited<ReturnType<typeof wbExtractContext>> | null;
    let page: PageExtract = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: wbExtractContext,
        args: [CONTEXT_TEXT_MAX_CHARS],
      });
      page = (results?.[0]?.result ?? null) as PageExtract;
    } catch {
      page = null;
    }

    statusEl.textContent = '正在请求后端…';
    const data = await contextAsk({
      page_title: page?.title ?? tab.title ?? '',
      page_url: page?.url ?? tab.url ?? '',
      context_text: page?.contextText ?? '',
      question,
      agent_id: agentSel.value || 'master',
    });

    answerEl.innerHTML = renderMarkdown(data.answer || '(空回答)');
    copyBtn.disabled = false;
    copyBtn.dataset.answer = data.answer || '';
    metaEl.textContent =
      `视角:${data.agent_name || data.agent_id} · 模型:${data.model_used === 'llm' ? '大模型' : '规则降级'}` +
      ` · 来源:${sourceLabel[page?.source ?? 'none']}` +
      (data.truncated || page?.truncated ? ' · 正文已截断' : '');
  } catch (e) {
    const err = e as { message?: string; code?: string };
    errorEl.textContent =
      `请求失败:${err.message ?? String(e)}\n\n请确认:\n1. 后端已启动(backend,端口 8000)\n2. 弹窗底部「后端设置」地址正确\n3. readonly 模式仅做只读问答,不执行浏览器动作`;
    answerEl.innerHTML = '';
  } finally {
    askBtn.disabled = false;
    statusEl.textContent = '';
  }
}

async function handleCopy(): Promise<void> {
  const copyBtn = $<HTMLButtonElement>('copy');
  const text = copyBtn.dataset.answer || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '已复制';
    setTimeout(() => {
      copyBtn.textContent = '复制';
    }, 1200);
  } catch {
    // 剪贴板不可用时静默,用户可手动选择
  }
}

async function initBackendSettings(): Promise<void> {
  const apiInput = $<HTMLInputElement>('apiBase');
  const saveBtn = $<HTMLButtonElement>('saveApi');
  const pingEl = $('pingResult');
  apiInput.value = await getBackendBase();

  saveBtn.addEventListener('click', async () => {
    const base = apiInput.value.trim().replace(/\/+$/, '');
    pingEl.className = '';
    pingEl.textContent = '';
    if (!base || base === DEFAULT_BACKEND_BASE) {
      await chrome.storage.sync.remove('apiBase');
      pingEl.textContent = `已恢复默认地址 ${DEFAULT_BACKEND_BASE}`;
      pingEl.className = 'ok';
      return;
    }
    if (!/^https?:\/\/.+/.test(base)) {
      pingEl.textContent = '地址需以 http:// 或 https:// 开头';
      pingEl.className = 'bad';
      return;
    }
    // 自定义后端地址需要主机授权(user gesture 下请求)
    let origin = '';
    try {
      origin = new URL(base).origin;
    } catch {
      pingEl.textContent = '地址格式非法';
      pingEl.className = 'bad';
      return;
    }
    try {
      const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      if (!granted) await chrome.permissions.request({ origins: [`${origin}/*`] });
    } catch {
      /* 权限接口不可用时不阻塞保存 */
    }
    await chrome.storage.sync.set({ apiBase: base });
    pingEl.textContent = `已保存 ${base},正在测试连接…`;
    try {
      await pingBackend();
      pingEl.textContent = '连接成功';
      pingEl.className = 'ok';
    } catch (e) {
      pingEl.textContent = `连接失败:${e instanceof Error ? e.message : String(e)}`;
      pingEl.className = 'bad';
    }
  });

  // 打开弹窗静默探测后端
  try {
    await pingBackend();
    pingEl.textContent = '后端连接正常';
    pingEl.className = 'ok';
  } catch {
    pingEl.textContent = '后端未连接(仅影响问答)';
    pingEl.className = 'bad';
  }
}

// ---------- pro:daemon 连接状态 ----------

async function initProStatus(): Promise<void> {
  const connEl = $('connStatus');
  const modeEl = $('modeLabel');
  const tabsEl = $('managedTabs');
  modeEl.textContent = 'pro 模式(CDP)';
  const { wsStatus } = (await chrome.storage.local.get({ wsStatus: 'disconnected' })) as { wsStatus: string };
  connEl.textContent = `daemon: ${wsStatus === 'connected' ? '已连接 ws://127.0.0.1:9223' : '未连接(启动 daemon 后自动重连)'}`;
  const all = await chrome.tabs.query({});
  const managedIds = new Set(
    all.filter((t) => t.url !== undefined).map((t) => t.id),
  );
  tabsEl.textContent = `打开标签:${all.length} 个(托管标签由 daemon 会话创建)`;
  void managedIds;

  // 配对 token:粘贴 daemon 一次性 token → 存 storage → 重载扩展立即重握手
  const tokenEl = $<HTMLInputElement>('wsToken');
  const saveBtn = $<HTMLButtonElement>('saveToken');
  const statusEl = $('tokenStatus');
  const saved = await chrome.storage.local.get({ wsToken: '' });
  if (saved.wsToken) tokenEl.value = saved.wsToken;
  saveBtn.addEventListener('click', async () => {
    const token = tokenEl.value.trim();
    if (!token) {
      statusEl.textContent = '请先粘贴 daemon 的 token。';
      statusEl.className = 'bad';
      return;
    }
    await chrome.storage.local.set({ wsToken: token });
    statusEl.textContent = '已保存,正在用新 token 重新握手…';
    statusEl.className = 'ok';
    setTimeout(() => chrome.runtime.reload(), 300);
  });
}

// ---------- pro:截图分析(popup → background 消息通道,§a.6) ----------

interface ShotMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  brightness: number;
  colorfulness: number;
  dominantColors: Array<{ rgb: [number, number, number]; share: number }>;
}

function shotColorfulnessLabel(c: number): string {
  return c < 15 ? '低' : c < 45 ? '中' : '高';
}

function shotRgbToHex(rgb: [number, number, number]): string {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

async function handleAnalyzeScreenshot(): Promise<void> {
  const btn = $<HTMLButtonElement>('analyzeShot');
  const metaEl = $('shotMeta');
  const swatchesEl = $('shotSwatches');
  const summaryEl = $('shotSummary');
  const statusEl = $('shotStatus');
  btn.disabled = true;
  statusEl.textContent = '分析中…(截取当前页并在本机计算指标)';
  statusEl.className = '';
  metaEl.textContent = '';
  swatchesEl.innerHTML = '';
  summaryEl.textContent = '';
  try {
    const res = (await chrome.runtime.sendMessage({ kind: 'wb_analyze_screenshot' })) as
      | { ok: true; metrics: ShotMetrics; summary: string; reported: boolean }
      | { ok: false; error?: string; code?: string }
      | undefined;
    if (!res || res.ok !== true) {
      statusEl.textContent = `分析失败:${res?.error ?? '后台无响应,请重开弹窗重试'}`;
      statusEl.className = 'bad';
      return;
    }
    const m = res.metrics;
    const ar = Math.round(m.aspectRatio * 100) / 100;
    metaEl.textContent =
      `尺寸:${m.width}×${m.height}(宽高比 ${ar || '-'});` +
      `亮度 ${m.brightness.toFixed(3)};彩色度 ${Math.round(m.colorfulness)}(${shotColorfulnessLabel(m.colorfulness)})`;
    swatchesEl.innerHTML = m.dominantColors
      .map((c) => {
        const hex = shotRgbToHex(c.rgb);
        return `<span class="swatch" style="background:#${hex}" title="#${hex} 占比 ${(c.share * 100).toFixed(1)}%"></span>`;
      })
      .join('');
    summaryEl.textContent = res.summary || '';
    statusEl.textContent = res.reported
      ? '已分析并上报 daemon 网关'
      : '已分析(未连 daemon,数据未上报网关)';
    statusEl.className = res.reported ? 'ok' : '';
  } catch (e) {
    statusEl.textContent = `分析失败:${e instanceof Error ? e.message : String(e)}`;
    statusEl.className = 'bad';
  } finally {
    btn.disabled = false;
  }
}

function initProAnalysis(): void {
  $<HTMLButtonElement>('analyzeShot').addEventListener('click', () => {
    void handleAnalyzeScreenshot();
  });
}

// ---------- 初始化 ----------

async function init(): Promise<void> {
  const mode = getMode();
  const readonlyView = $('readonlyView');
  const proView = $('proView');
  const titleEl = $('title');
  if (mode === 'readonly') {
    titleEl.textContent = 'WebBridge 页面只读问答';
    readonlyView.style.display = 'block';
    proView.style.display = 'none';
    $<HTMLButtonElement>('ask').addEventListener('click', handleAsk);
    $<HTMLButtonElement>('copy').addEventListener('click', handleCopy);
    $<HTMLTextAreaElement>('question').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAsk();
    });
    await initBackendSettings();
  } else {
    titleEl.textContent = 'WebBridge Pro';
    readonlyView.style.display = 'none';
    proView.style.display = 'block';
    await initProStatus();
    initProAnalysis();
  }
}

void init();
