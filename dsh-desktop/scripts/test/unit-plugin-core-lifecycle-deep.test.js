'use strict';

// lifecycle 深测：卸载彻底性（state/patch/manifest/modules/.pnpm 全清）、
// I1 中止矩阵（四步各自失败时的半状态契约）、恢复（含隔离决策清理）、
// setEnabled 边界、removePackageDir / prunePackageStore / referencedByLinks /
// packageDirOf。全部临时目录，绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { collectInventory } = require('../plugin-core/lib/inventory');
const { ManifestStore } = require('../plugin-core/lib/manifest-store');
const { createLifecycle, packageDirOf, removePackageDir, cleanupStaleTrash, prunePackageStore } = require('../plugin-core/lib/lifecycle');
const { PluginStateStore } = require('../plugin-core/lib/state-store');
const { sharedWriteGate } = require('../plugin-core/lib/fs-atomic');

const IS_WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tmp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-life-deep-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/**
 * Windows 独占锁：起一个 PowerShell 子进程用 FileShare.None 锁住 file，
 * 写 marker 后休眠。用于逼真模拟「运行中文件被占用」。
 */
function lockFile(file, holdMs = 15000) {
  const marker = file + '.locked';
  try { fs.rmSync(marker, { force: true }); } catch {}
  const psFile = file.replace(/\\/g, '\\\\');
  const psMarker = marker.replace(/\\/g, '\\\\');
  const script =
    "$f = [System.IO.File]::Open('" + psFile + "', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None);" +
    "[System.IO.File]::WriteAllText('" + psMarker + "', '1');" +
    "Start-Sleep -Seconds " + Math.ceil(holdMs / 1000);
  // 优先 pwsh（PowerShell 7）：GitHub runner 上冷启动 ~0.3s，比 Windows
  // PowerShell 5.1（并行全量测试抢占下可达 10s+）快一个量级；无 pwsh 回落。
  const exe = cp.spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { timeout: 8000, windowsHide: true }).status === 0 ? 'pwsh' : 'powershell';
  const child = cp.spawn(exe, ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  return {
    child,
    async ready() {
      // 就绪预算 40s（原 10s 在 CI 并行负载下不够）。
      for (let i = 0; i < 1600; i += 1) {
        if (fs.existsSync(marker)) return true;
        await sleep(25);
      }
      return fs.existsSync(marker);
    },
    async release() {
      try { if (child.exitCode === null) child.kill(); } catch {}
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
      try { fs.rmSync(marker, { force: true }); } catch {}
    },
  };
}

/**
 * 组装一个带 state / manifestStore / sharedWriteGate(profileDir) 的完整中心。
 * 默认配套插件 file-drop（name dsh-file-drop），可覆盖为社区插件。
 */
function buildFixture(t, opts = {}) {
  const pluginId = opts.pluginId || 'file-drop';
  const pluginName = opts.pluginName || 'dsh-file-drop';
  const companion = opts.companion === undefined
    ? [{ id: 'file-drop', name: 'dsh-file-drop' }]
    : opts.companion;
  const bundles = opts.bundles === undefined ? [pluginName] : opts.bundles;
  const withNodeModules = opts.withNodeModules !== false;
  const withStore = opts.withStore !== false;

  const home = tmp(t);
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });

  const manifest = { name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: bundles.slice() } } };
  manifest.dependencies[pluginName] = '^1.0.0';
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '');

  if (withNodeModules) {
    const dir = path.join(profileDir, 'node_modules', ...pluginName.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pluginName, version: '1.0.0' }));
    fs.writeFileSync(path.join(dir, 'index.js'), 'export default {};\n');
  }
  if (withStore) {
    const storeDir = path.join(profileDir, 'node_modules', '.pnpm', pluginName.replace('/', '+') + '@1.0.0');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(path.join(storeDir, 'package.json'), JSON.stringify({ name: pluginName, version: '1.0.0' }));
  }

  const stateFile = path.join(home, 'desktop-plugin-state.json');
  const state = new PluginStateStore({ file: stateFile });
  const manifestStore = new ManifestStore({ profileDir, gate: sharedWriteGate(profileDir) });
  const patchGate = sharedWriteGate(profileDir);
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const logs = [];
  const log = (msg) => logs.push(String(msg));

  const inventoryRows = () => collectInventory({
    profileDir,
    companionPlugins: companion,
    patchText: (() => { try { return fs.readFileSync(patchFile, 'utf8'); } catch { return ''; } })(),
    bundles: manifestStore.bundles(),
    state: { isUninstalled: (id) => state.isUninstalled(id), isQuarantined: (id) => state.isQuarantined(id) },
  });
  const lifecycle = createLifecycle({ profileDir, state, manifestStore, patchGate, inventoryRows, log });
  return { home, profileDir, stateFile, state, manifestStore, patchGate, lifecycle, inventoryRows, patchFile, companion, pluginId, pluginName, logs };
}

