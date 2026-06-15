"""Zep Cloud 图谱构建 API（可选）"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.zep_graph_service import ZepGraphService

router = APIRouter()


class ZepBuildRequest(BaseModel):
    text: str = Field(..., description="用于写入 Zep 的文本（Zep 自动抽取实体/关系）")
    graph_name: str = Field("Moirca Graph", description="Zep 图谱名称")


@router.post("/build")
def build_zep_graph(req: ZepBuildRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text 不能为空")
    try:
        service = ZepGraphService()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        return service.build_from_text(text=req.text, graph_name=req.graph_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Zep 构图失败: {e}")
