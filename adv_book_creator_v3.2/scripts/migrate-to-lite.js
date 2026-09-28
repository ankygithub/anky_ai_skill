#!/usr/bin/env node
/**
 * v2/v4 旧项目 Markdown → lite 组件语法迁移脚本
 *
 * 迁移规则（与 references/components-quickref.md 对应）：
 * - callout div（tip/warn/info/violet）  → > [!TIP]/[!WARN]/[!NOTE]/[!IMPORTANT]
 * - 连续 step div（step-num/step-content）→ :::steps 围栏（h4→**标题**，ul/pre/table→续行）
 * - compare-block / compare div          → :::compare 围栏（label→**栏目标题**）
 * - flow div（flow-step/flow-arrow）     → **名称**（说明） → **名称**（说明） 文本链
 * - file-tree div                        → ```text 代码块
 * - <span class="tag-core">x</span>      → **x**
 * - cover/backpage frontmatter 收敛为 lite 生效字段，正文替换为标准形态
 *
 * ⚠️ 已知盲区：parseInner 仅识别 h4/p/ul/ol/pre/table 六种块级结构。
 *   step/compare 内容中出现其他嵌套块（details/blockquote/dl 等）时会被
 *   剥离标签（文字保留、格式丢失），并触发"残留可疑标签"警告——
 *   看到该警告必须人工核对，不要忽略。文本保真校验（可见字数对比）作数学兜底。
 *
 * 用法：
 *   node migrate-to-lite.js <fragments目录>           # 预览（不写入）
 *   node migrate-to-lite.js <fragments目录> --write   # 执行迁移
 */

const fs = require('fs');
const path = require('path');

const FRAGMENTS_DIR = process.argv[2];
if (!FRAGMENTS_DIR) {
  console.error('用法: node migrate-to-lite.js <fragments目录> [--write]');
  process.exit(1);
}
const WRITE_MODE = process.argv.includes('--write');

// ==================== 行内 HTML → Markdown ====================

function inlineHtmlToMd(text) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<a\s+href='([^']*)'[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, '');
}

// ==================== 块级解析辅助 ====================

// 提取顶层组件块：从 startLine（含开标签）起，按 <div 开/闭 计数找到闭合行
function findBlockEnd(lines, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const opens = (lines[i].match(/<div\b/g) || []).length;
    const closes = (lines[i].match(/<\/div>/g) || []).length;
    depth += opens - closes;
    if (depth <= 0) return i;
  }
  return -1;
}

// 把块内文本解析为有序的块级 token 序列（h4/p/ul/ol/pre/table/text）
function parseInner(content) {
  const tokens = [];
  const re = /<h4>([\s\S]*?)<\/h4>|<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>|<pre>([\s\S]*?)<\/pre>|<table\b[^>]*>([\s\S]*?)<\/table>|([^<]+)/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1] !== undefined) tokens.push({ type: 'h4', text: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: 'p', text: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: 'ul', text: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: 'ol', text: m[4] });
    else if (m[5] !== undefined) {
      const code = m[5].replace(/<code\b[^>]*>/i, '').replace(/<\/code>/i, '');
      tokens.push({ type: 'pre', text: code });
    } else if (m[6] !== undefined) {
      tokens.push({ type: 'table', text: m[6] });
    } else if (m[7] !== undefined && m[7].trim()) {
      tokens.push({ type: 'text', text: m[7] });
    }
  }
  return tokens;
}

// HTML 表格 → Markdown 表格（首行为表头）
function convertTable(tableHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRe = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
    let cm;
    while ((cm = cellRe.exec(m[1])) !== null) {
      // 单元格内的竖线需转义，避免破坏 MD 表格列结构
      cells.push(inlineHtmlToMd(cm[2]).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'));
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map(r => r.length));
  const pad = r => { const c = r.slice(); while (c.length < width) c.push(''); return c; };
  const [head, ...body] = rows.map(pad);
  const lines = ['| ' + head.join(' | ') + ' |'];
  lines.push('|' + Array(width).fill(' --- ').join('|') + '|');
  body.forEach(r => lines.push('| ' + r.join(' | ') + ' |'));
  return lines.join('\n');
}

function parseListItems(listHtml) {
  const items = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    items.push(inlineHtmlToMd(m[1]).replace(/\s+/g, ' ').trim());
  }
  return items;
}

// ==================== 各组件转换 ====================

