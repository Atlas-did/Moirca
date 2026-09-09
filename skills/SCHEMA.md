# SKILL 格式规范(skills/SCHEMA.md)

> 版本:v2.0(2026-09-06,AGENT_06 撰写)
> 上位契约:`docs/CONTRACT.md`(工具名以 §b 为准、evidence 字段以 §c 为准、通道标签以 §d 为准)
> 效力:`skills/**/skill.json` 必须符合本规范;`skills/tests/test_skill_format.py` 为机器校验,违反即 CI 失败。

---

## 1. 定位

skill 是**意图与策略的声明文件**,不是机械步骤脚本(技术原则 9):

- 它告诉 AI 客户端"什么样的输入算命中本 skill、按什么策略生成动作序列、如何验证每步生效、失败怎么恢复、采到的东西怎么落证据库"。
- 它**不包含**逐条硬编码 steps;动作序列由客户端/prompt.md 话术按 `strategy.plan` 的指导现场生成。
- 它**不是代码**:仓库不解析执行 skill.json;唯一机器校验是格式一致性(pytest),零新增运行时依赖。

## 2. 目录约定

```
skills/
  SCHEMA.md                  本文件
  <domain>/<skill>.json 命名的 skill.json + 同目录 prompt.md
  shopping/skill.json        示例:compare-prices(多标签比价)
  learning/skill.json        示例:digest-page(页面只读问答+摘录入库)
  research/skill.json        示例:verify-claims(核实一条陈述)
  scrape/skill.json          示例:structured-table(按 schema 抽表格)
  qa/skill.json              示例:ask-on-page(当前页问答,通道②)
  gaokao/skill.json          示例:verify-admission-policy(高考垂直:核实招生章程)
  tests/test_skill_format.py 格式校验(pytest,零依赖)
```

- 一个目录 = 一个领域(domain)= 一个 skill 文件。领域是**可插拔场景预留**:新增场景只需新增目录 + 符合本规范的 skill.json,不改任何框架代码(原则 11:接口仅预留,不实作)。

## 3. skill.json 字段定义

顶层固定 7 个键,**多余键不允许**(校验器强制):

```jsonc
{
  "name": "string,必填,格式 '<skill-id>'(短横线小写);必须与本目录领域语义一致",
  "description": "string,必填,一句话说明本 skill 做什么、走哪条通道",
  "version": "string,必填,semver(如 '2.0.0')",

  "intents": [                       // 必填,非空数组;给路由器(AGENT_01)的 few-shot 样例
    {
      "trigger_examples": ["string"], // ≥3 条真实用户口吻例句;逐字同步进 docs/ROUTING.md 的 few-shot 池
      "channel": "page_qa | deep_research | controlled_browse",
                                       // 通道②/③/④;通道①(quick_answer)不设 skill(客户端自答)
      "effort": "low | medium | high", // 预估动作量/耗时,供路由器 estimate 参考
      "confidence_hint": 0.0~1.0      // 命中建议置信度,只作提示不作决策
    }
  ],

  "strategy": {
    "plan": {                          // 意图→动作序列的"生成指导",禁止写成逐条 steps
      "overview": "string,一段话描述总体策略",
      "phases": [                      // 阶段式指导,每阶段说清"用什么工具、达成什么、注意什么"
        { "phase": "string", "guidance": "string", "tools": ["browser_*"] }
      ],
      "invariants": ["string"]         // 全程不变的硬约束(如"绝不在用户当前标签 navigate")
    },
    "verification_rules": [            // 每条动作后如何确认生效(回读 delta)
      { "after": "browser_* 工具名或动作类别", "check": "string,判定'生效'的可观测标准" }
    ],
    "failure_recovery": [              // 失败恢复策略(执行→验证→重试≤2 次→中止并说明)
      { "condition": "string,失败情形", "action": "string,处理策略" }
    ],
    "safety": {
      "write_level": "readonly | low | high",   // 分级定义见 docs/SAFETY_LADDERS.md
      "targets_allowed": ["activeTab", "newTab"] // 只能取 CONTRACT §a.3 的 target 词汇
                                                  // readonly skill 只许 ["activeTab"]
    }
  },

  "evidence_policy": {               // 连接证据层(CONTRACT §c);不许 skill 与证据层脱节
    "save": true,                     // 是否落库;false 时本 skill 不产生 evidence
    "channel_hint": "page_qa | deep_research | controlled_browse",
                                      // 【本规范扩展字段】建议 daemon POST /api/evidence/save 的
                                      // channel 值(CONTRACT §c.3 默认 controlled_browse,skill 可给更准提示)
    "fields": ["url", "title", "quote", "locator", "source_quality", "task_id", ...],
                                      // ⊆ CONTRACT §c.1 evidence 表字段;声明本 skill 能填哪些
    "source_quality_hint": "official | authoritative | community | unknown"
  },

  "tools": ["browser_*"]             // ⊆ CONTRACT §b.1 的 15+1 工具名;readonly skill 禁写类工具
}
```

