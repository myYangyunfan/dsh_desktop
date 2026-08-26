'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 1：registry ↔ adapters 双向完整性自描述不变量。
//
// 守卫目标（防未来加补丁漏配 / 漂移）：
//   A. 每个 file spec 的 transform 是函数且来自 patch-adapters / loader-isolation
//      导出清单（防止内联孤儿 transform）；
//   B. 每个 root spec 的 apply ∈ rootAppliers 值集（防止绕过收口）；
//   C. 每个非空 marker 既在 patch-adapters.markers 值集中（单一数据源），
//      又出现在某个 transform 实现源码文本中（marker ↔ 实现不漂移）；
//   D. 每个 file spec 的 pkgRel/pkgRels 被 patch-target-resolver 导出的
//      某个路径常量覆盖（白名单化记录既有内联漂移，新漂移即红）；
//   E. order 全局唯一、组内升序、组间依赖序（requires / 已知补丁间依赖的
//      目标 order 更小）；
//   F. cli:true 数量与既有断言一致（11）；failPolicy ∈ {warn,degrade}
//      （注意：治理任务书写的是 {warn,error}，registry 实际词表是
//      {warn,degrade,fatal(仅注释)}，此处按实际词表断言并作为缺陷记录）；
//   G. group 一致性：group ∈ {runtime,guard,package}，guard 组内
//      failPolicy 全为 warn、cli 全为 false。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = require('../lib/patch-registry');
const adapters = require('../lib/patch-adapters');
const loaderIsolation = require('../lib/loader-isolation');
const resolver = require('../lib/patch-target-resolver');

const { PATCH_SPECS } = registry;

const LIB_DIR = path.join(__dirname, '..', 'lib');
// transform 实现源码文本（marker 字面量必须出现在其中之一）。
const IMPL_SOURCES = [
  path.join(LIB_DIR, 'runtime-patches.js'),
  path.join(LIB_DIR, 'patch-adapters.js'),
  path.join(LIB_DIR, 'loader-isolation.js'),
  path.join(__dirname, '..', '..', 'profile-bundle-heal.js'),
].map((f) => fs.readFileSync(f, 'utf8'));

/** 既有「内联 pkgRel」白名单：registry 里未走 patch-target-resolver 常量的
 * 历史漂移（缺陷记录：路径常量未收口，加新条目到此白名单 = 掩盖漂移）。 */
const INLINE_PKG_REL_SPEC_IDS = new Set([
  'settings-section-guard',
  // workspace-search-rail-fix 已收口到 WORKSPACE_PKG_REL（K25），移出白名单。
  'credentials-initial-retry',
  // credentials-absent-guidance 的内联 pkgRel 与 EXPOSE_PKG_REL 同值，视为已覆盖。
  'device-auth-guidance',
  'plugin-inventory-tab-merge',
]);

/** 已知补丁间依赖（目标 order 必须更小）。 */
const PATCH_DEPENDS = {
  'session-orphans': ['session-manage'],   // 195 > 190（锚点即 session-manage 注入体）
  'vision-toggle-gate': ['image-send-fix'], // 95 > 80（依赖其注入的 helper/gate 形态）
  'vision-key-fix': ['image-send-fix'],     // 100 > 80（锚点即 image-send 注入的 helper 文本）
};

const norm = (p) => String(p).split(path.sep).join('/');

function resolverRelConstants() {
  const out = new Set();
  for (const [key, value] of Object.entries(resolver)) {
    if (!/(_PKG_REL|_RELS|_REL)$/.test(key)) continue;
    if (typeof value === 'string') out.add(norm(value));
    else if (Array.isArray(value)) for (const v of value) out.add(norm(v));
  }
  // 布局目录（profile-boot-dirs）不属于包相对路径常量，单独处理。
  return out;
}

test('A. file spec transform 均为函数且来自收口导出（无内联孤儿）', () => {
  const adapterExports = new Set(Object.values(adapters).filter((v) => typeof v === 'function'));
  const loaderExports = new Set(Object.values(loaderIsolation).filter((v) => typeof v === 'function'));
  const fileSpecs = PATCH_SPECS.filter((s) => s.kind === 'file');
  assert.ok(fileSpecs.length >= 28, `file spec 应有 28 个，得 ${fileSpecs.length}`);
  for (const spec of fileSpecs) {
    assert.equal(typeof spec.transform, 'function', `${spec.id} 缺 transform`);
    assert.ok(
      adapterExports.has(spec.transform) || loaderExports.has(spec.transform),
      `${spec.id} 的 transform 不在 patch-adapters / loader-isolation 导出清单中（内联孤儿）`,
    );
  }
});

