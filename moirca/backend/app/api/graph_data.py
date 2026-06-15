"""
知识图谱数据 API — 适配前端 GraphNode/GraphEdge 格式

前端期望:
  GraphNode: { id, label, type, x, y, vx, vy, radius, color, icon, data? }
  GraphEdge: { id, source, target, type, label? }
"""
from __future__ import annotations

import math
import os
import json
import sqlite3
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import Config
from ..services.graph_builder_service import GraphBuilderService

router = APIRouter()
_builder = GraphBuilderService()

TYPE_STYLE = {
    "school":   {"color": "#10b981", "icon": "🏫", "radius": 26},
    "major":    {"color": "#3b82f6", "icon": "📚", "radius": 24},
    "career":   {"color": "#f97316", "icon": "💼", "radius": 22},
    "system":   {"color": "#6b7280", "icon": "☁️", "radius": 35},
    "user":     {"color": "#f59e0b", "icon": "⭐", "radius": 30},
    "role":     {"color": "#8b5cf6", "icon": "👤", "radius": 28},
    "agent":    {"color": "#8b5cf6", "icon": "🤖", "radius": 28},
}

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

    if source == "document" and source_id:
        for item in raw_nodes:
            node_id = item.get("id")
            if not node_id:
                continue
            if node_id.startswith("score:") or node_id.startswith("rank:") or node_id.startswith("subject:") or node_id.startswith("province:"):
                raw_label = item.get("properties", {}).get("name") or node_id
                raw_type = item.get("type", "system")
                ntype = "user" if raw_type == "user" else "system"
                nodes.append({"id": node_id, "label": raw_label, "type": ntype})

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


@router.get("/university-graph")
def get_university_graph(
    province: Optional[str] = Query(default=None, description="按省份筛选"),
    tier: Optional[str] = Query(default=None, description="按层次筛选"),
    max_schools: int = Query(default=800, description="最大学校数"),
):
    """
    返回大学知识图谱（不含专业节点）
    省份为大节点（聚合点），学校为小节点（按层次着色），学校→省份连线
    """
    
    path = os.path.join(os.path.dirname(Config.DATABASE_PATH), 'neo4j_graph.json')
    if os.path.exists(path):
        import json
        with open(path, encoding='utf-8') as f:
            raw = json.load(f)
        
        nodes_out = []
        for n in raw.get("nodes", []):
            nodes_out.append({
                "id": n["id"],
                "label": n.get("label", ""),
                "type": n.get("type", "school"),
                "province": n.get("province", ""),
                "tier": n.get("tier", ""),
                "radius": n.get("radius", 10),
                "color": n.get("color", "#4F46E5"),
            })
        edges_out = []
        for e in raw.get("edges", []):
            edges_out.append({
                "source": e["source"],
                "target": e["target"],
                "type": e.get("type", "related").lower(),
            })
        return {"nodes": nodes_out, "edges": edges_out}

    path = os.path.join(os.path.dirname(Config.DATABASE_PATH), 'university_graph.json')
    if not os.path.exists(path):
        return {"nodes": [], "edges": [], "total_nodes": 0, "total_edges": 0}
    import json
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)

    all_nodes = raw.get("nodes", [])
    all_edges = raw.get("edges", [])

    schools = [n for n in all_nodes if n.get("type") == "School"]
    if province:
        schools = [n for n in schools if n.get("province") == province]
    if tier:
        schools = [n for n in schools if n.get("tier") == tier]
    schools = schools[:max_schools]

    cities = [n for n in all_nodes if n.get("type") == "Career"]
    tiers = [n for n in all_nodes if n.get("type") == "Tier"]

    prov_schools: dict[str, list] = {}
    for s in schools:
        p = s.get("province", "未知")
        prov_schools.setdefault(p, []).append(s)

    prov_colors = [
        "#4F46E5","#D97706","#059669","#DC2626","#7C3AED","#0891B2","#BE123C",
        "#2563EB","#CA8A04","#16A34A","#9333EA","#0D9488","#E11D48","#6366F1",
        "#B45309","#059669","#DB2777","#0284C7","#D97706","#65A30D","#0F766E",
        "#7C3AED","#C026D3","#0369A1","#B91C1C","#1D4ED8","#A21CAF","#15803D",
    ]
    prov_list = sorted(prov_schools.keys())
    prov_color_map = {p: prov_colors[i % len(prov_colors)] for i, p in enumerate(prov_list)}

    tier_color_map = {
        "985": "#D97706", "211": "#2563EB", "双一流": "#7C3AED",
        "公办": "#059669", "民办": "#DC2626", "其他": "#78716C",
    }

    nodes_out = []

    for i, p in enumerate(prov_list):
        col = i % 6
        row = i // 6
        nodes_out.append({
            "id": f"prov:{p}", "label": p, "type": "province",
            "province": p, "tier": "", "radius": 32,
            "color": prov_color_map[p],
            "cluster": True,
            "grid_col": col, "grid_row": row,
        })

    for t in tiers:
        name = t.get("name", "")
        nodes_out.append({
            "id": f"tier:{name}", "label": name, "type": "tier",
            "province": "", "tier": name, "radius": 12,
            "color": tier_color_map.get(name, "#78716C"),
        })

    for s in schools:
        school_tier = s.get("tier", "其他")
        nodes_out.append({
            "id": s["id"],
            "label": s.get("name", s["id"]),
            "type": "school",
            "province": s.get("province", ""),
            "tier": school_tier,
            "radius": 10,
            "color": tier_color_map.get(school_tier, "#78716C"),
        })

    school_ids = {s["id"] for s in schools}
    edges_out = []
    for e in all_edges:
        if e["source"] in school_ids and e["target"] in school_ids:
            continue
        if e["source"] in school_ids:
            tgt = e["target"]
            if tgt.startswith("city:") or tgt.startswith("tier:"):
                edges_out.append({
                    "source": e["source"], "target": tgt,
                    "type": "located_in" if tgt.startswith("city:") else "belongs_to",
                })
        elif e["target"] in school_ids:
            src = e["source"]
            if src.startswith("city:") or src.startswith("tier:"):
                edges_out.append({
                    "source": src, "target": e["target"],
                    "type": "located_in" if src.startswith("city:") else "belongs_to",
                })

    seen = set()
    unique_edges = []
    for e in edges_out:
        key = f"{e['source']}_{e['target']}_{e['type']}"
        if key not in seen:
            seen.add(key)
            unique_edges.append(e)
    edges_out = unique_edges

    return {"nodes": nodes_out, "edges": edges_out}