### 3.1 硬性规则(校验器强制)

| # | 规则 | 依据 |
|---|------|------|
| R1 | `tools` ⊆ CONTRACT §b.1 工具名全集 | 原则 10 对齐 MCP 工具面 |
| R2 | `write_level=readonly` 时 `tools` 不得含写类工具(navigate/new_tab/close_tab/switch_tab/click/fill/press_key/scroll/evaluate),且 `targets_allowed=["activeTab"]` | CONTRACT §a.4 矩阵 |
| R3 | `write_level ∈ {low,high}` 时 `targets_allowed` 必须含 `"newTab"` 且**不得含**无修饰的 `"activeTab"` 用于写动作 | 原则 1:不抢当前标签 |
| R4 | skill.json 全文禁止出现 `http://` / `https://` 字面 URL(站点名可出现在例句文字里;URL 模板至多作 prompt.md 中标注 example 的示例) | 任务书约束:URL 模板只作 example |
| R5 | `trigger_examples` 逐字出现在 `docs/ROUTING.md` 的 few-shot 池中,且 label 与 `channel` 一致 | 防样例漂移 |
| R6 | `evidence_policy.fields` ⊆ {evidence_id, channel, url, title, fetched_at, source_quality, quote, locator, raw_ref, task_id, created_at} | CONTRACT §c.1 |
| R7 | `evidence_policy.save=true` 时 `fields` 至少含 url、quote、locator | 证据可回查的最小集(§c.2) |
| R8 | 每个 skill 目录必须有 `prompt.md`,且含"只读默认 / 写动作分级确认 / 高危屏蔽"三类护栏条目 | 任务书第 4、5 条 |

### 3.2 ref 与快照消费约定(所有 skill 通用)

- 动作定位优先用 `browser_snapshot` 返回的 `ref`(`e\d+`);ref 只在其来源 `snapshotId` 对应页面状态有效,失效即 `REF_STALE` → 按 `failure_recovery` 重新 snapshot,**不自动重试点击**(CONTRACT §b.2)。
- 优先消费 daemon 附加的 `digest`(≤2k token)做判断;需要完整文本再回读 `text`/`fileRef`(§b.2)。
- 截图只供人复核,禁止作为动作依据(原则 3)。

## 4. prompt.md 规范

每个 skill 的 prompt.md 给 AI 客户端的**角色话术与约束**,固定六节:

1. `## 角色与边界` — 你是谁,只做本 skill 声明的事;
2. `## 触发与澄清` — 何时启用、命中模糊时先问一次(原则 6:一次 1 问 + ≤4 选项);
3. `## 执行策略` — 按 skill.json `strategy.plan` 现场生成动作序列的指导话术;
4. `## 验证与恢复` — 每步"执行→验证→重试(≤2 次)→中止并说明",不静默跳过(CONTRACT §g.2 AGENT_06 条);
5. `## 证据与引用` — evidence_policy 落库要求,结论句逐句带 `[E:ev_xxx]`(§c.2);
6. `## 安全护栏` — 只读默认、写动作分级确认、高危屏蔽(清单见 `docs/SAFETY_LADDERS.md`)。

URL 模板若必须出现,须标 `example:` 前缀并给出同义替代路径("也可用站内搜索框填写关键词",即不写死 URL 为唯一路径)。
