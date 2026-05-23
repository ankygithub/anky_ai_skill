# metaso-search 设计文档

## 概述

`metaso-search` 是一个基于 Metaso AI Search API 的网络搜索技能，提供快捷参数和JSON两种调用方式，支持自动参数修正、失败重试、多源API Key加载、多种输出格式和详细调试模式。

核心定位：为AI Agent提供实时网络搜索能力，适用于信息检索、文档查询、技术调研等需要联网获取最新数据的场景。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       metaso-search                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  输入层                                                    │   │
│  │  • 快捷参数（-q/-s/-t/--format/-v）                        │   │
│  │  • JSON输入                                               │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  参数处理层                                                │   │
│  │  • 参数解析与验证                                          │   │
│  │  • 自动参数修正（scope↔search_type, size↔count）           │   │
│  │  • PowerShell引号问题处理                                   │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Key管理                                              │   │
│  │  • 环境变量 METASO_API_KEY                                │   │
│  │  • 当前目录 .env 文件                                     │   │
│  │  • 用户主目录 ~/.metaso_env                               │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTTP请求层                                                │   │
│  │  • POST https://metaso.cn/api/v1/search                   │   │
│  │  • Bearer Token 认证                                      │   │
│  │  • 失败自动重试（最多2次）                                  │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  输出层                                                    │   │
│  │  • JSON格式（默认）                                        │   │
│  │  • 文本格式（--format text）                               │   │
│  │  • 摘要格式（--format summary）                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 输入解析模块

支持三种输入方式：

**方式一：快捷参数（推荐）**

```bash
# 基本搜索
python scripts/search.py -q "人工智能最新发展"

# 指定结果数量
python scripts/search.py -q "AI 技术" -s 5

# 指定搜索类型（webpage/news/paper）
python scripts/search.py -q "机器学习" -t news

# 包含 AI 摘要
python scripts/search.py -q "深度学习" --include-summary

# 文本格式输出
python scripts/search.py -q "神经网络" --format text

# 详细调试模式
python scripts/search.py -q "AI" -v
```

**方式二：JSON输入**

```bash
# 基本 JSON 输入
python scripts/search.py '{"q":"OpenClaw AI"}'

# 带选项的 JSON 输入
python scripts/search.py '{"q":"人工智能最新进展","size":5,"includeSummary":true}'
```

**方式三：交互式配置**

```bash
python scripts/search.py --help    # 查看帮助
python scripts/search.py --version # 查看版本信息
```

### 2. 参数处理模块

**请求参数规范：**

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| q | str | ✅ 是 | - | 搜索关键词 |
| size/count | int | ❌ 否 | 20 | 返回结果数量 (1-50) |
| scope/search_type | str | ❌ 否 | webpage | 搜索类型：webpage, news, paper 等 |
| page | int | ❌ 否 | 1 | 页码 |
| includeSummary | bool | ❌ 否 | false | 包含 AI 生成的摘要 |
| conciseSnippet | bool | ❌ 否 | false | 返回简洁摘要 |
| includeRawContent | bool | ❌ 否 | false | 获取原始内容 |
| searchFile | bool | ❌ 否 | false | 是否搜索文件 |

**自动参数修正机制：**

脚本会自动识别参数名的不同写法并修正：
- `scope` ↔ `search_type`
- `size` ↔ `count`

这解决了不同用户习惯导致的参数不兼容问题。

### 3. API Key 管理模块

**查找顺序：**

```
1. 环境变量 METASO_API_KEY（推荐）
     ↓ 未找到
2. 当前目录 .env 文件
     ↓ 未找到
3. 用户主目录 ~/.metaso_env 文件
     ↓ 未找到
4. 报错：METASO_API_KEY not set
```

**配置方法：**

```bash
# Windows PowerShell
$env:METASO_API_KEY="mk-your_api_key_here"
python scripts/search.py -q "关键词"

# 或创建 .env 文件（在脚本同目录）
# METASO_API_KEY=mk-your_api_key_here

# 或创建 ~/.metaso_env 文件
# METASO_API_KEY=mk-your_api_key_here
```

### 4. HTTP请求模块

**API规范：**

```
Endpoint:  https://metaso.cn/api/v1/search
Method:    POST
Auth:      Bearer token in Authorization header
Content:   application/json
```

**请求体示例：**

```json
{
  "q": "搜索关键词",
  "search_type": "webpage",
  "count": 10,
  "includeSummary": false
}
```

**cURL等效请求：**

