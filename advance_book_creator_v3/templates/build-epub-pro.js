#!/usr/bin/env node
/**
 * 华书 v3 - EPUB 精排生成器 (build-epub-pro.js)
 *
 * 特性：
 * - HTML→XHTML 合规化转换
 * - 组件降级（compare/flow 纵向堆叠）
 * - highlight.js 静态代码高亮
 * - 本地图片自动打包（统一重命名 img-NNN，规避中文文件名兼容问题）
 * - 嵌套目录结构（toc.ncx + nav.xhtml）
 * - 多看精排扩展支持（全屏插图、脚注、内置字体）
 * - 独立 EPUB 专用 CSS
 * - 封面风格库选择 + Playwright 图文排版封面（1600×2400）
 * - 零依赖 ZIP 打包（Node 内置 zlib，mimetype 首条不压缩，符合 EPUB OCF 规范）
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// highlight.js 加载优先级：
//   1) 技能内嵌精简版 lib/hljs-bundle.js（19 种常用语言随技能分发，零安装、跨机器输出一致）
//   2) 环境中已安装的 highlight.js 包（语言更全时的兜底）
//   3) 都不可用 → 内置迷你高亮器（最终兜底）
let hljs = null;
try {
  hljs = require(path.join(__dirname, 'lib', 'hljs-bundle.js'));
  console.log('✅ 代码高亮: highlight.js 内嵌精简版（lib/hljs-bundle.js，19 语言）');
} catch (e1) {
  try {
    hljs = require('highlight.js');
    console.log('✅ 代码高亮: highlight.js（环境安装版）');
  } catch (e2) {
    console.log('ℹ️  代码高亮: 内置迷你高亮兜底（支持 python/bash/json/js；正常情况不会走到这里）');
  }
}

// ===== 配置 =====
const CONFIG = {
  fragmentsDir: './fragments',
  coverImagesDir: './cover-images',
  outputDir: './output',
  cssFile: './epub-styles.css',
  tempDir: './output/epub-temp',
};

const TEMPLATES_DIR = __dirname;
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');
const COVER_IMAGES_DIR = path.join(TEMPLATES_DIR, 'cover-images');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');
const EPUB_DIR = path.join(OUTPUT_DIR, 'epub-temp');
const CSS_SOURCE_PATH = path.join(TEMPLATES_DIR, 'epub-styles.css');

// ===== CLI 参数 =====
// --cover-style <风格名>：显式指定封面风格（优先级高于 version.json.coverStyle 和自动识别）
const CLI_STYLE = (() => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--cover-style');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : '';
})();

// ===== 封面风格解析（lib/cover-select.js 缺失时优雅降级，兼容未同步的老项目） =====
let resolveCover = null;
try {
  resolveCover = require(path.join(__dirname, 'lib', 'cover-select.js')).resolveCover;
} catch (e) {
  console.log('⚠️  lib/cover-select.js 不存在，封面降级为 cover-images/cover.* 直读');
}

// Playwright 仅用于封面图文排版渲染（可选，与 PDF 产物同依赖）
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    return null;
  }
}

// ===== 工具函数 =====

function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// ===== 阶段 1：输入处理 =====

function loadVersionInfo() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
  } catch (e) {
    console.error('❌ version.json 不存在');
    process.exit(1);
  }
}

function scanFragments() {
  let files = fs.readdirSync(FRAGMENTS_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => ({
      fileName: f,
      filePath: path.join(FRAGMENTS_DIR, f),
    }));

  // 排序：cover → toc → 正文 → backpage
  const ORDER = { '00-cover.html': 0, '01-toc.html': 1, '99-backpage.html': 999 };
  files.sort((a, b) => {
    const oa = ORDER[a.fileName] ?? 500;
    const ob = ORDER[b.fileName] ?? 500;
    if (oa !== ob) return oa - ob;
    // 自然排序 part01, part02, ...
    const na = parseInt(a.fileName.match(/\d+/)?.[0] || '0', 10);
    const nb = parseInt(b.fileName.match(/\d+/)?.[0] || '0', 10);
    return na - nb;
  });

  return files;
}

function findCoverImageFallback() {
  // 降级路径（lib/cover-select.js 缺失时）：仅识别 cover-images/cover.* 显式放置的封面，
  // 不再盲目扫描任意图片（旧逻辑会误取目录里第一张无关图片）
  if (fs.existsSync(COVER_IMAGES_DIR)) {
    const hit = fs.readdirSync(COVER_IMAGES_DIR).find(f =>
      f.toLowerCase().startsWith('cover') && /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (hit) return path.join(COVER_IMAGES_DIR, hit);
  }
  return null;
}

// ===== 封面图文排版（背景图 + 书名/副标题/作者 → 1600×2400 PNG） =====
const COVER_W = 1600;
const COVER_H = 2400;

// 每种风格一组排版参数：scrim 压暗层 / position 文案锚点 / 配色与字体族
const COVER_PRESETS = {
  科技: {
    scrim: 'linear-gradient(180deg, rgba(8,15,30,0) 40%, rgba(8,15,30,.72) 78%, rgba(8,15,30,.9) 100%)',
    position: 'left:160px; right:160px; bottom:150px;',
    align: 'left',
    color: '#F5F9FF',
    accent: '#7DD3FC',
    fontFamily: '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif',
    textShadow: '0 4px 24px rgba(56,189,248,.45)',
  },
  素雅: {
    scrim: 'linear-gradient(180deg, rgba(250,247,240,0) 55%, rgba(250,247,240,.55) 100%)',
    position: 'left:160px; right:160px; bottom:170px;',
    align: 'center',
    color: '#3F3F46',
    accent: '#B42318',
    fontFamily: '"Noto Serif SC","Source Han Serif SC","SimSun",serif',
    textShadow: 'none',
  },
  复古: {
    scrim: 'radial-gradient(ellipse at center, rgba(20,40,30,0) 45%, rgba(15,30,22,.55) 100%)',
    position: 'left:140px; right:140px; top:50%; transform:translateY(-50%);',
    align: 'center',
    color: '#E8C86A',
    accent: '#D4AF37',
    fontFamily: '"Noto Serif SC","Source Han Serif SC","SimSun",serif',
    textShadow: '0 2px 12px rgba(0,0,0,.55)',
  },
  书券: {
    scrim: 'linear-gradient(180deg, rgba(10,26,18,0) 45%, rgba(10,26,18,.5) 100%)',
    position: 'left:150px; right:150px; bottom:230px;',
    align: 'center',
    color: '#F1E9D2',
    accent: '#C9A227',
    fontFamily: '"Noto Serif SC","Source Han Serif SC","SimSun",serif',
    textShadow: '0 2px 10px rgba(0,0,0,.5)',
  },
  清新: {
    scrim: 'linear-gradient(180deg, rgba(255,252,245,0) 55%, rgba(120,72,30,.18) 100%)',
    position: 'left:170px; right:170px; bottom:170px;',
    align: 'left',
    color: '#6B3F1D',
    accent: '#E8A15D',
    fontFamily: '"Microsoft YaHei UI","PingFang SC",sans-serif',
    textShadow: '0 1px 6px rgba(255,255,255,.6)',
  },
  日系: {
    scrim: 'linear-gradient(180deg, rgba(255,255,255,0) 60%, rgba(90,110,105,.22) 100%)',
    position: 'left:170px; right:170px; bottom:190px;',
    align: 'center',
    color: '#41504B',
    accent: '#8FB6AD',
    fontFamily: '"Microsoft YaHei UI","PingFang SC",sans-serif',
    textShadow: '0 1px 8px rgba(255,255,255,.65)',
  },
};

function titleFontSize(title) {
  const len = (title || '').length;
  if (len <= 8) return 120;
  if (len <= 14) return 96;
  if (len <= 22) return 78;
  return 62;
}

// 背景图转 base64 data URI：
// setContent 页面的 origin 是 about:blank，Chromium 禁止其加载 file:// 子资源，
// data URI 是唯一不依赖临时文件且跨 origin 安全的内嵌方式
function imageToDataUri(imgPath) {
  const extMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  const mime = extMap[path.extname(imgPath).toLowerCase()] || 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(imgPath).toString('base64')}`;
}

async function renderTextCover(bgPath, meta, styleName) {
  const pw = loadPlaywright();
  if (!pw) {
    console.log('⚠️  Playwright 未安装，封面跳过文字排版（使用原图封面）');
    return null;
  }
  const preset = COVER_PRESETS[styleName] || COVER_PRESETS['素雅'];
  const title = meta.title || '';
  const subtitleHtml = meta.subtitle
    ? `<div class="book-subtitle">${escapeXml(meta.subtitle)}</div>`
    : '';
  const metaLine = [meta.author, meta.version ? `v${meta.version}` : '']
    .filter(Boolean).join(' · ');
  const metaHtml = metaLine ? `<div class="book-meta">${escapeXml(metaLine)}</div>` : '';
  const ruleMargin = preset.align === 'center' ? '36px auto' : '36px 0';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${COVER_W}px;height:${COVER_H}px;overflow:hidden}
.frame{position:relative;width:${COVER_W}px;height:${COVER_H}px;background:url("${imageToDataUri(bgPath)}") center/cover no-repeat}
.scrim{position:absolute;inset:0;background:${preset.scrim}}
.text-block{position:absolute;${preset.position}text-align:${preset.align};color:${preset.color}}
.book-title{font-family:${preset.fontFamily};font-weight:700;font-size:${titleFontSize(title)}px;line-height:1.3;letter-spacing:3px;text-shadow:${preset.textShadow}}
.accent-rule{width:130px;height:6px;border-radius:3px;background:${preset.accent};margin:${ruleMargin}}
.book-subtitle{margin-top:30px;font-size:46px;line-height:1.6;opacity:.92;letter-spacing:2px}
.book-meta{margin-top:70px;font-size:36px;opacity:.85;letter-spacing:8px}
</style></head><body>
<div class="frame"><div class="scrim"></div>
  <div class="text-block">
    <div class="book-title">${escapeXml(title)}</div>
    <div class="accent-rule"></div>
    ${subtitleHtml}${metaHtml}
  </div>
</div>
</body></html>`;

  // launch 放入 try：浏览器缺失时优雅退化为原图封面，而不是中断构建
  const launchAndShoot = async (launchOpts) => {
    const browser = await pw.chromium.launch(launchOpts);
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: COVER_W, height: COVER_H });
      await page.setContent(html, { waitUntil: 'networkidle' });
      ensureDir(COVER_IMAGES_DIR);
      const out = path.join(COVER_IMAGES_DIR, 'generated-cover.png');
      const frame = await page.$('.frame');
      await frame.screenshot({ path: out });
      return out;
    } finally {
      await browser.close().catch(() => {});
    }
  };

  try {
    return await launchAndShoot({});
  } catch (e) {
    // 新版 Playwright 无头模式默认走 headless-shell；只装了完整 Chromium 的机器用 channel 重试
    if (/Executable doesn't exist|failed to launch/i.test(String(e.message))) {
      try {
        return await launchAndShoot({ channel: 'chromium' });
      } catch (e2) {
        console.log(`⚠️  封面文字排版渲染失败（${String(e2.message).split('\n')[0]}），退化为原图封面`);
        return null;
      }
    }
    console.log(`⚠️  封面文字排版渲染失败（${String(e.message).split('\n')[0]}），退化为原图封面`);
    return null;
  }
}

// ===== 阶段 2：内容转换 =====

/**
 * HTML → XHTML 合规化
 */
