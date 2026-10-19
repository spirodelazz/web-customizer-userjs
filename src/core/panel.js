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

    /* 头部：标题 + 当前网站 */
    var head = el("div", "wb-header");
    var title = el("span", "wb-title");
    title.textContent = "⚙️ 网页定制助手";
    var hostPill = el("code", "wb-host-pill");
    hostPill.textContent = location.hostname || "(未知)";
    hostPill.title = "当前网站";
    var closeBtn = el("button", "wb-close");
    closeBtn.textContent = "✕";
    closeBtn.title = "关闭";
    closeBtn.setAttribute("data-act", "close");
    head.appendChild(title);
    head.appendChild(hostPill);
    head.appendChild(closeBtn);
    card.appendChild(head);

    /* 内容区 */
    var body = el("div", "wb-body");

    /* 各模块区块（自动生成） */
    MODULE_DEFS.forEach(function (def) {
      var sec = el("section");
      sec.setAttribute("data-module", def.id);

      /* 模块头：图标徽章 + 名称 + 状态标签 + 开关 */
      var modHead = el("div", "wb-mod-head");
      var badge = el("span", "wb-mod-icon");
      badge.textContent = def.icon;
      var titleWrap = el("div", "wb-mod-title");
      var modName = el("span", "wb-mod-name");
      modName.textContent = def.label;
      titleWrap.appendChild(modName);
      var chip = el("span", "wb-chip");
      chip.setAttribute("data-mod-chip", def.id);
      titleWrap.appendChild(chip);
      var lab = el("label", "wb-switch");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-mod-enable", def.id);
      cb.setAttribute("aria-label", "启用 " + def.label);
      lab.appendChild(cb);
      lab.appendChild(el("i"));
      modHead.appendChild(badge);
      modHead.appendChild(titleWrap);
      modHead.appendChild(lab);
      sec.appendChild(modHead);

      if (def.hosts) {
        // 站点专属模块不设黑名单：能填的域名只有作用域自身，等价于模块开关
        var scope = el("div", "wb-scope");
        scope.textContent = "作用域：" + def.hosts.join("、");
        sec.appendChild(scope);
      } else {
        var ta = el("textarea", "small");
        ta.setAttribute("data-mod-blacklist", def.id);
        ta.spellcheck = false;
        ta.placeholder = "本模块黑名单（仅禁用本功能），每行一条";
        sec.appendChild(ta);

        var row = el("div", "wb-btnrow");
        row.appendChild(panelActionButton("add:" + def.id, "＋ 把当前网站加入本模块黑名单"));
        row.appendChild(panelActionButton("remove:" + def.id, "从本模块黑名单移除"));
        sec.appendChild(row);
      }

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
      "<b>模块黑名单</b>只禁用对应模块，互不影响；站点专属模块自动限定作用域名，仅在声明的网站内生效。配置保存在 Tampermonkey 存储中。";
    body.appendChild(hint);

    card.appendChild(body);

    /* 底部 */
    var foot = el("div", "wb-footer");
    var footHint = el("span", "wb-foot-hint");
    footHint.setAttribute("data-role", "foot-hint");
    footHint.textContent = "更改后点击「保存」生效";
    foot.appendChild(footHint);
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
    panel.addEventListener("input", function () { setDirtyHint(true); });
    panel.addEventListener("change", function () { setDirtyHint(true); });
    panel.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "save") saveFromPanel();
      else if (act === "close") closePanel();
      else if (act.indexOf("add:") === 0) addHostToTextarea(moduleTa(act.slice(4)));
      else if (act.indexOf("remove:") === 0) removeHostFromTextarea(moduleTa(act.slice(4)));
      else if (act === "reset-ball") {
        config.modules.backToTop.btnPos = null;
        saveConfig(); applyBallPos(); updateBallState();
        setDirtyHint(false);
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

  // 底部状态提示：任何控件改动即标记「未保存」，保存 / 重开后复位
  function setDirtyHint(dirty) {
    var h = panel && panel.querySelector('[data-role="foot-hint"]');
    if (!h) return;
    h.textContent = dirty ? "● 有未保存的更改" : "更改后点击「保存」生效";
    h.classList.toggle("dirty", dirty);
  }

  function openPanel() {
    if (!config) return;
    ensureShadowRoot();
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
    setDirtyHint(false);
    refreshSiteStatus();
    panel.classList.add("open");
  }

  function closePanel() {
    if (panel) panel.classList.remove("open");
  }

  function refreshSiteStatus() {
    if (!panel) return;
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
    MODULE_DEFS.forEach(function (def) {
      var m = config.modules[def.id] || (config.modules[def.id] = {});
      var cb = panel.querySelector('input[data-mod-enable="' + def.id + '"]');
      m.enabled = !cb || cb.checked;
      if (!def.hosts) {
        var ta = moduleTa(def.id);
        m.blacklist = ta ? parseLines(ta.value) : (m.blacklist || []);
      }
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
    setDirtyHint(false);
    MODULE_DEFS.forEach(function (def) {
      try { if (def.refresh) def.refresh(); } catch (e) { /* ignore */ }
    });
    refreshSiteStatus();
    toast("设置已保存");
  }

