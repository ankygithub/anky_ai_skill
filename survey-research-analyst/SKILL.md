---
name: survey-research-analyst
description:   专业调研分析报告生成技能
  支持6大调研类型：市场调研、竞品分析、用户研究、行业趋势、技术调研、政策解读。
  采用MD-first架构，输出带导航栏、主题切换、响应式布局的专业HTML报告。
  使用场景：需要生成结构化调研报告、市场分析、竞品对比、用户洞察、行业研究、技术评估、政策分析等。
---

# 调查研究分析报告

专业调研分析报告生成技能，支持多种调研类型，输出格式丰富的交互式HTML报告。

## 支持的调研类型

| 类型 | 英文名 | 适用场景 | 参考文档 |
|------|--------|----------|----------|
| 市场调研 | market | 市场规模、竞争格局、进入策略 | [frameworks/market.md](references/frameworks/market.md) |
| 竞品分析 | competitor | 产品对比、优劣势分析、差异化 | [frameworks/competitor.md](references/frameworks/competitor.md) |
| 用户研究 | user | 用户画像、需求分析、行为洞察 | [frameworks/user.md](references/frameworks/user.md) |
| 行业趋势 | industry | 技术趋势、市场走向、未来预测 | [frameworks/industry.md](references/frameworks/industry.md) |
| 技术调研 | technology | 技术选型、架构评估、可行性 | [frameworks/technology.md](references/frameworks/technology.md) |
| 政策解读 | policy | 政策分析、合规评估、影响研判 | [frameworks/policy.md](references/frameworks/policy.md) |

## 完整工作流程

### 第一步：初始化项目

**使用 init-project.sh 创建新项目（推荐）：**

```bash
# 语法：bash init-project.sh -n <项目名> -t <报告类型>
# 示例：创建市场调研项目
bash scripts/init-project.sh -n "AI写作工具市场调研" -t "market"

# 示例：创建竞品分析项目
bash scripts/init-project.sh -n "Notion竞品分析" -t "competitor"

# 示例：创建用户研究项目
bash scripts/init-project.sh -n "Z世代用户研究" -t "user"
```

**支持的报告类型：**
- `market` - 市场调研
- `competitor` - 竞品分析
- `user` - 用户研究
- `industry` - 行业趋势
- `technology` - 技术调研
- `policy` - 政策解读

**初始化后会创建以下结构：**
```
项目名称/
├── docs/                    # 报告章节文档
│   ├── 00-key-findings.md   # 核心发现
│   ├── 01-executive-summary.md
│   ├── 02-xxx.md           # 根据类型自动生成
│   └── ...
├── research/               # 调研资料存放
├── sources/                # 数据来源清单
│   └── sources.md
├── output/                 # HTML报告输出目录
├── project-info.md         # 项目配置信息
└── rebuild.sh             # 重新构建脚本
```

### 第二步：编辑项目信息

打开 `project-info.md`，填写以下内容：

```markdown
## Research Goals
本次调研旨在分析AI写作工具市场的竞争格局，识别市场机会...

## Core Questions
1. 当前市场规模和增长率是多少？
2. 主要竞争对手有哪些，各自的市场份额？
3. 用户的核心需求和痛点是什么？
4. 进入该市场的最佳策略是什么？

## Execution Mode
- [x] 快速模式（30分钟，<=10次搜索）
- [ ] 标准模式（1-2小时，<=20次搜索）
```

### 第三步：阅读框架文档

根据选择的报告类型，阅读对应的框架文档：

```bash
# 例如选择了 market 类型，阅读：
cat references/frameworks/market.md
```

框架文档包含：
- 该调研类型的标准章节结构
- 每个章节应包含的内容要点
- 推荐的分析框架和方法

### 第四步：信息收集（Wave 1）

1. **将核心问题拆解为3-5个子问题**
   - 每个子问题最多3轮搜索
   - 记录所有来源URL和访问日期

2. **信源分级记录**
   ```markdown
   ## A级来源（官方/权威）
   - [来源名称](URL) - 用途说明 - 日期
   
   ## B级来源（权威媒体/智库）
   - [来源名称](URL) - 用途说明 - 日期
   
   ## C级来源（行业博客/论坛）
   - [来源名称](URL) - 用途说明 - 日期
   ```

