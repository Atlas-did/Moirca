"""报告/任务表 DDL 与仓储(CONTRACT §c.2 / §e.3,AGENT_05 所有)。

- task_id: 'task_' + ULID;report_id: 'rep_' + ULID(复用 AGENT_02 的 ULID 实现)
- report_citations.evidence_ids 为 JSON 数组,元素是 evidence 表外键;
  禁止把 quote/原文复制进本表(§c.2 红线)。
- 建表幂等(IF NOT EXISTS),惰性触发,不改 models/database.py。
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from ..models.evidence import is_valid_evidence_id, now_iso_utc, ulid


def new_task_id() -> str:
    return "task_" + ulid()


def new_report_id() -> str:
    return "rep_" + ulid()


REPORT_TASKS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS deep_research_tasks (
  task_id        TEXT PRIMARY KEY,            -- 'task_' + ULID
  query          TEXT NOT NULL,               -- 研究问题(≤2000)
  gaokao_ctx     TEXT NOT NULL DEFAULT '{}',  -- JSON:{province,score,subject,rank}
  budget         TEXT NOT NULL DEFAULT '{}',  -- JSON:{max_minutes,max_evidence}
  status         TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed')),
  progress       REAL NOT NULL DEFAULT 0,     -- 0.0 ~ 1.0
  agents_done    TEXT NOT NULL DEFAULT '[]',  -- JSON 数组:已完成节点名
  evidence_count INTEGER NOT NULL DEFAULT 0,
  session_id     TEXT NOT NULL DEFAULT '',    -- SessionManager 会话(JSON 断点续跑)
  report_id      TEXT NOT NULL DEFAULT '',    -- 完成后指向 deep_research_reports
  error          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dr_tasks_status ON deep_research_tasks(status);
"""

