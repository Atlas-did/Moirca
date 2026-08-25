"""
Agent 6: 融合炼金术士（Fusion Alchemist）

核心职责：综合Agent 1-5的并行调研结果，计算最终专业匹配度排名。

融合公式:
  Score(p) = BaseScore(p) × N(p) × C(p) × Z(p)

其中:
  BaseScore(p) = Σ[Agent_i(p) × w_i × d_i(t)] / Σ[w_i × d_i(t)]
  N(p) = 个人叙事匹配度（用户关键词与专业特征的加权覆盖率）
  C(p) = 置信度校准因子（基础置信度 × 冲突惩罚 × 多样性奖励）
  Z(p) = 张雪峰决策框架修正系数

继承自计划书 [P122-P130] 的完整伪代码设计
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import math
import re


# ============================================
# 数据类
# ============================================

@dataclass
class AgentOutput:
    """单个Agent对某个专业的调研输出"""
    agent_name: str          # 官方猎手/口碑矿工/时效警犬/矛盾侦探/趋势先知
    profession_code: str     # 国标专业代码（如 "080901"）
    raw_score: float         # 原始评分 (0-100)，已归一化
    confidence: float        # Agent自身置信度 (0-1)
    freshness_date: datetime # 数据最后更新时间
    source_count: int = 1    # 数据源数量
    notes: str = ""          # 调研摘要


@dataclass
class UserConfig:
    """用户的人工筛选配置（来自决策树选择 + 手动调整）"""
    agent_weights: Dict[str, float] = field(default_factory=lambda: {
        "官方猎手": 1.0, "口碑矿工": 0.8, "时效警犬": 0.7,
        "矛盾侦探": 0.5, "趋势先知": 1.2,
    })
    decay_functions: Dict[str, str] = field(default_factory=lambda: {
        "官方猎手": "step", "口碑矿工": "exponential",
        "时效警犬": "exponential", "矛盾侦探": "linear",
        "趋势先知": "exponential",
    })
    half_lives: Dict[str, int] = field(default_factory=lambda: {
        "官方猎手": 730,    # 官方数据2年半衰期
        "口碑矿工": 365,    # 口碑1年半衰期
        "时效警犬": 90,     # 时效数据90天半衰期
        "矛盾侦探": 180,    # 冲突检测180天
        "趋势先知": 365,
    })
    confirmed_keywords: List[str] = field(default_factory=list)
    keyword_weights: Dict[str, float] = field(default_factory=dict)
    # 用户基础信息
    province: str = "广东"
    # 用户决策树选择
    score_tier: str = "B"      # A/B/C/D
    priority: str = "career_prospect"  # school_prestige/major_strength/city_development/career_prospect
    exclude_categories: List[str] = field(default_factory=list)
    # 家庭背景（影响张雪峰框架修正）
    family_bg: str = ""        # e.g. "普通工薪家庭"
    economic_tier: str = "middle"  # affluent/middle/working


@dataclass
class ProfessionFeatures:
    """专业特征向量（用于叙事匹配和知识图谱节点）"""
    code: str                  # 国标专业代码
    name: str                  # 专业名称
    category: str              # 学科门类（工学/理学/文学等）
    discipline: str = ""       # 一级学科
    keywords: List[str] = field(default_factory=list)
    career_paths: List[str] = field(default_factory=list)
    skill_requirements: List[str] = field(default_factory=list)
    # 关联学校节点（NetworkX图遍历）
    related_schools: List[str] = field(default_factory=list)
    related_majors: List[str] = field(default_factory=list)


@dataclass
class FusionResult:
    """融合计算结果"""
    profession_code: str
    profession_name: str
    match_score: float
    base_score: float
    narrative_match: float
    confidence_calibration: float
    zhangxuefeng_adjustment: float
    breakdown: Dict[str, dict]  # 每个Agent的贡献明细
    tier: str                   # 推荐等级 S/A/B/C/D
    rank: int = 0
    conflict_severity: Optional[str] = None


class TierLabel:
    S = "强烈推荐 (S级)"
    A = "重点考虑 (A级)"
    B = "谨慎考虑 (B级)"
    C = "备选方案 (C级)"
    D = "不推荐 (D级)"


# ============================================
# 融合炼金术士
# ============================================

class FusionAlchemist:
    """
    Agent 6: 融合炼金术士

    工作流程:
    1. 接收 Agent 1-5 并行调研的所有输出
    2. 对每个候选专业:
       a. 计算各Agent加权和（含时效衰减）
       b. 计算个人叙事匹配度 N(p)
       c. 计算置信度校准因子 C(p)
       d. 计算张雪峰框架修正 Z(p)
       e. 最终分数 = BaseScore × N × C × Z
    3. 按最终分数降序排名
    4. 分为 S/A/B/C/D 五级推荐
    """

    # 张雪峰决策框架 → 权重修正
    ZHANGXUEFENG_ADJUSTMENTS = {
        "employment_rate": 1.2,    # 就业确定性高
        "salary_median": 1.15,     # 中位数薪资高
        "family_match": 1.3,       # 家庭背景匹配
        "irreplaceability": 1.1,   # 技术壁垒（工学/理学/医学）
        "city_factor": 1.05,       # 城市红利
    }

    # 高就业确定性专业（张雪峰框架）
    HIGH_CERTAINTY_MAJORS = [
        "师范", "临床", "护理", "电气", "土木", "会计",
        "计算机", "软件", "通信", "自动化",
    ]

    # 技术壁垒学科门类
    HIGH_BARRIER_CATEGORIES = ["工学", "理学", "医学"]

    def __init__(self, user_config: Optional[UserConfig] = None):
        self.config = user_config or UserConfig()

    # -------------------------------------------------------
    # 1. 时效衰减 d_i(t)
    # -------------------------------------------------------

    def time_decay(self, agent_name: str, freshness_date: datetime) -> float:
        """
        时效衰减系数 d_i(t)

        支持三种衰减模式:
          - exponential: d = 0.5^(age/half_life)
          - linear:      d = max(0, 1 - age/(2*half_life))
          - step:        d = 阶梯下降
        """
        decay_type = self.config.decay_functions.get(agent_name, "exponential")
        half_life = self.config.half_lives.get(agent_name, 365)
        age_days = max(0, (datetime.now() - freshness_date).days)

        if decay_type == "exponential":
            return math.pow(0.5, age_days / half_life)
        elif decay_type == "linear":
            return max(0.0, 1.0 - (age_days / (2.0 * half_life)))
        elif decay_type == "step":
            if age_days <= half_life:
                return 1.0
            elif age_days <= 2 * half_life:
                return 0.5
            elif age_days <= 3 * half_life:
                return 0.25
            else:
                return 0.1
        return 1.0

    # -------------------------------------------------------
    # 2. 个人叙事匹配度 N(p)
    # -------------------------------------------------------

    def narrative_match_score(self, profession: ProfessionFeatures) -> float:
        """
        个人叙事匹配度 N(p)

        计算用户确认的关键词与专业特征的加权覆盖率。
        使用 sigmoid 平滑到 0-1 区间。
        """
        keywords = self.config.confirmed_keywords
        if not keywords:
            return 0.5  # 无关键词，中性

        # 构建专业文本特征向量
        prof_text = " ".join(
            [profession.name, profession.category, profession.discipline]
            + profession.keywords
            + profession.career_paths
            + profession.skill_requirements
        ).lower()

        matched_score = 0.0
        total_weight = 0.0

        for kw in keywords:
            kw_weight = self.config.keyword_weights.get(kw, 1.0)
            total_weight += kw_weight

            if kw.lower() in prof_text:
                # 精确匹配
                matched_score += kw_weight
            else:
                # 语义相似度（TODO: 接入embedding计算）
                # 当前用子串模糊匹配
                partial = self._fuzzy_match(kw.lower(), prof_text)
                matched_score += kw_weight * partial

        if total_weight == 0:
            return 0.5

        coverage = matched_score / total_weight
        # sigmoid 平滑: 把覆盖率映射到 (0,1) 区间，中点 0.5 附近最敏感
        return 1.0 / (1.0 + math.exp(-5.0 * (coverage - 0.5)))

    def _fuzzy_match(self, keyword: str, text: str) -> float:
        """简单的模糊匹配（占位，后续接入 embedding）"""
        # 关键词中的每个字如果在文本中出现，贡献部分匹配度
        chars = [c for c in keyword if c.strip() and not c.isascii()]
        if not chars:
            return 0.1
        hits = sum(1 for c in chars if c in text)
        return 0.3 + 0.7 * (hits / len(chars))

    # -------------------------------------------------------
    # 3. 置信度校准 C(p)
    # -------------------------------------------------------

    def confidence_calibration(
        self,
        agent_outputs: List[AgentOutput],
        conflict_severity: Optional[str] = None,
    ) -> float:
        """
        置信度校准因子 C(p)

        C(p) = 基础置信度 × 冲突惩罚 × 多样性奖励

        基础置信度: 加权平均各Agent的confidence
        冲突惩罚:    Agent 4（矛盾侦探）检测到的数据冲突程度
        多样性奖励:  有输出的Agent越多，置信度越高
        """
        if not agent_outputs:
            return 0.3

        # 基础置信度（加权平均）
        total_w = 0.0
        weighted_conf = 0.0
        for ao in agent_outputs:
            w = self.config.agent_weights.get(ao.agent_name, 1.0)
            weighted_conf += ao.confidence * w
            total_w += w
        base_conf = weighted_conf / total_w if total_w > 0 else 0.5

        # 冲突惩罚
        conflict_penalty_map = {
            None: 1.0, "none": 1.0,
            "low": 0.95, "medium": 0.85,
            "high": 0.70, "critical": 0.50,
        }
        penalty = conflict_penalty_map.get(conflict_severity, 1.0)

        # 多样性奖励（活跃Agent越多越可信）
        active_agents = len(set(
            ao.agent_name for ao in agent_outputs if ao.raw_score > 0
        ))
        diversity_bonus = min(1.0, active_agents / 3.0)

        return base_conf * penalty * diversity_bonus

    # -------------------------------------------------------
    # 4. 张雪峰框架修正 Z(p)
    # -------------------------------------------------------

    def zhangxuefeng_adjustment(self, profession: ProfessionFeatures) -> float:
        """
        张雪峰决策框架修正系数 Z(p)

        考虑:
          - 技术壁垒: 工学/理学/医学 → 不可替代性加成
          - 就业确定性: 师范/临床/电气等 → 稳定性加成
          - 家庭背景: 资源型家庭 vs 技术型家庭
          - 城市红利: 是否推荐一线城市优先
        """
        adjustment = 1.0

        # 1. 技术壁垒加成（张雪峰: 有门槛的专业工资才高）
        if profession.category in self.HIGH_BARRIER_CATEGORIES:
            adjustment *= self.ZHANGXUEFENG_ADJUSTMENTS["irreplaceability"]

        # 2. 就业确定性加成
        if any(kw in profession.name for kw in self.HIGH_CERTAINTY_MAJORS):
            adjustment *= self.ZHANGXUEFENG_ADJUSTMENTS["employment_rate"]

        # 3. 家庭背景修正
        if self.config.economic_tier == "working":
            # 普通家庭: 优先就业确定性强、培养周期短的专业
            if any(kw in profession.name for kw in ["师范", "护理", "电气", "会计"]):
                adjustment *= 1.1
            if "医学" in profession.category and "八年" in profession.name:
                adjustment *= 0.85  # 长周期对普通家庭不友好
        elif self.config.economic_tier == "affluent":
            # 富裕家庭: 可以承受长周期高回报
            if profession.category in ["医学", "法学"]:
                adjustment *= 1.1

        # 4. 城市因素（如果用户优先城市发展）
        if self.config.priority == "city_development":
            adjustment *= self.ZHANGXUEFENG_ADJUSTMENTS["city_factor"]

        # 钳制在 [0.7, 1.4]
        return max(0.7, min(1.4, adjustment))

    # -------------------------------------------------------
    # 5. 冲突检测（Agent 4 间接产出）
    # -------------------------------------------------------

    def detect_conflict(self, agent_outputs: List[AgentOutput]) -> Tuple[Optional[str], str]:
        """
        检测Agent之间的评分分歧

        返回: (severity, description)
        """
        scores = [ao.raw_score for ao in agent_outputs if ao.raw_score > 0]
        if len(scores) < 2:
            return None, ""

        max_s = max(scores)
        min_s = min(scores)
        spread = max_s - min_s

        if spread > 50:
            return "critical", f"评分极差 {spread:.0f} 分，数据高度矛盾"
        elif spread > 35:
            return "high", f"评分分歧较大 ({spread:.0f} 分)"
        elif spread > 20:
            return "medium", f"评分有一定分歧 ({spread:.0f} 分)"
        elif spread > 10:
            return "low", f"评分基本一致 (差 {spread:.0f} 分)"
        return None, ""

    # -------------------------------------------------------
    # 6. 主融合函数
    # -------------------------------------------------------

    def fuse(
        self,
        all_agent_outputs: Dict[str, List[AgentOutput]],
        profession_features: Dict[str, ProfessionFeatures],
    ) -> List[FusionResult]:
        """
        主融合计算

        Args:
            all_agent_outputs: {专业代码: [Agent1输出, Agent2输出, ...]}
            profession_features: {专业代码: ProfessionFeatures}

        Returns:
            按 match_score 降序排列的融合结果列表
        """
        results: List[FusionResult] = []

        for prof_code, agent_outputs in all_agent_outputs.items():
            features = profession_features.get(prof_code)
            if not features:
                continue

            # --- Step 1: 基础加权和（含时效衰减）---
            weighted_sum = 0.0
            weight_sum = 0.0
            breakdown = {}

            for ao in agent_outputs:
                w = self.config.agent_weights.get(ao.agent_name, 1.0)
                d = self.time_decay(ao.agent_name, ao.freshness_date)
                effective_w = w * d
                weighted_sum += ao.raw_score * effective_w
                weight_sum += effective_w

                breakdown[ao.agent_name] = {
                    "raw_score": round(ao.raw_score, 2),
                    "user_weight": w,
                    "time_decay": round(d, 4),
                    "effective_weight": round(effective_w, 4),
                    "contribution": round(ao.raw_score * effective_w, 2),
                    "confidence": ao.confidence,
                    "notes": ao.notes[:100] if ao.notes else "",
                }

            base_score = weighted_sum / weight_sum if weight_sum > 0 else 50.0

            # --- Step 2: 冲突检测 ---
            conflict_sev, conflict_desc = self.detect_conflict(agent_outputs)

            # --- Step 3-5: 三大修正因子 ---
            narrative = self.narrative_match_score(features)
            calibration = self.confidence_calibration(agent_outputs, conflict_sev)
            zx_adj = self.zhangxuefeng_adjustment(features)

            # --- Step 6: 最终分数 ---
            final_score = base_score * narrative * calibration * zx_adj
            final_score = max(0.0, min(100.0, final_score))

            # --- Step 7: 推荐等级 ---
            tier = self._tier_classification(final_score)

            # 检查排除规则（门类/一级学科/专业名三者任一命中即排除）
            excluded = any(
                token and (token in features.category or token in features.discipline or token in features.name)
                for token in (self.config.exclude_categories or [])
            )
            if excluded:
                final_score *= 0.5
                tier = TierLabel.C

            results.append(FusionResult(
                profession_code=prof_code,
                profession_name=features.name,
                match_score=round(final_score, 2),
                base_score=round(base_score, 2),
                narrative_match=round(narrative, 4),
                confidence_calibration=round(calibration, 4),
                zhangxuefeng_adjustment=round(zx_adj, 4),
                breakdown=breakdown,
                tier=tier,
                conflict_severity=conflict_sev,
            ))

        # 按最终分数降序排名
        results.sort(key=lambda r: r.match_score, reverse=True)
        for i, r in enumerate(results):
            r.rank = i + 1

        return results

    # -------------------------------------------------------
    # 7. 冲稳保分层
    # -------------------------------------------------------

    def tier_strategy(self, results: List[FusionResult]) -> Dict[str, List[FusionResult]]:
        """
        将融合结果按冲/稳/保分层

        规则:
          冲 (Rush):  match_score ∈ [50, 70) → 有风险但可以尝试
          稳 (Steady): match_score ∈ [70, 85) → 大概率能录
          保 (Safe):   match_score ∈ [85, 100] → 稳妥
        """
        strategy = {"冲": [], "稳": [], "保": []}
        for r in results:
            if r.match_score >= 85:
                strategy["保"].append(r)
            elif r.match_score >= 70:
                strategy["稳"].append(r)
            else:
                strategy["冲"].append(r)

        # 按推荐比例裁剪（融合结果已按分数降序）
        ratio = {"A": (0.40, 0.40, 0.20), "B": (0.30, 0.40, 0.30),
                 "C": (0.20, 0.40, 0.40), "D": (0.10, 0.30, 0.60)}
        tier = self.config.score_tier
        rush_pct, steady_pct, safe_pct = ratio.get(tier, ratio["C"])

        total = len(results)
        if total == 0:
            return strategy

        rush_n = max(0, round(total * rush_pct))
        steady_n = max(0, round(total * steady_pct))
        safe_n = max(0, round(total * safe_pct))
        # 修正四舍五入造成的数量差
        steady_n += total - (rush_n + steady_n + safe_n)

        strategy["冲"] = strategy["冲"][:rush_n]
        strategy["稳"] = strategy["稳"][:steady_n]
        strategy["保"] = strategy["保"][:safe_n]
        return strategy

    # -------------------------------------------------------
    # 辅助方法
    # -------------------------------------------------------

    @staticmethod
    def _tier_classification(score: float) -> str:
        if score >= 85:
            return TierLabel.S
        elif score >= 70:
            return TierLabel.A
        elif score >= 55:
            return TierLabel.B
        elif score >= 40:
            return TierLabel.C
        return TierLabel.D

    def to_dict(self, results: List[FusionResult]) -> List[dict]:
        """将融合结果序列化为API友好格式"""
        return [
            {
                "rank": r.rank,
                "profession_code": r.profession_code,
                "profession_name": r.profession_name,
                "match_score": r.match_score,
                "base_score": r.base_score,
                "tier": r.tier,
                "factors": {
                    "narrative_match": r.narrative_match,
                    "confidence_calibration": r.confidence_calibration,
                    "zhangxuefeng_adjustment": r.zhangxuefeng_adjustment,
                },
                "breakdown": r.breakdown,
                "conflict_severity": r.conflict_severity,
            }
            for r in results
        ]


# ============================================
# Agent 1-5 模拟器（P0阶段：用LLM模拟，后续替换为真实Agent）
# ============================================

class MockAgentOutputs:
    """
    为 Agent 6 融合炼金术士生成模拟的 Agent 1-5 输出。
    在真正的 Agent 1-5 实现之前，用这个来验证融合逻辑。
    """

    AGENT_NAMES = ["官方猎手", "口碑矿工", "时效警犬", "矛盾侦探", "趋势先知"]

    @classmethod
    def generate(
        cls,
        profession_code: str,
        profession_name: str,
        profession_category: str,
        base_score: float = 70,
        spread: float = 15,
    ) -> List[AgentOutput]:
        """
        根据专业信息生成模拟的5人Agent调研结果

        每个Agent从不同角度评分:
          - 官方猎手: 基于公开数据（分数线、招生计划），较稳定
          - 口碑矿工: 基于学生真实反馈，波动较大
          - 时效警犬: 关注专业是否过时/新增，评分与时效强相关
          - 矛盾侦探: 交叉验证，评分可能偏离共识
          - 趋势先知: 基于就业前景预测，偏乐观或悲观
        """
        import random
        rng = random.Random(hash(profession_code) % (2**31))

        now = datetime.now()
        outputs = []

        # 各Agent的评分倾向和置信度
        profiles = [
            ("官方猎手", 0.85, 0, 730),       # 高置信度，数据2年前，step衰减
            ("口碑矿工", 0.65, 15, 365),       # 中置信度，波动±15，1年数据
            ("时效警犬", 0.75, -5, 90),        # 中高置信度，偏保守，90天时效
            ("矛盾侦探", 0.55, 20, 180),       # 低置信度，波动大，可能偏离共识
            ("趋势先知", 0.70, -10, 365),      # 偏悲观或乐观
        ]

        for name, base_conf, bias, half_life_days in profiles:
            # 评分 = 基准分 + 偏差 + 小随机扰动
            score = base_score + bias + rng.uniform(-8, 8)
            score = max(0.0, min(100.0, score))

            # 时效日期：在half_life范围内随机
            age = rng.randint(0, half_life_days)
            fresh_date = now - timedelta(days=age)

            # 置信度：基准 + 小扰动
            conf = base_conf + rng.uniform(-0.1, 0.1)
            conf = max(0.1, min(1.0, conf))

            outputs.append(AgentOutput(
                agent_name=name,
                profession_code=profession_code,
                raw_score=round(score, 1),
                confidence=round(conf, 2),
                freshness_date=fresh_date,
                source_count=rng.randint(1, 10),
                notes=cls._generate_note(name, profession_name, profession_category),
            ))

        return outputs

    @classmethod
    def _generate_note(cls, agent_name: str, major: str, category: str) -> str:
        notes = {
            "官方猎手": f"{major}近三年分数线稳定，招生计划无明显变化",
            "口碑矿工": f"知乎/B站上{major}的讨论偏正面，但部分学生反映课程偏理论",
            "时效警犬": f"{major}专业未被撤销，{category}门类整体稳定",
            "矛盾侦探": f"官方就业率与社区反馈存在差异，需进一步验证",
            "趋势先知": f"{major}符合产业发展方向，AI时代仍有需求",
        }
        return notes.get(agent_name, "")
