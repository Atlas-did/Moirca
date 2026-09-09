"""云端深研管线服务(AGENT_05):7-Agent 高考垂直管线 × DAG 调度器 × 证据链。

职责:
  - 把现有 agents/ 七角色 + task_scheduler.DAG 接成异步任务(通道③);
  - 证据来源只有两处:调用方传入的页面快照/URL 列表(落 evidence 库,
    channel=deep_research,§c.3)与 evidence 库中已有记录;不做浏览器控制;
  - 证据保存失败重试 2 次后降级为仅落盘 raw_ref(CONTRACT §g.2);
  - 每个节点失败不终止管线(记录+继续),仅报告节点失败判任务失败;
  - LLM 客户端注入 fake 时深研链路端到端 ≤30s;无 key 全链路规则降级可用。

场景保持高考垂直:Agent 角色与融合公式不改;场景参数经
app.agents.skill.SkillDefinition 注入(接口预留,高考为第一个实现)。
"""
from __future__ import annotations

import queue
import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

from ..agents import (
    Agent1OfficialHunter,
    Agent2WordOfMouth,
    Agent3FreshnessDog,
    Agent4ConflictDetective,
    Agent5TrendProphet,
    Agent7ReportWriter,
    AgentContext,
    FusionAlchemist,
    ProfessionFeatures,
    UserConfig,
)
from ..agents.skill import SkillDefinition, build_gaokao_skill, skill_context_digest
from ..config import Config
from ..models.evidence import (
    assess_source_quality,
    query_evidence,
    save_evidence,
)
from ..report.service import report_store
from ..services.session_manager import Session, SessionManager, UserProfile
from ..services.task_scheduler import PipelineDAG, TaskScheduler
from ..utils.logger import get_logger
from ..utils.untrusted import wrap_untrusted

logger = get_logger('moirca.deep_research')

# 节点权重(进度条口径,合计 1.0)
NODE_WEIGHTS: Dict[str, float] = {
    "Agent1_官方猎手": 0.12,
    "Agent2_口碑矿工": 0.12,
    "Agent3_时效警犬": 0.12,
    "Agent5_趋势先知": 0.12,
    "Agent4_矛盾侦探": 0.07,
    "Agent6_融合炼金术士": 0.15,
    "Agent7_报告生成器": 0.30,
}
NODE_AGENT_IDS: Dict[str, str] = {
    "Agent1_官方猎手": "agent1_official_hunter",
    "Agent2_口碑矿工": "agent2_word_of_mouth",
    "Agent3_时效警犬": "agent3_freshness_dog",
    "Agent4_矛盾侦探": "agent4_conflict_detective",
    "Agent5_趋势先知": "agent5_trend_prophet",
    "Agent6_融合炼金术士": "agent6_fusion_alchemist",
    "Agent7_报告生成器": "agent7_report_writer",
}
AGENT_INSTANCES: Dict[str, Tuple[str, Callable]] = {
    "Agent1_官方猎手": ("官方猎手", Agent1OfficialHunter),
    "Agent2_口碑矿工": ("口碑矿工", Agent2WordOfMouth),
    "Agent3_时效警犬": ("时效警犬", Agent3FreshnessDog),
    "Agent5_趋势先知": ("趋势先知", Agent5TrendProphet),
    "Agent4_矛盾侦探": ("矛盾侦探", Agent4ConflictDetective),
}

