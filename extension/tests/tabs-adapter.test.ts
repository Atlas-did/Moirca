// ChromeTabsAdapter.onRemoved 转发测试(真机回归:缺 onRemoved 导致 CDPController
// 构造期 TypeError → service worker 注册失败 → 永远连不上 daemon)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ChromeTabsAdapter } from '../src/background/tabs-adapter.js';

type Listener = (...args: unknown[]) => void;

function withMockChrome<T>(fn: (listeners: Listener[]) => T): T {
  const listeners: Listener[] = [];
  const g = globalThis as { chrome?: unknown };
  const prev = g.chrome;
  g.chrome = {
    tabs: {
      onRemoved: { addListener: (cb: Listener) => listeners.push(cb) },
    },
  };
  try {
    return fn(listeners);
  } finally {
    g.chrome = prev;
  }
}

describe('ChromeTabsAdapter.onRemoved', () => {
  test('onRemoved 转发给 chrome.tabs.onRemoved.addListener', () => {
    withMockChrome((listeners) => {
      const adapter = new ChromeTabsAdapter();
      const got: number[] = [];
      adapter.onRemoved((tabId) => got.push(tabId));
      assert.equal(listeners.length, 1);
      listeners[0]!(42, { windowId: 1, isWindowClosing: false });
      assert.deepEqual(got, [42]);
    });
  });
});
