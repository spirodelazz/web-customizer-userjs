  /* ==========================================================
   * 五、模块：雪球优化（配置命名空间 modules.xueqiuWide）
   * 隐藏右侧栏并拉宽正文 + 防页面自动跳顶（内嵌能力，无独立开关）
   * ----------------------------------------------------------
   * 两层策略：
   * 1) 精确选择器：首页/时间线页两栏为 AnonymousHome_container_2te 容器，
   *    左主栏 home__col--lf_XXX + 右侧栏 home__col--rt_XXX（hash 后缀随构建
   *    变化，故用 [class*=] 包含匹配）；隐藏右栏并把主栏拉宽。
   *    类名规则只在 data-wb-xq-scope 容器内生效——容器须先通过 xqScopeOk
   *    校验（页面级布局层、足够宽、不在正文/弹窗内部），避免同一组件类被
   *    复用到弹窗、卡片里时被整块隐藏。
   * 2) 通用兜底：其余页面（个股页等）运行时按几何特征识别「主栏 + 右侧窄列」，
   *    只在 body 往下 5 层内的布局层扫描，跳过 article / 弹窗内部与 fixed 浮层。
   * 定时器 + MutationObserver 双驱动：雪球是 SPA，路由切换/动态渲染后自动
   * 重新识别；模块关闭时标记与样式表一并撤下，页面还原为原状。
   * ========================================================== */
  var XQ_STYLE_ID = "wb-xq-wide-style";
  var XQ_DYN_ID = "wb-xq-wide-dyn";

  var xqWideCssDone = false;
  var xqWideTimer = null;
  var xqWideObserver = null;
  var xqWideScheduled = false;
  var xqCheckAt = 0;         // 上次复检时间（便宜，独立节流）
  var xqScanAt = 0;          // 上次全量扫描时间（贵，按是否命中降频）
  var xqScanHit = false;     // 上次扫描是否命中（未命中则降频，避免持续整页读布局）
  var xqDisplayDirty = true; // 需要重新判定主栏 display（窗口缩放 / 路由切换后）
  var xqDynStyle = null;

  // 这些容器内部一律不改写：正文、弹窗、抽屉里经常也有「左文右图」两列，
  // 按几何特征会被误判成主栏 + 侧栏，隐藏掉的其实是真实内容
  var XQ_DENY_SEL = 'article,[role="dialog"],[aria-modal="true"],' +
    '[class*="article"],[class*="Article"],[class*="modal"],[class*="Modal"],' +
    '[class*="drawer"],[class*="Drawer"],[class*="popup"],[class*="Popup"]';

  var XQ_SCAN_DEPTH = 5;     // 布局层扫描深度上限（body 往下）
  var XQ_MAX_CHILDREN = 40;  // 直接子元素多于此值即视为列表容器，不再往里扫

  function isXueqiuHost() {
    var h = location.hostname || "";
    return h === "xueqiu.com" ||
      (h.length > 11 && h.slice(h.length - 11) === ".xueqiu.com");
  }

  function ensureXqWideCss() {
    if (!document.head) return;
    // 样式表被站点/我们自己移除过就要重建，不能只看一次性标志
    if (xqWideCssDone && document.getElementById(XQ_STYLE_ID)) return;
    xqWideCssDone = true;
    var old = document.getElementById(XQ_STYLE_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var style = document.createElement("style");
    style.id = XQ_STYLE_ID;
    style.textContent = [
      /* 首页/时间线页：右栏隐藏，主栏拉宽（匿名版带构建 hash，登录版无 hash，包含匹配通吃）。
         规则一律挂在 data-wb-xq-scope 容器下：只有被 xqScopeOk 确认是页面级
         布局层的容器才会得到该标记，同一套类名出现在弹窗/卡片里时不再被命中 */
      '[data-wb-xq-scope] [class*="home__col--rt"]{display:none!important;}',
      '[data-wb-xq-scope] [class*="home__col--lf"]{width:auto!important;max-width:none!important;' +
      'flex:1 1 auto!important;float:none!important;}',
      /* 登录版首页：中间内容栏宽度可调（动态样式见 wb-xq-wide-dyn），默认拉满 */
      '[data-wb-xq-scope] [class*="user__col--middle"] > div{max-width:none!important;}',
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

  // 撤掉本模块注入的两张样式表（模块关闭 / 黑名单生效时调用）
  function xqRemoveWideCss() {
    var ids = [XQ_STYLE_ID, XQ_DYN_ID];
    for (var i = 0; i < ids.length; i++) {
      var s = document.getElementById(ids[i]);
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
    xqDynStyle = null;
    xqWideCssDone = false; // 允许重新启用时再次注入
  }

  /* ---------------- 精确选择器的容器限定 ---------------- */
  // 判断某个列所在的容器是否是可安全改写的「页面级布局层」：
  // 不在正文/弹窗内部、宽度占视口一半以上、有正常高度
  function xqScopeOk(col) {
    if (!col || !col.parentElement) return false;
    if (col.closest && col.closest(XQ_DENY_SEL)) return false;
    var p = col.parentElement;
    if (p === document.body || p === document.documentElement) return false;
    var pr = p.getBoundingClientRect();
    // 布局层是贴着页面宽度的大块；弹窗 / 卡片即使宽也走不到这里（已被 XQ_DENY_SEL 拦掉），
    // 用绝对阈值而不是视口比例，宽屏上容器只占视口一半时也能正常识别
    if (pr.height < 200 || pr.width < 900) return false;
    var cr = col.getBoundingClientRect();
    if (cr.width < 1 && cr.height < 1) return false; // 列本身不可见，没必要改
    return true;
  }

  function xqEnsureScope() {
    var cols = document.querySelectorAll(
      '[class*="home__col--rt"],[class*="user__col--middle"]');
    for (var i = 0; i < cols.length; i++) {
      var p = cols[i].parentElement;
      if (!p || p.getAttribute("data-wb-xq-scope") === "1") continue;
      if (xqScopeOk(cols[i])) p.setAttribute("data-wb-xq-scope", "1");
    }
  }

  // 清除全部标记（模块关闭/黑名单生效时还原原状）
  function xqMarkCleanup() {
    var marked = document.querySelectorAll(
      "[data-wb-xq-side],[data-wb-xq-main],[data-wb-xq-done],[data-wb-xq-scope]");
    for (var i = 0; i < marked.length; i++) {
      var n = marked[i];
      n.removeAttribute("data-wb-xq-side");
      n.removeAttribute("data-wb-xq-main");
      n.removeAttribute("data-wb-xq-done");
      n.removeAttribute("data-wb-xq-scope");
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
      // flow-root 是按打标那一刻的 display 定的；窗口缩放跨过响应式断点后站点
      // 可能把主栏换成 flex/grid，flow-root 会盖掉新布局 → 摘掉属性量一次原始值
      if (xqDisplayDirty) {
        main.removeAttribute("data-wb-xq-main");
        var real = getComputedStyle(main).display;
        main.setAttribute("data-wb-xq-main",
          (real === "block" || real === "flow-root") ? "block" : "1");
      }
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
    xqDisplayDirty = false;
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
    // 浮层（回到顶部、客服、播放器等）不是栏位，隐藏它只会让页面少个按钮又帮不上忙
    if (getComputedStyle(side.el).position === "fixed") return null;
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

  // 标记命中容器；display=block 的主栏改为 flow-root 重建 BFC（防止 float:none 后
  // 内部 clearfix 误清外层浮动造成整块正文下沉），flex/grid 等保持原布局
  function xqMarkPair(container, pair) {
    pair.side.setAttribute("data-wb-xq-side", "1");
    pair.main.setAttribute("data-wb-xq-main",
      getComputedStyle(pair.main).display === "block" ? "block" : "1");
    container.setAttribute("data-wb-xq-done", "1");
  }

  // 中间栏宽度设置：>300 视为固定像素宽，否则清空规则（默认拉满）
  // 内容没变就不重写 textContent：改样式表会触发整页样式重算与重排，
  // 信息流类页面（雪球首页）在滚动/触底加载瞬间被无谓重排，滚动位置容易跟着抖。
  function updateXqDynCss() {
    if (!document.head) return;
    var m = (config && config.modules.xueqiuWide) || {};
    var w = parseFloat(m.middleWidth);
    var sel = '[data-wb-xq-scope] [class*="user__col--middle"]';
    var css = (w > 300)
      ? sel + '{width:' + w + 'px!important;max-width:none!important;flex:0 0 auto!important;float:none!important;}'
      : sel + '{width:auto!important;max-width:none!important;flex:1 1 auto!important;float:none!important;}';
    if (xqDynStyle && xqDynStyle.__wbCss === css && document.head.contains(xqDynStyle)) return;
    if (!xqDynStyle || !document.head.contains(xqDynStyle)) {
      xqDynStyle = document.createElement("style");
      xqDynStyle.id = XQ_DYN_ID;
      document.head.appendChild(xqDynStyle);
    }
    xqDynStyle.textContent = css;
    xqDynStyle.__wbCss = css;
  }

  // 只扫「页面级布局层」：从 body 往下最远 5 层、每层都要求宽度接近视口、
  // 命中即不再深入。原先对整页 div/main/section 全量遍历并逐个读布局，
  // 信息流 / 个股页上是几千次强制同步布局，滚动时与站点自身渲染互相拖累。
  function xqScan() {
    var vw = window.innerWidth || 0;
    var queue = [{ el: document.body, depth: 0 }];
    while (queue.length) {
      var cur = queue.shift();
      // 几十个直接子元素只可能是列表，不可能是「主栏 + 侧栏」布局层：
      // 到此为止，不再逐个读它的子元素布局（信息流页最贵的正是这一步）
      if (cur.el.children.length > XQ_MAX_CHILDREN) continue;
      var kids = cur.el.children;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType !== 1) continue;
        if (k.hasAttribute("data-wb-xq-done")) continue;        // 已标记：整棵子树跳过
        if (k.closest && k.closest(XQ_DENY_SEL)) continue;      // 正文 / 弹窗内部不动
        var r = k.getBoundingClientRect();
        // 宽度/高度不达标就没必要往下找：布局层一定是贴着视口宽度的大块
        if (r.height < 200 || r.width < 900) continue;
        if (vw && (r.width > vw * 1.1 || r.width < vw * 0.6)) continue;
        // 只有一个子元素的包装层本身不可能是「主栏 + 侧栏」，但要继续往下走，
        // 否则 body > #app > .wrap > .layout 这种单链包装会让扫描整条断掉
        if (k.children.length >= 2 && k.children.length <= XQ_MAX_CHILDREN) {
          var cls = String(k.className || "");
          if (cls.indexOf("home__col--") < 0 && cls.indexOf("stock__") < 0) {
            var pair = xqDetectPair(k, r);
            if (pair) {
              xqMarkPair(k, pair);
              xqScanHit = true;
              continue;                                         // 命中则不再深入该子树
            }
          }
        }
        if (cur.depth + 1 < XQ_SCAN_DEPTH) queue.push({ el: k, depth: cur.depth + 1 });
      }
    }
  }

  function applyXqWide() {
    if (!isXueqiuHost() || !document.body || document.hidden) return;
    if (!isModuleEnabledHere("xueqiuWide")) {
      // 关闭必须真还原：标记连同样式表一起撤下，否则右栏会一直隐藏到刷新页面
      xqMarkCleanup();
      xqRemoveWideCss();
      return;
    }
    ensureXqWideCss();
    xqEnsureScope();
    updateXqDynCss();
    // 用户正在滚动时（尤其是触底加载的瞬间）不做布局改写：
    // 此刻页面的滚动位置与虚拟列表正由站点自己的逻辑管理，我们改兄弟列的
    // display / 宽度会引起重排，容易把滚动位置带偏。停手 0.5s 后再补做。
    if (Date.now() - lastScrollAt < 500) return;
    var now = Date.now();
    // 复检很便宜（只有已标记的几个容器），单独 1s 节流：布局被站点翻转后
    // 能尽快撤销标记，不用等全量扫描的 2~4s 窗口
    if (now - xqCheckAt >= 1000) {
      xqCheckAt = now;
      // 复检放在这里而不是「精确选择器命中就提前 return」之后：
      // 否则 SPA 从启发式页面切到带精确类名的页面时，旧标记永远不会被复检
      xqRevalidateMarks();
    }
    if (document.querySelector("[data-wb-xq-scope]")) return;
    // 需要启发式扫描的页面按上一轮是否命中降到 2s / 4s
    if (now - xqScanAt < (xqScanHit ? 2000 : 4000)) return;
    xqScanAt = now;
    xqScanHit = false;
    xqScan();
  }

  function scheduleXqWide() {
    if (xqWideScheduled) return;
    xqWideScheduled = true;
    setTimeout(function () {
      xqWideScheduled = false;
      var run = function () { try { applyXqWide(); } catch (e) { /* ignore */ } };
      // DOM 仍在持续变动时立刻改写布局会与站点自身渲染互相拖累：
      // 等这一批变更落定，在下一帧执行
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else run();
    }, 500);
  }

  function startXqWide() {
    // 定时器与 MutationObserver 只在雪球域名启动，其他站点零开销
    if (!isXueqiuHost()) return;
    if (xqWideTimer) return;
    xqWideTimer = setInterval(function () {
      if (!document.getElementById(HOST_ID)) return;
      // 模块关闭时整体跳过：不再每 2s 做一次全页标记清理
      if (!isModuleEnabledHere("xueqiuWide")) return;
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
   *   2) 文档高度同时塌陷了「下坠距离的一半」以上——这是区分「站点重渲染」
   *      与「用户把滚动条拖到顶部 / 惯性回弹」的唯一可靠信号：后者位置同样
   *      一次归零，但文档高度不变，不该被抢回来；
   *   3) 不是我们自己（悬浮球/菜单）发起的回顶（guardSelfAt）；
   *   4) 最近 800ms 内用户没点过任何东西（排除站点自带的回顶按钮）；
   *   5) 地址没变（排除跳转与 SPA 路由切换）；
   *   6) 页面可见。
   * 还原最多重试约 1.2s：站点重渲染期间文档高度可能暂时为 0，一次性
   * scrollTo 会被夹住，必须等内容恢复后再补位。
   * ========================================================== */
  var guardLastY = 0;       // 上一次已知滚动位置
  var guardLastH = 0;       // 上一次已知文档高度（判定是否真的塌陷）
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
        guardLastH = document.documentElement.scrollHeight || 0;
      }, 200);
    })();
  }

  function guardOnScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var h = document.documentElement.scrollHeight || 0;
    if (guardBusy) { guardLastY = y; guardLastH = h; return; }
    var prevY = guardLastY, prevH = guardLastH;
    guardLastY = y; guardLastH = h;
    if (!config || document.hidden || !isModuleEnabledHere("xueqiuWide")) return;
    if (location.href !== guardLastHref) { guardLastHref = location.href; return; }
    var dropY = prevY - y;
    if (dropY < 1200 || y > 60) return;                     // 不是「一大截直接归零」
    // 文档高度没跟着塌陷 → 是用户把滚动条拖回顶部或惯性回弹，不能抢
    if (prevH - h < Math.max(600, dropY * 0.5)) return;
    if (Date.now() - guardSelfAt < 2000) return;            // 我们自己的回顶
    if (Date.now() - guardLastActAt < 800) return;          // 用户刚点过/按过键（多为站内回顶按钮、Home 键）
    guardTripped++;
    guardRestore(prevY);
    if (guardTripped === 1) toast("已阻止页面自动跳回顶部");
  }

  function hookGuardUserActivity() {
    guardLastHref = location.href;
    guardLastY = window.pageYOffset || document.documentElement.scrollTop || 0;
    guardLastH = document.documentElement.scrollHeight || 0;
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
      xqDisplayDirty = true;
      applyXqWide();
      guardLastHref = location.href;
      guardLastY = window.pageYOffset || document.documentElement.scrollTop || 0;
      guardLastH = document.documentElement.scrollHeight || 0;
    },
    onScroll: function () { guardOnScroll(); },
    onResize: function () {
      // 跨过响应式断点后主栏的 display 可能换掉，复检时重新判定
      xqDisplayDirty = true;
      scheduleXqWide();
    },
    renderSettings: function (box) {
      var label = document.createElement("label");
      label.className = "wb-setting";
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
