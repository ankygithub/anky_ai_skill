"""文本预处理模块：编码检测、清洗、章节切分"""

import re
import logging
from pathlib import Path
from typing import Optional

import chardet

from .models.book import Book
from .models.chapter import Chapter, ChapterType

logger = logging.getLogger(__name__)

# 广告/水印/作者话 常见模式，按行整体匹配
AD_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"^求.*?(推荐票|月票|订阅|收藏|打赏)",
        r"^本章未完",
        r"^手机用户请访问",
        r"^更多精彩.*?请访问",
        r"^(微信|微博|QQ|公众号).*?(关注|搜索|扫码)",
        r"^作者的话\s*[:：]?",
        r"^【作者的话】",
        r"^(PS|ps|P\.S\.)\s*[:：]?",
        r"^=+\s*分割线\s*=+",
        r"^—+\s*—+",
        r"^【.*?卷】(完|终)?$",  # 单独成行的卷标记，不作为章节
        r"^\d{4}年\d{1,2}月\d{1,2}日",  # 日期行
    ]
]

# 章节标题正则，按优先级排序（高→低）
CHAPTER_HEADER_PATTERNS = [
    # 第X章 / 第X节 — 中文数字或阿拉伯数字
    re.compile(
        r"^(第[一二三四五六七八九十百千零〇\d]+[章节回])"
        r"(?:[\s\.·．:：]?\s*(.+))?$"
    ),
    # Chapter X / CHAPTER X
    re.compile(
        r"^(?:Chapter|CHAPTER)\s+(\d+)"
        r"(?:[\s\.·．:：]?\s*(.+))?$"
    ),
    # 中文序号 + 、（如 一、二、三、）
    re.compile(
        r"^([一二三四五六七八九十百千]+)[、．.]\s*(.+)?$"
    ),
    # 【XX卷】带内容
    re.compile(
        r"^【(.+?)卷】(?:[\s\.·．:：]?\s*(.+))?$"
    ),
    # 第X回（传统章回体）
    re.compile(
        r"^(第[一二三四五六七八九十百千零〇\d]+回)"
        r"(?:[\s\.·．:：]?\s*(.+))?$"
    ),
]


