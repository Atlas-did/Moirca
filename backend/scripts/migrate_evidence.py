"""
迁移/建表脚本:evidence 表(CONTRACT §c.1,AGENT_02)

用法(在 backend/ 目录下):
    python scripts/migrate_evidence.py            # 使用 DATABASE_PATH(默认 backend/data/moirca.db)
    DATABASE_PATH=/tmp/x.db python scripts/migrate_evidence.py

幂等:CREATE TABLE IF NOT EXISTS,可重复执行;不写任何数据。
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import Config  # noqa: E402
from app.evidence.schema import EVIDENCE_SCHEMA_SQL, QUOTE_MAX_CHARS  # noqa: E402


def main() -> int:
    db_path = Config.DATABASE_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30.0)
    try:
        conn.executescript(EVIDENCE_SCHEMA_SQL)
        conn.commit()
        cols = [r[1] for r in conn.execute("PRAGMA table_info(evidence)").fetchall()]
        idx = [r[1] for r in conn.execute("PRAGMA index_list(evidence)").fetchall()]
    finally:
        conn.close()
    print(f"[evidence] 建表完成:{db_path}")
    print(f"[evidence] 字段({len(cols)}):{', '.join(cols)}")
    print(f"[evidence] 索引:{', '.join(idx)}")
    print(f"[evidence] quote 上限:{QUOTE_MAX_CHARS} 字符;大正文走 raw_ref 旁路(§f)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
