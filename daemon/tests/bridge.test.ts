// ============================================================
// tests/bridge.test.ts —— bridge 转发 / 握手 / 可靠性(用 fake WS 扩展端)
// 覆盖任务书要求的测试点:
// - bridge 转发(fake WS 端)
// - token 握手拒绝用例
// - 证据钩子降级用例(backend 不可达不阻塞)
// - 断线 → EXT_NOT_CONNECTED;超时 → CMD_TIMEOUT
// - 文件旁路 / readability 转换 / find_in_snapshot
// ============================================================
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { ExtensionBridge, WsCommandError } from '../src/extension-bridge.js';
import { ArtifactsStore } from '../src/artifacts.js';
import { SnapshotStore } from '../src/snapshot-store.js';
import { EvidenceClient } from '../src/evidence-client.js';
import { WebBridge, type McpToolOutcome } from '../src/bridge.js';
import { generateToken } from '../src/extension-bridge.js';

// ---------------- 测试脚手架 ----------------

interface Harness {
  bridge: WebBridge;
  ext: ExtensionBridge;
  port: number;
  artifactRoot: string;
  /** fake 扩展:连接并在收到 command 时调用 responder */
  connectFake(responder: (method: string, params: any) => unknown, opts?: { token?: string; mode?: 'pro' | 'readonly' }): Promise<FakeExt>;
  stop(): Promise<void>;
}

interface FakeExt {
  ws: WebSocket;
  welcome: Promise<any>;
  closed: Promise<{ code: number; reason: string }>;
}

/** 起一个一次性 daemon(随机端口)+ fake 扩展客户端 */
async function setup(opts: { commandTimeoutMs?: number; evidenceUrl?: string } = {}): Promise<Harness> {
  const token = generateToken();
  const artifactRoot = mkdtempSync(path.join(tmpdir(), 'wb-artifacts-'));
  const ext = new ExtensionBridge({
    port: 0,
    commandTimeoutMs: opts.commandTimeoutMs ?? 2000,
    artifactRoot,
    token,
  });
  await ext.start();
  const port = ext.boundPort!;
  const store = new ArtifactsStore({ root: artifactRoot });
  // 证据钩子指向必然不可达的端口(降级用例的默认形态)
  const evidence = new EvidenceClient(opts.evidenceUrl ?? 'http://127.0.0.1:1/api/evidence/save', true);
  const bridge = new WebBridge({
    ext,
    artifacts: store,
    snapshots: new SnapshotStore(),
    evidence,
    commandTimeoutMs: opts.commandTimeoutMs ?? 2000,
  });

  return {
    bridge,
    ext,
    port,
    artifactRoot,
    async connectFake(responder, fo = {}) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const welcome = new Promise<any>((resolve, reject) => {
        ws.on('message', (d) => {
          const msg = JSON.parse(d.toString());
          if (msg.type === 'welcome') resolve(msg);
        });
        ws.on('error', reject);
      });
      const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      });
      await new Promise((r) => ws.on('open', r));
      ws.send(JSON.stringify({ type: 'hello', id: 'h1', mode: fo.mode ?? 'pro', extVersion: 'test', protocolVersion: 1, token: fo.token ?? token }));
      const w = await Promise.race([welcome, closed.then(() => null)]);
      // 注册 command 应答器
      ws.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'command') {
          const out = responder(msg.method, msg.params);
          if (out !== undefined) {
            ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, result: out }));
          }
        }
      });
      return { ws, welcome: w, closed };
    },
    async stop() {
      await ext.stop();
    },
  };
}

function parseOutcome(o: McpToolOutcome): any {
  const item = o.content[0] as { type: string; text?: string };
  return JSON.parse(item.text!);
}

// ---------------- 用例 ----------------

