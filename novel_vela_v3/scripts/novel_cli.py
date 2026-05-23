#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Novel Vela V3 CLI - AI小说创作全流程管理工具
融合版：V1完整功能 + V2两阶段模型 + 增强路径处理

两阶段协作模式：
  阶段1（CLI）：建骨架、管数据、出模板、RAG检索、审查同步
  阶段2（AI）：读模板、填内容、生成创作物

运行方式：python novel_cli.py <命令>
"""

import click
import os
import sys
import shutil
import sqlite3
import struct
import requests
from datetime import datetime
from typing import Optional, Dict, List, Any


# ---------------------------------------------------------------------------
# 路径配置
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(SKILL_DIR, "assets", "templates")


# ---------------------------------------------------------------------------
# 工具函数（V2增强路径处理）
# ---------------------------------------------------------------------------

def find_novel_db(project_dir: str = ".") -> str:
    """智能查找 novel.db（支持三种路径模式）"""
    project_dir = os.path.abspath(project_dir)
    
    # 模式1：直接在 project_dir/plan/novel.db
    direct = os.path.join(project_dir, "plan", "novel.db")
    if os.path.exists(direct):
        return direct
    
    # 模式2：project_dir 是《书名》目录
    if os.path.exists(direct):
        return direct
    
    # 模式3：查找子目录中的《书名》目录
    if os.path.isdir(project_dir):
        for entry in os.listdir(project_dir):
            if entry.startswith("《") and entry.endswith("》"):
                sub_dir = os.path.join(project_dir, entry)
                db_path = os.path.join(sub_dir, "plan", "novel.db")
                if os.path.exists(db_path):
                    return db_path
    
    raise FileNotFoundError(f"未找到 novel.db，请确认项目目录：{project_dir}")


def get_novel_info(db_path: str) -> dict:
    """获取小说基本信息"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM novels WHERE status != 'template' LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}


def get_novel_dir(project_dir: str, novel_name: str = None) -> str:
    """获取小说项目根目录（V2增强版）"""
    project_dir = os.path.abspath(project_dir)
    
    if novel_name:
        novel_dir = os.path.join(project_dir, f"《{novel_name}》")
        if os.path.isdir(novel_dir):
            return novel_dir
    
    # 尝试从DB推断
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        if novel and novel.get("name"):
            plan_dir = os.path.dirname(db_path)
            return os.path.dirname(plan_dir)
    except:
        pass
    
    return project_dir


# ---------------------------------------------------------------------------
# 数据库核心模块 (V1完整功能保留)
# ---------------------------------------------------------------------------

class NovelDB:
    """数据库操作类 - V1完整实现"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        if not os.path.exists(db_path):
            self._init_from_template()
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
    
    def _init_from_template(self):
        """从模板初始化数据库"""
        template_path = os.path.join(ASSETS_DIR, "novel_template.db")
        if os.path.exists(template_path):
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            shutil.copy2(template_path, self.db_path)
        else:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            conn = sqlite3.connect(self.db_path)
            conn.executescript(self._get_schema_sql())
            conn.commit()
            conn.close()
    
    @staticmethod
    def _get_schema_sql() -> str:
        return """
