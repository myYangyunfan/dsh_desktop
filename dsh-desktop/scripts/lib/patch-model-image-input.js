'use strict';

// patch-model-image-input.js — 模型设置页逐模型「支持图片输入」勾选。
//
// 背景（2026-09-05 用户故障「某些多模态模型依旧说不支持图片」定案）：
//
//   因果链（每一环都已逐字核对产物）——
//   1) 用户 provider（llm-pi-ai 手声明路由，如 jiyuan / qwen-token-plan-cn）的
//      settings.yaml 里 models[] 条目只写 id/name/contextWindow/maxTokens，
//      从不写 `input`——因为设置页根本没有这个控件。
//   2) dsh-llm-pi-ai 逐模型解析优先级（lib/index.js:672）：
//        input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]
//      手声明路由无 catalog 基条目、路由又未写 defaultInput → 回落
//      DEFAULT_INPUT = ["text"]（:883）。注意这是「已声明为纯文本」而非
//      「未声明」：resolveModel 仍返回 inputModalities: [...resolvedModel.input]
//      （:1760），恒为数组、恒非 undefined。
//   3) 于是两处下游同时按文本模型处理：
//      · 服务端门槛 dsh-api-session-controller/lib/index.js:753（image-send-fix
//        重锚处）判定 !inputModalities.includes("image") → 走 VLM 转述；转述失败
//        即抛 MODEL_DOES_NOT_SUPPORT_IMAGES → 客户端 attachmentErrorText 映射为
//        「当前模型不支持图片，请切换支持图片的模型」（正是用户所见文案）。
//      · 即便绕过门槛，dsh-llm/lib/index.js:1701 projectImagesForTextModel 会把
//        图片替换为确定性文字占位再发出 → 模型确实收不到图，于是它自己回答
//        「我无法看图片/不支持图片」。
//
//   上游把 ["text"] 当默认是有意为之（pi-ai :873-882 注释：少报=发送前拒并点名
//   模型，多报=消息已持久化后中途失败、会话反复重试），且 MODALITIES 仅
//   text/image 两种（:274）——「视频」在 schema 层不存在，写进去会被 zod 拒，
//   故本补丁只做图片。正解是让用户按模型自报能力，而不是放宽全局默认。
//
// 修复（只加控件，不改判定语义）：在 pi-ai 布局 ModelListEditor 的逐行展开区
// （「容量」grid，已含 contextWindow / maxTokens 两格）追加第三格 checkbox：
//   · 勾选 → patch(index, { input: ["text", "image"] })
//   · 取消 → patch(index, { input: ["text"] })（显式声明，不删键——删键会退回
//     路由默认/内置目录，语义随路由而异，勾选框不该有这种歧义）
// 写回链路无需改动：pathOps 是通用 key 级 diff，把整个 models 数组作为
// providers.<route>.models 一次 set，未知字段不被裁剪；draftAt 用 structuredClone
// 原样取用户段，故草稿回读也带得住 input。宿主侧 pi-ai section schema 本就
// 认 input（modelFields:947），写入合法。
//
// 附带 adopt()：该函数是字段白名单（id/name/contextWindow/maxTokens），端点在
// 「获取模型」里自报的模态原本会被静默丢弃；改为保留 image 声明，让用户从
// 端点目录挑选即自动勾好，不必再手工点一次。
//
// 幂等 / 容错契约对齐 scripts/lib 既有补丁：三组注入各自 marker，全部命中才
// already（半补丁会在下次应用时补全，见 patch-settings-write-resilience 的
// 同类教训）；锚点失配（上游重构）不改写、anchor-missing 自动退役；UI 两处
// 锚点必须同时命中，避免「有 helper 无控件」的半成品落盘。

const path = require('node:path');
const fs = require('node:fs');
const { applyPatchToFiles } = require('./patch-engine');

/** 目标文件（相对 node_modules/@deepseek-ai 根）。 */
const MODEL_IMAGE_INPUT_REL = path.join('dsh-client-ui-settings-models', 'lib', 'client.js');

