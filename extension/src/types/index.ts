// WebBridge 共享类型定义
// Extension 和 Daemon 共用此文件

// ============ JSON-RPC 消息格式 ============

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============ 命令定义 ============

export type CommandName =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'snapshot'
  | 'screenshot'
  | 'scroll'
  | 'evaluate'
  | 'get_tabs'
  | 'switch_tab';

// --- navigate ---
export interface NavigateParams {
  url: string;
  newTab?: boolean;
}

export interface NavigateResult {
  success: boolean;
  tabId: number;
  url: string;
}

// --- click ---
export interface ClickParams {
  selector?: string;
  ref?: string;  // @ref 格式，来自 snapshot
}

export interface ClickResult {
  success: boolean;
  tag?: string;
  text?: string;
}

// --- fill ---
export interface FillParams {
  selector?: string;
  ref?: string;
  value: string;
}

export interface FillResult {
  success: boolean;
  tag?: string;
  mode?: 'value' | 'contenteditable';
}

// --- snapshot ---
export interface SnapshotParams {
  refs?: boolean;  // 是否返回 ref 映射
}

export interface SnapshotResult {
  success: boolean;
  text: string;        // 可读的页面文本
  refs?: Record<string, { backendDOMNodeId: number }>;  // ref → DOM node 映射
  title?: string;
  url?: string;
}

// --- screenshot ---
export interface ScreenshotParams {
  format?: 'png' | 'jpeg';
  quality?: number;  // jpeg only, 0-100
}

export interface ScreenshotResult {
  success: boolean;
  image: string;  // base64 encoded
  width: number;
  height: number;
}

// --- scroll ---
export interface ScrollParams {
  direction: 'up' | 'down' | 'top' | 'bottom';
  amount?: number;  // pixels, default 500
}

export interface ScrollResult {
  success: boolean;
  scrollY: number;
}

// --- evaluate ---
export interface EvaluateParams {
  expression: string;
}

export interface EvaluateResult {
  success: boolean;
  value: unknown;
}

// --- get_tabs ---
export interface GetTabsResult {
  tabs: Array<{
    id: number;
    title: string;
    url: string;
    active: boolean;
  }>;
}

// --- switch_tab ---
export interface SwitchTabParams {
  tabId: number;
}

export interface SwitchTabResult {
  success: boolean;
}

// ============ WebSocket 消息 ============

export interface WSCommandMessage {
  type: 'command';
  id: string;
  method: CommandName;
  params?: Record<string, unknown>;
}

export interface WSResultMessage {
  type: 'result';
  id: string;
  result?: unknown;
  error?: string;
}

export type WSMessage = WSCommandMessage | WSResultMessage;

// ============ MCP Tool 定义 ============

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
