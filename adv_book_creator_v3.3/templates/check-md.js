#!/usr/bin/env node
/**
 * Markdown 片段门禁检查脚本（lite 版）
 *
 * 检查项：
 * 1. YAML frontmatter 完整性（type, title）
 * 2. 标题层级规范（第X章=h2, X.Y=h3, X.Y.Z=h4）
 * 3. 标题跳级检测
 * 4. 章标题缺失检测
 * 5. 禁用 HTML 标签检测（组件已 Markdown 原生化，HTML 仅允许 figure/svg/img 等）
 * 6. 脚注引用完整性（警告级）
 * 7. 术语禁用词一致性（警告级）——读 PROJECT.md §三 术语表「禁用同义词」列做机械子串匹配
 *
 * 用法：
 *   node check-md.js [fragments目录]          # 检查并输出报告
 *   node check-md.js [fragments目录] --json    # 输出JSON格式
 */

const fs = require('fs');
const path = require('path');
const { scanFenceMask } = require(path.join(__dirname, 'lib', 'fence-scan.js'));

const FRAGMENTS_DIR = process.argv[2] || './fragments';
const OUTPUT_JSON = process.argv.includes('--json');

// ===== 术语表读取（供 TERM001 规则用） =====
// 边界：只能抓 PROJECT.md §三 术语表「禁用同义词」列里已登记的禁词；
//       表外新造词抓不到，靠资深编辑的语义审查兜底（见 research/editor-review.md §九）。

// 只按未转义的竖线切分表格行，空单元格原样保留
// （禁用 split('|').filter(c=>c.trim())——会吞掉行内空单元格，导致列错位）
function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim());
}

// 定位 PROJECT.md：优先 fragments 同级目录，其次当前工作目录
function resolveProjectMd() {
  const candidates = [
    path.join(FRAGMENTS_DIR, '..', 'PROJECT.md'),
    path.join(process.cwd(), 'PROJECT.md')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let _bannedTermsCache = null; // null=尚未加载；数组=已加载结果

// 从 PROJECT.md §三 术语表小节解析「禁用同义词」列，返回禁词数组
function loadBannedTerms() {
  if (_bannedTermsCache !== null) return _bannedTermsCache;
  const terms = new Set();
  const pmPath = resolveProjectMd();
  if (pmPath) {
    const lines = fs.readFileSync(pmPath, 'utf-8').split('\n');
    let inSection = false;
    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        inSection = /术语表/.test(line); // 进入/离开「术语表」小节
        continue;
      }
      if (!inSection) continue;
      if (!/^\s*\|/.test(line)) continue;
      const cells = splitTableRow(line);
      if (cells.length < 2) continue;
      // 跳过表头行与分隔行（|---|---|）
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      if (cells[0] === '中文标准名') continue;
      const bannedCell = cells[cells.length - 1]; // 最后一列 = 禁用同义词
      if (!bannedCell) continue;
      for (const raw of bannedCell.split(/[、，,;；\/]/)) {
        const t = raw.trim();
        if (!t || t === '-' || t === '—' || t === '无') continue;
        // 单字符禁词（如 "A/B 测试" 按斜杠拆出的 A、B）只会制造全库误报，跳过
        if (t.length < 2) continue;
        terms.add(t);
      }
    }
  }
  _bannedTermsCache = [...terms];
  return _bannedTermsCache;
}

// 截取命中词周围的上下文，便于人工核对（可能有误报）
function extractContext(line, term) {
  const idx = line.indexOf(term);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 12);
  const end = Math.min(line.length, idx + term.length + 12);
  return line.slice(start, end).trim();
}

// ===== 检查规则 =====