/** 幂等 marker（产物注释 + 单测同源）。 */
const IMAGE_INPUT_UI_MARKER = 'dsh-desktop patch (model image-input checkbox)';
const IMAGE_INPUT_I18N_MARKER = 'dsh-desktop patch (model image-input locale)';
const IMAGE_INPUT_ADOPT_MARKER = 'dsh-desktop patch (model image-input adopt)';

// ---------------------------------------------------------------------------
// 注入一：helper + 逐行勾选控件（pi-ai 布局 ModelListEditor）
// ---------------------------------------------------------------------------

/** helper 注入锚点：numberOf 整块（2-tab，全文件唯一）。 */
const MII_HELPER_ANCHOR = [
  "\t\t/** A row's numeric field, or `undefined` when unset or not a number. */",
  '\t\tfunction numberOf(model, key) {',
  '\t\t\tconst value = model[key];',
  '\t\t\treturn typeof value === "number" ? value : void 0;',
  '\t\t}',
].join('\n');

const MII_HELPER_NEW = MII_HELPER_ANCHOR + '\n' + [
  '\t\t/**',
  `\t\t * ${IMAGE_INPUT_UI_MARKER}: 该行是否声明可收图片。`,
  '\t\t * pi-ai 的 models[] 条目不写 input 时一律回落路由默认，而默认写死',
  '\t\t * ["text"]——中转/自建路由的模型没有内置目录基条目可继承，于是真正',
  '\t\t * 能看图的多模态模型被当成文本模型（门槛拒绝或图片被投影成文字）。',
  '\t\t * 这里只做读取，不改判定语义：勾选=显式声明，未勾选=沿用原行为。',
  '\t\t */',
  '\t\tfunction imageInputOf(model) {',
  '\t\t\tconst value = model["input"];',
  '\t\t\treturn Array.isArray(value) && value.includes("image");',
  '\t\t}',
].join('\n');

/** 控件注入锚点：maxTokens 字段收尾（8/7-tab，全文件唯一）。 */
const MII_CHECK_ANCHOR = [
  '\t\t\t\t\t\t\t\t\tonChange: (event) => {',
  '\t\t\t\t\t\t\t\t\t\teditCapacity(index, "maxTokens", event.target.value);',
  '\t\t\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\t\t})]',
  '\t\t\t\t\t\t\t})]',
].join('\n');

/** 展开区容器是 grid(auto-fit,minmax(160px,1fr))，第三格与两容量字段同构。 */
const MII_CHECK_NEW = [
  '\t\t\t\t\t\t\t\t\tonChange: (event) => {',
  '\t\t\t\t\t\t\t\t\t\teditCapacity(index, "maxTokens", event.target.value);',
  '\t\t\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\t\t})]',
  '\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)("label", {',
  '\t\t\t\t\t\t\t\tclassName: ModelsSection_module_css_default["modelField"],',
  '\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {',
  '\t\t\t\t\t\t\t\t\tclassName: ModelsSection_module_css_default["modelFieldLabel"],',
  '\t\t\t\t\t\t\t\t\tchildren: t("modelImageInput")',
  '\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsxs)("span", {',
  '\t\t\t\t\t\t\t\t\tstyle: {',
  '\t\t\t\t\t\t\t\t\t\tdisplay: "flex",',
  '\t\t\t\t\t\t\t\t\t\talignItems: "center",',
  '\t\t\t\t\t\t\t\t\t\tgap: "6px"',
  '\t\t\t\t\t\t\t\t\t},',
  '\t\t\t\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("input", {',
  '\t\t\t\t\t\t\t\t\t\ttype: "checkbox",',
  '\t\t\t\t\t\t\t\t\t\tchecked: imageInputOf(model),',
  '\t\t\t\t\t\t\t\t\t\tdisabled,',
  '\t\t\t\t\t\t\t\t\t\t"aria-label": `${t("modelImageInput")} ${index + 1}`,',
  '\t\t\t\t\t\t\t\t\t\tonChange: (event) => {',
  '\t\t\t\t\t\t\t\t\t\t\t// 取消勾选写显式 ["text"] 而非删键：删键退回路由默认/内置',
  '\t\t\t\t\t\t\t\t\t\t\t// 目录，语义随路由而变，勾选框不该有这种歧义。',
  '\t\t\t\t\t\t\t\t\t\t\tpatch(index, {',
  '\t\t\t\t\t\t\t\t\t\t\t\tinput: event.target.checked ? ["text", "image"] : ["text"]',
  '\t\t\t\t\t\t\t\t\t\t\t});',
  '\t\t\t\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {',
  '\t\t\t\t\t\t\t\t\t\tclassName: ModelsSection_module_css_default["modelFieldLabel"],',
  '\t\t\t\t\t\t\t\t\t\tchildren: t("modelImageInputHint")',
  '\t\t\t\t\t\t\t\t\t})]',
  '\t\t\t\t\t\t\t\t})]',
  '\t\t\t\t\t\t\t})]',
].join('\n');

