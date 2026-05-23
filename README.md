# AI Agent 技能合集

这是一个面向 AI Agent 的职业技能库，包含12个专业技能，涵盖书籍创作、小说写作、调研分析、记忆管理等多个领域。每个技能都可以独立使用，也可以组合协作完成复杂任务。

---

## 📚 技能总览

| 技能名称 | 核心功能 | 适用场景 |
|---------|---------|---------|
| [advance_book_creator](advance_book_creator/) | 深度调研+书籍级PDF手册生成（MD-first架构） | 做书、电子书、参考指南、完整手册 |
| [advance_book_creator_v2](advance_book_creator_v2/) | advance_book_creator增强版（防幻觉+强制组件规则） | 同上，增加内容安全与质量保证 |
| [book-planner](book-planner/) | 书籍大纲规划与调研 | 书籍规划、写书大纲、生成PROJECT.md |
| [huashu-book-pdf-v2](huashu-book-pdf-v2/) | 书籍级PDF手册生成（HTML片段架构） | 做书、PDF手册、电子书、参考指南 |
| [memory-system-v2](memory-system-v2/) | 三层文件记忆系统（全局/项目/任务） | 跨会话知识持久化、项目约定管理 |
| [metaso-search](metaso-search/) | 秘塔AI搜索API集成 | 网络搜索、实时信息获取、调研 |
| [novel_anaylsis_pro](novel_anaylsis_pro/) | 网文作者风格解析 | 分析写作风格、提取风格指纹、仿写指南 |
| [novel_vela_pro](novel_vela_pro/) | 工程化AI小说创作工作台 | 创建小说项目、设定管理、大纲规划 |
| [novel_vela_v3](novel_vela_v3/) | 小说创作全流程管理（V3融合版） | 写小说、章节写作、大纲规划、蓝图生成 |
| [survey-research-analyst](survey-research-analyst/) | 专业调研分析报告生成 | 市场调研、竞品分析、用户研究、行业趋势 |
| [trae-mem0](trae-mem0/) | Trae开发记忆系统（火山引擎Mem0） | 开发过程记忆保存与召回 |
| [wenchaogong-style](wenchaogong-style/) | 文抄公创作风格辅助 | 快节奏爽文、苟道流、系统流网文创作 |

---

## 技能详细说明

### 1. advance_book_creator — 书籍级PDF手册生成（MD-first架构）

**核心特点**：
- Markdown片段写作，自动转换为HTML片段
- 6套主题系统 + 语义化版本管理
- 多Agent并行写作 + Playwright渲染PDF
- 精确书签（两遍渲染法）
- 支持Markdown导出 + 多文件阅读器

**产物格式**：单文件HTML、带精确书签PDF、Markdown、多文件阅读器

**触发词**：做一本书、做个PDF手册、做个完整指南、橙皮书、电子书、参考指南

---

### 2. advance_book_creator_v2 — 书籍级PDF手册生成（增强版）

**核心特点**：
- 继承advance_book_creator全部功能
- **新增防幻觉强制规则**：事实必须搜索验证、信源标注、时效检查
- **新增强制组件使用规则**：每个Part必须使用callout/step/compare等组件
- 标签自动补全与降级保护机制

**适用场景**：对内容质量、安全性要求更高的书籍制作场景

---

### 3. book-planner — 书籍大纲规划技能

**核心特点**：
- 14类书籍类型自动识别（新技术、K12、科普、历史、商业等）
- 四阶段工作流：意图澄清 → 深度调研 → 大纲规划 → 用户确认
- 自动生成PROJECT.md（含章节大纲表、证据矩阵、Agent分工方案）
- 调研维度模板化，支持组合多套模板
- 质量自检清单确保规划质量

**输出产物**：PROJECT.md + 调研报告 + 分析卡片

**触发词**：书籍规划、写书大纲、生成书籍计划、BOOK_PLANNER、书籍蓝图规划

---

### 4. huashu-book-pdf-v2 — 书籍级PDF手册生成（HTML片段架构）

**核心特点**：
- 模块化HTML片段架构
- 语义化版本管理 + 多Agent并行写作
- Playwright渲染PDF + 自动书签
- Markdown导出 + 多文件交互式阅读器
- 一键版本更新与构建