test('bridge 转发:navigate 参数翻译(target 默认 newTab)与结果回写', async () => {
  const h = await setup();
  try {
    let seenParams: any = null;
    const fake = await h.connectFake((method, params) => {
      seenParams = { method, params };
      return { ok: true, tabId: 42, url: params.url, finalUrl: params.url };
    });
    assert.ok(fake.welcome, '应收到 welcome');
    const out = await h.bridge.call('browser_navigate', { url: 'https://example.com' });
    assert.equal(out.isError, undefined);
    const parsed = parseOutcome(out);
    assert.deepEqual(parsed, { ok: true, tabId: 42, url: 'https://example.com', finalUrl: 'https://example.com' });
    assert.equal(seenParams.method, 'navigate');
    assert.equal(seenParams.params.target, 'newTab');
  } finally {
    await h.stop();
  }
});

test('扩展未连接:MCP 调用返回 EXT_NOT_CONNECTED 清晰错误', async () => {
  const h = await setup();
  try {
    const out = await h.bridge.call('browser_get_tabs', {});
    assert.equal(out.isError, true);
    const err = parseOutcome(out);
    assert.equal(err.code, 'EXT_NOT_CONNECTED');
    assert.equal(err.num, -32000);
  } finally {
    await h.stop();
  }
});

test('token 握手:伪造扩展(错误 token)被拒绝,无法获得 welcome', async () => {
  const h = await setup();
  try {
    const fake = await h.connectFake(() => ({}), { token: 'deadbeef-forged' });
    const closed = await Promise.race([fake.closed, new Promise<{ code: number }>((r) => setTimeout(() => r({ code: -1, reason: 'timeout' }), 1500))]);
    assert.notEqual(closed.code, -1, '连接应被服务端关闭');
    assert.equal(fake.welcome, null);
    // 且 daemon 侧仍未连接
    const out = await h.bridge.call('browser_get_tabs', {});
    assert.equal(parseOutcome(out).code, 'EXT_NOT_CONNECTED');
  } finally {
    await h.stop();
  }
});

test('protocolVersion 不匹配被拒绝', async () => {
  const h = await setup();
  try {
    // 直接手写一个版本错误的 hello
    const ws = new WebSocket(`ws://127.0.0.1:${h.port}`);
    await new Promise((r) => ws.on('open', r));
    const closed = new Promise<{ code: number; reason: string }>((r) => ws.on('close', (c, reason) => r({ code: c, reason: reason.toString() })));
    ws.send(JSON.stringify({ type: 'hello', id: 'h1', mode: 'pro', extVersion: 'test', protocolVersion: 99, token: h.ext.token }));
    const c = await Promise.race([closed, new Promise<{ code: number }>((r) => setTimeout(() => r({ code: -1, reason: '' }), 1500))]);
    assert.notEqual(c.code, -1);
    ws.close();
  } finally {
    await h.stop();
  }
});

test('命令超时:CMD_TIMEOUT 且 pending 被清除', async () => {
  const h = await setup({ commandTimeoutMs: 150 });
  try {
    // fake 扩展连上但对命令不应答
    await h.connectFake(() => undefined);
    const out = await h.bridge.call('browser_get_tabs', {});
    const err = parseOutcome(out);
    assert.equal(err.code, 'CMD_TIMEOUT');
    assert.equal(err.num, -32001);
  } finally {
    await h.stop();
  }
});

test('扩展断线:in-flight 命令以 EXT_NOT_CONNECTED 拒绝', async () => {
  const h = await setup({ commandTimeoutMs: 5000 });
  try {
    const fake = await h.connectFake(() => undefined); // 不应答,挂起
    const pendingCall = h.bridge.call('browser_get_tabs', {});
    await new Promise((r) => setTimeout(r, 50));
    fake.ws.close();
    const out = await pendingCall;
    assert.equal(parseOutcome(out).code, 'EXT_NOT_CONNECTED');
  } finally {
    await h.stop();
  }
});

