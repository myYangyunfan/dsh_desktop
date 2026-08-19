import { createRequire as __dsmCreateRequire } from 'node:module'; const require = __dsmCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// ../../node_modules/ms/index.js
var require_ms = __commonJS({
  "../../node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse4(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse4(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// ../../node_modules/debug/src/common.js
var require_common = __commonJS({
  "../../node_modules/debug/src/common.js"(exports, module) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug(...args) {
          if (!debug.enabled) {
            return;
          }
          const self = debug;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug.namespace = namespace;
        debug.useColors = createDebug.useColors();
        debug.color = createDebug.selectColor(namespace);
        debug.extend = extend;
        debug.destroy = createDebug.destroy;
        Object.defineProperty(debug, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug);
        }
        return debug;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module.exports = setup;
  }
});

// ../../node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "../../node_modules/debug/src/browser.js"(exports, module) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// ../../node_modules/debug/src/node.js
var require_node = __commonJS({
  "../../node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = __require("supports-color");
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// ../../node_modules/debug/src/index.js
var require_src = __commonJS({
  "../../node_modules/debug/src/index.js"(exports, module) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module.exports = require_browser();
    } else {
      module.exports = require_node();
    }
  }
});

// ../../node_modules/agent-base/dist/helpers.js
var require_helpers = __commonJS({
  "../../node_modules/agent-base/dist/helpers.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.req = exports.json = exports.toBuffer = void 0;
    var http = __importStar(__require("http"));
    var https = __importStar(__require("https"));
    async function toBuffer(stream) {
      let length = 0;
      const chunks = [];
      for await (const chunk of stream) {
        length += chunk.length;
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    }
    exports.toBuffer = toBuffer;
    async function json(stream) {
      const buf = await toBuffer(stream);
      const str = buf.toString("utf8");
      try {
        return JSON.parse(str);
      } catch (_err) {
        const err2 = _err;
        err2.message += ` (input: ${str})`;
        throw err2;
      }
    }
    exports.json = json;
    function req(url, opts = {}) {
      const href = typeof url === "string" ? url : url.href;
      const req2 = (href.startsWith("https:") ? https : http).request(url, opts);
      const promise = new Promise((resolve4, reject) => {
        req2.once("response", resolve4).once("error", reject).end();
      });
      req2.then = promise.then.bind(promise);
      return req2;
    }
    exports.req = req;
  }
});

// ../../node_modules/agent-base/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/agent-base/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Agent = void 0;
    var net = __importStar(__require("net"));
    var http = __importStar(__require("http"));
    var https_1 = __require("https");
    __exportStar(require_helpers(), exports);
    var INTERNAL = Symbol("AgentBaseInternalState");
    var Agent = class extends http.Agent {
      constructor(opts) {
        super(opts);
        this[INTERNAL] = {};
      }
      /**
       * Determine whether this is an `http` or `https` request.
       */
      isSecureEndpoint(options) {
        if (options) {
          if (typeof options.secureEndpoint === "boolean") {
            return options.secureEndpoint;
          }
          if (typeof options.protocol === "string") {
            return options.protocol === "https:";
          }
        }
        const { stack } = new Error();
        if (typeof stack !== "string")
          return false;
        return stack.split("\n").some((l) => l.indexOf("(https.js:") !== -1 || l.indexOf("node:https:") !== -1);
      }
      // In order to support async signatures in `connect()` and Node's native
      // connection pooling in `http.Agent`, the array of sockets for each origin
      // has to be updated synchronously. This is so the length of the array is
      // accurate when `addRequest()` is next called. We achieve this by creating a
      // fake socket and adding it to `sockets[origin]` and incrementing
      // `totalSocketCount`.
      incrementSockets(name) {
        if (this.maxSockets === Infinity && this.maxTotalSockets === Infinity) {
          return null;
        }
        if (!this.sockets[name]) {
          this.sockets[name] = [];
        }
        const fakeSocket = new net.Socket({ writable: false });
        this.sockets[name].push(fakeSocket);
        this.totalSocketCount++;
        return fakeSocket;
      }
      decrementSockets(name, socket) {
        if (!this.sockets[name] || socket === null) {
          return;
        }
        const sockets = this.sockets[name];
        const index = sockets.indexOf(socket);
        if (index !== -1) {
          sockets.splice(index, 1);
          this.totalSocketCount--;
          if (sockets.length === 0) {
            delete this.sockets[name];
          }
        }
      }
      // In order to properly update the socket pool, we need to call `getName()` on
      // the core `https.Agent` if it is a secureEndpoint.
      getName(options) {
        const secureEndpoint = this.isSecureEndpoint(options);
        if (secureEndpoint) {
          return https_1.Agent.prototype.getName.call(this, options);
        }
        return super.getName(options);
      }
      createSocket(req, options, cb) {
        const connectOpts = {
          ...options,
          secureEndpoint: this.isSecureEndpoint(options)
        };
        const name = this.getName(connectOpts);
        const fakeSocket = this.incrementSockets(name);
        Promise.resolve().then(() => this.connect(req, connectOpts)).then((socket) => {
          this.decrementSockets(name, fakeSocket);
          if (socket instanceof http.Agent) {
            try {
              return socket.addRequest(req, connectOpts);
            } catch (err2) {
              return cb(err2);
            }
          }
          this[INTERNAL].currentSocket = socket;
          super.createSocket(req, options, cb);
        }, (err2) => {
          this.decrementSockets(name, fakeSocket);
          cb(err2);
        });
      }
      createConnection() {
        const socket = this[INTERNAL].currentSocket;
        this[INTERNAL].currentSocket = void 0;
        if (!socket) {
          throw new Error("No socket was returned in the `connect()` function");
        }
        return socket;
      }
      get defaultPort() {
        return this[INTERNAL].defaultPort ?? (this.protocol === "https:" ? 443 : 80);
      }
      set defaultPort(v) {
        if (this[INTERNAL]) {
          this[INTERNAL].defaultPort = v;
        }
      }
      get protocol() {
        return this[INTERNAL].protocol ?? (this.isSecureEndpoint() ? "https:" : "http:");
      }
      set protocol(v) {
        if (this[INTERNAL]) {
          this[INTERNAL].protocol = v;
        }
      }
    };
    exports.Agent = Agent;
  }
});

// ../../node_modules/https-proxy-agent/dist/parse-proxy-response.js
var require_parse_proxy_response = __commonJS({
  "../../node_modules/https-proxy-agent/dist/parse-proxy-response.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseProxyResponse = void 0;
    var debug_1 = __importDefault(require_src());
    var debug = (0, debug_1.default)("https-proxy-agent:parse-proxy-response");
    function parseProxyResponse(socket) {
      return new Promise((resolve4, reject) => {
        let buffersLength = 0;
        const buffers = [];
        function read() {
          const b = socket.read();
          if (b)
            ondata(b);
          else
            socket.once("readable", read);
        }
        function cleanup() {
          socket.removeListener("end", onend);
          socket.removeListener("error", onerror);
          socket.removeListener("readable", read);
        }
        function onend() {
          cleanup();
          debug("onend");
          reject(new Error("Proxy connection ended before receiving CONNECT response"));
        }
        function onerror(err2) {
          cleanup();
          debug("onerror %o", err2);
          reject(err2);
        }
        function ondata(b) {
          buffers.push(b);
          buffersLength += b.length;
          const buffered = Buffer.concat(buffers, buffersLength);
          const endOfHeaders = buffered.indexOf("\r\n\r\n");
          if (endOfHeaders === -1) {
            debug("have not received end of HTTP headers yet...");
            read();
            return;
          }
          const headerParts = buffered.slice(0, endOfHeaders).toString("ascii").split("\r\n");
          const firstLine = headerParts.shift();
          if (!firstLine) {
            socket.destroy();
            return reject(new Error("No header received from proxy CONNECT response"));
          }
          const firstLineParts = firstLine.split(" ");
          const statusCode = +firstLineParts[1];
          const statusText = firstLineParts.slice(2).join(" ");
          const headers = {};
          for (const header of headerParts) {
            if (!header)
              continue;
            const firstColon = header.indexOf(":");
            if (firstColon === -1) {
              socket.destroy();
              return reject(new Error(`Invalid header from proxy CONNECT response: "${header}"`));
            }
            const key = header.slice(0, firstColon).toLowerCase();
            const value = header.slice(firstColon + 1).trimStart();
            const current = headers[key];
            if (typeof current === "string") {
              headers[key] = [current, value];
            } else if (Array.isArray(current)) {
              current.push(value);
            } else {
              headers[key] = value;
            }
          }
          debug("got proxy server response: %o %o", firstLine, headers);
          cleanup();
          resolve4({
            connect: {
              statusCode,
              statusText,
              headers
            },
            buffered
          });
        }
        socket.on("error", onerror);
        socket.on("end", onend);
        read();
      });
    }
    exports.parseProxyResponse = parseProxyResponse;
  }
});

// ../../node_modules/https-proxy-agent/dist/index.js
var require_dist2 = __commonJS({
  "../../node_modules/https-proxy-agent/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HttpsProxyAgent = void 0;
    var net = __importStar(__require("net"));
    var tls = __importStar(__require("tls"));
    var assert_1 = __importDefault(__require("assert"));
    var debug_1 = __importDefault(require_src());
    var agent_base_1 = require_dist();
    var url_1 = __require("url");
    var parse_proxy_response_1 = require_parse_proxy_response();
    var debug = (0, debug_1.default)("https-proxy-agent");
    var setServernameFromNonIpHost = (options) => {
      if (options.servername === void 0 && options.host && !net.isIP(options.host)) {
        return {
          ...options,
          servername: options.host
        };
      }
      return options;
    };
    var HttpsProxyAgent2 = class extends agent_base_1.Agent {
      constructor(proxy, opts) {
        super(opts);
        this.options = { path: void 0 };
        this.proxy = typeof proxy === "string" ? new url_1.URL(proxy) : proxy;
        this.proxyHeaders = opts?.headers ?? {};
        debug("Creating new HttpsProxyAgent instance: %o", this.proxy.href);
        const host = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, "");
        const port = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
        this.connectOpts = {
          // Attempt to negotiate http/1.1 for proxy servers that support http/2
          ALPNProtocols: ["http/1.1"],
          ...opts ? omit(opts, "headers") : null,
          host,
          port
        };
      }
      /**
       * Called when the node-core HTTP client library is creating a
       * new HTTP request.
       */
      async connect(req, opts) {
        const { proxy } = this;
        if (!opts.host) {
          throw new TypeError('No "host" provided');
        }
        let socket;
        if (proxy.protocol === "https:") {
          debug("Creating `tls.Socket`: %o", this.connectOpts);
          socket = tls.connect(setServernameFromNonIpHost(this.connectOpts));
        } else {
          debug("Creating `net.Socket`: %o", this.connectOpts);
          socket = net.connect(this.connectOpts);
        }
        const headers = typeof this.proxyHeaders === "function" ? this.proxyHeaders() : { ...this.proxyHeaders };
        const host = net.isIPv6(opts.host) ? `[${opts.host}]` : opts.host;
        let payload = `CONNECT ${host}:${opts.port} HTTP/1.1\r
`;
        if (proxy.username || proxy.password) {
          const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
          headers["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
        }
        headers.Host = `${host}:${opts.port}`;
        if (!headers["Proxy-Connection"]) {
          headers["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close";
        }
        for (const name of Object.keys(headers)) {
          payload += `${name}: ${headers[name]}\r
`;
        }
        const proxyResponsePromise = (0, parse_proxy_response_1.parseProxyResponse)(socket);
        socket.write(`${payload}\r
`);
        const { connect, buffered } = await proxyResponsePromise;
        req.emit("proxyConnect", connect);
        this.emit("proxyConnect", connect, req);
        if (connect.statusCode === 200) {
          req.once("socket", resume);
          if (opts.secureEndpoint) {
            debug("Upgrading socket connection to TLS");
            return tls.connect({
              ...omit(setServernameFromNonIpHost(opts), "host", "path", "port"),
              socket
            });
          }
          return socket;
        }
        socket.destroy();
        const fakeSocket = new net.Socket({ writable: false });
        fakeSocket.readable = true;
        req.once("socket", (s) => {
          debug("Replaying proxy buffer for failed request");
          (0, assert_1.default)(s.listenerCount("data") > 0);
          s.push(buffered);
          s.push(null);
        });
        return fakeSocket;
      }
    };
    HttpsProxyAgent2.protocols = ["http", "https"];
    exports.HttpsProxyAgent = HttpsProxyAgent2;
    function resume(socket) {
      socket.resume();
    }
    function omit(obj, ...keys) {
      const ret = {};
      let key;
      for (key in obj) {
        if (!keys.includes(key)) {
          ret[key] = obj[key];
        }
      }
      return ret;
    }
  }
});

// ../core/dist/skill-manager.js
import { createHash as createHash3, randomUUID } from "node:crypto";
import { lstat, mkdir, copyFile, readFile as readFile2, readdir as readdir2, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join as join2, resolve } from "node:path";
import { parse, stringify } from "yaml";

// ../core/dist/skill-manager-error.js
var SkillManagerError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "SkillManagerError";
    this.code = code;
  }
};

// ../core/dist/skill-fingerprint.js
import { Buffer as Buffer2 } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
var SKILL_IDENTITY_FINGERPRINT_VERSION = "dsm-skill-fingerprint-v1";
var MANAGER_PROVENANCE_METADATA_PATH = ".dsh-skill-manager/provenance.json";
var WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function fingerprintSkillFiles(inputFiles) {
  const comparablePaths = /* @__PURE__ */ new Set();
  const files = inputFiles.map((file) => ({ path: normalizeSkillPath(file.path), content: file.content })).filter((file) => file.path !== MANAGER_PROVENANCE_METADATA_PATH).sort((left, right) => left.path.localeCompare(right.path));
  if (files.length === 0)
    unsafeBundle("Skill bundle does not contain fingerprintable files.");
  const hash = createHash("sha256");
  hash.update(frame(Buffer2.from(SKILL_IDENTITY_FINGERPRINT_VERSION, "utf8")));
  for (const file of files) {
    const comparable = file.path.toLocaleLowerCase("en-US");
    if (comparablePaths.has(comparable)) {
      unsafeBundle("Skill bundle contains duplicate or case-colliding paths.");
    }
    comparablePaths.add(comparable);
    if (!(file.content instanceof Uint8Array))
      unsafeBundle("Skill bundle contains invalid file content.");
    const content = canonicalizeContent(file.content);
    hash.update(frame(Buffer2.from(file.path, "utf8")));
    hash.update(frame(content));
  }
  return { version: SKILL_IDENTITY_FINGERPRINT_VERSION, hash: hash.digest("hex") };
}
async function fingerprintSkillDirectory(root) {
  const files = [];
  await collectDirectoryFiles(root, "", files);
  return fingerprintSkillFiles(files);
}
async function collectDirectoryFiles(root, relative, files) {
  const directory = relative.length === 0 ? root : join(root, ...relative.split("/"));
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = normalizeSkillPath(relative.length === 0 ? entry.name : `${relative}/${entry.name}`);
    if (entry.isSymbolicLink())
      unsafeBundle("Skill bundle contains an unsupported symbolic link.");
    if (entry.isDirectory()) {
      await collectDirectoryFiles(root, path, files);
      continue;
    }
    if (!entry.isFile())
      unsafeBundle("Skill bundle contains an unsupported filesystem entry.");
    files.push({ path, content: await readFile(join(root, ...path.split("/"))) });
  }
}
function normalizeSkillPath(value) {
  const path = value.replaceAll("\\", "/");
  if (path.length === 0 || path.startsWith("/") || path.includes("\0") || path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".." || /[<>:"|?*\u0000-\u001f]/u.test(segment) || /[. ]$/u.test(segment) || WINDOWS_RESERVED_NAME.test(segment)))
    unsafeBundle("Skill bundle contains an unsafe relative path.");
  return path;
}
function canonicalizeContent(content) {
  const bytes = Buffer2.from(content);
  if (!isUtf8Text(bytes))
    return bytes;
  const normalized = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 13) {
      if (bytes[index + 1] === 10)
        index += 1;
      normalized.push(10);
    } else {
      normalized.push(bytes[index]);
    }
  }
  return Buffer2.from(normalized);
}
function isUtf8Text(content) {
  try {
    UTF8_DECODER.decode(content);
  } catch {
    return false;
  }
  const sample = content.subarray(0, Math.min(content.byteLength, 4096));
  let controls = 0;
  for (const byte of sample) {
    if (byte === 0)
      return false;
    if (byte < 9 || byte > 13 && byte < 32)
      controls += 1;
  }
  return sample.byteLength === 0 || controls / sample.byteLength <= 0.05;
}
function frame(value) {
  const length = Buffer2.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(value.byteLength));
  return Buffer2.concat([length, value]);
}
function unsafeBundle(message) {
  throw new SkillManagerError("UNSAFE_SKILL_BUNDLE", message);
}

// ../core/dist/marketplace/github-bundle.js
import { Buffer as Buffer3 } from "node:buffer";
import { createHash as createHash2 } from "node:crypto";

// ../core/dist/marketplace/types.js
var MarketplaceSourceError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "MarketplaceSourceError";
  }
};
var MarketplaceResolverError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "MarketplaceResolverError";
  }
};

