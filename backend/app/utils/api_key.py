"""占位/示例 API key 的统一识别。

采用「前缀匹配」而非「子串匹配」：
- 避免任何含 "test" 前缀之外的真实 key 被静默当作假 key 走规则降级；
- 命中时返回 True，调用方应明确记录日志并走规则降级。
"""
from __future__ import annotations

from typing import Optional

# 命中这些前缀即视为占位 key（大小写不敏感）
_SCAM_PREFIXES = (
    "sk-test",
    "sk-placeholder",
    "sk-your",
    "your-api",
    "your_api",
    "your-key",
    "your_key",
    "placeholder",
    "test-",
    "sample",
    "demo",
    "changeme",
    "xxxx",
)


def is_placeholder_api_key(key: Optional[str]) -> bool:
    """key 缺失、为空、或以占位前缀开头时返回 True。

    前缀匹配示例：
      - "sk-test-abc123"      → True
      - "placeholder-xxx"     → True
      - "real-key-with-testing" → False（子串匹配会误伤，前缀匹配不会）
    """
    if not key or not str(key).strip():
        return True
    k = str(key).strip().lower()
    return any(k.startswith(p) for p in _SCAM_PREFIXES)
