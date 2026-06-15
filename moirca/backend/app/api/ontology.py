"""本体论/关系定义 API"""

from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services.ontology_service import OntologyService

router = APIRouter()
_service = OntologyService()


class OntologyGenerateRequest(BaseModel):
    text: str = Field(..., description="用于抽象本体论的输入文本（可为计划书/资料摘要等）")
    domain: str = Field("gaokao_admission", description="领域标识")


class RelationDefsRequest(BaseModel):
    ontology: Optional[Dict[str, Any]] = Field(None, description="可选：直接传入已生成 ontology")


@router.post("/generate")
def generate_ontology(req: OntologyGenerateRequest) -> Dict[str, Any]:
    return _service.generate(text=req.text, domain=req.domain)


@router.post("/relation-defs")
def get_relation_definitions(req: RelationDefsRequest) -> Dict[str, Any]:
    return _service.relation_defs(ontology=req.ontology)
