"""统计分析模块 - 纯Python量化指标计算

对整本书进行量化统计，包括章节长度、句子特征、对话比例、
四字格密度、标点频率、高频实词、标题风格等指标。
"""
import re
import math
import statistics
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

try:
    from ..models.book import Book
    from ..models.analysis_result import LanguageProfile
except ImportError:
    from scripts.models.book import Book
    from scripts.models.analysis_result import LanguageProfile


# 内置停用词表（约60个常用停用词）
STOP_WORDS = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都",
    "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会",
    "着", "没有", "看", "好", "自己", "这", "他", "她", "它", "们",
    "那", "个", "被", "从", "把", "对", "与", "而", "但", "以", "及",
    "或", "等", "之", "于", "其", "所", "为", "又", "可", "能", "得",
    "地", "却", "让", "向", "往", "比", "还", "更", "最", "已", "再",
    "只", "才", "如果", "因为", "所以", "虽然", "但是", "然后", "这个"
}

# 标题风格关键词库
TITLE_STYLE_KEYWORDS = {
    "suspense": {  # 悬念型
        "谜", "秘密", "真相", "隐藏", "突然", "竟然", "谁知", "不料",
        "究竟", "为何", "怎么", "难道", "莫非", "原来", "终于", "揭晓"
    },
    "climax": {  # 爽点型
        "碾压", "秒杀", "暴打", "逆袭", "翻盘", "震惊", "全场", "无敌",
        "巅峰", "突破", "觉醒", "爆发", "横扫", "吊打", "完虐", "称霸"
    },
    "poetic": {  # 诗意型
        "月", "风", "雪", "花", "雨", "云", "星", "夜", "梦", "影",
        "烟", "雾", "霜", "露", "霞", "虹", "春", "秋", "冬", "夏"
    },
    "event": {  # 事件型
        "战", "斗", "遇", "见", "会", "到", "入", "离", "返", "归",
        "始", "终", "变", "化", "成", "败", "胜", "负", "亡", "生"
    },
    "colloquial": {  # 口语型
        "呢", "吧", "啊", "呀", "嘛", "哦", "哈", "嘿", "唉", "咳",
        "喂", "嗯", "额", "啧", "哇", "嚯", "哟", "诶", "噢", "呵"
    }
}