test('B. root spec apply ∈ rootAppliers 值集（绕过收口即红）', () => {
  const appliers = new Set(Object.values(adapters.rootAppliers));
  const rootSpecs = PATCH_SPECS.filter((s) => s.kind === 'root');
  assert.ok(rootSpecs.length >= 8);
  for (const spec of rootSpecs) {
    assert.equal(typeof spec.apply, 'function', `${spec.id} 缺 apply`);
    assert.ok(appliers.has(spec.apply), `${spec.id} 的 apply 不是 rootAppliers 成员`);
  }
  // 双向：rootAppliers 里每个应用器都被某条 spec 引用（无死代码应用器）。
  for (const [name, fn] of Object.entries(adapters.rootAppliers)) {
    assert.ok(
      rootSpecs.some((s) => s.apply === fn),
      `rootAppliers.${name} 未被任何 spec 引用（死代码或漏登记）`,
    );
  }
});

test('C. marker 单一数据源 + marker 出现在 transform 实现源码文本中', () => {
  const knownMarkers = new Set(Object.values(adapters.markers).filter((v) => typeof v === 'string'));
  for (const spec of PATCH_SPECS) {
    if (spec.marker === null || spec.marker === undefined) continue;
    assert.ok(knownMarkers.has(spec.marker), `${spec.id} marker 未引用 patch-adapters.markers 共享常量`);
    // 允许「派生 marker」（如 V2 = 基础 marker + ' (v2)' 拼接）：字面量或其
    // 去掉尾部派生后缀的基础形态出现在实现源码中即可。
    const base = spec.marker.replace(/ \([^()]*\)$/, '');
    assert.ok(
      IMPL_SOURCES.some((text) => text.includes(spec.marker) || text.includes(base)),
      `${spec.id} marker 未出现在任何 transform 实现源码中（marker 与实现漂移）`,
    );
  }
  // 双向：每个 marker 常量至少被一条 spec 引用（或属于已知多形态常量）。
  for (const [name, value] of Object.entries(adapters.markers)) {
    if (typeof value !== 'string') continue;
    const used = PATCH_SPECS.some((s) => s.marker === value);
    const knownUnused = new Set(['SLOT_ERROR_ISOLATE_MARKER']); // v1 marker，仅 v2 修复路径识别用
    if (!used) assert.ok(knownUnused.has(name), `marker ${name} 无任何 spec 引用`);
  }
});

test('D. pkgRel/pkgRels 被 patch-target-resolver 常量覆盖（白名单外新漂移即红）', () => {
  const rels = resolverRelConstants();
  assert.ok(rels.size >= 10, `resolver 路径常量应有 10+，得 ${rels.size}`);
  const uncovered = [];
  for (const spec of PATCH_SPECS) {
    if (spec.kind !== 'file' || spec.layout === 'profile-boot-dirs') continue;
    const list = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
    for (const rel of list) {
      if (!rels.has(norm(rel))) uncovered.push(`${spec.id}:${norm(rel)}`);
    }
  }
  // 未覆盖的必须恰为白名单（历史内联漂移，逐条登记），出现新条目即失败。
  const bySpec = {};
  for (const entry of uncovered) bySpec[entry.split(':')[0]] = true;
  const extra = Object.keys(bySpec).filter((id) => !INLINE_PKG_REL_SPEC_IDS.has(id));
  assert.deepEqual(extra, [], '发现新的未收口 pkgRel（应加入 patch-target-resolver 常量）');
  const stale = [...INLINE_PKG_REL_SPEC_IDS].filter((id) => !bySpec[id]);
  assert.deepEqual(stale, [], '白名单中的内联 pkgRel 已收口，应从白名单移除（防漂移被掩盖）');
});

test('E. order 全局唯一、组内升序、补丁间依赖序成立', () => {
  // 56 = 55（上一基线）+ token-meter-clamp（messageTokens 下限夹取，order 233）。
  assert.equal(PATCH_SPECS.length, 56, 'spec 总数应为 56');
  const orders = PATCH_SPECS.map((s) => s.order);
  assert.equal(new Set(orders).size, orders.length, 'order 必须全局唯一');
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const [id, deps] of Object.entries(PATCH_DEPENDS)) {
    for (const dep of deps) {
      assert.ok(byId[id], `${id} 必须登记`);
      assert.ok(byId[dep], `${id} 的依赖 ${dep} 必须登记`);
      assert.ok(
        byId[dep].order < byId[id].order,
        `${id}(${byId[id].order}) 依赖 ${dep}(${byId[dep].order})，目标 order 必须更小`,
      );
    }
  }
  // 任务书点名的序关系：session-manage 190 < session-orphans 195。
  assert.equal(byId['session-manage'].order, 190);
  assert.equal(byId['session-orphans'].order, 195);
  assert.ok(byId['session-orphans'].order > byId['session-manage'].order);
  // 依赖组同组（package）同布局，requires 同源。
  assert.equal(byId['session-orphans'].group, byId['session-manage'].group);
  assert.deepEqual(byId['session-orphans'].requires, byId['session-manage'].requires);
  // vision 系：image-send 80 < vision-toggle 95 < vision-key 100。
  assert.ok(byId['image-send-fix'].order < byId['vision-toggle-gate'].order);
  assert.ok(byId['vision-toggle-gate'].order < byId['vision-key-fix'].order);
});

