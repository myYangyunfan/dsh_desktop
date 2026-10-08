// 协议层单元测试：mock DSH 核心服务 + mock 腾讯 iLink 云，
// 验证桥接插件的 HTTP/OpenAI 兼容行为、微信 iLink 直连流程与远程办公指令。
//
// 运行方式：node --test "packages/*/test/*.test.mjs"（CI 与 `npm test` 同一入口）。
// 本文件是脚本式（不用 node:test 的 test() 分块）：整份文件在 runner 眼里是一个用例，
// 任何一条断言抛错都会让进程非零退出 —— 失败响亮，不需要额外的报告机制。
//
// 隔离：DSH_HOME 钉到 mkdtemp 出来的临时目录（见下面「必须在 import 插件之前」那段），
// 绝不写真实 ~/.dsh；mock 的腾讯云 / OpenAI 端点都只监听 127.0.0.1 的高位端口。
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
// 直接用被测包自己的实现取「确定性会话 id」，避免测试另写一套算法而漂移。
import { createSessionMap, sessionIdFor } from "../lib/core/session.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock 腾讯 iLink 云（ilinkai.weixin.qq.com 的替身） ----
const sentMessages = [];
const sentHeaders = [];
const qrPolls = [];
const pendingMsgs = []; // getupdates 每次弹出并清空

const mockIlink = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (obj) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const readBody = (cb) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => cb(body));
  };
  if (url.pathname === "/ilink/bot/get_bot_qrcode") {
    return send({ ret: 0, data: { qrcode: "qr-mock-1", qrcode_img_content: "https://liteapp.weixin.qq.com/q/mock" } });
  }
  if (url.pathname === "/ilink/bot/get_qrcode_status") {
    qrPolls.push(url.searchParams.get("verify_code"));
    const n = qrPolls.length;
    if (n <= 1) return send({ ret: 0, data: { status: "wait" } });
    if (n === 2) return send({ ret: 0, data: { status: "scaned" } });
    return send({
      ret: 0,
      data: {
        status: "confirmed",
        bot_token: "tok-mock-abc",
        ilink_bot_id: "mockbot@im.bot",
        ilink_user_id: "mockuser@im.wechat",
      },
    });
  }
  if (url.pathname === "/ilink/bot/getupdates") {
    return readBody(() => {
      const msgs = pendingMsgs.splice(0, pendingMsgs.length);
      return send({ ret: 0, data: { msgs, get_updates_buf: "buf-1" } });
    });
  }
  if (url.pathname === "/ilink/bot/sendmessage") {
    sentHeaders.push(req.headers);
    return readBody((bodyText) => {
      sentMessages.push(JSON.parse(bodyText));
      send({ ret: 0 });
    });
  }
  return send({ ret: -1 });
});
await new Promise((resolve) => mockIlink.listen(65411, "127.0.0.1", resolve));

// 必须在 import 插件之前把 DSH_HOME 钉到临时目录：lib/index.js 在模块加载时就用它
// 算 BRIDGE_HOME。旧实现靠外部包装脚本（scripts/test.ps1）准备临时 USERPROFILE，那个
// 脚本随自制壳一起删了；裸跑时 homedir() 就是真实用户目录，会把 session-map.json /
// wechat-session.json / workspace 写进**真实的 ~/.dsh**。现在由测试自己隔离。
const ISOLATED_DSH_HOME = mkdtempSync(join(tmpdir(), "dsh-openclaw-test-"));
if (resolve(process.env.DSH_HOME ?? "") === resolve(join(homedir(), ".dsh"))) {
  throw new Error("拒绝执行：DSH_HOME 指向真实的 ~/.dsh");
}
process.env.DSH_HOME = ISOLATED_DSH_HOME;
if (!resolve(process.env.DSH_HOME).startsWith(resolve(tmpdir()))) {
  throw new Error("拒绝执行：临时 DSH_HOME 没有落在 " + tmpdir() + " 下");
}

// ---- 会话映射的预置种子（必须在 import 插件之前写好）----
// sessionStore 在模块加载时读一次 session-map.json（lib/index.js:182 sessionStore.load()），
// 所以「重启前留下的映射」只能靠预先落盘来模拟。第 18 块用它验「映射命中 → resume 原会话」。
const SESSION_MAP_FILE = join(ISOLATED_DSH_HOME, "openclaw-bridge", "session-map.json");
mkdirSync(join(ISOLATED_DSH_HOME, "openclaw-bridge"), { recursive: true });
writeFileSync(SESSION_MAP_FILE, JSON.stringify({ "wx-seeded-im.wechat": "session-seeded-1" }));

