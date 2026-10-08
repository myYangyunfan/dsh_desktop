'use strict';

// ---------------------------------------------------------------------------
// WSL 路径三形态互转（纯函数，唯一实现）。
//
// WSL 托管模式下同一路径有三种形态，sidecar 与 Rust 壳各持一种视角：
//
//   ① WSL 内 Linux 路径   /home/user/.dsh-desktop
//                        （内核与 WSL 内 node/npm 的视角；wsl-backend.js
//                         installDirLinux / spawnServer 命令行使用）
//   ② Windows UNC 路径    \\wsl.localhost\Ubuntu\home\user\.dsh-desktop
//                        （Windows 壳经 9P 文件系统直读 WSL 文件的视角；
//                         Electron effectiveDshHome() = wslBackend.uncHome()，
//                         插件同步 / 补丁半边全部经此写穿）
//   ③ Windows 盘符路径    C:\Users\user\... ↔ WSL 内 /mnt/c/Users/user/...
//                        （wslpath 的 drvfs 约定；本地资产 ↔ WSL 视角的
//                         对照，用于日志对照与跨侧路径提示）
//
// 溯源：UNC 构造规则逐字对齐 Electron wsl-backend.js 的
// `state.uncDir = '\\\\' + uncHost() + '\\' + distro + installDir.replace(/\//g, '\\')`
// （wsl.localhost 优先、wsl$ 回落，发行版名保留原样）；识别口径与
// scripts/lib/profile-reconcile.js 的 isWslUncPath 一致（两种主机名、
// 大小写不敏感、容忍正斜杠写法）。本模块是 sidecar 侧的纯函数收口：
// 不做 fs 探测、不 spawn wsl.exe——所有函数可穷举单测。
// ---------------------------------------------------------------------------

/** WSL UNC 主机名（识别与构造时的两种合法形态；wsl.localhost 为 Win11 默认）。 */
const WSL_UNC_HOSTS = ['wsl.localhost', 'wsl$'];

