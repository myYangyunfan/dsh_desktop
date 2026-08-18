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

// 截断上限：三档上下文长度（1=标准 / 2=加长 / 3=完整），随设置动态生效
const CONTEXT_PRESETS = {
  "1": { msgs: 120, chars: 40 * 1024, filesInPrompt: 24, fileText: 24 * 1024, blockChars: 200 * 1024, filesTotal: 200 },
  "2": { msgs: 600, chars: 200 * 1024, filesInPrompt: 80, fileText: 64 * 1024, blockChars: 800 * 1024, filesTotal: 500 },
  "3": { msgs: 5000, chars: 2 * 1024 * 1024, filesInPrompt: 300, fileText: 256 * 1024, blockChars: 4 * 1024 * 1024, filesTotal: 1000 },
};
function ctxLen() {
  const key = String((lastSettings && lastSettings.contextLength) || "2");
  return CONTEXT_PRESETS[key] || CONTEXT_PRESETS["2"];
}
const MAX_FILE_TEXT = 24 * 1024; // 标准档单文件文本（兼容引用）
const MAX_FILES_IN_PROMPT = 24; // 标准档注入文件数（兼容引用）
const MAX_FILES_TOTAL = 200; // 标准档文件列表上限（兼容引用）
const MAX_FILE_BLOCK_CHARS = 200 * 1024; // 标准档文件内容合计（兼容引用）
const MAX_TRANSCRIPT_MSGS = 120; // 标准档消息数（兼容引用）
const MAX_TRANSCRIPT_CHARS = 40 * 1024; // 标准档字符上限（兼容引用）

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
  contextLength: z
    .string()
    .default("2")
    .description("上下文长度：1=标准（120 条/40K，省 token）；2=加长（600 条/200K，推荐）；3=完整（5000 条/2M，最接近通读，token 消耗大）"),
  animMs: z
    .number()
    .default(500)
    .description("浮窗弹出动画时长（毫秒，0=关闭动画）"),
});

function clamp(text, max) {
  return typeof text === "string" && text.length > max
    ? text.slice(0, max) + "\n…(已截断)"
    : text;
}

// ---------------------------------------------------------------------------
// dsh 全局凭据解析（取自 dsh-desktop/balance.js 的实测实现，逐行对齐）
// v0.3.0 起改为「当前会话供应商感知」：不再只认 DEEPSEEK_API_KEY，
// 而是实时读取 agent-default-model 的 provider/model，再解析该供应商的
// apiKeyEnv（settings.yaml 的 llm-pi-ai.providers.<p>.apiKeyEnv 优先，
// 其次内置已知表，最后启发式 `${PROVIDER}_API_KEY`），并据此取 key / base。
// ---------------------------------------------------------------------------
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

