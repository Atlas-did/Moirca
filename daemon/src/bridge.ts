// ============================================================
// daemon/src/bridge.ts —— MCP 调用 ↔ WS 命令 翻译层(AGENT_04 核心)
// 职责:翻译/转发/落盘/认证旁路;不做浏览器控制决策(任务书约束)。
// - target 推导:默认 'newTab';readonly 会话对 snapshot/screenshot/
//   extract/wait 推导 'activeTab'(§a.4 矩阵)
// - 证据钩子默认开启:snapshot/extract/click 完成后自动落库(§c.3)
// - 文件旁路:snapshot 超限 / extract 超限 / screenshot 恒落盘(§f)
// - 预算:全部按字符口径在 daemon 截断(§h)
// ============================================================
import type { McpToolName } from './types/index.js';
import { MCP_BUDGET } from './types/index.js';
import { makeError, type WsError } from './types/index.js';
import { WsCommandError, type ExtensionBridge } from './extension-bridge.js';
import type { ArtifactsStore } from './artifacts.js';
import type { SnapshotStore } from './snapshot-store.js';
import { EvidenceClient, type EvidenceChannel, type EvidencePayload } from './evidence-client.js';
import { htmlToMarkdown, externalReader, ExtractFailedError } from './reader.js';
import { digest as makeDigest } from './digest.js';
import { clipToChars, newTaskId } from './util.js';

export type McpContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface McpToolOutcome {
  content: McpContentItem[];
  isError?: boolean;
}

export interface BridgeDeps {
  ext: ExtensionBridge;
  artifacts: ArtifactsStore;
  snapshots: SnapshotStore;
  evidence: EvidenceClient;
  commandTimeoutMs: number;
  /** 外部 reader API;未设置 → 本地 @mozilla/readability(默认) */
  readerApiUrl?: string;
  backendOrigin?: string;
}

const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;
const REF_RE = /^e\d+$/;

function errOutcome(e: WsError): McpToolOutcome {
  return { content: [{ type: 'text', text: JSON.stringify(e) }], isError: true };
}

function invalid(message: string, data?: Record<string, unknown>): McpToolOutcome {
  return errOutcome(makeError('INVALID_PARAMS', message, data));
}

/** readonly 会话中允许推导为 activeTab 的只读命令 */
const READONLY_ACTIVE_TAB_TOOLS = new Set<string>(['browser_snapshot', 'browser_screenshot', 'browser_extract', 'browser_wait']);

export class WebBridge {
  constructor(private deps: BridgeDeps) {}

  /** MCP 工具统一入口:翻译 → 转发 → 回写(含证据钩子与预算) */
  async call(name: McpToolName | 'browser_route', args: Record<string, unknown>): Promise<McpToolOutcome> {
    try {
      return await this.dispatch(name, args ?? {});
    } catch (e) {
      if (e instanceof WsCommandError) return errOutcome(e.wsError);
      if (e instanceof ExtractFailedError) {
        return errOutcome(makeError('EXTRACT_FAILED', e.message));
      }
      return errOutcome(makeError('INVALID_PARAMS', `daemon 内部错误:${(e as Error).message}`));
    }
  }

  // ------------------------------------------------------------------

  private task(args: Record<string, unknown>): string {
    const t = args.task_id;
    if (t === undefined || t === null || t === '') return newTaskId();
    if (typeof t !== 'string' || !TASK_ID_RE.test(t)) {
      throw new WsCommandError(makeError('INVALID_PARAMS', 'task_id 仅允许 [A-Za-z0-9_-]'));
    }
    return t;
  }

  /** target 推导(§b.2:MCP 客户端不得传 activeTab 给写类工具) */
  private target(name: string, args: Record<string, unknown>): string {
    const t = args.target;
    if (typeof t === 'string') {
      if (t === 'activeTab') {
        if (!READONLY_ACTIVE_TAB_TOOLS.has(name)) {
          throw new WsCommandError(makeError('TARGET_DENIED', `工具 ${name} 不允许 target=activeTab`));
        }
        return 'activeTab';
      }
      if (t === 'newTab' || /^tabId:\d+$/.test(t)) return t;
      throw new WsCommandError(makeError('INVALID_PARAMS', `非法 target:${t}`));
    }
    if (this.deps.ext.mode === 'readonly' && READONLY_ACTIVE_TAB_TOOLS.has(name)) return 'activeTab';
    return 'newTab';
  }

