'use strict';

// unit-compat-companion.test.js — scripts/lib/companion-profile.js 的兼容修复回归：
//   · KNOWN_COMPANION_DIR_NAMES 白名单 + expectedDirs 排除（当前配套目录绝不清理；
//     只有命中白名单且 private + description 含 "DSH Desktop" 的历史目录才清理）；
//   · syncCompanionFiles 零写入幂等（第二次用相同源不重新复制）；
//   · keep-newer-version 分支（dest 版本 > assets 版本 → 跳过复制 + bundleNames 仍加入）。
// 运行：node --test scripts/test/unit-compat-companion.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  KNOWN_COMPANION_DIR_NAMES,
  removeStaleCompanionPlugins,
  syncCompanionFiles,
} = require('../lib/companion-profile');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-compat-companion-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  return file;
}

// ---------------------------------------------------------------------------
// KNOWN_COMPANION_DIR_NAMES 白名单
// ---------------------------------------------------------------------------

test('KNOWN_COMPANION_DIR_NAMES: 含当前配套目录与历史退役目录，不含用户包', () => {
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('dsh-balance'), '当前配套目录名应在白名单');
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('dsh-better-sidebar'), '非 scope 当前配套目录名应在白名单');
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('zat-dsh-engine'), '历史退役目录应在白名单');
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('dsh-plugin-marketplace'), '旧插件市场目录应在白名单');
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('dsh-terminal'), '历史改名目录应在白名单');
  assert.ok(KNOWN_COMPANION_DIR_NAMES.has('dsh-prompt'), '历史改名目录应在白名单');
  assert.ok(!KNOWN_COMPANION_DIR_NAMES.has('user-random-plugin'), '用户自装目录不得进白名单');
});

// ---------------------------------------------------------------------------
// removeStaleCompanionPlugins 白名单 + 三重判定 + expectedDirs 排除
// ---------------------------------------------------------------------------

test('removeStaleCompanionPlugins: 仅白名单 + private + 描述三重判定才清理', (t) => {
  const scanDir = tmpdir(t);
  const make = (name, pkg) => writeJson(path.join(scanDir, name, 'package.json'), pkg);
  make('zat-dsh-engine', { name: 'zat-dsh-engine', private: true, description: 'DSH Desktop builtin marketplace' });
  make('not-whitelisted', { name: 'not-whitelisted', private: true, description: 'DSH Desktop user copy' });
  make('dsh-terminal', { name: 'dsh-terminal', private: true, description: 'some other description' });
  make('dsh-plugin-marketplace', { name: 'dsh-plugin-marketplace', private: false, description: 'DSH Desktop legacy' });

  const cleaned = removeStaleCompanionPlugins(scanDir, { expectedDirs: new Set(), log: () => {} });
  assert.equal(cleaned, 1, '只有命中白名单 + private + 描述三重判定的目录才清理');
  assert.ok(!fs.existsSync(path.join(scanDir, 'zat-dsh-engine')), '历史白名单目录应被清理');
  assert.ok(fs.existsSync(path.join(scanDir, 'not-whitelisted')), '白名单之外的目录绝不清理（即使 private + 描述匹配）');
  assert.ok(fs.existsSync(path.join(scanDir, 'dsh-terminal')), '描述不匹配绝不清理');
  assert.ok(fs.existsSync(path.join(scanDir, 'dsh-plugin-marketplace')), '非 private 绝不清理');
});

test('removeStaleCompanionPlugins: expectedDirs 排除当前配套目录（绝不清理当前插件）', (t) => {
  const scanDir = tmpdir(t);
  writeJson(path.join(scanDir, 'dsh-balance', 'package.json'),
    { name: '@deepseek-ai/dsh-balance', private: true, description: 'DSH Desktop companion' });

  // 命中 expectedDirs：当前配套目录，绝不清理（修复「每次同步误删当前插件 → 删除重拷」回归）
  const cleaned0 = removeStaleCompanionPlugins(scanDir, { expectedDirs: new Set(['dsh-balance']), log: () => {} });
  assert.equal(cleaned0, 0, '当前配套目录命中 expectedDirs 时绝不清理');
  assert.ok(fs.existsSync(path.join(scanDir, 'dsh-balance')), '当前配套目录必须保留');

  // 不命中 expectedDirs（历史场景）：同名目录按过期清理
  const cleaned1 = removeStaleCompanionPlugins(scanDir, { expectedDirs: new Set(), log: () => {} });
  assert.equal(cleaned1, 1, '非当前配套目录的历史残留应按过期清理');
  assert.ok(!fs.existsSync(path.join(scanDir, 'dsh-balance')));
});

