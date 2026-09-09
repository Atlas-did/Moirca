// ============================================================
// shared-types/src/ws-protocol.ts
// WS 协议(daemon ↔ extension, ws://127.0.0.1:9223)单一真源
// CONTRACT.md §a 的 TS 镜像。字段名与 CONTRACT 逐字一致,禁止漂移。
// ============================================================

import type { WsError } from './errors.js';

/** 协议版本(§附):破坏性变更必须升版本并同步 CONTRACT */
export const PROTOCOL_VERSION = 1;

/** daemon WS 监听地址(仅回环;不得使用 Chrome 远程调试默认端口所在的 922x 低位段) */
export const WS_URL_DEFAULT = 'ws://127.0.0.1:9223';

// ---------------- 握手(§a.1) ----------------

export type ExtensionMode = 'pro' | 'readonly';

/** extension → daemon,连上后必须先发;收到 welcome 前 daemon 丢弃该连接上的任何结果 */
export interface HelloMessage {
  type: 'hello';
  id: string;
  mode: ExtensionMode;
  extVersion: string;
  protocolVersion: number;
  /** 一次性配对 token(daemon 生成,popup 设置页粘贴到 chrome.storage.local.wsToken);缺失/不匹配将被 daemon 拒绝 */
  token?: string;
}

/** daemon → extension */
export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  artifactRoot: string; // /abs/path/daemon/artifacts
}

// ---------------- 命令信封(§a.2) ----------------

/** 15 条命令名(§a.2 CommandName);find_in_snapshot 为 daemon 本地执行,不下发扩展 */
export type CommandName =
  | 'navigate'
  | 'new_tab'
  | 'close_tab'
  | 'switch_tab'
  | 'get_tabs'
  | 'snapshot'
  | 'find_in_snapshot'
  | 'click'
  | 'fill'
  | 'press_key'
  | 'scroll'
  | 'evaluate'
  | 'wait'
  | 'screenshot'
  | 'extract';

/** daemon → extension */
export interface WSCommandMessage {
  type: 'command';
  id: string; // uuid v4,由 daemon 生成
  method: CommandName;
  params: Record<string, unknown>;
}

/** extension → daemon */
export interface WSResultMessage {
  type: 'result';
  id: string; // 回显
  ok: boolean;
  result?: unknown; // ok=true 时必有
  error?: WsError; // ok=false 时必有
}

/** extension → daemon,截图分析结果上报(§a.6;popup「截图分析」触发,worker 本地计算;fire-and-forget,daemon 落 artifacts+evidence 后不回执) */
export interface AnalysisReportMessage {
  type: 'analysis_report';
  id: string; // ulid 风格,由扩展生成
  kind: 'screenshot';
  capturedAt: string; // ISO8601
  pageUrl: string;
  pageTitle: string;
  metrics: {
    width: number;
    height: number;
    aspectRatio: number; // w/h
    brightness: number; // 0-1,Rec.709 加权均值
    colorfulness: number; // Hasler-Süsstrunk,0-110+ 常见
    dominantColors: Array<{ rgb: [number, number, number]; share: number }>; // 降采样聚类,最多 5 个,share 合计≈1
  };
  summary: string; // ≤500 字规则式中文摘要
}

export type WSMessage =
  | HelloMessage
  | WelcomeMessage
  | WSCommandMessage
  | WSResultMessage
  | AnalysisReportMessage; // §a.6

// ---------------- target 语义(§a.3) ----------------

export type Target = 'activeTab' | 'newTab' | `tabId:${number}`;

/** activeTab 只放行的只读命令(§a.3);其余命令带 activeTab → TARGET_DENIED */
export const ACTIVE_TAB_READONLY_COMMANDS: readonly CommandName[] = [
  'snapshot',
  'screenshot',
  'extract',
  'wait',
];

/** target 免检命令(§a.3:除 get_tabs、find_in_snapshot 外每条命令必含 target) */
export const TARGET_EXEMPT_COMMANDS: readonly CommandName[] = ['get_tabs', 'find_in_snapshot'];

