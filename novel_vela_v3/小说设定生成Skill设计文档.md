# 小说设定生成 Skill 设计文档

> 版本：v1.0
> 日期：2026-05-16
> 状态：设计中

---

## 一、设计决策确认

### 1.1 交互方式
- **自然对话式**：用户用自然语言描述需求，skill主动引导
- 支持命令触发和自然语言触发（混合模式）

### 1.2 AI生成策略
- 用户提供信息简略时，skill自动推理生成完整配置
- 用户提供详细设定时，**严格遵循用户设定，不自我发散**
- 生成后展示给用户确认/修改，支持局部调整

### 1.3 提示词设计原则
- 给出详细的提示词和选项界面
- 尽可能一步到位
- 能让用户选择的就让用户选择（下拉选项、多选、单选）
- 减少用户的自由输入，降低认知负担

### 1.4 输出格式
- **Markdown**：所有文档以Markdown格式输出，便于用户直接阅读和手动微调
- **SQLite**：所有结构化数据存储在SQLite中，便于程序查询和管理

### 1.5 章节长度
- 单章一般5000~10000字，上限20000字
- AI自动连续生成并合并
- 生成完成后必须有**复核流程**，避免合并后逻辑不通

### 1.6 人物数据库分级
- **主要人物**（剧情冲突性质）：即使篇幅短就下线，也要用户确认
- **NPC**（路人甲等）：自动入库

### 1.7 数据存储深度
- **SQLite**：所有结构化数据（人物状态、关系、出场记录、地图索引等）
- **Markdown**：只存正文和详细设定文档，另外生成的人物，也单独存放个人物文档，可以每50章归并一个人物文档

### 1.8 模版数据库方案
- **模版数据库**存放在 `skill目录/template/novel_template.db`
- 包含完整的空表结构 + 预设枚举数据（故事结构选项、叙事视角选项等）
- 初始化时直接copy到 `小说工程目录/《小说名称》/plan/novel.db`
- copy后自动重命名并写入小说基本信息

### 1.9 "部"的划分规则
- **一部 = 一个阶段**（按照阶段划分）
- 正文目录结构：`小说正文/第X部/001.md 002.md...`
- 章节编号连续（不重新从001开始）

### 1.10 参考小说/文风采集
- 初始化时询问用户是否有参考小说
- **方案A**：用户提供本地文本文件 → skill分析生成文风总结文档 → 存入 `plan/02-核心设定/参考作品与文风.md`
- **方案B**：用户指定已知作家 → skill基于已有知识生成文风总结
- **方案C**：无参考 → 使用默认网文风格

### 1.11 RAG向量检索（设定召回）
- **技术选型**：sqlite-vec（SQLite扩展，纯C编写，无依赖）
- **存储方式**：向量直接存储在SQLite数据库中，与现有数据共存
- **嵌入生成**：通过Ollama本地模型生成（默认 `nomic-embed-text`，768维）
  - Ollama地址：`http://127.0.0.1:11434`
  - 调用接口：`POST /api/embed`
  - 请求格式：`{"model": "nomic-embed-text", "input": "文本内容"}`
  - 返回格式：`{"embeddings": [[...]]}`
- **切片策略**：人物设定、地图、规则等按段落切片，生成768维向量
- **自动召回**：写作时根据当前章节语义自动召回最相关的设定切片
- **CLI命令**：`novel rag search/rebuild/status`

---

## 二、分层规划架构

### 2.1 四层规划模型

```
Layer 1: 全书大纲（10000字+）
    ├── 全书分阶段剧情描述
    ├── 主要人物弧线
    ├── 世界观框架
    └── 关键转折点
    ↓
Layer 2: 阶段规划（根据字数拆分）
    ├── 阶段剧情概要
    ├── 阶段人物卡（总结生成）
    ├── 阶段地图/场景
    └── 阶段爽点设计
    ↓
Layer 3: 章节蓝图（参考write-plans技能）
    ├── 章节级spec文档
    ├── 场景分解
    ├── 人物出场清单
    └── 伏笔操作
    ↓
Layer 4: 正文写作
    ├── 按段落生成
    ├── 自动合并
    └── 复核流程
```

### 2.2 阶段拆分规则

| 总字数 | 阶段数 | 每阶段字数 | 说明 |
|--------|--------|-----------|------|
| 50万字以下 | 1-2个阶段 | 25-50万字 | 短篇/中篇 |
| 50-100万字 | 2-3个阶段 | 30-50万字 | 标准长篇 |
| 100-300万字 | 3-5个阶段 | 50-80万字 | 大长篇 |
| 300万字以上 | 5-8个阶段 | 50-80万字 | 超长篇 |

阶段拆分原则：
- 以**地图切换**为主要分界点
- 以**主角重大成长**（如境界突破）为分界点
- 以**剧情主线转折**为分界点

---

## 三、数据模型设计

### 3.1 SQLite数据库Schema