```bash
curl --location 'https://metaso.cn/api/v1/search' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--data '{
  "q": "搜索关键词",
  "search_type": "webpage",
  "count": 10,
  "includeSummary": false
}'
```

**重试机制：**
- 网络请求失败自动重试最多2次
- 提高在网络波动等异常情况下的成功率

### 5. 输出格式化模块

**JSON格式（默认）：**

```json
{
  "credits": 3,
  "searchParameters": {
    "q": "搜索关键词",
    "search_type": "webpage",
    "count": 10
  },
  "webpages": [
    {
      "title": "标题",
      "link": "https://example.com",
      "snippet": "摘要内容",
      "score": "high",
      "date": "2026-03-22",
      "authors": ["作者 1", "作者 2"]
    }
  ],
  "total": 25
}
```

**文本格式（`--format text`）：**

```
搜索完成：共 105 条结果，消耗 3 credits

================================================================================

[1] 2026 年人工智能最新发展动态
    链接：https://example.com/article
    相关度：high
    日期：2026-05-22
    作者：张三，李四
    摘要：2026 年政府工作报告进一步将"打造智能经济新形态"列为年度重点任务...

================================================================================
```

**摘要格式（`--format summary`）：**

```
找到 105 条结果，显示前 10 条：

1. 2026 年人工智能最新发展动态
   2026 年政府工作报告进一步将"打造智能经济新形态"列为年度重点任务...

2. AI 技术前沿观察
   时间走到 2026 年，人工智能的发展速度依然没有丝毫放缓的迹象...
```

### 6. 调试模式模块

通过 `-v` 参数开启详细调试模式，输出：

```
[INFO] 开始搜索：深度学习框架
[INFO] API Key: mk-68B9...10F4
[DEBUG] URL: https://metaso.cn/api/v1/search
[DEBUG] Request Body: {"q": "深度学习框架", "search_type": "webpage", "count": 10}
[DEBUG] Response Status: 200
[INFO] 搜索完成，返回 10 条结果
```

## 工作流程

### 基本搜索流程

```
用户输入搜索关键词
     ↓
[输入解析] 快捷参数 / JSON / 帮助
     ↓
[参数处理] 解析参数 → 自动修正（scope↔search_type, size↔count）→ 验证
     ↓
[API Key] 按顺序查找（环境变量 → .env → ~/.metaso_env）
     ↓
[HTTP请求] POST https://metaso.cn/api/v1/search
     ↓ 失败
     ├── 自动重试（最多2次）
     └── 全部失败 → 报错退出
     ↓ 成功
[响应解析] 解析JSON响应
     ↓
[格式化输出] JSON / 文本 / 摘要
     ↓
返回搜索结果
```

### 故障排查流程

```
错误发生
  ↓
├── JSON解析错误 → 使用 -q 快捷参数 / 确保双引号 / 使用文件传参
├── API Key未找到 → 设置环境变量 / 创建 .env 文件
├── HTTP 400参数错误 → 自动修正参数名 / 检查size范围(1-50) / 使用-v调试
└── 请求超时 → 检查网络 / 稍后重试 / 使用 --format summary 减少数据量
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 运行时 | Python 3 | 脚本执行环境 |
| HTTP客户端 | Python requests / urllib | API请求发送 |
| 参数解析 | argparse | 命令行参数处理 |
| 环境变量 | os.environ | API Key读取 |
| 配置文件 | .env / ~/.metaso_env | 多源API Key加载 |
| 重试机制 | 内置重试逻辑 | 失败自动重试2次 |
| 输出格式 | JSON / 文本模板 | 三种输出格式 |
| 调试日志 | print / logging | 详细调试信息输出 |

## 数据流

```
用户输入: python scripts/search.py -q "关键词" -s 10 -t news
     ↓
参数解析:
  q = "关键词"
  size = 10
  search_type = "news"
  includeSummary = false
  format = "json"
  verbose = false
     ↓
参数修正:
  size → count（API参数名修正）
     ↓
API Key加载:
  检查环境变量 METASO_API_KEY → 找到: mk-68B9...10F4
     ↓
HTTP POST:
  URL: https://metaso.cn/api/v1/search
  Headers: Authorization: Bearer mk-68B9...10F4
  Body: {"q":"关键词","search_type":"news","count":10,"includeSummary":false}
     ↓
API响应:
  {"credits":3,"webpages":[...],"total":105}
     ↓
格式化输出:
  根据 --format 参数选择 JSON / 文本 / 摘要格式
     ↓
