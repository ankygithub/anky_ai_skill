# CLI 完整命令参考

## 命令总览

```
novel_cli.py [全局选项] <命令> [命令选项] [参数]

全局选项：
  -p, --project PATH   小说项目目录（默认：当前目录）
  --help               显示帮助信息
```

---

## 1. init - 初始化项目

**功能**：创建新的小说项目目录结构、数据库、基础配置文件

```bash
python novel_cli.py init "小说名称" [选项]
```

**参数**：
- `novel_name` (必需)：小说名称

**选项**：
- `-g, --genre TEXT`：小说类型（如：修仙、都市、科幻）
- `-w, --total-words INTEGER`：总字数（默认：500000）
- `-c, --chapters INTEGER`：总章数（默认：80）
- `--words-per-chapter INTEGER`：每章字数（默认：6000）

**示例**：
```bash
# 基础用法
C:\Python\Python313\python.exe novel_cli.py init "修仙之旅"

# 完整参数
C:\Python\Python313\python.exe novel_cli.py init "道种起源" -g 修仙 -w 1000000 -c 200

# 在指定目录创建
C:\Python\Python313\python.exe novel_cli.py -p "D:/projects" init "测试小说"
```

**输出**：
- 目录结构：《书名》/plan, characters, 小说正文
- 数据库：plan/novel.db
- 配置文件：plan/01-基础配置/小说基本信息.md

---

## 2. outline - 大纲管理

### 2.1 outline create - 创建大纲模板

```bash
python novel_cli.py outline create
```

**功能**：生成全书大纲Markdown模板（位于 `plan/05-情节规划/全书大纲.md`）

**输出内容**：
- 故事梗概
- 分阶段剧情框架
- 主要人物弧线
- 关键转折点
- 世界观框架

**注意**：生成的是模板，需用户或AI填充具体内容

### 2.2 outline show - 查看大纲

```bash
python novel_cli.py outline show
```

**功能**：显示大纲摘要（前2000字）

---

## 3. stage - 阶段规划

### 3.1 stage list - 列出阶段

```bash
python novel_cli.py stage list
```

**输出格式**：
```
序号    名称                章节范围       字数       状态
------------------------------------------------------------
1       开篇崛起            第1-40章      200000    planned
2       宗门争锋            第41-80章     300000    planned
```

### 3.2 stage add - 添加阶段

```bash
python novel_cli.py stage add <阶段号> [选项]
```

**参数**：
- `stage_number` (必需，int)：阶段序号

**选项**：
- `--name TEXT` (必需)：阶段名称
- `-s, --start INTEGER` (必需)：起始章节
- `-e, --end INTEGER` (必需)：结束章节
- `--words INTEGER`：阶段预计字数
- `--map TEXT`：主要地图名称

**示例**：
```bash
python novel_cli.py stage add 1 --name "开篇崛起" -s 1 -e 40 --words 200000
python novel_cli.py stage add 2 --name "宗门争锋" -s 41 -e 80 --map "青云宗"
```

**输出**：
- 阶段记录写入数据库
- 创建 `plan/06-阶段规划/阶段N-名称/阶段概要.md`

---

## 4. blueprint - 章节蓝图

### 4.1 blueprint init - 初始化章节蓝图

```bash
python novel_cli.py blueprint init <起始章> <结束章>
```

**功能**：批量创建章节蓝图模板（⚠️ 空模板，需AI填充）

**参数**：
- `start` (必需，int)：起始章节号
- `end` (必需，int)：结束章节号

**示例**：
```bash
# 创建第1-5章蓝图模板
python novel_cli.py blueprint init 1 5

# 创建第10-20章蓝图模板
python novel_cli.py blueprint init 10 20
```

**输出位置**：`plan/06-阶段规划/章节蓝图/第XXX章蓝图.md`

**蓝图模板包含**：
- 本章目标
- 场景列表（场景1、场景2...）
- 伏笔操作（埋下/回收）
- 爽点标记

### 4.2 blueprint show - 查看蓝图

```bash
python novel_cli.py blueprint show <章节号>
```

**功能**：显示指定章节的完整蓝图内容

---

## 5. context - 上下文管理

### 5.1 context get - 获取写作上下文（核心命令）

```bash
python novel_cli.py context get <章节号>
```

**功能**：生成完整的写作上下文报告（**写作前必须执行**）

**输出内容**：
1. **本章蓝图** - 从蓝图文件读取
2. **前文摘要** - 最近3-5章的状态和字数
3. **活跃人物状态** - 可出场的人物列表（最多10位）
4. **待回收伏笔** - 已埋下但未回收的伏笔（最多10条）
5. **当前地图** - 章节发生的地点
6. **文风提示** - 参考风格建议

**示例**：
```bash
python novel_cli.py context get 1
python novel_cli.py context get 15
```

**输出示例片段**：
```
# 第3章写作上下文报告

## 本章蓝图
**蓝图文件**：.../第003章蓝图.md

# 第3章蓝图
...
## 活跃人物状态
- **秦墨**（protagonist）：active | 势力：青云宗 | 修为：炼气三层
- **林婉儿**（deuteragonist）：active | 势力：青云宗 | 修为：炼气二层

## 待回收伏笔
- [重要] 秦墨体内的神秘力量（第1章埋下）
```

