"""TextPreprocessor 单元测试"""

import pytest
from pathlib import Path
from unittest.mock import patch

from scripts.text_preprocessor import TextPreprocessor, CHAPTER_HEADER_PATTERNS, AD_PATTERNS


@pytest.fixture
def proc():
    return TextPreprocessor()


@pytest.fixture
def tmp_dir(tmp_path):
    """临时目录，用于生成测试txt文件"""
    return tmp_path


class TestDetectEncoding:
    """编码检测"""

    def test_utf8_file(self, tmp_dir, proc):
        f = tmp_dir / "utf8.txt"
        f.write_text("你好世界", encoding="utf-8")
        enc = proc._detect_encoding(f)
        assert enc == "utf-8"

    def test_gbk_file(self, tmp_dir, proc):
        f = tmp_dir / "gbk.txt"
        long_text = "这是一段足够长的中文内容用于编码检测。" * 20
        f.write_bytes(long_text.encode("gbk"))
        enc = proc._detect_encoding(f)
        assert enc in ("gbk", "gb2312", "gb18030")

    def test_empty_file_fallback(self, tmp_dir, proc):
        f = tmp_dir / "empty.txt"
        f.write_text("", encoding="utf-8")
        enc = proc._detect_encoding(f)
        assert enc == "utf-8"


class TestCleanText:
    """文本清洗"""

    def _make_proc_with_patterns(self, extra_ads=None):
        p = TextPreprocessor()
        if extra_ads:
            import re
            p._ad_patterns = AD_PATTERNS + [re.compile(pat) for pat in extra_ads]
        return p

    def test_remove_ad_lines(self, proc):
        raw = (
            "正文开始\n"
            "求推荐票月票订阅\n"
            "中间段落\n"
            "本章未完待续\n"
            "结尾\n"
        )
        result = proc._clean_text(raw)
        assert "求推荐票" not in result
        assert "本章未完" not in result
        assert "正文开始" in result
        assert "中间段落" in result

    def test_remove_author_note(self, proc):
        raw = "正文\n作者的话：今天更新晚了\n更多正文"
        result = proc._clean_text(raw)
        assert "作者的话" not in result
        assert "正文" in result

    def test_preserve_normal_content(self, proc):
        raw = "第一行\n第二行\n第三行"
        result = proc._clean_text(raw)
        assert result.strip() == raw

    def test_remove_empty_lines(self, proc):
        raw = "a\n\n\nb\n\nc"
        result = proc._clean_text(raw)
        assert "\n\n\n" not in result


class TestMatchChapterHeader:
    """章节标题匹配"""

    def test_chinese_number_chapter(self, proc):
        m = proc._match_chapter_header("第一章 初入江湖")
        assert m is not None
        assert "第一章" in m[0]
        assert m[1] == "初入江湖"

    def test_arabic_chapter(self, proc):
        m = proc._match_chapter_header("第123章 终局")
        assert m is not None
        assert "第123章" in m[0]
        assert m[1] == "终局"

    def test_chapter_format(self, proc):
        m = proc._match_chapter_header("Chapter 5 新的开始")
        assert m is not None
        assert "Chapter 5" in m[0]
        assert m[1] == "新的开始"

    def test_chinese_ordinal(self, proc):
        m = proc._match_chapter_header("三、命运转折")
        assert m is not None
        assert "三" in m[0]
        assert m[1] == "命运转折"

    def test_volume_header(self, proc):
        m = proc._match_chapter_header("【风云卷】乱世英雄")
        assert m is not None
        assert "风云卷" in m[0]
        assert m[1] == "乱世英雄"

    def test_hui_style(self, proc):
        m = proc._match_chapter_header("第一回 梦回大唐")
        assert m is not None
        assert "第一回" in m[0]
        assert m[1] == "梦回大唐"

    def test_no_match_plain_text(self, proc):
        m = proc._match_chapter_header("这是一段普通正文")
        assert m is None

    def test_subtitle_extraction(self, proc):
        m = proc._match_chapter_header("第二章：决战紫禁之巅")
        assert m is not None
        assert "决战紫禁之巅" in m[1]