// ---------------------------------------------------------------------------
// 注入二：文案（同 bundle 内置 locale 表，en / zh 两处）
// ---------------------------------------------------------------------------

const MII_LOCALE_EN_ANCHOR = '\t\t\tmodelAdvanced: "Capacities",';
const MII_LOCALE_EN_NEW = MII_LOCALE_EN_ANCHOR + '\n' + [
  `\t\t\t/* ${IMAGE_INPUT_I18N_MARKER} */`,
  '\t\t\tmodelImageInput: "Image input",',
  '\t\t\tmodelImageInputHint: "sends originals",'
].join('\n');

const MII_LOCALE_ZH_ANCHOR = '\t\t\tmodelAdvanced: "容量",';
const MII_LOCALE_ZH_NEW = MII_LOCALE_ZH_ANCHOR + '\n' + [
  `\t\t\t/* ${IMAGE_INPUT_I18N_MARKER} */`,
  '\t\t\tmodelImageInput: "支持图片输入",',
  '\t\t\tmodelImageInputHint: "原图直接发给模型",'
].join('\n');

// ---------------------------------------------------------------------------
// 注入三：adopt() 保留端点自报的图片模态
// ---------------------------------------------------------------------------

const MII_ADOPT_ANCHOR = [
  '\t\t\t\t...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens }',
  '\t\t\t};',
].join('\n');

const MII_ADOPT_NEW = [
  '\t\t\t\t...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens },',
  `\t\t\t\t/* ${IMAGE_INPUT_ADOPT_MARKER}: 本函数是字段白名单，端点在`,
  '\t\t\t\t * 「获取模型」里自报的模态原本被静默丢弃；保留 image 声明，',
  '\t\t\t\t * 让用户从目录挑选即自动勾上，不必再手工点一次。写成 IIFE +',
  '\t\t\t\t * Array.isArray 而非直接 ?.includes("image")：端点字段不可信，',
  '\t\t\t\t * 字符串脏值在 String.prototype.includes 下会误判为支持（"image"',
  '\t\t\t\t * 命中自身），数字则直接 TypeError；此处也不该引用 UI 组的',
  '\t\t\t\t * helper——两组锚点各自独立判定，跨组引用会造出半补丁。 */',
  '\t\t\t\t...(() => {',
  '\t\t\t\t\tconst declared = candidate.inputModalities ?? candidate.input;',
  '\t\t\t\t\treturn Array.isArray(declared) && declared.includes("image") ? {',
  '\t\t\t\t\t\tinput: ["text", "image"]',
  '\t\t\t\t\t} : {};',
  '\t\t\t\t})()',
  '\t\t\t};',
].join('\n');

