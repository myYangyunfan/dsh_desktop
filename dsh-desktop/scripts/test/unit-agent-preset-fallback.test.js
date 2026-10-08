'use strict';

// agent-preset-fallback 补丁单元测试（node --test）。
//
// 0.5.0 存量用户 resume 变砖修复：会话/profile 引用 Electron 老版本安装的
// minimal-win 预设 → 内核 dsh-agent-presets resolve() 查无此 id 硬抛 →
// resume 硬失败。补丁把该分支改为 warn 降级回落（minimal-win→minimal、其余
// 未知 id→standard），broken 预设的 resolveMountable 硬抛路径不经本补丁。
//
// 覆盖：
//   1. 锚点命中 pristine 源（vendor alpha.3 tarball 解出的 lib/index.js +
//      lib/invariant.js 双文件）；
//   2. transform 产物可被 node --check 解析；
//   3. 幂等（二遍 already）；
//   4. 回落逻辑行为（vm 执行真实注入产物，非复述实现）：
//      minimal-win→minimal / 未知 id→standard / roster 无可回落→原样抛 /
//      已知 id 直通不告警 / resolveMountable 路径不受补丁影响；
//   5. registry 装配（布局 / pkgRels / transform 同源 / cli:false 不进 CLI 清单）；
//   6. 临时目录 pristine 副本实跑 patch-runner applyAll（changed → already、
//      errors=0、failed=0）。

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const { transformAgentPresetFallback, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { AGENT_PRESET_FALLBACK_PKG_RELS, resolvePatchTargets } = require('../lib/patch-target-resolver');
const { applyAll } = require('../integration/patch-runner');
const { kernel } = require('../compat/kernel-pin.json');

const MARKER = 'dsh-desktop fix: agent-preset-fallback';
// pristine 内核包源：vendored kernel-pin 版本 tarball（vendor/dsh-kernel/，升级即换版）。
// 0.2.0-rc.2：预设 roster 包 dsh-agent-presets 已拆成 dsh-agent-preset（声明）+
// dsh-agent-preset-registry（注册表）。resolve 的硬抛点在 registry，故本测试的靶包、
// pkgDir 与断言全部随迁为 registry（仍是 lib/index.js + lib/invariant.js 双文件）。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const VENDOR_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-agent-preset-registry-${kernel.packageVersion}.tgz`,
);

/** 把 vendor tarball 解到一次性目录，返回解包后的包目录（package/）。 */
function extractPristineRegistry() {
  assert.ok(fs.existsSync(VENDOR_TARBALL), '缺 vendored ' + kernel.packageVersion + ' registry tarball: ' + VENDOR_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-apf-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', VENDOR_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package');
}

const PRISTINE_REGISTRY_DIR = extractPristineRegistry();
const PRISTINE_FILES = ['lib/index.js', 'lib/invariant.js']
  .map((rel) => path.join(PRISTINE_REGISTRY_DIR, rel))
  .filter((f) => fs.existsSync(f));

// 与上游 registry 同构的独立 fixture（tarball 缺失时的兜底源）。
// 0.2.0-rc.2 形态：resolve()（类成员 2-tab、not-found 抛错 3-tab，经
// this.definitions.get + this.diagnostic）与 retain()（mount 链路，not-found 抛错
// 4-tab、包在 while(true) CAS 循环内）两处都硬抛；锚点区段与 tarball 实文逐字一致。
const PRISTINE_RESOLVE = [
  'var RemoteError = class extends Error {',
  '\tconstructor(code, message, props) {',
  '\t\tsuper(message);',
  '\t\tthis.code = code;',
  '\t\tObject.assign(this, props);',
  '\t}',
  '};',
  'function buildRegistry(_classSuper) {',
  '\treturn class AgentPresetRegistry extends _classSuper {',
  '\t\tasync diagnostic(record) {',
  '\t\t\treturn record.broken;',
  '\t\t}',
  '\t\tasync resolve(id) {',
  '\t\t\tconst wanted = id ?? this.defaultId;',
  '\t\t\tconst record = this.definitions.get(wanted);',
  '\t\t\tif (record === void 0) throw new RemoteError("agent-preset/not-found", `Unknown agent preset: ${wanted}`, {',
  '\t\t\t\tagentPreset: wanted,',
  '\t\t\t\tavailable: [...this.definitions.keys()]',
  '\t\t\t});',
  '\t\t\tconst broken = await this.diagnostic(record);',
  '\t\t\treturn {',
  '\t\t\t\tid: wanted,',
  '\t\t\t\t...broken === void 0 ? {} : { broken }',
  '\t\t\t};',
  '\t\t}',
  '\t\tasync retain(id) {',
  '\t\t\tconst wanted = id ?? this.defaultId;',
  '\t\t\twhile (true) {',
  '\t\t\t\tconst record = this.definitions.get(wanted);',
  '\t\t\t\tif (record === void 0) throw new RemoteError("agent-preset/not-found", `Unknown agent preset: ${wanted}`, {',
  '\t\t\t\t\tagentPreset: wanted,',
  '\t\t\t\t\tavailable: [...this.definitions.keys()]',
  '\t\t\t\t});',
  '\t\t\t\treturn this.resolve(wanted);',
  '\t\t\t}',
  '\t\t}',
  '\t};',
  '}',
  'export { buildRegistry, RemoteError };',
].join('\n');

