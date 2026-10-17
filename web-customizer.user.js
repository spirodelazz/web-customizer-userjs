// ==UserScript==
// @name         网页定制助手
// @namespace    https://github.com/spirodelazz/web-customizer-userjs
// @version      2.5.1
// @description  网页定制化脚本工具箱（模块化架构）：每个功能模块拥有独立开关、独立黑名单与专属设置，互不干扰。内置「回到顶部」悬浮球、B站合集随机播放（当前视频置顶 + SPA 免刷新连播 + 顺序跨刷新续播 + 定期整页换血防内存累积）、雪球隐藏右侧栏并拉宽正文（运行时布局识别，改版不失效）、X（推特）隐藏右侧栏（过滤搜索/订阅 Premium/新鲜事/推荐关注）。按文末扩展点可无侵入添加新模块。
// @author       spirodelazz
// @homepageURL  https://github.com/spirodelazz/web-customizer-userjs
// @supportURL   https://github.com/spirodelazz/web-customizer-userjs/issues
// @source       https://github.com/spirodelazz/web-customizer-userjs/
// @downloadURL  https://raw.githubusercontent.com/spirodelazz/web-customizer-userjs/main/web-customizer.user.js
// @updateURL    https://raw.githubusercontent.com/spirodelazz/web-customizer-userjs/main/web-customizer.user.js
// @match        *://*/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  /* ==========================================================
   * 一、模块框架：注册表 + 命名空间配置 + 站点判定
   * ----------------------------------------------------------
   * 每个功能模块通过 defineModule 注册，拥有：
   *   - 独立的配置命名空间 config.modules[id]（开关/黑名单/专属设置）
   *   - 独立的站点判定（全局黑名单 + 本模块黑名单 两层）
   *   - 独立的面板区块（自动生成，无需改面板代码）
   * 模块之间不互相引用状态，仅共享框架提供的基础设施。
   * ========================================================== */
  var MODULE_DEFS = [];

  function defineModule(def) {
    MODULE_DEFS.push(def);
    return def;
  }

  var STORAGE_KEY = "wb_web_customizer_config_v2";                   // 当前使用的存储键（v2 模块化结构）
  var LEGACY_KEYS = ["wb_web_customizer_config_v1", "wb_backtop_config_v1"]; // 历史存储键，首次读取时自动迁移
  var BALL_SIZE = 44;
  var RING_RADIUS = 20;
  var RING_LEN = 2 * Math.PI * RING_RADIUS;
  var HOST_ID = "wb-customizer-shadow-host";

  var shadow = null, ball = null, ringBar = null, panel = null, toastEl = null;
  var toastTimer = null;
  var config = null; // init 时加载
  var scrollSeq = 0; // 页面滚动序号：拖拽层用它判定「这次按下与抬起之间是否夹着滚动」
  var lastScrollAt = 0; // 最近一次滚动时间戳：布局改写类模块用它避开用户滚动中的页面

  function sanitizeList(v) {
    var seen = {}, out = [];
    (Array.isArray(v) ? v : []).forEach(function (x) {
      var t = String(x || "").trim().toLowerCase();
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out;
  }

  // 归一化：确保每个已注册模块的命名空间存在且字段齐全，未知名单一律丢弃
  function normalizeConfig(saved) {
    saved = saved && typeof saved === "object" ? saved : {};
    var out = { globalBlacklist: sanitizeList(saved.globalBlacklist), modules: {} };
    MODULE_DEFS.forEach(function (def) {
      var s = (saved.modules && saved.modules[def.id] && typeof saved.modules[def.id] === "object")
        ? saved.modules[def.id] : {};
      // 只保留模块声明过的设置键（历史遗留字段如 dicePos 迁移后自动丢弃）
      var m = { enabled: typeof s.enabled === "boolean" ? s.enabled : true, blacklist: sanitizeList(s.blacklist) };
      var d = def.defaults || {};
      for (var mk in d) {
        if (!Object.prototype.hasOwnProperty.call(d, mk)) continue;
        m[mk] = (s[mk] !== undefined) ? s[mk] : d[mk];
      }
      out.modules[def.id] = m;
    });
    return out;
  }

  // 旧版（v1 扁平结构）→ v2 模块化结构
  function migrateLegacy(o) {
    o = o && typeof o === "object" ? o : {};
    var f = o.features || {};
    return normalizeConfig({
      globalBlacklist: o.blacklist || [],
      modules: {
        backToTop: {
          enabled: f.backToTop !== false,
          showThreshold: o.showThreshold || 200,
          btnPos: o.btnPos || null
        },
        biliRandom: {
          enabled: f.biliRandom !== false
        }
      }
    });
  }

  function loadConfig() {
    try {
      var saved = GM_getValue(STORAGE_KEY, null);
      if ((!saved || typeof saved !== "object") && LEGACY_KEYS.length) {
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
          var legacy = GM_getValue(LEGACY_KEYS[i], null);
          if (legacy && typeof legacy === "object") { saved = migrateLegacy(legacy); break; }
        }
      }
      if (saved && typeof saved === "object") {
        if (saved.modules && typeof saved.modules === "object") return normalizeConfig(saved);
        return migrateLegacy(saved); // v1 结构兜底
      }
    } catch (e) { /* 读取异常时回退默认 */ }
    return normalizeConfig({});
  }

  function saveConfig() {
    try { GM_setValue(STORAGE_KEY, config); } catch (e) { /* 写入异常忽略 */ }
  }

  /* ---------------- 域名匹配：example.com（含子域）/ *.example.com / * ---------------- */
  function escapeReg(s) {
    return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }

  function hostMatchesPattern(host, pattern) {
    host = String(host || "").toLowerCase();
    pattern = String(pattern || "").trim().toLowerCase();
    if (!host || !pattern) return false;
    if (pattern === "*") return true;
    if (pattern.indexOf("*.") === 0) {
      var base = pattern.slice(2);
      return host === base || host.slice(-base.length - 1) === "." + base;
    }
    if (pattern.indexOf("*") !== -1) {
      var re = new RegExp("^" + pattern.split("*").map(escapeReg).join(".*") + "$");
      return re.test(host);
    }
    return host === pattern || host.slice(-pattern.length - 1) === "." + pattern;
  }

  function isBlacklistedHere(list) {
    var host = location.hostname;
    return (list || []).some(function (p) { return hostMatchesPattern(host, p); });
  }

  // 本机/内网地址：所有功能一律禁用（本地开发页面不受脚本干扰）
  function isLocalAddress() {
    if (location.protocol === "file:") return true;
    var h = location.hostname || "";
    if (!h) return false;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" ||
        h.slice(-6) === ".local" || h.slice(-4) === ".lan" || h.slice(-5) === ".home" ||
        h.slice(-4) === ".arpa") return true;
    var m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a === 127 || a === 10 || a === 0 ||
          (a === 192 && b === 168) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 169 && b === 254)) return true;
    }
    return false;
  }

  // 模块在本站点是否生效：模块开关 && 非本机地址 && 不在全局黑名单 && 不在本模块黑名单
  function isModuleEnabledHere(id) {
    if (isLocalAddress()) return false;
    var m = config && config.modules[id];
    if (!m || !m.enabled) return false;
    if (isBlacklistedHere(config.globalBlacklist)) return false;
    if (isBlacklistedHere(m.blacklist)) return false;
    return true;
  }

  function moduleStatusHere(id) {
    var m = config && config.modules[id];
    if (!m || !m.enabled) return { on: false, text: "已关闭" };
    if (isLocalAddress()) return { on: false, text: "本机地址已禁用" };
    if (isBlacklistedHere(config.globalBlacklist)) return { on: false, text: "全局黑名单" };
    if (isBlacklistedHere(m.blacklist)) return { on: false, text: "本模块黑名单" };
    return { on: true, text: "已启用" };
  }

  /* ==========================================================
   * 二、共享基础设施（Shadow DOM / Toast / 拖拽），供各模块复用
   * ========================================================== */
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function ensureShadowRoot() {
    if (shadow) return shadow;
    var hostEl = document.getElementById(HOST_ID);
    if (!hostEl) {
      hostEl = document.createElement("div");
      hostEl.id = HOST_ID;
      hostEl.style.cssText =
        "display:block;position:fixed;left:0;top:0;width:100%;height:100%;" +
        "margin:0;padding:0;border:0;background:transparent;" +
        "pointer-events:none;overflow-anchor:none;z-index:2147483647;";
      (document.documentElement || document.body).appendChild(hostEl);
      shadow = hostEl.attachShadow({ mode: "open" });
      buildStyles(shadow);
      buildToast(shadow);
      buildPanel(shadow);
    } else if (hostEl.shadowRoot) {
      shadow = hostEl.shadowRoot;
    }
    return shadow;
  }

  // 页面脚本若破坏了宿主/内部节点，滚动时自动重建。
  // 重建一律发生在宿主内部：绝不把宿主从文档里摘下再插回——信息流类长页面
  // 在底部常有站点自己的滚动监听/滚动锚定，宿主摘挂会附带一次文档级增删，
  // 滚动位置容易被连带拖动。
  function ensureUI() {
    var hostEl = document.getElementById(HOST_ID);
    var intact = !!(hostEl && hostEl.shadowRoot && shadow &&
      ball && ball.isConnected && panel && panel.isConnected);
    if (intact) return;
    if (!hostEl) {
      shadow = null; ball = null; ringBar = null; panel = null; toastEl = null;
      ensureShadowRoot(); // 内部完成样式 / Toast / 面板构建
      mountAll();
      return;
    }
    var root = hostEl.shadowRoot;
    if (!root) {
      try { root = hostEl.attachShadow({ mode: "open" }); } catch (e) { return; }
    }
    while (root.firstChild) root.removeChild(root.firstChild);
    shadow = root;
    ball = null; ringBar = null; panel = null; toastEl = null;
    buildStyles(root);
    buildToast(root);
    buildPanel(root);
    mountAll();
  }

  function mountAll() {
    MODULE_DEFS.forEach(function (def) {
      try { if (def.mount) def.mount(shadow); } catch (e) { /* 单模块异常不拖垮整体 */ }
    });
    MODULE_DEFS.forEach(function (def) {
      try { if (def.refresh) def.refresh(); } catch (e) { /* ignore */ }
    });
  }

  function buildStyles(root) {
    var style = document.createElement("style");
    style.textContent = [
      "#wb-ball{position:fixed;width:44px;height:44px;border-radius:50%;background:#ffffff;",
      "box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;-webkit-user-select:none;",
      "touch-action:none;opacity:0;transform:translateY(14px) scale(.9);pointer-events:none;",
      "transition:opacity .25s ease,transform .25s ease;--accent:#2563eb;--ring-track:rgba(37,99,235,.18);}",
      "@media (prefers-color-scheme: dark){#wb-ball{background:#1f2937;--accent:#60a5fa;",
      "--ring-track:rgba(96,165,250,.25);box-shadow:0 4px 14px rgba(0,0,0,.5);}}",
      "#wb-ball.visible{opacity:.88;transform:translateY(0) scale(1);pointer-events:auto;}",
      "#wb-ball.visible:hover{opacity:1;transform:scale(1.06);}",
      "#wb-ball.dragging{transition:none;opacity:1;transform:scale(1.08);cursor:grabbing;}",
      "#wb-ball svg{position:absolute;inset:0;width:100%;height:100%;}",
      "#wb-ball .ring-track{fill:none;stroke:var(--ring-track);stroke-width:3;}",
      "#wb-ball .ring-bar{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;}",
      "#wb-ball .arrow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
      "font-size:19px;font-weight:700;color:var(--accent);line-height:1;padding-bottom:1px;}",
      "#wb-ball .gear{position:absolute;right:-3px;bottom:-3px;width:17px;height:17px;border-radius:50%;",
      "background:var(--accent);color:#fff;font-size:10px;line-height:17px;text-align:center;",
      "opacity:0;transition:opacity .2s ease;pointer-events:auto;}",
      "#wb-ball.visible:hover .gear{opacity:1;}",

      ".wb-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;",
      "align-items:center;justify-content:center;pointer-events:auto;z-index:1;}",
      ".wb-overlay.open{display:flex;}",
      ".wb-panel{width:min(520px,92vw);max-height:86vh;overflow:auto;background:#ffffff;color:#1f2937;",
      "border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}",
      "@media (prefers-color-scheme: dark){.wb-panel{background:#111827;color:#e5e7eb;}}",
      ".wb-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;",
      "border-bottom:1px solid rgba(128,128,128,.2);position:sticky;top:0;background:inherit;}",
      ".wb-title{font-size:15px;font-weight:700;}",
      ".wb-close{border:0;background:transparent;color:inherit;font-size:14px;cursor:pointer;",
      "padding:4px 8px;border-radius:6px;}",
      ".wb-close:hover{background:rgba(128,128,128,.15);}",
      ".wb-body{padding:6px 18px 2px;}",
      ".wb-body section{margin:14px 0;}",
      ".wb-body h3{margin:0 0 8px;font-size:13px;font-weight:700;opacity:.85;display:flex;",
      "align-items:center;gap:8px;flex-wrap:wrap;}",
      ".wb-body h3 .wb-chip{margin-left:auto;}",
      ".wb-check{display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:400;}",
      ".wb-host{font-family:Consolas,Monaco,monospace;font-size:12px;",
      "background:rgba(128,128,128,.12);padding:2px 6px;border-radius:4px;}",
      ".wb-chip{font-size:12px;padding:2px 8px;border-radius:999px;font-weight:600;}",
      ".wb-chip.on{background:#dcfce7;color:#15803d;}",
      ".wb-chip.off{background:#fee2e2;color:#b91c1c;}",
      "@media (prefers-color-scheme: dark){.wb-chip.on{background:rgba(34,197,94,.2);color:#4ade80;}",
      ".wb-chip.off{background:rgba(239,68,68,.2);color:#f87171;}}",
      ".wb-btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}",
      ".wb-panel textarea{width:100%;min-height:72px;font:12px/1.6 Consolas,Monaco,monospace;",
      "color:inherit;background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.3);",
      "border-radius:8px;padding:8px 10px;resize:vertical;outline:none;box-sizing:border-box;}",
      ".wb-panel textarea.small{min-height:44px;}",
      ".wb-panel textarea:focus{border-color:#2563eb;}",
      ".wb-hint{font-size:12px;opacity:.6;line-height:1.7;margin:10px 0 4px;}",
      ".wb-hint code,.wb-body code{font-family:Consolas,Monaco,monospace;}",
      ".wb-footer{display:flex;align-items:center;gap:8px;padding:12px 18px;",
      "border-top:1px solid rgba(128,128,128,.2);position:sticky;bottom:0;background:inherit;}",
      ".wb-spacer{flex:1;}",
      ".wb-btn{border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;",
      "padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;}",
      ".wb-btn:hover{background:rgba(128,128,128,.12);}",
      ".wb-primary{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600;}",
      ".wb-primary:hover{background:#1d4ed8;}",
      ".wb-toast{position:fixed;left:50%;bottom:42px;transform:translateX(-50%) translateY(16px);",
      "background:rgba(17,24,39,.92);color:#f9fafb;font-size:13px;padding:8px 16px;border-radius:999px;",
      "opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease;z-index:2;max-width:80vw;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}",
      ".wb-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}"
    ].join("\n");
    root.appendChild(style);
  }

  // 通用拖拽：拖动结束回调 onDrop(left, top)，未拖动（视为点击）则执行 onClick。
  // 判定「点击」必须同时满足：主键按下 → 同一个 pointerId 抬起 → 位移未超阈值 →
  // 按住时间够短 → 按下与抬起之间页面没滚动过。任一条不满足都不触发 onClick，
  // 避免滑动页面 / 指针捕获残留把「一次普通抬起」误判成「点悬浮球 → 回到顶部」。
  var DRAG_THRESHOLD = 5;  // px，超过即视为拖动
  var CLICK_MAX_MS = 600;  // 按下到抬起的最长间隔，超时视为长按不算点击

  function makeDraggable(elem, onClick, onDrop) {
    var dragging = false, moved = false;
    var pointerId = null, pressAt = 0, pressScrollSeq = 0;
    var sx = 0, sy = 0, startLeft = 0, startTop = 0;

    function release() {
      var id = pointerId;
      dragging = false; moved = false; pointerId = null;
      elem.classList.remove("dragging");
      if (id !== null && elem.hasPointerCapture && elem.hasPointerCapture(id)) {
        try { elem.releasePointerCapture(id); } catch (e) { /* ignore */ }
      }
    }

    elem.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.isPrimary === false) return; // 只认主指针的左键
      dragging = true; moved = false;
      pointerId = e.pointerId;
      pressAt = Date.now(); pressScrollSeq = scrollSeq;
      sx = e.clientX; sy = e.clientY;
      var rect = elem.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      // 悬浮球的按下/抬起不再冒泡给页面：站点常在整个 document 上挂手势与
      // 「点击空白处」逻辑，阴影树事件冒泡出去会被当成一次页面交互
      e.preventDefault();
      e.stopPropagation();
      try { elem.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    elem.addEventListener("pointermove", function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      moved = true;
      e.stopPropagation();
      elem.classList.add("dragging");
      var w = elem.offsetWidth || BALL_SIZE;
      var h = elem.offsetHeight || BALL_SIZE;
      var left = clamp(startLeft + dx, 4, Math.max(4, window.innerWidth - w - 4));
      var top = clamp(startTop + dy, 4, Math.max(4, window.innerHeight - h - 4));
      elem.style.left = left + "px";
      elem.style.top = top + "px";
    });

    elem.addEventListener("pointerup", function (e) {
      if (!dragging || e.pointerId !== pointerId) return; // 只接受同一次按下的抬起
      var wasMoved = moved;
      var heldMs = Date.now() - pressAt;
      var scrolled = scrollSeq !== pressScrollSeq;
      var rect = elem.getBoundingClientRect();
      release();
      e.stopPropagation();
      if (wasMoved) {
        if (onDrop) onDrop(Math.round(rect.left), Math.round(rect.top));
        return;
      }
      if (scrolled || heldMs > CLICK_MAX_MS) return; // 滑动/长按不算点击
      if (onClick) onClick();
    });

    elem.addEventListener("pointercancel", function () {
      if (dragging) release();
    });
    // 捕获丢失 / 窗口失焦时指针抬起事件可能永远收不到，
    // 必须复位，否则 dragging 会一直挂着，后续任意一次抬起都会被当成点击
    elem.addEventListener("lostpointercapture", function () {
      if (dragging) release();
    });
    window.addEventListener("blur", function () {
      if (dragging) release();
    });

    elem.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
  }

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  /* ---------------- Toast ---------------- */
  function buildToast(root) {
    toastEl = el("div", "wb-toast");
    root.appendChild(toastEl);
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2000);
  }

  /* ==========================================================
   * 三、模块：回到顶部悬浮球（配置命名空间 modules.backToTop）
   * ========================================================== */
  function buildBall(root) {
    ball = el("div");
    ball.id = "wb-ball";
    ball.innerHTML =
      '<svg viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle class="ring-track" cx="22" cy="22" r="' + RING_RADIUS + '"></circle>' +
      '<circle class="ring-bar" cx="22" cy="22" r="' + RING_RADIUS + '" transform="rotate(-90 22 22)"></circle>' +
      "</svg>" +
      '<div class="arrow">↑</div>' +
      '<div class="gear" title="设置（或右键悬浮球）">⚙</div>';
    ringBar = ball.querySelector(".ring-bar");
    ringBar.style.strokeDasharray = String(RING_LEN);
    ringBar.style.strokeDashoffset = String(RING_LEN);
    root.appendChild(ball);

    var gear = ball.querySelector(".gear");
    gear.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    gear.addEventListener("click", function (e) { e.stopPropagation(); openPanel(); });
    makeDraggable(ball, scrollToTop, function (left, top) {
      config.modules.backToTop.btnPos = { left: left, top: top };
      saveConfig();
    });
  }

  function scrollToTop() {
    // 已经在顶部时不做任何事，避免误触时白跑一次平滑滚动（也会打断用户正在进行的滚动）
    if ((window.pageYOffset || document.documentElement.scrollTop || 0) < 2) return;
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  function applyBallPos() {
    if (!ball) return;
    var pos = config.modules.backToTop.btnPos ||
      { left: window.innerWidth - BALL_SIZE - 36, top: Math.round(window.innerHeight * 0.72) };
    ball.style.left = clamp(pos.left, 4, Math.max(4, window.innerWidth - BALL_SIZE - 4)) + "px";
    ball.style.top = clamp(pos.top, 4, Math.max(4, window.innerHeight - BALL_SIZE - 4)) + "px";
  }

  var rafPending = false;
  function ballOnScroll() {
    ensureUI();
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      updateBallState();
    });
  }

  function updateBallState() {
    if (!ball || !ringBar) return;
    var doc = document.documentElement;
    var y = window.pageYOffset || doc.scrollTop || 0;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    var p = clamp(y / max, 0, 1);
    ringBar.style.strokeDashoffset = String(RING_LEN * (1 - p));
    var show = isModuleEnabledHere("backToTop") && y > (config.modules.backToTop.showThreshold || 200);
    ball.classList.toggle("visible", show);
  }

  defineModule({
    id: "backToTop",
    label: "回到顶部悬浮球",
    icon: "⬆️",
    defaults: { showThreshold: 200, btnPos: null },
    mount: function (root) { buildBall(root); applyBallPos(); },
    refresh: function () { applyBallPos(); updateBallState(); },
    onScroll: function () { ballOnScroll(); },
    onResize: function () { applyBallPos(); },
    renderSettings: function (box) {
      box.appendChild(panelActionButton("reset-ball", "重置悬浮球位置"));
    }
  });

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
    defaults: {},
    mount: function () { hookBiliRoute(); },
    refresh: function () { onRouteRefresh(); }
  });

  /* ==========================================================
   * 五、模块：雪球隐藏右侧栏并拉宽正文（配置命名空间 modules.xueqiuWide）
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

  defineModule({
    id: "xueqiuWide",
    label: "雪球隐藏右侧栏",
    icon: "📈",
    defaults: { middleWidth: 0 }, // 中间栏宽度 px；0 = 自动拉满
    mount: function () { startXqWide(); applyXqWide(); },
    refresh: function () { applyXqWide(); },
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

  /* ==========================================================
   * 六、模块：X（推特）隐藏右侧栏（配置命名空间 modules.xSidebarHide）
   * ----------------------------------------------------------
   * X 桌面版是三栏布局：左侧导航 header[role=banner]、中间主栏
   * [data-testid="primaryColumn"]、右侧栏 [data-testid="sidebarColumn"]
   * （搜索框 / 订阅 Premium / 有什么新鲜事 / 推荐关注等）。
   * 右侧栏整体隐藏后 flex 布局自动回流，主栏位置与内容不变；这些
   * data-testid 由 React 组件稳定输出，改版后依旧有效，因此用纯 CSS
   * 一次注入驱动，无需定时扫描与几何识别（零运行时开销）。
   * 面板可把主栏宽度改为固定像素（0 = 保持 X 默认）：隐藏侧栏后宽屏下
   * 正文仍被限制在 600px，右侧会留下大片空白，按需拉宽即可。
   * 模块关闭或黑名单生效时移除样式表，立即还原原状。
   * ========================================================== */
  var X_STYLE_ID = "wb-x-sidebar-style";

  // x.com 与旧域名 twitter.com（含子域）
  function isXHost() {
    var h = location.hostname || "";
    return h === "x.com" || h.slice(-6) === ".x.com" ||
           h === "twitter.com" || h.slice(-12) === ".twitter.com";
  }

  function applyXSidebarHide() {
    if (!isXHost()) return; // 其他站点零开销
    var existing = document.getElementById(X_STYLE_ID);
    if (!isModuleEnabledHere("xSidebarHide")) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    if (!document.head) return;
    var rules = ['[data-testid="sidebarColumn"]{display:none!important;}'];
    var m = (config && config.modules.xSidebarHide) || {};
    var w = parseFloat(m.mainWidth);
    if (w > 0) {
      // X 的列布局由 flex 定宽（flex-basis），只写 width 会被 flex 基准覆盖，
      // 故同时给出 flex 简写：可伸可缩 + 基准 = w，配 max-width 兜住上限。
      rules.push('[data-testid="primaryColumn"]{width:' + w + 'px!important;' +
        "max-width:" + w + "px!important;flex:1 1 " + w + 'px!important;}');
    }
    var css = rules.join("\n");
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css; // 宽度改过才写，避免无意义回流
      return;
    }
    var style = document.createElement("style");
    style.id = X_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  defineModule({
    id: "xSidebarHide",
    label: "X（推特）隐藏右侧栏",
    icon: "🐦",
    defaults: { mainWidth: 0 }, // 主栏宽度 px；0 = 保持 X 默认
    mount: function () { applyXSidebarHide(); },
    refresh: function () { applyXSidebarHide(); },
    renderSettings: function (box) {
      var label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;";
      label.textContent = "主栏宽度 (px，0=X 默认)：";
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = "1600";
      inp.step = "10";
      inp.style.cssText = "width:90px;";
      inp.setAttribute("data-mod-setting", "xSidebarHide");
      inp.setAttribute("data-setting-key", "mainWidth");
      label.appendChild(inp);
      box.appendChild(label);
    }
  });

  /* ==========================================================
   * 七、设置面板（按已注册模块自动生成区块）
   * ========================================================== */
  function panelActionButton(act, text) {
    var b = el("button", "wb-btn");
    b.setAttribute("data-act", act);
    b.textContent = text;
    return b;
  }

  function buildPanel(root) {
    panel = el("div", "wb-overlay");
    var card = el("div", "wb-panel");

    /* 头部 */
    var head = el("div", "wb-header");
    var title = el("span", "wb-title");
    title.textContent = "⚙️ 网页定制助手";
    var closeBtn = el("button", "wb-close");
    closeBtn.textContent = "✕";
    closeBtn.title = "关闭";
    closeBtn.setAttribute("data-act", "close");
    head.appendChild(title);
    head.appendChild(closeBtn);
    card.appendChild(head);

    /* 内容区 */
    var body = el("div", "wb-body");

    /* 全局黑名单（总闸） */
    var secG = el("section");
    var hG = el("h3");
    hG.appendChild(document.createTextNode("🌐 全局黑名单（禁用所有功能）· 当前网站 "));
    var hostCode = el("code", "wb-host");
    hG.appendChild(hostCode);
    secG.appendChild(hG);
    var taG = el("textarea");
    taG.id = "wb-global-blacklist";
    taG.spellcheck = false;
    taG.placeholder = "每行一条，例如：\nexample.com\n*.foo.com";
    secG.appendChild(taG);
    var rowG = el("div", "wb-btnrow");
    rowG.appendChild(panelActionButton("add-global", "＋ 把当前网站加入全局黑名单"));
    rowG.appendChild(panelActionButton("remove-global", "从全局黑名单移除"));
    secG.appendChild(rowG);
    body.appendChild(secG);

    /* 各模块区块（自动生成） */
    MODULE_DEFS.forEach(function (def) {
      var sec = el("section");
      sec.setAttribute("data-module", def.id);

      var h = el("h3");
      h.appendChild(document.createTextNode(def.icon + " " + def.label + " "));
      var lab = el("label", "wb-check");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-mod-enable", def.id);
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode("启用"));
      h.appendChild(lab);
      var chip = el("span", "wb-chip");
      chip.setAttribute("data-mod-chip", def.id);
      h.appendChild(chip);
      sec.appendChild(h);

      var ta = el("textarea", "small");
      ta.setAttribute("data-mod-blacklist", def.id);
      ta.spellcheck = false;
      ta.placeholder = "本模块黑名单（仅禁用本功能），每行一条";
      sec.appendChild(ta);

      var row = el("div", "wb-btnrow");
      row.appendChild(panelActionButton("add:" + def.id, "＋ 把当前网站加入本模块黑名单"));
      row.appendChild(panelActionButton("remove:" + def.id, "从本模块黑名单移除"));
      sec.appendChild(row);

      if (def.renderSettings) {
        var box = el("div", "wb-btnrow");
        try { def.renderSettings(box); } catch (e) { /* ignore */ }
        if (box.childNodes.length) sec.appendChild(box);
      }
      body.appendChild(sec);
    });

    /* 提示 */
    var hint = el("p", "wb-hint");
    hint.innerHTML =
      "黑名单规则支持：<code>example.com</code>（同时匹配所有子域名）、<code>*.example.com</code>、<code>*</code>（全部网站）。" +
      "<b>全局黑名单</b>内的网站禁用所有功能；<b>模块黑名单</b>只禁用对应模块，互不影响。配置保存在 Tampermonkey 存储中。";
    body.appendChild(hint);

    card.appendChild(body);

    /* 底部 */
    var foot = el("div", "wb-footer");
    foot.appendChild(el("span", "wb-spacer"));
    foot.appendChild(panelActionButton("close", "取消"));
    var saveBtn = el("button", "wb-btn wb-primary");
    saveBtn.setAttribute("data-act", "save");
    saveBtn.textContent = "保存";
    foot.appendChild(saveBtn);
    card.appendChild(foot);

    panel.appendChild(card);
    root.appendChild(panel);

    /* 事件 */
    panel.addEventListener("mousedown", function (e) {
      if (e.target === panel) closePanel(); // 点击遮罩关闭
    });
    panel.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "save") saveFromPanel();
      else if (act === "close") closePanel();
      else if (act === "add-global") addHostToTextarea(taG);
      else if (act === "remove-global") removeHostFromTextarea(taG);
      else if (act.indexOf("add:") === 0) addHostToTextarea(moduleTa(act.slice(4)));
      else if (act.indexOf("remove:") === 0) removeHostFromTextarea(moduleTa(act.slice(4)));
      else if (act === "reset-ball") {
        config.modules.backToTop.btnPos = null;
        saveConfig(); applyBallPos(); updateBallState();
        toast("已重置悬浮球位置");
      }
    });
  }

  function moduleTa(id) {
    return panel.querySelector('textarea[data-mod-blacklist="' + id + '"]');
  }

  // 快捷操作只写入对应文本框，点「保存」后统一生效
  function addHostToTextarea(ta) {
    var host = location.hostname;
    if (!ta || !host) return;
    var lines = parseLines(ta.value);
    var exists = lines.some(function (p) { return hostMatchesPattern(host, p); });
    if (!exists) lines.push(host);
    ta.value = lines.join("\n");
    toast("已写入，点击「保存」生效");
  }

  function removeHostFromTextarea(ta) {
    if (!ta) return;
    var host = location.hostname;
    ta.value = parseLines(ta.value).filter(function (p) {
      return !hostMatchesPattern(host, p);
    }).join("\n");
    toast("已移除，点击「保存」生效");
  }

  function parseLines(text) {
    var seen = {}, out = [];
    String(text || "").split(/\n+/).forEach(function (line) {
      var t = line.trim().toLowerCase();
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out;
  }

  function openPanel() {
    if (!config) return;
    ensureShadowRoot();
    panel.querySelector("#wb-global-blacklist").value = (config.globalBlacklist || []).join("\n");
    MODULE_DEFS.forEach(function (def) {
      var m = config.modules[def.id] || {};
      var cb = panel.querySelector('input[data-mod-enable="' + def.id + '"]');
      if (cb) cb.checked = m.enabled !== false;
      var ta = moduleTa(def.id);
      if (ta) ta.value = (m.blacklist || []).join("\n");
      var d = def.defaults || {};
      for (var k in d) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        var inp = panel.querySelector(
          '[data-mod-setting="' + def.id + '"][data-setting-key="' + k + '"]');
        if (inp) inp.value = (m[k] !== undefined) ? m[k] : d[k];
      }
    });
    refreshSiteStatus();
    panel.classList.add("open");
  }

  function closePanel() {
    if (panel) panel.classList.remove("open");
  }

  function refreshSiteStatus() {
    if (!panel) return;
    var hostEl = panel.querySelector(".wb-host");
    if (hostEl) hostEl.textContent = location.hostname || "(未知)";
    MODULE_DEFS.forEach(function (def) {
      var chip = panel.querySelector('[data-mod-chip="' + def.id + '"]');
      if (!chip) return;
      var st = moduleStatusHere(def.id);
      chip.textContent = st.text;
      chip.className = "wb-chip " + (st.on ? "on" : "off");
    });
  }

  function saveFromPanel() {
    if (!config) return;
    config.globalBlacklist = parseLines(panel.querySelector("#wb-global-blacklist").value);
    MODULE_DEFS.forEach(function (def) {
      var m = config.modules[def.id] || (config.modules[def.id] = {});
      var cb = panel.querySelector('input[data-mod-enable="' + def.id + '"]');
      m.enabled = !cb || cb.checked;
      var ta = moduleTa(def.id);
      m.blacklist = ta ? parseLines(ta.value) : (m.blacklist || []);
      var d = def.defaults || {};
      for (var k in d) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        var inp = panel.querySelector(
          '[data-mod-setting="' + def.id + '"][data-setting-key="' + k + '"]');
        if (!inp) continue;
        var v = parseFloat(inp.value);
        m[k] = isNaN(v) ? d[k] : v;
      }
    });
    saveConfig();
    MODULE_DEFS.forEach(function (def) {
      try { if (def.refresh) def.refresh(); } catch (e) { /* ignore */ }
    });
    refreshSiteStatus();
    toast("设置已保存");
  }

  /* ==========================================================
   * 八、初始化
   * ========================================================== */
  function init() {
    try {
      var ver = (typeof GM_info === "object" && GM_info && GM_info.script) ? GM_info.script.version : "?";
      console.log("[网页定制助手] v" + ver + " 已加载");
    } catch (e) { /* 无 GM_info 时忽略 */ }
    config = loadConfig();
    ensureShadowRoot();
    mountAll();

    window.addEventListener("scroll", function () {
      scrollSeq++;
      lastScrollAt = Date.now();
      MODULE_DEFS.forEach(function (def) {
        try { if (def.onScroll) def.onScroll(); } catch (e) { /* ignore */ }
      });
    }, { passive: true });
    window.addEventListener("resize", function () {
      MODULE_DEFS.forEach(function (def) {
        try { if (def.onResize) def.onResize(); } catch (e) { /* ignore */ }
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel && panel.classList.contains("open")) closePanel();
    });
  }

  GM_registerMenuCommand("↑️ 回到顶部", function () { scrollToTop(); });
  GM_registerMenuCommand("⚙️ 设置 / 管理黑名单", function () { openPanel(); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ==========================================================
   * 扩展点：如何添加新的功能模块（模块间互不干扰）
   * ----------------------------------------------------------
   * defineModule({
   *   id: "yourFeature",             // 模块唯一 ID（配置命名空间）
   *   label: "功能名称",              // 面板显示名
   *   icon: "🔧",                    // 面板显示图标
   *   defaults: { yourSetting: 1 },  // 模块专属默认配置（自动隔离存储与迁移）
   *   mount: function (shadowRoot) { /* 构建模块 UI (注释内避免嵌套) *\/ },
   *   refresh: function () { /* 配置变化/重建后刷新状态 *\/ },
   *   onScroll: function () {},      // 可选：页面滚动钩子
   *   onResize: function () {},      // 可选：窗口缩放钩子
   *   renderSettings: function (box) { /* 面板里追加模块专属设置控件 *\/ }
   * });
   *
   * 模块内判定是否生效：isModuleEnabledHere("yourFeature")
   *   = 模块开关开启 && 不在全局黑名单 && 不在本模块黑名单
   * 面板的「启用开关 + 模块黑名单」区块会自动生成，无需修改面板代码。
   * ========================================================== */
})();
