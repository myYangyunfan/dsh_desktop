'use strict';

// 安全模式（保底进入通道）回归锁。1.0.9 用户反馈：插件装崩之后客户端直接进不去，
// 恢复页两条路（内核装配失败 / 崩溃环）都盖不到「内核活着但客户端插件装配失败」，
// 用户除手删 profile 无路可走。这里锁三件事：
//   ① 纯函数行为（保留项、幂等、不改入参）；
//   ② 标记文件生命周期（一次性熔断）；
//   ③ 接线顺序（安全模式补丁必须先于写盘、标记消费必须晚于写盘——顺序反了
//      遇到写盘失败就丢掉唯一一次自救机会）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SAFE_MODE_FLAG,
  SAFE_MODE_ENV,
  SAFE_MODE_KEEP_IDS,
  safeModeFlagPath,
  safeModeRequested,
  disableCompanionsForSafeMode,
  clearSafeModeFlag,
  writeSafeModeFlag,
} = require('../lib/safe-mode');

const tauriRoot = path.join(__dirname, '..', '..');
const syncSrc = fs
  .readFileSync(path.join(__dirname, '..', 'sync-companion-plugins.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-safe-mode-'));
}

const PATCH = [
  'version: 1',
  'plugins:',
  '  - insert:',
  '      - id: dsh-builtin-manager',
  '        name: dsh-builtin-manager',
  '      - id: bili-compaction-gate',
  '        name: billion-context/dsh-compaction-gate',
  '      - id: better-sidebar',
  '        name: dsh-better-sidebar',
  '      - id: pocket',
  '        name: dsh-pocket',
  '',
].join('\n');

const PLUGINS = [
  { id: 'dsh-builtin-manager', name: 'dsh-builtin-manager' },
  { id: 'bili-compaction-gate', name: 'billion-context/dsh-compaction-gate' },
  { id: 'better-sidebar', name: 'dsh-better-sidebar' },
  { id: 'pocket', name: 'dsh-pocket' },
];

test('保留项必须含管理页与 billion-context gate（禁了就是换个姿势卡死）', () => {
  assert.ok(SAFE_MODE_KEEP_IDS.includes('dsh-builtin-manager'), '内置插件管理页是唯一自救界面');
  assert.ok(
    SAFE_MODE_KEEP_IDS.includes('bili-compaction-gate'),
    'gate 承载出厂预设 inject 等待的服务，禁掉会让会话创建永久 pending',
  );
});