class TestSplitChapters:
    """章节切分"""

    def test_basic_split(self, proc):
        raw = (
            "第一章\n这是开篇内容\n"
            "第二章\n这是发展内容\n"
            "第三章\n这是高潮内容\n"
        )
        chapters = proc._split_chapters(raw)
        assert len(chapters) == 3
        assert chapters[0].title == "第一章"
        assert "开篇内容" in chapters[0].content
        assert chapters[1].title == "第二章"
        assert chapters[2].title == "第三章"

    def test_single_chapter_when_no_header(self, proc):
        raw = "这是一整段没有章节标记的正文\n很长很长的故事"
        chapters = proc._split_chapters(raw)
        assert len(chapters) == 1
        assert "未识别章节" in chapters[0].title

    def test_char_count_set(self, proc):
        raw = "第一章 A\n" + "字" * 100 + "\n第二章 B\n" + "词" * 50
        chapters = proc._split_chapters(raw)
        assert chapters[0].char_count > 0
        assert chapters[1].char_count > 0

    def test_index_sequential(self, proc):
        raw = "第1章 A\n内容A\n第2章 B\n内容B\n第3章 C\n内容C"
        chapters = proc._split_chapters(raw)
        for i, ch in enumerate(chapters):
            assert ch.index == i

    def test_mixed_header_styles(self, proc):
        raw = (
            "一、序幕\n序幕内容\n"
            "第二章 展开\n展开内容\n"
            "Chapter 3 转折\n转折内容\n"
        )
        chapters = proc._split_chapters(raw)
        assert len(chapters) == 3
        assert "序幕" in chapters[0].content


class TestExtractTitle:
    """书名提取"""

    def test_title_from_first_line(self, tmp_dir, proc):
        f = tmp_dir / "novel.txt"
        f.write_text("斗破苍穹\n第一章 陨落的天才\n内容", encoding="utf-8")
        book = proc.load(f)
        assert book.title == "斗破苍穹"

    def test_title_from_filename(self, tmp_dir, proc):
        f = tmp_dir / "我的小说.txt"
        f.write_text("第一章 开始\n这是正文开头的内容", encoding="utf-8")
        book = proc.load(f)
        # 首行是章节头，第二行不像书名，应从文件名提取
        assert book.title == "我的小说"


class TestLoad:
    """完整加载流程"""

    def test_load_single_file(self, tmp_dir, proc):
        f = tmp_dir / "test_novel.txt"
        content = (
            "测试小说\n"
            "第一章 起源\n起源正文内容\n"
            "第二章 成长\n成长正文内容\n"
        )
        f.write_text(content, encoding="utf-8")
        book = proc.load(f)

        assert book.file_path == f
        assert book.encoding == "utf-8"
        assert len(book.chapters) == 2
        assert book.total_chars > 0
        assert len(book.raw_text) > 0

    def test_load_nonexistent_raises(self, proc):
        with pytest.raises(FileNotFoundError):
            proc.load(Path("/nonexistent/path/file.txt"))

    def test_load_directory(self, tmp_dir, proc):
        (tmp_dir / "a.txt").write_text("书A\n第一章 A\n内容A", encoding="utf-8")
        (tmp_dir / "b.txt").write_text("书B\n第一章 B\n内容B", encoding="utf-8")
        books = proc.load_directory(tmp_dir)
        assert len(books) == 2

    def test_load_empty_directory(self, tmp_dir, proc):
        books = proc.load_directory(tmp_dir)
        assert books == []

    def test_load_invalid_directory_raises(self, proc):
        with pytest.raises(NotADirectoryError):
            proc.load_directory(Path("/nonexistent/dir"))

    def test_gbk_encoded_file(self, tmp_dir, proc):
        f = tmp_dir / "gbk_novel.txt"
        content = "GBK小说\n第一章 测试\nGBK编码的中文内容"
        f.write_bytes(content.encode("gbk"))
        book = proc.load(f)
        assert "GBK编码" in book.raw_text or "GBK" in book.title
        assert len(book.chapters) >= 1


class TestAdPatternsCoverage:
    """广告模式覆盖验证"""

    @pytest.mark.parametrize("line,should_remove", [
        ("求推荐票月票收藏打赏", True),
        ("本章未完，请看下页", True),
        ("手机用户请访问m.example.com", True),
        ("更多精彩请访问www.example.com", True),
        ("微信公众号搜索xx关注", True),
        ("作者的话：今天有事请假", True),
        ("PS: 下周恢复更新", True),
        ("=== 分割线 ===", True),
        ("正常的故事正文内容", False),
        ("他拔出剑，指向前方。", False),
    ])
    def test_ad_pattern_match(self, line, should_remove, proc):
        result = proc._clean_line(line)
        assert result == should_remove, f"行 '{line}' 应{'删除' if should_remove else '保留'}"
