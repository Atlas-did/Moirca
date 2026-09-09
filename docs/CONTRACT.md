# WebBridge 接口契约(CONTRACT)

> 版本:v1.0(2026-09-06,AGENT_00 撰写)
> 效力:**本文件是唯一接口真源**。AGENT_01–07 必须按此实现,不得自行发明字段/命令/错误码。
> 配套:`docs/ARCHITECTURE.md`(结构与文件归属)。类型真源:`shared-types/src/*.ts`(内容必须与本文一致)。
> 端口约定:daemon WS Server = **ws://127.0.0.1:9223**;backend HTTP = http://127.0.0.1:8000。全仓库禁止用 9222 作为 WebBridge 端口。

---

## §a WS 协议(daemon ↔ extension,9223)

### a.1 传输与握手

- daemon 监听 `ws://127.0.0.1:9223`(仅回环);扩展 service worker 主动连接。
- 扩展连上后**必须先发 hello**,收到 welcome 前 daemon 丢弃该连接上的任何 command 结果:

```jsonc
// extension → daemon
{ "type": "hello", "id": "h1", "mode": "pro" | "readonly",
  "extVersion": "1.0.0", "protocolVersion": 1 }
// daemon → extension
{ "type": "welcome", "protocolVersion": 1,
  "artifactRoot": "/abs/path/daemon/artifacts" }
```

- `protocolVersion` 不匹配时扩展断开并停止重连(指数退避 3s→30s)。
- 扩展断开时,daemon 拒绝所有 in-flight 命令:`EXT_NOT_CONNECTED`。

### a.2 消息信封(沿用现有 `{type,id,method,params}` 格式)

```ts
// shared-types/src/ws-protocol.ts —— 单一真源,extension/daemon 均 import
interface WSCommandMessage {   // daemon → extension
  type: 'command';
  id: string;                  // uuid v4,由 daemon 生成
  method: CommandName;
  params: Record<string, unknown>;
}
interface WSResultMessage {    // extension → daemon
  type: 'result';
  id: string;                  // 回显
  ok: boolean;
  result?: unknown;            // ok=true 时必有,结构见各命令
  error?: WsError;             // ok=false 时必有
}
interface WsError {
  code: ErrorCode;             // §错误模型 的字符串码
  num: number;                 // 对应负数区间码
  message: string;             // 人读,中文
  data?: Record<string, unknown>;
}
type CommandName =
  | 'navigate' | 'new_tab' | 'close_tab' | 'switch_tab' | 'get_tabs'
  | 'snapshot' | 'find_in_snapshot' | 'click' | 'fill' | 'press_key'
  | 'scroll' | 'evaluate' | 'wait' | 'screenshot' | 'extract';
```

- 消息类型全集:`hello` / `welcome`(§a.1)、`command` / `result`(§a.2)、`analysis_report`(§a.6,扩展→daemon 单向 fire-and-forget 上报,**不走** command/result 信封)。

### a.3 target 目标选择(原则 1 的强制点)

除 `get_tabs`、`find_in_snapshot` 外,每条命令 params 必含:

```ts
target: 'activeTab' | 'newTab' | `tabId:${number}`;
```

解析规则(扩展侧执行,daemon 侧校验):

- `activeTab`:用户当前聚焦标签。**只允许只读命令**:`snapshot` / `screenshot` / `extract` / `wait`。其他命令带 `activeTab` 一律返回 `TARGET_DENIED`。
- `newTab`:新建后台专用标签(或复用本会话已建的 task 标签)。所有写命令的默认值。
- `tabId:N`:仅允许定位 **daemon 会话内创建过的标签**(扩展维护 managed-tab 集合;未托管 → `TARGET_DENIED`)。
- readonly 模式叠加 §a.4 矩阵,冲突时先判 readonly(`READONLY_REJECTED`),再判 target(`TARGET_DENIED`)。

### a.4 readonly / pro 命令可用性矩阵

| 命令 | pro | readonly | readonly 语义说明 |
|------|-----|----------|-------------------|
| navigate | ✅ | ❌ READONLY_REJECTED | readonly 不导航 |
| new_tab | ✅ | ❌ | |
| close_tab | ✅ | ❌ | |
| switch_tab | ✅ | ❌ | |
| get_tabs | ✅ | ⚠️ 受限 | 仅返回当前激活标签;无 tabs 权限时 url/title 置空串 |
| snapshot | ✅ | ✅ | **语义差异见 §a.5**(snapshot 段) |
| find_in_snapshot | ✅ | ❌ | readonly 快照无 ref,无 find 意义 |
| click | ✅ | ❌ | |
| fill | ✅ | ❌ | |
| press_key | ✅ | ❌ | |
| scroll | ✅ | ❌ | 只读模式不改变页面视口 |
| evaluate | ✅ | ❌ | |
| wait | ✅ | ✅ | 纯延时/等元素出现(readonly 仅支持 time) |
| screenshot | ✅ | ⚠️ | 仅 activeTab、`captureVisibleTab`、PNG;需 activeTab 已授权 |
| extract | ✅ | ✅ | pro:CDP 取 DOM;readonly:content script DOM 克隆 → readability |

