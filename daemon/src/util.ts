// ============================================================
// daemon/src/util.ts —— 小工具函数(ULID / 时间 / 截断)
// ============================================================
import { randomBytes } from 'crypto';

/** Crockford Base32(ULID 字母表,不含 I/L/O/U) */
const ULID_ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26 位时间有序 ULID(与 CONTRACT §c.1 的 ev_/task_ 前缀配套) */
export function ulid(now: number = Date.now()): string {
  let time = now;
  let ts = '';
  for (let i = 0; i < 10; i++) {
    ts = ULID_ENC[time % 32] + ts;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ULID_ENC[bytes[i]! % 32];
  }
  return ts + rand;
}

/** task_id:契约 §f——MCP 参数未提供时由 daemon 生成 */
export function newTaskId(): string {
  return `task_${ulid()}`;
}

/** ISO8601 含时区的当前时刻(证据 fetched_at/created_at 用,禁止伪造) */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 按字符口径截断(§h:截断一律按字符口径在产生数据的模块执行) */
export function clipToChars(text: string, maxChars: number): { text: string; truncated: boolean; totalChars: number } {
  const totalChars = text.length;
  if (totalChars <= maxChars) return { text, truncated: false, totalChars };
  return { text: text.slice(0, maxChars), truncated: true, totalChars };
}

/** 非负整数钳位 */
export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}
