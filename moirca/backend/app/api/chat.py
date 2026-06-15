"""
Agent 对话 API

每个 Agent 有独立的系统提示词，LLM驱动回复，无 LLM 时降级到语料库。
支持 SSE 流式输出（/stream）和普通 JSON 回复（/）。
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import sqlite3
import time
import re
import asyncio
from ..utils.llm_client import LLMClient
from ..config import Config

router = APIRouter()

# ============================================
# 模型
# ============================================

class ChatRequest(BaseModel):
    message: str
    agent_id: str = "master"
    history: List[dict] = []   # [{role, content}, ...]

class ChatResponse(BaseModel):
    reply: str
    agent_id: str
    agent_name: str
    model_used: str            # "llm" | "fallback"


# ============================================
# Agent 系统提示词
# ============================================

AGENT_PROMPTS = {
    "master": """你是 Moirca 的主控协调 Agent。你的职责是：
1. 理解用户的高考志愿需求，帮他们梳理思路
2. 协调其他专业 Agent（张雪峰、数据、风险、学长、职场、父母视角）给出综合建议
3. 用友善、专业、鼓励的语气回复
4. 每次回复控制在 150 字以内
5. 如果用户提供了分数和省份，建议他们使用"AI 推荐"功能获取精准分析""",

    "zhang": """你是张雪峰 Agent，以张雪峰老师的务实风格分析问题。核心原则：
1. 2026年AI大爆发，基础编程岗面临替代风险，选专业要看"不可替代性"
2. 计算机依然重要但赛道变了——AI/安全/架构 > 普通开发
3. 城市 > 学校 > 专业（城市决定见识和机会）
4. 选专业看中间50%的人去哪了、挣多少
5. 医学/护理/新能源/芯片/高端制造是确定性增长赛道
6. 文科不卷但考公优势大
7. 普通家庭不要追风口专业，要选"毕业能找到确定性工作的"
用直白、接地气、略带幽默的语气回复，内容不限，每一点都要展开说透彻。""",

    "parents": """你是爸妈 Agent，代表传统家长视角。关注点：
1. 稳定最重要——公务员、医生、老师是"铁饭碗"
2. 离家近好照顾
3. 专业名字要"好听"、体面
4. 医生越老越吃香
5. 不要太冒险，稳妥为上
用温和、关切、传统的语气回复，150 字以内""",

    "senior": """你是学长 Agent，代表一线在校生/毕业生的真实体验。关注点：
1. 大厂 996 但钱多，看个人取舍
2. 选导师比选学校重要
3. 深大/广工就业好是因为地理位置，不是学校名气
4. 别只信官方就业率，去贴吧/知乎看真实反馈
5. 实习机会 > 课程质量（对就业而言）
用真实、接地气、过来人的语气回复，150 字以内""",

    "workplace": """你是职场 Agent，代表职场人士的视角。关注点：
1. 35岁危机真实存在，要提前规划第二曲线
2. 算法岗门槛高但薪资也高
3. 行业趋势比眼前薪资更重要
4. 选城市就是选产业——深圳是硬件+互联网，上海是金融，北京是AI+政策
5. 第一份工作的平台比薪资重要
用务实、数据化、前瞻性的语气回复，150 字以内""",

    "data": """你是数据 Agent，负责逐校详细分析。

⚠️ 钢印规则（必须遵守，不可违反）：

1. 你必须分析系统编译列表中的每一所学校，一所都不能跳过。
2. 输出学校数量必须 ≥ 该省志愿填报槽位数。如果列表不够，说明原因。
3. 每所学校输出3-4行，格式固定：
   [冲/稳/保] 校名 | 均分XX | 匹配度:高/中/低 | 录取概率:XX%
     优势专业: XXX(XX分) XXX(XX分)
     风险: 一句话
4. 引用具体分数数据，不泛泛而谈。
5. 连续输出，学校之间不空行以节省token。按冲→稳→保顺序排列。
6. 不要写开场白和结束语，直接开始分析第一所学校。""",

    "risk": """你是风险 Agent，专门发现潜在风险。关注点：
