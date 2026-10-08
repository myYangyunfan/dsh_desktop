'use strict';

// 单测：scripts/lib/hub-registry.js —— DSH Hotplug Hub（ARFCON/dsh-hotplug-hub）
// 识别适配层。四层验证：
//   1. 适配层自身语义（issue #156 止血：v0.5.3 dependencies 脏数据幂等清理 /
//      不误删用户自装 / hotpack 指针 / 幂等 / 卸载联动 / 元数据校验）；
//   2. 断言级「hub 识别复现」：按 hub 源码（lib/core/state.js listPackIds/
//      readPackManifest、lib/core/status.js statusSync、lib/core/ensure.js
//      ensurePath、packages/shared-core/format/hotpack.js parseHotpack、
//      release/src/Main.cs GetPluginsJson）的扫描与校验逻辑复刻，喂我方布局，
//      断言内置件全部被识别；
//   3. 识别面取舍断言：内置件不再进 profile dependencies（issue #156 毒化
//      pnpm 的写入面已废除）——桌面端 GetPluginsJson 列表仅剩用户自装件；
//   4. 仓库级元数据收口断言：真实 assets/plugins 的 28 个配套件全部通过
//      校验环节（防 dsh-vision 式 version 漂移回归、防覆盖上游时丢 private）；
//   5. 文档账本收口：THIRD_PARTY_NOTICES.md §4.1（含许可列）与 docs/builtin-plugins-inventory.md §一
//      逐名逐版本对 package.json 一致，nm 标记同时锁「磁盘实存 = shipsNodeModules 声明」；
//   6. §5.2 逐插件判定表收口：序号 / loader id / 源目录 / 本机版本 + 「兼容实测」七个数
//      全部本地重放（通道两列要网络，CI 不可重放，这里只咬离线可算的列）；
//   7. 挂载面收口：每条在册件的 loader id 必须命中自己 cordis.patch.yml 的 insert 行，
//      例外只能是显式点名的目录名单（名单本身也被反证咬住）；
//   8. 门面收口：README.md / README.en.md 的插件表逐名逐版本逐许可对 package.json，
//      行序对 COMPANION_PLUGINS，中英两份互相对一次（历史上门面是一张 5 行摘要，与在册清单不同源）。
// 运行：node --test scripts/test/unit-hub-registry.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  HUB_PACK_ID,
  HUB_PLUGIN_ID_RE,
  HUB_EXACT_VERSION_RE,
  inspectCompanionMeta,
  validateCompanionMetadata,
  collectRegistrablePlugins,
  cleanLegacyProfileDependencies,
  buildHotpackPointer,
  syncHotplugPackPointer,
  syncHubRecognition,
} = require('../lib/hub-registry');
const { COMPANION_PLUGINS, companionDirName, RETIRED_COMPANION_DIRS } = require('../lib/companion-plugins');
const { syncCompanionFiles } = require('../lib/companion-profile');

// ---------------------------------------------------------------------------
// hub 契约规则的测试侧复刻（与 hub packages/shared-core 同源；测试不依赖
// hub 仓库，规则变更时以 hub shared-core 为准同步这里）
// ---------------------------------------------------------------------------
const PACK_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const PLUGIN_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** hub lib/core/state.js listPackIds + readPackManifest 复刻。 */
function hubListPacks(home) {
  const packsDir = path.join(home, 'hotplug-hub', 'packs');
  let entries;
  try { entries = fs.readdirSync(packsDir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && PACK_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .map((id) => ({ id, manifest: JSON.parse(fs.readFileSync(path.join(packsDir, id, 'hotpack.json'), 'utf8')) }));
}

/** hub lib/core/status.js statusSync 的插件行复刻（present/cached 判定）。 */
function hubStatusPluginRows(home, pack) {
  return (pack.manifest.plugins ?? []).map((entry) => {
    const dir = entry.source.type === 'path' ? entry.source.path
      : path.join(home, 'hotplug-store', `${entry.name}@${entry.source.ref}`);
    const present = fs.existsSync(path.join(dir, 'package.json'));
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version ?? null,
      source: entry.source.type,
      path: dir,
      cached: entry.source.type === 'npm' ? null : present,
    };
  });
}

/** hub lib/core/ensure.js ensurePath 判定复刻（activate 时的 reused 条件）。 */
function hubEnsurePathOk(entry) {
  const dir = entry.source.path;
  if (!fs.existsSync(path.join(dir, 'package.json'))) return false;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return meta.name === entry.name;
}

/** hub parseHotpack（format/hotpack.js）必检项复刻：形状不合法即 import 失败。 */
function hubParseHotpackShape(pack) {
  assert.strictEqual(pack.hotpack, '1.0', 'hotpack 版本必须是 1.0');
  assert.ok(PACK_ID_RE.test(pack.id), 'pack id 须过 PACK_ID_RE');
  assert.ok(typeof pack.name === 'string' && pack.name.trim(), 'name 必填');
  assert.ok(HUB_EXACT_VERSION_RE.test(pack.version), 'version 须为精确 semver');
  assert.ok(Array.isArray(pack.plugins) && pack.plugins.length > 0, 'plugins 必须非空');
  assert.strictEqual(pack.description.length <= 300, true, 'description ≤300');
  const seenIds = new Set();
  const seenNames = new Set();
  for (const p of pack.plugins) {
    assert.ok(HUB_PLUGIN_ID_RE.test(p.id), '插件 id 须过 hub 规则: ' + p.id);
    assert.ok(PLUGIN_NAME_RE.test(p.name), '插件 name 须为合法 npm 包名: ' + p.name);
    const idKey = p.id.toLowerCase();
    assert.ok(!seenIds.has(idKey), '插件 id 重复: ' + p.id);
    seenIds.add(idKey);
    const nameKey = p.name.toLowerCase();
    assert.ok(!seenNames.has(nameKey), '插件 name 重复: ' + p.name);
    seenNames.add(nameKey);
    assert.strictEqual(p.source.type, 'path');
    const src = p.source.path;
    assert.ok(path.isAbsolute(src) || /^[a-zA-Z]:[\\/]/.test(src), 'source.path 须绝对路径');
    assert.ok(!/^\\\\|^\/\//.test(src), 'source.path 不得为 UNC');
    for (const seg of src.split(/[\\/]/)) {
      assert.ok(seg !== '..' && seg !== '.', 'source.path 不得含 ../ 段');
    }
  }
  return true;
}

/** hub 桌面端 GetPluginsJson（Main.cs）复刻：dependencies 键 → 插件行。 */
function hubDesktopPluginList(profileDir) {
  const root = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  const deps = root.dependencies ?? {};
  return Object.keys(deps).map((name) => {
    const pkgFile = path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json');
    let version = null;
    try { version = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version ?? null; } catch { /* 同 hub：读不到按未安装 */ }
    return { name, spec: deps[name], version };
  });
}

// ---------------------------------------------------------------------------
// fixture：临时 home + 两个假配套件（一个 bundle / 一个普通），走真实
// syncCompanionFiles 落位后跑适配层
// ---------------------------------------------------------------------------

function writePluginDir(root, name, version, extra = {}) {
  const dir = path.join(root, companionDirName({ name }));
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  const pkg = { name, version, description: '测试配套件 ' + name, private: true, main: './lib/index.js' };
  if (extra.dsh) pkg.dsh = extra.dsh;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), `'use strict';\nmodule.exports = {};\n`);
  if (extra.dsh) {
    // bundle 插件：dsh.bundle.patch 指向包内 cordis.patch.yml（verifyBundleDir 要求）
    fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: ' + extra.loaderId + '\n      name: ' + JSON.stringify(name) + '\n');
  }
  if (extra.pluginMeta) {
    fs.writeFileSync(path.join(dir, 'dsh.plugin.json'), JSON.stringify(extra.pluginMeta, null, 2));
  }
  return dir;
}

function buildFixtureHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-hub-reg-'));
  const assetsRoot = path.join(home, 'assets-plugins');
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  writePluginDir(assetsRoot, '@deepseek-ai/dsh-fixture-beta', '1.2.3');
  writePluginDir(assetsRoot, 'dsh-fixture-bundle', '0.4.5', {
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    loaderId: 'fixture-bundle',
  });
  // profile manifest：dsh 首启初始化后的形态（核心 bundles + bundle 登记）。
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-fixture-bundle'] } },
  }, null, 2) + '\n');
  // 用户自装的第三方插件（不在配套清单内）：dependencies 里必须原样保留。
  const userDeps = { 'some-user-plugin': '^2.0.0' };
  const manifestFile = path.join(profileDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.dependencies = userDeps;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { home, assetsRoot, profileDir, plugins: [
    { id: 'fixture-beta', name: '@deepseek-ai/dsh-fixture-beta' },
    { id: 'fixture-bundle', name: 'dsh-fixture-bundle' },
  ] };
}

function installFixturePlugins(assetsRoot, profileDir, plugins, removedIds = new Set()) {
  return syncCompanionFiles({
    assetsRoot,
    profileDir,
    plugins,
    vendorRoot: path.join(assetsRoot, 'no-vendor'),
    removedIds,
    log: () => {},
    fail: () => {},
  });
}

/** 向 profile manifest 写入 dependencies（模拟 v0.5.3 落盘 / 用户自装形态）。 */
function seedDependencies(profileDir, deps) {
  const manifestFile = path.join(profileDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.dependencies = { ...(manifest.dependencies || {}), ...deps };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

function readManifest(profileDir) {
  return JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// 适配层语义：syncHubRecognition（编排面）
// ---------------------------------------------------------------------------

test('syncHubRecognition: 只写 hotpack 指针包；清掉 v0.5.3 脏数据；二次运行零写入', () => {
  const { home, assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  // 模拟 v0.5.3（6070d5ab）在用户机器上写下的脏 dependencies（精确版本）。
  seedDependencies(profileDir, {
    '@deepseek-ai/dsh-fixture-beta': '1.2.3',
    'dsh-fixture-bundle': '0.4.5',
  });
  const logs = [];
  const r1 = syncHubRecognition({
    home, profileDir, assetsRoot, plugins,
    desktopVersion: '0.5.2',
    log: (m) => logs.push(m),
  });
  assert.strictEqual(r1.registrable, 2, '两个配套件都应可登记（hotpack 指针面）');
  assert.deepStrictEqual(r1.deps.removed.sort(), ['@deepseek-ai/dsh-fixture-beta', 'dsh-fixture-bundle'],
    'v0.5.3 写入的 dependencies 脏数据必须被清除');
  assert.strictEqual(r1.deps.skipped, false);
  assert.strictEqual(r1.pack.written, true);

  // dependencies：脏数据已清、用户自装条目保留、绝不新增任何内置件登记
  const manifest = readManifest(profileDir);
  assert.deepStrictEqual(manifest.dependencies, { 'some-user-plugin': '^2.0.0' },
    '清理后 dependencies 只剩用户自装条目');
  // bundles 登记不受影响
  assert.ok(manifest.dsh.profile.bundles.includes('dsh-fixture-bundle'));

  // hotpack 指针
  const packFile = path.join(home, 'hotplug-hub', 'packs', HUB_PACK_ID, 'hotpack.json');
  assert.ok(fs.existsSync(packFile));
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  assert.strictEqual(pack.id, HUB_PACK_ID);
  assert.strictEqual(pack.plugins.length, 2);

  // 幂等：内容一致零写入（mtime 不变），脏数据清后不再有任何 dependencies 动作
  const statBefore = fs.statSync(packFile);
  const manifestBefore = fs.statSync(path.join(profileDir, 'package.json'));
  const r2 = syncHubRecognition({ home, profileDir, assetsRoot, plugins, desktopVersion: '0.5.2', log: () => {} });
  assert.deepStrictEqual(r2.deps.removed, []);
  assert.strictEqual(r2.pack.written, false);
  assert.strictEqual(fs.statSync(packFile).mtimeMs, statBefore.mtimeMs, '指针包不得重写（健康零写入）');
  assert.strictEqual(fs.statSync(path.join(profileDir, 'package.json')).mtimeMs, manifestBefore.mtimeMs,
    'manifest 无变化不得重写（健康零写入）');
});

test('syncHubRecognition: 卸载标记联动——指针包剔除（dependencies 面已废除）', () => {
  const { home, assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  syncHubRecognition({ home, profileDir, assetsRoot, plugins, desktopVersion: '0.5.2', log: () => {} });

  const removedIds = new Set(['fixture-bundle']);
  installFixturePlugins(assetsRoot, profileDir, plugins, removedIds); // 卸载后不同步文件
  const r = syncHubRecognition({ home, profileDir, assetsRoot, plugins, removedIds, desktopVersion: '0.5.2', log: () => {} });
  assert.strictEqual(r.registrable, 1, '卸载件不得再登记');
  assert.deepStrictEqual(r.deps.removed, [], 'dependencies 面已废除：本就无登记可撤');

  const manifest = readManifest(profileDir);
  assert.deepStrictEqual(manifest.dependencies, { 'some-user-plugin': '^2.0.0' });

  const pack = JSON.parse(fs.readFileSync(path.join(home, 'hotplug-hub', 'packs', HUB_PACK_ID, 'hotpack.json'), 'utf8'));
  assert.strictEqual(pack.plugins.length, 1);
  assert.strictEqual(pack.plugins[0].name, '@deepseek-ai/dsh-fixture-beta');
});

// ---------------------------------------------------------------------------
// 适配层语义：cleanLegacyProfileDependencies（issue #156 止血核心）
// ---------------------------------------------------------------------------

test('cleanLegacyProfileDependencies: v0.5.3 脏数据（安装包版本）清除且幂等', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  seedDependencies(profileDir, {
    '@deepseek-ai/dsh-fixture-beta': '1.2.3', // = assets 版本 = node_modules 版本（正常脏数据位形）
    'dsh-fixture-bundle': '0.4.5',
    'some-user-plugin': '^2.0.0',
  });
  const r1 = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r1.removed.sort(), ['@deepseek-ai/dsh-fixture-beta', 'dsh-fixture-bundle']);
  assert.deepStrictEqual(readManifest(profileDir).dependencies, { 'some-user-plugin': '^2.0.0' });

  // 幂等：清干净后二次运行零写入（mtime 不变）
  const statBefore = fs.statSync(path.join(profileDir, 'package.json'));
  const r2 = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r2.removed, []);
  assert.strictEqual(fs.statSync(path.join(profileDir, 'package.json')).mtimeMs, statBefore.mtimeMs);
});

test('cleanLegacyProfileDependencies: 版本漂移脏数据（条目=旧版本）也清除', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  // 升级漂移位形：v0.5.3 写下旧版本，修复版已把 assets/node_modules 升到 9.9.9。
  // 条目值 ≠ 安装包版本 ≠ 已装版本 —— 不清则非 npm 包名照旧 404 锁死。
  seedDependencies(profileDir, { 'dsh-fixture-bundle': '0.1.0' });
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, ['dsh-fixture-bundle']);
  assert.strictEqual(readManifest(profileDir).dependencies['dsh-fixture-bundle'], undefined);
});

