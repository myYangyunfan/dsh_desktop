'use strict';
// ---------------------------------------------------------------------------
// dev 树补丁收口（注册表驱动，幂等）——postinstall 链第二步（install-kernel
// 换装内核之后运行）。
//
// 结构（v0.6.0 alpha.3 收口重构，替代此前 13 个手写 try 块）：
//   1) picker-native 内联补丁：历史遗留、未登记注册表，保持原样；
//   2) canonical 引擎全链重放：integration/patch-runner.applyAll 遍历
//      patch-registry 全部规格（16 root + 34 file），与桌面壳 boot 链、CLI
//      同步链同款引擎、同一规格集——postinstall 后的 dev 树即「全链收敛态」，
//      patch-surface 快照可被全新 npm ci 逐字节复现。
//
// 副本范围：ctx 的 home / userDataDir 指向不存在路径，layouts 里 profile
// fallback / agent overlay 副本被 existsSync 天然跳过，只打 appDir（dev
// node_modules）副本——运行副本仍由 boot 链与 sync-companion-plugins 负责
// （tmpdir ctx 同款先例）。
//
// 失败可见性（fail-loud）：锚点失配（= 内核换代导致干预静默消失）/ 读写
// 失败 / 规格级异常 → 退出非零，npm ci 与 CI 当场暴露，而非静默成功后靠
// 事后手工 patch-surface verify。degraded 为设计内降级（degrade 档失配），
// 只告警不拦截。
//
// 内核换代重靶时【不需要动本文件】：补丁在 patch-registry 登记即自动纳入
// postinstall（root kind 声明 apply/successLog/failLog；file kind 声明
// transform/layout）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');
const { PATCH_SPECS, getSpecsByGroup } = require('./lib/patch-registry');
const { applyAll } = require('./integration/patch-runner');

const root = path.resolve(__dirname, '..');
const nmRoot = path.join(root, 'node_modules');

// ---------------------------------------------------------------------------
// 1) picker-native（未登记注册表的历史遗留内联补丁，幂等）：目录选择器
// worker 无消息退出时，把真实退出码/信号带进错误文案。
// ---------------------------------------------------------------------------

const PICKER_TARGET = path.join(nmRoot, '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'index.js');
const PICKER_MARKER = 'worker.on("exit", (code, signal) => {';
const PICKER_OLD_RE = /worker\.on\("exit", \(\) => \{\s*settle\(\(\) => \{\s*reject\(\/\* @__PURE__ \*\/ new Error\("win32 folder dialog worker exited before reporting a result"\)\);\s*\}\);\s*\}\);/;
const PICKER_NEW_BLOCK = [
  'worker.on("exit", (code, signal) => {',
  '\t\tsettle(() => {',
  '\t\t\tconst suffix = signal ? ` (signal ${signal})` : typeof code === "number" ? ` (exit code ${code})` : "";',
  '\t\t\treject(/* @__PURE__ */ new Error(`win32 folder dialog worker exited before reporting a result${suffix}`));',
  '\t\t});',
  '\t});',
].join('\n');

function patchPickerNativeExitCode() {
  if (!fs.existsSync(PICKER_TARGET)) {
    console.log('[patch-deps] dsh-host-directory-picker-native 不存在，跳过');
    return;
  }
  let src = fs.readFileSync(PICKER_TARGET, 'utf8');
  if (src.includes(PICKER_MARKER)) {
    console.log('[patch-deps] picker worker 退出码补丁已应用，跳过');
    return;
  }
  if (!PICKER_OLD_RE.test(src)) {
    console.log('[patch-deps] picker-native 未匹配到目标代码（版本可能已更新），跳过');
    return;
  }
  src = src.replace(PICKER_OLD_RE, PICKER_NEW_BLOCK);
  writeFileAtomic(PICKER_TARGET, src);
  console.log('[patch-deps] 已补丁 picker-native：worker 退出上报 exit code / signal');
}

// ---------------------------------------------------------------------------
// 2) 注册表驱动全链重放（canonical 引擎 applyAll）。
// ---------------------------------------------------------------------------

/** 构造「只命中 dev 树副本」的 applyAll ctx（home/userDataDir 不存在）。 */
function buildDevCtx(log) {
  return {
    home: path.join(os.tmpdir(), 'dsh-postinstall-absent-home'),
    appDir: root,
    userDataDir: path.join(os.tmpdir(), 'dsh-postinstall-absent-userdata'),
    wslMode: false,
    log,
  };
}

/**
 * 对 dev 树执行注册表全链补丁收口（幂等，可在 npm ci 后重跑）。
 * @param {(msg: string) => void} [log]
 * @param {Array<Object>} [specs] 规格清单（默认全量注册表，供单测注入）
 * @param {Object} [options] applyAll 场景覆盖（透传；同 boot/CLI 链）
 * @returns {ReturnType<typeof applyAll>} patchReport
 */
function runDevTreePatch(log = (m) => console.log('[patch-deps] ' + m), specs = getSpecsByGroup(), options = {}) {
  return applyAll(buildDevCtx(log), specs, options);
}

module.exports = { runDevTreePatch, buildDevCtx, patchPickerNativeExitCode, PATCH_SPECS };

if (require.main === module) {
  patchPickerNativeExitCode();
  const report = runDevTreePatch();
  const hardFail = report.anchorMissing > 0 || report.failed > 0 || report.errors.length > 0;
  if (report.degraded.length > 0) {
    console.warn('[patch-deps] 降级补丁（设计内告警）: ' + report.degraded.join(', '));
  }
  if (hardFail) {
    console.error(
      `[patch-deps] ⚠ dev 树补丁收口不完整：失配 ${report.anchorMissing} 处 / ` +
      `失败 ${report.failed} 处 / 规格异常 ${report.errors.length} 项（${report.errors.join(', ')}）`
    );
    console.error('[patch-deps] 多为内核换代导致锚点失配——按 compat 层重靶流程更新补丁锚点后重跑，勿静默忽略');
    process.exitCode = 1;
  }
}