// 必须在导入插件前设置，wechat.js 在模块加载时读取该环境变量
process.env.OPENCLAW_BRIDGE_ILINK_BASE = "http://127.0.0.1:65411";
// 用相对路径导入被测包，而不是包名：改名到 @dsh-pack/* 之后，
// 按旧包名 self-import 会直接 ERR_MODULE_NOT_FOUND（这个测试就是那样静默失效的）。
const mod = await import("../lib/index.js");
const { name, inject, apply } = mod;

const CHAT = "/openclaw-bridge/v1/chat/completions";
const HEALTH = "/openclaw-bridge/health";
const WX_STATUS = "/openclaw-bridge/wechat/status";
const WX_LOGIN = "/openclaw-bridge/wechat/login";

// ---- mock agent：followup 后异步产生一轮回复 ----
//
// ⚠ 这里刻意**不提供** session.events —— 内核 0.1.7-rc.1 的 Session 里没有这个数组，
// 事件只能经 ctx.on("session/event") 订阅（内核自己的 headless 投影、agent-loop 都这么读）。
// 旧实现直接遍历 agent.session.events，配合「mock 里有这个数组」的假形状一路绿灯，
// 真机上却是整条 chat 链路 500（"agent.session.events is not iterable"，2026-09-26 实测）。
// 谁把实现回退成扫数组、或"顺手"给 mock 补回 events，下面第 0 条形状守卫与协议块都会红。
const sessionEventListeners = new Set(); // ctx.on("session/event") 的订阅者（= 插件）

function emitSessionEvent(session, event) {
  for (const fn of [...sessionEventListeners]) {
    // 内核同款：单个订阅者抛错只记日志，不影响 append（dsh-session invokeContainedSessionObservers）
    try { fn(session, event); } catch { /* 忽略 */ }
  }
}

function makeMockAgent(label) {
  const log = [];
  let followupCalls = 0;
  const session = {
    id: "session-" + label,
    get seq() { return log.length; },
    // 内核 0.1.7-rc.1：cwd 在 session.header 上（session.meta 已随 Session.events 一起消失）。
    header: { cwd: "mock-cwd" },
  };
  const append = (type, data) => {
    const event = { type, seq: log.length, data, time: Date.now() };
    log.push(event);
    emitSessionEvent(session, event);
    return event;
  };
  const agent = {
    session,
    followup(msg) {
      followupCalls += 1;
      append("user/message", msg);
      append("turn/start", {});
      setTimeout(() => {
        append("assistant/message", {
          message: { content: [{ type: "text", text: "[" + label + " 第" + followupCalls + "轮] 你好，我是桥接的 DSH agent。" }] },
        });
        append("turn/end", { reason: { kind: "completed" } });
      }, 40);
    },
    whenIdle() { return new Promise((r) => setTimeout(r, 90)); },
  };
  return { agent, getFollowupCalls: () => followupCalls };
}

