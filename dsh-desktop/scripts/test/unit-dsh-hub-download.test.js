'use strict';
// dsh-hub 下载链加固单测（安全审计 2026-08）：
//   archiveRootMatchesRepo —— GitHub archive 顶层目录锚点（<repo>-<ref>）。
// 背景：插件源码包此前「镜像优先」下载且无任何结构校验，第三方镜像
// （ghfast.top / gh-proxy.com 等）串包或被替换的 zip 会直接进入 pnpm
// install/build 执行链。加固后：官方 codeload 优先（短 connect-timeout 探测，
// 镜像仍兜底）+ 顶层目录锚点拒绝串包。本文件只测纯函数面；网络顺序由
// downloadGithubZip 内联实现，人工/集成验证覆盖。
// 插件 lib 为 ESM（type:module），测试文件用 CJS 外壳动态 import。
const { test, before } = require('node:test');
const assert = require('node:assert');

const LIB = '../../assets/plugins/dsh-hub/lib/index.js';
let hub = null;

before(async () => {
  hub = await import(LIB);
});

test('archiveRootMatchesRepo：接受 codeload 形态的顶层目录', () => {
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'dsh-mini-1.4.2'), true);
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'dsh-mini-v1.4.2'), true);
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'dsh-mini-main'), true);
  assert.strictEqual(hub.archiveRootMatchesRepo('my-plugin', 'my-plugin-2.0.0-beta.1'), true);
  // 仓库名含点/横线等合法字符
  assert.strictEqual(hub.archiveRootMatchesRepo('foo.bar-plugin', 'foo.bar-plugin-0.0.1'), true);
});

test('archiveRootMatchesRepo：拒绝串包/替换形态', () => {
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'evil-pkg-9.9.9'), false, '不同仓库的包拒绝');
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'dsh-mini'), false, '无 -<ref> 后缀拒绝');
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'dsh-min-1.4.2'), false, '前缀相似但非同仓库名拒绝');
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', ''), false, '空目录名拒绝');
  assert.strictEqual(hub.archiveRootMatchesRepo('dsh-mini', 'package'), false, 'npm 形态 package/ 拒绝（源码包必须是 repo-ref）');
  assert.strictEqual(hub.archiveRootMatchesRepo('', 'x-1'), false, '空 repo 拒绝');
  assert.strictEqual(hub.archiveRootMatchesRepo(undefined, 'x-1'), false, 'undefined repo 不抛错');
  assert.strictEqual(hub.archiveRootMatchesRepo('x', undefined), false, 'undefined rootBase 不抛错');
  assert.strictEqual(hub.archiveRootMatchesRepo('x', null), false, 'null rootBase 不抛错');
  assert.strictEqual(hub.archiveRootMatchesRepo(123, 'x-1'), false, '非字符串 repo 不抛错');
});

// 安全审计 2026-09 加固单测（H-01 源码包完整性锚点 / H-14 归档预检）。
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

test('validateArchiveEntryName：接受普通条目', () => {
  assert.strictEqual(hub.validateArchiveEntryName('index.js'), true);
  assert.strictEqual(hub.validateArchiveEntryName('lib/deep/file.ts'), true);
  assert.strictEqual(hub.validateArchiveEntryName('a/./b.txt'), true);
});

test('validateArchiveEntryName：拒绝越界与危险条目', () => {
  assert.strictEqual(hub.validateArchiveEntryName('../evil.js'), false, 'parent traversal');
  assert.strictEqual(hub.validateArchiveEntryName('a/../../evil.js'), false, 'nested traversal');
  assert.strictEqual(hub.validateArchiveEntryName('.. '), false, 'trailing space normalizes to ..');
  assert.strictEqual(hub.validateArchiveEntryName('/etc/passwd'), false, 'absolute posix');
  assert.strictEqual(hub.validateArchiveEntryName('\\\\server\\share'), false, 'UNC path');
  assert.strictEqual(hub.validateArchiveEntryName('C:\\\\Windows\\\\x.dll'), false, 'drive letter');
  assert.strictEqual(hub.validateArchiveEntryName('dir/file.txt:ads'), false, 'NTFS ADS');
  assert.strictEqual(hub.validateArchiveEntryName('CON'), false, 'reserved device name');
  assert.strictEqual(hub.validateArchiveEntryName('aux.txt'), false, 'reserved device with extension');
  assert.strictEqual(hub.validateArchiveEntryName(''), false, 'empty name');
  assert.strictEqual(hub.validateArchiveEntryName('a\0b'), false, 'NUL byte');
});

