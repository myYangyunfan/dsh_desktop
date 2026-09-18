import { spawn } from "node:child_process";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";

// DSH Desktop 配套终端（宿主侧）：
// 在 webServer 上提供终端路由，为「终端」标签页提供流式 shell：
//   Auth model (H-06): a per-process random SECRET is handed to the same-origin
//   client over GET /dsh-files/terminal-tab/auth and required as `token` on every
//   other route. `sid` is only the client-chosen shell name. Every route also
//   passes a Host/Origin browser-trust fence; state-changing routes require a
//   same-origin Origin header. The shell env is allowlisted.
//   GET  /dsh-files/terminal-tab/auth?                                  → {token}
//   GET  /dsh-files/terminal-tab/events?token=...&sid=...&cwd=...       SSE（诊断/兼容用）
//   GET  /dsh-files/terminal-tab/ws?token=...&sid=...&cwd=...           WebSocket 升级（正式通道——
//     浏览器对同一主机 HTTP/1.1 并发连接上限为 6，web UI 自身的长连接已占满，
//     终端若用 SSE 会被排队永远连不上；WebSocket 升级连接不占该池）
//   POST /dsh-files/terminal-tab/input   {token, sid, line}             兼容用（WS 内也可发命令）
//   POST /dsh-files/terminal-tab/close   {token, sid}                   终止并清理 shell
//
// 设计要点：
//  - 每个 sid 一个持久 shell：Windows 为 PowerShell 自建 mini-REPL（显式
//    UTF-8 读行/输出，绕开 PS 5.1 重定向 stdin 的编码漂移），POSIX 为 sh -i；
//  - 断开后 shell 保留 15 分钟（标签页切换/刷新不丢状态），重连时先回放
//    最近 512KB 输出（snapshot），再接续流式输出；
//  - 无原生依赖（普通管道，非 PTY）——交互式全屏程序（vim 等）不支持。

const TERM_AUTH = "/dsh-files/terminal-tab/auth";
const TERM_EVENTS = "/dsh-files/terminal-tab/events";
const TERM_WS = "/dsh-files/terminal-tab/ws";
const TERM_INPUT = "/dsh-files/terminal-tab/input";
const TERM_CLOSE = "/dsh-files/terminal-tab/close";

// Server-owned capability secret, one per process. Never client-supplied.
const SECRET = randomBytes(32).toString("hex");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const IDLE_KEEP_MS = 15 * 60 * 1000; // 断开后保留
const CLOSED_KEEP_MS = 60 * 1000;    // 退出后保留（吸收重连）
const MAX_BUFFER = 512 * 1024;       // snapshot 回放上限
const MAX_SHELLS = 8; // A2：token 按会话隔离后，多会话并发需要更高上限（空闲 15 分钟自动回收）
const HEARTBEAT_MS = 25 * 1000;

const shells = new Map(); // token -> record

