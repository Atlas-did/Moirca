# -*- coding: utf-8 -*-
"""skills/ 格式一致性校验(pytest,零第三方依赖)。

真源:
- skills/SCHEMA.md      —— skill.json v2 格式定义(含硬性规则 R1-R8)
- docs/CONTRACT.md      —— browser_* 工具面(§b.1)、evidence 字段(§c.1)、通道标签(§d)
- docs/SAFETY_LADDERS.md —— write_level 分级
- docs/ROUTING.md       —— few-shot 池(与 trigger_examples 逐字同步)

只做声明文件校验,不做任何网络/浏览器 IO。
"""
import json
import re
from pathlib import Path

import pytest

SKILLS_DIR = Path(__file__).resolve().parent.parent          # skills/
REPO_ROOT = SKILLS_DIR.parent
ROUTING_MD = REPO_ROOT / "docs" / "ROUTING.md"
SAFETY_MD = REPO_ROOT / "docs" / "SAFETY_LADDERS.md"

# CONTRACT §b.1 的 14 个必注册工具 + browser_route(可选)。
BROWSER_TOOLS = {
    "browser_navigate", "browser_new_tab", "browser_close_tab",
    "browser_switch_tab", "browser_get_tabs", "browser_snapshot",
    "browser_find_in_snapshot", "browser_click", "browser_fill",
    "browser_press_key", "browser_scroll", "browser_evaluate",
    "browser_wait", "browser_screenshot", "browser_extract",
    "browser_route",
}
# CONTRACT §a.4:readonly 构建下被拒的写类命令(对应 MCP 工具)。
WRITE_TOOLS = {
    "browser_navigate", "browser_new_tab", "browser_close_tab",
    "browser_switch_tab", "browser_click", "browser_fill",
    "browser_press_key", "browser_scroll", "browser_evaluate",
}
LABELS = {"page_qa", "deep_research", "controlled_browse"}   # CONTRACT §d;quick_answer 无 skill
EFFORTS = {"low", "medium", "high"}
WRITE_LEVELS = {"readonly", "low", "high"}
TARGETS = {"activeTab", "newTab"}                             # tabId:N 为模式匹配
EVIDENCE_FIELDS = {   # CONTRACT §c.1 evidence 表字段
    "evidence_id", "channel", "url", "title", "fetched_at",
    "source_quality", "quote", "locator", "raw_ref", "task_id",
    "created_at",
}
SOURCE_QUALITY = {"official", "authoritative", "community", "unknown"}

REQUIRED_KEYS = {"name", "description", "version", "intents",
                 "strategy", "evidence_policy", "tools"}
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
TABID = re.compile(r"^tabId:\d+$")


def discover_skills():
    out = []
    for d in sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir()):
        f = d / "skill.json"
        if f.exists():
            out.append((d, json.loads(f.read_text(encoding="utf-8"))))
    return out


SKILL_FILES = discover_skills()


@pytest.fixture(params=SKILL_FILES, ids=[d.name for d, _ in SKILL_FILES])
def skill(request):
    d, data = request.param
    return d, data


# ---------- 顶层与字段结构 ----------

def test_at_least_one_skill_discovered():
    assert len(SKILL_FILES) >= 5, "skills/ 下应至少有 5 个示例 skill"


def test_skill_top_level_keys(skill):
    _, data = skill
    assert set(data.keys()) == REQUIRED_KEYS, "顶层键必须恰好为 SCHEMA.md 定义的 7 个"


def test_skill_name_and_version(skill):
    d, data = skill
    assert re.fullmatch(r"[a-z0-9-]+", data["name"]), "name 须为短横线小写"
    assert SEMVER.fullmatch(data["version"]), "version 须为 semver"
    assert data["description"].strip()


# ---------- intents ----------

def test_intents_structure(skill):
    _, data = skill
    assert isinstance(data["intents"], list) and data["intents"], "intents 非空数组"
    for intent in data["intents"]:
        assert set(intent.keys()) == {
            "trigger_examples", "channel", "effort", "confidence_hint"}
        examples = intent["trigger_examples"]
        assert isinstance(examples, list) and len(examples) >= 3, "每条 intent ≥3 条触发例句"
        assert all(isinstance(e, str) and e.strip() for e in examples)
        assert intent["channel"] in LABELS
        assert intent["effort"] in EFFORTS
        assert 0.0 <= intent["confidence_hint"] <= 1.0


