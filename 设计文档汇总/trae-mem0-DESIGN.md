# trae-mem0 技能设计文档

> Trae 开发记忆系统 —— 使用火山引擎 Mem0 实现持久化记忆，自动保存和召回开发过程中的关键信息。

---

## 一、概述

### 1.1 技能定位

`trae-mem0` 是一个面向 Trae 开发环境的持久化记忆系统。它使用火山引擎 Mem0 作为后端存储，实现开发过程中关键信息的自动保存和智能召回，让 AI 助手能够"记住"用户的偏好、项目的约定和历史的经验教训。

核心理念：**让 AI 从每次交互中学习，不再重复犯错或重复提问**。

### 1.2 核心价值

开发过程中，AI 助手面临的核心痛点：
- **记忆丢失**：会话结束后，上下文信息全部消失
- **重复犯错**：同样的错误在不同会话中反复出现
- **重复提问**：每次都要重新了解用户的偏好和项目约定
- **隐性知识流失**：踩坑经验、workaround 等关键知识无法沉淀

本技能通过自动触发机制，在关键时刻保存记忆，在需要时自动召回，构建持续进化的开发记忆系统。

### 1.3 触发场景

**自动保存触发**：
- 用户纠正时（"不对"、"不是"、"应该是"）
- Bug 修复后
- 建立项目约定时
- 用户表达偏好时
- 架构决策时
- 发现隐性知识时
- 关键词触发（"记一下"、"记住"、"别忘了"）
- 任务完成时
- 环境配置时

**自动召回触发**：
- 会话开始时
- 相似任务时
- 用户提及过去时
- 遇到错误时
- 不确定时
- 关键词触发（"查一下"、"recall"）

---

## 二、架构设计

### 2.1 整体架构

```
┌───────────────────────────────────────────────────────┐
│                  AI Agent（Trae）                       │
│  识别触发信号 → 调用 mem0_client.py → 处理记忆          │
├───────────────────────────────────────────────────────┤
│                  触发规则引擎                            │
│  9 种保存触发 + 6 种召回触发                             │
├───────────────────────────────────────────────────────┤
│                  记忆客户端层                            │
│  mem0_client.py ──▶ Mem0 API ──▶ 火山引擎记忆服务       │
├───────────────────────────────────────────────────────┤
│                  配置层                                  │
│  config.json（API 地址 + Key）                          │
└───────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
trae-mem0/
├── SKILL.md                              # 技能入口文档
├── config.json                           # 配置文件（API 地址 + Key）
├── scripts/
│   ├── mem0_client.py                    # Mem0 客户端 CLI
│   └── setup.py                          # 首次配置脚本
└── references/
    └── auto-trigger-scenarios.md         # 自动触发场景详细说明
```

### 2.3 记忆作用域架构

记忆分为两级作用域，通过 `user_id` 参数隔离：

```
记忆作用域
├── global（全局）
│   user_id = "global"
│   跨项目共享
│   适用于：个人编码偏好、通用工具习惯、跨项目最佳实践
│
└── proj:{项目名}（项目）
    user_id = "proj:my-project"
    当前项目专属
    适用于：命名规范、架构决策、Bug 修复、项目依赖
```

**作用域判断规则**：
- 与具体项目无关的个人偏好 → 存 `global`
- 当前项目的特定知识 → 存 `proj:{项目名}`
- 拿不准存哪时 → 默认存 `project` 级

---

## 三、核心模块

### 3.1 配置管理模块 (config.json)

**职责**：存储火山引擎 Mem0 的 API 连接信息。

**配置内容**：
```json
{
  "api_url": "https://api.mem0.ai/v1",
  "api_key": "your-api-key-here"
}
```

**首次配置流程**：
```bash
# 1. 进入技能目录
cd ~/.trae-cn/skills/trae-mem0

# 2. 安装依赖
pip install mem0ai==0.1.118

# 3. 运行配置脚本
python scripts/setup.py
```

配置脚本会引导用户输入 API 地址和 Key，生成 `config.json`。

### 3.2 记忆客户端 (mem0_client.py)

