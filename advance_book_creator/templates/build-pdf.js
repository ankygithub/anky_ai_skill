/**
 * Book-PDF 生成脚本（v4 - 两遍渲染精确书签）
 *
 * 改进：
 * - 第一遍：Playwright渲染HTML，精确测量每个标题的实际渲染页码
 * - 第二遍：重新渲染并生成PDF
 * - 用第一遍测得的精确页码创建书签
 * - 支持h2+h3嵌套层级书签
 *
 * 前置：先运行 node build.js 生成 HTML
 * 依赖：npm install playwright pdf-lib && npx playwright install chromium
 * 用法：node build-pdf.js
 */

const { chromium } = require('playwright');
const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
const HTML_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.html`);
const PDF_FILE = path.join(__dirname, 'output', `${versionData.title}-v${versionData.version}.pdf`);
const BOOKMARKS_FILE = path.join(__dirname, 'output', 'bookmarks.json');

// A4 尺寸 @ 96dpi
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1122;
const A4_MARGIN_PX = 54; // 约18mm @96dpi，顶部底部边距

// ==================== 自定义书签 ====================
const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null, isCustom: true, position: 'first' },
  { title: '目录', id: null, isCustom: true, position: 'toc' },
];
const BACKPAGE_BOOKMARK = { title: '尾页', id: null, isCustom: true, position: 'last' };

// ==================== UTF-16BE 编码 ====================
function createUtf16BeBuffer(text) {
  const bom = Buffer.from([0xFE, 0xFF]);
  const utf16le = Buffer.from(text, 'utf16le');
  for (let i = 0; i < utf16le.length; i += 2) {
    const tmp = utf16le[i];
    utf16le[i] = utf16le[i + 1];
    utf16le[i + 1] = tmp;
  }
  return Buffer.concat([bom, utf16le]);
}

/**
 * 从HTML提取书签结构
 */
function extractBookmarksFromHtml(htmlContent) {
  const bookmarks = [];
  const h2Regex = /<h2[^>]*class="[^"]*section-title[^"]*"[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/gi;
  const matches = [...htmlContent.matchAll(h2Regex)];

  for (const match of matches) {
    const id = match[1];
    const innerHtml = match[2];
    const title = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (title && id) {
      bookmarks.push({ title, id, level: 2 });
    }
  }
  return bookmarks;
}

/**
 * 从HTML提取h3书签
 */
function extractH3FromHtml(htmlContent) {
  const bookmarks = [];
  const h3Regex = /<h3[^>]*id="([^"]+)"[^>]*>(.*?)<\/h3>/gi;
  const matches = [...htmlContent.matchAll(h3Regex)];

  for (const match of matches) {
    const id = match[1];
    const innerHtml = match[2];
    const title = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (title && id) {
      bookmarks.push({ title, id, level: 3 });
    }
  }
  return bookmarks;
}

// ==================== 主流程 ====================

(async () => {
  console.log('🚀 Starting PDF generation with two-pass bookmark measurement...');

  // ---- 步骤1：读取书签数据 ----
  let extractedBookmarks = [];

  const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');

  if (fs.existsSync(BOOKMARKS_FILE)) {
    try {
      extractedBookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf-8'));
      console.log(`📑 从 bookmarks.json 读取 ${extractedBookmarks.length} 个书签`);
    } catch (e) {
      console.warn('⚠️ bookmarks.json 读取失败，回退到HTML提取');
    }
  }

  if (extractedBookmarks.length === 0) {
    const h2Bookmarks = extractBookmarksFromHtml(htmlContent);
    const h3Bookmarks = extractH3FromHtml(htmlContent);
    extractedBookmarks = [...h2Bookmarks, ...h3Bookmarks];
  }

  if (extractedBookmarks.length === 0) {
    console.error('❌ 未提取到任何书签！');
    process.exit(1);
  }

  console.log(`\n📑 提取到的 ${extractedBookmarks.length} 个书签：`);
  extractedBookmarks.forEach(bm => {
    const levelStr = bm.level === 3 ? ' [h3]' : ' [h2]';
    console.log(`   - ${bm.title}${levelStr} (id=${bm.id})`);
  });

  // ---- 步骤2：第一遍渲染 —— 精确测量每个书签的页码 ----
  console.log('\n📍 第一遍：测量书签位置...');

  const measureBrowser = await chromium.launch();
  const measurePage = await measureBrowser.newPage();

  await measurePage.setViewportSize({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
  await measurePage.goto(`file://${HTML_FILE}`, {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await measurePage.waitForTimeout(3000);

  // 在浏览器中精确测量每个书签的页码
  const measuredBookmarks = await measurePage.evaluate((bookmarks) => {
    const results = [];
    // A4页面有效内容高度 = 总高度 - 上下边距
    const pageContentHeight = 1122 - 54 * 2; // 约1014px

    for (const bm of bookmarks) {
      if (!bm.id) {
        results.push({
          title: bm.title,
          id: null,
          page: -1, // 稍后特殊处理
          level: bm.level || 2,
          isCustom: bm.isCustom || false,
          position: bm.position || null,
        });
        continue;
      }

      const el = document.getElementById(bm.id);
      if (el) {
        // scrollIntoView 让浏览器计算所有CSS分页效果
        el.scrollIntoView({ block: 'start', behavior: 'instant' });

        // 获取元素相对于文档顶部的绝对位置
        const rect = el.getBoundingClientRect();
        const absoluteY = window.scrollY + rect.top;

        // 页码从1开始
        const page = Math.floor(absoluteY / 1122);

        results.push({
          title: bm.title,
          id: bm.id,
          absoluteY: absoluteY,
          page: page,
          level: bm.level || 2,
        });
      } else {
        console.warn(`Element "${bm.id}" not found for "${bm.title}"`);
        results.push({
          title: bm.title,
          id: bm.id,
          page: -1,
          level: bm.level || 2,
        });
      }
    }
    return results;
  }, extractedBookmarks);

  await measureBrowser.close();

  // ---- 步骤3：第二遍渲染 —— 生成PDF ----
  console.log('\n🖨️ 第二遍：生成PDF...');

  const pdfBrowser = await chromium.launch();
  const pdfPage = await pdfBrowser.newPage();

  await pdfPage.goto(`file://${HTML_FILE}`, {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await pdfPage.waitForTimeout(2000);

  await pdfPage.pdf({
    path: PDF_FILE,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true
  });

  await pdfBrowser.close();

  const sizeMB = (fs.statSync(PDF_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`✅ PDF generated: ${PDF_FILE} (${sizeMB} MB)`);

  // ---- 步骤4：处理测量结果，计算封面/目录/尾页页码 ----
  const pdfBytes = fs.readFileSync(PDF_FILE);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  console.log(`   Total pages: ${totalPages}`);

  // 计算封面和目录的实际页码
  let coverPage = 0;
  let tocPage = 0;

  // 从HTML中查找目录元素的位置
  const tocBookmark = measuredBookmarks.find(b => b.title === '目录' && b.isCustom);
  if (tocBookmark) {
    const tocResult = measuredBookmarks.find(b =>
      b.title === '目录' && b.position === 'toc'
    );
  }

  // 合并自定义书签和测量的书签
  const finalBookmarks = [];

  // 封面 (page 0)
  finalBookmarks.push({ title: '封面', page: 0, level: 2 });

  // 从测量结果中找目录页：目录在第一个h2之前
  // 取第一个有有效页码的h2作为参考
  const firstH2 = measuredBookmarks.find(b => b.page >= 0 && b.level === 2);
  const tocPageNum = firstH2 ? Math.max(0, firstH2.page - 1) : 0;
  finalBookmarks.push({ title: '目录', page: tocPageNum, level: 2 });

  // 正文书签
  for (const bm of measuredBookmarks) {
    if (bm.isCustom) continue;
    if (bm.page >= 0) {
      finalBookmarks.push({
        title: bm.title,
        page: bm.page,
        level: bm.level || 2,
      });
    }
  }

  // 尾页
  finalBookmarks.push({ title: '尾页', page: totalPages - 1, level: 2 });

  console.log('\n📖 精确书签页码映射：');
  finalBookmarks.forEach(bm => {
    console.log(`   ${bm.title} → 第 ${bm.page + 1} 页`);
  });

  // ---- 步骤5：将书签写入PDF（支持嵌套层级） ----
  const topLevelCount = finalBookmarks.filter(bm => bm.level !== 3).length;
  const outlineRoot = pdfDoc.context.obj({
    Type: 'Outlines',
    Count: pdfNumber(topLevelCount),
  });
  const outlineRootRef = pdfDoc.context.register(outlineRoot);

  function createBookmarkNode(bm, parentRef) {
    const pageIndex = Math.min(Math.max(bm.page, 0), pages.length - 1);
    const pageRef = pages[pageIndex].ref;
    const destArray = pdfDoc.context.obj([pageRef, PDFName.of('Fit')]);
    const destRef = pdfDoc.context.register(destArray);

    const titleBytes = createUtf16BeBuffer(bm.title);
    const hexStr = titleBytes.toString('hex').toUpperCase();
    const titleHexStr = PDFHexString.of(hexStr);

    const bmDict = pdfDoc.context.obj({
      Title: titleHexStr,
      Parent: parentRef,
      Dest: destRef,
    });
    return pdfDoc.context.register(bmDict);
  }

  function pdfNumber(n) {
    return pdfDoc.context.obj(n);
  }

  // 构建嵌套书签结构
  const topLevelRefs = [];
  let currentParentRef = null;
  let currentChildren = [];

  for (let i = 0; i < finalBookmarks.length; i++) {
    const bm = finalBookmarks[i];

    if (bm.level === 3) {
      if (currentParentRef) {
        const childRef = createBookmarkNode(bm, currentParentRef);
        currentChildren.push(childRef);
      } else {
        const ref = createBookmarkNode(bm, outlineRootRef);
        topLevelRefs.push(ref);
      }
    } else {
      // 关闭前一个父书签的子书签链
      if (currentParentRef && currentChildren.length > 0) {
        for (let j = 0; j < currentChildren.length; j++) {
          const childDict = pdfDoc.context.lookup(currentChildren[j]);
          if (j > 0) childDict.set(PDFName.of('Prev'), currentChildren[j - 1]);
          if (j < currentChildren.length - 1) childDict.set(PDFName.of('Next'), currentChildren[j + 1]);
        }
        const parentDict = pdfDoc.context.lookup(currentParentRef);
        parentDict.set(PDFName.of('First'), currentChildren[0]);
        parentDict.set(PDFName.of('Last'), currentChildren[currentChildren.length - 1]);
        parentDict.set(PDFName.of('Count'), pdfNumber(currentChildren.length));
      }

      currentParentRef = createBookmarkNode(bm, outlineRootRef);
      currentChildren = [];
      topLevelRefs.push(currentParentRef);
    }
  }

  // 处理最后一个父书签
  if (currentParentRef && currentChildren.length > 0) {
    for (let j = 0; j < currentChildren.length; j++) {
      const childDict = pdfDoc.context.lookup(currentChildren[j]);
      if (j > 0) childDict.set(PDFName.of('Prev'), currentChildren[j - 1]);
      if (j < currentChildren.length - 1) childDict.set(PDFName.of('Next'), currentChildren[j + 1]);
    }
    const parentDict = pdfDoc.context.lookup(currentParentRef);
    parentDict.set(PDFName.of('First'), currentChildren[0]);
    parentDict.set(PDFName.of('Last'), currentChildren[currentChildren.length - 1]);
    parentDict.set(PDFName.of('Count'), pdfNumber(currentChildren.length));
  }

  // 链接顶级书签
  for (let i = 0; i < topLevelRefs.length; i++) {
    const bmDict = pdfDoc.context.lookup(topLevelRefs[i]);
    if (i > 0) bmDict.set(PDFName.of('Prev'), topLevelRefs[i - 1]);
    if (i < topLevelRefs.length - 1) bmDict.set(PDFName.of('Next'), topLevelRefs[i + 1]);
  }

  if (topLevelRefs.length > 0) {
    outlineRoot.set(PDFName.of('First'), topLevelRefs[0]);
    outlineRoot.set(PDFName.of('Last'), topLevelRefs[topLevelRefs.length - 1]);
  }

  pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);

  // ---- 步骤6：保存最终PDF ----
  const modifiedBytes = await pdfDoc.save();
  fs.writeFileSync(PDF_FILE, modifiedBytes);

  const finalSizeMB = (Buffer.byteLength(modifiedBytes) / 1024 / 1024).toFixed(2);
  console.log(`\n✅ PDF with precise bookmarks saved!`);
  console.log(`   File: ${PDF_FILE}`);
  console.log(`   Size: ${finalSizeMB} MB`);
  console.log(`   Pages: ${totalPages}`);
  console.log(`   Bookmarks: ${finalBookmarks.length}`);
})();