class StatAnalyzer:
    """网文统计分析器 - 纯Python计算，无需LLM"""

    def __init__(self):
        self._jieba_available: Optional[bool] = None

    @property
    def jieba_available(self) -> bool:
        """延迟检测jieba是否可用"""
        if self._jieba_available is None:
            try:
                import jieba
                jieba.setLogLevel(jieba.logging.INFO)
                self._jieba_available = True
            except ImportError:
                self._jieba_available = False
        return self._jieba_available

    def analyze(self, book: Book) -> dict:
        """完整统计分析，返回所有量化指标字典

        Args:
            book: Book对象，包含章节信息

        Returns:
            包含所有统计指标的字典
        """
        if not book.chapters:
            return self._empty_result()

        chapters_text = [ch.content for ch in book.chapters if ch.content]
        full_text = "\n".join(chapters_text)

        result = {
            # 基础统计
            "total_chapters": len(book.chapters),
            "total_chars": sum(ch.char_count for ch in book.chapters),
            "avg_chapter_length": self._calc_avg_chapter_length(book.chapters),
            "chapter_length_std": self._calc_chapter_length_std(book.chapters),

            # 句子分析
            "avg_sentence_length": self._calc_avg_sentence_length(full_text),
            "sentence_length_distribution": self._calc_sentence_distribution(full_text),
            "short_sentence_ratio": 0.0,
            "long_sentence_ratio": 0.0,

            # 段落分析
            "avg_paragraph_length": self._calc_avg_paragraph_length(full_text),
            "single_sentence_para_ratio": self._calc_single_sentence_para_ratio(full_text),

            # 对话比例
            "dialogue_ratio": self._calc_dialogue_ratio(full_text),

            # 四字格密度
            "four_char_density": self._calc_four_char_density(full_text),

            # 特殊标点频率
            "punctuation_freq": self._calc_punctuation_frequency(full_text),

            # 高频实词TOP200
            "top_words": self._extract_top_words(full_text, top_n=200),

            # 章节标题风格分布
            "title_style_dist": self._classify_title_styles(book.chapters),
        }

        dist = result["sentence_length_distribution"]
        result["short_sentence_ratio"] = dist.get("short", 0.0)
        result["long_sentence_ratio"] = dist.get("long", 0.0)

        return result

    def build_language_profile(self, book: Book) -> LanguageProfile:
        """从统计数据构建语言画像对象

        Args:
            book: Book对象

        Returns:
            LanguageProfile语言画像实例
        """
        stats = self.analyze(book)

        profile = LanguageProfile(
            avg_sentence_length=stats.get("avg_sentence_length", 0.0),
            short_sentence_ratio=stats.get("short_sentence_ratio", 0.0),
            dialogue_ratio=stats.get("dialogue_ratio", 0.0),
            paragraph_avg_length=stats.get("avg_paragraph_length", 0.0),
            four_char_density=stats.get("four_char_density", 0.0),
            top_words=stats.get("top_words", []),
        )

        return profile

    def _empty_result(self) -> dict:
        """返回空结果结构"""
        return {
            "total_chapters": 0,
            "total_chars": 0,
            "avg_chapter_length": 0.0,
            "chapter_length_std": 0.0,
            "avg_sentence_length": 0.0,
            "sentence_length_distribution": {"short": 0.0, "medium": 0.0, "long": 0.0},
            "short_sentence_ratio": 0.0,
            "long_sentence_ratio": 0.0,
            "avg_paragraph_length": 0.0,
            "single_sentence_para_ratio": 0.0,
            "dialogue_ratio": 0.0,
            "four_char_density": 0.0,
            "punctuation_freq": {},
            "top_words": [],
            "title_style_dist": {},
        }

    def _calc_avg_chapter_length(self, chapters: list) -> float:
        """计算平均章节长度"""
        if not chapters:
            return 0.0
        lengths = [ch.char_count for ch in chapters if ch.char_count > 0]
        return statistics.mean(lengths) if lengths else 0.0

    def _calc_chapter_length_std(self, chapters: list) -> float:
        """计算章节长度标准差"""
        lengths = [ch.char_count for ch in chapters if ch.char_count > 0]
        if len(lengths) < 2:
            return 0.0
        return statistics.stdev(lengths)

    def _split_sentences(self, text: str) -> list[str]:
        """按中英文标点切分句子

        分割符：。！？!? \n
        """
        pattern = r'[。！？!?\n]+'
        sentences = re.split(pattern, text)
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 1]

    def _calc_avg_sentence_length(self, text: str) -> float:
        """计算平均句子长度（字符数）"""
        sentences = self._split_sentences(text)
        if not sentences:
            return 0.0
        lengths = [len(s) for s in sentences]
        return statistics.mean(lengths)

    def _calc_sentence_distribution(self, text: str) -> dict:
        """计算句子长度分布（短/中/长比例）

        分类标准：
        - short: <= 15字符
        - medium: 16-30字符
        - long: > 30字符
        """
        sentences = self._split_sentences(text)
        if not sentences:
            return {"short": 0.0, "medium": 0.0, "long": 0.0}

        total = len(sentences)
        short_count = sum(1 for s in sentences if len(s) <= 15)
        medium_count = sum(1 for s in sentences if 16 <= len(s) <= 30)
        long_count = total - short_count - medium_count

        return {
            "short": round(short_count / total * 100, 2),
            "medium": round(medium_count / total * 100, 2),
            "long": round(long_count / total * 100, 2),
        }

    def _calc_avg_paragraph_length(self, text: str) -> float:
        """计算平均段落长度"""
        paragraphs = re.split(r'\n\s*\n', text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        if not paragraphs:
            return 0.0
        lengths = [len(p) for p in paragraphs]
        return statistics.mean(lengths)

    def _calc_single_sentence_para_ratio(self, text: str) -> float:
        """计算单句成段比例"""
        paragraphs = re.split(r'\n\s*\n', text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        if not paragraphs:
            return 0.0

        single_count = 0
        for para in paragraphs:
            sentences = self._split_sentences(para)
            if len(sentences) == 1:
                single_count += 1

        return round(single_count / len(paragraphs) * 100, 2)

    def _calc_dialogue_ratio(self, text: str) -> float:
        """计算对话占比（引号内文字占总文字的比例）

        匹配引号："「」『』""
        """
        if not text or len(text) == 0:
            return 0.0

        dialogue_pattern = r'["「」『』""][^"「」『』""]*["「」『』""]'
        matches = re.findall(dialogue_pattern, text)
        dialogue_chars = sum(len(m) for m in matches)

        return round(dialogue_chars / len(text) * 100, 2)

    def _calc_four_char_density(self, text: str) -> float:
        """计算四字格密度（连续4个中文字符的比例）"""
        if not text or len(text) < 4:
            return 0.0

        chinese_chars = re.findall(r'[\u4e00-\u9fff]', text)
        if len(chinese_chars) < 4:
            return 0.0

        four_char_pattern = r'[\u4e00-\u9fff]{4}'
        four_char_matches = re.findall(four_char_pattern, text)

        density = len(four_char_matches) / (len(chinese_chars) / 4)
        return round(density * 100, 2)

    def _calc_punctuation_frequency(self, text: str) -> dict:
        """计算特殊标点频率（每千字出现次数）

        统计：感叹号、省略号、破折号等
        """
        if not text or len(text) == 0:
            return {}

        base_count = len(text) / 1000
        if base_count == 0:
            return {}

        punct_stats = {
            "exclamation": len(re.findall(r'[！!]', text)),
            "ellipsis": len(re.findall(r'\.{2,}|…+', text)),
            "dash": len(re.findall(r'——|-{2,}', text)),
            "question": len(re.findall(r'[？?]', text)),
            "semicolon": len(re.findall(r'[；;]', text)),
            "tilde": len(re.findall(r'[～~]', text)),
        }

        return {
            k: round(v / base_count, 2) for k, v in punct_stats.items()
        }

    def _extract_top_words(self, text: str, top_n: int = 200) -> list[tuple[str, float]]:
        """提取高频实词TOP N

        优先使用jieba分词，不可用时降级为纯正则提取
        """
        if not text or len(text) < 10:
            return []

        words = []
        if self.jieba_available:
            words = self._extract_with_jieba(text)
        else:
            words = self._extract_with_regex(text)

        word_freq = Counter(words)
        top_words = word_freq.most_common(top_n)

        total = sum(word_freq.values())
        if total == 0:
            return []

        result = [(word, round(count / total * 100, 4)) for word, count in top_words]
        return result

    def _extract_with_jieba(self, text: str) -> list[str]:
        """使用jieba分词提取实词"""
        import jieba
        import jieba.posseg as pseg

        words = []
        words_iter = pseg.cut(text)

        allowed_pos = {
            'n', 'nr', 'ns', 'nt', 'nz',
            'v', 'vd', 'vn', 'vg', 'vi', 'vq',
            'a', 'ad', 'an',
            'b', 'l', 'i'
        }

        for word, pos in words_iter:
            if (len(word) >= 2 and
                    word not in STOP_WORDS and
                    pos in allowed_pos and
                    re.match(r'^[\u4e00-\u9fff]+$', word)):
                words.append(word)

        return words

    def _extract_with_regex(self, text: str) -> list[str]:
        """降级方案：使用正则提取2字以上中文词汇"""
        pattern = r'[\u4e00-\u9fff]{2,}'
        words = re.findall(pattern, text)

        filtered = [
            w for w in words
            if w not in STOP_WORDS and len(w) >= 2
        ]

        return filtered

    def _classify_title_styles(self, chapters: list) -> dict[str, float]:
        """章节标题风格分类

        通过关键词匹配判断标题类型：
        - event: 事件型
        - suspense: 悬念型
        - climax: 爽点型
        - poetic: 诗意型
        - colloquial: 口语型
        """
        if not chapters:
            return {}

        style_counts = Counter()
        total = 0

        for ch in chapters:
            if not ch.title:
                continue

            title = ch.title
            matched_style = self._match_title_style(title)
            if matched_style:
                style_counts[matched_style] += 1
            else:
                style_counts["other"] += 1
            total += 1

        if total == 0:
            return {}

        return {
            style: round(count / total * 100, 2)
            for style, count in style_counts.items()
        }

    def _match_title_style(self, title: str) -> Optional[str]:
        """匹配单个标题的风格类型"""
        scores = {}
        for style, keywords in TITLE_STYLE_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in title)
            if score > 0:
                scores[style] = score

        if not scores:
            return None

        return max(scores, key=scores.get)
