#!/usr/bin/env node
/**
 * Markdown 片段自动修复脚本
 *
 * 自动修复项：
 * 1. 标题层级规范化
 *    - # 第X章  → ## 第X章（h1→h2）
 *    - ## X.Y   → ### X.Y（h2→h3，节标题）
 *    - ### X.Y.Z → #### X.Y.Z（h3→h4，子节标题）
 *    - 其他标题整体降一级（如果检测到整章都是旧结构）
 * 2. 非法自定义标签替换（可选，默认不启用）
 *
 * 用法：
 *   node fix-md.js [fragments目录]           # 预览修改（不写入）
 *   node fix-md.js [fragments目录] --write   # 执行修复
 *   node fix-md.js [fragments目录] --write --verbose  # 详细输出
 */

const fs = require('fs');
const path = require('path');

const FRAGMENTS_DIR = process.argv[2] || './fragments';
const WRITE_MODE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

// ===== 修复规则 =====

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const basename = path.basename(filePath);
  const chapterNum = parseInt(basename.match(/chapter-(\d+)/)?.[1] || '0', 10);

  const changes = [];
  const newLines = [];

  // 检测文件结构类型
  // 旧结构A：# 第X章 (h1) + ## X.Y (h2) → 整体降一级
  // 旧结构B：## 第X章 (h2) + ## X.Y (h2) → 节标题降一级
  // 正确结构：## 第X章 (h2) + ### X.Y (h3) → 无需修复

  let hasH1Chapter = false;
  let hasH2Section = false; // h2 的节标题（错误）
  let hasH3Section = false; // h3 的节标题（正确）

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const title = match[2].trim();

    if (/^第\d+章/.test(title) && level === 1) {
      hasH1Chapter = true;
    }
    if (/^\d+\.\d+(?!\.)/.test(title) && level === 2) {
      hasH2Section = true;
    }
    if (/^\d+\.\d+(?!\.)/.test(title) && level === 3) {
      hasH3Section = true;
    }
  }

  // 判断修复模式
  // 模式A：有h1章标题 → 整体降一级
  // 模式B：h2章标题 + h2节标题 → 只降节标题和子标题
  // 模式C：h2章标题 + h3节标题 → 正确结构，无需修复
  const mode = hasH1Chapter ? 'A' : (hasH2Section ? 'B' : 'C');

  if (mode === 'C' && !hasH2Section) {
    if (VERBOSE) {
      console.log(`⏭️  ${basename}: 标题结构正确，无需修复`);
    }
    return { changed: false, changes: [], mode };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (!headingMatch) {
      newLines.push(line);
      continue;
    }

    const hashes = headingMatch[1];
    const title = headingMatch[2];
    const level = hashes.length;

    // 跳过 frontmatter 分隔符
    if (line.trim() === '---') {
      newLines.push(line);
      continue;
    }

    let newLine = line;
    let changeDesc = null;

    if (mode === 'A') {
      // 模式A：整体降一级
      // # 第X章 → ## 第X章
      // ## X.Y → ### X.Y
      // ### X.Y.Z → #### X.Y.Z
      // #### xxx → ##### xxx
      if (level >= 1 && level <= 5) {
        const newHashes = '#'.repeat(level + 1);
        newLine = `${newHashes} ${title}`;
        changeDesc = `${hashes} → ${newHashes}: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"`;
      }
    } else if (mode === 'B') {
      // 模式B：h2章标题保持不变，节标题和子标题降一级
      if (/^第\d+章/.test(title)) {
        // 章标题保持 h2
        newLine = line;
      } else if (/^\d+\.\d+(\.\d+)?/.test(title)) {
        // 节标题/子节标题降一级
        const newHashes = '#'.repeat(level + 1);
        newLine = `${newHashes} ${title}`;
        changeDesc = `${hashes} → ${newHashes}: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"`;
      } else if (level >= 2) {
        // 其他 h2+ 标题也降一级（如"本章核心观点"等）
        const newHashes = '#'.repeat(level + 1);
        newLine = `${newHashes} ${title}`;
        changeDesc = `${hashes} → ${newHashes}: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"`;
      }
    }

    if (changeDesc && newLine !== line) {
      changes.push({ line: i + 1, desc: changeDesc });
    }

    newLines.push(newLine);
  }

  return {
    changed: changes.length > 0,
    changes,
    mode,
    newContent: newLines.join('\n')
  };
}

function main() {
  if (!fs.existsSync(FRAGMENTS_DIR)) {
    console.error(`❌ 目录不存在: ${FRAGMENTS_DIR}`);
    process.exit(1);
  }

  const mdFiles = fs.readdirSync(FRAGMENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(FRAGMENTS_DIR, f)
    }))
    .sort((a, b) => {
      const na = parseInt(a.name.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.name.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });

  if (mdFiles.length === 0) {
    console.log('⏭️  未找到 Markdown 文件');
    process.exit(0);
  }

  console.log(`📄 发现 ${mdFiles.length} 个 Markdown 文件\n`);

  let fixedCount = 0;
  let skipCount = 0;
  const allChanges = [];

  for (const file of mdFiles) {
    const result = fixFile(file.path);

    if (!result.changed) {
      skipCount++;
      if (VERBOSE) {
        console.log(`⏭️  ${file.name}: 无需修复`);
      }
      continue;
    }

    fixedCount++;
    const modeDesc = result.mode === 'A' ? '整体降一级' : '节标题降一级';
    console.log(`🔧 ${file.name} (${modeDesc}, ${result.changes.length} 处修改)`);

    if (VERBOSE) {
      for (const change of result.changes.slice(0, 5)) {
        console.log(`   第${change.line}行: ${change.desc}`);
      }
      if (result.changes.length > 5) {
        console.log(`   ... 还有 ${result.changes.length - 5} 处`);
      }
    }

    allChanges.push({
      file: file.name,
      mode: result.mode,
      count: result.changes.length
    });

    if (WRITE_MODE) {
      fs.writeFileSync(file.path, result.newContent, 'utf-8');
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`修复统计: ${fixedCount} 个文件修改, ${skipCount} 个文件跳过`);

  if (!WRITE_MODE && fixedCount > 0) {
    console.log('');
    console.log('⚠️  当前为预览模式，未实际写入文件');
    console.log('   如需执行修复，请添加 --write 参数：');
    console.log(`   node fix-md.js "${FRAGMENTS_DIR}" --write`);
  }

  if (WRITE_MODE && fixedCount > 0) {
    console.log('');
    console.log('✅ 修复已完成，建议重新运行 check-md.js 验证');
    console.log(`   node check-md.js "${FRAGMENTS_DIR}"`);
  }
}

main();