# 高考垂直专业词表(研究问题 → 候选专业;退化为单候选,保证降级路径可跑)
_MAJOR_LEXICON: List[Tuple[List[str], ProfessionFeatures]] = [
    (["计算机"], ProfessionFeatures(code="080901", name="计算机科学与技术", category="工学",
                                    keywords=["编程", "算法", "就业面广"])),
    (["软件"], ProfessionFeatures(code="080902", name="软件工程", category="工学",
                                  keywords=["工程实践", "就业面广"])),
    (["人工智能", "AI"], ProfessionFeatures(code="080717", name="人工智能", category="工学",
                                           keywords=["新兴", "数学要求高"])),
    (["临床", "医学"], ProfessionFeatures(code="100201", name="临床医学", category="医学",
                                         keywords=["培养周期长", "稳定"])),
    (["电气"], ProfessionFeatures(code="080601", name="电气工程及其自动化", category="工学",
                                  keywords=["国家电网", "稳定"])),
    (["机械"], ProfessionFeatures(code="080201", name="机械工程", category="工学",
                                  keywords=["传统工科"])),
    (["金融"], ProfessionFeatures(code="020301", name="金融学", category="经济学",
                                  keywords=["家庭资源敏感"])),
    (["法学", "法律"], ProfessionFeatures(code="030101", name="法学", category="法学",
                                         keywords=["法考", "家庭资源敏感"])),
    (["师范", "教育"], ProfessionFeatures(code="040101", name="教育学", category="教育学",
                                         keywords=["编制", "稳定"])),
    (["会计"], ProfessionFeatures(code="120203", name="会计学", category="管理学",
                                  keywords=["考证", "稳定"])),
    (["数学"], ProfessionFeatures(code="070101", name="数学与应用数学", category="理学",
                                  keywords=["基础学科", "转码友好"])),
    (["汉语言", "中文"], ProfessionFeatures(code="050101", name="汉语言文学", category="文学",
                                           keywords=["考公友好"])),
]

EVIDENCE_SAVE_RETRIES = getattr(Config, "DEEP_RESEARCH_SAVE_RETRIES", 2)


@dataclass
class TaskRuntime:
    """任务运行时状态(DB 之外,进程内可见;SSE 事件源)。"""
    task_id: str
    query: str
    status: str = "queued"
    progress: float = 0.0
    agents_done: List[str] = field(default_factory=list)
    evidence_count: int = 0
    report_id: str = ""
    error: Optional[str] = None
    session_id: str = ""
    node_errors: Dict[str, str] = field(default_factory=dict)
    subscribers: List[queue.Queue] = field(default_factory=list)


