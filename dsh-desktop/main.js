'use strict';

// DSH Desktop — Electron shell around the DeepSeek Harness browser UI.
//
// What it does:
//   1. Boots the bundled dsh CLI ("dsh web") with a standalone Node runtime.
//   2. Waits until the web UI answers HTTP on 127.0.0.1:<free-port>.
//   3. Shows it in a native window; quits the server when the app exits.
//   4. Checks for official @deepseek-ai/dsh releases and, with the user's
//      consent, self-updates the agent (see updater.js).
//
// The dsh CLI is spawned with the bundled node.exe (vendor/node/node.exe in
// dev, resources/node/node.exe when packaged) so that prebuilt native
// modules (sharp, node-pty, koffi, ...) match the Node ABI they were
// installed for. We deliberately never rebuild them against Electron.

const { app, BrowserWindow, Menu, Tray, shell, dialog, Notification, ipcMain, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');

const updater = require('./updater');
const clientUpdater = require('./client-updater');
const balance = require('./balance');
const wslBackend = require('./wsl-backend');
const { SessionWatcher, scanZstdFrames } = require('./session-watcher');
const zlib = require('node:zlib');

// ---------------------------------------------------------------------------
// H2/H3 路径围栏：文件还原/打开只允许「会话 cwd」之下的项目文件。
// 任意绝对路径（如写入 Startup\*.bat）一律拒绝；缓存 5 分钟。
// ---------------------------------------------------------------------------
const DANGEROUS_EXT = /\.(bat|cmd|com|exe|ps1|vbs|lnk|js|jse|msi|scr|pif|reg)$/i;
const fileRootsCache = { at: 0, roots: [] };

function fileRoots() {
  if (Date.now() - fileRootsCache.at < 5 * 60 * 1000) return fileRootsCache.roots;
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const roots = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== 'session.jsonl.zstd') continue;
      try {
        const buf = fs.readFileSync(p);
        const { frames } = scanZstdFrames(buf);
        if (frames.length === 0) continue;
        const text = zlib.zstdDecompressSync(buf.subarray(frames[0].start, frames[0].end)).toString('utf8');
        const header = JSON.parse(text.split('\n', 1)[0]);
        if (header && typeof header.cwd === 'string' && header.cwd) roots.push(header.cwd);
      } catch { /* 跳过损坏日志 */ }
    }
  };
  walk(path.join(dshHome, 'sessions'));
  fileRootsCache.roots = [...new Set(roots)];
  fileRootsCache.at = Date.now();
  return fileRootsCache.roots;
}

function isUnderFileRoots(p) {
  const resolved = path.resolve(p);
  return fileRoots().some((r) => {
    const rp = path.resolve(r);
    return resolved === rp || resolved.startsWith(rp + path.sep);
  });
}

const IS_WIN = process.platform === 'win32';
const APP_VERSION = app.getVersion();
const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow = null;
let serverProc = null;
let webUrl = null;
let quitting = false;
let updateBusy = false;
let notifyOnTurnEnd = true;
let currentSessionId = ''; // 主窗当前正在观看的会话（渲染进程上报），现仅用于完成通知的调试日志
let sessionWatcher = null;
let userDataDir = '';
let logsDir = '';
let dshHome = '';
let desktopLog = null;
let tray = null;
let forceQuit = false;
let clientUpdateBusy = false;
let balanceCache = null;
let balanceTimer = null;
let restartingServer = false;
let trayRecoveryTimer = null;
let backendMode = 'local'; // local | wsl（WSL 托管后端见 wsl-backend.js）

// ---------------------------------------------------------------------------
// 会话浮窗（分屏）：把会话弹出到独立窗口
// ---------------------------------------------------------------------------
const FLOAT_MAX = 8; // 浮窗总数上限，防资源滥用
const floatWindows = new Set(); // BrowserWindow 集合
const floatBySession = new Map(); // sessionId -> BrowserWindow（同一会话只允许一个浮窗）
let sponsorWindow = null; // 「请作者喝咖啡」独立小窗（单例）

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  try { if (desktopLog) desktopLog.write(line); } catch {}
  if (process.env.DSH_DESKTOP_DEBUG) process.stdout.write(line);
}

// ---------------------------------------------------------------------------
// 运行状态标记 + 看门狗（防“进程/托盘凭空消失且无任何提醒”）
// ---------------------------------------------------------------------------

function runStatePath() {
  return path.join(userDataDir, 'run-state.json');
}

function writeRunState(extra = {}) {
  try {
    fs.writeFileSync(runStatePath(), JSON.stringify({
      pid: process.pid,
      exe: process.execPath,
      cleanExit: false,
      startedAt: new Date().toISOString(),
      version: APP_VERSION,
      ...extra,
    }));
  } catch (err) {
    log('watchdog', '写运行状态失败: ' + err.message);
  }
}

