"""StatAnalyzer 统计分析模块测试

覆盖：章节统计、句子分析、段落分析、对话检测、
四字格密度、标点频率、词频提取、标题风格分类
"""
import math
import pytest
from pathlib import Path

from scripts.stat_analyzer import StatAnalyzer, STOP_WORDS, TITLE_STYLE_KEYWORDS
from scripts.models.book import Book
from scripts.models.chapter import Chapter, ChapterType
from scripts.models.analysis_result import LanguageProfile


@pytest.fixture
def analyzer():
    """创建StatAnalyzer实例"""
    return StatAnalyzer()


@pytest.fixture
def sample_book():
    """创建测试用Book对象"""
    chapters = [
        Chapter(
            index=1,
            title='神秘来客',
            content='夜深了，月光洒在窗台上。"突然"，一阵敲门声响起。\n"谁？"他问道。\n"是我。"门外传来熟悉的声音。',
            char_count=50,
        ),
        Chapter(
            index=2,
            title='真相大白',
            content='原来一切都是有预谋的！他终于明白了……\n这个秘密隐藏得太深了。',
            char_count=35,
        ),
        Chapter(
            index=3,
            title='逆袭之战',
            content='他一拳轰出——砰！\n全场震惊！\n"这怎么可能？"\n"太强了！"',
            char_count=40,
        ),
        Chapter(
            index=4,
            title='月下独酌',
            content='风轻轻吹过，花影摇曳。\n他独自坐在庭院中，望着星空发呆。\n夜色如水，静谧而美好。',
            char_count=45,
        ),
        Chapter(
            index=5,
            title='嘿，你来了',
            content='"喂，你在想什么呢？"\n"没什么啦。"\n"真的吗？"\n"嗯，真的。"',
            char_count=30,
        ),
    ]

    return Book(
        file_path=Path("test.txt"),
        title="测试小说",
        author="测试作者",
        total_chars=sum(ch.char_count for ch in chapters),
        chapters=chapters,
        raw_text="\n".join([ch.content for ch in chapters]),
    )


@pytest.fixture
def empty_book():
    """创建空Book对象"""
    return Book(
        file_path=Path("empty.txt"),
        title="空书",
        chapters=[],
    )


