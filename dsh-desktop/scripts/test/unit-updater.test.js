'use strict';

// Self-update release discovery tests. No network or Electron runtime needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const updater = require('../../updater');

// fallback 分支（0.0.0）仅在 bundled @deepseek-ai/dsh 缺失时可达；本地开发与 CI
// 安装依赖后 require.resolve 必然命中，因此下面两个 fallback 用例在带依赖环境
// 自动 skip（跳过而非失败），无依赖环境（如打包后目录）才真正运行。
const hasBundledDsh = (() => {
  try { require.resolve('@deepseek-ai/dsh/package.json'); return true; } catch { return false; }
})();

test('parseReleaseVersion: strips dsh/v prefixes and rejects unsafe tags', () => {
  assert.equal(updater.parseReleaseVersion('dsh-v0.1.0-rc.7'), '0.1.0-rc.7');
  assert.equal(updater.parseReleaseVersion('v0.1.0'), '0.1.0');
  assert.equal(updater.parseReleaseVersion('dsh-v0.1.0-rc.7+build.1'), null);
  assert.equal(updater.parseReleaseVersion('dsh-latest'), null);
});

test('selectLatestRelease: includes prereleases, ignores drafts, and compares rc numbers numerically', () => {
  const selected = updater.selectLatestRelease([
    { tag_name: 'dsh-v0.1.0-rc.9', draft: false, published_at: '2026-08-16T00:00:00Z' },
    { tag_name: 'dsh-v0.1.0-rc.10', draft: false, published_at: '2026-08-17T00:00:00Z' },
    { tag_name: 'dsh-v0.1.0-rc.11', draft: true, published_at: '2026-08-18T00:00:00Z' },
  ]);
  assert.equal(selected.version, '0.1.0-rc.10');
});

test('parseNpmVersions: reads dist-tags JSON and plain output', () => {
  assert.deepEqual(
    updater.parseNpmVersions('{"latest":"0.1.0-rc.6","next":"0.1.0-rc.7"}'),
    ['0.1.0-rc.6', '0.1.0-rc.7'],
  );
  assert.deepEqual(updater.parseNpmVersions('0.1.0-rc.7\n'), ['0.1.0-rc.7']);
});

test('checkLatest: merges GitHub prerelease and npm fallback sources', async () => {
  const ctx = {
    fetchGitHubReleases: async () => [
      { tag_name: 'dsh-v0.1.0-rc.7', draft: false, published_at: '2026-08-17T12:01:58Z' },
    ],
    fetchNpmDistTags: async () => ({ latest: '0.1.0-rc.6', next: '0.1.0-rc.7' }),
    fetchNpmVersionExists: async () => true,
  };
  assert.equal(await updater.checkLatest(ctx), '0.1.0-rc.7');
});

test('checkLatest: GitHub failure falls back to npm dist-tags', async () => {
  const ctx = {
    fetchGitHubReleases: async () => { throw new Error('network down'); },
    fetchNpmDistTags: async () => ({ latest: '0.1.0-rc.6', next: '0.1.0-rc.7' }),
  };
  assert.equal(await updater.checkLatest(ctx), '0.1.0-rc.7');
});

test('checkLatest: does not advertise a GitHub version missing from npm', async () => {
  const ctx = {
    fetchGitHubReleases: async () => [
      { tag_name: 'dsh-v0.1.0-rc.8', draft: false, published_at: '2026-08-18T00:00:00Z' },
    ],
    fetchNpmDistTags: async () => ({ latest: '0.1.0-rc.7', next: '0.1.0-rc.7' }),
    fetchNpmVersionExists: async () => false,
  };
  assert.equal(await updater.checkLatest(ctx), '0.1.0-rc.7');
});

test('registryFromNpmrc: 注释/空行/多 registry 行取最后/非法值忽略/尾斜杠归一', () => {
  assert.equal(updater.registryFromNpmrc(''), null);
  assert.equal(updater.registryFromNpmrc('# comment\n; also comment\n'), null);
  assert.equal(updater.registryFromNpmrc('registry=https://registry.npmmirror.com/'), 'https://registry.npmmirror.com');
  assert.equal(
    updater.registryFromNpmrc('registry = https://registry.npmmirror.com\nregistry=https://registry.npmjs.org/'),
    'https://registry.npmjs.org',
    '后写的 registry 行覆盖先写',
  );
  assert.equal(updater.registryFromNpmrc('registry=ftp://bad.example/'), null, '非 http(s) 值忽略');
  assert.equal(updater.registryFromNpmrc('proxy=http://proxy:8080\nregistry=https://registry.npmjs.org/'), 'https://registry.npmjs.org', '无关行跳过');
});

