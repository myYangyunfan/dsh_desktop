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

const { app, BrowserWindow, Menu, Tray, shell, dialog, Notification, ipcMain, clipboard, crashReporter, screen } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');

const updater = require('./updater');
const clientUpdater = require('./client-updater');
const balance = require('./balance');
const wslBackend = require('./wsl-backend');
const { createGpuCrashGuard } = require('./scripts/gpu-crash-guard');
const { togglePluginInPatch } = require('./scripts/plugin-manager-patch');
const { installBuiltinPresets } = require('./scripts/install-minimal-win-preset');
const { SessionWatcher, scanZstdFrames } = require('./session-watcher');
const { RendererRecovery } = require('./renderer-recovery');
const { ensureCoreBundles, CORE_BUNDLE_NAMES } = require('./profile-manifest');
const { dedupePatchEntries, dropBlocksByIds, parseFailedLoaderIds, mapPackagesToPatchIds } = require('./profile-patch-heal');
const { PROFILE_BUNDLE_GUARD_MARKER, PROFILE_BOOT_GUARD_MARKER, bundlePatchRel, verifyBundleDir, packageDirUpward, scanProfileBundles, recoverManifestBundles, applyAppBootBundleGuard, applyProfileBootBundleGuard } = require('./profile-bundle-heal');
const { patchWebSearchBaseUrl } = require('./scripts/patch-web-search-baseurl');
const { patchMenuViewport } = require('./scripts/patch-menu-viewport');
const { patchSessionManage } = require('./scripts/patch-session-manage');
const zlib = require('node:zlib');

// ---------------------------------------------------------------------------
// 启动期崩溃兜底（issue #30「便携版有进程无界面」）：模块加载 / 启动早期
// 的任何未捕获异常都落盘 <userData>/logs/startup-crash.log，且启动完成前置
// 可见错误框（绝不静默失败）。userData 可能尚未重定向，故便携版优先写到
// exe 旁 data/logs，失败再退回系统临时目录。
// ---------------------------------------------------------------------------
let bootFinished = false; // boot() 建窗完成后置 true，之后不再弹启动期错误框
function startupCrashLogFile() {
  let base;
  try {
    base = process.env.PORTABLE_EXECUTABLE_DIR
      ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
      : app.getPath('userData');
  } catch {
    base = path.join(os.tmpdir(), 'dsh-desktop');
  }
  const dir = path.join(base, 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'startup-crash.log');
}
function recordStartupCrash(kind, err) {
  try {
    fs.appendFileSync(startupCrashLogFile(), `[${new Date().toISOString()}] [${kind}] ${(err && err.stack) || err}\n`, 'utf8');
  } catch {}
}
process.on('uncaughtException', (err) => {
  recordStartupCrash('uncaughtException', err);
  if (!bootFinished && err) {
    try {
      dialog.showErrorBox('DSH Desktop 启动异常', String((err && err.message) || err) + '\n\n详细日志：' + startupCrashLogFile());
    } catch {}
  }
});
process.on('unhandledRejection', (reason) => {
  recordStartupCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

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
  const check = () => fileRoots().some((r) => {
    const rp = path.resolve(r);
    return resolved === rp || resolved.startsWith(rp + path.sep);
  });
  if (check()) return true;
  // 缓存可能滞后于新会话：5 分钟 TTL 内新建的会话，其 cwd 尚未进入缓存。
  // 首次判定不通过时强制刷新一次再判，避免误拒新会话的项目文件（预览/还原/打开）。
  // 刷新后的缓存再保持 5 分钟，攻击性探测最多触发每 5 分钟一次重扫。
  fileRootsCache.at = 0;
  return check();
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
let recovery = null; // 渲染进程崩溃/挂起自恢复状态机（renderer-recovery.js）
let crashDumpsDir = "";
let pickerBrowseOverlay = null; // koffi 预检失败时注入的目录选择器降级 overlay
let epermRepairAttempted = false; // EPERM/symlink 自愈每次运行只尝试一次

// ---------------------------------------------------------------------------
// 会话浮窗（分屏）：把会话弹出到独立窗口
// ---------------------------------------------------------------------------
const FLOAT_MAX = 8; // 浮窗总数上限，防资源滥用
const floatWindows = new Set(); // BrowserWindow 集合
const floatBySession = new Map(); // sessionId -> BrowserWindow（同一会话只允许一个浮窗）
let sponsorWindow = null; // 「请作者喝咖啡」独立小窗（单例）

// ---------------------------------------------------------------------------
// 桌面宠物原生小窗（harness-pet）：主窗最小化后宠物仍可见。
// 插件 PiP 方案在 Electron 里不可用（requestWindow 抛 Internal error），
// 这里用独立透明置顶 BrowserWindow 承载同一 Web UI 的「宠物小窗模式」
// （--dsh-pet=1，preload 据此隐藏除宠物外的全部界面）。
// ---------------------------------------------------------------------------
const PET_WINDOW_W = 360;
const PET_WINDOW_H = 420;
let petWindow = null; // 宠物小窗单例（BrowserWindow）
let petAutoOpen = false; // 主窗插件上报：宠物启用且开启「最小化自动弹出小窗」
let petPosTimer = null; // 小窗位置防抖保存定时器

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  try { if (desktopLog) desktopLog.write(line); } catch {}
  if (process.env.DSH_DESKTOP_DEBUG) process.stdout.write(line);
}

// 启动提速：运行时补丁对同一物理文件（profile junction 别名、内置副本、
// overlay 副本）反复整读。按 realpath 归一化 + size/mtime 校验做进程级读
// 缓存；任何写入都会更新 mtime，缓存自动失效，不存在陈旧内容。
const fileReadMemo = new Map(); // realpath -> { size, mtimeMs, text }
const fileRealKeyMemo = new Map(); // path -> realpath（路径本身是固定常量）
function fileRealKey(file) {
  let key = fileRealKeyMemo.get(file);
  if (key === undefined) {
    try { key = fs.realpathSync(file); } catch { key = file; }
    fileRealKeyMemo.set(file, key);
  }
  return key;
}
function readFileCached(file) {
  try {
    const st = fs.statSync(file);
    const key = fileRealKey(file);
    const hit = fileReadMemo.get(key);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.text;
    const text = fs.readFileSync(file, 'utf8');
    fileReadMemo.set(key, { size: st.size, mtimeMs: st.mtimeMs, text });
    return text;
  } catch {
    return null;
  }
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
//
// 启动提速：健康状态下（依赖闭包未变、链接完好）用持久化快照做快速校验
// （逐项 lstat/readlink），全部一致就直接跳过耗时的
// import('@deepseek-ai/dsh-app-boot') + BFS + heal。快照签名包含 dsh
// package.json 的路径/大小/mtime，dsh 升级后自动失效重算（升级后首次
// 启动仍会完整 heal 一次，之后走快速路径）。
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

function fallbackSnapshotPath() {
  return path.join(userDataDir, 'profile-fallback-cache.json');
}

function fallbackAnchorSignature(anchor) {
  try {
    const st = fs.statSync(anchor);
    return anchor + '|' + st.size + '|' + Math.round(st.mtimeMs);
  } catch {
    return anchor + '|?';
  }
}

// 快照当前 fallback 目录：链接名（可能带 @scope 前缀）→ readlink 目标。
// heal 创建的链接里 @scope 目录本身是真实目录、包 junction 在它里面，所以
// 递归收集 `scope/pkg`；任何既不是 junction、也不是 @scope 真实目录的顶层
// 项（云同步还原成真实目录的典型症状）都返回 null，表示需要完整 heal。
function snapshotFallbackLinks(modulesRoot) {
  const entries = {};
  const addLink = (name) => {
    const link = path.join(modulesRoot, name);
    try {
      const st = fs.lstatSync(link);
      if (!st.isSymbolicLink()) return false;
      entries[name] = fs.readlinkSync(link);
      return true;
    } catch {
      return false;
    }
  };
  let top;
  try { top = fs.readdirSync(modulesRoot, { withFileTypes: true }); } catch { return null; }
  for (const e of top) {
    let st;
    try { st = fs.lstatSync(path.join(modulesRoot, e.name)); } catch { return null; }
    if (st.isSymbolicLink()) {
      if (!addLink(e.name)) return null;
      continue;
    }
    if (st.isDirectory() && e.name.startsWith('@')) {
      let inner;
      try { inner = fs.readdirSync(path.join(modulesRoot, e.name)); } catch { return null; }
      for (const pkg of inner) {
        if (!addLink(e.name + '/' + pkg)) return null;
      }
      continue;
    }
    return null;
  }
  return entries;
}

function verifyFallbackSnapshot(home, anchor, cache) {
  if (!cache || cache.v !== 1) return false;
  if (cache.home !== home || cache.anchor !== anchor) return false;
  if (cache.anchorSignature !== fallbackAnchorSignature(anchor)) return false;
  const expected = cache.entries;
  if (!expected || typeof expected !== 'object') return false;
  const names = Object.keys(expected);
  if (names.length === 0) return false;
  const modulesRoot = path.join(home, 'profiles', 'node_modules');
  for (const name of names) {
    const link = path.join(modulesRoot, name);
    try {
      const st = fs.lstatSync(link);
      if (!st.isSymbolicLink()) return false;
      if (fs.readlinkSync(link) !== expected[name]) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function saveFallbackSnapshot(home, anchor, entries) {
  try {
    fs.writeFileSync(fallbackSnapshotPath(), JSON.stringify({
      v: 1,
      home,
      anchor,
      anchorSignature: fallbackAnchorSignature(anchor),
      entries,
    }));
  } catch (err) {
    log('boot', '写 profile fallback 快照失败: ' + err.message);
  }
}

async function repairProfileFallback(home) {
  const anchor = dshPackageJson();
  const modulesRoot = path.join(home, 'profiles', 'node_modules');
  // 快速路径：快照存在且逐项校验通过 → 跳过 import + BFS + heal。
  let cache = null;
  try { cache = JSON.parse(fs.readFileSync(fallbackSnapshotPath(), 'utf8')); } catch {}
  if (verifyFallbackSnapshot(home, anchor, cache)) {
    log('boot', 'profile fallback 健康（快照校验通过，跳过修复）');
    return;
  }
  let bootMod;
  try {
    bootMod = await import('@deepseek-ai/dsh-app-boot');
  } catch (err) {
    log('boot', 'profile fallback 修复模块不可用: ' + err.message);
    return;
  }
  if (typeof bootMod.healProfilesModuleFallback !== 'function') return;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      bootMod.healProfilesModuleFallback(anchor, home);
      if (attempt > 0) log('boot', `profile fallback 已修复（重试 ${attempt} 次）`);
      // 修复成功后记录健康快照，下次启动走快速校验。
      const snap = snapshotFallbackLinks(modulesRoot);
      if (snap) saveFallbackSnapshot(home, anchor, snap);
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
  // 兜底：无论走哪条退出路径（含 app.exit 与异常退出），都同步终结 dsh
  // 进程树，兑现「退出即清理、不留孤儿进程」。正常退出路径此时已是空操作。
  killTreeSync(serverProc);
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

// ---------------------------------------------------------------------------
// dsh 进程树终结
//
// Windows 下 taskkill 不带 /F 只能向 GUI 进程发送 WM_CLOSE，对 node.exe 这类
// 控制台进程完全无效（实测报错 "can only be terminated forcefully"）。旧实现
// 「先优雅（无 /F）、1.5s 后再 /F 强杀」对 dsh web 从未优雅成功过：实际生效的
// 始终是 1.5s 后的 /F。由此产生两个真实缺陷：
//   1. 原地重启（插件市场）：优雅尝试无效，旧进程在「探测端口」时仍存活并
//      占着端口 → chooseStableWebPort 探测失败 → 换新端口 → origin 漂移 →
//      localStorage（会话分组/主题/隐藏输出等偏好）全部丢失；
//   2. 退出路径：主进程退出耗时通常远小于 1.5s（本机实测约 300ms），计时器
//      随主进程消亡永不触发，进程树清理完全依赖 Electron 的隐式行为，无任何保证。
// 因此拆分为两个 API：
//   · killTree —— 异步：立即以 /T /F 终结进程树并等待直接子进程 exit（3s
//     超时兜底）。供「原地重启」路径使用，调用方必须在探测端口前等待其完成。
//   · killTreeSync —— 同步强杀：供应用退出路径使用，保证主进程退出前
//     dsh 进程树已被终结，不依赖计时器或 Electron 隐式行为。
// 两处最终都是 /T /F 强杀，与旧实现实际生效的终结方式一致；只移除了无效的
// 优雅等待与竞态窗口，不改变「dsh 最终收到强杀」这一既有事实。
// ---------------------------------------------------------------------------
function killTreeSync(proc) {
  if (!proc || !proc.pid || proc.exitCode !== null || proc.signalCode !== null) return;
  // WSL 托管模式：WSL 内进程经 pid 文件发 SIGTERM（绝不 wsl --terminate）；
  // 同步退出路径只能触发 stop 并强杀 wsl.exe 转发进程，不等待 WSL 内退出。
  if (isWslMode()) {
    wslBackend.stop().catch((err) => log('killTree', '停止 WSL dsh 失败: ' + String(err && err.message || err)));
    try { proc.kill(); } catch {}
    return;
  }
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    } else {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch {} }
    }
  } catch (err) {
    log('killTree', String(err));
  }
}

async function killTree(proc) {
  // WSL 托管模式：等待 WSL 内进程按 pid 文件真正退出后再进入端口探测；
  // pid 丢失时兜底杀掉 wsl.exe 转发进程。
  if (isWslMode()) {
    try { await wslBackend.stop(); } catch (err) { log('killTree', '停止 WSL dsh 失败: ' + String(err && err.message || err)); }
    if (proc && proc.pid && proc.exitCode === null) {
      try { proc.kill(); } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    return;
  }
  return new Promise((resolve) => {
    if (!proc || !proc.pid || proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const finish = () => {
      proc.removeListener('exit', finish);
      resolve();
    };
    proc.once('exit', finish);
    if (!IS_WIN) {
      // 非 Windows：保持原有语义（SIGTERM），等待进程退出（超时兜底）。
      try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch {} }
      const timer = setTimeout(finish, 3000);
      if (timer.unref) timer.unref();
      return;
    }
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch (err) {
      log('killTree', String(err));
      finish();
      return;
    }
    // 兜底：taskkill 异常或进程未按时退出时，不得让重启流程永久挂起。
    const timer = setTimeout(finish, 3000);
    if (timer.unref) timer.unref();
  });
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

// ---------------------------------------------------------------------------
// koffi 预检与目录选择器降级：koffi 3.1.3/3.1.4 的 win32-x64 预编译二进制在
// 部分 Windows 机器上会在 load 时原生崩溃（0xC0000005），目录选择器 worker
// 会无消息退出。启动前用内置 node 在子进程里做一次 FFI 冒烟；失败则注入
// browse 后端 overlay，让客户机器不再卡在 native 目录选择器上。
// ---------------------------------------------------------------------------
function koffiPreflightScript() {
  return path.join(__dirname, 'scripts', 'koffi-preflight.cjs');
}

function pickerBrowseOverlayPath() {
  return path.join(userDataDir, 'picker-browse.overlay.yml');
}

function runKoffiPreflight() {
  if (!IS_WIN) return true;
  const script = koffiPreflightScript();
  if (!fs.existsSync(script)) {
    log('preflight', 'koffi 预检脚本不存在，跳过（视为通过）');
    return true;
  }
  // 启动提速：koffi 冒烟探针的结果只取决于壳自带二进制（node.exe、探针脚本、
  // koffi 预编译模块）。同一签名在本机已通过时直接复用缓存，省去每次启动
  // spawnSync 子进程（约 100ms+）。只缓存「通过」：失败不缓存，下次启动仍会
  // 重试，保证被安全软件误拦等瞬时失败可以自恢复。
  const signature = koffiPreflightSignature();
  if (koffiCachedPass(signature)) {
    log('preflight', 'koffi 预检缓存命中（同签名上次已通过），跳过子进程探测');
    return true;
  }
  try {
    const r = spawnSync(nodeExe(), [script], { timeout: 20000, windowsHide: true, encoding: 'utf8' });
    const output = String((r.stdout || '') + (r.stderr || '')).trim();
    if (r.error) {
      log('preflight', 'koffi 预检无法执行: ' + r.error.message);
      return false;
    }
    if (r.status === 0) {
      saveKoffiPreflightPass(signature);
      log('preflight', 'koffi 预检通过');
      return true;
    }
    log('preflight', `koffi 预检失败（退出码 0x${(r.status >>> 0).toString(16)}）: ${output.slice(0, 400)}`);
    return false;
  } catch (err) {
    log('preflight', 'koffi 预检异常: ' + err.message);
    return false;
  }
}

// koffi 预检缓存：签名 = 壳版本 + node.exe + 探针脚本 + koffi 包内全部 .node
// 二进制（路径/大小/mtime）。任一环节随应用升级或文件被替换而变化 → 缓存
// 自动失效，下一次启动重新真实预检。
function koffiPreflightCachePath() {
  return path.join(userDataDir, 'koffi-preflight-cache.json');
}

function koffiPreflightSignature() {
  const parts = [APP_VERSION];
  const statParts = [nodeExe(), koffiPreflightScript()];
  const koffiDir = path.join(__dirname, 'node_modules', 'koffi');
  statParts.push(path.join(koffiDir, 'index.cjs'), path.join(koffiDir, 'package.json'));
  const collectNode = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 4) collectNode(p, depth + 1); continue; }
      if (e.name.endsWith('.node')) statParts.push(p);
    }
  };
  collectNode(koffiDir, 0);
  for (const p of statParts) {
    try {
      const st = fs.statSync(p);
      parts.push(p + '|' + st.size + '|' + Math.round(st.mtimeMs));
    } catch {
      parts.push(p + '|?');
    }
  }
  return parts.join('\n');
}

function koffiCachedPass(signature) {
  try {
    const c = JSON.parse(fs.readFileSync(koffiPreflightCachePath(), 'utf8'));
    return !!(c && c.v === 1 && c.signature === signature && c.ok === true);
  } catch {
    return false;
  }
}

function saveKoffiPreflightPass(signature) {
  try {
    fs.writeFileSync(koffiPreflightCachePath(), JSON.stringify({
      v: 1,
      signature,
      ok: true,
      at: new Date().toISOString(),
    }));
  } catch (err) {
    log('preflight', '写 koffi 预检缓存失败: ' + err.message);
  }
}

const PICKER_BROWSE_OVERLAY_MARKER = '# DSH-DESKTOP-AUTO: picker browse fallback';

function enablePickerBrowseOverlay() {
  const file = pickerBrowseOverlayPath();
  const content = [
    PICKER_BROWSE_OVERLAY_MARKER,
    '# koffi 预检未通过：禁用 native 目录选择器，改用浏览器内 browse 选择器。',
    '- id: directory-picker',
    '  disabled: true',
    '- insert:',
    '    - id: directory-picker-browse',
    "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
    '    - id: directory-picker-browse-client',
    "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
    '',
  ].join('\n');
  try {
    let prev = '';
    try { prev = fs.readFileSync(file, 'utf8'); } catch {}
    if (prev === content) {
      pickerBrowseOverlay = file;
      return;
    }
    fs.writeFileSync(file, content);
    pickerBrowseOverlay = file;
    log('preflight', '已启用目录选择器降级 overlay: ' + file);
  } catch (err) {
    log('preflight', '写入目录选择器降级 overlay 失败: ' + err.message);
  }
}

function clearAutoPickerBrowseOverlay() {
  const file = pickerBrowseOverlayPath();
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(PICKER_BROWSE_OVERLAY_MARKER)) return;
    fs.rmSync(file, { force: true });
    if (pickerBrowseOverlay === file) pickerBrowseOverlay = null;
    log('preflight', 'koffi 预检已恢复，移除目录选择器降级 overlay');
  } catch (err) {
    log('preflight', '移除目录选择器降级 overlay 失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// 安全启动：dsh web 退出码 1 且日志含 plugin tree 加载失败时，解析出失败的
// patch 插件 id，写入 --patch overlay 禁用后重试。overlay 不修改用户 patch。
// ---------------------------------------------------------------------------
function dshWebLogPath() {
  return path.join(logsDir, 'dsh-web.log');
}

// 日志体积封顶与尾部读取（资源治理）：desktop.log / dsh-web.log 无界追加，
// 长期运行会膨胀到数百 MB。启动时超过上限只保留尾部；读取侧统一改为
// 「fd 定位读末尾定长字节」，把诊断路径的成本从 O(日志大小) 降为 O(1)。
const MAX_LOG_BYTES = 4 * 1024 * 1024; // 超过即封顶
const LOG_KEEP_BYTES = 256 * 1024; // 封顶后保留的尾部字节
const LOG_TAIL_READ_BYTES = 256 * 1024; // 诊断读取的最多字节

/** 读取文件末尾最多 maxBytes 字节；文件缺失返回空串。 */
function readFileTailText(file, maxBytes) {
  try {
    const st = fs.statSync(file);
    if (st.size <= 0) return '';
    const len = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(file, 'r');
    let pos = 0;
    try {
      while (pos < len) {
        const n = fs.readSync(fd, buf, pos, len - pos, st.size - len + pos);
        if (n <= 0) break;
        pos += n;
      }
    } finally {
      fs.closeSync(fd);
    }
    return buf.subarray(0, pos).toString('utf8');
  } catch {
    return '';
  }
}

/** 启动时封顶日志：超过 MAX_LOG_BYTES 则原子地只保留尾部 LOG_KEEP_BYTES。 */
function capLogFile(file) {
  try {
    const st = fs.statSync(file);
    if (st.size <= MAX_LOG_BYTES) return;
    const keep = Math.min(st.size, LOG_KEEP_BYTES);
    const tail = Buffer.alloc(keep);
    const fd = fs.openSync(file, 'r');
    let pos = 0;
    try {
      while (pos < keep) {
        const n = fs.readSync(fd, tail, pos, keep - pos, st.size - keep + pos);
        if (n <= 0) break;
        pos += n;
      }
    } finally {
      fs.closeSync(fd);
    }
    const tmp = file + '.cap';
    fs.writeFileSync(tmp, tail.subarray(0, pos));
    fs.renameSync(tmp, file);
    log('boot', '日志已封顶: ' + file + ' (' + st.size + ' -> ' + pos + ' bytes)');
  } catch (err) {
    log('boot', '日志封顶失败 ' + file + ': ' + err.message);
  }
}

/** 清理超过保留期的崩溃转储（只动 *.dmp，settings.dat 与本次新转储不受影响）。 */
function pruneOldCrashDumps() {
  const MAX_DMP_AGE_MS = 14 * 24 * 3600 * 1000;
  try {
    const now = Date.now();
    for (const e of fs.readdirSync(crashDumpsDir)) {
      if (!e.endsWith('.dmp')) continue;
      const p = path.join(crashDumpsDir, e);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > MAX_DMP_AGE_MS) {
          fs.rmSync(p, { force: true });
          log('boot', '已清理过期崩溃转储: ' + e);
        }
      } catch {}
    }
  } catch {}
}