**职责**：封装所有 Mem0 API 操作，提供 CLI 接口。

**支持的操作**：

| 操作 | 命令 | 说明 |
|------|------|------|
| 添加记忆 | `add --content "..." --scope global --type preference` | 保存新记忆 |
| 搜索记忆 | `search --query "..." --scope all --limit 10` | 语义搜索记忆 |
| 获取全部 | `get-all --scope project` | 获取指定作用域所有记忆 |
| 更新记忆 | `update --memory-id "xxx" --content "..."` | 更新已有记忆 |
| 删除记忆 | `delete --memory-id "xxx"` | 删除指定记忆 |
| 查看统计 | `stats --scope all` | 查看记忆数量统计 |

**输出格式**：
```json
// 成功
{"status": "ok", "results": [...], "total": 3}

// 失败
{"status": "error", "message": "错误描述"}
```

### 3.3 自动保存规则引擎

**9 种自动保存场景**：

| 序号 | 场景 | 触发信号 | 记忆类型 | 作用域 |
|------|------|---------|---------|--------|
| 1 | 用户纠正 | "不对"、"不是"、"应该是"、"Actually..." | correction | global/project |
| 2 | Bug 修复 | 定位根因并完成修复后 | bugfix | project |
| 3 | 项目约定 | 确定命名规范、架构选型、依赖版本 | convention | project |
| 4 | 用户偏好 | 表达对工具/库/风格/模式的偏好 | preference | global |
| 5 | 架构决策 | 技术选型或设计决策（含理由和备选） | decision | project |
| 6 | 隐性知识 | 项目特殊配置、workaround、踩坑经验 | knowledge | project |
| 7 | 关键词触发 | "记一下"、"记住"、"存储"、"别忘了" | knowledge | global/project |
| 8 | 任务完成 | 完成一个重要的功能/模块/重构后 | task | project |
| 9 | 环境配置 | 安装新依赖、配置环境变量、设置工具链 | knowledge | project |

**保存格式示例**：
```bash
# 用户纠正
python scripts/mem0_client.py add \
  --content "纠正: Python 路径应使用 C:\Python\Python313\python.exe 而非 python" \
  --type correction \
  --scope global

# Bug 修复
python scripts/mem0_client.py add \
  --content "Bug: 路径找不到 → 根因: 使用了相对路径 → 方案: 使用 find_novel_db 自动识别" \
  --type bugfix \
  --scope project \
  --files "scripts/novel_cli.py"

# 用户偏好
python scripts/mem0_client.py add \
  --content "偏好: 使用 pnpm 而非 npm" \
  --type preference \
  --scope global \
  --tags "包管理器,nodejs"
```

### 3.4 自动召回规则引擎

**6 种自动召回场景**：

| 序号 | 场景 | 触发时机 | 搜索策略 |
|------|------|---------|---------|
| 1 | 会话开始 | 每次新对话启动时 | `search --query "{项目名} {技术栈}" --scope all --limit 10` |
| 2 | 相似任务 | 当前操作与历史任务相似 | `search --query "{关键词}" --scope all --limit 5` |
| 3 | 用户提及过去 | "还记得"、"之前"、"以前"、"上次" | `search --query "{内容}" --scope all --limit 5` |
| 4 | 遇到错误 | 出现报错或异常时 | `search --query "{错误关键词}" --scope project --limit 5` |
| 5 | 不确定时 | AI 不确定约定/偏好/配置 | `search --query "{不确定的内容}" --scope all --limit 5` |
| 6 | 关键词触发 | "查一下"、"看看之前"、"recall" | `search --query "{关键词}" --scope all --limit 10` |

**召回优先级**：
1. 项目级记忆优先（与当前任务直接相关）
2. 全局级记忆次之（通用偏好和习惯）
3. 按时间倒序（最新的记忆优先）
4. 按相关度排序（语义相似度高的优先）

---

## 四、工作流程

### 4.1 记忆保存工作流

