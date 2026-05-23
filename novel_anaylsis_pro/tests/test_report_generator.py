"""报告生成器测试"""
import json
import tempfile
from pathlib import Path

import pytest

from scripts.report_generator import ReportGenerator
from scripts.models import CrossBookResult, StyleFeature, Stability


@pytest.fixture
def generator():
    """创建报告生成器实例"""
    return ReportGenerator()


@pytest.fixture
def sample_cross_result():
    """创建示例 CrossBookResult 数据"""
    return CrossBookResult(
        author_name="测试作者",
        books_analyzed=["书籍A", "书籍B", "书籍C"],
        total_chars=500000,
        total_chapters=500,
        stable_features=[
            StyleFeature(
                name="短句节奏",
                stability=Stability.HIGH,
                applies_to=["战斗场景"],
                technical_description="平均句长8-12字",
                literary_description="如刀锋般锐利",
                writing_rule="战斗段落必须使用短句，营造紧迫感",
                evidence=["书中多处使用短句"],
            ),
            StyleFeature(
                name="内心独白",
                stability=Stability.MEDIUM,
                applies_to=["情感场景", "决策场景"],
                technical_description="第一人称内心活动",
                literary_description="深沉内省",
                writing_rule="重要决策前插入内心独白段落",
            ),
        ],
        book_specific_features={
            "书籍A": [
                StyleFeature(
                    name="特殊设定A",
                    stability=Stability.LOW,
                    literary_description="仅出现在第一本书",
                )
            ]
        },
    )


class TestReportGeneratorFullReport:
    """测试完整报告生成"""

    def test_contains_17_chapters(self, generator, sample_cross_result):
        """完整报告应包含17个章节"""
        report = generator.generate_full_report(sample_cross_result)

        for i in range(1, 18):
            assert f"第{i}章" in report, f"缺少第{i}章"

    def test_section_1_scope(self, generator, sample_cross_result):
        """第1章应包含正确的统计信息"""
        report = generator.generate_full_report(sample_cross_result)

        assert "3 本" in report  # 作品数量
        assert "500,000" in report or "500000" in report  # 总字数
        assert "500" in report  # 总章数
        assert "书籍A" in report
        assert "书籍B" in report
        assert "书籍C" in report

    def test_section_2_overview(self, generator, sample_cross_result):
        """第2章应包含高稳定度特征"""
        report = generator.generate_full_report(sample_cross_result)

        assert "总体风格画像" in report
        assert "短句节奏" in report  # HIGH 特征应出现
        assert "如刀锋般锐利" in report  # 文学描述

    def test_section_3_table(self, generator, sample_cross_result):
        """第3章应为表格格式"""
        report = generator.generate_full_report(sample_cross_result)

        assert "| 特征 | 稳定度 |" in report
        assert "HIGH" in report
        assert "MEDIUM" in report
        assert "短句节奏" in report
        assert "内心独白" in report

    def test_section_17_boundaries(self, generator, sample_cross_result):
        """第17章应包含风险与边界警告"""
        report = generator.generate_full_report(sample_cross_result)

        assert "不得复制原文" in report
        assert "不得冒充作者" in report
        assert "法律与伦理边界" in report


class TestReportGeneratorStyleCard:
    """测试 AI 风格速查卡"""

    def test_contains_all_sections(self, generator, sample_cross_result):
        """速查卡应包含所有必要部分"""
        card = generator.generate_style_card(sample_cross_result)

        assert "整体气质" in card
        assert "强约束规则" in card
        assert "禁区清单" in card
        assert "禁止复制原文" in card
        assert "禁止冒充作者" in card

    def test_high_features_in_temperament(self, generator, sample_cross_result):
        """高稳定度特征应出现在整体气质部分"""
        card = generator.generate_style_card(sample_cross_result)

        assert "短句节奏" in card
        assert "如刀锋般锐利" in card

    def test_writing_rules_in_constraints(self, generator, sample_cross_result):
        """写作规则应出现在强约束部分"""
        card = generator.generate_style_card(sample_cross_result)

        assert "战斗段落必须使用短句" in card
        assert "重要决策前插入内心独白" in card

    def test_four_forbidden_items(self, generator, sample_cross_result):
        """应有4条固定禁令"""
        card = generator.generate_style_card(sample_cross_result)

        forbidden_count = card.count("禁止")
        assert forbidden_count >= 4


