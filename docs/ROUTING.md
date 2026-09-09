# 意图路由样例与四通道归类(ROUTING)

> 版本:v1.0(2026-09-06,AGENT_06 撰写)
> 用途:给 AGENT_01(意图路由器,CONTRACT §d)提供**可直接进 few-shot 池**的训练样例,以及每个 skill 的通道归类依据与消歧建议。
> 样例真源:各 `skills/**/skill.json` 的 `intents.trigger_examples`;本文与 skill.json 由 `skills/tests/test_skill_format.py` 做逐字一致性校验,改样例请两边同步。

---

## 1. 四通道与 skill 的映射总览

| 通道 | CONTRACT §d label | 谁干活 | 覆盖本层的 skill | write_level |
|------|-------------------|--------|------------------|-------------|
| ① 秒答 | `quick_answer` | AI 客户端/App 自答,**不设 skill** | — | L0 |
| ② 页面只读问答 | `page_qa` | 只读快照问答 | `ask-on-page`、`digest-page`(形态A)、`verify-admission-policy`(形态A) | L0(readonly) |
| ③ 云端深研 | `deep_research` | 7-Agent 管线 / 多源查证 | `verify-claims`、`digest-page`(形态B)、`verify-admission-policy`(形态B) | L1(专用标签只读采集) |
| ④ 受控浏览收集 | `controlled_browse` | MCP browser_* + 专用标签 | `compare-prices`、`structured-table` | L1(low) |

- 通道①没有 skill:闲聊/常识由客户端直接自答,WebBridge 零参与(CONTRACT §b.1 也不提供 quick-answer 工具)。
- `label=null`(ROUTE_NO_MATCH)时上层自答、不产出拒答文案(原则 7);本文样例池**不含**应判 null 的样例,null 判定由 AGENT_01 的规则表负责兜底。

## 2. few-shot 池(AGENT_01 可直接复制)

下方 `jsonl` 块是唯一机器可读样例源(逐字与 skill.json 同步,pytest 校验)。每行字段:`text`(用户原话)/ `label`(CONTRACT §d 四分类)/ `skill`(命中 skill 名,通道①无)/ `hint`(skill.json 的 confidence_hint)。

<!-- FEW-SHOT-POOL-START -->
```jsonl
{"text": "帮我对比一下京东和淘宝上 iPad Air 的价格", "label": "controlled_browse", "skill": "compare-prices", "hint": 0.85}
{"text": "这三个平台哪个卖的机械键盘最便宜?", "label": "controlled_browse", "skill": "compare-prices", "hint": 0.85}
{"text": "查查同一款耳机在几个电商的售价和销量,给我个推荐", "label": "controlled_browse", "skill": "compare-prices", "hint": 0.85}
{"text": "这一页里作者是怎么论证结论的?", "label": "page_qa", "skill": "digest-page", "hint": 0.8}
{"text": "帮我把当前这篇论文的方法部分讲成人话", "label": "page_qa", "skill": "digest-page", "hint": 0.8}
{"text": "总结一下我打开的这个教程,重点划出来", "label": "page_qa", "skill": "digest-page", "hint": 0.8}
{"text": "把这篇文档的要点摘录下来存档,以后写东西要引用", "label": "page_qa", "skill": "digest-page", "hint": 0.8}
{"text": "把这篇 arXiv 论文完整读一遍,提炼贡献/方法/实验三部分", "label": "deep_research", "skill": "digest-page", "hint": 0.7}
{"text": "深入分析这份技术文档,给我一份结构化笔记", "label": "deep_research", "skill": "digest-page", "hint": 0.7}
{"text": "把这份教程从头到尾读一遍,每章都做存档摘要", "label": "deep_research", "skill": "digest-page", "hint": 0.7}
{"text": "网上说今年志愿填报截止时间是 7 月 1 日,帮我核实一下", "label": "deep_research", "skill": "verify-claims", "hint": 0.8}
{"text": "核实这个说法:某校今年新增了人工智能专业", "label": "deep_research", "skill": "verify-claims", "hint": 0.8}
{"text": "'每天喝柠檬水能溶解结石'这个说法是真的吗?查证一下", "label": "deep_research", "skill": "verify-claims", "hint": 0.8}
{"text": "把这页的院校录取分数表格抽成 JSON", "label": "controlled_browse", "skill": "structured-table", "hint": 0.8}
{"text": "按这个 schema 把列表页里的商品数据都抓下来", "label": "controlled_browse", "skill": "structured-table", "hint": 0.8}
{"text": "把帖子楼层的回复整理成表格,要作者/时间/内容三列", "label": "controlled_browse", "skill": "structured-table", "hint": 0.8}
{"text": "这个页面在讲什么?", "label": "page_qa", "skill": "ask-on-page", "hint": 0.9}
{"text": "选中这段,给我解释一下", "label": "page_qa", "skill": "ask-on-page", "hint": 0.9}
{"text": "这页的价格是含税的吗?", "label": "page_qa", "skill": "ask-on-page", "hint": 0.9}
{"text": "帮我看下这页报名条件里关于年龄的要求", "label": "page_qa", "skill": "ask-on-page", "hint": 0.9}
{"text": "帮我核实一下武大今年招生章程里的专业级差是多少", "label": "page_qa", "skill": "verify-admission-policy", "hint": 0.75}
{"text": "这页章程里写着调档比例不超过 105%,是真的吗?", "label": "page_qa", "skill": "verify-admission-policy", "hint": 0.75}
{"text": "查查华科招生章程对色盲考生报计算机有没有限制", "label": "page_qa", "skill": "verify-admission-policy", "hint": 0.75}
{"text": "把北大和清华今年招生章程的退档条款都查一遍,逐条核对", "label": "deep_research", "skill": "verify-admission-policy", "hint": 0.8}
{"text": "我要确认这几所学校的录取规则原文,给我逐条证据", "label": "deep_research", "skill": "verify-admission-policy", "hint": 0.8}
{"text": "逐校核对今年招生章程里对加分认可的表述,列出差异", "label": "deep_research", "skill": "verify-admission-policy", "hint": 0.8}
```
<!-- FEW-SHOT-POOL-END -->

