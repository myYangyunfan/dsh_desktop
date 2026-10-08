'use strict';

// ---------------------------------------------------------------------------
// WSL 托管后端 —— sidecar 侧的模式检测 / UNC home 解析 / wsl.exe 探测原语。
//
// 溯源（Electron 蓝本，git ee7e420a^ 的 main.js + wsl-backend.js）：
//   · 配置键：settings.json 扁平键 backend / wslDistro / wslInstallDir（与
//     Electron updater.loadSettings 及 Rust commands/wsl.rs 的
//     wsl_settings_load_from 三方同键同文件）；环境变量 DSH_DESKTOP_BACKEND /
//     DSH_DESKTOP_WSL_DISTRO / DSH_DESKTOP_WSL_DIR 为 Electron 时代的调试缝，
//     原样保留。
//   · Rust 侧解锁前（settings 三键尚不可由 UI 写入）用 DSH_WSL_MODE=1 模拟
//     WSL 模式（本任务约定的临时缝）；叠加 DSH_TAURI_WSL_DISTRO /
//     DSH_TAURI_WSL_HOME / DSH_TAURI_WSL_UNC_HOST / DSH_TAURI_WSL_UNC_HOME
//     可跳过全部 wsl.exe 探测（单测 / 真机调试用，见各字段注释）。
//   · effectiveDshHome 语义：WSL 模式下 DSH_HOME = WSL 安装目录的 UNC 等价
//     路径（\\wsl.localhost\<distro>\<installDir>），插件同步 /
//     补丁半边全部经 UNC 写穿——fs 语义见 wsl-paths.js 头注释。
//   · 失败回落（Electron issue #54）：配置错误（无发行版 / 缺 node 等）不
//     阻断启动——detect 出 wsl 但解析失败时，调用方回落 local 模式继续 boot。
//
// 与并行 Rust 代理的边界：本模块只做「读配置 → 解析 home → 轻量探测」的
// JS 半边；安装 / 更新 / 启动（wsl-backend.js 的 installAgent / spawnServer
// 职责）归 Rust 编排。wsl.exe 输出解码 / 清单解析复用 dsh-desktop/wsl-backend.js
// 的唯一实现（decodeWslText / parseWslDistroList），绝无第二份副本。
// ---------------------------------------------------------------------------

const path = require('node:path');
const { isWslUncHost, parseWslUnc, wslLinuxToUnc } = require('./wsl-paths');

