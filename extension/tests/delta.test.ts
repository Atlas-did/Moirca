// delta 组装单测(任务书第 4 条:结构化验证信息,不返回"已点击"空话)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelta, describeDelta } from '../src/background/delta.js';

describe('buildDelta / describeDelta', () => {
  test('URL 与标题变化检出', () => {
    const d = buildDelta({ url: 'https://a.example', title: '旧页' }, { url: 'https://b.example', title: '旧页' });
    assert.equal(d.urlChanged, true);
    assert.equal(d.titleChanged, false);
    assert.match(describeDelta(d), /URL https:\/\/a\.example → https:\/\/b\.example/);
  });

  test('无变化时输出"页面无可见变化"', () => {
    const d = buildDelta({ url: 'u', title: 't' }, { url: 'u', title: 't' });
    assert.equal(describeDelta(d), '页面无可见变化');
  });

  test('导航/DOM 计数附加', () => {
    const d = buildDelta({ url: 'u', title: '' }, { url: 'u2', title: 't2' }, { navigations: 1, domMutations: 3 });
    const s = describeDelta(d);
    assert.match(s, /导航 ×1/);
    assert.match(s, /DOM 变更 ×3/);
    assert.match(s, /标题 \(空\) → t2/);
  });
});