## 3. 各 skill 归类依据与消歧建议

### 3.1 compare-prices → controlled_browse

- 判据:跨平台采集 + 多步开标签动作("对比/哪便宜 + 商品实体 + 平台名")。与"这页便宜多少"(page_qa)的区分:**有没有跨站采集需求**。
- 消歧:命中"对比"但无商品实体(如"对比一下考研和就业")→ 不进本 skill,回落规则表(可能 deep_research 或 null)。
- estimate 参考(供 `POST /api/route` 的 estimate 字段):effort=medium,建议 minutes≈5、max_evidence≈12(2-3 平台 × 3-4 条)。

### 3.2 digest-page → page_qa / deep_research(双 intent)

- 形态 A(page_qa):指代当前页 + 问释/讲解,零写动作。
- 形态 B(deep_research):"通读全篇/结构化笔记/存档引用",需要专用标签多段采集。
- 消歧:"总结"一词两态命中 → 看有没有**存档/引用/通读全篇**信号;有→deep_research,没有→page_qa。与 AGENT_01 §d 的约定一致:`page_qa` 与 `deep_research` 同分且 page_url 非空时取 page_qa。

### 3.3 verify-claims → deep_research

- 判据:"核实/是真的吗/求证/谣言" + 可判真伪命题。
- 消歧:核实对象是**院校章程条款**时让位给 `verify-admission-policy`(领域专用样例优先);核实对象无浏览需求(纯常识)→ 通道①自答。

### 3.4 structured-table → controlled_browse

- 判据:"抽成 JSON/整理成表格/按 schema 抓" + 列需求。
- 消歧:样例"把这页的院校录取分数表格抽成 JSON"含"这页"指代,易误判 page_qa。规则:**出现 schema/JSON/表格输出物 = controlled_browse**(即使目标在当前页,也涉及翻页/多步抽取);仅"这页表格说了什么"才是 page_qa。

### 3.5 ask-on-page → page_qa

- 判据:强指代当前页/选区("这页/这段/选中"),且无输出物、无存档、无跨页需求。
- 消歧:`has_selection=true` 是最强信号(CONTRACT §d.1),直接 page_qa;问题超出页面内容时由上层转通道①,本 skill 不越界。

### 3.6 verify-admission-policy → page_qa / deep_research(双 intent,高考垂直)

- 形态 A(page_qa):用户已在章程页,核实单条款。
- 形态 B(deep_research):跨校/跨年/多条款逐条核对。
- 消歧:凡出现**高考实体(院校/章程/录取规则/级差/调档)+ 核实意图**,优先本 skill 而非泛用 `verify-claims`;若同时命中深研管线(多校对比+分数),可路由 `deep_research` 并由管线复用本 skill 策略。

## 4. 负样例与兜底(给 AGENT_01 的边界说明,不进 few-shot 池)

| 输入 | 期望 | 原因 |
|------|------|------|
| "今天天气怎么样" | `quick_answer`(或 null) | 通道①,无 skill |
| "你好" | `quick_answer` | 寒暄 |
| "随便看看新闻" | `label=null`,confidence=0 | 无显式信号,上层自答不拒答 |
| "帮我买一台 iPhone" | `controlled_browse` + 澄清,**不进 compare-prices** | 涉及下单(L3 高危),skill 只比价不购买;由受控浏览流程带写确认 |
| "帮我在志愿系统里提交我的志愿表" | `controlled_browse` + 写确认(L3) | 提交个人/报考数据属高危,见 SAFETY_LADDERS |
| "我的成绩单在哪查" | `controlled_browse` | "我的"个人数据信号(CONTRACT §d.1) |

## 5. 接入说明(AGENT_01)

1. few-shot 池按上面 `jsonl` 块逐字取用;`hint` 仅作 confidence 参考下限,不得直接当置信度输出。
2. skill 的 `effort` 映射 estimate 参考:low→minutes≈1/max_evidence≈4;medium→minutes≈5/max_evidence≈12;high→minutes≈10/max_evidence≈40(与 CONTRACT §d.2 示例同量级,最终数值由 AGENT_01 规则表定)。
3. 每个 skill 还自带 `failure_recovery`/`verification_rules`,路由器**不消费**这些字段;它们是动作层(AI 客户端 + MCP 工具)的策略输入。
4. 新增 skill 时:新增目录 → skill.json(trigger_examples ≥3)→ 本文件池追加同文样例 → `pytest skills/tests` 全绿,即完成接入,零框架改动。