function isLoopback(req) {
  const ra = req.socket && req.socket.remoteAddress;
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

// --- Auth / browser-trust fence ---------------------------------------------
// Mirrors @deepseek-ai/dsh-client-connection's isTrustedApiRequest (the package
// exports no helper). Host must name a loopback authority; a present Origin must
// match it exactly. DNS rebinding and cross-site requests are refused.

function headerValue(headers, name) {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

function parseAuthority(authority) {
  try {
    return new URL("http://" + authority);
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Constant-time compare of a presented token against the process secret. */
function secretMatches(provided) {
  if (typeof provided !== "string" || provided.length !== SECRET.length) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(SECRET, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether `candidate` is `root` or lives inside it (both already resolved). */
function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep));
}

let warnedMissingSessionCwd = false;

// --- Shell environment ------------------------------------------------------
// Allowlist only: spawned shells never inherit API keys / tokens / credentials.

const ENV_ALLOW = new Set([
  "PATH", "HOME", "USERPROFILE", "SystemRoot", "SystemDrive", "windir",
  "TEMP", "TMP", "ComSpec", "PATHEXT", "LANG", "TERM", "SHELL",
  "USERNAME", "USER", "APPDATA", "LOCALAPPDATA", "ProgramData"
]);
const ENV_DENY = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i;

function shellEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (!ENV_ALLOW.has(key)) continue;
    if (ENV_DENY.test(key)) continue;
    env[key] = value;
  }
  return env;
}

/**
 * Per-apply guard: request trust, session cwd lookup, and the process secret.
 * `sessions` is an optional official service (probed, never required).
 */
function createGuard(ctx) {
  const listeningPort = () => {
    const port = ctx && ctx.webServer ? ctx.webServer.port : undefined;
    return typeof port === "number" && port > 0 ? String(port) : "";
  };
  const trustedHost = (req) => {
    const host = headerValue(req.headers, "host");
    if (host === undefined) return undefined;
    const hostUrl = parseAuthority(host);
    if (hostUrl === undefined) return undefined;
    if (!isLoopbackHostname(hostUrl.hostname)) return undefined;
    const port = listeningPort();
    if (port !== "" && hostUrl.port !== "" && hostUrl.port !== port) return undefined;
    if (headerValue(req.headers, "sec-fetch-site") === "cross-site") return undefined;
    return hostUrl;
  };
  const originMatches = (req, hostUrl) => {
    const origin = headerValue(req.headers, "origin");
    if (origin === undefined) return undefined;
    try {
      return new URL(origin).host === hostUrl.host;
    } catch {
      return false;
    }
  };
  return {
    /** Reads and the auth bootstrap: same-origin when Origin is attached. */
    trusted(req) {
      const hostUrl = trustedHost(req);
      if (hostUrl === undefined) return false;
      const matched = originMatches(req, hostUrl);
      return matched === undefined ? true : matched;
    },
    /** State-changing routes: Origin is mandatory and must be same-origin. */
    sameOrigin(req) {
      const hostUrl = trustedHost(req);
      if (hostUrl === undefined) return false;
      return originMatches(req, hostUrl) === true;
    },
    /** Authoritative cwd of a live session, when the sessions service is present. */
    sessionCwd(sessionId) {
      if (!sessionId) return undefined;
      let sessions;
      try {
        sessions = ctx.get("sessions", false);
      } catch {
        sessions = undefined;
      }
      if (!sessions || typeof sessions.get !== "function") return undefined;
      try {
        const session = sessions.get(sessionId);
        const cwd = session && session.header ? session.header.cwd : undefined;
        return typeof cwd === "string" && cwd !== "" ? cwd : undefined;
      } catch {
        return undefined;
      }
    }
  };
}

/**
 * Validate the requested cwd: absolute, real (symlinks resolved), a directory,
 * and inside the live session's own cwd. Without a live session cwd the
 * structural checks stand (reported once) so the terminal stays usable.
 */
async function validateCwd(guard, sessionId, rawCwd) {
  const cwd = typeof rawCwd === "string" ? rawCwd.trim() : "";
  if (!cwd || cwd.includes("\0") || !isAbsolute(cwd)) {
    return { error: "cwd must be an absolute path" };
  }
  let real;
  try {
    real = await realpath(resolve(cwd));
    const st = await stat(real);
    if (!st.isDirectory()) throw new Error("not a directory");
  } catch {
    return { error: "cwd is not a directory: " + cwd };
  }
  const sessionRoot = guard.sessionCwd(sessionId);
  if (sessionRoot) {
    let realRoot;
    try {
      realRoot = await realpath(resolve(sessionRoot));
    } catch {
      realRoot = resolve(sessionRoot);
    }
    if (!isWithin(realRoot, real)) return { error: "cwd is outside the session workspace" };
  } else if (!warnedMissingSessionCwd) {
    warnedMissingSessionCwd = true;
    console.warn("[dsh-terminal-tab] live session cwd unavailable; accepting any absolute existing directory");
  }
  return { path: real };
}

function rejectForbidden(res) {
  res.writeHead(403);
  res.end("forbidden");
}

function rejectUnauthorized(res) {
  sendJson(res, 401, { error: "unauthorized" });
}

function wsReject(socket, status, reason) {
  try {
    socket.write("HTTP/1.1 " + status + " " + reason + "\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
  } catch {}
  socket.destroy();
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-length": String(data.length)
  });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sse(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {}
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {}
}

function spawnShell(cwd) {
  const env = shellEnv();
  if (process.platform === "win32") {
    // 自建 mini-REPL：PS 5.1 原生 REPL 对重定向 stdin 的读取器编码随环境
    // 漂移（GBK/UTF-8 不定，已实测），因此完全绕开它——显式 UTF-8
    // StreamReader 读行、Invoke-Expression 执行、UTF-8 StreamWriter 输出，
    // 全链路 UTF-8、行为确定。限制：无续行（多行脚本请用 ; 分行）、
    // 非 PTY（vim 等全屏程序不支持）。
    const miniRepl = "$enc=New-Object System.Text.UTF8Encoding($false);$in=New-Object IO.StreamReader([Console]::OpenStandardInput(),$enc);$out=New-Object IO.StreamWriter([Console]::OpenStandardOutput(),$enc);$out.AutoFlush=$true;[Console]::OutputEncoding=[Text.Encoding]::UTF8;while($true){$out.Write('PS '+(Get-Location).Path+'> ');$line=$in.ReadLine();if($line -eq $null){break};if($line.Trim() -ne ''){try{$res=Invoke-Expression $line 2>&1 | Out-String -Stream}catch{$res=$_.Exception.Message};foreach($l in $res){$out.WriteLine($l)}}}";
    return spawn("powershell.exe", ["-NoLogo", "-NoExit", "-Command", miniRepl], {
      cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
    });
  }
  return spawn("sh", ["-i"], { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
}

function removeRecord(sid, grace = 0) {
  const rec = shells.get(sid);
  if (!rec) return;
  if (grace > 0 && !rec._removing) {
    rec._removing = true;
    // A2：延迟删除前校验记录身份，防止旧定时器误删新记录。
    const timer = setTimeout(() => {
      if (shells.get(sid) === rec) shells.delete(sid);
    }, grace);
    timer.unref();
    return;
  }
  shells.delete(sid);
}

function destroyRecord(rec) {
  clearTimeout(rec.killTimer);
  rec.closed = true;
  killTree(rec.proc);
  rec.send = null;
  rec.detach = null;
}

function pushOutput(rec, text) {
  if (!text) return;
  rec.buffer = (rec.buffer + text).slice(-MAX_BUFFER);
  if (rec.send) rec.send({ event: "data", data: { text } });
}

/** 每个 record 一个活动传输（SSE 或 WS）；attach 前先断开旧传输。 */
function detachRecord(rec) {
  if (rec.detach) { try { rec.detach(); } catch {} }
  rec.send = null;
  rec.detach = null;
}

function scheduleIdleKill(rec) {
  if (rec.closed) return;
  clearTimeout(rec.killTimer);
  rec.killTimer = setTimeout(() => { destroyRecord(rec); removeRecord(rec.sid); }, IDLE_KEEP_MS);
  rec.killTimer.unref?.();
}

function attachSse(rec, res) {
  detachRecord(rec);
  rec.send = (msg) => sse(res, msg.event, msg.data);
  const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, HEARTBEAT_MS);
  rec.detach = () => { clearInterval(beat); };
  res.on("close", () => {
    if (rec.detach) { try { rec.detach(); } catch {} }
    rec.send = null;
    rec.detach = null;
    scheduleIdleKill(rec);
  });
  rec.send({ event: "snapshot", data: { text: rec.buffer } });
  rec.send({ event: "ready", data: { sid: rec.sid, cwd: rec.cwd, resumed: true, exited: !!rec.closed } });
  if (rec.closed) rec.send({ event: "exit", data: { code: rec.exitCode } });
}

// --- WebSocket 最小实现（RFC 6455：握手 + 文本帧收发 + ping/close） ----------

function wsSendRaw(socket, buffer) {
  try { socket.write(buffer); } catch {}
}

function wsSendText(socket, text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  wsSendRaw(socket, Buffer.concat([header, payload]));
}

function wsSendPing(socket) {
  wsSendRaw(socket, Buffer.from([0x89, 0]));
}

/** 客户端→服务端帧解析（客户端帧必须带 mask）。返回 null 表示连接已关闭。 */
function wsConsume(socket, chunk, onMessage) {
  let buf = socket.__wsbuf ? Buffer.concat([socket.__wsbuf, chunk]) : chunk;
  while (buf.length >= 2) {
    const b0 = buf[0], b1 = buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let offset = 2;
    let len = b1 & 0x7f;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) break;
    const mask = masked ? buf.subarray(offset, offset + 4) : null;
    offset += maskLen;
    let payload = buf.subarray(offset, offset + len);
    if (mask) {
      const un = Buffer.alloc(len);
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3];
      payload = un;
    }
    buf = buf.subarray(offset + len);
    socket.__wsbuf = buf.length ? buf : Buffer.alloc(0);
    if (opcode === 8) { // close
      try { socket.end(); } catch {}
      return null;
    }
    if (opcode === 9) continue; // ping：忽略（浏览器一般不 ping 服务器）
    if (opcode === 1 || opcode === 2) {
      try { onMessage(payload.toString("utf8")); } catch {}
    }
    if ((b0 & 0x80) === 0) continue; // 分片后续帧忽略内容
  }
  socket.__wsbuf = buf;
  return socket;
}

