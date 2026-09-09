"""evidence schema(CONTRACT §c.1 / §e.4 / §h,AGENT_02 唯一真源)。

职责:
  - evidence 表 DDL(CONTRACT §c.1 逐字段照抄)与契约常量
  - evidence_id 生成('ev_' + ULID 26 位,时间有序)与格式校验
  - 字段规范化/校验(fetched_at / locator / url / raw_ref)

不做:读写(见 repository.py)、质量分级与引用渲染(见 service.py)、
采集(daemon/扩展)、报告表(AGENT_05 只写 evidence_id 外键)。
"""
from __future__ import annotations

import json
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

# ---------------------------------------------------------------------------
# 契约常量(CONTRACT §c.1 / §e.4)——字段与枚举不得自行增删
# ---------------------------------------------------------------------------

CHANNELS: Tuple[str, ...] = ("page_qa", "deep_research", "controlled_browse", "manual")
SOURCE_QUALITIES: Tuple[str, ...] = ("official", "authoritative", "community", "unknown")
LOCATOR_TYPES: Tuple[str, ...] = ("css", "xpath", "text_offset", "ref")

QUOTE_MAX_CHARS = 2000  # §h:evidence.quote 上限(backend 校验,契约硬性)

EVIDENCE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id    TEXT PRIMARY KEY,            -- 'ev_' + ULID(26 位,时间有序)
  channel        TEXT NOT NULL CHECK (channel IN
                   ('page_qa','deep_research','controlled_browse','manual')),
  url            TEXT NOT NULL,
  title          TEXT DEFAULT '',
  fetched_at     TEXT NOT NULL,               -- ISO8601 含时区,采集时刻,禁止 now() 兜底造假
  source_quality TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (source_quality IN ('official','authoritative','community','unknown')),
  quote          TEXT NOT NULL,               -- 原文引用,≤2000 字符,保留原文不清洗
  locator        TEXT NOT NULL DEFAULT '{}',  -- JSON:{type:'css'|'xpath'|'text_offset'|'ref', value:str, page_index?:int}
  raw_ref        TEXT,                        -- 大字段旁路:'artifacts/{task_id}/{file}'(相对 daemon 根,§f)
  task_id        TEXT DEFAULT '',
  created_at     TEXT NOT NULL                -- 入库时刻
);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_url  ON evidence(url);
CREATE INDEX IF NOT EXISTS idx_evidence_fetched_at ON evidence(fetched_at);
"""


# ---------------------------------------------------------------------------
# ULID('ev_' 前缀,26 位 Crockford Base32,时间有序;进程内单调递增)
# ---------------------------------------------------------------------------

_ULID_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ULID_LOCK = threading.Lock()
_ULID_LAST: Tuple[int, int] = (0, 0)  # (timestamp_ms, randomness)
_ULID_RE = re.compile(r"^ev_[0-9A-HJKMNP-TV-Z]{26}$")


def _ulid_encode(ts_ms: int, rnd: int) -> str:
    value = ((ts_ms & ((1 << 48) - 1)) << 80) | (rnd & ((1 << 80) - 1))
    chars = []
    for shift in range(125, -1, -5):
        chars.append(_ULID_CROCKFORD[(value >> shift) & 0x1F])
    return "".join(chars)


def ulid() -> str:
    """生成 26 位 ULID(同一毫秒内单调递增)。"""
    global _ULID_LAST
    with _ULID_LOCK:
        ts = int(time.time() * 1000)
        last_ts, last_rnd = _ULID_LAST
        if ts <= last_ts:
            ts = last_ts
            rnd = (last_rnd + 1) & ((1 << 80) - 1)
            if rnd == 0:  # 随机位溢出,推进到下一毫秒
                ts += 1
        else:
            rnd = secrets.randbits(80)
        _ULID_LAST = (ts, rnd)
    return _ulid_encode(ts, rnd)


def new_evidence_id() -> str:
    return "ev_" + ulid()


def is_valid_evidence_id(evidence_id: str) -> bool:
    return bool(_ULID_RE.match(evidence_id or ""))


# ---------------------------------------------------------------------------
# 字段规范化(校验失败抛 ValueError,由 API 层转 INVALID_PARAMS)
# ---------------------------------------------------------------------------

def normalize_fetched_at(value: Optional[str]) -> str:
    """规范 fetched_at 为 ISO8601 UTC(含时区)。

    - 传入 None/空 → 服务端补真实 now()(§e.4:可空则服务端补真实 now())
    - 传入值必须可解析;naive(无时区)按 UTC 补 +00:00
    - 绝不把调用方已给的采集时刻替换成 now()
    """
    if value is None or not str(value).strip():
        return datetime.now(timezone.utc).isoformat(timespec="seconds")
    raw = str(value).strip()
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"fetched_at 不是合法 ISO8601: {raw!r}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_locator(locator: Optional[Any]) -> str:
    """locator 规范化为 JSON 文本;非法类型/未知 type 抛 ValueError。"""
    if locator is None or locator == "":
        return "{}"
    if isinstance(locator, str):
        try:
            locator = json.loads(locator)
        except json.JSONDecodeError as exc:
            raise ValueError("locator 必须是 JSON 对象") from exc
    if not isinstance(locator, dict):
        raise ValueError("locator 必须是 JSON 对象")
    ltype = locator.get("type")
    if ltype is not None and ltype not in LOCATOR_TYPES:
        raise ValueError(f"locator.type 必须是 {LOCATOR_TYPES} 之一,得到 {ltype!r}")
    return json.dumps(locator, ensure_ascii=False, sort_keys=True)


def _validate_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ValueError("url 必填")
    if not re.match(r"^https?://", url):
        raise ValueError("url 必须以 http(s):// 开头")
    return url


def _validate_raw_ref(raw_ref: Optional[str]) -> Optional[str]:
    """§f:raw_ref 用相对形式 'artifacts/{task_id}/{文件名}',跨机可迁移。"""
    if raw_ref is None or not str(raw_ref).strip():
        return None
    ref = str(raw_ref).strip().replace("\\", "/")
    if ref.startswith("file://"):
        raise ValueError("raw_ref 必须是相对形式 artifacts/{task_id}/{file},不要传 file:// 绝对路径")
    if not ref.startswith("artifacts/"):
        raise ValueError("raw_ref 必须以 'artifacts/' 开头(§f 相对形式)")
    parts = [p for p in ref.split("/") if p not in ("", ".")]
    if ".." in parts or len(parts) != 3:
        raise ValueError("raw_ref 形如 artifacts/{task_id}/{文件名},且不允许 '..'")
    return "/".join(parts)