```sql
-- 小说项目表
CREATE TABLE novels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,           -- 小说名称
    genre TEXT,                   -- 类型
    sub_genre TEXT,               -- 细分类型
    target_audience TEXT,         -- 目标受众
    story_structure TEXT,         -- 故事结构
    narrative_perspective TEXT,   -- 叙事视角
    total_chapters INTEGER,       -- 总章数
    words_per_chapter INTEGER,    -- 每章字数
    total_words INTEGER,          -- 总字数
    status TEXT DEFAULT 'planning', -- 状态
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 阶段表
CREATE TABLE stages (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    stage_number INTEGER NOT NULL, -- 阶段序号
    name TEXT NOT NULL,            -- 阶段名称
    description TEXT,              -- 阶段描述
    word_count INTEGER,            -- 阶段字数
    start_chapter INTEGER,         -- 起始章节
    end_chapter INTEGER,           -- 结束章节
    map_name TEXT,                 -- 主要地图
    status TEXT DEFAULT 'planned', -- 状态
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 人物表
CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,            -- 人物名称
    name_pinyin TEXT,              -- 拼音（用于排序）
    type TEXT NOT NULL,            -- 类型：protagonist/deuteragonist/supporting/npc
    status TEXT DEFAULT 'active',  -- 状态：active/sleeping/retired/dead
    first_appearance INTEGER,      -- 首次出场章节
    last_appearance INTEGER,       -- 最后出场章节
    death_chapter INTEGER,         -- 死亡章节（如有）
    faction TEXT,                  -- 所属势力
    cultivation_level TEXT,        -- 修为/等级
    importance INTEGER DEFAULT 1,  -- 重要度：1-10
    is_confirmed BOOLEAN DEFAULT 0,-- 是否用户确认
    md_file_path TEXT,             -- 对应Markdown文件路径
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 人物关系表
CREATE TABLE character_relations (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    character_a_id INTEGER REFERENCES characters(id),
    character_b_id INTEGER REFERENCES characters(id),
    relation_type TEXT NOT NULL,   -- 关系类型：ally/enemy/love/family/mentor/rival
    description TEXT,              -- 关系描述
    start_chapter INTEGER,         -- 关系起始章节
    end_chapter INTEGER,           -- 关系结束章节（如有）
    is_active BOOLEAN DEFAULT 1    -- 关系是否仍然有效
);

-- 人物出场记录表
CREATE TABLE character_appearances (
    id INTEGER PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    chapter_number INTEGER NOT NULL,
    scene_number INTEGER,          -- 场景序号
    role TEXT,                     -- 本章角色：protagonist/supporting/background/mentioned
    action TEXT                    -- 本章行为摘要
);

-- 地图表
CREATE TABLE maps (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    name TEXT NOT NULL,            -- 地图名称
    level INTEGER,                 -- 地图层级
    parent_map_id INTEGER REFERENCES maps(id),
    description TEXT,              -- 地图描述
    entry_condition TEXT,          -- 进入条件
    power_level TEXT,              -- 该地图的实力水平
    factions TEXT,                 -- 该地图的势力（JSON数组）
    status TEXT DEFAULT 'active'   -- 状态
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
    status TEXT DEFAULT 'planned', -- planned/blueprinted/written/reviewed
    md_file_path TEXT,             -- 正文Markdown路径
    blueprint_md_path TEXT,        -- 蓝图Markdown路径
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 章节蓝图场景表
CREATE TABLE chapter_scenes (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id),
    scene_number INTEGER NOT NULL,
    title TEXT,
    purpose TEXT,                  -- 场景目的
    mood TEXT,                     -- 情绪基调
    word_budget INTEGER,           -- 字数预算
    characters TEXT,               -- 出场人物（JSON数组）
    key_events TEXT,               -- 关键事件
    foreshadowing TEXT,            -- 伏笔操作
    climax_marker BOOLEAN DEFAULT 0 -- 是否高潮场景
);

-- 伏笔表
CREATE TABLE foreshadowing (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    description TEXT NOT NULL,     -- 伏笔描述
    plant_chapter INTEGER,         -- 埋下章节
    resolve_chapter INTEGER,       -- 回收章节（可为空）
    status TEXT DEFAULT 'planted', -- planted/resolved/abandoned
    importance INTEGER DEFAULT 1   -- 重要度
);

-- 版本历史表
CREATE TABLE versions (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    file_path TEXT NOT NULL,       -- 文件路径
    version_number INTEGER,        -- 版本号
    content_hash TEXT,             -- 内容哈希
    change_summary TEXT,           -- 变更摘要
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG向量检索表（sqlite-vec扩展）
-- 向量虚拟表，由sqlite-vec管理
CREATE VIRTUAL TABLE vec_chunks USING vec0(
    embedding float[768],          -- 768维向量
    content_id INTEGER,            -- 关联rag_chunks.id
    source_type TEXT,              -- 来源类型
    chunk_index INTEGER            -- 切片序号
);

-- RAG内容表（存储原始切片内容）
CREATE TABLE rag_chunks (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id),
    content TEXT NOT NULL,         -- 切片内容
    source_type TEXT NOT NULL,     -- 来源：character/map/lore/item/chapter
    source_id INTEGER,             -- 来源ID
    chunk_index INTEGER DEFAULT 0, -- 切片序号
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Markdown文件结构

```
小说工程目录/
└── 《小说名称》/
    ├── plan/                          # 规划文档（Markdown + SQLite）
    │   ├── novel.db                   # SQLite数据库（从模版copy）
    │   ├── 01-基础配置/
    │   │   ├── 小说基本信息.md
    │   │   └── 写作参数.md
    │   ├── 02-核心设定/
    │   │   ├── 核心大纲.md
    │   │   ├── 金手指与核心卖点.md
    │   │   └── 参考作品与文风.md      # 包含参考小说文风总结
    │   ├── 03-角色设定/
    │   │   ├── 主角人设.md
    │   │   ├── 配角图谱.md
    │   │   └── 角色关系图.md
    │   ├── 04-世界观/
    │   │   ├── 世界背景.md
    │   │   ├── 力量体系.md
    │   │   ├── 势力分布.md
    │   │   └── 历史时间线.md
    │   ├── 05-情节规划/
    │   │   ├── 全书大纲.md          # 10000字+全书大纲
    │   │   ├── 阶段划分.md
    │   │   └── 关键转折点.md
    │   └── 06-阶段规划/
    │       ├── 阶段1-名称/
    │       │   ├── 阶段概要.md
    │       │   ├── 阶段人物卡.md
    │       │   ├── 阶段地图.md
    │       │   └── 章节蓝图/
    │       │       ├── 第001-050章蓝图.md
    │       │       └── ...
    │       └── 阶段2-名称/
    │           └── ...
    ├── characters/                    # 人物详细设定（Markdown）
    │   ├── 主角/
    │   │   └── 主角.md
    │   ├── 重要配角/
    │   │   ├── xx.md
    │   │   └── ...
    │   └── NPC/
    │       └── NPC.md
    └── 小说正文/                       # 正文（Markdown）
        ├── 第一部/                     # 对应阶段1
        │   ├── 001.md
        │   ├── 002.md
        │   └── ...
        ├── 第二部/                     # 对应阶段2
        │   ├── 151.md
        │   ├── 152.md
        │   └── ...
        └── ...
