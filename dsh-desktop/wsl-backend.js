'use strict';

// WSL 托管后端 —— Windows 壳经 wsl.exe 在 WSL 内安装 / 更新 / 运行自己的 dsh。
//
// WSL 内目录布局（默认 <安装目录> = ~/.dsh-desktop，可配置）：
//   <dir>/agent/node_modules/@deepseek-ai/dsh   当前生效版本（DSH_HOME=<dir>）
//   <dir>/agent-prev/...                        上一版本（更新/回退用）
//   <dir>/agent-staging/...                     npm 安装 staging（完成后原子 mv）
//   <dir>/dsh.pid                               dsh web 进程 pid（退出清理用）
//   <dir>/profiles、sessions、settings.yaml      dsh 自身数据（与本地模式同构）
// 配套插件与内置 Agent 预设同步不在这里：main.js 的 syncCompanionPlugins /
// syncBuiltinAgentPresets 经 UNC（effectiveDshHome = <dir> 的 UNC 等价路径）
// 直接写入 WSL profile 与 agent 包，与本模块解耦。
//
// 跨 WSL 调用约定（已在真实 wsl.exe 上实测）：
//   · wsl.exe 只接受 `--` 之后「按空格拆开的独立 argv 单词」；把整条命令拼成
//     一个带空格的字符串会被当成单个词直接 exec 而失败；
//   · `-e`（--exec）跳过默认 shell 的二次解析，argv 原样 execvp，最可靠；
//   · 必须用登录 shell（sh -lc）：fnm/nvm 的 node 只在登录 shell 的 PATH 里；
//   · 安装目录不允许包含空白字符，规避 shell 转义问题（发行版名允许含空格，
//     libuv 的引号处理会覆盖）。
//
// 探测统一走异步路径（configureAsync / statusAsync / wslListDistrosAsync）：
// boot 与设置页 IPC（dsh:wsl-config / dsh:wsl-config-save / dsh:wsl-recheck）
// 共用，全部经异步 spawn，绝不阻塞主进程（历史上设置页每次打开都做多段
// spawnSync，WSL 冷启动时主进程冻结数分钟、窗口无响应）。runWslSync 仅保留给
// 同步上下文里的 activeVersion（dshVersion 等显示路径）。
//
// 可测试性：wsl.exe 原语全部挂在 internals.* 上并经 _internals 导出，
// 单元测试可注入桩替身而不必真的拉起 wsl.exe。

const childProcess = require('node:child_process');
const fs = require('node:fs');

const PKG = '@deepseek-ai/dsh';
const WSL_EXE = 'wsl.exe';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  configured: false,
  distro: '',
  installDir: '',        // Linux 绝对路径（无空白）
  uncDir: '',            // Windows UNC 等价路径（main.js 的 DSH_HOME 映射用）
  nodeVersion: '',       // WSL 内 node --version
  npmVersion: '',        // WSL 内 npm --version
  lastError: '',
  logFn: null,
  versionCache: null,
};

function log(msg) {
  try { if (state.logFn) { state.logFn('wsl', msg); return; } } catch {}
  console.log('[wsl] ' + msg);
}

