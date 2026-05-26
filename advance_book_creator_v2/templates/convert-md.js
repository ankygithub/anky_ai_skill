#!/usr/bin/env node
/**
 * Markdown → HTML 片段转换器（v5.2 修复版）
 *
 * 核心修复：
 * - 处理顺序：先转换自定义标签 → 保护代码块 → 保护标准HTML → Markdown转换 → 恢复所有
 * - 自定义标签先转换为标准HTML div，然后代码块保护可以正确识别 div 内部的 ``` 代码块
 * - 引用块支持嵌套解析
 */

const fs = require('fs');
const path = require('path');

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('用法: node convert-md.js <markdown文件或文件夹>');
  process.exit(1);
}

const FRAGMENTS_DIR = path.join(__dirname, 'fragments');
const VERSION_PATH = path.join(__dirname, 'version.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(FRAGMENTS_DIR)) fs.mkdirSync(FRAGMENTS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 清空旧片段
const existingFiles = fs.readdirSync(FRAGMENTS_DIR).filter(f => f.endsWith('.html'));
existingFiles.forEach(f => fs.unlinkSync(path.join(FRAGMENTS_DIR, f)));

// 读取全局版本信息（作为回退）
let globalVersionData = { title: '未命名文档', subtitle: '', author: '', version: '1.0.0' };
if (fs.existsSync(VERSION_PATH)) {
  try {
    globalVersionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
  } catch (e) { /* 忽略 */ }
}

// 判断源路径类型
const stat = fs.statSync(sourcePath);
let mdFiles = [];

if (stat.isDirectory()) {
  mdFiles = fs.readdirSync(sourcePath)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(sourcePath, f))
    .sort();
} else {
  mdFiles = [sourcePath];
}

console.log(`📄 发现 ${mdFiles.length} 个 Markdown 片段文件`);

