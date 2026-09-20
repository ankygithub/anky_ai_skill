/**
 * Book-PDF 生成脚本（v5 - 自模拟分页精确书签）
 *
 * 核心改进：
 * - 不再依赖浏览器的 page-break 渲染来测量页码
 * - 浏览器 screen 模式下 page-break-before: always 只留白一小段，不是真分页
 * - PDF 渲染时 page-break-before: always 是真的强制新开一页
 * - 所以：自己在浏览器中测量各区域内容高度，然后模拟 PDF 分页逻辑
 *
 * 分页规则：
 * - 封面：固定1页
 * - 目录：根据实际内容高度计算页数
 * - 每个h2章节：page-break-before: always → 强制从新页顶部开始
 * - h3子章节：在章节内按内容流计算
 * - 尾页：固定1页
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

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1122;
const A4_MARGIN_PX = 54;
const CONTENT_HEIGHT = A4_HEIGHT_PX - A4_MARGIN_PX * 2; // 1014px

const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null, isCustom: true, position: 'first' },
  { title: '目录', id: null, isCustom: true, position: 'toc' },
];
const BACKPAGE_BOOKMARK = { title: '尾页', id: null, isCustom: true, position: 'last' };

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

function extractBookmarksFromHtml(htmlContent) {
  const bookmarks = [];
  const h2Regex = /<h2[^>]*class="[^"]*section-title[^"]*"[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/gi;
  const matches = [...htmlContent.matchAll(h2Regex)];
  for (const match of matches) {
    const id = match[1];
    const innerHtml = match[2];
    const title = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (title && id) bookmarks.push({ title, id, level: 2 });
  }
  return bookmarks;
}

function extractH3FromHtml(htmlContent) {
  const bookmarks = [];
  const h3Regex = /<h3[^>]*id="([^"]+)"[^>]*>(.*?)<\/h3>/gi;
  const matches = [...htmlContent.matchAll(h3Regex)];
  for (const match of matches) {
    const id = match[1];
    const innerHtml = match[2];
    const title = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (title && id) bookmarks.push({ title, id, level: 3 });
  }
  return bookmarks;
}

(async () => {
  console.log('🚀 Starting PDF generation (v5 - simulated pagination)...');

  // ---- 步骤1：读取书签数据 ----
  let extractedBookmarks = [];
  const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
  // 内容指纹：HTML 变更后旧缓存自动失效，防止按过期页码贴书签
  const currentHtmlHash = require('crypto').createHash('sha1').update(htmlContent).digest('hex');

  if (fs.existsSync(BOOKMARKS_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf-8'));
      const cachedBookmarks = Array.isArray(cached) ? null : cached.bookmarks;
      const cachedHash = Array.isArray(cached) ? null : cached.htmlHash;
      if (cachedBookmarks && cachedHash === currentHtmlHash) {
        extractedBookmarks = cachedBookmarks;
        console.log(`📑 从 bookmarks.json 读取 ${extractedBookmarks.length} 个书签（指纹一致）`);
      } else {
        console.warn('⚠️ bookmarks.json 与当前 HTML 指纹不一致（或为旧格式），回退到HTML重新提取');
      }
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

  // ---- 步骤2：浏览器测量各区域内容高度 ----
  console.log('\n📍 测量各区域内容高度（screen模式，无page-break干扰）...');

  const measureBrowser = await chromium.launch();
  const measurePage = await measureBrowser.newPage();

  await measurePage.setViewportSize({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
  await measurePage.setContent(htmlContent, {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await measurePage.waitForTimeout(3000);

  // 在浏览器中测量各区域高度和h3位置
  // 关键：screen模式下 page-break-before: always 被浏览器忽略
  // 所以测量的高度是纯内容高度，没有page-break留白干扰
  const measureData = await measurePage.evaluate(() => {
    const contentHeight = 1014; // 1122 - 54*2

    // 获取关键元素
    const coverEl = document.querySelector('.cover');
    const tocEl = document.querySelector('.toc');
    const backpageEl = document.querySelector('.backpage');
    const allH2Elements = Array.from(document.querySelectorAll('h2.section-title'));
    const allH3Elements = Array.from(document.querySelectorAll('h3[id]'));

    // 测量封面高度
    let coverHeight = 0;
    if (coverEl) {
      coverHeight = coverEl.getBoundingClientRect().height;
    }

    // 测量目录高度（从目录元素顶部到目录元素底部）
    let tocHeight = 0;
    let tocStartY = 0;
    if (tocEl) {
      const tocRect = tocEl.getBoundingClientRect();
      const tocStyle = window.getComputedStyle(tocEl);
      const tocMarginTop = parseFloat(tocStyle.marginTop) || 0;
      const tocMarginBottom = parseFloat(tocStyle.marginBottom) || 0;
      tocHeight = tocRect.height + tocMarginTop + tocMarginBottom;
      tocStartY = tocRect.top + window.scrollY - tocMarginTop;
    }

    // 测量每个h2章节的内容高度
    // 章节高度 = 从这个h2到下一个h2（或backpage）的距离
    const chapterHeights = [];
    for (let i = 0; i < allH2Elements.length; i++) {
      const h2 = allH2Elements[i];
      const nextEl = allH2Elements[i + 1] || backpageEl;
      const h2Rect = h2.getBoundingClientRect();
      const h2Top = h2Rect.top + window.scrollY;
      let chapterEnd;
      if (nextEl) {
        const nextRect = nextEl.getBoundingClientRect();
        chapterEnd = nextRect.top + window.scrollY;
      } else {
        chapterEnd = document.body.scrollHeight;
      }
      chapterHeights.push({
        id: h2.id,
        title: h2.textContent.replace(/<[^>]+>/g, '').trim(),
        height: chapterEnd - h2Top,
      });
    }

    // 测量每个h3相对于其父h2的偏移
    const h3Offsets = [];
    for (const h3 of allH3Elements) {
      const h3Top = h3.getBoundingClientRect().top + window.scrollY;
      // 找到前一个h2
      let parentH2 = null;
      for (const h2 of allH2Elements) {
        const h2Top = h2.getBoundingClientRect().top + window.scrollY;
        if (h2Top <= h3Top) {
          parentH2 = h2;
        } else {
          break;
        }
      }
      if (parentH2) {
        const h2Top = parentH2.getBoundingClientRect().top + window.scrollY;
        h3Offsets.push({
          id: h3.id,
          title: h3.textContent.replace(/<[^>]+>/g, '').trim(),
          parentH2Id: parentH2.id,
          offsetFromParent: h3Top - h2Top,
        });
      }
    }

    return {
      coverHeight,
      tocHeight,
      tocStartY,
      chapterHeights,
      h3Offsets,
      bodyScrollHeight: document.body.scrollHeight,
    };
  });

  await measureBrowser.close();

  // ---- 步骤2.5：自己模拟PDF分页 ----
  console.log('\n📐 模拟PDF分页...');

  // PDF分页规则：
  // 1. 封面：固定1页（@page cover { margin: 0 }）
  // 2. 目录：根据内容高度计算页数，从第2页开始
  // 3. 每个h2章节：page-break-before: always → 强制从新页顶部开始
  //    章节内容按 contentHeight 分页
  // 4. 尾页：固定1页
  //
  // 注意：screen模式测量的高度不含page-break留白，但PDF中page-break会浪费页面空间
  // 所以模拟页数可能和实际PDF页数有偏差，后面会用实际PDF页数校准

  let currentPage = 0;

  // 封面：固定1页
  const coverPage = 0;
  currentPage = 1;
  console.log(`   封面: 第1页 (固定)`);

  // 目录：根据内容高度计算
  const tocPages = Math.max(1, Math.ceil(measureData.tocHeight / CONTENT_HEIGHT));
  const tocPage = currentPage;
  currentPage += tocPages;
  console.log(`   目录: 第${tocPage + 1}页 起, 占${tocPages}页 (高度=${measureData.tocHeight.toFixed(0)}px)`);

  // 每个h2章节：强制从新页开始
  const chapterPageMap = {};
  const chapterSimPages = {};
  for (const ch of measureData.chapterHeights) {
    chapterPageMap[ch.id] = currentPage;
    const chapterPages = Math.max(1, Math.ceil(ch.height / CONTENT_HEIGHT));
    chapterSimPages[ch.id] = chapterPages;
    console.log(`   ${ch.title}: 第${currentPage + 1}页 起, 占${chapterPages}页 (高度=${ch.height.toFixed(0)}px)`);
    currentPage += chapterPages;
  }

  // h3子章节：在父h2章节内按偏移计算
  const h3PageMap = {};
  const h3OffsetRatio = {};
  for (const h3 of measureData.h3Offsets) {
    const parentStartPage = chapterPageMap[h3.parentH2Id];
    const parentSimPages = chapterSimPages[h3.parentH2Id];
    if (parentStartPage !== undefined && parentSimPages !== undefined) {
      const parentHeight = measureData.chapterHeights.find(ch => ch.id === h3.parentH2Id)?.height || 1;
      // h3在章节内的相对位置比例（0~1）
      const ratio = h3.offsetFromParent / parentHeight;
      h3OffsetRatio[h3.id] = ratio;
      // 用比例估算h3在章节的第几页
      const pagesIntoChapter = Math.floor(h3.offsetFromParent / CONTENT_HEIGHT);
      h3PageMap[h3.id] = parentStartPage + pagesIntoChapter;
    }
  }

  // 尾页
  const backpagePage = currentPage;
  const simTotalPages = currentPage + 1;
  console.log(`   尾页: 第${backpagePage + 1}页`);
  console.log(`   模拟总页数: ${simTotalPages}`);

  // ---- 步骤3：生成PDF ----
  console.log('\n🖨️ 生成PDF...');

  const pdfBrowser = await chromium.launch();
  const pdfPage = await pdfBrowser.newPage();

  await pdfPage.setContent(htmlContent, {
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

  // ---- 步骤4：用PDF实际页数校准书签 ----
  const pdfBytes = fs.readFileSync(PDF_FILE);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  console.log(`   PDF实际总页数: ${totalPages}`);
  console.log(`   模拟总页数: ${simTotalPages}`);

  // 校准策略：
  // 封面固定第1页，尾页固定最后一页
  // 目录和正文按比例缩放：actualPage = 1 + round((simPage - 1) * (totalPages - 2) / (simTotalPages - 2))
  // 这样确保第一个正文页和最后一个正文页之间的映射是线性的
  const fixedPages = 2; // 封面+尾页固定
  const simContentPages = simTotalPages - fixedPages; // 模拟的内容页数（不含封面尾页）
  const actualContentPages = totalPages - fixedPages; // 实际的内容页数（不含封面尾页）

  function calibratePage(simPage) {
    if (simPage === 0) return 0; // 封面
    if (simPage >= simTotalPages - 1) return totalPages - 1; // 尾页
    // 内容页按比例映射
    const simContentOffset = simPage - 1; // 去掉封面页的偏移
    const actualContentOffset = Math.round(simContentOffset * actualContentPages / simContentPages);
    return 1 + actualContentOffset;
  }

  // 校准所有书签页码
  const calibratedChapterPageMap = {};
  for (const [id, simPage] of Object.entries(chapterPageMap)) {
    calibratedChapterPageMap[id] = calibratePage(simPage);
  }

  const calibratedH3PageMap = {};
  for (const [id, simPage] of Object.entries(h3PageMap)) {
    calibratedH3PageMap[id] = calibratePage(simPage);
  }

  // 组装书签列表
  const finalBookmarks = [];

  // 封面
  finalBookmarks.push({ title: '封面', page: 0, level: 2 });

  // 目录
  finalBookmarks.push({ title: '目录', page: calibratePage(tocPage), level: 2 });

  // 正文章节（h2 + h3 按文档顺序排列）
  for (const bm of extractedBookmarks) {
    if (bm.level === 2 && calibratedChapterPageMap[bm.id] !== undefined) {
      finalBookmarks.push({
        title: bm.title,
        page: calibratedChapterPageMap[bm.id],
        level: 2,
      });
    } else if (bm.level === 3 && calibratedH3PageMap[bm.id] !== undefined) {
      finalBookmarks.push({
        title: bm.title,
        page: calibratedH3PageMap[bm.id],
        level: 3,
      });
    }
  }

  // 尾页
  finalBookmarks.push({ title: '尾页', page: totalPages - 1, level: 2 });

  console.log('\n📖 书签页码映射（校准后）：');
  finalBookmarks.forEach(bm => {
    const levelStr = bm.level === 3 ? '  └ ' : '';
    console.log(`   ${levelStr}${bm.title} → 第 ${bm.page + 1} 页`);
  });

  // ---- 步骤5：将书签写入PDF ----
  const topLevelCount = finalBookmarks.filter(bm => bm.level !== 3).length;
  const outlineRoot = pdfDoc.context.obj({
    Type: 'Outlines',
    Count: pdfDoc.context.obj(topLevelCount),
  });
  const outlineRootRef = pdfDoc.context.register(outlineRoot);

  function createBookmarkNode(bm, parentRef) {
    const pageIndex = Math.min(Math.max(bm.page, 0), pages.length - 1);
    const pageRef = pages[pageIndex].ref;

    // h2 一级章节：定位到页面顶部（FitH top=0）
    // h3 子章节和其他：定位到页面顶部
    // FitH 表示水平适配，top参数指定垂直位置（0=页面顶部）
    let destArray;
    if (bm.level === 2) {
      // 一级目录定位到页面顶部
      destArray = pdfDoc.context.obj([pageRef, PDFName.of('FitH'), pdfDoc.context.obj(0)]);
    } else {
      destArray = pdfDoc.context.obj([pageRef, PDFName.of('FitH'), pdfDoc.context.obj(0)]);
    }
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