function markCleanExit() {
  try {
    const p = runStatePath();
    let state = {};
    try { state = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    state.cleanExit = true;
    state.endedAt = new Date().toISOString();
    fs.writeFileSync(p, JSON.stringify(state));
  } catch (err) {
    log('watchdog', '写退出标记失败: ' + err.message);
  }
}

function detectUncleanPreviousRun() {
  try {
    const prev = JSON.parse(fs.readFileSync(runStatePath(), 'utf8'));
    if (prev && prev.cleanExit !== true && prev.pid && Number(prev.pid) !== process.pid) {
      log('crash', '检测到上次运行未正常退出: ' + JSON.stringify(prev));
      return prev;
    }
  } catch {}
  return null;
}

function notifyUncleanRestart(prev) {
  try {
    const started = prev && prev.startedAt ? new Date(prev.startedAt) : null;
    const when = started && !Number.isNaN(started.getTime())
      ? started.toLocaleString('zh-CN', { hour12: false })
      : '上次';
    const n = new Notification({
      title: 'DSH Desktop 已自动恢复',
      body: `检测到应用在 ${when} 前后未正常退出，看门狗已重新启动应用。`,
      icon: path.join(__dirname, 'assets', 'icon.png'),
    });
    n.on('click', () => showMainWindow());
    n.show();
  } catch (err) {
    log('crash', '恢复通知发送失败: ' + err.message);
  }
}

function startWatchdog() {
  // 仅安装版启用：开发模式下重启 Electron 会与调试流程互相干扰。
  if (!app.isPackaged || !IS_WIN) return;
  const watchdogJs = path.join(__dirname, 'watchdog.js');
  if (!fs.existsSync(watchdogJs)) return;
  try {
    const child = spawn(nodeExe(), [
      watchdogJs,
      '--pid=' + process.pid,
      '--exe=' + process.execPath,
      '--state=' + runStatePath(),
      '--log=' + path.join(logsDir, 'watchdog.log'),
    ], {
      cwd: path.dirname(process.execPath),
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.unref();
    log('watchdog', `看门狗已启动 pid=${child.pid}`);
  } catch (err) {
    log('watchdog', '看门狗启动失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// profile fallback 自愈：dsh 要求 $DSH_HOME/profiles/node_modules 下属于
// 依赖闭包的包必须是指向其真实安装位置的符号链接。用户迁移/复制/云同步
// DSH_HOME 时这些链接常被还原成真实目录，dsh web 会以 exit code 1 启动失败。
// 这里在每次启动 dsh 前调用官方 healProfilesModuleFallback；它若报
// "exists and is not a symlink"，就移除该真实目录后重试，直到修复完成。
// ---------------------------------------------------------------------------
function dshPackageJson() {
  const bin = dshBin();
  const candidates = [
    path.join(path.dirname(bin), 'package.json'),
    path.join(path.dirname(bin), '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  try { return require.resolve('@deepseek-ai/dsh/package.json'); } catch { return candidates[1]; }
}

async function repairProfileFallback(home) {
  let bootMod;
  try {
    bootMod = await import('@deepseek-ai/dsh-app-boot');
  } catch (err) {
    log('boot', 'profile fallback 修复模块不可用: ' + err.message);
    return;
  }
  if (typeof bootMod.healProfilesModuleFallback !== 'function') return;
  const modulesRoot = path.join(home, 'profiles', 'node_modules');
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      bootMod.healProfilesModuleFallback(dshPackageJson(), home);
      if (attempt > 0) log('boot', `profile fallback 已修复（重试 ${attempt} 次）`);
      return;
    } catch (err) {
      const message = String((err && err.message) || err);
      const match = /dsh: (.+) exists and is not a symlink/.exec(message);
      if (!match) {
        log('boot', 'profile fallback 修复失败: ' + message);
        return;
      }
      const badPath = match[1].trim();
      // 只清理 DSH_HOME 自己的 profile fallback 目录，拒绝越界删除。
      if (badPath !== modulesRoot && !badPath.startsWith(modulesRoot + path.sep)) {
        log('boot', '拒绝清理 profile fallback 之外的路径: ' + badPath);
        return;
      }
      log('boot', '检测到 profile fallback 非符号链接，移除并重试: ' + badPath);
      try { fs.rmSync(badPath, { recursive: true, force: true }); } catch (rmErr) {
        log('boot', '移除失败: ' + rmErr.message);
        return;
      }
    }
  }
}


// 主进程未捕获异常：记录堆栈并保持进程存活，避免无痕退出。
process.on('uncaughtException', (err) => {
  const stack = (err && (err.stack || err.message)) || String(err);
  log('crash', 'uncaughtException: ' + stack);
  try {
    dialog.showErrorBox('DSH Desktop 遇到异常', '应用已记录该错误并继续运行。\n\n' + stack.slice(0, 500));
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  log('crash', 'unhandledRejection: ' + String((reason && (reason.stack || reason.message)) || reason));
});

process.on('exit', (code) => {
  const line = `[${new Date().toISOString()}] [crash] 主进程退出 code=${code}\n`;
  try {
    const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log');
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.appendFileSync(lp, line);
  } catch {}
});

function nodeExe() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'node', 'node.exe');
  return path.resolve(__dirname, 'vendor', 'node', 'node.exe');
}

function npmCli() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js');
  return path.resolve(__dirname, 'vendor', 'npm', 'bin', 'npm-cli.js');
}

// Context shared with the updater module.
function updCtx() {
  return { userDataDir, nodeExe, npmCli, log };
}

// Updated overlay (user-approved official release) takes precedence over the
// bundled copy; the bundled copy is the fallback.
function dshBin() {
  const ov = updater.overlayBinPath(updCtx());
  if (ov && fs.existsSync(ov)) return ov;
  return require.resolve('@deepseek-ai/dsh/lib/bin.js');
}

function dshVersion() {
  if (isWslMode()) return wslBackend.activeVersion() || '未知';
  return updater.activeVersion(updCtx()) || '未知';
}

function dshVersionSource() {
  if (isWslMode()) return 'WSL 托管（' + wslBackend.installDirLinux() + '）';
  return updater.overlayVersion(updCtx()) ? '用户目录（已更新）' : '内置';
}

function killTree(proc) {
  // WSL 托管模式：进程在 WSL 里，经 pid 文件发 SIGTERM（绝不 wsl --terminate，
  // 那会杀掉整个发行版）；pid 丢失时兜底杀掉 wsl.exe 转发进程。
  if (isWslMode()) {
    wslBackend.stop().catch((err) => log('killTree', '停止 WSL dsh 失败: ' + String(err && err.message || err)));
    if (proc && proc.pid) {
      setTimeout(() => {
        try { if (proc.exitCode === null) proc.kill(); } catch {}
      }, 1500);
    }
    return;
  }
  if (!proc || !proc.pid) return;
  try {
    if (IS_WIN) {
      // M2 修复：先优雅（无 /F）给进程收尾机会（避免撕裂 session.jsonl.zstd），
      // 短等待后仍存活再强杀。
      spawn('taskkill', ['/pid', String(proc.pid), '/T'], { windowsHide: true, stdio: 'ignore' });
      const pid = proc.pid;
      setTimeout(() => {
        try {
          const query = 'tasklist /FI "PID eq ' + pid + '" /FO CSV /NH';
          const alive = require('node:child_process').execSync(query, { encoding: 'utf8', windowsHide: true });
          if (alive.includes(String(pid))) {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          }
        } catch { /* 进程已退出或查询失败 */ }
      }, 1500);
    } else {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
    }
  } catch (err) {
    log('killTree', String(err));
  }
}

// Environment for the dsh child: drop harness/session leftovers so the
// desktop instance boots clean, keep everything else (proxy, API keys, ...).
function childEnv() {
  const env = { ...process.env };
  for (const k of ['DSH_WEB_URL', 'DSH_SESSION_ID', 'DSH_SESSION_JSONL', 'DSH_SHELL', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    delete env[k];
  }
  if (dshHome) env.DSH_HOME = dshHome;
  env.NO_COLOR = '1';
  return env;
}

function showBox(opts) {
  if (mainWindow && !mainWindow.isDestroyed()) return dialog.showMessageBox(mainWindow, opts);
  return dialog.showMessageBox(opts);
}

// ---------------------------------------------------------------------------
// 后端模式（配置优先级：环境变量 > settings.json）：
//   local —— 启动内置 dsh（默认，行为不变）
//   wsl   —— 壳经 wsl.exe 在 WSL 内安装/更新/运行自己的 dsh（见 wsl-backend.js），
//            agent 自更新、插件同步、运行时补丁全部闭环。
// 环境变量：DSH_DESKTOP_BACKEND=local|wsl
//           DSH_DESKTOP_WSL_DISTRO / DSH_DESKTOP_WSL_DIR（wsl）
// settings.json：backend / wslDistro / wslInstallDir
// ---------------------------------------------------------------------------
function resolveBackendConfig() {
  const s = updater.loadSettings(updCtx());
  const want = String(process.env.DSH_DESKTOP_BACKEND || s.backend || '').trim().toLowerCase();
  if (want === 'remote') {
    // remote 附加模式已移除（如需连接外部已运行的 dsh，用 WSL 托管或浏览器直开）。
    log('boot', 'settings.backend=remote 已不再支持，回落为 local 模式');
  }
  backendMode = want === 'wsl' ? 'wsl' : 'local';
  if (backendMode === 'wsl') {
    // 解析发行版/安装目录并探活；失败抛错（boot 的 catch 会弹失败框）。
    wslBackend.configure({
      distro: String(process.env.DSH_DESKTOP_WSL_DISTRO || s.wslDistro || '').trim(),
      installDir: String(process.env.DSH_DESKTOP_WSL_DIR || s.wslInstallDir || '').trim(),
      log,
    });
  }
  return { mode: backendMode };
}

function isWslMode() { return backendMode === 'wsl'; }

// 各模式下的 DSH_HOME 落点（Windows 视角）：
//   local → Windows 的 DSH_HOME
//   wsl   → WSL 安装目录的 UNC 等价路径（供会话通知/余额/插件同步直读 WSL 文件）
function effectiveDshHome() {
  if (isWslMode()) return wslBackend.uncHome();
  return dshHome || path.join(os.homedir(), '.dsh');
}

// 设置页「WSL 后端」用的状态快照：当前 local 模式（未配置过）或 force 时，
// 按已保存的 wslDistro/wslInstallDir 做一次探测；失败不抛错，错误进 status。
function wslStatusSnapshot(opts = {}) {
  if (!wslBackend.isConfigured() || opts.force) {
    try {
      const s = updater.loadSettings(updCtx());
      wslBackend.configure({
        distro: String(s.wslDistro || '').trim(),
        installDir: String(s.wslInstallDir || '').trim(),
        log,
      });
    } catch (err) {
      return {
        configured: false,
        lastError: String((err && err.message) || err),
      };
    }
  }
  return wslBackend.status();
}

// ---------------------------------------------------------------------------
// dsh web server lifecycle
// ---------------------------------------------------------------------------

function startServer() {
  // M1 修复：重入前先终结旧进程，避免孤儿 harness 同时写同一 DSH_HOME
  // （wsl 模式经 pid 文件终止 WSL 内进程，local 模式 taskkill 进程树）。
  if (serverProc && !serverProc.killed && !quitting) {
    log('dsh', 'startServer 重入：先终结旧进程再启动');
    killTree(serverProc);
    serverProc = null;
  }
  if (isWslMode() && !wslBackend.isReady()) {
    return Promise.reject(new Error('WSL 托管后端未就绪: ' + wslBackend.lastError()));
  }
  if (!isWslMode() && !fs.existsSync(nodeExe())) {
    return Promise.reject(new Error(
      '找不到内置 Node 运行时: ' + nodeExe() + '\n' +
      (app.isPackaged ? '安装包可能不完整，请重新安装。' : '开发模式请先运行: npm run fetch-node')
    ));
  }
  const out = fs.createWriteStream(path.join(logsDir, 'dsh-web.log'), { flags: 'a' });
  let proc;
  if (isWslMode()) {
    // WSL 托管模式：经 wsl.exe 在 WSL 内启动 dsh web，stdout 透传（含 URL 就绪行）。
    log('dsh', `WSL 托管模式：在 ${wslBackend.installDirLinux()}/agent 内启动 dsh web`);
    proc = wslBackend.spawnServer();
  } else {
    const nodeBin = nodeExe();
    const bin = dshBin();
    log('dsh', `启动: "${nodeBin}" "${bin}" web --host 127.0.0.1 --port 0`);
    // --use-system-ca: 让 dsh web 进程信任系统证书库（代理/MITM 场景下内置 node 的
    // 默认 CA 无法验证，导致插件市场等对外 fetch 失败）。
    proc = spawn(nodeBin, ['--use-system-ca', bin, 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd: userDataDir,
      env: childEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  serverProc = proc;
  return watchServerProc(proc, out);
}

// 等待 dsh web 子进程 stdout 出现就绪 URL 行；进程提前退出 / 启动超时则拒绝。
// 退出时若服务已就绪过（webUrl 已设）且非主动重启，弹「DSH 服务已停止」对话框。
function watchServerProc(proc, out) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let bootTimer = null;
    const finish = (fn, value) => {
      if (!settled) { settled = true; fn(value); }
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
    };
    const onData = (chunk) => {
      out.write(chunk);
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/dsh web:\s+(https?:\/\/\S+)/);
        if (m) finish(resolve, m[1]);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => out.write(c));
    proc.on('error', (err) => finish(reject, err));
    proc.on('exit', (code, signal) => {
      out.end();
      log('dsh', `进程退出 code=${code} signal=${signal}`);
      // 原地重启（插件市场）或已替换为新进程时，不打扰用户、也不清掉新进程的句柄。
      const intentional = restartingServer || serverProc !== proc;
      if (serverProc === proc) serverProc = null;
      finish(reject, new Error(`dsh web 启动失败（退出码 ${code}）。日志: ${path.join(logsDir, 'dsh-web.log')}`));
      if (!quitting && !intentional && webUrl && mainWindow && !mainWindow.isDestroyed()) {
        showBox({
          type: 'error',
          title: 'DSH 服务已停止',
          message: 'DeepSeek Harness 服务意外退出。',
          detail: `日志文件：${path.join(logsDir, 'dsh-web.log')}`,
          buttons: ['重新启动', '退出'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) startAndShow().catch((err) => handleBootFailure(err));
          else app.quit();
        });
      }
    });
    // Safety net in case the URL line never appears.
    bootTimer = setTimeout(() => finish(reject, new Error('等待 dsh web 启动超时（60 秒）')), 60000);
    bootTimer.unref();
  });
}

function waitUntilUp(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url + '/', { timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve(url);
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error('Web UI 未在预期时间内就绪'));
      else setTimeout(tick, 300);
    };
    tick();
  });
}

function startAndShow() {
  return startServer()
    .then(waitUntilUp)
    .then((url) => {
      webUrl = url;
      log('boot', 'Web UI 就绪: ' + url);
      if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow.loadURL(url).then(() => url);
      }
      return url;
    });
}

