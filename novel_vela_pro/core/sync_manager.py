"""
双轨同步管理器
SQLite <-> .learnings/ 双向同步
"""
import os
from typing import Dict, List, Optional, Any


class SyncManager:
    """同步管理器"""

    def __init__(self, db, learnings_manager):
        self.db = db
        self.learnings = learnings_manager

    def sync_db_to_learnings(self, novel_id: int):
        """将数据库内容同步到 .learnings/"""
        self.learnings.sync_from_db(self.db, novel_id)

    def sync_learnings_to_db(self, novel_id: int):
        """将 .learnings/ 内容同步到数据库（选择性）"""
        # 同步风格配置
        style_content = self.learnings.read("STYLE_GUIDE.md")
        if style_content:
            # 解析并更新 style_profiles
            pass

    def full_sync(self, novel_id: int):
        """执行完整双向同步"""
        self.sync_db_to_learnings(novel_id)
        self.sync_learnings_to_db(novel_id)

    def check_consistency(self, novel_id: int) -> Dict[str, Any]:
        """检查 DB 和 .learnings/ 的一致性"""
        issues = []

        # 检查角色数量
        db_chars = len(self.db.get_characters(novel_id))
        learnings_chars = self.learnings.read("CHARACTERS.md")
        learnings_char_count = learnings_chars.count("## ") if learnings_chars else 0

        if db_chars != learnings_char_count:
            issues.append({
                "type": "character_count_mismatch",
                "db_count": db_chars,
                "learnings_count": learnings_char_count,
            })

        # 检查地图数量
        db_maps = len(self.db.get_maps(novel_id))
        learnings_maps = self.learnings.read("LOCATIONS.md")
        learnings_map_count = learnings_maps.count("## ") if learnings_maps else 0

        if db_maps != learnings_map_count:
            issues.append({
                "type": "map_count_mismatch",
                "db_count": db_maps,
                "learnings_count": learnings_map_count,
            })

        return {
            "consistent": len(issues) == 0,
            "issues": issues,
        }
