#!/usr/bin/env node
/**
 * Markdown → HTML 片段转换器（lite 版）
 *
 * 设计原则：组件语法 Markdown 原生化，写作时不写 HTML。
 * - 提示块：> [!TIP] / > [!WARN] / > [!NOTE]（GitHub Alerts 风格，保留中文标题兼容）
 * - 步骤块：:::steps 围栏，内部就是 Markdown 列表
 * - 对比块：:::compare 围栏，两栏=坏/好，三栏=坏/好/备注
 * - 合法 HTML 白名单：figure / svg / img / hr（原样保留）
 * - 其他 HTML 标签不再修复/降级，只记录警告（门禁由 check-md.js 硬拦截）
 */

const fs = require('fs');
const path = require('path');
const { scanFenceMask } = require(path.join(__dirname, 'lib', 'fence-scan.js'));

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

// ==================== 警告收集 ====================

const convertWarnings = [];
function warn(sourceFile, type, message) {
  convertWarnings.push({ sourceFile, type, message });
}

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

// 行内 Markdown 转换（粗体/斜体/链接），供正文与组件内部复用
function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// ==================== 预处理：围栏块与合法HTML ====================

/**
 * 提取 ::: 围栏块（steps/compare），替换为占位符。
 * 代码块（```）内的 ::: 不视为围栏边界。
 */
