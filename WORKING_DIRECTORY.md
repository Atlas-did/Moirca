# Moirca 项目工作目录（执行版）

> 基于 MiroFish 多 Agent 架构 + 张雪峰决策框架
> 文档版本 v0.2 | 更新日期 2026-05-28
> 当前决策：云端部署｜FastAPI｜保留公开数据 + 朋友网络独家数据

---

## 一、项目概述

**一句话**：不拼数据量、拼分析逻辑差异化的高考志愿 AI 推荐工具。

**核心差异化**：
1. 垂直数据护城河 — 真实在校生内部资料（转专业难度、隐形门槛、真实毕业去向）
2. 分析逻辑差异化 — 决策树透明化，每个推荐都有可解释的判断依据
3. 信任背书 — UP主内容合作，先给价值再谈合作
4. 社区飞轮 — 用户贡献真实录取数据 → 推荐更准 → 更多用户

---

## 二、范围与边界（MVP 强约束）

### 2.1 MVP 只做三件事（P0-P2 必须可用）
1. **AI 志愿推荐**：分数/省份 + 决策树选择 → 输出 TopN 方案（含可解释依据）
2. **风险预警**：冲/稳/保分层 + 关键风险提示（滑档、调剂、时效、数据冲突）
3. **对比分析**：A 志愿 vs B 志愿横向对比（录取概率、风险、理由、数据来源）

### 2.2 明确不做（避免范围膨胀）
- AI 估分、性格/职业测试（MVP 不做）
- 社交模拟/虚拟城市演化（MiroFish 的 OASIS 模拟能力在本项目不做核心依赖）
- 大而全的数据覆盖（先做 1 个省份跑通，再扩省）

### 2.3 质量红线（上线门槛）
- 每条推荐都必须给出“为什么推荐”的可解释依据（数据点 + 规则/推理）
- 明确提示数据来源与时效；低置信度方案必须降级展示或隐藏
- 输出必须附免责声明：仅供参考，最终以官方信息为准

---

## 三、总体架构（云端版）

### 3.1 云端数据流（端到端）
用户输入（分数/省份/决策树选项）
→ **规则/检索层**（公开数据 + 独家数据 + 语料）
→ **多 Agent 并行调研**（官方/口碑/时效/冲突/趋势）
→ **融合计算**（权重×时效衰减×叙事匹配×置信度校准×张雪峰修正）
→ **报告生成**（推荐 + 冲稳保 + 风险 + 对比结论 + 数据引用）
→ 返回前端（可下载/可分享）

### 3.2 云端部署形态（建议）
- API：FastAPI（容器化）
- DB：**SQLite 先上线**（P0-P2），后续按压力与数据规模再迁移 PostgreSQL
- 向量检索：pgvector（可选，建议 P3+ 再引入）
- 任务调度：后台任务队列（P2 视情况引入）

### 3.3 隐私与合规（云端版本表述）
由于你已明确“云端”，隐私承诺不能再写成“零服务端/我们看不到任何数据”。本项目建议采用：
- **最小化采集**：只保存实现推荐所需的最小字段（分数、科类、省份、决策树选择），默认匿名
- **账号体系**：匿名为主（device_hash 或等价标识），可选微信扫码登录（用于跨设备取回报告/管理导出）
- **敏感字段分级**：朋友网络内部数据与用户数据分库/分表，并设置访问权限
- **日志脱敏**：严禁把成绩/身份证/手机号等写入日志
- **数据保留策略**：默认 30/90 天可配置；提供一键删除用户数据能力

---

## 四、项目目录结构（现状 + 规划）

### 4.1 现状（你当前已有的草稿实现）
`D:\Moirca\moirca` 已存在并具备：
- FastAPI 应用工厂与健康检查
- `/api/decision`（决策树定义 + 分数段规则分析）
- `/api/recommend`（P0 示例推荐，待接入 Agent 融合）
- SQLite 表结构初始化脚本（含 `wisdom_corpus` + `professions` 示例数据）

### 4.2 目录结构（规划 + 状态标注）

