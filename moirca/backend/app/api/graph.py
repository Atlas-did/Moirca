"""知识图谱构建/读取 API"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.graph_builder_service import GraphBuilderService

router = APIRouter()
_service = GraphBuilderService()


class GraphBuildRequest(BaseModel):
    text: str = Field(..., description="用于抽取三元组并构建图谱的文本")
    ontology: Optional[Dict[str, Any]] = Field(None, description="可选：本体论约束")


@router.post("/build")
def build_graph(req: GraphBuildRequest) -> Dict[str, Any]:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text 不能为空")
    result = _service.build_from_text(text=req.text, ontology=req.ontology)
    return {
        "graph_id": result.graph_id,
        "mode": result.mode,
        "node_count": result.node_count,
        "edge_count": result.edge_count,
        "saved_path": result.saved_path,
    }


@router.get("/{graph_id}/stats")
def graph_stats(graph_id: str) -> Dict[str, Any]:
    try:
        return _service.stats(graph_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="graph not found")


@router.get("/{graph_id}/export")
def graph_export(graph_id: str) -> Dict[str, Any]:
    try:
        return _service.load(graph_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="graph not found")
