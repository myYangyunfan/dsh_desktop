// @deepseek-ai/dsh-openclaw-bridge
// OpenClaw 网关 -> DSH 会话桥接插件（微信官方 ClawBot 插件的 DSH 侧端点）。
//
// 本插件在 DSH 的 webServer 服务上注册两条路由：
//   POST /openclaw-bridge/v1/chat/completions    OpenAI 兼容的对话端点（stream 与非 stream）
//   GET  /openclaw-bridge/health                 健康检查
//
// 设计要点：
//  - 会话映射：OpenClaw 端配置的 model 名 -> 一个常驻 DSH Agent（跨轮记忆与工具状态连续）；
//  - 注入 API：与官方 dsh-headless 一次性驱动器相同的核心调用链
//    （agents.create + agent.followup + agent.whenIdle + session.events）；
//  - 历史去重：OpenClaw 每轮回放完整 messages，本插件只注入"尚未注入过"的用户消息，
//    已注入计数随 history 压缩自动重置；
//  - 隔离：每个映射会话有独立工作目录 ~/.dsh/openclaw-bridge/workspace/<key>；
//  - 安全：回环地址免 token；非回环必须携带 Bearer token
//    （环境变量 OPENCLAW_BRIDGE_TOKEN，缺省时自动生成并持久化到
//    ~/.dsh/openclaw-bridge/token.txt）。

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 版本号随 package.json 走，避免硬编码漂移。
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
// 版本号自动跟随 package.json，不再硬编码。
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import z from "@deepseek-ai/schemastery";
import { createWechatAdapter } from "./channels/wechat.js";
import { createFeishuAdapter } from "./channels/feishu.js";
import { createChannelLogger } from "./core/logs.js";
import { createDedupe } from "./core/dedupe.js";
import { createInboundQuota } from "./core/quota.js";
import { createChannelGate, userAllowed } from "./core/router.js";
import { segmentReply, sessionIdFor, createSessionMap } from "./core/session.js";
import { qrSvg } from "./core/qrcode.js";
import { OpenAiCompatAdapter, PROVIDER_ID } from "./openai-compat.js";

const name = "@deepseek-ai/dsh-openclaw-bridge";
const inject = ["webServer", "agents", "sessions", "agentDefaultModel", "llm"];

// health 报告的已实现渠道列表；apply() 里按 CHANNEL_TABLE 刷新。
let implementedChannels = ["wechat"];

// ---- 设置节（DSH 设置页的 ClawBot 栏）----
// 命名空间 "openclaw-bridge"：用户在设置页保存的配置经 settings 服务热生效。
const NS = "openclaw-bridge";
const Config = z.object({
  // "provider/model" 或仅 "model"（provider 缺省时沿用 DSH 默认模型的 provider）；
  // 留空 = 使用 DSH 设置的默认模型。
  model: z.string().default(""),
  // 桥接 Bearer token；留空 = 环境变量 OPENCLAW_BRIDGE_TOKEN 或
  // ~/.dsh/openclaw-bridge/token.txt 自动生成值。
  token: z.string().default(""),
  // 微信会话的工作目录（绝对路径）；留空 = 使用隔离的桥接工作区。
  // 远程办公时把它指到你的真实项目目录（如 C:\Users\you\Desktop\work）。
  workspace: z.string().default(""),
  // 微信用户白名单（逗号分隔的 from_user_id，形如 xxx@im.wechat）；
  // 留空 = 允许所有给你发消息的人驱动 agent。
  allowlist: z.string().default(""),
  // 第三方 OpenAI 兼容端点（别家公司的模型）。customBaseURL 非空时，
  // 接收模型改走通用适配器（provider "openclaw-custom"，需 customModel）。
  customBaseURL: z.string().default(""),
  customApiKey: z.string().default(""),
  customModel: z.string().default(""),
  // ---- IM 桥接（SPEC §8：微信 + 飞书双通道；QQ 由官方 @tencent-connect/dsh-qqbot 独立提供）----
  // 渠道开关："1" = 开，"0" = 关；微信/飞书留空 = 默认开（保持旧行为 + 配置迁移语义）。
  enableWechat: z.string().default(""),
  enableFeishu: z.string().default(""),
  // 每渠道白名单（逗号分隔 id）；微信兼容旧字段 allowlist（whitelistWechat 优先）。
  whitelistWechat: z.string().default(""),
  whitelistFeishu: z.string().default(""),
  // 飞书企业自建应用（P1）：AppID / App Secret / Encrypt Key（后两者不回显）。
  feishuAppId: z.string().default(""),
  feishuAppSecret: z.string().default(""),
  feishuEncryptKey: z.string().default(""),
  // 群聊回复署名 [群友 用户名]（A-03 默认开）。
  groupSignature: z.string().default("1"),
  // agent 池上限（A-02：默认 16，可调大；池满按 LRU 淘汰空闲）。
  maxAgents: z.string().default(""),
  // 严格鉴权："1" = 回环地址也要求 Token（默认 "" = 回环免 Token，保持旧兼容）。
  authAlways: z.string().default(""),
});
let liveConfig = () => ({}); // 取配置的 getter；setSource 会被替换为 settings scope 读取器

const CHAT_ROUTE = "/openclaw-bridge/v1/chat/completions";
const HEALTH_ROUTE = "/openclaw-bridge/health";
const WECHAT_STATUS_ROUTE = "/openclaw-bridge/wechat/status";
const WECHAT_LOGIN_ROUTE = "/openclaw-bridge/wechat/login";
const WECHAT_VERIFY_ROUTE = "/openclaw-bridge/wechat/verify";
const WECHAT_LOGOUT_ROUTE = "/openclaw-bridge/wechat/logout";
const CHANNELS_ROUTE = "/openclaw-bridge/channels";
const QR_ROUTE = "/openclaw-bridge/qr";
const MAX_BODY = 4 * 1024 * 1024;
const MAX_AGENTS = 16;
const TURN_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 100;