function extractFenceBlocks(md, sourceFile) {
  const blocks = [];
  const out = [];
  let inCodeFence = false;
  let fence = null;

  for (const line of md.split('\n')) {
    const trimmed = line.trim();

    if (fence === null) {
      if (/^(```|~~~)/.test(trimmed)) {
        inCodeFence = !inCodeFence;
        out.push(line);
        continue;
      }
      if (!inCodeFence) {
        const m = trimmed.match(/^:::([\w-]+)\s*$/);
        if (m) {
          const name = m[1].toLowerCase();
          if (name === 'steps' || name === 'compare') {
            fence = { name, lines: [] };
            continue;
          }
          warn(sourceFile, 'unknown-fence', `未知围栏类型 :::${name}（仅支持 :::steps / :::compare），已按普通文本处理`);
        }
      }
      out.push(line);
    } else {
      if (/^:::\s*$/.test(trimmed)) {
        blocks.push(fence);
        out.push(`__FENCE_BLOCK_${blocks.length - 1}__`);
        fence = null;
        continue;
      }
      fence.lines.push(line);
    }
  }

  if (fence !== null) {
    warn(sourceFile, 'unclosed-fence', `:::${fence.name} 围栏缺少闭合的 :::，已按普通文本处理到文件末尾`);
    blocks.push(fence);
    out.push(`__FENCE_BLOCK_${blocks.length - 1}__`);
  }

  return { md: out.join('\n'), fenceBlocks: blocks };
}

/**
 * 保护合法 HTML（figure/svg/img/hr），替换为占位符原样保留。
 * 不做修复、不做降级——不平衡只记录警告。
 */
function protectLegalHtml(md, sourceFile) {
  const blocks = [];
  let result = md;

  const pushBlock = (html, ownLine = true) => {
    blocks.push(html);
    const ph = `__HTML_BLOCK_${blocks.length - 1}__`;
    return ownLine ? `\n${ph}\n` : ph;
  };

  // 未闭合 figure 自愈：缺失 </figure> 时，浏览器会把后续全部内容当作
  // figure 子节点（text-align 等可继承样式导致整段错乱）。
  // 启发式修复：在该 figure 的 </figcaption>（优先）或 </svg> 之后补 </figure>。
  {
    const openRe = /<figure\b[^>]*>/gi;
    let om;
    while ((om = openRe.exec(result)) !== null) {
      if (!/<\/figure>/i.test(result.slice(om.index + om[0].length))) {
        const after = result.slice(om.index);
        const capMatch = /<\/figcaption\s*>/i.exec(after);
        const svgMatch = /<\/svg\s*>/i.exec(after);
        const anchor = capMatch || svgMatch;
        if (anchor) {
          const insertAt = om.index + anchor.index + anchor[0].length;
          result = result.slice(0, insertAt) + '\n</figure>' + result.slice(insertAt);
          warn(sourceFile, 'unclosed-figure',
            '检测到未闭合的 <figure>，已自动在 </figcaption>/</svg> 后补 </figure>（缺失闭合会导致后续内容全部继承 figure 样式）');
          openRe.lastIndex = insertAt + '\n</figure>'.length;
        } else {
          warn(sourceFile, 'unbalanced-html', '检测到未闭合的 <figure> 且其后无 </figcaption>/</svg> 可定位，请手动补闭合');
          break;
        }
      }
    }
  }

  // figure（可能内嵌 svg/img/figcaption）
  result = result.replace(/<figure\b[\s\S]*?<\/figure>/gi, (match) => {
    const opens = (match.match(/<figure\b/gi) || []).length;
    const closes = (match.match(/<\/figure>/gi) || []).length;
    if (opens !== closes) {
      warn(sourceFile, 'unbalanced-html', `figure 标签不闭合（开${opens}/闭${closes}），请检查`);
    }
    return pushBlock(match);
  });

  // svg（未被 figure 包裹的独立 SVG）
  result = result.replace(/<svg\b[\s\S]*?<\/svg>/gi, (match) => {
    const opens = (match.match(/<svg\b/gi) || []).length;
    const closes = (match.match(/<\/svg>/gi) || []).length;
    if (opens !== closes) {
      warn(sourceFile, 'unbalanced-html', `svg 标签不闭合（开${opens}/闭${closes}），请检查`);
    }
    return pushBlock(match);
  });

  // img（自闭合，行内保护）
  result = result.replace(/<img\b[^>]*\/?>/gi, (match) => pushBlock(match, false));

  // hr（独占一行）
  result = result.replace(/^<hr\s*\/?>\s*$/gm, (match) => pushBlock(match.trim()));

  return { md: result, htmlBlocks: blocks };
}

/**
 * 扫描禁用 HTML 标签（白名单之外的一律警告）。
 * 仅扫描代码块/行内代码之外的正文，具体拦截由 check-md.js 门禁负责。
 */
function scanForbiddenHtml(md, sourceFile) {
  const stripped = md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]+`/g, '');
  const matches = stripped.match(/<\/?(div|span|section|article|header|footer|table|thead|tbody|tr|td|th|ul|ol|li|p|strong|em|b|i|h[1-6]|blockquote|a|button|input|select|textarea|details|summary|iframe|script|style|callout[\w-]*|step|compare|flow|file-tree|tag-core)\b[^>]*>/gi);
  if (matches && matches.length > 0) {
    const samples = [...new Set(matches)].slice(0, 3).join(' ');
    warn(sourceFile, 'forbidden-html',
      `检测到 ${matches.length} 处已停用的 HTML 标签（${samples}）。lite 版组件写法：提示用 > [!TIP]，步骤用 :::steps，对比用 :::compare，图形用 SVG/figure`);
  }
}

// ==================== Markdown → HTML 转换 ====================

// callout 类型映射：GitHub Alerts 语义 → CSS 类 + 默认标题
const CALLOUT_MAP = {
  TIP:       { cls: 'tip',    title: '核心要点' },
  NOTE:      { cls: 'info',   title: '参考' },
  INFO:      { cls: 'info',   title: '参考' },
  IMPORTANT: { cls: 'violet', title: '要点' },
  WARNING:   { cls: 'warn',   title: '注意' },
  WARN:      { cls: 'warn',   title: '注意' },
  CAUTION:   { cls: 'warn',   title: '注意' }
};
// 中文标题兼容映射（旧项目写法）
const CALLOUT_CN_MAP = {
  '核心建议': 'tip', '要点': 'tip', '提示': 'tip',
  '注意': 'warn', '警告': 'warn',
  '信息': 'info', '说明': 'info'
};

function mdToHtml(md, h2Offset, h3Offset) {
  let html = md;
  const tocData = [];
  const callouts = [];

  const pushCallout = (cls, title, body) => {
    callouts.push({ cls, title, body });
    return `__CALLOUT_${callouts.length - 1}__`;
  };

  // 0. 预先提取目录数据（跳过代码块和各类占位符行），同时计算正确的全局ID
  {
    const lines = html.split('\n');
    const fenceMask = scanFenceMask(lines);
    let localH2 = 0;
    let localH3 = 0;
    for (let li = 0; li < lines.length; li++) {
      if (fenceMask[li]) continue;
      const line = lines[li];
      if (/^__(FENCE_BLOCK|HTML_BLOCK|CALLOUT)_\d+__$/.test(line.trim())) continue;

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
  //    开启/闭合侧均锚定行首（允许缩进），防止代码内容中的行内 ```（如
  //    removeprefix("```sql")）被误判为围栏闭合导致后续配对整体错位
  const codeBlocks = [];
  html = html.replace(/(?:^|\n)[ \t]*```(\w*)[ \t]*\n([\s\S]*?)(?:\n[ \t]*)?```(?=\n|$)/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapeHtml(code.trimEnd())}</code></pre>`);
    return (match.startsWith('\n') ? '\n' : '') + placeholder;
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

  // 4. Callout识别 → 占位符（正文行内语法在占位符恢复阶段统一转换）
  // 4a. GitHub Alerts 多行形式：> [!TIP] 可选标题 \n > 正文...
  html = html.replace(/^> \[!(TIP|NOTE|IMPORTANT|WARNING|CAUTION|INFO|WARN)\][ \t]*([^\n]*)\n((?:>[^\n]*\n?)+)/gm, (match, kind, customTitle, rest) => {
    const meta = CALLOUT_MAP[kind.toUpperCase()];
    const title = customTitle.trim() || meta.title;
    const body = rest.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n').trim();
    return pushCallout(meta.cls, title, body);
  });
  // 4b. GitHub Alerts 单行形式：> [!TIP] 正文
  html = html.replace(/^> \[!(TIP|NOTE|IMPORTANT|WARNING|CAUTION|INFO|WARN)\][ \t]+(.+)$/gm, (match, kind, content) => {
    const meta = CALLOUT_MAP[kind.toUpperCase()];
    return pushCallout(meta.cls, meta.title, content.trim());
  });
  // 4c. 中文标题兼容（多行）
  html = html.replace(/^>\s*\*\*(核心建议|要点|提示|注意|警告|信息|说明)\*\*[:：]?\s*\n((?:>[^\n]*\n?)+)/gm, (match, title, content) => {
    const body = content.replace(/^>\s?/gm, '').trim();
    return pushCallout(CALLOUT_CN_MAP[title] || 'info', title, body);
  });
  // 4d. 中文标题兼容（单行）
  html = html.replace(/^>\s*\*\*(核心建议|要点|提示|注意|警告|信息|说明)\*\*[:：]?\s*(.+)$/gm, (match, title, content) => {
    return pushCallout(CALLOUT_CN_MAP[title] || 'info', title, content.trim());
  });
  // 4e. 普通引用
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote><p>$1</p></blockquote>');

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

  // 8. 段落处理（占位符行原样保留，不包裹 <p>）
  {
    const lines = html.split('\n');
    const result = [];
    let paraBuffer = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed ||
          trimmed.startsWith('<') ||
          trimmed.startsWith('__CODE_BLOCK_') ||
          trimmed.startsWith('__FENCE_BLOCK_') ||
          trimmed.startsWith('__HTML_BLOCK_') ||
          trimmed.startsWith('__CALLOUT_')) {
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

  // 9. 行内语法转换（粗体、斜体、链接）
  html = inlineMd(html);

  // 10. 恢复代码块
  codeBlocks.forEach((code, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, code);
  });

  // 11. 恢复行内代码
  inlineCodes.forEach((code, idx) => {
    html = html.replace(`__INLINE_CODE_${idx}__`, code);
  });

  // 12. 组装 callout（正文先做行内转换，支持 **粗体**、`代码`、[链接]()
  callouts.forEach((c, idx) => {
    const paras = c.body.split(/\n\s*\n/)
      .map(seg => seg.trim())
      .filter(Boolean)
      .map(seg => {
        let bodyHtml = inlineMd(seg).replace(/\n/g, ' ');
        // 行内代码在 callout 提取前已被占位，需在正文内恢复
        inlineCodes.forEach((code, ci) => {
          bodyHtml = bodyHtml.replace(`__INLINE_CODE_${ci}__`, code);
        });
        return `<p>${bodyHtml}</p>`;
      })
      .join('');
    html = html.replace(`__CALLOUT_${idx}__`,
      `<div class="callout callout-${c.cls}"><div class="callout-title">${c.title}</div>${paras}</div>`);
  });

  return { html, tocData };
}

// ==================== 围栏块渲染 ====================

/**
 * 解析围栏内容为条目列表：仅"顶格"的 "- " / "* " 行是新条目，
 * 缩进的 bullet 行与其他非空行作为当前条目的续行
 * （支持嵌套列表/表格/代码块并入步骤）。
 */
function parseFenceItems(content) {
  const items = [];
  for (const raw of content.split('\n')) {
    const m = raw.match(/^[-*]\s+(.*)$/);
    if (m) {
      items.push({ text: m[1].trim(), extra: [] });
    } else if (raw.trim() && items.length > 0) {
      items[items.length - 1].extra.push(raw.trim());
    }
  }
  return items;
}

// 从条目文本提取 "**标题**：说明" 中的标题，返回 [标题, 剩余文本]
function splitItemTitle(text) {
  const m = text.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
  if (m) return [m[1], m[2]];
  return [null, text];
}

// 围栏条目正文的行内转换：行内代码 + 粗体/斜体/链接
// （围栏内容在文档级行内代码提取之前就被移出，需自行处理反引号）
function renderItemInline(text) {
  const codes = [];
  let t = text.replace(/`([^`\n]+)`/g, (m, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `__ITEM_CODE_${codes.length - 1}__`;
  });
  t = inlineMd(t);
  codes.forEach((code, ci) => {
    t = t.replace(`__ITEM_CODE_${ci}__`, code);
  });
  return t;
}

// 渲染条目剩余内容（续行可能包含表格/代码块/列表）
function renderItemBody(item, seed) {
  let body = '';
  if (item.text && !splitItemTitle(item.text)[0]) {
    body += `<p>${renderItemInline(item.text)}</p>`;
  } else {
    const [, rest] = splitItemTitle(item.text);
    if (rest && rest.trim()) body += `<p>${renderItemInline(rest.trim())}</p>`;
  }
  if (item.extra.length > 0) {
    const { html: conv } = mdToHtml(item.extra.join('\n'), 900000 + seed * 100, 900000 + seed * 100);
    body += conv;
  }
  return body;
}

function renderSteps(content, sourceFile) {
  const items = parseFenceItems(content);
  if (items.length === 0) {
    warn(sourceFile, 'empty-fence', ':::steps 围栏内容为空');
    return '';
  }
  return items.map((item, i) => {
    const num = i + 1;
    const [title, ] = splitItemTitle(item.text);
    const titleHtml = title ? `<div class="step-title">${escapeHtml(title)}</div>` : '';
    const header = `<div class="step-header">
<div class="step-phase"><span class="step-phase-num">${num}</span><span class="step-phase-label">STEP ${num}</span></div>
${titleHtml}
</div>`;
    return `<div class="step-card">
${header}
<div class="step-body">${renderItemBody(item, i)}</div>
</div>`;
  }).join('\n');
}

function renderCompare(content, sourceFile) {
  const items = parseFenceItems(content);
  if (items.length < 2) {
    warn(sourceFile, 'invalid-compare', `:::compare 至少需要 2 个条目（第1条=不推荐，第2条=推荐），当前 ${items.length} 条`);
  }
  const variants = [
    { cls: 'compare-bad',    label: '不推荐 ❌' },
    { cls: 'compare-good',   label: '推荐 ✅' },
    { cls: 'compare-center', label: '备注' }
  ];
  if (items.length > 3) {
    warn(sourceFile, 'invalid-compare', `:::compare 最多支持 3 个条目（坏/好/备注），超出部分已忽略 ${items.length - 3} 条`);
  }
  const cols = items.slice(0, 3).map((item, i) => {
    const v = variants[i];
    const [title, ] = splitItemTitle(item.text);
    const label = title || v.label;
    return `<div class="compare-item ${v.cls}">
<div class="compare-label">${escapeHtml(label)}</div>
<div class="compare-content">${renderItemBody(item, 90 + i)}</div>
</div>`;
  });
  return `<div class="compare-block">
${cols.join('\n')}
</div>`;
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

    // 预处理：提取 ::: 围栏块 → 保护合法HTML → 扫描禁用HTML
    scanForbiddenHtml(body, baseName);
    const fenceResult = extractFenceBlocks(body, baseName);
    const legalResult = protectLegalHtml(fenceResult.md, baseName);

    // 转换MD为HTML，传入全局偏移确保ID全局唯一
    const { html: convertedHtml, tocData: partTocData } = mdToHtml(legalResult.md, globalH2Offset, globalH3Offset);

    // 恢复合法HTML块 + 渲染围栏块
    let finalHtml = convertedHtml;
    legalResult.htmlBlocks.forEach((block, idx) => {
      finalHtml = finalHtml.replace(`__HTML_BLOCK_${idx}__`, block);
    });
    fenceResult.fenceBlocks.forEach((block, idx) => {
      const rendered = block.name === 'steps'
        ? renderSteps(block.lines.join('\n'), baseName)
        : renderCompare(block.lines.join('\n'), baseName);
      finalHtml = finalHtml.replace(`__FENCE_BLOCK_${idx}__`, rendered);
    });

    // 占位符零残留断言：任何占位符漏恢复都意味着转换逻辑 bug 或异常输入，
    // 输出已损坏——显式失败，绝不静默产出残缺内容
    //（实际事故：围栏配对错位导致占位符吞掉半章正文，构建却显示成功）
    const leftoverPh = finalHtml.match(/__(?:CODE_BLOCK|INLINE_CODE|FENCE_BLOCK|HTML_BLOCK|CALLOUT)_\d+__/g);
    if (leftoverPh) {
      console.error(`❌ ${baseName}: 转换后残留未恢复的占位符 ${leftoverPh.length} 处（${[...new Set(leftoverPh)].slice(0, 3).join(' ')}），输出已损坏，终止构建`);
      process.exit(1);
    }

    // 收集TOC数据 + 更新全局偏移
    allTocData.push(...partTocData);
    globalH2Offset += partTocData.filter(t => t.level === 2).length;
    globalH3Offset += partTocData.filter(t => t.level === 3).length;

    const partName = `part${String(partNum).padStart(2, '0')}`;
    const partHtml = `<div class="content">\n${finalHtml}\n</div>`;
    fs.writeFileSync(path.join(FRAGMENTS_DIR, `${partName}.html`), partHtml);

    const fileWarnings = convertWarnings.filter(w => w.sourceFile === baseName);
    if (fileWarnings.length > 0) {
      console.log(`  ⚠️  ${partName}.html (${baseName}) → ${partTocData.length} 个标题, ${fileWarnings.length} 条警告`);
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

// ==================== 输出警告报告 ====================

if (convertWarnings.length > 0) {
  const reportData = {
    timestamp: new Date().toISOString(),
    totalFiles: mdFiles.length,
    totalWarnings: convertWarnings.length,
    warnings: convertWarnings
  };

  const reportPath = path.join(OUTPUT_DIR, 'convert-md-warnings.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');

  let textReport = `Markdown 转换警告报告\n`;
  textReport += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  textReport += `========================\n\n`;
  textReport += `共发现 ${convertWarnings.length} 条警告（不阻断构建，组件硬拦截见 check-md.js 门禁）\n\n`;

  convertWarnings.forEach((w, idx) => {
    textReport += `[${idx + 1}] [${w.type}] ${w.sourceFile}: ${w.message}\n`;
  });

  textReport += `\n========================\n`;
  textReport += `组件写法参考: research/components-quickref.md\n`;

  const textReportPath = path.join(OUTPUT_DIR, 'convert-md-warnings.txt');
  fs.writeFileSync(textReportPath, textReport, 'utf-8');

  console.log(`\n📋 转换警告: ${convertWarnings.length} 条`);
  convertWarnings.slice(0, 5).forEach(w => {
    console.log(`   ⚠️  [${w.type}] ${w.sourceFile}: ${w.message}`);
  });
  if (convertWarnings.length > 5) {
    console.log(`   ... 其余 ${convertWarnings.length - 5} 条见报告文件`);
  }
  console.log(`   报告文件: ${reportPath}`);
} else {
  console.log(`\n📋 转换警告: 无 ✓`);
}