const RULES = {
  // 1. YAML frontmatter
  yamlFrontmatter: {
    id: 'YAML001',
    name: 'YAML frontmatter 缺失',
    severity: 'error',
    check(file, content) {
      const errors = [];
      const hasFrontmatter = content.startsWith('---');
      if (!hasFrontmatter) {
        errors.push({ line: 1, message: '缺少 YAML frontmatter（文件开头必须是 ---）' });
        return errors;
      }

      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        errors.push({ line: 1, message: 'YAML frontmatter 格式错误（缺少闭合的 ---）' });
        return errors;
      }

      const fm = fmMatch[1];
      if (!fm.includes('type:')) {
        errors.push({ line: 2, message: '缺少 type 字段（应为 type: chapter/cover/backpage）' });
      }
      // 仅 chapter/part 片段强制要求 title；cover/backpage 允许无 title
      const typeMatch = fm.match(/type:\s*(\w+)/);
      const typeVal = (typeMatch && typeMatch[1]) || '';
      const skipTitle = typeVal === 'cover' || typeVal === 'backpage';
      if (!fm.includes('title:') && !skipTitle) {
        errors.push({ line: 2, message: '缺少 title 字段（cover/backpage 除外）' });
      }

      return errors;
    }
  },

  // 2. 标题层级规范
  headingLevel: {
    id: 'HDG001',
    name: '标题层级错误',
    severity: 'error',
    check(file, content, lines) {
      const errors = [];

      const fenceMask = scanFenceMask(lines);
      let inPre = false, inCode = false;
      for (let i = 0; i < lines.length; i++) {
        if (fenceMask[i]) continue; // 围栏行/围栏内行：# 注释不可误判为标题（共享状态机）
        const line = lines[i];
        // 跳过 <pre>/<code> 块：块内 # 注释同样不可误判为标题
        if (/<pre\b/i.test(line)) inPre = true;
        if (/<code\b/i.test(line)) inCode = true;
        if (inPre || inCode) {
          if (/<\/pre>/i.test(line)) inPre = false;
          if (/<\/code>/i.test(line)) inCode = false;
          continue;
        }
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (!headingMatch) continue;

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // 跳过 frontmatter 中的 ---
        if (line.trim() === '---') continue;

        // 检查章标题：第X章 必须是 h2（汉字与阿拉伯数字章号都要认：规范要求"第一章"）
        if (/^第[0-9一二三四五六七八九十百零]+章/.test(title)) {
          if (level !== 2) {
            errors.push({
              line: i + 1,
              message: `章标题 "${title}" 必须是 ## (h2)，当前是 ${'#'.repeat(level)} (h${level})`
            });
          }
          continue;
        }

        // 检查节标题：X.Y 必须是 h3
        if (/^\d+\.\d+(\.\d+)?\s/.test(title) && !/^\d+\.\d+\.\d+/.test(title)) {
          if (level !== 3) {
            errors.push({
              line: i + 1,
              message: `节标题 "${title}" 必须是 ### (h3)，当前是 ${'#'.repeat(level)} (h${level})`
            });
          }
          continue;
        }

        // 检查子节标题：X.Y.Z 必须是 h4
        if (/^\d+\.\d+\.\d+/.test(title)) {
          if (level !== 4) {
            errors.push({
              line: i + 1,
              message: `子节标题 "${title}" 必须是 #### (h4)，当前是 ${'#'.repeat(level)} (h${level})`
            });
          }
          continue;
        }
      }

      return errors;
    }
  },

  // 3. 标题跳级检测
  headingSkip: {
    id: 'HDG002',
    name: '标题跳级',
    severity: 'warning',
    check(file, content, lines) {
      const errors = [];
      let lastLevel = 0;

      const fenceMaskSkip = scanFenceMask(lines);
      let inPre = false, inCode = false;
      for (let i = 0; i < lines.length; i++) {
        if (fenceMaskSkip[i]) continue; // 围栏行/围栏内行（共享状态机）
        const line = lines[i];
        // 跳过 <pre>/<code> 块：块内 # 注释同样不可误判为标题
        if (/<pre\b/i.test(line)) inPre = true;
        if (/<code\b/i.test(line)) inCode = true;
        if (inPre || inCode) {
          if (/<\/pre>/i.test(line)) inPre = false;
          if (/<\/code>/i.test(line)) inCode = false;
          continue;
        }
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (!headingMatch) continue;

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // 跳过 frontmatter
        if (line.trim() === '---') continue;

        // 第一个标题之后才开始检测跳级
        if (lastLevel > 0 && level > lastLevel + 1) {
          errors.push({
            line: i + 1,
            message: `标题跳级：从 h${lastLevel} 直接跳到 h${level}（"${title}"），中间缺少 h${lastLevel + 1}`
          });
        }

        lastLevel = level;
      }

      return errors;
    }
  },

  // 4. 章标题缺失检测
  chapterHeadingMissing: {
    id: 'HDG003',
    name: '章标题缺失',
    severity: 'error',
    check(file, content, lines) {
      const errors = [];
      // 正文章节片段命名为 chNN-xxx.md；cover/backpage 及非章节文件不参与本规则
      const chMatch = file.match(/^ch(\d+)/);
      if (!chMatch) return errors;
      // ch00（卷首/导读）与附录（文件名含 fulu/appendix）不是"章"，不要求章标题
      if (parseInt(chMatch[1], 10) === 0) return errors;
      if (/fulu|appendix/i.test(file)) return errors;

      // 汉字与阿拉伯数字章号都要认（规范要求汉字"第一章"；兼容"第1章"）
      const fenceMaskCh = scanFenceMask(lines);
      const hasChapterHeading = lines.some((line, i) => {
        if (fenceMaskCh[i]) return false; // 围栏内是代码/字面量，不算章标题
        const match = line.match(/^#{1,6}\s+(.+)$/);
        return match && /^第[0-9一二三四五六七八九十百零]+章/.test(match[1].trim());
      });

      if (!hasChapterHeading) {
        errors.push({
          line: 1,
          message: '缺少章标题（正文片段应至少包含一个 "## 第X章 标题"）'
        });
      }

      return errors;
    }
  },

  // 5. 禁用 HTML 标签（lite 版核心门禁）
  // 组件已 Markdown 原生化（[!TIP] / :::steps / :::compare），
  // MD 源中只允许 figure/svg/img/br/hr 等"表现类"标签，
  // 结构类/文本类 HTML 一律拦截——从源头消灭 HTML 与 Markdown 混用。
  forbiddenTags: {
    id: 'TAG001',
    name: '禁用 HTML 标签',
    severity: 'error',
    check(file, content, lines) {
      const errors = [];

      // 布局/文本类 HTML 标签禁用清单（SVG 子标签如 rect/path/text 不在清单内，天然放行）
      const forbiddenTags = [
        'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'p', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'pre', 'code', 'a', 'button', 'input', 'select', 'option',
        'textarea', 'form', 'label', 'details', 'summary', 'iframe', 'script', 'style', 'link', 'meta',
        'callout', 'step', 'compare', 'flow', 'file-tree', 'tag-core'
      ];
      const forbiddenRe = new RegExp(`<\\/?(${forbiddenTags.join('|')})\\b[^>]*>`, 'gi');

      const fenceMaskTag = scanFenceMask(lines);
      for (let i = 0; i < lines.length; i++) {
        if (fenceMaskTag[i]) continue; // 围栏行/围栏内行：字面量 HTML 示例不拦截（共享状态机）
        const line = lines[i];
        // 跳过行内代码（避免误伤讲解 HTML 语法的行内示例）
        const scanTarget = line.replace(/`[^`\n]+`/g, '');

        const matches = scanTarget.match(forbiddenRe);
        if (matches) {
          errors.push({
            line: i + 1,
            message: `禁用 HTML 标签 ${[...new Set(matches.map(m => m.toLowerCase()))].slice(0, 3).join(' ')}。提示块用 > [!TIP]/[!WARN]/[!NOTE]，步骤用 :::steps，对比用 :::compare，术语强调用 **粗体**（详见 research/components-quickref.md）`
          });
        }
      }

      return errors;
    }
  },

  // 6. 脚注引用完整性（仅告警，不阻断构建）
  // 引用未定义 / 定义未引用：convert-md 会把未定义引用原样保留、未引用定义不渲染，
  // 两者的表现都是"脚注没生效"，提前在门禁阶段提示作者
  footnoteIntegrity: {
    id: 'FN001',
    name: '脚注引用完整性',
    severity: 'warning',
    check(file, content, lines) {
      const warnings = [];
      const fenceMaskFn = scanFenceMask(lines);
      const defined = new Map();    // id -> 首次定义行号
      const referenced = new Map(); // id -> 首次引用行号
      for (let i = 0; i < lines.length; i++) {
        if (fenceMaskFn[i]) continue;
        // 行内代码中的 [^1] 属字面量示例，不参与统计
        const line = lines[i].replace(/`[^`\n]+`/g, '');
        const defMatch = line.match(/^\[\^([^\]\s]+)\]:/);
        if (defMatch) {
          if (!defined.has(defMatch[1])) defined.set(defMatch[1], i + 1);
          continue;
        }
        const refRe = /\[\^([^\]\s]+)\]/g;
        let m;
        while ((m = refRe.exec(line)) !== null) {
          if (!referenced.has(m[1])) referenced.set(m[1], i + 1);
        }
      }
      for (const [id, line] of referenced) {
        if (!defined.has(id)) {
          warnings.push({ line, message: `脚注 [^${id}] 被引用但未定义（在章末补充 [^${id}]: 脚注内容）` });
        }
      }
      for (const [id, line] of defined) {
        if (!referenced.has(id)) {
          warnings.push({ line, message: `脚注 [^${id}] 已定义但未被引用（确认正文标记是否写成 [^${id}]，或删除多余定义）` });
        }
      }
      return warnings;
    }
  },

  // 7. 术语禁用词一致性（仅告警，不阻断构建）
  // 读 PROJECT.md §三 术语表「禁用同义词」列，扫片段正文是否出现禁词（跳过代码块与行内代码）。
  // 机械子串匹配，可能有误报（如正常语境用到该词），故为 warning 级；表外新造词靠审查 Agent 兜底。
  terminologyBanned: {
    id: 'TERM001',
    name: '术语禁用词',
    severity: 'warning',
    check(file, content, lines) {
      const warnings = [];
      const banned = loadBannedTerms();
      if (banned.length === 0) return warnings;

      const fenceMaskTerm = scanFenceMask(lines);
      for (let i = 0; i < lines.length; i++) {
        if (fenceMaskTerm[i]) continue; // 围栏内是代码/字面量，不参与术语扫描
        const line = lines[i].replace(/`[^`\n]+`/g, ''); // 行内代码中的词属字面量示例，跳过
        for (const term of banned) {
          if (line.includes(term)) {
            warnings.push({
              line: i + 1,
              message: `命中术语表禁用词"${term}"（应改用标准名，见 PROJECT.md §三 术语表）。上下文：…${extractContext(line, term)}…`
            });
          }
        }
      }
      return warnings;
    }
  }
};

// ===== 主流程 =====

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const basename = path.basename(filePath);

  const results = [];

  for (const [ruleId, rule] of Object.entries(RULES)) {
    const errors = rule.check(basename, content, lines);
    for (const err of errors) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        file: basename,
        line: err.line,
        message: err.message
      });
    }
  }

  return results;
}

// 按文件分组打印检查结果
function printGrouped(items) {
  const byFile = {};
  for (const err of items) {
    if (!byFile[err.file]) byFile[err.file] = [];
    byFile[err.file].push(err);
  }
  for (const [file, errs] of Object.entries(byFile)) {
    console.log(`📄 ${file}`);
    for (const err of errs) {
      const icon = err.severity === 'error' ? '❌' : '⚠️';
      console.log(`   ${icon} [${err.ruleId}] 第${err.line}行: ${err.message}`);
    }
    console.log('');
  }
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

  if (mdFiles.length === 0) {
    console.log('⏭️  未找到 Markdown 文件');
    process.exit(0);
  }

  const allErrors = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const filePath of mdFiles) {
    const results = checkFile(filePath);
    allErrors.push(...results);
    errorCount += results.filter(r => r.severity === 'error').length;
    warningCount += results.filter(r => r.severity === 'warning').length;
  }

  if (OUTPUT_JSON) {
    console.log(JSON.stringify({
      valid: errorCount === 0,
      errorCount,
      warningCount,
      errors: allErrors
    }, null, 2));
    process.exit(errorCount > 0 ? 1 : 0);
  }

  // 文本输出（仅 error 才判定失败，warning 不阻断构建）
  if (errorCount === 0) {
    console.log('✅ Markdown 片段检查通过' + (warningCount > 0 ? `（含 ${warningCount} 条警告，不影响构建）` : ''));
    console.log(`   检查文件: ${mdFiles.length} 个`);
    console.log(`   错误: 0 | 警告: ${warningCount}`);
    // 成功分支也要打印警告明细——否则术语禁用词等 warning 级结果不可见
    const allWarnings = allErrors.filter(r => r.severity === 'warning');
    if (allWarnings.length > 0) {
      console.log('');
      console.log('⚠️  警告明细（不影响构建，但建议处理）：');
      printGrouped(allWarnings);
    }
    process.exit(0);
  }

  console.log('❌ Markdown 片段检查失败\n');
  console.log(`检查文件: ${mdFiles.length} 个`);
  console.log(`错误: ${errorCount} | 警告: ${warningCount}\n`);

  // 按文件分组打印全部问题
  printGrouped(allErrors);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('修复指引：');
  console.log('1. 标题层级可自动修复：node fix-md.js [fragments目录] --write');
  console.log('2. 禁用 HTML 标签：改为 Markdown 原生组件语法，参考 research/components-quickref.md');
  console.log('');
  console.log('组件语法速查：');
  console.log('   > [!TIP] 标题        → 要点提示（多行正文以 > 开头）');
  console.log('   > [!WARN] 标题       → 警告注意');
  console.log('   > [!NOTE] 标题       → 参考信息');
  console.log('   :::steps ... :::     → 步骤卡片（内部用 - **标题**：说明 列表）');
  console.log('   :::compare ... :::   → 对比卡片（2条=坏/好，3条=坏/好/备注）');
  console.log('');
  console.log('标题层级规范：');
  console.log('   ## 第X章 标题      → h2（章标题）');
  console.log('   ### X.Y 标题      → h3（节标题）');
  console.log('   #### X.Y.Z 标题   → h4（子节标题）');
  console.log('');

  process.exit(1);
}

main();
