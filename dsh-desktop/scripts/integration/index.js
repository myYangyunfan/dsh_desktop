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
// vendor/dsh-kernel 陈旧内核 tarball 自愈（0.6.1 alpha.5 覆盖安装「版本混装」形态：
// NSIS 只增不删 → 旧 alpha.4 tgz 残留 → compat-pin fail-closed 拒启）。
const { healVendorStaleKernels } = require('../lib/vendor-kernel-heal');

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
    pluginSync.healProfilePatch();
    pluginSync.healHomePatch();
    pluginSync.logProfileBundleHealth();
    // settings.yaml 的 llm-pi-ai 非法供应商自愈（内核包 ESM，heal 为 async）：
    // 模块内部全容忍（宁漏勿误、备份+原子写），这里再兜一层异常——repair 步
    // 任何子失败绝不阻断启动。
    try {
      await healPiAiSettings({ appDir, home: getHome(), log });
    } catch (err) {
      log('settings.yaml llm-pi-ai 自愈异常（容忍继续，不阻断启动）: ' + String((err && err.message) || err));
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
