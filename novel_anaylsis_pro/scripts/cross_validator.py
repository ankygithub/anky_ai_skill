"""交叉验证模块 - 多本书对比分析结果，标注每个特征的稳定度"""
from collections import defaultdict
from typing import Optional

from .models import AnalysisResult, CrossBookResult, StyleFeature, Stability


class CrossValidator:
    """跨书籍验证器

    核心功能：
    1. 聚合多本书的分析结果
    2. 按特征名统计出现次数
    3. 根据出现频次标注稳定度（HIGH/MEDIUM/LOW）
    4. 合并同名特征，保留最完整描述
    """

    def validate(self, results: list[AnalysisResult]) -> CrossBookResult:
        """执行交叉验证

        Args:
            results: 多本书的单书分析结果列表

        Returns:
            CrossBookResult: 跨书籍验证结果，包含稳定特征和报告数据
        """
        if not results:
            return CrossBookResult()

        # 收集基础统计信息
        books_analyzed = [r.book_title for r in results]
        total_chars = sum(getattr(r, 'total_chars', 0) for r in results)
        total_chapters = sum(getattr(r, 'total_chapters', 0) for r in results)

        # 按特征名聚合出现情况
        feature_occurrences = self._aggregate_features(results)

        # 计算稳定度并合并特征
        stable_features = []
        book_specific_features = defaultdict(list)

        for feature_name, occurrences in feature_occurrences.items():
            count = len(occurrences)
            stability = self._determine_stability(count)

            if stability == Stability.LOW:
                # 低稳定度特征归入各书专属特征
                for result, feature in occurrences:
                    book_specific_features[result.book_title].append(feature)
            else:
                # 高/中稳定度特征进行合并
                merged_feature = self._merge_features(
                    feature_name, occurrences, stability
                )
                stable_features.append(merged_feature)

        # 聚合场景配方和作者信念
        scene_recipes = {}
        author_beliefs = {}
        for r in results:
            if r.scene_recipes:
                scene_recipes.update(r.scene_recipes)
            if r.author_beliefs:
                author_beliefs.update(r.author_beliefs)

        # 构建结果对象
        cross_result = CrossBookResult(
            author_name=self._extract_author_name(results),
            books_analyzed=books_analyzed,
            total_chars=total_chars,
            total_chapters=total_chapters,
            stable_features=stable_features,
            book_specific_features=dict(book_specific_features),
            scene_recipes=scene_recipes,
            author_beliefs=author_beliefs,
        )

        return cross_result

    def _aggregate_features(
        self, results: list[AnalysisResult]
    ) -> dict[str, list[tuple[AnalysisResult, StyleFeature]]]:
        """按特征名聚合所有书的特征

        返回格式：{特征名: [(分析结果, 特征对象), ...]}
        """
        feature_map = defaultdict(list)

        for result in results:
            for feature in result.features:
                feature_map[feature.name].append((result, feature))

        return dict(feature_map)

    def _determine_stability(self, count: int) -> Stability:
        """根据出现次数确定稳定度

        规则：
        - HIGH: 3本及以上出现
        - MEDIUM: 2本出现
        - LOW: 仅1本出现
        """
        if count >= 3:
            return Stability.HIGH
        elif count == 2:
            return Stability.MEDIUM
        else:
            return Stability.LOW

    def _merge_features(
        self,
        name: str,
        occurrences: list[tuple[AnalysisResult, StyleFeature]],
        stability: Stability,
    ) -> StyleFeature:
        """合并同名特征，保留最完整描述

        合并策略：
        - 适用场景：取所有出现的场景的并集
        - 技术描述：选择最长的（通常最详细）
        - 文学描述：选择最长的（通常最丰富）
        - 写作规则：选择最长的（通常最具体）
        - 证据：合并所有证据
        """
        all_applies_to = set()
        best_technical = ""
        best_literary = ""
        best_rule = ""
        all_evidence = []

        for _, feature in occurrences:
            # 合并适用场景
            if feature.applies_to:
                all_applies_to.update(feature.applies_to)

            # 选择最长的技术描述
            if len(feature.technical_description) > len(best_technical):
                best_technical = feature.technical_description

            # 选择最长的文学描述
            if len(feature.literary_description) > len(best_literary):
                best_literary = feature.literary_description

            # 选择最长的写作规则
            if len(feature.writing_rule) > len(best_rule):
                best_rule = feature.writing_rule

            # 合并证据
            if feature.evidence:
                all_evidence.extend(feature.evidence)

        return StyleFeature(
            name=name,
            stability=stability,
            applies_to=list(all_applies_to),
            technical_description=best_technical,
            literary_description=best_literary,
            writing_rule=best_rule,
            evidence=all_evidence,
        )

    def _extract_author_name(self, results: list[AnalysisResult]) -> str:
        """从分析结果中提取作者名

        策略：尝试从第一本书的书名中提取，
        如果无法提取则返回空字符串
        """
        if not results:
            return ""

        # 这里可以扩展更智能的提取逻辑
        # 目前返回空字符串，由外部设置或后续处理
        return ""
