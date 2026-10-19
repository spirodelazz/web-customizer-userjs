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
    hosts: ["x.com", "twitter.com"],
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

