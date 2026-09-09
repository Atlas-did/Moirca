"""本体论/关系定义生成服务（LLM 优先，缺 key 时降级模板）"""

from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any, Dict, Optional

from ..config import Config
from ..utils.llm_client import LLMClient

_DEFAULT_ONTOLOGY: Dict[str, Any] = {
    "domain": "gaokao_admission",
    "entity_types": [
        {
            "name": "Profession",
            "id_field": "code",
            "description": "国标专业（含门类/学科/关键词/技能/就业方向）",
            "properties": [
                {"name": "code", "type": "string"},
                {"name": "name", "type": "string"},
                {"name": "category", "type": "string"},
                {"name": "discipline", "type": "string"},
                {"name": "keywords", "type": "array[string]"},
            ],
        },
        {
            "name": "School",
            "id_field": "name",
            "description": "院校（层次/省市/属性）",
            "properties": [
                {"name": "name", "type": "string"},
                {"name": "tier", "type": "string"},
                {"name": "province", "type": "string"},
                {"name": "city", "type": "string"},
            ],
        },
        {
            "name": "Career",
            "id_field": "name",
            "description": "就业方向/岗位（行业/薪资区间等）",
            "properties": [
                {"name": "name", "type": "string"},
                {"name": "industry", "type": "string"},
                {"name": "avg_salary", "type": "string"},
            ],
        },
        {
            "name": "Evidence",
            "id_field": "id",
            "description": "证据片段（来源/时间/引用文本）",
            "properties": [
                {"name": "id", "type": "string"},
                {"name": "source", "type": "string"},
                {"name": "url", "type": "string"},
                {"name": "published_at", "type": "string"},
                {"name": "quote", "type": "string"},
            ],
        },
    ],
    "edge_types": [
        {
            "name": "OFFERED_BY",
            "source": "Profession",
            "target": "School",
            "description": "某院校开设某专业",
            "properties": [
                {"name": "degree_type", "type": "string"},
                {"name": "quota", "type": "string"},
                {"name": "year", "type": "integer"},
            ],
        },
        {
            "name": "LEADS_TO",
            "source": "Profession",
            "target": "Career",
            "description": "某专业常见就业方向/岗位",
            "properties": [
                {"name": "probability", "type": "number"},
                {"name": "notes", "type": "string"},
            ],
        },
        {
            "name": "RELATED_TO",
            "source": "Profession",
            "target": "Profession",
            "description": "相近/可替代/同类专业",
            "properties": [{"name": "relation", "type": "string"}],
        },
        {
            "name": "SUPPORTED_BY",
            "source": "Evidence",
            "target": "Profession",
            "description": "证据支持某专业结论",
            "properties": [{"name": "claim", "type": "string"}],
        },
    ],
    "relation_definitions": {
        "profession-school-employment": {
            "entities": ["Profession", "School", "Career"],
            "relations": [
                {
                    "name": "OFFERED_BY",
                    "triple": ["Profession", "OFFERED_BY", "School"],
                    "meaning": "某院校开设某专业",
                },
                {
                    "name": "LEADS_TO",
                    "triple": ["Profession", "LEADS_TO", "Career"],
                    "meaning": "该专业常见就业方向/岗位",
                },
                {
                    "name": "RELATED_TO",
                    "triple": ["Profession", "RELATED_TO", "Profession"],
                    "meaning": "相近/可替代/同类专业",
                },
            ],
        }
    },
}


class OntologyService:
    def __init__(self):
        self._client: Optional[LLMClient] = None

    def _get_client(self) -> Optional[LLMClient]:
        if not Config.LLM_API_KEY:
            return None
        if self._client is None:
            self._client = LLMClient()
        return self._client

    def generate(self, text: str, domain: str = "gaokao_admission") -> Dict[str, Any]:
        client = self._get_client()
        if not client:
            payload = dict(_DEFAULT_ONTOLOGY)
            payload["domain"] = domain
            payload["generated_at"] = _dt.datetime.now(_dt.UTC).isoformat()
            payload["version_id"] = uuid.uuid4().hex
            payload["mode"] = "template"
            return payload

        system = (
            "你是知识工程师。把输入文本抽象为知识图谱本体论（实体类型+边类型），"
            "并给出‘专业-院校-就业’的关系定义。输出必须是严格 JSON。"
        )
        user = (
            f"领域 domain={domain}\n"
            "请输出 JSON，包含字段：\n"
            "- domain: string\n"
            "- entity_types: array[{name,id_field,description,properties:[{name,type,description?}]}]\n"
            "- edge_types: array[{name,source,target,description,properties:[{name,type,description?}]}]\n"
            "- relation_definitions: object（至少包含 profession-school-employment）\n"
            "要求：\n"
            "1) 实体/边命名使用英文大驼峰/全大写下划线；\n"
            "2) 贴合高考志愿语境（专业/院校/城市/就业/证据/风险）；\n"
            "3) 不要输出多余字段。\n\n"
            "输入文本：\n"
            + text[:12000]
        )

        data = client.chat_json(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=4096,
        )
        data["generated_at"] = _dt.datetime.now(_dt.UTC).isoformat()
        data["version_id"] = uuid.uuid4().hex
        data["mode"] = "llm"
        return data

    def relation_defs(self, ontology: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        base = ontology or _DEFAULT_ONTOLOGY
        return {
            "domain": base.get("domain", "gaokao_admission"),
            "relation_definitions": base.get("relation_definitions", {}),
        }
