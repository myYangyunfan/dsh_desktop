'use strict';

// ---------------------------------------------------------------------------
// 首启引导补丁（目标 @deepseek-ai/dsh-client-ui-settings-account/lib/client.js）。
//
// 症状：Windows 部分机型「点击开始设置没反应」。
//
// 实测根因不是设置没写进去——写成功了，而是**步骤推进被渲染时间线扣住**：引导的 step
// 效果（client.js:3852-3874）只在 `element.animate(...).finished` resolve 时才
// `setStep(targetStep)`，rejection 被空函数吞掉；而 `busy = … || step !== targetStep`
// （:3851）。文档处于隐藏/未合成状态（最小化、关到托盘、被遮挡、RDP、GPU 合成退化）时
// 渲染时间线整段停摆：本机内嵌 Chromium 表面实测 3.4 秒内 `document.timeline.currentTime`
// 推进 0ms、`playState=running`、`currentTime=0`、`finished` 始终 PENDING，同期
// `setTimeout(3000)` 正常到点——冻结只发生在时间线，JS 照跑。于是按钮永久 disabled，
// 而内核那条错误面板只在 `state.error` 时出现（写入成功 ⇒ 不出现）⇒ 用户读到「没反应」。
// 系统里关掉「动画效果」（prefers-reduced-motion）的用户天然走即时回落，不受影响——
// 这就是「部分机型」。
//
// ① onboarding-step-progress-timeout：给步骤推进加一条有界回落，不再依赖出帧。
//   400ms 上限：动画本身只有 40ms；隐藏态这一刻用户看不到动画，即时推进零损失，
//   可见态最多多等 0.4 秒。只有真的走了回落才留一行 `[onboarding-timeline]` 诊断——
//   现场要核的就是「停摆发生过几次、在什么 visibility/出帧状态下」。
//   原生那两条回落（animate 不存在 / prefers-reduced-motion）一律不动。
// ② onboarding-guard-report：`controller.update()/complete()` 有五条 guard 直接
//   `return false`（:3109-3111、:3135），而调用点 `update: (change) => controller.update(change)`
//   （:4462-4463）把返回值丢弃、控制器区间内零日志（实测 grep 计数 0）——命中即彻底静默。
//   本补丁只在结果为 false 时把「命中了哪条 guard」报出去，**返回值与控制流一字不动**
//   （`.then(ok => (report(ok), ok))` 原样透传）。
//
// 两条都不依赖 DSH_TAURI_DIAG：诊断走既有 `page_error` 命令（GUI 子系统下唯一的页面
// 落盘口，eprintln + supervisor::file_log → desktop.log），bridge-shim 的 alert polyfill
// 已经在这条通道上跑了很久。浏览器直连内核（无 __TAURI_INTERNALS__）回落 console.warn。
//
//  reporter 各写一份、不共享：① 与 ② 是两个独立锚点，若 ② 因版本漂移 anchor-missing
// 而 ① 引了 ② 定义的函数，注入体自己就会 ReferenceError——把可观测性做成新的故障源。
// ---------------------------------------------------------------------------

// marker 文本必须走 `dsh-desktop guard:<空格>` 这一族前缀：scripts/compat/patch-surface.js
// 的 MARKER_RE 只采集 patch/fix/compat/guard/isolation 五个词，写成别的词就不会进补丁干预面
// 快照（＝漂移锁看不见这两条靶）。注意别在 scripts 子树里把该形态当散文引用——正则会把冒号后
// 的省略号本身咬成一个标记家族，一个字符的标记能命中上百个文件。
const ONBOARDING_STEP_TIMEOUT_MARKER = 'dsh-desktop guard: onboarding step advance must not depend on a rendering frame';
const ONBOARDING_GUARD_REPORT_MARKER = 'dsh-desktop guard: onboarding silent update/complete guards report which guard fired';

// ── ① 步骤推进的有界回落 ────────────────────────────────────────────────────
// 0.2.2-rc.2 重锚：客户端的 lib/client.js 整包改成**压缩产物**（本包 178KB / 3 行），
// 上一代按 4-tab 缩进写的多行锚点在新字节里 0 命中。锚点因此改为压缩态的
// 「缩进无关、单行、逐字节」子串；注入体也写成单行（源文件本身已是单行，插换行
// 只会让后续核对更难读）。语义与上一代逐字等价。
const STEP_GATE_OLD = 'animation.finished.then(()=>{setStep(targetStep)},_error=>{});return()=>{animation.cancel()}';

const STEP_GATE_NEW = [
  '\t\t\t\tconst __dshOnbAdvanced = { done: false };',
  '\t\t\t\tconst __dshOnbAdvance = () => {',
  '\t\t\t\t\tif (__dshOnbAdvanced.done) return;',
  '\t\t\t\t\t__dshOnbAdvanced.done = true;',
  '\t\t\t\t\tsetStep(targetStep);',
  '\t\t\t\t};',
  '\t\t\t\tanimation.finished.then(__dshOnbAdvance, (_error) => {});',
  '\t\t\t\tconst __dshOnbFallback = setTimeout(() => {',
  '\t\t\t\t\tif (__dshOnbAdvanced.done) return;',
  '\t\t\t\t\tconst __dshOnbLine = "[onboarding-timeline] 渲染时间线未推进，步骤推进改走有界回落: step=" + step + " -> " + targetStep + " visibility=" + document.visibilityState + " playState=" + animation.playState + " currentTime=" + animation.currentTime;',
  '\t\t\t\t\ttry {',
  '\t\t\t\t\t\tif (globalThis.__TAURI_INTERNALS__ && globalThis.__TAURI_INTERNALS__.invoke) globalThis.__TAURI_INTERNALS__.invoke("page_error", { message: __dshOnbLine });',
  '\t\t\t\t\t\telse if (globalThis.console) console.warn(__dshOnbLine);',
  '\t\t\t\t\t} catch {}',
  '\t\t\t\t\t__dshOnbAdvance();',
  '\t\t\t\t}, 400);',
  '\t\t\t\treturn () => {',
  '\t\t\t\t\tclearTimeout(__dshOnbFallback);',
  '\t\t\t\t\tanimation.cancel();',
  '\t\t\t\t};',
].join('\n');