/** 归一：正斜杠 UNC 写法（//wsl.localhost/...）与大小写主机名统一成小写反斜杠形态。 */
function normalizeUncForParse(p) {
  return String(p || '').replace(/\//g, '\\').toLowerCase();
}

/** 判定主机段是否 WSL UNC 主机（大小写不敏感）。 */
function isWslUncHost(host) {
  const h = String(host || '').toLowerCase();
  return WSL_UNC_HOSTS.includes(h);
}

/**
 * 判定路径是否 WSL 发行版的 UNC 形态（\\wsl$\<distro> / \\wsl.localhost\<distro>，
 * 容忍正斜杠与主机名大小写）。与 profile-reconcile.js 的 isWslUncPath 同口径；
 * 该函数是共享模块（scripts/ 下）的防线，这里是 sidecar 侧的独立实现
 * （模块边界隔离，两侧语义由测试锚定一致）。
 * @param {string} p 任意路径（空 / 非字符串 → false）
 * @returns {boolean}
 */
function isWslUncPath(p) {
  if (typeof p !== 'string' || p === '') return false;
  const norm = normalizeUncForParse(p);
  return norm.startsWith('\\\\wsl$\\') || norm.startsWith('\\\\wsl.localhost\\');
}

/**
 * 归一 WSL 内 Linux 路径：反斜杠不转（Linux 文件名合法字符）、重复斜杠折叠、
 * 去尾部斜杠（根目录 '/' 保留）。输入必须以 '/' 开头，否则原样返回（非
 * Linux 绝对路径不属于本函数职责）。
 * @param {string} p
 * @returns {string}
 */
function normalizeWslLinuxPath(p) {
  let s = String(p || '');
  if (!s.startsWith('/')) return s;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}

/**
 * 解析 WSL UNC 路径为结构形态。
 * @param {string} p UNC 路径（容忍正斜杠 / 主机名大小写）
 * @returns {{host: 'wsl.localhost'|'wsl$', distro: string, linuxPath: string}|null}
 *   distro 为去掉主机名后的首段（发行版名允许含空格，不含路径分隔符）；
 *   linuxPath 恒以 '/' 开头（仅有发行段时为 '/'）。无法解析（非 WSL UNC、
 *   缺发行版段）返回 null。
 */
function parseWslUnc(p) {
  if (typeof p !== 'string' || p === '') return null;
  // 主机名大小写不敏感（按归一形态定位前缀），但发行版名与路径段保留原样
  // （Windows UNC 共享名大小写不敏感匹配、大小写保留；发行版名用于回构
  // UNC 与展示，必须逐字保真）。
  const orig = p.replace(/\//g, '\\');
  const norm = orig.toLowerCase();
  let host = null;
  let prefixLen = 0;
  for (const h of WSL_UNC_HOSTS) {
    const prefix = '\\\\' + h + '\\';
    if (norm.startsWith(prefix)) { host = h; prefixLen = prefix.length; break; }
  }
  if (!host) return null;
  const rest = orig.slice(prefixLen);
  if (rest === '') return null; // `\\wsl.localhost\`：无发行版段
  const sep = rest.indexOf('\\');
  const distro = sep === -1 ? rest : rest.slice(0, sep);
  if (distro === '') return null;
  // 发行段之后的路径回切成 Linux 形态：尾段反斜杠 → '/'，空段折叠。
  const tail = sep === -1 ? '' : rest.slice(sep);
  const linuxPath = tail === ''
    ? '/'
    : '/' + tail.split('\\').filter((s) => s !== '').join('/');
  return { host, distro, linuxPath: normalizeWslLinuxPath(linuxPath) };
}

/**
 * WSL 内 Linux 路径 → Windows UNC 路径（Electron wsl-backend.uncHome 同一构造式）。
 * @param {string} linuxPath WSL 内绝对路径（以 / 开头；重复斜杠/尾斜杠会被归一）
 * @param {string} distro 发行版名（非空、不含分隔符）
 * @param {'wsl.localhost'|'wsl$'} [host='wsl.localhost']
 * @returns {string} 形如 \\wsl.localhost\Ubuntu\home\user\.dsh-desktop
 * @throws {Error} distro 为空 / 含分隔符，或 linuxPath 非 / 开头
 */
function wslLinuxToUnc(linuxPath, distro, host = 'wsl.localhost') {
  const d = String(distro || '').trim();
  if (!d) throw new Error('wslLinuxToUnc: distro 不能为空');
  if (/[/\\]/.test(d)) throw new Error('wslLinuxToUnc: distro 不能包含路径分隔符: ' + d);
  const lp = normalizeWslLinuxPath(linuxPath);
  if (!lp.startsWith('/')) throw new Error('wslLinuxToUnc: linuxPath 必须以 / 开头: ' + linuxPath);
  const h = String(host || 'wsl.localhost');
  if (!isWslUncHost(h)) throw new Error('wslLinuxToUnc: 未知 UNC 主机名: ' + host);
  return '\\\\' + h + '\\' + d + lp.replace(/\//g, '\\');
}

/** UNC → WSL 内 Linux 路径；非 WSL UNC 形态返回 null。 */
function wslUncToLinux(p) {
  const parsed = parseWslUnc(p);
  return parsed ? parsed.linuxPath : null;
}

/**
 * Windows 盘符路径 → WSL 内 /mnt/<盘符小写>/... 路径（wslpath -u 的 drvfs 约定）。
 * @param {string} p 形如 C:\Users\x 或 C:/Users/x（大小写盘符均可）
 * @returns {string|null} /mnt/c/Users/x；非盘符路径（UNC / 相对路径）返回 null
 */
function windowsDriveToWslLinux(p) {
  if (typeof p !== 'string' || p === '') return null;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return null;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, '/');
  return '/mnt/' + drive + '/' + rest;
}

/**
 * WSL 内 /mnt/<盘符>/... → Windows 盘符路径（wslpath -w 的逆约定，盘符大写）。
 * @param {string} p 形如 /mnt/c/Users/x
 * @returns {string|null} C:\Users\x；非 /mnt/<单盘符>/ 前缀返回 null
 */
function wslLinuxToWindowsDrive(p) {
  if (typeof p !== 'string' || p === '') return null;
  const m = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/.exec(normalizeWslLinuxPath(p));
  if (!m) return null;
  const drive = m[1].toUpperCase();
  const rest = m[2] || '';
  return drive + ':\\' + rest.replace(/\//g, '\\');
}

module.exports = {
  WSL_UNC_HOSTS,
  isWslUncHost,
  isWslUncPath,
  normalizeWslLinuxPath,
  parseWslUnc,
  wslLinuxToUnc,
  wslUncToLinux,
  windowsDriveToWslLinux,
  wslLinuxToWindowsDrive,
};
