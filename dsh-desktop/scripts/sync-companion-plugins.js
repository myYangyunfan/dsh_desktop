'use strict';

// 把 DSH Desktop 的配套插件同步进任意 dsh 的 web profile（独立于 Electron 壳，
// 同步逻辑与 main.js 的 syncCompanionPlugins 共用 scripts/lib/companion-profile.js
// 的同一实现），并顺带把壳内置的 Agent 预设（assets/agent-presets）同步进
// <DSH_HOME>/.agent-presets（内核 0.1.2-alpha.1 起 dsh-agent-presets 的用户预设
// 根），避免 WSL / Linux 里的 dsh 模式列表比 Windows 内置 dsh 少。典型用途：
// 把自己 WSL / Linux 里另装的 dsh（checkout 开发版或 npm 版）也配上壳自带的
// 插件（余额、文件改动视图、终端、浮窗、插件市场、自定义提示词、第三方思考、
// 识图等）。
//
// 用法（WSL / Linux / Windows 均可执行）：
//   node scripts/sync-companion-plugins.js [DSH_HOME] [--with-patches] [--dry-run] [--dsh-package <目录>]
//     DSH_HOME       目标 dsh 数据目录，默认 ~/.dsh
//     --with-patches 额外应用运行时补丁（会话列表闪跳、设置暴露白名单、
//                    shell description 可选化、会话日志尾部恢复、keyed slot 兼容）
//     --dry-run      只打印将要做的事，不落盘
//     --dsh-package  profile manifest 对账的目标 dsh 包目录（缺省自动探测
//                    <DSH_HOME>/agent 与 PATH 上的 dsh 命令）
//
// 生效方式：同步只落盘；dsh web 在启动时读取 profile 补丁层与 <DSH_HOME>/
// .agent-presets 预设目录，因此需要重启 WSL 里的 dsh web 后插件才会挂载
// （checkout 开发模式 `pnpm dsh web`，npm 安装版 `dsh web`）。注意：重启 dsh
// web 会中断当前正在跑的会话（会话数据在磁盘上，重启后可继续）。
//
// 卸载：从 <DSH_HOME>/profiles/web/cordis.patch.yml 删掉对应 insert 条目，
// 并删掉 <DSH_HOME>/profiles/web/node_modules/@deepseek-ai/dsh-* 目录即可。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installBuiltinPresets } = require('./install-minimal-win-preset');
const { COMPANION_PLUGINS } = require('./lib/companion-plugins');
const { CORE_BUNDLE_NAMES } = require('../profile-manifest');
const { writeFileAtomic } = require('./lib/patch-io');
const { applyAll } = require('./integration/patch-runner');
const { getSpecsByCli } = require('./lib/patch-registry');
const { reconcileProfileBundles, createEntryListYamlParser } = require('./lib/profile-reconcile');
const { quotePatchScalarValues } = require('./plugin-core/lib/patch-surgery');
const { PluginStateStore } = require('./plugin-core/lib/state-store');
const { syncHubRecognition } = require('./lib/hub-registry');
const {
  ACP_SELF_DISABLE_BLOCK, PET_DISABLE_BLOCK,
  removeAcpBasicDisableBlock,
  ensureDisabledPatchEntry, removeLegacyMarketplacePatchLines,
  removeRetiredDshMarketPatchRows, removeRetiredThirdPartyThinkingPatchRows,
  removeRetiredDshFloatWindowPatchRows,
  registerCompanionPatchEntries, syncCompanionFiles, removedPluginIdsFromPatch,
} = require('./lib/companion-profile');

function log(msg) {
  console.log('[sync] ' + msg);
}

function warn(msg) {
  console.warn('[sync] ⚠ ' + msg);
}

// ---------------------------------------------------------------------------
// 内置 Agent 预设同步：0.1.2-alpha.1 起内核把内置预设移入
// @deepseek-ai/dsh-agent-presets（cordis / minimal / ptc / standard），用户预设
// 从 <DSH_HOME>/.agent-presets 发现。这里把 assets/agent-presets 幂等复制进
// <DSH_HOME>/.agent-presets，让两端（Windows 内置 / WSL·Linux 另装）模式列表
// 一致且与新版内置 roster 共存（不依赖已移除的 code / minimal-win 上游 id）。
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

// Windows 可执行扩展名（按 PATH 解析优先级）。
const WINDOWS_PATHEXT = ['.com', '.exe', '.bat', '.cmd'];

