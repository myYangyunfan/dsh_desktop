'use strict';

// ---------------------------------------------------------------------------
// profile bundle 装配链防护（main.js applyProfileBundleGuard 与
// scripts/sync-companion-plugins.js 共用）：把 dsh 对 profile bundle 的
// fail-loud 启动语义收口为「诊断 + 跳过该层 + 继续启动」。覆盖的崩溃形态
// （均在最新 vendored dsh 0.1.0-rc.6 上实机复现）：
//   1. cannot resolve profile bundle —— manifest 登记了未安装 / 被清理的包；
//   2. declares no dsh.bundle —— 普通库或仅客户端 bundle（dsh.bundle 无
//      patch 层）被登记为 profile 层；
//   3. bundle 的 cordis.patch.yml 缺失 / 无法解析；
//   4. profiles/<name>/package.json 读不出 / JSON 损坏 / 顶层非对象；
//   5. $DSH_HOME/cordis.patch.yml（家级用户补丁层）损坏 —— 同时覆盖启动
//      与 HMR 热重载路径。
//
// 本模块不持有任何 dsh 安装路径，只提供纯函数：幂等的源码字符串变换（锚点
// 不匹配时原样返回）、bundle 目录只读校验与原子写；具体文件定位与写入时机由
// main.js / 同步脚本决定。dsh 版本更新后锚点失配时，防护会跳过并在日志告警
// （与既有运行时补丁一致），下次启动重试。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

/** dsh-app-boot 注入代码的幂等标记。 */
const PROFILE_BUNDLE_GUARD_MARKER = 'dsh-desktop guard: a broken profile bundle must not brick';
/** dsh profile-boot 注入代码的幂等标记。 */
const PROFILE_BOOT_GUARD_MARKER = 'function loadUserPatchLayerSafe';

// ---------------------------------------------------------------------------
// bundle 包描述解析（纯函数）
// ---------------------------------------------------------------------------

/**
 * 取 package.json 声明的 dsh.bundle.patch 相对路径；未声明 / 空串 / 非字符串
 * 一律返回空串（调用方按「不是可装配 bundle」处理）。
 */
function bundlePatchRel(pkg) {
  const patch = pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  return typeof patch === 'string' && patch.trim() !== '' ? patch : '';
}

/**
 * 取 bundle 包的入口文件（exports["."] 优先，其次 main）；解析不出返回空串。
 * dsh 装配 bundle 时会 import 该入口，入口文件缺失即整棵插件树加载失败。
 */
function bundleEntryOf(pkg) {
  const ex = pkg && pkg.exports;
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
    const dot = ex['.'];
    if (typeof dot === 'string') return dot;
    if (dot && typeof dot === 'object') return dot.import || dot.default || '';
  }
  return (pkg && typeof pkg.main === 'string') ? pkg.main : '';
}

// ---------------------------------------------------------------------------
// 落盘 bundle 目录校验（同步写入侧防呆）
// ---------------------------------------------------------------------------

/**
 * 校验一个已落盘的 bundle 目录：package.json 可解析、声明了 dsh.bundle.patch、
 * 补丁层与入口文件都存在。任一不满足返回 { ok:false, reason } —— 同步方必须
 * 按「源缺失」处理（不注册为 profile bundle），否则 dsh 启动时必然崩溃。
 */
function verifyBundleDir(dir) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch (err) {
    return { ok: false, reason: 'package.json 不可读或不是合法 JSON: ' + ((err && err.message) || err) };
  }
  const patchRel = bundlePatchRel(pkg);
  if (!patchRel) return { ok: false, reason: 'package.json 未声明 dsh.bundle.patch' };
  const patchFile = path.join(dir, patchRel);
  if (!fs.existsSync(patchFile)) return { ok: false, reason: '补丁层缺失: ' + patchRel };
  const entry = bundleEntryOf(pkg);
  if (entry && !fs.existsSync(path.join(dir, entry))) return { ok: false, reason: '入口文件缺失: ' + entry };
  return { ok: true, reason: '' };
}

