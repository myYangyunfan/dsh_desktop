'use strict';

// patch-settings-write-resilience.js — v0.5.2「模型设置页添加供应商没反应/灰」两层根治。
//
// 背景（2026-08-22 PR5 沙箱实测定案，两根因相互独立、都命中用户「偶发」描述）：
//
//   根因一（写死：settings.yaml.lock 孤儿锁）——
//   dsh-atomic-write 的 withFileLock 用 `wx` 创建 `<file>.lock`、内容为持有者
//   PID，finally 里删除。内核进程在「持锁窗口内」被强杀（壳侧 supervisor 每次
//   重启/崩溃环/用户任务管理器结束进程都可能落在写设置的一瞬）就留下孤儿锁；
//   上游明言「contender 绝不删除既有锁，孤儿回收是运维动作」——但桌面产品没有
//   运维，于是该机器上此后【每一次】设置写入都在 2s 等待后失败：
//     settings-rejected: "atomic-write: timed out waiting for the writer lock
//     at <home>\settings.yaml.lock"
//   模型设置页一切只读面正常（describe 不加锁、writable 恒 true），用户填完
//   表单点「创建」只得到卡片底部一行英文路径报错——观感即「点了没反应」。
//   沙箱复现：手工植入 PID=999999 的锁 → mutate 稳定失败；删除锁 → 恢复。
//   修法：竞争分支追加孤儿探测——锁内容 PID 已死（process.kill(pid,0) ESRCH）
//   即证明持有者不可能再提交，删除该锁并回到既有重试循环（wx 重建天然防双删
//   竞态）。PID 复用/权限歧义（EPERM）一律按「仍存活」处理，退回上游语义。
//
//   根因二（陈旧镜像：settings.describe 只在 idle 首载）——
//   客户端 SettingsDescribeMirror 只在 settings/document-updated /
//   connection/reset 时重读；而宿主 SettingsService.register() 注册新 namespace
//   【不发任何事件】。镜像一旦在 llm-pi-ai 注册前落了一份视图就永久陈旧：
//   ModelsSection 的 protocols=[] →「添加自定义供应商」按钮灰；providers 行
//   的 settingsNs 在 namespaces 里缺席 → 点击「添加」渲染条件
//   `addTarget !== void 0 && addNamespace !== void 0` 不成立 → 什么都不发生。
//   修法：ModelsSettingsStore.load() 在「provider 目录（llm.providers 实时）里
//   存在 settingsNs、镜像视图里却没有」时强制 describeFace.load() 重读一次并
//   重建 namespaces——把两个数据源的偏差收敛掉。
//
//   伴随修（冲突无重试）：CustomProviderCard 打开瞬间抓 expectedRevision，卡片
//   填表期间 llm-pi-ai 被任何面写过一次（双窗/插件自愈/外链写入），点「创建」
//   稳定吃 settings-conflict（英文报错沉在长表单底部，观感同「没反应」）。
//   修法：收到 settings-conflict 时重读一次 revision、静默重试一次；仍失败才
//   把报错交回原路径。ops 是 providers.<route> 点位写，不会覆盖他人别的字段。
//
// 幂等 / 容错契约对齐 scripts/lib 既有补丁：marker 短路 already、锚点失配
// 不改写、异常逐文件吸收。上游若原生内置等价行为，本补丁经 already /
// anchor-missing 自然退役。

const path = require('node:path');
const fs = require('node:fs');
const { applyPatchToFiles } = require('./patch-engine');

/** 目标文件（相对 node_modules/@deepseek-ai 根）。 */
const ATOMIC_WRITE_REL = path.join('dsh-atomic-write', 'lib', 'index.js');
const SETTINGS_MODELS_REL = path.join('dsh-client-ui-settings-models', 'lib', 'client.js');

/** 幂等 marker（产物注释 + 单测同源）。 */
const ORPHAN_LOCK_MARKER = 'dsh-desktop patch (orphan lock recovery)';
const NAMESPACE_HEAL_MARKER = 'dsh-desktop patch (settings-models namespace heal)';
const CONFLICT_RETRY_MARKER = 'dsh-desktop patch (settings-conflict retry)';

