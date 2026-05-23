# novel-vela-pro 技能设计文档

> 工程化管理的 AI 小说创作工作台 —— 从设定生成到正文写作的全流程管理。

---

## 一、概述

### 1.1 技能定位

`novel-vela-pro` 是一个工程化管理的 AI 小说创作工作台。它将软件工程的项目管理理念引入小说创作领域，提供从设定生成、角色设计、世界观构建、大纲规划、阶段拆分、章节蓝图到正文写作的完整工作流。

核心理念：**用工程的确定性管理创作的不确定性**。

### 1.2 核心价值

传统小说创作面临的核心问题：
- **上下文丢失**：写到第 500 章忘记第 10 章的伏笔
- **设定跑偏**：人物能力前后矛盾，世界观不一致
- **结构混乱**：大纲与正文脱节，阶段目标不清晰

本技能通过 SQLite + Markdown + RAG + 记忆系统四层架构，确保创作的连贯性和一致性。

### 1.3 触发场景

- 创建新小说项目
- 管理小说设定/角色/世界观
- 规划全书大纲和阶段
- 生成章节蓝图
- 获取写作上下文
- 审查章节一致性
- 生成设定图解

---

## 二、架构设计

### 2.1 整体架构

采用**工具层 + 数据层 + 创作层**三层架构：

```
┌─────────────────────────────────────────────────────────┐
│                    创作层 (AI Agent)                      │
│  读取模板 → 填充内容 → 写作正文 → 审查修正                  │
├─────────────────────────────────────────────────────────┤
│                    工具层 (CLI 工具)                      │
│  init | outline | stage | blueprint | context | audit    │
│  rag | diagram | error | learnings | sync               │
├─────────────────────────────────────────────────────────┤
│                    数据层 (存储系统)                       │
│  SQLite (结构化数据) + Markdown (文档) + RAG (向量检索)   │
│  + .learnings/ (记忆系统)                                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
novel_vela_pro/
├── SKILL.md                              # 技能入口文档
├── scripts/
│   └── novel_cli.py                      # 主 CLI 入口（Click 框架）
├── core/                                 # 核心功能模块
│   ├── db.py                             # 数据库管理（NovelDB）
│   ├── context.py                        # 上下文管理（ContextManager）
│   ├── rag.py                            # RAG 向量检索（RAGRetriever）
│   ├── sync_manager.py                   # DB-Markdown 同步管理
│   ├── diagram.py                        # Mermaid 图解生成
│   ├── error_logger.py                   # 错误记录器
│   ├── learnings.py                      # 记忆系统管理
│   └── index_manager.py                  # 向量索引管理
├── references/
│   ├── cli-usage.md                      # CLI 使用手册
│   └── database-schema.md                # 数据库 Schema 参考
├── .learnings-template/                  # 记忆系统模板
│   ├── CORE/
│   │   ├── CHARACTERS.md.template
│   │   ├── ERRORS.md.template
│   │   └── STORY_BIBLE.md.template
│   ├── EXTENDED/
│   │   ├── FORESHADOWING.md.template
│   │   └── POWER_SYSTEM.md.template
│   └── STYLE/
│       └── WRITING_STYLE.md.template
└── requirements.txt                      # Python 依赖
```

### 2.3 项目输出结构

执行 `init` 命令后创建的完整项目结构：

