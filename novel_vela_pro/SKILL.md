---
name: novel-vela-pro
description: 
  工程化管理的AI小说创作工作台。用于创建和管理长篇网文小说项目，
  提供从设定生成、角色设计、世界观构建、大纲规划、阶段拆分、章节蓝图到正文写作的完整工作流。
  包含SQLite数据库管理、RAG向量检索、.learnings/记忆系统、Mermaid图解生成、错误记录与质量复核。
  当用户需要：(1) 创建新小说项目，(2) 管理小说设定/角色/世界观，(3) 规划全书大纲和阶段，
  (4) 生成章节蓝图，(5) 获取写作上下文，(6) 审查章节一致性，(7) 生成设定图解时使用本技能。
---

# Novel Vela Pro

工程化管理的AI小说创作工作台，融合工程化基础设施与创作指导能力。

## 核心功能

1. **项目初始化** (`init`) - 创建完整小说项目结构，含数据库和模板
2. **设定管理** - 核心设定、角色、世界观的分层管理
3. **大纲规划** (`outline`) - 全书大纲生成与管理
4. **阶段规划** (`stage`) - 将大纲拆分为可管理的阶段
5. **章节蓝图** (`blueprint`) - 为每章生成详细写作蓝图
6. **上下文管理** (`context`) - 写作前强制加载上下文报告
7. **RAG检索** (`rag`) - 语义搜索设定，防止跑偏
8. **审查复核** (`audit`) - 多维度质量检查
9. **图解生成** (`diagram`) - Mermaid人物关系图、时间线等
10. **错误记录** (`error`) - 分类记录和追踪问题
11. **记忆系统** (`learnings`) - .learnings/ 可读记忆文件管理
12. **同步管理** (`sync`) - DB与Markdown双向同步

## 使用方式

### 创建新项目

```bash
python scripts/novel_cli.py init "小说名称" --genre "玄幻" --words 4500000 --chapters 750
```

### 管理阶段

```bash
python scripts/novel_cli.py stage add 1 --name "废柴崛起" --start 1 --end 50
python scripts/novel_cli.py stage list
```

### 生成章节蓝图

```bash
python scripts/novel_cli.py blueprint generate 1 50
```

### 获取写作上下文

```bash
python scripts/novel_cli.py context get 1
```

### 审查章节

```bash
python scripts/novel_cli.py audit chapter 1
python scripts/novel_cli.py audit range 1-10
```

### 语义搜索设定

```bash
python scripts/novel_cli.py rag search "主角能力"
```

### 生成图解

```bash
python scripts/novel_cli.py diagram character
python scripts/novel_cli.py diagram timeline
```

### 错误记录

```bash
python scripts/novel_cli.py error log --category character --severity major --desc "性格前后矛盾"
```

### 同步与检查

```bash
python scripts/novel_cli.py sync db-to-md
python scripts/novel_cli.py sync check
```

## 项目结构

创建的项目包含：

```
《小说名》/
├── plan/
│   ├── 01-基础配置/小说基本信息.md
│   ├── 02-核心设定/核心设定模板.md
│   ├── 03-角色设定/角色总览模板.md
│   ├── 04-世界观/世界观框架模板.md
│   ├── 05-情节规划/全书大纲.md
│   ├── 06-阶段规划/阶段N-名称/阶段概要.md
│   └── novel.db
├── characters/
│   ├── 主角/
│   ├── 重要配角/
│   └── NPC/
├── 小说正文/
└── .learnings/          # 记忆系统
    ├── CORE/
    ├── EXTENDED/
    └── STYLE/
```

## 数据架构

- **SQLite**: 结构化数据存储（novels/stages/characters/chapters等）
- **RAG**: 向量检索（sqlite-vec + Ollama nomic-embed-text）
- **.learnings/**: 可读记忆文件（16个文件，3层架构）

## 技术依赖

- Python 3.10+
- click >= 8.0.0
- httpx >= 0.24.0（用于Ollama API调用）
- sqlite-vec >= 0.1.0（可选，用于向量检索）

## 参考文档

- 完整设计文档: [references/design-doc.md](references/design-doc.md)
- 数据库Schema: [references/database-schema.md](references/database-schema.md)
- CLI使用手册: [references/cli-usage.md](references/cli-usage.md)
