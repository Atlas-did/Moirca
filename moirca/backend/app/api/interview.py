"""模拟后采访 Agent：对推荐结果追问与复核"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..agents.roles import get_roles
from ..config import Config
from ..utils.llm_client import LLMClient

router = APIRouter()


class InterviewRequest(BaseModel):
    agent_name: str = Field(..., description="Agent 名称（如：官方猎手/口碑矿工/…）")
    question: str = Field(..., description="用户追问")
    context: Optional[Dict[str, Any]] = Field(None, description="可选：推荐结果/图谱摘要等上下文")


@router.post("/ask")
def ask_agent(req: InterviewRequest):
    roles = get_roles()
    role = roles.get(req.agent_name)
    if not role:
        raise HTTPException(status_code=400, detail=f"未知 agent_name: {req.agent_name}")

    if not Config.LLM_API_KEY:
        # 可运行降级：返回结构化占位，便于前端先联调
        return {
            "agent_name": role.name,
            "mode": "template",
            "answer": (
                f"（模板回复：未配置 LLM_API_KEY）\n"
                f"你问的是：{req.question}\n"
                "建议你补充：目标省份/分数位次/院校层次/是否服从调剂/是否接受读研等。"
            ),
            "follow_ups": [
                "你最不能接受的风险是什么？（滑档/调剂/城市/就业）",
                "你更想要学校牌子还是专业壁垒？",
                "家庭预算能否支撑长周期投入？",
            ],
        }

    client = LLMClient()
    context_text = ""
    if req.context:
        # 控制体积，避免把 huge JSON 直接塞进 prompt
        import json

        context_text = json.dumps(req.context, ensure_ascii=False)[:6000]

    system = role.system_prompt
    user = (
        "请用你的角色视角回答用户问题。要求：\n"
        "- 给出可执行的复核步骤（去哪看、看什么字段、怎么判断）\n"
        "- 如果缺数据要明确说，并给出最小补充信息清单\n"
        "- 不要夸大承诺\n\n"
        f"上下文（可为空）：\n{context_text}\n\n"
        f"用户问题：{req.question}"
    )

    answer = client.chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.4,
        max_tokens=1200,
    )

    return {
        "agent_name": role.name,
        "mode": "llm",
        "answer": answer,
    }
