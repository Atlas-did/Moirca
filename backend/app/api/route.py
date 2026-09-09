# -*- coding: utf-8 -*-
"""POST /api/route —— 意图路由的薄 HTTP 封装(CONTRACT §d.2,AGENT_01)。

接线说明(由 AGENT_05 统一在 backend/app/api/__init__.py 追加,本模块不自接):
    from .route import router as route_router
    router.include_router(route_router, prefix="/route", tags=["意图路由"])

响应结构见 docs/ROUTING.md;错误模型遵循 CONTRACT §g(INVALID_PARAMS)。
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.router import route_intent, to_response_payload

router = APIRouter()

MAX_TEXT_CHARS = 500           # CONTRACT §h:/api/route text ≤ 500 字符
MAX_SELECTED_TEXT_CHARS = 2000  # CONTRACT §d.1:selected_text ≤ 2000 字符


class RouteContextIn(BaseModel):
    page_url: Optional[str] = None
    page_title: Optional[str] = None
    has_selection: bool = False
    # 注意:不能用 pydantic max_length(那会把超长变成 422),
    # 契约 §d.2 要求违规一律 400 INVALID_PARAMS,由处理器内显式校验。
    selected_text: Optional[str] = None


class RouteRequest(BaseModel):
    text: str = Field(..., description="待路由的用户输入,必填且 ≤500 字符")
    context: Optional[RouteContextIn] = None


def _invalid(message: str, details: Optional[dict] = None):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "INVALID_PARAMS", "message": message,
                           "details": details or {}}},
    )


@router.post("")
async def api_route(request: RouteRequest):
    text = (request.text or "").strip()
    if not text:
        return _invalid("text 不能为空")
    if len(text) > MAX_TEXT_CHARS:
        return _invalid(f"text 超长(>{MAX_TEXT_CHARS} 字符),当前 {len(text)}")

    context = None
    if request.context is not None:
        selected = request.context.selected_text or ""
        if len(selected) > MAX_SELECTED_TEXT_CHARS:
            return _invalid(
                f"context.selected_text 超长(>{MAX_SELECTED_TEXT_CHARS} 字符)")
        context = {
            "page_url": request.context.page_url or "",
            "page_title": request.context.page_title or "",
            "has_selection": bool(request.context.has_selection),
            "selected_text": selected,
        }

    try:
        result = route_intent(text, context)
    except Exception:  # noqa: BLE001 —— 规则表异常时绝不 500(CONTRACT §g.2)
        return {
            "label": None, "confidence": 0,
            "reason": "路由规则表异常,已降级为不决策", "estimate": None, "clarify": None,
            "effort": "instant", "negative": None, "negative_reply": None,
        }

    return to_response_payload(result)
