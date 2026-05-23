"""交叉验证模块测试"""
import pytest

from scripts.cross_validator import CrossValidator
from scripts.models import (
    AnalysisResult, CrossBookResult, StyleFeature, Stability,
    ProtagonistProfile, LanguageProfile, EmotionWaveProfile,
)


@pytest.fixture
def validator():
    """创建验证器实例"""
    return CrossValidator()


@pytest.fixture
def sample_features():
    """创建示例特征数据"""
    return {
        "short_sentences": StyleFeature(
            name="短句节奏",
            stability=Stability.LOW,
            applies_to=["战斗场景"],
            technical_description="平均句长8-12字",
            literary_description="如刀锋般锐利",
            writing_rule="战斗段落必须使用短句",
            evidence=["书中多处使用短句"],
        ),
        "inner_monologue": StyleFeature(
            name="内心独白",
            stability=Stability.LOW,
            applies_to=["情感场景"],
            technical_description="第一人称内心活动",
            literary_description="深沉内省",
            writing_rule="重要决策前插入内心独白",
            evidence=["主角经常自问"],
        ),
        "dialogue_style": StyleFeature(
            name="对话风格",
            stability=Stability.LOW,
            applies_to=["日常场景"],
            technical_description="口语化、接地气",
            literary_description="市井气息浓厚",
            writing_rule="对话要符合角色身份",
            evidence=["角色说话风格鲜明"],
        ),
    }


def create_test_result(book_title: str, features: list[StyleFeature], **kwargs) -> AnalysisResult:
    """辅助函数：创建测试用的分析结果"""
    return AnalysisResult(
        book_title=book_title,
        features=features,
        overall_profile=kwargs.get('overall_profile', f"{book_title}的整体风格"),
        protagonist=kwargs.get('protagonist', ProtagonistProfile()),
        language=kwargs.get('language', LanguageProfile()),
        emotion_wave=kwargs.get('emotion_wave', EmotionWaveProfile()),
        scene_recipes=kwargs.get('scene_recipes', {}),
        author_beliefs=kwargs.get('author_beliefs', {}),
    )


class TestCrossValidatorValidate:
    """测试 validate 主方法"""

    def test_empty_results(self, validator):
        """空结果列表应返回空的 CrossBookResult"""
        result = validator.validate([])
        assert result == CrossBookResult()

    def test_single_book(self, validator, sample_features):
        """单本书所有特征应为 LOW 稳定度，归入 book_specific"""
        features = [sample_features["short_sentences"]]
        analysis = create_test_result("测试书籍1", features)

        result = validator.validate([analysis])

        assert len(result.stable_features) == 0
        assert "测试书籍1" in result.book_specific_features
        assert len(result.book_specific_features["测试书籍1"]) == 1

    def test_two_books_shared_feature(self, validator, sample_features):
        """两本书共有的特征应为 MEDIUM 稳定度"""
        shared_feature = sample_features["short_sentences"]

        book1 = create_test_result("书籍A", [shared_feature])
        book2 = create_test_result("书籍B", [shared_feature])

        result = validator.validate([book1, book2])

        assert len(result.stable_features) == 1
        assert result.stable_features[0].stability == Stability.MEDIUM
        assert result.stable_features[0].name == "短句节奏"

    def test_three_books_high_stability(self, validator, sample_features):
        """三本书共有的特征应为 HIGH 稳定度"""
        shared_feature = sample_features["short_sentences"]

        book1 = create_test_result("书籍A", [shared_feature])
        book2 = create_test_result("书籍B", [shared_feature])
        book3 = create_test_result("书籍C", [shared_feature])

        result = validator.validate([book1, book2, book3])

        assert len(result.stable_features) == 1
        assert result.stable_features[0].stability == Stability.HIGH

    def test_mixed_stability(self, validator, sample_features):
        """混合稳定度：3本共有(HIGH)、2本共有(MEDIUM)、1本独有(LOW)"""
        high_feature = sample_features["short_sentences"]
        medium_feature = sample_features["inner_monologue"]
        low_feature = sample_features["dialogue_style"]

        book1 = create_test_result("书籍A", [high_feature, medium_feature, low_feature])
        book2 = create_test_result("书籍B", [high_feature, medium_feature])
        book3 = create_test_result("书籍C", [high_feature])

        result = validator.validate([book1, book2, book3])

        # 应该有2个稳定特征（HIGH + MEDIUM）
        assert len(result.stable_features) == 2

        stabilities = {f.name: f.stability for f in result.stable_features}
        assert stabilities["短句节奏"] == Stability.HIGH
        assert stabilities["内心独白"] == Stability.MEDIUM

        # LOW 特征应归入 book_specific
        assert "书籍A" in result.book_specific_features
        book_a_specific = result.book_specific_features["书籍A"]
        assert any(f.name == "对话风格" for f in book_a_specific)


