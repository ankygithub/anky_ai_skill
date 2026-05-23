# -*- coding: utf-8 -*-
"""
文抄公风格战斗场景生成器（整合版）
核心特点：简洁有力、快节奏、爽感足
"""

def generate_combat_scene(protagonist, enemy, location, strategy, outcome):
    """
    生成战斗场景

    参数:
        protagonist: 主角信息（姓名、实力、特点）
        enemy: 敌人信息（姓名/身份、实力、特点）
        location: 战斗场景（地点、环境）
        strategy: 主角策略（正面/智取/偷袭/逃跑）
        outcome: 战斗结果（完胜/惨胜/平局/逃跑）
    """

    # 战前铺垫
    scene = f"""# 战斗场景：{protagonist['name']} vs {enemy['name']}

## 战前
地点：{location}
氛围：紧张压抑，杀机四伏

{enemy['name']}：{enemy['action']}
{enemy['name']}："{enemy['taunt']}"

{protagonist['name']}：{protagonist['reaction']}
{protagonist['name']}暗道：{protagonist['thought']}

## 战斗爆发
"""

    # 根据策略生成
    if strategy == "正面":
        scene += generate_head_on_combat(protagonist, enemy)
    elif strategy == "智取":
        scene += generate_tactical_combat(protagonist, enemy)
    elif strategy == "偷袭":
        scene += generate_ambush_combat(protagonist, enemy)
    else:  # 逃跑
        scene += generate_escape_combat(protagonist, enemy)

    # 战后收尾
    scene += generate_post_combat(protagonist, enemy, outcome)

    return scene


def generate_head_on_combat(protagonist, enemy):
    """正面硬刚型战斗"""
    return f"""{enemy['name']}率先出手，{enemy['opening_move']}！

{protagonist['name']}不闪不避，{protagonist['counter_move']}！

轰！

两股力量碰撞，气浪翻涌！

## 激烈交锋
{enemy['name']}：{enemy['fighting_style']}，攻势如潮！
{protagonist['name']}：{protagonist['fighting_style']}，见招拆招！

双方你来我往，转眼间已交手数十招！

{enemy['name']}越战越心惊："{enemy['shock']}"

## 决胜时刻
{protagonist['name']}：{protagonist['turning_point']}
{protagonist['name']}：{protagonist['finisher']}！
"""


def generate_tactical_combat(protagonist, enemy):
    """智取型战斗"""
    return f"""{enemy['name']}率先出手，{enemy['opening_move']}！

{protagonist['name']}：{protagonist['evasion']}，不与对方正面交锋！

## 周旋试探
{protagonist['name']}且战且退，{protagonist['observation']}
{enemy['name']}：{enemy['arrogance']}，攻势愈发凌厉！

然而，{protagonist['name']}：{protagonist['trap']}

## 一击必杀
就在{enemy['name']}：{enemy['mistake']}
{protagonist['name']}身形暴起，反击！
{protagonist['name']}：{protagonist['finisher']}！
"""


def generate_ambush_combat(protagonist, enemy):
    """偷袭型战斗"""
    return f"""{protagonist['name']}：{protagonist['hide']}，等待时机！

{enemy['name']}：{enemy['unaware']}，毫无防备！

## 雷霆一击
就是现在！
{protagonist['name']}：{protagonist['ambush']}！
{protagonist['name']}：{protagonist['finisher']}！

{enemy['name']}大惊失色，仓促应对，却已来不及！
"""


def generate_escape_combat(protagonist, enemy):
    """逃跑型战斗"""
    return f"""{enemy['name']}：{enemy['opening_move']}，封锁退路！

{protagonist['name']}：{protagonist['assessment']}，知道不可力敌！
{protagonist['name']}：{protagonist['evasion']}，寻找脱身之机！

## 险象环生
{enemy['name']}：{enemy['pursuit']}，紧追不舍！
{protagonist['name']}：{protagonist['escape']}，勉强支撑！

## 成功脱身
{protagonist['success_escape']}
"""


def generate_post_combat(protagonist, enemy, outcome):
    """战后收尾"""
    if outcome == "完胜":
        return f"""## 战后
{enemy['name']}：{enemy['defeat']}
{protagonist['name']}：{protagonist['post_combat']}
这一战，赢得干脆利落！
{protagonist['loot']}
"""
    elif outcome == "惨胜":
        return f"""## 战后
{enemy['name']}：{enemy['defeat']}
{protagonist['name']}：{protagonist['post_combat']}，脸色苍白
这一战，虽然赢了，但消耗巨大，还受了不轻的伤！
{protagonist['loot']}
{protagonist['reflection']}
"""
    else:
        return f"""## 战后
{enemy['name']}：{enemy['reaction']}
{protagonist['name']}：{protagonist['post_escape']}，松了口气
虽然没能击杀对方，但至少保住了性命！
{protagonist['reflection']}
"""


def main():
    """示例使用"""
    protagonist = {
        "name": "林轩",
        "reaction": "目光平静，不动声色",
        "thought": "此人实力不弱，硬拼必败，还是智取为妙",
        "counter_move": "身形一闪，避过锋芒",
        "fighting_style": "招式简洁，每一击都恰到好处",
        "turning_point": "看准对方招式中的一个破绽",
        "evasion": "身形如鬼魅，在攻击间穿梭",
        "observation": "仔细观察对方的招式路数，寻找破绽",
        "trap": "故意露出一个破绽，引诱对方上钩",
        "hide": "隐匿气息，潜伏在暗处",
        "ambush": "如闪电般窜出",
        "finisher": "一剑刺出，直取要害",
        "assessment": "快速评估形势",
        "escape": "借助地形，不断变换方位",
        "success_escape": "终于找到一个破绽，施展遁术，消失在密林中",
        "post_combat": "收剑而立，神色平静",
        "post_escape": "确认安全后",
        "loot": "他上前搜刮战利品，收获颇丰",
        "reflection": "他暗自思索：实力还是太弱，必须尽快提升"
    }

    enemy = {
        "name": "王虎",
        "action": "大步走出，面带狞笑",
        "taunt": "交出宝物，饶你不死！",
        "opening_move": "一拳轰出，势大力沉",
        "fighting_style": "拳风凶猛，招招致命",
        "shock": "这小子明明修为不如我，怎么如此难缠？",
        "arrogance": "冷笑连连，愈发轻视",
        "mistake": "招式用老，露出破绽",
        "unaware": "大摇大摆地走着，毫无防备",
        "pursuit": "紧追不舍",
        "defeat": "瞪大了眼睛，难以置信地倒下",
        "reaction": "气得跺脚，却追之不及"
    }

    scene = generate_combat_scene(
        protagonist=protagonist,
        enemy=enemy,
        location="密林深处",
        strategy="智取",
        outcome="完胜"
    )
    print(scene)


if __name__ == "__main__":
    main()
