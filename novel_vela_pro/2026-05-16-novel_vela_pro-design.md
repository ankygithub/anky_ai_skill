# Novel Vela Pro 设计文档

> 版本：v1.0
> 日期：2026-05-16
> 状态：✅ 已定稿
> 基于：小说设定生成Skill设计文档.md (蓝本) + novel_vela + novel-generator-pro 融合

---

## 一、设计决策记录

### 1.1 核心定位决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **融合策略** | 工程化+创作指导融合 | 保留 vela 的技术骨架，注入 pro 的创作指导能力 |
| **架构方案** | 方案B：重构式融合 | 完全重写，统一架构设计，最佳用户体验 |
| **数据架构** | 双轨并行 (SQLite + .learnings/) | 兼顾工程化查询和 AI 可读性 |

### 1.2 功能优先级决策

| 优先级 | 功能 | 来源 | 状态 |
|--------|------|------|------|
| **P0 核心** | .learnings/ 记忆系统 (16个文件) | pro | ✅ 必须融合 |
| **P0 核心** | 提示词10维自动补全 | pro | ✅ 必须融合 |
| **P1 增强** | Mermaid 图解生成 | pro | ✅ 融合 |
| **P1 增强** | 错误记录 + 质量检查 | pro | ✅ 融合 |
| ❌ 未选 | 专用章节生成模板 | pro | 不融合（保持蓝图灵活性）|
| ❌ 未选 | 文抄公风格 + 爽文公式 | pro | 不融合（保持风格通用性）|

### 1.3 关键技术决策

| 决策点 | 选择 | 影响 |
|--------|------|------|
| **RAG 定位** | 核心基础设施层，渗透到6个引擎 | 防跑偏的核心能力 |
| **触发时机** | Init 时智能引导（自然语言→10维补全）| 用户体验优先 |
| **同步机制** | SQLite 主数据源 + .learnings/ 视图 | 单一数据源原则 |

---

## 二、定位与目标

### 2.1 产品定位

```
┌─────────────────────────────────────────────────────┐
│           Novel Vela Pro                            │
│     "工程化管理的AI小说创作工作台"                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🎯 目标用户:                                       │
│  - 需要系统化管理长篇网文(100万字+)的作者             │
│  - 使用AI辅助写作但需要质量控制的专业创作者          │
│  - 追求设定一致性和剧情连贯性的严肃写手              │
│                                                     │
│  💡 核心价值:                                       │
│  - 工程化管理: SQLite + CLI + RAG                   │
│  - 创作指导: 提示词补全 + 记忆系统 + 图解            │
│  - 质量保障: 9维复核 + 错误记录 + 去AI味             │
│                                                     │
│  🔄 与前版对比:                                      │
│  - vs novel_vela: +创作指导能力, +可视化, +错误追踪 │
│  - vs novel-generator-pro: +工程化, +RAG, +审查同步 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 设计原则

1. **分层规划**: 大纲 → 阶段 → 蓝图 → 正文，层层细化
2. **双轨存储**: SQLite (结构化) + .learnings/ (可读性) + RAG (向量检索)
3. **RAG 深度集成**: 渗透到每个引擎，防跑偏的核心能力
4. **人机协作**: AI生成 + 用户确认，绝不擅自覆盖
5. **强制上下文**: 写作前必须执行 `context get`，防止上下文断裂
6. **质量闭环**: 写作 → 复核 → 错误记录 → 改进 → 再写作
7. **模块化解耦**: 引擎层与核心层分离，便于维护和扩展

---

## 三、整体架构

### 3.1 目录结构

```
novel_vela_pro/
├── SKILL.md                              # 融合版 Skill 规范
├── README.md                             # 快速开始指南
│
├── scripts/
│   ├── novel_cli.py                      # CLI 入口（精简，只负责命令路由）
│   ├── init_novel.py                     # 初始化引擎（含10维智能引导）
│   ├── prompt_engine.py                  # 提示词引擎（10维自动补全）
│   ├── outline_engine.py                 # 大纲生成引擎
│   ├── stage_engine.py                   # 阶段规划引擎
│   ├── blueprint_engine.py               # 蓝图生成引擎
│   ├── write_engine.py                   # 写作引擎（含去AI味）
│   └── review_engine.py                  # 复核引擎
│
├── core/                                 # 核心模块（从单文件拆分）
│   ├── __init__.py
│   ├── db.py                             # SQLite 数据库操作
│   ├── learnings.py                      # .learnings/ 记忆管理器
│   ├── context.py                        # 上下文管理器
│   ├── rag.py                            # RAG 向量检索（核心!）
│   ├── style.py                          # 文风分析与管理
│   ├── diagram.py                        # Mermaid 图解生成
│   ├── error_logger.py                   # 错误记录器
│   └── sync_manager.py                   # 双轨同步管理器
│
├── references/
│   ├── design-doc.md                     # 完整设计文档
│   ├── database-schema.md                # 数据库 Schema
│   ├── prompt-guide.md                   # 提示词补全指南
│   ├── learnings-guide.md                # 记忆系统使用指南
│   ├── diagram-guide.md                  # 图解使用指南
│   ├── style-analysis-template.md        # 文风分析模板
│   └── cli-usage.md                      # CLI 完整使用手册
│
├── assets/
│   ├── templates/
│   │   └── novel_template.db             # 模板数据库
│   ├── PROMPT-TEMPLATE.md                # 提示词模板（从pro迁移）
│   ├── CHAPTER-CHECKLIST.md              # 章节质量检查清单
│   └── QUALITY-STANDARDS.md              # 质量标准文档
│
└── .learnings-template/                  # 一等公民：记忆文件模板
    ├── CORE/                             # 核心层（5个）- 每章必读
    │   ├── CHARACTERS.md.template
    │   ├── LOCATIONS.md.template
    │   ├── PLOT_POINTS.md.template
    │   ├── STORY_BIBLE.md.template
    │   └── ERRORS.md.template
    ├── EXTENDED/                         # 扩展层（9个）- 按需读取
    │   ├── TIMELINE.md.template
    │   ├── RELATIONSHIPS.md.template
    │   ├── FORESHADOWING.md.template
    │   ├── ARCS.md.template
    │   ├── ITEMS.md.template
    │   ├── POWER_SYSTEM.md.template
    │   ├── MAPS.md.template
    │   ├── STATS.md.template
    │   └── STYLE_GUIDE.md.template
    └── STYLE/                            # 风格层（2个）- 风格控制
        ├── WRITING_STYLE.md.template
        └── TEMPLATES_USED.md.template
