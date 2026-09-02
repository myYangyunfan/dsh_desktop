'use strict';

// ---------------------------------------------------------------------------
// 配套插件同步的共享实现（唯一实现）。
//
// 补丁层文本变换（注册 / 去重 / 禁用块 / 卸载标记 / 旧市场清理）已收口到
// scripts/plugin-core/lib/patch-surgery.js（统一 id 字符集、EOL 保持、三种
// 引号 name 改名修复），本模块从那里 re-export；文件同步 / 过期清理 / 目录
// 同步保留在此（fs 操作，非文本）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { COMPANION_PLUGINS, companionDirName } = require('./companion-plugins');
const { dropBlocksByIds } = require('../../profile-patch-heal');
const { writeFileAtomic } = require('./patch-io');
const { bundlePatchRel, verifyBundleDir } = require('../../profile-bundle-heal');
const { compareVersions } = require('./versions');
const {
  PATCH_HEADER,
  ACP_DISABLE_BLOCK,
  ACP_SELF_DISABLE_BLOCK,
  PET_DISABLE_BLOCK,
  removedPluginIdsFromPatch,
  removeLegacyMarketplacePatchLines,
  ensureDisabledPatchEntry,
  removeAcpBasicDisableBlock,
  registerCompanionPatchEntries,
} = require('../plugin-core/lib/patch-surgery');

// 同步进 profile 的固定文件清单（根目录平铺布局的第三方插件也在内）。
const PLUGIN_FILES = [
  'package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh.md',
  'lib/index.js', 'lib/index.mjs', 'lib/client.js', 'lib/vlm.js', 'lib/typert.host.js', 'lib/typert.host.d.ts',
  'dsh.plugin.json',
  'index.js', 'client.js', 'app.js', 'styles.css', 'deepseek-mark.svg',
];

// 配套插件引用的私有依赖（dsh 核心闭包之外）。
// dsh-community-market 的运行时依赖（ajv 契约校验 / semver 版本 / yaml 解析，
// 加上游市场宿主面的 @deepseek-ai/schemastery、@deepseek-ai/dsh-settings）
// 随源同步进 profile node_modules。sharp（原生模块，市场媒体图标规整用）
// 不在此列：由 loader 经安装根 node_modules 解析（同 dsh-hub 的
// @deepseek-ai/dsh-typert-protocol 运行时导入先例），避免 @img 平台二进制
// 的多平台同步问题。
const VENDOR_DEPS = [
  'schemastery', 'cosmokit', '@standard-schema/spec',
  'ajv', 'ajv-formats', 'semver', 'yaml',
  '@deepseek-ai/schemastery', '@deepseek-ai/dsh-settings',
];

// 目录级同步的运行资产子目录（正常复制路径全量走这份清单）。
const SYNC_SUBDIRS = ['lib', 'client', 'data', 'assets', 'src', 'dist', 'public', 'gui', 'node_modules'];

// keep-newer 分支的「缺失资产补齐」清单：与 SYNC_SUBDIRS 的差异是不含
// node_modules —— 给更新版注入安装包里的旧依赖树，会经由 require 解析顺序
// 优先命中旧实现，反而破坏新版本代码；其余目录均为静态构建产物
// （典型：dsh-mini 的 gui/ 手机端快照），更新版缺了就是分发残缺，补齐无害。
const HEAL_SUBDIRS = SYNC_SUBDIRS.filter((s) => s !== 'node_modules');

// ---------------------------------------------------------------------------
// 目录/文件清理
// ---------------------------------------------------------------------------

/**
 * 过期配套插件清理白名单：当前与历史内置目录名（含 scope 内与顶层两种落点）。
 * 只有命中白名单且（private + description 含 "DSH Desktop"）的目录才会被清理
 * —— 修复历史「仅凭描述即可误删用户自装包」的判定过宽。
 */
const KNOWN_COMPANION_DIR_NAMES = new Set([
  ...COMPANION_PLUGINS.map(companionDirName),
  // 历史退役/改名目录：
  'zat-dsh-engine',
  'dsh-plugin-marketplace',
  'dshmarket',
  'dsh-terminal',
  'dsh-prompt',
  'dsh-third-party-thinking',
]);

