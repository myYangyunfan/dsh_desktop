'use strict';

// patch-adapters 单元测试（node --test）。
// 验证原 main.js 内联的 6 个 transform 声明化后，三态（匹配 / 失配 / 已应用）
// 判定与注入字节级等价；runtime-patches 的 transform re-export 可用。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  transformProfilePatchGuard,
  transformPluginInventoryTabMergeFix,
  transformFlashFix,
} = require('../lib/patch-adapters');

// 0.1.5-rc.1 重锚：loadProfileDirectory 的 patches 由对象键值（patches: …，2-tab）
// 改为 const 语句形态（1-tab）——与 patch-adapters.js PROFILE_PATCH_GUARD_CALL_SITE 逐字一致。
const PATCH_GUARD_CALL = '\tconst patches = options.userLayer !== false && existsSync(patchPath) ? loadOverlayPatches(binName, patchPath) : [];';
const PATCH_GUARD_AFTER = '\treturn parsePatchList(binName, file, content, "overlay");\n}';

test('transformProfilePatchGuard：匹配 / 已应用 / 失配三态', () => {
  const src = PATCH_GUARD_CALL + '\n' + PATCH_GUARD_AFTER;
  const changed = transformProfilePatchGuard(src, 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes('function loadUserPatchLayer'));
  assert.ok(changed.src.includes('const patches = loadUserPatchLayer(binName, patchPath, options)'));
  // 已应用：marker（function loadUserPatchLayer）存在 → already
  assert.equal(transformProfilePatchGuard('function loadUserPatchLayer', 't.js').status, 'already');
  // 失配：缺少 callSite/insertAfter
  const miss = transformProfilePatchGuard('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
});

// settings-section-guard 已随 0.2.0-rc.2 退役并从 patch-adapters 删除：其锚点
// `const scope = this.register(ns, schema, {`（provider 方法 installSection 内的
// 注册调用点）在 rc.2 全内核 0 命中，插入点不存在 ⇒ 无实现可测，用例随之撤除。

const TAB_MARKER = 'dsh-desktop fix: hide inventory tab';
// 0.2.2-rc.2：settings-plugins 的 lib/client.js 变成压缩产物（8KB / 3 行），
// tabs 派生退化成单行语句——锚点必须按压缩态真字节认，写死上一代的空格/缩进形态恒 0 命中。
const TAB_OLD = 'tabs=ctx.slots.entries(`settings.plugins.tab`).map(entry=>({';

test('transformPluginInventoryTabMergeFix：匹配 / 已应用 / 失配三态', () => {
  const changed = transformPluginInventoryTabMergeFix(TAB_OLD, 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes(TAB_MARKER));
  assert.ok(changed.src.includes('.filter((entry) => (entry.options.id ?? "") !== "all")'));
  assert.equal(transformPluginInventoryTabMergeFix('// ' + TAB_MARKER, 't.js').status, 'already');
  assert.equal(transformPluginInventoryTabMergeFix('export const x = 1;', 't.js').status, 'anchor-missing');
});

test('runtime transform re-export 可用', () => {
  // 仅验证 re-export 链路通：flash 变换的已应用判定。
  // 夹具按 rc.2 压缩产物的真字节写（上游 `const merged=…` 单行语句），
  // 已应用态即含 `??value` 的那份字节。
  const src = 'const merged=current.map(value=>baselineByKey.get(keyOf(value))??value).filter(value=>value!==void 0);';
  assert.equal(transformFlashFix(src, 't.js').status, 'already');
  // 反证：未经闪跳修复的旧字节必须被判成 changed 而不是 already。
  const old = 'const merged=current.map(value=>baselineByKey.get(keyOf(value))).filter(value=>value!==void 0);';
  assert.equal(transformFlashFix(old, 't.js').status, 'changed');
});

test('transformPersistenceAll re-export 可用（损坏会话容错收口，勿回退旧名）', () => {
  // 语义修正：session-persistence 已从 transformPersistenceTornTail 升级为
  // transformPersistenceAll（含 #112 损坏会话容错），patch-adapters 的 re-export
  // 必须同步，且不得残留旧导出名。
  const adapters = require('../lib/patch-adapters');
  assert.equal(typeof adapters.transformPersistenceAll, 'function', '应 re-export transformPersistenceAll');
  assert.equal(adapters.transformPersistenceTornTail, undefined, '不应再导出旧的 transformPersistenceTornTail');
  // re-export 的 transformPersistenceAll 应能实际执行（失配 → anchor-missing）。
  assert.equal(adapters.transformPersistenceAll('export const x = 1;', 't.js').status, 'anchor-missing');
});

test('golden fixture：插件页标签合并补丁三态', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plugin-inventory-tab-merge.golden.json'), 'utf8'));
  assert.equal(fixture.id, 'plugin-inventory-tab-merge');
  const { match, already, 'anchor-missing': missing } = fixture.cases;
  const m = transformPluginInventoryTabMergeFix(match.input, 't.js');
  assert.equal(m.status, match.status);
  for (const needle of match.expectContains) assert.ok(m.src.includes(needle), needle);
  assert.equal(transformPluginInventoryTabMergeFix(already.input, 't.js').status, already.status);
  assert.equal(transformPluginInventoryTabMergeFix(missing.input, 't.js').status, missing.status);
});

