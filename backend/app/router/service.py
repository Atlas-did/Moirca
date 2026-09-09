# -*- coding: utf-8 -*-
"""路由编排服务:负向分流 → 正向打分 → 门控决策 →(可选)embedding 增强。

route_intent(纯函数,零 IO,CONTRACT §d.1)在本文件的 route_intent() 中实现,
intent_router.py 按契约路径 re-export。
"""
from __future__ import annotations

from typing import Optional

from . import negative_routes, rules
from .classifier import score_channels
from .embedding import get_enhancer
from .gate import RouteResult, decide, estimate_deep_research, grade_effort


def route_intent(text: str, context: Optional[dict] = None) -> RouteResult:
    """意图路由纯函数入口(零 IO、离线可跑、独立可测)。

    返回统一 RouteResult:
    - label=None + confidence=0:无命中,上层自答(原则 7,不产出拒答文案);
    - negative 非空:闲聊/敏感/无意义分流,带预置话术,不启动任何工具;
    - clarify 非空:显式澄清门控(一次 1 问 + ≤4 选项 chips,原则 6);
    - estimate 非空:deep_research 的耗时/配额预估(需调用方确认)。
    """
    if not isinstance(text, str):
        text = "" if text is None else str(text)

    # 1) 负向路由(独立通道,优先于正向分类)
    neg = negative_routes.classify_negative(text)
    if neg is not None:
        # 闲聊/无意义归秒答档,不启动任何工具;敏感拦截不给出正向 label
        label = rules.LABEL_QUICK_ANSWER if neg.kind == negative_routes.NEGATIVE_CHITCHAT else None
        confidence = 0.9 if neg.kind == negative_routes.NEGATIVE_CHITCHAT else 0.0
        return RouteResult(
            label=label,
            confidence=confidence,
            reason=f"负向路由:{neg.reason}",
            effort="instant",
            negative=neg.kind,
            negative_reply=neg.reply,
            meta={"negative_kind": neg.kind},
        )

    # 2) 正向四分类打分
    breakdown = score_channels(text, context)

    # 3) 门控决策(阈值/歧义/澄清)
    label, confidence, reason, clarify = decide(breakdown, text)

    # 4) 可选 embedding 增强:仅在关键词无命中且功能开启时补判(失败已静默返回 None)
    if label is None:
        enhancer = get_enhancer()
        if enhancer is not None:
            suggestion = enhancer.suggest(text)
            if suggestion is not None:
                label, confidence = suggestion
                reason = f"embedding 增强命中:{label}"
                clarify = None

    return RouteResult(
        label=label,
        confidence=confidence,
        reason=reason,
        effort=grade_effort(label),
        estimate=estimate_deep_research(breakdown.entity_count)
        if label == rules.LABEL_DEEP_RESEARCH else None,
        clarify=clarify,
        meta={
            "scores": {k: v.score for k, v in breakdown.scores.items()},
            "reasons": {k: v.reasons for k, v in breakdown.scores.items()},
            "entity_count": breakdown.entity_count,
            "time_sensitive": breakdown.time_sensitive,
            "has_page_context": breakdown.has_page_context,
        },
    )


def to_response_payload(result: RouteResult) -> dict:
    """转成 CONTRACT §d.2 的 HTTP 响应 JSON(契约字段 + 附加 effort/negative)。"""
    return {
        "label": result.label,
        "confidence": result.confidence,
        "reason": result.reason,
        "estimate": (
            {"minutes": result.estimate.minutes, "max_evidence": result.estimate.max_evidence}
            if result.estimate else None
        ),
        "clarify": (
            {"question": result.clarify.question, "options": result.clarify.options}
            if result.clarify else None
        ),
        # ---- 附加字段(契约允许的超集,供上层分流用) ----
        "effort": result.effort,
        "negative": result.negative,
        "negative_reply": result.negative_reply,
    }
