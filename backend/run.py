"""
Moirca Backend 启动入口
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

from app import create_app
from app.config import Config

app = create_app()


def main():
    errors = Config.validate()
    if errors:
        if Config.DEBUG:
            print("[警告] 开发模式下允许缺少部分配置:")
            for err in errors:
                print(f"  - {err}")
            print("\n将继续启动，LLM 相关功能会自动降级为模板/规则模式。")
        else:
            print("配置错误:")
            for err in errors:
                print(f"  - {err}")
            print("\n请检查 .env 文件中的配置")
            sys.exit(1)

    uvicorn.run(
        "run:app",
        host=Config.HOST,
        port=Config.PORT,
        reload=Config.DEBUG,
    )


if __name__ == '__main__':
    main()