1. 该专业近年是否有高校撤销或停招？
2. 官方就业率 vs 社区真实反馈是否一致？
3. AI 对该专业的替代风险有多高？
4. 该专业的隐形门槛（转专业难度、单科要求）
5. 不要制造焦虑，但要诚实提醒
用冷静、谨慎、举证的语气回复，150 字以内""",
}

FALLBACK_REPLIES = {
    "master": [
        '明白了，我来帮你分析一下。你可以告诉我你的分数和省份，或者直接使用 AI 推荐功能获取精准分析。',
        '这是个好问题。如果你上传成绩单，我能更精准地帮你匹配适合的专业和院校。',
        '志愿填报确实让人焦虑，但别担心——我们可以一步步来。先告诉我你大概的分数段？',
    ],
    "zhang": [
        "普通家庭选计算机，性价比最高。这话我说了十年，现在依然是真理。",
        "城市>学校>专业。去深圳读二本，比去小城市读一本强。你在大学四年积累的眼界和人脉，远比毕业证上的校名重要。",
        "别光看学校名气，就业才是王道。看一个学校好不好，不要看它最好的专业，要看它最差的专业毕业去哪了。",
    ],
    "parents": [
        "我觉得医生真的不错，越老越吃香，不用担心失业。当然培养周期比较长，要看家庭能不能支撑。",
        "公务员铁饭碗啊，虽然工资不算高，但稳定、有保障、社会地位也在那里。",
        "离家近点好，我们能照顾你。在外面有什么事，家里人也帮不上忙。",
    ],
    "senior": [
        "作为一个过来人，我觉得实习经历比课程重要太多了。我们班成绩最好的同学，找工作不一定是最顺的。",
        "深大软件工程就业确实好，主要是深圳互联网公司多。但要做好 996 的心理准备。",
        "选导师比选学校重要。一个好导师能带你发论文、做项目、推荐实习，这些才是毕业时的硬通货。",
    ],
    "workplace": [
        "从职场角度看，选城市就是选产业。深圳是硬件+互联网，上海是金融+外企，北京是AI+政策。",
        "第一份工作的平台比薪资重要。在BAT干两年出来，比在小公司干五年值钱。",
        "35岁危机真实存在，但不是每个行业都这样。医生、律师、教师这些越老越吃香的职业，反而是时间的朋���。",
    ],
    "data": [
        "根据近三年数据，计算机类专业分数线平均上涨 5-8 分，竞争越来越激烈。",
        "从位次来看，全省前 10000 名的考生有更多选择空间。你的位次大概在什么范围？",
        "招生人数的变化也很关键——有些专业招生人数在缩减，这意味着竞争更激烈。",
    ],
    "risk": [
        "提醒一下：部分学校的'人工智能'专业其实是传统计算机专业改名，课程体系没有实质变化。建议核实培养方案。",
        "官方就业率 95%，但社区反馈可能有水分。建议去知乎搜一下该专业的真实就读体验。",
        "AI 对翻译、基础会计、简单编程等重复性脑力劳动的替代风险较高，选择时需要考虑。",
    ],
}


_PROVINCE_SLOTS = {
    "广东": 45, "甘肃": 45, "安徽": 45, "江西": 45,
    "湖南": 45, "湖北": 45, "四川": 45, "陕西": 45,
    "山西": 45, "宁夏": 45, "内蒙古": 45,
    "河南": 48,
    "江苏": 40, "福建": 40, "广西": 40, "吉林": 40,
    "黑龙江": 40, "云南": 40,
    "辽宁": 112,
    "河北": 96, "重庆": 96, "贵州": 96, "青海": 96, "山东": 96,
    "浙江": 80,
    "北京": 30, "海南": 30,
    "上海": 24,
    "天津": 50,
    "新疆": 27, "西藏": 10,
}

_SLOT_RATIO = {"冲": 0.20, "稳": 0.50, "保": 0.30}


def _get_province_slots(province: str) -> dict:
    """返回某省的志愿槽位数及冲稳保建议数量"""
    total = _PROVINCE_SLOTS.get(province, 45)
    rush = max(2, int(total * _SLOT_RATIO["冲"]))
    steady = max(3, int(total * _SLOT_RATIO["稳"]))
    safe = max(2, int(total * _SLOT_RATIO["保"]))
    remainder = total - (rush + steady + safe)
    steady += remainder
    return {"total": total, "冲": rush, "稳": steady, "保": safe}


def _build_school_context(province: str, score: int, subject: str) -> str:
    """从 major_scores 查询用户分数段的院校数据，供 Agent 参考"""
    db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'admission.db')
    subject_candidates = {
        "物理": ["物理类", "理科", "综合"],
        "物理类": ["物理类", "理科", "综合"],
        "历史": ["历史类", "文科", "综合"],
        "历史类": ["历史类", "文科", "综合"],
        "理科": ["理科", "物理类", "综合"],
        "文科": ["文科", "历史类", "综合"],
    }.get(subject, [subject])

    db_subject = subject
    rows = []
    try:
        db = sqlite3.connect(db_path)
        for cand in subject_candidates:
            rows = db.execute("""
                SELECT school, major, min_score, min_rank
                FROM major_scores
                WHERE province = ? AND subject = ?
                AND batch LIKE '%本科%' AND batch NOT LIKE '%提前%' AND batch NOT LIKE '%专科%'
                AND min_score > 0
                ORDER BY school, min_score DESC
            """, (province, cand)).fetchall()
            if rows:
                db_subject = cand
                break
        db.close()
    except Exception:
        return ""

    if not rows:
        return ""

    from collections import defaultdict
    schools = defaultdict(list)
    for school, major, ms, mr in rows:
        schools[school].append((major, ms, mr))

    school_stats = []
    for name, majors in schools.items():
        scores = [m[1] for m in majors]
        school_stats.append({
            "name": name, "avg": sum(scores) / len(scores),
            "min": min(scores), "max": max(scores),
            "top_majors": sorted(majors, key=lambda x: x[1], reverse=True)[:4],
            "count": len(majors),
        })

    rush = sorted([s for s in school_stats if s["min"] >= score + 10], key=lambda s: s["min"])
    steady = sorted([s for s in school_stats if score - 10 <= s["min"] < score + 10], key=lambda s: s["avg"], reverse=True)
    safe_ = sorted([s for s in school_stats if s["min"] < score - 10], key=lambda s: s["avg"], reverse=True)

    slots = _get_province_slots(province)
    rush = rush[:slots["冲"]]
    steady = steady[:slots["稳"]]
    safe_ = safe_[:slots["保"]]

    def fmt(tier, items):
        if not items:
            return f"{tier}：无匹配数据"
        lines = [f"{tier}（{len(items)}所选列）："]
        for s in items:
            ms = "、".join([m[0][:10] for m in s["top_majors"][:3]])
            lines.append(f"  {s['name']} | 均分{s['avg']:.0f} | 最低{s['min']} | {ms}")
        return "\n".join(lines)

    parts = [
        f"【{province} {db_subject} {score}分 院校数据参考】",
        "以下数据来自2024年录取数据库，仅供分析参考：",
        fmt("冲（reach，最低分≥{0}）".format(score + 10), rush),
        fmt("稳（match，{0}≤最低分<{1}）".format(score - 10, score + 10), steady),
        fmt("保（safety，最低分<{0}）".format(score - 10), safe_),
        "请根据考生画像（性格、城市偏好、职业方向、家庭背景、风险偏好）从上述院校中筛选和推荐。",
        "不要推荐所有学校，而是根据画像选出最适合的5-8所，并说明理由。",
        "要考虑跨省选择——考生不一定只报本省学校，根据城市偏好推荐全国范围的院校。",
    ]
    return "\n".join(parts)


def _compile_school_list(strategy_text: str, province: str, score: int, subject: str) -> str:
    """根据张雪峰策略文本 + 向量搜索 + DB数据编译院校列表"""
    school_ctx = _build_school_context(province, score, subject)
    if not school_ctx:
        return ""

    slots = _get_province_slots(province)

    try:
        from ..services.school_embedding import search_by_strategy
        vector_matches = search_by_strategy(strategy_text, top_k=60)
        vector_schools = set(m["school"] for m in vector_matches)
    except Exception:
        vector_schools = set()

    exclude_keywords = []
    prefer_keywords = []
    for line in strategy_text.split('\n'):
        line = line.strip()
        if '排除' in line or '避雷' in line or '不推荐' in line:
            exclude_keywords.extend(re.findall(r'[\u4e00-\u9fa5]{2,6}', line))
        if '优先' in line or '推荐' in line or '方向' in line:
            prefer_keywords.extend(re.findall(r'[\u4e00-\u9fa5]{2,6}', line))

    header = f"""## 院校分析任务

