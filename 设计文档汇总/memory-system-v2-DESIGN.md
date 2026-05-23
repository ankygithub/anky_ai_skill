# memory-system-v2 设计文档

## 概述

`memory-system-v2` 是一个三层文件记忆系统，通过管理全局记忆、项目记忆和任务记忆三级作用域，实现跨会话的知识持久化。所有记忆以本地 Markdown 文件存储，无需任何外部依赖。

核心目标：让AI Agent能够"记住"过去的约定、Bug修复、用户偏好和项目决策，避免每次会话都从零开始。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       memory-system-v2                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  L0：全局记忆（跨所有项目）                                 │   │
│  │  位置：~/.trae-cn/memory/                                  │   │
│  │  内容：用户偏好、工具习惯、通用技巧                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  L1：项目记忆（同一项目内共享）                              │   │
│  │  位置：.trae/.memory/                                      │   │
│  │  内容：项目约定、架构决策、Bug修复、知识点                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  L2：任务记忆（仅当前任务）                                  │   │
│  │  位置：.trae/.memory/tasks/{任务名}/                        │   │
│  │  内容：任务上下文、进度、中间决策                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  搜索引擎：search.py                                       │   │
│  │  功能：跨三级作用域搜索、统计、列表查询                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 存储架构

```
.trae/.memory/                          # 项目级记忆（自动创建）
├── MEMORY.md                          # 索引文件（会话启动时自动加载前100行）
├── conventions.md                     # 项目约定
├── decisions.md                       # 架构决策
├── bugfixes.md                        # Bug 修复
├── knowledge.md                       # 项目知识点
└── tasks/                             # 任务级记忆
    └── {任务名}/
        ├── context.md                 # 任务上下文
        └── progress.md                # 任务进度

~/.trae-cn/memory/                     # 全局记忆（跨项目）
├── preferences.md                     # 用户偏好
├── tools.md                           # 工具使用习惯
└── tips.md                            # 通用技巧
```

## 核心模块

### 1. 三级作用域模块

#### L0：全局记忆

**判断条件：**
- 与项目无关的个人偏好（如"习惯用pnpm而非npm"）
- 通用编码习惯（如"代码注释使用中文"）
- 通用工具选择（如"Python用C:\Windows\py.exe执行"）
- 跨项目适用的最佳实践（如"提交前先跑lint"）

#### L1：项目记忆

**判断条件：**
- 项目命名规范（如"工具类用Utils后缀"）
- 项目架构决策（如"前端用React + TypeScript"）
- 项目特定Bug修复（如"ModuleA缓存问题根因"）
- 项目依赖和配置（如"使用Python 3.13 + fpdf2"）

#### L2：任务记忆

**判断条件：**
- 任务特定的上下文（如"地理试卷的题型格式要求"）
- 任务进度信息（如"已完成第一章分析"）
- 任务中间决策（如"决定用表格而非图表"）

#### 作用域提升规则

当L2知识被证明对其他任务也有价值时，自动提升到L1：

```
触发条件：
- 同一命令在不同任务中被反复成功使用 → 提升到 L1 knowledge.md
- 某Bug修复方案适用于项目多个模块 → 提升到 L1 bugfixes.md
- 某任务中确认的约定 → 提升到 L1 conventions.md

执行方式：
将内容从 tasks/{旧任务}/context.md 复制到 .trae/.memory/knowledge.md
```

### 2. 自动保存模块

在以下9种场景中，AI立即将关键信息写入对应记忆文件：

| 场景 | 触发信号 | 写入文件 | 作用域 |
|------|---------|---------|--------|
| 用户纠正 | "不对"、"不是"、"应该是"、"纠正" | conventions.md / preferences.md | L1/L0 |
| Bug修复 | 定位根因并完成修复后 | bugfixes.md | L1 |
| 项目约定 | 确定命名规范、架构选型等 | conventions.md | L1 |
| 用户偏好 | 表达对工具/库/风格/模式的偏好 | preferences.md | L0 |
| 架构决策 | 技术选型或设计决策 | decisions.md | L1 |
| 隐性知识 | 发现项目特殊配置、workaround | knowledge.md | L1 |
| 关键词触发 | "记一下"、"记住"、"存一下"等 | 根据内容判断 | L0/L1/L2 |
| 任务完成 | 完成重要功能/模块/重构后 | tasks/{任务}/progress.md | L2 |
| 环境配置 | 安装新依赖、配置环境变量 | knowledge.md | L1 |

**统一条目格式：**

```markdown
- **ID**: {类别缩写}-{序号}（如 conv-001, dec-002, bug-003）
  **内容**：具体的记忆内容描述
  **Priority**: high | medium | low
  **Status**: active | archived
  **Tags**: 标签1, 标签2
  **Created**: 2026-05-14
  **Updated**: 2026-05-14
  **Supersedes**: （可选，替代的旧条目ID）
```

**ID命名规则：**

