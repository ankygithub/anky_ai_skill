#!/usr/bin/env node
/**
 * 华书 v3 - 多文件阅读器构建器
 * 自主生成，无外部依赖
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = __dirname;
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');
const STYLES_PATH = path.join(TEMPLATES_DIR, 'styles.css');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');
const READER_DIR = path.join(OUTPUT_DIR, 'reader');

// ===== 读取版本信息 =====
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ version.json 不存在');
  process.exit(1);
}
const { title, subtitle, author, version } = versionData;

// ===== 读取CSS =====
const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');

// ===== 组件样式单一来源 =====
// reader 的组件样式不再手工维护副本，而是构建时从 styles.css 按
// 段落锚点提取（实际事故：reader 缺 step-card 样式、样式修改漏同步）。
// EPUB 的 epub-styles.css 因设备兼容差异较大，保持独立维护。
const COMPONENT_SECTION_ANCHORS = ['高亮块/信息块', '对比示例块', '简洁步骤卡片', '图片组件'];
function extractComponentCss(stylesText) {
  const sections = stylesText.split(/(?=\/\* ===== )/);
  const missing = [];
  const picked = COMPONENT_SECTION_ANCHORS.map(anchor => {
    const section = sections.find(s => s.includes(anchor));
    if (!section) { missing.push(anchor); return ''; }
    return section.replace(/\s*$/, '');
  });
  if (missing.length > 0) {
    console.warn(`⚠️ styles.css 组件段提取不完整，缺失锚点: ${missing.join(' / ')}（阅读器组件样式将缺失，请检查 styles.css 段落注释）`);
  }
  return picked.join('\n\n');
}
const componentCss = extractComponentCss(stylesContent);

// ===== 读取片段文件（强制排序：cover→toc→正文→backpage） =====
let fragmentFiles = fs.readdirSync(FRAGMENTS_DIR)
  .filter(f => f.endsWith('.html'));

const FRAG_ORDER = {
  '00-cover.html': 0,
  '01-toc.html': 1,
  '99-backpage.html': 999,
};

// 自然数字排序：提取 part 后面的数字进行数值比较
// 避免 "part100" < "part11" 的字典序错误
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

// ===== 提取目录数据（从内容片段提取，建立标题→页面的映射） =====
let tocData = [];

// 第一步：建立页面映射（每个内容片段文件对应哪个页面）
const pageMapping = {}; // id -> pageName
let contentPartNum = 0;

for (const file of fragmentFiles) {
  let pageName;
  if (file === '00-cover.html') {
    pageName = 'cover.html';
  } else if (file === '01-toc.html') {
    pageName = 'toc.html';
  } else if (file === '99-backpage.html') {
    pageName = 'backpage.html';
  } else {
    contentPartNum++;
    pageName = `part${String(contentPartNum).padStart(2, '0')}.html`;
  }

  // 从每个片段中提取 h2 和 h3 的 id
  const content = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
  const headingMatches = content.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi);
  for (const m of headingMatches) {
    const level = parseInt(m[1]);
    const id = m[2];
    pageMapping[id] = { page: pageName, level };
  }
}

// 第二步：从 01-toc.html 提取完整目录结构，并关联到正确页面
const tocFilePath = path.join(FRAGMENTS_DIR, '01-toc.html');
if (fs.existsSync(tocFilePath)) {
  const tocContent = fs.readFileSync(tocFilePath, 'utf-8');
  const tocMatches = tocContent.matchAll(/<li[^>]*>\s*<a href="#([^"]+)"[^>]*>(.*?)<\/a>\s*<\/li>/gi);
  for (const m of tocMatches) {
    const id = m[1];
    const titleText = m[2].replace(/<[^>]+>/g, '').trim();
    const isSub = m[0].includes('toc-sub');
    const mapping = pageMapping[id];
    tocData.push({
      page: mapping ? mapping.page : 'cover.html',
      anchor: id,
      title: titleText,
      level: isSub ? 3 : 2
    });
  }
}

// 回退：直接从内容片段提取
if (tocData.length === 0) {
  contentPartNum = 0;
  for (const file of fragmentFiles) {
    let pageName;
    if (file === '00-cover.html') {
      pageName = 'cover.html';
    } else if (file === '01-toc.html') {
      pageName = 'toc.html';
    } else if (file === '99-backpage.html') {
      pageName = 'backpage.html';
    } else {
      contentPartNum++;
      pageName = `part${String(contentPartNum).padStart(2, '0')}.html`;
    }

    const content = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
    const headingMatches = content.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi);
    for (const m of headingMatches) {
      const level = parseInt(m[1]);
      const id = m[2];
      const titleText = m[3].replace(/<[^>]+>/g, '').trim();
      tocData.push({
        page: pageName,
        anchor: id,
        title: titleText,
        level
      });
    }
  }
}

// ===== 创建目录结构 =====
if (!fs.existsSync(READER_DIR)) fs.mkdirSync(READER_DIR, { recursive: true });
fs.mkdirSync(path.join(READER_DIR, 'shared'), { recursive: true });
fs.mkdirSync(path.join(READER_DIR, 'content'), { recursive: true });

// ===== 生成 shared/theme.css =====
fs.writeFileSync(path.join(READER_DIR, 'shared', 'theme.css'), stylesContent);
console.log('✅ 生成 shared/theme.css');

// ===== 生成 shared/content.css =====
// 内容页只需要基础样式，不需要导航栏/面板样式
const contentOnlyCss = `
/* 内容页样式 */
.container {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0 32px;
}

