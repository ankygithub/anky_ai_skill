#!/usr/bin/env node
/**
 * lite - 产物重建（Node 版，替代 rebuild.sh，无 bash 依赖）
 *
 * 用法：
 *   node rebuild.js                    # 重建所有产物（html+reader+pdf+md）
 *   node rebuild.js html,pdf           # 只重建指定产物
 *   node rebuild.js all --clean        # 强制清理后重建（清 fragments/*.html 与 output/）
 *
 * 注意：--clean 模式会自动附加 --no-gate 跳过产物门禁
 *       （清理后若只构建部分产物，产物门禁必然失败）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_DIR = path.dirname(__dirname); // 项目根（本脚本位于 项目/scripts/）

if (!fs.existsSync(path.join(PROJECT_DIR, 'build-all.js'))) {
  console.error('❌ 未找到 build-all.js，请确认脚本位于项目 scripts/ 目录下');
  process.exit(1);
}

// ===== CLI 参数解析 =====
let products = 'all';
let cleanMode = false;
let skipMdCheck = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--clean') cleanMode = true;
  else if (arg === '--skip-md-check') skipMdCheck = true;
  else products = arg;
}

const FRAGMENTS_DIR = path.join(PROJECT_DIR, 'fragments');
if (!fs.existsSync(FRAGMENTS_DIR)) {
  console.error(`❌ fragments 目录不存在: ${FRAGMENTS_DIR}`);
  process.exit(1);
}

console.log('🔄 lite 产物重建脚本');
console.log(`   项目: ${PROJECT_DIR}`);
console.log(`   产物: ${products}${cleanMode ? '（--clean 强制清理）' : ''}${skipMdCheck ? '（--skip-md-check）' : ''}\n`);

// ===== fragments 状态检查 =====
const mdCount = fs.readdirSync(FRAGMENTS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('.')).length;
const htmlCount = fs.readdirSync(FRAGMENTS_DIR).filter(f => f.endsWith('.html')).length;
console.log('📂 fragments 状态:');
console.log(`   .md 文件: ${mdCount} 个`);
console.log(`   .html 文件: ${htmlCount} 个\n`);

if (!skipMdCheck && mdCount === 0) {
  console.error('❌ fragments 目录下没有 .md 文件。');
  console.error('   如果已有 .html 片段想直接构建，请加 --skip-md-check 参数');
  process.exit(1);
}

// ===== 清理旧产物 =====
if (cleanMode) {
  console.log('🧹 [清理] 删除旧产物...');
  for (const f of fs.readdirSync(FRAGMENTS_DIR)) {
    if (f.endsWith('.html')) fs.rmSync(path.join(FRAGMENTS_DIR, f), { force: true });
  }
  console.log(`   ✅ 已清除 fragments 下旧 HTML 片段`);
  const outputDir = path.join(PROJECT_DIR, 'output');
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log('   ✅ 已清空 output/ 目录');
  }
  console.log('');
}

// ===== 执行构建 =====
console.log('🔨 开始构建...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const args = [path.join(PROJECT_DIR, 'build-all.js'), '--products', products];
if (cleanMode) args.push('--no-gate');
const result = spawnSync(process.execPath, args, { cwd: PROJECT_DIR, stdio: 'inherit' });

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (result.status === 0) {
  console.log('\n✅ 重建完成！产物位置: output/');
} else {
  console.error(`\n❌ 构建失败，退出码: ${result.status}`);
  process.exit(result.status || 1);
}
