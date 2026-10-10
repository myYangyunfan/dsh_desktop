'use strict';

// ---------------------------------------------------------------------------
// loader 自动隔离补丁（loader-isolation）：单插件失败不拖垮整棵插件树。
//
// 上游 cordis-loader 在两处把单条目失败 re-throw 成整树崩溃：
//   · EntryGroup.update —— 条目 apply 失败（启动/HMR/热更新）；
//   · EntryTree.await —— fiber 结算失败（启动 settle）；
// dsh-app-boot 又在两处 fail-loud：
//   · assertEntriesLoaded / assertEntriesActivated —— 无 fiber / 未激活即抛；
//   · installFailLoud —— 就绪前的迟到 rejection 直接 exit(1)。
//
// 本模块把它们改写为「自动隔离」语义（与 loader 自身的
// `entry.options.disabled = true` 先例同族，但**不落盘**——落盘由壳层
// 观察 stderr 标记后经 plugin-core/quarantine 统一执行，避免 loader 与壳层
// 并发写 cordis.patch.yml）：
//   · 失败条目 → stderr 打 `[loader-isolation] entry <id> (<name>) ...`
//     标记并跳过，其余条目照常组合（其他功能完全不受影响）；
//   · 受保护的核心条目（@deepseek-ai/dsh-base / dsh-web-app）失败仍是
//     fatal——核心缺失是安装损坏，跳过只会让整树更糟；
//   · installFailLoud 在崩溃屏蔽已武装（DSH_CRASH_SHIELD_ARMED=1，即就绪
//     横幅之后）时不再 exit(1)，改为记录后返回——就绪后的插件运行时
//     rejection 不再杀死宿主；启动期仍保持 fail-fast（壳层启动自愈照常）。
//
// 同族还有一条**诊断线**（不是隔离线，判定面一字不动）：
//   · transformLoaderImportFailureReport / transformPromptAdmissionReasonReport
//     把两处「被静默吞掉的真实异常」原文补写进 stderr。动机是 mac 端彻查
//     2026-10-10：rc.2 起插件导入失败不再抛出，只 `ctx.logger.error(error)`，
//     而 cordis 默认 logger exporter 是纯内存环形缓冲（不打印），boot() 的诊断
//     exporter 收到的 warn/error 又只在抛 StartupError 时才落盘
//     <DSH_HOME>/logs/startup-*.log——我们的激活隔离让非核心条目不再抛
//     StartupError，三重叠加后日志只剩一行「failed to load」。prompt 准入链
//     同型：任何非 RemoteError 一律标成 session/agent-busy + "prompt rejected"，
//     真因只在 details.reason、UI 不渲染（发送文件恒报「agent 忙」的那条）。
//   · 注入的 stderr 写入各自 try 包裹：诊断绝不反噬宿主。
//   · 前缀 [loader-diagnostic] / [prompt-admission] 刻意避开壳层标记机
//     （plugin-core/lib/markers.js 只认 [loader-isolation] / [crash-shield]），
//     不额外喂一次 quarantine 事件。
//
// 所有 transform 为纯函数：锚点失配返回 anchor-missing（调用方告警跳过），
// 已注入返回 already（幂等）。锚点与 vendored rc.7 构建产物逐字节对齐
// （单测直接对 node_modules 真实产物断言命中）。
// ---------------------------------------------------------------------------

const LOADER_TREE_ISOLATION_MARKER = 'dsh-desktop isolation: a failed loader entry must not take down the tree';
const LOADER_ACTIVATION_ISOLATION_MARKER = 'dsh-desktop isolation: inactive entries are skipped instead of aborting the boot';
const FAIL_LOUD_ISOLATION_MARKER = 'dsh-desktop isolation: post-ready load failures are isolated';
const LOADER_IMPORT_REPORT_MARKER = 'dsh-desktop isolation: loader import failures keep their original error on stderr';
const PROMPT_ADMISSION_REASON_MARKER = 'dsh-desktop isolation: prompt admission keeps its original error on stderr';

