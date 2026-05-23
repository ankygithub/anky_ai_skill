/**
 * Book-PDF 多文件阅读器生成脚本
 * 将 HTML 单文件转换为多文件交互式阅读框架
 *
 * 前置：先运行 node build.js 生成 HTML
 * 依赖：Python 3 + huashu-book-html-converter 技能
 * 用法：node build-reader.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
const HTML_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.html`);
const READER_DIR = path.join(__dirname, 'output', 'reader');

// 查找 html-converter 技能路径
function findConverterSkill() {
  // 常见安装路径
  const possiblePaths = [
    path.join(process.env.HOME || process.env.USERPROFILE, '.trae-cn', 'skills', 'huashu-book-html-converter'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.trae', 'skills', 'huashu-book-html-converter'),
    path.join(__dirname, '..', '..', 'huashu-book-html-converter'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

function buildReader() {
  if (!fs.existsSync(HTML_FILE)) {
    console.error(`❌ HTML file not found: ${HTML_FILE}`);
    console.error('   Please run "node build.js" first.');
    process.exit(1);
  }

  console.log('📚 Building multi-file reader...');

  const skillPath = findConverterSkill();

  if (!skillPath) {
    console.error('❌ huashu-book-html-converter skill not found.');
    console.error('   Please ensure the skill is installed.');
    process.exit(1);
  }

  const scriptPath = path.join(skillPath, 'scripts', 'convert_html.py');

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ Converter script not found: ${scriptPath}`);
    process.exit(1);
  }

  // 确保输出目录存在
  if (!fs.existsSync(READER_DIR)) {
    fs.mkdirSync(READER_DIR, { recursive: true });
  }

  // 调用 Python 转换脚本（Windows兼容：优先python3，回退python，再回退py）
  const pythonCmd = process.platform === 'win32'
    ? 'C:\\Windows\\py.exe'
    : (process.env.PYTHON || 'python3');
  const cmd = `${pythonCmd} "${scriptPath}" "${HTML_FILE}" -o "${READER_DIR}" -t "${versionData.title}" -v "${versionData.version}"`;

  console.log(`   Running: ${cmd}`);

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`\n✅ Reader built: ${READER_DIR}`);

    // 注入字号切换功能到阅读器框架
    injectFontSizeControl(READER_DIR);

    console.log(`   Open: ${path.join(READER_DIR, 'index.html')}`);
  } catch (err) {
    console.error('\n❌ Failed to build reader:', err.message);
    process.exit(1);
  }
}

/**
 * 向多文件阅读器注入字号切换功能
 * 修改 index.html 框架页，添加字号控制控件和脚本
 */
function injectFontSizeControl(readerDir) {
  const indexPath = path.join(readerDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.log('   ⚠️ reader/index.html not found, skipping font-size injection');
    return;
  }

  let html = fs.readFileSync(indexPath, 'utf-8');

  // 字号切换控件 CSS（内联，避免依赖外部文件）
  const fontSizeCss = `
<style id="font-size-control-style">
.font-size-control {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border, #E7E5E4);
}
.font-size-control label {
  font-size: 12px;
  color: var(--text-secondary, #78716C);
  font-weight: 500;
  margin-right: 2px;
}
.font-size-control button {
  background: transparent;
  border: 1px solid var(--border, #E7E5E4);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text, #1C1917);
  cursor: pointer;
  transition: all 0.2s;
  min-width: 28px;
  text-align: center;
}
.font-size-control button:hover {
  background: var(--accent-light, #FFFBEB);
  border-color: var(--accent, #92400E);
  color: var(--accent, #92400E);
}
.font-size-control button.active {
  background: var(--accent, #92400E);
  border-color: var(--accent, #92400E);
  color: white;
  font-weight: 600;
}
</style>`;

  // 字号切换脚本
  const fontSizeScript = `
<script id="font-size-control-script">
(function() {
  const SIZES = { small: 1, medium: 1.15, large: 1.3 };
  const STORAGE_KEY = 'reader_font_size';

  function setFontSize(size) {
    const scale = SIZES[size] || 1;
    const iframe = document.getElementById('content-frame');
    if (iframe && iframe.contentDocument && iframe.contentDocument.documentElement) {
      iframe.contentDocument.documentElement.style.setProperty('--font-scale', scale);
    }
    localStorage.setItem(STORAGE_KEY, size);

    document.querySelectorAll('.font-size-control button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
  }

  // 恢复用户偏好
  const saved = localStorage.getItem(STORAGE_KEY) || 'small';

  // 等待 iframe 加载完成后应用字号
  function applySavedSize() {
    const iframe = document.getElementById('content-frame');
    if (iframe) {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        setFontSize(saved);
      } else {
        iframe.addEventListener('load', function() { setFontSize(saved); });
      }
    }
  }

  // 页面加载时应用
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySavedSize);
  } else {
    applySavedSize();
  }

  // 暴露全局函数
  window.setReaderFontSize = setFontSize;
})();
</script>`;

  // 字号切换控件 HTML
  const fontSizeHtml = `
<div class="font-size-control" id="fontSizeControl">
  <label>字号</label>
  <button data-size="small" onclick="setReaderFontSize('small')">小</button>
  <button data-size="medium" onclick="setReaderFontSize('medium')">中</button>
  <button data-size="large" onclick="setReaderFontSize('large')">大</button>
</div>`;

  // 在 </head> 前插入 CSS
  if (!html.includes('font-size-control-style')) {
    html = html.replace('</head>', fontSizeCss + '\n</head>');
  }

  // 在 </body> 前插入脚本
  if (!html.includes('font-size-control-script')) {
    html = html.replace('</body>', fontSizeScript + '\n</body>');
  }

  // 在工具栏区域插入控件（尝试多种常见选择器）
  if (!html.includes('fontSizeControl')) {
    // 尝试插入到 toolbar、header、nav 等常见位置
    const toolbarPatterns = [
      /(<div[^>]*class="[^"]*toolbar[^"]*"[^>]*>)/i,
      /(<div[^>]*class="[^"]*header[^"]*"[^>]*>)/i,
      /(<nav[^>]*>)/i,
      /(<div[^>]*id="[^"]*toolbar[^"]*"[^>]*>)/i,
      /(<div[^>]*id="[^"]*header[^"]*"[^>]*>)/i,
    ];

    let injected = false;
    for (const pattern of toolbarPatterns) {
      if (pattern.test(html)) {
        html = html.replace(pattern, `$1\n${fontSizeHtml}`);
        injected = true;
        break;
      }
    }

    // 如果找不到工具栏，插入到 body 开头
    if (!injected) {
      html = html.replace('<body>', `<body>\n${fontSizeHtml}`);
    }
  }

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('   ✅ Font-size control injected into reader/index.html');
}

buildReader();
