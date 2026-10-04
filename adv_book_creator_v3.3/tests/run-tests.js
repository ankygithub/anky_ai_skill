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
 *  7. EPUB：零依赖打包（archiver 移除）/封面风格注册表与关键词识别/icon 库文件齐备
 *  8. callout 内脚注渲染、文件名纯 ASCII、封面库缺失预检、编辑审查门禁（v3.2+ 有则断言）
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
fs.copyFileSync(path.join(TEMPLATES, 'lib', 'flow-gate.js'), path.join(WORK, 'lib', 'flow-gate.js'));
// 模板化：技能侧只放 *_template 模板（防覆盖项目文件），WORK 的 version.json 按需现写
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

// ===== 2b. check-md：术语禁用词扫描（TERM001，警告级） =====
console.log('🔍 [2b] check-md 术语禁用词扫描');
const termRoot = path.join(WORK, 'term-case');
fs.mkdirSync(path.join(termRoot, 'fragments'), { recursive: true });
fs.writeFileSync(path.join(termRoot, 'PROJECT.md'),
  '# T\n\n## 三、术语表（写作前锁定用词）\n\n' +
  '| 中文标准名 | 英文 | 全称/说明 | 首次出现章 | 禁用同义词 |\n' +
  '|-----------|------|----------|-----------|-----------|\n' +
  '| 变更数据捕获 | CDC | Change Data Capture | 第 5 章 | 抓变化、抽取变更 |\n\n',
  'utf-8');
fs.writeFileSync(path.join(termRoot, 'fragments', 'part01-term.md'),
  '---\ntype: chapter\ntitle: 术语\n---\n\n## 第一章 术语\n\n正文用标准词 变更数据捕获。\n\n' +
  '这里误用了抓变化这个说法。\n\n```text\n代码里的 抓变化 属字面量，不扫\n```\n\n行内示例 `抓变化` 也不扫。\n', 'utf-8');
r = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), path.join(termRoot, 'fragments'), '--json'], { encoding: 'utf-8' });
const termJson = JSON.parse(r.stdout);
assert(termJson.errorCount === 0, '术语禁用词仅警告不阻断（errorCount=0）', r.stdout);
assert(termJson.warningCount === 1, '术语禁用词命中 1 处（围栏内与行内代码不误报）',
  '实际 warningCount=' + termJson.warningCount + '\n' + r.stdout);
// 文本模式成功分支必须打印警告明细（否则作者看不到 TERM001 结果）
const termText = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), path.join(termRoot, 'fragments')], { encoding: 'utf-8' });
assert(termText.stdout.includes('警告明细') && termText.stdout.includes('抓变化'), '成功分支打印术语警告明细');
fs.rmSync(termRoot, { recursive: true, force: true });

