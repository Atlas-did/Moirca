"""多平台多轮社会模拟（MVP 骨架）。

目标：
- 先把接口与任务状态跑通（N 轮、平台列表、产出可引用文本）
- 有 LLM_API_KEY 时：用 LLM 生成每轮“平台帖子/观点”
- 无 key：输出模板内容，方便前端联调

不做真实爬虫；后续可把生成器替换为 Twitter/Reddit 抓取或 OASIS。
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, cast

from ..config import Config
from ..utils.llm_client import LLMClient


@dataclass
class SimulationStatus:
    simulation_id: str
    state: str  # queued/running/succeeded/failed
    progress: float
    message: str
    created_at: str
    updated_at: str
    result_path: Optional[str] = None
    error: Optional[str] = None


class SimulationService:
    def __init__(self):
        self._lock = threading.Lock()
        self._jobs: Dict[str, SimulationStatus] = {}

    def _sim_dir(self) -> str:
        base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "simulations")
        os.makedirs(base, exist_ok=True)
        return base

    def start(self, topic: str, rounds: int, platforms: List[str], seed_context: Optional[Dict[str, Any]] = None) -> str:
        simulation_id = uuid.uuid4().hex
        now = _dt.datetime.now(_dt.UTC).isoformat()
        status = SimulationStatus(
            simulation_id=simulation_id,
            state="queued",
            progress=0.0,
            message="queued",
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            self._jobs[simulation_id] = status

        t = threading.Thread(
            target=self._run_worker,
            args=(simulation_id, topic, rounds, platforms, seed_context or {}),
            daemon=True,
        )
        t.start()
        return simulation_id

    def get_status(self, simulation_id: str) -> SimulationStatus:
        with self._lock:
            if simulation_id not in self._jobs:
                raise KeyError(simulation_id)
            return self._jobs[simulation_id]

    def load_result(self, simulation_id: str) -> Dict[str, Any]:
        status = self.get_status(simulation_id)
        if not status.result_path or not os.path.exists(status.result_path):
            raise FileNotFoundError("result not ready")
        with open(status.result_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # ---------------- internal ----------------

    def _set(self, simulation_id: str, **kwargs):
        now = _dt.datetime.now(_dt.UTC).isoformat()
        with self._lock:
            st = self._jobs[simulation_id]
            for k, v in kwargs.items():
                setattr(st, k, v)
            st.updated_at = now

    def _run_worker(self, simulation_id: str, topic: str, rounds: int, platforms: List[str], seed_context: Dict[str, Any]):
        try:
            self._set(simulation_id, state="running", progress=0.02, message="running")

            client = None
            if Config.LLM_API_KEY:
                try:
                    client = LLMClient()
                except Exception:
                    client = None

            results = {
                "simulation_id": simulation_id,
                "topic": topic,
                "platforms": platforms,
                "rounds": rounds,
                "created_at": self.get_status(simulation_id).created_at,
                "seed_context": seed_context,
                "round_outputs": [],
            }

            for r in range(1, max(1, rounds) + 1):
                round_obj = {"round": r, "platform_posts": {}}
                for p in platforms or ["twitter", "reddit"]:
                    round_obj["platform_posts"][p] = self._gen_posts(client, platform=p, topic=topic, round_num=r, seed_context=seed_context)

                results["round_outputs"].append(round_obj)
                self._set(simulation_id, progress=min(0.98, r / max(1, rounds)), message=f"round {r}/{rounds} done")
                time.sleep(0.05)

            path = os.path.join(self._sim_dir(), f"{simulation_id}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

            self._set(simulation_id, state="succeeded", progress=1.0, message="succeeded", result_path=path)

        except Exception as e:
            self._set(simulation_id, state="failed", progress=1.0, message="failed", error=str(e))

    def _gen_posts(self, client: Optional[LLMClient], platform: str, topic: str, round_num: int, seed_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not client:
            return [
                {
                    "platform": platform,
                    "author": "template_user",
                    "stance": "neutral",
                    "text": f"（模板）第{round_num}轮：讨论 {topic} 的就业/门槛/城市选择，建议多方核验。",
                    "signals": ["sample_bias", "needs_verification"],
                }
            ]

        import json as _json

        ctx = _json.dumps(seed_context, ensure_ascii=False)[:3000]
        system = (
            "你在做社交平台舆情模拟，用于志愿填报决策的‘口碑/风险/争议点’整理。"
            "输出严格 JSON 数组，每个元素字段：author,stance,text,signals（数组）。"
        )
        user = (
            f"平台={platform}，第{round_num}轮，主题={topic}\n"
            f"上下文（可为空）：{ctx}\n"
            "要求：生成 3 条帖子，语气自然，包含至少 1 条争议点。"
        )
        data = client.chat_json(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
            max_tokens=800,
        )
        if isinstance(data, list):
            posts_any = data
        else:
            posts_any = data.get("posts") if isinstance(data, dict) else None
        if not isinstance(posts_any, list):
            return []

        posts = cast(List[Dict[str, Any]], posts_any)

        norm = []
        for p in posts[:5]:
            if not isinstance(p, dict):
                continue
            norm.append(
                {
                    "platform": platform,
                    "author": p.get("author", "anon"),
                    "stance": p.get("stance", "neutral"),
                    "text": p.get("text", ""),
                    "signals": p.get("signals", []) if isinstance(p.get("signals"), list) else [],
                }
            )
        return norm


# 进程级单例
simulation_service = SimulationService()
