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

if (!fs.existsSync(FRAGMENTS_DIR)) fs.mkdirSync(FRAGMENTS_DIR, { recursive: true });

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

// ==================== 内嵌HTML保护 ====================

/**
 * 保护Markdown中的内嵌HTML块
 * 将HTML块替换为占位符，转换完MD后再恢复
 * 支持的HTML块类型：div(含callout/step/flow/compare等)、figure、span.tag-core、hr、img、br
 */
function protectInlineHtml(md) {
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
    const idx = blocks.length;
    blocks.push(match);
    return `__HTML_PROTECT_${idx}__`;
  });

  // 5. 保护 div 块（callout、step、file-tree、flow、compare等）
  //    使用balanced tag匹配
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

    // 找到闭合的 </div>
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
          // 找到匹配的闭合标签
          const block = text.slice(divStart, nextClose + '</div>'.length);
          const idx = blocks.length;
          blocks.push(block);
          result += `\n__HTML_PROTECT_${idx}__\n`;
          i = nextClose + '</div>'.length;
          found = true;
          break;
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

  // 6. 粗体、斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 7. 分隔线（已被HTML保护处理过的不管）
  html = html.replace(/^---$/gm, '<hr>');

  // 8. 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 9. 列表处理
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

    // 保护内嵌HTML
    const { protectedMd, htmlBlocks } = protectInlineHtml(body);

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
    contentParts.push(partName);
    console.log(`  ✅ ${partName}.html (${baseName}) → ${partTocData.length} 个标题`);
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
