"""StratifiedSampler 单元测试"""

import pytest
from pathlib import Path

from scripts.config import SamplingConfig
from scripts.models.book import Book
from scripts.models.chapter import Chapter, ChapterType
from scripts.sampler import StratifiedSampler


class TestDialogueRatio:
    """对话占比计算测试"""

    def test_empty_content(self):
        assert StratifiedSampler._dialogue_ratio("") == 0.0
        assert StratifiedSampler._dialogue_ratio("   ") == 0.0

    def test_no_dialogue(self):
        content = "这是一个没有对话的段落，纯叙述内容。"
        ratio = StratifiedSampler._dialogue_ratio(content)
        assert ratio == 0.0

    def test_full_dialogue(self):
        content = '"这是全部的对话内容"'
        ratio = StratifiedSampler._dialogue_ratio(content)
        # 对话字符数应该占总字符数的大部分
        assert ratio > 0.5

    def test_mixed_content(self):
        content = '他看着她说："今天天气真好。"然后转身离开。'
        ratio = StratifiedSampler._dialogue_ratio(content)
        assert 0 < ratio < 1

    def test_multiple_dialogues(self):
        content = '"你好！" "再见！" "谢谢！"'
        ratio = StratifiedSampler._dialogue_ratio(content)
        # 对话字符数应该占总字符数的大部分
        assert ratio > 0.5


class TestKeywordDensity:
    """关键词密度计算测试"""

    def test_empty_content(self):
        assert StratifiedSampler._calc_keyword_density("", ["震惊"]) == 0.0

    def test_no_matches(self):
        content = "这是一段普通文本"
        density = StratifiedSampler._calc_keyword_density(
            content, 
            ["震惊", "突破"]
        )
        assert density == 0.0

    def test_single_keyword(self):
        content = "他很震惊" * 10  # 重复10次
        density = StratifiedSampler._calc_keyword_density(content, ["震惊"])
        assert density > 0

    def test_multiple_keywords(self):
        content = "震惊突破碾压秒杀"
        density = StratifiedSampler._calc_keyword_density(
            content,
            ["震惊", "突破", "碾压", "秒杀"]
        )
        # 4个关键词在短文本中，密度应该较高
        assert density > 0


class TestShortParagraphRatio:
    """短段落占比测试"""

    def test_empty_content(self):
        assert StratifiedSampler._short_paragraph_ratio("") == 0.0

    def test_all_short_paragraphs(self):
        content = "短句一\n短句二\n短句三\n短句四"
        ratio = StratifiedSampler._short_paragraph_ratio(content)
        assert ratio == 1.0

    def test_all_long_paragraphs(self):
        content = "这是一个很长的段落，包含了很多的内容。" * 5
        ratio = StratifiedSampler._short_paragraph_ratio(content)
        assert ratio == 0.0

    def test_mixed_paragraphs(self):
        content = "短\n" + "这是一个比较长的段落包含很多内容\n" * 3 + "短"
        ratio = StratifiedSampler._short_paragraph_ratio(content)
        # 2个短段落 + 3个长段落，应该有短段落但不是全部
        assert 0 < ratio <= 1.0


class TestAvgParagraphLength:
    """平均段落长度测试"""

    def test_empty_content(self):
        assert StratifiedSampler._avg_paragraph_length("") == 0.0

    def test_uniform_length(self):
        content = "一二三四五六七八九十\n" * 4
        avg_len = StratifiedSampler._avg_paragraph_length(content)
        assert avg_len == 10

    def test_variable_length(self):
        content = "短\n这是一个很长的段落\n短"
        avg_len = StratifiedSampler._avg_paragraph_length(content)
        assert 0 < avg_len < 20