// ---------------------------------------------------------------------------
// 根因一：dsh-atomic-write 孤儿锁自愈
// ---------------------------------------------------------------------------

/** import 行锚点（需为孤儿探测追加 readFile）。 */
const AW_IMPORT_ANCHOR = 'import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";';
const AW_IMPORT_NEW = 'import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";';

/** 竞争分支锚点（catch isLockContention 之后）。 */
const AW_CONTENTION_ANCHOR = [
  '\t\t} catch (error) {',
  '\t\t\tif (!await isLockContention(error, lockPath)) throw error;',
  '\t\t}',
].join('\n');

const AW_CONTENTION_NEW = [
  '\t\t} catch (error) {',
  '\t\t\tif (!await isLockContention(error, lockPath)) throw error;',
  '\t\t\t// ' + ORPHAN_LOCK_MARKER + ': 锁持有者 PID 已死即证明其不可能再提交',
  '\t\t\t// （finally 的 rm 永远不会来），删除孤儿锁回到既有 wx 重试循环——',
  '\t\t\t// 双删竞态由 wx 独占创建天然兜底。PID 复用/权限歧义按仍存活处理。',
  '\t\t\ttry {',
  '\t\t\t\tif (await isDshOrphanLock(lockPath)) await rm(lockPath, { force: true });',
  '\t\t\t} catch {}',
  '\t\t}',
].join('\n');

/** 孤儿探测 helper（注入在 withFileLock 上方；readFile 由 import 行补丁提供）。 */
const AW_HELPER_ANCHOR = 'async function withFileLock(filename, operation, options) {';
const AW_HELPER_INJECTION = [
  '/**',
  ` * ${ORPHAN_LOCK_MARKER}: whether a contended lock's recorded holder is provably dead.`,
  ' * The lock body is the holder PID written at acquisition; a dead PID can never',
  ' * reach its finally-block release, so the lock is an orphan and safe to remove.',
  ' * EPERM (alive under another user / PID reused) reads as alive — falls back to',
  ' * the upstream never-remove semantics. Unparseable bodies also read as alive.',
  ' */',
  'async function isDshOrphanLock(lockPath) {',
  '\tlet text;',
  '\ttry {',
  '\t\ttext = await readFile(lockPath, "utf8");',
  '\t} catch {',
  '\t\treturn false;',
  '\t}',
  '\tconst pid = Number.parseInt(text.trim(), 10);',
  '\tif (!Number.isInteger(pid) || pid <= 0) return false;',
  '\ttry {',
  '\t\tprocess.kill(pid, 0);',
  '\t\treturn false;',
  '\t} catch (error) {',
  '\t\tif (error && (error.code === "EPERM" || error.code === "EACCES")) return false;',
  '\t\treturn error && error.code === "ESRCH";',
  '\t}',
  '}',
  'async function withFileLock(filename, operation, options) {',
].join('\n');

/**
 * transform：dsh-atomic-write 孤儿锁自愈（幂等、锚点失配不改写）。
 * @param {string} src
 * @param {string} file
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformOrphanLock(src, file) {
  if (src.includes(ORPHAN_LOCK_MARKER)) return { status: 'already' };
  const hasImport = src.includes(AW_IMPORT_ANCHOR);
  const hasContention = src.includes(AW_CONTENTION_ANCHOR);
  const hasFunc = src.includes(AW_HELPER_ANCHOR);
  if (!hasContention || !hasFunc || (!hasImport && !src.includes('readFile'))) {
    return {
      status: 'anchor-missing',
      detail: '未找到 withFileLock 竞争分支/函数/import 锚点（版本可能已变更），跳过 ' + file,
    };
  }
  let next = src;
  if (hasImport) next = next.replace(AW_IMPORT_ANCHOR, () => AW_IMPORT_NEW);
  next = next.replace(AW_HELPER_ANCHOR, () => AW_HELPER_INJECTION);
  next = next.replace(AW_CONTENTION_ANCHOR, () => AW_CONTENTION_NEW);
  return { status: 'changed', src: next };
}

// ---------------------------------------------------------------------------
// 根因二：ui-settings-models 命名空间自愈 + 冲突重试
// ---------------------------------------------------------------------------

/** load() 内 namespaces 构建行锚点（全文件唯一）。0.1.2-alpha.2：load() 体
 *  缩进整体 +1（4-tab），锚点与注入体同步改用 4-tab。 */
