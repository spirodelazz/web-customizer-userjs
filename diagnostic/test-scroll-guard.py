"""验证「防页面自动跳顶」模块：模拟站点重渲染导致的高度塌陷，看位置是否被还原

用法：
    docker cp web-customizer.user.js webpool:/tmp/wb.user.js
    docker cp diagnostic/test-scroll-guard.py webpool:/tmp/test_guard.py
    docker exec webpool python /tmp/test_guard.py

做法：滚到底部后把页面主体 display:none 约 250ms 再恢复，复刻"内容塌陷 →
scrollTop 被夹到 0 → 内容回来但位置没回来"的时序，然后看 2s 后的 scrollY。
"""
import json

from patchright.sync_api import sync_playwright

URL = "https://www.xueqiu.com/u/9089343523"

US_STUBS = """
window.GM_getValue = function (k, d) { return d; };
window.GM_setValue = function () {};
window.GM_registerMenuCommand = function () {};
window.GM_info = { script: { version: "repro" } };
window.unsafeWindow = window;
"""

COLLAPSE = """
() => {
  const el = document.querySelector('#app') || document.body.firstElementChild;
  window.__collapsed = el;
  window.__disp = el.style.display;
  el.style.display = 'none';
  return {sh: document.documentElement.scrollHeight, y: Math.round(window.scrollY)};
}
"""

RESTORE = """
() => {
  const el = window.__collapsed;
  el.style.display = window.__disp || '';
  return {sh: document.documentElement.scrollHeight, y: Math.round(window.scrollY)};
}
"""

TOAST = """
() => {
  const host = document.getElementById('wb-customizer-shadow-host');
  const sr = host && host.shadowRoot;
  const t = sr && sr.querySelector('.wb-toast');
  return t ? {text: t.textContent, shown: t.classList.contains('show')} : null;
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
    with open("/tmp/wb.user.js", encoding="utf-8") as f:
        ctx.add_init_script(US_STUBS + "\n" + f.read())

    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(9000)

    for _ in range(10):
        page.evaluate("window.scrollBy(0, 700)")
        page.wait_for_timeout(300)
    page.wait_for_timeout(800)
    before = page.evaluate("Math.round(window.scrollY)")
    print("滚动到底部后 y =", before)

    print("塌陷:", page.evaluate(COLLAPSE))
    page.wait_for_timeout(260)
    print("塌陷后 y =", page.evaluate("Math.round(window.scrollY)"))
    print("恢复:", page.evaluate(RESTORE))
    page.wait_for_timeout(1800)

    after = page.evaluate("Math.round(window.scrollY)")
    print("恢复内容 1.8s 后 y =", after)
    print("toast:", json.dumps(page.evaluate(TOAST), ensure_ascii=False))
    print("场景1 站点塌陷:", "PASS 位置已还原" if abs(after - before) < 80 else "FAIL 停在 %s" % after)

    # 场景2：用户主动点击后归零（等价于点站内「回到顶部」/按 Home），不应还原
    page.evaluate("document.body.click(); window.scrollTo(0, 0)")
    page.wait_for_timeout(1500)
    y2 = page.evaluate("Math.round(window.scrollY)")
    print("场景2 点击后回顶: y =", y2, "->", "PASS 未干预" if y2 < 60 else "FAIL 被还原")

    # 面板模块数（确认新模块已注册）
    chips = page.evaluate("""() => {
      const sr = document.getElementById('wb-customizer-shadow-host').shadowRoot;
      return Array.from(sr.querySelectorAll('[data-mod-chip]')).map(e => e.getAttribute('data-mod-chip'));
    }""")
    print("面板模块:", chips)
    browser.close()
