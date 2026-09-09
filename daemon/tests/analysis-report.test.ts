// ============================================================
// tests/analysis-report.test.ts —— §a.6 analysis_report 落盘 + 证据推送
// 覆盖:
// - 合法上报 → artifacts/_analysis/report-{id}.json 落盘(JSON 含 receivedAt)
//   + EvidenceClient 被调用(mock 注入,字段映射断言)+ 连接保持
// - 非法 payload(pageUrl 非 http(s) / metrics 非数值)→ 拒绝且不断连
// - summary 超限截断到 500
// - evidence 推送抛错 → 不阻塞,artifact 仍落盘
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { ExtensionBridge, generateToken } from '../src/extension-bridge.js';
import { ArtifactsStore } from '../src/artifacts.js';
import type { EvidencePayload } from '../src/evidence-client.js';

interface FakeExt {
  ws: WebSocket;
  closed: Promise<{ code: number; reason: string }>;
}

/** mock EvidenceClient:记录 save 调用,可配置返回值/抛错 */
function mockEvidence(opts: { returnId?: string | null; throwOnSave?: boolean } = {}) {
  const calls: EvidencePayload[] = [];
  return {
    calls,
    save: async (p: EvidencePayload): Promise<string | null> => {
      if (opts.throwOnSave) throw new Error('mock evidence failure');
      calls.push(JSON.parse(JSON.stringify(p)) as EvidencePayload);
      return opts.returnId ?? null;
    },
  };
}

async function setup(opts: { evidence?: ReturnType<typeof mockEvidence> } = {}) {
  const token = generateToken();
  const artifactRoot = mkdtempSync(path.join(tmpdir(), 'wb-analysis-'));
  const evidence = opts.evidence ?? mockEvidence({ returnId: 'ev_mock000000000000000000' });
  const ext = new ExtensionBridge({
    port: 0,
    commandTimeoutMs: 2000,
    artifactRoot,
    token,
    analysis: {
      artifacts: new ArtifactsStore({ root: artifactRoot }),
      evidence: { save: evidence.save },
    },
  });
  await ext.start();
  const port = ext.boundPort!;

  const connectFake = async (): Promise<FakeExt> => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((r) => ws.on('open', r));
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    const welcome = new Promise<void>((resolve, reject) => {
      ws.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'welcome') resolve();
      });
      ws.on('error', reject);
    });
    // daemon 侧约定:先 hello,后 welcome(§a.1)
    ws.send(JSON.stringify({ type: 'hello', id: 'h1', mode: 'pro', extVersion: 'test', protocolVersion: 1, token }));
    await Promise.race([welcome, new Promise((r) => setTimeout(r, 2000))]);
    return { ws, closed };
  };

  return {
    ext,
    artifactRoot,
    evidence,
    connectFake,
    analysisDir: path.join(artifactRoot, '_analysis'),
    async stop() {
      await ext.stop();
    },
  };
}

function validReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'analysis_report',
    id: '01JANALYSISREPORT00000000TEST',
    kind: 'screenshot',
    capturedAt: '2026-09-07T08:00:00.000Z',
    pageUrl: 'https://example.com/page',
    pageTitle: '示例页',
    metrics: {
      width: 1280,
      height: 800,
      aspectRatio: 1.6,
      brightness: 0.42,
      colorfulness: 33.5,
      dominantColors: [
        { rgb: [255, 255, 255], share: 0.7 },
        { rgb: [24, 48, 96], share: 0.3 },
      ],
    },
    summary: '页面以浅色为主,顶部有大标题,整体布局两栏。',
    ...overrides,
  };
}