const readPatch = (c) => fs.readFileSync(c.patchFile, 'utf8');
const readManifest = (c) => JSON.parse(fs.readFileSync(path.join(c.profileDir, 'package.json'), 'utf8'));
const pkgDir = (c) => path.join(c.profileDir, 'node_modules', ...c.pluginName.split('/'));

// ── 1. 卸载 happy-path 彻底性 ─────────────────────────────────────────────

test('uninstall happy-path：state/patch/manifest/modules/.pnpm 全清', async (t) => {
  const c = buildFixture(t);
  const res = await c.lifecycle.uninstall('file-drop');
  assert.ok(res.ok);
  assert.equal(res.restartRequired, true);

  // state：卸载决策落盘。
  const reloaded = new PluginStateStore({ file: c.stateFile });
  assert.ok(reloaded.isUninstalled('file-drop'), 'state 有 uninstalled[id]');

  // patch：顶层条目 disabled:true + removed:true。
  const patch = readPatch(c);
  assert.match(patch, /- id: file-drop/);
  assert.match(patch, /disabled: true/);
  assert.match(patch, /removed: true/);

  // manifest：bundle 登记移除、dependencies 键删除。
  const manifest = readManifest(c);
  assert.ok(!manifest.dsh.profile.bundles.includes('dsh-file-drop'), 'bundles 不再包含 name');
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'dependencies'), 'dependencies 键已删除');

  // modules：node_modules/<name> 与 .pnpm/<name>@* 均移除。
  assert.ok(!fs.existsSync(pkgDir(c)), 'node_modules/<name> 移除');
  assert.ok(!fs.existsSync(path.join(c.profileDir, 'node_modules', '.pnpm', 'dsh-file-drop@1.0.0')), '.pnpm store 副本移除');
});

// ── 2. I1 中止矩阵 ────────────────────────────────────────────────────────

test('I1(a)：state 落盘失败（state 只读）→ PLUGIN_BUSY，patch/manifest/modules 不动', { skip: !IS_WIN }, async (t) => {
  const c = buildFixture(t);
  fs.writeFileSync(c.stateFile, JSON.stringify({ v: 2, uninstalled: {}, quarantine: {} }) + '\n');
  fs.chmodSync(c.stateFile, 0o444);
  t.after(() => { try { fs.chmodSync(c.stateFile, 0o644); } catch {} });

  await assert.rejects(c.lifecycle.uninstall('file-drop'), (err) => err.code === 'PLUGIN_BUSY');

  assert.equal(readPatch(c), '', 'patch 未写');
  assert.ok(readManifest(c).dsh.profile.bundles.includes('dsh-file-drop'), 'manifest 未动');
  assert.ok(fs.existsSync(pkgDir(c)), 'modules 未动');
  const reloaded = new PluginStateStore({ file: c.stateFile });
  assert.ok(!reloaded.isUninstalled('file-drop'), 'state 无卸载条目');
});

