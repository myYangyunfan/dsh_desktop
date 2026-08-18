'use strict';

// ===========================================================================
// balance.js —— DeepSeek 账户余额 / OpenCode Go 用量查询（主进程数据层）
//
// 纯 Node 模块：不依赖 Electron，可在纯 node 进程中直接单测。
// 设计契约（详见 docs/balance-architecture.md）：
//   · 本模块只做「取数 + 规整」，不做编排（节流/重试/推送由 balance-scheduler.js 负责）；
//   · 所有对外函数返回结构化的 { ok, ... } 对象，字段集合跨路径一致；
//   · 密钥不出主进程；任何网络输出都经过 fetchJson 的安全边界（见下）。
//
// 密钥来源：环境变量 DEEPSEEK_API_KEY > DSH_HOME/.credentials.yaml（顶层键）。
// 端点：https://api.deepseek.com/user/balance；可用环境变量覆盖：
//   DEEPSEEK_BALANCE_URL —— 完整端点 URL（自定义代理/镜像）
//   DEEPSEEK_API_BASE    —— API 基址（自动拼接 /user/balance）
// OpenCode Go 端点：OPENCODE_USAGE_URL（默认 https://opencode.ai/zen/go/v1/usage）。
// ===========================================================================

const https = require('node:https');
const http = require('node:http');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const { homedir } = require('node:os');

// ---------------------------------------------------------------------------
// 配置常量（网络边界参数全部收口在此，测试可经 fetchJson options 覆盖）
// ---------------------------------------------------------------------------

const DEFAULT_BASE = 'https://api.deepseek.com';
const DEFAULT_OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

const FETCH_DEFAULT_TIMEOUT_MS = 15000; // 总超时（自请求发出起算，跨重定向共享 deadline）
const FETCH_MAX_REDIRECTS = 5;          // 重定向上限（超出拒绝）
const FETCH_MAX_BODY_BYTES = 1024 * 1024; // 响应体上限（按字节计，非字符）

// ---------------------------------------------------------------------------
// 配置文件 mtime 缓存（P1-2+A-7）：每 3 分钟轮询都会 readFileSync
// settings.yaml / .credentials.yaml，最小化场景无意义读盘；mtime+size 未变
// 直接复用上次内容，「改凭证后下轮生效」= mtime 变化触发重读。
// ---------------------------------------------------------------------------
const fileTextCache = new Map(); // path -> { mtimeMs, size, text }

