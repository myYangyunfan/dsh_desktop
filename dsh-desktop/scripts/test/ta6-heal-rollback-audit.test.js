'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 5：heal / 回滚面审计（静态分类，报告清单，不实现反向变换）。
//
// 对 34 个 file transform 逐个回答「如何撤销」：
//   - npm-ci 可恢复：目标都在 node_modules/@deepseek-ai 包内，重装即回
//     pristine（全部 file 补丁皆然——这也是 rc.2→rc.8 升级后补丁自然退役
//     的机制）；
//   - 机械可逆（inverse-replace）：实现源码中同时存在 OLD/FROM 与 NEW/TO
//     常量对，反向 replace 即可精确回滚（无需重装）；
//   - marker 定位回滚（marker-excise）：无 FROM/TO 对，但注入体以 marker
//     注释开头 / 含 marker，可按 marker 定位挖除注入块；
//   - 多点注入：一次 transform 改多处（回滚需逐点处理）。
//
// 审计约束（守卫价值）：
//   1. 分类必须覆盖全部 34 个 file transform（无「无法回滚」盲区）；
//   2. 每个带 marker 的 transform，marker 必须能定位回滚点（marker 出现在
//      其 changed 产物中——用 pristine 实跑验证）；
//   3. root 应用器（14 个）只碰 node_modules 内文件 → npm ci 可整体恢复。
//      （v0.5.4：+pi-ai-credits / pi-ai-reasoning-defaults / bundle-arrival-retry×2
//       / agent-loop-scheduler-guard×2 共 4 枚 root 应用器。）
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PATCH_SPECS } = require('../lib/patch-registry');
const { transformVisionToggleGate } = require('../lib/patch-adapters');

const LIB_DIR = path.join(__dirname, '..', 'lib');
const IMPL_SOURCES = [
  path.join(LIB_DIR, 'runtime-patches.js'),
  path.join(LIB_DIR, 'patch-adapters.js'),
  path.join(LIB_DIR, 'loader-isolation.js'),
  path.join(__dirname, '..', 'patch-session-orphans.js'),
  path.join(__dirname, '..', 'patch-session-manage.js'),
  path.join(__dirname, '..', '..', 'profile-bundle-heal.js'),
].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } });

const PRISTINE_RC2 = path.join(__dirname, '..', '..', '..', '.tmp-rc2-stage', 'node_modules');

