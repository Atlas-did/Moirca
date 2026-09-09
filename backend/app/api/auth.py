"""可选 API token 鉴权(AGENT_07 审计新增,A4 类债)。

背景:/api/evidence/*、/api/report、/api/deep-research 等本轮新增端点此前无任何
鉴权。backend 本身默认只绑 127.0.0.1,但一旦用户显式配置 HOST=0.0.0.0 或做端口
转发,证据库(可能含用户浏览记录)就完全裸奔。按审计标准提供「至少可配置开关」:

  - 未设置 WEBBRIDGE_API_TOKEN(默认,本地开发):不鉴权,行为与之前一致;
  - 设置 WEBBRIDGE_API_TOKEN 后:受保护路由要求请求头
      X-WebBridge-Token: <token>
    否则 401 API_TOKEN_REQUIRED。

daemon 侧对应 env:WEBBRIDGE_BACKEND_TOKEN(自动随证据落库请求带上该头,
见 daemon/src/evidence-client.ts)。
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Header, HTTPException

from ..config import Config

TOKEN_HEADER = "X-WebBridge-Token"


def verify_api_token(
    # 注意:必须显式 alias,否则 FastAPI 会把参数名 token_header 绑定为
    # "token-header" 请求头,契约约定的 X-WebBridge-Token 将永远绑定不上。
    token_header: Optional[str] = Header(default=None, alias="X-WebBridge-Token"),
) -> None:
    """FastAPI 依赖:WEBBRIDGE_API_TOKEN 非空时校验请求头,否则放行。"""
    expected = (getattr(Config, "WEBBRIDGE_API_TOKEN", "") or "").strip()
    if not expected:
        return  # 开关关闭(本地开发默认),保持零配置可用
    if token_header is None or not hmac.compare_digest(
            str(token_header).strip(), expected):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "API_TOKEN_REQUIRED",
                              "message": "缺少或错误的 X-WebBridge-Token 请求头",
                              "details": {"header": TOKEN_HEADER}}},
        )