const CALLOUT_KIND_MAP = {
  tip: 'TIP', warn: 'WARN', info: 'NOTE', violet: 'IMPORTANT'
};

function convertCallout(block) {
  const kindMatch = block.match(/class="callout callout-(\w+)"/i);
  const kind = CALLOUT_KIND_MAP[(kindMatch ? kindMatch[1] : 'info').toLowerCase()] || 'NOTE';
  const titleMatch = block.match(/<div class="callout-title">([\s\S]*?)<\/div>/i);
  const title = titleMatch ? inlineHtmlToMd(titleMatch[1]).trim() : '';
  let body = block
    .replace(/^<div\b[^>]*>/i, '')
    .replace(/<\/div>\s*$/i, '');
  if (titleMatch) body = body.replace(titleMatch[0], '');
  const paragraphs = [];
  const pre = /<p>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pre.exec(body)) !== null) {
    const t = inlineHtmlToMd(m[1]).replace(/\s+/g, ' ').trim();
    if (t) paragraphs.push(t);
  }
  if (paragraphs.length === 0) {
    const t = inlineHtmlToMd(body).replace(/\s+/g, ' ').trim();
    if (t) paragraphs.push(t);
  }
  const head = title ? `> [!${kind}] ${title}` : `> [!${kind}]`;
  return [head, ...paragraphs.map(p => `> ${p}`)].join('\n');
}

function convertStepGroup(stepBlocks) {
  const itemLines = [];
  for (const block of stepBlocks) {
    // 先剥掉最外层 step 开标签与块尾闭合标签，
    // 此时 innerBlock 的最后一个 </div> 即为 step-content 的闭合
    const innerBlock = block.replace(/^<div\b[^>]*>/i, '').replace(/<\/div>\s*$/i, '');
    const contentMatch = innerBlock.match(/<div class="step-content">([\s\S]*)<\/div>\s*$/i);
    const inner = contentMatch
      ? contentMatch[1]
      : innerBlock.replace(/<div class="step-num">[\s\S]*?<\/div>/i, '');
    const tokens = parseInner(inner);
    let title = '';
    const firstP = tokens.find(t => t.type === 'p');
    if (firstP) {
      title = inlineHtmlToMd(firstP.text).replace(/\s+/g, ' ').trim();
      firstP.consumed = true;
    }
    const h4 = tokens.find(t => t.type === 'h4');
    if (h4) {
      title = inlineHtmlToMd(h4.text).replace(/\s+/g, ' ').trim();
      h4.consumed = true;
    }
    const line = title ? `- **${title}**` : '-';
    const contLines = [];
    for (const t of tokens) {
      if (t.consumed) continue;
      if (t.type === 'p' || t.type === 'text' || t.type === 'h4') {
        const s = inlineHtmlToMd(t.text).replace(/\s+/g, ' ').trim();
        if (s) contLines.push(s);
      } else if (t.type === 'ul' || t.type === 'ol') {
        const items = parseListItems(t.text);
        items.forEach((it, idx) => {
          contLines.push(t.type === 'ol' ? `  ${idx + 1}. ${it}` : `  - ${it}`);
        });
      } else if (t.type === 'table') {
        convertTable(t.text).split('\n').forEach(l => contLines.push('  ' + l));
      } else if (t.type === 'pre') {
        // 代码内容仅做 HTML 实体反转，不做标签剥离
        const decoded = t.text
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
        contLines.push('  ```');
        decoded.split('\n').forEach(l => contLines.push('  ' + l.trimEnd()));
        contLines.push('  ```');
      }
    }
    itemLines.push(contLines.length > 0 ? [line, ...contLines].join('\n') : line);
  }
  return [':::steps', ...itemLines, ':::'].join('\n');
}

