# 数据 Schema（SQLite 先上线｜PostgreSQL 可选迁移）

> 目标：先用 SQLite 跑通并支持云端上线（P0-P2），后续在数据规模/并发需要时再迁移 PostgreSQL（建议 P3+）。
> 原则：字段尽量同构，减少迁移成本。

## 1. 当前已实现（SQLite）

当前 `backend/app/models/database.py` 已创建表：
- `users`
- `student_profiles`
- `scores`
- `professions`
- `community_data`
- `agent_outputs`
- `fusion_results`
- `reports`

并在 `scripts/init_db.py` 额外创建：
- `wisdom_corpus`

---

## 2. 生产可选（PostgreSQL）

### 2.1 必须能力
- 事务与并发（云端多用户）
- 可备份/可恢复
- 可观测（慢查询、索引优化）

### 2.2 可选能力（P2 以后）
- `pgvector`：用于 RAG 向量检索（公开数据块、独家数据块、政策文本块）

---

## 3. 关键表说明（业务语义）

### 3.1 `community_data`（护城河核心）
建议补充字段（后续迁移时加）：
- `source_type`：friend / alumni / user_upload
- `verified_by` / `verified_at`
- `evidence_url`（如允许存证）

### 3.2 `agent_outputs`
建议把 `output_json` 的结构统一成：
- `score`（0-100）
- `reasons`（列表）
- `citations`（引用列表）
- `freshness_date` 或 `freshness_score`

### 3.3 `reports`
建议增加：
- `data_version` / `rule_version` / `model_name`
- `confidence_overall`

---

## 4. 数据版本与可追溯

为了“可解释 + 可复现”，建议引入：
- 数据版本号：如 `public_data_snapshot_2026-06-20`
- 规则版本号：如 `risk_tier_v1`
- 模型版本：如 `gpt-4o-mini` / `qwen-plus`

最小实现：在报告 `meta` 中返回这些字段即可。

---

## 5. 迁移策略（建议路径）

1. P0-P2：SQLite 跑通并允许云端上线验证
2. P3+（满足任一条件再迁移）：
   - 并发写入明显增加（多用户同时生成报告）
   - 需要更严谨备份/恢复与审计
   - RAG/向量检索成为刚需（再引入 pgvector）
3. 迁移动作：
   - 确认最终字段
   - 提供迁移脚本（SQLite → PostgreSQL）
   - 切换 `DATABASE_URL`（或在 Config 中支持两种连接）

