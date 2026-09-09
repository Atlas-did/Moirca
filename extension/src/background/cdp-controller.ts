// Chrome DevTools Protocol 控制器(重构)。
// 修复点(ARCHITECTURE §5.3):
//   - sendCommand 按显式 tabId 发送(旧实现隐式 currentTabId,多标签并发会串台)
//   - chrome.tabs.onRemoved / chrome.debugger.onDetach 清理(旧 TODO)
//   - attach 前校验标签仍存在(TAB_CLOSED)
// 可测性:debugger 适配器可注入(单测用 mock)。
import { BridgeError } from './bridge-error.js';

export interface DebuggerAdapter {
  attach(target: { tabId: number }, version: string): Promise<void>;
  detach(target: { tabId: number }): Promise<void>;
  sendCommand(target: { tabId: number }, method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface TabsAdapter {
  get(tabId: number): Promise<{ id?: number; url?: string; title?: string }>;
  onRemoved(cb: (...args: unknown[]) => void): void;
}

export class CDPController {
  private attached = new Set<number>();
  private debuggerApi: DebuggerAdapter | null;
  private tabsApi: TabsAdapter | null;
  private detachListeners: Array<(tabId: number, reason: string) => void> = [];

  constructor(deps?: { debuggerApi?: DebuggerAdapter; tabsApi?: TabsAdapter }) {
    this.debuggerApi = deps?.debuggerApi ?? (typeof chrome !== 'undefined' && chrome.debugger ? chrome.debugger : null);
    this.tabsApi = deps?.tabsApi ?? (typeof chrome !== 'undefined' && chrome.tabs ? (chrome.tabs as unknown as TabsAdapter) : null);
    if (this.tabsApi && typeof this.tabsApi.onRemoved === 'function') {
      this.tabsApi.onRemoved(((tabId: number) => this.handleTabRemoved(tabId, 'tab-removed')) as (...args: unknown[]) => void);
    }
    if (typeof chrome !== 'undefined' && chrome.debugger?.onDetach) {
      chrome.debugger.onDetach.addListener((info) => {
        if (typeof info.tabId === 'number') this.handleTabRemoved(info.tabId, 'debugger-detached');
      });
    }
  }

  private handleTabRemoved(tabId: number, reason: string): void {
    this.attached.delete(tabId);
    for (const cb of this.detachListeners) {
      try {
        cb(tabId, reason);
      } catch {
        /* 监听器异常不外抛 */
      }
    }
  }

  onDetach(cb: (tabId: number, reason: string) => void): void {
    this.detachListeners.push(cb);
  }

  isAttached(tabId: number): boolean {
    return this.attached.has(tabId);
  }

  async attach(tabId: number): Promise<void> {
    if (this.attached.has(tabId)) return;
    // 标签必须仍存在,否则 TAB_CLOSED
    if (this.tabsApi) {
      try {
        await this.tabsApi.get(tabId);
      } catch {
        this.attached.delete(tabId);
        throw new BridgeError('TAB_CLOSED', `目标标签 ${tabId} 已被关闭,无法 attach`, { tabId });
      }
    }
    try {
      await this.debuggerApi!.attach({ tabId }, '1.3');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Chrome 在已附加时重复 attach 会报 "Another debugger already attached" / "Already attached"
      if (/already attached|another debugger/i.test(msg)) {
        this.attached.add(tabId);
        return;
      }
      throw new BridgeError('PERMISSION_DENIED', `chrome.debugger attach 失败(可能被用户拒绝或页面受限):${msg}`, { tabId });
    }
    this.attached.add(tabId);
  }

  async detach(tabId: number): Promise<void> {
    if (!this.attached.has(tabId)) return;
    try {
      await this.debuggerApi!.detach({ tabId });
    } catch {
      // 已断开时忽略
    }
    this.attached.delete(tabId);
  }

  async sendCommand<T = unknown>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.attached.has(tabId)) {
      // 幂等重挂:调用方无需关心 attach 状态
      await this.attach(tabId);
    }
    try {
      return (await this.debuggerApi!.sendCommand({ tabId }, method, params)) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/No tab with given identity|tag not attached|Inspected target navigated or closed/i.test(msg)) {
        this.attached.delete(tabId);
        throw new BridgeError('TAB_CLOSED', `目标标签 ${tabId} 已关闭或已脱离调试:${msg}`, { tabId, method });
      }
      throw new BridgeError('PERMISSION_DENIED', `CDP 命令 ${method} 执行失败:${msg}`, { tabId, method });
    }
  }

  async detachAll(): Promise<void> {
    for (const tabId of [...this.attached]) {
      await this.detach(tabId);
    }
  }

  attachedTabIds(): number[] {
    return [...this.attached];
  }
}
