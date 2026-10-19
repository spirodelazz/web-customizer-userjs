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