```
D:\Moirca\
├── Moirca_Project_Work_Plan_v2(3).docx   # 项目计划书
├── MiroFish-main\                          # 参考项目（只读）
│   └── MiroFish-main\
│       ├── backend\                        # Flask + Zep + OASIS
│       ├── frontend\                       # Vue 3 + Vite + D3
│       ├── locales\                        # i18n
│       ├── docker-compose.yml
│       └── Dockerfile
├── moirca\                                 # Moirca 主项目（正在实现）
│   ├── README.md
│   ├── LICENSE                             # AGPL-3.0
│   ├── .env.example
│   ├── docker-compose.yml
│   │
│   ├── backend\                            # Python FastAPI（已存在）
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   ├── run.py
│   │   ├── app\
│   │   │   ├── __init__.py
│   │   │   ├── config.py                   # 配置管理
│   │   │   ├── api\                        # API路由（decision/recommend 已有，其他待补）
│   │   │   │   ├── __init__.py
│   │   │   │   ├── decision.py             # 决策树API
│   │   │   │   ├── recommendation.py       # 推荐API
│   │   │   │   ├── comparison.py           # 对比分析API
│   │   │   │   ├── report.py               # 报告生成API
│   │   │   │   └── community.py            # 社区数据API
│   │   │   ├── models\                     # 数据模型
│   │   │   │   ├── __init__.py
│   │   │   │   ├── user.py
│   │   │   │   ├── profile.py
│   │   │   │   ├── profession.py
│   │   │   │   ├── score.py
│   │   │   │   ├── community.py
│   │   │   │   └── report.py
│   │   │   ├── agents\                     # 七Agent系统（待实现）
│   │   │   │   ├── __init__.py
│   │   │   │   ├── agent1_official_hunter.py    # 官方猎手
│   │   │   │   ├── agent2_word_of_mouth.py      # 口碑矿工
│   │   │   │   ├── agent3_freshness_dog.py      # 时效警犬
│   │   │   │   ├── agent4_conflict_detective.py # 矛盾侦探
│   │   │   │   ├── agent5_trend_prophet.py      # 趋势先知（含张雪峰框架）
│   │   │   │   ├── agent6_fusion_alchemist.py   # 融合炼金术士
│   │   │   │   └── agent7_report_generator.py   # 报告生成器
│   │   │   ├── services\                   # 业务服务（decision_tree/model_router 已有雏形）
│   │   │   │   ├── __init__.py
│   │   │   │   ├── decision_tree.py        # 决策树引擎
│   │   │   │   ├── rag_service.py          # RAG检索服务
│   │   │   │   ├── model_router.py         # 多模型路由
│   │   │   │   ├── privacy_guard.py        # 隐私保护
│   │   │   │   └── data_collector.py       # 数据收集/爬取
│   │   │   └── utils\
│   │   │       ├── __init__.py
│   │   │       ├── llm_client.py           # LLM客户端（继承自MiroFish）
│   │   │       ├── file_parser.py
│   │   │       └── logger.py
│   │   ├── data\                           # 数据（开发：SQLite；生产：PostgreSQL）
│   │   │   ├── moirca.db                   # SQLite（开发/演示）
│   │   │   └── uploads\
│   │   └── scripts\                        # 工具脚本
│   │       ├── crawl_scores.py             # 分数线爬取
│   │       ├── crawl_majors.py             # 专业数据爬取
│   │       └── import_community_data.py    # 独家数据导入
│   │
│   ├── frontend\                           # 前端（可独立开发；仓库已预留脚手架）
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   ├── src\
│   │   │   ├── main.js
│   │   │   ├── App.vue
│   │   │   ├── router\
│   │   │   │   └── index.js
│   │   │   ├── api\                        # API调用层
│   │   │   │   ├── index.js
│   │   │   │   ├── decision.js
│   │   │   │   ├── recommendation.js
│   │   │   │   └── report.js
│   │   │   ├── views\                      # 页面
│   │   │   │   ├── Home.vue                # 首页（输入分数+省份）
│   │   │   │   ├── Decision.vue            # 决策树问答（3步选择题）
│   │   │   │   ├── Recommendation.vue      # 推荐结果页（冲/稳/保分层）
│   │   │   │   ├── Comparison.vue          # 对比分析页
│   │   │   │   ├── Report.vue              # 报告页
│   │   │   │   └── Community.vue           # 社区数据页
│   │   │   ├── components\                 # 组件
│   │   │   │   ├── StepIndicator.vue       # 决策树步骤指示器
│   │   │   │   ├── ScoreInput.vue          # 分数输入组件
│   │   │   │   ├── TierChart.vue           # 冲稳保可视化
│   │   │   │   ├── RadarChart.vue          # 能力雷达图
│   │   │   │   ├── RecommendationCard.vue  # 推荐卡片
│   │   │   │   └── RiskWarning.vue         # 风险提示组件
│   │   │   ├── store\                      # 状态管理
│   │   │   │   └── index.js
│   │   │   ├── i18n\                       # 国际化
│   │   │   │   └── index.js
│   │   │   └── assets\
│   │   └── public\
│   │
│   ├── locales\                            # 多语言文件
│   │   ├── zh.json
│   │   ├── en.json
│   │   └── languages.json
│   │
│   ├── docs\                               # 文档（本次会补齐）
│   │   ├── architecture.md                 # 架构与数据流（云端版）
│   │   ├── api.md                          # API 约定（请求/响应/错误码）
│   │   ├── data-schema.md                  # SQLite/PostgreSQL Schema 与迁移策略
│   │   ├── backlog.md                      # 可执行任务拆分（按阶段/验收）
│   │   └── deployment.md                   # 云端部署与运维（Docker/Secrets/日志）
│   │
│   └── tests\                              # 测试
│       ├── test_agents\
│       ├── test_api\
│       └── test_services\
│
└── WORKING_DIRECTORY.md                    # 【本文件】工作目录说明
```