async function handleBootFailure(err) {
  if (isWslMode() && await wslBackend.hasPrevious()) {
    showBox({
      type: 'error',
      title: 'DeepSeek Harness 启动失败',
      message: 'WSL 内更新后的 agent 无法启动。',
      detail: (err && err.message || String(err)) + '\n\n可回退到 WSL 内的上一版本继续使用。',
      buttons: ['回退到上一版本并重试', '重试', '退出'],
      defaultId: 0,
      cancelId: 2,
    }).then(({ response }) => {
      if (response === 0) {
        wslBackend.rollback().catch(() => {});
        startAndShow().catch((e2) => fatal('DeepSeek Harness 启动失败', e2));
      } else if (response === 1) {
        startAndShow().catch((e2) => handleBootFailure(e2));
      } else {
        app.quit();
      }
    });
    return;
  }
  const ov = updater.overlayBinPath(updCtx());
  if (ov && fs.existsSync(ov)) {
    showBox({
      type: 'error',
      title: 'DeepSeek Harness 启动失败',
      message: '更新后的 agent 无法启动。',
      detail: (err && err.message || String(err)) + '\n\n可回退到内置版本继续使用。',
      buttons: ['回退到内置版本并重试', '重试', '退出'],
      defaultId: 0,
      cancelId: 2,
    }).then(({ response }) => {
      if (response === 0) {
        updater.rollback(updCtx());
        startAndShow().catch((e2) => fatal('DeepSeek Harness 启动失败', e2));
      } else if (response === 1) {
        startAndShow().catch((e2) => handleBootFailure(e2));
      } else {
        app.quit();
      }
    });
  } else {
    fatal('DeepSeek Harness 启动失败', err);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DSH Desktop',
    backgroundColor: '#0b1220',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // 风格化无边框窗口：去掉原生标题栏/菜单栏，自绘玻璃栏 + Win11 原生圆角。
    ...(IS_WIN ? { frame: false, roundedCorners: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'assets', 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Keep the app brand in the OS title bar (the web UI sets its own <title>).
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle('DSH Desktop');
  });

  // Open target=_blank / window.open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the window pinned to the local web UI; send external links out.
  // H1 修复：origin 精确比较（protocol+host+port），杜绝前缀/异域/userinfo 逃逸；
  // file: 一律拦截（同 webContents 下 file 页面仍持有 preload 桥）；will-redirect 同规则。
  const isAllowedWebUrl = (url) => {
    try {
      const target = new URL(url);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
      if (webUrl) {
        const base = new URL(webUrl);
        return target.origin === base.origin;
      }
      return target.hostname === '127.0.0.1' || target.hostname === 'localhost' || target.hostname === '::1';
    } catch {
      return false;
    }
  };
  const guardNavigation = (event, url) => {
    if (isAllowedWebUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);

  // 渲染进程错误捕获：插件/页面异常统一落到 desktop.log，便于排查空白视图。
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level === 'error' || level === 'warning') {
      log('page', `[${level}] ${message} (${sourceId || 'unknown'}:${line})`);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('page', `渲染进程异常退出: ${details.reason} (exitCode=${details.exitCode})`);
  });

  // 移除菜单栏后仍保留的键盘快捷键。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (input.key === 'F11') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'F12') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && input.shift && key === 'i') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && key === 'r') { mainWindow.reload(); event.preventDefault(); }
    else if (input.alt && key === 'f4') { mainWindow.close(); event.preventDefault(); }
  });

  // 自绘最大化/还原按钮需要感知窗口状态。
  const sendMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chrome:maximized', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', sendMaxState);
  mainWindow.on('unmaximize', sendMaxState);
  mainWindow.on('enter-full-screen', sendMaxState);
  mainWindow.on('leave-full-screen', sendMaxState);

  // 关闭 → 隐藏到托盘（可在 chrome 菜单关闭该行为）。
  mainWindow.on('close', (event) => {
    // 主窗关闭（无论到托盘还是退出）时同步关闭会话浮窗。
    closeAllFloatWindows();
    if (!forceQuit && IS_WIN && closeToTrayEnabled() && tray) {
      event.preventDefault();
      mainWindow.hide();
      trayHintOnce();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (sponsorWindow && !sponsorWindow.isDestroyed()) sponsorWindow.destroy();
    sponsorWindow = null;
  });
}

// ---------------------------------------------------------------------------
// 会话浮窗：共享的 Web 守卫 + 浮窗创建/生命周期
// ---------------------------------------------------------------------------

// 本地 Web 地址判定（浮窗与主窗共用，杜绝异域/文件导航逃逸）。
function isAllowedWebUrl(url) {
  try {
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
    if (webUrl) {
      const base = new URL(webUrl);
      return target.origin === base.origin;
    }
    return target.hostname === '127.0.0.1' || target.hostname === 'localhost' || target.hostname === '::1';
  } catch {
    return false;
  }
}

// 给一个 webContents 挂上导航围栏 + 外部链接 + 异常日志守卫（浮窗使用）。
function guardWebContents(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const guardNavigation = (event, url) => {
    if (isAllowedWebUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  wc.on('will-navigate', guardNavigation);
  wc.on('will-redirect', guardNavigation);
  wc.on('console-message', (details, level, message, line, sourceId) => {
    // Electron 43 起第一参是 { level, message, lineNumber, sourceId }；
    // 后面 4 个旧位置参数保留为兼容。浮窗插件的排查日志是 console.log
    // （info 级）：同样落进 desktop.log，不必再要求用户打开 DevTools。
    const text = (details && details.message) || message || '';
    const lvl = (details && details.level) || level;
    const lineNo = (details && details.lineNumber) ?? line;
    const src = (details && details.sourceId) || sourceId || 'unknown';
    if (lvl === 'error' || lvl === 3 || lvl === 'warning' || lvl === 2 || /\[dsh-float-window\]/.test(text)) {
      log('float-page', `[${lvl}] ${text} (${src}:${lineNo})`);
    }
  });
  wc.on('render-process-gone', (_e, details) => {
    log('float-page', `浮窗渲染进程异常退出: ${details.reason} (exitCode=${details.exitCode})`);
  });
}

// 创建并登记一个会话浮窗。返回 BrowserWindow；失败返回 null。
function createFloatWindow(sessionId, { title } = {}) {
  if (!webUrl || floatWindows.size >= FLOAT_MAX) return null;
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    show: false,
    title: title || 'DSH 会话',
    backgroundColor: '#0b1220',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // 与主窗一致的无边框；浮窗 preload 注入一条更细的纯拖拽条。
    ...(IS_WIN ? { frame: false, roundedCorners: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 独立分区：浮窗与主窗隔离 localStorage，避免互相覆盖 dsh.sessions.current。
      // 会话数据在服务端（~/.dsh），localStorage 仅存 UI 选中态，无 cookie 认证，
      // 独立分区安全。所有浮窗共享同一 partition 字符串。
      partition: 'persist:dsh-float',
      // 用 additionalArguments 而非 URL 参数，避免污染 Web UI 见到的地址；
      // preload 从 process.argv 读取 --dsh-float=<sessionId>。
      additionalArguments: ['--dsh-float=' + sessionId],
    },
  });
  floatWindows.add(win);
  floatBySession.set(sessionId, win);
  win.loadURL(webUrl).catch((err) => log('float', '浮窗加载失败: ' + ((err && err.message) || err)));

  // 窗口标题跟随会话（去掉通用前缀，保留会话相关标题）。
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    const raw = String(event.title || win.getTitle() || '');
    const cleaned = raw.replace(/^DSH[·\-—\s/]*/i, '').trim();
    win.setTitle(cleaned || 'DSH 会话');
  });

  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('closed', () => {
    floatWindows.delete(win);
    for (const [sid, w] of floatBySession) {
      if (w === win) { floatBySession.delete(sid); break; }
    }
  });
  guardWebContents(win.webContents);

  log('float', '已创建会话浮窗 sessionId=' + sessionId);
  return win;
}