/* 基础样式 - v3 锐利印刷设计（本地字体栈，ClearType 下最锐利） */
html { scroll-behavior: smooth; }
body {
  font-family: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei",
               "PingFang SC", sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.9;
  font-weight: 400;
  font-size: calc(16px * var(--font-scale));
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
}

/* 封面 - 纸面背景 + 墨色双规则线（背景走 token，暗色主题不穿帮） */
.cover {
  min-height: 88vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 120px 32px 80px;
  position: relative;
  background: var(--bg-primary);
}
.cover::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 6px;
  background: var(--gradient-primary);
}
.cover::after {
  content: '';
  position: absolute;
  top: 40px; left: 32px;
  width: 80px; height: 5px;
  background: var(--accent-primary);
  border-radius: 3px;
}
.cover-badge {
  display: inline-block;
  padding: 6px 20px;
  border: 1px solid var(--border-accent);
  border-radius: 20px;
  font-size: 13px;
  color: var(--accent-primary);
  letter-spacing: 3px;
  margin-bottom: 40px;
}
.cover h1 {
  font-size: calc(clamp(36px, 6vw, 64px) * var(--font-scale));
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 24px;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.cover-subtitle {
  font-size: calc(17px * var(--font-scale));
  color: var(--text-secondary);
  max-width: 520px;
  line-height: 1.8;
}
.cover-meta {
  margin-top: 40px;
  display: flex;
  gap: 28px;
  font-size: 13px;
  color: var(--text-muted);
}

/* 内容区域 */
.content {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 55px;
}

/* 标题 */
h2.section-title {
  font-size: calc(28px * var(--font-scale));
  font-weight: 700;
  color: var(--accent-primary);
  margin-top: 48px;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--accent-primary);
}
h2.section-title .num {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 400;
  margin-right: 12px;
  opacity: 0.7;
}
h3 {
  font-size: calc(19px * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
  margin: 36px 0 16px;
  padding-left: 16px;
  border-left: 3px solid var(--accent-secondary);
}
h4 {
  font-size: calc(16px * var(--font-scale));
  font-weight: 600;
  color: var(--accent-cyan);
  margin: 24px 0 12px;
}

/* 段落 */
p {
  margin-bottom: 16px;
  color: var(--text-primary);
  font-size: calc(15px * var(--font-scale));
}

/* ===== 组件样式（单一来源：构建时从 styles.css 提取，勿在此手工维护） ===== */
${componentCss}

/* 引用块：印刷左墨线（与单文件模板一致，去引号装饰） */
blockquote {
  margin: 24px 0;
  padding: 18px 22px;
  background: var(--bg-secondary);
  border-radius: 0;
  border-left: 3px solid var(--border-strong);
  position: relative;
}
blockquote p { margin-bottom: 8px; }
blockquote p:last-child { margin-bottom: 0; }

/* 表格：墨底反白表头 + 主题色规则线（v3 全模板签名） */
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 24px 0;
  font-size: calc(14px * var(--font-scale));
  border: 1px solid var(--table-border);
  line-height: 1.75;
}
thead { background: var(--table-head-bg); }
th {
  padding: 12px 14px;
  text-align: left;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--table-head-color);
  font-size: calc(13px * var(--font-scale));
  border-bottom: 2px solid var(--table-head-rule);
}
th:not(:last-child) { border-right: 1px solid rgba(255,255,255,.14); }
td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--table-border);
  color: var(--text-primary);
  vertical-align: top;
}
td:not(:last-child) { border-right: 1px solid var(--table-border); }
tbody tr:nth-child(even) td { background: var(--table-row-alt); }
tbody tr:last-child td { border-bottom: none; }

