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
import time

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
1. 普通家庭选计算机性价比最高
2. 城市 > 学校 > 专业
3. 选专业就是选赛道，看中间50%的人去哪了
4. 有门槛的专业工资才高，没门槛的谁都能干
5. 医学是普通家庭阶层跃迁的第二条路，但要有经济准备
用直白、接地气、略带幽默的语气回复，150 字以内""",

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

    "data": """你是数据 Agent，代表数据驱动的分析视角。关注点：
1. 一切结论都要有数据支撑
2. 分数线、位次、招生人数是最客观的参考
3. 不要凭感觉选专业，要看就业数据和薪资中位数
4. 注意数据的时效性和来源可信度
5. 趋势比单点数据更重要
用客观、数据化、简洁的语气回复，150 字以内""",

    "risk": """你是风险 Agent，专门发现潜在风险。关注点：
1. 该专业近年是否有高校撤销或停招？
2. 官方就业率 vs 社区真实反馈是否一致？
3. AI 对该专业的替代风险有多高？
4. 该专业的隐形门槛（转专业难度、单科要求）
5. 不要制造焦虑，但要诚实提醒
用冷静、谨慎、举证的语气回复，150 字以内""",
}

# Agent 中文名（供 /stream、/ 与 /api/context/ask 复用，避免三处重复定义漂移）
AGENT_NAMES = {
    "master": "主控 Agent",
    "zhang": "张雪峰 Agent",
    "parents": "爸妈 Agent",
    "senior": "学长 Agent",
    "workplace": "职场 Agent",
    "data": "数据 Agent",
    "risk": "风险 Agent",
}


def is_placeholder_api_key(key: str) -> bool:
    """识别占位/示例 key（sk-test / sk-placeholder / your-api-key 等），命中即应走规则降级。"""
    k = (key or "").lower()
    return any(p in k for p in ["test", "placeholder", "your-api", "your_key"])


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
        "35岁危机真实存在，但不是每个行业都这样。医生、律师、教师这些越老越吃香的职业，反而是时间的朋友。",
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


def _get_llm_response(agent_id: str, message: str, history: List[dict]) -> str:
    """LLM 驱动的回复（假key直接走降级）"""
    try:
        from ..utils.llm_client import LLMClient
        from ..config import Config
        if is_placeholder_api_key(Config.LLM_API_KEY):
            return ""
        client = LLMClient()
        system = AGENT_PROMPTS.get(agent_id, AGENT_PROMPTS["master"])
        messages = [{"role": "system", "content": system}]
        for h in history[-6:]:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": message})
        return client.chat(messages, temperature=0.8, max_tokens=300)
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
    """SSE 流式 Agent 对话 — 逐 token 推送"""

    agent_name_map = AGENT_NAMES

    def generate():
        reply = _get_llm_response(request.agent_id, request.message, request.history)
        model_used = "llm"
        if not reply:
            reply = _get_fallback_reply(request.agent_id)
            model_used = "fallback"

        # 发送元信息
        yield f"data: {json.dumps({'type': 'meta', 'agent_name': agent_name_map.get(request.agent_id, request.agent_id), 'model_used': model_used}, ensure_ascii=False)}\n\n"

        # 逐字符流式发送（模拟打字效果）
        chunk_size = 3
        for i in range(0, len(reply), chunk_size):
            chunk = reply[i:i + chunk_size]
            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            time.sleep(0.03)

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Agent 对话（非流式）"""
    agent_name_map = AGENT_NAMES

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
