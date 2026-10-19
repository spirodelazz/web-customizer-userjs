# 更新日志

本项目所有版本变更记录。版本号遵循语义化版本，最新条目在最前。

## [2.8.0] - 2026-10-19

- 设置面板界面与交互重做：模块区块改为卡片式（图标徽章 + 名称 + 状态标签 + iOS 式开关），面板头部显示当前网站徽章，底部新增未保存状态提示（任意控件改动即亮起，保存 / 重开复位），数字输入框与按钮统一样式并适配明暗主题。

## [2.7.0] - 2026-10-19

- 仓库结构调整：脚本源码按 `core`（注册表 / 配置 / UI / 面板 / 初始化）与 `modules`（五个功能模块各一文件）拆分至 `src/`，新增 `build.js` 将其按固定顺序拼接为产物 `web-customizer.user.js`；安装、自动更新与配置存储不受影响。CI 新增构建一致性校验（重新构建后 `git diff --exit-code`）。
- 新增模块作用域声明 `hosts`：`biliRandom`（www.bilibili.com）、`xSidebarHide`（x.com / twitter.com）声明后由框架统一判定，当前域名不在作用域内时休眠，状态标签显示「非适用站点」。
- 配置面精简：站点专属模块不再暴露模块黑名单（唯一有意义的条目就是作用域自身，等价于模块开关），面板区块改为「仅适用于：…」提示；「防页面自动跳顶」并入雪球模块——随 `xueqiuWide` 开关在雪球域名生效（触发阈值固定 1200px / 800ms），不再单独暴露开关、黑名单与设置；移除全局黑名单——面板总闸区块、判定链与存储字段全部删除，历史配置自动迁移丢弃。面板现为四个模块区块，仅回到顶部保留模块黑名单。

## [2.6.0] - 2026-10-17

- 新增「防页面自动跳顶」模块 `scrollGuard`：站点重渲染导致文档高度塌陷、浏览器把 `scrollTop` 夹回 0 时，自动把滚动位置还原。实测雪球用户主页（`/u/<id>`）滑到底部会 `5031 → 0` 且全程无任何滚动 API 调用，属站点自身行为，脚本侧只能事后补位。
  - 触发条件：单次滚动位置下坠超过 `minJump`（默认 1200px）且落到顶部 60px 内，且不是自己发起的回顶、最近 `quietMs`（默认 800ms）内无点击 / 按键、地址未变、页面可见。
  - 还原最多重试约 1.2s：塌陷期间文档高度可能为 0，一次性 `scrollTo` 会被夹住，需等内容恢复后补位；首次命中弹一次 toast。
  - `scrollToTop()`（悬浮球 / 菜单）会写入 `guardSelfAt`，防跳顶模块据此放行，两者不会互相打架。
- 雪球布局识别降频：上一轮全量扫描未命中时把启发式扫描从 2s 放宽到 4s，命中时 2s——用户主页、个股页这类无侧栏页面不再每 2s 做一次整页布局读取。
- 新增 `diagnostic/` 复现工具：`scroll-jump-trace.js`（浏览器控制台抓跳顶调用栈）、`xq-bottom-scroll-repro.py` / `repro-with-userscript.py` / `xq-layout-probe.py` / `test-scroll-guard.py`（在 webpool 容器内用隐形 Chromium 复现与验证）。

## [2.5.1] - 2026-10-17

- 修复信息流页面滑到底部时页面跳回顶部、无法翻页的问题。三处诱因同时堵死：
  - 悬浮球把「任意一次抬起」当成点击：`pointerup` 只校验 `dragging`，指针捕获丢失、在窗口外松开、或多指交叉时 `dragging` 会一直挂着，之后页面上任何一次抬手都可能落进「点击 → 回到顶部」。现在点击判定要求同一次按下的同一 `pointerId` 抬起、位移 < 5px、按住 < 600ms，且按下与抬起之间页面没有滚动过（`scrollSeq` 计数），并在 `lostpointercapture` / `pointercancel` / 窗口失焦时强制复位、显式释放捕获。
  - 悬浮球的按下/抬起/右键不再冒泡给页面：阴影树事件会重定向后冒到 `document`，站点挂在整个文档上的手势与「点击空白处」逻辑会把操作悬浮球当成一次页面交互，现全部 `stopPropagation`。
  - 宿主节点重建改为「原地重建内部内容」：原先滚动时若检测到节点被页面脚本破坏，会把 `#wb-customizer-shadow-host` 从文档摘下再插回，信息流底部（站点自带滚动监听/滚动锚定）会跟着抖；同时给宿主加上 `overflow-anchor:none`。