REPORT_REPORTS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS deep_research_reports (
  report_id      TEXT PRIMARY KEY,            -- 'rep_' + ULID
  task_id        TEXT NOT NULL DEFAULT '',
  query          TEXT NOT NULL DEFAULT '',
  content_md     TEXT NOT NULL,               -- Markdown 说明书(含 [E:id] 行内引用)
  mode           TEXT NOT NULL DEFAULT 'rule',-- rule(降级) | llm
  rounds_used    INTEGER NOT NULL DEFAULT 0,  -- ReACT 轮次(≤3)
  evidence_count INTEGER NOT NULL DEFAULT 0,  -- 被引用的证据数
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dr_reports_task ON deep_research_reports(task_id);
"""

REPORT_CITATIONS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS report_citations (
  citation_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     TEXT NOT NULL,
  claim_text    TEXT NOT NULL,               -- 结论句原文(不含引用标记)
  evidence_ids  TEXT NOT NULL DEFAULT '[]',  -- JSON 数组:evidence 表外键(不复制 quote)
  supported     INTEGER NOT NULL DEFAULT 0,  -- 0=【无证据】 1=有证据支撑
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_citations_report ON report_citations(report_id);
"""

_TABLES_READY = False  # 兼容旧导出名(实际建表每次幂等执行,不再依赖此标志)


def init_report_tables(conn: Optional[sqlite3.Connection] = None) -> None:
    """幂等建表(CREATE IF NOT EXISTS,可跨不同 DB 文件重复执行,无副作用)。"""
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        conn.executescript(REPORT_TASKS_SCHEMA_SQL)
        conn.executescript(REPORT_REPORTS_SCHEMA_SQL)
        conn.executescript(REPORT_CITATIONS_SCHEMA_SQL)
        conn.commit()
    finally:
        if own:
            conn.close()


def _ensure(conn: sqlite3.Connection) -> None:
    # 不做进程级缓存:测试会切换 DATABASE_PATH,CREATE IF NOT EXISTS 本身幂等且廉价
    init_report_tables(conn)


# ---------------------------------------------------------------------------
# 任务表
# ---------------------------------------------------------------------------

def create_task(query: str,
                gaokao_ctx: Optional[Dict[str, Any]] = None,
                budget: Optional[Dict[str, Any]] = None,
                task_id: Optional[str] = None,
                conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    now = now_iso_utc()
    task = {
        "task_id": task_id or new_task_id(),
        "query": query,
        "gaokao_ctx": json.dumps(gaokao_ctx or {}, ensure_ascii=False),
        "budget": json.dumps(budget or {}, ensure_ascii=False),
        "status": "queued",
        "progress": 0.0,
        "agents_done": "[]",
        "evidence_count": 0,
        "session_id": "",
        "report_id": "",
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        conn.execute(
            """INSERT INTO deep_research_tasks
               (task_id, query, gaokao_ctx, budget, status, progress, agents_done,
                evidence_count, session_id, report_id, error, created_at, updated_at)
               VALUES (:task_id,:query,:gaokao_ctx,:budget,:status,:progress,:agents_done,
                :evidence_count,:session_id,:report_id,:error,:created_at,:updated_at)""",
            task,
        )
        conn.commit()
    finally:
        if own:
            conn.close()
    return task


def update_task(task_id: str,
                status: Optional[str] = None,
                progress: Optional[float] = None,
                agents_done: Optional[List[str]] = None,
                evidence_count: Optional[int] = None,
                session_id: Optional[str] = None,
                report_id: Optional[str] = None,
                error: Optional[str] = None,
                conn: Optional[sqlite3.Connection] = None) -> None:
    sets, params = ["updated_at = ?"], [now_iso_utc()]
    if status is not None:
        sets.append("status = ?")

        params.append(status)
    if progress is not None:
        sets.append("progress = ?")

        params.append(round(max(0.0, min(1.0, progress)), 4))
    if agents_done is not None:
        sets.append("agents_done = ?")

        params.append(json.dumps(agents_done, ensure_ascii=False))
    if evidence_count is not None:
        sets.append("evidence_count = ?")

        params.append(int(evidence_count))
    if session_id is not None:
        sets.append("session_id = ?")

        params.append(session_id)
    if report_id is not None:
        sets.append("report_id = ?")

        params.append(report_id)
    if error is not None:
        sets.append("error = ?")

        params.append(error)
    params.append(task_id)

    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        conn.execute(
            f"UPDATE deep_research_tasks SET {', '.join(sets)} WHERE task_id = ?", params)
        conn.commit()
    finally:
        if own:
            conn.close()


def _task_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    for key in ("gaokao_ctx", "budget", "agents_done"):
        try:
            d[key] = json.loads(d.get(key) or ("{}" if key != "agents_done" else "[]"))
        except (json.JSONDecodeError, TypeError):
            d[key] = {} if key != "agents_done" else []
    return d


def get_task(task_id: str,
             conn: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        row = conn.execute(
            "SELECT * FROM deep_research_tasks WHERE task_id = ?", (task_id,)).fetchone()
        return _task_row_to_dict(row) if row else None
    finally:
        if own:
            conn.close()


# ---------------------------------------------------------------------------
# 报告表 + 引用表
# ---------------------------------------------------------------------------

def save_report(task_id: str,
                query: str,
                content_md: str,
                mode: str,
                rounds_used: int,
                claims: List[Dict[str, Any]],
                report_id: Optional[str] = None,
                conn: Optional[sqlite3.Connection] = None) -> Tuple[str, int]:
    """落报告 + 逐 claim 引用行。claims 元素: {text, evidence_ids, supported}。

    返回 (report_id, citation_rows)。存入前校验每个 evidence_id 形状
    (ev_ + ULID);悬空(库里不存在)由调用方(Agent7)负责,此处只挡形状非法。
    """
    rid = report_id or new_report_id()
    now = now_iso_utc()
    cited_ids: List[str] = []

    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO deep_research_reports
               (report_id, task_id, query, content_md, mode, rounds_used,
                evidence_count, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (rid, task_id or "", query or "", content_md, mode, int(rounds_used),
             0, now),
        )
        rows = []
        for c in claims:
            eids = [str(e) for e in (c.get("evidence_ids") or [])]
            for e in eids:
                if not is_valid_evidence_id(e):
                    raise ValueError(f"report_citations 收到非法 evidence_id:{e!r}")
            for e in eids:
                if e not in cited_ids:
                    cited_ids.append(e)
            rows.append((rid, str(c.get("text") or ""), json.dumps(eids),
                         1 if c.get("supported") else 0, now))
        if rows:
            cur.executemany(
                """INSERT INTO report_citations
                   (report_id, claim_text, evidence_ids, supported, created_at)
                   VALUES (?,?,?,?,?)""", rows)
        cur.execute("UPDATE deep_research_reports SET evidence_count = ? WHERE report_id = ?",
                    (len(cited_ids), rid))
        conn.commit()
    finally:
        if own:
            conn.close()
    return rid, len(cited_ids)


def get_report(report_id: str,
               conn: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    """回查报告(含逐 claim 引用;evidence_ids 为外键数组,quote 一律不存)。"""
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        row = conn.execute(
            "SELECT * FROM deep_research_reports WHERE report_id = ?", (report_id,)
        ).fetchone()
        if row is None:
            return None
        d = dict(row)
        citations = []
        for c in conn.execute(
            "SELECT claim_text, evidence_ids, supported, created_at "
            "FROM report_citations WHERE report_id = ? ORDER BY citation_id",
            (report_id,),
        ).fetchall():
            try:
                eids = json.loads(c["evidence_ids"])
            except (json.JSONDecodeError, TypeError):
                eids = []
            citations.append({
                "claim_text": c["claim_text"],
                "evidence_ids": eids,
                "supported": bool(c["supported"]),
                "created_at": c["created_at"],
            })
        d["citations"] = citations
        return d
    finally:
        if own:
            conn.close()


def get_report_by_task(task_id: str,
                       conn: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        _ensure(conn)
        row = conn.execute(
            "SELECT report_id FROM deep_research_reports WHERE task_id = ? "
            "ORDER BY created_at DESC LIMIT 1", (task_id,)).fetchone()
    finally:
        if own:
            conn.close()
    return get_report(row["report_id"]) if row else None
