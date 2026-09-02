'use strict';

// ---------------------------------------------------------------------------
// 插件同步 / 自愈 / 对账（迁移 main.js 的 syncCompanionPlugins 七步）。
//
// 七步：heal（profile patch 自愈）→ 同步（syncCompanionFiles）→ 清市场
// （removeLegacyMarketplacePatchLines）→ 退役（retireZatEngine）→ 禁用
// （ACP / PET）→ 对账（reconcileProfileBundles）→ 注册
// （registerCompanionPatchEntries）。纯编排：只调 companion-profile /
// profile-reconcile / profile-patch-heal 的唯一实现，不写锚点与复制逻辑。
//
// 另收口家级补丁层预检（healHomePatch）与 profile bundle 健康检查
// （logProfileBundleHealth），供 startServer 的启动前自愈复用。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { writeFileAtomic } = require('../lib/patch-io');
const { readFileRetry } = require('../lib/patch-io');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins');
const { syncHubRecognition } = require('../lib/hub-registry');
const { CORE_BUNDLE_NAMES } = require('../../profile-manifest');
const { isPatchListValid, verifyBundleDir } = require('../../profile-bundle-heal');
const { dedupePatchEntries } = require('../../profile-patch-heal');
const { quotePatchScalarValues } = require('../plugin-core/lib/patch-surgery');
const { PluginStateStore } = require('../plugin-core/lib/state-store');
const { reconcileProfileBundles, resolveBundleDirLike } = require('../lib/profile-reconcile');
const {
  ACP_SELF_DISABLE_BLOCK,
  removeAcpBasicDisableBlock,
  PET_DISABLE_BLOCK,
  removeLegacyMarketplacePatchLines,
  removeRetiredDshMarketPatchRows,
  removeRetiredThirdPartyThinkingPatchRows,
  removedPluginIdsFromPatch,
  ensureDisabledPatchEntry,
  registerCompanionPatchEntries,
  syncCompanionFiles,
} = require('../lib/companion-profile');

/**
 * @param {Object} ctx
 * @param {() => string} ctx.getHome            effectiveDshHome()（可为空串）
 * @param {string} ctx.appDir                   __dirname
 * @param {() => string} ctx.getUserDataDir     () => userDataDir
 * @param {(msg: string) => void} ctx.log       topic 已绑定为 'boot'
 * @param {() => ({load:(c:string)=>any}|null)} ctx.loadYaml
 * @param {() => Object} ctx.loadSettings
 * @param {(s: Object) => void} ctx.saveSettings
 * @param {() => string} ctx.getInstallAnchorDir  dshPackageJson() 所在目录
 * @param {(recovered: string[]) => void} [ctx.onManifestResetRecovered]
 */
