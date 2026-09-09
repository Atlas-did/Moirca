// ============================================================
// shared-types/src/mcp-tools.ts
// MCP 工具清单单一真源(CONTRACT §b)。
// daemon 注册的工具名集合必须与本清单一致(CI 漂移校验,§附)。
// ============================================================

/** browser_* 工具名(14 + 1 可选) */
export const MCP_TOOL_NAMES = [
  'browser_navigate',
  'browser_new_tab',
  'browser_close_tab',
  'browser_switch_tab',
  'browser_get_tabs',
  'browser_snapshot',
  'browser_find_in_snapshot',
  'browser_click',
  'browser_fill',
  'browser_press_key',
  'browser_scroll',
  'browser_evaluate',
  'browser_wait',
  'browser_screenshot',
  'browser_extract',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** 可选工具:默认不注册,env WEBBRIDGE_MCP_ROUTE_TOOL=on 才注册(§b.1) */
export const MCP_OPTIONAL_TOOL_NAMES = ['browser_route'] as const;
export type McpOptionalToolName = (typeof MCP_OPTIONAL_TOOL_NAMES)[number];

/** 工具名 → WS 命令名映射(find_in_snapshot / browser_route 为 daemon 本地,无 WS 命令) */
export const TOOL_TO_COMMAND: Record<string, string | null> = {
  browser_navigate: 'navigate',
  browser_new_tab: 'new_tab',
  browser_close_tab: 'close_tab',
  browser_switch_tab: 'switch_tab',
  browser_get_tabs: 'get_tabs',
  browser_snapshot: 'snapshot',
  browser_find_in_snapshot: null, // daemon 本地执行(§a.5)
  browser_click: 'click',
  browser_fill: 'fill',
  browser_press_key: 'press_key',
  browser_scroll: 'scroll',
  browser_evaluate: 'evaluate',
  browser_wait: 'wait',
  browser_screenshot: 'screenshot',
  browser_extract: 'extract',
  browser_route: null, // 调 backend POST /api/route,默认关闭(§b.1)
};

/** MCP 响应文本字符预算(§h) */
export const MCP_BUDGET = {
  SNAPSHOT_TEXT_MAX_CHARS: 25_000,
  FIND_RESULT_MAX_CHARS: 4_000,
  EXTRACT_CONTENT_MAX_CHARS: 60_000,
  MCP_RESPONSE_MAX_CHARS: 30_000,
  DIGEST_MAX_TOKENS: 2_000,
} as const;
