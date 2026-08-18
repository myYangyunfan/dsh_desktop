'use strict';

// ---------------------------------------------------------------------------
// 配套插件同步的共享实现（唯一实现）。
//
// main.js 的 syncCompanionPlugins 与 scripts/sync-companion-plugins.js 曾各自
// 维护一份「过期插件清理 / 旧市场清理 / 插件文件同步 / bundle 登记 / 补丁
// 条目注册 / 默认禁用条目」逻辑，声明「完全一致」却在细节上逐步漂移
// （注册循环缺 id 已存在跳过、缺 bundle 迁移去重、文件同步不比对时间戳等）。
// 本模块把纯逻辑收口为一处，两个入口共用；dryRun 只影响是否落盘，
// 语义与日志保持与旧实现一致（逐条变更文案由调用方注入）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { COMPANION_PLUGINS, companionDirName } = require('./companion-plugins');
const { dropBlocksByIds } = require('../../profile-patch-heal');
const { writeFileAtomic } = require('./patch-io');
const { bundlePatchRel, verifyBundleDir } = require('../../profile-bundle-heal');
const { compareVersions } = require('./versions');

// 同步进 profile 的固定文件清单（旧 main.js copyFiles / 同步脚本 PLUGIN_FILES）。
// 根目录平铺布局的第三方插件（如 dsh-synapse：入口 index.js/client.js 与
// app.js/styles.css/deepseek-mark.svg 同目录散件，index.js 经 import.meta.url
// 相对路径读取，不可挪入子目录）也在此登记；存在才拷，对其他插件零影响。
const PLUGIN_FILES = [
  'package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh.md',
  'lib/index.js', 'lib/index.mjs', 'lib/client.js', 'lib/vlm.js', 'lib/typert.host.js', 'lib/typert.host.d.ts',
  'dsh.plugin.json',
  'index.js', 'client.js', 'app.js', 'styles.css', 'deepseek-mark.svg',
];

// 配套插件引用了不在 dsh 核心依赖闭包里的 npm 包时（例如 dsh-better-sidebar
// 使用的 schemastery / cosmokit），把内置副本一并落到 profile web node_modules，
// 保证 bundle 的宿主端能在 profile 内解析到这些依赖。
const VENDOR_DEPS = ['schemastery', 'cosmokit', '@standard-schema/spec'];

// 新 patch 文件的头部（旧实现两种入口逐字一致）。
const PATCH_HEADER = '# dsh web profile patch（由 DSH Desktop 维护）\n';

// billion-context-dsh（compaction-acp）是模型驱动的 ACP 压缩后端：同一 realm
// 内与 dsh 默认的 compaction-basic 不能并存（插件 README 的官方安装说明）。
const ACP_DISABLE_BLOCK = '\n# billion-context-dsh：禁用 preset realm 的 compaction-basic（ACP 模型驱动后端接管压缩决策）\n- id: compaction-basic\n  disabled: true\n';

// 桌面宠物（harness-pet）默认关闭：客户端常驻 rAF 逐帧绘制 canvas，插件级
// disabled 条目一票否决任何已保存状态（可在 设置 → 插件 → 管理 一键开启）。
const PET_DISABLE_BLOCK = '\n# harness-pet：桌面宠物默认关闭（设置 → 插件 → 管理 可一键开启）\n- id: harness-pet\n  disabled: true\n';

// ---------------------------------------------------------------------------
// 目录/文件清理
// ---------------------------------------------------------------------------

/** 正则字面量转义（插件 id 拼进正则前必须转义；防御性收口）。 */
function escRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 patch 文本提取「插件管理卸载标记」的插件 id（纯文本扫描，唯一实现，
 * main.js 与同步脚本共用）。标记形态由 scripts/plugin-manager-patch.js 写入：
 * 顶层 `- id: X` 条目（缩进 0-2）内带 `removed: true` 行；insert 块内层条目
 * （缩进 >= 4）不参与匹配。YAML 损坏时也按标记形状识别——旧 main.js 实现经
 * js-yaml 解析，解析失败会丢全部标记、把已卸载插件重新装回，纯文本提取在
 * 该失败边缘更稳健；正常文件行为与旧实现一致。
 * @param {string} patch cordis.patch.yml 原文
 * @returns {Set<string>}
 */
