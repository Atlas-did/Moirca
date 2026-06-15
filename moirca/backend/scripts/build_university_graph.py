"""
建库脚本：从 qukequke/university-knowledge-map 数据构建知识图谱
保留实体-关系结构: 大学→位于→城市, 大学→属于→985/211, 大学→学科
输出: backend/data/university_graph.json
"""
import csv, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT = os.path.join(DATA_DIR, 'university_graph.json')
KG_DIR = '/tmp/university-kg'

from app.services.graph_service import KnowledgeGraph, SchoolNode, CareerNode

# ─── 1. 读原始数据 ───
schools = {}
cities = set()
with open(f'{KG_DIR}/scripts/data/data2.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name = (row.get('中文名') or '').strip()
        if not name: continue
        address = (row.get('地址') or row.get('地 址') or '').strip()
        province = '未知'
        for kw in ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江',
                   '江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南',
                   '广东','广西','海南','四川','贵州','云南','西藏','陕西','甘肃',
                   '青海','宁夏','新疆','内蒙古','香港','澳门','台湾']:
            if kw in address or kw in name: province = kw; break
        tier = '其他'
        if row.get('985') == 'True': tier = '985'
        elif row.get('211') == 'True': tier = '211'
        elif row.get('双一流') == 'True': tier = '双一流'
        elif '公办' in (row.get('办学性质') or ''): tier = '公办'
        elif '民办' in (row.get('办学性质') or ''): tier = '民办'
        schools[name] = {'province': province, 'tier': tier}
        cities.add(province)

# ─── 2. 建图 ───
kg = KnowledgeGraph()
for name, info in schools.items():
    kg.add_school(SchoolNode(name=name, tier=info['tier'], province=info['province'], city=info['province']))
for c in sorted(cities - {'未知'}):
    kg.add_career(CareerNode(name=c, category='城市', salary_range=''))

# 专业节点（从 kkdaxue）
from app.services.graph_service import ProfessionNode
KK_PATH = os.path.join(DATA_DIR, 'crawled', 'kkdaxue_all.json')
majors_by_school = {}
all_majors = set()
if os.path.exists(KK_PATH):
    with open(KK_PATH) as f:
        for item in json.load(f):
            s = (item.get('school') or '').strip()
            m = (item.get('major') or '').strip()
            if s and m:
                majors_by_school.setdefault(s, set()).add(m)
                all_majors.add(m)

for i, m in enumerate(sorted(all_majors)):
    kg.graph.add_node(f"major_{i}", type='Profession', properties={'name': m, 'category': '未分类'})

# 关系
for name, info in schools.items():
    sid = f"school_{name}"
    if info['province'] != '未知':
        kg.graph.add_edge(sid, f"career_{info['province']}", type='OFFERED_BY')
for name, ms in majors_by_school.items():
    if name in schools:
        sid = f"school_{name}"
        for m in ms:
            nid = f"major_{list(all_majors).index(m)}"
            kg.graph.add_edge(sid, nid, type='OFFERED_BY')
for t in ['985', '211', '双一流']:
    kg.graph.add_node(f"tier_{t}", type='Profession', properties={'name': t, 'category': '学校层次'})
for name, info in schools.items():
    if info['tier'] in ['985','211','双一流']:
        kg.graph.add_edge(f"school_{name}", f"tier_{info['tier']}", type='LEADS_TO')

payload = kg.to_json()
with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

stats = kg.get_stats()
print(f"✅ 已构建: {OUTPUT}")
print(f"   节点: {stats['total_nodes']} (学校 {stats['school_count']}, 专业 {stats['profession_count']})")
print(f"   边:   {stats['total_edges']}")
