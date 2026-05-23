# novel-vela-v3 技能设计文档

> AI 小说创作全流程管理技能（V3 融合版）—— 两阶段协作模型，CLI 建骨架 + AI 填内容。

---

## 一、概述

### 1.1 技能定位

`novel-vela-v3` 是 AI 小说创作全流程管理技能的第三代融合版本。它基于四层规划模型（全书大纲 → 阶段规划 → 章节蓝图 → 正文写作），采用两阶段协作模式：

- **阶段 1（CLI 工具层）**：建骨架、管数据、出模板
- **阶段 2（AI 内容层）**：读模板、填内容、生成创作物

核心理念：**工具做工具该做的事，AI 做 AI 该做的事**。

### 1.2 版本演进

| 版本 | 核心特点 | 状态 |
|------|---------|------|
| V1 | 功能完整（RAG/audit/sync 全实现），但工作流描述不清晰 | 旧版 |
| V2 | 两阶段模型清晰，但 RAG/audit 是框架实现 | 旧版 |
| **V3** | **功能完整 + 两阶段清晰 + 路径增强** | **当前** |

### 1.3 核心价值

V3 版本的核心突破在于明确了**CLI 与 AI 的职责边界**：
- CLI 命令中的 `generate` = 生成模板文件（含占位符），不是生成最终内容
- 最终内容必须由 **AI 读取模板后填充**
- 两阶段必须按顺序执行：先 CLI 建骨架 → 再 AI 填内容

### 1.4 触发场景

- 初始化新小说项目
- 创建并填充大纲/蓝图/阶段规划
- 写作前获取强制上下文报告
- 管理人物/地图/伏笔等结构化数据
- RAG 语义搜索相关设定
- 审查章节一致性

---

## 二、架构设计

### 2.1 两阶段协作模型

```
┌─────────────────────────────────────────────────────┐
│  阶段1：CLI 工具层（novel_cli.py）                   │
│  职责：建骨架、管数据、出模板、RAG检索、审查同步      │
│  输出：目录结构 + SQLite库 + Markdown空模板           │
└──────────────────────┬──────────────────────────────┘
                       │ 模板文件就位后
                       ▼
┌─────────────────────────────────────────────────────┐
│  阶段2：AI 内容层（Claude/其他AI代理）               │
│  职责：读模板、填内容、生成具体创作物                 │
│  输入：小说信息.md + 文风参考 + 设计文档 + 模板       │
│  输出：填充完整的大纲/蓝图/正文                       │
└─────────────────────────────────────────────────────┘
```

### 2.2 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    阶段2：AI 创作层                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │ 大纲填充  │  │ 蓝图填充  │  │ 正文写作  │  │ 审查修正 │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
├─────────────────────────────────────────────────────────┤
│                    阶段1：CLI 工具层                      │
│  ┌────┐ ┌───────┐ ┌─────┐ ┌─────────┐ ┌────┐ ┌──────┐  │
│  │init│ │outline│ │stage│ │blueprint│ │ctx │ │audit │  │
│  └────┘ └───────┘ └─────┘ └─────────┘ └────┘ └──────┘  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                            │
│  │rag │ │sync│ │diag│ │err │                            │
│  └────┘ └────┘ └────┘ └────┘                            │
├─────────────────────────────────────────────────────────┤
│                    数据层                                 │
│  SQLite(novel.db) + Markdown(文档) + RAG(sqlite-vec)     │
│  + .learnings/(记忆系统)                                 │
└─────────────────────────────────────────────────────────┘
```

### 2.3 目录结构

```
novel_vela_v3/
├── SKILL.md                              # 技能入口文档
├── scripts/
│   ├── novel_cli.py                      # 主 CLI 入口（单文件，约900行）
│   └── init_template_db.py               # 模板数据库初始化脚本
├── assets/
│   └── templates/
│       └── novel_template.db             # 预生成的模板数据库
├── references/
│   ├── design-doc.md                     # 设计决策摘要
│   ├── cli-usage.md                      # CLI 使用手册
│   ├── database-schema.md                # 数据库 Schema 参考
│   ├── interaction-patterns.md           # 交互模式指南
│   └── style-analysis-template.md        # 文风分析模板
└── 小说设定生成Skill设计文档.md           # 历史设计文档
```

### 2.4 项目输出结构

```
《小说名称》/
├── plan/
│   ├── novel.db                          # SQLite数据库（CLI管理）
│   ├── 01-基础配置/
│   │   └── 小说基本信息.md                # CLI生成，AI可补充
│   ├── 02-核心设定/
│   │   ├── 参考作品与文风.md              # ⬅️ AI生成（步骤①后）
│   │   ├── 核心设定模板.md                # CLI生成（V1功能恢复）
│   │   └── 力量体系.md                    # AI按需填充
│   ├── 03-角色设定/
│   │   ├── 人物总览.md                    # sync db-to-md 自动生成
│   │   ├── 角色总览模板.md                # CLI生成（V1功能恢复）
│   │   └── （人物详细设定.md）            # ⬅️ AI按需创建
│   ├── 04-世界观/
│   │   ├── 世界观框架模板.md              # CLI生成（V1功能恢复）
│   │   └── （地图/势力/规则.md）          # ⬅️ AI按需填充
│   ├── 05-情节规划/
│   │   └── 全书大纲.md                   # ⚠️ CLI建壳 → AI填肉（关键）
│   └── 06-阶段规划/
│       ├── 阶段N-名称/
│       │   ├── 阶段概要.md               # ⚠️ CLI建壳 → AI填肉
│       │   └── 章节蓝图/
│       │       └── 第XXX章蓝图.md         # ⚠️ CLI建壳 → AI填肉（最细粒度）
│       └── 章节蓝图/                      # 统一蓝图根目录
├── characters/                           # AI管理
│   ├── 主角/
│   ├── 重要配角/
│   └── NPC/
└── 小说正文/                              # AI写作产出
    └── 第X部/
        └── 001.md, 002.md...