```

---

## 四、核心工作流设计

### 4.1 初始化工作流

```
用户：我想写一本修仙小说，主角是个废柴，意外获得了一个可以吞噬万物的金手指

Skill：
1. 解析用户输入，提取关键信息
2. 展示基础信息确认界面（选项式）
3. 用户确认后，创建项目目录和数据库
4. 进入【全书大纲生成】工作流
```

### 4.2 全书大纲生成工作流

```
Step 1: 生成大纲框架
- AI基于基础信息生成大纲框架
- 包含：主线剧情、分阶段规划、主要人物弧线

Step 2: 用户确认与修改
- 展示生成的大纲（摘要形式）
- 用户可：确认/修改/补充

Step 3: 生成详细大纲（10000字+）
- AI生成详细大纲文档
- 包含：
  - 每个阶段的核心剧情
  - 关键转折点
  - 人物成长轨迹
  - 地图切换节点
  - 爽点设计

Step 4: 保存与同步
- 保存Markdown文件
- 同步到SQLite数据库
- 进入【阶段规划】工作流
```

### 4.3 阶段规划工作流

```
Step 1: 阶段拆分
- 根据总字数和地图切换点自动拆分阶段
- 展示阶段列表供用户确认

Step 2: 生成阶段概要
- 为每个阶段生成：
  - 阶段剧情概要
  - 阶段目标
  - 阶段爽点

Step 3: 生成阶段人物卡
- 总结该阶段出场人物
- 标注人物状态变化
- 新出场人物需用户确认

Step 4: 生成阶段地图
- 标注阶段主要地图
- 地图势力分布

Step 5: 保存与同步
- 保存Markdown文件
- 同步到SQLite数据库
- 用户可选择进入【章节蓝图生成】或继续下一阶段
```

### 4.4 章节蓝图生成工作流（参考write-plans技能）

```
Step 1: 选择生成范围
- 批量连续生成（默认50章）
- 指定生成：第X章到第Y章
- 全量生成

Step 2: 设置节奏/风格指导
- 用户输入节奏指导（可选）
- 提供预设选项

Step 3: 生成章节蓝图
- AI基于阶段规划生成章节蓝图
- 每章蓝图包含：
  - 章节标题
  - 所在地图
  - 出场人物及角色
  - 场景列表（场景目的、情绪、字数预算）
  - 关键事件
  - 伏笔操作
  - 爽点标记

Step 4: 用户确认
- 展示生成的蓝图列表
- 用户可：确认/修改/重新生成

Step 5: 保存与同步
- 保存Markdown文件
- 同步到SQLite数据库
```

### 4.5 正文写作工作流

```
Step 1: 选择章节
- 用户选择要写作的章节
- Skill加载该章节的蓝图

Step 2: 【强制】读取上下文（通过CLI）
- 调用 CLI: novel context get <章节号>
- 生成上下文报告，包含：
  - 本章蓝图
  - 前5章正文摘要（动态调整，确保上下文不断裂）
  - 当前活跃人物状态
  - 待回收伏笔列表
  - 当前地图信息
  - 参考文风提示
- Skill必须读取上下文报告后才能继续

Step 3: 按场景生成
- 按场景列表逐个生成
- 每个场景再按段落生成
- 每段生成时携带：场景目标 + 前文摘要 + 人物状态

Step 4: 自动合并
- 将生成的段落按顺序合并
- 检查段落间衔接

Step 5: 【强制】去AI味处理
- 调用去AI味模块：
  - 检查并替换过于工整的句式
  - 增加口语化表达
  - 增加感官细节
  - 删除总结性语句
  - 允许不完整的句子和留白