function convertCompareBlock(block) {
  const itemLines = [];
  const itemRe = /<div class="compare-item compare-(bad|good|center)">([\s\S]*?)(?=<div class="compare-item compare-|<\/div>\s*<\/div>\s*$)/gi;
  const items = [];
  let m;
  while ((m = itemRe.exec(block)) !== null) {
    items.push({ kind: m[1].toLowerCase(), html: m[2] });
  }
  if (items.length === 0) {
    // 兜底：按 compare-item 逐个切
    const re2 = /<div class="compare-item[^"]*">([\s\S]*?)<\/div>\s*<\/div>/gi;
    while ((m = re2.exec(block)) !== null) items.push({ kind: '', html: m[1] });
  }
  for (const item of items) {
    const labelMatch = item.html.match(/<div class="compare-label">([\s\S]*?)<\/div>/i);
    const label = labelMatch ? inlineHtmlToMd(labelMatch[1]).replace(/\s+/g, ' ').trim() : '';
    let content = item.html;
    if (labelMatch) content = content.replace(labelMatch[0], '');
    const contentMatch = content.match(/<div class="compare-content">([\s\S]*?)(<\/div>\s*)<\/div>\s*$/i);
    if (contentMatch) content = contentMatch[1];
    const paragraphs = [];
    const pre = /<p>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pre.exec(content)) !== null) {
      const t = inlineHtmlToMd(pm[1]).replace(/\s+/g, ' ').trim();
      if (t) paragraphs.push(t);
    }
    const head = label ? `- **${label}**` : '-';
    const contLines = paragraphs.slice(1);
    itemLines.push(contLines.length > 0 ? [head, ...contLines].join('\n') : `${head}${paragraphs[0] ? '：' + paragraphs[0] : ''}`);
    if (paragraphs[0] && contLines.length > 0) {
      // 第一段已并入标题行，修正：重新组装
      itemLines[itemLines.length - 1] = [`${head}：${paragraphs[0]}`, ...contLines].join('\n');
    }
  }
  return [':::compare', ...itemLines, ':::'].join('\n');
}

function convertSimpleCompare(block) {
  // 简单版 .compare：多个平级子 <div>，各含 <p> 列表
  const inner = block.replace(/^<div\b[^>]*>/i, '').replace(/<\/div>\s*$/i, '');
  const cols = [];
  let depth = 0, cur = [];
  const lines = inner.split('\n');
  for (const line of lines) {
    const opens = (line.match(/<div\b/g) || []).length;
    const closes = (line.match(/<\/div>/g) || []).length;
    if (opens > 0 && depth === 0) { depth += opens - closes; cur = [line]; continue; }
    cur.push(line);
    depth += opens - closes;
    if (depth <= 0) { cols.push(cur.join('\n')); cur = []; depth = 0; }
  }
  const itemLines = cols.map((col, idx) => {
    const paragraphs = [];
    const pre = /<p>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pre.exec(col)) !== null) {
      const t = inlineHtmlToMd(pm[1]).replace(/\s+/g, ' ').trim();
      if (t) paragraphs.push(t);
    }
    const head = paragraphs.shift() || (idx === 0 ? '不推荐 ❌' : '推荐 ✅');
    const cleanHead = head.replace(/^\*\*(.+)\*\*$/, '$1');
    return paragraphs.length > 0
      ? [`- **${cleanHead}**：${paragraphs[0]}`, ...paragraphs.slice(1)].join('\n')
      : `- **${cleanHead}**`;
  });
  return [':::compare', ...itemLines, ':::'].join('\n');
}

function convertFlow(block) {
  const steps = [];
  const re = /<div class="flow-step">([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    let t = m[1].replace(/<br\s*\/?>/gi, '\n').trim();
    const parts = t.split('\n').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) steps.push(`**${parts[0]}**（${parts.slice(1).join(' · ')}）`);
    else if (parts.length === 1) steps.push(`**${parts[0]}**`);
  }
  return steps.join(' → ');
}

function convertFileTree(block) {
  const out = [];
  const lineRe = /<div class="(folder|indent[^"]*|file)"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    const cls = m[1];
    const text = inlineHtmlToMd(m[2]).trim();
    out.push(cls === 'folder' ? text : `  ${text}`);
  }
  return ['```text', ...out, '```'].join('\n');
}

// ==================== cover / backpage 收敛 ====================

function convertCover(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) return { text: raw, notes: ['未找到 frontmatter，跳过'] };
  const keep = ['type', 'title', 'subtitle', 'author', 'version'];
  const fmLines = fmMatch[1].split('\n').filter(line => {
    const key = (line.match(/^([\w_-]+):/) || [])[1];
    return keep.includes(key);
  });
  const get = key => {
    const m = fmLines.find(l => l.startsWith(key + ':'));
    return m ? m.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  };
  const body = [`# ${get('title')}`, '', `> ${get('subtitle')}`].join('\n');
  const notes = ['frontmatter 已收敛为 lite 生效字段，停用字段已删除'];
  return { text: `---\n${fmLines.join('\n')}\n---\n\n${body}\n`, notes };
}

