# -*- coding: utf-8 -*-
"""/api/deep-research —— 云端深研异步任务 API(CONTRACT §e.3,AGENT_05)。

  POST /api/deep-research                 受理(202),先报预计耗时+配额(§原则:高成本通道须确认)
  GET  /api/deep-research/{task_id}       状态轮询
  GET  /api/deep-research/{task_id}/stream SSE 真流式(agent_progress/evidence_added/report_ready)

响应契约:
  202 → {"task_id":"task_01H...","status":"queued","estimate":{"minutes":6,"max_evidence":40}}
  轮询 → {"task_id","status":"queued|running|done|failed","progress","agents_done",
          "evidence_count","error"}
超集字段(契约允许):sources(传入的页面快照/URL 列表,管线显式落 evidence 库)。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..config import Config
from ..report.models import get_report_by_task
from ..services.deep_research_pipeline import get_pipeline
from .auth import verify_api_token

router = APIRouter(dependencies=[Depends(verify_api_token)])  # 可选 token 鉴权(app/api/auth.py)

QUERY_MAX_CHARS = getattr(Config, "DEEP_RESEARCH_QUERY_MAX_CHARS", 2000)


def _error(status: int, code: str, message: str,
           details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


class GaokaoCtxIn(BaseModel):
    province: Optional[str] = None
    score: Optional[int] = None
    subject: Optional[str] = None
    rank: Optional[int] = None


class BudgetIn(BaseModel):
    max_minutes: Optional[int] = Field(default=None, ge=1, le=120)
    max_evidence: Optional[int] = Field(default=None, ge=1, le=200)


class EvidenceSourceIn(BaseModel):
    """调用方传入的页面快照/URL 列表(管线显式 save,channel=deep_research)。"""
    url: str = Field(..., description="证据来源页 URL,http(s):// 开头")
    title: str = ""
    quote: str = Field(..., max_length=2000, description="原文摘录,≤2000 字符(§h)")
    fetched_at: Optional[str] = Field(default=None, description="采集时刻 ISO8601")
    source_quality: Optional[str] = Field(
        default=None, description="official|authoritative|community|unknown,缺省按 URL 判定")
    locator: Optional[Dict[str, Any]] = None


class DeepResearchRequest(BaseModel):
    query: str = Field(..., description="研究问题,必填 ≤2000 字符")
    gaokao_ctx: Optional[GaokaoCtxIn] = None
    budget: Optional[BudgetIn] = None
    sources: Optional[List[EvidenceSourceIn]] = Field(
        default=None, description="可选:传入的页面快照/URL 列表(自动落 evidence 库)")
    effort: Optional[str] = Field(
        default="medium", description="SKILL effort 分级:low|medium|high(影响预估与配额)")


@router.post("")
async def create_deep_research(req: DeepResearchRequest):
    query = (req.query or "").strip()
    if not query:
        return _error(400, "INVALID_PARAMS", "query 不能为空")
    if len(query) > QUERY_MAX_CHARS:
        return _error(400, "INVALID_PARAMS",
                      f"query 超长(>{QUERY_MAX_CHARS} 字符),当前 {len(query)}")
    if req.effort is not None and req.effort not in ("low", "medium", "high"):
        return _error(400, "INVALID_PARAMS",
                      "effort 必须是 low|medium|high 之一")

    pipeline = get_pipeline()
    gaokao_ctx = req.gaokao_ctx.model_dump() if req.gaokao_ctx else {}
    budget = req.budget.model_dump() if req.budget else {}
    sources = [s.model_dump() for s in (req.sources or [])]

    task_id, estimate = pipeline.submit(
        query=query, gaokao_ctx=gaokao_ctx, budget=budget,
        sources=sources, effort=req.effort or "medium")

    return JSONResponse(status_code=202, content={
        "task_id": task_id,
        "status": "queued",
        "estimate": estimate,
        "notice": (f"深研为多 Agent 高成本通道(约 15× token 预算):预计 {estimate['minutes']} 分钟,"
                   f"证据配额 {estimate['max_evidence']} 条,请确认后再轮询。"),
    })


@router.get("/{task_id}")
async def get_deep_research_status(task_id: str):
    status = get_pipeline().get_status(task_id)
    if status is None:
        return _error(404, "TASK_NOT_FOUND", f"深研任务不存在:{task_id}")
    return status


@router.get("/{task_id}/stream")
async def stream_deep_research(task_id: str):
    pipeline = get_pipeline()
    if pipeline.get_status(task_id) is None:
        return _error(404, "TASK_NOT_FOUND", f"深研任务不存在:{task_id}")

    def sse_frames():
        for event in pipeline.stream_events(task_id):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(sse_frames(), media_type="text/event-stream")


@router.get("/{task_id}/report")
async def get_deep_research_report(task_id: str):
    """回查任务报告(含逐 claim 的 evidence_id 外键引用)。"""
    status = get_pipeline().get_status(task_id)
    if status is None:
        return _error(404, "TASK_NOT_FOUND", f"深研任务不存在:{task_id}")
    report = get_report_by_task(task_id)
    if report is None:
        return _error(404, "TASK_NOT_FOUND", f"任务报告尚未生成:{task_id}")
    return {"report_id": report["report_id"], "task_id": task_id,
            "content_md": report["content_md"], "mode": report["mode"],
            "citations": report["citations"]}
