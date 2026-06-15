"""
Agent 4: 矛盾侦探（Conflict Detective）

职责: 交叉验证官方数据与社区口碑，发现信息矛盾
分析维度: 官方就业率 vs 社区真实反馈、招生宣传 vs 实际就读体验
"""
from datetime import datetime
from typing import List
from ..utils.llm_client import LLMClient
from .base import BaseAgent, AgentContext
from .agent6_fusion_alchemist import AgentOutput


def _safe_format_summary(official_data: dict) -> str:
    """安全格式化 official_data.summary，兼容 list/dict/string"""
    if not official_data:
        return "暂无官方数据"
    summary = official_data.get("summary")
    if not summary:
        return "暂无官方数据"
    if isinstance(summary, list):
        return "\n".join(f"- {item}" for item in summary)
    if isinstance(summary, dict):
        return "\n".join(f"- {k}: {v}" for k, v in summary.items())
    return str(summary)


class Agent4ConflictDetective(BaseAgent):

    @property
    def agent_name(self) -> str:
        return "矛盾侦探"

    def _system_prompt(self) -> str:
        return """你是一位信息核查专家，专门交叉验证不同来源的数据，发现信息矛盾。

你的工作方式:
1. 对比官方数据与社区口碑: 官方说就业率95%，但社区说"班里一半人没找到工作"→ 矛盾
2. 识别美化表述: "就业前景广阔" = 没有具体数据；"深造率高" = 本科就业难
3. 发现缺失信息: 招生宣传中刻意回避的信息（如转专业难度、真实薪资）
4. 评估矛盾严重程度: 影响决策的关键矛盾 vs 可忽略的细节差异

你的输出将直接影响 Agent 6 融合计算的"置信度校准因子 C(p)"。

返回JSON格式:
{
  "raw_score": 数字(0-100) — 数据一致性评分，100=完全一致，
  "confidence": 数字(0-1),
  "conflict_severity": "none/low/medium/high/critical",
  "conflicts_found": [{"topic": "矛盾主题", "official": "官方说法", "community": "社区反馈", "impact": "高/中/低"}],
  "verdict": "数据基本一致 / 存在可解释差异 / 存在重大矛盾需人工核实"
}"""

    def _build_user_prompt(self, ctx: AgentContext) -> str:
        prof = ctx.profession
        # 如果有 Agent 1 和 Agent 2 的输出，进行交叉验证
        official_data = ctx.official_data or {}
        posts = ctx.kkdaxue_posts or []

        return f"""请交叉验证以下专业的信息:

专业: {prof.name} ({prof.category})

官方数据摘要:
{_safe_format_summary(official_data)}

社区反馈摘要 (共{len(posts)}条):
{chr(10).join(p[:200] for p in posts[:3]) if posts else "暂无社区反馈"}

请找出官方数据与社区反馈之间的矛盾、美化或缺失信息。如果没有足够数据做交叉验证，请诚实说明。"""

    def _parse_response(self, response: dict, ctx: AgentContext) -> AgentOutput:
        # Agent 4 的 raw_score 表示数据一致性，不是对专业的评价
        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=ctx.profession.code,
            raw_score=float(response.get("raw_score", 70)),
            confidence=float(response.get("confidence", 0.55)),
            freshness_date=datetime.now(),
            source_count=len(response.get("conflicts_found", [])),
            notes=response.get("verdict", ""),
        )

    def _research_fallback(self, ctx: AgentContext) -> AgentOutput:
        prof = ctx.profession
        posts_count = len(ctx.kkdaxue_posts or [])
        official_count = len(ctx.official_data or {})
        contributed = ctx.contributed_data or {}
        contributed_count = contributed.get('count', 0)
        contributed_verified = contributed.get('verified_count', 0)
        contributed_avg_score = contributed.get('avg_score', 0)

        # P2 三源验证规则
        sources = sum([
            1 if posts_count > 0 else 0,
            1 if official_count > 0 else 0,
            1 if contributed_count > 0 else 0,
        ])

        if sources >= 3:
            # 三源验证：权重最高
            if contributed_verified >= 3 and contributed_avg_score >= 70:
                score, verdict = 85, f"三源验证(官方+社区+{contributed_verified}条用户贡献)，数据高度一致"
            elif contributed_verified >= 1:
                score, verdict = 75, f"三源验证，{contributed_verified}条用户贡献数据佐证"
            else:
                score, verdict = 70, "三源数据可交叉验证"
        elif sources == 2:
            if contributed_count > 0 and contributed_avg_score >= 70:
                score, verdict = 72, f"双源验证(含{contributed_verified}条用户贡献)，数据较一致"
            elif posts_count > 0 and official_count > 0:
                score, verdict = 65, "双源数据可交叉验证"
            elif contributed_count > 0:
                score, verdict = 55, "仅有贡献数据和单一源，待更多验证"
            else:
                score, verdict = 50, "双源数据，缺第三方验证"
        elif sources == 1:
            if contributed_count > 0:
                score, verdict = 48, "仅用户贡献数据，缺官方和社区验证"
            elif posts_count > 0:
                score, verdict = 50, "仅有社区数据，缺官方对比"
            else:
                score, verdict = 50, "仅有官方数据，缺社区验证"
        else:
            score, verdict = 40, "数据不足，无法交叉验证"

        return AgentOutput(
            agent_name=self.agent_name,
            profession_code=prof.code,
            raw_score=score,
            confidence=0.55 if score >= 65 else 0.40,
            freshness_date=datetime.now(),
            source_count=posts_count + official_count + contributed_count,
            notes=f"[规则降级·{sources}源] {verdict}",
        )
