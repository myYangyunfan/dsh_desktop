'use strict';

// TA3 链路集成测试：boot 链全链（applyAll → composition-integrity CLI →
// fault-isolation preflight / compositionPreflight 一条龙）。
//
// 手法：pristine 源取自 pristine-kernel-roots 给出的「未被任何补丁碰过」的内核
// 闭包树（历史上是仓库根 .tmp-rc2-stage，现为 .tmp-kernel/.consumer-*/node_modules）；
// 拷入两个临时目录充当 appDir 与 home（绝不碰真实
// ~/.dsh 与在用实例），跑生产 applyAll（48 补丁注册表全量）+ 只读预检 +
// 关键服务修复探测，断言：
//   1. 一遍：48 补丁全部执行、changed > 0、零 errors；
//   2. composition 字段（sources/services/criticalMissing/parseIssues）与
//      CLI 退出码契约（关键服务全在位 → 0）；
//   3. fault-isolation preflight：打补丁后 unpatched 为空；
//   4. 二遍幂等：changed === 0（已打补丁不重写）；
//   5. compositionPreflight：fallback junction 缺失 → 重建指向本安装。
//
// 运行：node --test scripts/test/ta3-boot-chain.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const desktopRoot = path.resolve(__dirname, '..', '..'); // dsh-desktop
// pristine 根：旧实现硬编码 .tmp-rc2-stage，那株一次性装配树被清后本文件两条
// 用例如注释所说「skip」—— 全链一条龙是整套里最接近真实启动的守卫，静默停摆
// 比红更糟，故改为多候选根探测。
const { firstPristineRoot, describePristineRoots } = require('../lib/pristine-kernel-roots');
const pristineNm = firstPristineRoot();
const { applyAll } = require('../integration/patch-runner');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { preflight, compositionPreflight } = require('../integration/fault-isolation');
const { checkServicePresence } = require('../integration/composition-integrity');

/** pristine 源缺席时跳过（候选根都是构建/装配产物，可能被清理）。 */
function hasPristine() {
  return !!pristineNm && fs.existsSync(path.join(pristineNm, '@deepseek-ai', 'dsh-base', 'cordis.patch.yml'));
}
const SKIP_NO_PRISTINE = '无可用 pristine 内核闭包树（查过：' + describePristineRoots() + '）';

/** 组装临时 appDir + home（home 的 fallback credentials junction 故意缺失，
 * 供 compositionPreflight 修复场景）。 */
async function buildTempRoots(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ta3-boot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appDir = path.join(root, 'app');
  const home = path.join(root, 'home');
  const logs = [];
  const log = (m) => logs.push(String(m));
  const ctx = {
    home,
    appDir,
    userDataDir: path.join(root, 'userData'),
    wslMode: false,
    log,
  };
  // pristine 拷贝：appDir 全量；home 只需要 profiles/node_modules（fallback 树）。
  const copy = promisify(fs.cp);
  await copy(pristineNm, path.join(appDir, 'node_modules'), { recursive: true });
  await copy(pristineNm, path.join(home, 'profiles', 'node_modules'), { recursive: true });
  // profile 清单（preflight 早退守卫需要非空 bundles）。
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }));
  // credentials 真实目录从 fallback 树挖掉 → compositionPreflight 的修复靶点。
  fs.rmSync(path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-credentials-local'), { recursive: true, force: true });
  return { root, appDir, home, ctx, logs };
}