function fail(msg) {
  state.lastError = msg;
  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// wsl.exe 原语（internals.*：单测可注入桩替身）
// ---------------------------------------------------------------------------

const internals = {
  spawn: childProcess.spawn,
  spawnSync: childProcess.spawnSync,
};

/** 同步执行一条 WSL 命令（探活/读文件用；长命令请用 runWsl）。 */
internals.runWslSync = function runWslSync(cmd, timeoutMs = 60000) {
  const res = internals.spawnSync(WSL_EXE, ['-d', state.distro, '-e', 'sh', '-lc', cmd], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error) return { ok: false, code: -1, stdout: '', stderr: String(res.error.message || res.error) };
  return { ok: res.status === 0, code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
};

/** 异步执行一条 WSL 命令，收集输出；onLine 可选地收到每行 stdout（进度日志）。 */
internals.runWsl = function runWsl(cmd, { timeoutMs = 20 * 60 * 1000, onLine } = {}) {
  return new Promise((resolve) => {
    const child = internals.spawn(WSL_EXE, ['-d', state.distro, '-e', 'sh', '-lc', cmd], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch {}
    }, timeoutMs);
    child.stdout.on('data', (c) => {
      const text = c.toString('utf8');
      out += text;
      if (onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) { try { onLine(line); } catch {} }
        }
      }
    });
    child.stderr.on('data', (c) => { err += c.toString('utf8'); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, timedOut: false, stdout: out, stderr: err, error: String(e.message || e) });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: !killed && code === 0, code, timedOut: killed, stdout: out, stderr: err });
    });
  });
};

/**
 * 解码 `wsl.exe -l -q` 输出。真实输出是 UTF-16LE（带 BOM）；个别环境（未
 * 安装任何发行版 / wsl.exe 不可用）会输出按当前 ANSI 代码页（中文系统
 * GBK）编码的帮助文本且无 BOM——旧实现把无 BOM 输出也硬按 UTF-16LE 解码，
 * 得到乱码「发行版名」，configure 拿着乱码名继续执行后续命令全部失败，
 * 且「未检测到 WSL 发行版」的正确提示永远走不到。
 * @param {Buffer} buf wsl.exe stdout
 * @returns {string} 解码后的文本（可能含乱码，由 parseWslDistroList 判定）
 */
function decodeWslListOutput(buf) {
  if (!buf || buf.length === 0) return '';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8');
}

// 帮助/错误文本特征：无发行版时 `wsl -l -q` 输出用法提示（中/英），不是清单。
const WSL_USAGE_TEXT_RE = /(^|\n)\s*(Usage:|用法:|Copyright|版权所有)/i;

/**
 * 把 `wsl.exe -l -q` 解码文本解析为发行版名列表：
 *   · 含用法/版权特征行（未安装任何发行版）→ 空列表；
 *   · 空输出/仅空白 → 空列表；
 *   · 其余按行拆分、去首尾空白、去 BOM、过滤空行（发行版名允许含空格）。
 * @param {string} text decodeWslListOutput 的输出
 * @returns {string[]}
 */
function parseWslDistroList(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (WSL_USAGE_TEXT_RE.test(raw)) return [];
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/** `wsl.exe -l -q`（异步）：解码 + 解析；wsl.exe 缺失/失败返回空列表。 */
internals.wslListDistrosAsync = function wslListDistrosAsync() {
  return new Promise((resolve) => {
    const child = internals.spawn(WSL_EXE, ['-l', '-q'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let settled = false;
    const done = (list) => { if (!settled) { settled = true; resolve(list); } };
    const timer = setTimeout(() => { try { child.kill(); } catch {} done([]); }, 30000);
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); done([]); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) return done([]);
      done(parseWslDistroList(decodeWslListOutput(Buffer.concat(chunks))));
    });
  });
};

// ---------------------------------------------------------------------------
// 配置与探活
// ---------------------------------------------------------------------------

// 安装目录禁止的 shell 元字符：目录被拼进 `sh -lc '…'`（单引号内插），
// 除空白外还必须拒绝会破坏引号/命令结构的字符，避免配置值注入命令。
const INSTALL_DIR_FORBIDDEN = /[\s$`;&|<>"'()\\\r\n\t]/;

/** 校验并归一化安装目录（同步/异步共用；失败抛错，错误信息可展示给用户）。 */
function normalizeInstallDir(raw, wslHome) {
  let dir = String(raw || '').trim();
  if (dir) {
    if (dir.startsWith('~')) dir = wslHome + dir.slice(1);
    if (!dir.startsWith('/')) fail(`wslInstallDir 必须是 WSL 内的绝对路径（以 / 或 ~ 开头）: ${dir}`);
  } else {
    dir = wslHome + '/.dsh-desktop';
  }
  if (INSTALL_DIR_FORBIDDEN.test(dir)) {
    fail(`wslInstallDir 不能包含空白或 shell 特殊字符（$ \` ; & | < > 引号 括号）: ${dir}`);
  }
  return dir;
}

