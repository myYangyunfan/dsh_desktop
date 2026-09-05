'use strict';

// 设备未授权指引补丁（device-auth-guidance）单测：
// 锚点命中真实靶字节（剥离注入体还原 pristine）/ 产物语法 / 幂等 / vm 行为
//（403+设备风控特征 → 追加中文指引；一般 401 密钥错 → 不追加；2xx 路径零变化）。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { transformDeviceAuthGuidance, toPristineSource, markers } = require('../lib/patch-adapters');
const { DS_LLM_DEEPSEEK_PKG_REL } = require('../lib/patch-target-resolver');

const DEVICE_AUTH_MARKER_TEXT = markers.DEVICE_AUTH_GUIDANCE_MARKER;

// 靶文件候选：dev 安装树优先（与运行时同源），其次打包 payload 镜像（同一布局
// 下的 dsh-desktop 子树）。两处都会被 boot 链 / stage-payload 就地打补丁，所以
// 拿到字节后统一走 toPristineSource 剥离注入体 —— 基准不再是「某个目录恰好没
// 被碰过」，而是真实发行字节的确定逆运算。
// 早前这里抓 .tmp-rc2-stage 并回退到 package-payload 根（漏了 dsh-desktop 一层），
// 前者已不存在、后者路径 ENOENT，四条用例全红。
const TARGET_CANDIDATES = [
  path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
  path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
    'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
];

const TARGET = TARGET_CANDIDATES.find((f) => fs.existsSync(f)) || null;

function pristineSrc() {
  assert.ok(TARGET, '找不到 dsh-llm-deepseek 靶文件（dev 树与 payload 镜像均缺失）');
  return toPristineSource('device-auth-guidance', fs.readFileSync(TARGET, 'utf8'));
}

test('锚点命中真实靶字节（版本漂移哨兵）', { skip: TARGET ? false : '靶文件缺失' }, () => {
  const r = transformDeviceAuthGuidance(pristineSrc(), 'index.js');
  assert.strictEqual(r.status, 'changed', `pristine 必须命中锚点（V2/V1 双形态），得 ${r.status}: ${r.detail || ''}`);
});

test('双形态锚点：rc.8 老形态（2-tab + response.json）同样命中', () => {
  // A1 验证：上游 rc.1 重构了非 2xx 块（3-tab + response.text），rc.8 形态
  // 保留兜底。用最小 rc.8 形态夹具验证 V1 分支。
  const rc8Fixture = [
    'async function call() {',
    '\t\tif (!response.ok) {',
    '\t\t\tlet message = `DeepSeek API error (HTTP ${response.status})`;',
    '\t\t\tlet providerError;',
    '\t\t\ttry {',
    '\t\t\t\tproviderError = (await response.json()).error;',
    '\t\t\t\tif (providerError?.message) message = providerError.message;',
    '\t\t\t} catch {}',
    '\t\t\tconst delay = providerRetryAfterMs(response.headers.get("retry-after"));',
    '\t\t\tthrow new LlmError(message, httpErrorCode(response.status, providerError), {',
    '\t\t\t\tstatus: response.status,',
    '\t\t\t});',
    '\t\t}',
    '}',
  ].join('\n');
  const r = transformDeviceAuthGuidance(rc8Fixture, 'fixture.js');
  assert.strictEqual(r.status, 'changed', `rc.8 老形态必须命中 V1 兜底锚点，得 ${r.status}`);
  new vm.Script(r.src, { filename: 'rc8-patched.js' });
  assert.ok(r.src.includes(DEVICE_AUTH_MARKER_TEXT), 'V1 产物含指引 marker');
});

test('transform 产物语法合法（node --check，ESM）', () => {
  const r = transformDeviceAuthGuidance(pristineSrc(), 'index.js');
  const tmp = path.join(os.tmpdir(), `dsh-dag-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, r.src);
  try {
    const res = require('node:child_process').spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
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
  // 从产物抽出注入的判定分支（缩进无关：起点=判定 if，终点=message += 行后首个 }）。
  const start = r.src.indexOf('if ((response.status === 401');
  assert.ok(start >= 0, '注入的设备授权判定分支必须存在');
  const msgIdx = r.src.indexOf('message += "', start);
  assert.ok(msgIdx > 0, '指引追加行必须存在');
  const end = r.src.indexOf('}', msgIdx);
  const branch = r.src.slice(start, end + 1);
  const deviceMsg = 'This device is not authorized. Please contact the administrator or try again later.';
  function run(status, message) {
    const sandbox = `
      var message = ${JSON.stringify(message)};
      var response = { status: ${status} };
      var before = message;
      ${branch}
      ({ grew: message.length > before.length, message });
    `;
    return vm.runInNewContext(sandbox);
  }
  const hit = run(403, deviceMsg);
  assert.ok(hit.grew, '403 + not authorized 必须追加指引');
  assert.ok(hit.message.includes('chat.deepseek.com'), '指引必须含换令牌路径');
  assert.ok(hit.message.includes(deviceMsg), '原文保留在前');
  const hit401 = run(401, '设备未授权，请联系管理员');
  assert.ok(hit401.grew, '401 + 中文设备未授权也命中');
  const generic = run(401, 'Authentication Fails, Your api key is invalid');
  assert.ok(!generic.grew, '一般性密钥错误不追加（防噪音）');
  const ok500 = run(500, deviceMsg);
  assert.ok(!ok500.grew, '非 401/403 不追加（5xx 也可能带该文案，指引只谈凭据）');
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
