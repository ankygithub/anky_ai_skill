# 间距常量表

本文档按图表类型定义间距常量。生成SVG时，必须引用对应类型的常量值。

## 通用常量（所有图表类型）

| 常量名 | 值 | 说明 |
|--------|-----|------|
| CANVAS_PADDING | 40px | 画布四周边距 |
| MIN_NODE_HEIGHT | 40px | 节点最小高度 |
| TEXT_PADDING | 8px | 文字与图形边界内边距 |
| FONT_SIZE_TITLE | 14px | 标题字体大小 |
| FONT_SIZE_BODY | 12px | 正文字体大小 |
| FONT_SIZE_LABEL | 10px | 标签字体大小 |
| CONTRAST_RATIO | ≥ 4.5:1 | 文字与背景对比度 |

---

## 系统分层架构图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| LAYER_SPACING_FACTOR | 1.5 | 层间距 = 层内最高模块高度 × 此系数 |
| MIN_LAYER_SPACING | 60px | 层间距最小值 |
| MODULE_SPACING_FACTOR | 1.0 | 模块间距 = 最宽模块宽度 × 此系数 |
| MIN_MODULE_SPACING | 40px | 模块间距最小值 |
| MAX_MODULES_PER_ROW | 5 | 每行最大模块数，超出则换行 |
| ROW_SPACING | 20px | 换行后的行间距 |

---

## 流程图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| NODE_H_SPACING | 60px | 节点水平间距 |
| NODE_V_SPACING | 40px | 节点垂直间距 |
| DECISION_V_SPACING | 50px | 判断节点与分支节点垂直间距 |
| LOOP_RADIUS | 30px | 回环弧线半径 |

---

## 类图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| CLASS_WIDTH | 160px | 类节点固定宽度 |
| CLASS_H_SPACING | 180px | 类间水平间距（含类宽度） |
| INHERIT_V_SPACING | 60px | 继承层次垂直间距 |
| ASSOC_H_SPACING | 200px | 关联类水平间距 |
| ATTR_LINE_HEIGHT | 18px | 属性/方法行高 |

---

## 拓扑图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| CENTER_TO_EDGE_MIN | 100px | 中心到边缘节点最小间距 |
| EDGE_NODE_MIN_SPACING | 60px | 边缘节点间最小间距 |
| CANVAS_PADDING | 60px | 拓扑图画布边距（较大） |

---

## 状态机

| 常量名 | 值 | 说明 |
|--------|-----|------|
| STATE_SPACING | 80px | 状态节点间最小间距 |
| TERMINAL_SPACING | 100px | 初始/终止状态与其他状态间距 |
| SELF_LOOP_RADIUS | 25-35px | 自环半径范围 |
| ARC_HEIGHT_FACTOR | 0.3 | 转移线弧形高度 = 节点间距 × 此系数 |

---

## 思维导图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| CENTER_TO_L1_MIN | 120px | 中心到一级子节点最小距离 |
| LEVEL_SPACING | 80px | 层级间距（父到子） |
| SIBLING_SPACING_FACTOR | 30px | 同级节点额外间距 = 节点宽度 + 此值 |
| MAX_DEPTH_BEFORE_EXPAND | 3 | 超过此深度自动扩展画布 |

---

## 甘特图

| 常量名 | 值 | 说明 |
|--------|-----|------|
| TASK_LIST_WIDTH | 200px | 任务列表固定宽度 |
| TASK_ROW_HEIGHT | 40px | 任务行高 |
| BAR_HEIGHT_FACTOR | 0.6 | 条形高度 = 行高 × 此系数 |
| DAY_TICK_SPACING | 40px | 日刻度间距 |
| WEEK_TICK_SPACING | 20px | 周刻度间距 |
| MONTH_TICK_SPACING | 10px | 月刻度间距 |
| DAY_THRESHOLD | 30 | 超过此天数切换为周刻度 |
| WEEK_THRESHOLD | 180 | 超过此天数切换为月刻度 |

---

## 数据图表

| 常量名 | 值 | 说明 |
|--------|-----|------|
| LEGEND_SPACING | 30px | 图例与图表间距 |
| LABEL_SPACING | 8px | 数据标签与图形间距 |
| CANVAS_PADDING_TOP | 40px | 画布上边距 |
| CANVAS_PADDING_BOTTOM | 60px | 画布下边距（留轴标签空间） |
| BAR_GAP_FACTOR | 0.3 | 柱间距 = 柱宽 × 此系数 |
| DONUT_INNER_FACTOR | 0.5 | 环形图内径 = 外径 × 此系数 |
| MAX_DATA_ITEMS | 8 | 超过此数量启用图例滚动或换行 |
| MIN_SECTOR_PERCENT | 5% | 小于此比例的扇区合并为"其他" |
