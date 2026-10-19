// ==UserScript==
// @name         网页定制助手
// @namespace    https://github.com/spirodelazz/web-customizer-userjs
// @version      2.8.0
// @description  网页定制化脚本工具箱（模块化架构）：每个功能模块拥有独立开关、独立作用域与专属设置，互不干扰；站点专属模块自动限定作用域名。内置「回到顶部」悬浮球、「防页面自动跳顶」滚动位置守护、B站合集随机播放（当前视频置顶 + SPA 免刷新连播 + 顺序跨刷新续播 + 定期整页换血防内存累积）、雪球隐藏右侧栏并拉宽正文（运行时布局识别，改版不失效）、X（推特）隐藏右侧栏（过滤搜索/订阅 Premium/新鲜事/推荐关注）。按文末扩展点可无侵入添加新模块。
// @author       spirodelazz
// @homepageURL  https://github.com/spirodelazz/web-customizer-userjs
// @supportURL   https://github.com/spirodelazz/web-customizer-userjs/issues
// @source       https://github.com/spirodelazz/web-customizer-userjs/
// @downloadURL  https://raw.githubusercontent.com/spirodelazz/web-customizer-userjs/main/web-customizer.user.js
// @updateURL    https://raw.githubusercontent.com/spirodelazz/web-customizer-userjs/main/web-customizer.user.js
// @match        *://*/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