@router.get("/graph-query")
def query_graph(
    q: str = Query(..., description="查询: province=广东&tier=985 或 school=北京大学"),
):
    """Agent 查询接口 - 返回结构化知识图谱数据"""
    path = os.path.join(os.path.dirname(Config.DATABASE_PATH), 'university_graph.json')
    if not os.path.exists(path):
        return {"error": "graph not found"}
    import json
    with open(path) as f:
        raw = json.load(f)
    nodes = raw.get("nodes", [])
    edges = raw.get("edges", [])

    result = {"schools": [], "relationships": []}

    params = dict(kv.split("=") for kv in q.split("&") if "=" in kv)

    filtered = nodes
    if "province" in params:
        filtered = [n for n in filtered if n.get("province") == params["province"]]
    if "tier" in params:
        filtered = [n for n in filtered if n.get("tier") == params["tier"]]
    if "school" in params:
        filtered = [n for n in filtered if params["school"] in n.get("name", "")]

    ids = {n["id"] for n in filtered}
    related = [
        e for e in edges if e["source"] in ids or e["target"] in ids
    ]

    return {
        "schools": [{"id": n["id"], "name": n.get("name",""), "province": n.get("province",""), "tier": n.get("tier","")} for n in filtered if n.get("type")=="School"],
        "provinces": list(set(n.get("province","") for n in filtered if n.get("province"))),
        "relationships": related[:100],
        "total": len(filtered),
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

        saved_path = meta.get("saved_path")
        if not saved_path or not os.path.exists(saved_path):
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


# ============================================
# 学校名片 API
# ============================================

@router.get("/school-info")
def get_school_info(name: str = ""):
    if not name:
        return {"error": "school name required"}

    db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'admission.db')
    kk_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'crawled', 'kkdaxue_all.json')

    info = {"name": name, "level": "", "province": "", "city": "", "tags": ""}

    try:
        db = sqlite3.connect(db_path)
        row = db.execute(
            "SELECT level, province, city, tags FROM schools WHERE name=? LIMIT 1", (name,)
        ).fetchone()
        if row:
            info["level"] = row[0] or ""
            info["province"] = row[1] or ""
            info["city"] = row[2] or ""
            info["tags"] = row[3] or ""

        scores = db.execute("""
            SELECT major, AVG(min_score), MIN(min_score), MAX(min_score), COUNT(*)
            FROM major_scores WHERE school=? AND batch LIKE '%本科%' AND min_score > 0
            GROUP BY major ORDER BY AVG(min_score) DESC LIMIT 8
        """, (name,)).fetchall()
        info["majors"] = [
            {"name": s[0], "avg": round(s[1], 1), "min": s[2], "max": s[3]}
            for s in scores
        ] if scores else []

        db.close()
    except Exception:
        pass

    try:
        if os.path.exists(kk_path):
            with open(kk_path) as f:
                kk_data = json.load(f)
            reviews = [r for r in kk_data if r.get('school', '').strip() == name and r.get('content')]
            positive = sum(1 for r in reviews if any(w in r.get('content', '') for w in ['好', '推荐', '值得', '不错', '满意', '高薪', '喜欢', '棒']))
            negative = sum(1 for r in reviews if any(w in r.get('content', '') for w in ['坑', '别来', '后悔', '劝退', '差', '不好', '垃圾', '失望']))
            info["review_count"] = len(reviews)
            info["positive_rate"] = round(positive / max(len(reviews), 1) * 100)
            info["sample_reviews"] = [
                {"content": r["content"],
                 "major": r.get("major", ""),
                 "sentiment": "positive" if any(w in r.get("content", "") for w in ['好', '推荐', '值得', '不错', '满意']) else "negative" if any(w in r.get("content", "") for w in ['坑', '别来', '后悔', '劝退', '差']) else "neutral"}
                for r in reviews[:8]
            ]
    except Exception:
        info["review_count"] = 0
        info["positive_rate"] = 0
        info["sample_reviews"] = []

    return info

    return _default_graph_payload()
