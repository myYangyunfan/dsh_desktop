'use strict';

// WSL 托管后端 —— Windows 壳经 wsl.exe 在 WSL 内安装 / 更新 / 运行自己的 dsh。
//
// WSL 内目录布局（默认 <安装目录> = ~/.dsh-desktop，可配置）：
//   <dir>/agent/node_modules/@deepseek-ai/dsh   当前生效版本（DSH_HOME=<dir>）
//   <dir>/agent-prev/...                        上一版本（更新/回退用）
//   <dir>/agent-staging/...                     npm 安装 staging（完成后原子 mv）
//   <dir>/dsh.pid                               dsh web 进程 pid（退出清理用）
//   <dir>/profiles、sessions、settings.yaml      dsh 自身数据（与本地模式同构）
// 配套插件同步不在这里：main.js 的 syncCompanionPlugins 经 UNC（effectiveDshHome =
// <dir> 的 UNC 等价路径）直接写入 WSL profile，与本模块解耦。
// （v1.0.0 纯净线拆掉了随包 Agent 预设子系统，UNC 写穿面上不再有预设半边。）
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
  // 不传 encoding：拿原始 Buffer（wsl.exe 自身错误消息可能是无 BOM UTF-16LE，
  // 按 decodeWslText 统一校正；成功路径的 WSL 内 Linux 输出为 UTF-8）。
  const res = internals.spawnSync(WSL_EXE, ['-d', state.distro, '-e', 'sh', '-lc', cmd], {
    windowsHide: true,
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error) {
    return {
      ok: false, code: -1,
      stdout: decodeWslText(res.stdout), // 超时等场景下仍可能已收集到部分输出
      stderr: decodeWslText(res.stderr) + String(res.error.message || res.error),
    };
  }
  return { ok: res.status === 0, code: res.status, stdout: decodeWslText(res.stdout), stderr: decodeWslText(res.stderr) };
};

/** 异步执行一条 WSL 命令，收集输出；onLine 可选地收到每行 stdout（进度日志）。
 * cmd 已由本函数包装进外层 `sh -lc`（登录 shell），调用方传裸命令串即可
 * ——不要再自行嵌套 `sh -lc '...'`（历史遗留的双重嵌套已清理：多一层登录
 * shell 会重复加载 profile、拉长 WSL 冷启动，且嵌套引号是未来的注入面）。 */
internals.runWsl = function runWsl(cmd, { timeoutMs = 20 * 60 * 1000, onLine } = {}) {
  return new Promise((resolve) => {
    const child = internals.spawn(WSL_EXE, ['-d', state.distro, '-e', 'sh', '-lc', cmd], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // 收集原始 Buffer，exit 时统一解码：多字节字符跨 chunk 边界时流式
    // toString 会产生替换符；wsl.exe 自身的错误消息（如「WSL2 未能启动」）
    // 是无 BOM UTF-16LE 且写在 stdout，按 utf8 流式解码即乱码（issue #126）。
    const outChunks = [];
    const errChunks = [];
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch {}
    }, timeoutMs);
    child.stdout.on('data', (c) => {
      outChunks.push(c);
      if (onLine) {
        for (const line of c.toString('utf8').split(/\r?\n/)) {
          if (line.trim()) { try { onLine(line); } catch {} }
        }
      }
    });
    child.stderr.on('data', (c) => { errChunks.push(c); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        ok: false, code: -1, timedOut: false,
        stdout: decodeWslText(Buffer.concat(outChunks)),
        stderr: decodeWslText(Buffer.concat(errChunks)) + String(e.message || e),
        error: String(e.message || e),
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0, code, timedOut: killed,
        stdout: decodeWslText(Buffer.concat(outChunks)),
        stderr: decodeWslText(Buffer.concat(errChunks)),
      });
    });
  });
};

/**
 * 判定「无 BOM 的 UTF-16LE」字节流（issue #126）：Store 版 / 新版 wsl.exe 在
 * 管道输出 `wsl -l -q` 时不带 BOM（实测首字节直接是首字符，如 `55 00 62 00`）。
 * ASCII/GBK/UTF-8 文本不含 NUL 字节，而 UTF-16LE 的 ASCII 字符高字节恒为 0
 * 且行尾 \r\n 贡献奇数位 NUL——奇数位 NUL 明显多于偶数位即是强信号。
 * @param {Buffer} buf
 * @returns {boolean}
 */
