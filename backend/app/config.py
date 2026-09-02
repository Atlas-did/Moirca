"""
Moirca 配置管理
继承自 MiroFish 配置架构，移除 Zep/OASIS 依赖
"""
import os
from dotenv import load_dotenv

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
env_path = os.path.join(project_root, '.env')

# 加载 .env（优先项目根目录，再全局）
if os.path.exists(env_path):
    load_dotenv(env_path, override=True)
else:
    load_dotenv(override=True)

# 确保 DATABASE_PATH 是绝对路径
_DB_DEFAULT = os.path.join(project_root, 'data', 'moirca.db')


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Config:
    # 服务配置
    # 安全默认值：默认只监听本机回环地址，显式配置 HOST=0.0.0.0 才会对局域网暴露；
    # DEBUG 默认关闭，避免生产误用。
    HOST = os.environ.get('HOST', '127.0.0.1')
    PORT = int(os.environ.get('PORT', 8000))
    DEBUG = _env_bool('DEBUG', False)

    # CORS 白名单（逗号分隔）。默认仅允许本地开发源；
    # 显式设置 CORS_ORIGINS=* 才会放开全部来源（此时不允许 allow_credentials，见 app/__init__.py）。
    CORS_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            'CORS_ORIGINS',
            'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173',
        ).split(',')
        if o.strip()
    ]

    # LLM配置（主模型，复杂推理）
    LLM_API_KEY = os.environ.get('LLM_API_KEY')
    LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'https://api.openai.com/v1')
    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'gpt-4o-mini')

    # 本地模型（简单查询降本）
    LOCAL_LLM_BASE_URL = os.environ.get('LOCAL_LLM_BASE_URL', 'http://localhost:11434/v1')
    LOCAL_LLM_MODEL_NAME = os.environ.get('LOCAL_LLM_MODEL_NAME', 'deepseek-v4')

    # 数据库（始终使用绝对路径）
    DATABASE_PATH = os.environ.get('DATABASE_PATH', _DB_DEFAULT)

    # 文件上传
    UPLOAD_FOLDER = os.path.join(project_root, 'data', 'uploads')
    ALLOWED_EXTENSIONS = {'pdf', 'docx', 'md', 'txt', 'markdown', 'json', 'csv'}
    # 上传大小上限（默认 10MB），防止一次性 file.read() 造成内存 DoS。
    MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_BYTES', str(10 * 1024 * 1024)))

    # Zep（可选）：仅在配置了 API Key 时启用
    ZEP_API_URL = os.environ.get('ZEP_API_URL', '')
    ZEP_API_KEY = os.environ.get('ZEP_API_KEY', '')

    # 文本处理
    DEFAULT_CHUNK_SIZE = 500
    DEFAULT_CHUNK_OVERLAP = 50

    @classmethod
    def validate(cls) -> list[str]:
        errors = []
        if not cls.LLM_API_KEY:
            errors.append("LLM_API_KEY 未配置，请在 .env 中设置")
        return errors
