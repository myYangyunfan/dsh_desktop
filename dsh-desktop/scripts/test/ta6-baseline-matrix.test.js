'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 6：58 补丁 × pristine 内核形态判定矩阵（基线快照，长期价值最高）。
//
// 对 pristine 内核闭包按 registry order 编排序跑一遍全部 file transform——同文件
// 多补丁时，后一条的输入就是前一条的产物，判定与引擎真实顺序一致；root 规格记
// 'root'（root 应用器不在本判定面，由 unit-patch-deps-coverage /
// ta6-heal-rollback-audit 覆盖）；靶不在离线闭包内的记 'target-absent'。
//
// 形态源（0.2.0-rc.2 随迁收口）：以前挂两株手工搭的 stage 树（.tmp-rc2-stage /
// .tmp-rc1-stage/rc1），换代会双双失联、矩阵整片 skip —— 那就是假绿位点。现在
// 只有一株：scripts/lib/pristine-kernel-roots.js 解析出的
// .tmp-kernel/.consumer-<pin>/node_modules（由 scripts/install-pristine-kernel.mjs
// 从 vendor/dsh-kernel 的离线 tarball 装出，与 kernel-pin 同版才有意义）。树不在
// 场时本测试**直接失败并给出安装命令**，绝不 skip：漂移哨兵静默挂起等于没有。
//
// 靶解析口径：一律拼到 <root>/@deepseek-ai/<pkgRel>（pkgRel 自带 @deepseek-ai/
// 前缀时先剥掉，避免历史上「双前缀 0 命中」把已命中伪装成 target-absent）。
// **绝不允许回退到 dsh-desktop/node_modules**——那是 postinstall 已打补丁树，
// 回退会把 target-absent 洗成 already，正是旧注释点名的假绿来源。非 @deepseek-ai
// scope 的靶（@openai/codex、@earendil-works/pi-ai）本就不在离线闭包内 → 恒
// target-absent，其真实字节判定各归自己的单测（见 BASELINE 行内注释）。
//
// 内核升级后 diff 此矩阵即知漂移面：changed → anchor-missing = 锚点漂移（重锚或
// 退役）；changed/anchor-missing → already = 上游原生内置，补丁自然退役。修改
// BASELINE = 显式接受新基线；BASELINE 的版本键必须等于 kernel-pin，否则本测试拒绝
// 通过——不许静默沿用旧代数值。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PATCH_SPECS } = require('../lib/patch-registry');
const { pristineRoots } = require('../lib/pristine-kernel-roots');
const { kernel } = require('../compat/kernel-pin.json');

const FORM = kernel.packageVersion;
// 规格总数计数锁。沿革：64（0.1.x 线）→ 59 = 64 − 0.2.0-rc.2 重靶期退役 6 项
// （loader-tree-isolation / fallback-heal-isolation / settings-section-guard /
// atomic-write-orphan-lock / model-image-input / profile-bundle-guard-profileboot）
// + 1 项取代新增（profile-patch-layer-guard，order 130，readProfilePatches 层）
// → 58 = 59 − image-send-fix（2026-10 内置伴随插件批量拆除：注入体只读 dsh-vision
// 的设置命名空间，识图插件退役后无可达路径；同批删除 patch-adapters 的
// IMAGE_SEND_* / VISION_KEY_* / VISION_TOGGLE_* 常量，靶常量本身仍在册）。
// 逐项理由见 ta6-registry-invariants.test.js 的 E。
const SPEC_COUNT = 58;

/** 与 kernel-pin 同版的 pristine 闭包根；不在场返回 null（调用侧响亮失败）。 */
function formRoot() {
  return pristineRoots().find((r) => r.includes(FORM)) || null;
}

