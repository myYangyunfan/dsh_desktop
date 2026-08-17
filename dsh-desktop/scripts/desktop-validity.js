'use strict';

/**
 * 安装后防砖体检（参考 dsh-market/src/install.ts 的 validateAddedPlugins 思路）：
 * 逐个检查已装配的社区/配套插件包 —— dsh 清单字段、可加载补丁入口、
 * loader 条目 id 冲突（跨包重复会在下次启动触发 duplicate loader entry id 失败）。
 *
 * 官方核心（@deepseek-ai/* 与 INBOX 内置）由应用自身管理，不参与体检。
 * 纯只读：不写任何文件。
 */

const path = require('node:path');
const { analyzePatch } = require('./desktop-diagnostics');

/** 官方内置 bundle 包名（与 desktop-ordering 一致）。 */
const INBOX_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
]);

/**
 * 从补丁条目数组收集「注册 id」（与 dropBlocksByIds 同一语义）：
 *   · insert 数组内的 id —— 注册；
 *   · 纯注册直条目（除 id/name 外无任何其它键）的顶层 id —— 注册；
 *   · 覆盖条目（含 disabled/config/定向 insert 等任意其它键）不注册任何东西，
 *     算进去会产生「覆盖条目 vs 包注册」的假跨包冲突。
 * @param {Array<object>} entries analyzePatch 的 entries
 * @returns {string[]} 注册 id 列表（含重复）
 */
function collectRegisteredIds(entries) {
  const ids = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry !== 'object') continue;
    if (Array.isArray(entry.insert)) {
      for (const it of entry.insert) {
        if (it && typeof it.id === 'string') ids.push(it.id);
      }
    } else if (typeof entry.id === 'string') {
      const keys = Object.keys(entry).filter((k) => k !== 'id' && k !== 'name');
      if (keys.length === 0) ids.push(entry.id);
    }
  }
  return ids;
}

/**
 * 收集体检候选包。
 * 范围 = ① profile bundle 清单中的社区包（解析到 profile node_modules 或 assets）
 *        + ② assets/plugins 内置配套（即使暂不在 bundle 清单）。
 * 官方核心（@deepseek-ai/* 与 INBOX 内置）与 npm 依赖垫片（不在 bundle 清单的
 * profile node_modules 包，如 cosmo kit/schemastery）不参与体检。
 * @param {string} profileDir
 * @param {string|null} coreDirDshAt
 * @param {string|null} assetsDir
 * @param {object} fs
 * @returns {Array<{name:string, dir:string, source:string}>}
 */
function collectPluginCandidates(profileDir, coreDirDshAt, assetsDir, fs = require('node:fs')) {
  // bundle 清单中的社区包名（与 desktop-ordering 同一语义）
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')); } catch { manifest = null; }
  const bundleNames = (manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles))
    ? manifest.dsh.profile.bundles.filter((n) => typeof n === 'string' && !INBOX_BUNDLES.has(n) && !n.startsWith('@deepseek-ai/'))
    : [];
  const found = new Map(); // 包名 → {dir, source}
  const add = (dir, source) => {
    const pkgFile = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgFile)) return;
    let name = null;
    try { name = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).name || null; } catch { /* 保留 dir 名 */ }
    const key = name || path.basename(dir);
    if (name && (name.startsWith('@deepseek-ai/') || INBOX_BUNDLES.has(name))) return;
    if (!found.has(key)) found.set(key, { name: key, dir, source });
  };
  // ① bundle 清单中的社区包（优先 profile node_modules，其次 assets 兜底）
  for (const name of bundleNames) {
    const parts = name.split('/');
    const profilePath = path.join(profileDir, 'node_modules', ...parts);
    const assetsPath = assetsDir ? path.join(assetsDir, ...parts) : null;
    if (fs.existsSync(profilePath)) {
      if (fs.existsSync(path.join(profilePath, 'package.json'))) add(profilePath, 'profile');
      else found.set(name, { name, dir: profilePath, source: 'profile' }); // 目录在但缺/坏 package.json → 必须进体检报错，防砖盲区
    } else if (assetsPath && fs.existsSync(assetsPath)) {
      if (fs.existsSync(path.join(assetsPath, 'package.json'))) add(assetsPath, 'assets');
      else found.set(name, { name, dir: assetsPath, source: 'assets' });
    }
  }
  // ② assets/plugins 内置配套（目录级扫描，覆盖插件已从清单移除仍在磁盘的情况）
  if (assetsDir && fs.existsSync(assetsDir)) {
    for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const dir = path.join(assetsDir, entry.name);
        const pkgFile = path.join(dir, 'package.json');
        if (!fs.existsSync(pkgFile)) continue;
        let name = null;
        try { name = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).name || null; } catch { /* 保留 dir 名 */ }
        if (name && (name.startsWith('@deepseek-ai/') || INBOX_BUNDLES.has(name))) continue;
        const key = name || entry.name;
        if (found.has(key)) { found.get(key).source = found.get(key).source === 'profile' ? 'profile' : 'assets'; }
        else found.set(key, { name: key, dir, source: 'assets' });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 检查单个插件包的健康度。
 * @param {string} name 包名
 * @param {string} dir 包目录
 * @param {object} yaml js-yaml 方言加载器（null = 不可用）
 * @param {object} fs
 * @param {boolean} [listed] 是否在 dsh.profile.bundles 启动清单内（清单内缺
 *   dsh.bundle.patch 声明会在下次启动 fail-loud —— Error: profile bundle "X"
 *   declares no dsh.bundle —— 必须升级为 error，并给出移除指引）
 * @returns {{name:string, issues:Array<{level:string, text:string}>, ids:string[], patchOk:boolean}}
 */