### a.5 命令逐条 schema

通用约定:所有 result 含 `ok:true, tabId:number, url:string`(get_tabs/find_in_snapshot 除外)。超时默认:命令级 WS 等待 30,000ms;命令内部各自有更短的业务超时,先到者先报错。

```ts
// ---- navigate(pro)----
interface NavigateParams {
  target: 'newTab' | `tabId:${number}`;        // activeTab 被拒
  url: string;                                  // 必须 http(s):// 开头
  waitUntil?: 'load' | 'domcontentloaded' | 'none';  // 默认 'load'
  timeoutMs?: number;                           // 默认 15000,超时 NAV_TIMEOUT
}
interface NavigateResult { ok: true; tabId: number; url: string; finalUrl: string; }

// ---- new_tab(pro)----
interface NewTabParams { url?: string; }        // 后台打开,active 恒为 false
interface NewTabResult { ok: true; tabId: number; url: string; }

// ---- close_tab(pro)----
interface CloseTabParams { target: `tabId:${number}` | 'newTab'; }
interface CloseTabResult { ok: true; closed: boolean; }

// ---- switch_tab(pro)----
interface SwitchTabParams { target: `tabId:${number}`; }   // 仅托管标签
interface SwitchTabResult { ok: true; tabId: number; }

// ---- get_tabs ----
interface GetTabsParams {}
interface TabInfo { id: number; title: string; url: string; active: boolean; managed: boolean; }
interface GetTabsResult { ok: true; tabs: TabInfo[]; }     // readonly: 仅 active 一条

// ---- snapshot(核心,双模式)----
interface SnapshotParams {
  target: Target;                 // readonly 恒为 activeTab
  level?: 'compact' | 'full';     // 默认 compact:仅可交互元素+标题层级
  maxChars?: number;              // 默认 25_000,硬上限
  refs?: boolean;                 // 默认 true;readonly 恒为 false
}
interface RefEntry {
  ref: string;                    // 'e12' 自增短 ref(对齐 chrome-devtools-mcp 语义)
  role: string;                   // AX role:'link'|'button'|'textbox'|'heading'|...
  name: string;                   // 可读名
  backendDOMNodeId?: number;      // pro only
  tag?: string; rect?: { x: number; y: number; w: number; h: number };  // readonly 由 getBoundingClientRect
}
interface SnapshotResult {
  ok: true; tabId: number; url: string; title: string;
  snapshotId: string;             // `snap_{tabId}_{seq}`,daemon 侧索引,60s 过期
  text: string;                   // ≤maxChars;超限截断
  totalChars: number; truncated: boolean;
  fileRef?: string;               // truncated=true 时必有(§f)
  refs?: RefEntry[];              // pro 且 refs=true
  digest: string;                 // ≤2k token 浓缩摘录(daemon 侧生成后随 result 下发?否——见下)
}
// 注意:digest 不占 WS result——WS result 只带 text/refs;digest 由 daemon
// 在转成 MCP 响应前生成(见 §b.2),extension 不感知。

// ---- find_in_snapshot(daemon 本地执行,不下发扩展)----
// 该命令不出现在 WS 层;daemon 在 snapshot-store 中检索。
interface FindInSnapshotParams {
  snapshotId: string;
  query: { text?: string; role?: string; regex?: string };  // 至少一项;多条件为 AND
  limit?: number;                 // 默认 20,硬上限 50
}
interface FindMatch { ref: string; role: string; name: string; context: string; } // context=命中行±1 行,≤200 字符
interface FindInSnapshotResult { ok: true; matches: FindMatch[]; truncated: boolean; }

// ---- click(pro)----
interface ClickParams {
  target?: Target;                // 默认 'newTab'(即当前 task 标签)
  ref?: string;                   // 与 selector 二选一,ref 优先
  selector?: string;
  expectNavigation?: boolean;     // true 时等 load(默认 10s),否则 300ms 稳定即返
}
interface ClickResult { ok: true; tabId: number; url: string; clicked: { role?: string; text?: string; }; }

// ---- fill(pro)----
interface FillParams {
  target?: Target;
  ref?: string; selector?: string;
  value: string;                  // ≤10,000 字符
  secret?: boolean;               // true:结果与错误信息中不回显 value
  pressEnter?: boolean;           // 填后是否补 Enter(搜索框场景)
}
interface FillResult { ok: true; tabId: number; url: string; mode: 'value' | 'contenteditable'; }

// ---- press_key(pro)----
interface PressKeyParams { target?: Target; key: string; ref?: string; }
// key 取值:'Enter'|'Tab'|'Escape'|'Backspace'|'Delete'|'ArrowUp|Down|Left|Right'
//   |'PageUp'|'PageDown'|'Home'|'End'|单字符;组合用 '+' 连接:'Control+A','Shift+Enter'
interface PressKeyResult { ok: true; tabId: number; url: string; }

// ---- scroll(pro)----
interface ScrollParams {
  target?: Target;
  direction: 'up' | 'down' | 'top' | 'bottom';
  amountPx?: number;              // 默认 500;top/bottom 忽略此参
}
interface ScrollResult { ok: true; tabId: number; url: string; scrollY: number; }

// ---- evaluate(pro only)----
interface EvaluateParams { target?: Target; expression: string; }  // MAIN world,返回值须 JSON 可序列化,≤100KB
interface EvaluateResult { ok: true; tabId: number; url: string; value: unknown; }

// ---- wait ----
interface WaitParams {
  target?: Target;
  until?: 'time' | 'selector' | 'networkidle';   // 默认 'time';readonly 仅 'time'
  ms?: number;                    // time:默认 1000,上限 10_000
  selector?: string;              // selector 模式必填,超时 15s → CMD_TIMEOUT
  timeoutMs?: number;             // 上限 30_000
}
interface WaitResult { ok: true; tabId: number; url: string; waitedMs: number; }

// ---- screenshot ----
interface ScreenshotParams {
  target?: Target;                // readonly:恒 activeTab 且仅 png
  format?: 'png' | 'jpeg';        // 默认 png
  quality?: number;               // jpeg 0-100,默认 80
  fullPage?: boolean;             // 默认 false,pro only
}
interface ScreenshotResult { ok: true; tabId: number; url: string;
  image: string;                  // base64(不带 data: 前缀)
  width: number; height: number;
  fileRef: string;                // 同步落盘 artifacts/{task_id}/screenshot-*.png(§f)
}
// 语义红线:截图只供人复核,禁止作为动作依据(原则 3)。

// ---- extract ----
interface ExtractParams {
  target?: Target;
  format?: 'markdown' | 'schema'; // 默认 markdown
  schema?: Record<string, unknown>; // format='schema' 时必填:JSON Schema,由页面上按其抽取
  selector?: string;              // 限定抽取根,默认 document
  maxChars?: number;              // 默认 60_000,超出截断+fileRef
}
interface ExtractResult {
  ok: true; tabId: number; url: string; title: string;
  content: string;                // markdown:readability 正文;schema:JSON 字符串
  data?: unknown;                 // format='schema' 时:抽取结果对象
  totalChars: number; truncated: boolean;
  fileRef?: string;               // truncated 或 >25k 时必有
  evidenceId?: string;            // daemon 自动落库后回填(§c.3)
}
```

