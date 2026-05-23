---
name: trae-mem0
description: >
  Trae 开发记忆系统，使用火山引擎 Mem0 实现持久化记忆。
  在以下场景自动触发保存：(1) 用户纠正时；(2) Bug 修复后；(3) 建立项目约定时；
  (4) 用户表达偏好时；(5) 架构决策时；(6) 发现隐性知识时；
  (7) 关键词触发如"记一下""记住""别忘了"；(8) 任务完成时；(9) 环境配置时。
  在以下场景自动触发召回：(1) 会话开始时；(2) 相似任务时；(3) 用户提及过去时；
  (4) 遇到错误时；(5) 不确定时；(6) 关键词触发如"查一下""recall"。
---

# trae-mem0 🧠

Trae 开发记忆系统。自动保存开发过程中的关键信息，并在需要时自动召回。

## 快速开始

### 首次配置

```bash
# 进入技能目录
cd ~/.trae-cn/skills/trae-mem0

# 安装依赖
pip install mem0ai==0.1.118

# 运行配置脚本
python scripts/setup.py
```

配置脚本会引导你输入 API 地址和 Key，生成 `config.json`。

### 验证连接

```bash
python scripts/mem0_client.py add --content "trae-mem0 已就绪" --scope global --type test
python scripts/mem0_client.py search --query "trae-mem0" --scope global
```

---

## 记忆作用域

记忆分为两级，通过 `user_id` 参数隔离：

| 作用域 | user_id 值 | 说明 |
|---|---|---|
| **全局** | `"global"` | 跨项目共享，如个人编码偏好、通用工具习惯 |
| **项目** | `"proj:{目录名}"` | 当前项目专属，如命名规范、架构决策、Bug 修复 |

### 存到 global 的条件（满足任一即可）

- 与具体项目无关的个人偏好（"我喜欢用 pnpm"、"我习惯 2 空格缩进"）
- 通用的编码习惯、工具选择
- 跨项目都适用的最佳实践
- 用户的个人工作流习惯

### 存到 proj:{项目名} 的条件（满足任一即可）

- 当前项目的命名规范、架构决策
- 项目特定的 Bug 修复方案
- 项目依赖和配置选择
- 项目业务逻辑相关的知识点

---

## 自动保存规则

在以下场景中，**立即**调用 `mem0_client.py add` 保存记忆：

### 1. 用户纠正
**触发信号**：用户说"不对"、"不是"、"应该是"、"Actually..."、"错了"、"纠正"
**操作**：`add --content "纠正: {用户指出的问题} → 正确做法: {正确方式}" --type correction`
**作用域**：global（通用知识）或 project（项目特定）

### 2. Bug 修复
**触发信号**：定位根因并完成修复后
**操作**：`add --content "Bug: {现象} → 根因: {原因} → 方案: {解决方案}" --type bugfix --files "{涉及文件}"`
**作用域**：project

### 3. 项目约定
**触发信号**：确定了命名规范、架构选型、依赖版本、代码风格
**操作**：`add --content "约定: {内容} — 适用范围: {范围}" --type convention`
**作用域**：project

### 4. 用户偏好
**触发信号**：用户表达了对工具/库/风格/模式的偏好
**操作**：`add --content "偏好: {偏好内容}" --type preference`
**作用域**：global

### 5. 架构决策
**触发信号**：做了技术选型或设计决策（含理由和备选方案）
**操作**：`add --content "决策: {决策内容} | 理由: {理由} | 备选: {备选}" --type decision`
**作用域**：project

### 6. 隐性知识
**触发信号**：发现项目特殊配置、workaround、踩坑经验、非显而易见的细节
**操作**：`add --content "知识点: {内容} — 涉及: {相关文件}" --type knowledge`
**作用域**：project

### 7. 关键词触发
**触发信号**：用户说了以下词语 → 立即保存上下文：
- 记一下、记住、存储、存一下、别忘了
- 以后注意、牢记、记录下来
- mark、remember、save this、keep this
**操作**：`add --content "{对应内容}" --type knowledge --tags "explicit"`

### 8. 任务完成
**触发信号**：完成一个重要的功能/模块/重构后
**操作**：`add --content "任务完成: {功能摘要} | 关键文件: {文件} | 注意事项: {注意点}" --type task --files "{文件}"`
**作用域**：project

### 9. 环境配置
**触发信号**：安装了新依赖、配置了环境变量、设置了工具链
**操作**：`add --content "环境配置: {配置内容} — 目的: {目的}" --type knowledge --tags "env"`
**作用域**：project

---

## 自动召回规则

在以下场景中，调用 `mem0_client.py search` 召回记忆：

### 1. 会话开始
**时机**：每次新对话启动时
**操作**：`search --query "{项目名} {主要技术栈}" --scope all --limit 10`
**目的**：将当前项目的相关记忆注入上下文，让 AI 快速了解项目背景

### 2. 相似任务
**时机**：当前操作与过去某个任务相似（同文件、同模块、同类操作）
**操作**：`search --query "{当前任务关键词}" --scope all --limit 5`
**目的**：参考历史经验和决策，避免重复犯错

### 3. 用户提及过去
**触发信号**：用户说"还记得"、"之前"、"以前"、"上次"、"曾经"、"原来"
**操作**：`search --query "{用户提及的内容}" --scope all --limit 5`
**目的**：快速回忆相关记忆

### 4. 遇到错误
**时机**：出现报错或异常时
**操作**：`search --query "{错误信息关键词}" --scope project --limit 5`
**目的**：查找历史相似错误及解决方案，快速修复

### 5. 不确定时
**时机**：AI 不确定项目约定、用户偏好、配置信息时
**操作**：`search --query "{不确定的内容}" --scope all --limit 5`
**目的**：先查记忆再问用户，避免重复提问

### 6. 关键词触发
**触发信号**：用户说"查一下"、"看看之前"、"有什么记忆"、"recall"、"memory"、"搜索记忆"
**操作**：`search --query "{相关关键词}" --scope all --limit 10`
**目的**：展示相关记忆给用户

---

## 脚本使用指南

所有命令输出 JSON 格式，便于解析。

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

### 输出格式

```json
// 成功
{"status": "ok", "results": [...], "total": 3}

// 失败
{"status": "error", "message": "错误描述"}
```

---

## 数据格式

每条记忆包含以下 metadata：

```json
{
  "type": "correction | bugfix | convention | preference | decision | knowledge | task",
  "timestamp": "2026-05-14T10:30:00+00:00",
  "tags": ["包管理器", "nodejs"],
  "related_files": ["src/main.ts", "package.json"]
}
```

---

## 注意事项

1. **及时保存**：触发条件满足时立即保存，不等不攒
2. **先查后问**：不确定时优先查记忆，减少重复提问
3. **作用域判断**：拿不准存哪时，默认存 project 级
4. **不要存敏感信息**：密码、密钥、Token 等不要存入记忆
5. **与内置 Memory 不冲突**：本技能与 Trae 内置记忆可共存