#!/usr/bin/env node
/**
 * 华书 v3 - EPUB生成器
 * 将多文件手册转换为EPUB格式
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATES_DIR = __dirname;
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');
const READER_DIR = path.join(OUTPUT_DIR, 'reader');
const EPUB_DIR = path.join(OUTPUT_DIR, 'epub-temp');

// ===== 读取版本信息 =====
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ version.json 不存在');
  process.exit(1);
}
const { title, subtitle, author, version } = versionData;

// ===== 清理并创建临时目录 =====
if (fs.existsSync(EPUB_DIR)) {
  fs.rmSync(EPUB_DIR, { recursive: true });
}
fs.mkdirSync(EPUB_DIR, { recursive: true });
fs.mkdirSync(path.join(EPUB_DIR, 'META-INF'), { recursive: true });
fs.mkdirSync(path.join(EPUB_DIR, 'OEBPS'), { recursive: true });
// 注意：内容文件直接放在OEBPS目录下，不使用content子目录

// ===== 读取片段文件（强制排序） =====
let fragmentFiles = fs.readdirSync(FRAGMENTS_DIR)
  .filter(f => f.endsWith('.html'));

const FRAG_ORDER = {
  '00-cover.html': 0,
  '01-toc.html': 1,
  '99-backpage.html': 999,
};

function naturalPartSort(a, b) {
  const numA = parseInt(a.match(/^part(\d+)/)?.[1] || '0', 10);
  const numB = parseInt(b.match(/^part(\d+)/)?.[1] || '0', 10);
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
}

fragmentFiles.sort((a, b) => {
  const oa = FRAG_ORDER[a] ?? 500;
  const ob = FRAG_ORDER[b] ?? 500;
  if (oa !== ob) return oa - ob;
  return naturalPartSort(a, b);
});

console.log(`📄 发现 ${fragmentFiles.length} 个片段文件`);

// ===== 生成mimetype =====
fs.writeFileSync(path.join(EPUB_DIR, 'mimetype'), 'application/epub+zip');

// ===== 生成container.xml =====
const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
fs.writeFileSync(path.join(EPUB_DIR, 'META-INF', 'container.xml'), containerXml);

// ===== 处理内容文件 =====
let contentItems = [];
let tocItems = [];
let contentPartNum = 0;

for (let i = 0; i < fragmentFiles.length; i++) {
  const file = fragmentFiles[i];
  const content = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
  
  let pageName;
  let pageType;
  let pageTitle = '';
  
  if (file === '00-cover.html') {
    pageName = 'cover.xhtml';
    pageType = 'cover';
    pageTitle = title;
  } else if (file === '01-toc.html') {
    pageName = 'toc.xhtml';
    pageType = 'toc';
    pageTitle = '目录';
  } else if (file === '99-backpage.html') {
    pageName = 'backpage.xhtml';
    pageType = 'backpage';
    pageTitle = '后记';
  } else {
    contentPartNum++;
    pageName = `part${String(contentPartNum).padStart(2, '0')}.xhtml`;
    pageType = 'content';
    // 从内容中提取标题
    const titleMatch = content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/);
    if (titleMatch) {
      pageTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  
  // 提取所有标题用于目录
  const headingMatches = content.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi);
  for (const m of headingMatches) {
    const level = parseInt(m[1]);
    const id = m[2];
    const titleText = m[3].replace(/<[^>]+>/g, '').trim();
    tocItems.push({
      page: pageName,
      anchor: id,
      title: titleText,
      level: level
    });
  }
  
  // 转换HTML为EPUB兼容格式
  let processedContent = content
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{SUBTITLE\}\}/g, subtitle)
    .replace(/\{\{AUTHOR\}\}/g, author)
    .replace(/\{\{VERSION\}\}/g, version)
    // 移除script标签
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 移除iframe
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    // 移除导航按钮相关的HTML
    .replace(/<div class="page-nav"[^>]*>[\s\S]*?<\/div>/gi, '');
  
  // 构建完整的XHTML文件
  const xhtmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${pageTitle || title}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body>
${processedContent}
</body>
</html>`;
  
  fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', pageName), xhtmlContent);

  contentItems.push({
    id: `item-${i}`,
    href: `${pageName}`,
    mediaType: 'application/xhtml+xml',
    title: pageTitle
  });
}

console.log(`✅ 生成 ${contentItems.length} 个内容文件`);

// ===== 生成style.css =====
const cssContent = `/* EPUB样式 */
body {
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.8;
  color: #333;
  margin: 0;
  padding: 20px;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  color: #222;
}

