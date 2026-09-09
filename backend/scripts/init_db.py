"""
数据库初始化 + 基础语料导入
P0: 导入 gaokao-mentor-wisdom 的105条结构化JSON
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json

from app.models.database import get_connection, init_db

# ============================================
# 张雪峰核心语录（精选30条，覆盖6大分类）
# 数据来源: https://github.com/dongsheng123132/gaokao-mentor-wisdom (MIT)
# ============================================
ZHANGXUEFENG_WISDOM = [
    # ---- 专业选择 (10条) ----
    {"text": "如果你家境一般，没有任何社会资源，不要学金融。",
     "tags": ["金融", "家境", "社会资源"], "target_audience": "普通家庭", "category": "专业选择"},
    {"text": "计算机专业是普通家庭孩子改变命运性价比最高的专业。",
     "tags": ["计算机", "普通家庭", "性价比"], "target_audience": "普通家庭", "category": "专业选择"},
    {"text": "生化环材，四大天坑，能不碰就别碰。",
     "tags": ["生物", "化学", "环境", "材料", "天坑"], "target_audience": "所有考生", "category": "专业选择"},
    {"text": "学医是普通家庭实现阶层跃迁的第二条路。但需要家庭能支撑8-10年无收入期。",
     "tags": ["医学", "阶层跃迁", "时间成本"], "target_audience": "中产家庭", "category": "专业选择"},
    {"text": "法学不看学校看证。过不了司法考试，北大法学也没用。",
     "tags": ["法学", "司法考试", "学校"], "target_audience": "所有考生", "category": "专业选择"},
    {"text": "会计是文科里面最硬的专业，因为它有门槛。",
     "tags": ["会计", "文科", "门槛"], "target_audience": "文科生", "category": "专业选择"},
    {"text": "师范类最大的优势不是稳定，是寒暑假——这是其他行业没有的时间红利。",
     "tags": ["师范", "稳定", "寒暑假"], "target_audience": "所有考生", "category": "专业选择"},
    {"text": "土木工程前十年是黄金专业，现在走下坡路了。选专业要看未来10年，不是看过去10年。",
     "tags": ["土木", "趋势", "时间维度"], "target_audience": "所有考生", "category": "专业选择"},
    {"text": "电气工程及其自动化，进可攻退可守——国家电网兜底，私企也能去。",
     "tags": ["电气", "就业", "电网"], "target_audience": "所有考生", "category": "专业选择"},
    {"text": "人工智能专业慎重——大多数学校只是换了个名字，教的还是传统计算机那套。",
     "tags": ["人工智能", "学校质量", "谨慎"], "target_audience": "所有考生", "category": "专业选择"},

    # ---- 就业前景 (6条) ----
    {"text": "选专业就是选赛道。选错了赛道，再努力也是白搭。",
     "tags": ["专业", "赛道", "努力"], "target_audience": "所有考生", "category": "就业前景"},
    {"text": "好就业的专业都有门槛。没门槛的专业，谁都能干，工资就上不去。",
     "tags": ["就业", "门槛", "工资"], "target_audience": "所有考生", "category": "就业前景"},
    {"text": "你看到的不是专业，是毕业后的生活状态。学护理的毕业三班倒，学计算机的996。",
     "tags": ["就业", "生活状态", "护理", "计算机"], "target_audience": "所有考生", "category": "就业前景"},
    {"text": "看就业不要看最高薪的那5%的人，要看中间50%的人毕业去了哪里。",
     "tags": ["就业", "中位数", "统计"], "target_audience": "所有考生", "category": "就业前景"},
    {"text": "考公最对口的专业：法学、汉语言文学、会计、计算机。",
     "tags": ["考公", "法学", "汉语言", "会计", "计算机"], "target_audience": "考公意向", "category": "就业前景"},
    {"text": "你的工资不取决于你多努力，取决于你的不可替代性。",
     "tags": ["工资", "不可替代性", "努力"], "target_audience": "所有考生", "category": "就业前景"},

    # ---- 院校推荐 (5条) ----
    {"text": "填志愿的优先级：城市 > 学校 > 专业。",
     "tags": ["志愿", "城市", "学校", "专业", "优先级"], "target_audience": "所有考生", "category": "院校推荐"},
    {"text": "宁去大城市的211，不去小城市的985。你大学四年积累的眼界和人脉，远比毕业证上的校名重要。",
     "tags": ["城市", "211", "985", "人脉"], "target_audience": "所有考生", "category": "院校推荐"},
    {"text": "二本学生更应该去大城市——你的学校没有光环，但城市的机遇可以弥补。",
     "tags": ["二本", "城市", "机遇"], "target_audience": "二本考生", "category": "院校推荐"},
    {"text": "职业技术学院不是低人一等。一个顶尖高职的毕业生，比一个末流本科的毕业生好找工作。",
     "tags": ["高职", "本科", "就业"], "target_audience": "专科考生", "category": "院校推荐"},
    {"text": "看一个学校好不好，不要看它最好的专业，要看它最差的专业毕业去哪了。",
     "tags": ["学校评估", "最差专业", "毕业去向"], "target_audience": "所有考生", "category": "院校推荐"},

    # ---- 志愿填报策略 (5条) ----
    {"text": "冲的志愿不要超过20%。你的目标是上大学，不是买彩票。",
     "tags": ["冲", "比例", "风险"], "target_audience": "所有考生", "category": "志愿策略"},
    {"text": "保底志愿就是你的底线——录到这个学校你也能接受。不要填一个你自己都不想去的学校当保底。",
     "tags": ["保底", "底线", "接受"], "target_audience": "所有考生", "category": "志愿策略"},
    {"text": "服从调剂这件事，如果你填了不服从，就要做好滑档的准备。",
     "tags": ["调剂", "滑档", "风险"], "target_audience": "所有考生", "category": "志愿策略"},
    {"text": "提前批不是白捡的机会——很多提前批有服务年限或者定向就业的附加条件。",
     "tags": ["提前批", "附加条件", "服务年限"], "target_audience": "所有考生", "category": "志愿策略"},
    {"text": "不要因为一个人说某个专业好就报，也不要因为一个人说不好就不报。要多方交叉验证。",
     "tags": ["信息", "交叉验证", "决策"], "target_audience": "所有考生", "category": "志愿策略"},

    # ---- 人生哲理 (4条) ----
    {"text": "教育是普通家庭最靠谱的投资。别听那些读书无用论，说这话的人自己都在偷偷供孩子读书。",
     "tags": ["教育", "投资", "读书无用论"], "target_audience": "普通家庭", "category": "人生哲理"},
    {"text": "你父母没上过大学，他们给你的建议是基于他们的人生经验——你要理解，但不要照单全收。",
     "tags": ["父母", "建议", "独立思考"], "target_audience": "第一代大学生", "category": "人生哲理"},
    {"text": "高考是你人生最后一次完全靠分数决定命运的机会。以后的所有竞争，都是综合实力的较量。",
     "tags": ["高考", "公平", "竞争"], "target_audience": "所有考生", "category": "人生哲理"},
    {"text": "18岁做的决定会影响你28岁的生活状态，但不会决定你的一生。任何时候都有翻盘的机会。",
     "tags": ["年龄", "决定", "翻盘"], "target_audience": "所有考生", "category": "人生哲理"},
]


def import_wisdom():
    """将张雪峰语录导入SQLite"""
    conn = get_connection()
    cursor = conn.cursor()

    # 创建语料表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wisdom_corpus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            tags TEXT,
            target_audience TEXT,
            category TEXT NOT NULL,
            source TEXT DEFAULT 'gaokao-mentor-wisdom',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    count = 0
    for item in ZHANGXUEFENG_WISDOM:
        cursor.execute(
            "INSERT OR IGNORE INTO wisdom_corpus (text, tags, target_audience, category) VALUES (?, ?, ?, ?)",
            (item["text"], json.dumps(item["tags"]), item["target_audience"], item["category"])
        )
        if cursor.rowcount > 0:
            count += 1

    conn.commit()
    conn.close()
    print(f"[wisdom] 已导入 {count} 条张雪峰语录（共 {len(ZHANGXUEFENG_WISDOM)} 条）")
    return count


def import_sample_professions():
    """导入示例专业数据（后续替换为爬虫数据）"""
    conn = get_connection()
    cursor = conn.cursor()

    sample_majors = [
        ("080901", "计算机科学与技术", "工学", "计算机类", 4, "工学学士"),
        ("080902", "软件工程", "工学", "计算机类", 4, "工学学士"),
        ("080703", "通信工程", "工学", "电子信息类", 4, "工学学士"),
        ("080601", "电气工程及其自动化", "工学", "电气类", 4, "工学学士"),
        ("080202", "机械设计制造及其自动化", "工学", "机械类", 4, "工学学士"),
        ("100201", "临床医学", "医学", "临床医学类", 5, "医学学士"),
        ("120203", "会计学", "管理学", "工商管理类", 4, "管理学学士"),
        ("030101", "法学", "法学", "法学类", 4, "法学学士"),
        ("050101", "汉语言文学", "文学", "中国语言文学类", 4, "文学学士"),
        ("020301", "金融学", "经济学", "金融学类", 4, "经济学学士"),
    ]

    count = 0
    for code, name, category, discipline, duration, degree in sample_majors:
        cursor.execute(
            "INSERT OR IGNORE INTO professions (code, name, category, discipline, duration, degree_type) VALUES (?, ?, ?, ?, ?, ?)",
            (code, name, category, discipline, duration, degree)
        )
        if cursor.rowcount > 0:
            count += 1

    conn.commit()
    conn.close()
    print(f"[professions] 已导入 {count} 个示例专业（共 {len(sample_majors)} 个）")
    return count


def main():
    print("=" * 50)
    print("Moirca 数据库初始化")
    print("=" * 50)

    # 1. 创建表结构
    print("\n[1/3] 创建数据库表...")
    init_db()
    print("  表结构创建完成 ✓")

    # 2. 导入张雪峰语料
    print("\n[2/3] 导入张雪峰语料...")
    import_wisdom()

    # 3. 导入示例专业
    print("\n[3/3] 导入示例专业数据...")
    import_sample_professions()

    print("\n" + "=" * 50)
    print("初始化完成！")
    print(f"数据库路径: {os.path.abspath('../data/moirca.db')}")
    print("=" * 50)


if __name__ == '__main__':
    main()
