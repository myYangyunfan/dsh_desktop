'use strict';

// prompt-context-literal 补丁单元测试（node --test）。
//
// 根因：内核 dsh-system-prompt interpolate()（lib/index.js:105-129）把所有
// context/section 文本当 {{name}} 模板扫描，VARIABLE_NAME=/^[a-z][a-z0-9_]*$/：
// 任何不可信数据（召回文本、用户文档片段）里存了字面量 {{state.gold}}（名字带点）
// → :118 硬抛 malformed → 整轮 prompt 组装失败，会话每轮必瘫。
// 历史触发源是 graph-memory 的 recall context（v1.0.0 已退役，连同它的层1
// defuseTemplateGroups 净化与本文件的层1 用例），但**本补丁作为通用护栏保留**：
// 只要还有任何插件/用户内容会往 context 里塞字面量花括号，这条分支就在野。
//
// 验证的是层2（内核放宽）：prompt-context-literal 补丁——:118 name-invalid 抛错分支
// 改为 warn + 字面透传；:122 unknown-variable 保持硬抛。
//
// 判定器不是复述实现：从 pristine 内核源（payload 装配产物，或经逆运算还原的
// dev 副本）逐字节抽出真实的 interpolate()（含 VARIABLE_NAME / GROUP_AT 常量）
// 在 vm 里执行；样本模板组用内联字面量（:recall 那类 context 名只是合法的
// context 命名形态，与被退役插件无关）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const { transformPromptContextLiteral, markers, toPristineSource } = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { PROMPT_CONTEXT_LITERAL_PKG_RELS, resolvePatchTargets } = require('../lib/patch-target-resolver');
const { applyAll } = require('../integration/patch-runner');

const MARKER = markers.PROMPT_CONTEXT_LITERAL_MARKER;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// pristine 内核源（补丁判定的唯一基准）。
//   优先 payload 装配产物（真 pristine，未被任何补丁链碰过）；该目录是一次性
//   构建产物，不在仓库里，故缺省回退 dev node_modules 副本 —— 但不再像早期
//   那样“直接用打过补丁的副本当 pristine”（那会让 changed 退化成 already 假红，
//   真漂移时同样只报 already = 哨兵闭嘴），而是用 PRISTINE_INJECTIONS 的逆运算
//   把注入体剥掉。剥不干净时下方「基准自检」用例会直接红，不会悄悄失效。
const PAYLOAD_KERNEL = path.join(
  REPO_ROOT, '.tmp-rc2-stage',
  'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js'
);
const DEV_KERNEL = path.join(
  REPO_ROOT, 'dsh-desktop', 'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js'
);

/** 基准包目录（供 applyAll 集成用例整包拷贝）。 */
function kernelPkgDir() {
  if (fs.existsSync(PAYLOAD_KERNEL)) return path.dirname(path.dirname(PAYLOAD_KERNEL));
  if (fs.existsSync(DEV_KERNEL)) return path.dirname(path.dirname(DEV_KERNEL));
  assert.fail('找不到 dsh-system-prompt 包（payload 与 dev node_modules 均缺失），无法做锚点验证');
  return null;
}

/** pristine 内核字节（payload 优先；否则对 dev 副本跑逆运算）。 */
function kernelPristineSource() {
  if (fs.existsSync(PAYLOAD_KERNEL)) return fs.readFileSync(PAYLOAD_KERNEL, 'utf8');
  return toPristineSource('prompt-context-literal', fs.readFileSync(DEV_KERNEL, 'utf8'));
}

// graph-memory 插件文件（层1 净化面）随 v1.0.0 退役删除：曾经的
// src/format/assemble.ts + dist 镜像 + dist/dsh.js push 点接线用例一并下线，
// 它们只服务于已不存在的 defuseTemplateGroups。

function tmpdir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'dsh-ptd-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// 真实源码抽取器：不做复述，从文件里切出真实函数/常量在 vm 执行。
// ---------------------------------------------------------------------------

/**
 * 切出 `function <name>(...) {...}` 源段：从函数声明起，到其后第一个
 * `\n/**`（下一份顶层声明的文档注释）为止。函数体内不含块注释，故该终止符
 * 可靠（花括号计数不可靠：正则字面量 /\{(?=\{)/g 与字符串 "{{" 都含未配对括号）。
 */
function sliceFunction(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start !== -1, '源中应含 ' + signature);
  const end = src.indexOf('\n/**', start);
  assert.ok(end !== -1, '应找到函数后的下一个文档注释作为终止符');
  const slice = src.slice(start, end);
  assert.ok(slice.trimEnd().endsWith('}'), '切片应以函数收尾 } 结束');
  return slice;
}