/**
 * 解析配置并探活（boot 与设置页 IPC 使用；失败抛错，错误信息可展示给用户）。
 * 全部探测走异步 spawn——绝不阻塞主进程。runWsl 已自带 `sh -lc` 包装，
 * 命令直接写裸命令即可（不再双重嵌套登录 shell）。
 * @param opts { distro?, installDir?, log }
 */
async function configureAsync(opts = {}) {
  state.logFn = opts.log || null;
  state.lastError = '';
  state.configured = false;
  state.distro = String(opts.distro || '').trim();
  if (!state.distro) {
    const distros = await internals.wslListDistrosAsync();
    if (distros.length === 0) {
      fail('未检测到 WSL 发行版。请确认已安装 WSL（wsl --install），或通过设置 wslDistro 指定发行版名。');
    }
    state.distro = distros[0];
  }
  log(`使用 WSL 发行版: ${state.distro}`);

  state.installDir = normalizeInstallDir(opts.installDir, await homeDirAsync());
  state.uncDir = '\\\\' + uncHost() + '\\' + state.distro + state.installDir.replace(/\//g, '\\');
  log(`安装目录: ${state.installDir}（UNC: ${state.uncDir}）`);

  const nodeRes = await internals.runWsl('node --version', { timeoutMs: 90000 });
  const npmRes = await internals.runWsl('npm --version', { timeoutMs: 90000 });
  state.nodeVersion = nodeRes.ok ? (nodeRes.stdout || '').trim() : '';
  state.npmVersion = npmRes.ok ? (npmRes.stdout || '').trim() : '';
  if (!state.nodeVersion || !state.npmVersion) {
    fail('WSL 内未找到可用的 node/npm。请先在 WSL 里安装 Node.js（如 apt install nodejs npm，或 fnm/nvm），然后重启应用。\n' + nodeRes.stderr + npmRes.stderr);
  }
  log(`WSL 运行时: node ${state.nodeVersion} / npm ${state.npmVersion}`);
  state.configured = true;
  return self();
}

async function homeDirAsync() {
  const res = await internals.runWsl('printf %s "$HOME"', { timeoutMs: 60000 });
  const home = (res.stdout || '').trim();
  if (!res.ok || !home.startsWith('/')) fail('无法解析 WSL 用户主目录: ' + (res.stderr || res.stdout));
  return home;
}

/** UNC 主机前缀：wsl.localhost（Win11）失败时回落 wsl$（旧版）。 */
function uncHost() {
  for (const host of ['wsl.localhost', 'wsl$']) {
    try {
      if (fs.existsSync('\\\\' + host)) return host;
    } catch {}
  }
  // 探测失败也返回 wsl.localhost（Win11 默认；旧版可手动改代码）。
  return 'wsl.localhost';
}

function isConfigured() { return state.configured; }
function isReady() { return state.configured && !state.lastError; }
function lastError() { return state.lastError; }
function installDirLinux() { return state.installDir; }
function uncHome() { return state.uncDir; }
function distroName() { return state.distro; }

/** 异步状态快照（agent 版本经异步 cat 读取，不阻塞主进程；设置页展示用，不抛错）。 */
async function statusAsync() {
  return {
    configured: state.configured,
    distro: state.distro,
    installDir: state.installDir,
    uncDir: state.uncDir,
    nodeVersion: state.nodeVersion,
    npmVersion: state.npmVersion,
    agentVersion: await activeVersionAsync(),
    lastError: state.lastError,
  };
}

// ---------------------------------------------------------------------------
// 安装 / 更新 / 回退
// ---------------------------------------------------------------------------

function agentBin() {
  return `${state.installDir}/agent/node_modules/@deepseek-ai/dsh/lib/bin.js`;
}

/** 内置壳自带的 dsh 版本（bootstrap 首次安装用）。 */
function bundledVersion() {
  try { return require(PKG + '/package.json').version; } catch { return 'latest'; }
}

// 版本号白名单：版本字符串被拼进 `sh -lc 'npm install <pkg>@<version>'`，
// 只允许字母/数字/点/下划线/连字符（覆盖 0.1.0-rc.6 与 latest 形态）。
const VERSION_RE = /^[A-Za-z0-9._-]+$/;

/**
 * 在 WSL 内执行一次 npm 安装并原子切换：装进 agent-staging，成功后
 * 旧 agent → agent-prev，staging → agent。失败保留现状并清理 staging。
 * 语义与 updater.js 的 Windows 路径对齐（save-exact / omit=dev /
 * 安装后校验入口文件 / 失败清理 staging）。
 */
async function installAgent(version, onLine) {
  const v = String(version || '');
  if (!VERSION_RE.test(v)) throw new Error(`非法的版本号: ${JSON.stringify(v)}`);
  const dir = state.installDir;
  const bin = `${dir}/agent-staging/node_modules/@deepseek-ai/dsh/lib/bin.js`;
  const cmd = `sh -lc 'set -eu; rm -rf ${dir}/agent-staging; mkdir -p ${dir}/agent-staging; cd ${dir}/agent-staging; export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false; npm install --save-exact --omit=dev --no-audit --no-fund --no-update-notifier ${PKG}@${v}; test -f ${bin}; cd ${dir}; if [ -d agent ]; then rm -rf agent-prev; mv agent agent-prev; fi; mv agent-staging agent; echo WSL_INSTALL_OK'`;
  const res = await internals.runWsl(cmd, { timeoutMs: 30 * 60 * 1000, onLine });
  if (!res.ok || !res.stdout.includes('WSL_INSTALL_OK')) {
    const tail = (res.stderr || res.stdout || '').split(/\r?\n/).slice(-15).join('\n');
    await internals.runWsl(`sh -lc 'rm -rf ${dir}/agent-staging'`).catch(() => {});
    throw new Error(`WSL 内 npm 安装 ${PKG}@${v} 失败（exit=${res.code}${res.timedOut ? '，超时' : ''}）:\n${tail}`);
  }
  state.versionCache = null;
  log(`${PKG}@${v} 已安装到 WSL（${dir}/agent）`);
}

/** 确保 agent 已安装（缺失时按内置版本安装；首次约数分钟）。 */
async function ensureInstalled() {
  const mk = await internals.runWsl(`sh -lc 'mkdir -p ${state.installDir}'`);
  if (!mk.ok) fail(`无法在 WSL 内创建安装目录 ${state.installDir}: ${mk.stderr || mk.stdout}`);
  const check = await internals.runWsl(`sh -lc 'test -f ${agentBin()} && echo EXISTS'`);
  if (check.ok && check.stdout.includes('EXISTS')) return false;
  const version = bundledVersion();
  log(`agent 缺失，开始在 WSL 内安装 ${PKG}@${version}（首次约数分钟）…`);
  await installAgent(version, (line) => log('npm: ' + line));
  return true;
}

/** 官方更新：与 ensureInstalled 同一路径（版本由 main.js 的检查流程决定）。 */
async function applyUpdate(version, onLine) {
  log(`开始更新 WSL 内 dsh 到 ${version}…`);
  await installAgent(version, onLine);
  return true;
}

/** 回退到上一版本（agent-prev → agent）。 */
async function rollback() {
  const dir = state.installDir;
  const res = await internals.runWsl(`sh -lc 'cd ${dir} && rm -rf agent-failed && mv agent agent-failed 2>/dev/null || true; if [ -d agent-prev ]; then mv agent-prev agent; echo WSL_ROLLBACK_OK; else echo WSL_NO_PREV; fi'`);
  state.versionCache = null;
  if (res.stdout.includes('WSL_NO_PREV')) return false;
  log('已回退到上一版本（agent-prev）');
  return true;
}

async function hasPrevious() {
  const res = await internals.runWsl(`sh -lc 'test -d ${state.installDir}/agent-prev && echo YES'`);
  return res.ok && res.stdout.includes('YES');
}

/** 当前生效版本（WSL 内读 package.json，失败返回 null）。 */
function activeVersion() {
  if (state.versionCache !== null) return state.versionCache;
  try {
    const res = internals.runWslSync(`sh -lc 'cat ${state.installDir}/agent/node_modules/@deepseek-ai/dsh/package.json'`, 60000);
    if (res.ok) {
      state.versionCache = JSON.parse(res.stdout).version || null;
      return state.versionCache;
    }
  } catch {}
  state.versionCache = null;
  return null;
}

/** 异步版当前生效版本（不阻塞主进程）。 */
async function activeVersionAsync() {
  if (state.versionCache !== null) return state.versionCache;
  try {
    const res = await internals.runWsl(`cat ${state.installDir}/agent/node_modules/@deepseek-ai/dsh/package.json`, { timeoutMs: 60000 });
    if (res.ok) {
      state.versionCache = JSON.parse(res.stdout).version || null;
      return state.versionCache;
    }
  } catch {}
  state.versionCache = null;
  return null;
}

// ---------------------------------------------------------------------------
// 启动 / 停止
// ---------------------------------------------------------------------------

/**
 * 在 WSL 内启动 dsh web，返回 wsl.exe 子进程。
 * stdout（含 `dsh web: http://127.0.0.1:<port>` 就绪行）透传给调用方
 * （main.js 复用本地模式的 URL 解析与超时逻辑）；pid 写入 <dir>/dsh.pid。
 */
function spawnServer() {
  const dir = state.installDir;
  // env -u 清掉宿主 harness 残留（DSH_WEB_URL / 会话变量），避免 WSL 内 dsh 误判；
  // DSH_HOME 指向安装目录（profiles/sessions 数据与 agent 同目录）。
  const cmd = `sh -lc 'cd ${dir} && rm -f dsh.pid && echo $$ > dsh.pid && exec env -u DSH_WEB_URL -u DSH_SESSION_ID -u DSH_SESSION_JSONL -u DSH_SHELL -u NODE_OPTIONS DSH_HOME=${dir} node ${agentBin()} web --host 127.0.0.1 --port 0'`;
  log(`启动 WSL dsh web: ${cmd}`);
  const proc = internals.spawn(WSL_EXE, ['-d', state.distro, '-e', 'sh', '-lc', cmd], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return proc;
}

/** 按 pid 文件优雅终止 WSL 内的 dsh web（绝不 wsl --terminate，那会杀整个发行版）。 */
async function stop() {
  const dir = state.installDir;
  const res = await internals.runWsl(`sh -lc 'p=${dir}/dsh.pid; if [ -f $p ]; then kill $(cat $p) 2>/dev/null || true; fi; rm -f ${dir}/dsh.pid'`, { timeoutMs: 30000 });
  log('已请求终止 WSL 内 dsh web' + (res.ok ? '' : '（可能已退出）'));
}

function self() {
  return {
    configureAsync, isConfigured, isReady, lastError, statusAsync,
    installDirLinux, uncHome, distroName,
    ensureInstalled, applyUpdate, rollback, hasPrevious, activeVersion, activeVersionAsync,
    spawnServer, stop,
    // 纯函数（单测）：wsl.exe 列表输出解码/解析。
    decodeWslListOutput, parseWslDistroList,
    // 原语（单测注入桩替身用；产品代码不消费）。
    _internals: internals,
  };
}

module.exports = self();
