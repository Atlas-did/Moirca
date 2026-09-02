# Moirca 项目重大发现与技术调研

> 从 MiroFish 深度阅读 + GitHub 调研中发现的、计划书里没覆盖的设计模式和技术方案
> 文档版本 v1.0 | 2026-05-28

---

## 一、MiroFish 深度阅读发现（被漏掉的模块）

### 1.1 完整的 MiroFish 6 阶段 Pipeline

```
文档上传 → [1] 本体论生成(LLM) → [2] Zep知识图谱构建
→ [3] 模拟准备(读图→LLM生成Agent画像→LLM生成配置)
→ [4] OASIS多轮社交模拟(Twitter+Reddit)
→ [5] 报告生成(ReACT循环+工具调用)
→ [6] Agent采访
```

| MiroFish 阶段 | LLM调用次数 | Moirca 对应 | 状态 |
|--------------|-----------|-----------|------|
| 本体论生成 | 1次 | 专业-院校本体（固定，不需要LLM生成） | 跳过 |
| Zep图谱构建 | 0 | NetworkX本地图 | ✅ 已实现 |
| Agent画像生成 | N次并行 | Agent 1-5需要LLM生成调研策略 | ❌ 未实现 |
| 模拟配置生成 | 2+N/15次 | 决策树用户配置替代 | ✅ 已实现 |
| OASIS多轮模拟 | N次/轮 | 不适用 | 跳过 |
| 报告生成(ReACT) | section*5次 | Agent 7 | ❌ 未实现 |
| Agent采访 | N次 | 用户追问 | ❌ 未实现 |

### 1.2 被忽略的关键模块

#### `zep_graph_memory_updater.py` — 实时图谱更新
MiroFish在模拟过程中，Agent每做一个动作，图谱就更新一次。
→ **Moirca应该用**: 用户每给一次反馈，推荐就变一次。Session状态实时更新。

#### `simulation_ipc.py` — 文件级IPC协议
Flask和OASIS进程之间通过JSON文件通信，无网络依赖，可审计。
→ **Moirca应该用**: Agent 1-5与Agent 6之间用文件传递调研结果（已融入TaskScheduler）。

#### `report_agent.py` (ReACT循环) — 工具调用+反思框架
```
LLM思考→调用工具→获取结果→反思→再调用工具→最多5轮→生成章节
```
→ **Moirca应该用**: Agent 7报告生成器继承这个ReACT模式。

#### `oasis_profile_generator.py` — 并行LLM调用框架
ThreadPoolExecutor并发、失败降级、JSON修复。
→ **Moirca应该用**: Agent 1-5并行调研时用同样的并发模式。

#### `ontology_generator.py` — 自动实体关系抽取
从文档中自动发现实体类型和关系。
→ **Moirca应该用**: 从kkdaxue的10075条数据中自动发现"专业-就业方向"新关系。

#### `zep_tools.py` — 工具即数据模式
每个工具返回结构化结果 + `to_text()` 方法供LLM消费。
→ **Moirca应该用**: Agent 1-5的输出都应该是 `to_text()` 友好格式。

---

## 二、Agent 框架调研

### 2.1 结论：不引入框架，借鉴设计模式

| 框架 | 核心理念 | 对Moirca的价值 | 采纳 |
|------|---------|--------------|------|
| **SemaClaw** | DAG Teams: LLM生成任务图→确定性调度 | Agent 1-5并行→Agent 6融合的调度模型 | ✅ 已融入TaskScheduler |
| **OpenRath** | Session是第一公民，Agent读写Session | Session贯穿全流程的状态管理 | ✅ 已融入SessionManager |
| **CrewAI** | Role→Task→Crew三层抽象 | Agent角色定义模板 | 参考 |
| **AutoGen** | 对话式协作，LLM决定谁发言 | Agent间协商机制（冲突时辩论） | 参考 |
| **LangGraph** | 状态图+条件分支+断点续跑 | 复杂流程的checkpoint机制 | 参考 |
| **MiroFish IPC** | 文件级JSON协议 | 跨进程Agent通信 | ✅ 已融入TaskScheduler |