function createPluginSync(ctx) {
  const {
    getHome,
    appDir,
    getUserDataDir,
    log,
    loadYaml,
    loadSettings,
    saveSettings,
    getInstallAnchorDir,
    onManifestResetRecovered = () => {},
    onHealReset = () => {},
  } = ctx;

  const homeOrFallback = () => getHome() || path.join(os.homedir(), '.dsh');

  // 备份文件名后缀：时间戳 + 随机串，避免同毫秒内多次自愈/并发导致备份名碰撞覆盖。
  const backupSuffix = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  function profilePatchFile() {
    return path.join(homeOrFallback(), 'profiles', 'web', 'cordis.patch.yml');
  }

  // profile patch 自愈的签名缓存（进程内 memo + userData 持久化）。
  // 签名 = size + mtimeMs + 内容 hash：mtimeMs 在「快速连续写 / 跨盘拷贝」下可能
  // 精度丢失导致漏自愈，加内容 hash 兜底（patch 文件很小，全读成本可忽略）。
  let patchHealMemo = null; // { file, size, mtimeMs, hash }
  function patchHealCachePath() {
    return path.join(getUserDataDir(), 'profile-patch-heal-cache.json');
  }
  function patchFileSignature(file) {
    try {
      const st = fs.statSync(file);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      return { size: st.size, mtimeMs: st.mtimeMs, hash };
    } catch {
      return null;
    }
  }
  function readPersistedPatchHeal() {
    try {
      const c = JSON.parse(fs.readFileSync(patchHealCachePath(), 'utf8'));
      if (c && c.v === 2 && typeof c.file === 'string' && typeof c.size === 'number' && typeof c.mtimeMs === 'number' && typeof c.hash === 'string') return c;
    } catch {}
    return null;
  }
  function writePersistedPatchHeal(file, sig) {
    try {
      fs.writeFileSync(patchHealCachePath(), JSON.stringify({
        v: 2,
        file,
        size: sig.size,
        mtimeMs: sig.mtimeMs,
        hash: sig.hash,
        at: new Date().toISOString(),
      }));
    } catch {}
  }

  function healProfilePatch() {
    try {
      const file = profilePatchFile();
      if (!fs.existsSync(file)) return;
      // 启动提速：签名一致 → 该文件已在当前内容状态下自愈过，直接跳过。
      const sig = patchFileSignature(file);
      if (sig) {
        const memoHit = patchHealMemo && patchHealMemo.file === file &&
          patchHealMemo.size === sig.size && patchHealMemo.mtimeMs === sig.mtimeMs && patchHealMemo.hash === sig.hash;
        if (memoHit) return;
        const persisted = readPersistedPatchHeal();
        if (persisted && persisted.file === file && persisted.size === sig.size && persisted.mtimeMs === sig.mtimeMs && persisted.hash === sig.hash) {
          patchHealMemo = { file, size: sig.size, mtimeMs: sig.mtimeMs, hash: sig.hash };
          return;
        }
      }
      // #154 第二根因：杀软/索引器瞬时锁（EBUSY/EPERM）下 readFileSync 会抛——
      // 历史行为是解析失败 → 备份 + 重置为 []（连带丢补丁）。用有限重试读取。
      let text = readFileRetry(file, 'utf8');
      const bareArray = /^\s*\[\]\s*$/m.test(text);
      const hasEntries = /^\s*-\s+(?:id|insert)\s*:/m.test(text);
      if (bareArray && hasEntries) {
        text = text.replace(/^\s*\[\]\s*$\n?/m, '');
        writeFileAtomic(file, text);
        log('profile patch 自愈: 移除了与列表混存的顶层 []（cordis.patch.yml）');
      }
      // #155 根因二幂等修复：`@deepseek-ai/...` 裸包名（js-yaml 报 bad
      // indentation，内核装配即崩）补 YAML 引号。必须发生在解析之前——
      // 裸 @ 值会让下面的 yaml.load 直接失败，旧行为是「备份 + 重置为 []」
      // （连带丢失用户补丁）；这里先把脏标量修好再解析，健康文件零改写。
      const quoted = quotePatchScalarValues(text);
      if (quoted.changed) {
        writeFileAtomic(file, quoted.text);
        log('profile patch 自愈: 为 @ 开头/特殊字符包名补 YAML 引号（#155 根因二）');
        text = quoted.text;
      }
      const yaml = loadYaml();
      if (!yaml) return;
      let parsed;
      let error = null;
      try { parsed = yaml.load(text); } catch (err) { error = err; }
      // 合法判定与 dsh-app-boot parsePatchList 同构：顶层数组且每项为映射。
      if (!error && isPatchListValid(parsed)) {
        // issue #17 存量自愈：注册行级去重（PR #24 v2）。
        const dedupe = dedupePatchEntries(text);
        if (dedupe.removed.length > 0) {
          const backup = file + '.dup-' + backupSuffix();
          try { fs.copyFileSync(file, backup); } catch {}
          writeFileAtomic(file, dedupe.text);
          log('profile patch 自愈: 移除了重复注册的 loader 条目 ' + [...new Set(dedupe.removed)].join(', ') + '，原文件已备份到 ' + backup);
          text = dedupe.text;
        }
      }
      if (error || !isPatchListValid(parsed)) {
        const backup = file + '.broken-' + backupSuffix();
        try { fs.renameSync(file, backup); } catch { fs.copyFileSync(file, backup); }
        fs.writeFileSync(file, '# recovered by DSH Desktop: 原内容无法解析，已备份到\n# ' + backup + '\n[]\n', 'utf8');
        const cause = error ? String((error && error.message) || error)
          : (Array.isArray(parsed) ? '条目不是映射（顶层数组每项须为映射）' : '顶层非数组');
        log('profile patch 自愈: 解析失败（' + cause + '），已备份到 ' + backup + ' 并重置为最小文件');
        onHealReset('profile', backup);
      }
      // 完整自愈流程已跑完（含 yaml 解析）：记录当前内容签名，下次启动命中跳过。
      const after = patchFileSignature(file);
      if (after) {
        patchHealMemo = { file, size: after.size, mtimeMs: after.mtimeMs, hash: after.hash };
        writePersistedPatchHeal(file, after);
      }
    } catch (err) {
      log('profile patch 自愈失败: ' + err.message);
    }
  }

  let homePatchHealMemo = null; // { file, size, mtimeMs, hash }
  function healHomePatch() {
    try {
      const file = path.join(homeOrFallback(), 'cordis.patch.yml');
      if (!fs.existsSync(file)) return;
      const sig = patchFileSignature(file);
      if (sig && homePatchHealMemo && homePatchHealMemo.file === file &&
          homePatchHealMemo.size === sig.size && homePatchHealMemo.mtimeMs === sig.mtimeMs &&
          homePatchHealMemo.hash === sig.hash) {
        return;
      }
      const yaml = loadYaml();
      if (!yaml) return; // 无 yaml 依赖：跳过解析（运行时防护兜底）
      // #155 根因二幂等修复（同 healProfilePatch）：裸 @ 包名先补引号再解析。
      // #154：瞬时锁下用有限重试读取。
      let text = readFileRetry(file, 'utf8');
      const quoted = quotePatchScalarValues(text);
      if (quoted.changed) {
        writeFileAtomic(file, quoted.text);
        log('家级补丁层自愈: 为 @ 开头/特殊字符包名补 YAML 引号（#155 根因二）');
        text = quoted.text;
      }
      let parsed = null;
      let error = null;
      try { parsed = yaml.load(text); } catch (err) { error = err; }
      if (!error && isPatchListValid(parsed)) {
        homePatchHealMemo = { file, size: sig.size, mtimeMs: sig.mtimeMs, hash: sig.hash };
        return;
      }
      const backup = file + '.broken-' + backupSuffix();
      try { fs.renameSync(file, backup); } catch { fs.copyFileSync(file, backup); }
      fs.writeFileSync(file, '# recovered by DSH Desktop: 原内容无法解析，已备份到\n# ' + backup + '\n[]\n', 'utf8');
      const cause = error ? String((error && error.message) || error)
        : (Array.isArray(parsed) ? '条目不是映射（顶层数组每项须为映射）' : '顶层非数组');
      log('家级补丁层自愈: 解析失败（' + cause + '），已备份到 ' + backup + ' 并重置为最小文件');
      onHealReset('home', backup);
      const after = patchFileSignature(file);
      if (after) homePatchHealMemo = { file, size: after.size, mtimeMs: after.mtimeMs, hash: after.hash };
    } catch (err) {
      log('家级补丁层自愈失败: ' + err.message);
    }
  }

  function logProfileBundleHealth() {
    try {
      const profileDir = path.join(homeOrFallback(), 'profiles', 'web');
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
      } catch (err) {
        log('profile bundle 健康检查: manifest 不可读（' + err.message + '），交由启动防护自愈');
        return;
      }
      const bundles = (manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)) ? manifest.dsh.profile.bundles : [];
      const installAnchor = getInstallAnchorDir();
      for (const name of bundles) {
        if (typeof name !== 'string' || name === '') continue;
        const dir = resolveBundleDirLike(path.join(installAnchor, 'package.json'), name)
          || resolveBundleDirLike(path.join(profileDir, 'package.json'), name);
        if (!dir) {
          log('profile bundle 缺失（对账后仍存在，启动防护兜底跳过）: ' + name + ' —— 用 dsh plugin --profile web install 可修复');
          continue;
        }
        const check = verifyBundleDir(dir);
        if (!check.ok) log('profile bundle 不可用（对账后仍存在，启动防护兜底跳过）: ' + name + ' —— ' + check.reason);
      }
    } catch (err) {
      log('profile bundle 健康检查失败: ' + err.message);
    }
  }

  // 退役插件一次性清理：v0.3.11 起内置插件市场 zat-dsh-engine 默认移除。
  function retireZatEngine(profileDir) {
    const RETIRED_NAME = 'zat-dsh-engine';
    try {
      const s = loadSettings();
      if (s.zatEngineRetired) return;
      const pkgDir = path.join(profileDir, 'node_modules', RETIRED_NAME);
      if (fs.existsSync(pkgDir)) {
        // 只清内置装配特征（dsh.bundle.patch 声明）的副本，避免误删同名第三方包。
        let isBuiltin = false;
        try {
          const p = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
          isBuiltin = !!(p && p.dsh && p.dsh.bundle && p.dsh.bundle.patch);
        } catch {}
        if (isBuiltin) {
          fs.rmSync(pkgDir, { recursive: true, force: true });
          log('已移除内置插件市场 ' + RETIRED_NAME + '（v0.3.11 起默认移除）');
        }
      }
      const manifestFile = path.join(profileDir, 'package.json');
      try {
        const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (m && m.dsh && m.dsh.profile && Array.isArray(m.dsh.profile.bundles) && m.dsh.profile.bundles.includes(RETIRED_NAME)) {
          m.dsh.profile.bundles = m.dsh.profile.bundles.filter((n) => n !== RETIRED_NAME);
          writeFileAtomic(manifestFile, JSON.stringify(m, null, 2) + '\n');
          log('已从 web profile bundles 移除 ' + RETIRED_NAME + ' 登记');
        }
      } catch (err) {
        log('清理 ' + RETIRED_NAME + ' manifest 登记失败: ' + err.message);
      }
      s.zatEngineRetired = true;
      saveSettings(s);
    } catch (err) {
      log('退役清理 ' + RETIRED_NAME + ' 失败: ' + err.message);
    }
  }

  function sync() {
    // 平台门已放开（v0.5.1，K2 清查 #14）：Electron 时代仅发 Windows 故加此门；
    // Tauri 线发全平台后，非 Windows 上此门导致伴随插件完全不安装（boot 仍报
    // ok:true 的静默降级）。本函数体（heal→sync→reconcile→register）为纯
    // fs/path 操作：symlink farm 在非 Windows 退化为普通 symlink（语义等价，
    // profile-module-heal 的 realpath 判定兼容）。macOS/Linux 首启真机回归
    // 待验证，出现异常时日志（log 通道）会落 boot 步骤 warning。
    if (process.platform !== 'win32') {
      log('plugin-sync: 非 Windows 平台（' + process.platform + '）首次启用伴随插件同步（预览）');
    }
    try {
      healProfilePatch();
      const home = getHome();
      if (!home) { log('DSH_HOME 未解析，跳过配套插件同步'); return; }
      const profileDir = path.join(home, 'profiles', 'web');
      const patchFile = path.join(profileDir, 'cordis.patch.yml');
      let patchText = '';
      try { patchText = fs.readFileSync(patchFile, 'utf8'); } catch { /* 无 patch 文件 */ }
      const removedIds = removedPluginIdsFromPatch(patchText);
      // 卸载决策双源：patch removed 行 ∪ 家级状态存储（抗 patch 重置复活，
      // 与 CLI 同步器共用同一文件）。状态不可用时按单源处理（不阻塞启动）。
      let stateStore = null;
      try {
        stateStore = new PluginStateStore({ file: path.join(home, 'desktop-plugin-state.json'), log: (m) => log(m) });
      } catch (err) {
        log('插件状态存储不可用，卸载决策仅按 patch 行: ' + err.message);
      }
      if (stateStore) {
        for (const id of Object.keys(stateStore.getUninstalled())) removedIds.add(id);
      }
      const { bundleNames, missingNames: missingSourceNames } = syncCompanionFiles({
        assetsRoot: path.join(appDir, 'assets', 'plugins'),
        profileDir,
        vendorRoot: path.join(appDir, 'node_modules'),
        removedIds,
        log: (m) => log(m),
        fail: (m) => log(m),
        onCopyFail: (sf, err) => log('同步配套插件文件失败 ' + sf + ': ' + err.message),
        onVerifyFail: (name, reason) => log('配套 bundle 校验失败（按源缺失处理，不注册）: ' + name + ' —— ' + reason),
      });

      // v0.3.5 起插件市场整体切换为 zat-dsh-engine（MIT）：清理旧版
      // @deepseek-ai/dsh-plugin-marketplace 的 patch 行（幂等）。
      try {
        let legacyPatch = fs.readFileSync(patchFile, 'utf8');
        const legacy = removeLegacyMarketplacePatchLines(legacyPatch);
        if (legacy.changed) {
          writeFileAtomic(patchFile, legacy.patch);
          log('已从 cordis.patch.yml 移除旧插件市场条目');
        }
      } catch {}

      // 内置市场切换为 dsh-community-market：退役 dshmarket（loader id
      // dsh-market）的 patch 行一次性清理（幂等；目录与 manifest 登记在
      // syncCompanionFiles 内的 removeRetiredDshMarketDir 已处理）。
      try {
        const retiredBefore = fs.readFileSync(patchFile, 'utf8');
        const retired = removeRetiredDshMarketPatchRows(retiredBefore);
        if (retired.changed) {
          writeFileAtomic(patchFile, retired.patch);
          log('已从 cordis.patch.yml 移除退役插件市场 dshmarket 条目');
        }
      } catch {}

      // 内置推理强度选择切换为 dsh-reasoning-effort：退役 dsh-third-party-thinking
      // （loader id third-party-thinking）的 patch 行一次性清理（幂等；目录在
      // syncCompanionFiles 内的 removeRetiredThirdPartyThinkingDir 已处理）。
      try {
        const retiredTpt = fs.readFileSync(patchFile, 'utf8');
        const retired2 = removeRetiredThirdPartyThinkingPatchRows(retiredTpt);
        if (retired2.changed) {
          writeFileAtomic(patchFile, retired2.patch);
          log('已从 cordis.patch.yml 移除退役插件 dsh-third-party-thinking 条目');
        }
      } catch {}

      // v0.3.11 起内置插件市场 zat-dsh-engine 默认移除（用户要求）。
      retireZatEngine(profileDir);

      // billion-context-dsh（compaction-acp，模型驱动的 ACP 压缩后端）默认关闭：
      // 用户反馈其在上下文占用未及 1/4 时仍频繁压缩。改为随包默认禁用（顶层
      // disabled 块一票否决 bundle 自身 insert），需要时在设置 → 插件 → 管理
      // 一键开启。同时撤销历史自动写入的 compaction-basic 禁用块，恢复内核默认压缩。
      if (bundleNames.has('billion-context-dsh')) {
        try {
          let patch = '';
          try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { /* 全新 profile：patch 文件尚未创建，视为空 */ }
          const heal = removeAcpBasicDisableBlock(patch);
          patch = heal.patch;
          const self = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-acp\\b'), ACP_SELF_DISABLE_BLOCK);
          if (heal.changed || self.changed) {
            writeFileAtomic(patchFile, self.patch);
            log('billion-context-dsh 默认关闭：已禁用 compaction-acp 并恢复内核默认 compaction-basic');
          }
        } catch (err) {
          log('写入 compaction-acp 默认禁用条目失败: ' + err.message);
        }
      }

      // 桌面宠物（harness-pet）默认关闭。
      if (bundleNames.has('harness-pet')) {
        try {
          let patch = '';
          try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { /* 全新 profile：patch 文件尚未创建，视为空 */ }
          const entry = ensureDisabledPatchEntry(patch, new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*harness-pet\\b'), PET_DISABLE_BLOCK);
          if (entry.changed) {
            writeFileAtomic(patchFile, entry.patch);
            log('已默认关闭桌面宠物（harness-pet，可在插件管理开启）');
          }
        } catch (err) {
          log('写入 harness-pet 禁用条目失败: ' + err.message);
        }
      }

      // profile manifest 装配对账（唯一实现）。removedBundles 覆盖内置配套 +
      // 第三方已卸载（state 决策里的非配套名），第三方 bundle 卸载后不再残留
      // 「每次启动解析失败」的登记。
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
      const reconciled = reconcileProfileBundles(profileDir, {
        installAnchorDir: getInstallAnchorDir(),
        coreNames: CORE_BUNDLE_NAMES,
        addNames: bundleNames,
        missingNames: missingSourceNames,
        removedBundles,
        excludeFromRecover: new Set([...CORE_BUNDLE_NAMES, ...COMPANION_PLUGINS.map((p) => p.name)]),
        parsePatch: loadYaml(),
        log: (m) => log(m),
      });
      if (reconciled.reset && reconciled.manifest &&
          Array.isArray(reconciled.manifest.dsh && reconciled.manifest.dsh.profile && reconciled.manifest.dsh.profile.bundles)) {
        onManifestResetRecovered(reconciled.recovered);
      }

      // 非 bundle 插件注册到 profile 的 patch 层（幂等）。必须在 legacy/ACP/PET
      // 三步落盘之后重新读盘。
      let patch = '';
      try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
      const registration = registerCompanionPatchEntries(patch, {
        plugins: COMPANION_PLUGINS,
        bundleNames,
        missingNames: missingSourceNames,
        removedIds,
        onDrop: (m) => log(m),
        // issue #116 诊断性：登记/改名逐条进日志——「文件已复制但未登记」类问题
        // （历史上注册被补丁层既有内容误抑制）从日志即可定位，不再无痕静默。
        onEntry: (m) => log(m),
      });
      if (registration.changed) {
        writeFileAtomic(patchFile, registration.patch);
        log('已同步配套插件到 web profile: ' + COMPANION_PLUGINS.map((p) => p.id).join(', '));
      }

      // 第八步：hotplug-hub 识别（issue #156 止血后口径）。hub lib/CLI 的
      // status/preview 只认 packs 目录 → 写 dsh-desktop 指针包；v0.5.3 曾把
      // 内置件按 npm 形状写进 profile dependencies（多数不在 npm 上 → pnpm
      // 404 锁死 profile），此处幂等清除存量脏数据且不再写入（用户在下次
      // 启动即自愈，pnpm 恢复可用）。
      syncHubRecognition({
        home,
        profileDir,
        assetsRoot: path.join(appDir, 'assets', 'plugins'),
        removedIds,
        log: (m) => log(m),
      });
    } catch (err) {
      log('同步配套插件失败: ' + err.message);
    }
  }

  return {
    sync,
    healProfilePatch,
    healHomePatch,
    logProfileBundleHealth,
  };
}

module.exports = { createPluginSync };
