"""用户主页右栏闪烁的现场采样（需要人工过一次滑块）。

用户主页对自动化有单独的滑屏验证，无头/自动请求一律被拦。这里打开一个可见窗口，
让人把滑块拖过去（验证 cookie 会留在 profile 里），通过后自动重载页面、
注入构建产物、边滚边采样，输出右栏 display 的时间线。

用法：python diagnostic/watch-user-page-scroll.py [URL] [profile名]
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
US = (ROOT / "web-customizer.user.js").read_text(encoding="utf-8")
PROFILE = Path("E:/Project/Agent-Tools/webpool/.data/profiles") / (sys.argv[2] if len(sys.argv) > 2 else "xueqiu")
URL = sys.argv[1] if len(sys.argv) > 1 else "https://xueqiu.com/u/5742069252"

STUB = """
window.__store = {};
window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(window.__store, k)
  ? window.__store[k] : d;
window.GM_setValue = (k, v) => { window.__store[k] = v; };
window.GM_registerMenuCommand = () => {};
"""

PROBE = """() => {
  const r = (el) => { const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height),
             top: Math.round(b.top), left: Math.round(b.left) }; };
  let col = document.querySelector('[class*="user__col--right"],[class*="user__col--rt"],' +
                                  '[class*="home__col--rt"]');
  let via = col ? 'class' : null;
  if (!col) {
    const hits = [...document.querySelectorAll('div,aside,section')].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width >= 200 && b.width <= 560 && b.height >= 150
        && /他的认证|用户推荐|热门话题|热股榜/.test(e.textContent || '');
    });
    // 取最内层（子元素最少）的那个，避免拿到包着整个页面的祖先
    if (hits.length) { col = hits.sort((a, b) => a.children.length - b.children.length)[0]; via = 'text'; }
  }
  const scope = [...document.querySelectorAll('[data-wb-xq-scope]')];
  return {
    y: Math.round(window.scrollY), docH: document.documentElement.scrollHeight,
    title: document.title.slice(0, 20),
    colClass: col ? String(col.className || '').slice(0, 56) : null,
    via, display: col ? getComputedStyle(col).display : null,
    pos: col ? getComputedStyle(col).position : null,
    rect: col ? r(col) : null,
    parentClass: col && col.parentElement ? String(col.parentElement.className || '').slice(0, 44) : null,
    inScope: col ? !!(col.closest && col.closest('[data-wb-xq-scope]')) : null,
    scopeCount: scope.length,
    scopeClasses: scope.map((e) => String(e.className || '').slice(0, 36)),
    sides: document.querySelectorAll('[data-wb-xq-side]').length,
    mains: document.querySelectorAll('[data-wb-xq-main]').length,
    dones: document.querySelectorAll('[data-wb-xq-done]').length,
  };
}"""


def fmt(s: dict) -> str:
    return (f"y={s['y']:5} docH={s['docH']:6} disp={str(s['display']):6} pos={str(s['pos']):8} "
            f"inScope={str(s['inScope']):5} scope={s['scopeCount']} side={s['sides']} "
            f"done={s['dones']} via={s['via']}")


def main() -> int:
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), channel="chrome", headless=False,
            locale="zh-CN", timezone_id="Asia/Shanghai",
        )
        ctx.add_init_script(STUB)
        ctx.add_init_script(US)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)

        # 等人工过滑块：标题不再是「滑动验证」且出现了列元素
        print("等待人机验证通过（窗口里把滑块拖过去）…", flush=True)
        deadline = time.time() + 300
        solved = False
        while time.time() < deadline:
            try:
                st = page.evaluate(
                    "() => ({ t: document.title, cols: document.querySelectorAll('[class*=\"col--\"]').length })"
                )
            except Exception:
                st = {"t": "", "cols": 0}
            if "滑动验证" not in (st.get("t") or "") and st.get("cols", 0) > 0:
                solved = True
                break
            time.sleep(1.5)
        if not solved:
            print("超时：没检测到验证通过，退出", flush=True)
            ctx.close()
            return 1
        print("验证已通过，重载页面开始采样", flush=True)

        page.reload(wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)
        first = page.evaluate(PROBE)
        print("加载后:", first["colClass"], "|", fmt(first))
        print("  scope:", first["scopeClasses"])
        print("  父级:", first["parentClass"], "| 矩形:", first["rect"])

        prev_key = None
        flips = 0
        for step in range(1, 21):
            page.evaluate("() => window.scrollBy(0, 800)")
            page.wait_for_timeout(350)
            s = page.evaluate(PROBE)
            key = (s["display"], s["inScope"], s["scopeCount"], s["sides"], s["dones"])
            if prev_key is not None and key != prev_key:
                flips += 1
                print(f"  >>> 状态变化 [{step:02d}] {fmt(s)}  col={str(s['colClass'])[:34]}")
            elif s["display"] != "none":
                print(f"  !!! 右栏可见 [{step:02d}] {fmt(s)}")
            prev_key = key
        print("状态翻转:", flips)
        ctx.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
