"""文档上传与文本提取 API"""

import datetime as _dt
import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import Config
from ..services.graph_builder_service import GraphBuilderService
from ..utils.file_parser import FileParser

router = APIRouter()

_graph_builder = GraphBuilderService()


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    saved_path: str
    sha256: str
    text_length: int
    text_preview: str
    uploaded_at: str
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
    saved_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空文件")

    sha256 = hashlib.sha256(data).hexdigest()

    with open(saved_path, "wb") as f:
        f.write(data)

    try:
        text = FileParser.extract_text(saved_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文本提取失败: {e}")

    preview = (text[:preview_chars] + ("…" if len(text) > preview_chars else "")).strip()

    graph_result = _graph_builder.build_from_text(text=text)
    uploaded_at = _dt.datetime.now(_dt.UTC).isoformat()

    metadata = {
        "document_id": document_id,
        "filename": file.filename,
        "saved_path": saved_path,
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

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        saved_path=saved_path,
        sha256=sha256,
        text_length=len(text),
        text_preview=preview,
        uploaded_at=uploaded_at,
        graph_id=graph_result.graph_id,
        graph_mode=graph_result.mode,
        graph_node_count=graph_result.node_count,
        graph_edge_count=graph_result.edge_count,
    )


@router.get("/{document_id}")
def get_document(document_id: str) -> Dict[str, Any]:
    try:
        return _load_metadata(document_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document not found")