function firstTargetFile(spec) {
  if (spec.layout === 'profile-boot-dirs') {
    const lib = path.join(PRISTINE_RC2, '@deepseek-ai', 'dsh', 'lib');
    const files = fs.readdirSync(lib).filter((f) => /^profile-boot-.*\.js$/.test(f));
    return files.length ? path.join(lib, files[0]) : null;
  }
  const rels = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
  for (const rel of rels) {
    const p = path.join(PRISTINE_RC2, '@deepseek-ai', rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 分类：实现源码是否为该 spec 提供了 FROM/OLD → NEW/TO 常量对（按 marker
 * 关联的注释常量名启发式识别）。 */
const INVERSE_PAIR_HINTS = {
  // id: [OLD/FROM 常量片段, NEW/TO 常量片段]（在实现源码文本中出现即可判
  // 机械可逆——常量对本身就是反向 replace 的全部输入）。
  'runtime-flash-fix': ['FLASH_OLD', 'FLASH_NEW'],
  'vision-key-fix': ['VISION_KEY_FROM', 'VISION_KEY_TO'],
  'profile-patch-guard': ['PROFILE_PATCH_GUARD_CALL_SITE', 'PROFILE_PATCH_GUARD_CALL_REPLACEMENT'],
  'settings-section-guard': ['SETTINGS_SECTION_FROM', 'SETTINGS_SECTION_GUARDED'],
  'workspace-search-rail-fix': ['WORKSPACE_SEARCH_RAIL_OLD_GUARD', 'WORKSPACE_SEARCH_RAIL_NEW_GUARD'],
  'plugin-inventory-tab-merge': ['PLUGIN_INVENTORY_TAB_OLD', 'PLUGIN_INVENTORY_TAB_NEW'],
  'persistent-shell-abort-race': ['PERSISTENT_ABORT_RACE_ANCHOR', 'persistentAbortRaceInjection'],
  'terminal-interrupt-escalation': ['INTERRUPT_ESCALATION_ANCHOR', 'INTERRUPT_ESCALATION_INJECTION'],
  'agent-preset-fallback': ['AGENT_PRESET_FALLBACK_ANCHOR', 'AGENT_PRESET_FALLBACK_INJECTION'],
  'prompt-context-literal': ['PROMPT_CONTEXT_LITERAL_ANCHOR', 'PROMPT_CONTEXT_LITERAL_INJECTION'],
  'fallback-heal-isolation': ['FALLBACK_HEAL_LOOP_OLD', 'FALLBACK_HEAL_LOOP_NEW'],
  'credentials-initial-retry': ['CREDENTIALS_LOAD_INITIAL_OLD', 'CREDENTIALS_LOAD_INITIAL_NEW'],
  'credentials-absent-guidance': ['CREDENTIALS_ABSENT_OLD', 'CREDENTIALS_ABSENT_NEW'],
  'device-auth-guidance': ['DEVICE_AUTH_THROW_ANCHOR_V2', 'deviceAuthGuidanceBlock'],
  // 无 marker 补丁的回滚定位常量（撤销 = 从数组剥除 SETTINGS_NAMESPACES 追加项）。
  'prompt-expose-fix': ['WEB_SETTINGS_NAMESPACES', 'SETTINGS_NAMESPACES'],
  'slot-legacy-key': ['SLOT_KEY_COMPAT_OLD', 'SLOT_KEY_COMPAT_NEW'],
  'slot-unkeyed-compat': ['SLOT_UNKEYED_COMPAT_OLD', 'SLOT_UNKEYED_COMPAT_NEW'],
  'shell-description-compat': ['SHELL_DESC_VALIDATE_OLD', 'SHELL_DESC_VALIDATE_NEW'],
  'code-mode-compat': ['CODE_MODE_OLD', 'CODE_MODE_NEW'],
  'attachment-mime-trust': ['ATTACH_MIME_OLD', 'ATTACH_MIME_NEW'],
  'session-orphans': ['SESSION_ORPHANS_ANCHOR', 'SESSION_ORPHANS_INJECTION'],
  'session-load-graceful': ['SESSION_LOAD_GRACEFUL_DECODER_OLD', 'SESSION_LOAD_GRACEFUL_DECODER_NEW'],
};

const MULTI_SITE = new Set([
  'credentials-initial-retry', // 3 处替换（首读/stat/helpers 追加）
  'prompt-expose-fix',         // 数组追加（幂等条件 = 命名空间已列）
  'slot-error-isolation',      // 三分支（原始 throw / v1 修复×2）
  'adapter-prepare-call-guard', // 双调用点替换 + 方法注入（prepareCall/adapterStream）
  'session-header-scan-guard', // 四点注入（模块级缓存 / helper 方法 / 读行 / 读上限）
  'session-load-graceful',     // 四点注入（hoist / scanner 赋值 / 计数 / catch 降级）
]);

const fileSpecs = PATCH_SPECS.filter((s) => s.kind === 'file');
const rootSpecs = PATCH_SPECS.filter((s) => s.kind === 'root');

test('审计 1：分类覆盖全部 39 个 file transform（无回滚盲区）', () => {
  assert.equal(fileSpecs.length, 39);
  const report = [];
  for (const spec of fileSpecs) {
    const pair = INVERSE_PAIR_HINTS[spec.id];
    const inverse = pair && pair.every((name) => IMPL_SOURCES.some((t) => t.includes(name)));
    const strategy = inverse ? 'inverse-replace'
      : spec.marker ? 'marker-excise' : 'manual';
    report.push(`${spec.id}: ${strategy}${MULTI_SITE.has(spec.id) ? ' (multi-site)' : ''}`);
  }
  // 全部为 npm-ci 可恢复（node_modules 内）+ 三档回滚策略之一。
  for (const spec of fileSpecs) {
    assert.ok(
      INVERSE_PAIR_HINTS[spec.id] || spec.marker,
      `${spec.id} 既无 FROM/TO 常量对也无 marker：无法定位回滚点（盲区）`,
    );
  }
  console.log('[TA6 回滚审计清单]');
  for (const line of report) console.log('  ' + line);
});

test('审计 2：带 marker 的 transform，其 changed 产物含 marker（回滚定位点）', () => {
  for (const spec of fileSpecs) {
    if (!spec.marker) continue;
    const file = firstTargetFile(spec);
    assert.ok(file, `${spec.id} 缺 pristine 目标`);
    let src = fs.readFileSync(file, 'utf8');
    // 依赖链先行（vision 系）。
    if (spec.id === 'vision-toggle-gate' || spec.id === 'vision-key-fix') {
      void transformVisionToggleGate;
    }
    const r = spec.transform(src, file);
    if (r.status === 'changed') {
      assert.ok(
        r.src.includes(spec.marker),
        `${spec.id} changed 产物必须含 marker（回滚定位点缺失）`,
      );
    }
    // already / anchor-missing（退役态）无产物，无回滚需求。
  }
});

test('审计 3：root 应用器只碰 node_modules（npm ci 整体可恢复）', () => {
  assert.equal(rootSpecs.length, 17);
  for (const spec of rootSpecs) {
    assert.equal(spec.layout, 'nm-roots', `${spec.id} 应为 nm-roots 布局`);
    assert.equal(spec.wslLayout, 'nm-roots', `${spec.id} WSL 布局也应为 nm-roots`);
  }
});

test('审计 4（发现记录）：无 marker 的 file transform 依赖产物形态做幂等判定', () => {
  // 无 marker 的补丁（marker: null）幂等判定靠「产物特征文本」而非 marker，
  // 回滚时无法用 marker 扫描定位——须依赖 FROM/TO 反向替换或重装。
  const noMarker = fileSpecs.filter((s) => !s.marker).map((s) => s.id);
  const expectedNoMarker = [
    'runtime-flash-fix', 'prompt-expose-fix', 'shell-description-compat',
    'code-mode-compat', 'attachment-mime-trust',
  ];
  assert.deepEqual(noMarker, expectedNoMarker, '无 marker 补丁清单漂移（新无 marker 补丁需补审计）');
});
