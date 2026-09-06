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

> 目标：
> 规格：
> 状态：规划中

---

## 章节大纲

| Part | 节 | 标题 | 核心内容 | 需要采集 | 采集方向 | 信息来源 |
|------|----|------|---------|---------|---------|---------|
| 1 | 01 | | | ❌ 无需 | - | |

---

## 进度追踪

| 步骤 | 状态 | 说明 |
|------|------|------|
| 规划 | ⏳ | |
| 素材采集 | ⬜ | |
| 写作 | ⬜ | |
| 构建 | ⬜ | |

---

## 关键数据速查

-
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