### a.6 analysis_report 消息(扩展 → daemon,单向 fire-and-forget)

截图分析数据上报:popup「截图分析」触发,扩展 service worker 本地计算指标后经既有 WS 连接上报;daemon 收到后落 artifacts + evidence,**不回执**(无 result 帧对应此消息)。该消息**不属于** `CommandName`,不走 §a.2 的 command/result 信封,daemon 在 `onMessage` 中按 `msg.type === 'analysis_report'` 独立分发(握手完成前依旧按 §a.1 门控丢弃)。

```ts
// shared-types/src/ws-protocol.ts(§a.6)
interface AnalysisReportMessage {
  type: 'analysis_report';
  id: string;                    // ulid 风格,由扩展生成(仅用于日志关联,daemon 不回执)
  kind: 'screenshot';
  capturedAt: string;            // ISO8601
  pageUrl: string;
  pageTitle: string;
  metrics: {
    width: number;
    height: number;
    aspectRatio: number;         // w/h
    brightness: number;          // 0-1,Rec.709 加权均值
    colorfulness: number;        // Hasler-Süsstrunk,0-110+ 常见
    dominantColors: Array<{ rgb: [number, number, number]; share: number }>;
                                 // 降采样聚类,最多 5 个,share 合计≈1
  };
  summary: string;               // ≤500 字规则式中文摘要
}
```