---

## 五、阶段与里程碑（带验收口径）

### P0（第 1 周）：示例 + 最小数据链路跑通
**目标**：做出一份“可发给 UP 主看的完整示例”，同时把数据链路跑通到可重复。

**必须交付**：
- 示例报告 1 份（含决策树路径、推荐、冲稳保、风险、对比）
- 公共数据样本：1 个省份、近 3 年（分数线/位次/招生计划至少其一）
- 独家数据样本：至少 15 条结构化记录（学校/专业/隐形门槛等）

**验收**：
- 任意新用户输入后 ≤ 2 分钟得到结果（允许先用规则 + 语料）
- 报告中每条推荐至少包含 2 条可追溯依据（数据点或引用语料）

### P1（第 2 周）：决策树交互 + 基础推荐（非示例）
**目标**：从“示例能跑”升级为“用户可用”。

**必须交付**：
- 决策树 3 步完整 API（树定义/分支/结果）
- 推荐接口返回结构稳定（方便前端渲染）
- 冲/稳/保规则版本化（可追溯，支持 A/B 调参）

**验收**：
- 关键接口有最小单测/契约测试（至少 10 条样例）

### P2（第 3-6 周）：MVP 上线（云端可访问）
**目标**：三大功能完整可用，且能在云端给外部用户试用。

**必须交付**：
- Agent 1/3/4/6/7 至少跑通一条链路（优先官方/时效/冲突/融合/报告）
- 对比分析功能（同一套“可解释依据”规则）
- 部署文档 + 一键部署（Docker Compose 或等价方式），**允许 SQLite 云端部署**

**验收**：
- 端到端 ≤ 5 分钟生成报告（可后台异步）
- 风险提示可解释、且不夸大承诺

### P3（第 7 周起）：增长与迭代
- 社区飞轮（录取结果上传/审核/解锁）
- UP 主合作素材库（多省份示例）
- 数据扩省与质量提升
- 报告 PDF 导出（P3）
- 视规模迁移 PostgreSQL/pgvector（P3+）

---

## 六、API 契约（MVP 必备端点）

> 说明：当前代码仅实现 `/api/decision/*` 与 `/api/recommend`，下面是“目标契约”，用于指导后续实现与前端对接。

### 6.1 决策树
- `GET /health`：健康检查
- `GET /api/decision/tree`：获取决策树
- `POST /api/decision/analyze`：分数段分析（规则/RAG）
- `POST /api/decision/answer`：提交 3 步选择并返回候选池（P1 增加）

### 6.2 推荐与风险
- `POST /api/recommend`：返回推荐列表 + 冲稳保 + 风险提示 + 解释

### 6.3 对比
- `POST /api/compare`：对比两个（或多个）志愿方案（P1/P2）

### 6.4 报告
- `POST /api/report`：生成 Markdown 报告（P2）
- `POST /api/report/pdf`：导出 PDF（P3）
- `GET /api/report/{report_id}`：读取报告

### 6.5 独家数据与管理
- `POST /api/community/import`：导入朋友网络数据（CSV/JSON）
- `GET /api/community/search`：按学校/专业检索独家信息

---

