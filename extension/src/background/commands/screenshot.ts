// screenshot(§a.5,双模式):
// - pro:CDP Page.captureScreenshot(png/jpeg + quality + fullPage),fileRef 由 daemon 落盘回填
// - readonly:仅 activeTab + chrome.tabs.captureVisibleTab + PNG(§a.4 受限放行)
// 语义红线(原则 3):截图只供人复核,禁止作为动作依据。
import { BridgeError } from '../../background/bridge-error.js';
import type { ScreenshotParams, ScreenshotResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { pngSizeFromBase64 } from '../png-size.js';

export async function screenshot(deps: CommandDeps, params: ScreenshotParams): Promise<ScreenshotResult> {
  const format = params.format ?? 'png';
  if (deps.mode === 'readonly') {
    if (format !== 'png') {
      throw new BridgeError('READONLY_REJECTED', 'readonly 模式 screenshot 仅支持 PNG(§a.4)', { format });
    }
    return screenshotReadonly(deps);
  }
  return screenshotPro(deps, params, format);
}

async function screenshotPro(deps: CommandDeps, params: ScreenshotParams, format: 'png' | 'jpeg'): Promise<ScreenshotResult> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  const cdpParams: Record<string, unknown> = { format };
  if (format === 'jpeg') {
    cdpParams.quality = typeof params.quality === 'number' ? Math.min(Math.max(Math.floor(params.quality), 0), 100) : 80;
  }
  if (params.fullPage) cdpParams.captureBeyondViewport = true;
  const res = (await cdp.sendCommand(tabId, 'Page.captureScreenshot', cdpParams)) as { data?: string };
  if (!res?.data) {
    throw new BridgeError('PERMISSION_DENIED', 'Page.captureScreenshot 未返回图像数据', { tabId });
  }
  const layout = (await cdp.sendCommand(tabId, 'Page.getLayoutMetrics')) as {
    cssViewport?: { clientWidth?: number; clientHeight?: number };
  };
  const dims = pngSizeFromBase64(res.data);
  deps.managed.touch(tabId);
  return {
    ok: true,
    tabId,
    url: (await deps.tabs.get(tabId)).url ?? '',
    image: res.data,
    width: dims.width || Math.round(layout.cssViewport?.clientWidth ?? 0),
    height: dims.height || Math.round(layout.cssViewport?.clientHeight ?? 0),
    fileRef: '', // daemon 落盘后回填(§f:screenshot 恒落盘)
  };
}

async function screenshotReadonly(deps: CommandDeps): Promise<ScreenshotResult> {
  // §a.4:仅 activeTab,且需 activeTab 已授权;captureVisibleTab 只截可视区
  const tabId = await deps.resolver.resolveActiveTab();
  let dataUrl: string;
  try {
    dataUrl = (await chrome.tabs.captureVisibleTab({ format: 'png' })) as unknown as string;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new BridgeError('PERMISSION_DENIED', `captureVisibleTab 失败(activeTab 可能未授权或页面受限):${msg}`, { tabId });
  }
  const base64 = dataUrl.startsWith('data:') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const dims = pngSizeFromBase64(base64);
  let url = '';
  try {
    url = (await deps.tabs.get(tabId)).url ?? '';
  } catch {
    url = '';
  }
  return { ok: true, tabId, url, image: base64, width: dims.width, height: dims.height, fileRef: '' };
}
