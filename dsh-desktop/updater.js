'use strict';

// Self-update engine for the bundled @deepseek-ai/dsh agent.
//
// Flow:
//   1. checkLatest():  checks the official GitHub Releases list (including
//      prereleases) and npm dist-tags. npm remains the install source and
//      fallback, so the user's .npmrc registry / proxy settings are respected.
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
const os = require('node:os');
const https = require('node:https');
const tls = require('node:tls');

const PKG = '@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=20';
const IS_WIN = process.platform === 'win32';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
// npm 管道输出只用于安装日志/错误尾部，64KB 尾部环形足够（历史版本无上限累积）。
const MAX_PIPE_BUF = 64 * 1024;

let activeProc = null;
let trustedCAs = null;

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
  // 原子写：用 rename 覆盖目标，绝不先删原文件——rename 失败时原 settings.json
  // 仍完好（历史实现先 rmSync 再 rename，rename 失败会导致用户设置永久丢失）。
  const tmp = file + '.tmp-' + process.pid;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
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
  try {
    // 用 readFileSync + JSON.parse 而不是 require：require 按路径缓存，本进程内
    // overlay 被更新替换到同一路径后仍读到旧版本号（历史脏读）。
    return JSON.parse(fs.readFileSync(path.join(overlayDir(ctx), 'node_modules', PKG, 'package.json'), 'utf8')).version || null;
  }
  catch { return null; }
}

function bundledVersion() {
  try {
    return JSON.parse(fs.readFileSync(require.resolve(PKG + '/package.json'), 'utf8')).version || null;
  }
  catch { return null; }
}

// 启动期 @deepseek-ai/dsh 包可能尚未安装（fetch-runtime / 打包注入），此时
// overlay + bundled 均为 null。compareVersions(latest, null) 中 null 被转为
// 空串 → 任何有效版本都 > null → "已是最新" 分支永远不触发，用户每次启动都被
// 反复弹窗。兜底为 '0.0.0' 保证语义正确（任何真实版本都 > 0.0.0）。
const FALLBACK_VERSION = '0.0.0';

function activeVersion(ctx) {
  return overlayVersion(ctx) || bundledVersion() || FALLBACK_VERSION;
}

/** 返回 { version, source } 用于日志/诊断，source = 'overlay' | 'bundled' | 'fallback'。 */
function activeVersionInfo(ctx) {
  const ov = overlayVersion(ctx);
  if (ov) return { version: ov, source: 'overlay' };
  const bv = bundledVersion();
  if (bv) return { version: bv, source: 'bundled' };
  return { version: FALLBACK_VERSION, source: 'fallback' };
}

// --- semver-ish compare ---
// 全仓唯一实现见 scripts/lib/versions.js（与 scripts/plugin-manager-update.js
// 共用）；本文件保持导出以兼容既有调用方（main.js / client-updater.js /
// scripts/check-latest.js）。对客户端版本（0.3.x）与 agent 版本
// （0.1.0-rc.N）的全部真实形态比对过，替换为零行为变更。
const { compareVersions } = require('./scripts/lib/versions');

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
    let stderrBuf = '';
    // finish 只允许「当前在途的 npm 进程」清除 activeProc：并发 runNpm 时
    // 较早结束者不得把较晚启动者的进程引用清掉（abort 会因此漏杀）。
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); if (activeProc === proc) activeProc = null; fn(value); } };
    const timer = setTimeout(() => { killProc(proc); finish(reject, new Error('npm 执行超时（' + Math.round(timeoutMs / 1000) + ' 秒）')); }, timeoutMs);
    // 尾部环形缓冲：只保留最近 64KB，防止异常输出撑爆内存（logStream 仍全量落盘）。
    const ring = (buf, chunk) => { const s = buf + chunk; return s.length > MAX_PIPE_BUF ? s.slice(-MAX_PIPE_BUF) : s; };
    proc.stdout.on('data', (c) => { stdoutBuf = ring(stdoutBuf, c.toString()); if (logStream) logStream.write(c); });
    proc.stderr.on('data', (c) => { stderrBuf = ring(stderrBuf, c.toString()); if (logStream) logStream.write(c); });
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

// --- release/version discovery -------------------------------------------

/**
 * Releases use `dsh-v0.1.0-rc.7`, while npm install needs `0.1.0-rc.7`.
 * Keep this parser strict: the result is later inserted into an npm command
 * and into a shell command in the WSL backend.
 */
function parseReleaseVersion(tag) {
  let v = String(tag || '').trim();
  v = v.replace(/^dsh-/i, '').replace(/^v/i, '');
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(v) ? v : null;
}

/** Pick the highest non-draft DSH release. Pre-releases are intentional. */
function selectLatestRelease(releases) {
  let best = null;
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || release.draft) continue;
    const version = parseReleaseVersion(release.tag_name || release.name);
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0 ||
      (compareVersions(version, best.version) === 0 && String(release.published_at || '') > String(best.release.published_at || ''))) {
      best = { version, release };
    }
  }
  return best;
}

