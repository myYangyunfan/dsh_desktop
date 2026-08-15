'use strict';

// Self-update engine for the bundled @deepseek-ai/dsh agent.
//
// Flow:
//   1. checkLatest():  bundled npm runs "npm view @deepseek-ai/dsh version"
//      (respects the user's .npmrc registry / proxy settings).
//   2. User consents in a dialog ("立即更新 / 跳过此版本 / 稍后").
//   3. applyUpdate(): installs the official new version into a STAGING dir
//      (<userData>/agent-staging) with the bundled node + npm runtime, then
//      atomically swaps it in as <userData>/agent. A failed update never
//      touches the working copy.
//   4. dshBin() in main.js prefers the overlay (<userData>/agent/...) over
//      the bundled copy, so the new version takes effect after a restart.
//   5. rollback(): if the overlay fails to boot, the user can fall back to
//      the bundled version with one click.
//
// The overlay lives in the user-writable data dir, so updates work for the
// NSIS install AND the portable build (whose unpacked resources are
// re-created from the exe on every launch).

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PKG = '@deepseek-ai/dsh';
const IS_WIN = process.platform === 'win32';

let activeProc = null;

// --- settings -------------------------------------------------------------

function settingsPath(ctx) { return path.join(ctx.userDataDir, 'settings.json'); }

function loadSettings(ctx) {
  try { return JSON.parse(fs.readFileSync(settingsPath(ctx), 'utf8')); }
  catch { return {}; }
}

function saveSettings(ctx, s) {
  const file = settingsPath(ctx);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
  // 设置文件可能被安全软件短暂锁定（更新重启窗口正是扫描高发期）。
  // 先写临时文件再替换，失败重试 3 次，避免「标记清理失败→重启后仍提示待安装更新」。
  const tmp = file + '.tmp-' + process.pid;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
      try { fs.rmSync(file, { force: true }); } catch {}
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      try { fs.rmSync(tmp, { force: true }); } catch {}
      if (attempt === 2) ctx.log('update', '保存 settings 失败: ' + err.message);
    }
  }
  return false;
}

// --- overlay paths --------------------------------------------------------

function overlayDir(ctx) { return path.join(ctx.userDataDir, 'agent'); }
function stagingDir(ctx) { return path.join(ctx.userDataDir, 'agent-staging'); }

function overlayBinPath(ctx) {
  return path.join(overlayDir(ctx), 'node_modules', PKG, 'lib', 'bin.js');
}

function overlayVersion(ctx) {
  try { return require(path.join(overlayDir(ctx), 'node_modules', PKG, 'package.json')).version; }
  catch { return null; }
}

function bundledVersion() {
  try { return require(PKG + '/package.json').version; }
  catch { return null; }
}

function activeVersion(ctx) { return overlayVersion(ctx) || bundledVersion(); }

// --- semver-ish compare (handles 0.1.0-rc.N style prereleases) -------------

function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ''] = String(v).split('-');
    const nums = core.split('.').map((s) => parseInt(s, 10) || 0);
    const preNum = parseInt((pre.match(/\d+/) || [''])[0], 10);
    return { nums, pre, preNum: Number.isNaN(preNum) ? -1 : preNum, hasPre: !!pre };
  };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] - B.nums[i];
  }
  if (A.hasPre !== B.hasPre) return A.hasPre ? -1 : 1; // prerelease < release
  if (A.hasPre && A.pre !== B.pre) {
    if (A.preNum >= 0 && B.preNum >= 0 && A.preNum !== B.preNum) return A.preNum - B.preNum;
    return A.pre < B.pre ? -1 : A.pre > B.pre ? 1 : 0;
  }
  return 0;
}

// --- npm runner -----------------------------------------------------------

function killProc(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else proc.kill('SIGTERM');
  } catch {}
}

function abort() { killProc(activeProc); activeProc = null; }

