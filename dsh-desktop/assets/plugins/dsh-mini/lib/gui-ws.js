// @deepseek-ai/dsh-mini — gui-ws.js
// v3 GUI 的双 WebSocket 下推流（官方协议 1:1）：
//   ws://<origin>/api/events.mux   — Mux 帧（session/subscribed 基线 + session/event 增量）
//   ws://<origin>/api/events.host  — Host 帧（session-added/removed/status、agent-error、workspace 变更）
// 帧格式：{ type:'server-request', rpcId, method?, payload:<frame> }
// 纯下行：客户端只收不发（上行帧官方也拒绝）。
// 挂接：attachGuiWs(nodeHttpServer, ctx, authFn)，authFn(req,url)=>boolean 决定握手放行。
import { randomUUID, createHash } from "node:crypto";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(payload) {
  // 官方 WebApiClient 对 method 字段有 string 校验（dsh-client-connection handleMessage，
  // 缺 method 会被判 malformed frame 丢弃），method 即 payload.type（如 'session/event'）。
  return {
    type: "server-request",
    rpcId: randomUUID(),
    method: payload && typeof payload.type === "string" ? payload.type : "session/event",
    payload,
  };
}

function writeFrame(ws, payload) {
  return ws.send(JSON.stringify(frame(payload)));
}