test('removeStaleCompanionPlugins: dry-run 只计划不落盘', (t) => {
  const scanDir = tmpdir(t);
  writeJson(path.join(scanDir, 'zat-dsh-engine', 'package.json'),
    { name: 'zat-dsh-engine', private: true, description: 'DSH Desktop legacy' });
  const plans = [];
  const cleaned = removeStaleCompanionPlugins(scanDir, { dryRun: true, expectedDirs: new Set(), plan: (m) => plans.push(m) });
  assert.equal(cleaned, 0, 'dry-run 不得实际清理');
  assert.ok(fs.existsSync(path.join(scanDir, 'zat-dsh-engine')), 'dry-run 目录保留');
  assert.ok(plans.some((m) => m.includes('dry-run: 将清理过期配套插件 zat-dsh-engine')));
});

// ---------------------------------------------------------------------------
// syncCompanionFiles 零写入幂等 + keep-newer-version
// ---------------------------------------------------------------------------

/** 构造一个可装配的 bundle 包目录（供 verifyBundleDir 通过）。 */
function writeBundleAsset(assetsRoot, dirName, name, version) {
  const dir = path.join(assetsRoot, dirName);
  writeJson(path.join(dir, 'package.json'), {
    name,
    version,
    main: 'lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export {};\n');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '- id: ' + name.replace(/[^A-Za-z0-9_.-]/g, '-') + '\n  name: \'' + name + '\'\n');
  return dir;
}

function snapshotTree(root) {
  const map = new Map();
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const st = fs.statSync(full);
        map.set(path.relative(root, full), st.size + ':' + st.mtimeMs);
      }
    }
  };
  walk(root);
  return map;
}

function makeSyncOpts(t) {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  const assetsRoot = path.join(home, 'assets');
  const vendorRoot = path.join(home, 'vendor');
  fs.mkdirSync(assetsRoot, { recursive: true });
  fs.mkdirSync(vendorRoot, { recursive: true });
  const plugins = [
    { id: 'alpha', name: '@scope/alpha' },
    { id: 'beta', name: 'beta' },
  ];
  writeBundleAsset(assetsRoot, 'alpha', '@scope/alpha', '1.0.0');
  writeJson(path.join(assetsRoot, 'beta', 'package.json'), { name: 'beta', version: '1.0.0' });
  return { home, profileDir, assetsRoot, vendorRoot, plugins };
}

test('syncCompanionFiles: 二次同步零写入（相同源不重新复制）', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  const opts = () => ({
    plugins,
    assetsRoot,
    profileDir,
    vendorRoot,
    removedIds: new Set(),
    log: () => {},
    fail: () => {},
    onMissingSource: () => {},
    onCopyFail: () => {},
    onVerifyFail: () => {},
    onInstalled: () => {},
    onVendorSynced: () => {},
    plan: () => {},
    dryRun: false,
  });

  const r1 = syncCompanionFiles(opts());
  assert.ok(r1.bundleNames.has('@scope/alpha'), 'bundle 插件应进入 bundleNames');
  assert.ok(!r1.bundleNames.has('beta'), '非 bundle 插件不得进入 bundleNames');
  assert.ok(fs.existsSync(path.join(profileDir, 'node_modules', '@scope', 'alpha', 'package.json')));

  const before = snapshotTree(profileDir);
  const r2 = syncCompanionFiles(opts());
  const after = snapshotTree(profileDir);
  assert.ok(r2.bundleNames.has('@scope/alpha'));
  assert.deepEqual(after, before, '二次同步必须零写入（全树 size:mtime 逐文件一致）');
});