```

**图中标注含义**：
- 无标注 = CLI 纯粹创建
- ⬅️ = AI 主动生成
- ⚠️ = **CLI 创建空模板 → AI 必须填充**（最容易出问题的环节）

---

## 三、核心模块

### 3.1 CLI 主程序 (novel_cli.py)

**职责**：提供完整的命令行接口，封装所有项目操作。

**设计特点**：
- **单文件架构**：约 900 行，所有逻辑集中
- **Click 框架**：提供子命令分组和参数校验
- **自动路径识别**：支持三种路径模式

**命令分组**：
```
novel_cli.py
├── init           # 项目初始化
├── outline        # 大纲管理（create/show）
├── stage          # 阶段管理（add/list/remove）
├── blueprint      # 蓝图管理（generate/show）
├── character      # 人物管理（add/list/update）
├── context        # 上下文获取（get）
├── rag            # RAG检索（search/add/rebuild）
├── audit          # 审查（chapter/range）
├── sync           # 同步（db-to-md/check）
├── diagram        # 图解（character/timeline）
└── error          # 错误记录（log/list）
```

### 3.2 数据库管理（NovelDB）

**核心表（11 张）**：

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `novels` | 小说主表 | id, name, genre, total_chapters, total_words |
| `stages` | 阶段表 | id, novel_id, stage_number, name, start_chapter, end_chapter |
| `characters` | 人物表 | id, novel_id, name, type, status, importance, is_confirmed |
| `maps` | 地图表 | id, novel_id, name, description, level |
| `chapters` | 章节表 | id, novel_id, chapter_number, title, status, blueprint_md_path |
| `foreshadowing` | 伏笔表 | id, novel_id, description, status, chapter_planted, chapter_resolved |
| `character_relations` | 人物关系 | id, novel_id, character_a_id, character_b_id, relation_type |
| `character_appearances` | 人物出场 | id, chapter_id, character_id |
| `chapter_scenes` | 章节场景 | id, chapter_id, scene_number, description |
| `versions` | 版本记录 | id, novel_id, version, description, created_at |
| `rag_chunks` | RAG切片 | id, content_id, source_type, chunk_index, embedding |

### 3.3 RAG 向量检索（RAGRetriever）

**技术栈**：sqlite-vec + Ollama (nomic-embed-text, 768 维)

**完整功能**：
```python
class RAGRetriever:
    def add_chunk(content: str, source_type: str, source_id: int):
        """添加文本切片并生成向量嵌入"""

    def search(query: str, top_k: int = 5) -> list[dict]:
        """语义搜索（余弦相似度排序）"""

    def rebuild_index():
        """重建向量索引"""

    def get_status() -> dict:
        """查看索引状态"""