test('标记文件缺失 + 无环境变量 → 不启用', () => {
  const home = tmpHome();
  try {
    const r = safeModeRequested(home, {});
    assert.equal(r.enabled, false);
    assert.equal(r.viaFlag, false);
    assert.equal(r.viaEnv, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('标记文件存在 → 启用（viaFlag）', () => {
  const home = tmpHome();
  try {
    writeSafeModeFlag(home);
    assert.ok(fs.existsSync(safeModeFlagPath(home)), '标记文件应落在 DSH_HOME 根');
    const r = safeModeRequested(home, {});
    assert.equal(r.enabled, true);
    assert.equal(r.viaFlag, true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test(`${SAFE_MODE_ENV} 取 1/true 启用，0/空/其它不启用`, () => {
  const home = tmpHome();
  try {
    for (const value of ['1', 'true', ' TRUE ']) {
      assert.equal(safeModeRequested(home, { [SAFE_MODE_ENV]: value }).enabled, true, `值=${value} 应启用`);
    }
    for (const value of ['0', 'false', '', 'yes-please', undefined]) {
      assert.equal(safeModeRequested(home, { [SAFE_MODE_ENV]: value }).enabled, false, `值=${String(value)} 不应启用`);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('标记一次性：clear 后不再启用', () => {
  const home = tmpHome();
  try {
    writeSafeModeFlag(home);
    assert.equal(safeModeRequested(home, {}).enabled, true);
    assert.equal(clearSafeModeFlag(home), true);
    assert.equal(safeModeRequested(home, {}).enabled, false);
    assert.equal(clearSafeModeFlag(home), false, '重复清除返回 false 而不抛');
    assert.ok(SAFE_MODE_FLAG.endsWith('.flag'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('安全模式禁用非保留项、保留项一字不动', () => {
  const r = disableCompanionsForSafeMode(PATCH, PLUGINS);
  assert.deepEqual(r.disabled.sort(), ['better-sidebar', 'pocket']);
  assert.deepEqual(r.kept, ['dsh-builtin-manager', 'bili-compaction-gate']);
  assert.equal(r.unchanged.length, 0);
  assert.notEqual(r.patch, PATCH, '必须返回新文本');
  // 保留项不得出现 disabled 行
  const keepBlocks = r.patch.split(/\n(?=\s*-\s)/).filter((b) => /id:\s*(dsh-builtin-manager|bili-compaction-gate)\b/.test(b));
  assert.equal(keepBlocks.length, 2, '两条保留项都应仍在补丁层里');
  for (const block of keepBlocks) assert.ok(!/disabled\s*:\s*true/.test(block), '保留项被写成了 disabled: ' + block);
});

test('纯函数：不改入参文本', () => {
  const before = PATCH;
  disableCompanionsForSafeMode(PATCH, PLUGINS);
  assert.equal(PATCH, before);
  assert.equal(typeof PATCH, 'string');
});

test('幂等：已停用的再跑一遍不产生新变更', () => {
  const once = disableCompanionsForSafeMode(PATCH, PLUGINS);
  const twice = disableCompanionsForSafeMode(once.patch, PLUGINS);
  assert.equal(twice.patch, once.patch);
  assert.deepEqual(twice.disabled, []);
  assert.deepEqual(twice.unchanged.sort(), ['better-sidebar', 'pocket']);
});

test('自定义 keep 生效（保留集合可被调用方覆盖）', () => {
  const r = disableCompanionsForSafeMode(PATCH, PLUGINS, ['pocket']);
  assert.deepEqual(r.kept, ['pocket']);
  assert.ok(r.disabled.includes('dsh-builtin-manager'), '覆盖 keep 后管理页也应被停用');
});

test('脏清单容错：缺 id / 非对象条目跳过而不抛', () => {
  const r = disableCompanionsForSafeMode(PATCH, [{}, null, { id: '' }, { id: 'pocket' }]);
  assert.deepEqual(r.disabled, ['pocket']);
  assert.doesNotThrow(() => disableCompanionsForSafeMode('', PLUGINS));
});

test('接线顺序：安全模式补丁 → 写盘 → 消费标记（顺序反了就丢自救机会）', () => {
  assert.ok(syncSrc.includes("require('./lib/safe-mode')"), 'sync 脚本必须接线 safe-mode');
  const applyAt = syncSrc.indexOf('disableCompanionsForSafeMode(patch, COMPANION_PLUGINS)');
  const writeAt = syncSrc.indexOf('writeFileAtomic(patchFile, patch)');
  const clearAt = syncSrc.indexOf('clearSafeModeFlag(home)');
  assert.ok(applyAt > 0, '必须调用 disableCompanionsForSafeMode');
  assert.ok(writeAt > 0, '必须存在补丁层写盘点');
  assert.ok(clearAt > 0, '必须消费安全模式标记');
  assert.ok(applyAt < writeAt, '安全模式补丁必须早于写盘');
  assert.ok(clearAt > writeAt, '标记消费必须晚于写盘（写盘失败时保留标记）');
});

test('dry-run 不落盘、不消费标记', () => {
  const guardStart = syncSrc.indexOf('if (safeMode.enabled) {', syncSrc.indexOf('clearSafeModeFlag(home)') - 600);
  const seg = syncSrc.slice(guardStart, guardStart + 700);
  assert.match(seg, /if \(dryRun\)/, 'dry-run 分支必须存在');
  const dryAt = seg.indexOf('dry-run:');
  const clearAt = seg.indexOf('clearSafeModeFlag(home)');
  assert.ok(dryAt > 0 && dryAt < clearAt, 'dry-run 必须挡在 clearSafeModeFlag 之前');
});

test('测试自身不碰真实 home（隔离哨兵）', () => {
  // 所有落盘操作都走 tmpHome()（mkdtemp 在系统临时目录）；这里断言本文件没有
  // 直接拼用户 home，防止后续改动把夹具指向真实 ~/.dsh。
  const self = fs.readFileSync(__filename, 'utf8');
  assert.ok(!/homedir\(\)/.test(self), '禁止在测试里读真实 homedir');
  assert.ok(tauriRoot.length > 0);
});
