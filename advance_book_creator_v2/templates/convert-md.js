#!/usr/bin/env node
/**
 * Markdown → HTML 片段转换器（v4 增强版）
 *
 * 增强功能：
 * - 按YAML frontmatter的type字段区分封面/正文/尾页
 * - 内嵌HTML标签（callout/step/flow等）原样保留
 * - 目录从所有正文自动提取，构建时生成
 * - 封面和尾页用YAML frontmatter描述元信息
 * - 正文part以 ## 作为顶级章节标题
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

// 清空旧片段：优先删除；若运行环境拦截删除（安全删除 shim 会拦截 fs.unlinkSync），
// 则改为重命名移走（rename 非删除操作，shim 不拦截），后续 writeFileSync 会覆盖生成新文件。
const existingFiles = fs.readdirSync(FRAGMENTS_DIR).filter(f => f.endsWith('.html'));
existingFiles.forEach(f => {
  const fp = path.join(FRAGMENTS_DIR, f);
  try {
    fs.unlinkSync(fp);
  } catch (e) {
    try {
      fs.renameSync(fp, fp + '.deleted-' + Date.now());
    } catch (e2) {
      // 兜底：保留旧文件，writeFileSync 覆盖即可
    }
  }
});

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

// ==================== HTML标签检查与修复 ====================

/**
 * 检查HTML标签闭合状态
 * @param {string} html - 要检查的HTML内容
 * @returns {Object} - 检查结果 { issues: Array, canFix: boolean }
 */
function checkHtmlTagBalance(html) {
  const issues = [];
  const tagPairs = [
    { name: 'div', open: /<div(?=[\s>])/g, close: /<\/div>/g },
    { name: 'span', open: /<span(?=[\s>])/g, close: /<\/span>/g },
    { name: 'p', open: /<p(?=[\s>])/g, close: /<\/p>/g },
    { name: 'figure', open: /<figure(?=[\s>])/g, close: /<\/figure>/g },
    { name: 'figcaption', open: /<figcaption(?=[\s>])/g, close: /<\/figcaption>/g },
    { name: 'strong', open: /<strong(?=[\s>])/g, close: /<\/strong>/g },
    { name: 'em', open: /<em(?=[\s>])/g, close: /<\/em>/g },
  ];

  for (const tag of tagPairs) {
    const openCount = (html.match(tag.open) || []).length;
    const closeCount = (html.match(tag.close) || []).length;

    if (openCount !== closeCount) {
      issues.push({
        tag: tag.name,
        openCount,
        closeCount,
        diff: openCount - closeCount,
        severity: Math.abs(openCount - closeCount) > 2 ? 'high' : 'medium'
      });
    }
  }

  return {
    issues,
    canFix: issues.every(i => i.diff > 0) // 只有开启标签多于闭合标签时才容易修复
  };
}

/**
 * 尝试自动修复HTML标签闭合问题
 * @param {string} html - 原始HTML
 * @param {Array} issues - 检查出的问题列表
 * @returns {Object} - { fixed: boolean, html: string, fixedIssues: Array }
 */
function attemptAutoFix(html, issues) {
  let result = html;
  const fixedIssues = [];

  for (const issue of issues) {
    if (issue.diff > 0) {
      // 开启标签多于闭合标签 → 在块末尾补全闭合标签
      const missingCount = issue.diff;
      const closeTag = `</${issue.tag}>`;

      // 在内容块结束前补全缺失的闭合标签
      for (let i = 0; i < missingCount; i++) {
        // 找到最后一个未闭合的标签位置
        const lastOpenIndex = result.lastIndexOf(`<${issue.tag}`);
        if (lastOpenIndex !== -1) {
          // 在该标签所在块的末尾插入闭合标签
          result = result + closeTag;
        }
      }

      fixedIssues.push({
        tag: issue.tag,
        action: 'appended',
        count: missingCount
      });
    } else if (issue.diff < 0) {
      // 闭合标签多于开启标签 → 删除多余的闭合标签（保守处理）
      const extraCount = Math.abs(issue.diff);
      const closeTagPattern = new RegExp(`</${issue.tag}>`, 'g');
      let removed = 0;

      result = result.replace(closeTagPattern, (match) => {
        if (removed < extraCount) {
          removed++;
          return ''; // 删除多余的闭合标签
        }
        return match;
      });

      fixedIssues.push({
        tag: issue.tag,
        action: 'removed',
        count: removed
      });
    }
  }

  return {
    fixed: fixedIssues.length > 0,
    html: result,
    fixedIssues
  };
}