function sanitizeHtmlToXhtml(html) {
  let result = html;

  // 1. 自闭合标签处理
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
  for (const tag of selfClosingTags) {
    // <tag> → <tag/>
    const regex = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    result = result.replace(regex, (match, attrs) => {
      // 如果已经有 / 结尾则跳过
      if (attrs.trim().endsWith('/')) return match;
      return `<${tag}${attrs}/>`;
    });
    // </tag> 自闭合标签不需要闭合标签，移除
    const closeRegex = new RegExp(`</${tag}>`, 'gi');
    result = result.replace(closeRegex, '');
  }

  // 2. 属性加引号（处理无引号的属性）
  result = result.replace(/<(\w+)([^>]*)>/g, (match, tagName, attrs) => {
    const processedAttrs = attrs.replace(/(\w+)=([^"'>\s]+)/g, '$1="$2"');
    return `<${tagName}${processedAttrs}>`;
  });

  // 3. HTML 实体转换
  result = result.replace(/&nbsp;/g, '&#160;');
  result = result.replace(/&copy;/g, '&#169;');
  result = result.replace(/&reg;/g, '&#174;');
  result = result.replace(/&trade;/g, '&#8482;');

  // 4. 移除 script 和 iframe
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  result = result.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 5. 移除事件属性
  result = result.replace(/\s(on\w+)="[^"]*"/gi, '');
  result = result.replace(/\s(on\w+)='[^']*'/gi, '');

  return result;
}

/**
 * 组件降级转换
 */
function downgradeComponents(html) {
  let result = html;

  // 1. compare-block → 添加纵向堆叠标记
  result = result.replace(/<div class="compare-block"/gi, '<div class="compare-block" data-epub-layout="stack"');

  // 2. compare（简单对比）→ 添加纵向堆叠标记
  result = result.replace(/<div class="compare"/gi, '<div class="compare" data-epub-layout="stack"');

  // 3. flow → 改为纵向流程
  result = result.replace(/<div class="flow">/gi, '<div class="flow flow-vertical">');
  result = result.replace(/<div class="flow-arrow">→<\/div>/gi, '<div class="flow-arrow">↓</div>');

  // 4. step-card → 简化结构（移除 hover 相关）
  result = result.replace(/\s+style="[^"]*transition[^"]*"/gi, '');

  // 5. 移除 data-theme 等 HTML 专用属性
  result = result.replace(/\s+data-theme="[^"]*"/gi, '');

  return result;
}

// ===== 内置迷你代码高亮（零依赖兜底） =====
// highlight.js 未安装时启用；只输出 epub-styles.css 已有颜色规则的 hljs-* 类。
// 规则一律用非捕获组（?:），保证 tokenize 的分组序号与规则一一对应。
const MINI_HL = {
  python: [
    { cls: 'comment',  re: '#[^\\n]*' },
    { cls: 'string',   re: '[fFrRbBuU]{0,2}(?:"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\')' },
    { cls: 'string',   re: '[fFrRbBuU]{0,2}(?:"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')' },
    { cls: 'literal',  re: '\\b(?:True|False|None)\\b' },
    { cls: 'keyword',  re: '\\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\\b' },
    { cls: 'built_in', re: '\\b(?:print|len|range|open|input|int|float|str|list|dict|set|tuple|sum|min|max|abs|round|sorted|reversed|enumerate|zip|map|filter|isinstance|type|super|bool|bytes|format|repr|any|all|iter|next|self|cls)\\b' },
    { cls: 'attr',     re: '@[A-Za-z_][\\w.]*' },
    { cls: 'number',   re: '\\b\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?\\b' },
    { cls: 'title',    re: '\\b[A-Za-z_]\\w*(?=\\s*\\()' },
  ],
  shell: [
    { cls: 'comment',  re: '#[^\\n]*' },
    { cls: 'string',   re: '"(?:\\\\.|[^"\\\\\\n])*"|\'[^\\n]*\'' },
    { cls: 'variable', re: '\\$\\{?[A-Za-z_][\\w]*\\}?' },
    { cls: 'built_in', re: '\\b(?:pip|pip3|python|python3|py|cd|ls|mkdir|rmdir|rm|cp|mv|echo|export|source|sudo|apt|apt-get|brew|git|docker|npm|npx|node|curl|wget|conda|winget|choco|code|dir|type|setx|where)\\b' },
    { cls: 'attr',     re: '(?:^|\\s)(?:--?[A-Za-z][\\w-]*)' },
    { cls: 'number',   re: '\\b\\d+(?:\\.\\d+)?\\b' },
  ],
  json: [
    { cls: 'attr',     re: '"(?:\\\\.|[^"\\\\])*"(?=\\s*:)' },
    { cls: 'string',   re: '"(?:\\\\.|[^"\\\\])*"' },
    { cls: 'literal',  re: '\\b(?:true|false|null)\\b' },
    { cls: 'number',   re: '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b' },
  ],
  javascript: [
    { cls: 'comment',  re: '//[^\\n]*|/\\*[\\s\\S]*?\\*/' },
    { cls: 'string',   re: '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'' },
    { cls: 'literal',  re: '\\b(?:true|false|null|undefined|this)\\b' },
    { cls: 'keyword',  re: '\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|yield|static|get|set)\\b' },
    { cls: 'number',   re: '\\b\\d+(?:\\.\\d+)?\\b' },
  ],
};

// language-xxx 类名 → 迷你高亮规则表（未列出的语言走纯转义）
const MINI_LANG_MAP = {
  py: 'python', python: 'python',
  bash: 'shell', sh: 'shell', shell: 'shell', zsh: 'shell', console: 'shell', terminal: 'shell',
  json: 'json',
  js: 'javascript', javascript: 'javascript', ts: 'javascript', typescript: 'javascript',
};

function miniHighlightCode(code, langKey) {
  const rules = MINI_HL[langKey];
  if (!rules || rules.length === 0) return escapeXml(code);

  // 每条规则用捕获组包裹（规则内部已全用非捕获组），
  // 这样 m[1..n] 的命中序号与 rules 下标一一对应，用于判定命中了哪条规则
  const master = new RegExp(rules.map(r => `(${r.re})`).join('|'), 'gm');
  const emit = (cls, text) => (cls ? `<span class="hljs-${cls}">${escapeXml(text)}</span>` : escapeXml(text));

  let out = '';
  let last = 0;
  let m;
  while ((m = master.exec(code)) !== null) {
    if (m[0].length === 0) { master.lastIndex++; continue; }
    if (m.index > last) out += escapeXml(code.slice(last, m.index));
    let cls = '';
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) { cls = rules[i - 1].cls; break; }
    }
    out += emit(cls, m[0]);
    last = m.index + m[0].length;
  }
  out += escapeXml(code.slice(last));
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#160;/g, ' ')
    .replace(/&#169;/g, '©')
    .replace(/&amp;/g, '&');
}

/**
 * 缩进/列对齐保护：把代码里的行首空白和 2+ 连续空格转成 NBSP（U+00A0）。
 * 部分阅读器（如 Reeden）的排版引擎强制空白塌缩（CSS white-space 压不住），
 * NBSP 是普通字符、不参与塌缩，可完整保留缩进与列对齐；
 * 在遵守 pre-wrap 的阅读器里，等宽字体下 NBSP 与空格等宽，零视觉差异。
 * 注意：JS 正则 \s 包含 NBSP，高亮分词不受影响，因此在高亮之前执行。
 */
function protectCodeWhitespace(code) {
  return code
    .replace(/\t/g, '    ')
    .replace(/^[ ]+/gm, m => '\u00A0'.repeat(m.length))
    .replace(/ {2,}/g, m => '\u00A0'.repeat(m.length));
}

/**
 * 代码高亮处理
 * 将 <pre><code class="language-xxx">...</code></pre> 中的代码进行高亮。
 * 优先 highlight.js（质量更高、语言更全）；未安装时使用内置迷你高亮器。
 * 两者输出统一的 hljs-* 类名，颜色统一由 epub-styles.css 提供
 */
function highlightCodeBlocks(html) {
  return html.replace(/<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (match, codeAttrs, code) => {
    // 提取语言
    const langMatch = codeAttrs.match(/class="[^"]*language-([\w-]+)[^"]*"/);
    const lang = langMatch ? langMatch[1].toLowerCase() : '';

    // 解码 HTML 实体（&amp; 必须最后替换，避免二次解码）
    // 随后把缩进/对齐空格转 NBSP，防强制塌缩型阅读器吞掉缩进
    const rawCode = protectCodeWhitespace(decodeEntities(code));

    let highlighted;
    if (hljs) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(rawCode, { language: lang }).value;
        } catch (e) {
          highlighted = escapeXml(rawCode);
        }
      } else {
        // 无语言或未知语言，尝试自动检测
        try {
          const detection = hljs.highlightAuto(rawCode);
          highlighted = detection.value;
        } catch (e) {
          highlighted = escapeXml(rawCode);
        }
      }
    } else {
      highlighted = miniHighlightCode(rawCode, MINI_LANG_MAP[lang] || null);
    }

    return `<pre><code${codeAttrs}>${highlighted}</code></pre>`;
  });
}

