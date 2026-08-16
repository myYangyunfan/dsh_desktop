// dsh-side-session — 服务端（cordis 插件）
//
// 职责：
//  1) 注册插件设置节（回答引擎 mode + mode2 的 key/model/endpoint）。
//  2) GET  /api/dsh-side-session/context?sessionId=  → 解析会话日志，返回
//     { title, files, transcript, truncated, provider, model }（仅回环）。
//  3) POST /api/dsh-side-session/ask                 → 组装「对话 + 涉及文件内容」
//     上下文，按 mode 调用模型并流式返回（SSE，OpenAI 格式）：
//       mode1：复用 dsh 全局 Key，代理 DeepSeek /chat/completions；
//       mode2：插件自带 Key，代理 /chat/completions；
//       mode3：纯服务端走 dsh 宿主 LLM 服务 ctx.llm.stream（不读任何 key）。
//
// 上下文捕获不依赖猜测会话事件类型：直接解析
// <DSH_HOME>/sessions/**/session.jsonl.zstd（与 dsh-file-changes 同源的
// zstd 帧扫描 + node:zlib.zstdDecompressSync 手法）。文件信息取自
// tool/code-dispatch* 事件（read/write/edit/grep/glob 的 file_path/path），
// 再在 /ask 时读取这些文件的【当前磁盘内容】注入上下文——这比 meta.diffs
// 更全：连 agent 读取过的文件也能纳入（符合「所有调用的文件」语义）。

