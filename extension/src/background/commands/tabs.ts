// get_tabs / new_tab / close_tab / switch_tab(§a.5)
// readonly:get_tabs 受限——仅返回当前激活标签;无 tabs 权限时 url/title 置空串(§a.4)。
import { BridgeError } from '../../background/bridge-error.js';
import type { CloseTabParams, CloseTabResult, GetTabsResult, NewTabParams, NewTabResult, SwitchTabParams, SwitchTabResult, TabInfo } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';

export async function getTabs(deps: CommandDeps): Promise<GetTabsResult> {
  let rows: Array<{ id?: number; url?: string; title?: string; active?: boolean }> = [];
  if (deps.mode === 'readonly') {
    // §a.4:readonly 仅返回当前激活标签一条
    rows = await deps.tabs.query({ active: true, currentWindow: true });
  } else {
    rows = await deps.tabs.query({});
  }
  const tabs: TabInfo[] = rows
    .filter((t) => typeof t.id === 'number')
    .map((t) => ({
      id: t.id as number,
      // readonly 无 "tabs" 权限时 url/title 为 undefined → 置空串(§a.4)
      title: t.title ?? '',
      url: t.url ?? '',
      active: !!t.active,
      managed: deps.managed.isManaged(t.id as number),
    }));
  return { ok: true, tabs };
}

export async function newTab(deps: CommandDeps, params: NewTabParams): Promise<NewTabResult> {
  const url = params?.url;
  if (url !== undefined && !/^https?:\/\//i.test(url)) {
    throw new BridgeError('INVALID_PARAMS', 'new_tab.url 必须以 http(s):// 开头', { field: 'url', got: url });
  }
  // new_tab 命令:每次都新建(区别于 target=newTab 的"复用 task 标签"语义,§a.3)。
  // 不带 url 时落 about:blank(chrome://newtab 无法被 chrome.debugger attach,后续 snapshot 必挂,真机回归)
  const tab = await deps.tabs.create({ url: url ?? 'about:blank', active: false });
  if (typeof tab.id !== 'number') {
    throw new BridgeError('PERMISSION_DENIED', '新建标签失败(chrome.tabs.create 未返回 tabId)');
  }
  deps.managed.register(tab.id, deps.commandId);
  return { ok: true, tabId: tab.id, url: tab.url ?? url ?? 'about:blank' };
}

export async function closeTab(deps: CommandDeps, params: CloseTabParams): Promise<CloseTabResult> {
  let tabId: number;
  if (params.target === 'newTab') {
    const current = deps.managed.currentTaskTabId();
    if (current === null) {
      throw new BridgeError('TARGET_DENIED', '当前没有可关闭的托管 task 标签', { target: params.target });
    }
    tabId = current;
  } else if (params.target.startsWith('tabId:')) {
    tabId = await deps.resolver.resolveManaged(Number(params.target.slice('tabId:'.length)));
  } else {
    throw new BridgeError('INVALID_PARAMS', `close_tab.target 非法:${String(params?.target)}`, { field: 'target' });
  }
  deps.snapshots.invalidate(tabId);
  deps.managed.unregister(tabId);
  if (deps.cdp) await deps.cdp.detach(tabId).catch(() => undefined);
  await deps.tabs.remove(tabId);
  return { ok: true, closed: true };
}

export async function switchTab(deps: CommandDeps, params: SwitchTabParams): Promise<SwitchTabResult> {
  if (!params.target?.startsWith('tabId:')) {
    throw new BridgeError('INVALID_PARAMS', `switch_tab.target 仅支持 tabId:N,got:${String(params?.target)}`, { field: 'target' });
  }
  const tabId = await deps.resolver.resolveManaged(Number(params.target.slice('tabId:'.length)));
  await deps.tabs.update(tabId, { active: true });
  return { ok: true, tabId };
}
