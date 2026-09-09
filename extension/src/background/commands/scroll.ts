// scroll(§a.5,pro only):窗口级滚动,返回滚动后 scrollY。
import { BridgeError } from '../../background/bridge-error.js';
import type { ScrollParams, ScrollResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';

export async function scroll(deps: CommandDeps, params: ScrollParams): Promise<ScrollResult> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  if (!params.direction || !['up', 'down', 'top', 'bottom'].includes(params.direction)) {
    throw new BridgeError('INVALID_PARAMS', `scroll.direction 非法:${String(params?.direction)}`, { field: 'direction' });
  }
  const amountPx = typeof params.amountPx === 'number' && params.amountPx > 0 ? Math.floor(params.amountPx) : 500;

  const expr =
    params.direction === 'top'
      ? 'window.scrollTo({ top: 0, behavior: "instant" })'
      : params.direction === 'bottom'
        ? 'window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })'
        : `window.scrollBy({ top: ${params.direction === 'down' ? amountPx : -amountPx}, behavior: "instant" })`;

  const res = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: `${expr}; JSON.stringify({ scrollY: Math.round(window.scrollY) })`,
    returnByValue: true,
  })) as { result?: { value?: string } };
  let scrollY = 0;
  try {
    scrollY = (JSON.parse(res.result?.value ?? '{}') as { scrollY?: number }).scrollY ?? 0;
  } catch {
    scrollY = 0;
  }
  const urlRes = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  let url = '';
  try {
    url = (JSON.parse(urlRes.result?.value ?? '{}') as { url?: string }).url ?? '';
  } catch {
    url = '';
  }
  return { ok: true, tabId, url, scrollY };
}
