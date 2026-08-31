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
  transformSettingsSectionGuard,
  transformPluginInventoryTabMergeFix,
  transformFlashFix,
} = require('../lib/patch-adapters');

const PATCH_GUARD_CALL = '\t\tpatches: options.userLayer !== false && existsSync(patchPath) ? loadOverlayPatches(binName, patchPath) : []';
const PATCH_GUARD_AFTER = '\treturn parsePatchList(binName, file, content, "overlay");\n}';

test('transformProfilePatchGuard：匹配 / 已应用 / 失配三态', () => {
  const src = PATCH_GUARD_CALL + '\n' + PATCH_GUARD_AFTER;
  const changed = transformProfilePatchGuard(src, 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes('function loadUserPatchLayer'));
  assert.ok(changed.src.includes('patches: loadUserPatchLayer(binName, patchPath, options)'));
  // 已应用：marker（function loadUserPatchLayer）存在 → already
  assert.equal(transformProfilePatchGuard('function loadUserPatchLayer', 't.js').status, 'already');
  // 失配：缺少 callSite/insertAfter
  const miss = transformProfilePatchGuard('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
});

const SETTINGS_MARKER = 'dsh-desktop guard: an invalid stored section must not brick';
// 0.1.2-alpha.2：register 调用点在 provider 类方法 installSection 内（this.register），
// 与 patch-adapters 重靶后锚点同源（sctx.settings.register 老形态已随内核换代失效）。
const SETTINGS_ANCHOR = '\t\tconst scope = this.register(ns, schema, {';

test('transformSettingsSectionGuard：匹配 / 已应用 / 失配三态', () => {
  const src = '\t\tconst scope = this.register(ns, schema, {\n\t\t\tbase: entry,\n\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }\n\t\t});\n\t\thooks.setSource(() => scope.get());';
  const changed = transformSettingsSectionGuard(src, 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes(SETTINGS_MARKER));
  assert.ok(changed.src.includes('let scope;'));
  assert.equal(transformSettingsSectionGuard('// ' + SETTINGS_MARKER, 't.js').status, 'already');
  const miss = transformSettingsSectionGuard('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
});

const TAB_MARKER = 'dsh-desktop fix: hide inventory tab';
const TAB_OLD = 'tabs = ctx.slots.entries("settings.plugins.tab").map((entry) => ({';

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
  const src = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';
  assert.equal(transformFlashFix(src, 't.js').status, 'already');
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
  const resolve = new Function('present', fnMatch[0] + '\nreturn resolveDirectoryPickerBackend;')(present);
  const facts = (env) => ({ bindHost: '127.0.0.1', platform: 'linux', env, linuxChooser: true });
  // WSL（WSLg DISPLAY=:0 + Microsoft 注入标记）：强制 browse（修复目标）。
  assert.equal(resolve(facts({ DISPLAY: ':0', WSL_INTEROP: '/run/WSL_INTEROP' })), 'browse');
  assert.equal(resolve(facts({ DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', WSL_DISTRO_NAME: 'Ubuntu' })), 'browse');
  // Linux 裸机（无 WSL 标记）：DISPLAY 在场仍 native（原行为不变）。
  assert.equal(resolve(facts({ DISPLAY: ':0' })), 'native');
  // SSH 形态仍 browse（原行为不变）。
  assert.equal(resolve(facts({ DISPLAY: ':0', SSH_CONNECTION: '10.0.0.1 50000 10.0.0.2 22' })), 'browse');
});
