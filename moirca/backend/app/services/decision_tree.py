"""
决策树引擎
P0核心：根据分数+省份+三步选择 → 生成用户画像 + 冲稳保策略
"""
from typing import Optional


class DecisionTreeEngine:
    """三步决策树引擎，输出用户画像和冲稳保策略"""

    STEP1_OPTIONS = {
        "A": {"label": "前5%（顶尖）", "tier": "elite"},
        "B": {"label": "前5%-15%（较好）", "tier": "above_average"},
        "C": {"label": "前15%-40%（普通）", "tier": "average"},
        "D": {"label": "40%以后", "tier": "below_average"},
    }

    STEP2_OPTIONS = {
        "A": {"label": "学校名气", "priority": "school_prestige"},
        "B": {"label": "专业实力", "priority": "major_strength"},
        "C": {"label": "城市发展", "priority": "city_development"},
        "D": {"label": "就业前景", "priority": "career_prospect"},
    }

    STEP3_OPTIONS = {
        "A": {"label": "不想学数学/物理", "exclude_categories": ["理学", "数学", "物理"]},
        "B": {"label": "不想进工厂/工地", "exclude_categories": ["土木", "机械", "化工", "矿业"]},
        "C": {"label": "不想当老师/医生", "exclude_categories": ["师范", "临床医学"]},
        "D": {"label": "没有特别限制", "exclude_categories": []},
    }

    @classmethod
    def analyze(cls, score: float, full_mark: float, province: str,
                step1: str, step2: str, step3: str) -> dict:
        """完整分析，返回用户画像"""
        score_pct = score / full_mark

        # 确定分数段位
        if score_pct >= 0.85:
            auto_tier = "A"
        elif score_pct >= 0.70:
            auto_tier = "B"
        elif score_pct >= 0.50:
            auto_tier = "C"
        else:
            auto_tier = "D"

        # 冲稳保比例
        ratio_map = {
            "A": {"冲": 0.40, "稳": 0.40, "保": 0.20},
            "B": {"冲": 0.30, "稳": 0.40, "保": 0.30},
            "C": {"冲": 0.20, "稳": 0.40, "保": 0.40},
            "D": {"冲": 0.10, "稳": 0.30, "保": 0.60},
        }
        ratio = ratio_map.get(auto_tier, ratio_map["C"])

        # 优先级权重调整
        priority_weights = {"school_prestige": 0.3, "major_strength": 0.3, "city_development": 0.2, "career_prospect": 0.2}
        priority = cls.STEP2_OPTIONS.get(step2, {}).get("priority", "career_prospect")

        # 排除类别
        exclude_categories = cls.STEP3_OPTIONS.get(step3, {}).get("exclude_categories", [])

        return {
            "score": score,
            "full_mark": full_mark,
            "score_percentage": round(score_pct * 100, 1),
            "auto_tier": auto_tier,
            "user_tier": step1,
            "tier_label": cls.STEP1_OPTIONS.get(step1, {}).get("label", ""),
            "priority": priority,
            "priority_label": cls.STEP2_OPTIONS.get(step2, {}).get("label", ""),
            "exclude_categories": exclude_categories,
            "exclusion_label": cls.STEP3_OPTIONS.get(step3, {}).get("label", ""),
            "suggest_ratio": ratio,
        }