## 七、数据与存储策略

### 7.1 数据源分层
- **公开数据**：考试院/阳光高考（分数线/位次/招生计划/院校专业）
- **独家数据**：朋友网络内部资料（必须结构化、可追溯）
- **语料库**：张雪峰语录/框架（用于解释与趋势修正）

### 7.2 存储策略（开发 vs 生产）
- 开发：SQLite（方便快速迭代）
- 生产（P0-P2）：SQLite 也允许（先上线验证）
- 生产（P3+）：视并发/数据规模迁移 PostgreSQL；RAG 再视情况引入 pgvector

### 7.3 迁移策略（建议）
- P0/P1 用 SQLite 跑通流程
- P2 上线前：定义同构 Schema（字段一致），提供一次性迁移脚本

---

## 八、风险与对策（执行版）

| 风险 | 触发点 | 对策（必须可执行） |
| --- | --- | --- |
| 反爬失效 | 目标站升级/封禁 | Playwright + 限速 + 多源备份 + 离线数据包 |
| 数据版权/ToS | 抓取规则不合规 | 严格遵守 robots/限速；在产品内标注来源与用途 |
| AI 幻觉 | 无依据胡说 | RAG grounding + 引用证据 + 低置信度降级 + 冲突提示 |
| 独家数据不足 | 朋友网络填不动 | P0 就把模板做成“能 5 分钟填完”；先少而精 |
| 云端隐私争议 | 用户不信任 | 最小化采集 + 清晰隐私声明 + 数据可删 + 日志脱敏 |

---

## 九、P0 立即执行清单（可直接开工）

1. 把 `moirca/docs` 补齐：架构 / API / Schema / 部署 / Backlog
2. 把决策树与推荐的请求/响应定成稳定契约（前端先能接）
3. 把示例报告生成流程跑通：输入 → 推荐 → 风险 → 对比 → Markdown
4. 导入基础语料与示例专业数据（已在 `scripts/init_db.py`）
5. 采集 1 个省份近 3 年公开数据（先手工/半自动都可以）


## 三、开发阶段总览

| 阶段 | 时间 | 工期 | 目标 | 关键产出 |
|------|------|------|------|----------|
| **P0** | 第1周 | 1周 (38h) | 完整示例 + 数据收集启动 | 志愿分析示例 + 数据模板 + 5人数据收集 |
| **P1** | 第2周 | 1周 (48h) | 决策树框架可交互 | 3步问答 + 基础推荐 + 冲稳保分层 |
| **P2** | 第3-6周 | 4周 (134h) | MVP完整上线 | 6Agent集成 + 融合 + 报告 + 独家数据 |
| **P3** | 第7周起 | 持续 | 用户反馈迭代 | 算法优化 + UP主合作 + 数据增长 |

**总工时**: 220小时（约5.5人·周），6周完成MVP

---

## 四、核心模块详细说明

### 4.1 七Agent系统

| Agent | 名称 | 职责 | MVP优先级 |
|-------|------|------|-----------|
| Agent 1 | 官方猎手 | 爬取阳光高考+省考试院公开数据 | P2 |
| Agent 2 | 口碑矿工 | 知乎/B站专业口碑采集+情感分类 | P2 |
| Agent 3 | 时效警犬 | 专业撤销/新增/改名时效监控 | P2 |
| Agent 4 | 矛盾侦探 | 官方数据vs口碑数据交叉验证 | P2 |
| Agent 5 | 趋势先知 | 就业倒推+政策文件趋势预测（含张雪峰框架） | P2 |
| Agent 6 | 融合炼金术士 | 五路Agent输出融合+权重计算+Top10推荐 | P2 |
| Agent 7 | 报告生成器 | Markdown+图表+灵魂拷问+风险提示 | P2 |

### 4.2 决策树三步问答（护城河2核心）

```
Step 1: 你的分数在省内什么位置？
  A. 前5%（顶尖）→ 冲985/211
  B. 前5%-15%（较好）→ 冲211/稳一本
  C. 前15%-40%（普通）→ 稳一本/冲好二本
  D. 40%以后 → 二本/专科方向

Step 2: 你最看重什么？
  A. 学校名气 → 优先985/211
  B. 专业实力 → 优先专业排名
  C. 城市发展 → 优先一线/新一线
  D. 就业前景 → 优先高薪专业

Step 3: 有没有特别不喜欢的？
  A. 不想学数学/物理
  B. 不想进工厂/工地
  C. 不想当老师/医生
  D. 没有特别限制
```

