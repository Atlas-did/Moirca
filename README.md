# Moirca — AI 高考志愿决策助手

> 不只看你能上什么 — 看你该不该上。

Moirca 是一个基于多 Agent 架构的高考志愿推荐工具。7 个 AI Agent 从官方数据、在校生口碑、时效性、数据矛盾、就业趋势五个维度并行分析，融合张雪峰决策框架，生成可追溯、可解释的结构化决策简报。

## 核心差异化

- 🧠 **多 Agent 多视角辩论** — 5 个 Agent 并行调研，第 6 个 Agent 融合计算，每条推荐都可追溯推理链路
- 📊 **决策说明书** — 不是"推荐你报XX"，而是"官方数据✅ + 在校生反馈⚠️ + 风险提示 + 趋势预警"
- 🎯 **张雪峰框架融入** — 就业倒推、家庭背景分流、地域套利分析，说"实在话"而非"官方话"
- 🔧 **填报辅助工具链** — 浏览器插件（moirca-webbridge）只在主动触发时读取页面，把招生网/考试院内容直接丢给 Agent 解读
- 🔄 **数据回收飞轮** — 用户匿名贡献真实填报数据 → Agent 交叉验证 → 推荐越来越准

## 架构

```
用户输入（分数/省份/决策树选择）
    ↓
7 Agent 并行管线
    ├── Agent 1 官方猎手     — 公开分数线/招生计划
    ├── Agent 2 口碑矿工     — 在校生真实体验
    ├── Agent 3 时效警犬     — 专业撤销/新增监控
    ├── Agent 4 矛盾侦探     — 三源交叉验证（官方+口碑+用户贡献）
    ├── Agent 5 趋势先知     — 张雪峰框架 + 就业倒推
    ├── Agent 6 融合炼金术士 — 加权融合 + 4 因子修正
    └── Agent 7 报告生成器   — Markdown 决策简报
    ↓
冲/稳/保分层推荐 + 风险预警 + 对比分析
```

## 项目结构

```
moirca/
├── backend/          # Python FastAPI 后端
│   ├── app/
│   │   ├── agents/   # 7 Agent 系统
│   │   ├── api/      # REST API（推荐/决策/对比/页面上下文问答）
│   │   ├── models/   # 数据模型
│   │   └── services/ # 业务服务
│   └── data/         # 数据文件（需自行准备）
├── app/              # React + TypeScript 前端
│   └── src/
│       ├── components/
│       ├── pages/
│       └── api/
└── docs/             # 文档

moirca-webbridge/     # 浏览器插件（最小权限、只读，接入 POST /api/context/ask）
```

## 快速开始

### 1. 环境要求

- Python 3.10+
- Node.js 18+
- Chrome / Edge 浏览器（用于 moirca-webbridge 插件）

### 2. 后端

```bash
cd moirca/backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key

# 初始化数据库
python scripts/init_db.py

# 启动
python run.py
# API 文档: http://localhost:8000/docs
```

### 3. 前端

```bash
cd moirca/app
npm install
npm run dev
# 前端: http://localhost:5173
```

### 4. 浏览器插件（moirca-webbridge）

只读、最小权限的 MV3 插件：浏览招生网/省考试院/阳光高考时，选中文字或直接提问，
由后端 `POST /api/context/ask` 复用现有 7 个 Agent 解读页面内容。

```
chrome://extensions → 开发者模式 → 加载已解压的扩展程序
→ 选择 moirca-webbridge/ 目录
```

详细说明见 [moirca-webbridge/README.md](moirca-webbridge/README.md)。

## 数据声明

本项目**不包含**以下数据（已通过 .gitignore 排除）：

- ❌ 爬取的第三方网站数据（kkdaxue、知乎等）
- ❌ 数据库文件（*.db）
- ❌ API 密钥（.env）
- ❌ 用户隐私数据

提供的示例数据仅包含：
- ✅ `public_scorelines_seed.json` — 少量公开分数线样本
- ✅ `kkdaxue_sample.json` — 20 条匿名校生体验样本

**如需完整数据**：请自行爬取或联系项目维护者获取数据合作方案。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python FastAPI |
| AI/LLM | OpenAI 兼容 API（支持 DeepSeek/GPT/本地模型） |
| 前端 | React + TypeScript + Vite + TailwindCSS + shadcn/ui |
| 数据库 | SQLite（可迁移 PostgreSQL） |
| 浏览器插件 | Chrome Manifest V3（最小权限：activeTab + scripting + storage，只读） |

## 开源协议

AGPL-3.0 — 详见 [LICENSE](moirca/LICENSE)

## 免责声明

本工具提供的所有分析和建议**仅供参考**，最终志愿填报决策应以各省教育考试院官方信息为准。
