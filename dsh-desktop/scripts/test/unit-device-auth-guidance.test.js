'use strict';

// 设备未授权指引补丁（device-auth-guidance）单测。
// 覆盖：靶字节命中（0.2.2-rc.2 第四形态 V4）/ 只吃两行不碰 fromFailure 尾巴 /
// 产物语法 / 幂等 / 403+设备风控特征 vm 实跑出中文指引 / 锚点漂移报 anchor-missing。
//
// rc.2 换代（真字节，非推测）：非 2xx 分支收口到 `throw LlmError.fromFailure(...)`，
// 第三代「const failure = providerError(...) + throw new LlmError(...)」锚点全灭。
// 现锚点（patch-adapters 的 V4）只吃这两行：
//   const failure = providerError(raw, response.status, response.headers);
//   const message = files.errorMessage(response.status, failure.message, detail);
// 注入体把中文指引拼在 errorMessage(...) 尾部，判定读 `failure.message + text`。
// 判据为什么读 text 而不是 detail：rc.2 的 `const detail = providerErrorDetail(raw)`
// 是对象，模板插值只会得到 "[object Object]"；响应原文在 `const text = await
// response.text();`（靶文件同作用域），与 failure.message 拼起来才是可判的字符串。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const { transformDeviceAuthGuidance, toPristineSource, markers } = require('../lib/patch-adapters');
const { DS_LLM_DEEPSEEK_PKG_REL } = require('../lib/patch-target-resolver');

const DEVICE_AUTH_MARKER_TEXT = markers.DEVICE_AUTH_GUIDANCE_MARKER;

// 靶文件候选：dev 安装树优先（与运行时同源），其次打包 payload 镜像（同一布局
// 下的 dsh-desktop 子树）。两处都会被 boot 链 / stage-payload 就地打补丁，所以
// 拿到字节后统一剥离注入体 —— 基准不再是「某个目录恰好没被碰过」，而是真实发行
// 字节的确定逆运算。
const TARGET_CANDIDATES = [
  path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
  path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'pp',
    'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
];

const TARGET = TARGET_CANDIDATES.find((f) => fs.existsSync(f)) || null;

// rc.2 真形状（V4）注入体的确定逆运算。生产侧 PRISTINE_INJECTIONS 只登记到 V3
// （providerError + throw 形态），而本机 dev 树 / payload 镜像已是 V4 补丁态 ——
// 只靠 toPristineSource 剥不掉 V4 注入体，transform 会退化成 already，哨兵失去
// 报警能力。这里按 V4 注入体的确定形状反向替换回两行 pristine 形态：
// failure 行 + 5 行 marker 注释 + hint 行 + 被改写的 message 行。
// 缩进用反向引用 \1 绑定，注释行数与形状（含 [object Object] 那条教训）都写死；
// 剥不掉即抛错 —— 形态漂移要让哨兵当场红，不许静默放过。
const RE_V4_INJECTED = /([ \t]*)const failure = providerError\(raw, response\.status, response\.headers\);\r?\n\1\/\/ dsh-desktop compat: device-auth guidance:[^\n]*\r?\n(?:\1\/\/ [^\n]*\r?\n){4}\1const __dshDeviceAuthHint = [^\n]*\r?\n\1const message = files\.errorMessage\(response\.status, failure\.message, detail\) \+ __dshDeviceAuthHint;/;

function stripInjection(src) {
  // 先走生产侧逆运算（V1/V2/V3 世代的老树也能还原），再剥 V4。
  const legacyStripped = toPristineSource('device-auth-guidance', src);
  if (!legacyStripped.includes(DEVICE_AUTH_MARKER_TEXT)) return legacyStripped;
  const eol = legacyStripped.includes('\r\n') ? '\r\n' : '\n';
  const m = legacyStripped.match(RE_V4_INJECTED);
  assert.ok(m, '真实靶字节含 device-auth marker，但注入体不是 V4 形状（上游重靶/补丁换代），哨兵需随迁');
  const indent = m[1];
  return legacyStripped.replace(RE_V4_INJECTED, () => [
    indent + 'const failure = providerError(raw, response.status, response.headers);',
    indent + 'const message = files.errorMessage(response.status, failure.message, detail);',
  ].join(eol));
}

function realBytes() {
  assert.ok(TARGET, '找不到 dsh-llm-deepseek 靶文件（dev 树与 payload 镜像均缺失）');
  return fs.readFileSync(TARGET, 'utf8');
}

function pristineSrc() {
  return stripInjection(realBytes());
}

const lineCount = (s) => s.split('\n').length;

