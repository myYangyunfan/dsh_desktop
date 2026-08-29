'use strict';

// patch-registry 单元测试（node --test）。
// 验证 PATCH_SPECS 清单完整、字段契约、分组与顺序、marker 与 transform 的
// 幂等判定同源。

const test = require('node:test');
const assert = require('node:assert/strict');

const { PATCH_SPECS, getSpecsByGroup, getSpecsByCli } = require('../lib/patch-registry');
const { SLOT_KEY_COMPAT_PKG_REL, SLOT_UNKEYED_COMPAT_PKG_REL } = require('../lib/patch-target-resolver');
const { SLOT_KEY_COMPAT_MARKER, SLOT_ERROR_ISOLATE_MARKER, SLOT_ERROR_ISOLATE_MARKER_V2 } = require('../lib/runtime-patches');

test('清单非空、id 唯一、order 升序', () => {
  assert.ok(PATCH_SPECS.length >= 19, '应覆盖全部运行时补丁');
  const ids = PATCH_SPECS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id 必须唯一');
  const ordered = getSpecsByGroup();
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(ordered[i - 1].order <= ordered[i].order, `order 应按升序（${ordered[i - 1].id} → ${ordered[i].id}）`);
  }
});

test('每个 file 补丁都声明 transform；每个 root 补丁都声明 apply', () => {
  for (const spec of PATCH_SPECS) {
    if (spec.kind === 'file') {
      assert.equal(typeof spec.transform, 'function', `${spec.id} 缺 transform`);
      assert.ok(spec.layout, `${spec.id} 缺 layout`);
      if (spec.layout !== 'profile-boot-dirs') {
        assert.ok(spec.pkgRel || (spec.pkgRels && spec.pkgRels.length > 0), `${spec.id} 缺 pkgRel/pkgRels`);
      }
    } else if (spec.kind === 'root') {
      assert.equal(typeof spec.apply, 'function', `${spec.id} 缺 apply`);
      assert.equal(typeof spec.successLog, 'function', `${spec.id} 缺 successLog`);
      assert.equal(typeof spec.failLog, 'function', `${spec.id} 缺 failLog`);
    }
  }
});

test('分组查询返回有序子集', () => {
  const groups = ['runtime', 'guard', 'package'];
  for (const g of groups) {
    const specs = getSpecsByGroup(g);
    assert.ok(specs.length > 0, `${g} 分组非空`);
    for (const s of specs) assert.equal(s.group, g);
    for (let i = 1; i < specs.length; i += 1) {
      assert.ok(specs[i - 1].order <= specs[i].order);
    }
  }
});

test('slot 三层共用 slot-compat 布局；pkgRels 各指向其锚点所在文件', () => {
  // 0.1.2-alpha.1：slot 注册代码在 ui-slots（rec.spec / keyed throw）与
  // cordis-client-runner（slots.spec）之间重新分派，三层补丁各自收窄到其锚点
  // 所在文件，避免跨文件误报 anchor-missing。
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  const slotIds = ['slot-legacy-key', 'slot-unkeyed-compat', 'slot-error-isolation'];
  for (const id of slotIds) {
    const spec = byId[id];
    assert.ok(spec, id);
    assert.equal(spec.layout, 'slot-compat');
    assert.equal(spec.wslLayout, 'slot-compat-wsl');
  }
  assert.deepEqual(byId['slot-legacy-key'].pkgRels, [SLOT_KEY_COMPAT_PKG_REL]);
  assert.deepEqual(byId['slot-unkeyed-compat'].pkgRels, [SLOT_UNKEYED_COMPAT_PKG_REL]);
  assert.deepEqual(byId['slot-error-isolation'].pkgRels, [SLOT_KEY_COMPAT_PKG_REL]);
});

test('ui-slots 预检 marker 与 transform 幂等判定同源（slot 三层）', () => {
  // slot 三层各自声明 marker（与 transform 的 already 判定同源）。
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['slot-legacy-key'].marker, SLOT_KEY_COMPAT_MARKER, 'legacy-key marker 同源');
  // slot-error-isolation 已修复为 v2（warn + 派生 key，不 throw），marker 须为 V2。
  assert.equal(byId['slot-error-isolation'].marker, SLOT_ERROR_ISOLATE_MARKER_V2, 'error-isolation marker 应为 V2');
  assert.notEqual(byId['slot-error-isolation'].marker, SLOT_ERROR_ISOLATE_MARKER, 'error-isolation 不得再用 v1 marker');
});

test('所有 spec 的 marker 均引用共享常量（单一数据源，无内联复制）', () => {
  const { markers } = require('../lib/patch-adapters');
  // 每个声明了 marker 的 spec，其 marker 值必须与 patch-adapters 的 markers 清单
  // 中的某个常量严格相等——杜绝「registry 内联字面量与 transform 常量复制漂移」。
  const known = new Set(Object.values(markers));
  for (const spec of PATCH_SPECS) {
    if (spec.marker === null || spec.marker === undefined) continue;
    assert.ok(known.has(spec.marker), `${spec.id} 的 marker 未引用共享常量，而是内联复制`);
  }
});

