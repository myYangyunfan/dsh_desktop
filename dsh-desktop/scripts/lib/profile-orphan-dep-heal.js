'use strict';

// ---------------------------------------------------------------------------
// profile manifest 孤儿依赖自愈（boot repair 步，尽力而为不阻断）—— issue #177。
//
// 事故（v0.6.0 GA 用户实测）：恢复页红字
//   原因：回滚后仍失败：内核启动期退出 code=Some(1)
//   内核报错：Error [ERR_MODULE_NOT_FOUND]: Cannot find package
//            '@deepseek-ai/cordis-plugin-timer' imported from C:\Users\GC\.dsh\profiles\web\
// profile 的 package.json dependencies 里躺着一条内核 / npm 两侧都拿不到的
// `@deepseek-ai/*` 依赖：内核 boot 按 manifest 声明去装配它 → 解析不到 → 启动期
// 退出；且任何后续 `dsh plugin add` / pnpm 安装都会在同一个条目上撞
// ERR_PNPM_FETCH_404（issue #156 / #170 同族）。
//
// 脏数据来源（#170 排查已确认，#177 是其爆点）：v0.5.3 时代把「内置配套件 / 宿主
// 内核家族件」按 npm 精确版本形状写进 profile dependencies 的写入器（hub 识别登记
// 6070d5ab、dshmarket 时代的 corePackageNames 口径、profile-bundle-heal 的
// recoverManifestBundles「按包内版本补回 dependencies」）——这些包后来从内核移除 /
// 改名 / 退役，profile 里留下**孤儿条目**。既有清理链
// `hub-registry.cleanLegacyProfileDependencies` 只按「当前配套件名单」对账
// （`if (!plugin) continue;`：名字已不在名单里的孤儿恰恰被永久跳过），
// 因此欠账从未被回收——本模块补上这一环。
//
// 判定口径（全部本地确定性证据，boot 期绝不联网）：只处理 `@deepseek-ai/` scope，
// 且必须同时满足下列全部条件才判为孤儿——
//   1. 不在内核 vendor 闭包（kernel-pin.packageVersion + vendor/dsh-kernel 的
//      `deepseek-ai-<name>-<version>.tgz` 名单，242 个内核包全量对上）；
//   2. 不是内置配套件（COMPANION_PLUGINS 名单——dsh-mini / dsh-openclaw-bridge 等
//      @deepseek-ai scope 的桌面内置件走 assets/plugins 分发，不在内核 tarball 里）；
//   3. spec 不是 link: / file: / workspace: / git: / npm: 等协议形态（用户自接的
//      本地开发件一律不动）；
//   4. 名字不在同一 manifest 的 `dsh.profile.bundles` 里（避免把「bundle 仍登记、
//      dependency 已消失」的半残状态留给内核）；
//   5. profile 自己的 node_modules / `.dsh-module-fallback/node_modules` 里确实
//      没有这个包（用户真装了就不算孤儿）；
//   6. 安装闭包派生的共享 farm（`<home>/profiles/node_modules`）也提供不了它——
//      内核靠 Node 父目录上溯到这一层拿「非 vendor tarball、但随客户端 npm 闭包
//      分发」的包（典型 `@deepseek-ai/schemastery` / `@deepseek-ai/cordis-plugin-*`，
//      不在 vendor 名单里却是合法可解析的）。farm 能提供且 profile 内没被坏
//      shadow 抢先即视为可解析 → 保留；farm 有货但 profile 内同名目录里没有
//      package.json（这种 shadow 自己就是 NOT_FOUND 的来源）仍按孤儿处理。
// 任一证据读不到（pin / vendor 目录 / 配套件名单不可用）→ **整体放弃本次自愈**，
// 宁漏勿误；无孤儿时零写入（no-op）。清理动作 = 备份原文件 + 原子写 + 日志。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
// 原子写与全仓唯一实现共用（scripts/plugin-core/lib/fs-atomic.js 再导出）。
const { writeFileAtomic } = require('./patch-io');
const { loadPin } = require('../compat/validate-pin');