class TestReportGeneratorSceneTemplates:
    """测试场景模板库"""

    def test_contains_6_templates(self, generator, sample_cross_result):
        """应包含6种场景模板"""
        templates = generator.generate_scene_templates(sample_cross_result)

        expected_templates = [
            "战斗场景",
            "日常场景",
            "对话场景",
            "抒情场景",
            "打脸场景",
            "升级修炼场景",
        ]

        for template_name in expected_templates:
            assert template_name in templates, f"缺少 {template_name} 模板"

    def test_template_has_placeholders(self, generator, sample_cross_result):
        """模板应包含填空占位符"""
        templates = generator.generate_scene_templates(sample_cross_result)

        assert "[环境描写" in templates
        assert "[角色状态" in templates
        assert "[动作序列" in templates

    def test_usage_instructions(self, generator, sample_cross_result):
        """应包含使用说明"""
        templates = generator.generate_scene_templates(sample_cross_result)

        assert "使用说明" in templates
        assert "填空模板" in templates


class TestReportGeneratorChecklist:
    """测试检查清单"""

    def test_base_10_items(self, generator, sample_cross_result):
        """基础清单应有10项"""
        checklist = generator.generate_checklist(sample_cross_result)

        base_checks = [str(i) + "." for i in range(1, 11)]
        for check_prefix in base_checks:
            assert check_prefix in checklist

    def test_feature_specific_items(self, generator, sample_cross_result):
        """高/中稳定度特征应追加专属检查项"""
        checklist = generator.generate_checklist(sample_cross_result)

        assert "短句节奏" in checklist
        assert "内心独白" in checklist
        assert "战斗段落必须使用短句" in checklist

    def test_total_count(self, generator, sample_cross_result):
        """总项数应为12（10基础 + 2特征）"""
        checklist = generator.generate_checklist(sample_cross_result)

        assert "12 项检查" in checklist or "总计.*12" in checklist


class TestReportGeneratorJSON:
    """测试 JSON 输出"""

    def test_valid_json(self, generator, sample_cross_result):
        """输出应是有效的 JSON"""
        json_str = generator.generate_json(sample_cross_result)

        data = json.loads(json_str)
        assert isinstance(data, dict)

    def test_required_fields(self, generator, sample_cross_result):
        """JSON 应包含所有必需字段"""
        json_str = generator.generate_json(sample_cross_result)
        data = json.loads(json_str)

        required_fields = [
            "analysis_scope",
            "stable_features",
            "style_prompt",
            "revision_checklist",
            "boundaries",
        ]

        for field in required_fields:
            assert field in data, f"缺少字段: {field}"

    def test_analysis_scope_content(self, generator, sample_cross_result):
        """analysis_scope 应包含正确信息"""
        json_str = generator.generate_json(sample_cross_result)
        data = json.loads(json_str)

        scope = data["analysis_scope"]
        assert scope["author_name"] == "测试作者"
        assert scope["book_count"] == 3
        assert scope["total_chars"] == 500000
        assert len(scope["books_analyzed"]) == 3

    def test_stable_features_structure(self, generator, sample_cross_result):
        """stable_features 应有正确的结构"""
        json_str = generator.generate_json(sample_cross_result)
        data = json.loads(json_str)

        features = data["stable_features"]
        assert len(features) == 2

        feature = features[0]
        assert "name" in feature
        assert "stability" in feature
        assert "applies_to" in feature
        assert "writing_rule" in feature

    def test_boundaries_content(self, generator, sample_cross_result):
        """boundaries 应包含4条限制"""
        json_str = generator.generate_json(sample_cross_result)
        data = json.loads(json_str)

        boundaries = data["boundaries"]
        assert "no_copying" in boundaries
        assert "no_impersonation" in boundaries
        assert "commercial_use" in boundaries
        assert "attribution_required" in boundaries

    def test_metadata_timestamp(self, generator, sample_cross_result):
        """metadata 应包含时间戳"""
        json_str = generator.generate_json(sample_cross_result)
        data = json.loads(json_str)

        assert "metadata" in data
        assert "generated_at" in data["metadata"]
        assert "version" in data["metadata"]

    def test_unicode_support(self, generator, sample_cross_result):
        """JSON 应支持中文（非转义）"""
        json_str = generator.generate_json(sample_cross_result)

        assert "\\u" not in json_str or "测试作者" in json_str
        data = json.loads(json_str)
        assert data["analysis_scope"]["author_name"] == "测试作者"