test('transformDirectoryPickerWslBrowse：真实包三态 + WSL 判定行为（W1 问题四）', () => {
  const adapters = require('../lib/patch-adapters');
  // 真实包源作 golden fixture：锚点与上游 lib/index.js 逐字一致（漂移即本测试报警）。
  // 注意 dsh-desktop/node_modules 是 postinstall/boot 链已打补丁树——首次跑为
  // changed，打过后为 already，两态都合法（真正的失配是 anchor-missing）。
  const real = fs.readFileSync(
    path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-auto', 'lib', 'index.js'),
    'utf8',
  );
  const applied = adapters.transformDirectoryPickerWslBrowse(real, 't.js');
  assert.ok(applied.status === 'changed' || applied.status === 'already', `真实包应命中锚点或已应用，得 ${applied.status}`);
  const patchedSrc = applied.status === 'changed' ? applied.src : real;
  assert.ok(patchedSrc.includes(adapters.markers.WSL_PICKER_BROWSE_MARKER));
  assert.ok(patchedSrc.includes('WSL_INTEROP') && patchedSrc.includes('WSL_DISTRO_NAME'));
  // 幂等：marker 在场 → already。
  assert.equal(adapters.transformDirectoryPickerWslBrowse(patchedSrc, 't.js').status, 'already');
  // 失配：无锚点 → anchor-missing，绝不改写。
  const miss = adapters.transformDirectoryPickerWslBrowse('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));

  // 行为验证：从补丁后源码抽出 resolveDirectoryPickerBackend 实际执行。
  const fnMatch = patchedSrc.match(/function resolveDirectoryPickerBackend\(facts\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'resolveDirectoryPickerBackend 应可整段抽出');
  const present = (value) => value !== undefined && value !== '';
  // 0.2.1-rc.1 起 resolver 第一行多了 `!isLoopbackHost(facts.bindHost) → browse`，
  // 该谓词由上游从 dsh-host-webserver 导入。这里注入内核真身而不是另写一份近似实现
  // ——判据必须由真语义承担，否则用例是在替一条不存在的契约作证。
  const { isLoopbackHost } = require('@deepseek-ai/dsh-host-webserver');
  const resolve = new Function('present', 'isLoopbackHost', fnMatch[0] + '\nreturn resolveDirectoryPickerBackend;')(present, isLoopbackHost);
  // 0.1.5-rc.1 重锚：resolver 的 SSH 判定由 facts.env.SSH_CONNECTION/SSH_TTY 探测
  // 改为 boot 期实算的 facts.ssh 布尔（契约变更，fixture 须显式给 ssh）。
  const facts = (env, ssh = false, extra = {}) => ({
    bindHost: '127.0.0.1', platform: 'linux', env, linuxChooser: true, ssh,
    allowsRemoteAuthorities: false, ...extra,
  });
  // WSL（WSLg DISPLAY=:0 + Microsoft 注入标记）：强制 browse（修复目标）。
  assert.equal(resolve(facts({ DISPLAY: ':0', WSL_INTEROP: '/run/WSL_INTEROP' })), 'browse');
  assert.equal(resolve(facts({ DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', WSL_DISTRO_NAME: 'Ubuntu' })), 'browse');
  // Linux 裸机（无 WSL 标记）：DISPLAY 在场仍 native（原行为不变）。
  assert.equal(resolve(facts({ DISPLAY: ':0' })), 'native');
  // SSH 形态仍 browse（原行为不变；ssh 现由 facts.ssh 承载）。
  assert.equal(resolve(facts({ DISPLAY: ':0', SSH_CONNECTION: '10.0.0.1 50000 10.0.0.2 22' }, true)), 'browse');
  // 0.2.1 新增前置判据的两条边界：非回环绑定与远程授权都必须 browse。
  assert.equal(resolve(facts({ DISPLAY: ':0' }, false, { bindHost: '10.0.0.2' })), 'browse');
  assert.equal(resolve(facts({ DISPLAY: ':0' }, false, { allowsRemoteAuthorities: true })), 'browse');
});
