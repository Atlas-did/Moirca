"""报告生成 API（Markdown）

改造(CONTRACT §e / AGENT_05):
  - POST /api/report         深研任务报告回查:{task_id} → 报告 + citations
                             (逐 claim 的 evidence_id 外键引用,禁止复制 quote)
  - POST /api/report/generate 既有单文件 Markdown 生成,保留不动
  - GET  /api/report/{id}    按 report_id 回查;rep_ 前缀走 SQLite 报告表
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..report.models import get_report as get_report_row
from ..report.models import get_report_by_task as find_report_by_task
from ..services.report_service import report_service
from ..services.simulation_service import simulation_service
from .auth import verify_api_token

router = APIRouter(dependencies=[Depends(verify_api_token)])  # 可选 token 鉴权(app/api/auth.py)


class ReportGenerateRequest(BaseModel):
    profile: Dict[str, Any] = Field(..., description="用户画像/输入（score/province/decision 结果等）")
    recommendations: Dict[str, Any] = Field(..., description="推荐接口返回 JSON（或其子集）")
    simulation_id: Optional[str] = Field(None, description="可选：引用某次模拟结果")
    document_ids: list[str] = Field(default_factory=list, description="可选：关联的上传文档 ID")
    report_context: Optional[Dict[str, Any]] = Field(None, description="可选：上传/图谱/推荐的上下文快照")


class ReportByTaskRequest(BaseModel):
    task_id: str = Field(..., description="深研任务 ID(task_ 前缀,由 /api/deep-research 返回)")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message, "details": {}}})


@router.post("")
def get_report_by_task(req: ReportByTaskRequest):
    """按深研任务回查决策说明书(必须返回 citations,CONTRACT §e)。"""
    task_id = (req.task_id or "").strip()
    if not task_id:
        return _error(400, "INVALID_PARAMS", "task_id 不能为空")
    report = find_report_by_task(task_id)
    if report is None:
        return _error(404, "REPORT_NOT_FOUND", f"任务报告不存在或尚未生成:{task_id}")
    return {
        "report_id": report["report_id"],
        "task_id": report.get("task_id") or task_id,
        "query": report.get("query", ""),
        "mode": report.get("mode", "rule"),
        "content_md": report["content_md"],
        "evidence_count": report.get("evidence_count", 0),
        "citations": report["citations"],
    }


@router.post("/generate")
def generate_report(req: ReportGenerateRequest) -> Dict[str, Any]:
    simulation = None
    if req.simulation_id:
        try:
            simulation = simulation_service.load_result(req.simulation_id)
        except Exception:
            raise HTTPException(status_code=400, detail="simulation_id 无效或结果未就绪")

    return report_service.generate_markdown(
        profile=req.profile,
        recommendations=req.recommendations,
        simulation=simulation,
        report_context=req.report_context or {"document_ids": req.document_ids},
    )


@router.get("/{report_id}")
def get_report(report_id: str) -> Dict[str, Any]:
    # rep_ 前缀:深研报告表(SQLite,含 citations);否则走旧单文件报告
    if report_id.startswith("rep_"):
        row = get_report_row(report_id)
        if row is None:
            raise HTTPException(status_code=404, detail="report not found")
        return {
            "report_id": report_id,
            "task_id": row.get("task_id", ""),
            "content_md": row["content_md"],
            "mode": row.get("mode", "rule"),
            "citations": row["citations"],
        }
    try:
        md = report_service.load_markdown(report_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="report not found")
    return {"report_id": report_id, "content_md": md}