```
《小说名称》/
├── plan/                                 # 规划与数据
│   ├── novel.db                          # SQLite 数据库
│   ├── 01-基础配置/
│   │   └── 小说基本信息.md                # 类型、字数、目标受众
│   ├── 02-核心设定/
│   │   ├── 核心设定模板.md                # 世界观核心规则
│   │   └── 力量体系.md                    # 等级、能力、限制
│   ├── 03-角色设定/
│   │   └── 角色总览模板.md                # 角色属性、关系
│   ├── 04-世界观/
│   │   └── 世界观框架模板.md              # 地图、势力、规则
│   ├── 05-情节规划/
│   │   └── 全书大纲.md                    # 故事梗概、阶段划分
│   └── 06-阶段规划/
│       ├── 阶段N-名称/
│       │   ├── 阶段概要.md                # 本阶段剧情概要
│       │   └── 章节蓝图/
│       │       └── 第XXX章蓝图.md         # 单章写作蓝图
│       └── 章节蓝图/                      # 统一蓝图根目录
├── characters/                           # 角色详情
│   ├── 主角/
│   ├── 重要配角/
│   └── NPC/
├── 小说正文/                              # 写作产出
│   └── 第X部/
│       └── 001.md, 002.md...
└── .learnings/                           # 记忆系统
    ├── CORE/
    ├── EXTENDED/
    └── STYLE/
```

---

## 三、核心模块

### 3.1 数据库管理模块 (db.py)

**职责**：封装所有 SQLite 数据库操作，提供上下文管理器支持。

**核心数据表（11 张）**：

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `novels` | 小说主表 | name, genre, total_chapters, total_words |
| `stages` | 阶段表 | stage_number, name, start_chapter, end_chapter |
| `characters` | 人物表 | name, type, status, importance (1-10) |
| `maps` | 地图表 | name, description, level |
| `chapters` | 章节表 | chapter_number, title, status, blueprint_md_path |
| `foreshadowing` | 伏笔表 | description, status (planted/resolved), chapter_planted |
| `character_relations` | 人物关系表 | character_a, character_b, relation_type |
| `character_appearances` | 人物出场表 | chapter_id, character_id |
| `chapter_scenes` | 章节场景表 | chapter_id, scene_number, description |
| `versions` | 版本表 | version, description, created_at |
| `rag_chunks` | RAG 切片表 | content, embedding, source_type |

**设计特点**：
- 使用上下文管理器确保连接安全关闭
- 模板数据库 Copy 方案（预生成 novel_template.db，初始化时复制）
- 避免每次初始化执行 DDL，提高性能和可靠性

### 3.2 RAG 向量检索模块 (rag.py)

**职责**：提供语义搜索能力，防止写作时设定跑偏。

**技术栈**：
- **sqlite-vec**：纯 C 扩展，与 SQLite 无缝集成
- **Ollama**：本地运行，隐私安全
- **nomic-embed-text**：768 维嵌入模型，中文效果好

**完整功能**：
```python
class RAGRetriever:
    def add_chunk(content, source_type, source_id):
        """添加文本切片并生成向量嵌入"""

    def search(query, top_k=5):
        """语义搜索（余弦相似度排序）"""

    def rebuild_index():
        """重建向量索引"""

    def get_status():
        """查看索引状态"""
```

**切片策略**：
- 按段落切片（而非固定字数）
- 保留元信息（来源类型、来源 ID）
- 支持增量更新

### 3.3 上下文管理模块 (context.py)

**职责**：写作前强制加载上下文报告，确保 AI 获得完整背景信息。

**动态上下文窗口**：
- 优先最近 3 章
- 累计字数不超过 10000 字
- 最多 5 章

**输出内容（7 部分）**：
```
1. 本章蓝图（从蓝图文件读取）
2. 前文摘要（动态计算，基于最近章节）
3. 活跃人物状态（排除已死亡，按重要度排序）
4. 待回收伏笔（status='planted'）
5. 当前地图信息
6. RAG 召回设定（可选，需 Ollama 服务）
7. 文风提示（从参考文档读取）
```

**强制规则**：写作前必须执行 `context get` 命令，确保不丢失上下文。

### 3.4 审查与同步模块

#### 审查功能 (audit)

**单章审查 (audit chapter)**：
- 检查蓝图完整性（目标、场景、伏笔是否齐全）
- 检查人物一致性（人物行为是否符合设定）
- 检查伏笔呼应（是否有埋无收）
- 检查战力体系合理性（是否有越级战斗无合理解释）

**批量审查 (audit range)**：
- 对指定章节范围执行统一检查
- 生成批量审查报告

#### 同步功能 (sync)

