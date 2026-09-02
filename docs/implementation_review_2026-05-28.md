# Moirca 当前实现复盘（准确版｜2026-05-28）

> 目标：回答“我已经做了什么、怎么做的、还差多少没做、哪里可优化”。

---

## 1. 你列的能力清单：完成度对照

### 1) 上传文档 → 文本提取
- 状态：**已补齐（可用）**
- 你原本：已有 `FileParser` 支持 PDF/Markdown/TXT。
- 我补了：
  - 增加 DOCX 提取能力（`python-docx`）
  - 增加上传 API（FastAPI `UploadFile`）

### 2) 用户输入分数+省份+决策树选择
- 状态：**已存在（可用）**
- 现有：`/api/decision/*` + `DecisionTreeEngine` + `/api/recommend`（已能接收 score/province/step1/2/3）。

### 3) LLM 生成本体论（实体类型+边类型）
- 状态：**已补齐（可用；有 key 真调用、无 key 模板降级）**

### 4) LLM 生成“专业-院校-就业”实体关系定义
- 状态：**已补齐（同上）**

### 5) 构建知识图谱（Zep Cloud 节点+边）
- 状态：**部分补齐（可选路径）**
- 说明：
  - 当前 Moirca 默认走本地 NetworkX 图谱；
  - 我新增了 `/api/zep/build` 作为“可选”的 Zep 写入入口：只有你装了 `zep-cloud` 且配置 `ZEP_API_KEY` 才能用。

### 6) 用 NetworkX 构建本地知识图谱
- 状态：**两条路径都存在**
  - 既有：`KnowledgeGraph`（默认内置 10 专业 + 学校 + 就业边，供推荐接口用）
  - 新增：`/api/graph/build`（从文本抽取三元组 → 构图 → 落盘 JSON）

### 7) 读取图谱 → 生成 Agent 画像（每个实体一个 AI 人格）
- 状态：**未做（仍缺）**
- 目前只做了：7 个 Agent 的“角色定义（role cards）”，还没有“每个实体一个人格”的 profile 生成器。

### 8) 7 个 Agent 角色定义（官方猎手/口碑矿工/时效警犬...）
- 状态：**已补齐（可用）**
- 提供：`/api/agents/roles`

### 9) 多平台社会模拟（Twitter+Reddit，N轮）
- 状态：**已补齐骨架（可跑通；不抓真数据）**
- 当前实现是“生成式模拟”（有 key 用 LLM 生成多轮帖子；无 key 返回模板），用于把管线打通。
- 但它仍然是**进程内 job**，重启会丢状态，未接入真实抓取/持久化队列。

### 10) 多 Agent 并行调研（官方/口碑/时效/冲突/趋势→融合）
- 状态：**部分已做**
  - 已有：Agent6 融合算法实现（`agent6_fusion_alchemist.py`）
  - 仍缺：Agent1-5 的“真实工具链”（爬虫/RAG/检索/证据打分）与并行调度

### 11) 报告生成（ReACT循环 + 工具调用）
- 状态：**已补齐骨架（Markdown 产出；无 ReACT 工具闭环）**
- 说明：
  - 目前 `/api/report/generate` 支持：有 LLM key 时生成 Markdown；无 key 输出模板报告。
  - 还没实现“ReACT + 工具调用”的循环（例如：缺证据→去图谱/官方源检索→补证据→再写报告）。

### 12) 模拟后采访 Agent（追问与复核）
- 状态：**已补齐（可用；有 key 真对话、无 key 模板）**
- 提供：`/api/interview/ask`

---

## 2. 我具体干了什么（改动清单）

### 2.1 新增的 API 端点
- 文档：
  - `POST /api/documents/upload`
- 本体论：
  - `POST /api/ontology/generate`
  - `POST /api/ontology/relation-defs`
- 图谱（本地 NetworkX 落盘 JSON）：
  - `POST /api/graph/build`
  - `GET /api/graph/{graph_id}/stats`
  - `GET /api/graph/{graph_id}/export`
- Zep（可选）：
  - `POST /api/zep/build`
- Agents：
  - `GET /api/agents/roles`
- 采访：
  - `POST /api/interview/ask`
- 模拟：
  - `POST /api/simulation/run`
  - `GET /api/simulation/{simulation_id}`
- 报告：
  - `POST /api/report/generate`
  - `GET /api/report/{report_id}`

### 2.2 新增/修改的关键文件
- 修改：
  - backend/app/utils/file_parser.py（新增 docx 提取）
  - backend/app/config.py（允许 docx；增加 ZEP 配置占位）
  - backend/requirements.txt（新增 python-docx、python-multipart）
  - backend/app/api/__init__.py（注册新路由）
- 新增：
  - backend/app/api/documents.py
  - backend/app/api/ontology.py
  - backend/app/services/ontology_service.py
  - backend/app/services/graph_builder_service.py
  - backend/app/api/graph.py
  - backend/app/services/zep_graph_service.py
  - backend/app/api/zep.py
  - backend/app/agents/roles.py
  - backend/app/api/agents.py
  - backend/app/api/interview.py
  - backend/app/services/simulation_service.py
  - backend/app/api/simulation.py
  - backend/app/services/report_service.py
  - backend/app/api/report.py