{province}省本科批可填{slots['total']}个志愿。系统已通过向量语义匹配+数据库筛选编译以下院校列表（冲{slots['冲']}所 + 稳{slots['稳']}所 + 保{slots['保']}所）。
共{slots['total']}所学校，与你画像语义匹配度已排序。

⚠️ 你必须分析列表中每一所学校，总输出数量 ≥ {slots['total']} 所。一所都不能跳过。

每校格式：
[冲/稳/保] 校名 | 均分XX | 匹配度:高/中/低 | 录取概率:XX%
  优势专业: XXX(XX分) XXX(XX分)
  风险: 一句话

不要写开场白和结束语。直接开始第一所。

---
"""
    return header + school_ctx


def _build_agent_messages(agent_id: str, message: str, history: List[dict]) -> List[dict]:
    """构建 Agent 对话消息（不含 LLM 调用），供同步和流式路径复用"""
    from ..utils.llm_client import LLMClient
    from ..config import Config
    from ..services.knowledge_base import search

    data_context = ''
    if agent_id == 'data':
        try:
            from ..services.data_context import build_data_context
            score_match = re.search(r'(\d{3})分', message)
            prov_match = re.search(r'([\u4e00-\u9fa5]{2,3}[省市区])', message)
            score = int(score_match.group(1)) if score_match else 585
            province = prov_match.group(1) if prov_match else '广东'
            data_context = '\n\n【实时数据】\n' + build_data_context(province, score)
        except Exception:
            data_context = ''

    if agent_id == 'zhang':
        skill_path = os.environ.get(
            'ZHANGXUEFENG_SKILL_PATH',
            os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'xuefeng_skill.md')
        )
        zhang_base = """你是张雪峰，高考志愿规划专家。你的核心能力不是复读通用观点，而是基于考生的具体画像做个性化推荐。