```

**使用前提**：
- 安装 Ollama 并运行本地服务
- 拉取嵌入模型：`ollama pull nomic-embed-text`
- 安装 Python 依赖：`pip install sqlite-vec requests`

### 3.4 上下文管理（ContextManager）

**动态上下文窗口**：
- 优先最近 3 章
- 累计字数不超过 10000 字
- 最多 5 章

**输出内容（7 部分）**：
```
1. 本章蓝图（从蓝图文件读取）
2. 前文摘要（动态计算）
3. 活跃人物状态（排除已死亡，按重要度排序）
4. 待回收伏笔（status='planted'）
5. 当前地图信息
6. RAG召回设定（可选，需Ollama）
7. 文风提示（从参考文档读取）
```

### 3.5 审查与同步（audit/sync）

#### 审查功能

**单章审查 (audit chapter)**：
- 检查蓝图完整性
- 检查人物一致性
- 检查伏笔呼应
- 检查战力体系合理性

**批量审查 (audit range)**：
- 对指定章节范围执行统一检查

#### 同步功能

**DB → Markdown (sync db-to-md)**：
- 人物数据 → `plan/03-角色设定/人物总览.md`
- 章节状态 → `plan/06-阶段规划/章节状态.md`

**一致性检查 (sync check)**：
- DB vs Markdown 数据对比
- 报告差异项

### 3.6 图解生成（diagram）

使用 Mermaid 生成可视化图表：
- **人物关系图**：`diagram character`
- **时间线**：`diagram timeline`

### 3.7 错误记录（error_logger）

分类记录和追踪问题：
```bash
python scripts/novel_cli.py error log --category character --severity major --desc "性格前后矛盾"
```

---

## 四、工作流程

### 4.1 完整工作流

```
╔═════════════════════════════════════════════════════════╗
║  阶段1：CLI 建骨架（工具执行）                          ║
╠═════════════════════════════════════════════════════════╣
║                                                        ║
║  ① init          → 创建项目目录 + 数据库 + 基础配置      ║
║         ↓                                              ║
║  ② outline create  → 创建全书大纲.md（空模板）           ║
║         ↓           ↓                                  ║
║  ③ stage add     → 创建各阶段的 阶段概要.md（空模板）    ║
║         ↓           ↓                                  ║
║  ④ blueprint init→ 创建各章的 第XXX章蓝图.md（空模板）   ║
║         ↓           ↓                                  ║
║  ⑤ character add → 向数据库添加人物记录                 ║
║                                                        ║
╚═══════════════════╤═══════════════════════════════════╝
                    │ 到这里，骨架已搭好
                    ▼
