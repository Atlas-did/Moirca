// Chrome DevTools Protocol 控制器
// 管理 debugger attach/detach 和命令发送

export class CDPController {
  private attachedTabs = new Set<number>();
  private currentTabId: number | null = null;

  async attach(tabId: number): Promise<void> {
    if (this.attachedTabs.has(tabId)) {
      this.currentTabId = tabId;
      return;
    }
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // ignore if not attached
    }
    await chrome.debugger.attach({ tabId }, '1.3');
    this.attachedTabs.add(tabId);
    this.currentTabId = tabId;
  }

  async sendCommand(command: string, params?: Record<string, unknown>): Promise<any> {
    if (this.currentTabId === null) {
      throw new Error('No tab attached. Call attach(tabId) first.');
    }
    return await chrome.debugger.sendCommand(
      { tabId: this.currentTabId },
      command,
      params
    );
  }

  getCurrentTabId(): number | null {
    return this.currentTabId;
  }

  async getAttachedTab(): Promise<chrome.tabs.Tab | null> {
    if (this.currentTabId !== null) {
      try {
        return await chrome.tabs.get(this.currentTabId);
      } catch {
        this.attachedTabs.delete(this.currentTabId);
        this.currentTabId = null;
      }
    }
    return null;
  }

  detachAll(): void {
    for (const tabId of this.attachedTabs) {
      chrome.debugger.detach({ tabId }).catch(() => {});
    }
    this.attachedTabs.clear();
    this.currentTabId = null;
  }
}

// 清理失效的 tab
chrome.tabs.onRemoved.addListener((tabId) => {
  // 实际需要引用 CDPController 实例，这里简化处理
});

chrome.debugger.onDetach.addListener((info) => {
  if (info.tabId) {
    // 同上，简化处理
  }
});