test('syncCompanionFiles: keep-newer-version 分支（dest 版本更高 → 跳过复制 + bundleNames 仍加入）', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  // 预置 dest 更高版本
  const destDir = path.join(profileDir, 'node_modules', '@scope', 'alpha');
  writeJson(path.join(destDir, 'package.json'), {
    name: '@scope/alpha',
    version: '2.0.0',
    main: 'lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  const logs = [];
  const r = syncCompanionFiles({
    plugins,
    assetsRoot,
    profileDir,
    vendorRoot,
    removedIds: new Set(),
    log: (m) => logs.push(m),
    fail: () => {},
    onMissingSource: () => {},
    onCopyFail: () => {},
    onVerifyFail: () => {},
    onInstalled: () => {},
    onVendorSynced: () => {},
    plan: () => {},
    dryRun: false,
  });
  const destPkg = JSON.parse(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8'));
  assert.equal(destPkg.version, '2.0.0', '更新版本必须保留，不被安装包版本覆盖');
  assert.ok(r.bundleNames.has('@scope/alpha'), 'keep-newer 分支仍须把 bundle 加入 bundleNames（manifest 登记不缺失）');
  assert.ok(logs.some((m) => m.includes('保留更新版本')), '应有保留更新版本诊断日志');
});

// ---------------------------------------------------------------------------
// keep-newer 分支的缺失运行资产补齐（手机端「GUI 资产缺失」自愈，v0.4.2）
// ---------------------------------------------------------------------------

/** 给 bundle 资产目录补上 gui/ 快照与 node_modules 依赖树（heal 测试夹具）。 */
function addGuiTreeToAsset(assetsRoot, dirName) {
  const dir = path.join(assetsRoot, dirName);
  fs.mkdirSync(path.join(dir, 'gui', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'gui', 'dist', 'index.html'), '<html>gui-1.4.2</html>');
  fs.writeFileSync(path.join(dir, 'gui', 'manifest.json'), '{"rev":"r142"}');
  fs.mkdirSync(path.join(dir, 'gui', 'bundles', 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'gui', 'bundles', 'alpha', 'client.js'), 'export {}');
  fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'x.js'), 'module.exports = 1;');
  return dir;
}

function syncOpts(plugins, assetsRoot, profileDir, vendorRoot, logs) {
  return {
    plugins,
    assetsRoot,
    profileDir,
    vendorRoot,
    removedIds: new Set(),
    log: (m) => logs.push(m),
    fail: () => {},
    onMissingSource: () => {},
    onCopyFail: () => {},
    onVerifyFail: () => {},
    onInstalled: () => {},
    onVendorSynced: () => {},
    plan: () => {},
    dryRun: false,
  };
}

test('syncCompanionFiles: keep-newer 且缺 gui/ → 从安装包补齐，不覆盖新版本文件', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  addGuiTreeToAsset(assetsRoot, 'alpha');
  // 预置「更新但 gui-less」的安装（上游 npm/GitHub 分发包不带构建产物的形态）
  const destDir = path.join(profileDir, 'node_modules', '@scope', 'alpha');
  writeJson(path.join(destDir, 'package.json'), {
    name: '@scope/alpha',
    version: '2.0.0',
    main: 'lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  fs.mkdirSync(path.join(destDir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'lib', 'index.js'), '// newer 2.0.0 code\n');
  const logs = [];
  const r = syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, logs));
  assert.equal(
    fs.readFileSync(path.join(destDir, 'package.json'), 'utf8').includes('"version": "2.0.0"'),
    true, '新版本 package.json 必须保留',
  );
  assert.equal(fs.readFileSync(path.join(destDir, 'lib', 'index.js'), 'utf8'), '// newer 2.0.0 code\n', '新版本 lib 代码不得被覆盖');
  assert.equal(fs.readFileSync(path.join(destDir, 'gui', 'dist', 'index.html'), 'utf8'), '<html>gui-1.4.2</html>', '缺失的 gui/dist 应从安装包补齐');
  assert.ok(fs.existsSync(path.join(destDir, 'gui', 'manifest.json')), '缺失的 gui/manifest.json 应补齐');
  assert.ok(fs.existsSync(path.join(destDir, 'gui', 'bundles', 'alpha', 'client.js')), '缺失的 gui/bundles 应补齐');
  assert.ok(!fs.existsSync(path.join(destDir, 'node_modules')), '不得向更新版注入安装包的旧依赖树（require 解析顺序会优先命中旧实现）');
  assert.ok(r.bundleNames.has('@scope/alpha'), '补齐路径 bundleNames 不缺失');
  assert.ok(logs.some((m) => m.includes('gui') && m.includes('补齐')), '应有资产补齐诊断日志');
});