```
检测到触发信号
       │
       ▼
  ┌─────────────────────┐
  │ 判断记忆作用域        │
  │ global or project?   │
  └──────────┬──────────┘
             │
     ┌───────┼───────┐
     │       │       │
     ▼       ▼       ▼
  global  proj:X  无法判断→默认project
     │       │
     ▼       ▼
  ┌─────────────────────┐
  │ 构造记忆内容          │
  │ type + content + tags│
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 调用 mem0_client.py  │
  │ add --content        │
  └──────────┬──────────┘
             ▼
     保存到火山引擎 Mem0
```

### 4.2 记忆召回工作流

```
检测到召回需求
       │
       ▼
  ┌─────────────────────┐
  │ 构造搜索查询          │
  │ query + scope + limit│
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 调用 mem0_client.py  │
  │ search --query       │
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 解析返回结果          │
  │ 按相关度排序           │
  └──────────┬──────────┘
             ▼
     注入到 AI 上下文
     │
     ├── 有记忆 → 直接使用
     └── 无记忆 → 询问用户
```

### 4.3 会话启动流程

```
新会话启动
       │
       ▼
  ┌─────────────────────┐
  │ 识别当前项目和          │
  │ 主要技术栈            │
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 搜索全局记忆           │
  │ search --query        │
  │ "{项目名} {技术栈}"   │
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ 将相关记忆注入          │
  │ AI 上下文              │
  └─────────────────────┘
```

---

## 五、技术栈

### 5.1 运行时环境

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Python | 3.10+ | 运行环境 |
| mem0ai | 0.1.118 | Mem0 客户端 SDK |
| 火山引擎 Mem0 | 在线服务 | 记忆存储与检索 |

### 5.2 核心依赖

```bash
pip install mem0ai==0.1.118
```

### 5.3 数据模型

每条记忆包含以下字段：

```json
{
  "content": "记忆内容文本",
  "metadata": {
    "type": "correction | bugfix | convention | preference | decision | knowledge | task",
    "timestamp": "2026-05-14T10:30:00+00:00",
    "tags": ["包管理器", "nodejs"],
    "related_files": ["src/main.ts", "package.json"]
  },
  "user_id": "global | proj:project-name",
  "id": "memory-uuid"
}
```

**记忆类型说明**：

| 类型 | 说明 | 示例 |
|------|------|------|
| `correction` | 用户纠正 | "纠正: Python 路径应使用..." |
| `bugfix` | Bug 修复方案 | "Bug: 路径找不到 → 根因: ..." |
| `convention` | 项目约定 | "约定: 使用 snake_case 命名" |
| `preference` | 用户偏好 | "偏好: 使用 pnpm 而非 npm" |
| `decision` | 架构决策 | "决策: 使用 SQLite 存储..." |
| `knowledge` | 隐性知识 | "知识点: 需要设置 SURVEY_SKILL_DIR..." |
| `task` | 任务完成 | "任务完成: 实现了 RAG 检索功能..." |

### 5.4 记忆标签系统

支持为记忆添加标签，便于分类和检索：

```bash
# 添加带标签的记忆
python scripts/mem0_client.py add \
  --content "用户偏好使用 pnpm 而非 npm" \
  --scope global \
  --type preference \
  --tags "包管理器,nodejs"
```

**常用标签分类**：
- 技术栈标签：`python`, `nodejs`, `react`, `sqlite`
- 工具标签：`包管理器`, `测试框架`, `代码格式`
- 项目标签：`{项目名}`, `{模块名}`

---

## 六、数据流

### 6.1 数据流图

```
触发事件（用户纠正/Bug修复/偏好表达等）
       │
       ▼
  ┌─────────────┐
  │ 触发信号识别  │───▶ 匹配 9 种保存场景之一
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 作用域判断    │───▶ global or proj:{项目名}?
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 内容构造      │───▶ {type} + {content} + {tags} + {files}
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ mem0_client  │───▶ add 操作 → 火山引擎 Mem0
  └──────┬──────┘
         ▼
     记忆持久化存储

────────────────────────────────

召回需求（会话开始/相似任务/错误等）
       │
       ▼
  ┌─────────────┐
  │ 查询构造      │───▶ {query} + {scope} + {limit}
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ mem0_client  │───▶ search 操作 → 火山引擎 Mem0
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ 结果排序      │───▶ 相关度 + 时间倒序
  └──────┬──────┘
         ▼
     注入 AI 上下文
```

