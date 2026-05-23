"""LLM深读引擎测试套件

使用 unittest.mock.Mock 模拟LLM客户端，验证各组件的核心逻辑。
覆盖：PromptLoader加载、章节选择、上下文合并、结果解析、全量分析流程。
"""

import json
import pytest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from scripts.llm_analyzer import (
    LLMClient,
    OpenAILLMClient,
    PromptLoader,
    LLMAnalyzer,
)
from scripts.models.book import Book
from scripts.models.chapter import Chapter, ChapterType
from scripts.models.analysis_result import (
    AnalysisResult,
    StyleFeature,
    ProtagonistProfile,
    LanguageProfile,
    EmotionWaveProfile,
    Stability,
)


class MockLLMClient(LLMClient):
    """用于测试的模拟LLM客户端，返回预设响应"""

    def __init__(self, responses: dict[str, str] = None):
        self.responses = responses or {}
        self.call_history: list[dict] = []
        self._call_count = 0

    def chat(self, prompt: str, context: str = "", system_prompt: str = "") -> str:
        self.call_history.append({
            "prompt": prompt,
            "context": context[:100] if context else "",
            "system_prompt": system_prompt[:100] if system_prompt else "",
        })
        if self.responses:
            keys = list(self.responses.keys())
            if self._call_count < len(keys):
                key = keys[self._call_count]
                self._call_count += 1
                return self.responses[key]
        return '{"technical_description": "模拟分析结果", "stability": "high"}'


@pytest.fixture
def sample_chapters():
    """创建测试用章节数据"""
    return [
        Chapter(index=1, title="开篇", content="这是开篇内容" * 100, char_count=600,
                layer_type=ChapterType.OPENING, score=0.9),
        Chapter(index=2, title="日常", content="这是日常剧情" * 100, char_count=600,
                layer_type=ChapterType.DAILY, score=0.6),
        Chapter(index=3, title="高潮", content="这是高潮战斗" * 100, char_count=600,
                layer_type=ChapterType.CLIMAX, score=0.95),
        Chapter(index=4, title="结局", content="这是大结局" * 50, char_count=300,
                layer_type=ChapterType.ENDING, score=0.85),
    ]


@pytest.fixture
def sample_book(sample_chapters):
    """创建测试用Book对象"""
    return Book(
        file_path=Path("test_novel.txt"),
        title="测试小说",
        author="测试作者",
        chapters=sample_chapters,
        total_chars=sum(ch.char_count for ch in sample_chapters),
    )


class TestPromptLoader:
    """PromptLoader单元测试"""

    def test_load_existing_template(self, tmp_path):
        """测试加载已存在的模板文件"""
        loader = PromptLoader(prompts_dir=str(tmp_path))
        test_file = tmp_path / "engineering.txt"
        test_file.write_text("自定义工程分析模板", encoding="utf-8")

        result = loader.load("engineering")
        assert result == "自定义工程分析模板"

    def test_load_missing_template_returns_default(self):
        """测试模板不存在时返回默认prompt"""
        loader = PromptLoader()
        result = loader.load("engineering")
        assert "工程架构" in result
        assert "写作技术" in result

    def test_load_unknown_key_returns_generic_default(self):
        """测试未知key返回通用默认prompt"""
        loader = PromptLoader()
        result = loader.load("nonexistent_dimension")
        assert "nonexistent_dimension" in result

    def test_layer_prompts_coverage(self):
        """确认所有技术维度都有默认模板"""
        loader = PromptLoader()
        for key in PromptLoader.LAYER_PROMPTS:
            result = loader.load(key)
            assert len(result) > 10, f"{key} 的默认模板过短"

    def test_literary_prompts_coverage(self):
        """确认所有文学感知维度都有默认模板"""
        loader = PromptLoader()
        for key in PromptLoader.LITERARY_PROMPTS:
            result = loader.load(key)
            assert len(result) > 10, f"{key} 的默认模板过短"


