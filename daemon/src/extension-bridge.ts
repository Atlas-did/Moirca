// ============================================================
// daemon/src/extension-bridge.ts —— WebSocket Server(:9223)
// 由 ws-client.ts 重写改名:名为 Client 实为 Server,职责理顺。
// - 仅绑 127.0.0.1(不做云服务开放端口)
// - 一次性 token 认证:hello 消息必须携带 token,否则拒绝
// - hello 握手(CONTRACT §a.1):protocolVersion 校验,welcome 回执
// - pending/超时/断连清理机制保留(§a.2/§g.2)
// - readonly/pro 双保险校验(§a.3/§a.4)
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  ACTIVE_TAB_READONLY_COMMANDS,
  TARGET_EXEMPT_COMMANDS,
  COMMAND_AVAILABILITY,
  type CommandName,
  type ExtensionMode,
  type WsError,
  type AnalysisReportMessage,
  makeError,
} from './types/index.js';
import type { ArtifactsStore, WrittenArtifact } from './artifacts.js';
import type { EvidenceClient, EvidencePayload } from './evidence-client.js';
import { nowIso, ulid } from './util.js';

/** analysis_report(§a.6)归档依赖:artifacts 落盘 + evidence 推送(均可注入 mock) */
export interface AnalysisReportDeps {
  artifacts: Pick<ArtifactsStore, 'writeAnalysisReport'>;
  evidence: Pick<EvidenceClient, 'save'>;
}

export interface ExtensionBridgeOptions {
  port: number;
  host?: '127.0.0.1';
  commandTimeoutMs: number;
  /** artifactRoot 随 welcome 下发(§a.1) */
  artifactRoot: string;
  /** 预共享 token(测试注入);缺省由 generateToken() 生成 */
  token?: string;
  /** 截图分析归档(§a.6);缺省时收到 analysis_report 仅记日志忽略 */
  analysis?: AnalysisReportDeps;
}

