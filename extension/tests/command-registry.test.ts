// 命令注册表端到端 mock 测试:UNKNOWN_COMMAND / readonly 拒绝矩阵 / 结构化错误 / target 裁决
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/background/command-registry.js';
import { TargetResolver } from '../src/background/target-resolver.js';
import { ManagedTabs } from '../src/background/managed-tabs.js';
import { SnapshotStore } from '../src/background/snapshot-store.js';
import type { CommandDeps } from '../src/background/deps.js';
import type { TabLike, TabsAdapterLike } from '../src/background/tabs-adapter.js';
import type { DebuggerAdapter } from '../src/background/cdp-controller.js';

class MockTabs implements TabsAdapterLike {
  rows: TabLike[] = [
    { id: 1, url: 'https://user.example/page', title: '用户页', active: true },
    { id: 5, url: 'https://task.example/', title: '任务页', active: false },
  ];
  async query(info: Record<string, unknown>): Promise<TabLike[]> {
    if (info.active) return this.rows.filter((t) => t.active);
    return this.rows;
  }
  async create(info: { url?: string; active: boolean }): Promise<TabLike> {
    const t: TabLike = { id: 100 + this.rows.length, url: info.url ?? 'about:blank', active: info.active };
    this.rows.push(t);
    return t;
  }
  async get(tabId: number): Promise<TabLike> {
    const t = this.rows.find((x) => x.id === tabId);
    if (!t) throw new Error('No tab with id: ' + tabId);
    return t;
  }
  async update(tabId: number, info: Record<string, unknown>): Promise<TabLike> {
    const t = await this.get(tabId);
    Object.assign(t, info);
    return t;
  }
  async remove(tabId: number): Promise<void> {
    this.rows = this.rows.filter((t) => t.id !== tabId);
  }
  onRemoved(_cb: (tabId: number, removeInfo: unknown) => void): void {
    /* mock 无需转发 */
  }
}

class MockDebugger implements DebuggerAdapter {
  attachCalls: number[] = [];
  sent: Array<{ tabId: number; method: string; params?: Record<string, unknown> }> = [];
  async attach(target: { tabId: number }): Promise<void> {
    this.attachCalls.push(target.tabId);
  }
  async detach(): Promise<void> {}
  async sendCommand(target: { tabId: number }, method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sent.push({ tabId: target.tabId, method, params });
    if (method === 'Accessibility.getFullAXTree') {
      return {
        nodes: [
          { nodeId: '1', role: { value: 'RootWebArea' }, name: { value: 'p' }, childIds: ['2'] },
          { nodeId: '2', role: { value: 'link' }, name: { value: '点我' }, backendDOMNodeId: 42, childIds: [] },
        ],
      };
    }
    if (method === 'Runtime.evaluate') {
      return { result: { value: JSON.stringify({ url: 'https://task.example/', title: '任务页' }) } };
    }
    if (method === 'DOM.resolveNode') {
      return { object: { objectId: 'obj-42' } };
    }
    if (method === 'Runtime.callFunctionOn') {
      return { result: { value: { tag: 'a', text: '点我', role: 'link' } } };
    }
    return { result: { value: undefined } };
  }
}

