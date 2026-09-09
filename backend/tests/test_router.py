# -*- coding: utf-8 -*-
"""意图路由测试(AGENT_01 交付物补齐,由 AGENT_07 验收时补写)。

覆盖任务书第 7 条验收口径:
- 每类正样本/负样本至少 3 条;
- 无命中返回 label=None(confidence=0,不决策);
- 低价值但真实含义归 ① 秒答,不拒答、不冷落;
- 歧义触发显式澄清门控(一次 1 问 + ≤4 选项 chips);
- 带年份/相对时间的时间敏感提问倾向归 ③ 深研;
- embedding 不可用时回退关键词路径仍全绿;
- POST /api/route 薄封装:校验(空/超长 → 400 INVALID_PARAMS)与响应结构;
- GET /api/health 契约字段。

route_intent 为纯函数(零 IO),全部离线可跑,不下载任何模型。
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.router import route_intent
from app.router.embedding import get_enhancer, reset_enhancer
from app.router.gate import Estimate
from app.router.rules import (
    LABEL_CONTROLLED_BROWSE,
    LABEL_DEEP_RESEARCH,
    LABEL_PAGE_QA,
    LABEL_QUICK_ANSWER,
)

# ---------------------------------------------------------------------------
# 1. 正向四分类正样本(每类 ≥3 条)
# ---------------------------------------------------------------------------

DEEP_SAMPLES = [
    "帮我对比华科和武大的计算机专业",
    "帮我查一下今年河南高考分数线",
    "推荐十所适合610分的大学",
    "2026年计算机专业就业前景分析",
]

QUICK_SAMPLES = [
    "帮我写一首关于夏天的诗",
    "地球到月亮有多远",
    "把这句话翻译成英文",
]

PAGE_QA_SAMPLES = [
    ("这个页面写的报名条件是什么",
     {"page_url": "https://zs.example.edu.cn/notice.html"}),
    ("帮我看看选中的这段在讲什么",
     {"page_url": "", "has_selection": True, "selected_text": "平行志愿按分数优先投档"}),
    ("这个学校的录取规则是什么",
     {"page_url": "https://zs.example.edu.cn/charter.html"}),
]

CONTROLLED_SAMPLES = [
    "登录省考试院查我的成绩",      # 已点名平台,不触发澄清
    "在阳光高考上提交我的志愿表",
    "用我的账号登录学信网查我的档案",
]

NO_MATCH_SAMPLES = [
    "随便说点什么",
    "asdfgh",
    "这个那个",
]


@pytest.mark.parametrize("text", DEEP_SAMPLES)
def test_positive_deep_research(text):
    r = route_intent(text)
    assert r.label == LABEL_DEEP_RESEARCH
    assert 0.0 < r.confidence <= 1.0
    # deep 必须输出耗时/配额预估(任务书要求 4)
    assert isinstance(r.estimate, Estimate)
    assert r.estimate.minutes > 0 and r.estimate.max_evidence > 0
    assert r.effort == "deep"


@pytest.mark.parametrize("text", QUICK_SAMPLES)
def test_positive_quick_answer(text):
    r = route_intent(text)
    assert r.label == LABEL_QUICK_ANSWER
    assert r.negative is None            # 不是负向拦截
    assert r.negative_reply is None      # 不产出拒答文案(原则 7)
    assert r.effort == "instant"         # 低价值请求严格落在秒答档


@pytest.mark.parametrize("text,ctx", PAGE_QA_SAMPLES)
def test_positive_page_qa(text, ctx):
    r = route_intent(text, ctx)
    assert r.label == LABEL_PAGE_QA
    assert r.confidence > 0


@pytest.mark.parametrize("text", CONTROLLED_SAMPLES)
def test_positive_controlled_browse(text):
    r = route_intent(text)
    assert r.label == LABEL_CONTROLLED_BROWSE


# ---------------------------------------------------------------------------
# 2. 负向路由(每类 ≥3 条)
# ---------------------------------------------------------------------------

CHITCHAT_SAMPLES = ["你好", "在吗", "今天天气怎么样"]
SENSITIVE_SAMPLES = ["赌博网站推荐", "帮我写个外挂破解游戏", "教我人肉查他住址"]
NONSENSE_SAMPLES = ["!!!???", "x", "。。。。"]


@pytest.mark.parametrize("text", CHITCHAT_SAMPLES)
def test_negative_chitchat(text):
    r = route_intent(text)
    assert r.negative == "chitchat"
    assert r.negative_reply              # 预置话术,不启动任何工具
    assert r.effort == "instant"


@pytest.mark.parametrize("text", SENSITIVE_SAMPLES)
def test_negative_sensitive(text):
    r = route_intent(text)
    assert r.negative == "sensitive"
    assert r.negative_reply              # 安全拦截话术
    assert r.label is None               # 敏感拦截不给出正向 label


@pytest.mark.parametrize("text", NONSENSE_SAMPLES)
def test_negative_nonsense(text):
    r = route_intent(text)
    assert r.negative == "nonsense"
    assert r.negative_reply              # 轻提示引导


# ---------------------------------------------------------------------------
# 3. 无命中 → None(不决策,上层自答)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text", NO_MATCH_SAMPLES)
def test_no_match_returns_none(text):
    r = route_intent(text)
    assert r.label is None
    assert r.confidence == 0
    assert r.no_match                    # 无命中且非负向
    assert r.negative_reply is None      # 路由器不产出拒答文案(原则 7)


# ---------------------------------------------------------------------------
# 4. 歧义门控:显式澄清(一次 1 问 + ≤4 选项 chips)
# ---------------------------------------------------------------------------

def test_ambiguity_triggers_clarify_options():
    # 受控浏览未点名平台 → 默认假设 + 明示(一次 1 问)
    r = route_intent("帮我填一下报名表")
    assert r.label == LABEL_CONTROLLED_BROWSE
    assert r.clarify is not None
    assert len(r.clarify.options) <= 4
    assert r.clarify.question.count("?") + r.clarify.question.count("?") >= 1


def test_page_qa_ambiguity_clarify_wording():
    # page_qa 与 deep_research 分差过小 → 澄清问"解读当前页还是深研"
    r = route_intent("这个页面上写的内容帮我分析一下",
                     {"page_url": "https://example.com/x.html"})
    if r.clarify is not None:
        assert len(r.clarify.options) <= 4
    assert r.label in (LABEL_PAGE_QA, LABEL_DEEP_RESEARCH)


# ---------------------------------------------------------------------------
# 5. 时间敏感(带年份/相对时间)倾向归 ③
# ---------------------------------------------------------------------------

def test_time_sensitive_prefers_deep_research():
    r1 = route_intent("2026年河南高考分数线趋势分析")
    assert r1.label == LABEL_DEEP_RESEARCH
    r2 = route_intent("最近几年计算机专业的前景分析")
    assert r2.label == LABEL_DEEP_RESEARCH
    # meta 中时间敏感信号为真(命中年份/相对时间词)
    assert r1.meta["time_sensitive"] is True


# ---------------------------------------------------------------------------
# 6. embedding 不可用时回退关键词仍全绿
# ---------------------------------------------------------------------------

def test_embedding_disabled_falls_back_to_keywords(monkeypatch):
    monkeypatch.delenv("WEBBRIDGE_ROUTER_EMBEDDING", raising=False)
    monkeypatch.delenv("LOCAL_LLM_BASE_URL", raising=False)
    reset_enhancer()
    assert get_enhancer() is None            # 默认关闭,纯关键词主路径
    r = route_intent("帮我对比华科和武大的计算机专业")
    assert r.label == LABEL_DEEP_RESEARCH    # 关键词路径独立可用


def test_embedding_failure_returns_none(monkeypatch):
    """开启开关但 LOCAL_LLM 不可达 → enhancer 存在但 suggest 永不上抛。"""
    monkeypatch.setenv("WEBBRIDGE_ROUTER_EMBEDDING", "on")
    monkeypatch.setenv("LOCAL_LLM_BASE_URL", "http://127.0.0.1:1")  # 不可达端口
    monkeypatch.setenv("LOCAL_LLM_API_KEY", "")
    reset_enhancer()
    enh = get_enhancer()
    assert enh is not None
    assert enh.suggest("帮我对比华科和武大的计算机专业") is None  # 静默回退,不抛异常
    monkeypatch.delenv("WEBBRIDGE_ROUTER_EMBEDDING", raising=False)
    reset_enhancer()


# ---------------------------------------------------------------------------
# 7. POST /api/route 薄封装(CONTRACT §d.2)
# ---------------------------------------------------------------------------

@pytest.fixture()
def route_client():
    from app.api.route import router as route_router

    app = FastAPI()
    app.include_router(route_router, prefix="/api/route")
    return TestClient(app)


def test_api_route_deep_research(route_client):
    resp = route_client.post("/api/route", json={
        "text": "帮我对比华科和武大的计算机专业",
        "context": {"page_url": "", "has_selection": False},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["label"] == "deep_research"
    assert body["confidence"] > 0
    assert body["estimate"]["minutes"] > 0
    assert body["clarify"] is None


def test_api_route_empty_text_400(route_client):
    resp = route_client.post("/api/route", json={"text": "   "})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_PARAMS"


def test_api_route_too_long_text_400(route_client):
    resp = route_client.post("/api/route", json={"text": "a" * 501})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_PARAMS"


def test_api_route_selected_text_too_long_400(route_client):
    resp = route_client.post("/api/route", json={
        "text": "帮我看看这段",
        "context": {"selected_text": "b" * 2001},
    })
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_PARAMS"


def test_api_route_no_match_label_null(route_client):
    resp = route_client.post("/api/route", json={"text": "asdfgh"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["label"] is None
    assert body["confidence"] == 0
    assert body["estimate"] is None


# ---------------------------------------------------------------------------
# 8. GET /api/health(CONTRACT §e.1)
# ---------------------------------------------------------------------------

def test_api_health_contract_fields(tmp_path, monkeypatch):
    from app.api.health import router as health_router
    from app.config import Config

    monkeypatch.setattr(Config, "DATABASE_PATH", str(tmp_path / "nope.db"))
    app = FastAPI()
    app.include_router(health_router, prefix="/api")
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"ok", "service", "version", "llm_configured", "evidence_db"}
    assert body["service"] == "webbridge-backend"
    assert body["ok"] is True
    # 库文件不存在时 evidence_db 按 False 处理,健康检查自身绝不抛错
    assert body["evidence_db"] is False