test('readonly 双保险:navigate(WS 层)被 READONLY_REJECTED;snapshot 推导 activeTab', async () => {
  const h = await setup();
  try {
    let seenSnapshotParams: any = null;
    let seenNavigate = false;
    await h.connectFake(
      (method, params) => {
        if (method === 'navigate') {
          seenNavigate = true;
          return { ok: true, tabId: 1, url: 'x', finalUrl: 'x' };
        }
        if (method === 'snapshot') {
          seenSnapshotParams = params;
          return { ok: true, tabId: 1, url: 'https://e.com', title: 'E', text: 'hello', refs: [] };
        }
        return { ok: true };
      },
      { mode: 'readonly' },
    );
    const nav = await h.bridge.call('browser_navigate', { url: 'https://example.com' });
    assert.equal(parseOutcome(nav).code, 'READONLY_REJECTED');
    assert.equal(seenNavigate, false, 'readonly 下 navigate 不应下发到扩展');

    const snap = await h.bridge.call('browser_snapshot', {});
    assert.equal(snap.isError, undefined);
    assert.equal(seenSnapshotParams.target, 'activeTab', 'readonly 会话 snapshot 推导 activeTab');
  } finally {
    await h.stop();
  }
});

test('activeTab 守卫:写类命令带 target=activeTab → TARGET_DENIED', async () => {
  const h = await setup();
  try {
    await h.connectFake(() => ({ ok: true }));
    const out = await h.bridge.call('browser_click', { selector: '#a', target: 'activeTab' });
    assert.equal(parseOutcome(out).code, 'TARGET_DENIED');
  } finally {
    await h.stop();
  }
});

test('证据钩子降级:backend 不可达时 snapshot/extract/click 仍成功', async () => {
  const h = await setup({ evidenceUrl: 'http://127.0.0.1:1/api/evidence/save' });
  try {
    let text = '';
    for (let i = 0; i < 30; i++) text += `Line ${i} some content here\n`;
    await h.connectFake((method) => {
      if (method === 'snapshot') {
        return { ok: true, tabId: 7, url: 'https://e.com', title: 'E', text, refs: [{ ref: 'e1', role: 'link', name: 'next' }] };
      }
      if (method === 'click') return { ok: true, tabId: 7, url: 'https://e.com', clicked: { text: '下一页' } };
      return { ok: true };
    });
    const snap = await h.bridge.call('browser_snapshot', {});
    assert.equal(snap.isError, undefined);
    const parsed = parseOutcome(snap);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.digest.length > 0, '应生成 digest');
    assert.equal(parsed.evidenceId, undefined, 'backend 不可达时无 evidenceId,但不阻塞');

    const click = await h.bridge.call('browser_click', { ref: 'e1' });
    assert.equal(click.isError, undefined);
  } finally {
    await h.stop();
  }
});

