'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 6：49 补丁 × 双版本形态判定矩阵（基线快照，最有长期价值）。
//
// 对两个 pristine 内核源各跑一遍全部 transform（按 registry order）：
//   - 形态 rc.2：.tmp-rc2-stage/node_modules（npm 闭包解包，未打任何补丁）；
//   - 形态 rc.1（旧线形态代表，任务书称 rc.8 线）：.tmp-rc1-stage/rc1/package
//     （dsh 主包 0.1.1-rc.1 解包；其余包未装配，目标缺失记 target-absent）。
// 注意：dsh-desktop/node_modules 与 dsh-tauri payload 是 postinstall 已打补丁
// 树，不能作 pristine 源。
//
// 输出「补丁 × 形态 → changed/already/anchor-missing/target-absent/root」矩阵，
// 与下方 BASELINE 内联快照逐项比对：未来内核升级 / 锚点漂移时，失败信息即
// 完整 diff —— 哪些补丁从 changed 变 anchor-missing（锚点漂移面）、哪些从
// anchor-missing 变 already（上游原生内置、补丁自然退役）一目了然。
//
// 依赖链：vision 系（toggle/key）按 order 在 image-send 之后跑，矩阵记录的是
// 引擎真实编排序下的判定，而非裸序。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PATCH_SPECS } = require('../lib/patch-registry');

const FORM_ROOTS = {
  'rc.2': [
    path.join(__dirname, '..', '..', '..', '.tmp-rc2-stage', 'node_modules'),
  ],
  // 旧线形态（任务书 rc.8 线的本地可得代表 = rc.1 主包解包树）。
  'rc.1': [
    path.join(__dirname, '..', '..', '..', '.tmp-rc1-stage', 'rc1', 'package'),
  ],
};

function formRoot(form) {
  for (const r of FORM_ROOTS[form]) if (fs.existsSync(r)) return r;
  return null;
}

