/**
 * Book-PDF 生成脚本模板（v2 - 带自动书签生成）
 * 使用 Playwright 将合并后的 HTML 渲染为 A4 PDF，并自动提取目录生成书签
 *
 * 前置：先运行 node build.js 生成 HTML
 * 依赖：npm install playwright pdf-lib && npx playwright install chromium
 * 用法：node build-pdf.js
 *
 * 书签生成说明：
 * - 自动从 HTML 中的 <h2 class="section-title" id="xxx"> 提取书签
 * - 中文书签使用 UTF-16BE with BOM 编码，避免乱码
 * - 页码通过测量元素在文档中的绝对位置动态计算，确保定位准确
 */

const { chromium } = require('playwright');
const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
const HTML_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.html`);
const PDF_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.pdf`);

// ==================== 书签配置 ====================
// 自定义书签：如果HTML中没有对应id的元素，可以在这里手动添加
// 格式: { title: '书签标题', id: 'html-element-id' }
// id 为 null 表示不关联HTML元素（如封面、尾页）
const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null },
  { title: '目录', id: null },
];

// 尾页书签（自动检测）
const BACKPAGE_BOOKMARK = { title: '尾页', id: null };

// ==================== UTF-16BE 编码工具 ====================

/**
 * 将文本编码为 UTF-16BE with BOM 格式
 * PDF 书签 Title 字段必须使用此编码才能正确显示中文
 *
 * 原理：
 * - PDF 字符串对象支持两种格式：字面量 (abc) 和十六进制 <hex>
 * - 中文必须使用 UTF-16BE 编码，并带有 BOM 头 (FE FF)
 * - 通过 PDFHexString.of() 直接写入十六进制，避免 pdf-lib 的额外转义
 *
 * @param {string} text - 要编码的文本
 * @returns {Buffer} UTF-16BE with BOM 的 Buffer
 */
function createUtf16BeBuffer(text) {
  const bom = Buffer.from([0xFE, 0xFF]);
  const utf16le = Buffer.from(text, 'utf16le');
  // 小端序转大端序：交换每两个字节的顺序
  for (let i = 0; i < utf16le.length; i += 2) {
    const tmp = utf16le[i];
    utf16le[i] = utf16le[i + 1];
    utf16le[i + 1] = tmp;
  }
  return Buffer.concat([bom, utf16le]);
}

/**
 * 从 HTML 文件中自动提取书签结构
 * 扫描所有 <h2 class="section-title" id="xxx"> 元素
 *
 * @param {string} htmlContent - HTML 文件内容
 * @returns {Array<{title: string, id: string}>} 书签列表
 */