// ../core/dist/marketplace/github-bundle.js
var GITHUB_API_ROOT = "https://api.github.com";
var DEFAULT_TIMEOUT_MS = 1e4;
var MAX_FILE_COUNT = 512;
var MAX_FILE_BYTES = 10 * 1024 * 1024;
var MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
var SHA_PATTERN = /^[a-f0-9]{40}$/i;
var GITHUB_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
var SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
var WINDOWS_RESERVED_NAME2 = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
function createGitHubBundleFetcher(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Marketplace installation timeout must be a positive integer in milliseconds.");
  }
  return {
    async fetchBundle(entry, request = {}) {
      assertInstallEntry(entry);
      return fetchWithBoundary(fetch, entry, request.signal, timeoutMs, options.snapshotCache);
    }
  };
}
function createGitHubUpdateChecker(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  return {
    async checkLatest(name, source, request = {}) {
      assertUpdateSource(name, source);
      const [owner, repositoryName] = source.repository.split("/");
      const repositoryPayload = await getJson(fetch, `${GITHUB_API_ROOT}/repos/${source.repository}`, request.signal ?? new AbortController().signal);
      const defaultBranch = parseDefaultBranch(repositoryPayload);
      const commitPayload = await getJson(fetch, `${GITHUB_API_ROOT}/repos/${source.repository}/commits/${encodeURIComponent(defaultBranch)}`, request.signal ?? new AbortController().signal);
      const commitSha = parseCommitSha(commitPayload);
      const treePayload = await getJson(fetch, `${GITHUB_API_ROOT}/repos/${owner}/${repositoryName}/git/trees/${commitSha}?recursive=1`, request.signal ?? new AbortController().signal);
      const treeFiles = parseDirectoryTree(treePayload, source.path, source.manifestFiles);
      const skillDocument = treeFiles.find((file) => file.relativePath === "SKILL.md");
      if (skillDocument === void 0) {
        throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "GitHub source directory no longer contains SKILL.md.");
      }
      return {
        commitSha,
        blobSha: skillDocument.sha,
        bundleHash: hashTreeFiles(treeFiles)
      };
    }
  };
}
async function fetchWithBoundary(fetch, entry, callerSignal, timeoutMs, snapshotCache) {
  if (callerSignal?.aborted) {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace installation was cancelled.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const cancelFromCaller = () => {
    callerAborted = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace installation was cancelled."));
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace installation exceeded ${timeoutMs} ms.`));
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([
      downloadBundle(fetch, entry, controller.signal, snapshotCache),
      boundary
    ]);
  } catch (error) {
    if (timedOut) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace installation exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || callerSignal?.aborted) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace installation was cancelled.", { cause: error });
    }
    if (error instanceof MarketplaceResolverError || error instanceof SkillManagerError) {
      throw error;
    }
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "Unable to fetch the GitHub Skill bundle.", { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function downloadBundle(fetch, entry, signal, snapshotCache) {
  const repository = `${entry.repository.owner}/${entry.repository.name}`;
  if (snapshotCache !== void 0) {
    return await snapshotCache.withSnapshot(entry.repository, signal, async (snapshot) => {
      if (snapshot.commit !== entry.snapshot.commitSha) {
        throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Repository changed after Inspection; prepare the installation again.");
      }
      const treeFiles2 = parseTree({ truncated: false, tree: snapshot.tree }, entry);
      const files2 = [];
      for (const treeFile of treeFiles2) {
        const content = await snapshot.readFile(treeFile.repositoryPath);
        if (content.byteLength !== treeFile.size || gitBlobSha(content) !== treeFile.sha) {
          invalidGitHubResponse();
        }
        files2.push({
          path: treeFile.relativePath,
          content,
          blobSha: treeFile.sha,
          size: treeFile.size,
          mode: treeFile.mode
        });
      }
      return { files: files2, bundleHash: hashTreeFiles(treeFiles2) };
    });
  }
  const treePayload = await getJson(fetch, `${GITHUB_API_ROOT}/repos/${repository}/git/trees/${entry.snapshot.commitSha}?recursive=1`, signal);
  const treeFiles = parseTree(treePayload, entry);
  const files = [];
  for (const treeFile of treeFiles) {
    const payload = await getJson(fetch, `${GITHUB_API_ROOT}/repos/${repository}/git/blobs/${treeFile.sha}`, signal);
    files.push({
      path: treeFile.relativePath,
      content: parseBlob(payload, treeFile),
      blobSha: treeFile.sha,
      size: treeFile.size,
      mode: treeFile.mode
    });
  }
  return {
    files,
    bundleHash: hashTreeFiles(treeFiles)
  };
}
async function getJson(fetch, url, signal) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager"
    },
    signal
  });
  if (!response.ok) {
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
      throw new MarketplaceResolverError("GITHUB_RATE_LIMITED", "GitHub API rate limit was exceeded.");
    }
    throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub request failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned malformed JSON.", { cause: error });
  }
}
function assertInstallEntry(entry) {
  const repository = `${entry.repository.owner}/${entry.repository.name}`;
  const expectedId = `${repository}/${entry.install.skill}`;
  const rootSkill = entry.repository.path === ".";
  if (entry.repository.host !== "github" || !GITHUB_SEGMENT.test(entry.repository.owner) || !GITHUB_SEGMENT.test(entry.repository.name) || entry.install.kind !== "github" || entry.install.repository !== repository || !SKILL_NAME.test(entry.install.skill) || entry.id !== expectedId || entry.install.path !== entry.repository.path || !rootSkill && !isSafeRelativePath(entry.repository.path) || !SHA_PATTERN.test(entry.snapshot.commitSha) || !SHA_PATTERN.test(entry.snapshot.blobSha) || !isValidManifestFiles(entry.snapshot.manifestFiles)) {
    throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Resolved marketplace entry has inconsistent or unsafe installation identity.");
  }
}
function parseTree(payload, entry) {
  const files = parseDirectoryTree(payload, entry.repository.path, entry.snapshot.manifestFiles);
  const skillDocument = files.find((file) => file.relativePath === "SKILL.md");
  if (skillDocument?.sha !== entry.snapshot.blobSha) {
    throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Resolved SKILL.md blob no longer matches the selected snapshot.");
  }
  return files;
}
function parseDirectoryTree(payload, directoryPath, manifestFiles = []) {
  if (!isRecord(payload) || typeof payload.truncated !== "boolean" || !Array.isArray(payload.tree)) {
    invalidGitHubResponse();
  }
  if (payload.truncated) {
    throw new MarketplaceResolverError("GITHUB_TREE_TRUNCATED", "GitHub returned a truncated repository tree.");
  }
  const rootSkill = directoryPath === ".";
  const prefix = rootSkill ? "" : `${directoryPath}/`;
  const files = [];
  const comparablePaths = /* @__PURE__ */ new Set();
  let totalBytes = 0;
  let skillDocumentFound = false;
  for (const item of payload.tree) {
    if (!isRecord(item) || typeof item.path !== "string" || !item.path.startsWith(prefix))
      continue;
    if (isAgentInstructionPath(item.path))
      continue;
    if (rootSkill && !isRootSkillBundlePath(item.path, manifestFiles))
      continue;
    if (!isSafeRelativePath(item.path))
      unsafeBundle2(`Unsafe repository path "${item.path}".`);
    if (item.type === "tree")
      continue;
    if (item.type !== "blob" || item.mode !== "100644" && item.mode !== "100755") {
      unsafeBundle2(`Unsupported repository entry "${item.path}".`);
    }
    const sha = readSha(item.sha);
    const size = readSize(item.size);
    if (sha === void 0 || size === void 0)
      invalidGitHubResponse();
    if (size > MAX_FILE_BYTES)
      tooLarge(`Skill file "${item.path}" exceeds the size limit.`);
    const relativePath = item.path.slice(prefix.length);
    if (!isSafeRelativePath(relativePath))
      unsafeBundle2(`Unsafe Skill path "${relativePath}".`);
    const comparable = relativePath.toLowerCase();
    if (comparablePaths.has(comparable)) {
      unsafeBundle2(`Skill bundle contains a duplicate path "${relativePath}".`);
    }
    comparablePaths.add(comparable);
    totalBytes += size;
    if (totalBytes > MAX_BUNDLE_BYTES)
      tooLarge("Skill bundle exceeds the total size limit.");
    files.push({
      repositoryPath: item.path,
      relativePath,
      mode: item.mode,
      sha,
      size
    });
    if (relativePath === "SKILL.md")
      skillDocumentFound = true;
  }
  if (!skillDocumentFound) {
    throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Resolved Skill directory does not contain the selected SKILL.md blob.");
  }
  if (files.length > MAX_FILE_COUNT)
    tooLarge("Skill bundle contains too many files.");
  return files.sort((left, right) => {
    if (left.relativePath === "SKILL.md")
      return -1;
    if (right.relativePath === "SKILL.md")
      return 1;
    return left.relativePath.localeCompare(right.relativePath);
  });
}
function assertUpdateSource(name, source) {
  const segments = source.repository.split("/");
  if (!SKILL_NAME.test(name) || segments.length !== 2 || !segments.every((segment) => GITHUB_SEGMENT.test(segment)) || source.path !== "." && !isSafeRelativePath(source.path) || !SHA_PATTERN.test(source.commitSha) || !SHA_PATTERN.test(source.blobSha) || !/^[a-f0-9]{64}$/i.test(source.bundleHash) || !isValidManifestFiles(source.manifestFiles)) {
    throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Managed GitHub source has inconsistent or unsafe update identity.");
  }
}
function isRootSkillBundlePath(path, manifestFiles) {
  return !isAgentInstructionPath(path) && (path === "SKILL.md" || path.startsWith("scripts/") || path.startsWith("references/") || path.startsWith("assets/") || manifestFiles.includes(path));
}
function isValidManifestFiles(value) {
  if (value === void 0)
    return true;
  if (!Array.isArray(value) || new Set(value).size !== value.length)
    return false;
  return value.every((path) => isSafeRelativePath(path) && !isAgentInstructionPath(path));
}
function isAgentInstructionPath(path) {
  return /^(?:AGENTS|CLAUDE)\.md$/iu.test(path.split("/").at(-1) ?? "");
}
function parseDefaultBranch(payload) {
  if (!isRecord(payload) || typeof payload.default_branch !== "string")
    invalidGitHubResponse();
  const branch = payload.default_branch.trim();
  if (branch.length === 0)
    invalidGitHubResponse();
  return branch;
}
function parseCommitSha(payload) {
  if (!isRecord(payload))
    invalidGitHubResponse();
  const sha = readSha(payload.sha);
  if (sha === void 0)
    invalidGitHubResponse();
  return sha;
}
function parseBlob(payload, expected) {
  if (!isRecord(payload) || payload.encoding !== "base64")
    invalidGitHubResponse();
  const sha = readSha(payload.sha);
  const size = readSize(payload.size);
  const rawContent2 = typeof payload.content === "string" ? payload.content.replace(/\s/g, "") : void 0;
  if (sha !== expected.sha || size !== expected.size || rawContent2 === void 0) {
    invalidGitHubResponse();
  }
  if (!BASE64_PATTERN.test(rawContent2))
    invalidGitHubResponse();
  const content = Buffer3.from(rawContent2, "base64");
  if (content.byteLength !== expected.size)
    invalidGitHubResponse();
  const computedSha = gitBlobSha(content);
  if (computedSha !== expected.sha)
    invalidGitHubResponse();
  return content;
}
function gitBlobSha(content) {
  return createHash2("sha1").update(`blob ${content.byteLength}\0`).update(content).digest("hex");
}
function hashTreeFiles(files) {
  const hash = createHash2("sha256");
  for (const file of [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(file.sha);
    hash.update("\0");
    hash.update(String(file.size));
    hash.update("\0");
  }
  return hash.digest("hex");
}
function isSafeRelativePath(path) {
  if (path.length === 0 || path.includes("\\") || path.includes("\0"))
    return false;
  return path.split("/").every((segment) => {
    if (segment.length === 0 || segment === "." || segment === ".." || /[<>:"|?*\u0000-\u001f]/u.test(segment) || /[. ]$/u.test(segment) || WINDOWS_RESERVED_NAME2.test(segment))
      return false;
    return true;
  });
}
function readSha(value) {
  return typeof value === "string" && SHA_PATTERN.test(value) ? value : void 0;
}
function readSize(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : void 0;
}
function unsafeBundle2(message) {
  throw new SkillManagerError("MARKETPLACE_BUNDLE_UNSAFE", message);
}
function tooLarge(message) {
  throw new SkillManagerError("MARKETPLACE_BUNDLE_TOO_LARGE", message);
}
function invalidGitHubResponse() {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an unsupported response shape.");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../core/dist/skill-manager.js
var SKILL_NAME2 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var REGISTRY_VERSION = 1;
var DEFAULT_BODY = "Describe how this Skill should guide the agent.\n";
var DEFAULT_MARKETPLACE_TIMEOUT_MS = 1e4;
var PROVENANCE_TIMEOUT_MS = 3e4;
var PROVENANCE_CONCURRENCY = 2;
var UPDATE_CONCURRENCY = 4;
var BACKUP_VERSION = 1;
var TRASH_VERSION = 1;
var TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_SNAPSHOT_FILE_COUNT = 512;
var MAX_SNAPSHOT_FILE_BYTES = 10 * 1024 * 1024;
var MAX_SNAPSHOT_BUNDLE_BYTES = 25 * 1024 * 1024;
var WINDOWS_RESERVED_NAME3 = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createSkillManager(options) {
  const root = resolve(options.root);
  const libraryRoot = join2(root, "library");
  const activeRoot = resolve(options.dshRoot ?? join2(root, "active"));
  const targetRoots = resolveTargetRoots(options.targetRoots);
  const backupRoot = join2(root, "backups");
  const trashRoot = join2(root, "trash");
  const registryPath = join2(root, "registry.json");
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  let recovery;
  const ensureRecovered = async () => {
    recovery ??= recoverInterruptedReplacements(root, libraryRoot, registryPath);
    await recovery;
    await purgeExpiredTrash(trashRoot, now);
  };
  return {
    async createSkill(request) {
      await ensureRecovered();
      validateCreateRequest(request);
      await mkdir(libraryRoot, { recursive: true });
      const destination = join2(libraryRoot, request.name);
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${request.name}" already exists.`);
      }
      const temporary = join2(libraryRoot, `.create-${request.name}-${randomUUID()}`);
      const body = `# ${request.name}

${DEFAULT_BODY}`;
      const document2 = renderSkillDocument(request, body);
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      const skill = {
        name: request.name,
        description: request.description.trim(),
        origin: "self",
        enabledTargets: [],
        createdAt: now2,
        updatedAt: now2,
        contentHash: "",
        relativePath: join2("library", request.name)
      };
      await mkdir(temporary, { recursive: false });
      try {
        await writeFile(join2(temporary, "SKILL.md"), document2, "utf8");
        skill.contentHash = await hashSkillBundle(temporary);
        await rename(temporary, destination);
        const registry = await readRegistry(registryPath);
        registry.skills[request.name] = skill;
        try {
          await writeRegistry(root, registryPath, registry);
        } catch (error) {
          await rm(destination, { force: true, recursive: true });
          throw error;
        }
      } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
      }
      return toManagedSkill(skill);
    },
    async getSkill(name) {
      await ensureRecovered();
      if (!SKILL_NAME2.test(name))
        return void 0;
      const registry = await readRegistry(registryPath);
      const entry = registry.skills[name];
      if (entry === void 0)
        return void 0;
      const document2 = await readFile2(join2(root, entry.relativePath, "SKILL.md"), "utf8");
      const parsed = parseSkillDocument(document2);
      return {
        ...toManagedSkill(entry),
        description: parsed.description,
        content: parsed.content
      };
    },
    async listSkills() {
      await ensureRecovered();
      const registry = await readRegistry(registryPath);
      return Object.values(registry.skills).map(toManagedSkill).sort((left, right) => left.name.localeCompare(right.name));
    },
    async discoverExternalSkills(request = {}) {
      await ensureRecovered();
      return discoverExternalSkills(targetRoots, request);
    },
    async importSkill(request) {
      await ensureRecovered();
      validateExternalSkillName(request.name);
      const sourceRoot = requireTargetRoot(targetRoots, request.target);
      const sourcePath = join2(sourceRoot, request.name);
      await assertDirectExternalSkillDirectory(sourcePath, request.name);
      const sourceDocument = await readFile2(join2(sourcePath, "SKILL.md"), "utf8").catch((error) => {
        throw new SkillManagerError("SKILL_SOURCE_INVALID", `Skill "${request.name}" was not found in the configured ${request.target} root.`, { cause: error });
      });
      const parsed = parseExternalSkillDocument(sourceDocument, request.name);
      validateCreateRequest({ name: parsed.name, description: parsed.description });
      if (parsed.name !== request.name) {
        throw new SkillManagerError("SKILL_SOURCE_INVALID", `Skill directory "${request.name}" declares the different name "${parsed.name}".`);
      }
      await mkdir(libraryRoot, { recursive: true });
      const destination = join2(libraryRoot, parsed.name);
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${parsed.name}" already exists.`);
      }
      const temporary = join2(libraryRoot, `.import-${parsed.name}-${randomUUID()}`);
      await mkdir(temporary, { recursive: false });
      try {
        await copySkillBundle(sourcePath, temporary);
        const staged = parseExternalSkillDocument(await readFile2(join2(temporary, "SKILL.md"), "utf8"), request.name);
        validateCreateRequest({ name: staged.name, description: staged.description });
        if (staged.name !== parsed.name || staged.description !== parsed.description) {
          throw new SkillManagerError("SKILL_SOURCE_INVALID", `External Skill "${request.name}" changed during import.`);
        }
        const now2 = (/* @__PURE__ */ new Date()).toISOString();
        const skill = {
          name: staged.name,
          description: staged.description,
          origin: "self",
          enabledTargets: [],
          createdAt: now2,
          updatedAt: now2,
          contentHash: await hashSkillBundle(temporary),
          relativePath: join2("library", staged.name),
          source: {
            kind: "local-import",
            name: request.name,
            target: request.target
          }
        };
        await rename(temporary, destination);
        const registry = await readRegistry(registryPath);
        registry.skills[parsed.name] = skill;
        try {
          await writeRegistry(root, registryPath, registry);
        } catch (error) {
          await rm(destination, { force: true, recursive: true });
          throw error;
        }
        return toManagedSkill(skill);
      } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
      }
    },
    async installMarketplaceSkill(request) {
      await ensureRecovered();
      const name = request.entry.install.skill;
      const destination = join2(libraryRoot, name);
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${name}" already exists.`);
      }
      const bundle = await createGitHubBundleFetcher({
        ...options.fetch === void 0 ? {} : { fetch: options.fetch },
        ...options.snapshotCache === void 0 ? {} : { snapshotCache: options.snapshotCache },
        ...options.marketplaceTimeoutMs === void 0 ? {} : { timeoutMs: options.marketplaceTimeoutMs }
      }).fetchBundle(request.entry, {
        ...request.signal === void 0 ? {} : { signal: request.signal }
      });
      await mkdir(libraryRoot, { recursive: true });
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${name}" already exists.`);
      }
      const temporary = join2(libraryRoot, `.market-${name}-${randomUUID()}`);
      await mkdir(temporary, { recursive: false });
      try {
        await writeBundleFiles(temporary, bundle.files);
        const document2 = await readFile2(join2(temporary, "SKILL.md"), "utf8");
        const parsed = parseSkillDocument(document2);
        validateCreateRequest({ name: parsed.name, description: parsed.description });
        if (parsed.name !== name || parsed.description !== request.entry.description) {
          throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Downloaded SKILL.md metadata does not match the resolved marketplace entry.");
        }
        const timestamp = now().toISOString();
        const identityFingerprint = fingerprintSkillFiles(bundle.files);
        const skill = {
          name,
          description: parsed.description,
          origin: "github",
          enabledTargets: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          contentHash: await hashSkillBundle(temporary),
          relativePath: join2("library", name),
          source: {
            kind: "github",
            repository: request.entry.install.repository,
            path: request.entry.install.path,
            commitSha: request.entry.snapshot.commitSha,
            blobSha: request.entry.snapshot.blobSha,
            bundleHash: bundle.bundleHash,
            ...request.entry.snapshot.manifestFiles === void 0 ? {} : { manifestFiles: request.entry.snapshot.manifestFiles },
            catalog: request.entry.source,
            url: request.entry.repository.url,
            repositoryId: request.entry.repository.id,
            nodeId: request.entry.repository.nodeId,
            matchMethod: "install",
            matchedAt: timestamp,
            identityFingerprint,
            discoverySources: [...request.entry.catalogs ?? [request.entry.source]]
          }
        };
        await rename(temporary, destination);
        const registry = await readRegistry(registryPath);
        registry.skills[name] = skill;
        try {
          await writeRegistry(root, registryPath, registry);
          await recordGitHubObservation(options, observationFromEntry(request.entry, bundle.bundleHash, identityFingerprint, timestamp));
        } catch (error) {
          await rm(destination, { force: true, recursive: true });
          throw error;
        }
        return toManagedSkill(skill);
      } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
      }
    },
    async installSkillSnapshot(request) {
      await ensureRecovered();
      const { repository, skill, snapshot } = request.resolved;
      const files = validateResolvedSkillSnapshot(request.resolved);
      const name = skill.name;
      const destination = join2(libraryRoot, name);
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${name}" already exists.`);
      }
      await mkdir(libraryRoot, { recursive: true });
      if (await pathExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${name}" already exists.`);
      }
      const temporary = join2(libraryRoot, `.market-${name}-${randomUUID()}`);
      await mkdir(temporary, { recursive: false });
      try {
        await writeBundleFiles(temporary, files);
        const document2 = await readFile2(join2(temporary, "SKILL.md"), "utf8");
        const parsed = parseSkillDocument(document2);
        validateCreateRequest({ name: parsed.name, description: parsed.description });
        if (parsed.name !== name || parsed.description !== skill.description) {
          throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Downloaded SKILL.md metadata does not match the resolved Skill snapshot.");
        }
        const timestamp = now().toISOString();
        const identityFingerprint = fingerprintSkillFiles(files);
        const registrySkill = {
          name,
          description: parsed.description,
          origin: "github",
          enabledTargets: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          contentHash: await hashSkillBundle(temporary),
          relativePath: join2("library", name),
          source: {
            kind: "github",
            repository: `${repository.owner}/${repository.name}`,
            path: skill.path,
            commitSha: snapshot.commitSha,
            blobSha: snapshot.skillDocumentBlobSha,
            bundleHash: snapshot.bundleHash,
            ...skill.manifestFiles.length === 0 ? {} : { manifestFiles: skill.manifestFiles },
            catalog: "github",
            url: repository.url,
            repositoryId: repository.repositoryId,
            nodeId: repository.nodeId,
            matchMethod: "install",
            matchedAt: timestamp,
            identityFingerprint,
            discoverySources: ["github"]
          }
        };
        await rename(temporary, destination);
        const registry = await readRegistry(registryPath);
        registry.skills[name] = registrySkill;
        try {
          await writeRegistry(root, registryPath, registry);
          await recordGitHubObservation(options, observationFromResolvedSnapshot(request.resolved, identityFingerprint, timestamp));
        } catch (error) {
          await rm(destination, { force: true, recursive: true });
          throw error;
        }
        return toManagedSkill(registrySkill);
      } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
      }
    },
    async getProvenanceHints(name) {
      await ensureRecovered();
      validateManagedName(name);
      const registry = await readRegistry(registryPath);
      const skill = registry.skills[name];
      if (skill === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${name}" was not found.`);
      }
      return parseProvenanceHints(await readFile2(join2(root, skill.relativePath, "SKILL.md"), "utf8"));
    },
    async verifyMarketplaceProvenance(request) {
      await ensureRecovered();
      validateManagedName(request.name);
      if (request.entries.length > 20) {
        throw new SkillManagerError("INVALID_PROVENANCE_CANDIDATES", "Automatic provenance verification accepts at most 20 candidate Skill paths.");
      }
      const initialRegistry = await readRegistry(registryPath);
      const initialSkill = initialRegistry.skills[request.name];
      if (initialSkill === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${request.name}" was not found.`);
      }
      if (initialSkill.source?.kind === "github") {
        if (options.snapshotResolver !== void 0) {
          const resolved = await resolveManagedSkillSnapshot(options, request.name, initialSkill.source, request.signal);
          validateResolvedSkillSnapshot(resolved);
          initialSkill.source = {
            ...initialSkill.source,
            repository: `${resolved.repository.owner}/${resolved.repository.name}`,
            repositoryId: resolved.repository.repositoryId,
            nodeId: resolved.repository.nodeId,
            url: resolved.repository.url,
            path: resolved.skill.path
          };
          await writeRegistry(root, registryPath, initialRegistry);
          await recordGitHubObservation(options, observationFromResolvedSnapshot(resolved, fingerprintSkillFiles(resolved.files), now().toISOString()));
        }
        return { name: request.name, status: "matched", skill: toManagedSkill(initialSkill) };
      }
      const sourcePath = join2(root, initialSkill.relativePath);
      if (await hashSkillBundle(sourcePath) !== initialSkill.contentHash) {
        initialSkill.provenanceCheck = { status: "ineligible", checkedAt: now().toISOString() };
        await writeRegistry(root, registryPath, initialRegistry);
        return { name: request.name, status: "ineligible", skill: toManagedSkill(initialSkill) };
      }
      const identityFingerprint = await fingerprintSkillDirectory(sourcePath);
      const indexed = options.githubSkillIndex === void 0 ? [] : await options.githubSkillIndex.findByFingerprint(identityFingerprint);
      const candidates = limitProvenanceCandidates(deduplicateProvenanceEntries([
        ...indexed.map(entryFromObservation),
        ...request.entries
      ]));
      const fetcher = createGitHubBundleFetcher({
        ...options.fetch === void 0 ? {} : { fetch: options.fetch },
        ...options.snapshotCache === void 0 ? {} : { snapshotCache: options.snapshotCache },
        ...options.marketplaceTimeoutMs === void 0 ? {} : { timeoutMs: options.marketplaceTimeoutMs }
      });
      const matches3 = [];
      const provenanceController = new AbortController();
      let timedOut = false;
      const cancelFromCaller = () => provenanceController.abort(request.signal?.reason);
      request.signal?.addEventListener("abort", cancelFromCaller, { once: true });
      const provenanceTimer = setTimeout(() => {
        timedOut = true;
        provenanceController.abort();
      }, PROVENANCE_TIMEOUT_MS);
      let nextCandidate = 0;
      const worker = async () => {
        while (!provenanceController.signal.aborted) {
          const entry = candidates[nextCandidate++];
          if (entry === void 0)
            return;
          try {
            const bundle = await fetcher.fetchBundle(entry, { signal: provenanceController.signal });
            const remoteFingerprint = fingerprintSkillFiles(bundle.files);
            await recordGitHubObservation(options, observationFromEntry(entry, bundle.bundleHash, remoteFingerprint, now().toISOString()));
            if (remoteFingerprint.hash === identityFingerprint.hash) {
              matches3.push({ entry, bundleHash: bundle.bundleHash, identityFingerprint: remoteFingerprint });
            }
          } catch (error) {
            if (provenanceController.signal.aborted)
              throw error;
          }
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(PROVENANCE_CONCURRENCY, candidates.length) }, () => worker()));
      } catch (error) {
        if (timedOut) {
          throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `GitHub provenance verification exceeded ${PROVENANCE_TIMEOUT_MS} ms.`, { cause: error });
        }
        if (request.signal?.aborted) {
          throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "GitHub provenance verification was cancelled.", { cause: error });
        }
        throw error;
      } finally {
        clearTimeout(provenanceTimer);
        request.signal?.removeEventListener("abort", cancelFromCaller);
      }
      if (provenanceController.signal.aborted) {
        throw new MarketplaceResolverError(timedOut ? "MARKETPLACE_RESOLUTION_TIMEOUT" : "MARKETPLACE_RESOLUTION_ABORTED", timedOut ? `GitHub provenance verification exceeded ${PROVENANCE_TIMEOUT_MS} ms.` : "GitHub provenance verification was cancelled.");
      }
      const uniqueMatches = deduplicateProvenanceMatches(matches3);
      if (uniqueMatches.length !== 1) {
        const status = uniqueMatches.length === 0 ? "custom" : "ambiguous";
        initialSkill.provenanceCheck = { status, checkedAt: now().toISOString() };
        await writeRegistry(root, registryPath, initialRegistry);
        return {
          name: request.name,
          status,
          skill: toManagedSkill(initialSkill)
        };
      }
      const registry = await readRegistry(registryPath);
      const skill = registry.skills[request.name];
      if (skill === void 0 || skill.contentHash !== initialSkill.contentHash || skill.source?.kind === "github" || await hashSkillBundle(join2(root, skill.relativePath)) !== skill.contentHash) {
        throw new SkillManagerError("SKILL_PROVENANCE_CHANGED", `Skill "${request.name}" changed during provenance verification.`);
      }
      const match = uniqueMatches[0];
      const catalog = match.entry.catalogs.includes("hugging-face") ? "hugging-face" : "github";
      skill.origin = "github";
      delete skill.provenanceCheck;
      skill.source = {
        kind: "github",
        repository: match.entry.install.repository,
        path: match.entry.install.path,
        commitSha: match.entry.snapshot.commitSha,
        blobSha: match.entry.snapshot.blobSha,
        bundleHash: match.bundleHash,
        ...match.entry.snapshot.manifestFiles === void 0 ? {} : { manifestFiles: match.entry.snapshot.manifestFiles },
        catalog,
        url: match.entry.repository.url,
        repositoryId: match.entry.repository.id,
        nodeId: match.entry.repository.nodeId,
        matchMethod: "exact-content",
        matchedAt: now().toISOString(),
        identityFingerprint: match.identityFingerprint,
        discoverySources: [...match.entry.catalogs ?? [match.entry.source]]
      };
      skill.updatedAt = now().toISOString();
      await writeRegistry(root, registryPath, registry);
      return { name: request.name, status: "matched", skill: toManagedSkill(skill) };
    },
    async checkUpdates(request = {}) {
      await ensureRecovered();
      const registry = await readRegistry(registryPath);
      const names = request.names === void 0 ? Object.keys(registry.skills).sort((left, right) => left.localeCompare(right)) : normalizeUpdateNames(request.names, registry);
      const checkedAt = now().toISOString();
      const checks = [];
      const remoteChecks = [];
      for (const name of names) {
        const skill = registry.skills[name];
        if (skill.source?.kind !== "github") {
          checks.push({ name, status: "unsupported", installed: null, latest: null, latestRisk: null, checkedAt });
          continue;
        }
        const installed = {
          commitSha: skill.source.commitSha,
          blobSha: skill.source.blobSha,
          bundleHash: skill.source.bundleHash
        };
        const currentHash = await hashSkillBundle(join2(root, skill.relativePath));
        if (currentHash !== skill.contentHash) {
          checks.push({
            name,
            status: "local-modified",
            installed,
            latest: null,
            latestRisk: null,
            checkedAt
          });
          continue;
        }
        remoteChecks.push({ index: checks.length, name, skill });
        checks.push({ name, status: "up-to-date", installed, latest: installed, latestRisk: null, checkedAt });
      }
      if (remoteChecks.length > 0) {
        await checkRemoteUpdates(remoteChecks, checks, options, request.signal, checkedAt);
      }
      return checks;
    },
    async updateSkill(request) {
      await ensureRecovered();
      validateManagedName(request.name);
      const registry = await readRegistry(registryPath);
      const installedSkill = registry.skills[request.name];
      if (installedSkill === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${request.name}" was not found.`);
      }
      if (installedSkill.source?.kind !== "github") {
        throw new SkillManagerError("SKILL_UPDATE_UNSUPPORTED", `Skill "${request.name}" does not have an updateable GitHub source.`);
      }
      const destination = join2(root, installedSkill.relativePath);
      await assertBundleUnmodified(destination, installedSkill);
      const installedSnapshot = snapshotFromSkill(installedSkill);
      const updateDeadline = createMarketplaceDeadline(options.marketplaceTimeoutMs);
      const checks = [{
        name: request.name,
        status: "up-to-date",
        installed: installedSnapshot,
        latest: installedSnapshot,
        latestRisk: null,
        checkedAt: now().toISOString()
      }];
      await checkRemoteUpdates([{ index: 0, name: request.name, skill: installedSkill }], checks, {
        ...options,
        marketplaceTimeoutMs: remainingMarketplaceTimeout(updateDeadline)
      }, request.signal, checks[0].checkedAt);
      const latest = checks[0].latest;
      if (checks[0].status === "source-moved") {
        throw new SkillManagerError("SKILL_SOURCE_MOVED", `Skill "${request.name}" is no longer available at its verified GitHub path.`);
      }
      if (latest === null) {
        throw new SkillManagerError("REGISTRY_INVALID", "GitHub update check returned no snapshot.");
      }
      if (latest.bundleHash === installedSnapshot.bundleHash) {
        throw new SkillManagerError("SKILL_ALREADY_CURRENT", `Skill "${request.name}" is already current.`);
      }
      let finalFiles;
      let finalSnapshot = latest;
      let finalResolved;
      if (options.snapshotResolver !== void 0) {
        finalResolved = await resolveManagedSkillSnapshot(options, request.name, installedSkill.source, request.signal);
        finalFiles = validateResolvedSkillSnapshot(finalResolved);
        finalSnapshot = {
          commitSha: finalResolved.snapshot.commitSha,
          blobSha: finalResolved.snapshot.skillDocumentBlobSha,
          bundleHash: finalResolved.snapshot.bundleHash
        };
        if (finalSnapshot.bundleHash === installedSnapshot.bundleHash) {
          throw new SkillManagerError("SKILL_ALREADY_CURRENT", `Skill "${request.name}" is already current.`);
        }
        const assessment = options.riskAssessor?.assessResolvedSkillRisk(finalResolved) ?? null;
        if ((assessment === null || assessment.risk === "unknown" || assessment.risk === "high") && request.acknowledgeHighRisk !== true) {
          throw new SkillManagerError("SKILL_UPDATE_RISK_CONFIRMATION_REQUIRED", "The final GitHub Skill snapshot has high or unknown content risk. Review it and confirm the update again.");
        }
      } else {
        const bundle = await createGitHubBundleFetcher({
          ...options.fetch === void 0 ? {} : { fetch: options.fetch },
          timeoutMs: remainingMarketplaceTimeout(updateDeadline)
        }).fetchBundle(updateEntry(installedSkill, latest, checks[0].checkedAt), {
          ...request.signal === void 0 ? {} : { signal: request.signal }
        });
        if (bundle.bundleHash !== latest.bundleHash) {
          throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Downloaded update no longer matches the checked GitHub snapshot.");
        }
        finalFiles = bundle.files;
      }
      const temporary = join2(libraryRoot, `.update-${request.name}-${randomUUID()}`);
      await mkdir(temporary, { recursive: false });
      try {
        await writeBundleFiles(temporary, finalFiles);
        const document2 = await readFile2(join2(temporary, "SKILL.md"), "utf8");
        const parsed = parseSkillDocument(document2);
        validateCreateRequest({ name: parsed.name, description: parsed.description });
        if (parsed.name !== request.name) {
          throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Updated SKILL.md name does not match the managed Skill.");
        }
        const timestamp = now().toISOString();
        const identityFingerprint = fingerprintSkillFiles(finalFiles);
        const updatedSkill = {
          ...installedSkill,
          description: parsed.description,
          updatedAt: timestamp,
          contentHash: await hashSkillBundle(temporary),
          source: {
            ...installedSkill.source,
            commitSha: finalSnapshot.commitSha,
            blobSha: finalSnapshot.blobSha,
            bundleHash: finalSnapshot.bundleHash,
            ...finalResolved === void 0 ? {} : {
              repository: `${finalResolved.repository.owner}/${finalResolved.repository.name}`,
              repositoryId: finalResolved.repository.repositoryId,
              nodeId: finalResolved.repository.nodeId,
              url: finalResolved.repository.url,
              path: finalResolved.skill.path,
              manifestFiles: finalResolved.skill.manifestFiles,
              identityFingerprint
            }
          }
        };
        await assertBundleUnmodified(destination, installedSkill);
        const result = await replaceSkillWithBackup({
          root,
          libraryRoot,
          backupRoot,
          registryPath,
          registry,
          currentSkill: installedSkill,
          replacementSkill: updatedSkill,
          replacementPath: temporary,
          reason: "update",
          timestamp
        });
        if (finalResolved !== void 0) {
          await recordGitHubObservation(options, observationFromResolvedSnapshot(finalResolved, identityFingerprint, timestamp));
        }
        return result;
      } catch (error) {
        await rm(temporary, { force: true, recursive: true });
        throw error;
      }
    },
    async listBackups(request = {}) {
      await ensureRecovered();
      if (request.name !== void 0)
        validateManagedName(request.name);
      return listSkillBackups(backupRoot, request.name);
    },
    async rollbackSkill(request) {
      await ensureRecovered();
      validateManagedName(request.name);
      validateBackupId(request.backupId);
      const registry = await readRegistry(registryPath);
      const currentSkill = registry.skills[request.name];
      if (currentSkill === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${request.name}" was not found.`);
      }
      const destination = join2(root, currentSkill.relativePath);
      await assertBundleUnmodified(destination, currentSkill);
      const stored = await readStoredBackup(backupRoot, request.name, request.backupId);
      const replacement = join2(libraryRoot, `.rollback-${request.name}-${randomUUID()}`);
      await mkdir(replacement, { recursive: false });
      try {
        await copySkillBundle(join2(backupRoot, request.name, request.backupId, "bundle"), replacement);
        const contentHash = await hashSkillBundle(replacement);
        if (contentHash !== stored.skill.contentHash || contentHash !== stored.backup.contentHash) {
          throw new SkillManagerError("SKILL_BACKUP_INVALID", "Skill backup content is invalid.");
        }
        const parsed = parseSkillDocument(await readFile2(join2(replacement, "SKILL.md"), "utf8"));
        if (parsed.name !== request.name || parsed.description !== stored.skill.description) {
          throw new SkillManagerError("SKILL_BACKUP_INVALID", "Skill backup metadata is invalid.");
        }
        const timestamp = now().toISOString();
        const replacementSkill = {
          ...stored.skill,
          createdAt: currentSkill.createdAt,
          enabledTargets: [...currentSkill.enabledTargets],
          relativePath: currentSkill.relativePath,
          updatedAt: timestamp
        };
        await assertBundleUnmodified(destination, currentSkill);
        return await replaceSkillWithBackup({
          root,
          libraryRoot,
          backupRoot,
          registryPath,
          registry,
          currentSkill,
          replacementSkill,
          replacementPath: replacement,
          reason: "rollback",
          timestamp
        });
      } catch (error) {
        await rm(replacement, { force: true, recursive: true });
        throw error;
      }
    },
    async deleteSkill(request) {
      await ensureRecovered();
      validateManagedName(request.name);
      const registry = await readRegistry(registryPath);
      const entry = registry.skills[request.name];
      if (entry === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${request.name}" was not found.`);
      }
      const source = join2(root, entry.relativePath);
      const ownedLinks = [];
      for (const target of entry.enabledTargets) {
        const destinationRoot = target === "dsh" ? activeRoot : requireTargetRoot(targetRoots, target);
        const destination2 = join2(destinationRoot, entry.name);
        if (!await pathEntryExists(destination2))
          continue;
        if (!await pathsReferToSameDirectory(source, destination2)) {
          throw new SkillManagerError("ACTIVE_PATH_CONFLICT", "Refusing to delete while a recorded target path is not owned by Skill Manager.");
        }
        ownedLinks.push({ destination: destination2, destinationRoot });
      }
      const trashId = randomUUID();
      const deletedAt = now().toISOString();
      const nameTrashRoot = join2(trashRoot, request.name);
      const temporary = join2(nameTrashRoot, `.delete-${trashId}`);
      const destination = join2(nameTrashRoot, trashId);
      const archivedBundle = join2(temporary, "bundle");
      const removedLinks = [];
      await mkdir(temporary, { recursive: true });
      try {
        for (const link of ownedLinks) {
          await rm(link.destination, { force: true, recursive: false });
          removedLinks.push(link);
        }
        await rename(source, archivedBundle);
        await writeFile(join2(temporary, "metadata.json"), `${JSON.stringify({
          version: TRASH_VERSION,
          trashId,
          deletedAt,
          skill: entry,
          archivedContentHash: await hashSkillBundle(archivedBundle)
        }, null, 2)}
`, "utf8");
        await rename(temporary, destination);
        delete registry.skills[request.name];
        try {
          await writeRegistry(root, registryPath, registry);
        } catch (error) {
          await rename(join2(destination, "bundle"), source);
          await rm(destination, { force: true, recursive: true });
          for (const link of removedLinks) {
            await enableActiveLink(source, link.destination, link.destinationRoot);
          }
          throw error;
        }
      } catch (error) {
        if (await pathExists(archivedBundle) && !await pathExists(source)) {
          await rename(archivedBundle, source);
        }
        await rm(temporary, { force: true, recursive: true });
        for (const link of removedLinks) {
          if (!await pathEntryExists(link.destination) && await pathExists(source)) {
            await enableActiveLink(source, link.destination, link.destinationRoot);
          }
        }
        throw error;
      }
      return { name: request.name, trashId, deletedAt };
    },
    async listTrash() {
      await ensureRecovered();
      return listTrashedSkills(trashRoot);
    },
    async restoreTrash(request) {
      await ensureRecovered();
      validateManagedName(request.name);
      validateTrashId(request.trashId);
      const stored = await readStoredTrash(trashRoot, request.name, request.trashId);
      if (trashExpiresAt(stored.deletedAt).getTime() <= now().getTime()) {
        throw new SkillManagerError("SKILL_TRASH_EXPIRED", "Deleted Skill archive has expired.");
      }
      const registry = await readRegistry(registryPath);
      if (registry.skills[request.name] !== void 0) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${request.name}" already exists.`);
      }
      const destination = join2(root, stored.skill.relativePath);
      if (await pathEntryExists(destination)) {
        throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill "${request.name}" already exists.`);
      }
      const archiveRoot = join2(trashRoot, request.name, request.trashId);
      const archivedBundle = join2(archiveRoot, "bundle");
      const archivedHash = await hashSkillBundle(archivedBundle).catch((error) => {
        throw new SkillManagerError("SKILL_TRASH_INVALID", "Deleted Skill archive content is invalid.", { cause: error });
      });
      if (archivedHash !== stored.archivedContentHash || archivedHash !== stored.skill.contentHash) {
        throw new SkillManagerError("SKILL_TRASH_INVALID", "Deleted Skill archive content is invalid.");
      }
      const parsed = parseSkillDocument(await readFile2(join2(archivedBundle, "SKILL.md"), "utf8"));
      if (parsed.name !== stored.skill.name || parsed.description !== stored.skill.description) {
        throw new SkillManagerError("SKILL_TRASH_INVALID", "Deleted Skill archive metadata is invalid.");
      }
      const targetLinks = stored.skill.enabledTargets.map((target) => {
        const destinationRoot = target === "dsh" ? activeRoot : requireTargetRoot(targetRoots, target);
        return { destinationRoot, destination: join2(destinationRoot, stored.skill.name) };
      });
      for (const link of targetLinks) {
        if (await pathEntryExists(link.destination)) {
          throw new SkillManagerError("ACTIVE_PATH_CONFLICT", "A previously enabled target already contains a same-name path.");
        }
      }
      const createdLinks = [];
      let bundleMoved = false;
      try {
        await mkdir(libraryRoot, { recursive: true });
        await rename(archivedBundle, destination);
        bundleMoved = true;
        for (const link of targetLinks) {
          await enableActiveLink(destination, link.destination, link.destinationRoot);
          createdLinks.push(link);
        }
        registry.skills[request.name] = stored.skill;
        await writeRegistry(root, registryPath, registry);
      } catch (error) {
        delete registry.skills[request.name];
        for (const link of createdLinks.reverse()) {
          await disableActiveLink(destination, link.destination, true).catch(() => void 0);
        }
        if (bundleMoved && await pathExists(destination)) {
          await rename(destination, archivedBundle);
        }
        throw error;
      }
      await rm(archiveRoot, { force: true, recursive: true }).catch(() => void 0);
      return toManagedSkill(stored.skill);
    },
    async listTargetStates(request = {}) {
      await ensureRecovered();
      const registry = await readRegistry(registryPath);
      const names = normalizeTargetStateNames(request, registry);
      const targets = normalizeDiscoveryTargets(request.targets);
      const states = [];
      for (const name of names) {
        const entry = registry.skills[name];
        if (entry === void 0)
          continue;
        const source = join2(root, entry.relativePath);
        for (const target of targets) {
          const targetRoot = targetRoots[target];
          if (targetRoot === void 0) {
            states.push({ name, target, status: "not-configured" });
            continue;
          }
          const destination = join2(targetRoot, name);
          if (!await pathEntryExists(destination)) {
            states.push({ name, target, status: "not-linked" });
            continue;
          }
          const registered = entry.enabledTargets.includes(target);
          states.push({
            name,
            target,
            status: registered && await pathsReferToSameDirectory(source, destination) ? "linked" : "conflict"
          });
        }
      }
      return states;
    },
    async setTargetEnabled(request) {
      await ensureRecovered();
      validateTargetRequest(request, targetRoots);
      const registry = await readRegistry(registryPath);
      const entry = registry.skills[request.name];
      if (entry === void 0) {
        throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${request.name}" was not found.`);
      }
      const source = join2(root, entry.relativePath);
      const destinationRoot = request.target === "dsh" ? activeRoot : requireTargetRoot(targetRoots, request.target);
      const destination = join2(destinationRoot, request.name);
      const wasLinked = entry.enabledTargets.includes(request.target) && await pathsReferToSameDirectory(source, destination);
      if (request.enabled) {
        await enableActiveLink(source, destination, destinationRoot, wasLinked);
      } else {
        await disableActiveLink(source, destination, wasLinked, request.target !== "dsh");
      }
      entry.enabledTargets = request.enabled ? uniqueTargets([...entry.enabledTargets, request.target]) : entry.enabledTargets.filter((target) => target !== request.target);
      entry.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        await writeRegistry(root, registryPath, registry);
      } catch (error) {
        if (wasLinked) {
          await enableActiveLink(source, destination, destinationRoot, true);
        } else {
          await disableActiveLink(source, destination, request.enabled, false);
        }
        throw error;
      }
      return toManagedSkill(entry);
    }
  };
}
function normalizeUpdateNames(requested, registry) {
  const names = [...new Set(requested)].sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    if (!SKILL_NAME2.test(name) || registry.skills[name] === void 0) {
      throw new SkillManagerError("SKILL_NOT_FOUND", `Skill "${name}" was not found.`);
    }
  }
  return names;
}
function validateManagedName(name) {
  if (!SKILL_NAME2.test(name)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", `Invalid managed Skill name "${name}".`);
  }
}
function createMarketplaceDeadline(configured) {
  const timeoutMs = configured ?? DEFAULT_MARKETPLACE_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Marketplace update timeout must be a positive integer in milliseconds.");
  }
  return Date.now() + timeoutMs;
}
function remainingMarketplaceTimeout(deadline) {
  const remaining = deadline - Date.now();
  if (remaining < 1) {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", "Marketplace update check exceeded its overall deadline.");
  }
  return remaining;
}
function validateBackupId(backupId) {
  if (!UUID_PATTERN.test(backupId)) {
    throw new SkillManagerError("SKILL_BACKUP_NOT_FOUND", "Skill backup was not found.");
  }
}
function validateTrashId(trashId) {
  if (!UUID_PATTERN.test(trashId)) {
    throw new SkillManagerError("SKILL_TRASH_NOT_FOUND", "Deleted Skill archive was not found.");
  }
}
function snapshotFromSkill(skill) {
  if (skill.source?.kind !== "github") {
    throw new SkillManagerError("REGISTRY_INVALID", "Managed Skill has no GitHub snapshot.");
  }
  return {
    commitSha: skill.source.commitSha,
    blobSha: skill.source.blobSha,
    bundleHash: skill.source.bundleHash
  };
}
function updateEntry(skill, snapshot, fetchedAt) {
  if (skill.source?.kind !== "github") {
    throw new SkillManagerError("SKILL_UPDATE_UNSUPPORTED", "Managed Skill has no GitHub source.");
  }
  const [owner, repositoryName] = skill.source.repository.split("/");
  return {
    id: `${skill.source.repository}/${skill.name}`,
    source: skill.source.catalog,
    catalogs: [skill.source.catalog],
    name: skill.name,
    description: skill.description,
    publisher: null,
    author: null,
    repository: {
      host: "github",
      id: 0,
      nodeId: "managed-update",
      owner,
      name: repositoryName,
      path: skill.source.path,
      url: skill.source.url
    },
    skillUrl: skill.source.url,
    install: {
      kind: "github",
      repository: skill.source.repository,
      skill: skill.name,
      path: skill.source.path
    },
    metrics: { installs: null, stars: null, downloads: null },
    cover: { kind: "generated", seed: `${skill.source.repository}/${skill.name}` },
    snapshot: {
      commitSha: snapshot.commitSha,
      blobSha: snapshot.blobSha,
      fetchedAt,
      ...skill.source.manifestFiles === void 0 ? {} : { manifestFiles: skill.source.manifestFiles }
    }
  };
}
async function assertBundleUnmodified(path, skill) {
  const currentHash = await hashSkillBundle(path);
  if (currentHash !== skill.contentHash) {
    throw new SkillManagerError("SKILL_LOCAL_MODIFIED", `Skill "${skill.name}" has local modifications.`);
  }
}
async function replaceSkillWithBackup(input) {
  const destination = join2(input.root, input.currentSkill.relativePath);
  const backup = describeSkillBackup(input.currentSkill, input.reason, input.timestamp);
  const displaced = join2(input.libraryRoot, `.displaced-${input.currentSkill.name}-${randomUUID()}`);
  const journalId = randomUUID();
  const journalPath = join2(input.root, `.replacement-${journalId}.json`);
  const journal = {
    version: 1,
    id: journalId,
    name: input.currentSkill.name,
    currentHash: input.currentSkill.contentHash,
    replacementHash: input.replacementSkill.contentHash,
    displacedName: displaced.slice(input.libraryRoot.length + 1),
    replacementName: input.replacementPath.slice(input.libraryRoot.length + 1),
    backupId: backup.id,
    previousRegistry: structuredClone(input.registry)
  };
  try {
    await writeJsonAtomically(input.root, journalPath, journal);
  } catch (error) {
    throw error;
  }
  try {
    await persistSkillBackup(input.backupRoot, destination, input.currentSkill, backup);
  } catch (error) {
    await rm(journalPath, { force: true }).catch(() => void 0);
    throw error;
  }
  let currentMoved = false;
  let replacementMoved = false;
  try {
    await rename(destination, displaced);
    currentMoved = true;
    if (await hashSkillBundle(displaced) !== input.currentSkill.contentHash) {
      throw new SkillManagerError("SKILL_LOCAL_MODIFIED", `Skill "${input.currentSkill.name}" changed during replacement.`);
    }
    await rename(input.replacementPath, destination);
    replacementMoved = true;
    input.registry.skills[input.currentSkill.name] = input.replacementSkill;
    await writeRegistry(input.root, input.registryPath, input.registry);
  } catch (error) {
    input.registry.skills[input.currentSkill.name] = input.currentSkill;
    if (replacementMoved && await pathExists(destination)) {
      await rename(destination, input.replacementPath);
    }
    if (currentMoved && await pathExists(displaced)) {
      await rename(displaced, destination);
    }
    await removeSkillBackup(input.backupRoot, backup);
    await rm(journalPath, { force: true });
    throw error;
  }
  await rm(displaced, { force: true, recursive: true }).catch(() => void 0);
  await rm(journalPath, { force: true }).catch(() => void 0);
  return { skill: toManagedSkill(input.replacementSkill), backup };
}
async function persistSkillBackup(backupRoot, sourcePath, skill, backup) {
  const id = backup.id;
  const nameRoot = join2(backupRoot, skill.name);
  const temporary = join2(nameRoot, `.backup-${id}`);
  const destination = join2(nameRoot, id);
  const metadata = {
    version: BACKUP_VERSION,
    backup,
    skill
  };
  await mkdir(nameRoot, { recursive: true });
  await mkdir(join2(temporary, "bundle"), { recursive: true });
  try {
    await copySkillBundle(sourcePath, join2(temporary, "bundle"));
    if (await hashSkillBundle(join2(temporary, "bundle")) !== skill.contentHash) {
      throw new SkillManagerError("SKILL_LOCAL_MODIFIED", `Skill "${skill.name}" changed during backup.`);
    }
    await writeFile(join2(temporary, "metadata.json"), `${JSON.stringify(metadata, null, 2)}
`, "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true, recursive: true });
    throw error;
  }
}
function describeSkillBackup(skill, reason, timestamp) {
  return {
    id: randomUUID(),
    name: skill.name,
    createdAt: timestamp,
    reason,
    contentHash: skill.contentHash,
    snapshot: skill.source?.kind === "github" ? snapshotFromSkill(skill) : null
  };
}
async function listSkillBackups(backupRoot, selectedName) {
  const names = selectedName === void 0 ? await readDirectoryNames(backupRoot) : [selectedName];
  const backups = [];
  for (const name of names.sort((left, right) => left.localeCompare(right))) {
    if (!SKILL_NAME2.test(name)) {
      throw new SkillManagerError("SKILL_BACKUP_INVALID", "Skill backup directory is invalid.");
    }
    const ids = await readDirectoryNames(join2(backupRoot, name));
    for (const id of ids) {
      validateBackupId(id);
      backups.push((await readStoredBackup(backupRoot, name, id)).backup);
    }
  }
  return backups.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0)
      return byName;
    const byTime = right.createdAt.localeCompare(left.createdAt);
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });
}
async function readStoredBackup(backupRoot, name, id) {
  let value;
  try {
    value = JSON.parse(await readFile2(join2(backupRoot, name, id, "metadata.json"), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillManagerError("SKILL_BACKUP_NOT_FOUND", "Skill backup was not found.");
    }
    if (error instanceof SyntaxError) {
      throw new SkillManagerError("SKILL_BACKUP_INVALID", "Skill backup metadata is invalid.");
    }
    throw error;
  }
  if (!isStoredBackupFile(value, name, id)) {
    throw new SkillManagerError("SKILL_BACKUP_INVALID", "Skill backup metadata is invalid.");
  }
  return value;
}
async function listTrashedSkills(trashRoot) {
  const trashed = [];
  for (const name of (await readDirectoryNames(trashRoot)).sort((left, right) => left.localeCompare(right))) {
    validateManagedName(name);
    for (const trashId of await readDirectoryNames(join2(trashRoot, name))) {
      validateTrashId(trashId);
      const stored = await readStoredTrash(trashRoot, name, trashId);
      trashed.push({
        name,
        trashId,
        description: stored.skill.description,
        origin: stored.skill.origin,
        enabledTargets: [...stored.skill.enabledTargets],
        deletedAt: stored.deletedAt,
        expiresAt: trashExpiresAt(stored.deletedAt).toISOString()
      });
    }
  }
  return trashed.sort((left, right) => {
    const byTime = right.deletedAt.localeCompare(left.deletedAt);
    return byTime !== 0 ? byTime : left.name.localeCompare(right.name);
  });
}
async function readStoredTrash(trashRoot, name, trashId) {
  let value;
  try {
    value = JSON.parse(await readFile2(join2(trashRoot, name, trashId, "metadata.json"), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillManagerError("SKILL_TRASH_NOT_FOUND", "Deleted Skill archive was not found.");
    }
    if (error instanceof SyntaxError) {
      throw new SkillManagerError("SKILL_TRASH_INVALID", "Deleted Skill archive metadata is invalid.");
    }
    throw error;
  }
  if (!isStoredTrashFile(value, name, trashId)) {
    throw new SkillManagerError("SKILL_TRASH_INVALID", "Deleted Skill archive metadata is invalid.");
  }
  return value;
}
function isStoredTrashFile(value, name, trashId) {
  if (!isRecord2(value) || value.version !== TRASH_VERSION)
    return false;
  return value.trashId === trashId && isIsoDate(value.deletedAt) && typeof value.archivedContentHash === "string" && /^[a-f0-9]{64}$/iu.test(value.archivedContentHash) && isValidStoredRegistrySkill(value.skill, name, value.archivedContentHash);
}
function isValidStoredRegistrySkill(value, name, contentHash) {
  if (!isRecord2(value))
    return false;
  const origin = value.origin;
  const source = value.source;
  const common = value.name === name && typeof value.description === "string" && Array.isArray(value.enabledTargets) && value.enabledTargets.every((target) => target === "dsh" || target === "codex" || target === "claude" || target === "agents" || target === "opencode") && new Set(value.enabledTargets).size === value.enabledTargets.length && isIsoDate(value.createdAt) && isIsoDate(value.updatedAt) && value.contentHash === contentHash && value.relativePath === join2("library", name);
  if (!common)
    return false;
  if (source === void 0)
    return origin === "self";
  if (isRecord2(source) && source.kind === "local-import") {
    return (origin === "self" || origin === "local-import") && isValidStoredLocalImportSource(source, name);
  }
  if (!isRecord2(source) || source.kind !== "github")
    return false;
  return isValidGitHubRegistrySkill(value, name, contentHash, {
    commitSha: source.commitSha,
    blobSha: source.blobSha,
    bundleHash: source.bundleHash
  });
}
function isValidStoredLocalImportSource(value, name) {
  return value.name === name && (value.target === "codex" || value.target === "claude" || value.target === "agents" || value.target === "opencode");
}
function trashExpiresAt(deletedAt) {
  return new Date(Date.parse(deletedAt) + TRASH_RETENTION_MS);
}
async function purgeExpiredTrash(trashRoot, currentTime) {
  for (const name of await readDirectoryNames(trashRoot)) {
    if (!SKILL_NAME2.test(name))
      continue;
    for (const trashId of await readDirectoryNames(join2(trashRoot, name))) {
      if (!UUID_PATTERN.test(trashId))
        continue;
      let stored;
      try {
        stored = await readStoredTrash(trashRoot, name, trashId);
      } catch {
        continue;
      }
      if (trashExpiresAt(stored.deletedAt).getTime() > currentTime().getTime())
        continue;
      const archiveRoot = join2(trashRoot, name, trashId);
      try {
        const contentHash = await hashSkillBundle(join2(archiveRoot, "bundle"));
        if (contentHash !== stored.archivedContentHash || contentHash !== stored.skill.contentHash)
          continue;
      } catch {
        continue;
      }
      await rm(archiveRoot, { force: true, recursive: true });
    }
  }
}
function isStoredBackupFile(value, name, id) {
  if (!isRecord2(value) || value.version !== BACKUP_VERSION)
    return false;
  const backup = value.backup;
  const skill = value.skill;
  if (!isRecord2(backup) || !isRecord2(skill))
    return false;
  if (backup.id !== id || backup.name !== name || !isIsoDate(backup.createdAt) || backup.reason !== "update" && backup.reason !== "rollback" || typeof backup.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(backup.contentHash) || !isValidGitHubRegistrySkill(skill, name, backup.contentHash, backup.snapshot))
    return false;
  return true;
}
function isValidGitHubRegistrySkill(skill, name, contentHash, snapshot) {
  const source = skill.source;
  if (!isRecord2(source) || source.kind !== "github" || !isSnapshot(snapshot))
    return false;
  return skill.name === name && skill.origin === "github" && typeof skill.description === "string" && isIsoDate(skill.createdAt) && isIsoDate(skill.updatedAt) && skill.contentHash === contentHash && skill.relativePath === join2("library", name) && Array.isArray(skill.enabledTargets) && skill.enabledTargets.every((target) => target === "dsh" || target === "codex" || target === "claude" || target === "agents" || target === "opencode") && typeof source.repository === "string" && source.repository.split("/").length === 2 && typeof source.path === "string" && !source.path.includes("\\") && !source.path.includes("\0") && (source.path === "." || source.path.split("/").at(-1) === name) && (source.manifestFiles === void 0 || Array.isArray(source.manifestFiles) && new Set(source.manifestFiles).size === source.manifestFiles.length && source.manifestFiles.every((path) => typeof path === "string" && isSafeBundleRelativePath(path) && !isAgentInstructionPath2(path))) && source.commitSha === snapshot.commitSha && source.blobSha === snapshot.blobSha && source.bundleHash === snapshot.bundleHash && (source.catalog === "skills-sh" || source.catalog === "github" || source.catalog === "hugging-face") && typeof source.url === "string";
}
function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
function isSafeBundleRelativePath(path) {
  return path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isAgentInstructionPath2(path) {
  return /^(?:AGENTS|CLAUDE)\.md$/iu.test(path.split("/").at(-1) ?? "");
}
function isSnapshot(value) {
  return isRecord2(value) && typeof value.commitSha === "string" && /^[a-f0-9]{40}$/i.test(value.commitSha) && typeof value.blobSha === "string" && /^[a-f0-9]{40}$/i.test(value.blobSha) && typeof value.bundleHash === "string" && /^[a-f0-9]{64}$/i.test(value.bundleHash);
}
async function readDirectoryNames(path) {
  try {
    const entries = await readdir2(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return [];
    throw error;
  }
}
async function removeSkillBackup(backupRoot, backup) {
  const nameRoot = join2(backupRoot, backup.name);
  await Promise.all([
    rm(join2(nameRoot, backup.id), { force: true, recursive: true }),
    rm(join2(nameRoot, `.backup-${backup.id}`), { force: true, recursive: true })
  ]);
}
async function recoverInterruptedReplacements(root, libraryRoot, registryPath) {
  const journalPaths = await listReplacementJournals(root);
  for (const journalPath of journalPaths) {
    const journal = await readReplacementJournal(journalPath);
    let registry = await readRegistry(registryPath);
    const currentSkill = registry.skills[journal.name];
    const previousSkill = journal.previousRegistry.skills[journal.name];
    if (previousSkill === void 0) {
      invalidReplacementRecovery(journal.name);
    }
    const destination = join2(root, (currentSkill ?? previousSkill).relativePath);
    const displaced = join2(libraryRoot, journal.displacedName);
    const replacement = join2(libraryRoot, journal.replacementName);
    const destinationHash = await existingBundleHash(destination);
    const displacedHash = await existingBundleHash(displaced);
    const replacementHash = await existingBundleHash(replacement);
    if (currentSkill === void 0 || currentSkill.contentHash === journal.currentHash) {
      if (destinationHash === journal.currentHash && (displacedHash === null || displacedHash === journal.currentHash)) {
        await rm(displaced, { force: true, recursive: true });
        await removeSkillBackup(join2(root, "backups"), backupFromJournal(journal));
        await rm(replacement, { force: true, recursive: true });
        if (currentSkill === void 0)
          await writeRegistry(root, registryPath, journal.previousRegistry);
        await rm(journalPath, { force: true });
        continue;
      }
      if (destinationHash === journal.replacementHash && displacedHash === journal.currentHash) {
        await rm(destination, { force: true, recursive: true });
        await rename(displaced, destination);
      } else if (destinationHash === null && displacedHash === journal.currentHash) {
        await rename(displaced, destination);
      } else {
        invalidReplacementRecovery(journal.name);
      }
      registry = journal.previousRegistry;
      await writeRegistry(root, registryPath, registry);
      await removeSkillBackup(join2(root, "backups"), backupFromJournal(journal));
      if (replacementHash !== null)
        await rm(replacement, { force: true, recursive: true });
      await rm(journalPath, { force: true });
      continue;
    }
    if (currentSkill?.contentHash === journal.replacementHash && destinationHash === journal.replacementHash && (displacedHash === journal.currentHash || displacedHash === null)) {
      await rm(displaced, { force: true, recursive: true });
      await rm(replacement, { force: true, recursive: true });
      await rm(journalPath, { force: true });
      continue;
    }
    invalidReplacementRecovery(journal.name);
  }
  await recoverOrphanedDisplacedDirectories(root, libraryRoot, registryPath);
}
async function recoverOrphanedDisplacedDirectories(root, libraryRoot, registryPath) {
  const entries = await readDirectoryNames(libraryRoot);
  const displacedNames = entries.filter((name) => name.startsWith(".displaced-"));
  if (displacedNames.length === 0)
    return;
  const registry = await readRegistry(registryPath);
  for (const displacedName of displacedNames) {
    const skillName = parseDisplacedSkillName(displacedName);
    const skill = skillName === void 0 ? void 0 : registry.skills[skillName];
    if (skill === void 0)
      invalidReplacementRecovery(displacedName);
    const displaced = join2(libraryRoot, displacedName);
    const destination = join2(root, skill.relativePath);
    const destinationHash = await existingBundleHash(destination);
    const displacedHash = await existingBundleHash(displaced);
    if (destinationHash === skill.contentHash && displacedHash === skill.contentHash) {
      await rm(displaced, { force: true, recursive: true });
      continue;
    }
    if (destinationHash === null && displacedHash === skill.contentHash) {
      await rename(displaced, destination);
      continue;
    }
    invalidReplacementRecovery(skill.name);
  }
}
function parseDisplacedSkillName(directoryName) {
  const match = /^\.displaced-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.exec(directoryName);
  const name = match?.[1];
  return name !== void 0 && SKILL_NAME2.test(name) ? name : void 0;
}
async function existingBundleHash(path) {
  if (!await pathExists(path))
    return null;
  try {
    return await hashSkillBundle(path);
  } catch {
    return null;
  }
}
async function listReplacementJournals(root) {
  let entries;
  try {
    entries = await readdir2(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return [];
    throw error;
  }
  return entries.filter((entry) => entry.isFile() && /^\.replacement-[0-9a-f-]{36}\.json$/iu.test(entry.name)).map((entry) => join2(root, entry.name)).sort((left, right) => left.localeCompare(right));
}
async function readReplacementJournal(path) {
  let value;
  try {
    value = JSON.parse(await readFile2(path, "utf8"));
  } catch (error) {
    throw new SkillManagerError("REGISTRY_INVALID", "Interrupted Skill replacement journal is invalid.", { cause: error });
  }
  if (!isReplacementJournal(value)) {
    throw new SkillManagerError("REGISTRY_INVALID", "Interrupted Skill replacement journal is invalid.");
  }
  return value;
}
function isReplacementJournal(value) {
  if (!isRecord2(value) || value.version !== 1 || !UUID_PATTERN.test(String(value.id)))
    return false;
  if (typeof value.name !== "string" || !SKILL_NAME2.test(value.name) || typeof value.currentHash !== "string" || !/^[a-f0-9]{64}$/iu.test(value.currentHash) || typeof value.replacementHash !== "string" || !/^[a-f0-9]{64}$/iu.test(value.replacementHash) || typeof value.displacedName !== "string" || typeof value.replacementName !== "string" || !UUID_PATTERN.test(String(value.backupId)) || !isSafeTransactionName(value.displacedName, [".displaced-"], value.name) || !isSafeTransactionName(value.replacementName, [".update-", ".rollback-"], value.name) || !isRegistryFile(value.previousRegistry))
    return false;
  const previousSkill = value.previousRegistry.skills[value.name];
  return isRecord2(previousSkill) && isValidGitHubRegistrySkill(previousSkill, value.name, value.currentHash, isRecord2(previousSkill.source) && previousSkill.source.kind === "github" ? {
    commitSha: previousSkill.source.commitSha,
    blobSha: previousSkill.source.blobSha,
    bundleHash: previousSkill.source.bundleHash
  } : null);
}
function isSafeTransactionName(value, prefixes, name) {
  if (value.includes("/") || value.includes("\\"))
    return false;
  const prefix = prefixes.find((candidate) => value.startsWith(`${candidate}${name}-`));
  return prefix !== void 0 && UUID_PATTERN.test(value.slice(`${prefix}${name}-`.length));
}
function backupFromJournal(journal) {
  const skill = journal.previousRegistry.skills[journal.name];
  return {
    id: journal.backupId,
    name: journal.name,
    createdAt: "",
    reason: "update",
    contentHash: journal.currentHash,
    snapshot: skill.source?.kind === "github" ? snapshotFromSkill(skill) : null
  };
}
function invalidReplacementRecovery(name) {
  throw new SkillManagerError("REGISTRY_INVALID", `Interrupted replacement for Skill "${name}" cannot be recovered safely.`);
}
async function writeJsonAtomically(root, path, value) {
  await mkdir(root, { recursive: true });
  const temporary = join2(root, `.json-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}
`, "utf8");
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
async function checkRemoteUpdates(remoteChecks, checks, options, callerSignal, checkedAt) {
  const timeoutMs = options.marketplaceTimeoutMs ?? DEFAULT_MARKETPLACE_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Marketplace update timeout must be a positive integer in milliseconds.");
  }
  if (callerSignal?.aborted) {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace update check was cancelled.");
  }
  const checker = createGitHubUpdateChecker({
    ...options.fetch === void 0 ? {} : { fetch: options.fetch }
  });
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const cancelFromCaller = () => {
    callerAborted = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace update check was cancelled."));
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace update check exceeded ${timeoutMs} ms.`));
    controller.abort();
  }, timeoutMs);
  let nextIndex = 0;
  const worker = async () => {
    while (!controller.signal.aborted) {
      const remoteIndex = nextIndex;
      nextIndex += 1;
      const remote = remoteChecks[remoteIndex];
      if (remote === void 0)
        return;
      const source = remote.skill.source;
      if (source?.kind !== "github")
        return;
      const installed = checks[remote.index]?.installed;
      if (installed === null || installed === void 0) {
        throw new SkillManagerError("REGISTRY_INVALID", `Skill "${remote.name}" is missing its installed GitHub snapshot.`);
      }
      if (options.snapshotResolver !== void 0) {
        let resolved;
        try {
          resolved = await resolveManagedSkillSnapshot(options, remote.name, source, controller.signal);
        } catch (error) {
          if (hasErrorCode(error, "GITHUB_SKILL_NOT_FOUND")) {
            checks[remote.index] = {
              name: remote.name,
              status: "source-moved",
              installed,
              latest: null,
              latestRisk: null,
              checkedAt
            };
            continue;
          }
          throw error;
        }
        validateResolvedSkillSnapshot(resolved);
        const latest2 = {
          commitSha: resolved.snapshot.commitSha,
          blobSha: resolved.snapshot.skillDocumentBlobSha,
          bundleHash: resolved.snapshot.bundleHash
        };
        checks[remote.index] = {
          name: remote.name,
          status: latest2.bundleHash === installed.bundleHash ? "up-to-date" : "update-available",
          installed,
          latest: latest2,
          latestRisk: latest2.bundleHash === installed.bundleHash ? null : options.riskAssessor?.assessResolvedSkillRisk(resolved) ?? {
            risk: "unknown",
            findings: [],
            scannerVersion: "unavailable"
          },
          checkedAt
        };
        continue;
      }
      const latest = await checker.checkLatest(remote.name, source, {
        signal: controller.signal
      });
      checks[remote.index] = {
        name: remote.name,
        status: latest.bundleHash === installed.bundleHash ? "up-to-date" : "update-available",
        installed,
        latest,
        latestRisk: null,
        checkedAt
      };
    }
  };
  const operation = Promise.all(Array.from({ length: Math.min(UPDATE_CONCURRENCY, remoteChecks.length) }, () => worker())).then(() => void 0);
  try {
    await Promise.race([operation, boundary]);
  } catch (error) {
    controller.abort();
    if (timedOut) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace update check exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || callerSignal?.aborted) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace update check was cancelled.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function resolveManagedSkillSnapshot(options, name, source, signal) {
  if (options.snapshotResolver === void 0) {
    throw new SkillManagerError("SKILL_UPDATE_UNSUPPORTED", "GitHub snapshot resolution is not configured.");
  }
  const repository = await resolveCurrentRepository(source, options.fetch, signal);
  const resolved = await options.snapshotResolver.resolveSkillSnapshot({ repository, skillPath: source.path }, signal === void 0 ? {} : { signal });
  if (resolved.skill.name !== name) {
    throw new SkillManagerError("SKILL_SOURCE_MOVED", `GitHub path now contains a different Skill named "${resolved.skill.name}".`);
  }
  if (source.repositoryId !== void 0 && resolved.repository.repositoryId !== source.repositoryId) {
    throw new SkillManagerError("SKILL_SOURCE_MOVED", "GitHub repository identity no longer matches the verified source.");
  }
  return resolved;
}
async function resolveCurrentRepository(source, fetch, signal) {
  if (source.repositoryId === void 0 || fetch === void 0) {
    const [owner2, name2] = source.repository.split("/");
    if (!owner2 || !name2)
      throw new SkillManagerError("REGISTRY_INVALID", "GitHub source repository is invalid.");
    return { owner: owner2, name: name2 };
  }
  const response = await fetch(`https://api.github.com/repositories/${source.repositoryId}`, {
    headers: { accept: "application/vnd.github+json" },
    ...signal === void 0 ? {} : { signal }
  });
  if (!response.ok) {
    throw new MarketplaceResolverError(response.status === 404 ? "GITHUB_SKILL_NOT_FOUND" : "GITHUB_HTTP_ERROR", `GitHub repository identity lookup failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (!isRecord2(payload) || payload.id !== source.repositoryId || typeof payload.full_name !== "string" || !payload.full_name.includes("/")) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an invalid repository identity.");
  }
  const [owner, name] = payload.full_name.split("/");
  if (!owner || !name) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an invalid repository name.");
  }
  return { owner, name };
}
function hasErrorCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
async function writeBundleFiles(root, files) {
  for (const file of files) {
    const destination = join2(root, ...file.path.split("/"));
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, file.content);
  }
}
function validateCreateRequest(request) {
  if (!SKILL_NAME2.test(request.name)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", "Skill names must use lowercase letters, digits, and single hyphen separators.");
  }
  if (request.description.trim().length === 0) {
    throw new SkillManagerError("INVALID_SKILL_DESCRIPTION", "Skill description must not be empty.");
  }
}
function validateTargetRequest(request, targetRoots) {
  validateExternalSkillName(request.name);
  if (request.target !== "dsh" && targetRoots[request.target] === void 0) {
    throw new SkillManagerError("TARGET_NOT_CONFIGURED", `Target "${request.target}" has no configured Skill root.`);
  }
}
function normalizeTargetStateNames(request, registry) {
  return request.names === void 0 ? Object.keys(registry.skills).sort((left, right) => left.localeCompare(right)) : normalizeUpdateNames(request.names, registry);
}
function renderSkillDocument(request, body) {
  const frontmatter = stringify({
    name: request.name,
    description: request.description.trim()
  }).trimEnd();
  return `---
${frontmatter}
---

${body}`;
}
function parseSkillDocument(document2) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/u.exec(document2);
  if (match === null) {
    throw new SkillManagerError("REGISTRY_INVALID", "Managed Skill is missing valid frontmatter.");
  }
  const metadata = parse(match[1] ?? "");
  if (!isRecord2(metadata) || typeof metadata.name !== "string" || typeof metadata.description !== "string") {
    throw new SkillManagerError("REGISTRY_INVALID", "Managed Skill metadata is invalid.");
  }
  return {
    name: metadata.name.trim(),
    description: metadata.description.trim(),
    content: match[2] ?? ""
  };
}
function parseProvenanceHints(document2) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(document2);
  if (match === null)
    return [];
  let metadata;
  try {
    metadata = parse(match[1] ?? "");
  } catch {
    return [];
  }
  if (!isRecord2(metadata))
    return [];
  const nested = isRecord2(metadata.metadata) ? metadata.metadata : void 0;
  const repositoryValue = metadata.repository ?? nested?.repository;
  const pathValue = metadata.skill_path ?? metadata.skillPath ?? nested?.skill_path ?? nested?.skillPath;
  const repository = normalizeGitHubRepositoryHint(repositoryValue);
  if (repository === null)
    return [];
  const path = normalizeProvenancePath(pathValue);
  return [{ repository, path }];
}
function normalizeGitHubRepositoryHint(value) {
  const raw = typeof value === "string" ? value.trim() : isRecord2(value) && typeof value.url === "string" ? value.url.trim() : "";
  if (raw.length === 0)
    return null;
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/iu.exec(raw);
  return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : null;
}
function normalizeProvenancePath(value) {
  if (typeof value !== "string")
    return null;
  const path = value.trim().replace(/^\.\//u, "");
  return path === "." || isSafeSnapshotPath(path) ? path : null;
}
function parseExternalSkillDocument(document2, expectedName) {
  try {
    return parseSkillDocument(document2);
  } catch (error) {
    throw new SkillManagerError("SKILL_SOURCE_INVALID", `External Skill "${expectedName}" has invalid frontmatter.`, { cause: error });
  }
}
async function discoverExternalSkills(targetRoots, request) {
  const candidates = [];
  const targets = normalizeDiscoveryTargets(request.targets);
  for (const target of targets) {
    const rootPath = targetRoots[target];
    if (rootPath === void 0)
      continue;
    let entries;
    try {
      entries = await readdir2(rootPath, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT")
        continue;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory())
        continue;
      const sourcePath = join2(rootPath, entry.name);
      let document2;
      try {
        document2 = await readFile2(join2(sourcePath, "SKILL.md"), "utf8");
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
          continue;
        throw error;
      }
      let parsed;
      try {
        parsed = parseExternalSkillDocument(document2, entry.name);
      } catch {
        continue;
      }
      if (!SKILL_NAME2.test(entry.name) || parsed.name !== entry.name)
        continue;
      try {
        candidates.push({
          name: parsed.name,
          description: parsed.description,
          contentHash: await hashSkillBundle(sourcePath),
          target
        });
      } catch (error) {
        if (error instanceof SkillManagerError && error.code === "UNSAFE_SKILL_BUNDLE")
          continue;
        throw error;
      }
    }
  }
  return candidates;
}
function resolveTargetRoots(roots) {
  return {
    ...roots?.codex === void 0 ? {} : { codex: resolve(roots.codex) },
    ...roots?.claude === void 0 ? {} : { claude: resolve(roots.claude) },
    ...roots?.agents === void 0 ? {} : { agents: resolve(roots.agents) },
    ...roots?.opencode === void 0 ? {} : { opencode: resolve(roots.opencode) }
  };
}
function normalizeDiscoveryTargets(targets) {
  const selected = targets ?? ["codex", "claude", "agents", "opencode"];
  return [...new Set(selected)].sort();
}
function requireTargetRoot(roots, target) {
  const root = roots[target];
  if (root === void 0) {
    throw new SkillManagerError("TARGET_NOT_CONFIGURED", `Target "${target}" has no configured Skill root.`);
  }
  return root;
}
function validateExternalSkillName(name) {
  if (!SKILL_NAME2.test(name)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", "Skill names must use lowercase letters, digits, and single hyphen separators.");
  }
}
async function assertDirectExternalSkillDirectory(path, name) {
  try {
    const entry = await lstat(path);
    if (entry.isDirectory() && !entry.isSymbolicLink())
      return;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT")
      throw error;
  }
  throw new SkillManagerError("SKILL_SOURCE_INVALID", `External Skill "${name}" is not a direct directory in its configured root.`);
}
async function copySkillBundle(source, destination) {
  const entries = await readdir2(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourceEntry = join2(source, entry.name);
    const destinationEntry = join2(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new SkillManagerError("UNSAFE_SKILL_BUNDLE", "Skill bundle contains an unsupported symbolic link.");
    }
    if (entry.isDirectory()) {
      await mkdir(destinationEntry, { recursive: false });
      await copySkillBundle(sourceEntry, destinationEntry);
      continue;
    }
    if (entry.isFile()) {
      await copyFile(sourceEntry, destinationEntry);
    }
  }
}
async function hashSkillBundle(root) {
  const hash = createHash3("sha256");
  await appendDirectoryHash(hash, root, "");
  return hash.digest("hex");
}
async function recordGitHubObservation(options, observation) {
  await options.githubSkillIndex?.record(observation).catch(() => void 0);
}
function observationFromEntry(entry, bundleHash, fingerprint, timestamp) {
  return {
    repositoryId: entry.repository.id,
    nodeId: entry.repository.nodeId,
    repository: { owner: entry.repository.owner, name: entry.repository.name },
    skillPath: entry.install.path,
    skillName: entry.name,
    fingerprint,
    commitSha: entry.snapshot.commitSha,
    skillDocumentBlobSha: entry.snapshot.blobSha,
    bundleHash,
    manifestFiles: entry.snapshot.manifestFiles ?? [],
    observedAt: entry.snapshot.fetchedAt,
    verifiedAt: timestamp
  };
}
function observationFromResolvedSnapshot(resolved, fingerprint, timestamp) {
  return {
    repositoryId: resolved.repository.repositoryId,
    nodeId: resolved.repository.nodeId,
    repository: { owner: resolved.repository.owner, name: resolved.repository.name },
    skillPath: resolved.skill.path,
    skillName: resolved.skill.name,
    fingerprint,
    commitSha: resolved.snapshot.commitSha,
    skillDocumentBlobSha: resolved.snapshot.skillDocumentBlobSha,
    bundleHash: resolved.snapshot.bundleHash,
    manifestFiles: [...resolved.skill.manifestFiles],
    observedAt: resolved.repository.discovery.discoveredAt,
    verifiedAt: timestamp
  };
}
function entryFromObservation(observation) {
  const repository = `${observation.repository.owner}/${observation.repository.name}`;
  const url = `https://github.com/${repository}`;
  return {
    id: `${repository}/${observation.skillName}`,
    source: "github",
    catalogs: ["github"],
    name: observation.skillName,
    description: observation.skillName,
    publisher: { name: observation.repository.owner, url: `https://github.com/${observation.repository.owner}` },
    author: null,
    repository: {
      host: "github",
      id: observation.repositoryId,
      nodeId: observation.nodeId,
      owner: observation.repository.owner,
      name: observation.repository.name,
      path: observation.skillPath,
      url
    },
    skillUrl: observation.skillPath === "." ? `${url}/blob/${observation.commitSha}/SKILL.md` : `${url}/tree/${observation.commitSha}/${observation.skillPath}`,
    install: {
      kind: "github",
      repository,
      skill: observation.skillName,
      path: observation.skillPath
    },
    metrics: { installs: null, stars: null, downloads: null },
    cover: { kind: "generated", seed: `${repository}#${observation.skillPath}` },
    snapshot: {
      commitSha: observation.commitSha,
      blobSha: observation.skillDocumentBlobSha,
      fetchedAt: observation.observedAt,
      ...observation.manifestFiles.length === 0 ? {} : { manifestFiles: observation.manifestFiles }
    }
  };
}
function deduplicateProvenanceEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  return entries.filter((entry) => {
    const key = `${entry.repository.id}#${entry.install.path}@${entry.snapshot.commitSha}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function limitProvenanceCandidates(entries) {
  const repositories = /* @__PURE__ */ new Set();
  const accepted = [];
  for (const entry of entries) {
    const repository = entry.install.repository.toLocaleLowerCase();
    if (!repositories.has(repository) && repositories.size >= 8)
      continue;
    repositories.add(repository);
    accepted.push(entry);
    if (accepted.length >= 20)
      break;
  }
  return accepted;
}
function deduplicateProvenanceMatches(matches3) {
  const byIdentity = /* @__PURE__ */ new Map();
  for (const match of matches3) {
    const key = `${match.entry.repository.id}#${match.entry.install.path}`;
    const previous = byIdentity.get(key);
    if (previous === void 0 || match.entry.snapshot.fetchedAt > previous.entry.snapshot.fetchedAt) {
      byIdentity.set(key, match);
    }
  }
  return [...byIdentity.values()];
}
function validateResolvedSkillSnapshot(resolved) {
  const { repository, skill, snapshot } = resolved;
  if (repository.repoKey !== `github:${repository.owner}/${repository.name}` || skill.skillKey !== `${repository.repoKey}#${skill.path}` || skill.repositoryId !== repository.repositoryId || !skill.installable || skill.structureStatus !== "structure-verified" || skill.validatedAtCommit !== snapshot.commitSha || skill.skillDocumentBlobSha !== snapshot.skillDocumentBlobSha || snapshot.repository.owner !== repository.owner || snapshot.repository.name !== repository.name || snapshot.skillPath !== skill.path || snapshot.snapshotKey !== `${skill.skillKey}@${snapshot.commitSha}` || !snapshot.integrity.commitPinned || !snapshot.integrity.pathsSafe || !snapshot.integrity.frontmatterValid || !snapshot.integrity.symlinksRejected || !snapshot.integrity.submodulesRejected || snapshot.files.length !== resolved.files.length || snapshot.files.length > MAX_SNAPSHOT_FILE_COUNT || !/^[a-f0-9]{40}$/iu.test(snapshot.commitSha) || !/^[a-f0-9]{40}$/iu.test(snapshot.skillDocumentBlobSha) || !/^[a-f0-9]{64}$/iu.test(snapshot.bundleHash))
    invalidResolvedSnapshot();
  const contentByPath = new Map(resolved.files.map((file) => [file.path, file.content]));
  if (contentByPath.size !== resolved.files.length)
    invalidResolvedSnapshot();
  const comparablePaths = /* @__PURE__ */ new Set();
  let totalBytes = 0;
  const files = snapshot.files.map((file) => {
    const content = contentByPath.get(file.path);
    const comparablePath = file.path.toLocaleLowerCase();
    if (!isSafeSnapshotPath(file.path) || isAgentInstructionPath2(file.path) || comparablePaths.has(comparablePath) || !(content instanceof Uint8Array) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_SNAPSHOT_FILE_BYTES || content.byteLength !== file.size || file.mode !== "100644" && file.mode !== "100755" || !/^[a-f0-9]{40}$/iu.test(file.blobSha))
      invalidResolvedSnapshot();
    comparablePaths.add(comparablePath);
    totalBytes += file.size;
    if (totalBytes > MAX_SNAPSHOT_BUNDLE_BYTES)
      invalidResolvedSnapshot();
    const blobSha = createHash3("sha1").update(`blob ${content.byteLength}\0`).update(content).digest("hex");
    if (blobSha !== file.blobSha)
      invalidResolvedSnapshot();
    return { path: file.path, content, blobSha, size: file.size, mode: file.mode };
  });
  const skillDocument = files.find((file) => file.path === "SKILL.md");
  if (skillDocument?.blobSha !== snapshot.skillDocumentBlobSha)
    invalidResolvedSnapshot();
  if (hashGitTreeFiles(files) !== snapshot.bundleHash)
    invalidResolvedSnapshot();
  return files;
}
function isSafeSnapshotPath(path) {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\") || path.includes("\0"))
    return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !/[<>:"|?*\u0000-\u001f]/u.test(segment) && !/[. ]$/u.test(segment) && !WINDOWS_RESERVED_NAME3.test(segment));
}
function hashGitTreeFiles(files) {
  const hash = createHash3("sha256");
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(file.blobSha);
    hash.update("\0");
    hash.update(String(file.size));
    hash.update("\0");
  }
  return hash.digest("hex");
}
function invalidResolvedSnapshot() {
  throw new SkillManagerError("INVALID_MARKETPLACE_INSTALL", "Resolved Skill snapshot is inconsistent or failed integrity validation.");
}
async function appendDirectoryHash(hash, root, relative) {
  const directory = join2(root, relative);
  const entries = await readdir2(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRelative = relative.length === 0 ? entry.name : join2(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new SkillManagerError("UNSAFE_SKILL_BUNDLE", "Skill bundle contains an unsupported symbolic link.");
    }
    if (entry.isDirectory()) {
      await appendDirectoryHash(hash, root, entryRelative);
      continue;
    }
    if (entry.isFile()) {
      hash.update(entryRelative.replaceAll("\\", "/"));
      hash.update("\0");
      hash.update(await readFile2(join2(root, entryRelative)));
      hash.update("\0");
    }
  }
}
async function readRegistry(path) {
  try {
    const raw = await readFile2(path, "utf8");
    const value = JSON.parse(raw);
    if (!isRegistryFile(value)) {
      throw new SkillManagerError("REGISTRY_INVALID", "Skill Manager registry is invalid.");
    }
    return value;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { version: REGISTRY_VERSION, skills: {} };
    }
    throw error;
  }
}
async function writeRegistry(root, path, registry) {
  await mkdir(root, { recursive: true });
  const temporary = join2(root, `.registry-${randomUUID()}.tmp`);
  const backup = join2(root, `.registry-${randomUUID()}.bak`);
  await writeFile(temporary, `${JSON.stringify(registry, null, 2)}
`, "utf8");
  const hadRegistry = await pathExists(path);
  try {
    if (hadRegistry)
      await rename(path, backup);
    await rename(temporary, path);
    if (hadRegistry)
      await rm(backup, { force: true }).catch(() => void 0);
  } catch (error) {
    await rm(temporary, { force: true });
    if (hadRegistry && await pathExists(backup) && !await pathExists(path)) {
      await rename(backup, path);
    }
    throw error;
  }
}
async function enableActiveLink(source, destination, activeRoot, existingIsOwned = false) {
  await mkdir(activeRoot, { recursive: true });
  if (await pathEntryExists(destination)) {
    if (existingIsOwned && await pathsReferToSameDirectory(source, destination))
      return;
    throw new SkillManagerError("ACTIVE_PATH_CONFLICT", "The target already contains a different same-name path.");
  }
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
}
async function disableActiveLink(source, destination, existingIsOwned, missingIsConflict = false) {
  try {
    await lstat(destination);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      if (!missingIsConflict)
        return;
      throw new SkillManagerError("ACTIVE_PATH_CONFLICT", "The external target link is missing and cannot be safely disabled.");
    }
    throw error;
  }
  if (!existingIsOwned || !await pathsReferToSameDirectory(source, destination)) {
    throw new SkillManagerError("ACTIVE_PATH_CONFLICT", "Refusing to remove a target path not owned by Skill Manager.");
  }
  await rm(destination, { force: true, recursive: false });
}
async function pathsReferToSameDirectory(left, right) {
  try {
    const [leftReal, rightReal] = await Promise.all([realpath(left), realpath(right)]);
    return normalizeComparablePath(leftReal) === normalizeComparablePath(rightReal);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return false;
    throw error;
  }
}
function normalizeComparablePath(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function uniqueTargets(targets) {
  return [...new Set(targets)];
}
function toManagedSkill(skill) {
  const { relativePath: _relativePath, ...managed } = skill;
  return { ...managed, enabledTargets: [...managed.enabledTargets] };
}
async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return false;
    throw error;
  }
}
async function pathEntryExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return false;
    throw error;
  }
}
function isRegistryFile(value) {
  return isRecord2(value) && value.version === REGISTRY_VERSION && isRecord2(value.skills);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(value) {
  return value instanceof Error && "code" in value;
}

// ../core/dist/marketplace/skills-sh-source.js
var SEARCH_ENDPOINT = "https://skills.sh/api/search";
var LEADERBOARD_ENDPOINT = "https://skills.sh/api/skills/all-time";
var DEFAULT_LIMIT = 20;
var MAX_LIMIT = 200;
var DEFAULT_TIMEOUT_MS2 = 1e4;
var LEADERBOARD_PAGE_SIZE = 200;
var DEFAULT_CACHE_TTL_MS = 5 * 6e4;
function createSkillsShMarketplaceSource(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
  assertTimeout(timeoutMs);
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_TIMEOUT", "Marketplace cache TTL must be a non-negative integer in milliseconds.");
  }
  const leaderboardCache = /* @__PURE__ */ new Map();
  return {
    async search(request) {
      const query = normalizeQuery(request.query);
      const limit = normalizeLimit(request.limit);
      const url = new URL(SEARCH_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(limit));
      const response = await fetchWithDeadline(fetch, url, request, timeoutMs);
      if (!response.ok) {
        throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `skills.sh search failed with HTTP ${response.status}.`);
      }
      const payload = await parseJson(response);
      const entries = normalizeResponse(payload);
      return {
        source: "skills-sh",
        query,
        returnedCount: entries.length,
        entries,
        sources: [{
          source: "skills-sh",
          status: "available",
          returnedCount: entries.length,
          error: null
        }]
      };
    },
    async browse(request = {}) {
      const offset = normalizeOffset(request.offset);
      const limit = normalizeLimit(request.limit);
      const firstPage = Math.floor(offset / LEADERBOARD_PAGE_SIZE);
      const lastPage = Math.floor((offset + limit - 1) / LEADERBOARD_PAGE_SIZE);
      const pages = await Promise.all(Array.from({ length: lastPage - firstPage + 1 }, (_, index) => loadLeaderboardPage(firstPage + index, request)));
      const entries = pages.flatMap((page) => page.entries);
      const firstIndex = offset - firstPage * LEADERBOARD_PAGE_SIZE;
      const selected = entries.slice(firstIndex, firstIndex + limit);
      const total = pages[0]?.total ?? 0;
      return {
        source: "skills-sh",
        ranking: "all-time-installs",
        offset,
        returnedCount: selected.length,
        total,
        hasMore: offset + selected.length < total,
        entries: selected
      };
    }
  };
  async function loadLeaderboardPage(page, request) {
    const cached = leaderboardCache.get(page);
    if (cached !== void 0 && cached.expiresAt > Date.now())
      return cached.value;
    const value = fetchLeaderboardPage(fetch, page, request, timeoutMs).catch((error) => {
      if (leaderboardCache.get(page)?.value === value)
        leaderboardCache.delete(page);
      throw error;
    });
    leaderboardCache.set(page, { expiresAt: Date.now() + cacheTtlMs, value });
    return value;
  }
}
async function fetchLeaderboardPage(fetch, page, request, timeoutMs) {
  const url = new URL(`${LEADERBOARD_ENDPOINT}/${page}`);
  const response = await fetchWithDeadline(fetch, url, {
    query: "all-time",
    ...request.signal === void 0 ? {} : { signal: request.signal }
  }, timeoutMs);
  if (!response.ok) {
    throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `skills.sh leaderboard failed with HTTP ${response.status}.`);
  }
  const payload = await parseJson(response);
  if (!isRecord3(payload) || payload.page !== page || !Number.isSafeInteger(payload.total) || Number(payload.total) < 0 || typeof payload.hasMore !== "boolean" || !Array.isArray(payload.skills) || payload.skills.length > LEADERBOARD_PAGE_SIZE) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "skills.sh leaderboard returned an unsupported response shape.");
  }
  const entries = normalizeLeaderboardEntries(payload.skills);
  return {
    page,
    total: Number(payload.total),
    hasMore: payload.hasMore,
    entries
  };
}
function normalizeLeaderboardEntries(values) {
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    const entry = parseEntry(value);
    if (entry === void 0) {
      if (isUnsupportedLeaderboardEntry(value))
        continue;
      throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "skills.sh leaderboard contains an invalid Skill.");
    }
    if (seen.has(entry.id))
      continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}