export class WsCommandError extends Error {
  constructor(public wsError: WsError) {
    super(wsError.message);
    this.name = 'WsCommandError';
  }
  get code(): string {
    return this.wsError.code;
  }
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (e: WsCommandError) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

/** 一次性 token:64 hex 字符 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function tokensMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ---------------- 截图分析上报(§a.6) ----------------

/** summary 硬上限(契约 §a.6:≤500 字) */
const ANALYSIS_SUMMARY_MAX_CHARS = 500;

/**
 * 校验并规范化 analysis_report。非法返回 null(丢弃该消息,不断连)。
 * 校验:kind='screenshot'、pageUrl 必 http(s)、metrics 数值型、summary ≤500(超限截断)、
 * id 必须是文件名安全字符(否则改用 daemon 生成 ulid)。
 */
export function normalizeAnalysisReport(msg: Record<string, unknown>): AnalysisReportMessage | null {
  if (msg.kind !== 'screenshot') return null;
  const pageUrl = typeof msg.pageUrl === 'string' ? msg.pageUrl : '';
  if (!/^https?:\/\//.test(pageUrl)) return null;
  const raw = msg.metrics as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const numFields = ['width', 'height', 'aspectRatio', 'brightness', 'colorfulness'] as const;
  const metrics = {} as Record<(typeof numFields)[number], number>;
  for (const f of numFields) {
    const v = raw[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    metrics[f] = v;
  }
  if (!Array.isArray(raw.dominantColors)) return null;
  let summary = typeof msg.summary === 'string' ? msg.summary : '';
  if (summary.length > ANALYSIS_SUMMARY_MAX_CHARS) summary = summary.slice(0, ANALYSIS_SUMMARY_MAX_CHARS);
  const id = typeof msg.id === 'string' && /^[A-Za-z0-9_-]+$/.test(msg.id) ? msg.id : ulid();
  const capturedAt = typeof msg.capturedAt === 'string' ? msg.capturedAt : '';
  return {
    type: 'analysis_report',
    id,
    kind: 'screenshot',
    capturedAt,
    pageUrl,
    pageTitle: typeof msg.pageTitle === 'string' ? msg.pageTitle : '',
    metrics: {
      width: metrics.width,
      height: metrics.height,
      aspectRatio: metrics.aspectRatio,
      brightness: metrics.brightness,
      colorfulness: metrics.colorfulness,
      dominantColors: raw.dominantColors as AnalysisReportMessage['metrics']['dominantColors'],
    },
    summary,
  };
}

export class ExtensionBridge {
  readonly token: string;
  mode: ExtensionMode | null = null;
  extVersion: string | null = null;
  connected = false;

  private wss: WebSocketServer | null = null;
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();

  constructor(private opts: ExtensionBridgeOptions) {
    this.token = opts.token ?? generateToken();
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.opts.host ?? '127.0.0.1', port: this.opts.port }, resolve);
      wss.on('error', reject);
      this.wss = wss;
    });
    this.wss!.on('connection', (ws) => this.onConnection(ws));
    console.error(`[extension-bridge] listening on ws://${this.opts.host ?? '127.0.0.1'}:${this.opts.port}(仅回环)`);
  }

  /** 实际绑定端口(port=0 时由 OS 分配,测试用) */
  get boundPort(): number | null {
    const addr = this.wss?.address();
    return typeof addr === 'object' && addr ? addr.port : null;
  }

  async stop(): Promise<void> {
    this.rejectAllPending(makeError('EXT_NOT_CONNECTED', 'daemon 正在关闭,扩展已断开'));
    this.ws?.close();
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    this.wss = null;
    this.connected = false;
  }

  private onConnection(ws: WebSocket): void {
    // 单扩展模型:新连接直接顶替旧连接(旧连接上的 pending 一并清理)
    if (this.ws && this.ws !== ws) {
      try {
        this.ws.close(4000, 'replaced by new extension connection');
      } catch {
        /* ignore */
      }
    }
    this.ws = ws;
    this.connected = false; // hello 之前不算已认证
    console.error('[extension-bridge] 扩展 TCP 已连入,等待 hello 握手');

    ws.on('message', (data) => this.onMessage(ws, data.toString()));
    ws.on('close', () => {
      if (this.ws === ws) {
        this.ws = null;
        this.connected = false;
        this.mode = null;
        console.error('[extension-bridge] 扩展已断开,in-flight 命令全部以 EXT_NOT_CONNECTED 拒绝');
        this.rejectAllPending(makeError('EXT_NOT_CONNECTED', '扩展未连接/已断开'));
      }
    });
    ws.on('error', (e) => console.error('[extension-bridge] 连接错误:', e.message));
  }

  private onMessage(ws: WebSocket, raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      // PARSE_ERROR(§g.1):非合法 JSON,丢弃该消息
      console.error('[extension-bridge] 收到非 JSON 消息,已丢弃(PARSE_ERROR)');
      return;
    }

    if (msg.type === 'hello') {
      this.onHello(ws, msg);
      return;
    }

    // 收到 welcome 前丢弃该连接上的任何 command 结果(§a.1)
    if (!this.connected) {
      console.error('[extension-bridge] 握手未完成,丢弃消息');
      return;
    }

    if (msg.type === 'result') {
      const id = typeof msg.id === 'string' ? msg.id : '';
      const pending = this.pending.get(id);
      if (!pending) return; // 超时后迟到的结果:丢弃
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (msg.ok === true) {
        pending.resolve(msg.result);
      } else {
        const err = msg.error as WsError | undefined;
        pending.reject(
          new WsCommandError(
            err && err.code
              ? err
              : makeError('INVALID_REQUEST', '扩展返回的 result 缺少 error 结构'),
          ),
        );
      }
      return;
    }

    // 截图分析上报(§a.6):fire-and-forget,落 artifacts + 推 evidence,不回执
    if (msg.type === 'analysis_report') {
      this.onAnalysisReport(msg);
      return;
    }
  }

  // ---------------- 截图分析上报(§a.6) ----------------

  private onAnalysisReport(msg: Record<string, unknown>): void {
    const deps = this.opts.analysis;
    const report = normalizeAnalysisReport(msg);
    if (!report) {
      console.error('[extension-bridge] analysis_report 字段非法,已丢弃(INVALID_PARAMS,连接保持)');
      return;
    }
    if (!deps) {
      console.error('[extension-bridge] 收到 analysis_report 但未装配归档依赖,已忽略');
      return;
    }
    // 异步处理,不阻塞 WS 消息循环
    void this.archiveAnalysisReport(report).catch((e) => {
      console.error(`[extension-bridge] 截图分析归档失败:${(e as Error).message}`);
    });
  }

  /** artifacts 落盘 JSON(含 receivedAt)→ EvidenceClient 推送(旁路,失败仅记日志) */
  private async archiveAnalysisReport(report: AnalysisReportMessage): Promise<void> {
    const deps = this.opts.analysis!;
    const record = { ...report, receivedAt: nowIso() };
    let written: WrittenArtifact | null = null;
    try {
      written = await deps.artifacts.writeAnalysisReport(report.id, JSON.stringify(record, null, 2));
    } catch (e) {
      console.error(`[extension-bridge] 截图分析报告落盘失败:${(e as Error).message}`);
    }
    // fetched_at 仅在 capturedAt 可解析为时间时透传,否则交给 evidence-client 补真实 now
    const fetchedAt = report.capturedAt && !Number.isNaN(Date.parse(report.capturedAt)) ? report.capturedAt : undefined;
    const payload: EvidencePayload = {
      // 分析上报不属于任何 MCP task:以 analysis_ 前缀分组,便于后端检索
      task_id: `analysis_${report.id}`,
      channel: 'page_qa',
      url: report.pageUrl,
      title: report.pageTitle,
      ...(fetchedAt ? { fetched_at: fetchedAt } : {}),
      quote: report.summary,
      ...(written ? { raw_ref: written.relRef } : {}),
    };
    let evidenceId: string | null = null;
    try {
      evidenceId = await deps.evidence.save(payload);
    } catch (e) {
      // evidence-client.save 本就旁路不抛;此处兜底防注入 mock 异常
      console.error(`[extension-bridge] 截图分析证据推送失败:${(e as Error).message}`);
    }
    console.error(
      `[extension-bridge] 截图分析已归档:${written ? written.fileName : '(落盘失败)'}(evidence:${evidenceId ?? '旁路'})`,
    );
  }

  private onHello(ws: WebSocket, msg: Record<string, unknown>): void {
    const reject = (reason: string) => {
      console.error(`[extension-bridge] hello 拒绝:${reason}`);
      try {
        ws.close(4001, reason);
      } catch {
        /* ignore */
      }
    };
    if (typeof msg.token !== 'string' || !tokensMatch(this.token, msg.token)) {
      reject('token 校验失败(伪造扩展或 popup 未粘贴 token)');
      return;
    }
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      reject(`protocolVersion 不匹配:期望 ${PROTOCOL_VERSION},收到 ${String(msg.protocolVersion)};请升级扩展/daemon`);
      return;
    }
    const mode = msg.mode === 'pro' || msg.mode === 'readonly' ? msg.mode : null;
    if (!mode) {
      reject('hello.mode 必须为 pro|readonly');
      return;
    }
    this.mode = mode;
    this.extVersion = typeof msg.extVersion === 'string' ? msg.extVersion : 'unknown';
    this.connected = true;
    const welcome = { type: 'welcome', protocolVersion: PROTOCOL_VERSION, artifactRoot: this.opts.artifactRoot };
    ws.send(JSON.stringify(welcome));
    console.error(`[extension-bridge] 握手成功:mode=${mode} extVersion=${this.extVersion}`);
  }

  // ---------------- daemon 侧双保险(§a.3/§a.4) ----------------

  /** readonly 矩阵 + target 语义校验;通过则下发,否则抛 WsCommandError */
  private guard(method: CommandName, params: Record<string, unknown>): void {
    if (this.mode === 'readonly') {
      const av = COMMAND_AVAILABILITY[method];
      if (av.readonly === 'deny') {
        throw new WsCommandError(makeError('READONLY_REJECTED', `readonly 模式拒绝命令 ${method}(双保险)`));
      }
      if (method === 'wait' && params.until !== undefined && params.until !== 'time') {
        throw new WsCommandError(makeError('READONLY_REJECTED', 'readonly 模式 wait 仅支持 until=time'));
      }
      if (method === 'screenshot') {
        if (params.target !== 'activeTab' || (params.format !== undefined && params.format !== 'png')) {
          throw new WsCommandError(
            makeError('READONLY_REJECTED', 'readonly 模式 screenshot 仅支持 activeTab + PNG(captureVisibleTab)'),
          );
        }
      }
    }
    const target = params.target;
    if (target === 'activeTab' && !ACTIVE_TAB_READONLY_COMMANDS.includes(method) && !TARGET_EXEMPT_COMMANDS.includes(method)) {
      throw new WsCommandError(makeError('TARGET_DENIED', `命令 ${method} 不允许 target=activeTab(只允许只读命令)`));
    }
  }

  /** 下发命令并等待扩展 result(超时/断连/pending 清理) */
  async sendCommand(
    method: CommandName,
    params: Record<string, unknown>,
    timeoutMs: number = this.opts.commandTimeoutMs,
  ): Promise<unknown> {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // §g.2:扩展未连 → EXT_NOT_CONNECTED,不重试
      throw new WsCommandError(
        makeError('EXT_NOT_CONNECTED', '扩展未连接:请打开 Chrome 并在 popup 设置页粘贴 daemon token 完成握手'),
      );
    }
    this.guard(method, params);

    const id = randomUUID();
    const message = JSON.stringify({ type: 'command', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new WsCommandError(makeError('CMD_TIMEOUT', `命令 ${method} 等待超时(${timeoutMs}ms),已清除 pending`)));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws!.send(message);
    });
  }

  isProConnected(): boolean {
    return this.connected && this.mode === 'pro';
  }

  private rejectAllPending(err: WsError): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new WsCommandError(err));
    }
    this.pending.clear();
  }
}
