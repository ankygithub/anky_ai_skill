"""
数据库核心模块 - SQLite CRUD 操作
基于 novel_vela 重构，支持完整 Schema
"""
import os
import sqlite3
import shutil
from typing import Optional, Dict, List, Any


# 获取模板数据库路径
SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "assets", "templates")


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS novels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    genre TEXT,
    sub_genre TEXT,
    target_audience TEXT,
    story_structure TEXT,
    narrative_perspective TEXT,
    total_chapters INTEGER,
    words_per_chapter INTEGER,
    total_words INTEGER,
    status TEXT DEFAULT 'planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    stage_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    word_count INTEGER,
    start_chapter INTEGER,
    end_chapter INTEGER,
    map_name TEXT,
    status TEXT DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,
    name_pinyin TEXT,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    first_appearance INTEGER,
    last_appearance INTEGER,
    death_chapter INTEGER,
    faction TEXT,
    cultivation_level TEXT,
    importance INTEGER DEFAULT 1,
    is_confirmed BOOLEAN DEFAULT 0,
    md_file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS character_relations (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    character_a_id INTEGER REFERENCES characters(id),
    character_b_id INTEGER REFERENCES characters(id),
    relation_type TEXT NOT NULL,
    description TEXT,
    start_chapter INTEGER,
    end_chapter INTEGER,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS character_appearances (
    id INTEGER PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    chapter_number INTEGER NOT NULL,
    scene_number INTEGER,
    role TEXT,
    action TEXT
);

CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,
    level INTEGER,
    parent_map_id INTEGER REFERENCES maps(id),
    description TEXT,
    entry_condition TEXT,
    power_level TEXT,
    factions TEXT,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    stage_id INTEGER REFERENCES stages(id),
    chapter_number INTEGER NOT NULL,
    title TEXT,
    map_id INTEGER REFERENCES maps(id),
    word_count INTEGER,
    status TEXT DEFAULT 'planned',
    md_file_path TEXT,
    blueprint_md_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapter_scenes (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id),
    scene_number INTEGER NOT NULL,
    title TEXT,
    purpose TEXT,
    mood TEXT,
    word_budget INTEGER,
    characters TEXT,
    key_events TEXT,
    foreshadowing TEXT,
    climax_marker BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS foreshadowing (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    description TEXT NOT NULL,
    plant_chapter INTEGER,
    resolve_chapter INTEGER,
    status TEXT DEFAULT 'planted',
    importance INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    file_path TEXT NOT NULL,
    version_number INTEGER,
    content_hash TEXT,
    change_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER,
    content TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER,
    chunk_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT,
    suggested_fix TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS style_profiles (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER,
    dimension TEXT NOT NULL,
    value TEXT,
    examples TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


class NovelDB:
    """小说数据库操作类"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        if not os.path.exists(db_path):
            self._init_from_template()
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def _init_from_template(self):
        """从模板初始化数据库"""
        template_path = os.path.join(ASSETS_DIR, "novel_template.db")
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        if os.path.exists(template_path):
            shutil.copy2(template_path, self.db_path)
        else:
            conn = sqlite3.connect(self.db_path)
            conn.executescript(SCHEMA_SQL)
            conn.commit()
            conn.close()

    def _insert(self, table: str, row_data: Dict[str, Any]) -> int:
        """通用插入方法"""
        fields = list(row_data.keys())
        placeholders = ["?"] * len(fields)
        sql = f"INSERT INTO {table} ({', '.join(fields)}) VALUES ({', '.join(placeholders)})"
        cursor = self.conn.execute(sql, list(row_data.values()))
        self.conn.commit()
        return cursor.lastrowid

    def _update(self, table: str, record_id: int, data: Dict[str, Any], id_field: str = "id") -> bool:
        """通用更新方法"""
        fields = [f"{k} = ?" for k in data.keys()]
        values = list(data.values()) + [record_id]
        sql = f"UPDATE {table} SET {', '.join(fields)} WHERE {id_field} = ?"
        cursor = self.conn.execute(sql, values)
        self.conn.commit()
        return cursor.rowcount > 0

    # --- novels ---
    def create_novel(self, data: Dict[str, Any]) -> int:
        return self._insert("novels", data)

    def get_novel(self, novel_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM novels WHERE id = ?", (novel_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_novel_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM novels WHERE name = ?", (name,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def update_novel(self, novel_id: int, data: Dict[str, Any]) -> bool:
        return self._update("novels", novel_id, data)

    def list_novels(self) -> List[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM novels WHERE status != 'template' ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

    # --- stages ---
    def create_stage(self, data: Dict[str, Any]) -> int:
        return self._insert("stages", data)

    def get_stage(self, stage_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM stages WHERE id = ?", (stage_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_stages(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM stages WHERE novel_id = ? ORDER BY stage_number",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    def update_stage(self, stage_id: int, data: Dict[str, Any]) -> bool:
        return self._update("stages", stage_id, data)

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

    def get_character_by_id(self, char_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_characters(self, novel_id: int, char_type: Optional[str] = None) -> List[Dict[str, Any]]:
        if char_type:
            cursor = self.conn.execute(
                "SELECT * FROM characters WHERE novel_id = ? AND type = ? ORDER BY importance DESC, name",
                (novel_id, char_type)
            )
        else:
            cursor = self.conn.execute(
                "SELECT * FROM characters WHERE novel_id = ? ORDER BY importance DESC, name",
                (novel_id,)
            )
        return [dict(row) for row in cursor.fetchall()]

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

    def update_character(self, char_id: int, data: Dict[str, Any]) -> bool:
        return self._update("characters", char_id, data)

    def update_character_status(self, character_id: int, status: str) -> bool:
        return self.update_character(character_id, {"status": status})

    def log_appearance(self, character_id: int, chapter_number: int,
                       scene_number: Optional[int] = None,
                       role: Optional[str] = None,
                       action: Optional[str] = None) -> int:
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

    def get_chapters(self, novel_id: int, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            cursor = self.conn.execute(
                "SELECT * FROM chapters WHERE novel_id = ? AND status = ? ORDER BY chapter_number",
                (novel_id, status)
            )
        else:
            cursor = self.conn.execute(
                "SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_number",
                (novel_id,)
            )
        return [dict(row) for row in cursor.fetchall()]

    def update_chapter(self, chapter_id: int, data: Dict[str, Any]) -> bool:
        return self._update("chapters", chapter_id, data)

    def update_chapter_status(self, chapter_id: int, status: str) -> bool:
        return self.update_chapter(chapter_id, {"status": status})

    # --- maps ---
    def create_map(self, data: Dict[str, Any]) -> int:
        return self._insert("maps", data)

    def get_map(self, map_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute("SELECT * FROM maps WHERE id = ?", (map_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_maps(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM maps WHERE novel_id = ? ORDER BY level, name",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    # --- foreshadowing ---
    def create_foreshadowing(self, data: Dict[str, Any]) -> int:
        return self._insert("foreshadowing", data)

    def get_foreshadowing(self, novel_id: int, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            cursor = self.conn.execute(
                "SELECT * FROM foreshadowing WHERE novel_id = ? AND status = ? ORDER BY importance DESC, plant_chapter",
                (novel_id, status)
            )
        else:
            cursor = self.conn.execute(
                "SELECT * FROM foreshadowing WHERE novel_id = ? ORDER BY importance DESC, plant_chapter",
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

    def resolve_foreshadowing(self, fs_id: int, chapter_number: int) -> bool:
        return self._update("foreshadowing", fs_id, {
            "status": "resolved",
            "resolve_chapter": chapter_number
        })

    # --- error_logs ---
    def log_error(self, data: Dict[str, Any]) -> int:
        return self._insert("error_logs", data)

    def get_errors(self, novel_id: int, status: Optional[str] = None,
                   severity: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM error_logs WHERE novel_id = ?"
        params = [novel_id]
        if status:
            sql += " AND status = ?"
            params.append(status)
        if severity:
            sql += " AND severity = ?"
            params.append(severity)
        sql += " ORDER BY created_at DESC"
        cursor = self.conn.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def resolve_error(self, error_id: int) -> bool:
        import datetime
        return self._update("error_logs", error_id, {
            "status": "resolved",
            "resolved_at": datetime.datetime.now().isoformat()
        })

    # --- style_profiles ---
    def set_style_profile(self, data: Dict[str, Any]) -> int:
        """设置或更新风格配置"""
        cursor = self.conn.execute(
            "SELECT id FROM style_profiles WHERE novel_id = ? AND dimension = ?",
            (data.get("novel_id"), data.get("dimension"))
        )
        row = cursor.fetchone()
        if row:
            self._update("style_profiles", row["id"], data)
            return row["id"]
        return self._insert("style_profiles", data)

    def get_style_profiles(self, novel_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT * FROM style_profiles WHERE novel_id = ? ORDER BY dimension",
            (novel_id,)
        )
        return [dict(row) for row in cursor.fetchall()]

    # --- utility ---
    def get_tables(self) -> List[str]:
        cursor = self.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return [row["name"] for row in cursor.fetchall()]

    def execute(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """执行原始SQL查询"""
        cursor = self.conn.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def close(self):
        if self.conn:
            self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