// 关闭全部浮窗（主窗关闭 / app 退出时调用）。
function closeAllFloatWindows() {
  for (const win of floatWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  floatWindows.clear();
  floatBySession.clear();
  if (sponsorWindow && !sponsorWindow.isDestroyed()) sponsorWindow.destroy();
  sponsorWindow = null;
}

// ---------------------------------------------------------------------------
// 赞助小窗：独立「请作者喝咖啡」收款码窗口
// ---------------------------------------------------------------------------

// 读取支付宝 / 微信收款码图片，返回 data URI（供 IPC 与小窗复用）。
function readSponsorQr() {
  const read = (name) => {
    try {
      const buf = fs.readFileSync(path.join(__dirname, 'assets', 'sponsor', name));
      const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return 'data:' + mime + ';base64,' + buf.toString('base64');
    } catch { return ''; }
  };
  return { ok: true, alipay: read('sponsor-alipay.jpg'), wechat: read('sponsor-wechat.png') };
}

// 创建（或聚焦已有）赞助小窗。窗口为原生边框小窗，内嵌深色 HTML 展示两码。
function createSponsorWindow() {
  if (sponsorWindow && !sponsorWindow.isDestroyed()) {
    sponsorWindow.show();
    sponsorWindow.focus();
    return sponsorWindow;
  }
  const qr = readSponsorQr();
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0b1220;color:#e6ecff;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;
    display:flex;flex-direction:column;height:100vh;user-select:none}
  .head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
    border-bottom:1px solid rgba(255,255,255,.08)}
  .title{font-size:14px;font-weight:600}
  .close{width:26px;height:26px;display:grid;place-items:center;border:none;border-radius:8px;
    background:transparent;color:#a9b8de;cursor:pointer;font-size:16px;line-height:1}
  .close:hover{background:rgba(255,255,255,.1);color:#eef2ff}
  .sub{font-size:12px;color:#8b9ac4;line-height:18px;padding:10px 14px 0}
  .codes{flex:1;display:flex;gap:16px;justify-content:center;align-items:center;padding:8px 14px 16px}
  .code{flex:1;min-width:0;text-align:center}
  .code img{width:100%;max-width:150px;aspect-ratio:1/1;object-fit:contain;display:block;margin:0 auto;
    border-radius:10px;background:#fff;padding:8px;box-sizing:border-box}
  .code p{margin:8px 0 0;font-size:12px;color:#a9b8de}
  .empty{font-size:12px;color:#8b9ac4;text-align:center;padding:16px 0}
</style>
</head>
<body>
  <div class="head">
    <div class="title">☕ 请作者喝咖啡</div>
    <button class="close" title="关闭" aria-label="关闭" onclick="window.close()">×</button>
  </div>
  <div class="sub">如果这个桌面客户端帮到了你，欢迎扫一扫支持一下作者，谢谢你的鼓励～</div>
  <div class="codes" id="codes"></div>
  <script>
    var codes = [
      { name: '支付宝', src: \`${qr.alipay}\` },
      { name: '微信', src: \`${qr.wechat}\` },
    ].filter(function (c) { return c.src; });
    var box = document.getElementById('codes');
    if (!codes.length) {
      box.className = 'empty';
      box.textContent = '未找到收款码资源';
    } else {
      box.className = 'codes';
      box.innerHTML = codes.map(function (c) {
        return '<div class="code"><img alt="' + c.name + '收款码" src="' + c.src + '"><p>' + c.name + '</p></div>';
      }).join('');
    }
  </script>
</body>
</html>`;
  const win = new BrowserWindow({
    width: 360,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: '请作者喝咖啡',
    backgroundColor: '#0b1220',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  sponsorWindow = win;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    .catch((err) => log('sponsor', '赞助小窗加载失败: ' + ((err && err.message) || err)));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('closed', () => { if (sponsorWindow === win) sponsorWindow = null; });
  // Esc 关闭小窗。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      if (!win.isDestroyed()) win.close();
    }
  });
  log('sponsor', '已打开赞助小窗');
  return win;
}

function fatal(title, err) {
  log('fatal', title + ': ' + ((err && (err.stack || err.message)) || err));
  const detail = '错误：' + ((err && err.message) || err) + '\n\n日志目录：' + logsDir;
  if (!mainWindow || mainWindow.isDestroyed()) {
    dialog.showErrorBox(title, detail);
    markCleanExit();
    app.exit(1);
    return;
  }
  showBox({
    type: 'error',
    title,
    message: title,
    detail,
    buttons: ['重试', '退出'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) startAndShow().catch((err2) => handleBootFailure(err2));
    else app.quit();
  });
}

// ---------------------------------------------------------------------------
// Self-update flow (official @deepseek-ai/dsh releases, user-consented)
// ---------------------------------------------------------------------------

function showUpdateWindow(version, kind = 'agent') {
  const win = new BrowserWindow({
    width: 460,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: true,
    title: '正在更新',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'assets', 'updating.html')).then(() => {
    win.webContents
      .executeJavaScript(`window.__init && window.__init(${JSON.stringify({ version, kind })})`)
      .catch(() => {});
  });
  win.once('ready-to-show', () => win.show());
  return win;
}

async function runUpdateFlow(manual) {
  if (quitting) return;
  if (updateBusy) {
    if (manual) await showBox({ type: 'info', title: '更新', message: '更新正在进行中，请稍候。', buttons: ['确定'] });
    return;
  }
  const ctx = updCtx();
  let latest;
  try {
    latest = await updater.checkLatest(ctx);
  } catch (err) {
    log('update', '检查失败: ' + err.message);
    if (manual) {
      await showBox({
        type: 'warning',
        title: '检查更新失败',
        message: '无法连接 npm registry。',
        detail: err.message + '\n\n可通过环境变量 NPM_CONFIG_REGISTRY 配置镜像。',
        buttons: ['确定'],
      });
    }
    return;
  }
  const current = isWslMode() ? (wslBackend.activeVersion() || '0.0.0') : updater.activeVersion(ctx);
  const settings = updater.loadSettings(ctx);
  if (updater.compareVersions(latest, current) <= 0) {
    if (manual) {
      await showBox({
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本。',
        detail: `@deepseek-ai/dsh@${current}`,
        buttons: ['确定'],
      });
    }
    return;
  }
  if (!manual && settings.skipVersion === latest) return;

  const { response } = await showBox({
    type: 'info',
    title: '发现新版本',
    message: `官方 @deepseek-ai/dsh 发布了新版本：${latest}`,
    detail: `当前版本：${current}\n\n是否立即更新？\n· 从 npm 官方源下载新版本及其依赖（首次约 250MB）\n· 更新期间界面保持可用，完成后重启应用生效\n· 失败会自动保留当前版本` + (isWslMode() ? '\n· WSL 托管模式：安装在 ' + wslBackend.installDirLinux() + '/agent' : ''),
    buttons: ['立即更新', '跳过此版本', '稍后'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 1) {
    settings.skipVersion = latest;
    updater.saveSettings(ctx, settings);
    log('update', '用户跳过版本 ' + latest);
    return;
  }
  if (response === 2) return;

  updateBusy = true;
  const progressWin = showUpdateWindow(latest);
  try {
    if (isWslMode()) {
      // WSL 托管：检查复用 Windows 侧 npm（纯 registry 查询），安装走 WSL 内
      // npm（staging + 原子切换，语义与本地模式一致）。
      await wslBackend.applyUpdate(latest, (line) => log('update', 'wsl: ' + line));
    } else {
      await updater.applyUpdate(ctx, latest);
    }
    const { response: r2 } = await showBox({
      type: 'info',
      title: '更新完成',
      message: `已更新到 @deepseek-ai/dsh@${latest}`,
      detail: '重启应用后生效。',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r2 === 0) {
      quitting = true;
      markCleanExit();
      killTree(serverProc);
      app.relaunch();
      app.exit(0);
    }
  } catch (err) {
    log('update', '更新失败: ' + err.message);
    await showBox({
      type: 'error',
      title: '更新失败',
      message: '未能完成更新，仍使用当前版本。',
      detail: err.message,
      buttons: ['确定'],
    });
  } finally {
    updateBusy = false;
    if (progressWin && !progressWin.isDestroyed()) progressWin.destroy();
  }
}

// ---------------------------------------------------------------------------
// Session-completion notifications
// ---------------------------------------------------------------------------

const lastNotifyAt = new Map(); // sessionId -> timestamp (per-session rate-limit)
let lastGlobalNotifyAt = 0; // 全局限流：短时间窗口内至多一条，避免多会话同时完成刷屏

function onSessionTurnEnd(info) {
  log('notify', 'DEBUG turn detected: ' + JSON.stringify({ sid: info.sessionId, title: info.title, notifyOnTurnEnd, quitting, vis: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(), foc: mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(), curSid: currentSessionId }));
  if (!notifyOnTurnEnd || quitting) { log('notify', 'DEBUG skip: notifyOnTurnEnd=' + notifyOnTurnEnd + ' quitting=' + quitting); return; }
  // 主窗可见且聚焦：用户正在操作，不弹通知打扰。最小化/隐藏/失焦时不拦截。
  // 「当前正在观看的会话」不再单独拦截：同一会话在后台完成时（窗口被遮挡、
  // 最小化或切走）正是最需要系统提醒的场景，日志证实旧逻辑在这里把提醒全部吞掉。
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) { log('notify', 'DEBUG skip: window visible+focused'); return; }
  const now = Date.now();
  const last = lastNotifyAt.get(info.sessionId) || 0;
  if (now - last < 30000) return; // 同一会话：30s 内至多一条
  if (now - lastGlobalNotifyAt < 15000) return; // 全局限流：15s 内至多一条
  lastNotifyAt.set(info.sessionId, now);
  lastGlobalNotifyAt = now;
  log('notify', '任务完成: ' + JSON.stringify(info));
  try {
    const n = new Notification({
      title: info.title || 'DSH 任务完成',
      body: info.body || '会话任务已完成',
      icon: path.join(__dirname, 'assets', 'icon.png'),
    });
    n.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    n.show();
  } catch (err) {
    log('notify', '通知发送失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Chrome（自绘标题栏）IPC、托盘、余额、快捷方式
// ---------------------------------------------------------------------------

function closeToTrayEnabled() {
  const s = updater.loadSettings(updCtx());
  return s.closeToTray !== false;
}

function setCloseToTray(v) {
  const s = updater.loadSettings(updCtx());
  s.closeToTray = !!v;
  updater.saveSettings(updCtx(), s);
}

function repoUrls() {
  const repos = clientUpdater.resolveRepos();
  return {
    github: 'https://github.com/' + repos.github,
    gitee: 'https://gitee.com/' + repos.gitee,
  };
}

async function showAbout() {
  const urls = repoUrls();
  const { response } = await showBox({
    type: 'info',
    title: '关于 DSH Desktop',
    message: 'DSH Desktop ' + APP_VERSION,
    detail: 'DeepSeek Harness 桌面客户端\n\nagent 版本：' + dshVersion() + '（' + dshVersionSource() + '）\n数据目录：' + userDataDir + '\nDSH_HOME：' + (isWslMode() ? 'WSL：' + wslBackend.installDirLinux() : (dshHome || '（dsh 默认）')) +
      '\n\n项目仓库：\n  GitHub: ' + urls.github + '\n  Gitee:  ' + urls.gitee,
    buttons: ['复制 GitHub 地址', '复制 Gitee 地址', '确定'],
  });
  if (response === 0) clipboard.writeText(urls.github);
  else if (response === 1) clipboard.writeText(urls.gitee);
}

function registerChromeIpc() {
  ipcMain.handle('chrome:init', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    let iconDataUri = '';
    try {
      const buf = fs.readFileSync(path.join(__dirname, 'assets', 'icon.png'));
      if (buf.length > 0 && buf[0] === 0x89 && buf[1] === 0x50) {
        iconDataUri = 'data:image/png;base64,' + buf.toString('base64');
      }
    } catch {}
    const s = updater.loadSettings(updCtx());
    const urls = repoUrls();
    return {
      appVersion: APP_VERSION,
      agentVersion: dshVersion(),
      agentSource: dshVersionSource(),
      notifyOnTurnEnd,
      closeToTray: s.closeToTray !== false,
      iconDataUri,
      repoUrls: urls,
      staticPort: previewStaticPort,
      mode: isWslMode() ? 'wsl' : 'local',
    };
  });

  ipcMain.handle('chrome:window', (event, { action } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    switch (action) {
      case 'minimize': mainWindow.minimize(); break;
      case 'toggle-maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break;
      case 'close': mainWindow.close(); break;
      case 'is-maximized': return mainWindow.isMaximized();
    }
    return null;
  });

  ipcMain.handle('chrome:menu', async (event, { action } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { notifyOnTurnEnd, closeToTray: closeToTrayEnabled() };
    }
    switch (action) {
      case 'reload': mainWindow.reload(); break;
      case 'devtools': mainWindow.webContents.toggleDevTools(); break;
      case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break;
      case 'open-browser': if (webUrl) shell.openExternal(webUrl); break;
      case 'open-logs': shell.openPath(logsDir); break;
      case 'check-agent-update': runUpdateFlow(true); break;
      case 'check-client-update': runClientUpdateFlow(true); break;
      case 'toggle-notify': {
        notifyOnTurnEnd = !notifyOnTurnEnd;
        const s = updater.loadSettings(updCtx());
        s.notifyOnTurnEnd = notifyOnTurnEnd;
        updater.saveSettings(updCtx(), s);
        break;
      }
      case 'toggle-close-to-tray': setCloseToTray(!closeToTrayEnabled()); break;
      case 'about': showAbout(); break;
      case 'quit': forceQuit = true; app.quit(); break;
    }
    return { notifyOnTurnEnd, closeToTray: closeToTrayEnabled() };
  });

  // 插件市场：原地重启 dsh web 服务（安装/卸载插件后生效，窗口重载到新端口）。
  ipcMain.handle('chrome:restart-service', async (event, payload = {}) => {
    if (payload?.intent !== 'restart-service') return { ok: false, error: 'missing-intent' };
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    if (!serverProc || restartingServer) return { ok: false, error: 'not-running' };
    log('service', '请求重启 dsh web 服务');
    restartingServer = true;
    try {
      killTree(serverProc);
      const url = await startAndShow();
      log('service', 'dsh web 服务已重启: ' + url);
      return { ok: true, url };
    } catch (err) {
      log('service', '重启失败: ' + ((err && err.message) || err));
      return { ok: false, error: String((err && err.message) || err) };
    } finally {
      restartingServer = false;
    }
  });

  // 会话浮窗：主窗请求把某个会话弹出到独立窗口（校验来源与数量上限）。
  ipcMain.handle('chrome:float-window', (event, { action, sessionId } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    if (action !== 'open') return { ok: false, error: 'bad-action' };
    if (!webUrl) return { ok: false, error: 'not-ready' };
    if (typeof sessionId !== 'string' || !sessionId) return { ok: false, error: 'bad-session' };
    // 同一会话只保留一个浮窗：拖出/按钮连续触发或重复请求时，
    // 复用已有窗口而不是再开第二个。
    const existing = floatBySession.get(sessionId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return { ok: true, id: existing.id, reused: true };
    }
    if (existing) floatBySession.delete(sessionId);
    if (floatWindows.size >= FLOAT_MAX) return { ok: false, error: 'too-many' };
    const win = createFloatWindow(sessionId);
    if (!win) return { ok: false, error: 'too-many' };
    return { ok: true, id: win.id };
  });

  // 浮窗关闭：仅允许浮窗关闭自身（校验发送者属于某个浮窗）。
  ipcMain.on('float:close', (event) => {
    for (const win of floatWindows) {
      if (!win.isDestroyed() && win.webContents === event.sender) { win.close(); break; }
    }
  });

  // 复制文本到剪贴板（菜单「更新源」复制按钮 / 关于对话框）。
  ipcMain.handle('dsh:copy-text', (event, { text } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
    if (typeof text !== 'string' || !text || text.length > 2048) return { ok: false };
    clipboard.writeText(text);
    return { ok: true };
  });

  // 请作者喝咖啡：读取赞助二维码图片（支付宝 / 微信），以 data URI 返回给渲染进程。
  ipcMain.handle('dsh:sponsor-qr', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
    return readSponsorQr();
  });

  // 赞助小窗：打开独立「请作者喝咖啡」窗口（校验来源是主窗）。
  ipcMain.handle('chrome:sponsor-window', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    createSponsorWindow();
    return { ok: true };
  });

  // preload 转发的页面异常（window.onerror / unhandledrejection）。
  ipcMain.on('dsh:page-error', (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    log('page-error', String(payload));
  });

  // 渲染进程上报「当前观看的会话」ID，供完成通知的调试日志记录。
  ipcMain.on('dsh:current-session', (event, sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId) return;
    currentSessionId = sessionId;
  });

  ipcMain.handle('dsh:balance-refresh', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return balanceCache;
    return refreshBalance();
  });

  // 文件还原（「文件」视图的回退）：按会话日志里已持久化的写前/写后全文，
  // 做精确内容匹配后替换 —— 只有内容一致才动手，天然幂等且安全。
  ipcMain.handle('dsh:file-revert', async (event, { changes } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { results: [] };
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > 300) return { results: [] };
    const results = [];
    for (const c of changes) {
      const p = String((c && c.path) || '');
      const oldText = String((c && c.oldText) ?? '');
      const newText = String((c && c.newText) ?? '');
      if (!path.isAbsolute(p) || oldText.length > 400000 || newText.length > 400000) {
        results.push({ path: p, status: 'invalid' });
        continue;
      }
      if (!isUnderFileRoots(p)) {
        results.push({ path: p, status: 'forbidden' });
        continue;
      }
      try {
        const exists = fs.existsSync(p);
        const content = exists ? fs.readFileSync(p, 'utf8') : null;
        if (oldText === '' && newText !== '') {
          // 新建 → 删除（内容必须仍是 agent 写入的原文）
          if (content !== null && content === newText) { fs.rmSync(p); results.push({ path: p, status: 'reverted' }); }
          else results.push({ path: p, status: content === null ? 'missing' : 'conflict' });
        } else if (newText === '' && oldText !== '') {
          // 删除 → 恢复（文件必须仍不存在）
          if (content === null) { fs.writeFileSync(p, oldText, 'utf8'); results.push({ path: p, status: 'reverted' }); }
          else results.push({ path: p, status: 'conflict' });
        } else {
          if (content !== null && content.includes(newText)) {
            fs.writeFileSync(p, content.replace(newText, oldText), 'utf8');
            results.push({ path: p, status: 'reverted' });
          } else if (content !== null && content === oldText) {
            results.push({ path: p, status: 'skipped' });
          } else {
            results.push({ path: p, status: content === null ? 'missing' : 'conflict' });
          }
        }
      } catch (err) {
        results.push({ path: p, status: 'failed', error: String((err && err.message) || err) });
      }
    }
    log('file-revert', JSON.stringify(results.slice(0, 20)));
    return { results };
  });

  // 「全部文件」视图的打开请求：用系统默认程序打开项目文件。
  ipcMain.handle('dsh:file-open', async (event, { path: p } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'forbidden' };
    if (typeof p !== 'string' || !path.isAbsolute(p)) return { ok: false, error: 'path must be absolute' };
    if (!isUnderFileRoots(p)) return { ok: false, error: 'path outside session workspace' };
    if (DANGEROUS_EXT.test(p)) return { ok: false, error: 'executable files are not openable from the file view' };
    try {
      if (!fs.existsSync(p)) return { ok: false, error: 'file not found' };
      const msg = await shell.openPath(p);
      if (msg) return { ok: false, error: msg };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // 预览面板：用系统浏览器打开 http(s) URL。
  ipcMain.handle('dsh:open-external', async (event, { url } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'forbidden' };
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'invalid url' };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // -------------------------------------------------------------------------
  // WSL 后端配置（设置页 dsh-wsl-settings 插件消费）：
  //   get     —— 当前后端模式 + 已保存的 wslDistro/wslInstallDir + WSL 探测状态
  //   save    —— 校验并持久化到 settings.json（重启应用生效）
  //   recheck —— 用已保存配置重新探测 WSL，返回最新状态
  // -------------------------------------------------------------------------
  ipcMain.handle('dsh:wsl-config', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    const s = updater.loadSettings(updCtx());
    return {
      backend: backendMode,
      wslDistro: String(s.wslDistro || ''),
      wslInstallDir: String(s.wslInstallDir || ''),
      status: wslStatusSnapshot(),
    };
  });

  ipcMain.handle('dsh:wsl-config-save', async (event, { cfg } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'bad-payload' };
    const backend = String(cfg.backend || '').trim().toLowerCase();
    if (backend !== 'local' && backend !== 'wsl') return { ok: false, error: '后端模式必须是 local 或 wsl' };
    const wslDistro = String(cfg.wslDistro || '').trim();
    const wslInstallDir = String(cfg.wslInstallDir || '').trim();
    if (wslInstallDir && !wslInstallDir.startsWith('/') && !wslInstallDir.startsWith('~')) {
      return { ok: false, error: 'WSL 安装目录必须是 WSL 内绝对路径（以 / 或 ~ 开头）' };
    }
    if (/\s/.test(wslInstallDir)) return { ok: false, error: 'WSL 安装目录不能包含空白字符' };
    // 目标为 wsl 时预检一次，让用户在重启前就能发现配置问题。
    if (backend === 'wsl') {
      try {
        wslBackend.configure({ distro: wslDistro, installDir: wslInstallDir, log });
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    }
    const s = updater.loadSettings(updCtx());
    s.backend = backend;
    if (wslDistro) s.wslDistro = wslDistro; else delete s.wslDistro;
    if (wslInstallDir) s.wslInstallDir = wslInstallDir; else delete s.wslInstallDir;
    updater.saveSettings(updCtx(), s);
    log('wsl-config', '已保存后端配置: ' + JSON.stringify({ backend, wslDistro, wslInstallDir }));
    return { ok: true, restartRequired: true };
  });

  ipcMain.handle('dsh:wsl-recheck', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    const s = updater.loadSettings(updCtx());
    return {
      backend: backendMode,
      wslDistro: String(s.wslDistro || ''),
      wslInstallDir: String(s.wslInstallDir || ''),
      status: wslStatusSnapshot({ force: true }),
    };
  });
}

let trayHintShown = false;
function trayHintOnce() {
  if (trayHintShown || !tray) return;
  trayHintShown = true;
  try {
    tray.displayBalloon({
      title: 'DSH Desktop 仍在运行',
      content: '窗口已隐藏到系统托盘，点击托盘图标可重新打开。',
      iconType: 'info',
    });
  } catch {}
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (!IS_WIN || quitting) return;
  if (tray && !tray.isDestroyed()) return;
  log('tray', '检测到托盘不可用，尝试重建');
  createTray();
}

function createTray() {
  if (!IS_WIN) return;
  try {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    if (!fs.existsSync(iconPath)) return;
    tray = new Tray(iconPath);
    tray.setToolTip('DSH Desktop' + (APP_VERSION ? ' v' + APP_VERSION : ''));
    const menu = Menu.buildFromTemplate([
      { label: '显示 DSH Desktop', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '检查 dsh 更新…', click: () => { showMainWindow(); runUpdateFlow(true); } },
      { label: '检查客户端更新…', click: () => { showMainWindow(); runClientUpdateFlow(true); } },
      {
        label: '会话完成通知',
        type: 'checkbox',
        checked: notifyOnTurnEnd,
        click: (item) => {
          notifyOnTurnEnd = item.checked;
          const s = updater.loadSettings(updCtx());
          s.notifyOnTurnEnd = item.checked;
          updater.saveSettings(updCtx(), s);
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => { forceQuit = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
      else showMainWindow();
    });
    tray.on('double-click', () => showMainWindow());
    log('boot', '系统托盘已就绪');
  } catch (err) {
    log('boot', '创建系统托盘失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// DeepSeek 余额（推送到 Web UI 的 dsh-balance 插件）
// ---------------------------------------------------------------------------

async function refreshBalance() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  let result;
  try {
    result = await balance.queryBalance(home);
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err), balances: [] };
  }
  // 按当前默认模型 + 当前时段（峰谷）计算有效单价；settings.json 的
  // balancePrices.<model> 可整体覆盖该模型的单价。
  const model = balance.readActiveModel(home) || 'deepseek-v4-pro';
  const s = updater.loadSettings(updCtx());
  const override = s.balancePrices && s.balancePrices[model];
  result.prices = { ...balance.effectivePrice(model), ...(override || {}) };
  result.model = model;
  result.peak = balance.isPeakHour();
  balanceCache = result;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh:balance', result);
  }
  return result;
}

function startBalanceLoop() {
  refreshBalance().catch(() => {});
  balanceTimer = setInterval(() => refreshBalance().catch(() => {}), 15 * 60 * 1000);
  if (balanceTimer.unref) balanceTimer.unref();
}

// ---------------------------------------------------------------------------
// 配套 dsh 插件同步（注入 web profile：余额小部件 + 文件更改追踪/还原）
// ---------------------------------------------------------------------------

const COMPANION_PLUGINS = [
  { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  { id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' },
  { id: 'client-file-changes', name: '@deepseek-ai/dsh-client-file-changes' },
  { id: 'terminal', name: '@deepseek-ai/dsh-terminal-tab' },
  { id: 'plugin-marketplace', name: '@deepseek-ai/dsh-plugin-marketplace' },
  { id: 'float-window', name: '@deepseek-ai/dsh-float-window' },
  { id: 'conversation-tweaks', name: '@deepseek-ai/dsh-conversation-tweaks' },
  { id: 'prompt-custom', name: '@deepseek-ai/dsh-prompt-custom' },
  { id: 'third-party-thinking', name: '@deepseek-ai/dsh-third-party-thinking' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
];

function companionDirName(p) {
  const slash = p.name.indexOf('/');
  return slash >= 0 ? p.name.slice(slash + 1) : p.name;
}

function removeStaleCompanionPlugins(profileModules, expectedDirs) {
  let entries;
  try { entries = fs.readdirSync(profileModules, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory() || expectedDirs.has(entry.name)) continue;
    const pkgPath = path.join(profileModules, entry.name, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }
    // 只清理「DSH Desktop 配套插件」遗留的旧包名（例如改名为 dsh-terminal-tab
    // 之前同步进 profile 的 dsh-terminal）。判定依据是该包由本壳层私有同步而来，
    // 避免误删用户自己安装或官方预设依赖的同名包。
    if (pkg && pkg.private === true && typeof pkg.description === 'string' && /DSH Desktop/.test(pkg.description)) {
      try {
        fs.rmSync(path.join(profileModules, entry.name), { recursive: true, force: true });
        log('boot', '已清理过期配套插件: ' + entry.name);
      } catch (err) {
        log('boot', '清理过期配套插件失败 ' + entry.name + ': ' + err.message);
      }
    }
  }
}

function syncCompanionPlugins() {
  if (!IS_WIN) return;
  try {
    const home = effectiveDshHome();
    if (!home) { log('boot', 'DSH_HOME 未解析，跳过配套插件同步'); return; }
    const profileDir = path.join(home, 'profiles', 'web');
    const profileModules = path.join(profileDir, 'node_modules', '@deepseek-ai');
    fs.mkdirSync(profileModules, { recursive: true });
    const expectedDirs = new Set(COMPANION_PLUGINS.map(companionDirName));
    removeStaleCompanionPlugins(profileModules, expectedDirs);
    for (const p of COMPANION_PLUGINS) {
      const rel = companionDirName(p);
      const src = path.join(__dirname, 'assets', 'plugins', rel);
      if (!fs.existsSync(path.join(src, 'package.json'))) continue;
      // @deepseek-ai 与 @dsh-external 两种 scope 都按包名落到 profile 的
      // node_modules 下；配套包自身的依赖由 dsh 的 profiles/node_modules
      // fallback（healProfilesModuleFallback）解析。
      const dest = path.join(profileModules, '..', p.name);
      fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
      for (const f of ['package.json', 'lib/index.js', 'lib/client.js', 'lib/vlm.js', 'dsh.plugin.json']) {
        const sf = path.join(src, f);
        if (fs.existsSync(sf)) fs.copyFileSync(sf, path.join(dest, f));
      }
    }
    // 注册到 profile 的 patch 层（幂等）。
    const patchFile = path.join(profileDir, 'cordis.patch.yml');
    let patch = '';
    try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
    let changed = false;
    for (const p of COMPANION_PLUGINS) {
      // 该 id 在 patch 里已存在：若它现在的 name 与当前版本不一致（例如终端
      // 包改名 @deepseek-ai/dsh-terminal → dsh-terminal-tab），就地改名为当前
      // 值。否则旧名残留会让配套插件与 agent 内置终端重复注册路由、或加载
      // 到已不属于本版本的包。只改 name 行，不动用户自己加的其它行。
      const idNameRe = new RegExp('(id:\\s*' + p.id + '\\b[^\\n]*\\n\\s*name:\\s*\\x27)([^\\x27]*)(\\x27)');
      const m = patch.match(idNameRe);
      if (m) {
        if (m[2] !== p.name) {
          patch = patch.replace(idNameRe, '$1' + p.name + '$3');
          changed = true;
        }
        continue;
      }
      const block = `- insert:\n    - id: ${p.id}\n      name: '${p.name}'\n`;
      if (/^\s*\[\]\s*$/m.test(patch)) patch = patch.replace(/\[\]/m, block);
      else if (patch.trim() === '') patch = '# dsh web profile patch（由 DSH Desktop 维护）\n' + block;
      else patch = patch.replace(/\s*$/, '\n') + block;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(patchFile, patch);
      log('boot', '已同步配套插件到 web profile: ' + COMPANION_PLUGINS.map((p) => p.id).join(', '));
    }
  } catch (err) {
    log('boot', '同步配套插件失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// dsh web 运行时闪跳修复：官方 dsh-client-runtime 在会话列表刷新
// （mergeOrderedBaseline）时会丢弃「本地已创建、宿主全量列表尚未回显」的
// 新会话，使 current 瞬时变 undefined，UI 闪回「选择工作区/无会话」状态。
// 这里幂等地把补丁写进运行时文件；dsh 包更新后本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applyRuntimeFlashFix() {
  try {
    const home = effectiveDshHome();
    if (!home) { log('boot', 'DSH_HOME 未解析，跳过 runtime 补丁'); return; }
    const file = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js');
    if (!fs.existsSync(file)) { log('boot', 'runtime 补丁: 未找到 dsh-client-runtime，跳过'); return; }
    let src = fs.readFileSync(file, 'utf8');
    const oldPat = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
    const newPat = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';
    if (src.includes(newPat)) { log('boot', 'runtime 补丁: 已应用，跳过'); return; }
    if (!src.includes(oldPat)) { log('boot', 'runtime 补丁: 未匹配到目标代码（版本可能已变更），跳过'); return; }
    src = src.replace(oldPat, newPat);
    fs.writeFileSync(file, src, { encoding: 'utf8' });
    log('boot', 'runtime 补丁: 已修复会话列表刷新闪跳（mergeOrderedBaseline 保留本地新会话）');
  } catch (err) {
    log('boot', 'runtime 补丁失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// dsh-host-apiproxy 设置暴露补丁：官方代理只把少数命名空间暴露给浏览器端
// 配置客户端（WEB_SETTINGS_NAMESPACES 白名单）。我们配套的 dsh-prompt-custom
// 插件注册了「自定义提示词」命名空间 dsh-prompt，默认不在白名单里，导致设置页
// 该栏只读（显示「设置不可用」）。这里幂等地把 dsh-prompt 追加进白名单；
// dsh 包更新后本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applyPromptExposeFix() {
  try {
    const home = effectiveDshHome();
    if (!home) { log('boot', 'DSH_HOME 未解析，跳过提示词暴露补丁'); return; }
    const file = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js');
    if (!fs.existsSync(file)) { log('boot', '提示词暴露补丁: 未找到 dsh-host-apiproxy，跳过'); return; }
    let src = fs.readFileSync(file, 'utf8');
    // 幂等地把配套命名空间追加进 WEB_SETTINGS_NAMESPACES 数组（数组以 "\n];" 收尾）。
    // 逐个检查缺失项，缺失就在数组收尾前插入，避免对已应用过的中间态失配。
    const namespaces = ['dsh-prompt', 'dsh-third-party-thinking'];
    let changed = false;
    for (const ns of namespaces) {
      if (src.includes('"' + ns + '"')) continue;
      const closeIdx = src.indexOf('\n];');
      if (closeIdx === -1) { log('boot', '提示词暴露补丁: 未匹配到设置命名空间数组收尾，跳过'); return; }
      src = src.slice(0, closeIdx) + ',\n\t"' + ns + '"' + src.slice(closeIdx);
      changed = true;
    }
    if (!changed) { log('boot', '提示词暴露补丁: 已应用，跳过'); return; }
    fs.writeFileSync(file, src, { encoding: 'utf8' });
    log('boot', '提示词暴露补丁: 已把 ' + namespaces.join(', ') + ' 加入 settings 暴露白名单');
  } catch (err) {
    log('boot', '提示词暴露补丁失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// 快捷方式维护：修复「没有桌面快捷方式 / 快捷方式指向的文件消失」，
// 并让快捷方式图标跟随图标设计更新（.lnk 单独指定 icon.ico）。
// ---------------------------------------------------------------------------

// 图标设计版本：更换图标时 +1，触发所有快捷方式图标刷新。
const SHORTCUT_ICON_VERSION = 'whale-2';

function shortcutIconPath() {
  // 复制到 userData 保证路径稳定（便携版 exe 解压目录每次启动都会变）。
  const ico = path.join(userDataDir, 'icon.ico');
  try {
    const src = path.join(__dirname, 'assets', 'icon.ico');
    if (!fs.existsSync(src)) return '';
    if (!fs.existsSync(ico) || fs.statSync(src).size !== fs.statSync(ico).size) {
      fs.copyFileSync(src, ico);
    }
    return ico;
  } catch (err) {
    log('boot', '复制快捷方式图标失败: ' + err.message);
    return path.join(__dirname, 'assets', 'icon.ico');
  }
}

function maintainShortcuts() {
  if (!IS_WIN) return;
  // 仅对真正的打包产物维护快捷方式。本机 app.isPackaged 在 dev 下也恒为 true，
  // 故用 resources 下是否存在 app/app.asar 判别：dev 的 electron 只有
  // default_app.asar，从而避免把快捷方式改指向 node_modules 下的开发用 electron。
  const bundled =
    fs.existsSync(path.join(process.resourcesPath, 'app')) ||
    fs.existsSync(path.join(process.resourcesPath, 'app.asar'));
  if (!app.isPackaged || !bundled) return;
  try {
    const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const settings = updater.loadSettings(updCtx());
    const linksDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const startMenu = path.join(linksDir, 'DSH Desktop.lnk');
    const desktop = path.join(app.getPath('desktop'), 'DSH Desktop.lnk');
    const ico = shortcutIconPath();
    const opts = {
      target,
      description: 'DeepSeek Harness 桌面客户端',
      ...(ico ? { icon: ico, iconIndex: 0 } : {}),
      appUserModelId: 'com.deepseek.dsh.desktop',
    };
    let changed = false;
    // exe 被移动过，或图标设计更新过：替换现有快捷方式（修复“指向的文件消失”）。
    if ((settings.shortcutTarget && settings.shortcutTarget !== target) || settings.shortcutIcon !== SHORTCUT_ICON_VERSION) {
      for (const p of [startMenu, desktop]) {
        if (fs.existsSync(p)) {
          try { shell.writeShortcutLink(p, 'replace', opts); changed = true; } catch {}
        }
      }
    }
    // 缺失则创建：便携版补桌面快捷方式；开始菜单快捷方式是系统通知的前置条件。
    if (!fs.existsSync(startMenu)) {
      try { shell.writeShortcutLink(startMenu, 'create', opts); changed = true; } catch {}
    }
    if (!fs.existsSync(desktop)) {
      try { shell.writeShortcutLink(desktop, 'create', opts); changed = true; } catch {}
    }
    if (changed) {
      settings.shortcutTarget = target;
      settings.shortcutIcon = SHORTCUT_ICON_VERSION;
      updater.saveSettings(updCtx(), settings);
      log('boot', '快捷方式已维护（开始菜单/桌面 → ' + target + '，图标 ' + SHORTCUT_ICON_VERSION + '）');
    }
  } catch (err) {
    log('boot', '快捷方式维护失败: ' + err.message);
  }
}

function warnTempRun() {
  if (!app.isPackaged || !IS_WIN || !process.env.PORTABLE_EXECUTABLE_DIR) return;
  const dir = process.env.PORTABLE_EXECUTABLE_DIR.toLowerCase();
  const tmp = os.tmpdir().toLowerCase();
  if (dir === tmp || dir.startsWith(tmp + path.sep)) {
    showBox({
      type: 'warning',
      title: '正在从临时目录运行',
      message: '当前便携版位于系统临时目录。',
      detail: '临时目录中的文件可能被系统自动清理，导致快捷方式失效或程序“消失”。\n建议把 DSH Desktop exe 移动到固定位置（如桌面或 D 盘）后再运行。',
      buttons: ['知道了'],
    });
  }
}

// ---------------------------------------------------------------------------
// 客户端自更新流程（更新 DSH Desktop 封装本身）
// ---------------------------------------------------------------------------

// 退出应用并启动客户端更新脚本。把“写脚本 + 派发 + 退出”收敛到一处，
// 保证即使写脚本失败也一定退出应用，避免更新流程卡死导致“点安装没反应”。
function quitForClientUpdate(ctx, pending) {
  quitting = true;
  forceQuit = true;
  markCleanExit();
  try {
    killTree(serverProc);
  } catch (err) {
    log('client-update', '停止 dsh 服务失败: ' + err.message);
  }
  updater.abort();
  if (sessionWatcher) sessionWatcher.stop();
  let logFile = '';
  try {
    const applied = clientUpdater.applyUpdate(ctx, pending);
    if (applied && applied.logFile) logFile = applied.logFile;
  } catch (err) {
    log('client-update', '启动更新脚本失败: ' + err.message);
  }
  log('client-update', '退出应用以应用更新' + (logFile ? '，日志: ' + logFile : ''));
  setTimeout(() => app.exit(0), 400);
}

async function runClientUpdateFlow(manual) {
  if (quitting) return;
  if (clientUpdateBusy) {
    if (manual) await showBox({ type: 'info', title: '更新', message: '客户端更新正在进行中，请稍候。', buttons: ['确定'] });
    return;
  }
  const ctx = updCtx();
  const settings = updater.loadSettings(ctx);
  let release;
  try {
    release = await clientUpdater.checkLatest(ctx, APP_VERSION);
  } catch (err) {
    log('client-update', '检查失败: ' + err.message);
    if (manual) {
      await showBox({
        type: 'warning',
        title: '检查客户端更新失败',
        message: '无法连接上游发布源。',
        detail: err.message + '\n\n可通过环境变量 DSH_DESKTOP_RELEASE_API 指定镜像 API。',
        buttons: ['确定'],
      });
    }
    return;
  }
  if (!release.isNewer) {
    if (manual) {
      await showBox({
        type: 'info',
        title: '检查客户端更新',
        message: '当前已是最新版本。',
        detail: `DSH Desktop v${APP_VERSION}\n上游最新：${release.version}（${release.source}）`,
        buttons: ['确定'],
      });
    }
    return;
  }
  if (!manual && settings.skipClientVersion === release.version) return;
  // M7 修复：用户选过"稍后"的同版本不再每 12h 重复弹窗/重复下载。
  if (!manual && settings.pendingClientVersion === release.version) return;
  const notes = release.body ? '\n\n更新说明：\n' + release.body.slice(0, 800) : '';
  const { response } = await showBox({
    type: 'info',
    title: '发现新版本客户端',
    message: `DSH Desktop 发布了新版本：v${release.version}`,
    detail: `当前版本：v${APP_VERSION}\n发布来源：${release.source}${notes}\n\n是否立即更新？下载后自动替换并重启应用。`,
    buttons: ['立即更新', '跳过此版本', '稍后'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 1) {
    settings.skipClientVersion = release.version;
    updater.saveSettings(ctx, settings);
    log('client-update', '用户跳过版本 ' + release.version);
    return;
  }
  if (response === 2) {
    // M7 修复：记录"稍后"版本，周期检查不再重复打扰（新版本出现时仍会提示）。
    settings.pendingClientVersion = release.version;
    updater.saveSettings(ctx, settings);
    log('client-update', '用户稍后处理版本 ' + release.version);
    return;
  }

  clientUpdateBusy = true;
  const progressWin = showUpdateWindow(release.version, 'client');
  try {
    const { filePath, size } = await clientUpdater.downloadRelease(ctx, release, {
      onProgress: (received, total) => {
        const pct = total > 0 ? Math.round((received * 100) / total) : -1;
        if (progressWin && !progressWin.isDestroyed()) {
          progressWin.webContents
            .executeJavaScript(
              `window.__setProgress && window.__setProgress(${pct}, ${Math.round(received / 1048576)}, ${Math.round(total / 1048576)})`
            )
            .catch(() => {});
        }
      },
    });
    settings.pendingClientUpdate = { version: release.version, path: filePath, source: release.source };
    settings.skipClientVersion = null;
    settings.pendingClientVersion = null;
    updater.saveSettings(ctx, settings);
    const { response: r2 } = await showBox({
      type: 'info',
      title: '下载完成',
      message: `已准备好 DSH Desktop v${release.version}（${Math.round(size / 1048576)} MB）。`,
      detail: '立即重启应用完成更新？\n· 重启后自动安装新版本并启动\n· 选择稍后重启：下次启动时再提示安装',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r2 === 0) {
      quitForClientUpdate(ctx, settings.pendingClientUpdate);
    }
  } catch (err) {
    log('client-update', '更新失败: ' + err.message);
    await showBox({
      type: 'error',
      title: '更新失败',
      message: '未能完成客户端更新，仍使用当前版本。',
      detail: err.message,
      buttons: ['确定'],
    });
  } finally {
    clientUpdateBusy = false;
    if (progressWin && !progressWin.isDestroyed()) progressWin.destroy();
  }
}

function offerPendingClientUpdate() {
  const ctx = updCtx();
  const settings = updater.loadSettings(ctx);
  const pending = settings.pendingClientUpdate;
  if (!pending || !pending.path) return;
  if (!fs.existsSync(pending.path)) {
    settings.pendingClientUpdate = null;
    updater.saveSettings(ctx, settings);
    return;
  }
  if (updater.compareVersions(pending.version, APP_VERSION) <= 0) {
    settings.pendingClientUpdate = null;
    updater.saveSettings(ctx, settings);
    return;
  }
  showBox({
    type: 'info',
    title: '有待安装的客户端更新',
    message: `已下载 DSH Desktop v${pending.version}，是否现在安装并重启？`,
    detail: '安装包保存在数据目录的 updates 文件夹中。',
    buttons: ['立即重启', '稍后'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response !== 0) return;
    quitForClientUpdate(ctx, pending);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 预览静态文件服务：独立端口的只读文件服务，供「站内 HTML 预览」的 iframe 使用。
// 为什么要独立端口：浏览器对同一主机 HTTP/1.1 并发连接上限 6，web UI 自身
// 长连接已占满；预览 iframe 及其相对资源若走 dsh 宿主会被排队。仅接受回环。
// ---------------------------------------------------------------------------

let previewStaticPort = 0;

function startPreviewStaticServer() {
  const MIME = {
    ".html": "text/html", ".htm": "text/html", ".xhtml": "application/xhtml+xml",
    ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript",
    ".json": "application/json", ".map": "application/json", ".txt": "text/plain", ".md": "text/plain", ".csv": "text/plain",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".ico": "image/x-icon", ".avif": "image/avif",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
    ".wasm": "application/wasm", ".mp4": "video/mp4", ".webm": "video/webm", ".ogg": "video/ogg",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".pdf": "application/pdf", ".xml": "application/xml"
  };
  const TEXT_MIME = /^(text\/|application\/(json|javascript|xhtml\+xml|xml)|image\/svg)/;
  const server = http.createServer((req, res) => {
    const ra = req.socket && req.socket.remoteAddress;
    if (ra !== "127.0.0.1" && ra !== "::1" && ra !== "::ffff:127.0.0.1") {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname.slice(1));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
    if (!path.isAbsolute(p)) {
      res.writeHead(400);
      res.end();
      return;
    }
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const mime = MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": TEXT_MIME.test(mime) ? mime + "; charset=utf-8" : mime,
        "content-length": String(st.size),
        "cache-control": "no-store"
      });
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(p).pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1", () => {
    previewStaticPort = server.address().port;
    log("boot", "预览静态服务已启动: http://127.0.0.1:" + previewStaticPort);
  });
  server.on("error", (err) => log("boot", "预览静态服务失败: " + err.message));
}

async function boot() {
  // Portable builds keep all data next to the exe.
  if (!app.isPackaged && process.env.DSH_DESKTOP_USERDATA) {
    app.setPath('userData', process.env.DSH_DESKTOP_USERDATA);
  } else if (process.env.PORTABLE_EXECUTABLE_DIR) {
    app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data'));
  }

  userDataDir = app.getPath('userData');
  logsDir = path.join(userDataDir, 'logs');
  // DSH_HOME: respect an explicit override; otherwise let dsh use its own
  // default (~/.dsh), so the desktop app shares config/sessions with the CLI.
  dshHome = process.env.DSH_HOME || '';
  // 后端模式（local/wsl）：读取环境变量 / settings.json。wsl 模式在此
  // 解析发行版/安装目录并探活 node/npm，失败抛错（boot 的 catch 弹失败框）。
  resolveBackendConfig();
  fs.mkdirSync(logsDir, { recursive: true });
  if (dshHome) fs.mkdirSync(dshHome, { recursive: true });
  desktopLog = fs.createWriteStream(path.join(logsDir, 'desktop.log'), { flags: 'a' });
  log('boot', `DSH Desktop ${APP_VERSION}  userData=${userDataDir}  dshHome=${dshHome || '(dsh 默认)'}  agent=${dshVersion()}(${dshVersionSource()})`);
  if (isWslMode()) {
    log('boot', `WSL 托管模式已启用：发行版=${wslBackend.distroName()} 安装目录=${wslBackend.installDirLinux()}（UNC: ${wslBackend.uncHome()}）`);
  }

  // 运行状态/看门狗：先读取上一次运行是否干净退出，再写入本次状态。
  const uncleanPrev = detectUncleanPreviousRun();
  writeRunState();
  startWatchdog();

  // 移除原生菜单栏（文件/视图/帮助），全部功能由自绘 chrome 与托盘提供。
  Menu.setApplicationMenu(null);
  startPreviewStaticServer();
  registerChromeIpc();
  createTray();
  // 托盘图标被 explorer 重启等外部因素清掉后，周期性自愈。
  trayRecoveryTimer = setInterval(ensureTray, 30 * 1000);
  if (uncleanPrev) notifyUncleanRestart(uncleanPrev);
  // WSL 托管模式：先建窗口显示加载页（首次 npm 安装可能耗时数分钟），
  // 确保 WSL 内 agent 安装完成后再同步配套插件/补丁（经 UNC 写入 WSL profile）。
  if (isWslMode()) {
    createWindow();
    await wslBackend.ensureInstalled();
  }
  syncCompanionPlugins();
  applyRuntimeFlashFix();
  applyPromptExposeFix();
  if (!isWslMode()) createWindow();
  const home = dshHome || process.env.DSH_HOME || require('node:path').join(require('node:os').homedir(), '.dsh');
  // wsl 托管模式下 WSL 内的 dsh 会自行 heal（首次启动创建 profiles 符号链接闭包）。
  if (!isWslMode()) await repairProfileFallback(home);
  startAndShow()
    .then(() => {
      // Session-completion notifications: watch dsh session logs under the
      // effective DSH_HOME (same config the CLI uses).
      const s = updater.loadSettings(updCtx());
      notifyOnTurnEnd = s.notifyOnTurnEnd !== false;
      const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
      sessionWatcher = new SessionWatcher({
        sessionsDir: path.join(home, 'sessions'),
        log,
        onTurnEnd: (info) => onSessionTurnEnd(info),
      });
      sessionWatcher.start();
      maintainShortcuts();
      warnTempRun();
      startBalanceLoop();
      offerPendingClientUpdate();

      if (!process.env.DSH_DESKTOP_SKIP_AUTO_UPDATE) {
        // dsh agent 更新：启动 15 秒后 + 每 6 小时。
        setTimeout(() => runUpdateFlow(false), 15000).unref();
        setInterval(() => runUpdateFlow(false), AUTO_UPDATE_INTERVAL_MS).unref();
      }
      if (!process.env.DSH_DESKTOP_SKIP_CLIENT_UPDATE) {
        // 客户端（封装）更新：启动 60 秒后 + 每 12 小时。
        setTimeout(() => runClientUpdateFlow(false), 60000).unref();
        setInterval(() => runClientUpdateFlow(false), 12 * 3600 * 1000).unref();
      }
    })
    .catch((err) => handleBootFailure(err));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.deepseek.dsh.desktop');
  // GPU 进程崩溃是最常见的 Electron 静默退出原因（无日志、无弹窗）。
  // 禁用硬件加速可规避大多数显卡驱动兼容性问题，对 DSH 这种文本为主
  // 的应用无明显性能影响。若需排查，注释掉此行并观察崩溃日志。
  app.disableHardwareAcceleration();
  // GPU / 渲染进程崩溃日志：即使无法恢复，至少留下痕迹供排查。
  app.on('gpu-process-crashed', (_e, killed) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] GPU 进程崩溃 (killed=${killed})\n`); } catch {}
  });
  app.on('render-process-gone', (_e, wc, details) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] 渲染进程崩溃: ${details.reason} (exitCode=${details.exitCode})\n`); } catch {}
  });
  app.on('child-process-gone', (_e, details) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] 子进程崩溃: type=${details.type} reason=${details.reason} (exitCode=${details.exitCode})\n`); } catch {}
  });
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('before-quit', () => {
    quitting = true;
    forceQuit = true;
    markCleanExit();
    log('boot', '正在退出，销毁会话浮窗并停止 dsh web 进程树…');
    closeAllFloatWindows();
    killTree(serverProc);
    updater.abort();
    if (sessionWatcher) sessionWatcher.stop();
    if (balanceTimer) clearInterval(balanceTimer);
    if (trayRecoveryTimer) { clearInterval(trayRecoveryTimer); trayRecoveryTimer = null; }
    if (tray) { try { tray.destroy(); } catch {} tray = null; }
  });
  // 关闭窗口后常驻托盘；托盘不存在时才随窗口退出。
  app.on('window-all-closed', () => {
    if (!IS_WIN || !tray) app.quit();
  });
  app.whenReady().then(boot).catch((err) => fatal('应用初始化失败', err));
}