// ==================== 工具函数 ====================

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: content };
  const lines = match[1].split('\n');
  const data = {};
  for (const line of lines) {
    const m = line.match(/^([\w_-]+):\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      val = val.replace(/^["']|["']$/g, '');
      if (val === 'null' || val === '~') val = null;
      if (val === 'true') val = true;
      if (val === 'false') val = false;
      data[m[1]] = val;
    }
  }
  return { data, body: content.slice(match[0].length) };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==================== 阶段1：自定义标签 → 标准HTML转换 ====================

/**
 * 将AI Agent使用的自定义标签转换为标准HTML
 * 此阶段代码块尚未被保护，所以正则可能匹配到代码块内的内容
 * 但代码块使用 ``` 包裹，不会被 <callout-tip> 等标签匹配到
 */
function convertCustomTagsToHtml(md) {
  let html = md;

  // 1. <callout-tip> → <div class="callout callout-tip"> (带图标)
  html = html.replace(/<callout-tip>\s*([\s\S]*?)<\/callout-tip>/gi, (match, content) => {
    return `<div class="callout callout-tip">\n  <div class="callout-icon">&#x1F4A1;</div>\n  <div class="callout-content">\n${content.trim()}\n  </div>\n</div>`;
  });

  // 2. <callout-warn> → <div class="callout callout-warn"> (带图标)
  html = html.replace(/<callout-warn>\s*([\s\S]*?)<\/callout-warn>/gi, (match, content) => {
    return `<div class="callout callout-warn">\n  <div class="callout-icon">&#x26A0;</div>\n  <div class="callout-content">\n${content.trim()}\n  </div>\n</div>`;
  });

  // 3. <callout-info> → <div class="callout callout-info"> (带图标)
  html = html.replace(/<callout-info>\s*([\s\S]*?)<\/callout-info>/gi, (match, content) => {
    return `<div class="callout callout-info">\n  <div class="callout-icon">&#x2139;</div>\n  <div class="callout-content">\n${content.trim()}\n  </div>\n</div>`;
  });

  // ===== 新增：标准 HTML Callout 格式支持（与上方自定义标签输出保持一致） =====
  // 3a. 标准格式 <div class="callout callout-tip"> → 添加 icon 和 content 包装
  // 匹配 SKILL.md 【模板-1】的标准格式，确保新旧书籍输出一致
  html = html.replace(/<div class="callout callout-tip">\s*<div class="callout-title">([^<]*)<\/div>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi, (match, title, content) => {
    return `<div class="callout callout-tip">\n  <div class="callout-icon">&#x1F4A1;</div>\n  <div class="callout-content">\n    <div class="callout-title">${title.trim()}</div>\n    <p>${content.trim()}</p>\n  </div>\n</div>`;
  });

  // 3b. 标准格式 <div class="callout callout-warn"> → 添加 icon 和 content 包装
  // 匹配 SKILL.md 【模板-2】的标准格式
  html = html.replace(/<div class="callout callout-warn">\s*<div class="callout-title">([^<]*)<\/div>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi, (match, title, content) => {
    return `<div class="callout callout-warn">\n  <div class="callout-icon">&#x26A0;</div>\n  <div class="callout-content">\n    <div class="callout-title">${title.trim()}</div>\n    <p>${content.trim()}</p>\n  </div>\n</div>`;
  });

  // 3c. 标准格式 <div class="callout callout-info"> → 添加 icon 和 content 包装
  // 匹配 SKILL.md 【模板-3】的标准格式
  html = html.replace(/<div class="callout callout-info">\s*<div class="callout-title">([^<]*)<\/div>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/gi, (match, title, content) => {
    return `<div class="callout callout-info">\n  <div class="callout-icon">&#x2139;</div>\n  <div class="callout-content">\n    <div class="callout-title">${title.trim()}</div>\n    <p>${content.trim()}</p>\n  </div>\n</div>`;
  });

  // 4. <step number="N" title="...">...</step> → 简洁步骤卡片
  // 逐个替换，绝不删除中间内容
  html = html.replace(/<step\s+number="(\d+)"\s+title="([^"]*)">\s*([\s\S]*?)<\/step>/gi,
    (match, num, title, content) => {
      return `<div class="step-card" data-step="${num}">\n` +
        `  <div class="step-header">\n` +
        `    <div class="step-phase">\n` +
        `      <span class="step-phase-num">${num}</span>\n` +
        `      <span class="step-phase-label">阶段</span>\n` +
        `    </div>\n` +
        `    <div class="step-title">${title}</div>\n` +
        `  </div>\n` +
        `  <div class="step-body">\n${content.trim()}\n  </div>\n` +
        `</div>`;
    });

  // 5. <step step="N">...</step> (简化版，无title属性)
  html = html.replace(/<step\s+step="(\d+)">\s*([\s\S]*?)<\/step>/gi,
    (match, num, content) => {
      return `<div class="step-card" data-step="${num}">\n` +
        `  <div class="step-header">\n` +
        `    <div class="step-phase">\n` +
        `      <span class="step-phase-num">${num}</span>\n` +
        `      <span class="step-phase-label">阶段</span>\n` +
        `    </div>\n` +
        `  </div>\n` +
        `  <div class="step-body">\n${content.trim()}\n  </div>\n` +
        `</div>`;
    });

  // ===== 新增：标准 HTML Step 格式支持（与上方自定义标签输出保持一致） =====
  // 5a. 标准格式 <div class="step"> + <div class="step-num"> + <div class="step-content">
  // 匹配 SKILL.md 【模板-4】的标准格式，转换为 step-card 结构
  html = html.replace(/<div class="step">\s*<div class="step-num">(\d+)<\/div>\s*<div class="step-content">\s*<h4>([^<]*)<\/h4>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<\/div>/gi,
    (match, num, title, content) => {
      return `<div class="step-card" data-step="${num}">\n` +
        `  <div class="step-header">\n` +
        `    <div class="step-phase">\n` +
        `      <span class="step-phase-num">${num}</span>\n` +
        `      <span class="step-phase-label">阶段</span>\n` +
        `    </div>\n` +
        `    <div class="step-title">${title.trim()}</div>\n` +
        `  </div>\n` +
        `  <div class="step-body">\n    <p>${content.trim()}</p>\n  </div>\n` +
        `</div>`;
    });

  // 6. <compare ...>...</compare> → 左右双栏对比
  html = html.replace(/<compare\s+([^>]*)>([\s\S]*?)<\/compare>/gi,
    (match, attrs, content) => {
      const leftTitle = (attrs.match(/left-title="([^"]*)"/) || [])[1] || '方案A';
      const rightTitle = (attrs.match(/right-title="([^"]*)"/) || [])[1] || '方案B';
      const centerTitle = (attrs.match(/center-title="([^"]*)"/) || [])[1] || '';

      // 使用更精确的方式提取 slot 内容：找到 slot="xxx" 后的第一个 > 和最后一个 </div>
      function extractSlot(slotName) {
        const pattern = new RegExp(`<div\\s+slot="${slotName}">([\\s\\S]*?)<\\/div>`, 'i');
        const m = content.match(pattern);
        if (!m) return '';
        // 检查内容中是否包含嵌套 div，如果有可能是提前匹配到了内层 div
        const inner = m[1].trim();
        // 简单启发式：如果内容中还有 <div 且没有对应的 </div>，说明匹配有问题
        const openDivs = (inner.match(/<div\b/gi) || []).length;
        const closeDivs = (inner.match(/<\/div>/gi) || []).length;
        if (openDivs > closeDivs) {
          // 嵌套 div 不匹配，尝试更贪婪的匹配
          const greedyPattern = new RegExp(`<div\\s+slot="${slotName}">([\\s\\S]*)<\\/div>\\s*(?:<div\\s+slot=|<\\/compare>)`, 'i');
          const gm = content.match(greedyPattern);
          if (gm) return gm[1].trim();
        }
        return inner;
      }

      let leftContent = extractSlot('left');
      let rightContent = extractSlot('right');
      let centerContent = extractSlot('center');

      // 尝试属性方式
      if (!leftContent && !rightContent) {
        const leftItems = [];
        const rightItems = [];
        const centerItems = [];
        const attrLines = attrs.split(/\s+/);
        for (const line of attrLines) {
          const lm = line.match(/left-item(\d+)="([^"]*)"/);
          const rm = line.match(/right-item(\d+)="([^"]*)"/);
          const cm = line.match(/center-item(\d+)="([^"]*)"/);
          if (lm) leftItems[parseInt(lm[1]) - 1] = lm[2];
          if (rm) rightItems[parseInt(rm[1]) - 1] = rm[2];
          if (cm) centerItems[parseInt(cm[1]) - 1] = cm[2];
        }
        leftContent = leftItems.filter(Boolean).map(i => `- ${i}`).join('\n');
        rightContent = rightItems.filter(Boolean).map(i => `- ${i}`).join('\n');
        centerContent = centerItems.filter(Boolean).map(i => `- ${i}`).join('\n');
      }

      // 兜底检查：如果解析结果异常（内容为空或太短），降级为普通文本块
      const totalContent = leftContent + rightContent + centerContent;
      const originalLength = content.replace(/<[^>]+>/g, '').trim().length;
      if (totalContent.length < originalLength * 0.3 && originalLength > 50) {
        // 降级：输出带边框的原始内容块，保留所有内容
        return `<div class="callout callout-info">\n` +
          `  <div class="callout-icon">&#x2139;</div>\n` +
          `  <div class="callout-content">\n` +
          `    <p><strong>对比：${escapeHtml(leftTitle)} vs ${escapeHtml(rightTitle)}</strong></p>\n` +
          `    <pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(content.trim())}</pre>\n` +
          `  </div>\n` +
          `</div>`;
      }

      // 构建左右双栏对比布局
      let compareHtml = '<div class="compare-block">\n';

      compareHtml += '  <div class="compare-item compare-bad">\n';
      compareHtml += `    <div class="compare-label">${escapeHtml(leftTitle)}</div>\n`;
      compareHtml += `    <div class="compare-content">\n${leftContent}\n    </div>\n`;
      compareHtml += '  </div>\n';

      if (centerTitle) {
        compareHtml += '  <div class="compare-item compare-center">\n';
        compareHtml += `    <div class="compare-label">${escapeHtml(centerTitle)}</div>\n`;
        compareHtml += `    <div class="compare-content">\n${centerContent}\n    </div>\n`;
        compareHtml += '  </div>\n';
      }

      compareHtml += '  <div class="compare-item compare-good">\n';
      compareHtml += `    <div class="compare-label">${escapeHtml(rightTitle)}</div>\n`;
      compareHtml += `    <div class="compare-content">\n${rightContent}\n    </div>\n`;
      compareHtml += '  </div>\n';

      compareHtml += '</div>';

      return compareHtml;
    });

  // ===== 新增：标准 HTML Compare 格式支持（与上方自定义标签输出保持一致） =====
  // 6a. 标准格式 <div class="compare"> + 两个 <div> 子元素
  // 匹配 SKILL.md 【模板-5】的标准格式，转换为 compare-block 结构
  // 格式：<div class="compare"><div><p><strong>不推荐</strong>...</p>...</div><div><p><strong>推荐</strong>...</p>...</div></div>
  html = html.replace(/<div class="compare">\s*<div>\s*<p><strong>([^<]*)<\/strong><\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<div>\s*<p><strong>([^<]*)<\/strong><\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<\/div>/gi,
    (match, leftLabel, leftContent, rightLabel, rightContent) => {
      return '<div class="compare-block">\n' +
        '  <div class="compare-item compare-bad">\n' +
        `    <div class="compare-label">${escapeHtml(leftLabel.trim())}</div>\n` +
        `    <div class="compare-content">\n      <p>${leftContent.trim()}</p>\n    </div>\n` +
        '  </div>\n' +
        '  <div class="compare-item compare-good">\n' +
        `    <div class="compare-label">${escapeHtml(rightLabel.trim())}</div>\n` +
        `    <div class="compare-content">\n      <p>${rightContent.trim()}</p>\n    </div>\n` +
        '  </div>\n' +
        '</div>';
    });

  // ===== 新增：<tag-core> 自定义标签支持（容错旧错误写法） =====
  // 7. <tag-core>内容</tag-core> → <span class="tag-core">内容</span>
  // 匹配 SKILL.md 【模板-6】的错误写法（旧书籍可能使用），转换为正确格式
  html = html.replace(/<tag-core>\s*([^<]*)\s*<\/tag-core>/gi, (match, content) => {
    return `<span class="tag-core">${content.trim()}</span>`;
  });

  return html;
}

