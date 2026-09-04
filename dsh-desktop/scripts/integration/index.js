'use strict';

// ---------------------------------------------------------------------------
// 插件集成门面（PluginIntegration）。
//
// 单一入口：main.js 只调 createPluginIntegration(ctx) + run()（或细粒度
// syncPlugins / applyPatches / preflightHealth / healBeforeServer），不再各自
// 编排 syncCompanionPlugins + 18 个 apply* + preScanPluginHealth。
//
//   run() = syncPlugins → applyPatches → preflightHealth
// ---------------------------------------------------------------------------

const path = require('node:path');
const os = require('node:os');
const { createPluginSync } = require('./plugin-sync');
const { applyAll } = require('./patch-runner');
const { preflight } = require('./fault-isolation');
// llm-pi-ai settings.yaml 非法供应商条目自愈（0.5.7 alpha.4「一家不合法全体
// 陪葬」形态：目录外路由缺 api/baseURL → 插件启动失败 → 三方供应商整组消失）。
const { healPiAiSettings } = require('../lib/pi-ai-settings-heal');
// settings.yaml 整文档不可解析自愈（用户反馈「加载提供方目录失败: settings service
// is absent」根治）：dsh-settings-file 初始加载对非法文档致命抛错 → settings 提供方被
// loader-isolation 降级 → 服务缺席。内核拉起前先用同款 yaml 判定校验，坏则分级自愈
// （剥 BOM → 恢复最近合法备份 → 重置空文档），须早于 pi-ai 自愈（后者要求文档可解析）。
const { healSettingsDocument } = require('../lib/settings-document-heal');
// vendor/dsh-kernel 陈旧内核 tarball 自愈（0.6.1 alpha.5 覆盖安装「版本混装」形态：
// NSIS 只增不删 → 旧 alpha.4 tgz 残留 → compat-pin fail-closed 拒启）。
const { healVendorStaleKernels } = require('../lib/vendor-kernel-heal');
// 内置 Agent 预设落点自愈（issue #174：presets 步落点根错到 payload 包目录，
// 客户端模式列表只剩内核出厂四件套）——本步只补 <DSH_HOME>/.agent-presets 里
// 缺失的文件，已存在（含用户改过的）一律不动。
const { healBuiltinPresets, detectLegacyPresetCopy } = require('../lib/preset-heal');
// 服务缺席诊断（issue #176）：识别 inject 了「运行态根本不存在（上游已移除）服务」
// 的第三方插件（典型 mobile-gateway 依赖 apiProxy），落一行明确日志，根治静默 pending。
const { runServiceAbsenceDiagnosis } = require('./service-absence');
// profile manifest 孤儿依赖自愈（issue #177）：v0.5.3 时代写入器留在 profile
// dependencies 里的 `@deepseek-ai/*` 孤儿条目（内核闭包没有、npm 也拿不到）会让
// 内核 boot 直接 ERR_MODULE_NOT_FOUND 退出，并让后续 pnpm 安装撞 404（#156/#170 欠账）。
const { healProfileOrphanDeps } = require('../lib/profile-orphan-dep-heal');

/**
 * @param {Object} opts
 * @param {() => string} opts.getHome          effectiveDshHome()
 * @param {string} opts.appDir                 __dirname
 * @param {() => string} opts.getUserDataDir   () => userDataDir
 * @param {() => boolean} opts.wslMode         () => isWslMode()
 * @param {(msg: string) => void} opts.log     topic 已绑定为 'boot'
 * @param {() => ({load:(c:string)=>any}|null)} opts.loadYaml
 * @param {() => Object} opts.loadSettings
 * @param {(s: Object) => void} opts.saveSettings
 * @param {() => string} opts.getInstallAnchorDir
 * @param {(recovered: string[]) => void} [opts.onManifestResetRecovered]
 * @param {Object} [opts.hostDetectors]        宿主能力探测器（可注入，供单测）
 */