function looksLikeUtf16leNoBom(buf) {
  if (buf.length < 4 || buf.length % 2 !== 0) return false;
  let odd = 0;
  let even = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (buf[i] === 0) even++;
    if (buf[i + 1] === 0) odd++;
  }
  return odd >= 2 && odd > even * 4;
}

/**
 * 解码 wsl.exe 输出（stdout/stderr 通用）。输出形态有三种（真实环境实测）：
 *   · UTF-16LE 带 BOM（FF FE 开头，旧版内置 wsl.exe）；
 *   · UTF-16LE 无 BOM（Store 版 / 新版 wsl.exe，issue #126：`wsl -l -q` 清单
 *     与 wsl.exe 自身错误消息——如「WSL2 未能启动」——均为此形态。旧实现
 *     只认 BOM，无 BOM 时按 utf8 兜底：清单被解出 `d\x00o\x00c\x00k\x00…`
 *     之类的「发行版名」当 `-d` 参数传给 spawn，Node 以 "The argument
 *     'args[1]' must be a string without null bytes" 拒绝；错误消息则解出
 *     乱码直接展示给用户）；
 *   · WSL 内 Linux 程序输出 / ANSI 代码页帮助文本（UTF-8 / 中文系统 GBK）：
 *     均不含 NUL 字节，启发式不会命中，安全走 utf8 路径。
 * @param {Buffer} buf wsl.exe stdout/stderr 原始字节
 * @returns {string} 解码后的文本（可能含乱码，由调用方判定）
 */
function decodeWslText(buf) {
  if (!buf || buf.length === 0) return '';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (looksLikeUtf16leNoBom(buf)) return buf.toString('utf16le');
  return buf.toString('utf8');
}

// 帮助/错误文本特征：无发行版时 `wsl -l -q` 输出用法提示（中/英），不是清单。
const WSL_USAGE_TEXT_RE = /(^|\n)\s*(Usage:|用法:|Copyright|版权所有)/i;

/**
 * 把 `wsl.exe -l -q` 解码文本解析为发行版名列表：
 *   · 含用法/版权特征行（未安装任何发行版）→ 空列表；
 *   · 空输出/仅空白 → 空列表；
 *   · 其余按行拆分、去首尾空白、去 BOM、过滤空行（发行版名允许含空格）。
 * 防御（issue #126）：任何解码策略的残余失误都不允许把含 NUL/控制字符的
 * 「名字」放进列表——这类名字一旦被当作 `-d <distro>` 参数传给 spawn，
 * Node 会直接抛 "string without null bytes" 且报错完全不可读。ASCII 名字
 * 在 UTF-16LE 被误按单字节解码的形态（`U\x00b\x00…`）剥 NUL 后即可自愈。
 * @param {string} text decodeWslListOutput 的输出
 * @returns {string[]}
 */
function parseWslDistroList(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (WSL_USAGE_TEXT_RE.test(raw)) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.replace(/\u0000/g, '').trim())
    .filter((s) => s !== '' && !/[\u0000-\u001f\u007f]/.test(s));
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
      done(parseWslDistroList(decodeWslText(Buffer.concat(chunks))));
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
    // Docker Desktop 的辅助发行版（docker-desktop / docker-desktop-data）不含
    // 交互 shell 与 node，不是可用的托管环境；它们常排在列表首位（issue #126
    // 用户的机器上即如此），自动选择时跳过（显式配置 wslDistro 不受影响）。
    // 全是系统发行版时仍取第一个，让后续 node/npm 探活给出可读的错误提示。
    const SYSTEM_DISTRO_RE = /^docker-desktop(-data)?$/i;
    state.distro = distros.find((d) => !SYSTEM_DISTRO_RE.test(d)) || distros[0];
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
// 只允许字母/数字/点/下划线/连字符（覆盖 0.1.0-rc.7 与 latest 形态）。
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
  const cmd = `set -eu; rm -rf ${dir}/agent-staging; mkdir -p ${dir}/agent-staging; cd ${dir}/agent-staging; export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false; npm install --save-exact --omit=dev --no-audit --no-fund --no-update-notifier ${PKG}@${v}; test -f ${bin}; cd ${dir}; if [ -d agent ]; then rm -rf agent-prev; mv agent agent-prev; fi; mv agent-staging agent; echo WSL_INSTALL_OK`;
  const res = await internals.runWsl(cmd, { timeoutMs: 30 * 60 * 1000, onLine });
  if (!res.ok || !res.stdout.includes('WSL_INSTALL_OK')) {
    const tail = (res.stderr || res.stdout || '').split(/\r?\n/).slice(-15).join('\n');
    // 清理命令必须短超时：WSL 卡死场景下默认 20 分钟超时会把「安装失败」
    // 的错误抛出拖延到用户不可忍受。runWsl 永远 resolve（从不 reject），
    // 无需 .catch。
    await internals.runWsl(`rm -rf ${dir}/agent-staging`, { timeoutMs: 15000 });
    throw new Error(`WSL 内 npm 安装 ${PKG}@${v} 失败（exit=${res.code}${res.timedOut ? '，超时' : ''}）:\n${tail}`);
  }
  state.versionCache = null;
  log(`${PKG}@${v} 已安装到 WSL（${dir}/agent）`);
}

