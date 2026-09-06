#!/usr/bin/env node
/**
 * 华书 v3 - EPUB 精排生成器 (build-epub-pro.js)
 *
 * 特性：
 * - HTML→XHTML 合规化转换
 * - 组件降级（compare/flow 纵向堆叠）
 * - highlight.js 静态代码高亮
 * - 本地图片自动打包
 * - 嵌套目录结构（toc.ncx + nav.xhtml）
 * - 多看精排扩展支持（全屏插图、脚注、内置字体）
 * - 独立 EPUB 专用 CSS
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 尝试加载 highlight.js（可选依赖）
let hljs = null;
try {
  hljs = require('highlight.js');
} catch (e) {
  console.log('⚠️  highlight.js 未安装，代码高亮将跳过');
  console.log('    安装命令: npm install highlight.js');
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

function findCoverImage() {
  // 优先级：cover-images/cover.jpg → cover-images/*.jpg → null
  if (fs.existsSync(COVER_IMAGES_DIR)) {
    const images = fs.readdirSync(COVER_IMAGES_DIR)
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .sort();
    if (images.length > 0) {
      return path.join(COVER_IMAGES_DIR, images[0]);
    }
  }
  return null;
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

/**
 * 代码高亮处理
 * 将 <pre><code class="language-xxx">...</code></pre> 中的代码进行高亮
 */
function highlightCodeBlocks(html) {
  if (!hljs) return html;

  return html.replace(/<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (match, codeAttrs, code) => {
    // 提取语言
    const langMatch = codeAttrs.match(/class="[^"]*language-(\w+)[^"]*"/);
    const lang = langMatch ? langMatch[1] : '';

    // 解码 HTML 实体
    let rawCode = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#160;/g, ' ')
      .replace(/&#169;/g, '©');

    let highlighted;
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

    return `<pre><code${codeAttrs}>${highlighted}</code></pre>`;
  });
}

/**
 * 收集图片并返回映射表
 */
function collectImages(html, fragmentDir) {
  const images = [];
  const imgRegex = /<img\b[^>]*src="([^"]+)"[^>]*\/>/gi;
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

    if (fs.existsSync(absolutePath)) {
      const fileName = path.basename(absolutePath);
      images.push({
        originalSrc: src,
        absolutePath,
        fileName,
        epubPath: `images/${fileName}`,
      });
    }
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
    const relativePath = `images/${img.fileName}`;
    const escapedSrc = img.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`src="${escapedSrc}"`, 'g');
    result = result.replace(regex, `src="${relativePath}"`);
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
h1{font-size:2em;font-weight:700}h2{font-size:1.6em;font-weight:700;color:#92400E}h3{font-size:1.3em;font-weight:600}
p{margin-bottom:1em;text-align:justify}
blockquote{margin:1.5em 0;padding:1em 1.5em;background:#f9f9f9;border-left:4px solid #92400E}
table{width:100%;border-collapse:collapse;margin:1.5em 0;border:1px solid #ddd}th,td{padding:12px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#1F2126;color:#fff;font-weight:600;letter-spacing:1px;border-bottom:2px solid #B42318;border-right:1px solid #3A3D45}tr:nth-child(even){background:#faf9f6}
code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:"DK-CODE","JetBrains Mono",monospace;font-size:0.9em}
pre{background:#f8f8f8;padding:16px;border-radius:4px;overflow-x:auto;margin:1.5em 0}
pre code{background:none;padding:0}
ul,ol{margin:1em 0;padding-left:2em}li{margin-bottom:0.5em}
img{max-width:100%;height:auto}
.callout{margin:1.5em 0;padding:16px 20px;border-left:4px solid #92400E;background:#fdfcfa}
.callout-tip{border-left-color:#10b981;background:#f0fdf4}.callout-warn{border-left-color:#f59e0b;background:#fffbeb}
.callout-violet{border-left-color:#8b5cf6;background:#faf5ff}
.compare-block[data-epub-layout="stack"]{display:block}.compare-block[data-epub-layout="stack"] .compare-item{margin-bottom:16px}
.flow-vertical{display:block;text-align:center}.flow-vertical .flow-step{display:inline-block;margin:8px 0}.flow-vertical .flow-arrow{display:block;margin:4px 0}
.step-card{margin:20px 0;padding:20px;background:#f9f9f9;border-radius:8px;border-left:4px solid #92400E}
.tag-core{display:inline;background:#fef3c7;padding:2px 8px;border-radius:4px;font-weight:600;color:#92400E}
.file-tree{background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:16px 20px;font-family:"DK-CODE","JetBrains Mono",monospace;font-size:0.9em;line-height:2}
.cover{text-align:center;padding:100px 40px}.cover h1{font-size:2.5em;border:none;margin-bottom:20px}
.hljs-keyword{color:#d73a49;font-weight:600}.hljs-string{color:#032f62}.hljs-number{color:#005cc5}.hljs-comment{color:#6a737d;font-style:italic}
`;
}

function packageEpub(outputPath) {
  try {
    // 使用 Node.js 原生方式打包，避免 PowerShell 路径问题
    const archiver = require('archiver');
    const output = fs.createWriteStream(outputPath);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(true));
      archive.on('error', (err) => reject(err));
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('⚠️  打包警告:', err.message);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      // 1. 先写入 mimetype（无压缩）
      const mimetypePath = path.join(EPUB_DIR, 'mimetype');
      archive.append(fs.createReadStream(mimetypePath), {
        name: 'mimetype',
        store: true // 无压缩
      });

      // 2. 递归添加其他文件，保留目录结构
      function addDirectory(dirPath, zipPrefix) {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const zipPath = zipPrefix ? `${zipPrefix}/${item}` : item;
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            addDirectory(fullPath, zipPath);
          } else if (item !== 'mimetype') {
            archive.file(fullPath, { name: zipPath });
          }
        }
      }

      addDirectory(EPUB_DIR, '');
      archive.finalize();
    });
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

  // 4. 处理封面图片
  const coverImagePath = findCoverImage();
  let coverImageInfo = null;
  if (coverImagePath) {
    coverImageInfo = copyCoverImage(coverImagePath);
    console.log(`🖼️  封面图片: ${path.basename(coverImagePath)}`);
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

    // 如果是封面且有图片，替换为图片封面
    if (pageType === 'cover' && coverImageInfo) {
      bodyContent = `<div class="cover">
  <img src="${coverImageInfo.epubPath}" alt="${escapeXml(title)}" style="max-width:100%;height:auto;"/>
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
      console.log(`   封面: 图片封面 (${coverImageInfo.fileName})`);
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