import * as schem from "schemastery";
const z = schem.z || (schem.default && schem.default.z) || schem.default;
import { readFileSync, readdirSync, statSync, promises as fsp } from "node:fs";
import { join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";

const NS = "dsh-side-session";
const CONTEXT_ROUTE = "/api/dsh-side-session/context";
const ASK_ROUTE = "/api/dsh-side-session/ask";

const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_PROVIDER = "deepseek-official";

// 截断上限
const MAX_FILE_TEXT = 24 * 1024; // 单文件文本（注入上下文时）
const MAX_FILES_IN_PROMPT = 24; // 注入上下文的文件数上限
const MAX_FILES_TOTAL = 200; // context 列表中展示/统计的文件数上限
const MAX_FILE_BLOCK_CHARS = 200 * 1024; // 所有文件内容合计上限
const MAX_TRANSCRIPT_MSGS = 120;
const MAX_TRANSCRIPT_CHARS = 40 * 1024;

// ---------------------------------------------------------------------------
// 设置节（与 Spec.txt 三模式对应）
// ---------------------------------------------------------------------------
const Config = z.object({
  mode: z
    .string()
    .default("1")
    .description(
      "回答引擎模式：1=复用 dsh 全局 Key；2=插件自带 Key；3=纯服务端走 dsh 宿主 LLM（ctx.llm，不读任何 key）"
    ),
  apiKey: z.string().role("secret").default("").description("mode=2 时使用的 API Key"),
  model: z.string().default(DEFAULT_MODEL).description("mode=2 时的模型名"),
  endpoint: z
    .string()
    .default(DEFAULT_BASE)
    .description("mode=2 时的 API 基址（自动拼接 /chat/completions）"),
  panelWidth: z.number().step(1).min(280).max(640).default(380),
  autoExpand: z.boolean().default(true),
});

function clamp(text, max) {
  return typeof text === "string" && text.length > max
    ? text.slice(0, max) + "\n…(已截断)"
    : text;
}

// ---------------------------------------------------------------------------
// dsh 全局凭据解析（取自 dsh-desktop/balance.js 的实测实现，逐行对齐）
// ---------------------------------------------------------------------------
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function readGlobalKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const text = readFileSync(join(dshHome(), ".credentials.yaml"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DEEPSEEK_API_KEY\s*:\s*["']?([^"'\s#]+)/);
      if (m) return m[1];
    }
  } catch {}
  return "";
}

// 锚定 agent-default-model 段取 model（与 balance.readActiveModel 行为一致，
// 但额外锚定命名空间以避免其他 model: 键误读）。
function readGlobalModel() {
  try {
    const text = readFileSync(join(dshHome(), "settings.yaml"), "utf8");
    const anchored = text.match(/agent-default-model:[\s\S]*?model:\s*(\S+)/);
    if (anchored) return anchored[1];
    const naive = text.match(/^\s*model\s*:\s*(\S+)/m);
    if (naive) return naive[1];
  } catch {}
  return DEFAULT_MODEL;
}

function globalBase() {
  return (process.env.DEEPSEEK_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// zstd 多帧解压（兼容单帧 / 多帧拼接的 .zstd）
// ---------------------------------------------------------------------------
const ZSTD_MAGIC = 4247762216;

function scanFrame(buf, offset) {
  if (buf.length - offset < 4) return null;
  if (buf.readUInt32LE(offset) !== ZSTD_MAGIC) return null;
  let o = offset + 4;
  const desc = buf.readUInt8(o++);
  if ((desc & 24) !== 0) return null;
  const csf = desc >>> 6;
  const singleSeg = (desc & 32) !== 0;
  const checksum = (desc & 4) !== 0;
  const dictFlag = desc & 3;
  const dictBytes = dictFlag === 3 ? 4 : dictFlag;
  const contentSizeBytes = csf === 0 ? (singleSeg ? 1 : 0) : 1 << csf;
  let remaining = (singleSeg ? 0 : 1) + dictBytes + contentSizeBytes;
  if (buf.length - o < remaining) return null;
  o += remaining;
  for (;;) {
    if (buf.length - o < 3) return null;
    const bh = buf.readUIntLE(o, 3);
    o += 3;
    const last = (bh & 1) !== 0;
    const bt = (bh >>> 1) & 3;
    const bs = bh >>> 3;
    if (bt === 3) return null;
    const payload = bt === 1 ? 1 : bs;
    if (buf.length - o < payload) return null;
    o += payload;
    if (last) break;
  }
  if (checksum) o += 4;
  return { start: offset, end: o };
}

function decompressZstd(buf) {
  let offset = 0;
  let out = "";
  for (;;) {
    const f = scanFrame(buf, offset);
    if (!f) break;
    try {
      out += zstdDecompressSync(buf.subarray(f.start, f.end)).toString("utf8");
    } catch {
      break;
    }
    offset = f.end;
    if (offset >= buf.length) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 会话日志定位（扫描 <DSH_HOME>/sessions/**/session.jsonl.zstd，按文件头 id 匹配）
// ---------------------------------------------------------------------------
const sessionFileCache = new Map(); // sessionId -> 文件路径

function walkForSession(root, sessionId) {
  let found = "";
  const visit = (dir) => {
    if (found) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (found) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.name === "session.jsonl.zstd") {
        try {
          const buf = readFileSync(p);
          const f = scanFrame(buf, 0);
          if (!f) return;
          const head = JSON.parse(
            zstdDecompressSync(buf.subarray(f.start, f.end)).toString("utf8").split("\n", 1)[0]
          );
          if (head && head.id === sessionId) found = p;
        } catch {}
      }
    }
  };
  visit(root);
  return found;
}

function findSessionFile(sessionId) {
  if (!sessionId) return "";
  if (sessionFileCache.has(sessionId)) return sessionFileCache.get(sessionId);
  // 容错：客户端可能传入完整 id（session-<uuid>）或仅 uuid 部分，两种都试
  const cands = new Set([sessionId]);
  if (sessionId.startsWith("session-")) cands.add(sessionId.slice("session-".length));
  else cands.add("session-" + sessionId);
  let file = "";
  for (const c of cands) {
    file = walkForSession(join(dshHome(), "sessions"), c);
    if (file) break;
  }
  sessionFileCache.set(sessionId, file);
  return file;
}

// ---------------------------------------------------------------------------
// 事件解析辅助
// ---------------------------------------------------------------------------
function extractRole(ev) {
  const t = ev && typeof ev.type === "string" ? ev.type : "";
  if (t === "user/message") return "user";
  if (t === "assistant/message") return "assistant";
  return "";
}

function extractText(ev) {
  const d = ev && ev.data;
  if (!d) return "";
  // user/message: data.content 为 [{ type:"text", text }]
  if (Array.isArray(d.content))
    return d.content.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
  if (typeof d.content === "string") return d.content;
  // assistant/message: data.message.content 为 [{ type:"text"|"reasoning", text }]
  const mc = d.message && d.message.content;
  if (Array.isArray(mc))
    return mc
      .map((p) =>
        p && (p.type === "text" || p.type === "reasoning") && typeof p.text === "string"
          ? p.text
          : ""
      )
      .join("");
  if (typeof mc === "string") return mc;
  return "";
}

// ---------------------------------------------------------------------------
// 会话解析（文件 + transcript + provider/model + title）
// ---------------------------------------------------------------------------
const EMPTY = {
  title: "",
  files: [],
  transcript: [],
  truncated: false,
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
};

const parseCache = new Map(); // 文件 -> { mtimeMs, result }

function parseSessionFile(file) {
  let raw;
  try {
    raw = decompressZstd(readFileSync(file));
  } catch {
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return { ...EMPTY };
    }
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const seenFiles = new Map();
  const transcriptRaw = [];
  let title = "";
  let provider = "";
  let model = "";

  for (const line of lines) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!ev || typeof ev !== "object") continue;

    // 标题
    if (ev.type === "session/title" && ev.data && typeof ev.data.title === "string")
      title = ev.data.title;
    else if (ev.type === "session" && typeof ev.title === "string") title = ev.title;

    // provider/model：取自 request/header（data.header.config）或 request/context
    // （data.provider/data.model），最后一次为准。
    if (ev.type === "request/header" && ev.data) {
      const cfg = (ev.data.config || (ev.data.header && ev.data.header.config)) || null;
      if (cfg) {
        if (cfg.provider) provider = String(cfg.provider);
        if (cfg.model) model = String(cfg.model);
      }
    } else if (ev.type === "request/context" && ev.data) {
      if (ev.data.provider) provider = String(ev.data.provider);
      if (ev.data.model) model = String(ev.data.model);
    }

    // 文件捕获：tool/code-dispatch* 事件
    if (ev.type === "tool/code-dispatch" || ev.type === "tool/code-dispatch-start") {
      const name = ev.data && ev.data.name;
      const args = (ev.data && ev.data.arguments) || {};
      if (name === "read" || name === "write" || name === "edit") {
        const p = typeof args.file_path === "string" ? args.file_path.trim() : "";
        if (p)
          seenFiles.set(p, {
            path: p,
            op: name === "read" ? "read" : name === "edit" ? "edit" : "write",
          });
      } else if (
        (name === "grep" || name === "glob") &&
        typeof args.path === "string" &&
        args.path.trim() &&
        !seenFiles.has(args.path.trim())
      ) {
        seenFiles.set(args.path.trim(), { path: args.path.trim(), op: "search" });
      }
    }

    // transcript
    const role = extractRole(ev);
    if (role === "user" || role === "assistant") {
      const text = extractText(ev);
      if (text) transcriptRaw.push({ role, text });
    }
  }

  // 截断 transcript
  let transcript = transcriptRaw;
  if (transcript.length > MAX_TRANSCRIPT_MSGS)
    transcript = transcript.slice(transcript.length - MAX_TRANSCRIPT_MSGS);
  let chars = transcript.reduce((n, m) => n + m.text.length, 0);
  if (chars > MAX_TRANSCRIPT_CHARS) {
    const kept = [];
    for (let i = transcript.length - 1; i >= 0; i--) {
      kept.unshift(transcript[i]);
      if (kept.reduce((n, m) => n + m.text.length, 0) > MAX_TRANSCRIPT_CHARS) {
        kept.shift();
        break;
      }
    }
    transcript = kept;
  }

  let files = [...seenFiles.values()];
  let truncated = false;
  if (files.length > MAX_FILES_TOTAL) {
    files = files.slice(files.length - MAX_FILES_TOTAL);
    truncated = true;
  }

  return {
    title,
    files,
    transcript,
    truncated,
    provider: provider || DEFAULT_PROVIDER,
    model: model || readGlobalModel(),
  };
}

function parseSession(sessionId) {
  const file = findSessionFile(sessionId);
  if (!file) return { ...EMPTY };
  let mtime = 0;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {}
  const cached = parseCache.get(file);
  if (cached && cached.mtimeMs === mtime) return cached.result;
  const result = parseSessionFile(file);
  parseCache.set(file, { mtimeMs: mtime, result });
  return result;
}

// ---------------------------------------------------------------------------
// 文件上下文块：读取涉及文件的【当前磁盘内容】注入提问
// ---------------------------------------------------------------------------
function buildFileContext(sessionId) {
  const { files } = parseSession(sessionId);
  if (!files || files.length === 0) return "";
  const picked = files.slice(0, MAX_FILES_IN_PROMPT);
  const blocks = [];
  let total = 0;
  for (const f of picked) {
    if (total >= MAX_FILE_BLOCK_CHARS) break;
    // search op（grep/glob 捕获）的 path 通常是检索根/目录，读取会失败 → 只列路径
    if (f.op === "search") {
      blocks.push("### " + f.path + " [search 检索根目录，不读取内容]");
      continue;
    }
    let content = "";
    try {
      if (isAbsolute(f.path)) content = readFileSync(f.path, "utf8");
    } catch {
      content = "(文件当前不存在于磁盘或无法读取)";
    }
    content = clamp(content, MAX_FILE_TEXT);
    total += content.length;
    blocks.push(
      "### " + f.path + " [" + f.op + "]\n```\n" + content + "\n```"
    );
  }
  if (blocks.length === 0) return "";
  return (
    "## 当前会话涉及的文件（取当前磁盘内容；op: read=读取 / write=写入 / edit=编辑 / search=检索根目录）\n" +
    blocks.join("\n\n")
  );
}

// 将客户端消息拆分为「客户端 system」+「其余消息」，并拼上文件上下文块
function buildFinalPrompt(body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const firstIsSystem = msgs.length && msgs[0] && msgs[0].role === "system";
  const clientSystem = firstIsSystem ? String(msgs[0].content || "") : "";
  const rest = firstIsSystem ? msgs.slice(1) : msgs;
  const fileBlock = buildFileContext(String(body.sessionId || "").trim());
  const system = (fileBlock ? fileBlock + "\n\n" : "") + clientSystem;
  return { system, rest };
}

// ---------------------------------------------------------------------------
// HTTP 工具
// ---------------------------------------------------------------------------
function isLoopback(req) {
  const ra = req.socket && req.socket.remoteAddress;
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(data.length),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// 路由：/context
// ---------------------------------------------------------------------------
async function handleContext(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  if (!isLoopback(req)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    sendJson(res, 400, { error: "bad request URL" });
    return;
  }
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) {
    sendJson(res, 400, { error: "sessionId is required" });
    return;
  }
  try {
    const live = liveContexts.get(sessionId);
    const parsed = parseSession(sessionId);
    const data = {
      sessionId,
      title: (live && live.title) || parsed.title || "",
      transcript:
        live && live.transcript && live.transcript.length
          ? live.transcript
          : parsed.transcript || [],
      files:
        live && live.files && live.files.length ? live.files : parsed.files || [],
      truncated: (live && live.truncated) || parsed.truncated || false,
      live: !!live,
    };
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: String((err && err.message) || err) });
  }
}