/**
 * 收集图片并返回映射表
 * 统一重命名为 img-NNN.ext（避免中文/特殊文件名在部分阅读器出问题），跨片段去重
 */
const IMAGE_NAME_MAP = new Map(); // absolutePath -> { absolutePath, fileName, epubPath }

function collectImages(html, fragmentDir) {
  const images = [];
  const imgRegex = /<img\b[^>]*src="([^"]+)"[^>]*\/?>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    // 跳过远程 URL 和 data URI
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      continue;
    }

    // 解析绝对路径
    let absolutePath;
    if (path.isAbsolute(src)) {
      absolutePath = src;
    } else {
      absolutePath = path.resolve(fragmentDir, src);
    }

    if (!fs.existsSync(absolutePath)) continue;

    if (!IMAGE_NAME_MAP.has(absolutePath)) {
      const ext = path.extname(absolutePath).toLowerCase() || '.jpg';
      const safeName = `img-${String(IMAGE_NAME_MAP.size + 1).padStart(3, '0')}${ext}`;
      IMAGE_NAME_MAP.set(absolutePath, {
        absolutePath,
        fileName: safeName,
        epubPath: `images/${safeName}`,
      });
    }
    images.push({ originalSrc: src, ...IMAGE_NAME_MAP.get(absolutePath) });
  }

  return images;
}

