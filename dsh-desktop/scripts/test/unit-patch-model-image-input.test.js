'use strict';

// ---------------------------------------------------------------------------
// patch-model-image-input 补丁单元测试（node --test）。
//
// 根治「某些多模态模型依旧说不支持图片」的控件缺口验证：
//   · transform 层：三组注入（helper+checkbox / en+zh locale / adopt 保留模态）
//     的锚点命中、幂等、半补丁补全、UI 锚点半失配不落半成品、产物语法合法；
//   · 写回语义：勾选=显式 ["text","image"]，取消=显式 ["text"]（不删键）；
//   · 行为层：从产物抽出 imageInputOf / adopt 尾部表达式实跑，断言读取与
//     端点自报模态保留的判定（不经上游 pi-ai 也无法验证的两条真值表）；
//   · 管线层：root 应用器在临时 nm 根 changed → already 幂等、dry-run 零落盘。
//
// 运行：node --test scripts/test/unit-patch-model-image-input.test.js
// ---------------------------------------------------------------------------

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  MODEL_IMAGE_INPUT_REL,
  IMAGE_INPUT_UI_MARKER,
  IMAGE_INPUT_I18N_MARKER,
  IMAGE_INPUT_ADOPT_MARKER,
  transformModelImageInput,
  patchModelImageInput,
  MII_CONSTANTS,
} = require('../lib/patch-model-image-input');
const { kernel } = require('../compat/kernel-pin.json');

// pristine 源：vendored tarball 解包（dev 树可能已被 boot/patch-deps 打过，
// 幂等场景反而覆盖 already 分支，故判定统一在 pristine 上做）。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SM_VENDOR_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-client-ui-settings-models-${kernel.packageVersion}.tgz`,
);
const SM_FILE = extractPristineSettingsModels();

/** 把 vendored tarball 解到一次性目录，返回 pristine client.js 路径。 */
function extractPristineSettingsModels() {
  assert.ok(fs.existsSync(SM_VENDOR_TARBALL), '缺 vendored tarball: ' + SM_VENDOR_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mii-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', SM_VENDOR_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package', 'lib', 'client.js');
}

function readPristine() {
  assert.ok(fs.existsSync(SM_FILE), '缺 dsh-client-ui-settings-models/lib/client.js（vendor tarball）');
  return fs.readFileSync(SM_FILE, 'utf8');
}

