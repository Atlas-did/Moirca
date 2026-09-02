"""
SQLite 数据库管理（MVP阶段）
后续迁移到 PostgreSQL + pgvector
"""
import sqlite3
import os
import json
from pathlib import Path
from ..config import Config


project_root = Path(__file__).resolve().parents[3]


def get_db_path() -> str:
    return Config.DATABASE_PATH


def get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    # timeout: 等待写锁的最大秒数，缓解 SQLite 并发写 "database is locked"
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _write_with_retry(cursor, sql: str, rows, *, retries: int = 5) -> None:
    """并发写重试封装：SQLite 写锁竞争时短暂退避后重试 execute/executemany。"""
    import time as _time
    for attempt in range(retries):
        try:
            cursor.executemany(sql, rows)
            return
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower() and "busy" not in str(e).lower():
                raise
            if attempt == retries - 1:
                raise
            _time.sleep(0.1 * (2 ** attempt))


def init_db():
    """初始化所有表"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        -- 用户表
        CREATE TABLE IF NOT EXISTS users (
            user_id         TEXT PRIMARY KEY,
            device_hash     TEXT NOT NULL UNIQUE,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            preferences     TEXT,
            narrative       TEXT,
            keywords        TEXT
        );

        -- 学生档案表
        CREATE TABLE IF NOT EXISTS student_profiles (
            profile_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            grade_year      INTEGER NOT NULL,
            province        TEXT NOT NULL,
            exam_type       TEXT NOT NULL DEFAULT 'general',
            target_cities   TEXT,
            family_bg       TEXT,
            economic_tier   TEXT DEFAULT 'unknown',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, grade_year)
        );

        -- 成绩表
        CREATE TABLE IF NOT EXISTS scores (
            score_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id      INTEGER NOT NULL REFERENCES student_profiles(profile_id) ON DELETE CASCADE,
            subject         TEXT NOT NULL,
            score           REAL NOT NULL,
            full_mark       REAL NOT NULL DEFAULT 150,
            percentile      REAL,
            exam_date       DATE,
            UNIQUE(profile_id, subject)
        );

        -- 专业表
        CREATE TABLE IF NOT EXISTS professions (
            profession_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            code            TEXT UNIQUE,
            name            TEXT NOT NULL,
            category        TEXT NOT NULL,
            discipline      TEXT,
            duration        INTEGER DEFAULT 4,
            degree_type     TEXT,
            status          TEXT DEFAULT 'active',
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 公开语料：kkdaxue 社区帖子
        CREATE TABLE IF NOT EXISTS kkdaxue_posts (
            post_id         INTEGER PRIMARY KEY,
            major           TEXT,
            school          TEXT,
            education       TEXT,
            work_exp        TEXT,
            content         TEXT NOT NULL,
            review_status   INTEGER DEFAULT 1,
            view_num        INTEGER DEFAULT 0,
            thumb_num       INTEGER DEFAULT 0,
            user_id         INTEGER,
            create_time     TEXT,
            update_time     TEXT,
            is_delete       INTEGER DEFAULT 0,
            has_thumb       INTEGER DEFAULT 0
        );

        -- 公开分数线/位次数据
        CREATE TABLE IF NOT EXISTS public_scorelines (
            scoreline_id    TEXT PRIMARY KEY,
            province        TEXT NOT NULL,
            subject_type    TEXT NOT NULL,
            year            INTEGER NOT NULL,
            school          TEXT NOT NULL,
            major           TEXT NOT NULL,
            batch           TEXT NOT NULL,
            lowest_score    REAL NOT NULL,
            lowest_rank     INTEGER,
            plan_count      INTEGER,
            source          TEXT,
            notes           TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 独家数据表（护城河1核心）
        CREATE TABLE IF NOT EXISTS community_data (
            data_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            school          TEXT NOT NULL,
            major           TEXT NOT NULL,
            rank_pct        TEXT,
            career_top3     TEXT,
            transfer_diff   TEXT,
            hidden_bar      TEXT,
            provider        TEXT,
            is_verified     BOOLEAN DEFAULT FALSE,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(school, major, provider)
        );

        -- Agent输出表
        CREATE TABLE IF NOT EXISTS agent_outputs (
            output_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            agent_name      TEXT NOT NULL,
            profession_code TEXT,
            output_json     TEXT NOT NULL,
            confidence      REAL DEFAULT 0.5,
            source_urls     TEXT,
            freshness_score REAL DEFAULT 100,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 融合结果表
        CREATE TABLE IF NOT EXISTS fusion_results (
            result_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            profession_id   INTEGER NOT NULL REFERENCES professions(profession_id),
            match_score     REAL NOT NULL,
            breakdown       TEXT NOT NULL,
            scenario_optimistic TEXT,
            scenario_neutral    TEXT,
            scenario_pessimistic TEXT,
            narrative_match REAL DEFAULT 0.5,
            final_rank      INTEGER,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 报告表
        CREATE TABLE IF NOT EXISTS reports (
            report_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            profile_id      INTEGER NOT NULL REFERENCES student_profiles(profile_id),
            report_type     TEXT DEFAULT 'full',
            content_md      TEXT NOT NULL,
            soul_questions  TEXT,
            risk_warnings   TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_agent_outputs_user ON agent_outputs(user_id);
        CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent ON agent_outputs(agent_name);
        CREATE INDEX IF NOT EXISTS idx_fusion_results_user ON fusion_results(user_id);
        CREATE INDEX IF NOT EXISTS idx_fusion_results_rank ON fusion_results(final_rank);
        CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_community_data_school ON community_data(school);
        CREATE INDEX IF NOT EXISTS idx_community_data_major ON community_data(major);
        CREATE INDEX IF NOT EXISTS idx_kkdaxue_major ON kkdaxue_posts(major);
        CREATE INDEX IF NOT EXISTS idx_kkdaxue_school ON kkdaxue_posts(school);
        CREATE INDEX IF NOT EXISTS idx_public_scorelines_province ON public_scorelines(province);
        CREATE INDEX IF NOT EXISTS idx_public_scorelines_school ON public_scorelines(school);
        CREATE INDEX IF NOT EXISTS idx_public_scorelines_major ON public_scorelines(major);
    """)

    # 如果公开语料表为空，则从本地抓取文件导入
    cursor.execute("SELECT COUNT(*) FROM kkdaxue_posts")
    total_posts = cursor.fetchone()[0]
    if total_posts == 0:
        candidates = [
            Path(project_root) / 'backend' / 'data' / 'crawled' / 'kkdaxue_all.json',
            Path(project_root) / 'backend' / 'data' / 'crawled' / 'kkdaxue_sample.json',
        ]
        source_path = next((p for p in candidates if p.exists()), None)
        if source_path:
            with open(source_path, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            rows = []
            for item in raw:
                post_id = item.get('id') or item.get('post_id')
                content = item.get('content') or ''
                if not post_id or not content:
                    continue
                rows.append((
                    int(post_id),
                    item.get('major', ''),
                    item.get('school', ''),
                    item.get('education', item.get('degree', '')),
                    item.get('workExp', item.get('work_years', '')),
                    content,
                    int(item.get('reviewStatus', 1) or 1),
                    int(item.get('viewNum', item.get('view_num', 0)) or 0),
                    int(item.get('thumbNum', item.get('thumb_num', 0)) or 0),
                    int(item.get('userId', item.get('user_id', 0)) or 0),
                    item.get('createTime', item.get('create_time', '')),
                    item.get('updateTime', item.get('update_time', '')),
                    int(item.get('isDelete', item.get('is_delete', 0)) or 0),
                    int(bool(item.get('hasThumb', item.get('has_thumb', False)))),
                ))
            if rows:
                _write_with_retry(
                    cursor,
                    """
                    INSERT OR IGNORE INTO kkdaxue_posts (
                        post_id, major, school, education, work_exp, content,
                        review_status, view_num, thumb_num, user_id,
                        create_time, update_time, is_delete, has_thumb
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )

    # 如果公开分数线表为空，则导入本地种子数据
    cursor.execute("SELECT COUNT(*) FROM public_scorelines")
    scoreline_count = cursor.fetchone()[0]
    if scoreline_count == 0:
        seed_path = Path(project_root) / 'backend' / 'data' / 'public_scorelines_seed.json'
        if seed_path.exists():
            with open(seed_path, 'r', encoding='utf-8') as f:
                rows = json.load(f)
            payload = []
            for item in rows:
                if not item.get('scoreline_id'):
                    continue
                payload.append((
                    item['scoreline_id'],
                    item.get('province', ''),
                    item.get('subject_type', ''),
                    int(item.get('year', 2024)),
                    item.get('school', ''),
                    item.get('major', ''),
                    item.get('batch', '本科批'),
                    float(item.get('lowest_score', 0)),
                    int(item['lowest_rank']) if item.get('lowest_rank') is not None else None,
                    int(item['plan_count']) if item.get('plan_count') is not None else None,
                    item.get('source', 'seed'),
                    item.get('notes', ''),
                ))
            if payload:
                _write_with_retry(
                    cursor,
                    """
                    INSERT OR IGNORE INTO public_scorelines (
                        scoreline_id, province, subject_type, year, school, major, batch,
                        lowest_score, lowest_rank, plan_count, source, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    payload,
                )

    conn.commit()
    conn.close()
    return True