/**
 * 重写图片路径
 */
function rewriteImagePaths(html, images) {
  let result = html;
  for (const img of images) {
    // 构建相对于 xhtml 文件的路径（xhtml 在 OEBPS/ 下，图片在 OEBPS/images/ 下）
    const escapedSrc = img.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`src="${escapedSrc}"`, 'g');
    result = result.replace(regex, `src="${img.epubPath}"`);
  }
  return result;
}

/**
 * 提取标题用于目录
 */
function extractHeadings(html, pageName) {
  const headings = [];
  const h2Regex = /<h2\b[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi;
  const h3Regex = /<h3\b[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h3>/gi;

  let match;
  while ((match = h2Regex.exec(html)) !== null) {
    headings.push({
      level: 2,
      id: match[1],
      title: match[2].replace(/<[^>]+>/g, '').trim(),
      page: pageName,
    });
  }

  while ((match = h3Regex.exec(html)) !== null) {
    headings.push({
      level: 3,
      id: match[1],
      title: match[2].replace(/<[^>]+>/g, '').trim(),
      page: pageName,
    });
  }

  // 按在文档中出现的顺序排序
  headings.sort((a, b) => {
    const idxA = html.indexOf(`id="${a.id}"`);
    const idxB = html.indexOf(`id="${b.id}"`);
    return idxA - idxB;
  });

  return headings;
}

/**
 * 提取脚注
 */
function extractFootnotes(html) {
  const footnotes = [];
  const fnRegex = /<a\b[^>]*class="duokan-footnote"[^>]*href="#([^"]*)"[^>]*>[\s\S]*?<\/a>/gi;
  let match;
  while ((match = fnRegex.exec(html)) !== null) {
    footnotes.push(match[1]);
  }
  return footnotes;
}