# ---------- strategy ----------

def test_strategy_structure(skill):
    _, data = skill
    s = data["strategy"]
    assert set(s.keys()) == {"plan", "verification_rules",
                             "failure_recovery", "safety"}
    plan = s["plan"]
    assert set(plan.keys()) == {"overview", "phases", "invariants"}
    assert plan["overview"].strip()
    assert isinstance(plan["phases"], list)
    for ph in plan["phases"]:
        assert set(ph.keys()) == {"phase", "guidance", "tools"}
        assert all(t in BROWSER_TOOLS for t in ph["tools"])
    assert isinstance(plan["invariants"], list) and plan["invariants"]


def test_strategy_not_hardcoded_steps(skill):
    """原则 9:plan 是生成指导,不是逐条 steps —— 禁止出现 workflow/steps 键。"""
    _, data = skill
    assert "workflows" not in data and "steps" not in data
    for ph in data["strategy"]["plan"]["phases"]:
        # guidance 必须是成段指导文本,而非可机械执行的参数对象
        assert isinstance(ph["guidance"], str) and len(ph["guidance"]) > 20


def test_verification_rules_and_failure_recovery(skill):
    _, data = skill
    vr = data["strategy"]["verification_rules"]
    fr = data["strategy"]["failure_recovery"]
    assert isinstance(vr, list) and vr, "必须有 verification_rules"
    for r in vr:
        assert set(r.keys()) == {"after", "check"}
        assert isinstance(r["check"], str) and r["check"].strip()
    assert isinstance(fr, list) and fr, "必须有 failure_recovery"
    for r in fr:
        assert set(r.keys()) == {"condition", "action"}
        assert isinstance(r["action"], str) and r["action"].strip()


def test_safety(skill):
    _, data = skill
    safety = data["strategy"]["safety"]
    assert set(safety.keys()) == {"write_level", "targets_allowed"}
    assert safety["write_level"] in WRITE_LEVELS
    targets = safety["targets_allowed"]
    assert isinstance(targets, list) and targets
    for t in targets:
        assert t in TARGETS or TABID.fullmatch(t), f"非法 target: {t}"


def test_r2_readonly_skill_no_write_tools(skill):
    """R2:readonly skill 只允许 activeTab 且禁写类工具。"""
    _, data = skill
    if data["strategy"]["safety"]["write_level"] != "readonly":
        pytest.skip("仅 readonly skill")
    assert data["strategy"]["safety"]["targets_allowed"] == ["activeTab"]
    assert not (set(data["tools"]) & WRITE_TOOLS)


def test_r3_writable_skill_requires_newtab(skill):
    """R3:low/high skill 必须声明 newTab。"""
    _, data = skill
    if data["strategy"]["safety"]["write_level"] == "readonly":
        pytest.skip("仅 low/high skill")
    assert "newTab" in data["strategy"]["safety"]["targets_allowed"]


def test_r4_no_hardcoded_urls(skill):
    """R4:skill.json 禁止 http(s):// 字面 URL(URL 模板只作 prompt.md 中 example)。"""
    _, data = skill
    raw = json.dumps(data, ensure_ascii=False)
    assert "http://" not in raw and "https://" not in raw


# ---------- evidence_policy ----------

def test_evidence_policy_structure(skill):
    _, data = skill
    ep = data["evidence_policy"]
    assert set(ep.keys()) == {"save", "channel_hint", "fields",
                              "source_quality_hint"}
    assert isinstance(ep["save"], bool)
    assert ep["channel_hint"] in LABELS
    assert set(ep["fields"]) <= EVIDENCE_FIELDS
    assert ep["source_quality_hint"] in SOURCE_QUALITY


def test_r7_save_implies_minimal_fields(skill):
    """R7:save=true 时 fields 至少含 url/quote/locator(证据可回查最小集)。"""
    _, data = skill
    if not data["evidence_policy"]["save"]:
        assert data["evidence_policy"]["fields"] == []
        return
    fields = set(data["evidence_policy"]["fields"])
    assert {"url", "quote", "locator"} <= fields


