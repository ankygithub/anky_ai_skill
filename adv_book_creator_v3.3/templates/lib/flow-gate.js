/**
 * 流程门禁（共享逻辑）：阶段信号 + 交叉校验 + 指纹
 *
 * 纯机械判断，不做任何 AI 语义分析——见 SKILL.md「5. 编辑审查」与 README 维护须知。
 * 被 templates/build-all.js（构建门禁 [0c]）与 scripts/stage.js（写信号）共用，
 * 保证"指纹算法"与"校验规则"单一来源、不漂移。
 *
 * 校验五项：
 *   1) 阶段信号 writing / review / revision 三段必到（materials/workflow.json）
 *   2) 审查留痕 issues.md + resolved.md 必在
 *   3) 大纲 vs 片段：PROJECT.md §五 列出的 part 必须在 fragments/ 存在（防漏写）
 *   4) 核销覆盖：issues.md 高/中级编号必须在 resolved.md 出现（防漏核销）
 *   5) 指纹一致：当前片段指纹 == revision.fp（防"修改完成后又动稿"）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 片段指纹：fragments/*.md（按文件名排序）内容哈希，取 12 位十六进制
function fingerprint(fragmentsDir) {
  if (!fs.existsSync(fragmentsDir)) return '';
  const files = fs.readdirSync(fragmentsDir).filter(f => f.endsWith('.md')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update('\0');
    h.update(fs.readFileSync(path.join(fragmentsDir, f)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

// 表格行拆分：先剥首尾竖线，再按未转义竖线切（避免列错位）
function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim());
}
function isSepRow(cells) {
  return cells.length > 0 && cells.every(c => c === '' || /^:?-{2,}:?$/.test(c));
}

// 从 PROJECT.md §五 章节大纲 解析 partNN 列表（只在 §五 小节内找，避免误命中别处）
function outlinePartIds(md) {
  const ids = new Set();
  let inSec = false;
  for (const line of md.split('\n')) {
    if (/^##\s*五、/.test(line)) { inSec = true; continue; }
    if (inSec && /^##\s/.test(line)) break; // 到下一节（### 不触发，故子标题不会误截断）
    if (!inSec) continue;
    const m = line.match(/part\d+/g);
    if (m) m.forEach(x => ids.add(x));
  }
  return [...ids].sort();
}

// issues.md 中"高/中级"意见编号（表格第 3 列 = 级别）
function highMedIssueIds(md) {
  const ids = new Set();
  for (const line of md.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const c = splitRow(line);
    if (c.length < 3 || isSepRow(c)) continue;
    if (!/^\d+$/.test(c[0])) continue;
    if (c[2] === '高' || c[2] === '中') ids.add(parseInt(c[0], 10));
  }
  return ids;
}

// resolved.md 中已核销的编号（表格第 1 列）
function resolvedIds(md) {
  const ids = new Set();
  for (const line of md.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const c = splitRow(line);
    if (c.length < 2 || isSepRow(c)) continue;
    if (!/^\d+$/.test(c[0])) continue;
    ids.add(parseInt(c[0], 10));
  }
  return ids;
}

function validateFlowGate(projectDir) {
  const errors = [];
  const warnings = [];
  const fragDir = path.join(projectDir, 'fragments');
  const wfPath = path.join(projectDir, 'materials', 'workflow.json');
  const issuesPath = path.join(projectDir, 'materials', 'review', 'issues.md');
  const resolvedPath = path.join(projectDir, 'materials', 'review', 'resolved.md');

  // 1) 三段阶段信号
  let wf = null;
  if (!fs.existsSync(wfPath)) {
    errors.push('缺少流程信号 materials/workflow.json（依次运行 node scripts/stage.js writing/review/revision --done）');
  } else {
    try { wf = JSON.parse(fs.readFileSync(wfPath, 'utf-8')); }
    catch (e) { errors.push('materials/workflow.json 解析失败：' + e.message); }
  }
  if (wf) {
    for (const k of ['writing', 'review', 'revision']) {
      if (!wf[k] || !wf[k].done) errors.push(`未标记阶段完成：${k}（node scripts/stage.js ${k} --done）`);
    }
  }

  // 2) 审查留痕
  if (!fs.existsSync(issuesPath)) errors.push('缺少审查意见清单 materials/review/issues.md');
  if (!fs.existsSync(resolvedPath)) errors.push('缺少审查核销 materials/review/resolved.md');

  // 3) 大纲 vs 片段（防漏写）
  const projMd = [path.join(projectDir, 'PROJECT.md'), path.join(process.cwd(), 'PROJECT.md')]
    .find(p => fs.existsSync(p));
  if (!projMd) {
    warnings.push('未找到 PROJECT.md，跳过"大纲 vs 片段"漏写校验');
  } else {
    const expected = outlinePartIds(fs.readFileSync(projMd, 'utf-8'));
    const actual = new Set(
      fs.existsSync(fragDir)
        ? fs.readdirSync(fragDir).map(f => (f.match(/^(part\d+)/) || [])[1]).filter(Boolean)
        : []
    );
    if (expected.length === 0) {
      warnings.push('未能从 PROJECT.md §五 解析出 part 列表，跳过漏写校验（请在 §五 章节大纲列出 part 文件名）');
    } else {
      const missing = expected.filter(p => !actual.has(p));
      if (missing.length) errors.push(`大纲列出但 fragments/ 缺失：${missing.join(', ')}（疑似漏写）`);
    }
  }

  // 4) 核销覆盖（防漏核销）
  if (fs.existsSync(issuesPath) && fs.existsSync(resolvedPath)) {
    const issuesText = fs.readFileSync(issuesPath, 'utf-8');
    const must = highMedIssueIds(issuesText);
    const done = resolvedIds(fs.readFileSync(resolvedPath, 'utf-8'));
    const miss = [...must].filter(id => !done.has(id)).sort((a, b) => a - b);
    if (miss.length) {
      errors.push(`高/中级意见未核销：#${miss.join(', #')}（请在 resolved.md 逐条核销）`);
    } else if (must.size === 0 && !/通过|无问题|0\s*处/.test(issuesText)) {
      warnings.push('issues.md 未解析到高/中级意见编号，请确认表格格式符合 editor-review.md §七');
    }
  }

  // 5) 指纹一致（防"修改完成后又动稿"）
  if (wf && wf.revision && wf.revision.done && wf.revision.fp) {
    const cur = fingerprint(fragDir);
    if (cur && wf.revision.fp !== cur) {
      errors.push(`片段在"修改完成"之后又被改动（指纹 ${wf.revision.fp} → ${cur}）——请重跑 revision --done，必要时重审`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateFlowGate, fingerprint, outlinePartIds, highMedIssueIds, resolvedIds };
