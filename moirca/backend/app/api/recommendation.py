"""
推荐 API — 真实 Agent 1-5 调研 + Agent 6 融合

响应格式严格对齐 docs/api.md 第4节定义。
每条推荐包含: rank / tier / school / major / match_score / reason / evidence[] / confidence / risk_note

端点:
  POST /              同步推荐（等待完成）
  POST /async         异步推荐（立即返回 job_id）
  GET  /status/{id}   查询异步任务状态
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import threading
import uuid
import time

from ..agents.agent6_fusion_alchemist import (
    FusionAlchemist, UserConfig, AgentOutput,
)
from ..agents.base import AgentContext
from ..agents import (
    Agent1OfficialHunter, Agent2WordOfMouth, Agent3FreshnessDog,
    Agent4ConflictDetective, Agent5TrendProphet,
)
from ..services.graph_service import KnowledgeGraph
from ..services.decision_tree import DecisionTreeEngine
from ..services.scoreline_service import scoreline_service
from ..utils.logger import get_logger

router = APIRouter()
logger = get_logger('moirca.api.recommend')

_knowledge_graph: Optional[KnowledgeGraph] = None
_kkdaxue_cache: Optional[dict] = None


def refresh_recommendation_sources() -> dict:
    """清空推荐相关缓存，强制下次重新加载公开数据与图谱。"""
    global _knowledge_graph, _kkdaxue_cache
    _knowledge_graph = None
    _kkdaxue_cache = None
    scoreline_service.reload()
    return {"refreshed": True}


def get_graph() -> KnowledgeGraph:
    global _knowledge_graph
    if _knowledge_graph is None:
        _knowledge_graph = KnowledgeGraph.build_default()
    return _knowledge_graph


def _load_kkdaxue() -> dict:
    """加载框框大学数据，按专业名索引"""
    global _kkdaxue_cache
    if _kkdaxue_cache is not None:
        return _kkdaxue_cache
    try:
        from ..models.database import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT major, content FROM kkdaxue_posts LIMIT 2000")
        rows = cursor.fetchall()
        conn.close()
        data = {}
        for major, content in rows:
            if major:
                data.setdefault(major, []).append(content)
        _kkdaxue_cache = data
        if data:
            logger.info(f"kkdaxue 加载: {sum(len(v) for v in data.values())} 条, "
                         f"{len(data)} 个专业")
        return data
    except Exception as e:
        logger.warning(f"kkdaxue 加载失败: {e}")
        _kkdaxue_cache = {}
        return {}


# ============================================
# 请求/响应模型（对齐 api.md）
# ============================================

class RecommendRequest(BaseModel):
    score: float
    province: str = "广东"
    exam_type: str = "general"
    step1: str = "B"
    step2: str = "D"
    step3: str = "D"
    keywords: List[str] = []
    family_bg: str = ""
    economic_tier: str = "middle"
    top_n: int = 10


class EvidenceItem(BaseModel):
    type: str
    label: str
    value: str
    source: str = ""


class RecommendItem(BaseModel):
    rank: int
    tier: str
    school: str = ""
    major: str
    major_code: str = ""
    match_score: float
    reason: str
    risk_note: Optional[str] = None
    evidence: List[EvidenceItem] = []
    confidence: float = 0.5


class RecommendResponse(BaseModel):
    profile: dict
    recommendations: List[RecommendItem]
    tier_summary: dict
    warnings: List[str]
    meta: dict


# ============================================
# Agent 调研管线
# ============================================

def _get_llm_client():
    """尝试创建 LLM 客户端，失败返回 None（降级为规则引擎）"""
    try:
        from ..utils.llm_client import LLMClient
        from ..config import Config
        key = (Config.LLM_API_KEY or "").lower()
        if any(p in key for p in ["test", "placeholder", "your-api", "your_key"]):
            return None
        return LLMClient()
    except Exception:
        return None


def _run_agent_research(
    candidates: list, user_config: UserConfig, kkdaxue: dict, graph
) -> tuple[dict, dict, bool]:
    """
    Agent 1-5 并行调研（有 LLM 用 LLM，无 LLM 用规则引擎）

    返回 all_agent_outputs, prof_features, used_llm
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    llm = _get_llm_client()

    agents = [
        Agent1OfficialHunter(llm),
        Agent2WordOfMouth(llm),
        Agent3FreshnessDog(llm),
        Agent4ConflictDetective(llm),
        Agent5TrendProphet(llm),
    ]

    all_outputs: dict[str, list[AgentOutput]] = {}
    prof_features = {}

    for pf in candidates:
        prof_features[pf.code] = pf
        all_outputs[pf.code] = []

        major_posts = kkdaxue.get(pf.name, [])
        if not major_posts:
            for k, v in kkdaxue.items():
                if pf.name in k or k in pf.name:
                    major_posts = v
                    break

        ctx = AgentContext(
            profession=pf, user_config=user_config,
            kkdaxue_posts=major_posts, knowledge_graph=graph,
        )

        # 并行执行 5 个 Agent（LLM 调用是 I/O 密集）
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(agent.research, ctx): agent for agent in agents}
            for future in as_completed(futures):
                try:
                    output = future.result(timeout=30)
                    all_outputs[pf.code].append(output)
                except Exception:
                    agent = futures[future]
                    # 单个 Agent 失败不影响整体，用降级输出
                    fallback = agent._research_fallback(ctx)
                    all_outputs[pf.code].append(fallback)

    return all_outputs, prof_features, bool(llm)