test('防护类补丁与包级补丁均已登记（无遗漏 apply*）', () => {
  const ids = new Set(PATCH_SPECS.map((s) => s.id));
  const expected = [
    'slot-legacy-key', 'slot-unkeyed-compat', 'slot-error-isolation',
    'runtime-flash-fix', 'shell-description-compat',
    'attachment-mime-trust',
    'persistent-shell-abort-race', 'terminal-interrupt-escalation',
    'profile-patch-guard', 'profile-bundle-guard-appboot', 'profile-bundle-guard-profileboot',
    'settings-section-guard', 'workspace-search-rail-fix', 'plugin-inventory-tab-merge',
    'web-search-baseurl', 'menu-viewport', 'open-project-dir',
    'session-persistence', 'tool-source-compat', 'pi-ai-opencode-go-models',
    'pi-ai-credits', 'pi-ai-reasoning-defaults', 'pi-ai-overflow-message',
    'token-meter-clamp',
    'atomic-write-orphan-lock', 'settings-models-resilience',
    'bundle-arrival-retry', 'agent-loop-scheduler-guard',
    'empty-tool-name-guidance',
  ];
  for (const id of expected) assert.ok(ids.has(id), `遗漏补丁 ${id}`);
});

test('getSpecsByCli：返回 24 个 cli:true 补丁（8 runtime + 4 数据完整性 + 2 设置写入韧性 + 3 内核韧性 + 1 pi-ai 超限文案 + 1 token-meter 夹取 + 2 本地二进制回落 + 1 skill 目录兼容 + 1 pi-ai 4xx 落盘）', () => {
  const specs = getSpecsByCli();
  assert.equal(specs.length, 24, 'cli 清单应恰为 22 项');
  const expected = new Set([
    'slot-legacy-key', 'slot-unkeyed-compat', 'slot-error-isolation',
    'runtime-flash-fix', 'shell-description-compat',
    'attachment-mime-trust', 'session-persistence',
    'tool-source-compat', 'pi-ai-opencode-go-models', 'pi-ai-credits',
    'pi-ai-reasoning-defaults', 'pi-ai-overflow-message', 'token-meter-clamp',
    'atomic-write-orphan-lock', 'settings-models-resilience',
    'bundle-arrival-retry', 'agent-loop-scheduler-guard',
    'empty-tool-name-guidance',
    'codex-local-bin-fallback', 'claude-local-bin-fallback',
    'skill-dirs-compat',
    'pi-ai-4xx-dump',
    'pi-ai-tool-schema-sanitize',
    'ds-tool-schema-sanitize',
  ]);
  assert.deepEqual(new Set(specs.map((s) => s.id)), expected, 'cli 清单 id 集合不符');
  for (const s of specs) assert.equal(s.cli, true, `${s.id} 应标记 cli:true`);
  for (let i = 1; i < specs.length; i += 1) {
    assert.ok(specs[i - 1].order <= specs[i].order, 'cli 清单应按 order 升序');
  }
});

test('failPolicy：slot-error-isolation=degrade，其余=warn', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['slot-error-isolation'].failPolicy, 'degrade', 'slot-error-isolation 应为 degrade');
  for (const spec of PATCH_SPECS) {
    if (spec.id === 'slot-error-isolation') continue;
    assert.equal(spec.failPolicy, 'warn', `${spec.id} 的 failPolicy 应为 warn`);
  }
});

test('getSpecsByCli：每个 spec 的 transform/apply 与 patch-adapters 导出同源（无漂移）', () => {
  const adapters = require('../lib/patch-adapters');
  // CLI 同步期的 8 个 file 补丁 transform + 1 个 root 补丁 apply，逐一与唯一
  // 装配层（patch-adapters）导出严格同源，杜绝 registry 复制一份实现导致漂移。
  const transformMap = {
    'slot-legacy-key': adapters.transformLegacySlotKey,
    'slot-unkeyed-compat': adapters.transformSlotUnkeyedCompat,
    'slot-error-isolation': adapters.transformSlotErrorIsolation,
    'runtime-flash-fix': adapters.transformFlashFix,
    'shell-description-compat': adapters.transformShellDescriptionOptional,
    'attachment-mime-trust': adapters.transformAttachmentMimeTrust,
    'codex-local-bin-fallback': adapters.transformCodexLocalBinFallback,
    'claude-local-bin-fallback': adapters.transformClaudeLocalBinFallback,
    'skill-dirs-compat': adapters.transformSkillDirsCompat,
    'pi-ai-4xx-dump': adapters.transformPiAi4xxDump,
    'pi-ai-tool-schema-sanitize': adapters.transformPiAiToolSchemaSanitize,
    'ds-tool-schema-sanitize': adapters.transformDsToolSchemaSanitize,
  };
  const rootApplyMap = {
    'session-persistence': adapters.rootAppliers.patchSessionPersistence,
    'tool-source-compat': adapters.rootAppliers.patchToolSourceCompat,
    'pi-ai-opencode-go-models': adapters.rootAppliers.patchPiAiOpencodeGoModels,
    'pi-ai-credits': adapters.rootAppliers.patchPiAiCredits,
    'pi-ai-reasoning-defaults': adapters.rootAppliers.patchPiAiReasoningDefaults,
    'pi-ai-overflow-message': adapters.rootAppliers.patchPiAiOverflowMessage,
    'token-meter-clamp': adapters.rootAppliers.patchTokenMeterClamp,
    'atomic-write-orphan-lock': adapters.rootAppliers.patchAtomicWriteOrphanLock,
    'settings-models-resilience': adapters.rootAppliers.patchSettingsModelsResilience,
    'bundle-arrival-retry': adapters.rootAppliers.patchBundleArrivalRetry,
    'agent-loop-scheduler-guard': adapters.rootAppliers.patchSchedulerGuard,
    'empty-tool-name-guidance': adapters.rootAppliers.patchEmptyToolName,
  };
  for (const spec of getSpecsByCli()) {
    if (spec.kind === 'root') {
      assert.equal(spec.apply, rootApplyMap[spec.id], `${spec.id} 的 apply 应与 rootAppliers 同源`);
    } else {
      assert.equal(spec.transform, transformMap[spec.id], `${spec.id} 的 transform 应与 patch-adapters 导出同源`);
    }
  }
});