/**
 * 清理历史版本遗留的旧包目录（白名单 + 私有 + 描述三重判定，避免误删）。
 * 修复：白名单里包含**当前配套目录名**，若不做「当前名单」排除，命中
 * private+描述判定的当前插件会在每次同步时被「删除 → 重新复制」——
 * 破坏零写入幂等，并让「保留更新版本」分支读不到已装版本。
 * @param {string} scanDir 扫描目录（node_modules 或 node_modules/@scope）
 * @param {Object} hooks { log, fail, plan, dryRun, expectedDirs }
 *   expectedDirs —— 当前配套目录名集合（bare 名），命中即跳过（绝不清当前插件）
 * @returns {number} 清理数量
 */
function removeStaleCompanionPlugins(scanDir, hooks = {}) {
  const { log, fail, plan, dryRun = false, expectedDirs } = hooks;
  let cleaned = 0;
  let entries;
  try { entries = fs.readdirSync(scanDir, { withFileTypes: true }); } catch { return cleaned; }
  for (const entry of entries) {
    if (!entry.isDirectory() || !KNOWN_COMPANION_DIR_NAMES.has(entry.name)) continue;
    if (expectedDirs && expectedDirs.has(entry.name)) continue; // 当前插件目录，绝不清理
    const pkgPath = path.join(scanDir, entry.name, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }
    if (pkg && pkg.private === true && typeof pkg.description === 'string' && /DSH Desktop/.test(pkg.description)) {
      if (dryRun) {
        if (plan) plan('dry-run: 将清理过期配套插件 ' + entry.name);
        continue;
      }
      try {
        fs.rmSync(path.join(scanDir, entry.name), { recursive: true, force: true });
        cleaned += 1;
        if (log) log('已清理过期配套插件: ' + entry.name);
      } catch (err) {
        if (fail) fail('清理过期配套插件失败 ' + entry.name + ': ' + err.message);
      }
    }
  }
  return cleaned;
}

/**
 * 移除旧版 @deepseek-ai/dsh-plugin-marketplace 的同步副本。
 */
