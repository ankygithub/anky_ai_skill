#!/usr/bin/env node
/**
 * HTML 转 HTML 片段转换器
 * 将 HTML 文件或文件夹转换为符合 design-system 规范的片段
 */

const fs = require('fs');
const path = require('path');

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('用法: node convert-html.js <html文件或文件夹>');
  process.exit(1);
}

const FRAGMENTS_DIR = path.join(__dirname, 'fragments');
if (!fs.existsSync(FRAGMENTS_DIR)) fs.mkdirSync(FRAGMENTS_DIR, { recursive: true });

// 清空旧片段
fs.readdirSync(FRAGMENTS_DIR).forEach(f => fs.unlinkSync(path.join(FRAGMENTS_DIR, f)));

// 判断是文件还是文件夹
const stat = fs.statSync(sourcePath);
let htmlFiles = [];

if (stat.isDirectory()) {
  htmlFiles = fs.readdirSync(sourcePath)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(sourcePath, f))
    .sort();
} else {
  htmlFiles = [sourcePath];
}

console.log(`📄 发现 ${htmlFiles.length} 个 HTML 文件`);

// 提取body内容
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

// 清理script和style标签
function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

// 映射标题层级
function mapHeadings(html) {
  let h2Count = 0;
  // h1 -> h2.section-title
  html = html.replace(/<h1([^>]*)>(.*?)<\/h1>/gi, (match, attrs, content) => {
    h2Count++;
    return `<h2 class="section-title page-break" id="part${h2Count}"><span class="num">§${String(h2Count).padStart(2, '0')}</span> ${content}</h2>`;
  });
  // h2 -> h3
  html = html.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, '<h3$1>$2</h3>');
  // h3 -> h4
  html = html.replace(/<h3([^>]*)>(.*?)<\/h3>/gi, '<h4$1>$2</h4>');
  return html;
}

// 处理第一个文件（提取封面信息）
const firstFile = htmlFiles[0];
const firstHtml = fs.readFileSync(firstFile, 'utf-8');
const titleMatch = firstHtml.match(/<title>(.*?)<\/title>/i);
const h1Match = firstHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
const coverTitle = titleMatch ? titleMatch[1] : (h1Match ? h1Match[1].replace(/<[^>]+>/g, '') : '未命名文档');

// 生成封面
const coverHtml = `<div class="cover">
  <div class="cover-badge">参考指南</div>
  <h1>${coverTitle}</h1>
  <p class="cover-subtitle"></p>
  <div class="cover-meta">
    <span>v1.0.0</span>
  </div>
</div>`;

fs.writeFileSync(path.join(FRAGMENTS_DIR, '00-cover.html'), coverHtml);
console.log('✅ 生成封面片段');

// 处理所有文件生成内容片段
let partNum = 1;
let allTocData = [];

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf-8');
  let bodyContent = extractBody(html);
  bodyContent = cleanHtml(bodyContent);
  bodyContent = mapHeadings(bodyContent);

  // 提取目录
  const h2Matches = bodyContent.matchAll(/<h2[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/gi);
  for (const m of h2Matches) {
    allTocData.push({ id: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
  }

  const partHtml = `<div class="content">\n${bodyContent}\n</div>`;
  fs.writeFileSync(path.join(FRAGMENTS_DIR, `part${String(partNum).padStart(2, '0')}.html`), partHtml);
  console.log(`✅ 生成 part${String(partNum).padStart(2, '0')}.html`);
  partNum++;
}

// 生成目录片段
let tocHtml = `<div class="content">\n<div class="toc">\n<h2>目录</h2>\n<ul>\n`;
for (let i = 0; i < allTocData.length; i++) {
  const item = allTocData[i];
  tocHtml += `  <li><a href="#${item.id}"><span class="toc-num">§${String(i + 1).padStart(2, '0')}</span><span class="toc-title-text">${item.title}</span></a></li>\n`;
}
tocHtml += `</ul>\n</div>\n</div>`;

fs.writeFileSync(path.join(FRAGMENTS_DIR, '01-toc.html'), tocHtml);
console.log('✅ 生成目录片段');

// 生成尾页
const backpageHtml = `<div class="backpage">
  <h2>文档结束</h2>
  <p>${coverTitle}</p>
</div>`;
fs.writeFileSync(path.join(FRAGMENTS_DIR, '99-backpage.html'), backpageHtml);
console.log('✅ 生成尾页片段');

console.log(`\n🎉 共生成 ${partNum + 2} 个片段文件`);