// 统一 HTTPS JSON 读取（GitHub Releases 与 npm registry 共用）：
// 跟随重定向（≤3 跳）、4MB 上限、系统+内置根证书并集（企业代理友好，TLS 校验不降级）。
function fetchJson(url, { timeoutMs = 12000, accept = 'application/vnd.github+json', source = 'GitHub Releases' } = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      headers: { Accept: accept, 'User-Agent': 'dsh-desktop-updater' },
    };
    if (typeof tls.getCACertificates === 'function') {
      if (trustedCAs === null) trustedCAs = [...new Set([...tls.rootCertificates, ...tls.getCACertificates('system')])];
      requestOptions.ca = trustedCAs;
    }
    let redirects = 3;
    const attempt = (currentUrl) => {
      const req = https.get(currentUrl, requestOptions, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          redirects--;
          res.resume();
          attempt(new URL(res.headers.location, currentUrl).toString());
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4 * 1024 * 1024) req.destroy(new Error('响应过大'));
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(source + ' HTTP ' + res.statusCode));
            return;
          }
          try { resolve(JSON.parse(body)); }
          catch (err) { reject(new Error(source + ' 返回了无效 JSON: ' + err.message)); }
        });
      });
      const timer = setTimeout(() => req.destroy(new Error(source + ' 请求超时')), timeoutMs);
      req.on('error', (err) => { clearTimeout(timer); reject(err); });
      req.on('close', () => clearTimeout(timer));
    };
    attempt(url);
  });
}

// --- npm registry 解析（禁止 spawn npm config；纯文本 .npmrc 解析） ----------
// 优先级定死：① NPM_CONFIG_REGISTRY 环境变量 → ② 项目 .npmrc（userDataDir）
// → ③ 用户 .npmrc（$HOME）→ ④ 默认官方 registry。值需以 http(s):// 开头，
// 尾部斜杠归一（拼接时自行补 /）。

/** 纯函数：从 .npmrc 文本提取最后一个有效 registry 行（npm 语义：后写覆盖）。 */
function registryFromNpmrc(text) {
  if (!text) return null;
  let found = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const m = /^registry\s*=\s*(\S+)\s*$/.exec(line);
    if (m) {
      const v = m[1].replace(/\/+$/, '');
      if (/^https?:\/\//i.test(v)) found = v;
    }
  }
  return found;
}

/** 解析 registry 基地址（无尾斜杠）。env/fsMod 可注入以便测试。 */
function resolveNpmRegistry({ env = process.env, homeDir = null, userDataDir = null, fsMod = fs } = {}) {
  const fromEnv = env && env.NPM_CONFIG_REGISTRY;
  if (fromEnv && /^https?:\/\//i.test(String(fromEnv).trim())) {
    return String(fromEnv).trim().replace(/\/+$/, '');
  }
  let project = null;
  let user = null;
  if (userDataDir) {
    try {
      const p = path.join(userDataDir, '.npmrc');
      if (fsMod.existsSync(p)) project = registryFromNpmrc(fsMod.readFileSync(p, 'utf8'));
    } catch {}
  }
  if (homeDir) {
    try {
      const p = path.join(homeDir, '.npmrc');
      if (fsMod.existsSync(p)) user = registryFromNpmrc(fsMod.readFileSync(p, 'utf8'));
    } catch {}
  }
  return project || user || DEFAULT_REGISTRY;
}

/** dist-tags 端点：GET <registry>/-/package/<pkg-encoded>/dist-tags → {latest, next, ...}。 */
function npmDistTagsUrl(registry, pkg) {
  return String(registry).replace(/\/+$/, '') + '/-/package/' + encodeURIComponent(pkg) + '/dist-tags';
}

/** 版本元数据端点：GET <registry>/<pkg-encoded>/<version> → 200 存在 / 404 不存在。 */
function npmVersionUrl(registry, pkg, version) {
  return String(registry).replace(/\/+$/, '') + '/' + encodeURIComponent(pkg) + '/' + encodeURIComponent(version);
}

/** 探测某版本在 registry 是否可解析（200=true / 404=false / 其它抛错）。 */
function npmVersionExists(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      headers: { Accept: 'application/json', 'User-Agent': 'dsh-desktop-updater' },
    };
    if (typeof tls.getCACertificates === 'function') {
      if (trustedCAs === null) trustedCAs = [...new Set([...tls.rootCertificates, ...tls.getCACertificates('system')])];
      requestOptions.ca = trustedCAs;
    }
    let redirects = 3;
    const attempt = (currentUrl) => {
      const req = https.get(currentUrl, requestOptions, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          redirects--;
          res.resume();
          attempt(new URL(res.headers.location, currentUrl).toString());
          return;
        }
        // 响应体不需要解析：读完丢弃，仅依据状态码。
        res.resume();
        res.on('end', () => {
          if (res.statusCode === 200) resolve(true);
          else if (res.statusCode === 404) resolve(false);
          else reject(new Error('npm registry HTTP ' + res.statusCode));
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('npm registry 请求超时')), timeoutMs);
      req.on('error', (err) => { clearTimeout(timer); reject(err); });
      req.on('close', () => clearTimeout(timer));
    };
    attempt(url);
  });
}