// ---------------- readonly/pro 可用性矩阵(§a.4) ----------------

export interface CommandAvailability {
  pro: 'allow' | 'deny';
  readonly: 'allow' | 'deny' | 'restricted';
}

/** §a.4 矩阵的程序化镜像(extension 侧据此拒命令,daemon 侧做双保险) */
export const COMMAND_AVAILABILITY: Record<CommandName, CommandAvailability> = {
  navigate: { pro: 'allow', readonly: 'deny' },
  new_tab: { pro: 'allow', readonly: 'deny' },
  close_tab: { pro: 'allow', readonly: 'deny' },
  switch_tab: { pro: 'allow', readonly: 'deny' },
  get_tabs: { pro: 'allow', readonly: 'restricted' }, // 仅返回当前激活标签;无 tabs 权限时 url/title 置空串
  snapshot: { pro: 'allow', readonly: 'allow' }, // 语义差异:readonly 走 DOM 提取,无 ref
  find_in_snapshot: { pro: 'allow', readonly: 'deny' },
  click: { pro: 'allow', readonly: 'deny' },
  fill: { pro: 'allow', readonly: 'deny' },
  press_key: { pro: 'allow', readonly: 'deny' },
  scroll: { pro: 'allow', readonly: 'deny' },
  evaluate: { pro: 'allow', readonly: 'deny' },
  wait: { pro: 'allow', readonly: 'restricted' }, // readonly 仅支持 until='time'
  screenshot: { pro: 'allow', readonly: 'restricted' }, // 仅 activeTab + captureVisibleTab + PNG
  extract: { pro: 'allow', readonly: 'allow' }, // readonly:content script DOM 克隆
};

// ---------------- 各命令 params/result(§a.5) ----------------

export interface NavigateParams {
  target: 'newTab' | `tabId:${number}`; // activeTab 被拒
  url: string; // 必须 http(s):// 开头
  waitUntil?: 'load' | 'domcontentloaded' | 'none'; // 默认 'load'
  timeoutMs?: number; // 默认 15000,超时 NAV_TIMEOUT
}
export interface NavigateResult {
  ok: true;
  tabId: number;
  url: string;
  finalUrl: string;
}

export interface NewTabParams {
  url?: string; // 后台打开,active 恒为 false
}
export interface NewTabResult {
  ok: true;
  tabId: number;
  url: string;
}

export interface CloseTabParams {
  target: `tabId:${number}` | 'newTab';
}
export interface CloseTabResult {
  ok: true;
  closed: boolean;
}

export interface SwitchTabParams {
  target: `tabId:${number}`; // 仅托管标签
}
export interface SwitchTabResult {
  ok: true;
  tabId: number;
}

export interface GetTabsParams {}
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
  managed: boolean;
}
export interface GetTabsResult {
  ok: true;
  tabs: TabInfo[];
}

export interface SnapshotParams {
  target: Target; // readonly 恒为 activeTab
  level?: 'compact' | 'full'; // 默认 compact:仅可交互元素+标题层级
  maxChars?: number; // 默认 25_000,硬上限
  refs?: boolean; // 默认 true;readonly 恒为 false
}
export interface RefEntry {
  ref: string; // 'e12' 自增短 ref(对齐 chrome-devtools-mcp 语义)
  role: string;
  name: string;
  backendDOMNodeId?: number; // pro only
  tag?: string;
  rect?: { x: number; y: number; w: number; h: number }; // readonly 由 getBoundingClientRect
}
export interface SnapshotResult {
  ok: true;
  tabId: number;
  url: string;
  title: string;
  snapshotId: string; // `snap_{tabId}_{seq}`;daemon 侧索引,60s 过期
  text: string; // ≤maxChars;超限截断
  totalChars: number;
  truncated: boolean;
  fileRef?: string; // truncated=true 时必有(§f,daemon 落盘后回填)
  refs?: RefEntry[]; // pro 且 refs=true
  // 注意:digest 由 daemon(MCP 层)生成,WS result 不携带(§a.5/PHASE1_REVIEW 裁决 3)
}

