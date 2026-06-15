"""历史项目列表 API。"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from fastapi import APIRouter

from ..config import Config
from ..models.database import get_connection

router = APIRouter()


def _uploads_dir() -> str:
    return Config.UPLOAD_FOLDER


def _reports_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "reports")


def _recommendations_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recommendations")


def _simulations_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "simulations")


def _safe_read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _safe_read_text(path: str, limit: int = 6000) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read(limit)


def _first_heading(md: str) -> str:
    for line in md.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip() or "未命名报告"
    return "未命名报告"


def _list_uploads() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not os.path.exists(_uploads_dir()):
        return items
    for name in os.listdir(_uploads_dir()):
        if not name.endswith(".json"):
            continue
        path = os.path.join(_uploads_dir(), name)
        try:
            meta = _safe_read_json(path)
        except Exception:
            continue
        items.append({
            "kind": "upload",
            "id": meta.get("document_id") or name[:-5],
            "title": meta.get("filename") or "上传文档",
            "subtitle": f"图谱 {meta.get('graph_id') or '未生成'} · {meta.get('graph_mode') or 'unknown'}",
            "updated_at": meta.get("uploaded_at") or "",
            "status": "ready",
            "meta": meta,
        })
    return items


def _list_reports() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not os.path.exists(_reports_dir()):
        return items
    for name in os.listdir(_reports_dir()):
        if not name.endswith(".md"):
            continue
        path = os.path.join(_reports_dir(), name)
        try:
            md = _safe_read_text(path)
        except Exception:
            continue
        report_id = name[:-3]
        title = _first_heading(md)
        items.append({
            "kind": "report",
            "id": report_id,
            "title": title,
            "subtitle": os.path.basename(path),
            "updated_at": os.path.getmtime(path),
            "status": "ready",
            "preview": md[:240],
        })
    return items


def _list_recommendations() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not os.path.exists(_recommendations_dir()):
        return items
    for name in os.listdir(_recommendations_dir()):
        if not name.endswith(".json"):
            continue
        path = os.path.join(_recommendations_dir(), name)
        try:
            job = _safe_read_json(path)
        except Exception:
            continue
        items.append({
            "kind": "recommendation",
            "id": job.get("job_id") or name[:-5],
            "title": f"异步推荐 {job.get('job_id') or name[:-5]}",
            "subtitle": job.get("message") or job.get("status") or "",
            "updated_at": job.get("updated_at") or job.get("created_at") or "",
            "status": job.get("status") or "unknown",
            "progress": job.get("progress", 0),
            "result": job.get("result"),
        })
    return items


def _list_simulations() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not os.path.exists(_simulations_dir()):
        return items
    for name in os.listdir(_simulations_dir()):
        if not name.endswith(".json"):
            continue
        path = os.path.join(_simulations_dir(), name)
        try:
            data = _safe_read_json(path)
        except Exception:
            continue
        items.append({
            "kind": "simulation",
            "id": data.get("simulation_id") or name[:-5],
            "title": data.get("topic") or "模拟任务",
            "subtitle": f"轮数 {data.get('rounds', 0)} · 平台 {', '.join(data.get('platforms') or [])}",
            "updated_at": data.get("created_at") or "",
            "status": "ready",
            "meta": data,
        })
    return items


@router.get("/items")
def list_history(limit: int = 50) -> Dict[str, Any]:
    items = _list_recommendations() + _list_reports() + _list_uploads() + _list_simulations()
    items.sort(key=lambda x: str(x.get("updated_at") or ""), reverse=True)
    return {"items": items[: max(1, min(limit, 200))], "count": len(items)}


@router.get("/reports")
def list_report_records(limit: int = 30) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT report_id, user_id, profile_id, report_type, content_md, soul_questions, risk_warnings, created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (max(1, min(limit, 100)),),
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"items": rows, "count": len(rows)}