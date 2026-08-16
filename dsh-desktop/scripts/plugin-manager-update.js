'use strict';
// ---------------------------------------------------------------------------
// 插件更新（npm 官方/镜像 双源 + GitHub Releases 官方/镜像）：
// 纯函数部分（版本比较、源 URL 构建、校验、解压包根定位）集中在这里，
// 便于 node --test 单测；网络下载与文件落地编排在 main.js（pluginManager*）。
// ---------------------------------------------------------------------------

/** 数值分段比较版本（0.12.2 > 0.2.1；非数字段按字符串比较）。 */
function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/, '').split('.');
  const pb = String(b || '').replace(/^v/, '').split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x), ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** npm registry 的「最新版本」端点（官方 / npmmirror 镜像）。 */
function npmLatestUrl(pkg, mirror) {
  const enc = encodeURIComponent(String(pkg));
  const host = mirror ? 'registry.npmmirror.com' : 'registry.npmjs.org';
  return 'https://' + host + '/' + enc + '/latest';
}

/** GitHub Releases 的 latest API 端点。 */
function githubReleaseApiUrl(repo) {
  return 'https://api.github.com/repos/' + String(repo).replace(/^\/|\/$/g, '') + '/releases/latest';
}

/** GitHub Release 资产直链（官方）。 */
function githubAssetDownloadUrl(repo, tag, assetName) {
  return 'https://github.com/' + String(repo).replace(/^\/|\/$/g, '') + '/releases/download/' + String(tag) + '/' + encodeURIComponent(String(assetName));
}

/** GitHub 加速镜像前缀列表（国内网络友好；逐个尝试，全部失败再报错）。 */
const GH_PROXY_PREFIXES = [
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
];

/** 给任意 https://github.com/... 直链套镜像前缀。 */
function ghProxyUrl(url) {
  for (const prefix of GH_PROXY_PREFIXES) {
    if (url.startsWith(prefix)) return url;
  }
  return GH_PROXY_PREFIXES[0] + url;
}

/** 校验 sha512 base64 integrity（npm dist.integrity 格式: sha512-<base64>）。 */
function verifyIntegrity(buffer, integrity) {
  if (!integrity || typeof integrity !== 'string') return false;
  const m = integrity.match(/^sha512-([A-Za-z0-9+/=]+)$/);
  if (!m) return false;
  const crypto = require('node:crypto');
  const actual = crypto.createHash('sha512').update(buffer).digest('base64');
  return actual === m[1];
}

/**
 * 在解压目录中定位「含 package.json 的包根目录」：
 *   npm tarball → 顶层 package/；GitHub zip → 顶层 <repo>-<ref>/ 或直接是根。
 * 返回目录绝对路径；找不到返回 null。
 * @param {string} dir 解压目标目录（tar.exe 解压后的临时目录）
 */
function findPackageRoot(dir) {
  const fs = require('node:fs');
  const path = require('node:path');
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  // 1) 顶层直接就是包根
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  // 2) 只有一个子目录且内含 package.json → 那就是包根
  if (dirs.length === 1) {
    const sub = path.join(dir, dirs[0]);
    if (fs.existsSync(path.join(sub, 'package.json'))) return sub;
  }
  // 3) package/ 惯例（npm tarball）
  const pkg = path.join(dir, 'package');
  if (fs.existsSync(path.join(pkg, 'package.json'))) return pkg;
  // 4) 多个子目录：找其中唯一含 package.json 的那个
  for (const name of dirs) {
    if (fs.existsSync(path.join(dir, name, 'package.json'))) return path.join(dir, name);
  }
  return null;
}

module.exports = {
  compareVersions,
  npmLatestUrl,
  githubReleaseApiUrl,
  githubAssetDownloadUrl,
  ghProxyUrl,
  GH_PROXY_PREFIXES,
  verifyIntegrity,
  findPackageRoot,
};
