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
// 流程门禁共享逻辑（build-all [0c] 与 scripts/stage.js 共用，保证指纹算法单一来源）
fs.copyFileSync(path.join(TEMPLATES_DIR, 'lib', 'flow-gate.js'), path.join(PROJECT_DIR, 'lib', 'flow-gate.js'));
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
// 流程门禁信号（写作/审查/修改三段信号写入 materials/workflow.json）
fs.copyFileSync(path.join(__dirname, 'stage.js'), path.join(PROJECT_DIR, 'scripts', 'stage.js'));

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
  ['references/md-templates/ch01-chapter-example.md', 'md-template-ch01-chapter-example.md'],
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

// ===== version.json（由 templates/version_template.json 生成；模板带 _template 后缀，防覆盖项目文件） =====
// coverStyle：显式指定封面风格（科技/书券/复古/素雅/日系/清新），留空则按书名关键词自动识别
// fileTitle：产物文件名专用书名（文件名不允许 / \ : * ? " < > |）。留空则构建时自动净化 title；
// 仅想自定义文件名时填写，封面与 EPUB 元数据仍使用 title
const versionTemplate = JSON.parse(
  fs.readFileSync(path.join(TEMPLATES_DIR, 'version_template.json'), 'utf-8')
);
versionTemplate.title = TITLE;
versionTemplate.lastUpdate = TODAY;
fs.writeFileSync(path.join(PROJECT_DIR, 'version.json'), JSON.stringify(versionTemplate, null, 2), 'utf-8');

// ===== CHANGELOG.md =====
fs.writeFileSync(path.join(PROJECT_DIR, 'CHANGELOG.md'),
  `# ${TITLE} 更新日志\n\n> 格式：\`[版本号] YYYY-MM-DD — 摘要\`\n` +
  `> 版本规则：大改（章节增删）→ 主版本号；内容更新 → 次版本号；修正/勘误 → 修订号\n`, 'utf-8');

// ===== PROJECT.md（由 templates/project_template.md 生成；模板带 _template 后缀，防覆盖项目文件） =====
const projectTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'project_template.md'), 'utf-8');
fs.writeFileSync(path.join(PROJECT_DIR, 'PROJECT.md'), projectTemplate.split('{{书名}}').join(TITLE), 'utf-8');

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

   流程信号（构建门禁 [0c] 依据，缺任一段拒绝构建）:
   node scripts/stage.js writing  --done   # 写作完成
   node scripts/stage.js review   --done   # 对抗审查完成
   node scripts/stage.js revision --done   # 统一修改+核销完成

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
