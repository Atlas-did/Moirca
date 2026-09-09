# WebBridge

> 让 AI 客户端驱动一台**真实的 Chrome**,并把每一次"浏览/采集"落成**可回查的证据**。

WebBridge 是一个开源自研的浏览器 AI Agent 桥接框架(极客工具,不商用)。
它不做云爬虫、不开 headless:AI 客户端经 MCP 控制**你自己浏览器里的真实 Chrome**,
每次浏览自动落证据库,研究管线基于证据生成逐句可回查的决策说明书。

```
AI 客户端(Claude Code / Cursor)
   │ MCP(stdio,JSON-RPC 2.0)
   ▼
daemon(Node.js,单进程)
   ├─ mcp-server:15 个 browser_* 工具
   ├─ extension-bridge:WS Server,只绑 ws://127.0.0.1:9223
   └─ snapshot-store / artifacts:文件旁路 + 证据自动落库
   │ HTTP(127.0.0.1:8000)                │ WebSocket(ws://127.0.0.1:9223)
   ▼                                       ▼
backend(FastAPI + SQLite)          Chrome 扩展(MV3,双模式)
   ├─ POST /api/route        意图四分类路由    ├─ readonly:activeTab 最小权限
   ├─ /api/evidence/*        证据库(唯一真源) │   (选中文字→页面只读问答)
   ├─ POST /api/deep-research 7-Agent 深研管线  └─ pro:chrome.debugger(CDP 全权)
   └─ POST /api/report       决策说明书+引用      (导航/点击/填表/抽取)
   │
   ▼
真实 Chrome 浏览器(非 headless)
```

## 核心约定

- **不抢当前标签**:写动作默认开新标签(`target:'newTab'`);用户当前标签只允许只读命令,越权 → `TARGET_DENIED`。
- **三路分工**:AX 快照=动作定位;extract=readability 正文;截图仅供人复核,禁止作为动作依据。
- **采集必落库**:每次 extract 自动 `POST /api/evidence/save`;大正文走文件旁路 `daemon/artifacts/`。
- **先路由后动手**:`POST /api/route` 四分类(秒答/页面问答/深研/受控浏览),无命中 `label=null`,不拒答。
- **上下文预算**:snapshot 25k 字符 + digest ≤2k token,超出落盘回 `fileRef`,不撑爆主上下文。

## 快速开始

环境:Python 3.12+、Node.js 18+、Chrome/Edge。

```bash
# 1) 安装(仓库根,npm workspaces:shared-types/daemon/extension)
npm install
pip install -r backend/requirements.txt

# 2) backend
cp backend/.env.example backend/.env   # 填 LLM_API_KEY(可留空跑降级)
cd backend && python run.py            # http://127.0.0.1:8000/docs

# 3) daemon(另开终端)
cd daemon && npm install && npm run dev
# WS 只绑 ws://127.0.0.1:9223;首次启动生成配对 token 并写入 daemon/.bridge-token(0600)

# 4) Chrome 扩展
cd extension && npm run build          # → dist-pro/ 与 dist-readonly/
# chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选 dist-pro/(或 dist-readonly/)
```

## Token 配对(daemon ↔ 扩展)

daemon 启动时生成 64 位 hex token:

```bash
cat daemon/.bridge-token   # 复制这串 hex
```

扩展侧在 hello 握手中携带该 token(`{"type":"hello","mode":"pro","protocolVersion":1,"token":"<hex>",...}`)。
token 不匹配或 `protocolVersion` 不符会被 close(4001)。可用 `WEBBRIDGE_TOKEN=<hex>` 固定预共享值。
扩展连接状态见 service worker 控制台(badge `DBG`)。

## 接入 Claude Code(MCP)

```bash
# 先构建 daemon 产物
cd daemon && npm run build

# 注册进 Claude Code
claude mcp add webbridge -- node /绝对路径/daemon/dist/index.js
```

