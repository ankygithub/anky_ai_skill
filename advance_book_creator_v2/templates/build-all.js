#!/usr/bin/env node
/**
 * 华书 v4 - 统一构建入口 + 产物门禁机制
 *
 * 新增：MD fragments 预处理（convert-md.js 透明转换）
 * 支持：自动连续生成 / 独立数据源调用 / 产物门禁检查
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Windows 沙箱环境 PATH 可能不包含 node，使用完整路径
const NODE_EXE = process.execPath;

const TEMPLATES_DIR = __dirname;
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');

// ===== 验证门禁：MD源文件综合检测 =====
function validateMdFragments() {
  const mdFiles = fs.readdirSync(FRAGMENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(FRAGMENTS_DIR, f));

  if (mdFiles.length === 0) return { valid: true, errors: [], fixable: false };

  const errors = [];

  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(mdFile, 'utf-8');
    const lines = content.split('\n');
    const basename = path.basename(mdFile);
    const chapterNum = parseInt(basename.match(/chapter-(\d+)/)?.[1] || '0', 10);

    // 1. YAML frontmatter 检查
    const hasFrontmatter = content.startsWith('---');
    if (!hasFrontmatter) {
      errors.push({
        file: basename,
        line: 1,
        type: 'yaml',
        severity: 'error',
        message: '缺少 YAML frontmatter（文件开头必须是 ---）',
        fixable: false
      });
    } else {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        errors.push({
          file: basename,
          line: 1,
          type: 'yaml',
          severity: 'error',
          message: 'YAML frontmatter 格式错误（缺少闭合的 ---）',
          fixable: false
        });
      } else {
        const fm = fmMatch[1];
        if (!fm.includes('type:')) {
          errors.push({
            file: basename,
            line: 2,
            type: 'yaml',
            severity: 'error',
            message: '缺少 type 字段（应为 type: chapter/cover/backpage）',
            fixable: false
          });
        }
        if (!fm.includes('title:')) {
          errors.push({
            file: basename,
            line: 2,
            type: 'yaml',
            severity: 'error',
            message: '缺少 title 字段',
            fixable: false
          });
        }
      }
    }

    // 2. 标题层级检查
    let lastLevel = 0;
    let hasChapterHeading = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (!headingMatch) continue;

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // 跳过 frontmatter
      if (line.trim() === '---') continue;

      // 章标题检查
      if (/^第\d+章/.test(title)) {
        hasChapterHeading = true;
        if (level !== 2) {
          errors.push({
            file: basename,
            line: i + 1,
            type: 'heading',
            severity: 'error',
            message: `章标题 "${title}" 必须是 ## (h2)，当前是 ${'#'.repeat(level)} (h${level})`,
            fixable: true
          });
        }
        lastLevel = level;
        continue;
      }

      // 节标题检查：X.Y 必须是 h3
      if (/^\d+\.\d+(?!\.)/.test(title)) {
        if (level !== 3) {
          errors.push({
            file: basename,
            line: i + 1,
            type: 'heading',
            severity: 'error',
            message: `节标题 "${title}" 必须是 ### (h3)，当前是 ${'#'.repeat(level)} (h${level})`,
            fixable: true
          });
        }
        lastLevel = level;
        continue;
      }

      // 子节标题检查：X.Y.Z 必须是 h4
      if (/^\d+\.\d+\.\d+/.test(title)) {
        if (level !== 4) {
          errors.push({
            file: basename,
            line: i + 1,
            type: 'heading',
            severity: 'error',
            message: `子节标题 "${title}" 必须是 #### (h4)，当前是 ${'#'.repeat(level)} (h${level})`,
            fixable: true
          });
        }
        lastLevel = level;
        continue;
      }

      // 标题跳级检查
      if (lastLevel > 0 && level > lastLevel + 1) {
        errors.push({
          file: basename,
          line: i + 1,
          type: 'heading',
          severity: 'warning',
          message: `标题跳级：从 h${lastLevel} 直接跳到 h${level}（"${title}"），中间缺少 h${lastLevel + 1}`,
          fixable: false
        });
      }

      lastLevel = level;
    }

    // 章标题缺失检查
    if (chapterNum > 0 && !hasChapterHeading) {
      errors.push({
        file: basename,
        line: 1,
        type: 'heading',
        severity: 'error',
        message: `缺少章标题（应包含 "第${chapterNum}章 ..."）`,
        fixable: false
      });
    }

    // 3. 非法自定义标签检查
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
            file: basename,
            line: i + 1,
            type: 'tag',
            severity: 'error',
            message: `非法自定义标签 ${pattern.name}，应使用 <div class="..."> 形式`,
            fixable: false
          });
        }
      }
    }
  }

  const fixable = errors.some(e => e.fixable);
  return { valid: errors.length === 0, errors, fixable };
}

function writeErrorLog(errors, fixable) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  let seq = 1;
  let logPath;

  do {
    const seqStr = String(seq).padStart(3, '0');
    logPath = path.join(OUTPUT_DIR, `error-${dateStr}-${timeStr}-${seqStr}.log`);
    seq++;
  } while (fs.existsSync(logPath) && seq < 1000);

  const headingErrors = errors.filter(e => e.type === 'heading');
  const tagErrors = errors.filter(e => e.type === 'tag');
  const yamlErrors = errors.filter(e => e.type === 'yaml');

  const lines = [
    `构建验证失败 - ${now.toISOString()}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `错误统计:`,
    `   标题层级错误: ${headingErrors.length}`,
    `   非法标签错误: ${tagErrors.length}`,
    `   YAML 错误: ${yamlErrors.length}`,
    ``
  ];

  if (headingErrors.length > 0) {
    lines.push('【标题层级错误】');
    lines.push('');
    for (const err of headingErrors) {
      lines.push(`[${err.file}:${err.line}] ${err.message}`);
    }
    lines.push('');
  }

  if (tagErrors.length > 0) {
    lines.push('【非法自定义标签】');
    lines.push('');
    for (const err of tagErrors) {
      lines.push(`[${err.file}:${err.line}] ${err.message}`);
    }
    lines.push('');
  }

  if (yamlErrors.length > 0) {
    lines.push('【YAML frontmatter 错误】');
    lines.push('');
    for (const err of yamlErrors) {
      lines.push(`[${err.file}:${err.line}] ${err.message}`);
    }
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (fixable) {
    lines.push('修复指引：');
    lines.push('1. 自动修复（推荐）：node fix-md.js fragments --write');
    lines.push('   该命令会自动修复标题层级问题（章→h2，节→h3，子节→h4）');
    lines.push('');
    lines.push('2. 手动修复：参考 SKILL.md 第 7.3 节组件模板规范');
    lines.push('');
    lines.push('标题层级规范：');
    lines.push('   ## 第X章 标题      → h2（章标题）');
    lines.push('   ### X.Y 标题      → h3（节标题）');
    lines.push('   #### X.Y.Z 标题   → h4（子节标题）');
  } else {
    lines.push('修复指南：');
    lines.push('1. 打开上述列出的 MD 文件');
    lines.push('2. 将非法自定义标签替换为 SKILL.md 7.3 节对应的标准 HTML div 模板');
    lines.push('3. 例如：<callout-tip> → <div class="callout callout-tip">，闭合标签对应改为 </div>');
  }

  lines.push('');

  fs.writeFileSync(logPath, lines.join('\n'), 'utf-8');
  return logPath;
}

// ===== CLI参数解析 =====
const args = process.argv.slice(2);
let sourcePath = null;
let sourceType = null;
let products = ['html', 'reader', 'pdf', 'md'];
let noGate = false;
let versionBump = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) sourcePath = args[i + 1];
  if (args[i] === '--type' && args[i + 1]) sourceType = args[i + 1];
  if (args[i] === '--products' && args[i + 1]) {
    const p = args[i + 1];
    products = p === 'all' ? ['html', 'reader', 'pdf', 'md'] : p.split(',').map(s => s.trim());
  }
  if (args[i] === '--no-gate') noGate = true;
  if (args[i] === '--version' && args[i + 1]) versionBump = args[i + 1];
}

console.log('🔨 华书 v4 构建系统 (MD-first)');
console.log(`   产物: ${products.join(', ')}`);
if (sourcePath) console.log(`   数据源: ${sourcePath} (${sourceType || 'auto'})`);
if (versionBump) console.log(`   版本更新: ${versionBump}`);
console.log('');

// ===== 版本更新 =====
if (versionBump) {
  if (!fs.existsSync(VERSION_PATH)) {
    console.error('❌ version.json 不存在');
    process.exit(1);
  }

  const versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
  const [major, minor, patch, build] = versionData.version.split('.').map(Number);

  switch (versionBump) {
    case 'major':
      versionData.version = `${major + 1}.0.0`;
      break;
    case 'minor':
      versionData.version = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      versionData.version = `${major}.${minor}.${patch + 1}`;
      break;
    case 'build':
      versionData.version = `${major}.${minor}.${patch}.${(build || 0) + 1}`;
      break;
    default:
      console.error(`❌ 未知的版本类型: ${versionBump}`);
      process.exit(1);
  }

  fs.writeFileSync(VERSION_PATH, JSON.stringify(versionData, null, 2));
  console.log(`📦 版本更新: ${versionData.version}\n`);
}

// ===== 读取版本信息 =====
let versionData;
try {
  versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ version.json 不存在，请先运行 init-project.sh');
  process.exit(1);
}
const { title, version } = versionData;

// ===== 新增：fragments预处理 —— MD → HTML =====
function preprocessFragments() {
  // 检查是否需要转换（fragments目录中有.md文件）
  const existingFiles = fs.readdirSync(FRAGMENTS_DIR).filter(f => !f.startsWith('.'));
  const hasMdFiles = existingFiles.some(f => f.endsWith('.md'));
  const hasHtmlFiles = existingFiles.some(f => f.endsWith('.html'));

  if (!hasMdFiles) {
    // 没有.md文件，跳过预处理
    if (hasHtmlFiles) {
      console.log('📄 fragments 已有 HTML 片段，跳过 MD 转换');
      return true;
    }
    console.error('❌ fragments 目录为空！');
    return false;
  }

  console.log('\n📥 [0] fragments 预处理：MD → HTML...');

  const convertPath = path.join(TEMPLATES_DIR, 'convert-md.js');
  if (!fs.existsSync(convertPath)) {
    console.error('❌ convert-md.js 不存在！');
    return false;
  }

  const result = spawnSync(NODE_EXE, [convertPath, FRAGMENTS_DIR], {
    cwd: TEMPLATES_DIR,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('❌ fragments 预处理失败');
    return false;
  }

  console.log('✅ fragments 预处理完成\n');
  return true;
}

// ===== 构建步骤 =====
const buildSteps = {
  html: () => {
    console.log('\n📄 [1/4] 构建单文件HTML...');
    const buildArgs = ['build.js'];
    if (sourcePath) {
      buildArgs.push('--source', sourcePath);
      if (sourceType) buildArgs.push('--type', sourceType);
    }
    const result = spawnSync(NODE_EXE, buildArgs, {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  reader: () => {
    console.log('\n📖 [2/4] 构建多文件阅读器...');
    const result = spawnSync(NODE_EXE, ['build-reader.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  pdf: () => {
    console.log('\n📕 [3/4] 构建PDF（精确书签）...');
    const result = spawnSync(NODE_EXE, ['build-pdf.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  md: () => {
    console.log('\n📝 [4/4] 构建Markdown...');
    const result = spawnSync(NODE_EXE, ['build-md.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  }
};

// ===== 预处理 fragments =====
if (!sourcePath) {
  // 自动模式：检查fragments目录

  // 先执行 MD 源文件验证门禁
  console.log('\n🔍 [0a] MD 源文件验证门禁...');
  const validation = validateMdFragments();
  if (!validation.valid) {
    const headingErrors = validation.errors.filter(e => e.type === 'heading');
    const tagErrors = validation.errors.filter(e => e.type === 'tag');
    const yamlErrors = validation.errors.filter(e => e.type === 'yaml');

    console.error(`\n❌ 验证门禁失败：`);
    console.error(`   标题层级错误: ${headingErrors.length}`);
    console.error(`   非法标签错误: ${tagErrors.length}`);
    console.error(`   YAML 错误: ${yamlErrors.length}`);
    console.error('');

    // 显示前5个错误
    for (const err of validation.errors.slice(0, 5)) {
      const icon = err.severity === 'error' ? '❌' : '⚠️';
      console.error(`   ${icon} [${err.file}:${err.line}] ${err.message}`);
    }
    if (validation.errors.length > 5) {
      console.error(`   ... 还有 ${validation.errors.length - 5} 处错误`);
    }
    console.error('');

    // 写入错误日志文件
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const logPath = writeErrorLog(validation.errors, validation.fixable);
    console.error(`   详细错误日志已保存到: ${path.basename(logPath)}`);

    if (validation.fixable) {
      console.error('');
      console.error('💡 检测到可自动修复的标题层级问题');
      console.error('   请运行: node fix-md.js fragments --write');
      console.error('   修复后重新执行构建');
    }

    process.exit(1);
  }
  console.log('✅ MD 源文件验证通过');

  // 再执行 fragments 预处理
  if (!preprocessFragments()) {
    console.error('\n❌ 预处理失败，终止构建');
    process.exit(1);
  }
}

// ===== 按顺序构建 =====
let allSuccess = true;
for (const product of products) {
  if (buildSteps[product]) {
    const success = buildSteps[product]();
    if (!success) {
      console.error(`❌ ${product} 构建失败`);
      allSuccess = false;
    }
  }
}

if (!allSuccess) {
  console.error('\n❌ 部分产物构建失败，跳过门禁检查');
  process.exit(1);
}

// ===== 门禁检查 =====
if (!noGate) {
  console.log('\n🔒 门禁检查...');

  const productFiles = {
    html: path.join(OUTPUT_DIR, `${title}-v${version}.html`),
    reader: path.join(OUTPUT_DIR, 'reader', 'index.html'),
    pdf: path.join(OUTPUT_DIR, `${title}-v${version}.pdf`),
    md: path.join(OUTPUT_DIR, `${title}-v${version}.md`)
  };

  const missing = products.filter(p => {
    const filePath = productFiles[p];
    return !fs.existsSync(filePath);
  });

  if (missing.length > 0) {
    console.error(`❌ 门禁检查失败：缺少产物 ${missing.join(', ')}`);
    console.error('   如需只生成特定产物，请指定 --products 参数');
    console.error('   例如: node build-all.js --products html,pdf');
    process.exit(1);
  }

  console.log('✅ 门禁检查通过');
} else {
  console.log('\n⏭️ 跳过门禁检查');
}

// ===== 输出摘要 =====
console.log('\n📊 构建摘要');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const productLabels = {
  html: 'HTML单文件',
  reader: 'HTML多文件阅读器',
  pdf: 'PDF（带精确书签）',
  md: 'Markdown'
};

for (const product of products) {
  const filePath = {
    html: path.join(OUTPUT_DIR, `${title}-v${version}.html`),
    reader: path.join(OUTPUT_DIR, 'reader', 'index.html'),
    pdf: path.join(OUTPUT_DIR, `${title}-v${version}.pdf`),
    md: path.join(OUTPUT_DIR, `${title}-v${version}.md`)
  }[product];

  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    const sizeStr = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(2)} MB`
      : `${(size / 1024).toFixed(1)} KB`;
    console.log(`   ✅ ${productLabels[product]}: ${sizeStr}`);
  } else {
    console.log(`   ❌ ${productLabels[product]}: 未生成`);
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n🎉 ${title} v${version} 构建完成！`);
