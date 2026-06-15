"""
填报入口导航 API

返回全国 31 省高考志愿填报官方入口聚合数据。
数据源: backend/data/portal_sites.json（社区可维护）

端点:
  GET /              全量数据
  GET /provinces     按省份/区域筛选
  GET /regions       区域摘要
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, List
import json
import os

router = APIRouter()

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "portal_sites.json")


# ============================================
# Pydantic 响应模型
# ============================================

class PortalLinkOut(BaseModel):
    label: str
    url: str
    description: str


class AuthorityOut(BaseModel):
    name: str
    url: str


class ProvincePortalsOut(BaseModel):
    application: Optional[PortalLinkOut] = None
    score_query: Optional[PortalLinkOut] = None
    admission_query: Optional[PortalLinkOut] = None


class ProvinceSiteOut(BaseModel):
    code: str
    name: str
    authority: AuthorityOut
    portals: ProvincePortalsOut
    notes: str


class RegionGroupOut(BaseModel):
    id: str
    name: str
    provinces: List[ProvinceSiteOut]


class NationalPlatformOut(BaseModel):
    id: str
    name: str
    url: str
    category: str
    description: str


class PortalSitesResponse(BaseModel):
    version: str
    updated_at: str
    description: str
    regions: List[RegionGroupOut]
    national_platforms: List[NationalPlatformOut]
    tips: List[str]


class ProvinceListResponse(BaseModel):
    provinces: List[ProvinceSiteOut]
    count: int


class RegionSummaryOut(BaseModel):
    id: str
    name: str
    province_count: int


class RegionListResponse(BaseModel):
    regions: List[RegionSummaryOut]


# ============================================
# 数据加载
# ============================================

def _load_data() -> dict:
    """从 JSON 文件加载全量数据"""
    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ============================================
# 端点
# ============================================

@router.get("/", response_model=PortalSitesResponse, summary="获取全部填报入口数据")
def get_all_sites():
    """返回所有省份的官方志愿填报入口、国家平台、温馨提示。"""
    return _load_data()


@router.get("/provinces", response_model=ProvinceListResponse, summary="按省份或区域筛选")
def get_provinces(
    province: Optional[str] = Query(default=None, description="省份名称，如「广东」"),
    region: Optional[str] = Query(default=None, description="区域名称，如「华东」"),
):
    """按省份名称或所属区域筛选填报入口数据。两个参数可单独或组合使用。"""
    data = _load_data()
    result: list = []
    for rg in data["regions"]:
        if region and rg["name"] != region:
            continue
        for p in rg["provinces"]:
            if province and p["name"] != province:
                continue
            result.append(p)
    return {"provinces": result, "count": len(result)}


@router.get("/regions", response_model=RegionListResponse, summary="获取区域列表")
def get_regions():
    """返回 6 大区域摘要（华北/东北/华东/中南/西南/西北），含各省份计数。"""
    data = _load_data()
    return {
        "regions": [
            {
                "id": rg["id"],
                "name": rg["name"],
                "province_count": len(rg["provinces"]),
            }
            for rg in data["regions"]
        ]
    }