test('E2. K1 三层相互独立（无补丁间依赖、目标文件互不重叠）', () => {
  const k1 = ['fallback-heal-isolation', 'credentials-initial-retry', 'credentials-absent-guidance'];
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const id of k1) {
    assert.ok(byId[id], `${id} 必须登记`);
    for (const dep of (PATCH_DEPENDS[id] || [])) {
      assert.ok(!k1.includes(dep), `K1 补丁不应互相依赖（${id} → ${dep}）`);
    }
  }
  // 三层目标文件两两不重叠。
  const targets = k1.map((id) => norm(byId[id].pkgRel || (byId[id].pkgRels || []).join('|')));
  assert.equal(new Set(targets).size, 3, 'K1 三层目标文件必须互不相同');
  // K1 order 恰为 151/152/153（连续三层，不夹其他补丁）。
  assert.deepEqual(
    k1.map((id) => byId[id].order).sort((a, b) => a - b),
    [151, 152, 153],
    'K1 三层 order 应恰为 151/152/153',
  );
});

test('E3. device-auth 154 与 credentials-absent 153 相邻无干扰', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['credentials-absent-guidance'].order, 153);
  assert.equal(byId['device-auth-guidance'].order, 154);
  assert.notEqual(
    norm(byId['credentials-absent-guidance'].pkgRel),
    norm(byId['device-auth-guidance'].pkgRel),
    '相邻 order 的两个补丁不得共享目标文件',
  );
});

test('F. cli:true 恰为 21 项；failPolicy ∈ {warn,degrade}', () => {
  const cliSpecs = registry.getSpecsByCli();
  assert.equal(cliSpecs.length, 21, 'cli:true 数量应与既有断言一致（21，含 token-meter-clamp）');
  for (const s of cliSpecs) assert.equal(s.cli, true);
  for (const spec of PATCH_SPECS) {
    assert.ok(
      spec.failPolicy === 'warn' || spec.failPolicy === 'degrade',
      `${spec.id} failPolicy 越界（实际词表 {warn,degrade}；治理任务书的 {warn,error} 是笔误）`,
    );
  }
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['slot-error-isolation'].failPolicy, 'degrade', '唯一 degrade 档应仍是 slot-error-isolation');
});

test('F2. E2 两个内核韧性补丁字段契约（root + nm-roots + cli + warn）', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const id of ['bundle-arrival-retry', 'agent-loop-scheduler-guard']) {
    assert.ok(byId[id], `${id} 必须登记`);
    assert.equal(byId[id].kind, 'root', `${id} 应为 root 应用器形态`);
    assert.equal(byId[id].layout, 'nm-roots');
    assert.equal(byId[id].wslLayout, 'nm-roots');
    assert.equal(byId[id].cli, true, `${id} 应 cli:true（内核包目标，CLI 同步同样需要）`);
    assert.equal(byId[id].failPolicy, 'warn');
    assert.equal(byId[id].marker, null, `${id} 无幂等 marker（root 应用器内嵌 marker 判定）`);
  }
  // order 唯一性已由 E 守卫；此处锚定 245/246（pi-ai-reasoning-defaults 244 之后）。
  assert.equal(byId['bundle-arrival-retry'].order, 245);
  assert.equal(byId['agent-loop-scheduler-guard'].order, 246);
});


test('G. group 一致性：词表 + guard 组约束', () => {
  const groups = new Set(PATCH_SPECS.map((s) => s.group));
  assert.deepEqual([...groups].sort(), ['guard', 'package', 'runtime'], 'group 词表漂移');
  for (const spec of PATCH_SPECS.filter((s) => s.group === 'guard')) {
    assert.equal(spec.failPolicy, 'warn', `guard 组 ${spec.id} failPolicy 应为 warn`);
    assert.equal(spec.cli, false, `guard 组 ${spec.id} cli 应为 false`);
  }
  // runtime-local 布局的 wslLayout 应为 wsl（或 slot-compat 系例外）。
  for (const spec of PATCH_SPECS.filter((s) => s.layout === 'runtime-local')) {
    assert.equal(spec.wslLayout, 'wsl', `${spec.id} runtime-local 的 wslLayout 应为 wsl`);
  }
});
