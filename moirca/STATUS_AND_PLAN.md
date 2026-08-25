# Moirca 项目状态与执行计划

> 最后更新: 2026-05-29 (项目暂停，文档归档) | DeepSeek V4 | 前后端联通 | kkdaxue 10076 条 | 异步推荐 | SSE 流式 | 深色模式 | 卡片视图 | 分步报告 | 9 标签左侧栏

---

## 一、已完成清单

### 1.1 后端核心管线

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 应用工厂 | `app/__init__.py` | ✅ | FastAPI + CORS + 统一错误响应 |
| 配置管理 | `app/config.py` | ✅ | 双模型（DeepSeek/本地）+ 绝对路径 DB |
| LLM 客户端 | `app/utils/llm_client.py` | ✅ | OpenAI 兼容格式，`chat()` + `chat_json()` |
| 日志 | `app/utils/logger.py` | ✅ | RotatingFileHandler + UTF-8 |
| 重试 | `app/utils/retry.py` | ✅ | 指数退避装饰器 |
| 文件解析 | `app/utils/file_parser.py` | ✅ | PDF/DOCX/MD/TXT + 编码检测 |
| 多模型路由 | `app/services/model_router.py` | ✅ | 简单→本地 / 复杂→云端 / 失败降级 |

### 1.2 七 Agent 系统

| Agent | 文件 | LLM | 功能 |
|-------|------|-----|------|
| BaseAgent | `agents/base.py` | ✅ | LLM→降级→标准化输出 |
| Agent 1 官方猎手 | `agents/agent1_official_hunter.py` | ✅ | 分数线/招生计划/学科评估 |
| Agent 2 口碑矿工 | `agents/agent2_word_of_mouth.py` | ✅ | 社区情感分析 + kkdaxue 数据 |
| Agent 3 时效警犬 | `agents/agent3_freshness_dog.py` | ✅ | 专业目录变更/新设风险 |
| Agent 4 矛盾侦探 | `agents/agent4_conflict_detective.py` | ✅ | 官方vs口碑交叉验证 |
| Agent 5 趋势先知 | `agents/agent5_trend_prophet.py` | ✅ | 张雪峰框架(就业倒推/AI替代/家庭分流) |
| Agent 6 融合炼金术士 | `agents/agent6_fusion_alchemist.py` | ✅ | 加权融合 + 4因子修正 |
| Agent 7 报告生成器 | `app/services/report_service.py` | 🔶 | Markdown 生成，缺 ReACT 闭环 |

### 1.3 知识图谱

| 模块 | 文件 | 状态 |
|------|------|------|
| NetworkX 本地图（默认） | `services/graph_service.py` | ✅ 10专业 + 7院校 + 8就业 + 32边 |
| 上传文档→LLM 构图 | `services/graph_builder_service.py` | ✅ 有 Key 用 LLM 抽取，无 Key 用规则 |
| 图谱可视化数据 | `api/graph_data.py` | ✅ 默认图 / 按 graph_id / 按 document_id |

### 1.4 API 端点（已实现 + 已验证）

| 端点 | 方法 | 功能 | 验证 |
|------|------|------|------|
| `/health` | GET | 健康检查 | ✅ |
| `/api/decision/tree` | GET | 三步决策树定义 | ✅ |
| `/api/decision/analyze` | POST | 分数→分段分析 | ✅ |
| `/api/decision/answer` | POST | 提交答案→候选池 | ✅ |
| `/api/recommend/` | POST | Agent 1-5 调研→Agent 6 融合→TopN（同步） | ✅ LLM 40s |
| `/api/recommend/async` | POST | 异步推荐（立即返回 job_id） | ✅ |
| `/api/recommend/status/{id}` | GET | 查询异步任务进度+结果 | ✅ |
| `/api/compare/` | POST | 两两志愿 4 维度对比 | ✅ |
| `/api/chat/` | POST | 7 Agent 角色对话（LLM/fallback） | ✅ |
| `/api/graph-viz/data` | GET | 图谱节点+边（适配前端 Canvas） | ✅ |
| `/api/documents/upload` | POST | 文件上传 + 自动构图 | ✅ |
| `/api/report/generate` | POST | 报告生成（Markdown） | 🔶 |
| `/api/agents/roles` | GET | Agent 角色定义 | ✅ |
| `/api/interview/ask` | POST | Agent 采访 | ✅ |

