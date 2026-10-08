/**
 * dsh-easyrewrite — node half。
 *
 * host 路由：
 *  - POST /bubble/recall { sessionId, targetSeq } → 撤回：
 *    在 targetSeq 之前的最后一个闭合回合（turn/end）处 fork 新版本
 *    （新会话不含目标消息及其之后全部内容），flush 持久化。
 *    「真正修改」只发生在这里；client 侧 pending 只是本地草稿态。
 *
 * 依赖服务：webServer（路由）、sessions（fork/flush）。
 */
import { appendFile, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  return value;
}

// ---------- 统一日志（host 落盘 $DSH_HOME/dsh-easyrewrite.log） ----------
let logFile = null;
const logBuffer = [];
let isFlushing = false;
const MAX_LOG_BUFFER = 1000; // 防御性上限：防止极端磁盘卡死时堆积内存

function resolveLogFile() {
  if (logFile !== null) return logFile;
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  logFile = join(home, 'dsh-easyrewrite.log');
  return logFile;
}
function ts() { return new Date().toISOString(); }

/** 批处理自驱式落盘（彻底杜绝无界 Promise 链与闭包泄漏，合并 IO 提升吞吐）。 */
async function flushLogBuffer() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const file = resolveLogFile();
    await mkdir(dirname(file), { recursive: true });

    while (logBuffer.length > 0) {
      // 批量取出当前积攒的全部日志行
      const batch = logBuffer.splice(0, logBuffer.length);
      const content = batch.map((item) => item.line).join('\n') + '\n';
      try {
        await appendFile(file, content, 'utf8');
      } catch (e) {
        // 单次 IO 异常不抛，避免破坏进程
      }
      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve();
      }
    }
  } catch (e) {
    // 目录创建或严重异常降级：清空当前积攒队列，释放等待的 Promise
    while (logBuffer.length > 0) {
      const item = logBuffer.shift();
      item?.resolve();
    }
  } finally {
    isFlushing = false;
    if (logBuffer.length > 0) {
      flushLogBuffer().catch(() => {});
    }
  }
}

/** 串行化写入（按需批量落盘，支持 Promise 返回供外部 await，无无界闭包链）。 */
function writeLog(level, tag, message, data) {
  const line = JSON.stringify({ t: ts(), level, tag, message, data: data ?? null });
  // 默认静默（仅落盘）；调试模式：环境变量 DSH_EASYREWRITE_DEBUG=1 时输出控制台
  if (process.env.DSH_EASYREWRITE_DEBUG === '1') {
    if (level === 'error') console.error('[dsh-easyrewrite]', tag, message, data ?? '');
    else if (level === 'warn') console.warn('[dsh-easyrewrite]', tag, message, data ?? '');
    else console.info('[dsh-easyrewrite]', tag, message, data ?? '');
  }

  // 容量上限防御：若积压超过 1000 条，丢弃最早日志，绝不把内存撑大
  if (logBuffer.length >= MAX_LOG_BUFFER) {
    const dropped = logBuffer.shift();
    dropped?.resolve();
  }

  return new Promise((resolve) => {
    logBuffer.push({ line, resolve });
    flushLogBuffer().catch(() => {});
  });
}

export const name = 'dsh-easyrewrite'
export const inject = ['webServer', 'sessions', 'settings', 'agents']