- 参考文风文档进行风格校准

Step 6: 复核流程
- AI自我复核：
  - 检查逻辑连贯性
  - 检查人物行为一致性
  - 检查战力体系一致性
  - 检查伏笔呼应
  - 检查是否有AI味残留
- 生成复核报告
- 如有问题，标记待修改

Step 7: 用户确认
- 展示完整章节
- 展示复核报告
- 用户可：确认/修改/重新生成

Step 8: 保存与同步
- 保存Markdown文件到 小说正文/第X部/XXX.md
- 更新SQLite数据库（章节状态、人物出场记录等）
- 生成本章摘要存入数据库
```

### 4.6 复核流程详细设计

```
复核维度：
1. 逻辑连贯性
   - 时间线是否合理
   - 因果关系是否成立
   - 场景切换是否自然

2. 人物一致性
   - 人物行为是否符合设定
   - 人物对话是否符合性格
   - 人物能力是否超限

3. 战力体系一致性
   - 战斗结果是否合理
   - 境界差距是否尊重
   - 金手指使用是否合规

4. 伏笔呼应
   - 已埋伏笔是否被意外破坏
   - 新内容是否自然引入新伏笔
   - 该回收的伏笔是否已回收

5. 地图一致性
   - 地理描述是否前后一致
   - 势力分布是否合规
   - 地图规则是否被违反

复核输出：
- 复核通过/不通过
- 问题列表（位置+描述+建议修改）
- 修改后自动重新复核
```

---

## 五、人物管理详细设计

### 5.1 人物生命周期状态机

```
[未出场] → [活跃] → [沉睡] → [活跃]
              ↓
           [退场] → [不可复用]
              ↓
           [死亡] → [不可复用]
```

### 5.2 人物出场控制

```
生成章节时，skill自动检查：
1. 该章节蓝图中出场的人物是否在正确状态
2. 已死亡人物是否意外出场
3. 沉睡人物是否需要唤醒
4. 新人物是否需要创建档案

如发现异常：
- 标记警告
- 提示用户确认
- 或自动修正（NPC级别）
```

### 5.3 人物确认流程

```
新人物出场时：
- 提取人物信息（姓名、身份、作用）
- 判断重要度：
  - 剧情冲突性质 → 展示给用户确认
  - NPC性质 → 自动入库

用户确认界面：
┌─────────────────────────────────────┐
│  新人物 detected                      │
│                                      │
│  姓名：黑衣人甲                        │
│  身份：追杀主角的杀手                  │
│  作用：制造冲突，引出幕后势力          │
│  预计出场：1-2章                      │
│                                      │
│  人物类型判断：                        │
│  ( ) 主要人物（需详细设定）            │
│  (✓) NPC（自动生成简单设定）          │
│                                      │
│  [确认] [修改] [跳过]                 │
└─────────────────────────────────────┘
```

---

## 六、CLI程序设计

### 6.1 命令结构

```bash
# 项目初始化
novel init <小说名称>              # 初始化新项目（copy模版数据库）
novel config                     # 修改项目配置

# 规划阶段
novel outline generate           # 生成全书大纲
novel outline show               # 查看大纲
novel outline edit               # 编辑大纲

novel stage list                 # 列出所有阶段
novel stage generate <阶段号>    # 生成阶段规划
novel stage show <阶段号>        # 查看阶段规划

# 章节蓝图
novel blueprint generate         # 生成章节蓝图
novel blueprint show <章节号>    # 查看章节蓝图
novel blueprint edit <章节号>    # 编辑章节蓝图

# 写作（核心：强制上下文读取）
ovel write <章节号>             # 写作指定章节
  # 内部自动执行：
  # 1. novel context get <章节号>  → 生成上下文报告
  # 2. 基于上下文报告生成内容
  # 3. novel review <章节号>       → 复核
novel write --range 1-10         # 批量写作
novel review <章节号>            # 复核章节

# 上下文管理（强制读取接口）
novel context get <章节号>       # 【关键】获取写作上下文
  # 输出：文本格式的上下文报告，包含：
  # - 本章蓝图
  # - 前N章摘要（动态计算，确保上下文不断裂）
  # - 活跃人物状态
  # - 待回收伏笔
  # - 当前地图信息
  # - 参考文风提示

# 人物管理
novel character list             # 列出所有人物
novel character show <姓名>      # 查看人物详情
novel character add              # 添加人物
novel character update <姓名>    # 更新人物状态

# 地图管理
novel map list                   # 列出所有地图
novel map show <地图名>          # 查看地图详情

# 文风管理
novel style analyze <文件路径>   # 分析参考小说文风
novel style show                 # 查看当前文风设定

# RAG向量检索
novel rag search <查询文本>      # 语义搜索相关设定
  # 示例：novel rag search "主角的武器"
  # 返回：黑色匕首的来历、属性、使用记录等
novel rag search <查询文本> --type <类型>  # 按类型过滤
  # 类型：character/map/lore/item/chapter
novel rag rebuild                # 重建向量索引（设定变更后）
novel rag status                 # 查看向量索引状态

