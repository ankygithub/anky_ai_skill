#!/usr/bin/env node
/**
 * Book Markdown 生成脚本（源头聚合式）
 * ------------------------------------------------------------
 * 架构（MD-first）：直接聚合源头 fragments/*.md —— 源文件本来就是
 * 最好的 Markdown，零 HTML 解析、全量保真。
 * （历史教训：旧版从产物 HTML 逆向转换，导航面板/双目录漏进产物、
 *   组件被剥成纯文本堆、代码围栏 206 只剩 20——逆向转换路线已废弃。）
 *
 * 对 MD 专属降级（标准 MD 渲染器不认识转换器私有语法）：
 * - :::steps / :::compare 围栏 → 删标识符行，保留内部列表（语义自含）
 * - 内嵌 SVG → 文字说明（提取 <text>）在前 + xml 源码框在后
 * - 目录只生成一遍，带 GFM 锚点链接；聚合后轻量规范化
 *
 * 产物自检：无导航残渣 / 无裸 SVG / 无残留围栏 / 目录唯一 / 章节非零
 *
 * 用法：node build-md.js
 * 输出：output/{title}-v{version}.md
 */

const fs = require('fs');
const path = require('path');
const { scanFenceMask } = require(path.join(__dirname, 'lib', 'fence-scan.js'));

const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
const FRAGMENTS_DIR = path.join(__dirname, 'fragments');
const MD_FILE = path.join(__dirname, 'output',
  `${versionData.title}-v${versionData.version}.md`);

// ===== 解析 frontmatter（与 convert-md.js 同款规则：行首 --- 包裹） =====
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: content };
  const data = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([\w_-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: content.slice(match[0].length) };
}

// ===== GFM 锚点（GitHub/VSCode 规则：转小写、去标点、空格转连字符） =====
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

// ===== 组件围栏降级（MD 产物专有） =====
// :::steps/:::compare/::: 是转换器私有语法，HTML 链认识它，标准 MD 渲染器
// 里显示为裸文本（实际反馈：围栏标识符扎眼）。降级 = 删围栏行、保留内部列表：
// 列表项的加粗标题（不推荐❌/推荐✅/步骤标题）是规范强制写法，语义自含。
// 代码块内的 ::: 不是围栏（scanFenceMask 遮罩），不误删。
function degradeFences(body) {
  const lines = body.split('\n');
  const mask = scanFenceMask(lines);
  const out = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i] && /^:::\s*(steps|compare)?\s*$/.test(lines[i].trim())) {
      removed++;
      continue;
    }
    out.push(lines[i]);
  }
  return { body: out.join('\n'), removed };
}

// ===== SVG 降级（MD 产物专有） =====
// 标准 MD 渲染器对内嵌 SVG 支持不稳定（实际反馈：Typora 渲染成大片空白 + 标签残渣）。
// 策略（用户确认）：文字说明在前 + SVG 源码框跟后。
// - 文字说明：提取 <text> 节点（≥2 条时），作为"对下方 SVG 内容的简要描述"
// - SVG 源码框：xml 围栏，零信息丢失，读者可复制为 .svg 文件在浏览器查看
// - 两段均注明完整图形见 HTML 版；figcaption 图注并入说明头部
// - 提取不到文字的 SVG 只给源码框；永不出现裸 SVG
function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function extractSvgTexts(svgBlock) {
  const inner = svgBlock.replace(/<\/?tspan[^>]*>/g, '');
  const texts = [];
  for (const m of inner.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) {
    const t = decodeEntities(m[1]).trim();
    if (t) texts.push(t);
  }
  return texts;
}

function svgToMd(svgBlock, caption) {
  const texts = extractSvgTexts(svgBlock);
  const title = caption ? decodeEntities(caption).trim() : '';
  const head = title ? `图示 · ${title}` : '图示';
  const lines = [];
  if (texts.length >= 2) {
    lines.push(`> **${head}**（下方 SVG 源码的简要描述；完整图形见 HTML 版）`);
    for (const t of texts) lines.push(`> - ${t}`);
  } else {
    lines.push(`**${head}**（SVG 源码，保存为 .svg 文件可在浏览器查看图形；完整图形见 HTML 版）`);
  }
  lines.push('', '```xml', svgBlock.trim(), '```');
  return { md: lines.join('\n'), textified: texts.length >= 2 };
}

function degradeSvg(body, stats) {
  // 单遍替换：一个正则同时覆盖「figure 包裹」与「裸 SVG」两种形态。
  // 禁止分两遍替换——第一遍输出的源码框里含有 <svg 源码，第二遍会重复匹配
  // 导致 fence 错乱（实测事故：自检报"裸 SVG"失败）。
  return body.replace(
    /(?:<figure[^>]*>\s*)?(<svg[\s\S]*?<\/svg>)(?:\s*<figcaption[^>]*>([\s\S]*?)<\/figcaption>)?(?:\s*<\/figure>)?/gi,
    (m, svg, cap) => {
      const r = svgToMd(svg, cap || '');
      stats[r.textified ? 'textified' : 'boxed']++;
      return r.md;
    });
}

