const t = require('fs').readFileSync('D:/workspace/MyGitWorkSpace/ai-skill/test/网文百万字生存指南/output/网文百万字生存指南v2.html', 'utf-8');
const Q = '`'.repeat(0);
const checks = {
  'html默认print-proof': t.includes('<html lang="zh-CN" data-theme="print-proof">'),
  '面板注册锐利审稿': t.includes("setTheme('print-proof')") && t.includes('锐利审稿'),
  '初始默认print-proof': t.includes("getSaved('theme', 'print-proof')"),
  '墨底表头': t.includes('background: #1F2126'),
  '表头朱砂下线': t.includes('border-bottom: 2px solid #B42318'),
  'V2变量为主题限定': t.includes('[data-theme="print-proof"] {'),
  '旧默认主题变量保留': t.includes('--text-primary: #1C1917'),
  '印刷双线章标题': t.includes('3px double'),
  '选中朱砂': t.includes('::selection'),
  '其他主题未被删除(dark-gold)': t.includes('[data-theme="dark-gold"]'),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) {
  console.log((v ? 'OK   ' : 'FAIL ') + k);
  if (!v) ok = false;
}
process.exit(ok ? 0 : 1);
