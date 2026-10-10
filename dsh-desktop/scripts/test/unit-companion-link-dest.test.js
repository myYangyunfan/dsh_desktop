'use strict';

// unit-companion-link-dest.test.js —— 伴随插件同步「链接落点」自愈回归锁
// （node --test）。
//
// 背景（mac 端启动 toast「未能保存设置，请重试」根因）：profile 的
// node_modules/@deepseek-ai/schemastery 是旧装配期留下的 symlink/junction
// 落点（指向残缺副本或悬空）。rc.2 解析路由对 profile 内候选 statSync 命中即
// native 直达、无可用性回退 → 该副本修不好则一切依赖方加载失败：设置服务
// （@deepseek-ai/dsh-settings 依赖 schemastery）缺席 → 前台保存失败 toast，
// 且 9 个依赖 schemastery 的伴随插件全部 "failed to load — auto-isolated"。
// 旧版 syncDir 把目录写进链接落点会抛 ERR_FS_CP_DIR_TO_NON_DIR 且被吞进日志
// （boot 通道日志不落 desktop.log）→ 链接落点永远无法自愈，重启与重试都无效。
//
// 本文件锁四类修复行为：
//   1. VENDOR_DEPS 落点为陈旧/悬空链接 → 同步摘链、按真实目录重建、内容对齐
//      （含「未经摘链的 cpSync 必然拒绝链接落点」反证）；
//   2. 链接落点内容与源逐文件一致 → 保留链接（零写入幂等边界，守卫不滥杀）；
//   3. 真实目录内含悬空链接（嵌套目录链接形态）→ 复制前清链重建
//      （旧形态下 cpSync 对嵌套悬空 junction 原生崩溃，JS 层不可 catch）；
//   4. 插件落点（含 lib/ 单点、单文件形态）为链接 → 摘链重建，同步全流程照常。
// 运行：node --test scripts/test/unit-companion-link-dest.test.js
// 测试全部在临时目录（DSH_HOME 语义等价）内进行，绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { syncCompanionFiles, syncDir, dirNeedsSync } = require('../lib/companion-profile');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-companion-link-dest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const noops = {
  log: () => {}, fail: () => {}, onMissingSource: () => {}, onCopyFail: () => {},
  onVerifyFail: () => {}, onInstalled: () => {}, onVendorSynced: () => {}, plan: () => {},
};

/** 建目录链接（Windows junction / POSIX dir symlink）。无权限环境返回 false（用例跳过）。 */
function linkDir(target, link) {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

/** 逐字节相同 + mtime 精确相等地拷贝目录（供「内容一致」边界用例）。 */
function copyExact(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      copyExact(s, d);
    } else {
      fs.copyFileSync(s, d);
      const st = fs.statSync(s);
      fs.utimesSync(d, st.atime, st.mtime);
    }
  }
}

/** 造一个 payload 形态的 vendor 包（mac 场景的源侧）。 */
function makeSchemastery(vendorRoot) {
  const dir = path.join(vendorRoot, '@deepseek-ai', 'schemastery');
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'lib', 'index.mjs'), 'export const intact = true;\n');
  return dir;
}

// ---------------------------------------------------------------------------
// 1. mac 场景逐字复现：@deepseek-ai/schemastery 落点 = 链接 → 残缺副本
// ---------------------------------------------------------------------------

test('VENDOR_DEPS 陈旧链接落点（mac schemastery 形态）：同步摘链重建、内容对齐', (t) => {
  const home = tmpdir(t);
  const vendorRoot = path.join(home, 'vendor');
  const profileDir = path.join(home, 'profiles', 'web');
  const srcPkg = makeSchemastery(vendorRoot);
  // 落点现状：链接 → 「残缺副本」（package.json 在、lib/index.mjs 缺——旧构建树形态）
  const staleTarget = path.join(home, 'old-build-tree', 'schemastery');
  fs.mkdirSync(staleTarget, { recursive: true });
  fs.writeFileSync(path.join(staleTarget, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '0.0.9' }));
  const dest = path.join(profileDir, 'node_modules', '@deepseek-ai', 'schemastery');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!linkDir(staleTarget, dest)) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  // 反证（机制证明）：修复前的旧路径即「直接 cpSync 到链接落点」。落点 lstat 非目录
  // → ERR_FS_CP_DIR_TO_NON_DIR，被旧实现吞进日志（boot 通道不落盘 → 双重静默）。
  assert.throws(
    () => fs.cpSync(srcPkg, dest, { recursive: true, force: true, preserveTimestamps: true }),
    (err) => err && err.code === 'ERR_FS_CP_DIR_TO_NON_DIR',
    '反证：未经摘链的 cpSync 必须拒绝把目录写进链接落点（旧实现就此静默失败）',
  );
  assert.ok(fs.lstatSync(dest).isSymbolicLink(), '反证前置：失败后落点仍是链接、内容仍残缺');

  const logs = [];
  syncCompanionFiles({ plugins: [], assetsRoot: path.join(home, 'assets'), profileDir, vendorRoot, removedIds: new Set(), ...noops, log: (m) => logs.push(m) });

  assert.ok(!fs.lstatSync(dest).isSymbolicLink(), '同步后落点必须是真实目录（不能留链接）');
  assert.ok(fs.existsSync(path.join(dest, 'lib', 'index.mjs')), '残缺文件必须被 payload 副本补齐');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.mjs'), 'utf8'), 'export const intact = true;\n');
  assert.ok(logs.some((m) => m.includes('摘链')), '摘链应有日志（可诊断性）');
});

