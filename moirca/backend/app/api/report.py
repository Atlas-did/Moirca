"""报告生成 API（Markdown）"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.report_service import report_service
from ..services.simulation_service import simulation_service

router = APIRouter()


class ReportGenerateRequest(BaseModel):
    profile: Dict[str, Any] = Field(..., description="用户画像/输入（score/province/decision 结果等）")
    recommendations: Dict[str, Any] = Field(..., description="推荐接口返回 JSON（或其子集）")
    simulation_id: Optional[str] = Field(None, description="可选：引用某次模拟结果")
    document_ids: list[str] = Field(default_factory=list, description="可选：关联的上传文档 ID")
    report_context: Optional[Dict[str, Any]] = Field(None, description="可选：上传/图谱/推荐的上下文快照")


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
    try:
        md = report_service.load_markdown(report_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="report not found")
    return {"report_id": report_id, "content_md": md}