function attachWs(rec, socket) {
  detachRecord(rec);
  rec.send = (msg) => wsSendText(socket, JSON.stringify(msg));
  const beat = setInterval(() => wsSendPing(socket), HEARTBEAT_MS);
  const onData = (c) => {
    const alive = wsConsume(socket, c, (text) => handleClientMessage(rec, text));
    if (alive === null && rec.detach) { try { rec.detach(); } catch {} }
  };
  socket.on("data", onData);
  rec.detach = () => {
    clearInterval(beat);
    socket.removeListener("data", onData);
    try { socket.destroy(); } catch {}
  };
  socket.on("close", () => {
    if (rec.detach) { try { rec.detach(); } catch {} }
    rec.send = null;
    rec.detach = null;
    scheduleIdleKill(rec);
  });
  socket.on("error", () => { try { socket.destroy(); } catch {} });
  rec.send({ event: "snapshot", data: { text: rec.buffer } });
  rec.send({ event: "ready", data: { sid: rec.sid, cwd: rec.cwd, resumed: true, exited: !!rec.closed } });
  if (rec.closed) rec.send({ event: "exit", data: { code: rec.exitCode } });
}

function handleClientMessage(rec, text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return; }
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "input" && typeof msg.line === "string" && msg.line && !rec.closed) {
    rec.lastActive = Date.now();
    try { rec.proc.stdin.write(msg.line + "\r\n"); } catch {}
  }
}

