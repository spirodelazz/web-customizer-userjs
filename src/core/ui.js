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

