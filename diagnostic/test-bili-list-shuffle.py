"""在真实 /list/ 列表播放页上验证「随机播放」注入与连播接管。

流程：注入构建产物（GM_* 打桩）→ 等按钮出现 → 点一下 → 等全量列表读完并写入
sessionStorage → 读顺序前几项 → 把视频跳到结尾触发 ended → 断言页面按打乱顺序
跳到下一集。匿名会话可能偶发 geetest，脚本用 DOM click 触发，不受浮层拦截。

用法：python diagnostic/test-bili-list-shuffle.py [完整URL]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
US_PATH = ROOT / "web-customizer.user.js"
URL = sys.argv[1] if len(sys.argv) > 1 else \
    "https://www.bilibili.com/list/3493093607213343?sort_field=pubtime&bvid=BV1H8sd64E7b"

STUBS = """
window.__store = {};
window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(window.__store, k)
  ? window.__store[k] : d;
window.GM_setValue = (k, v) => { window.__store[k] = v; };
window.GM_registerMenuCommand = () => {};
window.GM_addStyle = (css) => { const s = document.createElement('style');
  s.textContent = css; document.head.appendChild(s); return s; };
window.GM_info = { script: { version: 'test' } };
window.unsafeWindow = window;
"""


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome",
                                    args=["--autoplay-policy=no-user-gesture-required"])
        ctx = browser.new_context(viewport={"width": 1600, "height": 900},
                                  user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                             "AppleWebKit/537.36 (KHTML, like Gecko) "
                                             "Chrome/131.0.0.0 Safari/537.36")
        ctx.add_init_script(STUBS)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(6000)
        page.add_script_tag(content=US_PATH.read_text(encoding="utf-8"))
        page.wait_for_timeout(3000)

        info = page.evaluate("""() => {
          const btn = document.getElementById('wb-list-shuffle-btn');
          const hdr = btn && btn.parentElement;
          const order = btn && hdr ? [...hdr.children].map(e => (e.className||'').toString().slice(0,40)) : [];
          return {
            btn: !!btn,
            text: btn ? btn.textContent.trim() : null,
            parentCls: hdr ? (hdr.className || '').toString() : null,
            siblings: order,
            rect: btn ? btn.getBoundingClientRect().toJSON() : null,
            count: (document.querySelector('.list-count') || {}).textContent,
          };
        }""")
        print("注入结果:", json.dumps(info, ensure_ascii=False))

        # 点「随机播放」（DOM click，绕开可能的 geetest 浮层）
        page.evaluate("document.getElementById('wb-list-shuffle-btn').click()")
        state = None
        for _ in range(60):  # 最多等 60s（1930 条约 20s）
            page.wait_for_timeout(1000)
            state = page.evaluate(
                "() => { const raw = sessionStorage.getItem('wb_bili_list_shuffle_v1');"
                " return raw ? JSON.parse(raw) : null; }")
            if state:
                break
        if not state:
            print("!! 10s 内未写入顺序状态（可能读数失败）")
            print("toast:", page.evaluate("document.querySelector('.wb-toast') && document.querySelector('.wb-toast').textContent"))
            browser.close()
            return

        print("状态:", json.dumps({"mid": state.get("mid"), "n": len(state.get("order") or []),
                                   "head": (state.get("order") or [])[:3],
                                   "active": state.get("active")}, ensure_ascii=False))
        btn_after = page.evaluate("""() => {
          const b = document.getElementById('wb-list-shuffle-btn');
          return {text: b.textContent.trim(), color: b.style.color, title: b.title};
        }""")
        print("按钮状态:", json.dumps(btn_after, ensure_ascii=False))

        # 触发 ended，验证按打乱顺序跳下一集
        expect_next = state["order"][1]
        page.evaluate("""() => { const v = document.querySelector('video');
          if (!v) return; v.muted = true; v.currentTime = Math.max(0, (v.duration || 0) - 1.2); v.play(); }""")

        # 轮询等待跳转：跳转会销毁执行上下文，evaluate 抛错属正常，直接看 URL
        ok = False
        for i in range(30):
            page.wait_for_timeout(1000)
            try:
                if expect_next in page.url:
                    ok = True
                    break
            except Exception:  # noqa: BLE001 — 导航中断上下文
                continue
        print("期望下一集:", expect_next)
        print("实际 URL  :", page.url)
        print("连播接管:", ("通过（约 %ds）" % (i + 1)) if ok else "失败")
        if not ok:
            try:
                print("当前 active key:", page.evaluate(
                    "(() => { const a = document.querySelector('.siglep-active');"
                    " const w = a && a.closest('.action-list-item-wrap');"
                    " return w && w.getAttribute('data-key'); })()"))
            except Exception:  # noqa: BLE001
                pass
        print("页面异常:", errors[:3])
        browser.close()


if __name__ == "__main__":
    main()
