"""pytest 共享配置:把 backend 目录加入 sys.path,便于 `from app...` 导入。"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