class TestClimaxScore:
    """高潮得分算法测试"""

    def setup_method(self):
        self.sampler = StratifiedSampler()

    def _make_chapter(self, index: int, title: str, content: str) -> Chapter:
        ch = Chapter(index=index, title=title, content=content)
        ch.char_count = len(content)
        return ch

    def test_high_emotion_content(self):
        """高情绪词密度的章节应该得高分"""
        content = "震惊！突破！碾压一切！秒杀对手！轰杀全场！"
        chapter = self._make_chapter(0, "决战", content)

        all_chapters = [chapter]
        score = self.sampler._climax_score(chapter, all_chapters)

        assert score > 0.5  # 应该得到较高分数

    def test_battle_title(self):
        """含战斗词的标题应该加分"""
        content = "普通的叙述内容"
        chapter_battle = self._make_chapter(0, "最终决战", content)
        chapter_normal = self._make_chapter(0, "日常散步", content)

        all_chapters = [chapter_battle]
        score_battle = self.sampler._climax_score(chapter_battle, all_chapters)

        all_chapters = [chapter_normal]
        score_normal = self.sampler._climax_score(chapter_normal, all_chapters)

        assert score_battle > score_normal

    def test_short_paragraphs_boost_score(self):
        """短段落密集应该提升高潮得分"""
        short_para_content = "\n".join(["快！"] * 20)  # 全是短段
        long_para_content = "这是一个很长的段落" * 10  # 长段落

        ch_short = self._make_chapter(0, "测试", short_para_content)
        ch_long = self._make_chapter(0, "测试", long_para_content)

        score_short = self.sampler._climax_score(ch_short, [ch_short])
        score_long = self.sampler._climax_score(ch_long, [ch_long])

        assert score_short > score_long

    def test_longer_chapter_bonus(self):
        """长章节应该获得额外分数"""
        base_content = "普通内容" * 100
        ch_long = self._make_chapter(0, "测试", base_content)
        ch_long.char_count = 4000  # 超过3500字阈值

        ch_short = self._make_chapter(0, "测试", base_content[:500])
        ch_short.char_count = 500

        score_long = self.sampler._climax_score(ch_long, [ch_long])
        score_short = self.sampler._climax_score(ch_short, [ch_short])

        assert score_long >= score_short


class TestDailyScore:
    """日常得分算法测试"""

    def setup_method(self):
        self.sampler = StratifiedSampler()

    def _make_chapter(self, content: str) -> Chapter:
        ch = Chapter(index=0, title="日常", content=content)
        ch.char_count = len(content)
        return ch

    def test_daily_keywords_boost_score(self):
        """生活化词汇应该提升日常得分"""
        daily_content = "阳光明媚，微风拂面。他在院子里喝茶聊天，感觉很舒服。"
        battle_content = "震惊！突破！轰杀全场！"

        ch_daily = self._make_chapter(daily_content)
        ch_battle = self._make_chapter(battle_content)

        score_daily = self.sampler._daily_score(ch_daily)
        score_battle = self.sampler._daily_score(ch_battle)

        assert score_daily > score_battle

    def test_normal_paragraph_length(self):
        """正常段落长度应该提升日常得分"""
        normal_para = ("这是一个长度适中的段落，大约一百字左右。" +
                      "描述了日常生活场景。") * 3

        short_para = "\n".join(["快！"] * 10)

        ch_normal = self._make_chapter(normal_para)
        ch_short = self._make_chapter(short_para)

        score_normal = self.sampler._daily_score(ch_normal)
        score_short = self.sampler._daily_score(ch_short)

        assert score_normal > score_short

    def test_moderate_dialogue(self):
        """适中对话占比应该获得较高日常得分"""
        moderate = '他说："今天天气不错。"然后继续喝茶看书。'
        heavy_dialogue = '"你好！" "谢谢！" "再见！" "不客气！"' * 5
        no_dialogue = "纯叙述文本没有任何对话内容"

        ch_mod = self._make_chapter(moderate)
        ch_heavy = self._make_chapter(heavy_dialogue)
        ch_none = self._make_chapter(no_dialogue)

        score_mod = self.sampler._daily_score(ch_mod)
        score_heavy = self.sampler._daily_score(ch_heavy)
        score_none = self.sampler._daily_score(ch_none)
        
        assert score_mod > score_heavy
        assert score_mod > score_none