/** 从 pristine 内核源抽出真实 interpolate()（含 VARIABLE_NAME / GROUP_AT 常量）。 */
function loadKernelInterpolate(src, sandboxConsole) {
  const vn = /^const VARIABLE_NAME = (\/.+\/);$/m.exec(src);
  const ga = /^const GROUP_AT = (\/.+\/);$/m.exec(src);
  assert.ok(vn && ga, 'pristine 源应含 VARIABLE_NAME / GROUP_AT 常量声明');
  const fnSrc = sliceFunction(src, 'function interpolate(input, variables, kind) {');
  const prelude = 'const VARIABLE_NAME = ' + vn[1] + ';\nconst GROUP_AT = ' + ga[1] + ';\n';
  const sandbox = { console: sandboxConsole };
  return vm.runInNewContext(prelude + fnSrc + '\ninterpolate', sandbox);
}

// 层1 净化面（graph-memory 的 defuseTemplateGroups，src 与 dist 镜像 + dist/dsh.js
// push 点接线）随 v1.0.0 退役下线：源目录 assets/plugins/graph-memory 已删，抽取器
// loadDefuse 与其纯函数用例、以及「defuse 后透传」「层1+层2 叠加」「push 点接线」
// 一并移除。这里只保留 stock（补丁前）内核判定器，用来锁「本补丁要修的现场确实在野」。
// 内核判定器：stock（补丁前）语义。warns 采集仅供诊断。
const stockInterpolate = loadKernelInterpolate(kernelPristineSource(), console);

// ---------------------------------------------------------------------------
// 1：stock（补丁前）内核的三条扫描路径 —— 锁住本补丁要修的现场。
// ---------------------------------------------------------------------------

// 三条路径（对应 interpolate 的三个出口）：
//   A. GROUP_AT 命中 + 合法名 → 正常插值出口；
//   B. GROUP_AT 不命中 + 无后续 }} → 字面透传出口（:113-114）；
//   C. GROUP_AT 不命中 + 远处存在 }} → :112 硬抛（坑：只打断一侧仍会中招）。
// 样本是「不可信数据里存了字面量模板组」的内联形态；context 名 'ext:recall' 只是
// `<来源>:<用途>` 的合法命名样式（与被退役的 graph-memory 无涉，锁的是命名形态本身）。
const PATH_CASES = [
  { path: 'A 合法名组', raw: '前缀 {{valid_name}} 后缀', vars: { valid_name: 'V' } },
  { path: 'A 非法名组（本 bug 现场）', raw: 'recall: {{state.gold}} 命中', vars: {} },
  { path: 'B 无闭合组', raw: '孤立 {{state.gold 无闭合', vars: {} },
  { path: 'C 远处闭合组（:112 坑）', raw: '{{ a{{b 之后远处才有 }}', vars: {} },
  { path: '混合', raw: '{{a.b}} 与 {{ok}} 与孤立 {{ 与 }} 同现', vars: { ok: 'OK' } },
];

test('oracle 灵敏度：stock（补丁前）内核对原始字面量样本确实硬抛（本补丁的现场前提）', () => {
  for (const c of PATH_CASES) {
    // B 路径（无闭合组）stock 本就字面透传；A 合法名组 stock 正常插值——
    // 这两条是对照组，其余（非法名组 / 远闭合组 / 混合）必须抛错。
    if (c.path.startsWith('B ') || c.path.startsWith('A 合法名组')) continue;
    assert.throws(() => stockInterpolate({ name: 'ext:recall', text: c.raw }, c.vars, 'context'),
      /malformed|unknown prompt variable/, c.path + '：原始文本应触发内核硬抛');
  }
  assert.equal(
    stockInterpolate({ name: 'n', text: '孤立 {{state.gold 无闭合' }, {}, 'context'),
    '孤立 {{state.gold 无闭合',
    'B 路径（无闭合组）stock 本就字面透传——判定器与内核语义一致'
  );
  assert.equal(
    stockInterpolate({ name: 'n', text: '前缀 {{valid_name}} 后缀' }, { valid_name: 'V' }, 'context'),
    '前缀 V 后缀',
    'A 路径（合法名组）stock 正常插值——判定器与内核语义一致'
  );
});

// ---------------------------------------------------------------------------
// 2：层2 补丁（prompt-context-literal）transform 三态 + 语法 + 幂等。
// ---------------------------------------------------------------------------