function convertBackpage(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) return { text: raw, notes: ['未找到 frontmatter，跳过'] };
  const keep = ['type', 'title', 'author', 'version'];
  const fmLines = fmMatch[1].split('\n').filter(line => {
    const key = (line.match(/^([\w_-]+):/) || [])[1];
    return keep.includes(key);
  });
  const notes = ['frontmatter 已收敛为 lite 生效字段，停用字段已删除'];
  return { text: `---\n${fmLines.join('\n')}\n---\n`, notes };
}

// ==================== 主流程 ====================

const stats = { files: 0, callout: 0, step: 0, stepGroup: 0, compare: 0, flow: 0, fileTree: 0, tagCore: 0, cover: 0, backpage: 0 };

function migrateFile(filePath) {
  const base = path.basename(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');

  // cover / backpage 走专用收敛
  if (/^---\s*\n[\s\S]*?type:\s*cover/.test(raw)) {
    const { text, notes } = convertCover(raw);
    stats.cover++;
    if (WRITE_MODE) fs.writeFileSync(filePath, text, 'utf-8');
    console.log(`  📔 ${base}: ${notes.join('；')}`);
    return;
  }
  if (/^---\s*\n[\s\S]*?type:\s*backpage/.test(raw)) {
    const { text, notes } = convertBackpage(raw);
    stats.backpage++;
    if (WRITE_MODE) fs.writeFileSync(filePath, text, 'utf-8');
    console.log(`  📔 ${base}: ${notes.join('；')}`);
    return;
  }

  // 行内 tag-core（先处理，避免被块扫描干扰）
  let out = raw;
  const tagCount = (out.match(/<span class="tag-core">[\s\S]*?<\/span>/g) || []).length;
  out = out.replace(/<span class="tag-core">([\s\S]*?)<\/span>/g, (m, t) => `**${inlineHtmlToMd(t).trim()}**`);
  stats.tagCore += tagCount;

  // 块级组件扫描
  const lines = out.split('\n');
  const result = [];
  let i = 0;
  const fileStat = { callout: 0, stepGroup: 0, step: 0, compare: 0, flow: 0, fileTree: 0, orphan: 0 };
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const startMatch = trimmed.match(/^<div class="(callout callout-\w+|step|compare-block|compare|flow|file-tree)"\s*>?\s*$/);
    if (!startMatch) { result.push(line); i++; continue; }
    const kind = startMatch[1];

    const endIdx = findBlockEnd(lines, i);
    if (endIdx === -1) {
      result.push(line); i++;
      console.log(`  ⚠️  ${base}: 第${i + 1}行的 ${kind} 块未闭合，保留原样`);
      continue;
    }
    const block = lines.slice(i, endIdx + 1).join('\n');

    if (kind.startsWith('callout')) {
      result.push(convertCallout(block));
      fileStat.callout++;
    } else if (kind === 'step') {
      // 收集连续 step 块（中间只允许空行）
      const group = [block];
      let j = endIdx + 1;
      while (j < lines.length) {
        if (lines[j].trim() === '') { j++; continue; }
        if (/^<div class="step">\s*$/.test(lines[j].trim())) {
          const e2 = findBlockEnd(lines, j);
          if (e2 === -1) break;
          group.push(lines.slice(j, e2 + 1).join('\n'));
          j = e2 + 1;
          continue;
        }
        break;
      }
      result.push(convertStepGroup(group));
      fileStat.stepGroup++;
      fileStat.step += group.length;
      i = j;
      continue;
    } else if (kind === 'compare-block') {
      result.push(convertCompareBlock(block));
      fileStat.compare++;
    } else if (kind === 'compare') {
      result.push(convertSimpleCompare(block));
      fileStat.compare++;
    } else if (kind === 'flow') {
      result.push(convertFlow(block));
      fileStat.flow++;
    } else if (kind === 'file-tree') {
      result.push(convertFileTree(block));
      fileStat.fileTree++;
    }

    i = endIdx + 1;
  }

  let finalText = result.join('\n')
    .replace(/\n{4,}/g, '\n\n\n')   // 压缩迁移产生的多余空行
    .replace(/[ \t]+$/gm, '');

  // 清理孤立闭合标签（原项目手误残留，如独占一行的 </div>；lite 已禁用裸 HTML，删除安全）
  finalText = finalText.replace(/^[ \t]*<\/(div|span|p|table|tr|td|th|ul|ol|li|section|figure|blockquote)>[ \t]*\n?/gm, () => {
    fileStat.orphan++;
    return '';
  });

  // 文本保真校验：迁移前后可见文本量对比（HTML 标签不计入）。
  // 组件迁移是等价变换，可见文本理论上不增不减；
  // 明显减少 = 有未识别的结构被剥离（格式丢失），必须人工核对。
  const visibleLen = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
  const beforeLen = visibleLen(raw);
  const afterLen = visibleLen(finalText);
  const lossRate = beforeLen > 0 ? (beforeLen - afterLen) / beforeLen : 0;
  if (lossRate > 0.01) {
    console.log(`  ⚠️  文本保真警告: 可见文本比迁移前少 ${(lossRate * 100).toFixed(1)}%（${beforeLen} → ${afterLen} 字符），存在格式丢失，请人工核对`);
  }

  // 残留可疑标签检查：完整禁用标签 + 标签剥离碎片（如 "table> thead>"）
  // 注意：figure/figcaption/svg/img 是合法白名单标签，不在清单内
  const leftover = finalText.replace(/```[\s\S]*?```/g, '').match(
    /<\/?(div|span|section|article|header|footer|table|thead|tbody|tr|td|th|ul|ol|li|dl|dt|dd|p|strong|em|b|i|h[1-6]|blockquote|a|button|input|details|summary|iframe|script|style|pre|code|callout[\w-]*|step|compare|flow|file-tree|tag-core)\b[^>]*>|\b(table|thead|tbody|tr|td|th|ul|ol|li|div|span|pre|code|blockquote|strong|em|h[1-6])>(?=[^\w>])/gi
  );

  if (WRITE_MODE) fs.writeFileSync(filePath, finalText, 'utf-8');

  stats.callout += fileStat.callout;
  stats.step += fileStat.step;
  stats.stepGroup += fileStat.stepGroup;
  stats.compare += fileStat.compare;
  stats.flow += fileStat.flow;
  stats.fileTree += fileStat.fileTree;
  stats.files++;

  const parts = [];
  if (fileStat.callout) parts.push(`callout×${fileStat.callout}`);
  if (fileStat.stepGroup) parts.push(`steps组×${fileStat.stepGroup}(step×${fileStat.step})`);
  if (fileStat.compare) parts.push(`compare×${fileStat.compare}`);
  if (fileStat.flow) parts.push(`flow×${fileStat.flow}`);
  if (fileStat.fileTree) parts.push(`file-tree×${fileStat.fileTree}`);
  if (tagCount) parts.push(`tag-core×${tagCount}`);
  if (fileStat.orphan) parts.push(`清理孤立闭合标签×${fileStat.orphan}`);
  console.log(`  📄 ${base}: ${parts.join(', ') || '无组件'}${leftover ? `  ⚠️ 残留可疑标签 ${leftover.length} 处` : ''}`);
}