/**
 * transform：模型卡逐行「支持图片输入」三组注入（幂等、锚点失配不改写）。
 * @param {string} src
 * @param {string} file
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformModelImageInput(src, file) {
  const hasUi = src.includes(IMAGE_INPUT_UI_MARKER);
  const hasLocale = src.includes(IMAGE_INPUT_I18N_MARKER);
  const hasAdopt = src.includes(IMAGE_INPUT_ADOPT_MARKER);
  // 三组齐备才算 already：任一组半落盘（历史上同类补丁出现过「只打上第一处」）
  // 都要在下次应用时补全，故不能 || 。
  if (hasUi && hasLocale && hasAdopt) return { status: 'already' };
  let next = src;
  let changed = false;
  const missing = [];
  // UI 两处锚点必须同时命中才动手：只注 helper 会得到无控件的半成品，
  // 只注控件则 imageInputOf 未定义、渲染该行即崩。
  if (!hasUi) {
    if (next.includes(MII_HELPER_ANCHOR) && next.includes(MII_CHECK_ANCHOR)) {
      next = next.replace(MII_HELPER_ANCHOR, () => MII_HELPER_NEW);
      next = next.replace(MII_CHECK_ANCHOR, () => MII_CHECK_NEW);
      changed = true;
    } else {
      missing.push('ModelListEditor numberOf/最大输出字段收尾');
    }
  }
  if (!hasLocale) {
    if (next.includes(MII_LOCALE_EN_ANCHOR) && next.includes(MII_LOCALE_ZH_ANCHOR)) {
      next = next.replace(MII_LOCALE_EN_ANCHOR, () => MII_LOCALE_EN_NEW);
      next = next.replace(MII_LOCALE_ZH_ANCHOR, () => MII_LOCALE_ZH_NEW);
      changed = true;
    } else {
      missing.push('locale 表 modelAdvanced 行');
    }
  }
  if (!hasAdopt) {
    if (next.includes(MII_ADOPT_ANCHOR)) {
      next = next.replace(MII_ADOPT_ANCHOR, () => MII_ADOPT_NEW);
      changed = true;
    } else {
      missing.push('adopt() 字段白名单尾');
    }
  }
  if (!changed) {
    return {
      status: 'anchor-missing',
      detail: '未找到锚点（' + missing.join('、') + '，版本可能已变更），跳过 ' + file,
    };
  }
  return { status: 'changed', src: next };
}

/**
 * 对某个 node_modules 根目录应用「支持图片输入」勾选补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats]
 * @param {{dryRun?: boolean, donePrefix?: boolean, anchorLog?: Function}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchModelImageInput(nmRoot, log = () => {}, stats, options = {}) {
  const file = path.join(nmRoot, '@deepseek-ai', MODEL_IMAGE_INPUT_REL);
  if (!fs.existsSync(file)) return 0;
  // CLI 场景经 applyRoot 透传 options：donePrefix=false 输出无前缀单行、
  // anchorLog=warn 把失配走告警通道、dryRun 只判定不落盘；stats 回流
  // anchorMissing/failed 计数。缺省保持原默认（log / true）。
  return applyPatchToFiles({
    prefix: '模型图片输入勾选补丁',
    files: [file],
    log,
    transform: transformModelImageInput,
    alreadyLog: (f) => '已应用，跳过 ' + f,
    doneLog: (f) => '已注入「支持图片输入」勾选 ' + f,
    anchorLog: (options && options.anchorLog) || log,
    failLog: (f, err) => '模型图片输入勾选补丁失败(' + f + '): ' + err.message,
    donePrefix: options && options.donePrefix,
    dryRun: options && options.dryRun,
    dryRunChangedLog: (f) => 'dry-run: 将注入「支持图片输入」勾选 ' + f,
    stats,
  });
}

module.exports = {
  MODEL_IMAGE_INPUT_REL,
  IMAGE_INPUT_UI_MARKER,
  IMAGE_INPUT_I18N_MARKER,
  IMAGE_INPUT_ADOPT_MARKER,
  transformModelImageInput,
  patchModelImageInput,
  // 注入体常量（单测构造 pristine 夹具用，与 transform 同源；非 marker）。
  MII_CONSTANTS: {
    HELPER_ANCHOR: MII_HELPER_ANCHOR,
    HELPER_NEW: MII_HELPER_NEW,
    CHECK_ANCHOR: MII_CHECK_ANCHOR,
    CHECK_NEW: MII_CHECK_NEW,
    LOCALE_EN_ANCHOR: MII_LOCALE_EN_ANCHOR,
    LOCALE_EN_NEW: MII_LOCALE_EN_NEW,
    LOCALE_ZH_ANCHOR: MII_LOCALE_ZH_ANCHOR,
    LOCALE_ZH_NEW: MII_LOCALE_ZH_NEW,
    ADOPT_ANCHOR: MII_ADOPT_ANCHOR,
    ADOPT_NEW: MII_ADOPT_NEW,
  },
};
