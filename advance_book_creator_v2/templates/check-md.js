#!/usr/bin/env node
/**
 * Markdown 片段门禁检查脚本
 *
 * 检查项：
 * 1. YAML frontmatter 完整性（type, title）
 * 2. 标题层级规范（第X章=h2, X.Y=h3, X.Y.Z=h4）
 * 3. 标题跳级检测
 * 4. 章标题缺失检测
 * 5. 非法自定义标签检测（保留原有检查）
 *
 * 用法：
 *   node check-md.js [fragments目录]          # 检查并输出报告
 *   node check-md.js [fragments目录] --json    # 输出JSON格式
 */

const fs = require('fs');
const path = require('path');

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
      if (!fm.includes('title:')) {
        errors.push({ line: 2, message: '缺少 title 字段' });
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
      const chapterNum = parseInt(file.match(/chapter-(\d+)/)?.[1] || '0', 10);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
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

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
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

  // 5. 非法自定义标签（保留原有检查）
  forbiddenTags: {
    id: 'TAG001',
    name: '非法自定义标签',
    severity: 'error',
    check(file, content, lines) {
      const errors = [];

      const forbiddenPatterns = [
        { regex: /<callout-tip\b/i, name: '<callout-tip>' },
        { regex: /<callout-warn\b/i, name: '<callout-warn>' },
        { regex: /<callout-info\b/i, name: '<callout-info>' },
        { regex: /<callout\b(?!-)/i, name: '<callout>' },
        { regex: /<step\b(?!-)/i, name: '<step>' },
        { regex: /<compare\b(?!-)/i, name: '<compare>' },
        { regex: /<tag-core\b/i, name: '<tag-core>' },
        { regex: /<flow\b(?!-)/i, name: '<flow>' }
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of forbiddenPatterns) {
          if (pattern.regex.test(line)) {
            errors.push({
              line: i + 1,
              message: `非法自定义标签 ${pattern.name}，应使用 <div class="..."> 形式`
            });
          }
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
      valid: allErrors.length === 0,
      errorCount,
      warningCount,
      errors: allErrors
    }, null, 2));
    process.exit(allErrors.length > 0 ? 1 : 0);
  }

  // 文本输出
  if (allErrors.length === 0) {
    console.log('✅ Markdown 片段检查通过');
    console.log(`   检查文件: ${mdFiles.length} 个`);
    console.log(`   错误: 0 | 警告: 0`);
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
  console.log('1. 自动修复（推荐）：node fix-md.js [fragments目录]');
  console.log('2. 手动修复：参考 SKILL.md 第 7.3 节组件模板规范');
  console.log('');
  console.log('标题层级规范：');
  console.log('   ## 第X章 标题      → h2（章标题）');
  console.log('   ### X.Y 标题      → h3（节标题）');
  console.log('   #### X.Y.Z 标题   → h4（子节标题）');
  console.log('');

  process.exit(1);
}

main();