class TestRegionalSample:
    """区域分散采样测试"""

    def test_basic_distribution(self):
        """基本分散采样：应该从前中后三个区域选取"""
        chapters_with_scores = [
            (Chapter(i, f"第{i}章", ""), float(i))
            for i in range(30)
        ]
        
        result = StratifiedSampler._regional_sample(
            chapters_with_scores,
            target_count=6,
            total_chapters=30
        )
        
        indices = [ch.index for ch in result]
        
        # 验证结果来自不同区域（前10、中10、后10）
        front_selected = any(0 <= idx < 10 for idx in indices)
        middle_selected = any(10 <= idx < 20 for idx in indices)
        back_selected = any(20 <= idx < 30 for idx in indices)
        
        # 至少应该覆盖2个区域
        regions_covered = sum([front_selected, middle_selected, back_selected])
        assert regions_covered >= 2

    def test_target_count_respected(self):
        """返回数量应该等于目标数量"""
        chapters_with_scores = [
            (Chapter(i, "", ""), 1.0) for i in range(20)
        ]
        
        result = StratifiedSampler._regional_sample(
            chapters_with_scores,
            target_count=5,
            total_chapters=20
        )
        
        assert len(result) == 5

    def test_empty_input(self):
        """空输入返回空列表"""
        result = StratifiedSampler._regional_sample([], 5, 100)
        assert result == []

    def test_zero_target(self):
        """目标数量为0返回空列表"""
        data = [(Chapter(0, "", ""), 1.0)]
        result = StratifiedSampler._regional_sample(data, 0, 10)
        assert result == []

    def test_fewer_candidates_than_target(self):
        """候选数少于目标数时返回所有候选"""
        data = [(Chapter(i, "", ""), 1.0) for i in range(3)]
        result = StratifiedSampler._regional_sample(data, 10, 30)
        assert len(result) == 3


