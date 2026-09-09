# WebBridge 架构蓝图(ARCHITECTURE)

> 版本:v1.0(2026-09-06,AGENT_00 撰写)
> 配套契约:`docs/CONTRACT.md`(**接口字段级 schema 一律以 CONTRACT.md 为准**,本文只讲结构与归属)
> 效力:AGENT_01–AGENT_07 必须遵守本文的模块边界、文件归属表与技术原则;与本文件冲突的实现视为返工。

---

## 1. 系统全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AI 客户端(Claude Code / Cursor)                │
│      通道①秒答:客户端自答,不经 WebBridge     通道③④:调 MCP 工具        │
└───────────────┬─────────────────────────────────────────┬───────────────┘
                │ MCP (stdio, JSON-RPC 2.0)               │ 通道②不经过 MCP
                ▼                                          │
┌───────────────────────────────────────────────┐         │
│  daemon(Node.js TS,单进程)                   │         │
│  ┌──────────────┐   ┌──────────────────────┐  │         │
│  │ mcp-server   │   │ extension-bridge     │  │         │
│  │ browser_* 工具│──▶│ (WS Server :9223)    │  │         │
│  └──────┬───────┘   └──────────┬───────────┘  │         │
│         │ snapshot-store / artifacts(文件旁路) │         │
└─────────┼──────────────────────┼──────────────┘         │
          │ HTTP (127.0.0.1:8000)│                        │
          ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  backend(Python FastAPI)                                               │
