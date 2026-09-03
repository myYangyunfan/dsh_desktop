'use strict';

// ---------------------------------------------------------------------------
// DSH Hotplug Hub（ARFCON/dsh-hotplug-hub，官方推介的 dsh 启动管理器）识别
// 适配层 —— 唯一实现，运行时同步（scripts/integration/plugin-sync.js）与
// CLI 同步（scripts/sync-companion-plugins.js）共用。
//
// 逆向结论（hub v0.9.8，双识别面，均不扫描 assets/plugins）：
//   1. 桌面端「插件管理」页（release/src/Main.cs GetPluginsJson）：插件清单
//      = profile package.json 的 **dependencies 键**；逐键读
//      node_modules/<name>/package.json 取版本；启停走 cordis.patch.yml 的
//      loader id 禁用条目（完整移植我方 plugin-manager-patch.js 语义，双向
//      兼容）。【issue #156 后我方主动放弃此识别面：向 dependencies 写内置件
//      会毒化 pnpm（见下），内置件改由 DSH Desktop 自己的插件管理面呈现；
//      此面仅保留用户自装插件的既有行为。】
//   2. lib/CLI（dsh-hotplug-hub/lib）：包清单 = <DSH_HOME>/hotplug-hub/packs/
//      <packId>/hotpack.json（hotpack 1.0）；statusSync 按包内 plugins 逐条
//      以「目标目录存在 package.json」判 cached。配套件没有 hotpack 登记 →
//      status/check 一概不显示。
//
// 本模块在同步链末段维护 hub 识别面（幂等、健康零写入）：
//   · 【issue #156 止血】profile package.json dependencies **不再写入任何
//     内置配套件登记**，并幂等清除 v0.5.3（提交 6070d5ab）写入的存量脏数据。
//     旧口径把 34 个内置件按 npm 形状（精确版本）写进 dependencies，而这些
//     包只随客户端分发、多数不在 npm 上 → 用户在 profiles/web 跑 pnpm 时
//     ERR_PNPM_FETCH_404，整个 profile 锁死。清理识别口径：配套件名 + 精确
//     版本值（旧写入器形状），且排除「插件中心更新位形」（见
//     cleanLegacyProfileDependencies）；用户自装条目（非配套名 / 范围版本 /
//     file: link: 等异形 spec）一律不动。识别面①（桌面端插件管理页枚举
//     dependencies）就此失去内置件——取舍见下。
//   · 【issue #177 分工】本函数只覆盖「名字仍在配套清单里」的条目；名字已从
//     内核 / 配套面消失的**孤儿条目**（典型 `@deepseek-ai/cordis-plugin-timer`，
//     内核 boot 装配它即 ERR_MODULE_NOT_FOUND 退出）由 boot repair 步
//     `scripts/lib/profile-orphan-dep-heal.js` 按「vendor 内核闭包 + 配套件名单
//     + profile / 共享 farm 内在位性」这些本地证据回收——#170 回复里承诺的
//     「manifest 清理链彻底修复另开跟进」即此。两条链各自幂等、判定面不重叠。
//   · hotplug-hub/packs/dsh-desktop/hotpack.json：指向已落位 node_modules
//     目录的 path 源指针包，让 hub 的 status/preview 把内置件列为
//     cached/reused（识别面②，保留）。**只读指针**：内置件的挂载归同步链
//     所有，hub 侧请勿 activate（会追加重复 insert 块，双登记即 issue #104
//     启动崩溃）。
//
// 识别面①取舍（为何不救 dependencies 面）：评估过 `file:` 协议依赖（pnpm 对
// file: 本地路径不查 registry）。实测 pnpm 11：file: 指向存在路径可装，但
// 指向缺失路径直接 ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND 退出 1——与 404 同类
// 的整 profile 锁死。file: 只能指向 app 的 assets 目录（绝对路径，便携版/
// 重装/升级换目录即失效）或 profile 自身 node_modules（自指循环，且 pnpm
// 会重写同步链所管的目录）。结论：file: 会以另一种形态复刻 issue #156，
// 弃用。内置件本来就有 DSH Desktop 自己的插件管理面（cordis.patch.yml
// loader id 枚举 + 启停），失去官方桌面端列表显示可接受。
//
// 元数据校验（收口）：配套件 package.json 必须 name 与清单一致、version 为
// hub 认可的精确 semver（EXACT_VERSION_RE 同源规则）；带 dsh.plugin.json 的
// 插件其 version 必须与 package.json 一致（历史漂移：dsh-vision 曾 0.1.0 vs
// 0.2.1）。不合格 → 告警并跳过 hub 登记（不影响 dsh 侧既有装配）。
//
// WSL 边界：profile 位于 UNC 路径（\\wsl$\...）时跳过 hotpack 指针（hub 的
// validateSourcePath 拒绝 UNC；且 Windows 侧写下的路径对 WSL 内的 hub 也无
// 意义），dependencies 清理照常（纯 JSON，无路径）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./patch-io');
const { companionDirName } = require('./companion-plugins');

