<div align="center">

# 🧩 web-customizer-userjs

**网页定制助手 · 油猴脚本工具箱**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6?style=flat&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.4.1-0078D4?style=flat)](web-customizer.user.js)
[![Tampermonkey](https://img.shields.io/badge/Requires-Tampermonkey-00485B?style=flat&logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![Modules](https://img.shields.io/badge/内置模块-3-F59E0B?style=flat)]()

</div>

一个 Chrome 油猴（Tampermonkey）用户脚本，定位为**网页定制化工具箱**：采用**模块化架构（v2.0）**，每个功能模块拥有独立的配置命名空间、启用开关、模块级黑名单与专属设置，互不干扰；面板区块随模块自动生成，可无侵入地持续添加新模块。当前内置功能：「回到顶部」悬浮球、B站合集/分P 随机播放、雪球隐藏右侧栏并拉宽正文。

## 功能特性

- ⬆️ **一键回到顶部**：平滑滚动，滚动过程中无干扰
- 🔀 **合集随机播放**（v2.2.1，交互参考 Chrome 扩展《哔哩哔哩合集视频倒序随机播放》/ BilibiliPlaylistController）：在侧栏合集标题旁注入一个 **「随机播放」** 按钮——点击打乱内部播放顺序数组（**当前播放的视频自动置顶**，其余随机排列）并同步重排侧栏，**侧栏滚动位置自动复位到顶部**（从置顶条目向上遍历祖先链归零所有可滚动容器，兼容滚动容器在合集容器内部或外层的布局），置顶视频立即可见；自动连播时通过覆写 `window.player.next/prev` + `video.ended` 事件按新顺序取下一集，并用官方 `player.reload({bvid})` 原地加载，全程 SPA 免整页刷新；未点过按钮时完全走 B 站原生逻辑（顺序不变）。选集识别兼容新版 B 站 `.video-pod__item[data-key]`（data-key = bvid）与旧版链接元素双策略，数据源为侧栏 DOM + 页面数据 `__INITIAL_STATE__`（`ugc_season`/`pages`）双保险；随机顺序自动保存到标签页会话（sessionStorage），**整页刷新后按原随机顺序无缝续播**，且**每连播 10 集自动整页「换血」一次**（见轻量运行）
- 📈 **雪球隐藏右侧栏**（v2.4.0）：在 xueqiu.com 上自动隐藏右侧栏（热门话题/热门基金/页脚信息等）并把主内容栏拉宽占满。采用**双层策略**——第一层为精确选择器（基于线上 DOM 实测：首页/时间线页的两栏容器为 `AnonymousHome_container`，右栏 `home__col--rt_XXX`、主栏 `home__col--lf_XXX`，hash 后缀随构建变化故用 `[class*=]` 包含匹配）；第二层为运行时几何识别兜底，自动定位「主栏 + 右侧窄列」（宽 200~520px 且不足容器 40%）的两栏容器，不限布局类型（flex/grid/float/block 通吃），覆盖个股页（`.stock__main`/`.stock__side`）及其他改版页面；定时器 + MutationObserver 双驱动，SPA 路由切换/动态渲染后自动重新识别；登录版首页中间栏宽度可在面板自定义（「中间栏宽度」输入框，0=自动拉满）；右下角 AI 提问悬浮组件（.seekball-container）一并隐藏；模块关闭或黑名单生效时自动清除标记、还原原状
- 🔵 **可拖拽悬浮球**：任意拖动位置，自动记忆；带滚动进度环，下滑超过 200px 才显示
- ⚙️ **右键悬浮球 / 点击 ⚙ 角标 / 油猴菜单** 三种方式打开设置面板
- 🚫 **本机地址一律禁用**：localhost / 127.0.0.1 / 内网 IP（10.x、172.16-31.x、192.168.x、169.254.x、0.x）/ *.local / *.lan / file: 页面上所有功能自动禁用（本地开发页面不受干扰，设置面板仍可打开）。**两层黑名单**（v2.0 模块化）：**全局黑名单** = 总闸，名单内网站禁用所有功能；**模块级黑名单** = 只禁用对应模块（例如 github.com 仅禁用回顶球、不影响其他模块）。模块判定 = 模块开关 && 非本机地址 && 不在全局黑名单 && 不在本模块黑名单
- 🏠 **当前网站快捷操作**：全局与每个模块区块内均有「把当前网站加入黑名单 / 从黑名单移除」按钮（写入后点「保存」生效）
- 🪶 **轻量运行**（v2.1.1/v2.2.0 性能修复）：全量选集扫描降频至 5 秒一次（每秒仅保留按钮重挂/钩子检查等廉价操作），后台标签页完全跳过扫描，选集条目按 key 预去重后再读文本、策略一命中即跳过锚点兜底扫描；**每连播 10 集自动整页换血一次**，回收 B 站播放器原地 `reload` 累积的内存（长挂机整机卡死的根源），换血后按持久化顺序续播
- 🧩 **模块化架构**：配置按模块命名空间隔离存储（`config.modules.<id>`），各模块通过 `defineModule` 注册，声明自己的默认配置 / `mount` / `refresh` / `renderSettings` 钩子；面板的开关 + 黑名单区块自动生成，新增模块零侵入
- 📏 规则语法：`example.com`（含所有子域名）、`*.example.com`、`*`（全部）
- 💾 配置通过 `GM_setValue` 持久化，全站共享、刷新不丢
- 🎨 自动适配明暗主题，界面基于 Shadow DOM，不与页面样式互相污染

## 安装步骤

**方式一：从 GitHub 一键安装（推荐）**

1. Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 浏览器打开安装链接：[web-customizer.user.js](https://github.com/spirodelazz/web-customizer-userjs/raw/main/web-customizer.user.js)
3. Tampermonkey 会自动弹出安装页，点击「安装」即可生效

**方式二：手动粘贴**

1. Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 点击浏览器右上角 Tampermonkey 图标 → **添加新脚本**
3. 删除编辑器里的默认内容，将 `web-customizer.user.js` 的**全部内容**粘贴进去
4. `Ctrl + S` 保存，即可生效

> 也可以在 Tampermonkey「实用工具」页选择「从文件导入」该 `.user.js`。
> 从 GitHub 安装后，脚本通过仓库自动获取更新（Tampermonkey 默认开启检查更新）。

## 使用说明

| 操作 | 效果 |
| --- | --- |
| 左键点击悬浮球 | 平滑回到顶部 |
| 点击合集标题旁「随机播放」 | 打乱合集播放顺序（当前视频置顶、其余随机），侧栏列表同步重排并滚回顶部，自动连播按新顺序免刷新连播 |
| 访问 xueqiu.com | 自动隐藏右侧栏（热门基金/页脚信息等），主内容栏拉宽占满 |
| 按住拖动悬浮球 | 调整位置（自动保存） |
| 右键悬浮球 / 点击 ⚙ 角标 | 打开设置面板 |
| Tampermonkey 菜单 | 「回到顶部」/「设置」两个入口 |

设置面板内：顶部为**全局黑名单**（禁用所有功能），下方每个模块一个区块（启用开关 + 本模块黑名单 + 模块专属设置 + 该模块在当前网站的状态标签），修改后点击「保存」生效。悬浮球可拖动，「重置悬浮球位置」只重置回顶球自己的位置。

> 说明：随机顺序保存在标签页会话中，整页刷新/换血后自动恢复并按原顺序续播，关闭标签页后清除。换血瞬间会有一次约 1~2 秒的整页加载（每 10 集一次）。记得打开播放器的「自动连播」以获得连续的随机观看体验。

> 注意：若当前网站在全局黑名单或某模块黑名单内，对应功能的悬浮球/按钮会隐藏，此时仍可通过 Tampermonkey 菜单打开设置查看各模块状态标签。

## 数据存储

配置保存在 Tampermonkey 的脚本存储中，键名 `wb_web_customizer_config_v2`，结构为模块化命名空间：

```javascript
{
  globalBlacklist: [],
  modules: {
    backToTop:  { enabled: true, blacklist: [], showThreshold: 200, btnPos: null },
    biliRandom: { enabled: true, blacklist: [] },
    xueqiuWide: { enabled: true, blacklist: [], middleWidth: 0 }
  }
}
```

旧版本键（`wb_web_customizer_config_v1` / `wb_backtop_config_v1`）会在首次运行时自动迁移到 v2（`btnPos`/`showThreshold` 归入 backToTop，`dicePos` 归入 biliRandom，原黑名单移入全局层），无需重新配置。更换电脑需在 Tampermonkey「实用工具」中备份/恢复脚本数据。

## 如何扩展新模块

v2.0 采用模块注册框架，新增模块零侵入：调用一次 `defineModule` 即可，面板区块与配置存储自动生成。

```javascript
defineModule({
  id: "yourFeature",             // 模块唯一 ID（配置命名空间）
  label: "功能名称",              // 面板显示名
  icon: "🔧",
  defaults: { yourSetting: 1 },  // 模块专属默认配置（自动隔离存储与迁移）
  mount: function (shadowRoot) { /* 构建模块 UI */ },
  refresh: function () { /* 配置变化/重建后刷新状态 */ },
  onScroll: function () {},      // 可选钩子
  onResize: function () {},      // 可选钩子
  renderSettings: function (box) { /* 面板里追加模块专属设置控件 */ }
});
```

模块内用 `isModuleEnabledHere("yourFeature")` 判定是否生效（= 模块开关 && 不在全局黑名单 && 不在本模块黑名单），黑名单管控对新模块自动生效。

## License

[MIT](LICENSE)。「合集随机播放」的交互设计参考了 Chrome 扩展《哔哩哔哩合集视频倒序随机播放》（BilibiliPlaylistController），致谢原作者。
