"""evidence API(CONTRACT §c / §e.4 / §f / §g,AGENT_02 唯一真源)。

端点:
  POST /api/evidence/save        写入一条(幂等,靠 evidence_id);批量 {"items":[...]} ≤50
  GET  /api/evidence/query       检索(task_id/channel/url/q/evidence_id/limit/offset),恒 200
  GET  /api/evidence/{id}        回查原文(含旁路文件内容读取)
  POST /api/evidence/quote       claim → evidence 浅层匹配(防幻觉钩子)

服务函数(render_digest / render_references_block / match_claims 等)在同包
service.py,报告/管线可 import 复用(AGENT_05 的 agent7 即经 app.api.evidence
兼容层取用)。

=====================================================================
接线(AGENT_05 统一接线,AGENT_02 不改 app/__init__.py / api/__init__.py):
  在 backend/app/api/__init__.py 追加两行:
      from .evidence import router as evidence_router
      router.include_router(evidence_router, prefix="/evidence", tags=["证据库"])
  api_router 已挂 /api 前缀,最终路径即 /api/evidence/*。
=====================================================================
"""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .repository import (
    get_evidence,
    query_evidence,
    read_raw_ref,
    save_evidence,
)
from .schema import (
    CHANNELS,
    QUOTE_MAX_CHARS,
    SOURCE_QUALITIES,
    _validate_raw_ref,
    _validate_url,
    is_valid_evidence_id,
    new_evidence_id,
    normalize_fetched_at,
    normalize_locator,
    now_iso_utc,
)
from .service import match_claims


def _token_guard(
    # alias 必须与 app/api/auth.py 一致(见该处注释:否则绑定成 "token-header")
    token_header: Optional[str] = Header(default=None, alias="X-WebBridge-Token"),
) -> None:
    """惰性转发 app.api.auth.verify_api_token(避免 evidence → api 包 __init__ 循环导入)。"""
    from ..api.auth import verify_api_token
    return verify_api_token(token_header)


router = APIRouter(dependencies=[Depends(_token_guard)])  # 可选 token 鉴权(app/api/auth.py)

MAX_BATCH_ITEMS = 50          # §e.4:批量 ≤50 条
MAX_QUERY_LIMIT = 100         # §e.4:limit ≤100
MAX_CLAIMS = 50               # /quote 单次最多校验的 claim 数
MAX_CLAIM_CHARS = 2000


# ---------------------------------------------------------------------------
# 错误响应(统一 {"error":{code,message,details}} 信封,§g)
# ---------------------------------------------------------------------------

def _error(status: int, code: str, message: str,
           details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message,
                           "details": details or {}}},
    )


class _Invalid(Exception):
    """参数校验失败 → 400 INVALID_PARAMS。"""


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------

class EvidenceItemIn(BaseModel):
    evidence_id: Optional[str] = Field(default=None, description="幂等键;缺省服务端生成 ev_+ULID")
    channel: str = Field(..., description="page_qa|deep_research|controlled_browse|manual")
    url: str = Field(..., description="证据来源页 URL")
    title: str = ""
    fetched_at: Optional[str] = Field(default=None, description="ISO8601;缺省服务端补真实 now()")
    source_quality: str = "unknown"
    quote: str = Field(..., description="原文摘录,≤2000 字符,保留原文不清洗")
    locator: Optional[Dict[str, Any]] = None
    raw_ref: Optional[str] = Field(default=None, description="artifacts/{task_id}/{file} 相对形式")
    task_id: str = ""


class EvidenceSaveRequest(BaseModel):
    # 单条形态
    evidence_id: Optional[str] = None
    channel: Optional[str] = None
    url: Optional[str] = None
    title: str = ""
    fetched_at: Optional[str] = None
    source_quality: Optional[str] = None
    quote: Optional[str] = None
    locator: Optional[Dict[str, Any]] = None
    raw_ref: Optional[str] = None
    task_id: Optional[str] = None
    # 批量形态
    items: Optional[List[EvidenceItemIn]] = None


