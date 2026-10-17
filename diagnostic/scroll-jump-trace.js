/* =====================================================================
 * 滚动跳顶追踪（临时诊断，控制台粘贴即用，不改动页面）
 * ---------------------------------------------------------------------
 * 用途：页面在滑到底部时“自己跳回顶部”时，抓出究竟是谁把滚动位置归零。
 * 用法：
 *   1. 出问题的页面按 F12 → Console；
 *   2. 粘贴本文件全文回车（会打印「[scroll-trace] 已启用 在 wx」）；
 *   3. 复现问题（滑到底部），把控制台里 [scroll] 开头的整段输出发出来。
 *
 * 拦截范围：window.scrollTo / Element.prototype.scrollTo / scrollBy /
 *          Element.scrollTop 赋值 / scrollIntoView / location.hash 赋值，
 *          外加一个“位置突然回退 400px 以上”的兜底告警。
 * 每条输出都带调用栈，能直接看出是站点脚本还是用户脚本干的。
 * 分析完刷新页面即恢复。
 * ===================================================================== */
(function () {
  if (window.__wbScrollTrace) { console.log("[scroll-trace] 已在运行"); return; }
  window.__wbScrollTrace = true;

  function trace(where, extra) {
    var st = (new Error().stack || "").split("\n").slice(2, 10).join("\n");
    console.log("%c[scroll] " + where, "color:#2563eb;font-weight:700",
      extra === undefined ? "" : extra, "\n" + st);
  }

  function isToTop(a) {
    if (typeof a === "object" && a) return a.top === 0;
    return false;
  }

  var origWindowScrollTo = window.scrollTo;
  window.scrollTo = function (a, b) {
    if (isToTop(a) || (a === 0 && b === 0)) trace("window.scrollTo → 0");
    return origWindowScrollTo.apply(this, arguments);
  };

  var ep = Element.prototype;
  var origElScrollTo = ep.scrollTo;
  ep.scrollTo = function (a, b) {
    if (isToTop(a) || (a === 0 && b === 0)) trace("Element.scrollTo → 0", this);
    return origElScrollTo.apply(this, arguments);
  };

  var origElScrollBy = ep.scrollBy;
  ep.scrollBy = function (a, b) {
    if (isToTop(a) && a.top <= -100) trace("Element.scrollBy 大幅上滚", this);
    return origElScrollBy.apply(this, arguments);
  };

  var origScrollIntoView = ep.scrollIntoView;
  ep.scrollIntoView = function () {
    trace("scrollIntoView", this);
    return origScrollIntoView.apply(this, arguments);
  };

  // scrollTop 是访问器属性：拦 setter 才能抓到 el.scrollTop = 0 这种写法
  var topDesc = Object.getOwnPropertyDescriptor(ep, "scrollTop");
  if (topDesc && topDesc.set) {
    Object.defineProperty(ep, "scrollTop", {
      configurable: true,
      enumerable: topDesc.enumerable,
      get: topDesc.get,
      set: function (v) {
        if (v === 0 && topDesc.get.call(this) > 200) trace("el.scrollTop = 0", this);
        return topDesc.set.call(this, v);
      }
    });
  }

  // location.hash / href 赋值同样会造成跳顶
  try {
    var loc = window.location;
    var hashDesc = null;
    var proto = Object.getPrototypeOf(loc);
    hashDesc = Object.getOwnPropertyDescriptor(proto, "hash");
    if (hashDesc && hashDesc.set) {
      Object.defineProperty(loc, "hash", {
        configurable: true,
        get: hashDesc.get,
        set: function (v) { trace("location.hash = " + v); return hashDesc.set.call(this, v); }
      });
    }
  } catch (e) { /* 部分页面锁定 location，忽略 */ }

  // 兜底：没有走上面任何 API 也会被这条抓到（例如站点自行重渲染导致位置丢失）
  var lastY = window.pageYOffset || 0;
  window.addEventListener("scroll", function () {
    var y = window.pageYOffset || 0;
    if (lastY - y > 400) {
      console.warn("[scroll] 位置突降 " + Math.round(lastY) + " → " + Math.round(y) +
        "（不是上面任何 API 触发，多半是站点重渲染/滚动容器被替换）");
    }
    lastY = y;
  }, { passive: true });

  console.log("[scroll-trace] 已启用（分析完刷新页面即可关闭）");
})();