// ---- 鉴权 token（设置 > 环境变量 > 自动生成并持久化） ----
// 跟随 DSH_HOME（与内核/其余插件同口径）：隔离部署/多实例/测试镜像时
// workspace 不落真实用户目录（真实场景测试 T1 抓到打印真实路径）。
const BRIDGE_HOME = join(process.env.DSH_HOME || join(homedir(), ".dsh"), "openclaw-bridge");
let bridgeToken = String(process.env.OPENCLAW_BRIDGE_TOKEN || "").trim();
if (!bridgeToken) {
  const tokenFile = join(BRIDGE_HOME, "token.txt");
  try {
    mkdirSync(BRIDGE_HOME, { recursive: true });
    if (existsSync(tokenFile)) {
      bridgeToken = readFileSync(tokenFile, "utf8").trim();
    } else {
      bridgeToken = randomBytes(24).toString("hex");
      writeFileSync(tokenFile, bridgeToken);
      console.log("[openclaw-bridge] generated bridge token: " + tokenFile);
    }
  } catch {
    // 持久化失败时仅回环可用
  }
}

/** 生效 token：设置节 token > 环境变量/文件 token。 */
function effectiveToken() {
  const cfg = liveConfig() || {};
  const t = String(cfg.token || "").trim();
  return t || bridgeToken;
}

// ---- IM 会话续接映射（修复③：渠道 key -> 持久化 DSH 会话 id）----
// 微信/飞书/QQ 的会话 id 落盘到 BRIDGE_HOME/session-map.json：
// 插件重启后同一用户/群的消息能 resume 回同一段上下文；/new 会写入新 id 开启全新会话。
const sessionStore = createSessionMap(join(BRIDGE_HOME, "session-map.json"));
sessionStore.load();

const IM_KEY_RE = /^(wx|feishu)-/;
function isImKey(key) {
  return IM_KEY_RE.test(key);
}

/** 分配一个新的 IM 会话 id（/new 用：下一条消息开全新上下文，且不再 resume 旧会话）。 */
function freshImSessionId() {
  return "dsh-im-" + randomBytes(8).toString("hex");
}

/** 释放一条池记录的 live agent（幂等：dispose 只生效一次；失败不阻塞）。 */
function disposeRec(rec) {
  if (!rec || typeof rec.dispose !== "function") return;
  try {
    const p = rec.dispose(); // agents.create/resume 返回 handle 的 {agent, dispose}
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // 释放失败不阻塞
  }
}

// ---- IM 桥接公共判定（SPEC §5/§8/§11：渠道开关 / 白名单迁移 / 池上限）----
const KNOWN_CHANNELS = new Set(["wechat", "feishu"]);
/** 渠道开关："0" 关、"1" 开；空 = 开（缺省启用，未配凭据的渠道天然无事件/无法发送，与 client 端 effectiveOn 一致）。 */
function isChannelEnabled(id, cfg) {
  const flag = String((cfg || {})["enable" + capId(id)] || "");
  if (flag === "0") return false;
  if (flag === "1") return true;
  return KNOWN_CHANNELS.has(id);
}

/** 生效白名单：新字段 whitelist<Channel> 优先；微信兼容旧 allowlist（迁移）。 */
function effectiveWhitelist(id, cfg) {
  const direct = String((cfg || {})["whitelist" + capId(id)] || "").trim();
  if (direct) return direct;
  if (id === "wechat") return String((cfg || {}).allowlist || "").trim();
  return "";
}