# 审查与同步（核心功能）
novel audit chapter <章节号>     # 审查章节是否符合spec
  # 输出审查报告：
  # - 是否符合章节蓝图
  # - 人物出场是否与DB一致
  # - 战力体系是否合规
  # - 伏笔是否正确处理
  # - 地图描述是否一致

novel audit range <起始>-<结束>  # 批量审查多个章节

novel audit fix <章节号>         # 根据审查结果自动修复
  # 修复项：
  # - 更新DB中的人物出场记录
  # - 修正人物状态不一致
  # - 补充遗漏的伏笔标记
  # - 更新章节状态

novel sync db-to-md              # 将DB内容同步到Markdown文档
  # 同步项：
  # - 人物状态 → 人物设定文档
  # - 地图信息 → 世界观文档
  # - 伏笔状态 → 情节规划文档

novel sync md-to-db              # 将Markdown变更同步到DB
  # 监听Markdown文件变更
  # 解析变更内容更新DB

novel sync check                 # 检查DB与Markdown的一致性
  # 输出差异报告：
  # - DB中有但文档中无的内容
  # - 文档中有但DB中无的内容
  # - 两者不一致的内容

# 工具
novel check                      # 一致性检查
novel stats                      # 创作统计
novel export                     # 导出小说
```

### 6.2 核心模块设计

```python
# core/db.py - 数据库操作
class NovelDB:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path)
    
    def create_novel(self, novel_data):
        """创建小说项目"""
    
    def get_character(self, name):
        """获取人物信息"""
    
    def update_character_status(self, name, status):
        """更新人物状态"""
    
    def log_appearance(self, character_name, chapter, scene, role):
        """记录人物出场"""
    
    def get_active_characters(self, chapter):
        """获取某章可出场的人物"""
    
    def check_consistency(self, chapter_content):
        """检查一致性"""
    
    def audit_chapter(self, chapter_number, chapter_content, blueprint):
        """审查章节是否符合spec"""
        # 审查维度：
        # 1. 蓝图符合度：是否按蓝图写作
        # 2. 人物一致性：出场人物是否与DB记录一致
        # 3. 战力合规性：是否违反战力体系
        # 4. 伏笔处理：是否正确处理伏笔
        # 5. 地图一致性：地图描述是否与设定一致
        # 6. 时间线一致性：时间逻辑是否合理
        return {
            'passed': False,
            'issues': [
                {
                    'type': 'character',
                    'severity': 'warning',
                    'description': '人物状态与DB不一致',
                    'details': 'DB中秦墨修为：炼气期，但文中描述为筑基期',
                    'suggestion': '更新DB或修改文中描述'
                }
            ]
        }
    
    def fix_audit_issues(self, chapter_number, issues):
        """根据审查结果自动修复DB"""
        # 自动修复项：
        # - 更新人物出场记录
        # - 修正人物状态
        # - 补充伏笔标记
        # - 更新章节状态
    
    def sync_to_markdown(self):
        """将DB内容同步到Markdown文档"""
        # 同步项：
        # - 人物状态 → 人物设定文档
        # - 地图信息 → 世界观文档
        # - 伏笔状态 → 情节规划文档
    
    def sync_from_markdown(self, md_file_path):
        """将Markdown变更同步到DB"""
        # 解析Markdown更新DB
    
    def check_sync_status(self):
        """检查DB与Markdown的一致性"""
        # 返回差异报告
        return {
            'db_only': [],      # DB中有但文档中无
            'md_only': [],      # 文档中有但DB中无
            'mismatch': []      # 两者不一致
        }

# core/md_sync.py - Markdown同步
class MarkdownSync:
    def sync_to_db(self, md_file_path):
        """将Markdown内容同步到数据库"""
    
    def sync_from_db(self, table, novel_id):
        """将数据库内容导出到Markdown"""
    
    def watch_changes(self, directory):
        """监听Markdown文件变更"""

# core/rag.py - RAG向量检索
class RAGRetriever:
    def __init__(self, db_path, api_config):
        self.db = sqlite3.connect(db_path)
        self.api_config = api_config  # API配置（OpenAI/DeepSeek等）
    
    def init_vector_db(self):
        """初始化向量数据库（加载sqlite-vec扩展）"""
        import sqlite_vec
        self.db.enable_load_extension(True)
        sqlite_vec.load(self.db)
        self.db.enable_load_extension(False)
    
    def add_chunk(self, content, source_type, source_id, embedding=None):
        """添加切片到向量数据库"""
        # 1. 存储内容
        # 2. 生成/使用嵌入向量
        # 3. 存储向量
    
    def search(self, query_text, top_k=5, source_type=None):
        """语义搜索相关设定"""
        # 1. 生成查询嵌入向量
        # 2. 执行向量搜索
        # 3. 返回相关切片
    
    def rebuild_index(self):
        """重建向量索引（设定变更后）"""
        # 清除旧索引，重新切片并嵌入
    
    def get_embedding(self, text):
        """调用Ollama本地模型生成嵌入向量"""
        # Ollama地址：http://127.0.0.1:11434
        # 模型：nomic-embed-text（768维）
        # 调用接口：POST /api/embed
        # 请求格式：{"model": "nomic-embed-text", "input": "文本内容"}
        # 返回格式：{"embeddings": [[...]]}