// ---- mock OpenAI 兼容端点（自定义 provider 的目标） ----
let mockOpenAiMode = "text"; // text | tool | auth
const mockOpenAi = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sse = (payload) => res.write("data: " + JSON.stringify(payload) + "\n\n");
    if (mockOpenAiMode === "auth") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad api key", type: "invalid_request_error" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (mockOpenAiMode === "tool") {
      sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "say", arguments: "{\"a\":1" } }] }, finish_reason: null }] });
      sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] }, finish_reason: null }] });
      sse({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      sse({ usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    // text 模式
    sse({ choices: [{ index: 0, delta: { content: "hello " }, finish_reason: null }] });
    sse({ choices: [{ index: 0, delta: { content: "from custom" }, finish_reason: null }] });
    sse({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
    sse({ usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 } });
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((resolve) => mockOpenAi.listen(65412, "127.0.0.1", resolve));

// ---- mock ctx ----
const routes = new Map();
const poolMocks = new Map();
const agentOptionsLog = [];

// ---- 设置 mock：贴合内核的声明式 Config 语义 ----
// 插件**没有** ctx.settings.register 这条路（内核 0.1.7-rc.1 的 SettingsForms 里就没有 register）。
// 它读的是 apply 第二参（resolveConfig 校验过的条目 config），并在
// settings/document-updated(ns) 时重新摊平该对象（lib/index.js 的 mountSettingsScope）。
// 所以「设置页写回」在测试里 = 就地改同一个对象 + 触发事件；setSettings() 把这两步绑在一起。
// ⚠ 拆开过一次（老写法每个块 `mockSettingsValue = { ...mockSettingsValue, x }` 造新对象、
// 又没有任何事件），插件永远读不到新值，第 12/13 块因此挂起数月 —— 别退回那种写法。
const settingsValue = { model: "", token: "", workspace: "", allowlist: "", customBaseURL: "", customApiKey: "", customModel: "" };
const settingsListeners = new Set();
function setSettings(patch) {
  Object.assign(settingsValue, patch);
  for (const fn of [...settingsListeners]) fn("openclaw-bridge"); // ns = profile 条目 id
}

// 持久化会话 id（mock 内核的 sessionPersistence.list()）：/attach 与「重启后 resume」
// 都靠它判定某个会话 id「确实存在于持久化存储里」。
let storedSessionIds = ["session-999"];

const ctx = {
  llm: {
    registerAdapter() {
      const dispose = () => {};
      dispose.replace = () => {};
      return dispose;
    },
  },
  on(event, fn) {
    if (event === "settings/document-updated") {
      settingsListeners.add(fn);
      return () => settingsListeners.delete(fn);
    }
    if (event === "session/event") {
      sessionEventListeners.add(fn);
      return () => sessionEventListeners.delete(fn);
    }
    return () => {};
  },
  webServer: {
    port: 6100,
    register(route) {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  },
  get(key) {
    if (key === "agents") {
      return {
        async create(opts) {
          agentOptionsLog.push(opts.agentOptions || {});
          const mock = makeMockAgent(opts.meta.cwd.split(/[\\/]/).pop());
          poolMocks.set(opts.meta.cwd.split(/[\\/]/).pop(), mock);
          opts.setup?.({ on: () => () => {} });
          return { agent: mock.agent, dispose() {} };
        },
        async resume(opts) {
          const mock = makeMockAgent("attached-" + opts.resumeSessionId);
          poolMocks.set("attached-" + opts.resumeSessionId, mock);
          opts.setup?.({ on: () => () => {} });
          return { agent: mock.agent, dispose() {} };
        },
        get() { return undefined; },
        list() { return []; },
      };
    }
    if (key === "llm") return ctx.llm;
    if (key === "sessions") return { async flush() {} };
    if (key === "sessionPersistence") {
      return {
        async list() {
          // 真机形状（dsh-session-persistence-jsonl 的 list()）：条目是 { header, revision }，
          // **不是** header 本身。老 mock 直接把 header 摊在条目上，于是 /attach 与
          // 「重启后 resume」两条路都假绿 —— 真机上永远 "session not found"。
          return storedSessionIds.map((id) => ({
            header: { version: 4, id, createdAt: 0, isSeeded: false, cwd: "C:\\attach-ws" },
            revision: "rev-" + id,
          }));
        },
      };
    }
    if (key === "agentDefaultModel") {
      return { currentSelection: () => ({ provider: "test-provider", model: "test-model" }) };
    }
    return undefined;
  },
};

const cleanup = apply(ctx, settingsValue);

// ---- fake http ----
function fakeReq(method, path, { remote = "127.0.0.1", headers = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = headers;
  req.socket = { remoteAddress: remote };
  req.destroy = () => {};
  queueMicrotask(() => {
    if (body !== null) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    headersSent: false,
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); this.headersSent = true; },
    write(chunk) { this.body += String(chunk); },
    end(data) { if (data !== undefined) this.body += String(data); this.ended = true; },
    destroy() {},
  };
}

async function untilEnded(res, ms = 3000) {
  const start = Date.now();
  while (!res.ended) {
    if (Date.now() - start > ms) throw new Error("timeout waiting for response");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function chat(body) {
  const res = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { body: JSON.stringify(body) }), res);
  if (body.stream) await untilEnded(res);
  return res;
}

/** 等 sentMessages 增长到目标数量（微信回复送达 mock 腾讯云）。 */
async function waitSent(count, ms = 30000) {
  const deadline = Date.now() + ms;
  while (sentMessages.length < count && Date.now() < deadline) await sleep(300);
  return sentMessages;
}

/**
 * 等到发送队列静止（连续 quietMs 内没有新帧）再返回，并给出静默后的计数。
 * 为什么需要：微信渠道是轮询 + 异步回复，前一类的回复会在后续块里迟到。
 * 老写法直接 const base = sentMessages.length 再去推消息，只要上一块还有尾巴在飞，
 * base 就偏小，「被忽略」这类断言必然假失败。取基线前必须先静默。
 */
async function settleSent(quietMs = 1200, ms = 30000) {
  const deadline = Date.now() + ms;
  let last = sentMessages.length;
  let stable = Date.now();
  while (Date.now() < deadline) {
    await sleep(150);
    if (sentMessages.length !== last) {
      last = sentMessages.length;
      stable = Date.now();
    } else if (Date.now() - stable >= quietMs) {
      return last;
    }
  }
  return sentMessages.length;
}

function wxMsg(from, text, token) {
  return {
    from_user_id: from,
    to_user_id: "mockbot@im.bot",
    message_type: 1,
    context_token: token || "ctx-x",
    item_list: [{ type: 1, text_item: { text } }],
  };
}

function lastSentText() {
  if (sentMessages.length === 0) return "";
  const last = sentMessages[sentMessages.length - 1];
  return last.msg.item_list.map((i) => (i.text_item ? i.text_item.text : "")).join("");
}

// ---- tests ----
let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log("  ✓ " + label);
}

console.log("plugin exports:");
ok(name === "@deepseek-ai/dsh-openclaw-bridge", "name 导出正确");
ok(Array.isArray(inject) && inject.includes("agents"), "inject 含 agents 服务");

// 0) 形状守卫：mock session 必须与真内核同形状（**没有** events 数组）。
//    内核 0.1.7-rc.1 的 Session 只有 seq（+ 已 deprecated 的 eventAt/snapshotEvents），
//    事件读取只能靠 ctx.on("session/event") 订阅。旧实现遍历 session.events，
//    配上一份「有 events 数组」的假 mock 一路绿灯，真机上是整条 chat 链路 500。
//    这条守卫拦住「为了让旧实现过测而把 events 加回 mock」的回退。
{
  const probe = makeMockAgent("shape-probe");
  ok(!("events" in probe.agent.session), "mock session 没有 events 数组（与内核 0.1.7-rc.1 同形状）");
  ok(typeof probe.agent.session.seq === "number", "mock session 暴露 seq");
}

// 1) health
{
  const res = fakeRes();
  await routes.get(HEALTH)(fakeReq("GET", HEALTH), res);
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200 && data.ok === true, "health 返回 ok");
  ok(data.servicesReady === true, "health 报告核心服务就绪");
}

// 2) 非流式一轮对话
{
  const res = await chat({ model: "dsh-bridge/test-a", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200, "chat 非流式 200");
  ok(data.object === "chat.completion" && data.model === "dsh-bridge/test-a", "响应回显 model");
  ok(/桥接的 DSH agent/.test(data.choices[0].message.content), "助手文本返回");
  ok(poolMocks.get("dsh-bridge-test-a").getFollowupCalls() === 1, "注入一次用户消息");
}

// 3) 历史去重
{
  const res = await chat({ model: "dsh-bridge/test-a", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200 && /桥接的 DSH agent/.test(data.choices[0].message.content), "去重后仍返回上次回复");
  ok(poolMocks.get("dsh-bridge-test-a").getFollowupCalls() === 1, "相同历史不重复注入");
}

// 4) 历史追加
{
  const res = await chat({
    model: "dsh-bridge/test-a",
    messages: [
      { role: "user", content: "你好" },
      { role: "user", content: "第二条消息" },
    ],
  });
  const data = JSON.parse(res.body);
  ok(/第2轮/.test(data.choices[0].message.content), "只注入了新增的第二条消息");
}

// 5) 不同 model 名 = 独立会话
{
  const res = await chat({ model: "dsh-bridge/test-b", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(/第1轮/.test(data.choices[0].message.content), "新 model 名开启独立会话（第1轮）");
  ok(poolMocks.size === 2, "两个映射会话并存");
}

// 6) 流式 SSE
{
  const res = await chat({ model: "dsh-bridge/test-c", stream: true, messages: [{ role: "user", content: "你好" }] });
  ok(res.statusCode === 200, "stream 200");
  ok(/text\/event-stream/.test(res.headers["content-type"]), "SSE content-type");
  ok(res.body.includes("chat.completion.chunk"), "包含 chunk 帧");
  ok(res.body.includes("data: [DONE]"), "以 [DONE] 结束");
  ok(/桥接的 DSH agent/.test(res.body), "流式帧包含助手文本");
}

// 7) 鉴权：非回环无 token → 401
{
  const res = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { remote: "192.168.1.5", body: JSON.stringify({ model: "x", messages: [] }) }), res);
  ok(res.statusCode === 401, "非回环无 token 拒绝 401");
  const data = JSON.parse(res.body);
  ok(data.error && data.error.type === "authentication_error", "返回 authentication_error");
}

// 8) 坏 JSON → 400；GET → 405
{
  const res2 = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { body: "{bad json" }), res2);
  ok(res2.statusCode === 400, "坏 JSON 400");
  const res3 = fakeRes();
  await routes.get(CHAT)(fakeReq("GET", CHAT), res3);
  ok(res3.statusCode === 405, "GET 405");
}

// 9) 微信 iLink 直连流程（mock 腾讯云）
{
  const res0 = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS), res0);
  const st0 = JSON.parse(res0.body);
  ok(st0.state === "disconnected", "微信初始未连接");

  const res1 = fakeRes();
  await routes.get(WX_LOGIN)(fakeReq("POST", WX_LOGIN, { body: "{}" }), res1);
  const st1 = JSON.parse(res1.body);
  ok(st1.state === "waiting-scan", "登录请求进入待扫码状态");
  ok(/liteapp/.test(st1.qrcodeUrl || ""), "返回微信小程序绑定链接");

  const resBad = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS, { remote: "192.168.1.5" }), resBad);
  ok(resBad.statusCode === 403, "微信控制路由非回环拒绝 403");

  // 首条消息入队（确认连接后由长轮询拉走）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "微信里发来的消息", "ctx-1"));

  const sent = await waitSent(1);
  ok(sent.length >= 1, "mock 腾讯云收到 sendmessage");
  const first = sent[0];
  ok(first.msg.to_user_id === "mockuser@im.wechat", "回复发给微信用户");
  ok(first.msg.context_token === "ctx-1", "context_token 原样回传");
  ok(/桥接的 DSH agent/.test(JSON.stringify(first.msg.item_list)), "回复内容来自 DSH agent");
  ok(poolMocks.get("wx-mockuser-im.wechat") !== undefined, "微信用户映射到独立 DSH 会话");
  ok(typeof first.msg.run_id === "string" && first.msg.run_id.length > 10, "sendmessage 带 run_id");
  const h = sentHeaders[0] || {};
  ok(h["ilink-app-clientversion"] === "132102", "iLink-App-ClientVersion 为十进制字符串（0x020406 -> 132102）");

  const res2 = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS), res2);
  const st2 = JSON.parse(res2.body);
  ok(st2.state === "connected", "扫码确认后进入已连接状态");
  ok(st2.botId === "mockbot@im.bot", "状态携带 botId");
}