// 内置已知供应商表：base = OpenAI 兼容 /chat/completions 基址（无尾斜杠），
// env = 该供应商的凭据 env 名（与 pi-ai env-api-keys 对齐），openai = 是否
// OpenAI 兼容协议（否则 mode1 直连不支持，提示转 mode3/mode2）。
const KNOWN_PROVIDERS = {
  deepseek: { base: "https://api.deepseek.com", env: "DEEPSEEK_API_KEY", openai: true },
  "opencode-go": { base: "https://opencode.ai/zen/go/v1", env: "OPENCODE_API_KEY", openai: true },
  opencode: { base: "https://opencode.ai/zen/v1", env: "OPENCODE_API_KEY", openai: true },
  openai: { base: "https://api.openai.com/v1", env: "OPENAI_API_KEY", openai: true },
  openrouter: { base: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", openai: true },
  groq: { base: "https://api.groq.com/openai/v1", env: "GROQ_API_KEY", openai: true },
  cerebras: { base: "https://api.cerebras.ai/v1", env: "CEREBRAS_API_KEY", openai: true },
  xai: { base: "https://api.x.ai/v1", env: "XAI_API_KEY", openai: true },
  mistral: { base: "https://api.mistral.ai", env: "MISTRAL_API_KEY", openai: true },
  moonshotai: { base: "https://api.moonshot.ai/v1", env: "MOONSHOT_API_KEY", openai: true },
  "moonshotai-cn": { base: "https://api.moonshot.cn/v1", env: "MOONSHOT_API_KEY", openai: true },
  nvidia: { base: "https://integrate.api.nvidia.com/v1", env: "NVIDIA_API_KEY", openai: true },
  huggingface: { base: "https://router.huggingface.co/v1", env: "HF_TOKEN", openai: true },
  fireworks: { base: "https://api.fireworks.ai/inference", env: "FIREWORKS_API_KEY", openai: true },
  together: { base: "https://api.together.ai/v1", env: "TOGETHER_API_KEY", openai: true },
  zai: { base: "https://api.z.ai/api/coding/paas/v4", env: "ZAI_API_KEY", openai: true },
  "zai-coding-cn": { base: "https://open.bigmodel.cn/api/coding/paas/v4", env: "ZAI_CODING_CN_API_KEY", openai: true },
  "kimi-coding": { base: "https://api.kimi.com/coding", env: "KIMI_API_KEY", openai: true },
  "qwen-token-plan": { base: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1", env: "QWEN_TOKEN_PLAN_API_KEY", openai: true },
  "qwen-token-plan-cn": { base: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", env: "QWEN_TOKEN_PLAN_CN_API_KEY", openai: true },
  "ant-ling": { base: "https://api.ant-ling.com/v1", env: "ANT_LING_API_KEY", openai: true },
  xiaomi: { base: "https://api.xiaomimimo.com/v1", env: "XIAOMI_API_KEY", openai: true },
  "github-copilot": { base: "https://api.individual.githubcopilot.com", env: "COPILOT_GITHUB_TOKEN", openai: true },
  // 非 OpenAI 兼容协议：mode1 直连 /chat/completions 不适用，建议 mode3/mode2
  anthropic: { base: "https://api.anthropic.com", env: "ANTHROPIC_API_KEY", openai: false },
  google: { base: "https://generativelanguage.googleapis.com/v1beta", env: "GEMINI_API_KEY", openai: false },
  "google-vertex": { base: "", env: "GOOGLE_CLOUD_API_KEY", openai: false },
  "cloudflare-workers-ai": { base: "", env: "CLOUDFLARE_API_KEY", openai: false },
  "cloudflare-ai-gateway": { base: "", env: "CLOUDFLARE_API_KEY", openai: false },
  "vercel-ai-gateway": { base: "", env: "AI_GATEWAY_API_KEY", openai: false },
  "azure-openai-responses": { base: "", env: "AZURE_OPENAI_API_KEY", openai: false },
};

// 当前会话默认模型选择（agent-default-model 段），轻缓存 5s。
let activeSelectionCache = null; // { at, value: {provider, model} }

function readActiveSelection() {
  if (activeSelectionCache && Date.now() - activeSelectionCache.at < 5000) {
    return activeSelectionCache.value;
  }
  const sel = { provider: "", model: "", reasoningEffort: "" };
  try {
    const text = readFileSync(join(dshHome(), "settings.yaml"), "utf8");
    // 仅锚定 agent-default-model 段内的行，避免误读其它命名空间的同名键。
    // match 返回 [全文, ...]，取 [0] 才是匹配文本。
    const m0 =
      text.match(/agent-default-model:[\s\S]*?(?=^\S)/m) ||
      text.match(/agent-default-model:[\s\S]*$/m);
    const block = m0 ? m0[0] : "";
    const p = block.match(/^\s*provider\s*:\s*(\S+)/m);
    const md = block.match(/^\s*model\s*:\s*(\S+)/m);
    const re = block.match(/^\s*reasoningEffort\s*:\s*(\S+)/m);
    if (p) sel.provider = p[1];
    if (md) sel.model = md[1];
    if (re) sel.reasoningEffort = re[1];
  } catch {}
  activeSelectionCache = { at: Date.now(), value: sel };
  return sel;
}

// 读取 settings.yaml 里 llm-pi-ai.providers.<provider> 的 apiKeyEnv / baseURL
function readProviderProfile(provider) {
  try {
    const text = readFileSync(join(dshHome(), "settings.yaml"), "utf8");
    const lines = text.split(/\r?\n/);
    let top = -1;
    for (let k = 0; k < lines.length; k++) {
      if (/^llm-pi-ai\s*:/.test(lines[k])) {
        top = k;
        break;
      }
    }
    if (top < 0) return {};
    const block = [];
    let k = top + 1;
    while (k < lines.length && (/^\s+\S/.test(lines[k]) || lines[k].trim() === "")) {
      block.push(lines[k]);
      k++;
    }
    let pIdx = -1;
    for (let b = 0; b < block.length; b++) {
      if (/^\s*providers\s*:/.test(block[b])) {
        pIdx = b;
        break;
      }
    }
    if (pIdx < 0) return {};
    const baseIndent = ((block[pIdx].match(/^(\s*)/) || [])[1] || "").length;
    let target = -1;
    let targetIndent = -1;
    for (let b = pIdx + 1; b < block.length; b++) {
      const ln = block[b];
      if (!ln.trim()) continue;
      const indent = ((ln.match(/^(\s*)/) || [])[1] || "").length;
      if (indent <= baseIndent) break;
      const m = ln.match(/^\s*([A-Za-z0-9_.-]+)\s*:/);
      if (m && m[1] === provider) {
        target = b;
        targetIndent = indent;
        break;
      }
    }
    if (target < 0) return {};
    const prof = {};
    for (let b = target + 1; b < block.length; b++) {
      const ln = block[b];
      if (!ln.trim() || !/^\s+/.test(ln)) break;
      const indent = ((ln.match(/^(\s*)/) || [])[1] || "").length;
      if (indent <= targetIndent) break;
      const kv = ln.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kv && ["apiKeyEnv", "baseURL", "api"].indexOf(kv[1]) >= 0) {
        prof[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
      }
    }
    return prof;
  } catch {
    return {};
  }
}

// 按供应商解析 API Key：优先环境变量 → DSH 凭据服务（credentials.resolve）
// → ~/.dsh/.credentials.yaml 扁平键 regex。apiKeyEnv 取 profile 覆盖优先。
async function resolveProviderKey(provider, profile) {
  const env =
    (profile && profile.apiKeyEnv) ||
    (KNOWN_PROVIDERS[provider] && KNOWN_PROVIDERS[provider].env) ||
    (provider ? provider.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase() + "_API_KEY" : "") ||
    "";
  // 1) 环境变量
  if (process.env[env]) return { key: process.env[env].trim(), env };
  // 2) DSH 凭据服务（若宿主提供 credentials 服务）
  try {
    if (ctxRef && ctxRef.get) {
      const svc = ctxRef.get("credentials", false);
      if (svc && typeof svc.resolve === "function") {
        const hit = await svc.resolve(env);
        const v = hit && hit.value;
        if (v && String(v).length) return { key: String(v).trim(), env };
      }
    }
  } catch {}
  // 3) ~/.dsh/.credentials.yaml 扁平 key: value 行
  try {
    const text = readFileSync(join(dshHome(), ".credentials.yaml"), "utf8");
    const re = new RegExp(
      "^\\s*" + env.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*[\"']?([^\"'\\s#]+)"
    );
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(re);
      if (m) return { key: m[1], env };
    }
  } catch {}
  return { key: "", env };
}

// 按供应商解析 OpenAI 兼容基址（无尾斜杠）：profile.baseURL → KNOWN_PROVIDERS.base
function resolveProviderBase(provider, profile) {
  const base =
    (profile && profile.baseURL) ||
    (KNOWN_PROVIDERS[provider] && KNOWN_PROVIDERS[provider].base) ||
    "";
  return base.replace(/\/+$/, "");
}

// mode1 用：解析「当前会话 provider/model」+ 该供应商的 key/base。
// 优先 body（客户端当前会话上下文）→ 会话日志 parsed → agent-default-model。
// 返回 { key, model, base, source, provider, env, openai, reason }。
async function resolveGlobalForMode1(body, parsed) {
  const active = readActiveSelection();
  const provider =
    String(
      (body && body.provider) ||
        (parsed && parsed.provider) ||
        active.provider ||
        ""
    ) || "deepseek";
  const model =
    String(
      (body && body.model) ||
        (parsed && parsed.model) ||
        active.model ||
        ""
    ) || DEFAULT_MODEL;
  const profile = readProviderProfile(provider);
  const known = KNOWN_PROVIDERS[provider] || {};
  const openai = profile.api
    ? String(profile.api).indexOf("openai") >= 0
    : known.openai !== false;
  const base = resolveProviderBase(provider, profile);
  if (!base) {
    return {
      key: "",
      model,
      base: "",
      source: "global",
      provider,
      env: (profile && profile.apiKeyEnv) || known.env || "",
      openai,
      reason: "unknown-provider",
    };
  }
  const { key, env } = await resolveProviderKey(provider, profile);
  return {
    key,
    model,
    base,
    source: "global",
    provider,
    env,
    openai,
    reason: key ? "ok" : "no-key",
  };
}

// 兼容旧引用：agent-default-model 段的 model（与 balance.readActiveModel 一致）
function readGlobalModel() {
  return readActiveSelection().model || DEFAULT_MODEL;
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
function capMap(map, max) {
  if (map.size <= max) return;
  let extra = map.size - max;
  for (const key of map.keys()) {
    map.delete(key);
    if (--extra <= 0) break;
  }
}
const CACHE_MAX = 200;

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
  capMap(sessionFileCache, CACHE_MAX);
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

const parseCache = new Map(); // 文件 -> { mtimeMs, size, firstMagic, frameEnd, at, state }
// state = 增量累计状态；transcript 窗口与 seenFiles 上限的维护保证与「全量
// 解析的最近 N 条」语义完全一致（日志只追加，窗口 = 全量最近 N 条）。
const SEEN_FILES_MAX = 2000; // seenFiles 兜底上限（远大于任何档位的 filesTotal）

function freshParseState() {
  return { title: "", provider: "", model: "", seenFiles: new Map(), transcript: [] };
}

/** 逐行解析事件并累计进 state（增量与全量共用同一语义）。 */
function parseEventsInto(state, lines) {
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
      state.title = ev.data.title;
    else if (ev.type === "session" && typeof ev.title === "string") state.title = ev.title;

    // provider/model：取自 request/header（data.header.config）或 request/context
    // （data.provider/data.model），最后一次为准。
    if (ev.type === "request/header" && ev.data) {
      const cfg = (ev.data.config || (ev.data.header && ev.data.header.config)) || null;
      if (cfg) {
        if (cfg.provider) state.provider = String(cfg.provider);
        if (cfg.model) state.model = String(cfg.model);
      }
    } else if (ev.type === "request/context" && ev.data) {
      if (ev.data.provider) state.provider = String(ev.data.provider);
      if (ev.data.model) state.model = String(ev.data.model);
    }

    // 文件捕获：tool/code-dispatch* 事件
    if (ev.type === "tool/code-dispatch" || ev.type === "tool/code-dispatch-start") {
      const name = ev.data && ev.data.name;
      const args = (ev.data && ev.data.arguments) || {};
      if (name === "read" || name === "write" || name === "edit") {
        const p = typeof args.file_path === "string" ? args.file_path.trim() : "";
        if (p) {
          state.seenFiles.set(p, {
            path: p,
            op: name === "read" ? "read" : name === "edit" ? "edit" : "write",
          });
          if (state.seenFiles.size > SEEN_FILES_MAX) {
            state.seenFiles.delete(state.seenFiles.keys().next().value);
          }
        }
      } else if (
        (name === "grep" || name === "glob") &&
        typeof args.path === "string" &&
        args.path.trim() &&
        !state.seenFiles.has(args.path.trim())
      ) {
        state.seenFiles.set(args.path.trim(), { path: args.path.trim(), op: "search" });
      }
    }

    // transcript（窗口维护：只保留最近 L.msgs 条）
    const role = extractRole(ev);
    if (role === "user" || role === "assistant") {
      const text = extractText(ev);
      if (text) {
        state.transcript.push({ role, text });
        const L = ctxLen();
        if (state.transcript.length > L.msgs) state.transcript.shift();
      }
    }
  }
}

/**
 * 从字节偏移 from 起扫描完整 zstd 帧并解压（尾部半帧自动忽略，下次轮询
 * 续解）。返回 { text, end }：end 为最后一个完整帧的结束偏移。
 */
function decompressFrames(buf, from) {
  let offset = from;
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
  return { text: out, end: offset };
}

/** 把累计状态渲染为对外结果（按档位截断，与全量解析一致）。 */
function renderState(state) {
  const L = ctxLen();
  let transcript = state.transcript;
  let chars = transcript.reduce((n, m) => n + m.text.length, 0);
  if (chars > L.chars) {
    const kept = [];
    for (let i = transcript.length - 1; i >= 0; i--) {
      kept.unshift(transcript[i]);
      if (kept.reduce((n, m) => n + m.text.length, 0) > L.chars) {
        kept.shift();
        break;
      }
    }
    transcript = kept;
  }
  let files = [...state.seenFiles.values()];
  let truncated = false;
  if (files.length > L.filesTotal) {
    files = files.slice(files.length - L.filesTotal);
    truncated = true;
  }
  return {
    title: state.title,
    files,
    transcript,
    truncated,
    provider: state.provider || DEFAULT_PROVIDER,
    model: state.model || readGlobalModel(),
  };
}

/**
 * 会话解析（增量版）：大日志（实测 7MB 压缩 ≈ 20MB 文本）不再每次全量
 * 解压+逐行解析（约 600ms 同步阻塞，会拖慢同进程的聊天请求），而是只解
 * 自上次帧边界以来的新帧、累计进 state；文件被整体替换（首帧 magic 变化 /
 * 体积回退 / 帧边界失效）时自动回退全量解析。结果与全量解析逐字节等价。
 */
function parseSession(sessionId) {
  const file = findSessionFile(sessionId);
  if (!file) return { ...EMPTY };
  let st;
  try {
    st = statSync(file);
  } catch {
    return { ...EMPTY };
  }
  const cached = parseCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return renderState(cached.state);

  const buf = readFileSync(file);
  const firstMagic = buf.length >= 4 ? buf.readUInt32LE(0) : 0;
  let state = null;
  let frameEnd = buf.length;
  // 增量路径：同一文件（首帧 magic 相同）且缓存边界有效 → 只解新帧
  if (
    cached &&
    cached.firstMagic === firstMagic &&
    cached.frameEnd > 0 &&
    cached.frameEnd <= buf.length &&
    cached.size <= st.size
  ) {
    const inc = decompressFrames(buf, cached.frameEnd);
    if (inc.text) {
      state = cached.state;
      parseEventsInto(state, inc.text.split(/\r?\n/).filter(Boolean));
      frameEnd = inc.end;
    } else {
      // 无完整新帧（可能正在写半帧）：沿用旧状态，边界不动
      state = cached.state;
      frameEnd = cached.frameEnd;
    }
  }
  if (!state) {
    // 全量（无缓存 / 文件被替换 / 边界失效）
    let raw;
    try {
      raw = decompressZstd(buf);
    } catch {
      try {
        raw = buf.toString("utf8");
      } catch {
        return { ...EMPTY };
      }
    }
    state = freshParseState();
    parseEventsInto(state, raw.split(/\r?\n/).filter(Boolean));
    frameEnd = decompressFrames(buf, 0).end;
  }
  parseCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, firstMagic, frameEnd, at: Date.now(), state });
  capMap(parseCache, CACHE_MAX);
  return renderState(state);
}

/** 测试用：清空解析缓存。 */
function resetParseCacheForTest() {
  parseCache.clear();
}

// ---------------------------------------------------------------------------
// 文件上下文块：读取涉及文件的【当前磁盘内容】注入提问
// ---------------------------------------------------------------------------
function buildFileContext(sessionId) {
  const { files } = parseSession(sessionId);
  if (!files || files.length === 0) return "";
  const L = ctxLen();
  const picked = files.slice(0, L.filesInPrompt);
  const blocks = [];
  let total = 0;
  for (const f of picked) {
    if (total >= L.blockChars) break;
    let content = "";
    try {
      if (isAbsolute(f.path)) {
        // 先 stat：超大文件只读前 N KB；二进制跳过（避免 utf8 乱码注入）
        const st = statSync(f.path);
        if (st.isFile()) {
          const isBinary = (() => {
            const fd = fsp.openSync(f.path, "r");
            try {
              const buf = Buffer.alloc(4096);
              const n = fsp.readSync(fd, buf, 0, 4096, 0);
              for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
              return false;
            } finally {
              fsp.closeSync(fd);
            }
          })();
          if (isBinary) {
            content = `(二进制文件，${st.size} 字节，跳过内容注入)`;
          } else if (st.size > L.fileText) {
            const fd = fsp.openSync(f.path, "r");
            try {
              const buf = Buffer.alloc(L.fileText);
              const n = fsp.readSync(fd, buf, 0, L.fileText, 0);
              content = buf.toString("utf8", 0, n) + "\n…(文件过大，仅注入前 " + L.fileText + " 字节)";
            } finally {
              fsp.closeSync(fd);
            }
          } else {
            content = readFileSync(f.path, "utf8");
          }
        }
      }
    } catch {
      content = "(文件当前不存在于磁盘或无法读取)";
    }
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
    const parsed = parseSession(sessionId);
    const active = readActiveSelection();
    // provider/model 回退：会话日志缺失 → 实时默认（agent-default-model），
    // 让 UI 始终能看到「当前会话实际使用的模型」（如 opencode-go/deepseek-v4-flash）。
    const provider =
      parsed.provider && parsed.provider !== DEFAULT_PROVIDER
        ? parsed.provider
        : active.provider || parsed.provider;
    const model = parsed.model || active.model || DEFAULT_MODEL;
    let updatedAt = 0;
    try {
      const file = findSessionFile(sessionId);
      if (file) updatedAt = statSync(file).mtimeMs;
    } catch {}
    if (url.searchParams.get("meta") === "1") {
      // 轻量轮询端点：只返回计数与指纹，避免每 2s 全量传输大 transcript
      sendJson(res, 200, {
        sessionId,
        title: parsed.title,
        msgs: parsed.transcript.length,
        files: parsed.files.length,
        truncated: parsed.truncated,
        provider,
        model,
        active: { provider: active.provider, model: active.model, reasoningEffort: active.reasoningEffort },
        updatedAt,
      });
      return;
    }
    sendJson(res, 200, {
      sessionId,
      ...parsed,
      provider,
      model,
      active: { provider: active.provider, model: active.model, reasoningEffort: active.reasoningEffort },
      updatedAt,
    });
  } catch (err) {
    sendJson(res, 500, { error: String((err && err.message) || err) });
  }
}

// ---------------------------------------------------------------------------
// 路由：/ask（mode1 / mode2 流式代理；mode3 走 ctx.llm）
// ---------------------------------------------------------------------------
// 路由 /ask 的密钥解析：
//   mode2 → 插件自带 key/model/endpoint（不变）；
//   mode1 → provider 感知：按「当前会话 / 实时默认」解析供应商的 key/base。
async function resolveKeyForMode(mode, settings, body, parsed) {
  const active = readActiveSelection();
  if (mode === "2") {
    const key = (settings && settings.apiKey ? String(settings.apiKey) : "").trim();
    const model =
      (settings && settings.model ? String(settings.model) : "") ||
      String((body && body.model) || (parsed && parsed.model) || "") ||
      active.model ||
      DEFAULT_MODEL;
    const endpoint = (
      settings && settings.endpoint ? String(settings.endpoint) : ""
    ).replace(/\/+$/, "") || DEFAULT_BASE;
    return { key, model, base: endpoint, source: "plugin", provider: "", env: "", openai: true, reason: key ? "ok" : "no-key" };
  }
  return resolveGlobalForMode1(body, parsed);
}

async function handleAskMode3(req, res, body, sessionId) {
  if (!ctxRef || !ctxRef.llm || typeof ctxRef.llm.stream !== "function") {
    sendJson(res, 500, { error: "宿主 LLM 服务(ctx.llm)当前不可用" });
    return;
  }
  const { system, rest } = buildFinalPrompt(body);
  const parsed = parseSession(sessionId);
  const active = readActiveSelection();
  const provider = String(
    body.provider || parsed.provider || active.provider || DEFAULT_PROVIDER
  );
  const model = String(
    body.model || parsed.model || active.model || readGlobalModel()
  );
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
      if (!chunk) continue;
      if (chunk.type === "text-delta" && typeof chunk.text === "string") {
        res.write(
          "data: " + JSON.stringify({ choices: [{ delta: { content: chunk.text } }] }) + "\n\n"
        );
      } else if (chunk.type === "error") {
        res.write(
          "data: " + JSON.stringify({ error: String(chunk.message || chunk.error || "宿主 LLM 错误") }) + "\n\n"
        );
      } else if (chunk.type === "finish" && chunk.reason && chunk.reason.kind === "error") {
        res.write(
          "data: " + JSON.stringify({ error: String((chunk.reason && chunk.reason.message) || "宿主 LLM 流结束于错误") }) + "\n\n"
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

  const parsed = parseSession(sessionId);
  const cfg = await resolveKeyForMode(mode, body.pluginSettings || lastSettings, body, parsed);
  if (cfg.reason === "unknown-provider") {
    const msg =
      "当前默认供应商「" +
      cfg.provider +
      "」未在内置已知表，且 settings.yaml 的 llm-pi-ai.providers." +
      cfg.provider +
      " 未配置 baseURL，无法确定 API 端点。请在 DSH 设置（llm-pi-ai）为该供应商配置 baseURL，或切换到模式 2/3。";
    sendJson(res, 400, { error: "unknown-provider", message: msg });
    return;
  }
  if (mode === "1" && cfg.openai === false) {
    const msg =
      "当前默认供应商「" +
      cfg.provider +
      "」使用非 OpenAI 兼容协议，模式 1 无法直连 /chat/completions。请切换到模式 3（宿主 LLM 自动适配）或模式 2（自带 Key + 自定义端点）。";
    sendJson(res, 400, { error: "protocol-unsupported", message: msg });
    return;
  }
  if (!cfg.key) {
    const msg =
      mode === "2"
        ? "插件 API Key 为空：请在临时会话面板「插件密钥」处填写，或在设置里配置 dsh-side-session.apiKey"
        : "DSH 全局 Key 为空：当前供应商「" +
          cfg.provider +
          "」未获取到凭据（期望环境变量 " +
          cfg.env +
          " 或 ~/.dsh/.credentials.yaml 中的 " +
          cfg.env +
          "）。请先在 DSH 主程序 Models/设置页配置 " +
          cfg.provider +
          " 的 API Key，或切换到模式 2/3。";
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
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
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
// 插件入口
// ---------------------------------------------------------------------------
let lastSettings = {};
let ctxRef = null;

const name = "@dsh-external/dsh-side-session";
const inject = ["settings", "webServer", "llm"];

function apply(ctx, config) {
  ctxRef = ctx;
  // 注册设置节（失败不阻断启动；重复注册 = 旧代 fiber 残留 → 摘除后重注册，热重载自愈）
  try {
    const scope = ctx.settings.register(NS, Config, { base: config || {} });
    lastSettings = scope.get();
    scope.watch(() => {
      lastSettings = scope.get();
    });
  } catch (err) {
    try {
      if (ctx.settings.registrations && ctx.settings.registrations.has(NS)) {
        ctx.settings.registrations.delete(NS);
        const scope = ctx.settings.register(NS, Config, { base: config || {} });
        lastSettings = scope.get();
        scope.watch(() => {
          lastSettings = scope.get();
        });
      }
    } catch (err2) {
      console.warn(
        "[dsh-side-session] 设置节注册失败（将使用默认配置）：" +
          String((err2 && err2.message) || err2)
      );
    }
  }

  const disposers = [];
  // 路由注册（重复 = 旧代 fiber 残留 → 摘除陈旧注册后重注册，热重载自愈）
  for (const route of [
    { kind: "exact", path: CONTEXT_ROUTE, handler: handleContext },
    { kind: "exact", path: ASK_ROUTE, handler: handleAsk },
  ]) {
    try {
      disposers.push(ctx.webServer.register(route));
    } catch (err) {
      try {
        const table = route.kind === "exact" ? ctx.webServer.exact : ctx.webServer.prefixes;
        if (table && table.has(route.path)) table.delete(route.path);
        disposers.push(ctx.webServer.register(route));
        console.warn("[dsh-side-session] 路由已摘除陈旧注册并重注册：" + route.path);
      } catch (err2) {
        console.warn(
          "[dsh-side-session] 路由注册失败（" + route.path + "）：" + String((err2 && err2.message) || err2)
        );
      }
    }
  }

  // 事件驱动的缓存失效：主对话有变化时清除该会话的解析缓存，
  // 让下一次 /context 立即重新解析日志（比 2s 轮询更及时）。
  // 数据源 = 日志解析（实测准确），不依赖未生效的自定义事件词汇猜测。
  try {
    disposers.push(
      ctx.effect(() => {
        const ds = [];
        if (typeof ctx.on === "function") {
          const invalidate = (s) => {
            const id = s && (typeof s === "string" ? s : s && s.id);
            if (!id) return;
            try {
              const file = findSessionFile(String(id));
              if (file) parseCache.delete(file);
            } catch {}
          };
          try {
            ds.push(ctx.on("session/event", invalidate));
            ds.push(ctx.on("agent/status", (e) => invalidate(e && e.agent)));
            ds.push(ctx.on("session/disposed", invalidate));
          } catch (err) {
            console.warn("[dsh-side-session] 事件订阅失败：" + String((err && err.message) || err));
          }
        }
        return () => { for (const d of ds) { try { d(); } catch {} } };
      }, "dsh-side-session: cache invalidation subscriptions")
    );
  } catch (err) {
    console.warn("[dsh-side-session] 事件订阅挂载失败：" + String((err && err.message) || err));
  }  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {}
    }
  };
}

export { apply, inject, name, parseSession, resetParseCacheForTest };