// ---------------------------------------------------------------------------
// 2. 悬空链接落点（目标已删）→ 摘链重建
// ---------------------------------------------------------------------------

test('VENDOR_DEPS 悬空链接落点（目标已删）：同步摘链重建', (t) => {
  const home = tmpdir(t);
  const srcPkg = makeSchemastery(path.join(home, 'vendor'));
  const dest = path.join(home, 'profile', 'node_modules', '@deepseek-ai', 'schemastery');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!linkDir(path.join(home, 'ghost-target'), dest)) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');
  assert.ok(!fs.existsSync(dest), '前置：链接悬空（写穿不可能，旧实现永远修不好）');

  const logs = [];
  syncDir(srcPkg, dest, (m) => logs.push(m));

  assert.ok(!fs.lstatSync(dest).isSymbolicLink(), '摘链后应为真实目录');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.mjs'), 'utf8'), 'export const intact = true;\n');
  assert.ok(logs.some((m) => m.includes('摘链')), '摘链应有日志');
});

// ---------------------------------------------------------------------------
// 3. 边界：链接落点内容与源一致 → 保留链接（守卫不滥杀 + 零写入）
// ---------------------------------------------------------------------------

test('链接落点内容与源逐文件一致：保留链接、不做无谓摘链（零写入边界）', (t) => {
  const home = tmpdir(t);
  const srcPkg = makeSchemastery(path.join(home, 'vendor'));
  const healthyCopy = path.join(home, 'healthy-copy');
  copyExact(srcPkg, healthyCopy);
  const dest = path.join(home, 'profile', 'node_modules', '@deepseek-ai', 'schemastery');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!linkDir(healthyCopy, dest)) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');
  assert.equal(dirNeedsSync(srcPkg, dest), false, '前置：落点内容与源一致（size+mtime 取整相等）');

  const logs = [];
  syncDir(srcPkg, dest, (m) => logs.push(m));

  assert.ok(fs.lstatSync(dest).isSymbolicLink(), '内容一致时保留链接（幂等零写入契约，守卫只在需要重建时摘链）');
  assert.ok(!logs.some((m) => m.includes('摘链')), '内容一致时不得出现摘链日志');
});

// ---------------------------------------------------------------------------
// 4. 真实目录内含悬空子目录链接 → 复制前清链重建
// ---------------------------------------------------------------------------

test('真实目录内悬空子目录链接：复制前清链重建（旧形态 Windows 上 cpSync 原生崩溃）', (t) => {
  const home = tmpdir(t);
  const src = path.join(home, 'src');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), '{}');
  fs.writeFileSync(path.join(src, 'lib', 'a.js'), 'A');
  const dest = path.join(home, 'dest');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'package.json'), '{}');
  // dest/lib 是悬空链接（旧符号链接装配残留）——src 有同名目录条目、落点是坏链接。
  // 实测（node v24.15.0 / Windows）：不经摘链直接 cpSync 会原生崩溃（fail-fast，
  // catch 不到）——本用例能在进程级红，正是该缺陷的回归锁。
  if (!linkDir(path.join(home, 'ghost-lib'), path.join(dest, 'lib'))) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  const logs = [];
  syncDir(src, dest, (m) => logs.push(m));

  assert.ok(!fs.lstatSync(path.join(dest, 'lib')).isSymbolicLink(), '悬空链接必须被清掉并重建为真实目录');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'a.js'), 'utf8'), 'A', '复制后内容必须对齐');
  assert.ok(logs.some((m) => m.includes('链接落点')), '清链应有日志');
});