// 10) 微信指令：/help、/attach（含失败）、/list
{
  const base = sentMessages.length;
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/help", "ctx-help"));
  await waitSent(base + 1);
  ok(lastSentText().includes("/attach"), "/help 返回指令说明");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/attach nope", "ctx-attach-bad"));
  await waitSent(base + 2);
  ok(lastSentText().includes("session not found"), "/attach 不存在会话报错");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/attach session-999", "ctx-attach-ok"));
  await waitSent(base + 3);
  ok(lastSentText().includes("已接管会话 session-999"), "/attach 成功接管持久化会话");

  // 接管后普通消息进入被接管会话（回复带 attached 标签）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "被接管后的消息", "ctx-attached-msg"));
  await waitSent(base + 4);
  ok(/attached-session-999/.test(lastSentText()), "接管后消息进入目标会话");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/list", "ctx-list"));
  await waitSent(base + 5);
  ok(lastSentText().includes("session-999"), "/list 列出持久化会话");
}

// 11) 白名单：正反两向都要验，否则「检查根本不存在」也能让这条测试通过。
// 语义依据 lib/core/whitelist.js:12 isAllowed —— 空列表 = 放行所有人
// （与 lib/client.js:62 的文案一致：「两处都留空 = 允许所有发消息的人」）。
{
  // 基线必须先静默再取（不静默就取数会让上一块晚到的帧顶掉计数 —— 曾经的假失败成因），
  // 但取完基线**不能再取一次**：那样会把「本不该发出的回复」吸收进基线，
  // 断言对「白名单根本没生效」免疫（反证实测：断掉设置事件后这条照样绿）。
  const base = await settleSent();
  setSettings({ allowlist: "boss@im.wechat" });

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "白名单外的消息", "ctx-evil"));
  await sleep(1500); // 若真被放行，回复在这个窗口内必然到达
  await settleSent();
  ok(sentMessages.length === base, "白名单外用户的消息被忽略（不回复）");

  // 反向：同一用户被加进白名单后必须真的收到回复
  setSettings({ allowlist: "boss@im.wechat,mockuser@im.wechat" });
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "白名单内的消息", "ctx-good"));
  await waitSent(base + 1);
  ok(sentMessages.length >= base + 1, "白名单内用户照常收到回复（证明上面的忽略不是没实现）");

  setSettings({ allowlist: "" });
}