/**
 * client.js 变换：引导步骤的淡出动画完成后才推进，改成「动画完成 **或** 400ms 到点」谁先到算谁。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformOnboardingStepProgressTimeout(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const injected = text.includes('[onboarding-timeline] 渲染时间线未推进');
  if (text.includes(ONBOARDING_STEP_TIMEOUT_MARKER) && injected) return { status: 'already' };
  if (!text.includes(STEP_GATE_OLD)) {
    return { status: 'anchor-missing', detail: '未找到引导步骤动画锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(STEP_GATE_OLD, STEP_GATE_NEW);
  if (!out.includes(ONBOARDING_STEP_TIMEOUT_MARKER)) out = '// ' + ONBOARDING_STEP_TIMEOUT_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ── ② 静默 guard 的成因上报 ─────────────────────────────────────────────────
// 0.2.2-rc.2 重锚：锚点取自压缩态单行文本——`...controller.dispose()},"account:
// desktop onboarding lifetime")` 这个 effect 标签在包内唯一，且它正是原先多行锚点
// `ctx.effect(() => () => { controller.dispose();` 的同一位置。
const GUARD_HELPER_ANCHOR = 'ctx.effect(()=>()=>{controller.dispose()},`account: desktop onboarding lifetime`)';

const GUARD_HELPER_NEW = [
  'const __dshOnbGuardReport=(kind,ok)=>{',
  'if(ok!==false)return;',
  'const __dshOnbView=controller.account.getSnapshot().view;',
  'const __dshOnbSaved=controller.readProgress();',
  'const __dshOnbWhy=controller.disposed?"disposed"',
  ':controller.completing?"completing"',
  ':controller.saving&&controller.draft===void 0?"saving-in-flight"',
  ':__dshOnbView?.status!=="credential-stored"?"account="+(__dshOnbView?.status??"none")',
  ':__dshOnbSaved===void 0?"progress=undefined"',
  ':__dshOnbSaved.step==="done"?"progress=done"',
  ':"unknown";',
  'const __dshOnbLine="[onboarding-guard] "+kind+" 被 guard 静默拒绝("+__dshOnbWhy+") step="+(__dshOnbSaved?.step??"none");',
  'try{',
  'if(globalThis.__TAURI_INTERNALS__&&globalThis.__TAURI_INTERNALS__.invoke)globalThis.__TAURI_INTERNALS__.invoke("page_error",{message:__dshOnbLine});',
  'else if(globalThis.console)console.warn(__dshOnbLine);',
  '}catch{}',
  '};',
  GUARD_HELPER_ANCHOR,
].join('');

const GUARD_CALLS_OLD = 'update:change=>controller.update(change),complete:reason=>controller.complete(reason),';

const GUARD_CALLS_NEW = [
  'update:change=>controller.update(change).then(__dshOnbOk=>(__dshOnbGuardReport("update", __dshOnbOk), __dshOnbOk)),',
  'complete:reason=>controller.complete(reason).then(__dshOnbOk=>(__dshOnbGuardReport("complete", __dshOnbOk), __dshOnbOk)),',
].join('');

/**
 * client.js 变换：update/complete 的返回值被调用点丢弃、guard 命中零日志——补一条成因上报，
 * 返回值与控制流不动。
 * @returns {{status:'already'|'anchor-missing'|'changed', src?: string, detail?: string}}
 */
function transformOnboardingGuardReport(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const injected = text.includes('[onboarding-guard] ') && text.includes('__dshOnbGuardReport("update"');
  if (text.includes(ONBOARDING_GUARD_REPORT_MARKER) && injected) return { status: 'already' };
  if (!text.includes(GUARD_HELPER_ANCHOR) || !text.includes(GUARD_CALLS_OLD)) {
    return { status: 'anchor-missing', detail: '未找到引导 guard 锚点（版本可能已变更），跳过 ' + file };
  }
  let out = text.replace(GUARD_HELPER_ANCHOR, GUARD_HELPER_NEW).replace(GUARD_CALLS_OLD, GUARD_CALLS_NEW);
  if (!out.includes(ONBOARDING_GUARD_REPORT_MARKER)) out = '// ' + ONBOARDING_GUARD_REPORT_MARKER + '\n' + out;
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

module.exports = {
  ONBOARDING_STEP_TIMEOUT_MARKER,
  ONBOARDING_GUARD_REPORT_MARKER,
  markers: {
    ONBOARDING_STEP_TIMEOUT_MARKER,
    ONBOARDING_GUARD_REPORT_MARKER,
  },
  STEP_GATE_OLD,
  STEP_GATE_NEW,
  GUARD_HELPER_ANCHOR,
  GUARD_HELPER_NEW,
  GUARD_CALLS_OLD,
  GUARD_CALLS_NEW,
  transformOnboardingStepProgressTimeout,
  transformOnboardingGuardReport,
};
