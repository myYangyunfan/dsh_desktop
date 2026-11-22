/**
 * Proxy support for the local fetch layers.
 *
 * `fetch_provider.js` (T1 direct) and `fetch_upstream.js` (T2-T4) talk to the
 * network with plain `node:https`, deliberately: the crawl4ai gateway rejects
 * undici's fingerprint with an empty 401. That also means they never see the
 * undici global dispatcher, so a proxy installed by a DSH plugin that owns that
 * dispatcher (e.g. @tr1v3r/dsh-proxy) cannot reach them.
 *
 * This module reads the conventional proxy environment variables and hands the
 * transports a standard CONNECT tunnel agent, so those layers follow the same
 * proxy configuration as everything else. No dependencies: node:http/https/tls
 * only, and it degrades to "no proxy" when nothing is configured.
 *
 * Security note: when a request goes through a tunnel the proxy resolves the
 * hostname, so the SSRF `lookup` hook is bypassed. `httpsGetFollow` therefore
 * keeps validating every hop itself before the tunnel is opened.
 */
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const HTTPS_KEYS = ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"];
const HTTP_KEYS = ["http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"];
const NO_PROXY_KEYS = ["no_proxy", "NO_PROXY"];

function firstEnv(env, keys) {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function bareHost(hostname) {
  return String(hostname ?? "")
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

/**
 * Read proxy settings from the environment (lowercase wins, uppercase falls
 * back, empty string counts as unset).
 */
export function readProxyEnv(env = process.env) {
  return {
    http: firstEnv(env, HTTP_KEYS),
    https: firstEnv(env, HTTPS_KEYS),
    noProxy: firstEnv(env, NO_PROXY_KEYS),
  };
}

/**
 * `no_proxy` matcher: comma separated rules, optional leading dot, optional
 * port, `*` for everything. A rule matches the host itself and any subdomain.
 */
export function matchesNoProxy(hostname, noProxy, port = "") {
  const host = bareHost(hostname);
  if (!host) return false;
  for (const raw of String(noProxy ?? "").split(",")) {
    let rule = raw.trim().toLowerCase();
    if (!rule) continue;
    if (rule === "*") return true;
    const withPort = rule.match(/^(.*):(\d+)$/);
    if (withPort && !withPort[1].endsWith("]")) {
      rule = withPort[1];
      if (port && String(port) !== withPort[2]) continue;
    }
    rule = rule.replace(/^\[/, "").replace(/\]$/, "").replace(/^\./, "");
    if (!rule) continue;
    if (host === rule || host.endsWith("." + rule)) return true;
  }
  return false;
}

function isLoopback(hostname) {
  const host = bareHost(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Pick the proxy URL that applies to one target, or "" when the request must go
 * direct (loopback always bypasses; SOCKS URLs are not supported here).
 */
export function proxyForTarget(rawUrl, settings = readProxyEnv()) {
  const target = new URL(String(rawUrl));
  const hostname = bareHost(target.hostname);
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (isLoopback(hostname) || matchesNoProxy(hostname, settings.noProxy, port)) return "";
  const candidate = target.protocol === "https:" ? settings.https : settings.http;
  if (!candidate) return "";
  let proxy;
  try {
    proxy = new URL(candidate.includes("://") ? candidate : "http://" + candidate);
  } catch {
    return "";
  }
  return proxy.protocol === "http:" || proxy.protocol === "https:" ? proxy.toString() : "";
}

/**
 * Open one CONNECT tunnel to `host:port` through `proxy` and hand the socket
 * back. `secure` decides whether TLS is layered on top of the tunnel; the raw
 * socket itself is never kept alive (a tunnel is bound to one target).
 */
function openTunnel(proxy, options, timeoutMs, secure, callback) {
  const host = options.host;
  const port = options.port || (secure ? 443 : 80);
  const headers = { host: host + ":" + port };
  if (proxy.username || proxy.password) {
    const raw = decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password);
    headers["proxy-authorization"] = "Basic " + Buffer.from(raw).toString("base64");
  }
  const transport = proxy.protocol === "https:" ? https : http;
  const connect = transport.request({
    host: proxy.hostname,
    port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
    method: "CONNECT",
    path: host + ":" + port,
    headers,
    agent: false,
    setHost: false,
  });
  let settled = false;
  // 失败时连同底层 socket 一起销毁：半开的隧道 socket 会一直占着代理连接。
  let tunnelSocket = null;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { tunnelSocket?.destroy(); } catch { /* 忽略 */ }
    try { connect.destroy(); } catch { /* 忽略 */ }
    callback(error);
  };
  // 代理收下 CONNECT 却既不隧道也不关闭时，https.Agent 不会自己超时：必须显式兜底，
  // 否则请求永远停在建连阶段（web_fetch 的工具级超时才把它收走）。
  const timer = setTimeout(
    () => fail(new Error("proxy " + proxy.host + " did not complete CONNECT " + host + ":" + port + " in " + timeoutMs + "ms")),
    timeoutMs
  );
  timer.unref?.();
  connect.once("error", (error) => fail(new Error("proxy " + proxy.host + ": " + error.message)));
  connect.once("response", (res) => {
    res.resume();
    fail(new Error("proxy " + proxy.host + " refused CONNECT " + host + ":" + port + ": HTTP " + res.statusCode));
  });
  connect.once("connect", (res, socket) => {
    tunnelSocket = socket;
    if (res.statusCode !== 200) {
      fail(new Error("proxy " + proxy.host + " refused CONNECT " + host + ":" + port + ": HTTP " + res.statusCode));
      return;
    }
    // 明文 http 目标：CONNECT 之后直接把这个 socket 交给 http.Agent，不叠 TLS。
    if (!secure) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.once("error", (error) => socket.destroy(error));
      callback(null, socket);
      return;
    }
    // 隧道在 TLS 之前被对端关掉：tls.connect 可能只给出 close，这里直接兜住。
    socket.once("close", () => fail(new Error("proxy " + proxy.host + " closed the tunnel to " + host + ":" + port + " before TLS completed")));
    socket.once("error", (error) => fail(error));
    const secureSocket = tls.connect({
      socket,
      servername: options.servername || options.host,
      ALPNProtocols: options.ALPNProtocols,
      rejectUnauthorized: options.rejectUnauthorized !== false,
    });
    secureSocket.once("secureConnect", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(null, secureSocket);
    });
    secureSocket.once("error", (error) => fail(error));
    // 隧道在握手完成前被对端关掉时只有 close，没有 error。
    secureSocket.once("close", () => fail(new Error("proxy " + proxy.host + " closed the tunnel to " + host + ":" + port + " before TLS completed")));
  });
  connect.end();
}