输出结果到控制台
```

## 关键设计决策

### 1. 快捷参数 vs JSON输入

**决策**：同时支持 `-q` 快捷参数和JSON两种输入方式，推荐快捷参数。

**理由：**
- JSON在PowerShell中存在引号解析问题（单双引号冲突）
- `-q` 参数避免JSON解析错误，更符合命令行习惯
- JSON保留灵活性，适合程序化调用

**权衡**：两种方式并行增加了解析复杂度，但大幅提升了用户体验。

### 2. 自动参数修正

**决策**：脚本内部自动识别并修正参数名（`scope`↔`search_type`、`size`↔`count`）。

**理由：**
- Metaso API使用的参数名与常见习惯可能不同
- 自动修正降低用户学习成本
- 减少HTTP 400错误

**实现**：参数解析后检测不存在的参数名，自动映射到API期望的参数名。

### 3. 多源API Key加载

**决策**：支持环境变量、.env文件、用户主目录配置三种方式，按优先级查找。

**理由：**
- 环境变量适合一次性使用或CI/CD场景
- .env文件适合项目级配置
- 用户主目录配置适合个人常用配置
- 多源加载避免每次都要传递API Key

### 4. 三种输出格式

**决策**：提供JSON（机器可读）、文本（人类可读）、摘要（精简）三种格式。

**理由：**
- JSON格式适合其他脚本/程序后续处理
- 文本格式适合人类阅读，信息完整
- 摘要格式适合快速浏览，减少Token消耗

### 5. 失败重试机制

**决策**：网络请求失败自动重试最多2次。

**理由：**
- 网络波动可能导致偶尔失败
- 自动重试提高成功率，减少用户操作
- 2次重试平衡了成功率和等待时间

## 使用说明

### 前置依赖

```bash
# Python 3（需要已安装）
# METASO_API_KEY 环境变量（或其他配置方式）
```

### 基本使用

```bash
# 最简用法（推荐）
python scripts/search.py -q "搜索关键词"

# 指定数量
python scripts/search.py -q "搜索关键词" -s 5

# 指定类型
python scripts/search.py -q "搜索关键词" -t news

# 包含AI摘要
python scripts/search.py -q "搜索关键词" --include-summary

# 文本格式
python scripts/search.py -q "搜索关键词" --format text

# 摘要格式
python scripts/search.py -q "搜索关键词" --format summary

# 调试模式
python scripts/search.py -q "搜索关键词" -v
```

### PowerShell 使用技巧

```powershell
# 方法1：使用 -q 参数（推荐，避免引号问题）
python scripts/search.py -q "人工智能"

# 方法2：使用环境变量传API Key
$env:METASO_API_KEY="mk-your_key"
python scripts/search.py -q "AI 技术" -s 5 --format summary

# 方法3：使用JSON文件（避免PowerShell引号问题）
@'
{"q":"人工智能","size":5}
'@ > request.json
python scripts/search.py (Get-Content .\request.json -Raw)
```

### 与其他技能的协作

`metaso-search` 是基础设施类技能，为其他技能提供实时搜索能力：

- **book-planner**：调研阶段执行网络搜索
- **advance_book_creator**：写作时验证具体数据/事实
- **survey-research-analyst**：生成调研报告时的信息来源
- **market-research**：市场调研时的数据获取

### 最佳实践

**✅ 推荐：**
1. 使用 `-q` 快捷参数，避免JSON引号问题
2. 配置环境变量，避免每次传递API Key
3. 首次使用 `-v` 调试，查看详细请求
4. 合理设置 `size`，默认10条足够，减少token消耗
5. 人类阅读使用 `--format text`

**❌ 避免：**
1. 在命令行直接传递复杂JSON（PowerShell引号问题）
2. 在代码中硬编码API Key
3. 请求过大 `size`（最大50，消耗更多credits）
4. 不使用重试机制（网络波动可能导致失败）

### 故障排查

| 问题 | 错误信息 | 解决方案 |
|------|---------|---------|
| JSON解析错误 | `Expecting property name enclosed in double quotes` | 使用 `-q` 快捷参数 / 确保双引号 / 使用文件传参 |
| API Key未找到 | `METASO_API_KEY not set in environment` | 设置环境变量 / 创建 `.env` 文件 |
| HTTP 400 | `请求参数错误` | 脚本会自动修正参数名 / 检查size范围 / 使用 `-v` 调试 |
| 请求超时 | `请求超时，请检查网络连接` | 检查网络 / 稍后重试 / 使用 `--format summary` |