function checkPluginPackage(name, dir, yaml, fs = require('node:fs'), listed = false) {
  const issues = [];
  const ids = [];
  let patchOk = true;
  const pkgFile = path.join(dir, 'package.json');
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  } catch (err) {
    issues.push({ level: 'error', text: `package.json 缺失或无法解析: ${(err && err.message) || err}` });
    return { name, issues, ids, patchOk: false };
  }
  const dsh = pkg && pkg.dsh;
  if (!dsh || (typeof dsh !== 'object')) {
    issues.push(listed
      ? { level: 'error', text: '在启动清单（dsh.profile.bundles）中但未声明 dsh 插件清单（dsh.bundle / dsh.client）——下次启动会 fail-loud（declares no dsh.bundle），请从清单移除或补声明' }
      : { level: 'warning', text: '未声明 dsh 插件清单（dsh.bundle / dsh.client），可能不是可加载插件' });
  } else {
    if (listed && !(dsh.bundle && typeof dsh.bundle === 'object' && typeof dsh.bundle.patch === 'string')) {
      issues.push({ level: 'error', text: '在启动清单（dsh.profile.bundles）中但未声明 dsh.bundle.patch——下次启动会 fail-loud（declares no dsh.bundle），请从清单移除或补声明' });
    }
    if (dsh.bundle && typeof dsh.bundle === 'object') {
      if (typeof dsh.bundle.patch === 'string') {
        const patchFile = path.join(dir, dsh.bundle.patch);
        if (!fs.existsSync(patchFile)) {
          issues.push({ level: 'error', text: `声明的补丁文件不存在: ${dsh.bundle.patch}` });
          patchOk = false;
        } else {
          const parsed = analyzePatch(patchFile, yaml, fs);
          if (!parsed.parseOk) {
            issues.push({ level: 'error', text: `补丁解析失败: ${parsed.parseError || '未知错误'}` });
            patchOk = false;
          } else {
            ids.push(...collectRegisteredIds(parsed.entries));
            for (const dup of parsed.duplicateIds) {
              issues.push({ level: 'error', text: `补丁内重复的 loader 条目 id「${dup.id}」（${dup.count} 次）` });
            }
          }
        }
      }
      if (typeof dsh.bundle.client === 'string' && dsh.bundle.client) {
        if (!fs.existsSync(path.join(dir, dsh.bundle.client))) {
          issues.push({ level: 'warning', text: `声明的客户端入口不存在: ${dsh.bundle.client}` });
        }
      }
    }
    if (dsh.client && typeof dsh.client === 'object') {
      const clientFile = typeof dsh.client.client === 'string' ? dsh.client.client : null;
      if (clientFile && !fs.existsSync(path.join(dir, clientFile))) {
        issues.push({ level: 'warning', text: `声明的客户端入口不存在: ${clientFile}` });
      }
    }
  }
  // 未声明 patch 时自动探测 cordis.patch.yml / cordis.yml（与 boot 行为一致）
  if (!(dsh && dsh.bundle && typeof dsh.bundle.patch === 'string')) {
    for (const probe of ['cordis.patch.yml', 'cordis.yml']) {
      const probeFile = path.join(dir, probe);
      if (fs.existsSync(probeFile)) {
        const parsed = analyzePatch(probeFile, yaml, fs);
        if (!parsed.parseOk) {
          issues.push({ level: 'error', text: `${probe} 解析失败: ${parsed.parseError || '未知错误'}` });
          patchOk = false;
        } else {
          ids.push(...collectRegisteredIds(parsed.entries));
        }
        break;
      }
    }
  }
  // 声明了 main 但入口文件缺失。启动清单（listed）内的包随 patch 加载时按包名
  // require → 走 main，缺失会导致启动失败（issue #76：缺 dist/main 实测崩）；
  // 非清单包（普通 npm 依赖）不参与启动加载，仅警告。
  if (typeof pkg.main === 'string' && pkg.main && !fs.existsSync(path.join(dir, pkg.main))) {
    issues.push(listed
      ? { level: 'error', text: `启动清单内插件 main 入口不存在: ${pkg.main}（加载该包会失败，请移除或修复）` }
      : { level: 'warning', text: `main 入口不存在: ${pkg.main}` });
  }
  return { name, issues, ids, patchOk };
}

