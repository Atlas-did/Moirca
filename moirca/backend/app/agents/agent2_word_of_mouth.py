"""
Agent 2: 口碑矿工（Word of Mouth Miner）

职责: 从知乎、B站、小红书、贴吧等社区采集真实就读体验
分析维度: 学生满意度、课程质量、实习机会、转专业难度、隐形门槛
"""
from datetime import datetime
from ..utils.llm_client import LLMClient
from .base import BaseAgent, AgentContext
from .agent6_fusion_alchemist import AgentOutput


class Agent2WordOfMouth(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "口碑矿工"

    def _system_prompt(self) -> str:
        return """你是一位社区舆情分析师，专门从知乎、B站、小红书、百度贴吧等平台收集学生对专业的真实评价。

你的分析必须基于以下原则:
1. 注意幸存者偏差: 愿意发声的多是极端体验（特别好或特别差），中间多数沉默
2. 区分抱怨类型: "课程难"不等于"专业差"；"找不到工作"可能是个人原因
3. 关注高频关键词: 同一问题被多人提及才值得关注
4. 时效性: 3年前的帖子可能已不适用

评分标准（0-100）:
- 90-100: 口碑极佳，大量正面评价，抱怨少且不集中
- 75-89: 口碑较好，正面为主，偶有合理抱怨
- 60-74: 口碑一般，正负面相当
- 40-59: 口碑偏差，集中性抱怨
- 0-39: 口碑很��，劝退贴为主，存在严重问题

返回JSON格式:
{
  "raw_score": 数字(0-100),
  "confidence": 数字(0-1),
  "sentiment": "正面/中性/负面",
  "hot_keywords": ["关键词1", "关键词2"],
  "common_praise": "常见好评(80字)",
  "common_complaint": "常见抱怨(80字)",
  "hidden_threshold": "隐形门槛描述(如有)"
}"""

    def _build_user_prompt(self, ctx: AgentContext) -> str:
        prof = ctx.profession
        posts_text = "\n".join(ctx.kkdaxue_posts[:3]) if ctx.kkdaxue_posts else "暂缺社区数据"

        return f"""请从社区口碑角度分析以下专业:

专业: {prof.name}
学科门类: {prof.category}

框框大学真实学生反馈:
{posts_text[:1500] or "暂无该专业的社区反馈"}

请综合评估该专业在社区中的口碑，关注: 课程质量、师资水平、实习机会、转专业难度、真实就业情况。"""

    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=ctx.profession.code,
            raw_score=float(response.get("raw_score", 65)),
            confidence=float(response.get("confidence", 0.65)),
            freshness_date=datetime.now(),
            source_count=len(ctx.kkdaxue_posts) or 3,
            notes=response.get("common_praise", response.get("sentiment", "")),
        )

    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        prof = ctx.profession
        # 有kkdaxue数据时用关键词匹配估算
        score = 65.0
        notes = "暂无社区数据"

        if ctx.kkdaxue_posts:
            all_text = " ".join(ctx.kkdaxue_posts)
            positive_words = ["好", "不错", "推荐", "值得", "满意", "优势", "前景"]
            negative_words = ["差", "坑", "后悔", "避雷", "劝退", "难", "卷", "加班"]
            pos = sum(all_text.count(w) for w in positive_words)
            neg = sum(all_text.count(w) for w in negative_words)
            total = pos + neg
            if total > 0:
                score = 40 + 50 * (pos / total)
            notes = f"基于{len(ctx.kkdaxue_posts)}条社区反馈估算，正面词{pos}/负面词{neg}"

        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=prof.code,
            raw_score=min(100, round(score, 1)),
            confidence=0.55 if not ctx.kkdaxue_posts else 0.65,
            freshness_date=datetime.now(),
            source_count=len(ctx.kkdaxue_posts) or 1,
            notes=notes,
        )