/* 代码块 */
pre {
  margin: 24px 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--code-bg);
  border: 1px solid var(--border-subtle);
  box-shadow: inset 0 0 30px rgba(0,0,0,0.15);
}
pre code {
  display: block;
  padding: 24px 28px;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(13px * var(--font-scale));
  line-height: 1.7;
  color: var(--code-text);
  overflow-x: auto;
  white-space: pre-wrap;
}
code:not(pre code) {
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: 5px;
  font-size: calc(13px * var(--font-scale));
  color: var(--accent-cyan);
  font-family: 'JetBrains Mono', monospace;
}

/* 列表 */
ul, ol { margin: 16px 0; padding-left: 24px; }
li { margin-bottom: 8px; font-size: calc(15px * var(--font-scale)); }
li::marker { color: var(--accent-secondary); }

/* 分隔线 */
hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-accent), transparent);
  margin: 48px 0;
}

/* 步骤、文件树、流程图、对比（保留v2） */
.step { display: flex; gap: 16px; margin: 20px 0; }
.step-num {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}
/* 图片 */
img { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }

/* 响应式 */
@media (max-width: 768px) {
  .content { padding: 20px; }
  .cover { padding: 100px 20px 60px; }
}
`;

fs.writeFileSync(path.join(READER_DIR, 'shared', 'content.css'), contentOnlyCss);
console.log('✅ 生成 shared/content.css');

// ===== 生成 shared/reader.js =====
const readerJs = `
/**
 * 多文件手册阅读器交互逻辑（完全对齐范例）
 */

var FONT_SIZES = { small: 0.9, medium: 1, large: 1.15 };
var FONT_KEY = 'huashu_v4_font';
var WIDTH_MAP = {
  '1': '900px',
  '1.2': '1080px',
  '1.4': '1260px',
  '1.6': '1440px',
  'full': 'none'
};
var WIDTH_KEY = 'huashu_v4_width';
var THEME_KEY = 'huashu_v4_theme';

var currentTheme = 'print-proof';
var currentFont = 'medium';
var currentWidth = '1';

document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  initToc();
  loadPage('cover.html');
});

function loadSettings() {
  currentTheme = localStorage.getItem(THEME_KEY) || 'print-proof';
  currentFont = localStorage.getItem(FONT_KEY) || 'medium';
  currentWidth = localStorage.getItem(WIDTH_KEY) || '1';
  applyFontSize(currentFont, false);
  applyWidth(currentWidth, false);
  applyTheme(currentTheme, false);
}

function setFontSize(size) {
  currentFont = size;
  applyFontSize(size, true);
  localStorage.setItem(FONT_KEY, size);
}
function applyFontSize(size, broadcast) {
  var scale = FONT_SIZES[size] || 1;
  document.documentElement.style.setProperty('--font-scale', scale);
  document.querySelectorAll('.settings-option-btn[data-font]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.font === size);
  });
  if (broadcast) broadcastToIframe({ type: 'fontSize', value: scale });
}