```

### 3.2 模块职责划分

| 模块 | 文件 | 职责 | 来源 |
|------|------|------|------|
| **CLI入口** | `novel_cli.py` | 命令路由、参数解析、用户交互 | vela 重构 |
| **初始化引擎** | `init_novel.py` | 项目初始化 + 10维智能引导 | vela + pro 融合 |
| **提示词引擎** | `prompt_engine.py` | 10维提示词生成/验证/完善 | **pro 独有** |
| **大纲引擎** | `outline_engine.py` | 大纲生成与管理 | vela |
| **阶段引擎** | `stage_engine.py` | 阶段规划与拆分 | vela |
| **蓝图引擎** | `blueprint_engine.py` | 章节蓝图生成 | vela |
| **写作引擎** | `write_engine.py` | 正文写作 + 去AI味 | vela 增强 |
| **复核引擎** | `review_engine.py` | 9维复核与审查 | vela 增强 |
| **数据库核心** | `core/db.py` | SQLite CRUD 操作 | vela |
| **记忆管理器** | `core/learnings.py` | .learnings/ 读写同步 | **pro 独有** |
| **上下文管理** | `core/context.py` | 上下文窗口管理 | vela |
| **RAG检索** | `core/rag.py` | 向量检索（核心能力）| vela 核心 |
| **文风管理** | `core/style.py` | 文风分析学习 | vela |
| **图解生成** | `core/diagram.py` | Mermaid 图解生成 | **pro 独有** |
| **错误记录** | `core/error_logger.py` | 错误记录与分析 | **pro 独有** |
| **同步管理** | `core/sync_manager.py` | DB ↔ .learnings 双向同步 | **融合创新** |

### 3.3 架构分层图

```
┌─────────────────────────────────────────────────────┐
│                  用户交互层                           │
│            (CLI / 自然对话 / Skill调用)               │
├─────────────────────────────────────────────────────┤
│                  引擎层（业务逻辑）                    │
│  Init → Prompt → Outline → Stage → Blueprint        │
│         → Write → Review → Diagram → Error          │
├─────────────────────────────────────────────────────┤
│                  核心层（基础设施）                    │
│  DB | Learnings | Context | RAG | Style | Diagram     │
│       | SyncManager | ErrorLogger                    │
├─────────────────────────────────────────────────────┤
│                  数据层（三重架构）                    │
│  Layer 1: SQLite (结构化存储)                        │
│  Layer 2: RAG 向量检索 (语义搜索)                     │
│  Layer 3: .learnings/ (可读记忆)                     │
└─────────────────────────────────────────────────────┘
```

### 3.4 架构设计原则

1. **引擎与核心分离**: 业务逻辑（引擎）与基础设施（核心）解耦
2. **三重数据层**: SQLite (工程化) + RAG (语义检索) + .learnings/ (可读性)
3. **单一职责**: 每个引擎只负责一个工作流阶段
4. **RAG 作为基础设施**: 渗透到每个引擎，不是独立工具
5. **配置驱动**: 可通过配置启用/禁用功能模块
6. **插件友好**: 核心模块可独立测试和替换

---

## 四、数据模型（三重架构）

### 4.1 架构总览

```
┌─────────────────────────────────────────────────────┐
│              数据存储的三重架构                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Layer 1: SQLite 结构化数据                         │
│  ├── 用途: 查询/统计/审查/CLI 操作                   │
│  ├── 操作: character add / audit chapter / stats    │
│  └── 特点: ACID事务、复杂查询、批量操作              │
│                                                     │
│  Layer 2: 🌟 RAG 向量检索 (核心!)                   │
│  ├── 用途: 语义搜索，防止正文跑偏                    │
│  ├── 存入: 写作后立即向量化 (rag index)              │
│  ├── 召回: 写作前 CLI 搜索 (rag search)             │
│  └── 示例: "主角当前武器" → 召出相关设定切片         │
│                                                     │
│  Layer 3: .learnings/ 可读记忆                      │
│  ├── 用途: AI 快速读取当前状态快照                   │
│  ├── 生成: 从 SQLite 同步 (sync db-to-learnings)    │
│  └── 示例: CHARACTERS.md → 当前人物状态一览         │
│                                                     │
└─────────────────────────────────────────────────────┘
         ↕ 双向同步 (sync 命令)
```

### 4.2 SQLite Schema（保留 + 新增）

#### 基础表（沿用蓝本文档）

```sql
-- 小说项目表
CREATE TABLE novels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    genre TEXT,
    sub_genre TEXT,
    target_audience TEXT,
    story_structure TEXT,
    narrative_perspective TEXT,
    total_chapters INTEGER,
    words_per_chapter INTEGER,
    total_words INTEGER,
    status TEXT DEFAULT 'planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 阶段表
CREATE TABLE stages (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    stage_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    word_count INTEGER,
    start_chapter INTEGER,
    end_chapter INTEGER,
    map_name TEXT,
    status TEXT DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 人物表
CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,
    name_pinyin TEXT,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    first_appearance INTEGER,
    last_appearance INTEGER,
    death_chapter INTEGER,
    faction TEXT,
    cultivation_level TEXT,
    importance INTEGER DEFAULT 1,
    is_confirmed BOOLEAN DEFAULT 0,
    md_file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 人物关系表
CREATE TABLE character_relations (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    character_a_id INTEGER REFERENCES characters(id),
    character_b_id INTEGER REFERENCES characters(id),
    relation_type TEXT NOT NULL,
    description TEXT,
    start_chapter INTEGER,
    end_chapter INTEGER,
    is_active BOOLEAN DEFAULT 1
);

-- 人物出场记录表
CREATE TABLE character_appearances (
    id INTEGER PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    chapter_number INTEGER NOT NULL,
    scene_number INTEGER,
    role TEXT,
    action TEXT
);

-- 地图表
CREATE TABLE maps (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,
    level INTEGER,
    parent_map_id INTEGER REFERENCES maps(id),
    description TEXT,
    entry_condition TEXT,
    power_level TEXT,
    factions TEXT,
    status TEXT DEFAULT 'active'
);

-- 章节表
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    stage_id INTEGER REFERENCES stages(id),
    chapter_number INTEGER NOT NULL,
    title TEXT,
    map_id INTEGER REFERENCES maps(id),
    word_count INTEGER,
    status TEXT DEFAULT 'planned',
    md_file_path TEXT,
    blueprint_md_path TEXT,
    summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 章节蓝图场景表
CREATE TABLE chapter_scenes (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id),
    scene_number INTEGER NOT NULL,
    title TEXT,
    purpose TEXT,
    mood TEXT,
    word_budget INTEGER,
    characters TEXT,
    key_events TEXT,
    foreshadowing TEXT,
    climax_marker BOOLEAN DEFAULT 0
);

-- 伏笔表
CREATE TABLE foreshadowing (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    description TEXT NOT NULL,
    plant_chapter INTEGER,
    resolve_chapter INTEGER,
    status TEXT DEFAULT 'planted',
    importance INTEGER DEFAULT 1
);

