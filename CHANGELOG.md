# 更新日志

本项目所有版本变更记录。版本号遵循语义化版本，最新条目在最前。

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