| 文件 | 前缀 | 示例 |
|------|------|------|
| conventions.md | conv | conv-001 |
| decisions.md | dec | dec-001 |
| bugfixes.md | bug | bug-001 |
| knowledge.md | know | know-001 |
| preferences.md | pref | pref-001 |
| tasks/{任务}/ | task | task-001 |

### 3. 自动召回模块

#### 召回触发机制

| 触发场景 | 触发条件 | 搜索命令 | 搜索范围 |
|---------|---------|---------|---------|
| 会话开始 | 新会话启动时（自动执行） | search --query "Priority: high" --scope all --limit 20 | 全部 |
| 相似任务 | 当前操作的文件/模块与历史记忆匹配 | search --query "{当前任务关键词}" --scope all --limit 5 | 全部 |
| 提及过去 | "还记得"、"之前"、"以前"、"上次" | search --query "{提及内容}" --scope all | 全部 |
| 遇到错误 | 出现报错或异常 | search --query "{错误关键词}" --scope project --limit 5 | 项目级 |
| 不确定时 | AI不确定项目约定/用户偏好 | search --query "{不确定的内容}" --scope all --limit 5 | 全部 |
| 关键词触发 | "查一下"、"recall"、"搜索记忆" | search --query "{相关关键词}" --scope all --limit 10 | 全部 |
| 确认类触发 | "你记得吗"、"有没有记录" | search --query "{确认内容}" --scope all --limit 5 | 全部 |

#### Session Start 流程

```
Step 1: 检查目录是否存在
  C:\Windows\py.exe -c "from pathlib import Path; p=Path('.trae/.memory'); print('exists' if p.exists() else 'not_found')"

Step 2: 加载索引（前100行）
  C:\Windows\py.exe -c "from pathlib import Path; lines=Path('.trae/.memory/MEMORY.md').read_text(encoding='utf-8').splitlines()[:100]; print('\n'.join(lines))"

Step 3: 加载高优先级记忆摘要
  C:\Windows\py.exe search.py search --query "Priority: high" --scope all --limit 20

Step 4: 将加载内容注入当前上下文
```

**加载量控制：** 总共约250 Token，仅加载索引和高优先级摘要。

### 4. 搜索模块

搜索脚本路径：
```
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py
```

> ⚠️ Windows环境下必须使用 `C:\Windows\py.exe` 而非 `py`，且需指定脚本完整路径。

**支持的命令：**

```bash
# 搜索关键词（默认搜索所有范围）
search.py search --query "关键词" --scope all

# 仅搜索全局记忆
search.py search --query "pnpm" --scope global

# 仅搜索项目记忆
search.py search --query "约定" --scope project

# 仅搜索任务记忆
search.py search --query "地理" --scope task

# 查看记忆统计
search.py stats --scope all

# 列出所有记忆文件
search.py list --scope project
```

### 5. 记忆使用规则模块

#### 优先级决定使用方式

| 优先级 | 含义 | 使用方式 |
|--------|------|---------|
| **high** | 确认的事实 | 直接作为事实使用，无需确认 |
| **medium** | 有参考价值 | 作为参考，可交叉验证后使用 |
| **low** | 仅供参考 | 仅作为提示，需要用户确认 |

#### 冲突处理

```
1. 以 Updated 时间最新的为准
2. Status=archived 的记忆不采用
3. 如果 Supersedes 指向另一条，采用新的那条
```

### 6. 记忆维护模块

| 维护周期 | 操作 |
|---------|------|
| 每周 | 检查重复或过时的记忆，标记为 `archived` |
| 每月 | 对旧记忆做摘要合并，减少文件体积 |
| 任务完成后 | 清理L2任务记忆，有价值的提升到L1 |

**隐私保护：** 涉及敏感信息使用 `<!-- private -->` 标签，AI引用时不直接暴露内容。

**不进Git：** 记忆文件存储在 `.trae/.memory/`，建议在 `.gitignore` 中排除。

## 工作流程

### 自动保存流程

```
事件发生
  ↓
识别事件类型
  ↓
  ├── 用户纠正 → 写入 conventions.md / preferences.md
  ├── Bug修复 → 写入 bugfixes.md
  ├── 项目约定 → 写入 conventions.md
  ├── 用户偏好 → 写入 preferences.md
  ├── 架构决策 → 写入 decisions.md
  ├── 隐性知识 → 写入 knowledge.md
  ├── 关键词触发 → 根据内容判断作用域
  ├── 任务完成 → 写入 tasks/{任务}/progress.md
  └── 环境配置 → 写入 knowledge.md
  ↓
按统一格式写入（ID + 内容 + Priority + Status + Tags + 日期）
```

### 自动召回流程