function removedPluginIdsFromPatch(patch) {
  const ids = new Set();
  const text = String(patch || '');
  const entryRe = /(?:^|\n)([ \t]{0,2})- id:[ \t]*([A-Za-z0-9_.-]+)([\s\S]*?)(?=(?:\n[ \t]{0,2}- id:)|(?:\n[ \t]{0,2}- insert:)|\s*$)/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) {
    if (/(?:^|\n)[ \t]{0,2}removed[ \t]*:[ \t]*true\b/i.test(m[3])) ids.add(m[2]);
  }
  return ids;
}

/**
 * 清理历史版本遗留的旧包名（私有 + 描述含 "DSH Desktop" 的才动，避免误删
 * 用户自己安装或官方预设依赖的同名包）。
 * @param {string} profileModules profiles/web/node_modules/@deepseek-ai
 * @param {Set<string>} expectedDirs 当前配套插件目录名集合
 * @param {Object} hooks
 * @param {(msg:string)=>void} [hooks.log]      正常清理日志
 * @param {(msg:string)=>void} [hooks.fail]     清理失败日志
 * @param {(msg:string)=>void} [hooks.plan]     dry-run 计划输出
 * @param {boolean} [hooks.dryRun]
 */
function removeStaleCompanionPlugins(profileModules, expectedDirs, hooks = {}) {
  const { log, fail, plan, dryRun = false } = hooks;
  let entries;
  try { entries = fs.readdirSync(profileModules, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory() || expectedDirs.has(entry.name)) continue;
    const pkgPath = path.join(profileModules, entry.name, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }
    if (pkg && pkg.private === true && typeof pkg.description === 'string' && /DSH Desktop/.test(pkg.description)) {
      if (dryRun) {
        if (plan) plan('dry-run: 将清理过期配套插件 ' + entry.name);
        continue;
      }
      try {
        fs.rmSync(path.join(profileModules, entry.name), { recursive: true, force: true });
        if (log) log('已清理过期配套插件: ' + entry.name);
      } catch (err) {
        if (fail) fail('清理过期配套插件失败 ' + entry.name + ': ' + err.message);
      }
    }
  }
}

