"""
推荐 API — 真实 Agent 1-5 调研 + Agent 6 融合

响应格式严格对齐 docs/api.md 第4节定义。
每条推荐包含: rank / tier / school / major / match_score / reason / evidence[] / confidence / risk_note

端点:
  POST /              同步推荐（等待完成）
  POST /async         异步推荐（立即返回 job_id）
  GET  /status/{id}   查询异步任务状态
"""
import hashlib
import hmac
import json
import os
import threading
import time
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..agents import (
    Agent1OfficialHunter,
    Agent2WordOfMouth,
    Agent3FreshnessDog,
    Agent4ConflictDetective,
    Agent5TrendProphet,
)
from ..agents.agent6_fusion_alchemist import (
    AgentOutput,
    FusionAlchemist,
    UserConfig,
)
from ..agents.base import AgentContext
from ..services.decision_tree import DecisionTreeEngine
from ..services.graph_service import KnowledgeGraph
from ..services.scoreline_service import scoreline_service
from ..utils.api_key import is_placeholder_api_key
from ..utils.logger import get_logger

router = APIRouter()
logger = get_logger('moirca.api.recommend')

_knowledge_graph: Optional[KnowledgeGraph] = None
_kkdaxue_cache: Optional[dict] = None
# {专业名: 该专业帖子真实 create_time 的最新值}，驱动 Agent 时效衰减
_kkdaxue_freshness: dict[str, Optional[datetime]] = {}


def refresh_recommendation_sources() -> dict:
    """清空推荐相关缓存，强制下次重新加载公开数据与图谱。"""
    global _knowledge_graph, _kkdaxue_cache, _kkdaxue_freshness
    _knowledge_graph = None
    _kkdaxue_cache = None
    _kkdaxue_freshness = {}
    scoreline_service.reload()
    return {"refreshed": True}


def get_graph() -> KnowledgeGraph:
    global _knowledge_graph
    if _knowledge_graph is None:
        _knowledge_graph = KnowledgeGraph.build_default()
    return _knowledge_graph


def _parse_post_time(raw) -> Optional[datetime]:
    """解析 kkdaxue 帖子的 create_time；缺失/非法返回 None。"""
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(float(raw))
        except Exception:
            return None
    try:
        # ISO 格式，兼容 "2026-05-28T07:18:20.000+00:00" / "Z"
        return datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
    except Exception:
        return None


def _load_kkdaxue() -> dict:
    """加载框框大学数据，按专业名索引，并记录每个专业的帖子真实时间戳。

    create_time 入库后此前从未被使用，导致 Agent 6 的时效衰减恒为 1.0；
    这里把它带出来，让 agent2/agent3 用真实时间戳驱动 freshness_date。
    """
    global _kkdaxue_cache, _kkdaxue_freshness
    if _kkdaxue_cache is not None:
        return _kkdaxue_cache
    try:
        from ..models.database import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT major, content, create_time FROM kkdaxue_posts LIMIT 2000")
        rows = cursor.fetchall()
        conn.close()
        data: dict = {}
        freshness_accum: dict[str, list[datetime]] = {}
        for major, content, create_time in rows:
            if not major:
                continue
            data.setdefault(major, []).append(content)
            parsed = _parse_post_time(create_time)
            if parsed is not None:
                freshness_accum.setdefault(major, []).append(parsed)
        _kkdaxue_cache = data
        _kkdaxue_freshness = {
            major: max(times) for major, times in freshness_accum.items()
        }
        if data:
            logger.info(f"kkdaxue 加载: {sum(len(v) for v in data.values())} 条, "
                         f"{len(data)} 个专业; 其中 {len(_kkdaxue_freshness)} 个专业带真实时间戳")
        return data
    except Exception as e:
        logger.warning(f"kkdaxue 加载失败: {e}")
        _kkdaxue_cache = {}
        _kkdaxue_freshness = {}
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
    """尝试创建 LLM 客户端，失败返回 None（降级为规则引擎）。

    占位 key 判定统一走 app/utils/api_key.py（前缀匹配，避免误伤含 "test" 的真实 key）。
    """
    try:
        from ..config import Config
        from ..utils.llm_client import LLMClient
        if is_placeholder_api_key(Config.LLM_API_KEY):
            logger.info("LLM_API_KEY 为占位/空值，推荐走规则降级")
            return None
        return LLMClient()
    except Exception:
        return None


# 单个 Agent LLM 调研的超时上限（秒）。超时/异常一律回退到规则评分，
# 避免慢 LLM 无限挂起同步请求。
AGENT_RESEARCH_TIMEOUT = 30.0