### 1.5 前端（React + TypeScript + shadcn/ui）

| 组件 | 接的后端 API | 状态 |
|------|------------|------|
| ScoreInputBar | `POST /api/recommend/` | ✅ 真实 Agent LLM |
| VolunteerTable | 推荐结果渲染 | ✅ 冲稳保分层 + 收藏 |
| AHPMatrix | `POST /api/compare/` | ✅ AI 预填滑块 |
| AgentChat | `POST /api/chat/` | ✅ 单 Agent 对话 |
| FullChat | `POST /api/chat/` ×6 并行 | ✅ 6 Agent 辩论 |
| KnowledgeGraph | `GET /api/graph-viz/data` | ✅ 跟随上传文档自动刷新 |
| FileUploadPanel | `POST /api/documents/upload` | ✅ 上传→构图→绑定 |
| DeepResearch | 硬编码 | 🔶 待接真实数据 |
| ChartPanel | 硬编码 | 🔶 待接推荐数据 |
| VersionUpdate | `GET /api/graph-viz/data` + `POST /api/recommend/` | ✅ 真实刷新 |

### 1.6 数据与工具

| 项目 | 状态 |
|------|------|
| SQLite 数据库 (11 表) | ✅ |
| 张雪峰语料库 (30 条) | ✅ |
| kkdaxue 社区数据 | ✅ **2000 条已加载**（506 专业, 2054 学校） |
| kkdaxue 全量爬取 (10076 条) | ✅ 脚本已验证，全量已入库 |
| DeepSeek V4 接入 | ✅ 5 Agent 全部 LLM |
| Vite 代理 (前端→后端) | ✅ 支持 `VITE_BACKEND_URL` |

---

## 二、当前质量评估

### 能做什么

- 输入分数+省份+偏好 → 等 40s → 得到 5 个 Agent 用 DeepSeek V4 分析的推荐结果
- 上传成绩单 → 自动抽取知识图谱 → 前端 Canvas 渲染
- 和 7 个不同角色的 Agent 对话（张雪峰/学长/职场/数据/风险/爸妈/主控）
- 两两对比志愿 → AI 预填滑块 → 手动微调 → 雷达图
- 拔掉 API Key → 0.1s 规则引擎降级（产品不挂）

### 还不能做什么

- 推荐分数偏低（20-50 分），因为没有真实分数线/位次数据做差异化
- 报告是 LLM 一次性生成，不会"缺证据→去查→补证据"
- 没有异步任务队列（推荐 40s 是同步等待）
- 没有单元测试

---

## 三、下一步执行计划

### P0（本周，让产品"能用"） — 3/3 已完成 ✅

#### ✅ P0-1：VersionUpdate 接上后端

- 点击 → `GET /api/graph-viz/data` 刷新图谱 + `POST /api/recommend/` 刷新推荐
- 进度条显示真实步骤（拉取图谱→刷新推荐）
- 前端已完成：`VersionUpdate.tsx`

#### ✅ P0-2：推荐数据源

kkdaxue 10076 条自动导入（`init_db()` 从 `kkdaxue_all.json` 加载），Agent 2 有真实社区数据。推荐分数差异化已明显改善。

#### P0-2b：公开分数线数据（待别人做）

当前仍缺：1 省份近 3 年分数线/位次硬数据。Agent 1（官方猎手）仍靠 LLM 常识评分。

根因：没有分数线/位次/招生计划等"硬数据"。

方案：
- 手工收集 1 个省份（广东）近 3 年计算机类专业的分数线/位次
- 存入 SQLite → Agent 1（官方猎手）调研时读取
- 有了真实数据锚点，评分自然分化

