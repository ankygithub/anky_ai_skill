#!/usr/bin/env node
/**
 * lite 技能回归测试
 *
 * 覆盖内容（每项对应一次实际事故或关键行为约定）：
 *  1. convert-md：全组件语法转换正确性（callout/steps/compare/figure/SVG）
 *  2. 占位符零残留：转换输出不得残留任何 __XXX_N__ 占位符（围栏配对事故回归）
 *  3. 代码围栏配对：代码内容中的行内 ``` 不得破坏配对、块内 # 注释不得变标题（围栏事故回归）
 *  4. check-md 门禁：好片段放行、含禁用HTML/错误层级的坏片段拦截
 *  5. build.js：单文件 HTML 生成 + bookmarks.json 指纹字段存在
 *  6. v3 设计系统：7套主题/默认print-proof/表头token/无网络字体/
 *     reader 锚点提取四段齐全（改 styles.css 注释弄断提取的事故回归）
 *
 * 用法：node tests/run-tests.js
 * （不依赖 playwright，PDF/阅读器不在本测试范围）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const FIXTURES = path.join(__dirname, 'fixtures');
const WORK = path.join(__dirname, '.work');
const NODE_EXE = process.execPath;

let passed = 0;
let failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`   ✅ ${name}`); }
  else { failed++; console.log(`   ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// ===== 准备工作目录：夹具 + 被测脚本 =====
console.log('🧪 lite 回归测试\n');
cleanDir(WORK);
fs.mkdirSync(path.join(WORK, 'fragments'), { recursive: true });
// 复制夹具
for (const f of fs.readdirSync(path.join(FIXTURES, 'fragments'))) {
  fs.copyFileSync(path.join(FIXTURES, 'fragments', f), path.join(WORK, 'fragments', f));
}
// 复制被测脚本（模拟 init 部署形态：脚本与 lib/ 同在项目根）
for (const f of ['convert-md.js', 'check-md.js', 'fix-md.js', 'build-all.js', 'build.js', 'build-md.js', 'styles.css']) {
  fs.copyFileSync(path.join(TEMPLATES, f), path.join(WORK, f));
}
fs.mkdirSync(path.join(WORK, 'lib'), { recursive: true });
fs.copyFileSync(path.join(TEMPLATES, 'lib', 'fence-scan.js'), path.join(WORK, 'lib', 'fence-scan.js'));
fs.copyFileSync(path.join(TEMPLATES, 'version.json'), path.join(WORK, 'version.json'));
// templates/version.json 仅含版本号，测试需要完整字段
fs.writeFileSync(path.join(WORK, 'version.json'), JSON.stringify({
  version: '1.0.0', title: '回归测试手册', subtitle: '', author: '测试'
}), 'utf-8');

// ===== 1. check-md：好片段放行 =====
console.log('🔍 [1] check-md 门禁（好片段放行）');
let r = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
assert(r.status === 0, '好片段通过门禁', r.stdout);

// ===== 2. check-md：坏片段拦截 =====
console.log('🔍 [2] check-md 门禁（坏片段拦截）');
const badDir = path.join(WORK, 'bad-fragments');
fs.mkdirSync(badDir, { recursive: true });
fs.writeFileSync(path.join(badDir, 'bad.md'),
  '---\ntype: chapter\ntitle: 坏例\n---\n\n## 第一章 坏例\n\n<div class="callout callout-tip"><p>旧写法</p></div>\n', 'utf-8');
r = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), badDir], { encoding: 'utf-8' });
assert(r.status !== 0, '禁用 HTML 被拦截（exit 非 0）', r.stdout);

// ===== 3. convert-md 转换正确性 =====
console.log('🔍 [3] convert-md 转换');
r = spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
assert(r.status === 0, '转换退出码 0', r.stdout + r.stderr);
const part01 = fs.readFileSync(path.join(WORK, 'fragments', 'part01.html'), 'utf-8');
const tocHtml = fs.readFileSync(path.join(WORK, 'fragments', '01-toc.html'), 'utf-8');

// 3a. 占位符零残留（围栏配对事故回归）
assert(!/__(?:CODE_BLOCK|INLINE_CODE|FENCE_BLOCK|HTML_BLOCK|CALLOUT)_\d+__/.test(part01),
  '占位符零残留', '输出中残留 __XXX_N__ 占位符');

// 3b. callout 全类型
for (const cls of ['callout-tip', 'callout-warn', 'callout-info', 'callout-violet']) {
  assert(part01.includes(`class="callout ${cls}"`), `callout 类型 ${cls} 生成`);
}
assert(part01.includes('>核心建议<') || part01.includes('>核心建议</div>'), '中文别名 callout 兼容');

// 3c. 步骤卡片 + 嵌套续行（列表/表格/代码块）
assert((part01.match(/class="step-card"/g) || []).length === 3, 'step-card ×3');
assert(part01.includes('<div class="step-body"><table>'), '步骤内表格渲染为 <table>');
assert(part01.includes('<pre><code>pip install langchain</code></pre>'), '步骤内代码块渲染');

// 3d. 对比块三栏
assert(part01.includes('compare-item compare-bad') && part01.includes('compare-item compare-good') && part01.includes('compare-item compare-center'), 'compare 三栏');

// 3e. 围栏配对回归：行内 ``` 不破坏配对，块内 # 注释不变标题
assert(part01.includes('removeprefix("```sql")'), '代码内容中的行内 ``` 原样保留');
const h2s = part01.match(/<h2 class="section-title[^>]*>([^<]*)<\/h2>/g) || [];
assert(h2s.length === 1, 'h2 数量 = 1（代码块内 # 注释未泄漏为标题）', '实际: ' + h2s.length);
assert(!part01.includes('<h2 class="section-title page-break" id="part2">把检索结果'), '代码内注释未泄漏为 h2（围栏事故回归）');
const tocCount = (tocHtml.match(/<li[\s>]/g) || []).length;
assert(tocCount === 6, 'TOC 条目数 = 6（1章 + 5节，代码块内注释不计入）', '实际: ' + tocCount);

// 3f. figure 闭合 + svg 保留
assert((part01.match(/<figure\b/g) || []).length === (part01.match(/<\/figure>/g) || []).length, 'figure 开闭配对');
assert(part01.includes('<svg'), '内嵌 SVG 保留');

// ===== 4. 未闭合 figure 自愈 =====
console.log('🔍 [4] figure 未闭合自愈');
fs.writeFileSync(path.join(WORK, 'fragments', 'part02-figure.md'),
  '---\ntype: chapter\ntitle: 第二章 自愈\n---\n\n## 第二章 自愈\n\n<figure class="content-figure">\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\n<figcaption>图</figcaption>\n\nfigure 之后的正文。\n', 'utf-8');
r = spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
const part02 = fs.readFileSync(path.join(WORK, 'fragments', 'part02.html'), 'utf-8');
assert(r.stdout.includes('unclosed-figure'), '未闭合 figure 触发自愈警告');
assert((part02.match(/<figure\b/g) || []).length === (part02.match(/<\/figure>/g) || []).length, '自愈后 figure 配对');
assert(part02.includes('<p>figure 之后的正文。</p>'), 'figure 后正文不被吞（未被包进 figure）');
// 恢复现场：删除自愈用例的源文件与产物，重新转换，避免污染后续构建测试
fs.rmSync(path.join(WORK, 'fragments', 'part02-figure.md'), { force: true });
fs.rmSync(path.join(WORK, 'fragments', 'part02.html'), { force: true });
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });

// ===== 5. build.js 单文件 + 书签指纹 =====
console.log('🔍 [5] build.js 单文件构建');
r = spawnSync(NODE_EXE, [path.join(WORK, 'build.js')], { cwd: WORK, encoding: 'utf-8' });
assert(r.status === 0, 'build.js 退出码 0', r.stdout + r.stderr);
const bookmarksPath = path.join(WORK, 'output', 'bookmarks.json');
assert(fs.existsSync(bookmarksPath), 'bookmarks.json 生成');
if (fs.existsSync(bookmarksPath)) {
  const bm = JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
  assert(typeof bm.htmlHash === 'string' && bm.htmlHash.length === 40, 'bookmarks.json 含内容指纹');
  assert(Array.isArray(bm.bookmarks) && bm.bookmarks.length === 6, 'bookmarks 条目数 = 6', '实际: ' + (bm.bookmarks || []).length + ' | ' + JSON.stringify(bm.bookmarks));
}
const singleHtml = path.join(WORK, 'output', '回归测试手册-v1.0.0.html');
assert(fs.existsSync(singleHtml), '单文件 HTML 生成');
if (fs.existsSync(singleHtml)) {
  const sh = fs.readFileSync(singleHtml, 'utf-8');
  assert(!/__(?:CODE_BLOCK|FENCE_BLOCK|HTML_BLOCK|CALLOUT)_\d+__/.test(sh), '单文件 HTML 占位符零残留');
  assert(sh.includes('step-card'), '单文件含 step-card 样式');
}

// ===== 6. v3 设计系统回归（主题/表头/字体/锚点提取） =====
console.log('🔍 [6] v3 设计系统');
const buildSrc = fs.readFileSync(path.join(TEMPLATES, 'build.js'), 'utf-8');
const stylesSrc = fs.readFileSync(path.join(TEMPLATES, 'styles.css'), 'utf-8');

// 6a. 主题面板 7 套，print-proof 置顶为默认
const themeKeys = (buildSrc.match(/key: '([^']*)', name: /g) || []).map(s => s.replace(/key: '|', name: /g, ''));
assert(themeKeys.length === 7, '主题数量 = 7', '实际: ' + themeKeys.length);
assert(themeKeys[0] === 'print-proof', 'print-proof 置顶为默认主题', '首位: ' + themeKeys[0]);
assert(buildSrc.includes('<html lang="zh-CN" data-theme="print-proof">'), 'html 默认主题 print-proof（首屏无闪烁）');
assert(buildSrc.includes("getSaved('theme', 'print-proof')"), '首次访问默认主题 print-proof');

// 6b. 存储命名空间 v4（旧键历史主题不得串场）
assert(buildSrc.includes('huashu_v4_') && !buildSrc.includes('huashu_v3_'), '存储命名空间 huashu_v4_');

// 6c. 无网络字体（本地字体栈，锐利渲染 + 无 FOUT）
assert(!buildSrc.includes('fonts.googleapis.com'), 'build.js 无 Google 网络字体');

// 6d. 表格墨底表头签名 token（用户审核通过的设计核心）
for (const token of ['--table-head-bg', '--table-head-color', '--table-head-rule', '--table-row-alt']) {
  assert(stylesSrc.includes(token), `styles.css 含表格 token ${token}`);
}
assert(stylesSrc.includes('background: var(--table-head-bg)'), '表头背景走 token（组件层零硬编码）');

// 6e. 主题 token 完整性：7 套主题块各自持有 --table-head-bg（防主题泄漏回归）
assert((stylesSrc.match(/--table-head-bg:/g) || []).length === 7, '7 套主题均定义 --table-head-bg',
  '实际: ' + (stylesSrc.match(/--table-head-bg:/g) || []).length);

// 6f. reader 锚点提取：四段组件样式必须可完整提取（build-reader 同款算法）
const COMPONENT_SECTION_ANCHORS = ['高亮块/信息块', '对比示例块', '简洁步骤卡片', '图片组件'];
const sections = stylesSrc.split(/(?=\/\* ===== )/);
const missingAnchors = COMPONENT_SECTION_ANCHORS.filter(a => !sections.some(s => s.includes(a)));
assert(missingAnchors.length === 0, 'reader 锚点四段齐全', '缺失: ' + missingAnchors.join('/'));
// 锚点词全文件唯一：提取算法取"第一个包含锚点词的段落"，
// 注释/文档里重复出现锚点词会让提取器误命中错误段落（本次事故回归）
for (const a of COMPONENT_SECTION_ANCHORS) {
  assert((stylesSrc.split(a).length - 1) === 1, `锚点词唯一：「${a}」`,
    '出现 ' + (stylesSrc.split(a).length - 1) + ' 次，会让 find 误命中头部注释');
}
const mustHave = { '高亮块/信息块': '.callout', '对比示例块': '.compare-item', '简洁步骤卡片': '.step-card', '图片组件': '.content-figure' };
for (const [anchor, cls] of Object.entries(mustHave)) {
  const sec = sections.find(s => s.includes(anchor)) || '';
  assert(sec.includes(cls), `锚点「${anchor}」段含 ${cls}`);
}

// 6g. 阅读器与单文件主题体系一致（防两套产物漂移）
const readerSrc = fs.readFileSync(path.join(TEMPLATES, 'build-reader.js'), 'utf-8');
assert((readerSrc.match(/key: '([^']*)', name: /g) || []).length === 7, 'reader 主题数量 = 7');
assert(readerSrc.includes("'huashu_v4_theme'"), 'reader 存储键 v4');
assert(readerSrc.includes("|| 'print-proof'"), 'reader 默认主题 print-proof');
assert(!readerSrc.includes('fonts.googleapis.com'), 'reader 无 Google 网络字体');
assert(readerSrc.includes('var(--table-head-color)') && readerSrc.includes('var(--table-head-rule)'), 'reader 表头走 v3 表格 token');

// 6h. EPUB 墨底表头签名（主样式 + fallback 内联副本都要同步）
const epubSrc = fs.readFileSync(path.join(TEMPLATES, 'epub-styles.css'), 'utf-8');
const epubJs = fs.readFileSync(path.join(TEMPLATES, 'build-epub-pro.js'), 'utf-8');
assert(epubSrc.includes('background: #1F2126') && epubSrc.includes('color: #FFFFFF'), 'EPUB 主样式墨底反白表头');
assert(epubSrc.includes('border-bottom: 2px solid #B42318'), 'EPUB 表头朱砂规则线');
assert(epubJs.includes('th{background:#1F2126'), 'EPUB fallback 内联样式同步墨底表头');
assert(!epubSrc.includes('background: #f5f5f5;\n  font-weight: 600;\n  color: #444;'), 'EPUB 旧淡灰表头已移除');

// ===== 清理 =====
fs.rmSync(WORK, { recursive: true, force: true });

console.log('\n' + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