// --- 会话查找/创建（SSE 与 WS 共用） ------------------------------------------

async function ensureRecord(sid, cwd) {
  let rec = sid ? shells.get(sid) : undefined;
  if (rec) {
    // A2：同一 sid 被另一会话（不同 cwd）复用：回收旧 shell，按新 cwd 重建。
    if (rec.cwd === cwd) return rec;
    destroyRecord(rec);
    shells.delete(sid);
  }
  if (!cwd || !isAbsolute(cwd)) return { __error: "cwd must be an absolute path" };
  if (shells.size >= MAX_SHELLS) return { __error: "too many terminal sessions" };
  const key = sid || randomBytes(9).toString("hex");
  let proc;
  try {
    proc = spawnShell(cwd);
  } catch (err) {
    return { __error: String((err && err.message) || err) };
  }
  rec = {
    sid: key,
    cwd,
    proc,
    buffer: "",
    send: null,
    detach: null,
    closed: false,
    exitCode: null,
    killTimer: null,
    lastActive: Date.now()
  };
  shells.set(key, rec);
  const handleShellOutput = (chunk) => pushOutput(rec, chunk.toString("utf8"));
  proc.stdout.on("data", handleShellOutput);
  proc.stderr.on("data", handleShellOutput);
  proc.on("exit", (code) => {
    rec.closed = true;
    rec.exitCode = code;
    if (rec.send) rec.send({ event: "exit", data: { code } });
    detachRecord(rec);
    removeRecord(key, CLOSED_KEEP_MS);
  });
  proc.on("error", (err) => {
    if (!rec.closed) pushOutput(rec, "\r\n[终端错误] " + String((err && err.message) || err) + "\r\n");
  });
  return rec;
}

// --- 路由 --------------------------------------------------------------------

/** Same-origin secret bootstrap: the only way the client learns `token`. */
async function handleAuthRoute(req, res, guard) {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  if (!isLoopback(req) || !guard.trusted(req)) {
    rejectForbidden(res);
    return;
  }
  sendJson(res, 200, { token: SECRET });
}