预计：4h（数据收集）+ 2h（入库+Agent 读取）

#### ✅ P0-3：推荐 API 异步化

- `POST /api/recommend/async` → 立即返回 `job_id`
- `GET /api/recommend/status/{job_id}` → 进度+结果
- 后端已完成，前端 ScoreInputBar 待改为异步调用

### P1（下周，让推荐"靠谱"）

#### ✅ P1-2：前端异步接入

`ScoreInputBar` 已支持双按钮（同步/异步），异步模式 1.2s 轮询进度。

#### ✅ P1-5：SSE 流式对话

`POST /api/chat/stream` + `sendMessageStream()`，Agent 对话逐字显示。

#### ✅ P1-6：深色模式

CSS 变量（`--bg/--text/--card-bg/--border-color`），ThemeToggle 组件，localStorage 持久化。

#### ✅ 推荐卡片视图

`CardView.tsx`，表格/卡片一键切换，冲(红)稳(蓝)保(绿)色标。

#### ✅ 交互式分步报告

`GuidedReport.tsx`，4 步引导（画像→推荐→风险→复核），进度点导航。

#### ✅ 左侧栏扩展

从 5 个标签扩展到 9 个（对话/志愿表/对比/图谱/Agent/上传/历史/报告/资源），右边栏功能可在左边全屏使用。

#### P1-2：证据标准化

当前：evidence 里有 Agent 评分但没有"数据点"类型的证据。

目标：每条推荐的 evidence 包含：
- `public_data`：分数线/位次（来自数据库）
- `wisdom`：张雪峰语录引用
- `community`：kkdaxue 社区反馈引用
- `agent`：Agent 分析依据

预计：4h

#### P1-3：独家数据模板

当前：计划书"护城河 1"核心未落地。

目标：创建 Excel/CSV 模板（学校/专业/隐形门槛/转专业难度/毕业去向），朋友网络填写。

预计：2h（模板设计）+ 持续收集

#### P1-4：最小单元测试

目标：`/api/recommend`、`/api/compare`、Agent 6 融合公式的契约测试。

预计：4h

### P2（第 3-6 周，走向上线）

## 留待别人继续的（移交清单）

| # | 任务 | 说明 | 预计工时 |
|---|------|------|---------|
| 1 | 公开数据收集 | 1 省份（广东）近 3 年计算机类分数线/位次 → SQLite → Agent 1 读取 | 6h |
| 2 | Agent 7 ReACT 报告 | 参考 MiroFish `report_agent.py`，缺证据→去查→补证据的闭环 | 12h |
| 3 | 异步任务队列 | Celery/RQ 统一管理 simulation/report/graph 后台任务 | 8h |
| 4 | 数据库写入业务数据 | `agent_outputs`/`fusion_results`/`reports` 表接入主流程 | 4h |
| 5 | 单元测试 | `/api/recommend`、`/api/compare`、Agent 6 融合公式的契约测试 | 4h |
| 6 | SQLAlchemy ORM | 替代裸 sqlite3，方便迁移 PostgreSQL | 4h |
| 7 | CORS 收敛 + 部署 | `allow_origins` 白名单，Docker Compose 一键部署 | 4h |
| 8 | `/api/compare/` 去硬编码 | 院校层次/就业确定性数据来自数据库 | 2h |
| 9 | DeepResearch/ChartPanel 接真实数据 | 两个面板仍用硬编码数据 | 4h |
| 10 | WebSocket 实时通信 | 替代轮询，真正的实时 Agent 进度推送 | 6h |

#### P2-1：Agent 7 报告 ReACT 循环

当前：LLM 一次性生成报告。

目标：报告生成时，Agent 7 能调用工具（图谱检索/官方数据查询）补证据。

参考：MiroFish `report_agent.py` 的 ReACT 循环。

预计：12h

#### P2-2：异步任务队列