// ==================== 阶段2：保护代码块 ====================

/**
 * 保护代码块，避免被后续Markdown转换破坏
 * 此时自定义标签已转换为标准HTML div，代码块可能在div内部
 */
function protectCodeBlocks(md) {
  const codeBlocks = [];
  let result = md;

  // 保护 fenced code blocks (```lang\ncode\n```)
  // 使用 ^\s*``` 匹配行首可能有缩进的代码块标记
  // [\w-]* 支持带连字符的语言标识符（如 ssh-config）
  result = result.replace(/^\s*```([\w-]*)\n([\s\S]*?)^\s*```/gm, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapeHtml(code.trimEnd())}</code></pre>`);
    return placeholder;
  });

  return { protectedMd: result, codeBlocks };
}

// ==================== 阶段3：标准HTML保护 ====================

function protectStandardHtml(md) {
  const blocks = [];
  let result = md;

  // 1. 保护 hr 标签
  result = result.replace(/^<hr\s*\/?>\s*$/gm, (match) => {
    const idx = blocks.length;
    blocks.push(match.trim());
    return `__HTML_PROTECT_${idx}__`;
  });

  // 2. 保护 img 标签
  result = result.replace(/<img\b[^>]*\/?>/gi, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return `__HTML_PROTECT_${idx}__`;
  });

  // 3. 保护 figure 块
  result = result.replace(/<figure\b[\s\S]*?<\/figure>/gi, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return `__HTML_PROTECT_${idx}__`;
  });

  // 4. 保护 div 块（现在已经是标准HTML了）
  result = protectDivBlocks(result, blocks);

  return { protectedMd: result, htmlBlocks: blocks };
}

function protectDivBlocks(text, blocks) {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const divStart = text.indexOf('<div', i);
    if (divStart === -1) {
      result += text.slice(i);
      break;
    }

    result += text.slice(i, divStart);

    // 检查 div 的 class 属性
    const divEnd = text.indexOf('>', divStart);
    const divTag = divEnd !== -1 ? text.slice(divStart, divEnd + 1) : '';

    // 跳过这些 div，让其内部的 Markdown 能被正常转换
    // 这些 div 由 convertCustomTagsToHtml 生成，内部包含原始 Markdown
    const skipClasses = ['callout', 'callout-content', 'compare-block', 'compare-item', 'compare-content', 'step-card', 'step-body'];
    const shouldSkip = skipClasses.some(cls =>
      divTag.includes(`class="${cls}`) || divTag.includes(`class='${cls}`)
    );

    let depth = 0;
    let pos = divStart;
    let found = false;

    while (pos < text.length) {
      const nextOpen = text.indexOf('<div', pos + 1);
      const nextClose = text.indexOf('</div>', pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen;
      } else {
        if (depth === 0) {
          const blockEnd = nextClose + '</div>'.length;
          if (shouldSkip) {
            // 不保护这个 div，但递归处理其内部（可能包含嵌套 div）
            const block = text.slice(divStart, blockEnd);
            // 提取开标签和闭标签之间的内容
            const openTagEnd = block.indexOf('>') + 1;
            const closeTagStart = block.lastIndexOf('</div>');
            const innerContent = block.slice(openTagEnd, closeTagStart);
            // 递归处理内部内容
            const processedInner = protectDivBlocks(innerContent, blocks);
            result += block.slice(0, openTagEnd) + processedInner + block.slice(closeTagStart);
            i = blockEnd;
            found = true;
            break;
          } else {
            const block = text.slice(divStart, blockEnd);
            const idx = blocks.length;
            blocks.push(block);
            result += `\n__HTML_PROTECT_${idx}__\n`;
            i = blockEnd;
            found = true;
            break;
          }
        } else {
          depth--;
          pos = nextClose + '</div>'.length;
        }
      }
    }

    if (!found) {
      result += text.slice(divStart);
      break;
    }
  }

  return result;
}

