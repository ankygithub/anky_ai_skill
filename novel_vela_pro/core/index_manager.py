"""
RAG 自动索引管理器
负责将小说数据自动索引到向量数据库
"""
import os
from typing import List, Dict, Any, Optional


class IndexManager:
    """自动索引管理器"""

    def __init__(self, db, rag_retriever, novel_id: int):
        self.db = db
        self.rag = rag_retriever
        self.novel_id = novel_id

    def index_file(self, file_path: str, source_type: str, source_id: int = 0,
                   chunk_size: int = 500, overlap: int = 50) -> int:
        """索引单个文件内容"""
        if not os.path.exists(file_path):
            return 0

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        return self.index_text(content, source_type, source_id, chunk_size, overlap)

    def index_text(self, text: str, source_type: str, source_id: int = 0,
                   chunk_size: int = 500, overlap: int = 50) -> int:
        """索引文本内容（自动切片）"""
        if not text or not text.strip():
            return 0

        chunks = self._split_text(text, chunk_size, overlap)
        count = 0
        for i, chunk in enumerate(chunks):
            if chunk.strip():
                try:
                    self.rag.add_chunk(
                        content=chunk.strip(),
                        source_type=source_type,
                        source_id=source_id,
                        novel_id=self.novel_id,
                        chunk_index=i
                    )
                    count += 1
                except Exception:
                    pass
        return count

    def _split_text(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        """按段落和长度切片文本"""
        paragraphs = text.split("\n\n")
        chunks = []
        current_chunk = []
        current_len = 0

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            para_len = len(para)
            if current_len + para_len > chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                # 保留重叠部分
                overlap_text = []
                overlap_len = 0
                for p in reversed(current_chunk):
                    if overlap_len + len(p) > overlap:
                        break
                    overlap_text.insert(0, p)
                    overlap_len += len(p)
                current_chunk = overlap_text
                current_len = overlap_len

            current_chunk.append(para)
            current_len += para_len

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        return chunks

    def index_novel_settings(self, novel_dir: str) -> Dict[str, int]:
        """索引小说所有设定文件"""
        results = {}

        # 01-基础配置
        config_dir = os.path.join(novel_dir, "plan", "01-基础配置")
        if os.path.exists(config_dir):
            count = 0
            for f in os.listdir(config_dir):
                if f.endswith(".md"):
                    fp = os.path.join(config_dir, f)
                    count += self.index_file(fp, "config", 0)
            results["config"] = count

        # 02-核心设定
        core_dir = os.path.join(novel_dir, "plan", "02-核心设定")
        if os.path.exists(core_dir):
            count = 0
            for f in os.listdir(core_dir):
                if f.endswith(".md"):
                    fp = os.path.join(core_dir, f)
                    count += self.index_file(fp, "setting", 0)
            results["setting"] = count

        # 03-角色设定
        char_dir = os.path.join(novel_dir, "plan", "03-角色设定")
        if os.path.exists(char_dir):
            count = 0
            for f in os.listdir(char_dir):
                if f.endswith(".md"):
                    fp = os.path.join(char_dir, f)
                    count += self.index_file(fp, "character", 0)
            results["character"] = count

        # 04-世界观
        world_dir = os.path.join(novel_dir, "plan", "04-世界观")
        if os.path.exists(world_dir):
            count = 0
            for f in os.listdir(world_dir):
                if f.endswith(".md"):
                    fp = os.path.join(world_dir, f)
                    count += self.index_file(fp, "world", 0)
            results["world"] = count

        # 05-情节规划
        outline_dir = os.path.join(novel_dir, "plan", "05-情节规划")
        if os.path.exists(outline_dir):
            count = 0
            for f in os.listdir(outline_dir):
                if f.endswith(".md"):
                    fp = os.path.join(outline_dir, f)
                    count += self.index_file(fp, "outline", 0)
            results["outline"] = count

        # 06-阶段规划
        stage_dir = os.path.join(novel_dir, "plan", "06-阶段规划")
        if os.path.exists(stage_dir):
            count = 0
            for root, dirs, files in os.walk(stage_dir):
                for f in files:
                    if f.endswith(".md"):
                        fp = os.path.join(root, f)
                        count += self.index_file(fp, "stage", 0)
            results["stage"] = count

        return results

    def index_characters_from_db(self) -> int:
        """从数据库索引所有人物"""
        characters = self.db.get_characters(self.novel_id)
        count = 0
        for char in characters:
            content = f"角色：{char['name']}\n"
            content += f"类型：{char['type']}\n"
            content += f"状态：{char['status']}\n"
            if char.get("faction"):
                content += f"势力：{char['faction']}\n"
            if char.get("cultivation_level"):
                content += f"修为：{char['cultivation_level']}\n"
            content += f"重要度：{char['importance']}\n"

            try:
                self.rag.add_chunk(
                    content=content,
                    source_type="character",
                    source_id=char["id"],
                    novel_id=self.novel_id
                )
                count += 1
            except Exception:
                pass
        return count

    def index_maps_from_db(self) -> int:
        """从数据库索引所有地图"""
        maps = self.db.get_maps(self.novel_id)
        count = 0
        for m in maps:
            content = f"地图：{m['name']}\n"
            content += f"层级：{m.get('level', '')}\n"
            if m.get("description"):
                content += f"描述：{m['description']}\n"
            if m.get("factions"):
                content += f"势力：{m['factions']}\n"
            if m.get("power_level"):
                content += f"实力水平：{m['power_level']}\n"

            try:
                self.rag.add_chunk(
                    content=content,
                    source_type="map",
                    source_id=m["id"],
                    novel_id=self.novel_id
                )
                count += 1
            except Exception:
                pass
        return count

    def index_stages_from_db(self) -> int:
        """从数据库索引所有阶段"""
        stages = self.db.get_stages(self.novel_id)
        count = 0
        for s in stages:
            content = f"阶段{s['stage_number']}：{s['name']}\n"
            content += f"章节范围：第{s.get('start_chapter', '?')}-{s.get('end_chapter', '?')}章\n"
            if s.get("description"):
                content += f"描述：{s['description']}\n"
            if s.get("map_name"):
                content += f"主要地图：{s['map_name']}\n"

            try:
                self.rag.add_chunk(
                    content=content,
                    source_type="stage",
                    source_id=s["id"],
                    novel_id=self.novel_id
                )
                count += 1
            except Exception:
                pass
        return count

    def full_index(self, novel_dir: str) -> Dict[str, Any]:
        """执行完整索引（文件 + 数据库）"""
        # 先清空旧索引
        self.rag.rebuild_index(self.novel_id)

        results = {
            "files": self.index_novel_settings(novel_dir),
            "characters": self.index_characters_from_db(),
            "maps": self.index_maps_from_db(),
            "stages": self.index_stages_from_db(),
        }

        status = self.rag.get_status(self.novel_id)
        results["total_chunks"] = status["total_chunks"]
        return results