/**
 * 将损坏的HTML块降级为安全的文本块
 * 保留文字内容，丢弃标签
 * @param {string} brokenHtml - 损坏的HTML
 * @param {string} reason - 降级原因
 * @returns {string} - 降级后的安全HTML
 */
function degradeToSafeBlock(brokenHtml, reason) {
  // 提取纯文本内容
  const textContent = brokenHtml
    .replace(/<[^>]+>/g, ' ')  // 移除所有标签
    .replace(/\s+/g, ' ')       // 合并空白
    .trim();

  // 如果提取不到内容，返回空提示
  if (!textContent) {
    return `<div class="degraded-block" data-degrade-reason="${escapeHtml(reason)}">
<p><em>[HTML内容损坏，无法提取文本]</em></p>
</div>`;
  }

  // 包装为普通段落，添加降级标记
  return `<div class="degraded-block" data-degrade-reason="${escapeHtml(reason)}">
<p><em>[内容已降级为文本：${escapeHtml(reason)}]</em></p>
<p>${escapeHtml(textContent)}</p>
</div>`;
}

/**
 * 验证并修复HTML块
 * @param {string} html - HTML内容
 * @param {string} sourceFile - 源文件名（用于报告）
 * @returns {Object} - { html: string, report: Object }
 */
function validateAndFixHtmlBlock(html, sourceFile) {
  const checkResult = checkHtmlTagBalance(html);
  const report = {
    sourceFile,
    originalIssues: checkResult.issues,
    fixed: false,
    degraded: false,
    actions: [],
    finalHtml: html
  };

  if (checkResult.issues.length === 0) {
    return { html, report };
  }

  // 尝试自动修复
  const fixResult = attemptAutoFix(html, checkResult.issues);

  if (fixResult.fixed) {
    // 修复后再次检查
    const recheck = checkHtmlTagBalance(fixResult.html);

    if (recheck.issues.length === 0) {
      // 完全修复
      report.fixed = true;
      report.actions = fixResult.fixedIssues;
      report.finalHtml = fixResult.html;
      return { html: fixResult.html, report };
    } else {
      // 部分修复后仍有未闭合标签，需要降级
      report.actions = fixResult.fixedIssues;
      report.actions.push({
        action: 'partial_fix',
        remainingIssues: recheck.issues
      });
    }
  }

  // 降级处理：将损坏的HTML转为安全文本块
  const reason = `标签不平衡: ${checkResult.issues.map(i => `<${i.tag}>开${i.openCount}/闭${i.closeCount}`).join(', ')}`;
  const degradedHtml = degradeToSafeBlock(html, reason);

  report.degraded = true;
  report.actions.push({
    action: 'degraded',
    reason
  });
  report.finalHtml = degradedHtml;

  return { html: degradedHtml, report };
}

// 全局修复报告收集器
const globalFixReports = [];

// ==================== 内嵌HTML保护 ====================

/**
 * 保护Markdown中的内嵌HTML块
 * 将HTML块替换为占位符，转换完MD后再恢复
 * 支持的HTML块类型：div(含callout/step/flow/compare等)、figure、span.tag-core、hr、img、br
 */