/**
 * 全量防砖体检。
 * @param {string} profileDir
 * @param {string|null} coreDirDshAt
 * @param {string|null} assetsDir
 * @param {object} yaml js-yaml 方言加载器
 * @param {object} fs
 * @returns {object} { ok, checked, conflicts, contractViolations, summary:{errors, warnings} }
 *   contractViolations = 在启动清单内但缺 dsh.bundle.patch 声明的包名（可一键移除）
 */
function validatePlugins(profileDir, coreDirDshAt, assetsDir, yaml, fs = require('node:fs')) {
  let listedSet = new Set();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    const bundles = manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)
      ? manifest.dsh.profile.bundles
      : [];
    listedSet = new Set(bundles.filter((n) => typeof n === 'string'));
  } catch { /* 无 manifest 时 listedSet 为空 */ }
  const checked = collectPluginCandidates(profileDir, coreDirDshAt, assetsDir, fs).map((c) => {
    const result = checkPluginPackage(c.name, c.dir, yaml, fs, listedSet.has(c.name));
    return {
      name: c.name, dir: c.dir, source: c.source, listed: listedSet.has(c.name),
      issues: result.issues, ids: result.ids, patchOk: result.patchOk,
    };
  });
  // 汇总 loader id 归属：包 + profile 主 patch
  const ownerOf = new Map(); // id → [{owner, count}]
  for (const item of checked) {
    const counted = new Map();
    for (const id of item.ids) counted.set(id, (counted.get(id) || 0) + 1);
    for (const [id, count] of counted) {
      if (!ownerOf.has(id)) ownerOf.set(id, []);
      ownerOf.get(id).push({ owner: item.name, count });
    }
  }
  const profilePatch = path.join(profileDir, 'cordis.patch.yml');
  if (fs.existsSync(profilePatch)) {
    const parsed = analyzePatch(profilePatch, yaml, fs);
    if (parsed.parseOk) {
      // 与包一致：只把「注册 id」（insert 数组内 id + 纯注册直条目）计入跨包
      // 冲突。覆盖条目（disabled/config/定向 insert）不注册任何东西，算进去
      // 会产生「覆盖条目 vs 包注册」的假冲突（如 harness-pet 默认禁用条目）。
      const counted = new Map();
      const bump = (id) => counted.set(id, (counted.get(id) || 0) + 1);
      for (const id of collectRegisteredIds(parsed.entries)) bump(id);
      for (const [id, count] of counted) {
        if (!ownerOf.has(id)) ownerOf.set(id, []);
        ownerOf.get(id).push({ owner: 'profile/cordis.patch.yml', count });
      }
    }
  }
  // 跨包冲突（同一 id 出现在 ≥2 个不同 owner）
  const conflicts = [];
  for (const [id, owners] of ownerOf) {
    if (owners.length > 1) {
      conflicts.push({ id, owners: owners.map((o) => o.owner), total: owners.reduce((s, o) => s + o.count, 0) });
    }
  }
  conflicts.sort((a, b) => a.id.localeCompare(b.id));
  const errors = checked.reduce((s, c) => s + c.issues.filter((i) => i.level === 'error').length, 0) + conflicts.length;
  const warnings = checked.reduce((s, c) => s + c.issues.filter((i) => i.level === 'warning').length, 0);
  const contractViolations = checked
    .filter((c) => c.listed && c.issues.some((i) => i.level === 'error' && /启动清单/.test(i.text)))
    .map((c) => c.name);
  return { ok: errors === 0, checked, conflicts, contractViolations, summary: { errors, warnings } };
}

module.exports = {
  INBOX_BUNDLES,
  collectPluginCandidates,
  checkPluginPackage,
  validatePlugins,
};