class TestReportGeneratorGenerateAll:
    """测试批量生成功能"""

    def test_generates_all_files(self, generator, sample_cross_result):
        """应生成5个文件"""
        with tempfile.TemporaryDirectory() as tmpdir:
            files = generator.generate_all(sample_cross_result, tmpdir)

            assert len(files) == 5

            filenames = [Path(f).name for f in files]
            assert any("风格分析报告" in f for f in filenames)
            assert any("AI风格速查卡" in f for f in filenames)
            assert any("场景模板库" in f for f in filenames)
            assert any("写作检查清单" in f for f in filenames)
            assert any("风格数据" in f for f in filenames)

    def test_files_are_readable(self, generator, sample_cross_result):
        """生成的文件应该可读且非空"""
        with tempfile.TemporaryDirectory() as tmpdir:
            files = generator.generate_all(sample_cross_result, tmpdir)

            for file_path in files:
                path = Path(file_path)
                assert path.exists(), f"文件不存在: {file_path}"
                content = path.read_text(encoding="utf-8")
                assert len(content) > 0, f"文件为空: {file_path}"

    def test_creates_output_directory(self, generator, sample_cross_result):
        """如果目录不存在应自动创建"""
        with tempfile.TemporaryDirectory() as tmpdir:
            new_dir = Path(tmpdir) / "subdir" / "output"
            files = generator.generate_all(sample_cross_result, str(new_dir))

            assert new_dir.exists()
            assert len(files) > 0

    def test_file_naming_convention(self, generator, sample_cross_result):
        """文件名应遵循命名规范：{author}_{类型}_{timestamp}.{ext}"""
        import re

        with tempfile.TemporaryDirectory() as tmpdir:
            files = generator.generate_all(sample_cross_result, tmpdir)

            for file_path in files:
                filename = Path(file_path).name
                pattern = r"^测试作者_.+_\d{8}_\d{6}\.(md|json)$"
                assert re.match(pattern, filename), \
                    f"文件名不符合规范: {filename}"


class TestReportGeneratorEdgeCases:
    """测试边界情况"""

    def test_empty_cross_result(self, generator):
        """空的 CrossBookResult 不应报错"""
        empty_cr = CrossBookResult()

        report = generator.generate_full_report(empty_cr)
        assert isinstance(report, str)
        assert len(report) > 0

        card = generator.generate_style_card(empty_cr)
        assert isinstance(card, str)

        checklist = generator.generate_checklist(empty_cr)
        assert "10 项检查" in checklist or "总计.*10" in checklist

        json_str = generator.generate_json(empty_cr)
        data = json.loads(json_str)
        assert data["analysis_scope"]["book_count"] == 0

    def test_no_stable_features(self, generator):
        """没有稳定特征时应正常处理"""
        cr = CrossBookResult(
            author_name="无特征作者",
            books_analyzed=["单本书"],
            stable_features=[],
        )

        report = generator.generate_full_report(cr)
        assert "暂无" in report or "无足够" in report

    def test_no_author_name(self, generator):
        """没有作者名时应显示'未知作者'"""
        cr = CrossBookResult(
            author_name="",
            books_analyzed=["书1"],
        )

        card = generator.generate_style_card(cr)
        assert "未知作者" in card


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