// ===== 从章节正文提取目录条目（## 第X章 / ### X.Y） =====
function extractToc(body) {
  const items = [];
  for (const m of body.matchAll(/^(##|###)\s+(.+)$/gm)) {
    const level = m[1] === '##' ? 2 : 3;
    const text = m[2].trim();
    items.push({ level, text, slug: slugify(text) });
  }
  return items;
}

// ===== 片段排序（与 build.js 同构：cover→正文→backpage，part 自然排序） =====
function naturalPartSort(a, b) {
  const numA = parseInt(a.match(/^part(\d+)/)?.[1] || '0', 10);
  const numB = parseInt(b.match(/^part(\d+)/)?.[1] || '0', 10);
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
}

// ===== 组装 =====
const mdFiles = fs.readdirSync(FRAGMENTS_DIR)
  .filter(f => f.endsWith('.md'))
  .sort((a, b) => {
    const order = { '00-cover.md': 0, '99-backpage.md': 999 };
    const oa = order[a] ?? 500;
    const ob = order[b] ?? 500;
    if (oa !== ob) return oa - ob;
    return naturalPartSort(a, b);
  });

if (mdFiles.length === 0) {
  console.error(`❌ fragments/ 下没有 Markdown 片段: ${FRAGMENTS_DIR}`);
  process.exit(1);
}
console.log(`📄 发现 ${mdFiles.length} 个 MD 片段`);

const sections = [];
const tocItems = [];
let chapterCount = 0;
let fencesRemoved = 0;
const svgStats = { textified: 0, boxed: 0 };

for (const file of mdFiles) {
  const raw = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
  const { data: fm, body } = parseFrontmatter(raw);

  if (file === '00-cover.md') {
    // 封面：frontmatter 五字段 + 正文 blockquote 兜底副标题
    const title = fm.title || versionData.title;
    const subtitle = fm.subtitle || (body.match(/^>\s*(.+)$/m)?.[1]?.trim()) || '';
    const author = fm.author || versionData.author || '';
    const version = fm.version || versionData.version;
    let s = `# ${title}\n`;
    if (subtitle) s += `\n> ${subtitle}\n`;
    const meta = [author, version ? `v${version.replace(/^v/, '')}` : ''].filter(Boolean).join(' · ');
    if (meta) s += `\n**${meta}**\n`;
    sections.push(s.trim());
    continue;
  }

  if (file === '99-backpage.md') {
    const title = fm.title || versionData.title;
    const author = fm.author || versionData.author || '';
    const version = fm.version || versionData.version;
    let s = `---\n\n## 文档结束\n\n${title} v${version.replace(/^v/, '')}`;
    if (author) s += `\n\n${author}`;
    sections.push(s.trim());
    continue;
  }

  // 正文章节：剥 frontmatter，正文原样保留（组件/表格全保真，SVG/围栏做降级）
  chapterCount++;
  const svgHandled = degradeSvg(body, svgStats);
  const degraded = degradeFences(svgHandled);
  fencesRemoved += degraded.removed;
  sections.push(degraded.body.trim());
  tocItems.push(...extractToc(degraded.body));
}

// ===== 目录段（只生成一遍，带 GFM 锚点） =====
let tocSection = '';
if (tocItems.length > 0) {
  tocSection = '## 目录\n\n'
    + tocItems.map(it => `${it.level === 2 ? '- ' : '  - '}[${it.text}](#${it.slug})`).join('\n');
}

// ===== 书级 frontmatter =====
const header = [
  '---',
  `title: ${versionData.title}`,
  `version: ${versionData.version}`,
  `date: ${versionData.lastUpdate || new Date().toISOString().slice(0, 10)}`,
  '---',
  '',
].join('\n');

// ===== 轻量规范化：行尾空白、3+ 连续空行压 1 =====
function normalize(text) {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

const parts = [header];
if (tocSection) parts.push(tocSection);
parts.push(...sections);
const output = normalize(parts.join('\n\n'));

// ===== 构建时自检（产物质量门） =====
const checks = {
  '无导航面板残渣（选择主题）': !output.includes('选择主题'),
  '无设置面板残渣（内容宽度）': !output.includes('内容宽度'),
  '无 HTML div 残留': !/<div[\s>]/i.test(output),
  '无残留围栏标识符（:::）': !/^:::/m.test(output),
  '目录只出现一次': (output.match(/^## 目录$/gm) || []).length === 1,
  '章节非零': chapterCount > 0,
};
const mdComponents = (output.match(/\[!(?:TIP|WARN|NOTE|IMPORTANT)\]/g) || []).length;

// SVG 只允许出现在源码框内（fence 内），裸 SVG 视为失败
const outLines = output.split('\n');
const outMask = scanFenceMask(outLines);
const nakedSvg = outLines.some((l, i) => !outMask[i] && /<svg[\s>]/i.test(l));

let ok = true;
console.log('\n🔍 产物自检:');
for (const [name, pass] of Object.entries(checks)) {
  console.log(`   ${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}
console.log(`   ${nakedSvg ? '❌' : '✅'} 无裸 SVG（全部在源码框内）`);
if (nakedSvg) ok = false;
console.log(`   ℹ️  组件语法保留: [!TIP]/[!WARN] 等 ×${mdComponents}（应与 fragments 源一致）`);
console.log(`   ℹ️  围栏降级: 删除 ::: 标识符 ${fencesRemoved} 行（列表内容原样保留）`);
console.log(`   ℹ️  SVG 降级: 文字版+源码框 ×${svgStats.textified}，仅源码框 ×${svgStats.boxed}`);

if (!ok) {
  console.error('\n❌ 自检未通过，产物已写出但标记为不可信');
}

fs.mkdirSync(path.dirname(MD_FILE), { recursive: true });
fs.writeFileSync(MD_FILE, output, 'utf-8');
console.log(`\n✅ Markdown generated: ${MD_FILE}`);
console.log(`   Size: ${(Buffer.byteLength(output, 'utf-8') / 1024).toFixed(1)} KB | 章节: ${chapterCount} | 目录条目: ${tocItems.length}`);
