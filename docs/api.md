# API 契约（对前端/测试友好）

> 说明：当前实现已有 `/api/decision/*` 与 `/api/recommend`（示例数据）。本文定义“目标稳定契约”，用于后续迭代不破坏前端。

## 1. 通用约定

### 1.1 响应包装
- 成功：HTTP 200/201，返回 JSON
- 失败：HTTP 4xx/5xx，返回：

```json
{ "error": { "code": "INVALID_ARGUMENT", "message": "...", "details": {} } }
```

### 1.2 字段命名
- 请求/响应字段使用 `snake_case`
- 时间使用 ISO8601 字符串

### 1.3 账号体系（当前决策）
- **默认匿名**：服务端以 `device_hash` 或等价匿名标识来关联用户与报告
- **可选微信扫码登录**：用于跨设备取回报告、管理导出权限（P3+ 可逐步增强）
- API 层面：P2 不强制鉴权；若登录，建议以 `Authorization: Bearer <token>` 携带身份

---

## 2. 健康检查

### `GET /health`

响应：
```json
{ "status": "ok", "version": "0.1.0" }
```

---

## 3. 决策树

### 3.1 获取决策树
`GET /api/decision/tree`

响应：
```json
{ "tree": { "step1": { "id": "score_tier", "question": "...", "options": [] }, "step2": {}, "step3": {} } }
```

### 3.2 分数段分析（规则版）
`POST /api/decision/analyze`

请求：
```json
{ "score": 550, "full_mark": 750, "province": "广东", "exam_type": "general" }
```

响应：
```json
{
  "score": 550,
  "full_mark": 750,
  "percentage": 73.3,
  "tier": "B",
  "tier_desc": "...",
  "suggest_ratio": { "冲": "30%", "稳": "40%", "保": "30%" }
}
```

### 3.3 提交答案并生成候选池（P1 增加）
`POST /api/decision/answer`

请求：
```json
{
  "score": 550,
  "province": "广东",
  "exam_type": "general",
  "answers": { "step1": "B", "step2": "D", "step3": "A" }
}
```

响应（建议）：
```json
{
  "profile": { "score": 550, "province": "广东", "score_tier": "中上", "priority": "就业前景优先", "exclusion": "排除数学/物理密集型专业" },
  "candidate_pool": {
    "majors": ["080901", "080902"],
    "schools": ["深圳大学", "广东工业大学"],
    "filters": ["..."]
  }
}
```

---

## 4. 推荐与风险

### `POST /api/recommend`

请求：
```json
{ "score": 550, "province": "广东", "step1": "B", "step2": "D", "step3": "A", "top_n": 10 }
```

响应（目标稳定结构）：
```json
{
  "profile": { "score": 550, "province": "广东", "score_tier": "中上", "priority": "就业前景优先", "exclusion": "..." },
  "recommendations": [
    {
      "rank": 1,
      "tier": "冲",
      "school": "...",
      "major": "...",
      "match_score": 85,
      "reason": "...",
      "risk_note": "...",
      "evidence": [
        { "type": "public_data", "label": "近三年最低分", "value": "...", "source": "..." },
        { "type": "wisdom", "quote": "...", "source": "wisdom_corpus#12" }
      ],
      "confidence": 0.72
    }
  ],
  "tier_summary": { "冲": { "count": 2 }, "稳": { "count": 4 }, "保": { "count": 4 } },
  "warnings": ["推荐仅供参考，最终以官方信息为准"],
  "meta": { "rule_version": "v1", "data_version": "2026-05-28", "model": "..." }
}
```

---

## 5. 对比（P1/P2）

### `POST /api/compare`

请求：
```json
{
  "left": { "school": "A校", "major": "A专业" },
  "right": { "school": "B校", "major": "B专业" },
  "profile": { "score": 550, "province": "广东" }
}
```

响应：
```json
{
  "summary": "...",
  "dimensions": [
    { "name": "录取概率", "left": "...", "right": "...", "winner": "left" },
    { "name": "就业前景", "left": "...", "right": "...", "winner": "right" }
  ],
  "risks": ["..."],
  "evidence": ["..."]
}
```

---

## 6. 报告（P2）

- `POST /api/report`：生成 Markdown（或返回 job_id）（P2）
- `POST /api/report/pdf`：导出 PDF（P3）
- `GET /api/report/{report_id}`：读取报告

建议报告结构固定：
- 用户输入摘要
- 决策树路径回放
- 推荐 TopN（冲稳保）
- 风险与不确定性
- 对比结论
- 引用与数据版本

---

## 7. 页面上下文问答（浏览器插件 `moirca-webbridge`）

供浏览器插件把「当前网页的选中文字/整页正文 + 用户问题」喂给现有 Agent 解读。
只读、最小化：只传文本片段，后端不落库、不记录敏感字段。

### `POST /api/context/ask`

请求：
```json
{
  "page_title": "XX大学2026年招生简章",
  "page_url": "https://...",
  "context_text": "……页面正文或选中文字（≤12000 字符，超出截断）……",
  "question": "这个专业 610 分能上吗？招生计划有什么变化？",
  "agent_id": "master"
}
```

`agent_id` 取值：`master` / `zhang` / `data` / `risk` / `parents` / `senior` / `workplace`

响应：
```json
{
  "answer": "……Agent 解读……",
  "model_used": "llm",
  "agent_id": "master",
  "agent_name": "主控 Agent",
  "truncated": false
}
```

`model_used`：`llm`（走大模型）或 `fallback`（未配置可用 key 时的规则降级答复，接口仍可用）。

### `GET /api/context/ping`

供插件在设置页检测后端连通性与 LLM 状态，不触发任何外部请求。

响应：
```json
{
  "ok": true,
  "service": "moirca",
  "llm_configured": false,
  "agents": ["master", "zhang", "data", "risk", "parents", "senior", "workplace"]
}
```

