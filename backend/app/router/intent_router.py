# -*- coding: utf-8 -*-
"""意图路由器契约入口(CONTRACT §d.1)。

route_intent 定义在 service.py(与其他编排共享),此处按契约路径 re-export,
保证 ``from app.router.intent_router import route_intent`` 可用。
"""
from __future__ import annotations

from typing import Literal

from typing_extensions import TypedDict  # noqa: F401  (契约示例的导入形态)

from .gate import Clarify, Estimate, RouteResult
from .service import route_intent

__all__ = [
    "RouteLabel",
    "RouteContext",
    "RouteResult",
    "Estimate",
    "Clarify",
    "route_intent",
]

RouteLabel = Literal["quick_answer", "page_qa", "deep_research", "controlled_browse"]


class RouteContext(TypedDict, total=False):
    page_url: str        # 用户当前页(可空)
    page_title: str
    has_selection: bool
    selected_text: str   # ≤2000 字符