/**
 * 纯 JS 的 PATH 命令解析：不做任何子进程 spawn。
 *
 * 旧实现用 `spawnSync('where.exe')`（Windows）/ `sh -lc 'command -v'`（POSIX），
 * 在部分 Windows / Node 版本组合下会触发原生崩溃（0xC0000409 / ENOENT / exit
 * 127），且依赖系统 where.exe。改为直接扫描 process.env.PATH 各目录：
 *   - Windows：按 PATHEXT 扩展名探测，返回全部命中（对齐 where.exe -a 语义）；
 *   - POSIX：按可执行位探测，返回第一个命中（对齐 command -v 语义）。
 * 无子进程、无外部依赖、跨版本确定。
 */
function commandLocations(cmd) {
  const locations = [];
  const entries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const win = process.platform === 'win32';
  for (const dir of entries) {
    if (win) {
      // 传入的 cmd 已含扩展名则直接探测，否则按 PATHEXT 顺序试探（含无扩展名形态）。
      const names = cmd.includes('.') ? [cmd] : [cmd, ...WINDOWS_PATHEXT.map((ext) => cmd + ext)];
      for (const name of names) {
        const full = path.join(dir, name);
        try { if (fs.statSync(full).isFile()) locations.push(full); } catch { /* 该形态不存在，继续 */ }
      }
    } else {
      const full = path.join(dir, cmd);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        locations.push(full);
        break; // POSIX 与 command -v 一致：取第一个可执行
      } catch { /* 该目录无可执行，继续 */ }
    }
  }
  return [...new Set(locations)];
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

function syncBuiltinPresets(home, dryRun) {
  const destRoot = path.join(home, '.agent-presets');
  if (dryRun) {
    log(`dry-run: 将同步内置 Agent 预设（assets/agent-presets）→ ${destRoot}`);
    return;
  }
  try {
    const dests = installBuiltinPresets(home);
    log(`已同步 ${dests.length} 个内置 Agent 预设 → ${destRoot}: ${dests.map((d) => path.basename(d)).join(', ')}`);
  } catch (err) {
    warn('内置 Agent 预设同步失败: ' + (err && err.message ? err.message : err));
  }
}

// ---------------------------------------------------------------------------
// 插件同步（与 main.js syncCompanionPlugins 共用同一实现；dry-run 时只读不改）
// ---------------------------------------------------------------------------

