---
name: memory-system-v2
description: 
  三层文件记忆系统，管理全局/项目/任务三级记忆。
  (1) 会话开始时自动加载记忆索引和高优先级记忆；
  (2) 用户纠正、Bug 修复、建立约定时自动保存；
  (3) 关键词触发："记一下""记住""别忘了""查一下""recall"等；
  (4) 遇到错误时自动搜索相似 Bug 修复方案；
  (5) 不确定约定/偏好时先查记忆再提问；
  (6) 用户提及过去时自动搜索相关记忆。
---

# memory-system-v2 🧠

三层文件记忆系统。管理全局记忆、项目记忆、任务记忆，实现跨会话的知识持久化。

无需任何外部依赖，所有记忆存储在本地 `.md` 文件中。

---

## 快速开始

### 目录结构

```
.trae/.memory/                          # 项目级记忆（自动创建）
├── MEMORY.md                          # 索引文件
├── conventions.md                     # 项目约定
├── decisions.md                       # 架构决策
├── bugfixes.md                        # Bug 修复
├── knowledge.md                       # 项目知识点
└── tasks/                             # 任务级记忆
    └── {任务名}/
        ├── context.md
        └── progress.md

~/.trae-cn/memory/                     # 全局记忆（跨项目）
├── preferences.md                     # 用户偏好
├── tools.md                           # 工具使用习惯
└── tips.md                            # 通用技巧
```

### 首次初始化

```bash
# 创建项目级记忆目录
mkdir -p .trae/.memory/tasks

# 创建索引文件
cat > .trae/.memory/MEMORY.md << 'EOF'
# MEMORY.md — 记忆索引
> 本文件在会话启动时自动加载前 100 行

## 项目约定
见 [conventions.md](conventions.md)

## 架构决策
见 [decisions.md](decisions.md)

## Bug 修复记录
见 [bugfixes.md](bugfixes.md)

## 项目知识点
见 [knowledge.md](knowledge.md)

## 任务列表
见 [tasks/](tasks/)
EOF

# 创建全局记忆目录
mkdir -p ~/.trae-cn/memory
```

---

## 三级作用域

### L0：全局记忆

**位置**：`~/.trae-cn/memory/`
**共享范围**：跨所有项目
**存储内容**：与具体项目无关的个人偏好、通用工具习惯、通用工作流

| 判断条件 | 示例 |
|---|---|
| 与项目无关的个人偏好 | "习惯用 pnpm 而非 npm" |
| 通用编码习惯 | "代码注释使用中文" |
| 通用工具选择 | "Python 用 C:\\Windows\\py.exe 执行" |
| 跨项目适用的最佳实践 | "提交前先跑 lint" |

### L1：项目记忆

**位置**：`.trae/.memory/`
**共享范围**：同一项目下所有任务共享
**存储内容**：项目约定、架构决策、技术栈选择、Bug 修复方案

| 判断条件 | 示例 |
|---|---|
| 项目命名规范 | "工具类用 Utils 后缀" |
| 项目架构决策 | "前端用 React + TypeScript" |
| 项目特定 Bug 修复 | "ModuleA 缓存问题根因" |
| 项目依赖和配置 | "使用 Python 3.13 + fpdf2" |

### L2：任务记忆

**位置**：`.trae/.memory/tasks/{任务名}/`
**共享范围**：仅当前任务
**存储内容**：任务上下文、进度、中间产物、任务特定知识

| 判断条件 | 示例 |
|---|---|
| 任务特定的上下文 | "地理试卷的题型格式要求" |
| 任务进度信息 | "已完成第一章分析" |
| 任务中间决策 | "决定用表格而非图表" |

### 作用域提升规则

当某个 L2（任务级）知识被证明对其他任务也有价值时，AI 应将其提升到 L1：

```
触发条件：
- 同一命令在不同任务中被反复成功使用 → 提升到 L1 knowledge.md
- 某 Bug 修复方案适用于项目多个模块 → 提升到 L1 bugfixes.md
- 某任务中确认的约定 → 提升到 L1 conventions.md

执行方式：
cp .trae/.memory/tasks/{旧任务}/context.md .trae/.memory/knowledge.md
```

---

## 自动保存规则

在以下场景中，AI **立即**将关键信息写入对应记忆文件。

