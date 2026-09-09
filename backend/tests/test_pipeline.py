"""深研管线测试(AGENT_05)。

覆盖(任务书 #8):
  - 融合公式(纯函数,含已知时间戳与「时间未知」两种输入);
  - 降级路径(无 LLM key 全链路规则跑通);
  - evidence_refs 传播(LLM/降级两条路径);
  - quote 匹配(有证据支撑 vs 【无证据】标记);
  - 报告引用语法渲染([E:id] / 悬空引用判失败);
  - freshness 真实时间戳(agent1/agent5 无裸 datetime.now());
  - task_scheduler 真实接入主 API(异步任务 + 进度 + 报告落库);
  - LLM 注入 fake 时深研链路端到端 ≤30s。

真实运行:cd backend && python3 -m pytest tests/test_pipeline.py -q
"""
from __future__ import annotations

import inspect
import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agents import (
    Agent1OfficialHunter,
    Agent5TrendProphet,
    Agent7ReportWriter,
    AgentContext,
    FusionAlchemist,
    ProfessionFeatures,
    ReportGenerationError,
    UserConfig,
    build_gaokao_skill,
    validate_citations,
)
from app.config import Config
from app.services.deep_research_pipeline import DeepResearchPipeline
from app.services.session_manager import Session, SessionManager

# ---------------------------------------------------------------------------
# fixtures(临时库/临时 artifacts/临时 session 存储,不污染真实 data/)
# ---------------------------------------------------------------------------