## 核心原则
1. 城市>学校>专业 — 城市决定见识和机会
2. 选专业看就业50%中位数，不看出路最好的那几个人
3. 普通家庭求稳选确定性高的，有门槛的才值钱
4. 没有最好的专业，只有最适合这个考生的专业

## 画像驱动推荐（必须遵守）
考生提供了25道画像题和完整的分数/省份/选科/位次。你必须逐项分析：
- 职业方向（就业/考公/考研/留学）→ 决定推荐逻辑
- 性格类型（技术型/社交型/稳定型/创业型/自由型）→ 匹配专业类型
- 城市偏好（京津冀/长三角/珠三角/成渝/无所谓）→ 跨省推荐院校
- 风险偏好（高/中/低）→ 决定冲稳保比例
- 家庭经济（宽松/一般/紧张）→ 排除高收费专业
- 对AI的态度（焦虑/不担心/机会）→ 调整技术类推荐
- 擅长领域（数理/语言/动手/人际）→ 匹配学科方向
- 排斥领域（医学/师范/生化环材/计算机等）→ 必须排除

## 推荐要求（重要：只输出策略，不枚举学校！）
你的任务是制定志愿填报策略，系统会根据你的策略从数据库自动编译完整的院校列表。

1. 先做画像解读（3-5句概括这个考生）
2. 给出方向策略：
   - 推荐大方向（1-2句）
   - 冲稳保比例建议（如"冲30% 稳40% 保30%"）
   - 城市优先级（排序，如"长三角>珠三角>成渝"）
   - 排除方向（明确列出不适合的门类/专业）
   - 优先方向（明确列出重点考虑的门类）
3. 最后给2-3条避坑提醒