class TestCrossValidatorMergeFeatures:
    """测试特征合并逻辑"""

    def test_merge_keeps_longest_descriptions(self, validator):
        """合并时应保留最长的描述"""
        feature_v1 = StyleFeature(
            name="测试特征",
            stability=Stability.LOW,
            technical_description="简短描述",
            literary_description="简单文学描述",
            writing_rule="基本规则",
        )
        feature_v2 = StyleFeature(
            name="测试特征",
            stability=Stability.LOW,
            technical_description="这是更详细的技术描述，包含更多细节信息",
            literary_description="更加丰富和深刻的文学质感描述",
            writing_rule="这是更具体和可操作的写作规则指导",
        )

        occurrences = [
            (create_test_result("书1", []), feature_v1),
            (create_test_result("书2", []), feature_v2),
        ]

        merged = validator._merge_features("测试特征", occurrences, Stability.MEDIUM)

        assert merged.technical_description == feature_v2.technical_description
        assert merged.literary_description == feature_v2.literary_description
        assert merged.writing_rule == feature_v2.writing_rule

    def test_merge_combines_applies_to(self, validator):
        """合并时应该组合所有适用场景"""
        feature_v1 = StyleFeature(
            name="多场景特征",
            stability=Stability.LOW,
            applies_to=["战斗场景"],
        )
        feature_v2 = StyleFeature(
            name="多场景特征",
            stability=Stability.LOW,
            applies_to=["情感场景", "日常场景"],
        )

        occurrences = [
            (create_test_result("书1", []), feature_v1),
            (create_test_result("书2", []), feature_v2),
        ]

        merged = validator._merge_features("多场景特征", occurrences, Stability.MEDIUM)

        assert set(merged.applies_to) == {"战斗场景", "情感场景", "日常场景"}

    def test_merge_combines_evidence(self, validator):
        """合并时应该收集所有证据"""
        feature_v1 = StyleFeature(
            name="证据特征",
            stability=Stability.LOW,
            evidence=["证据1", "证据2"],
        )
        feature_v2 = StyleFeature(
            name="证据特征",
            stability=Stability.LOW,
            evidence=["证据3"],
        )

        occurrences = [
            (create_test_result("书1", []), feature_v1),
            (create_test_result("书2", []), feature_v2),
        ]

        merged = validator._merge_features("证据特征", occurrences, Stability.MEDIUM)

        assert len(merged.evidence) == 3
        assert "证据1" in merged.evidence
        assert "证据3" in merged.evidence


class TestCrossValidatorStatistics:
    """测试统计信息聚合"""

    def test_aggregates_basic_stats(self, validator, sample_features):
        """正确聚合基础统计信息"""
        book1 = create_test_result(
            "书籍A",
            [sample_features["short_sentences"]],
        )
        book2 = create_test_result(
            "书籍B",
            [sample_features["inner_monologue"]],
        )

        result = validator.validate([book1, book2])

        assert result.books_analyzed == ["书籍A", "书籍B"]
        assert len(result.books_analyzed) == 2

    def test_handles_missing_stats(self, validator, sample_features):
        """处理缺少统计字段的情况（向后兼容）"""
        book = create_test_result("测试书", [sample_features["short_sentences"]])

        result = validator.validate([book])

        # 不应该报错，默认为0
        assert result.total_chars >= 0
        assert result.total_chapters >= 0


class TestCrossValidatorEdgeCases:
    """测试边界情况"""

    def test_duplicate_features_in_same_book(self, validator):
        """同一本书中有同名特征（虽然不应该发生）"""
        feature = StyleFeature(
            name="重复特征",
            stability=Stability.LOW,
            technical_description="版本1",
        )
        feature_dup = StyleFeature(
            name="重复特征",
            stability=Stability.LOW,
            technical_description="版本2",
        )

        book = create_test_result("测试书", [feature, feature_dup])
        result = validator.validate([book])

        # 同一本书的同名特征被计数为2次，因此变为 MEDIUM 稳定度
        assert len(result.stable_features) == 1
        assert result.stable_features[0].stability == Stability.MEDIUM
        assert result.stable_features[0].name == "重复特征"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