// ── cordis-plugin-loader：EntryGroup.update 失败分支 ─────────────────────────
const LOADER_UPDATE_OUTCOMES_OLD = [
  '\t\t\tconst outcomes = await Promise.allSettled(config.map((options) => this.create(options)));',
  '\t\t\tif (this.ctx.fiber.uid === null) return;',
  '\t\t\tconst failures = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
  '\t\t\tif (failures.length === 1) throw failures[0];',
  '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader entries failed to apply");',
].join('\n');

const LOADER_UPDATE_OUTCOMES_NEW = [
  '\t\t\tconst outcomes = await Promise.allSettled(config.map((options) => this.create(options)));',
  '\t\t\tif (this.ctx.fiber.uid === null) return;',
  '\t\t\tconst failures = [];',
  '\t\t\tfor (let _oIdx = 0; _oIdx < outcomes.length; _oIdx += 1) {',
  '\t\t\t\tconst _o = outcomes[_oIdx];',
  '\t\t\t\tif (_o.status === "rejected") failures.push({ options: config[_oIdx], reason: _o.reason });',
  '\t\t\t}',
  '\t\t\tisolateEntryApplyFailures(failures);',
].join('\n');

// ── cordis-plugin-loader：EntryTree.await 失败分支 ───────────────────────────
const LOADER_AWAIT_FAILURES_OLD = [
  '\t\t\tconst failures = (await Promise.allSettled([...this.entries()].map((entry) => entry._await()))).filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
  '\t\t\tif (failures.length === 1) throw failures[0];',
  '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader fibers failed");',
].join('\n');

const LOADER_AWAIT_FAILURES_NEW = [
  '\t\t\tconst _settled = await Promise.allSettled([...this.entries()].map((entry) => entry._await().then(() => null, (reason) => ({ entry, reason }))));',
  '\t\t\tconst failures = _settled.filter((outcome) => outcome.status === "fulfilled" && outcome.value !== null).map((outcome) => outcome.value);',
  '\t\t\tisolateFiberFailures(failures);',
].join('\n');

// 两个 helper 注入到 updateError 声明之前（模块作用域，函数声明提升）。
const LOADER_HELPERS_ANCHOR = 'function updateError(stage, options, cause) {';
const LOADER_HELPERS_CODE = [
  'const LOADER_PROTECTED_ENTRY_NAMES = new Set(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]);',
  'function loaderIsolationDetail(reason) {',
  '\treturn reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);',
  '}',
  'function isolateEntryApplyFailures(failures) {',
  '\tconst fatal = [];',
  '\tfor (const { options, reason } of failures) {',
  '\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(options.name)) { fatal.push(reason); continue; }',
  '\t\tprocess.stderr.write(`[loader-isolation] entry ${options.id} (${options.name}) failed to apply: ${loaderIsolationDetail(reason)}\\n`);',
  '\t}',
  '\tif (fatal.length === 1) throw fatal[0];',
  '\tif (fatal.length > 1) throw new AggregateError(fatal, "loader entries failed to apply");',
  '}',
  'function isolateFiberFailures(failures) {',
  '\tconst fatal = [];',
  '\tfor (const { entry, reason } of failures) {',
  '\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(entry.options.name)) { fatal.push(reason); continue; }',
  '\t\tprocess.stderr.write(`[loader-isolation] entry ${entry.options.id} (${entry.options.name}) failed: ${loaderIsolationDetail(reason)}\\n`);',
  '\t}',
  '\tif (fatal.length === 1) throw fatal[0];',
  '\tif (fatal.length > 1) throw new AggregateError(fatal, "loader fibers failed");',
  '}',
].join('\n');