/** 只剪这个 scope——用户自己的第三方依赖绝不动。 */
const KERNEL_SCOPE = '@deepseek-ai/';
/** npm 打包形态：`@deepseek-ai/<name>` → `deepseek-ai-<name>-<version>.tgz`。 */
const KERNEL_TARBALL_PREFIX = 'deepseek-ai-';
/** 协议 / 非常规 spec（用户自接来源）一律保留。 */
const PROTOCOL_SPEC_RE = /^(?:link:|file:|workspace:|catalog:|npm:|git\+|git:|github:|https?:|~?\*|alias:)/i;

/**
 * 已知「早期版本写进 profile、如今两侧都拿不到」的退役 / 孤儿件（issue #156 /
 * #170 / #177 台账）。**只用于日志归因**——判据仍是上面的五条确定性证据，
 * 本表既不扩大也不缩小剪除面。
 */
const KNOWN_ORPHAN_DEPS = new Set([
  '@deepseek-ai/cordis-plugin-timer',
  '@deepseek-ai/dsh-third-party-thinking',
  '@deepseek-ai/dsh-float-window',
  '@deepseek-ai/dshmarket',
]);

/** 备份后缀：与 pi-ai-settings-heal / plugin-sync 同式（时间戳 + 随机串防碰撞）。 */
const backupSuffix = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// 闭包 / 名单读取（任一不可用即返回 null，调用方整体放弃）
// ---------------------------------------------------------------------------

/**
 * 内核 vendor 闭包：从 kernel-pin.json 取 packageVersion 与 vendorDir，把
 * `<vendorDir>/deepseek-ai-<name>-<packageVersion>.tgz` 还原成 `@deepseek-ai/<name>`。
 * @param {string} appDir dsh-desktop 根
 * @param {(msg: string) => void} [log]
 * @returns {Set<string>|null} 包名集合；pin / vendor 不可读或名单为空时 null
 *   （空名单 = 半安装，据其剪除会把合法内核包判成孤儿，绝不允许）
 */
function kernelClosureNames({ appDir, log = () => {} } = {}) {
  if (!appDir) return null;
  let pin;
  try {
    pin = loadPin(appDir).pin;
  } catch (err) {
    log('profile 孤儿依赖自愈跳过（kernel-pin.json 不可读，不修）: ' + String((err && err.message) || err));
    return null;
  }
  const version = pin && pin.kernel && pin.kernel.packageVersion;
  if (typeof version !== 'string' || version === '') {
    log('profile 孤儿依赖自愈跳过（pin 缺 kernel.packageVersion，不修）');
    return null;
  }
  const vendorDir = path.resolve(appDir, (pin.kernel && pin.kernel.vendorDir) || path.join('vendor', 'dsh-kernel'));
  let files;
  try { files = fs.readdirSync(vendorDir); }
  catch (err) {
    log('profile 孤儿依赖自愈跳过（离线内核目录不可读，不修）: ' + String((err && err.message) || err));
    return null;
  }
  const suffix = '-' + version + '.tgz';
  const names = new Set();
  for (const f of files) {
    if (!f.endsWith('.tgz') || !f.endsWith(suffix) || !f.startsWith(KERNEL_TARBALL_PREFIX)) continue;
    const bare = f.slice(KERNEL_TARBALL_PREFIX.length, f.length - suffix.length);
    if (bare !== '') names.add(KERNEL_SCOPE + bare);
  }
  if (names.size === 0) {
    log('profile 孤儿依赖自愈跳过（离线内核 tarball 名单为空，据其判孤儿不可靠，不修）');
    return null;
  }
  return names;
}

/**
 * 内置配套件包名集合（COMPANION_PLUGINS，含 @deepseek-ai scope 的桌面内置件）。
 * @returns {Set<string>|null} 名单模块不可用时 null（少一层保护即可能误剪，放弃）
 */