- 雪球布局改写不再干扰滚动：用户滚动中（< 500ms）跳过启发式扫描与标记复检，动态宽度样式表内容未变时不再重写——避免触底加载瞬间整页重排把滚动位置带偏。
- 新增 `diagnostic/scroll-jump-trace.js`：控制台粘贴后可捕获 `window.scrollTo` / `scrollTo` / `scrollBy` / `scrollTop` 赋值 / `scrollIntoView` / `location.hash` 的调用栈，用于定位「谁把页面滚回了顶部」。

## [2.5.0] - 2026-10-17

- 新增「X（推特）隐藏右侧栏」模块 `xSidebarHide`：在 x.com / twitter.com 上以纯 CSS 隐藏 `[data-testid="sidebarColumn"]`（搜索框、订阅 Premium 推广、有什么新鲜事、推荐关注等），只保留左侧导航与中间时间线。样式表一次注入（`wb-x-sidebar-style`），不挂定时器、不做 DOM 扫描，SPA 切换页面持续生效；模块关闭或黑名单生效时移除样式表还原。
- 面板新增该模块专属设置「主栏宽度」（`defaults.mainWidth`，0 = 保持 X 默认 600px），用于隐藏侧栏后按需拉宽正文；覆盖同时给出 `width` / `max-width` / `flex`（`1 1 Npx`），否则由 `flex-basis` 定宽的列布局会忽略 `width` 而保持原宽。

## [2.4.3] - 2026-10-17

- 修复个股页正文上方出现大片空白（行情区、图表被推到左侧导航下方）：浮动主栏 `float:none` 后丢失 BFC，内部 `clearfix` 的 `clear:both` 连外层 1380px 高的导航浮动一起清除。现对 `display:block` 的主栏追加 `display:flow-root`（`data-wb-xq-main="block"`）重建 BFC 隔离，flex/grid 主栏保持原样；本地以真实 DOM + CSS 实测，标记后标题/行情/图表纵向位置与未标记时完全一致。

## [2.4.2] - 2026-10-17

- 「雪球隐藏右侧栏」新增标记复检自愈（`xqRevalidateMarks()`）：每轮扫描对已标记容器按打标时的同一套几何特征复检，不通过即清除标记。修复 SPA 路由切换复用 DOM 节点或页面加载中间态导致原「侧栏」变成正文、却被 `data-wb-xq-side` 永久 `display:none` 隐藏（个股页整块正文消失）的问题。

## [2.4.1] - 2026-10-10

- 新增本机/内网地址判定 `isLocalAddress()`：localhost、127.x、::1、10.x、172.16-31.x、192.168.x、169.254.x、0.x、`*.local` / `*.lan` / `*.home` / `*.arpa` 与 `file:` 页面下所有模块功能一律禁用，设置面板仍可打开。
- 站点隔离：B 站定时器与路由钩子只在 bilibili 域名启动，雪球定时器与 MutationObserver 只在雪球域名启动，回顶球保持全站。
- 性能：精确选择器命中时跳过启发式全量扫描；`closest` 替代逐容器 `querySelector`；后台标签页（`document.hidden`）跳过扫描。

## [2.4.0] - 2026-10-10

- 「雪球隐藏右侧栏」新增面板设置「中间栏宽度」（`defaults.middleWidth`，0 = 自动拉满）。
- 面板的设置读写扩展为通用 `[data-mod-setting][data-setting-key]`，其他模块可直接复用；动态样式写入 `wb-xq-wide-dyn`。

## [2.3.3] - 2026-10-10

- 登录版首页中间栏（`[class*=user__col--middle]`）拉宽，其直接子级 div 解除 `max-width`。
- 隐藏右下角 AI 提问悬浮组件 `.seekball-container`。

## [2.3.2] - 2026-10-10

- 修复 `isXueqiuHost()` 的域名后缀长度判断（`.xueqiu.com` 为 11 字符）导致 www.xueqiu.com 上模块不生效。

## [2.3.1] - 2026-10-10

- 新增「雪球隐藏右侧栏并拉宽正文」模块 `xueqiuWide`：精确选择器（首页/时间线两栏容器 `AnonymousHome_container`，主栏 `home__col--lf*`、右栏 `home__col--rt*`，以 `[class*=]` 包含匹配免疫构建 hash 变化）+ 运行时几何识别兜底（主栏 + 右侧 200~520px 且不足容器 40% 的兄弟列，不限 flex/grid/float/block）；定时器 + MutationObserver 双驱动，模块关闭或黑名单生效时清除标记还原。

## [2.2.1] - 2026-10-07

- 首次发布：模块化架构（`defineModule` 注册表 + `config.modules.<id>` 命名空间 + 全局/模块两层黑名单 + 面板区块自动生成）、「回到顶部」悬浮球（可拖拽、滚动进度环）、「B站合集随机播放」（当前视频置顶、SPA 免刷新连播、顺序跨刷新续播、每 10 集整页换血）。
