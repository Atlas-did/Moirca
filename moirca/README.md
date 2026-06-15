# Moirca - 高考志愿AI推荐工具

> 不拼数据量、拼分析逻辑差异化的高考志愿AI推荐工具
> 基于 MiroFish（62.9k Stars）多Agent群体智能引擎 + 张雪峰决策框架
> AGPL-3.0 License

## 文档导航（先看这里）

- `docs/architecture.md`：云端架构与端到端数据流
- `docs/api.md`：API 契约（给前端/测试用）
- `docs/data-schema.md`：SQLite/PG Schema 与迁移策略
- `docs/deployment.md`：云端部署与运维要点
- `docs/backlog.md`：按周可执行任务拆分（带验收口径）

同时建议把 `D:\Moirca\WORKING_DIRECTORY.md` 当作“总纲执行手册”。

## 当前实现状态（草稿）

已具备：
- FastAPI 应用工厂 + `/health`
- 决策树 API：`/api/decision/tree`、`/api/decision/analyze`
- 推荐 API：`/api/recommend`（目前为示例推荐数据，等待接入 Agent 融合）
- SQLite 初始化脚本：`backend/scripts/init_db.py`（含语料与示例专业）

待实现（按优先级）：
- 推荐条目的 `evidence[]`/`confidence` 结构（可解释输出）
- `compare`/`report`/`community` 等 API
- 公开数据导入与版本化
- 云端部署（SQLite 先上线、Secrets、CORS 收敛；后续可选迁移 PostgreSQL）

## 快速开始

```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 LLM_API_KEY

# 3. 初始化数据库 + 导入基础语料
python scripts/init_db.py

# 4. 启动后端
python run.py
```

访问：
- `GET http://localhost:8000/health`
- `GET http://localhost:8000/api/decision/tree`

## 云端部署提示

你已经确认采用“云端”。因此：
- 生产环境不要使用 `allow_origins=["*"]`
- 不要把 `LLM_API_KEY` 写入代码或提交到仓库
- 允许先用 SQLite 云端上线验证；PostgreSQL/pgvector 作为后续扩展

账号体系：
- 默认匿名使用（device_hash 或等价标识）
- 可选微信扫码登录（用于跨设备取回报告/管理导出）

报告导出：
- P2：优先 Markdown
- P3：再做 PDF

## 项目结构

```
moirca/
├── backend/           # FastAPI 后端
│   ├── app/
│   │   ├── api/       # API 路由
│   │   ├── agents/    # 七Agent系统
│   │   ├── models/    # 数据模型
│   │   ├── services/  # 业务服务
│   │   └── utils/     # 工具模块
│   ├── data/          # SQLite + 上传文件
│   └── scripts/       # 脚本工具
├── frontend/          # 前端（独立开发）
├── docs/              # 设计文档
└── tests/             # 测试
```
