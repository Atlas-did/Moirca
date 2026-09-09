"""evidence repository(CONTRACT §c.1 / §f,AGENT_02 唯一真源)。

职责:
  - evidence 表建表(幂等;也被 app.models.database.init_db 挂载)
  - CRUD:save(幂等,靠 evidence_id)/ get / query
  - raw_ref 旁路文件解析与读取(§f,防目录穿越;大内容不进 SQLite)

不做:参数校验(见 schema.py 的 normalize_*/validate_,API 层调用)、
质量分级与引用渲染(见 service.py)。
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .schema import EVIDENCE_SCHEMA_SQL

# ---------------------------------------------------------------------------
# raw_ref 旁路文件读取(§f;GET /api/evidence/{id} 回查原文用)
# ---------------------------------------------------------------------------

_RAW_READ_MAX_BYTES = 2 * 1024 * 1024  # 单次回查最多读 2MB,防一次性吞大文件


def resolve_raw_ref(raw_ref: Optional[str]) -> Optional[Path]:
    """把相对 raw_ref 解析为 artifacts 根下的绝对路径;非法/越界返回 None。

    artifacts 根:env WEBBRIDGE_ARTIFACTS_DIR(默认 <repo>/daemon/artifacts,§f)。
    """
    from ..config import Config  # 惰性导入,便于测试 monkeypatch

    if not raw_ref:
        return None
    ref = str(raw_ref).replace("\\", "/")
    if ref.startswith("artifacts/"):
        ref = ref[len("artifacts"):]
    ref = ref.lstrip("/")
    if not ref:
        return None
    parts = Path(ref).parts
    if ".." in parts or Path(ref).is_absolute():
        return None
    root = Path(getattr(Config, "EVIDENCE_ARTIFACTS_DIR", "artifacts")).resolve()
    path = (root / ref).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path


def read_raw_ref(raw_ref: Optional[str]) -> Dict[str, Any]:
    """读取旁路文件内容。返回 {available, path, content, truncated, bytes, reason}。"""
    path = resolve_raw_ref(raw_ref)
    if path is None:
        return {"available": False, "path": raw_ref, "content": None,
                "truncated": False, "bytes": 0, "reason": "invalid_ref"}
    if not path.is_file():
        return {"available": False, "path": str(path), "content": None,
                "truncated": False, "bytes": 0, "reason": "file_missing"}
    size = path.stat().st_size
    with open(path, "rb") as f:
        data = f.read(_RAW_READ_MAX_BYTES)
    return {
        "available": True,
        "path": str(path),
        "content": data.decode("utf-8", errors="replace"),
        "truncated": size > len(data),
        "bytes": size,
        "reason": None,
    }


# ---------------------------------------------------------------------------
# 仓储(CRUD)
# ---------------------------------------------------------------------------

def init_evidence_table(conn: Optional[sqlite3.Connection] = None) -> None:
    """建 evidence 表 + 索引(IF NOT EXISTS,幂等)。可独立调用,也被 init_db 挂载。"""
    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        conn.executescript(EVIDENCE_SCHEMA_SQL)
        conn.commit()
    finally:
        if own:
            conn.close()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    record = dict(row)
    try:
        record["locator"] = json.loads(record.get("locator") or "{}")
    except (json.JSONDecodeError, TypeError):
        record["locator"] = {"type": "text_offset", "value": str(record.get("locator") or "")}
    return record


def _save_with_conn(conn: sqlite3.Connection, record: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """写入单条。返回 (row, created)。evidence_id 已存在时不覆盖(幂等)。"""
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO evidence (
            evidence_id, channel, url, title, fetched_at, source_quality,
            quote, locator, raw_ref, task_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record["evidence_id"], record["channel"], record["url"], record["title"],
            record["fetched_at"], record["source_quality"], record["quote"],
            record["locator"], record["raw_ref"], record["task_id"], record["created_at"],
        ),
    )
    created = cur.rowcount > 0
    conn.commit()
    row = conn.execute(
        "SELECT * FROM evidence WHERE evidence_id = ?", (record["evidence_id"],)
    ).fetchone()
    return _row_to_dict(row), created


def save_evidence(record: Dict[str, Any],
                  conn: Optional[sqlite3.Connection] = None) -> Tuple[Dict[str, Any], bool]:
    """写入一条证据(幂等,靠 evidence_id)。

    record 需含 evidence_id/channel/url/quote/fetched_at/created_at,
    其余字段可缺省(title/source_quality/locator/raw_ref/task_id)。
    DB 失败向上抛 sqlite3.Error,由 API 层转 EVIDENCE_DB_FAIL,不静默丢数据。
    """
    if conn is not None:
        return _save_with_conn(conn, record)
    from ..models.database import get_connection
    conn = get_connection()
    try:
        return _save_with_conn(conn, record)
    finally:
        conn.close()


def get_evidence(evidence_id: str,
                 conn: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    """按 evidence_id 回查单条(含原文 quote;旁路内容走 read_raw_ref)。"""
    sql = "SELECT * FROM evidence WHERE evidence_id = ?"
    if conn is not None:
        row = conn.execute(sql, (evidence_id,)).fetchone()
        return _row_to_dict(row) if row else None
    from ..models.database import get_connection
    conn = get_connection()
    try:
        row = conn.execute(sql, (evidence_id,)).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def query_evidence(
    task_id: Optional[str] = None,
    channel: Optional[str] = None,
    url: Optional[str] = None,
    q: Optional[str] = None,
    evidence_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    conn: Optional[sqlite3.Connection] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    """检索证据。q 对 quote/title/url 做 LIKE;恒返回 (items, total),空也是 200 语义。"""
    conditions, params = [], []
    if evidence_id:
        conditions.append("evidence_id = ?")
        params.append(evidence_id)
    if task_id:
        conditions.append("task_id = ?")
        params.append(task_id)
    if channel:
        conditions.append("channel = ?")
        params.append(channel)
    if url:
        conditions.append("url = ?")
        params.append(url)
    if q:
        conditions.append("(quote LIKE ? OR title LIKE ? OR url LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])
    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    own = conn is None
    if own:
        from ..models.database import get_connection
        conn = get_connection()
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM evidence" + where, params
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM evidence" + where
            + " ORDER BY fetched_at DESC, evidence_id DESC LIMIT ? OFFSET ?",
            params + [int(limit), int(offset)],
        ).fetchall()
        return [_row_to_dict(r) for r in rows], int(total)
    finally:
        if own:
            conn.close()
