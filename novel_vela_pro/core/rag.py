"""
RAG 向量检索模块
基于 sqlite-vec + Ollama 实现语义搜索
"""
import sqlite3
import struct
import logging
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)


class RAGRetriever:
    """RAG 向量检索器"""

    def __init__(self, db_path: str, ollama_url: str = "http://127.0.0.1:11434",
                 model: str = "nomic-embed-text"):
        self.db_path = db_path
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model
        self._has_sqlite_vec = False
        self._init_vector_db()

    def _init_vector_db(self):
        """初始化向量数据库"""
        try:
            import sqlite_vec
            self.db = sqlite3.connect(self.db_path)
            self.db.enable_load_extension(True)
            sqlite_vec.load(self.db)
            self.db.enable_load_extension(False)
            self._has_sqlite_vec = True

            self.db.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
                    embedding float[768],
                    content_id INTEGER,
                    source_type TEXT,
                    chunk_index INTEGER
                )
            """)

            self.db.execute("""
                CREATE TABLE IF NOT EXISTS rag_chunks (
                    id INTEGER PRIMARY KEY,
                    novel_id INTEGER,
                    content TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id INTEGER,
                    chunk_index INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            self.db.commit()
            logger.info("sqlite-vec 扩展加载成功")
        except ImportError:
            logger.warning("sqlite-vec 未安装，回退到纯文本存储模式")
            self.db = sqlite3.connect(self.db_path)
            self.db.execute("""
                CREATE TABLE IF NOT EXISTS rag_chunks (
                    id INTEGER PRIMARY KEY,
                    novel_id INTEGER,
                    content TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id INTEGER,
                    chunk_index INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            self.db.commit()

    def get_embedding(self, text: str) -> List[float]:
        """获取文本的向量嵌入"""
        try:
            import requests
            response = requests.post(
                f"{self.ollama_url}/api/embed",
                json={"model": self.model, "input": text},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            if "embeddings" in data and len(data["embeddings"]) > 0:
                return data["embeddings"][0]
            raise ValueError(f"Unexpected response format: {data}")
        except ImportError:
            raise RuntimeError("requests 库未安装，无法调用 Ollama API")
        except requests.exceptions.ConnectionError:
            raise RuntimeError(f"无法连接到 Ollama 服务 ({self.ollama_url})，请确认服务已启动")
        except requests.exceptions.Timeout:
            raise RuntimeError("Ollama API 请求超时")
        except Exception as e:
            raise RuntimeError(f"获取嵌入向量失败: {e}")

    def add_chunk(self, content: str, source_type: str, source_id: int,
                  novel_id: int, chunk_index: int = 0,
                  embedding: Optional[List[float]] = None) -> int:
        """添加向量切片"""
        cursor = self.db.execute(
            "INSERT INTO rag_chunks (novel_id, content, source_type, source_id, chunk_index) VALUES (?, ?, ?, ?, ?)",
            (novel_id, content, source_type, source_id, chunk_index)
        )
        content_id = cursor.lastrowid

        if self._has_sqlite_vec:
            try:
                if embedding is None:
                    embedding = self.get_embedding(content)
                serialized = struct.pack(f"{len(embedding)}f", *embedding)
                self.db.execute(
                    "INSERT INTO vec_chunks(rowid, embedding, content_id, source_type, chunk_index) VALUES (?, ?, ?, ?, ?)",
                    (content_id, serialized, content_id, source_type, chunk_index)
                )
            except RuntimeError as e:
                logger.warning(f"向量索引跳过（Ollama不可用）: {e}")
            except Exception as e:
                logger.warning(f"向量索引失败: {e}")

        self.db.commit()
        return content_id

    def search(self, query_text: str, top_k: int = 5,
               novel_id: Optional[int] = None,
               source_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """语义搜索（向量匹配失败时回退到文本搜索）"""
        if self._has_sqlite_vec:
            try:
                query_embedding = self.get_embedding(query_text)
                serialized_query = struct.pack(f"{len(query_embedding)}f", *query_embedding)

                sql = """
                    SELECT c.id, c.content, c.source_type, c.source_id, c.novel_id, v.distance
                    FROM rag_chunks AS c
                    INNER JOIN vec_chunks AS v ON c.id = v.content_id
                    WHERE v.embedding MATCH ? AND v.k = ?
                """
                params = [serialized_query, top_k]

                if novel_id is not None:
                    sql += " AND c.novel_id = ?"
                    params.append(novel_id)

                if source_type is not None:
                    sql += " AND c.source_type = ?"
                    params.append(source_type)

                sql += " ORDER BY v.distance ASC"

                results = self.db.execute(sql, params).fetchall()
                return [
                    {"id": r[0], "content": r[1], "source_type": r[2],
                     "source_id": r[3], "novel_id": r[4], "distance": r[5]}
                    for r in results
                ]
            except RuntimeError as e:
                logger.warning(f"向量搜索失败，回退到文本搜索: {e}")
            except Exception as e:
                logger.warning(f"向量搜索异常: {e}")

        # 回退到文本搜索
        return self._fallback_text_search(query_text, top_k, novel_id, source_type)

    def _fallback_text_search(self, query_text: str, top_k: int = 5,
                              novel_id: Optional[int] = None,
                              source_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """文本搜索回退（当向量搜索不可用时）"""
        try:
            sql = "SELECT id, content, source_type, source_id, novel_id FROM rag_chunks WHERE content LIKE ?"
            params = [f"%{query_text}%"]

            if novel_id is not None:
                sql += " AND novel_id = ?"
                params.append(novel_id)

            if source_type is not None:
                sql += " AND source_type = ?"
                params.append(source_type)

            sql += " LIMIT ?"
            params.append(top_k)

            results = self.db.execute(sql, params).fetchall()
            return [
                {"id": r[0], "content": r[1], "source_type": r[2],
                 "source_id": r[3], "novel_id": r[4], "distance": 0.0}
                for r in results
            ]
        except Exception as e:
            logger.error(f"文本搜索回退也失败: {e}")
            return []

    def rebuild_index(self, novel_id: Optional[int] = None):
        """重建向量索引"""
        try:
            if self._has_sqlite_vec and novel_id is not None:
                self.db.execute(
                    "DELETE FROM vec_chunks WHERE content_id IN (SELECT id FROM rag_chunks WHERE novel_id = ?)",
                    (novel_id,)
                )
                self.db.execute("DELETE FROM rag_chunks WHERE novel_id = ?", (novel_id,))
            elif self._has_sqlite_vec:
                self.db.execute("DELETE FROM vec_chunks")
                self.db.execute("DELETE FROM rag_chunks")
            else:
                self.db.execute("DELETE FROM rag_chunks")
            self.db.commit()
            logger.info(f"向量索引已重建 (novel_id={novel_id})")
        except Exception as e:
            logger.error(f"重建索引失败: {e}")

    def get_status(self, novel_id: Optional[int] = None) -> Dict[str, Any]:
        """获取索引状态"""
        try:
            if novel_id is not None:
                count = self.db.execute(
                    "SELECT COUNT(*) FROM rag_chunks WHERE novel_id = ?", (novel_id,)
                ).fetchone()[0]
            else:
                count = self.db.execute("SELECT COUNT(*) FROM rag_chunks").fetchone()[0]
            return {
                "total_chunks": count,
                "model": self.model,
                "ollama_url": self.ollama_url,
                "sqlite_vec": self._has_sqlite_vec
            }
        except Exception as e:
            logger.error(f"获取索引状态失败: {e}")
            return {"total_chunks": 0, "model": self.model, "ollama_url": self.ollama_url, "sqlite_vec": self._has_sqlite_vec}

    def close(self):
        if hasattr(self, "db") and self.db:
            try:
                self.db.close()
            except Exception as e:
                logger.warning(f"关闭数据库连接失败: {e}")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
