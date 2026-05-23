"""报告生成器 - 从 CrossBookResult 生成多份分析产物"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .models import CrossBookResult, StyleFeature, Stability


class ReportGenerator:
    """报告生成器

    职责：
    1. 将 CrossBookResult 转换为多种格式的输出
    2. 生成完整 Markdown 报告（17个章节）
    3. 生成 AI 风格速查卡（压缩版 system prompt）
    4. 生成场景模板库（6种填空模板）
    5. 生成写作检查清单
    6. 导出结构化 JSON 数据
    """

    def generate_all(
        self,
        cross_result: CrossBookResult,
        output_dir: str,
    ) -> list[str]:
        """生成全部产物并写入文件

        Args:
            cross_result: 跨书籍验证结果
            output_dir: 输出目录路径

        Returns:
            生成的文件路径列表
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        author = cross_result.author_name or "未知作者"
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        generated_files = []

        # 1. 完整报告
        report_md = self.generate_full_report(cross_result)
        report_file = output_path / f"{author}_风格分析报告_{timestamp}.md"
        report_file.write_text(report_md, encoding="utf-8")
        generated_files.append(str(report_file))

        # 2. AI速查卡
        style_card = self.generate_style_card(cross_result)
        card_file = output_path / f"{author}_AI风格速查卡_{timestamp}.md"
        card_file.write_text(style_card, encoding="utf-8")
        generated_files.append(str(card_file))

        # 3. 场景模板库
        templates = self.generate_scene_templates(cross_result)
        template_file = output_path / f"{author}_场景模板库_{timestamp}.md"
        template_file.write_text(templates, encoding="utf-8")
        generated_files.append(str(template_file))

        # 4. 检查清单
        checklist = self.generate_checklist(cross_result)
        checklist_file = output_path / f"{author}_写作检查清单_{timestamp}.md"
        checklist_file.write_text(checklist, encoding="utf-8")
        generated_files.append(str(checklist_file))

        # 5. JSON数据
        json_data = self.generate_json(cross_result)
        json_file = output_path / f"{author}_风格数据_{timestamp}.json"
        json_file.write_text(json_data, encoding="utf-8")
        generated_files.append(str(json_file))

        return generated_files

    def generate_full_report(self, cr: CrossBookResult) -> str:
        """生成完整 Markdown 报告（17个章节）

        章节结构：
        1. 分析范围
        2. 总体风格画像
        3. 跨作品稳定特征表
        4-16. 各层详细分析（预留，由 LLM 填充）
        17. 风险与边界
        """
        sections = []

        # 第1章：分析范围
        sections.append(self._section_1_scope(cr))

        # 第2章：总体风格画像
        sections.append(self._section_2_overview(cr))

        # 第3章：跨作品稳定特征表
        sections.append(self._section_3_stable_features_table(cr))

        # 第4-16章：各层详细分析（框架，待LLM填充）
        for i in range(4, 17):
            sections.append(self._section_detailed_analysis(i, cr))

        # 第17章：风险与边界
        sections.append(self._section_17_boundaries())

        return "\n\n".join(sections)

    def _section_1_scope(self, cr: CrossBookResult) -> str:
        """第1章：分析范围"""
        lines = [
            "# 第1章 分析范围",
            "",
            f"**作品数量**: {len(cr.books_analyzed)} 本",
            f"**总字数**: {cr.total_chars:,} 字",
            f"**总章数**: {cr.total_chapters} 章",
            "",
            "**分析书目**:",
        ]
        for i, book in enumerate(cr.books_analyzed, 1):
            lines.append(f"  {i}. {book}")

        if cr.stable_features:
            high_count = sum(1 for f in cr.stable_features if f.stability == Stability.HIGH)
            med_count = sum(1 for f in cr.stable_features if f.stability == Stability.MEDIUM)
            lines.extend([
                "",
                "**特征统计**:",
                f"  - 高稳定度特征: {high_count} 个",
                f"  - 中稳定度特征: {med_count} 个",
                f"  - 书籍专属特征: {sum(len(v) for v in cr.book_specific_features.values())} 个",
            ])

        return "\n".join(lines)

    def _section_2_overview(self, cr: CrossBookResult) -> str:
        """第2章：总体风格画像"""
        high_features = [f for f in cr.stable_features if f.stability == Stability.HIGH]

        lines = [
            "# 第2章 总体风格画像",
            "",
        ]

        if high_features:
            lines.append("**核心风格标签**:")
            for feat in high_features:
                if feat.literary_description:
                    lines.append(f"  - **{feat.name}**: {feat.literary_description}")
        else:
            lines.append("*暂无足够的高稳定度特征进行总体画像*")

        return "\n".join(lines)

    def _section_3_stable_features_table(self, cr: CrossBookResult) -> str:
        """第3章：跨作品稳定特征表"""
        lines = [
            "# 第3章 跨作品稳定特征表",
            "",
            "| 特征 | 稳定度 | 适用场景 | 技术描述 | 文学质感 | 写作规则 |",
            "|------|--------|----------|----------|----------|----------|",
        ]

        for feature in cr.stable_features:
            stability_display = {
                Stability.HIGH: "🟢 HIGH",
                Stability.MEDIUM: "🟡 MEDIUM",
                Stability.LOW: "🔴 LOW",
            }.get(feature.stability, str(feature.stability.value))

            applies_str = ", ".join(feature.applies_to) if feature.applies_to else "-"

            lines.append(
                f"| {feature.name} | {stability_display} | {applies_str} "
                f"| {feature.technical_description or '-'} "
                f"| {feature.literary_description or '-'} "
                f"| {feature.writing_rule or '-'} |"
            )

        if not cr.stable_features:
            lines.append("| *暂无稳定特征* | - | - | - | - | - |")

        return "\n".join(lines)

    def _section_detailed_analysis(self, chapter_num: int, cr: CrossBookResult) -> str:
        """第4-16章：各层详细分析（框架）"""
        chapter_titles = {
            4: "语言节奏与句式特征",
            5: "对话系统与角色声音",
            6: "叙事视角与时空处理",
            7: "情感表达与情绪曲线",
            8: "战斗/冲突场景模式",
            9: "日常/过渡场景模式",
            10: "人物塑造与成长弧线",
            11: "世界观构建与设定呈现",
            12: "伏笔与回响机制",
            13: "幽默与讽刺元素",
            14: "哲学思考与价值主张",
            15: "独特修辞与标志性手法",
            16: "禁忌与边界识别",
        }

        title = chapter_titles.get(chapter_num, f"第{chapter_num}章 详细分析")

        lines = [
            f"# 第{chapter_num}章 {title}",
            "",
            "> ⚠️ **本章内容需由 LLM 根据原始文本深度分析填充**",
            "",
            "**分析维度**:",
            "  - 特征提取与量化",
            "  - 典型案例引用（脱敏）",
            "  - 跨作品一致性验证",
            "  - 写作指导建议",
            "",
            "---",
            "*待填充区域*",
        ]

        return "\n".join(lines)

    def _section_17_boundaries(self) -> str:
        """第17章：风险与边界"""
        return """# 第17章 风险与边界

## 法律与伦理边界

### ⛔ 不得复制原文
- **严禁**: 大段复制原作文本
- **允许**: 引用极短片段用于说明（需标注出处）
- **原则**: 所有产出必须是原创内容，仅借鉴风格

### ⛔ 不得冒充作者
- **严禁**: 声称或暗示产出来自原作者
- **必须**: 明确标注"AI辅助创作，借鉴XX风格"
- **原则**: 尊重原作者的知识产权和声誉

## 使用建议

### ✅ 推荐用法
1. 学习和研究写作技巧
2. 作为灵感来源激发创意
3. 辅助突破写作瓶颈
4. 探索不同风格的实验性写作

### ❌ 不推荐用法
1. 商业化冒充作品
2. 侵犯版权的衍生创作
3. 恶意模仿损害作者声誉

## 免责声明
本报告由 AI 自动生成，仅供学习参考。
使用者需自行承担相关法律责任。
"""

    def generate_style_card(self, cr: CrossBookResult) -> str:
        """生成 AI 风格速查卡（压缩版 system prompt）

        结构：
        - 整体气质（高稳定度特征的文学描述前3条）
        - 强约束（高/中稳定度的写作规则列表）
        - 场景规则（scene_recipes）
        - 禁区（4条固定禁令）
        """
        lines = [
            f"# {cr.author_name or '未知作者'} - AI 风格速查卡",
            "",
            "> 📋 本卡片为压缩版 System Prompt，可直接用于 AI 写作助手",
            "",
        ]

        # 1. 整体气质
        high_features = [f for f in cr.stable_features if f.stability == Stability.HIGH]
        if high_features:
            lines.extend([
                "## 🎭 整体气质",
                "",
            ])
            for feat in high_features[:3]:
                if feat.literary_description:
                    lines.append(f"- **{feat.name}**: {feat.literary_description}")
            lines.append("")

        # 2. 强约束
        constrained_features = [
            f for f in cr.stable_features
            if f.stability in (Stability.HIGH, Stability.MEDIUM) and f.writing_rule
        ]
        if constrained_features:
            lines.extend([
                "## 🔒 强约束规则",
                "",
            ])
            for feat in constrained_features:
                lines.append(f"- [{feat.stability.value.upper()}] {feat.writing_rule}")
            lines.append("")

        # 3. 场景规则
        if cr.scene_recipes:
            lines.extend([
                "## 🎬 场景规则",
                "",
            ])
            for scene_name, recipe in cr.scene_recipes.items():
                lines.append(f"- **{scene_name}**: {recipe}")
            lines.append("")

        # 4. 禁区（固定4条）
        lines.extend([
            "## 🚫 禁区清单",
            "",
            "1. **禁止复制原文**: 不得大段复制原作内容",
            "2. **禁止冒充作者**: 必须明确标注 AI 辅助创作",
            "3. **禁止侵权使用**: 商业用途需获得授权",
            "4. **禁止恶意模仿**: 不得损害原作者声誉",
            "",
        ])

        # 使用提示
        lines.extend([
            "---",
            "",
            "### 💡 使用方式",
            "",
            "将本卡片内容作为 System Prompt 的核心部分传入 AI 模型。",
            "配合具体写作任务指令使用效果最佳。",
        ])

        return "\n".join(lines)

    def generate_scene_templates(self, cr: CrossBookResult) -> str:
        """生成场景模板库（6种填空模板）

        模板类型：
        1. 战斗场景
        2. 日常场景
        3. 对话场景
        4. 抒情场景
        5. 打脸场景
        6. 升级修炼场景
        """
        templates = {
            "战斗场景": self._template_battle(),
            "日常场景": self._template_daily(),
            "对话场景": self._template_dialogue(),
            "抒情场景": self._template_lyrical(),
            "打脸场景": self._template_face_slap(),
            "升级修炼场景": self._template_cultivation(),
        }

        lines = [
            f"# {cr.author_name or '未知作者'} - 场景模板库",
            "",
            "> 📝 基于{len(cr.books_analyzed)}本作品的风格分析生成的填空模板",
            "",
            "## 使用说明",
            "",
            "1. 选择合适的场景类型",
            "2. 根据 `[括号内提示]` 填入具体内容",
            "3. 保持整体风格一致性",
            "4. 可根据需要调整细节",
            "",
        ]

        for template_name, template_content in templates.items():
            lines.extend([
                f"---",
                "",
                f"## 📌 {template_name}",
                "",
                template_content,
                "",
            ])

        return "\n".join(lines)

    def _template_battle(self) -> str:
        """战斗场景模板"""
        return """```
[环境描写：营造紧张氛围]
[角色状态：当前处境和心态]

[动作序列1：初始交锋]
[感官细节：声音/光影/触感]
[内心活动：战术判断或情感波动]

[转折点：局势变化]
[高潮动作：决定性一击]
[后果描写：即时反馈]

[收尾：战果总结或悬念铺垫]
```"""

    def _template_daily(self) -> str:
        """日常场景模板"""
        return """```
[时间地点：日常场景的背景]
[角色活动：正在做的事情]
[环境氛围：轻松/忙碌/温馨等]

[小事件：打破常规的插曲]
[角色反应：自然的行为和对话]
[互动细节：人物关系体现]

[过渡：引出后续情节]
[伏笔埋设（可选）：为未来做铺垫]
```"""

    def _template_dialogue(self) -> str:
        """对话场景模板"""
        return """```
[对话背景：场合和参与者]
[开场白：引发话题的第一句话]

[信息交换：观点/情报/情感的传递]
[冲突点（可选）：分歧或误解]
[情绪变化：语气和态度的转变]

[关键台词：推动情节的金句]
[结尾：达成共识或留下悬念]
[动作描写（可选）：配合对话的肢体语言]
```"""

    def _template_lyrical(self) -> str:
        """抒情场景模板"""
        return """```
[触发物：引发情感的外部刺激]
[回忆闪回：相关的过往记忆]
[情感层次：从表层到深层的递进]

[意象运用：比喻/象征/通感]
[哲思升华：从个人到普遍的思考]
[文字质感：注重音韵和节奏]

[回归现实：情感沉淀后的平静]
[余韵：留给读者的想象空间]
```"""

    def _template_face_slap(self) -> str:
        """打脸场景模板"""
        return """```
[铺垫：反派的嚣张行为]
[压抑：主角或正方的困境]
[旁观者反应：群众的情绪]

[转折：局势逆转的契机]
[反击行动：有力的回应]
[震撼效果：在场人员的震惊]

[后果：反派的下场]
[爽点总结：读者情绪释放]
```"""

    def _template_cultivation(self) -> str:
        """升级修炼场景模板"""
        return """```
[修炼动机：为什么要突破]
[准备工作：资源/心境/机缘]
[过程描写：突破的具体步骤]

[瓶颈：遇到的困难]
[顿悟：关键的领悟或突破]
[变化：实力提升的表现]

[新能力展示：初次使用]
[影响：对后续剧情的推动]
```"""

    def generate_checklist(self, cr: CrossBookResult) -> str:
        """生成写作检查清单

        内容：
        - 10项基础检查项
        - 每个高/中稳定度特征追加一条专属检查项
        """
        base_items = [
            ("✅", "是否保持了整体的叙述节奏？"),
            ("✅", "对话是否符合角色的身份和性格？"),
            ("✅", "场景描写是否有足够的感官细节？"),
            ("✅", "情感表达是否自然不突兀？"),
            ("✅", "段落长度是否有所变化避免单调？"),
            ("✅", "是否避免了过度解释（show don't tell）？"),
            ("✅", "伏笔是否合理设置？"),
            ("✅", "时间线和空间逻辑是否清晰？"),
            ("✅", "用词是否精准且符合文体风格？"),
            ("✅", "章节结尾是否有足够的吸引力？"),
        ]

        lines = [
            f"# {cr.author_name or '未知作者'} - 写作检查清单",
            "",
            "> ✓ 使用此清单在每次写作完成后进行自我审查",
            "",
            "## 📋 基础检查项（10项）",
            "",
        ]

        for i, (icon, item) in enumerate(base_items, 1):
            lines.append(f"{i}. {icon} {item}")
        lines.append("")

        # 追加高/中稳定度特征的专属检查项
        constrained_features = [
            f for f in cr.stable_features
            if f.stability in (Stability.HIGH, Stability.MEDIUM)
        ]

        if constrained_features:
            lines.extend([
                "## 🎯 风格特征专项检查",
                "",
            ])
            for i, feature in enumerate(constrained_features, len(base_items) + 1):
                check_item = f"[{feature.name}] "
                if feature.writing_rule:
                    check_item += feature.writing_rule
                else:
                    check_item += f"是否体现了'{feature.name}'这一特征？"

                stability_icon = {
                    Stability.HIGH: "🟢",
                    Stability.MEDIUM: "🟡",
                }.get(feature.stability, "⚪")

                lines.append(f"{i}. {stability_icon} {check_item}")
            lines.append("")

        # 统计信息
        total_checks = len(base_items) + len(constrained_features)
        lines.extend([
            "---",
            "",
            f"**总计**: {total_checks} 项检查",
            f"- 基础项: {len(base_items)} 项",
            f"- 风格专项: {len(constrained_features)} 项",
            "",
            "> 💡 建议每完成一章就执行一次完整检查",
        ])

        return "\n".join(lines)

    def generate_json(self, cr: CrossBookResult) -> str:
        """生成结构化 JSON 输出

        包含字段：
        - analysis_scope: 分析范围
        - stable_features: 稳定特征列表
        - scene_recipes: 场景配方
        - style_prompt: 风格提示词
        - revision_checklist: 修改检查清单
        - boundaries: 边界限制
        """
        data = {
            "analysis_scope": {
                "author_name": cr.author_name,
                "books_analyzed": cr.books_analyzed,
                "book_count": len(cr.books_analyzed),
                "total_chars": cr.total_chars,
                "total_chapters": cr.total_chapters,
            },
            "stable_features": [
                {
                    "name": f.name,
                    "stability": f.stability.value,
                    "applies_to": f.applies_to,
                    "technical_description": f.technical_description,
                    "literary_description": f.literary_description,
                    "writing_rule": f.writing_rule,
                    "evidence": f.evidence,
                }
                for f in cr.stable_features
            ],
            "book_specific_features": {
                book_title: [
                    {
                        "name": f.name,
                        "stability": f.stability.value,
                        "description": f.literary_description or f.technical_description,
                    }
                    for f in features
                ]
                for book_title, features in cr.book_specific_features.items()
            },
            "style_prompt": self.generate_style_card(cr),
            "revision_checklist": self.generate_checklist(cr),
            "boundaries": {
                "no_copying": "不得复制原文大段内容",
                "no_impersonation": "不得冒充原作者",
                "commercial_use": "商业用途需获授权",
                "attribution_required": "必须标注AI辅助创作",
            },
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "version": "1.0.0",
            },
        }

        return json.dumps(data, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    from scripts.models import StyleFeature, Stability

    # 示例用法
    cr = CrossBookResult(
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
                writing_rule="战斗段落必须使用短句",
            ),
            StyleFeature(
                name="内心独白",
                stability=Stability.MEDIUM,
                applies_to=["情感场景"],
                technical_description="第一人称内心活动",
                writing_rule="重要决策前插入内心独白",
            ),
        ],
    )

    generator = ReportGenerator()
    print(generator.generate_full_report(cr))
    print("\n" + "="*50 + "\n")
    print(generator.generate_style_card(cr))