/**
 * 沿 Node 的 node_modules 父目录查找顺序探测包目录（等价于
 * resolveBundleDir 的第一锚点语义，且不依赖包导出 ./package.json）。
 * 找不到返回空串。
 */
function packageDirUpward(anchorDir, packageName) {
  const parts = packageName.split('/');
  let dir = anchorDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...parts);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

/**
 * 扫描 profile node_modules 中实际落盘且可装配的第三方 bundle 包（issue #48
 * 数据恢复用：manifest 重置后用户手动安装的插件仍留在磁盘上，据此恢复登记）。
 * 只返回通过 verifyBundleDir 完整校验的包；excludeNames（核心 + 配套插件名）
 * 与未声明 dsh.bundle 的普通依赖一律排除。结果按包名排序保证确定性。
 * @returns [{ name: string, version: string }]
 */
function scanProfileBundles(modulesDir, excludeNames) {
  const found = [];
  let top;
  try { top = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { return found; }
  const candidates = [];
  for (const entry of top) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      let scoped;
      try { scoped = fs.readdirSync(path.join(modulesDir, entry.name), { withFileTypes: true }); } catch { continue; }
      for (const sub of scoped) {
        if (!sub.isDirectory()) continue;
        candidates.push({ name: entry.name + '/' + sub.name, dir: path.join(modulesDir, entry.name, sub.name) });
      }
    } else {
      candidates.push({ name: entry.name, dir: path.join(modulesDir, entry.name) });
    }
  }
  candidates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const { name, dir } of candidates) {
    if (excludeNames.has(name)) continue;
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
    if (!pkg || typeof pkg !== 'object' || typeof pkg.name !== 'string' || pkg.name === '') continue;
    if (!bundlePatchRel(pkg)) continue;
    // 入口 / 补丁层缺失的包即使恢复登记也会被启动防护跳过，一律不登记。
    if (!verifyBundleDir(dir).ok) continue;
    found.push({ name: pkg.name, version: typeof pkg.version === 'string' ? pkg.version : '' });
  }
  return found;
}

/**
 * 把扫描到的第三方 bundle 合并回 profile manifest：bundles 追加缺失项（保持
 * 既有顺序），dependencies 补回包名（用包内声明的版本号；git 依赖等非常规
 * 来源无法还原原始 spec，登记版本号可保证后续 pnpm 安装不把它当孤儿包清理）。
 * @returns 本次实际恢复的包名列表。
 */
