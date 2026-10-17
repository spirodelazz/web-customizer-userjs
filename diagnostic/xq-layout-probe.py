"""雪球页面布局探针：查看 xueqiuWide 的 CSS 在指定页面命中了哪些元素、命中后页面高度变化

用法：
    docker cp diagnostic/xq-layout-probe.py webpool:/tmp/probe.py
    docker exec webpool python /tmp/probe.py [URL]
"""
import json
import sys

from patchright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.xueqiu.com/u/9089343523"

PROBE = """
() => {
  const sel = ['[class*="home__col--rt"]', '[class*="home__col--lf"]',
               '[class*="user__col--middle"]', '.seekball-container'];
  const info = {};
  sel.forEach(s => {
    info[s] = Array.from(document.querySelectorAll(s)).slice(0, 4).map(e => {
      const r = e.getBoundingClientRect();
      return {cls: String(e.className || '').slice(0, 90), w: Math.round(r.width),
              h: Math.round(r.height), top: Math.round(r.top),
              parent: String((e.parentElement && e.parentElement.className) || '').slice(0, 60)};
    });
  });
  info.before = {scrollHeight: document.documentElement.scrollHeight,
                 y: Math.round(window.scrollY),
                 bodyH: document.body.scrollHeight};
  return info;
}
"""

APPLY = """
() => {
  const css = [
    '[class*="home__col--rt"]{display:none!important;}',
    '[class*="home__col--lf"]{width:auto!important;max-width:none!important;flex:1 1 auto!important;float:none!important;}',
    '[class*="user__col--middle"] > div{max-width:none!important;}',
    '[class*="user__col--middle"]{width:auto!important;max-width:none!important;flex:1 1 auto!important;float:none!important;}',
    '.seekball-container{display:none!important;}'
  ].join('\\n');
  const st = document.createElement('style');
  st.id = 'probe-xq-css';
  st.textContent = css;
  document.head.appendChild(st);
  return {after: document.documentElement.scrollHeight};
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
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(9000)
    print("title:", page.title(), "url:", page.url)
    print(json.dumps(page.evaluate(PROBE), ensure_ascii=False, indent=1))

    page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    page.wait_for_timeout(1200)
    print("bottom y:", page.evaluate("Math.round(window.scrollY)"))
    print(json.dumps(page.evaluate(APPLY), ensure_ascii=False))
    page.wait_for_timeout(1200)
    print("after css -> y:", page.evaluate("Math.round(window.scrollY)"),
          "sh:", page.evaluate("document.documentElement.scrollHeight"))
    browser.close()
