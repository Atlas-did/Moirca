"""
API调用重试机制（继承自MiroFish）
"""
import time
import random
import functools
from typing import Callable, Any, Optional, Tuple
from .logger import get_logger

logger = get_logger('moirca.retry')


def retry_with_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    exceptions: Tuple[type, ...] = (Exception,),
):
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            delay = initial_delay
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        raise
                    current_delay = min(delay, max_delay)
                    if jitter:
                        current_delay *= (0.5 + random.random())
                    logger.warning(
                        f"{func.__name__} 第{attempt+1}次失败: {e}, "
                        f"{current_delay:.1f}秒后重试..."
                    )
                    time.sleep(current_delay)
                    delay *= backoff_factor
        return wrapper
    return decorator
