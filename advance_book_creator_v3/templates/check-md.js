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

        // 检查章标题：第X章 必须是 h2
        if (/^第\d+章/.test(title)) {
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
      const chapterNum = parseInt(file.match(/chapter-(\d+)/)?.[1] || '0', 10);
      if (chapterNum === 0) return errors; // 非 chapter 文件跳过

      const hasChapterHeading = lines.some(line => {
        const match = line.match(/^#{1,6}\s+(.+)$/);
        return match && /^第\d+章/.test(match[1].trim());
      });

      if (!hasChapterHeading) {
        errors.push({
          line: 1,
          message: `缺少章标题（应包含 "第${chapterNum}章 ..."）`
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
    process.exit(0);
  }

  console.log('❌ Markdown 片段检查失败\n');
  console.log(`检查文件: ${mdFiles.length} 个`);
  console.log(`错误: ${errorCount} | 警告: ${warningCount}\n`);

  // 按文件分组
  const byFile = {};
  for (const err of allErrors) {
    if (!byFile[err.file]) byFile[err.file] = [];
    byFile[err.file].push(err);
  }

  for (const [file, errors] of Object.entries(byFile)) {
    console.log(`📄 ${file}`);
    for (const err of errors) {
      const icon = err.severity === 'error' ? '❌' : '⚠️';
      console.log(`   ${icon} [${err.ruleId}] 第${err.line}行: ${err.message}`);
    }
    console.log('');
  }

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
