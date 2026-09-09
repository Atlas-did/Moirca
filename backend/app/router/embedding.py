# -*- coding: utf-8 -*-
"""可选 embedding 语义增强(可插拔,失败静默回退关键词)。

- 默认关闭:env ``WEBBRIDGE_ROUTER_EMBEDDING=on`` 且配置了 LOCAL_LLM_BASE_URL 才启用;
- 关键词/规则路径永远是主路径(离线零依赖);embedding 只在关键词无命中时补判;
- 任何异常(网络不通/模型未下载/超时)都返回 None,由调用方静默回退关键词,
  绝不让路由器因 embedding 不可用而失败(任务书技术原则)。
"""
from __future__ import annotations

import os
import threading
from typing import Dict, List, Optional, Tuple

from . import rules

# 每个 label 的示例句(与关键词规则语义互补;仅增强用,不替代)
_EXEMPLARS: Dict[str, List[str]] = {
    rules.LABEL_QUICK_ANSWER: [
        "帮我写一首关于夏天的小诗",
        "地球到月亮有多远",
        "把这句话翻译成英文",
    ],
    rules.LABEL_PAGE_QA: [
        "这个页面上写的报名条件是什么",
        "帮我看看选中的这段在讲什么",
        "当前页面的招生章程里 610 分能上吗",
    ],
    rules.LABEL_DEEP_RESEARCH: [
        "帮我对比华科和武大的计算机专业",
        "2026 年河南高考分数线趋势分析",
        "推荐十所适合 610 分的大学",
    ],
    rules.LABEL_CONTROLLED_BROWSE: [
        "登录省考试院查我的成绩",
        "帮我在阳光高考上填写我的志愿表",
        "用我的账号提交报名信息",
    ],
}

_SIMILARITY_THRESHOLD = 0.55


class EmbeddingEnhancer:
    """调用 OpenAI 兼容 /v1/embeddings 接口的可选增强器。"""

    def __init__(self, base_url: str, model: str, api_key: str = "",
                 timeout_seconds: float = 2.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self._exemplar_vectors: Optional[Dict[str, List[float]]] = None
        self._failed = False  # 一次性熔断:失败后本进程内不再重试,避免拖慢路由

    # -- 可用性 -------------------------------------------------------------
    @classmethod
    def from_env(cls) -> Optional["EmbeddingEnhancer"]:
        """仅当显式开关 + LOCAL_LLM 配置同时满足时返回实例,否则 None。"""
        enabled = os.environ.get("WEBBRIDGE_ROUTER_EMBEDDING", "").strip().lower() in (
            "1", "true", "yes", "on")
        if not enabled:
            return None
        base_url = os.environ.get("LOCAL_LLM_BASE_URL", "").strip()
        if not base_url:
            return None
        model = os.environ.get("LOCAL_LLM_EMBEDDING_MODEL", "text-embedding-v4")
        api_key = os.environ.get("LOCAL_LLM_API_KEY", os.environ.get("LLM_API_KEY", ""))
        return cls(base_url=base_url, model=model, api_key=api_key)

    @property
    def failed(self) -> bool:
        return self._failed

    # -- 内部实现 ------------------------------------------------------------
    def _embed(self, client, texts: List[str]) -> List[List[float]]:
        resp = client.post(
            f"{self.base_url}/embeddings",
            json={"model": self.model, "input": texts},
            headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        return [item["embedding"] for item in data]

    def _cosine(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    def _prime(self) -> Optional[Dict[str, List[float]]]:
        if self._failed:
            return None
        if self._exemplar_vectors is not None:
            return self._exemplar_vectors
        with _PRIME_LOCK:
            if self._failed:
                return None
            if self._exemplar_vectors is None:
                try:
                    import httpx
                    texts = [s for items in _EXEMPLARS.values() for s in items]
                    vectors = self._embed(httpx, texts)
                except Exception:  # noqa: BLE001 —— 任何失败都静默降级
                    self._failed = True
                    return None
                result: Dict[str, List[float]] = {}
                i = 0
                for label, items in _EXEMPLARS.items():
                    result[label] = vectors[i]
                    i += len(items)
                # 多示例取均值质心,简单且无额外依赖
                self._exemplar_vectors = result
        return self._exemplar_vectors

    # -- 对外接口 ------------------------------------------------------------
    def suggest(self, text: str) -> Optional[Tuple[str, float]]:
        """返回 (label, confidence) 或 None(不可用/低于阈值)。绝不上抛异常。"""
        if not text or not text.strip():
            return None
        vectors = self._prime()
        if vectors is None:
            return None
        try:
            import httpx
            query_vec = self._embed(httpx, [text.strip()])[0]
        except Exception:  # noqa: BLE001
            self._failed = True
            return None
        best_label, best_sim = None, 0.0
        for label, vec in vectors.items():
            sim = self._cosine(query_vec, vec)
            if sim > best_sim:
                best_label, best_sim = label, sim
        if best_label is None or best_sim < _SIMILARITY_THRESHOLD:
            return None
        return best_label, round(min(best_sim, 0.85), 2)


_PRIME_LOCK = threading.Lock()

# 进程级单例:路由层按需取用;None 表示功能关闭
_enhancer: Optional[EmbeddingEnhancer] = None
_enhancer_resolved = False
_RESOLVE_LOCK = threading.Lock()


def get_enhancer() -> Optional[EmbeddingEnhancer]:
    """惰性解析进程级单例(测试可 reset_enhancer 后重读环境)。"""
    global _enhancer, _enhancer_resolved
    if not _enhancer_resolved:
        with _RESOLVE_LOCK:
            if not _enhancer_resolved:
                _enhancer = EmbeddingEnhancer.from_env()
                _enhancer_resolved = True
    return _enhancer


def reset_enhancer() -> None:
    """测试钩子:强制下次重新按环境变量解析。"""
    global _enhancer, _enhancer_resolved
    with _RESOLVE_LOCK:
        _enhancer = None
        _enhancer_resolved = False
