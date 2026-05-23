# -*- coding: utf-8 -*-
"""
文抄公式境界突破描写模板（整合版）
"""

def generate_breakthrough(character, old_realm, new_realm, location, method):
    """
    生成境界突破场景

    参数:
        character: 角色信息（姓名、实力、特点）
        old_realm: 原境界
        new_realm: 新境界
        location: 突破地点
        method: 突破方式（丹药/功法/资源/积累）
    """

    scene = f"""# 境界突破：{old_realm} → {new_realm}

## 准备阶段
地点：{location}
状态：{character['state']}
准备：{character['preparation']}
方式：{method}

{character['name']}深吸一口气，开始尝试突破：

## 突破阶段
{character['name']}运转功法，冲击瓶颈！
积累已久的力量开始躁动！

体内真气/能量翻涌，冲击着境界的壁垒！
{character['struggle']}

终于，咔嚓——！
瓶颈被突破！

## 成功阶段
轰！
{character['name']}的气息开始疯狂暴涨！
从{old_realm}，一步步攀升至{new_realm}！

{character['feeling']}
{character['new_ability']}
{character['life_extension']}

## 巩固阶段
{character['name']}开始熟悉新境界的力量。
{character['test']}

## 收尾
{character['name']}巩固完成。
现在的他，已经是{new_realm}的强者！
{character['reflection']}
下一步目标：{character['next_goal']}
"""

    return scene


def main():
    """示例使用"""
    character = {
        "name": "林轩",
        "state": "状态极佳，积累已久，水到渠成",
        "preparation": "吞服筑基丹，布置防御阵法，选择安全地点",
        "struggle": "瓶颈比想象中更顽固，但他没有放弃，咬牙坚持",
        "feeling": "只感觉神清气爽，耳目一新，对天地的感应更加敏锐",
        "new_ability": "获得新能力：神识外放，可御剑飞行",
        "life_extension": "寿命延长至200年",
        "test": "随手一拳轰出，力量比之前强横了数倍！",
        "power_increase": "数倍",
        "reflection": "他暗自思索：这只是开始，大道还很长，继续努力",
        "next_goal": "金丹期"
    }

    scene = generate_breakthrough(
        character=character,
        old_realm="练气九层",
        new_realm="筑基期",
        location="密室闭关",
        method="筑基丹+积累突破"
    )
    print(scene)


if __name__ == "__main__":
    main()