function main() {
  if (!fs.existsSync(FRAGMENTS_DIR)) {
    console.error(`❌ 目录不存在: ${FRAGMENTS_DIR}`);
    process.exit(1);
  }
  const mdFiles = fs.readdirSync(FRAGMENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(FRAGMENTS_DIR, f))
    .sort();

  console.log(`🔄 lite 迁移: ${mdFiles.length} 个片段（${WRITE_MODE ? '写入模式' : '预览模式'}）\n`);
  for (const f of mdFiles) migrateFile(f);

  console.log('\n📊 迁移统计:');
  console.log(`   callout → [!X]      : ${stats.callout + stats.cover > 0 ? stats.callout : 0}`);
  console.log(`   step → :::steps     : ${stats.step} 个（${stats.stepGroup} 组）`);
  console.log(`   compare → :::compare: ${stats.compare}`);
  console.log(`   flow → 文本链       : ${stats.flow}`);
  console.log('   file-tree → text代码块 : ' + stats.fileTree);
  console.log(`   tag-core → **粗体** : ${stats.tagCore}`);
  console.log(`   cover/backpage 收敛 : ${stats.cover}/${stats.backpage}`);
  if (!WRITE_MODE) console.log('\n⚠️  预览模式未写入文件，确认无误后追加 --write 执行迁移');
}

main();