// ===== 阶段 3：输出组装 =====

function generateMimetype() {
  fs.writeFileSync(path.join(EPUB_DIR, 'mimetype'), 'application/epub+zip');
}

function generateContainerXml() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  ensureDir(path.join(EPUB_DIR, 'META-INF'));
  fs.writeFileSync(path.join(EPUB_DIR, 'META-INF', 'container.xml'), xml);
}

function generateContentOpf(items, metadata, images, coverImageInfo) {
  const manifestItems = items.map(item =>
    `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${item.properties ? ` properties="${item.properties}"` : ''}/>`
  ).join('\n');

  // 封面图片需要特殊处理：id 固定为 cover-image，并标记 properties
  const imageItems = images.map((img, idx) => {
    const isCover = coverImageInfo && img.epubPath === coverImageInfo.epubPath;
    const imgId = isCover ? 'cover-image' : `img-${idx}`;
    const props = isCover ? ' properties="cover-image"' : '';
    return `    <item id="${imgId}" href="${img.epubPath}" media-type="${img.mediaType || 'image/jpeg'}"${props}/>`;
  }).join('\n');

  const spineItems = items.map(item => {
    let props = '';
    if (item.spineProperties) {
      props = ` properties="${item.spineProperties}"`;
    }
    return `    <itemref idref="${item.id}"${props}/>`;
  }).join('\n');

  const coverMeta = coverImageInfo
    ? '    <meta name="cover" content="cover-image"/>\n'
    : '';

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author || 'Unknown')}</dc:creator>
    <dc:language>${metadata.language || 'zh-CN'}</dc:language>
    <dc:identifier id="bookid">urn:uuid:${metadata.uuid}</dc:identifier>
    <dc:date>${metadata.date}</dc:date>
    <meta property="dcterms:modified">${metadata.modified}</meta>
${coverMeta}  </metadata>
  <manifest>
${manifestItems}
${imageItems}
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;

  ensureDir(path.join(EPUB_DIR, 'OEBPS'));
  fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'content.opf'), opf);
}

