import { CommandName } from '../types/index.js';
import { CDPController } from './cdp-controller.js';
import { SnapshotCommand } from './commands/snapshot.js';
import { ClickCommand } from './commands/click.js';
import { FillCommand } from './commands/fill.js';
import { NavigateCommand } from './commands/navigate.js';
import { ScreenshotCommand } from './commands/screenshot.js';

const cdp = new CDPController();

const commands: Record<CommandName, { execute: (params: any) => Promise<unknown> }> = {
  navigate: new NavigateCommand(cdp),
  click: new ClickCommand(cdp),
  fill: new FillCommand(cdp),
  snapshot: new SnapshotCommand(cdp),
  screenshot: new ScreenshotCommand(cdp),
  scroll: { execute: async () => ({ success: false, error: 'scroll not implemented yet' }) },
  evaluate: { execute: async () => ({ success: false, error: 'evaluate not implemented yet' }) },
  get_tabs: { execute: async () => ({ tabs: [] }) },
  switch_tab: { execute: async () => ({ success: false, error: 'switch_tab not implemented yet' }) },
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const WS_URL = 'ws://localhost:9222';

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WebBridge] Connected to daemon');
    chrome.storage.local.set({ wsStatus: 'connected' });
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'command') {
        const cmd = commands[msg.method];
        if (!cmd) {
          ws?.send(JSON.stringify({
            type: 'result',
            id: msg.id,
            error: `Unknown command: ${msg.method}`,
          }));
          return;
        }
        try {
          const result = await cmd.execute(msg.params || {});
          ws?.send(JSON.stringify({
            type: 'result',
            id: msg.id,
            result,
          }));
        } catch (e: any) {
          ws?.send(JSON.stringify({
            type: 'result',
            id: msg.id,
            error: e.message || String(e),
          }));
        }
      }
    } catch (e) {
      console.error('[WebBridge] Failed to handle message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WebBridge] Disconnected from daemon');
    chrome.storage.local.set({ wsStatus: 'disconnected' });
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error('[WebBridge] WebSocket error:', e);
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

// 启动连接
connect();

// 监听扩展安装/启动
chrome.runtime.onInstalled.addListener(() => {
  console.log('[WebBridge] Extension installed');
  connect();
});
