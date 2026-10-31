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

# 帖子详情页：线上实测结构（article__page > article_out_container >
# 主内容列 + home__col--rt），正文列里还嵌了一张「左文右图」卡片
ARTICLE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;font:14px/1.5 sans-serif}
.article__page{width:1150px;margin:0 auto}
.article_out_container{display:flex;width:1060px;margin:0 auto;align-items:flex-start;gap:20px}
.article__main{flex:1 1 auto;min-width:0;height:1200px;background:#fff}
.post_card{display:flex;width:760px;height:600px;background:#fafafa}
.post_text{flex:1 1 auto;height:400px}
.post_img{flex:0 0 300px;height:300px;background:#eee}
.home__col--rt{flex:0 0 280px;width:280px;height:900px;background:#f7f7f7}
</style></head><body>
<script>%s</script>
<div id="app"><div class="article__page"><div class="article_out_container harf_margin">
<div class="article__main"><div class="post_card">
<div class="post_text">text</div><div class="post_img">img</div>
</div></div>
<div class="home__col--rt">hot</div>
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

# 登录版首页：左侧导航 + 中间信息流 + 右侧热门话题（user__col--* 这一套 CSS Module）
LOGIN = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;font:14px/1.5 sans-serif}
.UserHome_container_a{display:flex;width:1120px;margin:0 auto;align-items:flex-start}
.UserHome_user__col--left{flex:0 0 180px;width:180px;height:900px;background:#f2f6ff}
.UserHome_user__col--middle{flex:0 0 570px;width:570px;height:1400px;background:#fff}
.UserHome_user__col--right{flex:0 0 360px;width:360px;height:900px;background:#fafafa}
.UserHome_container_b{display:flex;width:1120px;margin:0 auto;align-items:flex-start}
.UserHome_container_b .nav{flex:0 0 180px;height:900px;background:#f2f6ff}
.UserHome_container_b .wrap{flex:1 1 auto;display:flex}
.UserHome_container_b .m{flex:1 1 auto;height:1400px;background:#fff}
.UserHome_container_b .aside{flex:0 0 360px;width:360px}
.UserHome_container_b .r{height:900px;background:#fafafa}
</style></head><body>
<script>%s</script>
<div id="app">
  <div class="UserHome_container_a">
    <div class="UserHome_user__col--left">nav</div>
    <div class="UserHome_user__col--middle">feed</div>
    <div class="UserHome_user__col--right">hot</div>
  </div>
</div>
<script src="/us.js"></script></body></html>""" % STUB

# 同上，但右栏外面多套了一层窄 aside（考 xqFindScope 向上找容器）
LOGIN_WRAP = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0}
.UserHome_container_b{display:flex;width:1120px;margin:0 auto;align-items:flex-start}
.UserHome_container_b .nav{flex:0 0 180px;height:900px;background:#f2f6ff}
.UserHome_container_b .wrap{flex:1 1 auto;display:flex}
.UserHome_container_b .m{flex:1 1 auto;height:1400px;background:#fff}
.UserHome_container_b .aside{flex:0 0 360px;width:360px}
.UserHome_container_b .r{height:900px;background:#fafafa}
</style></head><body>
<script>%s</script>
<div id="app"><div class="UserHome_container_b">
  <div class="nav">nav</div>
  <div class="wrap"><div class="m">feed</div></div>
  <div class="aside"><div class="r"><div class="user__col--right">hot</div></div></div>
</div></div>
<script src="/us.js"></script></body></html>""" % STUB

# 用户主页：线上实测结构，容器 .profiles__main__container（960 宽）里放
# 主内容列 + .profiles__side（280 固定宽）。整页没有任何 col-- 类名。
# 左主栏浮动 + clearfix 撑开容器高度，与雪球实际排版一致
PROFILES = """<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:14px/1.5 sans-serif}
.container{width:960px;margin:0 auto}
.container::after{content:"";display:table;clear:both}
.profiles__main{float:left;width:680px;min-height:2000px;background:#fff}
.profiles__side{float:right;width:280px;min-height:640px;background:#f7f7f7}
.profiles__side__mod{height:260px;background:#eee;margin:10px}
</style></head><body>
<script>%s</script>
<div id="app"><div class="container profiles__main__container">
<div class="profiles__main"><div class="feed">posts</div></div>
<div class="profiles__side"><div class="recommend__users board profiles__side__mod">hot</div></div>
</div></div>
<script src="/us.js"></script></body></html>""" % STUB

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("  -> " + str(detail) if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_page(html, url, width=1400):
        ctx = browser.new_context(viewport={"width": width, "height": 900})
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

    # ---- B: 帖子详情页（线上真实结构）右栏要隐藏，正文内的两列卡片不能误伤 ----
    ctx, pg = new_page(ARTICLE, "https://xueqiu.com/5124430882/414827075")
    pg.wait_for_timeout(2500)
    b = pg.evaluate("""() => ({
      rt: getComputedStyle(document.querySelector('.home__col--rt')).display,
      scope: document.querySelector('.article_out_container').getAttribute('data-wb-xq-scope'),
      img: getComputedStyle(document.querySelector('.post_img')).display,
      sideMarks: document.querySelectorAll('[data-wb-xq-side]').length,
      mainW: Math.round(document.querySelector('.article__main').getBoundingClientRect().width)
    })""")
    check("B1 详情页右栏被隐藏", b["rt"] == "none" and b["scope"] == "1", b)
    check("B2 正文内两列卡片未被隐藏", b["img"] != "none" and b["sideMarks"] == 0, b)
    check("B3 详情页主内容列拉宽", b["mainW"] > 750, b["mainW"])
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

    # ---- H: 登录版首页（user__col--*）右栏隐藏 + 中间栏拉宽，左导航不动 ----
    ctx, pg = new_page(LOGIN, "https://xueqiu.com/")
    pg.wait_for_timeout(2500)
    h = pg.evaluate("""() => {
      const r = document.querySelector('.UserHome_user__col--right');
      const m = document.querySelector('.UserHome_user__col--middle');
      const l = document.querySelector('.UserHome_user__col--left');
      return { right: getComputedStyle(r).display,
               mW: Math.round(m.getBoundingClientRect().width),
               lW: Math.round(l.getBoundingClientRect().width),
               scope: document.querySelector('.UserHome_container_a').getAttribute('data-wb-xq-scope') };
    }""")
    check("H1 登录版首页右栏被隐藏", h["right"] == "none", h)
    check("H2 登录版首页中间栏拉宽", h["mW"] > 700, h["mW"])
    check("H3 左导航宽度未被动", h["lW"] == 180, h["lW"])
    check("H4 布局容器已打 scope", h["scope"] == "1", h["scope"])
    ctx.close()

    # ---- I: 右栏外多套一层窄 aside，作用域要向上找到真正的布局容器 ----
    ctx, pg = new_page(LOGIN_WRAP, "https://xueqiu.com/")
    pg.wait_for_timeout(2500)
    i = pg.evaluate("""() => ({
      right: getComputedStyle(document.querySelector('.user__col--right')).display,
      scope: document.querySelector('.UserHome_container_b').getAttribute('data-wb-xq-scope')
    })""")
    check("I1 嵌套窄容器下右栏仍被隐藏", i["right"] == "none" and i["scope"] == "1", i)
    ctx.close()

    # ---- J: 1920 宽屏下容器居中只占 58% 视口，规则仍要命中 ----
    ctx, pg = new_page(LOGIN, "https://xueqiu.com/", width=1920)
    pg.wait_for_timeout(2500)
    j = pg.evaluate("""() => ({
      right: getComputedStyle(document.querySelector('.UserHome_user__col--right')).display,
      mW: Math.round(document.querySelector('.UserHome_user__col--middle').getBoundingClientRect().width)
    })""")
    check("J1 宽屏下右栏被隐藏", j["right"] == "none", j)
    check("J2 宽屏下中间栏拉宽", j["mW"] > 900, j["mW"])
    ctx.close()

    # ---- K: 用户主页（profiles__* 命名，无 col-- 类名） ----
    # 窄视口 860：几何兜底的「从 body 往下每层 ≥900px」会整条断掉，
    # 只剩类名规则能救——这正是用户 DevTools 停靠时右栏露出来的真实条件
    ctx, pg = new_page(PROFILES, "https://xueqiu.com/u/5742069252", width=860)
    pg.wait_for_timeout(2500)
    k = pg.evaluate("""() => ({
      side: getComputedStyle(document.querySelector('.profiles__side')).display,
      scope: document.querySelector('.profiles__main__container').getAttribute('data-wb-xq-scope'),
      mainW: Math.round(document.querySelector('.profiles__main').getBoundingClientRect().width),
      bodyW: Math.round(document.body.getBoundingClientRect().width)
    })""")
    check("K1 窄视口下用户页侧栏被隐藏", k["side"] == "none", k)
    check("K2 用户页容器已打 scope 标记", k["scope"] == "1", k)
    check("K3 用户页主内容列拉宽", k["mainW"] > 900, k["mainW"])

    # K4: 站点重渲染换掉整个布局容器（scope 随之消失）→ 必须立刻自愈，不能等 500ms 防抖
    pg.evaluate("""() => {
      const old = document.querySelector('.profiles__main__container');
      const clone = old.cloneNode(true);
      clone.removeAttribute('data-wb-xq-scope');   // 重渲染出来的新容器没有我们的标记
      old.replaceWith(clone);
    }""")
    pg.wait_for_timeout(250)
    k4 = pg.evaluate("""() => ({
      side: getComputedStyle(document.querySelector('.profiles__side')).display,
      scope: document.querySelector('.profiles__main__container').getAttribute('data-wb-xq-scope')
    })""")
    check("K4 容器被重渲染后侧栏仍隐藏", k4["side"] == "none" and k4["scope"] == "1", k4)
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