| 字段 | 类型 | 语义 |
|------|------|------|
| type | `'analysis_report'` | 消息类型字面量 |
| id | string | ulid 风格,扩展生成,仅日志关联;daemon 不回执 |
| kind | `'screenshot'` | 上报种类,当前仅截图分析 |
| capturedAt | string | 截图时刻,ISO8601 |
| pageUrl | string | 截图所在页面 URL |
| pageTitle | string | 截图所在页面标题 |
| metrics.width / height | number | 截图像素宽高 |
| metrics.aspectRatio | number | width/height |
| metrics.brightness | number | 0-1,Rec.709 加权均值 |
| metrics.colorfulness | number | Hasler-Süsstrunk,0-110+ 常见 |
| metrics.dominantColors | Array | 降采样聚类主色,最多 5 个,share 合计≈1 |
| summary | string | ≤500 字规则式中文摘要 |

- **不回执**:fire-and-forget,daemon 落 artifacts + evidence 后不发任何回应帧;扩展侧上报失败只记日志、不重试。
- 语义红线:截图(及其分析数据)只供人复核,**禁止作为动作依据**(原则 3)。

---

## §b MCP 工具集(daemon → AI 客户端,stdio)

### b.1 工具清单与命名

统一前缀 `browser_`。共 14 + 1 可选。除注明外均依赖 pro 扩展;readonly 扩展在线时,写类工具返回 `READONLY_REJECTED`。

| 工具 | 对应 WS 命令 | 备注 |
|------|--------------|------|
| browser_navigate | navigate | |
| browser_new_tab | new_tab | |
| browser_close_tab | close_tab | |
| browser_switch_tab | switch_tab | |
| browser_get_tabs | get_tabs | |
| browser_snapshot | snapshot | |
| browser_find_in_snapshot | —(daemon 本地) | |
| browser_click | click | |
| browser_fill | fill | |
| browser_press_key | press_key | |
| browser_scroll | scroll | |
| browser_evaluate | evaluate | pro only |
| browser_wait | wait | |
| browser_screenshot | screenshot | 返回 image content |
| browser_extract | extract | 自动落证据库 |
| browser_route(可选) | — | 调 backend `POST /api/route`;**默认关闭**,env `WEBBRIDGE_MCP_ROUTE_TOOL=on` 才注册(通道① MCP 场景由客户端自答,daemon 不提供 quick-answer 工具) |

### b.2 工具级 schema(inputSchema 为 JSON Schema draft 2020-12;返回即 WS result,再包一层 MCP content)

所有工具的 MCP 响应:

```jsonc
{ "content": [ { "type": "text", "text": "<JSON.stringify(result)>" } ],
  "isError": false }
```

- 文本统一 `JSON.stringify(result)`(screenshot 例外:content 第一项为 `{type:'image', data, mimeType}`,第二项为文本元数据)。
- **主上下文配额在 MCP 层生效**(§token 预算):`browser_snapshot` 返回的 `text` 若 >25,000 字符,daemon 截断并附 `fileRef`;`digest`(≤2k token)由 daemon 对 `text` 浓缩生成,工具响应附加字段 `digest`,主 Agent 优先消费 `digest`。

各工具 inputSchema(与 §a.5 的 params 字段一一对应,仅列差异/要点):

