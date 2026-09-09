"""
Agent 5: 趋势先知（Trend Prophet）

职责: 就业倒推分析 + 政策趋势预测 + 张雪峰决策框架融入
分析维度: 就业市场中位数、产业政策方向、技术替代风险、家庭背景适配
"""
from .agent6_fusion_alchemist import AgentOutput
from .base import AgentContext, BaseAgent, freshness_with_marker


class Agent5TrendProphet(BaseAgent):

    # 张雪峰框架核心原则
    ZHANGXUEFENG_PRINCIPLES = """
张雪峰决策框架核心原则:
1. 就业倒推法: 不看专业名字好不好听，看毕业3-5年后中间50%的人去了哪里、挣多少钱
2. 中位数原则: 不看出类拔萃的5%，不看最差的5%，看中间的50%
3. 不可替代性原则: 你的工资与你工作的不可替代性成正比
4. 家庭背景分流: 有资源的家庭选金融/法学靠人脉，普通家庭选工科/医学靠技术
5. 城市>学校>专业: 大城市211好于小城市985（眼界和人脉）
6. AI时代校正: 重复性脑力劳动面临替代风险，创意+人际+手艺类相对安全
"""

    @property
    def agent_name(self) -> str:
        return "趋势先知"

    def _system_prompt(self) -> str:
        return f"""你是一位职业规划与产业趋势分析师，擅长用张雪峰老师的决策框架分析专业前景。

{self.ZHANGXUEFENG_PRINCIPLES}

你的评分标准（0-100）:
- 90-100: 朝阳产业核心专业，就业确定性强，不可替代性高
- 75-89: 稳定行业主力专业，就业面广，受AI冲击小
- 60-74: 传统行业专业，就业尚可但天花板有限
- 40-59: 夕阳产业或严重供过于求的专业
- 0-39: 高危专业（AI高度可替代/产业衰退/严重内卷）

返回JSON格式:
{{
  "raw_score": 数字(0-100),
  "confidence": 数字(0-1),
  "career_outlook": "就业前景描述(80字)",
  "median_salary_estimate": "中位数薪资预估",
  "ai_risk": "高/中/低 - AI替代风险评估",
  "family_advice": "针对{{family_bg}}家庭的建议",
  "five_year_outlook": "5年后就业预测",
  "irreplaceability": "不可替代性评估(高/中/低)"
}}"""

    def _build_user_prompt(self, ctx: AgentContext) -> str:
        prof = ctx.profession
        cfg = ctx.user_config
        return f"""请用张雪峰决策框架分析以下专业的前景:

专业: {prof.name}
学科门类: {prof.category}
考生家庭背景: {cfg.family_bg or "普通工薪家庭"}
考生经济条件: {cfg.economic_tier}
考生偏好: {cfg.priority}

请从以下角度分析:
1. 就业倒推: 该专业毕业3-5年后，中间50%的人去向和薪资？
2. AI替代风险: 该专业的工作内容是否容易被AI替代？
3. 家庭适配: 该专业对{cfg.economic_tier}家庭的孩子是否友好？（培养周期、学费、回报率）
4. 5年趋势: 未来5年该专业的就业前景变化"""

    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        # freshness 修复:只认就业/政策数据自带的真实时间戳;无则显式「时间未知」。
        ts, unknown_mark = freshness_with_marker(ctx)
        notes = response.get("career_outlook", response.get("family_advice", ""))
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=ctx.profession.code,
            raw_score=float(response.get("raw_score", 70)),
            confidence=float(response.get("confidence", 0.70)),
            freshness_date=ts,
            source_count=3,
            notes=f"{unknown_mark}{notes}" if unknown_mark else notes,
        )

    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        prof = ctx.profession
        cfg = ctx.user_config

        score = 65.0
        ai_risk = "中"

        # 张雪峰规则: 工学/医学 → 不可替代性高
        if prof.category in ["工学", "医学"]:
            score += 10
            ai_risk = "低"
        elif prof.category in ["理学"]:
            score += 5
        elif prof.category in ["管理学", "文学"]:
            score -= 5
            ai_risk = "高" if "管理" in prof.name else "中"

        # 家庭背景修正
        if cfg.economic_tier == "working":
            if prof.category in ["医学"] and "八年" in prof.name:
                score -= 10  # 长周期对普通家庭不友好
            if "师范" in prof.name or "护理" in prof.name:
                score += 8   # 稳定就业对普通家庭友好

        notes = f"[规则降级] {prof.category}门类, AI风险={ai_risk}"
        if cfg.economic_tier == "working":
            notes += ", 普通家庭适配分析"

        ts, unknown_mark = freshness_with_marker(ctx)
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=prof.code,
            raw_score=min(100, max(20, score)),
            confidence=0.70,
            freshness_date=ts,
            source_count=3,
            notes=f"{notes}{unknown_mark}",
        )