// ==================== 阶段4：Markdown → HTML 转换 ====================

function toChineseNum(n) {
  const digits = '零一二三四五六七八九';
  if (n <= 10) return digits[n];
  if (n < 20) return '十' + (n % 10 === 0 ? '' : digits[n % 10]);
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return digits[tens] + '十' + (ones === 0 ? '' : digits[ones]);
  }
  return String(n);
}

function correctChapterNumber(title, globalNum) {
  if (globalNum === undefined || globalNum === null || isNaN(globalNum)) {
    return title.trim();
  }
  const chineseDigits = '[零一二三四五六七八九十百]';
  const arabicDigits = '\\d+';
  const chapterPattern = new RegExp(`^第(${chineseDigits}|${arabicDigits})章\\s*`);
  const corrected = title.replace(chapterPattern, `第${toChineseNum(globalNum)}章 `);
  return corrected.trim();
}

function renderBlockquote(lines) {
  const content = lines.join('\n');
  let inner = content;
  // 处理内部粗体
  inner = inner.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // 处理内部行内代码
  inner = inner.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // 处理内部无序列表
  const listItems = [];
  const nonListLines = [];
  const innerLines = inner.split('\n');
  for (const line of innerLines) {
    const listMatch = line.match(/^-\s+(.+)$/);
    if (listMatch) {
      if (nonListLines.length > 0) {
        listItems.push({ type: 'text', content: nonListLines.join('\n') });
        nonListLines.length = 0;
      }
      listItems.push({ type: 'li', content: listMatch[1] });
    } else {
      nonListLines.push(line);
    }
  }
  if (nonListLines.length > 0) {
    listItems.push({ type: 'text', content: nonListLines.join('\n') });
  }

  if (listItems.length > 0 && listItems.some(i => i.type === 'li')) {
    let result = '<blockquote>\n';
    let inList = false;
    for (const item of listItems) {
      if (item.type === 'li') {
        if (!inList) {
          result += '<ul>\n';
          inList = true;
        }
        result += `  <li>${item.content}</li>\n`;
      } else {
        if (inList) {
          result += '</ul>\n';
          inList = false;
        }
        const paragraphs = item.content.split('\n\n').filter(p => p.trim());
        for (const para of paragraphs) {
          result += `<p>${para.trim()}</p>\n`;
        }
      }
    }
    if (inList) {
      result += '</ul>\n';
    }
    result += '</blockquote>';
    return result;
  }

  // 没有列表，按段落处理
  const paragraphs = inner.split('\n\n').filter(p => p.trim());
  if (paragraphs.length === 1) {
    return `<blockquote>\n<p>${paragraphs[0].trim()}</p>\n</blockquote>`;
  }
  return '<blockquote>\n' + paragraphs.map(p => `<p>${p.trim()}</p>`).join('\n') + '\n</blockquote>';
}