// ===== 2c. check-md：特殊文件豁免 + 单字符禁词（回归） =====
console.log('🔍 [2c] check-md 特殊文件豁免与单字符禁词');
{
  const root = path.join(WORK, 'special-case');
  fs.mkdirSync(path.join(root, 'fragments'), { recursive: true });
  const w = (rel, txt) => fs.writeFileSync(path.join(root, rel), txt, 'utf-8');
  const fm = (title) => `---\ntype: chapter\ntitle: ${title}\n---\n\n`;

  // HDG003：part00（卷首）与附录（fulu）无章标题不应报错；普通 part 无章标题应报错
  w('fragments/part00-daodu.md', fm('卷首') + '导言，无章标题。\n');
  w('fragments/part05-fulu-terms.md', fm('附录') + '### 附录A 术语表\n\n内容。\n');
  w('fragments/part01-normal.md', fm('缺章标题') + '### 1.1 小节\n\n正文。\n');
  let rx = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), path.join(root, 'fragments'), '--json'], { encoding: 'utf-8' });
  let jx = JSON.parse(rx.stdout);
  const hdg = jx.errors.filter(e => e.ruleId === 'HDG003');
  assert(hdg.length === 1 && hdg[0].file === 'part01-normal.md',
    'HDG003 只对普通 part 报缺章标题（part00/附录豁免）', JSON.stringify(hdg));
  fs.rmSync(root, { recursive: true, force: true });

  // TERM001：单字符禁词（"A/B 测试"拆出的 A）不再全库误报；2 字禁词仍命中
  const troot = path.join(WORK, 'single-char');
  fs.mkdirSync(path.join(troot, 'fragments'), { recursive: true });
  fs.writeFileSync(path.join(troot, 'PROJECT.md'),
    '# T\n\n## 三、术语表（写作前锁定用词）\n\n' +
    '| 中文标准名 | 英文 | 全称/说明 | 首次出现章 | 禁用同义词 |\n' +
    '|-----------|------|----------|-----------|-----------|\n' +
    '| 变更数据捕获 | CDC | Change Data Capture | 第 5 章 | 抓变化、A/B 测试（仅可作括注） |\n\n', 'utf-8');
  fs.writeFileSync(path.join(troot, 'fragments', 'part01-term.md'),
    '---\ntype: chapter\ntitle: 术语\n---\n\n## 第一章 术语\n\n' +
    '标准词 变更数据捕获。误用 抓变化。\n\n' +
    '颜色 #E8F1FB 与 A/B 测试 属于字面量，不应命中单字符禁词。\n', 'utf-8');
  rx = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), path.join(troot, 'fragments'), '--json'], { encoding: 'utf-8' });
  jx = JSON.parse(rx.stdout);
  const termWarns = jx.errors.filter(e => e.ruleId === 'TERM001');
  assert(termWarns.length === 1 && /抓变化/.test(termWarns[0].message),
    'TERM001 单字符禁词跳过（A/B 不再全库误报），2 字禁词仍命中', JSON.stringify(termWarns));
  fs.rmSync(troot, { recursive: true, force: true });
}

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

// ===== 3g. 表格空单元格保留（回归：split('|').filter(c=>c.trim()) 吞掉空格子，
//          使「首列合并维度 + 续行留空」的表格整行左移一格） =====
console.log('🔍 [3g] 表格空单元格保留');
const cellMd = path.join(WORK, 'fragments', 'part02-emptycell.md');
fs.writeFileSync(cellMd,
  '---\ntype: chapter\ntitle: 第二章 空单元格\n---\n\n## 第二章 空单元格\n\n' +
  '| 维度 | 档位 | 加分/扣分 |\n|------|------|----------|\n' +
  '| 征信逾期次数 | 0 次 | 0 |\n| | 1-2 次 | -15 |\n| | 3 次及以上 | -40 |\n', 'utf-8');
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
// 产物按章节序号命名（part01/part02…，非源文件名），用唯一标记定位含该表的 html，避免耦合序号
const cellHtmlPath = fs.readdirSync(path.join(WORK, 'fragments'))
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(WORK, 'fragments', f))
  .find(p => fs.readFileSync(p, 'utf-8').includes('征信逾期次数'));
const cellHtml = cellHtmlPath ? fs.readFileSync(cellHtmlPath, 'utf-8') : '';
{
  const bodyRows = (cellHtml.match(/<tr>[\s\S]*?<\/tr>/g) || []).filter(x => x.includes('<td'));
  const contRow = bodyRows.find(x => x.includes('1-2 次')) || '';
  assert(bodyRows.length === 3, '数据行 = 3 行', '实际: ' + bodyRows.length);
  assert((contRow.match(/<td/g) || []).length === 3, '续行保留 3 个 <td>（不再左移一格）',
    '实际: ' + (contRow.match(/<td/g) || []).length);
  assert(/<td[^>]*><\/td>\s*<td[^>]*>1-2 次<\/td>/.test(contRow), '首格渲染为空 <td>，档位/分值各归其位');
  assert(bodyRows.every(x => (x.match(/<td/g) || []).length === 3), '全表每行均 3 格');
}
// 恢复现场：删除该用例片段并重新转换（convert-md 每次会清空旧 html，序号随之复位）
fs.rmSync(cellMd, { force: true });
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });

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