function setContentWidth(widthKey) {
  currentWidth = widthKey;
  applyWidth(widthKey, true);
  localStorage.setItem(WIDTH_KEY, widthKey);
}
function applyWidth(widthKey, broadcast) {
  var maxWidth = WIDTH_MAP[widthKey] || '900px';
  document.documentElement.style.setProperty('--content-max-width', maxWidth);
  document.querySelectorAll('.settings-option-btn[data-width]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.width === widthKey);
  });
  if (broadcast) broadcastToIframe({ type: 'width', value: maxWidth });
}

function setTheme(theme) {
  currentTheme = theme;
  applyTheme(theme, true);
  localStorage.setItem(THEME_KEY, theme);
}
function applyTheme(theme, broadcast) {
  document.documentElement.setAttribute('data-theme', theme === 'default' ? '' : theme);
  document.querySelectorAll('.theme-option').forEach(function(opt) {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
  if (broadcast) broadcastToIframe({ type: 'theme', value: theme });
}

function toggleThemePanel() {
  var panel = document.getElementById('themePanel');
  var overlay = document.getElementById('themeOverlay');
  var isOpen = panel && panel.classList.contains('active');
  closePanels();
  if (!isOpen) { if (overlay) overlay.classList.add('active'); if (panel) panel.classList.add('active'); }
}

function toggleSettingsPanel() {
  var panel = document.getElementById('settingsPanel');
  var overlay = document.getElementById('settingsOverlay');
  var isOpen = panel && panel.classList.contains('active');
  closePanels();
  if (!isOpen) { if (overlay) overlay.classList.add('active'); if (panel) panel.classList.add('active'); }
}

function toggleToc() {
  var sidebar = document.querySelector('.toc-sidebar');
  var area = document.querySelector('.content-area');
  if (sidebar) sidebar.classList.toggle('collapsed');
  if (area) area.classList.toggle('expanded');
}

function closePanels() {
  document.querySelectorAll('.panel-overlay, .theme-panel, .settings-panel').forEach(function(el) {
    el.classList.remove('active');
  });
}

function broadcastToIframe(msg) {
  var iframe = document.getElementById('contentFrame');
  if (iframe && iframe.contentWindow) {
    try { iframe.contentWindow.postMessage(msg, '*'); } catch(e) {}
  }
}
function syncSettingsToIframe() {
  broadcastToIframe({ type: 'theme', value: currentTheme });
  broadcastToIframe({ type: 'fontSize', value: FONT_SIZES[currentFont] || 1 });
  broadcastToIframe({ type: 'width', value: WIDTH_MAP[currentWidth] || '900px' });
}

function initToc() {
  document.querySelectorAll('.toc-sidebar a[data-page]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var page = this.getAttribute('data-page');
      var anchor = this.getAttribute('data-anchor') || '';
      loadPage(page, anchor);
      document.querySelectorAll('.toc-sidebar a').forEach(function(a) { a.classList.remove('active'); });
      this.classList.add('active');
      closePanels();
    });
  });
}

