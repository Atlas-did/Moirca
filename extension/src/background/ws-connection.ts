// WS 连接管理(daemon ↔ extension,§a.1):
// - 主动连 ws://127.0.0.1:9223,连上先发 hello,收到 welcome 才进入服务状态
// - protocolVersion 不匹配 → 断开并停止重连(§a.1)
// - 指数退避重连 3s→30s(§g.2)
// - welcome 前收到的 command 结果一律丢弃(由 daemon 保证;扩展侧亦不响应)
// - 命令派发带超时兜底(30s,CMD_TIMEOUT),超时/挂起清理(任务书第 7 条)
import type { AnalysisReportMessage, CommandName, HelloMessage, WSCommandMessage, WSResultMessage, WelcomeMessage } from '@webbridge/shared-types';
import { PROTOCOL_VERSION, WS_URL_DEFAULT, makeError } from '@webbridge/shared-types';
import { getMode } from '../mode.js';

export const WS_URL = WS_URL_DEFAULT;
const BACKOFF_INITIAL_MS = 3_000;
const BACKOFF_MAX_MS = 30_000;
/** 命令级 WS 等待兜底(§a.5:默认 30,000ms) */
export const COMMAND_TIMEOUT_MS = 30_000;

export interface ConnectionEvents {
  onCommand: (msg: WSCommandMessage) => Promise<WSResultMessage>;
  onWelcome?: (welcome: WelcomeMessage) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'stopped') => void;
}

export type WsSocketLike = {
  send(data: string): void;
  close(): void;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type SocketFactory = (url: string) => WsSocketLike;

function defaultSocketFactory(url: string): WsSocketLike {
  return new WebSocket(url) as unknown as WsSocketLike;
}

export class WsConnection {
  private socket: WsSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = BACKOFF_INITIAL_MS;
  private status: 'connecting' | 'connected' | 'disconnected' | 'stopped' = 'disconnected';
  private welcomeReceived = false;
  private extVersion: string;

  constructor(
    private events: ConnectionEvents,
    private socketFactory: SocketFactory = defaultSocketFactory,
    extVersion = '2.0.0',
    /** 配对 token 提供者;浏览器环境默认读 chrome.storage.local.wsToken(popup 设置页粘贴),测试可注入桩 */
    private tokenProvider: () => Promise<string> = async () => {
      try {
        const s = await chrome.storage.local.get({ wsToken: '' });
        return typeof s.wsToken === 'string' ? s.wsToken : '';
      } catch {
        return '';
      }
    },
  ) {
    this.extVersion = extVersion;
  }

  getStatus(): typeof this.status {
    return this.status;
  }

  start(): void {
    if (this.status === 'stopped') return;
    this.connect();
  }

  stop(): void {
    this.status = 'stopped';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.events.onStatusChange?.(this.status);
  }

  private connect(): void {
    // connecting 也须挡:onInstalled 与顶层 start() 双触发会各开一条 socket,
    // daemon 端「新连接顶替旧连接」会造成握手 churn,sendReport 打在被顶替的 socket 上丢报(真机回归)
    if (this.status === 'stopped' || this.status === 'connected' || this.status === 'connecting') return;
    if (this.socket) return;
    this.setStatus('connecting');
    let socket: WsSocketLike;
    try {
      socket = this.socketFactory(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      // §a.1:连上必须先发 hello,未 welcome 前不响应命令。
      // token 由 tokenProvider 提供(默认读 chrome.storage.local.wsToken,popup 设置页粘贴后保存)。
      void this.tokenProvider()
        .then((token) => {
          const hello: HelloMessage = {
            type: 'hello',
            id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            mode: getMode(),
            extVersion: this.extVersion,
            protocolVersion: PROTOCOL_VERSION,
            ...(token ? { token } : {}),
          };
          socket.send(JSON.stringify(hello));
        })
        .catch(() => {
          // token 读取异常时仍发送无 token hello,由 daemon 给出明确拒绝原因
          const hello: HelloMessage = {
            type: 'hello',
            id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            mode: getMode(),
            extVersion: this.extVersion,
            protocolVersion: PROTOCOL_VERSION,
          };
          socket.send(JSON.stringify(hello));
        });
    };

    socket.onmessage = (ev) => {
      void this.handleMessage(ev.data, socket);
    };

    socket.onclose = () => {
      this.welcomeReceived = false;
      this.socket = null;
      if (this.status !== 'stopped') {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
  }

  private async handleMessage(data: unknown, socket: WsSocketLike): Promise<void> {
    let msg: { type?: string };
    try {
      msg = typeof data === 'string' ? JSON.parse(data) : {};
    } catch {
      // 非合法 JSON → PARSE_ERROR(§g.1),尽力回给 daemon
      this.safeSend(
        socket,
        JSON.stringify({
          type: 'result',
          id: '',
          ok: false,
          error: makeError('PARSE_ERROR', '消息不是合法 JSON'),
        } satisfies WSResultMessage),
      );
      return;
    }

    if (msg.type === 'welcome') {
      const welcome = msg as unknown as WelcomeMessage;
      if (welcome.protocolVersion !== PROTOCOL_VERSION) {
        // §a.1:版本不匹配 → 断开并停止重连
        this.stop();
        return;
      }
      this.welcomeReceived = true;
      this.backoffMs = BACKOFF_INITIAL_MS;
      this.setStatus('connected');
      this.events.onWelcome?.(welcome);
      return;
    }

    if (msg.type === 'command') {
      if (!this.welcomeReceived) {
        // §a.1:welcome 前 daemon 丢弃结果;扩展侧不响应以保持状态机一致
        return;
      }
      const cmd = msg as unknown as WSCommandMessage;
      const result = await this.dispatchWithTimeout(cmd);
      this.safeSend(socket, JSON.stringify(result));
      return;
    }

    if (msg.type === 'result') {
      // 扩展不主动向 daemon 发命令,回显结果直接忽略
      return;
    }
  }

  /** 命令超时兜底:默认 30s,CMD_TIMEOUT(§g.2 挂起清理) */
  private async dispatchWithTimeout(cmd: WSCommandMessage): Promise<WSResultMessage> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
      const result = await Promise.race([
        this.events.onCommand(cmd),
        new Promise<WSResultMessage>((resolve) => {
          controller.signal.addEventListener('abort', () =>
            resolve({
              type: 'result',
              id: cmd.id,
              ok: false,
              error: makeError('CMD_TIMEOUT', `命令 ${String(cmd.method)} 等待超时(>${COMMAND_TIMEOUT_MS}ms),已中止`, {
                method: String(cmd.method),
                timeoutMs: COMMAND_TIMEOUT_MS,
              }),
            }),
          );
        }),
      ]);
      return result;
    } finally {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      controller.abort();
    }
  }

  private safeSend(socket: WsSocketLike | null, data: string): void {
    try {
      if (socket && socket.readyState === 1) socket.send(data);
    } catch {
      /* 断线时静默,由 onclose 走重连 */
    }
  }

  /**
   * §a.6 analysis_report 上报(welcome 已收且 socket OPEN 时发送,fire-and-forget,daemon 不回执)。
   * 不动握手状态机;未连接/未 welcome 时静默返回 false,由调用方决定降级提示。
   */
  sendReport(msg: AnalysisReportMessage): boolean {
    if (!this.welcomeReceived || !this.socket || this.socket.readyState !== 1) return false;
    try {
      this.socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.status === 'stopped') return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
      this.connect();
    }, this.backoffMs);
  }

  private setStatus(s: typeof this.status): void {
    if (this.status === s) return;
    this.status = s;
    this.events.onStatusChange?.(s);
  }
}
