"""在真实登录态下验证雪球模块：个股页 / 用户页的右栏隐藏与误标记。

为什么必须带登录态：这两个页面在匿名无头浏览器里会落到阿里云 WAF 的拦截页，
测不到真实 DOM。wepool 的 profile 里已经有真人登录的会话，直接复用。

为什么必须有头：同一份 cookie，headless 会被 WAF 拦（实测 title「访问提示 - 雪球」），
headless=False 才是「我的首页 - 雪球」。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".." / ".." / "Agent-Tools" / "webpool"))

from playwright.sync_api import sync_playwright  # noqa: E402

US_PATH = ROOT / "web-customizer.user.js"
PROFILE = Path("E:/Project/Agent-Tools/webpool/.data/profiles/xueqiu")

STUB = """
window.__store = {};
window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(window.__store, k)
  ? window.__store[k] : d;
window.GM_setValue = (k, v) => { window.__store[k] = v; };
window.GM_registerMenuCommand = () => {};
window.GM_addStyle = (css) => { const s = document.createElement('style');
  s.textContent = css; document.head.appendChild(s); return s; };
"""

PROBE = """() => {
  const geo = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cls: String(el.className || '').slice(0, 46), w: Math.round(r.width),
             display: getComputedStyle(el).display, left: Math.round(r.left) };
  };
  const cols = [...document.querySelectorAll('[class*="col--rt"],[class*="col--right"],' +
    '[class*="home__col--"],[class*="user__col--"]')];
  const marks = [...document.querySelectorAll('[data-wb-xq-side],[data-wb-xq-main],[data-wb-xq-done]')]
    .map((e) => ({
      kind: e.hasAttribute('data-wb-xq-side') ? 'SIDE'
          : e.hasAttribute('data-wb-xq-main') ? 'MAIN' : 'DONE',
      cls: String(e.className || '').slice(0, 46),
      w: Math.round(e.getBoundingClientRect().width),
      display: getComputedStyle(e).display,
    }));
  const scope = [...document.querySelectorAll('[data-wb-xq-scope]')].map((e) => ({
    cls: String(e.className || '').slice(0, 46),
    w: Math.round(e.getBoundingClientRect().width),
    h: Math.round(e.getBoundingClientRect().height),
  }));
  return {
    title: document.title.slice(0, 40),
    url: location.pathname,
    cols: cols.map(geo).filter(Boolean).slice(0, 10),
    marks, scope,
    styles: ['wb-xq-wide-style', 'wb-xq-wide-dyn'].filter((id) => !!document.getElementById(id)),
    login: document.body.innerText.includes('我的首页') || !!document.querySelector('[class*="user__col--left"]'),
  };
}"""


def main() -> int:
    urls = sys.argv[1:] or [
        "https://xueqiu.com/S/SH600519",
        "https://xueqiu.com/u/5124430882",
        "https://xueqiu.com/",
    ]
    us = US_PATH.read_text(encoding="utf-8")
    results = []
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            channel="chrome",
            headless=False,  # WAF 会拦 headless，实测结论
            no_viewport=True,
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
        )
        ctx.add_init_script(STUB)
        for url in urls:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            row = {"url": url}
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(4000)
                row["before"] = page.evaluate(PROBE)
                page.add_script_tag(content=us)
                page.wait_for_timeout(4500)
                row["after"] = page.evaluate(PROBE)
            except Exception as exc:
                row["error"] = str(exc)[:120]
            results.append(row)
            try:
                page.close()
            except Exception:
                pass
        ctx.close()

    for row in results:
        print("=" * 78)
        print("URL:", row["url"])
        if "error" in row:
            print("  ERROR:", row["error"])
            continue
        b, a = row["before"], row["after"]
        print(f"  标题 {a['title']!r} | 登录态 {a['login']} | 样式表 {a['styles']}")
        print("  右栏/列 before:", json.dumps(b["cols"], ensure_ascii=False))
        print("  右栏/列 after :", json.dumps(a["cols"], ensure_ascii=False))
        print("  scope:", json.dumps(a["scope"], ensure_ascii=False))
        print("  marks:", json.dumps(a["marks"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