function isUnsupportedLeaderboardEntry(value) {
  if (!isRecord3(value))
    return false;
  const skillId = readNonEmptyString(value.skillId);
  const name = readNonEmptyString(value.name);
  const installs = readInstallCount(value.installs);
  const source = readNonEmptyString(value.source);
  return isPathSegment(skillId) && name.length > 0 && installs >= 0 && source.length > 0 && parseGitHubRepository(source) === void 0;
}
function normalizeQuery(input) {
  const query = input.trim();
  if (query.length < 2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_QUERY", "Marketplace search queries must contain at least two characters.");
  }
  return query;
}
function normalizeLimit(input) {
  const limit = input ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", `Marketplace search limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
}
function normalizeOffset(input) {
  const offset = input ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1e5) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "Marketplace browse offset must be an integer from 0 to 100000.");
  }
  return offset;
}
function assertTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_TIMEOUT", "Marketplace timeout must be a positive integer in milliseconds.");
  }
}
async function fetchWithDeadline(fetch, url, request, timeoutMs) {
  if (request.signal?.aborted) {
    throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const cancelFromCaller = () => {
    callerAborted = true;
    controller.abort(request.signal?.reason);
  };
  request.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut) {
      throw new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `skills.sh search exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || request.signal?.aborted) {
      throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.", { cause: error });
    }
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "Unable to reach skills.sh.", { cause: error });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function parseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "skills.sh returned malformed JSON.", { cause: error });
  }
}
function normalizeResponse(payload) {
  if (!isRecord3(payload) || !Array.isArray(payload.skills)) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "skills.sh returned an unsupported response shape.");
  }
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of payload.skills) {
    const parsed = parseEntry(candidate);
    if (parsed === void 0 || seen.has(parsed.id))
      continue;
    seen.add(parsed.id);
    entries.push(parsed);
  }
  return entries;
}
function parseEntry(value) {
  if (!isRecord3(value))
    return void 0;
  const raw = {
    skillId: readNonEmptyString(value.skillId),
    name: readNonEmptyString(value.name),
    installs: readInstallCount(value.installs),
    source: readNonEmptyString(value.source)
  };
  if (raw.skillId.length === 0 || raw.name.length === 0 || raw.source.length === 0 || raw.installs < 0)
    return void 0;
  const repository = parseGitHubRepository(raw.source);
  if (repository === void 0 || !isPathSegment(raw.skillId))
    return void 0;
  const id = `${raw.source}/${raw.skillId}`;
  const repositoryUrl = `https://github.com/${raw.source}`;
  return {
    id,
    source: "skills-sh",
    catalogs: ["skills-sh"],
    name: raw.name,
    description: null,
    publisher: {
      name: repository.owner,
      url: `https://github.com/${repository.owner}`
    },
    author: null,
    repository: {
      host: "github",
      owner: repository.owner,
      name: repository.name,
      path: null,
      url: repositoryUrl
    },
    skillUrl: `https://skills.sh/${id}`,
    install: {
      kind: "github",
      repository: raw.source,
      skill: raw.skillId,
      path: null
    },
    metrics: {
      installs: {
        value: raw.installs,
        source: "skills.sh"
      },
      stars: null,
      downloads: null
    },
    cover: {
      kind: "generated",
      seed: id
    }
  };
}
function parseGitHubRepository(value) {
  const segments = value.split("/");
  if (segments.length !== 2)
    return void 0;
  const [owner, name] = segments;
  if (owner === void 0 || name === void 0)
    return void 0;
  if (!isPathSegment(owner) || !isPathSegment(name))
    return void 0;
  return { owner, name };
}
function isPathSegment(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(value);
}
function readNonEmptyString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function readInstallCount(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : -1;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/hugging-face-source.js
import { Buffer as Buffer4 } from "node:buffer";
var MANIFEST_URL = "https://api.github.com/repos/huggingface/skills/contents/.claude-plugin/marketplace-internal.json?ref=main";
var REPOSITORY = "huggingface/skills";
var DEFAULT_LIMIT2 = 20;
var MAX_LIMIT2 = 200;
var DEFAULT_TIMEOUT_MS3 = 1e4;
var SKILL_NAME3 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var BASE64_PATTERN2 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function createHuggingFaceMarketplaceSource(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS3;
  assertTimeout2(timeoutMs);
  return {
    async search(request) {
      const query = normalizeQuery2(request.query);
      const limit = normalizeLimit2(request.limit);
      return searchWithDeadline(fetch, request, timeoutMs, query, limit);
    }
  };
}
async function searchWithDeadline(fetch, request, timeoutMs, query, limit) {
  if (request.signal?.aborted)
    aborted();
  const controller = new AbortController();
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  let timedOut = false;
  let callerAborted = false;
  const cancelFromCaller = () => {
    callerAborted = true;
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled."));
    controller.abort(request.signal?.reason);
  };
  request.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `Hugging Face marketplace search exceeded ${timeoutMs} ms.`));
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([
      fetchManifest(fetch, controller.signal, query, limit),
      boundary
    ]);
  } catch (error) {
    if (timedOut) {
      throw new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `Hugging Face marketplace search exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || request.signal?.aborted) {
      throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.", { cause: error });
    }
    if (error instanceof MarketplaceSourceError)
      throw error;
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "Unable to reach the official Hugging Face Skill catalog.", { cause: error });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function fetchManifest(fetch, signal, query, limit) {
  const response = await fetch(MANIFEST_URL, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager"
    },
    signal
  });
  if (!response.ok) {
    throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `Hugging Face marketplace manifest failed with HTTP ${response.status}.`);
  }
  const manifest = await parseManifestResponse(response);
  const terms = query.toLocaleLowerCase().split(/\s+/u);
  const entries = manifest.filter((entry) => matches(entry, terms)).sort(compareEntries).slice(0, limit);
  return {
    source: "hugging-face",
    query,
    returnedCount: entries.length,
    entries,
    sources: [{
      source: "hugging-face",
      status: "available",
      returnedCount: entries.length,
      error: null
    }]
  };
}
async function parseManifestResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    invalidResponse("GitHub returned malformed JSON for the Hugging Face manifest.", error);
  }
  if (!isRecord4(payload) || payload.encoding !== "base64") {
    invalidResponse("Hugging Face manifest response has an unsupported shape.");
  }
  const content = readNonEmptyString2(payload.content);
  if (content === void 0)
    invalidResponse("Hugging Face manifest response is missing content.");
  const encoded = content.replace(/\s/gu, "");
  if (!BASE64_PATTERN2.test(encoded))
    invalidResponse("Hugging Face manifest content is not valid base64.");
  let manifest;
  try {
    manifest = JSON.parse(Buffer4.from(encoded, "base64").toString("utf8"));
  } catch (error) {
    invalidResponse("Hugging Face marketplace manifest contains malformed JSON.", error);
  }
  if (!isRecord4(manifest) || manifest.name !== "huggingface-skills" || !isRecord4(manifest.owner) || manifest.owner.name !== "Hugging Face" || !Array.isArray(manifest.plugins)) {
    invalidResponse("Hugging Face marketplace manifest has an unsupported schema.");
  }
  const entries = [];
  const names = /* @__PURE__ */ new Set();
  for (const plugin of manifest.plugins) {
    const entry = parsePlugin(plugin);
    if (names.has(entry.name))
      invalidResponse("Hugging Face marketplace manifest contains duplicate Skills.");
    names.add(entry.name);
    entries.push(entry);
  }
  return entries;
}
function parsePlugin(value) {
  if (!isRecord4(value))
    invalidResponse("Hugging Face marketplace manifest contains an invalid plugin.");
  const name = readNonEmptyString2(value.name);
  const description = readNonEmptyString2(value.description);
  const source = readNonEmptyString2(value.source);
  if (name === void 0 || description === void 0 || source !== `./skills/${name}` || value.skills !== "./" || !SKILL_NAME3.test(name))
    invalidResponse("Hugging Face marketplace manifest contains an invalid Skill entry.");
  const path = `skills/${name}`;
  const id = `${REPOSITORY}/${path}`;
  return {
    id,
    source: "hugging-face",
    catalogs: ["hugging-face"],
    name,
    description,
    publisher: {
      name: "Hugging Face",
      url: "https://huggingface.co"
    },
    author: null,
    repository: {
      host: "github",
      owner: "huggingface",
      name: "skills",
      path,
      url: "https://github.com/huggingface/skills"
    },
    skillUrl: `https://github.com/huggingface/skills/tree/main/${path}`,
    install: {
      kind: "github",
      repository: REPOSITORY,
      skill: name,
      path
    },
    metrics: {
      installs: null,
      stars: null,
      downloads: null
    },
    cover: {
      kind: "generated",
      seed: id
    }
  };
}
function matches(entry, terms) {
  const haystack = `${entry.name} ${entry.description ?? ""}`.toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}