function generateTocNcx(tocItems, metadata) {
  function buildNavPoints(items, startIndex) {
    let result = '';
    let i = 0;
    let playOrder = startIndex;

    while (i < items.length) {
      const item = items[i];
      const children = [];
      let j = i + 1;
      while (j < items.length && items[j].level > item.level) {
        if (items[j].level === item.level + 1) {
          children.push(items[j]);
        }
        j++;
      }

      const childNavPoints = children.length > 0
        ? '\n' + buildNavPoints(children, playOrder + 1)
        : '';

      result += `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel>
        <text>${escapeXml(item.title)}</text>
      </navLabel>
      <content src="${item.page}#${item.id}"/>${childNavPoints}
    </navPoint>\n`;

      playOrder += 1 + children.length;
      i = j;
    }

    return result;
  }

  // 只取顶层（level 2）作为根 navPoint，子级嵌套
  const topLevel = tocItems.filter(t => t.level === 2);

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${metadata.uuid}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>
${buildNavPoints(tocItems, 1)}  </navMap>
</ncx>`;

  fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'toc.ncx'), ncx);
}

function generateNavXhtml(tocItems, metadata) {
  function buildTocList(items) {
    let result = '<ol>\n';
    let i = 0;

    while (i < items.length) {
      const item = items[i];
      const children = [];
      let j = i + 1;
      while (j < items.length && items[j].level > item.level) {
        if (items[j].level === item.level + 1) {
          children.push(items[j]);
        }
        j++;
      }

      const indent = item.level === 3 ? ' style="margin-left: 20px;"' : '';
      result += `      <li${indent}><a href="${item.page}#${item.id}">${escapeXml(item.title)}</a>`;

      if (children.length > 0) {
        result += '\n' + buildTocList(children).replace(/^/gm, '    ');
      }

      result += '</li>\n';
      i = j;
    }

    result += '</ol>';
    return result;
  }

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>目录 - ${escapeXml(metadata.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
${buildTocList(tocItems)}
  </nav>
</body>
</html>`;

  fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'nav.xhtml'), nav);
}

function copyImages(images) {
  if (images.length === 0) return;
  const imgDir = path.join(EPUB_DIR, 'OEBPS', 'images');
  ensureDir(imgDir);

  for (const img of images) {
    // 跳过没有 absolutePath 的图片（如封面图片已单独复制）
    if (!img.absolutePath) continue;
    const dest = path.join(imgDir, img.fileName);
    fs.copyFileSync(img.absolutePath, dest);
  }
}

function copyCoverImage(coverImagePath) {
  if (!coverImagePath) return null;
  const imgDir = path.join(EPUB_DIR, 'OEBPS', 'images');
  ensureDir(imgDir);
  const fileName = `cover${path.extname(coverImagePath)}`;
  const dest = path.join(imgDir, fileName);
  fs.copyFileSync(coverImagePath, dest);
  return {
    fileName,
    epubPath: `images/${fileName}`,
    mediaType: getImageMediaType(fileName),
  };
}

function getImageMediaType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'image/jpeg';
}

function copyCss() {
  const dest = path.join(EPUB_DIR, 'OEBPS', 'style.css');
  if (fs.existsSync(CSS_SOURCE_PATH)) {
    fs.copyFileSync(CSS_SOURCE_PATH, dest);
  } else {
    // 如果本地没有，写入内联基础样式
    fs.writeFileSync(dest, generateFallbackCss());
  }
}

function generateFallbackCss() {
  return `/* EPUB 基础样式（fallback） */
body{font-family:"DK-SONGTI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.8;color:#333;margin:0;padding:20px}
h1{font-size:2em;font-weight:700;text-align:center!important}h2{font-size:1.6em;font-weight:700;color:#92400E;text-align:center!important}h3{font-size:1.3em;font-weight:600;text-align:left!important;font-family:"DK-HEITI","Microsoft YaHei",sans-serif}h4,h5,h6{font-weight:600;text-align:left!important;font-family:"DK-HEITI","Microsoft YaHei",sans-serif}
p{margin-bottom:1em;text-align:justify}
blockquote{margin:1.5em 0;padding:1em 1.5em;background:#f9f9f9;border-left:4px solid #92400E;font-family:"DK-KAITI","Noto Serif SC","KaiTi",serif}
table{width:100%;border-collapse:collapse;margin:1.5em 0;border:1px solid #ddd}th,td{padding:12px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#1F2126;color:#fff;font-weight:600;letter-spacing:1px;border-bottom:2px solid #B42318;border-right:1px solid #3A3D45}tr:nth-child(even){background:#faf9f6}
code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:"DK-CODE","JetBrains Mono","Consolas","Microsoft YaHei",monospace;font-size:0.9em}
pre{background:#f8f8f8;padding:16px;border-radius:4px;margin:1.5em 0;white-space:pre-wrap!important;overflow-wrap:break-word}
pre code{background:none;padding:0;display:block;white-space:pre-wrap!important;overflow-wrap:break-word}
ul,ol{margin:1em 0;padding-left:2em}li{margin-bottom:0.5em}
img{max-width:100%;height:auto}
.callout{margin:1.5em 0;padding:16px 20px;border-left:4px solid #92400E;background:#fdfcfa}
.callout-title{font-family:"DK-HEITI","Microsoft YaHei",sans-serif;font-weight:700;margin-bottom:0.5em}
.duokan-footnote{text-decoration:none;color:#92400E;font-size:0.75em}.footnotes{margin-top:2em;font-size:0.85em;color:#555}.footnotes li{text-indent:0}.fn-back{text-decoration:none;color:#92400E;margin-left:4px}
.callout-tip{border-left-color:#10b981;background:#f0fdf4}.callout-warn{border-left-color:#f59e0b;background:#fffbeb}
.callout-violet{border-left-color:#8b5cf6;background:#faf5ff}
.compare-block[data-epub-layout="stack"]{display:block}.compare-block[data-epub-layout="stack"] .compare-item{margin-bottom:16px}
.flow-vertical{display:block;text-align:center}.flow-vertical .flow-step{display:inline-block;margin:8px 0}.flow-vertical .flow-arrow{display:block;margin:4px 0}
.step-card{margin:20px 0;padding:20px;background:#f9f9f9;border-radius:8px;border-left:4px solid #92400E}
.step-header{margin:0 0 12px}.step-phase{display:inline-block;padding:3px 12px;background:#92400E;color:#FFFFFF;border-radius:4px;font-size:0.85em}.step-phase-num{font-weight:700;margin-right:6px}.step-phase-label{letter-spacing:1px}.step-title{font-weight:700;font-size:1.1em;margin:10px 0 6px;color:#333}
.tag-core{display:inline;background:#fef3c7;padding:2px 8px;border-radius:4px;font-weight:600;color:#92400E}
.file-tree{background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:16px 20px;font-family:"DK-CODE","JetBrains Mono",monospace;font-size:0.9em;line-height:2}
.cover{text-align:center;padding:100px 40px}.cover h1{font-size:2.5em;border:none;margin-bottom:20px}
.hljs-keyword{color:#d73a49;font-weight:600}.hljs-string{color:#032f62}.hljs-number{color:#005cc5}.hljs-comment{color:#6a737d}
`;
}

