/**
 * Book-PDF Markdown 生成脚本
 * 将合并后的 HTML 单文件转换为 Markdown 格式
 *
 * 前置：先运行 node build.js 生成 HTML
 * 依赖：无（零依赖，内置HTML→Markdown转换器）
 * 用法：node build-md.js
 */

const fs = require('fs');
const path = require('path');

const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
const HTML_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.html`);
const MD_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.md`);

// 简单的 HTML 到 Markdown 转换器（不依赖外部库，零依赖）
function htmlToMarkdown(html) {
  let md = html;

  // 移除 <head> 和 <style>
  md = md.replace(/<head>[\s\S]*?<\/head>/gi, '');
  md = md.replace(/<style>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<script>[\s\S]*?<\/script>/gi, '');

  // 移除注释
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // 转换标题
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

  // 转换段落
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  // 转换粗体/斜体
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');

  // 转换代码
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // 转换表格
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, content) => {
    let tableMd = '\n';
    const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    rows.forEach((row, i) => {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
      tableMd += '| ' + cellTexts.join(' | ') + ' |\n';
      if (i === 0) {
        tableMd += '|' + cellTexts.map(() => ' --- ').join('|') + '|\n';
      }
    });
    return tableMd;
  });

  // 转换列表
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
    const items = content.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    return '\n' + items.map(item => '- ' + item.replace(/<[^>]+>/g, '').trim()).join('\n') + '\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
    const items = content.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    return '\n' + items.map((item, i) => `${i + 1}. ` + item.replace(/<[^>]+>/g, '').trim()).join('\n') + '\n';
  });

  // 转换链接
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // 转换 div 和 span（移除标签但保留内容）
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1');
  md = md.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');

  // 清理剩余HTML标签
  md = md.replace(/<[^>]+>/g, '');

  // 清理多余空行
  md = md.replace(/\n{3,}/g, '\n\n');

  // HTML实体解码
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  return md.trim();
}

function buildMarkdown() {
  if (!fs.existsSync(HTML_FILE)) {
    console.error(`❌ HTML file not found: ${HTML_FILE}`);
    console.error('   Please run "node build.js" first.');
    process.exit(1);
  }

  console.log('📝 Converting HTML to Markdown...');

  const html = fs.readFileSync(HTML_FILE, 'utf-8');
  const md = htmlToMarkdown(html);

  // 添加YAML frontmatter
  const frontmatter = `---
title: ${versionData.title}
version: ${versionData.version}
date: ${versionData.lastUpdate}
---

`;

  fs.writeFileSync(MD_FILE, frontmatter + md, 'utf-8');

  const sizeKB = (Buffer.byteLength(md, 'utf-8') / 1024).toFixed(1);
  console.log(`✅ Markdown generated: ${MD_FILE}`);
  console.log(`   Size: ${sizeKB} KB`);
}

buildMarkdown();