  private tabTarget(name: string, args: Record<string, unknown>): `tabId:${number}` {
    const tabId = args.tabId;
    if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0) {
      throw new WsCommandError(makeError('INVALID_PARAMS', `${name} 需要整数 tabId`));
    }
    return `tabId:${tabId}`;
  }

  private async send(method: Parameters<ExtensionBridge['sendCommand']>[0], params: Record<string, unknown>) {
    return this.deps.ext.sendCommand(method, params, this.deps.commandTimeoutMs);
  }

  private async evidence(p: EvidencePayload): Promise<string | null> {
    return this.deps.evidence.save(p);
  }

  private channelOf(args: Record<string, unknown>): EvidenceChannel {
    return args.channel === 'deep_research' ? 'deep_research' : 'controlled_browse';
  }

  // ------------------------------------------------------------------

  private async dispatch(name: string, args: Record<string, unknown>): Promise<McpToolOutcome> {
    switch (name) {
      case 'browser_navigate': {
        if (args.target === 'activeTab') {
          throw new WsCommandError(makeError('TARGET_DENIED', 'browser_navigate 不允许 target=activeTab'));
        }
        const url = args.url;
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
          return invalid('url 必填且必须以 http(s):// 开头');
        }
        const result = await this.send('navigate', {
          target: this.target(name, args),
          url,
          ...(typeof args.waitUntil === 'string' ? { waitUntil: args.waitUntil } : {}),
          ...(typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
        });
        return this.textOutcome(result);
      }
      case 'browser_new_tab': {
        const result = await this.send('new_tab', {
          target: this.target(name, args), // §a.3:扩展端 policy 强制 target 必填,漏发会被 INVALID_PARAMS 拒掉(真机回归)
          ...(typeof args.url === 'string' ? { url: args.url } : {}),
        });
        return this.textOutcome(result);
      }
      case 'browser_close_tab': {
        const result = await this.send('close_tab', { target: this.tabTarget(name, args) });
        return this.textOutcome(result);
      }
      case 'browser_switch_tab': {
        const result = await this.send('switch_tab', { target: this.tabTarget(name, args) });
        return this.textOutcome(result);
      }
      case 'browser_get_tabs': {
        const result = await this.send('get_tabs', {});
        return this.textOutcome(result);
      }
      case 'browser_snapshot':
        return this.snapshot(args);
      case 'browser_find_in_snapshot':
        return this.findInSnapshot(args);
      case 'browser_click':
        return this.click(args);
      case 'browser_fill':
        return this.fill(args);
      case 'browser_press_key': {
        if (typeof args.key !== 'string' || !args.key) return invalid('key 必填');
        const result = await this.send('press_key', {
          target: this.target(name, args),
          key: args.key,
          ...(typeof args.ref === 'string' ? { ref: args.ref } : {}),
        });
        return this.textOutcome(result);
      }
      case 'browser_scroll': {
        const d = args.direction;
        if (d !== 'up' && d !== 'down' && d !== 'top' && d !== 'bottom') {
          return invalid('direction 必须为 up|down|top|bottom');
        }
        const result = await this.send('scroll', {
          target: this.target(name, args),
          direction: d,
          ...(typeof args.amountPx === 'number' ? { amountPx: args.amountPx } : {}),
        });
        return this.textOutcome(result);
      }
      case 'browser_evaluate': {
        if (typeof args.expression !== 'string' || !args.expression) return invalid('expression 必填');
        const result = await this.send('evaluate', {
          target: this.target(name, args),
          expression: args.expression,
        });
        return this.textOutcome(result);
      }
      case 'browser_wait': {
        const until = args.until ?? 'time';
        if (until !== 'time' && until !== 'selector' && until !== 'networkidle') {
          return invalid('until 必须为 time|selector|networkidle');
        }
        if (until === 'selector' && typeof args.selector !== 'string') return invalid('selector 模式必须提供 selector');
        const result = await this.send('wait', {
          target: this.target(name, args),
          until,
          ...(typeof args.ms === 'number' ? { ms: args.ms } : {}),
          ...(typeof args.selector === 'string' ? { selector: args.selector } : {}),
          ...(typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
        });
        return this.textOutcome(result);
      }
      case 'browser_screenshot':
        return this.screenshot(args);
      case 'browser_extract':
        return this.extract(args);
      case 'browser_route':
        return this.route(args);
      default:
        return errOutcome(makeError('UNKNOWN_COMMAND', `未注册的 MCP 工具:${name}`));
    }
  }

  // ---------------- snapshot(核心,§a.5/§b.2) ----------------

  private async snapshot(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const taskId = this.task(args);
    const maxChars = Math.min(typeof args.maxChars === 'number' ? args.maxChars : MCP_BUDGET.SNAPSHOT_TEXT_MAX_CHARS, MCP_BUDGET.SNAPSHOT_TEXT_MAX_CHARS);
    const params: Record<string, unknown> = {
      target: this.target('browser_snapshot', args),
      level: args.level === 'full' ? 'full' : 'compact',
      maxChars,
      refs: args.refs === false ? false : true,
    };
    const raw = (await this.send('snapshot', params)) as {
      ok: true; tabId: number; url: string; title?: string; text?: string; totalChars?: number; truncated?: boolean; refs?: unknown[]; snapshotId?: string;
    };

    // daemon 侧字符预算兜底(§h:25,000)
    let text = typeof raw.text === 'string' ? raw.text : '';
    const clipped = clipToChars(text, maxChars);
    text = clipped.text;
    const truncated = Boolean(raw.truncated) || clipped.truncated;

    let fileRef: string | undefined;
    let raw_ref: string | undefined;
    if (truncated) {
      const art = await this.deps.artifacts.write(taskId, 'snapshot', 'txt', text);
      fileRef = art.fileRef;
      raw_ref = art.relRef;
    }

    // snapshotId 由 daemon 侧索引生成(60s 过期);extension 不感知
    const snapshotId = this.deps.snapshots.save({
      tabId: raw.tabId,
      url: raw.url,
      title: raw.title ?? '',
      text,
      refs: (raw.refs as never) ?? undefined,
    });

    // 证据钩子(原则 4,默认开启)
    const evidenceId = await this.evidence({
      task_id: taskId,
      channel: this.channelOf(args),
      url: raw.url,
      title: raw.title ?? '',
      quote: text.slice(0, 2000),
      locator: { type: 'ref', value: snapshotId },
      ...(raw_ref ? { raw_ref } : {}),
    });

    const result = {
      ok: true as const,
      tabId: raw.tabId,
      url: raw.url,
      title: raw.title ?? '',
      snapshotId,
      text,
      totalChars: clipped.totalChars,
      truncated,
      ...(fileRef ? { fileRef } : {}),
      ...(raw.refs ? { refs: raw.refs } : {}),
      digest: makeDigest(text),
      ...(evidenceId ? { evidenceId } : {}),
    };
    return this.textOutcome(result);
  }

  private findInSnapshot(args: Record<string, unknown>): McpToolOutcome {
    const snapshotId = typeof args.snapshotId === 'string' ? args.snapshotId : '';
    const query = (args.query ?? {}) as { text?: string; role?: string; regex?: string };
    if (!snapshotId) return invalid('snapshotId 必填');
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      return invalid('query 至少含 text/role/regex 一项');
    }
    const outcome = this.deps.snapshots.find({
      snapshotId,
      query,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    });
    if (outcome.expired) {
      return errOutcome(makeError('REF_STALE', `snapshotId ${snapshotId} 不存在或已过期(60s),请重新 browser_snapshot`));
    }
    const result = {
      ok: true as const,
      matches: outcome.matches,
      truncated: outcome.truncated,
    };
    let text = JSON.stringify(result);
    // §h:find_in_snapshot 返回 ≤4,000 字符
    if (text.length > MCP_BUDGET.FIND_RESULT_MAX_CHARS) {
      const fewer = { ...result, matches: outcome.matches.slice(0, Math.max(1, outcome.matches.length - 1)), truncated: true };
      text = JSON.stringify(fewer);
      if (text.length > MCP_BUDGET.FIND_RESULT_MAX_CHARS) {
        text = text.slice(0, MCP_BUDGET.FIND_RESULT_MAX_CHARS);
      }
    }
    return { content: [{ type: 'text', text }] };
  }

  // ---------------- click / fill ----------------

  private async click(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const taskId = this.task(args);
    const ref = typeof args.ref === 'string' ? args.ref : undefined;
    const selector = typeof args.selector === 'string' ? args.selector : undefined;
    if (!ref && !selector) return invalid('ref 与 selector 二选一');
    if (ref && !REF_RE.test(ref)) return invalid('ref 必须形如 e12(来自 snapshot),失效请重新 snapshot(REF_STALE 时勿重试)');
    const params: Record<string, unknown> = { target: this.target('browser_click', args) };
    if (ref) params.ref = ref;
    if (selector) params.selector = selector;
    if (typeof args.expectNavigation === 'boolean') params.expectNavigation = args.expectNavigation;

    const raw = (await this.send('click', params)) as {
      ok: true; tabId: number; url: string; clicked?: { role?: string; text?: string };
    };
    // 证据钩子:click 验证完成后落库
    await this.evidence({
      task_id: taskId,
      channel: this.channelOf(args),
      url: raw.url,
      quote: raw.clicked?.text ?? raw.url,
      locator: ref ? { type: 'ref', value: ref } : { type: 'css', value: selector ?? '' },
    });
    return this.textOutcome(raw);
  }

  private async fill(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const ref = typeof args.ref === 'string' ? args.ref : undefined;
    const selector = typeof args.selector === 'string' ? args.selector : undefined;
    if (!ref && !selector) return invalid('ref 与 selector 二选一');
    if (typeof args.value !== 'string') return invalid('value 必填');
    if (args.value.length > 10_000) return invalid('value 超过 10,000 字符上限');
    const params: Record<string, unknown> = {
      target: this.target('browser_fill', args),
      value: args.value,
    };
    if (ref) params.ref = ref;
    if (selector) params.selector = selector;
    if (typeof args.secret === 'boolean') params.secret = args.secret;
    if (typeof args.pressEnter === 'boolean') params.pressEnter = args.pressEnter;
    const result = await this.send('fill', params);
    return this.textOutcome(result);
  }

  // ---------------- screenshot(只给人复核,禁止据截图执行动作) ----------------

  private async screenshot(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const taskId = this.task(args);
    const format = args.format === 'jpeg' ? 'jpeg' : 'png';
    const params: Record<string, unknown> = {
      target: this.target('browser_screenshot', args),
      format,
      ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
      ...(typeof args.fullPage === 'boolean' ? { fullPage: args.fullPage } : {}),
    };
    const raw = (await this.send('screenshot', params)) as {
      ok: true; tabId: number; url: string; image: string; width: number; height: number;
    };
    if (!raw || typeof raw.image !== 'string') {
      return errOutcome(makeError('INVALID_PARAMS', '扩展未返回截图数据'));
    }
    // §f:screenshot 恒落盘(但只写文件不写库,§c.3)
    const buf = Buffer.from(raw.image, 'base64');
    const art = await this.deps.artifacts.write(taskId, 'screenshot', format, buf);
    const meta = {
      ok: true as const,
      tabId: raw.tabId,
      url: raw.url,
      width: raw.width,
      height: raw.height,
      format,
      fileRef: art.fileRef,
      note: '截图只供人复核,禁止作为执行动作的依据(原则 3;动作请基于 browser_snapshot 的 refs)',
    };
    return {
      content: [
        { type: 'image', data: raw.image, mimeType: `image/${format}` },
        { type: 'text', text: JSON.stringify(meta) },
      ],
    };
  }

  // ---------------- extract(内容采集主通道 + 自动落库) ----------------

  private async extract(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const taskId = this.task(args);
    const format = args.format === 'schema' ? 'schema' : 'markdown';
    if (format === 'schema' && !args.schema) return invalid("format='schema' 时必须提供 schema(JSON Schema)");
    const maxChars = Math.min(
      typeof args.maxChars === 'number' ? args.maxChars : MCP_BUDGET.EXTRACT_CONTENT_MAX_CHARS,
      MCP_BUDGET.EXTRACT_CONTENT_MAX_CHARS,
    );
    const params: Record<string, unknown> = {
      target: this.target('browser_extract', args),
      format,
      maxChars,
      ...(args.schema ? { schema: args.schema } : {}),
      ...(typeof args.selector === 'string' ? { selector: args.selector } : {}),
    };
    let raw = (await this.send('extract', params)) as {
      ok: true; tabId: number; url: string; title?: string;
      content?: string; data?: unknown; html?: string; totalChars?: number; truncated?: boolean;
    };

    // 默认本地 @mozilla/readability:扩展只给 outerHTML 时 daemon 内转换
    let via: string = 'extension';
    if (format === 'markdown' && !raw.content && raw.html) {
      const out = this.deps.readerApiUrl
        ? await externalReader(raw.html, raw.url, this.deps.readerApiUrl)
        : htmlToMarkdown(raw.html, raw.url);
      raw = { ...raw, title: raw.title || out.title, content: out.markdown };
      via = out.via;
    }
    if (format === 'markdown' && typeof raw.content !== 'string') {
      throw new ExtractFailedError('抽取失败:扩展未返回 content/html(EXTRACT_FAILED)');
    }

    const content = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.data ?? null);
    const clipped = clipToChars(content, maxChars);
    const truncated = Boolean(raw.truncated) || clipped.truncated;

    let fileRef: string | undefined;
    let raw_ref: string | undefined;
    if (truncated || clipped.totalChars > 25_000) {
      const art = await this.deps.artifacts.write(taskId, 'extract', format === 'schema' ? 'json' : 'md', clipped.text);
      fileRef = art.fileRef;
      raw_ref = art.relRef;
    }

    // §c.3:browser_extract 成功 → daemon 自动 POST /api/evidence/save
    const evidenceId = await this.evidence({
      task_id: taskId,
      channel: this.channelOf(args),
      url: raw.url,
      title: raw.title ?? '',
      quote: clipped.text.slice(0, 2000),
      locator: typeof args.selector === 'string' ? { type: 'css', value: args.selector } : { type: 'css', value: 'body' },
      ...(raw_ref ? { raw_ref } : {}),
    });

    const result = {
      ok: true as const,
      tabId: raw.tabId,
      url: raw.url,
      title: raw.title ?? '',
      content: clipped.text,
      ...(format === 'schema' ? { data: raw.data } : {}),
      totalChars: clipped.totalChars,
      truncated,
      ...(fileRef ? { fileRef } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      extractionVia: via,
    };
    return this.textOutcome(result);
  }

  // ---------------- browser_route(默认关闭,§b.1/§d.3) ----------------

  private async route(args: Record<string, unknown>): Promise<McpToolOutcome> {
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text) return invalid('text 必填');
    if (text.length > 500) return invalid('text 超过 500 字符');
    const origin = this.deps.backendOrigin ?? 'http://127.0.0.1:8000';
    try {
      const res = await fetch(`${origin}/api/route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...(args.context ? { context: args.context } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json();
      return this.textOutcome(json);
    } catch (e) {
      return errOutcome(makeError('BACKEND_UNREACHABLE', `backend 不可达:${(e as Error).message}`));
    }
  }

  // ---------------- 响应包装(§b.2 + §h 预算) ----------------

  private async textOutcome(result: unknown): Promise<McpToolOutcome> {
    let text = JSON.stringify(result);
    // MCP 单工具响应(文本合计)≤30,000 字符;超出落旁路并截断(§h)
    if (text.length > MCP_BUDGET.MCP_RESPONSE_MAX_CHARS) {
      const taskId = newTaskId();
      try {
        await this.deps.artifacts.write(taskId, 'page', 'json', text);
        console.error(`[bridge] 响应超过 ${MCP_BUDGET.MCP_RESPONSE_MAX_CHARS} 字符,已旁路到 artifacts/${taskId}/`);
        const obj = result as Record<string, unknown>;
        const patched = { ...obj, truncated: true, task_id: taskId, note: '响应超限,完整内容见 artifacts(§f)' };
        text = JSON.stringify(patched);
      } catch (e) {
        console.error(`[bridge] 旁路落盘失败:${(e as Error).message}`);
      }
      if (text.length > MCP_BUDGET.MCP_RESPONSE_MAX_CHARS) {
        text = text.slice(0, MCP_BUDGET.MCP_RESPONSE_MAX_CHARS);
      }
    }
    return { content: [{ type: 'text', text }] };
  }
}
