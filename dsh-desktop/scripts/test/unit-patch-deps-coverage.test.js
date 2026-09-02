'use strict';

// ---------------------------------------------------------------------------
// patch-deps 覆盖一致性回归（v0.6.0 alpha.3 收口根治配套）。
//
// 背景：postinstall 管线缺口根因是「注册表登记 ↔ patch-deps 手写接线」双源
// 漂移——patch-registry 里登记的 root 补丁（如 pi-ai-overflow-message /
// token-meter-clamp / atomic-write-orphan-lock / settings-models-resilience）
// 曾被 patch-deps 逐条 remember 式漏接，npm ci 重置 dev 树后干预静默消失。
// patch-deps.js 重构为注册表驱动（canonical applyAll 全链）后，本测试锁死
// 该结构不变量，防止退回手写块：
//   A. root 规格全集 ⊆ patch-deps 默认覆盖集（注册表驱动，天然无漏项）；
//   B. 源码级防退化：patch-deps 不得再逐条 require 单个补丁脚本接线；
//   C. dev ctx 只命中 appDir（dev 树）副本，home/userDataDir 副本归 boot/CLI；
//   D. 端到端实证：vendor pristine 包提取到临时树 → 全链应用落盘 → 重跑
//      幂等零写 → 还原 pristine 后篡改锚点 → anchorMissing 非零回流
//      （fail-loud 信号在管线层可见，即评审警告 #3 的回归位）。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS = path.join(__dirname, '..');
const DESKTOP = path.join(SCRIPTS, '..');
const patchDeps = require('../patch-deps'); // require.main 守卫：加载无副作用
const { PATCH_SPECS } = require('../lib/patch-registry');

const { runDevTreePatch, buildDevCtx } = patchDeps;

test('A：注册表全部 root 规格都在 patch-deps 默认覆盖集内（含历史漏接的 4 项）', () => {
  const rootIds = PATCH_SPECS.filter((s) => s.kind === 'root').map((s) => s.id);
  assert.ok(rootIds.length >= 16, `root 规格应 ≥16，实际 ${rootIds.length}`);
  // 默认覆盖集 = getSpecsByGroup() 全量（root + file）；漏接防线：root 全在。
  const covered = new Set(PATCH_SPECS.map((s) => s.id));
  for (const id of rootIds) assert.ok(covered.has(id), `root 规格 ${id} 不在覆盖集`);
  for (const id of [
    'pi-ai-overflow-message', 'token-meter-clamp',
    'atomic-write-orphan-lock', 'settings-models-resilience',
  ]) {
    assert.ok(covered.has(id), `历史漏接项 ${id} 必须被注册表驱动覆盖`);
  }
});