test('真实目录内非悬空链接：复制前摘链，绝不给链接目标倒文件（旧形态静默写穿污染）', (t) => {
  const home = tmpdir(t);
  const src = path.join(home, 'src');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'lib', 'a.js'), 'A');
  const dest = path.join(home, 'dest');
  fs.mkdirSync(dest, { recursive: true });
  // dest/lib 是指向「旧构建树」的非悬空链接：旧实现会静默写穿——a.js 落到旧树里、
  // profile 仍留链接（rc.2 路由直达链接目标，修的其实是别人家）。
  const oldTree = path.join(home, 'old-tree-lib');
  fs.mkdirSync(oldTree, { recursive: true });
  fs.writeFileSync(path.join(oldTree, 'old.js'), 'OLD');
  if (!linkDir(oldTree, path.join(dest, 'lib'))) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  syncDir(src, dest, () => {});

  assert.ok(!fs.lstatSync(path.join(dest, 'lib')).isSymbolicLink(), '链接必须被摘除并重建为真实目录');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'a.js'), 'utf8'), 'A');
  assert.ok(fs.existsSync(path.join(oldTree, 'old.js')), '旧构建树内容不得被删');
  assert.ok(!fs.existsSync(path.join(oldTree, 'a.js')), '绝不能被写穿：副本文件不得倒进链接目标');
});

test('摘链失败（模拟 EBUSY 锁）时跳过复制：宁可不复制，不让 cpSync 对悬空链接原生崩溃', (t) => {
  const home = tmpdir(t);
  const src = path.join(home, 'src');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'lib', 'a.js'), 'A');
  const dest = path.join(home, 'dest');
  fs.mkdirSync(dest, { recursive: true });
  const destLib = path.join(dest, 'lib');
  if (!linkDir(path.join(home, 'ghost-lib'), destLib)) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  // 反证（机制证明）：模拟杀软/handle 瞬时锁——对该路径的 unlink/rm 全部 EBUSY。
  // 无这道兜底时，残留的悬空链接会让 cpSync 原生崩溃（fail-fast，catch 不到，
  // 整个测试进程会死）；有兜底则跳过复制并落日志，下次启动重试。
  const origUnlink = fs.unlinkSync;
  const origRm = fs.rmSync;
  const isDestLib = (p) => path.resolve(String(p)) === path.resolve(destLib);
  const ebusy = () => { const e = new Error('EBUSY: resource busy or locked (mock)'); e.code = 'EBUSY'; return e; };
  fs.unlinkSync = function (p, ...rest) { if (isDestLib(p)) throw ebusy(); return origUnlink.call(fs, p, ...rest); };
  fs.rmSync = function (p, ...rest) { if (isDestLib(p)) throw ebusy(); return origRm.call(fs, p, ...rest); };
  const logs = [];
  try {
    // 若兜底缺失，这里会进程级崩溃而非抛错——本用例本身就是回归锁。
    syncDir(src, dest, (m) => logs.push(m));
  } finally {
    fs.unlinkSync = origUnlink;
    fs.rmSync = origRm;
  }

  assert.ok(fs.lstatSync(destLib).isSymbolicLink(), '摘除失败后链接保持原样（未被误删）');
  assert.ok(!fs.existsSync(path.join(destLib, 'a.js')), '未向链接目标倒文件');
  assert.ok(logs.some((m) => m.includes('摘除失败') && m.includes('跳过本次复制')), '必须落「跳过复制」日志（可见性防线）');
});

// ---------------------------------------------------------------------------
// 5. 插件落点为链接（scope 形态）→ 摘链重建，同步全流程照常
// ---------------------------------------------------------------------------

test('插件落点为悬空链接（scope 形态）：摘链重建、PLUGIN_FILES 与 onInstalled 照常', (t) => {
  const home = tmpdir(t);
  const assetsRoot = path.join(home, 'assets');
  const profileDir = path.join(home, 'profiles', 'web');
  const src = path.join(assetsRoot, 'companion-lk');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: '@lk-scope/companion-lk', version: '1.0.0' }));
  fs.writeFileSync(path.join(src, 'lib', 'index.js'), 'module.exports = 1;\n');
  const dest = path.join(profileDir, 'node_modules', '@lk-scope', 'companion-lk');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!linkDir(path.join(home, 'ghost-plugin'), dest)) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  const installed = [];
  const logs = [];
  syncCompanionFiles({
    plugins: [{ id: 'lk-scope', name: '@lk-scope/companion-lk' }],
    assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(),
    ...noops, log: (m) => logs.push(m), onInstalled: (n) => installed.push(n),
  });

  assert.ok(!fs.lstatSync(dest).isSymbolicLink(), '插件落点必须是真实目录');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.js'), 'utf8'), 'module.exports = 1;\n');
  assert.deepEqual(installed, ['@lk-scope/companion-lk'], '安装回调照常触发');
  assert.ok(logs.some((m) => m.includes('摘链')), '摘链应有日志');
});