// rc.2 真形状的最小夹具（含 text / detail / retry / fromFailure 尾巴），缩进可配：
// 同一段代码在双产物里缩进并不一致（0.2.1 起 client.node/browser 双半边的教训），
// 锚点必须按缩进捕获整行，所以这里对 5 tab 与「空格缩进」两种各验一次。
// `continue` 是靶文件真实上下文（retry 命中就跳下一条），因此外面必须包着循环。
function rc2Fixture(baseIndent, unit) {
  const loopIndent = baseIndent;
  const ifIndent = loopIndent + unit;
  const inner = ifIndent + unit;
  const text = [
    'async function* call() {',
    loopIndent + 'for (;;) {',
    ifIndent + 'if (!response.ok) {',
    inner + 'const text = await response.text();',
    inner + 'let raw;',
    inner + 'try {',
    inner + unit + 'raw = JSON.parse(text);',
    inner + '} catch (_nonJsonGatewayError) {}',
    inner + 'const detail = providerErrorDetail(raw);',
    inner + 'if (await files.retry(detail)) continue;',
    inner + 'const failure = providerError(raw, response.status, response.headers);',
    inner + 'const message = files.errorMessage(response.status, failure.message, detail);',
    inner + 'throw LlmError.fromFailure({',
    inner + unit + '...failure.failure,',
    inner + unit + 'message',
    inner + '}, { cause: new Error(text) });',
    ifIndent + '}',
    loopIndent + '}',
    '}',
  ].join('\n');
  return { text, anchorIndent: inner };
}

test('锚点命中真实靶字节（0.2.2-rc.2 V4）：剥离注入体后 changed 分支确实执行', { skip: TARGET ? false : '靶文件缺失' }, () => {
  const real = realBytes();
  // 磁盘字节是补丁态：transform 只能走 already（marker 命中短路），这是变了也没用的
  // 那一路；剥离后必须命中 V4 锚点走 changed —— 两态并列，证明断言测的是锚点而不是 marker。
  if (real.includes(DEVICE_AUTH_MARKER_TEXT)) {
    assert.strictEqual(transformDeviceAuthGuidance(real, 'index.js').status, 'already');
  }
  const pristine = pristineSrc();
  assert.ok(!pristine.includes(DEVICE_AUTH_MARKER_TEXT), '剥离后不得残留 marker');
  const r = transformDeviceAuthGuidance(pristine, 'index.js');
  assert.strictEqual(r.status, 'changed', `pristine 必须命中 V4 锚点，得 ${r.status}: ${r.detail || ''}`);
  assert.ok(r.src.includes(DEVICE_AUTH_MARKER_TEXT), '产物必须带 marker（幂等守卫靠它）');
  assert.ok(r.src.includes('files.errorMessage(response.status, failure.message, detail) + __dshDeviceAuthHint'),
    '指引必须拼在最终抛出文案尾部（errorMessage 的返回值才是用户看到的那句）');
  // 只吃两行：rc.2 的上下文（retry 判定与 fromFailure 尾巴）必须逐字留存。
  assert.ok(r.src.includes('if (await files.retry(detail)) continue;'), 'retry 行不得被动到');
  assert.ok(r.src.includes('throw LlmError.fromFailure({'), 'fromFailure 尾巴不得被动到');
  assert.ok(r.src.includes('...failure.failure,'), 'failure.failure 展开不得被动到');
  // 行数增量 = 5 行注释 + 1 行 hint（message 行被原地改写，不新增行）。
  assert.strictEqual(lineCount(r.src) - lineCount(pristine), 6, '注入体应恰好新增 6 行');
});

test('rc.2 真形状夹具（failure 变量 + providerError + errorMessage）命中 V4，且不挑缩进', () => {
  for (const [label, base, unit] of [['5-tab', '\t\t\t\t', '\t'], ['4-space', '   ', '    ']]) {
    const { text: fixture, anchorIndent } = rc2Fixture(base, unit);
    const r = transformDeviceAuthGuidance(fixture, `fixture-${label}.js`);
    assert.strictEqual(r.status, 'changed', `${label} 形态必须命中 V4 锚点，得 ${r.status}: ${r.detail || ''}`);
    assert.ok(r.src.includes(anchorIndent + 'const __dshDeviceAuthHint = '),
      `${label} 注入体的缩进必须跟随锚点缩进`);
    assert.ok(r.src.includes('throw LlmError.fromFailure({') && r.src.includes('if (await files.retry(detail)) continue;'),
      `${label} 夹具的上下文行必须原样留存`);
    new vm.Script(r.src, { filename: `fixture-${label}-patched.js` });
  }
});