// ===== 4b. 脚注渲染（多看弹窗规范三件套） =====
console.log('🔍 [4b] 脚注渲染');
fs.writeFileSync(path.join(WORK, 'fragments', 'part02-fn.md'),
  '---\ntype: chapter\ntitle: 第二章 脚注\n---\n\n## 第二章 脚注\n\n向量化比循环快[^1]，底层是 C 实现[^c]。同源复用[^1]。\n\n[^1]: 来源：chapter-11-s01（官方文档）\n[^c]: 来源：chapter-13-s02\n', 'utf-8');
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
const part02fn = fs.readFileSync(path.join(WORK, 'fragments', 'part02.html'), 'utf-8');
assert(part02fn.includes('<a class="duokan-footnote" id="fnref-1" href="#fn-1"><sup>[1]</sup></a>'), '脚注文内引用（首引带锚点 id）');
assert((part02fn.match(/class="duokan-footnote"/g) || []).length === 3, '脚注引用共 3 处（含同源复用）');
assert(part02fn.includes('<ol class="duokan-footnote-content">'), '章末多看脚注列表（ol 三件套）');
assert(part02fn.includes('<li class="duokan-footnote-item" id="fn-1">来源：chapter-11-s01'), '脚注定义渲染 + 编号重排');
assert(part02fn.includes('id="fn-2"'), '第二脚注编号递增');
// 未定义引用 → check-md 警告不阻断
const badFnDir = path.join(WORK, 'bad-fn');
fs.mkdirSync(badFnDir, { recursive: true });
fs.writeFileSync(path.join(badFnDir, 'bad-fn.md'),
  '---\ntype: chapter\ntitle: fn\n---\n\n## 第一章 fn\n\n引用[^9]未定义。\n', 'utf-8');
const fnCheck = spawnSync(NODE_EXE, [path.join(WORK, 'check-md.js'), badFnDir, '--json'], { encoding: 'utf-8' });
const fnJson = JSON.parse(fnCheck.stdout);
assert(fnJson.errorCount === 0 && fnJson.warningCount >= 1, '脚注未定义引用 → 警告不阻断');
fs.rmSync(badFnDir, { recursive: true, force: true });
// 恢复现场
fs.rmSync(path.join(WORK, 'fragments', 'part02-fn.md'), { force: true });
fs.rmSync(path.join(WORK, 'fragments', 'part02.html'), { force: true });
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });

// ===== 4c. callout 内脚注渲染（回归：callout 先被抽成占位符，第 9.5 步替换不到 → [^n] 漏为字面量） =====
console.log('🔍 [4c] callout 内脚注渲染');
fs.writeFileSync(path.join(WORK, 'fragments', 'part02-callout-fn.md'),
  '---\ntype: chapter\ntitle: 第二章 提示块脚注\n---\n\n## 第二章 提示块脚注\n\n' +
  '> [!TIP] 标题带脚注[^t]\n' +
  '> 正文带脚注[^a]，再复用[^t]。\n' +
  '> 行内代码 `[^x]` 应保持字面量。\n\n' +
  '正文引用[^a]。\n\n' +
  '[^t]: 标题脚注定义\n[^a]: 正文脚注定义\n', 'utf-8');
spawnSync(NODE_EXE, [path.join(WORK, 'convert-md.js'), path.join(WORK, 'fragments')], { encoding: 'utf-8' });
const part02cf = fs.readFileSync(path.join(WORK, 'fragments', 'part02.html'), 'utf-8');
const cfNoCode = part02cf.replace(/<code>[\s\S]*?<\/code>/g, '<code>…</code>');
assert(part02cf.includes('<div class="callout callout-tip">'), 'callout 渲染为 div.callout');
assert(!/\[\^[A-Za-z0-9]\]/.test(cfNoCode), 'callout 内 [^n] 无字面量残留（行内代码除外）');
assert(part02cf.includes('<code>[^x]</code>'), 'callout 内行内代码字面量 [^x] 未被误伤');
assert((part02cf.match(/class="duokan-footnote"/g) || []).length === 4, 'callout + 正文脚注引用共 4 处',
  '实际: ' + (part02cf.match(/class="duokan-footnote"/g) || []).length);