│  /api/route(意图路由器,AGENT_01)──四分类──────────────┐                │
│  /api/context/ask(已有保留,通道②)◀── readonly 扩展 popup │              │
│  /api/evidence/*(证据库 SQLite,AGENT_02)◀── daemon 自动落库 │            │
│  /api/deep-research/*(7-Agent 高考垂直管线,AGENT_05)────▶ 通道③         │
│  /api/report(决策说明书,只引用 evidence_id)                            │
└─────────────────────────────────────────────────────────────────────────┘
                                   ▲ WebSocket(ws://127.0.0.1:9223)
┌──────────────────────────────────┴──────────────────────────────────────┐
│  Chrome 扩展(TS MV3,双模式构建)                                        │
│  readonly 模式:activeTab + scripting + storage(最小权限,通道②)         │
│    - DOM 注入快照(无 ref)/ 选中文字 / popup 问答 / 拒绝一切写命令         │
│  pro 模式:chrome.debugger(CDP 全权)(通道④,AGENT_03+04)               │
│    - service-worker + cdp-controller + commands/*(navigate/click/…)     │
└─────────────────────────────────────────────────────────────────────────┘
                ▲
        真实 Chrome 浏览器(非 headless)
```

三段式自研形态**保留**:扩展 + daemon + MCP。但 attach/事件循环/快照截断/ref 定位/等待策略等**动作语义以 chrome-devtools-mcp 与 playwright-mcp 的公开实现为准绳对齐**(只抄语义,不引运行时依赖)。

---

## 2. 模块边界与职责

| 模块 | 技术栈 | 职责 | 明确不做 |
|------|--------|------|----------|
| `shared-types/` | TypeScript + 生成 JSON Schema | WS 协议、MCP 工具、错误码、Evidence 类型的**单一真源** | 不含运行时逻辑 |
| `extension/` | TS MV3 | 执行命令(readonly/pro 双模式)、通道② popup、快照采集 | 不做意图路由、不直接写证据库 |
| `daemon/` | Node.js TS | MCP Server(stdio)、WS Server(9223)、文件旁路、extract 落库、snapshot 浓缩 | 不做 LLM 调用、不做研究管线 |
| `backend/` | Python FastAPI + SQLite | 意图路由、通道②问答、证据库、高考垂直 7-Agent 研究管线、说明书 | 不直接控制浏览器(浏览器只能经扩展) |
| `app/` | React | 高考专用 UI,**本轮不重构**,保留参考 | — |
| `skills/` | JSON 意图定义 | 意图与策略(触发条件、工具偏好、验证点),不是机械步骤脚本 | 不内嵌硬编码 URL 流程 |
| `docs/` | Markdown | CONTRACT/ARCHITECTURE + 历史文档归档 | — |
| `moirca/` | — | **废弃**,本轮结束由 AGENT_07 删除 | 任何 Agent 不得在其中新增文件 |

边界铁律:

1. **扩展是唯一能碰浏览器进程的组件**;daemon 只能与扩展对话,backend 只能被 daemon/扩展/前端调 HTTP。
2. **证据唯一真源在 backend SQLite**(`evidence` 表,AGENT_02 所有)。AGENT_05 的研究报告/任务结果表只写 `evidence_id` 外键,禁止另建证据表。
3. **类型真源在 `shared-types/`**,extension 与 daemon 通过 npm workspace 引用;Python 侧只消费 CONTRACT.md 中的人读 schema + CI 校验。
4. **端口一律 9223**(daemon WS Server)。9222 是 Chrome `--remote-debugging-port` 默认端口,全仓库禁止出现 9222 作为 WebBridge 监听端口。

---

## 3. 端到端数据流(四通道)

通用前置:任何用户输入先经**意图路由器**(backend `route_intent` 纯函数,`POST /api/route` 薄封装),路由结果四分类,无命中返回 `label: null`(不决策,不拒答)。

### 通道① 秒答

```
用户 ──▶ AI 客户端(MCP 场景:客户端自答,WebBridge 零参与)
     └─▶ App 场景:app 前端 ──POST /api/chat──▶ backend(已有,保留不重写)
```

### 通道② 页面只读问答

```
用户在 readonly popup 输入问题
  └▶ 扩展 content script:DOM 注入提取正文/选区(≤12,000 字符,无 ref)
      └▶ POST /api/context/ask { page_title, page_url, context_text, question, agent_id }
          └▶ backend(XML 定界 + 不可信内容降权,已有保留)──▶ ContextAskResponse{answer,...}
              └▶ popup 渲染。不落库、不启动浏览器动作、不切换标签
```

### 通道③ 云端深研

```
用户 ──▶ POST /api/route {text} ──▶ label=deep_research
  └▶ 前端/客户端展示 耗时+配额 预告(路由响应携带 estimate)→ 用户确认
      └▶ POST /api/deep-research {query, gaokao_ctx, budget} ──▶ 202 {task_id}
          └▶ 7-Agent 管线(AGENT_05,角色与融合公式保持现状)
              ├─ 需要实时页面数据时 ──▶ HTTP 调 daemon 控制端点/由客户端侧 MCP 驱动 browser_extract
              │    └▶ daemon ──WS──▶ 扩展(pro)extract(@mozilla/readability)
              │        └▶ daemon POST /api/evidence/save(自动落库,channel=deep_research)
              └▶ Agent6 融合 ──▶ 说明书逐句携带 [E:ev_xxx] 引用
                  └▶ POST /api/report 落报告表(只存 evidence_id 外键)
```

### 通道④ 受控浏览收集

```
AI 客户端 ──MCP browser_navigate {target:'newTab'}──▶ daemon
  └▶ WS {type:'command', method:'navigate', params:{target:'newTab'}}(:9223)
      └▶ 扩展(pro):新建后台专用标签,绝不复用用户当前标签(target='activeTab' 只放行只读命令)
          └▶ result{ok, tabId, url} 原路返回
  └▶ browser_snapshot(≤25,000 字符,超出写 daemon/artifacts/{task_id}/ 并回 fileRef)
  └▶ browser_click/fill/press_key:执行 → 验证 → 失败重试(skill 层策略,动作层只报 ok/error)
  └▶ browser_extract ──▶ daemon 自动 POST /api/evidence/save(channel=controlled_browse)
```

每个 hop 的消息格式见 CONTRACT.md §a(WS)、§b(MCP)、§e(HTTP)。

---

## 4. 技术选型理由

| 决策 | 选择 | 理由 |
|------|------|------|
| WS 服务端宿主 | daemon(Node `ws`) | 扩展 service worker 生命周期短,必须由常驻 daemon 监听;现有 `ws-client.ts` 已是 WS Server,改名纠正即可 |
| MCP SDK | `@modelcontextprotocol/sdk`(已有依赖) | 官方 SDK,stdio transport 现成 |
| extract | 本地 `@mozilla/readability`(npm 已确认可装) | 离线、无外部 API 依赖;外部 reader API 仅留 `WEBBRIDGE_READER_API_URL` 开关,默认关闭 |
| 意图路由 | 纯 Python 函数(关键词规则优先 + 可选廉价 embedding) | 路由器必须可单测、零网络依赖可跑;embedding 只在配置了 LOCAL_LLM 时启用,失败降级关键词 |
| 证据存储 | 复用 backend 现有 SQLite(`app/models/database.py`) | 已有 init_db 机制;不引新存储引擎 |
| 类型真源 | `shared-types/` npm workspace + tsc 生成 JSON Schema | extension/daemon 同为 TS,直接引用零漂移;Python 侧靠 CI 校验 schema 快照 |
| 双模式扩展 | 一套源码 + 两份 manifest(vite 构建矩阵) | readonly 与 pro 权限哲学不同(参照 moirca-webbridge/),代码共享 commands,manifest 分发 |
| 截图 | 只给人复核 | 原则 3:禁止据截图执行动作,MCP 返回 image content 但契约标注不可作为动作依据 |

---

## 5. 文件归属表(逐文件,避免 AGENT_01–07 重复劳动)

图例:✅ 保留复用 / 🔧 保留+改造 / ❌ 废弃重写 / ➕ 新增 / 🗑 废弃删除
Agent 分工(如与主智能体分发不符,以主智能体最终分发为准,归属人不影响文件结论):
AGENT_01=意图路由与 health;AGENT_02=证据库;AGENT_03=扩展(双模式);AGENT_04=daemon(MCP+WS+通道④动作语义);AGENT_05=深研管线+报告;AGENT_06=skills;AGENT_07=清理/CI/收尾。

### 5.1 仓库根

| 文件 | 处置 | 归属 | 说明 |
|------|------|------|------|
| `LICENSE` | ➕ | AGENT_07 | AGPL-3.0 全文 |
| `README.md` | ➕ | AGENT_07 | 安装(readonly/pro)、daemon 启动、MCP 配置 |
| `package.json`(根,npm workspaces) | ➕ | AGENT_07 | workspaces: shared-types/extension/daemon |
| `moirca/`(整个目录) | 🗑 | AGENT_07 | 历史嵌套重复副本,**本轮结束前删除;任何 Agent 不得新增文件** |
| `moirca-webbridge/` | ✅ | — | 老版只读插件,权限哲学正确,通道②交互参照,**只读保留,不改** |
| `.gitignore` | 🔧 | AGENT_07 | 追加 `daemon/artifacts/`、`daemon/data/` |

### 5.2 shared-types/(全部 ➕,真源)

| 文件 | 归属 | 说明 |
|------|------|------|
| `shared-types/package.json` | AGENT_04 | 包名 `@webbridge/shared-types`,main 指 src |
| `shared-types/tsconfig.json` | AGENT_04 | strict |
| `shared-types/src/ws-protocol.ts` | AGENT_04 | WS envelope + 15 条命令 params/result 类型(CONTRACT §a 的唯一真源) |
| `shared-types/src/mcp-tools.ts` | AGENT_04 | browser_* 工具 inputSchema 描述 + 返回类型(CONTRACT §b) |
| `shared-types/src/evidence.ts` | AGENT_02 | Evidence 类型镜像(CONTRACT §c;Python 真源在 backend,此处为 TS 镜像) |
| `shared-types/src/errors.ts` | AGENT_04 | 错误码枚举与 WsError 结构(CONTRACT §错误模型) |
| `shared-types/schema/*.json` | AGENT_07(CI) | 由 ts 生成(如 `typescript-json-schema`),CI 校验:① extension/daemon 编译引用的是同一份;② daemon 实际注册的工具名集合 === mcp-tools.ts 导出清单(防漂移脚本 `scripts/check-drift.*`) |

### 5.3 extension/

| 文件 | 处置 | 归属 | 说明 |
|------|------|------|------|
| `extension/manifest.json` | ❌ | AGENT_03 | 拆为 `manifest.pro.json` / `manifest.readonly.json`(readonly 权限=activeTab+scripting+storage,参照 moirca-webbridge/manifest.json) |
| `extension/vite.config.ts` | 🔧 | AGENT_03 | 双 manifest 构建矩阵 |
| `extension/package.json` | 🔧 | AGENT_03 | 加 `@webbridge/shared-types` workspace 依赖 |
| `extension/src/types/index.ts` | ❌ | AGENT_03 | 内容迁入 shared-types/ws-protocol.ts,本文件改为 re-export(过渡期保留路径) |
| `extension/src/background/service-worker.ts` | ❌ | AGENT_03 | WS 地址改 9223;hello 握手;命令表补全 15 条;按 mode 拒命令 |
| `extension/src/background/cdp-controller.ts` | 🔧 | AGENT_03 | 保留主体;补 onRemoved/onDetach 清理(现 TODO);tabId 归属校验 |
| `extension/src/background/commands/navigate.ts` | ❌ | AGENT_03 | 重写:target 语义、等待策略对齐 chrome-devtools-mcp |
| `extension/src/background/commands/snapshot.ts` | ❌ | AGENT_03 | 重写:分层截断 + ref 定位 + find 支持(现整树直出,违反原则 2) |
| `extension/src/background/commands/click.ts` | 🔧 | AGENT_03 | 加 ref 定位、验证回执、target |
| `extension/src/background/commands/fill.ts` | 🔧 | AGENT_03 | 同上 |
| `extension/src/background/commands/screenshot.ts` | 🔧 | AGENT_03 | 加 fullPage/quality/target |
| `extension/src/background/commands/scroll.ts` | ➕ | AGENT_03 | 现为占位 |
| `extension/src/background/commands/evaluate.ts` | ➕ | AGENT_03 | 现为占位(pro only) |
| `extension/src/background/commands/tabs.ts` | ➕ | AGENT_03 | get_tabs/switch_tab/new_tab/close_tab(现为占位) |
| `extension/src/background/commands/press_key.ts` | ➕ | AGENT_03 | |
| `extension/src/background/commands/wait.ts` | ➕ | AGENT_03 | |
| `extension/src/background/commands/extract.ts` | ➕ | AGENT_03 | readonly 用 DOM 克隆,pro 用 CDP |
| `extension/src/background/mode.ts` | ➕ | AGENT_03 | 运行模式判定(由构建注入 __WEBBRIDGE_MODE__) |
| `extension/src/readonly/*`(content + popup 逻辑) | ➕ | AGENT_03 | 通道② DOM 提取 + ask 调用 |
| `extension/src/popup/popup.html` | 🔧 | AGENT_03 | readonly/pro 双形态 UI |
| `extension/tests/*` | ➕ | AGENT_03 | node:test 最小单测(命令参数校验、mode 矩阵) |

### 5.4 daemon/

| 文件 | 处置 | 归属 | 说明 |
|------|------|------|------|
| `daemon/src/ws-client.ts` | ❌ | AGENT_04 | **重写并改名 `src/extension-bridge.ts`**:名为 Client 实为 Server,监听改 9223;结构化错误;hello 握手;pending 清理保留 |
| `daemon/src/index.ts` | ❌ | AGENT_04 | 拆分:启动编排 + 环境变量装配 |
| `daemon/src/mcp-server.ts` | ➕ | AGENT_04 | MCP 工具注册(从 index 抽出) |
| `daemon/src/tools/*.ts` | ➕ | AGENT_04 | 每工具一文件;现 index.ts 内联的 9 个工具全部迁入并补全至 14+1 个 |
| `daemon/src/snapshot-store.ts` | ➕ | AGENT_04 | snapshotId→(fileRef, 元数据) 内存表,支撑 find_in_snapshot |
| `daemon/src/artifacts.ts` | ➕ | AGENT_04 | 文件旁路(CONTRACT §f) |
| `daemon/src/evidence-client.ts` | ➕ | AGENT_04 | extract/screenshot 自动 POST /api/evidence/save |
| `daemon/src/digest.ts` | ➕ | AGENT_04 | snapshot 浓缩(≤2k token 摘录) |
| `daemon/package.json` | 🔧 | AGENT_04 | 加 `@mozilla/readability`、`@webbridge/shared-types`;ws URL env 默认 9223 |
| `daemon/tests/*` | ➕ | AGENT_04 | node:test(envelope 解析、截断、旁路路径) |

### 5.5 backend/

| 文件 | 处置 | 归属 | 说明 |
|------|------|------|------|
| `backend/app/__init__.py` | 🔧 | AGENT_01 | 仅追加 include_router(route/health/evidence/deep-research);已修复的 CORS 白名单**勿动** |
| `backend/app/config.py` | 🔧 | AGENT_01/02/05 | 仅追加配置项(ROUTER_*、EVIDENCE_*、DEEP_RESEARCH_*);HOST/DEBUG/上传上限**勿动** |
| `backend/app/api/context.py` | ✅ | — | 通道②已有实现(含注入防护),**保留不重写**,契约照抄(CONTRACT §e) |
| `backend/app/api/chat.py` | ✅ | — | 通道① App 场景,保留(history 过滤已修) |
| `backend/app/api/report.py` | 🔧 | AGENT_05 | 改造:接入 deep-research 任务与 evidence_id 引用 |
| `backend/app/api/`其余(graph*/documents/history/logs/...等) | ✅ | — | 本轮不动 |
| `backend/app/api/route.py` | ➕ | AGENT_01 | `POST /api/route` 薄封装 |
| `backend/app/api/health.py` | ➕ | AGENT_01 | `GET /api/health` |
| `backend/app/api/evidence.py` | ➕ | AGENT_02 | save/query |
| `backend/app/api/deep_research.py` | ➕ | AGENT_05 | 任务创建/状态/流 |
| `backend/app/router/intent_router.py` | ➕ | AGENT_01 | 纯函数 `route_intent(text, context)`(关键词规则,embedding 可选) |
| `backend/app/router/rules.py` | ➕ | AGENT_01 | 四分类规则表(可单测的数据,不是散落 if) |
| `backend/app/models/evidence.py` | ➕ | AGENT_02 | evidence 表 DDL + 读写函数 |
| `backend/app/models/database.py` | 🔧 | AGENT_02 | 仅在 init_db 中挂 evidence 建表 |
| `backend/app/agents/*`(agent1–6、base、roles) | ✅ | — | 保持高考垂直,角色与融合公式不动;**勿改** Agent1/5 freshness 之外的任何已修项 |
| `backend/app/agents/agent7_report_writer.py` | ➕ | AGENT_05 | 报告生成器(现 agents/__init__.py:6 待实现项) |
| `backend/app/services/task_scheduler.py` | 🔧 | AGENT_05 | 已完整(477 行),接入 deep-research API |
| `backend/app/utils/llm_client.py` | ✅ | — | 复用(路由 embedding 可选走 LOCAL_LLM) |
| `backend/app/utils/`其余 | ✅ | — | 不动 |
| `backend/tests/test_router.py` 等 | ➕ | 各归属 Agent | 每模块最小 pytest |
| `backend/scripts/*` | ✅ | — | demo 脚本保留,不接新链路 |
| `backend/requirements.txt` | 🔧 | AGENT_01 | 按需追加(尽量零新增) |