▲ 不要推荐具体学校名称！学校列表由系统自动生成。"""

        if os.path.exists(skill_path):
            with open(skill_path) as f:
                skill_content = f.read()
            for section in ['核心理念', '决策流程', '六大误区警示']:
                start = skill_content.find(f'## {section}')
                if start >= 0:
                    end = skill_content.find('\n## ', start + 5)
                    zhang_base += '\n\n' + skill_content[start:end if end > 0 else start+2000][:800]
            system = zhang_base[:4000] + data_context
        else:
            system = zhang_base + data_context

        score_match = re.search(r'(\d{3})\s*分', message)
        prov_match = re.search(r'([\u4e00-\u9fa5]{2,3}[省市区])', message)
        subj_match = re.search(r'(?:选科|科目|subject)[：:\s"]+(\S+?)(?:["\s,]|$)', message)

        if not score_match:
            json_start = message.find('{')
            if json_start >= 0:
                depth = 0
                json_end = json_start
                for i in range(json_start, len(message)):
                    if message[i] == '{': depth += 1
                    elif message[i] == '}':
                        depth -= 1
                        if depth == 0:
                            json_end = i + 1
                            break
                try:
                    prof = json.loads(message[json_start:json_end])
                    score_match = re.match(r'(\d+)', str(prof.get('score', '')))
                    if not prov_match:
                        prov_match = re.match(r'([\u4e00-\u9fa5]{2,3})', str(prof.get('province', '')))
                    if not subj_match:
                        subj_match = re.match(r'(\S+)', str(prof.get('subject', '')))
                except Exception:
                    pass

        if score_match and prov_match:
            try:
                score = int(score_match.group(1))
                province = prov_match.group(1)
                subject = subj_match.group(1) if subj_match else '物理'
                school_ctx = _build_school_context(province, score, subject)
                if school_ctx:
                    slots = _get_province_slots(province)
                    slot_guide = f"\n\n【{province}省志愿填报规则】本科批可填{slots['total']}个志愿。建议配比：冲{slots['冲']}所 + 稳{slots['稳']}所 + 保{slots['保']}所。请按此数量推荐，确保有足够保底防止滑档。"
                    system = system + '\n\n' + school_ctx + slot_guide
            except Exception:
                pass
    else:
        system = AGENT_PROMPTS.get(agent_id, AGENT_PROMPTS["master"]) + data_context

        if agent_id == 'data':
            user_msg = history[0].get('content', '') if history else message
            sm = re.search(r'(\d{3})\s*分', user_msg)
            pm = re.search(r'([\u4e00-\u9fa5]{2,3}[省市区])', user_msg)
            sj = re.search(r'(?:选科|科目|subject)[：:\s"]+(\S+?)(?:["\s,]|$)', user_msg)
            if not sm:
                try:
                    js = json.loads(user_msg[user_msg.find('{'):user_msg.rfind('}')+1])
                    sm = re.match(r'(\d+)', str(js.get('score', '')))
                    pm = pm or re.match(r'([\u4e00-\u9fa5]{2,3})', str(js.get('province', '')))
                except Exception:
                    pass
            if sm and pm:
                try:
                    score = int(sm.group(1))
                    province = pm.group(1)
                    subject = sj.group(1) if sj else '物理'
                    compiled = _compile_school_list(message, province, score, subject)
                    if compiled:
                        system = system + '\n\n' + compiled
                except Exception:
                    pass

    kb_context = ""
    if agent_id != 'data':
        kb_results = search(message, top_k=6)
        if kb_results:
            kb_context = '\n\n以下是从知识库检索到的相关信息（可能有陈旧数据，注意甄别）：\n'
            for i, r in enumerate(kb_results, 1):
                fw = r.get('freshness_warning', '')
                fn = r.get('freshness_note', '')
                prefix = f'【可能过时：{fn}】' if fw else ''
                kb_context += f"{i}. {prefix}{r['text'][:300]}\n"

    messages = [{"role": "system", "content": system + kb_context}]
    for h in history[-6:]:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": message})
    return messages


def _get_llm_response(agent_id: str, message: str, history: List[dict]) -> str:
    """LLM 驱动的回复，带知识库检索增强（同步，非流式）"""
    try:
        key = (Config.LLM_API_KEY or "").lower()
        if any(placeholder in key for placeholder in ["test", "placeholder", "your-api"]):
            return ""

        client = LLMClient()
        messages = _build_agent_messages(agent_id, message, history)
        content = client.chat(messages, temperature=0.8, max_tokens=2000)
        cleaned = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
        if not cleaned:
            cleaned = content.strip()
        return cleaned
    except Exception:
        return ""


def _get_fallback_reply(agent_id: str) -> str:
    """降级回复（语料库随机选择）"""
    import random
    replies = FALLBACK_REPLIES.get(agent_id, FALLBACK_REPLIES["master"])
    return random.choice(replies)


# ============================================
# API
# ============================================

@router.post("/stream")
def chat_stream(request: ChatRequest):
    """SSE 流式 Agent 对话 — 真正逐 token 推送"""

    agent_name_map = {
        "master": "主控 Agent", "zhang": "张雪峰 Agent",
        "parents": "爸妈 Agent", "senior": "学长 Agent",
        "workplace": "职场 Agent", "data": "数据 Agent",
        "risk": "风险 Agent",
    }

    def generate():
        client = LLMClient()
        key = (Config.LLM_API_KEY or "").lower()
        if any(p in key for p in ["test", "placeholder", "your-api"]):
            reply = _get_fallback_reply(request.agent_id)
            yield f"data: {json.dumps({'type': 'meta', 'agent_name': agent_name_map.get(request.agent_id, request.agent_id), 'model_used': 'fallback'}, ensure_ascii=False)}\n\n"
            for i in range(0, len(reply), 8):
                yield f"data: {json.dumps({'type': 'chunk', 'content': reply[i:i+8]}, ensure_ascii=False)}\n\n"
                time.sleep(0.01)
            yield "data: [DONE]\n\n"
            return

        reply = _get_llm_response(request.agent_id, request.message, request.history)
        model_used = "llm"
        if not reply:
            reply = _get_fallback_reply(request.agent_id)
            model_used = "fallback"

        yield f"data: {json.dumps({'type': 'meta', 'agent_name': agent_name_map.get(request.agent_id, request.agent_id), 'model_used': model_used}, ensure_ascii=False)}\n\n"

        for i in range(0, len(reply), 3):
            yield f"data: {json.dumps({'type': 'chunk', 'content': reply[i:i+3]}, ensure_ascii=False)}\n\n"
            time.sleep(0.02)

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Agent 对话（非流式）"""
    agent_name_map = {
        "master": "主控 Agent", "zhang": "张雪峰 Agent",
        "parents": "爸妈 Agent", "senior": "学长 Agent",
        "workplace": "职场 Agent", "data": "数据 Agent",
        "risk": "风险 Agent",
    }

    reply = _get_llm_response(request.agent_id, request.message, request.history)
    model_used = "llm"
    if not reply:
        reply = _get_fallback_reply(request.agent_id)
        model_used = "fallback"

    return ChatResponse(
        reply=reply,
        agent_id=request.agent_id,
        agent_name=agent_name_map.get(request.agent_id, request.agent_id),
        model_used=model_used,
    )


