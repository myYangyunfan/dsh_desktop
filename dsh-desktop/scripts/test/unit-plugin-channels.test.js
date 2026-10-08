'use strict';

// 内置插件「更新通道」判据的机器锁（node --test）。
//
// 钉的是 docs/builtin-plugins-inventory.md §4.1/§4.2/§5.2 那张判定表的**判据本身**：
// 通道版本分桶 + npm 身份判定 + 「可取」合成。三处都是被真实事故教过的：
//   · 按包名比对 d-pack 会得到「重叠 0」的假结论（发布面包名全是 `@dsh-pack/<裸名>`）；
//   · npm 版本号更高不等于它是上游——`dsh-session-manager@0.6.2`（`hkkz9522`）与
//     `dsh-input-history@0.3.2`（`sunshaobei`）是撞名的第三方实现，按名更新会把别人的代码装进来；
//   · `dsh-reasoning-effort` 的 npm latest（0.2.8）是 `Mu-scorpio` 那条旧线，
//     我们 0.8.1 取自 `HanaAyane` 线——只看版本号会「降级」自己。
//
// 判据面全在 scripts/lib/plugin-channels.js（纯函数）。本文件只做断言与反证，
// 不发网络请求；d-pack 半边读本机克隆的 git 树，缺该目录时按既有惯例 skip（同 unit-updater）。

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ch = require('../lib/plugin-channels');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins');

const ROOT = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(ROOT, 'assets', 'plugins');
const DPACK = process.env.DSH_PACK_DIR || path.resolve(ROOT, '..', '..', 'dsh-pack');

const entry = (id, name) => ({ id, name });

// ---- bareName --------------------------------------------------------------

test('bareName：作用域名剥 scope，裸名原样，异常输入不抛', () => {
  assert.equal(ch.bareName('@deepseek-ai/dsh-balance'), 'dsh-balance');
  assert.equal(ch.bareName('dsh-synapse'), 'dsh-synapse');
  // 反证：裸名半边必须逐字返回——若实现按 '/' split 取首段，未 scoped 的会整条变空，
  // 于是每条未 scoped 在册件都被查成「无此件」，通道判据静默全绿。
  assert.equal(ch.bareName('billion-context-dsh'), 'billion-context-dsh');
  assert.equal(ch.bareName(''), '');
  assert.equal(ch.bareName(undefined), '');
});

// ---- parseRepoSlug ---------------------------------------------------------

test('parseRepoSlug：四种真实 repository 形态归一到同一个 owner/repo 小写 slug', () => {
  const want = 'hanaayane/dsh-reasoning-effort';
  for (const form of [
    'git+https://github.com/HanaAyane/dsh-reasoning-effort.git',
    'https://github.com/HanaAyane/dsh-reasoning-effort',
    'github.com/HanaAyane/dsh-reasoning-effort',
    'git@github.com:HanaAyane/dsh-reasoning-effort.git',
    { type: 'git', url: 'git+https://github.com/HanaAyane/dsh-reasoning-effort.git', directory: 'packages/x' },
  ]) {
    assert.equal(ch.parseRepoSlug(form), want, '形态没归一: ' + JSON.stringify(form));
  }
  // 反证：拿不到 slug 时必须交回 null，**不许**把单段路径猜成 owner-only（那会让
  // 「我们 vs 远端」的两条不同 owner 判成 same）。
  assert.equal(ch.parseRepoSlug('https://github.com/only-owner'), null);
  assert.equal(ch.parseRepoSlug(undefined), null);
  assert.equal(ch.parseRepoSlug({}), null);
  assert.equal(ch.parseRepoSlug(''), null);
  // 反证：slug 大小写不敏感，但 owner 与 repo 不可互换。
  assert.equal(ch.parseRepoSlug('github.com/A/B'), 'a/b');
  assert.notEqual(ch.parseRepoSlug('github.com/B/A'), ch.parseRepoSlug('github.com/A/B'));
});

// ---- versionBucket ---------------------------------------------------------