### 4.3 MVP三大功能

1. **AI志愿推荐** — 分数+省份 → 决策树引导 → AI推荐10个志愿 + 每志愿有判断依据
2. **风险预测** — 冲/稳/保分层 + 风险提示
3. **对比分析** — 学校/专业/录取率/风险横向对比

---

## 五、技术方案

### 5.1 MVP阶段（快速验证）

| 层级 | 选型 | 原因 |
|------|------|------|
| AI应用框架 | Dify / FastGPT | 可视化编排，1周跑通核心流程 |
| 外部推理 | Sub2API (gpt-5.4) | 复杂推理（报告生成、决策分析） |
| 本地推理 | DeepSeek V4 (Ollama) | 简单查询降本 |
| 数据存储 | SQLite | MVP轻量，后续迁移PostgreSQL |
| 数据爬取 | Python Playwright | 浏览器自动化 |
| 前端 | Dify内置 / 简易React | P0/P1阶段极简 |

### 5.2 长期自建方案（MVP验证后迁移）

| 层级 | 选型 |
|------|------|
| 前端 | React + TailwindCSS + shadcn/ui |
| 后端 | Python FastAPI |
| 数据库 | PostgreSQL + pgvector |
| AI | RAG架构（向量检索+LLM推理） |
| 模型路由 | DeepSeek V4（简单） + gpt-5.4（复杂） |
| 部署 | Docker Compose |

### 5.3 隐私安全边界

```
🔒 安全区（本地，完全受控）
   ├── 用户原始材料（成绩单照片、聊天记录）
   ├── SQLite/PostgreSQL 全部内容
   ├── DeepSeek V4 本地模型
   └── AES-256 加密密钥

🌐 受限区（外部网络，最小化暴露）
   ├── Agent爬虫 → 仅向公开网站发HTTP请求
   └── Sub2API → 仅传输脱敏JSON，用户API Key直发

❌ 禁区（项目方永不触碰）
   ├── 不运营中央服务器
   ├── 不收集用户行为数据
   ├── 不在代码中硬编码凭证
   └── 不要求注册账号/提供手机号
```

---

## 六、数据库核心Schema

```
users ──1:N── student_profiles ──1:N── scores
  │
  └──1:N── agent_outputs
  └──1:N── fusion_results ──N:1── professions
  └──1:N── reports
  └──1:N── review_tasks

community_data（独家数据——护城河1核心）
```

详细DDL见计划书 [P118-P121]。

---

## 七、Agent 6 融合公式

```
Score(p) = Σ[Agent_i(p) × w_i × d_i(t)] × N(p) × C(p) × Z(p)

其中:
  Agent_i(p) = 第i个Agent对专业p的原始评分（0-100）
  w_i        = 用户配置权重（默认1.0）
  d_i(t)     = 时效衰减系数（支持指数/线性/阶梯）
  N(p)       = 个人叙事匹配度
  C(p)       = 置信度校准因子（含冲突惩罚+多样性奖励）
  Z(p)       = 张雪峰框架修正（就业导向+家庭背景）
```

完整伪代码见计划书 [P124-P130]。

---

## 八、关键里程碑

| 时间 | 里程碑 | 判断标准 |
|------|--------|----------|
| W1末 | P0完成 | 完整示例可发给UP主 + 数据收集已启动 |
| W2末 | P1完成 | 决策树可交互 + 基础推荐可用 |
| W6末 | MVP上线 | 三大功能完整 + 可给UP主展示 |
| W7+ | P3迭代 | 持续收集反馈 + 联系第一位UP主 |

---

## 九、风险清单

| ID | 风险 | 等级 | 应对要点 |
|----|------|------|----------|
| R1 | 反爬机制 | P0 | Playwright模拟真实浏览器 + 多数据源切换 |
| R2 | 数据版权 | P0 | 遵守robots.txt，合理使用，注明来源 |
| R3 | AI幻觉 | P0 | RAG grounding + 交叉验证Agent + 置信度阈值 |
| R4 | UP主拒绝 | P1 | 先给价值、先做一个成功案例再复制 |
| R5 | 数据冷启动 | P1 | 朋友网络 + 公开数据兜底 + 社区激励 |
| R6 | OCR不准 | P2 | 双引擎识别 + 人工协助确认 |
| R7 | 本地模型不稳定 | P1 | Prompt降级 + 外部API兜底 |