function compareEntries(left, right) {
  return left.name.localeCompare(right.name);
}
function normalizeQuery2(input) {
  const query = input.trim();
  if (query.length < 2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_QUERY", "Marketplace search queries must contain at least two characters.");
  }
  return query;
}
function normalizeLimit2(input) {
  const limit = input ?? DEFAULT_LIMIT2;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", `Marketplace search limit must be an integer from 1 to ${MAX_LIMIT2}.`);
  }
  return limit;
}
function assertTimeout2(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_TIMEOUT", "Marketplace timeout must be a positive integer in milliseconds.");
  }
}
function aborted() {
  throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.");
}
function invalidResponse(message, cause) {
  throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", message, cause === void 0 ? void 0 : { cause });
}
function readNonEmptyString2(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/github-source.js
var GITHUB_API_ROOT2 = "https://api.github.com";
var DEFAULT_LIMIT3 = 20;
var MAX_LIMIT3 = 200;
var DEFAULT_TIMEOUT_MS4 = 25e3;
var DEFAULT_REPOSITORY_LIMIT = 3;
var MAX_REPOSITORY_LIMIT = 5;
var SKILL_NAME4 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;
var WINDOWS_RESERVED_NAME4 = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
function createGitHubMarketplaceSource(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS4;
  const repositoryLimit = options.repositoryLimit ?? DEFAULT_REPOSITORY_LIMIT;
  assertPositiveInteger(timeoutMs, "INVALID_MARKETPLACE_TIMEOUT", "Marketplace timeout");
  if (!Number.isInteger(repositoryLimit) || repositoryLimit < 1 || repositoryLimit > MAX_REPOSITORY_LIMIT) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", `GitHub repository validation limit must be an integer from 1 to ${MAX_REPOSITORY_LIMIT}.`);
  }
  const token = normalizeToken(options.token);
  return {
    async search(request) {
      const query = normalizeQuery3(request.query);
      const limit = normalizeLimit3(request.limit);
      return searchWithDeadline2(fetch, request, timeoutMs, repositoryLimit, query, limit, token);
    }
  };
}
async function searchWithDeadline2(fetch, request, timeoutMs, repositoryLimit, query, limit, token) {
  if (request.signal?.aborted)
    aborted2();
  const controller = new AbortController();
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  let timedOut = false;
  let callerAborted = false;
  const cancelFromCaller = () => {
    callerAborted = true;
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled."));
    controller.abort(request.signal?.reason);
  };
  request.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `GitHub marketplace discovery exceeded ${timeoutMs} ms.`));
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([
      discover(fetch, controller.signal, repositoryLimit, query, limit, token),
      boundary
    ]);
  } catch (error) {
    if (timedOut) {
      throw new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `GitHub marketplace discovery exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || request.signal?.aborted) {
      throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.", { cause: error });
    }
    if (error instanceof MarketplaceSourceError)
      throw error;
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "Unable to reach GitHub marketplace discovery.", { cause: error });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function discover(fetch, signal, repositoryLimit, query, limit, token) {
  const url = new URL(`${GITHUB_API_ROOT2}/search/repositories`);
  url.searchParams.set("q", `${query} SKILL.md in:name,description,readme`);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(repositoryLimit));
  const response = await fetch(url, requestInit(signal, token));
  assertResponse(response, "GitHub repository search");
  const payload = await parseJson2(response, "GitHub repository search returned malformed JSON.");
  const { repositories, incomplete } = parseSearch(payload);
  const discovered = await Promise.all(repositories.map((repository) => discoverRepository(fetch, signal, repository, query, token)));
  const entries = discovered.flat().sort(compareEntries2).slice(0, limit);
  return {
    source: "github",
    query,
    returnedCount: entries.length,
    entries,
    sources: [{
      source: "github",
      status: incomplete ? "unavailable" : "available",
      returnedCount: entries.length,
      error: incomplete ? {
        code: "GITHUB_SEARCH_INCOMPLETE",
        message: "GitHub returned incomplete repository search results."
      } : null
    }]
  };
}
async function discoverRepository(fetch, signal, repository, query, token) {
  const url = `${GITHUB_API_ROOT2}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`;
  const response = await fetch(url, requestInit(signal, token));
  assertResponse(response, `GitHub tree for ${repository.fullName}`);
  const payload = await parseJson2(response, `GitHub returned malformed tree JSON for ${repository.fullName}.`);
  if (!isRecord5(payload) || !Array.isArray(payload.tree) || typeof payload.truncated !== "boolean") {
    invalidResponse2(`GitHub returned an unsupported tree for ${repository.fullName}.`);
  }
  if (payload.truncated)
    return [];
  const paths = /* @__PURE__ */ new Map();
  const ambiguousNames = /* @__PURE__ */ new Set();
  for (const item of payload.tree) {
    if (!isRecord5(item) || item.type !== "blob" || typeof item.path !== "string")
      continue;
    const path = normalizeSkillDocumentPath(item.path);
    if (path === void 0)
      continue;
    const name = path.split("/").at(-2);
    if (name === void 0 || !SKILL_NAME4.test(name))
      continue;
    const directory = path.slice(0, -"/SKILL.md".length);
    if (paths.has(name))
      ambiguousNames.add(name);
    else
      paths.set(name, directory);
  }
  for (const name of ambiguousNames)
    paths.delete(name);
  const terms = query.toLocaleLowerCase().split(/\s+/u);
  return [...paths].filter(([name, path]) => matches2(repository, name, path, terms)).map(([name, path]) => toEntry(repository, name, path));
}
function parseSearch(payload) {
  if (!isRecord5(payload) || typeof payload.incomplete_results !== "boolean" || !Array.isArray(payload.items)) {
    invalidResponse2("GitHub repository search returned an unsupported response shape.");
  }
  const repositories = payload.items.map(parseRepository);
  return { repositories, incomplete: payload.incomplete_results };
}
function parseRepository(value) {
  if (!isRecord5(value) || !isRecord5(value.owner))
    invalidResponse2("GitHub search returned an invalid repository.");
  const owner = readNonEmptyString3(value.owner.login);
  const name = readNonEmptyString3(value.name);
  const fullName = readNonEmptyString3(value.full_name);
  const url = readNonEmptyString3(value.html_url);
  const defaultBranch = readNonEmptyString3(value.default_branch);
  if (owner === void 0 || name === void 0 || fullName !== `${owner}/${name}` || url !== `https://github.com/${owner}/${name}` || defaultBranch === void 0 || !REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(name) || typeof value.stargazers_count !== "number" || !Number.isSafeInteger(value.stargazers_count) || value.stargazers_count < 0 || !(value.description === null || typeof value.description === "string"))
    invalidResponse2("GitHub search returned an invalid repository.");
  return {
    owner,
    name,
    fullName,
    url,
    description: value.description,
    defaultBranch,
    stars: value.stargazers_count
  };
}
function toEntry(repository, name, path) {
  const id = `${repository.fullName}/${path || name}`;
  const encodedBranch = encodeURIComponent(repository.defaultBranch);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return {
    id,
    source: "github",
    catalogs: ["github"],
    name,
    description: null,
    publisher: { name: repository.owner, url: `https://github.com/${repository.owner}` },
    author: null,
    repository: {
      host: "github",
      owner: repository.owner,
      name: repository.name,
      path: path || null,
      url: repository.url
    },
    skillUrl: path ? `${repository.url}/tree/${encodedBranch}/${encodedPath}` : `${repository.url}/blob/${encodedBranch}/SKILL.md`,
    install: {
      kind: "github",
      repository: repository.fullName,
      skill: name,
      path: path || null
    },
    metrics: {
      installs: null,
      stars: { value: repository.stars, source: "github", scope: "repository" },
      downloads: null
    },
    cover: { kind: "generated", seed: id }
  };
}
function matches2(repository, name, path, terms) {
  const haystack = `${name} ${path} ${repository.fullName} ${repository.description ?? ""}`.toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}
function requestInit(signal, token) {
  return {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager",
      ...token === void 0 ? {} : { authorization: `Bearer ${token}` }
    },
    signal
  };
}
function assertResponse(response, operation) {
  if (response.ok)
    return;
  if (response.status === 429 || response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new MarketplaceSourceError("GITHUB_RATE_LIMITED", "GitHub API rate limit was exceeded. Try again later or configure authentication.");
  }
  throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `${operation} failed with HTTP ${response.status}.`);
}
async function parseJson2(response, message) {
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", message, { cause: error });
  }
}
function normalizeSkillDocumentPath(value) {
  if (!value.endsWith("/SKILL.md") || value.startsWith("/") || value.includes("\\"))
    return void 0;
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || /[<>:"|?*\u0000-\u001f]/u.test(segment) || /[. ]$/u.test(segment) || WINDOWS_RESERVED_NAME4.test(segment)))
    return void 0;
  return value;
}
function normalizeQuery3(input) {
  const query = input.trim();
  if (query.length < 2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_QUERY", "Marketplace search queries must contain at least two characters.");
  }
  return query;
}
function normalizeLimit3(input) {
  const limit = input ?? DEFAULT_LIMIT3;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT3) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", `Marketplace search limit must be an integer from 1 to ${MAX_LIMIT3}.`);
  }
  return limit;
}
function normalizeToken(input) {
  if (input === void 0)
    return void 0;
  const token = input.trim();
  return token.length > 0 ? token : void 0;
}
function assertPositiveInteger(value, code, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new MarketplaceSourceError(code, `${label} must be a positive integer in milliseconds.`);
  }
}
function compareEntries2(left, right) {
  return (right.metrics.stars?.value ?? 0) - (left.metrics.stars?.value ?? 0) || left.name.localeCompare(right.name);
}
function readNonEmptyString3(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function aborted2() {
  throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.");
}
function invalidResponse2(message) {
  throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", message);
}
function isRecord5(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/composite-source.js
function createCompositeMarketplaceSource(options) {
  if (options.sources.length === 0) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "Composite marketplace requires at least one source.");
  }
  return {
    async search(request) {
      validateRequest(request);
      const settled = await Promise.all(options.sources.map((child) => settleSource(child, request)));
      const sources = [];
      const entries = /* @__PURE__ */ new Map();
      for (const result of settled) {
        sources.push(result.status);
        for (const entry of result.entries) {
          const identity = entryIdentity(entry);
          const existing = entries.get(identity);
          entries.set(identity, existing === void 0 ? entry : mergeEntry(existing, entry));
        }
      }
      const limit = request.limit ?? 20;
      const merged = [...entries.values()].sort(compareEntries3).slice(0, limit);
      return {
        source: "composite",
        query: request.query.trim(),
        returnedCount: merged.length,
        entries: merged,
        sources
      };
    }
  };
}
async function settleSource(child, request) {
  try {
    const result = await child.source.search(request);
    const status = result.sources[0];
    if (status === void 0 || result.sources.length !== 1 || status.source !== child.kind) {
      throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "A composite child source returned an unsupported status set.");
    }
    return { status, entries: result.entries };
  } catch (error) {
    const normalized = error instanceof MarketplaceSourceError ? error : new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "Marketplace source failed unexpectedly.", { cause: error });
    return {
      status: {
        source: child.kind,
        status: "unavailable",
        returnedCount: 0,
        error: { code: normalized.code, message: normalized.message }
      },
      entries: []
    };
  }
}
function validateRequest(request) {
  if (request.signal?.aborted) {
    throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Marketplace search was cancelled.");
  }
  if (request.query.trim().length < 2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_QUERY", "Marketplace search queries must contain at least two characters.");
  }
  const limit = request.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "Marketplace search limit must be an integer from 1 to 200.");
  }
}
function entryIdentity(entry) {
  return `${entry.repository.owner.toLocaleLowerCase()}/${entry.repository.name.toLocaleLowerCase()}/${entry.install.skill.toLocaleLowerCase()}`;
}
function mergeEntry(left, right) {
  const primary = left.source === "skills-sh" ? left : right.source === "skills-sh" ? right : left;
  const secondary = primary === left ? right : left;
  return {
    ...primary,
    catalogs: uniqueCatalogs([...left.catalogs, ...right.catalogs]),
    description: primary.description ?? secondary.description,
    publisher: primary.publisher ?? secondary.publisher,
    author: primary.author ?? secondary.author,
    repository: {
      ...primary.repository,
      path: primary.repository.path ?? secondary.repository.path
    },
    install: {
      ...primary.install,
      path: primary.install.path ?? secondary.install.path
    },
    metrics: {
      installs: primary.metrics.installs ?? secondary.metrics.installs,
      stars: primary.metrics.stars ?? secondary.metrics.stars,
      downloads: primary.metrics.downloads ?? secondary.metrics.downloads
    }
  };
}
function uniqueCatalogs(values) {
  return [...new Set(values)].sort((left, right) => catalogOrder(left) - catalogOrder(right));
}
function catalogOrder(value) {
  if (value === "skills-sh")
    return 0;
  if (value === "github")
    return 1;
  return 2;
}
function compareEntries3(left, right) {
  const leftInstalls = left.metrics.installs?.value ?? -1;
  const rightInstalls = right.metrics.installs?.value ?? -1;
  return rightInstalls - leftInstalls || left.name.localeCompare(right.name);
}

