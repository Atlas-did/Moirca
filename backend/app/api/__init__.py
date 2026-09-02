"""
Moirca API 路由汇总

统一错误响应格式（对齐 docs/api.md 第1.1节）:
  失败: HTTP 4xx/5xx → {"error": {"code": "INVALID_ARGUMENT", "message": "...", "details": {}}}
"""
from fastapi import APIRouter

from .decision import router as decision_router
from .documents import router as documents_router
from .agents import router as agents_router
from .graph import router as graph_router
from .interview import router as interview_router
from .ontology import router as ontology_router
from .recommendation import router as recommendation_router
from .report import router as report_router
from .simulation import router as simulation_router
from .compare import router as compare_router
from .chat import router as chat_router
from .history import router as history_router
from .logs import router as logs_router
from .scorelines import router as scorelines_router
from .graph_data import router as graph_data_router
from .zep import router as zep_router
from .context import router as context_router

router = APIRouter()

# 注册路由
router.include_router(decision_router, prefix="/decision", tags=["决策树"])
router.include_router(documents_router, prefix="/documents", tags=["文档"])
router.include_router(agents_router, prefix="/agents", tags=["Agents"])
router.include_router(graph_router, prefix="/graph", tags=["图谱"])
router.include_router(graph_data_router, prefix="/graph-viz", tags=["图谱可视化"])
router.include_router(interview_router, prefix="/interview", tags=["采访"])
router.include_router(ontology_router, prefix="/ontology", tags=["本体论"])
router.include_router(recommendation_router, prefix="/recommend", tags=["推荐"])
router.include_router(chat_router, prefix="/chat", tags=["对话"])
router.include_router(compare_router, prefix="/compare", tags=["对比"])
router.include_router(simulation_router, prefix="/simulation", tags=["模拟"])
router.include_router(report_router, prefix="/report", tags=["报告"])
router.include_router(history_router, prefix="/history", tags=["历史"])
router.include_router(logs_router, prefix="/logs", tags=["日志"])
router.include_router(scorelines_router, prefix="/scorelines", tags=["公开分数线"])
router.include_router(zep_router, prefix="/zep", tags=["Zep（可选）"])
router.include_router(context_router, prefix="/context", tags=["页面上下文问答"])


