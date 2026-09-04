// WebSocket Client - 连接 Chrome Extension
// 等待 Extension 的 WebSocket 连接，转发 MCP tool calls

import WebSocket, { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketClient {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    // 解析端口，默认 9222
    const port = parseInt(new URL(this.url).port || '9222', 10);

    this.wss = new WebSocketServer({ port });

    console.error(`[WS Client] Listening on ws://localhost:${port}`);

    this.wss.on('connection', (ws) => {
      console.error('[WS Client] Chrome Extension connected');
      this.client = ws;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'result') {
            const pending = this.pending.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(msg.error));
              } else {
                pending.resolve(msg.result);
              }
            }
          }
        } catch (e) {
          console.error('[WS Client] Failed to parse message:', e);
        }
      });

      ws.on('close', () => {
        console.error('[WS Client] Chrome Extension disconnected');
        this.client = null;
        // reject 所有 pending 请求
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Extension disconnected'));
          this.pending.delete(id);
        }
      });

      ws.on('error', (e) => {
        console.error('[WS Client] WebSocket error:', e);
      });

      // 如果有 connectPromise，resolve 它
      if (this.resolveConnect) {
        this.resolveConnect();
        this.resolveConnect = null;
      }
    });
  }

  async sendCommand(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<any> {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) {
      throw new Error('Chrome Extension not connected. Make sure the extension is loaded and the daemon is running.');
    }

    const id = randomUUID();
    const message = JSON.stringify({ type: 'command', id, method, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.client!.send(message);
    });
  }

  isReady(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }
}
