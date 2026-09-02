"""系统日志 API。"""

from __future__ import annotations

import os
from typing import Any, Dict, List

from fastapi import APIRouter

from ..utils.logger import LOG_DIR

router = APIRouter()


def _latest_log_file() -> str | None:
    if not os.path.exists(LOG_DIR):
        return None
    candidates = []
    for name in os.listdir(LOG_DIR):
        if name.endswith(".log"):
            path = os.path.join(LOG_DIR, name)
            candidates.append((os.path.getmtime(path), path))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def _tail(path: str, lines: int = 200) -> List[str]:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        data = f.readlines()
    return [line.rstrip("\n") for line in data[-max(1, min(lines, 1000)):]]


@router.get("/recent")
def recent_logs(lines: int = 120) -> Dict[str, Any]:
    path = _latest_log_file()
    if not path:
        return {"path": None, "lines": []}
    return {"path": path, "lines": _tail(path, lines=lines)}