function wsAccept(key) {
  return createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

// 极简 WebSocket 服务端（RFC6455 握手 + 文本帧发送；手机端只收下行）
function performHandshake(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Accept: " + wsAccept(key),
    "",
    "",
  ];
  socket.write(headers.join("\r\n"));
  return {
    send(text) {
      if (socket.destroyed) return false;
      try {
        const payload = Buffer.from(text, "utf8");
        const len = payload.length;
        let header;
        if (len < 126) {
          header = Buffer.from([0x81, len]);
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
        socket.write(Buffer.concat([header, payload]));
        return true;
      } catch {
        return false;
      }
    },
    close() {
      try {
        socket.end();
      } catch {
        /* ignore */
      }
    },
    onClose(fn) {
      socket.on("close", () => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
      socket.on("error", () => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    },
  };
}

// tool/call|result 的轻量 view（前端工具卡渲染用）
function toolViewFor(event) {
  if (!event || (event.type !== "tool/call" && event.type !== "tool/result")) return undefined;
  const data = event.data || {};
  const name = data.name || data.tool || (data.call ? data.call.name : undefined) || "tool";
  return { for: event.type === "tool/call" ? "call" : "result", view: { card: String(name) } };
}

// workspace wire 视图（对齐官方 dsh-host-apiproxy workspaceView/changedWorkspaceView，
// api-proxy.js:820-841）。domain/changed 增量帧用 changedWorkspaceView 从 record 提取；
// 初始快照和 registry.get() 用 workspaceView 从 workspace 对象提取。
function workspaceView(w) {
  return {
    workspaceId: w.id || w.workspaceId,
    path: w.path || "",
    title: w.title || "",
    sessionIds: [...(w.sessionIds || [])],
    createdAt: w.createdAt || "",
    updatedAt: w.updatedAt || "",
  };
}
function changedWorkspaceView(workspaceId, value) {
  const r = value && typeof value === "object" ? value : {};
  return {
    workspaceId: workspaceId,
    path: r.path || "",
    title: r.title || "",
    sessionIds: [...(r.sessionIds || [])],
    createdAt: r.createdAt || "",
    updatedAt: r.updatedAt || "",
  };
}

export function lastEventSeq(session) {
  try {
    if (session && typeof session.seq === "number") return session.seq - 1;
    const ev = session && session.events;
    if (Array.isArray(ev) && ev.length) return ev[ev.length - 1].seq;
  } catch { /* ignore */ }
  return -1;
}

export function attachGuiWs(server, ctx, authFn) {
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://x");
    const path = url.pathname;
    if (path !== "/api/events.mux" && path !== "/api/events.host") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!authFn(req, url)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const ws = performHandshake(req, socket);
    if (!ws) return;
    // head：客户端在握手后立即发来的帧（官方客户端只收不发），忽略
    void head;
    if (path === "/api/events.mux") startMux(ws, ctx);
    else startHost(ws, ctx);
  });
}

// ---------------------------------------------------------------------------
// mux 流：连接即全会话 subscribed 基线 + ctx.on('session/event') 增量
// ---------------------------------------------------------------------------
function startMux(ws, ctx) {
  const rc = (ctx && ctx.root) || ctx; // root scope：子 fiber ctx 收不到 DSH 主树 emit（实测），须用 root
  const subs = [];
  const push = (payload) => writeFrame(ws, payload);
  const subSession = (session) => {
    if (!session || !session.id) return;
    push({ type: "session/subscribed", sessionId: session.id, lastSeq: lastEventSeq(session) });
  };
  try {
    const sessions = ctx.get("sessions");
    const list = sessions ? sessions.list() : [];
    for (const s of list) subSession(s);
  } catch { /* ignore */ }
  try {
    subs.push(
      rc.on("session/event", (session, event) => {
        if (!session || !event) return;
        const view = toolViewFor(event);
        push({
          type: "session/event",
          sessionId: session.id,
          event,
          ...(view ? { view } : {}),
        });
      }, { global: true }),
      rc.on("session/created", (session) => subSession(session), { global: true }),
    );
  } catch { /* ignore */ }
  ws.onClose(() => {
    for (const d of subs) {
      try {
        d();
      } catch { /* ignore */ }
    }
  });
}

// ---------------------------------------------------------------------------
// host 流：workspace 快照 + session 生命周期 + agent 状态
// ---------------------------------------------------------------------------
function startHost(ws, ctx) {
  const rc = (ctx && ctx.root) || ctx; // root scope：子 fiber ctx 收不到 DSH 主树 emit（实测），须用 root
  const subs = [];
  const push = (payload) => writeFrame(ws, payload);
  const workspace = ctx.get("workspaceRegistry");
  if (workspace) {
    try {
      const list = workspace.list ? workspace.list() : [];
      for (const w of Array.isArray(list) ? list : []) {
        push({
          type: "host/workspace-changed",
          workspace: {
            workspaceId: w.workspaceId || w.id,
            path: w.path || "",
            title: w.title || "",
            sessionIds: w.sessionIds || [],
            createdAt: w.createdAt || "",
            updatedAt: w.updatedAt || "",
          },
        });
      }
      if (typeof workspace.archivedSessionIds === "function") {
        push({ type: "host/archived-sessions-changed", archivedSessionIds: workspace.archivedSessionIds() || [] });
      }
    } catch { /* ignore */ }
  }
  try {
    subs.push(
      // SPEC-v5 §1.6.2: cwd/parentSession/origin 从 session.header 提取（非顶层属性），
      // 对齐官方 sessionListFields(session.header, session.events)（api-proxy.js:408-419）。
      // session.cwd 顶层属性在 DSH 运行时通常 undefined → 旧代码帧里缺 cwd → 前端无法分组。
      rc.on("session/created", (session) => {
        if (!session) return;
        const header = session.header || {};
        push({
          type: "host/session-added",
          sessionId: session.id,
          blank: !session.running && !(Array.isArray(session.events) && session.events.length),
          ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
          ...(header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
          ...(header.origin === undefined ? {} : { origin: header.origin }),
        });
      }, { global: true }),
      rc.on("session/disposed", (session) => {
        if (session && session.id) push({ type: "host/session-removed", sessionId: session.id });
      }, { global: true }),
      rc.on("agent/status", ({ agent, status }) => {
        const id = agent && (agent.id || agent.sessionId);
        if (id) push({ type: "host/session-status", sessionId: id, running: status === "running" });
      }, { global: true }),
      rc.on("agent/error", ({ agent, error }) => {
        const id = agent && (agent.id || agent.sessionId);
        if (id) push({ type: "host/agent-error", sessionId: id, message: String((error && error.message) || error) });
      }, { global: true }),
      // SPEC-v5 §1.6.1: 补全 domain/changed 监听（对齐官方 api-proxy.js:3229-3285）。
      // 旧代码完全不监听此事件 → 电脑端新建会话后 workspaceRegistry 更新 sessionIds
      // 触发 domain/changed(domain='workspace') → dsh-mini 不转发 → 手机端侧栏不更新。
      rc.on("domain/changed", (change) => {
        if (!change || change.domain !== "workspace") return;
        const wr = ctx.get("workspaceRegistry");
        if (!wr) return;
        try {
          if (change.table === "") {
            // 全局 workspace 状态变更（order / archived / 新增 workspace）
            if (change.operation !== "put") return;
            const state = change.value || {};
            const ids = state.workspaceIds || [];
            for (const wid of ids) {
              const w = wr.get ? wr.get(wid) : null;
              if (w) push({ type: "host/workspace-changed", workspace: workspaceView(w) });
            }
            if (ids.length) push({ type: "host/workspace-order-changed", workspaceIds: [...ids] });
            const arch = wr.archivedSessionIds;
            const archList = typeof arch === "function" ? arch() : (Array.isArray(arch) ? arch : []);
            push({ type: "host/archived-sessions-changed", archivedSessionIds: [...archList] });
            return;
          }
          if (change.table !== "workspaces") return;
          if (change.operation === "deleted") {
            push({ type: "host/workspace-removed", workspaceId: change.key });
            return;
          }
          // 单个 workspace 记录变更（含 sessionIds 更新）——新建会话归入工作区时走此分支
          push({ type: "host/workspace-changed", workspace: changedWorkspaceView(change.key, change.value) });
        } catch { /* ignore */ }
      }, { global: true }),
    );
    // SPEC-v5 §1.6.3: 白名单转发事件（对齐官方 API_REMOTE_FORWARDED_EVENTS，
    // dsh-api-remotes/lib/types/remote-events.js:16-28）。官方 apiproxy 逐事件 verbatim
    // 转发；dsh-mini 不依赖 dsh-api-remotes，硬编码列表，逐个 try/catch 注册（缺失事件静默跳过）。
    const FORWARDED = [
      "agent-preset/selected", "commands/change", "credentials/updated",
      "cordis/request-run", "cordis/request-run-resolved",
      "cordis/dynamic-package", "cordis/dynamic-retract",
      "cordis/inspect-query", "cordis/inspect-query-resolved",
      "llm/adapters-updated", "settings/document-updated",
    ];
    for (const name of FORWARDED) {
      try {
        subs.push(
          rc.on(name, (...args) => {
            const p = args[0];
            if (p && typeof p === "object") {
              push(p.type ? p : { type: name, ...p });
            } else {
              push({ type: name });
            }
          }, { global: true }),
        );
      } catch { /* event not mounted, skip */ }
    }
  } catch { /* ignore */ }
  ws.onClose(() => {
    for (const d of subs) {
      try {
        d();
      } catch { /* ignore */ }
    }
  });
}

export const _internal = { frame, writeFrame, toolViewFor, lastEventSeq };