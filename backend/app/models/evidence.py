"""证据层 schema/仓储 兼容层(ARCHITECTURE 5.5 归属路径,AGENT_02)。

真源已迁至 app/evidence/(schema.py + repository.py + service.py + api.py)。
本文件仅为既有 import 路径(deep_research_pipeline、report、migrate 脚本、
旧测试)保留再导出,勿在此新增逻辑。
"""
from __future__ import annotations

from ..evidence.repository import (  # noqa: F401
    get_evidence,
    init_evidence_table,
    query_evidence,
    read_raw_ref,
    resolve_raw_ref,
    save_evidence,
)
from ..evidence.schema import (  # noqa: F401
    CHANNELS,
    EVIDENCE_SCHEMA_SQL,
    LOCATOR_TYPES,
    QUOTE_MAX_CHARS,
    SOURCE_QUALITIES,
    _validate_raw_ref,
    _validate_url,
    is_valid_evidence_id,
    new_evidence_id,
    normalize_fetched_at,
    normalize_locator,
    now_iso_utc,
    ulid,
)
from ..evidence.service import (  # noqa: F401
    DEFAULT_QUALITY_KEYWORDS,
    QUALITY_LABELS,
    QUALITY_LEVELS,
    assess_source_quality,
    quality_level,
    source_quality_label,
)