test('versionBucket：四态 + 预发布/缺段/前导 v 三个边界都跟 versions.js 同源', () => {
  assert.equal(ch.versionBucket('0.3.0', '0.3.1'), 'theirs-higher');
  assert.equal(ch.versionBucket('0.8.1', '0.2.8'), 'ours-higher'); // 数值分段，不是字典序
  assert.equal(ch.versionBucket('1.0', '1.0.0'), 'equal');
  assert.equal(ch.versionBucket('v1.0.0', '1.0.0'), 'equal');
  // 预发布段低于正式版（versions.js 的口径）：本机是 rc 而远端已发正式，就是「他们更高」。
  assert.equal(ch.versionBucket('0.2.0-rc.1', '0.2.0'), 'theirs-higher');
  assert.equal(ch.versionBucket('0.2.0', '0.2.0-rc.1'), 'ours-higher');
  // 反证：远端缺值是 absent，绝不能与 equal 互换——把「未发布」记成「等版」
  // 会让台账看起来已对账，实际一次都没比过。
  for (const missing of [undefined, null, '']) {
    assert.equal(ch.versionBucket('0.3.0', missing), 'absent', JSON.stringify(missing) + ' 没判 absent');
  }
});

// ---- identityVerdict -------------------------------------------------------

test('identityVerdict：四值各有唯一触发形态，same/foreign 只由 slug 等不等决定', () => {
  const mk = (local, remote) => ch.identityVerdict({ localRepository: local, remoteRepository: remote });
  const ok = 'git+https://github.com/omdsh-dev/DSH-better-sidebar.git';
  assert.equal(mk(ok, ok), 'same');
  // 反证：只改远端 owner 一格，必须从 same 翻成 foreign（不是 unverifiable、更不是 unknown）。
  assert.equal(mk(ok, 'git+https://github.com/Mu-scorpio/dsh-reasoning-effort.git'), 'foreign');
  // 本地不自述、远端自述 → unverifiable；远端连自己是谁都没说 → unknown。两者不可混。
  assert.equal(mk(undefined, 'git+https://github.com/hkkz9522/dsh-session-manager.git'), 'unverifiable');
  assert.equal(mk(undefined, undefined), 'unknown');
  assert.notEqual(mk(undefined, undefined), mk(undefined, ok), 'unknown 与 unverifiable 被并成一值');
  // 反证：本地自述但远端缺失时**不能**判 same（没有远端可证），落 unknown。
  assert.equal(mk(ok, undefined), 'unknown');
});

// ---- channelRow：可取判据 --------------------------------------------------

test('channelRow：actionable 只在「d-pack shipped 且更高」或「npm 更高且身份 same」时为真', () => {
  const base = {
    entry: entry('synapse', 'dsh-synapse'),
    localVersion: '0.3.0',
    dpack: { present: true, shipped: true, version: '0.3.1' },
    npm: null,
  };
  // ① d-pack shipped 更高 → 可取
  assert.equal(ch.channelRow(base).actionable, true, 'd-pack shipped 更高却判不可取');
  // ② 同样更高但在 not-shipped/ → 不可取（发布面刻意排除的收录，见 3.5 风险 1/2）
  assert.equal(ch.channelRow({
    ...base,
    dpack: { present: true, shipped: false, notShipped: true, version: '0.9.9' },
  }).actionable, false, 'not-shipped 被当成更新目标');
  // ③ d-pack 无此件、npm 更高且身份 same → 可取（better-sidebar 那一条通道的形状）
  const sameOk = 'git+https://github.com/foo/DSH-x.git';
  assert.equal(ch.channelRow({
    entry: entry('x', 'dsh-x'),
    localVersion: '1.0.0',
    dpack: { present: false },
    npm: { version: '1.1.0', repository: sameOk, localRepository: sameOk, maintainers: [{ name: 'foo' }] },
  }).actionable, true, 'npm 同身份更高却判不可取');
  // ④ npm 版本号更高但身份不可证/外来 → **一律不可取**（#4/#15/#22 的实况）
  for (const npm of [
    { version: '0.6.2', repository: 'git+https://github.com/hkkz9522/dsh-session-manager.git', localRepository: undefined },
    { version: '9.9.9', repository: undefined, localRepository: undefined },
    { version: '9.9.9', repository: 'git+https://github.com/someone-else/dsh-x.git', localRepository: sameOk },
  ]) {
    const row = ch.channelRow({
      entry: entry('x', 'dsh-x'), localVersion: '0.1.0', dpack: { present: false }, npm,
    });
    assert.equal(row.actionable, false, '身份 ' + row.npm.identity + ' 的更高版本被判可取');
    assert.equal(row.npm.bucket, 'theirs-higher', '版本号高低与身份判定被混成一谈');
  }
  // ⑤ 两条通道都等版 → 不可取
  assert.equal(ch.channelRow({
    entry: entry('x', 'dsh-x'), localVersion: '1.0.0',
    dpack: { present: true, shipped: true, version: '1.0.0' },
    npm: { version: '1.0.0', repository: sameOk, localRepository: sameOk },
  }).actionable, false);
});