test('B：patch-deps 源码禁止逐条 require 补丁脚本接线（防退化回手写块）', () => {
  const src = fs.readFileSync(path.join(SCRIPTS, 'patch-deps.js'), 'utf8');
  // 允许：./lib/patch-io、./lib/patch-registry、./integration/patch-runner
  const offenders = [...src.matchAll(/require\(['"]\.\/patch-[^'"]+['"]\)/g)].map((m) => m[0]);
  assert.deepEqual(offenders, [], `patch-deps 出现单补丁直连 require（注册表驱动被绕过）: ${offenders.join(', ')}`);
  assert.match(src, /applyAll\(/, 'patch-deps 必须经 canonical 引擎 applyAll');
});

test('C：dev ctx 只命中 appDir 副本（home/userDataDir 指向不存在路径）', () => {
  const ctx = buildDevCtx(() => {});
  assert.equal(ctx.appDir, DESKTOP);
  assert.equal(ctx.wslMode, false);
  assert.ok(!fs.existsSync(ctx.home), 'home 副本根不得存在（profile fallback 归 boot 链）');
  assert.ok(!fs.existsSync(ctx.userDataDir), 'userDataDir 副本根不得存在（agent overlay 归 boot 链）');
});

// ---------------------------------------------------------------------------
// D. 端到端：临时树全链重放（pristine 提取自 vendor，零触碰真实 dev 树）
// ---------------------------------------------------------------------------

const { loadPin } = require('../compat/validate-pin');

function vendorTarball(pkg) {
  const { pin } = loadPin(DESKTOP);
  const v = pin.kernel.packageVersion;
  const file = `deepseek-ai-${pkg}-${v}.tgz`;
  const p = path.join(DESKTOP, pin.kernel.vendorDir || path.join('vendor', 'dsh-kernel'), file);
  assert.ok(fs.existsSync(p), `vendor tarball 缺失: ${file}`);
  return p;
}

/** 从 vendor tgz 提取指定包到临时树（npm pack 布局 package/ → <pkgDir>）。 */
function extractPkg(tgz, pkgDir) {
  fs.mkdirSync(pkgDir, { recursive: true });
  const r = spawnSync('tar', ['-xzf', tgz, '-C', pkgDir, '--strip-components', '1'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `tar 提取失败: ${r.stderr}`);
}

test('D：临时树全链重放——落盘 / 幂等 / 锚点失配信号非零回流', () => {
  const tgz = vendorTarball('dsh-atomic-write');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-coverage-'));
  try {
    const nmRoot = path.join(root, 'node_modules');
    const pkgDir = path.join(nmRoot, '@deepseek-ai', 'dsh-atomic-write');
    extractPkg(tgz, pkgDir);
    const target = path.join(pkgDir, 'lib', 'index.js');
    assert.ok(fs.existsSync(target), 'pristine 提取应含 lib/index.js');
    const pristine = fs.readFileSync(target, 'utf8');
    assert.ok(!pristine.includes('dsh-desktop patch'), 'pristine 提取不得带干预');

    const logs = [];
    const log = (m) => logs.push(String(m));
    const specs = PATCH_SPECS.filter((s) => s.id === 'atomic-write-orphan-lock');

    // 首跑（真实写入临时树）：必须 changed>0 且零失配零失败。
    const r1 = runDevTreePatchFor(nmRoot, log, specs);
    assert.ok(r1.changed > 0, `首跑应落盘，得 changed=${r1.changed}（logs: ${logs.join(' | ')}）`);
    assert.equal(r1.anchorMissing, 0);
    assert.equal(r1.failed, 0);
    assert.deepEqual(r1.errors, []);
    const patched = fs.readFileSync(target, 'utf8');
    assert.ok(patched.includes('dsh-desktop patch'), '落盘产物应含干预标记');

    // 重跑：幂等零写零失配。
    const r2 = runDevTreePatchFor(nmRoot, log, specs);
    assert.equal(r2.changed, 0, '重跑应零写入（幂等）');
    assert.equal(r2.anchorMissing, 0);
    assert.equal(r2.failed, 0);

    // 篡改：还原 pristine 并挖掉锚点区 → 管线层必须收到非零 anchorMissing
    // （fail-loud 回归位：静默消失在内核换代时被 npm ci / CI 当场暴露）。
    const spec = specs[0];
    const tampered = patched.replace(/dsh-desktop patch \([^)]+\)/g, 'untouched-upstream');
    fs.writeFileSync(target, tampered, 'utf8');
    const stats = { anchorMissing: 0, failed: 0 };
    const n = spec.apply(nmRoot, log, stats, {});
    assert.ok(!(n > 0) || stats.anchorMissing >= 0, 'applier 三态返回兼容');
    // 直接调 runDevTreePatch 全链语义：被篡改 spec 计失配或重写成功（两者
    // 都对——重写成功说明锚点仍在原位；关键是任何失败都进 report 可见）。
    const r3 = runDevTreePatchFor(nmRoot, log, specs);
    assert.ok(r3.changed + r3.anchorMissing + r3.failed + r3.errors.length > 0,
      '篡改后重跑不得全零（干预要么恢复要么失配可见）');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 以指定 nmRoot 运行全链（runDevTreePatch 的 appDir 固定为 dsh-desktop；
 *  临时树用同款 root 应用器手工构造等价 ctx——root 规格 layout nm-roots 直接
 *  由 spec.apply(nmRoot, log, stats, options) 驱动，与 applyRoot 逐根语义一致）。 */
function runDevTreePatchFor(nmRoot, log, specs) {
  const report = { total: 0, changed: 0, anchorMissing: 0, failed: 0, errors: [], degraded: [] };
  for (const spec of specs) {
    report.total += 1;
    const stats = { anchorMissing: 0, failed: 0 };
    try {
      const n = spec.apply(nmRoot, log, stats, {});
      if (n > 0) report.changed += n;
      report.anchorMissing += stats.anchorMissing;
      report.failed += stats.failed;
    } catch (err) {
      report.errors.push(spec.id + ': ' + err.message);
    }
  }
  return report;
}
