// ============================================================
// tests/unit.test.ts —— 单元:截断/ULID/digest/artifacts/snapshot-store
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clipToChars, ulid, newTaskId, nowIso } from '../src/util.js';
import { estimateTokens, digest } from '../src/digest.js';
import { ArtifactsStore } from '../src/artifacts.js';
import { SnapshotStore } from '../src/snapshot-store.js';
import { htmlToMarkdown, ExtractFailedError } from '../src/reader.js';
import { EvidenceClient } from '../src/evidence-client.js';
import { makeError, ERROR_NUM } from '../src/types/index.js';

test('clipToChars:字符口径截断(§h)', () => {
  const { text, truncated, totalChars } = clipToChars('abcdef', 3);
  assert.equal(text, 'abc');
  assert.equal(truncated, true);
  assert.equal(totalChars, 6);
  const ok = clipToChars('abc', 5);
  assert.equal(ok.truncated, false);
});

test('ulid:26 位时间有序', () => {
  const a = ulid();
  assert.equal(a.length, 26);
  assert.match(a, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  const t1 = ulid(1000);
  const t2 = ulid(2000);
  assert.ok(t2 > t1, '时间有序');
  assert.match(newTaskId(), /^task_/);
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T/);
});

test('digest:≤2k token 预算,优先保留交互元素行', () => {
  const lines: string[] = [];
  lines.push('# 页面标题');
  for (let i = 0; i < 500; i++) lines.push(`普通正文段落第 ${i} 行,这里是一些没有交互语义的内容。`);
  lines.push('[link] e12 下一页');
  const text = lines.join('\n');
  const d = digest(text, 50);
  const tokens = estimateTokens(d);
  assert.ok(tokens <= 50, `digest 应不超预算,实际 ${tokens} tokens`);
  assert.ok(d.includes('下一页'), '交互元素应优先保留');
});

test('estimateTokens 保守口径', () => {
  assert.ok(estimateTokens('abcd') >= 1);
  assert.ok(estimateTokens('中中中中') >= 4, 'CJK ≈1 token/字');
});

test('artifacts:命名规则 + fileRef + relRef + 路径穿越防护', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wb-art-'));
  const store = new ArtifactsStore({ root });
  const art = await store.write('task_TEST', 'snapshot', 'txt', 'hello');
  assert.match(art.fileName, /^snapshot-\d{8}-\d{6}-001\.txt$/);
  assert.equal(art.relRef, 'artifacts/task_TEST/' + art.fileName);
  assert.ok(art.fileRef.startsWith('file://'));
  assert.ok(existsSync(art.fileRef.replace('file://', '')));
  const second = await store.write('task_TEST', 'snapshot', 'txt', 'hello2');
  assert.match(second.fileName, /-002\.txt$/);
  assert.throws(() => store.taskDir('../evil'), 'task_id 路径穿越应被拒绝');
  const back = await store.read(art.relRef);
  assert.equal(back?.toString(), 'hello');
  assert.equal(await store.read('../../etc/passwd'), null);
});

test('artifacts:cleanupOlderThan 只清过期文件', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wb-clean-'));
  const dir = path.join(root, 'task_OLD');
  mkdirSync(dir, { recursive: true });
  const oldFile = path.join(dir, 'snapshot-old.txt');
  writeFileSync(oldFile, 'old');
  const oldTime = new Date(Date.now() - 10 * 24 * 3600_000);
  utimesSync(oldFile, oldTime, oldTime);
  const store = new ArtifactsStore({ root });
  const removed = await store.cleanupOlderThan(7 * 24); // 7 天
  assert.equal(removed, 1);
  assert.equal(existsSync(oldFile), false);
  const none = await store.cleanupOlderThan(7 * 24);
  assert.equal(none, 0);
});

