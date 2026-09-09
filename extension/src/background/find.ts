// find_in_snapshot 检索算法(纯逻辑,可单测)。
// 契约 §a.5:find_in_snapshot 由 daemon 在 snapshot-store 本地执行,不下发扩展;
// 本模块提供与 daemon 对齐的同一算法实现与单测基线(extension 侧亦可用于
// 最近快照兜底),多条件为 AND,limit 默认 20 / 硬上限 50,context 为命中行 ±1 行 ≤200 字符。
import type { FindInSnapshotParams, FindMatch, RefEntry } from '@webbridge/shared-types';

export const FIND_DEFAULT_LIMIT = 20;
export const FIND_HARD_LIMIT = 50;
export const FIND_CONTEXT_MAX_CHARS = 200;

export interface FindInput {
  text: string; // snapshot.text(按行组织,行含 [ref=eN] 标记)
  refs: RefEntry[];
  query: FindInSnapshotParams['query'];
  limit?: number;
}

export interface FindOutput {
  matches: FindMatch[];
  truncated: boolean;
}

function parseLineRef(line: string): string | null {
  const m = line.match(/\[ref=(e\d+)\]/);
  return m ? m[1] : null;
}

function parseLineRole(line: string): string {
  const m = line.match(/^\s*-\s+([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function parseLineName(line: string): string {
  const m = line.match(/"([^"]*)"/);
  return m ? m[1] : '';
}

function buildContext(lines: string[], index: number): string {
  const slice = lines.slice(Math.max(0, index - 1), index + 2);
  const joined = slice.join(' | ');
  return joined.length > FIND_CONTEXT_MAX_CHARS ? joined.slice(0, FIND_CONTEXT_MAX_CHARS) : joined;
}

/** 在 snapshot 文本中检索;query 至少一项,多条件 AND */
export function findInSnapshot(input: FindInput): FindOutput {
  const { text, refs, query } = input;
  let limit = typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
    ? Math.floor(input.limit)
    : FIND_DEFAULT_LIMIT;
  limit = Math.min(limit, FIND_HARD_LIMIT);

  const conditions: Array<(line: string) => boolean> = [];
  if (query.text !== undefined && query.text !== '') {
    const needle = query.text.toLowerCase();
    conditions.push((line) => line.toLowerCase().includes(needle));
  }
  if (query.role !== undefined && query.role !== '') {
    const role = query.role.toLowerCase();
    conditions.push((line) => parseLineRole(line) === role);
  }
  if (query.regex !== undefined && query.regex !== '') {
    let re: RegExp;
    try {
      re = new RegExp(query.regex, 'i');
    } catch {
      throw new Error(`INVALID_PARAMS: 非法正则表达式:${query.regex}`);
    }
    conditions.push((line) => re.test(line));
  }
  if (conditions.length === 0) {
    throw new Error('INVALID_PARAMS: query 至少需要 text/role/regex 中的一项');
  }

  const refByName = new Map(refs.map((r) => [r.ref, r]));
  const lines = text.split('\n');
  const matches: FindMatch[] = [];
  for (let i = 0; i < lines.length && matches.length < limit; i++) {
    const line = lines[i];
    if (!conditions.every((c) => c(line))) continue;
    const ref = parseLineRef(line) ?? '';
    const entry = ref ? refByName.get(ref) : undefined;
    matches.push({
      ref,
      role: entry?.role ?? parseLineRole(line),
      name: entry?.name ?? parseLineName(line),
      context: buildContext(lines, i),
    });
  }
  return { matches, truncated: matches.length >= limit && lines.length > 0 && hasMore(lines, conditions, limit) };
}

/** 判断是否还有更多命中(limit 截断标注用) */
function hasMore(lines: string[], conditions: Array<(line: string) => boolean>, limit: number): boolean {
  let count = 0;
  for (const line of lines) {
    if (conditions.every((c) => c(line))) {
      count++;
      if (count > limit) return true;
    }
  }
  return false;
}
