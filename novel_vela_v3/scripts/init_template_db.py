#!/usr/bin/env python3
"""
初始化模版数据库脚本
运行此脚本生成 assets/templates/novel_template.db
"""
import sqlite3
import os

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "templates")
DB_PATH = os.path.join(TEMPLATE_DIR, "novel_template.db")

SCHEMA_SQL = """
CREATE TABLE novels (
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

CREATE TABLE stages (
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

CREATE TABLE characters (
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

CREATE TABLE character_relations (
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

CREATE TABLE character_appearances (
    id INTEGER PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    chapter_number INTEGER NOT NULL,
    scene_number INTEGER,
    role TEXT,
    action TEXT
);

CREATE TABLE maps (
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

CREATE TABLE chapters (
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

CREATE TABLE chapter_scenes (
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

CREATE TABLE foreshadowing (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    description TEXT NOT NULL,
    plant_chapter INTEGER,
    resolve_chapter INTEGER,
    status TEXT DEFAULT 'planted',
    importance INTEGER DEFAULT 1
);

CREATE TABLE versions (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    file_path TEXT NOT NULL,
    version_number INTEGER,
    content_hash TEXT,
    change_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rag_chunks (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    content TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER,
    chunk_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

ENUM_DATA_SQL = """
INSERT INTO novels (name, genre, sub_genre, target_audience, story_structure, narrative_perspective, total_chapters, words_per_chapter, total_words, status)
VALUES ('__template__', '__template__', '__template__', '__template__', '__template__', '__template__', 0, 0, 0, 'template');
"""

def init_template_db():
    os.makedirs(TEMPLATE_DIR, exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_SQL)
    conn.executescript(ENUM_DATA_SQL)
    conn.commit()
    conn.close()
    print(f"Template DB created at: {DB_PATH}")

if __name__ == "__main__":
    init_template_db()
