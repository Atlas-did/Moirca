"""
决策树 API
P0核心：三步问答 → 输出志愿推荐方向
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# ============================================
# 决策树步骤定义（可扩展为数据库配置）
# ============================================
DECISION_TREE = {
    "step1": {
        "id": "score_tier",
        "question": "你的分数在省内大概什么位置？",
        "options": [
            {"key": "A", "label": "前5%（顶尖）", "tag": "冲985/211"},
            {"key": "B", "label": "前5%-15%（较好）", "tag": "冲211/稳一本"},
            {"key": "C", "label": "前15%-40%（普通）", "tag": "稳一本/冲好二本"},
            {"key": "D", "label": "40%以后", "tag": "二本/专科方向"},
        ],
    },
    "step2": {
        "id": "priority",
        "question": "你最看重什么？",
        "options": [
            {"key": "A", "label": "学校名气", "tag": "优先985/211"},
            {"key": "B", "label": "专业实力", "tag": "优先专业排名"},
            {"key": "C", "label": "城市发展", "tag": "优先一线/新一线城市"},
            {"key": "D", "label": "就业前景", "tag": "优先高薪专业"},
        ],
    },
    "step3": {
        "id": "exclusion",
        "question": "有没有特别不喜欢的？",
        "options": [
            {"key": "A", "label": "不想学数学/物理", "exclude": ["理学", "数学", "物理"]},
            {"key": "B", "label": "不想进工厂/工地", "exclude": ["土木", "机械", "化工", "矿业"]},
            {"key": "C", "label": "不想当老师/医生", "exclude": ["师范", "临床医学"]},
            {"key": "D", "label": "没有特别限制", "exclude": []},
        ],
    },
}


class DecisionRequest(BaseModel):
    score: float
    full_mark: float = 750.0
    province: str = "广东"
    exam_type: str = "general"  # general/art/sports


class DecisionStep(BaseModel):
    step_id: str
    question: str
    options: list[dict]


class DecisionAnswerRequest(BaseModel):
    score: float
    province: str = "广东"
    exam_type: str = "general"
    full_mark: float = 750.0
    answers: dict  # {"step1": "B", "step2": "D", "step3": "A"}


# ============================================
# API 端点
# ============================================

@router.get("/tree")
def get_decision_tree():
    """获取完整决策树定义"""
    return {"tree": DECISION_TREE}


@router.get("/step/{step_num}")
def get_step(step_num: int):
    """获取单步问题"""
    key = f"step{step_num}"
    if key not in DECISION_TREE:
        return {"error": "无效的步骤编号（1-3）"}
    return DECISION_TREE[key]


@router.post("/analyze")
def analyze_decision(request: DecisionRequest):
    """
    根据分数+省份，分析用户大致层级
    P0阶段用规则，后续接入历年分数线RAG
    """
    score_pct = request.score / request.full_mark

    if score_pct >= 0.85:
        tier = "A"
        tier_desc = "顶尖分段，可冲击985/211重点大学"
        suggest_ratio = {"冲": "40%", "稳": "40%", "保": "20%"}
    elif score_pct >= 0.70:
        tier = "B"
        tier_desc = "中上分段，可冲击211，稳妥一本"
        suggest_ratio = {"冲": "30%", "稳": "40%", "保": "30%"}
    elif score_pct >= 0.50:
        tier = "C"
        tier_desc = "中等分段，稳妥一本，冲刺好二本"
        suggest_ratio = {"冲": "20%", "稳": "40%", "保": "40%"}
    else:
        tier = "D"
        tier_desc = "需关注二本及专科方向，优先专业实用性"
        suggest_ratio = {"冲": "10%", "稳": "30%", "保": "60%"}

    return {
        "score": request.score,
        "full_mark": request.full_mark,
        "percentage": round(score_pct * 100, 1),
        "tier": tier,
        "tier_desc": tier_desc,
        "suggest_ratio": suggest_ratio,
    }


@router.post("/answer")
def submit_decision_answer(request: DecisionAnswerRequest):
    """
    提交三步决策树答案 → 返回用户画像 + 候选池

    对齐 docs/api.md 第3.3节
    """
    from ..services.decision_tree import DecisionTreeEngine
    from ..services.graph_service import KnowledgeGraph

    answers = request.answers
    step1 = answers.get("step1", "B")
    step2 = answers.get("step2", "D")
    step3 = answers.get("step3", "D")

    # 决策树分析
    profile = DecisionTreeEngine.analyze(
        score=request.score, full_mark=request.full_mark,
        province=request.province,
        step1=step1, step2=step2, step3=step3,
    )

    # 候选池：从知识图谱中筛选
    graph = KnowledgeGraph.build_default()
    exclude_categories = profile.get("exclude_categories", [])
    all_profs = graph.get_all_professions()

    candidate_majors = []
    candidate_schools = set()
    for pf in all_profs:
        if DecisionTreeEngine.is_excluded(pf.name, pf.category, pf.discipline, exclude_categories):
            continue
        candidate_majors.append(pf.code)
        for s in graph.get_schools_for_profession(pf.code):
            candidate_schools.add(s)

    # 过滤条件列表
    filters = []
    tier_labels = {
        "A": "顶尖分段，可冲击985/211",
        "B": "中上分段，可冲击211，稳妥一本",
        "C": "中等分段，稳妥一本，冲刺好二本",
        "D": "需关注二本及专科方向",
    }
    filters.append(f"分数段: {tier_labels.get(step1, '未知')}")
    filters.append(f"优先级: {profile.get('priority_label', '')}")
    filters.append(f"排除: {profile.get('exclusion_label', '')}")

    return {
        "profile": {
            "score": request.score,
            "full_mark": request.full_mark,
            "province": request.province,
            "exam_type": request.exam_type,
            "score_tier": profile["auto_tier"],
            "user_tier": step1,
            "priority": profile["priority_label"],
            "exclusion": profile["exclusion_label"],
        },
        "candidate_pool": {
            "majors": candidate_majors,
            "schools": sorted(candidate_schools),
            "filters": filters,
        },
    }