function mdToHtml(md, h2Offset, h3Offset) {
  let html = md;
  const tocData = [];

  // 0. 预先提取目录数据
  {
    const lines = html.split('\n');
    let inCodeBlock = false;
    let localH2 = 0;
    let localH3 = 0;
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;
      if (/^__HTML_PROTECT_\d+__$/.test(line.trim())) continue;
      if (/^__CODE_BLOCK_\d+__$/.test(line.trim())) continue;

      const h2Match = line.match(/^#{1,2}\s+(.+)$/);
      const h3Match = line.match(/^#{3}\s+(.+)$/);
      if (h2Match) {
        localH2++;
        const globalNum = h2Offset + localH2;
        const globalId = `part${globalNum}`;
        const correctedTitle = correctChapterNumber(h2Match[1].trim(), globalNum);
        tocData.push({ title: correctedTitle, level: 2, id: globalId });
      } else if (h3Match) {
        localH3++;
        const globalId = `section${h3Offset + localH3}`;
        tocData.push({ title: h3Match[1].trim(), level: 3, id: globalId });
      }
    }
  }

  // 1. 行内代码
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. 表格
  {
    const lines = html.split('\n');
    const result = [];
    let j = 0;
    while (j < lines.length) {
      const line = lines[j];
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines = [];
        while (j < lines.length) {
          const l = lines[j].trim();
          if (l.startsWith('|') && l.endsWith('|')) {
            tableLines.push(l);
            j++;
          } else {
            break;
          }
        }
        if (tableLines.length >= 2) {
          const sepLine = tableLines[1];
          const isSep = sepLine.replace(/\|/g, '').trim().replace(/[-:\s]/g, '') === '';
          if (isSep) {
            let alignments = [];
            alignments = sepLine.split('|').filter(c => c.trim()).map(c => {
              const trimmed = c.trim();
              if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
              if (trimmed.endsWith(':')) return 'right';
              return 'left';
            });
            let tableHtml = '<table>\n<thead>\n<tr>';
            const headers = tableLines[0].split('|').filter(c => c.trim());
            headers.forEach((h, hi) => {
              const align = alignments[hi] ? ` style="text-align:${alignments[hi]}"` : '';
              tableHtml += `<th${align}>${h.trim()}</th>`;
            });
            tableHtml += '</tr>\n</thead>\n<tbody>\n';
            for (let k = 2; k < tableLines.length; k++) {
              const cells = tableLines[k].split('|').filter(c => c.trim());
              tableHtml += '<tr>';
              cells.forEach((c, ci) => {
                const align = alignments[ci] ? ` style="text-align:${alignments[ci]}"` : '';
                tableHtml += `<td${align}>${c.trim()}</td>`;
              });
              tableHtml += '</tr>\n';
            }
            tableHtml += '</tbody>\n</table>';
            result.push(tableHtml);
            continue;
          }
        }
        result.push(...tableLines);
      } else {
        result.push(line);
        j++;
      }
    }
    html = result.join('\n');
  }

  // 3. 引用块 / Callout检测（先检测特殊callout格式）
  html = html.replace(/^>\s*\*\*(核心建议|要点|提示)\*\*[:：]?\s*\n((?:>\s.*\n?)+)/gm, (match, title, content) => {
    const body = content.replace(/^>\s?/gm, '').trim();
    return `<div class="callout callout-tip"><div class="callout-title">${title}</div><p>${body}</p></div>`;
  });
  html = html.replace(/^>\s*\*\*(注意|警告)\*\*[:：]?\s*\n((?:>\s.*\n?)+)/gm, (match, title, content) => {
    const body = content.replace(/^>\s?/gm, '').trim();
    return `<div class="callout callout-warn"><div class="callout-title">${title}</div><p>${body}</p></div>`;
  });
  html = html.replace(/^>\s*\*\*(信息|说明)\*\*[:：]?\s*\n((?:>\s.*\n?)+)/gm, (match, title, content) => {
    const body = content.replace(/^>\s?/gm, '').trim();
    return `<div class="callout callout-info"><div class="callout-title">${title}</div><p>${body}</p></div>`;
  });
  html = html.replace(/^>\s*\*\*(核心建议|要点|提示|注意|警告|信息|说明)\*\*[:：]?\s*(.+)$/gm, (match, title, content) => {
    const typeMap = {
      '核心建议': 'tip', '要点': 'tip', '提示': 'tip',
      '注意': 'warn', '警告': 'warn',
      '信息': 'info', '说明': 'info'
    };
    const calloutType = typeMap[title] || 'info';
    return `<div class="callout callout-${calloutType}"><div class="callout-title">${title}</div><p>${content.trim()}</p></div>`;
  });

  // 4. 标准引用块处理：连续>行合并为一个blockquote
  {
    const lines = html.split('\n');
    const result = [];
    let quoteLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^>\s?(.*)$/);

      if (match) {
        quoteLines.push(match[1]);
      } else {
        if (quoteLines.length > 0) {
          result.push(renderBlockquote(quoteLines));
          quoteLines = [];
        }
        result.push(line);
      }
    }

    if (quoteLines.length > 0) {
      result.push(renderBlockquote(quoteLines));
    }

    html = result.join('\n');
  }

  // 5. 标题处理
  let h2Count = 0;
  let h3Count = 0;
  html = html.replace(/^#{1,2}\s+(.+)$/gm, (match, title) => {
    h2Count++;
    const id = `part${h2Offset + h2Count}`;
    const correctedTitle = correctChapterNumber(title.trim(), h2Offset + h2Count);
    return `<h2 class="section-title page-break" id="${id}">${correctedTitle}</h2>`;
  });
  html = html.replace(/^#{3}\s+(.+)$/gm, (match, title) => {
    h3Count++;
    const id = `section${h3Offset + h3Count}`;
    return `<h3 id="${id}">${title.trim()}</h3>`;
  });
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');

  // 6. 粗体、斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 7. 分隔线
  html = html.replace(/^---$/gm, '<hr>');

  // 8. 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 9. 列表处理（跳过 blockquote 内部）
  {
    const lines = html.split('\n');
    const result = [];
    let k = 0;
    let inBlockquote = false;

    while (k < lines.length) {
      const line = lines[k];
      const trimmed = line.trim();

      // 跟踪 blockquote 状态
      if (trimmed.startsWith('<blockquote>')) inBlockquote = true;
      if (trimmed.startsWith('</blockquote>')) {
        inBlockquote = false;
        result.push(line);
        k++;
        continue;
      }

      if (inBlockquote) {
        result.push(line);
        k++;
        continue;
      }

      const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);

      if (olMatch || ulMatch) {
        const isOrdered = !!olMatch;
        const listItems = [];

        while (k < lines.length) {
          const curLine = lines[k];
          const curTrimmed = curLine.trim();

          // 遇到 blockquote 或 HTML 标签开始则停止列表
          if (curTrimmed.startsWith('<blockquote>')) break;
          if (curTrimmed.startsWith('<') && !curTrimmed.match(/^<(li|ul|ol)\b/)) break;

          const curOl = curTrimmed.match(/^(\d+)\.\s+(.+)$/);
          const curUl = curTrimmed.match(/^[-*]\s+(.+)$/);

          if (curOl || curUl) {
            const curIsOrdered = !!curOl;
            if (curIsOrdered === isOrdered) {
              const content = curIsOrdered ? curOl[2] : curUl[1];
              listItems.push(content);
              k++;
            } else {
              break;
            }
          } else if (curTrimmed === '') {
            break;
          } else {
            if (listItems.length > 0) {
              listItems[listItems.length - 1] += ' ' + curTrimmed;
              k++;
            } else {
              break;
            }
          }
        }

        if (listItems.length > 0) {
          const tag = isOrdered ? 'ol' : 'ul';
          result.push(`<${tag}>`);
          listItems.forEach(item => {
            result.push(`  <li>${item}</li>`);
          });
          result.push(`</${tag}>`);
        }
      } else {
        result.push(line);
        k++;
      }
    }
    html = result.join('\n');
  }

  // 10. 段落处理
  {
    const lines = html.split('\n');
    const result = [];
    let paraBuffer = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed ||
          trimmed.startsWith('<') ||
          trimmed.startsWith('__CODE_BLOCK_') ||
          trimmed.startsWith('__HTML_PROTECT_') ||
          trimmed.startsWith('__INLINE_CODE_')) {
        if (paraBuffer.length > 0) {
          result.push(`<p>${paraBuffer.join(' ')}</p>`);
          paraBuffer = [];
        }
        result.push(line);
      } else {
        paraBuffer.push(trimmed);
      }
    }
    if (paraBuffer.length > 0) {
      result.push(`<p>${paraBuffer.join(' ')}</p>`);
    }
    html = result.join('\n');
  }

  return { html, tocData, inlineCodes };
}