// ../core/dist/marketplace/github-resolver.js
import { Buffer as Buffer5 } from "node:buffer";
import { parse as parse2 } from "yaml";
var GITHUB_API_ROOT3 = "https://api.github.com";
var DEFAULT_TIMEOUT_MS5 = 1e4;
var SHA_PATTERN2 = /^[a-f0-9]{40}$/i;
var BASE64_PATTERN3 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
var GITHUB_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
var SKILL_NAME5 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function createGitHubMarketplaceResolver(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS5;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Marketplace resolution timeout must be a positive integer in milliseconds.");
  }
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  return {
    async resolve(entry, request = {}) {
      assertResolvableEntry(entry);
      return resolveWithDeadline(fetch, entry, request, timeoutMs, now);
    }
  };
}
async function resolveWithDeadline(fetch, entry, request, timeoutMs, now) {
  if (request.signal?.aborted) {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace resolution was cancelled.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const cancelFromCaller = () => {
    callerAborted = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace resolution was cancelled."));
    controller.abort(request.signal?.reason);
  };
  request.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace resolution exceeded ${timeoutMs} ms.`));
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([
      resolveSnapshot(fetch, entry, controller.signal, now),
      boundary
    ]);
  } catch (error) {
    if (timedOut) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Marketplace resolution exceeded ${timeoutMs} ms.`, { cause: error });
    }
    if (callerAborted || request.signal?.aborted) {
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Marketplace resolution was cancelled.", { cause: error });
    }
    if (error instanceof MarketplaceResolverError)
      throw error;
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "Unable to reach GitHub.", { cause: error });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancelFromCaller);
  }
}
async function resolveSnapshot(fetch, entry, signal, now) {
  const repositorySlug = `${entry.repository.owner}/${entry.repository.name}`;
  const repository = parseRepository2(await getJson2(fetch, `${GITHUB_API_ROOT3}/repos/${repositorySlug}`, signal));
  const commitSha = parseCommit(await getJson2(fetch, `${GITHUB_API_ROOT3}/repos/${repositorySlug}/commits/${encodeURIComponent(repository.defaultBranch)}`, signal));
  const candidate = parseTree2(await getJson2(fetch, `${GITHUB_API_ROOT3}/repos/${repositorySlug}/git/trees/${commitSha}?recursive=1`, signal), entry.install.skill, entry.install.path);
  const skill = parseSkillBlob(await getJson2(fetch, `${GITHUB_API_ROOT3}/repos/${repositorySlug}/git/blobs/${candidate.blobSha}`, signal), entry.install.skill);
  return {
    ...entry,
    description: skill.description,
    publisher: {
      name: repository.ownerName,
      url: repository.ownerUrl
    },
    author: skill.author,
    repository: {
      host: "github",
      id: repository.id,
      nodeId: repository.nodeId,
      owner: entry.repository.owner,
      name: entry.repository.name,
      path: candidate.path,
      url: repository.url
    },
    install: {
      ...entry.install,
      path: candidate.path
    },
    metrics: {
      ...entry.metrics,
      stars: {
        value: repository.stars,
        source: "github",
        scope: "repository"
      }
    },
    snapshot: {
      commitSha,
      blobSha: candidate.blobSha,
      fetchedAt: now().toISOString()
    }
  };
}
async function getJson2(fetch, url, signal) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager"
    },
    signal
  });
  if (!response.ok) {
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
      throw new MarketplaceResolverError("GITHUB_RATE_LIMITED", "GitHub API rate limit was exceeded.");
    }
    throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub request failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned malformed JSON.", { cause: error });
  }
}
function assertResolvableEntry(entry) {
  const repositorySlug = `${entry.repository.owner}/${entry.repository.name}`;
  if (entry.repository.host !== "github" || !GITHUB_PATH_SEGMENT.test(entry.repository.owner) || !GITHUB_PATH_SEGMENT.test(entry.repository.name) || entry.install.kind !== "github" || !SKILL_NAME5.test(entry.install.skill) || entry.install.repository !== repositorySlug || entry.repository.path !== entry.install.path || entry.install.path !== null && entry.install.path !== "." && !isSafeRepositoryPath(entry.install.path)) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Marketplace entry is not a resolvable GitHub Skill.");
  }
}
function parseRepository2(payload) {
  if (!isRecord6(payload) || !isRecord6(payload.owner))
    invalidGitHubResponse2();
  const id = readSafeNonNegativeInteger(payload.id);
  const stars = readSafeNonNegativeInteger(payload.stargazers_count);
  const nodeId = readNonEmptyString4(payload.node_id);
  const defaultBranch = readNonEmptyString4(payload.default_branch);
  const url = readHttpsUrl(payload.html_url);
  const ownerName = readNonEmptyString4(payload.owner.login);
  const ownerUrl = readHttpsUrl(payload.owner.html_url);
  if (id === void 0 || stars === void 0 || nodeId === void 0 || defaultBranch === void 0 || url === void 0 || ownerName === void 0 || ownerUrl === void 0)
    invalidGitHubResponse2();
  return { id, nodeId, defaultBranch, stars, url, ownerName, ownerUrl };
}
function parseCommit(payload) {
  if (!isRecord6(payload))
    invalidGitHubResponse2();
  const sha = readNonEmptyString4(payload.sha);
  if (sha === void 0 || !SHA_PATTERN2.test(sha))
    invalidGitHubResponse2();
  return sha;
}
function parseTree2(payload, skillName, exactPath) {
  if (!isRecord6(payload) || typeof payload.truncated !== "boolean" || !Array.isArray(payload.tree)) {
    invalidGitHubResponse2();
  }
  if (payload.truncated) {
    throw new MarketplaceResolverError("GITHUB_TREE_TRUNCATED", "GitHub returned a truncated repository tree.");
  }
  const expectedDocument = exactPath === null ? null : exactPath === "." ? "SKILL.md" : `${exactPath}/SKILL.md`;
  const matches3 = [];
  for (const item of payload.tree) {
    if (!isRecord6(item) || item.type !== "blob")
      continue;
    const path = readNonEmptyString4(item.path);
    const blobSha = readNonEmptyString4(item.sha);
    if (path === void 0 || blobSha === void 0 || !SHA_PATTERN2.test(blobSha))
      continue;
    const segments = path.split("/");
    if (expectedDocument !== null && path !== expectedDocument)
      continue;
    if (path === "SKILL.md" && exactPath === ".") {
      matches3.push({ path: ".", blobSha });
      continue;
    }
    if (segments.length >= 2 && segments.at(-1) === "SKILL.md" && segments.at(-2) === skillName) {
      if (!isSafeRepositoryPath(path))
        invalidGitHubResponse2();
      matches3.push({ path: segments.slice(0, -1).join("/"), blobSha });
    }
  }
  if (matches3.length === 0) {
    throw new MarketplaceResolverError("GITHUB_SKILL_NOT_FOUND", expectedDocument === null ? `GitHub repository does not contain an exact ${skillName}/SKILL.md candidate.` : `GitHub repository does not contain the exact ${expectedDocument} Skill document.`);
  }
  if (matches3.length > 1) {
    throw new MarketplaceResolverError("GITHUB_SKILL_AMBIGUOUS", `GitHub repository contains multiple ${skillName}/SKILL.md candidates.`);
  }
  return matches3[0];
}
function parseSkillBlob(payload, expectedName) {
  if (!isRecord6(payload) || payload.encoding !== "base64")
    invalidGitHubResponse2();
  const content = readNonEmptyString4(payload.content);
  if (content === void 0)
    invalidGitHubResponse2();
  const encoded = content.replace(/\s/g, "");
  if (!BASE64_PATTERN3.test(encoded)) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an invalid base64 Skill blob.");
  }
  const document2 = Buffer5.from(encoded, "base64").toString("utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(document2);
  if (match === null)
    invalidSkillDocument("Skill document is missing valid frontmatter.");
  let frontmatter;
  try {
    frontmatter = parse2(match[1] ?? "");
  } catch (error) {
    throw new MarketplaceResolverError("INVALID_SKILL_DOCUMENT", "Skill document contains malformed YAML frontmatter.", { cause: error });
  }
  if (!isRecord6(frontmatter))
    invalidSkillDocument("Skill frontmatter must be a mapping.");
  const name = readNonEmptyString4(frontmatter.name);
  const description = readNonEmptyString4(frontmatter.description);
  if (name !== expectedName) {
    invalidSkillDocument(`Skill frontmatter name must equal ${expectedName}.`);
  }
  if (description === void 0) {
    invalidSkillDocument("Skill frontmatter must contain a description.");
  }
  let author = null;
  if (isRecord6(frontmatter.metadata) && frontmatter.metadata.author !== void 0) {
    const authorName = readNonEmptyString4(frontmatter.metadata.author);
    if (authorName === void 0) {
      invalidSkillDocument("Skill metadata author must be a non-empty string.");
    }
    author = { name: authorName, url: null };
  }
  return { name, description, author };
}
function invalidGitHubResponse2() {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an unsupported response shape.");
}
function invalidSkillDocument(message) {
  throw new MarketplaceResolverError("INVALID_SKILL_DOCUMENT", message);
}
function readNonEmptyString4(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function readSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : void 0;
}
function readHttpsUrl(value) {
  const url = readNonEmptyString4(value);
  if (url === void 0)
    return void 0;
  try {
    return new URL(url).protocol === "https:" ? url : void 0;
  } catch {
    return void 0;
  }
}
function isSafeRepositoryPath(path) {
  return !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isRecord6(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/skill-classification.js
var CATEGORY_ORDER = [
  "agent",
  "automation",
  "development",
  "data",
  "design",
  "content",
  "research",
  "business",
  "finance",
  "security",
  "creative",
  "life"
];
var CATEGORY_ALIASES = {
  agent: "agent",
  "agent orchestration": "agent",
  prompting: "agent",
  "token optimization": "agent",
  \u667A\u80FD\u4F53: "agent",
  \u63D0\u793A: "agent",
  "\u667A\u80FD\u4F53\u4E0E\u63D0\u793A": "agent",
  automation: "automation",
  tools: "automation",
  "skill creation": "automation",
  "skill management": "automation",
  \u81EA\u52A8\u5316: "automation",
  "\u81EA\u52A8\u5316\u4E0E skill \u5DE5\u5177": "automation",
  development: "development",
  "software engineering": "development",
  "developer tooling": "development",
  "code quality": "development",
  testing: "development",
  devops: "development",
  mobile: "development",
  \u5F00\u53D1: "development",
  "\u8F6F\u4EF6\u5F00\u53D1": "development",
  data: "data",
  databases: "data",
  \u6570\u636E: "data",
  \u6570\u636E\u5E93: "data",
  "\u6570\u636E\u4E0E\u6570\u636E\u5E93": "data",
  design: "design",
  diagramming: "design",
  presentations: "design",
  \u8BBE\u8BA1: "design",
  \u53EF\u89C6\u5316: "design",
  "\u8BBE\u8BA1\u4E0E\u53EF\u89C6\u5316": "design",
  content: "content",
  docs: "content",
  writing: "content",
  media: "content",
  \u5185\u5BB9: "content",
  \u5199\u4F5C: "content",
  "\u5185\u5BB9\u4E0E\u5199\u4F5C": "content",
  research: "research",
  science: "research",
  knowledge: "research",
  learning: "research",
  \u7814\u7A76: "research",
  \u77E5\u8BC6: "research",
  "\u7814\u7A76\u4E0E\u77E5\u8BC6": "research",
  business: "business",
  product: "business",
  marketing: "business",
  sales: "business",
  \u5546\u4E1A: "business",
  \u4EA7\u54C1: "business",
  "\u5546\u4E1A\u4E0E\u4EA7\u54C1": "business",
  finance: "finance",
  blockchain: "finance",
  \u91D1\u878D: "finance",
  \u533A\u5757\u94FE: "finance",
  "\u91D1\u878D\u4E0E\u533A\u5757\u94FE": "finance",
  security: "security",
  legal: "security",
  \u5B89\u5168: "security",
  \u5408\u89C4: "security",
  "\u5B89\u5168\u4E0E\u5408\u89C4": "security",
  creative: "creative",
  gaming: "creative",
  game: "creative",
  \u6E38\u620F: "creative",
  "\u6E38\u620F\u4E0E\u5A31\u4E50": "creative",
  life: "life",
  healthcare: "life",
  lifestyle: "life",
  \u5065\u5EB7: "life",
  \u751F\u6D3B: "life",
  "\u751F\u6D3B\u4E0E\u5065\u5EB7": "life"
};
var KEYWORD_RULES = [
  { category: "agent", terms: ["agent", "prompt", "token", "orchestration", "\u667A\u80FD\u4F53", "\u63D0\u793A\u8BCD"] },
  { category: "automation", terms: ["automation", "workflow", "tooling", "skill management", "skill creation", "\u81EA\u52A8\u5316", "\u5DE5\u4F5C\u6D41"] },
  { category: "development", terms: ["software", "developer", "code", "coding", "typescript", "javascript", "python", "test", "devops", "mobile", "\u5F00\u53D1", "\u4EE3\u7801"] },
  { category: "data", terms: ["data", "database", "sql", "\u6570\u636E", "\u6570\u636E\u5E93"] },
  { category: "design", terms: ["design", "diagram", "presentation", "figma", "ui", "ux", "\u8BBE\u8BA1", "\u53EF\u89C6\u5316"] },
  { category: "content", terms: ["docs", "documentation", "writing", "media", "story", "content", "\u5199\u4F5C", "\u6587\u6863", "\u521B\u4F5C"] },
  { category: "research", terms: ["research", "science", "knowledge", "learning", "academic", "\u7814\u7A76", "\u79D1\u7814", "\u77E5\u8BC6", "\u5B66\u4E60"] },
  { category: "business", terms: ["business", "product", "marketing", "sales", "commerce", "\u5546\u4E1A", "\u4EA7\u54C1", "\u8425\u9500", "\u7535\u5546"] },
  { category: "finance", terms: ["finance", "financial", "blockchain", "crypto", "\u91D1\u878D", "\u533A\u5757\u94FE"] },
  { category: "security", terms: ["security", "secure", "legal", "compliance", "\u5B89\u5168", "\u5408\u89C4", "\u6CD5\u5F8B"] },
  { category: "creative", terms: ["game", "gaming", "entertainment", "\u6E38\u620F", "\u5A31\u4E50"] },
  { category: "life", terms: ["health", "healthcare", "lifestyle", "\u751F\u6D3B", "\u5065\u5EB7"] }
];
var TAG_RULES = [
  { label: "\u4EE3\u7801", terms: ["code", "coding", "typescript", "javascript", "python", "\u5F00\u53D1"] },
  { label: "\u81EA\u52A8\u5316", terms: ["automation", "workflow", "\u81EA\u52A8\u5316"] },
  { label: "Agent", terms: ["agent", "orchestration", "\u667A\u80FD\u4F53"] },
  { label: "\u8BBE\u8BA1", terms: ["design", "ui", "ux", "figma", "\u8BBE\u8BA1"] },
  { label: "\u5199\u4F5C", terms: ["writing", "story", "novel", "content", "\u5199\u4F5C", "\u5C0F\u8BF4"] },
  { label: "\u7814\u7A76", terms: ["research", "science", "academic", "\u7814\u7A76", "\u79D1\u7814"] },
  { label: "\u6570\u636E", terms: ["data", "database", "sql", "\u6570\u636E", "\u6570\u636E\u5E93"] },
  { label: "\u5B89\u5168", terms: ["security", "secure", "compliance", "\u5B89\u5168", "\u5408\u89C4"] },
  { label: "\u6E38\u620F", terms: ["game", "gaming", "\u6E38\u620F"] },
  { label: "\u7535\u5546", terms: ["commerce", "ecommerce", "shop", "\u7535\u5546"] },
  { label: "PDF", terms: ["pdf"] },
  { label: "\u7F51\u9875", terms: ["web", "browser", "website", "\u7F51\u9875"] }
];
function classifySkill(input) {
  const frontmatterCategory = normalizeCategory(input.frontmatter?.category);
  const manifestCategory = normalizeCategory(input.manifest?.category);
  const frontmatterTags = normalizeTags(input.frontmatter?.tags);
  const manifestTags = normalizeTags(input.manifest?.tags);
  const evidence = [];
  if (frontmatterCategory !== void 0) {
    evidence.push({ source: "skill-frontmatter", value: input.frontmatter?.category });
  } else if (manifestCategory !== void 0) {
    evidence.push({ source: "skills-manifest", value: input.manifest?.category });
  }
  const explicitCategory = frontmatterCategory ?? manifestCategory;
  const explicitTags = [.../* @__PURE__ */ new Set([...frontmatterTags, ...manifestTags])].slice(0, 3);
  const scores = /* @__PURE__ */ new Map();
  const scoreEvidence = /* @__PURE__ */ new Map();
  const addScore = (category, score, source, value) => {
    scores.set(category, (scores.get(category) ?? 0) + score);
    const entries = scoreEvidence.get(category) ?? [];
    if (!entries.some((entry) => entry.source === source && entry.value === value))
      entries.push({ source, value });
    scoreEvidence.set(category, entries);
  };
  if (explicitCategory !== void 0)
    addScore(explicitCategory, 100, frontmatterCategory ? "skill-frontmatter" : "skills-manifest", frontmatterCategory ? String(input.frontmatter?.category) : String(input.manifest?.category));
  for (const tag of explicitTags) {
    const category = normalizeCategory(tag);
    if (category !== void 0)
      addScore(category, 20, frontmatterTags.includes(tag) ? "skill-frontmatter" : "skills-manifest", tag);
  }
  for (const topic of input.topics ?? []) {
    const category = normalizeCategory(topic);
    if (category !== void 0)
      addScore(category, 6, "github-topic", topic);
  }
  scoreText(input.name, "name", 4, addScore);
  scoreText(input.description ?? "", "description", 3, addScore);
  scoreText(input.readmeSummary ?? "", "readme", 1, addScore);
  const primaryCategory = explicitCategory ?? chooseCategory(scores);
  const primaryEvidence = primaryCategory === "general" ? [] : scoreEvidence.get(primaryCategory) ?? [];
  const derivedTags = explicitTags.length > 0 ? explicitTags : deriveTags(input);
  const confidence = explicitCategory !== void 0 ? "explicit" : primaryEvidence.some((entry) => entry.source === "github-topic") ? "topic" : primaryEvidence.length > 0 ? "keyword" : "none";
  return {
    primaryCategory,
    tags: derivedTags.slice(0, 3),
    evidence: primaryEvidence.slice(0, 8),
    confidence
  };
}
function scoreText(text, source, weight, addScore) {
  const normalized = text.toLocaleLowerCase();
  if (!normalized)
    return;
  for (const rule of KEYWORD_RULES) {
    const term = rule.terms.find((candidate) => normalized.includes(candidate.toLocaleLowerCase()));
    if (term !== void 0)
      addScore(rule.category, weight, source, term);
  }
}
function deriveTags(input) {
  const text = [input.name, input.description ?? "", input.readmeSummary ?? "", ...input.topics ?? []].join(" ").toLocaleLowerCase();
  return TAG_RULES.filter((rule) => rule.terms.some((term) => text.includes(term.toLocaleLowerCase()))).map((rule) => rule.label).slice(0, 3);
}
function chooseCategory(scores) {
  let best = "general";
  let bestScore = 0;
  for (const category of CATEGORY_ORDER) {
    const score = scores.get(category) ?? 0;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}
function normalizeCategory(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim().toLocaleLowerCase().replace(/[_-]+/gu, " ");
  return CATEGORY_ALIASES[normalized];
}
function normalizeTags(value) {
  if (!Array.isArray(value))
    return [];
  return [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim().replace(/\s+/gu, " ")).filter((item) => item.length > 0 && item.length <= 32))].slice(0, 3);
}

// ../core/dist/marketplace/github-repositories.js
var GITHUB_API_ROOT4 = "https://api.github.com";
var DEFAULT_LIMIT4 = 20;
var MAX_LIMIT4 = 100;
var DEFAULT_TIMEOUT_MS6 = 25e3;
var FORMAT_TOPICS = /* @__PURE__ */ new Set([
  "agent-skills",
  "agent-skill",
  "claude-skills",
  "codex-skills",
  "ai-agent-skills"
]);
var CATEGORY_TOPICS = /* @__PURE__ */ new Set([
  "coding",
  "software-engineering",
  "developer-tooling",
  "automation",
  "agent-orchestration",
  "prompting",
  "data",
  "databases",
  "security",
  "design",
  "diagramming",
  "presentations",
  "research",
  "writing",
  "docs",
  "media",
  "game-development",
  "data-analysis",
  "productivity",
  "business",
  "product",
  "marketing",
  "sales",
  "finance",
  "blockchain",
  "healthcare",
  "lifestyle",
  "skill-creation",
  "skill-management",
  "testing",
  "devops",
  "mobile"
]);
var BROWSE_QUERY = [...FORMAT_TOPICS].map((topic) => `${topic} in:topics`).join(" OR ");
var REPOSITORY_PART2 = /^[A-Za-z0-9_.-]+$/;
function createGitHubRepositoryDiscovery(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS6;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_TIMEOUT", "Repository discovery timeout must be a positive integer in milliseconds.");
  }
  const token = normalizeToken2(options.token);
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const trending = options.trending;
  return {
    searchRepositories(request) {
      if (isTrendingSort(request.sort)) {
        return requireTrending(trending, request.sort, request);
      }
      const query = normalizeSearchQuery(request.query);
      return queryRepositories(fetch, request, timeoutMs, token, now, query);
    },
    browseRepositories(request = {}) {
      if (isTrendingSort(request.sort)) {
        return requireTrending(trending, request.sort, request);
      }
      return queryRepositories(fetch, request, timeoutMs, token, now, null);
    }
  };
}
async function queryRepositories(fetch, request, timeoutMs, token, now, query) {
  const page = normalizePage(request.page);
  const limit = normalizeLimit4(request.limit);
  const sort = normalizeSort(request.sort, query);
  return withDeadline(request.signal, timeoutMs, async (signal) => {
    const url = new URL(`${GITHUB_API_ROOT4}/search/repositories`);
    const searchQuery = query === null ? BROWSE_QUERY : `${query} in:name,description,topics`;
    if (sort === "latest") {
      const cutoff = new Date(now().getTime() - 60 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
      url.searchParams.set("q", `created:>=${cutoff} ${searchQuery}`);
      url.searchParams.set("sort", "stars");
      url.searchParams.set("order", "desc");
    } else {
      url.searchParams.set("q", searchQuery);
    }
    if (sort === "popular") {
      url.searchParams.set("sort", "stars");
      url.searchParams.set("order", "desc");
    }
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(limit));
    const response = await fetch(url, requestInit2(signal, token));
    assertResponse2(response);
    const payload = await parseJson3(response);
    if (!isRecord7(payload) || !Array.isArray(payload.items) || typeof payload.total_count !== "number" || typeof payload.incomplete_results !== "boolean") {
      invalidResponse3("GitHub repository search returned an unsupported response shape.");
    }
    const discoveredAt = now().toISOString();
    const repositories = payload.items.map((item) => parseGitHubRepositoryPayload(item, query, discoveredAt));
    return {
      source: "github",
      query,
      sort,
      page,
      returnedCount: repositories.length,
      total: Math.min(Math.max(0, Math.trunc(payload.total_count)), 1e3),
      hasMore: page * limit < Math.min(Math.max(0, Math.trunc(payload.total_count)), 1e3),
      incomplete: payload.incomplete_results,
      dataUpdatedAt: discoveredAt,
      sourceState: "live",
      sourceMessage: null,
      repositories
    };
  });
}
function parseGitHubRepositoryPayload(value, query, discoveredAt) {
  if (!isRecord7(value) || !isRecord7(value.owner))
    invalidResponse3("GitHub returned an invalid repository.");
  const repositoryId = readInteger(value.id);
  const nodeId = readString(value.node_id);
  const owner = readString(value.owner.login);
  const ownerId = readInteger(value.owner.id);
  const ownerType = readOwnerType(value.owner.type);
  const name = readString(value.name);
  const fullName = readString(value.full_name);
  const url = readHttpsUrl2(value.html_url);
  const defaultBranch = readString(value.default_branch);
  const stars = readInteger(value.stargazers_count);
  const forks = readInteger(value.forks_count);
  const createdAt = readDate(value.created_at);
  const updatedAt = readDate(value.updated_at);
  const pushedAt = readDate(value.pushed_at);
  const topics = Array.isArray(value.topics) ? value.topics.map(readString).filter((topic) => topic !== void 0) : [];
  const archived = typeof value.archived === "boolean" ? value.archived : void 0;
  const license = value.license === null ? null : isRecord7(value.license) ? readString(value.license.spdx_id) ?? null : null;
  const description = value.description === null || typeof value.description === "string" ? value.description : void 0;
  if (repositoryId === void 0 || nodeId === void 0 || ownerId === void 0 || owner === void 0 || ownerType === void 0 || name === void 0 || fullName !== `${owner}/${name}` || url !== `https://github.com/${owner}/${name}` || defaultBranch === void 0 || stars === void 0 || forks === void 0 || createdAt === void 0 || updatedAt === void 0 || pushedAt === void 0 || archived === void 0 || description === void 0 || !REPOSITORY_PART2.test(owner) || !REPOSITORY_PART2.test(name))
    invalidResponse3("GitHub returned an invalid repository.");
  const normalizedTopics = [...new Set(topics.map((topic) => topic.toLocaleLowerCase()))].sort();
  const formatTopics = normalizedTopics.filter((topic) => FORMAT_TOPICS.has(topic));
  const categoryTopics = normalizedTopics.filter((topic) => CATEGORY_TOPICS.has(topic));
  const signals = formatTopics.map((topic) => ({
    source: "github",
    kind: "format-topic",
    label: `Topic: ${topic}`
  }));
  if (query !== null) {
    signals.push({ source: "github", kind: "ordinary-search", label: `\u641C\u7D22: ${query}` });
  } else if (formatTopics.length === 0) {
    signals.push({ source: "github", kind: "metadata", label: "GitHub \u4ED3\u5E93\u5143\u6570\u636E" });
  }
  const repoKey = `github:${fullName}`;
  return {
    repositoryId,
    nodeId,
    repoKey,
    host: "github",
    owner,
    ownerType,
    ownerId,
    ownerAvatar: { type: "github-avatar", owner, accountId: ownerId },
    name,
    fullName,
    description,
    url,
    defaultBranch,
    stars,
    forks,
    createdAt,
    updatedAt,
    pushedAt,
    topics: normalizedTopics,
    formatTopics,
    categoryTopics,
    archived,
    license,
    knownSkillCount: null,
    classification: classifySkill({ name, description, topics: normalizedTopics }),
    trend: null,
    cover: { type: "generated", seed: repoKey },
    discovery: { signals, discoveredAt }
  };
}
async function withDeadline(callerSignal, timeoutMs, operation) {
  if (callerSignal?.aborted)
    aborted3();
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const cancel = () => {
    callerAborted = true;
    controller.abort(callerSignal?.reason);
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_ABORTED", "Repository discovery was cancelled."));
  };
  callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectBoundary(new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `Repository discovery exceeded ${timeoutMs} ms.`));
  }, timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), boundary]);
  } catch (error) {
    if (timedOut)
      throw new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `Repository discovery exceeded ${timeoutMs} ms.`, { cause: error });
    if (callerAborted || callerSignal?.aborted)
      throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Repository discovery was cancelled.", { cause: error });
    if (error instanceof MarketplaceSourceError)
      throw error;
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "Unable to reach GitHub repository discovery.", { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
function requestInit2(signal, token) {
  return {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager",
      ...token === void 0 ? {} : { authorization: `Bearer ${token}` }
    },
    signal
  };
}
function assertResponse2(response) {
  if (response.ok)
    return;
  if (response.status === 429 || response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new MarketplaceSourceError("GITHUB_RATE_LIMITED", "GitHub API rate limit was exceeded. Try again later or configure authentication.");
  }
  throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `GitHub repository discovery failed with HTTP ${response.status}.`);
}
async function parseJson3(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "GitHub repository discovery returned malformed JSON.", { cause: error });
  }
}
function normalizeSearchQuery(value) {
  const query = value?.trim() ?? "";
  if (query.length < 2) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_QUERY", "Repository search queries must contain at least two characters.");
  }
  return query;
}
function normalizeLimit4(value) {
  const limit = value ?? DEFAULT_LIMIT4;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT4) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", `Repository result limit must be an integer from 1 to ${MAX_LIMIT4}.`);
  }
  return limit;
}
function normalizePage(value) {
  const page = value ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "Repository result page must be an integer from 1 to 10.");
  }
  return page;
}
function normalizeSort(value, query) {
  if (value !== void 0)
    return value;
  return query === null ? "popular" : "relevance";
}
function isTrendingSort(value) {
  return value === "trend-weekly" || value === "trend-monthly";
}
function requireTrending(trending, sort, request) {
  if (trending === void 0) {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "GitHub Trending is not available in this Host.");
  }
  return trending.browseTrending({
    period: sort === "trend-weekly" ? "weekly" : "monthly",
    ...request.page === void 0 ? {} : { page: request.page },
    ...request.limit === void 0 ? {} : { limit: request.limit },
    ...request.signal === void 0 ? {} : { signal: request.signal }
  });
}
function normalizeToken2(value) {
  const token = value?.trim();
  return token ? token : void 0;
}
function readString(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function readHttpsUrl2(value) {
  const text = readString(value);
  if (text === void 0)
    return void 0;
  try {
    return new URL(text).protocol === "https:" ? text : void 0;
  } catch {
    return void 0;
  }
}
function readInteger(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : void 0;
}
function readDate(value) {
  const text = readString(value);
  return text !== void 0 && !Number.isNaN(Date.parse(text)) ? text : void 0;
}
function readOwnerType(value) {
  return value === "User" || value === "Organization" || value === "Bot" ? value : void 0;
}
function aborted3() {
  throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "Repository discovery was cancelled.");
}
function invalidResponse3(message) {
  throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", message);
}
function isRecord7(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/github-trending.js
var GITHUB_ROOT = "https://github.com";
var DEFAULT_TIMEOUT_MS7 = 25e3;
var MAX_HTML_BYTES = 2 * 1024 * 1024;
var MAX_TRENDING_ITEMS = 25;
var FRESH_CACHE_MS = 30 * 60 * 1e3;
var STALE_CACHE_MS = 24 * 60 * 60 * 1e3;
var SKILL_SIGNAL = /(?:^|[^a-z])(skill|skills|agent|claude|codex|opencode|prompt|mcp)(?:$|[^a-z])/iu;
function createGitHubTrendingDiscovery(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceSourceError("MARKETPLACE_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS7;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_TIMEOUT", "Trending timeout must be a positive integer in milliseconds.");
  }
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const cacheTtlMs = options.cacheTtlMs ?? FRESH_CACHE_MS;
  const staleTtlMs = options.staleTtlMs ?? STALE_CACHE_MS;
  const cache = /* @__PURE__ */ new Map();
  return {
    browseTrending(request) {
      const page = normalizePage2(request.page);
      const limit = normalizeLimit5(request.limit);
      if (page !== 1) {
        throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "GitHub Trending only provides one bounded page.");
      }
      return loadTrending({
        fetch,
        now,
        timeoutMs,
        cache,
        cacheTtlMs,
        staleTtlMs,
        period: request.period,
        limit,
        ...request.signal === void 0 ? {} : { signal: request.signal }
      });
    }
  };
}
function parseGitHubTrendingHtml(html, period) {
  if (typeof html !== "string" || html.length === 0 || html.length > MAX_HTML_BYTES)
    return [];
  const entries = [];
  const articles = html.match(/<article\b[^>]*class=["'][^"']*\bBox-row\b[^"']*["'][^>]*>[\s\S]*?<\/article>/giu) ?? [];
  for (const article of articles.slice(0, MAX_TRENDING_ITEMS)) {
    const repository = parseRepositorySlug(article);
    if (repository === null)
      continue;
    const description = cleanText(article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu)?.[1] ?? "") || null;
    const weeklyStars = parseMetric(article, "week");
    const monthlyStars = parseMetric(article, "month");
    const metric = period === "weekly" ? weeklyStars : monthlyStars;
    if (metric === null || !SKILL_SIGNAL.test(`${repository.owner}/${repository.name} ${description ?? ""}`))
      continue;
    entries.push({
      ...repository,
      description,
      stars: parseTotalStars(article, repository),
      weeklyStars,
      monthlyStars
    });
  }
  return dedupeTrending(entries);
}
async function loadTrending(options) {
  const [weekly, monthly] = await Promise.all([
    loadPeriod(options, "weekly"),
    loadPeriod(options, "monthly")
  ]);
  const requested = options.period === "weekly" ? weekly : monthly;
  const merged = mergeSnapshots(weekly, monthly, options.period).sort((left, right) => compareTrend(left, right, options.period)).slice(0, options.limit);
  const state = requested.snapshot.state;
  const message = requested.snapshot.message ?? (state === "cached" ? "GitHub Trending \u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u6B63\u5728\u663E\u793A\u7F13\u5B58\u6570\u636E\u3002" : null);
  return {
    source: "github",
    query: null,
    sort: options.period === "weekly" ? "trend-weekly" : "trend-monthly",
    page: 1,
    returnedCount: merged.length,
    total: merged.length,
    hasMore: false,
    incomplete: state === "unavailable",
    dataUpdatedAt: requested.snapshot.observedAt,
    sourceState: state === "cached" ? "cached" : state === "unavailable" ? "unavailable" : state,
    sourceMessage: message,
    repositories: merged
  };
}
async function loadPeriod(options, period) {
  const current = options.cache.get(period);
  const nowMs = options.now().getTime();
  const age = current === void 0 ? Number.POSITIVE_INFINITY : nowMs - current.storedAt;
  if (current !== void 0 && age <= options.cacheTtlMs)
    return { snapshot: current.snapshot, stale: false };
  try {
    const snapshot = await fetchPeriod(options, period);
    options.cache.set(period, { storedAt: options.now().getTime(), snapshot });
    return { snapshot, stale: false };
  } catch (error) {
    if (current !== void 0 && age <= options.staleTtlMs) {
      return {
        snapshot: {
          ...current.snapshot,
          state: "cached",
          message: error instanceof Error ? error.message : "GitHub Trending \u8BF7\u6C42\u5931\u8D25\u3002"
        },
        stale: true
      };
    }
    return {
      snapshot: {
        period,
        observedAt: options.now().toISOString(),
        candidates: [],
        state: "unavailable",
        message: error instanceof Error ? error.message : "GitHub Trending \u6682\u65F6\u4E0D\u53EF\u7528\u3002"
      },
      stale: false
    };
  }
}
async function fetchPeriod(options, period) {
  const html = await fetchText(options.fetch, `${GITHUB_ROOT}/trending?since=${period}`, options.timeoutMs, options.signal, {
    accept: "text/html",
    "user-agent": "dsh-skill-manager"
  });
  const parsed = parseGitHubTrendingHtml(html, period);
  if (parsed.length === 0) {
    return {
      period,
      observedAt: options.now().toISOString(),
      candidates: [],
      state: "empty",
      message: "GitHub Trending \u5F53\u524D\u6CA1\u6709\u53EF\u8BC6\u522B\u7684 Skill \u5019\u9009\u3002"
    };
  }
  const observedAt = options.now().toISOString();
  const resolved = parsed.map((entry) => trendingCandidate(entry, observedAt));
  return {
    period,
    observedAt,
    candidates: resolved,
    state: "live",
    message: "\u8FD1\u671F\u70ED\u5EA6\u53EA\u8986\u76D6 GitHub Trending \u5168\u7AD9\u699C\u5355\u4E2D\u7684 Skill \u5019\u9009\uFF1B\u5217\u8868\u9636\u6BB5\u4E0D\u6D88\u8017 GitHub REST \u914D\u989D\u3002"
  };
}
function trendingCandidate(entry, observedAt) {
  const fullName = `${entry.owner}/${entry.name}`;
  const repoKey = `github:${fullName}`;
  return {
    repositoryId: 0,
    nodeId: `trending:${fullName}`,
    repoKey,
    host: "github",
    owner: entry.owner,
    ownerId: 0,
    ownerType: "User",
    ownerAvatar: { type: "generated", seed: `owner:${entry.owner}` },
    name: entry.name,
    fullName,
    description: entry.description,
    url: `${GITHUB_ROOT}/${fullName}`,
    defaultBranch: "HEAD",
    stars: entry.stars ?? 0,
    forks: 0,
    createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: observedAt,
    pushedAt: observedAt,
    topics: [],
    formatTopics: [],
    categoryTopics: [],
    archived: false,
    license: null,
    knownSkillCount: null,
    classification: classifySkill({ name: entry.name, description: entry.description, topics: [] }),
    trend: {
      weeklyStars: entry.weeklyStars,
      monthlyStars: entry.monthlyStars,
      observedAt,
      source: "github-trending-html",
      stale: false
    },
    cover: { type: "generated", seed: repoKey },
    discovery: {
      signals: [{ source: "github", kind: "metadata", label: "GitHub Trending HTML \u5019\u9009" }],
      discoveredAt: observedAt
    }
  };
}
function mergeSnapshots(weekly, monthly, requested) {
  const byKey = /* @__PURE__ */ new Map();
  for (const candidate of [...weekly.snapshot.candidates, ...monthly.snapshot.candidates]) {
    const existing = byKey.get(candidate.repoKey);
    if (existing === void 0) {
      byKey.set(candidate.repoKey, { ...candidate, trend: candidate.trend === null ? null : { ...candidate.trend } });
      continue;
    }
    const existingTrend = existing.trend;
    const candidateTrend = candidate.trend;
    existing.trend = {
      weeklyStars: candidateTrend?.weeklyStars ?? existingTrend?.weeklyStars ?? null,
      monthlyStars: candidateTrend?.monthlyStars ?? existingTrend?.monthlyStars ?? null,
      observedAt: candidateTrend?.observedAt ?? existingTrend?.observedAt ?? (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "github-trending-html",
      stale: weekly.stale || monthly.stale
    };
  }
  return [...byKey.values()].filter((candidate) => {
    const metric = requested === "weekly" ? candidate.trend?.weeklyStars : candidate.trend?.monthlyStars;
    if (metric !== null && metric !== void 0)
      return true;
    return requested === "monthly" && candidate.trend?.weeklyStars !== null && candidate.trend?.weeklyStars !== void 0;
  }).map((candidate) => candidate.trend === null ? candidate : {
    ...candidate,
    trend: { ...candidate.trend, stale: weekly.stale || monthly.stale }
  });
}
function compareTrend(left, right, period) {
  const leftMetric = period === "weekly" ? left.trend?.weeklyStars ?? -1 : left.trend?.monthlyStars ?? -1;
  const rightMetric = period === "weekly" ? right.trend?.weeklyStars ?? -1 : right.trend?.monthlyStars ?? -1;
  const primary = rightMetric - leftMetric;
  if (primary !== 0)
    return primary;
  const weekly = (right.trend?.weeklyStars ?? -1) - (left.trend?.weeklyStars ?? -1);
  return weekly || right.stars - left.stars || left.fullName.localeCompare(right.fullName);
}
function parseRepositorySlug(article) {
  const matches3 = [...article.matchAll(/href=["']\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)["']/giu)];
  const match = matches3.find((candidate) => candidate[1] !== "sponsors" && candidate[1] !== "trending");
  if (match === void 0)
    return null;
  const owner = match[1];
  const name = match[2];
  return owner === void 0 || name === void 0 ? null : { owner, name };
}
function parseMetric(article, unit) {
  const match = article.match(new RegExp(`([0-9][0-9,]*)\\s+stars this ${unit}`, "iu"));
  return match === null || match[1] === void 0 ? null : Number.parseInt(match[1].replace(/,/gu, ""), 10);
}
function parseTotalStars(article, repository) {
  const path = `/${repository.owner}/${repository.name}/stargazers`.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = article.match(new RegExp(`href=["']${path}["'][^>]*>([\\s\\S]*?)<\\/a>`, "iu"));
  if (match?.[1] === void 0)
    return null;
  const metric = cleanText(match[1]).match(/[0-9][0-9,]*/u)?.[0];
  return metric === void 0 ? null : Number.parseInt(metric.replace(/,/gu, ""), 10);
}
function cleanText(value) {
  return decodeEntities(value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim());
}
function decodeEntities(value) {
  return value.replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">");
}
async function fetchText(fetch, url, timeoutMs, callerSignal, headers) {
  const response = await fetchWithDeadline2(fetch, url, timeoutMs, callerSignal, { headers });
  if (!response.ok)
    throw new MarketplaceSourceError("MARKETPLACE_HTTP_ERROR", `GitHub Trending failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_HTML_BYTES)
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_RESPONSE", "GitHub Trending response was too large.");
  return text;
}
async function fetchWithDeadline2(fetch, url, timeoutMs, callerSignal, init) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted)
      throw new MarketplaceSourceError("MARKETPLACE_ABORTED", "GitHub Trending request was cancelled.", { cause: error });
    if (timedOut)
      throw new MarketplaceSourceError("MARKETPLACE_TIMEOUT", `GitHub Trending exceeded ${timeoutMs} ms.`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
function dedupeTrending(entries) {
  const byKey = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const key = `${entry.owner}/${entry.name}`.toLocaleLowerCase();
    const existing = byKey.get(key);
    byKey.set(key, existing === void 0 ? entry : {
      ...existing,
      weeklyStars: entry.weeklyStars ?? existing.weeklyStars,
      monthlyStars: entry.monthlyStars ?? existing.monthlyStars
    });
  }
  return [...byKey.values()];
}
function normalizePage2(value) {
  const page = value ?? 1;
  if (!Number.isInteger(page) || page < 1)
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "Trending page must be a positive integer.");
  return page;
}
function normalizeLimit5(value) {
  const limit = value ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25)
    throw new MarketplaceSourceError("INVALID_MARKETPLACE_LIMIT", "Trending result limit must be an integer from 1 to 25.");
  return limit;
}

// ../core/dist/marketplace/github-inspector.js
import { parse as parse3 } from "yaml";

// ../core/dist/marketplace/github-snapshot-cache.js
import { Buffer as Buffer6 } from "node:buffer";
import { createHash as createHash4, randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile3, readdir as readdir3, rename as rename2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname, join as join3, resolve as resolve2, sep } from "node:path";

// ../../node_modules/fflate/esm/index.mjs
import { createRequire } from "module";
var require2 = createRequire("/");
var _a;
var Worker;
var isMarkedAsUntransferable;
try {
  _a = require2("worker_threads"), Worker = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable;
} catch (e) {
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a3 = dutf8(dat), s = _a3.s, r = _a3.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z2) {
  var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
  var _a3 = z64hs(d, es, efl, z2, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a3[0], su = _a3[1], off = _a3[2];
  return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
var z64hs = function(d, b, l, z2, sc, su, off) {
  var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
  var nf = nsc + nsu + noff;
  if (z2 && nf) {
    for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
      if (b2(d, b) == 1) {
        return [
          nsc ? b8(d, b + 4 + 8 * nsu) : sc,
          nsu ? b8(d, b + 4) : su,
          noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
          1
        ];
      }
    }
    if (z2 < 2)
      err(13);
  }
  return [sc, su, off, 0];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z2 = b4(data, e - 20) == 117853008;
  if (z2) {
    var ze = b4(data, e - 12);
    z2 = b4(data, ze) == 101075792;
    if (z2) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i = 0; i < c; ++i) {
    var _a3 = zh(data, o, z2), c_2 = _a3[0], sc = _a3[1], su = _a3[2], fn = _a3[3], no = _a3[4], off = _a3[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// ../core/dist/marketplace/github-snapshot-cache.js
var GITHUB_API_ROOT5 = "https://api.github.com";
var GITHUB_CODELOAD_ROOT = "https://codeload.github.com";
var GITHUB_RAW_ROOT = "https://raw.githubusercontent.com";
var MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
var MAX_EXTRACTED_BYTES = 50 * 1024 * 1024;
var MAX_CACHE_BYTES = 100 * 1024 * 1024;
var MAX_FILE_BYTES2 = 10 * 1024 * 1024;
var MAX_FILE_COUNT2 = 5e3;
var MAX_EXPANSION_RATIO = 200;
var CACHE_TTL_MS = 60 * 60 * 1e3;
var RESOLUTION_TTL_MS = CACHE_TTL_MS;
var SHA_PATTERN3 = /^[a-f0-9]{40}$/iu;
var REPOSITORY_PART3 = /^[A-Za-z0-9_.-]+$/u;
var WINDOWS_RESERVED_NAME5 = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
var METADATA_FILE = "snapshot.json";
function createGitHubSnapshotCache(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const cacheRoot = options.cacheRoot === void 0 ? void 0 : resolve2(options.cacheRoot);
  const token = normalizeToken3(options.token);
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const resolutions = /* @__PURE__ */ new Map();
  const resolving = /* @__PURE__ */ new Map();
  const preparing = /* @__PURE__ */ new Map();
  const memorySnapshots = /* @__PURE__ */ new Map();
  const activeKeys = /* @__PURE__ */ new Map();
  let initialized = false;
  let initializing;
  let cleaning;
  return {
    async withSnapshot(repository, signal, operation, requestOptions = {}) {
      assertRepository(repository);
      const slug = `${repository.owner}/${repository.name}`;
      const resolution = await resolveRepository(slug, signal, requestOptions.refreshCommit === true);
      const key = `github:${slug}@${resolution.commit}`;
      while (cleaning !== void 0)
        await raceAbort(cleaning, signal);
      retain(key);
      try {
        const content = await prepareContent(slug, key, resolution, signal);
        return await operation({
          repositoryPayload: resolution.repositoryPayload,
          commit: resolution.commit,
          tree: resolution.tree,
          source: content.source,
          ...content.fallbackReason === void 0 ? {} : { fallbackReason: content.fallbackReason },
          readFile: (path) => content.readFile(path, signal)
        });
      } finally {
        release(key);
        scheduleCleanup();
      }
    }
  };
  async function resolveRepository(slug, signal, refresh) {
    const current = resolutions.get(slug);
    if (!refresh && current !== void 0 && now().getTime() - current.resolvedAt <= RESOLUTION_TTL_MS)
      return current;
    const existing = resolving.get(slug);
    if (existing !== void 0)
      return await raceAbort(existing, signal);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25e3);
    const pending = (async () => {
      const repositoryPayload = await getJson3(fetch, `${GITHUB_API_ROOT5}/repos/${slug}`, controller.signal, token);
      const defaultBranch = readDefaultBranch(repositoryPayload);
      const commitPayload = await getJson3(fetch, `${GITHUB_API_ROOT5}/repos/${slug}/commits/${encodeURIComponent(defaultBranch)}`, controller.signal, token);
      const commit = readCommit(commitPayload);
      const treePayload = await getJson3(fetch, `${GITHUB_API_ROOT5}/repos/${slug}/git/trees/${commit}?recursive=1`, controller.signal, token);
      const tree = parseTree3(treePayload);
      const resolution = { repositoryPayload, commit, tree, resolvedAt: now().getTime() };
      resolutions.set(slug, resolution);
      return resolution;
    })().finally(() => clearTimeout(timer));
    resolving.set(slug, pending);
    void pending.then(() => {
      if (resolving.get(slug) === pending)
        resolving.delete(slug);
    }, () => {
      if (resolving.get(slug) === pending)
        resolving.delete(slug);
    });
    return await raceAbort(pending, signal);
  }
  async function prepareContent(slug, key, resolution, signal) {
    if (cacheRoot !== void 0) {
      await initializeCache(cacheRoot);
      const cached = await loadCachedSnapshot(cacheRoot, key, resolution, now(), (activeKeys.get(key) ?? 0) > 1);
      if (cached !== null)
        return cached;
    }
    const memory = memorySnapshots.get(key);
    if (memory !== void 0) {
      memory.accessedAt = now().getTime();
      return memory.content;
    }
    const existing = preparing.get(key);
    if (existing !== void 0)
      return await raceAbort(existing, signal);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25e3);
    retain(key);
    const pending = (async () => {
      try {
        const files = await downloadAndVerifyArchive(fetch, slug, resolution, controller.signal);
        if (cacheRoot === void 0)
          return rememberMemory(key, memoryContent(files));
        return await storeSnapshot(cacheRoot, key, resolution, files, now());
      } catch (error) {
        return rawContent(fetch, slug, resolution, fallbackReason(error));
      }
    })().finally(() => {
      clearTimeout(timer);
      release(key);
      scheduleCleanup();
    });
    preparing.set(key, pending);
    void pending.then(() => {
      if (preparing.get(key) === pending)
        preparing.delete(key);
    }, () => {
      if (preparing.get(key) === pending)
        preparing.delete(key);
    });
    return await raceAbort(pending, signal);
  }
  function rememberMemory(key, content) {
    if (content.source !== "codeload-cache" || content.sizeBytes > MAX_CACHE_BYTES)
      return content;
    const timestamp = now().getTime();
    for (const [candidateKey, candidate] of memorySnapshots) {
      if (timestamp - candidate.accessedAt > CACHE_TTL_MS)
        memorySnapshots.delete(candidateKey);
    }
    let total = [...memorySnapshots.values()].reduce((sum, candidate) => sum + candidate.content.sizeBytes, 0);
    for (const [candidateKey, candidate] of [...memorySnapshots.entries()].sort(([, left], [, right]) => left.accessedAt - right.accessedAt)) {
      if (total + content.sizeBytes <= MAX_CACHE_BYTES)
        break;
      memorySnapshots.delete(candidateKey);
      total -= candidate.content.sizeBytes;
    }
    if (total + content.sizeBytes <= MAX_CACHE_BYTES) {
      memorySnapshots.set(key, { content, accessedAt: timestamp });
    }
    return content;
  }
  async function initializeCache(root) {
    if (initialized)
      return;
    if (initializing !== void 0)
      return await initializing;
    const pending = (async () => {
      await mkdir2(join3(root, ".staging"), { recursive: true });
      await mkdir2(join3(root, "snapshots"), { recursive: true });
      for (const entry of await safeReadDirectory(join3(root, ".staging"))) {
        await rm2(join3(root, ".staging", entry), { recursive: true, force: true });
      }
      await cleanupCache(root, activeKeys, now().getTime());
      initialized = true;
    })();
    initializing = pending;
    try {
      await pending;
    } finally {
      if (initializing === pending)
        initializing = void 0;
    }
  }
  function retain(key) {
    activeKeys.set(key, (activeKeys.get(key) ?? 0) + 1);
  }
  function release(key) {
    const remaining = (activeKeys.get(key) ?? 1) - 1;
    if (remaining <= 0)
      activeKeys.delete(key);
    else
      activeKeys.set(key, remaining);
  }
  function scheduleCleanup() {
    if (cacheRoot === void 0 || !initialized || cleaning !== void 0)
      return;
    const pending = cleanupCache(cacheRoot, activeKeys, now().getTime()).catch(() => void 0).finally(() => {
      if (cleaning === pending)
        cleaning = void 0;
    });
    cleaning = pending;
  }
}
async function downloadAndVerifyArchive(fetch, slug, resolution, signal) {
  const response = await fetch(`${GITHUB_CODELOAD_ROOT}/${slug}/zip/${resolution.commit}`, {
    method: "GET",
    headers: { accept: "application/zip", "user-agent": "dsh-skill-manager" },
    redirect: "error",
    signal
  });
  if (!response.ok) {
    throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub codeload request failed with HTTP ${response.status}.`);
  }
  const archive = await readBoundedResponse(response, MAX_ARCHIVE_BYTES, "GitHub repository ZIP exceeds the compressed size limit.");
  const entries = parseCentralDirectory(archive);
  validateArchiveEntries(entries, archive.byteLength);
  let unzipped;
  try {
    unzipped = unzipSync(archive);
  } catch (error) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned an invalid repository ZIP.", { cause: error });
  }
  validateUnzippedFiles(unzipped);
  const tree = new Map(resolution.tree.map((entry) => [entry.path, entry]));
  const files = /* @__PURE__ */ new Map();
  let rootName;
  for (const [archivePath, bytes] of Object.entries(unzipped)) {
    if (archivePath.endsWith("/"))
      continue;
    const normalized = normalizeArchivePath(archivePath);
    const [root, ...segments] = normalized.split("/");
    if (rootName === void 0)
      rootName = root;
    if (root !== rootName || segments.length === 0)
      invalidArchive("Repository ZIP has an invalid root directory.");
    const path = segments.join("/");
    const expected = tree.get(path);
    if (expected === void 0 || expected.type !== "blob")
      invalidArchive(`Repository ZIP contains unexpected file ${path}.`);
    if (expected.mode !== "100644" && expected.mode !== "100755")
      continue;
    const content = Buffer6.from(bytes);
    if (content.byteLength !== expected.size || gitBlobSha2(content) !== expected.sha) {
      invalidArchive(`Repository ZIP does not match the fixed Tree for ${path}.`);
    }
    files.set(path, content);
  }
  for (const entry of resolution.tree) {
    if (entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755") && !files.has(entry.path)) {
      invalidArchive(`Repository ZIP is missing fixed Tree file ${entry.path}.`);
    }
  }
  return files;
}
function memoryContent(files) {
  return {
    source: "codeload-cache",
    sizeBytes: [...files.values()].reduce((total, content) => total + content.byteLength, 0),
    async readFile(path) {
      const content = files.get(path);
      if (content === void 0)
        missingFile(path);
      return Buffer6.from(content);
    }
  };
}
function rawContent(fetch, slug, resolution, reason) {
  const tree = new Map(resolution.tree.map((entry) => [entry.path, entry]));
  return {
    source: "raw-fallback",
    sizeBytes: 0,
    fallbackReason: reason,
    async readFile(path, signal) {
      const expected = tree.get(path);
      if (expected === void 0 || expected.type !== "blob" || expected.mode !== "100644" && expected.mode !== "100755") {
        missingFile(path);
      }
      if (expected.size > MAX_FILE_BYTES2) {
        throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", `${path} exceeds the repository file size limit.`);
      }
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const controller = new AbortController();
      const cancel = () => controller.abort(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(() => controller.abort(), 25e3);
      let response;
      try {
        response = await fetch(`${GITHUB_RAW_ROOT}/${slug}/${resolution.commit}/${encodedPath}`, {
          method: "GET",
          headers: { accept: "application/octet-stream", "user-agent": "dsh-skill-manager" },
          redirect: "error",
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
            throw new MarketplaceResolverError("GITHUB_RATE_LIMITED", "GitHub content rate limit was exceeded.");
          }
          throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub content request failed with HTTP ${response.status} for ${path}.`);
        }
        const content = await readBoundedResponse(response, MAX_FILE_BYTES2, `${path} exceeds the repository file size limit.`);
        if (content.byteLength !== expected.size || gitBlobSha2(content) !== expected.sha) {
          invalidArchive(`GitHub returned bytes that do not match the fixed Tree for ${path}.`);
        }
        return content;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      }
    }
  };
}
function fallbackReason(error) {
  if (error instanceof MarketplaceResolverError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error)
    return { code: "ARCHIVE_PREPARATION_FAILED", message: error.message };
  return { code: "ARCHIVE_PREPARATION_FAILED", message: "Repository ZIP preparation failed." };
}
async function storeSnapshot(root, key, resolution, files, now) {
  const id = createHash4("sha256").update(key).digest("hex");
  const staging = join3(root, ".staging", `${id}-${randomUUID2()}`);
  const target = join3(root, "snapshots", id);
  const contentRoot = join3(staging, "content");
  const metadata = {
    schemaVersion: 1,
    key,
    commit: resolution.commit,
    createdAt: now.toISOString(),
    lastAccessedAt: now.toISOString(),
    sizeBytes: 0,
    files: []
  };
  const tree = new Map(resolution.tree.map((entry) => [entry.path, entry]));
  await mkdir2(contentRoot, { recursive: true });
  try {
    for (const [path, content] of files) {
      const destination = safeCachePath(contentRoot, path);
      await mkdir2(dirname(destination), { recursive: true });
      await writeFile2(destination, content);
      metadata.sizeBytes += content.byteLength;
      const mode = tree.get(path)?.mode;
      if (mode !== "100644" && mode !== "100755")
        invalidArchive(`Repository cache mode is invalid for ${path}.`);
      metadata.files.push({ path, sha: gitBlobSha2(content), size: content.byteLength, mode });
    }
    await writeFile2(join3(staging, METADATA_FILE), JSON.stringify(metadata), "utf8");
    await rm2(target, { recursive: true, force: true });
    await rename2(staging, target);
    return diskContent(target, metadata);
  } catch (error) {
    await rm2(staging, { recursive: true, force: true });
    throw error;
  }
}
async function loadCachedSnapshot(root, key, resolution, now, protectedByOtherLease) {
  const id = createHash4("sha256").update(key).digest("hex");
  const directory = join3(root, "snapshots", id);
  try {
    const metadata = parseMetadata(JSON.parse(await readFile3(join3(directory, METADATA_FILE), "utf8")));
    if (metadata.key !== key || metadata.commit !== resolution.commit || !metadataMatchesResolution(metadata, resolution)) {
      return null;
    }
    const accessedAt = Date.parse(metadata.lastAccessedAt);
    if (now.getTime() - accessedAt > CACHE_TTL_MS && !protectedByOtherLease) {
      await rm2(directory, { recursive: true, force: true });
      return null;
    }
    metadata.lastAccessedAt = now.toISOString();
    await writeFile2(join3(directory, METADATA_FILE), JSON.stringify(metadata), "utf8");
    return diskContent(directory, metadata);
  } catch {
    return null;
  }
}
function metadataMatchesResolution(metadata, resolution) {
  const expected = resolution.tree.filter((entry) => entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755"));
  if (metadata.files.length !== expected.length)
    return false;
  const files = new Map(metadata.files.map((file) => [file.path, file]));
  return expected.every((entry) => {
    const file = files.get(entry.path);
    return file !== void 0 && file.sha === entry.sha && file.size === entry.size && file.mode === entry.mode;
  });
}
function diskContent(directory, metadata) {
  const files = new Map(metadata.files.map((file) => [file.path, file]));
  const contentRoot = join3(directory, "content");
  return {
    source: "codeload-cache",
    sizeBytes: metadata.sizeBytes,
    async readFile(path) {
      const expected = files.get(path);
      if (expected === void 0)
        missingFile(path);
      const content = await readFile3(safeCachePath(contentRoot, path));
      if (content.byteLength !== expected.size || gitBlobSha2(content) !== expected.sha) {
        invalidArchive(`Cached repository bytes are invalid for ${path}.`);
      }
      return content;
    }
  };
}
async function cleanupCache(root, active, now) {
  const snapshotsRoot = join3(root, "snapshots");
  const entries = [];
  for (const name of await safeReadDirectory(snapshotsRoot)) {
    const directory = join3(snapshotsRoot, name);
    try {
      const metadata = parseMetadata(JSON.parse(await readFile3(join3(directory, METADATA_FILE), "utf8")));
      const accessedAt = Date.parse(metadata.lastAccessedAt);
      if (!active.has(metadata.key) && (!Number.isFinite(accessedAt) || now - accessedAt > CACHE_TTL_MS)) {
        await rm2(directory, { recursive: true, force: true });
      } else {
        entries.push({ directory, metadata, accessedAt });
      }
    } catch {
      await rm2(directory, { recursive: true, force: true });
    }
  }
  let total = entries.reduce((sum, entry) => sum + entry.metadata.sizeBytes, 0);
  for (const entry of entries.sort((left, right) => left.accessedAt - right.accessedAt)) {
    if (total <= MAX_CACHE_BYTES)
      break;
    if (active.has(entry.metadata.key))
      continue;
    await rm2(entry.directory, { recursive: true, force: true });
    total -= entry.metadata.sizeBytes;
  }
}
function parseCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.byteLength - 65558);
  let end = bytes.byteLength - 22;
  while (end >= minimum) {
    if (bytes.readUInt32LE(end) === 101010256 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.byteLength)
      break;
    end -= 1;
  }
  if (end < minimum)
    invalidArchive("Repository ZIP has no valid central directory.");
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntryCount = bytes.readUInt16LE(end + 8);
  const entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) {
    invalidArchive("Multi-disk repository ZIP archives are not supported.");
  }
  if (entryCount === 65535 || centralSize === 4294967295 || centralOffset === 4294967295) {
    invalidArchive("ZIP64 repository archives are not supported.");
  }
  if (centralOffset + centralSize > end || centralOffset > bytes.byteLength) {
    invalidArchive("Repository ZIP central directory is out of bounds.");
  }
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || bytes.readUInt32LE(offset) !== 33639248) {
      invalidArchive("Repository ZIP central directory is invalid.");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const originalSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.byteLength)
      invalidArchive("Repository ZIP entry name is invalid.");
    entries.push({
      name: bytes.subarray(nameStart, nameEnd).toString((flags & 2048) === 0 ? "latin1" : "utf8"),
      compressedSize,
      originalSize,
      compression,
      flags
    });
    offset = nameEnd + extraLength + commentLength;
    if (offset > centralOffset + centralSize)
      invalidArchive("Repository ZIP central directory is invalid.");
  }
  if (offset !== centralOffset + centralSize)
    invalidArchive("Repository ZIP central directory size is invalid.");
  return entries;
}
function validateArchiveEntries(entries, archiveBytes) {
  if (entries.length > MAX_FILE_COUNT2)
    invalidArchive("Repository ZIP contains too many entries.");
  let extractedBytes = 0;
  const comparablePaths = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const normalized = normalizeArchivePath(entry.name);
    const comparable = normalized.toLocaleLowerCase();
    if (comparablePaths.has(comparable))
      invalidArchive(`Repository ZIP contains a duplicate path ${entry.name}.`);
    comparablePaths.add(comparable);
    if ((entry.flags & 1) !== 0)
      invalidArchive("Encrypted repository ZIP entries are not supported.");
    if (entry.compression !== 0 && entry.compression !== 8)
      invalidArchive("Repository ZIP uses an unsupported compression method.");
    if (entry.originalSize > MAX_FILE_BYTES2)
      invalidArchive(`Repository ZIP file ${entry.name} exceeds the file size limit.`);
    extractedBytes += entry.originalSize;
    if (extractedBytes > MAX_EXTRACTED_BYTES)
      invalidArchive("Repository ZIP exceeds the extracted size limit.");
  }
  if (archiveBytes > 0 && extractedBytes / archiveBytes > MAX_EXPANSION_RATIO) {
    invalidArchive("Repository ZIP exceeds the allowed compression expansion ratio.");
  }
}
function validateUnzippedFiles(files) {
  const entries = Object.entries(files);
  if (entries.length > MAX_FILE_COUNT2)
    invalidArchive("Repository ZIP contains too many extracted entries.");
  let extractedBytes = 0;
  for (const [path, content] of entries) {
    normalizeArchivePath(path);
    if (content.byteLength > MAX_FILE_BYTES2)
      invalidArchive(`Repository ZIP file ${path} exceeds the file size limit.`);
    extractedBytes += content.byteLength;
    if (extractedBytes > MAX_EXTRACTED_BYTES)
      invalidArchive("Repository ZIP exceeds the extracted size limit.");
  }
}
function normalizeArchivePath(value) {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    invalidArchive("Repository ZIP contains an unsafe path.");
  }
  const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
  if (normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    invalidArchive("Repository ZIP contains an unsafe path.");
  }
  return normalized;
}
function parseTree3(payload) {
  if (!isRecord8(payload) || payload.truncated !== false || !Array.isArray(payload.tree)) {
    if (isRecord8(payload) && payload.truncated === true) {
      throw new MarketplaceResolverError("GITHUB_TREE_TRUNCATED", "GitHub returned a truncated repository tree.");
    }
    invalidArchive("GitHub returned an unsupported repository tree.");
  }
  const tree = [];
  for (const item of payload.tree) {
    if (!isRecord8(item) || item.type !== "blob" && item.type !== "tree" && item.type !== "commit")
      continue;
    const path = typeof item.path === "string" ? item.path : void 0;
    const mode = typeof item.mode === "string" ? item.mode : void 0;
    const sha = typeof item.sha === "string" ? item.sha : void 0;
    const size = typeof item.size === "number" && Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : 0;
    if (path === void 0 || mode === void 0 || sha === void 0 || !SHA_PATTERN3.test(sha) || !isSafeRepositoryPath2(path))
      continue;
    tree.push({ path, mode, sha: sha.toLocaleLowerCase(), size, type: item.type });
  }
  return tree;
}
async function getJson3(fetch, url, signal, token) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dsh-skill-manager",
      ...token === void 0 ? {} : { authorization: `Bearer ${token}` }
    },
    signal
  });
  if (!response.ok) {
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
      throw new MarketplaceResolverError("GITHUB_RATE_LIMITED", "GitHub API rate limit was exceeded.");
    }
    throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub request failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "GitHub returned malformed JSON.", { cause: error });
  }
}
async function readBoundedResponse(response, limit, message) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit)
    invalidArchive(message);
  if (response.body === null)
    return Buffer6.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const chunk = await reader.read();
      if (chunk.done)
        break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        invalidArchive(message);
      }
      chunks.push(Buffer6.from(chunk.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer6.concat(chunks, total);
}
function parseMetadata(value) {
  if (!isRecord8(value) || value.schemaVersion !== 1 || typeof value.key !== "string" || !SHA_PATTERN3.test(String(value.commit)) || typeof value.createdAt !== "string" || typeof value.lastAccessedAt !== "string" || typeof value.sizeBytes !== "number" || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0 || value.sizeBytes > MAX_EXTRACTED_BYTES || !Array.isArray(value.files) || value.files.length > MAX_FILE_COUNT2 || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.lastAccessedAt))) {
    invalidArchive("Cached repository snapshot metadata is invalid.");
  }
  const comparablePaths = /* @__PURE__ */ new Set();
  let sizeBytes = 0;
  const files = value.files.map((file) => {
    if (!isRecord8(file) || typeof file.path !== "string" || !isSafeRepositoryPath2(file.path) || typeof file.sha !== "string" || !SHA_PATTERN3.test(file.sha) || typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES2 || file.mode !== "100644" && file.mode !== "100755")
      invalidArchive("Cached repository snapshot metadata is invalid.");
    const comparable = file.path.toLocaleLowerCase();
    if (comparablePaths.has(comparable))
      invalidArchive("Cached repository snapshot metadata is invalid.");
    comparablePaths.add(comparable);
    sizeBytes += file.size;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes > MAX_EXTRACTED_BYTES) {
      invalidArchive("Cached repository snapshot metadata is invalid.");
    }
    return { path: file.path, sha: file.sha, size: file.size, mode: file.mode };
  });
  if (sizeBytes !== value.sizeBytes)
    invalidArchive("Cached repository snapshot metadata is invalid.");
  return {
    schemaVersion: 1,
    key: value.key,
    commit: String(value.commit),
    createdAt: value.createdAt,
    lastAccessedAt: value.lastAccessedAt,
    sizeBytes: value.sizeBytes,
    files
  };
}
function readDefaultBranch(payload) {
  if (!isRecord8(payload) || typeof payload.default_branch !== "string" || payload.default_branch.trim().length === 0) {
    invalidArchive("GitHub returned an invalid default branch.");
  }
  return payload.default_branch.trim();
}
function readCommit(payload) {
  if (!isRecord8(payload) || typeof payload.sha !== "string" || !SHA_PATTERN3.test(payload.sha)) {
    invalidArchive("GitHub returned an invalid commit.");
  }
  return payload.sha.toLocaleLowerCase();
}
function safeCachePath(root, path) {
  if (!isSafeRepositoryPath2(path))
    invalidArchive("Repository cache path is unsafe.");
  const target = resolve2(root, ...path.split("/"));
  const prefix = resolve2(root) + sep;
  if (!target.startsWith(prefix))
    invalidArchive("Repository cache path escaped its root.");
  return target;
}
function gitBlobSha2(content) {
  return createHash4("sha1").update(`blob ${content.byteLength}\0`).update(content).digest("hex");
}
function isSafeRepositoryPath2(path) {
  return path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !/[<>:"|?*\u0000-\u001f]/u.test(segment) && !/[. ]$/u.test(segment) && !WINDOWS_RESERVED_NAME5.test(segment));
}
function assertRepository(repository) {
  if (!REPOSITORY_PART3.test(repository.owner) || !REPOSITORY_PART3.test(repository.name)) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Repository identity is invalid.");
  }
}
function normalizeToken3(value) {
  const token = value?.trim();
  return token ? token : void 0;
}
async function safeReadDirectory(path) {
  try {
    return await readdir3(path);
  } catch {
    return [];
  }
}
async function raceAbort(promise, signal) {
  if (signal.aborted)
    throw signal.reason ?? new Error("Repository snapshot was cancelled.");
  return await new Promise((resolve4, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Repository snapshot was cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve4, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function missingFile(path) {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", `Repository snapshot does not contain ${path}.`);
}
function invalidArchive(message) {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", message);
}
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../core/dist/marketplace/github-inspector.js
var DEFAULT_TIMEOUT_MS8 = 45e3;
var MAX_DOCUMENT_BYTES = 512 * 1024;
var DOCUMENT_CONCURRENCY = 3;
var TRANSIENT_RETRY_DELAYS_MS = [150, 300];
var REPOSITORY_PART4 = /^[A-Za-z0-9_.-]+$/;
var SKILL_NAME6 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var MANIFEST_PATHS = [
  ".codex-plugin/plugin.json",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  "skills.json"
];
var FORMAT_TOPICS2 = /* @__PURE__ */ new Set(["agent-skills", "agent-skill", "claude-skills", "codex-skills"]);
var CATEGORY_TOPICS2 = /* @__PURE__ */ new Set(["coding", "security", "design", "research", "writing", "game-development", "data-analysis"]);
function createGitHubRepositoryInspector(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS8;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Repository inspection timeout must be a positive integer in milliseconds.");
  }
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const snapshotCache = options.snapshotCache ?? createGitHubSnapshotCache(options);
  return {
    inspectRepository(request) {
      assertRepository2(request.repository);
      return withDeadline2(request, timeoutMs, (signal) => inspect(snapshotCache, request, signal, now, options.refreshCommit === true));
    }
  };
}
async function inspect(snapshotCache, request, signal, now, refreshCommit) {
  const slug = `${request.repository.owner}/${request.repository.name}`;
  return await snapshotCache.withSnapshot(request.repository, signal, async (snapshot) => {
    const repository = parseRepository3(snapshot.repositoryPayload, now().toISOString());
    if (repository.fullName !== slug)
      invalidResponse4("GitHub repository identity changed during inspection.");
    const inspectionCommit = snapshot.commit;
    const tree = snapshot.tree.filter((entry) => entry.type === "blob").map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size }));
    const byPath = new Map(tree.map((blob) => [blob.path, blob]));
    const readmeBlob = tree.find((blob) => /^[^/]*readme(?:\.[^/]*)?$/iu.test(blob.path));
    const manifestBlobs = MANIFEST_PATHS.map((path) => byPath.get(path)).filter((blob) => blob !== void 0);
    const skillBlobs = tree.filter((blob) => blob.path === "SKILL.md" || blob.path.endsWith("/SKILL.md"));
    const documentBlobs = [
      ...readmeBlob === void 0 ? [] : [{ kind: "readme", blob: readmeBlob }],
      ...manifestBlobs.map((blob) => ({ kind: "manifest", blob })),
      ...skillBlobs.map((blob) => ({ kind: "skill", blob }))
    ];
    const documents = await mapConcurrent(documentBlobs, DOCUMENT_CONCURRENCY, async (document2) => ({
      ...document2,
      content: await readSnapshotTextWithRetry(snapshot, document2.blob, signal)
    }));
    const readmeDocument = documents.find((document2) => document2.kind === "readme")?.content ?? null;
    const manifestDocuments = documents.filter((document2) => document2.kind === "manifest");
    const skillDocuments = documents.filter((document2) => document2.kind === "skill");
    const declaredSkillPaths = /* @__PURE__ */ new Set();
    const explicitMediaPaths = /* @__PURE__ */ new Set();
    const declaredResourceFiles = /* @__PURE__ */ new Map();
    const manifestHints = /* @__PURE__ */ new Map();
    const warnings = [];
    for (const manifest of manifestDocuments) {
      try {
        const parsed = JSON.parse(manifest.content);
        collectManifestPaths(parsed, declaredSkillPaths, explicitMediaPaths);
        collectManifestResourceFiles(parsed, declaredResourceFiles);
        collectManifestHints(parsed, manifestHints);
      } catch {
        warnings.push(`${manifest.blob.path} \u4E0D\u662F\u6709\u6548 JSON\uFF0C\u5DF2\u5FFD\u7565\u5176\u4E2D\u7684\u53D1\u73B0\u7EBF\u7D22\u3002`);
      }
    }
    const skills = [];
    for (const document2 of skillDocuments) {
      const descriptor2 = parseSkillDescriptor(repository, inspectionCommit, document2.blob, document2.content, resolveManifestFiles(document2.blob.path, declaredResourceFiles, byPath, warnings), manifestHints.get(document2.blob.path === "SKILL.md" ? "." : document2.blob.path.slice(0, -"/SKILL.md".length)), summarizeReadme(readmeDocument), snapshot.tree);
      if (descriptor2 !== null)
        skills.push(descriptor2);
    }
    skills.sort((left, right) => left.path.localeCompare(right.path));
    for (const declared of declaredSkillPaths) {
      const normalized = normalizeSkillPath2(declared);
      if (normalized === void 0) {
        warnings.push(`manifest \u58F0\u660E\u4E86\u4E0D\u5B89\u5168\u7684 Skill \u8DEF\u5F84\uFF1A${declared}`);
        continue;
      }
      if (!skills.some((skill) => skill.path === normalized)) {
        warnings.push(`manifest \u58F0\u660E\u7684 ${normalized} \u672A\u627E\u5230\u6709\u6548 SKILL.md\u3002`);
      }
    }
    const media = collectMedia(repository.repoKey, inspectionCommit, tree, readmeDocument, explicitMediaPaths);
    return {
      repository: { ...repository, knownSkillCount: skills.length },
      inspectionCommit,
      inspectedAt: now().toISOString(),
      status: skills.length > 0 ? "structure-verified" : "inspected",
      readme: readmeBlob === void 0 || readmeDocument === null ? null : {
        path: readmeBlob.path,
        title: /^#\s+(.+)$/mu.exec(readmeDocument)?.[1]?.trim() ?? null,
        content: readmeDocument,
        blobSha: readmeBlob.sha
      },
      manifestPaths: manifestBlobs.map((blob) => blob.path),
      declaredSkillPaths: [...declaredSkillPaths].map((path) => normalizeSkillPath2(path) ?? path),
      skills,
      media,
      warnings
    };
  }, { refreshCommit });
}
function parseSkillDescriptor(repository, commit, blob, document2, manifestFiles, manifestHint, readmeSummary, repositoryTree) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(document2);
  if (match === null)
    return null;
  let frontmatter;
  try {
    frontmatter = parse3(match[1] ?? "");
  } catch {
    return null;
  }
  if (!isRecord9(frontmatter))
    return null;
  const name = readString2(frontmatter.name);
  const description = readString2(frontmatter.description);
  if (name === void 0 || description === void 0 || !SKILL_NAME6.test(name))
    return null;
  const path = blob.path === "SKILL.md" ? "." : blob.path.slice(0, -"/SKILL.md".length);
  const finalSegment = path === "." ? name : path.split("/").at(-1);
  const warnings = [];
  const installable = validateSkillBoundary(path, repositoryTree, warnings);
  const frontmatterRecord = frontmatter;
  const metadata = isRecord9(frontmatterRecord.metadata) ? frontmatterRecord.metadata : {};
  const frontmatterClassification = {
    category: frontmatterRecord.category ?? metadata.category,
    tags: frontmatterRecord.tags ?? metadata.tags
  };
  return {
    skillKey: `github:${repository.fullName}#${path}`,
    repositoryId: repository.repositoryId,
    path,
    name,
    description,
    classification: classifySkill({
      name,
      description,
      readmeSummary,
      topics: repository.topics,
      frontmatter: frontmatterClassification,
      manifest: manifestHint
    }),
    author: parseAuthor(frontmatter),
    structureStatus: "structure-verified",
    validatedAtCommit: commit,
    skillDocumentBlobSha: blob.sha,
    manifestFiles,
    installable,
    warnings
  };
}
function validateSkillBoundary(path, tree, warnings) {
  const prefix = path === "." ? "" : `${path}/`;
  let installable = true;
  for (const entry of tree) {
    if (entry.path === "AGENTS.md" || entry.path === "CLAUDE.md" || entry.path.endsWith("/AGENTS.md") || entry.path.endsWith("/CLAUDE.md"))
      continue;
    if (path !== "." && entry.path !== path && !entry.path.startsWith(prefix))
      continue;
    if (path === "." && !isRootBundlePath(entry.path))
      continue;
    if (entry.type === "tree" && entry.mode === "040000")
      continue;
    if (entry.type !== "blob" || entry.mode !== "100644" && entry.mode !== "100755") {
      installable = false;
      warnings.push(`Skill bundle \u5305\u542B\u4E0D\u652F\u6301\u7684 ${entry.type} \u6761\u76EE\uFF1A${entry.path}`);
    }
  }
  return installable;
}
function isRootBundlePath(path) {
  return path === "SKILL.md" || path.startsWith("scripts/") || path.startsWith("references/") || path.startsWith("assets/");
}
function parseAuthor(frontmatter) {
  if (!isRecord9(frontmatter.metadata))
    return null;
  const name = readString2(frontmatter.metadata.author);
  return name === void 0 ? null : { name, url: null };
}
function collectManifestPaths(value, skillPaths, mediaPaths, key = "") {
  if (Array.isArray(value)) {
    for (const item of value)
      collectManifestPaths(item, skillPaths, mediaPaths, key);
    return;
  }
  if (!isRecord9(value))
    return;
  for (const [childKey, child] of Object.entries(value)) {
    const normalizedKey = childKey.toLocaleLowerCase();
    if (typeof child === "string") {
      if (normalizedKey === "path" && /skill/iu.test(key))
        skillPaths.add(child);
      if (/^(?:logo|screenshot|screenshots|image|images)$/u.test(normalizedKey))
        mediaPaths.add(child);
      continue;
    }
    collectManifestPaths(child, skillPaths, mediaPaths, `${key}/${normalizedKey}`);
  }
}
function collectManifestHints(value, hints, key = "") {
  if (Array.isArray(value)) {
    for (const item of value)
      collectManifestHints(item, hints, key);
    return;
  }
  if (!isRecord9(value))
    return;
  const rawPath = typeof value.path === "string" && /skill/iu.test(key) ? value.path : void 0;
  if (rawPath !== void 0) {
    const normalizedPath = normalizeSkillPath2(rawPath);
    if (normalizedPath !== void 0) {
      hints.set(normalizedPath, { category: value.category, tags: value.tags });
    }
  }
  for (const [childKey, child] of Object.entries(value)) {
    collectManifestHints(child, hints, `${key}/${childKey.toLocaleLowerCase()}`);
  }
}
function collectManifestResourceFiles(value, declarations, key = "") {
  if (Array.isArray(value)) {
    for (const item of value)
      collectManifestResourceFiles(item, declarations, key);
    return;
  }
  if (!isRecord9(value))
    return;
  const rawPath = typeof value.path === "string" && /skill/iu.test(key) ? value.path : void 0;
  const skillPath = rawPath === void 0 ? void 0 : normalizeSkillPath2(rawPath);
  if (skillPath !== void 0) {
    const files = declarations.get(skillPath) ?? /* @__PURE__ */ new Set();
    for (const resourceKey of ["files", "resources", "include", "includes"]) {
      collectStringValues(value[resourceKey], files);
    }
    if (files.size > 0)
      declarations.set(skillPath, files);
  }
  for (const [childKey, child] of Object.entries(value)) {
    collectManifestResourceFiles(child, declarations, `${key}/${childKey.toLocaleLowerCase()}`);
  }
}
function collectStringValues(value, output) {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      collectStringValues(item, output);
  }
}
function resolveManifestFiles(skillDocumentPath, declarations, byPath, warnings) {
  const skillPath = skillDocumentPath === "SKILL.md" ? "." : skillDocumentPath.slice(0, -"/SKILL.md".length);
  if (skillPath !== ".")
    return [];
  const files = [];
  for (const declared of declarations.get(skillPath) ?? []) {
    const normalized = normalizeRepositoryPath(declared.trim().replace(/^\.\//u, ""));
    if (normalized === void 0 || /^(?:AGENTS|CLAUDE)\.md$/iu.test(normalized)) {
      warnings.push(`manifest \u58F0\u660E\u4E86\u4E0D\u53EF\u5BFC\u5165\u7684\u6839\u76EE\u5F55\u8D44\u6E90\uFF1A${declared}`);
      continue;
    }
    if (!byPath.has(normalized)) {
      warnings.push(`manifest \u58F0\u660E\u7684\u6839\u76EE\u5F55\u8D44\u6E90\u4E0D\u5B58\u5728\uFF1A${normalized}`);
      continue;
    }
    if (normalized !== "SKILL.md")
      files.push(normalized);
  }
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}
function collectMedia(repo, commit, tree, readme, explicit) {
  const treePaths = new Set(tree.map((item) => item.path));
  const paths = /* @__PURE__ */ new Set();
  for (const path of explicit) {
    const normalized = normalizeRepositoryPath(path);
    if (normalized !== void 0 && treePaths.has(normalized) && isRasterImage(normalized))
      paths.add(normalized);
  }
  if (readme !== null) {
    for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
      const raw = match[1];
      if (raw === void 0 || /^https?:/iu.test(raw))
        continue;
      const normalized = normalizeRepositoryPath(raw.replace(/^\.\//u, ""));
      if (normalized !== void 0 && treePaths.has(normalized) && isRasterImage(normalized))
        paths.add(normalized);
    }
  }
  const media = [...paths].slice(0, 8).map((path) => ({
    type: "repo-blob",
    repo,
    commit,
    path
  }));
  media.push({ type: "github-social-preview", repo });
  return media;
}
function parseRepository3(payload, discoveredAt) {
  if (!isRecord9(payload) || !isRecord9(payload.owner))
    invalidResponse4("GitHub returned an invalid repository.");
  const repositoryId = readInteger2(payload.id);
  const nodeId = readString2(payload.node_id);
  const owner = readString2(payload.owner.login);
  const ownerId = readInteger2(payload.owner.id);
  const ownerType = payload.owner.type === "Organization" ? "Organization" : payload.owner.type === "Bot" ? "Bot" : payload.owner.type === "User" ? "User" : void 0;
  const name = readString2(payload.name);
  const fullName = readString2(payload.full_name);
  const url = readHttpsUrl3(payload.html_url);
  const defaultBranch = readString2(payload.default_branch);
  const stars = readInteger2(payload.stargazers_count);
  const forks = readInteger2(payload.forks_count);
  const createdAt = readDate2(payload.created_at);
  const updatedAt = readDate2(payload.updated_at);
  const pushedAt = readDate2(payload.pushed_at);
  const description = payload.description === null || typeof payload.description === "string" ? payload.description : void 0;
  const archived = typeof payload.archived === "boolean" ? payload.archived : void 0;
  const topics = Array.isArray(payload.topics) ? payload.topics.map(readString2).filter((topic) => topic !== void 0).map((topic) => topic.toLocaleLowerCase()) : [];
  if (repositoryId === void 0 || nodeId === void 0 || ownerId === void 0 || owner === void 0 || ownerType === void 0 || name === void 0 || fullName !== `${owner}/${name}` || url !== `https://github.com/${fullName}` || defaultBranch === void 0 || stars === void 0 || forks === void 0 || createdAt === void 0 || updatedAt === void 0 || pushedAt === void 0 || description === void 0 || archived === void 0) {
    invalidResponse4("GitHub returned an invalid repository.");
  }
  const repoKey = `github:${fullName}`;
  const formatTopics = topics.filter((topic) => FORMAT_TOPICS2.has(topic));
  return {
    repositoryId,
    nodeId,
    repoKey,
    host: "github",
    owner,
    ownerId,
    ownerType,
    ownerAvatar: { type: "github-avatar", owner, accountId: ownerId },
    name,
    fullName,
    description,
    url,
    defaultBranch,
    stars,
    forks,
    createdAt,
    updatedAt,
    pushedAt,
    topics,
    formatTopics,
    categoryTopics: topics.filter((topic) => CATEGORY_TOPICS2.has(topic)),
    archived,
    license: isRecord9(payload.license) ? readString2(payload.license.spdx_id) ?? null : null,
    knownSkillCount: null,
    classification: classifySkill({ name, description, topics }),
    trend: null,
    cover: { type: "generated", seed: repoKey },
    discovery: {
      signals: formatTopics.map((topic) => ({ source: "github", kind: "format-topic", label: `Topic: ${topic}` })),
      discoveredAt
    }
  };
}
async function readSnapshotText(snapshot, blob) {
  if (blob.size > MAX_DOCUMENT_BYTES) {
    throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", `${blob.path} exceeds the inspection size limit.`);
  }
  const content = await snapshot.readFile(blob.path);
  if (content.byteLength !== blob.size) {
    invalidResponse4(`GitHub returned bytes that do not match the fixed Tree for ${blob.path}.`);
  }
  return content.toString("utf8");
}
async function readSnapshotTextWithRetry(snapshot, blob, signal) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readSnapshotText(snapshot, blob);
    } catch (error) {
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
      if (delay === void 0 || signal.aborted || !isTransientTransportError(error))
        throw error;
      await waitForRetry(delay, signal);
    }
  }
}
async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
function waitForRetry(delayMs, signal) {
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error("Repository inspection was cancelled."));
  return new Promise((resolve4, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Repository inspection was cancelled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve4();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function isTransientTransportError(error, depth = 0) {
  if (depth > 4 || error instanceof MarketplaceResolverError || !isRecord9(error))
    return false;
  const code = typeof error.code === "string" ? error.code : void 0;
  if (code !== void 0 && (/* @__PURE__ */ new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT"
  ])).has(code))
    return true;
  return "cause" in error && isTransientTransportError(error.cause, depth + 1);
}
async function withDeadline2(request, timeoutMs, operation) {
  if (request.signal?.aborted)
    aborted4();
  const controller = new AbortController();
  let rejectBoundary = () => void 0;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  let timedOut = false;
  let callerAborted = false;
  const cancel = () => {
    callerAborted = true;
    controller.abort(request.signal?.reason);
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Repository inspection was cancelled."));
  };
  request.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectBoundary(new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Repository inspection exceeded ${timeoutMs} ms.`));
  }, timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), boundary]);
  } catch (error) {
    if (timedOut)
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Repository inspection exceeded ${timeoutMs} ms.`, { cause: error });
    if (callerAborted || request.signal?.aborted)
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Repository inspection was cancelled.", { cause: error });
    if (error instanceof MarketplaceResolverError)
      throw error;
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "Unable to inspect the GitHub repository.", { cause: error });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", cancel);
  }
}
function normalizeSkillPath2(value) {
  const path = value.trim().replace(/^\.\//u, "").replace(/\/$/u, "");
  if (path === "." || path.length === 0)
    return ".";
  return normalizeRepositoryPath(path);
}
function normalizeRepositoryPath(value) {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes("\0"))
    return void 0;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..") ? value : void 0;
}
function isRasterImage(path) {
  return /\.(?:png|jpe?g|webp|gif)$/iu.test(path);
}
function summarizeReadme(readme) {
  if (readme === null)
    return null;
  const summary = readme.replace(/```[\s\S]*?```/gu, " ").replace(/!\[[^\]]*\]\([^)]*\)/gu, " ").replace(/[#>*`]/gu, " ").replace(/\s+/gu, " ").trim();
  return summary.length > 2e3 ? summary.slice(0, 2e3) : summary;
}
function assertRepository2(repository) {
  if (!REPOSITORY_PART4.test(repository.owner) || !REPOSITORY_PART4.test(repository.name)) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Repository identity is invalid.");
  }
}
function readString2(value) {
  if (typeof value !== "string")
    return void 0;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function readInteger2(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : void 0;
}
function readHttpsUrl3(value) {
  const text = readString2(value);
  if (text === void 0)
    return void 0;
  try {
    return new URL(text).protocol === "https:" ? text : void 0;
  } catch {
    return void 0;
  }
}
function readDate2(value) {
  const text = readString2(value);
  return text !== void 0 && !Number.isNaN(Date.parse(text)) ? text : void 0;
}
function aborted4() {
  throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Repository inspection was cancelled.");
}
function invalidResponse4(message) {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", message);
}
function isRecord9(value) {
  return typeof value === "object" && value !== null;
}

// ../core/dist/marketplace/github-snapshot.js
function createGitHubSnapshotResolver(options = {}) {
  const snapshotCache = options.snapshotCache ?? createGitHubSnapshotCache(options);
  const freshInspector = createGitHubRepositoryInspector({
    ...options,
    snapshotCache,
    refreshCommit: true
  });
  const cachedInspector = createGitHubRepositoryInspector({
    ...options,
    snapshotCache,
    refreshCommit: false
  });
  const bundleFetcher = createGitHubBundleFetcher({ ...options, snapshotCache });
  return {
    async resolveSkillSnapshot(intent, request = {}) {
      assertIntent(intent);
      const resolution = await this.resolveRepositorySnapshots?.({
        repository: intent.repository,
        skillPaths: [intent.skillPath]
      }, request);
      if (resolution === void 0) {
        throw new MarketplaceResolverError("GITHUB_SKILL_NOT_FOUND", "Batch snapshot resolution is unavailable.");
      }
      const failure2 = resolution.failures.find((item) => item.skillPath === intent.skillPath);
      if (failure2 !== void 0) {
        throw new MarketplaceResolverError("GITHUB_SKILL_NOT_FOUND", failure2.message);
      }
      const snapshot = resolution.snapshots.find((item) => item.skill.path === intent.skillPath);
      if (snapshot === void 0) {
        throw new MarketplaceResolverError("GITHUB_SKILL_NOT_FOUND", `GitHub repository does not contain an installable Skill at ${intent.skillPath}.`);
      }
      return snapshot;
    },
    async resolveRepositorySnapshots(intent, request = {}) {
      const requestedPaths = intent.skillPaths === void 0 ? void 0 : [...new Set(intent.skillPaths)];
      if (requestedPaths === void 0) {
        assertIntent({ repository: intent.repository, skillPath: "." });
      } else {
        for (const skillPath of requestedPaths) {
          assertIntent({ repository: intent.repository, skillPath });
        }
      }
      const refreshCommit = request.refreshCommit ?? options.refreshCommit ?? true;
      const inspection = await (refreshCommit ? freshInspector : cachedInspector).inspectRepository({
        repository: intent.repository,
        ...request.signal === void 0 ? {} : { signal: request.signal }
      });
      const selected = requestedPaths === void 0 ? inspection.skills : inspection.skills.filter((skill) => requestedPaths.includes(skill.path));
      const snapshots = [];
      const failures = [];
      if (requestedPaths !== void 0) {
        for (const skillPath of requestedPaths) {
          if (!inspection.skills.some((skill) => skill.path === skillPath)) {
            failures.push({
              skillPath,
              code: "GITHUB_SKILL_NOT_FOUND",
              message: `GitHub repository does not contain a Skill at ${skillPath}.`
            });
          }
        }
      }
      for (const descriptor2 of selected) {
        if (!descriptor2.installable) {
          failures.push({ skillPath: descriptor2.path, code: "GITHUB_SKILL_NOT_INSTALLABLE", message: descriptor2.warnings.join(" ") || `Skill ${descriptor2.path} is not installable.` });
          continue;
        }
        try {
          const entry = toResolvedEntry(inspection, descriptor2);
          const bundle = await bundleFetcher.fetchBundle(entry, request);
          snapshots.push(toResolvedSnapshot(inspection, descriptor2, bundle));
        } catch (error) {
          failures.push({
            skillPath: descriptor2.path,
            code: error instanceof MarketplaceResolverError ? error.code : "GITHUB_SNAPSHOT_FAILED",
            message: error instanceof Error ? error.message : "Skill snapshot resolution failed."
          });
        }
      }
      return { inspection, snapshots, failures };
    }
  };
}
function toResolvedSnapshot(inspection, skill, bundle) {
  return {
    repository: inspection.repository,
    skill,
    snapshot: {
      snapshotKey: `${skill.skillKey}@${inspection.inspectionCommit}`,
      repository: {
        owner: inspection.repository.owner,
        name: inspection.repository.name
      },
      skillPath: skill.path,
      commitSha: inspection.inspectionCommit,
      skillDocumentBlobSha: skill.skillDocumentBlobSha,
      files: bundle.files.map((file) => ({
        path: file.path,
        blobSha: file.blobSha,
        size: file.size,
        mode: file.mode
      })),
      bundleHash: bundle.bundleHash,
      integrity: {
        commitPinned: true,
        pathsSafe: true,
        frontmatterValid: true,
        symlinksRejected: true,
        submodulesRejected: true
      }
    },
    files: bundle.files.map((file) => ({ path: file.path, content: file.content }))
  };
}
function toResolvedEntry(inspection, skill) {
  const { owner, name: repositoryName } = inspection.repository;
  const repository = `${owner}/${repositoryName}`;
  const url = `https://github.com/${repository}`;
  return {
    id: `${repository}/${skill.name}`,
    source: "github",
    catalogs: ["github"],
    name: skill.name,
    description: skill.description,
    publisher: { name: owner, url: `https://github.com/${owner}` },
    author: skill.author,
    repository: {
      host: "github",
      id: inspection.repository.repositoryId,
      nodeId: inspection.repository.nodeId,
      owner,
      name: repositoryName,
      path: skill.path,
      url
    },
    skillUrl: skill.path === "." ? `${url}/blob/${inspection.inspectionCommit}/SKILL.md` : `${url}/tree/${inspection.inspectionCommit}/${skill.path}`,
    install: {
      kind: "github",
      repository,
      skill: skill.name,
      path: skill.path
    },
    metrics: {
      installs: null,
      stars: { value: inspection.repository.stars, source: "github", scope: "repository" },
      downloads: null
    },
    cover: { kind: "generated", seed: `${repository}#${skill.path}` },
    snapshot: {
      commitSha: inspection.inspectionCommit,
      blobSha: skill.skillDocumentBlobSha,
      fetchedAt: inspection.inspectedAt,
      ...skill.manifestFiles.length === 0 ? {} : { manifestFiles: skill.manifestFiles }
    }
  };
}
function assertIntent(intent) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(intent.repository.owner) || !/^[A-Za-z0-9_.-]+$/u.test(intent.repository.name) || !isSafeSkillPath(intent.skillPath)) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Skill installation intent is invalid.");
  }
}
function isSafeSkillPath(path) {
  return path === "." || !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

// ../core/dist/marketplace/skill-risk.js
import { Buffer as Buffer7 } from "node:buffer";
var SCANNER_VERSION = "1.0.0";
var MAX_SCAN_BYTES = 512 * 1024;
function createStaticSkillRiskAssessor(options = {}) {
  const resolver = createGitHubSnapshotResolver({ ...options, refreshCommit: false });
  return {
    async assessSkillRisk(intent, request = {}) {
      const resolved = await resolver.resolveSkillSnapshot(intent, request);
      return scanBundle(resolved.files);
    },
    assessResolvedSkillRisk(resolved) {
      return scanBundle(resolved.files);
    }
  };
}
function scanBundle(files) {
  const findings = [];
  for (const file of files) {
    const executable = /^(?:scripts\/|.*\.(?:sh|ps1|py|js|mjs|cjs|bat|cmd))$/iu.test(file.path);
    if (executable)
      addFinding(findings, {
        code: "SCRIPT_PRESENT",
        severity: "warning",
        title: "\u5305\u542B\u811A\u672C",
        detail: "Skill bundle \u5305\u542B\u53EF\u6267\u884C\u811A\u672C\u6587\u4EF6\uFF1B\u5B89\u88C5\u4E0D\u4F1A\u81EA\u52A8\u8FD0\u884C\u5B83\u3002",
        file: file.path
      });
    if (file.content.byteLength > MAX_SCAN_BYTES) {
      addFinding(findings, {
        code: "FILE_SCAN_SKIPPED",
        severity: "info",
        title: "\u6587\u4EF6\u672A\u5B8C\u6574\u626B\u63CF",
        detail: "\u6587\u4EF6\u8D85\u8FC7\u9759\u6001\u626B\u63CF\u5927\u5C0F\u4E0A\u9650\uFF0C\u98CE\u9669\u72B6\u6001\u53EF\u80FD\u4E0D\u5B8C\u6574\u3002",
        file: file.path
      });
      continue;
    }
    if (looksBinary(file.content))
      continue;
    const text = Buffer7.from(file.content).toString("utf8");
    if (/https?:\/\//iu.test(text))
      addFinding(findings, {
        code: "NETWORK_REFERENCE",
        severity: "warning",
        title: "\u8BF7\u6C42\u7F51\u7EDC\u8BBF\u95EE",
        detail: "\u5185\u5BB9\u5305\u542B\u7F51\u7EDC\u5730\u5740\u6216\u5916\u90E8\u670D\u52A1\u5F15\u7528\u3002",
        file: file.path
      });
    if (/(?:api[_ -]?key|access[_ -]?token|secret|password|credential|\.env|ssh\/|\.aws\/|\.config\/gcloud)/iu.test(text)) {
      addFinding(findings, {
        code: "SENSITIVE_REFERENCE",
        severity: "high",
        title: "\u63D0\u53CA\u51ED\u636E\u6216\u654F\u611F\u8DEF\u5F84",
        detail: "\u5185\u5BB9\u63D0\u53CA\u51ED\u636E\u3001\u4EE4\u724C\u6216\u5E38\u89C1\u654F\u611F\u914D\u7F6E\u4F4D\u7F6E\uFF1B\u5B89\u88C5\u524D\u5E94\u4EBA\u5DE5\u68C0\u67E5\u3002",
        file: file.path
      });
    }
    if (/(?:rm\s+-rf|remove-item\s+.+-recurse|format-volume|diskpart|del\s+\/s|rmdir\s+\/s|git\s+reset\s+--hard|curl\s+[^\r\n|]+\|\s*(?:sh|bash)|invoke-expression)/iu.test(text)) {
      addFinding(findings, {
        code: "DESTRUCTIVE_EXECUTION",
        severity: "high",
        title: "\u5305\u542B\u9AD8\u98CE\u9669\u6267\u884C\u6A21\u5F0F",
        detail: "\u5185\u5BB9\u5305\u542B\u5220\u9664\u3001\u8986\u76D6\u3001\u7CFB\u7EDF\u4FEE\u6539\u6216\u4E0B\u8F7D\u540E\u6267\u884C\u6A21\u5F0F\u3002",
        file: file.path
      });
    }
    if (/(?:\bmcp\b|tool[_ -]?call|shell|powershell|bash|python\s+-m)/iu.test(text))
      addFinding(findings, {
        code: "TOOL_EXECUTION_REFERENCE",
        severity: "warning",
        title: "\u63D0\u53CA\u5DE5\u5177\u6216\u547D\u4EE4\u6267\u884C",
        detail: "\u5185\u5BB9\u63CF\u8FF0\u4E86 MCP\u3001Shell \u6216\u5176\u4ED6\u5DE5\u5177\u8C03\u7528\u3002",
        file: file.path
      });
    if (/(?:upload|exfiltrat|send\s+.+to\s+https?:|webhook)/iu.test(text))
      addFinding(findings, {
        code: "EXTERNAL_UPLOAD_REFERENCE",
        severity: "high",
        title: "\u53EF\u80FD\u5411\u5916\u90E8\u53D1\u9001\u6570\u636E",
        detail: "\u5185\u5BB9\u63D0\u53CA\u4E0A\u4F20\u3001Webhook \u6216\u5411\u5916\u90E8\u670D\u52A1\u53D1\u9001\u6570\u636E\u3002",
        file: file.path
      });
  }
  const risk = findings.some((finding) => finding.severity === "high") ? "high" : findings.some((finding) => finding.severity === "warning") ? "medium" : findings.length > 0 ? "low" : "low";
  return { risk, findings, scannerVersion: SCANNER_VERSION };
}
function addFinding(findings, finding) {
  if (!findings.some((candidate) => candidate.code === finding.code && candidate.file === finding.file)) {
    findings.push(finding);
  }
}
function looksBinary(content) {
  const sample = content.subarray(0, Math.min(content.byteLength, 4096));
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0)
      return true;
    if (byte < 9 || byte > 13 && byte < 32)
      controlBytes += 1;
  }
  return sample.byteLength > 0 && controlBytes / sample.byteLength > 0.05;
}

