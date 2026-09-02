'use strict';

// ---------------------------------------------------------------------------
// profile cordis.patch.yml 自愈（兼容层）：
//   · 文本手术（dedupePatchEntries / dropBlocksByIds）唯一实现已收口到
//     scripts/plugin-core/lib/patch-surgery.js（统一 id 字符集含点号、EOL 保持）；
//   · manifest bundles 移除唯一实现已收口到
//     scripts/plugin-core/lib/manifest-store.js（写锁 + 原子写 + 备份保留）；
//   · 本文件保留：loader 失败日志解析（parseFailedLoaderIds /
//     mapPackagesToPatchIds，id 字符集含点号）与只读预检
//     （findMissingBundleDeclarations / scanBundleContracts）。
// ---------------------------------------------------------------------------

const { dedupePatchEntries, dropBlocksByIds } = require('./scripts/plugin-core/lib/patch-surgery');
const { removeBundlesFromProfile: manifestRemoveBundles } = require('./scripts/plugin-core/lib/manifest-store');

/**
 * 把坏 bundle 从 dsh.profile.bundles 移除，但保留 dependencies（纯客户端插件
 * 仍可能由市场挂载，移出启动层不等于卸载）。
 * 单一写入方收口：委托 ManifestStore（写锁 + 原子写 + 备份保留），杜绝
 * 「启动自愈与用户卸载并发写同一 manifest 互相覆盖」的丢更新（I3）。
 * @param {string} profileDir profile 目录
 * @param {string[]} names 待移除包名（应已过 @deepseek-ai/* 过滤）
 * @returns {Promise<string[]>} 实际移除的包名
 */
function removeBundlesFromProfile(profileDir, names) {
  return manifestRemoveBundles(profileDir, names);
}

/**
 * 从 dsh-web.log 尾部识别 loader 失败条目 id。覆盖五种形态：
 *   1. failed to apply|import loader entry <hash> (@scope/pkg): ...（apply=装配
 *      期失败；import=模块导入期失败，如 0.5.5+ 内核移除 dsh-client-runtime
 *      后旧版 @linxin666/dsh-desktop-launcher 报 missed the module table）
 *   2. duplicate loader entry id: X
 *   3. 括号中的包名 @scope/pkg 或非 scope 包名
 *   4. profile bundle "X" declares no dsh.bundle in its package.json
 * @param {string} text 日志文本
 * @returns {string[]} 去重后的 id/包名 token 列表
 */
function parseFailedLoaderIds(text) {
  const ids = new Set();
  // apply/import 两期失败都必须识别：safe-boot 自动禁用此前只认 apply，
  // import 形态（内核 alpha.x 模块表严格化后高频出现）从未被禁用 →
  // 用户每次启动都被同一坏插件弹错（5.4→5.5→5.6 连续复现）。
  const hashRe = /failed to (?:apply|import) loader entry\s+([A-Za-z0-9_.-]+)\s*\(/g;
  let m;
  while ((m = hashRe.exec(text)) !== null) {
    ids.add(m[1]);
  }
  const dupRe = /duplicate loader entry id:\s*([A-Za-z0-9_.-]+)/g;
  while ((m = dupRe.exec(text)) !== null) ids.add(m[1]);
  const pkgRe = /failed to (?:apply|import) loader entry[\s\S]{0,120}?\((@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)\)/g;
  while ((m = pkgRe.exec(text)) !== null) ids.add(m[1]);
  ids.delete('include'); // 旧日志形态里的无关 token
  const bundleRe = /profile bundle\s+"([^"]+)"\s+declares no dsh\.bundle/g;
  while ((m = bundleRe.exec(text)) !== null) ids.add(m[1]);
  return [...ids];
}

/**
 * 只读自愈预检：日志含「declares no dsh.bundle」形态时，返回经文件系统二次
 * 确认的坏 bundle 名单。绝不含 @deepseek-ai/*。
 * @param {string} profileDir profile 目录
 * @param {string} logText dsh-web.log 尾部文本
 * @param {object} [fs] 文件系统实现（默认 node:fs）
 * @returns {string[]}
 */
function findMissingBundleDeclarations(profileDir, logText, fs = require('node:fs')) {
  if (!/profile bundle\s+"([^"]+)"\s+declares no dsh\.bundle/.test(logText || '')) return [];
  const claimed = (parseFailedLoaderIds(logText) || []).filter((t) => t && !t.startsWith('@deepseek-ai/'));
  if (claimed.length === 0) return [];
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(require('node:path').join(profileDir, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  const bundles = (manifest.dsh?.profile?.bundles || []).filter((n) => claimed.includes(n));
  return bundles.filter((n) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(require('node:path').join(profileDir, 'node_modules', n, 'package.json'), 'utf8'));
      return typeof (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch) !== 'string';
    } catch {
      return false;
    }
  });
}

/**
 * 只读自愈预检（不依赖日志）：直接扫 manifest bundles，返回经文件系统二次
 * 确认的缺声明名单。绝不收 @deepseek-ai/*。
 * @param {string} profileDir profile 目录
 * @param {object} [fs] 文件系统实现（默认 node:fs）
 * @returns {string[]}
 */
function scanBundleContracts(profileDir, fs = require('node:fs')) {
  const path = require('node:path');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  const bundles = (manifest.dsh?.profile?.bundles || []).filter((n) => typeof n === 'string' && n && !n.startsWith('@deepseek-ai/'));
  const missing = [];
  for (const n of bundles) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', n, 'package.json'), 'utf8'));
      if (typeof (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch) !== 'string') missing.push(n);
    } catch {
      // 目录缺失 / package.json 不可读 → 交给 cannot-resolve 家族
    }
  }
  return missing;
}

/**
 * 把 loader 日志中的包名映射回 patch 条目 id（按「- id: X 之后紧邻的
 * name: 包名」扫描；一个包名可能对应多个条目，全部返回）。
 * @param {string} patchText cordis.patch.yml 原文
 * @param {string[]} packages 包名列表
 * @returns {string[]} 匹配到的 patch 条目 id
 */
function mapPackagesToPatchIds(patchText, packages) {
  const wanted = new Set((packages || []).filter((p) => typeof p === 'string' && p));
  if (wanted.size === 0) return [];
  const ids = [];
  const entryRe = /(?:^|\n)\s*-\s*id:\s*([A-Za-z0-9_.-]+)([\s\S]*?)(?=(?:\n\s*-\s*id:)|\n\s*-\s+(?:insert|id)|\s*$)/g;
  let m;
  while ((m = entryRe.exec(patchText)) !== null) {
    const id = m[1];
    const body = m[2];
    const nameRe = /(?:^|\n)\s*name:\s*['"]?(@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)['"]?/g;
    let nm;
    while ((nm = nameRe.exec(body)) !== null) {
      if (wanted.has(nm[1])) ids.push(id);
    }
  }
  return ids;
}

module.exports = {
  dedupePatchEntries,
  dropBlocksByIds,
  parseFailedLoaderIds,
  mapPackagesToPatchIds,
  findMissingBundleDeclarations,
  scanBundleContracts,
  removeBundlesFromProfile,
};
