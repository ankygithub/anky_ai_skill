#!/usr/bin/env node
/**
 * lite - 流程门禁信号（轻量硬信号，无 AI 语义判断）
 *
 * 用法（在书项目下运行）：
 *   node scripts/stage.js writing  --done   # 写作完成（要求 fragments/ 有 part*.md）
 *   node scripts/stage.js review   --done   # 对抗性审查完成（要求 materials/review/issues.md）
 *   node scripts/stage.js revision --done   # 统一修改 + 核销完成（要求 materials/review/resolved.md）
 *   node scripts/stage.js status            # 查看当前信号
 *
 * 写入 materials/workflow.json；构建门禁 build-all.js [0c] 据此校验。
 * 重复标记某阶段会作废其后阶段信号（重写→须重审，重审→须重核销）。
 */

const fs = require('fs');
const path = require('path');
const { fingerprint } = require(path.join(__dirname, '..', 'lib', 'flow-gate.js'));

const PROJECT_DIR = path.dirname(__dirname); // 项目根（本脚本位于 项目/scripts/）
const FRAGMENTS_DIR = path.join(PROJECT_DIR, 'fragments');
const WF_PATH = path.join(PROJECT_DIR, 'materials', 'workflow.json');
const REVIEW_DIR = path.join(PROJECT_DIR, 'materials', 'review');

const STAGES = ['writing', 'review', 'revision'];
// 重标某阶段时，作废其后阶段信号，强制流程重走
const NEXT = { writing: ['review', 'revision'], review: ['revision'], revision: [] };

function readWf() {
  if (!fs.existsSync(WF_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(WF_PATH, 'utf-8')); } catch { return {}; }
}
function writeWf(wf) {
  fs.mkdirSync(path.dirname(WF_PATH), { recursive: true });
  fs.writeFileSync(WF_PATH, JSON.stringify(wf, null, 2) + '\n', 'utf-8');
}
function nowISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const s = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}` +
    `${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}
function partIds() {
  if (!fs.existsSync(FRAGMENTS_DIR)) return [];
  return fs.readdirSync(FRAGMENTS_DIR)
    .map(f => (f.match(/^(part\d+)/) || [])[1]).filter(Boolean).sort();
}
function countIssueRows(md) {
  let n = 0;
  for (const line of md.split('\n')) if (/^\s*\|\s*\d+\s*\|/.test(line)) n++;
  return n;
}

const [stage, ...flags] = process.argv.slice(2);

if (!stage || stage === 'status') {
  const wf = readWf();
  console.log('📋 流程门禁信号（materials/workflow.json）');
  for (const k of STAGES) {
    const s = wf[k];
    console.log(s && s.done
      ? `   ✅ ${k.padEnd(8)} ${s.at || ''}  fp=${s.fp || '-'}`
      : `   ⬜ ${k.padEnd(8)} 未完成`);
  }
  console.log(`   当前指纹  ${fingerprint(FRAGMENTS_DIR) || '(无 fragments)'}`);
  process.exit(0);
}

if (!STAGES.includes(stage)) {
  console.error(`❌ 未知阶段: ${stage}（可用: ${STAGES.join(' / ')} / status）`);
  process.exit(1);
}
if (!flags.includes('--done')) {
  console.error(`❌ 缺少 --done（例: node scripts/stage.js ${stage} --done）`);
  process.exit(1);
}

// 依赖留痕校验：信号不能凭空写，必须对应产物已落盘
if (stage === 'writing' && partIds().length === 0) {
  console.error('❌ fragments/ 下没有 part*.md 正文，不能标记写作完成');
  process.exit(1);
}
if (stage === 'review' && !fs.existsSync(path.join(REVIEW_DIR, 'issues.md'))) {
  console.error('❌ 未找到 materials/review/issues.md —— 审查未落盘，不能标记审查完成');
  process.exit(1);
}
if (stage === 'revision' && !fs.existsSync(path.join(REVIEW_DIR, 'resolved.md'))) {
  console.error('❌ 未找到 materials/review/resolved.md —— 核销未落盘，不能标记修改完成');
  process.exit(1);
}

const wf = readWf();
const fp = fingerprint(FRAGMENTS_DIR);
const entry = { done: true, at: nowISO(), fp };
if (stage === 'writing') entry.parts = partIds();
if (stage === 'review') {
  try {
    entry.issues = countIssueRows(fs.readFileSync(path.join(REVIEW_DIR, 'issues.md'), 'utf-8'));
  } catch { entry.issues = 0; }
}
wf[stage] = entry;
for (const k of NEXT[stage]) delete wf[k]; // 重标本阶段 → 作废其后阶段信号
writeWf(wf);

console.log(`✅ 已记录阶段信号：${stage}`);
console.log(`   时间: ${entry.at}`);
console.log(`   指纹: ${fp}`);
if (stage === 'writing') console.log(`   Part: ${entry.parts.join(', ')}`);
process.exit(0);