assert(part02cf.includes('<li class="duokan-footnote-item" id="fn-1">标题脚注定义'), '章末脚注列表含 callout 引用的定义');
assert(part02cf.includes('class="fn-back" href="#fnref-1"'), '章末脚注 ↩ 回链指向 fnref-1');
{
  // 锚点必须落在文档中最先出现的引用处（callout 标题），而非"分批处理顺序最先"的正文
  const calloutStart = part02cf.indexOf('<div class="callout callout-tip">');
  const calloutEnd = part02cf.indexOf('</div>', calloutStart);
  const anchorIdx = part02cf.indexOf('id="fnref-1"');
  assert(anchorIdx > calloutStart && anchorIdx < calloutEnd, 'fnref-1 锚点位于文档首个引用处（callout 标题内）');
}
// 恢复现场
fs.rmSync(path.join(WORK, 'fragments', 'part02-callout-fn.md'), { force: true });
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

// ===== 5b. build-md.js Markdown 源头聚合 =====
console.log('🔍 [5b] build-md.js Markdown 聚合');
r = spawnSync(NODE_EXE, [path.join(WORK, 'build-md.js')], { cwd: WORK, encoding: 'utf-8' });
assert(r.status === 0, 'build-md.js 退出码 0', r.stdout + r.stderr);
const mdOutPath = path.join(WORK, 'output', '回归测试手册-v1.0.0.md');
assert(fs.existsSync(mdOutPath), 'Markdown 产物生成');
if (fs.existsSync(mdOutPath)) {
  const md = fs.readFileSync(mdOutPath, 'utf-8');
  assert(!md.includes('选择主题') && !md.includes('内容宽度'), 'MD 无导航/设置面板残渣');
  assert(!/^:::/m.test(md), 'MD 无残留围栏标识符（降级完成）');
  assert((md.match(/^## 目录$/gm) || []).length === 1, 'MD 目录唯一');
  // div 数量与源一致（聚合不增不减；源中的行内代码 <div> 示例属合法保留）
  let srcDiv = 0;
  for (const f of fs.readdirSync(path.join(WORK, 'fragments')).filter(f => f.endsWith('.md'))) {
    srcDiv += (fs.readFileSync(path.join(WORK, 'fragments', f), 'utf-8').match(/<div/g) || []).length;
  }
  assert((md.match(/<div/g) || []).length === srcDiv, 'MD 的 div 数量与源一致', '产物 ' + (md.match(/<div/g) || []).length + ' vs 源 ' + srcDiv);
  // SVG 只允许出现在源码框内（复用被测仓库的 fence-scan 判定）
  const { scanFenceMask: maskOf } = require(path.join(WORK, 'lib', 'fence-scan.js'));
  const mdLines = md.split('\n');
  const mdMask = maskOf(mdLines);
  assert(!mdLines.some((l, i) => !mdMask[i] && /<svg[\s>]/i.test(l)), 'MD 无裸 SVG（在源码框内）');
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

// ===== 7. EPUB 打包与封面风格 =====
console.log('🔍 [7] EPUB 打包与封面风格');
const coverSelect = require(path.join(TEMPLATES, 'lib', 'cover-select.js'));

// 7a. 零依赖打包：移除 archiver 隐性依赖（依赖目录树里恰好有 node_modules/archiver 才能跑，干净环境必挂的事故回归）
assert(!/require\('archiver'\)/.test(epubJs), 'EPUB 打包不再依赖 archiver');
assert(epubJs.includes('deflateRawSync'), 'EPUB 打包使用内置 zlib deflate');
assert(epubJs.includes("name: 'mimetype'"), 'EPUB mimetype 首条目写入');

// 7a-2. 内置迷你高亮兜底（highlight.js 缺席时全书写作语言仍有着色）+ 标题对齐压制阅读器默认样式
assert(epubJs.includes('miniHighlightCode') && epubJs.includes('MINI_HL'), 'EPUB 内置迷你高亮器存在');
assert(/python[\s\S]*shell[\s\S]*json[\s\S]*javascript/.test(epubJs.slice(epubJs.indexOf('MINI_HL'), epubJs.indexOf('MINI_LANG_MAP'))), '迷你高亮覆盖 python/shell/json/js');
assert(epubSrc.includes('text-align: left !important'), 'EPUB h3-h6 左对齐带 !important');
assert(epubJs.includes('.step-phase{display:inline-block'), 'EPUB fallback 含 step 徽标非 flex 样式');
// 代码缩进保护：pre/pre code 显式 pre-wrap（阅读器默认样式不保证，缺失时缩进塌缩错位）
assert(epubSrc.includes('white-space: pre-wrap !important'), 'EPUB pre 显式 pre-wrap 防缩进塌缩');
assert(epubJs.includes('white-space:pre-wrap!important'), 'EPUB fallback 同步 pre-wrap');
assert(!epubSrc.includes('.hljs-comment { color: #6a737d; font-style: italic; }'), 'EPUB 注释去斜体（中文斜体回退衬线导致混排错乱）');
// 强制塌缩型阅读器（Reeden 等）CSS 压不住，缩进改由 NBSP 承载
assert(epubJs.includes('protectCodeWhitespace') && epubJs.includes('\\u00A0'), 'EPUB 代码缩进 NBSP 保护');

// 7a-3. highlight.js 内嵌精简版随技能分发（EPUB 高亮零安装、跨机器一致）
assert(fs.existsSync(path.join(TEMPLATES, 'lib', 'hljs-bundle.js')), 'hljs-bundle.js 存在');
assert(fs.existsSync(path.join(TEMPLATES, 'lib', 'hljs', 'core.js')), 'hljs core.js 存在');
assert(fs.existsSync(path.join(TEMPLATES, 'lib', 'hljs', 'languages', 'python.js')), 'hljs 语言包存在（python）');
assert(epubJs.includes("path.join(__dirname, 'lib', 'hljs-bundle.js')"), 'build-epub-pro 优先加载内嵌 hljs');

// 7a-4. 信源脚注 + DK 字体（多看精排对齐）
const convertSrc = fs.readFileSync(path.join(TEMPLATES, 'convert-md.js'), 'utf-8');
assert(convertSrc.includes('duokan-footnote-content') && convertSrc.includes('duokan-footnote-item'), 'convert-md 生成多看脚注三件套');
assert(convertSrc.includes('footnoteOrder') && convertSrc.includes('isFenceSubCall'), '脚注编号重排 + 围栏子调用豁免');
assert(epubSrc.includes('.duokan-footnote') && epubSrc.includes('.fn-back'), 'EPUB 脚注样式');
assert(epubSrc.includes('DK-KAITI') && epubSrc.includes('DK-HEITI'), 'EPUB DK 字体对齐（楷体引文/黑体标题）');
assert(epubJs.includes('DK-KAITI') && epubJs.includes('DK-HEITI'), 'fallback CSS 同步 DK 字体');
assert(fs.readFileSync(path.join(TEMPLATES, 'check-md.js'), 'utf-8').includes('footnoteIntegrity'), 'check-md 含脚注完整性规则');
assert(fs.readFileSync(path.join(TEMPLATES, 'check-md.js'), 'utf-8').includes('terminologyBanned'), 'check-md 含术语禁用词扫描规则');

// 7a-5. 输出文件名净化 + 封面模板围栏（WorkBuddy fix0921 回灌，防回退）
for (const f of ['build.js', 'build-pdf.js', 'build-md.js', 'build-epub-pro.js', 'build-all.js']) {
  const src = fs.readFileSync(path.join(TEMPLATES, f), 'utf-8');
  assert(src.includes('fileTitle') && src.includes('[/\\\\:*?"<>|]'), `${f} 输出文件名净化（fileTitle 优先 + 非法字符替换）`);
}
const buildAllSrc = fs.readFileSync(path.join(TEMPLATES, 'build-all.js'), 'utf-8');
assert(!buildAllSrc.includes('`${title}-v${version}'), 'build-all 门禁/摘要无裸 title 拼接残留');
const coverTpl = fs.readFileSync(path.join(TEMPLATES, '..', 'references', 'md-templates', '00-cover.md'), 'utf-8');
assert(coverTpl.startsWith('---\ntype: cover'), '00-cover.md 模板 frontmatter 围栏正确（---，非 ***）');

// 7b. 风格注册表：6 风格齐全
const styleNames = Object.keys(coverSelect.STYLES);
assert(styleNames.length === 6, '封面风格 = 6', '实际: ' + styleNames.join('/'));

// 7c. 关键词自动识别（真实书名回归：Python 书 → 科技）
assert(coverSelect.detectStyle('Python 生态全景：一次看懂 Python 世界') === '科技', 'Python 书名自动识别为科技');
assert(coverSelect.detectStyle('中国哲学史') === '复古', '哲学书名自动识别为复古');
assert(coverSelect.detectStyle('儿童科普启蒙读物') === '清新', '科普书名自动识别为清新');
assert(coverSelect.detectStyle('无关键词书名') === null, '无命中返回 null（走兜底）');

// 7d. 风格库文件存在（icon/ 素材与注册表一致，防改名断链）
const iconDir = path.join(ROOT, 'icon');
for (const [name, cfg] of Object.entries(coverSelect.STYLES)) {
  assert(fs.existsSync(path.join(iconDir, cfg.portrait)), `icon 库含 ${cfg.portrait}`);
  assert(fs.existsSync(path.join(iconDir, cfg.square)), `icon 库含 ${cfg.square}`);
}

// 7e. init 部署形态：init-project.js 需复制风格库与 cover-select
const initSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'init-project.js'), 'utf-8');
assert(initSrc.includes("path.join(SKILL_DIR, 'icon')"), 'init 复制 icon 风格库');
assert(initSrc.includes('cover-select.js'), 'init 复制 cover-select.js');
assert(initSrc.includes('version_template.json'), 'init 从 version_template.json 读版本模板');
assert(initSrc.includes('project_template.md'), 'init 从 project_template.md 读项目计划模板');

// 7f. 文件名纯 ASCII 回归（Trae/WorkBuddy 安装时非 ASCII 文件名会被编码破坏 → icon 库失效/模板漏拷）
{
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.work') continue;
      const p = path.join(dir, e.name);
      if (/[^\x00-\x7F]/.test(e.name)) bad.push(path.relative(ROOT, p));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(ROOT);
  assert(bad.length === 0, '技能内文件名全为 ASCII（防安装期编码破坏）', '非法: ' + bad.join(', '));
}

// 7g. 封面风格库完整性预检（init-project.js 显式校验 icon/ 是否齐备，不静默漏拷）
assert(initSrc.includes('封面风格库完整性预检') && initSrc.includes('missingCovers'), 'init 含封面风格库缺失预检告警');

// 7h. 构建门禁探针（v3.3+ 为 [0c] 流程门禁；v3.2 为编辑审查留痕门禁；v3.1 无）
{
  if (buildAllSrc.includes('validateFlowGate')) {
    assert(buildAllSrc.includes('[0c] 流程门禁'), 'build-all 含 [0c] 流程门禁调用');
    assert(buildAllSrc.includes("require(path.join(__dirname, 'lib', 'flow-gate.js'))"), 'build-all 引用共享库 lib/flow-gate.js');
    assert(buildAllSrc.includes('--no-gate 临时跳过'), '门禁提示 --no-gate 逃生阀');
  } else if (buildAllSrc.includes('validateEditorReview')) {
    assert(buildAllSrc.includes('[0c] 编辑审查门禁'), 'build-all 含 [0c] 编辑审查门禁调用');
    assert(/materials['"],\s*['"]review['"],\s*['"]issues\.md/.test(buildAllSrc), '门禁校验 materials/review/issues.md 是否存在');
    assert(/materials['"],\s*['"]review['"],\s*['"]resolved\.md/.test(buildAllSrc), '门禁校验 materials/review/resolved.md 是否存在');
    assert(buildAllSrc.includes('--no-gate 临时跳过'), '门禁提示 --no-gate 逃生阀');
  } else {
    console.log('   ⏭️  该技能无流程/编辑审查门禁（v3.1），跳过 [0c] 断言');
  }
}

// 7i. init 模板化：PROJECT.md / version.json 由 *_template 生成，模板不落进项目（防覆盖回归）
console.log('🔍 [7i] init 模板化（PROJECT.md / version.json）');
{
  const projTplPath = path.join(TEMPLATES, 'project_template.md');
  assert(fs.existsSync(projTplPath), 'templates 含 project_template.md');
  assert(!fs.existsSync(path.join(TEMPLATES, 'PROJECT.md')), 'templates 不含 PROJECT.md（防覆盖项目文件）');
  assert(fs.existsSync(path.join(TEMPLATES, 'version_template.json')), 'templates 含 version_template.json');
  assert(!fs.existsSync(path.join(TEMPLATES, 'version.json')), 'templates 不含 version.json（防覆盖项目文件）');

  const projTplSrc = fs.readFileSync(projTplPath, 'utf-8');
  assert(projTplSrc.includes('{{书名}}'), 'project_template.md 含 {{书名}} 占位符');
  assert(projTplSrc.includes('## 九、对抗性审查设计'), 'project_template.md 含对抗性审查设计节');

  const initOut = path.join(WORK, 'init-smoke');
  const run = spawnSync(NODE_EXE, [path.join(ROOT, 'scripts', 'init-project.js'), initOut, '模板化冒烟'], { encoding: 'utf-8' });
  assert(run.status === 0, 'init 实际运行成功', (run.stdout || '') + (run.stderr || ''));
  const projMd = fs.existsSync(path.join(initOut, 'PROJECT.md'))
    ? fs.readFileSync(path.join(initOut, 'PROJECT.md'), 'utf-8') : '';
  assert(projMd.startsWith('# 模板化冒烟 — 项目计划'), 'PROJECT.md 书名由模板占位符替换', projMd.slice(0, 60));
  assert(projMd !== '' && !projMd.includes('{{书名}}'), 'PROJECT.md 无残留占位符');
  const vjPath = path.join(initOut, 'version.json');
  const vj = fs.existsSync(vjPath) ? JSON.parse(fs.readFileSync(vjPath, 'utf-8')) : {};
  assert(vj.title === '模板化冒烟' && vj.fileTitle === '' && vj.coverStyle === '', 'version.json 由模板生成且字段完整', JSON.stringify(vj));
  assert(typeof vj.lastUpdate === 'string' && vj.lastUpdate.length === 10, 'version.json lastUpdate 已注入日期', String(vj.lastUpdate));
  assert(!fs.existsSync(path.join(initOut, 'project_template.md')) && !fs.existsSync(path.join(initOut, 'version_template.json')), '模板文件不落进项目根');
  fs.rmSync(initOut, { recursive: true, force: true });
}

// 7j. 流程门禁（阶段信号 / 大纲对齐 / 核销覆盖 / 指纹）——纯机械，无 AI
console.log('🔍 [7j] 流程门禁（阶段信号 / 大纲对齐 / 核销覆盖 / 指纹）');
{
  const gatePath = path.join(TEMPLATES, 'lib', 'flow-gate.js');
  assert(fs.existsSync(gatePath), 'templates/lib/flow-gate.js 存在');
  const gate = require(gatePath);

  const proj = path.join(WORK, 'flowproj');
  const mk = (rel, txt) => {
    const p = path.join(proj, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt, 'utf-8');
  };
  const outline = (rows) =>
    '## 五、章节大纲\n\n| Part | 文件 | 标题 |\n|---|---|---|\n' + rows + '\n\n## 六、x\n';

  mk('fragments/part01-a.md', '# a\n');
  mk('fragments/part02-b.md', '# b\n');
  mk('PROJECT.md', outline('| 1 | part01-a.md | 一 |\n| 2 | part02-b.md | 二 |'));

  // stage.js 就位（复制真实脚本 + 共享库）
  const stageJs = path.join(proj, 'scripts', 'stage.js');
  fs.mkdirSync(path.dirname(stageJs), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'stage.js'), stageJs);
  fs.mkdirSync(path.join(proj, 'lib'), { recursive: true });
  fs.copyFileSync(gatePath, path.join(proj, 'lib', 'flow-gate.js'));
  const runStage = (...a) => spawnSync(NODE_EXE, [stageJs, ...a], { encoding: 'utf-8' });

  // 初始：无信号、无留痕 → 门禁失败
  let g = gate.validateFlowGate(proj);
  assert(!g.valid, '初始（无信号无留痕）→ 门禁失败');
  assert(g.errors.some(e => e.includes('workflow.json')), '缺 workflow.json 被判缺', JSON.stringify(g.errors));
  assert(g.errors.some(e => e.includes('issues.md')) && g.errors.some(e => e.includes('resolved.md')), '缺审查留痕被判缺');

  // 写作信号
  let sr = runStage('writing', '--done');
  assert(sr.status === 0 && fs.existsSync(path.join(proj, 'materials', 'workflow.json')), 'stage writing --done 写信号', sr.stdout + sr.stderr);

  // review：缺 issues.md 被拒
  sr = runStage('review', '--done');
  assert(sr.status !== 0, '缺 issues.md 时 review --done 被拒', sr.stdout);
  mk('materials/review/issues.md',
    '# 编辑审查意见清单\n\n## part01\n\n| # | 章节 | 级别 | 类型 | 原句 | 建议 |\n|---|---|---|---|---|---|\n' +
    '| 1 | 第一章 | 高 | 用词 | "x" | 改 |\n| 2 | 第二章 | 低 | 润色 | "y" | 改 |\n');
  sr = runStage('review', '--done');
  assert(sr.status === 0, 'issues.md 就绪后 review --done 通过', sr.stdout + sr.stderr);

  // revision：缺 resolved.md 被拒
  sr = runStage('revision', '--done');
  assert(sr.status !== 0, '缺 resolved.md 时 revision --done 被拒', sr.stdout);
  mk('materials/review/resolved.md', '# 审查意见核销\n\n| # | 处理 | 说明 |\n|---|---|---|\n| 2 | 已改 | y |\n');
  sr = runStage('revision', '--done');
  assert(sr.status === 0, 'resolved.md 就绪后 revision --done 通过', sr.stdout + sr.stderr);

  // 核销覆盖：高/中级 #1 未核销 → 失败
  g = gate.validateFlowGate(proj);
  assert(!g.valid && g.errors.some(e => e.includes('#1')), '高/中级未核销（#1）→ 门禁失败', JSON.stringify(g.errors));

  // 补齐核销 → 通过
  mk('materials/review/resolved.md', '# 审查意见核销\n\n| # | 处理 | 说明 |\n|---|---|---|\n| 1 | 已改 | x |\n| 2 | 已改 | y |\n');
  runStage('revision', '--done');
  g = gate.validateFlowGate(proj);
  assert(g.valid, '信号齐 + 核销覆盖 → 门禁通过', JSON.stringify(g.errors));

  // 指纹：修改完成后再动稿 → 失败
  mk('fragments/part01-a.md', '# a changed\n');
  g = gate.validateFlowGate(proj);
  assert(!g.valid && g.errors.some(e => e.includes('指纹')), '修改完成后又动稿 → 指纹不一致 → 门禁失败', JSON.stringify(g.errors));

  // 大纲 vs 片段：缺 part03 → 失败
  fs.rmSync(path.join(proj, 'materials', 'workflow.json'), { force: true });
  mk('PROJECT.md', outline('| 1 | part01-a.md | 一 |\n| 2 | part02-b.md | 二 |\n| 3 | part03-c.md | 三 |'));
  g = gate.validateFlowGate(proj);
  assert(g.errors.some(e => e.includes('part03')), '大纲列出但片段缺失（part03）→ 被判漏写', JSON.stringify(g.errors));

  // 重标 writing 作废其后信号（强制重审）
  runStage('writing', '--done');
  runStage('review', '--done');
  runStage('revision', '--done');
  const wfAll = JSON.parse(fs.readFileSync(path.join(proj, 'materials', 'workflow.json'), 'utf-8'));
  runStage('writing', '--done');
  const wfReset = JSON.parse(fs.readFileSync(path.join(proj, 'materials', 'workflow.json'), 'utf-8'));
  assert(wfAll.review && wfAll.revision && !wfReset.review && !wfReset.revision, '重标 writing 作废其后信号（强制重审）', JSON.stringify(wfReset));

  fs.rmSync(proj, { recursive: true, force: true });
}

// ===== 清理 =====
fs.rmSync(WORK, { recursive: true, force: true });

console.log('\n' + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