function recoverManifestBundles(manifest, found) {
  const bundles = Array.isArray(manifest && manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles : [];
  const dependencies = (manifest && manifest.dependencies && typeof manifest.dependencies === 'object' && !Array.isArray(manifest.dependencies))
    ? manifest.dependencies : {};
  const recovered = [];
  for (const item of found) {
    if (bundles.includes(item.name)) continue;
    bundles.push(item.name);
    if (typeof dependencies[item.name] !== 'string' || dependencies[item.name] === '') dependencies[item.name] = item.version;
    recovered.push(item.name);
  }
  manifest.dsh.profile.bundles = bundles;
  if (recovered.length > 0) manifest.dependencies = dependencies;
  return recovered;
}

/**
 * 原子写（临时文件 + rename），避免与 dsh 的 HMR 观察者撕裂读。
 */
function writeFileAtomic(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// @deepseek-ai/dsh-app-boot/lib/index.js 变换
// ---------------------------------------------------------------------------

// loadProfile 中逐个 bundle 严格装配的原始代码块（built 文件为制表符缩进）。
const APP_BOOT_LAYERS_ANCHOR = [
  '\tconst layers = (normalizeShippedProfile(name, dir, readProfileManifest(binName, dir)).dsh?.profile?.bundles ?? []).map((packageName) => {',
  '\t\tconst packageDir = resolveBundleDir(binName, packageName, installAnchor, dir);',
  '\t\tconst declared = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).dsh?.bundle?.patch;',
  '\t\tif (declared === void 0) throw new Error(`${binName}: profile bundle ${JSON.stringify(packageName)} declares no dsh.bundle in its package.json`);',
  '\t\tconst patchPath = join(packageDir, declared);',
  '\t\treturn {',
  '\t\t\tpackageName,',
  '\t\t\tpackageDir,',
  '\t\t\tpatchPath,',
  '\t\t\tpatches: loadOverlayPatches(binName, patchPath)',
  '\t\t};',
  '\t});',
].join('\n');

// 注入位置：composeEntries 函数声明前（模块作用域内所有被用符号均可见）。
const APP_BOOT_INSERT_ANCHOR = 'function composeEntries(layers, warn = () => {}) {';

const APP_BOOT_GUARD_CODE = [
  '/** dsh-desktop guard: a broken profile bundle must not brick the surface. Every',
  ' * `dsh.profile.bundles` entry is loaded through this helper: an unresolvable',
  ' * package, an unreadable or unparsable bundle manifest, a missing',
  ' * `dsh.bundle.patch` declaration, or a bundle patch layer that fails to load',
  ' * no longer aborts the boot — the layer is skipped with a labelled stderr',
  ' * diagnostic and the profile boots without it. A corrupt profile manifest is',
  ' * backed up and re-initialized from the shipped template (its previous content',
  ' * stays in the `.broken-` backup). */',
  'function loadProfileManifestSafe(binName, name, dir) {',
  '\ttry {',
  '\t\treturn readProfileManifest(binName, dir);',
  '\t} catch (error) {',
  '\t\tconst file = join(dir, "package.json");',
  '\t\tlet backup = null;',
  '\t\ttry {',
  '\t\t\tif (existsSync(file)) {',
  '\t\t\t\tbackup = `' + '${file}.broken-${Date.now()}`' + ';',
  '\t\t\t\twriteFileSync(backup, readFileSync(file, "utf8"));',
  '\t\t\t}',
  '\t\t\tconst manifest = {',
  '\t\t\t\tname: `' + 'dsh-profile-${basename(dir)}`' + ',',
  '\t\t\t\tprivate: true,',
  '\t\t\t\tdependencies: {},',
  '\t\t\t\tdsh: { profile: { bundles: [...(PROFILE_TEMPLATES[name] ?? DEFAULT_PROFILE_BUNDLES)] } }',
  '\t\t\t};',
  '\t\t\twriteFileSync(file, JSON.stringify(manifest, void 0, 2) + "\\n");',
  '\t\t} catch (recoveryError) {',
  '\t\t\tthrow new Error(`' + '${binName}: profile manifest ${file} is unusable (${String(error?.message ?? error)}) and recovery failed (${String(recoveryError?.message ?? recoveryError)})`' + ');',
  '\t\t}',
  '\t\tprocess.stderr.write(`' + '${binName}: profile manifest ${file} failed to load (${String(error?.message ?? error)})${backup !== null ? `; the broken file was backed up to ${backup}` : ""}; the profile was re-initialized with its shipped bundle template\\n`' + ');',
  '\t\treturn readProfileManifest(binName, dir);',
  '\t}',
  '}',
  'function loadBundleLayerSafe(binName, packageName, installAnchor, profileDir) {',
  '\tconst skip = (reason) => {',
  '\t\tprocess.stderr.write(`' + '${binName}: profile bundle ${JSON.stringify(packageName)} skipped — ${reason}\\n`' + ');',
  '\t\treturn { packageName, packageDir: null, patchPath: null, patches: [] };',
  '\t};',
  '\tlet packageDir;',
  '\ttry {',
  '\t\tpackageDir = resolveBundleDir(binName, packageName, installAnchor, profileDir);',
  '\t} catch (error) {',
  '\t\treturn skip(`' + 'cannot resolve it from the dsh installation or ${profileDir} (${String(error?.message ?? error)}); run \'dsh plugin --profile ${basename(profileDir)} install\' if its dependency is not installed`' + ');',
  '\t}',
  '\tlet manifest;',
  '\ttry {',
  '\t\tmanifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));',
  '\t} catch (error) {',
  '\t\treturn skip(`' + 'its package.json cannot be read or parsed (${String(error?.message ?? error)}); reinstall it with \'dsh plugin --profile ${basename(profileDir)} install\'`' + ');',
  '\t}',
  '\tconst declared = manifest?.dsh?.bundle?.patch;',
  '\tif (typeof declared !== "string" || declared === "") {',
  '\t\tconst hint = manifest?.dsh?.bundle !== void 0',
  '\t\t\t? "it declares dsh.bundle without a patch layer (a client-only bundle has no Node layer to mount)"',
  '\t\t\t: "it declares no dsh.bundle in its package.json (not a dsh plugin bundle)";',
  '\t\treturn skip(`' + '${hint}; it stays out of the profile layer stack`' + ');',
  '\t}',
  '\tconst patchPath = join(packageDir, declared);',
  '\ttry {',
  '\t\treturn { packageName, packageDir, patchPath, patches: loadOverlayPatches(binName, patchPath) };',
  '\t} catch (error) {',
  '\t\treturn skip(`' + 'its patch layer ${patchPath} failed to load (${String(error?.message ?? error)}); the bundle stays disabled until its files are restored`' + ');',
  '\t}',
  '}',
  'function loadProfileLayers(binName, name, dir, installAnchor) {',
  '\tconst manifest = loadProfileManifestSafe(binName, name, dir);',
  '\tconst normalized = normalizeShippedProfile(name, dir, manifest);',
  '\tconst bundles = normalized.dsh?.profile?.bundles;',
  '\tif (bundles !== void 0 && !Array.isArray(bundles)) {',
  '\t\tprocess.stderr.write(`' + '${binName}: profile ${JSON.stringify(name)}: dsh.profile.bundles must be an array (got ${typeof bundles}); booting without bundle layers — fix the profile manifest or run \'dsh plugin --profile ${name} install\'\\n`' + ');',
  '\t\treturn [];',
  '\t}',
  '\treturn (bundles ?? []).map((packageName) => loadBundleLayerSafe(binName, packageName, installAnchor, dir));',
  '}',
].join('\n');

/**
 * 改写 dsh-app-boot/lib/index.js：把 loadProfile 的严格 bundle 装配替换为
 * 自愈装配（bundle 层跳过 + manifest 备份重建）。已注入或锚点失配时原样返回。
 * @returns {{ changed: boolean, src: string }}
 */
function applyAppBootBundleGuard(src) {
  if (typeof src !== 'string') return { changed: false, src };
  if (src.includes(PROFILE_BUNDLE_GUARD_MARKER)) return { changed: false, src };
  if (!src.includes(APP_BOOT_LAYERS_ANCHOR) || !src.includes(APP_BOOT_INSERT_ANCHOR)) return { changed: false, src };
  let out = src.replace(APP_BOOT_LAYERS_ANCHOR, '\tconst layers = loadProfileLayers(binName, name, dir, installAnchor);');
  out = out.replace(APP_BOOT_INSERT_ANCHOR, APP_BOOT_GUARD_CODE + '\n\n' + APP_BOOT_INSERT_ANCHOR);
  return { changed: true, src: out };
}

// ---------------------------------------------------------------------------
// @deepseek-ai/dsh/lib/profile-boot-*.js 变换（家级补丁层自愈）
// ---------------------------------------------------------------------------

const PROFILE_BOOT_IMPORT_ANCHOR = 'import { writeFileSync } from "node:fs";';
const PROFILE_BOOT_HOME_ANCHOR = '\tconst homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? [];';
const PROFILE_BOOT_LIVE_PROFILE_ANCHOR = '\t\t...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],';
const PROFILE_BOOT_LIVE_HOME_ANCHOR = '\t\t...loadOptionalPatches(NAME, homePatchPath()) ?? [],';
const PROFILE_BOOT_EXPORT_ANCHOR = 'export { resolveTelemetryPatch as a, prepareProfile as i, PROFILE_ROOT_FILENAME as n, runProfile as o, homePatchPath as r, INSTALL_ANCHOR as t };';

const PROFILE_BOOT_GUARD_CODE = [
  '/** dsh-desktop guard: the profile patch layer and the home-level patch layer',
  ' * (`$DSH_HOME/cordis.patch.yml`) are user-owned data; a broken file must not',
  ' * brick the boot or a hot-reload. Back the broken file up, reset the layer to',
  ' * an empty list, warn, and continue without it. */',
  'function loadUserPatchLayerSafe(binName, file) {',
  '\ttry {',
  '\t\treturn loadOptionalPatches(binName, file) ?? [];',
  '\t} catch (error) {',
  '\t\ttry {',
  '\t\t\tconst backup = `' + '${file}.broken-${Date.now()}`' + ';',
  '\t\t\twriteFileSync(backup, readFileSync(file, "utf8"));',
  '\t\t\twriteFileSync(file, "# recovered by dsh: the previous content failed to parse and was moved to\\n# " + backup + "\\n[]\\n");',
  '\t\t} catch {}',
  '\t\tprocess.stderr.write(`' + '${binName}: ${file} failed to parse (${String(error?.message ?? error)}); the broken file was moved aside and the profile booted without this patch layer\\n`' + ');',
  '\t\treturn [];',
  '\t}',
  '}',
].join('\n');

/**
 * 改写 dsh/lib/profile-boot-*.js：家级 cordis.patch.yml 与 profile 补丁层的
 * 加载（composeProfile 与 HMR composeLive 三处）换成「损坏备份 + 重置 + 继续」。
 * 已注入或任一锚点失配时原样返回。
 * @returns {{ changed: boolean, src: string }}
 */
function applyProfileBootBundleGuard(src) {
  if (typeof src !== 'string') return { changed: false, src };
  if (src.includes(PROFILE_BOOT_GUARD_MARKER)) return { changed: false, src };
  const anchors = [
    PROFILE_BOOT_IMPORT_ANCHOR,
    PROFILE_BOOT_HOME_ANCHOR,
    PROFILE_BOOT_LIVE_PROFILE_ANCHOR,
    PROFILE_BOOT_LIVE_HOME_ANCHOR,
    PROFILE_BOOT_EXPORT_ANCHOR,
  ];
  if (!anchors.every((anchor) => src.includes(anchor))) return { changed: false, src };
  let out = src
    .replace(PROFILE_BOOT_IMPORT_ANCHOR, 'import { readFileSync, writeFileSync } from "node:fs";')
    .replace(PROFILE_BOOT_HOME_ANCHOR, '\tconst homePatches = loadUserPatchLayerSafe(NAME, homePatchPath());')
    .replace(PROFILE_BOOT_LIVE_PROFILE_ANCHOR, '\t\t...loadUserPatchLayerSafe(NAME, composed.profile.patchPath),')
    .replace(PROFILE_BOOT_LIVE_HOME_ANCHOR, '\t\t...loadUserPatchLayerSafe(NAME, homePatchPath()),');
  out = out.replace(PROFILE_BOOT_EXPORT_ANCHOR, PROFILE_BOOT_EXPORT_ANCHOR + '\n\n' + PROFILE_BOOT_GUARD_CODE);
  return { changed: true, src: out };
}

module.exports = {
  PROFILE_BUNDLE_GUARD_MARKER,
  PROFILE_BOOT_GUARD_MARKER,
  bundlePatchRel,
  bundleEntryOf,
  verifyBundleDir,
  packageDirUpward,
  scanProfileBundles,
  recoverManifestBundles,
  writeFileAtomic,
  applyAppBootBundleGuard,
  applyProfileBootBundleGuard,
};
