# -*- coding: utf-8 -*-
"""
文抄公风格章节大纲生成器（整合版）
根据输入参数生成符合文抄公风格的章节大纲
"""

def generate_chapter_outline(chapter_num, current_situation, crisis, expected_gain, chapter_type="standard"):
    """
    生成章节大纲

    参数:
        chapter_num: 章节号
        current_situation: 主角当前处境
        crisis: 面临的危机
        expected_gain: 预期收获
        chapter_type: 章节类型 (standard/combat/breakthrough/treasure)
    """

    outline = f"""# 第{chapter_num}章 大纲

## 基本信息
- **主角处境**: {current_situation}
- **面临危机**: {crisis}
- **预期收获**: {expected_gain}
- **节奏要求**: 快、爽、不拖沓

## 章节结构

### 【开头】（300-500字）承接上文+引入危机
- 承接上文，简要回顾当前状态
- 快速引入新危机
- 主角评估风险收益比

### 【发展】（1500-2000字）制定计划+执行
- 主角评估形势，制定策略
- 执行过程，遇到阻碍和变数
- 运用金手指/能力解决问题
- 展现实力，获得优势

### 【高潮】（800-1000字）核心冲突爆发
"""

    if chapter_type == "combat":
        outline += """- 战斗爆发，双方试探
- 激烈交锋，招式对拼
- 关键时刻，主角使用底牌/突破
- 反杀/打脸，获得胜利
"""
    elif chapter_type == "breakthrough":
        outline += """- 积累足够，准备突破
- 运转功法，冲击瓶颈
- 突破成功，实力质变
- 熟悉新力量，测试新能力
"""
    elif chapter_type == "treasure":
        outline += """- 发现线索，准备探索
- 进入险地，遭遇危险
- 解决问题，获得宝物
- 安全撤离，可能遭遇截杀
"""
    else:
        outline += """- 核心冲突爆发（战斗/智斗/探险）
- 主角发挥实力，解决问题
- 获得关键进展/收获
"""

    outline += f"""
### 【结尾】（200-300字）收获+新危机+悬念
- 总结收获：{expected_gain}
- 发现新问题/更大危机
- 留下悬念钩子，引出下章

## 爽点设置
1. **实力展示**: 主角展现实力，震惊他人
2. **收获时刻**: 获得{expected_gain}
3. **打脸/反杀**: 解决{crisis}

## 悬念钩子
- 结尾暗示：更大的危机正在逼近……

## 文抄公特色检查
- [ ] 节奏是否快、爽
- [ ] 主角是否理性利己
- [ ] 战斗/冲突是否简洁有力
- [ ] 章节结尾是否有悬念
- [ ] 信息密度是否足够

---
*本大纲生成基于文抄公"稳、快、爽"核心风格*
"""
    return outline


def main():
    """示例：生成一个章节大纲"""
    outline = generate_chapter_outline(
        chapter_num=5,
        current_situation="练气三层外门弟子",
        crisis="内门弟子王虎挑衅，3日后比武",
        expected_gain="突破练气四层，获得宗门奖励",
        chapter_type="combat"
    )
    print(outline)


if __name__ == "__main__":
    main()