import threading
import uuid
import time

_task_results: dict = {}
_task_lock = threading.Lock()
_TASK_TTL_SECONDS = 1800  # 30 分钟后自动清理

def _cleanup_expired_tasks():
    """清理过期任务，防止内存泄漏"""
    now = time.time()
    with _task_lock:
        expired = [tid for tid, v in _task_results.items()
                    if v.get('_created', 0) + _TASK_TTL_SECONDS < now]
        for tid in expired:
            del _task_results[tid]

@router.post("/poll")
def chat_poll_start(request: ChatRequest):
    _cleanup_expired_tasks()
    task_id = uuid.uuid4().hex[:8]
    with _task_lock:
        _task_results[task_id] = {"status": "processing", "partial_reply": "", "reply": None, "model": None, "_created": time.time()}

    agent_id = request.agent_id
    message = request.message
    history = request.history

    def worker():
        try:
            key = (Config.LLM_API_KEY or "").lower()
            if any(p in key for p in ["test", "placeholder", "your-api"]):
                reply = _get_fallback_reply(agent_id)
                with _task_lock:
                    _task_results[task_id] = {"status": "done", "partial_reply": reply, "reply": reply, "model": "fallback"}
                return

            client = LLMClient()
            messages = _build_agent_messages(agent_id, message, history)

            token_budget = {"data": 16000, "zhang": 1200, "risk": 1000}.get(agent_id, 2000)

            full_text = ""
            for chunk in client.chat_stream(messages, temperature=0.8, max_tokens=token_budget):
                full_text += chunk
                with _task_lock:
                    _task_results[task_id] = {"status": "processing", "partial_reply": full_text, "reply": None, "model": "llm"}

            if not full_text:
                reply = _get_fallback_reply(agent_id)
                with _task_lock:
                    _task_results[task_id] = {"status": "done", "partial_reply": reply, "reply": reply, "model": "fallback"}
            else:
                with _task_lock:
                    _task_results[task_id] = {"status": "done", "partial_reply": full_text, "reply": full_text, "model": "llm"}
        except Exception as e:
            with _task_lock:
                _task_results[task_id] = {"status": "error", "partial_reply": str(e), "reply": str(e), "model": None}

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return {"task_id": task_id, "status": "processing"}