/** 确保 agent 已安装（缺失时按内置版本安装；首次约数分钟）。 */
async function ensureInstalled() {
  const mk = await internals.runWsl(`mkdir -p ${state.installDir}`);
  if (!mk.ok) fail(`无法在 WSL 内创建安装目录 ${state.installDir}: ${mk.stderr || mk.stdout}`);
  const check = await internals.runWsl(`test -f ${agentBin()} && echo EXISTS`);
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
  const res = await internals.runWsl(`cd ${dir} && rm -rf agent-failed && mv agent agent-failed 2>/dev/null || true; if [ -d agent-prev ]; then mv agent-prev agent; echo WSL_ROLLBACK_OK; else echo WSL_NO_PREV; fi`);
  state.versionCache = null;
  // 命令执行失败（res.ok=false）时 stdout 为空，绝不能被当成「已回退」的
  // 虚假成功（issue #87）。
  if (!res.ok) {
    log('WSL 回退命令执行失败: ' + (res.stderr || res.stdout || 'unknown'));
    return false;
  }
  if (res.stdout.includes('WSL_NO_PREV')) return false;
  log('已回退到上一版本（agent-prev）');
  return true;
}

async function hasPrevious() {
  const res = await internals.runWsl(`test -d ${state.installDir}/agent-prev && echo YES`);
  return res.ok && res.stdout.includes('YES');
}

/** 当前生效版本（WSL 内读 package.json，失败返回 null）。 */
function activeVersion() {
  if (state.versionCache !== null) return state.versionCache;
  try {
    const res = internals.runWslSync(`cat ${state.installDir}/agent/node_modules/@deepseek-ai/dsh/package.json`, 60000);
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
  // rc.8 起 dsh web 默认 openBrowser=true；WSL 内 open 会经 wslview 拉起
  // Windows 默认浏览器，桌面内嵌场景必须关闭。rc.7 及更早无 --no-open
  // 选项（未知选项直接报错），故按 WSL 内实际内核版本门控。
  const { compareVersions } = require('./scripts/lib/versions');
  const noOpen = compareVersions(activeVersion() || '0.0.0', '0.1.0-rc.8') >= 0 ? ' --no-open' : '';
  // env -u 清掉宿主 harness 残留（DSH_WEB_URL / 会话变量），避免 WSL 内 dsh 误判；
  // DSH_HOME 指向安装目录（profiles/sessions 数据与 agent 同目录）。
  const cmd = `cd ${dir} && rm -f dsh.pid && echo $$ > dsh.pid && exec env -u DSH_WEB_URL -u DSH_SESSION_ID -u DSH_SESSION_JSONL -u DSH_SHELL -u NODE_OPTIONS DSH_HOME=${dir} node ${agentBin()} web${noOpen} --host 127.0.0.1 --port 0`;
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
  const res = await internals.runWsl(`p=${dir}/dsh.pid; if [ -f "$p" ]; then kill $(cat "$p") 2>/dev/null || true; fi; rm -f ${dir}/dsh.pid`, { timeoutMs: 30000 });
  log('已请求终止 WSL 内 dsh web' + (res.ok ? '' : '（可能已退出）'));
}

function self() {
  return {
    configureAsync, isConfigured, isReady, lastError, statusAsync,
    installDirLinux, uncHome, distroName,
    ensureInstalled, applyUpdate, rollback, hasPrevious, activeVersion, activeVersionAsync,
    spawnServer, stop,
    // 纯函数（单测）：wsl.exe 输出解码/解析。decodeWslListOutput 为历史名
    // （等价 decodeWslText），保留导出以免既有调用方/测试破裂。
    decodeWslListOutput: decodeWslText, decodeWslText, parseWslDistroList,
    // 原语（单测注入桩替身用；产品代码不消费）。
    _internals: internals,
  };
}

module.exports = self();
