import sys, json
from playwright.sync_api import sync_playwright

US = open(r"E:/Project/Github-Repository/web-customizer-userjs/web-customizer.user.js", encoding="utf-8").read()

STUB = """
window.__store = {};
window.GM_getValue = function (k, d) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : d; };
window.GM_setValue = function (k, v) { __store[k] = v; };
window.GM_registerMenuCommand = function () {};
"""

HOME = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;font:14px/1.5 sans-serif}
.AnonymousHome_container_2te{display:flex;gap:20px;padding:20px;align-items:flex-start}
.AnonymousHome_home__col--lf_2Fg{flex:1 1 auto;min-width:0;background:#fafafa;height:1200px}
.AnonymousHome_home__col--rt_sQH{flex:0 0 300px;width:300px;height:900px;background:#eee}
</style></head><body>
<script>%s</script>
<div id="app"><div class="AnonymousHome_container_2te">
<div class="AnonymousHome_home__col--lf_2Fg">feed</div>
<div class="AnonymousHome_home__col--rt_sQH">side</div>
</div></div>
<script src="/us.js"></script></body></html>""" % STUB

ARTICLE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0}
</style></head><body>
<script>%s</script>
<div id="app"><div class="Article_layout_wrap">
<div class="Article_card_row" style="display:flex;width:1200px;margin:0 auto">
<div class="Article_text" style="flex:1 1 auto;height:600px;background:#fafafa">text</div>
<div class="Article_imgcard" style="flex:0 0 300px;height:400px;background:#eee">img</div>
</div></div></div>
<script src="/us.js"></script></body></html>""" % STUB

STOCK = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0}
</style></head><body>
<script>%s</script>
<div id="app"><div class="page-wrap">
<div class="layout" style="display:flex;width:1300px;margin:0 auto">
<div class="main-col" style="flex:1 1 auto;height:800px;background:#fafafa">main</div>
<div class="side-col" style="flex:0 0 300px;height:600px;background:#eee">side</div>
</div></div></div>
<script src="/us.js"></script></body></html>""" % STUB

SCROLL = """<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0} #tall{height:14000px;background:linear-gradient(#fff,#ddd)}
</style></head><body>
<script>%s</script>
<div id="tall"></div>
<script src="/us.js"></script></body></html>""" % STUB

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  -> " + str(detail) if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_page(html, url):
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        def handle(route):
            u = route.request.url
            if u.endswith("/us.js"):
                route.fulfill(status=200, content_type="application/javascript", body=US)
            elif url in u or u.rstrip("/") == url.rstrip("/"):
                route.fulfill(status=200, content_type="text/html", body=html)
            else:
                route.fulfill(status=404, body="")
        ctx.route("**/*", handle)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url, wait_until="load")
        return ctx, pg

    # ---- A: 首页精确规则 ----
    ctx, pg = new_page(HOME, "https://xueqiu.com/")
    pg.wait_for_timeout(2500)
    st = pg.evaluate("""() => {
      const rt = document.querySelector('[class*="home__col--rt"]');
      const lf = document.querySelector('[class*="home__col--lf"]');
      const c = document.querySelector('.AnonymousHome_container_2te');
      return { rtDisplay: getComputedStyle(rt).display, lfW: Math.round(lf.getBoundingClientRect().width),
               scope: c.getAttribute('data-wb-xq-scope'),
               styleExists: !!document.getElementById('wb-xq-wide-style') };
    }""")
    check("A1 首页右栏被隐藏", st["rtDisplay"] == "none", st)
    check("A2 首页主栏拉宽", st["lfW"] > 1200, st["lfW"])
    check("A3 容器已打 scope 标记", st["scope"] == "1", st["scope"])

    # ---- A4: 关闭模块必须还原 ----
    pg.evaluate("""() => {
      const host = document.getElementById('wb-customizer-shadow-host');
      const ball = host.shadowRoot.getElementById('wb-ball');
      ball.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}));
      const cb = host.shadowRoot.querySelector('input[data-mod-enable="xueqiuWide"]');
      cb.checked = false;
      cb.dispatchEvent(new Event('change', {bubbles: true}));
      host.shadowRoot.querySelector('button[data-act="save"]').click();
    }""")
    pg.wait_for_timeout(500)
    st2 = pg.evaluate("""() => {
      const rt = document.querySelector('[class*="home__col--rt"]');
      return { rtDisplay: getComputedStyle(rt).display,
               styleExists: !!document.getElementById('wb-xq-wide-style'),
               dynExists: !!document.getElementById('wb-xq-wide-dyn'),
               scope: document.querySelector('.AnonymousHome_container_2te').getAttribute('data-wb-xq-scope') };
    }""")
    check("A4 关闭后右栏恢复显示", st2["rtDisplay"] != "none", st2)
    check("A5 关闭后样式表已移除", not st2["styleExists"] and not st2["dynExists"], st2)
    check("A6 关闭后 scope 标记已清除", st2["scope"] is None, st2)

    # A7: 重新启用应再次注入
    pg.evaluate("""() => {
      const host = document.getElementById('wb-customizer-shadow-host');
      const cb = host.shadowRoot.querySelector('input[data-mod-enable="xueqiuWide"]');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', {bubbles: true}));
      host.shadowRoot.querySelector('button[data-act="save"]').click();
    }""")
    pg.wait_for_timeout(1500)
    st3 = pg.evaluate("""() => ({
      rtDisplay: getComputedStyle(document.querySelector('[class*="home__col--rt"]')).display,
      styleExists: !!document.getElementById('wb-xq-wide-style')
    })""")
    check("A7 重新启用后规则再次生效", st3["rtDisplay"] == "none" and st3["styleExists"], st3)
    ctx.close()

    # ---- B: 正文内两列不得被当成主栏+侧栏 ----
    ctx, pg = new_page(ARTICLE, "https://xueqiu.com/a/article")
    pg.wait_for_timeout(2500)
    b = pg.evaluate("""() => ({
      done: document.querySelectorAll('[data-wb-xq-done]').length,
      side: document.querySelectorAll('[data-wb-xq-side]').length,
      imgDisplay: getComputedStyle(document.querySelector('.Article_imgcard')).display
    })""")
    check("B1 正文内两列未被误标记", b["done"] == 0 and b["side"] == 0, b)
    check("B2 正文内的图片卡未被隐藏", b["imgDisplay"] != "none", b["imgDisplay"])
    ctx.close()

    # ---- C: 非正文页的几何兜底仍然生效 ----
    ctx, pg = new_page(STOCK, "https://xueqiu.com/S/SH600519")
    pg.wait_for_timeout(3000)
    c = pg.evaluate("""() => ({
      done: document.querySelectorAll('[data-wb-xq-done]').length,
      sideDisplay: getComputedStyle(document.querySelector('.side-col')).display,
      mainW: Math.round(document.querySelector('.main-col').getBoundingClientRect().width),
      mainMark: document.querySelector('.main-col').getAttribute('data-wb-xq-main')
    })""")
    check("C1 兜底识别到主栏+侧栏", c["done"] == 1, c)
    check("C2 兜底侧栏被隐藏", c["sideDisplay"] == "none", c["sideDisplay"])
    check("C3 兜底主栏拉宽", c["mainW"] > 1200, c["mainW"])

    # ---- F: 布局翻转（SPA 复用节点后主栏变窄）应自动撤销标记 ----
    pg.evaluate("""() => {
      const m = document.querySelector('.main-col'), s = document.querySelector('.side-col');
      m.style.flex = '0 0 300px'; s.style.flex = '0 0 900px'; s.style.width = '900px';
    }""")
    pg.wait_for_timeout(3000)
    f = pg.evaluate("""() => ({
      done: document.querySelectorAll('[data-wb-xq-done]').length,
      sideDisplay: getComputedStyle(document.querySelector('.side-col')).display
    })""")
    check("F1 布局翻转后标记被撤销", f["done"] == 0, f)
    check("F2 布局翻转后不再隐藏任何列", f["sideDisplay"] != "none", f["sideDisplay"])
    ctx.close()

    # ---- G: 响应式断点把主栏改成 flex 后，flow-root 不得残留 ----
    ctx, pg = new_page(STOCK, "https://xueqiu.com/S/SH000001")
    pg.wait_for_timeout(3000)
    g0 = pg.evaluate("document.querySelector('.main-col').getAttribute('data-wb-xq-main')")
    pg.evaluate("""() => document.querySelector('.main-col').style.display = 'flex'""")
    pg.evaluate("window.dispatchEvent(new Event('resize'))")
    pg.wait_for_timeout(3500)
    g = pg.evaluate("""() => ({
      mark: document.querySelector('.main-col').getAttribute('data-wb-xq-main'),
      display: getComputedStyle(document.querySelector('.main-col')).display
    })""")
    check("G1 初始按 block 打标", g0 == "block", g0)
    check("G2 主栏改为 flex 后标记降级", g["mark"] == "1", g)
    check("G3 主栏 display 未被 flow-root 覆盖", g["display"] == "flex", g["display"])
    ctx.close()

    # ---- D: 防跳顶误判 / 真跳顶 ----
    ctx, pg = new_page(SCROLL, "https://xueqiu.com/u/123456")
    pg.wait_for_timeout(2500)
    pg.evaluate("window.scrollTo(0, 5000)")
    pg.wait_for_timeout(400)
    # D1: 直接跳回顶部（文档高度不变）——不应被抢回
    pg.evaluate("window.scrollTo(0, 0)")
    pg.wait_for_timeout(700)
    y1 = pg.evaluate("window.scrollY")
    check("D1 普通回到顶部不被抢回", y1 == 0, y1)
    # D2: 文档塌陷把位置夹回 0——应还原
    pg.evaluate("window.scrollTo(0, 5000)")
    pg.wait_for_timeout(400)
    pg.evaluate("""() => {
      const t = document.getElementById('tall');
      t.style.height = '800px';
      setTimeout(() => { t.style.height = '14000px'; }, 80);
    }""")
    pg.wait_for_timeout(1200)
    y2 = pg.evaluate("window.scrollY")
    check("D2 文档塌陷导致的跳顶被还原", y2 > 4500, y2)
    ctx.close()

    check("E1 无未捕获异常", len(errors) == 0, errors[:3])
    browser.close()

fails = [r for r in results if not r[1]]
print("\n%d/%d passed" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