-- 版本历史表
CREATE TABLE versions (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    file_path TEXT NOT NULL,
    version_number INTEGER,
    content_hash TEXT,
    change_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### RAG 向量表（sqlite-vec 扩展）

```sql
-- RAG向量虚拟表
CREATE VIRTUAL TABLE vec_chunks USING vec0(
    embedding float[768],
    content_id INTEGER,
    source_type TEXT,
    chunk_index INTEGER
);

-- RAG内容表
CREATE TABLE rag_chunks (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    content TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER,
    chunk_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 🆕 新增表（融合功能）

```sql
-- 提示词记录表
CREATE TABLE prompts (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    version INTEGER DEFAULT 1,
    dimension TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 图解记录表
CREATE TABLE diagrams (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    diagram_type TEXT NOT NULL,
    title TEXT,
    mermaid_code TEXT,
    md_file_path TEXT,
    related_chapter INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 错误记录表
CREATE TABLE error_logs (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    chapter_number INTEGER,
    error_type TEXT NOT NULL,
    description TEXT,
    severity TEXT,
    solution TEXT,
    is_resolved BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 .learnings/ 文件结构（16个文件）

#### 核心层（5个文件）- 每章写作必读

**CHARACTERS.md - 角色档案**
```markdown
# 角色档案

## 主角
### [主角名]
- **身份**：
- **当前状态**：active / sleeping / retired / dead
- **修为/等级**：
- **当前位置**：
- **当前情绪**：
- **性格关键词**：
- **行为模式**：
- **金手指/能力**：
- **重要关系**：

## 重要配角
### [配角名]
- （同上结构）

## NPC
### [NPC名]
- **简要设定**：
- **出场章节**：
- **作用**：
```

**LOCATIONS.md - 地点档案**
```markdown
# 地点档案

## 当前地图
### [地图名]
- **层级**：
- **描述**：
- **进入条件**：
- **势力分布**：
- **实力水平**：
- **特殊规则**：

## 已离开地图
### [地图名]
- **最后出现章节**：
- **关键事件**：
```

**PLOT_POINTS.md - 关键情节**
```markdown
# 关键情节记录

## 已完成情节
- **第X章**：[一句话概括]

## 当前情节线
- **主线**：[当前进度]
- **支线1**：[当前进度]
- **支线2**：[当前进度]

## 待发生情节
- **计划第X章**：[预告]
```

**STORY_BIBLE.md - 世界观设定**
```markdown
# 世界观圣经

## 核心规则
1. [规则1]
2. [规则2]

## 力量体系
| 等级 | 描述 | 代表人物 |

## 禁忌事项
- [禁忌1]
- [禁忌2]

## 设定补充记录
- **第X章发现**：[新设定]
```

**ERRORS.md - 错误日志**
```markdown
# 创作错误日志

## 已解决错误
- **[日期] 第X章 - [错误类型]**
  - 问题描述：
  - 原因分析：
  - 解决方案：
  - 教训：

## 未解决错误
- **[日期] 第X章 - [错误类型]**
  - 问题描述：
  - 状态：待处理

## 常见错误模式
1. [模式1] - 出现次数：X
2. [模式2] - 出现次数：X
```

#### 扩展层（9个文件）- 按需读取

- **TIMELINE.md** - 时间线档案
- **RELATIONSHIPS.md** - 关系网络档案
- **FORESHADOWING.md** - 伏笔管理档案
- **ARCS.md** - 故事线/卷宗档案
- **ITEMS.md** - 物品/功法档案
- **POWER_SYSTEM.md** - 力量体系档案
- **MAPS.md** - 地图层级档案
- **STATS.md** - 数据统计档案
- **STYLE_GUIDE.md** - 风格一致性记录

#### 风格层（2个文件）- 风格控制

- **WRITING_STYLE.md** - 写作风格指南
- **TEMPLATES_USED.md** - 模板使用记录

### 4.4 双轨同步规则

```
┌────────────── 同步触发时机 ──────────────┐
│                                          │
│  写作前（必须）：                         │
│    sync db-to-learnings                  │
│    ↓                                     │
│    SQLite → .learnings/ (覆盖式更新)      │
│                                          │
│  写作后（自动）：                         │
│    更新 SQLite (人物状态/伏笔/地图)       │
│    ↓                                     │
│    sync db-to-learnings (异步)            │
│                                          │
│  手动编辑后：                             │
│    sync learnings-to-db                  │
│    ↓                                     │
│    .learnings/ → SQLite (合并更新)        │
│                                          │
│  一致性检查：                             │
│    sync check                            │
│    ↓                                     │
│    输出差异报告                           │
└──────────────────────────────────────────┘
```

**同步优先级**：
1. **SQLite 是主数据源**：所有写入操作先更新 SQLite
2. **.learnings/ 是视图**：从 SQLite 生成，供 AI 读取
3. **冲突解决**：以 SQLite 为准，.learnings/ 可被重新生成

### 4.5 RAG 深度集成方案

#### RAG 渗透到每个引擎

```
┌─────────────────────────────────────────────────────┐
│                  RAG 作为基础设施层                   │
│           (每个引擎都依赖 RAG 调用)                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ① Prompt Engine                                   │
│     ├── RAG 检索: 已有类似题材设定 (避免重复)         │
│     ├── RAG 搜索: 参考作品风格切片 (辅助文风定位)      │
│     └── 输出: 完整10维提示词                         │
│                                                     │
│  ② Outline Engine                                  │
│     ├── RAG 检索: 已有情节记录 (避免矛盾)            │
│     ├── RAG 召回: 伏笔规划 (确保一致性)              │
│     └── 输出: 全书大纲                               │
│                                                     │
│  ③ Stage Engine                                    │
│     ├── RAG 检索: 前阶段地图/人物状态                │
│     ├── RAG 搜索: 爽点模式 (保持节奏)               │
│     └── 输出: 阶段规划                               │
│                                                     │
│  ④ Blueprint Engine                                │
│     ├── RAG 召回: 当前章人物状态                     │
│     ├── RAG 检索: 待回收伏笔列表                    │
│     ├── RAG 检索: 当前地图规则                      │
│     └── 输出: 章节蓝图                               │
│                                                     │
│  ⑤ Write Engine (最密集调用!)                       │
│     ├── RAG 召回: 本章所有相关设定 (防跑偏核心)       │
│     ├── RAG 实时检查: 写作过程矛盾检测               │
│     ├── RAG 语义相似度: 情节重复检测                 │
│     └── 输出: 正文 + 自动向量化存储                 │
│                                                     │
│  ⑥ Review Engine                                   │
│     ├── RAG 语义比对: 与已有设定矛盾检查             │
│     ├── RAG 相似度: 情节/对话重复检测               │
│     └── 输出: 复核报告                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### RAG 调用时机矩阵

| 引擎 | 调用时机 | RAG 操作 | 目的 |
|------|----------|----------|------|
| **Prompt** | 生成提示词前 | `rag search "修仙力量体系"` | 避免重复发明 |
| **Outline** | 生成每阶段大纲 | `rag search "已用情节套路"` | 创新性检查 |
| **Stage** | 规划新阶段 | `rag search "前阶段地图切换"` | 连续性保障 |
| **Blueprint** | 生成每章蓝图 | `rag search "待回收伏笔"` | 伏笔提醒 |
| **Write** | **每场景生成前** | `rag search "主角当前装备"` | **防跑偏核心** |
| **Write** | 场景合并后 | `rag similarity_check` | 重复检测 |
| **Write** | 章节保存后 | `rag index` (自动) | 向量化存储 |
| **Review** | 复核时 | `rag semantic_compare` | 矛盾检测 |

---

## 五、核心工作流

### 5.1 初始化工作流（Init Engine）

```
用户输入："我想写一本修仙小说，主角是个废柴"
    ↓
┌─────────────────────────────────────────┐
│  Step 1: 自然语言解析                    │
│  ├── 提取关键词: 修仙、废柴主角          │
│  ├── RAG 搜索: 已有类似题材设定 (可选)    │
│  └── 初步判断类型: 玄幻/废柴流           │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 2: 10维智能补全 (交互式)           │
│                                         │
│  维度1: 题材定位                         │
│  ├── 主类型: [玄幻] ✓                   │
│  └── 子类型: [ ]废柴流 [✓]吞噬流 [...]  │
│                                         │
│  维度2: 世界观设定 (AI预填 + 用户确认)   │
│  ├── 力量体系: [AI生成草案]              │
│  ├── 社会规则: [AI生成草案]              │
│  └── 时代背景: [AI生成草案]              │
│                                         │
│  维度3: 主角人设                         │
│  ├── 初始身份: 废柴少年                  │
│  ├── 性格特点: [AI建议选项]              │
│  ├── 金手指: 吞噬万物系统               │
│  └── 成长路线: [AI生成草案]              │
│                                         │
│  维度4: 核心冲突                         │
│  ├── 主线矛盾:                          │
│  └── 前3章即时冲突:                      │
│                                         │
│  维度5: 爽点设计                         │
│  ├── 打脸节奏:                          │
│  ├── 升级频率:                          │
│  └── 装逼方式:                          │
│                                         │
│  维度6: 节奏规划                         │
│  ├── 小高潮频率 (每3-5章):               │
│  ├── 大高潮频率 (每30-50章):             │
│  └── 卷终决战节奏:                      │
│                                         │
│  维度7: 配角框架                         │
│  ├── 对手:                              │
│  ├── 盟友:                              │
│  └── 红颜:                              │
│                                         │
│  维度8: 开篇钩子                         │
│  ├── 第一章核心场景:                     │
│  └── 抓住读者的钩子:                     │
│                                         │
│  维度9: 风格定位                         │
│  ├── 参考作品/作者:                      │
│  ├── 语言特点:                          │
│  └── 句式偏好:                          │
│                                         │
│  维度10: 质量检查                        │
│  ├── 自动验证10维完整性                  │
│  └── 高亮问题项                         │
│                                         │
│  交互模式:                               │
│  - AI 预填 → 用户确认/修改              │
│  - 或: 用户说"默认"→ AI 全部自动补全     │
│  - 或: 用户说"跳过"→ 使用最小化配置      │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 3: 提示词质量检查 (自动)           │
│  ├── ✅ 主角有明确逆袭起点？             │
│  ├── ✅ 金手指有规则和限制？             │
│  ├── ✅ 前三章有打脸场景？               │
│  ├── ✅ 力量体系层级清晰？               │
│  └── ✅ 主角行为符合理性原则？           │
│                                         │
│  如不通过 → 高亮问题项 → 引导修改        │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 4: 项目创建                        │
│  ├── 创建目录结构                        │
│  ├── 初始化 SQLite (copy模板)            │
│  ├── 写入基础配置到 DB                   │
│  ├── 生成 01-04 模板文件                 │
│  ├── 初始化 .learnings/ (16个文件)       │
│  ├── 保存完整提示词到 prompts 表         │
│  └── 输出: 项目就绪                      │
└─────────────────────────────────────────┘
```

**CLI 命令**:
```bash
# 方式1: 自然语言初始化（推荐）
novel init "我想写一本修仙小说，主角是个废柴"

# 方式2: 传统参数方式（向后兼容）
novel init <小说名> --genre <类型> --words <总字数>

# 方式3: 分步执行
novel init <小说名>
novel prompt generate
```

**Init 必须生成的文件清单**:

| 目录 | 文件名 | 说明 | 生成时机 |
|------|--------|------|----------|
| `plan/01-基础配置/` | `小说基本信息.md` | 书名/类型/字数/视角/文风等 | **init 时自动生成** |
| `plan/02-核心设定/` | `核心设定模板.md` | 金手指体系、力量规则等 | **init 时自动生成** |
| `plan/03-角色设定/` | `角色总览模板.md` | 人物分类框架、角色卡片模板 | **init 时自动生成** |
| `plan/04-世界观/` | `世界观框架模板.md` | 地理格局、势力分布等 | **init 时自动生成** |
| `plan/novel.db` | SQLite数据库 | 结构化数据存储 | **init 时自动初始化** |
| `.learnings/` | 16个md文件 | 记忆系统（从模板复制）| **init 时自动初始化** |

### 5.2 提示词引擎工作流（Prompt Engine）🆕

```
触发时机: init 时自动调用 / 手动执行 `novel prompt generate`
    ↓
┌─────────────────────────────────────────┐
│  Input: 用户原始灵感 / 已有基础配置       │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  维度1: 题材定位                         │
│  Output: 主类型 + 子类型标签             │
│  RAG调用: rag search "同类题材设定"      │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  维度2: 世界观设定                       │
│  Output: 力量体系/社会规则/时代背景       │
│  RAG调用: rag search "力量体系参考"      │
└──────────────────┬──────────────────────┘
                   ↓
... (维度3-10依次处理)
                   ↓
┌─────────────────────────────────────────┐
│  Output: 完整创作提示词                   │
│  ├── 保存到: output/提示词.md            │
│  ├── 同步到: SQLite prompts 表           │
│  └── 同步到: .learnings/STORY_BIBLE.md  │
└─────────────────────────────────────────┘
```

**质量检查清单**:
- [ ] 主角有明确的"逆袭起点"（够惨才够爽）
- [ ] 金手指/系统有清晰的规则和限制
- [ ] 前三章至少有一个"打脸"场景设计
- [ ] 力量体系有明确层级（便于体现碾压感）
- [ ] 有至少一个"众人皆看不起 → 被打脸"的经典结构
- [ ] 主角行为符合理性利己原则（如适用）

### 5.3 大纲引擎工作流（Outline Engine）

```
命令: novel outline generate
    ↓
┌─────────────────────────────────────────┐
│  前置: 读取提示词 + 基础配置              │
│  ├── 从 prompts 表读取10维设定           │
│  └── RAG 检索: 已有类似题材大纲 (参考)   │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 1: 生成大纲框架                    │
│  ├── 主线剧情走向                        │
│  ├── 分阶段规划 (按字数自动拆分)          │
│  ├── 主要人物弧线                        │
│  └── 关键转折点 (12-15个)               │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 2: RAG 创新性检查                  │
│  ├── rag.search("已用情节套路")         │
│  ├── 检测是否有重复/陈旧桥段             │
│  └── 如有 → 提示修改方向                 │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 3: 生成详细大纲 (10000字+)         │
│  ├── 每阶段核心剧情                      │
│  ├── 人物成长轨迹                        │
│  ├── 地图切换节点                        │
│  ├── 爽点设计                            │
│  └── 伏笔规划                            │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 4: 用户确认 & 保存                 │
│  ├── 展示大纲摘要                        │
│  ├── 用户: 确认/修改/重新生成            │
│  ├── 保存到: plan/05-情节规划/全书大纲.md │
│  ├── 同步到: .learnings/ARCS.md         │
│  └── RAG 存储大纲切片                    │
└─────────────────────────────────────────┘
```

### 5.4 阶段引擎工作流（Stage Engine）

```
命令: novel stage generate [阶段号]
    ↓
┌─────────────────────────────────────────┐
│  前置: 读取大纲 + RAG 召回前序内容        │
│  ├── 加载全书大纲                        │
│  ├── rag.search("前阶段地图/人物")       │
│  └── rag.search("爽点模式")              │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 1: 阶段拆分 (如未手动指定)          │
│  ├── 根据总字数自动计算阶段数            │
│  ├── 以地图切换为分界点                   │
│  ├── 以主角成长为分界点                   │
│  └── 输出: 阶段列表供确认                │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 2: 为每个阶段生成概要               │
│  ├── 阶段剧情概要                        │
│  ├── 阶段目标                            │
│  ├── 阶段爽点设计                        │
│  ├── 主要地图                            │
│  └── 出场人物列表                        │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 3: 生成阶段人物卡                  │
│  ├── 总结该阶段出场人物                  │
│  ├── 标注人物状态变化                     │
│  ├── 新人物需用户确认                    │
│  └── RAG 检查人物一致性                  │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  Step 4: 保存与同步                      │
│  ├── 保存到: plan/06-阶段规划/阶段X/     │
│  ├── 同步到: SQLite stages 表            │
│  └── 同步到: .learnings/ 多个文件        │
└─────────────────────────────────────────┘
```

**阶段拆分规则**:

| 总字数 | 阶段数 | 每阶段字数 | 说明 |
|--------|--------|-----------|------|
| 50万字以下 | 1-2个阶段 | 25-50万字 | 短篇/中篇 |
| 50-100万字 | 2-3个阶段 | 30-50万字 | 标准长篇 |
| 100-300万字 | 3-5个阶段 | 50-80万字 | 大长篇 |
| 300万字以上 | 5-8个阶段 | 50-80万字 | 超长篇 |

### 5.5 蓝图引擎工作流（Blueprint Engine）

```
命令: novel blueprint generate <起始章> <结束章>
    ↓
┌─────────────────────────────────────────┐
│  前置: 加载阶段规划 + RAG 召回上下文      │
│  ├── 加载当前阶段概要                    │
│  ├── rag.search("待回收伏笔")            │
│  ├── rag.search("当前地图规则")          │
│  └── rag.search("人物当前状态")          │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  FOR each chapter in range:              │
│                                         │
│  生成章节蓝图:                           │
│  ├─ 章节标题                             │
│  ├─ 所在地图                             │
│  ├─ 出场人物及角色                       │
│  ├─ 场景列表:                            │
│  │  ├─ 场景目的                          │
│  │  ├─ 情绪基调                          │
│  │  ├─ 字数预算                          │
│  │  ├─ 关键事件                          │
│  │  └─ 伏笔操作 (埋下/回收)              │
│  ├─ 爽点标记                             │
│  └─ RAG 相关性评分                       │
│                                         │
│  END FOR                                 │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  保存与用户确认                           │
│  ├── 保存到: plan/06-阶段规划/阶段X/     │
│  │          章节蓝图/第XXX-YYY章蓝图.md   │
│  ├── 同步到: SQLite chapters 表          │
│  └── 同步到: .learnings/PLOT_POINTS.md   │
└─────────────────────────────────────────┘
```

### 5.6 写作工作流（Write Engine）- 最核心！

```
用户命令: novel write <章节号>
    ↓
┌─────────────────────────────────────────────┐
│  Phase 0: 强制前置检查                       │
│  ├── ❓ 蓝图是否存在?                        │
│  ├── ❓ 前一章是否已完成?                    │
│  └── 如不满足 → 提示先完成前置步骤           │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Phase 1: 上下文加载 (必须!)                 │
│                                             │
│  1.1 加载蓝图                                │
│     blueprint_engine.load(chapter_id)       │
│                                             │
│  1.2 同步记忆文件                            │
│     sync_manager.db_to_learnings()          │
│     ↓                                        │
│     读取 .learnings/ 核心层5个文件:          │
│     ├─ CHARACTERS.md (当前人物状态)          │
│     ├─ LOCATIONS.md (当前地图)               │
│     ├─ PLOT_POINTS.md (当前情节)             │
│     ├─ STORY_BIBLE.md (世界观规则)           │
│     └─ ERRORS.md (避免重复错误)              │
│                                             │
│  1.3 RAG 召回相关设定 (防跑偏核心!)          │
│     rag.search({                             │
│       query: "本章蓝图摘要",                 │
│       top_k: 10,                            │
│       types: ['character', 'map', 'lore',   │
│                'item', 'foreshadowing']     │
│     })                                      │
│     ↓                                        │
│     返回: 相关设定切片列表                    │
│                                             │
│  1.4 生成上下文报告                          │
│     context.build_report({                   │
│       blueprint,                            │
│       learnings,                            │
│       rag_results,                          │
│       recent_summary,                       │
│       style_guide                           │
│     })                                      │
│                                             │
│  ⚠️ 必须等待上下文报告生成完毕才能继续!      │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Phase 2: 按场景写作                         │
│                                             │
│  FOR each scene in blueprint.scenes:        │
│                                             │
│    2.1 构建场景级 Prompt                     │
│        prompt = {                           │
│          scene_info,                        │
│          context_report,                    │
│          rag_context,                       │
│          style_requirements,                │
│          anti_ai_rules                      │
│        }                                    │
│                                             │
│    2.2 生成场景文本                          │
│        text = llm.generate(prompt)          │
│                                             │
│    2.3 RAG 实时检查 (可选)                   │
│        rag.similarity_check(text)            │
│        → 检测是否与已有情节重复              │
│                                             │
│    2.4 去AI味后处理                          │
│        text = style.remove_ai_flavor(text)  │
│                                             │
│    2.5 添加到章节缓冲区                      │
│        chapter_buffer.append(text)           │
│                                             │
│  END FOR                                     │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Phase 3: 合并与复核                         │
│                                             │
│  3.1 合并所有场景                            │
│      full_text = merge_scenes(buffer)        │
│      → 检查场景间衔接流畅性                   │
│                                             │
│  3.2 复核流程                                │
│      review_engine.check({                   │
│        chapter_text: full_text,              │
│        blueprint,                            │
│        rag_context,                          │
│        learnings                             │
│      })                                      │
│      ↓                                        │
│      输出: 复核报告 (通过/警告/错误)          │
│                                             │
│  3.3 错误记录                                │
│      IF 复核发现问题:                        │
│        error_logger.log({                    │
│          chapter, type, description,         │
│          solution                            │
│        })                                    │
│        → 写入 error_logs 表                  │
│        → 同步到 ERRORS.md                    │
│                                             │
│  3.4 自动修复 (可选)                         │
│      IF 用户确认或 minor 问题:               │
│        text = auto_fix(text, issues)         │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Phase 4: 保存与同步                         │
│                                             │
│  4.1 保存正文                                │
│      save to 小说正文/第X部/XXX.md           │
│                                             │
│  4.2 更新 SQLite                            │
│      ├── chapters 表 (状态→written)          │
│      ├── character_appearances (出场记录)     │
│      ├── foreshadowing (伏笔状态)            │
│      └── error_logs (如有错误)               │
│                                             │
│  4.3 RAG 向量化存储 (自动!)                  │
│      rag.index({                             │
│        content: full_text,                   │
│        type: 'chapter',                      │
│        source_id: chapter_id                 │
│      })                                      │
│      → 将正文切片并向量化存入 SQLite         │
│                                             │
│  4.4 同步 .learnings/ (异步)                 │
│      sync_manager.db_to_learnings()          │
│      → 更新 CHARACTERS/LOCATIONS/PLOT_等     │
│                                             │
│  4.5 生成章节摘要                            │
│      summary = llm.summarize(full_text)      │
│      → 存入 chapters 表                      │
│      → 用于后续上下文窗口                     │
│                                             │
│  ✅ 输出: 写作完成报告                        │
└─────────────────────────────────────────────┘
```

### 5.7 复核引擎工作流（Review Engine）- 9维复核

```
触发: 写作后自动 / 手动 `novel review <章节号>`
    ↓
┌─────────────────────────────────────────────┐
│  维度1: 蓝图符合度检查                       │
│  ├── 是否完成所有场景?                       │
│  ├── 字数是否符合预算?                       │
│  └── 爽点是否到位?                          │
├─────────────────────────────────────────────┤
│  维度2: 人物一致性 (RAG增强)                │
│  ├── rag.search("人物DB状态")               │
│  ├── 对比: 文中描述 vs DB记录               │
│  └─ 输出: 不一致项列表                      │
├─────────────────────────────────────────────┤
│  维度3: 战力体系合规性                      │
│  ├── 战斗结果是否合理?                      │
│  ├── 境界差距是否尊重?                      │
│  └── 金手指使用是否合规?                    │
├─────────────────────────────────────────────┤
│  维度4: 伏笔处理检查                        │
│  ├── 应回收的伏笔是否已收?                  │
│  ├── 新埋伏笔是否合理?                      │
│  └── 有无意破坏已有伏笔?                    │
├─────────────────────────────────────────────┤
│  维度5: 地图一致性 (RAG增强)                │
│  ├── rag.search("地图设定")                 │
│  ├── 地理描述是否前后一致?                  │
│  └─ 势力分布是否合规?                       │
├─────────────────────────────────────────────┤
│  维度6: 时间线逻辑                          │
│  ├── 时间推进是否合理?                      │
│  ├── 因果关系是否成立?                      │
│  └── 场景切换是否自然?                      │
├─────────────────────────────────────────────┤
│  维度7: 风格一致性                          │
│  ├── 是否符合文风指南?                      │
│  ├── AI味检测 (后处理扫描)                  │
│  └─ 对话是否有个性?                         │
├─────────────────────────────────────────────┤
│  维度8: RAG 语义重复检测                    │
│  ├── rag.similarity_check(正文)             │
│  ├── 与已有章节相似度 > 80%?                │
│  └─ 与已有情节套路重复?                     │
├─────────────────────────────────────────────┤
│  维度9: DB同步状态                          │
│  ├── 人物出场是否已记录?                    │
│  ├── 地图切换是否已更新?                    │
│  └─ 伏笔状态是否已同步?                     │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  输出复核报告                                │
│  ├── 总评: 通过 / 有警告 / 不通过           │
│  ├── 问题列表 (位置+描述+严重程度+建议)      │
│  ├── 自动修复建议 (可选)                    │
│  └── 错误记录 (如有问题)                    │
│                                             │
│  用户选择:                                  │
│  - "修复" → 自动修复可修复项                │
│  - "忽略" → 标记为已审查                    │
│  - "详细" → 查看具体对比                    │
└─────────────────────────────────────────────┘
```

### 5.8 图解引擎工作流（Diagram Engine）🆕

```
命令: novel diagram generate <类型> [参数]
    ↓
┌─────────────────────────────────────────┐
│  支持的图解类型:                         │
│                                         │
│  1. battle       战斗场景图解            │
│     ├── 双方站位                        │
│     ├── 力量对比                        │
│     └── 胜负关键                         │
│                                         │
│  2. faction      势力分布图解            │
│     ├── 各方势力关系                    │
│     ├── 地理分布                        │
│     └── 实力对比                        │
│                                         │
│  3. breakthrough  等级突破图解           │
│     ├── 角色成长路线                    │
│     ├── 境界节点                        │
│     └── 关键机缘                         │
│                                         │
│  4. relation     人物关系图解            │
│     ├── 关系网络                        │
│     ├── 关系类型                        │
│     └─ 状态变化                         │
│                                         │
│  5. plotline     剧情时间线图解          │
│     ├── 因果链                          │
│     ├── 时间节点                        │
│     └─ 多线并行                         │
│                                         │
│  6. map          世界地图图解            │
│     ├── 地图层级                        │
│     ├── 区域划分                        │
│     └─ 通道连接                         │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  生成流程:                                │
│  1. RAG 召回相关数据                     │
│  2. AI 生成 Mermaid 代码                │
│  3. 保存到: output/图解/                 │
│  4. 记录到: SQLite diagrams 表           │
│  5. 可选: 嵌入到 Markdown 文档           │
└─────────────────────────────────────────┘
```

### 5.9 错误记录器工作流（Error Logger）🆕

```
触发时机: 复核发现问题 / 写作失败 / 手动记录
    ↓
┌─────────────────────────────────────────┐
│  错误类型分类:                           │
│                                         │
│  🔴 Critical (致命)                      │
│  ├── character_inconsistency 人物穿帮    │
│  ├── plot_hole 重大剧情漏洞              │
│  └── power_system崩坏 战力体系崩溃       │
│                                         │
│  🟠 Major (重要)                         │
│  ├── timeline_confusion 时间混乱         │
│  ├── setting_contradiction 设定矛盾      │
│  └── relationship_error 关系错误         │
│                                         │
│  🟡 Minor (轻微)                         │
│  ├── style_drift 风格偏离                │
│  ├── rhythm_issue 节奏问题               │
│  └── repetition 情节重复                 │
│                                         │
│  ⚪ Warning (警告)                       │
│  ├── missing_record 缺少记录             │
│  ├── sync_error 同步失败                 │
│  └── suggestion 优化建议                 │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  记录流程:                                │
│  1. 自动检测或手动输入                   │
│  2. 分类定级                              │
│  3. 生成解决方案建议                     │
│  4. 写入 error_logs 表                   │
│  5. 同步到 ERRORS.md                     │
│  6. 更新常见错误模式统计                 │
└──────────────────┬──────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  错误分析功能:                            │
│  ├── novel error show [章节号]           │
│  │   └── 查看某章错误记录                 │
│  ├── novel error stats                  │
│  │   └── 统计错误类型分布                 │
│  ├── novel error patterns               │
│  │   └── 分析常见错误模式                │
│  └── novel error resolve <id>           │
│      └── 标记错误已解决                   │
└─────────────────────────────────────────┘
```

---

## 六、CLI 命令体系

### 6.1 完整命令树

```bash
novel_vela_pro
│
├── init              # 初始化项目 (支持自然语言)
│   ├── init "我想写本修仙小说"
│   ├── init <书名> --genre <类型>
│   └── init --from-prompt <文件路径>
│
├── prompt 🆕         # 提示词管理
│   ├── prompt generate
│   ├── prompt show
│   ├── prompt check
│   ├── prompt edit <维度>
│   └── prompt export
│
├── outline           # 大纲管理
│   ├── outline generate
│   ├── outline show
│   ├── outline edit
│   └── outline summary
│
├── stage             # 阶段规划
│   ├── stage list
│   ├── stage generate [阶段号]
│   ├── stage show <阶段号>
│   ├── stage add
│   └── stage edit <阶段号>
│
├── blueprint         # 章节蓝图
│   ├── blueprint generate <起始> <结束>
│   ├── blueprint show <章节号>
│   ├── blueprint edit <章节号>
│   └── blueprint batch
│
├── write             # 写作 (核心!)
│   ├── write <章节号>
│   ├── write --range <起始>-<结束>
│   ├── write --continue
│   └── write --scene <章节号> <场景号>
│
├── context 🆕        # 上下文管理
│   ├── context get <章节号>
│   ├── context get --rag
│   ├── context preview <章节号>
│   └── context window <章节数>
│
├── review            # 复核审查
│   ├── review <章节号>
│   ├── review --range <起始>-<结束>
│   ├── review --auto-fix
│   └── review --strict
│
├── learnings 🆕      # 记忆系统管理
│   ├── learnings sync
│   ├── learnings show <文件名>
│   ├── learnings check
│   ├── learnings update <文件名>
│   └── learnings regenerate
│
├── character         # 人物管理
│   ├── character list
│   ├── character show <姓名>
│   ├── character add
│   ├── character update <姓名>
│   └── character relations <姓名>
│
├── map               # 地图管理
│   ├── map list
│   ├── map show <地图名>
│   └── map current
│
├── diagram 🆕         # 图解生成
│   ├── diagram generate <类型> [参数]
│   ├── diagram list
│   ├── diagram show <id>
│   └── diagram embed <id> <文档路径>
│
├── rag               # RAG 向量检索
│   ├── rag search <查询>
│   ├── rag search --type <类型>
│   ├── rag search --top-k <数字>
│   ├── rag index
│   ├── rag status
│   └── rag test
│
├── error 🆕           # 错误记录
│   ├── error log <类型> <描述>
│   ├── error show [章节号]
│   ├── error stats
│   ├── error patterns
│   └── error resolve <id>
│
├── style             # 文风管理
│   ├── style analyze <文件路径>
│   ├── style show
│   └── style update
│
├── sync              # 同步管理
│   ├── sync db-to-learnings
│   ├── sync learnings-to-db
│   ├── sync check
│   └── sync auto
│
├── audit             # 审查
│   ├── audit chapter <章节号>
│   ├── audit range <起始>-<结束>
│   ├── audit fix <章节号>
│   └── audit consistency
│
└── 📊 工具命令
    ├── stats
    ├── check
    ├── export
    ├── version
    └── help
```

### 6.2 命令与引擎映射

| 命令组 | 对应引擎 | 核心命令 | RAG 调用 |
|--------|----------|----------|----------|
| **init** | `init_novel.py` | `init` | ✅ 检索类似设定 |
| **prompt** 🆕 | `prompt_engine.py` | `prompt generate/check` | ✅ 辅助补全 |
| **outline** | `outline_engine.py` | `outline generate` | ✅ 创新性检查 |
| **stage** | `stage_engine.py` | `stage generate` | ✅ 连续性检查 |
| **blueprint** | `blueprint_engine.py` | `blueprint generate` | ✅ 召回伏笔/人物 |
| **write** | `write_engine.py` | `write` | ✅✅ **核心防跑偏** |
| **context** 🆕 | `core/context.py` | `context get` | ✅✅ **强制召回** |
| **review** | `review_engine.py` | `review` | ✅ 语义检测 |
| **learnings** 🆕 | `core/learnings.py` | `learnings sync` | - |
| **diagram** 🆕 | `core/diagram.py` | `diagram generate` | ✅ 召回数据 |
| **error** 🆕 | `core/error_logger.py` | `error log/stats` | - |
| **rag** | `core/rag.py` | `rag search/index` | **自身** |
| **sync** 🆕 | `core/sync_manager.py` | `sync db-to-learnings` | - |

### 6.3 关键命令详解

#### 📌 `novel write` （最核心命令）

```bash
# 写作单章 (标准流程)
novel write 5
# 内部自动执行:
# 1. context get 5 --rag          # 加载上下文 + RAG召回
# 2. learnings sync               # 同步记忆文件
# 3. 按场景生成                    # 调用 Write Engine
# 4. review 5                     # 自动复核
# 5. error auto-log               # 记录问题
# 6. rag index                    # 向量化存储
# 7. sync auto                    # 异步同步

# 批量写作
novel write --range 1-10
# → 连续写10章，每章都走完完整流程

# 继续写作
novel write --continue
# → 自动找到最后一章，继续写下一章

# 只写某个场景 (调试用)
novel write --scene 5 2
# → 只写第5章的第2个场景
```

#### 📌 `novel context get` （强制接口）

```bash
# 获取写作上下文 (必须先执行!)
novel context get 5
# 输出:
# ═══════════════════════════════════════
#  第5章写作上下文报告
# ═══════════════════════════════════════
#
# 【本章蓝图】
# 标题：突破！筑基成功
# 地图：青云宗·后山
# 字数预算：6000字
# 场景数：4个
#
# 【RAG召回设定】(相关度排序)
# 1. [人物] 秦墨: 筑基期, 持有黑色匕首 (0.95)
# 2. [物品] 黑色匕首: 上古魔神遗物 (0.89)
# 3. [地图] 青云宗后山: 禁止私斗 (0.87)
# 4. [伏笔] 玉佩秘密: 第3章埋下 (0.85)
# ...
#
# [.learnings/ 快照]
# - CHARACTERS.md: 12个人物 (3活跃)
# - LOCATIONS.md: 当前地图=青云宗
# - PLOT_POINTS.md: 主线进度45%
# - FORESHADOWING.md: 2个待回收
# - ERRORS.md: 0个未解决
#
# 【前文摘要】(前3章)
# 第4章: 秦墨获得筑基丹... (200字)
# 第3章: 发现玉佩秘密... (200字)
# 第2章: 初入青云宗... (200字)
#
# 【文风提示】
# 参考: 文抄公风格
# - 短句为主, 信息密度高
# - 对话功能性强
# - 避免抒情独白
#
# ═══════════════════════════════════════
```

#### 📌 `novel prompt generate` （智能补全）

```bash
# 生成提示词 (交互式)
novel prompt generate
# 进入10维引导流程:
#
# 维度1/10: 题材定位
# ┌────────────────────────────────────┐
# │ 当前输入: "修仙小说, 废柴主角"      │
# │                                    │
# │ AI 建议:                           │
# │ 主类型: [玄幻] ✓                   │
# │ 子类型:                            │
# │   [✓] 废柴流  [ ] 吞噬流  [ ] 重生│
# │   [ ] 凡人流  [ ] 系统流  [...]    │
# │                                    │
# │ 操作: [确认] [修改] [跳过] [默认]  │
# └────────────────────────────────────┘
#
# ... (依次完成10维)

# 质量检查
novel prompt check
# 输出:
# ✅ 通过 8/10 项
# ⚠️ 未通过 2项:
#   1. 缺少明确的"逆袭起点"
#      → 建议: 增加家族抛弃情节
#   2. 金手指限制不够明确
#      → 建议: 设定每日使用次数
```

---

## 七、融合亮点功能详解

### 7.1 提示词10维自动补全（来自 novel-generator-pro）

**功能描述**: 从用户的简单灵感出发，自动补全为包含10个维度的完整创作提示词。

**10个维度**:
1. **题材定位**: 主类型 + 子类型标签
2. **世界观设定**: 力量体系/社会规则/时代背景
3. **主角人设**: 身份/性格/金手指/成长路线
4. **核心冲突**: 主线矛盾 + 即时冲突
5. **爽点设计**: 打脸节奏/升级频率/装逼方式
6. **节奏规划**: 小高潮/大高潮/卷终决战频率
7. **配角框架**: 对手/盟友/红颜各至少1人
8. **开篇钩子**: 第一章抓住读者的核心场景
9. **风格定位**: 参考作品/语言特点/句式偏好
10. **质量检查**: 自动验证提示词完整性

**创新点**:
- 与 RAG 集成：补全时检索已有类似题材设定，避免重复发明
- 交互式确认：AI预填 → 用户确认/修改，而非一次性生成
- 质量保障：内置质量检查清单，确保提示词完整性

### 7.2 .learnings/ 记忆系统（来自 novel-generator-pro）

**功能描述**: 16个 Markdown 文件组成的记忆系统，作为 AI 写作前的"状态快照"，可直接读取。

**三层架构**:
- **核心层（5个）**: 每章写作必读（CHARACTERS/LOCATIONS/PLOT_POINTS/STORY_BIBLE/ERRORS）
- **扩展层（9个）**: 按需读取（TIMELINE/RELATIONSHIPS/FORESHADOWING/ARCS/ITEMS/POWER_SYSTEM/MAPS/STATS/STYLE_GUIDE）
- **风格层（2个）**: 风格控制（WRITING_STYLE/TEMPLATES_USED）

**双轨并行设计**:
- SQLite 是主数据源（写入、查询、统计）
- .learnings/ 是视图（从 SQLite 生成，供 AI 读取）
- 通过 `sync` 命令双向同步

**优势**:
- AI 可直接读取，无需 SQL 查询
- 人类可阅读编辑，便于手动调整
- 文件粒度合理，不会过大

### 7.3 Mermaid 图解生成（来自 novel-generator-pro）

**功能描述**: 为关键情节自动生成 Mermaid 语法的图解，嵌入到 Markdown 文档中。

**支持的图解类型**:
1. **battle** - 战斗场景图解（双方站位/力量对比/胜负关键）
2. **faction** - 势力分布图解（各方势力关系/地理分布/实力对比）
3. **breakthrough** - 等级突破图解（角色成长路线/境界节点/关键机缘）
4. **relation** - 人物关系图解（关系网络/关系类型/状态变化）
5. **plotline** - 剧情时间线图解（因果链/时间节点/多线并行）
6. **map** - 世界地图图解（地图层级/区域划分/通道连接）

**技术实现**:
- RAG 召回相关数据（人物/地点/事件）
- AI 生成 Mermaid 代码
- 保存为独立 .md 文件或嵌入到现有文档
- 记录到 SQLite diagrams 表

### 7.4 错误记录与质量检查（来自 novel-generator-pro）

**功能描述**: 系统化记录创作过程中的错误和质量问题，形成改进闭环。

**错误分类体系**:
- 🔴 **Critical（致命）**: 人物穿帮/重大剧情漏洞/战力体系崩溃
- 🟠 **Major（重要）**: 时间混乱/设定矛盾/关系错误
- 🟡 **Minor（轻微）**: 风格偏离/节奏问题/情节重复
- ⚪ **Warning（警告）**: 缺少记录/同步失败/优化建议

**错误生命周期**:
```
检测 → 分类 → 记录(DB+ERRORS.md) → 分析模式 → 解决 → 统计
```

**质量检查维度**（与 Review Engine 的9维复核互补）:
- 连贯性检查（时间/因果/场景切换）
- 风格检查（AI味/对话个性/描写细节）
- 质量检查（爽点/悬念/成长感）
- 记忆更新检查（人物/地点/伏笔/时间）

---

## 八、技术实现要点

### 8.1 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **CLI框架** | Click 8.x | 命令行框架，支持嵌套命令组 |
| **数据库** | SQLite 3.x | 内嵌式数据库，无需安装服务 |
| **向量扩展** | sqlite-vec | SQLite 向量检索扩展，纯C实现 |
| **嵌入模型** | Ollama + nomic-embed-text | 本地嵌入生成，768维向量 |
| **Ollama地址** | http://127.0.0.1:11434 | 默认本地部署 |
| **大模型** | 可配置 (OpenAI/DeepSeek/Ollama) | 通过 API 调用 |
| **图解语法** | Mermaid | Markdown 原生支持的图表语法 |

### 8.2 核心模块依赖关系

```
write_engine.py
├── core/context.py
│   ├── core/db.py
│   ├── core/learnings.py
│   └── core/rag.py  ← 核心依赖!
├── core/style.py
├── review_engine.py
│   ├── core/diagram.py
│   └── core/error_logger.py
└── core/sync_manager.py
    ├── core/db.py
    └── core/learnings.py
```

### 8.3 性能优化要点

1. **RAG 异步索引**: 写作完成后异步执行 `rag index`，不阻塞主流程
2. **.learnings/ 增量同步**: 只更新变化的文件，非全量重新生成
3. **上下文缓存**: 相同章节的上下文报告缓存，避免重复生成
4. **向量索引预热**: 项目初始化时预构建基础设定的向量索引

### 8.4 去AI味策略（三层防护）

**第一层：Prompt级约束**
```
写作风格要求：
1. 避免使用"首先...其次...最后..."等结构化表达
2. 对话允许：打断、重复、口吃、沉默、答非所问
3. 环境描写必须包含至少2种感官（视觉+听觉/嗅觉/触觉）
4. 人物内心活动允许矛盾、冲动、非理性
5. 禁止使用"显然""无疑""必然""众所周知"等确定性词汇
6. 允许使用短句、断句，长短句交替
7. 场景切换允许跳跃，不要生硬过渡
8. 适当留白，不要解释一切
9. 允许不完整的句子和语法瑕疵
10. 情感表达要具体，不要抽象
```

**第二层：文风参考学习**
- 用户提供参考小说 → 分析生成文风总结
- 文风总结存入 `.learnings/STYLE/WRITING_STYLE.md`
- 写作时自动注入文风提示

**第三层：后处理修正**
- 生成后扫描并替换AI味特征
- 检测项：排比句/总结句/模式化表达/感官缺失
- 自动修正或标记警告

---

## 九、实施路线图

### 9.1 第一阶段：MVP（核心可用）

**目标**: 完成基础工程化能力 + 核心融合功能

**任务清单**:
- [ ] 重构目录结构和模块划分
- [ ] 实现 `core/db.py` (SQLite 操作)
- [ ] 实现 `core/rag.py` (RAG 向量检索)
- [ ] 实现 `init_novel.py` (含10维智能引导)
- [ ] 实现 `prompt_engine.py` (提示词10维补全)
- [ ] 实现 `core/learnings.py` (.learnings/ 管理)
- [ ] 实现 `core/sync_manager.py` (双向同步)
- [ ] 实现 `outline_engine.py` (大纲生成)
- [ ] 实现 `stage_engine.py` (阶段规划)
- [ ] 实现 `blueprint_engine.py` (蓝图生成)
- [ ] 实现 `write_engine.py` (写作 + 去AI味)
- [ ] 实现 `context.py` (上下文管理)
- [ ] 重构 `novel_cli.py` (命令路由)
- [ ] 编写 SKILL.md 规范文件
- [ ] 创建 `.learnings-template/` 模板
- [ ] 迁移 `PROMPT-TEMPLATE.md` 和 `CHAPTER-CHECKLIST.md`

**验收标准**:
- ✅ `novel init "灵感"` 能创建完整项目（含 .learnings/）
- ✅ `novel prompt generate` 能完成10维补全
- ✅ `novel outline/stage/blueprint/write` 全流程可运行
- ✅ `novel context get` 能生成含 RAG 的上下文报告
- ✅ `novel write` 能完成单章写作并自动 RAG 存储

### 9.2 第二阶段：增强功能

**目标**: 完成质量保障和可视化能力

**任务清单**:
- [ ] 实现 `review_engine.py` (9维复核)
- [ ] 实现 `core/error_logger.py` (错误记录)
- [ ] 实现 `core/diagram.py` (Mermaid 图解)
- [ ] 实现 `core/style.py` (文风分析)
- [ ] 完善 `error` 命令组
- [ ] 完善 `diagram` 命令组
- [ ] 完善 `review` 命令组
- [ ] 实现批量写作 `write --range`
- [ ] 实现自动修复 `review --auto-fix`
- [ ] 编写详细的 references 文档

**验收标准**:
- ✅ `novel review` 能输出9维复核报告
- ✅ `novel error log/stats/patterns` 正常工作
- ✅ `novel diagram generate` 能生成6种图解
- ✅ `novel write --range 1-10` 能批量写作

### 9.3 第三阶段：完善与优化

**目标**: 生产级稳定性和高级功能

**任务清单**:
- [ ] 性能优化（RAG异步/上下文缓存/增量同步）
- [ ] 完善错误处理和边界情况
- [ ] 补充单元测试和集成测试
- [ ] 编写完整的 CLI 使用手册
- [ ] 编写迁移指南（从 vela 升级）
- [ ] 实现配置文件支持 (`config.yml`)
- [ ] 实现插件机制（可选功能模块）
- [ ] GUI 原型（长期规划）

**验收标准**:
- ✅ 所有命令有完善的帮助信息
- ✅ 错误信息友好且可操作
- ✅ 测试覆盖率 > 80%
- ✅ 性能满足百万字小说项目管理

---

## 十、风险与缓解

### 10.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| sqlite-vec 兼容性问题 | 中 | 高 | 提供 fallback 方案（纯 SQLite 查询）|
| Ollama 服务不可用 | 中 | 高 | 支持配置外部 API（OpenAI/DeepSeek）|
| RAG 检索质量不佳 | 中 | 中 | 支持 RAG 测试命令 `rag test`，调优参数 |
| 双轨同步数据不一致 | 低 | 高 | 强制 `sync check` + 冲突解决机制 |

### 10.2 使用风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 用户跳过 `context get` | 高 | 高 | `write` 命令内部强制调用，无法跳过 |
| .learnings/ 手动编辑导致冲突 | 中 | 中 | 编辑前提示同步，提供 diff 工具 |
| 提示词补全质量不佳 | 中 | 中 | 质量检查清单 + 人工确认环节 |
| AI 生成内容偏离大纲 | 中 | 中 | 蓝图约束 + 9维复核 + RAG 重复检测 |

### 10.3 架构风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 模块过多导致复杂度高 | 低 | 中 | 清晰的模块边界 + 详细文档 |
| 引擎间耦合过重 | 低 | 高 | 依赖注入 + 接口抽象 |
| 性能瓶颈（RAG/同步）| 中 | 中 | 异步处理 + 缓存 + 增量更新 |

---

## 十一、总结

### 11.1 核心创新点

1. **三重数据架构**: SQLite (结构化) + RAG (语义检索) + .learnings/ (可读性)
2. **RAG 深度集成**: 不是独立工具，而是渗透到每个引擎的基础设施
3. **10维智能引导**: 从简单灵感到完整设定的自动化补全
4. **双轨记忆系统**: 工程化管理和 AI 友好性的完美平衡
5. **9维质量复核**: 覆盖蓝图/人物/战力/伏笔/地图/时间/风格/重复/同步
6. **错误闭环**: 检测→记录→分析→解决→统计，持续改进

### 11.2 与前版对比

| 维度 | novel_vela | novel-generator-pro | **novel_vela_pro** |
|------|------------|---------------------|-------------------|
| **定位** | 工具箱 | 工作手册 | **工作台** |
| **数据存储** | SQLite | 纯Markdown | **SQLite + .learnings/ + RAG** |
| **RAG** | ✅ 有 | ❌ 无 | **✅ 深度集成** |
| **记忆系统** | ❌ 依赖SQL查询 | ✅ 15文件 | **✅ 16文件 + 双轨同步** |
| **提示词补全** | ❌ 无 | ✅ 10维 | **✅ 10维 + RAG增强** |
| **图解生成** | ❌ 无 | ✅ Mermaid | **✅ 6种类型** |
| **错误记录** | ❌ 无 | ✅ ERRORS.md | **✅ 分类体系 + 分析** |
| **CLI** | ✅ 完整 | ❌ 无 | **✅ 增强版** |
| **审查同步** | ✅ 有 | ❌ 无 | **✅ 9维复核** |
| **去AI味** | ✅ 三层 | ✅ 基础 | **✅ 三层增强** |

### 11.3 设计原则遵循

✅ **分层规划**: 大纲 → 阶段 → 蓝图 → 正文
✅ **人机协作**: AI生成 + 用户确认
✅ **数据驱动**: 三重数据架构
✅ **质量控制**: 9维复核 + 错误记录
✅ **上下文保障**: 强制 context get + RAG 召回
✅ **去AI味**: 三层防护策略
✅ **CLI约束**: 强制接口确保规范执行
✅ **RAG增强**: 深度集成防跑偏
✅ **模块化**: 引擎与核心分离
✅ **可扩展**: 插件友好的架构

---

## 附录

### A. 文件命名规范

- 章节文件：`第XXX.md`（三位数字，如 001.md, 152.md）
- 图解文件：`<类型>_<描述>.md`（如 `battle_青云宗之战.md`）
- 蓝图文件：`第XXX-YYY章蓝图.md`
- 记忆文件：`<NAME>.md`（全大写，如 CHARACTERS.md）

### B. 状态枚举

**小说状态**: planning → outlining → staging → bluewriting → writing → reviewing → completed

**章节状态**: planned → blueprinted → written → reviewed → completed

**人物状态**: active → sleeping → active → retired → dead

**伏笔状态**: planted → resolved → abandoned

**错误严重程度**: critical → major → minor → warning

### C. 配置项（未来支持）

```yaml
# config.yml (示例)
novel:
  ollama_url: "http://127.0.0.1:11434"
  embed_model: "nomic-embed-text"
  llm_provider: "openai"  # openai/deepseek/ollama
  rag_top_k: 10
  context_window_size: 5  # 前N章摘要
  auto_sync: true
  auto_rag_index: true
  style_check: true
  diagram_auto_generate: false
```

---

> **文档版本**: v1.0
> **最后更新**: 2026-05-16
> **下一步**: 用户审阅确认 → 进入 implementation plan 阶段