/** 读取 JSON 请求体（带大小上限保护）。 */
function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // 超限：停止收集并继续消费 body（不 destroy——避免连接重置，handler 回 413）
        req.removeAllListeners('data');
        req.resume();
        reject(new Error('body-too-large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ---------- 路由安全层（review S1-S3）：会话 id 白名单 / 同源校验 / JSON Content-Type ----------
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]+$/;
function validSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && SESSION_ID_PATTERN.test(value);
}
/** 同源校验：请求必须来自本 GUI 页面（Origin/Referer 与 Host 匹配）；无 Origin（同源/非浏览器）放行。 */
function requestFromSameOrigin(req) {
  try {
    const origin = req.headers?.origin || req.headers?.referer;
    if (!origin) return true;
    if (origin === 'null') return false; // sandbox iframe 拒绝
    const host = req.headers?.host;
    if (!host) return false;
    const u = new URL(origin);
    return u.host === host;
  } catch { return false; }
}
function isJsonContentType(req) {
  const ct = String(req.headers?.['content-type'] || '').toLowerCase();
  return ct === 'application/json' || ct.startsWith('application/json;');
}
/** 统一路由守卫：同源 + JSON Content-Type + 可选 sessionId 白名单。通过返回 true。 */
function guard(req, res, needSessionId, sessionId) {
  if (!requestFromSameOrigin(req)) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return false; }
  if (!isJsonContentType(req)) { sendJson(res, 415, { ok: false, error: 'unsupported-media-type' }); return false; }
  if (needSessionId && !validSessionId(sessionId)) { sendJson(res, 400, { ok: false, error: 'invalid-session-id' }); return false; }
  return true;
}

