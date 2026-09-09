// navigate(§a.5,pro only):target 仅 newTab / tabId:N(activeTab 被拒)。
// 等待策略对齐 chrome-devtools-mcp / playwright-mcp 语义:load / domcontentloaded / none,
// 默认 15s,超时 NAV_TIMEOUT(不再静默吞超时——老版 v1 痛点)。
import { BridgeError } from '../../background/bridge-error.js';
import type { NavigateParams, NavigateResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { buildDelta } from '../delta.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export async function navigate(deps: CommandDeps, params: NavigateParams): Promise<NavigateResult & { delta?: unknown }> {
  if (!params || typeof params.url !== 'string' || !/^https?:\/\//i.test(params.url)) {
    throw new BridgeError('INVALID_PARAMS', 'navigate.url 必填且必须以 http(s):// 开头', { field: 'url', got: params?.url });
  }
  const waitUntil = params.waitUntil ?? 'load';
  const timeoutMs = Math.min(typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : DEFAULT_TIMEOUT_MS, 60_000);

  // target 策略已由 decideAccess 放行;这里解析为具体 tabId
  let tabId: number;
  let beforeUrl = '';
  if (params.target === 'newTab') {
    // 新建后台标签承载导航(agent 专属,原则 1)。
    // 必须落 about:blank:tabs.create 不带 url 会得到 chrome://newtab,
    // chrome.debugger 无法 attach 到 chrome:// 页,后续 CDP 等待全挂(真机回归)。
    tabId = await deps.resolver.resolveNewTab('about:blank', deps.commandId);
    beforeUrl = 'about:blank';
  } else {
    tabId = await deps.resolver.resolveManaged(Number(params.target.slice('tabId:'.length)));
    beforeUrl = (await deps.tabs.get(tabId)).url ?? '';
  }

  // pro:attach 后经 CDP 精确等待 load/domcontentloaded 事件
  let loadFired: Promise<'load' | 'domcontentloaded'> | null = null;
  if (deps.cdp && waitUntil !== 'none') {
    await deps.cdp.attach(tabId);
    await deps.cdp.sendCommand(tabId, 'Page.enable');
    loadFired = waitLoadEvent(deps, tabId, waitUntil, timeoutMs);
  }

  await deps.tabs.update(tabId, { url: params.url });

  if (waitUntil !== 'none') {
    const viaEvent = await raceWithTabComplete(deps, tabId, loadFired, timeoutMs);
    if (!viaEvent) {
      throw new BridgeError('NAV_TIMEOUT', `页面加载超时(>${timeoutMs}ms):${params.url}`, { tabId, url: params.url, waitUntil });
    }
  }

  const tab = await deps.tabs.get(tabId);
  const finalUrl = tab.url || params.url;
  deps.managed.touch(tabId);
  return {
    ok: true,
    tabId,
    url: params.url,
    finalUrl,
    delta: buildDelta({ url: beforeUrl, title: '' }, { url: finalUrl, title: tab.title ?? '' }, { navigations: 1 }),
  } as NavigateResult & { delta: unknown };
}

function waitLoadEvent(
  deps: CommandDeps,
  tabId: number,
  waitUntil: 'load' | 'domcontentloaded',
  timeoutMs: number,
): Promise<'load' | 'domcontentloaded'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: 'load' | 'domcontentloaded') => {
      if (settled) return;
      settled = true;
      chrome.debugger.onEvent.removeListener(listener);
      clearTimeout(timer);
      resolve(v);
    };
    const want = waitUntil === 'load' ? 'Page.loadEventFired' : 'Page.domContentEventFired';
    const listener = (source: { tabId?: number }, method: string) => {
      if (source.tabId === tabId && method === want) finish(waitUntil);
    };
    chrome.debugger.onEvent.addListener(listener);
    const timer = setTimeout(() => finish(waitUntil), timeoutMs);
  });
}

/** CDP 事件与 tabs.onUpdated(complete)双通道等待;超时返回 false */
async function raceWithTabComplete(
  deps: CommandDeps,
  tabId: number,
  loadFired: Promise<'load' | 'domcontentloaded'> | null,
  timeoutMs: number,
): Promise<boolean> {
  const tabComplete = new Promise<boolean>((resolve) => {
    const listener = (changedTabId: number, info: { status?: string }) => {
      if (changedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener as never);
        resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener as never);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener as never);
      resolve(false);
    }, timeoutMs);
  });

  if (loadFired) {
    const winner = await Promise.race([loadFired.then(() => true), tabComplete]);
    return winner;
  }
  return tabComplete;
}