/**
 * cordis-plugin-loader/lib/index.js 变换：EntryGroup.update / EntryTree.await
 * 失败分支 → 自动隔离（受保护核心仍 fatal）。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformLoaderTreeIsolation(src, file) {
  // CRLF 归一化匹配（上游重构/换行风格漂移不应击穿隔离）；写回保持原 EOL。
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  // 幂等判定 = marker 存在 **且** 注入体存在（仅 marker 残留的损坏文件必须重注入）。
  const injected = text.includes('function isolateEntryApplyFailures(') && text.includes('function isolateFiberFailures(');
  if (text.includes(LOADER_TREE_ISOLATION_MARKER) && injected) return { status: 'already' };
  if (!text.includes(LOADER_UPDATE_OUTCOMES_OLD) || !text.includes(LOADER_AWAIT_FAILURES_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 loader 失败分支锚点（版本可能已变更），跳过 ' + file };
  }
  if (!text.includes(LOADER_HELPERS_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 loader helper 注入锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(LOADER_UPDATE_OUTCOMES_OLD, LOADER_UPDATE_OUTCOMES_NEW);
  out = out.replace(LOADER_AWAIT_FAILURES_OLD, LOADER_AWAIT_FAILURES_NEW);
  out = out.replace(LOADER_HELPERS_ANCHOR, LOADER_HELPERS_CODE + '\n\n' + LOADER_HELPERS_ANCHOR);
  if (!out.includes(LOADER_TREE_ISOLATION_MARKER)) out = '// ' + LOADER_TREE_ISOLATION_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ── dsh-app-boot：boot 审计自动隔离 ─────────────────────────────────────────
const APP_BOOT_BOOT_CALL_OLD = [
  '\t\tawait ctx.get("loader")?.await();',
  '\t\tif (ctx.get("loader") === void 0) return ctx;',
  '\t\tawait auditStartupEntries(ctx, binName);',
].join('\n');
const APP_BOOT_BOOT_CALL_NEW = [
  '\t\tawait ctx.get("loader")?.await();',
  '\t\tif (ctx.get("loader") === void 0) return ctx;',
  '\t\tawait isolateInactiveEntries(ctx, binName);',
].join('\n');

const APP_BOOT_INSERT_ANCHOR = 'function composeEntries(layers, warn = () => {}) {';
const APP_BOOT_ISOLATION_CODE = [
  'const LOADER_PROTECTED_ENTRY_NAMES = new Set(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]);',
  'async function isolateInactiveEntries(ctx, binName) {',
  '\tconst report = (entry, reason) => {',
  '\t\tprocess.stderr.write(`[loader-isolation] entry ${entry.options.id} (${entry.options.name}): ${reason}\\n`);',
  '\t};',
  '\tconst fatal = [];',
  '\tfor (const entry of ctx.loader.entries()) {',
  '\t\tif (entry.fiber === void 0 && !entry.disabled) {',
  '\t\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(entry.options.name)) fatal.push(`${entry.options.name}: failed to load`);',
  '\t\t\telse report(entry, "failed to load — auto-isolated (other plugins unaffected)");',
  '\t\t}',
  '\t}',
  '\tfor (const entry of ctx.loader.entries()) {',
  '\t\tconst fiber = entry.fiber;',
  '\t\tif (fiber === void 0 || entry.disabled) continue;',
  '\t\tconst state = fiber.state;',
  '\t\tif (state === FIBER_ACTIVE) continue;',
  '\t\tif (state === FIBER_FAILED) {',
  '\t\t\ttry {',
  '\t\t\t\tawait fiber.await();',
  '\t\t\t} catch (error) {',
  '\t\t\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(entry.options.name)) fatal.push(`${entry.options.name}: ${formatActivationError(error)}`);',
  '\t\t\t\telse report(entry, "failed to activate: " + (error instanceof Error ? error.message : String(error)) + " — auto-isolated (other plugins unaffected)");',
  '\t\t\t}',
  '\t\t\tcontinue;',
  '\t\t}',
  '\t\tif (state === FIBER_PENDING) {',
  '\t\t\tconst missing = Object.keys(fiber.inject).filter((service) => fiber.ctx.get(service) === void 0);',
  '\t\t\tconst reason = "pending (waiting for " + (missing.join(", ") || "unknown") + ") — auto-isolated (other plugins unaffected)";',
  '\t\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(entry.options.name)) fatal.push(`${entry.options.name}: ${reason}`);',
  '\t\t\telse report(entry, reason);',
  '\t\t\tcontinue;',
  '\t\t}',
  '\t\tif (LOADER_PROTECTED_ENTRY_NAMES.has(entry.options.name)) fatal.push(`${entry.options.name}: fiber state ${String(state)}`);',
  '\t\telse report(entry, "fiber state " + String(state) + " — auto-isolated (other plugins unaffected)");',
  '\t}',
  '\tif (fatal.length > 0) throw new Error(`${binName}: core plugin(s) failed:\\n${fatal.join("\\n")}`);',
  '}',
].join('\n');

/**
 * dsh-app-boot/lib/index.js 变换：boot 的激活审计改为自动隔离
 * （无 fiber / 未激活 / pending 条目跳过并打标记；受保护核心仍 fatal）。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformLoaderActivationIsolation(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const injected = text.includes('async function isolateInactiveEntries(');
  if (text.includes(LOADER_ACTIVATION_ISOLATION_MARKER) && injected) return { status: 'already' };
  if (!text.includes(APP_BOOT_BOOT_CALL_OLD) || !text.includes(APP_BOOT_INSERT_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 boot 审计锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(APP_BOOT_BOOT_CALL_OLD, APP_BOOT_BOOT_CALL_NEW);
  out = out.replace(APP_BOOT_INSERT_ANCHOR, APP_BOOT_ISOLATION_CODE + '\n\n' + APP_BOOT_INSERT_ANCHOR);
  if (!out.includes(LOADER_ACTIVATION_ISOLATION_MARKER)) out = '// ' + LOADER_ACTIVATION_ISOLATION_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ── dsh-app-boot：installFailLoud 就绪后不再 exit ────────────────────────────
const FAIL_LOUD_NO_RELEASE_OLD = [
  '\t\tif (release === void 0) {',
  '\t\t\tproc.exit(1);',
  '\t\t\treturn;',
  '\t\t}',
].join('\n');
const FAIL_LOUD_NO_RELEASE_NEW = [
  '\t\tif (release === void 0) {',
  '\t\t\tif (process.env.DSH_CRASH_SHIELD_ARMED === "1") {',
  '\t\t\t\tproc.stderr.write(`[crash-shield] isolated fatal load failure: ${err instanceof Error ? err.message : String(err)}\\n`);',
  '\t\t\t\treturn;',
  '\t\t\t}',
  '\t\t\tproc.exit(1);',
  '\t\t\treturn;',
  '\t\t}',
].join('\n');
const FAIL_LOUD_RELEASE_BLOCK_OLD = [
  '\t\t(async () => {',
  '\t\t\tlet timer;',
  '\t\t\ttry {',
  '\t\t\t\tawait Promise.race([(async () => release())(), new Promise((resolve) => {',
  '\t\t\t\t\ttimer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);',
  '\t\t\t\t})]);',
  '\t\t\t} catch {}',
  '\t\t\tclearTimeout(timer);',
  '\t\t\tproc.exit(1);',
  '\t\t})();',
].join('\n');
// 就绪后（已武装）绝不能执行 release：release 是「退出前把终端/插件树交还」的
// 拆除钩子——宿主要继续运行，执行它会把整棵树拆掉而进程存活（僵尸）。
// 武装判定必须在 release 之前，直接记录并返回。
const FAIL_LOUD_RELEASE_BLOCK_NEW = [
  '\t\t(async () => {',
  '\t\t\tif (process.env.DSH_CRASH_SHIELD_ARMED === "1") {',
  '\t\t\t\tproc.stderr.write(`[crash-shield] isolated fatal load failure: ${err instanceof Error ? err.message : String(err)}\\n`);',
  '\t\t\t\treturn;',
  '\t\t\t}',
  '\t\t\tlet timer;',
  '\t\t\ttry {',
  '\t\t\t\tawait Promise.race([(async () => release())(), new Promise((resolve) => {',
  '\t\t\t\t\ttimer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);',
  '\t\t\t\t})]);',
  '\t\t\t} catch {}',
  '\t\t\tclearTimeout(timer);',
  '\t\t\tproc.exit(1);',
  '\t\t})();',
].join('\n');

// 旧 transform 注入的「先 release 后判 armed」形态（已废弃；用于修复已打补丁的
// dev 树：release 先执行会把插件树拆掉而进程存活 → 僵尸宿主）。
const FAIL_LOUD_RELEASE_BLOCK_OLD_INJECTED = [
  '\t\t(async () => {',
  '\t\t\tlet timer;',
  '\t\t\ttry {',
  '\t\t\t\tawait Promise.race([(async () => release())(), new Promise((resolve) => {',
  '\t\t\t\t\ttimer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);',
  '\t\t\t\t})]);',
  '\t\t\t} catch {}',
  '\t\t\tclearTimeout(timer);',
  '\t\t\tif (process.env.DSH_CRASH_SHIELD_ARMED === "1") {',
  '\t\t\t\tproc.stderr.write(`[crash-shield] isolated fatal load failure: ${err instanceof Error ? err.message : String(err)}\\n`);',
  '\t\t\t\treturn;',
  '\t\t\t}',
  '\t\t\tproc.exit(1);',
  '\t\t})();',
].join('\n');

/**
 * dsh-app-boot/lib/index.js 变换：installFailLoud 在崩溃屏蔽已武装
 * （就绪横幅之后）时不再 exit(1)——就绪后的插件 rejection 被隔离；
 * 启动期（未武装）保持 fail-fast。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformFailLoudIsolation(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  // 幂等判定 = marker 存在 且 新形态注入体存在；仅 marker 残留（或旧形态
  // 「先 release 后判 armed」）都进入修复路径。
  if (text.includes(FAIL_LOUD_ISOLATION_MARKER) && text.includes(FAIL_LOUD_RELEASE_BLOCK_NEW)) return { status: 'already' };
  // 修复路径 1：旧注入形态 → 替换为「武装判定先于 release」的新形态。
  if (text.includes(FAIL_LOUD_RELEASE_BLOCK_OLD_INJECTED)) {
    const out = text.replace(FAIL_LOUD_RELEASE_BLOCK_OLD_INJECTED, FAIL_LOUD_RELEASE_BLOCK_NEW);
    return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
  }
  if (!text.includes(FAIL_LOUD_NO_RELEASE_OLD) || !text.includes(FAIL_LOUD_RELEASE_BLOCK_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 installFailLoud 锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(FAIL_LOUD_NO_RELEASE_OLD, FAIL_LOUD_NO_RELEASE_NEW);
  out = out.replace(FAIL_LOUD_RELEASE_BLOCK_OLD, FAIL_LOUD_RELEASE_BLOCK_NEW);
  if (!out.includes(FAIL_LOUD_ISOLATION_MARKER)) out = '// ' + FAIL_LOUD_ISOLATION_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ── cordis-plugin-loader：导入失败真身（诊断，不改判定）──────────────────────
//
// 0.2.0-rc.2 起插件「导入失败」不再抛出（Entry._init 只 ctx.logger.error + return，
// 条目就此没有 fiber）。而 cordis 默认 logger exporter 是纯内存环形缓冲
// （cordis/lib/index.js 只 push 进 self.buffer，不打印），boot() 另挂的诊断 exporter
// 收下的 warn/error 也只在抛 StartupError 时由 bin.js reportStartupFailure 落盘。
// 我们的 loader-activation-isolation 让非核心条目不再抛 StartupError——于是真实
// 导入错误三重静默，只剩一行「failed to load」。mac 端 9 个伴随插件 + 首启「未能
// 保存设置」排查两轮发布无果，缺的就是这一行原文。
// 本补丁只在 catch 体首插入一次 stderr 写入（try 包裹，诊断绝不反噬宿主）。
const LOADER_IMPORT_CATCH_OLD = [
  '\t\t\texports = await this.parent.tree.import(this.options.name, this.getOuterStack);',
  '\t\t} catch (error) {',
  '\t\t\tthis.ctx.logger.error(error);',
].join('\n');

const LOADER_IMPORT_CATCH_NEW = [
  '\t\t\texports = await this.parent.tree.import(this.options.name, this.getOuterStack);',
  '\t\t} catch (error) {',
  '\t\t\ttry {',
  '\t\t\t\tconst _ir = [];',
  '\t\t\t\tfor (let _ie = error, _in = 0; _in < 5 && _ie; _in += 1) { _ir.push(_ie.stack ?? String(_ie)); _ie = _ie.cause; }',
  '\t\t\t\tprocess.stderr.write(`[loader-diagnostic] entry ${this.options.id} (${this.options.name}) import failed: ${_ir.join(" <- ").slice(0, 6000)}\\n`);',
  '\t\t\t} catch {}',
  '\t\t\tthis.ctx.logger.error(error);',
].join('\n');

/**
 * cordis-plugin-loader/lib/index.js 变换：Entry._init 的导入失败 catch 补一行
 * stderr 原文（含 cause 链），只加日志、不改控制流与返回值。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformLoaderImportFailureReport(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const injected = text.includes('[loader-diagnostic] entry ');
  if (text.includes(LOADER_IMPORT_REPORT_MARKER) && injected) return { status: 'already' };
  if (!text.includes(LOADER_IMPORT_CATCH_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 loader 导入失败锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(LOADER_IMPORT_CATCH_OLD, LOADER_IMPORT_CATCH_NEW);
  if (!out.includes(LOADER_IMPORT_REPORT_MARKER)) out = '// ' + LOADER_IMPORT_REPORT_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ── dsh-api-session-controller：prompt 准入 catch-all 真身 ──────────────────
//
// 准入链（模型图像能力 → 附件回执 → admitPromptContent → bindPrompt → steer/followup）
// 的兜底分支把**任何**非 RemoteError 一律标成 session/agent-busy + "prompt rejected"，
// 真实原因只落在 details.reason，UI 不渲染——用户看到「agent 忙」，实际可能是磁盘/
// 权限/模块身份问题（发送文件恒报此错的排查即卡在此）。本补丁：① 原始异常全文进
// stderr；② 报文带上原因摘要（code 不动，避免牵动 error-codes 契约与前端分支）。
const PROMPT_ADMISSION_CATCHALL_OLD = '\t\t\t\tthrow new RemoteError("session/agent-busy", "prompt rejected", { reason: String(error) });';

const PROMPT_ADMISSION_CATCHALL_NEW = [
  '\t\t\t\ttry {',
  '\t\t\t\t\tconst _pr = [];',
  '\t\t\t\t\tfor (let _pe = error, _pn = 0; _pn < 5 && _pe; _pn += 1) { _pr.push(_pe.stack ?? String(_pe)); _pe = _pe.cause; }',
  '\t\t\t\t\tprocess.stderr.write(`[prompt-admission] 准入链非 RemoteError 异常（被标为 session/agent-busy）: ${_pr.join(" <- ").slice(0, 6000)}\\n`);',
  '\t\t\t\t} catch {}',
  '\t\t\t\tthrow new RemoteError("session/agent-busy", `prompt rejected: ${String(error && error.message ? error.message : error).slice(0, 400)}`, { reason: String(error) });',
].join('\n');

/**
 * dsh-api-session-controller/lib/index.js 变换：prompt 准入兜底分支补 stderr 原文，
 * 并把原因摘要带进报文（RemoteError 的 code 与 details.reason 保持不变）。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformPromptAdmissionReasonReport(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const injected = text.includes('[prompt-admission] 准入链非 RemoteError 异常');
  if (text.includes(PROMPT_ADMISSION_REASON_MARKER) && injected) return { status: 'already' };
  if (!text.includes(PROMPT_ADMISSION_CATCHALL_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 prompt 准入兜底锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(PROMPT_ADMISSION_CATCHALL_OLD, PROMPT_ADMISSION_CATCHALL_NEW);
  if (!out.includes(PROMPT_ADMISSION_REASON_MARKER)) out = '// ' + PROMPT_ADMISSION_REASON_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

module.exports = {
  LOADER_TREE_ISOLATION_MARKER,
  LOADER_ACTIVATION_ISOLATION_MARKER,
  FAIL_LOUD_ISOLATION_MARKER,
  LOADER_IMPORT_REPORT_MARKER,
  PROMPT_ADMISSION_REASON_MARKER,
  markers: {
    LOADER_TREE_ISOLATION_MARKER,
    LOADER_ACTIVATION_ISOLATION_MARKER,
    FAIL_LOUD_ISOLATION_MARKER,
    LOADER_IMPORT_REPORT_MARKER,
    PROMPT_ADMISSION_REASON_MARKER,
  },
  transformLoaderTreeIsolation,
  transformLoaderActivationIsolation,
  transformFailLoudIsolation,
  transformLoaderImportFailureReport,
  transformPromptAdmissionReasonReport,
};