test('syncCompanionFiles: keep-newer 且 gui/ 已存在（半残）→ 不触碰既有目录', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  addGuiTreeToAsset(assetsRoot, 'alpha');
  const destDir = path.join(profileDir, 'node_modules', '@scope', 'alpha');
  writeJson(path.join(destDir, 'package.json'), {
    name: '@scope/alpha',
    version: '2.0.0',
    main: 'lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  // 半残形态：gui/ 存在但只有用户/上游写入的 stale 文件
  fs.mkdirSync(path.join(destDir, 'gui', 'bundles'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'gui', 'bundles', 'stale.txt'), 'stale');
  syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, []));
  assert.equal(fs.readFileSync(path.join(destDir, 'gui', 'bundles', 'stale.txt'), 'utf8'), 'stale', '既有文件不得被覆盖');
  assert.ok(!fs.existsSync(path.join(destDir, 'gui', 'dist')), '目录已存在时不做增量注入（只补整目录缺失，避免新旧混排）');
});

test('syncCompanionFiles: 正常全量同步仍复制 gui/ 与 shipsNodeModules 的 node_modules/', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  addGuiTreeToAsset(assetsRoot, 'alpha');
  // node_modules/ 只随标志分发：本用例锁「带标志正件 → 全量同步照常复制」。
  plugins[0].shipsNodeModules = true;
  syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, []));
  const destDir = path.join(profileDir, 'node_modules', '@scope', 'alpha');
  assert.ok(fs.existsSync(path.join(destDir, 'gui', 'dist', 'index.html')), '全量同步必须复制 gui/');
  assert.ok(fs.existsSync(path.join(destDir, 'node_modules', 'dep', 'x.js')),
    'shipsNodeModules 正件的 node_modules 随全量同步分发');
});

test('syncCompanionFiles: 未标 shipsNodeModules 的插件不同步 node_modules（残留防线）', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  // 模拟 dev 树上 pnpm install 出的残留（无标志插件的 node_modules）
  fs.mkdirSync(path.join(assetsRoot, 'beta', 'node_modules', 'junk'), { recursive: true });
  fs.writeFileSync(path.join(assetsRoot, 'beta', 'node_modules', 'junk', 'x.js'), 'residue');
  syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, []));
  assert.ok(!fs.existsSync(path.join(profileDir, 'node_modules', 'beta', 'node_modules')),
    '无标志插件的 node_modules 视为本机残留，绝不同步');
});

test('syncCompanionFiles: keep-newer 且依赖缺失 → 内层补齐（issue #125 自愈）', (t) => {
  const { profileDir, assetsRoot, vendorRoot, plugins } = makeSyncOpts(t);
  const dir = path.join(assetsRoot, 'alpha');
  // 资产侧带内层依赖（模拟 billion-context-dsh 的 node_modules/acp-kernel）
  fs.mkdirSync(path.join(dir, 'node_modules', 'acp-kernel'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'acp-kernel', 'package.json'), '{"name":"acp-kernel","version":"0.0.24"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'acp-kernel', 'index.js'), 'module.exports=1;');
  // 预置「更新但缺依赖」的 profile 安装（插件中心 npm 更新后的形态）
  const destDir = path.join(profileDir, 'node_modules', '@scope', 'alpha');
  writeJson(path.join(destDir, 'package.json'), {
    name: '@scope/alpha', version: '2.0.0', main: 'lib/index.js',
    dependencies: { 'acp-kernel': '0.0.24' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  fs.mkdirSync(path.join(destDir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'lib', 'index.js'), '// newer\n');
  const logs = [];
  syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, logs));
  assert.ok(fs.existsSync(path.join(destDir, 'node_modules', 'acp-kernel', 'package.json')), '缺失依赖应从安装包内层补齐');
  assert.equal(fs.readFileSync(path.join(destDir, 'lib', 'index.js'), 'utf8'), '// newer\n', '更新版代码不被覆盖');
  assert.ok(logs.some((m) => m.includes('acp-kernel') && m.includes('补齐')), '应有依赖补齐日志');
  // 已有依赖（无论内层/顶层）绝不覆盖
  fs.writeFileSync(path.join(destDir, 'node_modules', 'acp-kernel', 'package.json'), '{"name":"acp-kernel","version":"9.9.9","marker":"keep"}');
  syncCompanionFiles(syncOpts(plugins, assetsRoot, profileDir, vendorRoot, []));
  assert.equal(JSON.parse(fs.readFileSync(path.join(destDir, 'node_modules', 'acp-kernel', 'package.json'), 'utf8')).marker, 'keep', '已有版本绝不覆盖');
});
