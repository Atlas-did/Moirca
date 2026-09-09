"""
FastAPI 应用工厂
"""
import os
import sys

# Windows UTF-8 支持
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Config


def create_app() -> FastAPI:
    app = FastAPI(
        title="Moirca",
        description="高考志愿AI推荐工具",
        version="0.1.0",
    )

    # CORS：白名单 + 凭据。按 CORS 规范，allow_credentials=True 时不允许 allow_origins=["*"]，
    # 因此只有在显式配置 CORS_ORIGINS=* 时才放开全部来源且不携带凭据。
    cors_origins = Config.CORS_ORIGINS
    allow_credentials = cors_origins != ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 注册路由
    from .api import router as api_router
    app.include_router(api_router, prefix="/api")

    # 确保数据目录存在
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(os.path.dirname(Config.DATABASE_PATH), exist_ok=True)

    # 初始化数据库与种子数据
    from .models.database import init_db
    init_db()

    # 统一错误响应（对齐 docs/api.md 第1.1节）
    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "INVALID_ARGUMENT", "message": str(exc), "details": {}}},
        )

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "0.1.0"}

    return app
