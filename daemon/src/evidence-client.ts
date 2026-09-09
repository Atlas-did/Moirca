// ============================================================
// daemon/src/evidence-client.ts —— 证据钩子(原则 4,连接 AGENT_02)
// snapshot/extract/click 完成后自动 POST /api/evidence/save。
// 默认开启;WEBBRIDGE_EVIDENCE_OFF=1 可关,WEBBRIDGE_EVIDENCE_URL 可改。
// 证据是旁路:任何失败(backend 不可达/超时)静默降级——记 error log,
// 返回 null,绝不让浏览器操作因证据环节失败中断(§g.2 AGENT_04)。
// ============================================================
import { nowIso } from './util.js';

export type EvidenceChannel = 'deep_research' | 'controlled_browse' | 'page_qa' | 'manual';

export interface EvidencePayload {
  task_id: string;
  channel: EvidenceChannel;
  url: string;
  title?: string;
  fetched_at?: string;
  source_quality?: 'official' | 'authoritative' | 'community' | 'unknown';
  /** 原文引用 ≤2000 字符,保留原文不清洗(§c.1) */
  quote: string;
  locator?: { type: 'css' | 'xpath' | 'text_offset' | 'ref'; value: string; page_index?: number };
  /** 相对形式:artifacts/{task_id}/{file}(§f) */
  raw_ref?: string;
}

const SAVE_TIMEOUT_MS = 5_000;
const QUOTE_MAX_CHARS = 2_000;

export class EvidenceClient {
  constructor(
    private url: string = process.env.WEBBRIDGE_EVIDENCE_URL ?? 'http://127.0.0.1:8000/api/evidence/save',
    private enabled: boolean = process.env.WEBBRIDGE_EVIDENCE_OFF !== '1',
    private fetchImpl: typeof fetch = fetch,
    /**
     * backend 可选鉴权 token(backend env WEBBRIDGE_API_TOKEN 开启后要求
     * X-WebBridge-Token 请求头,见 backend/app/api/auth.py)。
     * env WEBBRIDGE_BACKEND_TOKEN;留空 = backend 不鉴权(本地开发默认)。
     */
    private backendToken: string = process.env.WEBBRIDGE_BACKEND_TOKEN ?? '',
  ) {}

  /**
   * 落库一条证据。成功返回 evidence_id;失败/关闭返回 null(不抛错)。
   */
  async save(p: EvidencePayload): Promise<string | null> {
    if (!this.enabled) return null;
    const body = {
      task_id: p.task_id,
      channel: p.channel,
      url: p.url,
      title: p.title ?? '',
      fetched_at: p.fetched_at ?? nowIso(), // 真实采集时刻,禁止 now() 兜底造假——此处兜底同样是真实时刻
      source_quality: p.source_quality ?? 'unknown',
      quote: p.quote.length > QUOTE_MAX_CHARS ? p.quote.slice(0, QUOTE_MAX_CHARS) : p.quote,
      locator: p.locator ?? { type: 'css', value: 'body' },
      ...(p.raw_ref ? { raw_ref: p.raw_ref } : {}),
    };
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.backendToken) headers['x-webbridge-token'] = this.backendToken;
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`[evidence] save 失败(HTTP ${res.status}),已降级:文件旁路兜底,不阻塞主流程`);
        return null;
      }
      const json = (await res.json()) as { evidence_id?: string };
      return json.evidence_id ?? null;
    } catch (e) {
      // BACKEND_UNREACHABLE(§g.1):降级为文件旁路 + error log,不阻塞
      console.error(`[evidence] backend 不可达(BACKEND_UNREACHABLE):${(e as Error).message};文件旁路兜底`);
      return null;
    }
  }
}