test('channelRow：d-pack 匹配按裸目录名，包名不同形不影响命中', () => {
  const row = ch.channelRow({
    entry: entry('balance', '@deepseek-ai/dsh-balance'),
    localVersion: '0.1.2',
    dpack: { present: true, shipped: true, version: '0.1.2' },
    npm: null,
  });
  // 反证锚点：dir 必须是裸名——若按 name 直查 d-pack 的 packages/ 目录，
  // `@deepseek-ai/dsh-balance` 永远命不中，26 条命中会塌成 0 条（上轮的假结论）。
  assert.equal(row.dir, 'dsh-balance');
  assert.equal(row.name, '@deepseek-ai/dsh-balance');
  assert.equal(row.dpack.bucket, 'equal');
  assert.equal(row.npm.identity, 'absent', '未查 npm 时必须记 absent 而不是 unknown');
});

// ---- summarize -------------------------------------------------------------

test('summarize：分桶计数与 actionable 名单，且改一行必须动一个桶（防恒真）', () => {
  const rows = [
    ch.channelRow({ entry: entry('a', 'dsh-a'), localVersion: '1.0.0', dpack: { present: true, shipped: true, version: '1.0.0' }, npm: null }),
    ch.channelRow({ entry: entry('b', 'dsh-b'), localVersion: '1.0.0', dpack: { present: true, shipped: true, version: '0.9.0' }, npm: null }),
    ch.channelRow({ entry: entry('c', 'dsh-c'), localVersion: '1.0.0', dpack: { present: true, shipped: true, version: '1.1.0' }, npm: null }),
    ch.channelRow({ entry: entry('d', 'dsh-d'), localVersion: '1.0.0', dpack: { present: false }, npm: null }),
  ];
  const sum = ch.summarize(rows);
  assert.equal(sum.total, 4);
  assert.deepEqual(sum.dpack, { equal: 1, 'ours-higher': 1, 'theirs-higher': 1, absent: 1 });
  assert.deepEqual(sum.npm, { equal: 0, 'ours-higher': 0, 'theirs-higher': 0, absent: 4 });
  assert.deepEqual(sum.actionable, ['c']);
  // 反证：把 c 的版本换成我们更高，actionable 必须清空、ours-higher 必须涨到 2。
  // （若计数是硬编码或 actionable 恒真，这一步就红了。）
  const moved = ch.summarize(rows.map((r) => (r.id === 'c'
    ? { ...r, dpack: { ...r.dpack, bucket: 'ours-higher' }, actionable: false } : r)));
  assert.deepEqual(moved.dpack, { equal: 1, 'ours-higher': 2, 'theirs-higher': 0, absent: 1 });
  assert.deepEqual(moved.actionable, []);
});

// ---- parseLsTreeDirs -------------------------------------------------------

test('parseLsTreeDirs：逐行成集，CRLF/空行/引号路径都归一', () => {
  const set = ch.parseLsTreeDirs('dsh-a\r\n\r\n"dsh-中文"\n"dsh-\\"quoted\\""\n');
  assert.deepEqual([...set].sort(), ['dsh-"quoted"', 'dsh-a', 'dsh-中文']);
  // 反证：空输出交回空集，**不**是含一个空串的集——后者会让 lookup() 全 miss 却看着像跑通了。
  assert.equal(ch.parseLsTreeDirs('').size, 0);
  assert.equal(ch.parseLsTreeDirs(undefined).size, 0);
  assert.equal(ch.parseLsTreeDirs('\n\n').size, 0);
});

// ---- 真数据：本地 package.json 的自述面（无网络） ---------------------------