function loadPage(page, anchor) {
  var iframe = document.getElementById('contentFrame');
  if (!iframe) return;

  var hashParts = [];
  if (currentTheme && currentTheme !== 'default') hashParts.push('theme=' + currentTheme);
  if (currentFont !== 'medium') hashParts.push('font=' + currentFont);
  if (currentWidth !== '1') hashParts.push('width=' + currentWidth);
  var hash = hashParts.length > 0 ? '#' + hashParts.join('&') : '';

  iframe.src = 'content/' + page + hash;

  iframe.onload = function() {
    syncSettingsToIframe();
    if (anchor && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage({ type: 'scrollToAnchor', value: anchor }, '*'); } catch(e) {}
    }
  };

  document.querySelectorAll('.toc-sidebar a').forEach(function(a) {
    var aPage = a.getAttribute('data-page') || '';
    var aAnchor = a.getAttribute('data-anchor') || '';
    a.classList.toggle('active', aPage === page && aAnchor === anchor);
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closePanels();
});
`;

fs.writeFileSync(path.join(READER_DIR, 'shared', 'reader.js'), readerJs);
console.log('✅ 生成 shared/reader.js');

// ===== 生成内容页 =====
contentPartNum = 0;

// 首先建立页面列表（用于导航）
const pageList = [];
for (const file of fragmentFiles) {
  let pageName;
  let pageType;
  if (file === '00-cover.html') {
    pageName = 'cover.html';
    pageType = 'cover';
  } else if (file === '01-toc.html') {
    pageName = 'toc.html';
    pageType = 'toc';
  } else if (file === '99-backpage.html') {
    pageName = 'backpage.html';
    pageType = 'backpage';
  } else {
    contentPartNum++;
    pageName = `part${String(contentPartNum).padStart(2, '0')}.html`;
    pageType = 'content';
  }
  pageList.push({ file, pageName, pageType });
}

// 生成每个内容页
for (let i = 0; i < pageList.length; i++) {
  const { file, pageName, pageType } = pageList[i];
  const content = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
  const processedContent = content
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{SUBTITLE\}\}/g, subtitle)
    .replace(/\{\{AUTHOR\}\}/g, author)
    .replace(/\{\{VERSION\}\}/g, version);

  // 生成导航按钮
  let navButtons = '';
  if (pageType !== 'cover') {
    const prevPage = pageList[i - 1];
    const nextPage = pageList[i + 1];
    
    let prevButton = '';
    let nextButton = '';
    
    if (prevPage) {
      prevButton = `<a href="${prevPage.pageName}" class="nav-btn nav-prev" onclick="return parent.loadPage('${prevPage.pageName}');">上一页</a>`;
    } else {
      prevButton = `<span class="nav-btn nav-disabled">上一页</span>`;
    }
    if (nextPage) {
      nextButton = `<a href="${nextPage.pageName}" class="nav-btn nav-next" onclick="return parent.loadPage('${nextPage.pageName}');">下一页</a>`;
    } else {
      nextButton = `<span class="nav-btn nav-disabled">下一页</span>`;
    }
    
    if (prevButton || nextButton) {
      navButtons = `
    <div class="page-nav">
      <div class="nav-container">
        ${prevButton}
        ${nextButton}
      </div>
    </div>`;
    }
  }

  const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- 字体走本地原生栈（theme.css/content.css 内声明），无网络字体 -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="../shared/theme.css">
  <link rel="stylesheet" href="../shared/content.css">
  <style>
    .page-nav {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: 60px;
      padding-top: 30px;
      border-top: 1px solid var(--border-subtle);
    }
    .nav-container {
      display: flex;
      gap: 24px;
      align-items: center;
    }
    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      border: 2px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--bg-card);
      color: var(--text-primary);
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      transition: all 0.25s ease;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    .nav-btn:hover {
      border-color: var(--accent-primary);
      color: var(--accent-primary);
      background: var(--toc-active-bg);
      box-shadow: 0 4px 12px rgba(146, 64, 14, 0.12);
      transform: translateY(-1px);
    }
    .nav-btn:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    .nav-prev::before {
      content: "←";
      font-size: 16px;
    }
    .nav-next::after {
      content: "→";
      font-size: 16px;
    }
    .nav-disabled {
      visibility: hidden;
    }
  </style>
</head>
<body>
  <div class="container">
${processedContent}
${navButtons}
  </div>
  <script>
    (function() {
      var FONT_SIZES = { small: 0.9, medium: 1, large: 1.15 };
      var WIDTH_MAP = { '1': '900px', '1.2': '1080px', '1.4': '1260px', '1.6': '1440px', 'full': 'none' };

      // 从 URL hash 解析初始设置（完全对齐范例）
      var hash = window.location.hash.slice(1);
      if (hash) {
        var params = new URLSearchParams(hash);
        var theme = params.get('theme');
        var fontSize = params.get('font');
        var width = params.get('width');
        if (theme !== null && theme !== '') document.documentElement.setAttribute('data-theme', theme);
        if (fontSize) document.documentElement.style.setProperty('--font-scale', FONT_SIZES[fontSize] || 1);
        if (width) document.documentElement.style.setProperty('--content-max-width', WIDTH_MAP[width] || '900px');
      }

      // 监听父框架 postMessage（对齐范例）
      window.addEventListener('message', function(e) {
        if (!e.data) return;
        switch (e.data.type) {
          case 'theme':
            if (e.data.value !== '' && e.data.value !== 'default') {
              document.documentElement.setAttribute('data-theme', e.data.value);
            }
            break;
          case 'fontSize':
            document.documentElement.style.setProperty('--font-scale', e.data.value || 1);
            break;
          case 'width':
            document.documentElement.style.setProperty('--content-max-width', e.data.value || '900px');
            break;
          case 'scrollToAnchor':
            setTimeout(function() {
              var el = document.getElementById(e.data.value);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
            break;
        }
      });
    })();
  </script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script>document.addEventListener('DOMContentLoaded',hljs.highlightAll);</script>
</body>
</html>`;

  fs.writeFileSync(path.join(READER_DIR, 'content', pageName), pageHtml);
}