# core/llm.py - 大模型调用
class LLMWriter:
    def __init__(self, model_config):
        self.model = model_config
    
    def generate_outline(self, novel_config):
        """生成全书大纲"""
    
    def generate_stage_plan(self, outline, stage_number):
        """生成阶段规划"""
    
    def generate_blueprint(self, stage_plan, chapter_range):
        """生成章节蓝图"""
    
    def write_scene(self, blueprint, scene_number, context):
        """写作场景"""
    
    def review_chapter(self, chapter_content, blueprint):
        """复核章节"""

# core/context.py - 上下文管理
class ContextManager:
    def __init__(self, db, novel_id):
        self.db = db
        self.novel_id = novel_id
    
    def get_chapter_context(self, chapter_number):
        """获取章节上下文"""
        return {
            'blueprint': self.get_blueprint(chapter_number),
            'recent_summary': self.get_recent_summary(chapter_number, n=3),
            'character_states': self.get_character_states(chapter_number),
            'active_foreshadowing': self.get_active_foreshadowing(chapter_number),
            'map_info': self.get_current_map(chapter_number)
        }
    
    def build_prompt(self, chapter_number, scene_number):
        """构建生成提示词"""
```

---

## 七、Skill交互示例

### 7.1 完整创作流程示例

```
用户：我想写一本修仙小说，主角是个废柴，意外获得了一个可以吞噬万物的金手指

Skill：
🎉 欢迎来到小说设定生成器！

我已收到你的灵感：
> 修仙小说，废柴主角，吞噬万物金手指

【第一步】基础信息确认
① 类型：修仙 ✓
② 细分类型：请选择
   [ ] 废柴流  [✓] 吞噬流  [ ] 重生  [ ] 系统流
   [ ] 凡人流  [ ] 无敌流  [ ] 种田  [ ] 其他
③ 目标受众：( ) 男频  ( ) 女频  (✓) 无特定
④ 故事结构：
   ( ) 英雄之旅  ( ) 起承转合  (✓) 凡人流渐进
   ( ) 自由结构
⑤ 叙事视角：
   ( ) 第一人称  (✓) 第三人称有限视角
   ( ) 第三人称全知  ( ) 多视角轮换
⑥ 总章数：___750___  每章字数：___6000___

请确认或修改，也可以直接说"默认"继续。

---

用户：默认

Skill：
✅ 基础信息已确认

【第二步】核心设定生成
基于你的灵感，我生成了以下核心大纲：
┌────────────────────────────────────────┐
│ 废柴少年秦墨出身没落修仙世家...         │
│ ...                                    │
└────────────────────────────────────────┘

① 满意请说"继续"
② 修改请直接说
③ 重新生成请说"重来"

同时提供可选扩展：
[ ] 添加感情线  [ ] 添加势力博弈
[ ] 添加身世之谜  [ ] 添加同伴羁绊

---

用户：继续

Skill：
✅ 核心设定已确认

【第三步】全书大纲生成
正在生成10000字+全书大纲...
[进度条]

大纲已生成，包含：
- 5个阶段，共750章
- 关键转折点：12个
- 主要人物：8位
- 地图切换：5次

请查看大纲摘要或说"继续"进入阶段规划。

---

用户：继续

Skill：
【第四步】阶段规划

阶段1：废柴崛起（第1-150章，约90万字）
- 主要地图：青云镇→青云宗
- 核心剧情：...
- 出场人物：...

阶段2：宗门风云（第151-300章，约90万字）
...

请确认阶段划分，或说"修改X"调整。

---

用户：确认

Skill：
✅ 阶段规划已确认

正在为每个阶段生成详细规划...

【第五步】章节蓝图生成

请选择生成范围：
① 批量连续生成（默认50章）
② 指定生成：第__章到第__章
③ 全量生成（共750章）

---

用户：批量50章

Skill：
请输入节奏/风格指导（可选）：
如"前30章快节奏，每章安排一个爽点"
或直接说"默认"

---

用户：默认

Skill：
正在生成第1-50章蓝图...
[进度条]

✅ 章节蓝图已生成

【第六步】正文写作

请选择：
① 说"写第X章"开始写作
② 说"批量写作"连续写作多章
③ 说"查看蓝图"查看章节蓝图

---

用户：写第1章

Skill：
正在加载第1章蓝图...
场景1：秦墨被欺（预计3000字）
正在生成...
[进度条]

场景1生成完成，继续生成场景2...
...

✅ 第1章生成完成！

【复核流程】
正在复核...
┌────────────────────────────────────────┐
│ 复核报告：                             │
│ ✅ 逻辑连贯性：通过                     │
│ ✅ 人物一致性：通过                     │
│ ⚠️ 战力体系：轻微问题                   │
│    位置：第3段                          │
│    问题：秦墨击败炼气期对手过于轻松     │
│    建议：增加战斗过程描写，体现技巧而非 │
│          单纯靠金手指碾压               │
│ ✅ 伏笔呼应：通过                       │
│ ✅ 地图一致性：通过                     │
└────────────────────────────────────────┘

请说"修改"处理问题，或"确认"保存。

---

用户：修改

Skill：
已自动修复战力问题，重新复核...
✅ 全部通过！

第1章已保存。
字数：6800字
人物出场：秦墨（主角）、王霸（反派NPC，已标记死亡）
新人物 detected：
- 王霸（NPC，追杀者，已死亡）
  自动入库 ✓