// 安装目录禁止的 shell 元字符（逐字对齐 wsl-backend.js）：目录被拼进
// `sh -lc '…'`（单引号内插），除空白外必须拒绝会破坏引号/命令结构的字符。
const INSTALL_DIR_FORBIDDEN = /[\s$`;&|<>"'()\\\r\n\t]/;

// Docker Desktop 的辅助发行版不含交互 shell 与 node，自动选择时跳过
// （逐字对齐 wsl-backend.js configureAsync 的 SYSTEM_DISTRO_RE）。
const SYSTEM_DISTRO_RE = /^docker-desktop(-data)?$/i;

/** 可注入原语（单测桩替身；产品代码不消费）。 */
const internals = {
  spawn: null,        // 懒取 child_process.spawn
  wslBackend: null,   // 懒取 wsl-backend.js（解码 / 清单解析）
};

/** wsl.exe 输出解码 / 清单解析的唯一实现（dsh-desktop/wsl-backend.js）。 */
function wslBackendModule(env) {
  if (internals.wslBackend) return internals.wslBackend;
  const candidates = [];
  if (env && env.DSH_TAURI_APP_DIR) candidates.push(path.join(env.DSH_TAURI_APP_DIR, 'wsl-backend.js'));
  // 双布局：repo 检出 sidecar → ../../dsh-desktop；安装形态 resources/sidecar
  // → ../dsh-desktop（supervisor.rs 的 app_dir 布局）。
  candidates.push(path.join(__dirname, '..', '..', 'dsh-desktop', 'wsl-backend.js'));
  candidates.push(path.join(__dirname, '..', 'dsh-desktop', 'wsl-backend.js'));
  for (const file of candidates) {
    try { internals.wslBackend = require(file); return internals.wslBackend; } catch { /* 布局不符，试下一个 */ }
  }
  return null;
}

function spawnImpl() {
  if (!internals.spawn) internals.spawn = require('node:child_process').spawn;
  return internals.spawn;
}

/** wsl.exe 路径：默认 wsl.exe（PATH 解析）；DSH_TAURI_WSL_EXE 可换桩（调试缝）。 */
function wslExe(env) {
  return String((env && env.DSH_TAURI_WSL_EXE) || 'wsl.exe');
}

/**
 * 异步执行一条 WSL 内命令（wsl-backend.runWsl 的探测子集：无 onLine 进度）。
 * cmd 已包装 `sh -lc`（登录 shell：fnm/nvm 的 node 只在登录 shell 的 PATH 里）。
 * 永不 reject——失败以 { ok:false, error } resolve，调用方决定回落。
 * @returns {Promise<{ok:boolean, code:number, timedOut:boolean, stdout:string, stderr:string, error?:string}>}
 */
function runWsl(distro, cmd, { env = process.env, spawn = null, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    const backend = wslBackendModule(env);
    if (!backend) {
      return resolve({ ok: false, code: -1, timedOut: false, stdout: '', stderr: '', error: 'wsl-backend 模块不可用（解码原语缺失）' });
    }
    const doSpawn = spawn || spawnImpl();
    let child;
    try {
      child = doSpawn(wslExe(env), ['-d', distro, '-e', 'sh', '-lc', cmd], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return resolve({ ok: false, code: -1, timedOut: false, stdout: '', stderr: '', error: String((err && err.message) || err) });
    }
    const outChunks = [];
    const errChunks = [];
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch { /* 已退出 */ }
    }, timeoutMs);
    child.stdout.on('data', (c) => outChunks.push(c));
    child.stderr.on('data', (c) => errChunks.push(c));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        ok: false, code: -1, timedOut: false,
        stdout: backend.decodeWslText(Buffer.concat(outChunks)),
        stderr: backend.decodeWslText(Buffer.concat(errChunks)) + String((e && e.message) || e),
        error: String((e && e.message) || e),
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0, code, timedOut: killed,
        stdout: backend.decodeWslText(Buffer.concat(outChunks)),
        stderr: backend.decodeWslText(Buffer.concat(errChunks)),
      });
    });
  });
}

/**
 * `wsl -l -q` 发行版清单（异步）：解码 + 解析复用 wsl-backend 唯一实现；
 * wsl.exe 缺失 / 超时 / 退出非零 → 空列表（绝不把半截输出当清单）。
 * @returns {Promise<string[]>}
 */
async function listDistros({ env = process.env, spawn = null, timeoutMs = 30000 } = {}) {
  const backend = wslBackendModule(env);
  if (!backend) return [];
  return new Promise((resolve) => {
    const doSpawn = spawn || spawnImpl();
    let child;
    try {
      child = doSpawn(wslExe(env), ['-l', '-q'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return resolve([]);
    }
    const chunks = [];
    let settled = false;
    const done = (list) => { if (!settled) { settled = true; resolve(list); } };
    const timer = setTimeout(() => { try { child.kill(); } catch {} done([]); }, timeoutMs);
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); done([]); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) return done([]);
      done(backend.parseWslDistroList(backend.decodeWslText(Buffer.concat(chunks))));
    });
  });
}

/**
 * WSL 内 $HOME 探测（wsl-backend.homeDirAsync 同式）。失败返回 ''。
 * @returns {Promise<string>}
 */
async function probeWslHomeDir(distro, opts = {}) {
  const res = await runWsl(distro, 'printf %s "$HOME"', opts);
  const home = (res.stdout || '').trim();
  return res.ok && home.startsWith('/') ? home : '';
}

/**
 * UNC 主机选择（wsl-backend.uncHost 同式）：wsl.localhost（Win11）失败回落
 * wsl$（旧版）；DSH_TAURI_WSL_UNC_HOST 显式指定（调试缝）。
 * @param {Object} env
 * @param {(p:string)=>boolean} [fsExists]
 * @returns {string}
 */
function pickUncHost(env = process.env, fsExists = null) {
  const override = String(env.DSH_TAURI_WSL_UNC_HOST || '').trim();
  if (override) {
    if (!isWslUncHost(override)) throw new Error('DSH_TAURI_WSL_UNC_HOST 必须是 wsl.localhost 或 wsl$: ' + override);
    return override;
  }
  const exists = fsExists || ((p) => {
    try { return require('node:fs').existsSync(p); } catch { return false; }
  });
  for (const host of ['wsl.localhost', 'wsl$']) {
    try { if (exists('\\\\' + host)) return host; } catch { /* 探测失败试下一个 */ }
  }
  return 'wsl.localhost'; // 探测失败也返回默认（Win11 常态；wsl-backend 同语义）
}

/**
 * 校验并归一化安装目录（wsl-backend.normalizeInstallDir 同式；失败抛错）。
 * @param {string} raw 用户配置值（允许 ~ 前缀 / 空 = 默认）
 * @param {string} wslHome WSL 内 $HOME（~ 展开与默认值的基准；空串时 raw
 *   必须已是 / 开头的绝对路径，否则抛错）
 * @returns {string} WSL 内 Linux 绝对路径
 */
function normalizeInstallDir(raw, wslHome) {
  let dir = String(raw || '').trim();
  if (dir) {
    if (dir.startsWith('~')) {
      if (!wslHome) throw new Error('wslInstallDir 以 ~ 开头但 WSL $HOME 未解析（探测失败或未配置）: ' + dir);
      dir = wslHome + dir.slice(1);
    }
    if (!dir.startsWith('/')) {
      throw new Error('wslInstallDir 必须是 WSL 内的绝对路径（以 / 或 ~ 开头）: ' + dir);
    }
  } else {
    if (!wslHome) throw new Error('wslInstallDir 未配置且 WSL $HOME 未解析，无法落到默认 ~/.dsh-desktop');
    dir = wslHome + '/.dsh-desktop';
  }
  if (INSTALL_DIR_FORBIDDEN.test(dir)) {
    throw new Error('wslInstallDir 不能包含空白或 shell 特殊字符（$ ` ; & | < > 引号 括号）: ' + dir);
  }
  return dir;
}