test('cleanLegacyProfileDependencies: 插件中心 npm 更新的配套件条目保留（不误删用户安装）', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  // keep-newer 位形：用户经插件中心把 billion-context-dsh 风格的配套件更到 2.0.0
  //（companion-profile 保留更新版本），dependencies 条目是用户自己的安装记录。
  const installed = path.join(profileDir, 'node_modules', 'dsh-fixture-bundle', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(installed, 'utf8'));
  pkg.version = '2.0.0';
  fs.writeFileSync(installed, JSON.stringify(pkg, null, 2));
  seedDependencies(profileDir, {
    'dsh-fixture-bundle': '2.0.0', // = 已装版本 ≠ assets 版本（0.4.5）→ 用户更新位形
    '@deepseek-ai/dsh-fixture-beta': '1.2.3', // 正常脏数据 → 清
  });
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, ['@deepseek-ai/dsh-fixture-beta'], '更新位形条目绝不能删');
  const deps = readManifest(profileDir).dependencies;
  assert.strictEqual(deps['dsh-fixture-bundle'], '2.0.0');
});

test('cleanLegacyProfileDependencies: 用户自装条目一律不动（非配套名 / 范围 / file: 形状）', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  seedDependencies(profileDir, {
    'some-user-plugin': '^2.0.0',                       // 非配套名
    'lodash.get': '4.4.2',                               // 非配套名（精确版本也不动）
    '@deepseek-ai/dsh-fixture-beta': '^1.2.3',           // 配套名 + 范围 spec（非旧写入器形状）
    'dsh-fixture-bundle': 'file:../somewhere',           // 配套名 + file: spec
    '@deepseek-ai/dsh-web-app': 'workspace:*',           // 核心包名（不在配套清单）
  });
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, [], '用户自装/异形条目绝不能删');
  const deps = readManifest(profileDir).dependencies;
  assert.strictEqual(deps['some-user-plugin'], '^2.0.0');
  assert.strictEqual(deps['lodash.get'], '4.4.2');
  assert.strictEqual(deps['@deepseek-ai/dsh-fixture-beta'], '^1.2.3');
  assert.strictEqual(deps['dsh-fixture-bundle'], 'file:../somewhere');
  assert.strictEqual(deps['@deepseek-ai/dsh-web-app'], 'workspace:*');
});

test('cleanLegacyProfileDependencies: 落位文件缺失的脏条目清除（与旧写入器撤下语义一致）', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  fs.rmSync(path.join(profileDir, 'node_modules', 'dsh-fixture-bundle'), { recursive: true, force: true });
  seedDependencies(profileDir, { 'dsh-fixture-bundle': '0.4.5' });
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, ['dsh-fixture-bundle']);
});

test('cleanLegacyProfileDependencies: assets 缺源时退化为保守判定（条目=已装版本即保留）', () => {
  const { profileDir, plugins } = buildFixtureHome();
  const assetsRoot = path.join(profileDir, 'no-such-assets');
  // 无 assets 指纹可对照：条目与已装版本一致 → 无法证明是脏数据 → 保留。
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, []);
});

test('cleanLegacyProfileDependencies: dry-run 只计算不落盘', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  seedDependencies(profileDir, { 'dsh-fixture-bundle': '0.4.5' });
  const before = fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8');
  const logs = [];
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, dryRun: true, log: (m) => logs.push(m) });
  assert.deepStrictEqual(r.removed, ['dsh-fixture-bundle'], 'dry-run 也要报告将清理的条目');
  assert.ok(logs.some((m) => m.includes('dry-run')), 'dry-run 计划须进日志');
  assert.strictEqual(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'), before, 'dry-run 绝不落盘');
});

test('cleanLegacyProfileDependencies: 清空后 dependencies 键整体移除（不留空对象）', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  const manifestFile = path.join(profileDir, 'package.json');
  const manifest = readManifest(profileDir);
  manifest.dependencies = { 'dsh-fixture-bundle': '0.4.5' }; // 只有脏数据，无用户条目
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, ['dsh-fixture-bundle']);
  assert.strictEqual(readManifest(profileDir).dependencies, undefined, '空 dependencies 对象应删除（同 removeRetiredDshMarketDir 先例）');
});

test('cleanLegacyProfileDependencies: manifest 未初始化时跳过且不创建文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-hub-reg-noinit-'));
  const out = cleanLegacyProfileDependencies({
    profileDir: dir,
    plugins: [{ id: 'a', name: 'a' }],
    log: () => {},
  });
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(fs.existsSync(path.join(dir, 'package.json')), false, '绝不凭空创建 manifest');
});