function readFileCached(p) {
  try {
    const st = fs.statSync(p);
    const hit = fileTextCache.get(p);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
    const text = fs.readFileSync(p, 'utf8');
    fileTextCache.set(p, { mtimeMs: st.mtimeMs, size: st.size, text });
    return text;
  } catch {
    fileTextCache.delete(p);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 模型价格（¥/百万 token）。官方定价：
// https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
//
// 2026-08-17 00:00（北京时间）起采用「峰谷定价」：高峰时段
// （北京时间 9:00-12:00、14:00-18:00）为全价，空闲时段为高峰的一半。
// 在此之前为旧版固定价。示意图：
//   deepseek-v4-flash  高峰 3.0 / 0.10 / 9.0   空闲 1.5 / 0.05 / 4.5
//   deepseek-v4-pro    高峰 9.0 / 0.30 / 27.0  空闲 4.5 / 0.15 / 13.5
// 字段：{ cacheMiss 输入未命中, cacheHit 输入命中, output 输出 }。
// ---------------------------------------------------------------------------

// 高峰全价（2026-08-17 起生效）。
const PEAK_PRICES = {
  'deepseek-v4-flash': { cacheMiss: 3, cacheHit: 0.1, output: 9 },
  'deepseek-v4-pro': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
  // 旧模型名别名：deepseek-chat 对应 v4-flash，deepseek-reasoner 对应 v4-pro。
  'deepseek-chat': { cacheMiss: 3, cacheHit: 0.1, output: 9 },
  'deepseek-reasoner': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
};

// 2026-08-17 前的旧版固定价（历史结算参考）。
const LEGACY_PRICES = {
  'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
  'deepseek-chat': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-reasoner': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
};

// 价目表内的全部模型名（别名在内）。priceTable() 逐名取值，客户端按会话
// 实际模型选档（见 docs/balance-architecture.md「按模型取价」）。
const PRICING_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'];

// 峰谷定价生效节点：2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC。
const PEAK_PRICING_SINCE_UTC = Date.UTC(2026, 7, 16, 16, 0, 0);

// 模型缺失 / 未知时的兜底档（与价目表回退一致，避免少报费用）。
const DEFAULT_MODEL = 'deepseek-v4-pro';

// ---------------------------------------------------------------------------
// 纯函数工具
// ---------------------------------------------------------------------------

/** 正则转义（readCredentialLine 动态拼键名用）。 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 .credentials.yaml 读取「顶层键」的值（`KEY: value`，值可带引号）。
 * 安全约束：只匹配行首（列 0）的键——任意嵌套段下的同名键一律不读，
 * 避免读到插件 config 等其它段下的同名值。
 * 值形态支持：无引号标量（行尾 ` #` 视为注释截断）、单/双引号标量。
 * 文件读取走 readFileCached（mtime+size 复用），「改凭证后下轮生效」。
 * @param {string} dshHome DSH_HOME 目录
 * @param {string} keyName 键名（可含正则元字符，内部已转义）
 * @returns {string} 读取失败/未找到返回空串
 */
function readCredentialLine(dshHome, keyName) {
  try {
    const text = readFileCached(path.join(dshHome, '.credentials.yaml'));
    if (text === null) return '';
    const keyPattern = new RegExp('^("?)' + escapeRegExp(keyName) + '\\1\\s*:\\s*(.*)$');
    for (const line of text.split(/\r?\n/)) {
      const m = keyPattern.exec(line);
      if (!m) continue;
      const raw = m[2];
      const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(raw) || /^'([^']*)'/.exec(raw);
      let value;
      if (quoted) {
        value = quoted[1];
      } else {
        // 无引号标量：` #` 起视为注释（键值本身不含空格的常规形态）。
        value = raw.split(/\s+#/)[0].trim();
      }
      if (value) return value;
    }
  } catch {}
  return '';
}

/** 当前 OpenCode Go 用量端点（支持 OPENCODE_USAGE_URL 覆盖，代理/镜像场景必走该口）。 */
function opencodeUsageEndpoint() {
  return process.env.OPENCODE_USAGE_URL || DEFAULT_OPENCODE_USAGE_URL;
}

function readOpencodeGoKey(dshHome) {
  const envKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY;
  if (envKey) return envKey.trim();
  const fromCreds = readCredentialLine(dshHome, 'OPENCODE_GO_API_KEY');
  if (fromCreds) return fromCreds;
  // OpenCode CLI auth.json 兜底（macOS/Linux 默认位置；Windows 相同相对位置存在时也读）。
  try {
    const authPath = path.join(homedir(), '.local', 'share', 'opencode', 'auth.json');
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const entry = raw['opencode-go'] ?? raw['opencode'];
    if (entry && entry.type === 'api' && typeof entry.key === 'string' && entry.key.length > 0) return entry.key;
  } catch {}
  return '';
}

/**
 * 用量窗口规整：percent 缺省（null/undefined）保持 null，绝不把 null 折算成 0
 * （Number(null)=0 会让「未知」显示成「0%」）。
 * percent 非有限值同样归 null；status/resetsAt 只接受字符串，其余归 null。
 */
function pickUsageWindow(w) {
  if (!w || typeof w !== 'object') return null;
  const percent = w.percent == null ? NaN : Number(w.percent);
  return {
    status: typeof w.status === 'string' ? w.status : null,
    percent: Number.isFinite(percent) ? percent : null,
    resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
  };
}

// 返回 { ok, reason?, error?, usage?: { rolling, weekly, monthly }, warning? }
async function queryOpencodeUsage(dshHome) {
  const key = readOpencodeGoKey(dshHome);
  if (!key) return { ok: false, reason: 'no-key' };
  const endpoint = opencodeUsageEndpoint();
  const warnings = [];
  try {
    const data = await fetchJson(endpoint, key, {
      onAuthStripped: (target) => warnings.push('重定向到非可信目标已剥离 Authorization（' + target + '）'),
    });
    if (/^http:/i.test(endpoint)) {
      warnings.push('OpenCode Go 端点使用 http://，密钥明文传输（仅建议本地代理）');
    }
    const usage = data && typeof data === 'object' && data.usage ? data.usage : data;
    if (!usage || typeof usage !== 'object') return withWarning({ ok: false, reason: 'bad-response' }, warnings);
    return withWarning({
      ok: true,
      usage: {
        rolling: pickUsageWindow(usage.rolling),
        weekly: pickUsageWindow(usage.weekly),
        monthly: pickUsageWindow(usage.monthly),
      },
    }, warnings);
  } catch (err) {
    return withWarning({ ok: false, error: String((err && err.message) || err) }, warnings);
  }
}

/**
 * 当前（或指定时刻）是否处于高峰时段（北京时间 9:00-12:00、14:00-18:00）。
 * 契约：峰谷定价生效（2026-08-16 16:00 UTC）之前一律 false——旧版期没有
 * 峰谷概念，避免「chip 显示高峰价、实际按旧版固定价计」的自相矛盾。
 * 无效日期返回 false（宁可显示空闲，不可显示错误的高峰态）。
 */
function isPeakHour(date) {
  const d = date ? new Date(date) : new Date();
  if (!Number.isFinite(d.getTime())) return false;
  if (d.getTime() < PEAK_PRICING_SINCE_UTC) return false;
  const hour = new Date(d.getTime() + 8 * 3600 * 1000).getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/**
 * 某模型在指定时刻的「有效单价」（已含旧版→峰谷切换与高峰/低谷换算）。
 * 模型名为空时按 deepseek-v4-pro 兜底（与 main.js 调用方回退一致）。
 * 未知模型名（非空但不在价目表内）同样按 v4-pro 最高档估算，避免少报费用；
 * 旧版固定价期与峰谷期统一回退到 v4-pro 对应档位，杜绝两时期回退档位
 * 不一致造成的费用估算跳变。
 * 返回全新对象（可安全展开赋值）。
 */
function effectivePrice(model, date) {
  const key = String(model || '').trim() || DEFAULT_MODEL;
  const now = date ? new Date(date) : new Date();
  if (now.getTime() < PEAK_PRICING_SINCE_UTC) {
    return { ...(LEGACY_PRICES[key] || LEGACY_PRICES[DEFAULT_MODEL]) };
  }
  const peak = PEAK_PRICES[key] || PEAK_PRICES[DEFAULT_MODEL];
  if (isPeakHour(now)) return { ...peak };
  return {
    cacheMiss: peak.cacheMiss / 2,
    cacheHit: peak.cacheHit / 2,
    output: peak.output / 2,
  };
}

/**
 * 指定时刻的全模型价目表（客户端按会话实际模型选档用）。
 * 所有条目由同一时刻求值，保证峰谷一致性。
 */
function priceTable(date) {
  const out = {};
  for (const model of PRICING_MODELS) out[model] = effectivePrice(model, date);
  return out;
}

function readApiKey(dshHome) {
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey) return envKey.trim();
  return readCredentialLine(dshHome, 'DEEPSEEK_API_KEY');
}

/**
 * 当前默认模型（~/.dsh/settings.yaml 的 agent-default-model.model），
 * 决定按哪一档价格估算本轮费用。
 * 锚定规则（逐行状态机，杜绝正则吞相邻段）：
 *   1. 只认「行首 agent-default-model 后紧跟冒号」的顶层段（agent-default-model-xxx 不算）；
 *   2. 段内取缩进最浅的 `model:` 行——嵌套更深段下的同名键不优先；
 *   3. 无缩进的下一行结束该段。
 * 文件读取走 readFileCached（mtime+size 复用，最小化场景不读盘）。
 */
function readActiveModel(dshHome) {
  try {
    const text = readFileCached(path.join(dshHome, 'settings.yaml'));
    if (text === null) return '';
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^agent-default-model\s*:/.test(lines[i])) continue;
      let best = null; // { indent, value } —— 取缩进最浅者
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
        if (!/^[ \t]/.test(line)) break; // 回到顶层 → 段结束
        const m = /^([ \t]*)model\s*:\s*['"]?([^\s'"#]+)/.exec(line);
        if (!m) continue;
        const indent = m[1].length;
        if (best === null || indent < best.indent) best = { indent, value: m[2] };
      }
      return best ? best.value : '';
    }
  } catch {}
  return '';
}

