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
import { appendFile, mkdir, writeFile, rm, readFile, readdir, copyFile, rename, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zstdDecompressSync, zstdCompressSync } from 'node:zlib';
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
    let dir = dirname(process.argv[1] || "");
    for (let i = 0; i < 6; i++) { candidates.push(join(dir, "package.json")); const up = dirname(dir); if (up === dir) break; dir = up; }
  } catch (e) { /* ignore */ }
  // 路径2：$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/package.json
  try {
    const home = process.env.DSH_HOME || join(homedir(), ".dsh");
    candidates.push(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json"));
  } catch (e) { /* ignore */ }
  // 路径3：Windows npm 全局前缀兜底（rc.1 实测 argv 上探失败时）
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

// ---------- EasyRewrite 影子仓储（EasyRewrited_Sessions）核心引擎 ----------

// 异步串行互斥队列：防止并发请求同时 Read-Modify-Write workspace.json 或 vault-config.json 导致竞态覆盖
let _workspaceLockChain = Promise.resolve();
function withWorkspaceLock(fn) {
  const next = _workspaceLockChain.then(() => fn(), () => fn());
  _workspaceLockChain = next.catch(() => {});
  return next;
}

// 归档迁移单飞锁：防止启动期自动迁移与手动触发并发重入导致双倍内存与磁盘 IO
let _migrationInFlight = null;

// 切断 V8 SlicedString 对大体积母字符串的底层引用，防止从大 JSONL 中提取短字段（如 title/id）后整块母串无法 GC
function flattenStr(str) {
  if (typeof str !== 'string' || str.length === 0) return str;
  return Buffer.from(str, 'utf8').toString('utf8');
}

/**
 * 按需读取文件头部或尾部固定大小切片（杜绝为读 header/title/尾部闭合标记而将数十 MB 会话文件全量读入内存）。
 */
async function readFileSlice(filePath, maxBytes = 256 * 1024, fromTail = false) {
  let fh = null;
  try {
    fh = await open(filePath, 'r');
    const st = await fh.stat();
    const totalSize = st.size || 0;
    if (totalSize === 0) {
      return { buf: Buffer.alloc(0), truncated: false, totalSize: 0 };
    }
    if (totalSize <= maxBytes) {
      const buf = Buffer.allocUnsafe(totalSize);
      const { bytesRead } = await fh.read(buf, 0, totalSize, 0);
      return { buf: bytesRead === totalSize ? buf : buf.subarray(0, bytesRead), truncated: false, totalSize };
    }
    const buf = Buffer.allocUnsafe(maxBytes);
    const pos = fromTail ? Math.max(0, totalSize - maxBytes) : 0;
    const { bytesRead } = await fh.read(buf, 0, maxBytes, pos);
    return { buf: bytesRead === maxBytes ? buf : buf.subarray(0, bytesRead), truncated: true, totalSize };
  } finally {
    if (fh) {
      try { await fh.close(); } catch (e) {}
    }
  }
}

function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

async function readVaultConfig() {
  try {
    const cfgPath = join(resolveDshHome(), 'dsh-easyrewrite', 'vault-config.json');
    const raw = await readFile(cfgPath, 'utf8');
    const data = JSON.parse(raw);
    return {
      storageMode: data.storageMode === 'workspace' ? 'workspace' : 'global',
      archivedMigrated: data.archivedMigrated === true,
      migratedAt: typeof data.migratedAt === 'number' ? data.migratedAt : null,
      lastMigrationStats: (data.lastMigrationStats && typeof data.lastMigrationStats === 'object') ? data.lastMigrationStats : null
    };
  } catch (e) {
    return {
      storageMode: 'global',
      archivedMigrated: false,
      migratedAt: null,
      lastMigrationStats: null
    };
  }
}

async function writeVaultConfig(cfg) {
  const cfgPath = join(resolveDshHome(), 'dsh-easyrewrite', 'vault-config.json');
  const existing = await readVaultConfig();
  await mkdir(dirname(cfgPath), { recursive: true });
  const merged = { ...existing, ...(cfg || {}) };
  const data = {
    storageMode: merged.storageMode === 'workspace' ? 'workspace' : 'global',
    archivedMigrated: merged.archivedMigrated === true,
    migratedAt: typeof merged.migratedAt === 'number' ? merged.migratedAt : null,
    lastMigrationStats: (merged.lastMigrationStats && typeof merged.lastMigrationStats === 'object') ? merged.lastMigrationStats : null,
    updatedAt: Date.now()
  };
  await writeFile(cfgPath, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function resolveVaultDir(sessionId, workspaceId, storageMode) {
  const home = resolveDshHome();
  if (storageMode === 'workspace' && workspaceId) {
    return join(home, 'sessions', workspaceId, '.easyrewrite_vault', 'EasyRewrited_Sessions', sessionId);
  }
  return join(home, 'dsh-easyrewrite', 'EasyRewrited_Sessions', sessionId);
}

async function findSessionFileInDir(dir) {
  try {
    const files = await readdir(dir);
    const preferred = ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd'];
    for (const pref of preferred) {
      if (files.includes(pref)) return join(dir, pref);
    }
    const anyZstd = files.find(f => f.endsWith('.jsonl.zstd'));
    if (anyZstd) return join(dir, anyZstd);
  } catch (e) {}
  return null;
}

async function findSessionPhysical(sessionId, workspaceId = null) {
  const home = resolveDshHome();
  const sessionsRoot = join(home, 'sessions');

  if (workspaceId) {
    const candidateDir = join(sessionsRoot, workspaceId, sessionId);
    const file = await findSessionFileInDir(candidateDir);
    if (file) return { sessionDir: candidateDir, sessionFile: file, workspaceId };
  }

  try {
    const wsEntries = await readdir(sessionsRoot, { withFileTypes: true });
    for (const entry of wsEntries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const candidateDir = join(sessionsRoot, entry.name, sessionId);
        const file = await findSessionFileInDir(candidateDir);
        if (file) return { sessionDir: candidateDir, sessionFile: file, workspaceId: entry.name };
      }
    }
  } catch (e) {}

  return null;
}

async function sha256File(filePath) {
  try {
    const buf = await readFile(filePath);
    return createHash('sha256').update(buf).digest('hex');
  } catch (e) {
    return null;
  }
}

async function loadVaultManifest(vaultDir, sessionId, workspaceId) {
  const manifestPath = join(vaultDir, 'manifest.json');
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const m = JSON.parse(raw);
    if (!m.title || m.title.startsWith('session-')) {
      const derived = await resolveSessionTitle(sessionId, vaultDir);
      if (derived && !derived.startsWith('session-')) {
        m.title = derived;
        try { await writeFile(manifestPath, JSON.stringify(m, null, 2), 'utf8'); } catch (eW) {}
      }
    }
    return m;
  } catch (e) {
    const defaultTitle = await resolveSessionTitle(sessionId, vaultDir).catch(() => '未命名对话');
    return {
      version: 1,
      sessionId,
      workspaceId: workspaceId || null,
      title: defaultTitle,
      currentVersionIndex: 0,
      versions: []
    };
  }
}

/** 智能推导会话人类可读标题（优先官方 projection 缓存，次选 Zstd 会话物理/快照头部帧，兜底未命名） */
async function resolveSessionTitle(sessionId, vaultDir = null, cachedCombinedProj = undefined) {
  const home = resolveDshHome();
  const rawId = (sessionId || '').replace(/^session-/, '');
  if (!rawId) return sessionId || '未命名对话';

  // 1. 尝试官方 session_projcache 单独文件
  try {
    const projPath = join(home, 'storages', 'session_projcache', 'sessions', `${rawId}.json`);
    const content = await readFile(projPath, 'utf8');
    const data = JSON.parse(content);
    const title = data?.record?.rows?.title?.val;
    if (typeof title === 'string' && title.trim()) return flattenStr(title.trim());
  } catch (e1) {}

  // 2. 尝试官方 session_projcache.json 集合文件（支持外部批量预加载传入）
  try {
    let data = cachedCombinedProj;
    if (data === undefined) {
      const combinedPath = join(home, 'storages', 'session_projcache.json');
      const content = await readFile(combinedPath, 'utf8');
      data = JSON.parse(content);
    }
    if (data && typeof data === 'object') {
      const entry = data?.[rawId] || data?.[sessionId];
      const title = entry?.title || entry?.record?.rows?.title?.val;
      if (typeof title === 'string' && title.trim()) return flattenStr(title.trim());
    }
  } catch (e2) {}

  // 3. 从物理会话文件或 Vault 历史版本快照的头部 Zstd 帧提取真实标题（仅读文件前 192KB，杜绝大文件全量解压 OOM）
  try {
    const candidateFiles = [];
    const phys = await findSessionPhysical(sessionId);
    if (phys && phys.sessionFile) candidateFiles.push(phys.sessionFile);

    if (vaultDir) {
      try {
        const vEntries = await readdir(vaultDir);
        const zFiles = vEntries.filter(f => f.endsWith('.zstd') && f.startsWith('v'));
        zFiles.sort((a, b) => {
          const na = parseInt(a.slice(1), 10) || 0;
          const nb = parseInt(b.slice(1), 10) || 0;
          return nb - na;
        });
        for (const zf of zFiles.slice(0, 3)) {
          candidateFiles.push(join(vaultDir, zf));
        }
      } catch (eZ) {}
    }

    for (const f of candidateFiles) {
      try {
        const { buf } = await readFileSlice(f, 192 * 1024, false);
        const text = decompressZstdFrames(buf, { maxFrames: 16, maxOutputBytes: 256 * 1024 });
        let fallbackUserText = '';
        for (const line of text.trim().split('\n')) {
          if (line.includes('"session/title"')) {
            try {
              const ev = JSON.parse(line);
              if (ev?.data?.title && typeof ev.data.title === 'string' && ev.data.title.trim()) {
                return flattenStr(ev.data.title.trim());
              }
            } catch (eTitle) {}
          }
          if (!fallbackUserText && line.includes('"user/message"')) {
            try {
              const ev = JSON.parse(line);
              const cnt = ev?.data?.content;
              if (Array.isArray(cnt)) {
                for (const b of cnt) {
                  if (b.type === 'text' && b.text && !b.text.includes('<system-reminder>')) {
                    const cleanTxt = b.text.trim().slice(0, 32);
                    if (cleanTxt) fallbackUserText = flattenStr(cleanTxt);
                    break;
                  }
                }
              }
            } catch (eMsg) {}
          }
        }
        if (fallbackUserText) return fallbackUserText;
      } catch (eF) {}
    }
  } catch (e3) {}

  return '未命名对话';
}

/** 扫描并列出所有拥有 ≥2 个历史版本的 Vault 影子仓储家族（供设置面板与树状历史展示） */
async function listAllVaultFamilies(ctx) {
  const home = resolveDshHome();
  const dirsToScan = [];

  // 1. 全局 Vault 路径
  const globalRoot = join(home, 'dsh-easyrewrite', 'EasyRewrited_Sessions');
  dirsToScan.push({ root: globalRoot, storageMode: 'global', workspaceId: null });

  // 2. 扫描所有工作区私有 Vault 路径
  try {
    const sessionsRoot = join(home, 'sessions');
    const wsEntries = await readdir(sessionsRoot, { withFileTypes: true });
    for (const entry of wsEntries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const wsVaultDir = join(sessionsRoot, entry.name, '.easyrewrite_vault', 'EasyRewrited_Sessions');
        dirsToScan.push({ root: wsVaultDir, storageMode: 'workspace', workspaceId: entry.name });
      }
    }
  } catch (eWs) {}

  // 预加载一次官方 session_projcache.json（若存在），避免在多家族循环中重复读盘解析
  let combinedProjCache = null;
  try {
    const combinedPath = join(home, 'storages', 'session_projcache.json');
    const content = await readFile(combinedPath, 'utf8');
    combinedProjCache = JSON.parse(content);
  } catch (eProj) {
    combinedProjCache = null;
  }

  const rawFamilies = [];
  const clonedFromSet = new Set();
  const seenSessions = new Set();

  for (const { root, storageMode, workspaceId } of dirsToScan) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sid = ent.name;
        if (seenSessions.has(sid)) continue;

        const entryVaultDir = join(root, sid);
        const manifestPath = join(entryVaultDir, 'manifest.json');
        try {
          const mRaw = await readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(mRaw);
          if (manifest && Array.isArray(manifest.versions) && manifest.versions.length >= 2) {
            seenSessions.add(sid);
            if (manifest.clonedFrom) clonedFromSet.add(manifest.clonedFrom);

            let title = manifest.title || '';
            if (!title || title.startsWith('session-')) {
              title = await resolveSessionTitle(sid, entryVaultDir, combinedProjCache);
              if (title && !title.startsWith('session-')) {
                manifest.title = title;
                try { await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8'); } catch (eW) {}
              }
            }

            let latestTime = 0;
            manifest.versions.forEach(v => {
              const t = v.updatedAt || v.createdAt || 0;
              if (t > latestTime) latestTime = t;
            });

            rawFamilies.push({
              rootId: sid,
              sessionId: sid,
              clonedFrom: manifest.clonedFrom || null,
              workspaceId: manifest.workspaceId || workspaceId || null,
              title: (title && !title.startsWith('session-')) ? title : '未命名对话',
              updatedAt: latestTime,
              currentVersionIndex: typeof manifest.currentVersionIndex === 'number' ? manifest.currentVersionIndex : (manifest.versions.length - 1),
              isVault: true,
              storageMode: storageMode,
              versions: manifest.versions.map((v, idx) => ({
                versionNumber: v.versionNumber || (idx + 1),
                createdAt: v.createdAt || v.updatedAt || 0,
                summary: v.summary || `版本 ${v.versionNumber || (idx + 1)}`,
                isCurrent: idx === manifest.currentVersionIndex
              }))
            });
          }
        } catch (eM) {}
      }
    } catch (eDir) {}
  }

  // 核心去重：过滤已被后代继承的中间快照节点，只保留最新最完整的家族代表
  const families = rawFamilies.filter(f => !clonedFromSet.has(f.sessionId));

  families.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return families;
}

