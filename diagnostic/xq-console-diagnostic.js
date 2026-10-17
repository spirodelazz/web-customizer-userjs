/* 雪球个股页诊断脚本：F12 → Console → 粘贴执行 → 结果自动复制到剪贴板 → 粘贴回对话 */
(function () {
  var out = { url: location.href, viewport: { w: innerWidth, h: innerHeight }, marks: [], hits: {}, chain: [] };

  function geo(n) {
    var r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    return { tag: n.tagName, cls: String(n.className || "").slice(0, 100),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, position: cs.position, float: cs.cssFloat, overflow: cs.overflowY };
  }

  /* 1) 用户脚本留下的标记（若有 = 启发式标记过；side 被 display:none） */
  document.querySelectorAll("[data-wb-xq-side],[data-wb-xq-main],[data-wb-xq-done]").forEach(function (n) {
    var g = geo(n);
    g.mark = n.getAttribute("data-wb-xq-side") ? "SIDE(隐藏)" :
             n.getAttribute("data-wb-xq-main") ? "main(拉宽)" : "done(容器)";
    out.marks.push(g);
  });

  /* 2) 精确选择器命中情况 */
  ["[class*='home__col--rt']", "[class*='home__col--lf']", "[class*='user__col--middle']",
   ".stock__main", ".stock__side", ".stock-links", ".container-lg", "[class*='user__container']",
   "[class*='AnonymousHome_container']"].forEach(function (sel) {
    var els = document.querySelectorAll(sel);
    out.hits[sel] = { count: els.length, first: els.length ? Array.prototype.map.call(els.length > 3 ? [els[0], els[1], els[2]] : els, geo) : null };
  });

  /* 3) 股票标题沿祖先链向上 10 层（定位正文被谁隐藏） */
  var anchor = document.querySelector(".stock__main") ||
               document.querySelector("[class*='stock-name']") ||
               document.querySelector(".stock-info");
  if (anchor) {
    var n = anchor, i = 0;
    while (n && n !== document.body && i < 10) { out.chain.push(geo(n)); n = n.parentElement; i++; }
  }
  var json = JSON.stringify(out, null, 1);
  console.log(json);
  try { copy(json); console.log("%c✓ 已复制到剪贴板，直接粘贴回对话即可", "color:green"); }
  catch (e) { console.log("copy() 不可用，请手动复制上方 JSON"); }
})();
