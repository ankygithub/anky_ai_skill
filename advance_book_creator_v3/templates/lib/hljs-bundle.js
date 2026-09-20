/**
 * highlight.js 内嵌精简版打包入口（v11.11.1，BSD-3-Clause License）
 *
 * 目的：EPUB 代码高亮零安装、跨机器一致——技能自带 core + 19 种书常用语言，
 * 构建（build-epub-pro.js）直接 require 本文件，不再依赖环境中是否装过 highlight.js。
 *
 * 加载优先级（build-epub-pro.js）：
 *   1. 本内嵌版（确定性输出）
 *   2. 环境中已安装的 highlight.js（语言更全，兜底）
 *   3. 内置迷你高亮器（最终兜底）
 *
 * 语言源：highlight.js/lib/core.js + lib/languages/<name>.js（仅复制所需文件）。
 * 注意：v11 起各语言文件自包含（java/csharp 不再依赖 clike），注册顺序仅
 * javascript 需先于 typescript（后者沿用前者的上下文）。
 */
const hljs = require('./hljs/core.js');

const LANGS = [
  'python', 'bash', 'powershell', 'json', 'javascript', 'typescript',
  'xml', 'css', 'sql', 'yaml', 'ini', 'markdown', 'dockerfile',
  'go', 'rust', 'java', 'csharp', 'diff', 'http',
];
for (const name of LANGS) {
  hljs.registerLanguage(name, require(`./hljs/languages/${name}.js`));
}

// 常用别名与近似语法映射（language-toml 等未收录语言落到最近似语法，避免整块放弃高亮）
const EXTRA_ALIASES = {
  ini: ['toml', 'properties', 'conf'],
  bash: ['sh', 'shell', 'zsh', 'console', 'terminal'],
  python: ['py', 'python3'],
  javascript: ['js', 'node'],
  typescript: ['ts'],
  xml: ['html', 'svg'],
  go: ['golang'],
  csharp: ['c#', 'cs'],
  markdown: ['md'],
};
for (const [name, aliases] of Object.entries(EXTRA_ALIASES)) {
  try {
    hljs.registerAliases(aliases, { languageName: name });
  } catch (e) {
    // 个别别名冲突不影响整体可用性
  }
}

module.exports = hljs;