接下来：
① 说"继续"写第2章
② 说"查看"查看本章内容
③ 说"修改"手动编辑
④ 说"审查"检查本章与spec的一致性
⑤ 说"同步"更新DB与文档
```

### 7.2 审查功能示例

```
用户：审查第5章

Skill：
【审查模式】

正在审查第5章...
┌────────────────────────────────────────┐
│  审查报告：第5章                        │
│                                         │
│  审查维度1：蓝图符合度                   │
│  ✅ 通过 - 按蓝图完成所有场景            │
│                                         │
│  审查维度2：人物一致性                   │
│  ⚠️ 警告 - 发现1处不一致                │
│    问题：DB中林清雪状态为"跟随主角"      │
│          但文中描述为"独自离开"          │
│    建议：确认是否为剧情需要的状态变化    │
│                                         │
│  审查维度3：战力体系                     │
│  ✅ 通过                                │
│                                         │
│  审查维度4：伏笔处理                     │
│  ✅ 通过 - 正确回收了第3章的玉佩伏笔     │
│  ✅ 通过 - 正确埋下了新的势力伏笔        │
│                                         │
│  审查维度5：地图一致性                   │
│  ✅ 通过                                │
│                                         │
│  审查维度6：DB同步状态                   │
│  ⚠️ 警告 - DB中缺少2个人物出场记录      │
│    缺失：客栈老板、路人甲                │
│                                         │
│  ─────────────────────────────────────  │
│  审查结果：基本通过，有2项警告           │
│                                         │
│  请选择：                               │
│  ① "修复" - 自动修复DB不一致项          │
│  ② "忽略" - 忽略警告，标记为已审查      │
│  ③ "详细" - 查看详细对比                │
└────────────────────────────────────────┘
```

### 7.3 同步功能示例

```
用户：同步DB到文档

Skill：
【同步模式】DB → Markdown

正在检查差异...
┌────────────────────────────────────────┐
│  同步报告：                             │
│                                         │
│  发现3处需要同步：                       │
│                                         │
│  1. 人物状态更新                         │
│     DB：秦墨修为 → 筑基期               │
│     文档：仍为炼气期                     │
│     操作：更新文档                       │
│                                         │
│  2. 新人物补充                           │
│     DB：新增人物"黑衣人甲"               │
│     文档：未记录                         │
│     操作：添加到NPC文档                  │
│                                         │
│  3. 伏笔状态更新                         │
│     DB：玉佩伏笔 → 已回收               │
│     文档：仍为未回收                     │
│     操作：更新情节规划文档               │
│                                         │
│  请选择：                               │
│  ① "全部同步" - 执行所有同步操作        │
│  ② "逐个确认" - 逐个确认每项同步        │
│  ③ "取消" - 取消同步                   │
└────────────────────────────────────────┘
```

---

## 八、与write-plans技能的集成

### 8.1 集成方式

章节蓝图生成阶段直接调用write-plans技能：

```
输入：阶段规划文档
↓
write-plans技能
- 分析阶段规划
- 拆分为章节级任务
- 生成每章的spec（即章节蓝图）
↓
输出：章节蓝图集合
```

### 8.2 章节蓝图作为spec

每章蓝图包含：
- **Goal**：本章要达成的剧情目标
- **Architecture**：场景结构
- **Tasks**：
  - 场景1：环境描写
  - 场景2：对话互动
  - 场景3：冲突爆发
- **Constraints**：
  - 不能违背的设定
  - 必须出现的伏笔
  - 人物能力上限

---

## 九、去AI味详细策略

### 9.1 问题分析

AI生成文本的常见"AI味"特征：
- 句式过于工整，排比过多
- 情感表达模式化（"他感到一阵..."）
- 环境描写公式化（"夕阳西下，晚霞满天"）
- 对话过于完整，没有打断和口语
- 每段结尾喜欢总结
- 逻辑过于严密，缺乏意外和跳跃
- 用词过于"正确"，缺乏个性

### 9.2 去AI味技术方案

**第一层：Prompt级约束**
```
写作风格要求：
1. 避免使用"首先...其次...最后...""一方面...另一方面..."等结构化表达
2. 对话允许：打断、重复、口吃、沉默、答非所问
3. 环境描写必须包含至少2种感官（视觉+听觉/嗅觉/触觉）
4. 人物内心活动允许矛盾、冲动、非理性，不要过度解释
5. 禁止使用"显然""无疑""必然""众所周知"等确定性词汇
6. 允许使用短句、断句，长短句交替
7. 场景切换允许跳跃，不要生硬过渡
8. 适当留白，不要解释一切
9. 允许不完整的句子和语法瑕疵（符合人物身份）
10. 情感表达要具体，不要抽象（如不说"他很伤心"，而写"他攥紧了拳头，指甲陷进肉里"）
```

**第二层：文风参考学习**
- 用户提供参考小说 → CLI分析生成文风总结
- 文风总结包含：
  - 句式特点（长短句比例、常用句式）
  - 对话风格（正式/口语、简洁/啰嗦）
  - 描写特点（感官偏好、细节密度）
  - 节奏特点（快慢交替、张弛有度）
  - 用词偏好（文言/白话、抽象/具体）

**第三层：后处理修正**
- 生成后自动扫描并替换AI味特征
- 检查清单：
  - [ ] 是否有排比句超过3个
  - [ ] 是否有段落以总结句结尾
  - [ ] 对话是否过于"完整"
  - [ ] 是否有"感到一阵""心中一凛"等模式化表达
  - [ ] 环境描写是否有感官细节

### 9.3 上下文连续性保障

**动态上下文窗口计算**：
```
上下文窗口 = min(5章, 最近10000字对应的章节数)