---

## 十、GitHub 项目调研报告（2026-05-28）

### 10.1 可直接复用的核心项目

#### ⭐⭐⭐ gaokao-mentor-wisdom（强烈建议集成）
- **地址**: https://github.com/dongsheng123132/gaokao-mentor-wisdom
- **说明**: 张雪峰语录大全，结构化JSON数据，105条
- **复用价值**:
  - 6大分类JSON可直接导入SQLite → 作为RAG知识库基础
  - 每条含 `text / tags / target_audience / sentiment / confidence / related_majors`
  - 配套 `rag_chunks.jsonl` 可直接喂给向量数据库
  - MIT许可证，无合规风险
- **融合方式**: P0阶段导入作为Agent 5（趋势先知）的基础知识库

#### ⭐⭐⭐ zhangxuefeng-skill（计划书已引用，7.4k Stars）
- **地址**: https://github.com/alchaincyf/zhangxuefeng-skill
- **说明**: 张雪峰认知操作系统（Skill文件），5个核心心智模型+8条决策启发式
- **复用价值**:
  - 5个心智模型可直接映射到Agent 5（趋势先知）的推理Prompt
  - 8条决策启发式可融入Agent 6（融合炼金术士）的 `ZHANGXUEFENG_ADJUSTMENTS`
  - 安装即用的 `.skill` 文件格式可参考其Agent封装方式
- **融合方式**: 将其决策框架翻译为Python代码，嵌入 `agent5_trend_prophet.py`

#### ⭐⭐ gaokao-analytics（爬虫参考）
- **地址**: https://github.com/lyscf/gaokao-analytics
- **说明**: Python爬虫爬取高考录取分数线+招生计划+学校信息，含Flask API
- **复用价值**:
  - 爬虫逻辑可移植到 `scripts/crawl_scores.py`
  - 已有Flask API → 可改造为FastAPI路由
  - 包含分数线预测功能，可参考其算法思路
- **注意**: 目标网站可能已改版，需重新抓包适配

#### ⭐⭐ college_speciality_spider（爬虫参考2）
- **地址**: https://github.com/Aplicity/college_speciality_spider
- **说明**: 985高校历年各专业在各地区录取分数爬取
- **复用价值**:
  - IP代理池构建方案
  - 数据清洗去重逻辑（专业名模糊匹配）
  - 爬取字段与Moirca的 `professions` 表高度对齐
- **融合方式**: 爬取逻辑 → `scripts/crawl_scores.py`，代理池 → `utils/`

---

### 10.2 数据Schema参考项目

#### ⭐⭐ admissionsystem_backend（平行志愿数据库设计）
- **地址**: https://github.com/xhensonli/admissionsystem_backend
- **说明**: 广东工业大学数据库大作业，平行志愿录取系统（Java+Spring+Vue+MySQL）
- **复用价值**:
  - 核心数据库表设计可直接参考: `student / university / major / enrollment_plan / volunteer_choice / admission_result`
  - **平行志愿录取算法**核心逻辑: "分数优先、遵循志愿、一轮投档" —— 可用来做模拟投档功能
  - 前后端分离架构可参考
- **融合方式**: 数据库Schema对标优化，模拟投档算法 → `services/admission_simulator.py`

#### ⭐ College Scorecard API（美国大学数据API）
- **地址**: https://collegescorecard.ed.gov/data/api/
- **说明**: 美国教育部开放的大学数据API，含学费/毕业率/就业/收入等
- **复用价值**:
  - **数据维度设计**: 学费/毕业率/就业率/收入中位数/SAT分数等字段可类比映射到中国场景
  - API设计模式（分页/筛选/排序）可参考
  - Python SDK: `pip install college-scorecard`
- **融合方式**: 参考其数据维度，扩展 `professions` 和 `community_data` 表

---

### 10.3 AI产品架构参考

#### ⭐⭐ GradePilot（多Agent并行架构）
- **地址**: https://github.com/aimilet/GradePilot
- **说明**: 作业自动审阅Skill，3-4个子Agent并行批改
- **复用价值**:
  - **多Agent并行→汇总**的模式与Moirca的Agent 1-5并行→Agent 6融合完全一致
  - 断点续跑机制（处理长时间Agent任务）
  - 人工复核标记（对应Agent 4的矛盾升级→人工处理流程）
  - 中文适配好，有完整Python脚本