function tmpdir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'dsh-apf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// 1-3：锚点命中 pristine / 语法合法 / 幂等。
// ---------------------------------------------------------------------------

test('锚点命中 payload pristine 源（index.js 与同源 invariant.js 双文件）', () => {
  // payload 缺失（精简 checkout）时退回内联 fixture，不静默通过。
  const sources = PRISTINE_FILES.length > 0
    ? PRISTINE_FILES.map((f) => [f, fs.readFileSync(f, 'utf8')])
    : [['<inline>', PRISTINE_RESOLVE]];
  assert.ok(sources.length >= 1, '至少应有 index.js 一份源');
  for (const [file, src] of sources) {
    const out = transformAgentPresetFallback(src, file);
    assert.equal(out.status, 'changed', file + ' pristine 源应命中锚点');
    assert.ok(out.src.includes(MARKER), file + ' 产物应含 marker 注释');
    assert.ok(out.src.includes('available.includes("minimal")'), file + ' 产物应含 minimal-win→minimal 回落');
    assert.ok(out.src.includes('available.includes("standard")'), file + ' 产物应含未知 id→standard 保底');
    assert.ok(out.src.includes('console.warn'), file + ' 产物应含中文告警日志');
  }
});

test('payload pristine 双文件均存在时逐文件覆盖（index.js 必在）', { skip: PRISTINE_FILES.length === 0 }, () => {
  const rels = PRISTINE_FILES.map((f) => path.relative(PRISTINE_REGISTRY_DIR, f).split(path.sep).join('/'));
  assert.ok(rels.includes('lib/index.js'), '运行时实际加载的 lib/index.js 必须被覆盖');
});

test('transform 产物语法合法（node --check）', (t) => {
  const dir = tmpdir(t, 'dsh-apf-check-');
  const sources = PRISTINE_FILES.length > 0
    ? PRISTINE_FILES.map((f) => [path.basename(f), fs.readFileSync(f, 'utf8')])
    : [['inline.js', PRISTINE_RESOLVE]];
  for (const [name, src] of sources) {
    const out = transformAgentPresetFallback(src, name);
    assert.equal(out.status, 'changed');
    const checkFile = path.join(dir, name);
    fs.writeFileSync(checkFile, out.src);
    const res = spawnSync(process.execPath, ['--check', checkFile], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, name + ' 补丁产物必须语法合法: ' + (res.stderr || ''));
  }
});