test('cleanLegacyProfileDependencies: 无 dependencies / 无可清条目零写入', () => {
  const { assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  const manifestFile = path.join(profileDir, 'package.json');
  const statBefore = fs.statSync(manifestFile);
  const r = cleanLegacyProfileDependencies({ profileDir, plugins, assetsRoot, log: () => {} });
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(fs.statSync(manifestFile).mtimeMs, statBefore.mtimeMs, '无可清条目不得重写 manifest');
});

// ---------------------------------------------------------------------------
// 适配层语义：登记集合与指针包（识别面②）
// ---------------------------------------------------------------------------

test('collectRegistrablePlugins: 包名漂移/版本缺失的落位目录被拒', () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-hub-reg-badmeta-'));
  const mk = (rel, pkg) => {
    const dir = path.join(profileDir, 'node_modules', rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  };
  mk('bad-name', { name: 'wrong-name', version: '1.0.0', description: 'x' });
  mk('bad-version', { name: 'bad-version', description: 'x' });
  mk(path.join('@s', 'good'), { name: '@s/good', version: '2.0.0', description: 'x' });
  const rows = collectRegistrablePlugins({
    profileDir,
    plugins: [
      { id: 'bad-name', name: 'bad-name' },
      { id: 'bad-version', name: 'bad-version' },
      { id: 'good', name: '@s/good' },
    ],
    log: () => {},
  });
  assert.deepStrictEqual(rows.map((r) => r.name), ['@s/good']);
});

test('inspectCompanionMeta: dsh.plugin.json version 漂移被检出（dsh-vision 回归）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-hub-reg-dpj-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', version: '0.2.1', description: 'd' }));
  fs.writeFileSync(path.join(dir, 'dsh.plugin.json'), JSON.stringify({ id: 'p', version: '0.1.0' }));
  const bad = inspectCompanionMeta(dir, { id: 'p', name: 'p' });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.reasons.some((r) => r.includes('dsh.plugin.json version')), '必须报出 dpj 版本漂移');
  fs.writeFileSync(path.join(dir, 'dsh.plugin.json'), JSON.stringify({ id: 'p', version: '0.2.1' }));
  assert.strictEqual(inspectCompanionMeta(dir, { id: 'p', name: 'p' }).ok, true);
});

test('syncHotplugPackPointer: UNC profile 跳过指针包（hub validateSourcePath 拒绝 UNC）', () => {
  const out = syncHotplugPackPointer({
    home: 'C:/fake-home',
    profileDir: '\\\\wsl$\\Ubuntu\\home\\u\\.dsh\\profiles\\web',
    desktopVersion: '0.5.2',
    registrable: [{ id: 'a', name: 'a', version: '1.0.0' }],
    log: () => {},
  });
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(out.written, false);
});

test('buildHotpackPointer: 空集合返回 null；windows 路径归一为正斜杠', () => {
  assert.strictEqual(buildHotpackPointer({ profileDir: 'C:/x', desktopVersion: '0.5.2', registrable: [] }), null);
  const pack = buildHotpackPointer({
    profileDir: 'C:\\Users\\u\\.dsh\\profiles\\web',
    desktopVersion: '0.5.2',
    registrable: [{ id: 'a', name: '@s/a', version: '1.0.0' }],
  });
  assert.strictEqual(pack.plugins[0].source.path.includes('\\'), false, '指针路径须正斜杠（JSON 可移植）');
  assert.strictEqual(pack.plugins[0].source.path, 'C:/Users/u/.dsh/profiles/web/node_modules/@s/a');
});

// ---------------------------------------------------------------------------
// 断言级 hub 识别复现：hub 的扫描函数喂我方布局
// ---------------------------------------------------------------------------

