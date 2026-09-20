#!/usr/bin/env node
/**
 * lite - 项目初始化（Node 版，替代 init-project.sh，无 bash 依赖）
 *
 * 用法：
 *   node init-project.js <项目目录> <手册标题>
 *   例：node init-project.js "D:\Python指南" "Python完全指南"
 *
 * 前置依赖：
 *   - Node.js >= 16
 *   - PDF 产物需要：npm install -g playwright pdf-lib && npx playwright install chromium
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = process.argv[2];
const TITLE = process.argv[3];

if (!PROJECT_DIR || !TITLE) {
  console.error("用法: node init-project.js <项目目录> <手册标题>（标题含空格请加引号）");
  process.exit(1);
}

const TODAY = new Date().toISOString().slice(0, 10);
const SCRIPT_DIR = __dirname;                       // .../scripts
const SKILL_DIR = path.dirname(SCRIPT_DIR);         // 技能根
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');

if (fs.existsSync(PROJECT_DIR) && fs.readdirSync(PROJECT_DIR).length > 0) {
  console.error(`❌ 目录已存在且非空: ${PROJECT_DIR}`);
  process.exit(1);
}

console.log(`📦 lite 初始化项目: ${TITLE}`);
console.log(`   目录: ${PROJECT_DIR}\n`);

// ===== 目录结构 =====
for (const dir of ['fragments', 'output', 'versions', 'research', 'materials', 'assets', 'cover-images', 'scripts', 'lib']) {
  fs.mkdirSync(path.join(PROJECT_DIR, dir), { recursive: true });
}

// ===== 复制模板文件 =====
const copyFromTemplates = [
  'styles.css', 'build.js', 'build-reader.js', 'build-pdf.js', 'build-md.js',
  'build-all.js', 'convert-md.js', 'check-md.js', 'fix-md.js',
  'build-epub-pro.js', 'epub-styles.css'
];
for (const f of copyFromTemplates) {
  fs.copyFileSync(path.join(TEMPLATES_DIR, f), path.join(PROJECT_DIR, f));
}
// 共享围栏状态机（convert-md/check-md/build-all 的公共依赖，必须同目录结构）
fs.copyFileSync(path.join(TEMPLATES_DIR, 'lib', 'fence-scan.js'), path.join(PROJECT_DIR, 'lib', 'fence-scan.js'));
// 辅助脚本
fs.copyFileSync(path.join(__dirname, 'rebuild.js'), path.join(PROJECT_DIR, 'scripts', 'rebuild.js'));

// ===== 复制参考资料到 research/（不参与构建，供写作时阅读） =====
const refs = [
  ['references/components-quickref.md', 'components-quickref.md'],
  ['references/writing-style.md', 'writing-style.md'],
  ['references/source-grade-simple.md', 'source-grade-simple.md'],
  ['references/md-templates/00-cover.md', 'md-template-00-cover.md'],
  ['references/md-templates/99-backpage.md', 'md-template-99-backpage.md'],
  ['references/md-templates/part01-章节示例.md', 'md-template-part01-章节示例.md'],
  ['DESIGN.md', 'DESIGN.md']
];
for (const [src, dst] of refs) {
  const srcPath = path.join(SKILL_DIR, src);
  if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, path.join(PROJECT_DIR, 'research', dst));
}

// ===== 初始封面/尾页片段 =====
if (fs.existsSync(path.join(SKILL_DIR, 'references', 'md-templates', '00-cover.md'))) {
  fs.copyFileSync(path.join(SKILL_DIR, 'references', 'md-templates', '00-cover.md'), path.join(PROJECT_DIR, 'fragments', '00-cover.md'));
}
if (fs.existsSync(path.join(SKILL_DIR, 'references', 'md-templates', '99-backpage.md'))) {
  fs.copyFileSync(path.join(SKILL_DIR, 'references', 'md-templates', '99-backpage.md'), path.join(PROJECT_DIR, 'fragments', '99-backpage.md'));
}

// ===== version.json =====
fs.writeFileSync(path.join(PROJECT_DIR, 'version.json'), JSON.stringify({
  version: '1.0.0',
  build: 0,
  lastUpdate: TODAY,
  title: TITLE,
  subtitle: '',
  author: ''
}, null, 2), 'utf-8');

// ===== CHANGELOG.md =====
fs.writeFileSync(path.join(PROJECT_DIR, 'CHANGELOG.md'),
  `# ${TITLE} 更新日志\n\n> 格式：\`[版本号] YYYY-MM-DD — 摘要\`\n` +
  `> 版本规则：大改（章节增删）→ 主版本号；内容更新 → 次版本号；修正/勘误 → 修订号\n`, 'utf-8');

// ===== PROJECT.md =====
fs.writeFileSync(path.join(PROJECT_DIR, 'PROJECT.md'), `# ${TITLE} — 项目计划

> 状态：规划中（确认后标记为 ✅ 已确认，可交付写作）
> 本文件是全书唯一的中枢蓝图，规划阶段逐模块填写。
> 写作 Agent 开工前必读：书籍定位（防漂移）、读者画像（校准语气）、
> 本组章节的大纲行 + Mini-Plan（章节指令）。

---

## 一、书籍定位

### 一句话定位
这本书帮助 {目标读者} 从 {当前状态} 走向 {目标状态}。

### 本书是什么
- 是：
- 重点解决：
- 适合：

### 本书不是什么
- 不是：
- 不重点讨论：
- 不适合：

### 读者读完后的变化
读完后应该能够：
1.
2.
3.
4.

---

## 二、读者画像

| 维度 | 内容 |
|------|------|
| 目标读者 | |
| 年龄或阶段 | |
| 已有基础 | |
| 主要困惑 | |
| 阅读动机 | |
| 可能卡住的地方 | |
| 需要的帮助方式 | |
| 不适合的表达方式 | |

---

## 三、章节大纲

| Part | 文件 | 标题 | 核心内容（3-5句） | 读者收益 | 类型标签 | 前置依赖 | 需要采集 | 采集方向 | 信息来源 |
|------|------|------|-------------------|----------|---------|---------|---------|---------|---------|
| 1 | part01-xxx.md | 第一章 xxx | | | | 无 | ❌ | - | |

**类型标签**：[概念] [实操] [案例] [对比] [练习] [反思] [故事] [拓展]
**前置依赖**：本节依赖哪些先完成的章节（无则填"无"），并发写作时据此定顺序
**信息来源**：直接写调研/采集的结论摘要，不要只写文件路径（保证本文件自包含）

### 采集判断指南（标"需要采集"时按此判断）

| 类型标签 | 通常是否采集 | 原因 |
|---------|------------|------|
| [案例] | ✅ | 需真实事件/数据/时间线，内置知识易编造 |
| [实操] | ✅ | 需真实操作步骤/配置示例/踩坑经验 |
| [练习] | ✅ | 需真实题目或场景，避免虚构 |
| [对比] | ✅ | 需真实对比数据与评测结果 |
| [概念] | ❌ | 模型知识足够 |
| [反思] | ❌ | 观点性内容 |
| [故事] | 看情况 | 有真实原型则采集，纯虚构则否 |
| [拓展] | 看情况 | 涉及最新趋势则采集，否则否 |

**自检三问**：这一章只靠内置知识，案例会不会是编的？→ 会 → 标 ✅；这一章的数据/配置是最新版本的吗？→ 是 → 标 ✅；这一章核心是传递概念/观点吗？→ 是 → 标 ❌。

**采集方向写法**：写给写作 Agent 的搜索提示，越具体越好（如"搜 2025 年中考作文评分细则"，而非"搜作文资料"）。

---

## 四、单章 Mini-Plan（每章一个，写作 Agent 的直接指令）

### Chapter 1: {章节标题}
- 核心论点（≤30字）：
- 读者读完能做什么：
- 关键案例/数据（示例必须标注"示例"）：
- 必须包含：
- 禁止重复：
- 与前章衔接 / 为后章铺垫：
- 风险点：
- 采集提示（与大纲"采集方向"联动）：

---

## 五、知识递进路线

### 核心知识链路
1. → 2. → 3. → ……

### 可能卡点
| 卡点 | 原因 | 解决章节 | 解决方式 |
|------|------|---------|---------|

---

## 六、图表与组件规划

| 章节 | 建议图表/组件 | 格式 | 用途 |
|------|-------------|------|------|
| | 流程图/结构图/对比表/时间线/提示块/步骤 | SVG/表格/:::steps/:::compare | |

---

## 七、风险清单

| 风险 | 影响 | 应对方式 | 状态 |
|------|------|---------|------|
| 资料不足 | 章节空泛 | 补充采集或调整权重 | |
| 章节重叠 | 多 Agent 重复 | 大纲明确边界与承接 | |
| 案例虚构 | 读者信任受损 | 示例标注、素材优先 | |

---

## 八、进度追踪

| 步骤 | 状态 | 说明 |
|------|------|------|
| 规划 | ⏳ | |
| 素材采集 | ⬜ | |
| 写作 | ⬜ | |
| 构建 | ⬜ | |

---

## 九、用户确认区

请确认以下内容后进入写作阶段：

- [ ] 书籍定位是否准确
- [ ] 目标读者是否准确
- [ ] 章节大纲是否符合预期
- [ ] 是否需要增加或删除章节
- [ ] 是否确认进入写作阶段
`, 'utf-8');

// ===== 依赖检查 =====
console.log('🔍 检查依赖...');
let depsOk = true;
try {
  execSync('node -e "require(\'playwright\')"', { stdio: 'pipe' });
  console.log('   ✅ Node.js + Playwright 就绪');
} catch (e) {
  depsOk = false;
  console.log('   ⚠️  未检测到 Playwright（HTML/MD/阅读器产物不受影响）');
  console.log('      生成 PDF 前请安装: npm install -g playwright pdf-lib && npx playwright install chromium');
  console.log('      全局安装后运行构建需设置: $env:NODE_PATH = (npm root -g)');
}

console.log(`
✅ 项目已创建！

   下一步:
   1. 编辑 fragments/00-cover.md —— 把 frontmatter 的 title/subtitle/author 改为真实信息（封面只读这5个字段）
   2. 编辑 PROJECT.md 填写大纲（标注哪些章节需要素材采集）
   3. 在 fragments/ 下写 Markdown 片段（组件语法见 research/components-quickref.md）
   4. 构建: node build-all.js --products all

   快捷命令:
   node scripts/rebuild.js              # MD 就绪后重建全部产物
   node scripts/rebuild.js html,pdf     # 只构建 HTML + PDF
   node scripts/rebuild.js all --clean  # 强制清理后全量重建
`);
process.exit(depsOk ? 0 : 0);
