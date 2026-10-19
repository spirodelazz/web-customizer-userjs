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
    guardSelfAt = Date.now(); // 告知「防页面自动跳顶」这是主动回顶，别还原
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