可用工具(15 个):`browser_navigate / new_tab / close_tab / switch_tab / get_tabs / snapshot /
find_in_snapshot / click / fill / press_key / scroll / evaluate / wait / screenshot / extract`,
另有可选 `browser_route`(env `WEBBRIDGE_MCP_ROUTE_TOOL=on` 时注册,调 backend 意图路由)。

## readonly / pro 双模式

| | readonly(最小权限) | pro(CDP 全权) |
|---|---|---|
| 权限 | `activeTab + scripting + storage` | `debugger + <all_urls>` |
| 通道 | 页面只读问答(选中文字 → `POST /api/context/ask`) | 导航/点击/填表/抽取/截图 |
| 写命令 | 一律 `READONLY_REJECTED` | 按 target 矩阵放行 |
| 产物 | `extension/dist-readonly/` | `extension/dist-pro/` |

完整命令×模式矩阵见 [docs/CONTRACT.md](docs/CONTRACT.md) §a.4。

## backend API 一览(127.0.0.1:8000)

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 服务与证据库状态 |
| `POST /api/route` | 意图路由(quick_answer / page_qa / deep_research / controlled_browse) |
| `POST /api/evidence/save` · `GET /api/evidence/query` · `GET /api/evidence/{id}` · `POST /api/evidence/quote` | 证据库:落库 / 检索 / 回查原文 / claim 引用校验 |
| `POST /api/deep-research`(+`/{task_id}`、`/{task_id}/stream`) | 7-Agent 高考垂直深研管线(202 受理 → 轮询 / SSE) |
| `POST /api/report` | 决策说明书,逐 claim citations(仅 evidence_id 外键) |
| `POST /api/context/ask` | 页面只读问答(readonly 通道②,XML 定界防注入) |

可选鉴权:backend 设 `WEBBRIDGE_API_TOKEN` 后,证据/报告/深研端点要求
`X-WebBridge-Token` 请求头;daemon 侧对应 `WEBBRIDGE_BACKEND_TOKEN`。
默认留空(只绑回环,零配置)。

## 高考垂直深研

深研管线保持高考志愿垂直场景:官方数据猎手 → 口碑矿工 → 时效警犬 → 矛盾侦探 → 趋势先知 → 融合 →
报告生成器。报告逐句携带 `[E:ev_*]` 引用,每条结论可回查到证据原文(`raw_ref` 指向 `daemon/artifacts/` 旁路文件)。

## 开发与发布门禁

```bash
npm test                        # daemon + extension 单测
cd backend && python -m pytest tests/ -q && python -m ruff check .
python -m pytest skills/tests -q
node scripts/check-drift.mjs    # 契约漂移校验(端口 / shared-types / 工具名 / 错误码)
bash scripts/smoke-e2e.sh       # 自动冒烟(扩展全链路为手工清单)
```

**发布前必过**:自动冒烟全绿 + [docs/E2E_SMOKE.md](docs/E2E_SMOKE.md) 人工清单全部勾选。

## 目录结构

```
shared-types/   TS 类型单一真源(WS 协议 / MCP 工具 / 错误码 / Evidence)
daemon/         MCP Server(stdio)+ WS Server(9223)+ artifacts 旁路
extension/      MV3 双模式扩展(readonly / pro,vite 构建矩阵)
backend/        FastAPI:路由 / 证据库 / 深研管线 / 报告
skills/         意图-策略定义(SCHEMA + few-shot 池,机器可校验)
app/            高考 UI(React,本轮保留未重构)
docs/           CONTRACT.md(接口真源)/ ARCHITECTURE.md / legacy(v1 历史)
```

## 免责声明

- 本工具控制的是**用户自己的浏览器**,请遵守目标网站的服务条款与 robots 约定;登录墙内的个人数据
  操作(通道④受控浏览)请逐项确认,风险自担。
- 高考志愿相关的一切分析输出**仅供参考**,最终决策以各省教育考试院、阳光高考平台等**官方最新信息**为准。
- 项目不商用,按 [AGPL-3.0](LICENSE) 开源。
