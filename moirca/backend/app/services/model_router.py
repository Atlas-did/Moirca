"""
多模型路由
简单查询 → DeepSeek V4 本地（低成本）
复杂推理 → Sub2API gpt-5.4（强推理）
"""
from enum import Enum
from ..utils.llm_client import LLMClient


class QueryComplexity(str, Enum):
    SIMPLE = "simple"       # 数据检索/格式化 → 本地模型
    MEDIUM = "medium"       # 决策树分析/对比 → gpt-5.4-turbo
    COMPLEX = "complex"     # 综合推荐/报告 → gpt-5.4 完整版


# 路由规则（关键词匹配 + 复杂度判断）
ROUTE_RULES = [
    # 简单查询
    (["查询", "检索", "搜索", "格式化", "列出"], QueryComplexity.SIMPLE),
    # 中等复杂度
    (["对比", "分析", "计算", "判断", "筛选"], QueryComplexity.MEDIUM),
    # 高复杂度
    (["推荐", "预测", "报告", "综合", "建议", "方案"], QueryComplexity.COMPLEX),
]


class ModelRouter:
    """根据请求内容自动路由到合适的模型"""

    def __init__(self):
        self.main_client = None  # 主模型（gpt-5.4，延迟初始化）
        self.local_client = None  # 本地模型（延迟初始化）
        self._local_unavailable = False

    def _get_main_client(self):
        if self.main_client is None:
            self.main_client = LLMClient()
        return self.main_client

    def _get_local_client(self):
        if self.local_client is None:
            try:
                self.local_client = LLMClient(use_local=True)
            except Exception:
                self._local_unavailable = True
        return self.local_client if not self._local_unavailable else None

    def classify(self, query: str) -> QueryComplexity:
        """根据查询内容判断复杂度"""
        query_lower = query.lower()
        for keywords, complexity in ROUTE_RULES:
            if any(kw in query_lower for kw in keywords):
                return complexity
        return QueryComplexity.MEDIUM

    def route(self, query: str, system_prompt: str = "") -> str:
        """
        根据查询复杂度路由到合适的模型，失败时自动降级到主模型
        """
        complexity = self.classify(query)

        if complexity == QueryComplexity.SIMPLE:
            local = self._get_local_client()
            if local:
                try:
                    return local.chat([
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": query},
                    ], temperature=0.3)
                except Exception:
                    pass  # 降级到主模型

        # 使用主模型
        temp = 0.3 if complexity == QueryComplexity.MEDIUM else 0.7
        try:
            main_client = self._get_main_client()
            return main_client.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
            ], temperature=temp)
        except Exception:
            return "LLM 当前不可用，请稍后重试或先使用规则/推荐接口。"
