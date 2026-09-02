"""社会模拟 API（Twitter/Reddit 多轮，MVP 骨架）"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.simulation_service import simulation_service

router = APIRouter()


class SimulationRunRequest(BaseModel):
    topic: str = Field(..., description="模拟主题，例如：‘计算机科学与技术 就业与风险’")
    rounds: int = Field(3, ge=1, le=20, description="模拟轮数")
    platforms: List[str] = Field(default_factory=lambda: ["twitter", "reddit"], description="平台列表")
    seed_context: Optional[Dict[str, Any]] = Field(None, description="可选：推荐结果/图谱摘要等上下文")


@router.post("/run")
def run_simulation(req: SimulationRunRequest) -> Dict[str, Any]:
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="topic 不能为空")
    simulation_id = simulation_service.start(
        topic=req.topic,
        rounds=req.rounds,
        platforms=req.platforms,
        seed_context=req.seed_context,
    )
    return {"simulation_id": simulation_id}


@router.get("/{simulation_id}")
def get_simulation(simulation_id: str) -> Dict[str, Any]:
    try:
        st = simulation_service.get_status(simulation_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="simulation not found")

    payload = {
        "simulation_id": st.simulation_id,
        "state": st.state,
        "progress": st.progress,
        "message": st.message,
        "created_at": st.created_at,
        "updated_at": st.updated_at,
        "error": st.error,
    }

    if st.state == "succeeded":
        try:
            payload["result"] = simulation_service.load_result(simulation_id)
        except Exception:
            payload["result"] = None

    return payload
