'use strict';

// ---------------------------------------------------------------------------
// 内置插件更新源唯一表单测（issue：更新链扩展 5 条随包插件 + 排除 better-sidebar）。
//
// 锁住三件事：
//   1. 表内容：3 条既有源不回归 + 5 条新源的 id/包名精确（写错包名=静默查错项目）；
//   2. 排除机制：better-sidebar（本地重建件）不参与检查更新、update 直连被拒；
//   3. 表与交付清单的一致性：每个 source id 必须存在于 COMPANION_PLUGINS ——
//      防止表里写孤儿 id（loader id 与包名各错一位都表现为「检查更新永远查不到」）。
//
// 另含 GitHub 无资产 release 的 archive 选择纯函数（resolveGithubRelease）：
// 无 assets 必须走 zipball；有 assets 的行为不得回归。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  UPDATE_SOURCES,
  UPDATE_EXCLUSIONS,
  isUpdateExcluded,
  updateExclusionReason,
  getUpdateSource,
  selectUpdateCandidates,
} = require('../lib/plugin-update-sources.js');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins.js');
const { resolveGithubRelease } = require('../plugin-manager-update.js');

// ── 1. 表内容 ───────────────────────────────────────────────────────────────

test('更新源表：8 条（2 既有 + 6 新增；2026-11-09 把 compaction-acp 换成 bili-native），id/包名逐条精确', () => {
  assert.deepEqual(Object.keys(UPDATE_SOURCES).sort(), [
    'better-sidebar',
    'bili-native',
    'bot',
    'dsh-notify',
    'mcp-manager-ui',
    'network-proxy',
    'shop',
    'web-search-free',
  ]);

  // 既有两条不得回归（历史语义：#80/#90）；side-session 已随「临时对话」退役。
  assert.deepEqual(UPDATE_SOURCES['bili-native'], { kind: 'npm', pkg: 'billion-context' });
  assert.equal(UPDATE_SOURCES['compaction-acp'], undefined, '旧件已退役，更新源不得残留');
  assert.deepEqual(UPDATE_SOURCES['better-sidebar'], { kind: 'npm', pkg: 'dsh-better-sidebar' });

  // 新增六条：id 是 loader id，pkg/repo 是真正取数的坐标。
  assert.deepEqual(UPDATE_SOURCES.bot, { kind: 'npm', pkg: 'ds-bot' });
  assert.deepEqual(UPDATE_SOURCES['web-search-free'], { kind: 'npm', pkg: 'dsh-free-search' });
  assert.deepEqual(UPDATE_SOURCES.shop, { kind: 'npm', pkg: 'dsh-plugin-shop' });
  assert.deepEqual(UPDATE_SOURCES['network-proxy'], { kind: 'github', repo: 'baizhizzl/dsh-network-proxy' });
  assert.deepEqual(UPDATE_SOURCES['mcp-manager-ui'], { kind: 'npm', pkg: 'dsh-toolbox-ui' });
  assert.deepEqual(UPDATE_SOURCES['dsh-notify'], { kind: 'npm', pkg: '@bittersmilezzz/dsh-notify' });

  assert.ok(Object.isFrozen(UPDATE_SOURCES), '表必须是只读的（禁止运行期改写造成漂移）');
});

// ── 2. 排除机制 ─────────────────────────────────────────────────────────────

test('排除机制：better-sidebar / bot 被排除且原因可读，其余条目不受影响', () => {
  assert.equal(isUpdateExcluded('better-sidebar'), true);
  assert.match(updateExclusionReason('better-sidebar'), /本地重建/);
  assert.equal(isUpdateExcluded('bot'), true);
  assert.match(updateExclusionReason('bot'), /vendored|覆盖/);

  for (const id of Object.keys(UPDATE_SOURCES)) {
    if (id === 'better-sidebar' || id === 'bot') continue;
    assert.equal(isUpdateExcluded(id), false, id + ' 不应被排除');
    assert.equal(updateExclusionReason(id), '');
  }

  // 未知 / 非字符串入参：不抛、按未排除处理。
  assert.equal(isUpdateExcluded('no-such-id'), false);
  assert.equal(isUpdateExcluded(undefined), false);
  assert.equal(isUpdateExcluded(null), false);
  assert.equal(getUpdateSource('no-such-id'), null);
  assert.equal(getUpdateSource(undefined), null);
  assert.equal(getUpdateSource('bili-native'), UPDATE_SOURCES['bili-native']);
});

// ── 3. 与交付清单的一致性 ────────────────────────────────────────────────────

test('每个更新源 id 都存在于 COMPANION_PLUGINS（不写孤儿 id）', () => {
  const companionIds = new Set(COMPANION_PLUGINS.map((p) => p.id));
  assert.ok(companionIds.size >= 8, '交付清单疑似为空');
  for (const id of Object.keys(UPDATE_SOURCES)) {
    assert.ok(companionIds.has(id), '更新源 id 不在 COMPANION_PLUGINS 里: ' + id);
  }
});