```jsonc
// browser_navigate
{ "type":"object", "required":["url"],
  "properties":{ "url":{"type":"string","pattern":"^https?://"},
    "waitUntil":{"enum":["load","domcontentloaded","none"]},
    "timeoutMs":{"type":"integer","maximum":60000},
    "task_id":{"type":"string","description":"可选;不传由 daemon 生成并贯穿 artifacts/evidence"} } }
// target 由 daemon 推导:默认 'newTab';客户端不得传 'activeTab'(daemon 拒绝,TARGET_DENIED)

// browser_snapshot
{ "type":"object",
  "properties":{ "level":{"enum":["compact","full"]},
    "maxChars":{"type":"integer","maximum":25000,"default":25000},
    "refs":{"type":"boolean","default":true},
    "task_id":{"type":"string"} } }

// browser_find_in_snapshot
{ "type":"object","required":["snapshotId","query"],
  "properties":{ "snapshotId":{"type":"string"},
    "query":{"type":"object","minProperties":1,
      "properties":{"text":{"type":"string"},"role":{"type":"string"},"regex":{"type":"string"}}},
    "limit":{"type":"integer","maximum":50,"default":20} } }

// browser_click
{ "type":"object","anyOf":[{"required":["ref"]},{"required":["selector"]}],
  "properties":{ "ref":{"type":"string","pattern":"^e\\d+$"},
    "selector":{"type":"string"},"expectNavigation":{"type":"boolean"},
    "task_id":{"type":"string"} } }

// browser_fill
{ "type":"object","required":["value"],
  "anyOf":[{"required":["ref"]},{"required":["selector"]}],
  "properties":{ "ref":{"type":"string"},"selector":{"type":"string"},
    "value":{"type":"string","maxLength":10000},"secret":{"type":"boolean"},
    "pressEnter":{"type":"boolean"} } }

// browser_press_key
{ "type":"object","required":["key"],
  "properties":{ "key":{"type":"string","description":"Enter|Tab|Escape|ArrowDown|...|Control+A"},
    "ref":{"type":"string"} } }

// browser_scroll
{ "type":"object","required":["direction"],
  "properties":{ "direction":{"enum":["up","down","top","bottom"]},"amountPx":{"type":"integer"} } }

// browser_evaluate
{ "type":"object","required":["expression"],
  "properties":{ "expression":{"type":"string","maxLength":100000} } }

// browser_wait
{ "type":"object",
  "properties":{ "until":{"enum":["time","selector","networkidle"]},
    "ms":{"type":"integer","maximum":10000},"selector":{"type":"string"},
    "timeoutMs":{"type":"integer","maximum":30000} } }

// browser_screenshot
{ "type":"object",
  "properties":{ "format":{"enum":["png","jpeg"]},"quality":{"type":"integer","maximum":100},
    "fullPage":{"type":"boolean"} } }

// browser_extract
{ "type":"object",
  "properties":{ "format":{"enum":["markdown","schema"],"default":"markdown"},
    "schema":{"type":"object","description":"format=schema 时必填,JSON Schema"},
    "selector":{"type":"string"},"maxChars":{"type":"integer","maximum":60000},
    "task_id":{"type":"string"} } }

// browser_get_tabs / browser_switch_tab / browser_new_tab / browser_close_tab
// get_tabs:{};switch_tab:{tabId:integer};new_tab:{url?:string};close_tab:{tabId:integer}
```

返回结构全部等于 §a.5 对应 `*Result`。`ref` 生命周期:仅在其来源 `snapshotId` 对应的页面状态有效;ref 失效报 `REF_STALE`,契约要求客户端重新 snapshot,不做自动重试。

---

## §c Evidence schema(跨模态唯一真源,AGENT_02 所有)

### c.1 SQLite 表 DDL(建在 backend 现有 `data/moirca.db`)

```sql
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id    TEXT PRIMARY KEY,            -- 'ev_' + ULID(26 位,时间有序)
  channel        TEXT NOT NULL CHECK (channel IN
                   ('page_qa','deep_research','controlled_browse','manual')),
  url            TEXT NOT NULL,
  title          TEXT DEFAULT '',
  fetched_at     TEXT NOT NULL,               -- ISO8601 含时区,采集时刻,禁止 now() 兜底造假
  source_quality TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (source_quality IN ('official','authoritative','community','unknown')),
  quote          TEXT NOT NULL,               -- 原文引用,≤2000 字符,保留原文不清洗
  locator        TEXT NOT NULL DEFAULT '{}',  -- JSON:{type:'css'|'xpath'|'text_offset'|'ref', value:str, page_index?:int}
  raw_ref        TEXT,                        -- 大字段旁路:'artifacts/{task_id}/{file}'(相对 daemon 根,§f)
  task_id        TEXT DEFAULT '',
  created_at     TEXT NOT NULL                -- 入库时刻
);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_url  ON evidence(url);
```

TS 镜像:`shared-types/src/evidence.ts`(字段同名,snake_case 不改)。

### c.2 引用最小格式(主 Agent 只见浓缩摘录)

- 说明书/回答正文中逐句引用:`……结论句……[E:ev_01HXXXXXXX]`。
- 浓缩摘录格式(喂主 Agent):`quote` 截取 ≤200 字符 + `[E:{evidence_id}]`;原文完整存库,回查 = `GET /api/evidence/query?evidence_id=...`。
- 报告表(AGENT_05)对证据只有外键引用:`report_citations(claim_text, evidence_ids JSON)`;**禁止复制 quote 进报告表**。

### c.3 落库触发(谁写)

| 场景 | 触发者 | channel |
|------|--------|---------|
| `browser_extract` 成功 | daemon 自动 POST /api/evidence/save | deep_research 或 controlled_browse(按 task 上下文,默认 controlled_browse) |
| screenshot 落盘 | daemon 只写文件不写库;引用该图的证据由 AGENT_05 管线显式 save,raw_ref 指向 png | — |
| 深研管线采集 | AGENT_05 管线显式 save | deep_research |
| readonly 通道② | **不落库**(最小权限,现有行为保留) | — |

---

## §d 意图路由协议(AGENT_01)

