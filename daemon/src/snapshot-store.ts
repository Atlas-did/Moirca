// ============================================================
// daemon/src/snapshot-store.ts —— snapshotId → 快照元数据 内存表
// 支撑 browser_find_in_snapshot(daemon 本地执行,不下发扩展,§a.5)。
// snapshotId 形如 snap_{tabId}_{seq},60s 过期(§a.5)。
// find 返回按 §h 截到 4,000 字符。
// ============================================================
import type { FindMatch, FindInSnapshotParams, RefEntry } from './types/index.js';
import { clampInt } from './util.js';

export interface SnapshotEntry {
  snapshotId: string;
  tabId: number;
  url: string;
  title: string;
  text: string;
  refs?: RefEntry[];
  createdAt: number;
}

export interface FindOutcome {
  matches: FindMatch[];
  truncated: boolean;
  expired: boolean;
}

const STORE_TTL_MS = 60_000;
const FIND_RESULT_MAX_CHARS = 4_000;
const CONTEXT_MAX_CHARS = 200;

export class SnapshotStore {
  private map = new Map<string, SnapshotEntry>();
  private seq = new Map<number, number>();

  /** 保存快照并分配 snapshotId */
  save(entry: Omit<SnapshotEntry, 'snapshotId' | 'createdAt'>): string {
    const n = (this.seq.get(entry.tabId) ?? 0) + 1;
    this.seq.set(entry.tabId, n);
    const snapshotId = `snap_${entry.tabId}_${n}`;
    this.map.set(snapshotId, { ...entry, snapshotId, createdAt: Date.now() });
    return snapshotId;
  }

  get(snapshotId: string): SnapshotEntry | undefined {
    const e = this.map.get(snapshotId);
    if (!e) return undefined;
    if (Date.now() - e.createdAt > STORE_TTL_MS) {
      this.map.delete(snapshotId);
      return undefined;
    }
    return e;
  }

  /** daemon 侧 find_in_snapshot:text/role/regex 多条件 AND */
  find(params: FindInSnapshotParams): FindOutcome {
    const entry = this.get(params.snapshotId);
    if (!entry) return { matches: [], truncated: false, expired: true };

    const limit = clampInt(params.limit, 20, 1, 50);
    const q = params.query ?? {};
    const regex = q.regex ? safeRegex(q.regex) : null;
    const lines = entry.text.split('\n');

    const matches: FindMatch[] = [];
    let truncated = false;
    let usedChars = 0;

    for (const ref of entry.refs ?? []) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      // 多条件 AND(§a.5)
      if (q.role && ref.role !== q.role) continue;
      if (q.text && !ref.name.includes(q.text)) continue;
      if (regex && !(regex.test(ref.name) || (ref.tag ? regex.test(ref.tag) : false))) continue;

      // context:命中行(ref 名所在文本行)±1 行,≤200 字符
      const hit = lines.findIndex((l) => l.includes(ref.name) && ref.name.length > 0);
      let context = hit >= 0 ? lines.slice(Math.max(0, hit - 1), hit + 2).join(' | ') : ref.name;
      if (context.length > CONTEXT_MAX_CHARS) context = context.slice(0, CONTEXT_MAX_CHARS);

      const budget = FIND_RESULT_MAX_CHARS - usedChars;
      if (context.length > budget) {
        if (budget > 40) {
          matches.push({ ref: ref.ref, role: ref.role, name: ref.name, context: context.slice(0, budget) });
        }
        truncated = true;
        break;
      }
      usedChars += context.length;
      matches.push({ ref: ref.ref, role: ref.role, name: ref.name, context });
    }
    return { matches, truncated, expired: false };
  }
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}