### 1. 用户纠正

**触发信号**：用户说"不对"、"不是"、"应该是"、"Actually..."、"错了"、"纠正"
**操作**：追加到 `conventions.md` 或 `preferences.md`
**格式**：
```markdown
- **内容**：纠正: {错误认知} → 正确做法: {正确方式}
  **Priority**: high | **Tags**: 纠正
  **Created**: {日期}
```

### 2. Bug 修复

**触发信号**：定位根因并完成修复后
**操作**：追加到 `bugfixes.md`
**格式**：
```markdown
- **内容**：Bug: {现象} → 根因: {原因} → 方案: {方案}
  **Priority**: medium | **Tags**: {涉及模块}
  **Created**: {日期}
```

### 3. 项目约定

**触发信号**：确定了命名规范、架构选型、依赖版本、代码风格
**操作**：追加到 `conventions.md`
**格式**：
```markdown
- **内容**：约定: {内容} — 适用范围: {范围}
  **Priority**: high | **Tags**: 约定
  **Created**: {日期}
```

### 4. 用户偏好

**触发信号**：用户表达了对工具/库/风格/模式的偏好
**操作**：追加到 `preferences.md`（全局）或 `conventions.md`（项目）
**格式**：
```markdown
- **内容**：偏好: {内容} — 上下文: {场景}
  **Priority**: high | **Tags**: 偏好
  **Created**: {日期}
```

### 5. 架构决策

**触发信号**：做了技术选型或设计决策（含理由和备选方案）
**操作**：追加到 `decisions.md`
**格式**：
```markdown
- **内容**：决策: {内容} | 理由: {理由} | 备选: {备选}
  **Priority**: high | **Tags**: 决策
  **Created**: {日期}
```

### 6. 隐性知识

**触发信号**：发现项目特殊配置、workaround、踩坑经验
**操作**：追加到 `knowledge.md`
**格式**：
```markdown
- **内容**：知识点: {内容} — 涉及: {相关文件}
  **Priority**: medium | **Tags**: 知识
  **Created**: {日期}
```

### 7. 关键词触发

**触发词**：记一下、记住、存储、存一下、别忘了、以后注意、牢记、记录下来、mark、remember、save this、keep this
**操作**：根据内容判断作用域，写入对应文件
**格式**：
```markdown
- **内容**：{用户指示要记住的内容}
  **Priority**: high | **Tags**: explicit
  **Created**: {日期}
```

### 8. 任务完成

**触发信号**：完成一个重要的功能/模块/重构后
**操作**：写入 `tasks/{任务名}/progress.md`
**格式**：
```markdown
- **内容**：任务完成: {摘要} | 关键文件: {文件} | 注意事项: {注意点}
  **Priority**: medium | **Tags**: 完成
  **Created**: {日期}
```

### 9. 环境配置

**触发信号**：安装了新依赖、配置了环境变量、设置了工具链
**操作**：追加到 `knowledge.md`
**格式**：
```markdown
- **内容**：环境配置: {内容} — 目的: {目的}
  **Priority**: high | **Tags**: env
  **Created**: {日期}
```

---

## 自动召回规则

### 1. 会话开始时（自动执行）

```markdown
## Session Start 流程
此流程在每次新对话开始时自动执行：

Step 1: 检查目录是否存在
  C:\Windows\py.exe -c "from pathlib import Path; p=Path('.trae/.memory'); print('exists' if p.exists() else 'not_found')"

Step 2: 加载索引
  C:\Windows\py.exe -c "from pathlib import Path; lines=Path('.trae/.memory/MEMORY.md').read_text(encoding='utf-8').splitlines()[:100]; print('\n'.join(lines))"

Step 3: 加载高优先级记忆摘要
  C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "Priority: high" --scope all --limit 20

Step 4: 将加载内容注入当前上下文
```

**加载量控制**：总共约 250 Token，仅加载索引和高优先级摘要。

### 2. 相似任务时

**触发条件**：当前操作的文件/模块与历史记忆匹配
**操作**：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{当前任务关键词}" --scope all --limit 5`

### 3. 用户提及过去时

**触发词**：还记得、之前、以前、上次、曾经、原来、早前、我们是不是
**操作**：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{提及内容}" --scope all`

### 4. 遇到错误时