### d.1 纯函数(核心,可单测,零 IO)

```python
# backend/app/router/intent_router.py
from typing import Literal, Optional

RouteLabel = Literal['quick_answer', 'page_qa', 'deep_research', 'controlled_browse']

class RouteContext(TypedDict, total=False):
    page_url: str        # 用户当前页(可空)
    page_title: str
    has_selection: bool
    selected_text: str   # ≤2000 字符

def route_intent(text: str, context: Optional[RouteContext] = None) -> 'RouteResult': ...
```

分类规则(规则表驱动,`rules.py` 为数据):

| label | 触发(示例,规则表为准) | 特征 |
|-------|--------------------------|------|
| `quick_answer` | 闲聊/常识/寒暄/低价值关键词命中,且无浏览上下文需求 | 不联网、不开浏览器 |
| `page_qa` | `has_selection=true`,或文本含"这页/这个页面/选中/这段"等指代 + context.page_url 非空 | 只读快照问答 |
| `deep_research` | 高价值多源研究信号:"对比/分析/推荐/帮我查 N 所/策略/风险评估"+ 高考实体(院校/专业/分数词) | 报时耗/配额后进管线 |
| `controlled_browse` | 登录墙内/个人数据/实时交互信号:"我的/登录/填表/提交/下单/查我自己的" | 新标签 + 写确认 |
| 无命中 | 以上皆不中 | **`label=None`(None 不决策),confidence=0,上层自答,不产出拒答文案**(原则 7) |

优先级与消歧:显式信号(选中文字、"我的")> 高考实体强度 > 关键词频次;`page_qa` 与 `deep_research` 同分时,若 page_url 非空取 `page_qa`。冲突到阈值内无法判定 → 返回低 confidence + `clarify`。

### d.2 HTTP 封装 `POST /api/route`

```jsonc
// 请求
{ "text": "帮我对比华科和武大的计算机专业", "context": { "page_url": "...", "has_selection": false } }
// 响应 200
{ "label": "deep_research", "confidence": 0.82, "reason": "命中对比类意图+院校实体×2",
  "estimate": { "minutes": 6, "max_evidence": 40 },       // deep_research 必带,其余 null
  "clarify": null }
// 澄清门控(一次只 1 问 + ≤4 选项 chips,原则 6)
{ "label": "controlled_browse", "confidence": 0.55,
  "clarify": { "question": "要在哪个平台查询你的成绩?",
    "options": ["省考试院官网", "阳光高考", "学校教务系统"] } }
// 校验:text 必填,≤500 字符;context.selected_text ≤2000 字符;违规 400 INVALID_PARAMS
```

### d.3 MCP 开关

`browser_route` 工具默认不注册(env `WEBBRIDGE_MCP_ROUTE_TOOL=on` 开启);开启时 input `{text:string(≤500), context?:object}`,返回同上 JSON。

---

## §e HTTP API(backend,127.0.0.1:8000,前缀 /api)

| 端点 | 方法 | 状态 | 归属 | 说明 |
|------|------|------|------|------|
| `/api/health` | GET | ➕新增 | AGENT_01 | 见下 |
| `/api/route` | POST | ➕新增 | AGENT_01 | §d.2 |
| `/api/context/ask` | POST | ✅已有保留 | — | 契约照抄现有实现,**逐字段不变**,见 e.2 |
| `/api/context/ping` | GET | ✅已有保留 | — | 保留 |
| `/api/deep-research` | POST | ➕新增 | AGENT_05 | e.3 |
| `/api/deep-research/{task_id}` | GET | ➕新增 | AGENT_05 | 状态轮询 |
| `/api/deep-research/{task_id}/stream` | GET(SSE) | ➕新增 | AGENT_05 | 真流式 |
| `/api/evidence/save` | POST | ➕新增 | AGENT_02 | e.4 |
| `/api/evidence/query` | GET | ➕新增 | AGENT_02 | e.4 |
| `/api/report` | POST | 🔧改造 | AGENT_05 | 现有 report.py 接入 task/evidence 引用;请求响应在 AGENT_05 细化,但**必须返回 `citations`** |
| `/api/chat` 及其余现有端点 | — | ✅已有保留 | — | 不动 |

### e.1 GET /api/health

```jsonc
// 200
{ "ok": true, "service": "webbridge-backend", "version": "1.0.0",
  "llm_configured": true, "evidence_db": true }
```

### e.2 POST /api/context/ask(照抄现有 context.py,勿改字段)