**DB → Markdown (sync db-to-md)**：
- 人物数据 → `plan/03-角色设定/人物总览.md`
- 章节状态 → `plan/06-阶段规划/章节状态.md`

**一致性检查 (sync check)**：
- DB vs Markdown 数据对比
- 报告差异项，便于人工修正

### 3.5 图解生成模块 (diagram.py)

**职责**：使用 Mermaid 生成可视化图表。

**支持的图表类型**：
- **人物关系图**：角色之间的关系网络
- **时间线**：关键事件的时间顺序
- **阶段流程图**：阶段之间的逻辑关系
- **力量体系图**：等级与能力对照

### 3.6 错误记录模块 (error_logger.py)

**职责**：分类记录和追踪创作过程中的问题。

**错误分类**：
| 分类 | 说明 | 示例 |
|------|------|------|
| character | 人物相关 | 性格前后矛盾、能力不一致 |
| plot | 剧情相关 | 逻辑漏洞、伏笔未回收 |
| world | 世界观相关 | 设定冲突、地图不一致 |
| style | 文风相关 | 语气突变、叙述视角混乱 |
| continuity | 连续性 | 时间线错误、地点穿越 |

**严重级别**：
- **major**：影响阅读体验，必须修正
- **minor**：不影响主线，建议修正
- **cosmetic**：表面问题，可选修正

### 3.7 记忆系统模块 (learnings.py)

**职责**：管理可读的记忆文件，记录创作过程中的经验教训。

**三层架构**：
```
.learnings/
├── CORE/                              # 核心记忆
│   ├── CHARACTERS.md                  # 角色记忆
│   ├── ERRORS.md                      # 错误与修正
│   └── STORY_BIBLE.md                 # 故事圣经
├── EXTENDED/                          # 扩展记忆
│   ├── FORESHADOWING.md              # 伏笔追踪
│   └── POWER_SYSTEM.md               # 力量体系记忆
└── STYLE/                             # 风格记忆
    └── WRITING_STYLE.md              # 写作风格偏好
```

---

## 四、工作流程

### 4.1 标准工作流

```
╔══════════════════════════════════════════════════════════╗
║  第一阶段：项目初始化                                     ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py init "小说名称" --genre "玄幻" --words 4500000 --chapters 750
    │
    ├── 创建项目目录结构
    ├── 复制模板数据库
    ├── 生成小说基本信息.md
    └── 初始化 .learnings/ 目录

╔══════════════════════════════════════════════════════════╗
║  第二阶段：大纲规划                                       ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py outline create
    │
    └── 创建全书大纲.md（空模板）
        └── AI 填充：故事梗概 + 分阶段剧情 + 人物弧线

╔══════════════════════════════════════════════════════════╗
║  第三阶段：阶段拆分                                       ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py stage add 1 --name "废柴崛起" --start 1 --end 50
python novel_cli.py stage list
    │
    └── 创建各阶段的 阶段概要.md（空模板）
        └── AI 填充：剧情概要 + 目标 + 爽点 + 出场人物

╔══════════════════════════════════════════════════════════╗
║  第四阶段：章节蓝图                                       ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py blueprint generate 1 50
    │
    └── 创建各章的 第XXX章蓝图.md（空模板）+ DB 记录
        └── AI 填充：目标 + 场景 + 伏笔 + 爽点

╔══════════════════════════════════════════════════════════╗
║  第五阶段：上下文获取 → 写作                              ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py context get 1
    │
    ├── 本章蓝图
    ├── 前文摘要（最近 3-5 章）
    ├── 活跃人物状态
    ├── 待回收伏笔
    ├── RAG 召回设定
    └── 文风提示
    │
    ▼ AI 写作第 1 章正文

╔══════════════════════════════════════════════════════════╗
║  第六阶段：审查与同步                                     ║
╚══════════════════════════════════════════════════════════╝
    │
    ▼
python novel_cli.py audit chapter 1
python novel_cli.py sync db-to-md
    │
    └── 生成审查报告 + 同步数据到 Markdown
```