test('基准自检：pristine 不得带 marker，且重放产物与磁盘副本逐字节相同', () => {
  // 这一条专为“基准被悄悄污染 / 逆运算推错历史”而设：以前直接把打过补丁的
  // 副本当 pristine，changed 退化成 already，哨兵表面在跑其实已闭嘴。
  const pristine = kernelPristineSource();
  assert.ok(!pristine.includes(MARKER), 'pristine 基准不得含 marker（逆运算没剥干净）');
  const replay = transformPromptContextLiteral(pristine, 'dsh-system-prompt/lib/index.js');
  assert.equal(replay.status, 'changed', 'pristine 基准必须走 changed 分支（能跑 = 哨兵还灵）');
  if (!fs.existsSync(PAYLOAD_KERNEL)) {
    // 逆运算还原后的重放产物应逐字回到磁盘副本（证明“推的历史”就是在野字节）。
    assert.equal(replay.src, fs.readFileSync(DEV_KERNEL, 'utf8'),
      'chain(pristine) 应与 dev 副本逐字节相同 —— 否则逆运算与在野形态不一致');
  }
});

test('锚点命中 pristine 基准', () => {
  const out = transformPromptContextLiteral(kernelPristineSource(), 'dsh-system-prompt/lib/index.js');
  assert.equal(out.status, 'changed', 'pristine 源应命中锚点');
  assert.ok(out.src.includes(MARKER), '产物应含 marker 注释');
  assert.ok(out.src.includes('console.warn'), '产物应含告警日志');
});

test('transform 产物语法合法（node --check）', (t) => {
  const dir = tmpdir(t, 'dsh-ptd-check-');
  const out = transformPromptContextLiteral(kernelPristineSource(), 'dsh-system-prompt/lib/index.js');
  assert.equal(out.status, 'changed');
  const checkFile = path.join(dir, 'index.js');
  fs.writeFileSync(checkFile, out.src);
  const res = spawnSync(process.execPath, ['--check', checkFile], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, '补丁产物必须语法合法: ' + (res.stderr || ''));
});

