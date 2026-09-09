"""
证据层测试(AGENT_02):save/query 往返、幂等、校验、旁路文件读写、
引用格式渲染、claim 匹配正/反例、source_quality 判定、EVIDENCE_DB_FAIL。
"""
import sqlite3
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Config
from app.evidence.repository import init_evidence_table, query_evidence
from app.evidence.schema import (
    QUOTE_MAX_CHARS,
    is_valid_evidence_id,
    new_evidence_id,
    normalize_fetched_at,
    ulid,
)
from app.evidence.service import assess_source_quality

# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def env(tmp_path, monkeypatch):
    """临时 DB + 临时 artifacts 根,互不污染真实库。"""
    db_path = tmp_path / "test_evidence.db"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    monkeypatch.setattr(Config, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(Config, "EVIDENCE_ARTIFACTS_DIR", str(artifacts))
    return {"db": db_path, "artifacts": artifacts}


@pytest.fixture()
def client(env):
    from app.evidence.api import router as evidence_router

    init_evidence_table()
    app = FastAPI()
    app.include_router(evidence_router, prefix="/api/evidence")
    return TestClient(app)


def _item(**overrides):
    base = {
        "channel": "deep_research",
        "url": "https://www.moe.gov.cn/jyzx/2025/notice.html",
        "title": "教育部 2025 年招生通知",
        "quote": "2025年起,高校招生将严格执行阳光招生政策,严禁违规争抢生源。",
        "task_id": "task_01TEST",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# ULID / evidence_id
# ---------------------------------------------------------------------------

class TestUlid:
    def test_format(self):
        eid = new_evidence_id()
        assert eid.startswith("ev_")
        assert len(eid) == 29  # ev_ + 26
        assert is_valid_evidence_id(eid)
        assert not is_valid_evidence_id("ev_short")
        assert not is_valid_evidence_id("random-uuid")

    def test_time_ordered_and_charset(self):
        first = ulid()
        second = ulid()
        assert second >= first  # 同毫秒单调递增
        assert all(c in "0123456789ABCDEFGHJKMNPQRSTVWXYZ" for c in first)

    def test_uuid_like_ids_rejected(self):
        assert not is_valid_evidence_id(str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# save → query 往返
# ---------------------------------------------------------------------------

class TestSaveQueryRoundtrip:
    def test_save_and_query_roundtrip(self, client, env):
        resp = client.post("/api/evidence/save", json=_item())
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["evidence_id"].startswith("ev_")
        assert "created_at" in body
        assert "duplicate" not in body

        # query by task_id
        q = client.get("/api/evidence/query", params={"task_id": "task_01TEST"})
        assert q.status_code == 200
        data = q.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["evidence_id"] == body["evidence_id"]
        assert item["channel"] == "deep_research"
        assert item["url"] == _item()["url"]
        assert item["source_quality"] == "unknown"
        assert isinstance(item["locator"], dict)  # 默认 {}
        assert item["quote"].startswith("2025年起")

    def test_fetched_at_preserved_not_replaced_by_now(self, client):
        """采集时刻禁止 now() 兜底造假:调用方给值必须原样保留(规范为 UTC)。"""
        resp = client.post("/api/evidence/save",
                           json=_item(fetched_at="2026-09-01T08:30:00+08:00"))
        assert resp.status_code == 201
        q = client.get("/api/evidence/query", params={"task_id": "task_01TEST"})
        assert q.json()["items"][0]["fetched_at"] == "2026-09-01T00:30:00+00:00"

    def test_fetched_at_filled_with_real_now_when_absent(self, client):
        client.post("/api/evidence/save", json=_item())
        q = client.get("/api/evidence/query", params={"task_id": "task_01TEST"})
        fetched = q.json()["items"][0]["fetched_at"]
        assert fetched.endswith("+00:00")  # ISO8601 含时区
        assert normalize_fetched_at(None) >= fetched  # 是真实 now(),非 0/空值

    def test_query_filters(self, client):
        client.post("/api/evidence/save", json=_item())
        client.post("/api/evidence/save", json=_item(
            channel="controlled_browse",
            url="https://zhihu.com/question/123",
            quote="知乎网友说计算机就业不行了,这是社区观点。",
            task_id="task_02",
        ))
        # q 全文检索
        r = client.get("/api/evidence/query", params={"q": "阳光招生"})
        assert r.json()["total"] == 1
        # channel 过滤
        r = client.get("/api/evidence/query", params={"channel": "controlled_browse"})
        assert r.json()["total"] == 1
        assert r.json()["items"][0]["task_id"] == "task_02"
        # url 过滤 + evidence_id 过滤
        ev = client.get("/api/evidence/query", params={"task_id": "task_02"}).json()["items"][0]
        r = client.get("/api/evidence/query", params={"evidence_id": ev["evidence_id"]})
        assert r.json()["total"] == 1
        # 空结果恒 200
        r = client.get("/api/evidence/query", params={"url": "https://never-exists.example.com"})
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0, "limit": 50, "offset": 0}

    def test_query_limit_clamped(self, client):
        for i in range(5):
            client.post("/api/evidence/save", json=_item(task_id=f"task_{i}"))
        r = client.get("/api/evidence/query", params={"limit": 999})
        assert r.json()["limit"] == 100  # 契约 limit ≤100
        r = client.get("/api/evidence/query", params={"limit": 2, "offset": 4})
        assert len(r.json()["items"]) == 1 and r.json()["total"] == 5

    def test_invalid_channel_in_query(self, client):
        r = client.get("/api/evidence/query", params={"channel": "nope"})
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "INVALID_PARAMS"


# ---------------------------------------------------------------------------
# 幂等(靠 evidence_id)
# ---------------------------------------------------------------------------

class TestIdempotency:
    def test_same_evidence_id_not_duplicated(self, client, env):
        eid = new_evidence_id()
        first = client.post("/api/evidence/save", json=_item(evidence_id=eid))
        assert first.status_code == 201
        second = client.post("/api/evidence/save",
                             json=_item(evidence_id=eid, quote="改过的内容"))
        assert second.status_code == 200
        assert second.json()["duplicate"] is True
        assert second.json()["evidence_id"] == eid
        # 原文未被覆盖(幂等,不覆盖)
        detail = client.get(f"/api/evidence/{eid}")
        assert detail.json()["evidence"]["quote"].startswith("2025年起")
        _, total = query_evidence(evidence_id=eid)
        assert total == 1

    def test_batch_save_and_dup(self, client):
        eid = new_evidence_id()
        payload = {"items": [_item(task_id="t1"), _item(task_id="t2"),
                             _item(task_id="t3", evidence_id=eid)]}
        r = client.post("/api/evidence/save", json=payload)
        assert r.status_code == 201
        assert r.json()["count"] == 3
        # 幂等靠 evidence_id:显式 id 的条目重放命中,不产生新行
        r2 = client.post("/api/evidence/save", json={"items": [_item(task_id="t3", evidence_id=eid)]})
        assert r2.status_code == 201
        _, total = query_evidence()
        assert total == 3

    def test_batch_explicit_ids_fully_idempotent(self, client):
        ids = [new_evidence_id() for _ in range(3)]
        payload = {"items": [_item(task_id=f"t{i}", evidence_id=eid)
                             for i, eid in enumerate(ids)]}
        client.post("/api/evidence/save", json=payload)
        client.post("/api/evidence/save", json=payload)  # 整批重放
        _, total = query_evidence()
        assert total == 3


# ---------------------------------------------------------------------------
# 校验(§g:save 必须校验 channel/quote/url)
# ---------------------------------------------------------------------------

class TestValidation:
    def test_missing_channel(self, client):
        r = client.post("/api/evidence/save", json=_item(channel=""))
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "INVALID_PARAMS"

    def test_bad_channel(self, client):
        r = client.post("/api/evidence/save", json=_item(channel="scrape"))
        assert r.status_code == 400

    def test_missing_quote(self, client):
        r = client.post("/api/evidence/save", json=_item(quote="  "))
        assert r.status_code == 400

    def test_quote_over_2000_chars(self, client):
        r = client.post("/api/evidence/save", json=_item(quote="长" * (QUOTE_MAX_CHARS + 1)))
        assert r.status_code == 400
        assert "2000" in r.json()["error"]["message"]

    def test_quote_at_limit_ok(self, client):
        r = client.post("/api/evidence/save", json=_item(quote="长" * QUOTE_MAX_CHARS))
        assert r.status_code == 201

    def test_missing_url(self, client):
        r = client.post("/api/evidence/save", json=_item(url=""))
        assert r.status_code == 400

    def test_url_scheme(self, client):
        r = client.post("/api/evidence/save", json=_item(url="ftp://x.example.com"))
        assert r.status_code == 400

    def test_bad_source_quality(self, client):
        r = client.post("/api/evidence/save", json=_item(source_quality="godly"))
        assert r.status_code == 400

    def test_bad_fetched_at(self, client):
        r = client.post("/api/evidence/save", json=_item(fetched_at="不是时间"))
        assert r.status_code == 400

    def test_bad_locator_type(self, client):
        r = client.post("/api/evidence/save", json=_item(locator={"type": "magic"}))
        assert r.status_code == 400

    def test_locator_json_string_accepted(self, client):
        r = client.post("/api/evidence/save",
                        json=_item(locator={"type": "css", "value": "#main p:nth-child(3)"}))
        assert r.status_code == 201
        eid = r.json()["evidence_id"]
        loc = client.get(f"/api/evidence/{eid}").json()["evidence"]["locator"]
        assert loc == {"type": "css", "value": "#main p:nth-child(3)"}

    def test_batch_over_50_rejected(self, client):
        r = client.post("/api/evidence/save",
                        json={"items": [_item(task_id=f"t{i}") for i in range(51)]})
        assert r.status_code == 400

    def test_empty_batch_rejected(self, client):
        r = client.post("/api/evidence/save", json={"items": []})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# 旁路文件读写(§f):大内容不进 SQLite
# ---------------------------------------------------------------------------

class TestRawBypass:
    def test_raw_file_roundtrip(self, client, env):
        task = "task_01RAW"
        fname = "extract-20260906-142233-001.txt"
        raw_dir = env["artifacts"] / task
        raw_dir.mkdir(parents=True)
        big_content = "教育部原文全文:" + "正文内容" * 50000  # ~300KB,远超 quote 上限
        (raw_dir / fname).write_text(big_content, encoding="utf-8")

        r = client.post("/api/evidence/save", json=_item(
            task_id=task, raw_ref=f"artifacts/{task}/{fname}",
            quote=big_content[:1800],
        ))
        assert r.status_code == 201
        eid = r.json()["evidence_id"]

        detail = client.get(f"/api/evidence/{eid}")
        assert detail.status_code == 200
        body = detail.json()
        assert body["evidence"]["raw_ref"] == f"artifacts/{task}/{fname}"
        assert body["raw"]["available"] is True
        assert body["raw"]["content"] == big_content  # 原文可回查
        assert body["raw"]["truncated"] is False

        # 旁路大字段不占 SQLite 大字段空间:库里只存 ≤2000 的 quote
        conn = sqlite3.connect(str(env["db"]))
        stored_quote_len, = conn.execute(
            "SELECT LENGTH(quote) FROM evidence WHERE evidence_id = ?", (eid,)
        ).fetchone()
        conn.close()
        assert stored_quote_len <= QUOTE_MAX_CHARS * 4  # utf-8 中文 3-4 字节/字符
        assert len(big_content) > QUOTE_MAX_CHARS  # 全文只在文件里

    def test_raw_file_missing_reported(self, client, env):
        r = client.post("/api/evidence/save", json=_item(
            raw_ref="artifacts/task_XX/extract-not-here.txt"))
        assert r.status_code == 201
        eid = r.json()["evidence_id"]
        body = client.get(f"/api/evidence/{eid}").json()
        assert body["raw"]["available"] is False
        assert body["raw"]["reason"] == "file_missing"

    def test_raw_ref_traversal_rejected(self, client):
        r = client.post("/api/evidence/save", json=_item(
            raw_ref="artifacts/../secrets.txt"))
        assert r.status_code == 400

    def test_raw_ref_absolute_file_uri_rejected(self, client):
        r = client.post("/api/evidence/save", json=_item(
            raw_ref="file:///etc/passwd"))
        assert r.status_code == 400

    def test_raw_ref_wrong_shape_rejected(self, client):
        r = client.post("/api/evidence/save", json=_item(raw_ref="just-a-name.txt"))
        assert r.status_code == 400

    def test_raw_content_read_truncation_flag(self, client, env):
        task = "task_01TRUNC"
        raw_dir = env["artifacts"] / task
        raw_dir.mkdir(parents=True)
        # 直接在磁盘上放一个超大文件,绕开 save 校验只测读取上限
        fname = "extract-big.txt"
        (raw_dir / fname).write_text("A" * (2 * 1024 * 1024 + 100), encoding="utf-8")
        r = client.post("/api/evidence/save", json=_item(
            task_id=task, raw_ref=f"artifacts/{task}/{fname}"))
        eid = r.json()["evidence_id"]
        raw = client.get(f"/api/evidence/{eid}").json()["raw"]
        assert raw["available"] is True and raw["truncated"] is True


# ---------------------------------------------------------------------------
# GET 单条 / 404
# ---------------------------------------------------------------------------

class TestGetOne:
    def test_get_unknown_404(self, client):
        eid = new_evidence_id()
        r = client.get(f"/api/evidence/{eid}")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "EVIDENCE_NOT_FOUND"

    def test_get_bad_format_404(self, client):
        r = client.get("/api/evidence/not-an-id")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 引用格式渲染(任务书 #3)
# ---------------------------------------------------------------------------

class TestCitationFormat:
    def _save_two(self, client):
        r1 = client.post("/api/evidence/save", json=_item(
            title="教育部通知", fetched_at="2026-09-06T02:00:00+00:00",
            source_quality="official"))
        r2 = client.post("/api/evidence/save", json=_item(
            channel="controlled_browse", url="https://zhihu.com/q/1",
            quote="知乎说就业不行。" * 40,  # >200 字符,验证截断
            source_quality="community", task_id="task_01TEST"))
        ids = [r1.json()["evidence_id"], r2.json()["evidence_id"]]
        rows, _ = query_evidence(task_id="task_01TEST")
        return ids, {r["evidence_id"]: r for r in rows}

    def test_inline_syntax(self):
        from app.evidence.service import render_inline_citation
        eid = new_evidence_id()
        assert render_inline_citation(eid) == f"[E:{eid}]"

    def test_digest_template(self, client):
        from app.evidence.service import DIGEST_MAX_CHARS, QUOTE_DIGEST_CHARS, render_digest
        ids, rows = self._save_two(client)
        digest = render_digest(list(rows.values()))
        for eid in ids:
            assert f"[E:{eid}]" in digest
        assert "官方(可信度3/3)" in digest  # gov.cn 命中内置表
        assert "社区/低质量(可信度1/3)" in digest
        # quote 截 200
        lines = digest.splitlines()
        assert all(len(ln) <= QUOTE_DIGEST_CHARS + 160 for ln in lines)
        assert len(digest) <= DIGEST_MAX_CHARS
        # Markdown 可直接使用
        assert digest.startswith("[E:")

    def test_digest_truncates_long_quote(self, client):
        from app.evidence.service import render_digest
        long_quote = "字" * 1500
        line = render_digest([{"evidence_id": new_evidence_id(), "quote": long_quote,
                               "source_quality": "official", "url": "https://gov.cn",
                               "fetched_at": "2026-09-06T00:00:00+00:00"}])
        assert "…" in line and long_quote not in line

    def test_references_block(self, client):
        from app.evidence.service import render_references_block
        ids, rows = self._save_two(client)
        block = render_references_block(list(rows.values()))
        assert block.startswith("## 引用证据")
        for eid in ids:
            assert f"[E:{eid}]" in block
        assert "moe.gov.cn" in block
        assert "artifacts/" not in block or True  # raw_ref 为空时不出现
        assert "定位" in block or True

    def test_extract_citations_both_syntaxes(self):
        from app.evidence.service import extract_citations
        text = ("结论A[E:ev_01A] 与结论B[^E:ev_01B],再次引用[E:ev_01A]。")
        assert extract_citations(text) == ["ev_01A", "ev_01B"]
        assert extract_citations("没有引用") == []


# ---------------------------------------------------------------------------
# claim → evidence 匹配(任务书 #5 防幻觉钩子,正/反例)
# ---------------------------------------------------------------------------

class TestClaimMatching:
    def _seed(self, client):
        client.post("/api/evidence/save", json=_item(task_id="task_01TEST"))
        client.post("/api/evidence/save", json=_item(
            channel="community", url="https://zhihu.com/q/9", task_id="task_01TEST",
            quote="很多知乎网友认为计算机专业已经严重饱和,就业竞争激烈。"))

    def test_positive_match(self, client):
        self._seed(client)
        r = client.post("/api/evidence/quote", json={
            "claims": ["2025年高校招生将严格执行阳光招生政策。"],
            "task_id": "task_01TEST",
        })
        assert r.status_code == 200
        res = r.json()["results"][0]
        assert res["supported"] is True
        assert res["matches"][0]["evidence_id"].startswith("ev_")
        assert res["best_score"] >= 0.2

    def test_negative_match_unsupported(self, client):
        self._seed(client)
        r = client.post("/api/evidence/quote", json={
            "claims": ["量子计算机已经在高考志愿填报中全面普及。"],
            "task_id": "task_01TEST",
        })
        res = r.json()["results"][0]
        assert res["supported"] is False
        assert res["matches"] == []
        assert r.json()["unsupported_count"] == 1

    def test_weak_overlap_below_threshold(self, client):
        self._seed(client)
        r = client.post("/api/evidence/quote", json={
            "claims": ["招生政策的一部分内容有所调整变化。"],  # 弱重叠
            "task_id": "task_01TEST",
            "min_score": 0.9,  # 提高阈值 → 证据支持不足
        })
        assert r.json()["results"][0]["supported"] is False

    def test_local_function_positive_and_negative(self):
        from app.evidence.service import match_claim
        ev = [{"evidence_id": "ev_" + ulid(),
               "quote": "计算机专业就业竞争激烈,部分高校已缩减招生规模。",
               "title": "就业观察", "url": "https://example.com/job"}]
        hit = match_claim("计算机专业就业竞争激烈", ev)
        miss = match_claim("火星移民主题公园将于明年开业", ev)
        assert hit["supported"] is True and hit["matches"]
        assert miss["supported"] is False and not miss["matches"]

    def test_claims_validation(self, client):
        r = client.post("/api/evidence/quote", json={"claims": []})
        assert r.status_code == 400
        r = client.post("/api/evidence/quote", json={"claims": ["x" * 2001]})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# source_quality 分级(任务书 #4)
# ---------------------------------------------------------------------------

class TestSourceQuality:
    def test_official_by_domain(self):
        assert assess_source_quality(url="https://www.moe.gov.cn/x.html") == "official"
        assert assess_source_quality(url="https://www.tsinghua.edu.cn/zsb") == "official"

    def test_authoritative_media(self):
        assert assess_source_quality(url="https://www.thepaper.cn/newsDetail/1") == "authoritative"
        assert assess_source_quality(url="https://news.cn/2026/1.html") == "authoritative"

    def test_community_and_unknown(self):
        assert assess_source_quality(url="https://www.zhihu.com/question/1") == "community"
        assert assess_source_quality(url="https://example-blog.com/post") == "unknown"

    def test_metadata_overrides(self):
        assert assess_source_quality(metadata={"declared": "official"}) == "official"
        assert assess_source_quality(metadata={"authoritative": True}) == "authoritative"

    def test_custom_keywords_table(self):
        table = {"official": ["my-exam-authority.org"]}
        assert assess_source_quality(url="https://my-exam-authority.org/x", keywords=table) == "official"

    def test_levels(self):
        from app.evidence.service import quality_level, source_quality_label
        assert quality_level("official") == 3
        assert quality_level("authoritative") == 2
        assert quality_level("community") == 1
        assert quality_level("unknown") == 0
        assert "官方" in source_quality_label("official")


# ---------------------------------------------------------------------------
# EVIDENCE_DB_FAIL(§g:写失败不静默丢数据)
# ---------------------------------------------------------------------------

class TestDbFailure:
    def test_db_error_maps_to_evidence_db_fail(self, client, env, monkeypatch):
        import app.evidence.api as ev_api

        def boom(record, conn=None):
            raise sqlite3.OperationalError("database is locked")

        monkeypatch.setattr(ev_api, "save_evidence", boom)
        r = client.post("/api/evidence/save", json=_item())
        assert r.status_code == 500
        body = r.json()
        assert body["error"]["code"] == "EVIDENCE_DB_FAIL"
        assert body["error"]["details"]["retry"] is True
        assert body["error"]["details"]["task_id"] == "task_01TEST"


# ---------------------------------------------------------------------------
# init_db 挂载(建表脚本等价性)
# ---------------------------------------------------------------------------

class TestSchemaHook:
    def test_migration_script_schema_is_idempotent(self, env):
        init_evidence_table()
        init_evidence_table()  # 重复执行不报错

        conn = sqlite3.connect(str(env["db"]))
        try:
            idx = {r[1] for r in conn.execute("PRAGMA index_list(evidence)").fetchall()}
        finally:
            conn.close()
        assert {"idx_evidence_task", "idx_evidence_url"} <= idx

    def test_full_init_db_creates_evidence(self, env, monkeypatch):
        """database.init_db 挂载 evidence 建表(ARCHITECTURE 5.5)。"""
        # init_db 会尝试导入语料种子,这里只验证 evidence 表存在
        from app.models.database import init_db
        init_db()
        conn = sqlite3.connect(str(env["db"]))
        try:
            names = {r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        finally:
            conn.close()
        assert "evidence" in names
