'use strict';

// profile-bundle-heal 单元测试：纯函数（bundlePatchRel / bundleEntryOf /
// verifyBundleDir / packageDirUpward / writeFileAtomic）与两个源码变换
// （app-boot / profile-boot）的幂等性、锚点匹配与语法有效性。变换针对
// vendored dsh built 文件（只读）；产出写入临时 .mjs 用 node --check 验证。
//
// 注意：集成测试（真实 Electron 启动）会把这些防护实际应用到 node_modules，
// 因此本测试对「文件已注入」与「文件未注入」两种状态都给出有意义断言：
// 未注入 → 变换必须命中锚点并产出合法语法；已注入 → 变换必须识别标记并
// 原样返回（幂等）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  PROFILE_BUNDLE_GUARD_MARKER,
  PROFILE_BOOT_GUARD_MARKER,
  bundlePatchRel,
  bundleEntryOf,
  verifyBundleDir,
  packageDirUpward,
  scanProfileBundles,
  recoverManifestBundles,
  writeFileAtomic,
  applyAppBootBundleGuard,
  applyProfileBootBundleGuard,
} = require('../../profile-bundle-heal');

const repoRoot = path.resolve(__dirname, '..', '..');
const appBootFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');
const profileBootFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'profile-boot-DG5t9aNs.js');

