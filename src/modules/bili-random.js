  /* ==========================================================
   * 四、模块：B站合集随机播放（配置命名空间 modules.biliRandom）
   * ----------------------------------------------------------
   * 参考 Chrome 扩展 BilibiliPlaylistController 的合作式交互模型：
   *   - 数据层：维护合集「当前播放顺序」数组，一键随机打乱（当前视频置顶）
   *   - UI 层：合集头部注入「随机播放」按钮，打乱后同步重排侧栏
   *   - 播放层：覆写 window.player.next/prev + 监听 video ended（自动连播），
   *     按打乱后的顺序取下一集，通过官方 player.reload({bvid}) 原地加载，
   *     SPA 免整页刷新；未启用时全部回退 B 站原生逻辑
   * 数据源：侧栏 DOM 优先（.video-pod__item[data-key] + 链接元素双策略），
   *         不足时回退页面数据 __INITIAL_STATE__
   * ========================================================== */
  function isBiliVideoPage() {
    return location.hostname === "www.bilibili.com" && location.pathname.indexOf("/video/") === 0;
  }

  function findBiliPod() {
    return document.querySelector(".video-pod") ||
           document.querySelector(".video-episode-info") ||
           document.querySelector(".video-sections");
  }

  // p 参数归一化：无 p / p=1 视为同一集（B站默认从 P1 播放）
  function normalizeP(p) {
    var n = parseInt(p, 10);
    return (!n || n <= 1) ? null : String(n);
  }

  // 统一的视频标识：去掉尾斜杠，避免 /video/BVxx/ 与 /video/BVxx 不一致
  function videoKey(pathname, p) {
    return String(pathname || "").replace(/\/+$/, "") + (p ? "?p=" + p : "");
  }

  function currentVideoKey() {
    var p = null;
    try { p = normalizeP(new URLSearchParams(location.search).get("p")); } catch (e) { /* ignore */ }
    return videoKey(location.pathname, p);
  }

  function videoIdFromPath(pathname) {
    var m = String(pathname || "").match(/^\/video\/([^/?]+)/);
    return m ? m[1] : null;
  }

  function addEpisode(out, id, p, title) {
    var key = videoKey("/video/" + id, p);
    if (out[key]) return;
    out[key] = {
      key: key,
      id: id,
      p: p,
      href: "/video/" + id + (p ? "?p=" + p : ""),
      title: (title || "").replace(/\s+/g, " ").trim().slice(0, 50)
    };
  }

  // 从侧栏「视频选集」DOM 读取
  // 策略一：B站选集条目元素（.video-pod__item，data-key = bvid）
  // 策略二：合集容器内的链接元素（兼容旧版 DOM）
  function scanDomEpisodes(out) {
    var pod = findBiliPod();
    if (!pod) return;
    var items = pod.querySelectorAll(".video-pod__item, .video-section-list-item");
    var seen = 0;
    for (var i = 0; i < items.length; i++) {
      var elm = items[i];
      var id = elm.getAttribute("data-key") || elm.getAttribute("data-bvid");
      if (!id) continue;
      id = videoIdFromPath("/video/" + id) || String(id).split("?")[0];
      var p = null;
      var a = elm.querySelector ? elm.querySelector('a[href*="/video/"]') : null;
      if (a) {
        try { p = normalizeP(new URLSearchParams(a.search).get("p")); } catch (e) { /* ignore */ }
      }
      var key = videoKey("/video/" + id, p);
      seen++;
      if (out[key]) continue; // 已收集过：跳过昂贵的 textContent 子树读取
      var title = (elm.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
      addEpisode(out, id, p, title);
    }
    if (seen > 0) return; // 策略一已命中：跳过锚点兜底的全量二次扫描（性能热点）
    var anchors = pod.querySelectorAll('a[href*="/video/"]');
    for (var j = 0; j < anchors.length; j++) {
      var raw = anchors[j].getAttribute("href") || "";
      if (!raw || raw.indexOf("javascript:") === 0) continue;
      var u = null;
      try { u = new URL(raw, location.origin); } catch (e) { continue; }
      if (u.hostname !== location.hostname) continue;
      var aid = videoIdFromPath(u.pathname);
      if (!aid) continue;
      var ap = null;
      try { ap = normalizeP(u.searchParams.get("p")); } catch (e) { /* ignore */ }
      var atitle = (anchors[j].textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
      addEpisode(out, aid, ap, atitle);
    }
  }

  // 从页面数据读取合集/分P（DOM 失效时的兜底数据源）
  function scanInitialStateEpisodes(out) {
    var st = null;
    try { st = unsafeWindow.__INITIAL_STATE__; } catch (e) { return; }
    var vd = st && st.videoData;
    if (!vd) return;
    // UGC 合集（space.bilibili.com/.../lists/xxx?type=season 对应的结构）
    var season = vd.ugc_season;
    if (season && season.sections) {
      season.sections.forEach(function (sec) {
        (sec.episodes || []).forEach(function (ep) {
          if (!ep || !ep.bvid) return;
          addEpisode(out, ep.bvid, null, ep.title || ep.long_title || "");
        });
      });
    }
    // 分P
    (vd.pages || []).forEach(function (pg) {
      if (!pg) return;
      addEpisode(out, vd.bvid, pg.page > 1 ? String(pg.page) : null, pg.part || ("P" + pg.page));
    });
  }

  // 汇总选集：DOM 优先（跟随 SPA 实时变化），不足两条时用页面数据兜底
  function collectEpisodes() {
    var out = {};
    scanDomEpisodes(out);
    var count = Object.keys(out).length;
    if (count < 2) {
      var domSnapshot = {};
      for (var k in out) { if (Object.prototype.hasOwnProperty.call(out, k)) domSnapshot[k] = out[k]; }
      scanInitialStateEpisodes(out);
      if (Object.keys(out).length < Object.keys(domSnapshot).length) {
        out = domSnapshot; // 兜底数据反而更少时，保留 DOM 结果
      }
    }
    var list = [];
    for (var key in out) { if (Object.prototype.hasOwnProperty.call(out, key)) list.push(out[key]); }
    return list;
  }

  /* ---------------- 播放顺序数据层 ---------------- */
  var biliOrder = null;          // 当前播放顺序
  var biliOriginalOrder = null;  // 合集原始顺序（记录用）
  var biliOrderSig = null;       // 合集指纹（选集 key 排序串），用于识别合集切换
  var orderMode = "original";    // "original" | "custom"（用户点过随机后为 custom）
  var BILI_SESSION_KEY = "wb_bili_shuffle_session_v1"; // 随机顺序会话存储（sessionStorage，标签页隔离）
  var BILI_RELOAD_EVERY = 10;    // 每连播 N 集整页换血一次，回收 B 站播放器原地 reload 累积的内存
  var biliAutoSwitchCount = 0;   // 本次随机会话已自动连播的集数（跨整页刷新累计）

  function loadBiliSession() {
    try { return JSON.parse(sessionStorage.getItem(BILI_SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }

  function saveBiliSession() {
    try {
      if (!biliOrder || !biliOrderSig) return;
      sessionStorage.setItem(BILI_SESSION_KEY, JSON.stringify({
        sig: biliOrderSig,
        mode: orderMode,
        count: biliAutoSwitchCount,
        order: biliOrder.map(function (e) { return e.key; })
      }));
    } catch (e) { /* ignore */ }
  }

  function clearBiliSession() {
    try { sessionStorage.removeItem(BILI_SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function isSubsetOf(eps, order) {
    var keys = {};
    order.forEach(function (e) { keys[e.key] = 1; });
    return eps.every(function (e) { return keys[e.key]; });
  }

  // 刷新合集顺序数据：同一合集保留自定义顺序；切到新合集则重建，
  // 并尝试从 sessionStorage 恢复上一次页面会话的随机顺序（整页换血后续播）
  function refreshBiliOrder() {
    if (!isBiliVideoPage()) return;
    var eps = collectEpisodes();
    if (eps.length < 2) return; // 没有可控制的合集/分P 列表
    if (biliOrder && isSubsetOf(eps, biliOrder)) return; // 列表尚未渲染完整（子集），保持现状
    var sig = eps.map(function (e) { return e.key; }).sort().join("|");
    if (biliOrderSig === sig) return;
    biliOrderSig = sig;
    biliOriginalOrder = eps.slice();
    biliOrder = eps.slice();
    orderMode = "original";
    var saved = loadBiliSession();
    if (saved && saved.sig === sig && saved.mode === "custom" && Array.isArray(saved.order)) {
      var byKey = {};
      eps.forEach(function (e) { byKey[e.key] = e; });
      var restored = [];
      saved.order.forEach(function (k) { if (byKey[k]) restored.push(byKey[k]); });
      // 顺序必须完整覆盖当前合集（且与保存时条数一致）才恢复，防合集更新后错序
      if (restored.length === eps.length && restored.length === saved.order.length) {
        biliOrder = restored;
        orderMode = "custom";
        biliAutoSwitchCount = typeof saved.count === "number" ? saved.count : 0;
        reorderPodDOM(biliOrder); // 侧栏同步为恢复的顺序（列表未渲染完时静默失败，不影响播放顺序）
      } else {
        clearBiliSession();
      }
    }
  }

  function shuffleOf(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function ensureOrderReady() {
    refreshBiliOrder();
    if (!biliOrder || biliOrder.length < 2) {
      toast("未找到可控制的合集/分P 列表");
      return false;
    }
    return true;
  }

  function biliShuffleAct() {
    if (!ensureOrderReady()) return;
    biliOrder = shuffleOf(biliOrder);
    // 当前正在播放的视频置顶，其余打乱后排在它后面（播完自动接随机连播）
    var idx = currentOrderIndex();
    if (idx > 0) {
      var cur = biliOrder.splice(idx, 1)[0];
      biliOrder.unshift(cur);
    }
    orderMode = "custom";
    biliAutoSwitchCount = 0; // 新的随机会话从零计数
    saveBiliSession();
    var domOk = reorderPodDOM(biliOrder);
    if (domOk) scrollPodToTop(); // 置顶后把列表滚动位置带回顶部，让新顺序立即可见
    toast(domOk
      ? "已随机打乱合集顺序，当前视频置顶，播完后按新顺序连播"
      : "顺序已打乱（当前视频置顶，侧栏列表暂无法重排），播完后按新顺序连播");
  }

  // 把合集侧栏的滚动位置复位到顶部（当前视频条目已置顶在首位）
  // 把合集列表滚动位置复位到顶部（当前视频条目已置顶在首位）。
  // 旧实现只从 .video-pod 向上找，但 B 站真实滚动容器常是 pod 的内部子元素
  // （如 .video-pod__list，pod 自身是 overflow:hidden 外壳）而漏找。
  // 改为从置顶后的第一条目向上遍历祖先链——真实滚动容器一定在该条目的
  // 祖先链上（pod 内或外层都可能），把链上所有可滚动容器全部归零。
  function scrollPodToTop() {
    var items = getPodItems();
    if (!items.length) return;
    var node = items[0].el;
    var hops = 0;
    while (node && node.nodeType === 1 && node !== document.body && hops < 15) {
      var st = null;
      try { st = window.getComputedStyle(node); } catch (e) { st = null; }
      if (st && (st.overflowY === "auto" || st.overflowY === "scroll" || st.overflowY === "overlay") &&
          node.scrollHeight > node.clientHeight + 2) {
        node.scrollTop = 0;
      }
      node = node.parentNode;
      hops++;
    }
  }

  /* ---------------- 合集头部：随机播放 单按钮 ---------------- */
  var ICON_SHUFFLE = '<path fill="currentColor" d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>';

  function createPodButton() {
    var btn = document.createElement("div");
    btn.id = "wb-shuffle-btn";
    btn.className = "view-mode wb-shuffle-btn";
    btn.title = "随机打乱合集播放顺序（当前视频置顶，播完后按新顺序连播）";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:16px;height:16px;">' + ICON_SHUFFLE + "</svg>" +
      '<span style="margin-left:3px;">随机播放</span>';
    btn.style.cssText =
      "display:inline-flex;align-items:center;cursor:pointer;color:#61666d;font-size:12px;" +
      "padding:0 6px;height:24px;user-select:none;-webkit-user-select:none;";
    btn.addEventListener("mouseenter", function () { btn.style.color = "#00a1d6"; });
    btn.addEventListener("mouseleave", function () { btn.style.color = "#61666d"; });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      biliShuffleAct();
    });
    return btn;
  }

  // 在合集头部注入「随机播放」按钮（B站改版重渲染后由定时任务自动重建）
  function ensurePodButtons() {
    if (!isBiliVideoPage()) return;
    var pod = findBiliPod();
    var staleBar = document.getElementById("wb-playlist-controls"); // 更早版本的三按钮容器，顺手清理
    var old = document.getElementById("wb-shuffle-btn");
    if (!isModuleEnabledHere("biliRandom") || !pod || !biliOrder || biliOrder.length < 2) {
      if (old && old.parentNode) old.parentNode.removeChild(old);
      if (staleBar && staleBar.parentNode) staleBar.parentNode.removeChild(staleBar);
      return;
    }
    if (pod.querySelector(".wb-shuffle-btn")) return; // 已注入
    if (old && old.parentNode) old.parentNode.removeChild(old); // 清理游离的旧按钮
    if (staleBar && staleBar.parentNode) staleBar.parentNode.removeChild(staleBar);

    var header = pod.querySelector(".video-pod__header .header-top .left") ||
                 pod.querySelector(".video-pod__header") || pod;
    var btn = createPodButton();
    btn.style.marginLeft = "10px";
    if (header === pod) {
      // 找不到头部容器时，插入到选集列表顶部
      var wrap = document.createElement("div");
      wrap.style.cssText = "padding:4px 8px;";
      wrap.appendChild(btn);
      pod.insertBefore(wrap, pod.firstChild);
    } else {
      header.appendChild(btn);
    }
  }

  // 获取侧栏选集条目元素（新版 B 站为 .video-pod__item，data-key = bvid）
  function getPodItems() {
    var pod = findBiliPod();
    if (!pod) return [];
    var els = pod.querySelectorAll(".video-pod__item, .video-section-list-item");
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var elm = els[i];
      if (elm.id === "wb-shuffle-btn") continue;
      var id = elm.getAttribute("data-key") || elm.getAttribute("data-bvid") || null;
      var p = null;
      if (id) {
        id = videoIdFromPath("/video/" + id) || String(id).split("?")[0];
      } else {
        var a = elm.matches && elm.matches('a[href*="/video/"]') ? elm : elm.querySelector('a[href*="/video/"]');
        if (!a) continue;
        id = videoIdFromPath((a.getAttribute("href") || "").split("?")[0]);
        if (!id) continue;
        try { p = normalizeP(new URLSearchParams(a.search).get("p")); } catch (e) { /* ignore */ }
      }
      out.push({ el: elm, id: id, p: p, key: videoKey("/video/" + id, p) });
    }
    return out;
  }

  // 把侧栏 DOM 顺序同步为指定顺序（appendChild 重排）
  function reorderPodDOM(order) {
    var items = getPodItems();
    if (items.length < 2) return false;
    var list = null;
    try { list = items[0].el.parentNode; } catch (e) { list = null; }
    if (!list) return false;
    var byKey = {}, byId = {};
    items.forEach(function (it) {
      byKey[it.key] = it.el;
      if (!byId[it.id]) byId[it.id] = it.el;
    });
    var moved = 0;
    order.forEach(function (ep) {
      var node = byKey[ep.key] || byId[ep.id];
      if (node) { list.appendChild(node); moved++; }
    });
    return moved >= 2;
  }

  /* ---------------- 播放导航层（合作式接管） ---------------- */
  var lastNavKey = null, lastNavTime = 0;

  // 跳转到指定集：优先官方 player.reload({bvid})（SPA 免刷新），
  // 带 p 参数或 reload 不可用时模拟点击侧栏条目，最后才整页跳转
  function navigateToEpisode(ep) {
    var now = Date.now();
    if (ep.key === lastNavKey && now - lastNavTime < 2000) return; // 去重（ended 与 next 可能同时触发）
    lastNavKey = ep.key;
    lastNavTime = now;

    // 内存防崩：player.reload 原地加载会让 B 站播放器内存持续累积（弹幕/缓冲/DOM），
    // 长挂机会把整机拖入内存交换。每连播 N 集强制整页跳转一次「换血」，
    // 页面重载后按 sessionStorage 持久化的随机顺序无缝续播。
    biliAutoSwitchCount++;
    var fullReload = biliAutoSwitchCount >= BILI_RELOAD_EVERY;
    if (fullReload) biliAutoSwitchCount = 0;
    saveBiliSession();

    if (!fullReload && !ep.p) {
      var p = null;
      try { p = unsafeWindow.player; } catch (e) { /* ignore */ }
      if (p && typeof p.reload === "function") {
        try { p.reload({ bvid: ep.id }); return; } catch (e) { /* 走兜底 */ }
      }
    }
    if (!fullReload && spaNavigateTo(ep)) return;
    location.href = location.origin + ep.href; // SPA 兜底或整页换血：新页面按持久化顺序续播
  }

  // 模拟点击侧栏目标条目，交给 B 站自身 SPA 逻辑切换视频
  function spaNavigateTo(ep) {
    try {
      var items = getPodItems();
      var target = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].key === ep.key || items[i].id === ep.id) { target = items[i].el; break; }
      }
      if (!target) return false;
      var a = target.matches && target.matches('a[href]') ? target : target.querySelector('a[href]');
      (a || target).click();
      return true;
    } catch (e) { return false; }
  }

  function currentOrderIndex() {
    var curKey = currentVideoKey();
    for (var i = 0; i < biliOrder.length; i++) {
      if (biliOrder[i].key === curKey) return i;
    }
    var curId = videoIdFromPath(curKey.split("?")[0]);
    if (curId) {
      for (var j = 0; j < biliOrder.length; j++) {
        if (biliOrder[j].id === curId) return j;
      }
    }
    return -1;
  }

  // player.next/prev 的替换实现：自定义顺序启用时按 biliOrder 导航，
  // 否则回退 B 站原生方法（行为与默认完全一致）
  function biliNavigate(direction, origFn, self, args) {
    if (orderMode === "custom" && biliOrder && biliOrder.length > 1) {
      var idx = currentOrderIndex();
      if (idx !== -1) {
        var n = direction === "next" ? idx + 1 : idx - 1;
        if (n >= 0 && n < biliOrder.length) navigateToEpisode(biliOrder[n]);
        return false; // 已到合集边界，停在当前视频
      }
    }
    if (typeof origFn === "function") {
      try { return origFn.apply(self || null, args || []); } catch (e) { /* ignore */ }
    }
    return false;
  }

  // 覆写 window.player.next/prev（播放器实例重建后由定时任务自动重挂）
  function overrideBiliPlayerNav() {
    var p = null;
    try { p = unsafeWindow.player; } catch (e) { return; }
    if (!p) return;
    if (p.__wbNavHooked) {
      if (p.next !== p.__wbNavNext) p.next = p.__wbNavNext; // 被页面重置过则补挂
      if (p.prev !== p.__wbNavPrev) p.prev = p.__wbNavPrev;
      return;
    }
    p.__wbOrigNext = typeof p.next === "function" ? p.next : null;
    p.__wbOrigPrev = typeof p.prev === "function" ? p.prev : null;
    p.__wbNavNext = function () { return biliNavigate("next", p.__wbOrigNext, p, arguments); };
    p.__wbNavPrev = function () { return biliNavigate("prev", p.__wbOrigPrev, p, arguments); };
    p.next = p.__wbNavNext;
    p.prev = p.__wbNavPrev;
    p.__wbNavHooked = true;
  }

  // 自动连播兜底：视频播放结束时按自定义顺序继续（仅 custom 模式生效）
  function hookBiliVideoEnded() {
    var v = document.querySelector("video");
    if (!v || v.dataset.wbEndedHooked) return;
    v.dataset.wbEndedHooked = "1";
    v.addEventListener("ended", function () {
      if (orderMode === "custom") biliNavigate("next", null, null, null);
    });
  }

  /* ---------------- 路由/定时驱动 ---------------- */
  var biliRouteHooked = false;
  var biliLastFullScan = 0;      // 上次全量选集扫描时间（扫描降频，避免长挂机时 GC/CPU 压力累积）
  var BILI_FULL_SCAN_MS = 5000;  // 全量扫描最小间隔；换集/路由变化时由 onRouteRefresh 立即补扫

  function onRouteRefresh() {
    if (!isBiliVideoPage()) return;
    refreshBiliOrder();
    biliLastFullScan = Date.now();
    ensurePodButtons();
    overrideBiliPlayerNav();
  }

  // B站是 SPA：路由变化时刷新 UI（仅 B 站页面挂钩），定时器兜底重挂
  function hookBiliRoute() {
    if (biliRouteHooked) return; // mount 可能被 ensureUI 再次触发，防重复挂钩
    biliRouteHooked = true;
    if (location.hostname !== "www.bilibili.com") return;
    try {
      ["pushState", "replaceState"].forEach(function (name) {
        var orig = history[name];
        if (typeof orig !== "function") return;
        history[name] = function () {
          var ret = orig.apply(this, arguments);
          try { onRouteRefresh(); } catch (e) { /* ignore */ }
          return ret;
        };
      });
      window.addEventListener("popstate", onRouteRefresh);
    } catch (e) { /* 页面限制改写 history 时忽略 */ }

    // 每秒只做廉价检查（按钮重挂/播放器钩子/ended 钩子）；
    // 全量选集扫描降频至 5s 一次，且后台标签完全跳过（长挂机防崩关键）
    function tick() {
      if (!document.getElementById(HOST_ID)) return;
      if (isBiliVideoPage()) {
        ensurePodButtons();
        overrideBiliPlayerNav();
        hookBiliVideoEnded();
        if (!document.hidden && Date.now() - biliLastFullScan >= BILI_FULL_SCAN_MS) {
          biliLastFullScan = Date.now();
          refreshBiliOrder();
        }
      }
    }
    setInterval(tick, 1000);
    onRouteRefresh();
  }

  defineModule({
    id: "biliRandom",
    label: "B站合集随机播放",
    icon: "🎲",
    hosts: ["www.bilibili.com"],
    defaults: {},
    mount: function () { hookBiliRoute(); },
    refresh: function () { onRouteRefresh(); }
  });