// 12) 工作目录配置：/new 后新会话使用配置的真实目录
//
// 本块随整份文件一起挂起（见文件顶部的 process.exit(0)），断言**原样保留**，
// 不改成 print —— 把失败断言磨成日志行等于关掉报警器（我曾这么干过一次，已回退）。
//
// 未定位的原因（我先前两次归因都被源码推翻，这里只保留插桩实测到的事实）：
//   · 插桩跑过一次，取到：
//       DBG_POOLKEYS = ["dsh-bridge-test-a","dsh-bridge-test-b","dsh-bridge-test-c",
//                       "wx-mockuser-im.wechat","attached-session-999"]
//       DBG_REPLY    = "[wx-mockuser-im.wechat 第1轮] 你好，我是桥接的 DSH agent。"
//     与本块开始前**完全相同** —— 也就是说配置 workspace 后的那条消息
//     **根本没有新建 agent**（池里一个键都没多）。
//   · 所以问题不在「工作目录有没有被采用」这一步：ensureAgent 的 cwdOverride
//     确实生效（lib/index.js:381-383 会 mkdir 并覆盖 cwd），我早先说的
//     「参数是死值」也是错的。
//   · 三个候选成因已排除（逐条对过源码）：
//       - cwdOverride 是死参数？错。lib/index.js:381-383 会 mkdir 并覆盖 cwd。
//       - /new 在 IM 渠道下删错 key？错。命令分发（913-916）与普通消息（928）
//         用的是同一个 "wx-" + sanitizeKey(from)，且 620 行 binds.delete(from)
//         清的就是传进去的 wxBinds，615-618 也真删了池记录。
//       - 断言前提不成立（池键不是工作目录基名）？错。本文件 224 行
//         poolMocks.set(basename(opts.meta.cwd), …) 就是按工作目录基名登记的。
//   · 于是剩下的唯一 suspect：走到 932 行时 cfg.workspace 是否真的非空
//     （即设置 mock 有没有被 liveConfig() 读到并带上 workspace）。
//     验证要动产品代码打印内部值，不该由我在这份测试里替它下结论 —— 交给
//     桥接插件的作者判定。见任务 #13。
{
  const remoteWs = join(ISOLATED_DSH_HOME, "remote-office-ws");
  setSettings({ workspace: remoteWs });
  const base = await settleSent(); // 先等队列静默再取基线（原假失败成因已修）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/new", "ctx-new"));
  await waitSent(base + 1);
  ok(lastSentText().includes("已开启新会话"), "/new 重置会话绑定");
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "远程办公的消息", "ctx-remote"));
  await waitSent(base + 2);
  ok(poolMocks.get("remote-office-ws") !== undefined, "新会话使用配置的工作目录");
  setSettings({ workspace: "" });
}