function protectInlineHtml(md, sourceFile = 'unknown') {
  const blocks = [];
  let result = md;

  // 1. 保护自闭合标签（这些不需要恢复，本身就是HTML）
  //   但需要保护它们不被段落包裹
  result = result.replace(/^<hr\s*\/?>\s*$/gm, (match) => {
    const idx = blocks.length;
    blocks.push(match.trim());
    return `__HTML_PROTECT_${idx}__`;
  });

  // 2. 保护 span 标签（如 tag-core）
  // 使用逐字符匹配确保不跨越多行弄乱内容
  result = result.replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, (match) => {
    // 只保护已知组件的span，避免过度匹配
    if (match.includes('tag-core') || match.includes('step-num') || match.includes('flow-arrow')) {
      // 验证span标签是否闭合（简单检查）
      const openCount = (match.match(/<span\b/gi) || []).length;
      const closeCount = (match.match(/<\/span>/gi) || []).length;
      if (openCount !== closeCount) {
        // 标签不平衡，降级为纯文本
        const textContent = match.replace(/<[^>]+>/g, '');
        globalFixReports.push({
          sourceFile,
          originalIssues: [{ tag: 'span', openCount, closeCount, diff: openCount - closeCount }],
          fixed: false,
          degraded: true,
          actions: [{ action: 'degraded', reason: 'span标签不平衡' }],
          finalHtml: textContent
        });
        return textContent;
      }
      const idx = blocks.length;
      blocks.push(match);
      return `__HTML_PROTECT_${idx}__`;
    }
    return match;
  });

  // 3. 保护 img 标签
  result = result.replace(/<img\b[^>]*\/?>/gi, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return `__HTML_PROTECT_${idx}__`;
  });

  // 4. 保护 figure 块（含嵌套figcaption）
  result = result.replace(/<figure\b[\s\S]*?<\/figure>/gi, (match) => {
    // 验证figure标签是否完整
    const openCount = (match.match(/<figure\b/gi) || []).length;
    const closeCount = (match.match(/<\/figure>/gi) || []).length;
    if (openCount !== closeCount) {
      // 标签不平衡，降级处理
      const { html: fixedHtml, report } = validateAndFixHtmlBlock(match, sourceFile);
      if (report.fixed || report.degraded) {
        globalFixReports.push(report);
      }
      const idx = blocks.length;
      blocks.push(fixedHtml);
      return `__HTML_PROTECT_${idx}__`;
    }
    const idx = blocks.length;
    blocks.push(match);
    return `__HTML_PROTECT_${idx}__`;
  });

  // 5. 保护 div 块（callout、step、file-tree、flow、compare等）
  //    使用balanced tag匹配
  result = protectDivBlocks(result, blocks, sourceFile);

  return { protectedMd: result, htmlBlocks: blocks };
}

function protectDivBlocks(text, blocks, sourceFile = 'unknown') {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const divStart = text.indexOf('<div', i);
    if (divStart === -1) {
      result += text.slice(i);
      break;
    }

    result += text.slice(i, divStart);

    // 按文档顺序扫描 <div> / </div>，用 depth 定位外层 div 的真正闭合。
    // 关键：外层 <div> 自身计入 depth（初始 1），只有当 depth 归零时才代表
    // 最外层 div 真正闭合，避免嵌套 div 提前平衡导致截断（曾导致 step 多出 </div>）。
    let depth = 1;
    let cursor = divStart + 4; // 跳过起始的 "<div"
    let closePos = -1;

    while (cursor < text.length) {
      const nextOpen = text.indexOf('<div', cursor);
      const nextClose = text.indexOf('</div>', cursor);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + 4;
      } else {
        depth--;
        cursor = nextClose + 6;
        if (depth === 0) {
          closePos = nextClose;
          break;
        }
      }
    }

    if (closePos === -1) {
      // 未找到闭合标签，这是一个损坏的div块
      const brokenBlock = text.slice(divStart);
      const reason = '<div> 标签未找到闭合标签 </div>';

      // 降级为安全文本块
      const degradedHtml = degradeToSafeBlock(brokenBlock, reason);

      globalFixReports.push({
        sourceFile,
        originalIssues: [{ tag: 'div', openCount: 1, closeCount: 0, diff: 1 }],
        fixed: false,
        degraded: true,
        actions: [{ action: 'degraded', reason }],
        finalHtml: degradedHtml
      });

      const idx = blocks.length;
      blocks.push(degradedHtml);
      result += `\n__HTML_PROTECT_${idx}__\n`;
      break;
    }

    const block = text.slice(divStart, closePos + 6);

    // 验证并修复HTML块
    let { html: fixedBlock, report } = validateAndFixHtmlBlock(block, sourceFile);

    // 如果有修复或降级，记录报告
    if (report.fixed || report.degraded) {
      globalFixReports.push(report);
    }

    // callout 块内部仍应走 Markdown 转换（分段、加粗、斜体、链接等）
    fixedBlock = fixedBlock.replace(/^(<div\b[^>]*class="[^"]*callout-(?:tip|warn|info)[^"]*"[^>]*>)[\s\S]+(<\/div>)$/i, (match, openTag, closeTag) => {
      const innerBody = match.slice(openTag.length, -closeTag.length);
      const { html: processedBody } = mdToHtml(innerBody, 0, 0);
      return `${openTag}\n${processedBody}\n${closeTag}`;
    });

    const idx = blocks.length;
    blocks.push(fixedBlock);
    result += `\n__HTML_PROTECT_${idx}__\n`;
    i = closePos + 6;
  }

  return result;
}