### 2.2 关键设计决策

**为什么不用CrewAI/LangGraph**:
- CrewAI不支持条件分支和循环（线性流程，Moirca需要Agent4/6的依赖条件判断）
- LangGraph引入LangChain重型依赖，Moirca只需要轻量调度
- MiroFish已有的IPC模式更简洁，且已验证可用

**SemaClaw DAG Teams 的核心洞察**:
> 很多框架存在"伪编排"问题——名义上的编排Agent实际上在做大部分推理，而不是产生可验证、可执行的任务分解。DAG Teams把LLM的灵活性用于任务分解，把确定性调度用于执行可观测性。

**对应Moirca**: 决策树确定用户画像（确定性）→ 任务图固定结构（确定性）→ Agent 1-5用LLM做弹性调研 → Agent 6融合公式（确定性）。

---

## 三、教育 RAG 项目调研

### 3.1 可直接参考的开源项目

| 项目 | 核心价值 | 对Moirca的启发 |
|------|---------|--------------|
| **MyVirtualCollegeAdvisorAgentExample** | 结构化过滤→语义搜索→推荐 | **两阶段筛选**: 先用硬条件筛，再深度调研 |
| **GangDan（纲担）** | 完全离线，知识提取→题目生成 | **灵魂拷问**: 从融合结果提取矛盾→生成反向提问 |
| **DeepTutor (HKU, 17.8k⭐)** | 多Agent+交互可视化+知识盲点 | **覆盖缺口检测**: "你没有任何省外志愿/医学备选" |
| **CohortRAG Engine** | 教育RAG生产级标杆(94.2%) | RAG质量三指标: 准确率/响应时间/成本 |
| **MaxKB (15k⭐)** | 国产开源，20+模型，零代码嵌入 | RAG知识库构建参考 |
| **EduGen** | ReAct教育Agent+测验生成+闪卡 | Agent 7报告交互模式 |

### 3.2 关键启发

**两阶段筛选模式** (来自 MyVirtualCollegeAdvisor):
```
阶段1: 结构化过滤（分数/省份/排除类别）→ 候选集从N缩小到M
阶段2: Agent深度调研（只调研M个候选）→ 大幅减少LLM调用
```

当前Moirca把"所有专业都给Agent调研"，如果候选集从300个专业缩小到20个，LLM调用量减少93%。

**交叉验证检索** (来自 CohortRAG):
```
检索策略: Dense(语义) + Sparse(BM25关键词) + Cross-Encoder重排序
Moirca对应: 官方猎手(结构化查询) + 口碑矿工(语义搜索) + 时效警犬(时间过滤)
             → Agent 6 融合时做交叉验证
```

---

## 四、已实现的新模块

### 4.1 Session 状态管理器 (`services/session_manager.py`)

继承 OpenRath Session Graph 核心理念。

```
UserProfile → Session.created
  → decision_tree(session)       → session.steps[0]
  → agent_1~5.parallel(session)  → session.agent_outputs
  → agent_6.fusion(session)     → session.fusion_results
  → agent_7.report(session)     → session.report
  → session.completed
```

关键设计:
- **不可变历史**: 每一步的状态快照可回溯，`steps[]` 记录完整执行链
- **自动状态推导**: `_derive_status()` 根据已完成步骤自动判断当前阶段
- **JSON持久化**: 每一步完成后自动保存，断电/崩溃后可恢复
- **版本备份**: 每次保存前备份旧版本（`.bak.json`）

### 4.2 DAG 任务调度器 (`services/task_scheduler.py`)

继承 SemaClaw DAG Teams + MiroFish IPC。