function runNpm(ctx, args, { timeoutMs = 30 * 60 * 1000, logStream = null } = {}) {
  return new Promise((resolve, reject) => {
    const nodeBin = ctx.nodeExe();
    const cli = ctx.npmCli();
    if (!fs.existsSync(nodeBin) || !fs.existsSync(cli)) {
      return reject(new Error('内置 Node/npm 运行时缺失，无法检查或执行更新。'));
    }
    ctx.log('update', 'npm ' + args.join(' '));
    try { fs.mkdirSync(ctx.userDataDir, { recursive: true }); } catch {}
    const proc = spawn(nodeBin, [cli, ...args], {
      cwd: ctx.userDataDir,
      env: {
        ...process.env,
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_AUDIT: 'false',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeProc = proc;
    let settled = false;
    let stdoutBuf = '';
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); activeProc = null; fn(value); } };
    const timer = setTimeout(() => { killProc(proc); finish(reject, new Error('npm 执行超时（' + Math.round(timeoutMs / 1000) + ' 秒）')); }, timeoutMs);
    let stderrBuf = '';
    proc.stdout.on('data', (c) => { stdoutBuf += c.toString(); if (logStream) logStream.write(c); });
    proc.stderr.on('data', (c) => { stderrBuf += c.toString(); if (logStream) logStream.write(c); });
    proc.on('error', (err) => finish(reject, err));
    proc.on('exit', (code) => {
      if (code === 0) finish(resolve, stdoutBuf);
      else {
        const tail = (stderrBuf + stdoutBuf).split(/\r?\n/).filter(Boolean).slice(-6).join(' | ');
        finish(reject, new Error('npm 退出码 ' + code + (tail ? '：' + tail.slice(-500) : '')));
      }
    });
  });
}

// --- public API -----------------------------------------------------------

async function checkLatest(ctx) {
  const out = await runNpm(ctx, ['view', PKG, 'version'], { timeoutMs: 90000 });
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  const v = lines[lines.length - 1].trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error('无法解析官方版本号: ' + JSON.stringify(v));
  return v;
}

async function applyUpdate(ctx, version) {
  const staging = stagingDir(ctx);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const logPath = path.join(ctx.userDataDir, 'logs', 'update.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  try {
    await runNpm(ctx, [
      'install', '--prefix', staging, PKG + '@' + version,
      '--save-exact', '--omit=dev', '--no-audit', '--no-fund', '--no-update-notifier',
    ], { timeoutMs: 30 * 60 * 1000, logStream });
  } catch (err) {
    logStream.end();
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error(err.message + '（日志: ' + logPath + '）');
  }
  logStream.end();

  const bin = path.join(staging, 'node_modules', PKG, 'lib', 'bin.js');
  if (!fs.existsSync(bin)) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error('安装完成但未找到 dsh 入口文件（日志: ' + logPath + '）');
  }

  // Atomic swap: old overlay -> backup, staging -> overlay, drop backup.
  // M4 修复：两处重命名都纳入 try，失败时回滚并清理 staging 残留。
  const overlay = overlayDir(ctx);
  const backup = path.join(ctx.userDataDir, 'agent-old-' + Date.now());
  try {
    if (fs.existsSync(overlay)) fs.renameSync(overlay, backup);
    fs.renameSync(staging, overlay);
  } catch (err) {
    try {
      if (!fs.existsSync(overlay) && fs.existsSync(backup)) fs.renameSync(backup, overlay);
    } catch (rollbackErr) {
      ctx.log('update', '回滚 overlay 失败: ' + String(rollbackErr && rollbackErr.message));
    }
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error('切换新版本失败: ' + (err && err.message) + '（staging 已清理）');
  }
  fs.rmSync(backup, { recursive: true, force: true });

  const settings = loadSettings(ctx);
  settings.skipVersion = null;
  saveSettings(ctx, settings);
  ctx.log('update', '更新完成: ' + PKG + '@' + version);
  return { version, logPath };
}

function rollback(ctx) {
  const overlay = overlayDir(ctx);
  if (!fs.existsSync(overlay)) return null;
  const broken = path.join(ctx.userDataDir, 'agent-broken-' + Date.now());
  fs.renameSync(overlay, broken);
  ctx.log('update', '已回退到内置版本（问题副本保留在 ' + broken + '）');
  return broken;
}

module.exports = {
  PKG,
  loadSettings,
  saveSettings,
  overlayBinPath,
  overlayVersion,
  bundledVersion,
  activeVersion,
  compareVersions,
  checkLatest,
  applyUpdate,
  rollback,
  abort,
};
