"""
Agent 3: 时效警犬（Freshness Dog）

职责: 监控专业撤销/新增/改名/合并等时效性变化
分析维度: 教育部专业目录变更、新增专业风险、撤销专业预警
"""
from datetime import datetime
from ..utils.llm_client import LLMClient
from .base import BaseAgent, AgentContext
from .agent6_fusion_alchemist import AgentOutput


class Agent3FreshnessDog(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "时效警犬"

    def _system_prompt(self) -> str:
        return """你是一位教育政策研究员，专门追踪教育部专业目录的变更动态。

你的分析必须关注:
1. 专业撤销/停招: 该专业是否被教育部撤销或某校停招？
2. 新增专业: 如果是新开设专业（<5年），师资和课程体系可能不成熟
3. 专业改名: 很多专业只是换名字（"传统XX"→"智能XX"），实质内容不变
4. 目录调整: 一级学科调整会影响考研和就业方向

时效性评分标准（0-100）:
- 90-100: 成熟稳定专业（开设>20年，目录无变更）
- 75-89: 较稳定，近年有微调但核心不变
- 60-74: 有变更记录，需关注具体内容
- 40-59: 新专业（<5年）或近年有大调整
- 0-39: 已撤销/停招/高风险

返回JSON格式:
{
  "raw_score": 数字(0-100),
  "confidence": 数字(0-1),
  "stability": "非常稳定/基本稳定/有风险/高风险",
  "recent_changes": ["变更描述"],
  "risk_warning": "风险提示(如有)",
  "established_year": "推测的设立年份或'成熟期(>20年)'/'成长期(5-20年)'/'新设(<5年)'"
}"""

    def _build_user_prompt(self, ctx: AgentContext) -> str:
        prof = ctx.profession
        return f"""请从时效性和稳定性角度分析以下专业:

专业: {prof.name} ({prof.code})
学科门类: {prof.category}
一级学科: {prof.discipline or "未知"}

请评估:
1. 该专业是否属于近年新增/撤销/改名的高风险类别？
2. 该专业的核心课程体系是否成熟？
3. 该专业在教育部专业目录中的稳定性如何？"""

    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=ctx.profession.code,
            raw_score=float(response.get("raw_score", 75)),
            confidence=float(response.get("confidence", 0.75)),
            freshness_date=datetime.now(),
            source_count=2,
            notes=response.get("stability", response.get("risk_warning", "")),
        )

    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        prof = ctx.profession
        # 规则: 经典专业高分，新兴专业低分
        new_major_keywords = ["人工智能", "大数据", "区块链", "元宇宙", "智能", "数字"]
        classic_keywords = ["计算机科学与技术", "临床医学", "法学", "会计学", "汉语言文学"]

        if any(prof.name == c for c in classic_keywords):
            score, stability = 95, "非常稳定"
        elif any(kw in prof.name for kw in new_major_keywords):
            score, stability = 55, "有风险(新兴专业)"
        else:
            score, stability = 80, "基本稳定"

        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=prof.code,
            raw_score=score,
            confidence=0.75,
            freshness_date=datetime.now(),
            source_count=2,
            notes=f"[规则降级] {stability}",
        )