def _run_agent_research(
    candidates: list, user_config: UserConfig, kkdaxue: dict, graph
) -> tuple[dict, dict, bool]:
    """
    Agent 1-5 并行调研（有 LLM 用 LLM，无 LLM 用规则引擎）

    返回 all_agent_outputs, prof_features, used_llm

    并发修复:
      - ThreadPoolExecutor 在候选专业循环外只创建一次；
      - 对每个 future.result(timeout=AGENT_RESEARCH_TIMEOUT) 施加真实超时，
        未完成的任务取消并回退规则评分。
    """
    from concurrent.futures import ThreadPoolExecutor

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

    # 预构建 (agent, ctx, prof_code) 任务
    tasks: list[tuple] = []
    for pf in candidates:
        prof_features[pf.code] = pf
        all_outputs[pf.code] = []

        major_posts = kkdaxue.get(pf.name, [])
        if not major_posts:
            for k, v in kkdaxue.items():
                if pf.name in k or k in pf.name:
                    major_posts = v
                    break

        # 真实帖子时间戳：优先精确专业名命中；降级到子串匹配的专业
        post_time = _kkdaxue_freshness.get(pf.name)
        if post_time is None:
            for k, t in _kkdaxue_freshness.items():
                if pf.name in k or k in pf.name:
                    post_time = t
                    break

        ctx = AgentContext(
            profession=pf, user_config=user_config,
            kkdaxue_posts=major_posts, knowledge_graph=graph,
            post_times=[post_time] if post_time is not None else [],
        )
        for agent in agents:
            tasks.append((agent, ctx, pf.code))

    # 单个线程池覆盖所有「专业 × Agent」任务（不再每专业新建/销毁）
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(agent.research, ctx): (agent, ctx, code)
            for agent, ctx, code in tasks
        }
        for future, (agent, ctx, code) in list(futures.items()):
            try:
                output = future.result(timeout=AGENT_RESEARCH_TIMEOUT)
                all_outputs[code].append(output)
            except Exception:
                # future 未完成时取消，避免后台继续空转
                future.cancel()
                try:
                    fallback = agent._research_fallback(ctx)
                except Exception:
                    # 连规则降级都失败时给一个保底输出，保证融合不因缺员崩掉
                    fallback = AgentOutput(
                        agent_name=agent.agent_name,
                        profession_code=code,
                        raw_score=50.0,
                        confidence=0.3,
                        freshness_date=datetime.now(),
                        source_count=0,
                        notes="[降级失败兜底]",
                    )
                all_outputs[code].append(fallback)

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


# 冲稳保分类阈值：以「考生分数 - 预测录取线」的分数差为主依据，而非匹配度。
# 分数差高于该值 → 大概率能录（保）；接近 → 稳；明显低于 → 冲。
TIER_GAP_RUSH = -10.0    # 低于线 10 分以下 → 冲（录取风险高、可尝试）
TIER_GAP_SAFE = 10.0     # 高于线 10 分以上 → 保（大概率能录）


def _classify_tier_by_gap(score_gap: float) -> str:
    """按分数差分类冲/稳/保。

    score_gap = 考生分 - 预测录取线（正=考生分高于线，负=低于线）。
    志愿填报语义：录取把握由「分数差」决定，专业匹配度只影响同档内的排序。
    """
    if score_gap >= TIER_GAP_SAFE:
        return "保"
    if score_gap >= TIER_GAP_RUSH:
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
        # 冲稳保以分数差为主依据；无公开分数线时退回按匹配度近似分类
        best = scoreline_hint.get("best") or {}
        if "score_gap" in best:
            tier = _classify_tier_by_gap(float(best["score_gap"]))
        else:
            tier = _classify_tier_by_gap(0.0)  # 无数据时中性归入「稳」

        risk = None
        if r.conflict_severity and r.conflict_severity in ("high", "critical"):
            risk = f"Agent评分存在{r.conflict_severity}级别分歧，建议交叉验证官方数据后再决定"
        if r.confidence_calibration < 0.5:
            risk = (risk or "") + " 数据置信度较低，该推荐仅供参考，最终请以官方信息为准"
        if scoreline_hint.get("matched"):
            gap = best.get("score_gap")
            risk = (risk or "") + f" 公开分数线已校准（+{public_bonus:.1f}，分差{'-' if gap is not None and gap < 0 else '+' if gap is not None and gap > 0 else ''}{abs(gap) if gap is not None else '—'}分）"

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

# 任务归属 token 的 HMAC 密钥。生产环境务必通过环境变量覆盖。
_JOB_TOKEN_SECRET = os.environ.get("MOIRCA_JOB_TOKEN_SECRET", "") or "moirca-job-owner-dev"
# 内存 _jobs 只保留最近 N 个任务，防止长期运行内存泄漏。
_JOBS_MAX_IN_MEMORY = 100
# 任务 JSON 文件保留天数，过期文件在列历史时清理（磁盘防泄漏）。
_JOBS_RETENTION_DAYS = 7