test('幂等：第二遍 already / 无锚点 anchor-missing 不改写', () => {
  const changed = transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js');
  assert.equal(changed.status, 'changed');
  assert.equal(transformAgentPresetFallback(changed.src, 't.js').status, 'already');
  // marker 短路：仅 marker 注释也算已应用。
  assert.equal(transformAgentPresetFallback('// ' + MARKER, 't.js').status, 'already');
  // 失配：无锚点 → anchor-missing（版本漂移），绝不改写。
  const miss = transformAgentPresetFallback('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
  assert.equal(miss.src, undefined, '失配时不得返回改写源');
});

// ---------------------------------------------------------------------------
// 4：回落逻辑行为（vm 执行 transform 的真实注入产物）。
// ---------------------------------------------------------------------------

/**
 * 从 transform 产物里抽出「注入的回落 helper + resolve 方法体」，在 vm 沙箱里按真实
 * 语义执行——测的是注入产物本身，不是复述实现。
 * 沙箱提供上游同构的 RemoteError（rc.2 的 not-found 抛错形态）与 console.warn 采集；
 * receiver 按 0.2.0-rc.2 registry 的真实依赖面提供 definitions（Map）/ diagnostic /
 * defaultId，并把 resolve 自身接回去（注入体回落时 `return this.resolve(fallbackId)`
 * 递归一次即命中存在项终止）。
 */
function makeResolve(patchedSrc) {
  const hs = patchedSrc.indexOf('function __dshAgentPresetFallbackId(wanted, available) {');
  assert.ok(hs !== -1, '产物应含注入的回落 helper');
  const he = patchedSrc.indexOf('\n}', hs);
  assert.ok(he !== -1, '应找到 helper 收尾');
  const helperSrc = patchedSrc.slice(hs, he + '\n}'.length);
  const start = patchedSrc.indexOf('async resolve(id) {');
  assert.ok(start !== -1, '产物应含 resolve 方法');
  const end = patchedSrc.indexOf('\n\t\t}', start);
  assert.ok(end !== -1, '应找到方法收尾');
  const methodSrc = patchedSrc.slice(start, end + '\n\t\t}'.length);
  const warns = [];
  class RemoteError extends Error {
    constructor(code, message, props) {
      super(message);
      this.code = code;
      Object.assign(this, props);
    }
  }
  const sandbox = { RemoteError, warns, console: { warn: (m) => warns.push(String(m)) } };
  const fn = vm.runInNewContext(helperSrc + '\n({\n' + methodSrc + '\n}).resolve', sandbox);
  return {
    warns,
    RemoteError,
    call: (roster, id, defaultId = 'standard') => {
      const self = {
        definitions: new Map(roster.map((preset) => [preset.id, preset])),
        diagnostic: async (record) => record.broken,
        defaultId,
      };
      self.resolve = (next) => fn.call(self, next);
      return fn.call(self, id);
    },
  };
}

const ROSTER = ['standard', 'ptc', 'minimal', 'cordis'].map((id) => ({ id, path: `/<root>/${id}/agent.cordis.yml` }));

test('回落：minimal-win → minimal（语义最近），warn 含原 id / 可用清单 / 回落目标 / 原因', async () => {
  const h = makeResolve(transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js').src);
  const preset = await h.call(ROSTER, 'minimal-win');
  assert.equal(preset.id, 'minimal', 'minimal-win 应回落 minimal');
  assert.equal(h.warns.length, 1, '恰好一条告警');
  const warn = h.warns[0];
  assert.ok(warn.includes('minimal-win'), '告警应含原 id');
  assert.ok(warn.includes('"minimal"'), '告警应含回落目标');
  assert.ok(warn.includes('回落'), '告警应说明回落原因');
  assert.ok(warn.includes('不存在'), '告警应说明该预设在当前安装中不存在');
  assert.ok(warn.includes('可用：'), '告警应列出可用预设清单（用户据此重选）');
});

test('回落：其他未知 id → standard（保底）', async () => {
  const h = makeResolve(transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js').src);
  const preset = await h.call(ROSTER, 'ghost-preset');
  assert.equal(preset.id, 'standard', '未知 id 应回落 standard');
  assert.equal(h.warns.length, 1);
  assert.ok(h.warns[0].includes('ghost-preset'));
  assert.ok(h.warns[0].includes('"standard"'));
});

test('回落：defaultId 指向 minimal-win（id 省略）同样回落', async () => {
  const h = makeResolve(transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js').src);
  const preset = await h.call(ROSTER, undefined, 'minimal-win');
  assert.equal(preset.id, 'minimal');
  assert.equal(h.warns.length, 1);
});

test('回落：minimal-win 但 roster 无 minimal → standard 兜底；standard 也无 → 原样抛', async () => {
  const mk = () => makeResolve(transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js').src);
  // minimal 缺失：兜底 standard。
  const h1 = mk();
  const noMinimal = ROSTER.filter((p) => p.id !== 'minimal');
  assert.equal((await h1.call(noMinimal, 'minimal-win')).id, 'standard', 'minimal 缺失时兜底 standard');
  // 空 roster：无可回落 → 保持上游硬抛语义，不告警。
  const h2 = mk();
  const empty = await h2.call([], 'minimal-win').then(
    () => assert.fail('空 roster 应抛 RemoteError'),
    (err) => err
  );
  assert.ok(empty.message.includes('minimal-win') && empty.message.includes('Unknown agent preset'));
  assert.equal(h2.warns.length, 0, '未发生回落不应告警');
  // 仅 ptc（standard 保底也缺失）：无可回落 → 原样硬抛，不告警。
  const h3 = mk();
  const ptcOnly = await h3.call([{ id: 'ptc', path: '/x' }], 'minimal-win').then(
    () => assert.fail('无 standard 可保底时应抛 RemoteError'),
    (err) => err
  );
  assert.equal(ptcOnly.agentPreset, 'minimal-win');
  // available 出自 vm 沙箱（另一 realm 的 Array 原型），取回本 realm 再比。
  assert.deepEqual([...ptcOnly.available], ['ptc'], '抛错的 available 属性应是 registry 真实定义面');
  assert.equal(h3.warns.length, 0, '未发生回落不应告警');
});

test('已知 id 直通：原语义不变（返回该 id 的身份记录、不告警）', async () => {
  const h = makeResolve(transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js').src);
  const preset = await h.call(ROSTER, 'cordis');
  assert.equal(preset.id, 'cordis');
  // rc.2 registry 的 resolve 返回新构造的身份对象（{ id, ...broken }），
  // 不再是 roster 里的原引用——直通判据改为「命中同一 record 且不告警」。
  assert.equal(preset.broken, void 0, '健康预设不应带 broken 字段');
  assert.equal(h.warns.length, 0, '已知 id 不得告警');
});

test('broken 预设不回落：补丁只动 not-found 分支，diagnostic（组合损坏）通道逐字不变', async () => {
  const changed = transformAgentPresetFallback(PRISTINE_RESOLVE, 't.js');
  // 注入代码不制造挂载期错误，也不触碰 broken 判定通道。
  assert.ok(!changed.src.includes('new PresetMountError'), '注入不得伪造/改写 PresetMountError 抛错');
  assert.equal(
    changed.src.split('this.diagnostic(record)').length - 1,
    PRISTINE_RESOLVE.split('this.diagnostic(record)').length - 1,
    '注入不得增删 diagnostic（broken）调用点',
  );
  // pristine tarball 上更强的字节级证明：diagnostic 方法体变换前后逐字一致
  //（rc.2 里 broken 由 this.diagnostic(record) 给出，被回落吞掉就等于把
  //  「部署真坏了」静默降级成「继续跑」，这是本补丁明确不做的事）。
  if (PRISTINE_FILES.length > 0) {
    const src = fs.readFileSync(PRISTINE_FILES[0], 'utf8');
    const out = transformAgentPresetFallback(src, PRISTINE_FILES[0]);
    const extract = (s) => {
      const start = s.indexOf('\t\tasync diagnostic(record) {');
      assert.ok(start !== -1, 'pristine 源应含 diagnostic');
      const end = s.indexOf('\n\t\t}', start);
      assert.ok(end !== -1, '应找到 diagnostic 收尾');
      return s.slice(start, end + '\n\t\t}'.length);
    };
    assert.equal(extract(out.src), extract(src), 'diagnostic 方法体必须逐字不变（broken 预设仍响亮）');
  }
  // 行为面：已知但 broken 的预设，resolve 照常返回 { id, broken }（不告警、不回落），
  // 上层的 resolveMountable 语义（broken 即拒挂）仍硬抛。
  class PresetMountError extends Error {}
  const resolveMountable = async (resolve, id) => {
    const preset = await resolve(id);
    if (preset.broken !== void 0) throw new PresetMountError(preset.id, preset.broken);
    return preset;
  };
  const h = makeResolve(changed.src);
  const rosterWithBroken = [{ id: 'standard', path: '/s', broken: 'composition is missing' }];
  await assert.rejects(
    () => resolveMountable((id) => h.call(rosterWithBroken, id), 'standard'),
    (err) => err instanceof PresetMountError && /standard/.test(err.message),
    'broken 预设应仍由挂载校验硬抛，而非被回落吞掉'
  );
  assert.equal(h.warns.length, 0, '已知 id（哪怕 broken）不走回落、不告警');
});

// ---------------------------------------------------------------------------
// 5：registry 装配。
// ---------------------------------------------------------------------------

test('registry：agent-preset-fallback 规格装配与布局正确', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'agent-preset-fallback');
  assert.ok(spec, '注册表应含 agent-preset-fallback');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, false, 'cli:false（仅桌面壳 boot 链应用，不进 CLI 清单）');
  assert.equal(spec.transform, transformAgentPresetFallback, 'transform 与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER);
  assert.equal(markers.AGENT_PRESET_FALLBACK_MARKER, MARKER, 'marker 单一数据源导出');
  assert.deepEqual(
    AGENT_PRESET_FALLBACK_PKG_RELS.map((r) => r.split(path.sep).join('/')),
    ['dsh-agent-preset-registry/lib/index.js', 'dsh-agent-preset-registry/lib/invariant.js'],
    '目标双文件：运行时入口 index.js + 同源 invariant.js'
  );
  // CLI 清单不受影响（cli:false 不进 getSpecsByCli）。
  assert.ok(!getSpecsByCli().some((s) => s.id === 'agent-preset-fallback'));
});

test('registry：runtime-local / wsl 布局落点覆盖内核可加载副本', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'agent-preset-fallback');
  const ctx = { home: 'C:\\h', appDir: 'C:\\app', userDataDir: 'C:\\ud', wslMode: false };
  const local = resolvePatchTargets(ctx, { ...spec, pkgRel: spec.pkgRels[0] });
  const norm = (f) => f.split(path.sep).join('/');
  assert.ok(local.some((f) => norm(f) === 'C:/app/node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js'), '本地三副本须含 appDir 内核副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/h/profiles/node_modules/')), '含 profile fallback 副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/ud/agent/node_modules/')), '含 agent overlay 副本');
  const wsl = resolvePatchTargets({ ...ctx, wslMode: true }, { ...spec, pkgRel: spec.pkgRels[0] });
  assert.ok(wsl.some((f) => norm(f) === 'C:/h/agent/node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js'), 'WSL 布局须含 UNC agent 副本');
});

