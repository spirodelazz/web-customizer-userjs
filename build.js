#!/usr/bin/env node
// 按固定顺序拼接 src/ 源文件，生成 web-customizer.user.js。
// 所有源文件共享同一个 IIFE 作用域（无模块系统），构建只做文本拼接：
// 改了 src/ 之后运行 `node build.js` 重新生成产物，产物需一并提交。
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = __dirname;
var OUT = path.join(ROOT, "web-customizer.user.js");

// 顺序即作用域声明顺序；框架/基建在前，模块居中，面板与初始化收尾
var PARTS = [
  "src/header.user.js",
  "src/core/registry.js",
  "src/core/ui.js",
  "src/modules/back-to-top.js",
  "src/modules/bili-random.js",
  "src/modules/xueqiu-wide.js",
  "src/modules/x-sidebar.js",
  "src/core/panel.js",
  "src/core/init.js",
  "src/footer.user.js"
];

var out = PARTS.map(function (rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}).join("");

fs.writeFileSync(OUT, out);
console.log("build: wrote " + path.relative(process.cwd(), OUT) +
  " (" + out.length + " bytes from " + PARTS.length + " parts)");
