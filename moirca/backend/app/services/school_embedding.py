"""
学校向量搜索引擎 — BGE 中文模型（富信息画像版）

注意: numpy/torch/transformers 为可选依赖。
未安装时向量搜索降级为关键词匹配，不影响其他服务启动。
"""
import os, sqlite3, json, time, sys
from typing import List, Optional

os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')

MODEL_PATH = os.path.expanduser("~/.cache/huggingface/hub/models--BAAI--bge-small-zh-v1.5/snapshots/main")
INDEX_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'school_embeddings_v2.npz')
DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'admission.db')
KK_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'crawled', 'kkdaxue_all.json')

# 可选依赖检测
try:
    import numpy as np
    _NP_AVAILABLE = True
except ImportError:
    np = None  # type: ignore
    _NP_AVAILABLE = False

_tokenizer = None
_model = None
_embeddings = None  # np.ndarray when available
_school_names: List[str] = []
_school_meta: List[dict] = []


def _ensure_torch():
    """延迟导入 torch/transformers，不安装则无法使用向量搜索"""
    try:
        import torch
        from transformers import AutoTokenizer, AutoModel
        return torch, AutoTokenizer, AutoModel
    except ImportError:
        return None, None, None


def _load_model():
    global _tokenizer, _model
    if _tokenizer is not None:
        return _tokenizer is not False
    torch_pkg, AutoTokenizer, AutoModel = _ensure_torch()
    if torch_pkg is None:
        _tokenizer = False
        _model = False
        return False
    try:
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        _model = AutoModel.from_pretrained(MODEL_PATH)
        return True
    except Exception:
        _tokenizer = False
        _model = False
        return False


def _embed(texts: List[str]):
    if not _NP_AVAILABLE or not _load_model():
        return None
    torch, _, _ = _ensure_torch()
    if torch is None:
        return None
    all_embeds = []
    for t in texts:
        inputs = _tokenizer(t, return_tensors="pt", truncation=True, max_length=512, padding=True)
        with torch.no_grad():
            embeds = _model(**inputs).last_hidden_state[:, 0, :].cpu().numpy()
        norms = np.linalg.norm(embeds, axis=1, keepdims=True)
        embeds = embeds / (norms + 1e-8)
        all_embeds.append(embeds)
    return np.vstack(all_embeds)


def load_index() -> bool:
    if not _NP_AVAILABLE:
        return False
    global _embeddings, _school_names, _school_meta
    if not os.path.exists(INDEX_PATH):
        return False
    try:
        loaded = np.load(INDEX_PATH, allow_pickle=True)
        _embeddings = loaded['embeddings']
        _school_names = list(loaded['names'])
        _school_meta = list(loaded['meta'])
        return True
    except Exception:
        return False


def build_index(force: bool = False) -> int:
    if not _NP_AVAILABLE:
        return 0
    if not force and load_index():
        return len(_school_names)
    # ... build logic (requires DB + model)
    return 0


def search(query: str, top_k: int = 5) -> List[dict]:
    """向量搜索学校，未安装 numpy 时返回空"""
    if not _NP_AVAILABLE or _embeddings is None:
        return _keyword_fallback(query, top_k)
    q = _embed([query])
    if q is None:
        return _keyword_fallback(query, top_k)
    scores = np.dot(_embeddings, q[0])
    top = np.argsort(scores)[-top_k:][::-1]
    results = []
    for idx in top:
        results.append({"name": _school_names[idx], "meta": _school_meta[idx], "score": float(scores[idx])})
    return results


def _keyword_fallback(query: str, top_k: int = 5) -> List[dict]:
    """关键词匹配降级方案"""
    results = []
    for name, meta in zip(_school_names, _school_meta):
        if query in name:
            results.append({"name": name, "meta": meta, "score": 1.0})
        if len(results) >= top_k:
            break
    return results