class ClaimMatchRequest(BaseModel):
    claims: List[str] = Field(..., description="待核查的结论句列表")
    task_id: Optional[str] = Field(default=None, description="限定在该深研任务内匹配")
    limit: int = Field(default=3, ge=1, le=10, description="每条 claim 最多返回证据数")
    min_score: float = Field(default=0.2, ge=0.0, le=1.0, description="支持判定阈值")


# ---------------------------------------------------------------------------
# 校验 + 规范化(单条)
# ---------------------------------------------------------------------------

def _normalize_item(data: Dict[str, Any]) -> Dict[str, Any]:
    """校验并规范化一条证据,返回可直接入库的 record。失败抛 _Invalid。"""
    try:
        channel = (data.get("channel") or "").strip()
        if not channel:
            raise ValueError("channel 必填(page_qa|deep_research|controlled_browse|manual)")
        if channel not in CHANNELS:
            raise ValueError(f"channel 必须是 {CHANNELS} 之一,得到 {channel!r}")

        url = _validate_url(data.get("url") or "")

        quote = data.get("quote")
        if quote is None or not str(quote).strip():
            raise ValueError("quote 必填(原文摘录,保留原文不清洗)")
        quote = str(quote)
        if len(quote) > QUOTE_MAX_CHARS:
            raise ValueError(f"quote 超长:{len(quote)} > {QUOTE_MAX_CHARS} 字符(§h)"
                             ";大正文请落旁路文件并传 raw_ref")

        quality = (data.get("source_quality") or "unknown").strip()
        if quality not in SOURCE_QUALITIES:
            raise ValueError(f"source_quality 必须是 {SOURCE_QUALITIES} 之一,得到 {quality!r}")

        evidence_id = data.get("evidence_id") or None
        if evidence_id is not None:
            evidence_id = str(evidence_id).strip()
            if not is_valid_evidence_id(evidence_id):
                raise ValueError("evidence_id 必须形如 ev_ + 26 位 ULID(可省略由服务端生成)")

        locator = normalize_locator(data.get("locator"))
        raw_ref = _validate_raw_ref(data.get("raw_ref"))
        fetched_at = normalize_fetched_at(data.get("fetched_at"))
    except ValueError as exc:
        raise _Invalid(str(exc)) from exc

    return {
        "evidence_id": evidence_id or new_evidence_id(),
        "channel": channel,
        "url": url,
        "title": str(data.get("title") or ""),
        "fetched_at": fetched_at,
        "source_quality": quality,
        "quote": quote,
        "locator": locator,
        "raw_ref": raw_ref,
        "task_id": str(data.get("task_id") or ""),
        "created_at": now_iso_utc(),
    }


# ---------------------------------------------------------------------------
# POST /api/evidence/save
# ---------------------------------------------------------------------------

@router.post("/save")
def evidence_save(payload: EvidenceSaveRequest):
    """写入证据。幂等:同 evidence_id 重复写入返回已存记录(duplicate=true),不覆盖。"""
    if payload.items is not None:
        if not payload.items:
            return _error(400, "INVALID_PARAMS", "items 不能为空(单条请直接平铺字段)")
        if len(payload.items) > MAX_BATCH_ITEMS:
            return _error(400, "INVALID_PARAMS",
                          f"批量最多 {MAX_BATCH_ITEMS} 条,得到 {len(payload.items)} 条")
        try:
            records = [_normalize_item(it.model_dump()) for it in payload.items]
        except _Invalid as exc:
            return _error(400, "INVALID_PARAMS", str(exc), {"hint": "items 中存在非法条目"})
        try:
            out = []
            for rec in records:
                _row, created = save_evidence(rec)
                out.append({"evidence_id": rec["evidence_id"],
                            "created_at": rec["created_at"],
                            "duplicate": not created})
        except sqlite3.Error as exc:
            return _db_fail(records, exc)
        return JSONResponse(status_code=201,
                            content={"items": out, "count": len(out)})

    # 单条形态
    try:
        record = _normalize_item(payload.model_dump())
    except _Invalid as exc:
        return _error(400, "INVALID_PARAMS", str(exc))
    try:
        row, created = save_evidence(record)
    except sqlite3.Error as exc:
        return _db_fail([record], exc)

    body = {"evidence_id": row["evidence_id"], "created_at": row["created_at"]}
    if not created:
        body["duplicate"] = True
        return JSONResponse(status_code=200, content=body)
    return JSONResponse(status_code=201, content=body)


