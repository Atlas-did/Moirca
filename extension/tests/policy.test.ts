// 准入策略单测:readonly/pro 矩阵 + target 决策(契约 §a.3/§a.4/§g.1)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decideAccess, isCommandAllowedInMode, requiresTarget, clampMaxChars, SNAPSHOT_MAX_CHARS_HARD_LIMIT } from '../src/background/policy.js';

const managed = new Set([11, 12]);
const isManaged = (id: number) => managed.has(id);

describe('readonly/pro 命令矩阵(§a.4)', () => {
  const readonlyDenied = ['navigate', 'new_tab', 'close_tab', 'switch_tab', 'find_in_snapshot', 'click', 'fill', 'press_key', 'scroll', 'evaluate'];
  for (const cmd of readonlyDenied) {
    test(`readonly 拒绝 ${cmd} → READONLY_REJECTED`, () => {
      const d = decideAccess({
        command: cmd as never,
        mode: 'readonly',
        target: 'newTab',
        isManagedTab: isManaged,
      });
      assert.equal(d.verdict, 'deny');
      if (d.verdict === 'deny') {
        assert.equal(d.error.code, 'READONLY_REJECTED');
        assert.equal(d.error.num, -32004);
        assert.match(d.error.message, /readonly/);
      }
    });
  }

  const readonlyAllowed = ['snapshot', 'extract', 'wait', 'get_tabs', 'screenshot'];
  for (const cmd of readonlyAllowed) {
    test(`readonly 允许 ${cmd}`, () => {
      const d = decideAccess({
        command: cmd as never,
        mode: 'readonly',
        target: 'activeTab',
        isManagedTab: isManaged,
      });
      assert.equal(d.verdict, 'allow', JSON.stringify(d));
    });
  }

  test('readonly wait 仅支持 time(restricted 语义由执行层校验)', () => {
    assert.ok(isCommandAllowedInMode('wait', 'readonly'));
    assert.ok(!isCommandAllowedInMode('evaluate', 'readonly'));
    assert.ok(isCommandAllowedInMode('evaluate', 'pro'));
  });
});

describe('activeTab 只读放行(原则 1)', () => {
  const writeCommands = ['navigate', 'click', 'fill', 'press_key', 'scroll', 'evaluate', 'new_tab', 'close_tab', 'switch_tab'];
  for (const cmd of writeCommands) {
    test(`pro 下 ${cmd}+activeTab → TARGET_DENIED`, () => {
      const d = decideAccess({ command: cmd as never, mode: 'pro', target: 'activeTab', isManagedTab: isManaged });
      assert.equal(d.verdict, 'deny');
      if (d.verdict === 'deny') {
        assert.equal(d.error.code, 'TARGET_DENIED');
        assert.equal(d.error.num, -32005);
      }
    });
  }

  for (const cmd of ['snapshot', 'screenshot', 'extract', 'wait'] as const) {
    test(`pro 下 ${cmd}+activeTab 放行`, () => {
      const d = decideAccess({ command: cmd, mode: 'pro', target: 'activeTab', isManagedTab: isManaged });
      assert.equal(d.verdict, 'allow');
    });
  }
});

describe('tabId:N 托管校验(§a.3)', () => {
  test('托管标签放行', () => {
    const d = decideAccess({ command: 'click', mode: 'pro', target: 'tabId:11', isManagedTab: isManaged });
    assert.equal(d.verdict, 'allow');
  });
  test('未托管标签 → TARGET_DENIED', () => {
    const d = decideAccess({ command: 'navigate', mode: 'pro', target: 'tabId:99', isManagedTab: isManaged });
    assert.equal(d.verdict, 'deny');
    if (d.verdict === 'deny') assert.equal(d.error.code, 'TARGET_DENIED');
  });
  test('非法 tabId → INVALID_PARAMS', () => {
    const d = decideAccess({ command: 'navigate', mode: 'pro', target: 'tabId:abc' as never, isManagedTab: isManaged });
    assert.equal(d.verdict, 'deny');
    if (d.verdict === 'deny') assert.equal(d.error.code, 'INVALID_PARAMS');
  });
});

describe('target 必填与免检(§a.3)', () => {
  test('get_tabs / find_in_snapshot 免 target', () => {
    assert.ok(!requiresTarget('get_tabs'));
    assert.ok(!requiresTarget('find_in_snapshot'));
    assert.ok(requiresTarget('snapshot'));
    const d = decideAccess({ command: 'get_tabs', mode: 'pro', target: undefined, isManagedTab: isManaged });
    assert.equal(d.verdict, 'allow');
  });
  test('缺 target → INVALID_PARAMS', () => {
    const d = decideAccess({ command: 'click', mode: 'pro', target: undefined, isManagedTab: isManaged });
    assert.equal(d.verdict, 'deny');
    if (d.verdict === 'deny') assert.equal(d.error.code, 'INVALID_PARAMS');
  });
  test('newTab 写命令默认值放行', () => {
    const d = decideAccess({ command: 'navigate', mode: 'pro', target: 'newTab', isManagedTab: isManaged });
    assert.equal(d.verdict, 'allow');
  });
});

describe('maxChars 钳制(§h 字符口径)', () => {
  test('超过硬上限 25000 被钳制', () => {
    assert.equal(clampMaxChars(99_999, SNAPSHOT_MAX_CHARS_HARD_LIMIT, 25_000), 25_000);
  });
  test('默认 25000,非法值回退默认', () => {
    assert.equal(clampMaxChars(undefined, 25_000, 25_000), 25_000);
    assert.equal(clampMaxChars(-5, 25_000, 25_000), 25_000);
    assert.equal(clampMaxChars(5_000, 60_000, 60_000), 5_000);
  });
});