test('snapshot-store:60s 过期 + AND 检索 + 4k 截断', () => {
  const s = new SnapshotStore();
  const id = s.save({
    tabId: 1,
    url: 'https://e.com',
    title: 'T',
    text: 'row1\nrow2\nrow3',
    refs: [
      { ref: 'e1', role: 'link', name: '下一页' },
      { ref: 'e2', role: 'button', name: '下一页提交' },
      { ref: 'e3', role: 'button', name: '取消' },
    ],
  });
  const out = s.find({ snapshotId: id, query: { text: '下一页', role: 'button' } });
  assert.equal(out.matches.length, 1, 'text+role 应 AND');
  assert.equal(out.matches[0]!.ref, 'e2');
  const byRegex = s.find({ snapshotId: id, query: { regex: '^取消$' } });
  assert.equal(byRegex.matches[0]!.ref, 'e3');
  assert.ok(out.matches[0]!.context.length <= 200);

  // 过期:直接改 createdAt
  const e = s.get(id)!;
  (e as { createdAt: number }).createdAt = Date.now() - 61_000;
  assert.equal(s.get(id), undefined, '60s 过期');
});

test('reader:本地 readability → markdown;空 HTML 报 EXTRACT_FAILED', () => {
  const html = '<html><head><title>高考</title></head><body><article><h1>政策</h1><p>各省录取分数线公布,考生可查询。' + '详细'.repeat(50) + '</p></article></body></html>';
  const out = htmlToMarkdown(html, 'https://e.com');
  assert.equal(out.via, 'local-readability');
  assert.ok(out.markdown.includes('录取分数线') || out.markdown.includes('政策'), out.markdown.slice(0, 100));
  assert.throws(() => htmlToMarkdown('', 'https://e.com'), ExtractFailedError);
  assert.throws(() => htmlToMarkdown('<html><body></body></html>', 'https://e.com'), ExtractFailedError);
});

test('evidence-client:超长 quote 截 2000;失败返回 null 不抛', async () => {
  const ec = new EvidenceClient('http://127.0.0.1:1/save', true);
  const id = await ec.save({ task_id: 't', channel: 'controlled_browse', url: 'https://e.com', quote: 'q'.repeat(3000) });
  assert.equal(id, null, '不可达 → null,不抛错');
  const off = new EvidenceClient('http://127.0.0.1:1/save', false);
  assert.equal(await off.save({ task_id: 't', channel: 'manual', url: 'u', quote: 'q' }), null, 'OFF 时直接跳过');
});

test('evidence-client:WEBBRIDGE_BACKEND_TOKEN 开启时随 X-WebBridge-Token 头发送(backend/app/api/auth.py)', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ evidence_id: 'ev_TEST' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  const payload = { task_id: 't', channel: 'controlled_browse' as const, url: 'https://e.com', quote: 'q' };

  // 不配置 token → 不带头(本地零配置默认)
  await new EvidenceClient('http://backend/save', true, fakeFetch, '').save(payload);
  assert.equal((seen[0].init.headers as Record<string, string>)['x-webbridge-token'], undefined);

  // 配置 token → 带头
  await new EvidenceClient('http://backend/save', true, fakeFetch, 'secret-token').save(payload);
  assert.equal((seen[1].init.headers as Record<string, string>)['x-webbridge-token'], 'secret-token');
});

test('错误模型:makeError 保证 code/num 不漂移(§g.1)', () => {
  assert.equal(makeError('CMD_TIMEOUT', 'x').num, -32001);
  assert.equal(makeError('EXT_NOT_CONNECTED', 'x').num, -32000);
  assert.equal(makeError('READONLY_REJECTED', 'x').num, -32004);
  assert.equal(makeError('TARGET_DENIED', 'x').num, -32005);
  assert.equal(makeError('REF_STALE', 'x').num, -32006);
  assert.equal(makeError('EXTRACT_FAILED', 'x').num, -32008);
  assert.equal(ERROR_NUM.BACKEND_UNREACHABLE, null);
  const e = makeError('INVALID_PARAMS', 'msg', { field: 'url' });
  assert.deepEqual(e.data, { field: 'url' });
});