function createPluginIntegration(opts) {
  const {
    getHome,
    appDir,
    getUserDataDir,
    wslMode,
    log,
    loadYaml,
    loadSettings,
    saveSettings,
    getInstallAnchorDir,
    onManifestResetRecovered,
    onHealReset,
    hostDetectors,
  } = opts;

  const pluginSync = createPluginSync({
    getHome,
    appDir,
    getUserDataDir,
    log,
    loadYaml,
    loadSettings,
    saveSettings,
    getInstallAnchorDir,
    onManifestResetRecovered,
    onHealReset,
  });

  /** 构造 patch-runner / fault-isolation 共用的解析 ctx（纯参数注入）。 */
  function buildCtx() {
    return {
      home: getHome() || path.join(os.homedir(), '.dsh'),
      appDir,
      userDataDir: getUserDataDir(),
      wslMode: !!wslMode(),
      log,
      hostDetectors,
    };
  }

  const syncPlugins = () => pluginSync.sync();
  const healBeforeServer = async () => {
    // 先清 vendor 陈旧内核 tarball——本步在 boot 链 compat-pin 之前，剪掉非 pin
    // 版本混装后 compat-pin 方能通过（覆盖安装累积旧包的根治）。全容忍不阻断。
    try {
      healVendorStaleKernels({ appDir, log });
    } catch (err) {
      log('vendor-kernel 自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
    // profile manifest 孤儿依赖清理（issue #177）：必须早于内核拉起与 compat-pin 相关
    // 步骤——孤儿条目留在 dependencies 里，boot 装配阶段就会 ERR_MODULE_NOT_FOUND 退出
    // （恢复页「回滚后仍失败」形态）。判据全为本地确定性证据（vendor 闭包 + 内置配套件
    // 名单 + profile / 共享 farm 内在位性），闭包读不到即整体放弃；模块内部全容忍（备份 + 原子写），
    // 这里再兜一层异常——repair 步任何子失败绝不阻断启动。
    try {
      healProfileOrphanDeps({ appDir, home: getHome() || path.join(os.homedir(), '.dsh'), log });
    } catch (err) {
      log('profile 孤儿依赖自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
    pluginSync.healProfilePatch();
    pluginSync.healHomePatch();
    pluginSync.logProfileBundleHealth();
    // settings.yaml 整文档不可解析自愈（同步、纯 fs）：必须早于 pi-ai 自愈——后者
    // 要求文档可解析才有意义。模块内部全容忍（备份 + 原子写、宁漏勿误），这里再兜
    // 一层异常——repair 步任何子失败绝不阻断启动。
    try {
      healSettingsDocument({ appDir, home: getHome(), log });
    } catch (err) {
      log('settings.yaml 文档自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
    // settings.yaml 的 llm-pi-ai 非法供应商自愈（内核包 ESM，heal 为 async）：
    // 模块内部全容忍（宁漏勿误、备份+原子写），这里再兜一层异常——repair 步
    // 任何子失败绝不阻断启动。
    try {
      await healPiAiSettings({ appDir, home: getHome(), log });
    } catch (err) {
      log('settings.yaml llm-pi-ai 自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
    // 内置 Agent 预设落点兜底（issue #174）：boot 的 presets 步被跳过（WSL agent
    // 未就绪）或抛错（payload 只读 / 瞬态文件锁）时，这里把用户预设根里缺失的
    // 预设补回来。只补不动（现存文件一律不改写），模块内部全容忍；这里再兜一层。
    const home = getHome() || path.join(os.homedir(), '.dsh');
    try {
      healBuiltinPresets({ appDir, home, log });
      const legacy = detectLegacyPresetCopy(appDir);
      if (legacy) {
        log('preset-heal: 检测到旧版本落点残留（' + legacy + '，无人读取，可手动删除）');
      }
    } catch (err) {
      log('内置预设落点自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
    // 服务缺席诊断（issue #176）：扫描已安装第三方插件的 inject，命中「内核已移除
    // 服务」（当前登记 apiProxy）时逐个落一行 [service-absence] 日志——让「插件永远
    // [pending] 且无提示」变成可诊断的明确文案。全容错：任何失败都不阻断启动。
    try {
      const absence = runServiceAbsenceDiagnosis({
        appDir,
        extraRoots: [path.join(getHome() || '', 'plugins')].filter((p) => p && p !== path.sep),
        log,
      });
      if (absence.findings.length > 0) {
        log('服务缺席诊断：检出 ' + absence.findings.length + ' 项依赖已移除服务的插件（详见 [service-absence] 行）');
      }
    } catch (err) {
      log('服务缺席诊断异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
    }
  };
  const applyPatches = () => applyAll(buildCtx());
  const preflightHealth = () => preflight(buildCtx());

  return {
    ctx: opts,
    /** 七步插件同步 / 自愈 / 对账。 */
    syncPlugins,
    /** 启动前自愈（startServer 复用）：profile patch + 家级补丁层 + bundle 健康检查。 */
    healBeforeServer,
    /** 注册表驱动应用全部运行时补丁。 */
    applyPatches,
    /** 只读三态健康预检。 */
    preflightHealth,
    /** 门面编排：syncPlugins → applyPatches → preflightHealth（闭包调用，不依赖 this）。 */
    // run() 为聚合门面（syncPlugins → applyPatches → preflightHealth），当前 main.js
    // 走细粒度方法分步调用并各自消费 patchReport；run() 供集成测试/未来单一入口
    // 使用，非死代码。
    run() {
      return {
        syncResult: syncPlugins(),
        patchReport: applyPatches(),
        healthReport: preflightHealth(),
      };
    },
  };
}

module.exports = { createPluginIntegration };