export interface FindInSnapshotParams {
  snapshotId: string;
  query: { text?: string; role?: string; regex?: string }; // 至少一项;多条件为 AND
  limit?: number; // 默认 20,硬上限 50
}
export interface FindMatch {
  ref: string;
  role: string;
  name: string;
  context: string; // 命中行 ±1 行,≤200 字符
}
export interface FindInSnapshotResult {
  ok: true;
  matches: FindMatch[];
  truncated: boolean;
}

export interface ClickParams {
  target?: Target; // 默认 'newTab'(即当前 task 标签)
  ref?: string; // 与 selector 二选一,ref 优先
  selector?: string;
  expectNavigation?: boolean; // true 时等 load(默认 10s),否则 300ms 稳定即返
}
export interface ClickResult {
  ok: true;
  tabId: number;
  url: string;
  clicked: { role?: string; text?: string };
}

export interface FillParams {
  target?: Target;
  ref?: string;
  selector?: string;
  value: string; // ≤10,000 字符
  secret?: boolean; // true:结果与错误信息中不回显 value
  pressEnter?: boolean; // 填后是否补 Enter(搜索框场景)
}
export interface FillResult {
  ok: true;
  tabId: number;
  url: string;
  mode: 'value' | 'contenteditable';
}

export interface PressKeyParams {
  target?: Target;
  key: string; // 'Enter'|'Tab'|...|单字符;组合用 '+':'Control+A','Shift+Enter'
  ref?: string;
}
export interface PressKeyResult {
  ok: true;
  tabId: number;
  url: string;
}

export interface ScrollParams {
  target?: Target;
  direction: 'up' | 'down' | 'top' | 'bottom';
  amountPx?: number; // 默认 500;top/bottom 忽略此参
}
export interface ScrollResult {
  ok: true;
  tabId: number;
  url: string;
  scrollY: number;
}

export interface EvaluateParams {
  target?: Target;
  expression: string; // MAIN world,返回值须 JSON 可序列化,≤100KB
}
export interface EvaluateResult {
  ok: true;
  tabId: number;
  url: string;
  value: unknown;
}

export interface WaitParams {
  target?: Target;
  until?: 'time' | 'selector' | 'networkidle'; // 默认 'time';readonly 仅 'time'
  ms?: number; // time:默认 1000,上限 10_000
  selector?: string; // selector 模式必填,超时 15s → CMD_TIMEOUT
  timeoutMs?: number; // 上限 30_000
}
export interface WaitResult {
  ok: true;
  tabId: number;
  url: string;
  waitedMs: number;
}

export interface ScreenshotParams {
  target?: Target; // readonly:恒 activeTab 且仅 png
  format?: 'png' | 'jpeg'; // 默认 png
  quality?: number; // jpeg 0-100,默认 80
  fullPage?: boolean; // 默认 false,pro only
}
export interface ScreenshotResult {
  ok: true;
  tabId: number;
  url: string;
  image: string; // base64(不带 data: 前缀)
  width: number;
  height: number;
  fileRef: string; // 同步落盘 artifacts/{task_id}/screenshot-*.png(§f,daemon 回填)
}

export interface ExtractParams {
  target?: Target;
  format?: 'markdown' | 'schema'; // 默认 markdown
  schema?: Record<string, unknown>; // format='schema' 时必填:JSON Schema
  selector?: string; // 限定抽取根,默认 document
  maxChars?: number; // 默认 60_000,超出截断+fileRef
}
export interface ExtractResult {
  ok: true;
  tabId: number;
  url: string;
  title: string;
  content: string; // markdown:readability 正文;schema:JSON 字符串
  data?: unknown; // format='schema' 时:抽取结果对象
  totalChars: number;
  truncated: boolean;
  fileRef?: string; // truncated 或 >25k 时必有(daemon 回填)
  evidenceId?: string; // daemon 自动落库后回填(§c.3)
}
