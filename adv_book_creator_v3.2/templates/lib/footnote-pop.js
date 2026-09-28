/* 脚注弹层（信源标注）：点击正文脚注标记，在标记旁浮出内容——替代"跳转章末"。
 *
 * 单一来源：build.js（单文件 HTML）与 build-reader.js（阅读器内容页）在构建期内联本文件；
 * 样式在 styles.css 的「脚注」段（两处构建都会带上 theme.css / 内联样式）。
 * EPUB 不走本文件——多看阅读器有自己的脚注弹窗规范（见 epub-styles.css）。
 *
 * 维护红线：改这里即同时影响单文件 HTML 与阅读器内容页，勿在任一构建脚本里再抄一份。
 * 依赖：脚注结构由 convert-md.js 生成（标记 a.duokan-footnote[href="#fn-N"]，章末 li#fn-N）。
 */
(function () {
  if (typeof document === 'undefined') return;

  var pop = null;
  var activeRef = null;
  var openedAt = 0;   // 打开时刻：用于忽略"打开瞬间由聚焦/定位触发的 scroll"，否则弹层一开就被关掉

  function ensurePop() {
    if (pop && document.body.contains(pop)) return pop;
    pop = document.createElement('div');
    pop.className = 'fn-pop';
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
    return pop;
  }

  function refNumberOf(a) {
    var href = a.getAttribute('href') || '';
    var m = href.match(/^#fn-(\d+)$/);
    return m ? m[1] : null;
  }

  function close() {
    if (pop) {
      pop.classList.remove('is-visible', 'is-above');
      pop.innerHTML = '';
    }
    if (activeRef) {
      activeRef.classList.remove('is-open');
      activeRef = null;
    }
  }

  function open(a) {
    var num = refNumberOf(a);
    if (!num) return;
    var item = document.getElementById('fn-' + num);
    if (!item) return;

    var el = ensurePop();

    // 取章末脚注内容，去掉"返回正文"的箭头
    var clone = item.cloneNode(true);
    var back = clone.querySelector('.fn-back');
    if (back && back.parentNode) back.parentNode.removeChild(back);

    el.innerHTML = '<span class="fn-pop-num">[' + num + ']</span>' +
      clone.innerHTML +
      '<span class="fn-pop-close" role="button" aria-label="关闭">×</span>';

    // 先量尺寸再定位（避免闪烁）
    el.style.visibility = 'hidden';
    el.classList.remove('is-above');
    el.classList.add('is-visible');

    var r = a.getBoundingClientRect();
    var pw = el.offsetWidth;
    var ph = el.offsetHeight;
    var gap = 8;
    var left = Math.min(Math.max(gap, r.left), Math.max(gap, window.innerWidth - pw - gap));
    var top = r.bottom + gap;
    var above = false;
    if (top + ph > window.innerHeight - gap) {
      var topAbove = r.top - ph - gap;
      if (topAbove >= gap) { top = topAbove; above = true; }
    }
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    // 小三角始终对准被点的标记中心（箭头宽 16px，半宽 8）
    var arrowX = r.left - left + r.width / 2 - 8;
    el.style.setProperty('--fn-arrow-x', Math.max(12, Math.min(arrowX, pw - 28)) + 'px');
    el.classList.toggle('is-above', above);
    el.style.visibility = '';

    if (activeRef) activeRef.classList.remove('is-open');
    activeRef = a;
    a.classList.add('is-open');
    openedAt = Date.now();
  }

  // 捕获阶段拦截，确保 hash 跳转被阻止（单文件 HTML 里最有效）
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a.duokan-footnote') : null;
    if (a) {
      e.preventDefault();
      if (activeRef === a) { close(); return; }  // 再点同一标记 → 收起
      open(a);
      return;
    }
    if (pop && pop.contains(t)) {
      if (t.closest && t.closest('.fn-pop-close')) close();
      return;
    }
    close();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  // 打开后 250ms 内忽略 scroll：聚焦脚注标记本身会触发一次定位滚动
  window.addEventListener('scroll', function () {
    if (Date.now() - openedAt > 250) close();
  }, { passive: true });
  window.addEventListener('resize', close);
})();