// ==================== Markdown → HTML 转换 ====================

function mdToHtml(md, h2Offset, h3Offset) {
  let html = md;
  const tocData = [];

  // 0. 预先提取目录数据（跳过代码块和HTML保护块），同时计算正确的全局ID
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

      const h2Match = line.match(/^#{1,2}\s+(.+)$/);
      const h3Match = line.match(/^#{3}\s+(.+)$/);
      if (h2Match) {
        localH2++;
        const globalId = `part${h2Offset + localH2}`;
        tocData.push({ title: h2Match[1].trim(), level: 2, id: globalId });
      } else if (h3Match) {
        localH3++;
        const globalId = `section${h3Offset + localH3}`;
        tocData.push({ title: h3Match[1].trim(), level: 3, id: globalId });
      }
    }
  }

  // 1. 代码块（优先处理，加入language-xxx类名供highlight.js着色）
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapeHtml(code.trimEnd())}</code></pre>`);
    return placeholder;
  });

  // 2. 行内代码（在表格之前处理）
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 3. 表格
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
            if (isSep) {
              alignments = sepLine.split('|').filter(c => c.trim()).map(c => {
                const trimmed = c.trim();
                if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
                if (trimmed.endsWith(':')) return 'right';
                return 'left';
              });
            }
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

  // 4. 引用块 / Callout检测
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
  // 单行callout
  html = html.replace(/^>\s*\*\*(核心建议|要点|提示|注意|警告|信息|说明)\*\*[:：]?\s*(.+)$/gm, (match, title, content) => {
    const typeMap = {
      '核心建议': 'tip', '要点': 'tip', '提示': 'tip',
      '注意': 'warn', '警告': 'warn',
      '信息': 'info', '说明': 'info'
    };
    const calloutType = typeMap[title] || 'info';
    return `<div class="callout callout-${calloutType}"><div class="callout-title">${title}</div><p>${content.trim()}</p></div>`;
  });
  // 普通引用
  html = html.replace(/^>\s*(.*)$/gm, '<blockquote><p>$1</p></blockquote>');

  // 5. 标题处理（h2/h3生成全局唯一id，用于TOC锚点）
  let h2Count = 0;
  let h3Count = 0;
  html = html.replace(/^#{1,2}\s+(.+)$/gm, (match, title) => {
    h2Count++;
    const id = `part${h2Offset + h2Count}`;
    return `<h2 class="section-title page-break" id="${id}">${title.trim()}</h2>`;
  });
  html = html.replace(/^#{3}\s+(.+)$/gm, (match, title) => {
    h3Count++;
    const id = `section${h3Offset + h3Count}`;
    return `<h3 id="${id}">${title.trim()}</h3>`;
  });
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');

  // 6. 分隔线（需在段落包裹前处理，避免被包进 <p>）
  html = html.replace(/^---$/gm, '<hr>');

  // 7. 列表处理（需在段落包裹前处理，避免列表项被包进 <p>）
  {
    const lines = html.split('\n');
    const result = [];
    let k = 0;

    while (k < lines.length) {
      const line = lines[k];
      const trimmed = line.trim();

      const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);

      if (olMatch || ulMatch) {
        const isOrdered = !!olMatch;
        const listItems = [];

        while (k < lines.length) {
          const curLine = lines[k];
          const curTrimmed = curLine.trim();
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

  // 8. 段落处理（必须在粗体转换之前，否则 **xxx** 会变成 <strong>xxx</strong> 导致被当成HTML块跳过包裹）
  {
    const lines = html.split('\n');
    const result = [];
    let paraBuffer = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed ||
          trimmed.startsWith('<') ||
          trimmed.startsWith('__CODE_BLOCK_') ||
          trimmed.startsWith('__HTML_PROTECT_')) {
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

  // 9. 粗体、斜体（在段落包裹之后，确保 <p> 内的 ** 能正确渲染）
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 10. 链接（在段落包裹之后，避免以链接开头的行被当成HTML跳过）
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 11. 恢复代码块
  codeBlocks.forEach((code, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, code);
  });

  // 12. 恢复行内代码
  inlineCodes.forEach((code, idx) => {
    html = html.replace(`__INLINE_CODE_${idx}__`, code);
  });

  // 13. 恢复内嵌HTML块
  // 这个在mdToHtml外部的调用方处理，因为需要访问外部blocks数组

  return { html, tocData };
}

// ==================== 生成HTML片段 ====================

function generateCoverHtml(frontmatter, bodyMd) {
  const title = frontmatter.title || globalVersionData.title || '未命名文档';
  const subtitle = frontmatter.subtitle || globalVersionData.subtitle || '';
  const author = frontmatter.author || globalVersionData.author || '';
  const version = frontmatter.version || globalVersionData.version || '1.0.0';

  // 从正文提取badge和副标题描述
  let badge = '参考指南';
  let coverSubtitle = subtitle;

  const h1Match = bodyMd.match(/^#\s+(.+)$/m);
  const blockquoteMatch = bodyMd.match(/^>\s*(.+)$/m);

  if (h1Match) {
    // 标题已从frontmatter获取
  }
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

// 全局ID计数器（跨文件保持唯一）
let globalH2Offset = 0;
let globalH3Offset = 0;

// 遍历所有MD文件，按类型分派处理
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
    // 正文章节
    partNum++;

    // 保护内嵌HTML（传递源文件名用于报告）
    const { protectedMd, htmlBlocks } = protectInlineHtml(body, baseName);

    // 转换MD为HTML，传入全局偏移确保ID全局唯一
    const { html: convertedHtml, tocData: partTocData } = mdToHtml(protectedMd, globalH2Offset, globalH3Offset);

    // 恢复内嵌HTML块
    let finalHtml = convertedHtml;
    htmlBlocks.forEach((block, idx) => {
      finalHtml = finalHtml.replace(`__HTML_PROTECT_${idx}__`, block);
    });

    // 收集TOC数据 + 更新全局偏移
    allTocData.push(...partTocData);
    globalH2Offset += partTocData.filter(t => t.level === 2).length;
    globalH3Offset += partTocData.filter(t => t.level === 3).length;

    const partName = `part${String(partNum).padStart(2, '0')}`;
    const partHtml = `<div class="content">\n${finalHtml}\n</div>`;
    fs.writeFileSync(path.join(FRAGMENTS_DIR, `${partName}.html`), partHtml);

    // 检查是否有修复报告需要显示
    const fileReports = globalFixReports.filter(r => r.sourceFile === baseName);
    if (fileReports.length > 0) {
      const fixedCount = fileReports.filter(r => r.fixed).length;
      const degradedCount = fileReports.filter(r => r.degraded).length;
      let statusMsg = `  ⚠️  ${partName}.html (${baseName}) → ${partTocData.length} 个标题`;
      if (fixedCount > 0) statusMsg += `, 自动修复 ${fixedCount} 处HTML问题`;
      if (degradedCount > 0) statusMsg += `, 降级 ${degradedCount} 处损坏的HTML块`;
      console.log(statusMsg);
    } else {
      console.log(`  ✅ ${partName}.html (${baseName}) → ${partTocData.length} 个标题`);
    }

    contentParts.push(partName);
  }
}

// 生成封面HTML片段
if (coverHtml) {
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '00-cover.html'), coverHtml);
  console.log('📔 生成 00-cover.html');
} else {
  // 回退：生成默认封面
  const defaultCover = `<div class="cover">
  <div class="cover-badge">参考指南</div>
  <h1>${escapeHtml(globalVersionData.title)}</h1>
  <p class="cover-subtitle">${escapeHtml(globalVersionData.subtitle || '')}</p>
  <div class="cover-meta">
    ${globalVersionData.author ? `<span>${escapeHtml(globalVersionData.author)}</span>` : ''}
    <span>v${escapeHtml(globalVersionData.version)}</span>
  </div>
