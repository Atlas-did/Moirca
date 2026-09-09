// click(§a.5,pro only):ref 优先,执行后返回结构化验证信息(delta),不返回"已点击"空话。
import { BridgeError } from '../../background/bridge-error.js';
import type { ClickParams, ClickResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { resolveElement } from '../element-locator.js';
import { buildDelta, describeDelta } from '../delta.js';

const NAVIGATION_WAIT_MS = 10_000;

export async function click(deps: CommandDeps, params: ClickParams): Promise<ClickResult & { delta?: unknown }> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  if (!params.ref && !params.selector) {
    throw new BridgeError('INVALID_PARAMS', 'click: ref 与 selector 必须提供其一', { tabId });
  }

  const before = await getPageState(cdp, tabId);
  const el = await resolveElement(cdp, deps.snapshots, tabId, { ref: params.ref, selector: params.selector });

  const clickScript = `function() {
    this.scrollIntoView({ block: 'center', behavior: 'instant' });
    const tag = this.tagName ? this.tagName.toLowerCase() : '';
    const text = (this.innerText || this.textContent || '').trim().slice(0, 120);
    const role = this.getAttribute && (this.getAttribute('role') || this.getAttribute('aria-label')) || tag;
    this.click();
    return { tag, text, role };
  }`;
  const res = (await cdp.sendCommand(tabId, 'Runtime.callFunctionOn', {
    objectId: el.objectId,
    functionDeclaration: clickScript,
    returnByValue: true,
    awaitPromise: false,
  })) as { result?: { value?: { tag?: string; text?: string; role?: string } }; exceptionDetails?: { text: string } };
  if (res.exceptionDetails) {
    throw new BridgeError('INVALID_PARAMS', `click 执行失败:${res.exceptionDetails.text}`, { tabId, via: el.via });
  }
  const clicked = {
    role: res.result?.value?.role,
    text: res.result?.value?.text,
  };

  // 验证:expectNavigation 时等 load(默认 10s);否则等 300ms 稳定后取页面状态
  if (params.expectNavigation) {
    await waitStable(deps, tabId, NAVIGATION_WAIT_MS);
  } else {
    await new Promise((r) => setTimeout(r, 300));
  }
  const after = await getPageState(cdp, tabId);
  const delta = buildDelta(before, after, { navigations: params.expectNavigation ? 1 : undefined });
  deps.snapshots.invalidate(tabId); // 点击后快照状态可能过期,强制重新 snapshot

  return { ok: true, tabId, url: after.url, clicked, delta, deltaSummary: describeDelta(delta) } as ClickResult & {
    delta: unknown;
    deltaSummary: string;
  };
}

async function getPageState(cdp: NonNullable<CommandDeps['cdp']>, tabId: number): Promise<{ url: string; title: string }> {
  const res = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href, title: document.title })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  try {
    const parsed = JSON.parse(res.result?.value ?? '{}') as { url?: string; title?: string };
    return { url: parsed.url ?? '', title: parsed.title ?? '' };
  } catch {
    return { url: '', title: '' };
  }
}

async function waitStable(deps: CommandDeps, tabId: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
}