**产物格式**：单文件HTML、带书签PDF、Markdown、多文件阅读器

**工作流**：调研 → 规划 → 写作 → 构建 → 版本更新

---

### 5. memory-system-v2 — 三层文件记忆系统

**核心特点**：
- 三级作用域：全局记忆（L0）、项目记忆（L1）、任务记忆（L2）
- 9种自动保存场景（用户纠正、Bug修复、项目约定等）
- 7种自动召回场景（会话开始、相似任务、遇到错误等）
- 本地Markdown文件存储，无外部依赖
- 支持记忆优先级、冲突处理、作用域提升

**存储结构**：
```
.trae/.memory/          # 项目级记忆
~/.trae-cn/memory/      # 全局记忆（跨项目）
```

**触发词**：记一下、记住、别忘了、查一下、recall

---

### 6. metaso-search — 秘塔AI搜索

**核心特点**：
- 多种调用方式：快捷参数（-q）和JSON输入
- 自动参数修正（scope↔search_type, size↔count）
- 失败自动重试机制
- 多源API Key加载（环境变量/.env/用户目录）
- 三种输出格式：JSON/文本/摘要

**使用方式**：
```bash
python scripts/search.py -q "搜索关键词"
python scripts/search.py -q "AI 技术" -s 5 --include-summary
```

**API端点**：https://metaso.cn/api/v1/search

---

### 7. novel_anaylsis_pro — 网文作者风格解析

**核心特点**：
- 十层技术分析框架（作品工程层、情节结构层、语言风格层等）
- 六维文学感知分析（情绪波形图、氛围配方集、人味指数等）
- 双视角融合输出（技术规则 + 文学质感）
- 分层抽样策略（开篇/高潮/日常/收尾）
- 交叉验证标注稳定度（H/M/L）

**输出产物**：
- 完整分析报告（Markdown）
- AI风格速查卡（压缩版system prompt）
- 场景模板库与写作检查清单
- 结构化JSON数据

**技术栈**：Python 3 + pytest（完整测试覆盖）

---

### 8. novel_vela_pro — 工程化AI小说创作工作台

**核心特点**：
- 完整小说项目管理（设定、角色、世界观、大纲、阶段、蓝图）
- SQLite数据库 + RAG向量检索（sqlite-vec + Ollama）
- .learnings/记忆系统（16个文件，3层架构）
- Mermaid图解生成（人物关系图、时间线）
- 多维度质量审查 + 错误记录追踪
- DB与Markdown双向同步

**CLI命令**：
```bash
python scripts/novel_cli.py init "小说名称" --genre "玄幻"
python scripts/novel_cli.py blueprint generate 1 50
python scripts/novel_cli.py context get 1
```

---

### 9. novel_vela_v3 — 小说创作全流程管理（V3融合版）

**核心特点**：
- 两阶段协作模型：CLI建骨架 → AI填内容
- 四层规划模型：全书大纲 → 阶段规划 → 章节蓝图 → 正文写作
- SQLite+Markdown混合存储
- RAG向量检索（sqlite-vec + Ollama nomic-embed-text）
- 上下文强制读取（动态上下文窗口，最近3章）
- 去AI味三层防护

**标准工作流**：
1. CLI init创建项目 → 2. AI填充大纲 → 3. 生成阶段规划 → 4. 生成章节蓝图 → 5. 获取写作上下文 → 6. AI写作正文 → 7. 审查同步

---

### 10. survey-research-analyst — 专业调研分析报告生成

**支持的调研类型**：
- 市场调研（market）
- 竞品分析（competitor）
- 用户研究（user）
- 行业趋势（industry）
- 技术调研（technology）
- 政策解读（policy）

**核心特点**：
- MD-first架构，输出交互式HTML报告
- 导航栏 + 主题切换 + 响应式布局
- 信源分级（A/B/C三级）
- 搜索预算控制（快速模式≤10次，标准模式≤20次）
- 丰富的报告组件（提示框、步骤、对比、展开详情等）

**产物格式**：交互式HTML报告 + Markdown单文件报告

---

### 11. trae-mem0 — Trae开发记忆系统