function readDshWebLogTail(maxLines = 80) {
  try {
    const file = dshWebLogPath();
    let size = 0;
    try { size = fs.statSync(file).size; } catch { return ''; }
    const text = readFileTailText(file, LOG_TAIL_READ_BYTES);
    // 从文件中部起读时首行可能是半行：丢弃，避免产生半行/乱码 token。
    const lines = text.split(/\r?\n/);
    if (size > LOG_TAIL_READ_BYTES && lines.length > 0) lines.shift();
    return lines.filter(Boolean).slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

function logTailSnippet(maxLines = 20) {
  const tail = readDshWebLogTail(maxLines);
  return tail ? '\n\n最近日志：\n' + tail : '';
}

// loader 失败条目的三种 id 形态解析已收口到 profile-patch-heal.js
// （parseFailedLoaderIds，含 issue #17 的 "duplicate loader entry id: X" 与
// 括号包名形态），这里不再保留本地实现。

function profilePatchText() {
  const patchFile = path.join(dshHome || path.join(os.homedir(), '.dsh'), 'profiles', 'web', 'cordis.patch.yml');
  try { return fs.readFileSync(patchFile, 'utf8'); } catch { return ''; }
}

function profilePatchIds() {
  const text = profilePatchText();
  const ids = new Set();
  const re = /(?:^|\n)\s*-\s*id:\s*([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) ids.add(m[1]);
  return [...ids];
}

function findFailedPatchPlugins() {
  const tokens = parseFailedLoaderIds(readDshWebLogTail(120));
  const known = new Set(profilePatchIds());
  // 括号包名（@scope/pkg）不是 patch id：先映射回条目 id 再参与 overlay 判定；
  // 其余 token（hash 形态与 duplicate loader entry id: X 形态）按既有逻辑过滤。
  const packages = tokens.filter((t) => t.includes('/'));
  const mapped = mapPackagesToPatchIds(profilePatchText(), packages);
  return [...new Set([...tokens.filter((t) => !t.includes('/')), ...mapped])].filter((id) => known.has(id));
}

function safeBootOverlayPath() {
  return path.join(userDataDir, 'safe-boot.overlay.yml');
}

function ensureSafeBootOverlay(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const file = safeBootOverlayPath();
  const existing = new Set();
  try {
    const text = fs.readFileSync(file, 'utf8');
    const re = /(?:^|\n)\s*-\s*id:\s*([A-Za-z0-9_-]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) existing.add(m[1]);
  } catch {}
  const merged = [...new Set([...existing, ...ids])];
  const content = [
    '# DSH Desktop 安全启动 overlay（自动生成）：以下插件启动失败，已被自动禁用。',
    '# 修复插件后可删除本文件恢复。',
    ...merged.map((id) => `- id: ${id}\n  disabled: true`),
    '',
  ].join('\n');
  try {
    fs.writeFileSync(file, content);
    log('boot', '已生成安全启动 overlay（禁用: ' + merged.join(', ') + '）: ' + file);
    return file;
  } catch (err) {
    log('boot', '写入安全启动 overlay 失败: ' + err.message);
    return null;
  }
}

function notifySafeBoot(ids) {
  try {
    const n = new Notification({
      title: 'DSH Desktop 安全模式',
      body: '检测到启动配置错误，已自动禁用问题插件：' + ids.join(', ') + '。修复后可删除 ' + safeBootOverlayPath(),
      icon: path.join(__dirname, 'assets', 'icon.png'),
    });
    n.show();
  } catch (err) {
    log('boot', '安全模式通知失败: ' + err.message);
  }
}

// issue #48：profile manifest 重置是数据丢失类事件，除了日志还要给用户可见
// 提示。集成测试实例与用户正在使用的桌面端并存（showBox 抑制的同一原因），
// 测试态不弹真实通知，断言走 desktop.log。
function notifyManifestResetRecovered(recovered) {
  if (process.env.DSH_DESKTOP_TEST === '1') return;
  try {
    const n = new Notification({
      title: 'DSH Desktop 配置自愈',
      body: Array.isArray(recovered) && recovered.length > 0
        ? 'profile 配置损坏，已备份并重建；检测到您安装的插件并已自动恢复：' + recovered.join(', ')
        : 'profile 配置损坏，已备份并重建（原文件保留在 profile 目录的 .broken- 备份中，可对比找回原配置）',
      icon: path.join(__dirname, 'assets', 'icon.png'),
    });
    n.show();
  } catch (err) {
    log('boot', '配置自愈通知失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// EPERM/symlink 自愈：部分 Windows 环境下 profiles/node_modules 的目录联接
// 创建被拒绝（EPERM），或上次失败留下半成品实体目录。这里只处理自动生成的
// profiles/node_modules：改名备份后重跑官方 healProfilesModuleFallback 重建
// 联接，绝不触碰 profiles/web、会话与设置。
// ---------------------------------------------------------------------------
function dshWebLogHasEpermSymlink() {
  const tail = readDshWebLogTail(300);
  return /EPERM: operation not permitted, symlink[\s\S]{0,500}profiles[\\/]node_modules/i.test(tail);
}

function backupAndRebuildProfileModules(home) {
  const modules = path.join(home, 'profiles', 'node_modules');
  if (!fs.existsSync(modules)) return true;
  const backup = `${modules}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(modules, backup);
    log('boot', 'EPERM/symlink 自愈：已将 profiles/node_modules 改名备份为 ' + backup);
    return true;
  } catch (err) {
    log('boot', 'EPERM/symlink 自愈：改名备份失败 ' + err.message);
    return false;
  }
}

// 对话框串行化：服务启动失败/更新/错误弹窗不会同时叠成多个，
// 避免「重启后连续弹出多个启动失败窗口」。
let boxChain = Promise.resolve();
function showBox(opts) {
  if (process.env.DSH_DESKTOP_TEST === '1') {
    // 集成测试模式：不弹真实对话框。失败弹窗会直接出现在用户屏幕上（测试
    // 实例与用户正在用的桌面端并存），且模态框会挂起测试场景直到超时。
    // 改为记录日志并按 cancelId 处理（boot 失败弹窗 → 退出，场景快速失败）。
    const cancel = opts.cancelId != null ? opts.cancelId : (Array.isArray(opts.buttons) ? opts.buttons.length - 1 : 0);
    log('test', 'showBox 已抑制（测试模式）: ' + (opts.title || '') + ' :: ' + (opts.message || '') + ' :: ' + String(opts.detail || '').slice(0, 300));
    return Promise.resolve({ response: cancel, checkboxChecked: false });
  }
  const run = () => {
    if (mainWindow && !mainWindow.isDestroyed()) return dialog.showMessageBox(mainWindow, opts);
    return dialog.showMessageBox(opts);
  };
  const p = boxChain.then(run, run);
  boxChain = p.then(() => {}, () => {});
  return p;
}

// 选择一个尽量稳定的 127.0.0.1 端口并保存到 settings.json。
// Web UI 的部分偏好（如左侧会话分组方式）存在 localStorage，而
// localStorage 按 origin 隔离；每次 --port 0 都会换 origin，导致偏好丢失。
const CHROMIUM_RESTRICTED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6697, 10080,
]);

function restrictedPortOf(url) {
  try {
    const u = new URL(url);
    const port = Number(u.port || (u.protocol === 'https:' ? '443' : '80'));
    return CHROMIUM_RESTRICTED_PORTS.has(port) ? port : 0;
  } catch {
    return 0;
  }
}

// 集成测试专用：DSH_DESKTOP_TEST_FORCE_UNSAFE=1 时把第一次探测到的端口
// 强制视为受限端口（6000），端到端验证「重启换端口」交接路径。
let testForceUnsafeOnce = process.env.DSH_DESKTOP_TEST_FORCE_UNSAFE === '1';

function chooseStableWebPort() {
  return new Promise((resolve) => {
    const settings = updater.loadSettings(updCtx());
    const preferred = Number(settings.webPort) || 0;
    const save = (port) => {
      // 启动提速：端口与已保存值一致时不写盘，避免每次启动都改写
      // settings.json（无意义的写入 + mtime 抖动）。
      if (settings.webPort !== port) {
        settings.webPort = port;
        updater.saveSettings(updCtx(), settings);
      }
      resolve(port);
    };
    const tryPort = (port, done) => {
      const probe = net.createServer();
      const finish = (ok) => {
        probe.removeAllListeners();
        probe.close(() => done(ok));
      };
      probe.once('error', () => finish(false));
      probe.listen(port, '127.0.0.1', () => finish(true));
    };
    const pickFree = (retriesLeft = 5) => {
      const probe = net.createServer();
      probe.once('error', () => {
        if (retriesLeft > 0) pickFree(retriesLeft - 1);
        else save(0);
      });
      probe.listen(0, '127.0.0.1', () => {
        const port = probe.address().port;
        probe.close(() => {
          if (CHROMIUM_RESTRICTED_PORTS.has(port) && retriesLeft > 0) pickFree(retriesLeft - 1);
          else save(port);
        });
      });
    };
    if (preferred && !CHROMIUM_RESTRICTED_PORTS.has(preferred)) tryPort(preferred, (ok) => ok ? save(preferred) : pickFree());
    else pickFree();
  });
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

async function startServer(unsafePortRetries = 4, overlays = []) {
  // M1 修复：重入前先终结旧进程并等待其真正退出，避免孤儿 harness 同时写
  // 同一 DSH_HOME。等待必须在端口探测之前完成：taskkill /F 异步生效，若旧
  // 进程仍占着端口，chooseStableWebPort 会探测失败并换新端口，导致 origin
  // 漂移（localStorage 偏好丢失）。旧的「先选端口、后杀进程」顺序正是
  // 插件市场每次重启都换端口的根因。
  if (serverProc && !serverProc.killed && !quitting) {
    log('dsh', 'startServer 重入：先终结旧进程再启动');
    await killTree(serverProc);
    serverProc = null;
  }
  healProfilePatch();
  logProfileBundleHealth();
  if (isWslMode()) {
    // WSL 托管模式：经 wsl.exe 在 WSL 内启动 dsh web（仍 --port 0 由 WSL 内 OS
    // 分配；稳定端口持久化只作用于本地 spawn）。受限端口重启走同一递归。
    if (!wslBackend.isReady()) {
      return Promise.reject(new Error('WSL 托管后端未就绪: ' + wslBackend.lastError()));
    }
    const out = fs.createWriteStream(path.join(logsDir, 'dsh-web.log'), { flags: 'a' });
    log('dsh', `WSL 托管模式：在 ${wslBackend.installDirLinux()}/agent 内启动 dsh web`);
    const proc = wslBackend.spawnServer();
    serverProc = proc;
    return watchServerProc(proc, out, { expectedPort: null, unsafePortRetries, overlays });
  }
  const webPort = await chooseStableWebPort();
  return new Promise((resolve, reject) => {
    const nodeBin = nodeExe();
    const bin = dshBin();
    if (!fs.existsSync(nodeBin)) {
      return reject(new Error(
        '找不到内置 Node 运行时: ' + nodeBin + '\n' +
        (app.isPackaged ? '安装包可能不完整，请重新安装。' : '开发模式请先运行: npm run fetch-node')
      ));
    }
    const out = fs.createWriteStream(path.join(logsDir, 'dsh-web.log'), { flags: 'a' });
    log('dsh', `启动: "${nodeBin}" "${bin}" web --host 127.0.0.1 --port ${webPort}`);
    // --use-system-ca: 让 dsh web 进程信任系统证书库（代理/MITM 场景下内置 node 的
    // 默认 CA 无法验证，导致插件市场等对外 fetch 失败）。
    const patchArgs = overlays
      .filter((p) => typeof p === 'string' && p && fs.existsSync(p))
      .flatMap((p) => ['--patch', p]);
    const proc = spawn(nodeBin, ['--use-system-ca', bin, 'web', '--host', '127.0.0.1', '--port', String(webPort), ...patchArgs], {
      cwd: userDataDir,
      env: childEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc = proc;
    watchServerProc(proc, out, { expectedPort: webPort, unsafePortRetries, overlays }).then(resolve, reject);
  });
}

// 等待 dsh web 子进程 stdout 出现就绪 URL 行；进程提前退出 / 启动超时则拒绝。
// 退出时若服务已就绪过（webUrl 已设）且非主动重启，弹「DSH 服务已停止」对话框。
// opts.expectedPort 为 null（WSL 托管）时不参与稳定端口持久化；受限端口重启
// 两种模式共用（WSL 下经 killTree → pid 文件终止后递归重起）。
function watchServerProc(proc, out, opts = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handedOff = false; // 受限端口重启：本实例的退出不再影响外层 Promise/弹窗
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
        if (!m) continue;
        let blocked;
        if (testForceUnsafeOnce) {
          testForceUnsafeOnce = false;
          blocked = 6000; // 测试钩子：仅第一次强制视为受限端口
        } else {
          blocked = restrictedPortOf(m[1]);
        }
        if (blocked && opts.unsafePortRetries > 0) {
          // 端口命中 Chromium 受限列表：结束该实例重启换端口（有上限）。
          // 标记 handedOff，本实例的 exit 事件不得提前 reject 外层 Promise
          // 或弹出「服务已停止」对话框，结果交由递归重启决定。
          handedOff = true;
          log('dsh', `端口 ${blocked} 属于 Chromium 受限端口（ERR_UNSAFE_PORT），重启服务换端口（剩余重试 ${opts.unsafePortRetries} 次）`);
          killTree(proc);
          setTimeout(() => {
            if (quitting) return finish(reject, new Error('应用正在退出'));
            startServer(opts.unsafePortRetries - 1, opts.overlays).then(
              (url) => finish(resolve, url),
              (err) => finish(reject, err)
            );
          }, 600);
          return;
        }
        // 稳定端口：若 dsh 最终监听端口与请求的不同（极端兜底），以实际为准并保存。
        try {
          const actual = Number(new URL(m[1]).port) || 0;
          if (opts.expectedPort != null && actual > 0 && actual !== opts.expectedPort) {
            const settings = updater.loadSettings(updCtx());
            settings.webPort = actual;
            updater.saveSettings(updCtx(), settings);
          }
        } catch {}
        finish(resolve, m[1]);
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
      if (!handedOff) {
        finish(reject, new Error(`dsh web 启动失败（退出码 ${code}）。日志: ${path.join(logsDir, 'dsh-web.log')}`));
      }
      if (!quitting && !intentional && !handedOff && webUrl && mainWindow && !mainWindow.isDestroyed()) {
        showBox({
          type: 'error',
          title: 'DSH 服务已停止',
          message: 'DeepSeek Harness 服务意外退出。',
          detail: '日志文件：' + path.join(logsDir, 'dsh-web.log') + logTailSnippet(),
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

function startAndShow(overlays = []) {
  const merged = [];
  if (pickerBrowseOverlay && fs.existsSync(pickerBrowseOverlay)) merged.push(pickerBrowseOverlay);
  for (const p of overlays) {
    if (typeof p === 'string' && p && fs.existsSync(p) && !merged.includes(p)) merged.push(p);
  }
  return startServer(4, merged)
    .then(waitUntilUp)
    .then((url) => {
      webUrl = url;
      log('boot', 'Web UI 就绪: ' + url);
      if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.loadURL(url).then(() => url);
      return url;
    });
}

// 插件市场式原地重启：终结旧 dsh web 进程树并等待其真正退出，再重新启动。
// 等待是必需的：taskkill /F 异步生效，旧进程退出前仍占着端口，端口探测会
// 失败并换新端口（origin 漂移 → localStorage 偏好丢失）。集成测试通道的
// 'restart-service' 命令与 chrome:restart-service IPC 共用本函数。
async function restartService() {
  if (!serverProc || restartingServer) return { ok: false, error: 'not-running' };
  log('service', '请求重启 dsh web 服务');
  restartingServer = true;
  try {
    await killTree(serverProc);
    const url = await startAndShow();
    log('service', 'dsh web 服务已重启: ' + url);
    return { ok: true, url };
  } catch (err) {
    log('service', '重启失败: ' + ((err && err.message) || err));
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    restartingServer = false;
  }
}

// 探测 overlay agent 本身能否运行（--version 快速退出 0 即视为可运行）。
// 用于区分「更新包坏了」与「其它原因（profile patch / 配置损坏等）导致的启动
// 失败」，避免把后者误判为更新问题、诱导用户回退一个健康的新版本。
async function probeOverlayAgent(bin) {
  return new Promise((resolve) => {
    const nodeBin = nodeExe();
    if (!fs.existsSync(nodeBin) || !fs.existsSync(bin)) return resolve(false);
    let child;
    try {
      child = spawn(nodeBin, [bin, '--version'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 15000,
      });
    } catch {
      return resolve(false);
    }
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

// 从 dsh-web.log 尾部扫描 settings 文档损坏的报错行（settings.yaml 整体无法
// 解析/非 map 时报 `settings-file: ...`，settings 服务起不来 → 一批插件 fiber
// 失败 → dsh web 退出）。返回损坏文件路径与该行。
function scanWebLogForSettingsFailure() {
  try {
    const file = path.join(logsDir, 'dsh-web.log');
    if (!fs.existsSync(file)) return null;
    // 只读末尾定长字节：settings-file 报错行属于最近一次失败启动，必在尾部；
    // 避免日志膨胀后整文件读入的线性成本。
    const text = readFileTailText(file, LOG_TAIL_READ_BYTES);
    const lines = text.split(/\r?\n/);
    const hit = lines.slice(-400).reverse().find((l) => l.includes('settings-file:'));
    if (!hit) return null;
    const m = hit.match(/settings-file: (?:invalid document at )?([^\n]+)/);
    if (!m) return null;
    let filePath = m[1].trim();
    const mapIdx = filePath.indexOf(' must be a map');
    if (mapIdx >= 0) filePath = filePath.slice(0, mapIdx);
    else {
      const idx = filePath.lastIndexOf(':');
      if (idx > 1) filePath = filePath.slice(0, idx);
    }
    return { filePath, line: hit.trim() };
  } catch {
    return null;
  }
}
async function handleBootFailure(err, overlays = []) {
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
        startAndShow(overlays).catch((e2) => fatal('DeepSeek Harness 启动失败', e2));
      } else if (response === 1) {
        startAndShow(overlays).catch((e2) => handleBootFailure(e2, overlays));
      } else {
        app.quit();
      }
    });
    return;
  }
  const ov = updater.overlayBinPath(updCtx());
  if (ov && fs.existsSync(ov)) {
    // 先探测 overlay 本身能否运行。可运行 → 启动失败另有原因（如损坏的
    // cordis.patch.yml，现在已在启动前自愈），不归咎于更新，走通用失败弹窗。
    const runs = await probeOverlayAgent(ov);
    if (!runs) {
      showBox({
        type: 'error',
        title: 'DeepSeek Harness 启动失败',
        message: '更新后的 agent 无法启动。',
        detail: (err && err.message || String(err)) + logTailSnippet() + '\n\n可回退到内置版本继续使用。',
        buttons: ['回退到内置版本并重试', '重试', '退出'],
        defaultId: 0,
        cancelId: 2,
      }).then(({ response }) => {
        if (response === 0) {
          updater.rollback(updCtx());
          startAndShow(overlays).catch((e2) => fatal('DeepSeek Harness 启动失败', e2));
        } else if (response === 1) {
          startAndShow(overlays).catch((e2) => handleBootFailure(e2, overlays));
        } else {
          app.quit();
        }
      });
      return;
    }
    log('boot', 'overlay agent 可运行（--version 正常），启动失败不归咎于更新');
  }
  // EPERM/symlink 自愈（客户手册场景）：先于插件安全模式处理。
  if (!epermRepairAttempted && dshWebLogHasEpermSymlink()) {
    epermRepairAttempted = true;
    const home = dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    if (backupAndRebuildProfileModules(home)) {
      return repairProfileFallback(home).then(() =>
        startAndShow(overlays).catch((e2) => handleBootFailure(e2, overlays))
      );
    }
  }
  // 启动配置自愈：解析日志中加载失败的 patch 插件并写入安全 overlay 重试，
  // 让客户机器遇到「启动项配置生成错误」时也能打开应用。
  const failedIds = findFailedPatchPlugins();
  const safeOverlay = ensureSafeBootOverlay(failedIds);
  if (safeOverlay && !overlays.includes(safeOverlay)) {
    notifySafeBoot(failedIds);
    const next = [...overlays, safeOverlay];
    return startAndShow(next).catch((e2) => handleBootFailure(e2, next));
  }
  // settings.yaml 整体损坏（settings 服务起不来）时给出「备份并重置」的一键
  // 恢复（用户同意才动文件），而不是让用户面对无从下手的失败弹窗。
  const settingsFail = scanWebLogForSettingsFailure();
  if (settingsFail && fs.existsSync(settingsFail.filePath)) {
    showBox({
      type: 'error',
      title: 'DeepSeek Harness 启动失败',
      message: '检测到 settings 配置文件损坏。',
      detail: (err && err.message || String(err)) + '\n\n' + settingsFail.line + '\n\n可备份并重置该文件后重试（原文件保留为 .broken-<时间戳> 备份）。',
      buttons: ['备份并重置 settings 后重试', '重试', '退出'],
      defaultId: 0,
      cancelId: 2,
    }).then(({ response }) => {
      if (response === 0) {
        try {
          fs.renameSync(settingsFail.filePath, settingsFail.filePath + '.broken-' + Date.now());
          log('boot', 'settings 已备份并重置: ' + settingsFail.filePath);
        } catch (e) {
          log('boot', 'settings 备份重置失败: ' + e.message);
        }
        startAndShow(overlays).catch((e2) => handleBootFailure(e2, overlays));
      } else if (response === 1) {
        startAndShow(overlays).catch((e2) => handleBootFailure(e2, overlays));
      } else {
        app.quit();
      }
    });
    return;
  }
  fatal('DeepSeek Harness 启动失败', err);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(opts = {}) {
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
  const win = mainWindow;

  win.loadFile(path.join(__dirname, 'assets', 'loading.html'));
  // startHidden：崩溃恢复重建窗口时保持「隐藏到托盘」状态，不突然弹出窗口。
  win.once('ready-to-show', () => { if (!win.isDestroyed() && !opts.startHidden) win.show(); });
  // Keep the app brand in the OS title bar (the web UI sets its own <title>).
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('DSH Desktop');
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

  // 高频重复的 warning/error 会变成同步磁盘写入，明显拖慢渲染。
  // 同一签名 5 秒内只落一条日志。
  const pageConsoleThrottle = new Map();
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level === "error" || level === "warning") {
      const key = `${level}:${message}:${sourceId || "unknown"}:${line}`;
      const now = Date.now();
      if (now - (pageConsoleThrottle.get(key) || 0) < 5000) return;
      if (pageConsoleThrottle.size > 500) pageConsoleThrottle.clear();
      pageConsoleThrottle.set(key, now);
      log("page", `[${level}] ${message} (${sourceId || "unknown"}:${line})`);
    }
  });
  // 渲染进程崩溃/挂起的自恢复由 renderer-recovery.js 统一接管
  // （boot 阶段经 wireWindowRecovery() 挂载），这里不再只记日志。

  // 窗口显示（从托盘/最小化/二次启动恢复）时刷新余额，切回来即是最新。
  win.on('show', () => maybeRefreshBalance());

  // 页面（重）加载完成后补推一次余额缓存（reload/恢复重建后插件订阅事件
  // 已失效，直接推送当前缓存即可立即恢复显示）。
  win.webContents.on('did-finish-load', () => {
    if (balanceCache) {
      try { win.webContents.send('dsh:balance', balanceCache); } catch {}
    }
  });

  // 移除菜单栏后仍保留的键盘快捷键。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (input.key === 'F11') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'F12') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && input.shift && key === 'i') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && key === 'r') { reloadMainWindow(); event.preventDefault(); }
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

  // 主窗最小化且宠物启用「最小化自动弹出小窗」→ 自动打开宠物小窗
  // （小窗为独立置顶窗口，主窗最小化/隐藏不影响其显示）。
  mainWindow.on('minimize', () => {
    if (petAutoOpen && (!petWindow || petWindow.isDestroyed())) createPetWindow();
  });

  mainWindow.on('closed', () => {
    // 崩溃恢复会销毁并重建主窗：旧窗口的 closed 可能晚于新窗口创建，
    // 必须校验身份，避免把新的 mainWindow 全局引用置空。
    if (mainWindow === win) mainWindow = null;
    if (sponsorWindow && !sponsorWindow.isDestroyed()) sponsorWindow.destroy();
    sponsorWindow = null;
  });
}

// ---------------------------------------------------------------------------
// 渲染进程自恢复：装配 renderer-recovery 状态机（Issue #9 根治修复）
// ---------------------------------------------------------------------------

function initRendererRecovery() {
  if (recovery) return recovery;
  const opts = {
    log: (msg) => log('recovery', msg),
    isQuitting: () => quitting,
    isServerAlive: () => !!serverProc && serverProc.exitCode === null && !serverProc.killed,
    getTarget: () => (webUrl ? { kind: 'url', url: webUrl } : null),
    loadingPage: path.join(__dirname, 'assets', 'loading.html'),
    recoveryPage: path.join(__dirname, 'assets', 'recovery.html'),
    rebuildMainWindow: ({ startHidden } = {}) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      createWindow({ startHidden: !!startHidden });
      wireWindowRecovery();
      return mainWindow;
    },
    waitServerUp: (maxMs) => {
      if (!webUrl) return Promise.reject(new Error('webUrl 未知'));
      return waitUntilUp(webUrl, maxMs);
    },
    onGaveUp: (lastFailure) => {
      writeRunState({ renderer: { state: 'gave-up', lastFailure, at: new Date().toISOString() } });
    },
    onStable: () => {
      writeRunState({ renderer: { state: 'healthy', at: new Date().toISOString() } });
    },
    notify: (title, body) => {
      try {
        const n = new Notification({
          title,
          body,
          icon: path.join(__dirname, 'assets', 'icon.png'),
        });
        n.on('click', () => showMainWindow());
        n.show();
      } catch (err) {
        log('recovery', '通知发送失败: ' + err.message);
      }
    },
  };
  // 集成测试专用：缩短「稳定期」，加快测试节奏。生产环境恒为默认 30s。
  if (process.env.DSH_DESKTOP_TEST && process.env.DSH_DESKTOP_TEST_STABILITY_MS) {
    opts.STABILITY_MS = Number(process.env.DSH_DESKTOP_TEST_STABILITY_MS);
  }
  recovery = new RendererRecovery(opts);
  return recovery;
}

function wireWindowRecovery() {
  if (recovery && mainWindow && !mainWindow.isDestroyed()) recovery.attach(mainWindow, 'main');
}

// 统一的「重新加载」入口：处于恢复页（已放弃自动恢复）时走恢复流程，
// 否则普通 reload。菜单与 Ctrl+R 共用。
function reloadMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const st = recovery ? recovery.stateOf(mainWindow) : null;
  if (st && st.gaveUp) {
    log('recovery', '用户在恢复页触发重新加载');
    recovery.retryNow(mainWindow);
    return;
  }
  mainWindow.reload();
}

function startHeartbeatLoop() {
  // renderer 心跳由 preload 每 5s 上报；这里周期性判定「可见窗口」是否失联。
  setInterval(() => { if (recovery) recovery.checkHeartbeats(); }, 15000).unref();
}

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
  // 浮窗渲染进程崩溃/挂起的自恢复由 renderer-recovery.js 统一接管
  // （createFloatWindow 里经 recovery.attach 挂载），这里不再只记日志。
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
  if (recovery) recovery.attach(win, "float");

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
// 桌面宠物原生小窗
// ---------------------------------------------------------------------------

function petPositionFile() {
  return path.join(userDataDir, 'pet-window.json');
}

// 读取持久化的小窗位置：跨屏校验（目标点所在显示器存在则用），并钳制在
// 该显示器可视区内；读不到 / 不合法时返回 null（调用方落默认右下角）。
function loadPetPosition() {
  try {
    const raw = JSON.parse(fs.readFileSync(petPositionFile(), 'utf8'));
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      const probe = { x: Math.round(raw.x), y: Math.round(raw.y), width: PET_WINDOW_W, height: PET_WINDOW_H };
      const area = screen.getDisplayMatching(probe).workArea;
      return {
        x: Math.round(Math.min(Math.max(raw.x, area.x), area.x + area.width - PET_WINDOW_W)),
        y: Math.round(Math.min(Math.max(raw.y, area.y), area.y + area.height - PET_WINDOW_H)),
      };
    }
  } catch {}
  return null;
}

function savePetPosition(x, y) {
  try {
    fs.writeFileSync(petPositionFile(), JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  } catch (err) {
    log('pet', '保存宠物小窗位置失败: ' + (err && err.message ? err.message : err));
  }
}

function pushPetState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('pet:state', { open: !!(petWindow && !petWindow.isDestroyed()) }); } catch {}
  }
}

function closePetWindow() {
  if (petPosTimer !== null) { clearTimeout(petPosTimer); petPosTimer = null; }
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  petWindow = null;
}

// 创建（或复用）宠物小窗：无边框、透明、置顶（screen-saver）、不进任务栏。
// 与主窗共用默认分区（共享 localStorage：会话选中态与 harness-pet 设置），
// preload 经 additionalArguments 的 --dsh-pet=1 进入小窗模式。
function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;
  if (!webUrl) return null;
  const saved = loadPetPosition();
  const area = screen.getPrimaryDisplay().workArea;
  const pos = saved || {
    x: area.x + area.width - PET_WINDOW_W - 24,
    y: area.y + area.height - PET_WINDOW_H - 24,
  };
  const win = new BrowserWindow({
    width: PET_WINDOW_W,
    height: PET_WINDOW_H,
    x: pos.x,
    y: pos.y,
    show: false,
    title: 'DSH 宠物',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 不设 partition：与主窗共享 localStorage（dsh.sessions.current 与
      // harness-pet:settings），小窗才能实时跟随主窗会话/设置。
      additionalArguments: ['--dsh-pet=1'],
    },
  });
  petWindow = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(webUrl).catch((err) => log('pet', '小窗加载失败: ' + ((err && err.message) || err)));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  // 位置防抖保存（400ms）。
  win.on('move', () => {
    if (petPosTimer !== null) clearTimeout(petPosTimer);
    petPosTimer = setTimeout(() => {
      petPosTimer = null;
      if (petWindow === win && !win.isDestroyed()) {
        const [x, y] = win.getPosition();
        savePetPosition(x, y);
      }
    }, 400);
  });
  win.on('closed', () => {
    if (petPosTimer !== null) { clearTimeout(petPosTimer); petPosTimer = null; }
    if (petWindow === win) petWindow = null;
    pushPetState();
  });
  guardWebContents(win.webContents);
  if (recovery) recovery.attach(win, "float");
  log('pet', '已创建宠物小窗 (' + PET_WINDOW_W + 'x' + PET_WINDOW_H + ')');
  pushPetState();
  return win;
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
  const detail = '错误：' + ((err && err.message) || err) + logTailSnippet() + '\n\n日志目录：' + logsDir;
  if (!mainWindow || mainWindow.isDestroyed()) {
    dialog.showErrorBox(title, detail);
    markCleanExit();
    killTreeSync(serverProc); // app.exit 不触发 before-quit，这里保证进程树被终结
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
  // 更新进度窗必须保持主窗口可用：不设 parent/modal，并允许最小化与关闭。
  // 旧实现 modal:true + minimizable:false 会在整个下载期间禁用主窗口（下载
  // 安装包可长达数分钟），用户既不能继续使用应用，也无法把进度窗最小化；
  // 且模态进度窗未关闭时主窗处于禁用态，随后的「下载完成/更新完成」对话框
  // 可能无法正常弹出，表现为「下载成功但无法更新」。关闭本窗口不会取消
  // 后台更新/下载，完成对话框仍会照常弹出。
  const win = new BrowserWindow({
    width: 460,
    height: 300,
    resizable: false,
    minimizable: true,
    maximizable: false,
    closable: true,
    autoHideMenuBar: true,
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

function closeUpdateWindow(win) {
  if (win && !win.isDestroyed()) win.destroy();
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
      // 新 WSL agent 已就位：与 local 一致，立即补同步配套插件/内置预设并重打
      // 运行时补丁（全部幂等），否则「稍后重启」后再重启服务会以未修复、且
      // 缺少壳内置模式的新版本启动。
      syncCompanionPlugins();
      syncBuiltinAgentPresets();
      applyRuntimeFlashFix();
      applyPromptExposeFix();
      applyImageSendFix();
      applyVisionKeyFix();
      applyProfilePatchGuard();
      applyProfileBundleGuard();
      applySettingsSectionGuard();
      applyWorkspaceSearchRailFix();
      applyPluginInventoryTabMergeFix();
    } else {
      await updater.applyUpdate(ctx, latest);
      // 新 overlay 已就位：立即重打运行时补丁（全部幂等），否则「稍后重启」后再
      // 点「重启 dsh web 服务」会用未修复的新版本启动（识图发送、设置暴露等回归）。
      // 同时把壳内置 Agent 预设补进新 overlay（干净 npm 包不含 8 个壳预设）。
      syncLocalAgentPresets();
      applyRuntimeFlashFix();
      applyPromptExposeFix();
      applyImageSendFix();
      applyVisionKeyFix();
      applyProfilePatchGuard();
      applyProfileBundleGuard();
      applySettingsSectionGuard();
      applyWorkspaceSearchRailFix();
      applyPluginInventoryTabMergeFix();
      applyWebSearchBaseUrlFix();
      applyMenuViewportFix();
      applySessionManageFix();
    }
    // 进度窗已非模态，但完成对话框弹出前仍先关闭它，避免叠窗/对话框被遮挡。
    closeUpdateWindow(progressWin);
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
      killTreeSync(serverProc);
      // 立即重启前预热 profile fallback：先终结旧服务再重指向新 overlay 的
      // 联接并落新快照（新版本锚点与旧快照必然不同），重启后的首次启动直接
      // 走快照快速校验，不再把完整 heal（约 0.6s）压在启动关键路径上；旧
      // 服务已退出，重指向不会与旧进程的延迟加载产生版本错配。
      if (!isWslMode()) {
        await repairProfileFallback(dshHome || path.join(os.homedir(), '.dsh'));
      }
      app.relaunch();
      app.exit(0);
    }
  } catch (err) {
    closeUpdateWindow(progressWin);
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
  // 回合完成 = 产生消耗：触发余额刷新（节流 30s），让余额显示及时同步。
  maybeRefreshBalance();
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

function balanceDockEnabled() {
  const s = updater.loadSettings(updCtx());
  return s.showBalanceDock !== false;
}

function setBalanceDock(v) {
  const s = updater.loadSettings(updCtx());
  s.showBalanceDock = !!v;
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
      showBalanceDock: s.showBalanceDock !== false,
      iconDataUri,
      repoUrls: urls,
      staticPort: previewStaticPort,
      mode: isWslMode() ? 'wsl' : 'local',
    };
  });

  ipcMain.on('dsh:renderer-heartbeat', (event) => {
    if (recovery) recovery.noteHeartbeat(event.sender.id);
  });

  // 恢复页面（assets/recovery.html）的三个按钮。全部校验来源必须是主窗。
  ipcMain.handle('chrome:recovery-state', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    return {
      appVersion: APP_VERSION,
      logsDir,
      crashDumpsDir,
      state: recovery ? recovery.stateOf(mainWindow) : null,
    };
  });

  ipcMain.handle('chrome:recovery-reload', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    // 服务进程已退出时先重启服务（可能换新端口），再恢复加载。
    if (!serverProc || serverProc.exitCode !== null || serverProc.killed) {
      try {
        await startAndShow();
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    }
    recovery.retryNow(mainWindow);
    return { ok: true };
  });

  ipcMain.handle('chrome:recovery-restart', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    log('recovery', '用户在恢复页面选择重启客户端');
    quitting = true;
    forceQuit = true;
    markCleanExit();
    killTreeSync(serverProc);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle('chrome:recovery-open-logs', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    shell.openPath(logsDir);
    return { ok: true };
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
      return { notifyOnTurnEnd, closeToTray: closeToTrayEnabled(), showBalanceDock: balanceDockEnabled() };
    }
    switch (action) {
        case 'reload': reloadMainWindow(); break;
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
      case 'toggle-balance': {
        setBalanceDock(!balanceDockEnabled());
        refreshBalance().catch(() => {});
        break;
      }
      case 'about': showAbout(); break;
      case 'quit': forceQuit = true; app.quit(); break;
    }
    return { notifyOnTurnEnd, closeToTray: closeToTrayEnabled(), showBalanceDock: balanceDockEnabled() };
  });

  // 插件市场：原地重启 dsh web 服务（安装/卸载插件后生效，窗口重载到新端口）。
  // 测试通道 'restart-service' 复用同一实现，保证集成测试覆盖真实 IPC 路径。
  ipcMain.handle('chrome:restart-service', async (event, payload = {}) => {
    if (payload?.intent !== 'restart-service') return { ok: false, error: 'missing-intent' };
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    return restartService();
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

  // -------------------------------------------------------------------------
  // 桌面宠物原生小窗（harness-pet 插件对接，双端契约见 docs/pet-desktop.md）
  // -------------------------------------------------------------------------

  // 主窗请求宠物小窗 open / toggle / state（校验发送者必须是主窗）。
  ipcMain.handle('chrome:pet-window', (event, { action } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    if (action === 'state') {
      return { ok: true, open: !!(petWindow && !petWindow.isDestroyed()) };
    }
    if (action === 'open' || action === 'toggle') {
      if (petWindow && !petWindow.isDestroyed()) {
        if (action === 'toggle') {
          closePetWindow();
          return { ok: true, open: false };
        }
        petWindow.show();
        petWindow.focus();
        return { ok: true, open: true, id: petWindow.id, reused: true };
      }
      const win = createPetWindow();
      if (!win) return { ok: false, error: 'not-ready' };
      return { ok: true, open: true, id: win.id };
    }
    return { ok: false, error: 'bad-action' };
  });

  // 小窗关闭自身（校验发送者是小窗）。
  ipcMain.on('pet:close', (event) => {
    if (petWindow && !petWindow.isDestroyed() && petWindow.webContents === event.sender) {
      petWindow.close();
    }
  });

  // 小窗搬窗：绝对目标位置（光标屏幕坐标 + 抓取偏移），钳制在当前显示器
  // 可视区（至少露出 80px，防止拖出视口找不回来）+ 取整（校验发送者是小窗）。
  ipcMain.on('pet:move-to', (event, { x, y } = {}) => {
    if (!petWindow || petWindow.isDestroyed() || petWindow.webContents !== event.sender) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const probe = { x: Math.round(x), y: Math.round(y), width: PET_WINDOW_W, height: PET_WINDOW_H };
    const area = screen.getDisplayMatching(probe).workArea;
    const nx = Math.min(Math.max(x, area.x - PET_WINDOW_W + 80), area.x + area.width - 80);
    const ny = Math.min(Math.max(y, area.y - PET_WINDOW_H + 80), area.y + area.height - 80);
    petWindow.setPosition(Math.round(nx), Math.round(ny));
  });

  // 主窗插件上报「最小化自动弹出小窗」开关（校验发送者必须是主窗）。
  ipcMain.on('pet:set-auto-open', (event, { enabled } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    petAutoOpen = enabled === true;
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

  // -------------------------------------------------------------------------
  // 插件管理（设置页「插件」页「管理」标签，dsh-plugin-manager 插件消费）：
  //   list —— 收集配套/用户/核心插件：id、包名、package.json 描述、启用状态
  //   set  —— 写入/移除 web profile cordis.patch.yml 的用户层 disabled 条目
  //           （与 llm-deepseek 同款覆盖机制；完全退出并重启应用后生效）
  // -------------------------------------------------------------------------
  ipcMain.handle('dsh:plugin-list', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return [];
    return pluginManagerCollect();
  });

  ipcMain.handle('dsh:plugin-set-enabled', async (event, { id, enabled } = {}) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'unauthorized' };
    const row = pluginManagerCollect().find((r) => r.id === id);
    if (!row) return { ok: false, error: '未知插件: ' + String(id) };
    if (!row.toggleable) return { ok: false, error: '该插件不可关闭: ' + String(id) };
    try {
      const res = pluginManagerSetEnabled(id, !!enabled);
      if (!res.ok) return res;
      log('plugin-manager', '已' + (enabled ? '启用' : '关闭') + '插件 ' + id);
      return { ok: true, restartRequired: true };
    } catch (err) {
      log('plugin-manager', '设置插件 ' + id + ' 失败: ' + ((err && err.message) || err));
      return { ok: false, error: String((err && err.message) || err) };
    }
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
  // 防御性恢复（用户反馈：关闭到托盘后托盘/桌面图标都无法重新打开）：
  // 1) 窗口被销毁或从未创建 → 重建主窗并加载 Web UI；
  // 2) 最小化 → 先 restore；隐藏 → show；最后置顶聚焦，确保回到前台。
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!webUrl) return;
    try {
      createWindow();
      initRendererRecovery();
      wireWindowRecovery();
      mainWindow.loadURL(webUrl).catch((err) => log('boot', '恢复窗口加载失败: ' + ((err && err.message) || err)));
      log('boot', '主窗不存在，已重建并加载 Web UI');
    } catch (err) {
      log('boot', '重建主窗失败: ' + ((err && err.message) || err));
    }
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  try { mainWindow.setSkipTaskbar(false); } catch {}
  mainWindow.focus();
  try { mainWindow.moveTop(); } catch {}
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
    // 左键/双击一律恢复窗口（用户反馈「托盘点不开」：去掉「可见则隐藏」的
    // 双态逻辑，避免隐藏态误判导致的点按无反应）。
    tray.on('click', () => showMainWindow());
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
  if (!balanceDockEnabled()) {
    const result = { ok: false, disabled: true, balances: [], prices: {}, error: 'balance dock disabled' };
    balanceCache = result;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dsh:balance', result);
    }
    return result;
  }
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const s = updater.loadSettings(updCtx());
  // OpenCode Go 套餐用量（状态栏独立 chip，PR #44 语义）：settings.json 的
  // showOpenCodeGoUsage:false 可整体关闭（查询与展示一并关闭）。
  const opencodePromise = s.showOpenCodeGoUsage === false
    ? Promise.resolve({ ok: false, disabled: true })
    : balance.queryOpencodeUsage(home)
      .catch((err) => ({ ok: false, error: String((err && err.message) || err) }));
  let result;
  try {
    result = await balance.queryBalance(home);
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err), balances: [] };
  }
  result.opencodeGo = await opencodePromise;
  // 按当前默认模型 + 当前时段（峰谷）计算有效单价；settings.json 的
  // balancePrices.<model> 可整体覆盖该模型的单价。
  const model = balance.readActiveModel(home) || 'deepseek-v4-pro';
  const override = s.balancePrices && s.balancePrices[model];
  result.prices = { ...balance.effectivePrice(model), ...(override || {}) };
  result.model = model;
  result.peak = balance.isPeakHour();
  result.at = new Date().toISOString(); // 数据获取时间（UI 可显示「更新于 …」）
  balanceCache = result;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh:balance', result);
  }
  if (!result.ok) {
    // 查询失败：30s 后自动重试一次，避免长时间停留在过期/缺失状态。
    if (balanceRetryTimer) clearTimeout(balanceRetryTimer);
    balanceRetryTimer = setTimeout(() => {
      balanceRetryTimer = null;
      maybeRefreshBalance(true);
    }, 30 * 1000);
    if (balanceRetryTimer.unref) balanceRetryTimer.unref();
  }
  return result;
}

// 余额刷新节流：会话完成 / 窗口显示 / 轮询共用，距上次不足 30s 跳过，
// 避免高频事件（流式多回合）触发过多 HTTP 请求。
let lastBalanceRefreshAt = 0;
let balanceRetryTimer = null;

function maybeRefreshBalance(force = false) {
  const now = Date.now();
  if (!force && now - lastBalanceRefreshAt < 30 * 1000) return;
  lastBalanceRefreshAt = now;
  refreshBalance().catch(() => {});
}

function startBalanceLoop() {
  // 启动即刷新；此后每 3 分钟轮询（原 15 分钟——用户反馈余额显示不同步/
  // 更新慢，缩短轮询并配合「窗口显示/会话完成」触发点）。
  maybeRefreshBalance(true);
  balanceTimer = setInterval(() => maybeRefreshBalance(), 3 * 60 * 1000);
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
  { id: 'plugin-market', name: 'zat-dsh-engine' },
  { id: 'better-sidebar', name: 'dsh-better-sidebar' },
  { id: 'harness-pet', name: 'harness-pet' },
  { id: 'float-window', name: '@deepseek-ai/dsh-float-window' },
  // 对话节点导航条（vlln/dsh-navbar，MIT）：对话区右缘节点串快速跳转
  // user 消息（悬停预览/点击跳转/滚轮切换），取代 conversation-tweaks
  // 内置的会话滑轨。
  { id: 'dsh-navbar', name: '@vlln/dsh-navbar' },
  // 对话删除与归档管理（本仓库内置）：会话行菜单删除按钮 + 设置内归档管理
  // 面板（恢复/删除）。依赖 patch-session-manage.js 的官方包运行时补丁。
  { id: 'dsh-session-manager', name: 'dsh-session-manager' },
  { id: 'conversation-tweaks', name: '@deepseek-ai/dsh-conversation-tweaks' },
  { id: 'super-injector', name: '@dsh-external/dsh-super-injector' },
  { id: 'prompt-custom', name: '@deepseek-ai/dsh-prompt-custom' },
  { id: 'third-party-thinking', name: '@deepseek-ai/dsh-third-party-thinking' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
  { id: 'side-session', name: '@dsh-external/dsh-side-session' },
  { id: 'compaction-acp', name: 'billion-context-dsh' },
  { id: 'plugin-manager', name: '@deepseek-ai/dsh-plugin-manager' },
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

function removeLegacyMarketplace(profileWebModules, profileDir) {
  // v0.3.5 起插件市场整体切换为 zat-dsh-engine（MIT）：
  // 清理旧版 @deepseek-ai/dsh-plugin-marketplace 的同步副本与 patch 行。
  const oldPkg = path.join(profileWebModules, '@deepseek-ai', 'dsh-plugin-marketplace');
  try {
    if (fs.existsSync(oldPkg)) {
      fs.rmSync(oldPkg, { recursive: true, force: true });
      log('boot', '已移除旧插件市场包: @deepseek-ai/dsh-plugin-marketplace');
    }
  } catch (err) {
    log('boot', '移除旧插件市场包失败: ' + err.message);
  }
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  try {
    let patch = fs.readFileSync(patchFile, 'utf8');
    const before = patch;
    patch = patch.replace(/^\s*-\s*insert:\s*$\n^\s*-\s*id:\s*plugin-marketplace\s*$\n^\s*name:\s*['"]@deepseek-ai\/dsh-plugin-marketplace['"]\s*$\n?/gm, '');
    if (patch !== before) {
      fs.writeFileSync(patchFile, patch);
      log('boot', '已从 cordis.patch.yml 移除旧插件市场条目');
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// profile patch 自愈：cordis.patch.yml 损坏会让 dsh web 装配 profile 时抛错并
// 以 exit 1 退出，桌面端「启动失败」。每次启动 dsh web 前调用本函数：
//   1. 顶层孤立 `[]` 与列表条目混存 → 移除 `[]` 行（修复为单一顶层列表）；
//   2. issue #17 存量：同一 loader id 被注册多次（旧版本插件安装写入的重复
//      insert 条目 → cordis loader "duplicate loader entry id: X"）→ 注册行级
//      去重，保留首次注册、备份原文件；config 覆盖/disabled 禁用条目是用户
//      配置，绝不改动（PR #24 v2）；
//   3. 仍无法解析（其它损坏形态）→ 备份为 cordis.patch.yml.broken-<ts> 并
//      重置为最小合法文件，日志告警，备份保留用户内容供恢复。
//   健康文件零写入（幂等）。
// ---------------------------------------------------------------------------
function profilePatchFile() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  return path.join(home, 'profiles', 'web', 'cordis.patch.yml');
}

/** 原子写入（临时文件 + rename），避免与 dsh 的 HMR 观察者撕裂读。 */
function writePatchAtomic(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

// 惰性加载 js-yaml（随内置 dsh 存在于 resources/app/node_modules，传递依赖）；
// 缺失时静默降级为仅做结构化修复（不阻断启动）。
let dshYamlDialect = null;
let dshYamlTried = false;
function loadDshYamlDialect() {
  if (dshYamlTried) return dshYamlDialect;
  dshYamlTried = true;
  try {
    const yaml = require('js-yaml');
    // 与 dsh 相同的 entry-list 方言：`!!js` 表达式是合法标量。
    const jsType = new yaml.Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: (data) => typeof data === 'string',
      construct: (data) => ({ __jsExpr: data }),
    });
    dshYamlDialect = { load: (content) => yaml.load(content, { schema: yaml.JSON_SCHEMA.extend(jsType) }) };
  } catch {
    dshYamlDialect = null;
  }
  return dshYamlDialect;
}

// profile patch 自愈的签名缓存：cordis.patch.yml 是本项目高频自愈对象，但
// 每次启动实际需要改动的情形很少。以「文件路径 + 大小 + 精确 mtimeMs」为
// 签名，签名一致说明文件内容未被任何写入方触碰（写入必改 mtime），可跳过
// 读文件 + js-yaml 解析 + 去重扫描。进程内 memo 同时消除 startServer 里对
// 同一文件的第二次全量解析。文件被改（含本进程后续的同步写入）→ 签名变化
// → 自动重新自愈，无陈旧判断。
let patchHealMemo = null; // { file, size, mtimeMs }

function patchHealCachePath() {
  return path.join(userDataDir, 'profile-patch-heal-cache.json');
}

function patchFileSignature(file) {
  try {
    const st = fs.statSync(file);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

function readPersistedPatchHeal() {
  try {
    const c = JSON.parse(fs.readFileSync(patchHealCachePath(), 'utf8'));
    if (c && c.v === 1 && typeof c.file === 'string' && typeof c.size === 'number' && typeof c.mtimeMs === 'number') return c;
  } catch {}
  return null;
}

function writePersistedPatchHeal(file, sig) {
  try {
    fs.writeFileSync(patchHealCachePath(), JSON.stringify({
      v: 1,
      file,
      size: sig.size,
      mtimeMs: sig.mtimeMs,
      at: new Date().toISOString(),
    }));
  } catch {}
}

function healProfilePatch() {
  try {
    const file = profilePatchFile();
    if (!fs.existsSync(file)) return;
    // 启动提速：签名一致 → 该文件已在当前内容状态下自愈过，直接跳过。
    const sig = patchFileSignature(file);
    if (sig) {
      const memoHit = patchHealMemo && patchHealMemo.file === file &&
        patchHealMemo.size === sig.size && patchHealMemo.mtimeMs === sig.mtimeMs;
      if (memoHit) return;
      const persisted = readPersistedPatchHeal();
      if (persisted && persisted.file === file && persisted.size === sig.size && persisted.mtimeMs === sig.mtimeMs) {
        patchHealMemo = { file, size: sig.size, mtimeMs: sig.mtimeMs };
        return;
      }
    }
    let text = fs.readFileSync(file, 'utf8');
    const bareArray = /^\s*\[\]\s*$/m.test(text);
    const hasEntries = /^\s*-\s+(?:id|insert)\s*:/m.test(text);
    if (bareArray && hasEntries) {
      text = text.replace(/^\s*\[\]\s*$\n?/m, '');
      writePatchAtomic(file, text);
      log('boot', 'profile patch 自愈: 移除了与列表混存的顶层 []（cordis.patch.yml）');
    }
    const yaml = loadDshYamlDialect();
    if (!yaml) return;
    let parsed;
    let error = null;
    try { parsed = yaml.load(text); } catch (err) { error = err; }
    if (!error && Array.isArray(parsed)) {
      // issue #17 存量自愈：注册行级去重（PR #24 v2）。重复注册（旧版本
      // 插件安装写入的第二个同 id insert 条目）会让 cordis loader 抛
      // "duplicate loader entry id: X"，且该状态永远无法自愈；只删重复
      // 注册行，用户手写的 config/disabled 覆盖条目原样保留。
      const dedupe = dedupePatchEntries(text);
      if (dedupe.removed.length > 0) {
        const backup = file + '.dup-' + Date.now();
        try { fs.copyFileSync(file, backup); } catch {}
        writePatchAtomic(file, dedupe.text);
        log('boot', 'profile patch 自愈: 移除了重复注册的 loader 条目 ' + [...new Set(dedupe.removed)].join(', ') + '，原文件已备份到 ' + backup);
        text = dedupe.text;
      }
    }
    if (error || !Array.isArray(parsed)) {
      const backup = file + '.broken-' + Date.now();
      try { fs.renameSync(file, backup); } catch { fs.copyFileSync(file, backup); }
      fs.writeFileSync(file, '# recovered by DSH Desktop: 原内容无法解析，已备份到\n# ' + backup + '\n[]\n', 'utf8');
      log('boot', 'profile patch 自愈: 解析失败（' + String((error && error.message) || '顶层非数组') + '），已备份到 ' + backup + ' 并重置为最小文件');
    }
    // 完整自愈流程已跑完（含 yaml 解析）：记录当前内容签名，下次启动命中跳过。
    const after = patchFileSignature(file);
    if (after) {
      patchHealMemo = { file, size: after.size, mtimeMs: after.mtimeMs };
      writePersistedPatchHeal(file, after);
    }
  } catch (err) {
    log('boot', 'profile patch 自愈失败: ' + err.message);
  }
}
/**
 * 在「实际将运行的 dsh 包」（内置或用户目录 overlay）中解析核心 bundles，
 * 只返回真实可解析的模板名；解析不到的名字绝不写入，避免与真正启动的
 * dsh 版本漂移后写入无效 bundle 名。
 */
function resolvableCoreBundles() {
  const installAnchor = path.dirname(dshPackageJson());
  return CORE_BUNDLE_NAMES.filter((name) => {
    try {
      require.resolve(name + '/package.json', { paths: [installAnchor] });
      return true;
    } catch {
      return false; // 该 dsh 安装中缺失，交由 dsh 初始化
    }
  });
}

// 递归比对 src/dest 的 size+mtime，任一文件缺失或不一致返回 true（需要同步）。
// dest 目录整体不存在时直接返回 true，避免逐文件 stat 异常。
function dirNeedsSync(src, dest) {
  if (!fs.existsSync(dest)) return true;
  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return true; }
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (dirNeedsSync(s, d)) return true;
    } else {
      try {
        const ss = fs.statSync(s);
        const ds = fs.statSync(d);
        if (ds.size !== ss.size || Math.round(ds.mtimeMs) !== Math.round(ss.mtimeMs)) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

// 目录级同步：内容一致时跳过，避免每次启动全量递归复制
// （临时目录 + 杀软实时扫描下重复写盘最费时）。cpSync 必须保留时间戳，
// 否则复制后的 mtime 每次都是"现在"，跳过比对永远不成立。
function syncDir(src, dest) {
  if (!fs.existsSync(src)) return;
  try {
    if (fs.existsSync(dest) && !dirNeedsSync(src, dest)) return;
    fs.cpSync(src, dest, { recursive: true, force: true, preserveTimestamps: true });
  } catch (err) {
    log('boot', '同步目录失败 ' + src + ': ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// profile bundle 健康检查（只读）：dsh web 启动前把每个 bundles 条目的装配
// 状态落到 desktop.log —— 缺失 / 未声明 dsh.bundle.patch / 补丁层缺失都会让
// 该层被启动防护跳过，这里让诊断在壳日志里可见（dsh-web.log 的 stderr 告警
// 保留完整细节）。不修改任何文件。
// ---------------------------------------------------------------------------
function logProfileBundleHealth() {
  try {
    const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
    const profileDir = path.join(home, 'profiles', 'web');
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    } catch (err) {
      log('boot', 'profile bundle 健康检查: manifest 不可读（' + err.message + '），交由启动防护自愈');
      return;
    }
    const bundles = (manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)) ? manifest.dsh.profile.bundles : [];
    const installAnchor = path.dirname(dshPackageJson());
    for (const name of bundles) {
      if (typeof name !== 'string' || name === '') continue;
      const dir = packageDirUpward(installAnchor, name) || packageDirUpward(profileDir, name);
      if (!dir) {
        log('boot', 'profile bundle 缺失（该层将被启动防护跳过）: ' + name + ' —— 用 dsh plugin --profile web install 可修复');
        continue;
      }
      const check = verifyBundleDir(dir);
      if (!check.ok) log('boot', 'profile bundle 不可用（该层将被启动防护跳过）: ' + name + ' —— ' + check.reason);
    }
  } catch (err) {
    log('boot', 'profile bundle 健康检查失败: ' + err.message);
  }
}

function syncCompanionPlugins() {
  if (!IS_WIN) return;
  try {
    healProfilePatch();
    const home = effectiveDshHome();
    if (!home) { log('boot', 'DSH_HOME 未解析，跳过配套插件同步'); return; }
    const profileDir = path.join(home, 'profiles', 'web');
    const profileModules = path.join(profileDir, 'node_modules', '@deepseek-ai');
    fs.mkdirSync(profileModules, { recursive: true });
    const expectedDirs = new Set(COMPANION_PLUGINS.map(companionDirName));
    removeStaleCompanionPlugins(profileModules, expectedDirs);
    removeLegacyMarketplace(path.join(profileDir, 'node_modules'), profileDir);

    // 源缺失的配套插件（用户从 assets 删除 / 开发中裁剪 / 安装包损坏）：
    // 既不能复制、也无法从源码确认 bundle 身份。处理原则（issue #34 诊断
    // 的自愈死循环）：缺失源一律不写 patch 注册（否则「注册了但包不存在」
    // 会让 dsh web 启动崩溃）；若 manifest 仍登记为 bundle，则视为用户
    // 意图禁用，从 bundles 移除。
    const missingSourceNames = new Set();
    for (const p of COMPANION_PLUGINS) {
      const sdir = path.join(__dirname, 'assets', 'plugins', companionDirName(p));
      if (!fs.existsSync(path.join(sdir, 'package.json'))) missingSourceNames.add(p.name);
    }

    const bundleNames = new Set();
    const copyFiles = [
      'package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh.md',
      'lib/index.js', 'lib/index.mjs', 'lib/client.js', 'lib/vlm.js', 'lib/typert.host.js', 'lib/typert.host.d.ts',
      'dsh.plugin.json',
    ];
    // 配套插件引用了不在 dsh 核心依赖闭包里的 npm 包时（例如 dsh-better-sidebar
    // 使用的 schemastery / cosmokit），把内置副本一并落到 profile web node_modules，
    // 保证 bundle 的宿主端能在 profile 内解析到这些依赖。
    const vendorDeps = ['schemastery', 'cosmokit', '@standard-schema/spec'];
    for (const name of vendorDeps) {
      const sdir = path.join(__dirname, 'node_modules', name);
      if (!fs.existsSync(sdir)) continue;
      syncDir(sdir, path.join(profileDir, 'node_modules', name));
    }
    for (const p of COMPANION_PLUGINS) {
      const rel = companionDirName(p);
      const src = path.join(__dirname, 'assets', 'plugins', rel);
      if (!fs.existsSync(path.join(src, 'package.json'))) continue;
      let pkg = {};
      try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')); } catch {}
      const isBundle = bundlePatchRel(pkg) !== '';
      // @deepseek-ai 与 @dsh-external 两种 scope 都按包名落到 profile 的
      // node_modules 下；配套包自身的依赖由 dsh 的 profiles/node_modules
      // fallback（healProfilesModuleFallback）解析。
      const dest = path.join(profileModules, '..', p.name);
      fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
      for (const f of copyFiles) {
        const sf = path.join(src, f);
        if (!fs.existsSync(sf)) continue;
        const df = path.join(dest, f);
        // 逐文件比对大小+mtime，一致则跳过复制，避免每次启动都写盘
        // （临时目录 + 杀软实时扫描下重复写入最费时）。注意 fs.copyFileSync
        // 不保留时间戳（复制的目标 mtime=现在），会让比对永远不成立；这里
        // 用 cpSync + preserveTimestamps 写，保证第二次启动能命中跳过。
        try {
          const sst = fs.statSync(sf);
          const dst = fs.statSync(df);
          if (dst.size === sst.size && Math.round(dst.mtimeMs) === Math.round(sst.mtimeMs)) continue;
        } catch { /* 目标缺失或不可读 → 照常复制 */ }
        try {
          fs.cpSync(sf, df, { force: true, preserveTimestamps: true });
        } catch (err) {
          log('boot', '同步配套插件文件失败 ' + sf + ': ' + err.message);
        }
      }
      // 完整同步插件自带的 lib/assets/src/dist/node_modules 目录：第三方插件
      // （如 dsh-better-sidebar 的懒加载 chunk、harness-pet 的动画素材、
      // billion-context-dsh 的 dist 构建产物）不都落在固定文件清单里，递归
      // 复制保证打包产物与资源随插件一起进 profile；node_modules 用于随包
      // 分发插件的私有依赖（如 billion-context-dsh 的 acp-kernel），保证
      // bundle 在 profile 内可解析。
      for (const sub of ['lib', 'assets', 'src', 'dist', 'node_modules']) {
        syncDir(path.join(src, sub), path.join(dest, sub));
      }
      // Bundle 插件不写 patch 行：dsh 在启动时读取 profile 的
      // dsh.profile.bundles 并应用包内 cordis.patch.yml。
      if (isBundle) {
        // 落盘后校验 bundle 完整性：dsh 装配时会读取补丁层与入口文件，任一
        // 缺失都会让整棵插件树加载失败（billion-context-dsh 上游缺 dist 构建
        // 产物正是这类崩溃）。校验失败按「源缺失」处理：不注册、从 manifest
        // 移除登记、日志告警，下次启动重试。
        const check = verifyBundleDir(dest);
        if (!check.ok) {
          missingSourceNames.add(p.name);
          log('boot', '配套 bundle 校验失败（按源缺失处理，不注册）: ' + p.name + ' —— ' + check.reason);
        } else {
          bundleNames.add(p.name);
        }
      }
    }

    // billion-context-dsh（compaction-acp）是模型驱动的 ACP 压缩后端：同一
    // realm 内与 dsh 默认的 compaction-basic 不能并存（插件 README 的官方
    // 安装说明）。幂等写入禁用条目：patch 中已存在 compaction-basic 条目
    // （含用户手写的 disabled 块）则不动，尊重用户配置。
    if (bundleNames.has('billion-context-dsh')) {
      const acpPatchFile = path.join(profileDir, 'cordis.patch.yml');
      try {
        let patch = '';
        try { patch = fs.readFileSync(acpPatchFile, 'utf8'); } catch { /* 全新 profile：patch 文件尚未创建，视为空 */ }
        if (!/(?:^|\n)\s*-?\s*id\s*:\s*compaction-basic\b/.test('\n' + patch)) {
          const block = '\n# billion-context-dsh：禁用 preset realm 的 compaction-basic（ACP 模型驱动后端接管压缩决策）\n- id: compaction-basic\n  disabled: true\n';
          if (/^\s*\[\]\s*$/m.test(patch)) patch = patch.replace(/\[\]/m, block.trim());
          else if (patch.trim() === '') patch = '# dsh web profile patch（由 DSH Desktop 维护）\n' + block.trim();
          else patch = patch.replace(/\s*$/, '\n') + block;
          fs.writeFileSync(acpPatchFile, patch);
          log('boot', '已禁用 compaction-basic（billion-context-dsh 接管压缩后端）');
        }
      } catch (err) {
        log('boot', '写入 compaction-basic 禁用条目失败: ' + err.message);
      }
    }

    // 桌面宠物（harness-pet）默认关闭：客户端常驻 rAF 逐帧绘制 320x320
    // canvas（issue #34 诊断为软渲染/流式输出下的持续阻塞源），且旧版保存的
    // 开关值会覆盖客户端默认。插件级 disabled 条目一票否决任何已保存状态；
    // 需要时可在 设置 → 插件 → 管理 一键开启（与 dsh-plugin-manager 同机制）。
    // 幂等：patch 中已存在 harness-pet 条目（含用户手写）则不动，尊重用户配置。
    if (bundleNames.has('harness-pet')) {
      const petPatchFile = path.join(profileDir, 'cordis.patch.yml');
      try {
        let patch = '';
        try { patch = fs.readFileSync(petPatchFile, 'utf8'); } catch { /* 全新 profile：patch 文件尚未创建，视为空 */ }
        if (!/(?:^|\n)\s*-?\s*id\s*:\s*harness-pet\b/.test('\n' + patch)) {
          const block = '\n# harness-pet：桌面宠物默认关闭（设置 → 插件 → 管理 可一键开启）\n- id: harness-pet\n  disabled: true\n';
          if (/^\s*\[\]\s*$/m.test(patch)) patch = patch.replace(/\[\]/m, block.trim());
          else if (patch.trim() === '') patch = '# dsh web profile patch（由 DSH Desktop 维护）\n' + block.trim();
          else patch = patch.replace(/\s*$/, '\n') + block;
          fs.writeFileSync(petPatchFile, patch);
          log('boot', '已默认关闭桌面宠物（harness-pet，可在插件管理开启）');
        }
      } catch (err) {
        log('boot', '写入 harness-pet 禁用条目失败: ' + err.message);
      }
    }

    const manifestFile = path.join(profileDir, 'package.json');
    let manifest = null;
    let manifestReset = false; // 解析失败或顶层非法触发的重置（issue #48 数据恢复标记）
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { manifestReset = true; }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      manifestReset = true;
      // manifest 损坏：先备份原文件再重置（不可解析时原文是唯一现场），绝不
      // 静默丢弃用户数据。全新 profile 没有文件，不产生备份。
      if (fs.existsSync(manifestFile)) {
        const backup = manifestFile + '.broken-' + Date.now();
        try {
          fs.copyFileSync(manifestFile, backup);
          log('boot', 'profile manifest 损坏，原文件已备份到 ' + backup);
        } catch (err) {
          log('boot', 'profile manifest 备份失败: ' + err.message);
        }
      }
      manifest = { name: 'dsh-profile-web', private: true };
    }
    if (!manifest.dsh || typeof manifest.dsh !== 'object') manifest.dsh = {};
    if (!manifest.dsh.profile || typeof manifest.dsh.profile !== 'object') manifest.dsh.profile = {};
    // 全新 profile（dsh 尚未初始化）时 manifest 不存在、也没有 bundles。
    // 此时壳层不能凭空新建只含自己 bundle 的 manifest：那会顶替 dsh 的
    // 初始化，profile 里没有提供核心服务的插件，插件树无法激活，
    // 全新 DSH_HOME 首次启动必然失败。
    // 处理：核心 bundles 必须在安装中实测可解析（与 dsh-app-boot 的
    // PROFILE_TEMPLATES.web 同名）才写入；解析不到（模板未来改名）则不写
    // manifest，交由 dsh 自行初始化，bundle 插件留待下一次启动注册。
    let bundlesUsable = Array.isArray(manifest.dsh.profile.bundles);
    if (!bundlesUsable) {
      const coreBundles = resolvableCoreBundles();
      if (coreBundles.length === CORE_BUNDLE_NAMES.length) {
        manifest.dsh.profile.bundles = coreBundles;
        bundlesUsable = true;
      } else {
        log('boot', 'dsh 出厂核心 bundles 未在安装中解析到，跳过 manifest 预写，交由 dsh 初始化');
      }
    } else {
      // issue #16 存量自愈：旧版本（0.3.3/0.3.4，#13 的 bug 场景）写坏的
      // manifest 里 bundles 只有配套 bundle、缺少核心 bundles。dsh 启动时
      // 核心服务（webServer/subprocess/settings/llm 等）无人提供，插件树
      // 无法激活（N entries did not activate），且该状态永远无法自愈。
      // 这里把缺失且可解析的核心 bundles 补到列表最前（保持与模板一致的
      // 先后顺序），其余条目（含用户自行添加的）原样保留；健康 manifest
      // 零写入（幂等）。写入用原子写，避免与 dsh 的观察者撕裂读。
      const healed = ensureCoreBundles(manifest.dsh.profile.bundles, resolvableCoreBundles());
      if (healed) {
        manifest.dsh.profile.bundles = healed.next;
        writePatchAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        log('boot', 'profile manifest 自愈: 旧版本写坏的 bundles 缺少核心 ' + healed.added.join(', ') + '，已补齐到最前');
      }
    }
    for (const name of bundleNames) {
      if (!bundlesUsable) break;
      if (!manifest.dsh.profile.bundles.includes(name)) {
        manifest.dsh.profile.bundles.push(name);
        writePatchAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        log('boot', '已把 bundle 插件加入 web profile bundles: ' + name);
      }
    }
    // 存量 bundle 源缺失 → 视为用户禁用：从 bundles 移除（幂等），否则 dsh
    // 启动仍会因 manifest 登记了不存在的包而失败。只动配套插件名，用户自行
    // 添加的第三方 bundle 与核心 bundles 不受影响。
    if (missingSourceNames.size > 0 && Array.isArray(manifest.dsh.profile.bundles)) {
      const before = manifest.dsh.profile.bundles.length;
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((n) => !missingSourceNames.has(n));
      if (manifest.dsh.profile.bundles.length !== before) {
        writePatchAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        log('boot', '配套 bundle 源缺失，已从 web profile bundles 移除（视为禁用）: ' + [...missingSourceNames].join(', '));
      }
    }
    // issue #48 数据恢复：manifest 重置分支会丢掉用户手动安装的第三方 bundle
    // 登记（dependencies + bundles 条目）。这些包仍实际落在 profile node_modules
    // 里，扫描并校验后合并回 manifest，用户插件在自愈后照常装配，无需手工恢复
    // 备份。只动重置分支；正常启动时既有登记零改动（幂等）。
    if (manifestReset && bundlesUsable && Array.isArray(manifest.dsh.profile.bundles)) {
      const recovered = recoverManifestBundles(manifest, scanProfileBundles(
        path.join(profileDir, 'node_modules'),
        new Set([...CORE_BUNDLE_NAMES, ...COMPANION_PLUGINS.map((p) => p.name)]),
      ));
      if (recovered.length > 0) {
        writePatchAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        log('boot', 'profile manifest 重置后已恢复用户安装的 bundle 插件: ' + recovered.join(', '));
      } else {
        log('boot', 'profile manifest 已重置（原文件已备份），未发现需要恢复的用户 bundle');
      }
      notifyManifestResetRecovered(recovered);
    }

    // 非 bundle 插件注册到 profile 的 patch 层（幂等）。
    const patchFile = path.join(profileDir, 'cordis.patch.yml');
    let patch = '';
    try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
    let changed = false;
    // bundle 迁移自愈（issue #17 同族）：旧版本把后来升级为 bundle 的配套插件
    // 当非 bundle 写进了 patch（insert 行）；插件现经 dsh.profile.bundles 装配，
    // 残留注册行会造成同 id 双登记 → cordis loader "duplicate loader entry id" →
    // 整树加载失败（更新后首次启动崩溃）。幂等移除命中的注册行/块；用户手写
    // 的 config 覆盖/disabled 禁用条目原样保留（PR #24 v2）。
    const bundleIds = new Set();
    for (const p of COMPANION_PLUGINS) {
      if (bundleNames.has(p.name)) bundleIds.add(p.id);
    }
    if (bundleIds.size > 0 && patch.includes('- id:')) {
      const migration = dropBlocksByIds(patch, [...bundleIds]);
      if (migration.removed.length > 0) {
        patch = migration.text;
        changed = true;
        log('boot', '已把 bundle 插件移出 profile patch（避免双登记）: ' + [...new Set(migration.removed)].join(', '));
      }
    }
    // 源缺失插件的旧注册残留同样移除：不清理的话 loader 仍会尝试加载
    // 不存在的包（issue #34 诊断的「Cannot find package」崩溃）；用户手写
    // 的 config/disabled 覆盖条目由 dropBlocksByIds 语义原样保留。
    if (missingSourceNames.size > 0 && patch.includes('- id:')) {
      const missingIds = COMPANION_PLUGINS.filter((p) => missingSourceNames.has(p.name)).map((p) => p.id);
      if (missingIds.length > 0) {
        const drop = dropBlocksByIds(patch, missingIds);
        if (drop.removed.length > 0) {
          patch = drop.text;
          changed = true;
          log('boot', '已把源缺失插件移出 profile patch（避免注册不存在的包）: ' + [...new Set(drop.removed)].join(', '));
        }
      }
    }
    for (const p of COMPANION_PLUGINS) {
      if (bundleNames.has(p.name)) continue;
      // 源缺失：不写任何注册（复制循环已跳过它），避免「注册了但包不存在」
      // 导致 dsh web 启动崩溃。
      if (missingSourceNames.has(p.name)) continue;
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
      // 尊重用户已有配置：id 只要出现过（例如用户手写的 disabled 条目）就不再
      // 自动插入，避免「禁用后下次启动又被加回来」或同 id 重复条目导致 loader 报错。
      if (new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*' + p.id + '\\b').test('\n' + patch)) {
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
// 插件管理数据与写盘（设置页「插件」页「管理」标签；IPC 见 dsh:plugin-list /
// dsh:plugin-set-enabled）
// ---------------------------------------------------------------------------

/** web profile 目录（与 profilePatchFile 同源，WSL 模式下走 UNC 写穿）。 */
function pluginManagerProfileDir() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  return path.join(home, 'profiles', 'web');
}

/** 读取并解析 cordis.patch.yml（js-yaml 方言；解析失败返回空列表）。 */
function pluginManagerReadPatch() {
  const file = path.join(pluginManagerProfileDir(), 'cordis.patch.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch {}
  const yaml = loadDshYamlDialect();
  if (!yaml) return { file, text, entries: [] };
  try {
    const parsed = yaml.load(text);
    return { file, text, entries: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { file, text, entries: [] };
  }
}

/** 读插件包 package.json 的 description（profile node_modules → app assets 兜底）。 */
function pluginManagerPackageDescription(name) {
  if (!name) return '';
  const candidates = [
    path.join(pluginManagerProfileDir(), 'node_modules', ...name.split('/')),
    path.join(__dirname, 'assets', 'plugins', name.includes('/') ? name.slice(name.indexOf('/') + 1) : name),
  ];
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && typeof pkg.description === 'string' && pkg.description) return pkg.description;
    } catch {}
  }
  return '';
}

/**
 * 收集插件清单（供「管理」标签展示）：
 *   - companion：COMPANION_PLUGINS 定义的配套插件（可开关）
 *   - other    ：patch 的 insert 块里出现但不在配套表（用户安装/热装）+
 *                用户层条目（llm-deepseek / web 等），可开关（带 config 且未禁用的除外）
 *   - core     ：manifest bundles 中的核心组件（不可开关）
 * enabled = 用户层没有 disabled: true。
 */
function pluginManagerCollect() {
  const { entries } = pluginManagerReadPatch();
  const companionById = new Map(COMPANION_PLUGINS.map((p) => [p.id, p.name]));
  const insertById = new Map();
  const userById = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (Array.isArray(entry.insert)) {
      for (const it of entry.insert) {
        if (it && typeof it.id === 'string') insertById.set(it.id, it.name || '');
      }
    } else if (typeof entry.id === 'string') {
      userById.set(entry.id, {
        name: entry.name || '',
        disabled: entry.disabled === true,
        hasConfig: entry.config !== undefined && entry.config !== null,
      });
    }
  }
  let bundles = [];
  try {
    const m = JSON.parse(fs.readFileSync(path.join(pluginManagerProfileDir(), 'package.json'), 'utf8'));
    bundles = (m && m.dsh && m.dsh.profile && Array.isArray(m.dsh.profile.bundles)) ? m.dsh.profile.bundles : [];
  } catch {}
  const companionNames = new Set(COMPANION_PLUGINS.map((p) => p.name));

  const seen = new Set();
  const rows = [];
  const addRow = (id, name, group) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const user = userById.get(id);
    const userDisabled = !!(user && user.disabled);
    const hasConfig = !!(user && user.hasConfig);
    const toggleable = group !== 'core' && !(hasConfig && !userDisabled);
    rows.push({
      id,
      name: name || id,
      description: pluginManagerPackageDescription(name || id),
      enabled: !userDisabled,
      toggleable,
      group,
    });
  };
  // 配套插件（COMPANION_PLUGINS 为准；patch insert 里的同名 id 统一归属）
  for (const p of COMPANION_PLUGINS) addRow(p.id, p.name, 'companion');
  // 其他：insert 块出现但不在配套表
  for (const [id, name] of insertById) if (!companionById.has(id)) addRow(id, name, 'other');
  // 其他：用户层条目（llm-deepseek / web / 手动条目）
  for (const [id, u] of userById) if (!companionById.has(id)) addRow(id, u.name, 'other');
  // 核心：manifest bundles 中非配套包（dsh-base / dsh-web-app 等）
  for (const name of bundles) {
    if (companionNames.has(name)) continue;
    const id = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
    if (!seen.has(id)) addRow(id, name, 'core');
  }
  const order = { companion: 0, other: 1, core: 2 };
  return rows.sort((a, b) => order[a.group] - order[b.group] || a.id.localeCompare(b.id));
}

/** 解析插件包名（配套表 → insert 块）。 */
function pluginManagerResolveName(id) {
  const c = COMPANION_PLUGINS.find((p) => p.id === id);
  if (c) return c.name;
  const { entries } = pluginManagerReadPatch();
  for (const entry of entries) {
    if (entry && Array.isArray(entry.insert)) {
      const it = entry.insert.find((x) => x && x.id === id);
      if (it && it.name) return it.name;
    }
  }
  return '';
}

/**
 * 写入/移除用户层 disabled 条目（纯文本手术见 scripts/plugin-manager-patch.js）：
 *   关闭 —— 若 id 在 insert 块里，先从块内移除，再追加/更新顶层条目
 *           {id, name, disabled: true}（同一 id 只保留一处，避免 loader 双登记崩溃）
 *   启用 —— 移除顶层条目的 disabled 行；条目无 config 时整个移除
 *           （配套插件下次启动由 syncCompanionPlugins 重新 insert）
 */
function pluginManagerSetEnabled(id, enabled) {
  const file = path.join(pluginManagerProfileDir(), 'cordis.patch.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch {}
  if (!text.trim()) text = '# dsh web profile patch（由 DSH Desktop 维护）\n';

  const name = pluginManagerResolveName(id);
  if (!enabled && !name) return { ok: false, error: '无法解析插件包名: ' + id };

  let patched;
  try {
    patched = togglePluginInPatch(text, id, !!enabled, name);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
  if (patched !== text) {
    try { writePatchAtomic(file, patched); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 内置 Agent 预设同步：local 模式的预设由 npm start / after-pack 直接写入
// Windows 侧内置 dsh 包的 config/agent-presets；WSL 托管模式的 dsh 是 WSL 内
// npm 安装的干净包，不包含壳自带的 8 个预设，因此模式列表比 local 少。
// 这里经 UNC 把 assets/agent-presets 幂等复制进 WSL agent 包，让两种后端
// 看到的模式一致（_preset 是共享模块目录，installBuiltinPresets 一并处理）。
// ---------------------------------------------------------------------------
function syncBuiltinAgentPresets() {
  if (!IS_WIN || !isWslMode()) return;
  try {
    const home = effectiveDshHome();
    if (!home) { log('boot', 'DSH_HOME 未解析，跳过内置 Agent 预设同步'); return; }
    const dshPkgDir = path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh');
    if (!fs.existsSync(path.join(dshPkgDir, 'package.json'))) {
      log('boot', 'WSL 内 dsh 包未就绪，跳过内置 Agent 预设同步');
      return;
    }
    const dests = installBuiltinPresets(dshPkgDir);
    log('boot', '已同步 ' + dests.length + ' 个内置 Agent 预设到 WSL dsh: ' + dests.map((d) => path.basename(d)).join(', '));
  } catch (err) {
    log('boot', '同步内置 Agent 预设到 WSL 失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// 本地模式内置 Agent 预设同步（WSL 同族问题的 local 半边）：after-pack /
// npm start 只把 assets/agent-presets 写进「内置」dsh 包；用户把 agent 更新到
// overlay（userData/agent）后，overlay 是干净的 npm 包（updater.applyUpdate
// 全新安装），8 个壳内置预设会消失（模式列表比内置/WSL 少）。这里幂等地把
// 预设补进「当前生效」的 dsh 包：overlay 存在则 overlay，否则内置包（幂等，
// 写入失败只告警不中断）。与 syncBuiltinAgentPresets 一起保证三种布局
// （内置 / 更新 overlay / WSL）模式列表一致。
// ---------------------------------------------------------------------------
function syncLocalAgentPresets() {
  if (isWslMode()) return; // WSL 走 UNC 的 syncBuiltinAgentPresets
  try {
    const active = updater.overlayVersion(updCtx())
      ? path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh')
      : path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh');
    if (!fs.existsSync(path.join(active, 'package.json'))) {
      log('boot', '未找到生效的 dsh 包，跳过内置 Agent 预设同步');
      return;
    }
    const dests = installBuiltinPresets(active);
    log('boot', '已同步 ' + dests.length + ' 个内置 Agent 预设到 ' + (updater.overlayVersion(updCtx()) ? 'agent overlay' : '内置 dsh 包') + ': ' + dests.map((d) => path.basename(d)).join(', '));
  } catch (err) {
    log('boot', '同步内置 Agent 预设失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// dsh web 运行时闪跳修复：官方 dsh-client-runtime 在会话列表刷新
// （mergeOrderedBaseline）时会丢弃「本地已创建、宿主全量列表尚未回显」的
// 新会话，使 current 瞬时变 undefined，UI 闪回「选择工作区/无会话」状态。
// 这里幂等地把补丁写进运行时文件；dsh 包更新后本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applyRuntimeFlashFix() {
  // 覆盖运行副本：profile fallback、内置 app 副本、更新 overlay；
  // wsl 托管模式目标换成 WSL 安装目录（profile fallback + agent，经 UNC 写穿，
  // fallback 符号链接未创建时由 agent 直连目标兜底）。
  const wslHome = effectiveDshHome();
  const targets = isWslMode()
    ? [
        path.join(wslHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
        path.join(wslHome, 'agent', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
      ]
    : [
        path.join(dshHome || path.join(os.homedir(), '.dsh'), 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
        path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
        path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
      ];
  const oldPat = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
  const newPat = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';
  for (const file of targets) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', 'runtime 补丁: 读取失败，跳过 ' + file); continue; }
      if (src.includes(newPat)) { log('boot', 'runtime 补丁: 已应用，跳过 ' + file); continue; }
      if (!src.includes(oldPat)) { log('boot', 'runtime 补丁: 未匹配到目标代码（版本可能已变更），跳过 ' + file); continue; }
      src = src.replace(oldPat, newPat);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', 'runtime 补丁: 已修复会话列表刷新闪跳 ' + file);
    } catch (err) {
      log('boot', 'runtime 补丁失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// dsh-host-apiproxy 设置暴露补丁：官方代理只把少数命名空间暴露给浏览器端
// 配置客户端（WEB_SETTINGS_NAMESPACES 白名单）。我们配套的 dsh-prompt-custom /
// dsh-third-party-thinking / dsh-vision / dsh-conversation-tweaks 等设置节
// 依赖这些命名空间暴露，否则设置页对应栏目显示「设置不可用」甚至消失。
// 这里幂等地把命名空间追加进白名单，并同时覆盖三处运行副本：
//   - profile fallback（即内置 app 副本，通过 junction 写穿）
//   - 内置 app node_modules
//   - 用户更新过的 agent overlay（部分用户看不见插件设置的根因：overlay 副本从未被补）
// ---------------------------------------------------------------------------
function applyPromptExposeFix() {
  // 覆盖运行副本：profile fallback、内置 app 副本、更新 overlay；
  // wsl 托管模式目标换成 WSL 安装目录（profile fallback + agent，经 UNC 写穿）。
  const wslHome = effectiveDshHome();
  const targets = isWslMode()
    ? [
        path.join(wslHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
        path.join(wslHome, 'agent', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
      ]
    : [
        path.join(dshHome || path.join(os.homedir(), '.dsh'), 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
        path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
        path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
      ];
  const namespaces = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-vision', 'dsh-conversation-tweaks'];
  for (const file of targets) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', '提示词暴露补丁: 读取失败，跳过 ' + file); continue; }
      const declIdx = src.indexOf('const WEB_SETTINGS_NAMESPACES = [');
      if (declIdx === -1) {
        log('boot', '提示词暴露补丁: 未找到 WEB_SETTINGS_NAMESPACES（版本可能已变更），跳过 ' + file);
        continue;
      }
      // 只认声明之后最近的 `];`，避免插进文件里其它数组。
      const closeIdx = src.indexOf('];', declIdx);
      if (closeIdx === -1) {
        log('boot', '提示词暴露补丁: 未匹配到命名空间数组收尾，跳过 ' + file);
        continue;
      }
      const arrText = src.slice(declIdx, closeIdx);
      const missing = namespaces.filter((ns) => !arrText.includes('"' + ns + '"'));
      if (missing.length === 0) {
        log('boot', '提示词暴露补丁: 已应用，跳过 ' + file);
        continue;
      }
      const block = ',\n' + missing.map((ns) => '\t"' + ns + '"').join(',\n') + '\n';
      src = src.slice(0, closeIdx) + block + src.slice(closeIdx);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', '提示词暴露补丁: 已把 ' + missing.join(', ') + ' 加入设置白名单 ' + file);
    } catch (err) {
      log('boot', '提示词暴露补丁失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 文本模型自动识图补丁：官方 apiproxy 在 session.prompt 入口检查模型是否支持
// image 输入，不支持就直接拒绝。本补丁复用已安装的 dsh-vision 插件配置
// （设置 → 识图插件（view_image）的 VLM baseURL/model/apiKey），把图片转述为
// 详细文字（含 OCR）后再发送，文本模型也能“看图”。幂等，覆盖三处运行副本。
// ---------------------------------------------------------------------------
function applyImageSendFix() {
  const targets = [
    path.join(dshHome || path.join(os.homedir(), '.dsh'), 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
  ];
  const HELPER_MARKER = 'async function describeImagesWithVision(ctx, content)';
  const HELPER_ANCHOR = '/** Validate one prompt as a batch before publishing any durable image object. */';
  const HELPER = `
/** DSH Desktop: reuse the dsh-vision VLM config to describe images as text so text-only models can "see" them. */
async function describeImagesWithVision(ctx, content) {
	const settings = ctx.get("settings");
	let vision = null;
	if (settings !== void 0 && typeof settings.get === "function") {
		// dsh-desktop fix: read the resolved HOST-side value (settings.get), not the
		// redacted wire snapshot. redactSecrets strips role('secret') fields, so
		// describe({redactSecrets:true}) drops apiKey and every keyed VLM endpoint
		// answers 401 — image sends failed for configured users.
		const resolved = settings.get("dsh-vision");
		if (resolved !== void 0 && typeof resolved === "object") vision = resolved;
	}
	if (vision === null && settings !== void 0 && typeof settings.describe === "function") {
		try {
			const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");
			if (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;
		} catch {}
	}
	if (vision === null || typeof vision.baseURL !== "string" || vision.baseURL.trim() === "" || typeof vision.model !== "string" || vision.model.trim() === "") {
		throw new Error("未配置识图服务：请到 设置 → 识图插件（view_image） 填写 VLM 接口地址与模型");
	}
	const apiKey = typeof vision.apiKey === "string" ? vision.apiKey.trim() : "";
	const endpoint = vision.baseURL.replace(/\\/+$/, "") + "/chat/completions";
	const out = [];
	let imageNo = 0;
	for (const part of content) {
		if (part.type !== "image") {
			if (part.type === "text") out.push(part);
			continue;
		}
		imageNo += 1;
		const dataUrl = \`data:\${part.mediaType};base64,\${part.data}\`;
		const payload = {
			model: vision.model,
			stream: false,
			messages: [
				{ role: "system", content: "You are an image understanding assistant. Describe the image in exhaustive detail and transcribe every visible text (OCR). If it is a UI, document, table, chart or code, preserve its structure. Answer in Chinese unless the user's language clearly differs." },
				{ role: "user", content: [
					{ type: "text", text: "请把这张图片完整转述为文字：包含画面内容、结构与全部可见文字（逐字 OCR）。" },
					{ type: "image_url", image_url: { url: dataUrl } }
				] }
			]
		};
		const headers = { "content-type": "application/json" };
		if (apiKey !== "") headers.authorization = "Bearer " + apiKey;
		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(120000)
		});
		if (!response.ok) {
			const bodyText = await response.text().catch(() => "");
			throw new Error("识图服务返回 HTTP " + response.status + "：" + bodyText.slice(0, 400));
		}
		const data = await response.json();
		const description = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
		if (typeof description !== "string" || description.trim() === "") throw new Error("识图服务未返回有效文字描述");
		out.push({ type: "text", text: "[图片" + imageNo + "] " + description.trim() });
	}
	return out;
}
`;
  const GATE_MARKER = 'if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {';
  const GATE_NEW = `if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) {
							try {
								admittedContent = await describeImagesWithVision(ctx, content);
							} catch (error) {
								return err(request, {
									code: "attachment-error",
									message: \`图片自动转述失败：\${error instanceof Error ? error.message : String(error)}。请在 设置 → 识图插件（view_image） 配置 VLM 后重试。\`,
									details: { reason: "IMAGE_DESCRIPTION_FAILED" }
								});
							}
						}`;

  for (const file of targets) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', '识图发送补丁: 读取失败，跳过 ' + file); continue; }
      if (src.includes(HELPER_MARKER)) {
        log('boot', '识图发送补丁: 已应用，跳过 ' + file);
        continue;
      }
      // 1) 插入转述 helper（此后所有索引必须基于插入后的 src 重新计算）
      const anchorIdx = src.indexOf(HELPER_ANCHOR);
      if (anchorIdx === -1) {
        log('boot', '识图发送补丁: 未找到 helper 插入锚点（版本可能已变更），跳过 ' + file);
        continue;
      }
      src = src.slice(0, anchorIdx) + HELPER + '\n' + src.slice(anchorIdx);
      // 2) prompt 入口：声明 admittedContent
      const hasImageIdx = src.indexOf('const hasImage = content.some((part) => part.type === "image");');
      if (hasImageIdx === -1) {
        log('boot', '识图发送补丁: 未找到 hasImage 入口（版本可能已变更），跳过 ' + file);
        continue;
      }
      src = src.slice(0, hasImageIdx) + 'let admittedContent = content;\n\t\t\t\t' + src.slice(hasImageIdx);
      // 3) 把“模型不支持图片”的直接拒绝替换为自动转述
      const gateIdx = src.indexOf(GATE_MARKER);
      if (gateIdx === -1) {
        log('boot', '识图发送补丁: 未找到模型图片门槛（版本可能已变更），跳过 ' + file);
        continue;
      }
      const gateEnd = src.indexOf('});', gateIdx);
      if (gateEnd === -1) {
        log('boot', '识图发送补丁: 图片门槛收尾异常，跳过 ' + file);
        continue;
      }
      src = src.slice(0, gateIdx) + GATE_NEW + src.slice(gateEnd + 3);
      // 4) durablePromptContent 使用转述后的内容（从门槛之后查找调用点，避免命中函数定义）
      const callIdx = src.indexOf('durablePromptContent(ctx, content)', gateIdx);
      if (callIdx === -1) {
        log('boot', '识图发送补丁: 未找到 durablePromptContent 调用，跳过 ' + file);
        continue;
      }
      src = src.slice(0, callIdx) + 'durablePromptContent(ctx, admittedContent)' + src.slice(callIdx + 'durablePromptContent(ctx, content)'.length);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', '识图发送补丁: 已启用文本模型图片自动转述 ' + file);
    } catch (err) {
      log('boot', '识图发送补丁失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 图片自动转述 apiKey 修复：官方 apiproxy 内置的 describeImagesWithVision 用
// settings.describe({ redactSecrets: true }) 读 dsh-vision 配置——redactSecrets
// 会把 role('secret') 的 apiKey 整字段删除，带密钥校验的 VLM 端点必然 401，
// prompt 被拒、客户端提示「图片发送失败」。这里幂等改写为先读 settings.get()
// 的宿主侧未脱敏解析值（保留 apiKey），describe 快照降级为回退。dsh 更新后
// 本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applyVisionKeyFix() {
  const guardMarker = 'dsh-desktop fix: read the resolved HOST-side value';
  const from = '\tlet vision = null;\n\tif (settings !== void 0 && typeof settings.describe === "function") {\n\t\ttry {\n\t\t\tconst descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");\n\t\t\tif (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;\n\t\t} catch {}\n\t}';
  const to = '\tlet vision = null;\n\tif (settings !== void 0 && typeof settings.get === "function") {\n\t\t// dsh-desktop fix: read the resolved HOST-side value (settings.get), not the\n\t\t// redacted wire snapshot. redactSecrets strips role(\'secret\') fields, so\n\t\t// describe({redactSecrets:true}) drops apiKey and every keyed VLM endpoint\n\t\t// answers 401 — image sends failed for configured users.\n\t\tconst resolved = settings.get("dsh-vision");\n\t\tif (resolved !== void 0 && typeof resolved === "object") vision = resolved;\n\t}\n\tif (vision === null && settings !== void 0 && typeof settings.describe === "function") {\n\t\ttry {\n\t\t\tconst descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");\n\t\t\tif (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;\n\t\t} catch {}\n\t}';
  const targets = [
    path.join(dshHome || path.join(os.homedir(), '.dsh'), 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js'),
  ];
  for (const file of targets) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src2 = readFileCached(file);
      if (src2 === null) { log('boot', '识图密钥补丁: 读取失败，跳过 ' + file); continue; }
      if (src2.includes(guardMarker)) { log('boot', '识图密钥补丁: 已应用，跳过 ' + file); continue; }
      if (!src2.includes(from)) { log('boot', '识图密钥补丁: 锚点未匹配（版本可能已变化），跳过 ' + file); continue; }
      src2 = src2.replace(from, to);
      fs.writeFileSync(file, src2, { encoding: 'utf8' });
      log('boot', '识图密钥补丁: 已修复 apiKey 被脱敏截断 ' + file);
    } catch (err) {
      log('boot', '识图密钥补丁失败(' + file + '): ' + err.message);
    }
  }
}
// ---------------------------------------------------------------------------
// dsh 装配层防护：profile 自有的 cordis.patch.yml 属于用户数据，dsh 官方设计是
// 「补丁文件损坏必须启动失败」（fail loud）。但该文件损坏会让桌面端永久无法
// 启动。这里像 applyRuntimeFlashFix 一样幂等地改写 @deepseek-ai/dsh-app-boot：
// 把 loadProfile 对 profile patch 的严格加载替换为「解析失败 → 备份 + 重置为
// 空列表并继续启动」的自愈加载；CLI 等其它入口同样受益。dsh 更新后本函数会在
// 下次启动重新应用。
// ---------------------------------------------------------------------------
function applyProfilePatchGuard() {
  const guardMarker = 'function loadUserPatchLayer';
  const callSite = '\t\tpatches: options.userLayer !== false && existsSync(patchPath) ? loadOverlayPatches(binName, patchPath) : []';
  const callReplacement = '\t\tpatches: loadUserPatchLayer(binName, patchPath, options)';
  const insertAfter = '\treturn parsePatchList(binName, file, content, "overlay");\n}';
  const injected =
    '/** dsh-desktop guard: the profile\'s own patch layer is user-owned data; a broken file must not brick\n' +
    ' * the surface. Back the broken file up, reset the layer to an empty list, and boot without it.\n' +
    ' */\n' +
    'function loadUserPatchLayer(binName, patchPath, options) {\n' +
    '\tif (options.userLayer === false || !existsSync(patchPath)) return [];\n' +
    '\ttry {\n' +
    '\t\treturn loadOverlayPatches(binName, patchPath);\n' +
    '\t} catch (error) {\n' +
    '\t\ttry {\n' +
    '\t\t\tconst backup = `${patchPath}.broken-${Date.now()}`;\n' +
    '\t\t\twriteFileSync(backup, readFileSync(patchPath, "utf8"));\n' +
    '\t\t\twriteFileSync(patchPath, "# recovered by dsh: the previous content failed to parse and was moved to\\n# " + backup + "\\n[]\\n");\n' +
    '\t\t} catch {}\n' +
    '\t\tprocess.stderr.write(`${binName}: ${patchPath} failed to parse (${String(error?.message ?? error)}); the broken file was moved aside and the profile booted without its patch layer\\n`);\n' +
    '\t\treturn [];\n' +
    '\t}\n' +
    '}';
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const candidates = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', 'profile patch 防护: 读取失败，跳过 ' + file); continue; }
      if (src.includes(guardMarker)) continue; // 已应用（幂等）
      if (!src.includes(callSite) || !src.includes(insertAfter)) {
        log('boot', 'profile patch 防护: ' + file + ' 锚点未匹配（dsh 版本可能已变化），跳过');
        continue;
      }
      src = src.replace(callSite, callReplacement);
      src = src.replace(insertAfter, insertAfter + '\n\n' + injected);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', 'profile patch 防护: 已注入自愈加载到 ' + file);
    } catch (err) {
      log('boot', 'profile patch 防护失败: ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// profile bundle 装配防护：官方 dsh-app-boot 对 profile bundle 缺失/损坏
// fail-loud（resolveBundleDir 抛 cannot resolve profile bundle、无
// dsh.bundle.patch 声明抛 declares no dsh.bundle、bundle 补丁层损坏抛
// failed to parse overlay），都会让 dsh web 以退出码 1 启动失败。这里像
// applyProfilePatchGuard 一样幂等地改写 @deepseek-ai/dsh-app-boot：bundle
// 层逐个跳过（stderr 诊断，profile manifest 损坏则备份 + 模板重建）；同时
// 改写 dsh 的 profile-boot 装配（家级 cordis.patch.yml 与 profile 补丁层
// 损坏时备份 + 重置，覆盖启动与 HMR 热重载）。变换逻辑收口在
// profile-bundle-heal.js；dsh 更新后本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applyProfileBundleGuard() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const appBootCandidates = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
  ];
  for (const file of appBootCandidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const src = readFileCached(file);
      if (src === null) { log('boot', 'profile bundle 防护: 读取失败，跳过 ' + file); continue; }
      const out = applyAppBootBundleGuard(src);
      if (!out.changed) {
        if (!src.includes(PROFILE_BUNDLE_GUARD_MARKER)) {
          log('boot', 'profile bundle 防护: ' + file + ' 锚点未匹配（dsh 版本可能已变化），跳过');
        }
        continue;
      }
      fs.writeFileSync(file, out.src, { encoding: 'utf8' });
      log('boot', 'profile bundle 防护: 已注入自愈装配到 ' + file);
    } catch (err) {
      log('boot', 'profile bundle 防护失败(' + file + '): ' + err.message);
    }
  }
  const profileBootDirs = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
  ];
  for (const dir of profileBootDirs) {
    let names;
    try { names = fs.readdirSync(dir).filter((f) => /^profile-boot-.+\.js$/.test(f)); } catch { continue; }
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const src = readFileCached(file);
        if (src === null) { log('boot', 'profile bundle 防护: 读取失败，跳过 ' + file); continue; }
        const out = applyProfileBootBundleGuard(src);
        if (!out.changed) {
          if (!src.includes(PROFILE_BOOT_GUARD_MARKER)) {
            log('boot', 'profile bundle 防护: ' + file + ' 锚点未匹配（dsh 版本可能已变化），跳过');
          }
          continue;
        }
        fs.writeFileSync(file, out.src, { encoding: 'utf8' });
        log('boot', 'profile bundle 防护: 已注入自愈装配到 ' + file);
      } catch (err) {
        log('boot', 'profile bundle 防护失败(' + file + '): ' + err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// dsh-settings 注册防护：settings.yaml 中某命名空间的存储配置节非法（非对象或
// 字段类型错误，常见于手改文件）时，installSettingsSection 里的 register() 会
// 抛异常 → 消费插件 fiber 失败 → dsh fail-loud 启动崩溃。这里幂等地改写
// @deepseek-ai/dsh-settings：register 失败改为告警 + 回退组合配置，命名空间
// 本次启动不可用但不阻断启动。dsh 更新后本函数会在下次启动重新应用。
// ---------------------------------------------------------------------------
function applySettingsSectionGuard() {
  const guardMarker = 'dsh-desktop guard: an invalid stored section must not brick';
  const anchor = '\t\tconst scope = sctx.settings.register(ns, schema, {';
  const guarded =
    '\t\tlet scope;\n' +
    '\t\ttry {\n' +
    '\t\t\tscope = sctx.settings.register(ns, schema, {\n' +
    '\t\t\t\tbase: entry,\n' +
    '\t\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }\n' +
    '\t\t\t});\n' +
    '\t\t} catch (error) {\n' +
    '\t\t\t// dsh-desktop guard: an invalid stored section must not brick the consumer\n' +
    '\t\t\t// fiber (fail-loud boot). Fall back to the composition config; the\n' +
    '\t\t\t// namespace simply stays unavailable until the stored section is fixed.\n' +
    '\t\t\tsctx.logger.warn("settings: registration for \\"%s\\" failed; falling back to the composition config this boot", ns);\n' +
    '\t\t\tsctx.logger.warn(error);\n' +
    '\t\t\ttry {\n' +
    '\t\t\t\thooks.setSource(() => entry);\n' +
    '\t\t\t\thooks.onChange();\n' +
    '\t\t\t} catch {}\n' +
    '\t\t\treturn;\n' +
    '\t\t}\n' +
    '\t\thooks.setSource(() => scope.get());';
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const candidates = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', 'settings 注册防护: 读取失败，跳过 ' + file); continue; }
      if (src.includes(guardMarker)) continue; // 已应用（幂等）
      if (!src.includes(anchor)) {
        log('boot', 'settings 注册防护: ' + file + ' 锚点未匹配（dsh 版本可能已变化），跳过');
        continue;
      }
      const from2 = '\t\tconst scope = sctx.settings.register(ns, schema, {\n\t\t\tbase: entry,\n\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }\n\t\t});\n\t\thooks.setSource(() => scope.get());';
      src = src.replace(from2, guarded);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', 'settings 注册防护: 已注入到 ' + file);
    } catch (err) {
      log('boot', 'settings 注册防护失败: ' + err.message);
    }
  }
}
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// dsh-client-ui-workspace 搜索栏修复：侧边栏收起（rail）时点「搜索会话」会
// 先 expandSidebar() 再 setSearchExpanded(true)。React 状态提交后，宽侧边栏
// 新挂的 document click 监听会捕获同一个 click（旧 rail 按钮已不在 searchRoot
// 内），立即把 searchExpanded 复位为 false——表现为「只是切到对话，搜索框没
// 展开」。这里幂等地给监听加 searchOnExpand 宽限，并补进依赖数组。
// ---------------------------------------------------------------------------
function applyWorkspaceSearchRailFix() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const guardMarker = 'dsh-desktop fix: rail search expansion';
  const oldGuard = '\t\t\t\tif (!wide || !searchExpanded) return;';
  const newGuard = '\t\t\t\tif (!wide || !searchExpanded || searchOnExpand) return; // ' + guardMarker;
  const oldDeps = '\t\t\t}, [\n\t\t\t\tnormalizedQuery,\n\t\t\t\twide,\n\t\t\t\tsearchExpanded\n\t\t\t]);';
  const newDeps = '\t\t\t}, [\n\t\t\t\tnormalizedQuery,\n\t\t\t\twide,\n\t\t\t\tsearchExpanded,\n\t\t\t\tsearchOnExpand\n\t\t\t]);';
  const candidates = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
  ];
  for (const file of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src = readFileCached(file);
      if (src === null) { log('boot', 'workspace 搜索栏修复: 读取失败，跳过 ' + file); continue; }
      if (src.includes(guardMarker)) { log('boot', 'workspace 搜索栏修复: 已应用，跳过 ' + file); continue; }
      if (!src.includes(oldGuard) || !src.includes(oldDeps)) {
        log('boot', 'workspace 搜索栏修复: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file);
        continue;
      }
      src = src.replace(oldGuard, newGuard).replace(oldDeps, newDeps);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', 'workspace 搜索栏修复: 已注入到 ' + file);
    } catch (err) {
      log('boot', 'workspace 搜索栏修复失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 插件页标签合并补丁：官方「全部」只读清单与 dsh-plugin-manager 的「管理」标签
// 功能重叠（管理已含全量列表 + 搜索 + 分类 + 开关）。幂等地从插件页标签列表
// 中过滤掉 id 为 "all" 的只读清单，让「管理」成为唯一的插件列表入口。
// 目标：内置副本 + profile fallback；锚点不匹配（上游将来修复后）自动跳过。
// ---------------------------------------------------------------------------
function applyPluginInventoryTabMergeFix() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const marker = 'dsh-desktop fix: hide inventory tab';
  const oldPat = 'tabs = ctx.slots.entries("settings.plugins.tab").map((entry) => ({';
  const newPat = 'tabs = ctx.slots.entries("settings.plugins.tab").filter((entry) => (entry.options.id ?? "") !== "all").map((entry) => ({ // ' + marker;
  const candidates = [
    path.join(__dirname, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-plugins', 'lib', 'client.js'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-plugins', 'lib', 'client.js'),
  ];
  for (const file of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      let src = fs.readFileSync(file, 'utf8');
      if (src.includes(marker)) { log('boot', '插件页标签合并: 已应用，跳过 ' + file); continue; }
      if (!src.includes(oldPat)) { log('boot', '插件页标签合并: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file); continue; }
      src = src.replace(oldPat, newPat);
      fs.writeFileSync(file, src, { encoding: 'utf8' });
      log('boot', '插件页标签合并: 已隐藏「全部」只读清单 ' + file);
    } catch (err) {
      log('boot', '插件页标签合并失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// issue #20 运行时补丁：dsh-web-search-deepseek 的「接口地址」契约与拼接修复。
// 补丁本体在 scripts/patch-web-search-baseurl.js（与打包补丁共用同一实现，
// 避免两处漂移）；这里覆盖三处运行副本：profile fallback（junction 写穿）、
// 内置 app 副本、用户更新过的 agent overlay。锚点不匹配（上游将来修复后）
// 自动跳过，绝不损坏文件。
// ---------------------------------------------------------------------------
function applyWebSearchBaseUrlFix() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const targets = [
    path.join(home, 'profiles', 'node_modules'),
    path.join(__dirname, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
  ];
  for (const root of targets) {
    if (!root || !fs.existsSync(root)) continue;
    try {
      const n = patchWebSearchBaseUrl(root, (m) => log('boot', m));
      if (n > 0) log('boot', 'web-search baseURL 补丁: 已应用到 ' + root);
    } catch (err) {
      log('boot', 'web-search baseURL 补丁失败(' + root + '): ' + err.message);
    }
  }
}
// ---------------------------------------------------------------------------
// issue #36 运行时补丁：dsh-client-ui-primitives 的 Menu portal 弹层在条目很多
// （内置 8 个 Agent 预设 + npm 自带 + 用户安装叠加）时没有高度上限，place()
// 会把超出视口的弹层推到屏幕上方，顶部条目被裁掉且无法触达（「预设多了
// 上面的会不显示」）。补丁本体在 scripts/patch-menu-viewport.js（与打包补丁
// 共用同一实现）；覆盖三处运行副本：profile fallback、内置 app 副本、用户
// 更新过的 agent overlay。锚点不匹配（上游将来修复后）自动跳过，绝不损坏。
// ---------------------------------------------------------------------------
function applyMenuViewportFix() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const targets = [
    path.join(home, 'profiles', 'node_modules'),
    path.join(__dirname, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
  ];
  for (const root of targets) {
    if (!root || !fs.existsSync(root)) continue;
    try {
      const n = patchMenuViewport(root, (m) => log('boot', m));
      if (n > 0) log('boot', 'menu 视口补丁: 已应用到 ' + root);
    } catch (err) {
      log('boot', 'menu 视口补丁失败(' + root + '): ' + err.message);
    }
  }
}
// ---------------------------------------------------------------------------
// 对话删除 / 归档管理运行时补丁（dsh-session-manager 插件的前置依赖）：
// dsh-workspace（unarchiveSession）+ dsh-host-apiproxy（unarchiveSession /
// deleteSession RPC）+ dsh-client-connection（API 面 + schema）+
// dsh-client-ui-workspace（会话行菜单「删除对话」）。补丁本体在
// scripts/patch-session-manage.js（幂等、锚点不匹配自动跳过）；覆盖三处运行
// 副本：profile fallback、内置 app 副本、用户更新过的 agent overlay。
// ---------------------------------------------------------------------------
function applySessionManageFix() {
  const home = effectiveDshHome() || path.join(os.homedir(), '.dsh');
  const targets = [
    path.join(home, 'profiles', 'node_modules'),
    path.join(__dirname, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
  ];
  for (const root of targets) {
    if (!root || !fs.existsSync(root)) continue;
    try {
      const n = patchSessionManage(root, (m) => log('boot', m));
      if (n > 0) log('boot', '对话删除补丁: 已应用到 ' + root);
    } catch (err) {
      log('boot', '对话删除补丁失败(' + root + '): ' + err.message);
    }
  }
}
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
  // 集成测试（DSH_DESKTOP_TEST=1）用 dev electron 以「文件路径」方式启动，此时
  // app.isPackaged 也为 true；若不拦截，测试会把用户真实的开始菜单/桌面快捷方式
  // 改指向 node_modules 下的开发用 electron.exe（曾实测发生）。显式拦一道。
  if (process.env.DSH_DESKTOP_TEST === '1') return;
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
    const desktopDir = app.getPath('desktop');
    const desktop = path.join(desktopDir, 'DSH Desktop.lnk');
    const ico = shortcutIconPath();
    const opts = {
      target,
      description: 'DeepSeek Harness 桌面客户端',
      ...(ico ? { icon: ico, iconIndex: 0 } : {}),
      appUserModelId: 'com.deepseek.dsh.desktop',
    };
    let changed = false;

    // 去重（用户反馈「每次启动自动生成多个快捷方式」）：清理规范名之外的
    // 同族快捷方式——Windows 自动重命名的副本（“DSH Desktop (1).lnk”）、
    // 手动“发送到桌面”的副本（“DSH Desktop - 快捷方式.lnk”）、旧版本残留等，
    // 只保留规范名一个。前缀匹配，不会误删用户其它快捷方式。
    const cleanupDir = (dir) => {
      let removed = 0;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
      for (const e of entries) {
        if (!e.isFile() || !/^DSH Desktop.*\.lnk$/i.test(e.name)) continue;
        if (e.name.toLowerCase() === 'DSH Desktop.lnk') continue;
        try { fs.rmSync(path.join(dir, e.name), { force: true }); removed++; } catch {}
      }
      return removed;
    };
    const removedDesktop = cleanupDir(desktopDir);
    const removedStart = cleanupDir(linksDir);
    if (removedDesktop + removedStart > 0) {
      log('boot', '快捷方式去重: 清理桌面 ' + removedDesktop + ' 个、开始菜单 ' + removedStart + ' 个重复快捷方式');
    }

    // exe 被移动过，或图标设计更新过：替换现有快捷方式（修复“指向的文件消失”）。
    if ((settings.shortcutTarget && settings.shortcutTarget !== target) || settings.shortcutIcon !== SHORTCUT_ICON_VERSION) {
      for (const p of [startMenu, desktop]) {
        if (fs.existsSync(p)) {
          try { shell.writeShortcutLink(p, 'replace', opts); changed = true; } catch {}
        }
      }
    }
    // 开始菜单快捷方式是系统通知的前置条件：缺失则创建。
    if (!fs.existsSync(startMenu)) {
      try { shell.writeShortcutLink(startMenu, 'create', opts); changed = true; } catch {}
    }
    // 桌面快捷方式：缺失则补建（便携版与安装版一致）。去重逻辑在函数开头先行，
    // 保证桌面上至多保留一个规范名快捷方式，因此「缺失补建」不会复现旧版
    // 「每次启动生成多个快捷方式」的问题；同时自愈「更新后桌面图标消失」——
    // 安装版更新（NSIS 向导取消勾选创建 / 旧版卸载清理 / 手动覆盖安装目录）后
    // 桌面快捷方式可能缺失，此前安装版不再自动补建导致图标永久丢失。
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
  // 保留 pendingClientUpdate / pendingClientVersion，只记录一次安装尝试。
  // 本次尝试可能失败（安装器被取消/拦截、文件被占用、目录只读），下次启动时
  // offerPendingClientUpdate 会依据「版本仍未升级 + clientUpdateAttempt」进入
  // 「客户端更新未完成」重试流程；更新成功后新版本启动时会因
  // pending.version <= APP_VERSION 自动清掉标记。
  try {
    const s = updater.loadSettings(ctx);
    s.clientUpdateSnoozeUntil = null;
    s.clientUpdateAttempt = {
      version: pending && pending.version ? pending.version : null,
      at: Date.now(),
      appVersion: APP_VERSION,
      path: pending && pending.path ? pending.path : null,
      source: pending && pending.source ? pending.source : null,
    };
    updater.saveSettings(ctx, s);
    // 回读校验：安装尝试必须真正落盘，否则更新失败后无法识别为「未完成」。
    const verify = updater.loadSettings(ctx);
    if (!verify.clientUpdateAttempt || verify.clientUpdateAttempt.at !== s.clientUpdateAttempt.at) {
      verify.clientUpdateAttempt = s.clientUpdateAttempt;
      verify.clientUpdateSnoozeUntil = null;
      updater.saveSettings(ctx, verify);
      log('client-update', '安装尝试记录第一次未落盘，已重试并回读确认');
    }
    log('client-update', '已记录安装尝试并保留待安装标记（更新失败后可在下次启动重试）');
  } catch (err) {
    log('client-update', '记录安装尝试失败: ' + err.message);
  }
  try {
    killTreeSync(serverProc);
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
    // 先关进度窗再弹「下载完成」：避免窗口叠层，也保证对话框不被遮挡。
    closeUpdateWindow(progressWin);
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
    closeUpdateWindow(progressWin);
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
    settings.pendingClientVersion = null;
    settings.clientUpdateAttempt = null;
    updater.saveSettings(ctx, settings);
    return;
  }
  if (updater.compareVersions(pending.version, APP_VERSION) <= 0) {
    settings.pendingClientUpdate = null;
    settings.pendingClientVersion = null;
    settings.clientUpdateAttempt = null;
    settings.clientUpdateSnoozeUntil = null;
    updater.saveSettings(ctx, settings);
    return;
  }
  // 用户选过「稍后」后，24 小时内不再重复弹同一个待安装提示。
  const snoozeUntil = Number(settings.clientUpdateSnoozeUntil) || 0;
  if (snoozeUntil > Date.now()) return;
  // 上一轮已点过「立即重启」但当前仍是旧版本 → 更新没有安装成功。
  // 不再用「有待安装」的文案循环打扰，改为明确告知并允许重试/看日志/稍后。
  const attempt = settings.clientUpdateAttempt;
  const failedBefore = !!(attempt && attempt.version === pending.version && attempt.appVersion === APP_VERSION);
  if (failedBefore) {
    const applyLog = path.join(userDataDir, 'updates', 'apply-update.log');
    showBox({
      type: 'warning',
      title: '客户端更新未完成',
      message: `DSH Desktop v${pending.version} 尚未安装成功（当前仍为 v${APP_VERSION}）。`,
      detail: '已下载的安装包仍保留在数据目录的 updates 文件夹中，可以重试安装。\n\n安装脚本日志：' + applyLog,
      buttons: ['重试安装', '打开日志', '稍后'],
      defaultId: 0,
      cancelId: 2,
    }).then(({ response }) => {
      if (response === 0) {
        const s = updater.loadSettings(ctx);
        s.clientUpdateSnoozeUntil = null;
        updater.saveSettings(ctx, s);
        quitForClientUpdate(ctx, pending);
        return;
      }
      if (response === 1) {
        shell.openPath(applyLog).catch((err) => log('client-update', '打开更新日志失败: ' + err.message));
        return;
      }
      const s = updater.loadSettings(ctx);
      s.clientUpdateSnoozeUntil = Date.now() + 24 * 60 * 60 * 1000;
      updater.saveSettings(ctx, s);
      log('client-update', '用户暂缓处理未完成的客户端更新 ' + pending.version + '（24h）');
    });
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
    if (response !== 0) {
      const s = updater.loadSettings(ctx);
      s.clientUpdateSnoozeUntil = Date.now() + 24 * 60 * 60 * 1000;
      updater.saveSettings(ctx, s);
      return;
    }
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
    // H2/H3 文件围栏：与 dsh:file-open / dsh:file-revert 一致，只允许读取
    // 「会话 cwd」之下的项目文件。否则本服务会成为任意本地文件读取通道：
    // 预览 iframe 与本服务同源（allow-same-origin），可读取并外传
    // settings / 凭据等敏感文件（实测 C:\Windows、userData 等均可读出）。
    if (!isUnderFileRoots(p)) {
      res.writeHead(403);
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
  const listenPreview = (retriesLeft) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      if (CHROMIUM_RESTRICTED_PORTS.has(port) && retriesLeft > 0) {
        log("boot", `预览服务端口 ${port} 受限，重试换端口（剩余 ${retriesLeft} 次）`);
        server.close(() => listenPreview(retriesLeft - 1));
        return;
      }
      previewStaticPort = port;
      log("boot", "预览静态服务已启动: http://127.0.0.1:" + previewStaticPort);
    });
  };
  listenPreview(4);
  server.on("error", (err) => log("boot", "预览静态服务失败: " + err.message));
}

function setupTestChannel() {
  const dir = process.env.DSH_DESKTOP_TEST_DIR;
  if (!process.env.DSH_DESKTOP_TEST || !dir) return;
  const ctrlFile = path.join(dir, 'test-control.json');
  const statFile = path.join(dir, 'test-status.json');
  const writeStatus = (id, ok, detail) => {
    try {
      fs.writeFileSync(statFile, JSON.stringify({ id, ok: !!ok, detail: detail === undefined ? null : detail, at: new Date().toISOString() }));
    } catch {}
  };
  const commands = {
    'crash-main': () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.forcefullyCrashRenderer();
      else throw new Error('no main window');
    },
    'kill-main': () => {
      const pid = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getOSProcessId() : 0;
      if (!pid) throw new Error('no renderer pid');
      process.kill(pid);
    },
    'hang-main': () => {
      if (!mainWindow || mainWindow.isDestroyed()) throw new Error('no main window');
      // 在 renderer 主线程注入 120s 忙循环制造挂起；恢复机制会强制终结该进程。
      mainWindow.webContents
        .executeJavaScript('(function(){var s=Date.now();while(Date.now()-s<120000){}})()')
        .catch(() => {});
    },
    'crash-float': () => {
      const sid = '__test_float__';
      const win = createFloatWindow(sid, { title: '测试浮窗' });
      if (!win) throw new Error('float creation failed');
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) win.webContents.forcefullyCrashRenderer();
        } catch {}
      }, 2500);
    },
    'kill-server-silent': () => {
      // 模拟插件市场式原地重启的前半程：退出处理器不弹窗。
      // 不置空 serverProc：让 isServerAlive() 依据真实退出状态，
      // 强杀完成（exit 事件）后自然变为 false。
      restartingServer = true;
      killTree(serverProc);
    },
    'restart-server': async () => {
      restartingServer = true;
      try {
        const url = await startAndShow();
        return { ok: true, url };
      } finally {
        restartingServer = false;
      }
    },
    // 与 chrome:restart-service IPC 完全一致的路径（供集成测试复现端口稳定性）。
    'restart-service': () => restartService(),
    'reload-main': () => {
      if (!mainWindow || mainWindow.isDestroyed()) throw new Error('no main window');
      mainWindow.reload();
    },
    'recovery-reload': () => {
      if (!recovery || !mainWindow || mainWindow.isDestroyed()) throw new Error('no window');
      recovery.retryNow(mainWindow);
    },
    state: () => {
      const url = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getURL() : null;
      return {
        url,
        webUrl,
        serverAlive: !!serverProc && serverProc.exitCode === null && !serverProc.killed,
        recovery: recovery ? recovery.stateOf(mainWindow) : null,
      };
    },
    quit: () => {
      forceQuit = true;
      setTimeout(() => app.quit(), 100);
    },
  };
  let lastId = null;
  const poll = setInterval(() => {
    let raw;
    try { raw = fs.readFileSync(ctrlFile, 'utf8'); } catch { return; }
    let cmd;
    try { cmd = JSON.parse(raw); } catch { return; }
    if (!cmd || !cmd.id || cmd.id === lastId) return;
    lastId = cmd.id;
    try {
      const fn = commands[cmd.cmd];
      if (!fn) { writeStatus(cmd.id, false, 'unknown-command'); return; }
      const r = fn(cmd.args || {});
      if (r && typeof r.then === 'function') {
        r.then((v) => writeStatus(cmd.id, true, v))
          .catch((e) => writeStatus(cmd.id, false, String((e && e.message) || e)));
      } else {
        writeStatus(cmd.id, true, r === undefined ? null : r);
      }
    } catch (err) {
      writeStatus(cmd.id, false, String((err && err.stack) || err));
    }
  }, 150);
  poll.unref();
  log('test-event', 'test-channel-ready');
}

async function boot() {
  // userData 重定向（便携版 data/ 与 dev 测试 DSH_DESKTOP_USERDATA）已在
  // 模块加载期、单实例锁校验之前完成（见 App lifecycle 区块），此处直接读取。
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
  // 日志体积封顶：desktop.log / dsh-web.log 无界追加，长期运行会膨胀到数百 MB，
  // 还会让失败路径上的「整文件读尾部」变成线性开销。此时没有任何写者（上一
  // 个实例已退出、本实例尚未开流），封顶是安全的。
  capLogFile(path.join(logsDir, 'desktop.log'));
  capLogFile(path.join(logsDir, 'dsh-web.log'));
  capLogFile(path.join(logsDir, 'watchdog.log'));
  desktopLog = fs.createWriteStream(path.join(logsDir, 'desktop.log'), { flags: 'a' });
  // 崩溃取证（Issue #9）：把 Crashpad minidump 固定到数据目录并保留，
  // 用于后续定位 0xC0000005 的底层来源（不联网上传）。
  crashDumpsDir = path.join(userDataDir, 'crash-dumps');
  try {
    fs.mkdirSync(crashDumpsDir, { recursive: true });
    app.setPath('crashDumps', crashDumpsDir);
    pruneOldCrashDumps();
    crashReporter.start({
      productName: 'DSH Desktop',
      companyName: 'DSH Desktop',
      submitURL: '',
      uploadToServer: false,
      compress: true,
    });
  } catch (err) {
    log('crash', 'crashReporter 初始化失败: ' + err.message);
  }
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
  // 尽早弹出 loading 窗口（不依赖后续任何启动步骤），用户能第一时间看到
  // 「正在启动」反馈；同时立刻装配渲染进程自恢复与挂起心跳——loading 窗口
  // 阶段（首次同步/补丁可能耗时数十秒）崩溃/挂起也有兜底，而不是裸奔。
  // （PR #39 提速 + 本合入补齐恢复装配时机）
  createWindow();
  initRendererRecovery();
  wireWindowRecovery();
  startHeartbeatLoop();
  startPreviewStaticServer();
  registerChromeIpc();
  createTray();
  // 托盘图标被 explorer 重启等外部因素清掉后，周期性自愈。
  trayRecoveryTimer = setInterval(ensureTray, 30 * 1000);
  if (uncleanPrev) notifyUncleanRestart(uncleanPrev);
  const home = dshHome || process.env.DSH_HOME || require('node:path').join(require('node:os').homedir(), '.dsh');
  if (isWslMode()) {
    // WSL 托管模式：先建窗口显示加载页（首次 npm 安装可能耗时数分钟），
    // 确保 WSL 内 agent 安装完成后再同步配套插件/补丁（经 UNC 写入 WSL profile）。
    // 跳过 repairProfileFallback（WSL 内的 dsh 首次启动会自行 heal）与 koffi
    // 目录选择器 overlay（只作用于本地内置 dsh）。
    setupTestChannel();
    await wslBackend.ensureInstalled();
    syncCompanionPlugins();
    syncBuiltinAgentPresets();
    applyRuntimeFlashFix();
    applyPromptExposeFix();
    applyImageSendFix();
    applyVisionKeyFix();
    applyProfilePatchGuard();
    applyProfileBundleGuard();
    applySettingsSectionGuard();
    applyWorkspaceSearchRailFix();
    applyPluginInventoryTabMergeFix();
    applyWebSearchBaseUrlFix();
    applyMenuViewportFix();
    applySessionManageFix();
  } else {
    // 先修复 profile fallback 联接再同步/补丁依赖文件：EPERM 环境下补丁写不进去。
    await repairProfileFallback(home);
    syncCompanionPlugins();
    syncLocalAgentPresets();
    applyRuntimeFlashFix();
    applyPromptExposeFix();
    applyImageSendFix();
    applyVisionKeyFix();
    applyProfilePatchGuard();
    applyProfileBundleGuard();
    applySettingsSectionGuard();
    applyWorkspaceSearchRailFix();
    applyPluginInventoryTabMergeFix();
    applyWebSearchBaseUrlFix();
    applyMenuViewportFix();
    applySessionManageFix();
    setupTestChannel();
    if (runKoffiPreflight()) clearAutoPickerBrowseOverlay();
    else enablePickerBrowseOverlay();
  }
  bootFinished = true; // 窗口已建：此后异常走既有 fatal/错误弹窗，不再重复弹
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
      log('test-event', 'boot-ready');
    })
    .catch((err) => handleBootFailure(err));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// 便携版数据目录必须在校验单实例锁之前重定向：Electron 的实例锁以 userData
// 为键，旧代码在 boot() 里才 setPath —— 便携版与安装版（乃至两个便携版）会
// 共用 %APPDATA%\DSH Desktop 的锁；安装版正在运行时再双击便携版会因
// requestSingleInstanceLock() 失败而静默退出、无任何界面（issue #30「便携版
// 双击无反应 / 有进程无窗口」的候选根因）。重定向后各安装形态各持其锁，
// 便携版数据随 exe 走（data/），两版可同时运行互不干扰。
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  try { app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')); } catch {}
} else if (!app.isPackaged && process.env.DSH_DESKTOP_USERDATA) {
  // 开发模式集成测试隔离（DSH_DESKTOP_USERDATA）：与便携版同理，必须在锁
  // 校验之前重定向，否则所有测试实例共用默认 userData 的实例锁 —— 真实
  // 桌面端（安装版）运行时测试实例会因锁冲突全部静默退出，反之亦然。
  // 只作用于 dev 模式且仅由测试环境显式设置，对安装版/便携版无任何影响。
  try { app.setPath('userData', process.env.DSH_DESKTOP_USERDATA); } catch {}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.deepseek.dsh.desktop');
  // 本区块在模块加载期执行（boot() 之前），userDataDir 尚未赋值；统一用
  // app.getPath('userData')（便携版已在上面重定向）构造 settings 上下文，
  // 避免读写到 cwd 下无关的 settings.json。
  const gpuSettingsCtx = () => ({ ...updCtx(), userDataDir: app.getPath('userData') });
  // GPU 进程崩溃是最常见的 Electron 静默退出原因（无日志、无弹窗）。
  // 默认启用硬件加速（issue #26：软件渲染导致 GPU 进程空转 ~60% 单核、
  // 设置页等整页重绘明显掉帧）。仅当 settings.json 标记
  // hardwareAcceleration === 'off'（用户手动关闭，或 GPU 连续崩溃自动降级
  // 写入）时才禁用硬件加速。
  if (updater.loadSettings(gpuSettingsCtx()).hardwareAcceleration === 'off') {
    app.disableHardwareAcceleration();
  }
  // GPU / 渲染进程崩溃日志 + 自动降级（issue #26）：GPU 进程短时间内连续
  // 崩溃达到阈值 → 判定显卡驱动不兼容 → 持久化 hardwareAcceleration:'off'
  // 并重启应用，而不是旧版那样一刀切全局禁用硬件加速。
  const gpuCrashGuard = createGpuCrashGuard();
  const recordGpuCrash = (extra) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] GPU 进程崩溃 ${extra}\n`); } catch {}
    if (!gpuCrashGuard.record()) return;
    try {
      const s = updater.loadSettings(gpuSettingsCtx());
      s.hardwareAcceleration = 'off';
      updater.saveSettings(gpuSettingsCtx(), s);
      log('boot', 'GPU 进程连续崩溃，已持久化关闭硬件加速，重启应用生效');
    } catch (err) {
      log('boot', 'GPU 降级标记写入失败: ' + ((err && err.message) || err));
    }
    try { quitting = true; markCleanExit(); killTreeSync(serverProc); } catch {}
    app.relaunch();
    app.exit(0);
  };
  app.on('gpu-process-crashed', (_e, killed) => recordGpuCrash(`(killed=${killed})`));
  app.on('render-process-gone', (_e, wc, details) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] 渲染进程崩溃: ${details.reason} (exitCode=${details.exitCode})\n`); } catch {}
  });
  app.on('child-process-gone', (_e, details) => {
    const ts = new Date().toISOString();
    try { const lp = path.join(app.getPath('userData'), 'logs', 'desktop.log'); fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.appendFileSync(lp, `[${ts}] [crash] 子进程崩溃: type=${details.type} reason=${details.reason} (exitCode=${details.exitCode})\n`); } catch {}
    if (details.type === 'GPU') recordGpuCrash('(via child-process-gone)');
  });
  app.on('second-instance', () => {
    // 用户再次双击桌面/开始菜单图标：恢复（或重建）主窗口。
    log('boot', 'second-instance：恢复主窗口');
    showMainWindow();
  });
  app.on('before-quit', () => {
    quitting = true;
    forceQuit = true;
    markCleanExit();
    log('boot', '正在退出，销毁会话浮窗并停止 dsh web 进程树…');
    closePetWindow(); // 宠物小窗随应用退出关闭（主窗「关闭到托盘」时保留）
    closeAllFloatWindows();
    killTreeSync(serverProc);
    updater.abort();
    if (recovery) recovery.dispose();
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