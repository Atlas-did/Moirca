// 扩展侧快照存储:tabId → 最近一次 snapshot 的 text/refs/snapshotId。
// 用途:
//   1) click/fill 的 ref 解析(ref → backendDOMNodeId);ref 不在当前快照 → REF_STALE
//   2) find_in_snapshot 的扩展侧兜底实现(契约主实现在 daemon snapshot-store,§a.5)
// snapshotId 规则:`snap_{tabId}_{seq}`,60s 过期(§a.5;daemon 为权威索引)。
import { BridgeError } from './bridge-error.js';
import type { RefEntry } from '@webbridge/shared-types';

const REF_TTL_MS = 60_000;

export interface SnapshotRecord {
  snapshotId: string;
  tabId: number;
  url: string;
  text: string;
  refs: RefEntry[];
  createdAt: number;
}

export class SnapshotStore {
  private byTab = new Map<number, SnapshotRecord>();
  private seq = 0;

  /** 记录一次快照,返回 snapshotId */
  put(tabId: number, url: string, text: string, refs: RefEntry[]): string {
    const snapshotId = `snap_${tabId}_${++this.seq}`;
    this.byTab.set(tabId, { snapshotId, tabId, url, text, refs, createdAt: Date.now() });
    return snapshotId;
  }

  get(tabId: number): SnapshotRecord | null {
    const rec = this.byTab.get(tabId);
    if (!rec) return null;
    if (Date.now() - rec.createdAt > REF_TTL_MS) {
      this.byTab.delete(tabId);
      return null;
    }
    return rec;
  }

  getBySnapshotId(snapshotId: string): SnapshotRecord | null {
    for (const rec of this.byTab.values()) {
      if (rec.snapshotId === snapshotId) return rec;
    }
    return null;
  }

  /** ref → backendDOMNodeId;查不到或过期 → REF_STALE(§g.1,不做自动重试) */
  resolveRef(tabId: number, ref: string): number {
    const rec = this.get(tabId);
    if (!rec) {
      throw new BridgeError('REF_STALE', `ref 已失效(标签 ${tabId} 无有效快照),请先重新 snapshot`, { tabId, ref });
    }
    const entry = rec.refs.find((r) => r.ref === ref);
    if (!entry || typeof entry.backendDOMNodeId !== 'number') {
      throw new BridgeError('REF_STALE', `ref ${ref} 不在标签 ${tabId} 的当前快照中,请重新 snapshot 后使用新 ref`, {
        tabId,
        ref,
        snapshotId: rec.snapshotId,
      });
    }
    return entry.backendDOMNodeId;
  }

  invalidate(tabId: number): void {
    this.byTab.delete(tabId);
  }

  evictExpired(): void {
    const now = Date.now();
    for (const [tabId, rec] of this.byTab) {
      if (now - rec.createdAt > REF_TTL_MS) this.byTab.delete(tabId);
    }
  }
}