---

## 3. 我是怎么干的（实现思路）

### 3.1 “有 LLM key / 无 LLM key”双模式
为了你能先联调端到端（即使没配 key），我把新增模块都做成两条路径：
- 有 `LLM_API_KEY`：真实调用 `LLMClient.chat_json/chat` 做抽取/生成
- 无 key：返回模板/空图/占位回答（接口结构稳定、前端先跑通）

### 3.2 图谱的两条路线：NetworkX 默认 + Zep 可选
- NetworkX：
  - 优点：本地可控、零外部依赖、适合 P0-P2 快速上线
  - 我补了：从文本抽 triples → MultiDiGraph → JSON 落盘
- Zep：
  - 你想要“节点+边”的云端图谱，我提供了最小写入入口 `/api/zep/build`
  - 但为了不强绑 `zep-cloud`，我把它做成“可选依赖”，需要你明确安装与配置。

---

## 4. 还没有干的（真正缺口）

> 下面这些才是“从骨架变成真产品”的关键。

1) **Agent1-5 的真实数据源与证据体系**
- 现在推荐里 Agent1-5 仍然是 mock 输出（在 recommendation.py 里生成）
- 需要落地：
  - 官方数据抓取/结构化（招生章程/计划/培养方案）
  - 口碑信号（社区/内容平台）与去偏
  - 时效评分（发布日期、政策版本）
  - 冲突检测（证据归因）

2) **“每个实体一个人格”的 Agent 画像生成**
- 现在只有角色卡，没有 entity-level persona（例如“某专业/某院校的AI人格”）。

3) **ReACT 循环 + 工具调用闭环**
- 当前报告生成是“一次性写完”，缺：
  - 发现缺证据 → 调用图谱/官方检索工具 →补证据 → 再生成

4) **异步任务/持久化**
- simulation 目前是进程内内存任务表；重启就丢。
- graph/report 落盘了文件，但没写入 SQLite 的 `reports/agent_outputs` 表。

5) **Zep Cloud 的严格本体映射**（如果你坚持 Zep）
- 我提供了最小写入入口，但没有把本体严格 set_ontology 到 Zep（MiroFish 有完整做法可参考）。

---

## 5. 哪里可以优化（建议按优先级）

### P0 立刻做（最值回票价）
1) **把 mock Agent 输出改成“可引用证据片段”结构**
- 让 Agent1-5 输出统一字段：`score/confidence/freshness/source_urls/quotes[]`
- Agent6 融合时把 quotes 作为 evidence 带进推荐结果

2) **把 report/simulation/graph 的产物写进 SQLite**
- 你已有 `agent_outputs` / `reports` 表，接起来后才像“系统”而不是“demo”。

3) **把图谱构建输入改为“上传文档ID”而不是直接 text**
- 当前 `/api/graph/build` 直接传 text；下一步应当：上传→提取→graph_build

### P1 做（让质量明显上一个台阶）
4) **官方数据最小爬取器**（先 1 省份）
- 只做可验证数据：招生计划/专业目录/批次线的其中一个

5) **冲突侦探的“冲突归因”**
- 冲突不仅是分数差，还要指出：冲突来自哪个来源、哪个时间版本

### P2 做（走向可上线）
6) **任务队列（Celery/RQ/Arq 任一）**
- 把模拟/构图/报告生成都变成异步任务 + 状态轮询

7) **CORS 与安全基线**
- `allow_origins=["*"]` 仅限开发；上线需要白名单与上传大小限制/文件扫描策略

---

## 6. 如何验证（你现在就能点起来）

### 6.1 启动（建议用 8002/8003 避免端口占用）
在 Windows PowerShell：
- `d:/Moirca/.venv/Scripts/python.exe -m uvicorn app:create_app --factory --app-dir d:/Moirca/moirca/backend --host 127.0.0.1 --port 8002`

### 6.2 Swagger
- http://127.0.0.1:8002/docs

---

## 6. 需要修正的历史误报/过时判断

### 6.1 `recommendation.py` 的 `strategy_label` 不是作用域 bug
当前代码里 `strategy_label` 在 `for r in fusion_results` 循环内部每次都会重新赋值，因此**不会**被“最后一次值污染所有项”。

### 6.2 `session_manager.py` 文件名不准确
报告中提到的 `session_manager.py`，在当前仓库里实际对应的是 [task_scheduler.py](../backend/app/services/task_scheduler.py#L477) 的 `deep_copy_session()`。

### 6.3 simulation/report 已有骨架，不应再写成“没做”
当前这两块已经有可调用 API：
- [simulation](../backend/app/api/simulation.py)
- [report](../backend/app/api/report.py)

准确表述应为：**“已补齐骨架，但还缺真实数据闭环、持久化和 ReACT 工具调用”**。

---

## 7. 结论：你“差多少”

如果按“能演示完整链路”算：
- 你现在已经具备：输入→推荐（含融合逻辑雏形）→（可选）模拟→报告→采访 的 **端到端骨架**。

如果按“能真正上线、结论可信”算：
- 目前还缺：**真实数据源 + 证据标准化 + 冲突归因 + ReACT 工具闭环 + 持久化/异步化**。