function extractBookmarksFromHtml(htmlContent) {
  const bookmarks = [];

  // 匹配 <h2 class="...section-title..." id="xxx">...</h2>
  const h2Regex = /<h2[^>]*class="[^"]*section-title[^"]*"[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/gi;
  const matches = [...htmlContent.matchAll(h2Regex)];

  for (const match of matches) {
    const id = match[1];
    const innerHtml = match[2];
    // 去除所有 HTML 标签，提取纯文本标题
    const title = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (title && id) {
      bookmarks.push({ title, id });
    }
  }

  return bookmarks;
}

// ==================== 主流程 ====================

(async () => {
  console.log('🚀 Starting PDF generation with auto bookmarks...');

  // ---- 步骤1：读取HTML并提取书签结构 ----
  const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
  const extractedBookmarks = extractBookmarksFromHtml(htmlContent);

  // 合并自定义书签 + 提取的书签 + 尾页书签
  const allBookmarks = [
    ...CUSTOM_BOOKMARKS,
    ...extractedBookmarks,
    BACKPAGE_BOOKMARK,
  ];

  console.log(`\n📑 Extracted ${extractedBookmarks.length} bookmarks from HTML`);
  console.log(`   Total bookmarks: ${allBookmarks.length}`);

  // ---- 步骤2：用 Playwright 打开HTML并测量元素位置 ----
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`file://${HTML_FILE}`, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // 等待字体和图片加载
  await page.waitForTimeout(4000);

  // 在浏览器中测量每个书签元素的绝对位置
  const bookmarkData = await page.evaluate((bookmarks) => {
    const results = [];

    // 获取文档总高度
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );

    for (const bm of bookmarks) {
      if (!bm.id) {
        // 无id的书签：封面放在第0页，尾页放在最后一页
        const isBackpage = bm.title === '尾页';
        results.push({
          title: bm.title,
          id: null,
          offsetTop: isBackpage ? docHeight : 0,
          docHeight: docHeight,
        });
        continue;
      }

      const el = document.getElementById(bm.id);
      if (el) {
        // 使用 offsetTop 累加获取元素在文档中的绝对位置
        // 注意：getBoundingClientRect().top 是视口相对位置，不适合计算页码
        let offsetTop = 0;
        let node = el;
        while (node) {
          offsetTop += node.offsetTop;
          node = node.offsetParent;
        }
        results.push({
          title: bm.title,
          id: bm.id,
          offsetTop: offsetTop,
          docHeight: docHeight,
        });
      } else {
        console.warn(`Element with id "${bm.id}" not found for bookmark "${bm.title}"`);
        results.push({
          title: bm.title,
          id: bm.id,
          offsetTop: -1,
          docHeight: docHeight,
        });
      }
    }

    return results;
  }, allBookmarks);

  console.log('\n📍 Bookmark positions measured:');
  bookmarkData.forEach(bm => {
    console.log(`   ${bm.title} → offsetTop: ${Math.round(bm.offsetTop)}px`);
  });

  // ---- 步骤3：生成PDF ----
  await page.pdf({
    path: PDF_FILE,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true
  });

  await browser.close();

  const sizeMB = (fs.statSync(PDF_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ PDF generated: ${PDF_FILE}`);
  console.log(`   Size: ${sizeMB} MB`);

  // ---- 步骤4：读取PDF并计算精确页码 ----
  const pdfBytes = fs.readFileSync(PDF_FILE);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  console.log(`   Total pages: ${totalPages}`);

  // 计算每页高度 = 文档总高度 / PDF总页数
  // 这是关键：不能用硬编码的A4高度，因为实际渲染高度取决于CSS和内容
  const docHeight = bookmarkData[0]?.docHeight || 1;
  const pageHeight = docHeight / totalPages;

  console.log(`\n📐 Page height calculation:`);
  console.log(`   Document height: ${Math.round(docHeight)}px`);
  console.log(`   PDF pages: ${totalPages}`);
  console.log(`   Page height: ${Math.round(pageHeight)}px`);

  // 计算每个书签对应的页码
  const calculatedBookmarks = bookmarkData.map(bm => ({
    title: bm.title,
    page: bm.offsetTop >= 0 ? Math.floor(bm.offsetTop / pageHeight) : 0
  }));

  console.log('\n📖 Bookmark page mapping:');
  calculatedBookmarks.forEach(bm => {
    console.log(`   ${bm.title} → page ${bm.page}`);
  });

  // ---- 步骤5：将书签写入PDF ----
  const outlineRoot = pdfDoc.context.obj({
    Type: 'Outlines',
    Count: calculatedBookmarks.length,
  });
  const outlineRootRef = pdfDoc.context.register(outlineRoot);

  const bmRefs = [];
  for (const bm of calculatedBookmarks) {
    const pageIndex = Math.min(bm.page, pages.length - 1);
    const pageRef = pages[pageIndex].ref;
    const destArray = pdfDoc.context.obj([pageRef, PDFName.of('Fit')]);
    const destRef = pdfDoc.context.register(destArray);

    // 关键：使用 PDFHexString.of() 写入 UTF-16BE 十六进制字符串
    // 不能用 PDFString.of()，因为它会对中文进行错误的编码或转义
    const titleBytes = createUtf16BeBuffer(bm.title);
    const hexStr = titleBytes.toString('hex').toUpperCase();
    const titleHexStr = PDFHexString.of(hexStr);

    const bmDict = pdfDoc.context.obj({
      Title: titleHexStr,
      Parent: outlineRootRef,
      Dest: destRef,
    });
    const bmRef = pdfDoc.context.register(bmDict);
    bmRefs.push(bmRef);
  }

  // 链接书签（Next/Prev）
  for (let i = 0; i < bmRefs.length; i++) {
    const bmDict = pdfDoc.context.lookup(bmRefs[i]);
    if (i > 0) bmDict.set(PDFName.of('Prev'), bmRefs[i - 1]);
    if (i < bmRefs.length - 1) bmDict.set(PDFName.of('Next'), bmRefs[i + 1]);
  }

  if (bmRefs.length > 0) {
    outlineRoot.set(PDFName.of('First'), bmRefs[0]);
    outlineRoot.set(PDFName.of('Last'), bmRefs[bmRefs.length - 1]);
  }

  pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);

  // ---- 步骤6：保存最终PDF ----
  const modifiedBytes = await pdfDoc.save();
  fs.writeFileSync(PDF_FILE, modifiedBytes);

  const finalSizeMB = (Buffer.byteLength(modifiedBytes) / 1024 / 1024).toFixed(2);
  console.log(`\n✅ PDF with bookmarks saved!`);
  console.log(`   File: ${PDF_FILE}`);
  console.log(`   Size: ${finalSizeMB} MB`);
  console.log(`   Pages: ${totalPages}`);
  console.log(`   Bookmarks: ${bmRefs.length}`);
})();
