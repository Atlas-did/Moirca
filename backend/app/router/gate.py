# -*- coding: utf-8 -*-
"""决策门控:阈值、歧义澄清、努力分级与成本预估(纯函数)。

- 原则 6:澄清是显式门控,一次只问 1 个问题 + 2–4 个选项 chips;
- 原则 7:无命中返回 label=None(不决策),不产出拒答文案;
- 任务书要求 4:3 档 effort,deep 必须输出预计耗时 + 配额。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from . import rules
from .classifier import ScoreBreakdown


@dataclass
class Clarify:
    """澄清门控:一次一个问题 + 选项 chips。"""

    question: str
    options: List[str]


@dataclass
class Estimate:
    """deep_research 成本预估(供调用方向用户确认后再进管线)。"""

    minutes: int
    max_evidence: int


@dataclass
class RouteResult:
    """统一路由结果结构(CONTRACT §d.1/§d.2)。"""

    label: Optional[str]              # 四分类之一;无命中为 None(不决策)
    confidence: float                 # 0~1;None 时恒为 0
    reason: str                       # 人读命中原因
    effort: str = "instant"           # instant | normal | deep
    estimate: Optional[Estimate] = None   # 仅 deep_research 非空
    clarify: Optional[Clarify] = None     # 歧义/缺参时的显式澄清
    negative: Optional[str] = None    # 负向路由类型:chitchat|sensitive|nonsense
    negative_reply: Optional[str] = None  # 负向预置话术
    meta: dict = field(default_factory=dict)  # 调试信息(命中明细等)

    @property
    def no_match(self) -> bool:
        return self.label is None and self.negative is None


# ---------------------------------------------------------------------------
# effort 分级
# ---------------------------------------------------------------------------
EFFORT_BY_LABEL = {
    rules.LABEL_QUICK_ANSWER: "instant",
    rules.LABEL_PAGE_QA: "normal",
    rules.LABEL_DEEP_RESEARCH: "deep",
    rules.LABEL_CONTROLLED_BROWSE: "normal",
}


def grade_effort(label: Optional[str]) -> str:
    """3 档努力分级;None(不决策)与秒答同档,均不升级。"""
    if label is None:
        return "instant"
    return EFFORT_BY_LABEL.get(label, "instant")


def estimate_deep_research(entity_count: int) -> Estimate:
    """deep_research 成本预估:实体越多,耗时/配额越高(确定性纯函数)。

    契约示例:2 个院校实体 → minutes=6, max_evidence=40。
    """
    n = max(1, entity_count)
    minutes = min(4 + n, 10)
    max_evidence = min(20 + 10 * n, 60)
    return Estimate(minutes=minutes, max_evidence=max_evidence)


# ---------------------------------------------------------------------------
# 澄清话术构造
# ---------------------------------------------------------------------------
_CONTROLLED_ACTION_HINTS = (
    ("成绩", "查询你的成绩"),
    ("分数", "查询你的分数"),
    ("录取", "查询你的录取状态"),
    ("档案", "查询你的档案"),
    ("报名", "完成报名操作"),
    ("填", "填写该表单"),
    ("提交", "提交该申请"),
    ("登录", "登录查询"),
)


def controlled_clarify(text: str) -> Clarify:
    """受控浏览缺平台信息时,构造唯一的澄清问题(≤4 个 chips)。"""
    action = "办理该操作"
    for kw, hint in _CONTROLLED_ACTION_HINTS:
        if kw in text:
            action = hint
            break
    return Clarify(
        question=f"要在哪个平台{action}?",
        options=list(rules.CONTROLLED_CLARIFY_OPTIONS),
    )


def ambiguity_clarify(top_label: str, second_label: str) -> Clarify:
    """两通道同分时的显式澄清(仍给出倾向 label,置信度偏低)。"""
    wording = {
        (rules.LABEL_PAGE_QA, rules.LABEL_DEEP_RESEARCH): (
            "你是想让我解读当前这个页面,还是做一次多源深度研究?",
            ["只解读当前页面", "做深度研究"],
        ),
    }
    default = (
        f"你是想让我{top_label}还是{second_label}?",
        ["按第一种理解", "按第二种理解"],
    )
    question, options = wording.get(
        (top_label, second_label),
        wording.get((second_label, top_label), default),
    )
    return Clarify(question=question, options=options)


# ---------------------------------------------------------------------------
# 最终决策
# ---------------------------------------------------------------------------
def decide(breakdown: ScoreBreakdown, text: str) -> Tuple[Optional[str], float, str, Optional[Clarify]]:
    """从打分明细得出 (label, confidence, reason, clarify)。

    规则(CONTRACT §d.1):
    - 全零信号 → label=None, confidence=0(不决策,上层自答);
    - page_qa 与 deep_research 同分且 page_url 非空 → 取 page_qa;
    - 分差在 AMBIGUOUS_MARGIN 内 → 保留倾向 label,confidence 压低并触发 clarify;
    - 受控浏览未点名平台 → 触发 clarify(一次一问)。
    """
    scores = breakdown.scores
    ranked = sorted(
        ((cs.label, cs.score, cs.reasons) for cs in scores.values()),
        key=lambda item: item[1],
        reverse=True,
    )
    # page_url 非空时的 page_qa 优先裁决放在排序后处理
    top_label, top_score, top_reasons = ranked[0]
    second_label, second_score, _ = ranked[1] if len(ranked) > 1 else (None, 0.0, [])

    if top_score <= 0:
        return None, 0.0, "无命中:未命中任何通道信号", None

    # 同分裁决:page_qa 与 deep_research 同分,且有页面上下文 → page_qa
    if (top_score == second_score
            and {top_label, second_label} == {rules.LABEL_PAGE_QA, rules.LABEL_DEEP_RESEARCH}
            and breakdown.has_page_context):
        top_label, second_label = rules.LABEL_PAGE_QA, rules.LABEL_DEEP_RESEARCH
        top_score, second_score = max(top_score, second_score), min(top_score, second_score)

    reason = ("命中:" + "、".join(top_reasons)) if top_reasons else f"命中通道信号({top_label})"

    # 歧义门控:top1 领先幅度不足
    clarify: Optional[Clarify] = None
    confidence: float
    margin = top_score - second_score
    if second_score > 0 and margin < rules.AMBIGUOUS_MARGIN:
        confidence = round(min(0.65, 0.5 + margin / (top_score * 10)), 2)
        clarify = ambiguity_clarify(top_label, second_label)
        reason += f";与 {second_label} 分差过小,建议澄清"
    else:
        confidence = round(min(0.95, 0.55 + 0.1 * top_score), 2)

    # 受控浏览缺平台 → 显式澄清(默认假设 + 明示,不连环追问)
    if (top_label == rules.LABEL_CONTROLLED_BROWSE
            and not rules.platform_mentioned(text)
            and clarify is None):
        confidence = min(confidence, 0.6)
        clarify = controlled_clarify(text)
        reason += ";未点名平台,建议澄清"

    return top_label, confidence, reason, clarify