```
会话启动 / 触发事件
  ↓
Step 1: 检查记忆目录是否存在
  ↓
Step 2: 加载 MEMORY.md 索引（前100行，~200 Token）
  ↓
Step 3: 搜索高优先级记忆摘要（~50 Token）
  ↓
Step 4: 注入当前上下文（总计~250 Token）
  ↓
根据上下文决定是否需要进一步搜索
  ↓
search.py search --query "{关键词}" --scope {范围} --limit {数量}
  ↓
找到记忆 → 按优先级使用 / 未找到 → 告知用户
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 存储格式 | Markdown (.md) | 记忆文件存储 |
| 搜索引擎 | Python search.py | 跨三级作用域搜索 |
| 索引机制 | MEMORY.md 前100行 | 会话启动快速加载 |
| 优先级系统 | high/medium/low | 决定使用方式 |
| 状态管理 | active/archived | 记忆生命周期管理 |
| 版本追溯 | Supersedes字段 | 替代关系记录 |
| 隐私保护 | `<!-- private -->` HTML注释 | 敏感信息保护 |
| 运行环境 | C:\Windows\py.exe (Python 3) | 搜索脚本执行 |

## 数据流

```
┌──────────────────────────────────────────────────────────────┐
│                    数据写入流                                  │
│                                                              │
│  用户纠正/Bug修复/约定/偏好/决策/知识/关键词                    │
│     ↓                                                        │
│  识别作用域（L0/L1/L2）                                       │
│     ↓                                                        │
│  生成记忆条目（ID + 内容 + Priority + Status + Tags + 日期）   │
│     ↓                                                        │
│  追加到对应 .md 文件                                          │
│     ↓                                                        │
│  ~/.trae-cn/memory/  或  .trae/.memory/  或  .trae/.memory/tasks/
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    数据读取流                                  │
│                                                              │
│  触发事件（会话启动/相似任务/提及过去/遇到错误/关键词）           │
│     ↓                                                        │
│  Step 1-2: 加载 MEMORY.md 索引（~200 Token）                  │
│     ↓                                                        │
│  Step 3: 搜索高优先级记忆（~50 Token）                         │
│     ↓                                                        │
│  Step 4: 注入上下文                                          │
│     ↓                                                        │
│  按需搜索 search.py --query "{关键词}"                        │
│     ↓                                                        │
│  找到 → 按优先级使用 / 未找到 → 告知用户                       │
└──────────────────────────────────────────────────────────────┘
```

## 关键设计决策

### 1. 三级作用域分层

**决策**：采用L0全局/L1项目/L2任务三级分层。

**理由：**
- 不同知识有不同的适用范围，分层避免信息污染
- 加载时可按作用域优先级加载，节约Token
- 作用域提升规则支持知识从窄范围扩展到宽范围

**权衡：** 增加了判断成本，但通过自动保存规则简化了决策。

### 2. 文件存储 vs 数据库

**决策**：使用纯Markdown文件存储，不使用数据库。

**理由：**
- 零依赖，无需安装额外服务
- Git友好（虽然建议不进Git，但结构清晰）
- 人类可读，方便手动编辑和审查
- 跨平台兼容

**权衡：** 大规模记忆时搜索效率不如数据库，但通过索引文件和搜索脚本优化。

### 3. Token节约策略

**决策**：会话启动时只加载索引前100行 + 高优先级摘要，总计~250 Token。

**理由：**
- 避免全量加载导致上下文溢出
- 高优先级记忆覆盖最常见场景
- 低优先级记忆按需搜索

**具体机制：**

| 机制 | 节约量 | 说明 |
|------|--------|------|
| 只加载索引（前100行） | ~200 Token | 避免全量加载 |
| 只加载Priority=high摘要 | ~50 Token | 低优先级按需搜索 |
| 按需搜索替代全量加载 | 视情况 | 遇到问题才搜索 |
| 渐进式披露 | 视情况 | 先看摘要，需要时展开 |

### 4. 冲突解决策略

**决策**：以Updated时间最新的为准，archived的不采用，Supersedes指向的新旧关系。

**理由：**
- 时间最新优先符合知识演进的常见模式
- archived状态提供手动排除机制
- Supersedes字段提供显式替代关系，避免歧义

### 5. 隐私保护机制

**决策**：使用 `<!-- private -->` HTML注释标签包裹敏感信息。

**理由：**
- Markdown中HTML注释不会渲染为可见内容
- AI能识别该标签，在引用时自动保护
- 简单有效，无需额外加密机制

## 使用说明

### 初始化

```bash
# 创建项目级记忆目录
mkdir -p .trae/.memory/tasks

# 创建索引文件
# （参考SKILL.md中的完整MEMORY.md模板）

# 创建全局记忆目录
mkdir -p ~/.trae-cn/memory
```

### 手动保存记忆

当用户说"记一下"、"记住"、"存一下"等关键词时：

```bash
# 手动保存到对应文件
# 根据内容判断作用域，写入对应文件
```

### 手动搜索记忆

```bash
# 搜索所有范围
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "关键词" --scope all

# 仅搜索项目记忆
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "约定" --scope project

# 查看统计
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py stats --scope all
```

### 与其他技能的关系

`memory-system-v2` 是基础设施类技能，为其他技能提供跨会话记忆能力：

- **写书技能**（advance_book_creator等）：记住项目约定、写作风格偏好
- **开发技能**：记住Bug修复方案、架构决策
- **所有技能**：记住用户偏好和工具使用习惯
