# -*- coding: utf-8 -*-
"""正向四分类打分器(纯函数)。

对输入文本按 rules.py 的规则表逐通道打分,输出各通道得分与命中明细;
不负责最终决策(阈值/歧义/澄清在 gate.py,编排在 service.py)。
"""
from __future__ import annotations

from typing import Dict, List, NamedTuple, Optional

from . import rules
from .rules import Rule


class ChannelScore(NamedTuple):
    """单通道打分结果。"""

    label: str
    score: float
    reasons: List[str]      # 命中的规则名与实体/时间信号描述


class ScoreBreakdown(NamedTuple):
    """全部通道的打分明细 + 辅助信号。"""

    scores: Dict[str, ChannelScore]
    entity_count: int
    time_sensitive: bool
    has_page_context: bool
    has_selection: bool


def _hit_channel(text: str, channel_rules: List[Rule],
                 has_page_context: bool) -> List[str]:
    """对一组规则打分,返回 reason 列表。requires_context 的规则需要页面上下文。"""
    reasons: List[str] = []
    for rule, count in rules.find_rules(text, channel_rules):
        if rule.requires_context and not has_page_context:
            continue
        reasons.append(f"{rule.name}×{count}")
    return reasons


def score_channels(text: str, context: Optional[dict]) -> ScoreBreakdown:
    """纯函数:计算四个通道的得分。

    context 结构见 intent_router.RouteContext(page_url/page_title/has_selection/selected_text)。
    """
    ctx = context or {}
    page_url = (ctx.get("page_url") or "").strip()
    has_selection = bool(ctx.get("has_selection"))
    selected_text = (ctx.get("selected_text") or "").strip()
    # 有选区文本也视为页面上下文(即使调用方忘了给 page_url)
    has_page_context = bool(page_url) or has_selection or bool(selected_text)

    # 选区文本并入待匹配语料:用户选中内容往往就是问题主体
    corpus = text
    if selected_text:
        corpus = f"{text}\n{selected_text}"

    quick_reasons = _hit_channel(corpus, rules.QUICK_ANSWER_RULES, has_page_context)
    page_qa_reasons = _hit_channel(corpus, rules.PAGE_QA_DEICTIC_RULES, has_page_context)
    deep_reasons = _hit_channel(corpus, rules.DEEP_RESEARCH_RULES, has_page_context)
    controlled_reasons = _hit_channel(corpus, rules.CONTROLLED_BROWSE_RULES, has_page_context)

    entity_count = rules.count_entities(corpus)
    time_sensitive = rules.is_time_sensitive(corpus)

    # --- deep_research:研究信号 + 实体强度(契约 §d.1 优先级) ---
    deep_score = 0.0
    if deep_reasons:
        deep_score += sum(float(r.split("×")[-1]) for r in deep_reasons)
    entity_strength = min(
        entity_count * rules.ENTITY_SCORE_PER_HIT, rules.ENTITY_SCORE_CAP
    )
    if deep_reasons and (entity_strength >= rules.ENTITY_SCORE_PER_HIT
                         or deep_score >= rules.DEEP_MIN_SIGNAL_SCORE):
        deep_score += entity_strength
    if time_sensitive and deep_reasons:
        deep_score += rules.TIME_SENSITIVE_WEIGHT
    # 纯实体无研究动作(如"华科 武大 计算机")不自动升深研,避免过度触发

    # --- page_qa:显式选区是最高优先级信号 ---
    page_qa_score = 0.0
    if page_qa_reasons:
        page_qa_score += sum(float(r.split("×")[-1]) for r in page_qa_reasons)
    if has_selection:
        page_qa_score += rules.SELECTION_EXPLICIT_SCORE

    # --- controlled_browse ---
    controlled_score = sum(
        float(r.split("×")[-1]) for r in controlled_reasons
    )

    # --- quick_answer:低价值轻创作/常识;有真实浏览信号时不抢 ---
    quick_score = sum(float(r.split("×")[-1]) for r in quick_reasons)

    scores: Dict[str, ChannelScore] = {
        rules.LABEL_QUICK_ANSWER: ChannelScore(
            rules.LABEL_QUICK_ANSWER, quick_score, quick_reasons),
        rules.LABEL_PAGE_QA: ChannelScore(
            rules.LABEL_PAGE_QA, page_qa_score, page_qa_reasons),
        rules.LABEL_DEEP_RESEARCH: ChannelScore(
            rules.LABEL_DEEP_RESEARCH, deep_score, deep_reasons),
        rules.LABEL_CONTROLLED_BROWSE: ChannelScore(
            rules.LABEL_CONTROLLED_BROWSE, controlled_score, controlled_reasons),
    }

    return ScoreBreakdown(
        scores=scores,
        entity_count=entity_count,
        time_sensitive=time_sensitive,
        has_page_context=has_page_context,
        has_selection=has_selection,
    )


def has_any_signal(breakdown: ScoreBreakdown) -> bool:
    """是否存在任何非零信号(用于"无命中 → None")。"""
    return any(cs.score > 0 for cs in breakdown.scores.values())
