// AX 紧凑序列化单测:紧凑角色过滤、ref 机制(e12)、深度/字符截断(原则 2 / §h)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compactAXSnapshot, buildTree, refsUpTo, truncateText, type AXNodeLike } from '../src/background/snapshot/ax-compact.js';

function flatNodes(): AXNodeLike[] {
  return [
    { nodeId: '1', role: { value: 'RootWebArea' }, name: { value: '测试页' }, childIds: ['2', '3'] },
    { nodeId: '2', role: { value: 'heading' }, name: { value: '招生\n计划' }, properties: [{ name: 'level', value: { value: 1 } }], backendDOMNodeId: 101, childIds: [] },
    { nodeId: '3', role: { value: 'generic' }, childIds: ['4', '5', '6'] },
    { nodeId: '4', role: { value: 'link' }, name: { value: '阳光高考平台' }, backendDOMNodeId: 102, childIds: [] },
    { nodeId: '5', role: { value: 'button' }, name: { value: '查询' }, backendDOMNodeId: 103, childIds: [] },
    { nodeId: '6', role: { value: 'textbox' }, name: { value: '分数' }, backendDOMNodeId: 104, childIds: [] },
  ];
}

describe('compactAXSnapshot', () => {
  test('仅列紧凑角色,压平控制字符,生成 e{n} ref', () => {
    const out = compactAXSnapshot(flatNodes(), { maxChars: 25_000 });
    const lines = out.text.split('\n');
    // generic 容器不出现,heading/link/button/textbox 出现
    assert.ok(!out.text.includes('generic'));
    assert.ok(lines.some((l) => l.includes('heading "招生 计划" [h1]')), out.text);
    assert.ok(lines.some((l) => l.includes('link "阳光高考平台" [ref=e2]')), out.text);
    assert.ok(lines.some((l) => l.includes('button "查询" [ref=e3]')));
    assert.ok(lines.some((l) => l.includes('textbox "分数" [ref=e4]')));
    assert.equal(out.truncated, false);
    assert.equal(out.totalChars, out.text.length);
    assert.deepEqual(
      out.refs.map((r) => [r.ref, r.backendDOMNodeId]),
      [
        ['e1', 101],
        ['e2', 102],
        ['e3', 103],
        ['e4', 104],
      ],
    );
  });

  test('字符截断:totalChars 为截断前长度,truncated=true,refs 不越界', () => {
    const out = compactAXSnapshot(flatNodes(), { maxChars: 60 });
    assert.equal(out.truncated, true);
    assert.equal(out.text.length, 60);
    assert.ok(out.totalChars > 60);
    for (const r of out.refs) {
      assert.ok(out.text.includes(`[ref=${r.ref}]`), `ref ${r.ref} 必须仍在 text 内`);
    }
  });

  test('深度截断:depthLimit 以下不再展开', () => {
    // 构造 20 层深的链
    const nodes: AXNodeLike[] = [];
    for (let i = 1; i <= 21; i++) {
      nodes.push({ nodeId: String(i), role: { value: i === 1 ? 'RootWebArea' : 'group' }, name: { value: `n${i}` }, childIds: i < 21 ? [String(i + 1)] : ['22'] });
    }
    nodes.push({ nodeId: '22', role: { value: 'button' }, name: { value: 'deep' }, backendDOMNodeId: 900, childIds: [] });
    const out = compactAXSnapshot(nodes, { maxChars: 25_000, depthLimit: 5 });
    assert.ok(!out.text.includes('deep'), '超过深度上限的元素不应出现');
  });

  test('ignored 节点跳过;无 backendDOMNodeId 的紧凑节点不占 ref', () => {
    const nodes: AXNodeLike[] = [
      { nodeId: '1', role: { value: 'RootWebArea' }, childIds: ['2', '3'] },
      { nodeId: '2', role: { value: 'link' }, name: { value: 'hidden' }, ignored: true, backendDOMNodeId: 1, childIds: [] },
      { nodeId: '3', role: { value: 'link' }, name: { value: 'no-backend' }, childIds: [] },
    ];
    const out = compactAXSnapshot(nodes, { maxChars: 25_000 });
    assert.ok(!out.text.includes('hidden'));
    assert.ok(out.text.includes('link "no-backend"'));
    assert.ok(!out.text.includes('[ref=e1]'), '无 backendDOMNodeId 不生成 ref');
    assert.equal(out.refs.length, 0);
  });

  test('full 级别纳入 staticText', () => {
    const nodes: AXNodeLike[] = [
      { nodeId: '1', role: { value: 'RootWebArea' }, childIds: ['2'] },
      { nodeId: '2', role: { value: 'staticText' }, name: { value: '正文一句话' }, childIds: [] },
    ];
    assert.equal(compactAXSnapshot(nodes, { maxChars: 25_000, level: 'compact' }).text, '');
    assert.ok(compactAXSnapshot(nodes, { maxChars: 25_000, level: 'full' }).text.includes('正文一句话'));
  });
});

describe('buildTree / refsUpTo / truncateText', () => {
  test('buildTree 从扁平 childIds 还原嵌套', () => {
    const root = buildTree(flatNodes());
    assert.equal(root?.role?.value, 'RootWebArea');
    assert.equal(root?.children?.length, 2);
  });

  test('refsUpTo 只保留截断点之前的 ref', () => {
    const text = '- link "a" [ref=e1]\n- link "b" [ref=e2]';
    const refs = [
      { ref: 'e1', role: 'link', name: 'a', backendDOMNodeId: 1 },
      { ref: 'e2', role: 'link', name: 'b', backendDOMNodeId: 2 },
    ];
    assert.equal(refsUpTo(text, refs).length, 2);
    assert.equal(refsUpTo('- link "a" [ref=e1]', refs).length, 1);
    assert.equal(refsUpTo('', refs).length, 0);
  });

  test('truncateText 字符口径', () => {
    const t = truncateText('x'.repeat(30), 20);
    assert.equal(t.text.length, 20);
    assert.equal(t.totalChars, 30);
    assert.equal(t.truncated, true);
    assert.equal(truncateText('abc', 20).truncated, false);
  });
});
