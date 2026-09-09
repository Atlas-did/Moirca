"""报告/任务持久层(AGENT_05 专属,CONTRACT §c.2/§e.3)。

表:
  deep_research_tasks     深研异步任务(状态/进度/agents_done/证据计数)
  deep_research_reports   决策说明书正文(Markdown)
  report_citations        逐 claim 的 evidence_id 外键(JSON 数组,**不复制 quote**)

铁律:证据唯一真源是 evidence 表(AGENT_02 所有);本包只写 evidence_id 外键,
不建任何证据表、不复制 quote。表建在现有 data/moirca.db,惰性幂等建表,
不改动 AGENT_02 拥有的 models/database.py。
"""
from .models import (
    REPORT_CITATIONS_SCHEMA_SQL,
    REPORT_TASKS_SCHEMA_SQL,
    init_report_tables,
    save_report,
)
from .service import ReportStore, report_store

__all__ = [
    "REPORT_TASKS_SCHEMA_SQL",
    "REPORT_CITATIONS_SCHEMA_SQL",
    "init_report_tables",
    "save_report",
    "ReportStore",
    "report_store",
]
