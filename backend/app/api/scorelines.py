"""公开分数线/位次 API。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Query

from ..services.scoreline_service import scoreline_service

router = APIRouter()


@router.get("/stats")
def scoreline_stats() -> Dict[str, Any]:
    return scoreline_service.stats()


@router.get("/search")
def search_scorelines(
    province: Optional[str] = Query(default=None),
    subject_type: Optional[str] = Query(default=None),
    school: Optional[str] = Query(default=None),
    major: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> Dict[str, Any]:
    items = scoreline_service.search(
        province=province,
        subject_type=subject_type,
        school=school,
        major=major,
        year=year,
        limit=limit,
    )
    return {
        "items": items,
        "count": len(items),
    }


@router.post("/refresh")
def refresh_scorelines() -> Dict[str, Any]:
    scoreline_service.reload()
    return {"refreshed": True}
