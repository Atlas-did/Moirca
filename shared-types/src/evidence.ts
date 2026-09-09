// ============================================================
// shared-types/src/evidence.ts
// Evidence 类型 TS 镜像(CONTRACT §c;Python 真源在 backend SQLite,
// 此处为跨端引用镜像,字段同名 snake_case 不改)。
// ============================================================

export type EvidenceChannel = 'page_qa' | 'deep_research' | 'controlled_browse' | 'manual';

export type SourceQuality = 'official' | 'authoritative' | 'community' | 'unknown';

export type LocatorType = 'css' | 'xpath' | 'text_offset' | 'ref';

export interface EvidenceLocator {
  type: LocatorType;
  value: string;
  page_index?: number;
}

/** 与 backend evidence 表(§c.1 DDL)逐字段对应 */
export interface Evidence {
  evidence_id: string; // 'ev_' + ULID(26 位,时间有序)
  channel: EvidenceChannel;
  url: string;
  title: string;
  fetched_at: string; // ISO8601 含时区,采集时刻,禁止 now() 兜底造假
  source_quality: SourceQuality;
  quote: string; // 原文引用,≤2000 字符,保留原文不清洗
  locator: string; // JSON 字符串:{type,value,page_index?}(表内为 TEXT DEFAULT '{}')
  raw_ref?: string; // 大字段旁路:'artifacts/{task_id}/{file}'(相对 daemon 根,§f)
  task_id: string;
  created_at: string;
}

/** POST /api/evidence/save 请求体(§e.4) */
export interface EvidenceSaveRequest {
  task_id?: string;
  channel: EvidenceChannel;
  url: string;
  title?: string;
  fetched_at?: string; // 可空则服务端补真实 now()
  source_quality?: SourceQuality;
  quote: string; // ≤2000
  locator?: EvidenceLocator;
  raw_ref?: string;
}

export interface EvidenceSaveResponse {
  evidence_id: string;
  created_at: string;
}

/** GET /api/evidence/query 响应(§e.4) */
export interface EvidenceQueryResponse {
  items: Evidence[];
  total: number;
}

export const EVIDENCE_LIMITS = {
  QUOTE_MAX_CHARS: 2_000,
  BATCH_SAVE_MAX_ITEMS: 50,
  QUERY_LIMIT_MAX: 100,
} as const;
