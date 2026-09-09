"""
SKILL 注入接口(场景可插拔,原则 11:仅接口预留,本轮只实现高考场景)

研究管线(Agent 1-7)不感知具体场景:管线消费 SkillDefinition 提供的
研究问题、关注维度、词表与 effort 分级,角色命名与融合公式保持不变。
换场景 = 提供新的 SkillDefinition 工厂,不改管线代码。

结构对齐 skills/SCHEMA.md(AGENT_06)的意图+策略格式与 docs/ROUTING.md §5
的 effort→estimate 映射(low≈1min/4条、medium≈5min/12条、high≈10min/40条)。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# effort → (预计分钟, 证据配额)  —— docs/ROUTING.md §5 的映射,单一真源在ROUTING,此处为消费副本
EFFORT_ESTIMATE: Dict[str, Tuple[int, int]] = {
    "low": (1, 4),
    "medium": (5, 12),
    "high": (10, 40),
}
VALID_EFFORTS: Tuple[str, ...] = tuple(EFFORT_ESTIMATE.keys())
MAX_DIMENSIONS = 8
MAX_VOCAB_ITEMS_PER_GROUP = 30


class SkillValidationError(ValueError):
    """SKILL 定义不合法。"""


# ---------------------------------------------------------------------------
# SkillDefinition(接口)
# ---------------------------------------------------------------------------

@dataclass
class SkillDefinition:
    """SKILL 注入结构:研究问题 + 关注维度 + 词表 + effort。

    校验规则(validate):
      - name 必填(≤64 字符);
      - research_question 必填(≤2000 字符,与 CONTRACT §e.3 query 上限一致);
      - dimensions 1..8 条,每条非空 ≤40 字符;
      - vocabulary 为 {组名: [词...]},每组 ≤30 词,词非空 ≤40 字符;
      - effort ∈ {low, medium, high}。
    """
    name: str
    research_question: str
    dimensions: List[str] = field(default_factory=list)
    vocabulary: Dict[str, List[str]] = field(default_factory=dict)
    effort: str = "medium"
    scenario: str = "gaokao"          # 场景标识;高考管线消费 gaokao
    metadata: Dict[str, Any] = field(default_factory=dict)   # 场景私有上下文(如 gaokao_ctx)

    def validate(self) -> None:
        if not self.name or not self.name.strip():
            raise SkillValidationError("name 必填")
        if len(self.name) > 64:
            raise SkillValidationError(f"name 超长(>64):{self.name!r}")
        if not self.research_question or not self.research_question.strip():
            raise SkillValidationError("research_question 必填")
        if len(self.research_question) > 2000:
            raise SkillValidationError(
                f"research_question 超长(>2000):{len(self.research_question)}")
        if not (1 <= len(self.dimensions) <= MAX_DIMENSIONS):
            raise SkillValidationError(
                f"dimensions 需 1~{MAX_DIMENSIONS} 条,得到 {len(self.dimensions)}")
        for d in self.dimensions:
            if not isinstance(d, str) or not d.strip() or len(d) > 40:
                raise SkillValidationError(f"dimensions 条目非法:{d!r}(非空且 ≤40 字符)")
        if not isinstance(self.vocabulary, dict):
            raise SkillValidationError("vocabulary 必须是 {组名: [词...]}")
        for group, words in self.vocabulary.items():
            if not group or not isinstance(words, list):
                raise SkillValidationError(f"vocabulary 组非法:{group!r}")
            if len(words) > MAX_VOCAB_ITEMS_PER_GROUP:
                raise SkillValidationError(
                    f"vocabulary[{group!r}] 超过 {MAX_VOCAB_ITEMS_PER_GROUP} 词")
            for w in words:
                if not isinstance(w, str) or not w.strip() or len(w) > 40:
                    raise SkillValidationError(f"vocabulary[{group!r}] 词非法:{w!r}")
        if self.effort not in VALID_EFFORTS:
            raise SkillValidationError(
                f"effort 必须是 {VALID_EFFORTS} 之一,得到 {self.effort!r}")

    # ---------------------------------------------------------------
    def estimate(self) -> Dict[str, int]:
        """effort → 预计耗时 + 证据配额(深研前确认提示用)。"""
        minutes, max_evidence = EFFORT_ESTIMATE[self.effort]
        return {"minutes": minutes, "max_evidence": max_evidence}

    def all_terms(self) -> List[str]:
        """词表扁平化(去重保序),供证据检索/claim 匹配做关键词扩展。"""
        seen, out = set(), []
        for words in self.vocabulary.values():
            for w in words:
                if w not in seen:
                    seen.add(w)
                    out.append(w)
        return out


# ---------------------------------------------------------------------------
# 高考场景(第一个实现示例;从决策树/用户画像映射)
# ---------------------------------------------------------------------------

# 决策树 priority → 关注维度(叙事与 recommendation 决策树保持一致)
_PRIORITY_DIMENSIONS: Dict[str, List[str]] = {
    "school_prestige": ["学校层次与学科评估", "保研与深造率"],
    "major_strength": ["专业实力与课程体系", "师资与实验资源"],
    "city_development": ["城市产业与实习机会", "生活成本与通勤"],
    "career_prospect": ["就业前景与中位数薪资", "行业趋势与AI替代风险"],
}
_DEFAULT_DIMENSIONS = ["官方分数线与招生计划", "社区真实口碑", "时效变更风险",
                       "数据冲突核查", "就业前景与中位数薪资"]

# 高考垂直词表(五个 Agent 视角各一组;不改 Agent 角色,词表只做检索注入)
_GAOKAO_VOCABULARY: Dict[str, List[str]] = {
    "official": ["阳光高考", "省考试院", "招生章程", "分数线", "位次", "招生计划",
                 "学科评估", "录取批次"],
    "community": ["就读体验", "转专业", "保研", "实习", "劝退", "避雷", "课程质量"],
    "freshness": ["专业撤销", "新增专业", "改名", "停招", "目录调整"],
    "conflict": ["就业率", "宣传", "口径", "夸大", "交叉验证"],
    "trend": ["就业倒推", "中位数", "AI替代", "家庭适配", "产业政策", "五年趋势"],
}


def build_gaokao_skill(query: str,
                       gaokao_ctx: Optional[Dict[str, Any]] = None,
                       profile: Optional[Any] = None,
                       effort: str = "medium") -> SkillDefinition:
    """从研究问题 + 高考上下文 + 决策树用户画像构造高考场景 SKILL(第一个示例)。

    profile 可为 decision_tree / UserProfile 形状的 dict(含 priority / province /
    keywords / family_bg / economic_tier),缺省字段安全降级。
    """
    gaokao_ctx = dict(gaokao_ctx or {})
    profile = dict(profile or {})

    dimensions = list(_DEFAULT_DIMENSIONS)
    priority = profile.get("priority")
    if priority in _PRIORITY_DIMENSIONS:
        # 决策树优先级维度置前
        dimensions = _PRIORITY_DIMENSIONS[priority] + [
            d for d in dimensions if d not in _PRIORITY_DIMENSIONS[priority]]

    vocabulary = {group: list(words) for group, words in _GAOKAO_VOCABULARY.items()}
    # 用户画像确认关键词并入 community/trend 词表(≤上限)
    for kw in (profile.get("keywords") or [])[:10]:
        if isinstance(kw, str) and kw.strip():
            vocabulary["community"].append(kw.strip())

    metadata = {
        "gaokao_ctx": gaokao_ctx,
        "priority": priority or "career_prospect",
        "family_bg": profile.get("family_bg", ""),
        "economic_tier": profile.get("economic_tier", "middle"),
    }
    if gaokao_ctx.get("province"):
        metadata["province"] = gaokao_ctx["province"]

    skill = SkillDefinition(
        name="gaokao-research",
        research_question=query,
        dimensions=dimensions,
        vocabulary=vocabulary,
        effort=effort,
        scenario="gaokao",
        metadata=metadata,
    )
    skill.validate()
    return skill


def skill_context_digest(skill: SkillDefinition) -> str:
    """把 SKILL 压成一段可注入 Agent 上下文的浓缩文本(不吞原文,≤600 字符)。"""
    lines = [
        f"[SKILL:{skill.name}|场景:{skill.scenario}|effort:{skill.effort}]",
        f"研究问题:{skill.research_question}",
        f"关注维度:{';'.join(skill.dimensions)}",
    ]
    for group, words in skill.vocabulary.items():
        lines.append(f"词表[{group}]:{'、'.join(words[:10])}")
    return "\n".join(lines)[:600]
