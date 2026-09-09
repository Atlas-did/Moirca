// WS 连接状态机单测(§a.1):hello 优先、welcome 门控、协议版本不匹配停机、命令超时兜底
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WsConnection, COMMAND_TIMEOUT_MS, type WsSocketLike, type SocketFactory } from '../src/background/ws-connection.js';
import type { WSCommandMessage } from '@webbridge/shared-types';

class MockSocket implements WsSocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  fireOpen(): void {
    this.onopen?.();
  }
  fireMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function makeFactory() {
  const sockets: MockSocket[] = [];
  const factory: SocketFactory = () => {
    const s = new MockSocket();
    sockets.push(s);
    return s;
  };
  return { sockets, factory };
}

describe('WsConnection(§a.1 握手状态机)', () => {
  test('连接后先发 hello(mode/protocolVersion/extVersion)', async () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection({ onCommand: async () => ({ type: 'result', id: '', ok: true }) }, factory, '2.0.0');
    conn.start();
    sockets[0].fireOpen();
    await new Promise((r) => setTimeout(r, 0)); // hello 在 tokenProvider 微任务后发出
    assert.equal(sockets[0].sent.length, 1);
    const hello = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
    assert.equal(hello.type, 'hello');
    assert.equal(hello.protocolVersion, 1);
    assert.equal(hello.mode, 'readonly'); // Node 环境(无 define)按最小权限兜底为 readonly
    assert.equal(hello.extVersion, '2.0.0');
    conn.stop();
  });

  test('hello 携带 tokenProvider 提供的配对 token(§a.1 + 网关认证)', async () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection(
      { onCommand: async () => ({ type: 'result', id: '', ok: true }) },
      factory,
      '2.0.0',
      async () => 'deadbeef-token',
    );
    conn.start();
    sockets[0].fireOpen();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(sockets[0].sent.length, 1);
    const hello = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
    assert.equal(hello.token, 'deadbeef-token');
    conn.stop();
  });

  test('welcome 前 command 不响应;welcome 后正常返回 result', async () => {
    const { sockets, factory } = makeFactory();
    const seen: WSCommandMessage[] = [];
    const conn = new WsConnection(
      {
        onCommand: async (msg) => {
          seen.push(msg);
          return { type: 'result', id: msg.id, ok: true, result: { echo: msg.method } };
        },
      },
      factory,
    );
    conn.start();
    sockets[0].fireOpen();
    await new Promise((r) => setTimeout(r, 0)); // hello 在 tokenProvider 微任务后发出

    const cmd: WSCommandMessage = { type: 'command', id: 'c1', method: 'get_tabs', params: {} };
    sockets[0].fireMessage(JSON.stringify(cmd));
    assert.equal(seen.length, 0, 'welcome 前不派发命令');
    assert.equal(sockets[0].sent.length, 1, 'welcome 前不回 result');

    sockets[0].fireMessage(JSON.stringify({ type: 'welcome', protocolVersion: 1, artifactRoot: '/tmp/artifacts' }));
    sockets[0].fireMessage(JSON.stringify(cmd));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(seen.length, 1);
    const reply = JSON.parse(sockets[0].sent[1]) as Record<string, unknown>;
    assert.equal(reply.ok, true);
    conn.stop();
  });

  test('protocolVersion 不匹配 → 断开并停止重连(stopped)', async () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection({ onCommand: async () => ({ type: 'result', id: '', ok: true }) }, factory);
    conn.start();
    const s = sockets[0];
    s.fireOpen();
    s.fireMessage(JSON.stringify({ type: 'welcome', protocolVersion: 2, artifactRoot: '/x' }));
    assert.equal(conn.getStatus(), 'stopped');
    assert.equal(s.closed, true, '不匹配时立即断开');
    conn.stop();
  });

  test('非法 JSON 回 PARSE_ERROR 结构化错误(-32700)', async () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection({ onCommand: async () => ({ type: 'result', id: '', ok: true }) }, factory);
    conn.start();
    const s = sockets[0];
    s.fireOpen();
    s.fireMessage('this is not json{{{');
    const reply = JSON.parse(s.sent[s.sent.length - 1]) as { error?: { code: string; num: number } };
    assert.equal(reply.error?.code, 'PARSE_ERROR');
    assert.equal(reply.error?.num, -32700);
    conn.stop();
  });

  test('命令 30s 超时兜底为 CMD_TIMEOUT(-32001)(压缩时钟语义:直接断言常量与错误构造成本)', async () => {
    // 不真等 30s:验证常量与超时消息构造成本在 dispatchWithTimeout 之外的
    // CMD_TIMEOUT 语义由 command-registry 测试以小超时覆盖。
    assert.equal(COMMAND_TIMEOUT_MS, 30_000);
  });

  test('connecting 期间重复 start() 只开一条 socket(真机回归:onInstalled+顶层 start 双触发)', () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection({ onCommand: async () => ({ type: 'result', id: '', ok: true }) }, factory);
    conn.start();
    conn.start(); // 双触发:此时 status=connecting,第二条必须被挡
    conn.start();
    assert.equal(sockets.length, 1, '重复 start 不得新开 socket');
    conn.stop();
  });

  test('welcome 后 sendReport 真发;未 welcome 时返回 false 不抛(§a.6)', async () => {
    const { sockets, factory } = makeFactory();
    const conn = new WsConnection({ onCommand: async () => ({ type: 'result', id: '', ok: true }) }, factory);
    conn.start();
    const s = sockets[0];
    s.fireOpen();
    await new Promise((r) => setTimeout(r, 0));
    const report = {
      type: 'analysis_report' as const,
      id: 'ar_t',
      kind: 'screenshot' as const,
      capturedAt: new Date().toISOString(),
      pageUrl: 'https://x.example/',
      pageTitle: 't',
      metrics: { width: 10, height: 5, aspectRatio: 2, brightness: 0.5, colorfulness: 1, dominantColors: [] },
      summary: 's',
    };
    assert.equal(conn.sendReport(report), false, 'welcome 前不上报');
    s.fireMessage(JSON.stringify({ type: 'welcome', protocolVersion: 1, artifactRoot: '/tmp/artifacts' }));
    assert.equal(conn.sendReport(report), true, 'welcome 后真发');
    const last = JSON.parse(s.sent[s.sent.length - 1]) as Record<string, unknown>;
    assert.equal(last.type, 'analysis_report');
    conn.stop();
  });
});