test('真数据：§4.2 身份列与本地 package.json 的 repository 自述面逐条一致', () => {
  // 这一条把台账的身份判定**下半边**（localRepository）钉在磁盘上：
  // 凡 §4.2 判 same/foreign 的行，本地必须自述 repository；判 unverifiable/unknown 的行必须没有。
  const declares = {
    'dsh-better-sidebar': 'omdsh-dev/dsh-better-sidebar',
    'dsh-easyrewrite': 'renzic-stone/dsh-easyrewrite',
    'dsh-pocket': 'shaobeichen/dsh-pocket',
    'dsh-reasoning-effort': 'hanaayane/dsh-reasoning-effort',
    'dsh-prompt-optimizer': 'winditer/dsh-prompt-optimizer',
  };
  const silent = ['billion-context-dsh', 'dsh-session-manager', 'dsh-input-history', 'dsh-synapse'];
  const read = (dir) => JSON.parse(fs.readFileSync(path.join(PLUGINS, dir, 'package.json'), 'utf8'));
  for (const [dir, slug] of Object.entries(declares)) {
    assert.equal(ch.parseRepoSlug(read(dir).repository), slug,
      dir + ' 的本地自述仓库变了——§4.2 的身份列与「可取」判据要重算');
  }
  for (const dir of silent) {
    assert.equal(ch.parseRepoSlug(read(dir).repository), null,
      dir + ' 现在自述了 repository——它从撞名/分叉改成了可判定身份，§3.5 风险 4/5 与 §4.2 必须同步');
  }
  // 反证：同一对输入下，把 localRepository 换成远端 slug 必须让 unverifiable 翻成 same。
  const remote = 'git+https://github.com/hkkz9522/dsh-session-manager.git';
  const idOf = (local) => ch.identityVerdict({ localRepository: local, remoteRepository: remote });
  assert.equal(idOf(undefined), 'unverifiable');
  assert.equal(idOf(remote), 'same');
  assert.notEqual(idOf('git+https://github.com/us/dsh-session-manager.git'), 'same');
});

test('真数据：在册 28 条的本地裸名目录都实存且 package.json 可解析', () => {
  // channelRow 的 dir 就是磁盘目录名的判据源；这条保证「按裸名匹配」在本地半边不塌。
  const rows = COMPANION_PLUGINS.map((e) => ch.channelRow({
    entry: e, localVersion: '0.0.0', dpack: { present: false }, npm: null,
  }));
  assert.equal(rows.length, 28, '在册条数变了，§4/§5 的分布数要重算');
  for (const row of rows) {
    const pkg = path.join(PLUGINS, row.dir, 'package.json');
    assert.ok(fs.existsSync(pkg), row.id + ' 的目录 ' + row.dir + ' 不在 assets/plugins 下');
    const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    assert.equal(j.name, row.name, row.dir + ' 的包名与清单不一致: ' + j.name + ' vs ' + row.name);
  }
  // 反证：不存在的目录必须被上一条的循环咬住（同判据、换输入）。
  const ghost = ch.channelRow({
    entry: entry('ghost', 'dsh-no-such-plugin'), localVersion: '1.0.0', dpack: { present: false }, npm: null,
  });
  assert.equal(fs.existsSync(path.join(PLUGINS, ghost.dir, 'package.json')), false);
});

// ---- d-pack 通道半边（需本机克隆，缺则 skip） ------------------------------

const dpackSkip = fs.existsSync(path.join(DPACK, '.git'))
  ? false
  : '本机没有 ' + DPACK + ' 克隆（d-pack 通道只在装了发布面仓库的开发机上可重放）';

test('d-pack 发布面：packages/ 与 not-shipped/ 的目录集能真被 ls-tree 抽出', { skip: dpackSkip }, () => {
  const ls = (tree) => ch.parseLsTreeDirs(
    execFileSync('git', ['-C', DPACK, 'ls-tree', '--name-only', 'origin/main:' + tree], { encoding: 'utf8' }));
  const shipped = ls('packages');
  const parked = ls('not-shipped');
  assert.ok(shipped.size >= 30, 'packages/ 只抽出 ' + shipped.size + ' 项，ls-tree 形态已变');
  // 反证：两条「收录但排除发布面」的件必须在 parked 而不在 shipped——
  // 若哪天有人把它们挪回 packages/，§4.1 的「not-shipped 不构成目标」要重述。
  for (const name of ['dsh-side-session', 'dsh-super-injector']) {
    assert.ok(parked.has(name), name + ' 不在 not-shipped/ 了');
    assert.ok(!shipped.has(name), name + ' 已回到发布面 packages/ 下');
  }
  assert.ok(shipped.has('host-capabilities') && shipped.has('meta-all'),
    'packages/ 下的两个非插件目录（host-capabilities / meta-all）没抽到——扫描器的排除名单已失配，§4.1 的 32 要重算');
  // 反证：按**包名**查目录必然落空（d-pack 的包名是 `@dsh-pack/<裸名>`），
  // 这正是「匹配必须按目录名」那条禁令的现场证据。
  assert.ok(!shipped.has('@dsh-pack/dsh-balance'),
    'd-pack 目录里出现了 scoped 目录名，按名匹配的禁令要重新核');
  assert.ok(shipped.has('dsh-balance'), 'd-balance 目录名没抽到，判据脱靶');
});