// ---------------------------------------------------------------------------
// 6. 插件落点的 lib/ 单点为悬空链接 → 摘链（旧形态 mkdir 直接抛、同步中断）
// ---------------------------------------------------------------------------

test('插件落点 lib/ 为悬空链接：摘链后重建（旧形态 mkdir 抛出致整段同步中断）', (t) => {
  const home = tmpdir(t);
  const assetsRoot = path.join(home, 'assets');
  const profileDir = path.join(home, 'profiles', 'web');
  const src = path.join(assetsRoot, 'companion-lib');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'companion-lib', version: '1.0.0' }));
  fs.writeFileSync(path.join(src, 'lib', 'index.js'), 'ok\n');
  // 落点已是真实目录（同版本 → 非 keep-newer），但 lib/ 是悬空链接。
  const dest = path.join(profileDir, 'node_modules', 'companion-lib');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ name: 'companion-lib', version: '1.0.0' }));
  if (!linkDir(path.join(home, 'ghost-lib2'), path.join(dest, 'lib'))) return t.skip('当前环境无法创建目录链接（junction/symlink 权限）');

  const logs = [];
  syncCompanionFiles({
    plugins: [{ id: 'companion-lib', name: 'companion-lib' }],
    assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(),
    ...noops, log: (m) => logs.push(m),
  });

  assert.ok(!fs.lstatSync(path.join(dest, 'lib')).isSymbolicLink(), 'lib/ 必须为真实目录');
  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.js'), 'utf8'), 'ok\n');
  assert.ok(logs.some((m) => m.includes('lib/')), 'lib/ 摘链应有日志');
});

// ---------------------------------------------------------------------------
// 7. 单文件落点为悬空链接 → 重试复制成功（POSIX 文件级链接；Windows 无特权
//    环境建不了文件符号链接，junction 仅目录——跳过）
// ---------------------------------------------------------------------------

test('单文件落点悬空链接（PLUGIN_FILES）：摘链重试复制成功、不再走 onCopyFail', (t) => {
  if (process.platform === 'win32') return t.skip('Windows 无特权下无法创建文件级符号链接（junction 仅目录）');
  const home = tmpdir(t);
  const assetsRoot = path.join(home, 'assets');
  const profileDir = path.join(home, 'profiles', 'web');
  const src = path.join(assetsRoot, 'companion-file');
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'companion-file', version: '1.0.0' }));
  fs.writeFileSync(path.join(src, 'lib', 'index.js'), 'recovered\n');
  const dest = path.join(profileDir, 'node_modules', 'companion-file');
  fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ name: 'companion-file', version: '1.0.0' }));
  fs.symlinkSync(path.join(home, 'ghost-file.js'), path.join(dest, 'lib', 'index.js'));

  const failures = [];
  syncCompanionFiles({
    plugins: [{ id: 'companion-file', name: 'companion-file' }],
    assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(),
    ...noops, onCopyFail: (sf, err) => failures.push(`${sf}: ${err.message}`),
  });

  assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.js'), 'utf8'), 'recovered\n', '悬空链接文件必须被副本替换');
  assert.deepEqual(failures, [], '重试成功不应再报告复制失败');
});

// ---------------------------------------------------------------------------
// 8. 守卫不误伤：健康真实目录零写入、无摘链日志
// ---------------------------------------------------------------------------

test('健康真实目录：同步零写入（mtime 不变）、无摘链日志', (t) => {
  const home = tmpdir(t);
  const srcPkg = makeSchemastery(path.join(home, 'vendor'));
  const dest = path.join(home, 'profile', 'node_modules', '@deepseek-ai', 'schemastery');
  copyExact(srcPkg, dest);
  const before = fs.statSync(path.join(dest, 'lib', 'index.mjs')).mtimeMs;

  const logs = [];
  syncDir(srcPkg, dest, (m) => logs.push(m));

  assert.equal(fs.statSync(path.join(dest, 'lib', 'index.mjs')).mtimeMs, before, '零写入契约：内容一致不得触碰落点');
  assert.ok(!logs.some((m) => m.includes('摘链')), '真实目录不触发摘链路径');
});