function removeLegacyMarketplaceDir(profileWebModules, hooks = {}) {
  const { log, fail, plan, dryRun = false } = hooks;
  const oldPkg = path.join(profileWebModules, '@deepseek-ai', 'dsh-plugin-marketplace');
  if (!fs.existsSync(oldPkg)) return;
  if (dryRun) {
    if (plan) plan('dry-run: 将移除旧插件市场包 @deepseek-ai/dsh-plugin-marketplace');
    return;
  }
  try {
    fs.rmSync(oldPkg, { recursive: true, force: true });
    if (log) log('已移除旧插件市场包: @deepseek-ai/dsh-plugin-marketplace');
  } catch (err) {
    if (fail) fail('移除旧插件市场包失败: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// dshmarket 退役（内置市场切换为 dsh-community-market）
// ---------------------------------------------------------------------------

/** 退役市场的包名与 loader id。 */
const RETIRED_MARKET_PACKAGE = 'dshmarket';
const RETIRED_MARKET_LOADER_ID = 'dsh-market';

/**
 * 移除已退役市场 dshmarket 的同步副本与 manifest 登记（幂等，dir + bundles +
 * dependencies）。目录清理带内置装配特征门（dsh.bundle.patch 声明），避免误删
 * 用户自装的同名第三方包；manifest 手术直接 JSON 原子写（一次性退役，与
 * retireZatEngine 同款先例——不走 ManifestStore 写锁，窗口极小且幂等可重放）。
 * @param {string} profileDir web profile 目录
 * @param {Object} hooks { log, fail, plan, dryRun }
 */
function removeRetiredDshMarketDir(profileDir, hooks = {}) {
  const { log, fail, plan, dryRun = false } = hooks;
  const pkgDir = path.join(profileDir, 'node_modules', RETIRED_MARKET_PACKAGE);
  if (fs.existsSync(pkgDir)) {
    let isBuiltin = false;
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      isBuiltin = !!(p && p.dsh && p.dsh.bundle && p.dsh.bundle.patch);
    } catch { /* 目录残缺：也按可清理处理 */ isBuiltin = true; }
    if (isBuiltin) {
      if (dryRun) {
        if (plan) plan('dry-run: 将移除已退役市场包 ' + RETIRED_MARKET_PACKAGE);
      } else {
        try {
          fs.rmSync(pkgDir, { recursive: true, force: true });
          if (log) log('已移除已退役市场包: ' + RETIRED_MARKET_PACKAGE);
        } catch (err) {
          if (fail) fail('移除已退役市场包失败: ' + err.message);
        }
      }
    }
  }
  const manifestFile = path.join(profileDir, 'package.json');
  try {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (!m || typeof m !== 'object') return;
    let changed = false;
    if (m.dsh && m.dsh.profile && Array.isArray(m.dsh.profile.bundles)
      && m.dsh.profile.bundles.includes(RETIRED_MARKET_PACKAGE)) {
      m.dsh.profile.bundles = m.dsh.profile.bundles.filter((n) => n !== RETIRED_MARKET_PACKAGE);
      changed = true;
    }
    if (m.dependencies && typeof m.dependencies === 'object'
      && Object.prototype.hasOwnProperty.call(m.dependencies, RETIRED_MARKET_PACKAGE)) {
      delete m.dependencies[RETIRED_MARKET_PACKAGE];
      if (Object.keys(m.dependencies).length === 0) delete m.dependencies;
      changed = true;
    }
    if (changed) {
      if (dryRun) {
        if (plan) plan('dry-run: 将从 profile manifest 移除 ' + RETIRED_MARKET_PACKAGE + ' 登记（bundles/dependencies）');
      } else {
        writeFileAtomic(manifestFile, JSON.stringify(m, null, 2) + '\n');
        if (log) log('已从 profile manifest 移除已退役市场登记: ' + RETIRED_MARKET_PACKAGE);
      }
    }
  } catch (err) {
    if (fail) fail('清理 ' + RETIRED_MARKET_PACKAGE + ' manifest 登记失败: ' + err.message);
  }
}

/**
 * 移除 patch 层已退役市场（dsh-market / dshmarket）的全部登记行（insert 内层
 * 条目、纯 insert 块、顶层 id 块与遗留 marker 注释）。纯文本变换，由调用方在
 * 自己的 patch 快照上调用后统一落盘（syncCompanionFiles 不改写 patch 文件）。
 * @param {string} patch cordis.patch.yml 原文
 * @returns {{ patch: string, changed: boolean }}
 */
function removeRetiredDshMarketPatchRows(patch) {
  const drop = dropBlocksByIds(String(patch || ''), [RETIRED_MARKET_LOADER_ID]);
  let text = drop.text;
  const before = text;
  // 兜底：顶层残留的非 name-only 块（带 disabled/removed 标记的退役行）与 marker 注释。
  text = text.replace(
    /(?:^|\n)-(?:[ \t]*)id:[ \t]*dsh-market\b[^\n]*(?:\n[ \t]+[^\n]*)*/g,
    (m) => (m[0] === '\n' ? '\n' : ''),
  );
  text = text.replace(/\n?[^\n]*插件管理[^\n]*关闭[ \t]+dsh-market[^\n]*\n?/g, '\n');
  if (text !== before || drop.removed.length > 0) {
    return { patch: text, changed: true };
  }
  return { patch, changed: false };
}

// ---------------------------------------------------------------------------
// dsh-third-party-thinking 退役（内置推理强度选择切换为 dsh-reasoning-effort）
// ---------------------------------------------------------------------------

/** 退役插件的包名与 loader id。 */
const RETIRED_THIRD_PARTY_THINKING_PACKAGE = '@deepseek-ai/dsh-third-party-thinking';
const RETIRED_THIRD_PARTY_THINKING_LOADER_ID = 'third-party-thinking';

/**
 * 移除已退役插件 dsh-third-party-thinking 的同步副本（幂等）。该插件是**非
 * bundle** 插件（无 dsh.bundle.patch），登记只存在于 cordis.patch.yml 的 insert
 * 条目，manifest 无 bundles/dependencies 登记，故无需 manifest 手术——与
 * dshmarket（bundle 插件）退役路径的差异即在此。目录清理带内置装配特征门
 * （private: true + 包名精确匹配），避免误删用户自装的同名第三方包。
 * @param {string} profileDir web profile 目录
 * @param {Object} hooks { log, fail, plan, dryRun }
 */
function removeRetiredThirdPartyThinkingDir(profileDir, hooks = {}) {
  const { log, fail, plan, dryRun = false } = hooks;
  const pkgDir = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-third-party-thinking');
  if (fs.existsSync(pkgDir)) {
    let isBuiltin = false;
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      isBuiltin = !!(p && p.name === RETIRED_THIRD_PARTY_THINKING_PACKAGE && p.private === true);
    } catch { /* 目录残缺：也按可清理处理 */ isBuiltin = true; }
    if (isBuiltin) {
      if (dryRun) {
        if (plan) plan('dry-run: 将移除已退役插件 ' + RETIRED_THIRD_PARTY_THINKING_PACKAGE);
      } else {
        try {
          fs.rmSync(pkgDir, { recursive: true, force: true });
          if (log) log('已移除已退役插件: ' + RETIRED_THIRD_PARTY_THINKING_PACKAGE);
        } catch (err) {
          if (fail) fail('移除已退役插件失败: ' + err.message);
        }
      }
    }
  }
}

/**
 * 移除 patch 层已退役插件（loader id third-party-thinking）的全部登记行
 * （insert 内层条目、纯 insert 块、name-only 顶层条目）。纯文本变换，由调用方
 * 在自己的 patch 快照上调用后统一落盘（syncCompanionFiles 不改写 patch 文件）。
 * @param {string} patch cordis.patch.yml 原文
 * @returns {{ patch: string, changed: boolean }}
 */
function removeRetiredThirdPartyThinkingPatchRows(patch) {
  const drop = dropBlocksByIds(String(patch || ''), [RETIRED_THIRD_PARTY_THINKING_LOADER_ID]);
  if (drop.removed.length > 0) {
    return { patch: drop.text, changed: true };
  }
  return { patch, changed: false };
}

// ---------------------------------------------------------------------------
// dsh-float-window 退役（桌面浮窗：随内核 0.1.2-alpha.1 移除该包而退役；其
// client 注册的 slot conversation.session.header.actions 在新内核已不再声明，
// 老用户 profile 里残留的同步副本会报 "slot ... is not declared"）。
// ---------------------------------------------------------------------------

/** 退役插件的包名与 loader id（scope 包，与 dsh-third-party-thinking 落点一致）。 */
const RETIRED_FLOAT_WINDOW_PACKAGE = '@deepseek-ai/dsh-float-window';
const RETIRED_FLOAT_WINDOW_LOADER_ID = 'float-window';

/**
 * 移除已退役插件 dsh-float-window 的同步副本（幂等）。非 bundle 插件（无
 * dsh.bundle.patch），登记只存在于 cordis.patch.yml 的 insert 条目，manifest 无
 * bundles/dependencies 登记，故无需 manifest 手术。目录清理带内置装配特征门
 * （private: true + 包名精确匹配），避免误删用户自装的同名第三方包。
 * @param {string} profileDir web profile 目录
 * @param {Object} hooks { log, fail, plan, dryRun }
 */
function removeRetiredDshFloatWindowDir(profileDir, hooks = {}) {
  const { log, fail, plan, dryRun = false } = hooks;
  const pkgDir = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-float-window');
  if (fs.existsSync(pkgDir)) {
    let isBuiltin = false;
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      isBuiltin = !!(p && p.name === RETIRED_FLOAT_WINDOW_PACKAGE && p.private === true);
    } catch { /* 目录残缺：也按可清理处理 */ isBuiltin = true; }
    if (isBuiltin) {
      if (dryRun) {
        if (plan) plan('dry-run: 将移除已退役插件 ' + RETIRED_FLOAT_WINDOW_PACKAGE);
      } else {
        try {
          fs.rmSync(pkgDir, { recursive: true, force: true });
          if (log) log('已移除已退役插件: ' + RETIRED_FLOAT_WINDOW_PACKAGE);
        } catch (err) {
          if (fail) fail('移除已退役插件失败: ' + err.message);
        }
      }
    }
  }
}