// ---------------------------------------------------------------------------
// 路由：/ask（mode1 / mode2 流式代理；mode3 走 ctx.llm）
// ---------------------------------------------------------------------------
function resolveKeyForMode(mode, settings) {
  if (mode === "2") {
    const key = (settings && settings.apiKey ? String(settings.apiKey) : "").trim();
    const model = (settings && settings.model ? String(settings.model) : "") || DEFAULT_MODEL;
    const endpoint = (
      settings && settings.endpoint ? String(settings.endpoint) : ""
    ).replace(/\/+$/, "") || DEFAULT_BASE;
    return { key, model, base: endpoint, source: "plugin" };
  }
  return {
    key: readGlobalKey(),
    model: readGlobalModel(),
    base: globalBase(),
    source: "global",
  };
}

async function handleAskMode3(req, res, body, sessionId) {
  if (!ctxRef || !ctxRef.llm || typeof ctxRef.llm.stream !== "function") {
    sendJson(res, 500, { error: "宿主 LLM 服务(ctx.llm)当前不可用" });
    return;
  }
  const { system, rest } = buildFinalPrompt(body);
  const parsed = parseSession(sessionId);
  const provider = String(body.provider || parsed.provider || DEFAULT_PROVIDER);
  const model = String(body.model || parsed.model || readGlobalModel());
  const llmMessages = rest.map((m) => ({
    role: m.role,
    content: [{ type: "text", text: String(m.content || "") }],
  }));

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  try {
    const stream = ctxRef.llm.stream({ provider, model, system, messages: llmMessages });
    for await (const chunk of stream) {
      if (chunk && chunk.type === "text-delta" && typeof chunk.text === "string") {
        res.write(
          "data: " + JSON.stringify({ choices: [{ delta: { content: chunk.text } }] }) + "\n\n"
        );
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    try {
      res.write(
        "data: " +
          JSON.stringify({ error: String((err && err.message) || err) }) +
          "\n\n"
      );
      res.write("data: [DONE]\n\n");
    } catch {}
    try {
      res.end();
    } catch {}
  }
}

async function handleAsk(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  if (!isLoopback(req)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }
  const mode = String(body.mode || "1");
  const sessionId = String(body.sessionId || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    sendJson(res, 400, { error: "messages 为空" });
    return;
  }

  if (mode === "3") {
    return handleAskMode3(req, res, body, sessionId);
  }

  const cfg = resolveKeyForMode(mode, body.pluginSettings || lastSettings);
  if (!cfg.key) {
    const msg =
      mode === "2"
        ? "插件 API Key 为空：请在临时会话面板「插件密钥」处填写，或在设置里配置 dsh-side-session.apiKey"
        : "DSH 全局 Key 为空：请先在 DSH 主程序配置 DeepSeek API Key（设置页或环境变量 DEEPSEEK_API_KEY）";
    sendJson(res, 400, { error: "no-key", message: msg });
    return;
  }

  const { system, rest } = buildFinalPrompt(body);
  const upstreamUrl = cfg.base + "/chat/completions";
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + cfg.key,
        "user-agent": "dsh-side-session",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: system }].concat(rest),
        stream: true,
      }),
    });
  } catch (err) {
    sendJson(res, 502, { error: "上游请求失败：" + String((err && err.message) || err) });
    return;
  }
  if (!upstream.ok) {
    const hint = await upstream.text().catch(() => "");
    sendJson(res, 502, {
      error: "上游返回 " + upstream.status + (hint ? "：" + hint.slice(0, 300) : ""),
    });
    return;
  }
  // 透传 SSE
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  try {
    if (upstream.body && typeof upstream.body.pipe === "function") {
      upstream.body.pipe(res);
    } else {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    }
  } catch (err) {
    try {
      res.write(
        "\ndata: " +
          JSON.stringify({ error: String((err && err.message) || err) }) +
          "\n\n"
      );
    } catch {}
    try {
      res.end();
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// 实时上下文缓存：订阅会话事件流（比日志解析更实时）
// ---------------------------------------------------------------------------
const liveContexts = new Map(); // sessionId -> {title, transcript, files, truncated, updatedAt}

function pickEventText(e) {
  if (!e) return "";
  if (typeof e.content === "string") return e.content;
  if (Array.isArray(e.content)) {
    return e.content
      .map((c) => (typeof c === "string" ? c : c && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  if (typeof e.text === "string") return e.text;
  return "";
}

function extractLive(session) {
  if (!session || typeof session.id !== "string") return null;
  const events = Array.isArray(session.events) ? session.events : [];
  if (!events.length) return null;
  const transcript = [];
  const files = [];
  const seenFiles = new Set();
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const type = typeof e.type === "string" ? e.type : "";
    const text = pickEventText(e);
    if (text) {
      const t = typeof e.time === "number" ? e.time : 0;
      if (type.includes("user")) transcript.push({ role: "user", text, t });
      else if (type.includes("assistant")) transcript.push({ role: "assistant", text, t });
      else if (/^\[Turn/.test(text)) {
        transcript.push({ role: type.includes("user") ? "user" : "assistant", text, t });
      }
    }
    const diffs = e.meta && Array.isArray(e.meta.diffs) ? e.meta.diffs : null;
    if (diffs) {
      for (const d of diffs) {
        if (d && typeof d.path === "string" && !seenFiles.has(d.path)) {
          seenFiles.add(d.path);
          files.push({ path: d.path, op: d.op || "edit", oldText: d.oldText, newText: d.newText });
        }
      }
    } else {
      const fp =
        typeof e.file_path === "string"
          ? e.file_path
          : typeof e.path === "string"
            ? e.path
            : "";
      if (fp && !seenFiles.has(fp)) {
        seenFiles.add(fp);
        files.push({ path: fp, op: "read" });
      }
    }
  }
  if (!transcript.length && !files.length) return null;
  return {
    title:
      session.header && typeof session.header.title === "string" ? session.header.title : "",
    transcript: transcript.slice(-MAX_TRANSCRIPT_MSGS),
    files: files.slice(-MAX_FILES_TOTAL),
    truncated: transcript.length > MAX_TRANSCRIPT_MSGS,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------
let lastSettings = {};
let ctxRef = null;

const name = "@dsh-external/dsh-side-session";
const inject = ["settings", "webServer", "llm"];

function apply(ctx, config) {
  ctxRef = ctx;
  // 注册设置节（失败不阻断启动）
  try {
    const scope = ctx.settings.register(NS, Config, { base: config || {} });
    lastSettings = scope.get();
    scope.watch(() => {
      lastSettings = scope.get();
    });
  } catch (err) {
    console.warn(
      "[dsh-side-session] 设置节注册失败（将使用默认配置）：" +
        String((err && err.message) || err)
    );
  }

  const disposers = [
    ctx.webServer.register({ kind: "exact", path: CONTEXT_ROUTE, handler: handleContext }),
    ctx.webServer.register({ kind: "exact", path: ASK_ROUTE, handler: handleAsk }),
  ];

  // 实时上下文：订阅会话事件流（主对话消息/文件变化即时进入缓存）。
  // 订阅必须挂在 ctx.effect 内（apply 阶段 ctx.on 不可用）；失败不阻断插件。
  try {
  disposers.push(
    ctx.effect(() => {
      const ds = [];
      if (typeof ctx.on === "function") {
        try {
          ds.push(
            ctx.on("session/event", (s) => {
              const lv = extractLive(s);
              if (lv) liveContexts.set(s.id, lv);
            }),
            ctx.on("session/disposed", (s) => {
              if (s && s.id) liveContexts.delete(s.id);
            })
          );
        } catch (err) {
          console.warn(
            "[dsh-side-session] 实时上下文订阅失败：" + String((err && err.message) || err)
          );
        }
      }
      return () => {
        for (const d of ds) {
          try {
            d();
          } catch {}
        }
      };
    }, "dsh-side-session: live context subscriptions")
  );
  } catch (err) {
    console.warn(
      "[dsh-side-session] ctx.effect 实时订阅挂载失败：" + String((err && err.message) || err)
    );
  }
  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {}
    }
  };
}

export { apply, inject, name };