// ---------- 插件自更新（精简版：检测 + 手动更新；自动检测默认关） ----------
async function readOwnVersion() {
  try {
    const here = fileURLToPath(import.meta.url);
    const pkgPath = join(dirname(here), '..', 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch (e) { return '0.0.0'; }
}
/** v2.4.0: 读取 dsh 宿主自身版本（从进程入口向上逐级找 @deepseek-ai/dsh 的 package.json）。 */
async function readDshVersion() {
  const candidates = [];
  // 路径1：进程入口向上逐级找
  try {
    let dir = path.dirname(process.argv[1] || "");
    for (let i = 0; i < 6; i++) { candidates.push(join(dir, "package.json")); const up = path.dirname(dir); if (up === dir) break; dir = up; }
  } catch (e) { /* ignore */ }
  // 路径2：Windows npm 全局前缀兜底（rc.1 实测 argv 上探失败时）
  try { const gp = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai", "dsh", "package.json") : null; if (gp) candidates.push(gp); } catch (e) { /* ignore */ }
  for (const c of candidates) {
    try {
      const p = JSON.parse(await readFile(c, "utf8"));
      if (p.name === "@deepseek-ai/dsh" && typeof p.version === "string") return p.version;
    } catch (e) { /* 下一个候选 */ }
  }
  return null;
}

async function fetchLatestVersion() {
  try {
    const resp = await fetch('https://registry.npmjs.org/dsh-easyrewrite/latest', {
      headers: { 'user-agent': 'dsh-easyrewrite-update-check', accept: 'application/json' }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data.version === 'string' ? data.version : null;
  } catch (e) { return null; }
}
/** 定位安装本插件的运行目录（遍历 $DSH_HOME/profiles 下各目录的 package.json）。 */
async function findPluginHomeDir() {
  try {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh');
    const profilesRoot = join(home, 'profiles');
    const entries = await readdirSafe(profilesRoot);
    for (const name of entries) {
      const pkgPath = join(profilesRoot, name, 'package.json');
      try {
        const raw = await readFile(pkgPath, 'utf8');
        if (raw.includes('dsh-easyrewrite')) return join(profilesRoot, name);
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* ignore */ }
  return null;
}
async function readdirSafe(dir) {
  try { return await readdir(dir); } catch (e) { return []; }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/** 目标事件之前最近的 turn/end seq；无则 -1。 */
function findTurnEndBefore(events, targetIdx) {
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (events[i].type === 'turn/end') return events[i].seq;
  }
  return -1;
}

/**
 * 撤回边界解析：返回目标消息之前最后闭合回合（turn/end）的事件 seq。
 * fork 由 client 端官方 RPC（ctx.sessions.fork）执行——child 才能进入会话列表。
 * 无闭合回合（未结束回合内）→ turn-open。
 */
function resolveBoundary(ctx, sessionId, targetSeq) {
  const session = ctx.sessions.get(sessionId);
  if (!session) return { code: 'session-not-found', status: 404 };
  // v2.4.0: dsh 0.1.2 起 Session.events 移除，改用 snapshotEvents(fromSeq, toSeqExclusive)；
  // rc.2 旧宿主仍走 session.events。事件对象两代同构（seq/type 字段）。
  let events;
  if (typeof session.snapshotEvents === "function") {
    try { events = session.snapshotEvents(); } catch (e) { return { code: 'internal', status: 500, message: String(e?.message ?? e) }; }
  } else {
    events = session.events;
  }
  if (!Array.isArray(events)) return { code: 'internal', status: 500, message: 'events unavailable' };
  const targetIdx = events.findIndex((e) => e.seq === targetSeq);
  if (targetIdx === -1) {
    return { code: 'invalid-target', status: 404, message: JSON.stringify({ targetSeq, eventsLen: events.length }) };
  }
  const boundary = findTurnEndBefore(events, targetIdx);
  if (boundary === -1) {
    // review M10：先判定目标之后是否有 turn/end（回合是否已闭合）——
    // 已闭合但无前置边界（如首回合消息）→ no-boundary（诊断准确，不是 turn-open）
    let hasLaterClose = false;
    for (let i = targetIdx + 1; i < events.length; i++) {
      if (events[i].type === 'turn/end') { hasLaterClose = true; break; }
    }
    if (hasLaterClose) {
      return { code: 'no-boundary', status: 409, message: '该消息之前没有可截断的闭合回合边界（首条消息或跨回合场景）' };
    }
    return { code: 'turn-open', status: 409, message: '该消息所在回合尚未结束，无法截断；请等待回复完成（回合结束）后再撤回' };
  }
  return { boundary };
}

/**
 * 物理拔除 fork 继承的幽灵队列项（Host 端直接操作 Agent.inbox）。
 * DSH sessions.fork 会贪婪切入 boundary 到下一个 turn/start 之间的所有非回合事件，
 * 导致旧消息的 agent/inbox/spliced 入队事件被子会话继承，而配对出队事件被截断，
 * 在 Host 端 Agent.inbox.nextTurn 留下悬空旧消息。
 * 此函数直接调用官方 agent.inbox.remove / clear 将其彻底移除并落盘 canceled 状态。
 */
function cleanGhostInbox(ctx, sessionId) {
  let cleared = 0;
  const removedIds = [];
  try {
    const agentsSvc = ctx?.agents || (typeof ctx?.get === 'function' ? ctx.get('agents') : null);
    const agent = agentsSvc?.get ? agentsSvc.get(sessionId) : null;
    if (agent && agent.inbox) {
      const nextTurnItems = Array.isArray(agent.inbox.nextTurn) ? [...agent.inbox.nextTurn] : [];
      const nextStepItems = Array.isArray(agent.inbox.nextStep) ? [...agent.inbox.nextStep] : [];
      const allPending = [...nextTurnItems, ...nextStepItems];

      for (const item of allPending) {
        if (item && item.id) {
          try {
            const ok = typeof agent.inbox.remove === 'function' ? agent.inbox.remove(item.id) : false;
            if (ok) {
              cleared++;
              removedIds.push(item.id);
            }
          } catch (eRem) {
            writeLog('warn', 'clean-ghost', '移除单个幽灵消息失败', { id: item.id, err: String(eRem?.message ?? eRem) });
          }
        }
      }

      // 若仍有未清除的 pending，执行 clear() 终极清空
      if (agent.inbox.hasPending && typeof agent.inbox.clear === 'function') {
        try {
          agent.inbox.clear();
          cleared++;
        } catch (eClr) {
          writeLog('warn', 'clean-ghost', 'inbox.clear 异常', { err: String(eClr?.message ?? eClr) });
        }
      }
    }
  } catch (eAll) {
    writeLog('warn', 'clean-ghost', 'cleanGhostInbox 执行异常', { sessionId, err: String(eAll?.message ?? eAll) });
  }
  return { cleared, removedIds };
}

/** 仅测试用：暴露内部纯函数（不参与运行时行为）。 */
export const __test = { findTurnEndBefore, resolveBoundary, cleanGhostInbox, writeLog, flushLogBuffer, getLogBuffer: () => logBuffer };

export function apply(ctx) {
  writeLog('info', 'host', 'apply: 路由注册开始');
  try {
    if (ctx.settings && typeof ctx.settings.register === 'function') {
      const dummySchema = (x) => x ?? {};
      dummySchema.toJSON = () => ({ type: 'object' });
      ctx.settings.register(settingsNamespace('dsh-easyrewrite'), dummySchema);
      writeLog('info', 'host', 'settings namespace 已注册（插件配置卡片可用）');
    }
  } catch (err) {
    writeLog('warn', 'host', 'settings namespace 注册失败（不影响核心功能）', { err: String(err?.message ?? err) });
  }
  const disposers = [];
  // client 日志上报路由（统一甄别，落盘 $DSH_HOME/dsh-easyrewrite.log）
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/log',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        if (!guard(req, res, false)) return;
        const body = await readJsonBody(req, 256 * 1024);
        await writeLog(
          typeof body.level === 'string' ? body.level : 'info',
          typeof body.tag === 'string' ? body.tag : 'client',
          typeof body.message === 'string' ? body.message : '',
          body.data
        );
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 草稿自动备份（覆盖式）：写 $DSH_HOME/dsh-easyrewrite/backups/<sessionId>.json
  function backupPath(sessionId) {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh');
    return join(home, 'dsh-easyrewrite', 'backups', sessionId + '.json');
  }
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req, 512 * 1024);
        const { sessionId, pending } = body;
        if (!guard(req, res, true, sessionId) || !pending || typeof pending !== 'object') { sendJson(res, 400, { ok: false, error: 'invalid-request' }); return; }
        const file = backupPath(sessionId);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(pending, null, 2), 'utf8'); // 覆盖式
        sendJson(res, 200, { ok: true });
      } catch (err) {
        writeLog('warn', 'backup', '备份写入失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup/read',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        try {
          const raw = await readFile(backupPath(sessionId), 'utf8');
          const pending = JSON.parse(raw);
          sendJson(res, 200, { ok: true, pending });
        } catch (e) {
          sendJson(res, 200, { ok: true, pending: null }); // 无备份
        }
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/backup/delete',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        await rm(backupPath(sessionId), { force: true });
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 版本翻页器：恢复归档会话（幂等——未归档时为 no-op）。官方无 unarchive API，
  // 通过 workspaceRegistry 实例的排队操作把 sessionId 从归档集合移除。
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/unarchive',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) { return; }
        let registry = null;
        try { registry = ctx.get('workspaceRegistry'); } catch (e) { /* service absent */ }
        if (!registry || typeof registry.enqueueOperation !== 'function' || typeof registry.requireState !== 'function' || typeof registry.setState !== 'function') {
          writeLog('warn', 'host', 'unarchive: workspaceRegistry 不可用');
          sendJson(res, 200, { ok: false, error: 'registry-unavailable' });
          return;
        }
        // review S3：存在性校验（与官方 archiveSession 的 sessionKnown 对齐）
        if (typeof registry.sessionKnown === 'function') {
          const known = await registry.sessionKnown(sessionId);
          if (!known) { sendJson(res, 404, { ok: false, error: 'session-not-found' }); return; }
        }
        const restored = await registry.enqueueOperation(async () => {
          const state = registry.requireState();
          const next = state.archivedSessionIds.filter((id) => id !== sessionId);
          if (next.length === state.archivedSessionIds.length) return false; // 未归档
          await registry.setState({ ...state, archivedSessionIds: next });
          return true;
        });
        writeLog('info', 'host', 'unarchive 完成', { sessionId, restored });
        sendJson(res, 200, { ok: true, restored });
      } catch (err) {
        writeLog('warn', 'host', 'unarchive 失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
    // 撤回路由
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/recall',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId, targetSeq } = body;
        if (!guard(req, res, true, sessionId) || typeof targetSeq !== 'number' || !Number.isFinite(targetSeq)) {
          sendJson(res, 400, { ok: false, error: 'invalid-request' });
          return;
        }
        writeLog('info', 'recall', '收到撤回边界请求', { sessionId, targetSeq });
        const result = resolveBoundary(ctx, sessionId, targetSeq);
        if (result.code) {
          writeLog('warn', 'recall', '撤回被拒绝: ' + result.code, { sessionId, targetSeq, message: result.message });
          sendJson(res, result.status, { ok: false, error: result.code, message: result.message });
          return;
        }
        // fork 由 client 官方 RPC 执行（child 才能进会话列表并可打开）
        writeLog('info', 'recall', '边界就绪', { sessionId, targetSeq, boundary: result.boundary });
        sendJson(res, 200, { ok: true, boundary: result.boundary });
      } catch (err) {
        writeLog('error', 'recall', '/bubble/recall 异常', { message: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 幽灵队列清理路由：清除由 fork 继承的悬空旧消息（Issue #10 彻底根治）
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/clean-ghost',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req);
        const { sessionId } = body;
        if (!guard(req, res, true, sessionId)) return;

        writeLog('info', 'clean-ghost', '收到幽灵队列清理请求', { sessionId });
        const result = cleanGhostInbox(ctx, sessionId);
        writeLog('info', 'clean-ghost', 'Host 端幽灵队列清理完成', { sessionId, cleared: result.cleared, removedIds: result.removedIds });
        sendJson(res, 200, { ok: true, cleared: result.cleared, removedIds: result.removedIds });
      } catch (err) {
        writeLog('error', 'clean-ghost', '/bubble/clean-ghost 异常', { message: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 插件自更新：检查 npm 最新版本（只读）
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/check-update',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        if (!guard(req, res, false)) return;
        const body = await readJsonBody(req, 16 * 1024);
        const current = await readOwnVersion();
        const latest = await fetchLatestVersion();
        const dshVersion = await readDshVersion();
        writeLog('info', 'host', 'check-update', { current, latest, dshVersion });
        sendJson(res, 200, { ok: true, current, latest, dshVersion });
      } catch (err) {
        writeLog('warn', 'host', 'check-update 失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  // 插件自更新：执行 pnpm up（写操作——client 端必须用户显式确认后调用）
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/update-plugin',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        if (!guard(req, res, false)) return;
        const body = await readJsonBody(req, 16 * 1024);
        const profileDir = await findPluginHomeDir();
        if (!profileDir) { sendJson(res, 200, { ok: false, error: 'profile-not-found' }); return; }
        writeLog('info', 'host', 'update-plugin 开始', { profileDir });
        const output = await new Promise((resolve) => {
          execFile('pnpm', ['up', 'dsh-easyrewrite'], { cwd: profileDir, timeout: 90000, windowsHide: true }, (err, stdout, stderr) => {
            resolve({ err: err ? String(err.message || err) : null, stdout: String(stdout || '').slice(-1500), stderr: String(stderr || '').slice(-1500) });
          });
        });
        const ok = !output.err || output.stdout.includes('up to date') || output.stdout.includes('Done');
        writeLog('info', 'host', 'update-plugin 结果', { ok, err: output.err, outTail: output.stdout.slice(-200) });
        sendJson(res, 200, { ok, output: output.stdout.slice(-800) });
      } catch (err) {
        writeLog('warn', 'host', 'update-plugin 失败', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));
  writeLog('info', 'host', 'apply: 路由注册完成');
  return () => {
    for (const d of disposers) { try { d(); } catch (e) { /* ignore */ } }
    writeLog('info', 'host', 'apply: 已卸载');
  };
}