管线 DAG:
```
decision_tree
    │
    ├──→ Agent1(官方猎手) ──┐
    ├──→ Agent2(口碑矿工) ──┤
    ├──→ Agent3(时效警犬) ──┼──→ Agent6(融合) ──→ Agent7(报告)
    └──→ Agent5(趋势先知) ──┘
    Agent4(矛盾侦探) ────────┘  (等1+2完成即可)
```

关键设计:
- **拓扑排序编译**: `_topo_sort()` 将DAG编译为分层执行计划
- **并行层**: ThreadPoolExecutor，Agent 1/2/3/5 同时启动
- **条件层**: Agent 4 只要 1+2 完成就开始（不等全部）
- **串行层**: Agent 6 等全部上游，Agent 7 等 Agent 6
- **断点续跑**: 已完成步骤自动跳过
- **自动重试**: 指数退避，最多N次
- **合并策略**: 并行结果线程安全合并

---

## 五、Moirca 完整架构（更新版）

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (用户自建)                        │
│  分数输入 → 决策树问答 → 推荐结果 → 追问交互                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI 后端                             │
│                                                             │
│  /api/decision  →  DecisionTreeEngine                      │
│  /api/recommend →  TaskScheduler.run(session)               │
│  /api/compare   →  (P2)                                    │
│  /api/report    →  (P2)                                    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              TaskScheduler (DAG)                      │  │
│  │                                                      │  │
│  │   Layer 0: decision_tree (确定性规则)                  │  │
│  │   Layer 1: [Agent1∥Agent2∥Agent3∥Agent5] (并行LLM)   │  │
│  │   Layer 2: [Agent4] + [Agent6] (条件+串行)           │  │
│  │   Layer 3: [Agent7] (报告生成)                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              SessionManager                          │  │
│  │                                                      │  │
│  │   UserProfile → agent_outputs → fusion_results → report │
│  │   每步 JSON 持久化，不可变历史，断点续跑                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐   │
│  │ Knowledge │  │ Agent6   │  │ ModelRouter            │   │
│  │ Graph     │  │ Fusion   │  │ (本地/云端/降级)        │   │
│  │ (NetworkX)│  │ Alchemist│  └────────────────────────┘   │
│  └──────────┘  └──────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、待实现清单（按优先级）

| 优先级 | 任务 | 从哪里学 | 预计工时 |
|--------|------|---------|---------|
| P0 | Agent 1-5 LLM调研（替换Mock） | oasis_profile_generator 并行模式 | 12h |
| P0 | kkdaxue数据→知识图谱扩充 | ontology_generator 关系抽取思路 | 6h |
| P1 | Agent 7 报告生成器(ReACT) | report_agent.py 循环框架 | 12h |
| P1 | 两阶段筛选（硬过滤→深度调研） | MyVirtualCollegeAdvisor | 4h |
| P1 | 灵魂拷问生成器 | GangDan 知识提取+反向提问 | 6h |
| P2 | 覆盖缺口检测 | DeepTutor 知识盲点发现 | 4h |
| P2 | RAG质量监控 | CohortRAG 三指标体系 | 6h |
| P2 | `/api/compare` 对比分析 | admissionsystem 并行志愿算法 | 8h |

---

## 七、技术踩坑备忘录（新增）

| # | 问题 | 原因 | 解决方案 |
|---|------|------|----------|
| 8 | Agent 6分数都很低 | MockAgentOutputs评分随机且方差大，置信度校准惩罚过重 | 需要真实Agent 1-5输出替换Mock |
| 9 | Uvicorn reload不生效 | 文件修改后reloader没检测到变化 | taskkill强制重启 |
| 10 | .strip() on None | risk初始化为None但调用了.strip() | `risk.strip() if risk else None` |
| 11 | MiroFish模块"扫一眼就跳过" | 被模块名误导（以为zep_tools只是Zep封装，实际是完整的工具即数据模式） | 每个模块至少读3层深度才判断价值 |