test('transform 产物语法合法（node --check，ESM）', () => {
  const r = transformDeviceAuthGuidance(pristineSrc(), 'index.js');
  assert.strictEqual(r.status, 'changed');
  const tmp = path.join(os.tmpdir(), `dsh-dag-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, r.src);
  try {
    const res = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, `产物必须语法合法: ${res.stderr}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('幂等：二遍 already', () => {
  const once = transformDeviceAuthGuidance(pristineSrc(), 'index.js');
  const twice = transformDeviceAuthGuidance(once.src, 'index.js');
  assert.strictEqual(twice.status, 'already');
  assert.strictEqual(twice.src, undefined);
});

test('行为：403 + 设备风控特征 → 追加中文指引（vm 实跑注入分支）', () => {
  const r = transformDeviceAuthGuidance(pristineSrc(), 'index.js');
  // 0.2.2-rc.2 形态：注入体是一条 __dshDeviceAuthHint 三元表达式（更早两代是
  // `if (…) { message += … }` 语句块）。取整行在 vm 里实跑，测的是注入产物本身。
  const start = r.src.indexOf('const __dshDeviceAuthHint = ');
  assert.ok(start >= 0, '注入的设备授权判定分支必须存在');
  const branch = r.src.slice(start, r.src.indexOf('\n', start));
  // 判据必须是「响应原文 text」，不能是 detail：rc.2 的 detail 是对象，插值恒为
  // "[object Object]"，读它就等于永远不命中（静默做死）。
  assert.ok(!/detail/.test(branch), '判定不得读 detail（providerErrorDetail(raw) 是对象，插值成 [object Object]）');
  assert.ok(/\btext\b/.test(branch), '判定必须读响应原文 text');
  assert.ok(/\bfailure\.message\b/.test(branch), '判定必须读 failure.message');
  const deviceMsg = 'This device is not authorized. Please contact the administrator or try again later.';
  const gatewayRaw = '{"error":{"code":"risk_control","message":"This device is not authorized. Please contact the administrator or try again later."}}';
  // 变量面与靶文件同形：response.status / failure.message / text（响应原文）；
  // detail 仍是对象（证明注入体不需要它也能判）。
  function run(status, message, text) {
    return vm.runInNewContext(`
      var response = { status: ${status} };
      var failure = { message: ${JSON.stringify(message)} };
      var text = ${JSON.stringify(text === undefined ? '' : text)};
      var detail = ${JSON.stringify({ message: deviceMsg })};
      ${branch}
      __dshDeviceAuthHint;
    `);
  }
  const hit = run(403, deviceMsg, JSON.stringify({ error: { message: deviceMsg } }));
  assert.ok(hit.includes('chat.deepseek.com'), '403 + not authorized 必须追加指引');
  assert.ok(hit.includes('凭据被 DeepSeek 服务端拒绝'), '指引要有能一眼认出的一句标题');
  const hit401 = run(401, '设备未授权，请联系管理员', '');
  assert.ok(hit401.includes('chat.deepseek.com'), '401 + 中文设备未授权也命中');
  const hitRawText = run(403, 'DeepSeek API error (HTTP 403)', gatewayRaw);
  assert.ok(hitRawText.includes('chat.deepseek.com'), '特征只在响应原文里也要命中（rc.2 的 failure.message / text 分工）');
  const generic = run(401, 'Authentication Fails, Your api key is invalid', '{"error":{"code":"invalid_api_key"}}');
  assert.equal(generic, '', '一般性密钥错误不追加（防噪音）');
  const ok500 = run(500, deviceMsg, gatewayRaw);
  assert.equal(ok500, '', '非 401/403 不追加（5xx 也可能带该文案，指引只谈凭据）');
});

test('锚点漂移必须报 anchor-missing（V4/V3/V2/V1 全不命中）', { skip: TARGET ? false : '靶文件缺失' }, () => {
  const pristine = pristineSrc();
  // 反向对照：未漂移的同一份字节必须 changed，否则「漂移即红」是空转。
  assert.strictEqual(transformDeviceAuthGuidance(pristine, 'index.js').status, 'changed');
  const drifted = pristine.replace(
    'const message = files.errorMessage(response.status, failure.message, detail);',
    'const message = files.errorMessage(response.status, failure.message);',
  );
  assert.notStrictEqual(drifted, pristine, '变异必须真的落到字节上（否则本用例在空转）');
  const r = transformDeviceAuthGuidance(drifted, 'index.js');
  assert.strictEqual(r.status, 'anchor-missing', `锚点漂移必须报 anchor-missing，得 ${r.status}`);
  assert.match(r.detail, /V4\/V3\/V2\/V1/, '详情要写明四代锚点均未命中');
});

test('registry 登记：guard 组 order 154 / cli:false / marker 导出', () => {
  const registry = require('../lib/patch-registry');
  const adapters = require('../lib/patch-adapters');
  const specs = registry.PATCH_SPECS || [];
  const spec = specs.find((s) => s.id === 'device-auth-guidance');
  assert.ok(spec, 'device-auth-guidance 必须登记');
  assert.strictEqual(spec.group, 'guard');
  assert.strictEqual(spec.order, 154);
  assert.strictEqual(spec.cli, false);
  assert.ok(spec.pkgRel.includes('dsh-llm-deepseek'));
  assert.ok(adapters.markers.DEVICE_AUTH_GUIDANCE_MARKER, 'marker 必须导出');
});