/** `https.Agent` that opens every connection through a CONNECT tunnel on the given proxy. */
export class TunnelAgent extends https.Agent {
  #proxy;

  constructor(proxyUrl, options = {}) {
    super({ keepAlive: false, maxSockets: 16, ...options });
    this.#proxy = new URL(String(proxyUrl));
    this.proxyUrl = this.#proxy.toString();
    this.tunnelTimeoutMs = options.tunnelTimeoutMs ?? 15000;
  }

  createConnection(options, callback) {
    openTunnel(this.#proxy, options, this.tunnelTimeoutMs, true, callback);
  }
}

/**
 * The same CONNECT tunnel for plain `http:` targets: the tunnel socket is used
 * as it is, so a proxy-only egress can fetch http pages too instead of failing
 * with a TLS handshake against an origin that does not speak TLS.
 */
export class HttpTunnelAgent extends http.Agent {
  #proxy;

  constructor(proxyUrl, options = {}) {
    super({ keepAlive: false, maxSockets: 16, ...options });
    this.#proxy = new URL(String(proxyUrl));
    this.proxyUrl = this.#proxy.toString();
    this.tunnelTimeoutMs = options.tunnelTimeoutMs ?? 15000;
  }

  createConnection(options, callback) {
    openTunnel(this.#proxy, options, this.tunnelTimeoutMs, false, callback);
  }
}

/**
 * Build the agent a layer should use for one request, or `null` to go direct.
 * `cache` keys agents by proxy URL (and scheme) so repeated fetches reuse the same instance.
 */
export function agentForUrl(rawUrl, { settings = readProxyEnv(), cache = new Map() } = {}) {
  const proxyUrl = proxyForTarget(rawUrl, settings);
  if (!proxyUrl) return null;
  const secure = new URL(String(rawUrl)).protocol !== "http:";
  const key = secure ? proxyUrl : "http+" + proxyUrl;
  const existing = cache.get(key);
  if (existing) return existing;
  const agent = secure ? new TunnelAgent(proxyUrl) : new HttpTunnelAgent(proxyUrl);
  cache.set(key, agent);
  return agent;
}

/** Human readable one-liner for logs/tests. */
export function describeProxyEnv(env = process.env) {
  const settings = readProxyEnv(env);
  const parts = [];
  if (settings.https) parts.push("https=" + settings.https);
  if (settings.http && settings.http !== settings.https) parts.push("http=" + settings.http);
  if (settings.noProxy) parts.push("no_proxy=" + settings.noProxy);
  return parts.length ? parts.join(" ") : "direct";
}