# ============================================
# 工具函数
# ============================================

def _build_evidence(r, graph, public_scoreline: Optional[dict] = None) -> List[EvidenceItem]:
    evidence = []

    evidence.append(EvidenceItem(
        type="agent", label="融合基础分",
        value=f"{r.base_score:.0f}/100",
        source="Agent 6 融合炼金术士",
    ))

    if r.narrative_match > 0.6:
        evidence.append(EvidenceItem(
            type="agent", label="个人偏好匹配",
            value=f"匹配度 {r.narrative_match:.0%}",
            source="叙事匹配引擎",
        ))

    if r.zhangxuefeng_adjustment != 1.0:
        direction = "加成" if r.zhangxuefeng_adjustment > 1.0 else "修正"
        evidence.append(EvidenceItem(
            type="wisdom", label=f"张雪峰框架{direction}",
            value=f"修正系数 {r.zhangxuefeng_adjustment:.2f}",
            source="wisdom_corpus / 张雪峰决策框架",
        ))

    top_agents = sorted(
        r.breakdown.items(),
        key=lambda x: x[1].get("contribution", 0), reverse=True
    )[:2]
    for agent_name, detail in top_agents:
        notes = detail.get("notes", "")
        evidence.append(EvidenceItem(
            type="agent", label=f"{agent_name}评分",
            value=f"{detail['raw_score']:.0f}分 (权重{detail['effective_weight']:.2f})",
            source=notes[:80] if notes else agent_name,
        ))

    schools = graph.get_schools_for_profession(r.profession_code)
    if schools:
        evidence.append(EvidenceItem(
            type="public_data", label="开设院校",
            value=", ".join(schools[:3]),
            source="教育部专业目录",
        ))

    careers = graph.get_careers_for_profession(r.profession_code)
    if careers:
        evidence.append(EvidenceItem(
            type="public_data", label="就业方向",
            value=", ".join(careers[:2]),
            source="就业市场分析",
        ))

    if public_scoreline:
        matched_school = public_scoreline.get("school") or ""
        score_text = f"{matched_school + ' ' if matched_school else ''}{public_scoreline.get('year')} 年最低分 {public_scoreline.get('lowest_score')} / 位次 {public_scoreline.get('lowest_rank') or '—'}"
        label = "公开分数线(专业级)" if public_scoreline.get("match_level") == "major" else "公开分数线"
        evidence.append(EvidenceItem(
            type="public_data", label=label,
            value=score_text,
            source=f"{public_scoreline.get('province')}省公开分数线",
        ))

    if r.conflict_severity and r.conflict_severity in ("high", "critical"):
        evidence.append(EvidenceItem(
            type="agent", label="数据冲突警告",
            value=f"Agent评分存在{r.conflict_severity}级别分歧",
            source="Agent 4 矛盾侦探",
        ))

    return evidence


def _infer_subject_type(exam_type: str) -> str:
    exam = (exam_type or "").lower()
    if "history" in exam or "文" in exam:
        return "历史类"
    return "物理类"


def _build_reason(r, features) -> str:
    prof = features.get(r.profession_code)
    category = prof.category if prof else ""
    parts = []
    if r.match_score >= 85:
        parts.append("强烈推荐")
    elif r.match_score >= 70:
        parts.append("重点考虑")
    elif r.match_score >= 55:
        parts.append("值得关注")
    else:
        parts.append("可作为备选")
    if r.narrative_match > 0.7:
        parts.append("与你的偏好高度匹配")
    elif r.narrative_match > 0.5:
        parts.append("与你的偏好基本匹配")
    if r.zhangxuefeng_adjustment > 1.1:
        parts.append("就业确定性较高")
    if category == "工学":
        parts.append("技术壁垒强，不可替代性高")
    return "，".join(parts)