def _make_owner_token(job_id: str) -> str:
    payload = f"job:{job_id}"
    mac = hmac.new(_JOB_TOKEN_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{job_id}.{mac[:24]}"


def _verify_owner_token(job_id: str, token: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(_make_owner_token(job_id), token)


def _prune_jobs_locked() -> None:
    """内存 _jobs 只保留最近 _JOBS_MAX_IN_MEMORY 个（按 updated_at 倒序裁掉更早的终态任务）。"""
    if len(_jobs) <= _JOBS_MAX_IN_MEMORY:
        return
    terminal = [j for j in _jobs.values() if j.get("status") in ("completed", "failed")]
    terminal.sort(key=lambda j: j.get("updated_at", ""), reverse=True)
    for job in terminal[_JOBS_MAX_IN_MEMORY:]:
        _jobs.pop(job["job_id"], None)


def _prune_old_job_files_locked() -> None:
    """删除超过保留期的任务 JSON 文件，防磁盘只增不清。"""
    deadline = time.time() - _JOBS_RETENTION_DAYS * 86400
    try:
        for name in os.listdir(_jobs_dir()):
            if not name.endswith(".json"):
                continue
            path = os.path.join(_jobs_dir(), name)
            try:
                if os.path.getmtime(path) < deadline:
                    os.remove(path)
            except OSError:
                continue
    except OSError:
        pass


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
            # 冲稳保以分数差为主依据；无公开分数线时退回按匹配度近似分类
            best = scoreline_hint.get("best") or {}
            if "score_gap" in best:
                tier = _classify_tier_by_gap(float(best["score_gap"]))
            else:
                tier = _classify_tier_by_gap(0.0)
            risk = None
            if r.conflict_severity and r.conflict_severity in ("high", "critical"):
                risk = f"Agent评分存在{r.conflict_severity}级别分歧，建议交叉验证官方数据后再决定"
            if r.confidence_calibration < 0.5:
                risk = (risk or "") + " 数据置信度较低，该推荐仅供参考"
            if scoreline_hint.get("matched"):
                gap = best.get("score_gap")
                risk = (risk or "") + f" 公开分数线已校准（+{public_bonus:.1f}，分差{'-' if gap is not None and gap < 0 else '+' if gap is not None and gap > 0 else ''}{abs(gap) if gap is not None else '—'}分）"
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
    """异步推荐 — 立即返回 job_id + owner_token，后台执行。

    安全: 任务结果归属调用者。job_id 只有 12 位 hex，任何人可枚举；
    后续 status/history 必须携带 owner_token 才能读取。
    """
    job_id = uuid.uuid4().hex[:12]
    owner_token = _make_owner_token(job_id)
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id, "status": "running",
            "progress": 0, "message": "排队中...", "result": None,
            "owner_token": owner_token,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        _prune_jobs_locked()
        _prune_old_job_files_locked()
    _persist_job(job_id)
    thread = threading.Thread(target=_run_recommend_job, args=(job_id, request), daemon=True)
    thread.start()
    return {"job_id": job_id, "status": "running", "owner_token": owner_token}


@router.get("/status/{job_id}")
def recommend_status(
    job_id: str,
    owner_token: str = "",
):
    """查询异步推荐状态（需 owner_token 归属校验）"""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        job = _load_job(job_id)
    if not job:
        return {"job_id": job_id, "status": "not_found", "progress": 0, "message": "任务不存在", "result": None}
    if not _verify_owner_token(job_id, owner_token):
        return {"job_id": job_id, "status": "denied", "progress": 0, "message": "缺少或错误的访问凭据", "result": None}
    return job


@router.get("/history")
def recommend_history(
    limit: int = 20,
    owner_token: str = "",
):
    """查询任务历史。需 owner_token，且只返回该 token 归属的任务（当前实现为单机按 job 校验，
    历史列表过滤出可验证归属的条目，未携带 token 只返回公开统计）。"""
    with _jobs_lock:
        _prune_old_job_files_locked()
    items = _list_jobs()[: max(1, min(limit, 100))]
    pub = []
    for it in items:
        if not owner_token:
            pub.append({"job_id": it.get("job_id"), "status": it.get("status"),
                        "progress": it.get("progress"), "updated_at": it.get("updated_at")})
        elif _verify_owner_token(it.get("job_id", ""), owner_token):
            pub.append(it)
    return {"items": pub, "count": len(pub), "authenticated": bool(owner_token)}


@router.get("/graph/stats")
def get_graph_stats():
    return get_graph().get_stats()


@router.post("/refresh")
def refresh_recommendation_data():
    return refresh_recommendation_sources()