╔═════════════════════════════════════════════════════════╗
║  阶段2：AI 填内容（创作执行）                          ║
╠═════════════════════════════════════════════════════════╣
║                                                        ║
║  ⑥ AI读取 小说基本信息.md + 参考作品与文风.md           ║
║         ↓                                              ║
║  ⑦ AI填充 全书大纲.md（故事梗概/分阶段剧情/人物弧线）  ║
║         ↓                                              ║
║  ⑧ AI填充 各 阶段概要.md（剧情概要/目标/爽点/出场人物）║
║         ↓                                              ║
║  ⑨ AI填充 各 第XXX章蓝图.md（目标/场景/伏笔/爽点）     ║
║         ↓                                              ║
║  ⑩ context get  → 获取写作上下文报告（强制）          ║
║         ↓                                              ║
║  ⑪ write（AI写作正文）                                ║
║         ↓                                              ║
║  ⑫ audit sync    → 同步数据到Markdown                  ║
║                                                        ║
╚═════════════════════════════════════════════════════════╝
```

### 4.2 CLI 命令速查表

| 命令 | 阶段 | CLI 输出 | AI 后续动作 | 优先级 |
|------|------|---------|------------|--------|
| `init` | 1 | 项目目录+DB+基础信息.md | 生成文风参考文档 | 🟢 |
| `outline create` | 1 | 全书大纲.md（**空模板**） | 🔴 **必须填充**：故事梗概+分阶段剧情+人物弧线 | 🔴 |
| `stage add` | 1 | 阶段概要.md（**空模板**）+ DB记录 | 🟡 **建议填充**：剧情概要+目标+爽点 | 🟡 |
| `blueprint init` | 1 | 第XXX章蓝图.md（**空模板**）+ DB记录 | 🔴 **必须填充**：目标+场景+伏笔+爽点 | 🔴 |
| `character add` | 1 | 仅 DB记录 | 🟢 可选：创建人物详细设定md | 🟢 |
| `context get` | 2 | 实时上下文报告（无需填充） | 直接用于写作参考 | - |
| `write` | 2 | 写作准备提示 | AI 执行实际写作 | - |
| `rag search` | 2 | 语义搜索结果（需Ollama） | 直接用于参考 | - |
| `audit chapter` | 2 | 单章/批量审查报告 | 根据报告修正 | - |
| `sync db-to-md` | 2 | DB数据同步到Markdown | 检查一致性 | - |

> 🔴 = 必须由 AI 填充才能继续下一步 | 🟡 = 建议填充 | 🟢 = 可选

### 4.3 关键交互规则

当用户说"生成大纲"/"创建蓝图"时：
1. 先执行对应的 CLI 命令（创建模板）
2. **然后立即提醒用户/AI**："模板已创建，需要填充内容"
3. 如果当前环境有 AI 能力，**自动进入填充流程**

---

## 五、技术栈

### 5.1 运行时环境

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Python | 3.10+ | 运行环境 |
| SQLite | 3.35+ | 结构化数据存储 |
| Ollama | 最新 | 本地嵌入模型服务（RAG 可选） |

### 5.2 核心依赖

```
click>=8.0.0             # CLI 框架
httpx>=0.24.0            # HTTP 客户端（Ollama API 调用）
sqlite-vec>=0.1.0        # 向量检索扩展（可选）
```

### 5.3 存储架构

```
┌────────────────────────────────────────────────────┐
│                  混合存储架构                        │
├──────────────┬──────────────┬──────────────────────┤
│   SQLite     │   Markdown   │   RAG向量检索        │
│   (结构化)   │   (文档)     │   (语义搜索)         │
├──────────────┼──────────────┼──────────────────────┤
│ novels表     │ 小说正文.md  │ sqlite-vec存储       │
│ stages表     │ 大纲.md      │ nomic-embed-text     │
│ characters表 │ 蓝图.md      │ 768维嵌入向量        │
│ chapters表   │ 阶段概要.md  │ 余弦相似度排序       │
│ foresh表     │ 设定文档.md  │ 增量更新支持         │
│ relations表  │ 人物设定.md  │                      │
└──────────────┴──────────────┴──────────────────────┘
```

---

## 六、数据流

### 6.1 数据流图

```
用户输入（小说信息）
       │
       ▼
  ┌─────────────┐
  │ ① init      │───▶ 创建目录 + 复制模板DB + 基础信息.md
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ② outline   │───▶ 全书大纲.md（空模板）+ novels表记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ③ stage     │───▶ 阶段概要.md（空模板）+ stages表记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ④ blueprint │───▶ 章节蓝图.md（空模板）+ chapters表记录
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ⑤ character │───▶ characters表记录（无md文件）
  └──────┬──────┘
         ▼
     ════════ 阶段1结束，阶段2开始 ════════
         │
         ▼
  ┌─────────────┐
  │ ⑥ AI读取    │◀── 小说基本信息.md + 参考作品与文风.md
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ⑦-⑨ AI填充  │───▶ 大纲.md / 阶段.md / 蓝图.md 填充内容
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ⑩ context   │◀── 读取蓝图 + 查询DB + RAG召回 + 人物状态
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ⑪ write     │───▶ 生成 第X章.md 正文
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ ⑫ audit+sync│───▶ 审查报告 + DB→Markdown同步
  └─────────────┘
```

### 6.2 核心数据模型

```python
class Novel:
    id: int
    name: str                   # 小说名称
    genre: str                  # 类型
    sub_genre: str              # 子类型
    target_audience: str        # 目标受众
    story_structure: str        # 故事结构
    narrative_perspective: str  # 叙事视角
    total_chapters: int         # 总章数
    words_per_chapter: int      # 每章字数
    total_words: int            # 总字数
    status: str                 # 状态

class Stage:
    id: int
    novel_id: int
    stage_number: int
    name: str
    description: str
    start_chapter: int
    end_chapter: int

class Character:
    id: int
    novel_id: int
    name: str
    type: str                   # 主角/重要配角/NPC
    status: str                 # 活跃/死亡/离开
    importance: int             # 1-10
    is_confirmed: bool          # 是否确认

class Chapter:
    id: int
    novel_id: int
    chapter_number: int
    title: str
    status: str                 # 未写/草稿/完成
    blueprint_md_path: str      # 蓝图文件路径
