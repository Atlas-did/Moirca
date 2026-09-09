// wait(§a.5,双模式):time / selector / networkidle(语义对齐 playwright-mcp 等待策略)。
// readonly 仅支持 until='time'(§a.4);selector 超时 15s → CMD_TIMEOUT;ms 上限 10,000。
import { BridgeError } from '../../background/bridge-error.js';
import type { WaitParams, WaitResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';

const TIME_MAX_MS = 10_000;
const SELECTOR_TIMEOUT_MS = 15_000;
const WAIT_HARD_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
const NETWORK_IDLE_WINDOW_MS = 500;

export async function wait(deps: CommandDeps, params: WaitParams): Promise<WaitResult> {
  const target = params.target ?? 'activeTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  const until = params.until ?? 'time';

  if (deps.mode === 'readonly' && until !== 'time') {
    throw new BridgeError('READONLY_REJECTED', 'readonly 模式 wait 仅支持 until="time"(§a.4)', { until });
  }

  const started = Date.now();
  if (until === 'time') {
    const ms = clampMs(params.ms, TIME_MAX_MS, 1_000);
    await sleep(ms);
    return finish(deps, tabId, started);
  }

  const cdp = deps.cdp;
  if (!cdp) {
    throw new BridgeError('PERMISSION_DENIED', 'wait: pro 语义(until=selector/networkidle)需要 CDP,readonly 构建不可用', { until });
  }

  if (until === 'selector') {
    if (!params.selector || typeof params.selector !== 'string') {
      throw new BridgeError('INVALID_PARAMS', 'wait: until=selector 时 selector 必填', { field: 'selector' });
    }
    const timeoutMs = clampMs(params.timeoutMs, WAIT_HARD_TIMEOUT_MS, SELECTOR_TIMEOUT_MS);
    const deadline = Date.now() + timeoutMs;
    // 循环体:200ms 轮询 document.querySelector(对齐 playwright wait-for-selector 语义)
    for (;;) {
      const found = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
        expression: `!!document.querySelector(${JSON.stringify(params.selector)})`,
        returnByValue: true,
      })) as { result?: { value?: boolean } };
      if (found.result?.value) break;
      if (Date.now() >= deadline) {
        throw new BridgeError('CMD_TIMEOUT', `wait: 等待选择器超时(>${timeoutMs}ms):${params.selector}`, {
          selector: params.selector,
          timeoutMs,
        });
      }
      await sleep(POLL_INTERVAL_MS);
    }
    return finish(deps, tabId, started);
  }

  // until === 'networkidle':500ms 窗口无在途请求(对齐 playwright networkidle)
  const timeoutMs = clampMs(params.timeoutMs, WAIT_HARD_TIMEOUT_MS, SELECTOR_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  await cdp.sendCommand(tabId, 'Network.enable');
  let inflight = 0;
  let lastActivity = Date.now();
  const tracker = (source: { tabId?: number }, method: string) => {
    if (source.tabId !== tabId) return;
    if (method === 'Network.requestWillBeSent') {
      inflight++;
      lastActivity = Date.now();
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      inflight = Math.max(0, inflight - 1);
      lastActivity = Date.now();
    }
  };
  chrome.debugger.onEvent.addListener(tracker);
  try {
    for (;;) {
      if (inflight === 0 && Date.now() - lastActivity >= NETWORK_IDLE_WINDOW_MS) break;
      if (Date.now() >= deadline) {
        throw new BridgeError('CMD_TIMEOUT', `wait: 等待网络空闲超时(>${timeoutMs}ms,在途请求 ${inflight})`, {
          until: 'networkidle',
          timeoutMs,
          inflight,
        });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    chrome.debugger.onEvent.removeListener(tracker);
  }
  return finish(deps, tabId, started);
}

function finish(deps: CommandDeps, tabId: number, started: number): Promise<WaitResult> {
  const ok = true as const;
  return deps.tabs
    .get(tabId)
    .then((t) => ({ ok, tabId, url: t.url ?? '', waitedMs: Date.now() - started }))
    .catch(() => ({ ok, tabId, url: '', waitedMs: Date.now() - started }));
}

function clampMs(v: number | undefined, max: number, def: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