// ===== ZIP 打包（零依赖：Node 内置 zlib 实现） =====
// EPUB OCF 规范要求：mimetype 必须是 ZIP 第一条目、不压缩、无额外字段。
// 旧实现依赖 archiver 且误用其未公开 API（new archiver.ZipArchive），
// 任何环境下都会打包失败；此处改为纯 Node 实现，跨平台零依赖。

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function listFilesRecursive(dir, prefix) {
  const files = [];
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const zipPath = prefix ? `${prefix}/${item}` : item;
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...listFilesRecursive(fullPath, zipPath));
    } else {
      files.push({ fullPath, zipPath });
    }
  }
  return files;
}

/**
 * 构建 ZIP Buffer
 * @param {Array<{name:string, data:Buffer, store:boolean}>} entries
 */
function buildZipBuffer(entries) {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    let method = 0;
    let payload = e.data;
    if (!e.store && e.data.length > 0) {
      const deflated = zlib.deflateRawSync(e.data, { level: 9 });
      // 压缩无收益时不压缩，节省解压开销
      if (deflated.length < e.data.length) {
        method = 8;
        payload = deflated;
      }
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);  // 本地文件头签名
    local.writeUInt16LE(20, 4);          // 解压所需版本
    local.writeUInt16LE(0x0800, 6);      // 标志位：UTF-8 文件名
    local.writeUInt16LE(method, 8);      // 0=store 8=deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // 额外字段长度必须为 0（mimetype 规范）
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    central.writeUInt16LE(20, 4);         // 创建版本
    central.writeUInt16LE(20, 6);         // 解压版本
    central.writeUInt16LE(0x0800, 8);     // 标志位：UTF-8 文件名
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);    // 本地头偏移
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);    // EOCD 签名
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);       // 中央目录起始偏移

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function packageEpub(outputPath) {
  try {
    const files = listFilesRecursive(EPUB_DIR, '');
    const entries = [];

    // 1. mimetype 必须是第一条且不压缩（EPUB OCF 规范）
    entries.push({
      name: 'mimetype',
      data: fs.readFileSync(path.join(EPUB_DIR, 'mimetype')),
      store: true,
    });

    // 2. 其余文件 deflate 压缩，保留目录结构
    for (const f of files) {
      if (f.zipPath === 'mimetype') continue;
      entries.push({
        name: f.zipPath,
        data: fs.readFileSync(f.fullPath),
        store: false,
      });
    }

    fs.writeFileSync(outputPath, buildZipBuffer(entries));
    return Promise.resolve(true);
  } catch (e) {
    console.error('❌ EPUB 打包失败:', e.message);
    return Promise.resolve(false);
  }
}

// ===== 主流程 =====

