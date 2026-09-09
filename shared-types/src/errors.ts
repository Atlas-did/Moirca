// ============================================================
// shared-types/src/errors.ts
// 错误码单一真源 —— CONTRACT.md §错误模型 的 TS 镜像。
// 全模块(extension/daemon/backend)不得自行发明错误码。
// CI(AGENT_07)校验本表与 CONTRACT §g.1 一致。
// ============================================================

/** 错误码字符串形式(§g.1 code 列) */
export type ErrorCode =
  | 'PARSE_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_COMMAND'
  | 'INVALID_PARAMS'
  | 'EXT_NOT_CONNECTED'
  | 'CMD_TIMEOUT'
  | 'NAV_TIMEOUT'
  | 'PERMISSION_DENIED'
  | 'READONLY_REJECTED'
  | 'TARGET_DENIED'
  | 'REF_STALE'
  | 'TAB_CLOSED'
  | 'EXTRACT_FAILED'
  // 以下为 HTTP 侧语义码(不出现在 WS num 区间)
  | 'ROUTE_NO_MATCH'
  | 'EVIDENCE_DB_FAIL'
  | 'EVIDENCE_NOT_FOUND'
  | 'REPORT_NOT_FOUND'
  | 'API_TOKEN_REQUIRED'
  | 'BACKEND_UNREACHABLE';

/** code → num 映射(WS/JSON-RPC 负数区间;HTTP-only 的码为 null) */
export const ERROR_NUM: Record<ErrorCode, number | null> = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  UNKNOWN_COMMAND: -32601,
  INVALID_PARAMS: -32602,
  EXT_NOT_CONNECTED: -32000,
  CMD_TIMEOUT: -32001,
  NAV_TIMEOUT: -32002,
  PERMISSION_DENIED: -32003,
  READONLY_REJECTED: -32004,
  TARGET_DENIED: -32005,
  REF_STALE: -32006,
  TAB_CLOSED: -32007,
  EXTRACT_FAILED: -32008,
  ROUTE_NO_MATCH: null, // 不是错误:label=null(200)
  EVIDENCE_DB_FAIL: null, // HTTP 500
  EVIDENCE_NOT_FOUND: null, // HTTP 404(AGENT_07 补录)
  REPORT_NOT_FOUND: null, // HTTP 404(AGENT_07 补录)
  API_TOKEN_REQUIRED: null, // HTTP 401,可选鉴权开启时(AGENT_07 补录)
  BACKEND_UNREACHABLE: null, // HTTP 503
};

/** 结构化错误体(daemon ↔ extension WS;HTTP 侧镜像同构) */
export interface WsError {
  code: ErrorCode;
  num: number; // 对应负数区间码;HTTP-only 码为 0
  message: string; // 人读,中文
  data?: Record<string, unknown>;
}

/** HTTP-only 码在 num 字段上的约定值(不参与 JSON-RPC 区间) */
export const HTTP_ONLY_NUM = 0;

/** 快捷构造器(唯一允许的 WsError 组装点,保证 code/num 永不漂移) */
export function makeError(code: ErrorCode, message: string, data?: Record<string, unknown>): WsError {
  const num = ERROR_NUM[code];
  return { code, num: num === null || num === undefined ? HTTP_ONLY_NUM : num, message, ...(data ? { data } : {}) };
}
