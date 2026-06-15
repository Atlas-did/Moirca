"""
Moirca 七Agent系统

Agent 1-5: 并行调研（官方/口碑/时效/冲突/趋势）
Agent 6:   融合炼金术士（加权融合 + 四大修正因子）
Agent 7:   报告生成器（待实现）
"""
from .base import BaseAgent, AgentContext
from .agent1_official_hunter import Agent1OfficialHunter
from .agent2_word_of_mouth import Agent2WordOfMouth
from .agent3_freshness_dog import Agent3FreshnessDog
from .agent4_conflict_detective import Agent4ConflictDetective
from .agent5_trend_prophet import Agent5TrendProphet
from .agent6_fusion_alchemist import (
    FusionAlchemist,
    AgentOutput,
    UserConfig,
    ProfessionFeatures,
    FusionResult,
    MockAgentOutputs,
)