const SM_NS_ANCHOR = '\t\t\t\tconst namespaces = new Map(views.map((view) => [view.ns, view]));';

const SM_NS_NEW = [
  '\t\t\t\tlet namespaces = new Map(views.map((view) => [view.ns, view]));',
  '\t\t\t\t// ' + NAMESPACE_HEAL_MARKER + ': provider 目录（llm.providers 实时应答）存在',
  '\t\t\t\t// 某 settingsNs 而镜像视图（describe 只在 idle 首载、register 不发事件）',
  '\t\t\t\t// 缺席时，强制重读一次 describe 并重建——否则「添加自定义供应商」按钮',
  '\t\t\t\t// 因 protocols=[] 恒灰、「添加」因 addNamespace 缺席点击无反应。',
  '\t\t\t\tif (providers.some((entry) => entry.settingsNs !== "" && !namespaces.has(entry.settingsNs)) && typeof this.describeFace.load === "function") {',
  '\t\t\t\t\ttry {',
  '\t\t\t\t\t\tawait this.describeFace.load();',
  '\t\t\t\t\t\tconst healed = this.describeFace.getSnapshot().view;',
  '\t\t\t\t\t\tif (healed !== void 0) namespaces = new Map(healed.namespaces.map((view) => [view.ns, view]));',
  '\t\t\t\t\t} catch {}',
  '\t\t\t\t}',
].join('\n');

/** CustomProviderCard 的 mutate 尾锚点（`}], openedAt);` 全文件唯一；0.1.2-alpha.1 起
 *  mutate 改为 `api.settings.mutate(ns, ops, expectedRevision)`、响应改为 `{ok,error,value}`，
 *  describe 改为无参 `api.settings.describe()` 返回 `{ok,value}`——锚点与注入体同步改用新签名。
 *  0.1.2-alpha.2：卡片改经 `operations.writeSettings` 包装（返回 `{kind:'written'|'conflict'|'refused',
 *  message?}`，pristine client.js 实证），冲突重试锚点与注入体同步改用新形态。 */
const SM_CONFLICT_ANCHOR = [
  '\t\t\t\t\t}], openedAt);',
  '\t\t\t\t\tif (written.kind !== "written") return written.kind === "conflict" ? t("conflict") : written.message;',
].join('\n');

const SM_CONFLICT_NEW = [
  '\t\t\t\t\t}], openedAt);',
  '\t\t\t\t\tif (written.kind !== "written") {',
  '\t\t\t\t\t\t// ' + CONFLICT_RETRY_MARKER + ': 卡片打开后命名空间被任何面写过一次，',
  '\t\t\t\t\t\t// openedAt 即陈旧——重读一次 revision 静默重试（ops 是 providers.<route>',
  '\t\t\t\t\t\t// 点位写，不会覆盖他人字段）；仍失败才把报错交回原路径。',
  '\t\t\t\t\t\tif (written.kind === "conflict") {',
  '\t\t\t\t\t\t\tconst fresh = await operations.describeSettings();',
  '\t\t\t\t\t\t\tconst freshRevision = fresh === void 0 ? void 0 : fresh.namespaces.find((row) => row.ns === NS$1)?.revision;',
  '\t\t\t\t\t\t\tif (freshRevision !== void 0 && freshRevision !== openedAt) {',
  '\t\t\t\t\t\t\t\tconst retry = await operations.writeSettings(NS$1, [{',
  '\t\t\t\t\t\t\t\t\top: "set",',
  '\t\t\t\t\t\t\t\t\tpath: ["providers", route],',
  '\t\t\t\t\t\t\t\t\tvalue: profile',
  '\t\t\t\t\t\t\t\t}], freshRevision);',
  '\t\t\t\t\t\t\t\tif (retry.kind === "written") {',
  '\t\t\t\t\t\t\t\t\tsetCommitted(true);',
  '\t\t\t\t\t\t\t\t\treturn;',
  '\t\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\t\treturn retry.message;',
  '\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t}',
  '\t\t\t\t\t\treturn written.kind === "conflict" ? t("conflict") : written.message;',
  '\t\t\t\t\t}',
].join('\n');

