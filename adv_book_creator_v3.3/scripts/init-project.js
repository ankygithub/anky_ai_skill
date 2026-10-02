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
for (const dir of ['fragments', 'output', 'versions', 'research', 'materials', 'materials/review', 'assets', 'cover-images', 'scripts', 'lib']) {
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
// 封面/图标风格解析（build-epub-pro/build/build-reader 的公共依赖）
fs.copyFileSync(path.join(TEMPLATES_DIR, 'lib', 'cover-select.js'), path.join(PROJECT_DIR, 'lib', 'cover-select.js'));
// 脚注点击弹层（build/build-reader 的公共依赖，单一来源）
fs.copyFileSync(path.join(TEMPLATES_DIR, 'lib', 'footnote-pop.js'), path.join(PROJECT_DIR, 'lib', 'footnote-pop.js'));
// highlight.js 内嵌精简版（EPUB 代码高亮零安装）
const hljsLibSrc = path.join(TEMPLATES_DIR, 'lib', 'hljs');
const hljsLibDst = path.join(PROJECT_DIR, 'lib', 'hljs');
fs.mkdirSync(path.join(hljsLibDst, 'languages'), { recursive: true });
fs.copyFileSync(path.join(TEMPLATES_DIR, 'lib', 'hljs-bundle.js'), path.join(PROJECT_DIR, 'lib', 'hljs-bundle.js'));
fs.copyFileSync(path.join(hljsLibSrc, 'core.js'), path.join(hljsLibDst, 'core.js'));
for (const f of fs.readdirSync(path.join(hljsLibSrc, 'languages'))) {
  fs.copyFileSync(path.join(hljsLibSrc, 'languages', f), path.join(hljsLibDst, 'languages', f));
}
// 辅助脚本
fs.copyFileSync(path.join(__dirname, 'rebuild.js'), path.join(PROJECT_DIR, 'scripts', 'rebuild.js'));

// ===== 封面/图标风格库（EPUB 封面与 HTML/reader 图标共用，构建时按风格选取） =====
const ICON_SOURCE = path.join(SKILL_DIR, 'icon');
if (fs.existsSync(ICON_SOURCE)) {
  const iconLibDir = path.join(PROJECT_DIR, 'cover-images', 'library');
  fs.mkdirSync(iconLibDir, { recursive: true });
  let iconCount = 0;
  for (const f of fs.readdirSync(ICON_SOURCE)) {
    if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
      fs.copyFileSync(path.join(ICON_SOURCE, f), path.join(iconLibDir, f));
      iconCount++;
    }
  }
  console.log(`🖼️  封面风格库: 已复制 ${iconCount} 张到 cover-images/library/`);
}

// ===== 封面风格库完整性预检 =====
// 背景：技能被 Trae / WorkBuddy 等 Agent 安装复制时，非 ASCII 文件名会因编码错乱而损坏
//       （中文的 GBK 字节被按 CP437 解释成 "┐╞╝╝╒²╖╜╨╬.jpg" 这类乱码）。icon/ 下的风格图
//       若被复制成乱码名，构建时 cover-select.js 按注册名找不到 → 封面/图标静默回退"素雅"。
//       这里做一次显式校验：缺任何一张就大声告警（不静默），并给出可执行的修复指引。
const { STYLES } = require(path.join(TEMPLATES_DIR, 'lib', 'cover-select.js'));
const missingCovers = [];
for (const [style, cfg] of Object.entries(STYLES)) {
  for (const f of [cfg.portrait, cfg.square]) {
    if (!fs.existsSync(path.join(ICON_SOURCE, f))) missingCovers.push(`${style} → ${f}`);
  }
}
if (missingCovers.length > 0) {
  console.warn(`⚠️  封面风格库不完整：icon/ 下缺失 ${missingCovers.length} 个文件`);
  missingCovers.forEach(m => console.warn(`     - ${m}`));
  console.warn('    若磁盘上以乱码名存在（中文名被安装过程编码破坏），请用技能源码目录重装/重同步本技能。');
  console.warn('    缺失不影响构建成功，但对应风格的封面/图标会静默回退"素雅"。');
}

