"""pytest 配置：将项目根目录加入 sys.path"""

import sys
from pathlib import Path

# novel_anaylsis_pro 的父目录作为根
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