async function checkGitHubLatest(ctx) {
  const releases = ctx.fetchGitHubReleases
    ? await ctx.fetchGitHubReleases(GITHUB_RELEASES_URL)
    : await fetchJson(GITHUB_RELEASES_URL);
  const selected = selectLatestRelease(releases);
  if (!selected) throw new Error('GitHub Releases 中没有可识别的 dsh 版本');
  return selected.version;
}

function parseNpmVersions(output) {
  const raw = String(output || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return [parsed];
    if (parsed && typeof parsed === 'object') return Object.values(parsed);
  } catch {}
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function checkNpmLatest(ctx) {
  // `latest` tag only follows the `latest` tag and therefore misses rc/beta
  // releases. Dist-tags includes both latest and next on the official npm
  // package (rc.6/latest, rc.7/next at the time of this fix). P1-1: 改纯 HTTPS
  // 读取 dist-tags 端点，不再 spawn npm view（6h 周期检查零子进程）。
  const registry = resolveNpmRegistry({ homeDir: os.homedir(), userDataDir: ctx.userDataDir });
  const distTags = ctx.fetchNpmDistTags
    ? await ctx.fetchNpmDistTags()
    : await fetchJson(npmDistTagsUrl(registry, PKG), { accept: 'application/json', source: 'npm registry' });
  const versions = parseNpmVersions(JSON.stringify(distTags)).map(parseReleaseVersion).filter(Boolean);
  if (versions.length === 0) throw new Error('npm dist-tags 无可识别版本号');
  return versions.reduce((best, v) => compareVersions(v, best) > 0 ? v : best, versions[0]);
}

async function checkNpmVersion(ctx, version) {
  // P1-1: 版本存在性探测改 HTTPS（GET 版本元数据端点，200/404 判定），
  // 不再 spawn npm view。
  const registry = resolveNpmRegistry({ homeDir: os.homedir(), userDataDir: ctx.userDataDir });
  const url = npmVersionUrl(registry, PKG, version);
  return ctx.fetchNpmVersionExists
    ? await ctx.fetchNpmVersionExists(url)
    : await npmVersionExists(url);
}

async function checkLatest(ctx) {
  const [github, npm] = await Promise.allSettled([
    checkGitHubLatest(ctx),
    checkNpmLatest(ctx),
  ]);
  const candidates = [];
  if (github.status === 'fulfilled' && npm.status === 'fulfilled' && compareVersions(github.value, npm.value) > 0) {
    // A GitHub release can briefly lead a registry mirror. Do not advertise a
    // version that the exact npm install command cannot resolve.
    try {
      if (await checkNpmVersion(ctx, github.value)) candidates.push(github.value);
      else candidates.push(npm.value);
    } catch {
      candidates.push(npm.value);
    }
  } else {
    if (github.status === 'fulfilled') candidates.push(github.value);
    if (npm.status === 'fulfilled') candidates.push(npm.value);
  }
  if (candidates.length === 0) {
    const errors = [github, npm].filter((r) => r.status === 'rejected').map((r) => r.reason && r.reason.message || String(r.reason));
    throw new Error('无法检查 dsh 更新（GitHub 与 npm 均不可用）：' + errors.join('；'));
  }
  const latest = candidates.reduce((best, v) => compareVersions(v, best) > 0 ? v : best, candidates[0]);
  if (ctx.log) ctx.log('update', `版本探测结果: ${latest}（GitHub=${github.status === 'fulfilled' ? github.value : '失败'}，npm=${npm.status === 'fulfilled' ? npm.value : '失败'}）`);
  return latest;
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
  // 旧副本清理失败（杀软/句柄锁定）不影响「更新已成功」的判定：绝不能因此
  // 向上抛错让用户看到「更新失败，仍使用当前版本」（实际已切换成功）。
  try {
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (cleanupErr) {
    ctx.log('update', '清理旧版本副本失败（不影响本次更新）: ' + String(cleanupErr && cleanupErr.message));
  }

  const settings = loadSettings(ctx);
  settings.skipVersion = null;
  if (!saveSettings(ctx, settings)) {
    ctx.log('update', '保存 settings 失败：重启后可能仍提示待安装更新');
  }
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
  activeVersionInfo,
  compareVersions,
  parseReleaseVersion,
  selectLatestRelease,
  parseNpmVersions,
  checkGitHubLatest,
  checkNpmLatest,
  checkNpmVersion,
  checkLatest,
  applyUpdate,
  rollback,
  abort,
  registryFromNpmrc,
  resolveNpmRegistry,
  npmDistTagsUrl,
  npmVersionUrl,
  npmVersionExists,
};