/**
 * 移除 patch 层已退役插件（loader id float-window）的全部登记行（insert 内层
 * 条目、纯 insert 块、name-only 顶层条目）。纯文本变换，由调用方在自己的 patch
 * 快照上调用后统一落盘（syncCompanionFiles 不改写 patch 文件）。
 * @param {string} patch cordis.patch.yml 原文
 * @returns {{ patch: string, changed: boolean }}
 */
function removeRetiredDshFloatWindowPatchRows(patch) {
  const drop = dropBlocksByIds(String(patch || ''), [RETIRED_FLOAT_WINDOW_LOADER_ID]);
  if (drop.removed.length > 0) {
    return { patch: drop.text, changed: true };
  }
  return { patch, changed: false };
}

// ---------------------------------------------------------------------------
// 目录级同步（递归比对 size+mtime 精确值，一致时跳过）
// ---------------------------------------------------------------------------

function dirNeedsSync(src, dest) {
  if (!fs.existsSync(dest)) return true;
  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return true; }
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (dirNeedsSync(s, d)) return true;
    } else {
      try {
        const ss = fs.statSync(s);
        const ds = fs.statSync(d);
        // 毫秒取整比较：cpSync 的时间戳保留精度受文件系统限制（NTFS 往返后
        // 亚毫秒部分不稳定），精确比较会破坏「二次同步零写入」幂等契约。
        if (ds.size !== ss.size || Math.round(ds.mtimeMs) !== Math.round(ss.mtimeMs)) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

/** 目录级同步：内容一致时跳过；源不存在时 no-op。失败仅告警不抛出。 */
function syncDir(src, dest, log) {
  if (!fs.existsSync(src)) return;
  try {
    if (fs.existsSync(dest) && !dirNeedsSync(src, dest)) return;
    fs.cpSync(src, dest, { recursive: true, force: true, preserveTimestamps: true });
  } catch (err) {
    if (log) log('同步目录失败 ' + src + ': ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// 插件文件同步（复制 + bundle 校验）
// ---------------------------------------------------------------------------

/**
 * 把配套插件从 assets/plugins 同步进 profile web node_modules，并校验 bundle
 * 完整性。语义与历史实现逐字一致（详见历史 companion-profile.js 注释），
 * 差异仅在：过期清理覆盖 scope 内 + 顶层（非 scope 包）两种落点，且清理
 * 判定加白名单；单文件 mtime 精确比较。
 * @param {Object} opts
 * @returns {{ bundleNames: Set<string>, missingNames: Set<string> }}
 */
function syncCompanionFiles(opts) {
  const {
    plugins = COMPANION_PLUGINS,
    assetsRoot,
    profileDir,
    vendorRoot,
    removedIds,
    log,
    fail,
    onMissingSource,
    onCopyFail,
    onVerifyFail,
    onInstalled,
    onVendorSynced,
    plan,
    dryRun = false,
  } = opts;
  const profileModules = path.join(profileDir, 'node_modules', '@deepseek-ai');
  if (!dryRun) fs.mkdirSync(profileModules, { recursive: true });
  // 当前配套目录名（bare）集合：过期清理必须以它为排除集（修复「每次同步
  // 误删当前插件 → 删除重拷抖动 + 保留更新版本分支失效」回归）。
  const currentDirs = new Set((plugins || []).map((p) => companionDirName(p)));
  removeStaleCompanionPlugins(profileModules, { log, fail, plan, dryRun, expectedDirs: currentDirs });
  // 非 scope 落点（dsh-better-sidebar / harness-pet / graph-memory / dshmarket /
  // dsh-hub / billion-context-dsh 等）同样过清理（修复历史「非 scope 旧目录
  // 永不清理」）。
  removeStaleCompanionPlugins(path.join(profileDir, 'node_modules'), { log, fail, plan, dryRun, expectedDirs: currentDirs });
  removeLegacyMarketplaceDir(path.join(profileDir, 'node_modules'), { log, fail, plan, dryRun });
  // dshmarket 退役：目录 + manifest 登记（bundles/dependencies）一次性清理。
  // patch 行不在此时机清理（本函数不落盘 patch——调用方持快照统一写），
  // 由调用方对快照调用 removeRetiredDshMarketPatchRows。
  removeRetiredDshMarketDir(profileDir, { log, fail, plan, dryRun });
  // dsh-third-party-thinking 退役：非 bundle 插件，仅目录清理（无 manifest 登记）；
  // patch 行由调用方对快照调用 removeRetiredThirdPartyThinkingPatchRows 清理。
  removeRetiredThirdPartyThinkingDir(profileDir, { log, fail, plan, dryRun });
  // dsh-float-window 退役：非 bundle 插件，仅目录清理（无 manifest 登记）；
  // patch 行由调用方对快照调用 removeRetiredDshFloatWindowPatchRows 清理。
  removeRetiredDshFloatWindowDir(profileDir, { log, fail, plan, dryRun });

  const bundleNames = new Set();
  for (const name of VENDOR_DEPS) {
    const sdir = path.join(vendorRoot, name);
    if (!fs.existsSync(sdir)) continue;
    const ddir = path.join(profileDir, 'node_modules', name);
    if (dryRun) {
      if (plan) plan(`dry-run: 将同步私有依赖 ${name} → ${ddir}`);
      continue;
    }
    syncDir(sdir, ddir, log);
    if (onVendorSynced) onVendorSynced(name);
  }
  // 源缺失的配套插件：不复制、不注册、manifest 移除登记（避免注册了但包不存在）。
  const missingNames = new Set();
  for (const p of plugins) {
    const sdir = path.join(assetsRoot, companionDirName(p));
    if (!fs.existsSync(path.join(sdir, 'package.json'))) {
      missingNames.add(p.name);
      if (onMissingSource) onMissingSource(p.name, sdir);
    }
  }
  for (const p of plugins) {
    if (removedIds && removedIds.has(p.id)) continue;
    const rel = companionDirName(p);
    const src = path.join(assetsRoot, rel);
    if (!fs.existsSync(path.join(src, 'package.json'))) continue;
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')); } catch {}
    const isBundle = bundlePatchRel(pkg) !== '';
    const dest = path.join(profileModules, '..', p.name);
    if (!dryRun) {
      try {
        const aPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
        const dPkgFile = path.join(dest, 'package.json');
        if (aPkg && aPkg.version && fs.existsSync(dPkgFile)) {
          const dPkg = JSON.parse(fs.readFileSync(dPkgFile, 'utf8'));
          if (dPkg && dPkg.version && compareVersions(dPkg.version, aPkg.version) > 0) {
            if (log) log('插件 ' + p.id + ' 版本 ' + dPkg.version + ' 高于安装包 ' + aPkg.version + '，保留更新版本');
            // 「保留更新版本」只保护代码文件（lib/、package.json 等）不被降级；
            // 上游 npm/GitHub 分发包常不带构建产物（dsh-mini 的 gui/ 手机端
            // 快照），更新版缺这些目录即残缺安装——手机端将持续「GUI 资产缺失」
            // 且任何重装都无法自愈（本分支每次启动都会跳过）。这里只补整目录
            // 缺失、绝不覆盖更新版已有文件：
            for (const sub of HEAL_SUBDIRS) {
              const sdir = path.join(src, sub);
              const ddir = path.join(dest, sub);
              if (fs.existsSync(sdir) && !fs.existsSync(ddir)) {
                syncDir(sdir, ddir, log);
                if (log) log('插件 ' + p.id + ' 更新版缺失运行资产目录 ' + sub + '/，已从安装包补齐（不覆盖既有文件）');
              }
            }
            // 更新版依赖缺位自愈（issue #125：billion-context-dsh 经插件中心
            // 从 npm 更新后 acp-kernel 丢失，内核 ERR_MODULE_NOT_FOUND 起不来，
            // 且 keep-newer 每次跳过使重装永不能愈）。只补「内外层都完全
            // 不存在」的依赖，绝不覆盖已有任何版本——保持不降级语义。
            try {
              const dPkg2 = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
              for (const dep of Object.keys((dPkg2 && dPkg2.dependencies) || {})) {
                const inner = path.join(dest, 'node_modules', ...dep.split('/'));
                const top = path.join(profileDir, 'node_modules', ...dep.split('/'));
                if (fs.existsSync(path.join(inner, 'package.json'))
                  || fs.existsSync(path.join(top, 'package.json'))) continue;
                const fromSrc = path.join(src, 'node_modules', ...dep.split('/'));
                if (fs.existsSync(path.join(fromSrc, 'package.json'))) {
                  syncDir(fromSrc, inner, log);
                  if (log) log('插件 ' + p.id + ' 更新版缺依赖 ' + dep + '，已从安装包补齐到内层 node_modules（issue #125 自愈）');
                } else if (log) {
                  log('警告: 插件 ' + p.id + ' 依赖 ' + dep + ' 缺失且安装包未携带——更新源分发包疑似不完整');
                }
              }
            } catch { /* 自愈失败不阻断同步主流程 */ }
            // U4 实测：插件中心 npm 更新是目录级替换，分发包不带根级
            // dsh.plugin.json（插件 id/client 入口元数据）→ 两次更新之间
            // 永久缺失。HEAL_SUBDIRS 只补目录，这里补根级文件（仍只补
            // 完全缺失、绝不覆盖）。
            for (const metaFile of ['dsh.plugin.json']) {
              const srcF = path.join(src, metaFile);
              const dstF = path.join(dest, metaFile);
              if (fs.existsSync(srcF) && !fs.existsSync(dstF)) {
                try {
                  fs.copyFileSync(srcF, dstF);
                  if (log) log('插件 ' + p.id + ' 更新版缺根级元数据 ' + metaFile + '，已从安装包补齐（U4 自愈）');
                } catch { /* 补齐失败不阻断 */ }
              }
            }
            if (isBundle) bundleNames.add(p.name);
            continue;
          }
        }
      } catch { /* 版本读取失败按正常复制处理 */ }
    }
    if (dryRun) {
      if (plan) plan(`dry-run: 将安装 ${p.name} → ${dest}${isBundle ? '（bundle 插件）' : ''}`);
      continue;
    }
    fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
    for (const f of PLUGIN_FILES) {
      const sf = path.join(src, f);
      if (!fs.existsSync(sf)) continue;
      const df = path.join(dest, f);
      try {
        const sst = fs.statSync(sf);
        const dst = fs.statSync(df);
        // 毫秒取整比较（同上：cpSync 亚毫秒精度不稳定，精确比较破坏零写入幂等）。
        if (dst.size === sst.size && Math.round(dst.mtimeMs) === Math.round(sst.mtimeMs)) continue;
      } catch { /* 目标缺失或不可读 → 照常复制 */ }
      try {
        fs.cpSync(sf, df, { force: true, preserveTimestamps: true });
      } catch (err) {
        if (onCopyFail) onCopyFail(sf, err);
      }
    }
    for (const sub of SYNC_SUBDIRS) {
      syncDir(path.join(src, sub), path.join(dest, sub), log);
    }
    if (isBundle) {
      const check = verifyBundleDir(dest);
      if (!check.ok) {
        missingNames.add(p.name);
        if (onVerifyFail) onVerifyFail(p.name, check.reason);
      } else {
        bundleNames.add(p.name);
      }
    }
    if (onInstalled) onInstalled(p.name, isBundle);
  }
  return { bundleNames, missingNames };
}

module.exports = {
  PATCH_HEADER,
  ACP_DISABLE_BLOCK,
  ACP_SELF_DISABLE_BLOCK,
  PET_DISABLE_BLOCK,
  KNOWN_COMPANION_DIR_NAMES,
  removeStaleCompanionPlugins,
  removeLegacyMarketplaceDir,
  removeRetiredDshMarketDir,
  removeRetiredDshMarketPatchRows,
  removeRetiredThirdPartyThinkingDir,
  removeRetiredThirdPartyThinkingPatchRows,
  removeRetiredDshFloatWindowDir,
  removeRetiredDshFloatWindowPatchRows,
  removeLegacyMarketplacePatchLines,
  removedPluginIdsFromPatch,
  ensureDisabledPatchEntry,
  removeAcpBasicDisableBlock,
  registerCompanionPatchEntries,
  syncCompanionFiles,
  dirNeedsSync,
  syncDir,
};
