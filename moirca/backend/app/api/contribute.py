"""
用户贡献数据 API

接收从油猴脚本导出的志愿填报数据，写入数据库并触发交叉验证。

端点:
  POST /               提交贡献数据
  GET  /stats          全局贡献统计
  GET  /history        匿名用户贡献历史
"""
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from typing import Optional, List

from ..services.contribution_service import contribution_service, CrossCheckResult

router = APIRouter()


# ============================================
# 请求/响应模型
# ============================================

class ContributeRequest(BaseModel):
    province: str
    volunteers: List[dict]
    user_profile: Optional[dict] = None
    exported_at: Optional[str] = None
    subject_type: Optional[str] = None
    score: Optional[float] = None
    anonymous_id: Optional[str] = None


class ContributeResponse(BaseModel):
    accepted: int
    rejected: int
    verified: int
    contribution_ids: List[int]
    anonymous_id: str
    message: str
    cross_check_summary: Optional[str] = None


class StatsResponse(BaseModel):
    total: int
    verified: int
    verification_rate: float
    by_province: dict


class HistoryItem(BaseModel):
    id: int
    province: str
    year: int
    school: str
    first_major: Optional[str] = None
    verified: bool
    score: Optional[float] = None
    created_at: str


class HistoryResponse(BaseModel):
    items: List[HistoryItem]
    total: int


class ErrorResponse(BaseModel):
    error: dict


# ============================================
# 端点
# ============================================

@router.post("/", response_model=ContributeResponse, summary="提交志愿填报数据")
async def contribute(request: Request, body: ContributeRequest):
    """
    接收从 Moirca 油猴脚本导出的志愿填报数据。

    处理流程:
    1. 格式验证
    2. 去重（同用户同学校同专业组不重复写入）
    3. 与公开数据交叉比对
    4. 写入数据库
    5. 返回处理结果

    数据仅本地处理，不做任何外部传输。
    """
    # 转换为 dict 用于验证
    data = {
        'province': body.province,
        'volunteers': body.volunteers,
        'user_profile': body.user_profile or {},
        'exported_at': body.exported_at,
        'subject_type': body.subject_type,
        'score': body.score,
    }

    # 1. 验证
    result = contribution_service.validate(data)
    if not result.valid:
        return {
            'accepted': 0,
            'rejected': len(body.volunteers),
            'verified': 0,
            'contribution_ids': [],
            'anonymous_id': body.anonymous_id or '',
            'message': f"数据验证失败: {'; '.join(result.errors)}",
            'cross_check_summary': None,
        }

    # 2. 匿名ID
    anonymous_id = body.anonymous_id or contribution_service.generate_anonymous_id(
        str(request.client.host) if request.client else ""
    )

    # 3. 去重
    unique_vols = contribution_service.deduplicate(
        result.parsed.get('volunteers', []),
        anonymous_id,
        body.province,
    )
    duplicates = len(body.volunteers) - len(unique_vols)

    # 4. 交叉比对
    cross_checks = []
    for vol in unique_vols:
        try:
            cc = contribution_service.cross_check(vol, body.province)
            cross_checks.append(cc)
        except Exception:
            cross_checks.append(CrossCheckResult(
                school_code=vol.get('school_code', ''),
                school_name=vol.get('school_name', ''),
            ))

    # 5. 写入
    ids = contribution_service.store(data, anonymous_id, cross_checks)

    # 构建摘要
    verified_count = sum(1 for cc in cross_checks if cc.confidence_boost >= 0)
    conflict_count = sum(1 for cc in cross_checks if len(cc.conflict_details) > 0)

    summary_parts = []
    if verified_count > 0:
        summary_parts.append(f"{verified_count} 条验证通过")
    if conflict_count > 0:
        summary_parts.append(f"{conflict_count} 条有数据冲突需关注")
    if duplicates > 0:
        summary_parts.append(f"{duplicates} 条重复跳过")

    return {
        'accepted': len(unique_vols),
        'rejected': duplicates,
        'verified': verified_count,
        'contribution_ids': ids,
        'anonymous_id': anonymous_id,
        'message': f"已接受 {len(unique_vols)} 条志愿数据",
        'cross_check_summary': '; '.join(summary_parts) if summary_parts else None,
    }


@router.get("/stats", response_model=StatsResponse, summary="全局贡献统计")
def get_stats():
    """返回全平台贡献数据统计：总量、验证通过率、各省份分布。"""
    return contribution_service.get_stats()


@router.get("/history", response_model=HistoryResponse, summary="匿名用户贡献历史")
def get_history(
    anonymous_id: str = Query(..., description="匿名用户ID"),
):
    """查询指定匿名用户的贡献历史。"""
    items = contribution_service.get_history(anonymous_id)
    return {'items': items, 'total': len(items)}
