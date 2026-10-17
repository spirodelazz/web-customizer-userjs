"""雪球用户主页「滑到底部自动跳回顶部」复现脚本（在 webpool 容器里跑）

用法（Windows 宿主机）：
    docker cp diagnostic/xq-bottom-scroll-repro.py webpool:/tmp/xq_repro.py
    docker exec webpool python /tmp/xq_repro.py

输出：每步滚动后的 y / scrollHeight，出现跳顶时打印当时的大批量 DOM 移除事件。
"""
import json
import sys

from patchright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.xueqiu.com/u/9089343523"

INSTRUMENT = """
() => {
  window.__log = [];
  window.__lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (window.__lastY - y > 300) {
      window.__log.push({ev: 'jump', from: Math.round(window.__lastY), to: Math.round(y),
                         sh: document.documentElement.scrollHeight, t: Date.now()});
    }
    window.__lastY = y;
  }, {passive: true});
  window.__obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.removedNodes.length >= 4) {
        window.__log.push({ev: 'mut', removed: m.removedNodes.length, added: m.addedNodes.length,
          target: String(m.target.className || m.target.tagName).slice(0, 70),
          sy: Math.round(window.scrollY), sh: document.documentElement.scrollHeight, t: Date.now()});
      }
    }
  });
  window.__obs.observe(document.body, {childList: true, subtree: true});
}
"""

with sync_playwright() as p:
    # 启动参数与 webpool 的 stealth 档一致：去自动化特征 + 重写无头 UA，
    # 否则雪球会直接返回「访问提示」验证页。容器内没有真 Chrome，用自带 chromium。
    args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    browser = None
    for channel in ("chromium", None):
        try:
            browser = p.chromium.launch(headless=True, channel=channel, args=args)
            break
        except Exception as exc:  # noqa: BLE001
            print("launch(%s) 失败：%s" % (channel, exc))
    if browser is None:
        raise SystemExit("浏览器启动失败")
    major = (browser.version or "0").split(".")[0]
    ua = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/%s.0.0.0 Safari/537.36" % major)
    ctx = browser.new_context(no_viewport=True, locale="zh-CN", user_agent=ua)
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(8000)
    print("title:", page.title())
    print("host:", page.evaluate("location.href"))
    print("scrollHeight:", page.evaluate("document.documentElement.scrollHeight"))
    page.evaluate(INSTRUMENT)

    jumped = False
    for i in range(40):
        page.evaluate("window.scrollBy(0, 700)")
        page.wait_for_timeout(700)
        y = page.evaluate("Math.round(window.scrollY)")
        sh = page.evaluate("document.documentElement.scrollHeight")
        print("step %02d: y=%s sh=%s" % (i, y, sh))
        if y <= 1 and i > 2:
            print("  -> 触发跳顶")
            jumped = True
            break

    page.wait_for_timeout(2500)
    log = page.evaluate("window.__log") or []
    print("jumped:", jumped, "events:", len(log))
    print(json.dumps(log[-40:], ensure_ascii=False, indent=1))
    browser.close()