/**
 * WSL 后端模式检测（纯函数，无 spawn / 无 fs——探测留给 resolveWslBackend）。
 * 优先级：非 Windows 恒 local → DSH_DESKTOP_BACKEND=local 显式本地 →
 * DSH_WSL_MODE 模拟 / DSH_DESKTOP_BACKEND=wsl → settings.backend=wsl → 默认 local。
 * @param {Object} [opts]
 * @param {Object} [opts.env] 默认 process.env
 * @param {Object} [opts.settings] 已读出的 settings.json 对象（默认 {}）
 * @param {string} [opts.platform] 默认 process.platform
 * @returns {{mode:'local'|'wsl', source:string, simulated?:boolean, distro:string, installDir:string, reason?:string}}
 */
function detectWslBackend(opts = {}) {
  const env = opts.env || process.env;
  const settings = opts.settings || {};
  const platform = opts.platform || process.platform;
  if (platform !== 'win32') {
    return { mode: 'local', source: 'platform', distro: '', installDir: '', reason: 'WSL 托管仅 Windows 壳支持（当前 ' + platform + '）' };
  }
  const distro = firstNonEmpty(env.DSH_TAURI_WSL_DISTRO, env.DSH_DESKTOP_WSL_DISTRO, settings.wslDistro);
  const installDir = firstNonEmpty(env.DSH_DESKTOP_WSL_DIR, settings.wslInstallDir);
  const envBackend = String(env.DSH_DESKTOP_BACKEND || '').trim().toLowerCase();
  if (envBackend === 'local') {
    return { mode: 'local', source: 'env', distro, installDir, reason: 'DSH_DESKTOP_BACKEND=local 显式本地' };
  }
  const sim = /^(1|true|yes|wsl)$/i.test(String(env.DSH_WSL_MODE || '').trim());
  if (sim || envBackend === 'wsl') {
    return { mode: 'wsl', source: sim && envBackend !== 'wsl' ? 'env-sim' : 'env', simulated: sim && envBackend !== 'wsl', distro, installDir };
  }
  // TA9-2：backend 必须是字符串才判 wsl——数组/对象形态（配置损坏）在此
  // 误判会短暂谎报 boot 结果的 backend 字段（后果有界，后续探测仍回落 local）。
  if (typeof settings.backend === 'string' && settings.backend.trim() === 'wsl') {
    return { mode: 'wsl', source: 'settings', simulated: false, distro, installDir };
  }
  return { mode: 'local', source: 'default', distro, installDir };
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/**
 * 解析 WSL 后端运行上下文（检测 → distro → installDir → UNC home）。
 * 仅做轻量探测（wsl -l -q / $HOME），不做安装 / 启动（Rust 编排职责）。
 * @param {Object} [opts] { env, settings, platform, spawn, fsExists, detect }
 * @returns {Promise<{mode:'wsl', distro:string, installDir:string, uncHost:string,
 *                     uncHome:string, simulated:boolean, source:string}|null>}
 *   local 模式返回 null；wsl 配置不可用抛 Error（message 可直接展示，
 *   调用方按 Electron issue #54 语义回落 local 继续启动）。
 */
async function resolveWslBackend(opts = {}) {
  const env = opts.env || process.env;
  const settings = opts.settings || {};
  const platform = opts.platform || process.platform;
  const detect = opts.detect || detectWslBackend({ env, settings, platform });
  if (detect.mode !== 'wsl') return null;

  // distro：显式配置优先，缺省探测清单（docker-desktop 辅助发行版跳过）。
  let distro = String(detect.distro || '').trim();
  if (!distro) {
    const distros = await listDistros({ env, spawn: opts.spawn });
    if (distros.length === 0) {
      throw new Error('未检测到 WSL 发行版。请确认已安装 WSL（wsl --install），或通过设置 wslDistro 指定发行版名。');
    }
    distro = distros.find((d) => !SYSTEM_DISTRO_RE.test(d)) || distros[0];
  }

  // installDir：~ 展开 / 默认 ~/.dsh-desktop 需要 WSL $HOME；显式绝对路径免探测。
  // UNC home 整体覆盖（DSH_TAURI_WSL_UNC_HOME）自带完整三元素——覆盖态免
  // $HOME 探测，installDir 从覆盖值反解（自描述，测试 / 真机调试无需再配
  // wslHome）；反解不出（本地模拟目录等非 WSL UNC 形态）时留空仅作展示。
  const override = String(env.DSH_TAURI_WSL_UNC_HOME || '').trim();
  let installDir = String(detect.installDir || '').trim();
  const needsHome = installDir === '' || installDir.startsWith('~');
  let wslHome = String(env.DSH_TAURI_WSL_HOME || '').trim();
  if (needsHome && !wslHome && !override) wslHome = await probeWslHomeDir(distro, { env, spawn: opts.spawn });
  if (needsHome && !wslHome && override) {
    const fromOverride = parseWslUnc(override);
    if (fromOverride && fromOverride.linuxPath !== '/') installDir = fromOverride.linuxPath;
  }
  if (installDir) {
    installDir = normalizeInstallDir(installDir, wslHome);
  } else if (!override) {
    installDir = normalizeInstallDir('', wslHome); // 无覆盖时必须可解（抛可读错误）
  }

  // UNC home：显式覆盖（测试 / 真机调试缝）优先，否则按 wsl-backend 构造式计算。
  const uncHost = pickUncHost(env, opts.fsExists);
  const uncHome = override || wslLinuxToUnc(installDir, distro, uncHost);
  return { mode: 'wsl', distro, installDir, uncHost, uncHome, simulated: !!detect.simulated, source: detect.source };
}

module.exports = {
  INSTALL_DIR_FORBIDDEN,
  SYSTEM_DISTRO_RE,
  detectWslBackend,
  resolveWslBackend,
  normalizeInstallDir,
  pickUncHost,
  runWsl,
  listDistros,
  probeWslHomeDir,
  internals,
};
