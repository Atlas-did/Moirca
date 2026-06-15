"""从文本构建本地知识图谱（NetworkX），并落盘为 JSON。

说明：
- 有 LLM_KEY 时：按 ontology 约束抽取 nodes/edges（chunked extraction）。
- 无 LLM_KEY 时：降级为尽力提取（当前提供模板/空图，确保接口可用）。

图谱文件：backend/data/graphs/<graph_id>.json
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import networkx as nx

from ..config import Config
from ..utils.file_parser import split_text_into_chunks
from ..utils.llm_client import LLMClient


@dataclass
class BuildResult:
    graph_id: str
    node_count: int
    edge_count: int
    saved_path: str
    mode: str


class GraphBuilderService:
    def __init__(self):
        self._client: Optional[LLMClient] = None

    def _get_client(self) -> Optional[LLMClient]:
        if not Config.LLM_API_KEY:
            return None
        if self._client is None:
            self._client = LLMClient()
        return self._client

    def _graphs_dir(self) -> str:
        base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "graphs")
        os.makedirs(base, exist_ok=True)
        return base

    def build_from_text(self, text: str, ontology: Optional[Dict[str, Any]] = None) -> BuildResult:
        graph_id = uuid.uuid4().hex
        g = nx.MultiDiGraph()

        client = self._get_client()
        mode = "template" if not client else "llm"

        if client:
            self._extract_and_merge(client, g, text, ontology)
        else:
            # 降级：使用规则抽取一个轻量图，保证上传文档与图谱仍可绑定
            self._build_fallback_graph(g, text, ontology)
            g.graph["note"] = "LLM_API_KEY 未配置，使用规则抽取图谱"

        payload = self._export_graph_json(g, graph_id=graph_id, ontology=ontology, mode=mode)
        saved_path = os.path.join(self._graphs_dir(), f"{graph_id}.json")
        with open(saved_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return BuildResult(
            graph_id=graph_id,
            node_count=g.number_of_nodes(),
            edge_count=g.number_of_edges(),
            saved_path=saved_path,
            mode=mode,
        )

    def load(self, graph_id: str) -> Dict[str, Any]:
        path = os.path.join(self._graphs_dir(), f"{graph_id}.json")
        if not os.path.exists(path):
            raise FileNotFoundError(f"graph not found: {graph_id}")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def stats(self, graph_id: str) -> Dict[str, Any]:
        data = self.load(graph_id)
        return {
            "graph_id": graph_id,
            "node_count": len(data.get("nodes", [])),
            "edge_count": len(data.get("edges", [])),
            "mode": data.get("mode"),
            "generated_at": data.get("generated_at"),
        }

    # ----------------- internal -----------------

    def _extract_and_merge(
        self,
        client: LLMClient,
        g: nx.MultiDiGraph,
        text: str,
        ontology: Optional[Dict[str, Any]],
    ) -> None:
        chunks = split_text_into_chunks(text, chunk_size=1800, overlap=200)
        if not chunks:
            return

        seen_edges: set[Tuple[str, str, str]] = set()
        for chunk in chunks[:12]:  # 防止过长文本把 token 打爆
            nodes, edges = self._extract_chunk(client, chunk, ontology)
            for n in nodes:
                node_id = n.get("id")
                if not node_id:
                    continue
                props = n.get("properties") or {}
                props.setdefault("type", n.get("type", "Entity"))
                g.add_node(node_id, **props)

            for e in edges:
                s = e.get("source")
                t = e.get("target")
                et = e.get("type")
                if not s or not t or not et:
                    continue
                key = (s, t, et)
                if key in seen_edges:
                    continue
                seen_edges.add(key)
                props = e.get("properties") or {}
                props.setdefault("type", et)
                g.add_edge(s, t, **props)

    def _extract_chunk(
        self,
        client: LLMClient,
        chunk: str,
        ontology: Optional[Dict[str, Any]],
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        system = (
            "你是信息抽取工程师。请从文本中抽取知识图谱三元组，"
            "输出严格 JSON，不要输出解释。"
        )

        schema_hint = ""
        if ontology:
            entity_names = [e.get("name") for e in ontology.get("entity_types", []) if e.get("name")]
            edge_names = [e.get("name") for e in ontology.get("edge_types", []) if e.get("name")]
            schema_hint = (
                "可用实体类型: " + ", ".join(entity_names[:20]) + "\n" +
                "可用边类型: " + ", ".join(edge_names[:20]) + "\n"
            )

        user = (
            "请输出 JSON，字段：\n"
            "- nodes: array[{id,type,properties}]\n"
            "- edges: array[{source,target,type,properties}]\n"
            "约束：\n"
            "1) 尽量使用 ‘Profession/School/Career/Evidence’ 等语义；\n"
            "2) id 要稳定可复用：Profession 用 code(若未知可用 name)，School/Career 用 name；\n"
            "3) edges.type 优先使用 OFFERED_BY/LEADS_TO/RELATED_TO/SUPPORTED_BY；\n"
            "4) 每个 chunk 最多 25 条 edges。\n\n"
            + schema_hint +
            "文本：\n" + chunk
        )

        data = client.chat_json(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.1,
            max_tokens=2048,
        )
        nodes = data.get("nodes") or []
        edges = data.get("edges") or []
        if not isinstance(nodes, list):
            nodes = []
        if not isinstance(edges, list):
            edges = []
        return nodes, edges

    def _build_fallback_graph(
        self,
        g: nx.MultiDiGraph,
        text: str,
        ontology: Optional[Dict[str, Any]],
    ) -> None:
        """无 LLM 时的规则图谱抽取。"""
        text = text or ""
        doc_id = "document"
        g.add_node(
            doc_id,
            type="system",
            name="上传文档",
            source="fallback",
            text_length=len(text),
        )

        # 基础字段：分数 / 位次 / 科类 / 省份
        score_match = re.search(r"(\d{2,3})\s*分", text)
        if score_match:
            score_id = f"score:{score_match.group(1)}"
            g.add_node(score_id, type="user", name=f"{score_match.group(1)}分")
            g.add_edge(doc_id, score_id, type="RELATED_TO", label="成绩")

        rank_match = re.search(r"(?:位次|排名|全省排名)[^\d]{0,8}(\d{1,6})", text)
        if rank_match:
            rank_id = f"rank:{rank_match.group(1)}"
            g.add_node(rank_id, type="user", name=f"位次 {rank_match.group(1)}")
            g.add_edge(doc_id, rank_id, type="RELATED_TO", label="位次")

        for subject in ["物理类", "历史类"]:
            if subject in text:
                subj_id = f"subject:{subject}"
                g.add_node(subj_id, type="user", name=subject)
                g.add_edge(doc_id, subj_id, type="RELATED_TO", label="科类")
                break

        provinces = [
            "广东", "北京", "上海", "浙江", "江苏", "湖北", "湖南", "四川",
            "山东", "河南", "江西", "安徽", "福建", "重庆", "陕西", "河北",
        ]
        for province in provinces:
            if province in text:
                province_id = f"province:{province}"
                g.add_node(province_id, type="system", name=province)
                g.add_edge(doc_id, province_id, type="RELATED_TO", label="省份")
                break

        # 业务关键词：优先从已知专业/院校/就业方向中抓取
        vocab = {
            "major": [
                "计算机科学与技术", "软件工程", "人工智能", "临床医学", "会计学", "法学",
                "汉语言文学", "金融学", "机械设计制造及其自动化", "通信工程",
            ],
            "school": [
                "华南理工大学", "中山大学", "暨南大学", "深圳大学", "广州大学",
                "广东工业大学", "东莞理工学院", "南昌大学",
            ],
            "career": [
                "软件工程师", "算法工程师", "电气工程师", "医生", "会计师",
                "律师", "教师", "公务员",
            ],
        }

        matched_any = False
        for node_type, words in vocab.items():
            for word in words:
                if word in text:
                    node_id = f"{node_type}:{word}"
                    g.add_node(node_id, type=node_type, name=word)
                    g.add_edge(doc_id, node_id, type="RELATED_TO", label="提及")
                    matched_any = True

        if not matched_any:
            excerpt = (text.strip()[:48] or "空文档").replace("\n", " ")
            note_id = "note:excerpt"
            g.add_node(note_id, type="system", name=excerpt)
            g.add_edge(doc_id, note_id, type="RELATED_TO", label="摘要")

    def _export_graph_json(
        self,
        g: nx.MultiDiGraph,
        graph_id: str,
        ontology: Optional[Dict[str, Any]],
        mode: str,
    ) -> Dict[str, Any]:
        nodes = []
        for node_id, attrs in g.nodes(data=True):
            node_type = attrs.get("type") or attrs.get("node_type") or "Entity"
            props = dict(attrs)
            props.pop("type", None)
            props.pop("node_type", None)
            nodes.append({"id": node_id, "type": node_type, "properties": props})

        edges = []
        for s, t, attrs in g.edges(data=True):
            edge_type = attrs.get("type") or "RELATED_TO"
            props = dict(attrs)
            props.pop("type", None)
            edges.append({"source": s, "target": t, "type": edge_type, "properties": props})

        return {
            "graph_id": graph_id,
            "mode": mode,
            "generated_at": _dt.datetime.now(_dt.UTC).isoformat(),
            "ontology": ontology,
            "nodes": nodes,
            "edges": edges,
            "meta": {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "networkx": nx.__version__,
            },
        }
