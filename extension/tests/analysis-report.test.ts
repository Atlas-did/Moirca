// analysis-report 编排单测(§a.6):
// - buildSummary 中文模板 / 亮度·彩色度分档
// - analyzeCurrentPage:复用 pro screenshot 管线(mock CDP)+ 注入解码桩 → AnalysisReportMessage
//   (隐私红线:report 不携带图像 base64)
// - sendAnalysisReport:未 welcome(连接桩 sendReport=false)返回 false 且不上报
// - handleAnalyzeRequest:popup 消息分支命中/未命中/错误路径
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCurrentPage,
  buildSummary,
  brightnessLabel,
  colorfulnessLabel,
  handleAnalyzeRequest,
  rgbToHex,
  sendAnalysisReport,
  type AnalyzeResponse,
  type ReportSender,
} from '../src/background/analysis-report.js';
import { TargetResolver } from '../src/background/target-resolver.js';
import { ManagedTabs } from '../src/background/managed-tabs.js';
import { SnapshotStore } from '../src/background/snapshot-store.js';
import type { CommandDeps } from '../src/background/deps.js';
import type { TabLike, TabsAdapterLike } from '../src/background/tabs-adapter.js';
import type { DebuggerAdapter } from '../src/background/cdp-controller.js';
import type { AnalysisReportMessage } from '@webbridge/shared-types';
import type { ImageDataLike } from '../src/background/png-metrics.js';
import { BridgeError } from '../src/background/bridge-error.js';

class MockTabs implements TabsAdapterLike {
  rows: TabLike[] = [{ id: 1, url: 'https://user.example/page', title: '用户页', active: true }];
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

/** CDP 桩:Page.captureScreenshot 返回占位 base64(解码走注入桩,内容不参与统计) */
class MockScreenshotDebugger implements DebuggerAdapter {
  failCapture = false;
  async attach(): Promise<void> {}
  async detach(): Promise<void> {}
  async sendCommand(_target: { tabId: number }, method: string): Promise<unknown> {
    if (method === 'Page.captureScreenshot') {
      if (this.failCapture) throw new BridgeError('PERMISSION_DENIED', 'captureScreenshot 失败(mock)');
      return { data: 'c2hvdA==' };
    }
    if (method === 'Page.getLayoutMetrics') {
      return { cssViewport: { clientWidth: 1280, clientHeight: 800 } };
    }
    return {};
  }
}

/** 2×2 白图桩(亮度 1、彩色度 0、单一主色) */
function whiteImage(): ImageDataLike {
  return { width: 2, height: 2, data: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]) };
}

/** WsConnection 上报桩 */
class MockConn implements ReportSender {
  welcome = false;
  sent: AnalysisReportMessage[] = [];
  sendReport(msg: AnalysisReportMessage): boolean {
    if (!this.welcome) return false;
    this.sent.push(msg);
    return true;
  }
}

