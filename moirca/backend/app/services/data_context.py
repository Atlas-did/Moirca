"""
Data Context Builder for the "数据 Agent"
Aggregates school data, kkdaxue reviews, and admission info into structured context.
"""
import json, os, sqlite3
from typing import Dict, List, Optional
from collections import Counter

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'admission.db')
KK_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'crawled', 'kkdaxue_all.json')

_tier_score_guide = {
    '985': ('顶尖', 590, 750),
    '211': ('优秀', 540, 620),
    '双一流': ('中上', 530, 600),
    '公办': ('中等', 450, 560),
    '民办': ('一般', 350, 480),
}


def build_data_context(province: str, score: int, major_pref: str = '') -> str:
    """Build a structured data context string for the Data Agent.
    
    Follows a step-by-step thinking framework:
    1. User situation → score, province, control line
    2. Available schools → by tier (985/211/一本)
    3. Major-level scores → if major_pref provided
    4. kkdaxue reputation → student reviews
    5. Summary → pull it all together
    """

    db = sqlite3.connect(DB_PATH)
    parts = []

    # 1. Province overview
    c = db.execute("SELECT level, count(*) FROM schools WHERE province=? GROUP BY level ORDER BY count(*) DESC", (province,))
    levels = dict(c.fetchall())
    tier_order = ['985', '211', '双一流', '公办', '民办']
    prov_summary = []
    for t in tier_order:
        if t in levels:
            prov_summary.append(f"{t}: {levels[t]}所")
    parts.append(f"【{province}高校概况】{', '.join(prov_summary)}")

    # 2. Score analysis by tier
    parts.append(f"你的分数：{score}分")
    score_analysis = []
    for tier, (label, lo, hi) in _tier_score_guide.items():
        if score >= hi:
            score_analysis.append(f"稳上{tier}（需≥{hi}分）")
        elif score >= lo and score < hi:
            gap = hi - score
            score_analysis.append(f"冲{tier}（差{gap}分）")
        elif score < lo and tier in levels:
            score_analysis.append(f"{tier}可能不够（需≥{lo}分）")
    parts.append("层次定位：" + '；'.join(score_analysis))

    # 3. Reachable schools by tier
    for tier in ['985', '211', '双一流', '公办']:
        if tier not in levels:
            continue
        _, lo, hi = _tier_score_guide[tier]
        label = '冲' if score < hi else '稳'
        schools = db.execute(
            "SELECT name FROM schools WHERE province=? AND level=? LIMIT 6",
            (province, tier)
        ).fetchall()
        if schools:
            names = [s[0] for s in schools]
            parts.append(f"{label}{tier}（分数段{lo}-{hi}）：{'、'.join(names)}")

    # 4. kkdaxue reputation (if available)
    kk_data = _load_kkdaxue()
    if kk_data:
        rep = _get_reputation(kk_data, province, major_pref)
    if rep:
        parts.append(f"【就读口碑】{rep}")

    parts.append(f"""
【分析框架 - 请按此结构逐步思考】

第1步 - 省控线对比：考生{score}分，对比{province}省各批次线，判断在哪个档次（冲/稳/保）

第2步 - 可选学校筛选：按"冲稳保"列出该省各层次学校的录取分区间
  冲（高10-20分）：{score+10}-{score+20}分段
  稳（±10分）：{score-10}-{score+10}分段  
  保（低10-30分）：{score-10}-{score-30}分段

第3步 - 专业匹配（如有专业偏好）：对比{province}各校{major_pref if major_pref else '相关'}专业的录取分

第4步 - 补充数据：kkdaxue口碑、学校层次（985/211/双一流/公办/民办）

第5步 - 结论：给出3-5条具体可操作的填报建议，每条附数据支撑
""".strip())

    db.close()
    return '\n'.join(parts)


def _load_kkdaxue() -> Optional[Dict]:
    if not os.path.exists(KK_PATH):
        return None
    with open(KK_PATH) as f:
        return json.load(f)


def _get_reputation(data: List[Dict], province: str, major: str) -> str:
    """Aggregate kkdaxue reviews into a summary."""
    items = [d for d in data if d.get('school') and d.get('content')]
    # Find reviews for schools in this province
    # (province matching is rough since kkdaxue doesn't have province field)
    # Instead, use major-based reputation
    if major:
        major_items = [d for d in items if major in d.get('major', '')]
        if major_items:
            positive = sum(1 for d in major_items if any(w in d.get('content', '') for w in ['好', '推荐', '值得', '不错', '满意', '高薪']))
            negative = sum(1 for d in major_items if any(w in d.get('content', '') for w in ['坑', '别来', '后悔', '劝退', '差', '不好']))
            total = len(major_items)
            if total > 0:
                pos_rate = positive / total * 100
                return f"kkdaxue平台{major}相关{total}条反馈，正向评价率{pos_rate:.0f}%"

    # General fallback: major-agnostic reputation
    if items:
        n = min(len(items), 500)
        pos = sum(1 for d in items[:n] if any(w in d.get('content', '') for w in ['好', '推荐', '值得']))
        neg = sum(1 for d in items[:n] if any(w in d.get('content', '') for w in ['坑', '后悔', '劝退']))
        return f"参考kkdaxue平台就读反馈（{len(items)}条），正向率{pos/max(n,1)*100:.0f}%"
    return ''
