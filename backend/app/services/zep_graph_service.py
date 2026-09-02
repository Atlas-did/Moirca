"""Zep Cloud 图谱构建（可选）。

仅在：
- 安装了 zep-cloud
- 配置了 Config.ZEP_API_KEY
时可用。

为避免绑定到某个复杂的本体 SDK 细节，这里采用最小可用策略：
- create graph
- add_batch episodes（Zep 会自动抽取实体/关系）

后续如需严格本体约束，可参考 MiroFish 的 graph_builder.py 做完整 ontology 映射。
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Optional

from ..config import Config
from ..utils.file_parser import split_text_into_chunks


class ZepGraphService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or (Config.ZEP_API_KEY or None)
        if not self.api_key:
            raise ValueError("ZEP_API_KEY 未配置")

        try:
            from zep_cloud.client import Zep  # type: ignore
        except Exception as e:  # pragma: no cover
            raise ImportError(
                "未安装 zep-cloud（可选依赖）。请执行: pip install zep-cloud==3.13.0"
            ) from e

        self._zep_cls = Zep
        self.client = self._zep_cls(api_key=self.api_key)

    def build_from_text(
        self,
        text: str,
        graph_name: str = "Moirca Graph",
        chunk_size: int = 800,
        chunk_overlap: int = 80,
        batch_size: int = 3,
        sleep_seconds: float = 0.8,
    ) -> Dict[str, Any]:
        from zep_cloud import EpisodeData  # type: ignore

        graph_id = f"moirca_{uuid.uuid4().hex[:16]}"
        self.client.graph.create(
            graph_id=graph_id,
            name=graph_name,
            description="Moirca knowledge graph (auto-extracted)",
        )

        chunks = split_text_into_chunks(text, chunk_size=chunk_size, overlap=chunk_overlap)
        episode_uuids = []

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            episodes = [EpisodeData(data=c, type="text") for c in batch]
            result = self.client.graph.add_batch(graph_id=graph_id, episodes=episodes)
            if isinstance(result, list):
                for ep in result:
                    ep_uuid = getattr(ep, "uuid_", None) or getattr(ep, "uuid", None)
                    if ep_uuid:
                        episode_uuids.append(ep_uuid)
            if sleep_seconds:
                time.sleep(sleep_seconds)

        return {
            "graph_id": graph_id,
            "graph_name": graph_name,
            "chunks": len(chunks),
            "episodes": len(episode_uuids),
            "episode_uuids": episode_uuids[:20],
        }