// ../core/dist/marketplace/media-resolver.js
import { Buffer as Buffer8 } from "node:buffer";
var DEFAULT_TIMEOUT_MS9 = 1e4;
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var MAX_DIMENSION = 4096;
var MAX_PIXELS = 12e6;
var REPOSITORY_PART5 = /^[A-Za-z0-9_.-]+$/;
var SHA_PATTERN4 = /^[a-f0-9]{40}$/iu;
function createGitHubMediaResolver(options = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "This runtime does not provide fetch.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS9;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_RESOLUTION_TIMEOUT", "Media timeout must be a positive integer.");
  }
  return {
    resolveMedia: (source, request = {}) => resolveWithDeadline2(fetch, source, request.signal, timeoutMs, options.snapshotCache)
  };
}
async function resolveWithDeadline2(fetch, source, callerSignal, timeoutMs, snapshotCache) {
  const url = sourceUrl(source);
  const controller = new AbortController();
  const cancel = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { bytes, declaredType } = await loadMediaBytes(fetch, source, url, controller.signal, snapshotCache);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES)
      tooLarge2();
    const image = parseImage(bytes);
    if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION || image.width * image.height > MAX_PIXELS) {
      throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Image dimensions exceed the media safety limit.");
    }
    if (declaredType !== void 0 && declaredType.length > 0 && declaredType !== image.mimeType) {
      throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Image MIME type does not match its bytes.");
    }
    return {
      source,
      dataUrl: `data:${image.mimeType};base64,${Buffer8.from(bytes).toString("base64")}`,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height
    };
  } catch (error) {
    if (error instanceof MarketplaceResolverError)
      throw error;
    if (callerSignal?.aborted)
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_ABORTED", "Media request was cancelled.");
    if (controller.signal.aborted)
      throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_TIMEOUT", `Media request exceeded ${timeoutMs} ms.`);
    throw new MarketplaceResolverError("MARKETPLACE_RESOLUTION_FETCH_FAILED", "Unable to load GitHub media.", { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
async function loadMediaBytes(fetch, source, url, signal, snapshotCache) {
  if (source.type === "repo-blob" && snapshotCache !== void 0) {
    const repository = parseRepoKey(source.repo);
    try {
      const bytes2 = await snapshotCache.withSnapshot(repository, signal, async (snapshot) => {
        if (snapshot.commit !== source.commit) {
          throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Repository media commit is no longer current.");
        }
        return await snapshot.readFile(source.path);
      });
      return { bytes: bytes2 };
    } catch (error) {
      if (signal.aborted)
        throw error;
    }
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "image/png,image/jpeg,image/gif,image/webp", "user-agent": "dsh-skill-manager" },
    redirect: "error",
    signal
  });
  if (!response.ok)
    throw new MarketplaceResolverError("GITHUB_HTTP_ERROR", `GitHub media request failed with HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES)
    tooLarge2();
  const bytes = new Uint8Array(await response.arrayBuffer());
  const declaredType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  return { bytes, ...declaredType === void 0 ? {} : { declaredType } };
}
function sourceUrl(source) {
  if (source.type === "generated") {
    throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Generated covers do not require remote media resolution.");
  }
  if (source.type === "github-avatar") {
    assertRepositoryPart(source.owner);
    if (!Number.isSafeInteger(source.accountId) || source.accountId < 1)
      invalidSource();
    return `https://avatars.githubusercontent.com/u/${source.accountId}?s=128&v=4`;
  }
  const { owner, name: repository } = parseRepoKey(source.repo);
  if (source.type === "github-social-preview") {
    return `https://opengraph.githubassets.com/dsh-skill-manager/${owner}/${repository}`;
  }
  if (!SHA_PATTERN4.test(source.commit) || !isSafePath(source.path) || /\.svg$/iu.test(source.path))
    invalidSource();
  return `https://raw.githubusercontent.com/${owner}/${repository}/${source.commit}/${source.path.split("/").map(encodeURIComponent).join("/")}`;
}
function parseRepoKey(repo) {
  const match = /^github:([^/]+)\/(.+)$/u.exec(repo);
  if (match === null)
    invalidSource();
  const owner = match[1];
  const name = match[2];
  assertRepositoryPart(owner);
  assertRepositoryPart(name);
  return { owner, name };
}
function parseImage(bytes) {
  if (bytes.length >= 24 && Buffer8.from(bytes.subarray(0, 8)).equals(Buffer8.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }
  if (bytes.length >= 10 && Buffer8.from(bytes.subarray(0, 3)).toString("ascii") === "GIF") {
    return { mimeType: "image/gif", width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
  }
  if (bytes.length >= 12 && Buffer8.from(bytes.subarray(0, 2)).equals(Buffer8.from([255, 216]))) {
    return parseJpeg(bytes);
  }
  if (bytes.length >= 30 && Buffer8.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer8.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") {
    return parseWebp(bytes);
  }
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Remote media is not a supported raster image.");
}
function parseJpeg(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 255) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 216 || marker === 217) {
      offset += 2;
      continue;
    }
    const length = bytes[offset + 2] << 8 | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length)
      break;
    if (marker >= 192 && marker <= 195) {
      return { mimeType: "image/jpeg", height: bytes[offset + 5] << 8 | bytes[offset + 6], width: bytes[offset + 7] << 8 | bytes[offset + 8] };
    }
    offset += length + 2;
  }
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "JPEG dimensions could not be decoded.");
}
function parseWebp(bytes) {
  const kind = Buffer8.from(bytes.subarray(12, 16)).toString("ascii");
  if (kind === "VP8X")
    return {
      mimeType: "image/webp",
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Unsupported WebP dimensions.");
}
function readU32(bytes, offset) {
  return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
}
function readU16LE(bytes, offset) {
  return bytes[offset] | bytes[offset + 1] << 8;
}
function assertRepositoryPart(value) {
  if (!REPOSITORY_PART5.test(value))
    invalidSource();
}
function isSafePath(path) {
  return !path.startsWith("/") && !path.includes("\\") && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
function invalidSource() {
  throw new MarketplaceResolverError("INVALID_MARKETPLACE_ENTRY", "Media source is invalid or unsupported.");
}
function tooLarge2() {
  throw new MarketplaceResolverError("INVALID_GITHUB_RESPONSE", "Image exceeds the media byte limit.");
}

// ../core/dist/github-skill-index.js
import { randomUUID as randomUUID3 } from "node:crypto";
import { mkdir as mkdir3, readFile as readFile4, rename as rename3, rm as rm3, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
var INDEX_SCHEMA_VERSION = 1;
var SHA_1 = /^[a-f0-9]{40}$/iu;
var SHA_256 = /^[a-f0-9]{64}$/iu;
var GITHUB_SEGMENT2 = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;
function createGitHubSkillIndex(options) {
  const versionsPerSkill = positiveInteger(options.versionsPerSkill ?? 5, "versionsPerSkill");
  const maxObservations = positiveInteger(options.maxObservations ?? 1e4, "maxObservations");
  let writes = Promise.resolve();
  const read = async () => {
    try {
      const value = JSON.parse(await readFile4(options.path, "utf8"));
      if (!isIndexFile(value))
        return [];
      return value.observations.map(cloneObservation);
    } catch (error) {
      if (isNodeError2(error) && error.code === "ENOENT")
        return [];
      if (error instanceof SyntaxError)
        return [];
      throw error;
    }
  };
  return {
    list: read,
    async findByFingerprint(fingerprint) {
      if (!isFingerprint(fingerprint))
        return [];
      return (await read()).filter((entry) => entry.fingerprint.version === fingerprint.version && entry.fingerprint.hash === fingerprint.hash).sort(newestFirst);
    },
    async findByRepositoryPath(repositoryId, skillPath) {
      return (await read()).filter((entry) => entry.repositoryId === repositoryId && entry.skillPath === skillPath).sort(newestFirst);
    },
    async record(observation) {
      const verified = validateObservation(observation);
      const operation = writes.then(async () => {
        const current = await read();
        const identity = observationIdentity(verified);
        const withoutDuplicate = current.filter((entry) => observationIdentity(entry) !== identity);
        const grouped = /* @__PURE__ */ new Map();
        for (const entry of [verified, ...withoutDuplicate]) {
          const key = `${entry.repositoryId}#${entry.skillPath}`;
          const group = grouped.get(key) ?? [];
          group.push(entry);
          grouped.set(key, group);
        }
        const bounded = [...grouped.values()].flatMap((group) => group.sort(newestFirst).slice(0, versionsPerSkill)).sort(newestFirst).slice(0, maxObservations);
        await writeAtomic(options.path, {
          schemaVersion: INDEX_SCHEMA_VERSION,
          observations: bounded
        });
      });
      writes = operation.catch(() => void 0);
      return operation;
    }
  };
}
async function writeAtomic(path, value) {
  const directory = dirname2(path);
  await mkdir3(directory, { recursive: true });
  const temporary = `${path}.${randomUUID3()}.tmp`;
  const backup = `${path}.${randomUUID3()}.bak`;
  await writeFile3(temporary, `${JSON.stringify(value, null, 2)}
`, "utf8");
  let hadExisting = false;
  try {
    await rename3(path, backup);
    hadExisting = true;
  } catch (error) {
    if (!isNodeError2(error) || error.code !== "ENOENT") {
      await rm3(temporary, { force: true });
      throw error;
    }
  }
  try {
    await rename3(temporary, path);
    if (hadExisting)
      await rm3(backup, { force: true });
  } catch (error) {
    await rm3(temporary, { force: true });
    if (hadExisting)
      await rename3(backup, path).catch(() => void 0);
    throw error;
  }
}
function validateObservation(value) {
  if (!isObservation(value))
    throw new TypeError("GitHub Skill observation is invalid.");
  return cloneObservation(value);
}
function isIndexFile(value) {
  return isRecord10(value) && value.schemaVersion === INDEX_SCHEMA_VERSION && Array.isArray(value.observations) && value.observations.length <= 1e4 && value.observations.every(isObservation);
}
function isObservation(value) {
  if (!isRecord10(value) || !isRecord10(value.repository) || !isFingerprint(value.fingerprint))
    return false;
  return Number.isSafeInteger(value.repositoryId) && Number(value.repositoryId) > 0 && typeof value.nodeId === "string" && value.nodeId.length > 0 && typeof value.repository.owner === "string" && GITHUB_SEGMENT2.test(value.repository.owner) && typeof value.repository.name === "string" && GITHUB_SEGMENT2.test(value.repository.name) && typeof value.skillPath === "string" && isSafePath2(value.skillPath) && typeof value.skillName === "string" && value.skillName.length > 0 && typeof value.commitSha === "string" && SHA_1.test(value.commitSha) && typeof value.skillDocumentBlobSha === "string" && SHA_1.test(value.skillDocumentBlobSha) && typeof value.bundleHash === "string" && SHA_256.test(value.bundleHash) && Array.isArray(value.manifestFiles) && value.manifestFiles.every((path) => typeof path === "string" && isSafePath2(path)) && typeof value.observedAt === "string" && isIsoDate2(value.observedAt) && typeof value.verifiedAt === "string" && isIsoDate2(value.verifiedAt);
}
function isFingerprint(value) {
  return isRecord10(value) && value.version === SKILL_IDENTITY_FINGERPRINT_VERSION && typeof value.hash === "string" && SHA_256.test(value.hash);
}
function cloneObservation(value) {
  return {
    ...value,
    repository: { ...value.repository },
    fingerprint: { ...value.fingerprint },
    manifestFiles: [...value.manifestFiles]
  };
}
function observationIdentity(value) {
  return `${value.repositoryId}#${value.skillPath}@${value.commitSha}:${value.fingerprint.hash}`;
}
function newestFirst(left, right) {
  return right.verifiedAt.localeCompare(left.verifiedAt) || right.observedAt.localeCompare(left.observedAt) || right.commitSha.localeCompare(left.commitSha);
}
function isSafePath2(path) {
  return path === "." || path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isIsoDate2(value) {
  return Number.isFinite(Date.parse(value));
}
function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`);
  return value;
}
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError2(value) {
  return value instanceof Error && "code" in value;
}

// src/index.ts
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { join as join4, resolve as resolve3 } from "node:path";

// src/marketplace-fetch.ts
var import_https_proxy_agent = __toESM(require_dist2(), 1);
import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
var INTERNET_SETTINGS_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
var TRANSIENT_RETRY_DELAYS_MS2 = [150, 350];
var MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
var TRANSIENT_ERROR_CODES = /* @__PURE__ */ new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT"
]);
function createHostMarketplaceFetch(options = {}) {
  const environment = options.environment ?? process.env;
  const explicitProxy = firstNonEmpty(
    environment.HTTPS_PROXY,
    environment.https_proxy,
    environment.HTTP_PROXY,
    environment.http_proxy,
    environment.ALL_PROXY,
    environment.all_proxy
  );
  const windowsProxy = explicitProxy === void 0 && (options.platform ?? process.platform) === "win32" ? (options.readWindowsProxy ?? readEnabledWindowsProxy)() : void 0;
  const proxy = explicitProxy ?? windowsProxy;
  const transport = proxy === void 0 ? options.directFetch ?? globalThis.fetch.bind(globalThis) : (options.createProxyFetch ?? createProxyFetch)(proxy);
  return withTransientGetRetry(transport);
}
function readEnabledWindowsProxy() {
  try {
    const enabled = execFileSync("reg.exe", [
      "query",
      INTERNET_SETTINGS_KEY,
      "/v",
      "ProxyEnable"
    ], { encoding: "utf8", windowsHide: true });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/iu.test(enabled)) return void 0;
    const server = execFileSync("reg.exe", [
      "query",
      INTERNET_SETTINGS_KEY,
      "/v",
      "ProxyServer"
    ], { encoding: "utf8", windowsHide: true });
    const value = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/iu.exec(server)?.[1]?.trim();
    return normalizeWindowsProxy(value);
  } catch {
    return void 0;
  }
}
function normalizeWindowsProxy(value) {
  if (value === void 0 || value.length === 0) return void 0;
  const entries = value.split(";").map((entry) => entry.trim()).filter(Boolean);
  const mapped = new Map(entries.flatMap((entry) => {
    const separator = entry.indexOf("=");
    return separator < 0 ? [] : [[entry.slice(0, separator).toLowerCase(), entry.slice(separator + 1)]];
  }));
  const candidate = mapped.get("https") ?? mapped.get("http") ?? (mapped.size === 0 ? entries[0] : void 0);
  if (candidate === void 0 || !/^[A-Za-z0-9.-]+:\d{1,5}$/u.test(candidate)) return void 0;
  return `http://${candidate}`;
}
function createProxyFetch(proxy) {
  const agent = new import_https_proxy_agent.HttpsProxyAgent(proxy, { keepAlive: true });
  return (input, init) => fetchThroughProxy(agent, input, init);
}
async function fetchThroughProxy(agent, input, init = {}) {
  const request = input instanceof Request ? input : void 0;
  const url = new URL(request?.url ?? input.toString());
  if (url.protocol !== "https:") throw new TypeError("Marketplace proxy transport accepts HTTPS URLs only.");
  const method = (init.method ?? request?.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new TypeError("Marketplace proxy transport accepts GET requests only.");
  const headers = new Headers(request?.headers);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const signal = init.signal ?? request?.signal;
  return await new Promise((resolve4, reject) => {
    const outgoing = httpsRequest(url, {
      method,
      agent,
      headers: Object.fromEntries(headers),
      ...signal === void 0 || signal === null ? {} : { signal }
    }, (incoming) => {
      const chunks = [];
      let totalBytes = 0;
      incoming.on("data", (chunk) => {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          incoming.destroy(Object.assign(new Error("Marketplace response exceeded the transport size limit."), {
            code: "ERR_DSM_RESPONSE_TOO_LARGE"
          }));
          return;
        }
        chunks.push(bytes);
      });
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((entry) => responseHeaders.append(name, entry));
          else if (value !== void 0) responseHeaders.set(name, String(value));
        }
        resolve4(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode ?? 500,
          statusText: incoming.statusMessage ?? "",
          headers: responseHeaders
        }));
      });
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}
function withTransientGetRetry(transport) {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : void 0);
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await (init === void 0 ? transport(input) : transport(input, init));
      } catch (error) {
        const delay = TRANSIENT_RETRY_DELAYS_MS2[attempt];
        if (method !== "GET" || signal?.aborted || delay === void 0 || !isTransientTransportError2(error)) {
          throw error;
        }
        await waitForRetry2(delay, signal);
      }
    }
  };
}
function isTransientTransportError2(error, seen = /* @__PURE__ */ new Set()) {
  if (error === null || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const value = error;
  if (typeof value.code === "string" && TRANSIENT_ERROR_CODES.has(value.code)) return true;
  if (isTransientTransportError2(value.cause, seen)) return true;
  return Array.isArray(value.errors) && value.errors.some((entry) => isTransientTransportError2(entry, seen));
}
async function waitForRetry2(delayMs, signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  await new Promise((resolve4, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve4();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return void 0;
}

// src/rpc.ts
var RPC_SCHEMA_VERSION = 1;
function createSkillManagerRpcHandlers(dependencies) {
  const {
    manager,
    marketplace,
    provenanceMarketplace = marketplace,
    resolver,
    repositoryDiscovery,
    repositoryInspector,
    snapshotResolver,
    riskAssessor,
    mediaResolver,
    buildId = "dsh-skill-manager@0.0.0"
  } = dependencies;
  return {
    list(request) {
      return runRpc(request, async () => ({ skills: await manager.listSkills() }));
    },
    create(request) {
      return runRpc(request, async () => ({
        skill: await manager.createSkill({
          name: request.name,
          description: request.description
        })
      }));
    },
    setEnabled(request) {
      return runRpc(request, async () => ({
        skill: await manager.setTargetEnabled({
          name: request.name,
          target: "dsh",
          enabled: request.enabled
        })
      }));
    },
    getCapabilities(request) {
      return runRpc(request, async () => ({
        capabilities: {
          protocolVersion: 5,
          buildId,
          features: {
            marketplaceV2: repositoryDiscovery !== void 0 && snapshotResolver !== void 0,
            repositoryInspection: repositoryInspector !== void 0,
            mediaProxy: mediaResolver !== void 0,
            indexCatalog: false,
            riskAssessment: riskAssessor !== void 0,
            githubTrending: repositoryDiscovery !== void 0,
            skillClassification: repositoryInspector !== void 0,
            provenanceV2: false,
            updateRiskGate: snapshotResolver !== void 0 && riskAssessor !== void 0,
            repositoryBatchAnalysis: snapshotResolver?.resolveRepositorySnapshots !== void 0,
            repositoryBatchInstall: snapshotResolver?.resolveRepositorySnapshots !== void 0,
            batchProvenance: false,
            skillsShDiscoveryHints: false
          }
        }
      }));
    },
    searchRepositories(request) {
      return runRpc(request, async () => ({
        result: await requireV2(repositoryDiscovery, "Repository discovery").searchRepositories({
          query: request.query,
          ...request.sort === void 0 ? {} : { sort: request.sort },
          ...request.page === void 0 ? {} : { page: request.page },
          ...request.limit === void 0 ? {} : { limit: request.limit }
        })
      }));
    },
    browseRepositories(request) {
      return runRpc(request, async () => ({
        result: await requireV2(repositoryDiscovery, "Repository discovery").browseRepositories({
          ...request.sort === void 0 ? {} : { sort: request.sort },
          ...request.page === void 0 ? {} : { page: request.page },
          ...request.limit === void 0 ? {} : { limit: request.limit }
        })
      }));
    },
    inspectRepository(request) {
      return runRpc(request, async () => await requireV2(repositoryInspector, "Repository inspection").inspectRepository({
        repository: request.repository
      }));
    },
    installSkill(request) {
      return runRpc(request, async () => {
        const resolved = await requireV2(snapshotResolver, "Skill snapshot resolution").resolveSkillSnapshot({
          repository: request.repository,
          skillPath: request.skillPath
        }, { refreshCommit: false });
        const assessment = requireV2(riskAssessor, "Skill risk assessment").assessResolvedSkillRisk(resolved);
        if (assessment.risk === "unknown") {
          throw codedError(
            "SKILL_RISK_UNKNOWN",
            "The final fixed-commit Skill snapshot could not be assessed. Retry before installation."
          );
        }
        if (assessment.risk === "high" && request.acknowledgeHighRisk !== true) {
          throw codedError(
            "SKILL_RISK_CONFIRMATION_REQUIRED",
            "The final fixed-commit Skill snapshot has high-risk findings. Review them and confirm installation again."
          );
        }
        return { skill: await manager.installSkillSnapshot({ resolved }) };
      });
    },
    installRepository(request) {
      return runRpc(request, async () => {
        const resolverPort = requireV2(snapshotResolver, "Skill snapshot resolution");
        if (resolverPort.resolveRepositorySnapshots === void 0) {
          throw codedError("MARKETPLACE_V2_UNAVAILABLE", "Repository batch installation is not configured.");
        }
        const assessor = requireV2(riskAssessor, "Skill risk assessment");
        return await withHardDeadline(async (signal) => {
          const batch = await resolverPort.resolveRepositorySnapshots({
            repository: request.repository,
            ...request.selection.mode === "paths" ? { skillPaths: request.selection.paths } : {}
          }, { signal, refreshCommit: false });
          const installed = await manager.listSkills();
          const acknowledged = new Set(request.acknowledgeHighRiskPaths ?? []);
          const results = [];
          for (const failure2 of batch.failures) {
            results.push({ skillPath: failure2.skillPath, status: "failed", error: { code: failure2.code, message: failure2.message } });
          }
          for (const resolved of batch.snapshots) {
            if (signal.aborted) throw codedError("MARKETPLACE_RESOLUTION_TIMEOUT", "Repository installation exceeded 60000 ms.");
            const existing = installed.find((skill) => skill.source?.kind === "github" && skill.source.repositoryId === resolved.repository.repositoryId && skill.source.path === resolved.skill.path);
            const assessment = assessor.assessResolvedSkillRisk(resolved);
            if (existing !== void 0) {
              results.push({ skillPath: resolved.skill.path, status: "already-installed", skill: existing, assessment });
              continue;
            }
            if (assessment.risk === "unknown") {
              results.push({
                skillPath: resolved.skill.path,
                status: "failed",
                assessment,
                error: { code: "SKILL_RISK_UNKNOWN", message: "The final fixed-commit Skill snapshot could not be assessed. Retry before installation." }
              });
              continue;
            }
            if (assessment.risk === "high" && !acknowledged.has(resolved.skill.path)) {
              results.push({ skillPath: resolved.skill.path, status: "needs-confirmation", assessment });
              continue;
            }
            try {
              const skill = await manager.installSkillSnapshot({ resolved });
              results.push({ skillPath: resolved.skill.path, status: "installed", skill, assessment });
              installed.push(skill);
            } catch (error) {
              const code = isCodedError(error) && error.code === "SKILL_ALREADY_EXISTS" ? "SKILL_NAME_CONFLICT" : isCodedError(error) ? error.code : "INSTALL_FAILED";
              const message = code === "SKILL_NAME_CONFLICT" ? `A different installed Skill already uses the name "${resolved.skill.name}".` : error instanceof Error ? error.message : "Skill installation failed.";
              results.push({ skillPath: resolved.skill.path, status: "failed", assessment, error: { code, message } });
            }
          }
          return { results };
        }, 6e4, "MARKETPLACE_RESOLUTION_TIMEOUT", "Repository installation exceeded 60000 ms.");
      });
    },
    verifyProvenanceBatch(request) {
      return runRpc(request, async () => {
        throw codedError(
          "PROVENANCE_MATCHING_DISABLED",
          "Local-to-GitHub source matching is temporarily disabled to protect the GitHub API allowance."
        );
      });
    },
    assessSkillRisk(request) {
      return runRpc(request, async () => ({
        assessment: await requireV2(riskAssessor, "Skill risk assessment").assessSkillRisk({
          repository: request.repository,
          skillPath: request.skillPath
        })
      }));
    },
    resolveMedia(request) {
      return runRpc(request, async () => ({
        asset: await requireV2(mediaResolver, "Media resolution").resolveMedia(request.source)
      }));
    },
    verifyProvenance(request) {
      return runRpc(request, async () => {
        throw codedError(
          "PROVENANCE_MATCHING_DISABLED",
          "Local-to-GitHub source matching is temporarily disabled to protect the GitHub API allowance."
        );
      });
    },
    checkUpdates(request) {
      return runRpc(request, async () => ({
        checks: await manager.checkUpdates(
          request.names === void 0 ? {} : { names: request.names }
        )
      }));
    },
    update(request) {
      return runRpc(request, async () => manager.updateSkill({
        name: request.name,
        ...request.acknowledgeHighRisk === void 0 ? {} : { acknowledgeHighRisk: request.acknowledgeHighRisk }
      }));
    },
    listBackups(request) {
      return runRpc(request, async () => ({
        backups: await manager.listBackups(
          request.name === void 0 ? {} : { name: request.name }
        )
      }));
    },
    rollback(request) {
      return runRpc(request, async () => manager.rollbackSkill({
        name: request.name,
        backupId: request.backupId
      }));
    },
    delete(request) {
      return runRpc(request, async () => ({ deleted: await manager.deleteSkill({ name: request.name }) }));
    },
    listTrash(request) {
      return runRpc(request, async () => ({ trashed: await manager.listTrash() }));
    },
    restoreTrash(request) {
      return runRpc(request, async () => ({
        skill: await manager.restoreTrash({ name: request.name, trashId: request.trashId })
      }));
    },
    discoverExternal(request) {
      return runRpc(request, async () => ({ candidates: await manager.discoverExternalSkills(request.targets === void 0 ? {} : { targets: request.targets }) }));
    },
    importExternal(request) {
      return runRpc(request, async () => ({ skill: await manager.importSkill({ target: request.target, name: request.name }) }));
    },
    listTargetStates(request) {
      return runRpc(request, async () => ({ states: await manager.listTargetStates({
        ...request.names === void 0 ? {} : { names: request.names },
        ...request.targets === void 0 ? {} : { targets: request.targets }
      }) }));
    },
    setTargetEnabled(request) {
      return runRpc(request, async () => ({ skill: await manager.setTargetEnabled({ name: request.name, target: request.target, enabled: request.enabled }) }));
    }
  };
}
async function runRpc(request, operation) {
  if (request.schemaVersion !== RPC_SCHEMA_VERSION) {
    return failure(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Unsupported RPC schema version "${String(request.schemaVersion)}".`
    );
  }
  try {
    return {
      schemaVersion: RPC_SCHEMA_VERSION,
      ok: true,
      data: await operation()
    };
  } catch (error) {
    if (isCodedError(error)) {
      return failure(error.code, error.message);
    }
    return failure("INTERNAL_ERROR", "Skill Manager operation failed.");
  }
}
function isCodedError(error) {
  return error instanceof Error && typeof error.code === "string";
}
function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}
function requireV2(value, label) {
  if (value !== void 0) return value;
  throw codedError("MARKETPLACE_V2_UNAVAILABLE", `${label} is not configured.`);
}
async function withHardDeadline(operation, timeoutMs, code, message) {
  const controller = new AbortController();
  let rejectDeadline = () => void 0;
  const expiry = new Promise((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectDeadline(codedError(code, message));
  }, timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
function failure(code, message) {
  return {
    schemaVersion: RPC_SCHEMA_VERSION,
    ok: false,
    error: { code, message }
  };
}

// src/typert.host.ts
import { z } from "zod";
var PACKAGE_NAME = "dsh-skill-manager";
var SERVICE_NAME = "skillManager";
var skillTargetSchema = z.enum(["dsh", "codex", "claude", "agents", "opencode"]);
var skillOriginSchema = z.enum([
  "self",
  "local-import",
  "github",
  "skills-sh",
  "hugging-face"
]);
var localImportSourceSchema = z.object({
  kind: z.literal("local-import"),
  name: z.string(),
  target: z.enum(["codex", "claude", "agents", "opencode"])
}).strict();
var githubSourceSchema = z.object({
  kind: z.literal("github"),
  repository: z.string(),
  path: z.string(),
  commitSha: z.string(),
  blobSha: z.string(),
  bundleHash: z.string(),
  manifestFiles: z.array(z.string()).optional(),
  catalog: z.enum(["skills-sh", "github", "hugging-face"]),
  url: z.string(),
  repositoryId: z.number().int().positive().optional(),
  nodeId: z.string().optional(),
  matchMethod: z.enum(["install", "exact-content"]).optional(),
  matchedAt: z.string().optional(),
  identityFingerprint: z.object({
    version: z.literal("dsm-skill-fingerprint-v1"),
    hash: z.string().regex(/^[a-f0-9]{64}$/iu)
  }).strict().optional(),
  discoverySources: z.array(z.enum(["skills-sh", "github", "hugging-face"])).optional()
}).strict();
var managedSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  origin: skillOriginSchema,
  enabledTargets: z.array(skillTargetSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentHash: z.string(),
  source: z.union([localImportSourceSchema, githubSourceSchema]).optional(),
  provenanceCheck: z.object({
    status: z.enum(["no-match", "custom", "ambiguous", "ineligible"]),
    checkedAt: z.string()
  }).strict().optional()
}).strict();
var failureSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).strict()
}).strict();
var versionedRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION)
}).strict();
var createRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  description: z.string()
}).strict();
var setEnabledRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  enabled: z.boolean()
}).strict();
var repositorySortSchema = z.enum(["popular", "latest", "trend-weekly", "trend-monthly", "relevance"]);
var repositoryIdentitySchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/u),
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/u)
}).strict();
var getCapabilitiesRequestSchema = versionedRequestSchema;
var searchRepositoriesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  query: z.string().min(2).max(256),
  sort: repositorySortSchema.optional(),
  page: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
var browseRepositoriesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  sort: repositorySortSchema.optional(),
  page: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
var inspectRepositoryRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema
}).strict();
var skillIntentSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema,
  skillPath: z.string().min(1).max(512).refine((path) => path === "." || !path.startsWith("/") && !path.includes("\\") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "Unsafe Skill path"),
  acknowledgeHighRisk: z.boolean().optional()
}).strict();
var safeSkillPathSchema = z.string().min(1).max(512).refine((path) => path === "." || !path.startsWith("/") && !path.includes("\\") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "Unsafe Skill path");
var installRepositoryRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema,
  selection: z.union([
    z.object({ mode: z.literal("all") }).strict(),
    z.object({ mode: z.literal("paths"), paths: z.array(safeSkillPathSchema).min(1).max(512) }).strict()
  ]),
  acknowledgeHighRiskPaths: z.array(safeSkillPathSchema).max(512).optional()
}).strict();
var mediaSourceSchema = z.union([
  z.object({ type: z.literal("repo-blob"), repo: z.string(), commit: z.string(), path: z.string() }).strict(),
  z.object({ type: z.literal("github-avatar"), owner: z.string(), accountId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("github-social-preview"), repo: z.string() }).strict(),
  z.object({ type: z.literal("generated"), seed: z.string() }).strict()
]);
var discoverySignalSchema = z.object({
  source: z.enum(["skills-sh", "github", "hugging-face", "index"]),
  kind: z.enum(["format-topic", "metadata", "registry", "index", "ordinary-search"]),
  label: z.string()
}).strict();
var classificationEvidenceSchema = z.object({
  source: z.enum(["skill-frontmatter", "skills-manifest", "github-topic", "name", "description", "readme"]),
  value: z.string()
}).strict();
var skillClassificationSchema = z.object({
  primaryCategory: z.enum(["agent", "automation", "development", "data", "design", "content", "research", "business", "finance", "security", "creative", "life", "general"]),
  tags: z.array(z.string()).max(3),
  evidence: z.array(classificationEvidenceSchema),
  confidence: z.enum(["explicit", "topic", "keyword", "none"])
}).strict();
var repositoryTrendSchema = z.object({
  weeklyStars: z.number().int().nonnegative().nullable(),
  monthlyStars: z.number().int().nonnegative().nullable(),
  observedAt: z.string(),
  source: z.literal("github-trending-html"),
  stale: z.boolean()
}).strict();
var repositoryCandidateSchema = z.object({
  repositoryId: z.number().int().nonnegative(),
  nodeId: z.string(),
  repoKey: z.string(),
  host: z.literal("github"),
  owner: z.string(),
  ownerId: z.number().int().nonnegative(),
  ownerType: z.enum(["User", "Organization", "Bot"]),
  ownerAvatar: mediaSourceSchema,
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  defaultBranch: z.string(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pushedAt: z.string(),
  topics: z.array(z.string()),
  formatTopics: z.array(z.string()),
  categoryTopics: z.array(z.string()),
  archived: z.boolean(),
  license: z.string().nullable(),
  knownSkillCount: z.number().int().nonnegative().nullable(),
  classification: skillClassificationSchema,
  trend: repositoryTrendSchema.nullable(),
  cover: mediaSourceSchema,
  discovery: z.object({
    signals: z.array(discoverySignalSchema),
    discoveredAt: z.string()
  }).strict()
}).strict();
var repositoryQueryResultSchema = z.object({
  source: z.literal("github"),
  query: z.string().nullable(),
  sort: repositorySortSchema,
  page: z.number().int().min(1),
  returnedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  incomplete: z.boolean(),
  dataUpdatedAt: z.string(),
  sourceState: z.enum(["live", "cached", "unavailable", "empty"]),
  sourceMessage: z.string().nullable(),
  repositories: z.array(repositoryCandidateSchema)
}).strict();
var marketplacePartyV2Schema = z.object({ name: z.string(), url: z.string().nullable() }).strict();
var skillDescriptorSchema = z.object({
  skillKey: z.string(),
  repositoryId: z.number().int().nonnegative(),
  path: z.string(),
  name: z.string(),
  description: z.string(),
  classification: skillClassificationSchema,
  author: marketplacePartyV2Schema.nullable(),
  structureStatus: z.enum(["invalid", "parsed", "structure-verified"]),
  validatedAtCommit: z.string().regex(/^[a-f0-9]{40}$/iu),
  skillDocumentBlobSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  manifestFiles: z.array(z.string()),
  installable: z.boolean(),
  warnings: z.array(z.string())
}).strict();
var repositoryInspectionSchema = z.object({
  repository: repositoryCandidateSchema,
  inspectionCommit: z.string().regex(/^[a-f0-9]{40}$/iu),
  inspectedAt: z.string(),
  status: z.enum(["inspected", "structure-verified"]),
  readme: z.object({
    path: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    blobSha: z.string().regex(/^[a-f0-9]{40}$/iu)
  }).strict().nullable(),
  manifestPaths: z.array(z.string()),
  declaredSkillPaths: z.array(z.string()),
  skills: z.array(skillDescriptorSchema),
  media: z.array(mediaSourceSchema),
  warnings: z.array(z.string())
}).strict();
var riskAssessmentSchema = z.object({
  risk: z.enum(["unknown", "low", "medium", "high"]),
  findings: z.array(z.object({
    code: z.string(),
    severity: z.enum(["info", "warning", "high"]),
    title: z.string(),
    detail: z.string(),
    file: z.string()
  }).strict()),
  scannerVersion: z.string()
}).strict();
var repositoryInspectionResultSchema = z.object({
  inspection: repositoryInspectionSchema,
  assessments: z.array(z.object({
    skillPath: z.string(),
    assessment: riskAssessmentSchema
  }).strict())
}).strict();
var repositoryInstallResultSchema = z.object({
  skillPath: z.string(),
  status: z.enum(["installed", "already-installed", "needs-confirmation", "failed"]),
  skill: managedSkillSchema.optional(),
  assessment: riskAssessmentSchema.optional(),
  error: z.object({ code: z.string(), message: z.string() }).strict().optional()
}).strict();
var mediaAssetSchema = z.object({
  source: mediaSourceSchema,
  dataUrl: z.string().startsWith("data:image/"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096)
}).strict();
var resolveMediaRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  source: mediaSourceSchema
}).strict();
var capabilitiesSchema = z.object({
  protocolVersion: z.number().int().min(1),
  buildId: z.string(),
  features: z.object({
    marketplaceV2: z.boolean(),
    repositoryInspection: z.boolean(),
    mediaProxy: z.boolean(),
    indexCatalog: z.boolean(),
    riskAssessment: z.boolean(),
    githubTrending: z.boolean(),
    skillClassification: z.boolean(),
    provenanceV2: z.boolean(),
    updateRiskGate: z.boolean(),
    repositoryBatchAnalysis: z.boolean(),
    repositoryBatchInstall: z.boolean(),
    batchProvenance: z.boolean(),
    skillsShDiscoveryHints: z.boolean()
  }).strict()
}).strict();
var searchMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  query: z.string(),
  limit: z.number().int().optional()
}).strict();
var browseMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  offset: z.number().int().min(0).max(1e5).optional(),
  limit: z.number().int().min(1).max(200).optional()
}).strict();
var marketplacePartySchema = z.object({
  name: z.string(),
  url: z.string().nullable()
}).strict();
var marketplaceEntrySchema = z.object({
  id: z.string(),
  source: z.enum(["skills-sh", "github", "hugging-face"]),
  catalogs: z.array(z.enum(["skills-sh", "github", "hugging-face"])),
  name: z.string(),
  description: z.string().nullable(),
  publisher: marketplacePartySchema.nullable(),
  author: marketplacePartySchema.nullable(),
  repository: z.object({
    host: z.literal("github"),
    owner: z.string(),
    name: z.string(),
    path: z.string().nullable(),
    url: z.string()
  }).strict(),
  skillUrl: z.string(),
  install: z.object({
    kind: z.literal("github"),
    repository: z.string(),
    skill: z.string(),
    path: z.string().nullable()
  }).strict(),
  metrics: z.object({
    installs: z.object({
      value: z.number().int().nonnegative(),
      source: z.literal("skills.sh")
    }).strict().nullable(),
    stars: z.object({
      value: z.number().int().nonnegative(),
      source: z.literal("github"),
      scope: z.literal("repository")
    }).strict().nullable(),
    downloads: z.number().int().nonnegative().nullable()
  }).strict(),
  cover: z.object({
    kind: z.literal("generated"),
    seed: z.string()
  }).strict()
}).strict();
var resolveMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  entry: marketplaceEntrySchema
}).strict();
var installMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  entry: marketplaceEntrySchema
}).strict();
var verifyProvenanceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string()
}).strict();
var checkUpdatesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  names: z.array(z.string()).optional()
}).strict();
var updateSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  acknowledgeHighRisk: z.boolean().optional()
}).strict();
var listBackupsRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string().optional()
}).strict();
var rollbackSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  backupId: z.uuid()
}).strict();
var deleteSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string()
}).strict();
var restoreTrashRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  trashId: z.uuid()
}).strict();
var externalTargetSchema = z.enum(["codex", "claude", "agents", "opencode"]);
var discoverExternalRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  targets: z.array(externalTargetSchema).optional()
}).strict();
var importExternalRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  target: externalTargetSchema,
  name: z.string()
}).strict();
var listTargetStatesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  names: z.array(z.string()).optional(),
  targets: z.array(externalTargetSchema).optional()
}).strict();
var setTargetEnabledRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  target: externalTargetSchema,
  enabled: z.boolean()
}).strict();
var resolvedMarketplaceEntrySchema = marketplaceEntrySchema.extend({
  description: z.string(),
  repository: z.object({
    host: z.literal("github"),
    id: z.number().int().nonnegative(),
    nodeId: z.string(),
    owner: z.string(),
    name: z.string(),
    path: z.string(),
    url: z.string()
  }).strict(),
  install: z.object({
    kind: z.literal("github"),
    repository: z.string(),
    skill: z.string(),
    path: z.string()
  }).strict(),
  snapshot: z.object({
    commitSha: z.string(),
    blobSha: z.string(),
    fetchedAt: z.string(),
    manifestFiles: z.array(z.string()).optional()
  }).strict()
}).strict();
var marketplaceSearchResultSchema = z.object({
  source: z.enum(["skills-sh", "github", "hugging-face", "composite"]),
  query: z.string(),
  returnedCount: z.number().int().nonnegative(),
  entries: z.array(marketplaceEntrySchema),
  sources: z.array(z.object({
    source: z.enum(["skills-sh", "github", "hugging-face"]),
    status: z.enum(["available", "unavailable"]),
    returnedCount: z.number().int().nonnegative(),
    error: z.object({
      code: z.string(),
      message: z.string()
    }).strict().nullable()
  }).strict())
}).strict();
var marketplaceBrowseResultSchema = z.object({
  source: z.literal("skills-sh"),
  ranking: z.literal("all-time-installs"),
  offset: z.number().int().nonnegative(),
  returnedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  entries: z.array(marketplaceEntrySchema)
}).strict();
var snapshotSchema = z.object({
  commitSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  blobSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/iu)
}).strict();
var updateCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["unsupported", "local-modified", "source-moved", "up-to-date", "update-available"]),
  installed: snapshotSchema.nullable(),
  latest: snapshotSchema.nullable(),
  latestRisk: riskAssessmentSchema.nullable(),
  checkedAt: z.string()
}).strict();
var backupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.string(),
  reason: z.enum(["update", "rollback"]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  snapshot: snapshotSchema.nullable()
}).strict();
var mutationResultSchema = z.object({
  skill: managedSkillSchema,
  backup: backupSchema
}).strict();
var trashedSkillSchema = z.object({
  name: z.string(),
  trashId: z.uuid(),
  description: z.string(),
  origin: skillOriginSchema,
  enabledTargets: z.array(skillTargetSchema),
  deletedAt: z.string(),
  expiresAt: z.string()
}).strict();
var provenanceVerificationSchema = z.object({
  name: z.string(),
  status: z.enum(["matched", "custom", "ambiguous", "ineligible"]),
  skill: managedSkillSchema
}).strict();
var provenanceBatchFailureSchema = z.object({
  name: z.string(),
  code: z.string(),
  message: z.string()
}).strict();
var externalCandidateSchema = z.object({
  name: z.string(),
  description: z.string(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  target: externalTargetSchema
}).strict();
var targetStateSchema = z.object({
  name: z.string(),
  target: externalTargetSchema,
  status: z.enum(["not-configured", "not-linked", "linked", "conflict"])
}).strict();
function successSchema(data) {
  return z.object({
    schemaVersion: z.literal(RPC_SCHEMA_VERSION),
    ok: z.literal(true),
    data
  }).strict();
}
function descriptor(method, request, result) {
  return {
    id: `${PACKAGE_NAME}#${SERVICE_NAME}/${method}`,
    service: SERVICE_NAME,
    namespace: SERVICE_NAME,
    method,
    invocation: { kind: "direct" },
    parameters: [{
      name: "request",
      wire: "request",
      source: "json",
      codec: {
        mode: "strict",
        typeSymbol: `${PACKAGE_NAME}#${method}#request`,
        schema: request
      }
    }],
    result: {
      mode: "strict",
      typeSymbol: `${PACKAGE_NAME}#${method}#result`,
      schema: result
    }
  };
}
var skillManagerDescriptors = [
  descriptor(
    "list",
    versionedRequestSchema,
    z.union([
      successSchema(z.object({ skills: z.array(managedSkillSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "create",
    createRequestSchema,
    z.union([
      successSchema(z.object({ skill: managedSkillSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "setEnabled",
    setEnabledRequestSchema,
    z.union([
      successSchema(z.object({ skill: managedSkillSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor("getCapabilities", getCapabilitiesRequestSchema, z.union([
    successSchema(z.object({ capabilities: capabilitiesSchema }).strict()),
    failureSchema
  ])),
  descriptor("searchRepositories", searchRepositoriesRequestSchema, z.union([
    successSchema(z.object({ result: repositoryQueryResultSchema }).strict()),
    failureSchema
  ])),
  descriptor("browseRepositories", browseRepositoriesRequestSchema, z.union([
    successSchema(z.object({ result: repositoryQueryResultSchema }).strict()),
    failureSchema
  ])),
  descriptor("inspectRepository", inspectRepositoryRequestSchema, z.union([
    successSchema(repositoryInspectionResultSchema),
    failureSchema
  ])),
  descriptor("installSkill", skillIntentSchema, z.union([
    successSchema(z.object({ skill: managedSkillSchema }).strict()),
    failureSchema
  ])),
  descriptor("installRepository", installRepositoryRequestSchema, z.union([
    successSchema(z.object({ results: z.array(repositoryInstallResultSchema) }).strict()),
    failureSchema
  ])),
  descriptor("assessSkillRisk", skillIntentSchema, z.union([
    successSchema(z.object({ assessment: riskAssessmentSchema }).strict()),
    failureSchema
  ])),
  descriptor("resolveMedia", resolveMediaRequestSchema, z.union([
    successSchema(z.object({ asset: mediaAssetSchema }).strict()),
    failureSchema
  ])),
  descriptor(
    "verifyProvenance",
    verifyProvenanceRequestSchema,
    z.union([
      successSchema(z.object({ verification: provenanceVerificationSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "verifyProvenanceBatch",
    z.object({ schemaVersion: z.literal(RPC_SCHEMA_VERSION), names: z.array(z.string()).min(1).max(20) }).strict(),
    z.union([
      successSchema(z.object({
        results: z.array(provenanceVerificationSchema),
        failures: z.array(provenanceBatchFailureSchema).optional()
      }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "checkUpdates",
    checkUpdatesRequestSchema,
    z.union([
      successSchema(z.object({ checks: z.array(updateCheckSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "update",
    updateSkillRequestSchema,
    z.union([successSchema(mutationResultSchema), failureSchema])
  ),
  descriptor(
    "listBackups",
    listBackupsRequestSchema,
    z.union([
      successSchema(z.object({ backups: z.array(backupSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "rollback",
    rollbackSkillRequestSchema,
    z.union([successSchema(mutationResultSchema), failureSchema])
  ),
  descriptor(
    "delete",
    deleteSkillRequestSchema,
    z.union([successSchema(z.object({
      deleted: z.object({
        name: z.string(),
        trashId: z.uuid(),
        deletedAt: z.string()
      }).strict()
    }).strict()), failureSchema])
  ),
  descriptor(
    "listTrash",
    versionedRequestSchema,
    z.union([
      successSchema(z.object({ trashed: z.array(trashedSkillSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "restoreTrash",
    restoreTrashRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  ),
  descriptor(
    "discoverExternal",
    discoverExternalRequestSchema,
    z.union([successSchema(z.object({ candidates: z.array(externalCandidateSchema) }).strict()), failureSchema])
  ),
  descriptor(
    "importExternal",
    importExternalRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  ),
  descriptor(
    "listTargetStates",
    listTargetStatesRequestSchema,
    z.union([successSchema(z.object({ states: z.array(targetStateSchema) }).strict()), failureSchema])
  ),
  descriptor(
    "setTargetEnabled",
    setTargetEnabledRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  )
];
var TYPERT = {
  package: PACKAGE_NAME,
  face: "host",
  schemas: [],
  invocations: skillManagerDescriptors,
  model: {
    services: [],
    events: [],
    objects: []
  }
};

// src/index.ts
var _setTargetEnabled_dec, _listTargetStates_dec, _importExternal_dec, _discoverExternal_dec, _restoreTrash_dec, _listTrash_dec, _delete_dec, _rollback_dec, _listBackups_dec, _update_dec, _checkUpdates_dec, _verifyProvenanceBatch_dec, _verifyProvenance_dec, _resolveMedia_dec, _assessSkillRisk_dec, _installRepository_dec, _installSkill_dec, _inspectRepository_dec, _browseRepositories_dec, _searchRepositories_dec, _getCapabilities_dec, _setEnabled_dec, _create_dec, _list_dec, _a2, _init;
var DshSkillManagerService = class extends (_a2 = TypertRemoteService, _list_dec = [Remote("list")], _create_dec = [Remote("create")], _setEnabled_dec = [Remote("setEnabled")], _getCapabilities_dec = [Remote("getCapabilities")], _searchRepositories_dec = [Remote("searchRepositories")], _browseRepositories_dec = [Remote("browseRepositories")], _inspectRepository_dec = [Remote("inspectRepository")], _installSkill_dec = [Remote("installSkill")], _installRepository_dec = [Remote("installRepository")], _assessSkillRisk_dec = [Remote("assessSkillRisk")], _resolveMedia_dec = [Remote("resolveMedia")], _verifyProvenance_dec = [Remote("verifyProvenance")], _verifyProvenanceBatch_dec = [Remote("verifyProvenanceBatch")], _checkUpdates_dec = [Remote("checkUpdates")], _update_dec = [Remote("update")], _listBackups_dec = [Remote("listBackups")], _rollback_dec = [Remote("rollback")], _delete_dec = [Remote("delete")], _listTrash_dec = [Remote("listTrash")], _restoreTrash_dec = [Remote("restoreTrash")], _discoverExternal_dec = [Remote("discoverExternal")], _importExternal_dec = [Remote("importExternal")], _listTargetStates_dec = [Remote("listTargetStates")], _setTargetEnabled_dec = [Remote("setTargetEnabled")], _a2) {
  constructor(ctx, config = {}) {
    super(ctx, "skillManager");
    __runInitializers(_init, 5, this);
    __publicField(this, "handlers");
    const targetRoots = resolveTargetRoots2(config);
    const marketplaceFetch = createHostMarketplaceFetch();
    const skillsShMarketplace = createSkillsShMarketplaceSource({ fetch: marketplaceFetch });
    const githubMarketplace = createGitHubMarketplaceSource({
      fetch: marketplaceFetch,
      timeoutMs: 25e3
    });
    const huggingFaceMarketplace = createHuggingFaceMarketplaceSource({ fetch: marketplaceFetch });
    const trendingDiscovery = createGitHubTrendingDiscovery({ fetch: marketplaceFetch });
    const repositoryDiscovery = createGitHubRepositoryDiscovery({ fetch: marketplaceFetch, trending: trendingDiscovery });
    const managerRoot = resolveManagerRoot(config);
    const snapshotCache = createGitHubSnapshotCache({
      fetch: marketplaceFetch,
      cacheRoot: join4(managerRoot, "cache", "github-snapshots")
    });
    const baseRepositoryInspector = createGitHubRepositoryInspector({ fetch: marketplaceFetch, snapshotCache });
    const snapshotResolver = createGitHubSnapshotResolver({ fetch: marketplaceFetch, snapshotCache });
    const githubSkillIndex = createGitHubSkillIndex({
      path: join4(managerRoot, "cache", "github-skill-index", "v1.json")
    });
    const riskAssessor = createStaticSkillRiskAssessor({ fetch: marketplaceFetch, snapshotCache });
    const mediaResolver = createGitHubMediaResolver({ fetch: marketplaceFetch, snapshotCache });
    const repositoryInspector = {
      async inspectRepository(request) {
        const assessments = [];
        const batch = await snapshotResolver.resolveRepositorySnapshots?.({ repository: request.repository });
        if (batch !== void 0) {
          const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
          for (const resolved of batch.snapshots) {
            await githubSkillIndex.record({
              repositoryId: resolved.repository.repositoryId,
              nodeId: resolved.repository.nodeId,
              repository: { owner: resolved.repository.owner, name: resolved.repository.name },
              skillPath: resolved.skill.path,
              skillName: resolved.skill.name,
              fingerprint: fingerprintSkillFiles(resolved.files),
              commitSha: resolved.snapshot.commitSha,
              skillDocumentBlobSha: resolved.snapshot.skillDocumentBlobSha,
              bundleHash: resolved.snapshot.bundleHash,
              manifestFiles: [...resolved.skill.manifestFiles],
              observedAt: batch.inspection.inspectedAt,
              verifiedAt
            });
            assessments.push({ skillPath: resolved.skill.path, assessment: riskAssessor.assessResolvedSkillRisk(resolved) });
          }
          return { inspection: batch.inspection, assessments };
        }
        return { inspection: await baseRepositoryInspector.inspectRepository(request), assessments };
      }
    };
    this.handlers = createSkillManagerRpcHandlers({
      manager: createSkillManager({
        root: managerRoot,
        dshRoot: resolveDshRoot(config),
        targetRoots,
        fetch: marketplaceFetch,
        githubSkillIndex,
        snapshotCache,
        snapshotResolver,
        riskAssessor
      }),
      marketplace: createCompositeMarketplaceSource({
        sources: [
          { kind: "skills-sh", source: skillsShMarketplace },
          { kind: "github", source: githubMarketplace },
          { kind: "hugging-face", source: huggingFaceMarketplace }
        ]
      }),
      provenanceMarketplace: createCompositeMarketplaceSource({
        sources: [
          { kind: "skills-sh", source: skillsShMarketplace },
          { kind: "github", source: githubMarketplace },
          { kind: "hugging-face", source: huggingFaceMarketplace }
        ]
      }),
      resolver: createGitHubMarketplaceResolver({ fetch: marketplaceFetch }),
      repositoryDiscovery,
      repositoryInspector,
      snapshotResolver,
      riskAssessor,
      mediaResolver,
      buildId: "dsh-skill-manager@0.0.0+quota-safe-market"
    });
  }
  list(request) {
    return this.handlers.list(request);
  }
  create(request) {
    return this.handlers.create(request);
  }
  setEnabled(request) {
    return this.handlers.setEnabled(request);
  }
  getCapabilities(request) {
    return this.handlers.getCapabilities(request);
  }
  searchRepositories(request) {
    return this.handlers.searchRepositories(request);
  }
  browseRepositories(request) {
    return this.handlers.browseRepositories(request);
  }
  inspectRepository(request) {
    return this.handlers.inspectRepository(request);
  }
  installSkill(request) {
    return this.handlers.installSkill(request);
  }
  installRepository(request) {
    return this.handlers.installRepository(request);
  }
  assessSkillRisk(request) {
    return this.handlers.assessSkillRisk(request);
  }
  resolveMedia(request) {
    return this.handlers.resolveMedia(request);
  }
  verifyProvenance(request) {
    return this.handlers.verifyProvenance(request);
  }
  verifyProvenanceBatch(request) {
    return this.handlers.verifyProvenanceBatch(request);
  }
  checkUpdates(request) {
    return this.handlers.checkUpdates(request);
  }
  update(request) {
    return this.handlers.update(request);
  }
  listBackups(request) {
    return this.handlers.listBackups(request);
  }
  rollback(request) {
    return this.handlers.rollback(request);
  }
  delete(request) {
    return this.handlers.delete(request);
  }
  listTrash(request) {
    return this.handlers.listTrash(request);
  }
  restoreTrash(request) {
    return this.handlers.restoreTrash(request);
  }
  discoverExternal(request) {
    return this.handlers.discoverExternal(request);
  }
  importExternal(request) {
    return this.handlers.importExternal(request);
  }
  listTargetStates(request) {
    return this.handlers.listTargetStates(request);
  }
  setTargetEnabled(request) {
    return this.handlers.setTargetEnabled(request);
  }
};
_init = __decoratorStart(_a2);
__decorateElement(_init, 1, "list", _list_dec, DshSkillManagerService);
__decorateElement(_init, 1, "create", _create_dec, DshSkillManagerService);
__decorateElement(_init, 1, "setEnabled", _setEnabled_dec, DshSkillManagerService);
__decorateElement(_init, 1, "getCapabilities", _getCapabilities_dec, DshSkillManagerService);
__decorateElement(_init, 1, "searchRepositories", _searchRepositories_dec, DshSkillManagerService);
__decorateElement(_init, 1, "browseRepositories", _browseRepositories_dec, DshSkillManagerService);
__decorateElement(_init, 1, "inspectRepository", _inspectRepository_dec, DshSkillManagerService);
__decorateElement(_init, 1, "installSkill", _installSkill_dec, DshSkillManagerService);
__decorateElement(_init, 1, "installRepository", _installRepository_dec, DshSkillManagerService);
__decorateElement(_init, 1, "assessSkillRisk", _assessSkillRisk_dec, DshSkillManagerService);
__decorateElement(_init, 1, "resolveMedia", _resolveMedia_dec, DshSkillManagerService);
__decorateElement(_init, 1, "verifyProvenance", _verifyProvenance_dec, DshSkillManagerService);
__decorateElement(_init, 1, "verifyProvenanceBatch", _verifyProvenanceBatch_dec, DshSkillManagerService);
__decorateElement(_init, 1, "checkUpdates", _checkUpdates_dec, DshSkillManagerService);
__decorateElement(_init, 1, "update", _update_dec, DshSkillManagerService);
__decorateElement(_init, 1, "listBackups", _listBackups_dec, DshSkillManagerService);
__decorateElement(_init, 1, "rollback", _rollback_dec, DshSkillManagerService);
__decorateElement(_init, 1, "delete", _delete_dec, DshSkillManagerService);
__decorateElement(_init, 1, "listTrash", _listTrash_dec, DshSkillManagerService);
__decorateElement(_init, 1, "restoreTrash", _restoreTrash_dec, DshSkillManagerService);
__decorateElement(_init, 1, "discoverExternal", _discoverExternal_dec, DshSkillManagerService);
__decorateElement(_init, 1, "importExternal", _importExternal_dec, DshSkillManagerService);
__decorateElement(_init, 1, "listTargetStates", _listTargetStates_dec, DshSkillManagerService);
__decorateElement(_init, 1, "setTargetEnabled", _setTargetEnabled_dec, DshSkillManagerService);
__decoratorMetadata(_init, DshSkillManagerService);
__publicField(DshSkillManagerService, "inject", []);
function resolveManagerRoot(config, environment = process.env) {
  if (config.root?.trim()) return resolve3(config.root);
  const dshHome = environment.DSH_HOME?.trim() || join4(environment.HOME || environment.USERPROFILE || process.cwd(), ".dsh");
  return resolve3(dshHome, "skill-manager");
}
function resolveTargetRoots2(config, environment = process.env) {
  const userHome = environment.HOME || environment.USERPROFILE || process.cwd();
  return {
    codex: resolve3(config.codexRoot?.trim() || join4(userHome, ".codex", "skills")),
    claude: resolve3(config.claudeRoot?.trim() || join4(userHome, ".claude", "skills")),
    agents: resolve3(config.agentsRoot?.trim() || join4(userHome, ".agents", "skills")),
    opencode: resolve3(config.opencodeRoot?.trim() || join4(userHome, ".config", "opencode", "skills"))
  };
}
function resolveDshRoot(config, environment = process.env) {
  if (config.dshRoot?.trim()) return resolve3(config.dshRoot);
  const dshHome = environment.DSH_HOME?.trim() || join4(environment.HOME || environment.USERPROFILE || process.cwd(), ".dsh");
  return resolve3(dshHome, "skills");
}
var index_default = DshSkillManagerService;
export {
  DshSkillManagerService,
  RPC_SCHEMA_VERSION,
  TYPERT,
  createSkillManagerRpcHandlers,
  index_default as default,
  resolveDshRoot,
  resolveManagerRoot,
  resolveTargetRoots2 as resolveTargetRoots,
  skillManagerDescriptors
};