```jsonc
// 请求
{ "page_title": "str,可空", "page_url": "str,可空",
  "context_text": "页面正文/选区,≤24000(有效 12000,超出截断 truncated=true)",
  "question": "必填,≤2000",
  "agent_id": "master|zhang|data|risk|parents|senior|workplace,默认 master" }
// 响应 200
{ "answer": "str", "model_used": "llm|fallback", "agent_id": "str",
  "agent_name": "str", "truncated": false }
// 错误:400 {"error":{"code":"INVALID_ARGUMENT","message":"question 不能为空","details":{}}}
```

### e.3 POST /api/deep-research

```jsonc
// 请求
{ "query": "str,≤2000,必填",
  "gaokao_ctx": { "province": "str?", "score": "int?", "subject": "str?", "rank": "int?" },
  "budget": { "max_minutes": "int?,默认 10", "max_evidence": "int?,默认 50" } }
// 响应 202(异步受理,路由器已报过 estimate,此处可复核)
{ "task_id": "task_01HXXXXXXX", "status": "queued",
  "estimate": { "minutes": 6, "max_evidence": 40 } }
// GET /api/deep-research/{task_id} →
{ "task_id": "...", "status": "queued|running|done|failed", "progress": 0.4,
  "agents_done": ["agent1_official_hunter"], "evidence_count": 12,
  "error": null }
// SSE /stream 事件帧:{"event":"agent_progress|evidence_added|report_ready","data":{...}}
```

### e.4 evidence-save / evidence-query

```jsonc
// POST /api/evidence/save(单条;批量用 {"items":[...]} ≤50 条)
{ "task_id": "str?", "channel": "deep_research|controlled_browse|page_qa|manual",  // 必填
  "url": "必填", "title": "str?", "fetched_at": "ISO8601 可空则服务端补真实 now()",
  "source_quality": "official|authoritative|community|unknown,默认 unknown",
  "quote": "必填,≤2000", "locator": {"type":"css","value":"..."}, "raw_ref": "artifacts/... 可空" }
// 201 → { "evidence_id": "ev_01HXXXXXXX", "created_at": "..." }
// 写库失败 500 → {"error":{"code":"EVIDENCE_DB_FAIL", ...}}

// GET /api/evidence/query?task_id=&channel=&url=&q=&evidence_id=&limit=50&offset=0
// limit ≤100。200 → { "items": [Evidence...], "total": 123 }
```

---

## §f 文件旁路协议

- 根目录:`daemon/artifacts/`(env `WEBBRIDGE_ARTIFACTS_DIR` 可覆盖),**加入 .gitignore**。
- 任务子目录:`daemon/artifacts/{task_id}/`;`task_id` 来自 MCP 调用参数或 daemon 生成(`task_{ULID}`),贯穿 artifacts 与 evidence。
- 文件命名:`{kind}-{yyyymmdd-HHMMSS}-{seq3}.{ext}`,kind ∈ `snapshot | extract | screenshot | page`;如 `snapshot-20260906-142233-001.txt`。
- 引用格式(`fileRef` 字段):`file://{daemon_artifacts_root 绝对路径}/{task_id}/{文件名}`,如 `file:///home/u/webbridge-build/daemon/artifacts/task_01H/snapshot-20260906-142233-001.txt`。
- evidence.`raw_ref` 用**相对形式**:`artifacts/{task_id}/{文件名}`(跨机可迁移)。
- 截图始终落盘(screenshot.fileRef 恒有);snapshot/extract 仅在超限时落盘。
- 保留策略:默认 7 天,AGENT_07 提供 `scripts/clean-artifacts` 可选清理,不做自动删除(极客工具,用户自决)。

---

## §g 错误模型(全模块统一)

### g.1 错误码表

