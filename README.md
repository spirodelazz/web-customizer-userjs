<div align="center">

# web-customizer-userjs

**模块化的网页定制工具箱 · Tampermonkey 用户脚本**

[![Version](https://img.shields.io/badge/version-2.7.0-0078D4.svg)](web-customizer.user.js)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/requires-Tampermonkey-00485B.svg)](https://www.tampermonkey.net/)
[![CI](https://github.com/spirodelazz/web-customizer-userjs/actions/workflows/ci.yml/badge.svg)](https://github.com/spirodelazz/web-customizer-userjs/actions/workflows/ci.yml)

</div>

一个运行在 Tampermonkey 中的用户脚本，定位为网页定制化工具箱。采用模块化架构：每个功能模块拥有独立的配置命名空间、启用开关与专属设置，互不干扰；全站模块另有模块级黑名单，站点专属模块通过 `hosts` 声明作用域名，仅在对应网站生效；设置面板的模块区块自动生成，新增模块无需改动框架。源码按 `core`（框架）与 `modules`（功能模块）拆分在 `src/` 目录，由 `build.js` 拼接为单文件产物 `web-customizer.user.js`。

内置四个模块：回到顶部悬浮球、B 站合集随机播放、雪球优化（隐藏右侧栏 + 防跳顶）、X（推特）隐藏右侧栏。

## 功能特性

| 模块 | ID | 作用域 | 说明 |
| --- | --- | --- | --- |
| 回到顶部 | `backToTop` | 全站 | 可拖拽悬浮球 + 滚动进度环，下滑超过 200px 才显示 |
| 雪球优化 | `xueqiuWide` | 雪球 | 隐藏右侧栏并拉宽正文（精确选择器 + 几何识别双层策略）；站点重渲染把 `scrollTop` 夹回 0 时自动还原滚动位置（防页面自动跳顶，点击 / 按键 / 路由跳转不干预） |
| 合集随机播放 | `biliRandom` | B 站 | 合集标题旁注入「随机播放」，当前视频置顶、其余随机；SPA 免刷新连播，顺序跨刷新续播 |
| X 隐藏右侧栏 | `xSidebarHide` | x.com / twitter.com | 纯 CSS 隐藏 `[data-testid="sidebarColumn"]`，无定时器、无 DOM 扫描 |

框架级能力：

- **模块黑名单（仅回到顶部）**：`backToTop` 区块支持模块级黑名单，只禁用该模块；规则支持 `example.com`（含子域名）、`*.example.com`、`*`。
- **站点专属模块自动限定作用域**：通过 `defineModule` 的 `hosts` 字段声明作用域名（复用同一套匹配规则），当前域名不在作用域内时模块休眠，面板显示「仅适用于：…」而非黑名单框。
- **本机地址一律禁用**：`localhost`、`127.0.0.1`、`::1`、内网 IP（10.x / 172.16-31.x / 192.168.x / 169.254.x / 0.x）、`*.local` / `*.lan` / `*.home` / `*.arpa`、`file:` 页面上所有功能自动禁用（设置面板仍可打开）。
- **当前网站快捷操作**：回到顶部区块内有「加入 / 移出黑名单」按钮，保存后生效。
- **配置隔离**：按 `config.modules.<id>` 存储，模块未声明的字段自动丢弃；旧版扁平配置首次读取时自动迁移。
- **样式隔离**：界面基于 Shadow DOM，自动适配明暗主题，不与页面样式互相污染。

## 安装

**方式一：从 GitHub 安装（推荐）**

1. Chrome / Edge 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开安装链接：[web-customizer.user.js](https://github.com/spirodelazz/web-customizer-userjs/raw/main/web-customizer.user.js)。
3. Tampermonkey 弹出安装页后点「安装」，之后自动从仓库获取更新。

**方式二：手动粘贴**

在 Tampermonkey 中「添加新脚本」，清空默认内容后粘贴 `web-customizer.user.js` 全文，`Ctrl + S` 保存。也可在「实用工具」页选择「从文件导入」。

## 使用

| 操作 | 效果 |
| --- | --- |
| 左键点击悬浮球 | 平滑回到顶部 |
| 按住拖动悬浮球 | 调整位置（自动保存） |
| 右键悬浮球 / 点击 ⚙ 角标 | 打开设置面板 |
| 雪球页面滚动中突然跳回顶部 | 自动还原到原位置（防页面自动跳顶，点击 / 按 Home / 换页不干预） |
| 点击合集标题旁「随机播放」 | 打乱播放顺序（当前视频置顶），侧栏同步重排并滚回顶部 |
| 访问 xueqiu.com | 自动隐藏右侧栏并拉宽正文 |
| 访问 x.com / twitter.com | 自动隐藏右侧栏，只保留导航与时间线 |

> 随机顺序保存在标签页会话（`sessionStorage`）中，整页刷新后按原顺序续播，关闭标签页清除；每连播 10 集会整页刷新一次以回收播放器内存（约 1~2 秒）。记得打开播放器的「自动连播」。

## 设置与黑名单

面板内每个模块一个区块（启用开关、专属设置、当前网站状态标签）；回到顶部区块另有本模块黑名单与「加入 / 移出」按钮，站点专属模块显示作用域名。修改后点「保存」生效。模块生效判定：

```text
模块开关 && 非本机地址 && 命中模块作用域（hosts）&& 不在本模块黑名单
```

若当前网站在黑名单内，对应功能的悬浮球 / 按钮会隐藏，但仍可通过油猴菜单打开设置查看状态。

## 数据存储

配置保存在 Tampermonkey 脚本存储中，键名 `wb_web_customizer_config_v2`：

```javascript
{
  modules: {
    backToTop:    { enabled: true, blacklist: [], showThreshold: 200, btnPos: null },
    biliRandom:   { enabled: true },
    xueqiuWide:   { enabled: true, middleWidth: 0 },
    xSidebarHide: { enabled: true, mainWidth: 0 }
  }
}
```

早期扁平配置（`wb_web_customizer_config_v1` / `wb_backtop_config_v1`）首次读取时自动迁移。更换电脑需在「实用工具」中备份 / 恢复脚本数据。

## 扩展新模块

调用一次 `defineModule` 即可，面板区块与配置存储自动生成：

```javascript
defineModule({
  id: "yourFeature",             // 模块唯一 ID（配置命名空间）
  label: "功能名称",
  icon: "🔧",
  defaults: { yourSetting: 1 },  // 模块专属默认配置
  hosts: ["example.com"],        // 可选：作用域名白名单（含子域名），声明后无模块黑名单
  mount: function (shadowRoot) { /* 构建模块 UI */ },
  refresh: function () { /* 配置变化后刷新状态 */ },
  onScroll: function () {},      // 可选
  onResize: function () {},      // 可选
  renderSettings: function (box) { /* 面板里的专属设置控件 */ }
});
```

模块内用 `isModuleEnabledHere("yourFeature")` 判定是否生效，黑名单、本机地址与作用域管控对新模块自动生效。

## 项目结构

```
web-customizer-userjs/
├── src/
│   ├── header.user.js               UserScript 元数据 + IIFE 开头
│   ├── footer.user.js               扩展点说明 + IIFE 结尾
│   ├── core/
│   │   ├── registry.js              模块注册表、配置存储与迁移、黑名单与站点判定
│   │   ├── ui.js                    Shadow DOM、样式、通用拖拽、Toast
│   │   ├── panel.js                 设置面板
│   │   └── init.js                  初始化与油猴菜单
│   └── modules/
│       ├── back-to-top.js           回到顶部悬浮球
│       ├── bili-random.js           B站合集随机播放
│       ├── xueqiu-wide.js           雪球优化：隐藏右侧栏并拉宽正文 + 防页面自动跳顶
│       └── x-sidebar.js             X（推特）隐藏右侧栏
├── build.js                         构建脚本：按固定顺序拼接 src/ → 产物
├── web-customizer.user.js           构建产物（安装与分发用）
├── diagnostic/xq-console-diagnostic.js  雪球 DOM 诊断脚本（Console 手动执行）
├── CHANGELOG.md
└── .github/workflows/ci.yml         CI：构建一致性校验 + node --check
```

## 兼容性与已知限制

- 面向 Chrome / Edge + Tampermonkey，其他脚本管理器未验证。
- 站点改版可能导致选择器失效：雪球有几何识别兜底，B 站与 X 依赖当前 DOM 契约，需要时请提 Issue。
- 随机播放依赖 B 站播放器的 `player.next/prev` 与 `reload`，属非公开行为，接口变动会导致模块失效。

## 开发

源码在 `src/` 下，所有文件共享同一个 IIFE 作用域（无模块系统、无依赖），构建只做文本拼接。修改 `src/` 后运行 `node build.js` 重新生成产物，产物与源码需一并提交：

```bash
node build.js && node --check web-customizer.user.js
```

CI 会重新构建并校验产物与仓库中的一致（`git diff --exit-code`），提交源码改动而未重新构建会直接失败。

调整版本时同步更新头部 `@version` 与 [CHANGELOG.md](CHANGELOG.md)。

## 贡献

欢迎 Issue 与 PR。反馈站点适配问题时请附浏览器与脚本版本、出问题的 URL 与页面结构特征、Console 报错信息。

## 许可证

[MIT](LICENSE)。「合集随机播放」的交互设计参考了 Chrome 扩展《哔哩哔哩合集视频倒序随机播放》（BilibiliPlaylistController），感谢原作者。