async function main() {
  console.log('📚 EPUB 精排生成器启动...\n');

  // 1. 读取版本信息
  const versionData = loadVersionInfo();
  const { title, subtitle, author, version } = versionData;
  console.log(`📖 书名: ${title}`);
  console.log(`👤 作者: ${author || '未指定'}`);
  console.log(`🔖 版本: ${version}\n`);

  // 2. 扫描片段
  const fragments = scanFragments();
  console.log(`📄 发现 ${fragments.length} 个 HTML 片段`);

  // 3. 清理并创建临时目录
  cleanDir(EPUB_DIR);
  ensureDir(path.join(EPUB_DIR, 'META-INF'));
  ensureDir(path.join(EPUB_DIR, 'OEBPS'));

  // 4. 解析并处理封面（风格库选择 → Playwright 图文排版 → 打包）
  let coverImagePath = null;
  let coverStyleName = '';
  if (resolveCover) {
    const cover = resolveCover({
      projectDir: TEMPLATES_DIR,
      title,
      subtitle,
      styleHint: CLI_STYLE,
      coverStyle: versionData.coverStyle,
    });
    coverImagePath = cover.portraitPath;
    coverStyleName = cover.style;
    console.log(`🎨 封面风格: ${cover.style}（来源: ${cover.source}）`);
  } else {
    coverImagePath = findCoverImageFallback();
  }

  let coverImageInfo = null;
  if (coverImagePath) {
    const rendered = await renderTextCover(
      coverImagePath,
      { title, subtitle, author, version },
      coverStyleName
    );
    if (rendered) {
      coverImagePath = rendered;
      console.log(`🖼️  封面: 图文排版封面 generated-cover.png（风格 ${coverStyleName}）`);
    } else {
      console.log(`🖼️  封面: 原图封面 ${path.basename(coverImagePath)}`);
    }
    coverImageInfo = copyCoverImage(coverImagePath);
  }

  // 5. 处理内容文件
  const contentItems = [];
  const allTocItems = [];
  const allImages = coverImageInfo ? [coverImageInfo] : [];
  let contentPartNum = 0;

  for (let i = 0; i < fragments.length; i++) {
    const { fileName, filePath } = fragments[i];
    let html = fs.readFileSync(filePath, 'utf-8');

    // Mustache 占位符替换
    html = html
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{SUBTITLE\}\}/g, subtitle || '')
      .replace(/\{\{AUTHOR\}\}/g, author || '')
      .replace(/\{\{VERSION\}\}/g, version || '');

    // 确定页面信息
    let pageName, pageType, pageTitle = '';
    let spineProperties = '';

    if (fileName === '00-cover.html') {
      pageName = 'cover.xhtml';
      pageType = 'cover';
      pageTitle = title;
      if (coverImageInfo) {
        spineProperties = 'duokan-page-fullscreen';
      }
    } else if (fileName === '01-toc.html') {
      pageName = 'toc.xhtml';
      pageType = 'toc';
      pageTitle = '目录';
    } else if (fileName === '99-backpage.html') {
      pageName = 'backpage.xhtml';
      pageType = 'backpage';
      pageTitle = '后记';
    } else {
      contentPartNum++;
      pageName = `part${String(contentPartNum).padStart(2, '0')}.xhtml`;
      pageType = 'content';
      const titleMatch = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/);
      if (titleMatch) {
        pageTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }

    // 收集图片
    const fragmentImages = collectImages(html, path.dirname(filePath));
    allImages.push(...fragmentImages);

    // 重写图片路径
    html = rewriteImagePaths(html, fragmentImages);

    // 组件降级
    html = downgradeComponents(html);

    // 代码高亮
    html = highlightCodeBlocks(html);

    // HTML → XHTML 合规化
    html = sanitizeHtmlToXhtml(html);

    // 提取标题
    const headings = extractHeadings(html, pageName);
    allTocItems.push(...headings);

    // 提取脚注
    const footnotes = extractFootnotes(html);
    if (footnotes.length > 0) {
      console.log(`   📝 ${fileName} 发现 ${footnotes.length} 个脚注`);
    }

    // 构建 XHTML
    let bodyContent = html;

    // 如果是封面且有图片，替换为全屏图片封面（内联样式确保各阅读器下无内边距）
    if (pageType === 'cover' && coverImageInfo) {
      bodyContent = `<div style="padding:0;margin:0">
  <img src="${coverImageInfo.epubPath}" alt="${escapeXml(title)}" style="width:100%;height:auto;display:block"/>
</div>`;
    }

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(pageTitle || title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${bodyContent}
</body>
</html>`;

    fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', pageName), xhtml);

    contentItems.push({
      id: `item-${i}`,
      href: pageName,
      mediaType: 'application/xhtml+xml',
      title: pageTitle,
      spineProperties,
    });

    console.log(`   ✅ ${pageName} (${fileName})`);
  }

  // 6. 复制 CSS
  copyCss();
  console.log('\n🎨 CSS 样式已复制');

  // 7. 复制图片
  copyImages(allImages);
  if (allImages.length > 0) {
    console.log(`🖼️  已打包 ${allImages.length} 张图片`);
  }

  // 8. 生成元数据
  const uuid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  const metadata = {
    title,
    author: author || '',
    language: 'zh-CN',
    uuid,
    date: now.toISOString().split('T')[0],
    modified: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };

  // 9. 生成 OPF、NCX、Nav
  generateContentOpf(contentItems, metadata, allImages, coverImageInfo);
  generateTocNcx(allTocItems, metadata);
  generateNavXhtml(allTocItems, metadata);
  console.log('📑 目录与导航已生成');

  // 10. 生成 mimetype 和 container.xml
  generateMimetype();
  generateContainerXml();

  // 11. 打包 EPUB
  const epubFileName = `${title}-v${version}.epub`;
  const epubOutputPath = path.join(OUTPUT_DIR, epubFileName);

  console.log('\n📦 正在打包 EPUB...');
  const success = await packageEpub(epubOutputPath);

  if (success) {
    // 清理临时目录
    fs.rmSync(EPUB_DIR, { recursive: true });

    const stats = fs.statSync(epubOutputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\n✅ EPUB 生成成功!`);
    console.log(`   文件: ${epubOutputPath}`);
    console.log(`   大小: ${sizeMB} MB`);
    console.log(`   章节: ${contentPartNum}`);
    console.log(`   目录项: ${allTocItems.length}`);
    console.log(`   图片: ${allImages.length}`);
    if (coverImageInfo) {
      console.log(`   封面: ${coverImagePath === path.join(COVER_IMAGES_DIR, 'generated-cover.png') ? '图文排版' : '原图'}封面 (${coverImageInfo.fileName}${coverStyleName ? `，风格 ${coverStyleName}` : ''})`);
    }
    if (hljs) {
      console.log(`   代码高亮: 已启用 (highlight.js)`);
    }
  } else {
    console.log('\n⚠️  临时文件保留在:', EPUB_DIR);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