async function handleEventsRoute(req, res, guard) {
  console.log("[dsh-terminal-tab] events request", req.method, "remote=" + (req.socket && req.socket.remoteAddress));
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  // SSE can spawn a shell, so it is fenced like a state-changing route.
  if (!isLoopback(req) || !guard.sameOrigin(req)) {
    rejectForbidden(res);
    return;
  }
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (!secretMatches((url.searchParams.get("token") || "").trim())) {
    rejectUnauthorized(res);
    return;
  }
  const sid = (url.searchParams.get("sid") || "").trim();
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const cwd = await validateCwd(guard, sessionId, url.searchParams.get("cwd") || "");
  if (cwd.error) {
    sendJson(res, 400, { error: cwd.error });
    return;
  }
  const rec = await ensureRecord(sid, cwd.path);
  if (rec.__error) {
    sendJson(res, 400, { error: rec.__error });
    return;
  }
  attachSse(rec, res);
}

async function handleWsUpgrade(req, socket, head, guard) {
  console.log("[dsh-terminal-tab] ws request", "remote=" + (req.socket && req.socket.remoteAddress));
  if (!isLoopback(req) || !guard.sameOrigin(req)) { wsReject(socket, 403, "Forbidden"); return; }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    wsReject(socket, 400, "Bad Request");
    return;
  }
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    wsReject(socket, 400, "Bad Request");
    return;
  }
  if (!secretMatches((url.searchParams.get("token") || "").trim())) {
    wsReject(socket, 401, "Unauthorized");
    return;
  }
  const sid = (url.searchParams.get("sid") || "").trim();
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const cwd = await validateCwd(guard, sessionId, url.searchParams.get("cwd") || "");
  if (cwd.error) {
    wsReject(socket, 400, "Bad Request");
    return;
  }
  const rec = await ensureRecord(sid, cwd.path);
  if (rec.__error) {
    wsReject(socket, 400, "Bad Request");
    return;
  }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  attachWs(rec, socket);
}

async function handleInputRoute(req, res, guard) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  if (!isLoopback(req) || !guard.sameOrigin(req)) {
    rejectForbidden(res);
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req)).replace(/^\uFEFF/, ""));
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }
  if (!secretMatches(String((body && body.token) || ""))) {
    rejectUnauthorized(res);
    return;
  }
  const sid = String((body && body.sid) || "");
  const line = String((body && body.line) || "");
  if (!sid || !line) {
    sendJson(res, 400, { error: "sid and line are required" });
    return;
  }
  const rec = shells.get(sid);
  if (!rec) {
    sendJson(res, 404, { error: "terminal session not found" });
    return;
  }
  if (rec.closed) {
    sendJson(res, 409, { error: "shell exited" });
    return;
  }
  rec.lastActive = Date.now();
  try {
    rec.proc.stdin.write(line + "\r\n");
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { error: String((err && err.message) || err) });
  }
}

async function handleCloseRoute(req, res, guard) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  if (!isLoopback(req) || !guard.sameOrigin(req)) {
    rejectForbidden(res);
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req)).replace(/^\uFEFF/, ""));
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }
  if (!secretMatches(String((body && body.token) || ""))) {
    rejectUnauthorized(res);
    return;
  }
  const sid = String((body && body.sid) || "");
  const rec = sid ? shells.get(sid) : undefined;
  if (rec) {
    destroyRecord(rec);
    removeRecord(rec.sid);
  }
  sendJson(res, 200, { ok: true });
}

const name = "dsh-terminal-tab";
const inject = ["webServer"];

function apply(ctx) {
  const guard = createGuard(ctx);
  const disposers = [
    ctx.webServer.register({ kind: "exact", path: TERM_AUTH, handler: (req, res) => handleAuthRoute(req, res, guard) }),
    ctx.webServer.register({ kind: "exact", path: TERM_EVENTS, handler: (req, res) => handleEventsRoute(req, res, guard) }),
    ctx.webServer.registerUpgrade({ path: TERM_WS, handler: (req, socket, head) => handleWsUpgrade(req, socket, head, guard) }),
    ctx.webServer.register({ kind: "exact", path: TERM_INPUT, handler: (req, res) => handleInputRoute(req, res, guard) }),
    ctx.webServer.register({ kind: "exact", path: TERM_CLOSE, handler: (req, res) => handleCloseRoute(req, res, guard) })
  ];
  return () => {
    for (const d of disposers) d();
    for (const rec of shells.values()) destroyRecord(rec);
    shells.clear();
  };
}

export { apply, inject, name };