function syncPlugins(home, dryRun, dshPkgDir) {
  const profileDir = path.join(home, 'profiles', 'web');
  if (dryRun) {
    log(`dry-run: 目标 profile ${profileDir}`);
  }
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  let patch = '';
  try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
  // #155 根因二幂等修复：`@deepseek-ai/...` 裸包名（js-yaml「bad indentation」）
  // 会让内核装配 patch 层即崩。先补引号再往下走（健康文件零改写）。
  const quoted = quotePatchScalarValues(patch);
  if (quoted.changed) {
    if (dryRun) log(`dry-run: 将为 ${patchFile} 的 @ 开头/特殊字符包名补 YAML 引号（#155 根因二）`);
    else writeFileAtomic(patchFile, quoted.text);
    patch = quoted.text;
  }
  // 插件管理「卸载」标记（removed: true 的顶层条目）：与 main.js 同一语义，
  // 本次同步跳过文件复制与注册，避免 CLI 把用户在桌面端卸载的插件装回。
  const removedIds = removedPluginIdsFromPatch(patch);
  // 卸载决策双源：patch removed 行 ∪ 家级状态存储（与壳层共用，抗 patch 重置）。
  let stateStore = null;
  try {
    stateStore = new PluginStateStore({ file: path.join(home, 'desktop-plugin-state.json'), log: (m) => log(m), readOnly: dryRun });
  } catch (err) {
    log('插件状态存储不可用，卸载决策仅按 patch 行: ' + err.message);
  }
  if (stateStore) {
    for (const id of Object.keys(stateStore.getUninstalled())) removedIds.add(id);
  }
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

  // profile manifest 装配对账（与 main.js 共用 scripts/lib/profile-reconcile.js
  // 唯一实现）：损坏备份重建（核心可解析时）、核心补齐、全量逐条校验（无效且
  // 非核心的登记移除并记入隔离记录 dsh-desktop.broken-bundles.json）、配套
  // bundle 登记追加、源缺失移除。initMissing=false 保持 CLI 历史契约：manifest
  // 文件不存在时绝不凭空创建（顶替 dsh 的 profile 初始化有风险），交由 dsh
  // 首次启动初始化，下次运行本脚本再注册。dry-run 只计算不落盘。
  // 与 main.js 同口径：插件管理「卸载」标记的配套 bundle 从 manifest 移除
  //（removedBundles，避免卸载后仍被装配）；重置恢复排除核心 + 配套（由核心
  // 补齐与配套追加步骤接管，绝不恢复用户已卸载的配套插件）。
  const companionRemoved = COMPANION_PLUGINS.filter((p) => removedIds.has(p.id)).map((p) => p.name);
  const removedBundles = new Set(companionRemoved);
  if (stateStore) {
    const companionNames = new Set(COMPANION_PLUGINS.map((p) => p.name));
    for (const [id, entry] of Object.entries(stateStore.getUninstalled())) {
      const name = entry && entry.name;
      if (name && !companionNames.has(name)) removedBundles.add(name);
      else if (!name) removedBundles.add(id);
    }
  }
  reconcileProfileBundles(profileDir, {
    installAnchorDir: dshPkgDir,
    coreNames: CORE_BUNDLE_NAMES,
    addNames: bundleNames,
    missingNames,
    removedBundles,
    excludeFromRecover: new Set([...CORE_BUNDLE_NAMES, ...COMPANION_PLUGINS.map((p) => p.name)]),
    parsePatch: createEntryListYamlParser(),
    dryRun,
    initMissing: false,
    log: (m) => log(dryRun ? 'dry-run: ' + m : m),
  });

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

  // 已退役市场 dshmarket（loader id dsh-market）：insert 内层条目 / 顶层块 /
  // marker 注释一次性清理（幂等；目录与 manifest 登记在 syncCompanionFiles 内
  // 的 removeRetiredDshMarketDir 已处理）。
  const retiredMarket = removeRetiredDshMarketPatchRows(patch);
  patch = retiredMarket.patch;
  if (retiredMarket.changed) {
    changed = true;
    log('已从 cordis.patch.yml 移除退役插件市场 dshmarket 条目');
  }

  // 已退役插件 dsh-third-party-thinking（loader id third-party-thinking）：
  // insert 内层条目 / 顶层块 / name-only 条目一次性清理（幂等；目录清理在
  // syncCompanionFiles 内的 removeRetiredThirdPartyThinkingDir 已处理）。
  const retiredTpt = removeRetiredThirdPartyThinkingPatchRows(patch);
  patch = retiredTpt.patch;
  if (retiredTpt.changed) {
    changed = true;
    log('已从 cordis.patch.yml 移除退役插件 dsh-third-party-thinking 条目');
  }

  // 已退役插件 dsh-float-window（loader id float-window）：insert 内层 / 顶层块 /
  // name-only 条目一次性清理（幂等；目录清理在 syncCompanionFiles 内的
  // removeRetiredDshFloatWindowDir 已处理）。
  const retiredFw = removeRetiredDshFloatWindowPatchRows(patch);
  patch = retiredFw.patch;
  if (retiredFw.changed) {
    changed = true;
    log('已从 cordis.patch.yml 移除退役插件 dsh-float-window 条目');
  }

  // billion-context-dsh（compaction-acp，模型驱动的 ACP 压缩后端）默认关闭：
  // 用户反馈其在上下文占用未及 1/4 时仍频繁压缩。改为随包默认禁用（harness-pet
  // 同款顶层 disabled 块一票否决 bundle 自身 insert），需要时在设置 → 插件 →
  // 管理 一键开启。同时撤销历史自动写入的 compaction-basic 禁用块、恢复内核
  // 默认压缩（billion-context-dsh 不再默认接管，两后端互斥的前提随之消失）。
  if (bundleNames.has('billion-context-dsh')) {
    const heal = removeAcpBasicDisableBlock(patch);
    if (heal.changed) {
      patch = heal.patch;
      changed = true;
      if (dryRun) log(`dry-run: 将撤销 ${patchFile} 中的 compaction-basic 禁用块`);
      else log('已撤销 compaction-basic 禁用块（恢复内核默认压缩）');
    }
    const acp = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-acp(?![A-Za-z0-9_.-])'), ACP_SELF_DISABLE_BLOCK);
    if (acp.changed) {
      patch = acp.patch;
      changed = true;
      if (dryRun) log(`dry-run: 将向 ${patchFile} 写入 compaction-acp 默认禁用条目`);
      else log('已写入 compaction-acp 禁用条目（billion-context-dsh 默认关闭）');
    }
  }

  // 桌面宠物（harness-pet）默认关闭：客户端常驻 rAF 逐帧绘制 canvas 是
  // 软渲染/流式输出下的持续阻塞源（issue #34），且旧版保存的开关值会覆盖
  // 客户端默认。插件级 disabled 条目一票否决任何已保存状态；需要时可在
  // 设置 → 插件 → 管理 一键开启。幂等：已存在 harness-pet 条目则不动。
  if (bundleNames.has('harness-pet')) {
    const pet = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*harness-pet(?![A-Za-z0-9_.-])'), PET_DISABLE_BLOCK);
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

  // hotplug-hub 识别（与 main.js 运行时同步共用 scripts/lib/hub-registry.js
  // 唯一实现；issue #156 止血后口径）：写 packs 指针包（hub lib/CLI status
  // 来源）+ 幂等清除 v0.5.3 写进 profile dependencies 的内置件脏数据（不再
  // 写入任何登记）。幂等、健康零写入；dry-run 只计算不落盘。
  syncHubRecognition({
    home,
    profileDir,
    assetsRoot: path.join(__dirname, '..', 'assets', 'plugins'),
    removedIds,
    dryRun,
    log: (m) => log(m),
  });
}

// ---------------------------------------------------------------------------
// 运行时补丁：复用 patch-runner 的 applyAll + patch-registry 的 getSpecsByCli()，
// 由 registry 的 cli:true 字段单一驱动（CLI 与 main.js 不再各持一份手写清单，
// 杜绝漂移）。0.1.2-alpha.1 起 cli:true 共 18 个补丁（slot 兼容 / 闪跳 /
// shell description / 图片字节信任 / session 持久化 / tool source 容错 /
// pi-ai 系 / token-meter / atomic-write / settings / bundle 到达重试 /
// agent-loop 调度器 / 空工具名指引等）；宿主侧识图等其余补丁 cli:false，
// 不在同步期应用。
//
// 注：runtime-flash-fix 的 doneLog 与 registry 统一为「已修复会话列表刷新闪跳」，
// 属有意修复历史文案漂移（非保持 CLI 历史文案），与 registry 单一数据源原则一致。
//
// ctx 构造：wslMode:true 走 spec.wslLayout（WSL 两份副本 profile fallback +
// agent）；appDir/userDataDir 指向 os.tmpdir() 下刻意不存在的哨兵根（含 pid，
// 唯一不可碰撞），使 resolveNmRoots 的 nm-roots 四根中仅 home 的 profile/agent
// 两根存在（等价旧 patchTargets 两份副本），其余被 applyRoot 的 existsSync
// 跳过。dry-run + donePrefix:false + anchorLog:warn 保持 CLI 历史日志契约。
// ---------------------------------------------------------------------------

function applyRuntimePatches(home, dryRun) {
  const cliCtx = {
    home,
    // 刻意不存在的哨兵根（os.tmpdir() + pid 唯一不可碰撞）：使 resolveNmRoots 的
    // appDir/userDataDir 根被 existsSync 跳过，仅保留 home 的 profile/agent 两根。
    // 用 tmpdir 而非 home 下固定名，避免与 home 下真实同名目录碰撞导致误扫描。
    appDir: path.join(os.tmpdir(), 'dsh-cli-app-' + process.pid),
    userDataDir: path.join(os.tmpdir(), 'dsh-cli-ud-' + process.pid),
    wslMode: true,
    log: (m) => log(m),
  };
  applyAll(cliCtx, getSpecsByCli(), {
    dryRun,
    donePrefix: false,
    anchorLog: (m) => warn(m),
  });
  // 空 tool-call 容错（读端 dsh-session + 写端 dsh-agent-loop）已以 tool-source-compat
  // 规格登记进 patch-registry（cli:true），由上方 applyAll(getSpecsByCli()) 统一应用。
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
  // dsh 包目录（profile manifest 对账的第一解析锚点）；定位不到时对账降级为
  // 只以 profile node_modules 为锚点。内置 Agent 预设改同步进 <DSH_HOME>/
  // .agent-presets，不再依赖 dsh 包目录。
  const dshPkgDir = findDshPackageDir(home, dshPackageArg);
  syncPlugins(home, dryRun, dshPkgDir);
  syncBuiltinPresets(home, dryRun);
  if (withPatches) applyRuntimePatches(home, dryRun);
  console.log('[sync] 完成。');
  console.log('[sync] 提示：插件与内置 Agent 预设在 dsh web 启动时才会挂载 —— 请重启 WSL 里的 dsh web：');
  console.log('[sync]   checkout 开发模式:  cd <harness 目录> && pnpm dsh web');
  console.log('[sync]   npm 安装版:        dsh web');
  console.log('[sync]   重启会中断当前正在跑的会话；会话数据在磁盘上，重启后可继续。');
}

main();
