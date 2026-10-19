  /* ==========================================================
   * 一、模块框架：注册表 + 命名空间配置 + 站点判定
   * ----------------------------------------------------------
   * 每个功能模块通过 defineModule 注册，拥有：
   *   - 独立的配置命名空间 config.modules[id]（开关/黑名单/专属设置）
   *   - 独立的站点判定（本模块黑名单 + 声明式作用域 hosts 两层）
   *   - 独立的面板区块（自动生成，无需改面板代码）
   * 声明 hosts 的模块为站点专属：仅命中作用域名时生效，且不设本模块黑名单——
   * 对这类模块，唯一可填的黑名单条目就是作用域自身，等价于模块开关
   * 模块之间不互相引用状态，仅共享框架提供的基础设施。
   * ========================================================== */
  var MODULE_DEFS = [];

  function defineModule(def) {
    MODULE_DEFS.push(def);
    return def;
  }

  var STORAGE_KEY = "wb_web_customizer_config_v2";                   // 当前使用的存储键（v2 模块化结构）
  var LEGACY_KEYS = ["wb_web_customizer_config_v1", "wb_backtop_config_v1"]; // 历史存储键，首次读取时自动迁移
  var BALL_SIZE = 44;
  var RING_RADIUS = 20;
  var RING_LEN = 2 * Math.PI * RING_RADIUS;
  var HOST_ID = "wb-customizer-shadow-host";

  var shadow = null, ball = null, ringBar = null, panel = null, toastEl = null;
  var toastTimer = null;
  var config = null; // init 时加载
  var scrollSeq = 0; // 页面滚动序号：拖拽层用它判定「这次按下与抬起之间是否夹着滚动」
  var lastScrollAt = 0; // 最近一次滚动时间戳：布局改写类模块用它避开用户滚动中的页面
  var guardSelfAt = 0; // 最近一次由我们自己发起的回顶（防跳顶模块据此放行）

  function sanitizeList(v) {
    var seen = {}, out = [];
    (Array.isArray(v) ? v : []).forEach(function (x) {
      var t = String(x || "").trim().toLowerCase();
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out;
  }

  // 归一化：确保每个已注册模块的命名空间存在且字段齐全，未知名单一律丢弃
  function normalizeConfig(saved) {
    saved = saved && typeof saved === "object" ? saved : {};
    var out = { modules: {} };
    MODULE_DEFS.forEach(function (def) {
      var s = (saved.modules && saved.modules[def.id] && typeof saved.modules[def.id] === "object")
        ? saved.modules[def.id] : {};
      // 只保留模块声明过的设置键（历史遗留字段如 dicePos 迁移后自动丢弃）；
      // hosts 模块不设黑名单，历史遗留条目一并丢弃
      var m = { enabled: typeof s.enabled === "boolean" ? s.enabled : true };
      if (!def.hosts) m.blacklist = sanitizeList(s.blacklist);
      var d = def.defaults || {};
      for (var mk in d) {
        if (!Object.prototype.hasOwnProperty.call(d, mk)) continue;
        m[mk] = (s[mk] !== undefined) ? s[mk] : d[mk];
      }
      out.modules[def.id] = m;
    });
    return out;
  }

  // 旧版（v1 扁平结构）→ v2 模块化结构
  function migrateLegacy(o) {
    o = o && typeof o === "object" ? o : {};
    var f = o.features || {};
    return normalizeConfig({
      modules: {
        backToTop: {
          enabled: f.backToTop !== false,
          showThreshold: o.showThreshold || 200,
          btnPos: o.btnPos || null
        },
        biliRandom: {
          enabled: f.biliRandom !== false
        }
      }
    });
  }

  function loadConfig() {
    try {
      var saved = GM_getValue(STORAGE_KEY, null);
      if ((!saved || typeof saved !== "object") && LEGACY_KEYS.length) {
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
          var legacy = GM_getValue(LEGACY_KEYS[i], null);
          if (legacy && typeof legacy === "object") { saved = migrateLegacy(legacy); break; }
        }
      }
      if (saved && typeof saved === "object") {
        if (saved.modules && typeof saved.modules === "object") return normalizeConfig(saved);
        return migrateLegacy(saved); // v1 结构兜底
      }
    } catch (e) { /* 读取异常时回退默认 */ }
    return normalizeConfig({});
  }

  function saveConfig() {
    try { GM_setValue(STORAGE_KEY, config); } catch (e) { /* 写入异常忽略 */ }
  }

  /* ---------------- 域名匹配：example.com（含子域）/ *.example.com / * ---------------- */
  function escapeReg(s) {
    return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }

  function hostMatchesPattern(host, pattern) {
    host = String(host || "").toLowerCase();
    pattern = String(pattern || "").trim().toLowerCase();
    if (!host || !pattern) return false;
    if (pattern === "*") return true;
    if (pattern.indexOf("*.") === 0) {
      var base = pattern.slice(2);
      return host === base || host.slice(-base.length - 1) === "." + base;
    }
    if (pattern.indexOf("*") !== -1) {
      var re = new RegExp("^" + pattern.split("*").map(escapeReg).join(".*") + "$");
      return re.test(host);
    }
    return host === pattern || host.slice(-pattern.length - 1) === "." + pattern;
  }

  function isBlacklistedHere(list) {
    var host = location.hostname;
    return (list || []).some(function (p) { return hostMatchesPattern(host, p); });
  }

  // 本机/内网地址：所有功能一律禁用（本地开发页面不受脚本干扰）
  function isLocalAddress() {
    if (location.protocol === "file:") return true;
    var h = location.hostname || "";
    if (!h) return false;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" ||
        h.slice(-6) === ".local" || h.slice(-4) === ".lan" || h.slice(-5) === ".home" ||
        h.slice(-4) === ".arpa") return true;
    var m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a === 127 || a === 10 || a === 0 ||
          (a === 192 && b === 168) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 169 && b === 254)) return true;
    }
    return false;
  }

  function moduleDef(id) {
    for (var i = 0; i < MODULE_DEFS.length; i++) {
      if (MODULE_DEFS[i].id === id) return MODULE_DEFS[i];
    }
    return null;
  }

  // 模块在本站点是否生效：模块开关 && 非本机地址 && 命中模块作用域（hosts）
  // && 不在本模块黑名单（仅回到顶部等全站模块有）
  function isModuleEnabledHere(id) {
    if (isLocalAddress()) return false;
    var m = config && config.modules[id];
    if (!m || !m.enabled) return false;
    var def = moduleDef(id);
    if (def && def.hosts && !isBlacklistedHere(def.hosts)) return false;
    if (isBlacklistedHere(m.blacklist)) return false;
    return true;
  }

  function moduleStatusHere(id) {
    var m = config && config.modules[id];
    if (!m || !m.enabled) return { on: false, text: "已关闭" };
    if (isLocalAddress()) return { on: false, text: "本机地址已禁用" };
    var def = moduleDef(id);
    if (def && def.hosts && !isBlacklistedHere(def.hosts)) return { on: false, text: "非适用站点" };
    if (isBlacklistedHere(m.blacklist)) return { on: false, text: "本模块黑名单" };
    return { on: true, text: "已启用" };
  }

  /* ==========================================================
