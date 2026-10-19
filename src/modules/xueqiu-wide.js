  /* ==========================================================
   * 五、模块：雪球优化（配置命名空间 modules.xueqiuWide）
   * 隐藏右侧栏并拉宽正文 + 防页面自动跳顶（内嵌能力，无独立开关）
   * ----------------------------------------------------------
   * 基于雪球线上 DOM 实测（Firecrawl 渲染抓取）实现两层策略：
   * 1) 精确选择器：首页/时间线页两栏为 AnonymousHome_container_2te 容器，
   *    左主栏 home__col--lf_XXX + 右侧栏 home__col--rt_XXX（hash 后缀随构建
   *    变化，故用 [class*=] 包含匹配）；隐藏右栏并把主栏拉宽。
   * 2) 通用兜底：其余页面（个股页 .stock__main/.stock__side 等 float/block
   *    布局、未来改版页面）运行时按几何特征识别「主栏 + 右侧窄列」——
   *    侧栏 = 位于主栏右侧、宽 200~520px 且不足容器 40% 的兄弟列，
   *    不限定布局类型（flex/grid/float/block 通吃）。
   * 定时器 + MutationObserver 双驱动：雪球是 SPA，路由切换/动态渲染后
   * 自动重新识别；模块关闭或黑名单生效时清除全部标记还原原状。
   * ========================================================== */
  var xqWideCssDone = false;
  var xqWideTimer = null;
  var xqWideObserver = null;
  var xqWideScheduled = false;
  var xqScanAt = 0;          // 上次全量扫描时间
  var xqScanHit = false;     // 上次扫描是否命中（未命中则降频，避免信息流页面持续整页读布局）

  function isXueqiuHost() {
    var h = location.hostname || "";
    return h === "xueqiu.com" ||
      (h.length > 11 && h.slice(h.length - 11) === ".xueqiu.com");
  }

  function ensureXqWideCss() {
    if (xqWideCssDone || !document.head) return;
    xqWideCssDone = true;
    var style = document.createElement("style");
    style.id = "wb-xq-wide-style";
    style.textContent = [
      /* 首页/时间线页：右栏隐藏，主栏拉宽（匿名版带构建 hash，登录版无 hash，包含匹配通吃） */
      '[class*="home__col--rt"]{display:none!important;}',
      '[class*="home__col--lf"]{width:auto!important;max-width:none!important;' +
      'flex:1 1 auto!important;float:none!important;}',
      /* 登录版首页：中间内容栏宽度可调（动态样式见 wb-xq-wide-dyn），默认拉满 */
      '[class*="user__col--middle"] > div{max-width:none!important;}',
      '.seekball-container{display:none!important;}',
      /* 兜底标记：flex:1 拉宽 flex 主栏；grid-column 让 grid 主栏跨全行；
         float:none + width:auto 兼容 float/block 布局；互不冲突 */
      "[data-wb-xq-side]{display:none!important;}",
      "[data-wb-xq-main]{flex:1 1 auto!important;grid-column:1/-1!important;" +
      "width:auto!important;max-width:none!important;float:none!important;}",
      /* 原主栏是浮动列时，float:none 会丢失 BFC，内部 clearfix 的 clear:both
         会连外层更高的浮动（如个股页左侧 1380px 导航）一起清除，
         把行情区/图表整块推到导航下方（正文上方出现大片空白）→ 用 flow-root 重建 BFC 隔离 */
      '[data-wb-xq-main="block"]{display:flow-root!important;}'
    ].join("\n");
    document.head.appendChild(style);
  }

  // 清除全部标记（模块关闭/黑名单生效时还原原状）
  function xqMarkCleanup() {
    var marked = document.querySelectorAll(
      "[data-wb-xq-side],[data-wb-xq-main],[data-wb-xq-done]");
    for (var i = 0; i < marked.length; i++) {
      var n = marked[i];
      n.removeAttribute("data-wb-xq-side");
      n.removeAttribute("data-wb-xq-main");
      n.removeAttribute("data-wb-xq-done");
    }
  }

  // 清除单个容器上的全部标记（复检不通过时调用，下一轮扫描按新布局重新判定）
  function xqClearContainerMarks(c, side, main) {
    c.removeAttribute("data-wb-xq-done");
    if (side) side.removeAttribute("data-wb-xq-side");
    if (main) main.removeAttribute("data-wb-xq-main");
  }

  // 复检已标记容器：SPA 路由切换会复用 DOM 节点、页面加载中间态可能与最终布局不同，
  // 原「侧栏」可能已变成正文却仍被 display:none（整块正文消失）。
  // 每轮按打标时的同一套几何特征复检，不通过即清除标记，实现自愈。
  function xqRevalidateMarks() {
    var containers = document.querySelectorAll("[data-wb-xq-done]");
    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      var side = null, main = null;
      for (var j = 0; j < c.children.length; j++) {
        var k = c.children[j];
        if (k.getAttribute("data-wb-xq-side") === "1") side = k;
        else if (k.hasAttribute("data-wb-xq-main")) main = k;
      }
      if (!side || !main) { xqClearContainerMarks(c, side, main); continue; }
      var cr = c.getBoundingClientRect();
      var mr = main.getBoundingClientRect();
      // side 被自身规则 [data-wb-xq-side]{display:none!important} 隐藏，直接测量恒为 0；
      // 需临时用行内 !important 恢复显示再测量（同步执行，同一任务内不发生绘制，无闪烁）
      var prevDisp = side.style.getPropertyValue("display");
      var prevPrio = side.style.getPropertyPriority("display");
      side.style.setProperty("display", "block", "important");
      var sr = side.getBoundingClientRect();
      if (prevDisp) side.style.setProperty("display", prevDisp, prevPrio);
      else side.style.removeProperty("display");
      var ok = cr.width >= 900 &&
        sr.width >= 200 && sr.width <= 520 && sr.width < cr.width * 0.4 &&
        mr.width >= cr.width * 0.45 && mr.width > sr.width &&
        mr.left < sr.left &&
        !(sr.bottom < mr.top + 50 || sr.top > mr.bottom - 50);
      if (!ok) xqClearContainerMarks(c, side, main);
    }
  }

  // 在容器内识别「主栏 + 右侧栏」组合（纯几何特征，不限布局类型），
  // 返回 {main, side} 或 null
  function xqDetectPair(container, cr) {
    var kids = [];
    for (var i = 0; i < container.children.length; i++) {
      var k = container.children[i];
      if (k.nodeType !== 1) continue;
      var kr = k.getBoundingClientRect();
      if (kr.width >= 100 && kr.height >= 150) kids.push({ el: k, r: kr });
    }
    if (kids.length < 2) return null;
    // 侧栏：宽度 200~520px、不足容器 40%、取最靠右的窄列
    var side = null;
    for (var j = 0; j < kids.length; j++) {
      var w = kids[j].r.width;
      if (w >= 200 && w <= 520 && w < cr.width * 0.4) {
        if (!side || kids[j].r.left > side.r.left) side = kids[j];
      }
    }
    if (!side) return null;
    // 主栏：侧栏左侧最宽、且与侧栏垂直并排的兄弟元素
    var main = null;
    for (var m = 0; m < kids.length; m++) {
      var kid = kids[m];
      if (kid.el === side.el || kid.r.left >= side.r.left) continue;
      if (kid.r.bottom < side.r.top + 50 || kid.r.top > side.r.bottom - 50) continue;
      if (!main || kid.r.width > main.r.width) main = kid;
    }
    if (!main || main.r.width < cr.width * 0.45) return null;
    return { main: main.el, side: side.el };
  }

  var xqDynStyle = null;

  // 中间栏宽度设置：>300 视为固定像素宽，否则清空规则（默认拉满）
  // 内容没变就不重写 textContent：改样式表会触发整页样式重算与重排，
  // 信息流类页面（雪球首页）在滚动/触底加载瞬间被无谓重排，滚动位置容易跟着抖。
  function updateXqDynCss() {
    if (!document.head) return;
    var m = (config && config.modules.xueqiuWide) || {};
    var w = parseFloat(m.middleWidth);
    var css = (w > 300)
      ? '[class*="user__col--middle"]{width:' + w + 'px!important;max-width:none!important;flex:0 0 auto!important;float:none!important;}'
      : '[class*="user__col--middle"]{width:auto!important;max-width:none!important;flex:1 1 auto!important;float:none!important;}';
    if (xqDynStyle && xqDynStyle.__wbCss === css && document.head.contains(xqDynStyle)) return;
    if (!xqDynStyle || !document.head.contains(xqDynStyle)) {
      xqDynStyle = document.createElement("style");
      xqDynStyle.id = "wb-xq-wide-dyn";
      document.head.appendChild(xqDynStyle);
    }
    xqDynStyle.textContent = css;
    xqDynStyle.__wbCss = css;
  }

  function applyXqWide() {
    if (!isXueqiuHost() || !document.body || document.hidden) return;
    if (!isModuleEnabledHere("xueqiuWide")) { xqMarkCleanup(); return; }
    ensureXqWideCss();
    updateXqDynCss();
    // 精确选择器已命中当前页面（首页/时间线）时无需启发式扫描，
    // 一次 querySelector 代替全量 DOM 遍历 + 布局读取（性能关键路径）
    if (document.querySelector('[class*="home__col--rt"],[class*="user__col--middle"]')) return;
    // 用户正在滚动时（尤其是触底加载的瞬间）不做启发式布局改写：
    // 此刻页面的滚动位置与虚拟列表正由站点自己的逻辑管理，我们改兄弟列的
    // display / 宽度会引起重排，容易把滚动位置带偏。停手 0.5s 后再补做。
    if (Date.now() - lastScrollAt < 500) return;
    // 全量扫描要为每个候选元素读一次布局，代价不低；上一轮没命中的页面
    // （如用户主页、个股页改版后）降到 4s 一轮，交互期间不再反复空跑
    if (Date.now() - xqScanAt < (xqScanHit ? 2000 : 4000)) return;
    xqScanAt = Date.now();
    xqScanHit = false;
    xqRevalidateMarks();
    var candidates = document.body.querySelectorAll("div,main,section");
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      // closest 沿祖先链判断，代价 O(深度)；比逐容器 querySelector 后代扫描便宜得多
      if (c.closest("[data-wb-xq-done]")) continue; // 只处理最外层匹配容器
      if (c.children.length < 2) continue;
      var cls = String(c.className || "");
      if (cls.indexOf("home__col--") >= 0 || cls.indexOf("stock__") >= 0) continue;
      var cr = c.getBoundingClientRect();
      if (cr.width < 900 || cr.width > window.innerWidth * 1.1) continue;
      var pair = xqDetectPair(c, cr);
      if (!pair) continue;
      pair.side.setAttribute("data-wb-xq-side", "1");
      // display=block 的主栏改为 flow-root 重建 BFC（防止 float:none 后
      // 内部 clearfix 误清外层浮动造成整块正文下沉）；flex/grid 等保持原布局
      pair.main.setAttribute("data-wb-xq-main",
        getComputedStyle(pair.main).display === "block" ? "block" : "1");
      c.setAttribute("data-wb-xq-done", "1");
      xqScanHit = true;
    }
  }

  function scheduleXqWide() {
    if (xqWideScheduled) return;
    xqWideScheduled = true;
    setTimeout(function () {
      xqWideScheduled = false;
      try { applyXqWide(); } catch (e) { /* ignore */ }
    }, 300);
  }

  function startXqWide() {
    // 定时器与 MutationObserver 只在雪球域名启动，其他站点零开销
    if (!isXueqiuHost()) return;
    if (xqWideTimer) return;
    xqWideTimer = setInterval(function () {
      if (!document.getElementById(HOST_ID)) return;
      try { applyXqWide(); } catch (e) { /* ignore */ }
    }, 2000);
    if (typeof MutationObserver === "function") {
      xqWideObserver = new MutationObserver(function () {
        if (!isModuleEnabledHere("xueqiuWide")) return;
        scheduleXqWide();
      });
      var attach = function () {
        if (document.body) xqWideObserver.observe(document.body, { childList: true, subtree: true });
      };
      if (document.body) attach();
      else document.addEventListener("DOMContentLoaded", attach);
    }
  }

  /* ---------------- 防页面自动跳顶（内嵌于雪球模块，随模块开关生效） ----------------
   * 雪球用户主页滚到列表底部会整块重渲染，文档高度瞬间塌陷，浏览器把
   * scrollTop 夹回 0 —— 页面「自己跳回顶部」，全过程没有任何 scrollTo /
   * scrollTop 赋值，油猴侧无法提前拦截，只能事后还原。判定条件（全部满足
   * 才动手）：
   *   1) 一次滚动里位置下坠超过 1200px 且落到顶部 60px 内；
   *   2) 不是我们自己（悬浮球/菜单）发起的回顶（guardSelfAt）；
   *   3) 最近 800ms 内用户没点过任何东西（排除站点自带的回顶按钮）；
   *   4) 地址没变（排除跳转与 SPA 路由切换）；
   *   5) 页面可见。
   * 还原最多重试约 1.2s：站点重渲染期间文档高度可能暂时为 0，一次性
   * scrollTo 会被夹住，必须等内容恢复后再补位。
   * ========================================================== */
  var guardLastY = 0;       // 上一次已知滚动位置
  var guardLastActAt = 0;   // 最近一次用户主动交互（点击 / 按键）时间
  var guardLastHref = "";   // 最近一次已知地址
  var guardBusy = false;    // 正在还原，期间不处理自身产生的滚动
  var guardTripped = 0;     // 命中次数（仅用于首次提示）
  var guardHooked = false;  // 交互监听只挂一次（ensureUI 可能重建 UI）

  function guardRestore(targetY) {
    guardBusy = true;
    var tries = 0;
    (function restore() {
      tries++;
      window.scrollTo(0, targetY);
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (Math.abs(y - targetY) > 8 && tries < 12) { setTimeout(restore, 100); return; }
      setTimeout(function () {
        guardBusy = false;
        guardLastY = window.pageYOffset || document.documentElement.scrollTop || 0;
      }, 200);
    })();
  }

  function guardOnScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (guardBusy) { guardLastY = y; return; }
    var prev = guardLastY;
    guardLastY = y;
    if (!config || document.hidden || !isModuleEnabledHere("xueqiuWide")) return;
    if (location.href !== guardLastHref) { guardLastHref = location.href; return; }
    if (prev - y < 1200 || y > 60) return;                  // 不是「一大截直接归零」
    if (Date.now() - guardSelfAt < 2000) return;            // 我们自己的回顶
    if (Date.now() - guardLastActAt < 800) return;          // 用户刚点过/按过键（多为站内回顶按钮、Home 键）
    guardTripped++;
    guardRestore(prev);
    if (guardTripped === 1) toast("已阻止页面自动跳回顶部");
  }

  function hookGuardUserActivity() {
    guardLastHref = location.href;
    guardLastY = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (guardHooked) return;
    guardHooked = true;
    // 点击与按键都视为「用户主动操作」：站内自带回顶按钮、Home / Ctrl+Home
    // 都会让位置一次性归零，这些都不该被还原
    document.addEventListener("click", function () {
      guardLastActAt = Date.now();
    }, true);
    document.addEventListener("keydown", function () {
      guardLastActAt = Date.now();
    }, true);
  }

  defineModule({
    id: "xueqiuWide",
    label: "雪球优化（隐藏右侧栏 / 防跳顶）",
    icon: "📈",
    hosts: ["xueqiu.com"],
    defaults: { middleWidth: 0 }, // 中间栏宽度 px；0 = 自动拉满
    mount: function () {
      startXqWide(); applyXqWide();
      hookGuardUserActivity();
    },
    refresh: function () {
      applyXqWide();
      guardLastHref = location.href;
      guardLastY = window.pageYOffset || document.documentElement.scrollTop || 0;
    },
    onScroll: function () { guardOnScroll(); },
    renderSettings: function (box) {
      var label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;";
      label.textContent = "中间栏宽度 (px，0=拉满)：";
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = "1600";
      inp.step = "10";
      inp.style.cssText = "width:90px;";
      inp.setAttribute("data-mod-setting", "xueqiuWide");
      inp.setAttribute("data-setting-key", "middleWidth");
      label.appendChild(inp);
      box.appendChild(label);
    }
  });

