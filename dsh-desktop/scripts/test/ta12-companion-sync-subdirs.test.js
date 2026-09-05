'use strict';

// ta12-companion-sync-subdirs.test.js —— companion-profile.js SYNC_SUBDIRS 覆盖面
// 补测（node --test）。既有测（unit-compat-companion.test.js）只锁了 gui/ 一个
// 目录的重构回归；本文件把 SYNC_SUBDIRS 九个目录逐一走一遍真实
// syncCompanionFiles 路径，并锁两个契约：
//   1. 每个清单内子目录都会被目录级同步（缺一个 = 对应插件资产静默丢失）；
//   2. 清单外的顶层目录（docs/ 等文档目录）不进 profile——防止清单悄悄变
//      成「全目录镜像」，把上游垃圾也搬进用户 profile；
//   3. node_modules/ 只随插件条目的 shipsNodeModules 标志分发（companion-plugins.js
//      单一数据源）：git 跟踪的正件依赖树照常同步，未标记插件源里的 node_modules
//      一律视为本机安装残留，绝不同步（残留可达成千上万文件，同步会烧数分钟）。
// 另锁 HEAL_SUBDIRS 语义：keep-newer 分支只补清单内目录、跳过 node_modules/
// （注入旧依赖树会经 require 解析顺序破坏新版本——注释契约的行为化锁定）。
// 运行：node --test scripts/test/ta12-companion-sync-subdirs.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { syncCompanionFiles } = require('../lib/companion-profile');

/** 与 companion-profile.js 的 SYNC_SUBDIRS 保持同步（清单漂移时本测试报警）。 */
const SYNC_SUBDIRS = ['lib', 'client', 'data', 'assets', 'src', 'dist', 'public', 'gui', 'node_modules'];

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta12-sync-subdirs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const noops = { log: () => {}, fail: () => {}, onMissingSource: () => {}, onCopyFail: () => {}, onVerifyFail: () => {}, onInstalled: () => {}, onVendorSynced: () => {}, plan: () => {} };

/** 造一个 assets 侧插件，SYNC_SUBDIRS 每目录一个哨兵文件 + 一个清单外 docs/。 */
function makeAsset(assetsRoot, dirName, pkgName, version) {
  const dir = path.join(assetsRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkgName, version, main: 'lib/index.js' }));
  for (const sub of SYNC_SUBDIRS) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, sub, `sentinel-${sub}.txt`), `${pkgName}/${sub}`);
  }
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'api.md'), '# not synced');
  return dir;
}

test('SYNC_SUBDIRS 全清单：九个运行资产目录逐一被目录级同步进 profile', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  const assetsRoot = path.join(home, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  // shipsNodeModules: true = node_modules/ 是正件依赖树，随九目录清单同步分发。
  const plugins = [{ id: 'ta12-all', name: '@scope/ta12-all', shipsNodeModules: true }];
  makeAsset(assetsRoot, 'ta12-all', '@scope/ta12-all', '1.0.0');

  syncCompanionFiles({ plugins, assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(), ...noops });

  const dest = path.join(profileDir, 'node_modules', '@scope', 'ta12-all');
  for (const sub of SYNC_SUBDIRS) {
    const f = path.join(dest, sub, `sentinel-${sub}.txt`);
    assert.ok(fs.existsSync(f), `清单目录 ${sub}/ 必须被同步（缺 = 该类资产静默丢失）`);
    assert.equal(fs.readFileSync(f, 'utf8'), `@scope/ta12-all/${sub}`);
  }
});

test('SYNC_SUBDIRS 白名单边界：清单外顶层目录（docs/）不进 profile', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  const assetsRoot = path.join(home, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  const plugins = [{ id: 'ta12-boundary', name: 'ta12-boundary' }];
  makeAsset(assetsRoot, 'ta12-boundary', 'ta12-boundary', '1.0.0');

  syncCompanionFiles({ plugins, assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(), ...noops });

  const dest = path.join(profileDir, 'node_modules', 'ta12-boundary');
  assert.ok(!fs.existsSync(path.join(dest, 'docs')), 'docs/ 不在 SYNC_SUBDIRS，不得被同步进 profile');
  assert.ok(fs.existsSync(path.join(dest, 'lib', 'sentinel-lib.txt')), 'lib/ 应同步（对照）');
});

test('shipsNodeModules 契约：未标记的插件即使源里有 node_modules/ 也绝不同步（残留防线）', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  const assetsRoot = path.join(home, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  const plugins = [{ id: 'ta12-residue', name: 'ta12-residue' }];
  makeAsset(assetsRoot, 'ta12-residue', 'ta12-residue', '1.0.0');

  syncCompanionFiles({ plugins, assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(), ...noops });

  const dest = path.join(profileDir, 'node_modules', 'ta12-residue');
  assert.ok(!fs.existsSync(path.join(dest, 'node_modules')),
    '未标 shipsNodeModules 的 node_modules/ 是本机残留，不得同步进 profile');
  assert.ok(fs.existsSync(path.join(dest, 'lib', 'sentinel-lib.txt')), '其余 SYNC_SUBDIRS 照常同步（对照）');
});

test('keep-newer（HEAL_SUBDIRS）分支：缺整目录补齐，但 node_modules/ 绝不注入（require 解析顺序契约）', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  const assetsRoot = path.join(home, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  const plugins = [{ id: 'ta12-heal', name: '@scope/ta12-heal' }];
  makeAsset(assetsRoot, 'ta12-heal', '@scope/ta12-heal', '1.0.0');

  // 预置「更新但残缺」的 profile 安装：版本 2.0.0、无任何运行资产目录。
  const dest = path.join(profileDir, 'node_modules', '@scope', 'ta12-heal');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ name: '@scope/ta12-heal', version: '2.0.0', main: 'lib/index.js' }));

  const logs = [];
  syncCompanionFiles({ plugins, assetsRoot, profileDir, vendorRoot: path.join(home, 'vendor'), removedIds: new Set(), ...noops, log: (m) => logs.push(m) });

  // HEAL_SUBDIRS = SYNC_SUBDIRS - node_modules：其余八个整目录缺失 → 补齐
  for (const sub of SYNC_SUBDIRS) {
    if (sub === 'node_modules') continue;
    assert.ok(fs.existsSync(path.join(dest, sub, `sentinel-${sub}.txt`)), `keep-newer 分支应补齐缺失的 ${sub}/`);
  }
  // node_modules 绝不注入（注入旧依赖树会经 require 解析顺序破坏新版本）
  assert.ok(!fs.existsSync(path.join(dest, 'node_modules')), 'keep-newer 分支不得注入 node_modules/（HEAL_SUBDIRS 契约）');
  assert.ok(logs.some((m) => m.includes('补齐')), '补齐应有日志');
});