test('hub 识别复现：lib statusSync 把指针包插件全部判 cached，ensurePath 全 reused', () => {
  const { home, assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  syncHubRecognition({ home, profileDir, assetsRoot, plugins, desktopVersion: '0.5.2', log: () => {} });

  const packs = hubListPacks(home);
  assert.strictEqual(packs.length, 1, 'packs 目录应恰好识别出内置指针包');
  const pack = packs[0];
  assert.strictEqual(pack.id, HUB_PACK_ID);
  assert.strictEqual(hubParseHotpackShape(pack.manifest), true, '指针包必须能过 hub parseHotpack 形状校验');

  const rows = hubStatusPluginRows(home, pack);
  assert.strictEqual(rows.length, 2);
  for (const row of rows) {
    assert.strictEqual(row.cached, true, 'statusSync 必须判 cached: ' + row.name);
    assert.ok(row.version !== null, '插件版本供 hub 展示');
    assert.strictEqual(hubEnsurePathOk({ name: row.name, source: { path: row.path } }), true,
      'ensurePath（activate 时的 reused 判定）必须通过: ' + row.name);
  }
});

test('hub 识别复现：桌面端 GetPluginsJson 只列用户自装件——内置件不进 dependencies（issue #156 取舍）', () => {
  const { home, assetsRoot, profileDir, plugins } = buildFixtureHome();
  installFixturePlugins(assetsRoot, profileDir, plugins);
  // 预埋 v0.5.3 脏数据 + 用户自装，同步后：脏数据清除、用户条目在列。
  seedDependencies(profileDir, { 'dsh-fixture-bundle': '0.4.5' });
  syncHubRecognition({ home, profileDir, assetsRoot, plugins, desktopVersion: '0.5.2', log: () => {} });

  const rows = hubDesktopPluginList(profileDir);
  const byName = new Map(rows.map((r) => [r.name, r]));
  for (const p of plugins) {
    assert.strictEqual(byName.has(p.name), false,
      '内置件不得再出现在 dependencies（识别面①的取舍，见模块头注释）: ' + p.name);
  }
  assert.ok(byName.has('some-user-plugin'), '用户自装插件仍在列');
  const user = byName.get('some-user-plugin');
  assert.strictEqual(user.spec, '^2.0.0');
});

// ---------------------------------------------------------------------------
// 仓库级收口断言：真实 assets/plugins 全量元数据校验
// ---------------------------------------------------------------------------

test('收口：真实 assets/plugins 全部配套件元数据校验通过（防漂移回归）', () => {
  const assetsRoot = path.join(__dirname, '..', '..', 'assets', 'plugins');
  const out = validateCompanionMetadata({ assetsRoot, plugins: COMPANION_PLUGINS, log: () => {} });
  assert.strictEqual(out.checked, COMPANION_PLUGINS.length);
  assert.deepStrictEqual(out.bad, [], '元数据漂移：' + JSON.stringify(out.bad, null, 2));
  const onDisk = new Set(fs.readdirSync(assetsRoot).filter((n) => {
    try { return fs.statSync(path.join(assetsRoot, n)).isDirectory(); } catch { return false; }
  }));
  // 清单 ↔ assets 目录一一对应（多目录/漏登记都算漂移）。RETIRED_COMPANION_DIRS 是
  // 「名字面」不是「源面」：真退役 = 摘清单 + 进名单 + **删源目录**三件事一起做，
  // 名单只留给 companion-profile 认领老机器上镜像出去的副本做回收。
  const listed = new Set(COMPANION_PLUGINS.map(companionDirName));
  const retired = new Set(RETIRED_COMPANION_DIRS);
  const sourceLeftBehind = (dir, onDiskSet) => onDiskSet.has(dir);
  for (const dir of retired) {
    assert.ok(!listed.has(dir), '退役条目不得同时出现在清单里: ' + dir);
    assert.ok(!sourceLeftBehind(dir, onDisk), '退役条目必须删源（留源 = 没退干净）: ' + dir);
  }
  // 反证：同一判据面对「源仍在盘」的形态必须判红（防恒真绿）。
  assert.equal(sourceLeftBehind('dsh-plugin-manager', new Set(['dsh-plugin-manager'])), true,
    '判据必须咬得住「只摘清单、源没删」的半退役形态');
  for (const dir of onDisk) {
    assert.ok(listed.has(dir), 'assets/plugins/' + dir + ' 不在 COMPANION_PLUGINS 清单（会被过期清理误删或漏同步）');
  }
  for (const dir of listed) assert.ok(onDisk.has(dir), '清单声明的目录缺失: ' + dir);
});

test('收口：scoped（@deepseek-ai / @dsh-external）配套件必须 private:true', () => {
  // 两条理由都是实打实的，不是装饰：
  //   ① scripts/lib/companion-profile.js 的 isBuiltinCompanionMirror 把 `private === true`
  //      当「这是壳同步镜像进 profile 的那一份」的强判据——丢了标记，退役回收就只能
  //      撤账不能删目录（铁律 ②「删目录要有证据」）；
  //   ② 这些包名占的是官方 / 外部命名空间，本仓库不该有任何把它们误发布的机会
  //      （撞官方同名包的 profile 遮蔽见 unit-companion-shadow-reclaim）。
  // 本轮实测教训：从上游 tarball 覆盖 package.json 时，本仓库追加的 private 行会
  // 被整字段抹掉（8 条中招），所以这条断言必须常驻。
  const assetsRoot = path.join(__dirname, '..', '..', 'assets', 'plugins');
  const scoped = [];
  const offenders = [];
  for (const dir of fs.readdirSync(assetsRoot)) {
    const file = path.join(assetsRoot, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@')) continue;
    scoped.push(pkg.name);
    if (pkg.private !== true) offenders.push(dir + ' → ' + pkg.name);
  }
  // 反证锚：判据必须看得见真实成员（scoped 集若因名匹配写错而空转，这里先红）
  assert.ok(scoped.includes('@deepseek-ai/dsh-openclaw-bridge'), 'scoped 判定没抓到已知成员: ' + scoped.join(', '));
  assert.ok(scoped.length >= 11, 'scoped 成员数异常萎缩（应含 11 条）: ' + scoped.length);
  assert.deepStrictEqual(offenders, [], 'scoped 自研包缺 private:true: ' + offenders.join(', '));
});

// ---------------------------------------------------------------------------
// 文档账本 ↔ package.json 对账
// ---------------------------------------------------------------------------
// 本轮远端批量更新（d-pack 16 条 + 外部上游 4 条）改了 20 个版本号，而
// THIRD_PARTY_NOTICES.md §4.1 与 docs/builtin-plugins-inventory.md §一 两处账本
// 当时全停在旧值——AGENTS.md 早就写过「文档里的数字常滞后」，滞后的账本比没账本更坏
// （它会让人以为装机版还是旧契约）。这里把「逐名逐版本 1:1」和「nm 标记 = 磁盘实存
// = shipsNodeModules 声明」钉成机器判据。
function ledgerRows(md, headingRe, cols) {
  const at = md.search(headingRe);
  if (at < 0) return null;
  const lines = md.slice(at).split(/\r?\n/).slice(1);
  const rows = [];
  let sawSeparator = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) { if (sawSeparator && rows.length) break; continue; }
    if (/^\|[\s:|-]+\|$/.test(t)) { sawSeparator = true; continue; }
    if (!sawSeparator) continue;
    const cells = t.slice(1, -1).split('|').map((c) => c.trim());
    rows.push(cols(cells));
  }
  return rows;
}

/** 账本差集：doc 行（name/version/nm?/license?）对磁盘事实，返回逐条不一致描述。
 *  可选列按「未声明即不判」处理：inventory §一 没有独立许可列，硬要它判就成了假判据。 */
function ledgerDiff(disk, docRows) {
  const out = [];
  const seen = new Set();
  for (const row of docRows) {
    seen.add(row.name);
    const fact = disk.get(row.name);
    if (!fact) { out.push('账本里的 ' + row.name + ' 在 assets/plugins 找不到对应包'); continue; }
    if (fact.version !== row.version) out.push(row.name + ' 版本漂移：账本 ' + row.version + ' / package.json ' + fact.version);
    if (row.nm !== undefined && row.nm !== fact.nm) out.push(row.name + ' nm 标记漂移：账本 ' + row.nm + ' / 磁盘 ' + fact.nm);
    if (row.license !== undefined && row.license !== fact.license) out.push(row.name + ' 许可漂移：账本 ' + row.license + ' / package.json ' + fact.license);
  }
  for (const name of disk.keys()) if (!seen.has(name)) out.push('磁盘有 ' + name + ' 但账本漏行');
  return out;
}