@pytest.fixture()
def env(tmp_path, monkeypatch):
    db_path = tmp_path / "test_pipeline.db"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    monkeypatch.setattr(Config, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(Config, "EVIDENCE_ARTIFACTS_DIR", str(artifacts))
    return {"db": db_path, "artifacts": artifacts, "tmp": tmp_path}


def make_pipeline(env, llm=None) -> DeepResearchPipeline:
    return DeepResearchPipeline(
        llm=llm,
        session_manager=SessionManager(storage_dir=str(env["tmp"] / "sessions")),
        scheduler_storage=str(env["tmp"] / "pipelines"),
        max_workers=4,
    )


SOURCES = [
    {
        "url": "https://www.eol.cn/e_ky/zt/common/gdlink/",
        "title": "阳光高考频道:计算机科学与技术专业解读",
        "quote": "计算机科学与技术专业是工学门类下就业面最广的专业之一,近三年招生计划持续增长。",
        "fetched_at": "2026-08-01T08:00:00+00:00",
    },
    {
        "url": "https://www.zhihu.com/question/19893456",
        "title": "就读计算机专业是一种什么体验?",
        "quote": "课程压力大但实习机会多,班里一半人去了大厂,转专业进来的同学劝退的不少。",
        "fetched_at": "2026-08-20T12:00:00+00:00",
    },
]

PROF = ProfessionFeatures(code="080901", name="计算机科学与技术", category="工学",
                          keywords=["编程", "算法"])


def wait_terminal(pipeline: DeepResearchPipeline, task_id: str,
                  timeout: float = 30.0) -> dict:
    deadline = time.monotonic() + timeout
    status = pipeline.get_status(task_id) or {}
    while time.monotonic() < deadline:
        status = pipeline.get_status(task_id) or {}
        if status.get("status") in ("done", "failed"):
            return status
        time.sleep(0.05)
    return status


# ---------------------------------------------------------------------------
# 1. 融合公式(纯函数)
# ---------------------------------------------------------------------------

class TestFusionFormula:
    def test_fuse_known_timestamps(self):
        """固定输入下验证融合公式(不 mock,直接按公式手算对照)。"""
        cfg = UserConfig()
        alch = FusionAlchemist(cfg)
        now = datetime.now()
        outputs = {
            "080901": [
                type(Agent1OfficialHunter().research(AgentContext(PROF, cfg)) )(
                    agent_name="官方猎手", profession_code="080901", raw_score=80.0,
                    confidence=0.8, freshness_date=now, source_count=3),
                type(Agent1OfficialHunter().research(AgentContext(PROF, cfg)) )(
                    agent_name="趋势先知", profession_code="080901", raw_score=60.0,
                    confidence=0.6, freshness_date=now, source_count=3),
            ],
        }
        results = alch.fuse(outputs, {"080901": PROF})
        assert len(results) == 1 and results[0].rank == 1
        r = results[0]
        # 手算:base=(80*1.0+60*1.2)/2.2≈69.09;无关键词叙事 0.5;
        # conflict spread=20→low(0.95,>20 才是 medium);cal≈0.691*0.95*(2/3)≈0.4376;
        # Z=工学1.1*计算机1.2=1.32
        base = 152 / 2.2
        cal = (1.52 / 2.2) * 0.95 * (2 / 3)
        assert r.base_score == pytest.approx(base, abs=0.05)
        assert r.match_score == pytest.approx(base * 0.5 * cal * 1.32, rel=0.02)
        assert r.conflict_severity == "low"

    def test_time_decay_unknown_time_is_neutral(self):
        """freshness=None(时间未知)→ 中性 0.5 衰减;真实时间戳走原公式。"""
        alch = FusionAlchemist(UserConfig())
        assert alch.time_decay("官方猎手", None) == 0.5
        fresh = datetime.now()
        assert alch.time_decay("官方猎手", fresh) == 1.0  # age=0 → 不衰减
        old = datetime(2020, 1, 1)
        assert alch.time_decay("官方猎手", old) < 0.5  # 真实过期数据正常衰减

    def test_tier_strategy_counts(self):
        """双高分一致 → 落「稳」层。手算:base=60(三 Agent 同分);
        narrative=「护理」全命中→sigmoid(1.0)≈0.9241;
        calibration=1.0(置信 1.0×无冲突×3 Agent 多样性满额);
        Z=医学壁垒1.1×护理高确定性1.2=1.32 → 60×0.9241×1.32≈73.2 ∈ [70,85) → 稳。
        (B 档配额四舍五入后余数并入「稳」,总数 1 时稳层保留该条。)"""
        alch = FusionAlchemist(UserConfig(confirmed_keywords=["护理"]))
        now = datetime.now()
        outputs = {"x": []}
        for name in ("官方猎手", "趋势先知", "口碑矿工"):
            outputs["x"].append(
                type(Agent1OfficialHunter().research(AgentContext(PROF, UserConfig())))(
                    agent_name=name, profession_code="x", raw_score=60.0,
                    confidence=1.0, freshness_date=now))
        results = alch.fuse(
            outputs,
            {"x": ProfessionFeatures(code="x", name="护理学", category="医学")})
        assert results[0].match_score == pytest.approx(73.2, abs=0.5)
        strategy = alch.tier_strategy(results)
        assert sum(len(v) for v in strategy.values()) == 1
        assert strategy["稳"]  # 双高分一致 → 落「稳」层


# ---------------------------------------------------------------------------
# 2. freshness 真实时间戳(裸 datetime.now() 债务修复)
# ---------------------------------------------------------------------------

class TestFreshness:
    @pytest.mark.parametrize("agent_cls", [Agent1OfficialHunter, Agent5TrendProphet])
    def test_real_timestamp_used(self, agent_cls):
        ctx = AgentContext(
            profession=PROF, user_config=UserConfig(),
            post_times=["2026-07-15T10:00:00+08:00", "2026-08-10T09:00:00+08:00"],
            official_data={"fetched_at": "2026-08-01T00:00:00+00:00"},
        )
        out = agent_cls().research(ctx)
        assert out.freshness_date is not None
        assert "时间未知" not in out.notes

    @pytest.mark.parametrize("agent_cls", [Agent1OfficialHunter, Agent5TrendProphet])
    def test_unknown_time_marked_not_faked(self, agent_cls):
        """无真实数据时间戳 → freshness=None + 显式【时间未知】,不伪装新鲜。"""
        out = agent_cls().research(AgentContext(profession=PROF, user_config=UserConfig()))
        assert out.freshness_date is None
        assert "【时间未知】" in out.notes

    @pytest.mark.parametrize("module", [
        "app.agents.agent1_official_hunter",
        "app.agents.agent5_trend_prophet",
    ])
    def test_no_bare_datetime_now(self, module):
        """验收口径:Agent1/5 源码不再出现裸 datetime.now() 硬编码。"""
        import importlib
        src = inspect.getsource(importlib.import_module(module))
        assert "datetime.now()" not in src


# ---------------------------------------------------------------------------
# 3. evidence_refs 传播
# ---------------------------------------------------------------------------

class TestEvidenceRefsPropagation:
    def test_agent_output_carries_refs_degrade_path(self):
        evidences = [{"evidence_id": "ev_01AAAAAAAAAAAAAAAAAAAAAAAA",
                      "quote": "计算机专业就业面广", "url": "https://eol.cn/x",
                      "title": "", "fetched_at": "2026-08-01T00:00:00+00:00",
                      "source_quality": "authoritative"}]
        out = Agent1OfficialHunter().research(
            AgentContext(profession=PROF, user_config=UserConfig(),
                         evidence_records=evidences))
        assert out.evidence_refs == ["ev_01AAAAAAAAAAAAAAAAAAAAAAAA"]

    def test_refs_survive_session_roundtrip(self, tmp_path):
        from app.agents.agent6_fusion_alchemist import AgentOutput
        from app.services.session_manager import UserProfile
        out = AgentOutput(agent_name="官方猎手", profession_code="080901",
                          raw_score=80, confidence=0.8, freshness_date=None,
                          evidence_refs=["ev_01AAAAAAAAAAAAAAAAAAAAAAAA"])
        d = Session.agent_output_to_dict(out)
        assert d["freshness_date"] is None and d["evidence_refs"] == [
            "ev_01AAAAAAAAAAAAAAAAAAAAAAAA"]
        # 走 Session 序列化往返(freshness=None 与 evidence_refs 均不丢)
        sm = SessionManager(storage_dir=str(tmp_path / "sessions_roundtrip"))
        profile = sm.create(UserProfile(score=600))
        session = sm.get(profile.session_id)
        session.agent_outputs["080901"] = [d]
        fused = session.get_agent_outputs_for_fusion()
        assert fused["080901"][0].freshness_date is None
        assert fused["080901"][0].evidence_refs == ["ev_01AAAAAAAAAAAAAAAAAAAAAAAA"]


# ---------------------------------------------------------------------------
# 4. quote 匹配与【无证据】标记(报告可追溯)
# ---------------------------------------------------------------------------

class TestQuoteMatchingAndReport:
    EVIDENCES = [
        {"evidence_id": "ev_01AAAAAAAAAAAAAAAAAAAAAAAA",
         "channel": "deep_research", "url": "https://www.eol.cn/gaokao/cs",
         "title": "计算机专业解读", "fetched_at": "2026-08-01T08:00:00+00:00",
         "source_quality": "authoritative",
         "quote": "计算机科学与技术专业就业面广,近三年招生计划持续增长。",
         "locator": {}, "raw_ref": None, "task_id": "t1", "created_at": "x"},
        {"evidence_id": "ev_01BBBBBBBBBBBBBBBBBBBBBBBB",
         "channel": "deep_research", "url": "https://www.zhihu.com/q/1",
         "title": "就读体验", "fetched_at": "2026-08-20T12:00:00+00:00",
         "source_quality": "community",
         "quote": "课程压力大,实习机会多,一半人去了大厂。",
         "locator": {}, "raw_ref": None, "task_id": "t1", "created_at": "x"},
    ]

    def test_supported_claim_gets_citation(self):
        writer = Agent7ReportWriter()
        fusion = [{
            "profession_code": "080901", "profession_name": "计算机科学与技术",
            "match_score": 72.5, "rank": 1, "tier": "重点考虑 (A级)",
            "factors": {"narrative_match": 0.5, "confidence_calibration": 0.4,
                        "zhangxuefeng_adjustment": 1.32},
            "breakdown": {"官方猎手": {"raw_score": 80, "effective_weight": 0.9,
                                      "confidence": 0.8, "notes": "x"}},
            "conflict_severity": None,
        }]
        draft = writer.write_report("对比计算机专业前景", fusion, self.EVIDENCES)
        assert "ev_01AAAAAAAAAAAAAAAAAAAAAAAA" in draft.evidence_ids_used
        # 支撑句有 [E:id],引用语法为契约 [E:evidence_id]
        assert "[E:ev_01AAAAAAAAAAAAAAAAAAAAAAAA]" in draft.content_md
        # 引用表在文末且只引用存在的证据
        assert "## 引用证据" in draft.content_md
        assert "quote" not in json.dumps(draft.claims[0].__dict__, default=str)

    def test_unsupported_claim_marked(self):
        writer = Agent7ReportWriter(min_match_score=0.99)
        fusion = [{
            "profession_code": "080901", "profession_name": "计算机科学与技术",
            "match_score": 72.5, "rank": 1, "tier": "A级", "factors": {},
            "breakdown": {}, "conflict_severity": None,
        }]
        draft = writer.write_report("对比量子计算机心理学", fusion, self.EVIDENCES)
        assert "【无证据】" in draft.content_md
        assert any(not c.supported for c in draft.claims)

    def test_no_evidence_at_all_all_marked(self):
        fusion = [{"profession_code": "x", "profession_name": "某专业",
                   "match_score": 50, "rank": 1, "tier": "B级", "factors": {},
                   "breakdown": {}, "conflict_severity": None}]
        draft = Agent7ReportWriter().write_report("研究量子考古", fusion, [])
        assert "【无证据】" in draft.content_md
        assert draft.evidence_ids_used == []

    def test_dangling_reference_fails_report(self, monkeypatch):
        """悬空 evidence_id 引用 → 报告生成失败(CONTRACT §g.2)。"""
        import app.agents.agent7_report_writer as rw
        import app.api.evidence as ev_api

        def fake_match(claims, evidences, limit=3, min_score=0.2):
            return [{"claim": c, "supported": True, "best_score": 1.0,
                     "matches": [{"evidence_id": "ev_01ZZZZZZZZZZZZZZZZZZZZZZZZ",
                                  "score": 1.0}]} for c in claims]

        monkeypatch.setattr(ev_api, "match_claims", fake_match)
        monkeypatch.setattr(rw, "_evidence_api",
                            lambda: (ev_api.extract_citations, fake_match,
                                     ev_api.render_references_block))
        fusion = [{"profession_code": "x", "profession_name": "某专业",
                   "match_score": 50, "rank": 1, "tier": "B级", "factors": {},
                   "breakdown": {}, "conflict_severity": None}]
        with pytest.raises(ReportGenerationError):
            Agent7ReportWriter().write_report("研究", fusion, self.EVIDENCES)

    def test_validate_citations_pure(self):
        assert validate_citations("a [E:ev_01AAAA] b", set()) == ["ev_01AAAA"]
        assert validate_citations("a [E:ok]", {"ok"}) == []


# ---------------------------------------------------------------------------
# 5. SKILL 注入接口(场景可插拔,高考为第一实现)
# ---------------------------------------------------------------------------

class TestSkillDefinition:
    def test_gaokao_skill_from_profile(self):
        skill = build_gaokao_skill(
            "对比华科和武大的计算机专业",
            gaokao_ctx={"province": "广东", "score": 620},
            profile={"priority": "career_prospect", "keywords": ["大厂", "保研"]},
        )
        assert skill.scenario == "gaokao"
        assert skill.dimensions[0] == "就业前景与中位数薪资"  # priority 维度置前
        assert "official" in skill.vocabulary and "trend" in skill.vocabulary
        assert "大厂" in skill.vocabulary["community"]
        skill.validate()

    def test_estimate_mapping(self):
        from app.agents.skill import SkillDefinition
        for effort, (minutes, quota) in {"low": (1, 4), "medium": (5, 12),
                                         "high": (10, 40)}.items():
            s = SkillDefinition(name="t", research_question="q", dimensions=["d"],
                                vocabulary={"official": ["x"]}, effort=effort)
            assert s.estimate() == {"minutes": minutes, "max_evidence": quota}

    def test_validation_rejects_bad_effort(self):
        from app.agents.skill import SkillDefinition, SkillValidationError
        s = SkillDefinition(name="t", research_question="q", dimensions=["d"],
                            vocabulary={}, effort="ultra")
        with pytest.raises(SkillValidationError):
            s.validate()


# ---------------------------------------------------------------------------
# 6. 降级路径全链路 + fake LLM 注入(端到端 ≤30s)
# ---------------------------------------------------------------------------

class FakeLLM:
    """LLM 接口注入的 fake 实现(非 fake key):chat_json 供 Agent1-5,chat 供润色。"""

    def __init__(self):
        self.calls = 0

    def chat_json(self, messages, temperature=0.3, max_tokens=4096):
        self.calls += 1
        return {"raw_score": 75, "confidence": 0.8, "analysis": "fake 分析",
                "data_points": ["a", "b"], "stability": "基本稳定",
                "career_outlook": "fake 前景"}

    def chat(self, messages, temperature=0.7, max_tokens=4096):
        self.calls += 1
        user = messages[-1]["content"]
        marker = "请润色以下报告(保留全部标记):\n\n"
        return user.split(marker, 1)[1] if marker in user else user


class TestEndToEndPipeline:
    def test_degrade_full_pipeline(self, env):
        """无 LLM key 降级路径:证据落库 → 7 Agent → 报告落 SQLite。"""
        pipeline = make_pipeline(env, llm=None)
        task_id, estimate = pipeline.submit(
            "对比计算机与软件工程的就业前景",
            gaokao_ctx={"province": "广东", "score": 620},
            budget={"max_minutes": 10, "max_evidence": 50},
            sources=SOURCES,
        )
        assert task_id.startswith("task_")
        assert estimate["minutes"] >= 1 and estimate["max_evidence"] >= 1

        status = wait_terminal(pipeline, task_id)
        assert status["status"] == "done", f"任务未完成: {status}"
        assert status["evidence_count"] == 2
        assert "agent7_report_writer" in status["agents_done"]
        assert status["progress"] == pytest.approx(1.0)

        # 报告落 SQLite(不只 JSON 文件)
        report = pipeline.store.get_report_by_task(task_id)
        assert report is not None and report["report_id"].startswith("rep_")
        assert "[E:" in report["content_md"] or "【无证据】" in report["content_md"]
        # 引用表逐条为 evidence_id 外键
        citations = report["citations"]
        assert citations, "report_citations 应有行"
        for c in citations:
            assert all(e.startswith("ev_") for e in c["evidence_ids"])
            assert "计算机科学与技术专业是工学门类下" not in c["claim_text"]  # quote 不复制

        # 证据库实际落了 deep_research 通道的记录
        from app.models.evidence import query_evidence
        rows, total = query_evidence(task_id=task_id)
        assert total == 2 and all(r["channel"] == "deep_research" for r in rows)
        # 源质量自动判定:官方教育媒体 authoritative,知乎 community
        qualities = {r["source_quality"] for r in rows}
        assert "community" in qualities

    def test_evidence_save_failure_degrades_to_artifact(self, env, monkeypatch):
        """证据保存重试 2 次后降级为仅落盘,管线不崩(§g.2)。"""
        import app.services.deep_research_pipeline as drp

        def boom(record, conn=None):
            raise sqlite3.OperationalError("database is locked")

        monkeypatch.setattr(drp, "save_evidence", boom)
        pipeline = make_pipeline(env)
        task_id, _ = pipeline.submit("研究问题", sources=[dict(SOURCES[0])])
        status = wait_terminal(pipeline, task_id)
        assert status["status"] == "done"
        # 降级文件真实落盘
        dumps = list(Path(Config.EVIDENCE_ARTIFACTS_DIR).rglob("page-*.txt"))
        assert dumps and dumps[0].read_text(encoding="utf-8").startswith("计算机")

    def test_fake_llm_pipeline_under_30s(self, env):
        """LLM 客户端注入 fake 实现(不是 fake key)→ 端到端 ≤30s,mode=llm。"""
        pipeline = make_pipeline(env, llm=FakeLLM())
        start = time.monotonic()
        task_id, _ = pipeline.submit("对比计算机专业前景", sources=SOURCES)
        status = wait_terminal(pipeline, task_id, timeout=30)
        elapsed = time.monotonic() - start
        assert status["status"] == "done", f"任务未完成: {status}"
        assert elapsed <= 30, f"fake 注入下深研链路耗时 {elapsed:.1f}s > 30s"
        report = pipeline.store.get_report_by_task(task_id)
        assert report["mode"] == "llm"

    def test_single_agent_failure_does_not_kill_pipeline(self, env, monkeypatch):
        """任一 Agent 失败不终止管线(记录+继续,§g.2)。"""

        class BoomAgent(Agent5TrendProphet):
            def research(self, ctx):
                raise RuntimeError("趋势先知炸了")

        import app.services.deep_research_pipeline as drp
        monkeypatch.setitem(drp.AGENT_INSTANCES, "Agent5_趋势先知",
                            ("趋势先知", BoomAgent))
        pipeline = make_pipeline(env)
        task_id, _ = pipeline.submit("对比计算机专业前景", sources=[dict(SOURCES[1])])
        status = wait_terminal(pipeline, task_id)
        assert status["status"] == "done"
        assert "agent5_trend_prophet" not in status["agents_done"]


# ---------------------------------------------------------------------------
# 7. 主 API 真实接入(CONTRACT §e.3)
# ---------------------------------------------------------------------------

@pytest.fixture()
def api_client(env):
    import app.api.deep_research as dr_api
    import app.services.deep_research_pipeline as drp

    pipeline = make_pipeline(env)
    drp.set_pipeline(pipeline)
    app = FastAPI()
    app.include_router(dr_api.router, prefix="/api/deep-research")
    client = TestClient(app)
    client._pipeline = pipeline  # type: ignore[attr-defined]
    yield client
    drp.set_pipeline(None)


class TestDeepResearchAPI:
    def test_submit_and_poll_and_report(self, api_client):
        r = api_client.post("/api/deep-research", json={
            "query": "对比计算机与软件工程的就业前景",
            "gaokao_ctx": {"province": "广东", "score": 620},
            "budget": {"max_minutes": 10, "max_evidence": 50},
            "sources": SOURCES,
        })
        assert r.status_code == 202
        body = r.json()
        assert body["task_id"].startswith("task_")
        assert body["status"] == "queued"
        assert set(body["estimate"]) == {"minutes", "max_evidence"}
        assert "token" in body["notice"] or "分钟" in body["notice"]  # 耗时+配额确认提示

        task_id = body["task_id"]
        deadline = time.monotonic() + 30
        status = {}
        while time.monotonic() < deadline:
            status = api_client.get(f"/api/deep-research/{task_id}").json()
            if status["status"] in ("done", "failed"):
                break
            time.sleep(0.05)
        assert status["status"] == "done", status
        assert status["evidence_count"] == 2

        r = api_client.get(f"/api/deep-research/{task_id}/report")
        assert r.status_code == 200
        assert r.json()["task_id"] == task_id
        assert r.json()["citations"]

    def test_stream_sse_events(self, api_client):
        r = api_client.post("/api/deep-research", json={"query": "对比金融与法学"})
        task_id = r.json()["task_id"]
        with api_client.stream("GET",
                               f"/api/deep-research/{task_id}/stream") as resp:
            assert resp.headers["content-type"].startswith("text/event-stream")
            frames = []
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    frames.append(json.loads(line[len("data: "):]))
                    if frames[-1]["event"] in ("report_ready", "task_failed"):
                        break
        assert frames, "SSE 应至少有一帧"
        assert frames[-1]["event"] == "report_ready"
        assert any(f["event"] == "agent_progress" for f in frames)

    def test_query_validation(self, api_client):
        r = api_client.post("/api/deep-research", json={"query": "  "})
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "INVALID_PARAMS"
        r = api_client.post("/api/deep-research", json={"query": "x" * 2001})
        assert r.status_code == 400

    def test_unknown_task_404(self, api_client):
        r = api_client.get("/api/deep-research/task_does_not_exist")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "TASK_NOT_FOUND"


class TestReportApi:
    """POST /api/report 改造(CONTRACT §e:必须返回 citations)。"""

    def test_post_report_by_task_returns_citations(self, env):
        from app.api.report import router as report_router

        pipeline = make_pipeline(env)
        task_id, _ = pipeline.submit("对比计算机与软件工程的就业前景", sources=SOURCES)
        status = wait_terminal(pipeline, task_id)
        assert status["status"] == "done", status

        app = FastAPI()
        app.include_router(report_router, prefix="/api/report")
        client = TestClient(app)

        r = client.post("/api/report", json={"task_id": task_id})
        assert r.status_code == 200
        body = r.json()
        assert body["task_id"] == task_id
        assert body["report_id"].startswith("rep_")
        assert body["citations"], "POST /api/report 必须返回 citations"
        for c in body["citations"]:
            assert all(e.startswith("ev_") for e in c["evidence_ids"])
            assert "计算机科学与技术专业是工学门类下" not in c["claim_text"]  # quote 不复制

        # rep_ 前缀 GET 回查同库报告,引用一致
        r2 = client.get(f"/api/report/{body['report_id']}")
        assert r2.status_code == 200
        assert r2.json()["citations"] == body["citations"]

        # 未知任务/空 task_id
        assert client.post("/api/report", json={"task_id": "task_unknown"}).status_code == 404
        assert client.post("/api/report", json={"task_id": ""}).status_code == 400