function targetFile(form, root, spec) {
  if (spec.kind !== 'file') return null;
  const joinUnder = form === 'rc.2'
    ? (rel) => path.join(root, '@deepseek-ai', rel)
    // rc.1 根即 dsh 主包解包目录：pkgRel 去掉首段包名 'dsh' 后拼入。
    : (rel) => {
      const parts = rel.split(path.sep);
      if (parts[0] !== 'dsh') return null;
      return path.join(root, ...parts.slice(1));
    };
  if (spec.layout === 'profile-boot-dirs') {
    const lib = form === 'rc.2'
      ? path.join(root, '@deepseek-ai', 'dsh', 'lib')
      : path.join(root, 'lib');
    try {
      const files = fs.readdirSync(lib).filter((f) => /^profile-boot-.*\.js$/.test(f));
      return files.length ? path.join(lib, files[0]) : null;
    } catch { return null; }
  }
  const rels = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
  for (const rel of rels) {
    const p = joinUnder(rel);
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/** 计算当前矩阵（rc.2 按 order 顺序跑，模拟引擎编排序：先应用者产物即
 * 后续补丁的输入——同文件多补丁时判定真实；不同文件互不影响）。 */
function computeMatrix() {
  const ordered = PATCH_SPECS.slice().sort((a, b) => a.order - b.order);
  const matrix = {};
  for (const form of Object.keys(FORM_ROOTS)) {
    const root = formRoot(form);
    matrix[form] = {};
    const fileState = new Map(); // file -> 当前内容（编排序累积）
    if (!root) { for (const s of ordered) matrix[form][s.id] = 'form-unavailable'; continue; }
    for (const spec of ordered) {
      if (spec.kind === 'root') { matrix[form][spec.id] = 'root'; continue; }
      const file = targetFile(form, root, spec);
      if (!file) { matrix[form][spec.id] = 'target-absent'; continue; }
      const src = fileState.has(file) ? fileState.get(file) : fs.readFileSync(file, 'utf8');
      let status;
      try {
        const r = spec.transform(src, file);
        status = r.status;
        if (r.status === 'changed') fileState.set(file, r.src);
      } catch (err) {
        status = 'THROW:' + err.message;
      }
      matrix[form][spec.id] = status;
    }
  }
  return matrix;
}

// ===========================================================================
// 基线快照（2026-08-28，rc.2 = .tmp-rc2-stage，rc.1 = .tmp-rc1-stage/rc1；
// 0.1.2-alpha.1 升级后：12 项退役 + 6 项重定位/重锚点，44 项基线；
// 新增 codex/claude 本地二进制回落 2 项 → 46 项基线；
// 新增 skill-dirs-compat 1 项 → 47 项基线）。
// 内核升级后 diff 此矩阵即知锚点漂移面：修改本常量 = 显式接受新基线。
// ===========================================================================
const BASELINE = {
  'rc.2': {
    'slot-legacy-key': 'target-absent',
    'slot-unkeyed-compat': 'changed',
    'slot-error-isolation': 'target-absent',
    'runtime-flash-fix': 'target-absent',
    'shell-description-compat': 'changed',
    'attachment-mime-trust': 'changed',
    'persistent-shell-abort-race': 'changed',
    'terminal-interrupt-escalation': 'anchor-missing',
    'profile-patch-guard': 'changed',
    'profile-bundle-guard-appboot': 'anchor-missing',
    'profile-bundle-guard-profileboot': 'already',
    'settings-section-guard': 'changed',
    'loader-tree-isolation': 'changed',
    'loader-activation-isolation': 'changed',
    'fail-loud-isolation': 'changed',
    'workspace-search-rail-fix': 'already',
    'manual-sort-drag-fix': 'changed',
    'fallback-heal-isolation': 'anchor-missing',
    'credentials-initial-retry': 'changed',
    'credentials-absent-guidance': 'target-absent',
    'device-auth-guidance': 'changed',
    'kernel-web-boot-watchdog': 'changed',
    'plugin-inventory-tab-merge': 'changed',
    'web-search-baseurl': 'root',
    'menu-viewport': 'root',
    'open-project-dir': 'root',
    'session-persistence': 'root',
    'tool-source-compat': 'root',
    'pi-ai-opencode-go-models': 'root',
    'pi-ai-credits': 'root',
    'pi-ai-overflow-message': 'root',
    'token-meter-clamp': 'root',
    'atomic-write-orphan-lock': 'root',
    'settings-models-resilience': 'root',
    'pi-ai-reasoning-defaults': 'root',
    'bundle-arrival-retry': 'root',
    'agent-loop-scheduler-guard': 'root',
    'empty-tool-name-guidance': 'root',
    'agent-preset-fallback': 'anchor-missing',
    'prompt-context-literal': 'changed',
    'wsl-picker-browse': 'changed',
    'adapter-prepare-call-guard': 'changed',
    'session-header-scan-guard': 'changed',
    'session-load-graceful': 'changed',
    'codex-local-bin-fallback': 'target-absent',
    'claude-local-bin-fallback': 'target-absent',
    'skill-dirs-compat': 'changed',
    'pi-ai-4xx-dump': 'target-absent',
    'pi-ai-tool-schema-sanitize': 'target-absent',
  },
  'rc.1': {
    'slot-legacy-key': 'target-absent',
    'slot-unkeyed-compat': 'target-absent',
    'slot-error-isolation': 'target-absent',
    'runtime-flash-fix': 'target-absent',
    'shell-description-compat': 'target-absent',
    'attachment-mime-trust': 'target-absent',
    'persistent-shell-abort-race': 'target-absent',
    'terminal-interrupt-escalation': 'target-absent',
    'profile-patch-guard': 'target-absent',
    'profile-bundle-guard-appboot': 'target-absent',
    'profile-bundle-guard-profileboot': 'already',
    'settings-section-guard': 'target-absent',
    'loader-tree-isolation': 'target-absent',
    'loader-activation-isolation': 'target-absent',
    'fail-loud-isolation': 'target-absent',
    'workspace-search-rail-fix': 'target-absent',
    'manual-sort-drag-fix': 'target-absent',
    'fallback-heal-isolation': 'target-absent',
    'credentials-initial-retry': 'target-absent',
    'credentials-absent-guidance': 'target-absent',
    'device-auth-guidance': 'target-absent',
    'kernel-web-boot-watchdog': 'target-absent',
    'plugin-inventory-tab-merge': 'target-absent',
    'web-search-baseurl': 'root',
    'menu-viewport': 'root',
    'open-project-dir': 'root',
    'session-persistence': 'root',
    'tool-source-compat': 'root',
    'pi-ai-opencode-go-models': 'root',
    'pi-ai-credits': 'root',
    'pi-ai-overflow-message': 'root',
    'token-meter-clamp': 'root',
    'atomic-write-orphan-lock': 'root',
    'settings-models-resilience': 'root',
    'pi-ai-reasoning-defaults': 'root',
    'bundle-arrival-retry': 'root',
    'agent-loop-scheduler-guard': 'root',
    'empty-tool-name-guidance': 'root',
    'agent-preset-fallback': 'target-absent',
    'prompt-context-literal': 'target-absent',
    'wsl-picker-browse': 'target-absent',
    'adapter-prepare-call-guard': 'target-absent',
    'session-header-scan-guard': 'target-absent',
    'session-load-graceful': 'target-absent',
    'codex-local-bin-fallback': 'target-absent',
    'claude-local-bin-fallback': 'target-absent',
    'skill-dirs-compat': 'target-absent',
    'pi-ai-4xx-dump': 'target-absent',
    'pi-ai-tool-schema-sanitize': 'target-absent',
  },
};

test('49 补丁 × rc.2 / rc.1 双形态判定矩阵与基线快照一致（锚点漂移哨兵）', { skip: !formRoot('rc.2') ? 'pristine rc.2 stage 树不可用（.tmp-rc2-stage 缺失）' : false }, () => {
  const matrix = computeMatrix();
  // 打印当前矩阵（基线对照 / 升级 diff 材料）。
  console.log('[TA6 基线矩阵]');
  const ids = PATCH_SPECS.map((s) => s.id);
  console.log('  id'.padEnd(34) + 'rc.2'.padEnd(18) + 'rc.1');
  for (const id of ids) {
    console.log('  ' + id.padEnd(32) + String(matrix['rc.2'][id]).padEnd(18) + String(matrix['rc.1'][id]));
  }

  const drift = [];
  for (const form of Object.keys(BASELINE)) {
    const ids2 = new Set([...Object.keys(BASELINE[form]), ...Object.keys(matrix[form] || {})]);
    for (const id of ids2) {
      const want = BASELINE[form][id];
      const got = (matrix[form] || {})[id];
      if (want !== got) drift.push(`${form}/${id}: 基线=${want} → 现在=${got}`);
    }
  }
  assert.deepEqual(drift, [],
    `判定矩阵漂移（内核形态变化或锚点漂移；确认后更新 BASELINE 快照以显式接受新基线）：\n  ${drift.join('\n  ')}`);
});

test('基线快照自身完整性：两形态 × 49 id 全覆盖', () => {
  const ids = new Set(PATCH_SPECS.map((s) => s.id));
  assert.equal(ids.size, 49);
  for (const form of Object.keys(BASELINE)) {
    assert.equal(Object.keys(BASELINE[form]).length, 49, `${form} 基线应覆盖 49 项`);
    for (const id of Object.keys(BASELINE[form])) assert.ok(ids.has(id), `${form} 基线含未知 id ${id}`);
  }
});

test('rc.1 形态根不可用时跳过而非误报（前置宽容）', { skip: formRoot('rc.1') ? false : 'rc.1 stage 树不可用（.tmp-rc1-stage/rc1/package 缺失）' }, () => {
  const matrix = computeMatrix();
  assert.notEqual(matrix['rc.1']['code-mode-compat'], 'form-unavailable');
});