describe('executeCommand(mock 端到端)', () => {
  let tabs: MockTabs;
  let dbg: MockDebugger;
  let managed: ManagedTabs;
  let snapshots: SnapshotStore;
  let base: Omit<CommandDeps, 'commandId' | 'mode' | 'cdp'>;

  beforeEach(() => {
    tabs = new MockTabs();
    dbg = new MockDebugger();
    managed = new ManagedTabs();
    managed.register(5);
    snapshots = new SnapshotStore();
    base = { tabs, resolver: new TargetResolver(tabs, managed), managed, snapshots, scripting: null };
  });

  const run = async (mode: 'pro' | 'readonly', method: string, params: Record<string, unknown> = {}) =>
    executeCommand({ ...base, mode, cdp: mode === 'pro' ? (dbg as never) : null, commandId: 'cmd-1' }, method, params, snapshots);

  test('未知命令 → UNKNOWN_COMMAND(-32601)', async () => {
    const r = await run('pro', 'no_such_command');
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, 'UNKNOWN_COMMAND');
    assert.equal(r.error?.num, -32601);
  });

  test('readonly 拒绝 navigate(READONLY_REJECTED,-32004),即使 target=newTab', async () => {
    const r = await run('readonly', 'navigate', { target: 'newTab', url: 'https://x.example' });
    assert.equal(r.error?.code, 'READONLY_REJECTED');
    assert.equal(r.error?.num, -32004);
    assert.match(r.error?.message ?? '', /readonly/);
  });

  test('readonly evaluate/scroll/fill/click 全部被拒(矩阵)', async () => {
    for (const m of ['evaluate', 'scroll', 'fill', 'click', 'press_key', 'new_tab', 'close_tab', 'switch_tab']) {
      const r = await run('readonly', m, { target: 'newTab' });
      assert.equal(r.error?.code, 'READONLY_REJECTED', m);
    }
  });

  test('pro 下 activeTab+navigate → TARGET_DENIED(-32005,原则 1)', async () => {
    const r = await run('pro', 'navigate', { target: 'activeTab', url: 'https://x.example' });
    assert.equal(r.error?.code, 'TARGET_DENIED');
    assert.equal(r.error?.num, -32005);
  });

  test('pro 下 activeTab+snapshot 放行,返回紧凑快照 + e1 ref', async () => {
    const r = await run('pro', 'snapshot', { target: 'activeTab', refs: true });
    assert.equal(r.ok, true);
    const res = r.result as { text: string; refs: Array<{ ref: string; backendDOMNodeId: number }>; snapshotId: string };
    assert.match(res.text, /link "点我" \[ref=e1\]/);
    assert.equal(res.refs[0].backendDOMNodeId, 42);
    assert.match(res.snapshotId, /^snap_1_\d+$/);
  });

  test('pro click ref=e1:resolveNode→callFunctionOn,返回 clicked 验证信息', async () => {
    snapshots.put(5, 'https://task.example/', '- link "点我" [ref=e1]', [{ ref: 'e1', role: 'link', name: '点我', backendDOMNodeId: 42 }]);
    const r = await run('pro', 'click', { target: 'tabId:5', ref: 'e1' });
    assert.equal(r.ok, true, JSON.stringify(r));
    const res = r.result as { clicked: { text?: string }; tabId: number; url: string };
    assert.equal(res.tabId, 5);
    assert.equal(res.clicked.text, '点我');
    assert.ok('delta' in res, '必须携带 delta 验证信息');
  });

  test('pro click ref 失效 → REF_STALE(-32006)', async () => {
    const r = await run('pro', 'click', { target: 'tabId:5', ref: 'e77' });
    assert.equal(r.error?.code, 'REF_STALE');
    assert.equal(r.error?.num, -32006);
  });

  test('pro navigate url 非 http(s) → INVALID_PARAMS', async () => {
    const r = await run('pro', 'navigate', { target: 'newTab', url: 'javascript:alert(1)' });
    assert.equal(r.error?.code, 'INVALID_PARAMS');
  });

  test('readonly get_tabs 仅 active 一条且无 tabs 权限时 url/title 置空', async () => {
    // 模拟无 "tabs" 权限:query 结果不带 url/title
    tabs.rows = [{ id: 1, active: true }];
    const r = await run('readonly', 'get_tabs');
    assert.equal(r.ok, true);
    const res = r.result as { tabs: Array<{ id: number; url: string; title: string }> };
    assert.equal(res.tabs.length, 1);
    assert.equal(res.tabs[0].url, '');
    assert.equal(res.tabs[0].title, '');
  });

  test('pro get_tabs 返回全部标签并带 managed 标记', async () => {
    const r = await run('pro', 'get_tabs');
    const res = r.result as { tabs: Array<{ id: number; managed: boolean }> };
    assert.equal(res.tabs.length, 2);
    assert.equal(res.tabs.find((t) => t.id === 5)?.managed, true);
    assert.equal(res.tabs.find((t) => t.id === 1)?.managed, false);
  });

  test('pro new_tab:后台新建并登记托管(§a.3:new_tab 亦须携带 target)', async () => {
    const r = await run('pro', 'new_tab', { target: 'newTab', url: 'https://new.example' });
    assert.equal(r.ok, true);
    const res = r.result as { tabId: number };
    assert.ok(managed.isManaged(res.tabId));
  });

  test('异常兜底:处理函数抛普通 Error → 结构化 INVALID_PARAMS,不裸抛', async () => {
    const r = await run('pro', 'evaluate', { target: 'tabId:5', expression: 'x'.repeat(200_001) });
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, 'INVALID_PARAMS');
    assert.match(r.error?.message ?? '', /100_000|超过|100000/);
  });
});