| code(字符串) | num(WS/JSON-RPC) | HTTP 映射 | 语义 | 产生者 |
|---|---|---|---|---|
| PARSE_ERROR | -32700 | 400 | 消息非合法 JSON | daemon/extension |
| INVALID_REQUEST | -32600 | 400 | 信封字段缺失(type/id/method) | daemon |
| UNKNOWN_COMMAND | -32601 | 404 | method 不在 15 条命令表 | extension/daemon |
| INVALID_PARAMS | -32602 | 400/422 | 参数校验失败(data携字段级原因) | 全部 |
| EXT_NOT_CONNECTED | -32000 | 503 | 扩展未连接/已断开 | daemon |
| CMD_TIMEOUT | -32001 | 504 | 命令等待超时(默认 30s) | daemon |
| NAV_TIMEOUT | -32002 | 504 | 页面加载超时(默认 15s) | extension |
| PERMISSION_DENIED | -32003 | 403 | Chrome 权限不足(如 debugger 被拒) | extension |
| READONLY_REJECTED | -32004 | 403 | readonly 模式拒绝写命令 | extension/daemon(双保险) |
| TARGET_DENIED | -32005 | 403 | target=activeTab 用于写命令,或 tabId 未托管 | extension/daemon(双保险) |
| REF_STALE | -32006 | 409 | ref 已失效,需重新 snapshot | extension |
| TAB_CLOSED | -32007 | 410 | 目标标签已被关闭 | extension |
| EXTRACT_FAILED | -32008 | 500 | readability 抽取失败(空文档等) | extension/daemon |
| ROUTE_NO_MATCH | — | 200 | **不是错误**:label=null | backend |
| EVIDENCE_DB_FAIL | — | 500 | 证据写库失败(data 携 task_id 与重试提示) | backend |
| EVIDENCE_NOT_FOUND | — | 404 | GET /api/evidence/{id} 未命中(AGENT_02,AGENT_07 补录) | backend |
| REPORT_NOT_FOUND | — | 404 | 报告/任务回查未命中(AGENT_05,AGENT_07 补录) | backend |
| API_TOKEN_REQUIRED | — | 401 | 可选鉴权开启(WEBBRIDGE_API_TOKEN)后缺/错 X-WebBridge-Token 请求头(AGENT_07 补录) | backend |
| BACKEND_UNREACHABLE | — | 503 | daemon 调 backend 失败(自动落库时降级:文件仍落盘,记 error log,不阻塞工具返回) | daemon |

### g.2 各 Agent 最小错误处理清单

- **AGENT_01(路由)**:输入超长/为空 → 400 INVALID_PARAMS;规则表异常 → label=null + confidence=0(绝不 500);embedding 不可用 → 降级关键词。
- **AGENT_02(证据)**:save 必须校验 channel/quote/url;DB 写失败 → EVIDENCE_DB_FAIL 且**不得**静默丢数据(返回失败让调用方重试);query 恒 200 空数组而非 404。
- **AGENT_03(扩展)**:未知命令 → UNKNOWN_COMMAND;readonly 拒绝 → READONLY_REJECTED;ref 失效 → REF_STALE;WS 断开重连(3s→30s 退避);所有命令 try/catch,不裸抛。
- **AGENT_04(daemon)**:扩展未连 → EXT_NOT_CONNECTED(不重试);超时 → CMD_TIMEOUT(清除 pending);backend 不可达 → 文件旁路兜底 + BACKEND_UNREACHABLE;MCP 层把 WsError 转 `isError:true` + text=JSON(error)。
- **AGENT_05(管线)**:任一 Agent 失败不终止管线(记录 + 继续);证据保存失败重试 2 次后降级为仅落盘 raw_ref;报告必须校验每个 evidence_id 存在,悬空引用 → 报告生成失败。
- **AGENT_06(skills)**:每步动作失败 → 按"执行→验证→重试(≤2 次)"循环,仍败则中止并说明,不静默跳过。
- **AGENT_07**:CI 中校验错误码枚举在 shared-types 与本文一致。

---

## §h token / 字符双口径预算

| 位置 | 口径 | 上限 | 生效层 |
|------|------|------|--------|
| `browser_snapshot` 返回 `text` | **字符** | 25,000 | daemon(MCP 响应前截断,超出写旁路) |
| `browser_find_in_snapshot` 返回 | **字符** | 4,000 | daemon |
| `browser_extract` content | **字符** | 60,000 | daemon |
| MCP 单工具响应(文本合计) | **字符** | 30,000 | daemon |
| `/api/context/ask` context_text | **字符** | 12,000(现有 MAX_CONTEXT_CHARS) | backend(已有) |
| `/api/route` text | **字符** | 500 | backend |
| evidence.quote | **字符** | 2,000 | backend 校验 |
| 主 Agent 浓缩摘录(`digest`) | **token** | 2,000 | daemon digest.ts |
| 引用摘录(c.2) | **字符** | quote 截 200 | AGENT_05 管线 |
| 截图 | **token** | ≈765/张(1280×800 视觉估算口径);每 task 默认 ≤8 张 | 客户端/管线自律 |

规则:**截断一律按字符口径在产生数据的模块执行**;**成本账一律按 token 口径汇报**。两口径不得混用同一字段。

---

## 附:协议版本与漂移防护

- `protocolVersion = 1`;任何破坏性变更必须升版本并同步本文与 shared-types。
- CI(AGENT_07):① `shared-types` 生成 JSON Schema 快照入库存档;② 校验 daemon 注册工具名集合 === `shared-types/src/mcp-tools.ts` 导出清单;③ grep 全仓库禁止 `9222`(WebBridge 上下文);④ extension/daemon 编译必须解析到同一份 shared-types(workspace 路径)。
