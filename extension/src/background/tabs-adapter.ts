// chrome.tabs 适配层(可注入,便于单测):query/create/get/update/remove。
export interface TabLike {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  status?: string;
  windowId?: number;
}

export interface TabsAdapterLike {
  query(info: Record<string, unknown>): Promise<TabLike[]>;
  create(info: { url?: string; active: boolean }): Promise<TabLike>;
  get(tabId: number): Promise<TabLike>;
  update(tabId: number, info: Record<string, unknown>): Promise<TabLike>;
  remove(tabId: number): Promise<void>;
  /** 转发 chrome.tabs.onRemoved(CDPController 依赖其清理 attach 状态,缺失会导致 worker 顶层崩溃) */
  onRemoved(cb: (tabId: number, removeInfo: unknown) => void): void;
}

export class ChromeTabsAdapter implements TabsAdapterLike {
  query(info: Record<string, unknown>): Promise<TabLike[]> {
    return chrome.tabs.query(info as never) as unknown as Promise<TabLike[]>;
  }
  create(info: { url?: string; active: boolean }): Promise<TabLike> {
    return chrome.tabs.create(info as never) as unknown as Promise<TabLike>;
  }
  get(tabId: number): Promise<TabLike> {
    return chrome.tabs.get(tabId) as unknown as Promise<TabLike>;
  }
  update(tabId: number, info: Record<string, unknown>): Promise<TabLike> {
    return chrome.tabs.update(tabId, info as never) as unknown as Promise<TabLike>;
  }
  remove(tabId: number): Promise<void> {
    return chrome.tabs.remove(tabId) as unknown as Promise<void>;
  }
  onRemoved(cb: (tabId: number, removeInfo: unknown) => void): void {
    chrome.tabs.onRemoved.addListener(cb as never);
  }
}

/** 命令执行上下文(依赖注入,service-worker 装配) */
export interface CommandContext {
  mode: 'pro' | 'readonly';
  tabs: TabsAdapterLike;
  commandId: string;
}
