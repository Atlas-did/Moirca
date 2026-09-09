"""证据层 API 兼容层(ARCHITECTURE 5.5 归属路径,AGENT_02)。

真源已迁至 app/evidence/api.py(router)与 app/evidence/service.py(引用渲染、
claim 匹配)。本文件仅为既有 import 路径(agent7_report_writer 的
`from ..api.evidence import ...`、test_pipeline 的 monkeypatch 目标)保留
再导出,勿在此新增逻辑。
"""
from __future__ import annotations

from ..evidence.api import (  # noqa: F401
    MAX_BATCH_ITEMS,
    MAX_CLAIMS,
    MAX_QUERY_LIMIT,
    ClaimMatchRequest,
    EvidenceItemIn,
    EvidenceSaveRequest,
    router,
)
from ..evidence.service import (  # noqa: F401
    DIGEST_MAX_CHARS,
    DIGEST_MAX_ITEMS,
    DIGEST_TEMPLATE,
    QUOTE_DIGEST_CHARS,
    extract_citations,
    match_claim,
    match_claims,
    render_digest,
    render_inline_citation,
    render_references_block,
)