test('幂等：第二遍 already / marker 短路 / 无锚点 anchor-missing 不改写', () => {
  const pristine = kernelPristineSource();
  const changed = transformPromptContextLiteral(pristine, 't.js');
  assert.equal(changed.status, 'changed');
  assert.equal(transformPromptContextLiteral(changed.src, 't.js').status, 'already');
  // marker 短路：仅 marker 注释也算已应用。
  assert.equal(transformPromptContextLiteral('// ' + MARKER, 't.js').status, 'already');
  // 失配：无锚点 → anchor-missing（版本漂移），绝不改写。
  const miss = transformPromptContextLiteral('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
  assert.equal(miss.src, undefined, '失配时不得返回改写源');
});

// ---------------------------------------------------------------------------
// 3：层2 补丁行为（vm 执行真实注入产物：透传 + warn / unknown 仍抛 / 合法正常）。
// ---------------------------------------------------------------------------

function makePatchedInterpolate() {
  const pristine = kernelPristineSource();
  const changed = transformPromptContextLiteral(pristine, 't.js');
  const warns = [];
  const fn = loadKernelInterpolate(changed.src, { warn: (m) => warns.push(String(m)) });
  return { fn, warns };
}

test('行为：{{a.b}}（非法名）字面透传 + warn 附 context 名与片段', () => {
  const h = makePatchedInterpolate();
  const text = '前缀 {{a.b}} 后缀';
  const out = h.fn({ name: 'ext:recall', text }, {}, 'context');
  assert.equal(out, text, '非法名组应逐字透传（前缀后缀完整保留）');
  assert.equal(h.warns.length, 1, '恰好一条告警');
  const warn = h.warns[0];
  assert.ok(warn.includes('ext:recall'), '告警应附 context 名');
  assert.ok(warn.includes('{{a.b}}'), '告警应附原文字面组');
  assert.ok(warn.includes('后缀'), '告警应附邻近片段（自变量组起的原文窗口）');
});

test('行为：{{unknown_valid}}（合法名未注册）仍硬抛——真实模板作者错误必须响亮', () => {
  const h = makePatchedInterpolate();
  assert.throws(
    () => h.fn({ name: 'dsh:workspace-anchor', text: 'Keep edits under {{cwd}}.' }, { other: 'O' }, 'section'),
    /unknown prompt variable "\{\{cwd\}\}"/,
    'unknown-variable 分支保持硬抛'
  );
  assert.equal(h.warns.length, 0, '未透传不应告警');
});

test('行为：合法已注册变量正常插值（补丁不伤正常路径）', () => {
  const h = makePatchedInterpolate();
  const out = h.fn({ name: 'dsh:workspace-anchor', text: 'Keep edits under {{cwd}}.' }, { cwd: '/w' }, 'section');
  assert.equal(out, 'Keep edits under /w.');
  assert.equal(h.warns.length, 0, '正常插值不得告警');
});

test('行为：合法名但值为 undefined 仍硬抛（value 分支不经本补丁）', () => {
  const h = makePatchedInterpolate();
  const vars = { ghost: undefined };
  assert.throws(
    () => h.fn({ name: 'n', text: '{{ghost}}' }, vars, 'context'),
    /has no value for this assembly/,
    'value===undefined 分支保持硬抛'
  );
});

test('行为：多处非法组逐个透传，后续合法组仍正常插值', () => {
  const h = makePatchedInterpolate();
  const text = '{{a.b}} 中段 {{valid}} 尾部 {{x.y}}';
  const out = h.fn({ name: 'gm', text }, { valid: 'V' }, 'context');
  assert.equal(out, '{{a.b}} 中段 V 尾部 {{x.y}}');
  assert.equal(h.warns.length, 2, '两个非法组各告警一次');
});

test('产物纯净性：只移除 :118 抛错，:112 / :121 / :124 / :228 全部逐字保留', () => {
  const pristine = kernelPristineSource();
  const changed = transformPromptContextLiteral(pristine, 't.js');
  // :118 的抛错形态（malformed "{{name}}"）在产物中不再出现。
  assert.ok(!changed.src.includes('malformed prompt variable reference "{{${name}}}"'),
    ':118 name-invalid 抛错必须被移除');
  // :112（GROUP_AT 不命中 + 远处 }}）原文保留——本补丁只放宽 :118，远闭合分支照旧硬抛。
  const trapLine = pristine.split('\n').find((l) => l.includes('malformed prompt variable reference at '));
  assert.ok(trapLine, 'pristine 应含 :112 抛错行');
  assert.ok(changed.src.includes(trapLine), ':112 远闭合硬抛分支必须逐字保留');
  // :121 unknown-variable 与 :124 no-value 两个抛错原文保留。
  const unknownLine = pristine.split('\n').find((l) => l.includes('unknown prompt variable'));
  assert.ok(unknownLine && changed.src.includes(unknownLine), 'unknown-variable 抛错必须逐字保留');
  const noValueLine = pristine.split('\n').find((l) => l.includes('has no value for this assembly'));
  assert.ok(noValueLine && changed.src.includes(noValueLine), 'no-value 抛错必须逐字保留');
  // :228 注册期变量名校验（同文件另一处 VARIABLE_NAME.test）原文保留。
  const regLine = pristine.split('\n').find((l) => l.includes('invalid prompt variable name'));
  assert.ok(regLine, 'pristine 应含注册期校验行');
  assert.ok(changed.src.includes(regLine), '注册期变量名校验必须逐字保留');
  // 补丁后 interpolate 恰余 3 个 throw（112/121/124），注入分支自身零 throw。
  const patchedFn = sliceFunction(changed.src, 'function interpolate(input, variables, kind) {');
  assert.equal((patchedFn.match(/throw new Error/g) || []).length, 3,
    '补丁后 interpolate 应恰余 3 个 throw（:112/:121/:124）');
  // 注入分支 = marker 注释起，到紧随其后的 unknown-variable 守卫（原文）止。
  const injectionStart = patchedFn.indexOf(MARKER);
  const injectionEnd = patchedFn.indexOf('if (!Object.hasOwn(variables, name))', injectionStart);
  assert.ok(injectionStart !== -1 && injectionEnd !== -1, '应定位注入分支窗口');
  const injected = patchedFn.slice(injectionStart, injectionEnd);
  // 剥掉 // 行注释后再查 throw 语句（注释里说明性地提到 "throw below" 是允许的）。
  assert.ok(!/throw[\s;]/.test(injected.replace(/\/\/[^\n]*/g, '')), '注入分支不得引入新 throw 语句');
});

// ---------------------------------------------------------------------------
// 4：registry 装配与布局。
// ---------------------------------------------------------------------------

test('registry：prompt-context-literal 规格装配与布局正确', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'prompt-context-literal');
  assert.ok(spec, '注册表应含 prompt-context-literal');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.group, 'runtime');
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, false, 'cli:false（对齐 agent-preset-fallback 先例，不动 CLI 清单）');
  assert.equal(spec.transform, transformPromptContextLiteral, 'transform 与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER);
  assert.equal(markers.PROMPT_CONTEXT_LITERAL_MARKER, MARKER, 'marker 单一数据源导出');
  assert.deepEqual(
    PROMPT_CONTEXT_LITERAL_PKG_RELS.map((r) => r.split(path.sep).join('/')),
    ['dsh-system-prompt/lib/index.js'],
    '目标：运行时经 exports "." 实际加载的 interpolate 所在入口'
  );
  assert.ok(!getSpecsByCli().some((s) => s.id === 'prompt-context-literal'), 'cli:false 不进 CLI 清单');
});