class TestOpenAILLMClient:
    """OpenAILLMClient单元测试"""

    @patch("scripts.llm_analyzer.OpenAI")
    def test_chat_success(self, mock_openai_cls):
        """测试正常调用chat方法"""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "AI回复内容"
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        client = OpenAILLMClient(
            api_key="test-key",
            base_url="https://api.test.com/v1",
            model="test-model",
        )
        result = client.chat("你好", context="上下文", system_prompt="系统提示")

        assert result == "AI回复内容"
        mock_client.chat.completions.create.assert_called_once()

    @patch("scripts.llm_analyzer.OpenAI", None)
    def test_missing_dependency_raises(self):
        """测试缺少openai库时抛出ImportError"""
        with patch.dict("sys.modules", {"openai": None}):
            # 需要重新导入才能触发检查
            import importlib
            import scripts.llm_analyzer as la
            importlib.reload(la)
            with pytest.raises(ImportError, match="openai"):
                la.OpenAILLMClient()


class TestLLMAnalyzer:
    """LLMAnalyzer核心逻辑测试"""

    def _make_mock_responses(self) -> dict[str, str]:
        """生成各维度的模拟响应数据"""
        return {
            "engineering": json.dumps({
                "technical_description": "结构清晰，节奏把控成熟",
                "literary_description": "如行云流水般的叙事韵律",
                "writing_rule": "每3章设置一个小高潮",
                "stability": "high",
                "evidence": ["第一章伏笔", "第三章爆发"],
            }),
            "protagonist": json.dumps({
                "moral_coordinates": {"正义感": 8, " pragmatism": 6},
                "decision_patterns": {"危机": "先保全自己"},
                "bottom_lines": ["不伤害无辜"],
                "loss_tolerance_type": "低",
                "revenge_scale_type": "以牙还牙",
                "emotional_temperature": {"常态": "冷静"},
            }),
            "language": json.dumps({
                "avg_sentence_length": 18.5,
                "short_sentence_ratio": 0.35,
                "dialogue_ratio": 0.4,
                "top_words": [("力量", 0.02)],
            }),
            "emotion_wave": json.dumps({
                "suppression_texture": "内敛压抑",
                "release_style": "爆发式释放",
                "aftermath_mode": "余韵悠长",
            }),
            "scenes": json.dumps({
                "scene_recipes": {"战斗场景": "感官+动作交替"},
            }),
            "themes": json.dumps({
                "author_beliefs": {"核心信念": "成长源于痛苦"},
            }),
        }

    def test_select_chapters_for_engineering_uses_all(self, sample_chapters):
        """工程维度应选择全部章节"""
        analyzer = LLMAnalyzer(MockLLMClient())
        selected = analyzer._select_chapters_for_layer(sample_chapters, "engineering")
        assert len(selected) == 4

    def test_select_chapters_for_plot_filters_by_type(self, sample_chapters):
        """情节维度只选高潮和开篇"""
        analyzer = LLMAnalyzer(MockLLMClient())
        selected = analyzer._select_chapters_for_layer(sample_chapters, "plot")
        types = {ch.layer_type for ch in selected}
        assert types == {ChapterType.CLIMAX, ChapterType.OPENING}

    def test_select_chapters_fallback_when_no_match(self, sample_chapters):
        """筛选结果为空时回退到全部章节"""
        chapters_no_match = [
            Chapter(1, "test", "content", 100, layer_type=ChapterType.DAILY),
        ]
        analyzer = LLMAnalyzer(MockLLMClient())
        selected = analyzer._select_chapters_for_layer(chapters_no_match, "plot")
        assert len(selected) == 1

    def test_merge_chapters_within_limit(self, sample_chapters):
        """字符数在限制内时保留完整内容"""
        analyzer = LLMAnalyzer(MockLLMClient())
        context = analyzer._merge_chapters_for_context(sample_chapters, max_chars=5000)
        assert "截断" not in context
        assert "第1章 开篇" in context

    def test_merge_chapters_truncates_when_over_limit(self, sample_chapters):
        """超出字符限制时截断章节"""
        small_chapters = [Chapter(i, f"第{i}章", "内容" * 1000, 4000) for i in range(5)]
        analyzer = LLMAnalyzer(MockLLMClient())
        context = analyzer._merge_chapters_for_context(small_chapters, max_chars=3000)
        assert "截断" in context

    def test_parse_json_response(self):
        """正确解析JSON格式响应"""
        analyzer = LLMAnalyzer(MockLLMClient())
        raw = '{"key": "value", "nested": {"a": 1}}'
        result = analyzer._parse_response(raw, "test")
        assert result["key"] == "value"
        assert result["nested"]["a"] == 1

    def test_parse_text_response_fallback(self):
        """非JSON响应包装为字典返回"""
        analyzer = LLMAnalyzer(MockLLMClient())
        raw = "这是一段纯文本分析结果"
        result = analyzer._parse_response(raw, "test")
        assert result["raw_response"] == raw
        assert result["layer"] == "test"

    def test_merge_protagonist_data(self):
        """主角数据正确合并到ProtagonistProfile"""
        analyzer = LLMAnalyzer(MockLLMClient())
        result = AnalysisResult(book_title="test")
        data = {
            "moral_coordinates": {"正义": 9},
            "decision_patterns": {"战斗": "正面硬刚"},
            "bottom_lines": ["绝不背叛"],
            "loss_tolerance_type": "高",
        }
        analyzer._merge_layer_result(result, "protagonist", data)

        assert result.protagonist.moral_coordinates["正义"] == 9
        assert result.protagonist.loss_tolerance_type == "高"
        assert "绝不背叛" in result.protagonist.bottom_lines

    def test_merge_language_data(self):
        """语言特征数据正确合并到LanguageProfile"""
        analyzer = LLMAnalyzer(MockLLMClient())
        result = AnalysisResult(book_title="test")
        data = {
            "avg_sentence_length": 20.0,
            "short_sentence_ratio": 0.4,
            "signature_sentences": ["他笑了，眼中闪过一丝寒光"],
        }
        analyzer._merge_layer_result(result, "language", data)

        assert result.language.avg_sentence_length == 20.0
        assert result.language.short_sentence_ratio == 0.4
        assert "寒光" in result.language.signature_sentences[0]

    def test_merge_emotion_wave_data(self):
        """情绪波纹数据正确合并到EmotionWaveProfile"""
        analyzer = LLMAnalyzer(MockLLMClient())
        result = AnalysisResult(book_title="test")
        data = {
            "suppression_texture": "如冰封湖面",
            "release_style": "火山喷发",
        }
        analyzer._merge_layer_result(result, "emotion_wave", data)

        assert result.emotion_wave.suppression_texture == "如冰封湖面"
        assert result.emotion_wave.release_style == "火山喷发"

    def test_merge_scene_recipes(self):
        """场景配方正确合并到字典"""
        analyzer = LLMAnalyzer(MockLLMClient())
        result = AnalysisResult(book_title="test")
        data = {"scene_recipes": {"战斗": "快节奏短句+感官描写"}}
        analyzer._merge_layer_result(result, "scenes", data)

        assert "战斗" in result.scene_recipes
        assert "快节奏" in result.scene_recipes["战斗"]

    def test_merge_creates_style_feature(self):
        """普通维度创建StyleFeature对象"""
        analyzer = LLMAnalyzer(MockLLMClient())
        result = AnalysisResult(book_title="test")
        data = {
            "technical_description": "情节紧凑",
            "literary_description": "如弓弦紧绷",
            "writing_rule": "悬念不超过3章",
            "stability": "high",
        }
        analyzer._merge_layer_result(result, "plot", data)

        assert len(result.features) == 1
        feature = result.features[0]
        assert feature.name == "情节构建"
        assert feature.stability == Stability.HIGH
        assert "紧凑" in feature.technical_description

    def test_analyze_single_layer(self, sample_book):
        """单层分析返回结构化数据"""
        mock_client = MockLLMClient(responses={
            "plot": json.dumps({"technical_description": "测试"}),
        })
        analyzer = LLMAnalyzer(mock_client)
        result = analyzer.analyze_layer(sample_book, "plot")

        assert isinstance(result, dict)
        assert len(mock_client.call_history) == 1

    def test_analyze_book_full_pipeline(self, sample_book):
        """全量分析流程端到端测试"""
        responses = self._make_mock_responses()
        mock_client = MockLLMClient(responses=responses)
        analyzer = LLMAnalyzer(mock_client, enable_literary=False)

        result = analyzer.analyze_book(sample_book)

        assert isinstance(result, AnalysisResult)
        assert result.book_title == "测试小说"
        assert len(result.features) >= 1
        assert isinstance(result.protagonist, ProtagonistProfile)
        assert isinstance(result.language, LanguageProfile)
        assert mock_client.call_history

    def test_enable_literary_includes_extra_layers(self, sample_book):
        """启用文学感知时包含额外维度且调用次数增加"""
        base_responses = self._make_mock_responses()
        literary_responses = {
            "emotion_wave": json.dumps({"suppression_texture": "内敛", "release_style": "爆发"}),
            "atmosphere": json.dumps({"technical_description": "氛围分析"}),
            "humanity": json.dumps({"technical_description": "人性分析"}),
            "mourning": json.dumps({"technical_description": "哀悼分析"}),
            "rhythm": json.dumps({"technical_description": "节奏分析"}),
            "signature": json.dumps({"technical_description": "签名分析"}),
        }
        all_responses = {**base_responses, **literary_responses}
        mock_client = MockLLMClient(responses=all_responses)

        analyzer_off = LLMAnalyzer(mock_client, enable_literary=False)
        result_off = analyzer_off.analyze_book(sample_book)
        calls_off = len(mock_client.call_history)

        mock_client2 = MockLLMClient(responses=all_responses)
        analyzer_on = LLMAnalyzer(mock_client2, enable_literary=True)
        result_on = analyzer_on.analyze_book(sample_book)
        calls_on = len(mock_client2.call_history)

        assert calls_on > calls_off
        assert len(result_on.features) >= 10

    def test_analysis_failure_is_graceful(self, sample_book):
        """单层分析失败不影响整体流程"""
        failing_client = MockLLMClient()
        original_chat = failing_client.chat

        def failing_chat(*args, **kwargs):
            if "protagonist" in str(args):
                raise RuntimeError("模拟API错误")
            return original_chat(*args, **kwargs)

        failing_client.chat = failing_chat
        analyzer = LLMAnalyzer(failing_client, enable_literary=False)

        result = analyzer.analyze_book(sample_book)
        assert result.book_title == "测试小说"

    def test_overall_profile_populated(self, sample_book):
        """overall_profile从工程或体验维度提取"""
        mock_client = MockLLMClient(responses={
            "engineering": json.dumps({"technical_description": "整体评价文本" * 50}),
        })
        analyzer = LLMAnalyzer(mock_client, enable_literary=False)
        result = analyzer.analyze_book(sample_book)

        assert len(result.overall_profile) > 0


class TestIntegration:
    """集成测试：验证组件协作"""

    def test_full_workflow_with_real_loader(self, sample_book, tmp_path):
        """使用真实PromptLoader的完整工作流"""
        (tmp_path / "engineering.txt").write_text("请分析{content}", encoding="utf-8")
        loader = PromptLoader(prompts_dir=str(tmp_path))

        mock_client = MockLLMClient(responses={
            "analyze": json.dumps({"technical_description": "OK"}),
        })
        analyzer = LLMAnalyzer(mock_client, prompt_loader=loader, enable_literary=False)

        result = analyzer.analyze_book(sample_book)
        assert isinstance(result, AnalysisResult)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