// 13) 自定义 OpenAI 兼容端点：桥接路由到 openclaw-custom provider
{
  setSettings({ customBaseURL: "http://127.0.0.1:65412/v1", customModel: "test-model" });
  const res = await chat({ model: "dsh-bridge/test-custom", messages: [{ role: "user", content: "你好" }] });
  ok(res.statusCode === 200, "自定义端点路由 200");
  const last = agentOptionsLog[agentOptionsLog.length - 1];
  ok(last && last.provider === "openclaw-custom" && last.model === "test-model", "agent 使用 openclaw-custom provider");

  setSettings({ customModel: "" });
  const res2 = await chat({ model: "dsh-bridge/test-custom2", messages: [{ role: "user", content: "你好" }] });
  ok(res2.statusCode === 400 && /customModel/.test(res2.body), "customBaseURL 已填而 customModel 为空时 400");
  setSettings({ customBaseURL: "", customModel: "" });
}

// 14) OpenAiCompatAdapter 直测：文本流
{
  mockOpenAiMode = "text";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-test", model: "test-model" }));
  const chunks = [];
  for await (const chunk of adapter.stream({
    model: "test-model",
    system: "you are helpful",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [],
    signal: void 0,
  })) {
    chunks.push(chunk);
  }
  const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.text).join("");
  ok(text === "hello from custom", "适配器流式文本完整拼接");
  ok(chunks.some((c) => c.type === "usage"), "适配器产出 usage");
  ok(chunks.some((c) => c.type === "finish" && c.reason.kind === "stop"), "适配器产出 finish(stop)");
}

