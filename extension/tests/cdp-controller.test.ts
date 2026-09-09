// CDPController mock 测试(任务书第 8 条:CDP 调用层 mock):
// 显式 tabId 路由、幂等 attach、TAB_CLOSED / PERMISSION_DENIED 结构化错误、onRemoved/onDetach 清理
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CDPController, type DebuggerAdapter, type TabsAdapter } from '../src/background/cdp-controller.js';

class MockDebugger implements DebuggerAdapter {
  calls: Array<{ op: string; tabId?: number; method?: string }> = [];
  failAttach = false;
  sendHandler: ((tabId: number, method: string) => unknown) | null = null;
  failSend = false;

  async attach(target: { tabId: number }): Promise<void> {
    this.calls.push({ op: 'attach', tabId: target.tabId });
    if (this.failAttach) throw new Error('Cannot attach to this target');
  }
  async detach(target: { tabId: number }): Promise<void> {
    this.calls.push({ op: 'detach', tabId: target.tabId });
  }
  async sendCommand(target: { tabId: number }, method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ op: 'send', tabId: target.tabId, method });
    if (this.failSend) throw new Error('No tab with given identity');
    return this.sendHandler ? this.sendHandler(target.tabId, method) : { ok: true, params };
  }
}

class MockTabs implements TabsAdapter {
  tabs = new Map<number, { id: number }>();
  removedCb: ((tabId: number) => void) | null = null;
  async get(tabId: number): Promise<{ id?: number }> {
    if (!this.tabs.has(tabId)) throw new Error('No tab with id: ' + tabId);
    return { id: tabId };
  }
  onRemoved(cb: (tabId: number) => void): void {
    this.removedCb = cb;
  }
  add(tabId: number): void {
    this.tabs.set(tabId, { id: tabId });
  }
}

describe('CDPController(mock)', () => {
  let dbg: MockDebugger;
  let tabs: MockTabs;

  beforeEach(() => {
    dbg = new MockDebugger();
    tabs = new MockTabs();
    tabs.add(1);
    tabs.add(2);
  });

  test('sendCommand 按 tabId 显式路由(不串台)', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.attach(1);
    await cdp.sendCommand(1, 'Page.enable');
    await cdp.attach(2);
    await cdp.sendCommand(2, 'Page.enable');
    const sends = dbg.calls.filter((c) => c.op === 'send');
    assert.deepEqual(sends.map((c) => c.tabId), [1, 2]);
    assert.equal(cdp.attachedTabIds().length, 2);
  });

  test('attach 幂等:已附加不重复 attach', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.attach(1);
    await cdp.attach(1);
    assert.equal(dbg.calls.filter((c) => c.op === 'attach').length, 1);
  });

  test('attach 前标签不存在 → TAB_CLOSED(-32007)', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await assert.rejects(() => cdp.attach(999), (e: { code: string; num: number }) => {
      assert.equal(e.code, 'TAB_CLOSED');
      assert.equal(e.num, -32007);
      return true;
    });
  });

  test('attach 被拒 → PERMISSION_DENIED(-32003)', async () => {
    dbg.failAttach = true;
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await assert.rejects(() => cdp.attach(1), (e: { code: string }) => {
      assert.equal(e.code, 'PERMISSION_DENIED');
      return true;
    });
  });

  test('sendCommand 未 attach 时自动重挂', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.sendCommand(1, 'Runtime.evaluate', { expression: '1' });
    assert.equal(cdp.isAttached(1), true);
  });

  test('tab 关闭清理:tabs.onRemoved 触发 detach 监听', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.attach(1);
    let detached: number | null = null;
    cdp.onDetach((tabId) => {
      detached = tabId;
    });
    tabs.removedCb!(1);
    assert.equal(cdp.isAttached(1), false);
    assert.equal(detached, 1);
  });

  test('send 失败(标签消失)→ TAB_CLOSED 且状态清理', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.attach(1);
    dbg.failSend = true;
    await assert.rejects(() => cdp.sendCommand(1, 'Runtime.evaluate'), (e: { code: string }) => {
      assert.equal(e.code, 'TAB_CLOSED');
      return true;
    });
    assert.equal(cdp.isAttached(1), false);
  });

  test('detachAll 清空全部 attach', async () => {
    const cdp = new CDPController({ debuggerApi: dbg, tabsApi: tabs });
    await cdp.attach(1);
    await cdp.attach(2);
    await cdp.detachAll();
    assert.equal(cdp.attachedTabIds().length, 0);
  });
});
