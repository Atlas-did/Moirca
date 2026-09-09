# -*- coding: utf-8 -*-
"""GET /api/health —— 健康检查(CONTRACT §e.1,AGENT_01)。

接线说明(由 AGENT_05 统一在 backend/app/api/__init__.py 追加,本模块不自接):
    from .health import router as health_router
    router.include_router(health_router, prefix="", tags=["健康检查"])

契约响应:
    { "ok": true, "service": "webbridge-backend", "version": "1.0.0",
      "llm_configured": true, "evidence_db": true }
"""
from __future__ import annotations

import os
import sqlite3

from fastapi import APIRouter

from app.config import Config

router = APIRouter()

SERVICE_VERSION = "1.0.0"


def _evidence_db_ready() -> bool:
    """证据库可用性:数据库文件存在且 evidence 表已建立(AGENT_02 落地后为 True)。

    任何异常按 False 处理,健康检查自身绝不抛错。
    """
    try:
        db_path = Config.DATABASE_PATH
        if not os.path.exists(db_path):
            return False
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=3.0)
        try:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'"
            ).fetchone()
            return row is not None
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        return False


@router.get("/health")
async def health():
    return {
        "ok": True,
        "service": "webbridge-backend",
        "version": SERVICE_VERSION,
        "llm_configured": bool(Config.LLM_API_KEY),
        "evidence_db": _evidence_db_ready(),
    }
