#!/usr/bin/env node
/**
 * 华书 v3 - 单文件HTML构建器
 * 支持从fragments合并生成，或从指定数据源（markdown/html）转换后生成
 */

const fs = require('fs');
const path = require('path');

// ===== CLI参数解析 =====
const args = process.argv.slice(2);
let sourcePath = null;
let sourceType = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) sourcePath = args[i + 1];
  if (args[i] === '--type' && args[i + 1]) sourceType = args[i + 1];
}

// ===== 路径配置 =====
const TEMPLATES_DIR = __dirname;
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');
const STYLES_PATH = path.join(TEMPLATES_DIR, 'styles.css');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');

// ===== 数据源预处理 =====
if (sourcePath) {
  console.log(`📥 数据源模式: ${sourcePath} (${sourceType || 'auto'})`);
  if (sourceType === 'html') {
    // lite 已移除 HTML→HTML 兼容转换器（convert-html.js），仅支持 MD-first
    console.error('❌ lite 不再支持 --type html（MD-first 架构，数据源请使用 Markdown）');
    process.exit(1);
  }
  const { spawnSync } = require('child_process');
  const converterPath = path.join(TEMPLATES_DIR, 'convert-md.js');

  if (!fs.existsSync(converterPath)) {
    console.error(`❌ 转换器不存在: ${converterPath}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [converterPath, sourcePath], {
    cwd: TEMPLATES_DIR,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('❌ 数据源转换失败');
    process.exit(1);
  }
  console.log('✅ 数据源转换完成\n');
}

// ===== 读取版本信息 =====
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ version.json 不存在，请先运行 init-project.sh');
  process.exit(1);
}

const { title, subtitle, author, version } = versionData;

// ===== 读取CSS =====
let stylesContent;
try {
  stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');
} catch (e) {
  console.error('❌ styles.css 不存在');
  process.exit(1);
}

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
  // 提取 part 后面的数字（支持 partNNN.html 和 partNNN-XX-xxx.html）
  const numA = parseInt(a.match(/^part(\d+)/)?.[1] || '0', 10);
  const numB = parseInt(b.match(/^part(\d+)/)?.[1] || '0', 10);
  if (numA !== numB) return numA - numB;
  // 相同 part 号时，按完整文件名字典序（如 part04-01 < part04-02）
  return a.localeCompare(b);
}

fragmentFiles.sort((a, b) => {
  const oa = FRAG_ORDER[a] ?? 500;
  const ob = FRAG_ORDER[b] ?? 500;
  if (oa !== ob) return oa - ob;
  return naturalPartSort(a, b);
});

console.log(`📄 发现 ${fragmentFiles.length} 个片段文件`);

// ===== 合并片段内容 =====
let bodyContent = '';
let tocData = [];
let tocFragmentContent = '';

for (const file of fragmentFiles) {
  const filePath = path.join(FRAGMENTS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Mustache占位符替换
  content = content
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{SUBTITLE\}\}/g, subtitle)
    .replace(/\{\{AUTHOR\}\}/g, author)
    .replace(/\{\{VERSION\}\}/g, version);

  bodyContent += content + '\n';

  // 从生成的目录片段提取目录数据（确保和正文目录完全一致）
  if (file === '01-toc.html') {
    tocFragmentContent = content;
    const tocMatches = content.matchAll(/<li[^>]*>\s*<a href="#([^"]+)"[^>]*>(.*?)<\/a>\s*<\/li>/gi);
    for (const m of tocMatches) {
      const id = m[1];
      const titleText = m[2].replace(/<[^>]+>/g, '').trim();
      const isSub = m[0].includes('toc-sub');
      tocData.push({ id, title: titleText, level: isSub ? 3 : 2 });
    }
  }
}

// 如果没有找到目录片段，回退到从内容提取
if (tocData.length === 0) {
  for (const file of fragmentFiles) {
    const filePath = path.join(FRAGMENTS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    const headingMatches = content.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>(.*?)<\/h[23]>/gi);
    for (const m of headingMatches) {
      const level = parseInt(m[1]);
      const id = m[2];
      const titleText = m[3].replace(/<[^>]+>/g, '').trim();
      tocData.push({ id, title: titleText, level });
    }
  }
}

// ===== 构建导航栏 =====
const navBar = `
<nav class="nav-bar">
  <span class="nav-title">${title}</span>
  <div class="nav-btns">
    <button onclick="toggleThemePanel()">主题</button>
    <button onclick="toggleSettingsPanel()">显示</button>
    <button onclick="toggleToc()">目录</button>
  </div>
</nav>
`;

// ===== 构建主题面板 =====
const themes = [
  { key: 'print-proof', name: '锐利审稿', color: '#B42318' },
  { key: '', name: '墨纸暖棕', color: '#92400E' },
  { key: 'warm-beige', name: '暖米纸', color: '#B85C38' },
  { key: 'tech-blue', name: '科技蓝', color: '#2563EB' },
  { key: 'khaki-gray', name: '卡其灰', color: '#5C5C5A' },
  { key: 'forest-green', name: '森林绿', color: '#2D6A4F' },
  { key: 'dark-gold', name: '暗夜黑金', color: '#d4a853' },
];

const themePanel = `
<div class="panel-overlay" id="themeOverlay" onclick="closePanels()"></div>
<div class="theme-panel" id="themePanel">
  <h3>选择主题</h3>
  <div class="theme-grid">
    ${themes.map(t => `
      <div class="theme-option" data-theme="${t.key}" onclick="setTheme('${t.key}')">
        <div class="theme-preview" style="background:${t.color}"></div>
        <div class="theme-name">${t.name}</div>
      </div>
    `).join('')}
  </div>
</div>
`;

// ===== 构建设置面板 =====
const settingsPanel = `
<div class="panel-overlay" id="settingsOverlay" onclick="closePanels()"></div>
<div class="settings-panel" id="settingsPanel">
  <h3>阅读设置</h3>
  <div class="settings-group">
    <label>字号</label>
    <div class="settings-options">
      <button onclick="setFontSize('small')">小</button>
      <button onclick="setFontSize('medium')">中</button>
      <button onclick="setFontSize('large')">大</button>
    </div>
  </div>
  <div class="settings-group">
    <label>内容宽度</label>
    <div class="settings-options">
      <button onclick="setContentWidth('1')">默认</button>
      <button onclick="setContentWidth('1.2')">宽</button>
      <button onclick="setContentWidth('1.4')">更宽</button>
      <button onclick="setContentWidth('1.6')">超宽</button>
      <button onclick="setContentWidth('full')">全屏</button>
    </div>
  </div>
</div>
`;

// ===== 构建目录面板（使用与正文目录一致的数据） =====
let tocPanelHtml = `
<div class="toc-overlay" id="tocOverlay" onclick="closePanels()"></div>
<div class="toc-panel-slide" id="tocPanelSlide">
  <h3>目录</h3>
  <ul>
`;

for (const item of tocData) {
  const h3Class = item.level === 3 ? 'toc-h3' : '';
  tocPanelHtml += `    <li><a href="#${item.id}" class="${h3Class}" onclick="closePanels()">${item.title}</a></li>\n`;
}
tocPanelHtml += `  </ul>\n</div>\n`;

// ===== 构建阅读控制按钮 =====
const readerControls = `
<div class="reader-controls">
  <button onclick="toggleThemePanel()" title="主题">◐</button>
  <button onclick="toggleSettingsPanel()" title="显示">⚙</button>
  <button onclick="window.scrollTo({top:0,behavior:'smooth'})" title="回到顶部">↑</button>
</div>
`;

// ===== 构建交互脚本 =====
const interactionScript = `
<script>
(function() {
  const FONT_SIZES = { small: 0.9, medium: 1, large: 1.15 };
  const WIDTH_MAP = { '1': '1', '1.2': '1.2', '1.4': '1.4', '1.6': '1.6', 'full': '999' };

  function getSaved(key, def) {
    try { return localStorage.getItem('huashu_v4_' + key) || def; } catch(e) { return def; }
  }
  function setSaved(key, val) {
    try { localStorage.setItem('huashu_v4_' + key, val); } catch(e) {}
  }

  // 设置面板激活反馈：字号/宽度按钮常亮当前选中项
  function markSettingsActive(fnName, val) {
    document.querySelectorAll('.settings-options button').forEach(function(b) {
      const oc = b.getAttribute('onclick') || '';
      b.classList.toggle('active', oc.indexOf(fnName) !== -1 && oc.indexOf("'" + val + "'") !== -1);
    });
  }

  window.setTheme = function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    setSaved('theme', theme);
    document.querySelectorAll('.theme-option').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === theme);
    });
  };

  window.setFontSize = function(size) {
    document.documentElement.style.setProperty('--font-scale', FONT_SIZES[size] || 1);
    setSaved('fontSize', size);
    markSettingsActive('setFontSize', size);
  };

  window.setContentWidth = function(width) {
    const widthMap = {
      '1': '900px',
      '1.2': '1080px',
      '1.4': '1260px',
      '1.6': '1440px',
      'full': 'none'
    };
    document.documentElement.style.setProperty('--content-max-width', widthMap[width] || '900px');
    setSaved('contentWidth', width);
    markSettingsActive('setContentWidth', width);
  };

  window.toggleThemePanel = function() {
    document.getElementById('themeOverlay').classList.toggle('active');
    document.getElementById('themePanel').classList.toggle('active');
  };

  window.toggleSettingsPanel = function() {
    document.getElementById('settingsOverlay').classList.toggle('active');
    document.getElementById('settingsPanel').classList.toggle('active');
  };

  window.toggleToc = function() {
    document.getElementById('tocOverlay').classList.toggle('active');
    document.getElementById('tocPanelSlide').classList.toggle('active');
  };

  window.closePanels = function() {
    document.querySelectorAll('.panel-overlay, .theme-panel, .settings-panel, .toc-overlay, .toc-panel-slide').forEach(el => {
      el.classList.remove('active');
    });
  };

  // ESC关闭面板
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closePanels();
  });

  // 目录高亮同步（支持 h2 和 h3）
  function updateTocHighlight() {
    const sections = document.querySelectorAll('h2.section-title[id], h3[id]');
    let current = null;
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= 120) current = sec.id;
    });
    document.querySelectorAll('.toc-panel-slide a').forEach(a => {
      a.classList.toggle('active', current && a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', updateTocHighlight, { passive: true });

  // 初始化
  const savedTheme = getSaved('theme', 'print-proof');
  if (savedTheme) setTheme(savedTheme);
  const savedFont = getSaved('fontSize', 'medium');
  setFontSize(savedFont);
  const savedWidth = getSaved('contentWidth', '1');
  if (savedWidth && savedWidth !== '1') setContentWidth(savedWidth);
})();
</script>
`;

// ===== 组装最终HTML =====
const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="print-proof">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} v${version}</title>
  <!-- 字体走本地原生栈（Segoe UI/微软雅黑 UI/Consolas），无网络字体、无 FOUT -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <style>
${stylesContent}
  </style>
</head>
<body>
${navBar}
${themePanel}
${settingsPanel}
${tocPanelHtml}
${bodyContent}
${readerControls}
${interactionScript}
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', hljs.highlightAll);
</script>
</body>
</html>
`;

// ===== 写入文件 =====
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outputPath = path.join(OUTPUT_DIR, `${title}-v${version}.html`);
fs.writeFileSync(outputPath, html, 'utf-8');

// 生成书签数据文件（供PDF生成使用，避免从HTML提取时误匹配表格/代码块内容）
// 附带内容指纹：fragments 变更后重新构建时指纹变化，build-pdf 据此弃用旧缓存
const bookmarkData = {
  htmlHash: require('crypto').createHash('sha1').update(html).digest('hex'),
  bookmarks: tocData.map(item => ({
    title: item.title,
    id: item.id,
    level: item.level
  }))
};
fs.writeFileSync(path.join(OUTPUT_DIR, 'bookmarks.json'), JSON.stringify(bookmarkData, null, 2), 'utf-8');
console.log(`   书签数据: ${bookmarkData.bookmarks.length} 个条目（h2+h3，含内容指纹）`);

console.log(`✅ 单文件HTML已生成: ${outputPath}`);
console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

// ==================== 构建后健康检查 ====================

function postBuildHealthCheck(htmlContent, outputFilePath) {
  const healthReport = {
    timestamp: new Date().toISOString(),
    outputFile: outputFilePath,
    checks: {}
  };

  // 1. 检查降级块数量
  const degradedMatches = htmlContent.match(/data-degrade-reason="([^"]+)"/g) || [];
  healthReport.checks.degradedBlocks = {
    count: degradedMatches.length,
    reasons: degradedMatches.map(m => {
      const match = m.match(/data-degrade-reason="([^"]+)"/);
      return match ? match[1] : '未知原因';
    })
  };

  // 2. 检查HTML标签平衡（整体）
  const tagPairs = [
    { name: 'div', open: /<div\b/g, close: /<\/div>/g },
    { name: 'span', open: /<span\b/g, close: /<\/span>/g },
    { name: 'p', open: /<p\b/g, close: /<\/p>/g },
  ];

  healthReport.checks.tagBalance = [];
  for (const tag of tagPairs) {
    const openCount = (htmlContent.match(tag.open) || []).length;
    const closeCount = (htmlContent.match(tag.close) || []).length;
    if (openCount !== closeCount) {
      healthReport.checks.tagBalance.push({
        tag: tag.name,
        openCount,
        closeCount,
        status: 'unbalanced'
      });
    }
  }

  // 3. 检查关键结构完整性
  healthReport.checks.structure = {
    hasCover: htmlContent.includes('class="cover"'),
    hasToc: htmlContent.includes('class="toc"'),
    hasContent: htmlContent.includes('class="content"'),
    hasNavBar: htmlContent.includes('class="nav-bar"')
  };

  // 4. 总体健康状态
  // 结构完整性计入健康判定：封面 frontmatter 分隔符写错时（`***` 历史事故），
  // 封面被当普通章节渲染，降级块为 0，旧逻辑会静默报"健康"
  const structureBroken = !healthReport.checks.structure.hasCover ||
                          !healthReport.checks.structure.hasContent;
  const hasIssues = healthReport.checks.degradedBlocks.count > 0 ||
                    healthReport.checks.tagBalance.length > 0 ||
                    structureBroken;
  healthReport.overallStatus = hasIssues ? 'warning' : 'healthy';

  return healthReport;
}