// ── 4. 检查更新的过滤逻辑（纯函数） ──────────────────────────────────────────

test('selectUpdateCandidates: 过滤无源 / 已卸载 / 被排除 / 非法行，顺序稳定', () => {
  const rows = [
    { id: 'bili-native' },
    { id: 'better-sidebar' },
    { id: 'web-search-free' },
    { id: 'dsh-pocket' },          // 无更新源
    { id: 'shop', removed: true }, // 已卸载
    { id: 'bot' },
    null,
    { id: 42 },
    { name: 'no-id' },
  ];
  assert.deepEqual(selectUpdateCandidates(rows).map((r) => r.id),
    ['bili-native', 'web-search-free']);

  // 注入自定义源表：过滤只认传进来的表。
  assert.deepEqual(
    selectUpdateCandidates([{ id: 'x' }, { id: 'shop' }], { x: { kind: 'npm', pkg: 'x' } }).map((r) => r.id),
    ['x']);
  assert.deepEqual(selectUpdateCandidates(null), []);
  assert.deepEqual(selectUpdateCandidates(undefined), []);
});

// ── 5. GitHub release 的 archive / asset 选择 ────────────────────────────────

test('resolveGithubRelease: 无资产的 release 走源码 zipball（archive 模式，digest 留空）', () => {
  const release = {
    tag_name: 'v1.2.3',
    assets: [],
    tarball_url: 'https://api.github.com/repos/baizhizzl/dsh-network-proxy/tarball/v1.2.3',
    zipball_url: 'https://api.github.com/repos/baizhizzl/dsh-network-proxy/zipball/v1.2.3',
  };
  const info = resolveGithubRelease('baizhizzl/dsh-network-proxy', release);
  assert.equal(info.mode, 'archive');
  assert.equal(info.version, '1.2.3', '版本取 tag_name 去前缀 v');
  assert.equal(info.tag, 'v1.2.3');
  assert.equal(info.tarball, release.zipball_url, 'archive 模式必须取 zipball_url');
  assert.equal(info.digest, '', '无摘要就留空，绝不用版本号/其他字段冒充校验值');
  assert.equal(info.assetName, '');
  assert.equal(info.source, 'github');
});

test('resolveGithubRelease: 有资产时保持原行为（资产直链 + sha256 digest 小写归一）', () => {
  const digest = 'A'.repeat(64);
  const release = {
    tag_name: 'v2.0.0',
    assets: [
      { name: 'dsh-x-win-x64.zip', digest: 'sha256:' + digest },
      { name: 'checksums.txt' },
    ],
    zipball_url: 'https://api.github.com/repos/o/r/zipball/v2.0.0',
  };
  const info = resolveGithubRelease('o/r', release);
  assert.equal(info.mode, 'asset');
  assert.equal(info.version, '2.0.0');
  assert.equal(info.assetName, 'dsh-x-win-x64.zip');
  assert.equal(info.tarball, 'https://github.com/o/r/releases/download/v2.0.0/dsh-x-win-x64.zip');
  assert.equal(info.digest, 'a'.repeat(64));
});

test('resolveGithubRelease: 有资产但选不出二进制 / 缺 zipball / 空响应 → null（不冒充发行包）', () => {
  // 资产只剩校验和文件：selectReleaseAsset 返回 null —— 保持历史行为（查询失败），
  // 不因为「资产不可用」就悄悄改下源码包。
  assert.equal(resolveGithubRelease('o/r', {
    tag_name: 'v1.0.0',
    assets: [{ name: 'SHA256SUMS' }],
    zipball_url: 'https://api.github.com/repos/o/r/zipball/v1.0.0',
  }), null);
  // 无资产且无 zipball_url。
  assert.equal(resolveGithubRelease('o/r', { tag_name: 'v1.0.0', assets: [] }), null);
  // 无 tag_name / 非法响应。
  assert.equal(resolveGithubRelease('o/r', { assets: [] }), null);
  assert.equal(resolveGithubRelease('o/r', null), null);
});

// ── 6. plugin-core 装配根读同一张表（不再有第二份副本） ──────────────────────

test('plugin-core：updates.sources 与唯一表同源，排除项在 update 直连处被拒', async (t) => {
  const { createPluginCenter } = require('../plugin-core/index.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-src-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, 'profiles', 'web'), { recursive: true });

  const center = createPluginCenter({ getHome: () => home, getProfile: () => 'web' });
  assert.equal(center.updates.sources, UPDATE_SOURCES, '装配根不得再复制一份表');
  assert.equal(Object.keys(center.updates.sources).length, 8);

  await assert.rejects(center.updates.update('better-sidebar'), (err) => {
    assert.equal(err.code, 'PLUGIN_NOT_FOUND');
    assert.match(err.message, /本地重建/);
    return true;
  });
});
