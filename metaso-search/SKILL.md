---
name: metaso-search_v2
description: Search the web using Metaso AI Search API. Use for live information, documentation, or research topics.
metadata: { "openclaw": { "emoji": "🔍", "requires": { "bins": ["python"], "env": ["METASO_API_KEY"] }, "primaryEnv": "METASO_API_KEY" } }
---

# Metaso Search

通过 Metaso AI Search API 进行网络搜索。

## 特性

✅ **多种调用方式** - 支持快捷参数和 JSON 两种输入方式  
✅ **自动参数修正** - 智能识别并修正 API 参数名  
✅ **重试机制** - 失败自动重试，提高成功率  
✅ **多源 API Key** - 支持环境变量、.env 文件、用户主目录配置  
✅ **多种输出格式** - JSON/文本/摘要三种格式可选  
✅ **详细调试模式** - 支持 verbose 模式查看请求详情  

---

## 使用方法

### 方式一：快捷参数（推荐）

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

### 方式二：JSON 输入

```bash
# 基本 JSON 输入
python scripts/search.py '{"q":"OpenClaw AI"}'

# 带选项的 JSON 输入
python scripts/search.py '{
  "q": "人工智能最新进展",
  "size": 5,
  "includeSummary": true
}'

# PowerShell 中使用文件
python scripts/search.py (Get-Content request.json -Raw)
```

### 方式三：交互式配置

```bash
# 查看帮助
python scripts/search.py --help

# 查看版本信息
python scripts/search.py --version
```

---

## 请求参数

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

> **注意**：脚本会自动识别参数名的不同写法（如 `scope`/`search_type`，`size`/`count`）

---

## 输出格式

### JSON 格式（默认）

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

### 文本格式

```bash
python scripts/search.py -q "AI" --format text
```

输出示例：
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

### 摘要格式

```bash
python scripts/search.py -q "AI" --format summary
```

输出示例：
```
找到 105 条结果，显示前 10 条：

1. 2026 年人工智能最新发展动态
   2026 年政府工作报告进一步将"打造智能经济新形态"列为年度重点任务...

2. AI 技术前沿观察
   时间走到 2026 年，人工智能的发展速度依然没有丝毫放缓的迹象...
```

---

## API Key 配置

脚本会按以下顺序查找 API Key：

1. **环境变量** `METASO_API_KEY`
2. **当前目录** `.env` 文件
3. **用户主目录** `~/.metaso_env` 文件

### 配置方法

#### 方法一：环境变量（推荐）

**Windows PowerShell:**
```powershell
$env:METASO_API_KEY="mk-your_api_key_here"
python scripts/search.py -q "关键词"
```

**Windows CMD:**
```cmd
set METASO_API_KEY=mk-your_api_key_here
python scripts/search.py -q "关键词"
```

**Linux/Mac:**
```bash
export METASO_API_KEY="mk-your_api_key_here"
python scripts/search.py -q "关键词"
```

#### 方法二：.env 文件

在脚本同目录下创建 `.env` 文件：
```bash
METASO_API_KEY=mk-your_api_key_here
```

#### 方法三：用户主目录配置

创建 `~/.metaso_env` 文件：
```bash
METASO_API_KEY=mk-your_api_key_here
```

---

## 完整示例

### 示例 1：基本搜索

```bash
python scripts/search.py -q "2026 年人工智能发展趋势"
```

### 示例 2：搜索新闻并获取摘要

```bash
python scripts/search.py -q "AI 大模型" -t news -s 5 --include-summary
```

### 示例 3：详细调试模式

```bash
python scripts/search.py -q "深度学习框架" -v --format text
```

输出：
```
[INFO] 开始搜索：深度学习框架
[INFO] API Key: mk-68B9...10F4
[DEBUG] URL: https://metaso.cn/api/v1/search
[DEBUG] Request Body: {"q": "深度学习框架", "search_type": "webpage", "count": 10}
[DEBUG] Response Status: 200
[INFO] 搜索完成，返回 10 条结果
搜索完成：共 87 条结果，消耗 3 credits
...
```

