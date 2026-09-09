# -*- coding: utf-8 -*-
"""负向路由:闲聊 / 敏感 / 无意义的分流(独立于正向四分类)。

任务书要求 2:负向路由专门建,不混在正向分类里。
- 闲聊/寒暄 → 轻量话术模板,不启动任何工具;
- 敏感/违规/高危 → 安全拦截话术;
- 无意义(乱码、单字)→ 轻提示引导;
- 低价值但有真实含义 → **不属于负向**,由正向分类归 ① 秒答(不拒答)。

原则 7:负向路由只拦闲聊/敏感/无关,不产出通用"拒答"文案,不替主模型拒答真实问题。
"""
from __future__ import annotations

import re
from typing import NamedTuple, Optional

from . import rules

NEGATIVE_CHITCHAT = "chitchat"
NEGATIVE_SENSITIVE = "sensitive"
NEGATIVE_NONSENSE = "nonsense"


class NegativeHit(NamedTuple):
    """负向路由命中结果。kind ∈ chitchat | sensitive | nonsense。"""

    kind: str
    reason: str
    reply: str          # 预置话术(闲聊模板/安全拦截/轻提示),供上层直接展示


# 单字/超短输入:长度 ≤1 的有效内容视为无意义
_SINGLE_CHAR_RE = re.compile(r"^[\W_]+$", re.UNICODE)  # 全是标点/符号/空白


def _is_nonsense(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if _SINGLE_CHAR_RE.match(stripped):
        return True  # 纯标点/符号,如 "???" "。。。"
    if len(stripped) <= 1:
        return True  # 单字
    # 同一字符重复(如 "!!!!" 已被上面覆盖;此处兜底 "啊啊啊啊" 以外的乱敲)
    if len(set(stripped)) == 1 and len(stripped) >= 4:
        return True
    return False


def classify_negative(text: str) -> Optional[NegativeHit]:
    """负向路由入口。返回 None 表示没有负向命中,应继续走正向四分类。

    判定顺序:敏感 > 无意义 > 闲聊(敏感优先拦截,保证安全)。
    """
    lowered = text.strip().lower()
    if not lowered:
        return NegativeHit(NEGATIVE_NONSENSE, "空输入", rules.NONSENSE_REPLY)

    for kw in rules.SENSITIVE_KEYWORDS:
        if kw in lowered:
            return NegativeHit(
                NEGATIVE_SENSITIVE,
                f"命中敏感词:{kw}",
                rules.SENSITIVE_REPLY,
            )

    if _is_nonsense(text):
        return NegativeHit(NEGATIVE_NONSENSE, "无意义输入(乱码/单字/纯符号)", rules.NONSENSE_REPLY)

    for kw in rules.CHITCHAT_KEYWORDS:
        if kw in lowered:
            return NegativeHit(
                NEGATIVE_CHITCHAT,
                f"命中寒暄词:{kw}",
                rules.CHITCHAT_REPLY_TEMPLATE,
            )

    return None