// ==================== 生成HTML片段 ====================

function generateCoverHtml(frontmatter, bodyMd) {
  const title = frontmatter.title || globalVersionData.title || '未命名文档';
  const subtitle = frontmatter.subtitle || globalVersionData.subtitle || '';
  const author = frontmatter.author || globalVersionData.author || '';
  const version = frontmatter.version || globalVersionData.version || '1.0.0';

  let badge = '参考指南';
  let coverSubtitle = subtitle;

  const blockquoteMatch = bodyMd.match(/^>\s*(.+)$/m);
  if (blockquoteMatch && !subtitle) {
    coverSubtitle = blockquoteMatch[1].trim();
  }

  return `<div class="cover">
  <div class="cover-badge">${escapeHtml(badge)}</div>
  <h1>${escapeHtml(title)}</h1>
  <p class="cover-subtitle">${escapeHtml(coverSubtitle)}</p>
  <div class="cover-meta">
    ${author ? `<span>${escapeHtml(author)}</span>` : ''}
    <span>v${escapeHtml(version)}</span>
  </div>
</div>`;
}

function generateBackpageHtml(frontmatter) {
  const title = frontmatter.title || globalVersionData.title || '未命名文档';
  const version = frontmatter.version || globalVersionData.version || '1.0.0';
  const author = frontmatter.author || globalVersionData.author || '';

  return `<div class="backpage">
  <h2>文档结束</h2>
  <p>${escapeHtml(title)} v${escapeHtml(version)}</p>
  ${author ? `<p>${escapeHtml(author)}</p>` : ''}
</div>`;
}

