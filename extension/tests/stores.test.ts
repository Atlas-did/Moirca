// 托管标签 + 快照存储单测(target 语义支撑:newTab 复用 / REF_STALE / TTL)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ManagedTabs } from '../src/background/managed-tabs.js';
import { SnapshotStore } from '../src/background/snapshot-store.js';
import { pngSizeFromBase64 } from '../src/background/png-size.js';

describe('ManagedTabs', () => {
  test('register/isManaged/currentTaskTabId(最近使用优先)', () => {
    const m = new ManagedTabs();
    m.register(10);
    m.register(11);
    assert.ok(m.isManaged(10));
    assert.ok(m.isManaged(11));
    assert.ok(!m.isManaged(12));
    m.touch(10);
    assert.equal(m.currentTaskTabId(), 10);
    m.touch(11);
    assert.equal(m.currentTaskTabId(), 11);
  });

  test('unregister 后不再托管', () => {
    const m = new ManagedTabs();
    m.register(7);
    m.unregister(7);
    assert.ok(!m.isManaged(7));
  });

  test('idleIds 超时空闲回收(任务超时兜底)', () => {
    const m = new ManagedTabs();
    m.register(1);
    m.register(2);
    // 手动把 1 的 lastUsedAt 拨回 20 分钟前
    (m.list().find((r) => r.tabId === 1) as { lastUsedAt: number }).lastUsedAt = Date.now() - 20 * 60_000;
    assert.deepEqual(m.idleIds(10 * 60_000), [1]);
    assert.deepEqual(m.idleIds(30 * 60_000), []);
  });
});

describe('SnapshotStore(REF_STALE / 60s TTL)', () => {
  test('ref → backendDOMNodeId 解析', () => {
    const s = new SnapshotStore();
    s.put(5, 'https://x', '- link "a" [ref=e1]\n- button "b" [ref=e2]', [
      { ref: 'e1', role: 'link', name: 'a', backendDOMNodeId: 111 },
      { ref: 'e2', role: 'button', name: 'b', backendDOMNodeId: 222 },
    ]);
    assert.equal(s.resolveRef(5, 'e1'), 111);
    assert.equal(s.resolveRef(5, 'e2'), 222);
  });

  test('ref 不在快照 → REF_STALE(-32006)', () => {
    const s = new SnapshotStore();
    s.put(5, 'https://x', '- link "a" [ref=e1]', [{ ref: 'e1', role: 'link', name: 'a', backendDOMNodeId: 1 }]);
    assert.throws(() => s.resolveRef(5, 'e99'), (e: { code: string; num: number }) => {
      assert.equal(e.code, 'REF_STALE');
      assert.equal(e.num, -32006);
      return true;
    });
  });

  test('TTL 过期后 resolveRef → REF_STALE(invalidate 同样生效)', () => {
    const s = new SnapshotStore();
    s.put(5, 'https://x', '- link "a" [ref=e1]', [{ ref: 'e1', role: 'link', name: 'a', backendDOMNodeId: 1 }]);
    s.invalidate(5);
    assert.throws(() => s.resolveRef(5, 'e1'), /REF_STALE|失效/);
  });

  test('snapshotId 规则 snap_{tabId}_{seq}', () => {
    const s = new SnapshotStore();
    const id1 = s.put(5, 'https://x', 't', []);
    const id2 = s.put(5, 'https://y', 't2', []);
    assert.match(id1, /^snap_5_\d+$/);
    assert.notEqual(id1, id2);
    assert.equal(s.getBySnapshotId(id2)?.url, 'https://y');
  });
});

describe('pngSizeFromBase64', () => {
  test('能从合法 PNG 读出 IHDR 尺寸', () => {
    // 3x2 PNG:手工构造最小 IHDR(只校验签名与 IHDR 头,无需合法 IDAT)
    const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(3, 0);
    ihdrData.writeUInt32BE(2, 4);
    ihdrData.writeUInt8(8, 8);
    ihdrData.writeUInt8(6, 9);
    const chunk = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(ihdrData.length, 0);
    bytes.push(...len, ...chunk);
    const b64 = Buffer.from(bytes).toString('base64');
    assert.deepEqual(pngSizeFromBase64(b64), { width: 3, height: 2 });
  });

  test('非法 base64 返回 0x0(不抛)', () => {
    assert.deepEqual(pngSizeFromBase64('not-a-png'), { width: 0, height: 0 });
  });
});