def _classify_tier(score: float) -> str:
    if score >= 85:
        return "保"
    elif score >= 70:
        return "稳"
    return "冲"


# ============================================
# API
# ============================================

@router.post("/", response_model=RecommendResponse)
def get_recommendations(request: RecommendRequest):
    """
    核心推荐接口

    流程: 决策树 → 知识图谱候选 → Agent 1-5 真实调研 → Agent 6 融合 → 可解释输出
    """
    graph = get_graph()
    kkdaxue = _load_kkdaxue()

    # 1. 决策树分析
    profile = DecisionTreeEngine.analyze(
        score=request.score, full_mark=750.0, province=request.province,
        step1=request.step1, step2=request.step2, step3=request.step3,
    )

    # 2. 用户配置
    user_config = UserConfig(
        confirmed_keywords=request.keywords,
        keyword_weights={kw: 1.0 for kw in request.keywords},
        province=request.province,
        score_tier=request.step1,
        priority=profile["priority"],
        exclude_categories=profile["exclude_categories"],
        family_bg=request.family_bg,
        economic_tier=request.economic_tier,
    )

    # 3. 候选专业（排除不想要的学科门类/专业名）
    candidates = [
        pf for pf in graph.get_all_professions()
        if not DecisionTreeEngine.is_excluded(
            pf.name, pf.category, pf.discipline, profile["exclude_categories"]
        )
    ]

    subject_type = _infer_subject_type(request.exam_type)

    # 4. Agent 1-5 调研（有 LLM 用 LLM 并行，无 LLM 用规则引擎）
    all_agent_outputs, prof_features, used_llm = _run_agent_research(
        candidates, user_config, kkdaxue, graph,
    )

    # 5. Agent 6 融合
    alchemist = FusionAlchemist(user_config=user_config)
    fusion_results = alchemist.fuse(all_agent_outputs, prof_features)
    fusion_results = fusion_results[:request.top_n]

    # 6. 构建推荐列表
    recommendations = []
    for r in fusion_results:
        pf = prof_features.get(r.profession_code)
        schools = graph.get_schools_for_profession(r.profession_code)
        scoreline_hint = scoreline_service.score_bonus(
            score=request.score,
            province=request.province,
            subject_type=subject_type,
            school=schools[0] if schools else None,
            major=pf.name if pf else r.profession_name,
        )
        public_bonus = scoreline_hint.get("bonus", 0.0)
        final_match_score = max(0.0, min(100.0, r.match_score + float(public_bonus)))
        tier = _classify_tier(final_match_score)

        risk = None
        if r.conflict_severity and r.conflict_severity in ("high", "critical"):
            risk = f"Agent评分存在{r.conflict_severity}级别分歧，建议交叉验证官方数据后再决定"
        if r.confidence_calibration < 0.5:
            risk = (risk or "") + " 数据置信度较低，该推荐仅供参考，最终请以官方信息为准"
        if scoreline_hint.get("matched"):
            risk = (risk or "") + f" 公开分数线已校准（+{public_bonus:.1f}）"

        recommendations.append(RecommendItem(
            rank=r.rank, tier=tier,
            school=schools[0] if schools else "",
            major=pf.name if pf else r.profession_name,
            major_code=r.profession_code,
            match_score=round(final_match_score, 2),
            reason=_build_reason(r, prof_features) + ("，结合公开分数线校准" if scoreline_hint.get("matched") else ""),
            risk_note=risk.strip() if risk else None,
            evidence=_build_evidence(r, graph, scoreline_hint.get("best")),
            confidence=round(r.confidence_calibration, 2),
        ))

    # 7. 冲稳保汇总
    rush = [r for r in recommendations if r.tier == "冲"]
    steady = [r for r in recommendations if r.tier == "稳"]
    safe = [r for r in recommendations if r.tier == "保"]
    tier_summary = {
        "冲": {"count": len(rush), "schools": [r.school for r in rush if r.school][:5]},
        "稳": {"count": len(steady), "schools": [r.school for r in steady if r.school][:5]},
        "保": {"count": len(safe), "schools": [r.school for r in safe if r.school][:5]},
    }

    # 8. 警告
    warnings = [
        "推荐结果仅供参考，最终请以各省教育考试院官方信息为准",
        "分数线数据可能存在滞后，建议到目标院校本科招生网核实最新招生计划",
    ]
    if any(r.confidence_calibration < 0.5 for r in fusion_results):
        warnings.append("部分推荐置信度较低，已在对应条目中标注")
    if request.keywords:
        warnings.append(
            f"当前基于关键词'{', '.join(request.keywords[:3])}'进行偏好匹配，你可随时调整"
        )

    # 9. 元信息
    agent_count = len(candidates) * 5
    meta = {
        "rule_version": "v0.3",
        "data_version": "2026-05-29",
        "model": "real-agent-llm" if used_llm else "real-agent-fallback",
        "candidate_count": len(candidates),
        "excluded_count": len(graph.get_all_professions()) - len(candidates),
        "agent_research_count": agent_count,
        "kkdaxue_posts_available": sum(len(v) for v in kkdaxue.values()),
    }

    return RecommendResponse(
        profile={
            "score": profile["score"], "full_mark": profile["full_mark"],
            "province": request.province, "percentage": profile["score_percentage"],
            "auto_tier": profile["auto_tier"], "user_tier": request.step1,
            "priority": profile["priority_label"], "exclusion": profile["exclusion_label"],
        },
        recommendations=recommendations,
        tier_summary=tier_summary,
        warnings=warnings,
        meta=meta,
    )


