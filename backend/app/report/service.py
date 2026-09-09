"""报告/任务服务(薄封装,AGENT_05)。

管线/API 统一经 ReportStore 读写任务与报告;真实存储在 backend SQLite
(deep_research_tasks / deep_research_reports / report_citations),
不再只落 JSON 文件(SessionManager 的 session JSON 仅供断点续跑)。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..utils.logger import get_logger
from . import models


class ReportStore:
    def __init__(self):
        self.logger = get_logger('moirca.report_store')

    # ---------------- 任务 ----------------

    def create_task(self, query: str,
                    gaokao_ctx: Optional[Dict[str, Any]] = None,
                    budget: Optional[Dict[str, Any]] = None,
                    task_id: Optional[str] = None) -> Dict[str, Any]:
        return models.create_task(query, gaokao_ctx=gaokao_ctx, budget=budget,
                                  task_id=task_id)

    def mark_running(self, task_id: str, session_id: str = "") -> None:
        models.update_task(task_id, status="running", session_id=session_id or None,
                           progress=0.05)

    def mark_progress(self, task_id: str, progress: float,
                      agents_done: List[str], evidence_count: int) -> None:
        models.update_task(task_id, progress=progress, agents_done=agents_done,
                           evidence_count=evidence_count)

    def mark_done(self, task_id: str, report_id: str, progress: float = 1.0) -> None:
        models.update_task(task_id, status="done", report_id=report_id,
                           progress=progress, error=None)

    def mark_failed(self, task_id: str, error: str) -> None:
        models.update_task(task_id, status="failed", error=error)

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return models.get_task(task_id)

    # ---------------- 报告 ----------------

    def save_report(self, task_id: str, query: str, content_md: str, mode: str,
                    rounds_used: int, claims: List[Dict[str, Any]]) -> str:
        report_id, _count = models.save_report(
            task_id=task_id, query=query, content_md=content_md, mode=mode,
            rounds_used=rounds_used, claims=claims)
        return report_id

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        return models.get_report(report_id)

    def get_report_by_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return models.get_report_by_task(task_id)


report_store = ReportStore()