### 4.2 常用命令速查

```bash
# 项目管理
python scripts/novel_cli.py init "小说名称" --genre "玄幻" --words 4500000 --chapters 750

# 阶段管理
python scripts/novel_cli.py stage add 1 --name "废柴崛起" --start 1 --end 50
python scripts/novel_cli.py stage list

# 章节蓝图
python scripts/novel_cli.py blueprint generate 1 50

# 上下文获取
python scripts/novel_cli.py context get 1

# 审查与同步
python scripts/novel_cli.py audit chapter 1
python scripts/novel_cli.py audit range 1-10
python scripts/novel_cli.py sync db-to-md
python scripts/novel_cli.py sync check

# RAG 语义搜索
python scripts/novel_cli.py rag search "主角能力"

# 图解生成
python scripts/novel_cli.py diagram character
python scripts/novel_cli.py diagram timeline

# 错误记录
python scripts/novel_cli.py error log --category character --severity major --desc "性格前后矛盾"
```

---

## 五、技术栈

### 5.1 运行时环境

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Python | 3.10+ | 运行环境 |
| SQLite | 3.35+ | 结构化数据存储 |
| Ollama | 最新 | 本地嵌入模型服务（可选） |

### 5.2 核心依赖

```
# requirements.txt
click>=8.0.0             # CLI 框架
httpx>=0.24.0            # HTTP 客户端（Ollama API 调用）
sqlite-vec>=0.1.0        # 向量检索扩展（可选）
```

### 5.3 存储架构

```
┌───────────────────────────────────────────────────┐
│                  存储层                             │
├────────────┬────────────┬────────────┬────────────┤
│  SQLite    │ Markdown   │ RAG向量    │ .learnings │
│  (结构化)  │  (文档)    │  (语义)    │  (记忆)    │
├────────────┼────────────┼────────────┼────────────┤
│ novels表   │ 正文.md    │ rag_chunks │ CORE/      │
│ stages表   │ 大纲.md    │ 嵌入向量   │ EXTENDED/  │
│ chars表    │ 蓝图.md    │ 768维     │ STYLE/     │
│ chapters表 │ 设定.md    │            │            │
│ foresh表   │ 阶段.md    │            │            │
└────────────┴────────────┴────────────┴────────────┘
```