describe('summary 模板与分档(纯函数)', () => {
  test('brightnessLabel / colorfulnessLabel 分档', () => {
    assert.equal(brightnessLabel(0.9), '明亮');
    assert.equal(brightnessLabel(0.6), '明亮');
    assert.equal(brightnessLabel(0.5), '亮度适中');
    assert.equal(brightnessLabel(0.3), '亮度适中');
    assert.equal(brightnessLabel(0.1), '偏暗');
    assert.equal(colorfulnessLabel(0), '低');
    assert.equal(colorfulnessLabel(14.9), '低');
    assert.equal(colorfulnessLabel(15), '中');
    assert.equal(colorfulnessLabel(44.9), '中');
    assert.equal(colorfulnessLabel(45), '高');
  });

  test('rgbToHex 输出 6 位小写 hex 并夹取 0-255', () => {
    assert.equal(rgbToHex([255, 0, 16]), 'ff0010');
    assert.equal(rgbToHex([0, 128, 255]), '0080ff');
    assert.equal(rgbToHex([300, -5, 1.6]), 'ff0002');
  });

  test('buildSummary 模板:尺寸/宽高比/亮度/彩色度/主色×N/红线句', () => {
    const summary = buildSummary({
      width: 1280,
      height: 800,
      aspectRatio: 1.6,
      brightness: 0.65,
      colorfulness: 20,
      dominantColors: [
        { rgb: [255, 255, 255], share: 0.7 },
        { rgb: [37, 99, 235], share: 0.2 },
        { rgb: [6, 182, 212], share: 0.1 },
      ],
    });
    assert.match(summary, /^1280×800\(宽高比1\.6\),明亮画面,彩色度中;/);
    assert.match(summary, /主色 #ffffff、#2563eb、#06b6d4×3。/);
    assert.match(summary, /截图只供人复核,禁止作为动作依据。$/);
    assert.ok(summary.length <= 500, 'summary 必须 ≤500 字');
  });

  test('buildSummary 只列 top3 主色且 ×N 与实际列数一致', () => {
    const summary = buildSummary({
      width: 100,
      height: 100,
      aspectRatio: 1,
      brightness: 0.5,
      colorfulness: 5,
      dominantColors: [
        { rgb: [1, 2, 3], share: 0.4 },
        { rgb: [4, 5, 6], share: 0.3 },
        { rgb: [7, 8, 9], share: 0.2 },
        { rgb: [10, 11, 12], share: 0.1 },
      ],
    });
    assert.match(summary, /主色 #010203、#040506、#070809×3。/);
    assert.ok(!summary.includes('#0a0b0c'));
  });
});

describe('analyzeCurrentPage(pro 截图管线 + 注入解码桩)', () => {
  let tabs: MockTabs;
  let dbg: MockScreenshotDebugger;
  let conn: MockConn;
  let deps: Omit<CommandDeps, 'commandId'>;

  beforeEach(() => {
    tabs = new MockTabs();
    dbg = new MockScreenshotDebugger();
    conn = new MockConn();
    const managed = new ManagedTabs();
    managed.register(1);
    deps = {
      mode: 'pro',
      tabs,
      resolver: new TargetResolver(tabs, managed),
      cdp: dbg as never,
      scripting: null,
      managed,
      snapshots: new SnapshotStore(),
    };
  });

  test('组装 AnalysisReportMessage:契约字段齐全、指标来自截图管线与像素统计', async () => {
    const msg = await analyzeCurrentPage({ deps, decode: async () => whiteImage() });
    assert.equal(msg.type, 'analysis_report');
    assert.equal(msg.kind, 'screenshot');
    assert.ok(!Number.isNaN(Date.parse(msg.capturedAt)), 'capturedAt 必须是 ISO 时间');
    assert.equal(msg.pageUrl, 'https://user.example/page');
    assert.equal(msg.pageTitle, '用户页');
    // 截图 PNG 头无法解析时回退 Page.getLayoutMetrics 尺寸
    assert.equal(msg.metrics.width, 1280);
    assert.equal(msg.metrics.height, 800);
    assert.equal(msg.metrics.brightness, 1);
    assert.equal(msg.metrics.colorfulness, 0);
    assert.deepEqual(msg.metrics.dominantColors[0].rgb, [255, 255, 255]);
    assert.ok(msg.id.length > 0);
    assert.ok(msg.summary.includes('1280×800'));
    assert.ok(msg.summary.includes('截图只供人复核'));
  });

  test('隐私红线:report 全文(含 JSON 序列化)不含图像 base64', async () => {
    const msg = await analyzeCurrentPage({ deps, decode: async () => whiteImage() });
    const json = JSON.stringify(msg);
    assert.ok(!json.includes('image'), 'report 不得携带 image 字段');
    assert.ok(!json.includes('c2hvdA=='), 'report 不得泄漏截图 base64');
    assert.ok(json.length < 2000, `report 应远小于图像体积,实际 ${json.length} 字节`);
  });

  test('截图失败 → 抛 BridgeError(错误码原样上抛给 popup 分支)', async () => {
    dbg.failCapture = true;
    await assert.rejects(
      analyzeCurrentPage({ deps, decode: async () => whiteImage() }),
      (e: unknown) => e instanceof BridgeError,
    );
  });
});

describe('sendAnalysisReport / handleAnalyzeRequest(popup 消息分支)', () => {
  let tabs: MockTabs;
  let dbg: MockScreenshotDebugger;
  let conn: MockConn;
  let deps: Omit<CommandDeps, 'commandId'>;

  beforeEach(() => {
    tabs = new MockTabs();
    dbg = new MockScreenshotDebugger();
    conn = new MockConn();
    const managed = new ManagedTabs();
    managed.register(1);
    deps = {
      mode: 'pro',
      tabs,
      resolver: new TargetResolver(tabs, managed),
      cdp: dbg as never,
      scripting: null,
      managed,
      snapshots: new SnapshotStore(),
    };
  });

  test('未 welcome(未连 daemon)时 sendAnalysisReport 返回 false 且不发送', () => {
    const msg: AnalysisReportMessage = {
      type: 'analysis_report',
      id: 'ar_test',
      kind: 'screenshot',
      capturedAt: new Date().toISOString(),
      pageUrl: 'https://x.example/',
      pageTitle: 'x',
      metrics: { width: 1, height: 1, aspectRatio: 1, brightness: 1, colorfulness: 0, dominantColors: [] },
      summary: 'ok',
    };
    assert.equal(conn.welcome, false);
    assert.equal(sendAnalysisReport(conn, msg), false);
    assert.equal(conn.sent.length, 0);
    conn.welcome = true;
    assert.equal(sendAnalysisReport(conn, msg), true);
    assert.equal(conn.sent.length, 1);
    assert.deepEqual(conn.sent[0], msg);
  });

  test('handleAnalyzeRequest:非目标 kind 返回 false 且不 respond', async () => {
    let responded = 0;
    const r = handleAnalyzeRequest({ kind: 'other' }, { deps, connection: conn }, () => {
      responded++;
    });
    assert.equal(r, false);
    await new Promise((r2) => setTimeout(r2, 10));
    assert.equal(responded, 0);
  });

  test('handleAnalyzeRequest:命中 kind → 异步 respond ok=true,reported 随 welcome 状态', async () => {
    const box1: { res: AnalyzeResponse | { ok: false; error: string } | null } = { res: null };
    const r = handleAnalyzeRequest(
      { kind: 'wb_analyze_screenshot' },
      { deps, decode: async () => whiteImage(), connection: conn },
      (res) => {
        box1.res = res;
      },
    );
    assert.equal(r, true, '必须返回 true 保持消息通道开放');
    await new Promise((r2) => setTimeout(r2, 20));
    assert.ok(box1.res, '异步 respond 必须被调用');
    const res = box1.res as AnalyzeResponse;
    assert.equal(res.ok, true);
    assert.equal(res.reported, false, '未连 daemon → reported=false');
    assert.equal(res.metrics.brightness, 1);
    assert.ok(res.summary.length > 0);
    assert.equal(conn.sent.length, 0);
  });

  test('handleAnalyzeRequest:welcome 后 reported=true 且报告入站 conn', async () => {
    conn.welcome = true;
    const box2: { res: AnalyzeResponse | { ok: false; error: string } | null } = { res: null };
    handleAnalyzeRequest(
      { kind: 'wb_analyze_screenshot' },
      { deps, decode: async () => whiteImage(), connection: conn },
      (res) => {
        box2.res = res;
      },
    );
    await new Promise((r2) => setTimeout(r2, 20));
    assert.ok(box2.res);
    const res = box2.res as AnalyzeResponse;
    assert.equal(res.ok, true);
    assert.equal(res.reported, true);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0].type, 'analysis_report');
    assert.ok(!JSON.stringify(conn.sent[0]).includes('c2hvdA=='), '上报内容不含截图数据');
  });

  test('handleAnalyzeRequest:分析抛错 → respond {ok:false, error, code}', async () => {
    dbg.failCapture = true;
    const box3: { res: { ok: boolean; error?: string; code?: string } | null } = { res: null };
    handleAnalyzeRequest(
      { kind: 'wb_analyze_screenshot' },
      { deps, decode: async () => whiteImage(), connection: conn },
      (res) => {
        box3.res = res as { ok: boolean; error?: string; code?: string };
      },
    );
    await new Promise((r2) => setTimeout(r2, 20));
    assert.ok(box3.res);
    assert.equal(box3.res?.ok, false);
    assert.ok((box3.res?.error ?? '').length > 0);
    assert.equal(box3.res?.code, 'PERMISSION_DENIED');
    assert.equal(conn.sent.length, 0);
  });
});
