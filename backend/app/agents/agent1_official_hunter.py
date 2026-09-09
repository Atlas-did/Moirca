"""
Agent 1: 官方猎手（Official Hunter）

职责: 从阳光高考网、省考试院等官方渠道收集数据
分析维度: 分数线趋势、招生计划变化、专业认证状态、学科评估等级
"""
from ..utils.untrusted import UNTRUSTED_NOTICE
from .agent6_fusion_alchemist import AgentOutput
from .base import AgentContext, BaseAgent, freshness_with_marker


class Agent1OfficialHunter(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "官方猎手"

    def _system_prompt(self) -> str:
        return UNTRUSTED_NOTICE + "\n\n" + """你是一位高考数据分析专家，负责从教育部、省考试院、阳光高考网等官方渠道分析专业数据。

你的分析必须基于以下原则:
1. 数据优先: 优先引用可量化的数据（分数线、排名、招生人数）
2. 趋势判断: 分析近3年数据变化趋势，不是只看一年
3. 客观中立: 不夸大、不贬低，用数据说话
4. 省份差异: 注意不同省份的录取难度差异

评分标准（0-100）:
- 90-100: 顶尖专业（学科评估A+，录取位次省内前1%）
- 75-89: 优秀专业（学科评估A/B+，录取位次前5%）
- 60-74: 一般专业（学科评估B/C，录取位次前15%）
- 40-59: 普通专业（学科评估C以下，或新开设专业）
- 0-39: 需谨慎（无认证、频繁停招、就业数据差）

返回JSON格式:
{
  "raw_score": 数字(0-100),
  "confidence": 数字(0-1),
  "analysis": "分析文本(100字以内)",
  "data_points": ["数据点1", "数据点2"],
  "trend": "上升/稳定/下降",
  "recommendation_tier": "强烈推荐/推荐/一般/谨慎"
}"""

    def _build_user_prompt(self, ctx: AgentContext) -> str:
        prof = ctx.profession
        cfg = ctx.user_config
        return f"""请从官方数据角度分析以下专业:

专业: {prof.name} ({prof.code})
学科门类: {prof.category}
一级学科: {prof.discipline or "未知"}
考生省份: {cfg.province}
考生分数段位: {cfg.score_tier}级

该专业的官方数据:
{chr(10).join(f"- {d}" for d in (ctx.official_data or {}).get("summary", ["暂缺官方数据，请基于专业知识评估"]))}

请基于以上信息，给出你的评分和分析。"""

    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        # freshness 修复:只认官方数据自带的真实时间戳;无则显式「时间未知」。
        ts, unknown_mark = freshness_with_marker(ctx)
        notes = response.get("analysis", "")
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=ctx.profession.code,
            raw_score=float(response.get("raw_score", 70)),
            confidence=float(response.get("confidence", 0.85)),
            freshness_date=ts,
            source_count=len(response.get("data_points", [])),
            notes=f"{unknown_mark}{notes}" if unknown_mark else notes,
        )

    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        """降级: 基于学科门类和关键词的规则评分"""
        prof = ctx.profession
        score = 70.0

        # 工学/医学 基础分更高
        if prof.category in ["工学", "医学"]:
            score += 5
        elif prof.category in ["理学"]:
            score += 3
        # 985常见专业加分
        elite_majors = ["计算机科学与技术", "软件工程", "临床医学", "电气工程及其自动化"]
        if any(m in prof.name for m in elite_majors):
            score += 5

        ts, unknown_mark = freshness_with_marker(ctx)
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=prof.code,
            raw_score=min(100, score),
            confidence=0.80,
            freshness_date=ts,
            source_count=3,
            notes=f"[规则降级] {prof.category}门类，{prof.name}的官方数据分析{unknown_mark}",
        )
