window.__ModuleLoader__.load({ id: "billion-context", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/agent/dsh-native-client.ts
var dsh_native_client_exports = {};
__export(dsh_native_client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(dsh_native_client_exports);
var import_react = require("react");
var inject = ["slots", "locale"];
var NS = "bili";
var ORIGIN_PATH = "/bili/origin";
var POLL_INTERVAL_MS = 3e3;
var POLL_MAX_ATTEMPTS = 10;
var SLOW_POLL_INTERVAL_MS = 1e4;
var PAGE_IDS = ["overview", "sessions", "config", "logs", "updates", "blog"];
var PAGE_KEYS = {
  overview: "tab_overview",
  sessions: "tab_sessions",
  config: "tab_config",
  logs: "tab_logs",
  updates: "tab_updates",
  blog: "tab_blog"
};
var REMOTE_RELAY_SNIPPET = '"security": { "adminRelay": true }';
var EMBED_HEIGHT = "min(640px, 78vh)";
var ACTION_BTN_STYLE = {
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid rgba(127,127,127,0.4)",
  background: "transparent",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: "22px",
  padding: "7px 16px",
  whiteSpace: "nowrap"
};
var CTX_STATUS_PATH = "/__bili/plugin/status?conversationId=dsh&fallback=latest";
var ctxStatusPathFor = (hostSessionId) => hostSessionId === void 0 ? CTX_STATUS_PATH : `/__bili/plugin/status?conversationId=${encodeURIComponent(hostSessionId)}&fallback=latest`;
var CTX_POLL_MS = 1e4;
var UPSTREAM_POLL_MS = 1e4;
function parseCtxStatus(raw) {
  const o = raw !== null && typeof raw === "object" ? raw : null;
  if (o === null || typeof o.ok !== "boolean") return void 0;
  return {
    ok: o.ok,
    phase: typeof o.phase === "string" ? o.phase : void 0,
    panelPresent: o.panel !== void 0,
    sessionId: typeof o.sessionId === "string" && o.sessionId.length > 0 ? o.sessionId : null,
    conversationId: typeof o.conversationId === "string" && o.conversationId.length > 0 ? o.conversationId : null,
    viaFallback: o.viaFallback === true
  };
}
function renderRemoteBlock(t, origin, errorReadout) {
  const cfgUrl = `${origin}/__bili/#/config`;
  return (0, import_react.createElement)(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" } },
    (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t("remote_blocked")),
    (0, import_react.createElement)(
      "code",
      {
        style: {
          display: "block",
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid rgba(127,127,127,0.4)",
          background: "rgba(127,127,127,0.08)",
          fontSize: 13,
          lineHeight: 1.6
        }
      },
      REMOTE_RELAY_SNIPPET
    ),
    (0, import_react.createElement)(
      "button",
      { type: "button", title: cfgUrl, onClick: () => openExternal(cfgUrl), style: ACTION_BTN_STYLE },
      t("remote_open_config")
    ),
    errorReadout ?? null
  );
}
function openWebButton(origin, t, style) {
  return origin === void 0 ? null : (0, import_react.createElement)(
    "button",
    {
      type: "button",
      title: origin,
      onClick: () => openExternal(`${origin}/__bili/`),
      style: { ...ACTION_BTN_STYLE, ...style }
    },
    t("open")
  );
}
function describeProbeError(err, url) {
  let msg;
  const o = err !== null && typeof err === "object" ? err : void 0;
  if (o !== void 0 && typeof o.message === "string" && o.message.length > 0) {
    msg = o.message;
  } else if (typeof err === "string" && err.length > 0) {
    msg = err;
  } else {
    try {
      msg = String(err);
    } catch {
      msg = "unknown error";
    }
  }
  return `${msg} (${url})`;
}
function copyText(text) {
  const g = globalThis;
  const legacy = () => {
    const doc = g.document;
    if (!doc || typeof doc.createElement !== "function" || !doc.body || typeof doc.body.appendChild !== "function") return false;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.style = { position: "fixed", opacity: 0 };
    doc.body.appendChild(ta);
    try {
      ta.select?.();
    } catch {
    }
    const ok = doc.execCommand?.("copy") ?? false;
    try {
      doc.body.removeChild?.(ta);
    } catch {
    }
    return ok;
  };
  const clip = g.navigator?.clipboard;
  if (clip !== void 0 && typeof clip.writeText === "function") {
    return clip.writeText(text).then(
      () => true,
      () => legacy()
    );
  }
  return Promise.resolve(legacy());
}
function renderProbeError(t, error, copied, onCopy) {
  return (0, import_react.createElement)(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" } },
    (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t("probe_error")),
    (0, import_react.createElement)(
      "code",
      {
        style: {
          display: "block",
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid rgba(127,127,127,0.4)",
          background: "rgba(127,127,127,0.08)",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }
      },
      error
    ),
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        title: error,
        onClick: onCopy,
        style: { ...ACTION_BTN_STYLE, fontSize: 13, lineHeight: "20px", padding: "4px 14px" }
      },
      copied ? t("copied") : t("copy")
    )
  );
}
function hintColumn(hint, box) {
  return box === null ? hint : (0, import_react.createElement)(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" } },
    hint,
    box
  );
}
var EMBED_PROBE_PATH = "/__bili/?embed=1";
var embedVerdicts = /* @__PURE__ */ new Map();
var embedProbesInFlight = /* @__PURE__ */ new Set();
function probeEmbedRoute(origin, onVerdict) {
  if (typeof fetch !== "function") return;
  const cached = embedVerdicts.get(origin);
  if (cached !== void 0) {
    onVerdict({ origin, verdict: cached });
    return;
  }
  if (embedProbesInFlight.has(origin)) return;
  embedProbesInFlight.add(origin);
  void fetch(`${origin}${EMBED_PROBE_PATH}`).then((res) => {
    let html = false;
    try {
      const ct = typeof res.headers.get === "function" ? res.headers.get("content-type") : "";
      html = res.ok && String(ct ?? "").includes("text/html");
    } catch {
      html = false;
    }
    const verdict = html ? "ok" : "stale";
    embedVerdicts.set(origin, verdict);
    try {
      void res.body?.cancel?.().catch(() => {
      });
    } catch {
    }
    onVerdict({ origin, verdict });
  }).catch((err) => {
    onVerdict({ origin, verdict: void 0, error: describeProbeError(err, `${origin}${EMBED_PROBE_PATH}`) });
  }).finally(() => {
    embedProbesInFlight.delete(origin);
  });
}
function detectHostTheme() {
  const g = globalThis;
  try {
    const doc = g.document;
    if (!doc || typeof g.getComputedStyle !== "function") return void 0;
    const candidates = [];
    if (doc.documentElement) candidates.push(doc.documentElement);
    if (doc.body) candidates.push(doc.body);
    try {
      for (const sel of ["main", "[role=main]", "#root", "#app"]) {
        const el = doc.body?.querySelector?.(sel);
        if (typeof el === "object" && el !== null) candidates.push(el);
      }
    } catch {
    }
    let lightVotes = 0;
    let darkVotes = 0;
    for (const c of candidates) {
      let bg;
      try {
        const v = g.getComputedStyle(c).backgroundColor;
        if (typeof v !== "string") continue;
        bg = v;
      } catch {
        continue;
      }
      const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\/\s]+([\d.]+))?\)/.exec(bg);
      if (!m) continue;
      const alpha = m[4] !== void 0 ? Number(m[4]) : 1;
      if (alpha <= 0.5) continue;
      const luma = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      if (luma <= 0.4) darkVotes += 1;
      else lightVotes += 1;
    }
    if (darkVotes !== lightVotes && (darkVotes > 0 || lightVotes > 0)) return darkVotes > lightVotes ? "dark" : "light";
  } catch {
    return void 0;
  }
  try {
    const mq = g.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) return mq.matches ? "dark" : "light";
  } catch {
  }
  return void 0;
}
var zh = {
  "nav": "bili\u8BBE\u7F6E",
  "title": "billion-context \u538B\u7F29\u4EE3\u7406",
  "open": "\u6253\u5F00 Web UI",
  "hint": "\u67E5\u770B\u538B\u7F29\u72B6\u6001\u3001\u4F1A\u8BDD\u4E0E\u4E0A\u4E0B\u6587\u7A97\u53E3\u3002",
  "degraded": "\u5F53\u524D dsh \u8FDB\u7A0B\u672A\u7ED1\u5B9A bili \u4EE3\u7406\uFF08\u672A\u7ECF bili dsh \u542F\u52A8\uFF0C\u6216\u4EE3\u7406\u5C1A\u672A\u5C31\u7EEA\uFF09\u2014\u2014\u5148\u8FD0\u884C /acp\uFF0C\u6216\u6539\u7528 bili dsh \u542F\u52A8\u3002",
  "connecting": "\u6B63\u5728\u8FDE\u63A5 bili \u4EE3\u7406\u2026",
  "stale": "\u8FD0\u884C\u4E2D\u7684 bili \u4EE3\u7406\u6BD4\u5DF2\u5B89\u88C5\u7684\u914D\u7F6E\u6587\u4EF6\u65E7\uFF1A\u672C\u9875\u9762\u5DF2\u52A0\u8F7D\u65B0\u7248\u754C\u9762\uFF0C\u4F46\u4EE3\u7406\u8FDB\u7A0B\u4ECD\u5728\u63D0\u4F9B\u65E7\u7248\u670D\u52A1\uFF0C\u6682\u65F6\u65E0\u6CD5\u6253\u5F00\u5185\u5D4C\u9875\u9762\u3002\u82E5\u672C\u5E94\u7528\u5DF2\u8FD0\u884C\u65B0\u7248\u672C\uFF0C\u542F\u52A8\u4E00\u4E2A\u65B0\u4F1A\u8BDD\u5373\u4F1A\u81EA\u52A8\u6362\u4E0A\u65B0\u4EE3\u7406\uFF08\u4E5F\u53EF\u624B\u52A8\u7ED3\u675F\u65E7\u4EE3\u7406\u8FDB\u7A0B\u7ACB\u5373\u751F\u6548\uFF09\uFF1B\u82E5\u5E94\u7528\u672C\u8EAB\u8FD8\u662F\u65E7\u7248\u672C\uFF0C\u8BF7\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u65B0\u542F\u52A8 dsh\u3002\u6062\u590D\u524D\u53EF\u70B9\u4E0B\u65B9\u6309\u94AE\u76F4\u63A5\u6253\u5F00 Web UI\u3002",
  "remote_blocked": "\u672C\u9875\u9762\u901A\u8FC7\u8FDC\u7A0B\u5730\u5740\u8BBF\u95EE\uFF0C\u800C bili \u9762\u677F\u8FD0\u884C\u5728\u670D\u52A1\u5668\u672C\u673A\u7684\u56DE\u73AF\u5730\u5740\uFF08127.0.0.1\uFF09\u4E0A\u2014\u2014\u4F60\u7684\u6D4F\u89C8\u5668\u65E0\u6CD5\u76F4\u8FDE\u5B83\uFF08\u76F4\u8FDE\u4F1A\u6307\u5411\u4F60\u81EA\u5DF1\u7684\u7535\u8111\uFF09\u3002\u8981\u8FDC\u7A0B\u6253\u5F00\u9762\u677F\uFF1A\u5728\u670D\u52A1\u5668\u4E0A\u7F16\u8F91 ~/.config/billion-context/billion-context.json\uFF0C\u5411\u9876\u5C42\u5BF9\u8C61\u52A0\u5165\u4E0B\u65B9\u5B57\u6BB5\u5E76\u4FDD\u5B58\u2014\u2014\u672C\u9875\u4F1A\u5728\u6570\u79D2\u5185\u81EA\u52A8\u751F\u6548\uFF08\u65E0\u9700\u91CD\u542F dsh\uFF0C\u5237\u65B0\u9875\u9762\u540C\u6837\u53EF\u4EE5\uFF09\uFF1B\u82E5\u4F60\u80FD\u76F4\u63A5\u8BBF\u95EE\u8BE5\u9762\u677F\u5730\u5740\uFF0C\u4E5F\u53EF\u70B9\u4E0B\u65B9\u6309\u94AE\u5728\u914D\u7F6E\u9875\u5F00\u542F\u3002",
  "remote_open_config": "\u6253\u5F00\u914D\u7F6E\u9875",
  "tab_overview": "\u603B\u89C8",
  "tab_sessions": "\u4F1A\u8BDD",
  "tab_config": "\u914D\u7F6E",
  "tab_logs": "\u65E5\u5FD7",
  "tab_updates": "\u7248\u672C",
  "tab_blog": "\u535A\u5BA2",
  "tab_ctx": "\u4E0A\u4E0B\u6587",
  "ctx_waiting": "\u7B49\u5F85\u9996\u4E2A\u6A21\u578B\u8BF7\u6C42\u2026",
  "ctx_nodata": "\u6682\u65E0\u4E0A\u4E0B\u6587\u6570\u636E\u2014\u2014\u5B8C\u6210\u4E00\u6B21\u6A21\u578B\u8BF7\u6C42\u540E\u81EA\u52A8\u5237\u65B0\u3002",
  "ctx_refresh": "\u5237\u65B0",
  "upstreams_label": "bili \u4E0A\u6E38\u72B6\u6001",
  "upstreams_down_one": "1 \u4E2A\u4E0A\u6E38\u4E0D\u53EF\u7528",
  "upstreams_down_many": "{n} \u4E2A\u4E0A\u6E38\u4E0D\u53EF\u7528",
  "upstream_retry_hint": "\u7EA6 {s}s \u540E\u91CD\u8BD5",
  "probe_error": "\u8FDE\u63A5 bili \u4EE3\u7406\u5931\u8D25\u2014\u2014\u6700\u8FD1\u4E00\u6B21\u63A2\u6D4B\u62A5\u51FA\u7684\u9519\u8BEF\uFF08\u53EF\u590D\u5236\uFF0C\u4FBF\u4E8E\u53CD\u9988\uFF09\uFF1A",
  "copy": "\u590D\u5236",
  "copied": "\u5DF2\u590D\u5236"
};
var en = {
  "nav": "bili",
  "title": "billion-context compression proxy",
  "open": "Open Web UI",
  "hint": "Inspect compression status, sessions and context windows.",
  "degraded": "This dsh process is not bound to a bili proxy (not launched via bili dsh, or the proxy is not up yet) \u2014 run /acp first, or launch through bili dsh.",
  "connecting": "Connecting to the bili proxy\u2026",
  "stale": "The running bili proxy is older than the installed profile: this page already runs the new face, but the proxy process still serves the old build, so the embedded page cannot be opened yet. If this app itself runs the new version, starting a new session swaps in the new proxy automatically (or kill the old proxy process manually for an immediate switch); if the app itself is still on the old version, fully quit and relaunch dsh. Until then, use the button below to open the Web UI directly.",
  "remote_blocked": "This page is reached through a remote address, but the bili panel runs on the server's own loopback address (127.0.0.1) \u2014 your browser cannot reach it directly (it would point at your own machine). To open the panel remotely: edit ~/.config/billion-context/billion-context.json on the server and add the field below to the top-level object \u2014 this page picks it up within seconds (no dsh restart needed; reloading works too); if you CAN reach that panel address directly, use the button below to enable it from the config page.",
  "remote_open_config": "Open config page",
  "tab_overview": "Overview",
  "tab_sessions": "Sessions",
  "tab_config": "Config",
  "tab_logs": "Logs",
  "tab_updates": "Versions",
  "tab_blog": "Blog",
  "tab_ctx": "Context",
  "ctx_waiting": "Waiting for the first model request\u2026",
  "ctx_nodata": "No context data yet \u2014 refreshes automatically after the first model request.",
  "ctx_refresh": "Refresh",
  "upstreams_label": "bili upstream status",
  "upstreams_down_one": "1 upstream unavailable",
  "upstreams_down_many": "{n} upstreams unavailable",
  "upstream_retry_hint": "~{s}s until retry",
  "probe_error": "Failed to reach the bili proxy \u2014 last probe error (copyable for reporting):",
  "copy": "Copy",
  "copied": "Copied"
};
function readOrigin() {
  const g = globalThis;
  const snap = g.__BILI__;
  if (snap !== void 0 && snap.relay === true) return "";
  const origin = snap?.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : void 0;
}
function readCtxTabFace() {
  const g = globalThis;
  const snap = g.__BILI__;
  const hidden = snap !== void 0 && snap.contextTab === false;
  const raw = snap?.contextTabLabel;
  const label = typeof raw === "string" && raw.trim().length > 0 ? raw : void 0;
  return { hidden, label };
}
function openExternal(url) {
  const w = globalThis;
  if (typeof w.open === "function") w.open(url, "_blank", "noopener,noreferrer");
}
function relayBaseOf(res) {
  const url = typeof res.url === "string" ? res.url : "";
  if (url.endsWith(ORIGIN_PATH)) {
    const base = url.slice(0, -ORIGIN_PATH.length).replace(/\/+$/, "");
    return base.length > 0 ? base : "";
  }
  return "";
}
function isLoopbackHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
function remoteMismatch(origin) {
  if (origin === void 0 || origin.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const originHost = typeof parsed.hostname === "string" ? parsed.hostname : "";
  if (!isLoopbackHost(originHost)) return false;
  const g = globalThis;
  const pageHost = typeof g.location?.hostname === "string" ? g.location.hostname : "";
  return pageHost.length > 0 && !isLoopbackHost(pageHost);
}
function parseUpstreamHealth(raw) {
  if (typeof raw !== "object" || raw === null) return [];
  const list = raw.upstreams;
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const o = item;
    const host = typeof o.host === "string" && o.host.length > 0 ? o.host : void 0;
    if (host === void 0) continue;
    const kind = typeof o.kind === "string" && o.kind.length > 0 ? o.kind : "unknown";
    const code = typeof o.code === "string" && o.code.length > 0 ? o.code : void 0;
    const count = typeof o.count === "number" && Number.isFinite(o.count) ? Math.max(0, Math.round(o.count)) : 0;
    const circuit = typeof o.circuit === "object" && o.circuit !== null ? o.circuit : void 0;
    const probe = circuit !== void 0 && circuit.state === "open" && typeof circuit.nextProbeInMs === "number" && Number.isFinite(circuit.nextProbeInMs) ? Math.max(0, circuit.nextProbeInMs) : void 0;
    rows.push({ host, kind, code, count, ...probe !== void 0 ? { nextProbeInMs: probe } : {} });
  }
  return rows;
}
var winningProbeForm;
function probeForms() {
  if (winningProbeForm !== void 0) return [winningProbeForm];
  const doc = globalThis.document;
  const baseURI = typeof doc?.baseURI === "string" && doc.baseURI.length > 0 ? doc.baseURI : void 0;
  if (baseURI === void 0) return [ORIGIN_PATH];
  try {
    const fallback = new URL("bili/origin", baseURI).toString();
    return fallback === ORIGIN_PATH ? [ORIGIN_PATH] : [ORIGIN_PATH, fallback];
  } catch {
    return [ORIGIN_PATH];
  }
}
function probeOrigin(onOrigin, onTheme, onTick) {
  if (typeof fetch !== "function") return () => {
  };
  let cancelled = false;
  let settled = false;
  let timer;
  let attempts = 0;
  const poll = async () => {
    let sawOk = false;
    for (const form of probeForms()) {
      try {
        const res = await fetch(form);
        if (!res.ok) continue;
        sawOk = true;
        const data = await res.json();
        let bind;
        if (data.relay === true) bind = relayBaseOf(res);
        else if (typeof data.origin === "string" && data.origin.length > 0) bind = data.origin;
        if (bind !== void 0 && !cancelled) {
          winningProbeForm = form;
          onOrigin(bind);
          settled = true;
          if (onTick !== void 0) onTick(bind);
          break;
        }
      } catch {
      }
    }
    if (sawOk && onTheme && !cancelled) {
      const theme = detectHostTheme();
      if (theme !== void 0) onTheme(theme);
    }
    if (cancelled) return;
    attempts += 1;
    const delay = !settled && attempts < POLL_MAX_ATTEMPTS ? POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
    if (!cancelled) timer = setTimeout(() => void poll(), delay);
  };
  void poll();
  return () => {
    cancelled = true;
    if (timer !== void 0) clearTimeout(timer);
  };
}
function apply(ctx) {
  const zhDict = zh;
  const enDict = en;
  ctx.effect(
    () => ctx.locale.register(NS, { zh: zhDict, en: enDict }),
    "bili: dictionaries"
  );
  const t = ctx.locale.bind(NS);
  const contextPanel = () => (props) => {
    const hostSessionId = props !== void 0 && typeof props.sessionId === "string" && props.sessionId.length > 0 ? props.sessionId : void 0;
    const statusPath = ctxStatusPathFor(hostSessionId);
    const [origin, setOrigin] = (0, import_react.useState)(readOrigin());
    const [theme, setTheme] = (0, import_react.useState)(detectHostTheme);
    const [embed, setEmbed] = (0, import_react.useState)(() => {
      const o = readOrigin();
      const v = o !== void 0 ? embedVerdicts.get(o) : void 0;
      return o !== void 0 && v !== void 0 ? { origin: o, verdict: v } : void 0;
    });
    const [sessionId, setSessionId] = (0, import_react.useState)(null);
    const [status, setStatus] = (0, import_react.useState)(void 0);
    const [fetchFailed, setFetchFailed] = (0, import_react.useState)(false);
    const [statusError, setStatusError] = (0, import_react.useState)(void 0);
    const [copied, setCopied] = (0, import_react.useState)(false);
    const [reloadTick, setReloadTick] = (0, import_react.useState)(0);
    (0, import_react.useEffect)(() => probeOrigin((o) => {
      setOrigin(o);
      probeEmbedRoute(o, setEmbed);
    }, setTheme, (o) => probeEmbedRoute(o, setEmbed)), []);
    (0, import_react.useEffect)(() => {
      if (origin !== void 0) probeEmbedRoute(origin, setEmbed);
    }, [origin]);
    (0, import_react.useEffect)(() => {
      if (origin === void 0) return;
      let cancelled = false;
      const load = () => {
        void fetch(`${origin}${statusPath}`).then((res) => {
          if (res.ok !== true) throw new Error(`HTTP ${typeof res.status === "number" ? res.status : "?"}`);
          return res.json();
        }).then((raw) => {
          if (cancelled) return;
          const parsed = parseCtxStatus(raw);
          setStatus(parsed);
          setFetchFailed(parsed === void 0);
          setStatusError(void 0);
          setSessionId(parsed !== void 0 && parsed.sessionId !== null ? parsed.sessionId : null);
        }).catch((err) => {
          if (!cancelled) {
            setStatus(void 0);
            setFetchFailed(true);
            setStatusError(describeProbeError(err, `${origin}${statusPath}`));
          }
        });
      };
      load();
      const timer = setInterval(load, CTX_POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [origin, reloadTick, statusPath]);
    const liveEmbed = embed !== void 0 && embed.origin === origin ? embed.verdict : void 0;
    const liveEmbedError = embed !== void 0 && embed.origin === origin ? embed.error : void 0;
    const remoteBlocked = remoteMismatch(origin) && liveEmbed === void 0;
    const lang = t("nav") === zhDict.nav ? "zh" : "en";
    const sessionOurs = hostSessionId === void 0 || status === void 0 || status.viaFallback !== true || status.conversationId === hostSessionId;
    const framed = origin !== void 0 && liveEmbed === "ok" && sessionId !== null && sessionOurs;
    const hintP = (key) => (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t(key));
    const startCopy = (target) => {
      void copyText(target).then((ok) => {
        if (!ok) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2e3);
      });
    };
    const errorBox = (error) => error === void 0 ? null : renderProbeError(t, error, copied, () => startCopy(error));
    let middle;
    if (origin === void 0) {
      middle = hintP("degraded");
    } else if (remoteBlocked) {
      middle = renderRemoteBlock(t, origin, errorBox(liveEmbedError));
    } else if (liveEmbed === "stale") {
      middle = hintP("stale");
    } else if (framed) {
      middle = (0, import_react.createElement)(
        "iframe",
        {
          src: `${origin}/__bili/?embed=1&lang=${lang}${theme !== void 0 ? `&theme=${theme}` : ""}#/session/${encodeURIComponent(sessionId)}`,
          title: t("title"),
          style: {
            display: "block",
            flex: 1,
            width: "100%",
            height: "100%",
            minHeight: 0,
            border: "none",
            background: "transparent"
          }
        }
      );
    } else if (status?.ok === true && status.phase === "pre-first-request") {
      middle = hintP("ctx_waiting");
    } else if (status === void 0) {
      middle = hintColumn(hintP(fetchFailed ? "degraded" : "connecting"), errorBox(fetchFailed ? statusError : void 0));
    } else if (!status.ok) {
      middle = hintP("ctx_nodata");
    } else {
      middle = hintColumn(hintP(liveEmbed === "ok" ? "ctx_nodata" : "connecting"), errorBox(liveEmbedError));
    }
    return (0, import_react.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", height: "100%", minWidth: 0, minHeight: 0 } },
      origin !== void 0 ? (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0, padding: "8px 12px" } },
        (0, import_react.createElement)(
          "button",
          {
            type: "button",
            onClick: () => setReloadTick((x) => x + 1),
            style: { cursor: "pointer", borderRadius: 8, border: "1px solid rgba(127,127,127,0.4)", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: 13, lineHeight: "20px", padding: "4px 14px" }
          },
          t("ctx_refresh")
        ),
        openWebButton(origin, t, { fontSize: "13", lineHeight: "20px", padding: "4px 14px" })
      ) : null,
      (0, import_react.createElement)(
        "div",
        { style: framed ? { display: "flex", flex: 1, minHeight: 0 } : { flex: 1, minHeight: 0, padding: 16 } },
        middle
      )
    );
  };
  const panel = (titled) => () => {
    const [origin, setOrigin] = (0, import_react.useState)(readOrigin());
    const [page, setPage] = (0, import_react.useState)("overview");
    const [theme, setTheme] = (0, import_react.useState)(detectHostTheme);
    const [embed, setEmbed] = (0, import_react.useState)(() => {
      const o = readOrigin();
      const v = o !== void 0 ? embedVerdicts.get(o) : void 0;
      return o !== void 0 && v !== void 0 ? { origin: o, verdict: v } : void 0;
    });
    const [copied, setCopied] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(
      () => probeOrigin(
        (o) => {
          setOrigin(o);
          probeEmbedRoute(o, setEmbed);
        },
        setTheme,
        (o) => probeEmbedRoute(o, setEmbed)
      ),
      []
    );
    (0, import_react.useEffect)(() => {
      if (origin !== void 0) probeEmbedRoute(origin, setEmbed);
    }, [origin]);
    const liveEmbed = embed !== void 0 && embed.origin === origin ? embed.verdict : void 0;
    const liveEmbedError = embed !== void 0 && embed.origin === origin ? embed.error : void 0;
    const remoteBlocked = remoteMismatch(origin) && liveEmbed === void 0;
    const lang = t("nav") === zhDict.nav ? "zh" : "en";
    const startCopy = (target) => {
      void copyText(target).then((ok) => {
        if (!ok) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2e3);
      });
    };
    const errorBox = (error) => error === void 0 ? null : renderProbeError(t, error, copied, () => startCopy(error));
    let middle;
    if (origin === void 0) {
      middle = (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t("degraded"));
    } else if (remoteBlocked && origin !== void 0) {
      middle = renderRemoteBlock(t, origin, errorBox(liveEmbedError));
    } else if (liveEmbed === "stale") {
      middle = (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t("stale"));
    } else if (liveEmbed === "ok") {
      middle = (0, import_react.createElement)(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        (0, import_react.createElement)(
          "div",
          { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
          PAGE_IDS.map(
            (id) => (0, import_react.createElement)(
              "button",
              {
                key: id,
                type: "button",
                onClick: () => setPage(id),
                style: {
                  cursor: "pointer",
                  borderRadius: 8,
                  border: id === page ? "1px solid rgba(127,127,127,0.7)" : "1px solid rgba(127,127,127,0.4)",
                  background: id === page ? "rgba(127,127,127,0.12)" : "transparent",
                  color: "inherit",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: id === page ? 600 : 400,
                  lineHeight: "20px",
                  padding: "4px 14px"
                }
              },
              t(PAGE_KEYS[id])
            )
          ),
          // The open-in-browser action rides the TAB row — right
          // after the logs tab, pushed to the row's far end —
          // instead of sitting in the footer below the iframe.
          openWebButton(origin, t, { marginLeft: "auto", fontSize: "13", lineHeight: "20px", padding: "4px 14px" })
        ),
        (0, import_react.createElement)("iframe", {
          src: `${origin}/__bili/?embed=1&lang=${lang}${theme ? `&theme=${theme}` : ""}#/${page}`,
          title: t("title"),
          style: {
            display: "block",
            width: "100%",
            height: EMBED_HEIGHT,
            border: "1px solid rgba(127,127,127,0.4)",
            borderRadius: 8,
            background: "transparent"
          }
        })
      );
    } else {
      middle = hintColumn(
        (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, lineHeight: 1.6 } }, t("connecting")),
        errorBox(liveEmbedError)
      );
    }
    return (0, import_react.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 12, padding: "20px 8px" } },
      titled ? (0, import_react.createElement)("h3", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, t("title")) : null,
      middle,
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
        (0, import_react.createElement)("p", { style: { margin: 0, opacity: 0.7, fontSize: 13, lineHeight: 1.6, flex: 1, minWidth: 200 } }, t("hint")),
        // ok 状态:按钮在上方页签行(日志页签后面);degraded/stale
        // 仍留在页脚作后备入口(#2448 同一按钮)。#3816: remoteBlocked
        // 时按钮指向的正是那个够不到的回环地址——死链,一并隐藏。
        liveEmbed === "ok" || remoteBlocked ? null : openWebButton(origin, t)
      )
    );
  };
  const upstreamBanner = () => () => {
    const [origin, setOrigin] = (0, import_react.useState)(readOrigin());
    const [rows, setRows] = (0, import_react.useState)([]);
    (0, import_react.useEffect)(() => probeOrigin((o) => setOrigin(o)), []);
    (0, import_react.useEffect)(() => {
      if (origin === void 0) return;
      let cancelled = false;
      const load = () => {
        void fetch(`${origin}/__bili/upstreams`).then((res) => res.json()).then((raw) => {
          if (!cancelled) setRows(parseUpstreamHealth(raw));
        }).catch(() => {
          if (!cancelled) setRows([]);
        });
      };
      load();
      const timer = setInterval(load, UPSTREAM_POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [origin]);
    if (rows.length === 0) return null;
    const header = rows.length === 1 ? t("upstreams_down_one") : t("upstreams_down_many").replace("{n}", String(rows.length));
    return (0, import_react.createElement)(
      "div",
      { role: "status", style: { display: "flex", flexDirection: "column", gap: 4, maxWidth: 520, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(217,63,11,0.5)", background: "rgba(217,63,11,0.1)" } },
      (0, import_react.createElement)("div", { style: { fontSize: 13, fontWeight: 600 } }, header),
      ...rows.map((r) => {
        const code = r.code !== void 0 ? ` ${r.code}` : "";
        const s = r.nextProbeInMs !== void 0 ? Math.max(1, Math.ceil(r.nextProbeInMs / 1e3)) : void 0;
        const eta = s !== void 0 ? ` \xB7 ${t("upstream_retry_hint").replace("{s}", String(s))}` : "";
        return (0, import_react.createElement)("div", { key: r.host, style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.5 } }, `${r.host} \xB7 ${r.kind}${code} \xD7${r.count}${eta}`);
      })
    );
  };
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register({ name: "settings.section", id: "bili", order: 100, label: () => t("nav"), locale: NS }, panel(true))
  );
  ctx.slots.inject(
    "plugins.bundle.config",
    () => ctx.slots.register({ name: "plugins.bundle.config", key: "billion-context", locale: NS }, panel(false))
  );
  const ctxGate = readCtxTabFace();
  if (!ctxGate.hidden) {
    ctx.slots.inject(
      "conversation.view",
      () => ctx.slots.register({ name: "conversation.view", id: "bili-context", order: 30, label: () => ctxGate.label ?? t("tab_ctx"), locale: NS }, contextPanel())
    );
  }
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register({ name: "shell.overlay", id: "bili-upstreams", order: 100, label: () => t("upstreams_label"), locale: NS }, upstreamBanner())
  );
}

return module.exports;
}});