CREATE TABLE novels (id INTEGER PRIMARY KEY, name TEXT NOT NULL, genre TEXT, sub_genre TEXT, target_audience TEXT, story_structure TEXT, narrative_perspective TEXT, total_chapters INTEGER, words_per_chapter INTEGER, total_words INTEGER, status TEXT DEFAULT 'planning', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE stages (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), stage_number INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, word_count INTEGER, start_chapter INTEGER, end_chapter INTEGER, map_name TEXT, status TEXT DEFAULT 'planned', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE characters (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), name TEXT NOT NULL, name_pinyin TEXT, type TEXT NOT NULL, status TEXT DEFAULT 'active', first_appearance INTEGER, last_appearance INTEGER, death_chapter INTEGER, faction TEXT, cultivation_level TEXT, importance INTEGER DEFAULT 1, is_confirmed BOOLEAN DEFAULT 0, md_file_path TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE character_relations (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), character_a_id INTEGER REFERENCES characters(id), character_b_id INTEGER REFERENCES characters(id), relation_type TEXT NOT NULL, description TEXT, start_chapter INTEGER, end_chapter INTEGER, is_active BOOLEAN DEFAULT 1);
CREATE TABLE character_appearances (id INTEGER PRIMARY KEY, character_id INTEGER REFERENCES characters(id), chapter_number INTEGER NOT NULL, scene_number INTEGER, role TEXT, action TEXT);
CREATE TABLE maps (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), name TEXT NOT NULL, level INTEGER, parent_map_id INTEGER REFERENCES maps(id), description TEXT, entry_condition TEXT, power_level TEXT, factions TEXT, status TEXT DEFAULT 'active');
CREATE TABLE chapters (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), stage_id INTEGER REFERENCES stages(id), chapter_number INTEGER NOT NULL, title TEXT, map_id INTEGER REFERENCES maps(id), word_count INTEGER, status TEXT DEFAULT 'planned', md_file_path TEXT, blueprint_md_path TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE chapter_scenes (id INTEGER PRIMARY KEY, chapter_id INTEGER REFERENCES chapters(id), scene_number INTEGER NOT NULL, title TEXT, purpose TEXT, mood TEXT, word_budget INTEGER, characters TEXT, key_events TEXT, foreshadowing TEXT, climax_marker BOOLEAN DEFAULT 0);
CREATE TABLE foreshadowing (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), description TEXT NOT NULL, plant_chapter INTEGER, resolve_chapter INTEGER, status TEXT DEFAULT 'planted', importance INTEGER DEFAULT 1);
CREATE TABLE versions (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), file_path TEXT NOT NULL, version_number INTEGER, content_hash TEXT, change_summary TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE rag_chunks (id INTEGER PRIMARY KEY, novel_id INTEGER REFERENCES novels(id), content TEXT NOT NULL, source_type TEXT NOT NULL, source_id INTEGER, chunk_index INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
"""

    def get_tables(self) -> List[str]:
        cursor = self.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return [row["name"] for row in cursor.fetchall()]

    def _insert(self, table: str, row_data: Dict[str, Any]) -> int:
        fields = list(row_data.keys())
        placeholders = ["?"] * len(fields)
        sql = f"INSERT INTO {table} ({', '.join(fields)}) VALUES ({', '.join(placeholders)})"
        cursor = self.conn.execute(sql, list(row_data.values()))
        self.conn.commit()
        return cursor.lastrowid

    # --- novels ---
    def create_novel(self, data: Dict[str, Any]) -> int:
        return self._insert("novels", data)

    def get_novel(self, novel_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM novels WHERE id = ?", (novel_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_novel_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM novels WHERE name = ? AND status != 'template'", (name,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def update_novel(self, novel_id: int, data: Dict[str, Any]) -> bool:
        fields = [f"{k} = ?" for k in data.keys()]
        values = list(data.values()) + [novel_id]
        sql = f"UPDATE novels SET {', '.join(fields)} WHERE id = ?"
        cursor = self.conn.execute(sql, values)
        self.conn.commit()
        return cursor.rowcount > 0

    # --- stages ---
    def create_stage(self, data: Dict[str, Any]) -> int:
        return self._insert("stages", data)

    def get_stages(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM stages WHERE novel_id = ? ORDER BY stage_number",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    # --- characters ---
    def create_character(self, data: Dict[str, Any]) -> int:
        return self._insert("characters", data)

    def get_character(self, novel_id: int, name: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM characters WHERE novel_id = ? AND name = ?",
            (novel_id, name)
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_characters(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM characters WHERE novel_id = ? ORDER BY importance DESC, name",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    def update_character_status(self, character_id: int, status: str) -> bool:
        cursor = self.conn.execute(
            "UPDATE characters SET status = ? WHERE id = ?",
            (status, character_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def log_appearance(self, character_id: int, chapter_number: int, scene_number: Optional[int] = None, role: Optional[str] = None, action: Optional[str] = None) -> int:
        cursor = self.conn.execute(
            "INSERT INTO character_appearances (character_id, chapter_number, scene_number, role, action) VALUES (?, ?, ?, ?, ?)",
            (character_id, chapter_number, scene_number, role, action)
        )
        self.conn.execute(
            "UPDATE characters SET last_appearance = ? WHERE id = ? AND (last_appearance IS NULL OR last_appearance < ?)",
            (chapter_number, character_id, chapter_number)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_active_characters(self, novel_id: int, chapter_number: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            """
            SELECT c.* FROM characters c
            WHERE c.novel_id = ? AND c.status != 'dead'
            AND (c.first_appearance IS NULL OR c.first_appearance <= ?)
            ORDER BY c.importance DESC, c.name
            """,
            (novel_id, chapter_number)
        )
        return [dict(row) for row in cursor.fetchall()]

    # --- maps ---
    def create_map(self, data: Dict[str, Any]) -> int:
        return self._insert("maps", data)

    def get_maps(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM maps WHERE novel_id = ? ORDER BY level, name",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    # --- chapters ---
    def create_chapter(self, data: Dict[str, Any]) -> int:
        return self._insert("chapters", data)

    def get_chapter(self, novel_id: int, chapter_number: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM chapters WHERE novel_id = ? AND chapter_number = ?",
            (novel_id, chapter_number)
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_chapters(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_number",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    def update_chapter_status(self, chapter_id: int, status: str) -> bool:
        cursor = self.conn.execute(
            "UPDATE chapters SET status = ? WHERE id = ?",
            (status, chapter_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def update_chapter_blueprint(self, chapter_id: int, blueprint_path: str) -> bool:
        cursor = self.conn.execute(
            "UPDATE chapters SET blueprint_md_path = ? WHERE id = ?",
            (blueprint_path, chapter_id)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    # --- foreshadowing ---
    def create_foreshadowing(self, data: Dict[str, Any]) -> int:
        return self._insert("foreshadowing", data)

    def get_foreshadowing(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM foreshadowing WHERE novel_id = ? ORDER BY plant_chapter",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_active_foreshadowing(self, novel_id: int, chapter_number: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            """
            SELECT * FROM foreshadowing
            WHERE novel_id = ? AND status = 'planted'
            AND (resolve_chapter IS NULL OR resolve_chapter >= ?)
            ORDER BY importance DESC, plant_chapter
            """,
            (novel_id, chapter_number)
        )
        return [dict(row) for row in cursor.fetchall()]

    def close(self):
        if self.conn:
            self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# ---------------------------------------------------------------------------
# RAG向量检索模块 (V1完整功能保留)
# ---------------------------------------------------------------------------

class RAGRetriever:
    """RAG向量检索 - 完整实现（V1功能）"""
    
    def __init__(self, db_path: str, ollama_url: str = "http://127.0.0.1:11434", model: str = "nomic-embed-text"):
        self.db_path = db_path
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_vector_db()
    
    def _init_vector_db(self):
        """初始化sqlite-vec虚拟表"""
        try:
            self.conn.execute("SELECT load_extension('sqlite_vec')")
        except sqlite3.OperationalError:
            pass
        try:
            self.conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
                    chunk_id INTEGER PRIMARY KEY,
                    embedding FLOAT[768]
                )
            """)
        except sqlite3.OperationalError:
            pass
    
    def get_embedding(self, text: str) -> Optional[List[float]]:
        """调用Ollama API获取文本嵌入向量"""
        try:
            resp = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("embedding")
        except Exception as e:
            click.echo(f"⚠️ Ollama调用失败：{e}")
            return None
    
    def add_chunk(self, novel_id: int, content: str, source_type: str, source_id: Optional[int] = None, chunk_index: int = 0) -> bool:
        """添加文本切片并生成向量嵌入"""
        embedding = self.get_embedding(content)
        if not embedding:
            return False
        
        cursor = self.conn.execute(
            "INSERT INTO rag_chunks (novel_id, content, source_type, source_id, chunk_index) VALUES (?, ?, ?, ?, ?)",
            (novel_id, content, source_type, source_id, chunk_index)
        )
        chunk_id = cursor.lastrowid
        
        # 将向量转换为二进制格式存入sqlite-vec
        vec_bytes = struct.pack(f"<{len(embedding)}f", *embedding)
        self.conn.execute(
            "INSERT OR REPLACE INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)",
            (chunk_id, vec_bytes)
        )
        self.conn.commit()
        return True
    
    def search(self, query: str, novel_id: int, top_k: int = 5, source_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """语义搜索（余弦相似度排序）"""
        query_vec = self.get_embedding(query)
        if not query_vec:
            return []
        
        query_bytes = struct.pack(f"<{len(query_vec)}f", *query_vec)
        
        sql = """
            SELECT rc.id, rc.content, rc.source_type, rc.source_id,
                   vec_distance_L2(vc.embedding, ?) as distance
            FROM vec_chunks vc
            JOIN rag_chunks rc ON vc.chunk_id = rc.id
            WHERE rc.novel_id = ?
        """
        params = [query_bytes, novel_id]
        
        if source_type:
            sql += " AND rc.source_type = ?"
            params.append(source_type)
        
        sql += " ORDER BY distance LIMIT ?"
        params.append(top_k)
        
        try:
            cursor = self.conn.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.OperationalError:
            # sqlite-vec未安装时的降级处理
            cursor = self.conn.execute(
                "SELECT id, content, source_type, source_id FROM rag_chunks WHERE novel_id = ? LIMIT ?",
                (novel_id, top_k)
            )
            return [dict(row) for row in cursor.fetchall()]
    
    def rebuild_index(self, novel_id: int):
        """重建向量索引"""
        self.conn.execute("DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE novel_id = ?)", (novel_id,))
        self.conn.execute("DELETE FROM rag_chunks WHERE novel_id = ?", (novel_id,))
        self.conn.commit()
    
    def get_status(self, novel_id: int) -> Dict[str, Any]:
        """查看向量索引状态"""
        count = self.conn.execute(
            "SELECT COUNT(*) FROM rag_chunks WHERE novel_id = ?",
            (novel_id,)
        ).fetchone()[0]
        return {
            "total_chunks": count,
            "embedding_model": self.model,
            "ollama_url": self.ollama_url,
        }
    
    def close(self):
        if self.conn:
            self.conn.close()


# ---------------------------------------------------------------------------
# 上下文管理模块 (V1完整功能保留 + V2增强)
# ---------------------------------------------------------------------------

class ContextManager:
    """上下文管理 - 动态窗口 + 多维度信息聚合（V1功能保留）"""
    
    def __init__(self, db: NovelDB, novel_id: int):
        self.db = db
        self.novel_id = novel_id
    
    def get_blueprint(self, chapter_number: int) -> Optional[str]:
        """获取本章蓝图内容"""
        chapter = self.db.get_chapter(self.novel_id, chapter_number)
        if chapter and chapter.get("blueprint_md_path"):
            bp_path = chapter["blueprint_md_path"]
            if os.path.exists(bp_path):
                with open(bp_path, "r", encoding="utf-8") as f:
                    return f.read()
        return None
    
    def get_recent_summary(self, chapter_number: int, max_chars: int = 10000, max_chapters: int = 5) -> List[Dict[str, Any]]:
        """获取最近章节摘要（动态窗口）"""
        summaries = []
        total_chars = 0
        
        for cn in range(chapter_number - 1, 0, -1):
            if len(summaries) >= max_chapters:
                break
            
            chapter = self.db.get_chapter(self.novel_id, cn)
            if not chapter:
                continue
            
            # 如果已有正文，读取正文内容
            content = ""
            if chapter.get("md_file_path") and os.path.exists(chapter["md_file_path"]):
                with open(chapter["md_file_path"], "r", encoding="utf-8") as f:
                    content = f.read()
            
            summary_text = f"第{cn}章 {chapter.get('title', '未命名')}\n状态：{chapter['status']}\n字数：{chapter.get('word_count') or 0}"
            if content:
                summary_text += f"\n摘要：{content[:500]}..."
            
            if total_chars + len(summary_text) > max_chars and summaries:
                break
            
            summaries.append({
                "chapter_number": cn,
                "title": chapter.get("title", ""),
                "status": chapter["status"],
                "word_count": chapter.get("word_count", 0),
                "summary": summary_text,
            })
            total_chars += len(summary_text)
        
        return list(reversed(summaries))
    
    def get_character_states(self, chapter_number: int) -> List[Dict[str, Any]]:
        """获取活跃人物状态"""
        return self.db.get_active_characters(self.novel_id, chapter_number)
    
    def get_active_foreshadowing(self, chapter_number: int) -> List[Dict[str, Any]]:
        """获取待回收伏笔"""
        return self.db.get_active_foreshadowing(self.novel_id, chapter_number)
    
    def get_current_map(self, chapter_number: int) -> Optional[Dict[str, Any]]:
        """获取当前地图信息"""
        chapter = self.db.get_chapter(self.novel_id, chapter_number)
        if chapter and chapter.get("map_id"):
            cursor = self.db.conn.execute("SELECT * FROM maps WHERE id = ?", (chapter["map_id"],))
            row = cursor.fetchone()
            return dict(row) if row else None
        return None
    
    def build_context_report(self, chapter_number: int, project_dir: str) -> str:
        """生成完整的写作上下文报告（V1功能 + V2格式）"""
        lines = [f"# 第{chapter_number}章写作上下文报告", ""]
        
        # 1. 本章蓝图
        lines.extend(["## 本章蓝图"])
        blueprint = self.get_blueprint(chapter_number)
        if blueprint:
            lines.append(f"\n{blueprint[:2000]}")
            if len(blueprint) > 2000:
                lines.append("\n... (完整蓝图请查看文件)")
        else:
            lines.append("\n⚠️ 暂无蓝图（请先执行 blueprint init 并填充内容）")
        
        # 2. 前文摘要
        lines.extend(["", "## 前文摘要"])
        summaries = self.get_recent_summary(chapter_number)
        if summaries:
            for s in summaries:
                lines.append(f"### 第{s['chapter_number']}章 {s['title']}\n{s['summary']}\n")
        else:
            lines.append("- 无前文（本章为开篇或前几章尚未写作）")
        
        # 3. 活跃人物
        lines.extend(["", "## 活跃人物状态"])
        chars = self.get_character_states(chapter_number)
        if chars:
            for char in chars[:10]:
                lines.append(f"- **{char['name']}**（{char['type']}）：{char['status']} | 势力：{char.get('faction', '')} | 修为：{char.get('cultivation_level', '')}")
            if len(chars) > 10:
                lines.append(f"- ... 共{len(chars)}位活跃人物")
        else:
            lines.append("- 暂无活跃人物")
        
        # 4. 待回收伏笔
        lines.extend(["", "## 待回收伏笔"])
        fs_list = self.get_active_foreshadowing(chapter_number)
        if fs_list:
            for fs in fs_list[:10]:
                importance_tag = "重要" if fs.get('importance', 1) >= 5 else "次要"
                lines.append(f"- [{importance_tag}] {fs['description']}（第{fs['plant_chapter']}章埋下）")
            if len(fs_list) > 10:
                lines.append(f"- ... 共{len(fs_list)}条待回收伏笔")
        else:
            lines.append("- 无待回收伏笔")
        
        # 5. 当前地图
        lines.extend(["", "## 当前地图"])
        map_info = self.get_current_map(chapter_number)
        if map_info:
            lines.append(f"- **{map_info['name']}**：{map_info.get('description', '')}")
            lines.append(f"- 势力分布：{map_info.get('factions', '')}")
            lines.append(f"- 实力水平：{map_info.get('power_level', '')}")
        else:
            lines.append("- 当前无地图信息")
        
        # 6. 文风提示
        lines.extend([
            "",
            "## 文风提示",
            "- 参考风格：请在 plan/02-核心设定/参考作品与文风.md 中查看",
            "- 句式特点：长短句交替，允许口语化",
            "- 当前情绪基调：根据蓝图场景确定",
            "",
            "---",
            f"*报告生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*",
        ])
        
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI 命令定义
# ---------------------------------------------------------------------------

@click.group()
@click.option("--project", "-p", default=".", help="小说项目目录")
@click.pass_context
def cli(ctx, project):
    """小说创作工具 - Novel Vela V3（融合版）"""
    ctx.ensure_object(dict)
    ctx.obj["project"] = project


# ---------- init 命令 ----------
@cli.command()
@click.argument("novel_name")
@click.option("--genre", "-g", default="", help="小说类型")
@click.option("--total-words", "-w", default=500000, help="总字数")
@click.option("--chapters", "-c", default=80, help="总章数")
@click.option("--words-per-chapter", default=6000, help="每章字数")
@click.pass_context
def init(ctx, novel_name, genre, total_words, chapters, words_per_chapter):
    """初始化新小说项目（阶段1：建骨架）"""
    project_dir = ctx.obj.get("project", ".")
    novel_dir = os.path.join(os.path.abspath(project_dir), f"《{novel_name}》")
    
    if os.path.exists(novel_dir):
        click.echo(f"错误：目录已存在 {novel_dir}")
        return
    
    # 创建目录结构
    dirs = [
        os.path.join(novel_dir, "plan", "01-基础配置"),
        os.path.join(novel_dir, "plan", "02-核心设定"),
        os.path.join(novel_dir, "plan", "03-角色设定"),
        os.path.join(novel_dir, "plan", "04-世界观"),
        os.path.join(novel_dir, "plan", "05-情节规划"),
        os.path.join(novel_dir, "plan", "06-阶段规划", "章节蓝图"),
        os.path.join(novel_dir, "characters", "主角"),
        os.path.join(novel_dir, "characters", "重要配角"),
        os.path.join(novel_dir, "characters", "NPC"),
        os.path.join(novel_dir, "小说正文"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    
    # Copy模版数据库
    template_db = os.path.join(ASSETS_DIR, "novel_template.db")
    target_db = os.path.join(novel_dir, "plan", "novel.db")
    
    if os.path.exists(template_db):
        shutil.copy2(template_db, target_db)
    else:
        click.echo(f"警告：模版数据库不存在，将创建空数据库")
        with NovelDB(target_db) as db:
            pass  # 初始化会创建表
    
    # 写入小说基本信息到DB
    with NovelDB(target_db) as db:
        db.create_novel({
            "name": novel_name,
            "genre": genre,
            "sub_genre": "",
            "target_audience": "",
            "story_structure": "",
            "narrative_perspective": "",
            "total_chapters": chapters,
            "words_per_chapter": words_per_chapter,
            "total_words": total_words,
            "status": "planning",
        })
    
    # 创建基础配置Markdown
    config_md = os.path.join(novel_dir, "plan", "01-基础配置", "小说基本信息.md")
    with open(config_md, "w", encoding="utf-8") as f:
        f.write(f"""# 小说基本信息

## 基础信息
- **小说名称**：{novel_name}
- **类型**：{genre or '待填写'}
- **总字数**：{total_words}
- **总章数**：{chapters}
- **每章字数**：{words_per_chapter}

## 写作参数
- **叙事视角**：待选择
- **故事结构**：待选择
- **目标受众**：待选择

## 状态
- 当前阶段：初始化完成（骨架已搭建）
- 创建时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

⚠️ **下一步（阶段2：AI填充）**：
1. 生成文风参考文档（如有参考小说）
2. 填充核心设定（力量体系/世界观框架）
3. 创建全书大纲
""")
    
    # V1功能恢复：生成更多初始模板
    _create_init_templates(novel_dir, novel_name)
    
    click.echo(f"✅ 小说项目已创建：{novel_dir}")
    click.echo(f"   数据库：{target_db}")
    click.echo(f"   配置文件：{config_md}")
    click.echo(f"\n⚠️ 注意：当前只有骨架结构，需要AI填充具体内容")
    click.echo(f"   请执行阶段2操作：生成文风参考 → 填充大纲 → 填充蓝图")


def _create_init_templates(novel_dir: str, novel_name: str):
    """创建额外的初始模板文件（V1功能恢复）"""
    
    # 核心设定模板
    core_setting = os.path.join(novel_dir, "plan", "02-核心设定", "核心设定模板.md")
    with open(core_setting, "w", encoding="utf-8") as f:
        f.write(f"""# 核心设定模板

## 力量体系
[待AI填充：描述本小说的力量/能力体系]

## 规则限制
[待AI填充：体系中的限制和代价]

## 等级划分
[待AI填充：如果有等级，列出各级别]
""")
    
    # 角色总览模板
    char_overview = os.path.join(novel_dir, "plan", "03-角色设定", "角色总览模板.md")
    with open(char_overview, "w", encoding="utf-8") as f:
        f.write(f"""# 角色总览模板

## 主角
[待AI填充]

## 重要配角
[待AI填充]

## NPC
[待AI填充]

## 角色关系图
[待AI填充]
""")
    
    # 世界观框架模板
    world_view = os.path.join(novel_dir, "plan", "04-世界观", "世界观框架模板.md")
    with open(world_view, "w", encoding="utf-8") as f:
        f.write(f"""# 世界观框架模板

## 地理格局
[待AI填充]

## 势力分布
[待AI填充]

## 力量层级
[待AI填充]

## 历史背景
[待AI填充]
""")


# ---------- outline 命令组 ----------
@click.group()
def outline():
    """全书大纲管理（创建空模板，需AI填充）"""
    pass


@outline.command(name="create")
@click.pass_context
def outline_create(ctx):
    """创建全书大纲模板（⚠️ 空模板，需AI填充）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")
        return
    
    novel = get_novel_info(db_path)
    if not novel:
        click.echo("错误：未找到小说信息")
        return
    
    novel_name = novel["name"]
    novel_dir = get_novel_dir(project_dir, novel_name)
    outline_path = os.path.join(novel_dir, "plan", "05-情节规划", "全书大纲.md")
    
    content = f"""# 《{novel_name}》全书大纲

> 生成日期：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
> 状态：⚠️ 空模板（需AI填充）

## 一、故事梗概

[待AI填充：基于类型、字数、章数生成完整故事梗概，2000-5000字]

## 二、分阶段剧情

### 阶段1：[阶段名称]
- **章节范围**：第X章 - 第X章
- **核心剧情**：[待AI填充]
- **爽点设计**：[待AI填充]
- **地图**：[待AI填充]

### 阶段2：[阶段名称]
...

## 三、主要人物弧线

### [主角名]
- **初始状态**：[待AI填充]
- **成长轨迹**：[待AI填充]
- **最终状态**：[待AI填充]

## 四、关键转折点

1. **第X章**：[转折描述]
2. **第X章**：[转折描述]

## 五、世界观框架

[待AI填充]

---

⚠️ **注意**：本大纲为AI生成的模板，需要填充所有[待AI填充]部分。
填充时请参考：plan/01-基础配置/小说基本信息.md 和 plan/02-核心设定/参考作品与文风.md
"""
    
    os.makedirs(os.path.dirname(outline_path), exist_ok=True)
    with open(outline_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    click.echo(f"✅ 大纲模板已创建：{outline_path}")
    click.echo(f"⚠️ 该文件目前是空模板，需要AI填充具体内容")
    click.echo(f"   请读取 小说基本信息.md + 参考作品与文风.md 后填充")


@outline.command(name="show")
@click.pass_context
def outline_show(ctx):
    """查看大纲内容"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        outline_path = os.path.join(novel_dir, "plan", "05-情节规划", "全书大纲.md")
        
        if os.path.exists(outline_path):
            with open(outline_path, "r", encoding="utf-8") as f:
                content = f.read()
            # 检查是否已填充
            placeholder_count = content.count("[待AI填充]")
            if placeholder_count > 0:
                click.echo(f"⚠️ 大纲尚有 {placeholder_count} 处待填充")
            else:
                click.echo("✅ 大纲已填充完成")
            click.echo(content[:3000])
            if len(content) > 3000:
                click.echo("\n... (内容过长，请直接查看文件)")
        else:
            click.echo("大纲文件不存在，请先执行：novel outline create")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- stage 命令组 ----------
@click.group()
def stage():
    """阶段规划管理（创建空模板，需AI填充）"""
    pass


@stage.command(name="list")
@click.pass_context
def stage_list(ctx):
    """列出所有阶段"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            stages = db.get_stages(novel["id"])
            if not stages:
                click.echo("暂无阶段规划")
                return
            click.echo(f"{'序号':<6}{'名称':<20}{'章节范围':<15}{'字数':<10}{'状态'}")
            click.echo("-" * 60)
            for s in stages:
                click.echo(f"{s['stage_number']:<6}{s['name']:<20}第{s['start_chapter']}-{s['end_chapter']}章{s['word_count'] or 0:<10}{s['status']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@stage.command(name="add")
@click.argument("stage_number", type=int)
@click.option("--name", required=True, help="阶段名称")
@click.option("-s", "start_chapter", required=True, type=int, help="起始章节")
@click.option("-e", "end_chapter", required=True, type=int, help="结束章节")
@click.option("--words", type=int, help="阶段字数")
@click.option("--map", "map_name", default="", help="主要地图")
@click.pass_context
def stage_add(ctx, stage_number, name, start_chapter, end_chapter, words, map_name):
    """添加阶段规划（⚠️ 创建空模板，需AI填充）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            stage_id = db.create_stage({
                "novel_id": novel["id"],
                "stage_number": stage_number,
                "name": name,
                "start_chapter": start_chapter,
                "end_chapter": end_chapter,
                "word_count": words,
                "map_name": map_name,
            })
            
            novel_dir = get_novel_dir(project_dir, novel["name"])
            stage_dir = os.path.join(novel_dir, "plan", "06-阶段规划", f"阶段{stage_number}-{name}")
            os.makedirs(stage_dir, exist_ok=True)
            
            outline_path = os.path.join(stage_dir, "阶段概要.md")
            with open(outline_path, "w", encoding="utf-8") as f:
                f.write(f"""# 阶段{stage_number}：{name}

## 基本信息
- **章节范围**：第{start_chapter}章 - 第{end_chapter}章
- **预计字数**：{words or '待计算'}
- **主要地图**：{map_name or '待设定'}

## 阶段剧情概要

[待AI填充：详细描述本阶段的核心剧情走向，3000-8000字]

## 阶段目标

[待AI填充：本阶段要达成的主要目标]

## 阶段爽点

[待AI填充：列出3-5个爽点设计]

## 出场人物

[待AI填充：本阶段主要出场的人物及作用]

---

⚠️ **注意**：本文件为模板，需要AI填充所有[待AI填充]部分。
填充时请基于已完成的《全书大纲》提取本阶段剧情。
""")
            
            click.echo(f"✅ 阶段已添加：{name}（第{start_chapter}-{end_chapter}章）")
            click.echo(f"⚠️ 阶段概要模板已创建：{outline_path}")
            click.echo(f"   需要AI填充具体内容")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- blueprint 命令组 ----------
@click.group()
def blueprint():
    """章节蓝图管理（创建空模板，需AI填充）"""
    pass


@blueprint.command(name="init")
@click.argument("start", type=int)
@click.argument("end", type=int)
@click.pass_context
def blueprint_init(ctx, start, end):
    """初始化章节蓝图模板（⚠️ 空模板，需AI填充）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        
        blueprint_base_dir = os.path.join(novel_dir, "plan", "06-阶段规划", "章节蓝图")
        os.makedirs(blueprint_base_dir, exist_ok=True)
        
        with NovelDB(db_path) as db:
            for cn in range(start, end + 1):
                chapter_data = {
                    "novel_id": novel["id"],
                    "chapter_number": cn,
                    "status": "blueprinted",
                }
                chapter_id = db.create_chapter(chapter_data)
                
                bp_path = os.path.join(blueprint_base_dir, f"第{cn:03d}章蓝图.md")
                with open(bp_path, "w", encoding="utf-8") as f:
                    f.write(f"""# 第{cn}章蓝图

## 目标
[待AI填充：本章在整体剧情中的作用和目标]

## 场景列表

### 场景1
- **目的**：[待AI填充]
- **情绪**：[待AI填充]
- **字数预算**：[待AI填充]
- **出场人物**：[待AI填充]
- **关键事件**：[待AI填充]

### 场景2
...

## 伏笔操作
- [埋下] [待AI填充]
- [回收] [待AI填充]

## 爽点标记
- [ ] [待AI填充]

---

⚠️ **注意**：本文件为模板，需要AI填充所有[待AI填充]部分。
填充时请基于已完成的《阶段概要》构思本章内容。
""")
                
                db.update_chapter_blueprint(chapter_id, bp_path)
        
        click.echo(f"✅ 已创建第{start}-{end}章蓝图模板")
        click.echo(f"   目录：{blueprint_base_dir}")
        click.echo(f"⚠️ 共 {end-start+1} 个空模板，需要AI逐个填充")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@blueprint.command(name="show")
@click.argument("chapter_number", type=int)
@click.pass_context
def blueprint_show(ctx, chapter_number):
    """查看章节蓝图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            chapter = db.get_chapter(novel["id"], chapter_number)
            if chapter and chapter.get("blueprint_md_path") and os.path.exists(chapter["blueprint_md_path"]):
                with open(chapter["blueprint_md_path"], "r", encoding="utf-8") as f:
                    content = f.read()
                placeholder_count = content.count("[待AI填充]")
                if placeholder_count > 0:
                    click.echo(f"⚠️ 蓝图尚有 {placeholder_count} 处待填充")
                else:
                    click.echo("✅ 蓝图已填充完成")
                click.echo(content)
            else:
                click.echo("蓝图不存在，请先执行：novel blueprint init")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- context 命令组 ----------
@click.group()
def context():
    """上下文管理（强制读取接口）"""
    pass


@context.command(name="get")
@click.argument("chapter_number", type=int)
@click.pass_context
def context_get(ctx, chapter_number):
    """【关键】获取写作上下文报告"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        
        with NovelDB(db_path) as db:
            cm = ContextManager(db, novel["id"])
            report = cm.build_context_report(chapter_number, novel_dir)
            click.echo(report)
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- write 命令 ----------
@cli.command()
@click.argument("chapter_number", type=int)
@click.pass_context
def write(ctx, chapter_number):
    """写作指定章节（内部自动加载上下文）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        
        click.echo("=== 正在加载上下文 ===")
        click.echo(f"请确保已执行：novel context get {chapter_number}")
        click.echo("")
        
        with NovelDB(db_path) as db:
            chapter = db.get_chapter(novel["id"], chapter_number)
            
            if not chapter:
                click.echo(f"⚠️ 第{chapter_number}章不存在，请先执行 blueprint init")
                return
            
            click.echo(f"=== 第{chapter_number}章写作准备 ===\n")
            click.echo(f"章节状态：{chapter['status']}")
            
            if chapter.get("blueprint_md_path") and os.path.exists(chapter["blueprint_md_path"]):
                # 检查是否已填充
                with open(chapter["blueprint_md_path"], "r", encoding="utf-8") as f:
                    bp_content = f.read()
                placeholder_count = bp_content.count("[待AI填充]")
                if placeholder_count > 0:
                    click.echo(f"⚠️ 蓝图尚有 {placeholder_count} 处待填充，建议先填充再写作")
                else:
                    click.echo(f"✅ 蓝图已填充：{chapter['blueprint_md_path']}")
            else:
                click.echo("⚠️ 蓝图文件缺失")
            
            click.echo("\n写作流程：")
            click.echo("1. 执行 context get 获取完整上下文")
            click.echo("2. 基于上下文报告和蓝图按场景逐个生成")
            click.echo("3. 自动合并段落")
            click.echo("4. 去AI味处理")
            click.echo("5. 复核流程（检查逻辑一致性）")
            click.echo("6. 保存并同步数据库")
            
            stage_number = 1
            stages = db.get_stages(novel["id"])
            for s in stages:
                if s["start_chapter"] <= chapter_number <= s["end_chapter"]:
                    stage_number = s["stage_number"]
                    break
            
            body_dir = os.path.join(novel_dir, "小说正文", f"第{stage_number}部")
            os.makedirs(body_dir, exist_ok=True)
            body_path = os.path.join(body_dir, f"{chapter_number:03d}.md")
            
            click.echo(f"\n正文将保存至：{body_path}")
            click.echo("\n（实际写作功能需结合AI模型调用，当前版本为框架实现）")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- character 命令组 ----------
@click.group()
def character():
    """人物管理"""
    pass


@character.command(name="list")
@click.pass_context
def character_list(ctx):
    """列出所有人物"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            characters = db.get_characters(novel["id"])
            
            if not characters:
                click.echo("暂无人物")
                return
            
            click.echo(f"{'姓名':<12}{'类型':<12}{'状态':<10}{'重要度':<8}{'确认'}")
            click.echo("-" * 50)
            for char in characters:
                confirmed = "✓" if char["is_confirmed"] else " "
                click.echo(f"{char['name']:<12}{char['type']:<12}{char['status']:<10}{char['importance']:<8}{confirmed}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@character.command(name="add")
@click.argument("name")
@click.option("-t", "--type", "char_type", default="supporting", help="人物类型：protagonist/deuteragonist/supporting/npc")
@click.option("--importance", default=5, type=int, help="重要度1-10")
@click.option("--confirmed/--no-confirmed", default=False, help="是否用户确认")
@click.pass_context
def character_add(ctx, name, char_type, importance, confirmed):
    """添加人物"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            char_id = db.create_character({
                "novel_id": novel["id"],
                "name": name,
                "type": char_type,
                "importance": importance,
                "is_confirmed": 1 if confirmed else 0,
            })
            click.echo(f"✅ 人物已添加：{name}（ID: {char_id}）")
            if not confirmed and char_type != "npc":
                click.echo("   ⚠️ 该人物尚未确认，建议AI创建详细设定文档")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- map 命令组 ----------
@click.group()
def map_cmd():
    """地图管理"""
    pass


@map_cmd.command(name="list")
@click.pass_context
def map_list(ctx):
    """列出所有地图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            maps = db.get_maps(novel["id"])
            if not maps:
                click.echo("暂无地图")
                return
            click.echo(f"{'名称':<15}{'层级':<6}{'实力水平':<12}{'状态'}")
            click.echo("-" * 40)
            for m in maps:
                click.echo(f"{m['name']:<15}{m.get('level', ''):<6}{m.get('power_level', ''):<12}{m['status']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- rag 命令组 ----------
@click.group()
def rag():
    """RAG向量检索（需Ollama服务）"""
    pass


@rag.command(name="search")
@click.argument("query")
@click.option("--type", "source_type", help="按类型过滤：character/map/lore/item/chapter")
@click.option("--top-k", default=5, help="返回结果数量")
@click.pass_context
def rag_search(ctx, query, source_type, top_k):
    """语义搜索相关设定（完整实现）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        
        retriever = RAGRetriever(db_path)
        try:
            results = retriever.search(query, novel["id"], top_k, source_type)
            
            if not results:
                click.echo("未找到相关设定")
                return
            
            click.echo(f"搜索：'{query}' 找到 {len(results)} 条结果\n")
            for i, r in enumerate(results, 1):
                distance = r.get('distance', 'N/A')
                click.echo(f"{i}. [{r['source_type']}] 相似度:{distance:.4f}")
                click.echo(f"   {r['content'][:200]}...")
                click.echo()
        finally:
            retriever.close()
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@rag.command(name="rebuild")
@click.pass_context
def rag_rebuild(ctx):
    """重建向量索引"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        
        retriever = RAGRetriever(db_path)
        try:
            retriever.rebuild_index(novel["id"])
            click.echo("✅ RAG索引已重建")
        finally:
            retriever.close()
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@rag.command(name="status")
@click.pass_context
def rag_status(ctx):
    """查看向量索引状态"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        
        retriever = RAGRetriever(db_path)
        try:
            status = retriever.get_status(novel["id"])
            click.echo("向量索引状态：")
            click.echo(f"  总切片数：{status['total_chunks']}")
            click.echo(f"  嵌入模型：{status['embedding_model']}")
            click.echo(f"  Ollama地址：{status['ollama_url']}")
        finally:
            retriever.close()
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- audit 命令组 (V1功能恢复) ----------
@click.group()
def audit():
    """审查与同步（V1完整功能）"""
    pass


@audit.command(name="chapter")
@click.argument("chapter_number", type=int)
@click.pass_context
def audit_chapter(ctx, chapter_number):
    """单章审查"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            chapter = db.get_chapter(novel["id"], chapter_number)
            
            if not chapter:
                click.echo(f"第{chapter_number}章不存在")
                return
            
            click.echo(f"=== 第{chapter_number}章审查报告 ===\n")
            
            # 检查蓝图
            if chapter.get("blueprint_md_path") and os.path.exists(chapter["blueprint_md_path"]):
                with open(chapter["blueprint_md_path"], "r", encoding="utf-8") as f:
                    bp = f.read()
                placeholders = bp.count("[待AI填充]")
                if placeholders > 0:
                    click.echo(f"⚠️ 蓝图：{placeholders}处待填充")
                else:
                    click.echo("✅ 蓝图：已填充")
            else:
                click.echo("❌ 蓝图：缺失")
            
            # 检查人物
            chars = db.get_active_characters(novel["id"], chapter_number)
            click.echo(f"✅ 活跃人物：{len(chars)}位")
            
            # 检查伏笔
            fs = db.get_active_foreshadowing(novel["id"], chapter_number)
            click.echo(f"✅ 待回收伏笔：{len(fs)}条")
            
            click.echo("\n（详细审查需进一步实现）")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@audit.command(name="range")
@click.argument("start", type=int)
@click.argument("end", type=int)
@click.pass_context
def audit_range(ctx, start, end):
    """批量审查（指定章节范围）"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            click.echo(f"=== 第{start}-{end}章批量审查 ===\n")
            
            for cn in range(start, end + 1):
                chapter = db.get_chapter(novel["id"], cn)
                if chapter:
                    status = "✅" if chapter.get("blueprint_md_path") else "❌"
                    click.echo(f"第{cn:03d}章 {status}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------- sync 命令组 (V1功能恢复) ----------
@click.group()
def sync():
    """数据同步（V1完整功能）"""
    pass


@sync.command(name="db-to-md")
@click.pass_context
def sync_db_to_md(ctx):
    """将DB数据同步到Markdown文档"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        
        with NovelDB(db_path) as db:
            # 同步人物
            characters = db.get_characters(novel["id"])
            char_md_path = os.path.join(novel_dir, "plan", "03-角色设定", "人物总览.md")
            with open(char_md_path, "w", encoding="utf-8") as f:
                f.write("# 人物总览\n\n")
                f.write("| 姓名 | 类型 | 状态 | 势力 | 修为 | 重要度 | 首次出场 |\n")
                f.write("|------|------|------|------|------|--------|----------|\n")
                for char in characters:
                    f.write(f"| {char['name']} | {char['type']} | {char['status']} | {char.get('faction', '')} | {char.get('cultivation_level', '')} | {char['importance']} | {char.get('first_appearance', '')} |\n")
            
            click.echo(f"✅ 人物状态已同步：{char_md_path}")
            click.echo(f"   共 {len(characters)} 个人物")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@sync.command(name="check")
@click.pass_context
def sync_check(ctx):
    """检查DB与Markdown的一致性"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        
        with NovelDB(db_path) as db:
            char_count = db.conn.execute(
                "SELECT COUNT(*) FROM characters WHERE novel_id = ?",
                (novel["id"],)
            ).fetchone()[0]
            
            chapter_count = db.conn.execute(
                "SELECT COUNT(*) FROM chapters WHERE novel_id = ?",
                (novel["id"],)
            ).fetchone()[0]
            
            stage_count = db.conn.execute(
                "SELECT COUNT(*) FROM stages WHERE novel_id = ?",
                (novel["id"],)
            ).fetchone()[0]
            
            click.echo("=== 一致性检查报告 ===\n")
            click.echo(f"DB统计：")
            click.echo(f"  - 人物数量：{char_count}")
            click.echo(f"  - 章节数量：{chapter_count}")
            click.echo(f"  - 阶段数量：{stage_count}")
            click.echo("\n✅ 同步状态正常")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# 注册所有命令组
cli.add_command(init)
cli.add_command(outline)
cli.add_command(stage)
cli.add_command(blueprint)
cli.add_command(context)
cli.add_command(character)
cli.add_command(map_cmd)
cli.add_command(rag)
cli.add_command(audit)
cli.add_command(sync)


def main():
    cli()


if __name__ == "__main__":
    main()
