"""文档上传与文本提取 API"""
from __future__ import annotations

import datetime as _dt
import hashlib
import hmac
import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from ..config import Config
from ..services.graph_builder_service import GraphBuilderService
from ..utils.file_parser import FileParser

router = APIRouter()

_graph_builder = GraphBuilderService()

# 归属 token：上传成功后返回，后续读取该 document 时必须携带，
# 防止任何人遍历 document_id（32 位 hex）读取他人上传的文档元数据/内容。
_OWNER_TOKEN_SECRET = os.environ.get("MOIRCA_DOC_TOKEN_SECRET", "") or "moirca-doc-owner-dev"


def _make_owner_token(document_id: str) -> str:
    payload = f"doc:{document_id}"
    mac = hmac.new(_OWNER_TOKEN_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{document_id}.{mac[:24]}"


def _verify_owner_token(document_id: str, token: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(_make_owner_token(document_id), token)


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    # 仅返回相对文件名，绝不回显服务器绝对路径（防路径信息泄露）
    storage_name: str
    sha256: str
    text_length: int
    text_preview: str
    uploaded_at: str
    owner_token: str
    graph_id: Optional[str] = None
    graph_mode: Optional[str] = None
    graph_node_count: Optional[int] = None
    graph_edge_count: Optional[int] = None


def _allowed(filename: str) -> bool:
    suffix = Path(filename).suffix.lower().lstrip(".")
    return suffix in Config.ALLOWED_EXTENSIONS


def _metadata_path(document_id: str) -> str:
    return os.path.join(Config.UPLOAD_FOLDER, f"{document_id}.json")


def _save_metadata(payload: Dict[str, Any]) -> None:
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    with open(_metadata_path(payload["document_id"]), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _load_metadata(document_id: str) -> Dict[str, Any]:
    path = _metadata_path(document_id)
    if not os.path.exists(path):
        raise FileNotFoundError(document_id)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/upload", response_model=UploadResponse)
def upload_document(file: UploadFile = File(...), preview_chars: int = 1200):
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    if not _allowed(file.filename):
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.filename}")

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    document_id = uuid.uuid4().hex
    suffix = Path(file.filename).suffix.lower()
    safe_name = f"{document_id}{suffix}"
    full_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)

    # 限大小读取，避免一次性 file.read() 读入超大文件造成内存 DoS
    data = file.file.read(Config.MAX_UPLOAD_BYTES + 1)
    if len(data) > Config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件超过大小上限 {Config.MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    if not data:
        raise HTTPException(status_code=400, detail="空文件")

    sha256 = hashlib.sha256(data).hexdigest()

    with open(full_path, "wb") as f:
        f.write(data)

    try:
        text = FileParser.extract_text(full_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文本提取失败: {e}")

    preview = (text[:preview_chars] + ("…" if len(text) > preview_chars else "")).strip()

    graph_result = _graph_builder.build_from_text(text=text)
    uploaded_at = _dt.datetime.now(_dt.UTC).isoformat()

    metadata = {
        "document_id": document_id,
        "filename": file.filename,
        "storage_name": safe_name,   # 内部不存绝对路径，只存相对文件名
        "sha256": sha256,
        "text_length": len(text),
        "text_preview": preview,
        "uploaded_at": uploaded_at,
        "graph_id": graph_result.graph_id,
        "graph_mode": graph_result.mode,
        "graph_node_count": graph_result.node_count,
        "graph_edge_count": graph_result.edge_count,
    }
    _save_metadata(metadata)

    owner_token = _make_owner_token(document_id)
    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        storage_name=safe_name,
        sha256=sha256,
        text_length=len(text),
        text_preview=preview,
        uploaded_at=uploaded_at,
        owner_token=owner_token,
        graph_id=graph_result.graph_id,
        graph_mode=graph_result.mode,
        graph_node_count=graph_result.node_count,
        graph_edge_count=graph_result.edge_count,
    )


@router.get("/{document_id}")
def get_document(
    document_id: str,
    owner_token: str = Query(default="", description="上传时返回的归属 token"),
) -> Dict[str, Any]:
    try:
        meta = _load_metadata(document_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document not found")
    if not _verify_owner_token(document_id, owner_token):
        raise HTTPException(status_code=403, detail="缺少或错误的访问凭据")
    return meta