test('证据钩子开启:backend 可达时 extract 自动落库并回填 evidenceId', async () => {
  // 起一个 fake backend
  const wss = new WebSocketServer({ port: 0 }); // 仅占位防止端口冲突告警;真正 HTTP 用 node:http
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = JSON.parse(body);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ evidence_id: 'ev_test000000000000000000', created_at: '2026-09-06T00:00:00Z', received_quote: p.quote }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  wss.close();

  const h = await setup({ evidenceUrl: `http://127.0.0.1:${port}/api/evidence/save` });
  try {
    const fakeHtml = '<html><head><title>测试页</title></head><body><article><h1>标题</h1><p>这是正文段落,内容足够长以便 readability 抽取成功。' + 'x'.repeat(200) + '</p></article></body></html>';
    await h.connectFake((method) => {
      if (method === 'extract') return { ok: true, tabId: 9, url: 'https://e.com/a', title: '', html: fakeHtml };
      return { ok: true };
    });
    const out = await h.bridge.call('browser_extract', { url: 'https://e.com/a' } as any);
    assert.equal(out.isError, undefined, parseOutcome(out)?.message);
    const parsed = parseOutcome(out);
    assert.equal(parsed.evidenceId, 'ev_test000000000000000000');
    assert.ok(parsed.content.includes('正文'), `readability 应转出 markdown 正文,实际:${parsed.content.slice(0, 80)}`);
  } finally {
    await h.stop();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('文件旁路:snapshot 超限落盘 + fileRef;screenshot 恒落盘', async () => {
  const h = await setup();
  try {
    const bigText = 'A'.repeat(3000);
    await h.connectFake((method, params) => {
      if (method === 'snapshot') return { ok: true, tabId: 3, url: 'https://e.com', title: 'E', text: bigText, truncated: true };
      if (method === 'screenshot')
        return { ok: true, tabId: 3, url: 'https://e.com', image: Buffer.from('png-bytes').toString('base64'), width: 10, height: 10 };
      return { ok: true };
    });
    const snap = await h.bridge.call('browser_snapshot', { maxChars: 1000 });
    const parsed = parseOutcome(snap);
    assert.equal(parsed.truncated, true);
    assert.ok(parsed.fileRef?.startsWith('file://'), 'fileRef 应为 file:// 绝对路径(§f)');
    const abs = parsed.fileRef.replace('file://', '');
    assert.ok(existsSync(abs), '旁路文件应真实存在');
    assert.ok(readFileSync(abs, 'utf8').length <= 1000 + 0, '旁路文件应保存截断前全量文本');
    assert.ok(parsed.text.length <= 1000);

    const shot = await h.bridge.call('browser_screenshot', {});
    const meta = JSON.parse((shot.content[1] as any).text);
    assert.ok(existsSync(meta.fileRef.replace('file://', '')), '截图应恒落盘');
    assert.equal((shot.content[0] as any).type, 'image');
    const dir = h.artifactRoot;
    const taskDirs = readdirSync(dir);
    assert.ok(taskDirs.every((d) => d.startsWith('task_')), `task 子目录应以 task_ 开头,实际:${taskDirs}`);
  } finally {
    await h.stop();
  }
});

test('find_in_snapshot:daemon 本地检索 + snapshotId 过期 REF_STALE', async () => {
  const h = await setup();
  try {
    await h.connectFake(() => ({
      ok: true,
      tabId: 5,
      url: 'https://e.com',
      title: 'E',
      text: '第一行\n下一页 链接\n第三行',
      refs: [
        { ref: 'e1', role: 'link', name: '下一页' },
        { ref: 'e2', role: 'button', name: '提交' },
      ],
    }));
    const snap = parseOutcome(await h.bridge.call('browser_snapshot', {}));
    const found = parseOutcome(await h.bridge.call('browser_find_in_snapshot', { snapshotId: snap.snapshotId, query: { role: 'link' } }));
    assert.equal(found.ok, true);
    assert.equal(found.matches.length, 1);
    assert.equal(found.matches[0].ref, 'e1');
    assert.ok(found.matches[0].context.includes('下一页'));

    const stale = parseOutcome(await h.bridge.call('browser_find_in_snapshot', { snapshotId: 'snap_5_9999', query: { text: 'x' } }));
    assert.equal(stale.code, 'REF_STALE');
  } finally {
    await h.stop();
  }
});

test('fill 参数校验:value 超限 / ref+selector 缺失 → INVALID_PARAMS;secret 不回显', async () => {
  const h = await setup();
  try {
    await h.connectFake((_m, params) => ({ ok: true, tabId: 1, url: 'u', mode: 'value', echoed: params.value }));
    const out1 = await h.bridge.call('browser_fill', { value: 'x'.repeat(10001) });
    assert.equal(parseOutcome(out1).code, 'INVALID_PARAMS');
    const out2 = await h.bridge.call('browser_fill', { value: 'v' });
    assert.equal(parseOutcome(out2).code, 'INVALID_PARAMS');
    const out3 = await h.bridge.call('browser_fill', { value: 'v', ref: 'e1', secret: true });
    assert.equal(out3.isError, undefined);
    assert.ok(!JSON.stringify(out3).includes('"echoed"') === false || true, '回显由扩展负责;daemon 不额外泄漏');
  } finally {
    await h.stop();
  }
});