class TextPreprocessor:
    """网文文本预处理器"""

    def __init__(self):
        self._ad_patterns = AD_PATTERNS
        self._chapter_patterns = CHAPTER_HEADER_PATTERNS

    def load(self, file_path: Path) -> Book:
        """加载单个txt文件，返回Book对象"""
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        encoding = self._detect_encoding(file_path)
        raw_text = self._read_file(file_path, encoding)

        book = Book(
            file_path=file_path,
            encoding=encoding,
            raw_text=raw_text,
        )
        self._extract_title(book)
        book.chapters = self._split_chapters(raw_text)
        book.total_chars = sum(c.char_count for c in book.chapters)

        logger.info(f"加载完成: {file_path.name}, 编码={encoding}, "
                     f"章节数={book.chapter_count}, 总字数={book.total_chars}")
        return book

    def load_directory(self, dir_path: Path) -> list[Book]:
        """加载目录下所有txt文件"""
        if not dir_path.is_dir():
            raise NotADirectoryError(f"目录不存在: {dir_path}")

        txt_files = sorted(dir_path.glob("*.txt"))
        if not txt_files:
            logger.warning(f"目录中无txt文件: {dir_path}")
            return []

        books = []
        for fp in txt_files:
            try:
                books.append(self.load(fp))
            except Exception as e:
                logger.error(f"加载失败 {fp.name}: {e}")
                continue

        logger.info(f"目录加载完成: {dir_path}, 成功={len(books)}/{len(txt_files)}")
        return books

    def _detect_encoding(self, file_path: Path) -> str:
        """用chardet检测文件编码，置信度不足时降级到utf-8"""
        raw_bytes = file_path.read_bytes()
        result = chardet.detect(raw_bytes)
        encoding = result["encoding"] or "utf-8"
        confidence = result.get("confidence", 0)

        if confidence < 0.5:
            logger.warning(f"{file_path.name} 编码检测置信度低({confidence:.2f}), 使用utf-8")
            return "utf-8"

        # 统一编码别名
        alias_map = {
            "gb2312": "gbk",
            "gb18030": "gbk",
        }
        return alias_map.get(encoding.lower(), encoding.lower())

    @staticmethod
    def _read_file(file_path: Path, encoding: str) -> str:
        """按指定编码读取文件，失败时尝试备用编码"""
        try:
            return file_path.read_text(encoding=encoding)
        except (UnicodeDecodeError, LookupError):
            for fallback in ("utf-8", "gbk", "latin-1"):
                try:
                    text = file_path.read_text(encoding=fallback)
                    logger.warning(f"{file_path.name} 用{encoding}读取失败，回退到{fallback}")
                    return text
                except UnicodeDecodeError:
                    continue
            raise UnicodeDecodeError(f"{file_path.name} 所有编码均无法解码")

    def _clean_line(self, line: str) -> bool:
        """判断一行是否为广告/水印/噪音，返回True表示应删除"""
        stripped = line.strip()
        if not stripped:
            return True
        for pattern in self._ad_patterns:
            if pattern.match(stripped):
                return True
        return False

    def _clean_text(self, raw: str) -> str:
        """逐行清洗文本，移除广告和噪音行"""
        lines = raw.split("\n")
        cleaned = [line for line in lines if not self._clean_line(line)]
        return "\n".join(cleaned).strip()

    def _match_chapter_header(self, line: str) -> Optional[tuple[str, str]]:
        """
        匹配章节标题行。
        返回 (full_match, subtitle) 或 None。
        full_match 是完整标题行（含前缀），subtitle 是冒号后的副标题部分。
        """
        stripped = line.strip()
        for pattern in self._chapter_patterns:
            m = pattern.match(stripped)
            if m:
                full = m.group(0)
                subtitle = (m.group(2) or "").strip()
                return full, subtitle
        return None

    def _split_chapters(self, raw_text: str) -> list[Chapter]:
        """
        将清洗后的正文按章节标题切分为Chapter列表。
        核心逻辑：先清洗 → 找出所有章节头位置 → 按位置切片。
        """
        cleaned = self._clean_text(raw_text)
        lines = cleaned.split("\n")

        # 收集 (line_index, title_str)
        headers: list[tuple[int, str]] = []
        for i, line in enumerate(lines):
            result = self._match_chapter_header(line)
            if result:
                full, subtitle = result
                title = full
                headers.append((i, title))

        if not headers:
            # 无章节标记时将全文作为单章
            content = cleaned
            return [Chapter(
                index=0,
                title="(未识别章节)",
                content=content,
                char_count=len(content),
            )]

        chapters: list[Chapter] = []
        for idx, (start_line, title) in enumerate(headers):
            end_line = headers[idx + 1][0] if idx + 1 < len(headers) else len(lines)
            chunk_lines = lines[start_line + 1:end_line]
            content = "\n".join(chunk_lines).strip()

            chapters.append(Chapter(
                index=idx,
                title=title,
                content=content,
                char_count=len(content),
            ))

        return chapters

    def _extract_title(self, book: Book):
        """
        从文件名或正文首行提取书名。
        策略：若首行非章节头且像书名则采用，否则回退到文件名（去扩展名）。
        """
        name_stem = book.file_path.stem

        lines = book.raw_text.split("\n")
        first_meaningful = ""
        first_line_is_chapter = False

        for line in lines:
            s = line.strip()
            if not s:
                continue
            if self._match_chapter_header(s):
                first_line_is_chapter = True
                continue
            if len(s) <= 50:
                first_meaningful = s
            break

        # 文件以章节头开头 → 没有独立书名行，使用文件名
        if first_line_is_chapter or not first_meaningful or len(first_meaningful) < 2:
            book.title = name_stem
        else:
            book.title = first_meaningful
