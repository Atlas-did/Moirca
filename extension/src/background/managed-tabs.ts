// 托管标签集合:daemon 会话内由扩展创建的 agent 专属标签(原则 1 / §a.3)。
// - newTab / new_tab / navigate(newTab) 创建的标签登记为 managed
// - tabId:N 仅允许定位托管标签
// - 标签被用户/浏览器关闭时自动出表并触发 CDP detach
// - 任务结束/超时可 detachAndClose(任务书第 3 条)

export interface ManagedTabRecord {
  tabId: number;
  createdAt: number;
  /** 最后活跃时间(用于超时回收) */
  lastUsedAt: number;
  /** 单调 touch 序号(同毫秒并列时保序) */
  seq?: number;
  /** 创建来源:WS 命令 id,便于审计 */
  createdByCommandId?: string;
}

export interface CleanupDeps {
  onTabRemoved?: (tabId: number) => void;
}

export class ManagedTabs {
  private tabs = new Map<number, ManagedTabRecord>();
  private deps: CleanupDeps;
  private touchSeq = 0; // 同毫秒内 touch 顺序也可能决定 currentTaskTabId,用单调序号避免并列

  constructor(deps: CleanupDeps = {}) {
    this.deps = deps;
  }

  register(tabId: number, createdByCommandId?: string): ManagedTabRecord {
    const rec: ManagedTabRecord = {
      tabId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      ...(createdByCommandId ? { createdByCommandId } : {}),
    };
    this.tabs.set(tabId, rec);
    return rec;
  }

  touch(tabId: number): void {
    const rec = this.tabs.get(tabId);
    if (rec) {
      rec.lastUsedAt = Date.now();
      rec.seq = ++this.touchSeq;
    }
  }

  isManaged(tabId: number): boolean {
    return this.tabs.has(tabId);
  }

  unregister(tabId: number): void {
    this.tabs.delete(tabId);
  }

  /** 当前托管 task 标签:最近使用的一个(§a.3 newTab 复用语义) */
  currentTaskTabId(): number | null {
    let best: ManagedTabRecord | null = null;
    for (const rec of this.tabs.values()) {
      if (!best || (rec.seq ?? 0) > (best.seq ?? 0)) best = rec;
    }
    return best ? best.tabId : null;
  }

  /** 空闲超过 idleMs 的托管标签(供超时回收,由 service-worker 定时调用) */
  idleIds(idleMs: number): number[] {
    const now = Date.now();
    const out: number[] = [];
    for (const rec of this.tabs.values()) {
      if (now - rec.lastUsedAt > idleMs) out.push(rec.tabId);
    }
    return out;
  }

  list(): ManagedTabRecord[] {
    return [...this.tabs.values()];
  }

  size(): number {
    return this.tabs.size;
  }
}