# ---------- tools ----------

def test_r1_tools_in_contract_surface(skill):
    """R1:tools ⊆ CONTRACT §b.1 的 browser_* 工具全集(工具名对齐)。"""
    _, data = skill
    assert data["tools"], "tools 非空"
    unknown = set(data["tools"]) - BROWSER_TOOLS
    assert not unknown, f"契约外工具: {unknown}"


# ---------- prompt.md 与护栏 ----------

def test_r8_prompt_md_guardrails(skill):
    """R8:每 skill 有 prompt.md 且含护栏三件套(只读默认/分级确认/高危屏蔽)。"""
    d, _ = skill
    p = d / "prompt.md"
    assert p.exists(), f"{d.name}/prompt.md 缺失"
    text = p.read_text(encoding="utf-8")
    assert "## 角色与边界" in text
    assert "## 执行策略" in text
    assert "## 验证与恢复" in text
    assert "## 证据与引用" in text
    assert "## 安全护栏" in text
    assert "只读默认" in text, "缺'只读默认'护栏条目"
    assert "分级确认" in text, "缺'写动作分级确认'护栏条目"
    assert "高危屏蔽" in text, "缺'高危屏蔽'护栏条目"


# ---------- ROUTING.md 同步 ----------

@pytest.fixture(scope="module")
def few_shot_pool():
    text = ROUTING_MD.read_text(encoding="utf-8")
    m = re.search(r"<!-- FEW-SHOT-POOL-START -->\s*```jsonl\n(.*?)```",
                  text, re.S)
    assert m, "ROUTING.md 缺 few-shot 池标记块"
    rows = []
    for line in m.group(1).strip().splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def test_pool_structure(few_shot_pool):
    skill_names = {data["name"] for _, data in SKILL_FILES}
    assert few_shot_pool
    for row in few_shot_pool:
        assert set(row.keys()) == {"text", "label", "skill", "hint"}
        assert row["label"] in LABELS
        assert row["skill"] in skill_names, f"池中 skill 不存在: {row['skill']}"
        assert isinstance(row["hint"], float)


def test_r5_trigger_examples_synced_with_routing(few_shot_pool):
    """R5:每个 skill 的 trigger_examples 逐字进池,且 label 与 channel 一致。"""
    pool = {(r["text"], r["label"], r["skill"]) for r in few_shot_pool}
    for _, data in SKILL_FILES:
        for intent in data["intents"]:
            for ex in intent["trigger_examples"]:
                assert (ex, intent["channel"], data["name"]) in pool, (
                    f"例句未同步进 ROUTING.md 或 label 不一致: {ex}")


def test_pool_has_no_orphans(few_shot_pool):
    """池中每条样例都应能在某 skill 的 trigger_examples 中找到(防单边漂移)。"""
    examples = {
        (ex, intent["channel"], data["name"])
        for _, data in SKILL_FILES
        for intent in data["intents"]
        for ex in intent["trigger_examples"]
    }
    for row in few_shot_pool:
        assert (row["text"], row["label"], row["skill"]) in examples, (
            f"池中孤例(不在任何 skill.json 中): {row['text']}")


def test_skill_names_unique():
    names = [data["name"] for _, data in SKILL_FILES]
    assert len(names) == len(set(names))


def test_no_active_tab_write_in_prompt_examples():
    """原则 1 的文档层抽查:prompt.md 不得教客户端对当前标签写。"""
    for d, _ in SKILL_FILES:
        p = d / "prompt.md"
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        # 教唆性表述:对当前页/当前标签做 navigate/click/fill 的直接指令
        assert not re.search(r"对(用户)?当前(标签|页)(去|做)?\s*`?browser_(navigate|click|fill|press_key)", text)


def test_safety_ladders_doc_present():
    text = SAFETY_MD.read_text(encoding="utf-8")
    for level in ("L0", "L1", "L2", "L3"):
        assert level in text
    for action in ("购买", "发布", "个人数据", "删除", "登录"):
        assert action in text, f"L3 清单缺动作类别: {action}"
    for w in ("readonly", "low", "high"):
        assert w in text, f"分级表缺 write_level: {w}"
