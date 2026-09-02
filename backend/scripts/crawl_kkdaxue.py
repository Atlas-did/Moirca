"""
kkdaxue.com（框框大学）数据爬取脚本
网站运营者：取景框看世界（B站UP主）
数据来源：公开 REST API → https://api.kkdaxue.com/api/

核心API:
  POST /api/post/list/page   → 分页获取学长学姐的学习建议（1393条）
  GET  /api/tag/get/map      → 获取专业/学校标签映射

运行: python scripts/crawl_kkdaxue.py
  --mode explore   : 探索API结构，打印样本数据
  --mode crawl     : 抓取全量数据并导入SQLite（默认）
  --mode sample    : 只抓取前20条作为样本
"""
import sys
import os
import json
import time
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Windows UTF-8 编码修复
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import httpx

API_BASE = "https://api.kkdaxue.com/api"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "crawled")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================
# API 客户端
# ============================================

class KkdaxueAPI:
    """框框大学公开API封装"""

    def __init__(self):
        self.client = httpx.Client(
            base_url=API_BASE,
            timeout=30,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Moirca/0.1 (Educational data collection; contact via GitHub)",
                "Origin": "https://www.kkdaxue.com",
                "Referer": "https://www.kkdaxue.com/",
            },
        )

    def get_tags(self) -> dict:
        """获取标签映射（专业分类/学校/学历/经验年限）"""
        r = self.client.get("/tag/get/map")
        r.raise_for_status()
        return r.json()

    def search_posts(self, keyword: str = "", page: int = 1,
                     page_size: int = 10) -> dict:
        """搜索/分页获取投稿（GET请求，参数通过query string）"""
        params = {
            "current": page,
            "pageSize": page_size,
            "sortField": "createTime",
            "sortOrder": "descend",
            "reviewStatus": 1,
        }
        if keyword:
            params["content"] = keyword
        r = self.client.get("/post/list/page", params=params)
        r.raise_for_status()
        return r.json()

    def get_all_posts(self, page_size: int = 50, max_pages: int = None) -> list:
        """分页获取所有投稿"""
        all_posts = []
        page = 1
        while True:
            print(f"  正在获取第 {page} 页...", end=" ")
            try:
                data = self.search_posts(page=page, page_size=page_size)
                records = data.get("data", {}).get("records", [])
                total = data.get("data", {}).get("total", 0)
                all_posts.extend(records)
                print(f"获取 {len(records)} 条 (累计 {len(all_posts)}/{total})")
                if len(records) < page_size:
                    break
                if max_pages and page >= max_pages:
                    break
                page += 1
                time.sleep(0.5)  # 礼貌延迟
            except Exception as e:
                print(f"失败: {e}")
                break
        return all_posts

    def close(self):
        self.client.close()


# ============================================
# 数据解析
# ============================================

def parse_post(post: dict) -> dict:
    """将API返回的post解析为结构化数据"""
    return {
        "post_id": post.get("id"),
        "major": post.get("major", ""),
        "school": post.get("school", ""),
        "degree": post.get("education", ""),  # 学历
        "work_years": post.get("workExp", ""),  # 工作经验
        "content": post.get("content", ""),
        "view_num": post.get("viewNum", 0),
        "thumb_num": post.get("thumbNum", 0),
        "create_time": post.get("createTime", ""),
        "user_id": post.get("userId", ""),
    }


# ============================================
# 导入 SQLite
# ============================================

def import_to_sqlite(posts: list):
    """将解析后的帖子导入Moirca数据库"""
    from app.models.database import get_connection

    conn = get_connection()
    cursor = conn.cursor()

    # 创建框框大学专属数据表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS kkdaxue_posts (
            id INTEGER PRIMARY KEY,
            post_id INTEGER UNIQUE,
            major TEXT,
            school TEXT,
            education TEXT,
            work_years TEXT,
            content TEXT,
            view_num INTEGER DEFAULT 0,
            thumb_num INTEGER DEFAULT 0,
            create_time TEXT,
            user_id TEXT,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    count = 0
    for post in posts:
        parsed = parse_post(post)
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO kkdaxue_posts
                    (post_id, major, school, education, work_years, content, view_num, thumb_num, create_time, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                parsed["post_id"], parsed["major"], parsed["school"],
                parsed["degree"], parsed["work_years"], parsed["content"],
                parsed["view_num"], parsed["thumb_num"],
                parsed["create_time"], parsed["user_id"]
            ))
            if cursor.rowcount > 0:
                count += 1
        except Exception as e:
            print(f"  导入失败 post_id={parsed['post_id']}: {e}")

    conn.commit()
    conn.close()
    print(f"  成功导入 {count} 条新数据（共处理 {len(posts)} 条）")
    return count


# ============================================
# 数据分析
# ============================================

