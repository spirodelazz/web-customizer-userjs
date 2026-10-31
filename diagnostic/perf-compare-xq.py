import subprocess, sys
from playwright.sync_api import sync_playwright

NEW = open(r"E:/Project/Github-Repository/web-customizer-userjs/web-customizer.user.js", encoding="utf-8").read()
OLD = subprocess.run(["git", "-C", r"E:/Project/Github-Repository/web-customizer-userjs",
                      "show", "HEAD:web-customizer.user.js"],
                     capture_output=True, text=True, encoding="utf-8").stdout

STUB = """
window.__store = {};
window.GM_getValue = function (k, d) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : d; };
window.GM_setValue = function (k, v) { __store[k] = v; };
window.GM_registerMenuCommand = function () {};
window.__rects = 0;
(function () {
  var g = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { window.__rects++; return g.call(this); };
})();
"""

FEED = """<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:14px/1.5 sans-serif}
.feed{display:flex;gap:20px;width:1300px;margin:0 auto;padding:20px;box-sizing:border-box}
.feed-main{flex:1 1 auto;background:#fafafa}
.card{height:120px;border-bottom:1px solid #eee}
.feed-side{display:none}
</style></head><body>
<script>%s</script>
<div id="app"><div class="wrap"><div class="feed">
<div class="feed-main" id="main"></div>
<div class="feed-side">side</div>
</div></div></div>
<script>
  var m = document.getElementById('main');
  for (var i = 0; i < 600; i++) {
    var d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = '<div class="t">标题 ' + i + '</div><div class="b"><span>作者</span><span>评论 ' + i + '</span></div>';
    m.appendChild(d);
  }
</script>
<script src="/us.js"></script></body></html>""" % STUB

def run(script, label):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.route("**/*", lambda r: r.fulfill(status=200, content_type="application/javascript", body=script)
                  if r.request.url.endswith("/us.js")
                  else r.fulfill(status=200, content_type="text/html", body=FEED))
        pg = ctx.new_page()
        pg.goto("https://xueqiu.com/", wait_until="load")
        pg.wait_for_timeout(1200)
        r1 = pg.evaluate("({ rects: window.__rects, marked: document.querySelectorAll('[data-wb-xq-done]').length })")
        pg.wait_for_timeout(3000)
        r2 = pg.evaluate("({ rects: window.__rects, marked: document.querySelectorAll('[data-wb-xq-done]').length })")
        b.close()
        print("%-6s 1.2s: rect=%5d marked=%d | 4.2s: rect=%5d marked=%d"
              % (label, r1["rects"], r1["marked"], r2["rects"], r2["marked"]))
        return r1, r2

run(OLD, "旧版")
run(NEW, "新版")