def _db_fail(records: List[Dict[str, Any]], exc: sqlite3.Error) -> JSONResponse:
    """§g:DB 写失败 → EVIDENCE_DB_FAIL,不静默丢数据,返回失败让调用方重试。"""
    task_ids = sorted({r.get("task_id") or "" for r in records})
    return _error(
        500, "EVIDENCE_DB_FAIL",
        f"证据写库失败:{exc};数据未落库,请重试(原文仍在,不会丢)",
        {"task_id": task_ids[0] if len(task_ids) == 1 else task_ids, "retry": True},
    )


# ---------------------------------------------------------------------------
# GET /api/evidence/query
# ---------------------------------------------------------------------------

@router.get("/query")
def evidence_query(
    task_id: Optional[str] = None,
    channel: Optional[str] = None,
    url: Optional[str] = None,
    q: Optional[str] = None,
    evidence_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """检索证据。命中为空也返回 200 + 空数组(§g:query 恒 200 而非 404)。"""
    if channel is not None and channel not in CHANNELS:
        return _error(400, "INVALID_PARAMS",
                      f"channel 必须是 {CHANNELS} 之一,得到 {channel!r}")
    limit = max(1, min(int(limit), MAX_QUERY_LIMIT))
    offset = max(0, int(offset))
    items, total = query_evidence(
        task_id=task_id or None, channel=channel, url=url or None, q=q or None,
        evidence_id=evidence_id or None, limit=limit, offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# ---------------------------------------------------------------------------
# GET /api/evidence/{evidence_id} —— 回查原文(含旁路文件读取)
# ---------------------------------------------------------------------------

@router.get("/{evidence_id}")
def evidence_get(evidence_id: str):
    if not is_valid_evidence_id(evidence_id):
        return _error(404, "EVIDENCE_NOT_FOUND",
                      f"evidence_id 格式非法:{evidence_id!r}(应为 ev_ + 26 位 ULID)")
    row = get_evidence(evidence_id)
    if row is None:
        return _error(404, "EVIDENCE_NOT_FOUND", f"证据不存在:{evidence_id}")
    raw = read_raw_ref(row.get("raw_ref"))
    return {"evidence": row, "raw": raw}


# ---------------------------------------------------------------------------
# 防幻觉钩子(任务书 #5):POST /api/evidence/quote
# ---------------------------------------------------------------------------

@router.post("/quote")
def evidence_quote(payload: ClaimMatchRequest):
    """claim → evidence 浅层匹配,供报告生成时标注"该句无证据支持"(防幻觉钩子)。"""
    claims = [c for c in payload.claims if c and str(c).strip()]
    if not claims:
        return _error(400, "INVALID_PARAMS", "claims 不能为空")
    if len(claims) > MAX_CLAIMS:
        return _error(400, "INVALID_PARAMS", f"claims 最多 {MAX_CLAIMS} 条")
    for c in claims:
        if len(c) > MAX_CLAIM_CHARS:
            return _error(400, "INVALID_PARAMS",
                          f"单条 claim 超长(>{MAX_CLAIM_CHARS} 字符)")
    # 候选证据:优先任务内,最多取 100 条参与匹配
    evidences, _total = query_evidence(
        task_id=payload.task_id or None, limit=MAX_QUERY_LIMIT,
    )
    results = match_claims(
        claims, evidences, limit=payload.limit, min_score=payload.min_score,
    )
    unsupported = sum(1 for r in results if not r["supported"])
    return {
        "results": results,
        "unsupported_count": unsupported,
        "candidates": len(evidences),
        "task_id": payload.task_id,
    }