def analyze_posts(posts: list):
    """分析帖子数据分布"""
    parsed = [parse_post(p) for p in posts]

    majors = {}
    schools = {}
    for p in parsed:
        if p["major"]:
            majors[p["major"]] = majors.get(p["major"], 0) + 1
        if p["school"]:
            schools[p["school"]] = schools.get(p["school"], 0) + 1

    print(f"\n  数据概览:")
    print(f"    总帖子数: {len(parsed)}")
    print(f"    涉及专业数: {len(majors)}")
    print(f"    涉及学校数: {len(schools)}")

    print(f"\n  Top 10 热门专业:")
    for major, count in sorted(majors.items(), key=lambda x: -x[1])[:10]:
        print(f"    {major}: {count} 条")

    print(f"\n  Top 10 热门学校:")
    for school, count in sorted(schools.items(), key=lambda x: -x[1])[:10]:
        print(f"    {school}: {count} 条")


# ============================================
# 主入口
# ============================================

def cmd_explore():
    """探索模式：打印API结构和样本数据"""
    api = KkdaxueAPI()

    # 1. 标签映射
    print("=" * 50)
    print("[1] 获取标签映射...")
    tags = api.get_tags()
    print(json.dumps(tags, ensure_ascii=False, indent=2)[:2000])

    # 2. 首页数据
    print("\n" + "=" * 50)
    print("[2] 获取首页帖子...")
    data = api.search_posts(page=1, page_size=5)
    records = data.get("data", {}).get("records", [])
    total = data.get("data", {}).get("total", 0)
    print(f"  总帖子数: {total}")
    print(f"  返回 {len(records)} 条样本:")
    for i, post in enumerate(records):
        parsed = parse_post(post)
        print(f"\n  --- 帖子 {i+1} ---")
        print(f"  专业: {parsed['major']}")
        print(f"  学校: {parsed['school']}")
        print(f"  学历: {parsed['degree']}")
        print(f"  工作年限: {parsed['work_years']}")
        print(f"  浏览量: {parsed['view_num']} | 点赞: {parsed['thumb_num']}")
        content_preview = parsed['content'].replace('\n', ' ')[:150]
        print(f"  内容摘要: {content_preview}...")

    # 3. 保存样本
    sample_path = os.path.join(OUTPUT_DIR, "kkdaxue_sample.json")
    with open(sample_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"\n  样本已保存: {sample_path}")

    api.close()
    print("\n[OK] 探索完成！API可用，数据结构清晰。")


def cmd_sample():
    """采样模式：抓取少量数据导入数据库"""
    api = KkdaxueAPI()
    print(f"抓取前 20 条帖子...")
    posts = api.get_all_posts(page_size=20, max_pages=1)
    print(f"\n获取 {len(posts)} 条帖子")

    analyze_posts(posts)

    sample_path = os.path.join(OUTPUT_DIR, "kkdaxue_sample.json")
    with open(sample_path, "w", encoding="utf-8") as f:
        parsed_posts = [parse_post(p) for p in posts]
        json.dump(parsed_posts, f, ensure_ascii=False, indent=2)
    print(f"已保存: {sample_path}")

    # 导入数据库
    print(f"\n导入 SQLite...")
    import_to_sqlite(posts)

    api.close()
    print(f"\n[OK] 采样完成！已证明爬虫可用。")


def cmd_crawl():
    """全量爬取模式：抓取所有帖子"""
    api = KkdaxueAPI()

    print("开始全量爬取 kkdaxue.com 数据...")
    print("(按 Ctrl+C 可中断)")
    print()

    posts = api.get_all_posts(page_size=50)
    print(f"\n共获取 {len(posts)} 条帖子")

    # 保存原始JSON
    raw_path = os.path.join(OUTPUT_DIR, "kkdaxue_all.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"原始数据: {raw_path}")

    # 数据分析
    analyze_posts(posts)

    # 导入数据库
    print(f"\n导入 SQLite...")
    import_to_sqlite(posts)

    api.close()
    print(f"\n[OK] 全量爬取完成！")


def main():
    parser = argparse.ArgumentParser(description="kkdaxue.com 数据爬取")
    parser.add_argument("--mode", choices=["explore", "sample", "crawl"],
                        default="explore",
                        help="explore=探索API | sample=采样20条 | crawl=全量爬取")
    args = parser.parse_args()

    print("=" * 60)
    print(f"kkdaxue.com（框框大学）数据爬取")
    print(f"模式: {args.mode}")
    print(f"时间: {datetime.now().isoformat()}")
    print("=" * 60 + "\n")

    if args.mode == "explore":
        cmd_explore()
    elif args.mode == "sample":
        cmd_sample()
    elif args.mode == "crawl":
        cmd_crawl()


if __name__ == "__main__":
    main()