### 5.6 app/、skills/、docs/

| 文件 | 处置 | 归属 | 说明 |
|------|------|------|------|
| `app/**` | ✅ | — | 本轮不重构;仅 `app/package.json` name "my-app" 由 AGENT_07 顺手改掉 |
| `skills/shopping/skill.json` | ❌ | AGENT_06 | 现把当前标签直接 navigate 走,违反原则 1,重写为新 SKILL 格式 |
| `skills/learning/skill.json` | ❌ | AGENT_06 | 重写为新格式 |
| `skills/shopping/prompt.md` | 🔧 | AGENT_06 | 保留内容,对齐新格式 |
| `skills/SCHEMA.md` + `skills/gaokao/*` | ➕ | AGENT_06 | 意图-策略格式定义与高考 skill;场景可插拔只做接口预留,不实作 |
| `docs/ARCHITECTURE.md`、`docs/CONTRACT.md` | ➕ | AGENT_00(本文件) | |
| `docs/architecture.md`、`docs/api.md`、`docs/data-schema.md` | 🔧 | AGENT_07 | 移入 `docs/legacy/`,标注 v1 历史参考 |
| `docs/` 其余(backlog/insights/review 等) | ✅ | — | 留作参考 |

---

## 6. 技术原则落点速查(违反即返工)