function companionNames() {
  try {
    const { COMPANION_PLUGINS } = require('./companion-plugins');
    if (!Array.isArray(COMPANION_PLUGINS)) return null;
    const set = new Set();
    for (const p of COMPANION_PLUGINS) if (p && typeof p.name === 'string') set.add(p.name);
    return set.size > 0 ? set : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// profile 枚举与在位性探测
// ---------------------------------------------------------------------------

/**
 * 枚举 DSH home 下的 profile 目录（`<home>/profiles/<name>`）。
 * 排除 `node_modules`（内核 farm，不是 profile）与点开头目录；只返回真实目录。
 * home 不存在 / 不可读 → 空数组。
 * @param {string} home
 * @returns {string[]} 绝对路径，按名字排序（确定性）
 */
function listProfileDirs(home) {
  const profilesRoot = path.join(home || '', 'profiles');
  let entries;
  try { entries = fs.readdirSync(profilesRoot, { withFileTypes: true }); } catch { return []; }
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    dirs.push(path.join(profilesRoot, entry.name));
  }
  dirs.sort();
  return dirs;
}

/** 包名在某个 node_modules 根下是否有可用的 package.json（可解析的最小证据）。 */
function hasPackageJsonUnder(modulesRoot, packageName) {
  const rel = String(packageName).split('/').filter(Boolean);
  if (rel.length === 0) return false;
  try {
    return fs.existsSync(path.join(modulesRoot, ...rel, 'package.json'));
  } catch {
    return false;
  }
}

/**
 * 该包是否真的装在这个 profile 里（profile 自有 node_modules，或内核为它建的
 * profile 私有 fallback `<profile>/.dsh-module-fallback/node_modules`）。
 * 命中即视为用户实装，绝不剪。
 */
function installedForProfile(profileDir, packageName) {
  return hasPackageJsonUnder(path.join(profileDir, 'node_modules'), packageName)
    || hasPackageJsonUnder(path.join(profileDir, '.dsh-module-fallback', 'node_modules'), packageName);
}

/**
 * profile 自有 node_modules 里是否有同名「坏 shadow」（目录在、package.json 不
 * 在 / 不可读）。这种条目会抢先命中 Node 解析并抛 ERR_MODULE_NOT_FOUND，即使共享
 * farm 里有货也救不回来——故它不构成保留理由。
 */
function brokenShadowInProfile(profileDir, packageName) {
  const rel = String(packageName).split('/').filter(Boolean);
  if (rel.length === 0) return false;
  const target = path.join(profileDir, 'node_modules', ...rel);
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return false;
  } catch { return false; }
  return !hasPackageJsonUnder(path.join(profileDir, 'node_modules'), packageName);
}

// ---------------------------------------------------------------------------
// 判定（纯函数，无副作用，便于单测）
// ---------------------------------------------------------------------------

/**
 * 把一个 profile manifest 的 dependencies 分成「孤儿」与「保留」。
 * @param {Object} opts
 * @param {Object} opts.manifest profile package.json 解析结果
 * @param {Set<string>} opts.closure 内核 vendor 闭包
 * @param {Set<string>} opts.companions 内置配套件名单
 * @param {string} opts.profileDir profile 目录（在位性探测锚点）
 * @param {string} [opts.farmDir] 共享 farm `<home>/profiles/node_modules`（安装闭包派生）
 * @returns {{orphans: Array<{name:string,spec:string,known:boolean}>, kept: string[]}}
 */