class TestBasicStats:
    """基础统计测试"""

    def test_total_chapters(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["total_chapters"] == 5

    def test_total_chars(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["total_chars"] == 200

    def test_avg_chapter_length(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["avg_chapter_length"] == 40.0

    def test_chapter_length_std(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert isinstance(result["chapter_length_std"], float)

    def test_empty_book_stats(self, analyzer, empty_book):
        result = analyzer.analyze(empty_book)
        assert result["total_chapters"] == 0
        assert result["total_chars"] == 0


class TestSentenceAnalysis:
    """句子分析测试"""

    def test_sentence_splitting(self, analyzer):
        text = "这是第一句。这是第二句！这是第三句？"
        sentences = analyzer._split_sentences(text)
        assert len(sentences) == 3

    def test_avg_sentence_length(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["avg_sentence_length"] > 0
        assert isinstance(result["avg_sentence_length"], float)

    def test_sentence_distribution(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        dist = result["sentence_length_distribution"]
        assert "short" in dist
        assert "medium" in dist
        assert "long" in dist
        total = sum(dist.values())
        assert abs(total - 100.0) < 0.1

    def test_short_long_ratios(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["short_sentence_ratio"] >= 0
        assert result["long_sentence_ratio"] >= 0
        assert result["short_sentence_ratio"] + \
               result.get("sentence_length_distribution", {}).get("medium", 0) + \
               result["long_sentence_ratio"] <= 101


class TestParagraphAnalysis:
    """段落分析测试"""

    def test_avg_paragraph_length(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        assert result["avg_paragraph_length"] > 0

    def test_single_sentence_para_ratio(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        ratio = result["single_sentence_para_ratio"]
        assert 0 <= ratio <= 100


class TestDialogueDetection:
    """对话检测测试"""

    def test_dialogue_ratio(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        ratio = result["dialogue_ratio"]
        assert 0 <= ratio <= 100

    def test_dialogue_detection_with_quotes(self, analyzer):
        text = '"他说："你好。""她回答："再见。"'
        ratio = analyzer._calc_dialogue_ratio(text)
        assert ratio > 0

    def test_dialogue_detection_chinese_quotes(self, analyzer):
        text = '「这是中文引号」『这也是』'
        ratio = analyzer._calc_dialogue_ratio(text)
        assert ratio > 0

    def test_no_dialogue(self, analyzer):
        text = "这是一段没有任何对话的纯叙述文字。"
        ratio = analyzer._calc_dialogue_ratio(text)
        assert ratio == 0.0


class TestFourCharDensity:
    """四字格密度测试"""

    def test_four_char_density_calculation(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        density = result["four_char_density"]
        assert density >= 0

    def test_high_four_char_density(self, analyzer):
        text = "风花雪月春夏秋冬酸甜苦辣喜怒哀乐"
        density = analyzer._calc_four_char_density(text)
        assert density > 0

    def test_low_four_char_density(self, analyzer):
        text = "a b c d e f g h i j k l m n o p"
        density = analyzer._calc_four_char_density(text)
        assert density == 0.0


class TestPunctuationFrequency:
    """标点频率测试"""

    def test_punctuation_frequency_structure(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        freq = result["punctuation_freq"]
        assert "exclamation" in freq
        assert "ellipsis" in freq
        assert "dash" in freq
        assert "question" in freq

    def test_exclamation_counting(self, analyzer):
        text = "天哪！！！太好了！！"
        freq = analyzer._calc_punctuation_frequency(text)
        assert freq["exclamation"] > 0

    def test_ellipsis_counting(self, analyzer):
        text = "他说……然后……"
        freq = analyzer._calc_punctuation_frequency(text)
        assert freq["ellipsis"] > 0

    def test_dash_counting(self, analyzer):
        text = "他大喊——住手！"
        freq = analyzer._calc_punctuation_frequency(text)
        assert freq["dash"] > 0


class TestWordExtraction:
    """词频提取测试"""

    def test_top_words_structure(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        words = result["top_words"]
        if words:
            word, freq = words[0]
            assert isinstance(word, str)
            assert isinstance(freq, (int, float))
            assert 0 < freq <= 100

    def test_top_words_no_stopwords(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        words = [w for w, _ in result["top_words"]]
        for word in words[:10]:
            assert word not in STOP_WORDS

    def test_word_extraction_fallback(self, analyzer, monkeypatch):
        """测试jieba不可用时的降级方案"""
        monkeypatch.setattr(analyzer, "_jieba_available", False)
        text = "这是一个测试文本，用于验证正则提取功能"
        words = analyzer._extract_with_regex(text)
        assert len(words) > 0
        assert all(len(w) >= 2 for w in words)


class TestTitleStyleClassification:
    """标题风格分类测试"""

    def test_suspense_title(self, analyzer):
        style = analyzer._match_title_style("神秘的真相")
        assert style == "suspense"

    def test_climax_title(self, analyzer):
        style = analyzer._match_title_style("碾压全场")
        assert style == "climax"

    def test_poetic_title(self, analyzer):
        style = analyzer._match_title_style("月下花影")
        assert style == "poetic"

    def test_event_title(self, analyzer):
        style = analyzer._match_title_style("决战紫禁")
        assert style == "event"

    def test_colloquial_title(self, analyzer):
        style = analyzer._match_title_style("嘿，你来了")
        assert style == "colloquial"

    def test_unknown_style(self, analyzer):
        style = analyzer._match_title_style("第一章")
        assert style is None

    def test_title_style_distribution(self, analyzer, sample_book):
        result = analyzer.analyze(sample_book)
        dist = result["title_style_dist"]
        assert len(dist) > 0
        total = sum(dist.values())
        assert abs(total - 100.0) < 0.1


class TestLanguageProfile:
    """语言画像构建测试"""

    def test_profile_creation(self, analyzer, sample_book):
        profile = analyzer.build_language_profile(sample_book)
        assert isinstance(profile, LanguageProfile)
        assert profile.avg_sentence_length > 0
        assert 0 <= profile.short_sentence_ratio <= 100
        assert 0 <= profile.dialogue_ratio <= 100
        assert profile.paragraph_avg_length > 0
        assert profile.four_char_density >= 0
        assert isinstance(profile.top_words, list)

    def test_profile_from_empty_book(self, analyzer, empty_book):
        profile = analyzer.build_language_profile(empty_book)
        assert isinstance(profile, LanguageProfile)
        assert profile.avg_sentence_length == 0.0


class TestEdgeCases:
    """边界情况测试"""

    def test_single_character_text(self, analyzer):
        book = Book(
            file_path=Path("test.txt"),
            title="单字符",
            chapters=[Chapter(index=1, content="好", char_count=1)],
        )
        result = analyzer.analyze(book)
        assert result is not None

    def test_only_punctuation_text(self, analyzer):
        book = Book(
            file_path=Path("test.txt"),
            title="仅标点",
            chapters=[Chapter(index=1, content="。。。！！！", char_count=6)],
        )
        result = analyzer.analyze(book)
        assert result is not None

    def test_very_long_sentences(self, analyzer):
        long_sentence = "这是一个非常长的句子" * 20
        book = Book(
            file_path=Path("test.txt"),
            title="长句测试",
            chapters=[Chapter(index=1, content=long_sentence, char_count=len(long_sentence))],
        )
        result = analyzer.analyze(book)
        assert result["long_sentence_ratio"] > 0

    def test_mixed_content(self, analyzer):
        mixed_content = """
        第一章 开始
        
        "你好！"他说。
        
        她微笑着回答："很高兴见到你。"
        
        突然——轰隆一声巨响！
        
        天哪……这究竟是怎么回事？
        
        月光如水，洒在窗台上的花影中。
        
        他心中暗道：这一战，我必胜！
        """
        book = Book(
            file_path=Path("test.txt"),
            title="混合内容",
            chapters=[
                Chapter(
                    index=1,
                    title="开始",
                    content=mixed_content.strip(),
                    char_count=len(mixed_content.strip()),
                )
            ],
        )
        result = analyzer.analyze(book)
        assert result["total_chapters"] == 1
        assert result["dialogue_ratio"] > 0
        assert result["four_char_density"] >= 0


class TestPerformance:
    """性能相关测试"""

    def test_large_text_handling(self, analyzer):
        large_content = "这是一段用于性能测试的文本内容。" * 1000
        book = Book(
            file_path=Path("large.txt"),
            title="大文本测试",
            chapters=[
                Chapter(
                    index=i,
                    title=f"第{i}章",
                    content=large_content,
                    char_count=len(large_content),
                )
                for i in range(10)
            ],
        )

        import time
        start = time.time()
        result = analyzer.analyze(book)
        elapsed = time.time() - start

        assert result is not None
        assert elapsed < 5.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
