"""WebBridge 证据层(AGENT_02 唯一真源,CONTRACT §c / §e.4 / §f / §g)。

包结构(任务书交付物):
  schema.py      —— evidence 表 DDL、契约常量、ULID/evidence_id、字段规范化
  repository.py  —— 建表 + CRUD(save 幂等/get/query)+ raw_ref 旁路读写(§f)
  service.py     —— source_quality 分级、浓缩摘录/引用格式渲染、claim→evidence 匹配
  api.py         —— FastAPI router(/api/evidence/save|query|{id}|quote)

兼容层(ARCHITECTURE 5.5 归属路径,均为再导出,勿在其中写逻辑):
  app/models/evidence.py —— deep_research_pipeline / report / migrate 脚本等旧 import 路径
  app/api/evidence.py    —— agent7_report_writer / test_pipeline 等旧 import 路径
"""
from .api import router  # noqa: F401
from .repository import (  # noqa: F401
    get_evidence,
    init_evidence_table,
    query_evidence,
    read_raw_ref,
    resolve_raw_ref,
    save_evidence,
)
from .schema import (  # noqa: F401
    CHANNELS,
    EVIDENCE_SCHEMA_SQL,
    LOCATOR_TYPES,
    QUOTE_MAX_CHARS,
    SOURCE_QUALITIES,
    is_valid_evidence_id,
    new_evidence_id,
    normalize_fetched_at,
    normalize_locator,
    now_iso_utc,
    ulid,
)
from .service import (  # noqa: F401
    assess_source_quality,
    extract_citations,
    match_claim,
    match_claims,
    quality_level,
    render_digest,
    render_inline_citation,
    render_references_block,
    source_quality_label,
)

__all__ = [
    "router",
    # repository
    "get_evidence", "init_evidence_table", "query_evidence", "read_raw_ref",
    "resolve_raw_ref", "save_evidence",
    # schema
    "CHANNELS", "EVIDENCE_SCHEMA_SQL", "LOCATOR_TYPES", "QUOTE_MAX_CHARS",
    "SOURCE_QUALITIES", "is_valid_evidence_id", "new_evidence_id",
    "normalize_fetched_at", "normalize_locator", "now_iso_utc", "ulid",
    # service
    "assess_source_quality", "extract_citations", "match_claim", "match_claims",
    "quality_level", "render_digest", "render_inline_citation",
    "render_references_block", "source_quality_label",
]
