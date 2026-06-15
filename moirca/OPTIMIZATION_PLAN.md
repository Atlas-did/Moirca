# 志愿填报牛大发 — 代码审查与优化计划

> 基于 2026-06-04 全面代码审查 | 新版项目路径: D:\Moirca\志愿填报\moirca\

---

## 一、当前数据资产（核心优势）

| 数据 | 表/文件 | 数量 |
|------|---------|------|
| **真实录取分数** | `admission.db:major_scores` | **412,279 条** |
| 分数预测 | `admission.db:score_predict` | 33,796 条 |
| 院校库 | `admission.db:schools` | 2,438 所 |
| 社区评价 | `kkdaxue_all.json` | 10,076 条 |
| 知识库 | `knowledge_base.json` | 1.8 MB |
| 院校关系图 | `university_graph.json` | 849 KB |
| 张雪峰语料 | `moirca.db:wisdom_corpus` | 30 条 |

**结论：新版已有 41 万条真实录取数据，不需要额外爬取分数线。**

---

## 二、严重 Bug（需立即修复 — P0）

### Bug 1: data_context.py 读错数据库路径 ⚠️ 致命

```python
# 错误: services/data_context.py:9-10
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'admission.db')
# → 解析到 app/data/admission.db (0 字节幽灵文件!)
# 正确: 应该是 .., .., data, admission.db (上两级)
```

**影响**: 整个 Data Agent（chat.py 中的 `data` agent）读取一个空数据库，完全没有数据。

**修复**: `os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'admission.db')`

### Bug 2: ADI 模块硬编码 Linux 路径 ⚠️ 致命

```python
# adi.py:7-8, adi_service.py:3
sys.path.insert(0, '/tmp/gaokao-adi/scripts')
os.chdir('/tmp/gaokao-adi/scripts')
```

**影响**: `/adi/assess` 端点在 Windows 上必然 500 错误。

**修复**: 移除硬编码路径，使用 `Path(__file__).parent.parent / 'adi_scripts'` 或项目相对路径。

### Bug 3: chat.py 硬编码 Linux 张雪峰 Skill 路径

```python
# chat.py:319
skill_path = '/tmp/Xue-Feng-Skill/SKILL.md'
```

**影响**: Windows 上张雪峰 Agent 丢失约 800 字额外上下文，但不崩溃。

**修复**: 改为可配置路径或项目相对路径。

### Bug 4: config.py 中 .env 的 Unix 路径覆盖问题

```python
# .env 第 21 行
DATABASE_PATH=/home/dimmo/桌面/志愿填报/moirca/backend/data/moirca.db
```

**影响**: `os.environ.get('DATABASE_PATH')` 返回 Unix 路径，在 Windows 上 sqlite3 可能创建错误文件或失败。

**修复**: 在 `config.py` 中添加 `os.path.exists()` 检查，路径不存在时回退到 `project_root / 'data' / 'moirca.db'`。

---

## 三、中等 Bug（需本周修复 — P1）

### Bug 5: 前端类型不一致（4 个 tab 不存在但被使用）

```typescript
// types/index.ts
export type LeftNavTab = 'recommend' | 'compare' | 'history' | 'settings';
// 但代码中使用了:
// HistoryPanel.tsx → dispatch('graph'), dispatch('volunteer')
// Layout.tsx → state.leftNav === 'chat'
```

**影响**: 用户点击某些导航后左侧面板空白。

**修复**: 将 `'chat'`, `'graph'`, `'volunteer'`, `'agent'`, `'upload'` 加入 `LeftNavTab` 联合类型，并在 `LeftPanel.tsx` 中添加对应的渲染分支。

### Bug 6: 前端 API 调用不存在的后端端点

| 前端调用 | 后端是否存在 |
|---------|-----------|
| `fetch('/api/graph-viz/university-graph')` | ❓ 不确定 |
| `fetch('/api/graph-viz/school-info')` | ❓ 不确定 |
| `fetch('/api/chat/summarize')` | ❌ 不存在 |
| `fetch('/api/chat/poll')` | ❌ 不存在 |

**影响**: 自定义面板（CustomPanel）的总结和轮询功能完全不可用。

**修复**: 在后端 `chat.py` 中添加 `POST /api/chat/summarize` 和 `GET /api/chat/poll/{task_id}` 端点，或在前端改为调用已有端点。