function balanceEndpoint() {
  if (process.env.DEEPSEEK_BALANCE_URL) return process.env.DEEPSEEK_BALANCE_URL;
  const base = (process.env.DEEPSEEK_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  return base + '/user/balance';
}

/**
 * 金额解析（余额字段）：
 *   · 千分位逗号 / 全半角空格 / 常见货币符号（¥ ￥ $ € £）剥离后再 Number()；
 *   · 负数按业务钳为 0（余额不可能为负，展示侧不出现「-¥」）；
 *   · 空值 / 非有限 → null（调用方决定降级策略，绝不静默变成 0 掩盖脏数据）。
 * @returns {number|null}
 */
function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : null;
  const cleaned = String(value).replace(/[,\s￥¥$€£]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

// ---------------------------------------------------------------------------
// 代理支持（P1-2+A-7 增补；DEEPSEEK_BALANCE_URL / DEEPSEEK_API_BASE 覆盖保留）：
//   https URL → HTTPS_PROXY/https_proxy 的 CONNECT 隧道（tls 包装）
//   http  URL → HTTP_PROXY/http_proxy 的 absolute-form GET
//   NO_PROXY/no_proxy 命中（精确主机或域名后缀，* 全放行）→ 直连
// ---------------------------------------------------------------------------

/** 纯函数：为 URL 选择代理 URL（无代理/NO_PROXY 命中/非法 → null）。 */
function proxyFor(url) {
  const env = process.env;
  const isHttps = url.startsWith('https:');
  const raw = isHttps ? (env.HTTPS_PROXY || env.https_proxy) : (env.HTTP_PROXY || env.http_proxy);
  if (!raw) return null;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const noProxy = env.NO_PROXY || env.no_proxy;
  if (noProxy) {
    for (const part of String(noProxy).split(',')) {
      const p = part.trim().toLowerCase();
      if (!p) continue;
      if (p === '*' || host === p || host.endsWith('.' + p.replace(/^\./, ''))) return null;
    }
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch { return null; }
}

/** https.Agent 子类：经代理 CONNECT 隧道建连，再做 TLS 包装（无第三方依赖）。 */
class ConnectProxyAgent extends https.Agent {
  constructor(proxy) {
    super({ keepAlive: false });
    this.proxy = proxy;
  }
  createConnection(options, callback) {
    const host = options.host || 'localhost';
    const port = options.port || 443;
    const proxy = this.proxy;
    const proxyPort = proxy.port || (proxy.protocol === 'https:' ? 443 : 80);
    const headers = {};
    if (proxy.username) {
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(
        decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')
      ).toString('base64');
    }
    const proxyClient = proxy.protocol === 'https:' ? https : http;
    const proxyReq = proxyClient.request({
      host: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: host + ':' + port,
      headers,
    });
    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        callback(new Error('代理 CONNECT 失败: HTTP ' + res.statusCode));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: host, host, port }, () => callback(null, tlsSocket));
      tlsSocket.on('error', (err) => callback(err));
    });
    proxyReq.on('error', (err) => callback(err));
    proxyReq.end();
  }
}