3. **搜索预算控制**
   - 快速模式：≤10次搜索，30分钟内
   - 标准模式：≤20次搜索，1-2小时内

### 第五步：分析写作（Wave 2）

按顺序编辑 `docs/` 目录下的 Markdown 文件：

**章节写作模板：**
```markdown
---
title: 章节标题
---

# 章节标题

## 核心观点
（用1-2句话概括本章核心结论）

## 数据支撑
（列出支持观点的数据，标注来源）

| 指标 | 数值 | 来源 | 日期 |
|------|------|------|------|
| 市场规模 | 100亿 | [来源A](url) | 2024-01 |

## 分析洞察
（基于数据的深度分析，解释"为什么"和"意味着什么"）

## 关键发现
- 发现1：...
- 发现2：...
```

**写作规范：**
- 每个观点必须有数据支撑
- 所有数据标注来源和等级（A/B/C）
- 使用表格呈现对比信息
- 使用 `> [!info]` 提示框标注重要信息

### 第六步：深度分析（Wave 3）

1. **交叉验证关键数据**
   - 对关键数字进行多渠道验证
   - 不一致的数据标注"待验证"

2. **补充缺失信息**
   - 检查是否有章节内容不足
   - 补充必要的背景信息

3. **生成核心发现**
   编辑 `docs/00-key-findings.md`：
   ```markdown
   # 核心发现
   
   ## 发现1：市场规模超预期增长
   （详细描述，包含数据支撑）
   
   ## 发现2：竞争格局呈现寡头态势
   （详细描述，包含数据支撑）
   ```

### 第七步：构建报告

**使用 rebuild.sh（推荐）**

```bash
# 确保在项目目录下
cd 项目名称

# 构建HTML报告（默认）
bash rebuild.sh

# 或指定格式：
bash rebuild.sh html        # 构建HTML报告
bash rebuild.sh markdown    # 构建Markdown单文件报告
bash rebuild.sh md          # 同上
bash rebuild.sh both        # 同时构建HTML和Markdown
```

**输出格式说明：**

| 格式 | 命令 | 输出文件 | 适用场景 |
|------|------|----------|----------|
| HTML | `bash rebuild.sh` | `{项目名称}_report.html` | 在线浏览、分享、打印 |
| Markdown | `bash rebuild.sh md` | `{项目名称}_report.md` | 导入其他系统、版本控制 |
| Both | `bash rebuild.sh both` | 同时生成两种格式 | 需要多种格式时 |

**构建过程：**
1. 读取所有 Markdown 文档
2. 合并为单文件报告
3. 应用样式和模板（HTML）
4. 生成到 `output/` 目录

**方式二：如果 rebuild.sh 找不到 skill 目录**

```bash
# 设置环境变量后运行
export SURVEY_SKILL_DIR=/path/to/skill-code/survey-research-analyst
bash rebuild.sh
```

### 第八步：验证和交付

1. **打开报告检查**
   ```bash
   # 在浏览器中打开
   open output/report.html        # macOS
   xdg-open output/report.html    # Linux
   start output/report.html       # Windows
   ```

2. **检查清单：**
   - [ ] 目录导航正常
   - [ ] 所有章节内容完整
   - [ ] 表格样式正确
   - [ ] 主题切换功能正常
   - [ ] 无错别字

3. **如需修改**
   - 编辑对应的 `.md` 文件
   - 重新运行 `bash rebuild.sh`
   - 再次验证

## 项目结构详解

```
项目名称/
├── docs/                           # 报告章节（按顺序编号）
│   ├── 00-key-findings.md         # 核心发现汇总
│   ├── 01-executive-summary.md    # 执行摘要
│   ├── 02-market-size.md          # 市场规模（根据类型不同）
│   ├── 03-competition.md          # 竞争分析
│   └── ...                        # 其他章节
├── research/                       # 调研过程中收集的原始资料
│   └── （存放网页截图、PDF报告等）
├── sources/                        # 来源清单
│   └── sources.md                 # 所有数据来源的详细记录
├── output/                         # 构建输出
│   └── report.html                # 最终HTML报告
├── project-info.md                 # 项目元数据
└── rebuild.sh                      # 重新构建脚本
```