class TestSamplingFlow:
    """完整抽样流程集成测试"""

    def _create_test_book(self, chapter_count: int = 50) -> Book:
        """
        创建测试用书籍对象
        
        章节设计：
        - 前5章：开篇风格
        - 中间：混合高潮和日常
        - 后3章：收尾风格
        """
        chapters = []
        
        for i in range(chapter_count):
            if i < 5:
                # 开篇：世界观介绍
                title = f"第{i+1}章 世界观介绍"
                content = f"在这个世界里，人们通过修炼变强。主角{i+1}开始了他的旅程。" * 20
            elif i >= chapter_count - 3:
                # 收尾：结局走向
                title = f"第{i+1}章 最终结局"
                content = f"经过重重考验，主角终于达到了顶峰。一切都结束了。" * 15
            elif i % 7 == 0:
                # 高潮章节
                title = f"第{i+1}章 决战{ i//7 }"
                content = (
                    "震惊！突破！碾压！\n" * 10 +
                    "轰杀全场！秒杀对手！\n" * 8 +
                    "血腥惨烈！恐怖绝伦！"
                )
            else:
                # 日常过渡
                title = f"第{i+1}章 日常修炼"
                content = (
                    "阳光明媚，微风拂面。\n"
                    "他在院子里喝茶聊天。\n"
                    "感觉很舒服，很惬意。\n" * 5 +
                    "这就是平淡的生活。"
                )
            
            ch = Chapter(
                index=i,
                title=title,
                content=content,
                char_count=len(content)
            )
            chapters.append(ch)

        book = Book(
            file_path=Path("/test/book.txt"),
            title="测试小说",
            author="测试作者",
            total_chars=sum(ch.char_count for ch in chapters),
            chapters=chapters
        )
        return book

    def test_full_sampling_workflow(self):
        """完整的四层抽样工作流"""
        book = self._create_test_book(50)
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        # 验证基本属性
        assert isinstance(result, list)
        assert len(result) > 0
        
        # 验证去重
        indices = [ch.index for ch in result]
        assert len(indices) == len(set(indices))
        
        # 验证排序（按章节索引）
        for i in range(len(result) - 1):
            assert result[i].index < result[i+1].index

    def test_layer_types_assigned(self):
        """验证每层类型都被正确标注"""
        book = self._create_test_book(50)
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        layer_types = {ch.layer_type for ch in result}
        
        # 至少应该有开篇和收尾
        assert ChapterType.OPENING in layer_types
        assert ChapterType.ENDING in layer_types
        
        # 高潮和日常可能存在（取决于内容）
        # 不强制要求，因为测试数据可能不够典型

    def test_opening_count_correct(self):
        """开篇章节数量应该符合配置"""
        config = SamplingConfig(opening_count=3)
        book = self._create_test_book(50)
        sampler = StratifiedSampler(config=config)
        
        result = sampler.sample(book)
        opening_count = sum(
            1 for ch in result if ch.layer_type == ChapterType.OPENING
        )
        
        assert opening_count == 3

    def test_ending_count_correct(self):
        """收尾章节数量应该符合配置"""
        config = SamplingConfig(ending_count=2)
        book = self._create_test_book(50)
        sampler = StratifiedSampler(config=config)
        
        result = sampler.sample(book)
        ending_count = sum(
            1 for ch in result if ch.layer_type == ChapterType.ENDING
        )
        
        assert ending_count == 2

    def test_custom_config(self):
        """自定义配置应该生效"""
        config = SamplingConfig(
            opening_count=2,
            climax_count=3,
            daily_count=2,
            ending_count=1
        )
        book = self._create_test_book(50)
        sampler = StratifiedSampler(config=config)
        
        result = sampler.sample(book)
        
        # 总数应该在合理范围内（可能有重叠导致略少）
        max_expected = config.opening_count + config.climax_count + \
                      config.daily_count + config.ending_count
        assert len(result) <= max_expected

    def test_empty_book(self):
        """空书籍应该返回空列表"""
        book = Book(
            file_path=Path("/test/empty.txt"),
            chapters=[]
        )
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        assert result == []

    def test_very_small_book(self):
        """章节数很少的书应该优雅处理"""
        chapters = [
            Chapter(i, f"第{i+1}章", "内容" * 10, 50)
            for i in range(3)
        ]
        book = Book(
            file_path=Path("/test/small.txt"),
            chapters=chapters
        )
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        # 不应该报错，且不应该超过总章节数
        assert len(result) <= 3
        assert len(set(ch.index for ch in result)) == len(result)

    def test_scores_are_set(self):
        """被选中的章节应该有score值"""
        book = self._create_test_book(50)
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        for ch in result:
            if ch.layer_type in [ChapterType.CLIMAX, ChapterType.DAILY]:
                assert ch.score >= 0  # 高潮和日常应该有评分

    def test_no_duplicates_between_layers(self):
        """各层之间不应该有重复"""
        book = self._create_test_book(100)  # 更多章节降低重叠概率
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        indices = [ch.index for ch in result]
        assert len(indices) == len(set(indices))


class TestEdgeCases:
    """边界情况测试"""

    def test_single_chapter_book(self):
        """只有一章的书"""
        chapters = [Chapter(0, "唯一章节", "内容" * 100, 200)]
        book = Book(file_path=Path("/test/single.txt"), chapters=chapters)
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        assert len(result) == 1
        assert result[0].layer_type == ChapterType.OPENING

    def test_all_chapters_same_type(self):
        """所有章节都是高潮类型"""
        chapters = []
        for i in range(20):
            content = "震惊突破碾压秒杀" * 20
            ch = Chapter(i, f"第{i+1}章 战斗", content, len(content))
            chapters.append(ch)
        
        book = Book(file_path=Path("/test/battle.txt"), chapters=chapters)
        sampler = StratifiedSampler()
        
        result = sampler.sample(book)
        
        # 应该能正常完成，不会崩溃
        assert len(result) > 0
        assert len(set(ch.index for ch in result)) == len(result)

    def test_unicode_content(self):
        """Unicode 内容处理"""
        content = "中文内容🎉特殊符号！@#￥%……&*（）"
        ch = Chapter(0, "测试", content, len(content))
        
        # 各个静态方法应该能处理 Unicode
        ratio = StratifiedSampler._dialogue_ratio(content)
        assert isinstance(ratio, float)
        assert 0 <= ratio <= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