// ---------------------------------------------------------------------------
// HTTP 边界：fetchJson
//
// 安全/健壮性契约：
//   · 重定向跟随：Authorization 只保留在「同主机 且 全程 https」的跳转上；
//     跨主机或 https→http 降级一律剥离（密钥 = 计费凭证，绝不发往非预期主机）。
//   · 超时：总超时（Promise deadline，跨重定向共享剩余时间）+ socket 空闲
//     超时双保险；slow-drip 服务器无法靠空闲超时保活绕过总时限。
//   · 体积上限：按字节累计（Buffer.length），多字节内容不会绕过 1MB 限制。
//   · 失败路径结构化：HTTP 状态码 / 超时 / 体积超限 / JSON 失败均有独立消息。
//   · 代理（P1-2+A-7）：HTTPS_PROXY/HTTP_PROXY 环境变量，CONNECT 隧道 /
//     absolute-form，NO_PROXY 直连（见 proxyFor / ConnectProxyAgent）。
// ---------------------------------------------------------------------------

/**
 * 判断一次重定向是否允许携带 Authorization。
 * 规则（与安全契约一致）：仅同主机（host 相等）且源/目标均为 https 时保留。
 * @param {string} originUrl 最初请求的 URL（信任锚点）
 * @param {string} targetUrl 重定向目标
 * @param {string} apiKey 密钥（空串 → null）
 * @returns {string|null} 'Bearer xxx' 或 null
 */