function classifyProfileDependencies({ manifest, closure, companions, profileDir, farmDir }) {
  const orphans = [];
  const kept = [];
  const deps = manifest && manifest.dependencies;
  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) return { orphans, kept };
  const bundles = (manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles))
    ? manifest.dsh.profile.bundles : [];
  for (const name of Object.keys(deps).sort()) {
    const spec = deps[name];
    const keep = () => kept.push(name);
    // ① scope 门：非 @deepseek-ai 一律不动（用户自装的第三方 / @vlln / @dsh-external…）。
    if (typeof name !== 'string' || !name.startsWith(KERNEL_SCOPE)) { keep(); continue; }
    // ② 协议 / 异形 spec：用户自己接进来的来源，不动。
    if (typeof spec !== 'string' || spec === '' || PROTOCOL_SPEC_RE.test(spec)) { keep(); continue; }
    // ③ 内核官方包闭包（vendor tarball 名单）：合法声明，不动。
    if (closure.has(name)) { keep(); continue; }
    // ④ 桌面内置配套件：走 assets/plugins 分发，合法，不动。
    if (companions.has(name)) { keep(); continue; }
    // ⑤ 同 manifest 的 bundles 仍登记它：不做半清理（留给 bundle 自愈面处理）。
    if (bundles.includes(name)) { keep(); continue; }
    // ⑥ profile 里确实装着：用户实装，不动。
    if (installedForProfile(profileDir, name)) { keep(); continue; }
    // ⑦ 共享 farm（安装闭包）能提供且无坏 shadow：内核从 profile 上溯即可解析，
    //    典型 `@deepseek-ai/schemastery` / `cordis-plugin-*`（npm 闭包件，不在 vendor
    //    tarball 名单里但完全合法）——不动。farm 有货但 profile 内是坏目录时，坏
    //    shadow 自己就是 NOT_FOUND 的来源，仍按孤儿处理（声明剪掉即不再被装配）。
    if (farmDir && hasPackageJsonUnder(farmDir, name) && !brokenShadowInProfile(profileDir, name)) {
      keep(); continue;
    }
    orphans.push({ name, spec, known: KNOWN_ORPHAN_DEPS.has(name) });
  }
  return { orphans, kept };
}

// ---------------------------------------------------------------------------
// 单 profile 修复（备份 + 原子写 + 全容忍）
// ---------------------------------------------------------------------------

/**
 * 自愈一个 profile 的 manifest 孤儿依赖。
 * @param {Object} opts
 * @param {string} opts.profileDir
 * @param {Set<string>} opts.closure
 * @param {Set<string>} opts.companions
 * @param {string} [opts.farmDir] 共享 farm（`<home>/profiles/node_modules`）
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] 只计算不落盘
 * @returns {{profile:string, removed:string[], backup:string|null, note:string|null}}
 */
function healOneProfile({ profileDir, closure, companions, farmDir, log = () => {}, dryRun = false }) {
  const manifestFile = path.join(profileDir, 'package.json');
  const shortName = path.basename(profileDir);
  const result = { profile: profileDir, removed: [], backup: null, note: null };

  let raw;
  try { raw = fs.readFileSync(manifestFile, 'utf8'); }
  catch (err) {
    // ENOENT = profile 尚未初始化（下次 boot 再试）；其余 = 不可读，同样不动。
    result.note = 'manifest-unreadable';
    if (err && err.code !== 'ENOENT') log('profile 孤儿依赖自愈跳过（' + shortName + ' manifest 不可读）: ' + String((err && err.message) || err));
    return result;
  }
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch (err) {
    result.note = 'manifest-parse-failed';
    log('profile 孤儿依赖自愈跳过（' + shortName + ' manifest 解析失败，不动它）: ' + String((err && err.message) || err));
    return result;
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    result.note = 'manifest-not-object';
    return result;
  }
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
    result.note = 'no-dependencies'; // 常态：零开销 no-op，不打日志
    return result;
  }

  const { orphans } = classifyProfileDependencies({ manifest, closure, companions, profileDir, farmDir });
  if (orphans.length === 0) return result; // 健康：零写入

  const names = orphans.map((o) => o.name);
  if (dryRun) {
    log('dry-run: ' + shortName + ' 将清除孤儿依赖 ' + names.join(', '));
    result.removed = names;
    return result;
  }

  // 备份原文（备份保不住就绝不覆盖用户配置）。
  const backup = manifestFile + '.heal-orphan-' + backupSuffix();
  try { fs.copyFileSync(manifestFile, backup); }
  catch (err) {
    result.note = 'backup-failed: ' + String((err && err.message) || err);
    log('profile 孤儿依赖自愈放弃（' + shortName + ' 备份失败，保留原文件）: ' + result.note);
    return result;
  }

  for (const o of orphans) delete manifest.dependencies[o.name];
  // 清空后整体移除 dependencies 键（与 cleanLegacyProfileDependencies /
  // removeRetiredDshMarketDir 同口径，不留空对象漂移）。
  if (Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies;

  try { writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); }
  catch (err) {
    result.note = 'write-failed: ' + String((err && err.message) || err);
    log('profile 孤儿依赖自愈放弃（' + shortName + ' 写入失败，原文在备份 ' + backup + '）: ' + result.note);
    return result;
  }

  result.removed = names;
  result.backup = backup;
  for (const o of orphans) {
    log('profile 孤儿依赖自愈: 移除 ' + shortName + ' 的 ' + o.name + '@' + o.spec
      + '（不在内核闭包 / 非内置配套件 / profile 内无实体）'
      + (o.known ? '——已知退役孤儿件' : '') + '，原 manifest 已备份到 ' + backup);
  }
  return result;
}