- **融合方式**: 参考其多Agent并行调度模式，优化 `agent6_fusion_alchemist.py`

#### ⭐⭐ SmartTutor（知识图谱+自适应学习）
- **地址**: https://github.com/khushichopra28/smart-tutor
- **说明**: 使用Neo4j知识图谱+Hindsight记忆层实现跨会话学生画像
- **复用价值**:
  - Neo4j知识图谱思路可替代MiroFish的Zep Cloud，用于构建"专业-院校-就业"关系网
  - 前置知识图谱遍历算法 → 可用于"用户选了A专业，自动推荐相关B/C专业"
  - **关键启发**: 用知识图谱替代Zep Cloud，实现零外部依赖
- **融合方式**: P2阶段用Neo4j（或轻量的NetworkX）替代Zep的知识图谱功能

---

### 10.4 快速原型工具

| 工具 | 地址 | 适用场景 | 与Moirca关系 |
|------|------|----------|-------------|
| **Dify** | dify.ai | AI应用可视化编排 | P0快速验证核心流程 |
| **FastGPT** | fastgpt.run | 知识库问答 | 结构化数据问答原型 |
| **MaxKB** | maxkb.cn | 知识库问答，开源私有部署 | 替代方案，隐私更友好 |
| **n8n** | n8n.io | 自动化工作流 | 爬虫+数据处理流水线 |

---

### 10.5 项目融合决策矩阵

| MiroFish模块 | MiroFish实现 | Moirca方案 | 参考来源 |
|-------------|-------------|-----------|---------|
| 知识图谱 | Zep Cloud API | Neo4j / NetworkX 本地图 | SmartTutor |
| 多Agent调度 | OASIS Simulation | 自定义Agent Pipeline | GradePilot |
| 实体/关系读取 | zep_entity_reader | RAG + pgvector检索 | 自建 |
| 图谱构建 | graph_builder (Zep) | 专业-院校-就业关系图 | SmartTutor + zhangxuefeng-skill |
| 配置生成 | LLM生成模拟参数 | 决策树引导+用户选择 | 自建 |
| 报告生成 | report_agent | Agent 7 + Markdown/PDF | zhangxuefeng-skill框架 |
| 模拟运行 | OASIS社交模拟 | 不需要 | 不适用 |
| 前端 | Vue 3 + Vite | 用户自建 | 用户决定 |
| 数据存储 | 无持久化DB | SQLite → PostgreSQL+pgvector | admissionsystem + gaokao-analytics |

---

## 十一、已确认的技术决策（最终版）

> 以下均已与用户确认，不再变动：

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 项目起点 | 基于 MiroFish 改造，新建 `moirca/` 目录 |
| 2 | 后端框架 | FastAPI（API层重写，工具模块复用MiroFish） |
| 3 | 前端 | 用户自己负责 |
| 4 | Zep Cloud | 移除，用 NetworkX 本地图替代 |
| 5 | MVP路径 | 跳过Dify，直接代码搭建 |
| 6 | 开源协议 | 继承AGPL-3.0 |
| 7 | P0策略 | 先做完整示例（给UP主看）+ 爬少量数据跑通流程 |
| 8 | 基础语料 | P0直接导入 gaokao-mentor-wisdom（105条JSON） |
| 9 | 数据库选型 | **SQLite先上线**，WAL模式，后续用SQLAlchemy ORM迁移PostgreSQL |
| 10 | 账户体系 | **默认匿名（device_hash）** + 可选微信扫码绑定 |
| 11 | 报告导出 | **先Markdown→HTML分享链接（P2）**，PDF放到P3 |
| 12 | 数据源 | kkdaxue.com（框框大学，取景框看世界运营）10075条真实就读体验 |

---

## 十二、P0 立即执行清单

> 下一步行动项：

1. 搭建 `moirca/` 目录，移植MiroFish工具模块
2. 搭建FastAPI骨架（`/api/decision`、`/api/recommend`）
3. 导入 gaokao-mentor-wisdom 105条JSON → SQLite
4. 克隆 zhangxuefeng-skill，提取决策框架 → Agent5/6 Prompt模板
5. 实现决策树三步问答核心逻辑
6. 爬取1个省份近3年分数线（验证爬虫可用）
7. 生成第一份完整志愿分析示例（可发给UP主）
