"""
知识图谱数据 API — 适配前端 GraphNode/GraphEdge 格式

前端期望:
  GraphNode: { id, label, type, x, y, vx, vy, radius, color, icon, data? }
  GraphEdge: { id, source, target, type, label? }
"""
from __future__ import annotations

import math
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import Config
from ..services.graph_builder_service import GraphBuilderService

router = APIRouter()
_builder = GraphBuilderService()

# 节点类型 → 前端颜色和图标映射
TYPE_STYLE = {
    "school":   {"color": "#10b981", "icon": "🏫", "radius": 26},
    "major":    {"color": "#3b82f6", "icon": "📚", "radius": 24},
    "career":   {"color": "#f97316", "icon": "💼", "radius": 22},
    "system":   {"color": "#6b7280", "icon": "☁️", "radius": 35},
    "user":     {"color": "#f59e0b", "icon": "⭐", "radius": 30},
    "role":     {"color": "#8b5cf6", "icon": "👤", "radius": 28},
    "agent":    {"color": "#8b5cf6", "icon": "🤖", "radius": 28},
}

# 前端的默认布局坐标（环形分布）
def _circular_layout(nodes: list, cx=400, cy=300, r=180):
    """简单环形布局生成 x,y 坐标"""
    result = []
    n = len(nodes)
    for i, node in enumerate(nodes):
        angle = (2 * math.pi * i / n) - math.pi / 2
        result.append({
            **node,
            "x": cx + r * math.cos(angle),
            "y": cy + r * math.sin(angle),
            "vx": 0,
            "vy": 0,
        })
    return result


def _default_graph_payload() -> Dict[str, Any]:
    from ..services.graph_service import KnowledgeGraph

    kg = KnowledgeGraph.build_default()

    nodes = []
    edges = []
    seen_ids = set()

    nodes.append({"id": "cloud", "label": "云端数据", "type": "system"})
    nodes.append({"id": "score", "label": "你的成绩档案", "type": "user"})
    seen_ids.update(["cloud", "score"])

    for node_id, data in kg.graph.nodes(data=True):
        ntype = data.get("type", "major")
        if ntype == "Profession":
            ntype = "major"
        elif ntype == "School":
            ntype = "school"
        elif ntype == "Career":
            ntype = "career"

        if node_id not in seen_ids:
            nodes.append({"id": node_id, "label": data.get("name", node_id), "type": ntype})
            seen_ids.add(node_id)

    for u, v, data in kg.graph.edges(data=True):
        etype = data.get("type", "related")
        if etype == "OFFERED_BY":
            etype = "offer"
        elif etype == "LEADS_TO":
            etype = "career"
        else:
            etype = "related"
        edges.append({"id": f"{u}_{v}", "source": u, "target": v, "type": etype})

    styled_nodes = []
    for n in nodes:
        style = TYPE_STYLE.get(n["type"], TYPE_STYLE["major"])
        styled_nodes.append({**n, **style})

    return {
        "nodes": _circular_layout(styled_nodes),
        "edges": edges,
        "stats": kg.get_stats(),
        "context": {"source": "default"},
    }


