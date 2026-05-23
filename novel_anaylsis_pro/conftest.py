"""pytest 配置 - 处理包导入路径"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent

sys.path.insert(0, str(PROJECT_ROOT))