```

---

## 七、关键设计决策

### 7.1 单文件 CLI vs 模块化包

**决策**：采用单文件 `novel_cli.py`（约 900 行）。

**原因**：
- Skill 场景下不需要包的复用性
- 减少文件依赖，便于分发
- 所有逻辑集中，易于调试

### 7.2 两层规划模型详解

```
Layer 1: 全书大纲（10000字+）
├── 故事梗概
├── 分阶段剧情描述
├── 主要人物弧线
└── 关键转折点
↓
Layer 2: 阶段规划（按字数拆分）
├── 阶段剧情概要
├── 阶段目标
├── 爽点设计
└── 出场人物清单
↓
Layer 3: 章节蓝图（参考 write-plans 技能）
├── 章节级 spec 文档
├── 场景分解
├── 人物出场清单
└── 伏笔操作
↓
Layer 4: 正文写作
├── 按场景逐个生成
├── 自动合并
├── 去AI味处理
└── 复核流程
```

### 7.3 去 AI 味三层防护

#### 第一层：Prompt 约束

在写作提示词中明确禁止：
- 总结性结尾（"从此..."、"从此以后..."）
- 过度心理描写（"他心中暗想..."）
- AI 特有表达（"让我们..."）

#### 第二层：文风学习

初始化时分析参考小说：
- 句式长度分布
- 对话占比
- 描写密度
- 生成文风总结文档供写作时参考

#### 第三层：后处理修正

写作后检测并替换：
- AI 常用句式 → 更自然的表达
- 过于工整的结构 → 增加变化
- 缺乏细节 → 补充感官描写

### 7.4 路径处理策略

**三种路径模式**：
1. **直接模式**：`project_dir/plan/novel.db`
2. **书名目录模式**：`《书名》/plan/novel.db`
3. **子目录搜索**：在 project_dir 下查找 `《书名》` 子目录

**关键函数**：
- `find_novel_db(project_dir)` - 自动识别三种模式
- `get_novel_dir(project_dir, novel_name)` - 获取小说根目录

### 7.5 模板数据库 Copy 方案

**决策**：预生成 `novel_template.db`，初始化时 copy 到项目目录。

**原因**：
- 避免每次初始化执行 DDL（性能 + 可靠性）
- 可预设枚举数据和默认配置
- 用户可自定义模版

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
C:\Python\Python313\python.exe scripts/novel_cli.py init "武动乾坤" --genre "玄幻" --words 4500000 --chapters 750

# 2. 创建全书大纲
C:\Python\Python313\python.exe scripts/novel_cli.py outline create

# 3. 添加阶段
C:\Python\Python313\python.exe scripts/novel_cli.py stage add 1 --name "小镇少年" --start 1 --end 50

# 4. 生成章节蓝图
C:\Python\Python313\python.exe scripts/novel_cli.py blueprint generate 1 50

# 5. 添加人物
C:\Python\Python313\python.exe scripts/novel_cli.py character add "林动" --type "主角" --importance 10

# 6. 获取写作上下文
C:\Python\Python313\python.exe scripts/novel_cli.py context get 1

# 7. 审查章节
C:\Python\Python313\python.exe scripts/novel_cli.py audit chapter 1

# 8. 同步数据
C:\Python\Python313\python.exe scripts/novel_cli.py sync db-to-md
```

### 8.3 注意事项

1. **Python 路径**：必须使用 `C:\Python\Python313\python.exe`
2. **依赖安装**：`C:\Python\Python313\python.exe -m pip install click requests sqlite-vec`
3. **路径处理**：CLI 自动识别三种路径模式
4. **蓝图纸置**：统一存放在 `06-阶段规划/章节蓝图/` 目录
5. **模版数据库**：位于 `assets/templates/novel_template.db`
6. **⚠️ 最重要**：`outline create` / `blueprint init` / `stage add` 只创建**空模板**，必须由 AI 填充实际内容
7. **RAG 前提**：需要 Ollama 服务运行，否则 `rag search` 会提示未安装

### 8.4 与 Vela 软件的差异

| 功能 | Vela | 本 Skill |
|------|------|---------|
| 交互方式 | GUI 表单 | CLI + 自然语言 |
| 数据存储 | 内部格式 | SQLite + Markdown |
| AI 调用 | 内置 | 外部（用户自选） |
| 平台支持 | Windows/Mac | 跨平台（Python） |
| 扩展性 | 封闭 | 开放（可修改脚本） |
| RAG | 未实现 | sqlite-vec + Ollama |

---

## 九、参考文档

- [设计决策摘要](../novel_vela_v3/references/design-doc.md)
- [CLI 使用手册](../novel_vela_v3/references/cli-usage.md)
- [数据库 Schema 参考](../novel_vela_v3/references/database-schema.md)
- [交互模式指南](../novel_vela_v3/references/interaction-patterns.md)
- [文风分析模板](../novel_vela_v3/references/style-analysis-template.md)
