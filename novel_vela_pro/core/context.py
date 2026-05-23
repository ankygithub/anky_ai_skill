"""
上下文管理模块
生成章节写作前的上下文报告
"""
from typing import Optional, Dict, List, Any


class ContextManager:
    """上下文管理器"""

    def __init__(self, db, novel_id: int):
        self.db = db
        self.novel_id = novel_id

    def get_chapter_context(self, chapter_number: int) -> Dict[str, Any]:
        """获取完整章节上下文"""
        return {
            "blueprint": self.get_blueprint(chapter_number),
            "recent_summary": self.get_recent_summary(chapter_number),
            "character_states": self.get_character_states(chapter_number),
            "active_foreshadowing": self.get_active_foreshadowing(chapter_number),
            "map_info": self.get_current_map(chapter_number),
        }

    def get_blueprint(self, chapter_number: int) -> Optional[Dict[str, Any]]:
        """获取章节蓝图信息"""
        chapter = self.db.get_chapter(self.novel_id, chapter_number)
        if not chapter:
            return None
        return {
            "chapter_number": chapter["chapter_number"],
            "title": chapter["title"],
            "status": chapter["status"],
            "blueprint_md_path": chapter["blueprint_md_path"],
        }

    def get_recent_summary(self, chapter_number: int, max_words: int = 10000) -> List[Dict[str, Any]]:
        """获取最近章节摘要"""
        summaries = []
        current_words = 0
        for cn in range(chapter_number - 1, 0, -1):
            chapter = self.db.get_chapter(self.novel_id, cn)
            if not chapter:
                continue
            word_count = chapter.get("word_count") or 0
            if current_words + word_count > max_words and len(summaries) >= 3:
                break
            summaries.insert(0, {
                "chapter_number": cn,
                "title": chapter.get("title", ""),
                "word_count": word_count,
                "summary": f"[第{cn}章摘要待生成]",
            })
            current_words += word_count
            if len(summaries) >= 5:
                break
        return summaries

    def get_character_states(self, chapter_number: int) -> List[Dict[str, Any]]:
        """获取活跃人物状态"""
        characters = self.db.get_active_characters(self.novel_id, chapter_number)
        states = []
        for char in characters:
            states.append({
                "name": char["name"],
                "type": char["type"],
                "status": char["status"],
                "faction": char.get("faction", ""),
                "cultivation_level": char.get("cultivation_level", ""),
                "first_appearance": char.get("first_appearance"),
                "last_appearance": char.get("last_appearance"),
            })
        return states

    def get_active_foreshadowing(self, chapter_number: int) -> List[Dict[str, Any]]:
        """获取待回收伏笔"""
        return self.db.get_active_foreshadowing(self.novel_id, chapter_number)

    def get_current_map(self, chapter_number: int) -> Optional[Dict[str, Any]]:
        """获取当前地图信息"""
        chapter = self.db.get_chapter(self.novel_id, chapter_number)
        if not chapter or not chapter.get("map_id"):
            return None
        return self.db.get_map(chapter["map_id"])

    def build_context_report(self, chapter_number: int,
                             rag_results: Optional[List[Dict]] = None,
                             style_profile: Optional[Dict] = None) -> str:
        """构建完整的上下文报告"""
        ctx = self.get_chapter_context(chapter_number)
        lines = [
            f"# 第{chapter_number}章写作上下文报告",
            "",
            "## 本章蓝图",
        ]
        if ctx["blueprint"]:
            bp = ctx["blueprint"]
            lines.append(f"- 章节：第{bp['chapter_number']}章 {bp['title'] or '未命名'}")
            lines.append(f"- 状态：{bp['status']}")
        else:
            lines.append("- 暂无蓝图")

        lines.extend(["", "## 前文摘要"])
        if ctx["recent_summary"]:
            for s in ctx["recent_summary"]:
                lines.append(f"### 第{s['chapter_number']}章 {s['title']}")
                lines.append(f"{s['summary']}（{s['word_count']}字）")
        else:
            lines.append("- 无前文（本章为开篇）")

        lines.extend(["", "## 活跃人物状态"])
        if ctx["character_states"]:
            for char in ctx["character_states"]:
                level = char.get('cultivation_level', '')
                faction = char.get('faction', '')
                lines.append(f"- **{char['name']}**：{char['status']} | {level} | {faction}")
        else:
            lines.append("- 暂无活跃人物")

        lines.extend(["", "## 待回收伏笔"])
        if ctx["active_foreshadowing"]:
            for fs in ctx["active_foreshadowing"]:
                importance = "重要" if fs.get('importance', 1) >= 5 else "次要"
                plant = fs.get('plant_chapter', '?')
                lines.append(f"- [{importance}] {fs['description']}（第{plant}章埋下）")
        else:
            lines.append("- 无待回收伏笔")

        lines.extend(["", "## 当前地图"])
        if ctx["map_info"]:
            m = ctx["map_info"]
            lines.append(f"- **{m['name']}**：{m.get('description', '')}")
            lines.append(f"- 势力分布：{m.get('factions', '')}")
            lines.append(f"- 实力水平：{m.get('power_level', '')}")
        else:
            lines.append("- 当前无地图信息")

        if rag_results:
            lines.extend(["", "## RAG召回设定（自动注入）"])
            for r in rag_results[:5]:
                lines.append(f"- [{r['source_type']}] {r['content'][:100]}...")

        lines.extend(["", "## 文风提示"])
        if style_profile:
            for dim, val in style_profile.items():
                lines.append(f"- {dim}：{val}")
        else:
            lines.append("- 参考风格：默认网文风格")
            lines.append("- 句式特点：长短句交替，允许口语化")
            lines.append("- 当前情绪基调：根据蓝图场景确定")

        return "\n".join(lines)