| 原则 | 落点 |
|------|------|
| 1 不抢当前标签 | WS `target` 参数 + 扩展侧 TARGET_DENIED 强制(CONTRACT §a);skills 禁止对 activeTab navigate |
| 2 快照分层截断 | snapshot maxChars=25,000 字符 + fileRef 旁路 + find_in_snapshot 子工具 + digest ≤2k token |
| 3 三路分工 | AX snapshot=动作/观测;extract=readability markdown;snapshot 契约标注截图仅供人复核 |
| 4 采集必落库 | daemon evidence-client 对 extract 自动落库;Evidence schema 唯一真源(§c) |
| 5 先路由后动手 | `POST /api/route` 前置于一切通道分流 |
| 6 澄清显式门控 | 路由响应 `clarify` 字段:一次 1 问 + ≤4 选项 chips |
| 7 秒答不拒答 | label=null 时上层自答;路由器不产出"拒答"文案 |
| 8 权限分层 | readonly/pro 双 manifest + 命令可用性矩阵(CONTRACT §a.3) |
| 9 skill=意图策略 | skills/SCHEMA.md:触发条件+工具偏好+验证点;动作层执行→验证→重试 |
| 10 语义对齐不重造 | navigate 等待策略、ref 生命周期、等待超时默认值对齐 chrome-devtools-mcp |
| 11 高考垂直 | 7-Agent 角色与融合公式不动;`SKILL` 接口仅预留 |