// ==================== 主流程 ====================

let partNum = 0;
const allTocData = [];
let coverHtml = null;
let backpageHtml = null;
const contentParts = [];

let globalH2Offset = 0;
let globalH3Offset = 0;

for (const mdFile of mdFiles) {
  const rawContent = fs.readFileSync(mdFile, 'utf-8');
  const { data: frontmatter, body } = parseFrontmatter(rawContent);
  const fileType = frontmatter.type || 'chapter';
  const baseName = path.basename(mdFile, '.md');

  if (fileType === 'cover') {
    coverHtml = generateCoverHtml(frontmatter, body);
    console.log(`  📔 封面 (${baseName})`);
  } else if (fileType === 'backpage') {
    backpageHtml = generateBackpageHtml(frontmatter);
    console.log(`  📔 尾页 (${baseName})`);
  } else {
    partNum++;

    // 阶段1：自定义标签 → 标准HTML
    const stage1 = convertCustomTagsToHtml(body);

    // 阶段2：保护代码块（此时代码块在div内部也能被正确识别）
    const { protectedMd: stage2, codeBlocks } = protectCodeBlocks(stage1);

    // 阶段3：保护标准HTML（包括div块）
    const { protectedMd: stage3, htmlBlocks } = protectStandardHtml(stage2);

    // 阶段4：Markdown → HTML 转换
    const { html: convertedHtml, tocData: partTocData, inlineCodes } = mdToHtml(stage3, globalH2Offset, globalH3Offset);

    // 恢复所有占位符
    let finalHtml = convertedHtml;

    // 先恢复HTML块（此时HTML块内部可能包含代码块占位符和行内代码占位符）
    htmlBlocks.forEach((block, idx) => {
      finalHtml = finalHtml.replace(new RegExp(`__HTML_PROTECT_${idx}__`, 'g'), block);
    });

    // 再恢复代码块（HTML块恢复后，代码块占位符现在暴露出来了）
    codeBlocks.forEach((code, idx) => {
      finalHtml = finalHtml.replace(new RegExp(`__CODE_BLOCK_${idx}__`, 'g'), code);
    });

    // 最后恢复行内代码
    inlineCodes.forEach((code, idx) => {
      finalHtml = finalHtml.replace(new RegExp(`__INLINE_CODE_${idx}__`, 'g'), code);
    });

    // 处理htmlBlocks中未被替换的行内代码（htmlBlocks中的原始<div>包含反引号）
    // 使用全局替换确保所有匹配都被替换
    let remainingInline;
    do {
      remainingInline = false;
      finalHtml = finalHtml.replace(/`([^`\n]+)`/g, (match, code) => {
        remainingInline = true;
        return `<code>${escapeHtml(code)}</code>`;
      });
    } while (remainingInline);

    // 收集TOC数据
    allTocData.push(...partTocData);
    globalH2Offset += partTocData.filter(t => t.level === 2).length;
    globalH3Offset += partTocData.filter(t => t.level === 3).length;

    const partName = `part${String(partNum).padStart(2, '0')}`;
    const partHtml = `<div class="content">\n${finalHtml}\n</div>`;
    fs.writeFileSync(path.join(FRAGMENTS_DIR, `${partName}.html`), partHtml);

    console.log(`  ✅ ${partName}.html (${baseName}) → ${partTocData.length} 个标题`);
    contentParts.push(partName);
  }
}

// 生成封面HTML片段
if (coverHtml) {
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '00-cover.html'), coverHtml);
  console.log('📔 生成 00-cover.html');
} else {
  const defaultCover = `<div class="cover">
  <div class="cover-badge">参考指南</div>
  <h1>${escapeHtml(globalVersionData.title)}</h1>
  <p class="cover-subtitle">${escapeHtml(globalVersionData.subtitle || '')}</p>
  <div class="cover-meta">
    ${globalVersionData.author ? `<span>${escapeHtml(author)}</span>` : ''}
    <span>v${escapeHtml(globalVersionData.version)}</span>
  </div>
</div>`;
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '00-cover.html'), defaultCover);
  console.log('📔 生成 00-cover.html (默认)');
}

// 生成目录HTML片段
let tocHtml = `<div class="content">\n<div class="toc">\n<h2>目录</h2>\n<ul>\n`;
for (const item of allTocData) {
  const id = item.id;
  if (item.level === 3) {
    tocHtml += `  <li class="toc-sub"><a href="#${id}"><span class="toc-title-text">${escapeHtml(item.title)}</span></a></li>\n`;
  } else {
    tocHtml += `  <li><a href="#${id}"><span class="toc-title-text">${escapeHtml(item.title)}</span></a></li>\n`;
  }
}
tocHtml += `</ul>\n</div>\n</div>`;
fs.writeFileSync(path.join(FRAGMENTS_DIR, '01-toc.html'), tocHtml);
console.log(`📑 生成 01-toc.html (${allTocData.length} 个条目)`);

// 生成尾页HTML片段
if (backpageHtml) {
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '99-backpage.html'), backpageHtml);
  console.log('📔 生成 99-backpage.html');
} else {
  const defaultBackpage = `<div class="backpage">
  <h2>文档结束</h2>
  <p>${escapeHtml(globalVersionData.title)} v${escapeHtml(globalVersionData.version)}</p>
  ${globalVersionData.author ? `<p>${escapeHtml(globalVersionData.author)}</p>` : ''}
</div>`;
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '99-backpage.html'), defaultBackpage);
  console.log('📔 生成 99-backpage.html (默认)');
}

console.log(`\n🎉 共生成 ${partNum + 3} 个HTML片段（封面+目录+正文+尾页）`);