function redirectAuthorization(originUrl, targetUrl, apiKey) {
  if (!apiKey) return null;
  let origin;
  let target;
  try {
    origin = new URL(originUrl);
    target = new URL(targetUrl);
  } catch {
    return null; // URL 解析失败 → 宁可不携带
  }
  // hostname + port 比较（URL.port 对默认端口归一化为空串）：
  // 「同主机」= 主机名相同且端口相同（默认端口 443/80 与省略端口视为一致），
  // 避免把显式默认端口误判为跨主机而误剥密钥。
  const sameHost = origin.hostname === target.hostname && origin.port === target.port;
  const staysHttps = origin.protocol === 'https:' && target.protocol === 'https:';
  return sameHost && staysHttps ? 'Bearer ' + apiKey : null;
}

/**
 * GET JSON（安全边界封装）。跟随 ≤maxRedirects 次重定向；相对 Location
 * 以当前 URL 为基解析。支持 HTTPS_PROXY/HTTP_PROXY 环境代理。
 * @param {string} url
 * @param {string} apiKey 为空时不带 Authorization
 * @param {object} [options]
 *   timeoutMs     总超时（默认 15000，跨重定向共享 deadline）
 *   maxRedirects  重定向上限（默认 5）
 *   maxBodyBytes  响应体字节上限（默认 1MB）
 *   onAuthStripped(targetUrl) 重定向剥离 Authorization 时的回调（可空）
 * @returns {Promise<any>} 解析后的 JSON
 */
function fetchJson(url, apiKey, options = {}) {
  const timeoutMs = options.timeoutMs || FETCH_DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes || FETCH_MAX_BODY_BYTES;
  const redirects = options.redirects || 0;
  const originUrl = options.originUrl || url;
  const deadline = options.deadline || (Date.now() + timeoutMs);

  return new Promise((resolve, reject) => {
    if (redirects > maxRedirects) {
      reject(new Error('重定向次数过多'));
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error('请求超时（总时长 ' + timeoutMs + 'ms）'));
      return;
    }
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    // 协议选择：DEEPSEEK_BALANCE_URL / DEEPSEEK_API_BASE 可指向本地 http
    // 代理/镜像（README 承诺的代理场景，issue #78）。http 端点会由调用方
    // 附 warning 提示密钥明文传输。
    const lib = url.startsWith('https:') ? https : http;
    const headers = { 'User-Agent': 'DSH-Desktop' };
    // 首跳 = 调用方显式配置的端点：始终携带密钥（http 代理场景依赖此行为）。
    // 重定向后续跳才受安全规则约束（跨主机 / 降级剥离，见 redirectAuthorization）。
    const authorization = redirects === 0
      ? (apiKey ? 'Bearer ' + apiKey : null)
      : redirectAuthorization(originUrl, url, apiKey);
    if (authorization) headers.Authorization = authorization;
    else if (apiKey && redirects > 0 && typeof options.onAuthStripped === 'function') options.onAuthStripped(url);

    let totalTimer = null;
    const fail = (err) => {
      if (totalTimer) clearTimeout(totalTimer);
      settle(reject, err);
    };

    const onResponse = (res) => {
      // 跟随 3xx 重定向（CDN 常见）；下一跳共享同一 deadline（总超时）。
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (totalTimer) clearTimeout(totalTimer);
        req.setTimeout(0); // 清理本跳 socket 空闲定时器，避免误 destroy 可能被复用的 socket
        let next;
        try {
          next = new URL(res.headers.location, url).toString();
        } catch {
          return fail(new Error('重定向地址无效'));
        }
        return fetchJson(next, apiKey, {
          timeoutMs,
          maxRedirects,
          maxBodyBytes,
          redirects: redirects + 1,
          originUrl,
          deadline,
          onAuthStripped: options.onAuthStripped,
        }).then((v) => settle(resolve, v), fail);
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > maxBodyBytes) {
          fail(new Error('响应过大'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) return;
        if (totalTimer) clearTimeout(totalTimer);
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const hint = body.slice(0, 200).trim();
          return settle(reject, new Error('HTTP ' + res.statusCode + (hint ? '：' + hint : '')));
        }
        try {
          settle(resolve, JSON.parse(body));
        } catch {
          settle(reject, new Error('JSON 解析失败'));
        }
      });
    };

    // 代理分派（P1-2+A-7）：proxyFor 命中时 https 走 CONNECT 隧道 agent，
    // http 走手动 absolute-form（node http 模块不读环境代理）。
    const proxy = proxyFor(url);
    let req;
    if (proxy && url.startsWith('https:')) {
      req = lib.get(url, { headers, agent: new ConnectProxyAgent(proxy) }, onResponse);
    } else if (proxy) {
      const proxyHeaders = { ...headers, Host: new URL(url).host };
      if (proxy.username) {
        proxyHeaders['Proxy-Authorization'] = 'Basic ' + Buffer.from(
          decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')
        ).toString('base64');
      }
      req = http.request({
        host: proxy.hostname,
        port: proxy.port || 80,
        method: 'GET',
        path: url,
        headers: proxyHeaders,
      }, onResponse);
      req.end();
    } else {
      req = lib.get(url, { headers }, onResponse);
    }

    // 总超时：跨重定向共享 deadline，slow-drip 也无法绕过。
    totalTimer = setTimeout(() => fail(new Error('请求超时（总时长 ' + timeoutMs + 'ms）')), remaining);
    // socket 空闲超时（第二道防线）：连接静默即中断。
    req.setTimeout(remaining, () => {
      if (!settled) fail(new Error('请求超时（连接空闲超过 ' + remaining + 'ms）'));
      req.destroy();
    });
    req.on('error', (err) => fail(err));
  });
}

