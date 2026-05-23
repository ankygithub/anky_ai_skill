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

const TEMPLATES_DIR = __dirname;
const OUTPUT_DIR = path.join(TEMPLATES_DIR, 'output');
const VERSION_PATH = path.join(TEMPLATES_DIR, 'version.json');
const FRAGMENTS_DIR = path.join(TEMPLATES_DIR, 'fragments');

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

  const result = spawnSync('node', [convertPath, FRAGMENTS_DIR], {
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
    const result = spawnSync('node', buildArgs, {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  reader: () => {
    console.log('\n📖 [2/4] 构建多文件阅读器...');
    const result = spawnSync('node', ['build-reader.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  pdf: () => {
    console.log('\n📕 [3/4] 构建PDF（精确书签）...');
    const result = spawnSync('node', ['build-pdf.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  },
  md: () => {
    console.log('\n📝 [4/4] 构建Markdown...');
    const result = spawnSync('node', ['build-md.js'], {
      cwd: TEMPLATES_DIR,
      stdio: 'inherit'
    });
    return result.status === 0;
  }
};

// ===== 预处理 fragments =====
if (!sourcePath) {
  // 自动模式：检查fragments目录
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