def _style_from_raw_graph(payload: Dict[str, Any], *, source: str, source_id: Optional[str] = None) -> Dict[str, Any]:
    nodes = []
    seen_ids = set()
    raw_nodes = payload.get("nodes") or []
    raw_edges = payload.get("edges") or []

    # 为文档图添加一个中心节点，帮助前端看出“上传文档→图谱”的绑定关系
    if source == "document" and source_id:
        nodes.append({"id": f"document:{source_id}", "label": "上传文档", "type": "system"})
        seen_ids.add(f"document:{source_id}")

    for item in raw_nodes:
        node_id = item.get("id")
        if not node_id or node_id in seen_ids:
            continue
        raw_type = item.get("type", "major")
        label = item.get("properties", {}).get("name") or item.get("properties", {}).get("label") or node_id

        if raw_type in {"Profession", "major"}:
            ntype = "major"
        elif raw_type in {"School", "school"}:
            ntype = "school"
        elif raw_type in {"Career", "career"}:
            ntype = "career"
        elif raw_type in {"system", "user", "role", "agent"}:
            ntype = raw_type
        else:
            ntype = "major"

        nodes.append({"id": node_id, "label": label, "type": ntype})
        seen_ids.add(node_id)

    edges = []
    if source == "document" and source_id:
        for item in raw_nodes:
            node_id = item.get("id")
            if not node_id or node_id == f"document:{source_id}":
                continue
            edges.append({
                "id": f"document:{source_id}_{node_id}",
                "source": f"document:{source_id}",
                "target": node_id,
                "type": "related",
                "label": "绑定",
            })

    for idx, edge in enumerate(raw_edges):
        etype = edge.get("type", "related")
        if etype in {"OFFERED_BY", "offer"}:
            etype = "offer"
        elif etype in {"LEADS_TO", "career"}:
            etype = "career"
        else:
            etype = "related"
        edges.append({
            "id": edge.get("id") or f"{edge.get('source')}_{edge.get('target')}_{idx}",
            "source": edge.get("source"),
            "target": edge.get("target"),
            "type": etype,
            "label": edge.get("label"),
        })

    styled_nodes = []
    for n in nodes:
        style = TYPE_STYLE.get(n["type"], TYPE_STYLE["major"])
        styled_nodes.append({**n, **style})

    return {
        "nodes": _circular_layout(styled_nodes),
        "edges": edges,
        "stats": {
            "total_nodes": len(styled_nodes),
            "total_edges": len(edges),
            "profession_count": len([n for n in styled_nodes if n["type"] == "major"]),
            "school_count": len([n for n in styled_nodes if n["type"] == "school"]),
            "career_count": len([n for n in styled_nodes if n["type"] == "career"]),
        },
        "context": {"source": source, "source_id": source_id, **({"graph_id": payload.get("graph_id") } if payload.get("graph_id") else {})},
    }


@router.get("/data")
def get_graph_data(
    graph_id: Optional[str] = Query(default=None, description="已生成的图谱 ID"),
    document_id: Optional[str] = Query(default=None, description="上传文档 ID"),
):
    """返回适配前端 KnowledgeGraph 组件的节点和边。"""
    if graph_id:
        try:
            payload = _builder.load(graph_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="graph not found")
        return _style_from_raw_graph(payload, source="graph", source_id=graph_id)

    if document_id:
        meta_path = os.path.join(Config.UPLOAD_FOLDER, f"{document_id}.json")
        if not os.path.exists(meta_path):
            raise HTTPException(status_code=404, detail="document not found")

        import json

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        linked_graph_id = meta.get("graph_id")
        if linked_graph_id:
            try:
                payload = _builder.load(linked_graph_id)
                return _style_from_raw_graph(payload, source="document", source_id=document_id)
            except FileNotFoundError:
                pass

        # 文档元数据只存相对文件名，绝对路径在服务端重建，避免对外回显
        storage_name = meta.get("storage_name") or meta.get("saved_path")
        if not storage_name:
            raise HTTPException(status_code=404, detail="document file not found")
        origin_abs = os.path.abspath(storage_name)
        upload_root = os.path.abspath(Config.UPLOAD_FOLDER)
        saved_path = (
            storage_name
            if os.path.isabs(origin_abs) and origin_abs.startswith(upload_root + os.sep)
            else os.path.join(Config.UPLOAD_FOLDER, os.path.basename(storage_name))
        )
        if not os.path.exists(saved_path):
            raise HTTPException(status_code=404, detail="document file not found")

        from ..utils.file_parser import FileParser

        text = FileParser.extract_text(saved_path)
        payload = _builder.build_from_text(text=text)

        meta["graph_id"] = payload.graph_id
        meta["graph_mode"] = payload.mode
        meta["graph_node_count"] = payload.node_count
        meta["graph_edge_count"] = payload.edge_count
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        payload_json = _builder.load(payload.graph_id)
        return _style_from_raw_graph(payload_json, source="document", source_id=document_id)

    return _default_graph_payload()
