'use strict';

// profile 别名/悬空链接自愈（healProfileAliasLinks）单测。
//
// 现场（macOS v1.0.1，2026-10-11 取证，dsh-doctor.txt 4.5 段 import 真跑）：
//   profiles/web/node_modules/@deepseek-ai/cosmokit -> ../cosmokit   （pnpm `npm:` 别名）
// 于是 scoped 规格符解析到 profile 里那份**未 scoped** 的 cosmokit 1.8.1（没有
// createVolatile），9 个伴随插件与 @deepseek-ai/dsh-settings 在 ESM 链接期就
// SyntaxError → 条目没有 fiber → 日志只剩一行「failed to load」，设置服务缺席 →
// 首启「未能保存设置」+ dsh-easyrewrite pending (waiting for settings)。
//
// 判据是「链接落点的包名 ≠ 目标 package.json 的 name」：别名命中，`link:` 开发
// 安装（同名）不命中。刻意**不碰真目录副本**——companion-profile 的 sync 每 boot
// 会按 VENDOR_DEPS 重写它们，摘了就是 repair/sync 拉锯 + 每启动重铺 MB 级文件；
// 那条规则留在 healProfileModuleShadowing（guard 路径）。
//
// 隔离：全部在 mkdtemp 里合成，绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { healProfileAliasLinks, healProfileModuleShadowing } = require('../../profile-module-heal');

function mkdtemp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-alias-heal-' + label + '-'));
}

/** 造一个包目录（含 package.json name），返回其绝对路径。 */
function pkgRoot(root, rel, name) {
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf8');
  return dir;
}

function link(linkPath, targetDir) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  // junction：Windows 下无需管理员权限，且 lstat 报 symbolicLink（跨平台一致）。
  fs.symlinkSync(targetDir, linkPath, 'junction');
  return linkPath;
}

/** 合成一棵最小 home：payload 闭包 + 共享 farm + profile（可注入 shadow）。 */
function makeHome(opts = {}) {
  const home = mkdtemp('home');
  const payload = pkgRoot(home, 'payload/node_modules/@deepseek-ai/cosmokit', '@deepseek-ai/cosmokit');
  const farm = path.join(home, 'profiles', 'node_modules');
  const profNm = path.join(home, 'profiles', 'web', 'node_modules');
  fs.mkdirSync(farm, { recursive: true });
  fs.mkdirSync(profNm, { recursive: true });
  link(path.join(farm, '@deepseek-ai', 'cosmokit'), payload);
  if (opts.alias === true) {
    // mac 现场形状：profile 里同时有未 scoped 的 cosmokit 与指向它的 scoped 别名。
    const unscoped = pkgRoot(profNm, 'cosmokit', 'cosmokit');
    link(path.join(profNm, '@deepseek-ai', 'cosmokit'), unscoped);
  }
  if (opts.dangling === true) {
    link(path.join(profNm, '@deepseek-ai', 'cosmokit'), path.join(home, 'gone-does-not-exist'));
  }
  if (opts.realCopy === true) {
    pkgRoot(profNm, '@deepseek-ai/cosmokit', '@deepseek-ai/cosmokit');
  }
  if (opts.devLink === true) {
    const dev = pkgRoot(home, 'dev-checkout', '@deepseek-ai/cosmokit');
    link(path.join(profNm, '@deepseek-ai', 'cosmokit'), dev);
  }
  if (opts.farmUnhealthy === true) {
    // 摘掉 farm 链接的目标内容：fallback 不再健康 → 一条都不许动。
    fs.rmSync(payload, { recursive: true, force: true });
  }
  return { home, payload, farm, profNm };
}

function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }

test('别名链接（scoped 落点 → 未 scoped 目标）在 farm 健康时被摘除，未 scoped 副本不动', () => {
  const { home, profNm } = makeHome({ alias: true });
  const logs = [];
  const removed = healProfileAliasLinks(home, 'web', (m) => logs.push(m));
  assert.deepEqual(removed, ['@deepseek-ai/cosmokit']);
  assert.equal(exists(path.join(profNm, '@deepseek-ai', 'cosmokit')), false, '别名链接必须已摘');
  assert.ok(exists(path.join(profNm, 'cosmokit')), '未 scoped 的 cosmokit 是真需求，不得动');
  assert.match(logs.join('\n'), /target is cosmokit/, '日志要带出目标包名（现场可读）: ' + logs.join('|'));
  fs.rmSync(home, { recursive: true, force: true });
});

test('反证：link: 开发安装（目标同名）绝不摘', () => {
  const { home, profNm } = makeHome({ devLink: true });
  const removed = healProfileAliasLinks(home, 'web', () => {});
  assert.deepEqual(removed, [], '名字一致的 link: 开发安装是用户有意为之，动了就是毁数据');
  assert.ok(isLink(path.join(profNm, '@deepseek-ai', 'cosmokit')), '链接必须原样在位');
  fs.rmSync(home, { recursive: true, force: true });
});

test('反证：farm 链接不健康时一条都不摘（issue #7 守卫——影子是唯一可用副本）', () => {
  const { home, profNm } = makeHome({ alias: true, farmUnhealthy: true });
  const removed = healProfileAliasLinks(home, 'web', () => {});
  assert.deepEqual(removed, [], 'fallback 目标残缺时摘掉 profile 副本会把解析饿死');
  assert.ok(isLink(path.join(profNm, '@deepseek-ai', 'cosmokit')), '别名必须仍在位');
  fs.rmSync(home, { recursive: true, force: true });
});

test('悬空链接摘掉（解析必败，且有健康 fallback 顶上）', () => {
  const { home, profNm } = makeHome({ dangling: true });
  const removed = healProfileAliasLinks(home, 'web', () => {});
  assert.deepEqual(removed, ['@deepseek-ai/cosmokit']);
  assert.equal(exists(path.join(profNm, '@deepseek-ai', 'cosmokit')), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test('真目录副本不在本自愈范围内（sync 每 boot 重写，摘了就是拉锯）', () => {
  const { home, profNm } = makeHome({ realCopy: true });
  const removed = healProfileAliasLinks(home, 'web', () => {});
  assert.deepEqual(removed, [], '真目录副本由 healProfileModuleShadowing（guard 路径）负责');
  assert.ok(fs.lstatSync(path.join(profNm, '@deepseek-ai', 'cosmokit')).isDirectory(), '真目录必须原样');
  fs.rmSync(home, { recursive: true, force: true });
});

test('guard 路径的 shadow heal 也认领别名链接（同一判据，两处一致）', () => {
  const { home, profNm } = makeHome({ alias: true });
  const removed = healProfileModuleShadowing(home, 'web', () => {});
  assert.ok(removed.includes('@deepseek-ai/cosmokit'), '别名必须进 removed: ' + JSON.stringify(removed));
  assert.equal(exists(path.join(profNm, '@deepseek-ai', 'cosmokit')), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test('无 profile / 无 farm / profile 没 node_modules → 返回空且不抛', () => {
  const empty = mkdtemp('empty');
  assert.deepEqual(healProfileAliasLinks(empty, 'web', () => {}), [], 'farm 缺失必须早退');
  fs.mkdirSync(path.join(empty, 'profiles', 'node_modules'), { recursive: true });
  assert.deepEqual(healProfileAliasLinks(empty, 'web', () => {}), [], 'profile 无 node_modules 必须早退');
  fs.rmSync(empty, { recursive: true, force: true });
});

test('幂等：连跑两次，第二次无事可做（boot 每启都跑，不得反复改写）', () => {
  const { home } = makeHome({ alias: true });
  assert.equal(healProfileAliasLinks(home, 'web', () => {}).length, 1);
  assert.deepEqual(healProfileAliasLinks(home, 'web', () => {}), [], '二遍必须零动作');
  fs.rmSync(home, { recursive: true, force: true });
});