function syntaxCheck(name, src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbg-unit-'));
  const file = path.join(dir, name + '.mjs');
  fs.writeFileSync(file, src, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function tmpFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbg-fix-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
  return dir;
}

test('bundlePatchRel: 只接受非空字符串 patch 声明', () => {
  assert.equal(bundlePatchRel({ dsh: { bundle: { patch: './cordis.patch.yml' } } }), './cordis.patch.yml');
  assert.equal(bundlePatchRel({ dsh: { bundle: { client: './lib/client.js' } } }), '');
  assert.equal(bundlePatchRel({ dsh: { bundle: {} } }), '');
  assert.equal(bundlePatchRel({}), '');
  assert.equal(bundlePatchRel(null), '');
  assert.equal(bundlePatchRel({ dsh: { bundle: { patch: 123 } } }), '');
  assert.equal(bundlePatchRel({ dsh: { bundle: { patch: '' } } }), '');
  assert.equal(bundlePatchRel({ dsh: { bundle: { patch: '   ' } } }), '');
});

test('bundleEntryOf: exports["."] 优先，其次 main', () => {
  assert.equal(bundleEntryOf({ exports: { '.': './dist/index.js' } }), './dist/index.js');
  assert.equal(bundleEntryOf({ exports: { '.': { import: './dist/index.js' } } }), './dist/index.js');
  assert.equal(bundleEntryOf({ exports: { '.': { default: './dist/index.js' } } }), './dist/index.js');
  assert.equal(bundleEntryOf({ exports: { '.': { types: './dist/index.d.ts' } }, main: './dist/index.js' }), '', 'exports["."] 无 import/default 时 Node 无法 import 该包，入口判定为空');
  assert.equal(bundleEntryOf({ exports: ['./dist/index.js'] }), '');
  assert.equal(bundleEntryOf({ main: './lib/index.js' }), './lib/index.js');
  assert.equal(bundleEntryOf({}), '');
  assert.equal(bundleEntryOf(null), '');
});

test('verifyBundleDir: 健康目录通过，缺失/损坏逐项拒绝', () => {
  const ok = tmpFixture({
    'package.json': JSON.stringify({ name: 'x', main: 'dist/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'cordis.patch.yml': '[]\n',
    'dist/index.js': 'export {};\n',
  });
  assert.deepEqual(verifyBundleDir(ok), { ok: true, reason: '' });

  const noPatchFile = tmpFixture({
    'package.json': JSON.stringify({ name: 'x', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
  });
  const r1 = verifyBundleDir(noPatchFile);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /补丁层缺失/);

  const noEntry = tmpFixture({
    'package.json': JSON.stringify({ name: 'x', main: 'dist/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'cordis.patch.yml': '[]\n',
  });
  const r2 = verifyBundleDir(noEntry);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /入口文件缺失/);

  const noDecl = tmpFixture({
    'package.json': JSON.stringify({ name: 'x', main: 'dist/index.js' }),
  });
  const r3 = verifyBundleDir(noDecl);
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /未声明 dsh\.bundle\.patch/);

  const badJson = tmpFixture({ 'package.json': '{"name": "x", BAD' });
  const r4 = verifyBundleDir(badJson);
  assert.equal(r4.ok, false);
  assert.match(r4.reason, /不可读或不是合法 JSON/);
});

test('packageDirUpward: 沿 node_modules 父目录链解析，未找到返回空串', () => {
  const base = tmpFixture({
    'node_modules/@scope/pkg/package.json': '{}',
  });
  assert.equal(packageDirUpward(path.join(base, 'a', 'b', 'c'), '@scope/pkg'), path.join(base, 'node_modules', '@scope', 'pkg'));
  assert.equal(packageDirUpward(path.join(base, 'a'), 'missing-pkg'), '');
});

test('writeFileAtomic: 落盘内容正确且不留 .tmp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbg-wa-'));
  const file = path.join(dir, 'package.json');
  writeFileAtomic(file, '{"a":1}\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}\n');
  assert.equal(fs.existsSync(file + '.tmp'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scanProfileBundles: 只返回可装配的第三方 bundle，排除核心/配套/普通依赖/损坏包', () => {
  const base = tmpFixture({
    'node_modules/@dsh-external/tavily/package.json': JSON.stringify({ name: '@dsh-external/tavily', version: '1.2.3', main: 'lib/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'node_modules/@dsh-external/tavily/cordis.patch.yml': '[]\n',
    'node_modules/@dsh-external/tavily/lib/index.js': 'export {};\n',
    'node_modules/@deepseek-ai/dsh-base/package.json': JSON.stringify({ name: '@deepseek-ai/dsh-base', version: '1.0.0', main: 'lib/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml': '[]\n',
    'node_modules/@deepseek-ai/dsh-base/lib/index.js': 'export {};\n',
    'node_modules/plain-lib/package.json': JSON.stringify({ name: 'plain-lib', version: '1.0.0' }),
    // 声明了 dsh.bundle 但补丁层/入口缺失：不得恢复登记
    'node_modules/broken-bundle/package.json': JSON.stringify({ name: 'broken-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'node_modules/bad-json/package.json': '{BAD',
  });
  const found = scanProfileBundles(path.join(base, 'node_modules'), new Set(['@deepseek-ai/dsh-base']));
  assert.deepEqual(found, [{ name: '@dsh-external/tavily', version: '1.2.3' }]);
  assert.deepEqual(scanProfileBundles(path.join(base, 'missing'), new Set()), []);
});

test('recoverManifestBundles: 追加缺失登记并补回 dependencies，保留既有顺序与内容', () => {
  const manifest = { name: 'dsh-profile-web', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@dsh-external/tavily'] } } };
  const recovered = recoverManifestBundles(manifest, [
    { name: '@dsh-external/tavily', version: '1.2.3' },
    { name: 'other-bundle', version: '2.0.0' },
  ]);
  assert.deepEqual(recovered, ['other-bundle']);
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@dsh-external/tavily', 'other-bundle']);
  assert.deepEqual(manifest.dependencies, { 'other-bundle': '2.0.0' });

  const m2 = { dsh: { profile: { bundles: [] } }, dependencies: { x: '' } };
  assert.deepEqual(recoverManifestBundles(m2, [{ name: 'x', version: '3.0.0' }]), ['x']);
  assert.deepEqual(m2.dependencies, { x: '3.0.0' });
  assert.deepEqual(m2.dsh.profile.bundles, ['x']);

  const m3 = { dsh: { profile: { bundles: ['a'] } }, dependencies: { a: '^1.0.0' } };
  assert.deepEqual(recoverManifestBundles(m3, [{ name: 'a', version: '9.9.9' }]), []);
  assert.deepEqual(m3.dependencies, { a: '^1.0.0' }, '既有依赖版本不得覆盖');
});

// 变换锚点合成源（必须与 profile-bundle-heal.js 内的锚点字节一致）。
const SYNTHETIC_APP_LAYERS = [
  '\tconst layers = (normalizeShippedProfile(name, dir, readProfileManifest(binName, dir)).dsh?.profile?.bundles ?? []).map((packageName) => {',
  '\t\tconst packageDir = resolveBundleDir(binName, packageName, installAnchor, dir);',
  '\t\tconst declared = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).dsh?.bundle?.patch;',
  '\t\tif (declared === void 0) throw new Error(`' + '${binName}: profile bundle ${JSON.stringify(packageName)} declares no dsh.bundle in its package.json`' + ');',
  '\t\tconst patchPath = join(packageDir, declared);',
  '\t\treturn {',
  '\t\t\tpackageName,',
  '\t\t\tpackageDir,',
  '\t\t\tpatchPath,',
  '\t\t\tpatches: loadOverlayPatches(binName, patchPath)',
  '\t\t};',
  '\t});',
].join('\n');
const SYNTHETIC_APP_INSERT = 'function composeEntries(layers, warn = () => {}) {';

test('applyAppBootBundleGuard: 合成源命中锚点并替换', () => {
  const src = 'export const x = 1;\n' + SYNTHETIC_APP_LAYERS + '\n' + SYNTHETIC_APP_INSERT + '\n  return null;\n}';
  const out = applyAppBootBundleGuard(src);
  assert.equal(out.changed, true);
  assert.ok(out.src.includes(PROFILE_BUNDLE_GUARD_MARKER), '应写入幂等标记');
  assert.ok(out.src.includes('function loadProfileLayers(binName, name, dir, installAnchor)'), '应注入自愈装配');
  assert.ok(out.src.includes('\tconst layers = loadProfileLayers(binName, name, dir, installAnchor);'), '调用点应替换');
  assert.ok(!out.src.includes(SYNTHETIC_APP_LAYERS), '严格装配代码块应整体移除');
  const again = applyAppBootBundleGuard(out.src);
  assert.equal(again.changed, false, '二次应用应为幂等空操作');
  assert.equal(again.src, out.src);
});

test('applyAppBootBundleGuard: 锚点缺失时原样返回', () => {
  const src = 'export const x = 1;\nfunction composeEntries(layers, warn = () => {}) {\n  return null;\n}';
  assert.deepEqual(applyAppBootBundleGuard(src), { changed: false, src });
  assert.deepEqual(applyAppBootBundleGuard(''), { changed: false, src: '' });
  assert.deepEqual(applyAppBootBundleGuard(null), { changed: false, src: null });
});

test('applyAppBootBundleGuard: 真实 vendored 文件（两种状态均成立）', () => {
  const src = fs.readFileSync(appBootFile, 'utf8');
  const out = applyAppBootBundleGuard(src);
  if (src.includes(PROFILE_BUNDLE_GUARD_MARKER)) {
    // 已被集成测试应用过：必须识别标记并不再改写。
    assert.equal(out.changed, false);
    assert.equal(out.src, src);
  } else {
    // 未被应用：必须命中锚点、产出合法 ESM 且二次应用幂等。
    assert.equal(out.changed, true, 'vendored app-boot 锚点应命中（dsh 版本变更时需同步更新锚点）');
    assert.ok(out.src.includes('function loadProfileLayers'));
    syntaxCheck('app-boot', out.src);
    assert.equal(applyAppBootBundleGuard(out.src).changed, false);
  }
});

test('applyProfileBootBundleGuard: 合成源命中全部调用点并替换', () => {
  const src = [
    'import { writeFileSync } from "node:fs";',
    'const NAME = "dsh";',
    '\tconst homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? [];',
    '\t\t...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],',
    '\t\t...loadOptionalPatches(NAME, homePatchPath()) ?? [],',
    'export { resolveTelemetryPatch as a, prepareProfile as i, PROFILE_ROOT_FILENAME as n, runProfile as o, homePatchPath as r, INSTALL_ANCHOR as t };',
  ].join('\n');
  const out = applyProfileBootBundleGuard(src);
  assert.equal(out.changed, true);
  assert.ok(out.src.includes(PROFILE_BOOT_GUARD_MARKER), '应写入幂等标记');
  assert.ok(out.src.includes('function loadUserPatchLayerSafe(binName, file)'), '应注入自愈加载');
  assert.ok(out.src.includes('import { readFileSync, writeFileSync } from "node:fs";'), 'import 应扩展');
  assert.ok(out.src.includes('\tconst homePatches = loadUserPatchLayerSafe(NAME, homePatchPath());'), 'composeProfile 调用点应替换');
  assert.ok(out.src.includes('\t\t...loadUserPatchLayerSafe(NAME, composed.profile.patchPath),'), 'HMR profile 层调用点应替换');
  assert.ok(out.src.includes('\t\t...loadUserPatchLayerSafe(NAME, homePatchPath()),'), 'HMR 家级层调用点应替换');
  assert.ok(out.src.includes('export { resolveTelemetryPatch as a, prepareProfile as i, PROFILE_ROOT_FILENAME as n, runProfile as o, homePatchPath as r, INSTALL_ANCHOR as t };'), '原导出应保留');
  assert.ok(!out.src.includes('loadOptionalPatches(NAME, homePatchPath()) ?? []'), '严格加载应移除');
  assert.equal(applyProfileBootBundleGuard(out.src).changed, false, '二次应用应为幂等空操作');
});

test('applyProfileBootBundleGuard: 任一锚点缺失时原样返回', () => {
  const src = 'export const x = 1;';
  assert.deepEqual(applyProfileBootBundleGuard(src), { changed: false, src });
  assert.deepEqual(applyProfileBootBundleGuard(null), { changed: false, src: null });
});

test('applyProfileBootBundleGuard: 真实 vendored 文件（两种状态均成立）', () => {
  const src = fs.readFileSync(profileBootFile, 'utf8');
  const out = applyProfileBootBundleGuard(src);
  if (src.includes(PROFILE_BOOT_GUARD_MARKER)) {
    assert.equal(out.changed, false);
    assert.equal(out.src, src);
  } else {
    assert.equal(out.changed, true, 'vendored profile-boot 锚点应命中（dsh 版本变更时需同步更新锚点）');
    assert.ok(out.src.includes('function loadUserPatchLayerSafe'));
    syntaxCheck('profile-boot', out.src);
    assert.equal(applyProfileBootBundleGuard(out.src).changed, false);
  }
});
