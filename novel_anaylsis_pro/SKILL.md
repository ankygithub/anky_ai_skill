---
name: novel-analysis
description: 
  网文作者风格解析技能。读取指定文件夹下同一作者的txt作品合集，
  通过分层抽样+统计+LLM深读，生成结构化的风格指纹报告。
  输出三份产物：完整分析报告(Markdown)、AI风格速查卡(压缩版system prompt)、
  场景模板库与写作检查清单。支持十层技术分析框架+六维文学感知分析，
  双视角融合（技术规则+文学质感），避免AI生成内容的机械感。
  触发场景：用户要求"分析某作者写作风格""提取小说作家风格指纹"
  "生成风格仿写指南""分析网文作者特色"时使用此技能。
---

# 网文作者风格解析技能 (novel-analysis)

## 快速开始

```bash
# 基础用法：分析某个作者的txt作品集
python scripts/analyze.py --input-dir "D:/path/to/author_books" --output-dir "./output"

# 完整用法（含文学感知维度）
python scripts/analyze.py --input-dir "D:/path/to/author_books" --model gpt-4o --intensity high

# 仅统计层分析（不调用LLM，快速预览）
python scripts/analyze.py --input-dir "D:/path/to/author_books" --stat-only
```

## 核心架构

五阶段流水线：

```
文本预处理 → 统计层(代码) → LLM深读(采样) → 交叉验证 → 报告生成
   Task2       Task4          Task5         Task6        Task7
```

### 阶段说明

| 阶段 | 模块 | 说明 | Token成本 |
|------|------|------|-----------|
| 1. 文本预处理 | `scripts/text_preprocessor.py` | 编码检测、清洗广告、切分章节 | 0 |
| 2. 统计层 | `scripts/stat_analyzer.py` | 句长/词频/对话比/标点（纯代码） | 0 |
| 3. 分层抽样 | `scripts/sampler.py` | 四类切片：开篇/高潮/日常/收尾 | 0 |
| 4. LLM深读 | `scripts/llm_analyzer.py` | 十层分析 + 六维文学感知 | 高 |
| 5. 交叉验证 | `scripts/cross_validator.py` | 多书对比，标注稳定度(H/M/L) | 0 |
| 6. 报告生成 | `scripts/report_generator.py` | 三份产物 + JSON | 0 |

## 分析维度总览

### 十层技术框架

详见 [references/analysis-framework.md](references/analysis-framework.md)

| 层级 | 名称 | 核心内容 | 优先级 |
|------|------|---------|--------|
| L1 | 作品工程层 | 章节结构、长度、钩子、标题风格 | 必做 |
| L2 | 情节结构层 | 爽点模式、冲突设计、反转机制、伏笔回收 | 必做 |
| L3 | 主角伦理与行动哲学层 | 九维坐标、决策模式、底线系统、情感温度 | 必做 |
| L4 | 人物关系与群像层 | 配角原型、反派塑造、感情线 | 应做 |
| L5 | 叙事视角与信息控制层 | POV、信息差、旁白风格 | 应做 |
| L6 | 语言风格层 | 句长、词汇、句式、语言的声音画像 | 必做 |
| L7 | 修辞文化层 | 典故、诗词、自创诗、命名系统 | 选做 |
| L8 | 场景类型层 | 战斗/日常/对话/抒情/打脸配方 | 应做 |
| L9 | 主题母题与价值观层 | 高频主题、作者信念体系 | 选做 |
| L10 | 读者体验层 | 爽点分布、情绪波形图 | 应做 |

### 六维文学感知

详见 [references/literary-dimensions.md](references/literary-dimensions.md)

| 维度 | 来源 | 核心价值 |
|------|------|---------|
| 情绪波形图 | DeepSeek | 压抑释放的形状、质感、余韵 |
| 氛围配方集 | DS+Sonnet | 镜头调度、画面色调、声音设计 |
| 人味指数 | DeepSeek | 烟火气、关系温度、脆弱时刻 |
| 悲悼美学 | Sonnet | 死亡重量、悲剧质地、情感残留 |
| 节奏呼吸感 | DS+Sonnet | 微节奏（段落间）、宏节奏（时间流速） |
| 作者签名 | 三份共识 | 克制爆发、空间修辞、自创诗词基因 |

### 双视角输出规范

每个特征必须同时产出**技术侧**和**文学侧**：

- **技术侧**：可量化指标 + 操作规则（给AI的"操作手册"）
- **文学侧**：氛围画像 + 情绪纹理 + 美学定位（给AI的"审美指南"）

最终合并为**融合版写作指令**。

## 分层抽样策略

详见 [references/sampling-strategy.md](references/sampling-strategy.md)

四类采样：

| 类型 | 取法 | 分析重点 |
|------|------|---------|
| 开篇 | 固定前5章 | 设定铺设、主角人设、叙事基调 |
| 高潮 | 算法识别top5 | 多指标打分（情绪词+标题+段落长度+字数突变） |
| 日常 | 反选逻辑top5 | 低情绪词密度+高生活词密度+正常段落长度 |
| 收尾 | 固定最后3章 | 结局处理、收束节奏、余味 |

每本书采样约15-20章（从百万字压缩到~5万字），跨书按百分比位置对齐。

## 配置与环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NOVEL_INPUT_DIR` | 输入文件夹路径（含txt作品集） | 必填 |
| `NOVEL_OUTPUT_DIR` | 输出目录 | `./output` |
| `NOVEL_LLM_API_KEY` | LLM API密钥 | 必填（需LLM深读时） |
| `NOVEL_LLM_BASE_URL` | LLM API地址 | OpenAI默认 |
| `NOVEL_LLM_MODEL` | 模型名称 | `gpt-4o` |

## CLI参数

运行 `python scripts/analyze.py --help` 查看完整参数列表。

关键参数：
- `--intensity low/medium/high`：分析强度（影响启用哪些层级）
- `--no-literary`：禁用文学感知维度（节省token）
- `--stat-only`：仅执行统计层分析（不调用LLM）
- `--json`：额外输出JSON结构化数据

## 输出产物

| 产物 | 文件名 | 用途 |
|------|--------|------|
| 完整报告 | `{作者}_风格分析报告_{时间}.md` | 人阅读 |
| AI速查卡 | `{作者}_AI风格速查卡_{时间}.md` | AI system prompt |
| 场景模板库 | `{作者}_场景模板库_{时间}.md` | 写作时调用 |
| 写作检查清单 | `{作者}_写作检查清单_{时间}.md` | 自检 |
| 结构化数据 | `{作者}_风格数据_{时间}.json` | Agent调用 |

## Prompt模板

所有LLM分析提示词存放在 `prompts/` 目录：

- `layer01_engineering.txt` ~ `layer10_experience.txt`：十层技术分析prompt
- `literary_*.txt`：六个文学维度prompt
- `style_card_template.txt`：速查卡模板

修改模板可定制分析深度和输出格式。

## 测试

```bash
C:\Python\Python313\python.exe -m pytest tests/ -v
```

测试覆盖：文本预处理、分层抽样、统计分析、报告生成、交叉验证。