/** createModelsOperations 对象头锚点（全文件唯一）。0.1.2-alpha.2 起卡片组件拿不到
 *  ctx/api（只收 operations 回调面，pristine client.js 实证），冲突重试的重读走
 *  本补丁注入的 describeSettings 回调——与 SM_CONFLICT_NEW 成对注入。 */
const SM_OPS_ANCHOR = 'function createModelsOperations(ctx) {\n\t\t\treturn {\n\t\t\t\tdescribeCredential: async (ref) => {';
const SM_OPS_NEW = [
  'function createModelsOperations(ctx) {',
  '\t\t\treturn {',
  '\t\t\t\t// ' + CONFLICT_RETRY_MARKER + ': CustomProviderCard 的冲突重试需要重读 describe——',
  '\t\t\t\t// 0.1.2-alpha.2 起卡片拿不到 ctx，只能经由本回调取镜像源数据。',
  '\t\t\t\tdescribeSettings: async () => {',
  '\t\t\t\t\tconst response = await ctx.remote.settings.describe();',
  '\t\t\t\t\treturn response.ok ? response.value : void 0;',
  '\t\t\t\t},',
  '\t\t\t\tdescribeCredential: async (ref) => {',
].join('\n');

/**
 * transform：ui-settings-models 三处注入（幂等、锚点失配不改写、逐锚点独立）。
 * @param {string} src
 * @param {string} file
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformSettingsModelsResilience(src, file) {
  // 幂等判定必须「两类注入体都已在」才算 already：本文件含多相互独立的
  // 锚点，历史现场曾出现「只打上 namespace-heal、缺 conflict-retry」的半补丁
  // （早期锚点失配只注入其一，而 || 会让后续重跑在看到首个 marker 时提前
  // already，永远补不上另一半）。改为 && 后，半补丁会在下次应用时把缺失的
  // 注入体补全（逐锚点独立替换，已注入处其锚点自然不命中）。
  if (src.includes(NAMESPACE_HEAL_MARKER) && src.includes(CONFLICT_RETRY_MARKER)) {
    return { status: 'already' };
  }
  let next = src;
  let changed = false;
  const missing = [];
  if (src.includes(SM_NS_ANCHOR)) {
    next = next.replace(SM_NS_ANCHOR, () => SM_NS_NEW);
    changed = true;
  } else {
    missing.push('load() namespaces 构建行');
  }
  if (src.includes(SM_CONFLICT_ANCHOR)) {
    next = next.replace(SM_CONFLICT_ANCHOR, () => SM_CONFLICT_NEW);
    changed = true;
  } else {
    missing.push('CustomProviderCard mutate 尾锚点');
  }
  if (src.includes(SM_OPS_ANCHOR)) {
    next = next.replace(SM_OPS_ANCHOR, () => SM_OPS_NEW);
    changed = true;
  } else {
    missing.push('createModelsOperations 对象头');
  }
  if (!changed) {
    return {
      status: 'anchor-missing',
      detail: '未找到任何锚点（' + missing.join('、') + '，版本可能已变更），跳过 ' + file,
    };
  }
  return { status: 'changed', src: next };
}

// ---------------------------------------------------------------------------
// 应用入口（root 应用器契约：返回变更文件数）
// ---------------------------------------------------------------------------

/**
 * 对某个 node_modules 根目录应用孤儿锁自愈补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats]
 * @param {{dryRun?: boolean, donePrefix?: boolean, anchorLog?: Function}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchAtomicWriteOrphanLock(nmRoot, log = () => {}, stats, options = {}) {
  const file = path.join(nmRoot, '@deepseek-ai', ATOMIC_WRITE_REL);
  if (!fs.existsSync(file)) return 0;
  // CLI 场景经 applyRoot 透传 options：donePrefix=false 输出无前缀单行、
  // anchorLog=warn 把失配走告警通道、dryRun 只判定不落盘；stats 回流
  // anchorMissing/failed 计数。缺省保持原默认（log / true）。
  return applyPatchToFiles({
    prefix: '孤儿锁自愈补丁',
    files: [file],
    log,
    transform: transformOrphanLock,
    alreadyLog: (f) => '已应用，跳过 ' + f,
    doneLog: (f) => '已让设置写入在持有者进程死亡后自愈孤儿锁 ' + f,
    anchorLog: (options && options.anchorLog) || log,
    failLog: (f, err) => '孤儿锁自愈补丁失败(' + f + '): ' + err.message,
    donePrefix: options && options.donePrefix,
    dryRun: options && options.dryRun,
    dryRunChangedLog: (f) => 'dry-run: 将应用孤儿锁自愈 ' + f,
    stats,
  });
}

/**
 * 对某个 node_modules 根目录应用设置页韧性补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats]
 * @param {{dryRun?: boolean, donePrefix?: boolean, anchorLog?: Function}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchSettingsModelsResilience(nmRoot, log = () => {}, stats, options = {}) {
  const file = path.join(nmRoot, '@deepseek-ai', SETTINGS_MODELS_REL);
  if (!fs.existsSync(file)) return 0;
  // CLI 场景经 applyRoot 透传 options：donePrefix=false 输出无前缀单行、
  // anchorLog=warn 把失配走告警通道、dryRun 只判定不落盘；stats 回流
  // anchorMissing/failed 计数。缺省保持原默认（log / true）。
  return applyPatchToFiles({
    prefix: '设置页韧性补丁',
    files: [file],
    log,
    transform: transformSettingsModelsResilience,
    alreadyLog: (f) => '已应用，跳过 ' + f,
    doneLog: (f) => '已注入命名空间自愈 + 冲突重试 ' + f,
    anchorLog: (options && options.anchorLog) || log,
    failLog: (f, err) => '设置页韧性补丁失败(' + f + '): ' + err.message,
    donePrefix: options && options.donePrefix,
    dryRun: options && options.dryRun,
    dryRunChangedLog: (f) => 'dry-run: 将注入命名空间自愈 + 冲突重试 ' + f,
    stats,
  });
}

module.exports = {
  ATOMIC_WRITE_REL,
  SETTINGS_MODELS_REL,
  ORPHAN_LOCK_MARKER,
  NAMESPACE_HEAL_MARKER,
  CONFLICT_RETRY_MARKER,
  transformOrphanLock,
  transformSettingsModelsResilience,
  patchAtomicWriteOrphanLock,
  patchSettingsModelsResilience,
  // 注入体常量（单测构造 pristine 夹具用，与 transform 同源；非 marker）。
  AW_CONSTANTS: {
    IMPORT_ANCHOR: AW_IMPORT_ANCHOR,
    IMPORT_NEW: AW_IMPORT_NEW,
    CONTENTION_ANCHOR: AW_CONTENTION_ANCHOR,
    CONTENTION_NEW: AW_CONTENTION_NEW,
    HELPER_ANCHOR: AW_HELPER_ANCHOR,
    HELPER_INJECTION: AW_HELPER_INJECTION,
    SM_NS_ANCHOR: SM_NS_ANCHOR,
    SM_NS_NEW: SM_NS_NEW,
    SM_CONFLICT_ANCHOR: SM_CONFLICT_ANCHOR,
    SM_CONFLICT_NEW: SM_CONFLICT_NEW,
    SM_OPS_ANCHOR: SM_OPS_ANCHOR,
    SM_OPS_NEW: SM_OPS_NEW,
  },
};
