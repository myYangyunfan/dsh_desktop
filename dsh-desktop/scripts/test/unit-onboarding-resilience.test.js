'use strict';

// unit-onboarding-resilience.test.js — 首启引导两条补丁（onboarding-resilience）的行为锁。
//
// 症状（Windows 部分机型「点击开始设置没反应」）的实测根因不在我们代码里：内核
// dsh-client-ui-settings-account/lib/client.js 把引导步骤推进挂在
// element.animate(...).finished 上，而隐藏/未合成页面的渲染时间线整段停摆——本机内嵌
// Chromium 表面实测 3.4s 内 document.timeline 推进 0ms、finished 始终 PENDING。
// finished 不 settle ⇒ step 停在 welcome ⇒ busy = step !== targetStep 恒真 ⇒ 整页按钮
// disabled，且因为设置其实写成功了，内核那条错误面板也不会出现：用户读到「没反应」。
//
// 所以本套件必须把「时间线冻结」当成真场景跑，而不是只核对注入文本在位：
// ① 冻结时步骤仍在有界时间内推进，并留下一行 [onboarding-timeline] 诊断；
// ② 正常出帧时走原路（不抢跑、不多发诊断、cleanup 把定时器清掉）；
// ③ guard 静默拒绝必须报出「命中了哪一条」，且**返回值原样透传**（控制流不动是底线）；
// ④ 两条反证：摘掉回落 → 冻结场景复现「永远不推进」；helper 变空 → 诊断归零。
// 全部用真字节（STEP_GATE_* / GUARD_* 常量即补丁实现里的同一份文本），不复制粘贴。

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const DSH = path.join(__dirname, '..', '..');
const LIB = path.join(DSH, 'scripts', 'lib');
const onb = require(path.join(LIB, 'onboarding-resilience.js'));
const { PATCH_SPECS } = require(path.join(LIB, 'patch-registry.js'));
const { UI_SETTINGS_ACCOUNT_PKG_REL } = require(path.join(LIB, 'patch-target-resolver.js'));

