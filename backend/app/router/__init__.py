# -*- coding: utf-8 -*-
"""WebBridge 意图路由包(AGENT_01)。

四通道"先路由、后动手"的轻量路由层:
- 关键词/规则为主路径(离线零依赖,纯函数可单测);
- embedding 仅作可选增强(WEBBRIDGE_ROUTER_EMBEDDING=on),失败静默回退;
- 对外形态:route_intent 纯函数 + POST /api/route 薄封装(backend/app/api/route.py)。

公开 API:
    from app.router import route_intent, RouteResult, RouteContext
"""
from .gate import Clarify, Estimate, RouteResult
from .intent_router import RouteContext, RouteLabel, route_intent
from .service import to_response_payload

__all__ = [
    "route_intent",
    "RouteResult",
    "RouteContext",
    "RouteLabel",
    "Estimate",
    "Clarify",
    "to_response_payload",
]