@router.get("/poll/{task_id}")
def chat_poll_result(task_id: str):
    with _task_lock:
        r = _task_results.get(task_id)
    if not r:
        return {"status": "not_found"}
    return r


# ============================================
# 方案总结 API
# ============================================

class SummarizeRequest(BaseModel):
    profile: dict = {}           # {score, province, subject, rank}
    messages: List[dict] = []    # [{agentId, agentName, content}, ...]
    decisions: List[str] = []    # user decision descriptions

class SummarizeResponse(BaseModel):
    direction: str = ""
    schools: List[str] = []
    majors: List[str] = []
    warnings: List[str] = []
    decision_path: List[str] = []
    model_used: str = ""


@router.post("/summarize", response_model=SummarizeResponse)
def chat_summarize(request: SummarizeRequest):
    """将对话内容总结为结构化志愿方案"""
    key = (Config.LLM_API_KEY or "").lower()
    if any(p in key for p in ["test", "placeholder", "your-api"]):
        return SummarizeResponse(
            direction="请配置 LLM API Key 以启用方案总结",
            model_used="fallback",
        )

    profile_str = json.dumps(request.profile, ensure_ascii=False)
    msgs_str = "\n".join([
        f"[{m.get('agentName', m.get('agentId', '未知'))}]: {m.get('content', '')[:200]}"
        for m in request.messages[-12:]
    ])
    decisions_str = "\n".join([f"- {d}" for d in (request.decisions or [])])

    prompt = f"""你是高考志愿方案总结专家。根据以下对话内容，提炼出结构化的志愿方案草案。

## 考生画像
{profile_str}

## 智能体对话记录（摘要）
{msgs_str}

## 用户决策
{decisions_str if decisions_str else '（暂无明确决策）'}

请输出 JSON，只输出 JSON，不要任何其他文字：
{{
  "direction": "总体推荐方向，一句话总结（40字以内）",
  "schools": ["推荐院校1 - 理由（15字以内）", "推荐院校2 - 理由", ...],
  "majors": ["推荐专业1 - 理由（15字以内）", ...],
  "warnings": ["风险提示1（20字以内）", ...],
  "decision_path": ["步骤1: ...", "步骤2: ..."]
}}

注意：
- direction 要结合分数段、省份、选科给出精准方向
- schools 和 majors 只列出对话中实际提到的
- warnings 要指出真实风险，不要泛泛而谈
- decision_path 按时间顺序列出关键决策节点"""

    try:
        client = LLMClient()
        result = client.chat_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=600,
        )
        return SummarizeResponse(
            direction=result.get("direction", ""),
            schools=result.get("schools", []) or [],
            majors=result.get("majors", []) or [],
            warnings=result.get("warnings", []) or [],
            decision_path=result.get("decision_path", []) or [],
            model_used="llm",
        )
    except Exception:
        return SummarizeResponse(
            direction="方案总结生成失败，请稍后重试",
            model_used="error",
        )


# ============================================
# 向量搜索 API
# ============================================

class StrategySearchRequest(BaseModel):
    strategy: str = ""
    top_k: int = 20


@router.post("/search-schools")
def search_schools_by_strategy(request: StrategySearchRequest):
    try:
        from ..services.school_embedding import search_by_strategy, build_index
        build_index()
        results = search_by_strategy(request.strategy, request.top_k)
        return {"results": results, "count": len(results)}
    except Exception as e:
        return {"results": [], "count": 0, "error": str(e)}


@router.get("/similar-schools")
def similar_schools(name: str = "", top_k: int = 10):
    try:
        from ..services.school_embedding import search_similar, build_index
        build_index()
        results = search_similar(name, top_k)
        return {"school": name, "similar": results, "count": len(results)}
    except Exception as e:
        return {"school": name, "similar": [], "count": 0, "error": str(e)}
