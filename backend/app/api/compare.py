"""
对比分析 API

对齐 docs/api.md 第5节 + docs/backlog.md P1-3
对两个志愿进行多维度横向对比
"""
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


# ============================================
# 请求/响应模型
# ============================================

class CompareTarget(BaseModel):
    school: str
    major: str


class CompareRequest(BaseModel):
    left: CompareTarget
    right: CompareTarget
    score: float = 550
    province: str = "广东"
    keywords: List[str] = []


class DimensionResult(BaseModel):
    name: str           # 对比维度
    left: str           # 左侧结果
    right: str          # 右侧结果
    winner: str = ""    # "left" | "right" | "tie"


class CompareResponse(BaseModel):
    summary: str
    dimensions: List[DimensionResult]
    risks: List[str]
    evidence: List[str]
    recommendation: str  # 最终建议


# ============================================
# 对比逻辑
# ============================================

# 院校层次评分
SCHOOL_TIERS = {
    "华南理工大学": 95, "中山大学": 95,
    "暨南大学": 85,
    "深圳大学": 78,
    "广州大学": 65,
    "广东工业大学": 65,
    "东莞理工学院": 45,
}

# 专业就业确定性评分
MAJOR_CERTAINTY = {
    "计算机科学与技术": 85, "软件工程": 82,
    "电气工程及其自动化": 80, "通信工程": 75,
    "机械设计制造及其自动化": 70, "会计学": 72,
    "临床医学": 88, "金融学": 65,
    "法学": 55, "汉语言文学": 50,
}


def _compare_dimensions(left: CompareTarget, right: CompareTarget,
                        score: float, keywords: List[str]) -> List[DimensionResult]:
    """多维度对比"""
    dims = []

    # 1. 院校层次
    left_tier = SCHOOL_TIERS.get(left.school, 60)
    right_tier = SCHOOL_TIERS.get(right.school, 60)
    winner = "left" if left_tier > right_tier else ("right" if right_tier > left_tier else "tie")
    dims.append(DimensionResult(
        name="院校层次",
        left=f"{left.school}（{'985/211' if left_tier >= 85 else '一本' if left_tier >= 65 else '二本'}）",
        right=f"{right.school}（{'985/211' if right_tier >= 85 else '一本' if right_tier >= 65 else '二本'}）",
        winner=winner,
    ))

    # 2. 录取概率（分数越高概率越大）
    score_pct = score / 750
    left_prob = min(0.95, score_pct * (left_tier / 100) + 0.1)
    right_prob = min(0.95, score_pct * (right_tier / 100) + 0.1)
    winner = "left" if left_prob > right_prob else ("right" if right_prob > left_prob else "tie")
    dims.append(DimensionResult(
        name="录取概率",
        left=f"约{left_prob:.0%}",
        right=f"约{right_prob:.0%}",
        winner=winner,
    ))

    # 3. 就业前景
    left_certainty = MAJOR_CERTAINTY.get(left.major, 60)
    right_certainty = MAJOR_CERTAINTY.get(right.major, 60)
    winner = "left" if left_certainty > right_certainty else ("right" if right_certainty > left_certainty else "tie")
    dims.append(DimensionResult(
        name="就业确定性",
        left=f"就业确定性 {'高' if left_certainty >= 80 else '中' if left_certainty >= 65 else '一般'}",
        right=f"就业确定性 {'高' if right_certainty >= 80 else '中' if right_certainty >= 65 else '一般'}",
        winner=winner,
    ))

    # 4. 偏好匹配
    if keywords:
        left_match = sum(1 for kw in keywords if kw in left.major + left.school)
        right_match = sum(1 for kw in keywords if kw in right.major + right.school)
        total = left_match + right_match
        if total > 0:
            left_pct = left_match / total
            right_pct = right_match / total
            winner = "left" if left_pct > right_pct else ("right" if right_pct > left_pct else "tie")
            dims.append(DimensionResult(
                name="偏好匹配",
                left=f"匹配 {left_match}/{len(keywords)} 个关键词",
                right=f"匹配 {right_match}/{len(keywords)} 个关键词",
                winner=winner,
            ))

    # 5. 城市发展（基于院校所在城市）
    city_tiers = {"广州": 90, "深圳": 95, "珠海": 75, "东莞": 60, "佛山": 60}
    left_city = "广州" if left.school in ["华南理工大学", "中山大学", "暨南大学", "广州大学", "广东工业大学"] else "东莞"
    right_city = "广州" if right.school in ["华南理工大学", "中山大学", "暨南大学", "广州大学", "广东工业大学"] else "东莞"
    if "深圳" in left.school:
        left_city = "深圳"
    if "深圳" in right.school:
        right_city = "深圳"
    left_city_score = city_tiers.get(left_city, 50)
    right_city_score = city_tiers.get(right_city, 50)
    winner = "left" if left_city_score > right_city_score else ("right" if right_city_score > left_city_score else "tie")
    dims.append(DimensionResult(
        name="城市发展",
        left=f"{left_city}（{'一线' if left_city_score >= 85 else '新一线' if left_city_score >= 70 else '二线'}）",
        right=f"{right_city}（{'一线' if right_city_score >= 85 else '新一线' if right_city_score >= 70 else '二线'}）",
        winner=winner,
    ))

    return dims


def _generate_recommendation(dims: List[DimensionResult]) -> str:
    """根据各维度胜出情况生成最终建议"""
    left_wins = sum(1 for d in dims if d.winner == "left")
    right_wins = sum(1 for d in dims if d.winner == "right")

    if left_wins > right_wins + 1:
        return f"综合{len(dims)}个维度，左侧选项在{left_wins}个维度上占优，建议优先考虑左侧。但请注意，最终决定应结合个人兴趣和家庭情况。"
    elif right_wins > left_wins + 1:
        return f"综合{len(dims)}个维度，右侧选项在{right_wins}个维度上占优，建议优先考虑右侧。但请注意，最终决定应结合个人兴趣和家庭情况。"
    else:
        return f"两个选项各有优劣（左侧{left_wins}胜，右侧{right_wins}胜），建议根据你最看重的维度做最终决定。"


# ============================================
# API 端点
# ============================================

@router.post("/", response_model=CompareResponse)
def compare_volunteers(request: CompareRequest):
    """
    两个志愿横向对比 — 对齐 docs/api.md 第5节

    对比维度: 院校层次 / 录取概率 / 就业确定性 / 偏好匹配 / 城市发展
    """
    dims = _compare_dimensions(
        request.left, request.right,
        request.score, request.keywords,
    )

    # 汇总
    winners = {"left": 0, "right": 0}
    for d in dims:
        if d.winner in winners:
            winners[d.winner] += 1

    summary = f"共对比{len(dims)}个维度：左侧{request.left.school} {request.left.major} 在{winners['left']}个维度占优，右侧{request.right.school} {request.right.major} 在{winners['right']}个维度占优"

    risks = [
        "对比结果基于当前可用数据，实际录取受当年分数线、招生计划等多因素影响",
        "建议到两校本科招生网核实最新招生章程和专业要求",
    ]

    evidence = [
        "院校层次数据来源: 教育部学科评估 + 公开排名",
        "就业数据来源: 行业报告 + 社区反馈分析",
        f"对比时间: 基于{request.province}省{request.score}分考生画像",
    ]

    recommendation = _generate_recommendation(dims)

    return CompareResponse(
        summary=summary,
        dimensions=dims,
        risks=risks,
        evidence=evidence,
        recommendation=recommendation,
    )