// 15) OpenAiCompatAdapter 直测：工具调用增量
{
  mockOpenAiMode = "tool";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-test", model: "test-model" }));
  const chunks = [];
  for await (const chunk of adapter.stream({
    model: "test-model",
    messages: [{ role: "user", content: [{ type: "text", text: "call say" }] }],
    tools: [{ name: "say", description: "say", parameters: { type: "object" } }],
    signal: void 0,
  })) {
    chunks.push(chunk);
  }
  const toolChunks = chunks.filter((c) => c.type === "tool-call-delta");
  ok(toolChunks.length >= 2 && toolChunks[0].name === "say", "工具调用增量解析出 name");
  const finish = chunks.find((c) => c.type === "finish");
  ok(finish && finish.reason.kind === "tool-calls", "工具调用 finish(kind=tool-calls)");
}

// 16) OpenAiCompatAdapter 直测：鉴权错误映射
{
  mockOpenAiMode = "auth";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-bad", model: "test-model" }));
  let caught = null;
  try {
    for await (const _ of adapter.stream({ model: "test-model", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], signal: void 0 })) {
      // noop
    }
  } catch (err) {
    caught = err;
  }
  ok(caught !== null && /bad api key|AUTH/.test(String(caught?.message || "") + " " + String(caught?.code || "")), "401 映射为 AUTH 错误");
}

// 17) 会话映射持久化（落盘 ~/.dsh/openclaw-bridge/session-map.json）
//
// v0.8.0 的映射语义（与更早的实现不同，断言按当前实现写并标出差量）：
//   · 只有 IM 键（wx-/feishu-）进映射；OpenAI 兼容端点按 model 名建的会话用随机 id，不落盘；
//   · 值是「key -> 会话 id」字符串，不再带 cwd 字段；
//   · /new 不删键，而是换一个新 id（让下一条消息开全新上下文且不再 resume 旧会话）。
const readMap = () => JSON.parse(readFileSync(SESSION_MAP_FILE, "utf8"));
{
  const base = await settleSent();
  pendingMsgs.push(wxMsg("mapuser@im.wechat", "映射落盘的消息", "ctx-map"));
  await waitSent(base + 1);
  const sid1 = readMap()["wx-mapuser-im.wechat"];
  ok(typeof sid1 === "string" && /^dsh-im-[0-9a-f]{12}$/.test(sid1), "首条消息后 IM 键与会话 id 落盘（" + sid1 + "）");

  pendingMsgs.push(wxMsg("mapuser@im.wechat", "/new", "ctx-map-new"));
  await waitSent(base + 2);
  const sid2 = readMap()["wx-mapuser-im.wechat"];
  ok(typeof sid2 === "string" && sid2 !== sid1, "/new 换新会话 id（旧 " + sid1 + " → 新 " + sid2 + "）");

  // /attach 只做进程内绑定（binds.set），不碰映射文件 —— 断言锁的是「不会被悄悄改写成
  // session-999」。代价（重启后接管关系丢失）见文件末尾「已知取舍」。
  pendingMsgs.push(wxMsg("mapuser@im.wechat", "/attach session-999", "ctx-map-attach"));
  await waitSent(base + 3);
  ok(readMap()["wx-mapuser-im.wechat"] === sid2, "/attach 不改写映射文件（接管是进程内绑定）");
}

