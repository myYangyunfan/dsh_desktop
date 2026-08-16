'use strict';
// 单元测试：scripts/plugin-manager-update.js（插件更新：版本比较/双源 URL/校验/解压定位）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  compareVersions,
  npmLatestUrl,
  githubReleaseApiUrl,
  githubAssetDownloadUrl,
  ghProxyUrl,
  verifyIntegrity,
  findPackageRoot,
} = require('../plugin-manager-update');

test('版本比较：数值分段（0.12.2 > 0.2.1）', () => {
  assert.ok(compareVersions('0.12.2', '0.2.1') > 0);
  assert.ok(compareVersions('0.2.1', '0.12.2') < 0);
  assert.equal(compareVersions('0.2.1', '0.2.1'), 0);
  assert.ok(compareVersions('1.0.0', '0.9.9') > 0);
  assert.equal(compareVersions('v0.2.3', '0.2.3'), 0, '前导 v 忽略');
});

test('npm 双源 URL：官方与镜像同构', () => {
  assert.equal(npmLatestUrl('billion-context-dsh', false), 'https://registry.npmjs.org/billion-context-dsh/latest');
  assert.equal(npmLatestUrl('billion-context-dsh', true), 'https://registry.npmmirror.com/billion-context-dsh/latest');
  assert.equal(npmLatestUrl('@scope/pkg', false), 'https://registry.npmjs.org/%40scope%2Fpkg/latest', 'scoped 包名编码');});

test('GitHub URL：API / 资产直链 / 镜像前缀', () => {
  assert.equal(githubReleaseApiUrl('hzhz314159/dsh-side-session'), 'https://api.github.com/repos/hzhz314159/dsh-side-session/releases/latest');
  assert.equal(
    githubAssetDownloadUrl('hzhz314159/dsh-side-session', 'v0.2.3', 'dsh-side-session-0.2.3.zip'),
    'https://github.com/hzhz314159/dsh-side-session/releases/download/v0.2.3/dsh-side-session-0.2.3.zip'
  );
  const dl = 'https://github.com/a/b/releases/download/v1/x.zip';
  assert.equal(ghProxyUrl(dl), 'https://gh-proxy.com/' + dl);
  assert.equal(ghProxyUrl('https://gh-proxy.com/' + dl), 'https://gh-proxy.com/' + dl, '已带前缀不重复套');
});

test('integrity 校验：sha512 匹配/不匹配', () => {
  const buf = Buffer.from('hello plugin tarball');
  const crypto = require('node:crypto');
  const good = 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');
  assert.ok(verifyIntegrity(buf, good));
  assert.ok(!verifyIntegrity(buf, 'sha512-' + crypto.createHash('sha512').update(Buffer.from('other')).digest('base64')));
  assert.ok(!verifyIntegrity(buf, 'sha1-aaaa'));
  assert.ok(!verifyIntegrity(buf, ''));
});

test('解压定位：npm tarball 的 package/ 顶层目录', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-root-'));
  try {
    fs.mkdirSync(path.join(tmp, 'package', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package', 'package.json'), '{"name":"x","version":"1.0.0"}');
    assert.equal(findPackageRoot(tmp), path.join(tmp, 'package'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('解压定位：GitHub zip 的 <repo>-<ref>/ 顶层目录', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-root-'));
  try {
    fs.mkdirSync(path.join(tmp, 'dsh-side-session-0.2.3', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'dsh-side-session-0.2.3', 'package.json'), '{"name":"x","version":"1.0.0"}');
    assert.equal(findPackageRoot(tmp), path.join(tmp, 'dsh-side-session-0.2.3'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('解压定位：直接就是包根 / 找不到返回 null', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-root-'));
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    assert.equal(findPackageRoot(tmp), tmp);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-empty-'));
    assert.equal(findPackageRoot(empty), null);
    fs.rmSync(empty, { recursive: true, force: true });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