/** 靶解析：root/@deepseek-ai/<pkgRel>；多 pkgRels 取第一个在场者。 */
function targetFile(root, spec) {
  if (spec.kind !== 'file') return null;
  const rels = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
  for (const rel of rels) {
    if (!rel) continue;
    const norm = String(rel).replace(/^@deepseek-ai[\\/]/, '');
    const p = path.join(root, '@deepseek-ai', norm);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 计算当前形态矩阵（按 order 编排序，先应用者产物即后续补丁的输入）。 */
function computeMatrix(root) {
  const ordered = PATCH_SPECS.slice().sort((a, b) => a.order - b.order);
  const row = {};
  const fileState = new Map();
  for (const spec of ordered) {
    if (spec.kind === 'root') { row[spec.id] = 'root'; continue; }
    const file = targetFile(root, spec);
    if (!file) { row[spec.id] = 'target-absent'; continue; }
    const src = fileState.has(file) ? fileState.get(file) : fs.readFileSync(file, 'utf8');
    try {
      const r = spec.transform(src, file);
      row[spec.id] = r.status;
      if (r.status === 'changed') fileState.set(file, r.src);
    } catch (err) {
      row[spec.id] = 'THROW:' + err.message;
    }
  }
  return row;
}

/** 快照 vs 现算的逐项差（供漂移断言与反证共用）。 */
function driftOf(baselineRow, matrixRow) {
  const drift = [];
  for (const id of new Set([...Object.keys(baselineRow), ...Object.keys(matrixRow)])) {
    const want = baselineRow[id];
    const got = matrixRow[id];
    if (want !== got) drift.push(`${FORM}/${id}: 基线=${want} → 现在=${got}`);
  }
  return drift;
}

/** 快照自洽性检查（供完整性断言与反证共用）：版本键、计数、未知 id、漏项。 */
function integrityProblems(ids, baseline) {
  const problems = [];
  for (const form of Object.keys(baseline)) {
    if (form !== FORM) problems.push(`快照版本键 ${form} ≠ kernel-pin ${FORM}`);
    const row = baseline[form] || {};
    if (Object.keys(row).length !== SPEC_COUNT) {
      problems.push(`${form} 基线应覆盖 ${SPEC_COUNT} 项，实际 ${Object.keys(row).length}`);
    }
    for (const id of Object.keys(row)) if (!ids.has(id)) problems.push(`${form} 基线含未知 id ${id}`);
    for (const id of ids) if (!(id in row)) problems.push(`${form} 基线缺 id ${id}`);
  }
  return problems;
}

// ===========================================================================
// 基线快照（2026-10-05 重录：0.2.0-rc.2 形态 = .tmp-kernel/.consumer-0.2.0-rc.2
// 的 npm 闭包解包树，43 file + 15 root = 58 项（image-send-fix 已于 2026-10 随
// 识图插件退役，其 'changed' 行同批摘除），逐项由本文件 computeMatrix 真跑
// 录入，不是手工填值。判定构成：38 changed / 15 root / 5 target-absent，
// 零 anchor-missing、零 already、零 THROW —— 与 scripts/patch-deps.js 的
// 「失配 0 / 失败 0」实况同源，两者互为对账。）
//
// 与旧代快照的差异（rc.2 真闭包 vs 旧 stage 树；逐条都是「旧值来自残缺树或双
// 前缀口径」的纠正，不是锚点漂移）：
//   · runtime-flash-fix / credentials-absent-guidance /
//     slot-legacy-key / slot-error-isolation / history-page-size /
//     journal-prepend-continuity / chat-scroll-autoload-older /
//     reasoning-row-collapse-width / session-unknown-event-tolerance /
//     claude-local-bin-fallback → 现 'changed'：旧 stage 树缺对应包；
//     （image-send-fix 当时也在此列，2026-10 随识图插件整体退役，行已摘）
//   · terminal-interrupt-escalation / profile-bundle-guard-appboot /
//     agent-preset-fallback / pi-ai-tool-name-wire → 现 'changed'：旧值是重靶前
//     的失配/双前缀口径残留；
//   · atomic-write-orphan-lock / model-image-input / loader-tree-isolation /
//     fallback-heal-isolation / settings-section-guard /
//     profile-bundle-guard-profileboot → 已从注册表摘除，不再出现在本快照；
//   · image-send-fix → 2026-10 内置伴随插件批量拆除时摘除（只为已退役的识图插件
//     存在），本快照不再覆盖；
//   · profile-patch-layer-guard → 新增行（取代 profile-boot 半边）。
// ===========================================================================
const BASELINE = {
  '0.2.0-rc.2': {
    'slot-legacy-key': 'changed',
    'slot-unkeyed-compat': 'changed',
    'slot-error-isolation': 'changed',
    'runtime-flash-fix': 'changed',
    'shell-description-compat': 'changed',
    'attachment-mime-trust': 'changed',
    'persistent-shell-abort-race': 'changed',
    'terminal-interrupt-escalation': 'changed',
    'profile-patch-guard': 'changed',
    'profile-bundle-guard-appboot': 'changed',
    'profile-patch-layer-guard': 'changed',
    'loader-activation-isolation': 'changed',
    'fail-loud-isolation': 'changed',
    'manual-sort-drag-fix': 'changed',
    'credentials-initial-retry': 'changed',
    'credentials-absent-guidance': 'changed',
    'device-auth-guidance': 'changed',
    'kernel-web-boot-watchdog': 'changed',
    'plugin-inventory-tab-merge': 'changed',
    'web-search-baseurl': 'root',
    'menu-viewport': 'root',
    'session-manage': 'root',
    'open-project-dir': 'root',
    'session-persistence': 'root',
    'workspace-pin': 'root',
    'tool-source-compat': 'root',
    'pi-ai-opencode-go-models': 'root',
    'pi-ai-credits': 'root',
    'pi-ai-overflow-message': 'root',
    'agent-preset-fallback': 'changed',
    'settings-models-resilience': 'root',
    'pi-ai-reasoning-defaults': 'root',
    'bundle-arrival-retry': 'root',
    'agent-loop-scheduler-guard': 'root',
    'empty-tool-name-guidance': 'root',
    'prompt-context-literal': 'changed',
    'wsl-picker-browse': 'changed',
    'adapter-prepare-call-guard': 'changed',
    'content-has-image-guard': 'changed',
    'session-header-scan-guard': 'changed',
    'session-load-graceful': 'changed',
    // codex / pi-ai 系靶不属 @deepseek-ai scope，也不在 vendor/dsh-kernel 离线闭包
    // 内（pi-ai 是宿主可选依赖，install-pristine-kernel 不解包它）→ 恒
    // target-absent。真实字节判定见各自单测：unit-patch-tool-source-compat
    // （codex/claude 回落）、unit-pi-ai-*（4xx dump / tool-schema sanitize /
    // responses tool-name / quota-not-retryable）。claude-local-bin-fallback 的靶
    // 是 @deepseek-ai 包，故同组里只有 codex 一条落 target-absent。
    'codex-local-bin-fallback': 'target-absent',
    'claude-local-bin-fallback': 'changed',
    'skill-dirs-compat': 'changed',
    'pi-ai-4xx-dump': 'target-absent',
    'pi-ai-tool-schema-sanitize': 'target-absent',
    'pi-ai-responses-tool-name-sanitize': 'target-absent',
    'pi-ai-tool-name-wire': 'changed',
    'pi-ai-quota-not-retryable': 'target-absent',
    'ds-tool-schema-sanitize': 'changed',
    'workspace-chip-label-hold': 'changed',
    'history-page-size': 'changed',
    'journal-prepend-continuity': 'changed',
    'chat-scroll-autoload-older': 'changed',
    'conversation-assembly-resilience': 'changed',
    'reasoning-row-collapse-width': 'changed',
    'session-unknown-event-tolerance': 'changed',
    'released-v0-history-recovery': 'changed',
  },
};

test(`${SPEC_COUNT} 补丁 × pristine ${FORM} 判定矩阵与基线快照一致（锚点漂移哨兵）`, () => {
  const root = formRoot();
  assert.ok(root,
    '缺与 kernel-pin(' + FORM + ') 同版的 pristine 内核闭包树。已解析到：'
    + (pristineRoots().join(' , ') || '（无）') + '。先跑 node scripts/install-pristine-kernel.mjs。');
  const matrix = computeMatrix(root);
  // 打印当前矩阵（升级时的 diff 材料）。
  console.log('[TA6 基线矩阵] root = ' + root);
  for (const spec of PATCH_SPECS.slice().sort((a, b) => a.order - b.order)) {
    console.log('  ' + spec.id.padEnd(34) + String(matrix[spec.id]));
  }
  const drift = driftOf(BASELINE[FORM], matrix);
  assert.equal(drift.length, 0,
    '判定矩阵漂移（内核形态变化或锚点漂移；确认后更新 BASELINE 快照以显式接受新基线）:\n  '
    + drift.join('\n  '));
});

test('基线快照自身完整性：单形态 × ' + SPEC_COUNT + ' id 全覆盖且版本键等于 pin', () => {
  const ids = new Set(PATCH_SPECS.map((s) => s.id));
  assert.equal(ids.size, SPEC_COUNT, '注册表规格总数（计数锁，沿革见文件头 SPEC_COUNT）');
  const problems = integrityProblems(ids, BASELINE);
  assert.equal(problems.length, 0, '快照必须自洽:\n  ' + problems.join('\n  '));
});

test('完整性与漂移判据可被拆掉（反证，防空判据）', () => {
  const ids = new Set(PATCH_SPECS.map((s) => s.id));
  const snapshot = BASELINE[FORM];

  // 反证一：少一项 → 完整性必须同时报「缺 id」与计数偏离。
  const shrunk = { ...snapshot };
  const missingId = Object.keys(shrunk)[0];
  delete shrunk[missingId];
  const p1 = integrityProblems(ids, { [FORM]: shrunk });
  assert.ok(p1.some((m) => m.includes('缺 id ' + missingId)), '漏登记一个 id 必须被完整性判据抓到');
  assert.ok(p1.some((m) => m.includes(String(SPEC_COUNT))), '计数偏离必须同时被计数锁抓到');

  // 反证二：多一个幽灵 id → 必须报「未知 id」与计数偏离。
  const p2 = integrityProblems(ids, { [FORM]: { ...snapshot, 'ghost-spec-id': 'changed' } });
  assert.ok(p2.some((m) => m.includes('未知 id ghost-spec-id')), '幽灵 id 必须被完整性判据抓到');

  // 反证三：版本键换成旧代 → 必须响亮报「≠ kernel-pin」，不许静默沿用旧基线。
  const p3 = integrityProblems(ids, { '0.1.6-alpha.1': snapshot });
  assert.ok(p3.some((m) => m.includes('kernel-pin')), '版本键与 pin 不符必须报错');

  // 反证四：driftOf 不是恒空判据——基线与现算差一项就必须点名。
  const drifted = { ...snapshot, 'slot-legacy-key': 'anchor-missing' };
  const nowRow = { ...snapshot, 'slot-legacy-key': 'changed' };
  const d = driftOf(drifted, nowRow);
  assert.equal(d.length, 1, '一条偏离就该报一条，不多报');
  assert.ok(d[0].includes('slot-legacy-key: 基线=anchor-missing → 现在=changed'),
    '锚点漂移必须逐项报出：' + d.join(' / '));
});
