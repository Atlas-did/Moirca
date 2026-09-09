// 键位映射单测(press_key:回车/Tab/组合键 —— 老版 v1 痛点)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planKey } from '../src/background/keymap.js';

describe('planKey', () => {
  test('Enter:keyDown 带 text + keyUp 成对', () => {
    const { events } = planKey('Enter');
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'keyDown');
    assert.equal(events[0].text, '\r');
    assert.equal(events[0].windowsVirtualKeyCode, 13);
    assert.equal(events[1].type, 'keyUp');
    assert.equal(events[0].key, events[1].key);
  });

  test('Tab / Escape / ArrowDown 的 VK 码', () => {
    assert.equal(planKey('Tab').events[0].windowsVirtualKeyCode, 9);
    assert.equal(planKey('Escape').events[0].windowsVirtualKeyCode, 27);
    assert.equal(planKey('ArrowDown').events[0].windowsVirtualKeyCode, 40);
    assert.equal(planKey('PageUp').events[0].code, 'PageUp');
    assert.equal(planKey('Home').events[0].code, 'Home');
  });

  test('Control+A:modifiers=2,rawKeyDown(无 text)', () => {
    const { modifiers, events } = planKey('Control+A');
    assert.equal(modifiers, 2);
    assert.equal(events[0].type, 'rawKeyDown');
    assert.equal(events[0].key, 'A');
    assert.equal(events[0].text, undefined);
    assert.equal(events.length, 2);
  });

  test('Shift+Enter:modifiers=8 且 Enter 无 text(组合不产生字符)', () => {
    const { modifiers, events } = planKey('Shift+Enter');
    assert.equal(modifiers, 8);
    assert.equal(events[0].text, undefined);
  });

  test('单字符:a 与 1', () => {
    const a = planKey('a');
    assert.equal(a.events[0].text, 'a');
    assert.equal(a.events[0].windowsVirtualKeyCode, 65);
    const one = planKey('1');
    assert.equal(one.events[0].windowsVirtualKeyCode, 49);
  });

  test('非法输入抛 INVALID_PARAMS', () => {
    assert.throws(() => planKey(''), /INVALID_PARAMS/);
    assert.throws(() => planKey('Control+'), /INVALID_PARAMS/);
    assert.throws(() => planKey('NotARealKeyName'), /INVALID_PARAMS/);
  });

  test('多重组合 Control+Shift+Tab:modifiers=10', () => {
    const { modifiers, events } = planKey('Control+Shift+Tab');
    assert.equal(modifiers, 2 | 8);
    assert.equal(events[0].code, 'Tab');
    assert.equal(events.length, 2);
  });
});