---

## 七、关键设计决策

### 7.1 使用火山引擎 Mem0 作为后端

**决策**：使用火山引擎 Mem0 服务而非本地存储。

**原因**：
- Mem0 提供语义搜索能力，支持自然语言查询
- 云端存储，跨会话、跨设备可用
- 自动去重和更新机制
- 支持 metadata 过滤和标签系统
- 与 Trae 开发环境集成良好

### 7.2 两级作用域设计

**决策**：记忆分为 global 和 project 两级。

**原因**：
- 区分个人偏好（跨项目适用）和项目约定（仅当前项目适用）
- 避免项目特定知识污染全局记忆
- 搜索时可以指定作用域，提高召回精准度
- 项目记忆可以随项目迁移，全局记忆始终可用

### 7.3 自动触发而非手动保存

**决策**：9 种场景自动触发保存，6 种场景自动触发召回。

**原因**：
- 减少用户负担，不需要手动执行保存命令
- 及时保存，避免信息遗忘（不等不攒）
- 关键词触发机制覆盖用户主动要求记忆的场景
- 先查后问，不确定时优先查记忆再问用户

### 7.4 结构化记忆格式

**决策**：每条记忆包含 type、timestamp、tags、related_files 等 metadata。

**原因**：
- type 区分不同类型的记忆，便于分类管理
- timestamp 支持时间排序和过期检测
- tags 支持标签过滤和分类检索
- related_files 关联文件，便于定位问题上下文

### 7.5 与内置 Memory 共存

**决策**：本技能与 Trae 内置记忆系统不冲突，可共存。

**原因**：
- 内置 Memory 通常是会话级或短期记忆
- 本技能提供持久化、跨会话的长期记忆
- 两者互补，覆盖不同粒度的记忆需求

---

## 八、使用说明

### 8.1 首次配置

```bash
# 1. 进入技能目录
cd ~/.trae-cn/skills/trae-mem0

# 2. 安装依赖
pip install mem0ai==0.1.118

# 3. 运行配置脚本
python scripts/setup.py

# 4. 验证连接
python scripts/mem0_client.py add --content "trae-mem0 已就绪" --scope global --type test
python scripts/mem0_client.py search --query "trae-mem0" --scope global
```

### 8.2 手动操作命令

```bash
# 添加记忆
python scripts/mem0_client.py add \
  --content "用户偏好使用 pnpm 而非 npm" \
  --scope global \
  --type preference \
  --tags "包管理器,nodejs"

# 搜索记忆（自动查全局+项目）
python scripts/mem0_client.py search \
  --query "包管理器" \
  --scope all \
  --limit 10

# 获取所有记忆
python scripts/mem0_client.py get-all --scope project

# 更新记忆
python scripts/mem0_client.py update \
  --memory-id "xxx" \
  --content "更新后的内容"

# 删除记忆
python scripts/mem0_client.py delete --memory-id "xxx"

# 查看统计
python scripts/mem0_client.py stats --scope all
```

### 8.3 关键词触发

**保存关键词**（听到即保存）：
- 记一下、记住、存储、存一下、别忘了
- 以后注意、牢记、记录下来
- mark、remember、save this、keep this

**召回关键词**（听到即搜索）：
- 查一下、看看之前、有什么记忆
- recall、memory、搜索记忆
- 还记得、之前、以前、上次、曾经

### 8.4 注意事项

1. **及时保存**：触发条件满足时立即保存，不等不攒
2. **先查后问**：不确定时优先查记忆，减少重复提问
3. **作用域判断**：拿不准存哪时，默认存 project 级
4. **不要存敏感信息**：密码、密钥、Token 等不要存入记忆
5. **与内置 Memory 不冲突**：本技能与 Trae 内置记忆可共存

---

## 九、参考文档

- [自动触发场景详细说明](../trae-mem0/references/auto-trigger-scenarios.md)
