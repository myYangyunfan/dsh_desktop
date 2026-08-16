'use strict';
// ---------------------------------------------------------------------------
// 插件更新（npm 官方/镜像 双源 + GitHub Releases 官方/镜像）：
// 纯函数部分（版本比较、源 URL 构建、校验、解压包根定位）集中在这里，
// 便于 node --test 单测；网络下载与文件落地编排在 main.js（pluginManager*）。
// ---------------------------------------------------------------------------

/**
 * 数值分段比较版本（0.12.2 > 0.2.1），semver 段规则：
 *   - 缺失段按 0 处理（1.0 == 1.0.0）；
 *   - 段先按数字前缀比较（0.2.4-beta > 0.2.3）；
 *   - 数字前缀相等时：无预发布后缀 > 有后缀（0.2.3 > 0.2.3-beta）；
 *   - 两段都带后缀按字符串比较（alpha < beta）；
 *   - 数字段 > 纯文本段。
 */
function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/, '').split('.');
  const pb = String(b || '').replace(/^v/, '').split('.');
  const n = Math.max(pa.length, pb.length);
  const seg = (s) => {
    if (s === undefined) return { num: 0, isNum: true, hasPre: false, raw: '' };
    const m = /^(\d+)(.*)$/.exec(s);
    if (!m) return { num: NaN, isNum: false, hasPre: false, raw: s };
    return { num: parseInt(m[1], 10), isNum: true, hasPre: m[2].length > 0, raw: s };
  };
  for (let i = 0; i < n; i++) {
    const x = seg(pa[i]), y = seg(pb[i]);
    if (x.isNum && y.isNum) {
      if (x.num !== y.num) return x.num < y.num ? -1 : 1;
      if (x.hasPre !== y.hasPre) return x.hasPre ? -1 : 1; // 有后缀 < 无后缀
      if (x.hasPre && x.raw !== y.raw) return x.raw < y.raw ? -1 : 1;
    } else if (x.isNum && !y.isNum) {
      return 1;
    } else if (!x.isNum && y.isNum) {
      return -1;
    } else if (x.raw !== y.raw) {
      return x.raw < y.raw ? -1 : 1;
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
function findPackageRoot(dir, depth = 0) {
  const fs = require('node:fs');
  const path = require('node:path');
  if (depth > 8) return null; // 递归深度防护（防目录环/异常嵌套）
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  // 1) 顶层直接就是包根
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  // 2) 只有一个子目录且内含 package.json → 那就是包根；
  //    唯一子目录不含 package.json 时递归深入（GitHub zip 可能多套一层）
  if (dirs.length === 1) {
    const sub = path.join(dir, dirs[0]);
    if (fs.existsSync(path.join(sub, 'package.json'))) return sub;
    return findPackageRoot(sub, depth + 1);
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