/** 磁盘事实源：`assets/plugins` 逐目录读 `package.json`，三份账本共用同一个 map。 */
function diskPluginFacts(assetsRoot = path.join(__dirname, '..', '..', 'assets', 'plugins')) {
  const disk = new Map();
  for (const dir of fs.readdirSync(assetsRoot)) {
    const file = path.join(assetsRoot, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    disk.set(pkg.name, {
      dir,
      version: pkg.version,
      license: pkg.license || '',
      nm: fs.existsSync(path.join(assetsRoot, dir, 'node_modules')),
    });
  }
  return disk;
}

test('收口：两份内置插件账本与 package.json 逐名逐版本一致（防滞后的账本冒充事实）', () => {
  const noticesPath = path.join(__dirname, '..', '..', '..', 'THIRD_PARTY_NOTICES.md');
  const inventoryPath = path.join(__dirname, '..', '..', 'docs', 'builtin-plugins-inventory.md');

  const declared = new Map(COMPANION_PLUGINS.map((p) => [p.name, !!p.shipsNodeModules]));
  const disk = diskPluginFacts();
  assert.equal(disk.size, COMPANION_PLUGINS.length, '磁盘包数应等于清单条数');
  // 分发面判据本身：nm 磁盘实存必须与 shipsNodeModules 声明一致（未标的 nm 是本机残留，
  // 同步面永远不会带上它，写在账本里就是假账）。
  for (const [name, fact] of disk) {
    assert.equal(fact.nm, !!declared.get(name), name + ' 的 node_modules 磁盘实存与 shipsNodeModules 声明不一致');
  }

  const notices = fs.existsSync(noticesPath) ? fs.readFileSync(noticesPath, 'utf8') : null;
  assert.ok(notices, 'THIRD_PARTY_NOTICES.md 应在仓库根: ' + noticesPath);
  const rowsA = ledgerRows(notices, /^### 4\.1 /m, (c) => ({ name: c[0], version: c[1], license: c[2] }));
  assert.ok(Array.isArray(rowsA) && rowsA.length > 0, '§4.1 表应可解析');
  assert.deepStrictEqual(ledgerDiff(disk, rowsA), [], 'THIRD_PARTY_NOTICES §4.1 对账失败');

  const inventory = fs.readFileSync(inventoryPath, 'utf8');
  const rowsB = ledgerRows(inventory, /^## 一、内置插件/m, (c) => {
    const ticked = c[2].match(/`([^`]+)`/g) || [];
    return {
      name: (ticked[0] || c[2]).replace(/`/g, '').trim(),
      version: c[3],
      nm: /`nm`/.test(c[2]),
    };
  });
  assert.ok(Array.isArray(rowsB) && rowsB.length > 0, 'inventory §一 表应可解析');
  assert.deepStrictEqual(ledgerDiff(disk, rowsB), [], 'builtin-plugins-inventory §一 对账失败');

  // 反证（防判据恒真）：同一 diff 面对「版本停在旧值」与「漏一行」必须各判一条红。
  const stale = ledgerDiff(disk, rowsB.map((r) => ({ ...r, version: r.name === '@deepseek-ai/dsh-balance' ? '0.0.0-stale' : r.version })));
  assert.equal(stale.length, 1, '版本漂移必须被咬住: ' + JSON.stringify(stale));
  const missingOne = ledgerDiff(disk, rowsB.slice(1));
  assert.equal(missingOne.length, 1, '漏行必须被咬住: ' + JSON.stringify(missingOne));
  const phantom = ledgerDiff(disk, [...rowsB, { name: 'no-such-plugin', version: '1.0.0' }]);
  assert.equal(phantom.length, 1, '账本里的幽灵包必须被咬住: ' + JSON.stringify(phantom));
  // §4.1 多一列许可，判据也得能咬：把 dsh-pocket 的 GPL-2.0 改成 MIT 必须恰好一条红。
  const licDrift = ledgerDiff(disk, rowsA.map((r) => ({ ...r, license: r.name === 'dsh-pocket' ? 'MIT' : r.license })));
  assert.equal(licDrift.length, 1, '许可漂移必须被咬住: ' + JSON.stringify(licDrift));
});

// ---------------------------------------------------------------------------
// §5.2 逐插件判定表收口：结构四列 + 「兼容实测」七数全部本地重放
// ---------------------------------------------------------------------------
// 上一版这张表是手抄的，实测有三行抄错（#4 的声明数、#17/#18 的声明数）。通道两列
// （d-pack / npm）里 npm 半边要网络，CI 上不可重放，所以本层只咬**离线可算**的列：
// 序号、loader id、源目录、本机版本、以及 `别名 / 成员 / 裸名 → 缺失 · 表外 · 声明 · 移除引用`。
// 这五个数一旦与磁盘不同源（换代后忘刷台账、或再抄错），这里直接点名到行号。
const MODULE_TABLE = require('../lib/plugin-module-table');
const KERNEL_PIN = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'compat', 'kernel-pin.json'), 'utf8'));
const REMOVED_IDS = KERNEL_PIN.services.removed.map((s) => s.id);
const MEASURED_RE = /^(\d+) 别名 \/ (\d+) 成员 \/ (\d+) 裸名 → 缺失 (\d+) · 表外 (\d+) · 声明 (\d+) · 移除引用 (\d+)$/;

/** 插件正文里 `ctx.get("<已移除服务 id>")` 命中数（跳过内层 node_modules）。 */
function removedServiceRefs(pluginDir) {
  let text = '';
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (/\.(?:js|cjs|mjs|tsx?)$/.test(e.name)) text += fs.readFileSync(p, 'utf8');
    }
  })(pluginDir);
  return MODULE_TABLE.findRemovedServiceRefs(text, REMOVED_IDS).length;
}

function verdictRow(cells) {
  const strip = (s) => String(s).replace(/`/g, '').trim();
  const m = MEASURED_RE.exec(cells[7]);
  return {
    n: Number(cells[0]),
    id: strip(cells[1]),
    dir: strip(cells[2]),
    local: cells[3],
    measured: m && {
      alias: Number(m[1]), member: Number(m[2]), bare: Number(m[3]),
      missing: Number(m[4]), offTable: Number(m[5]), decl: Number(m[6]), removed: Number(m[7]),
    },
  };
}

/** 台账行 → 与磁盘/判据源的重放差集（逐条可定位到行号）。抽出来是为了能喂变异体做反证。 */
function verdictDiff(rows) {
  const out = [];
  const root = path.join(__dirname, '..', '..');
  const ctx = MODULE_TABLE.makeContext({ root });
  const assetsRoot = path.join(root, 'assets', 'plugins');
  rows.forEach((row, i) => {
    const e = COMPANION_PLUGINS[i];
    if (!e) { out.push(`表里第 ${row.n} 行超出清单条数`); return; }
    if (row.n !== i + 1) out.push(`序号列断了：第 ${i + 1} 行写的是 ${row.n}`);
    if (row.id !== e.id) out.push(`#${row.n} loader id 漂移：表 ${row.id} / 清单 ${e.id}`);
    const dir = companionDirName(e);
    if (row.dir !== dir) out.push(`#${row.n} 源目录漂移：表 ${row.dir} / 清单 ${dir}`);
    const pkgFile = path.join(assetsRoot, dir, 'package.json');
    if (!fs.existsSync(pkgFile)) { out.push(`#${row.n} 源目录 ${dir} 不在磁盘上`); return; }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    if (pkg.name !== e.name) out.push(`#${row.n} 包名与清单不一致：${pkg.name} / ${e.name}`);
    if (pkg.version !== row.local) out.push(`#${row.n} 本机版本漂移：表 ${row.local} / package.json ${pkg.version}`);
    if (!row.measured) { out.push(`#${row.n} 兼容实测列不是「N 别名 / N 成员 / N 裸名 → 缺失 N · 表外 N · 声明 N · 移除引用 N」形态`); return; }
    const pluginDir = path.join(assetsRoot, dir);
    const s = MODULE_TABLE.scanPlugin(pluginDir, ctx) || { aliasCount: 0, memberCount: 0, missing: new Map(), offTable: new Map() };
    const g = MODULE_TABLE.scanBrowserGraph(pluginDir, ctx);
    const bare = g ? [...g.bare.values()].reduce((n, rec) => n + rec.length, 0) : 0;
    const dsh = (pkg.dsh && pkg.dsh.client) || {};
    const want = {
      alias: s.aliasCount,
      member: s.memberCount,
      bare,
      missing: s.missing.size,
      offTable: s.offTable.size,
      decl: (dsh.inject || []).length + (dsh.external || []).length,
      removed: removedServiceRefs(pluginDir),
    };
    for (const k of Object.keys(want)) {
      if (row.measured[k] !== want[k]) {
        out.push(`#${row.n}(${row.id}) 兼容实测「${k}」表记 ${row.measured[k]} ≠ 本地重放 ${want[k]}`);
      }
    }
  });
  if (rows.length !== COMPANION_PLUGINS.length) {
    out.push(`§5.2 行数 ${rows.length} ≠ 清单条数 ${COMPANION_PLUGINS.length}`);
  }
  return out;
}