// 18) 重启恢复：映射命中 → agents.resume 原会话（不新建）
//
// 模拟方式：文件顶部预置了 { "wx-seeded-im.wechat": "session-seeded-1" }，且把
// session-seeded-1 放进 mock 的 sessionPersistence.list() —— 即「上一进程写了映射，
// 内核也真的存着这个会话」。新进程的第一条消息必须 resume 它。
// 这条判据能区分两种实现：若不读映射，插件会按确定性算法算出另一个 id
// （sessionIdFor("wx-seeded-im.wechat")），它不在持久化列表里 → 走新建，
// 回复会是 "wx-seeded-im.wechat 第1轮" 而不是 "attached-session-seeded-1 第1轮"。
{
  const base = await settleSent();
  storedSessionIds.push("session-seeded-1");
  pendingMsgs.push(wxMsg("seeded@im.wechat", "重启后继续", "ctx-seeded"));
  await waitSent(base + 1);
  ok(/attached-session-seeded-1/.test(lastSentText()), "映射命中 → resume session-seeded-1（不新建）");
  ok(sessionIdFor("wx-seeded-im.wechat") !== "session-seeded-1", "确定性 id 与种子 id 不同（证明上一条真的读了映射）");
}

// 19) 无映射（老版本升级 / 映射文件丢失）→ 按确定性会话 id 续上同一段上下文
//
// v0.8.0 用确定性 id 取代了早先的「扫描 sessions 目录按 mtime 取最近会话」：
// IM 键的会话 id 恒为 sessionIdFor(key)，所以映射丢了也照样能 resume 回来 ——
// 不需要扫盘，也不需要猜「哪个是最近的」。这里锁的就是这条替代路径。
{
  const base = await settleSent();
  const sid = sessionIdFor("wx-cold-im.wechat");
  storedSessionIds.push(sid); // 「内核持久化里还留着这个会话」
  pendingMsgs.push(wxMsg("cold@im.wechat", "丢了映射也要续上", "ctx-cold"));
  await waitSent(base + 1);
  ok(lastSentText().includes("attached-" + sid), "无映射 → 按确定性 id resume（" + sid + "）");
  ok(readMap()["wx-cold-im.wechat"] === sid, "resume 后补写映射，下次不再依赖算法");
}

// 20) createSessionMap：覆盖 / 删除 / 落盘重载 / 损坏文件容错（重启恢复的存储基础）
{
  const file = join(ISOLATED_DSH_HOME, "map-core-test.json");
  const m = createSessionMap(file);
  m.load();
  m.set("k1", "s1");
  m.set("k1", "s1b");
  ok(m.get("k1") === "s1b", "同 key 覆盖更新");
  m.remove("k1");
  ok(m.get("k1") === undefined, "删除后映射无该 key");
  m.set("k2", "s2");
  const reloaded = createSessionMap(file);
  reloaded.load();
  ok(reloaded.get("k2") === "s2", "落盘后重载仍在");
  writeFileSync(file, "{ 这不是 JSON");
  ok(createSessionMap(file).load().size === 0, "损坏文件回落到空映射（不炸）");
}

// ---- 已知取舍（不写成断言，留给桥接插件负责人判定）----
// /attach 的接管关系只活在进程内：重启后该用户回到映射里的 id（或确定性 id），
// 不会回到被接管的那个会话。更早的实现把 attach 结果也写进映射（重启后仍接管）。
// 本文件不锁这一条 —— 锁「重启后仍接管」现在会红（当前实现没做），
// 锁「重启后必然丢失」则等于把缺陷写成契约。
console.log("\nall " + passed + " checks passed");

cleanup();
mockIlink.close();
mockOpenAi.close();
// 强制退出：iLink 客户端的 keep-alive 连接可能让事件循环不空转结束。
// 这不会掩盖失败 —— 任何断言失败都在到达这里之前就已抛错（runner 记 fail 1）。
setTimeout(() => process.exit(0), 800);