test('boot 链一条龙：applyAll(58) → composition-integrity → preflight → 二遍幂等', { skip: !hasPristine() && SKIP_NO_PRISTINE }, async (t) => {
  const { appDir, home, ctx } = await buildTempRoots(t);

  // ---- 1. 一遍 applyAll：58 补丁全执行、有落盘、零 errors ----
  const r1 = applyAll(ctx);
  assert.equal(r1.total, 58, `注册表应有 58 个补丁（实际 ${r1.total}）`);
  assert.equal(PATCH_SPECS.length, 58, 'PATCH_SPECS 与编排 total 一致');
  assert.ok(r1.changed > 0, `pristine 源一遍必须有写入（实际 changed=${r1.changed}）`);
  assert.deepEqual(r1.errors, [], `一遍不得有 errors：${JSON.stringify(r1.errors)}`);
  // degrade/fatal 档补丁的 anchor-missing 分流进 degraded（设计语义：降级告警
  // 而非 error）。pristine rc2 源上 slot-error-isolation 锚点失配属版本差异
  // 降级（记录为发现，见交付报告），此处断言：degraded 只能来自
  // degrade/fatal 档且不重复。
  const degradeCapable = new Set(PATCH_SPECS.filter((s) => (s.failPolicy || 'warn') !== 'warn').map((s) => s.id));
  for (const id of r1.degraded) {
    assert.ok(degradeCapable.has(id), `degraded 项 ${id} 必须是 degrade/fatal 档补丁`);
  }
  assert.equal(new Set(r1.degraded).size, r1.degraded.length, 'degraded 不得重复计数');
  const changedFirst = r1.changed;

  // ---- 2. composition-integrity：字段面 + CLI 退出码 ----
  const report = checkServicePresence(appDir);
  assert.equal(report.ok, true, `关键服务应全在位：missing=${JSON.stringify(report.criticalMissing)}`);
  assert.equal(report.appDir, appDir);
  assert.equal(report.sources.length, 2, 'dsh-base + dsh-web-app 两个组合源');
  assert.ok(report.sources.every((s) => s.present), '组合 yml 可读');
  assert.ok(report.sources.every((s) => s.rows > 0), '服务行非空');
  assert.ok(Array.isArray(report.services) && report.services.length > 0, '全量服务行清单');
  assert.ok(report.services.some((s) => s.rowId === 'credentials' && s.status === 'present'), 'credentials 行在位');
  assert.deepEqual(report.criticalMissing, []);
  assert.ok(Array.isArray(report.parseIssues), 'parseIssues 字段在位');

  const cli = path.join(desktopRoot, 'scripts', 'integration', 'composition-integrity.js');
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, '--app-dir', appDir], { maxBuffer: 32 * 1024 * 1024 });
  assert.equal(stderr, '', 'CLI 零 stderr');
  const payload = JSON.parse(stdout.slice(stdout.indexOf('{')));
  assert.equal(payload.ok, true, 'CLI JSON ok=true');
  assert.ok(Array.isArray(payload.services) && payload.services.length === report.services.length, 'CLI 报告与库调用同量');
  // 退出码契约：execFileAsync 非 0 会 reject，能走到这里即退出码 0。

  // ---- 3. fault-isolation preflight（boot 链的 preflightHealth 同款）：
  // 打补丁后不误报；其内部常驻 compositionPreflight 已把缺失的 credentials
  // fallback junction 就地重建（K1 自愈层）。
  const logs2 = [];
  const fi = preflight({ home, appDir, userDataDir: ctx.userDataDir, log: (m) => logs2.push(m) });
  assert.deepEqual(fi.unpatched, [], `打补丁后 ui-slots 不得误报未覆盖：${JSON.stringify(fi.unpatched)}`);
  assert.ok(fi.composition, 'preflight 报告应带 composition 字段（K1+K2 常驻）');
  assert.ok(fi.composition.checked.includes('credentials'), 'K1 已探测 credentials');
  assert.ok(fi.composition.repaired.some((r) => r.id === 'credentials'), `缺失 junction 应在 preflight 内就地重建：${JSON.stringify(fi.composition)}`);
  assert.equal(fi.composition.broken.length, 0, `不得 broken：${JSON.stringify(fi.composition.broken)}`);

  // ---- 4. 二遍幂等：changed 归零 ----
  const r2 = applyAll(ctx);
  // total = 处理的 spec 数（含 target-absent，applyAll 内每 spec 无条件 +1），
  // 与一遍同源必相等，均等于 PATCH_SPECS.length；二遍只是 changed 归零。
  assert.equal(r2.total, 58, `二遍 total 应与一遍一致（实际 ${r2.total}）`);
  assert.deepEqual(r2.errors, [], `二遍不得有 errors：${JSON.stringify(r2.errors)}`);
  assert.equal(r2.changed, 0, `二遍应幂等（一遍 changed=${changedFirst}，二遍 changed=${r2.changed}）`);

  // ---- 5. compositionPreflight 修复已生效且幂等：健康态零修复 ----
  const real = fs.realpathSync(path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-credentials-local'));
  assert.ok(fs.existsSync(path.join(real, 'package.json')), 'junction → 本安装且可解析');
  const k1b = compositionPreflight({ home, appDir, log: () => {} });
  assert.deepEqual(k1b, { checked: ['credentials'], repaired: [], broken: [] }, '健康态幂等');
});

test('composition-integrity 负向：挖掉关键包 → CLI 退出码非 0', { skip: !hasPristine() && SKIP_NO_PRISTINE }, async (t) => {
  const { appDir } = await buildTempRoots(t);
  fs.rmSync(path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh-credentials-local'), { recursive: true, force: true });
  const report = checkServicePresence(appDir);
  assert.equal(report.ok, false, '关键服务缺席应 ok=false');
  assert.ok(report.criticalMissing.some((s) => s.rowId === 'credentials'), 'credentials 计入 criticalMissing');
  const cli = path.join(desktopRoot, 'scripts', 'integration', 'composition-integrity.js');
  await assert.rejects(
    execFileAsync(process.execPath, [cli, '--app-dir', appDir], { maxBuffer: 32 * 1024 * 1024 }),
    (err) => err.code === 1,
    '关键服务缺席时 CLI 退出码必须为 1',
  );
});