// ===== 复制参考资料到 research/（不参与构建，供写作时阅读） =====
const refs = [
  ['references/components-quickref.md', 'components-quickref.md'],
  ['references/writing-style.md', 'writing-style.md'],
  ['references/terminology-discipline.md', 'terminology-discipline.md'],
  ['references/editor-review.md', 'editor-review.md'],
  ['references/md-templates/00-cover.md', 'md-template-00-cover.md'],
  ['references/md-templates/99-backpage.md', 'md-template-99-backpage.md'],
  ['references/md-templates/part01-chapter-example.md', 'md-template-part01-chapter-example.md'],
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
// coverStyle：显式指定封面风格（科技/书券/复古/素雅/日系/清新），留空则按书名关键词自动识别
// fileTitle：产物文件名专用书名（文件名不允许 / \ : * ? " < > |）。留空则构建时自动净化 title；
// 仅想自定义文件名时填写，封面与 EPUB 元数据仍使用 title
fs.writeFileSync(path.join(PROJECT_DIR, 'version.json'), JSON.stringify({
  version: '1.0.0',
  build: 0,
  lastUpdate: TODAY,
  title: TITLE,
  fileTitle: '',
  subtitle: '',
  author: '',
  coverStyle: ''
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
> 术语表（锁定用词）、数据速查（共享硬事实）、本组章节的大纲行 + Mini-Plan（章节指令）。

---

## 一、书籍定位

### 一句话定位
这本书帮助 {目标读者} 从 {当前状态} 走向 {目标状态}。

### 书籍类型（决定术语形态与审查侧重，五档选一）
详见 research/terminology-discipline.md 体裁映射：
- [ ] 技术/专业（编程、数据、工程）——术语=行业标准译名，审查查时效与代码可运行
- [ ] 方法/技艺（写作、教学、职场方法）——术语=学科通用概念，审查查方法可操作
- [ ] 商业/观点（商业评论、品牌、管理）——忌黑话，审查查观点有论据
- [ ] 人文/叙事（历史、散文、文学）——不强制术语表，审查查语言质感与节奏
- [ ] 科普（科学普及）——术语=科学名词标准译名，审查查严谨性

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

## 三、术语表（写作前锁定用词）

> 作用：治"生造名词"——AI 容易把领域标准说法自造成近义白话（技术书 CDC 写成"抓变化"、Kafka 写成"管道"；写作书写"叙述视角"变"看事情的框框"）。规则见 research/terminology-discipline.md。
> **形态随书籍类型变**：技术/科普给中英对照；方法/技艺存学科通用概念；人文/叙事改维护"用词台账"（只钉人名/地名/专有物件）。
> 规划阶段起草，用户确认后**锁定**；写作与编辑审查都以本表为准。

| 中文标准名 | 英文 | 全称/说明 | 首次出现章 | 禁用同义词 |
|-----------|------|----------|-----------|-----------|
| | | | | |

**填写要求**：
- 覆盖技术专有名词、有标准译名的通用概念、本书自造并显式声明的核心概念、易混淆近义词对
- **禁用同义词列必填**：把 AI 易自造的替代说法钉死（如"抓变化、抽取变更"）
- 写作中若确需新增术语，先补进本表再用

---

## 四、数据速查（全书共享硬事实）

> 作用：把全书反复出现的硬事实（统一版本号、核心数字、关键日期）集中在**一处**，各章共用——避免每章重复搜、避免前后说法打架。
> 写作时**优先引用本表**；本表没有、又必须真实的具体事实，才按需现场搜（判据见 SKILL.md §3.1）。

| 事实/数字 | 取值 | 出处/时效 | 用于哪些章 |
|----------|------|----------|-----------|
| | | | |

---

## 五、章节大纲

| Part | 文件 | 标题 | 核心内容（3-5句） | 读者收益 | 类型标签 | 前置依赖 | 信息来源 |
|------|------|------|-------------------|----------|---------|---------|---------|
| 1 | part01-xxx.md | 第一章 xxx | | | | 无 | |

**类型标签**：[概念] [实操] [案例] [对比] [练习] [反思] [故事] [拓展]
**前置依赖**：本节依赖哪些先完成的章节（无则填"无"），并发写作时据此定顺序
**信息来源**：直接写结论摘要 / 出处（如"XX 官方文档 2025 版"），不要只写文件路径（保证本文件自包含）
**默认不搜**：只有"不可编造的具体事实"（真实数字 / 事件 / 最新版本号 / 官方配置值 / 真实评测数据）才由写作 Agent 现场搜一次、**直接写进正文并加脚注标源**（判据见 SKILL.md §3.1；已登记进"四、数据速查"的优先复用）

---

## 六、单章 Mini-Plan（每章一个，写作 Agent 的直接指令）

### Chapter 1: {章节标题}
- 核心论点（≤30字）：
- 读者读完能做什么：
- 关键案例/数据（示例必须标注"示例"）：
- 必须包含：
- 禁止重复：
- 与前章衔接 / 为后章铺垫：
- 风险点：
- 本章术语（对照 §三 术语表；如需新增，先补表再用）：

---

## 七、知识递进路线

### 核心知识链路
1. → 2. → 3. → ……

### 可能卡点
| 卡点 | 原因 | 解决章节 | 解决方式 |
|------|------|---------|---------|

---

## 八、图表与组件规划

| 章节 | 建议图表/组件 | 格式 | 用途 |
|------|-------------|------|------|
| | 流程图/结构图/对比表/时间线/提示块/步骤 | SVG/表格/:::steps/:::compare | |

---

## 九、对抗性审查设计（供全书写完后的审查 Agent 执行）

> 规范见 research/editor-review.md。全书写完后**统一审一次**，一个审查 Agent 融合双视角（领域主审 + 普通读者）。

- **主审身份**（由书籍类型定，选一）：资深技术编辑 / 资深业务专家 / 资深科普编辑 / 资深学术编辑 / 资深文学编辑 / 自定义：________
- **审查粒度**：☐ 按 part（计划里已合成 part）　☐ 按章（未合成 part）
- **是否需跨章汇总**（如全书术语总表核对、统一结尾风格）：☐ 否　☐ 是，需汇总的内容：________

---

## 十、风险清单

| 风险 | 影响 | 应对方式 | 状态 |
|------|------|---------|------|
| 资料不足 | 章节空泛 | 现场搜补或调整权重 | |
| 章节重叠 | 多 Agent 重复 | 大纲明确边界与承接 | |
| 案例虚构 | 读者信任受损 | 示例标注、现场取信、脚注标源 | |

---

## 十一、进度追踪

| 步骤 | 状态 | 说明 |
|------|------|------|
| 规划 | ⏳ | |
| 术语表锁定 | ⬜ | |
| 数据速查 | ⬜ | 全书共享硬事实是否登记齐 |
| 写作 | ⬜ | 需要时现场搜、直接写正文+脚注 |
| 统一对抗审查 | ⬜ | 全书写完派独立 Agent 审一次 → materials/review/issues.md |
| 清单核销 | ⬜ | 统一修改后逐条核销 → materials/review/resolved.md |
| 构建 | ⬜ | 门禁校验 issues.md + resolved.md 存在 |

---

## 十二、用户确认区

请确认以下内容后进入写作阶段：

- [ ] 书籍定位是否准确
- [ ] 目标读者是否准确
- [ ] **书籍类型是否准确**（技术/方法技艺/商业/人文/科普，五选一）
- [ ] **术语表是否准确**（按书籍类型的形态 + 禁用同义词）
- [ ] **本轮需要登记进「数据速查」的硬事实是否齐全**
- [ ] 章节大纲是否符合预期
- [ ] 是否需要增加或删除章节
- [ ] **对抗性审查设计是否确认**（主审身份 / 审查粒度 / 是否需跨章汇总）
- [ ] EPUB 封面风格：________（AI 推荐风格 + 理由填写在此；可选：科技/素雅/复古/书券/清新/日系。如需自定义封面，提供图片放到 cover-images/cover.jpg，图标放 icon.jpg）
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
   2. 编辑 PROJECT.md —— 填写大纲、术语表、数据速查、对抗性审查设计（默认不搜，只有"不可编造的具体事实"才现场搜）
   3. 在 fragments/ 下写 Markdown 片段（组件语法见 research/components-quickref.md）
   4. 全书写完后统一编辑审查：派独立子 Agent 按 research/editor-review.md 审一次 → issues.md；统一修改后逐条核销 resolved.md
   5. 构建: node build-all.js --products all（含 EPUB；PDF/EPUB 封面排版需 Playwright）

   快捷命令:
   node scripts/rebuild.js              # MD 就绪后重建全部产物
   node scripts/rebuild.js html,pdf     # 只构建 HTML + PDF
   node scripts/rebuild.js all --clean  # 强制清理后全量重建

   封面风格（--cover-style 或 version.json.coverStyle，留空自动识别）:
   科技（编程技术） / 素雅（学术教材，默认） / 复古（历史国学）
   书券（典藏文集） / 清新（科普教育） / 日系（小说散文）

   产物文件名: version.json.fileTitle 可自定义（留空则自动净化 title 中的非法字符）
`);
process.exit(depsOk ? 0 : 0);