/** 临时 node_modules 根构造器。 */
function makeNmRoot(rel, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mii-fx-'));
  const file = path.join(dir, '@deepseek-ai', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { dir, file };
}

/** node --check 语法校验（ESM 用 .mjs 后缀）。 */
function assertSyntaxOk(source, label) {
  const tmp = path.join(os.tmpdir(), `dsh-mii-syntax-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, source);
  try {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${label} 产物应语法合法: ${r.stderr}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** 反剥注入体回锚点原文（构造 pristine / 半补丁现场用），与 transform 同源。 */
function stripAllInjections(src) {
  return src
    .split(MII_CONSTANTS.HELPER_NEW).join(MII_CONSTANTS.HELPER_ANCHOR)
    .split(MII_CONSTANTS.CHECK_NEW).join(MII_CONSTANTS.CHECK_ANCHOR)
    .split(MII_CONSTANTS.LOCALE_EN_NEW).join(MII_CONSTANTS.LOCALE_EN_ANCHOR)
    .split(MII_CONSTANTS.LOCALE_ZH_NEW).join(MII_CONSTANTS.LOCALE_ZH_ANCHOR)
    .split(MII_CONSTANTS.ADOPT_NEW).join(MII_CONSTANTS.ADOPT_ANCHOR);
}

function pristineSrc() {
  return stripAllInjections(readPristine());
}

// ---------------------------------------------------------------------------
// transform 层
// ---------------------------------------------------------------------------

test('mii: pristine 夹具确为上游原样（三 marker 均不存在，锚点各唯一）', () => {
  const src = pristineSrc();
  assert.equal(src.includes(IMAGE_INPUT_UI_MARKER), false);
  assert.equal(src.includes(IMAGE_INPUT_I18N_MARKER), false);
  assert.equal(src.includes(IMAGE_INPUT_ADOPT_MARKER), false);
  for (const [name, anchor] of Object.entries({
    HELPER: MII_CONSTANTS.HELPER_ANCHOR,
    CHECK: MII_CONSTANTS.CHECK_ANCHOR,
    LOCALE_EN: MII_CONSTANTS.LOCALE_EN_ANCHOR,
    LOCALE_ZH: MII_CONSTANTS.LOCALE_ZH_ANCHOR,
    ADOPT: MII_CONSTANTS.ADOPT_ANCHOR,
  })) {
    const hits = src.split(anchor).length - 1;
    assert.equal(hits, 1, `锚点 ${name} 应全文件唯一命中，实际 ${hits}`);
  }
});

test('mii: transform 命中三组锚点产出 changed，注入探针齐备且语法合法', () => {
  const r = transformModelImageInput(pristineSrc(), 'sm');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(IMAGE_INPUT_UI_MARKER), '缺 UI 注入 marker');
  assert.ok(r.src.includes(IMAGE_INPUT_I18N_MARKER), '缺 locale 注入 marker');
  assert.ok(r.src.includes(IMAGE_INPUT_ADOPT_MARKER), '缺 adopt 注入 marker');
  assert.ok(r.src.includes('function imageInputOf(model) {'), '缺 modality 读取 helper');
  assert.ok(r.src.includes('checked: imageInputOf(model),'), '缺勾选控件（或控件未接到 helper）');
  assert.equal(r.src.split('t("modelImageInput")').length - 1, 2, '控件应有 label + aria-label 两处 t() 引用');
  assert.ok(r.src.includes('modelImageInput: "Image input",'), '缺 en 文案');
  assert.ok(r.src.includes('modelImageInput: "支持图片输入",'), '缺 zh 文案');
  assertSyntaxOk(r.src, 'model-image-input');
});

test('mii: 幂等（二遍 already）', () => {
  const r1 = transformModelImageInput(pristineSrc(), 'sm');
  assert.equal(r1.status, 'changed');
  assert.equal(transformModelImageInput(r1.src, 'sm').status, 'already');
});

test('mii: 无锚点时 anchor-missing 且不改写', () => {
  const r = transformModelImageInput('export {};\n', 'sm');
  assert.equal(r.status, 'anchor-missing');
  assert.match(r.detail, /未找到锚点/);
});

test('mii: 目标包不存在时 root 应用器静默返回 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mii-empty-'));
  try {
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(patchModelImageInput(dir, () => {}, stats), 0);
    assert.deepEqual(stats, { anchorMissing: 0, failed: 0 }, '靶文件缺席不该产生失配/失败计数');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mii: UI 两锚点半失配时不落半成品（有 helper 无控件 = 渲染即崩）', () => {
  // 模拟上游重构了 maxTokens 字段收尾（改动 editCapacity 调用形态但保持括号
  // 平衡）而 numberOf 原样：若允许单点注入，产物会出现未被引用的 helper；
  // 反之会出现引用不到 imageInputOf 的控件——两者都是半成品。
  const src = pristineSrc().replace(MII_CONSTANTS.CHECK_ANCHOR, [
    '\t\t\t\t\t\t\t\t\tonChange: (event) => {',
    '\t\t\t\t\t\t\t\t\t\teditCapacity(index, "maxTokens", event.target.value.trim());',
    '\t\t\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t\t\t})]',
    '\t\t\t\t\t\t\t})]',
  ].join('\n'));
  const r = transformModelImageInput(src, 'sm');
  assert.equal(r.status, 'changed', 'locale/adopt 仍可注入');
  assert.equal(r.src.includes('function imageInputOf(model) {'), false, '不得只注 helper');
  assert.equal(r.src.includes('checked: imageInputOf(model),'), false, '不得只注控件');
  assert.equal(r.src.includes(IMAGE_INPUT_UI_MARKER), false, 'UI 组不得半落 marker');
  assert.equal(r.src.includes(IMAGE_INPUT_I18N_MARKER), true);
  assert.ok(r.src.includes(IMAGE_INPUT_ADOPT_MARKER));
  assertSyntaxOk(r.src, 'model-image-input-partial');
});

test('mii: 半补丁（缺 adopt 组）重跑时补全，补全后二遍 already', () => {
  const full = transformModelImageInput(pristineSrc(), 'sm').src;
  const half = full.split(MII_CONSTANTS.ADOPT_NEW).join(MII_CONSTANTS.ADOPT_ANCHOR);
  assert.equal(half.includes(IMAGE_INPUT_ADOPT_MARKER), false);
  assert.equal(half.includes(IMAGE_INPUT_UI_MARKER), true);
  const r = transformModelImageInput(half, 'sm');
  assert.equal(r.status, 'changed', '半补丁不得被判定 already');
  assert.equal(r.src.includes(IMAGE_INPUT_ADOPT_MARKER), true, '缺失的 adopt 注入应被补全');
  assert.equal(transformModelImageInput(r.src, 'sm').status, 'already');
  assertSyntaxOk(r.src, 'model-image-input-healed');
});

test('mii: 注入的 locale 行必须以逗号收尾（漏逗号会让整个 client.js 语法崩）', () => {
  // 事故回归位：首版把尾逗号落在引号外，产物 node --check 报
  // Unexpected identifier 'addModel'——设置页整个 bundle 加载失败。
  for (const [label, body] of [
    ['en', MII_CONSTANTS.LOCALE_EN_NEW],
    ['zh', MII_CONSTANTS.LOCALE_ZH_NEW],
  ]) {
    const last = body.split('\n').at(-1).trim();
    assert.match(last, /",$/, `${label} 文案末行应以字符串内尾逗号收尾: ${last}`);
    assert.match(last, /modelImageInputHint/, `${label} 末行应是 hint 键: ${last}`);
  }
});

// ---------------------------------------------------------------------------
// 写回语义（勾选 → settings.yaml 的 models[].input）
// ---------------------------------------------------------------------------

test('mii: 勾选写 ["text","image"]，取消写显式 ["text"]（不删键，语义无歧义）', () => {
  const src = transformModelImageInput(pristineSrc(), 'sm').src;
  assert.ok(
    src.includes('input: event.target.checked ? ["text", "image"] : ["text"]'),
    'onChange 应显式声明两种态，取消勾选不得删键（删键退回路由默认/内置目录）',
  );
});

test('mii: imageInputOf 真值表（absent/[]/["text"]/["text","image"]/非数组）', () => {
  const src = transformModelImageInput(pristineSrc(), 'sm').src;
  const start = src.indexOf('function imageInputOf(model) {');
  const CLOSE = '\n\t\t}';
  const end = src.indexOf(CLOSE, start);
  assert.ok(start !== -1 && end !== -1, '产物中应能定位 imageInputOf');
  // eslint-disable-next-line no-new-func
  const imageInputOf = new Function(`${src.slice(start, end + CLOSE.length)}\nreturn imageInputOf;`)();
  assert.equal(imageInputOf({}), false, '不写 input = 沿用原行为（未声明可收图）');
  assert.equal(imageInputOf({ input: [] }), false);
  assert.equal(imageInputOf({ input: ['text'] }), false);
  assert.equal(imageInputOf({ input: ['text', 'image'] }), true);
  assert.equal(imageInputOf({ input: ['image'] }), true);
  assert.equal(imageInputOf({ input: 'image' }), false, '脏值（字符串）不得误判为支持');
  assert.equal(imageInputOf({ inputModalities: ['image'] }), false, '只认 models[].input 键');
});

test('mii: adopt() 保留端点自报的图片模态（挑选即自动勾上）', () => {
  const src = transformModelImageInput(pristineSrc(), 'sm').src;
  const markerAt = src.indexOf(IMAGE_INPUT_ADOPT_MARKER);
  assert.ok(markerAt !== -1, '产物中应含 adopt marker');
  const start = src.indexOf('...(() => {', markerAt);
  assert.ok(start !== -1, 'adopt 注入体应为 IIFE 形式');
  const end = src.indexOf('})()', start) + '})()'.length;
  const snippet = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  const adoptTail = new Function('candidate', `return { ${snippet} };`);
  assert.deepEqual(adoptTail({ inputModalities: ['text', 'image'] }), { input: ['text', 'image'] });
  assert.deepEqual(adoptTail({ input: ['image'] }), { input: ['text', 'image'] }, '无 inputModalities 时回落 input');
  assert.deepEqual(adoptTail({ inputModalities: ['text'] }), {}, '文本模型不得被顺手勾上');
  assert.deepEqual(adoptTail({}), {}, '端点未报模态时不写 input（保持原字段白名单行为）');
  assert.deepEqual(
    adoptTail({ inputModalities: 'image' }),
    {},
    '字符串脏值不得误判为支持（String.prototype.includes 会命中自身）',
  );
  assert.doesNotThrow(() => adoptTail({ inputModalities: 7 }), '数字脏值不得 TypeError');
  assert.deepEqual(adoptTail({ inputModalities: 7 }), {}, '数字脏值不得勾上');
  assert.deepEqual(adoptTail({ inputModalities: null, input: ['image'] }), { input: ['text', 'image'] }, '?? 应让 input 兜位');
});

// ---------------------------------------------------------------------------
// 管线层：root 应用器
// ---------------------------------------------------------------------------

test('mii: root 应用器在临时 nm 根实跑（changed → already，产物含 marker）', () => {
  const pristine = pristineSrc();
  const { dir, file } = makeNmRoot(MODEL_IMAGE_INPUT_REL, pristine);
  try {
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(patchModelImageInput(dir, () => {}, stats), 1);
    assert.equal(fs.readFileSync(file, 'utf8').includes(IMAGE_INPUT_UI_MARKER), true);
    assert.equal(patchModelImageInput(dir, () => {}, stats), 0, '二次应用应幂等 0 写入');
    assert.deepEqual(stats, { anchorMissing: 0, failed: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mii: dry-run 只判定零落盘；锚点缺失回流 stats.anchorMissing', () => {
  const pristine = pristineSrc();
  const { dir, file } = makeNmRoot(MODEL_IMAGE_INPUT_REL, pristine);
  try {
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(patchModelImageInput(dir, () => {}, stats, { dryRun: true }), 0, 'dry-run 应零写入');
    assert.equal(fs.readFileSync(file, 'utf8'), pristine, 'dry-run 不得改写靶文件');
    assert.deepEqual(stats, { anchorMissing: 0, failed: 0 }, 'dry-run 命中不应误计失配');

    fs.writeFileSync(file, 'export {};\n', 'utf8');
    const bad = { anchorMissing: 0, failed: 0 };
    assert.equal(patchModelImageInput(dir, () => {}, bad), 0);
    assert.equal(bad.anchorMissing, 1, '锚点漂移应回流 1 个 anchorMissing（fail-loud）');
    assert.equal(bad.failed, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
