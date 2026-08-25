// popup 逻辑：读取问题/Agent → 按需注入 content.js → 索取上下文 → 转发后端 → 渲染结果。
// 设置页可自定义后端地址（chrome.storage.sync 持久化）。

const $ = (id) => document.getElementById(id);
const askBtn = $('ask');
const answerEl = $('answer');
const metaEl = $('meta');
const statusEl = $('status');
const errorEl = $('error');
const copyBtn = $('copy');
const apiInput = $('apiBase');
const saveApiBtn = $('saveApi');
const pingResultEl = $('pingResult');

const SOURCE_LABEL = { selection: '选中文字', page: '整页正文', none: '无页面内容' };

// ---------- 工具 ----------

function setStatus(text) {
  statusEl.textContent = text || '';
}
function setError(text) {
  errorEl.textContent = text || '';
}
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 极简 markdown 渲染（安全：先整体转义，再生成受控标签）
function renderMarkdown(text) {
  let html = escapeHtml(text || '');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToBackground(message) {
  const resp = await chrome.runtime.sendMessage(message);
  if (!resp || !resp.ok) {
    throw new Error(resp && resp.error ? resp.error : '请求失败');
  }
  return resp.data;
}

// ---------- 主流程 ----------

async function handleAsk() {
  const question = $('question').value.trim();
  const agentId = $('agent').value;
  setError('');
  answerEl.innerHTML = '解读中…';
  answerEl.classList.remove('empty');
  metaEl.textContent = '';
  copyBtn.disabled = true;

  if (!question) {
    setError('请先填写你的问题。');
    return;
  }

  askBtn.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('找不到当前标签页');

    // 1. 按需注入 content.js（不再 <all_urls> 常驻注入，仅这次点击后生效）
    let page = null;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (_e) {
      /* 受限页面（chrome://、商店页等）注入会失败，走无上下文分支 */
    }
    try {
      page = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE' });
    } catch (_e) {
      page = null;
    }
    if (!page) page = { title: tab.title || '', url: tab.url || '', context_text: '', source: 'none' };

    setStatus('正在请求 Moirca 后端…');

    // 2. 转发给 background → 后端
    const data = await sendToBackground({
      type: 'ASK_CONTEXT',
      page_title: page.title || '',
      page_url: page.url || '',
      context_text: page.context_text || '',
      question,
      agent_id: agentId,
    });

    answerEl.innerHTML = renderMarkdown(data.answer || '(空回答)');
    answerEl.classList.remove('empty');
    copyBtn.disabled = false;
    copyBtn.dataset.answer = data.answer || '';
    metaEl.textContent =
      `视角：${data.agent_name || data.agent_id} · 模型：${data.model_used === 'llm' ? '大模型' : '规则降级'}` +
      ` · 来源：${SOURCE_LABEL[page.source] || page.source || ''}` +
      (data.truncated ? ' · 正文已截断' : '');
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    setError(`请求失败：${msg}\n\n请确认：\n1. Moirca 后端已启动（cd moirca/backend && python run.py）\n2. 后端地址正确（弹窗底部「后端设置」可改）\n3. 后端 .env 已配置 LLM_API_KEY`);
    answerEl.innerHTML = '';
  } finally {
    askBtn.disabled = false;
    setStatus('');
  }
}

// ---------- 复制 ----------

async function handleCopy() {
  const text = copyBtn.dataset.answer || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = '复制'; }, 1200);
  } catch (_e) {
    setError('复制失败，请手动选择文本复制。');
  }
}

// ---------- 后端设置 ----------

async function loadApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: '' });
  apiInput.value = apiBase || '';
}

function originOf(url) {
  try { return new URL(url).origin; } catch (_e) { return ''; }
}

async function saveApiBase() {
  const base = (apiInput.value || '').trim().replace(/\/+$/, '');
  pingResultEl.className = '';
  pingResultEl.textContent = '';
  if (!base) {
    await chrome.storage.sync.remove('apiBase');
    pingResultEl.textContent = '已恢复默认地址 http://localhost:8000';
    pingResultEl.className = 'ok';
    return;
  }
  if (!/^https?:\/\/.+/.test(base)) {
    pingResultEl.textContent = '地址需以 http:// 或 https:// 开头';
    pingResultEl.className = 'bad';
    return;
  }
  // 自定义地址若不在已授权主机内，向用户申请一次性/持久授权（user gesture）
  const origin = originOf(base);
  try {
    const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
    if (!granted) {
      const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!ok) {
        pingResultEl.textContent = `未授予访问 ${origin} 的权限，保存失败`;
        pingResultEl.className = 'bad';
        return;
      }
    }
  } catch (_e) {
    // 某些环境权限接口不可用时不阻塞
  }
  await chrome.storage.sync.set({ apiBase: base });
  pingResultEl.textContent = `已保存 ${base}，正在测试连接…`;
  await testConnection();
}

async function testConnection() {
  pingResultEl.className = '';
  pingResultEl.textContent = '正在测试连接…';
  try {
    const data = await sendToBackground({ type: 'PING' });
    const llmText = data.llm_configured ? 'LLM 已配置' : 'LLM 未配置（将走规则降级）';
    pingResultEl.textContent = `连接成功 · ${llmText} · Agent ${(data.agents || []).length} 个`;
    pingResultEl.className = 'ok';
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    pingResultEl.textContent = `连接失败：${msg}`;
    pingResultEl.className = 'bad';
  }
}

// ---------- 事件绑定 ----------

askBtn.addEventListener('click', handleAsk);
copyBtn.addEventListener('click', handleCopy);
saveApiBtn.addEventListener('click', saveApiBase);
$('question').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk();
});

(async function init() {
  await loadApiBase();
  testConnection(); // 打开弹窗时静默探测后端，失败仅显示在设置区
})();