统一 simulation / report / graph 的后台任务管理。

预计：8h

#### P2-3：数据库写入业务数据

当前：`agent_outputs`/`fusion_results`/`reports` 表空着。

目标：每次推荐/报告生成后写入 SQLite。

预计：4h

#### P2-4：前端 DeepResearch + ChartPanel 接真实数据

当前：两个面板都是硬编码。

目标：DeepResearch 接报告 API，ChartPanel 接推荐结果动态渲染。

预计：4h

#### P2-5：部署与上线

- Docker Compose 一键部署
- CORS 收敛（不用 `*`）
- 环境变量管理

预计：4h

---

## 四、技术债务（不阻塞但应修）

| 项目 | 说明 |
|------|------|
| `session_manager.py` 未接入主 API | 已有完整实现，但 `/api/recommend` 等还没用 |
| SQLAlchemy ORM 替代裸 sqlite3 | 方便后续迁移 PostgreSQL |
| `/api/compare/` 硬编码字典 | 院校层次/就业确定性应来自数据库 |
| `deep_copy_session()` 通过 JSON 序列化 | 不够优雅，应改为 `copy.deepcopy` |
| 无 CI/CD | 没有自动化测试/构建流水线 |

---

## 五、MiroFish 前端 vs Moirca 前端（差距分析）

深入研读 MiroFish 全部 27 个前端文件后发现：

| MiroFish 有 | Moirca 有吗 | 优先级 |
|------------|-----------|--------|
| 5 步 pipeline 进度指示器 | ❌ | P2 |
| D3 力导向图谱（节点详情/边标签/图例） | 🔶 Canvas 简化版 | P2 |
| **实时轮询进度**（任务/图谱/模拟/报告） | 🔶 后端已支持，前端未接 | **P1** |
| Agent 人设卡片展示 | ❌ | P2 |
| 模拟动作时间线（Twitter/Reddit 帖子流） | ❌ 不需要 | — |
| 报告生成监控（Agent 日志/工具调用/控制台） | 🔶 有 API，无 UI | P2 |
| Agent 批量采访/问卷 | 🔶 有 API，无 UI | P2 |
| **历史项目数据库**（首页卡片列表+导航） | ❌ | **P1** |
| Markdown 报告渲染（标题/代码/引用/列表） | ❌ | P2 |
| 系统日志面板（终端风格） | ❌ | P2 |

**Moirca 独有（MiroFish 没有的）：** 志愿填报表、AHP 矩阵、决策树问答、7 个高考 Agent 对话

### P1 新增任务（来自 MiroFish 差距分析）

#### P1-5：前端异步轮询接入

ScoreInputBar 改用 `POST /api/recommend/async` + 轮询，显示真实进度条。

预计：1h

#### P1-6：历史项目列表

仿 MiroFish `HistoryDatabase` 组件，首页展示过往推荐/报告，支持点击回到历史结果。

预计：4h

---

## 七、当前启动方式

```bash
# 终端 1: 后端
cd D:\Moirca\moirca\backend
python run.py
# → http://localhost:8000/docs

# 终端 2: 前端
cd D:\Moirca\moirca\app
npm run dev
# → http://localhost:3000

# 终端 3: 全量爬取 kkdaxue（可选）
cd D:\Moirca\moirca\backend
python scripts/crawl_kkdaxue.py --mode crawl
```

API Key 已在 `.env` 中配置（DeepSeek V4），无需额外操作。

---

## 八、关键文件索引

| 想了解 | 看这个文件 |
|--------|----------|
| 项目架构与数据流 | `docs/architecture.md` |
| API 契约 | `docs/api.md` |
| 数据库 Schema | `docs/data-schema.md` |
| 调研发现 | `docs/PROJECT_INSIGHTS.md` |
| 部署指南 | `docs/deployment.md` |
| AI 工作日志 | `ai_work/WORK_LOG.md` |
| 原始计划书 | `Moirca_Project_Work_Plan_v2(3).docx` |