test('收口：§5.2 判定表的序号/loader id/源目录/本机版本 + 七个兼容实测数与磁盘同源', () => {
  const inventoryPath = path.join(__dirname, '..', '..', 'docs', 'builtin-plugins-inventory.md');
  const md = fs.readFileSync(inventoryPath, 'utf8');
  const rows = ledgerRows(md, /^### 5\.2 /m, verdictRow);
  assert.ok(Array.isArray(rows), '§5.2 表应可解析（标题或表格形态变了）');
  assert.equal(rows.length, COMPANION_PLUGINS.length, '§5.2 行数应等于在册条数');
  assert.deepStrictEqual(verdictDiff(rows), [], '§5.2 逐插件判定表对账失败');

  // 反证（防判据恒真）：① 改一个数字必须恰红一条，且红点落在被改的那一行；
  const tampered = rows.map((r, i) => (i === 0 ? { ...r, measured: { ...r.measured, member: r.measured.member + 1 } } : r));
  const d1 = verdictDiff(tampered);
  assert.equal(d1.length, 1, '成员数被手改必须被咬住: ' + JSON.stringify(d1));
  assert.ok(d1[0].includes('#1'), '红点必须定位到被改的行: ' + d1[0]);
  // ② 换个 loader id 必须被咬住（否则「表 ↔ 清单」同序只是巧合）；
  const d2 = verdictDiff(rows.map((r, i) => (i === 2 ? { ...r, id: 'not-the-list-id' } : r)));
  assert.equal(d2.length, 1, 'loader id 漂移必须被咬住: ' + JSON.stringify(d2));
  // ③ 少一行必须同时报「行数」与「序号断链」之外的至少一条红；
  const d3 = verdictDiff(rows.slice(1));
  assert.ok(d3.length >= 2, '漏一行必须报红: ' + JSON.stringify(d3));
  // ④ 判据形态写歪（少一个数）必须报「形态」而不是静默跳过。
  const d4 = verdictDiff(rows.map((r, i) => (i === 5 ? { ...r, measured: null } : r)));
  assert.equal(d4.filter((m) => m.includes('形态')).length, 1, '实测列形态破坏必须报红: ' + JSON.stringify(d4));
});

// ---------------------------------------------------------------------------
// loader id ↔ 插件自带 cordis.patch.yml 的挂载命中审计
// ---------------------------------------------------------------------------
// AGENTS.md §5 的硬约定：`COMPANION_PLUGINS` 的 id 必须与插件 `cordis.patch.yml`
// insert 行的 id 一致——不一致时自愈的 dropBlocksByIds 永不命中残留行，
// 老装机机器上会双登记并直接崩在启动（issue #104 的学费）。
// 例外必须是**显式点名的名单**，且名单本身也要被反证咬住（名单里写了其实有补丁件的，
// 说明名单陈旧；在册件缺补丁层又不在名单里的，说明挂载面破了）。
const MOUNT_PATCH_EXCEPTION_DIRS = ['dsh-wsl-settings'];

/** 剥掉 YAML 注释后的有效行（本仓这批补丁文件只用整行注释，没有行内注释形态）。 */
function liveYamlLines(text) {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
}

/** 从一个 cordis.patch.yml 里抽 `- insert:` 块的 id/name 集。 */
function patchMounts(text) {
  const ids = [];
  const names = [];
  for (const line of liveYamlLines(text)) {
    const id = /^\s*-\s*id:\s*(.+)$/.exec(line);
    if (id) { ids.push(id[1].trim().replace(/^['"]|['"]$/g, '')); continue; }
    const name = /^\s*name:\s*(.+)$/.exec(line);
    if (name) names.push(name[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return { ids, names, hasInsert: liveYamlLines(text).some((l) => /^-\s*insert:\s*$/.test(l)) };
}

/** 在册件的挂载面审计：返回 {misses, mismatches}（misses = 没有补丁层/没有自挂载声明）。 */
function auditMountPatch(entries, assetsRoot) {
  const misses = [];
  const mismatches = [];
  for (const e of entries) {
    const dir = companionDirName(e);
    const pluginDir = path.join(assetsRoot, dir);
    const pkgFile = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(pkgFile)) { misses.push(dir + '（源目录不在磁盘）'); continue; }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const bundlePatch = !!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch);
    const yml = path.join(pluginDir, 'cordis.patch.yml');
    if (!fs.existsSync(yml)) { misses.push(dir + '（无 cordis.patch.yml，dsh.bundle.patch=' + bundlePatch + '）'); continue; }
    const got = patchMounts(fs.readFileSync(yml, 'utf8'));
    if (!got.hasInsert) { mismatches.push(`${dir}：补丁文件没有顶层 - insert: 块`); continue; }
    if (!got.ids.includes(e.id)) mismatches.push(`${dir}：insert 行 id=${JSON.stringify(got.ids)} 不含清单 id「${e.id}」`);
    if (!got.names.includes(pkg.name)) mismatches.push(`${dir}：insert 行 name=${JSON.stringify(got.names)} ≠ 包名「${pkg.name}」`);
    if (!bundlePatch) mismatches.push(`${dir}：有补丁层但未声明 dsh.bundle.patch（官方 CLI 装不进 bundle 栈）`);
  }
  return { misses, mismatches };
}

test('收口：每条在册件的 loader id 必须命中自己的 cordis.patch.yml，例外只能显式点名', () => {
  const assetsRoot = path.join(__dirname, '..', '..', 'assets', 'plugins');
  const { misses, mismatches } = auditMountPatch(COMPANION_PLUGINS, assetsRoot);
  assert.deepStrictEqual(misses.map((m) => m.split('（')[0]).sort(), MOUNT_PATCH_EXCEPTION_DIRS.slice().sort(),
    '缺补丁层/缺自挂载声明的件与例外名单不一致:\n  ' + misses.join('\n  '));
  assert.deepStrictEqual(mismatches, [], 'loader id ↔ 补丁层失配（issue #104 同族风险）:\n  ' + mismatches.join('\n  '));
  // 例外名单本身要能被证伪：名单里那条必须**确实**没有补丁层，否则名单是陈旧遗产。
  for (const dir of MOUNT_PATCH_EXCEPTION_DIRS) {
    assert.equal(fs.existsSync(path.join(assetsRoot, dir, 'cordis.patch.yml')), false,
      dir + ' 已有 cordis.patch.yml，例外名单该撤了（不撤就会一直放过它的挂载面）');
  }
  // 命中面自检：27 条真命中，不能靠「空集也叫绿」。
  assert.equal(COMPANION_PLUGINS.length - misses.length, 27,
    '实际命中的补丁件数应是 27（28 减 1 条例外），当前判据脱靶');

  // 反证 1：id 与清单不一致必须报失配（拿临时目录合成，不碰仓库）。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mount-audit-'));
  try {
    const fake = path.join(tmp, 'dsh-fake');
    fs.mkdirSync(path.join(fake, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({
      name: 'dsh-fake', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    }));
    fs.writeFileSync(path.join(fake, 'cordis.patch.yml'),
      '# comment only\n- insert:\n    - id: other-loader-id\n      name: \'dsh-fake\'\n');
    const one = auditMountPatch([{ id: 'fake', name: 'dsh-fake' }], tmp);
    assert.equal(one.mismatches.length, 1, 'id 失配没被咬住: ' + JSON.stringify(one));
    assert.ok(one.mismatches[0].includes('other-loader-id'), one.mismatches[0]);
    // 反证 2：补丁文件只有注释（没有 insert 块）必须报，而不是当成「命中集为空所以全绿」。
    fs.writeFileSync(path.join(fake, 'cordis.patch.yml'), '# nothing here\n');
    const two = auditMountPatch([{ id: 'fake', name: 'dsh-fake' }], tmp);
    assert.equal(two.mismatches.length, 1, '空补丁层没被咬住: ' + JSON.stringify(two));
    assert.ok(/insert/.test(two.mismatches[0]), two.mismatches[0]);
    // 反证 3：缺 cordis.patch.yml 必须落 misses（于是与例外名单比对会红），不能静默通过。
    fs.rmSync(path.join(fake, 'cordis.patch.yml'));
    const three = auditMountPatch([{ id: 'fake', name: 'dsh-fake' }], tmp);
    assert.equal(three.misses.length, 1, '缺补丁层没进 misses: ' + JSON.stringify(three));
    // 反证 4：例外名单写歪（把其实有补丁件的行加进去）必须被名单比对那条红咬住。
    const four = auditMountPatch(COMPANION_PLUGINS, assetsRoot);
    const staleList = MOUNT_PATCH_EXCEPTION_DIRS.concat(['dsh-balance']);
    assert.notDeepStrictEqual(
      four.misses.map((m) => m.split('（')[0]).sort(), staleList.slice().sort(),
      '例外名单里塞进真有补丁层的件必须判不一致');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});



// ---------------------------------------------------------------------------
// 收口第 8 层：README 中英两张插件表 ↔ package.json ↔ 在册顺序
// ---------------------------------------------------------------------------
// README 的插件表历史上是一张 5 行「主要增强项摘要」，与在册 28 条从不同源——换代和退役
// 时它永远是滞后的一份，而且「摘要」没有可判的边界。现在按在册顺序逐名列出，交给与
// §4.1/§一 同一套 ledgerDiff：名称、版本、许可三列对磁盘实值，行序对 COMPANION_PLUGINS
// （表头那句话公开承诺了顺序），中英两份再互相对一次——历史上漂的是分别手改的两张表。
const README_FILES = ['README.md', 'README.en.md'];
const README_HEAD = {
  'README.md': /^## 🧩 内置插件生态/m,
  'README.en.md': /^## 🧩 Bundled Plugin Ecosystem/m,
};

/** README 表格行 → {name, version, license}：包名带反引号，许可是来源列「· X」的尾巴。 */
function readmeRows(cells) {
  return {
    name: cells[0].replace(/`/g, '').trim(),
    version: cells[1].trim(),
    license: String(cells[3]).split('·').pop().split(/[（(]/)[0].trim(),
  };
}

test('收口：README 中英插件表逐名逐版本逐许可对 package.json，行序对在册清单', () => {
  const disk = diskPluginFacts();
  const order = COMPANION_PLUGINS.map((p) => p.name);
  const parsed = {};
  for (const file of README_FILES) {
    const md = fs.readFileSync(path.join(__dirname, '..', '..', '..', file), 'utf8');
    const rows = ledgerRows(md, README_HEAD[file], readmeRows);
    assert.ok(Array.isArray(rows), file + ' 里找不到插件表（改了标题或表头要先同步这里的锚点）');
    assert.equal(rows.length, COMPANION_PLUGINS.length, file + ' 插件表行数应等于在册条数');
    assert.deepStrictEqual(ledgerDiff(disk, rows), [], file + ' 插件表对账失败');
    assert.deepStrictEqual(rows.map((r) => r.name), order, file + ' 插件表行序应与 COMPANION_PLUGINS 一致');
    parsed[file] = rows;
  }
  const key = (r) => [r.name, r.version, r.license];
  assert.deepStrictEqual(parsed['README.en.md'].map(key), parsed['README.md'].map(key),
    'README 中英两份的行集 / 版本 / 许可必须逐项相等（只更新一边就是这张表历史上的漂移方式）');

  // 反证（防判据恒真）：同一个 diff 面对「版本滞后」「漏一行」「幽灵包」「许可改标」
  // 必须各判恰好一条红；行序判据必须看得出前两条被对调。
  const base = parsed['README.md'];
  const stale = ledgerDiff(disk, base.map((r) => ({ ...r, version: r.name === 'dsh-synapse' ? '0.2.0' : r.version })));
  assert.equal(stale.length, 1, 'README 版本滞后必须被咬住: ' + JSON.stringify(stale));
  const dropped = ledgerDiff(disk, base.slice(0, base.length - 1));
  assert.equal(dropped.length, 1, 'README 漏掉最后一行必须被咬住: ' + JSON.stringify(dropped));
  const phantom = ledgerDiff(disk, [...base, { name: 'dsh-no-such-plugin', version: '1.0.0', license: 'MIT' }]);
  assert.equal(phantom.length, 1, 'README 里的幽灵包必须被咬住: ' + JSON.stringify(phantom));
  const lic = ledgerDiff(disk, base.map((r) => ({ ...r, license: r.name === 'dsh-pocket' ? 'MIT' : r.license })));
  assert.equal(lic.length, 1, 'README 许可漂移必须被咬住: ' + JSON.stringify(lic));
  const swapped = base.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.notDeepStrictEqual(swapped.map((r) => r.name), order, '行序判据必须能看出前两条被对调');
  // 中英互对判据也不许恒真：只改英文那份的版本必须被那条相等断言的同类 face 咬住。
  assert.notDeepStrictEqual(parsed['README.en.md'].map(key), parsed['README.md'].map((r) => key({ ...r, version: '9.9.9' })),
    '两份 README 只更新一边时必须判不一致');
});