class DeepResearchPipeline:
    """深研管线编排器。每个实例可注入自己的 SessionManager / LLM(测试用)。"""

    def __init__(self,
                 llm: Optional[Any] = None,
                 session_manager: Optional[SessionManager] = None,
                 scheduler_storage: Optional[str] = None,
                 max_workers: int = 5):
        self.llm = llm
        self.session_manager = session_manager or SessionManager()
        self.scheduler_storage = scheduler_storage
        self.max_workers = max_workers
        self._runtimes: Dict[str, TaskRuntime] = {}
        self._lock = threading.Lock()
        self.store = report_store

    # ------------------------------------------------------------------
    # 对外接口
    # ------------------------------------------------------------------

    def estimate(self, query: str,
                 gaokao_ctx: Optional[Dict[str, Any]] = None,
                 budget: Optional[Dict[str, Any]] = None) -> Dict[str, int]:
        """预计耗时 + 配额(深研前确认提示;skill effort 映射 ∩ 用户预算)。"""
        skill = build_gaokao_skill(query, gaokao_ctx)
        est = skill.estimate()
        budget = budget or {}
        minutes = min(est["minutes"], int(budget.get("max_minutes") or est["minutes"]))
        max_evidence = min(est["max_evidence"],
                           int(budget.get("max_evidence") or est["max_evidence"]))
        return {"minutes": minutes, "max_evidence": max_evidence}

    def submit(self, query: str,
               gaokao_ctx: Optional[Dict[str, Any]] = None,
               budget: Optional[Dict[str, Any]] = None,
               sources: Optional[List[Dict[str, Any]]] = None,
               profile: Optional[Dict[str, Any]] = None,
               effort: str = "medium") -> Tuple[str, Dict[str, int]]:
        """受理深研任务:先落证据(显式 save,channel=deep_research),再起 DAG 线程。

        sources: 传入的页面快照/URL 列表 [{url,title,quote,fetched_at?,source_quality?}]
        返回 (task_id, estimate)。
        """
        est = self.estimate(query, gaokao_ctx, budget)
        skill = build_gaokao_skill(query, gaokao_ctx, profile=profile, effort=effort)
        # evidence/report 表幂等建表(prod 由 init_db 挂载;直跑管线/测试时兜底)
        from ..models.evidence import init_evidence_table
        init_evidence_table()
        task = self.store.create_task(query, gaokao_ctx=gaokao_ctx, budget=est)
        task_id = task["task_id"]
        runtime = TaskRuntime(task_id=task_id, query=query)
        with self._lock:
            self._runtimes[task_id] = runtime

        # 证据链:传入来源显式落库(CONTRACT §c.3,深研管线采集 → AGENT_05 显式 save)
        saved = self._persist_sources(task_id, sources or [])
        runtime.evidence_count = saved
        self.store.mark_progress(task_id, 0.02, [], saved)

        # Session(断点续跑 JSON 仅作调度内部状态;结果落 SQLite 报告表)
        user_config, user_profile = self._build_user_profile(skill)
        session = self.session_manager.create(user_profile)
        runtime.session_id = session.session_id
        self.store.mark_running(task_id, session.session_id)
        runtime.status = "running"

        thread = threading.Thread(
            target=self._run, args=(task_id, session.session_id, skill, user_config),
            name=f"deep-research-{task_id}", daemon=True)
        thread.start()
        return task_id, est

    def get_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """CONTRACT §e.3 的状态轮询响应;优先取 DB(跨进程一致),未知任务 None。"""
        task = self.store.get_task(task_id)
        if task is None:
            return None
        return {
            "task_id": task["task_id"],
            "status": task["status"],
            "progress": task["progress"],
            "agents_done": task["agents_done"],
            "evidence_count": task["evidence_count"],
            "error": task["error"],
        }

    def subscribe(self, task_id: str) -> Optional[queue.Queue]:
        rt = self._runtimes.get(task_id)
        if rt is None:
            return None
        q: queue.Queue = queue.Queue()
        with self._lock:
            rt.subscribers.append(q)
        return q

    def stream_events(self, task_id: str, timeout_seconds: int = 120):
        """SSE 事件生成器:agent_progress / evidence_added / report_ready / task_failed。"""
        q = self.subscribe(task_id)
        if q is None:
            yield {"event": "task_failed", "data": {"task_id": task_id,
                                                    "error": "任务不存在或进程已重启"}}
            return
        yield {"event": "agent_progress",
               "data": {"task_id": task_id, **(self.get_status(task_id) or {})}}
        import time
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            try:
                event = q.get(timeout=1.0)
            except queue.Empty:
                status = self.get_status(task_id) or {}
                if status.get("status") in ("done", "failed"):
                    break
                continue
            yield event
            if event.get("event") in ("report_ready", "task_failed"):
                break

    # ------------------------------------------------------------------
    # 证据链
    # ------------------------------------------------------------------

    def _persist_sources(self, task_id: str,
                         sources: List[Dict[str, Any]]) -> int:
        """把传入来源显式落 evidence 库;失败重试 2 次后降级为仅落盘(§g.2)。"""
        saved = 0
        for src in sources[:100]:
            record = {
                "channel": "deep_research",
                "url": str(src.get("url") or ""),
                "title": str(src.get("title") or ""),
                "quote": str(src.get("quote") or ""),
                "fetched_at": src.get("fetched_at"),
                "source_quality": src.get("source_quality") or "unknown",
                "locator": src.get("locator") or {"type": "text_offset", "value": "pipeline"},
                "task_id": task_id,
            }
            record["source_quality"] = assess_source_quality(
                url=record["url"], title=record["title"],
                metadata={"declared": record["source_quality"]}
                if record["source_quality"] != "unknown" else None,
            )
            evidence_id = self._save_evidence_with_retry(record, task_id)
            if evidence_id:
                saved += 1
                self._emit(task_id, "evidence_added",
                           {"task_id": task_id, "evidence_id": evidence_id,
                            "url": record["url"],
                            "source_quality": record["source_quality"]})
        return saved

    def _save_evidence_with_retry(self, record: Dict[str, Any],
                                  task_id: str) -> Optional[str]:
        """保存证据(1+2 次重试);最终失败降级为仅落盘 raw_ref,不伪造 evidence_id。"""
        from ..models.evidence import (
            new_evidence_id,
            normalize_fetched_at,
            normalize_locator,
        )
        record.setdefault("evidence_id", new_evidence_id())
        record.setdefault("raw_ref", None)
        # locator 传 dict 时先规范化为 JSON 文本(仓储层按 TEXT 绑定,§c.1)
        record["locator"] = normalize_locator(record.get("locator"))
        record["fetched_at"] = normalize_fetched_at(record.get("fetched_at"))
        record.setdefault("created_at", normalize_fetched_at(None))
        last_exc: Optional[Exception] = None
        for attempt in range(1 + EVIDENCE_SAVE_RETRIES):
            try:
                row, _created = save_evidence(record)
                return row["evidence_id"]
            except Exception as exc:  # noqa: BLE001 —— sqlite3.Error 或校验异常都重试
                last_exc = exc
                logger.warning(f"证据保存第{attempt + 1}次失败(重试): {exc}")
        # 降级:仅落盘(artifacts/{task_id}/page-*.txt),任务继续,证据引用缺失
        fallback = self._dump_artifact(task_id, record.get("quote") or "")
        logger.error(
            f"证据保存最终失败,降级落盘 {fallback};最后错误: {last_exc}; "
            f"evidence_id={record.get('evidence_id')} 不入库不引用")
        return None

    def _dump_artifact(self, task_id: str, text: str) -> Optional[str]:
        try:
            import os
            root = getattr(Config, "EVIDENCE_ARTIFACTS_DIR", "")
            dir_path = os.path.join(root, task_id)
            os.makedirs(dir_path, exist_ok=True)
            name = f"page-{datetime.now().strftime('%Y%m%d-%H%M%S')}-001.txt"
            path = os.path.join(dir_path, name)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            return f"artifacts/{task_id}/{name}"
        except Exception:  # noqa: BLE001 —— 落盘也失败就只能放弃
            return None

    def _task_evidences(self, task_id: str) -> List[Dict[str, Any]]:
        rows, _total = query_evidence(task_id=task_id, limit=100)
        return rows

    # ------------------------------------------------------------------
    # 用户画像 / 候选专业
    # ------------------------------------------------------------------

    def _build_user_profile(self, skill: SkillDefinition) -> Tuple[UserConfig, UserProfile]:
        meta = skill.metadata or {}
        ctx = meta.get("gaokao_ctx") or {}
        score = ctx.get("score")
        cfg = UserConfig(
            province=ctx.get("province") or meta.get("province") or "广东",
            score_tier="B",  # 分数档位由决策树给出;深研直调时取中性档
            priority=meta.get("priority", "career_prospect"),
            family_bg=meta.get("family_bg", ""),
            economic_tier=meta.get("economic_tier", "middle"),
            confirmed_keywords=skill.all_terms()[:10],
        )
        profile = UserProfile(
            score=float(score) if score is not None else 0.0,
            province=cfg.province,
            score_tier=cfg.score_tier,
            priority=cfg.priority,
            keywords=skill.all_terms()[:10],
            family_bg=cfg.family_bg,
            economic_tier=cfg.economic_tier,
        )
        return cfg, profile

    @staticmethod
    def extract_professions(query: str) -> List[ProfessionFeatures]:
        """研究问题 → 候选专业(高考垂直词表;无命中退化为单候选)。"""
        matched: List[ProfessionFeatures] = []
        seen = set()
        for keywords, prof in _MAJOR_LEXICON:
            if any(kw.lower() in query.lower() for kw in keywords) and prof.code not in seen:
                seen.add(prof.code)
                matched.append(prof)
        if not matched:
            matched = [ProfessionFeatures(
                code="Q_GENERIC", name=(query or "通用研究")[:24], category="工学",
                keywords=["待定"])]
        return matched

    def _agent_context(self, prof: ProfessionFeatures,
                       evidences: List[Dict[str, Any]],
                       user_config: UserConfig) -> AgentContext:
        """证据 → Agent 上下文:官方/高信誉证据喂官方视角,社区证据喂口碑视角;
        fetched_at 全部作为真实时间戳传入(驱动 freshness,禁止 now() 造假)。

        注入防护(AGENT_07 审计):quote 是网页抓取的不可信外部文本,进入
        Agent1/2/4 的 LLM prompt 前统一按 context.py 标准「XML 定界 + 转义 +
        降权声明」包裹(app/utils/untrusted.py),防止网页内容劫持调研 Agent。
        """
        official_quotes: List[str] = []
        community_quotes: List[str] = []
        official_times: List[str] = []
        community_times: List[str] = []
        for ev in evidences:
            quality = ev.get("source_quality") or assess_source_quality(
                url=ev.get("url", ""), title=ev.get("title", ""))
            fetched = ev.get("fetched_at")
            if quality in ("official", "authoritative"):
                official_quotes.append(wrap_untrusted(
                    "evidence_quote", ev.get("quote") or "", max_chars=1500))
                official_times.append(fetched)
            else:
                community_quotes.append(wrap_untrusted(
                    "evidence_quote", ev.get("quote") or "", max_chars=1500))
                community_times.append(fetched)
        official_data = {
            "summary": [q for q in official_quotes if q][:8] or ["暂缺官方数据"],
            "data_times": [t for t in official_times if t],
        }
        fetched_list = [t for t in official_times if t]
        if fetched_list:
            official_data["fetched_at"] = max(fetched_list)
        return AgentContext(
            profession=prof,
            user_config=user_config,
            kkdaxue_posts=[q for q in community_quotes if q][:8],
            official_data=official_data,
            post_times=[t for t in community_times if t],
            evidence_records=evidences,
        )

    # ------------------------------------------------------------------
    # DAG 执行
    # ------------------------------------------------------------------

    def _run(self, task_id: str, session_id: str,
             skill: SkillDefinition, user_config: UserConfig) -> None:
        evidences = self._task_evidences(task_id)
        professions = self.extract_professions(skill.research_question)
        digest = skill_context_digest(skill)
        pipeline_ref = self

        def research_handler(node_name: str) -> Callable:
            def handler(session) -> Any:
                try:
                    agent_label, agent_cls = AGENT_INSTANCES[node_name]
                    agent = agent_cls(self.llm)
                    outputs = session.agent_outputs
                    for prof in professions:
                        ctx = pipeline_ref._agent_context(prof, evidences, user_config)
                        out = agent.research(ctx)
                        outputs.setdefault(prof.code, []).append(
                            Session.agent_output_to_dict(out))
                    return session
                except Exception as exc:  # noqa: BLE001 —— 单 Agent 失败不终止管线
                    pipeline_ref._record_node_error(task_id, node_name, exc)
                    return session
            return handler

        def fusion_handler(session) -> Any:
            try:
                alchemist = FusionAlchemist(user_config)
                fused = alchemist.fuse(
                    session.get_agent_outputs_for_fusion(),
                    {p.code: p for p in professions},
                )
                session.fusion_results = alchemist.to_dict(fused)
                session.report_metadata["tier_strategy"] = {
                    k: [r.profession_code for r in v]
                    for k, v in alchemist.tier_strategy(fused).items()}
            except Exception as exc:  # noqa: BLE001
                pipeline_ref._record_node_error(task_id, "Agent6_融合炼金术士", exc)
            return session

        def report_handler(session) -> Any:
            try:
                writer = Agent7ReportWriter(llm=self.llm)
                draft = writer.write_report(
                    query=skill.research_question,
                    fusion_results=session.fusion_results,
                    evidences=self._task_evidences(task_id),
                    user_config=user_config,
                    gaokao_ctx=skill.metadata.get("gaokao_ctx"),
                    skill_name=skill.name,
                )
                claims = [{"text": c.text, "evidence_ids": c.evidence_ids,
                           "supported": c.supported} for c in draft.claims]
                report_id = self.store.save_report(
                    task_id=task_id, query=skill.research_question,
                    content_md=draft.content_md, mode=draft.mode,
                    rounds_used=draft.rounds_used, claims=claims)
                session.report = draft.content_md
                session.report_metadata.update({
                    "report_id": report_id,
                    "mode": draft.mode,
                    "rounds_used": draft.rounds_used,
                    "evidence_ids_used": draft.evidence_ids_used,
                })
            except Exception as exc:  # noqa: BLE001 —— 报告失败判任务失败(§g.2)
                self._record_node_error(task_id, "Agent7_报告生成器", exc)
            return session

        handlers = {
            "Agent1_官方猎手": research_handler("Agent1_官方猎手"),
            "Agent2_口碑矿工": research_handler("Agent2_口碑矿工"),
            "Agent3_时效警犬": research_handler("Agent3_时效警犬"),
            "Agent5_趋势先知": research_handler("Agent5_趋势先知"),
            "Agent4_矛盾侦探": research_handler("Agent4_矛盾侦探"),
            "Agent6_融合炼金术士": fusion_handler,
            "Agent7_报告生成器": report_handler,
        }

        # 节点完成 → 进度/事件回调(包装 handler,不影响调度器本身)
        wrapped: Dict[str, Callable] = {}
        for node_name, fn in handlers.items():
            def make_wrapped(fn=fn, node_name=node_name):
                def inner(session):
                    session.report_metadata.setdefault("skill_digest", digest)
                    result = fn(session)
                    pipeline_ref._on_node_done(task_id, node_name)
                    return result
                return inner
            wrapped[node_name] = make_wrapped()

        dag = PipelineDAG.build_default(wrapped)
        scheduler = TaskScheduler(
            self.session_manager, dag,
            max_workers=self.max_workers,
            storage_dir=self.scheduler_storage,
        )
        try:
            final_session = scheduler.run(session_id)
        except Exception as exc:  # noqa: BLE001
            self._fail_task(task_id, f"调度器异常: {exc}")
            return

        report_id = (getattr(final_session, "report_metadata", {}) or {}).get("report_id", "")
        if report_id:
            rt = self._runtimes.get(task_id)
            if rt is not None:
                rt.status = "done"
                rt.report_id = report_id
                rt.progress = 1.0
            self.store.mark_done(task_id, report_id)
            self._emit(task_id, "report_ready",
                       {"task_id": task_id, "report_id": report_id})
        else:
            # 报告节点失败(悬空引用等)→ 任务失败(CONTRACT §g.2)
            rt = self._runtimes.get(task_id)
            err = (rt.node_errors.get("Agent7_报告生成器")
                   if rt else None) or "报告未生成(节点无输出)"
            self._fail_task(task_id, err)

    def _on_node_done(self, task_id: str, node_name: str) -> None:
        rt = self._runtimes.get(task_id)
        if rt is None:
            return
        # 节点内部失败的 agent 不计入 agents_done(§g.2:记录+继续,但不虚报完成)
        if node_name in rt.node_errors:
            return
        agent_id = NODE_AGENT_IDS.get(node_name, node_name)
        if agent_id not in rt.agents_done:
            rt.agents_done.append(agent_id)
        rt.progress = min(1.0, rt.progress + NODE_WEIGHTS.get(node_name, 0.1))
        evidences = self._task_evidences(task_id)
        rt.evidence_count = len(evidences)
        self.store.mark_progress(task_id, rt.progress, rt.agents_done, len(evidences))
        self._emit(task_id, "agent_progress",
                   {"task_id": task_id, "node": agent_id,
                    "progress": rt.progress, "agents_done": list(rt.agents_done),
                    "evidence_count": len(evidences)})

    def _record_node_error(self, task_id: str, node_name: str, exc: Exception) -> None:
        rt = self._runtimes.get(task_id)
        logger.error(f"节点 {node_name} 失败(管线继续): {exc}")
        if rt is not None:
            rt.node_errors[node_name] = str(exc)

    def _fail_task(self, task_id: str, error: str) -> None:
        rt = self._runtimes.get(task_id)
        if rt is not None:
            rt.status = "failed"
            rt.error = error
        self.store.mark_failed(task_id, error)
        self._emit(task_id, "task_failed", {"task_id": task_id, "error": error})

    def _emit(self, task_id: str, event: str, data: Dict[str, Any]) -> None:
        rt = self._runtimes.get(task_id)
        if rt is None:
            return
        with self._lock:
            subscribers = list(rt.subscribers)
        for q in subscribers:
            q.put({"event": event, "data": data})


# ---------------------------------------------------------------------------
# 模块级单例(API 层使用;测试可用 set_pipeline 注入临时实例)
# ---------------------------------------------------------------------------

_pipeline: Optional[DeepResearchPipeline] = None
_pipeline_lock = threading.Lock()


def get_pipeline() -> DeepResearchPipeline:
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            _pipeline = DeepResearchPipeline()
        return _pipeline


def set_pipeline(pipeline: Optional[DeepResearchPipeline]) -> None:
    """测试/多实例注入点。"""
    global _pipeline
    with _pipeline_lock:
        _pipeline = pipeline