### Bug 7: requirements.txt 缺少依赖

```python
# school_embedding.py 需要但未列出:
import numpy as np       # ❌ 不在 requirements.txt
import torch              # ❌ 不在 requirements.txt
from transformers import AutoTokenizer, AutoModel  # ❌ 不在 requirements.txt
```

**影响**: 所有使用学校嵌入的功能（上传文档后的学校匹配）运行时崩溃。

**修复**: 添加到 requirements.txt，或安装时自动检测。

### Bug 8: chat.py 内存泄漏

```python
# chat.py:543
_task_results: dict = {}  # 只增长，从不清理
```

**影响**: 长时间运行后内存持续增长。

**修复**: 添加定时清理逻辑（如 30 分钟 TTL 过期删除）。

---

## 四、优化建议（P2）

### 优化 1: 统一数据库连接管理

当前 database.py、data_context.py、recommendation.py 各自 `sqlite3.connect()`，没有连接池。

**建议**: 使用单一连接工厂 + 上下文管理器，避免重复创建连接。

### 优化 2: 减少 `(state as any)` 类型逃逸

`CustomPanel.tsx` 中有 30+ 处 `(state as any)` 使用。

**建议**: 在 AppState 中正确定义 `draftPlan`、`customPhase` 等类型。

### 优化 3: ADI 模块要么修好，要么暂时禁用

当前 `/adi/assess` 注册了但必然 500。要么修好路径问题，要么暂时从路由中注释掉，避免混淆。

### 优化 4: 统一数据爬取脚本目录

当前爬取脚本分散在两个地方：
- `backend/scripts/crawl_kkdaxue.py`
- `D:\Moirca\脚本\` (我们之前写的)

**建议**: 全部迁移到 `backend/scripts/` 下。

### 优化 5: 添加健康检查端点中的 DB 连接检测

`/health` 当前只返回 `{"status": "ok"}`，应增加 `db_connected: true/false`。

---

## 五、数据爬取脚本现状

### 已有的

| 脚本 | 状态 |
|------|------|
| `scripts/crawl_kkdaxue.py` | ✅ 可用（kkdaxue.com API） |
| `scripts/init_db.py` | ✅ 可用（建表 + 导入语料） |
| `scripts/build_university_graph.py` | ✅ 可用（知识图谱构建） |

### 新版独有的数据（不需要爬）

- `admission.db` (64MB): **41 万条真实录取分数**，已内置
- `knowledge_base.json` (1.8MB): 预构建知识库，已内置
- `university_graph.json` (849KB): 院校关系图，已内置

### 旧版有、新版缺少的脚本

| 脚本 | 作用 | 建议 |
|------|------|------|
| `D:\Moirca\脚本\crawl_scorelines.py` | GitHub + DeepSeek 数据采集 | 迁移到新版 scripts/ |
| `D:\Moirca\脚本\enrich_with_deepseek.py` | DeepSeek 数据补全 | 迁移到新版 scripts/ |
| `D:\Moirca\脚本\import_seed_to_db.py` | 种子数据导入 | 迁移到新版 scripts/ |
| `D:\Moirca\脚本\probe_scoreline_apis.py` | API 探路 | 迁移到新版 scripts/ |
| `D:\Moirca\脚本\crawl_with_login.py` | 登录态 Playwright 爬虫 | 迁移到新版 scripts/ |
| `D:\Moirca\脚本\scraper_ui.html` | 爬虫管理界面 | 迁移到新版 |

---

## 六、执行优先级

### 立即 (今天, 2h)
1. ✅ 修复 Bug 1: data_context.py 数据库路径
2. ✅ 修复 Bug 4: config.py DATABASE_PATH 检查
3. ✅ 修复 Bug 5: 前端 LeftNavTab/RightPanelTab 类型

### 本周 (4h)
4. 修复 Bug 2: ADI 模块路径（或暂时禁用）
5. 修复 Bug 3: chat.py 张雪峰 Skill 路径
6. 修复 Bug 6: CustomPanel API 端点
7. 修复 Bug 7: requirements.txt 补全依赖

### 下周
8. 修复 Bug 8: 内存泄漏
9. 迁移爬取脚本
10. 优化 1-5