test('registry：runtime-local / wsl 布局落点覆盖内核可加载副本', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'prompt-context-literal');
  const ctx = { home: 'C:\\h', appDir: 'C:\\app', userDataDir: 'C:\\ud', wslMode: false };
  const local = resolvePatchTargets(ctx, { ...spec, pkgRel: spec.pkgRels[0] });
  const norm = (f) => f.split(path.sep).join('/');
  assert.ok(local.some((f) => norm(f) === 'C:/app/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'), '本地三副本须含 appDir 内核副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/h/profiles/node_modules/')), '含 profile fallback 副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/ud/agent/node_modules/')), '含 agent overlay 副本');
  const wsl = resolvePatchTargets({ ...ctx, wslMode: true }, { ...spec, pkgRel: spec.pkgRels[0] });
  assert.ok(wsl.some((f) => norm(f) === 'C:/h/agent/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'), 'WSL 布局须含 UNC agent 副本');
});

// ---------------------------------------------------------------------------
// 5：applyAll 集成（临时目录 pristine 副本：changed → already、errors=0、
//    其余补丁不受扰）。
// ---------------------------------------------------------------------------

test('applyAll 集成：首遍 changed / 次遍 already，errors=0 且其余补丁不受扰', (t) => {
  const home = tmpdir(t, 'dsh-ptd-home-');
  const appDir = tmpdir(t, 'dsh-ptd-app-');
  const userDataDir = tmpdir(t, 'dsh-ptd-ud-');
  const pkgDir = path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh-system-prompt');
  fs.cpSync(kernelPkgDir(), pkgDir, { recursive: true });
  // 无论基准取自 payload 还是 dev 副本，拷进临时 appDir 后都要把包内入口写回
  // pristine 形态，否则首遍 applyAll 会被 marker 短路，changed 不再是 changed。
  fs.writeFileSync(path.join(pkgDir, 'lib', 'index.js'), kernelPristineSource());
  const logs = [];
  const ctx = { home, appDir, userDataDir, wslMode: false, logs, log: (m) => logs.push(m) };

  const run1 = applyAll(ctx);
  assert.equal(run1.errors.length, 0, '首遍不应有规格级异常: ' + JSON.stringify(run1.errors));
  assert.equal(run1.failed, 0, '首遍不应有逐文件失败');
  assert.equal(run1.total, PATCH_SPECS.length, '全部 ' + PATCH_SPECS.length + ' 个补丁都应被编排');
  const file = path.join(pkgDir, 'lib', 'index.js');
  const after1 = fs.readFileSync(file, 'utf8');
  assert.ok(after1.includes(MARKER), '首遍应已写入透传代码');
  assert.equal(run1.changed >= 1, true, '首遍至少写入 1 处（changed=' + run1.changed + '）');
  // 其余补丁目标不存在 → 静默跳过，不计失配不报错。
  assert.equal(run1.anchorMissing, 0, '临时目录中其余补丁目标不存在应静默跳过（不产生失配）');
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, '落盘产物必须语法合法: ' + (res.stderr || ''));

  // 第二遍全量重跑：幂等 already，无新增失败，字节不变。
  const run2 = applyAll(ctx);
  assert.equal(run2.errors.length, 0, '次遍不应有规格级异常: ' + JSON.stringify(run2.errors));
  assert.equal(run2.failed, 0, '次遍不应有逐文件失败');
  assert.equal(transformPromptContextLiteral(fs.readFileSync(file, 'utf8'), file).status, 'already', '次遍应 already');
  assert.equal(fs.readFileSync(file, 'utf8'), after1, '次遍不得重复注入（字节不变）');

  // 落盘产物 vm 实跑：不可信数据里的字面量组（未经任何插件侧净化）不再炸整轮。
  const warns = [];
  const fn = loadKernelInterpolate(after1, { warn: (m) => warns.push(String(m)) });
  const out = fn({ name: 'ext:recall', text: '配置 {{state.gold}} 生效' }, {}, 'context');
  assert.equal(out, '配置 {{state.gold}} 生效', '落盘补丁上非法名组逐字透传');
  assert.equal(warns.length, 1);
});
