"""Agent 元信息 API（角色定义等）"""

from fastapi import APIRouter

from ..agents.roles import get_roles

router = APIRouter()


@router.get("/roles")
def list_roles():
    roles = get_roles()
    return {
        "roles": [
            {
                "name": r.name,
                "tagline": r.tagline,
                "responsibilities": r.responsibilities,
            }
            for r in roles.values()
        ]
    }