**设计理由**：
- **SQLite**：强一致性的结构化查询（人物状态、章节关系）
- **Markdown**：便于用户直接阅读和编辑
- **RAG**：语义搜索防止设定跑偏
- **.learnings/**：可读的记忆文件，记录经验教训

---

## 六、数据流

### 6.1 数据流图

```
用户输入（小说信息）
       │
       ▼
  ┌─────────────┐
  │ init 初始化  │───▶ 创建目录结构 + 复制模板DB + 生成基础信息.md
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ outline      │───▶ 创建全书大纲.md + DB记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ stage add    │───▶ 创建阶段概要.md + stages表记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ blueprint    │───▶ 创建章节蓝图.md + chapters表记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ context get  │◀── 读取蓝图 + 查询DB + RAG召回
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ AI 写作正文   │───▶ 生成 第X章.md
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ audit 审查   │───▶ 检查蓝图完整性 + 人物一致性 + 伏笔呼应
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ sync 同步    │───▶ DB → Markdown 数据同步
  └─────────────┘
```

### 6.2 核心数据模型

```python
# Novel 小说
class Novel:
    id: int
    name: str                   # 小说名称
    genre: str                  # 类型
    sub_genre: str              # 子类型
    target_audience: str        # 目标受众
    total_chapters: int         # 总章数
    words_per_chapter: int      # 每章字数
    total_words: int            # 总字数
    status: str                 # 状态

# Stage 阶段
class Stage:
    id: int
    novel_id: int               # 小说ID
    stage_number: int           # 阶段序号
    name: str                   # 阶段名称
    start_chapter: int          # 起始章节
    end_chapter: int            # 结束章节

# Character 人物
class Character:
    id: int
    novel_id: int               # 小说ID
    name: str                   # 姓名
    type: str                   # 类型 (主角/配角/NPC)
    status: str                 # 状态 (活跃/死亡/离开)
    importance: int             # 重要度 (1-10)

# Chapter 章节
class Chapter:
    id: int
    novel_id: int               # 小说ID
    chapter_number: int         # 章节号
    title: str                  # 标题
    status: str                 # 状态 (未写/草稿/完成)
    blueprint_md_path: str      # 蓝图路径
```

---

## 七、关键设计决策

### 7.1 SQLite + Markdown 混合存储

**决策**：结构化数据用 SQLite，正文和设定文档用 Markdown。

**原因**：
- SQLite 提供强一致性的查询能力（人物状态、章节关系、伏笔追踪）
- Markdown 便于用户直接阅读和编辑
- 避免纯 Markdown 方案的数据不一致问题
- 避免纯数据库方案的用户不可读问题

### 7.2 模板数据库 Copy 方案

**决策**：预生成 `novel_template.db`，初始化时 copy 到项目目录。

**原因**：
- 避免每次初始化执行 DDL（提高性能和可靠性）
- 可预设枚举数据和默认配置
- 用户可自定义模版（修改 template.db 即可）

### 7.3 强制上下文读取机制

**决策**：写作前必须执行 `context get` 命令。

**原因**：
- 确保 AI 获得完整上下文（前文摘要、人物状态、伏笔等）
- 减少上下文断裂导致的逻辑错误
- 提供明确的检查点，防止跳过关键信息

### 7.4 统一蓝图目录

**决策**：所有章节蓝图存放在 `06-阶段规划/章节蓝图/` 而非各阶段子目录。

**原因**：
- 简化路径查找逻辑
- 避免阶段划分调整时的文件迁移
- 便于批量操作（如批量生成、批量审查）

### 7.5 RAG 技术选型：sqlite-vec + Ollama

**决策**：使用 sqlite-vec 作为向量存储，Ollama 提供嵌入模型。

**原因**：
- sqlite-vec 是纯 C 扩展，无 Python 依赖，与 SQLite 无缝集成
- Ollama 本地运行，隐私安全，支持多种嵌入模型
- nomic-embed-text 模型较小（768 维），中文效果好

---

## 八、使用说明

### 8.1 环境准备

```bash
# 安装依赖
C:\Python\Python313\python.exe -m pip install click requests sqlite-vec

# 安装 Ollama（可选，用于 RAG）
# 下载 https://ollama.com 并安装
ollama pull nomic-embed-text
```

### 8.2 快速开始

```bash
# 1. 创建新项目
python scripts/novel_cli.py init "武动乾坤" --genre "玄幻" --words 4500000 --chapters 750

# 2. 添加阶段
python scripts/novel_cli.py stage add 1 --name "小镇少年" --start 1 --end 50

# 3. 生成章节蓝图
python scripts/novel_cli.py blueprint generate 1 50

# 4. 获取写作上下文
python scripts/novel_cli.py context get 1

# 5. 审查章节
python scripts/novel_cli.py audit chapter 1
```

### 8.3 路径处理策略

CLI 自动识别三种路径模式：
1. **直接模式**：`project_dir/plan/novel.db`
2. **书名目录模式**：`《书名》/plan/novel.db`
3. **子目录搜索**：在 project_dir 下查找 `《书名》` 子目录

### 8.4 注意事项

1. **Python 路径**：必须使用 `C:\Python\Python313\python.exe`
2. **RAG 前提**：需要 Ollama 服务运行，否则 `rag search` 会提示未安装
3. **模版数据库**：位于 `assets/templates/novel_template.db`
4. **蓝图纸置**：统一存放在 `06-阶段规划/章节蓝图/` 目录

---

## 九、参考文档

- [CLI 使用手册](../novel_vela_pro/references/cli-usage.md)
- [数据库 Schema 参考](../novel_vela_pro/references/database-schema.md)