async function waitFor(cond: () => boolean, timeoutMs = 3000, what = 'condition'): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时:${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('analysis_report 合法上报:artifact 落盘 JSON 完整 + evidence 按映射推送 + 连接保持', async () => {
  const h = await setup();
  try {
    const fake = await h.connectFake();
    fake.ws.send(JSON.stringify(validReport()));
    const file = path.join(h.analysisDir, 'report-01JANALYSISREPORT00000000TEST.json');
    await waitFor(() => existsSync(file), 3000, 'artifact 落盘');

    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.type, 'analysis_report');
    assert.equal(record.id, '01JANALYSISREPORT00000000TEST');
    assert.equal(record.kind, 'screenshot');
    assert.equal(record.capturedAt, '2026-09-07T08:00:00.000Z');
    assert.equal(record.pageUrl, 'https://example.com/page');
    assert.equal(record.pageTitle, '示例页');
    assert.equal(record.metrics.width, 1280);
    assert.equal(record.metrics.brightness, 0.42);
    assert.equal(record.metrics.dominantColors.length, 2);
    assert.equal(typeof record.receivedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(record.receivedAt)), 'receivedAt 应为 ISO 时刻');

    await waitFor(() => h.evidence.calls.length === 1, 3000, 'evidence 调用');
    const p = h.evidence.calls[0]!;
    assert.equal(p.task_id, 'analysis_01JANALYSISREPORT00000000TEST');
    assert.equal(p.channel, 'page_qa');
    assert.equal(p.url, 'https://example.com/page');
    assert.equal(p.title, '示例页');
    assert.equal(p.fetched_at, '2026-09-07T08:00:00.000Z');
    assert.equal(p.quote, record.summary);
    assert.equal(p.raw_ref, 'artifacts/_analysis/report-01JANALYSISREPORT00000000TEST.json');

    // 连接未被关闭(处理是 fire-and-forget,不回执也不断连)
    const closed = await Promise.race([
      fake.closed,
      new Promise<'still-open'>((r) => setTimeout(() => r('still-open'), 300)),
    ]);
    assert.equal(closed, 'still-open', '合法上报后连接应保持');
  } finally {
    await h.stop();
  }
});

test('analysis_report 非法 pageUrl:拒绝、不落盘、不推 evidence、不断连', async () => {
  const h = await setup();
  try {
    const fake = await h.connectFake();
    fake.ws.send(JSON.stringify(validReport({ pageUrl: 'ftp://example.com/x' })));
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(!existsSync(h.analysisDir), '不应创建 _analysis 目录');
    assert.equal(h.evidence.calls.length, 0, '非法 payload 不应推送 evidence');

    // 连接仍然可用:随后一条合法上报应被正常处理
    fake.ws.send(JSON.stringify(validReport({ id: '01JSECONDREPORT0000000000TEST' })));
    const file2 = path.join(h.analysisDir, 'report-01JSECONDREPORT0000000000TEST.json');
    await waitFor(() => existsSync(file2), 3000, '后续合法上报落盘(连接未断)');
    assert.equal(h.evidence.calls.length, 1);
    assert.equal(h.evidence.calls[0]!.task_id, 'analysis_01JSECONDREPORT0000000000TEST');
  } finally {
    await h.stop();
  }
});

test('analysis_report metrics 非数值 / kind 非 screenshot:拒绝且不断连', async () => {
  const h = await setup();
  try {
    const fake = await h.connectFake();
    fake.ws.send(
      JSON.stringify(validReport({ metrics: { ...validReport().metrics, brightness: 'bright' } })),
    );
    fake.ws.send(JSON.stringify(validReport({ kind: 'page' })));
    fake.ws.send(
      JSON.stringify(validReport({ metrics: { ...validReport().metrics, dominantColors: 'not-array' } })),
    );
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(!existsSync(h.analysisDir), '三条非法上报都不应落盘');
    assert.equal(h.evidence.calls.length, 0);

    fake.ws.send(JSON.stringify(validReport({ id: '01JTHIRDREPORT00000000000TEST' })));
    const file3 = path.join(h.analysisDir, 'report-01JTHIRDREPORT00000000000TEST.json');
    await waitFor(() => existsSync(file3), 3000, '合法上报仍被处理(连接未断)');
  } finally {
    await h.stop();
  }
});

test('analysis_report summary 超限:截断到 500 字后再落盘/推送', async () => {
  const h = await setup();
  try {
    const fake = await h.connectFake();
    const long = '长'.repeat(620);
    fake.ws.send(JSON.stringify(validReport({ summary: long })));
    const file = path.join(h.analysisDir, 'report-01JANALYSISREPORT00000000TEST.json');
    await waitFor(() => existsSync(file), 3000, 'artifact 落盘');

    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.summary.length, 500);
    await waitFor(() => h.evidence.calls.length === 1, 3000, 'evidence 调用');
    assert.equal(h.evidence.calls[0]!.quote.length, 500);
  } finally {
    await h.stop();
  }
});

test('analysis_report evidence 推送抛错:不阻塞,artifact 仍落盘(旁路兜底)', async () => {
  const h = await setup({ evidence: mockEvidence({ throwOnSave: true }) });
  try {
    const fake = await h.connectFake();
    fake.ws.send(JSON.stringify(validReport()));
    const file = path.join(h.analysisDir, 'report-01JANALYSISREPORT00000000TEST.json');
    await waitFor(() => existsSync(file), 3000, 'artifact 落盘(evidence 失败不影响归档)');
    const taskDirs = readdirSync(h.artifactRoot);
    assert.deepEqual(taskDirs, ['_analysis'], '分析报告只进 _analysis,不产生 task 目录');
  } finally {
    await h.stop();
  }
});