test('I1(b)：patchGate.run 抛错 → patch 未写，state 已写（决策优先），modules 不动', async (t) => {
  const c = buildFixture(t);
  const fakeGate = { run: async () => { throw new Error('fake patch gate'); } };
  const lifecycle = createLifecycle({
    profileDir: c.profileDir, state: c.state, manifestStore: c.manifestStore,
    patchGate: fakeGate, inventoryRows: c.inventoryRows,
  });
  await assert.rejects(lifecycle.uninstall('file-drop'), /fake patch gate/);

  assert.equal(readPatch(c), '', 'patch 未写');
  const reloaded = new PluginStateStore({ file: c.stateFile });
  assert.ok(reloaded.isUninstalled('file-drop'), 'state 已写（决策先落盘，by design）');
  assert.ok(readManifest(c).dsh.profile.bundles.includes('dsh-file-drop'), 'manifest 未动');
  assert.ok(fs.existsSync(pkgDir(c)), 'modules 未动');
});

test('I1(c)：manifest.removeBundles 拒绝（manifest 只读）→ patch+state 已写，modules 不动', { skip: !IS_WIN }, async (t) => {
  const c = buildFixture(t);
  const manifestFile = path.join(c.profileDir, 'package.json');
  fs.chmodSync(manifestFile, 0o444);
  t.after(() => { try { fs.chmodSync(manifestFile, 0o644); } catch {} });

  await assert.rejects(c.lifecycle.uninstall('file-drop'), (err) => err && (err.code === 'EPERM' || err.code === 'EACCES'));

  const reloaded = new PluginStateStore({ file: c.stateFile });
  assert.ok(reloaded.isUninstalled('file-drop'), 'state 已写');
  const patch = readPatch(c);
  assert.match(patch, /removed: true/);
  assert.match(patch, /disabled: true/);
  assert.ok(readManifest(c).dsh.profile.bundles.includes('dsh-file-drop'), 'manifest 未动（只读）');
  assert.ok(fs.existsSync(pkgDir(c)), 'modules 未动');
});

test('I1(d)：removePackageDir 失败（独占锁）→ 错误传播，state/patch/manifest 已应用，目录仍在', { skip: !IS_WIN }, async (t) => {
  const c = buildFixture(t);
  const lockedFile = path.join(pkgDir(c), 'locked.bin');
  fs.writeFileSync(lockedFile, 'x');
  const lock = lockFile(lockedFile);
  assert.ok(await lock.ready(), '独占锁已获取');
  try {
    await assert.rejects(c.lifecycle.uninstall('file-drop'), (err) => err.code === 'PLUGIN_BUSY');
  } finally {
    await lock.release();
  }

  assert.ok(c.state.isUninstalled('file-drop'), 'state 已应用');
  const patch = readPatch(c);
  assert.match(patch, /removed: true/);
  assert.match(patch, /disabled: true/);
  assert.ok(!readManifest(c).dsh.profile.bundles.includes('dsh-file-drop'), 'manifest 已应用');
  assert.ok(fs.existsSync(pkgDir(c)), '目录仍在');
});

// ── 3. 恢复 ───────────────────────────────────────────────────────────────

test('restore：配套卸载后恢复 → state 清除 + patch 条目移除', async (t) => {
  const c = buildFixture(t);
  await c.lifecycle.uninstall('file-drop');
  assert.ok(c.state.isUninstalled('file-drop'));
  const rowAfter = c.inventoryRows().find((r) => r.id === 'file-drop');
  assert.equal(rowAfter.group, 'removed');
  assert.equal(rowAfter.restorable, true);

  const res = await c.lifecycle.restore('file-drop');
  assert.ok(res.ok);
  assert.ok(!c.state.isUninstalled('file-drop'));
  const patch = readPatch(c);
  assert.ok(!patch.includes('file-drop'), '恢复后条目移除');
});

test('restore：state 只读 → PLUGIN_BUSY，patch 不动', { skip: !IS_WIN }, async (t) => {
  const c = buildFixture(t);
  await c.lifecycle.uninstall('file-drop');
  fs.chmodSync(c.stateFile, 0o444);
  t.after(() => { try { fs.chmodSync(c.stateFile, 0o644); } catch {} });

  await assert.rejects(c.lifecycle.restore('file-drop'), (err) => err.code === 'PLUGIN_BUSY');
  assert.match(readPatch(c), /removed: true/, 'patch 未动');
});