console.log(`✅ 生成 ${pageList.length} 个内容页`);

// ===== 生成框架页 index.html =====
const tocHtml = tocData.map(item => {
  const subClass = item.level === 3 ? 'toc-sub' : '';
  return `<a href="#" class="${subClass}" data-page="${item.page}" data-anchor="${item.anchor}">${item.title}</a>`;
}).join('\n        ');

const themes = [
  { key: 'print-proof', name: '锐利审稿', color: '#B42318' },
  { key: '', name: '墨纸暖棕', color: '#92400E' },
  { key: 'warm-beige', name: '暖米纸', color: '#B85C38' },
  { key: 'tech-blue', name: '科技蓝', color: '#2563EB' },
  { key: 'khaki-gray', name: '卡其灰', color: '#5C5C5A' },
  { key: 'forest-green', name: '森林绿', color: '#2D6A4F' },
  { key: 'dark-gold', name: '暗夜黑金', color: '#d4a853' },
];

const themeGrid = themes.map(t =>
  `<div class="theme-option" data-theme="${t.key}" onclick="setTheme('${t.key}')">
        <div class="theme-preview" style="background:${t.color}"></div>
        <div class="theme-name">${t.name}</div>
      </div>`
).join('\n      ');

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} v${version}</title>
  <!-- 字体走本地原生栈，无网络字体、无 FOUT -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="shared/theme.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei",
                   "PingFang SC", sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: hidden;
    }
    .reader-layout {
      display: flex;
      height: 100vh;
      padding-top: 56px;
    }
    .nav-bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 56px;
      background: var(--nav-bg);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border-subtle);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }
    .nav-title { font-size: 16px; font-weight: 600; color: var(--accent-primary); }
    .nav-btns { display: flex; gap: 8px; }
    .nav-btns button {
      padding: 6px 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    .nav-btns button:hover {
      border-color: var(--border-accent);
      color: var(--accent-primary);
      background: var(--toc-active-bg);
    }
    .toc-sidebar {
      width: 280px;
      min-width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-subtle);
      overflow-y: auto;
      padding: 20px;
      transition: transform 0.3s ease;
    }
    .toc-sidebar.collapsed { transform: translateX(-100%); width: 0; min-width: 0; padding: 0; }
    .toc-sidebar h3 {
      font-size: 14px;
      color: var(--accent-primary);
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .toc-sidebar a {
      display: block;
      padding: 8px 12px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 14px;
      border-radius: 6px;
      transition: all 0.2s ease;
      border-left: 3px solid transparent;
      margin-bottom: 4px;
    }
    .toc-sidebar a:hover {
      background: var(--toc-active-bg);
      color: var(--accent-primary);
    }
    .toc-sidebar a.active {
      background: var(--toc-active-bg);
      color: var(--accent-primary);
      border-left-color: var(--accent-primary);
    }
    .toc-sidebar a.toc-sub {
      padding-left: 24px;
      font-size: 13px;
    }
    .content-area {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .content-area.expanded { margin-left: -280px; }
    #contentFrame {
      width: 100%;
      height: 100%;
      border: none;
    }
    .panel-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 1998;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: all 0.3s ease;
    }
    .panel-overlay.active { opacity: 1; visibility: visible; pointer-events: auto; }
    .theme-panel, .settings-panel {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 32px;
      z-index: 1999;
      min-width: 400px;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
      box-shadow: var(--shadow-deep);
    }
    .theme-panel.active, .settings-panel.active {
      opacity: 1; visibility: visible; transform: translate(-50%, -50%) scale(1);
    }
    .theme-panel h3, .settings-panel h3 {
      font-size: 18px; margin-bottom: 20px; color: var(--text-primary);
    }
    .theme-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    }
    .theme-option {
      padding: 16px; border: 2px solid var(--border-subtle);
      border-radius: 12px; cursor: pointer; text-align: center;
      transition: all 0.2s ease;
    }
    .theme-option:hover { border-color: var(--border-accent); }
    .theme-option.active { border-color: var(--accent-primary); background: var(--toc-active-bg); }
    .theme-preview { width: 40px; height: 40px; border-radius: 8px; margin: 0 auto 8px; }
    .theme-name { font-size: 12px; color: var(--text-secondary); }
    .settings-group { margin-bottom: 24px; }
    .settings-group label { display: block; font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
    .settings-options { display: flex; gap: 8px; flex-wrap: wrap; }
    .settings-options button {
      padding: 8px 16px; border: 1px solid var(--border-subtle);
      border-radius: 6px; background: transparent;
      color: var(--text-secondary); font-size: 13px;
      cursor: pointer; transition: all 0.2s ease; font-family: inherit;
    }
    .settings-options button:hover, .settings-options button.active {
      border-color: var(--accent-primary); color: var(--accent-primary); background: var(--toc-active-bg);
    }
    @media (max-width: 768px) {
      .toc-sidebar { position: fixed; z-index: 100; transform: translateX(-100%); }
      .toc-sidebar.collapsed { transform: translateX(0); }
      .content-area.expanded { margin-left: 0; }
    }
  </style>
</head>
<body>
  <nav class="nav-bar">
    <span class="nav-title">${title}</span>
    <div class="nav-btns">
      <button onclick="toggleThemePanel()">主题</button>
      <button onclick="toggleSettingsPanel()">显示</button>
      <button onclick="toggleToc()">目录</button>
    </div>
  </nav>

  <div class="panel-overlay" id="themeOverlay" onclick="closePanels()"></div>
  <div class="theme-panel" id="themePanel">
    <h3>选择主题</h3>
    <div class="theme-grid">
      ${themeGrid}
    </div>
  </div>

  <div class="panel-overlay" id="settingsOverlay" onclick="closePanels()"></div>
  <div class="settings-panel" id="settingsPanel">
    <h3>阅读设置</h3>
    <div class="settings-group">
      <label>字号</label>
      <div class="settings-options">
        <button class="settings-option-btn" data-font="small" onclick="setFontSize('small')">小</button>
        <button class="settings-option-btn active" data-font="medium" onclick="setFontSize('medium')">中</button>
        <button class="settings-option-btn" data-font="large" onclick="setFontSize('large')">大</button>
      </div>
    </div>
    <div class="settings-group">
      <label>内容宽度</label>
      <div class="settings-options">
        <button class="settings-option-btn active" data-width="1" onclick="setContentWidth('1')">默认</button>
        <button class="settings-option-btn" data-width="1.2" onclick="setContentWidth('1.2')">1.2</button>
        <button class="settings-option-btn" data-width="1.4" onclick="setContentWidth('1.4')">1.4</button>
        <button class="settings-option-btn" data-width="1.6" onclick="setContentWidth('1.6')">1.6</button>
        <button class="settings-option-btn" data-width="full" onclick="setContentWidth('full')">全屏</button>
      </div>
    </div>
  </div>

  <div class="reader-layout">
    <aside class="toc-sidebar">
      <h3>目录</h3>
      <nav>
        ${tocHtml}
      </nav>
    </aside>
    <div class="content-area">
      <iframe id="contentFrame"></iframe>
    </div>
  </div>

  <script src="shared/reader.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(READER_DIR, 'index.html'), indexHtml);
console.log('✅ 生成 reader/index.html');

console.log(`\n🎉 多文件阅读器已生成: ${READER_DIR}`);