/** 把警告并入结果（有警告才加字段，保持无警告时字段集合不变）。 */
function withWarning(result, warnings) {
  return warnings.length > 0 ? { ...result, warning: warnings.join('；') } : result;
}

// 返回 { ok, isAvailable?, balances: [{currency,total,granted,toppedUp}], error?, warning? }
// 三条路径返回字段集合一致（prices 由调用方 balance-scheduler.js 统一附加）。
async function queryBalance(dshHome) {
  const key = readApiKey(dshHome);
  if (!key) return { ok: false, error: 'no-key', balances: [] };
  const endpoint = balanceEndpoint();
  const warnings = [];
  try {
    const data = await fetchJson(endpoint, key, {
      onAuthStripped: (target) => warnings.push('重定向到非可信目标已剥离 Authorization（' + target + '）'),
    });
    if (/^http:/i.test(endpoint)) {
      warnings.push('余额端点使用 http://，API Key 明文传输（仅建议本地代理）');
    }
    if (!data || typeof data !== 'object') {
      return withWarning({ ok: false, error: 'bad-response', balances: [] }, warnings);
    }
    const balances = Array.isArray(data.balance_infos)
      ? data.balance_infos.map((b) => {
          const total = parseAmount(b.total_balance);
          // 脏数据显式告警，而不是静默显示 0。
          if (total === null) {
            warnings.push('total_balance 无法解析（原值：' + JSON.stringify(b.total_balance) + '），已按 0 显示');
          }
          return {
            currency: String(b.currency || ''),
            total: total ?? 0,
            granted: parseAmount(b.granted_balance) ?? 0,
            toppedUp: parseAmount(b.topped_up_balance) ?? 0,
          };
        })
      : [];
    return withWarning({ ok: true, isAvailable: !!data.is_available, balances }, warnings);
  } catch (err) {
    return withWarning({ ok: false, error: String((err && err.message) || err), balances: [] }, warnings);
  }
}

module.exports = {
  // 查询入口（balance-scheduler.js 使用）
  queryBalance,
  queryOpencodeUsage,
  // 定价/时刻（balance-scheduler.js 与客户端共用契约）
  readActiveModel,
  effectivePrice,
  isPeakHour,
  priceTable,
  // 端点解析（测试用）
  balanceEndpoint,
  opencodeUsageEndpoint,
  // 纯函数与安全边界（单测直接覆盖）
  parseAmount,
  pickUsageWindow,
  fetchJson,
  redirectAuthorization,
  readApiKey,
  readOpencodeGoKey,
  readCredentialLine,
  // P1-2+A-7：配置读取缓存与代理分派（单测直接覆盖）
  readFileCached,
  proxyFor,
  ConnectProxyAgent,
};