**触发条件**：出现报错或异常
**操作**：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{错误关键词}" --scope project --limit 5`

### 5. 不确定时

**触发条件**：AI 不确定项目约定、用户偏好、配置信息
**操作**：先搜索记忆再提问：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{不确定内容}" --scope all --limit 5`

### 6. 关键词触发

**触发词**：查一下、看看之前、有什么记忆、recall、memory、搜索记忆、翻一下
**操作**：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{相关关键词}" --scope all --limit 10`

### 7. 确认类触发

**触发词**：你记得吗、你知道、我们有没有、有没有记录、之前说过吗
**操作**：`C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "{确认内容}" --scope all --limit 5`
**行为**：搜索记忆后回答，有记录则引用，无记录则如实告知

---

## 记忆使用规则

找到记忆后，AI 按以下规则使用：

### 优先级决定使用方式

| 优先级 | 含义 | 使用方式 |
|---|---|---|
| **high** | 确认的事实 | 直接作为事实使用，无需确认 |
| **medium** | 有参考价值 | 作为参考，可交叉验证后使用 |
| **low** | 仅供参考 | 仅作为提示，需要用户确认 |

### 冲突处理

```
1. 以 Updated 时间最新的为准
2. Status=archived 的记忆不采用
3. 如果 Supersedes 指向另一条，采用新的那条
```

---

## 记忆条目格式规范

所有记忆文件中的条目遵循统一格式：

```markdown
- **ID**: {类别缩写}-{序号}（如 conv-001, dec-002, bug-003, know-004, pref-005, task-006）
  **内容**：具体的记忆内容描述
  **Priority**: high | medium | low
  **Status**: active | archived
  **Tags**: 标签1, 标签2
  **Created**: 2026-05-14
  **Updated**: 2026-05-14
  **Supersedes**: （可选，替代的旧条目 ID，如 conv-001）
```

**ID 命名规则**：
| 文件 | 前缀 | 示例 |
|---|---|---|
| conventions.md | conv | conv-001 |
| decisions.md | dec | dec-001 |
| bugfixes.md | bug | bug-001 |
| knowledge.md | know | know-001 |
| preferences.md | pref | pref-001 |
| tasks/{任务}/ | task | task-001 |

---

## 搜索脚本使用

搜索脚本完整路径：

```
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py
```

> ⚠️ Windows 环境下必须使用 `C:\Windows\py.exe` 而非 `py`，且需指定脚本完整路径。

```bash
# 搜索关键词（默认搜索所有范围）
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "关键词" --scope all

# 仅搜索全局记忆
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "pnpm" --scope global

# 仅搜索项目记忆
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "约定" --scope project

# 仅搜索任务记忆
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py search --query "地理" --scope task

# 查看记忆统计
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py stats --scope all

# 列出所有记忆文件
C:\Windows\py.exe C:\Users\周望重\.trae-cn\skills\memory-system-v2\scripts\search.py list --scope project
```

---

## 记忆维护规则

### 定期维护

- **每周**：检查是否有重复或过时的记忆，标记为 `archived`
- **每月**：对旧记忆做摘要合并，减少文件体积
- **任务完成后**：清理 L2 任务记忆，有价值的提升到 L1

### 不进 Git

记忆文件存储在 `.trae/.memory/`，建议在 `.gitignore` 中排除：

```gitignore
.trae/.memory/
```

### 隐私保护

如果内容涉及敏感信息，使用 `<!-- private -->` 标签包裹：

```markdown
- **内容**：<!-- private -->API Key: xxx<!-- /private -->
  **Priority**: high | **Tags**: private
  **Created**: 2026-05-14
```

AI 在引用时：
- 对 `Tags: private` 的条目，不直接暴露内容，仅提示"存在相关记忆"
- 对 `<!-- private -->` 包裹的部分，绝不输出到对话中

---

## Token 节约策略

| 机制 | 节约量 | 说明 |
|---|---|---|
| 只加载索引（前 100 行） | ≈ 200 Token | 避免全量加载 |
| 只加载 Priority=high 摘要 | ≈ 50 Token | 低优先级按需搜索 |
| 按需搜索替代全量加载 | 视情况 | 遇到问题才搜索 |
| 渐进式披露 | 视情况 | 先看摘要，需要时展开 |