test('restore：社区插件 → PLUGIN_RESTORE_NO_SOURCE', async (t) => {
  const c = buildFixture(t, {
    pluginId: 'third-party', pluginName: 'third-party',
    companion: [{ id: 'file-drop', name: 'dsh-file-drop' }],
  });
  await c.lifecycle.uninstall('third-party');
  await assert.rejects(c.lifecycle.restore('third-party'), (err) => err.code === 'PLUGIN_RESTORE_NO_SOURCE');
});

test('restore：一并清除隔离决策（预置 quarantine 状态 + disabled 行 → 恢复后均消失）', async (t) => {
  const c = buildFixture(t);
  await c.lifecycle.uninstall('file-drop');
  await c.state.markQuarantined('file-drop', 'dsh-file-drop');
  assert.ok(c.state.isQuarantined('file-drop'));
  assert.match(readPatch(c), /disabled: true/);

  const res = await c.lifecycle.restore('file-drop');
  assert.ok(res.ok);
  assert.ok(!c.state.isUninstalled('file-drop'));
  assert.ok(!c.state.isQuarantined('file-drop'), '隔离决策清除');
  const patch = readPatch(c);
  assert.ok(!patch.includes('disabled: true'));
  assert.ok(!patch.includes('removed: true'));
});

// ── 4. setEnabled ─────────────────────────────────────────────────────────

test('setEnabled：core → NOT_TOGGLEABLE；removed → NOT_TOGGLEABLE；未知 → NOT_FOUND；非法 id → BAD_ID', async (t) => {
  const core = buildFixture(t, {
    pluginId: 'dsh-base', pluginName: '@deepseek-ai/dsh-base',
    bundles: ['@deepseek-ai/dsh-base'], companion: [],
    withNodeModules: false, withStore: false,
  });
  await assert.rejects(core.lifecycle.setEnabled('dsh-base', false), (err) => err.code === 'PLUGIN_NOT_TOGGLEABLE');

  const c = buildFixture(t);
  await c.lifecycle.uninstall('file-drop');
  await assert.rejects(c.lifecycle.setEnabled('file-drop', false), (err) => err.code === 'PLUGIN_NOT_TOGGLEABLE');
  await assert.rejects(c.lifecycle.setEnabled('nope', false), (err) => err.code === 'PLUGIN_NOT_FOUND');
  await assert.rejects(c.lifecycle.setEnabled('../x', false), (err) => err.code === 'PLUGIN_BAD_ID');
});

test('setEnabled：禁用写 disabled:true 行；启用移除行并清隔离', async (t) => {
  const c = buildFixture(t);
  const off = await c.lifecycle.setEnabled('file-drop', false);
  assert.ok(off.ok);
  assert.match(readPatch(c), /- id: file-drop/);
  assert.match(readPatch(c), /disabled: true/);

  await c.state.markQuarantined('file-drop', 'dsh-file-drop');
  const on = await c.lifecycle.setEnabled('file-drop', true);
  assert.ok(on.ok);
  assert.ok(!readPatch(c).includes('file-drop'), '启用后条目移除');
  assert.ok(!c.state.isQuarantined('file-drop'), '隔离决策清除');
});

test('setEnabled：隔离决策清除失败（state 只读）仍 ok:true + 日志', { skip: !IS_WIN }, async (t) => {
  const c = buildFixture(t);
  await c.lifecycle.setEnabled('file-drop', false);
  await c.state.markQuarantined('file-drop', 'dsh-file-drop');
  fs.chmodSync(c.stateFile, 0o444);
  t.after(() => { try { fs.chmodSync(c.stateFile, 0o644); } catch {} });

  const res = await c.lifecycle.setEnabled('file-drop', true);
  assert.ok(res.ok, '补丁层已启用，仍返回成功');
  assert.ok(!readPatch(c).includes('file-drop'), 'patch 已启用（条目移除）');
  assert.ok(c.logs.some((l) => l.includes('解除隔离决策持久化失败')), '记录了决策清除失败日志');
});

