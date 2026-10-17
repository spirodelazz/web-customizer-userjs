"""带用户脚本复现雪球底部跳顶（在 webpool 容器里跑）

用法：
    docker cp web-customizer.user.js webpool:/tmp/wb.user.js
    docker cp diagnostic/repro-with-userscript.py webpool:/tmp/repro_real.py
    docker exec webpool python /tmp/repro_real.py [URL] [--no-userscript]

对比两种跑法（同一页面、同一滚动节奏）：
  带脚本  -> 若在底部跳顶，问题在脚本侧（重点看 data-wb-xq-* 标记）
  不带脚本 -> 若也跳顶，问题在站点侧
每步打印 y / scrollHeight，并在跳顶时输出此时的大批量 DOM 移除事件。
"""
import json
import sys

from patchright.sync_api import sync_playwright

args_argv = [a for a in sys.argv[1:] if not a.startswith("--")]
URL = args_argv[0] if args_argv else "https://www.xueqiu.com/u/9089343523"
WITH_SCRIPT = "--no-userscript" not in sys.argv

US_STUBS = """
window.GM_getValue = function (k, d) { return d; };
window.GM_setValue = function () {};
window.GM_registerMenuCommand = function () {};
window.GM_info = { script: { version: "repro" } };
window.unsafeWindow = window;
"""

INSTRUMENT = """
() => {
  window.__log = [];
  window.__lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (window.__lastY - y > 300) {
      window.__log.push({ev: 'jump', from: Math.round(window.__lastY), to: Math.round(y),
                         sh: document.documentElement.scrollHeight});
    }
    window.__lastY = y;
  }, {passive: true});
  window.__obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.removedNodes.length >= 3) {
        window.__log.push({ev: 'mut', removed: m.removedNodes.length, added: m.addedNodes.length,
          target: String(m.target.className || m.target.tagName).slice(0, 70),
          sy: Math.round(window.scrollY), sh: document.documentElement.scrollHeight});
      }
    }
  });
  window.__obs.observe(document.body, {childList: true, subtree: true});
}
"""

MARKS = """
() => {
  const names = ['data-wb-xq-side', 'data-wb-xq-main', 'data-wb-xq-done'];
  const out = {};
  names.forEach(n => {
    const els = document.querySelectorAll('[' + n + ']');
    out[n] = Array.from(els).slice(0, 6).map(e => ({
      tag: e.tagName, cls: String(e.className || '').slice(0, 70),
      h: Math.round(e.getBoundingClientRect().height)
    }));
  });
  out.host = !!document.getElementById('wb-customizer-shadow-host');
  out.ball = !!document.getElementById('wb-customizer-shadow-host');
  out.scrollHeight = document.documentElement.scrollHeight;
  return out;
}
"""

with sync_playwright() as p:
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    browser = None
    for channel in ("chromium", None):
        try:
            browser = p.chromium.launch(headless=True, channel=channel, args=launch_args)
            break
        except Exception as exc:  # noqa: BLE001
            print("launch(%s) 失败：%s" % (channel, exc))
    if browser is None:
        raise SystemExit("浏览器启动失败")

    major = (browser.version or "0").split(".")[0]
    ua = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/%s.0.0.0 Safari/537.36" % major)
    ctx = browser.new_context(no_viewport=True, locale="zh-CN", user_agent=ua)

    if WITH_SCRIPT:
        with open("/tmp/wb.user.js", encoding="utf-8") as f:
            code = f.read()
        ctx.add_init_script(US_STUBS + "\n" + code)
        print("mode: WITH userscript")
    else:
        print("mode: WITHOUT userscript")

    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(9000)
    print("title:", page.title())
    print("initial:", json.dumps(page.evaluate(MARKS), ensure_ascii=False))
    page.evaluate(INSTRUMENT)

    jumped = False
    for i in range(30):
        page.evaluate("window.scrollBy(0, 700)")
        page.wait_for_timeout(800)
        y = page.evaluate("Math.round(window.scrollY)")
        sh = page.evaluate("document.documentElement.scrollHeight")
        print("step %02d: y=%s sh=%s" % (i, y, sh))
        if y <= 1 and i > 2:
            print("  -> 触发跳顶")
            jumped = True
            break

    page.wait_for_timeout(2500)
    print("final:", json.dumps(page.evaluate(MARKS), ensure_ascii=False))
    log = page.evaluate("window.__log") or []
    print("jumped:", jumped, "events:", len(log))
    print(json.dumps(log[-30:], ensure_ascii=False, indent=1))
    browser.close()
