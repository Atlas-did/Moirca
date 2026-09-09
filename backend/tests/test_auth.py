# -*- coding: utf-8 -*-
"""可选 API token 鉴权测试(AGENT_07,A4 类债修复验证)。

backend/app/api/auth.py:
  - WEBBRIDGE_API_TOKEN 未设置(默认)→ 不鉴权,本地开发零配置;
  - 设置后 /api/evidence/*、/api/report、/api/deep-research 受保护路由要求
    X-WebBridge-Token 请求头,缺/错 → 401 API_TOKEN_REQUIRED。
  - /api/health、/api/route 不受保护(无敏感数据,且 daemon/扩展离线判定依赖 health)。
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Config


@pytest.fixture()
def env(tmp_path, monkeypatch):
    db_path = tmp_path / "test_auth.db"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    monkeypatch.setattr(Config, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr(Config, "EVIDENCE_ARTIFACTS_DIR", str(artifacts))
    from app.evidence.repository import init_evidence_table

    init_evidence_table()
    return db_path


def _app() -> TestClient:
    from app.api.evidence import router as evidence_router
    from app.api.health import router as health_router

    app = FastAPI()
    app.include_router(evidence_router, prefix="/api/evidence")
    app.include_router(health_router, prefix="/api")
    return TestClient(app)


def _save_payload():
    return {
        "channel": "controlled_browse",
        "url": "https://www.moe.gov.cn/notice.html",
        "quote": "2026年起执行阳光招生政策。",
        "task_id": "task_AUTHT",
    }


def test_token_disabled_is_open_by_default(env, monkeypatch):
    monkeypatch.setattr(Config, "WEBBRIDGE_API_TOKEN", "")
    client = _app()
    resp = client.post("/api/evidence/save", json=_save_payload())
    assert resp.status_code == 201, resp.text          # 默认零配置可用
    assert client.get("/api/health").status_code == 200


def test_token_enabled_requires_header(env, monkeypatch):
    monkeypatch.setattr(Config, "WEBBRIDGE_API_TOKEN", "s3cret")
    client = _app()

    # 缺头 → 401
    resp = client.post("/api/evidence/save", json=_save_payload())
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"]["code"] == "API_TOKEN_REQUIRED"

    # 错头 → 401
    resp = client.post("/api/evidence/save", json=_save_payload(),
                       headers={"X-WebBridge-Token": "wrong"})
    assert resp.status_code == 401

    # 正确头 → 201
    resp = client.post("/api/evidence/save", json=_save_payload(),
                       headers={"X-WebBridge-Token": "s3cret"})
    assert resp.status_code == 201, resp.text
    evidence_id = resp.json()["evidence_id"]

    # 敏感读路径同样受保护:query / {id} 回查
    assert client.get("/api/evidence/query",
                      headers={"X-WebBridge-Token": "s3cret"}).status_code == 200
    assert client.get("/api/evidence/query").status_code == 401
    assert client.get(f"/api/evidence/{evidence_id}",
                      headers={"X-WebBridge-Token": "s3cret"}).status_code == 200
    assert client.get(f"/api/evidence/{evidence_id}").status_code == 401

    # 非敏感端点不受保护:health 恒可访问(扩展/daemon 离线判定依赖)
    assert client.get("/api/health").status_code == 200


def test_token_not_leaked_in_error(env, monkeypatch):
    monkeypatch.setattr(Config, "WEBBRIDGE_API_TOKEN", "s3cret")
    client = _app()
    body = client.post("/api/evidence/save", json=_save_payload()).json()
    assert "s3cret" not in str(body)