// ---------------------------------------------------------------------------
// 6：临时目录 pristine 副本实跑 applyAll（changed → already、errors=0）。
// ---------------------------------------------------------------------------

test('applyAll 集成：payload pristine 副本首遍 changed、次遍 already，errors=0 / failed=0', (t) => {
  const home = tmpdir(t, 'dsh-apf-home-');
  const appDir = tmpdir(t, 'dsh-apf-app-');
  const userDataDir = tmpdir(t, 'dsh-apf-ud-');
  // 复制 vendor 解出的 dsh-agent-preset-registry pristine 副本到 appDir 内核落点。
  assert.ok(PRISTINE_FILES.length > 0, 'pristine 源缺失，无法做集成验证');
  const pkgDir = path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh-agent-preset-registry');
  fs.cpSync(PRISTINE_REGISTRY_DIR, pkgDir, { recursive: true });
  const logs = [];
  const ctx = { home, appDir, userDataDir, wslMode: false, logs, log: (m) => logs.push(m) };

  const run1 = applyAll(ctx);
  assert.equal(run1.errors.length, 0, '首遍不应有规格级异常: ' + JSON.stringify(run1.errors));
  assert.equal(run1.failed, 0, '首遍不应有逐文件失败');
  const file1 = path.join(pkgDir, 'lib', 'index.js');
  const file2 = path.join(pkgDir, 'lib', 'invariant.js');
  const after1 = fs.readFileSync(file1, 'utf8');
  assert.ok(after1.includes(MARKER), '首遍应已写入 index.js 回落代码');
  assert.ok(fs.readFileSync(file2, 'utf8').includes(MARKER), '首遍应已写入 invariant.js 回落代码');
  assert.ok(run1.changed >= 2, '首遍至少写入双文件（changed=' + run1.changed + '）');
  // 产物语法合法（真实落盘文件复检）。
  for (const f of [file1, file2]) {
    const res = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, f + ' 落盘产物必须语法合法: ' + (res.stderr || ''));
  }

  // 第二遍全量重跑：幂等 already，无新增失败。
  const run2 = applyAll(ctx);
  assert.equal(run2.errors.length, 0, '次遍不应有规格级异常: ' + JSON.stringify(run2.errors));
  assert.equal(run2.failed, 0, '次遍不应有逐文件失败');
  assert.equal(transformAgentPresetFallback(fs.readFileSync(file1, 'utf8'), file1).status, 'already', '次遍 index.js 应 already');
  assert.equal(transformAgentPresetFallback(fs.readFileSync(file2, 'utf8'), file2).status, 'already', '次遍 invariant.js 应 already');
  assert.equal(fs.readFileSync(file1, 'utf8'), after1, '次遍不得重复注入（字节不变）');
});