// ---------------------------------------------------------------------------
// boot repair 步入口
// ---------------------------------------------------------------------------

/**
 * 遍历 DSH home 下全部 profile，逐个自愈 manifest 孤儿依赖（幂等：清干净后
 * 下次 boot 命中「无孤儿」分支，零写入）。
 * @param {Object} opts
 * @param {string} opts.appDir dsh-desktop 根（读 pin + vendor 闭包）
 * @param {string} opts.home   effective DSH home（DSH_HOME / ~/.dsh）
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun]
 * @param {{closure?:Set<string>, companions?:Set<string>, profileDirs?:string[], farmDir?:string|null}} [opts.inject]
 *   测试注桩：覆盖闭包 / 配套件名单 / profile 目录清单 / farm 目录
 * @returns {{changed:boolean, removedTotal:number, profiles:Array, note:string|null}}
 */
function healProfileOrphanDeps({ appDir, home, log = () => {}, dryRun = false, inject } = {}) {
  const result = { changed: false, removedTotal: 0, profiles: [], note: null };
  if (!home) { result.note = 'no-home'; return result; }

  const closure = (inject && inject.closure !== undefined)
    ? inject.closure
    : kernelClosureNames({ appDir, log });
  if (!closure) {
    if (!result.note) result.note = 'closure-unavailable';
    return result;
  }
  const companions = (inject && inject.companions !== undefined)
    ? inject.companions
    : companionNames();
  if (!companions) {
    if (!result.note) result.note = 'companions-unavailable';
    return result;
  }

  const profileDirs = (inject && inject.profileDirs) || listProfileDirs(home);
  if (profileDirs.length === 0) { result.note = 'no-profiles'; return result; }
  // 共享 farm：内核 healProfilesModuleFallback 从安装闭包派生的一层，Node 从 profile
  // 上溯能走到这里（inject.farmDir 可显式置 null 以关闭本判据）。
  const farmDir = (inject && inject.farmDir !== undefined)
    ? inject.farmDir
    : path.join(home, 'profiles', 'node_modules');

  for (const dir of profileDirs) {
    let one;
    try {
      one = healOneProfile({ profileDir: dir, closure, companions, farmDir, log, dryRun });
    } catch (err) {
      // 单 profile 的实现级异常（Windows 文件锁 / AV 抢占）不影响其余 profile。
      log('profile 孤儿依赖自愈异常（跳过该 profile，继续其他）: ' + dir + ' — ' + String((err && err.message) || err));
      continue;
    }
    result.profiles.push(one);
    if (one.removed.length > 0) {
      result.changed = true;
      result.removedTotal += one.removed.length;
    }
    if (one.note && !result.note) result.note = one.note;
  }
  return result;
}

module.exports = {
  KERNEL_SCOPE,
  KERNEL_TARBALL_PREFIX,
  PROTOCOL_SPEC_RE,
  KNOWN_ORPHAN_DEPS,
  backupSuffix,
  kernelClosureNames,
  companionNames,
  listProfileDirs,
  hasPackageJsonUnder,
  installedForProfile,
  brokenShadowInProfile,
  classifyProfileDependencies,
  healOneProfile,
  healProfileOrphanDeps,
};