// 执行健康检查
const finalHtmlContent = fs.readFileSync(outputPath, 'utf-8');
const healthReport = postBuildHealthCheck(finalHtmlContent, outputPath);

// 输出健康检查摘要
console.log(`\n🏥 构建健康检查:`);
if (healthReport.overallStatus === 'healthy') {
  console.log(`   状态: ✅ 健康`);
  console.log(`   降级块: 0`);
} else {
  console.log(`   状态: ⚠️  有警告`);
  console.log(`   降级块: ${healthReport.checks.degradedBlocks.count}`);
  if (!healthReport.checks.structure.hasCover || !healthReport.checks.structure.hasContent) {
    console.log(`   结构缺失: ${!healthReport.checks.structure.hasCover ? '封面（检查 00-cover.md 的 frontmatter 分隔符必须是行首 ---）' : ''}${!healthReport.checks.structure.hasContent ? '正文内容' : ''}`);
  }
  if (healthReport.checks.degradedBlocks.count > 0) {
    console.log(`   降级原因:`);
    healthReport.checks.degradedBlocks.reasons.forEach((reason, idx) => {
      console.log(`      ${idx + 1}. ${reason}`);
    });
  }
  if (healthReport.checks.tagBalance.length > 0) {
    console.log(`   标签不平衡:`);
    healthReport.checks.tagBalance.forEach(item => {
      console.log(`      - <${item.tag}> 开${item.openCount}/闭${item.closeCount}`);
    });
  }
}

// 保存健康检查报告
const healthReportPath = path.join(OUTPUT_DIR, 'build-health-report.json');
fs.writeFileSync(healthReportPath, JSON.stringify(healthReport, null, 2), 'utf-8');
console.log(`   报告文件: ${healthReportPath}`);

// 如果有降级块，提示用户查看详细报告
if (healthReport.checks.degradedBlocks.count > 0) {
  console.log(`\n💡 提示: 发现 ${healthReport.checks.degradedBlocks.count} 处内容已降级为文本块。`);
  console.log(`   lite 版已移除降级机制，此提示仅兼容旧项目残留。可查看 convert-md-warnings.txt 了解转换警告。`);
}
