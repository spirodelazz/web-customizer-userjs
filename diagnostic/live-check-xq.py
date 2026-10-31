"""线上真实页面巡检：把构建产物注入雪球页面，检查右栏是否隐藏、有没有误标记。

用法（需要 playwright）：
    python diagnostic/live-check-xq.py                       # 默认几个公开页面
    python diagnostic/live-check-xq.py https://xueqiu.com/…  # 指定页面

注意：个股页 / 用户页在无登录态的无头浏览器里可能落到「滑动验证」页，
这种情况脚本不做任何动作是正确行为（输出里 rt=None、marks=[]）。
"""
import sys
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
US = (ROOT / "web-customizer.user.js").read_text(encoding="utf-8")

STUB = (
    "window.__store={};"
    "window.GM_getValue=(k,d)=>Object.prototype.hasOwnProperty.call(__store,k)?__store[k]:d;"
    "window.GM_setValue=(k,v)=>{__store[k]=v;};"
    "window.GM_registerMenuCommand=()=>{};"
)

DEFAULT_URLS = [
    "https://xueqiu.com/5124430882/414827075",  # 帖子详情页
    "https://xueqiu.com/",                      # 首页（匿名/登录同域）
]

JS = """() => {
  const rt = document.querySelector('[class*="home__col--rt"],[class*="user__col--right"]');
  const modal = document.querySelector('[class*="newLogin_modal"]');
  const tags = e => e.hasAttribute('data-wb-xq-side') ? 'SIDE'
    : e.hasAttribute('data-wb-xq-main') ? 'MAIN' : 'DONE';
  return {
    path: location.pathname,
    rtClass: rt ? String(rt.className).slice(0, 48) : null,
    rtDisplay: rt ? getComputedStyle(rt).display : null,
    marks: [...document.querySelectorAll('[data-wb-xq-side],[data-wb-xq-main],[data-wb-xq-done]')]
      .map(e => tags(e) + ':' + String(e.className).slice(0, 40)),
    loginModal: modal ? getComputedStyle(modal).display : 'n/a'
  };
}"""


def main(urls):
    fails = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for url in urls:
            ctx = browser.new_context(
                viewport={"width": 1400, "height": 900}, locale="zh-CN",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            ctx.add_init_script(STUB)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:100]))
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(7000)
                before = page.evaluate(JS)
                page.add_script_tag(content=US)
                page.wait_for_timeout(4000)
                after = page.evaluate(JS)

                hidden = after["rtDisplay"] == "none"
                clean = not after["marks"] or all(m.startswith("DONE") for m in after["marks"])
                ok = hidden and clean and not errors
                fails += 0 if ok else 1
                print(("[PASS] " if ok else "[FAIL] ") + url)
                print("       右栏: %s -> %s (%s)" % (before["rtDisplay"], after["rtDisplay"], after["rtClass"]))
                print("       标记: %s | 登录弹窗: %s | 异常: %s"
                      % (after["marks"] or "无", after["loginModal"], errors[:1] or "无"))
            except Exception as exc:  # 网络异常 / 反爬拦截
                fails += 1
                print("[FAIL] " + url + "  ->  " + str(exc)[:120])
            ctx.close()
        browser.close()
    print("\n%d/%d 通过" % (len(urls) - fails, len(urls)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or DEFAULT_URLS))