/** hub packs 目录下的指针包 id（PACK_ID_RE：^[a-z0-9][a-z0-9._-]{0,63}$/i）。 */
const HUB_PACK_ID = 'dsh-desktop';
/** 指针包展示名。 */
const HUB_PACK_NAME = 'DSH Desktop 内置插件';
/** hub packs 目录相对 DSH_HOME 的位置（lib/core/paths.js packsDir）。 */
const HUB_PACKS_DIR_REL = path.join('hotplug-hub', 'packs');

// —— hub shared-core 契约的形状规则（packages/shared-core/contracts/constants.js
//    + ids.js 校验器），此处按同源规则复刻用于生成侧自检 ——
/** 插件 id：^[a-z0-9][a-z0-9_-]{0,40}$/i（ids.validatePluginId）。 */
const HUB_PLUGIN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
/** 精确版本（EXACT_VERSION_RE；prerelease/build 后缀允许）。 */
const HUB_EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** dsh.plugin.json 的 version 必须与 package.json 一致（元数据漂移防线）。 */
const PLUGIN_META_FILE = 'dsh.plugin.json';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** UNC 路径判定（与 profile-reconcile.isWslUncPath 同风格，含正斜杠形态）。 */
function isUncPath(p) {
  if (typeof p !== 'string' || p === '') return false;
  const norm = p.replace(/\//g, '\\');
  return norm.startsWith('\\\\wsl$\\') || norm.startsWith('\\\\wsl.localhost\\') ||
    /^\\\\[^\\]/.test(norm);
}

/**
 * 从本模块位置向上找 dsh-desktop 的 package.json 取版本（hotpack 顶层
 * version 需精确 semver；找不到时退 0.0.0，仅影响指针包展示）。
 * @returns {string}
 */
function resolveDesktopVersion() {
  let dir = __dirname;
  for (let i = 0; i < 6 && dir; i += 1) {
    const pkg = readJson(path.join(dir, 'package.json'));
    if (pkg && pkg.name === 'dsh-desktop' && typeof pkg.version === 'string') return pkg.version;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

// ---------------------------------------------------------------------------
// 元数据校验（生成/校验统一收口）
// ---------------------------------------------------------------------------

/**
 * 校验单个配套件目录的元数据一致性（package.json 必检，dsh.plugin.json
 * 存在才检）。纯函数、零副作用。
 * @param {string} dir 插件目录（assets 源或 profile 落位目录均可）
 * @param {{id: string, name: string}} plugin 配套清单条目
 * @returns {{ ok: boolean, reasons: string[], version: string|null,
 *             description: string, dpjVersionMismatch: boolean }}
 */
function inspectCompanionMeta(dir, plugin) {
  const reasons = [];
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, reasons: ['package.json 缺失或不可解析'], version: null, description: '', dpjVersionMismatch: false };
  }
  if (pkg.name !== plugin.name) {
    reasons.push('package.json name ' + JSON.stringify(pkg.name) + ' 与配套清单 ' + JSON.stringify(plugin.name) + ' 不一致');
  }
  if (typeof pkg.version !== 'string' || !HUB_EXACT_VERSION_RE.test(pkg.version)) {
    reasons.push('version 缺失或非精确 semver: ' + JSON.stringify(pkg.version));
  }
  if (typeof pkg.description !== 'string' || pkg.description.trim() === '') {
    reasons.push('description 缺失（hub 列表展示用）');
  }
  const idOk = HUB_PLUGIN_ID_RE.test(plugin.id);
  if (!idOk) reasons.push('配套清单 id 不符 hub 插件 id 规则: ' + JSON.stringify(plugin.id));

  // dsh.plugin.json（存在才检）：version 必须与 package.json 一致（历史漂移
  // 防线：dsh-vision 曾 0.1.0 vs 0.2.1，插件管理页显示错版本）。
  let dpjVersionMismatch = false;
  const dpj = readJson(path.join(dir, PLUGIN_META_FILE));
  if (dpj && typeof dpj === 'object') {
    if (typeof pkg.version === 'string' && dpj.version !== pkg.version) {
      dpjVersionMismatch = true;
      reasons.push(PLUGIN_META_FILE + ' version ' + JSON.stringify(dpj.version) + ' 与 package.json ' + JSON.stringify(pkg.version) + ' 不一致');
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    description: typeof pkg.description === 'string' ? pkg.description : '',
    dpjVersionMismatch,
  };
}

/**
 * 批量校验 assets 源目录的配套件元数据（同步链的校验环节入口）。
 * 只告警不阻断（dsh 侧装配不受影响），供日志与测试消费。
 * @param {Object} opts
 * @param {string} opts.assetsRoot assets/plugins 目录
 * @param {Array<{id: string, name: string}>} opts.plugins 配套清单
 * @param {(msg: string) => void} [opts.log]
 * @returns {{ checked: number, bad: Array<{name: string, reasons: string[]}> }}
 */
function validateCompanionMetadata(opts) {
  const { assetsRoot, plugins = [], log = () => {} } = opts;
  const bad = [];
  for (const p of plugins) {
    const dir = path.join(assetsRoot, companionDirName(p));
    const check = inspectCompanionMeta(dir, p);
    if (!check.ok) {
      bad.push({ name: p.name, reasons: check.reasons });
      log('配套件元数据校验未过（跳过 hub 登记，dsh 装配不受影响）: ' + p.name + ' —— ' + check.reasons.join('；'));
    }
  }
  return { checked: plugins.length, bad };
}

// ---------------------------------------------------------------------------
// 识别面 1（原登记面，现为 issue #156 止血清理面）
// ---------------------------------------------------------------------------

/**
 * 读取 profile node_modules 里已落位配套件的元数据，产出可登记集合
 * （hotpack 指针包的数据源；不再写 dependencies）。
 * @param {Object} opts
 * @param {string} opts.profileDir
 * @param {Array<{id: string, name: string}>} opts.plugins
 * @param {Set<string>} opts.removedIds 用户已卸载的配套件 id
 * @param {(msg: string) => void} opts.log
 * @returns {Array<{id: string, name: string, version: string, description: string}>}
 */
function collectRegistrablePlugins(opts) {
  const { profileDir, plugins = [], removedIds, log = () => {} } = opts;
  const out = [];
  for (const p of plugins) {
    if (removedIds && removedIds.has(p.id)) continue; // 用户已卸载：不登记
    const dir = path.join(profileDir, 'node_modules', ...p.name.split('/'));
    const check = inspectCompanionMeta(dir, p);
    if (!check.ok) {
      // 落位目录元数据不合格（未安装/版本缺失/包名漂移）→ 不登记并告警。
      log('配套件未就绪，跳过 hub 指针包登记: ' + p.name + ' —— ' + check.reasons.join('；'));
      continue;
    }
    out.push({ id: p.id, name: p.name, version: check.version, description: check.description });
  }
  return out;
}

/** 读 profile node_modules 里配套件的已装版本（缺失/不可解析 → null）。 */
function readInstalledVersion(profileDir, name) {
  const pkg = readJson(path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json'));
  return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

/** 读 assets 源目录里配套件的分发版本（缺 assetsRoot/缺失/不可解析 → null）。 */
function readAssetsVersion(assetsRoot, plugin) {
  if (!assetsRoot) return null;
  const pkg = readJson(path.join(assetsRoot, companionDirName(plugin), 'package.json'));
  return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

/**
 * 【issue #156 止血】清除 v0.5.3（提交 6070d5ab）写进 profile package.json
 * dependencies 的内置配套件脏数据，并保证此后不再写入任何登记（本函数只删
 * 不加）。识别口径 = 旧写入器的落盘指纹：
 *
 *   条目是脏数据 ⟺ 键 ∈ 配套件名集合
 *              ∧ 值是精确 semver（旧写入器只写精确版本；范围/^、file:、
 *                link:、workspace: 等异形 spec 绝不是我们写的，一律保留）
 *              ∧ ¬插件中心更新位形
 *
 * 「插件中心更新位形」（保留）：用户经插件中心把某配套件从 npm 更新到了
 * 比安装包新的版本（companion-profile 的 keep-newer 分支保护该安装）——
 * node_modules 已装版本 === 条目值 !== assets 分发版本。该位形的条目是
 * 用户自己的安装记录（npm 可解析，不锁 pnpm），绝不误删。
 *
 * 由此覆盖全部旧口径写入场景：
 *   · 常规脏数据（值 = 安装包版本，node_modules 同版本）→ 清除；
 *   · 版本漂移脏数据（升级后 assets/node_modules 已是新版，条目仍是旧
 *     写入器写下的旧版本）→ 清除（否则非 npm 包名照旧 404 锁死）；
 *   · 落位文件缺失（installedV 不可读）→ 清除（与旧写入器「不可登记即
 *     撤下」的既有语义一致）；
 *   · assets 缺源无法指纹时取保守方向：条目与已装版本一致即保留。
 *
 * 已知残余边界（可接受，见模块头注释）：用户若从 npm 恰好自装了与安装包
 * 完全同版本的同名包，其条目会被按脏数据清除——功能无影响（该名字的文件
 * 本就归同步链管理，node_modules/bundles/patch 三面俱在），仅官方桌面端
 * 插件列表少显示一行。
 *
 * 幂等：清干净后二次运行零写入；无 dependencies / 无可清条目不触碰文件。
 * @param {Object} opts
 * @param {string} opts.profileDir
 * @param {Array<{id: string, name: string}>} opts.plugins 全量配套清单
 * @param {string} [opts.assetsRoot] assets/plugins 源目录（缺省则退化为
 *        「条目=已装版本即保留」的保守判定）
 * @param {boolean} [opts.dryRun]
 * @param {(msg: string) => void} [opts.log]
 * @returns {{ skipped: boolean, removed: string[] }}
 */
function cleanLegacyProfileDependencies(opts) {
  const { profileDir, plugins = [], assetsRoot, dryRun = false, log = () => {} } = opts;
  const result = { skipped: false, removed: [] };
  const manifestFile = path.join(profileDir, 'package.json');
  const manifest = readJson(manifestFile);
  if (!manifest || typeof manifest !== 'object') {
    // 与 reconcileProfileBundles 的 CLI 契约同口径：manifest 尚未初始化时
    // 绝不凭空创建，无脏数据可清。
    result.skipped = true;
    log('profile manifest 尚未初始化，hub dependencies 清理留待下次同步');
    return result;
  }
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object') return result;
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const deps = manifest.dependencies;
  let changed = false;
  for (const name of Object.keys(deps)) {
    const plugin = byName.get(name);
    // 非当前配套件名：本函数不动（用户自装与「名字已消失的孤儿条目」在此无法
    // 区分，孤儿回收归 profile-orphan-dep-heal.js，见模块头 issue #177 分工）。
    if (!plugin) continue;
    const spec = deps[name];
    // 形状门：旧写入器只写精确 semver；范围/异形 spec 是用户自己的。
    if (typeof spec !== 'string' || !HUB_EXACT_VERSION_RE.test(spec)) continue;
    const installedV = readInstalledVersion(profileDir, name);
    const assetsV = readAssetsVersion(assetsRoot, plugin);
    const isPluginCenterUpdate = installedV !== null && installedV === spec && installedV !== assetsV;
    if (isPluginCenterUpdate) continue; // 用户的 npm 更新记录：保留
    delete deps[name];
    result.removed.push(name);
    changed = true;
    log('清除 v0.5.3 写入的 dependencies 脏数据（issue #156）: ' + name + '@' + spec);
  }
  if (!changed) return result;
  if (Object.keys(deps).length === 0) delete manifest.dependencies;
  if (dryRun) {
    log('dry-run: 将清除 profile dependencies 脏数据 ' + result.removed.length + ' 条（issue #156）');
    return result;
  }
  writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  log('已清除 profile dependencies 脏数据 ' + result.removed.length + ' 条（issue #156，pnpm 解锁）');
  return result;
}

// ---------------------------------------------------------------------------
// 识别面 2：hotplug-hub packs 指针包（hub lib/CLI 的 status/preview 面）
// ---------------------------------------------------------------------------

/**
 * 构造 hotpack 1.0 指针对象（纯函数）。
 * @param {Object} opts
 * @param {string} opts.profileDir
 * @param {string} opts.desktopVersion
 * @param {Array<{id: string, name: string, version: string}>} opts.registrable
 * @returns {object|null} 插件为空时返回 null
 */
function buildHotpackPointer(opts) {
  const { profileDir, desktopVersion, registrable = [] } = opts;
  if (registrable.length === 0) return null;
  const plugins = registrable.map((p) => ({
    id: p.id,
    name: p.name,
    // path 源：hub statusSync/preview 以「目录内 package.json 存在且 name
    // 一致」判 cached/reused（ensurePath 同一判定）。version 供展示（hub 的
    // path 源解析不消费该字段）。
    version: p.version,
    source: { type: 'path', path: path.join(profileDir, 'node_modules', ...p.name.split('/')).replace(/\\/g, '/') },
  }));
  return {
    hotpack: '1.0',
    id: HUB_PACK_ID,
    name: HUB_PACK_NAME,
    version: HUB_EXACT_VERSION_RE.test(desktopVersion) ? desktopVersion : '0.0.0',
    description: 'DSH Desktop 随包内置的配套插件（只读指针：挂载/更新由 DSH Desktop 同步链管理，请勿在 hub 侧 activate/deactivate）',
    tags: ['dsh-desktop', 'builtin', 'companion'],
    plugins,
  };
}

/**
 * 写/清 hotplug-hub packs 指针包（幂等：内容一致零写入；可登记集合为空时
 * 清掉历史指针）。
 * @param {Object} opts
 * @param {string} opts.home DSH_HOME
 * @param {string} opts.profileDir
 * @param {string} opts.desktopVersion
 * @param {Array<{id: string, name: string, version: string}>} opts.registrable
 * @param {boolean} [opts.dryRun]
 * @param {(msg: string) => void} [opts.log]
 * @returns {{ skipped: boolean, written: boolean, pluginCount: number }}
 */
function syncHotplugPackPointer(opts) {
  const { home, profileDir, desktopVersion, registrable = [], dryRun = false, log = () => {} } = opts;
  const result = { skipped: false, written: false, pluginCount: registrable.length };
  const packFile = path.join(home, HUB_PACKS_DIR_REL, HUB_PACK_ID, 'hotpack.json');
  if (isUncPath(profileDir)) {
    // hub validateSourcePath 拒绝 UNC；且 Windows 侧路径对 WSL 内的 hub 无意义。
    result.skipped = true;
    log('profile 位于 UNC 路径，跳过 hotplug-hub 指针包（dependencies 登记不受影响）');
    return result;
  }
  const pack = buildHotpackPointer({ profileDir, desktopVersion, registrable });
  if (pack === null) {
    if (fs.existsSync(packFile)) {
      if (dryRun) log('dry-run: 将移除 hotplug-hub 指针包（无健康配套件）: ' + packFile);
      else {
        try { fs.rmSync(path.dirname(packFile), { recursive: true, force: true }); } catch (err) { log('移除 hotplug-hub 指针包失败: ' + err.message); }
      }
    }
    return result;
  }
  const text = JSON.stringify(pack, null, 2) + '\n';
  if (fs.existsSync(packFile)) {
    const prev = (() => { try { return fs.readFileSync(packFile, 'utf8'); } catch { return null; } })();
    if (prev === text) return result; // 健康零写入
  }
  if (dryRun) {
    log('dry-run: 将写 hotplug-hub 指针包 ' + packFile + '（' + pack.plugins.length + ' 个内置件）');
    return result;
  }
  fs.mkdirSync(path.dirname(packFile), { recursive: true });
  writeFileAtomic(packFile, text);
  result.written = true;
  log('已写 hotplug-hub 指针包（hub status/preview 识别内置件）: ' + packFile + '（' + pack.plugins.length + ' 个内置件）');
  return result;
}

// ---------------------------------------------------------------------------
// 编排入口（同步链第八步）
// ---------------------------------------------------------------------------

/**
 * 同步 hotplug-hub 识别：v0.5.3 dependencies 脏数据清理（issue #156）+
 * packs 指针包 + 源元数据校验。**不再向 dependencies 写任何登记。**
 * @param {Object} opts
 * @param {string} opts.home DSH_HOME（如 ~/.dsh）
 * @param {string} opts.profileDir 通常 <home>/profiles/web
 * @param {string} [opts.assetsRoot] assets/plugins 源目录（校验环节 + 脏数据
 *        清理的安装包版本指纹；缺省时校验跳过、清理退化为保守判定）
 * @param {Array<{id: string, name: string}>} [opts.plugins] 配套清单（默认 COMPANION_PLUGINS）
 * @param {Set<string>} [opts.removedIds] 用户已卸载 id 集
 * @param {string} [opts.desktopVersion] 指针包版本（缺省自动探测）
 * @param {boolean} [opts.dryRun]
 * @param {(msg: string) => void} [opts.log]
 * @returns {{ metaBad: Array<{name: string, reasons: string[]}>, deps: { skipped: boolean, removed: string[] }, pack: object, registrable: number }}
 */
function syncHubRecognition(opts) {
  const {
    home,
    profileDir,
    assetsRoot,
    plugins,
    removedIds,
    desktopVersion,
    dryRun = false,
    log = () => {},
  } = opts;
  const list = plugins || require('./companion-plugins').COMPANION_PLUGINS;
  // 校验环节：源目录元数据一致性（告警不阻断）。
  const meta = assetsRoot
    ? validateCompanionMetadata({ assetsRoot, plugins: list, log })
    : { checked: 0, bad: [] };
  const registrable = collectRegistrablePlugins({ profileDir, plugins: list, removedIds, log });
  const version = desktopVersion || resolveDesktopVersion();
  const deps = cleanLegacyProfileDependencies({ profileDir, plugins: list, assetsRoot, dryRun, log });
  const pack = syncHotplugPackPointer({ home, profileDir, desktopVersion: version, registrable, dryRun, log });
  return { metaBad: meta.bad, deps, pack, registrable: registrable.length };
}

module.exports = {
  HUB_PACK_ID,
  HUB_PACK_NAME,
  HUB_PACKS_DIR_REL,
  HUB_PLUGIN_ID_RE,
  HUB_EXACT_VERSION_RE,
  isUncPath,
  resolveDesktopVersion,
  inspectCompanionMeta,
  validateCompanionMetadata,
  collectRegistrablePlugins,
  cleanLegacyProfileDependencies,
  buildHotpackPointer,
  syncHotplugPackPointer,
  syncHubRecognition,
};