# ============================================
# 异步推荐
# ============================================

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _jobs_dir() -> str:
    base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recommendations")
    os.makedirs(base, exist_ok=True)
    return base


def _job_path(job_id: str) -> str:
    return os.path.join(_jobs_dir(), f"{job_id}.json")


def _persist_job(job_id: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        snapshot = dict(job)
    snapshot["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(_job_path(job_id), "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)


def _load_job(job_id: str) -> Optional[dict]:
    path = _job_path(job_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _list_jobs() -> list[dict]:
    items = []
    for name in os.listdir(_jobs_dir()):
        if not name.endswith(".json"):
            continue
        path = os.path.join(_jobs_dir(), name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            items.append(data)
        except Exception:
            continue
    items.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return items


class AsyncJobStatus(BaseModel):
    job_id: str
    status: str       # "running" | "completed" | "failed"
    progress: int     # 0-100
    message: str
    result: Optional[dict] = None


def _run_recommend_job(job_id: str, request: RecommendRequest):
    """后台线程执行推荐管线"""
    try:
        with _jobs_lock:
            _jobs[job_id]["progress"] = 10
            _jobs[job_id]["message"] = "加载数据..."
        _persist_job(job_id)

        graph = get_graph()
        kkdaxue = _load_kkdaxue()

        with _jobs_lock:
            _jobs[job_id]["progress"] = 20
            _jobs[job_id]["message"] = "分析用户画像..."
        _persist_job(job_id)

        profile = DecisionTreeEngine.analyze(
            score=request.score, full_mark=750.0, province=request.province,
            step1=request.step1, step2=request.step2, step3=request.step3,
        )

        user_config = UserConfig(
            confirmed_keywords=request.keywords,
            keyword_weights={kw: 1.0 for kw in request.keywords},
            province=request.province,
            score_tier=request.step1, priority=profile["priority"],
            exclude_categories=profile["exclude_categories"],
            family_bg=request.family_bg, economic_tier=request.economic_tier,
        )

        candidates = [
            pf for pf in graph.get_all_professions()
            if not DecisionTreeEngine.is_excluded(
                pf.name, pf.category, pf.discipline, profile["exclude_categories"]
            )
        ]

        subject_type = _infer_subject_type(request.exam_type)

        with _jobs_lock:
            _jobs[job_id]["progress"] = 30
            _jobs[job_id]["message"] = f"Agent 1-5 并行调研 {len(candidates)} 个专业..."
        _persist_job(job_id)

        all_agent_outputs, prof_features, used_llm = _run_agent_research(
            candidates, user_config, kkdaxue, graph,
        )

        with _jobs_lock:
            _jobs[job_id]["progress"] = 80
            _jobs[job_id]["message"] = "Agent 6 融合计算..."
        _persist_job(job_id)

        alchemist = FusionAlchemist(user_config=user_config)
        fusion_results = alchemist.fuse(all_agent_outputs, prof_features)
        fusion_results = fusion_results[:request.top_n]

        with _jobs_lock:
            _jobs[job_id]["progress"] = 95
            _jobs[job_id]["message"] = "构建推荐列表..."
        _persist_job(job_id)

        recommendations = []
        for r in fusion_results:
            pf = prof_features.get(r.profession_code)
            schools = graph.get_schools_for_profession(r.profession_code)
            scoreline_hint = scoreline_service.score_bonus(
                score=request.score,
                province=request.province,
                subject_type=subject_type,
                school=schools[0] if schools else None,
                major=pf.name if pf else r.profession_name,
            )
            public_bonus = scoreline_hint.get("bonus", 0.0)
            final_match_score = max(0.0, min(100.0, r.match_score + float(public_bonus)))
            tier = _classify_tier(final_match_score)
            risk = None
            if r.conflict_severity and r.conflict_severity in ("high", "critical"):
                risk = f"Agent评分存在{r.conflict_severity}级别分歧，建议交叉验证官方数据后再决定"
            if r.confidence_calibration < 0.5:
                risk = (risk or "") + " 数据置信度较低，该推荐仅供参考"
            if scoreline_hint.get("matched"):
                risk = (risk or "") + f" 公开分数线已校准（+{public_bonus:.1f}）"
            recommendations.append({
                "rank": r.rank, "tier": tier,
                "school": schools[0] if schools else "",
                "major": pf.name if pf else r.profession_name,
                "major_code": r.profession_code,
                "match_score": round(final_match_score, 2),
                "reason": _build_reason(r, prof_features) + ("，结合公开分数线校准" if scoreline_hint.get("matched") else ""),
                "risk_note": risk.strip() if risk else None,
                "evidence": [e.model_dump() for e in _build_evidence(r, graph, scoreline_hint.get("best"))],
                "confidence": round(r.confidence_calibration, 2),
            })

        rush = [r for r in recommendations if r["tier"] == "冲"]
        steady = [r for r in recommendations if r["tier"] == "稳"]
        safe = [r for r in recommendations if r["tier"] == "保"]

        with _jobs_lock:
            _jobs[job_id]["status"] = "completed"
            _jobs[job_id]["progress"] = 100
            _jobs[job_id]["message"] = "完成"
            _jobs[job_id]["result"] = {
                "profile": {
                    "score": profile["score"], "full_mark": profile["full_mark"],
                    "province": request.province, "percentage": profile["score_percentage"],
                    "auto_tier": profile["auto_tier"], "user_tier": request.step1,
                    "priority": profile["priority_label"], "exclusion": profile["exclusion_label"],
                },
                "recommendations": recommendations,
                "tier_summary": {
                    "冲": {"count": len(rush), "schools": [r["school"] for r in rush if r["school"]][:5]},
                    "稳": {"count": len(steady), "schools": [r["school"] for r in steady if r["school"]][:5]},
                    "保": {"count": len(safe), "schools": [r["school"] for r in safe if r["school"]][:5]},
                },
                "warnings": [
                    "推荐结果仅供参考，最终请以各省教育考试院官方信息为准",
                    "分数线数据可能存在滞后，建议到目标院校本科招生网核实最新招生计划",
                ],
                "meta": {
                    "rule_version": "v0.3", "data_version": "2026-05-29",
                    "model": "real-agent-llm" if used_llm else "real-agent-fallback",
                    "candidate_count": len(candidates),
                    "agent_research_count": len(candidates) * 5,
                    "kkdaxue_posts_available": sum(len(v) for v in kkdaxue.values()),
                },
            }
        _persist_job(job_id)
    except Exception as e:
        logger.error(f"异步推荐失败: {e}")
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["message"] = str(e)
        _persist_job(job_id)


@router.post("/async")
def recommend_async(request: RecommendRequest):
    """异步推荐 — 立即返回 job_id，后台执行"""
    job_id = uuid.uuid4().hex[:12]
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id, "status": "running",
            "progress": 0, "message": "排队中...", "result": None,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    _persist_job(job_id)
    thread = threading.Thread(target=_run_recommend_job, args=(job_id, request), daemon=True)
    thread.start()
    return {"job_id": job_id, "status": "running"}


@router.get("/status/{job_id}")
def recommend_status(job_id: str):
    """查询异步推荐状态"""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        job = _load_job(job_id)
    if not job:
        return {"job_id": job_id, "status": "not_found", "progress": 0, "message": "任务不存在", "result": None}
    return job


@router.get("/history")
def recommend_history(limit: int = 20):
    items = _list_jobs()[: max(1, min(limit, 100))]
    return {"items": items, "count": len(items)}


@router.get("/graph/stats")
def get_graph_stats():
    return get_graph().get_stats()


@router.post("/refresh")
def refresh_recommendation_data():
    return refresh_recommendation_sources()
