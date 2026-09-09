// find_in_snapshot 算法单测(§a.5:多条件 AND、limit 20/50、context ±1 行 ≤200 字符)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findInSnapshot, FIND_DEFAULT_LIMIT, FIND_HARD_LIMIT } from '../src/background/find.js';
import type { RefEntry } from '@webbridge/shared-types';

const REFS: RefEntry[] = [
  { ref: 'e1', role: 'link', name: '阳光高考', backendDOMNodeId: 1 },
  { ref: 'e2', role: 'button', name: '查询分数', backendDOMNodeId: 2 },
  { ref: 'e3', role: 'textbox', name: '高考分数', backendDOMNodeId: 3 },
  { ref: 'e4', role: 'link', name: '阳光计划说明', backendDOMNodeId: 4 },
];

const TEXT = [
  '- heading "高考服务平台"',
  '- link "阳光高考" [ref=e1]',
  '- button "查询分数" [ref=e2]',
  '- textbox "高考分数" [ref=e3]',
  '- link "阳光计划说明" [ref=e4]',
].join('\n');

describe('findInSnapshot', () => {
  test('text 命中(大小写不敏感)', () => {
    const out = findInSnapshot({ text: TEXT, refs: REFS, query: { text: '阳光' } });
    assert.equal(out.matches.length, 2);
    assert.deepEqual(out.matches.map((m) => m.ref), ['e1', 'e4']);
  });

  test('role 过滤', () => {
    const out = findInSnapshot({ text: TEXT, refs: REFS, query: { role: 'textbox' } });
    assert.equal(out.matches.length, 1);
    assert.equal(out.matches[0].ref, 'e3');
    assert.equal(out.matches[0].role, 'textbox');
  });

  test('regex 命中', () => {
    const out = findInSnapshot({ text: TEXT, refs: REFS, query: { regex: '查询.*分数' } });
    assert.equal(out.matches.length, 1);
    assert.equal(out.matches[0].name, '查询分数');
  });

  test('多条件 AND:text + role', () => {
    const out = findInSnapshot({ text: TEXT, refs: REFS, query: { text: '分数', role: 'button' } });
    assert.equal(out.matches.length, 1);
    assert.equal(out.matches[0].ref, 'e2');
  });

  test('context 为命中行 ±1 行,≤200 字符', () => {
    const out = findInSnapshot({ text: TEXT, refs: REFS, query: { ref_context: undefined, text: '查询分数' } as never });
    assert.equal(out.matches[0].context.split(' | ').length, 3);
    assert.ok(out.matches[0].context.length <= 200);
  });

  test('limit 截断与 truncated 标注', () => {
    const lines: string[] = [];
    const refs: RefEntry[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`- link "重复${i}" [ref=e${i + 1}]`);
      refs.push({ ref: `e${i + 1}`, role: 'link', name: `重复${i}` });
    }
    const out = findInSnapshot({ text: lines.join('\n'), refs, query: { text: '重复' }, limit: 5 });
    assert.equal(out.matches.length, 5);
    assert.equal(out.truncated, true);
  });

  test('limit 默认 20,硬上限 50', () => {
    assert.equal(FIND_DEFAULT_LIMIT, 20);
    assert.equal(FIND_HARD_LIMIT, 50);
  });

  test('空 query / 非法 regex 抛 INVALID_PARAMS', () => {
    assert.throws(() => findInSnapshot({ text: TEXT, refs: REFS, query: {} }), /INVALID_PARAMS/);
    assert.throws(() => findInSnapshot({ text: TEXT, refs: REFS, query: { regex: '[' } }), /INVALID_PARAMS/);
  });
});