**核心特点**：
- 基于火山引擎Mem0实现持久化记忆
- 两级作用域：全局（global）和项目（proj:{项目名}）
- 9种自动保存场景 + 6种自动召回场景
- JSON格式输出，便于解析
- 支持记忆类型分类（correction/bugfix/convention/preference等）

**技术栈**：Python + mem0ai==0.1.118

**验证方式**：
```bash
python scripts/mem0_client.py add --content "测试内容" --scope global
python scripts/mem0_client.py search --query "测试" --scope all
```

---

### 12. wenchaogong-style — 文抄公创作风格辅助

**核心风格标签**：
- ✅ 快节奏爽文：剧情紧凑、冲突密集、爽点频繁
- ✅ 强设定弱文学：设定详细严谨，语言简洁明快
- ✅ 极度理性+精致利己型主角
- ✅ 谨慎苟道+杀伐果断
- ✅ 善于布局+幕后黑手
- ✅ 缝合创新+本土化改造

**提供功能**：
- 章节大纲生成
- 战斗场景描写
- 境界突破描写
- 经典套路库（开局、打脸、升级）
- 写作检查清单

**适用类型**：武侠/仙侠/玄幻/无限流/苟道流/诸天流

---

## 🚀 快速开始

### 环境要求

- **Python 3.10+**（部分技能需要Python 3.13）
- **Node.js >= 16**（书籍构建相关技能）
- **Playwright**（PDF渲染需要：`npm install playwright pdf-lib && npx playwright install chromium`）

### 安装依赖

根据不同技能的requirements.txt安装Python依赖：

```bash
# novel_anaylsis_pro
pip install -r novel_anaylsis_pro/requirements.txt

# novel_vela_pro / novel_vela_v3
pip install click httpx sqlite-vec requests

# trae-mem0
pip install mem0ai==0.1.118
```

### 使用示例

```bash
# 1. 规划一本书
cd book-planner
# 触发词：书籍规划、写书大纲

# 2. 生成书籍PDF
cd advance_book_creator_v2
bash scripts/init-project.sh "项目目录" "书籍标题"

# 3. 创作小说
cd novel_vela_v3
python scripts/novel_cli.py init "小说名称" --genre "玄幻"

# 4. 分析作者风格
cd novel_anaylsis_pro
python scripts/analyze.py --input-dir "作者作品集路径"

# 5. 进行市场调研
cd survey-research-analyst
bash scripts/init-project.sh -n "AI工具市场调研" -t "market"

# 6. 网络搜索
cd metaso-search
python scripts/search.py -q "搜索关键词"
```

---

## 📂 项目结构

```
ai-skill/
├── advance_book_creator/          # 书籍PDF生成（MD-first v1）
├── advance_book_creator_v2/       # 书籍PDF生成（MD-first v2 增强版）
├── book-planner/                  # 书籍大纲规划
├── huashu-book-pdf-v2/            # 书籍PDF生成（HTML片段架构）
├── memory-system-v2/              # 三层文件记忆系统
├── metaso-search/                 # 秘塔AI搜索
├── novel_anaylsis_pro/            # 网文作者风格解析
├── novel_vela_pro/                # 小说创作工作台（工程化）
├── novel_vela_v3/                 # 小说创作全流程（V3融合版）
├── survey-research-analyst/       # 调研分析报告生成
├── trae-mem0/                     # Trae开发记忆系统
├── wenchaogong-style/             # 文抄公创作风格辅助
├── 设计文档汇总/                   # 各技能设计文档（待生成）
└── README.md                      # 本文件
```

---

## 🔗 技能协作关系

```
book-planner（规划）
    ↓
advance_book_creator_v2 / huashu-book-pdf-v2（执行写作）
    ↓
输出：PDF / HTML / Markdown

novel_vela_v3（小说项目管理）
    ↓
wenchaogong-style（风格参考）
    ↓
输出：小说正文

novel_anaylsis_pro（风格分析）
    ↓
输出：风格速查卡 → 可作为写作参考

memory-system-v2 / trae-mem0（记忆管理）
    ↓
跨技能共享：约定、决策、Bug修复

metaso-search（信息获取）
    ↓
支撑：调研、写作、风格分析
```

---

## 📝 License

MIT