function capId(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** agent 池上限（A-02）：maxAgents 可配，非法值回落默认。 */
function effectiveMaxAgents() {
  const n = Number.parseInt(String((liveConfig() || {}).maxAgents || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_AGENTS;
}

/** 生效模型选择：自定义 OpenAI 兼容端点 > 设置节 model 覆盖 > DSH 默认模型。 */
function resolveSelection(defaultModel) {
  const fallback = defaultModel.currentSelection();
  const cfg = liveConfig() || {};
  const customBase = String(cfg.customBaseURL || "").trim();
  if (customBase) {
    const customModel = String(cfg.customModel || "").trim();
    return { provider: "openclaw-custom", model: customModel || "" };
  }
  const override = String(cfg.model || "").trim();
  if (!override) return fallback;
  const slash = override.indexOf("/");
  if (slash > 0) {
    const provider = override.slice(0, slash);
    const model = override.slice(slash + 1);
    if (provider && model) return { provider, model };
  } else if (fallback) {
    return { provider: fallback.provider, model: override };
  }
  return fallback;
}

// ---- 小工具 ----
function isLoopback(req) {
  const ra = req.socket && req.socket.remoteAddress;
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

/** 常数时间字符串比较（修复⑦：sha256 摘要后 timingSafeEqual，规避长度/内容时序侧信道）。 */
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** 回环是否也要求 Token（修复⑧：authAlways === "1" 时开启严格鉴权，默认保持回环豁免）。 */
function strictAuth() {
  return String((liveConfig() || {}).authAlways || "").trim() === "1";
}

function authorized(req) {
  if (!strictAuth() && isLoopback(req)) return true;
  const token = effectiveToken();
  if (!token) return false;
  const auth = String(req.headers["authorization"] || "");
  if (auth.startsWith("Bearer ")) {
    const provided = auth.slice(7).trim();
    if (provided && safeEqual(provided, token)) return true;
  }
  const xt = String(req.headers["x-openclaw-bridge-token"] || "");
  return xt !== "" && safeEqual(xt, token);
}

function readBody(req, limit = MAX_BODY) {
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

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body ?? null), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(data.length),
  });
  res.end(data);
}

function writeSse(res, payload) {
  try {
    res.write("data: " + JSON.stringify(payload) + "\n\n");
  } catch {
    // 客户端已断开
  }
}

function openAiError(status, message, type = "invalid_request_error") {
  return { error: { message, type, code: status } };
}

function chatId() {
  return "chatcmpl-" + randomUUID().replace(/-/g, "");
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(httpError(504, message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** OpenAI messages 里 content 可能是 string 或 part 数组，只取文本。 */
function textOf(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (p && typeof p === "object" && (p.type === "text" || p.type === "input_text")) {
          return p.text || "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

/** model 名 -> 安全 key（杜绝路径穿越：纯点/空 key 归位 default）。 */
function sanitizeKey(model) {
  let key = String(model || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!key || /^\.+$/.test(key)) key = "default";
  return key;
}

function workspaceFor(key) {
  const dir = join(BRIDGE_HOME, "workspace", key);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---- agent 池：key -> 常驻 agent 记录 ----
const pool = new Map(); // key -> { key, agent, chain, lastUserCount, lastText, sessions, ready, lastUsed }

/** LRU 淘汰最久未用的空闲 agent（A-02：池满时兜底；跳过正在跑回合的记录）。 */
function evictIdleAgent() {
  let oldest = null;
  for (const rec of pool.values()) {
    if (rec.busy > 0) continue; // 修复②：正在跑回合的 agent 不能中途被 dispose
    if (oldest === null || rec.lastUsed < oldest.lastUsed) oldest = rec;
  }
  if (!oldest) return;
  disposeRec(oldest); // 修复①：真正释放 live agent（handle.dispose，而非无效的 agent.dispose）
  pool.delete(oldest.key);
  console.log("[openclaw-bridge] evicted idle agent (LRU): " + oldest.key);
}

async function ensureAgent(ctx, key, cwdOverride) {
  let rec = pool.get(key);
  if (rec) {
    rec.lastUsed = Date.now();
    return rec;
  }
  if (pool.size >= effectiveMaxAgents()) {
    evictIdleAgent();
    if (pool.size >= effectiveMaxAgents()) {
      throw httpError(429, "bridge agent limit reached (" + effectiveMaxAgents() + "); no idle agent can be evicted");
    }
  }
  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const defaultModel = ctx.get("agentDefaultModel");
  if (!agents || !sessions || !defaultModel) throw httpError(503, "DSH core agent services unavailable");
  const selection = resolveSelection(defaultModel);
  if (!selection) throw httpError(503, "no model configured (set one in Settings > ClawBot or DSH default model)");
  if (selection.provider === PROVIDER_ID && !selection.model) {
    throw httpError(400, "customBaseURL is set but customModel is empty — fill the model name in Settings > ClawBot");
  }
  let cwd = workspaceFor(key);
  if (cwdOverride && String(cwdOverride).trim()) {
    cwd = String(cwdOverride).trim();
    try {
      mkdirSync(cwd, { recursive: true });
    } catch {
      throw httpError(400, "workspace is not a valid directory: " + cwd);
    }
  }
  // 修复③：IM 渠道（wx-/feishu-）会话 id 走持久化映射，重启后自动续上下文；
  // OpenAI 兼容端点（model 名 key）保持进程内随机 id。
  const imKey = isImKey(key);
  let sid;
  if (imKey) {
    sid = sessionStore.get(key);
    if (!sid) {
      sid = sessionIdFor(key);
      sessionStore.set(key, sid);
    }
  } else {
    sid = "session-" + randomUUID();
  }
  rec = { key, agent: null, busy: 0, chain: Promise.resolve(), lastUserCount: 0, lastText: "", sessions, ready: null, lastUsed: Date.now(), sessionId: sid, dispose: null };
  pool.set(key, rec);
  // S1 修复：并发首建竞态——ready 缓存 in-flight 创建 Promise，
  // 第二个并发请求 await rec.ready 而非直接触碰 null agent。
  rec.ready = (async () => {
    const agentOptions = { provider: selection.provider, model: selection.model };
    const setup = (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: void 0 });
    };
    let handle;
    if (imKey) {
      // 已持久化的会话优先 resume（与 /attach 同款路径）；失败则新建同 id 会话。
      const persistence = ctx.get("sessionPersistence");
      let stored = false;
      if (persistence && typeof persistence.list === "function") {
        try {
          stored = (await persistence.list()).some((h) => h && h.id === sid);
        } catch {
          stored = false;
        }
      }
      if (stored) {
        try {
          handle = await agents.resume({ resumeSessionId: sid, agentOptions, setup });
          rec.resumed = true;
        } catch (err) {
          console.warn("[openclaw-bridge] resume failed for '" + key + "', creating fresh: " + String(err?.message || err));
          handle = await agents.create({ sessionId: SessionId(sid), meta: { cwd }, agentOptions, setup });
        }
      } else {
        handle = await agents.create({ sessionId: SessionId(sid), meta: { cwd }, agentOptions, setup });
      }
    } else {
      handle = await agents.create({ sessionId: SessionId(sid), meta: { cwd }, agentOptions, setup });
    }
    const agent = handle.agent;
    rec.agent = agent;
    // 修复①：保存 handle 的 disposer——create/resume 返回 {agent, dispose}，
    // agent 对象本身没有 dispose（旧代码直调 agent.dispose 是无效路径）。
    rec.dispose = typeof handle.dispose === "function" ? handle.dispose : null;
    await agent.whenIdle();
    console.log("[openclaw-bridge] agent ready for key '" + key + "' (cwd: " + cwd + (rec.resumed ? ", resumed" : "") + ")");
  })();
  try {
    await rec.ready;
  } catch (err) {
    pool.delete(key);
    if (imKey) sessionStore.remove(key); // 创建失败不留脏映射
    throw err;
  }
  return rec;
}

/** 等待记录的 agent 就绪（含并发首建的 in-flight 创建）。 */
async function readyRec(rec) {
  if (rec && rec.ready) await rec.ready;
  return rec;
}

// ---- 微信用户 -> 会话绑定（/attach 接管已有 DSH 会话） ----
const wxBinds = new Map(); // from_user_id -> rec（可能指向池外会话）

/** 包装一个已有的 live agent 为可驱动记录（/attach 用）。 */
function wrapAgent(ctx, agent) {
  return {
    key: "attached",
    agent,
    busy: 0,
    chain: Promise.resolve(),
    lastUserCount: 0,
    lastText: "",
    sessions: ctx.get("sessions"),
    ready: Promise.resolve(),
    dispose: null, // /attach 接管的会话不归池管，dispose 由调用方负责
  };
}

/** 按会话 id 取活体 agent，否则从持久化恢复（与 dsh-host-apiproxy ensureSession 同构）。 */
async function attachRec(ctx, sessionId) {
  const agents = ctx.get("agents");
  if (!agents) throw new Error("agents service unavailable");
  const live = agents.get ? agents.get(sessionId) : void 0;
  if (live !== void 0) return wrapAgent(ctx, live);
  const defaultModel = ctx.get("agentDefaultModel");
  const selection = defaultModel ? resolveSelection(defaultModel) : void 0;
  if (!selection) throw new Error("no model configured");
  const persistence = ctx.get("sessionPersistence");
  if (persistence) {
    const stored = (await persistence.list()).find((header) => header && header.id === sessionId);
    if (stored !== void 0) {
      const { agent } = await agents.resume({
        resumeSessionId: sessionId,
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: (agentCtx) => {
          installModelSelection(agentCtx, { current: selection, assembled: void 0 });
        },
      });
      return wrapAgent(ctx, agent);
    }
  }
  throw new Error("session not found: " + sessionId);
}

/** 取 firstSeq 之后最后一条 assistant 文本（与 dsh-headless 的 summarize 同构）。 */
function lastAssistantText(agent, firstSeq) {
  let text = "";
  for (const event of agent.session.events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "assistant/message") {
      const joined = (event.data?.message?.content || [])
        .filter((b) => b && b.type === "text")
        .map((b) => b.text || "")
        .join("");
      if (joined) text = joined;
    }
  }
  return text;
}

/**
 * 注入本轮新用户消息并驱动到 idle；emit 存在时按 100ms 轮询事件流推送增量文本。
 */
async function runTurn(rec, toInject, emit) {
  if (rec) rec.lastUsed = Date.now();
  rec.busy = (rec.busy || 0) + 1; // 修复②：回合进行中标记（LRU 淘汰会跳过 busy 记录）
  try {
    await readyRec(rec);
    const agent = rec.agent;
    await agent.whenIdle(); // 吸收上一轮超时后仍在跑的回合
    if (toInject.length === 0) return { text: rec.lastText, reason: { kind: "skipped" } };
    const firstSeq = agent.session.seq;
    let timer = null;
    let emitted = 0;
    if (emit) {
      timer = setInterval(() => {
        const text = lastAssistantText(agent, firstSeq);
        if (text.length > emitted) {
          emit(text.slice(emitted));
          emitted = text.length;
        }
      }, POLL_MS);
    }
    try {
      for (const text of toInject) {
        agent.followup(
          createUserMessage({
            content: [{ type: "text", text }],
            source: { kind: "user" },
          })
        );
        await withTimeout(agent.whenIdle(), TURN_TIMEOUT_MS, "agent turn exceeded " + TURN_TIMEOUT_MS + "ms");
      }
      await rec.sessions.flush(agent.session);
    } finally {
      if (timer) clearInterval(timer);
    }
    let text = lastAssistantText(agent, firstSeq);
    if (emit && text.length > emitted) emit(text.slice(emitted));
    let reason;
    for (const event of agent.session.events) {
      if (event.seq < firstSeq) continue;
      if (event.type === "turn/end") reason = event.data?.reason;
    }
    if (reason && reason.kind === "error") {
      const err = new Error((reason.error && reason.error.message) || "agent turn failed");
      err.status = 502;
      throw err;
    }
    rec.lastText = text;
    return { text, reason };
  } finally {
    rec.busy -= 1;
  }
}

// ---- 渠道指令（微信/飞书共用；/help /new /list /attach）----
const HELP_TEXT = [
  "/help —— 查看指令",
  "/new —— 开启新会话（丢弃当前绑定）",
  "/list —— 列出可接管的 DSH 会话（live + 已持久化）",
  "/attach <会话id> —— 接管一个已有的 DSH 会话，之后的消息都进入该会话",
  "其余消息 —— 发给当前绑定的会话（默认每个用户一个独立会话）",
].join("\n");

/** 群聊署名（A-03 默认开）：成员名可用时 "[名] "；M1 无联系人权限时回退 "[群友 <open_id 短码>] "（H-02）。 */
function memberPrefix(m, enabled) {
  if (enabled === false || !m || !m.conv || m.conv.kind !== "group") return "";
  const name = m.conv.member && m.conv.member.name;
  if (name) return "[" + name + "] ";
  const shortId = String(m.conv.memberId || "").slice(-8);
  if (shortId) return "[群友 " + shortId + "] ";
  return "";
}

/**
 * 渠道指令分发（共享 /help /new /list /attach）。
 * @param {object} ctx
 * @param {{ binds: Map, key: string, from: string, text: string, replyTo: Function }} p
 */
async function handleChannelCommand(ctx, p) {
  const { binds, key, from, text, replyTo } = p;
  const parts = String(text).slice(1).split(/\s+/).filter(Boolean);
  const cmd = (parts[0] || "").toLowerCase();
  const arg = parts[1] || "";

  if (cmd === "help") {
    await replyTo(HELP_TEXT);
    return;
  }

  if (cmd === "new") {
    // 修复①：池内记录先真正释放 live agent（dispose 循环/上下文），再删除；
    // /attach 接管的会话（key==='attached'）只解除绑定、不 dispose（那是用户自己的 DSH 会话）。
    const rec = pool.get(key);
    if (rec) {
      disposeRec(rec);
      pool.delete(key);
    }
    binds.delete(from);
    // 修复③：IM 渠道分配新会话 id，下一条消息开全新上下文且不再续旧会话。
    if (isImKey(key)) {
      sessionStore.set(key, freshImSessionId());
    }
    await replyTo("已开启新会话，下一条消息开始全新上下文。");
    return;
  }

  if (cmd === "list") {
    const agents = ctx.get("agents");
    const persistence = ctx.get("sessionPersistence");
    const rows = [];
    if (agents && agents.list) {
      for (const agent of agents.list()) {
        const session = agent && agent.session;
        if (!session) continue;
        rows.push("live  " + session.id + "  (" + (session.meta?.cwd || "?") + ")");
      }
    }
    if (persistence) {
      const stored = await persistence.list();
      for (const header of stored) {
        if (agents && agents.get && agents.get(header.id)) continue; // 已在 live 列表
        rows.push("saved " + header.id + "  (" + (header.meta?.cwd || header.cwd || "?") + ")");
      }
    }
    if (rows.length === 0) {
      await replyTo("没有可列出的会话。");
    } else {
      await replyTo("可用会话（/attach <id> 接管）：\n" + rows.slice(0, 15).join("\n") + (rows.length > 15 ? "\n…（仅显示前 15 条）" : ""));
    }
    return;
  }

  if (cmd === "attach") {
    if (!arg) {
      await replyTo("用法：/attach <会话id>（id 用 /list 查看）");
      return;
    }
    const rec = await attachRec(ctx, arg);
    binds.set(from, rec);
    await replyTo("已接管会话 " + arg + "，之后的消息都进入该会话。");
    return;
  }

  await replyTo("未知指令：" + cmd + "。发送 /help 查看可用指令。");
}

// ---- 路由 ----
async function handleChat(ctx, req, res) {
  if (req.method === "GET") {
    sendJson(res, 405, openAiError(405, "use POST " + CHAT_ROUTE));
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, openAiError(405, "method not allowed"));
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, openAiError(401, "missing or invalid bridge token", "authentication_error"));
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, openAiError(400, "invalid JSON body"));
    return;
  }
  const model = typeof body.model === "string" && body.model ? body.model : "default";
  const key = sanitizeKey(model);
  const stream = body.stream === true;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userTexts = messages
    .filter((m) => m && m.role === "user")
    .map((m) => textOf(m.content))
    .filter((t) => t.length > 0);

  let rec;
  try {
    rec = await ensureAgent(ctx, key);
  } catch (err) {
    sendJson(res, err.status || 503, openAiError(err.status || 503, String(err?.message || err), "server_error"));
    return;
  }

  // 历史去重：OpenClaw 每轮回放完整 messages，只注入尚未注入的用户消息。
  // M3 修复：计数在回合成功后才推进，失败重试不会静默返回旧答案。
  const expectedCount = userTexts.length;
  const toInject = expectedCount >= rec.lastUserCount ? userTexts.slice(rec.lastUserCount) : userTexts.slice();

  const id = chatId();
  const created = Math.floor(Date.now() / 1000);
  const task = () =>
    runTurn(
      rec,
      toInject,
      stream
        ? (delta) =>
            writeSse(res, {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
            })
        : null
    ).then((result) => {
      rec.lastUserCount = expectedCount; // 成功后才推进去重计数
      return result;
    });
  const work = rec.chain.then(task, task);
  rec.chain = work.then(
    () => {},
    () => {}
  );

  if (stream) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    work.then(
      () => {
        writeSse(res, {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        // 修复：流式结束前补 usage 帧（choices 为空数组），对齐 OpenAI 流式协议，
        // 让 OpenClaw 等客户端能正确读到用量统计。
        writeSse(res, {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        res.write("data: [DONE]\n\n");
        res.end();
      },
      (err) => {
        writeSse(res, {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: String(err?.message || err) }, finish_reason: "error" }],
        });
        res.write("data: [DONE]\n\n");
        res.end();
      }
    );
    return;
  }

  try {
    const result = await work;
    sendJson(res, 200, {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (err) {
    sendJson(res, err.status || 500, openAiError(err.status || 500, String(err?.message || err), "server_error"));
  }
}

function handleHealth(ctx, req, res) {
  sendJson(res, 200, {
    ok: true,
    service: name,
    version: PLUGIN_VERSION,
    agents: [...pool.keys()],
    channels: implementedChannels,
    maxAgents: effectiveMaxAgents(),
    workspace: join(BRIDGE_HOME, "workspace"),
    servicesReady: Boolean(ctx.get("agents") && ctx.get("agentDefaultModel")),
    tokenConfigured: Boolean(effectiveToken()),
    model: (liveConfig() || {}).model || "(default)",
  });
}

function apply(ctx, config) {
  liveConfig = () => config || {};
  // 通用 OpenAI 兼容 provider：每次调用经 liveConfig() 读 baseURL/key/model，热生效
  const customAdapter = new OpenAiCompatAdapter(() => {
    const cfg = liveConfig() || {};
    return { baseURL: cfg.customBaseURL, apiKey: cfg.customApiKey, model: cfg.customModel };
  });
  const customRegistration = ctx.llm.registerAdapter([PROVIDER_ID], customAdapter);
  // alpha.4 迁移：旧的 install 辅助已从 dsh-settings 移除，改为
  // ctx.settings.register 直注册（ns 裸字符串）+ scope.get 取值 + scope.watch 热更。
  try {
    const scope = ctx.settings.register(NS, Config, { base: config || {} });
    liveConfig = () => scope.get(); // source 是 () => scope.get() 的取值函数
    scope.watch(() => {
      // 新映射会话（新 model 名）会使用新配置；已有会话保持连续性。
      // 日志脱敏：token/apiKey 不回显明文。
      const cfg = liveConfig() || {};
      const redacted = { ...cfg };
      if (redacted.token) redacted.token = "***";
      if (redacted.customApiKey) redacted.customApiKey = "***";
      if (redacted.feishuAppSecret) redacted.feishuAppSecret = "***";
      console.log("[openclaw-bridge] settings updated: " + JSON.stringify(redacted));
    });
  } catch (error) {
    console.warn("[openclaw-bridge] settings section unavailable (invalid stored config): " + ((error && error.message) || error));
  }
  const disposeChat = ctx.webServer.register({ kind: "exact", path: CHAT_ROUTE, handler: (req, res) => handleChat(ctx, req, res) });
  const disposeHealth = ctx.webServer.register({
    kind: "exact",
    path: HEALTH_ROUTE,
    handler: (req, res) => {
      if (!isLoopback(req)) {
        sendJson(res, 403, { error: "health is loopback-only" });
        return;
      }
      return handleHealth(ctx, req, res);
    },
  });

  // ---- IM 桥接（SPEC §3/§4/§5）：渠道注册表 + 共享入站管道 ----
  const logsDir = join(BRIDGE_HOME, "logs");
  const wechatLogger = createChannelLogger(logsDir, "wechat");
  const dedupe = createDedupe(); // 事件去重：LRU 5 万
  const inboundQuota = createInboundQuota(); // 入站限流：20 条/用户/分钟
  const wechatGate = createChannelGate({ channel: "wechat", dedupe, quota: inboundQuota, logger: wechatLogger });
  const adapters = new Map(); // channelId -> 渠道适配器（P0 仅微信；飞书 P1 / QQ P2）

  // ---- 微信 iLink 渠道（直连，不经 OpenClaw；P0 保留既有流程，零回归） ----
  const wechat = createWechatAdapter({
    sessionFile: join(BRIDGE_HOME, "wechat-session.json"),
    onState: (s) => {
      console.log("[openclaw-bridge] wechat: " + JSON.stringify(s));
    },
    onMessage: async (m) => {
      const from = String(m.from || "");
      const text = String(m.text || "").trim();
      if (!text) return;
      const cfg = liveConfig() || {};
      if (!isChannelEnabled("wechat", cfg)) {
        wechatLogger.info("wechat disabled by config — message ignored");
        return;
      }

      // 共享闸门：去重（微信无稳定 eventId，传空跳过）+ 入站限流
      const gate = wechatGate({
        eventId: "",
        conv: { kind: "p2p", id: from, memberId: from },
        text,
        ts: Date.now(),
        raw: m,
      });
      if (!gate.allowed) return;

      // 白名单：whitelistWechat 优先，旧 allowlist 兼容（SPEC §5 迁移）
      if (!userAllowed(effectiveWhitelist("wechat", cfg), from)) {
        wechatLogger.warn("message from non-allowlisted user ignored: " + from);
        return;
      }

      // 回复整编：总长 ≤4000，段落分段 ≤1500（A-01）
      const replyTo = async (t) => {
        for (const seg of segmentReply(t)) {
          try {
            await wechat.send({ kind: "p2p", id: from, memberId: from }, seg, { contextToken: m.contextToken });
          } catch {
            // 发送失败也忽略
          }
        }
      };

      // 指令：/help /new /list /attach
      if (text.startsWith("/")) {
        try {
          await handleChannelCommand(ctx, {
            binds: wxBinds,
            key: "wx-" + sanitizeKey(from),
            from,
            text,
            replyTo,
          });
        } catch (err) {
          console.error("[openclaw-bridge] wechat command failed: " + String(err?.message || err));
          await replyTo("指令执行出错：" + String(err?.message || err).slice(0, 400));
        }
        return;
      }

      // 普通消息 → 该用户的绑定会话（默认映射或 /attach 接管的会话）
      const key = "wx-" + sanitizeKey(from);
      try {
        let rec = wxBinds.get(from);
        if (!rec) {
          const ws = String(cfg.workspace || "").trim();
          rec = await ensureAgent(ctx, key, ws || undefined);
          wxBinds.set(from, rec);
        }
        const task = () => runTurn(rec, [text], null);
        const work = rec.chain.then(task, task);
        rec.chain = work.then(
          () => {},
          () => {}
        );
        const result = await work;
        const reply = (result.text || "").trim() || "（本轮没有文本回复）";
        const segs = segmentReply(reply);
        await replyTo(reply);
        wechatLogger.info("reply to " + key + " sent (" + segs.length + " segment(s))");
      } catch (err) {
        console.error("[openclaw-bridge] wechat turn failed: " + String(err?.message || err));
        await replyTo("处理出错：" + String(err?.message || err).slice(0, 500));
      }
    },
    logger: wechatLogger,
  });
  adapters.set("wechat", wechat);

  // ---- 飞书长连接渠道（P1，SPEC §6 / docs/feishu-bot-dsh-report.md）----
  const feishuLogger = createChannelLogger(logsDir, "feishu");
  const feishuGate = createChannelGate({ channel: "feishu", dedupe, quota: inboundQuota, logger: feishuLogger });
  const feishuBinds = new Map(); // 群: convId / 私聊: open_id -> rec（/attach 接管）
  const feishu = createFeishuAdapter({
    // 设置命名空间键是 feishuAppId/feishuAppSecret/feishuEncryptKey，适配器内部用 appId/appSecret/encryptKey
    getConfig: () => {
      const c = liveConfig() || {};
      return { appId: c.feishuAppId, appSecret: c.feishuAppSecret, encryptKey: c.feishuEncryptKey };
    },
    onState: (s) => {
      console.log("[openclaw-bridge] feishu: " + JSON.stringify(s));
    },
    onMessage: async (m) => {
      const text = String(m.text || "").trim();
      if (!text) return;
      const cfg = liveConfig() || {};
      if (!isChannelEnabled("feishu", cfg)) {
        feishuLogger.info("feishu disabled by config — message ignored");
        return;
      }
      const uid = String(m.conv.memberId || m.conv.id || "");
      const gate = feishuGate(m); // 去重(channel:eventId) + 限流
      if (!gate.allowed) return;
      if (!userAllowed(effectiveWhitelist("feishu", cfg), uid)) {
        feishuLogger.warn("message from non-allowlisted user ignored: " + uid);
        return;
      }
      const replyTo = async (t) => {
        for (const seg of segmentReply(t)) {
          try {
            await feishu.send(m.conv, seg, { replyTo: m.replyToMessageId });
          } catch (e) {
            feishuLogger.warn("feishu send failed: " + String((e && e.message) || e));
          }
        }
      };
      const identity = m.conv.kind === "group" ? String(m.conv.id || "") : uid;
      const key = "feishu-" + sanitizeKey(identity);
      if (text.startsWith("/")) {
        try {
          await handleChannelCommand(ctx, { binds: feishuBinds, key, from: identity, text, replyTo });
        } catch (err) {
          console.error("[openclaw-bridge] feishu command failed: " + String(err?.message || err));
          await replyTo("指令执行出错：" + String(err?.message || err).slice(0, 400));
        }
        return;
      }
      // 普通消息：私聊每用户一会话；群聊每群一会话 + 群友署名注入（A-03）
      const signed = memberPrefix(m, cfg.groupSignature !== "0") + text;
      try {
        let rec = feishuBinds.get(identity);
        if (!rec) {
          const ws = String(cfg.workspace || "").trim();
          rec = await ensureAgent(ctx, key, ws || undefined);
          feishuBinds.set(identity, rec);
        }
        const task = () => runTurn(rec, [signed], null);
        const work = rec.chain.then(task, task);
        rec.chain = work.then(
          () => {},
          () => {}
        );
        const result = await work;
        const reply = (result.text || "").trim() || "（本轮没有文本回复）";
        await replyTo(reply);
        feishuLogger.info("reply to " + key + " sent");
      } catch (err) {
        console.error("[openclaw-bridge] feishu turn failed: " + String(err?.message || err));
        await replyTo("处理出错：" + String(err?.message || err).slice(0, 500));
      }
    },
    logger: feishuLogger,
  });
  adapters.set("feishu", feishu);

  // ---- QQ：不再自研连接，交由官方 @tencent-connect/dsh-qqbot 独立插件提供 ----
  // （v0.8.0 迁移：替换掉本插件的自研 QQ 开放平台实现 lib/channels/qq.js）。
  // 客户端/注册表仍保留 QQ 占位卡（implemented=false），指向官方插件的安装说明。

  const wechatOnly = (handler) => (req, res) => {
    if (!isLoopback(req)) {
      sendJson(res, 403, { error: "wechat control routes are loopback-only" });
      return;
    }
    return handler(req, res); // 返回 Promise 让调用方正确 await/捕获
  };
  const channelOnly = (handler) => (req, res) => {
    if (!isLoopback(req)) {
      sendJson(res, 403, { error: "channel control routes are loopback-only" });
      return;
    }
    return handler(req, res);
  };

  // ---- 渠道注册表（SPEC §8 路由表）----
  const CHANNEL_TABLE = [
    { id: "wechat", title: "微信", implemented: true },
    { id: "feishu", title: "飞书", implemented: true },
    { id: "qq", title: "QQ", implemented: false, eta: "由官方 @tencent-connect/dsh-qqbot 提供" },
  ];
  implementedChannels = CHANNEL_TABLE.filter((t) => t.implemented).map((t) => t.id);
  function registryPayload() {
    const cfg = liveConfig() || {};
    return {
      channels: CHANNEL_TABLE.map((t) => {
        const adapter = adapters.get(t.id);
        return {
          ...t,
          enabled: isChannelEnabled(t.id, cfg),
          status: adapter ? adapter.status() : null,
        };
      }),
    };
  }

  // /openclaw-bridge/channels/<id>/<action>：status / login / verify / logout
  async function handleChannels(req, res) {
    const pathname = new URL(req.url, "http://x").pathname;
    const rest = pathname.slice(CHANNELS_ROUTE.length).replace(/^\/+/, "");
    const segs = rest.split("/").filter(Boolean);
    const [id, action] = segs;
    if (!id) {
      sendJson(res, 200, registryPayload());
      return;
    }
    const meta = CHANNEL_TABLE.find((t) => t.id === id);
    if (!meta) {
      sendJson(res, 404, { error: "unknown channel: " + id });
      return;
    }
    const adapter = adapters.get(id);
    if (!adapter) {
      // 已知渠道但不由本插件实现（v0.8.0：QQ 由官方 @tencent-connect/dsh-qqbot 提供）→ external 状态
      sendJson(res, 200, {
        id,
        title: meta.title,
        implemented: false,
        state: "external",
        eta: String(meta.eta || ""),
        note: meta.eta ? "QQ 通道由官方插件 @tencent-connect/dsh-qqbot 独立提供，安装并重启 DSH 后生效（凭据 QQBOT_APPID/QQBOT_SECRET 或首次运行终端扫码）" : undefined,
      });
      return;
    }
    if (action === "status" || !action) {
      sendJson(res, 200, adapter.status());
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    if (action === "login") {
      try {
        await adapter.start();
        sendJson(res, 200, adapter.status());
      } catch (err) {
        sendJson(res, 502, { error: String(err?.message || err) });
      }
      return;
    }
    if (action === "verify") {
      try {
        const body = JSON.parse(await readBody(req));
        const out = await adapter.verify(body && body.code);
        sendJson(res, out && out.ok ? 200 : 400, (out && out.status) || { error: "invalid verify code" });
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
      }
      return;
    }
    // 凭据连通性测试（SPEC §8.2：飞书「连接测试」/ QQ「测试连接」）。
    // 适配器 validate() 用当前设置命名空间里的凭据实测，loopback-only（外层 channelOnly 已拦）。
    if (action === "validate") {
      try {
        const out = await adapter.validate();
        sendJson(res, out && out.ok ? 200 : 400, { ok: !!(out && out.ok), detail: (out && (out.detail || out.status)) || "invalid" });
      } catch (err) {
        sendJson(res, 400, { ok: false, detail: String(err?.message || err) });
      }
      return;
    }
    if (action === "logout") {
      // feishu 的 stop() 是 async；未 await 会把 Promise 序列化进响应（→ {}），
      // 客户端拿不到断开后的状态。wechat 的 stop() 是同步，await 也无害。
      sendJson(res, 200, await adapter.stop());
      return;
    }
    sendJson(res, 404, { error: "unknown channel action: " + action });
  }

  // 旧微信控制路由保留为别名（SPEC §5：向后兼容 /openclaw-bridge/wechat/*）
  const disposeWxStatus = ctx.webServer.register({
    kind: "exact",
    path: WECHAT_STATUS_ROUTE,
    handler: wechatOnly((req, res) => sendJson(res, 200, wechat.status())),
  });
  const disposeWxLogin = ctx.webServer.register({
    kind: "exact",
    path: WECHAT_LOGIN_ROUTE,
    handler: wechatOnly(async (req, res) => {
      try {
        await wechat.start();
        sendJson(res, 200, wechat.status());
      } catch (err) {
        sendJson(res, 502, { error: String(err?.message || err) });
      }
    }),
  });
  const disposeWxVerify = ctx.webServer.register({
    kind: "exact",
    path: WECHAT_VERIFY_ROUTE,
    handler: wechatOnly(async (req, res) => {
      try {
        const body = JSON.parse(await readBody(req));
        const out = wechat.verify(body && body.code);
        sendJson(res, out.ok ? 200 : 400, out.status);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
      }
    }),
  });
  const disposeWxLogout = ctx.webServer.register({
    kind: "exact",
    path: WECHAT_LOGOUT_ROUTE,
    handler: wechatOnly((req, res) => {
      sendJson(res, 200, wechat.stop());
    }),
  });

  // 统一渠道控制面（P0 微信可用；飞书/QQ 返回 404 + eta 提示）
  const disposeChannels = ctx.webServer.register({
    kind: "exact",
    path: CHANNELS_ROUTE,
    handler: channelOnly((req, res) => sendJson(res, 200, registryPayload())),
  });
  const disposeChannelActions = ctx.webServer.register({
    kind: "prefix",
    path: CHANNELS_ROUTE + "/",
    handler: channelOnly((req, res) => handleChannels(req, res)),
  });

  // 本地二维码渲染（修复⑤：替换 client 直连第三方 api.qrserver.com，零外网依赖）。
  // loopback-only：设置页与本机同源，走同源 <img> 即可，不需要带 Token。
  const disposeQr = ctx.webServer.register({
    kind: "exact",
    path: QR_ROUTE,
    handler: channelOnly((req, res) => {
      try {
        const url = new URL(req.url, "http://x");
        const text = String(url.searchParams.get("text") || "").trim();
        const size = Number.parseInt(String(url.searchParams.get("size") || "180"), 10);
        if (!text) {
          sendJson(res, 400, { error: "qr: missing 'text' param" });
          return;
        }
        const svg = qrSvg(text, { size: Number.isFinite(size) && size > 0 ? size : 180 });
        res.writeHead(200, {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(svg);
      } catch (err) {
        sendJson(res, 400, { error: "qr: " + String(err?.message || err) });
      }
    }),
  });

  // 迁移提示（SPEC §5/§11）：旧 allowlist 仍在生效时提醒换用新字段
  const legacyAllowlist = String((config || {}).allowlist || "").trim();
  if (legacyAllowlist && !String((config || {}).whitelistWechat || "").trim()) {
    console.log("[openclaw-bridge] migration: legacy allowlist is active — set whitelistWechat in Settings > IM 桥接 to take over");
  }

  const port = ctx.webServer.port || "?";
  console.log(
    "[openclaw-bridge] mounted on http://127.0.0.1:" + port + CHAT_ROUTE +
      " | health: http://127.0.0.1:" + port + HEALTH_ROUTE +
      " | channels: http://127.0.0.1:" + port + CHANNELS_ROUTE +
      " | workspace: " + join(BRIDGE_HOME, "workspace") +
      " | token: " + (bridgeToken ? "enabled" : "unavailable (loopback-only)")
  );
  return () => {
    disposeChat();
    disposeHealth();
    disposeWxStatus();
    disposeWxLogin();
    disposeWxVerify();
    disposeWxLogout();
    disposeChannels();
    disposeChannelActions();
    disposeQr();
    // 修复⑥：插件 teardown 时显式释放全部池内 agent 并清空池/绑定，
    // 避免热重载后留下 stale 引用（框架层会随 fiber 一并清理，这里双保险）。
    for (const rec of pool.values()) disposeRec(rec);
    pool.clear();
    wxBinds.clear();
    feishuBinds.clear();
    wechat.dispose();
    feishu.dispose();
    customRegistration();
  };
}

export { Config, apply, inject, name, PROVIDER_ID, OpenAiCompatAdapter };