---

## 6. write - 写作命令

```bash
python novel_cli.py write <章节号>
```

**功能**：准备写作环境（检查蓝图、显示流程、确定保存路径）

**注意**：实际写作需结合AI模型调用，本命令为框架实现

**输出**：
- 章节状态检查
- 蓝图文件路径
- 写作流程提示
- 正文保存路径（自动确定所属"部"）

---

## 7. character - 人物管理

### 7.1 character list - 列出人物

```bash
python novel_cli.py character list
```

**输出格式**：
```
姓名        类型            状态      重要度    确认
--------------------------------------------------
秦墨        protagonist     active    10       ✓
林婉儿      deuteragonist   active    8        
张长老      supporting      active    5        
路人甲      npc             active    1         
```

### 7.2 character add - 添加人物

```bash
python novel_cli.py character add <姓名> [选项]
```

**参数**：
- `name` (必需)：人物姓名

**选项**：
- `--type TEXT`：人物类型
  - `protagonist` - 主角
  - `deuteragonist` - 重要配角（女主/男二）
  - `supporting` - 配角
  - `npc` - 路人角色
- `--importance INTEGER`：重要度1-10（默认：5）
- `--confirmed / --no-confirmed`：是否用户确认（默认：no）

**示例**：
```bash
python novel_cli.py character add "秦墨" -t protagonist --importance 10 --confirmed
python novel_cli.py character add "路人甲" -t npc
```

---

## 8. map - 地图管理

### 8.1 map list - 列出地图

```bash
python novel_cli.py map list
```

**输出格式**：
```
名称              层级   实力水平      状态
----------------------------------------------
青云宗            1      筑基期        active
秘境入口          2      金丹期        active
```

---

## 9. rag - RAG向量检索

### 9.1 rag search - 语义搜索

```bash
python novel_cli.py rag search <查询文本> [选项]
```

**选项**：
- `--type TEXT`：按来源类型过滤（character/map/lore/item/chapter）
- `--top-k INTEGER`：返回结果数量（默认：5）

**示例**：
```bash
python novel_cli.py rag search "秦墨的身世"
python novel_cli.py rag search "青云宗规则" --type map --top-k 3
```

**前提**：需要安装Ollama并运行本地服务

### 9.2 rag rebuild - 重建索引

```bash
python novel_cli.py rag rebuild
```

**功能**：清空RAG索引（设定变更后使用）

### 9.3 rag status - 查看状态

```bash
python novel_cli.py rag status
```

**输出**：切片总数、嵌入模型、Ollama地址

---

## 10. audit - 审查与同步

### 10.1 audit sync - 同步DB到Markdown

```bash
python novel_cli.py audit sync
```

**功能**：将数据库中的人物数据同步到 `plan/03-角色设定/人物总览.md`

**输出**：
- Markdown表格形式的人物清单
- 统计人数

### 10.2 audit check - 一致性检查

```bash
python novel_cli.py audit check
```

**输出**：DB中各表的数量统计

---

## 路径识别规则

CLI支持三种项目目录指定方式：

1. **直接指向《书名》目录**：
   ```bash
   python novel_cli.py -p "《修仙之旅》" outline create
   ```

2. **指向《书名》目录的上级目录**（自动查找）：
   ```bash
   python novel_cli.py -p "D:/projects" outline create
   # 自动找到 D:/projects/《修仙之旅》/plan/novel.db
   ```

3. **在《书名》目录内执行**（默认）：
   ```bash
   cd "《修仙之旅》"
   python novel_cli.py outline create
   ```

---

## 标准工作流示例

```bash
# Step 1: 初始化项目
C:\Python\Python313\python.exe novel_cli.py init "道种起源" -g 修仙 -w 500000 -c 80

# Step 2: 创建大纲模板
C:\Python\Python313\python.exe novel_cli.py outline create

# Step 3: 添加阶段规划
C:\Python\Python313\python.exe novel_cli.py stage add 1 --name "初入异界" -s 1 -e 20
C:\Python\Python313\python.exe novel_cli.py stage add 2 --name "宗门崛起" -s 21 -e 50
C:\Python\Python313\python.exe novel_cli.py stage add 3 --name "秘境争锋" -s 51 -e 80

# Step 4: 初始化章节蓝图
C:\Python\Python313\python.exe novel_cli.py blueprint init 1 10

# Step 5: 添加主要人物
C:\Python\Python313\python.exe novel_cli.py character add "秦墨" -t protagonist --confirmed
C:\Python\Python313\python.exe novel_cli.py character add "林婉儿" -t deuteragonist

# Step 6: 获取写作上下文（强制）
C:\Python\Python313\python.exe novel_cli.py context get 1

# Step 7: 写作（基于上下文报告）
# ... AI写作过程 ...

# Step 8: 同步审查
C:\Python\Python313\python.exe novel_cli.py audit sync
```

---

## 错误处理

常见错误及解决方案：

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `未找到 novel.db` | 项目目录不正确 | 使用 `-p` 指定正确的项目目录 |
| `目录已存在` | 小说项目已创建 | 检查目录是否已存在 |
| `未找到小说信息` | 数据库为空 | 先执行 `init` 命令 |
| `蓝图不存在` | 尚未创建蓝图 | 先执行 `blueprint init` |