### 示例 4：PowerShell 中使用（避免引号问题）

```powershell
# 方法 1：使用 -q 参数（推荐）
python scripts/search.py -q "人工智能"

# 方法 2：使用文件
@'
{"q":"人工智能","size":5}
'@ | python scripts/search.py (Get-Content .\request.json -Raw)

# 方法 3：使用环境变量
$env:METASO_API_KEY="mk-your_key"
python scripts/search.py -q "AI 技术" -s 5 --format summary
```

---

## 故障排查

### 问题 1：JSON 解析错误

**错误信息：**
```
JSON parse error: Expecting property name enclosed in double quotes
```

**解决方案：**
- 使用 `-q` 快捷参数代替 JSON 输入
- 确保 JSON 使用双引号
- PowerShell 中使用文件或环境变量传递参数

### 问题 2：API Key 未找到

**错误信息：**
```
Error: METASO_API_KEY not set in environment
```

**解决方案：**
```bash
# 设置环境变量
$env:METASO_API_KEY="mk-your_api_key_here"

# 或创建 .env 文件
echo "METASO_API_KEY=mk-your_api_key_here" > .env
```

### 问题 3：参数错误

**错误信息：**
```
HTTP Error: HTTP 400: 请求参数错误
```

**解决方案：**
- 脚本会自动尝试修正参数名
- 检查 `size/count` 是否在 1-50 范围内
- 使用 `-v` 参数查看详细请求内容

### 问题 4：请求超时

**错误信息：**
```
错误：请求超时，请检查网络连接
```

**解决方案：**
- 检查网络连接
- 稍后重试（脚本会自动重试 2 次）
- 使用 `--format summary` 减少返回数据量

---

## API 参考

- **官方文档**: https://metaso.cn/search-api/playground
- **Endpoint**: `https://metaso.cn/api/v1/search`
- **Method**: POST
- **Auth**: Bearer token in `Authorization` header
- **Content-Type**: `application/json`

### cURL 示例

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

---

## 最佳实践

### ✅ 推荐

1. **使用 `-q` 快捷参数** - 避免 JSON 引号问题
2. **配置环境变量** - 避免每次传递 API Key
3. **使用 `-v` 调试** - 首次使用时查看详细请求
4. **合理设置 `size`** - 默认 10 条足够，减少 token 消耗
5. **使用 `--format text`** - 人类可读性更好

### ❌ 避免

1. ❌ 在命令行直接传递复杂 JSON（PowerShell 引号问题）
2. ❌ 在代码中硬编码 API Key
3. ❌ 请求过大 `size`（最大 50，消耗更多 credits）
4. ❌ 不使用重试机制（网络波动可能导致失败）

---

## 更新日志

### v2.0 (2026-05-23) - 优化版本

🎯 **新增功能**
- ✅ 支持 `-q` 快捷参数，无需 JSON 输入
- ✅ 自动参数修正（scope↔search_type, size↔count）
- ✅ 多源 API Key 加载（环境变量/.env/用户目录）
- ✅ 重试机制（最多重试 2 次）
- ✅ 三种输出格式（json/text/summary）
- ✅ 详细调试模式（-v）
- ✅ 参数验证和错误提示

🐛 **问题修复**
- ✅ 修复 PowerShell 中 JSON 引号解析问题
- ✅ 修复 API 参数名不兼容问题
- ✅ 修复错误信息不清晰问题

### v1.0 - 初始版本

---

## 当前状态

✅ 就绪可用 - 经过完整测试

---

## 支持

遇到问题？请检查：

1. ✅ API Key 是否正确配置
2. ✅ 网络连接是否正常
3. ✅ 参数格式是否正确
4. ✅ 使用 `-v` 查看详细错误信息

更多帮助：`python scripts/search.py --help`
