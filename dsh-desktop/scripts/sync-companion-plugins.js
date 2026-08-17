'use strict';

// 把 DSH Desktop 的配套插件同步进任意 dsh 的 web profile（独立于 Electron 壳，
// 同步逻辑与 main.js 的 syncCompanionPlugins 共用 scripts/lib/companion-profile.js
// 的同一实现），并顺带把壳内置的 Agent 预设（assets/agent-presets）同步进能找到
// 的 dsh 包 config/agent-presets，避免 WSL / Linux 里的 dsh 模式列表比 Windows
// 内置 dsh 少。典型用途：把自己 WSL / Linux 里另装的 dsh（checkout 开发版或
// npm 版）也配上壳自带的插件（余额、文件改动视图、终端、浮窗、插件市场、
// 自定义提示词、第三方思考、识图等）。
//
// 用法（WSL / Linux / Windows 均可执行）：
//   node scripts/sync-companion-plugins.js [DSH_HOME] [--with-patches] [--dry-run] [--dsh-package <目录>]
//     DSH_HOME       目标 dsh 数据目录，默认 ~/.dsh
//     --with-patches 额外应用两个运行时补丁（会话列表闪跳修复、
//                    dsh-prompt / 第三方思考设置暴露白名单）
//     --dry-run      只打印将要做的事，不落盘
//     --dsh-package  内置 Agent 预设的目标 dsh 包目录（缺省自动探测
//                    <DSH_HOME>/agent 与 PATH 上的 dsh 命令）
//
// 生效方式：同步只落盘；dsh web 在启动时读取 profile 补丁层与包内预设目录，
// 因此需要重启 WSL 里的 dsh web 后插件才会挂载（checkout 开发模式
// `pnpm dsh web`，npm 安装版 `dsh web`）。注意：重启 dsh web 会中断当前正在
// 跑的会话（会话数据在磁盘上，重启后可继续）。
//
// 卸载：从 <DSH_HOME>/profiles/web/cordis.patch.yml 删掉对应 insert 条目，
// 并删掉 <DSH_HOME>/profiles/web/node_modules/@deepseek-ai/dsh-* 目录即可。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { installBuiltinPresets } = require('./install-minimal-win-preset');
const { COMPANION_PLUGINS } = require('./lib/companion-plugins');
const { writeFileAtomic } = require('./lib/patch-io');
const { applyPatchToFiles } = require('./lib/patch-engine');
const {
  FLASH_PKG_REL, EXPOSE_PKG_REL, patchTargets,
  transformFlashFix, transformExposeFix,
} = require('./lib/runtime-patches');
const {
  ACP_DISABLE_BLOCK, PET_DISABLE_BLOCK,
  ensureDisabledPatchEntry, removeLegacyMarketplacePatchLines,
  registerCompanionPatchEntries, syncCompanionFiles, removedPluginIdsFromPatch,
} = require('./lib/companion-profile');

function log(msg) {
  console.log('[sync] ' + msg);
}

function warn(msg) {
  console.warn('[sync] ⚠ ' + msg);
}

// ---------------------------------------------------------------------------
// 内置 Agent 预设同步：Windows 打包产物由 npm start / after-pack 直接写入
// 内置 dsh 包；WSL / Linux 里另装的 dsh 是干净的 npm 包，缺少壳自带的 8 个
// 模式预设。这里把 assets/agent-presets 幂等复制进 dsh 包的
// config/agent-presets，让两端模式列表一致。
// ---------------------------------------------------------------------------

function isDshPackageDir(dir) {
  if (!dir) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg && pkg.name === '@deepseek-ai/dsh';
  } catch { return false; }
}