h1 { font-size: 2em; border-bottom: 2px solid #92400E; padding-bottom: 0.3em; }
h2 { font-size: 1.6em; color: #92400E; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
h3 { font-size: 1.3em; border-left: 4px solid #92400E; padding-left: 12px; }

p { margin-bottom: 1em; text-align: justify; }

blockquote {
  margin: 1.5em 0;
  padding: 1em 1.5em;
  background: #f9f9f9;
  border-left: 4px solid #92400E;
  font-style: italic;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5em 0;
}

th, td {
  padding: 12px;
  border: 1px solid #ddd;
  text-align: left;
}

th {
  background: #f5f5f5;
  font-weight: 600;
}

code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 0.9em;
}

pre {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1.5em 0;
}

pre code {
  background: none;
  padding: 0;
}

ul, ol {
  margin: 1em 0;
  padding-left: 2em;
}

li { margin-bottom: 0.5em; }

img { max-width: 100%; height: auto; }

.cover {
  text-align: center;
  padding: 100px 40px;
}

.cover h1 {
  font-size: 2.5em;
  border: none;
  margin-bottom: 20px;
}

.cover-subtitle {
  font-size: 1.2em;
  color: #666;
  margin-bottom: 40px;
}

.cover-meta {
  font-size: 0.9em;
  color: #999;
}

.callout {
  margin: 1.5em 0;
  padding: 20px 24px;
  border-radius: 8px;
  border-left: 4px solid #92400E;
  background: #fdfcfa;
}

.callout-title {
  font-weight: 700;
  margin-bottom: 8px;
  color: #92400E;
}

.step {
  display: flex;
  gap: 16px;
  margin: 20px 0;
}

.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #92400E;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.step-content p {
  margin: 0;
  color: #555;
}

.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 24px 0;
}

.compare > div {
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.compare-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 24px 0;
}

.compare-item {
  padding: 0;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow: hidden;
}

.compare-label {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid #ddd;
}

.compare-content {
  padding: 16px;
}

.compare-content p {
  margin-bottom: 12px;
}

.compare-content p:last-child {
  margin-bottom: 0;
}

.compare-bad {
  border-color: #fecaca;
  background: #fef2f2;
}

.compare-bad .compare-label {
  background: #fee2e2;
  color: #991b1b;
  border-bottom-color: #fecaca;
}

.compare-good {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.compare-good .compare-label {
  background: #dcfce7;
  color: #166534;
  border-bottom-color: #bbf7d0;
}

.flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 24px 0;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
  flex-wrap: wrap;
}

.flow-step {
  padding: 10px 18px;
  background: #fff;
  border: 2px solid #92400E;
  border-radius: 6px;
  font-weight: 600;
  color: #92400E;
}

.flow-arrow {
  color: #999;
  font-size: 20px;
  font-weight: 700;
}

.tag-core {
  display: inline;
  background: #fef3c7;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  color: #92400E;
}

/* Callout组件完整样式 */
.callout-icon {
  display: inline-block;
  margin-right: 8px;
  font-size: 1.2em;
}

.callout-content {
  display: inline;
}

.callout-title {
  font-weight: 700;
  margin-bottom: 8px;
  color: #92400E;
  display: inline;
}

.callout-tip {
  border-left-color: #10b981;
  background: #f0fdf4;
}

.callout-tip .callout-title {
  color: #059669;
}

.callout-warn {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.callout-warn .callout-title {
  color: #d97706;
}

.callout-violet {
  border-left-color: #8b5cf6;
  background: #faf5ff;
}

.callout-violet .callout-title {
  color: #7c3aed;
}

/* Step Card组件样式 */
.step-card {
  margin: 20px 0;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
  border-left: 4px solid #92400E;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.step-phase {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #92400E;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.85em;
}

.step-phase-num {
  font-weight: 700;
}

.step-phase-label {
  font-size: 0.9em;
}

.step-title {
  font-weight: 700;
  font-size: 1.1em;
  color: #333;
}

.step-body {
  color: #555;
  line-height: 1.7;
}

.step-body p {
  margin-bottom: 0.8em;
}

.step-body p:last-child {
  margin-bottom: 0;
}

.toc ul {
  list-style: none;
  padding-left: 0;
}

.toc li {
  margin: 8px 0;
}

.toc a {
  color: #333;
  text-decoration: none;
}

.toc a:hover {
  color: #92400E;
}
`;

fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'style.css'), cssContent);
console.log('✅ 生成 style.css');

// ===== 生成content.opf =====
const manifestItems = contentItems.map(item => 
  `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"/>`
).join('\n');