test('assertArchiveSafe：拒绝越界名与链接/设备类型', () => {
  assert.strictEqual(hub.assertArchiveSafe(['ok.js', 'lib/x.js'], ['-', 'd']), true);
  assert.throws(() => hub.assertArchiveSafe(['../evil'], ['-']), /越界/);
  for (const type of ['l', 'h', 'c', 'b', 'p']) {
    assert.throws(() => hub.assertArchiveSafe(['x'], [type]), /链接|设备/, `type ${type} must be rejected`);
  }
});

/** Run `fn` with a throwaway DSH_HOME and the given extra env, then clean up. */
function withTempHome(extraEnv, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-pins-'));
  const saved = { DSH_HOME: process.env.DSH_HOME, DSH_HUB_SOURCE_PINS: process.env.DSH_HUB_SOURCE_PINS, DSH_HUB_ALLOW_UNVERIFIED_MIRROR: process.env.DSH_HUB_ALLOW_UNVERIFIED_MIRROR };
  process.env.DSH_HOME = dir;
  fs.mkdirSync(path.join(dir, 'profiles', 'web'), { recursive: true });
  for (const [key, value] of Object.entries(extraEnv || {})) process.env[key] = value;
  try {
    return fn(dir);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('anchorDownload：pin coincidente se acepta, divergente se rechaza', () => {
  const key = 'acme/plugin@v1.0.0';
  withTempHome({ DSH_HUB_SOURCE_PINS: JSON.stringify({ [key]: 'a'.repeat(64) }) }, () => {
    assert.strictEqual(hub.anchorDownload({ owner: 'acme', repo: 'plugin', ref: 'v1.0.0', official: false, sha256: 'a'.repeat(64) }), null);
    assert.match(hub.anchorDownload({ owner: 'acme', repo: 'plugin', ref: 'v1.0.0', official: false, sha256: 'b'.repeat(64) }), /校验失败/);
  });
});

test('anchorDownload：espejo sin ancla se rechaza salvo opt-in explícito', () => {
  withTempHome({}, () => {
    const args = { owner: 'acme', repo: 'plugin', ref: 'v2.0.0', official: false, sha256: 'c'.repeat(64) };
    assert.match(hub.anchorDownload(args), /没有任何完整性锚点/);
    process.env.DSH_HUB_ALLOW_UNVERIFIED_MIRROR = '1';
    assert.strictEqual(hub.anchorDownload(args), null);
    delete process.env.DSH_HUB_ALLOW_UNVERIFIED_MIRROR;
  });
});

test('anchorDownload：la descarga oficial de un ref inmutable deja ancla local', () => {
  withTempHome({}, () => {
    const official = { owner: 'acme', repo: 'plugin', ref: 'v3.0.0', official: true, sha256: 'd'.repeat(64) };
    assert.strictEqual(hub.anchorDownload(official), null, 'official download accepted');
    assert.strictEqual(hub.anchorDownload({ ...official, official: false }), null, 'mirror matching the anchor accepted');
    assert.match(hub.anchorDownload({ ...official, official: false, sha256: 'e'.repeat(64) }), /校验失败|不一致/);
    // A branch ref is never recorded: its hash changes on every commit.
    assert.strictEqual(hub.anchorDownload({ owner: 'acme', repo: 'plugin', ref: 'main', official: true, sha256: 'f'.repeat(64) }), null);
    assert.match(hub.anchorDownload({ owner: 'acme', repo: 'plugin', ref: 'main', official: false, sha256: 'f'.repeat(64) }), /没有任何完整性锚点/);
  });
});
