# CLI 使用手册

## 命令总览

```
novel_cli.py [OPTIONS] COMMAND [ARGS]...

Options:
  -p, --project TEXT  小说项目目录
  --help              显示帮助信息

Commands:
  init        初始化新小说项目
  outline     全书大纲管理
  stage       阶段规划管理
  blueprint   章节蓝图管理
  context     上下文管理
  write       写作指定章节
  character   人物管理
  map         地图管理
  rag         RAG向量检索
  audit       审查与同步
  sync        同步管理
  diagram     Mermaid图解生成
  error       错误记录管理
  learnings   .learnings/记忆系统管理
```

## 详细命令

### init - 初始化项目

```bash
python scripts/novel_cli.py init "小说名称" [OPTIONS]

Options:
  --genre TEXT              小说类型
  --words INTEGER           总字数（默认600000）
  --chapters INTEGER        总章数（默认100）
  --words-per-chapter INTEGER  每章字数（默认6000）
```

### outline - 大纲管理

```bash
# 生成大纲模板
python scripts/novel_cli.py outline generate

# 查看大纲
python scripts/novel_cli.py outline show
```

### stage - 阶段管理

```bash
# 列出阶段
python scripts/novel_cli.py stage list

# 添加阶段
python scripts/novel_cli.py stage add <序号> --name <名称> --start <起始章> --end <结束章> [OPTIONS]

Options:
  --words INTEGER      阶段字数
  --map TEXT           主要地图
```

### blueprint - 蓝图管理

```bash
# 生成章节蓝图
python scripts/novel_cli.py blueprint generate <起始章> <结束章>

# 查看蓝图
python scripts/novel_cli.py blueprint show <章节号>
```

### context - 上下文管理

```bash
# 获取写作上下文
python scripts/novel_cli.py context get <章节号> [--rag/--no-rag]
```

### character - 人物管理

```bash
# 列出人物
python scripts/novel_cli.py character list

# 添加人物
python scripts/novel_cli.py character add <姓名> [OPTIONS]

Options:
  --type TEXT          人物类型（protagonist/deuteragonist/supporting/npc）
  --importance INTEGER 重要度1-10
  --confirmed          是否已确认
```

### rag - 向量检索

```bash
# 语义搜索
python scripts/novel_cli.py rag search <查询词> [--type <类型>] [--top-k <数量>]

# 重建索引
python scripts/novel_cli.py rag rebuild

# 查看状态
python scripts/novel_cli.py rag status
```

### audit - 审查

```bash
# 审查单章
python scripts/novel_cli.py audit chapter <章节号>

# 批量审查
python scripts/novel_cli.py audit range <起始-结束>
```

### sync - 同步

```bash
# DB同步到Markdown
python scripts/novel_cli.py sync db-to-md

# 检查一致性
python scripts/novel_cli.py sync check
```

### diagram - 图解

```bash
# 人物关系图
python scripts/novel_cli.py diagram character

# 剧情时间线
python scripts/novel_cli.py diagram timeline
```

### error - 错误记录

```bash
# 记录错误
python scripts/novel_cli.py error log --category <分类> --severity <级别> --desc <描述>

# 生成报告
python scripts/novel_cli.py error report
```

### learnings - 记忆系统

```bash
# 查看状态
python scripts/novel_cli.py learnings status

# 读取文件
python scripts/novel_cli.py learnings read <文件名>
```
