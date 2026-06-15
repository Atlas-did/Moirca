"""
Knowledge Base API - search zhangxuefeng + gaokao knowledge
"""
from fastapi import APIRouter, Query
from ..services.knowledge_base import search, get_kb

router = APIRouter()

@router.get("/search")
def kb_search(q: str = Query(..., description="搜索关键词"), top_k: int = Query(8)):
    results = search(q, top_k)
    return {"results": results, "total": len(results)}

@router.get("/stats")
def kb_stats():
    kb = get_kb()
    cats = {}
    for e in kb['entries']:
        c = e.get('category', 'other')
        cats[c] = cats.get(c, 0) + 1
    return {
        "total_entries": kb['total'],
        "categories": cats,
    }