// ── 5. removePackageDir / cleanupStaleTrash ───────────────────────────────

test('removePackageDir：缺失目录 → true', (t) => {
  const profileDir = tmp(t);
  assert.equal(removePackageDir(profileDir, 'nonexistent', {}), true);
});

test('removePackageDir：rename 成功 → 目录消失且无 .trash 残留', (t) => {
  const profileDir = tmp(t);
  const dir = path.join(profileDir, 'node_modules', 'pkg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), 'x');
  assert.equal(removePackageDir(profileDir, 'pkg', {}), true);
  assert.ok(!fs.existsSync(dir), '目录已移除');
  const leftovers = fs.readdirSync(path.join(profileDir, 'node_modules')).filter((n) => n.includes('.trash-'));
  assert.equal(leftovers.length, 0, '无 .trash 残留');
});

test('cleanupStaleTrash：旧残留清理、新残留保留、@scope 子层覆盖', (t) => {
  const profileDir = tmp(t);
  const modules = path.join(profileDir, 'node_modules');
  fs.mkdirSync(modules, { recursive: true });
  const now = Date.now();
  const oldName = 'pkg.trash-' + (now - 25 * 3600 * 1000) + '-1';
  const freshName = 'pkg.trash-' + now + '-2';
  fs.mkdirSync(path.join(modules, oldName));
  fs.mkdirSync(path.join(modules, freshName));
  const scopeDir = path.join(modules, '@scope');
  fs.mkdirSync(scopeDir);
  const scopedOld = 'name.trash-' + (now - 25 * 3600 * 1000) + '-3';
  fs.mkdirSync(path.join(scopeDir, scopedOld));

  cleanupStaleTrash(profileDir, { now });

  assert.ok(!fs.existsSync(path.join(modules, oldName)), '旧残留清理');
  assert.ok(fs.existsSync(path.join(modules, freshName)), '新残留保留');
  assert.ok(!fs.existsSync(path.join(scopeDir, scopedOld)), '@scope 子层旧残留清理');
});

// ── 6. prunePackageStore / referencedByLinks ──────────────────────────────

test('prunePackageStore：精确同名（foo@1 不误删 foo-bar@1）与 scope store 条目', (t) => {
  const profileDir = tmp(t);
  const pnpm = path.join(profileDir, 'node_modules', '.pnpm');
  fs.mkdirSync(path.join(pnpm, 'foo@1.0.0'), { recursive: true });
  fs.mkdirSync(path.join(pnpm, 'foo-bar@1.0.0'), { recursive: true });
  fs.mkdirSync(path.join(pnpm, '@scope+name@1.0.0'), { recursive: true });

  prunePackageStore(profileDir, 'foo', {});
  assert.ok(!fs.existsSync(path.join(pnpm, 'foo@1.0.0')), 'foo@1.0.0 移除');
  assert.ok(fs.existsSync(path.join(pnpm, 'foo-bar@1.0.0')), 'foo-bar@1.0.0 保留（精确匹配）');

  prunePackageStore(profileDir, '@scope/name', {});
  assert.ok(!fs.existsSync(path.join(pnpm, '@scope+name@1.0.0')), 'scope store 条目移除');
});

test('prunePackageStore：被顶层 junction 引用 → 保留', (t) => {
  const profileDir = tmp(t);
  const modules = path.join(profileDir, 'node_modules');
  const storeDir = path.join(modules, '.pnpm', 'foo@1.0.0');
  fs.mkdirSync(storeDir, { recursive: true });
  fs.symlinkSync(storeDir, path.join(modules, 'foo'), 'junction');

  prunePackageStore(profileDir, 'foo', {});
  assert.ok(fs.existsSync(storeDir), 'store 保留（顶层 junction 引用）');
});

test('prunePackageStore：仅被 .pnpm/<other>/node_modules/<dep> 传递链接引用 → 保留', (t) => {
  const profileDir = tmp(t);
  const modules = path.join(profileDir, 'node_modules');
  const storeDir = path.join(modules, '.pnpm', 'foo@1.0.0');
  fs.mkdirSync(storeDir, { recursive: true });
  const depDir = path.join(modules, '.pnpm', 'other@1.0.0', 'node_modules');
  fs.mkdirSync(depDir, { recursive: true });
  fs.symlinkSync(storeDir, path.join(depDir, 'foo'), 'junction');

  prunePackageStore(profileDir, 'foo', {});
  assert.ok(fs.existsSync(storeDir), 'store 保留（传递依赖链接引用）');
});

test('prunePackageStore：悬空链接不计入引用 → 删除', (t) => {
  const profileDir = tmp(t);
  const modules = path.join(profileDir, 'node_modules');
  const storeDir = path.join(modules, '.pnpm', 'foo@1.0.0');
  fs.mkdirSync(storeDir, { recursive: true });
  // 顶层悬空 junction（目标已删除）。
  const deadTarget = path.join(profileDir, 'dead-target');
  fs.mkdirSync(deadTarget);
  fs.symlinkSync(deadTarget, path.join(modules, 'foo'), 'junction');
  fs.rmSync(deadTarget, { recursive: true, force: true });

  prunePackageStore(profileDir, 'foo', {});
  assert.ok(!fs.existsSync(storeDir), '悬空链接不保护 store，仍删除');
});

// ── 7. packageDirOf ───────────────────────────────────────────────────────

test('packageDirOf：合法名 OK；路径穿越/非字符串 → null', (t) => {
  const profileDir = tmp(t);
  assert.equal(packageDirOf(profileDir, 'dsh-file-drop'), path.join(profileDir, 'node_modules', 'dsh-file-drop'));
  assert.equal(packageDirOf(profileDir, '@scope/name'), path.join(profileDir, 'node_modules', '@scope', 'name'));
  assert.equal(packageDirOf(profileDir, '../x'), null);
  assert.equal(packageDirOf(profileDir, 'a/../../b'), null);
  assert.equal(packageDirOf(profileDir, '..'), null);
  assert.equal(packageDirOf(profileDir, 123), null);
  assert.equal(packageDirOf(profileDir, null), null);
  assert.equal(packageDirOf(profileDir, undefined), null);
});

test('restore：v0.4.1 时代「仅 patch removed 行」的存量卸载可恢复（state 无记录不清零失败）', async (t) => {
  const c = buildFixture(t);
  // 直接构造「仅 patch 有 removed 行、state 无决策」的存量形态。
  fs.writeFileSync(c.patchFile, "- id: file-drop\n  name: 'dsh-file-drop'\n  disabled: true\n  removed: true\n");
  assert.ok(!c.state.isUninstalled('file-drop'), 'state 无卸载决策（存量形态）');
  const res = await c.lifecycle.restore('file-drop');
  assert.ok(res.ok, '恢复应成功（不得因 state 无记录而中止）');
  const patch = fs.readFileSync(c.patchFile, 'utf8');
  assert.ok(!/removed:\s*true/i.test(patch), 'patch removed 行应移除');
});

test('prunePackageStore：junction 环（node_modules/loop → node_modules 自身）终止且不栈溢出', () => {
  const t = { after: (fn) => fn() }; // 手动管理临时目录
  const dir = tmp(t);
  const profileDir = path.join(dir, 'profiles', 'web');
  const modulesDir = path.join(profileDir, 'node_modules');
  fs.mkdirSync(path.join(modulesDir, '.pnpm', 'foo@1.0.0'), { recursive: true });
  try {
    fs.symlinkSync(modulesDir, path.join(modulesDir, 'loop'), 'junction');
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    return; // 无 junction 权限环境跳过
  }
  // 不得无限递归/栈溢出：环被 visited 集截断，正常返回。
  prunePackageStore(profileDir, 'foo', { log: () => {} });
  fs.rmSync(dir, { recursive: true, force: true });
});
