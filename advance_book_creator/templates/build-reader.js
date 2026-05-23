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

// 分离主题变量和内容样式
const themeCss = stylesContent.match(/\/\* ===== 基础变量.*?\*\/\s*\n([\s\S]*?)(?=\/\* ===== 基础重置)/)?.[0] || '';
const contentCss = stylesContent.replace(/\/\* ===== 基础变量.*?\*\/\s*\n([\s\S]*?)(?=\/\* ===== 基础重置)/, '');

// ===== 读取片段文件（强制排序：cover→toc→正文→backpage） =====
let fragmentFiles = fs.readdirSync(FRAGMENTS_DIR)
  .filter(f => f.endsWith('.html'));

const FRAG_ORDER = {
  '00-cover.html': 0,
  '01-toc.html': 1,
  '99-backpage.html': 999,
};
fragmentFiles.sort((a, b) => {
  const oa = FRAG_ORDER[a] ?? 500;
  const ob = FRAG_ORDER[b] ?? 500;
  return oa - ob || a.localeCompare(b);
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

/* 基础样式 - 参考v2清晰度设计 */
html { scroll-behavior: smooth; }
body {
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.75;
  font-weight: 400;
  font-size: calc(15px * var(--font-scale));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 封面 - 纯白背景 + 主题色顶部装饰条 */
.cover {
  min-height: 88vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 120px 32px 80px;
  position: relative;
  background: #FFFFFF;
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

/* Callout */
.callout {
  margin: 24px 0;
  padding: 20px 24px;
  border-radius: 12px;
  border-left: 4px solid;
  font-size: calc(14.5px * var(--font-scale));
}
.callout-info { background: var(--note-info-bg); border-color: var(--accent-cyan); }
.callout-tip { background: var(--note-tip-bg); border-color: var(--accent-primary); }
.callout-warn { background: var(--note-warn-bg); border-color: var(--accent-rose); }
.callout-violet { background: var(--note-violet-bg); border-color: var(--accent-violet); }
.callout-title { font-weight: 700; font-size: calc(14px * var(--font-scale)); margin-bottom: 8px; }
.callout-info .callout-title { color: var(--accent-cyan); }
.callout-tip .callout-title { color: var(--accent-primary); }
.callout-warn .callout-title { color: var(--accent-rose); }
.callout-violet .callout-title { color: var(--accent-violet); }

/* 引用块 */
blockquote {
  margin: 24px 0;
  padding: 20px 28px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  position: relative;
  font-style: italic;
}
blockquote::before {
  content: '"';
  position: absolute;
  top: 8px; left: 16px;
  font-size: 48px;
  color: var(--accent-secondary);
  opacity: 0.3;
  font-family: Georgia, serif;
}
blockquote p { padding-left: 28px; margin-bottom: 0; }

/* 表格 */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 24px 0;
  font-size: calc(14px * var(--font-scale));
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-warm);
}
thead { background: var(--table-head-bg); }
th {
  padding: 14px 18px;
  text-align: left;
  font-weight: 600;
  color: var(--accent-primary);
  font-size: calc(13px * var(--font-scale));
  border-bottom: 2px solid var(--border-accent);
}
td {
  padding: 12px 18px;
  border-bottom: 1px solid var(--table-border);
  color: var(--text-secondary);
}
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
.file-tree {
  background: var(--code-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 20px 24px;
  font-family: 'JetBrains Mono', monospace;
  margin: 24px 0;
}
.flow { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 32px 0; flex-wrap: wrap; }
.flow-step { padding: 12px 20px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 8px; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0; }
.compare > div { padding: 20px; border-radius: 12px; }
.compare > div:first-child { background: var(--compare-bad-bg); border: 1px solid var(--compare-bad-border); }
.compare > div:last-child { background: var(--compare-good-bg); border: 1px solid var(--compare-good-border); }

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
var FONT_KEY = 'huashu_v3_font';
var WIDTH_MAP = {
  '1': '900px',
  '1.2': '1080px',
  '1.4': '1260px',
  '1.6': '1440px',
  'full': 'none'
};
var WIDTH_KEY = 'huashu_v3_width';
var THEME_KEY = 'huashu_v3_theme';

var currentTheme = '';
var currentFont = 'medium';
var currentWidth = '1';

document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  initToc();
  loadPage('cover.html');
});

function loadSettings() {
  currentTheme = localStorage.getItem(THEME_KEY) || '';
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

for (const file of fragmentFiles) {
  const content = fs.readFileSync(path.join(FRAGMENTS_DIR, file), 'utf-8');
  const processedContent = content
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{SUBTITLE\}\}/g, subtitle)
    .replace(/\{\{AUTHOR\}\}/g, author)
    .replace(/\{\{VERSION\}\}/g, version);

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

  const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="../shared/theme.css">
  <link rel="stylesheet" href="../shared/content.css">
</head>
<body>
  <div class="container">
${processedContent}
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

console.log(`✅ 生成 ${fragmentFiles.length} 个内容页`);

// ===== 生成框架页 index.html =====
const tocHtml = tocData.map(item => {
  const subClass = item.level === 3 ? 'toc-sub' : '';
  return `<a href="#" class="${subClass}" data-page="${item.page}" data-anchor="${item.anchor}">${item.title}</a>`;
}).join('\n        ');

const themes = [
  { key: '', name: '默认暖棕', color: '#92400E' },
  { key: 'warm-beige', name: '暖米色', color: '#B85C38' },
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <link rel="stylesheet" href="shared/theme.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Sans SC', sans-serif;
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