function packageDirFromBin(binPath) {
  if (!binPath) return '';
  let p = path.resolve(binPath);
  try { p = fs.realpathSync.native(p); } catch {}
  let dir = path.dirname(p);
  for (let i = 0; i < 8 && dir; i += 1) {
    if (isDshPackageDir(dir)) return dir;
    // npm global 的 shim 在 <prefix> 目录，真正的包在 <prefix>/node_modules 下。
    const nested = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh');
    if (isDshPackageDir(nested)) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
}

function commandLocations(cmd) {
  try {
    const win = process.platform === 'win32';
    const res = spawnSync(win ? 'where.exe' : 'sh', win ? [cmd] : ['-lc', `command -v ${cmd} 2>/dev/null || true`], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.status !== 0) return [];
    return (res.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function findDshPackageDir(home, explicit) {
  if (explicit) {
    const dir = path.resolve(explicit);
    return isDshPackageDir(dir) ? dir : '';
  }
  const candidates = [
    path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh'),
    path.join(home, 'node_modules', '@deepseek-ai', 'dsh'),
  ];
  for (const dir of candidates) {
    if (isDshPackageDir(dir)) return dir;
  }
  for (const location of commandLocations('dsh')) {
    const dir = packageDirFromBin(location);
    if (dir) return dir;
  }
  return '';
}

function syncBuiltinPresets(home, dshPackageArg, dryRun) {
  const dshPkgDir = findDshPackageDir(home, dshPackageArg);
  if (!dshPkgDir) {
    if (dshPackageArg) warn(`--dsh-package 未找到有效的 @deepseek-ai/dsh 包: ${dshPackageArg}`);
    else log('未找到 dsh 包（@deepseek-ai/dsh），跳过内置 Agent 预设同步；可用 --dsh-package <目录> 显式指定');
    return;
  }
  if (dryRun) {
    log(`dry-run: 将同步内置 Agent 预设（assets/agent-presets）→ ${path.join(dshPkgDir, 'config', 'agent-presets')}`);
    return;
  }
  try {
    const dests = installBuiltinPresets(dshPkgDir);
    log(`已同步 ${dests.length} 个内置 Agent 预设 → ${dshPkgDir}: ${dests.map((d) => path.basename(d)).join(', ')}`);
  } catch (err) {
    warn('内置 Agent 预设同步失败: ' + (err && err.message ? err.message : err));
  }
}

// ---------------------------------------------------------------------------
// 插件同步（与 main.js syncCompanionPlugins 共用同一实现；dry-run 时只读不改）
// ---------------------------------------------------------------------------

function syncPlugins(home, dryRun) {
  const profileDir = path.join(home, 'profiles', 'web');
  if (dryRun) {
    log(`dry-run: 目标 profile ${profileDir}`);
  }
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  let patch = '';
  try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
  // 插件管理「卸载」标记（removed: true 的顶层条目）：与 main.js 同一语义，
  // 本次同步跳过文件复制与注册，避免 CLI 把用户在桌面端卸载的插件装回。
  const removedIds = removedPluginIdsFromPatch(patch);
  // 文件同步 + 过期清理 + bundle 完整性校验（共享实现，文案经 hooks 注入，
  // 与旧版本脚本输出逐字一致）。
  const { bundleNames, missingNames } = syncCompanionFiles({
    assetsRoot: path.join(__dirname, '..', 'assets', 'plugins'),
    profileDir,
    vendorRoot: path.join(__dirname, '..', 'node_modules'),
    removedIds,
    dryRun,
    log: (m) => log(m),
    fail: (m) => warn(m),
    plan: (m) => log(m),
    onMissingSource: (name, srcDir) => warn(`跳过（找不到源）: ${name}（${srcDir}）`),
    onCopyFail: (sf, err) => warn('同步配套插件文件失败 ' + sf + ': ' + err.message),
    onVerifyFail: (name, reason) => warn(`已复制但校验失败（不注册为 bundle）: ${name} —— ${reason}`),
    onInstalled: (name, isBundle) => log(`已安装 ${name}${isBundle ? '（bundle 插件）' : ''}`),
    onVendorSynced: (name) => log(`已同步私有依赖 ${name}`),
  });

  // Bundle 插件注册进 profile manifest 的 dsh.profile.bundles（dsh 启动时读取
  // 包内 cordis.patch.yml）。本脚本不凭空创建 manifest（会顶替 dsh 的 profile
  // 初始化导致全新 DSH_HOME 首次启动失败）：只有 manifest 已存在且已有 bundles
  // 数组时才追加；否则交给 dsh 首次启动初始化，下次运行本脚本再注册。
  const manifestFile = path.join(profileDir, 'package.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { manifest = null; }
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest) &&
      manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)) {
    for (const name of bundleNames) {
      if (manifest.dsh.profile.bundles.includes(name)) continue;
      if (dryRun) {
        log(`dry-run: 将把 bundle 插件加入 profile bundles: ${name}`);
        continue;
      }
      manifest.dsh.profile.bundles.push(name);
      writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      log(`已把 bundle 插件加入 web profile bundles: ${name}`);
    }
    // 源缺失 / 校验失败的 bundle 若仍登记在 manifest，会让 dsh 启动崩溃：
    // 幂等移除登记（视为用户禁用），包文件保留，下次运行本脚本重试。
    if (missingNames.size > 0) {
      const before = manifest.dsh.profile.bundles.length;
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((n) => !missingNames.has(n));
      if (manifest.dsh.profile.bundles.length !== before) {
        if (dryRun) {
          log('dry-run: 将把源缺失/校验失败的 bundle 移出 profile bundles: ' + [...missingNames].join(', '));
        } else {
          writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
          log('已把源缺失/校验失败的 bundle 移出 profile bundles: ' + [...missingNames].join(', '));
        }
      }
    }
  } else if (bundleNames.size > 0) {
    log('profile manifest 尚无 bundles（可能尚未初始化），bundle 插件留待下次运行注册');
  }

  // 非 bundle 插件注册到 profile 补丁层（共享实现：幂等、尊重用户已有条目、
  // bundle 迁移去重、源缺失残留移除与卸载标记跳过；旧插件市场条目一并清理）。
  // patch 文本沿用函数入口的快照（文件同步/清单步骤不改写 patch），最后统一
  // 原子写一次。
  const reg = registerCompanionPatchEntries(patch, {
    plugins: COMPANION_PLUGINS,
    bundleNames,
    missingNames,
    removedIds,
    onDrop: (m) => log(m),
    onEntry: (m) => log(m),
  });
  patch = reg.patch;
  let changed = reg.changed;
  const marketplace = removeLegacyMarketplacePatchLines(patch);
  patch = marketplace.patch;
  if (marketplace.changed) {
    changed = true;
    log('已从 cordis.patch.yml 移除旧插件市场条目');
  }

  // billion-context-dsh（compaction-acp）是模型驱动的 ACP 压缩后端：同一
  // realm 内与 dsh 默认的 compaction-basic 不能并存（插件 README 的官方
  // 安装说明）。幂等写入禁用条目：patch 中已存在 compaction-basic 条目
  // （含用户手写的 disabled 块）则不动，尊重用户配置。
  if (bundleNames.has('billion-context-dsh')) {
    const acp = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-basic\\b'), ACP_DISABLE_BLOCK);
    if (acp.changed) {
      patch = acp.patch;
      changed = true;
      if (dryRun) log(`dry-run: 将向 ${patchFile} 写入 compaction-basic 禁用条目`);
      else log('已写入 compaction-basic 禁用条目（billion-context-dsh 接管压缩后端）');
    } else {
      log('compaction-basic 禁用条目已存在（跳过）');
    }
  }

  // 桌面宠物（harness-pet）默认关闭：客户端常驻 rAF 逐帧绘制 canvas 是
  // 软渲染/流式输出下的持续阻塞源（issue #34），且旧版保存的开关值会覆盖
  // 客户端默认。插件级 disabled 条目一票否决任何已保存状态；需要时可在
  // 设置 → 插件 → 管理 一键开启。幂等：已存在 harness-pet 条目则不动。
  if (bundleNames.has('harness-pet')) {
    const pet = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*harness-pet\\b'), PET_DISABLE_BLOCK);
    if (pet.changed) {
      patch = pet.patch;
      changed = true;
      if (dryRun) log(`dry-run: 将向 ${patchFile} 写入 harness-pet 禁用条目`);
      else log('已写入 harness-pet 禁用条目（桌面宠物默认关闭）');
    } else {
      log('harness-pet 禁用条目已存在（跳过）');
    }
  }

  if (changed) {
    if (dryRun) log(`dry-run: 将写入 ${patchFile}`);
    else {
      writeFileAtomic(patchFile, patch);
      log(`已写入 ${patchFile}`);
    }
  } else {
    log('补丁层无变化（全部条目已存在）');
  }
}

// ---------------------------------------------------------------------------
// 运行时补丁（与 main.js applyRuntimeFlashFix / applyPromptExposeFix 共用
// scripts/lib/runtime-patches.js 的同一变换）：覆盖 profile fallback 与壳托管
// 安装目录 agent 两份副本；bundle 初始化后的 dsh 安装（npm 版）两份副本通常
// 互为同一文件（fallback 符号链接写穿），幂等。
// ---------------------------------------------------------------------------

function applyRuntimePatches(home, dryRun) {
  // 会话列表刷新闪跳修复（mergeOrderedBaseline 保留本地新会话）。
  applyPatchToFiles({
    prefix: 'runtime 补丁',
    files: patchTargets(home, FLASH_PKG_REL),
    log: (m) => log(m),
    anchorLog: (m) => warn(m),
    transform: (src) => transformFlashFix(src),
    alreadyLog: (file) => '已应用，跳过 ' + file,
    doneLog: (file) => '已应用会话列表闪跳修复 ' + file,
    donePrefix: false,
    failLog: (file, err) => 'runtime 补丁失败(' + file + '): ' + err.message,
    dryRun,
    dryRunChangedLog: (file) => 'dry-run: 将应用会话列表闪跳修复 ' + file,
  });

  // 设置暴露白名单补丁（dsh-prompt / 第三方思考 / 识图 / 会话调整）。
  applyPatchToFiles({
    prefix: '提示词暴露补丁',
    files: patchTargets(home, EXPOSE_PKG_REL),
    log: (m) => log(m),
    anchorLog: (m) => warn(m),
    transform: transformExposeFix,
    alreadyLog: (file) => '已应用，跳过 ' + file,
    doneLog: (file, note) => '已把 ' + note.join(', ') + ' 加入设置白名单 ' + file,
    donePrefix: false,
    failLog: (file, err) => '提示词暴露补丁失败(' + file + '): ' + err.message,
    dryRun,
    dryRunChangedLog: (file, note) => 'dry-run: 将把 ' + note.join(', ') + ' 加入设置白名单 ' + file,
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const dshPkgIdx = args.indexOf('--dsh-package');
  let dshPackageArg = '';
  if (dshPkgIdx >= 0) {
    dshPackageArg = args[dshPkgIdx + 1] || '';
    if (!dshPackageArg || dshPackageArg.startsWith('--')) {
      warn('--dsh-package 需要一个目录参数，本次忽略');
      dshPackageArg = '';
    }
  }
  const homeArg = args.find((a) => !a.startsWith('--') && a !== dshPackageArg);
  const home = path.resolve(homeArg || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
  const withPatches = args.includes('--with-patches');
  const dryRun = args.includes('--dry-run');

  console.log(`[sync] 目标 DSH_HOME: ${home}${dryRun ? '（dry-run，不落盘）' : ''}`);
  if (!fs.existsSync(home)) {
    if (dryRun) {
      warn(`目标目录不存在: ${home}（dry-run 仍继续输出计划）`);
    } else {
      // 与 Windows 壳一致：同步先于 dsh 首次启动也没问题，目录链会自动创建。
      warn(`目标目录不存在，将自动创建: ${home}`);
      fs.mkdirSync(home, { recursive: true });
    }
  }
  syncPlugins(home, dryRun);
  syncBuiltinPresets(home, dshPackageArg, dryRun);
  if (withPatches) applyRuntimePatches(home, dryRun);
  console.log('[sync] 完成。');
  console.log('[sync] 提示：插件与内置 Agent 预设在 dsh web 启动时才会挂载 —— 请重启 WSL 里的 dsh web：');
  console.log('[sync]   checkout 开发模式:  cd <harness 目录> && pnpm dsh web');
  console.log('[sync]   npm 安装版:        dsh web');
  console.log('[sync]   重启会中断当前正在跑的会话；会话数据在磁盘上，重启后可继续。');
}

main();