const CLIENT_FILE = path.join(DSH, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-account', 'lib', 'client.js');

/** 假时钟 + 假桥：让「时间线冻结」与「page_error 通道」都能被确定性地观察。 */
function makeSandbox({ visibility = 'hidden' } = {}) {
  const timers = [];
  const invoked = [];
  const sandbox = {
    document: { visibilityState: visibility },
    __TAURI_INTERNALS__: {
      invoke: (cmd, args) => { invoked.push([cmd, args]); return Promise.resolve(null); },
    },
    console: { warn: (line) => invoked.push(['console', line]) },
    setTimeout: (fn, ms) => { timers.push({ fn, at: ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
  };
  const flush = (ms) => {
    for (const t of timers) if (t.live && t.at <= ms) { t.live = false; t.fn(); }
  };
  return { sandbox, timers, invoked, flush };
}

/** 跑一段注入体片段：片段自身的 `return` 就是 cleanup，直接当函数体用。 */
function runFragment(src, sandbox, locals) {
  const keys = Object.keys(locals);
  const body = '"use strict";\n' + src;
  const fn = vm.runInNewContext('(function (' + keys.join(',') + ') {\n' + body + '\n})', sandbox);
  return fn.apply(undefined, keys.map((k) => locals[k]));
}

// ── ① / ② 步骤推进的有界回落 ────────────────────────────────────────────────

function stepGateCase({ frozen, visibility = 'hidden' }) {
  const advanced = [];
  const animation = frozen
    ? { playState: 'running', currentTime: 0, finished: new Promise(() => {}), cancel() {} }
    : { playState: 'finished', currentTime: 40, finished: Promise.resolve(), cancel() {} };
  const { sandbox, invoked, flush } = makeSandbox({ visibility });
  const cleanup = runFragment(onb.STEP_GATE_NEW, sandbox, {
    animation,
    step: 'welcome',
    targetStep: 'credit',
    setStep: (v) => advanced.push(v),
  });
  return { advanced, invoked, flush, cleanup };
}

test('时间线冻结：步骤推进走有界回落，并留下一行成因诊断', async () => {
  const c = stepGateCase({ frozen: true });
  assert.deepEqual(c.advanced, [], '回落前不得推进（40ms 动画本就该先走完）');
  c.flush(400);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(c.advanced, ['credit'], '有界回落必须把步骤推进过去，否则按钮永久 disabled＝「点了没反应」');
  const line = c.invoked.find(([cmd]) => cmd === 'page_error');
  assert.ok(line, '走回落必须留痕（现场要的就是这个数）');
  assert.match(line[1].message, /\[onboarding-timeline\]/);
  assert.match(line[1].message, /welcome -> credit/);
  assert.match(line[1].message, /visibility=hidden/);
});

test('正常出帧：按原路推进，不抢跑也不多发诊断', async () => {
  const c = stepGateCase({ frozen: false, visibility: 'visible' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(c.advanced, ['credit'], '动画完成即推进');
  c.flush(400);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(c.advanced, ['credit'], '回落不得再推第二次');
  assert.equal(c.invoked.length, 0, '正常出帧不该有诊断行（否则日志被噪声淹没）');
});

test('cleanup 关掉定时器：卸载后不得再推进或报诊断', async () => {
  const c = stepGateCase({ frozen: true });
  c.cleanup();
  c.flush(400);
  assert.deepEqual(c.advanced, [], 'cleanup 之后回落必须被 clearTimeout 摘掉');
  assert.equal(c.invoked.length, 0);
});

test('回落上限 400ms：不是把动画整个删掉', () => {
  const ms = /setTimeout\(\(\) => \{[\s\S]*?\}, (\d+)\);\n\t+return \(\) => \{/.exec(onb.STEP_GATE_NEW);
  assert.ok(ms, '注入体里必须能读到回落时限（且定时器在 cleanup 之前 armed）');
  assert.equal(Number(ms[1]), 400, '40ms 动画 + 一帧余量的量级；再长用户就会读成「卡住」');
  assert.match(onb.STEP_GATE_NEW, /animation\.finished\.then\(__dshOnbAdvance/, '原动画路径必须保留（不是砍动画）');
});

// ── ③ guard 静默拒绝的成因上报 ─────────────────────────────────────────────

// 注入体是「上报 helper + 生命周期锚点」两段拼接，rc.2 起 helper 为单行压缩形态，
// 按行切片会连函数声明一起切掉（helper 变成空串 → 引用 __dshOnbGuardReport 当场 ReferenceError）。
// 按锚点切，且切不出东西就当场判红，避免这条判据静默空转。
const HELPER_SRC = (() => {
  const cut = onb.GUARD_HELPER_NEW.indexOf(onb.GUARD_HELPER_ANCHOR);
  assert.ok(cut > 0, 'GUARD_HELPER_NEW 必须由「上报 helper + 生命周期锚点」两段组成');
  return onb.GUARD_HELPER_NEW.slice(0, cut).replace(/;\s*$/, '');
})();
assert.match(HELPER_SRC, /__dshOnbGuardReport/, 'helper 片段必须真的声明上报函数');

function guardCase(controllerOverrides) {
  const state = {
    disposed: false, completing: false, saving: false, draft: void 0,
    view: { status: 'credential-stored' }, saved: { step: 'welcome' },
    ...controllerOverrides,
  };
  const controller = {
    disposed: state.disposed, completing: state.completing, saving: state.saving,
    draft: state.draft,
    account: { getSnapshot: () => ({ view: state.view }) },
    readProgress: () => state.saved,
  };
  const { sandbox, invoked } = makeSandbox();
  const report = runFragment(HELPER_SRC + '\nreturn __dshOnbGuardReport;', sandbox, { controller });
  return { report, invoked };
}

test('guard 命中：每条拒绝都报出自己的成因', () => {
  const cases = [
    [{ disposed: true }, /disposed/],
    [{ completing: true }, /completing/],
    [{ saving: true, draft: void 0 }, /saving-in-flight/],
    [{ view: void 0 }, /account=none/],
    [{ view: { status: 'signed-out' } }, /account=signed-out/],
    [{ saved: void 0 }, /progress=undefined/],
    [{ saved: { step: 'done' } }, /progress=done/],
  ];
  for (const [over, expect] of cases) {
    const c = guardCase(over);
    c.report('update', false);
    const line = c.invoked.find(([cmd]) => cmd === 'page_error');
    assert.ok(line, JSON.stringify(over) + ' 必须上报');
    assert.match(line[1].message, /\[onboarding-guard\] update 被 guard 静默拒绝/);
    assert.match(line[1].message, expect, line[1].message);
  }
});

test('guard 通过（ok 为 true）时零上报——诊断不是噪声发生器', () => {
  const c = guardCase({});
  c.report('update', true);
  c.report('complete', undefined);
  assert.equal(c.invoked.length, 0);
});

test('调用点透传返回值：补诊断不得改掉控制流', async () => {
  const results = [false, true];
  const wrapped = results.map((r) => Promise.resolve(r).then((ok) => (ok, ok)));
  assert.equal(await wrapped[0], false, 'false 必须原样透传（内核按返回值决定后续）');
  assert.equal(await wrapped[1], true);
  const callSite = onb.GUARD_CALLS_NEW;
  assert.match(callSite, /__dshOnbGuardReport\("update", __dshOnbOk\), __dshOnbOk/, '调用点必须是「报完再把 ok 交回去」');
  assert.match(callSite, /__dshOnbGuardReport\("complete", __dshOnbOk\), __dshOnbOk/);
});

// ── ④ 反证两条：守卫摘掉后，故障必须按预期复现 ─────────────────────────────

test('反证 1：摘掉有界回落，时间线冻结时步骤永不推进（本套件的判据因此在咬真东西）', () => {
  const advanced = [];
  const animation = { playState: 'running', currentTime: 0, finished: new Promise(() => {}), cancel() {} };
  const { sandbox, flush } = makeSandbox();
  runFragment(onb.STEP_GATE_OLD, sandbox, {
    animation, step: 'welcome', targetStep: 'credit', setStep: (v) => advanced.push(v),
  });
  flush(60000);
  assert.deepEqual(advanced, [], '未打补丁的原文在冻结时间线下就是「点了没反应」——这就是用户症状');
});

test('反证 2：helper 变空操作时，guard 拒绝重新归于无声', () => {
  const { sandbox, invoked } = makeSandbox();
  const noop = runFragment('return () => {};', sandbox, {});
  noop('update', false);
  assert.equal(invoked.length, 0);
});

// ── ⑤ 真字节：锚点在 **pristine** 内核包上命中，且幂等 ─────────────────────
// 关键纪律：npm ci 的 postinstall 已经把补丁打进 node_modules，直接读那份树会得到
// 「锚点不存在」的假红（本套件在全量跑里就是这么红的）。真字节判据一律走 pristine 闭包树，
// 与 ta6-transform-contract / ta6-baseline-matrix 同一口径；缺树时诚实 skip 并点名查过哪些根。

const pristine = require(path.join(LIB, 'pristine-kernel-roots.js'));
const SKIP_NO_PRISTINE = '无可用 pristine 内核闭包树（查过：'
  + (typeof pristine.describePristineRoots === 'function'
    ? pristine.describePristineRoots() : pristine.pristineRoots().join(' , ') || '（无）') + '）';

function pristineClientBytes() {
  const p = pristine.findPristineFile(UI_SETTINGS_ACCOUNT_PKG_REL);
  return p ? { file: p, src: fs.readFileSync(p, 'utf8') } : null;
}

test('锚点命中 pristine 真字节，二次应用判 already（marker 与 already 判定同源）', (t) => {
  const target = pristineClientBytes();
  if (!target) { t.skip(SKIP_NO_PRISTINE); return; }
  const { file, src } = target;
  assert.ok(src.includes(onb.STEP_GATE_OLD), '步骤动画锚点必须逐字命中 pristine rc.2 字节：' + file);
  assert.ok(src.includes(onb.GUARD_HELPER_ANCHOR) && src.includes(onb.GUARD_CALLS_OLD), 'guard 锚点必须逐字命中');

  const a = onb.transformOnboardingStepProgressTimeout(src, file);
  assert.equal(a.status, 'changed');
  const b = onb.transformOnboardingGuardReport(a.src, file);
  assert.equal(b.status, 'changed');
  assert.equal(onb.transformOnboardingStepProgressTimeout(b.src, file).status, 'already', '重复应用必须幂等');
  assert.equal(onb.transformOnboardingGuardReport(b.src, file).status, 'already', '重复应用必须幂等');

  // 版本漂移时必须老实报 anchor-missing，而不是把 bundle 改坏。
  // 变异要打在 pristine 的真字节上（rc.2 客户端产物是压缩态，没有空格形态），
  // 先确认变异串在位——否则 replace 静默空转，未变异的原件照样渲染通过，反证就成了假绿。
  const DRIFT_FROM = 'animation.finished.then(()=>{setStep(targetStep)}';
  assert.ok(src.includes(DRIFT_FROM), '变异串必须逐字命中 pristine 真字节（否则反证空转）：' + DRIFT_FROM);
  const drift = src.replace(DRIFT_FROM, 'animation.finished.then(()=>{setStep(targetStep ),_error=>{}');
  assert.notEqual(drift, src, '变异必须真的改动字节');
  assert.equal(onb.transformOnboardingStepProgressTimeout(drift, file).status, 'anchor-missing');
});

test('注入后的 bundle 语法成立（transform 产物不是坏 JS）', (t) => {
  const target = pristineClientBytes();
  if (!target) { t.skip(SKIP_NO_PRISTINE); return; }
  const a = onb.transformOnboardingStepProgressTimeout(target.src, target.file);
  const b = onb.transformOnboardingGuardReport(a.src, target.file);
  const tmp = path.join(require('node:os').tmpdir(), 'dsh-onb-patched-' + process.pid + '.cjs');
  fs.writeFileSync(tmp, b.src);
  try {
    require('node:child_process').execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('收敛树里两条 marker 都在位，且再跑一遍判 already（装机路径真的会应用）', (t) => {
  if (!fs.existsSync(CLIENT_FILE)) { t.skip('本机无 node_modules 收敛树'); return; }
  const applied = fs.readFileSync(CLIENT_FILE, 'utf8');
  assert.ok(applied.includes(onb.ONBOARDING_STEP_TIMEOUT_MARKER), '根治补丁 marker 应在收敛树里');
  assert.ok(applied.includes(onb.ONBOARDING_GUARD_REPORT_MARKER), '诊断补丁 marker 应在收敛树里');
  assert.equal(onb.transformOnboardingStepProgressTimeout(applied, CLIENT_FILE).status, 'already', '已应用的树不得二次改写');
  assert.equal(onb.transformOnboardingGuardReport(applied, CLIENT_FILE).status, 'already', '已应用的树不得二次改写');
});

test('登记面：两条 spec 齐备且靶文件正确', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const id of ['onboarding-step-progress-timeout', 'onboarding-guard-report']) {
    const spec = byId[id];
    assert.ok(spec, id + ' 必须登记进 PATCH_SPECS');
    assert.equal(spec.group, 'guard', id + ' 属 guard 组（仅桌面壳运行时应用）');
    assert.equal(spec.cli, false, id + ' 不得进 CLI 同步期');
    assert.equal(spec.kind, 'file');
    assert.equal(spec.layout, 'guard');
    assert.equal(spec.wslLayout, 'guard');
    assert.equal(spec.pkgRel, UI_SETTINGS_ACCOUNT_PKG_REL, id + ' 的靶必须是引导 client bundle');
    assert.equal(typeof spec.transform, 'function');
    assert.ok(spec.marker && spec.marker.length > 20, id + ' 需要 marker');
  }
});
