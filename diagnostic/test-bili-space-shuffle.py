"""验证 UP 主投稿页（space.bilibili.com/<mid>/upload/video）的「随机播放」注入。

匿名访问 arc/search 接口会间歇 412，脚本重试若干次直到视频网格渲染。
断言：按钮出现在「播放全部」右侧；点击后跳到 /list/ 列表页并带 #wb-shuffle。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
US_PATH = ROOT / "web-customizer.user.js"
SPACE = sys.argv[1] if len(sys.argv) > 1 else "https://space.bilibili.com/3493093607213343/upload/video"

STUBS = open(ROOT / "diagnostic" / "test-bili-list-shuffle.py", encoding="utf-8").read() \
    .split('STUBS = """')[1].split('"""')[0]


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        for attempt in range(1, 6):
            ctx = browser.new_context(viewport={"width": 1600, "height": 900},
                                      user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                                 "AppleWebKit/537.36 (KHTML, like Gecko) "
                                                 "Chrome/131.0.0.0 Safari/537.36")
            ctx.add_init_script(STUBS)
            page = ctx.new_page()
            page.goto("https://www.bilibili.com", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)
            page.goto(SPACE, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(7000)
            page.add_script_tag(content=US_PATH.read_text(encoding="utf-8"))
            page.wait_for_timeout(2500)
            info = page.evaluate("""() => {
              const btn = document.getElementById('wb-list-shuffle-btn');
              const playAll = document.querySelector('button.playall-btn');
              return {
                cards: document.querySelectorAll('.upload-video-card').length,
                playAll: !!playAll,
                btn: !!btn,
                text: btn ? btn.textContent.trim() : null,
                afterPlayAll: !!(btn && playAll && btn.previousElementSibling === playAll),
                rect: btn ? btn.getBoundingClientRect().toJSON() : null,
              };
            }""")
            print(f"attempt {attempt}:", json.dumps(info, ensure_ascii=False))
            if info["btn"]:
                page.evaluate("document.getElementById('wb-list-shuffle-btn').click()")
                page.wait_for_timeout(4000)
                print("跳转后 URL:", page.url)
                break
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