const spineItems = contentItems.map(item => 
  `    <itemref idref="${item.id}"/>`
).join('\n');

const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author || 'Unknown'}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="bookid">urn:uuid:${Date.now()}-${Math.random().toString(36).substr(2, 9)}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifestItems}
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;

fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'content.opf'), opfContent);
console.log('✅ 生成 content.opf');

// ===== 生成toc.ncx =====
const navPoints = tocItems.map((item, index) => {
  const playOrder = index + 1;
  // 扁平化目录结构，路径直接使用文件名
  return `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel>
        <text>${item.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
      </navLabel>
      <content src="${item.page}#${item.anchor}"/>
    </navPoint>`;
}).join('\n');

const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${Date.now()}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${title}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'toc.ncx'), ncxContent);
console.log('✅ 生成 toc.ncx');

// ===== 生成nav.xhtml (EPUB3导航文档) =====
const tocList = tocItems.map(item => {
  const indent = item.level === 3 ? ' style="margin-left: 20px;"' : '';
  return `      <li${indent}><a href="${item.page}#${item.anchor}">${item.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`;
}).join('\n');

const navContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>目录 - ${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
${tocList}
    </ol>
  </nav>
</body>
</html>`;

fs.writeFileSync(path.join(EPUB_DIR, 'OEBPS', 'nav.xhtml'), navContent);
console.log('✅ 生成 nav.xhtml');

// ===== 打包EPUB =====
const epubFileName = `${title}-v${version}.epub`;
const epubOutputPath = path.join(OUTPUT_DIR, epubFileName);

try {
  // 使用PowerShell压缩（Windows）
  const psCommand = `
    $ErrorActionPreference = 'Stop'
    $epubDir = '${EPUB_DIR.replace(/\\/g, '\\')}\\'
    $outputFile = '${epubOutputPath.replace(/\\/g, '\\')}'
    
    # 删除已存在的文件
    if (Test-Path $outputFile) { Remove-Item $outputFile }
    
    # 创建zip文件（mimetype必须是第一个文件且不压缩）
    Add-Type -Assembly System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($outputFile, 'Create')
    
    # 添加mimetype（不压缩）
    $mimetypePath = Join-Path $epubDir 'mimetype'
    $entry = $zip.CreateEntry('mimetype', [System.IO.Compression.CompressionLevel]::NoCompression)
    $stream = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($mimetypePath)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    
    $zip.Dispose()
    
    # 重新打开并添加其他文件
    $zip = [System.IO.Compression.ZipFile]::Open($outputFile, 'Update')
    
    function Add-Files($dir, $basePath) {
      Get-ChildItem $dir -Recurse | Where-Object { !$_.PSIsContainer -and $_.Name -ne 'mimetype' } | ForEach-Object {
        $relativePath = $_.FullName.Substring($basePath.Length).TrimStart('\\')
        $entry = $zip.CreateEntry($relativePath.Replace('\\', '/'))
        $stream = $entry.Open()
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
      }
    }
    
    Add-Files $epubDir $epubDir
    $zip.Dispose()
    
    Write-Host "EPUB created successfully"
  `;
  
  execCommand(psCommand);
  
  console.log(`\n🎉 EPUB已生成: ${epubOutputPath}`);
  
  // 清理临时目录
  fs.rmSync(EPUB_DIR, { recursive: true });
  console.log('✅ 清理临时文件');
  
} catch (e) {
  console.error('❌ EPUB生成失败:', e.message);
  console.log('临时文件保留在:', EPUB_DIR);
}

function execCommand(command) {
  try {
    return execSync(command, { 
      shell: 'powershell.exe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (e) {
    throw e;
  }
}