## 写作规范

详见 [writing-guide.md](references/writing-guide.md)

### 核心原则
- **数据驱动**：每个观点需有数据支撑
- **来源透明**：所有数据标注来源和等级
- **结构清晰**：使用标题层级、列表、表格
- **可视化**：复杂信息用表格、对比框呈现

### 常用组件
```markdown
<!-- 信息提示框 -->
:::info 重要发现
这是关键信息内容
:::

<!-- 成功提示框 -->
:::success 机会点
这是市场机会描述
:::

<!-- 警告提示框 -->
:::warning 风险提示
这是需要注意的风险
:::

<!-- 危险提示框 -->
:::danger 严重警告
这是需要立即注意的问题
:::

<!-- 步骤组件 -->
:::steps
1. 第一步标题
   第一步的详细描述

2. 第二步标题
   第二步的详细描述

3. 第三步标题
   第三步的详细描述
:::

<!-- 对比组件 -->
:::compare
:::left 方案A优势
- 成本低
- 部署快
:::

:::right 方案B优势
- 功能全
- 扩展性好
:::
:::

<!-- 详情展开组件 -->
:::details 点击展开详情
这里是详细内容...
:::

<!-- 证据卡片 -->
:::evidence 数据来源
- 来源：Gartner报告
- 日期：2024年1月
:::

<!-- 对比表格 -->
| 维度 | 方案A | 方案B |
|------|-------|-------|
| 成本 | 低 | 高 |
| 效果 | 中 | 高 |

<!-- 普通列表 -->
1. 第一步：...
2. 第二步：...
3. 第三步：...

- 项目1
- 项目2
- 项目3
```

## 信源等级

详见 [source-grade.md](references/source-grade.md)

| 等级 | 类型 | 示例 | 可信度 |
|------|------|------|--------|
| **A级** | 官方/权威 | 政府官网、官方财报、权威期刊 | 高 |
| **B级** | 权威媒体/智库 | 路透社、麦肯锡报告、Gartner | 中高 |
| **C级** | 行业博客/论坛 | 技术博客、知乎、行业论坛 | 中（需验证） |

## 输出特性

生成的 HTML 报告包含：
- **响应式布局**：支持桌面端和移动端
- **侧边栏目录**：自动生成的可点击目录导航
- **主题切换**：支持明/暗主题
- **字号调节**：小/中/大三档字号
- **内容宽度调节**：默认/宽/更宽/超宽/全屏五档
- **平滑滚动**：点击目录项平滑滚动到对应章节
- **目录高亮**：滚动时自动高亮当前章节

## 注意事项

1. **搜索预算控制**：
   - 快速模式：≤10次搜索
   - 标准模式：≤20次搜索
   - 每子问题最多3轮搜索

2. **时间管理**：
   - 快速模式：30分钟内完成
   - 标准模式：1-2小时完成
   - 预留10%时间用于构建和验证

3. **质量保证**：
   - 关键数据必须多渠道验证
   - 不确定的信息标注"待验证"
   - 所有来源按A/B/C分级

4. **重新构建**：
   - 修改 Markdown 后，运行 `bash rebuild.sh` 重新生成报告
   - 无需手动删除旧文件，脚本会自动覆盖

## 参考文档索引

- **框架文档**：`references/frameworks/` - 6种调研类型的详细框架
- **写作规范**：`references/writing-guide.md` - Markdown写作规范
- **信源等级**：`references/source-grade.md` - 来源分级标准
- **任务规划**：`references/task-planner.md` - 任务分解和时间规划

## 故障排除

**问题1：rebuild.sh 找不到 skill 目录**
```bash
# 解决方案：设置环境变量
export SURVEY_SKILL_DIR=/path/to/survey-research-analyst
bash rebuild.sh
```

**问题2：Node.js 未找到**
```bash
# 解决方案：设置 Node.js 路径
export NODE_CMD="/c/Program Files/nodejs/node.exe"
bash rebuild.sh
```

**问题3：构建后的 HTML 样式丢失**
- 检查 `templates/styles.css` 是否存在
- 重新运行 `bash rebuild.sh`
