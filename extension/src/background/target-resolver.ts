// target 解析(执行层):把 §a.3 的 Target 解析为具体 tabId。
// 策略校验(readonly 矩阵/activeTab 只读/托管校验)在 policy.decideAccess(纯函数,单测);
// 本模块只做需要 IO 的解析:newTab → 复用/新建托管标签,activeTab → 当前聚焦标签。
import { BridgeError } from './bridge-error.js';
import type { Target } from '@webbridge/shared-types';
import type { ManagedTabs } from './managed-tabs.js';

export interface TabsQueryLike {
  query(info: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>;
  create(info: { url?: string; active: boolean }): Promise<{ id?: number; url?: string }>;
  get(tabId: number): Promise<{ id?: number; url?: string; title?: string }>;
}

export class TargetResolver {
  constructor(
    private tabs: TabsQueryLike,
    private managed: ManagedTabs,
  ) {}

  /** activeTab → 用户当前聚焦标签(只读命令专用) */
  async resolveActiveTab(): Promise<number> {
    const [tab] = await this.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') {
      throw new BridgeError('INVALID_PARAMS', '找不到当前聚焦的标签页(activeTab 解析失败)');
    }
    return tab.id;
  }

  /**
   * newTab → 复用当前 task 托管标签(仍存活),否则新建后台专用标签并登记。
   * 原则 1:绝不复用/触碰用户当前活动标签。
   */
  async resolveNewTab(url?: string, commandId?: string): Promise<number> {
    const existing = this.managed.currentTaskTabId();
    if (existing !== null && (await this.tabAlive(existing))) {
      this.managed.touch(existing);
      if (url) await this.tabs.get(existing); // 存活确认
      return existing;
    }
    const tab = await this.tabs.create({ url, active: false });
    if (typeof tab.id !== 'number') {
      throw new BridgeError('PERMISSION_DENIED', '新建标签失败(chrome.tabs.create 未返回 tabId)');
    }
    this.managed.register(tab.id, commandId);
    return tab.id;
  }

  /** tabId:N → 托管标签存活确认 */
  async resolveManaged(tabId: number): Promise<number> {
    if (!this.managed.isManaged(tabId)) {
      throw new BridgeError('TARGET_DENIED', `tabId:${tabId} 不是托管标签`, { tabId });
    }
    if (!(await this.tabAlive(tabId))) {
      this.managed.unregister(tabId);
      throw new BridgeError('TAB_CLOSED', `托管标签 ${tabId} 已被关闭`, { tabId });
    }
    this.managed.touch(tabId);
    return tabId;
  }

  /** 统一入口:decision 已放行后,解析出 tabId */
  async resolve(target: Target, opts?: { url?: string; commandId?: string }): Promise<number> {
    if (target === 'activeTab') return this.resolveActiveTab();
    if (target === 'newTab') return this.resolveNewTab(opts?.url, opts?.commandId);
    if (target.startsWith('tabId:')) return this.resolveManaged(Number(target.slice('tabId:'.length)));
    throw new BridgeError('INVALID_PARAMS', `target 取值非法:${String(target)}`);
  }

  private async tabAlive(tabId: number): Promise<boolean> {
    try {
      await this.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  }
}
