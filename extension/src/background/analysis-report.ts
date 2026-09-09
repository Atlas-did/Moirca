// 截图分析编排(§a.6 analysis_report):
// - analyzeCurrentPage:复用 commands/screenshot.ts 的截图管线(activeTab + PNG)拿 base64/宽高,
//   本地 computePngMetrics 统计像素指标,组装 AnalysisReportMessage(图像 base64 不进 report,隐私红线)
// - sendAnalysisReport:经 WsConnection.sendReport 上报 daemon(fire-and-forget,不回执)
// - handleAnalyzeRequest:popup → service worker 消息分支的共享实现(popup 发 {kind:'wb_analyze_screenshot'}),
//   返回 true 表示异步 respond(保持 chrome.runtime 消息通道开放)
import type { AnalysisReportMessage } from '@webbridge/shared-types';
import type { CommandDeps } from './deps.js';
import { screenshot } from './commands/screenshot.js';
import { computePngMetrics, type PngDecoder, type PngMetrics } from './png-metrics.js';

/** WsConnection 的最小上报面(单测可用桩) */
export interface ReportSender {
  sendReport(msg: AnalysisReportMessage): boolean;
}

export interface AnalysisPageContext {
  deps: Omit<CommandDeps, 'commandId'>;
  /** 测试可注入解码桩;缺省用 OffscreenCanvas 真解码 */
  decode?: PngDecoder;
}

export interface AnalyzeResponse {
  ok: true;
  metrics: PngMetrics;
  summary: string;
  reported: boolean;
}

// ---------- 展示辅助(summary 模板与 popup 色块共用,纯函数) ----------

export function brightnessLabel(brightness: number): '明亮' | '亮度适中' | '偏暗' {
  if (brightness >= 0.6) return '明亮';
  if (brightness >= 0.3) return '亮度适中';
  return '偏暗';
}

export function colorfulnessLabel(colorfulness: number): '低' | '中' | '高' {
  if (colorfulness < 15) return '低';
  if (colorfulness < 45) return '中';
  return '高';
}

export function rgbToHex(rgb: [number, number, number]): string {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** 规则式中文摘要(≤500 字;模板:『{w}×{h}(宽高比{ar}),{亮度描述}画面,彩色度{低/中/高};主色 #hex×N。…』) */
export function buildSummary(metrics: PngMetrics, topN = 3): string {
  const ar = Math.round(metrics.aspectRatio * 100) / 100;
  const colors = metrics.dominantColors.slice(0, topN).map((c) => `#${rgbToHex(c.rgb)}`);
  const listed = colors.length;
  return (
    `${metrics.width}×${metrics.height}(宽高比${ar}),` +
    `${brightnessLabel(metrics.brightness)}画面,彩色度${colorfulnessLabel(metrics.colorfulness)};` +
    `主色 ${colors.join('、')}×${listed}。截图只供人复核,禁止作为动作依据。`
  );
}

// ---------- 编排 ----------

function shortId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 截当前活动标签 → 本地像素统计 → AnalysisReportMessage(不含图像数据) */
export async function analyzeCurrentPage(ctx: AnalysisPageContext): Promise<AnalysisReportMessage> {
  const deps: CommandDeps = { ...ctx.deps, commandId: shortId('an') };
  const shot = await screenshot(deps, { target: 'activeTab', format: 'png' });
  const px = await computePngMetrics(shot.image, ctx.decode);
  let pageTitle = '';
  try {
    pageTitle = (await deps.tabs.get(shot.tabId)).title ?? '';
  } catch {
    pageTitle = '';
  }
  const metrics: PngMetrics = {
    width: shot.width || px.width,
    height: shot.height || px.height,
    aspectRatio: px.aspectRatio,
    brightness: px.brightness,
    colorfulness: px.colorfulness,
    dominantColors: px.dominantColors,
  };
  return {
    type: 'analysis_report',
    id: shortId('ar'),
    kind: 'screenshot',
    capturedAt: new Date().toISOString(),
    pageUrl: shot.url,
    pageTitle,
    metrics,
    summary: buildSummary(metrics),
  };
}

/** 经既有 WS 连接上报 daemon(welcome 后 socket OPEN 才真发;fire-and-forget) */
export function sendAnalysisReport(conn: ReportSender, msg: AnalysisReportMessage): boolean {
  return conn.sendReport(msg);
}

export type AnalyzeDeps = AnalysisPageContext & { connection: ReportSender };

/**
 * popup 消息分支(popup 发 {kind:'wb_analyze_screenshot'}):
 * 命中 → 返回 true(异步 respond),结果经 respond 回 popup;
 * 未命中 → 返回 false 且不 respond(交给其他监听者)。
 */
export function handleAnalyzeRequest(
  msg: unknown,
  ctx: AnalyzeDeps,
  respond: (res: AnalyzeResponse | { ok: false; error: string; code?: string }) => void,
): boolean {
  const kind = (msg as { kind?: string } | null | undefined)?.kind;
  if (kind !== 'wb_analyze_screenshot') return false;
  void (async () => {
    try {
      const report = await analyzeCurrentPage(ctx);
      const reported = sendAnalysisReport(ctx.connection, report);
      respond({ ok: true, metrics: report.metrics, summary: report.summary, reported });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const code = typeof err?.code === 'string' ? err.code : undefined;
      respond({ ok: false, error: err?.message ?? String(e), ...(code ? { code } : {}) });
    }
  })();
  return true;
}
