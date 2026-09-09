# 阶段 1 人工审查结论(放行令)

> 审查人:主智能体(代表项目负责人) · 日期:2026-09-06
> 结论:**CONTRACT.md 与 ARCHITECTURE.md 审查通过,阶段 2 放行**。

## 一、对 AGENT_00 五个 open_issues 的裁决(全部采纳)

1. **Agent 分工假设**——确认与实际分发一致:AGENT_01=意图路由/health、AGENT_02=证据库、AGENT_03=扩展、AGENT_04=daemon、AGENT_05=深研管线+报告、AGENT_06=skills、AGENT_07=清理/CI/审计。归属表无需对调。
2. **readonly 下 scroll 拒绝**——采纳(§a.4 矩阵维持)。只读问答无滚动需求,scroll 属视口写动作。
3. **digest 由 daemon(MCP 层)生成**——采纳(§a.5/§b.2 维持)。扩展 WS result 不含 digest。
4. **screenshot 在 readonly 受限允许**——采纳(captureVisibleTab + activeTab 已授权,仅 PNG,仅供人复核)。
5. **/api/report.py 判为改造而非重写**——采纳。AGENT_05 细化其请求/响应,契约仅强制 citations 字段。

## 二、给阶段 2 各 Agent 的补充指令(与本裁决同读)

- 一切以 `docs/CONTRACT.md`(592 行)+ `docs/ARCHITECTURE.md`(266 行)为准;冲突时 CONTRACT 优先。
- shared-types 单一真源:类型写在 `shared-types/src/`,extension 与 daemon 通过 workspace 路径解析到同一份;CI 校验按 §附。
- 端口一律 9223;嵌套 `moirca/` 目录禁止新增文件(AGENT_07 最终删除)。
- pip 与 npm 均可联网安装(pytest 已装;daemon npm install 已验证)。
- 各 Agent 完成后必须实际运行自己的测试并报告真实结果;跑不通的部分如实说明,不得虚报全绿。
