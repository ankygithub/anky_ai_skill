/**
 * 共享围栏状态机（唯一权威实现）
 *
 * 背景：convert-md / check-md / build-all 曾各自实现"代码围栏判定"，
 * 语义存在细微差异（trim 与否、缩进是否算围栏），一段代码内容里出现
 * 行内 ``` 时各处理解分裂，曾导致配对错位吞掉半章正文（实际事故）。
 *
 * 规则（统一语义）：
 * - 一行 trim 后以 ``` 或 ~~~ 开头，即为围栏标记行（开/闭交替翻转）
 * - 缩进的围栏标记行同样有效（与 ``` 内容块中的嵌套代码块一致）
 *
 * 使用方式：
 *   const { scanFenceMask } = require(path.join(__dirname, 'lib', 'fence-scan.js'));
 *   const mask = scanFenceMask(lines);
 *   // mask[i] === true  → 该行是围栏标记行或处于围栏内，跳过语义处理
 *   // mask[i] === false → 该行是普通正文，可安全匹配标题/组件语法等
 */

function isFenceLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

/**
 * 扫描行数组，返回与 lines 等长的布尔掩码：
 * true  = 围栏标记行 / 围栏内部行（调用方应跳过语义处理）
 * false = 普通正文行
 */
function scanFenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceLine(lines[i])) {
      inFence = !inFence;
      mask[i] = true;
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}

module.exports = { isFenceLine, scanFenceMask };