async function saveVaultSnapshotInternal(sessionId, workspaceId, summary, storageModeOverride = null, sourceFilePath = null, options = null) {
  let sourceFile = sourceFilePath;
  let effectiveWsId = workspaceId;

  if (!sourceFile) {
    const phys = await findSessionPhysical(sessionId, workspaceId);
    if (!phys || !phys.sessionFile) {
      return { ok: false, error: 'physical-session-not-found' };
    }
    sourceFile = phys.sessionFile;
    effectiveWsId = phys.workspaceId || workspaceId;
  }

  const cfg = await readVaultConfig();
  const mode = storageModeOverride || cfg.storageMode;
  const vaultDir = resolveVaultDir(sessionId, effectiveWsId, mode);
  await mkdir(vaultDir, { recursive: true });

  const manifest = await loadVaultManifest(vaultDir, sessionId, effectiveWsId);
  const currentHash = (options && typeof options.knownSha256 === 'string' && options.knownSha256)
    ? options.knownSha256
    : await sha256File(sourceFile);
  const origName = sourceFile.split(/[/\\]/).pop() || 'session.v4.jsonl.zstd';
  const sourceSid = (options && options.sourceSessionId) ? options.sourceSessionId : sessionId;
  const replaceIfSameSource = !!(options && options.replaceIfSameSource);

  const lastVer = manifest.versions[manifest.versions.length - 1];
  if (lastVer && (lastVer.sha256 === currentHash || lastVer.restoredSha256 === currentHash)) {
    lastVer.updatedAt = Date.now();
    if (!lastVer.sourceSessionId) lastVer.sourceSessionId = sourceSid;
    if (summary) lastVer.summary = summary;
    manifest.currentVersionIndex = manifest.versions.length - 1;
    await writeFile(join(vaultDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { ok: true, manifest, unchanged: true, versionNumber: lastVer.versionNumber };
  }

  // 若当前处于最新版本且该版本即由本会话自身产生（例如刚完成回答落盘或同会话继续追问），原位更新当前版本快照而不膨胀版本号
  if (
    replaceIfSameSource &&
    lastVer &&
    lastVer.sourceSessionId === sourceSid &&
    manifest.currentVersionIndex === manifest.versions.length - 1
  ) {
    const snapshotPath = join(vaultDir, lastVer.filename);
    await copyFile(sourceFile, snapshotPath);
    lastVer.sha256 = currentHash;
    delete lastVer.restoredSha256;
    lastVer.updatedAt = Date.now();
    if (summary) lastVer.summary = summary;
    await writeFile(join(vaultDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    writeLog('info', 'vault', '已原位同步当前会话最新版本快照', { sessionId, versionNumber: lastVer.versionNumber, filename: lastVer.filename });
    return { ok: true, manifest, versionNumber: lastVer.versionNumber, updatedInPlace: true };
  }

  const newVerNum = manifest.versions.length + 1;
  const snapshotFileName = `v${newVerNum}.zstd`;
  const snapshotPath = join(vaultDir, snapshotFileName);

  await copyFile(sourceFile, snapshotPath);

  const verItem = {
    versionNumber: newVerNum,
    filename: snapshotFileName,
    originalFilename: origName,
    sha256: currentHash,
    sourceSessionId: sourceSid,
    createdAt: Date.now(),
    summary: summary || `版本 ${newVerNum}`
  };

  manifest.versions.push(verItem);
  manifest.currentVersionIndex = manifest.versions.length - 1;
  await writeFile(join(vaultDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  writeLog('info', 'vault', '已保存版本快照', { sessionId, versionNumber: newVerNum, snapshotFileName });
  return { ok: true, manifest, versionNumber: newVerNum, newSnapshot: true };
}

// 运行时自检：Node 26+ 的 zstdDecompressSync 原生支持一次性解压全部拼接帧，而 Node 22/24 仅解压第 1 帧。
const _ZSTD_NATIVE_MULTI_FRAME = (() => {
  try {
    const f1 = zstdCompressSync(Buffer.from('A'));
    const f2 = zstdCompressSync(Buffer.from('B'));
    return zstdDecompressSync(Buffer.concat([f1, f2])).toString('utf8') === 'AB';
  } catch (e) {
    return false;
  }
})();

/**
 * 解压多帧拼接的 Zstd 数据流（Concatenated Zstd Frames，魔数 0x28 0xB5 0x2F 0xFD）。
 * - 在 Node 26+ 且无帧数/字节限额时，优先走单次 zstdDecompressSync(buf) 原生连续解码（O(N) 极速，杜绝后缀重复解压 OOM）；
 * - 在 Node 22/24、局部切片扫描或存在损坏帧回退时，按相邻帧魔数边界 [start, end) 精确切分单帧并 Buffer.concat 合并，
 *   保证每帧严格只解压 1 次且跨帧 UTF-8 多字节字符完整无损。
 * - 支持 options.maxFrames 与 options.maxOutputBytes 预算控制，供头部/尾部元数据快速扫描按需提前终止。
 */
function decompressZstdFrames(buf, options = null) {
  if (!buf || buf.length === 0) return '';
  const maxFrames = (options && typeof options.maxFrames === 'number' && options.maxFrames > 0) ? options.maxFrames : Infinity;
  const maxOutputBytes = (options && typeof options.maxOutputBytes === 'number' && options.maxOutputBytes > 0) ? options.maxOutputBytes : Infinity;
  const hasBudgetLimit = maxFrames !== Infinity || maxOutputBytes !== Infinity;
  const hasZstdMagicAt0 = buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xB5 && buf[2] === 0x2F && buf[3] === 0xFD;

  if (_ZSTD_NATIVE_MULTI_FRAME && hasZstdMagicAt0 && !hasBudgetLimit) {
    try {
      return zstdDecompressSync(buf).toString('utf8');
    } catch (e) {
      // 存在损坏帧或截断尾部时回退至下方的按帧边界容错解码
    }
  }

  const offsets = [];
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xB5 && buf[i + 2] === 0x2F && buf[i + 3] === 0xFD) {
      offsets.push(i);
    }
  }

  if (offsets.length === 0) {
    const slice = buf.length > maxOutputBytes ? buf.subarray(0, maxOutputBytes) : buf;
    return slice.toString('utf8');
  }

  if (offsets.length === 1 && offsets[0] === 0) {
    try {
      const dec = zstdDecompressSync(buf);
      return (dec.length > maxOutputBytes ? dec.subarray(0, maxOutputBytes) : dec).toString('utf8');
    } catch (e) {
      return buf.toString('utf8');
    }
  }

  const chunks = [];
  let totalOutBytes = 0;
  let k = 0;
  while (k < offsets.length && chunks.length < maxFrames && totalOutBytes < maxOutputBytes) {
    const start = offsets[k];
    let decoded = false;
    for (let nextIdx = k + 1; nextIdx <= offsets.length; nextIdx++) {
      const end = nextIdx < offsets.length ? offsets[nextIdx] : buf.length;
      try {
        const dec = zstdDecompressSync(buf.subarray(start, end));
        chunks.push(dec);
        totalOutBytes += dec.length;
        k = nextIdx;
        decoded = true;
        break;
      } catch (e) {
        // 若 offsets[nextIdx] 是压缩数据内部巧合的伪魔数（2^-32 概率），继续向后扩展到下一个真实帧边界
      }
    }
    if (!decoded) {
      k++;
    }
  }

  if (chunks.length > 0) {
    return Buffer.concat(chunks).toString('utf8');
  }

  try {
    return zstdDecompressSync(buf).toString('utf8');
  } catch (e) {
    return buf.toString('utf8');
  }
}

/**
 * 扫描并解析会话持久化文件的谱系与摘要元信息（支持多帧 Zstd 与测试明文）。
 * 采用局部头部读取（默认最多读取文件前 256KB、最多解压前 24 帧 / 512KB），
 * 彻底杜绝在归档迁移时全量读取与解压数十 MB 的长任务会话文件导致 OOM。
 */
async function scanZstdSessionFile(filePath, options = null) {
  const maxReadBytes = (options && typeof options.maxReadBytes === 'number') ? options.maxReadBytes : 256 * 1024;
  const maxFrames = (options && typeof options.maxFrames === 'number') ? options.maxFrames : 24;
  const maxOutputBytes = (options && typeof options.maxOutputBytes === 'number') ? options.maxOutputBytes : 512 * 1024;

  const { buf, truncated } = await readFileSlice(filePath, maxReadBytes, false);
  const text = decompressZstdFrames(buf, { maxFrames, maxOutputBytes });
  const rawLines = text.trim().split('\n').filter(Boolean);
  let header = {};
  let parentSession = null;
  let origin = null;
  let cwd = null;
  let title = '';
  let turnStartCount = 0;
  let hasConversationContent = false;

  if (rawLines.length > 0) {
    try {
      const parsedHeader = JSON.parse(rawLines[0]) || {};
      parentSession = flattenStr(parsedHeader.parentSession || parsedHeader.data?.parentSession || null);
      origin = flattenStr(parsedHeader.origin || null);
      cwd = flattenStr(parsedHeader.cwd || null);
      header = {
        id: flattenStr(parsedHeader.id || null),
        parentSession,
        origin,
        cwd,
        createdAt: typeof parsedHeader.createdAt === 'number' ? parsedHeader.createdAt : 0
      };
    } catch (e) {}
  }

  for (const l of rawLines) {
    if (l.includes('"turn/start"')) turnStartCount++;
    if (
      !hasConversationContent &&
      (l.includes('"user/message"') ||
        l.includes('"assistant/message"') ||
        l.includes('"turn/start"') ||
        l.includes('"role":"user"') ||
        l.includes('"role":"assistant"'))
    ) {
      hasConversationContent = true;
    }
    if (l.includes('"session/title"')) {
      try {
        const ev = JSON.parse(l);
        if (ev?.data?.title && typeof ev.data.title === 'string') {
          title = flattenStr(ev.data.title);
        }
      } catch (e) {}
    }
  }

  // 若文件超过 256KB 被头部截断，其必然是包含大量内容的完整长会话，绝不可被误判为空壳会话
  if (truncated) {
    hasConversationContent = true;
  }
  const effectiveLineCount = truncated ? Math.max(rawLines.length, 10) : rawLines.length;
  const retainedLines = (options && options.includeLines) ? rawLines : rawLines.slice(0, 8).map(flattenStr);

  return {
    lineCount: effectiveLineCount,
    lines: retainedLines,
    header,
    parentSession,
    origin,
    cwd,
    title,
    turnStartCount,
    hasConversationContent
  };
}

/**
 * 轻量检测会话文件最后一个回合是否已闭合（turn/end 晚于最后一个 turn/start）。
 * 仅读取文件尾部最多 128KB 切片并解压尾部完整帧，杜绝在 /bubble/vault/list 中全量读取解压大文件。
 */
async function isLastTurnClosedInZstdFile(filePath) {
  try {
    const { buf } = await readFileSlice(filePath, 128 * 1024, true);
    const text = decompressZstdFrames(buf, { maxFrames: 32, maxOutputBytes: 256 * 1024 });
    const lastStart = text.lastIndexOf('"turn/start"');
    const lastEnd = text.lastIndexOf('"turn/end"');
    return lastStart === -1 || lastEnd > lastStart;
  } catch (e) {
    return true;
  }
}

/**
 * 当将跨会话的历史快照覆盖到目标 sessionId 的磁盘文件时：
 * 1. 确保第 1 帧（Frame 0）严格且仅包含 1 行 Header，且 header.id 改为 targetSessionId；
 * 2. 确保后续帧（Frame 1+）中所有 session-log-deepseek/delivery-accepted 事件的 data.sessionId 同步改写为 targetSessionId；
 * 3. 严格符合 DSH 物理结构：Frame 0 独立且末尾只有 1 个换行符，事件位于后续独立 Frame 1。
 * 彻底杜绝：
 * - "first frame is not exactly one header line"
 * - "current-generation delivery marker names the wrong Session"
 */
function rewriteZstdHeaderId(buf, targetSessionId) {
  if (!buf || buf.length === 0 || !targetSessionId) return buf;

  const fullText = decompressZstdFrames(buf);
  const lines = fullText.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return buf;

  let headerObj = null;
  try {
    headerObj = JSON.parse(lines[0]);
  } catch (e) {
    return buf;
  }
  if (!headerObj || typeof headerObj !== 'object') return buf;

  // 重写 Header ID
  headerObj.id = targetSessionId;
  const newHeaderLine = JSON.stringify(headerObj) + '\n';

  // 重写后续所有事件中的 delivery-accepted
  const newEventLines = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    try {
      const evObj = JSON.parse(rawLine);
      if (
        evObj &&
        typeof evObj === 'object' &&
        evObj.type === 'session-log-deepseek/delivery-accepted' &&
        evObj.data &&
        typeof evObj.data === 'object' &&
        evObj.data.sessionId
      ) {
        evObj.data.sessionId = targetSessionId;
        newEventLines.push(JSON.stringify(evObj));
        continue;
      }
    } catch (e) {}
    newEventLines.push(rawLine);
  }

  // 判断是否为 Zstandard 压缩输入（魔数 0x28 0xB5 0x2F 0xFD）
  const isZstd = buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd;
  if (!isZstd) {
    const allPlain = newHeaderLine + (newEventLines.length > 0 ? newEventLines.join('\n') + '\n' : '');
    return Buffer.from(allPlain, 'utf8');
  }

  // DSH 严格物理规范：Frame 0 必须且仅包含一行 Header
  const frame0 = zstdCompressSync(Buffer.from(newHeaderLine, 'utf8'));
  if (newEventLines.length === 0) {
    return frame0;
  }

  // Frame 1 包含所有后续事件行
  const frame1 = zstdCompressSync(Buffer.from(newEventLines.join('\n') + '\n', 'utf8'));
  return Buffer.concat([frame0, frame1]);
}

function releaseSessionHostMemory(ctx, sessionId) {
  try {
    const agents = ctx?.agents || (typeof ctx?.get === 'function' ? ctx.get('agents') : null);
    const agent = agents?.get ? agents.get(sessionId) : null;
    if (agent) {
      if (typeof agent.cancel === 'function') {
        try { agent.cancel(); } catch (e) {}
      }
      if (typeof agent.dispose === 'function') {
        try { agent.dispose(); } catch (e) {}
      } else if (typeof agent[Symbol.dispose] === 'function') {
        try { agent[Symbol.dispose](); } catch (e) {}
      }
      if (typeof agents.delete === 'function') {
        try { agents.delete(sessionId); } catch (e) {}
      } else if (typeof agents.remove === 'function') {
        try { agents.remove(sessionId); } catch (e) {}
      }
    }
  } catch (e) {}

  try {
    const sessions = ctx?.sessions || (typeof ctx?.get === 'function' ? ctx.get('sessions') : null);
    if (sessions) {
      // DSH 0.2 SessionStore: 通过 entry.detach() 触发 session/disposed，立即释放 Win32 内核命名信号量锁与文件句柄
      if (sessions.store instanceof Map) {
        const entry = sessions.store.get(sessionId);
        if (entry) {
          if (typeof entry.detach === 'function') {
            try { entry.detach(); } catch (e) {}
          } else if (typeof sessions.detachEntered === 'function') {
            try { sessions.detachEntered(entry); } catch (e) {}
          }
        }
      }
      if (typeof sessions.close === 'function') {
        try { sessions.close(sessionId); } catch (e) {}
      }
      if (typeof sessions.delete === 'function') {
        try { sessions.delete(sessionId); } catch (e) {}
      }
    }
  } catch (e) {}
}

async function restoreVaultSnapshotInternal(ctx, sessionId, workspaceId, targetVersionNumber, storageModeOverride = null) {
  const phys = await findSessionPhysical(sessionId, workspaceId);
  if (!phys || !phys.sessionFile) {
    return { ok: false, error: 'physical-session-not-found' };
  }

  const effectiveWsId = phys.workspaceId || workspaceId;
  const cfg = await readVaultConfig();
  const mode = storageModeOverride || cfg.storageMode;
  const vaultDir = resolveVaultDir(sessionId, effectiveWsId, mode);

  const manifest = await loadVaultManifest(vaultDir, sessionId, effectiveWsId);
  const targetVer = manifest.versions.find(v => v.versionNumber === targetVersionNumber);
  if (!targetVer) {
    return { ok: false, error: 'version-not-found' };
  }

  const targetSnapshotPath = join(vaultDir, targetVer.filename);
  let snapshotBuf = null;
  try {
    snapshotBuf = await readFile(targetSnapshotPath);
  } catch (e) {
    return { ok: false, error: 'snapshot-file-missing' };
  }

  // 安全保障：仅当当前活跃文件与现有所有版本快照（含 restoredSha256）均不同时，才自动追加保存最新快照
  const currentDiskHash = await sha256File(phys.sessionFile);
  const alreadyInVault = manifest.versions.some(
    v => v.sha256 === currentDiskHash || v.restoredSha256 === currentDiskHash
  );
  if (!alreadyInVault) {
    await saveVaultSnapshotInternal(sessionId, effectiveWsId, '覆盖前自动保存', mode);
  }

  // 先清理幽灵队列并释放内存 Session 与内核文件写锁，再执行磁盘原子覆盖
  cleanGhostInbox(ctx, sessionId);
  releaseSessionHostMemory(ctx, sessionId);

  const updatedManifest = await loadVaultManifest(vaultDir, sessionId, effectiveWsId);
  const targetIndex = updatedManifest.versions.findIndex(v => v.versionNumber === targetVersionNumber);

  const finalBuf = rewriteZstdHeaderId(snapshotBuf, sessionId);
  const restoredHash = createHash('sha256').update(finalBuf).digest('hex');
  const tmpFile = phys.sessionFile + '.restore.tmp';
  await writeFile(tmpFile, finalBuf);
  await rename(tmpFile, phys.sessionFile);

  if (targetIndex >= 0 && updatedManifest.versions[targetIndex]) {
    updatedManifest.versions[targetIndex].restoredSha256 = restoredHash;
  }
  updatedManifest.currentVersionIndex = targetIndex >= 0 ? targetIndex : 0;
  await writeFile(join(vaultDir, 'manifest.json'), JSON.stringify(updatedManifest, null, 2), 'utf8');

  writeLog('info', 'vault', '已原样还原版本快照并重置 Host', { sessionId, targetVersionNumber });
  return { ok: true, manifest: updatedManifest, targetVersionNumber };
}

/**
 * 将被撤回/重编辑替换的旧会话安全移入影子仓储，并从工作区侧边栏及主目录物理移除，
 * 确保侧边栏只保留当前激活版本（不进归档列表，也不掉入 Ungrouped）。
 */
async function retireSessionToVaultInternal(ctx, sessionId, workspaceId = null, replacementSessionId = null) {
  const phys = await findSessionPhysical(sessionId, workspaceId);
  const effectiveWsId = phys?.workspaceId || workspaceId;

  // 1. 先保存当前被替换会话的快照
  if (phys && phys.sessionFile) {
    await saveVaultSnapshotInternal(sessionId, effectiveWsId, '撤回前版本快照', null, phys.sessionFile, {
      sourceSessionId: sessionId,
      replaceIfSameSource: true
    });
  }

  // 2. 若指定了接替的新会话 replacementSessionId，将完整版本链继承给新会话，并为新会话登记当前快照
  if (replacementSessionId && replacementSessionId !== sessionId) {
    await cloneVaultInternal(sessionId, replacementSessionId, effectiveWsId);
    const physNew = await findSessionPhysical(replacementSessionId, effectiveWsId);
    if (physNew && physNew.sessionFile) {
      await saveVaultSnapshotInternal(
        replacementSessionId,
        physNew.workspaceId || effectiveWsId,
        '最新当前版本',
        null,
        physNew.sessionFile,
        { sourceSessionId: replacementSessionId, replaceIfSameSource: true }
      );
    }
  }

  // 3. 释放旧会话在 Host 内存中的实例与 Win32 内核文件锁，并物理移除主目录下的旧会话文件夹
  cleanGhostInbox(ctx, sessionId);
  releaseSessionHostMemory(ctx, sessionId);
  try {
    if (typeof ctx?.emit === 'function') {
      ctx.emit('api-session/removed', sessionId);
    }
  } catch (eEmit) {}

  if (phys && phys.sessionDir && replacementSessionId && replacementSessionId !== sessionId) {
    try {
      await rm(phys.sessionDir, { recursive: true, force: true });
    } catch (eRm) {}
  }

  // 4. 从 workspace.json 的 tables.workspaces / workspaces 及 archivedSessionIds 中移除旧会话（原位替换为新会话，加串行互斥锁防止并发写覆盖）
  const home = resolveDshHome();
  const wsPath = join(home, 'storages', 'workspace.json');
  let removed = false;
  await withWorkspaceLock(async () => {
    try {
      const raw = await readFile(wsPath, 'utf8');
      const wsData = JSON.parse(raw);
      const workspacesMap = wsData?.tables?.workspaces || wsData?.workspaces || {};
      for (const wId of Object.keys(workspacesMap)) {
        const wsObj = workspacesMap[wId];
        if (wsObj && Array.isArray(wsObj.sessionIds)) {
          const idx = wsObj.sessionIds.indexOf(sessionId);
          if (idx >= 0) {
            if (replacementSessionId && !wsObj.sessionIds.includes(replacementSessionId)) {
              wsObj.sessionIds.splice(idx, 1, replacementSessionId);
            } else {
              wsObj.sessionIds.splice(idx, 1);
            }
            removed = true;
          }
        }
      }
      if (wsData?.global && Array.isArray(wsData.global.archivedSessionIds)) {
        const aIdx = wsData.global.archivedSessionIds.indexOf(sessionId);
        if (aIdx >= 0) {
          wsData.global.archivedSessionIds.splice(aIdx, 1);
          removed = true;
        }
      }
      if (removed) {
        await writeFile(wsPath, JSON.stringify(wsData, null, 2), 'utf8');
      }
    } catch (eWs) {
      writeLog('warn', 'vault', '从 workspace.json 移出会话异常', { err: String(eWs?.message ?? eWs) });
    }
  });

  // 5. 同步更新内存中的 workspaceRegistry（兼容 DSH 0.2.1 WorkspaceEntity 标准接口与旧版 state Mock）
  try {
    const registry = ctx?.get ? ctx.get('workspaceRegistry') : null;
    if (registry) {
      if (typeof registry.list === 'function') {
        const wsList = registry.list();
        if (Array.isArray(wsList)) {
          for (const ws of wsList) {
            if (ws && Array.isArray(ws.sessionIds) && ws.sessionIds.includes(sessionId)) {
              if (replacementSessionId && !ws.sessionIds.includes(replacementSessionId) && typeof ws.attachSession === 'function') {
                try { await ws.attachSession(replacementSessionId); } catch (eAt) {}
              }
              if (typeof ws.detachSession === 'function') {
                try { await ws.detachSession(sessionId); } catch (eDt) {}
              }
            }
          }
        }
      }
      if (typeof registry.unarchiveSession === 'function') {
        try { await registry.unarchiveSession(sessionId); } catch (eUa) {}
      }
      if (typeof registry.unpinSession === 'function') {
        try { await registry.unpinSession(sessionId); } catch (eUp) {}
      }
      if (typeof registry.enqueueOperation === 'function' && typeof registry.requireState === 'function' && typeof registry.setState === 'function') {
        await registry.enqueueOperation(async () => {
          const state = registry.requireState();
          if (!state || !Array.isArray(state.workspaces)) return;
          const nextArchived = Array.isArray(state.archivedSessionIds)
            ? state.archivedSessionIds.filter(id => id !== sessionId)
            : [];
          const nextWorkspaces = state.workspaces.map(w => {
            if (!Array.isArray(w.sessionIds) || !w.sessionIds.includes(sessionId)) return w;
            const sids = [...w.sessionIds];
            const idx = sids.indexOf(sessionId);
            if (idx >= 0) {
              if (replacementSessionId && !sids.includes(replacementSessionId)) {
                sids.splice(idx, 1, replacementSessionId);
              } else {
                sids.splice(idx, 1);
              }
            }
            return { ...w, sessionIds: sids };
          });
          await registry.setState({
            ...state,
            workspaces: nextWorkspaces,
            archivedSessionIds: nextArchived
          });
        });
      }
    }
  } catch (eReg) {}

  writeLog('info', 'vault', '已将老会话移入影子仓储并从侧边栏除名', { sessionId, replacementSessionId, removed });
  return { ok: true, removed };
}

/**
 * 用户 Fork 某个对话后，将其影子仓储（Fork 链）原样复制到新的 fork 对话中，
 * 并且两个版本链在物理磁盘上完全独立。
 */
async function cloneVaultInternal(sourceSessionId, targetSessionId, workspaceId = null, storageModeOverride = null) {
  try {
    const cfg = await readVaultConfig();
    const mode = storageModeOverride || cfg.storageMode;
    const physSource = await findSessionPhysical(sourceSessionId, workspaceId);
    const effectiveWsId = physSource?.workspaceId || workspaceId;
    const sourceVaultDir = resolveVaultDir(sourceSessionId, effectiveWsId, mode);

    let manifestRaw = null;
    try {
      manifestRaw = await readFile(join(sourceVaultDir, 'manifest.json'), 'utf8');
    } catch (e) {
      return { ok: true, cloned: false, reason: 'source-no-vault' };
    }

    const sourceManifest = JSON.parse(manifestRaw);
    if (!sourceManifest || !Array.isArray(sourceManifest.versions) || sourceManifest.versions.length === 0) {
      return { ok: true, cloned: false, reason: 'source-empty-vault' };
    }

    const targetVaultDir = resolveVaultDir(targetSessionId, effectiveWsId, mode);
    await mkdir(targetVaultDir, { recursive: true });

    // 复制所有快照文件
    const entries = await readdir(sourceVaultDir);
    for (const file of entries) {
      if (file.endsWith('.zstd')) {
        await copyFile(join(sourceVaultDir, file), join(targetVaultDir, file));
      }
    }

    // 独立生成 targetManifest
    const targetManifest = {
      ...sourceManifest,
      sessionId: targetSessionId,
      workspaceId: effectiveWsId || sourceManifest.workspaceId,
      clonedFrom: sourceSessionId,
      clonedAt: Date.now()
    };
    await writeFile(join(targetVaultDir, 'manifest.json'), JSON.stringify(targetManifest, null, 2), 'utf8');

    writeLog('info', 'vault', '成功将源会话影子仓储克隆给新 Fork 会话', {
      sourceSessionId,
      targetSessionId,
      versionCount: targetManifest.versions.length
    });
    return { ok: true, cloned: true, versionCount: targetManifest.versions.length };
  } catch (err) {
    writeLog('warn', 'vault', 'cloneVaultInternal 异常', { err: String(err?.message ?? err) });
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * 历史遗留归档智能迁移与清理引擎：
 * 1. 严格防止误判：仅识别撤回重发中间版本（带 parentSession 或 <= 2行空白废会话）；
 * 2. 确保数据不丢失：将有内容的撤回历史完整转化为影子仓储新模式；
 * 3. 严格保护用户手动归档：无 parentSession 的独立完整会话原样保留在归档列表中！
 */
async function migrateArchivedSessionsInternal(ctx, force = false) {
  if (_migrationInFlight) {
    return _migrationInFlight;
  }
  const task = (async () => {
  const home = resolveDshHome();
  const cfg = await readVaultConfig();

  if (cfg.archivedMigrated && !force) {
    return { ok: true, skipped: true, reason: 'already-migrated' };
  }

  const wsStoragePath = join(home, 'storages', 'workspace.json');
  let raw = null;
  try { raw = await readFile(wsStoragePath, 'utf8'); } catch (e) {}
  if (!raw) return { ok: true, skipped: true, reason: 'no-workspace-storage' };

  let wsData = null;
  try { wsData = JSON.parse(raw); } catch (e) { return { ok: false, error: 'invalid-workspace-json' }; }

  const archived = Array.isArray(wsData?.global?.archivedSessionIds) ? [...wsData.global.archivedSessionIds] : [];
  const workspacesMap = wsData.tables?.workspaces || wsData.workspaces || {};

  const activeSessionSet = new Set();
  const sessionOrderRank = new Map();
  let rankCounter = 0;
  for (const wId of Object.keys(workspacesMap)) {
    const wObj = workspacesMap[wId];
    if (Array.isArray(wObj?.sessionIds)) {
      wObj.sessionIds.forEach(id => {
        activeSessionSet.add(id);
        if (!sessionOrderRank.has(id)) sessionOrderRank.set(id, rankCounter++);
      });
    }
  }

  const retainedArchived = [];
  const removedSessionIds = new Set();
  let migratedCount = 0;
  let prunedEmptyCount = 0;

  // 阶段 A：处理 global.archivedSessionIds 中的显式归档会话
  for (const sid of archived) {
    const phys = await findSessionPhysical(sid);
    if (!phys || !phys.sessionFile) {
      prunedEmptyCount++;
      removedSessionIds.add(sid);
      continue;
    }

    let parentSessionId = null;
    let lineCount = 0;
    let origin = null;
    let hasConversationContent = false;

    try {
      const scan = await scanZstdSessionFile(phys.sessionFile);
      lineCount = scan.lineCount;
      parentSessionId = scan.parentSession;
      origin = scan.origin;
      hasConversationContent = Boolean(scan.hasConversationContent);
    } catch (eDec) {}

    if (origin === 'subagent') {
      continue;
    }

    // 精准识别判定：
    // 1. 若只有 1-2 行、无任何实际对话内容且不在活跃列表中 → 废弃空白归档会话，直接拔除
    // 2. 若带有 parentSession 或以 dsh-er- 开头 → 确定为 EasyRewrite 撤回中间版本，转化为影子仓储快照
    // 3. 否则（有完整内容、无 parentSession、非撤回前缀） → 严格保留为用户主动归档会话！
    if (lineCount <= 2 && !hasConversationContent && !activeSessionSet.has(sid)) {
      prunedEmptyCount++;
      removedSessionIds.add(sid);
      try { await rm(phys.sessionDir, { recursive: true, force: true }); } catch (eRm) {}
    } else if (parentSessionId || sid.startsWith('dsh-er-')) {
      const targetHostSession = (parentSessionId && activeSessionSet.has(parentSessionId)) ? parentSessionId : sid;
      await saveVaultSnapshotInternal(targetHostSession, phys.workspaceId, `历史归档转化版本 (原ID: ${sid})`, null, phys.sessionFile);
      migratedCount++;
      removedSessionIds.add(sid);
      if (targetHostSession !== sid) {
        try { await rm(phys.sessionDir, { recursive: true, force: true }); } catch (eRm) {}
      }
    } else {
      // 用户主动归档会话，必须保留！
      retainedArchived.push(sid);
    }
  }

  // 阶段 B：扫描物理会话目录中的 parentSession 派生谱系树，将残留在主列表中的历史撤回中间版本全部收归家族当前活跃会话的影子仓储
  const sessionsRoot = join(home, 'sessions');
  const wsDirs = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  for (const wd of wsDirs) {
    if (!wd.isDirectory() || wd.name.startsWith('.')) continue;
    const wsFolder = wd.name;
    const wsPath = join(sessionsRoot, wsFolder);
    const sDirs = await readdir(wsPath, { withFileTypes: true }).catch(() => []);

    const metaMap = new Map();
    let scannedCount = 0;
    for (const sd of sDirs) {
      if (!sd.isDirectory() || sd.name.startsWith('.')) continue;
      if (++scannedCount % 15 === 0) {
        await new Promise((r) => setImmediate(r));
      }
      if (removedSessionIds.has(sd.name)) continue;
      const sDirPath = join(wsPath, sd.name);
      const sFile = await findSessionFileInDir(sDirPath);
      if (!sFile) continue;
      try {
        const scan = await scanZstdSessionFile(sFile);
        if (scan.origin === 'subagent') continue;
        metaMap.set(sd.name, {
          id: sd.name,
          sessionDir: sDirPath,
          sessionFile: sFile,
          workspaceId: wsFolder,
          lineCount: scan.lineCount,
          turnStartCount: scan.turnStartCount,
          hasConversationContent: Boolean(scan.hasConversationContent),
          parentSession: scan.parentSession,
          createdAt: scan.header?.createdAt || 0,
          title: scan.title || ''
        });
      } catch (eScan) {}
    }

    // 寻根与深度计算
    function getRootAndDepth(id) {
      let cur = id;
      let depth = 0;
      const visited = new Set();
      while (metaMap.get(cur)?.parentSession && metaMap.has(metaMap.get(cur).parentSession) && !visited.has(cur)) {
        visited.add(cur);
        cur = metaMap.get(cur).parentSession;
        depth++;
      }
      return { rootId: cur, depth };
    }

    const families = new Map();
    for (const [id, info] of metaMap) {
      const { rootId, depth } = getRootAndDepth(id);
      info.rootId = rootId;
      info.depth = depth;
      if (!families.has(rootId)) families.set(rootId, []);
      families.get(rootId).push(info);
    }

    for (const [rootId, members] of families) {
      if (members.length < 2) {
        // 单节点会话：严禁清理仍在工作区侧边栏活跃列表（activeSessionSet）或保留归档中的会话！
        // 仅当其为孤儿目录、行数 <= 1 且无任何实际对话内容时才作为废空壳清理（绝不用 turnStartCount === 0 误判旧格式会话）
        const single = members[0];
        if (
          single &&
          !activeSessionSet.has(single.id) &&
          !retainedArchived.includes(single.id) &&
          single.lineCount <= 1 &&
          !single.hasConversationContent
        ) {
          prunedEmptyCount++;
          removedSessionIds.add(single.id);
          releaseSessionHostMemory(ctx, single.id);
          try { await rm(single.sessionDir, { recursive: true, force: true }); } catch (eRm) {}
        }
        continue;
      }

      // 多版本撤回家族：确定在 workspace.sessionIds 中排在最前面的唯一当前活跃会话 activeMember
      const sortedByActive = [...members].sort((a, b) => {
        const rankA = sessionOrderRank.has(a.id) ? sessionOrderRank.get(a.id) : 999999;
        const rankB = sessionOrderRank.has(b.id) ? sessionOrderRank.get(b.id) : 999999;
        if (rankA !== rankB) return rankA - rankB;
        return b.depth - a.depth;
      });
      const activeMember = sortedByActive[0];

      // 按版本演进顺序（深度升序 -> 创建时间升序）依次将家族所有版本写入 activeMember 的影子仓储
      const chronological = [...members].sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        const rankA = sessionOrderRank.has(a.id) ? sessionOrderRank.get(a.id) : -1;
        const rankB = sessionOrderRank.has(b.id) ? sessionOrderRank.get(b.id) : -1;
        // 在 sessionIds 中越靠后代表创建时间越早
        if (rankA !== rankB && rankA >= 0 && rankB >= 0) return rankB - rankA;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      for (let i = 0; i < chronological.length; i++) {
        const verMember = chronological[i];
        const label = verMember.id === activeMember.id
          ? `当前活跃版本 (版本 ${i + 1})`
          : `历史撤回版本 ${i + 1} (原ID: ${verMember.id})`;
        await saveVaultSnapshotInternal(
          activeMember.id,
          verMember.workspaceId,
          label,
          null,
          verMember.sessionFile
        );
      }

      // 将除 activeMember 以外的所有历史旧版本移出主目录与侧边栏
      for (const verMember of members) {
        if (verMember.id === activeMember.id) continue;
        removedSessionIds.add(verMember.id);
        migratedCount++;
        releaseSessionHostMemory(ctx, verMember.id);
        try {
          if (typeof ctx?.emit === 'function') ctx.emit('api-session/removed', verMember.id);
        } catch (eEmit) {}
        try {
          await rm(verMember.sessionDir, { recursive: true, force: true });
        } catch (eRm) {}
      }
    }
  }

  const finalRetainedArchived = retainedArchived.filter(id => !removedSessionIds.has(id));
  await withWorkspaceLock(async () => {
    // 重新读取最新 workspace.json 合并移除项，防止迁移扫描期间产生的新会话被旧快照覆盖
    let latestWsData = wsData;
    try {
      const freshRaw = await readFile(wsStoragePath, 'utf8');
      latestWsData = JSON.parse(freshRaw);
    } catch (eFresh) {
      latestWsData = wsData;
    }
    const latestWorkspacesMap = latestWsData.tables?.workspaces || latestWsData.workspaces || {};
    for (const wId of Object.keys(latestWorkspacesMap)) {
      const wObj = latestWorkspacesMap[wId];
      if (wObj && Array.isArray(wObj.sessionIds)) {
        wObj.sessionIds = wObj.sessionIds.filter(id => !removedSessionIds.has(id));
      }
    }
    if (latestWsData.global) {
      latestWsData.global.archivedSessionIds = finalRetainedArchived;
    }
    await writeFile(wsStoragePath, JSON.stringify(latestWsData, null, 2), 'utf8');
  });

  // 同步 workspaceRegistry 内存（兼容 DSH 0.2.1 WorkspaceEntity 标准接口与旧版 state Mock）
  try {
    const registry = ctx?.get ? ctx.get('workspaceRegistry') : null;
    if (registry) {
      if (typeof registry.list === 'function') {
        const wsList = registry.list();
        if (Array.isArray(wsList)) {
          for (const ws of wsList) {
            if (ws && Array.isArray(ws.sessionIds) && typeof ws.detachSession === 'function') {
              for (const sid of [...ws.sessionIds]) {
                if (removedSessionIds.has(sid)) {
                  try { await ws.detachSession(sid); } catch (eDt) {}
                }
              }
            }
          }
        }
      }
      if (typeof registry.unarchiveSession === 'function') {
        for (const sid of removedSessionIds) {
          try { await registry.unarchiveSession(sid); } catch (eUa) {}
        }
      }
      if (typeof registry.unpinSession === 'function') {
        for (const sid of removedSessionIds) {
          try { await registry.unpinSession(sid); } catch (eUp) {}
        }
      }
      if (typeof registry.enqueueOperation === 'function' && typeof registry.requireState === 'function' && typeof registry.setState === 'function') {
        await registry.enqueueOperation(async () => {
          const state = registry.requireState();
          if (!state || !Array.isArray(state.workspaces)) return;
          const nextWorkspaces = state.workspaces.map(w => ({
            ...w,
            sessionIds: Array.isArray(w.sessionIds) ? w.sessionIds.filter(id => !removedSessionIds.has(id)) : w.sessionIds
          }));
          await registry.setState({
            ...state,
            workspaces: nextWorkspaces,
            archivedSessionIds: finalRetainedArchived
          });
        });
      }
    }
  } catch (eReg) {}

  cfg.archivedMigrated = true;
  cfg.migratedAt = Date.now();
  cfg.lastMigrationStats = { migratedCount, prunedEmptyCount, retainedCount: finalRetainedArchived.length };
  await writeVaultConfig(cfg);

  writeLog('info', 'vault', '历史归档与版本谱系智能转化迁移完成', {
    migratedCount,
    prunedEmptyCount,
    retainedCount: finalRetainedArchived.length
  });

  return {
    ok: true,
    migratedCount,
    prunedEmptyCount,
    retainedCount: finalRetainedArchived.length
  };
  })();
  _migrationInFlight = task;
  try {
    return await task;
  } finally {
    if (_migrationInFlight === task) {
      _migrationInFlight = null;
    }
  }
}

/** 仅测试用：暴露内部纯函数（不参与运行时行为）。 */
export const __test = {
  findTurnEndBefore,
  resolveBoundary,
  cleanGhostInbox,
  writeLog,
  flushLogBuffer,
  getLogBuffer: () => logBuffer,
  readVaultConfig,
  writeVaultConfig,
  resolveVaultDir,
  findSessionPhysical,
  readFileSlice,
  decompressZstdFrames,
  scanZstdSessionFile,
  isLastTurnClosedInZstdFile,
  rewriteZstdHeaderId,
  saveVaultSnapshotInternal,
  restoreVaultSnapshotInternal,
  retireSessionToVaultInternal,
  cloneVaultInternal,
  migrateArchivedSessionsInternal,
  listAllVaultFamilies,
  resolveSessionTitle
};

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

  // 自动安全迁移：新版本首次启动自动将历史撤回归档安全转化为影子仓储新模式（确保数据不丢失）
  migrateArchivedSessionsInternal(ctx, false).catch((err) => {
    writeLog('warn', 'vault', '启动自动归档迁移异常', { err: String(err?.message ?? err) });
  });

  // 监听 session/created 事件：用户 Fork 某个对话后，影子仓储（Fork 链）原样复制且两链独立
  if (typeof ctx?.on === 'function') {
    try {
      const unsub = ctx.on('session/created', async (session) => {
        try {
          const childId = session?.id;
          if (!childId) return;
          let parentId = session.parentSession || session.header?.parentSession || null;
          if (!parentId && typeof session.snapshotEvents === 'function') {
            const evs = session.snapshotEvents(0, 1);
            if (evs && evs[0]?.parentSession) parentId = evs[0].parentSession;
          }
          if (parentId && parentId !== childId) {
            writeLog('info', 'vault', '监听到对话 Fork 创建，自动继承并克隆影子仓储', { parentId, childId });
            await cloneVaultInternal(parentId, childId);
          }
        } catch (eCreated) {
          writeLog('warn', 'vault', 'session/created 自动克隆异常', { err: String(eCreated?.message ?? eCreated) });
        }
      });
      if (typeof unsub === 'function') disposers.push(unsub);
    } catch (eOn) {}
  }
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

  // ---------- 影子仓储（EasyRewrite Vault）路由 ----------

  // 1. Vault 配置读写：/bubble/vault/config
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/config',
    handler: async (req, res) => {
      try {
        if (!guard(req, res, false)) return;
        if (req.method === 'GET' || req.method === 'POST') {
          const body = req.method === 'POST' ? await readJsonBody(req, 16 * 1024) : {};
          if (body && body.storageMode) {
            const saved = await writeVaultConfig(body);
            writeLog('info', 'vault', '更新 Vault 配置', saved);
            sendJson(res, 200, { ok: true, config: saved });
          } else {
            const current = await readVaultConfig();
            sendJson(res, 200, { ok: true, config: current });
          }
        } else {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
        }
      } catch (err) {
        writeLog('warn', 'vault', '/bubble/vault/config 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 2. 保存会话快照：/bubble/vault/save
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/save',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req, 64 * 1024);
        const { sessionId, workspaceId, summary, storageMode } = body;
        if (!guard(req, res, true, sessionId)) return;

        const result = await saveVaultSnapshotInternal(sessionId, workspaceId, summary, storageMode);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/save 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 3. 还原会话快照：/bubble/vault/restore
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/restore',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req, 64 * 1024);
        const { sessionId, workspaceId, targetVersionNumber, storageMode } = body;
        if (!guard(req, res, true, sessionId) || typeof targetVersionNumber !== 'number') {
          sendJson(res, 400, { ok: false, error: 'invalid-request' });
          return;
        }

        const result = await restoreVaultSnapshotInternal(ctx, sessionId, workspaceId, targetVersionNumber, storageMode);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/restore 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 4. 查询会话快照列表：/bubble/vault/list
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/list',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req, 64 * 1024);
        const { sessionId, workspaceId, storageMode } = body;
        if (!guard(req, res, true, sessionId)) return;

        const cfg = await readVaultConfig();
        const mode = storageMode || cfg.storageMode;
        const phys = await findSessionPhysical(sessionId, workspaceId);
        const effectiveWsId = phys?.workspaceId || workspaceId;
        const vaultDir = resolveVaultDir(sessionId, effectiveWsId, mode);
        let manifest = await loadVaultManifest(vaultDir, sessionId, effectiveWsId);

        // 若该会话已存在影子仓储历史版本（>= 1），且当前磁盘会话文件产生了尚未登记的新内容，自动将其同步为最新版本快照
        if (manifest.versions.length >= 1 && phys && phys.sessionFile) {
          let diskHash = await sha256File(phys.sessionFile);
          if (diskHash) {
            const matchedIdx = manifest.versions.findIndex(
              v => v.sha256 === diskHash || v.restoredSha256 === diskHash
            );
            if (matchedIdx === -1) {
              // 等待可能正在异步落盘的 turn/end 帧完成（最多重试 2 次，每次 100ms），仅读取尾部切片检查闭合，避免全量解压大文件
              for (let waitAttempt = 0; waitAttempt < 2; waitAttempt++) {
                const closed = await isLastTurnClosedInZstdFile(phys.sessionFile);
                if (closed) break;
                await new Promise(r => setTimeout(r, 100));
                diskHash = await sha256File(phys.sessionFile);
              }
              const saved = await saveVaultSnapshotInternal(
                sessionId,
                effectiveWsId,
                `版本 ${manifest.versions.length + 1}`,
                mode,
                phys.sessionFile,
                { sourceSessionId: sessionId, replaceIfSameSource: true, knownSha256: diskHash }
              );
              if (saved && saved.manifest) manifest = saved.manifest;
            }
          }
        }

        sendJson(res, 200, { ok: true, manifest });
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/list 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 4.1 全量查询影子仓储多版本家族列表（供设置页历史版本家族完整展现）：/bubble/vault/families
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/families',
    handler: async (req, res) => {
      try {
        if (!guard(req, res, false)) return;
        const families = await listAllVaultFamilies(ctx);
        sendJson(res, 200, { ok: true, families });
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/families 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 5. 智能迁移历史遗留归档至影子仓储（保护用户手动归档，消除侧栏污染）：/bubble/cleanup-legacy-archived
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/cleanup-legacy-archived',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        if (!guard(req, res, false)) return;

        const result = await migrateArchivedSessionsInternal(ctx, true);
        sendJson(res, 200, result);
      } catch (err) {
        writeLog('error', 'cleanup', '/bubble/cleanup-legacy-archived 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 5.1 用户 Fork 对话时原样克隆影子仓储（两链独立）：/bubble/vault/fork-clone
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/fork-clone',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req, 64 * 1024);
        const { sourceSessionId, targetSessionId, workspaceId, storageMode } = body;
        if (!guard(req, res, true, targetSessionId)) return;

        const result = await cloneVaultInternal(sourceSessionId, targetSessionId, workspaceId, storageMode);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/fork-clone 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 6. 安全移出会话（存入影子仓储，且绝不进入 archivedSessionIds 污染侧栏）：/bubble/vault/retire-session
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/vault/retire-session',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
        const body = await readJsonBody(req, 64 * 1024);
        const { sessionId, replacementSessionId } = body;
        const workspaceId = body.workspaceId;
        if (!guard(req, res, true, sessionId)) return;

        const result = await retireSessionToVaultInternal(ctx, sessionId, workspaceId, replacementSessionId || null);
        sendJson(res, 200, result);
      } catch (err) {
        writeLog('error', 'vault', '/bubble/vault/retire-session 异常', { err: String(err?.message ?? err) });
        sendJson(res, 500, { ok: false, error: 'internal' });
      }
    }
  }));

  // 7. 读取本地附件原始二进制内容（弥补官方 session.readAttachment 仅支持 image 块、不支持普通文档 file 块的限制）：/bubble/attachment/raw
  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/bubble/attachment/raw',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST' && req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
          return;
        }
        let attachmentId = '';
        let name = '';
        if (req.method === 'POST') {
          if (!guard(req, res, false)) return;
          const body = await readJsonBody(req, 64 * 1024);
          attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId : '';
          name = typeof body?.name === 'string' ? body.name : '';
        } else {
          const u = new URL(req.url || '/', 'http://127.0.0.1');
          attachmentId = u.searchParams.get('attachmentId') || '';
          name = u.searchParams.get('name') || '';
        }

        const m = /^sha256:([0-9a-f]{64})$/i.exec(attachmentId.trim());
        if (!m) {
          sendJson(res, 400, { ok: false, error: 'invalid-attachment-id' });
          return;
        }
        const hash = m[1].toLowerCase();
        const prefix = hash.slice(0, 2);
        const safeName = name.trim().replace(/[\\/]/g, '_');
        const attRoot = join(resolveDshHome(), 'attachments', 'v1');
        const candidates = [];

        try {
          const attSvc = ctx?.attachments || (typeof ctx?.get === 'function' ? ctx.get('attachments') : null);
          if (attSvc) {
            if (safeName && typeof attSvc.fileHostPath === 'function') {
              const p1 = attSvc.fileHostPath({ attachmentId: `sha256:${hash}`, name: safeName });
              if (typeof p1 === 'string' && p1) candidates.push(p1);
            }
            if (typeof attSvc.imageHostPath === 'function') {
              const p2 = attSvc.imageHostPath({ attachmentId: `sha256:${hash}` });
              if (typeof p2 === 'string' && p2) candidates.push(p2);
            }
          }
        } catch (eSvc) { /* ignore */ }

        if (safeName) {
          candidates.push(join(attRoot, 'files', prefix, hash, safeName));
        }
        const hashFilesDir = join(attRoot, 'files', prefix, hash);
        const dirEntries = await readdirSafe(hashFilesDir);
        for (const entryName of dirEntries) {
          candidates.push(join(hashFilesDir, entryName));
        }
        candidates.push(join(attRoot, 'file-objects', prefix, hash));
        candidates.push(join(attRoot, 'objects', prefix, hash));

        let fileBuf = null;
        for (const cand of candidates) {
          try {
            fileBuf = await readFile(cand);
            if (fileBuf) break;
          } catch (eRead) { /* try next */ }
        }

        if (!fileBuf) {
          writeLog('warn', 'attach', '/bubble/attachment/raw 未找到物理附件', { attachmentId, name });
          sendJson(res, 404, { ok: false, error: 'attachment-not-found' });
          return;
        }

        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': fileBuf.length,
          'cache-control': 'private, max-age=3600'
        });
        res.end(fileBuf);
      } catch (err) {
        writeLog('error', 'attach', '/bubble/attachment/raw 异常', { err: String(err?.message ?? err) });
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