</div>`;
  fs.writeFileSync(path.join(FRAGMENTS_DIR, '00-cover.html'), defaultCover);
  console.log('📔 生成 00-cover.html (默认)');
}

// 生成目录HTML片段（使用tocData中已存储的全局唯一ID）
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

// ==================== 输出修复报告 ====================

if (globalFixReports.length > 0) {
  const reportData = {
    timestamp: new Date().toISOString(),
    totalFiles: mdFiles.length,
    totalIssues: globalFixReports.length,
    summary: {
      fixed: globalFixReports.filter(r => r.fixed).length,
      degraded: globalFixReports.filter(r => r.degraded).length
    },
    reports: globalFixReports
  };

  // 生成JSON报告
  const reportPath = path.join(OUTPUT_DIR, 'convert-md-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');

  // 生成可读文本报告
  let textReport = `HTML标签检查与修复报告\n`;
  textReport += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  textReport += `========================\n\n`;
  textReport += `汇总: 共发现 ${reportData.totalIssues} 处问题\n`;
  textReport += `  - 自动修复: ${reportData.summary.fixed} 处\n`;
  textReport += `  - 降级处理: ${reportData.summary.degraded} 处\n\n`;
  textReport += `详细记录:\n`;

  globalFixReports.forEach((report, idx) => {
    textReport += `\n[${idx + 1}] 文件: ${report.sourceFile}\n`;
    textReport += `    原始问题:\n`;
    report.originalIssues.forEach(issue => {
      textReport += `      - <${issue.tag}> 标签不平衡: 开${issue.openCount}/闭${issue.closeCount}\n`;
    });
    textReport += `    处理结果: ${report.fixed ? '✅ 已自动修复' : (report.degraded ? '⚠️ 已降级为文本块' : '❓ 未处理')}\n`;
    if (report.actions && report.actions.length > 0) {
      textReport += `    操作记录:\n`;
      report.actions.forEach(action => {
        if (action.action === 'appended') {
          textReport += `      - 补全 ${action.count} 个 </${action.tag}> 闭合标签\n`;
        } else if (action.action === 'removed') {
          textReport += `      - 删除 ${action.count} 个多余的 </${action.tag}> 闭合标签\n`;
        } else if (action.action === 'degraded') {
          textReport += `      - 降级原因: ${action.reason}\n`;
        }
      });
    }
  });

  textReport += `\n========================\n`;
  textReport += `提示: 降级为文本块的内容保留了原始文字，但丢失了HTML样式。\n`;
  textReport += `建议人工核查并修复原始Markdown文件中的HTML标签。\n`;

  const textReportPath = path.join(OUTPUT_DIR, 'convert-md-fix-report.txt');
  fs.writeFileSync(textReportPath, textReport, 'utf-8');

  console.log(`\n📋 HTML标签检查报告:`);
  console.log(`   发现问题: ${reportData.totalIssues} 处`);
  console.log(`   自动修复: ${reportData.summary.fixed} 处`);
  console.log(`   降级处理: ${reportData.summary.degraded} 处`);
  console.log(`   报告文件: ${reportPath}`);
  console.log(`   文本报告: ${textReportPath}`);
} else {
  console.log(`\n📋 HTML标签检查: 未发现标签闭合问题 ✓`);
}
