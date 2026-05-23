"""
.learnings/ 记忆系统管理器
管理16个记忆文件，支持读写和同步
"""
import os
from typing import Dict, List, Optional, Any
from pathlib import Path


# 记忆文件定义
LEARNINGS_FILES = {
    "CORE": [
        "CHARACTERS.md",
        "LOCATIONS.md",
        "PLOT_POINTS.md",
        "STORY_BIBLE.md",
        "ERRORS.md",
    ],
    "EXTENDED": [
        "TIMELINE.md",
        "RELATIONSHIPS.md",
        "FORESHADOWING.md",
        "ARCS.md",
        "ITEMS.md",
        "POWER_SYSTEM.md",
        "MAPS.md",
        "STATS.md",
        "STYLE_GUIDE.md",
    ],
    "STYLE": [
        "WRITING_STYLE.md",
        "TEMPLATES_USED.md",
    ],
}


class LearningsManager:
    """.learnings/ 记忆管理器"""

    def __init__(self, novel_dir: str):
        self.learnings_dir = os.path.join(novel_dir, ".learnings")
        self._ensure_structure()

    def _ensure_structure(self):
        """确保目录结构存在"""
        for category in LEARNINGS_FILES:
            cat_dir = os.path.join(self.learnings_dir, category)
            os.makedirs(cat_dir, exist_ok=True)

    def get_file_path(self, filename: str) -> str:
        """获取记忆文件路径"""
        for category, files in LEARNINGS_FILES.items():
            if filename in files:
                return os.path.join(self.learnings_dir, category, filename)
        return os.path.join(self.learnings_dir, filename)

    def read(self, filename: str) -> str:
        """读取记忆文件"""
        path = self.get_file_path(filename)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return ""

    def write(self, filename: str, content: str):
        """写入记忆文件"""
        path = self.get_file_path(filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def append(self, filename: str, content: str):
        """追加内容到记忆文件"""
        path = self.get_file_path(filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(content)

    def exists(self, filename: str) -> bool:
        """检查记忆文件是否存在"""
        return os.path.exists(self.get_file_path(filename))

    def list_files(self, category: Optional[str] = None) -> List[str]:
        """列出记忆文件"""
        if category:
            return [f for f in LEARNINGS_FILES.get(category, []) if self.exists(f)]
        return [f for cat in LEARNINGS_FILES.values() for f in cat if self.exists(f)]

    def get_all_content(self) -> Dict[str, str]:
        """获取所有记忆文件内容"""
        result = {}
        for cat, files in LEARNINGS_FILES.items():
            for f in files:
                content = self.read(f)
                if content:
                    result[f] = content
        return result

    def init_from_template(self, template_dir: str):
        """从模板初始化记忆文件"""
        for category, files in LEARNINGS_FILES.items():
            for filename in files:
                template_path = os.path.join(template_dir, category, f"{filename}.template")
                target_path = self.get_file_path(filename)
                if os.path.exists(template_path) and not os.path.exists(target_path):
                    with open(template_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    self.write(filename, content)

    def sync_from_db(self, db, novel_id: int):
        """从数据库同步到 .learnings/"""
        # 同步角色
        characters = db.get_characters(novel_id)
        if characters:
            lines = ["# 角色记忆\n"]
            for char in characters:
                lines.append(f"## {char['name']} ({char['type']})")
                lines.append(f"- 状态：{char['status']}")
                lines.append(f"- 势力：{char.get('faction', '')}")
                lines.append(f"- 修为：{char.get('cultivation_level', '')}")
                lines.append(f"- 重要度：{char['importance']}")
                lines.append("")
            self.write("CHARACTERS.md", "\n".join(lines))

        # 同步地图
        maps = db.get_maps(novel_id)
        if maps:
            lines = ["# 地点记忆\n"]
            for m in maps:
                lines.append(f"## {m['name']} (层级{m.get('level', '?')})")
                lines.append(f"- 描述：{m.get('description', '')}")
                lines.append(f"- 势力：{m.get('factions', '')}")
                lines.append("")
            self.write("LOCATIONS.md", "\n".join(lines))

        # 同步伏笔
        foreshadowing = db.get_foreshadowing(novel_id, status="planted")
        if foreshadowing:
            lines = ["# 伏笔记忆\n"]
            for fs in foreshadowing:
                lines.append(f"## [{fs.get('importance', 1)}] {fs['description'][:50]}...")
                lines.append(f"- 埋下：第{fs.get('plant_chapter', '?')}章")
                lines.append(f"- 预计回收：第{fs.get('resolve_chapter', '?')}章")
                lines.append("")
            self.write("FORESHADOWING.md", "\n".join(lines))

    def build_context_summary(self) -> str:
        """构建记忆上下文摘要（用于LLM提示词）"""
        parts = []
        for filename in ["CHARACTERS.md", "LOCATIONS.md", "FORESHADOWING.md", "POWER_SYSTEM.md"]:
            content = self.read(filename)
            if content:
                parts.append(f"\n--- {filename} ---\n{content[:2000]}")
        return "\n".join(parts)