/**
 * 移除旧版 @deepseek-ai/dsh-plugin-marketplace 的同步副本（v0.3.5 起插件市场
 * 整体切换为 zat-dsh-engine）。
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

/** 从 patch 文本移除旧插件市场的 insert 条目（纯函数，幂等）。 */
function removeLegacyMarketplacePatchLines(patch) {
  const before = patch;
  const text = patch.replace(/^\s*-\s*insert:\s*$\n^\s*-\s*id:\s*plugin-marketplace\s*$\n^\s*name:\s*['"]@deepseek-ai\/dsh-plugin-marketplace['"]\s*$\n?/gm, '');
  return { patch: text, changed: text !== before };
}

// ---------------------------------------------------------------------------
// 目录级同步（递归比对 size+mtime，一致时跳过，避免每次启动全量递归复制；
// cpSync 必须保留时间戳，否则跳过比对永远不成立）
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
// 补丁文本变换（纯函数）
// ---------------------------------------------------------------------------

/**
 * 幂等写入默认禁用条目（compaction-basic / harness-pet）。
 * patch 中已存在该 id（含用户手写的 disabled 块）则不动，尊重用户配置。
 * @param {string} patch 当前 patch 文本（读取失败调用方传 ''）
 * @param {RegExp} idPattern 条目 id 存在性判定（含用户手写形态）
 * @param {string} block 待追加的禁用条目块（以 \n 开头，trim 后用于 []/空文件形态）
 * @returns {{ patch: string, changed: boolean }}
 */
function ensureDisabledPatchEntry(patch, idPattern, block) {
  if (idPattern.test('\n' + patch)) return { patch, changed: false };
  if (/^\s*\[\]\s*$/m.test(patch)) return { patch: patch.replace(/\[\]/m, block.trim()), changed: true };
  if (patch.trim() === '') return { patch: PATCH_HEADER + block.trim(), changed: true };
  return { patch: patch.replace(/\s*$/, '\n') + block, changed: true };
}

/**
 * 把非 bundle 配套插件注册进 profile patch 层（幂等，纯文本函数）。
 * 规则（与旧 main.js 实现逐字一致，同步脚本一并收口到这里）：
 *   1. bundle 化插件 / 源缺失插件的旧注册行按 dropBlocksByIds 语义移除
 *      （用户手写的 config/disabled 覆盖条目原样保留）；
 *   2. id 已存在 → 只做 name 就地改名（不动用户其它行）；
 *   3. id 未出现 → 追加 insert 条目；[] 占位 / 空文件 / 正常文件三种形态
 *      与旧实现逐字一致；
 *   4. removedIds（插件管理「卸载」标记）显式跳过：不写任何注册。历史上
 *      靠「removed 标记条目仍在同一文件里」被 id 存在性检查侥幸挡住，
 *      契约不显式；现在由调用方显式传入，标记条目被其它写入方重写时
 *      也不会把已卸载插件重新 insert。
 * @param {string} patch 当前 patch 文本（读取失败调用方传 ''）
 * @param {Object} opts
 * @param {Array<{id:string,name:string}>} opts.plugins
 * @param {Set<string>} opts.bundleNames   已按 bundle 装配的包名
 * @param {Set<string>} opts.missingNames  源缺失/校验失败的包名
 * @param {Set<string>} [opts.removedIds]  插件管理「卸载」标记的插件 id（跳过注册）
 * @param {(msg:string)=>void} [opts.onDrop]  移除残留注册行日志
 * @param {(msg:string)=>void} [opts.onEntry] 改名/新增条目日志
 * @returns {{ patch: string, changed: boolean, dropped: string[], updated: string[], added: string[] }}
 */
function registerCompanionPatchEntries(patch, opts) {
  const { plugins, bundleNames, missingNames, removedIds, onDrop, onEntry } = opts;
  let text = patch;
  let changed = false;
  const dropped = [];
  const updated = [];
  const added = [];

  // bundle 迁移自愈（issue #17 同族）：旧版本把后来升级为 bundle 的配套插件
  // 当非 bundle 写进了 patch（insert 行）；插件现经 dsh.profile.bundles 装配，
  // 残留注册行会造成同 id 双登记 → cordis loader "duplicate loader entry id" →
  // 整树加载失败。幂等移除命中的注册行/块；用户手写的 config 覆盖/disabled
  // 禁用条目由 dropBlocksByIds 语义原样保留。
  const bundleIds = new Set();
  for (const p of plugins) {
    if (bundleNames.has(p.name)) bundleIds.add(p.id);
  }
  if (bundleIds.size > 0 && text.includes('- id:')) {
    const migration = dropBlocksByIds(text, [...bundleIds]);
    if (migration.removed.length > 0) {
      text = migration.text;
      changed = true;
      const ids = [...new Set(migration.removed)];
      dropped.push(...ids);
      if (onDrop) onDrop('已把 bundle 插件移出 profile patch（避免双登记）: ' + ids.join(', '));
    }
  }
  // 源缺失插件的旧注册残留同样移除：不清理的话 loader 仍会尝试加载
  // 不存在的包；用户手写的 config/disabled 覆盖条目原样保留。
  if (missingNames.size > 0 && text.includes('- id:')) {
    const missingIds = plugins.filter((p) => missingNames.has(p.name)).map((p) => p.id);
    if (missingIds.length > 0) {
      const drop = dropBlocksByIds(text, missingIds);
      if (drop.removed.length > 0) {
        text = drop.text;
        changed = true;
        dropped.push(...drop.removed);
        if (onDrop) onDrop('已把源缺失插件移出 profile patch（避免注册不存在的包）: ' + [...new Set(drop.removed)].join(', '));
      }
    }
  }
  for (const p of plugins) {
    // 插件管理「卸载」标记：跳过一切注册（契约显式化；removed 标记条目自身
    // 由插件管理模块维护，本函数不触碰）。
    if (removedIds && removedIds.has(p.id)) continue;
    if (bundleNames.has(p.name)) continue;
    // 源缺失：不写任何注册（复制循环已跳过它），避免「注册了但包不存在」
    // 导致 dsh web 启动崩溃。
    if (missingNames.has(p.name)) continue;
    // 插件 id 拼进正则前转义（当前清单 id 均为安全标识符，防御性收口，
    // 与 plugin-manager-patch 的白名单防御一致）。
    const reId = escRegExp(p.id);
    // 该 id 在 patch 里已存在：若它现在的 name 与当前版本不一致（例如终端
    // 包改名 @deepseek-ai/dsh-terminal → dsh-terminal-tab），就地改名为当前
    // 值。只改 name 行，不动用户自己加的其它行。id 边界用负向断言
    // (?![A-Za-z0-9_.-]) 替代 \b：\b 会把 "dsh-terminal" 误命中
    // "dsh-terminal-tab"（- 是非词字符构成边界）（issue #87）。
    const idNameRe = new RegExp('(id:\\s*' + reId + '(?![A-Za-z0-9_.-])[^\\n]*\\n\\s*name:\\s*\\x27)([^\\x27]*)(\\x27)');
    const m = text.match(idNameRe);
    if (m) {
      if (m[2] !== p.name) {
        text = text.replace(idNameRe, '$1' + p.name + '$3');
        changed = true;
        updated.push(p.id);
        if (onEntry) onEntry('已更新补丁条目 ' + p.id + ': ' + m[2] + ' → ' + p.name);
      }
      continue;
    }
    // 尊重用户已有配置：id 只要出现过（例如用户手写的 disabled 条目）就不再
    // 自动插入，避免「禁用后下次启动又被加回来」或同 id 重复条目导致 loader 报错。
    if (new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*' + reId + '(?![A-Za-z0-9_.-])').test('\n' + text)) {
      continue;
    }
    const block = `- insert:\n    - id: ${p.id}\n      name: '${p.name}'\n`;
    if (/^\s*\[\]\s*$/m.test(text)) text = text.replace(/\[\]/m, block);
    else if (text.trim() === '') text = PATCH_HEADER + block;
    else text = text.replace(/\s*$/, '\n') + block;
    changed = true;
    added.push(p.id);
    if (onEntry) onEntry('已添加补丁条目 ' + p.id + ' → ' + p.name);
  }
  return { patch: text, changed, dropped, updated, added };
}

// ---------------------------------------------------------------------------
// 插件文件同步（复制 + bundle 校验）
// ---------------------------------------------------------------------------

/**
 * 把配套插件从 assets/plugins 同步进 profile web node_modules，并校验 bundle
 * 完整性。与旧 main.js syncCompanionPlugins 的复制段逐字一致；同步脚本的
 * dry-run 计划输出与逐条告警文案经 hooks 注入。
 * @param {Object} opts
 * @param {Array<{id:string,name:string}>} [opts.plugins]
 * @param {string} opts.assetsRoot  assets/plugins 目录
 * @param {string} opts.profileDir  profiles/web 目录
 * @param {string} opts.vendorRoot   壳 node_modules（VENDOR_DEPS 源目录）
 * @param {(msg:string)=>void} [opts.log]           常规日志
 * @param {(msg:string)=>void} [opts.fail]          告警日志
 * @param {(name:string, srcDir:string)=>void} [opts.onMissingSource]
 * @param {(srcFile:string, err:Error)=>void} [opts.onCopyFail]
 * @param {(name:string, reason:string)=>void} [opts.onVerifyFail]
 * @param {(name:string, isBundle:boolean)=>void} [opts.onInstalled]
 * @param {(name:string)=>void} [opts.onVendorSynced]
 * @param {(msg:string)=>void} [opts.plan]          dry-run 计划输出
 * @param {boolean} [opts.dryRun]
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
  const expectedDirs = new Set(plugins.map(companionDirName));
  removeStaleCompanionPlugins(profileModules, expectedDirs, { log, fail, plan, dryRun });
  removeLegacyMarketplaceDir(path.join(profileDir, 'node_modules'), { log, fail, plan, dryRun });

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
  // 源缺失的配套插件（用户从 assets 删除 / 开发中裁剪 / 安装包损坏）：
  // 既不能复制、也无法从源码确认 bundle 身份。处理原则：缺失源一律不写
  // patch 注册（否则「注册了但包不存在」会让 dsh web 启动崩溃）；若 manifest
  // 仍登记为 bundle，则视为用户意图禁用，从 bundles 移除。
  const missingNames = new Set();
  for (const p of plugins) {
    const sdir = path.join(assetsRoot, companionDirName(p));
    if (!fs.existsSync(path.join(sdir, 'package.json'))) {
      missingNames.add(p.name);
      if (onMissingSource) onMissingSource(p.name, sdir);
    }
  }
  for (const p of plugins) {
    // 插件管理「卸载」标记（removed: true）：已卸载插件不复制、不装配，
    // 避免「卸载后一重启又被复活」。bundle 登记也跳过（manifest 移除由调用方处理）。
    if (removedIds && removedIds.has(p.id)) continue;
    const rel = companionDirName(p);
    const src = path.join(assetsRoot, rel);
    if (!fs.existsSync(path.join(src, 'package.json'))) continue;
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')); } catch {}
    const isBundle = bundlePatchRel(pkg) !== '';
    // @deepseek-ai 与 @dsh-external 两种 scope 都按包名落到 profile 的
    // node_modules 下；配套包自身的依赖由 dsh 的 profiles/node_modules
    // fallback（healProfilesModuleFallback）解析。
    const dest = path.join(profileModules, '..', p.name);
    // 用户已把插件更新到比安装包更新的版本（插件管理器「更新」）→ 保留
    // profile 副本，否则每次启动会把更新版本覆盖回安装包版本。
    if (!dryRun) {
      try {
        const aPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
        const dPkgFile = path.join(dest, 'package.json');
        if (aPkg && aPkg.version && fs.existsSync(dPkgFile)) {
          const dPkg = JSON.parse(fs.readFileSync(dPkgFile, 'utf8'));
          if (dPkg && dPkg.version && compareVersions(dPkg.version, aPkg.version) > 0) {
            if (log) log('插件 ' + p.id + ' 版本 ' + dPkg.version + ' 高于安装包 ' + aPkg.version + '，保留更新版本');
            if (isBundle) bundleNames.add(p.name); // manifest 登记不因保留而缺失
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
      // 逐文件比对大小+mtime，一致则跳过复制，避免每次启动都写盘。注意
      // fs.copyFileSync 不保留时间戳（复制的目标 mtime=现在），会让比对永远
      // 不成立；这里用 cpSync + preserveTimestamps 写，保证第二次启动能命中跳过。
      try {
        const sst = fs.statSync(sf);
        const dst = fs.statSync(df);
        if (dst.size === sst.size && Math.round(dst.mtimeMs) === Math.round(sst.mtimeMs)) continue;
      } catch { /* 目标缺失或不可读 → 照常复制 */ }
      try {
        fs.cpSync(sf, df, { force: true, preserveTimestamps: true });
      } catch (err) {
        if (onCopyFail) onCopyFail(sf, err);
      }
    }
    // 完整同步插件自带的 lib/assets/src/dist/node_modules 目录：第三方插件
    // 的懒加载 chunk、动画素材、dist 构建产物与随包分发的私有依赖
    // （如 billion-context-dsh 的 acp-kernel）不都落在固定文件清单里。
    // public 是 webServer 静态资源目录（dsh-mini 手机桥页面等），同样必须
    // 随包同步，否则插件 webServer 挂载时找不到静态页面。gui 是 dsh-mini
    // v1.4+ 的手机 GUI 静态产物（manifest.json + bundles + dist），缺失时
    // 手机端只能看到上游内置的「未携带 gui/ 资产」报错页。
    for (const sub of ['lib', 'client', 'data', 'assets', 'src', 'dist', 'public', 'gui', 'node_modules']) {
      syncDir(path.join(src, sub), path.join(dest, sub), log);
    }
    // 落盘后校验 bundle 完整性：dsh 装配时会读取补丁层与入口文件，任一缺失
    // 都会让整棵插件树加载失败。校验失败按「源缺失」处理：不注册、从
    // manifest 移除登记、日志告警，下次启动重试。
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
  PET_DISABLE_BLOCK,
  removeStaleCompanionPlugins,
  removeLegacyMarketplaceDir,
  removeLegacyMarketplacePatchLines,
  removedPluginIdsFromPatch,
  ensureDisabledPatchEntry,
  registerCompanionPatchEntries,
  syncCompanionFiles,
};
