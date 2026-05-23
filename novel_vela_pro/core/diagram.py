"""
Mermaid 图解生成模块
支持6种图解类型
"""
from typing import Dict, List, Optional, Any


class DiagramGenerator:
    """Mermaid 图解生成器"""

    @staticmethod
    def character_relationship(characters: List[Dict[str, Any]],
                                relations: Optional[List[Dict]] = None) -> str:
        """生成人物关系图"""
        lines = ["```mermaid", "graph LR"]

        for char in characters:
            name = char.get("name", "未知")
            char_type = char.get("type", "")
            style = " protagonist" if char_type == "protagonist" else ""
            lines.append(f"    {name}[{name}]{style}")

        if relations:
            for rel in relations:
                a = rel.get("character_a", "")
                b = rel.get("character_b", "")
                rt = rel.get("relation_type", "")
                lines.append(f"    {a} -->|{rt}| {b}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def world_map(maps: List[Dict[str, Any]]) -> str:
        """生成世界地图层级图"""
        lines = ["```mermaid", "graph TD"]

        for m in maps:
            name = m.get("name", "未知")
            level = m.get("level", 0)
            parent = m.get("parent_map_id")
            indent = "    " * level
            lines.append(f"{indent}{name}[{name}]")
            if parent:
                # 简化处理，实际应查找父级名称
                pass

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def plot_timeline(stages: List[Dict[str, Any]]) -> str:
        """生成剧情时间线图"""
        lines = ["```mermaid", "timeline"]

        for stage in stages:
            name = stage.get("name", "")
            start = stage.get("start_chapter", "")
            end = stage.get("end_chapter", "")
            lines.append(f"    第{start}-{end}章 : {name}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def power_system(levels: List[Dict[str, Any]]) -> str:
        """生成力量体系图"""
        lines = ["```mermaid", "graph BT"]

        for i, level in enumerate(levels):
            name = level.get("name", f"层级{i}")
            lines.append(f"    {name}[{name}]")
            if i > 0:
                prev = levels[i-1].get("name", f"层级{i-1}")
                lines.append(f"    {name} --> {prev}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def foreshadowing_tracker(foreshadowing: List[Dict[str, Any]]) -> str:
        """生成伏笔追踪图"""
        lines = ["```mermaid", "gantt"]
        lines.append("    title 伏笔时间线")
        lines.append("    dateFormat X")
        lines.append("    axisFormat %s")

        for fs in foreshadowing:
            desc = fs.get("description", "")[:20]
            plant = fs.get("plant_chapter", 0)
            resolve = fs.get("resolve_chapter", plant + 50)
            status = fs.get("status", "planted")
            lines.append(f"    {desc} :{status}, {plant}, {resolve}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def character_arc(character: Dict[str, Any], stages: List[Dict[str, Any]]) -> str:
        """生成人物弧线图"""
        lines = ["```mermaid", "journey"]
        lines.append(f"    title {character.get('name', '角色')}成长弧线")

        for stage in stages:
            name = stage.get("name", "")
            lines.append(f"    {name}: 5: 角色")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def generate_all(novel_data: Dict[str, Any]) -> Dict[str, str]:
        """生成所有图解"""
        result = {}

        if "characters" in novel_data:
            result["character_relationship"] = DiagramGenerator.character_relationship(
                novel_data["characters"],
                novel_data.get("relations", [])
            )

        if "maps" in novel_data:
            result["world_map"] = DiagramGenerator.world_map(novel_data["maps"])

        if "stages" in novel_data:
            result["plot_timeline"] = DiagramGenerator.plot_timeline(novel_data["stages"])

        if "power_levels" in novel_data:
            result["power_system"] = DiagramGenerator.power_system(novel_data["power_levels"])

        if "foreshadowing" in novel_data:
            result["foreshadowing"] = DiagramGenerator.foreshadowing_tracker(
                novel_data["foreshadowing"]
            )

        return result