特殊情况：
- 如果前5章总字数 > 15000字 → 减少为前3章
- 如果前5章总字数 < 5000字 → 增加为前7章
- 如果章节之间有"时间跳跃"标记 → 重置上下文
- 如果换地图 → 增加地图适应期描述
```

**上下文报告格式**：
```markdown
# 第X章写作上下文报告

## 本章蓝图
[章节蓝图摘要]

## 前文摘要（前N章）
### 第X-1章
[200字摘要]
### 第X-2章
[200字摘要]
...

## 活跃人物状态
- 秦墨：当前在XX地图，修为XX，情绪状态XX
- 林清雪：与秦墨关系XX，当前位置XX
...

## 待回收伏笔
- [重要] 秦墨获得的神秘玉佩（第3章埋下）→ 建议本章或近期回收
- [次要] 客栈老板的异常眼神（第8章埋下）
...

## 当前地图
- 地图名：XX
- 势力分布：...
- 当前规则限制：...

## RAG召回设定（自动注入）
- [物品] 黑色匕首：上古魔神遗物，可吞噬精血进化（第3章获得）
- [人物] 林清雪：当前状态"跟随主角"，修为筑基期
- [地图] 青云宗：外门弟子区域，禁止私斗

## 文风提示
- 参考风格：XX作家
- 句式特点：...
- 当前情绪基调：...
```

---

## 十、风险控制与边界情况

### 10.1 大模型输出限制

| 限制 | 解决方案 |
|------|----------|
| 单次输出token限制 | 分段生成，每次只生成一个段落 |
| 上下文长度限制 | 动态调整上下文窗口 + 摘要机制 |
| 生成质量波动 | 复核流程+用户确认 |
| 创意枯竭 | 提供多种生成策略（保守/激进/创新） |
| 上下文断裂 | 强制读取前N章摘要 + 关键事件提醒 |

### 10.2 数据一致性风险

| 风险 | 解决方案 |
|------|----------|
| Markdown与SQLite不同步 | 双向同步机制+校验 |
| 用户手动修改Markdown | 监听文件变更，自动同步 |
| 多skill同时操作 | 文件锁或事务机制 |
| AI跳过数据库查询 | CLI强制接口 + 上下文报告机制 |

### 10.3 创作偏差风险

| 风险 | 解决方案 |
|------|----------|
| AI偏离大纲 | 蓝图约束+复核检查 |
| 战力崩坏 | 战力体系表+自动校验 |
| 人物OOC | 人物设定表+行为检查 |
| 伏笔丢失 | 伏笔追踪表+回收提醒 |
| AI味过重 | 三层去AI味策略（Prompt+文风+后处理） |
| 上下文断裂 | 动态上下文窗口+强制读取机制 |

### 10.4 数据不一致风险

| 风险 | 解决方案 |
|------|----------|
| 章节与蓝图不符 | `novel audit chapter` 审查 |
| 人物状态DB与文档不一致 | `novel sync check` 检查差异 |
| 用户手动修改后DB未更新 | `novel sync md-to-db` 同步 |
| DB更新后文档未更新 | `novel sync db-to-md` 同步 |
| 伏笔状态不同步 | 审查时自动检查并修复 |

---

## 十一、后续扩展规划

### 11.1 第一阶段（MVP）
- [ ] 项目初始化（含模版数据库copy）
- [ ] 基础配置生成
- [ ] 全书大纲生成
- [ ] 阶段规划生成
- [ ] 章节蓝图生成
- [ ] 单章写作（含复核+去AI味）
- [ ] 人物管理（基础）
- [ ] 上下文读取机制（CLI强制接口）
- [ ] RAG向量检索（sqlite-vec + 嵌入API）

### 11.2 第二阶段
- [ ] 批量写作
- [ ] 高级人物管理（关系网、生命周期）
- [ ] 地图管理
- [ ] 伏笔追踪
- [ ] 版本历史
- [ ] 文风分析（参考小说学习）

### 11.3 第三阶段
- [ ] GUI界面
- [ ] 协作功能
- [ ] 导出多种格式
- [ ] 创作数据分析

---

## 十二、总结

本skill的核心设计原则：

1. **分层规划**：大纲→阶段→蓝图→正文，层层细化
2. **人机协作**：AI生成+用户确认，绝不擅自覆盖
3. **数据驱动**：SQLite管理结构化数据，Markdown存储内容
4. **质量控制**：复核流程确保输出质量
5. **上下文保障**：强制读取机制+动态窗口+RAG召回，避免上下文断裂
6. **去AI味**：三层策略（Prompt约束+文风学习+后处理修正）
7. **CLI约束**：强制接口确保AI必须读取数据库和上下文
8. **RAG增强**：sqlite-vec向量检索，自动召回相关设定
9. **扩展性**：模块化设计，便于后续扩展GUI等功能