test('resolveNpmRegistry: env 优先 → 项目 npmrc → 用户 npmrc → 默认', () => {
  const fsMod = {
    existsSync: (p) => p.includes('.npmrc'),
    readFileSync: (p) => (p.includes('userdata') ? 'registry=https://project.example/\n' : 'registry=https://user.example/\n'),
  };
  // 默认
  assert.equal(updater.resolveNpmRegistry({ env: {}, fsMod: { existsSync: () => false, readFileSync: () => '' } }), 'https://registry.npmjs.org');
  // env 优先
  assert.equal(
    updater.resolveNpmRegistry({ env: { NPM_CONFIG_REGISTRY: 'https://env.example/' }, userDataDir: 'userdata', homeDir: 'home', fsMod }),
    'https://env.example',
  );
  // 项目优先于用户
  assert.equal(
    updater.resolveNpmRegistry({ env: {}, userDataDir: 'userdata', homeDir: 'home', fsMod }),
    'https://project.example',
  );
  // 无项目文件 → 用户
  assert.equal(
    updater.resolveNpmRegistry({ env: {}, userDataDir: 'nodir', homeDir: 'home', fsMod: { existsSync: (p) => p.includes('home'), readFileSync: () => 'registry=https://user.example/\n' } }),
    'https://user.example',
  );
  // env 非法值（非 http）→ 忽略走文件
  assert.equal(
    updater.resolveNpmRegistry({ env: { NPM_CONFIG_REGISTRY: 'garbage' }, userDataDir: 'userdata', homeDir: 'home', fsMod }),
    'https://project.example',
  );
});

test('npmDistTagsUrl / npmVersionUrl: scoped 包编码与尾斜杠归一', () => {
  assert.equal(
    updater.npmDistTagsUrl('https://registry.npmjs.org', '@deepseek-ai/dsh'),
    'https://registry.npmjs.org/-/package/%40deepseek-ai%2Fdsh/dist-tags',
  );
  assert.equal(
    updater.npmVersionUrl('https://registry.npmjs.org/', '@deepseek-ai/dsh', '0.1.0-rc.7'),
    'https://registry.npmjs.org/%40deepseek-ai%2Fdsh/0.1.0-rc.7',
  );
});

test('checkNpmLatest: next>latest 场景取 dist-tags 最大值（rc 通道可发现）', async () => {
  const ctx = {
    fetchNpmDistTags: async () => ({ latest: '0.1.0-rc.6', next: '0.1.0-rc.7' }),
  };
  assert.equal(await updater.checkNpmLatest(ctx), '0.1.0-rc.7');
});

test('checkNpmLatest: 无可识别版本号抛错', async () => {
  const ctx = { fetchNpmDistTags: async () => ({ latest: 'not-a-version' }) };
  await assert.rejects(() => updater.checkNpmLatest(ctx), /无可识别版本号/);
});

test('checkNpmVersion: 注入探测 200/404 语义透传', async () => {
  const ctx = { fetchNpmVersionExists: async (url) => url.includes('0.1.0-rc.8') };
  assert.equal(await updater.checkNpmVersion(ctx, '0.1.0-rc.8'), true);
  assert.equal(await updater.checkNpmVersion(ctx, '0.1.0-rc.9'), false);
});

test('activeVersion: returns "0.0.0" when both overlay and bundled are null', { skip: hasBundledDsh && 'bundled dsh installed: fallback branch not reachable' }, () => {
  // Bug fix: compareVersions(latest, null) treats null as empty string, always
  // returning -1, causing "already latest" branch to never trigger.
  const ctx = { userDataDir: '/nonexistent/path/that/does/not/exist' };
  const version = updater.activeVersion(ctx);
  assert.equal(typeof version, 'string');
  assert.equal(version, '0.0.0');
});

test('activeVersionInfo: returns fallback source when no overlay or bundled', { skip: hasBundledDsh && 'bundled dsh installed: fallback branch not reachable' }, () => {
  const ctx = { userDataDir: '/nonexistent/path/that/does/not/exist' };
  const info = updater.activeVersionInfo(ctx);
  assert.equal(info.version, '0.0.0');
  assert.equal(info.source, 'fallback');
});

test('compareVersions: null/undefined are treated as less than any real version', () => {
  // This is the root cause of the "repeated update prompt" bug:
  // compareVersions("0.1.0-rc.7", null) used to return -1 because
  // String(null) = "" which parsed as [''], a non-numeric segment that
  // compared as less than any numeric segment.
  // After the fix, activeVersion returns '0.0.0' instead of null.
  assert.ok(updater.compareVersions('0.1.0-rc.7', '0.0.0') > 0);
  assert.ok(updater.compareVersions('0.3.10', '0.0.0') > 0);
  // But compareVersions with actual null still returns > 0 (null → '' → less than everything).
  assert.ok(updater.compareVersions('0.1.0-rc.7', null) > 0);
});

test('saveSettings: atomic write never deletes the original on rename failure', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-settings-'));
  const userDataDir = path.join(tmp, 'userdata');
  const file = path.join(userDataDir, 'settings.json');
  const ctx = { userDataDir, log: () => {} };

  // Normal save works.
  assert.equal(updater.saveSettings(ctx, { webPort: 8080 }), true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).webPort, 8080);

  // Force rename to fail by making the destination a directory: the original
  // content must be preserved (historical code deleted it before rename).
  fs.rmSync(file);
  fs.mkdirSync(file);
  const result = updater.saveSettings(ctx, { webPort: 9090 });
  // rename onto a directory fails on Windows; the directory must remain (not a lost file).
  assert.equal(result, false);
  assert.equal(fs.statSync(file).isDirectory(), true, 'original must not be clobbered to a deleted state');

  fs.rmSync(tmp, { recursive: true, force: true });
});
