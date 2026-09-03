'use strict';

// profile-orphan-dep-heal 单元测试（issue #177）：boot repair 步回收 profile
// manifest 里的 `@deepseek-ai/*` 孤儿依赖（v0.5.3 写入器遗留 → 内核 boot
// ERR_MODULE_NOT_FOUND 启动期退出）。
//
// 断言红线：
//   - 孤儿（不在内核闭包 / 非内置配套件 / profile 内无实体）→ 剪除，原文件有备份；
//   - 闭包内 / 非 @deepseek-ai scope / 协议 spec / bundles 仍登记 / profile 内实装 → 一律不动；
//   - manifest 解析失败 → 容忍跳过，文件字节不变；
//   - 健康 profile → 零写入 no-op（不产生备份）；
//   - 多 profile → 逐个都过一遍；单个异常不影响其他；
//   - 闭包证据不可用（pin / vendor 读不到）→ 整体放弃，绝不凭猜测剪；
//   - 幂等：清干净后二次运行 no-op；
//   - dryRun → 只报告，零落盘。
// 隔离：全部对 mkdtemp 合成 appDir / home 操作，绝不触碰真实 ~/.dsh 与 vendor 包。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  KERNEL_SCOPE,
  kernelClosureNames,
  companionNames,
  listProfileDirs,
  classifyProfileDependencies,
  healOneProfile,
  healProfileOrphanDeps,
} = require('../lib/profile-orphan-dep-heal');

const WANT = '0.1.2-alpha.5';
const ORPHAN = '@deepseek-ai/cordis-plugin-timer';

/** 合成 appDir：kernel-pin.json + vendor/dsh-kernel/*.tgz（与 vendor-kernel-heal 同法）。 */
function makeAppDir(t, tarballs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-orphan-app-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pinDir = path.join(root, 'scripts', 'compat');
  fs.mkdirSync(pinDir, { recursive: true });
  fs.writeFileSync(path.join(pinDir, 'kernel-pin.json'), JSON.stringify({
    kernel: {
      tag: 'dsh-v' + WANT,
      packageVersion: WANT,
      acquisition: 'offline-tarball',
      pinPolicy: '精确 pin 禁止浮动',
      vendorDir: path.join('vendor', 'dsh-kernel'),
    },
    services: { required: [{ id: 'core', module: '@deepseek-ai/dsh' }], removed: [] },
    protocols: { tui: 'dsh://x' },
  }, null, 2));
  const vdir = path.join(root, 'vendor', 'dsh-kernel');
  fs.mkdirSync(vdir, { recursive: true });
  for (const f of tarballs) fs.writeFileSync(path.join(vdir, f), 'payload');
  return { root, vdir };
}

/** 合成 home：写 profiles/<name>/package.json（content 为对象则序列化）。 */
function makeProfile(t, home, name, content) {
  const dir = path.join(home, 'profiles', name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'package.json');
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
  fs.writeFileSync(file, text);
  return { dir, file, text };
}

function makeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-orphan-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  return home;
}

const CLOSURE = new Set(['@deepseek-ai/dsh', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-agent']);
const COMPANIONS = new Set(['@deepseek-ai/dsh-mini', '@deepseek-ai/dsh-balance']);

// ---------------------------------------------------------------------------
// 六个核心场景
// ---------------------------------------------------------------------------

test('① 孤儿依赖被剪除，原 manifest 有备份，其余条目与字段不动', (t) => {
  const home = makeHome(t);
  const { dir, file } = makeProfile(t, home, 'web', {
    name: 'dsh-profile-web',
    dependencies: {
      [ORPHAN]: '1.1.4',
      '@deepseek-ai/dsh': '^0.1.2',
      lodash: '^4.17.21',
    },
    devDependencies: { foo: '1.0.0' },
  });

  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, true, '应发生剪除');
  assert.equal(r.removedTotal, 1);
  assert.deepEqual(r.profiles[0].removed, [ORPHAN]);

  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(!('cordis-plugin-timer' in (after.dependencies || {})), '孤儿条目应消失');
  assert.ok(!Object.keys(after.dependencies).includes(ORPHAN));
  assert.equal(after.dependencies['@deepseek-ai/dsh'], '^0.1.2', '闭包内包保留');
  assert.equal(after.dependencies.lodash, '^4.17.21', '第三方保留');
  assert.equal(after.devDependencies.foo, '1.0.0', '其他字段不动');
  assert.equal(after.name, 'dsh-profile-web');

  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('package.json.heal-orphan-'));
  assert.equal(backups.length, 1, '应留下恰好一份备份');
  const backupRaw = fs.readFileSync(path.join(dir, backups[0]), 'utf8');
  assert.ok(backupRaw.includes(ORPHAN), '备份内容必须是原文件（含孤儿条目）');
  assert.ok(!backupRaw.includes('﻿'), '写入不得带 BOM');
});

test('② 内核闭包内的 @deepseek-ai 包不动', (t) => {
  const home = makeHome(t);
  const { file, text } = makeProfile(t, home, 'web', {
    dependencies: {
      '@deepseek-ai/dsh': '0.1.2-alpha.5',
      '@deepseek-ai/dsh-base': '0.1.2-alpha.5',
      '@deepseek-ai/dsh-mini': '0.3.0', // 内置配套件（非闭包）同样不动
    },
  });
  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), text, '字节不变');
});

test('③ 非 @deepseek-ai scope 一律不动（含不存在的第三方包名）', (t) => {
  const home = makeHome(t);
  const { dir, file, text } = makeProfile(t, home, 'web', {
    dependencies: {
      'totally-nonexistent-pkg': '9.9.9',
      '@vlln/cordis': '^1.2.3',
      '@some-user/private': '^0.0.1',
    },
  });
  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false, '绝不剪用户自己的依赖');
  assert.equal(r.removedTotal, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('heal-orphan')), [], '不留备份');
});

test('④ manifest 解析失败 → 容忍跳过，文件不动', (t) => {
  const home = makeHome(t);
  const { dir, file } = makeProfile(t, home, 'web', '{ "dependencies": { ' + JSON.stringify(ORPHAN) + ': "1.1.4" }  BROKEN');
  const before = fs.readFileSync(file, 'utf8');
  const logs = [];
  const r = healProfileOrphanDeps({
    appDir: null, home, log: (m) => logs.push(m),
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'manifest-parse-failed', '应回报容忍原因');
  assert.equal(fs.readFileSync(file, 'utf8'), before, '坏文件必须原样保留');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('heal-orphan')), [], '解析失败不留备份');
  assert.ok(logs.some((l) => /解析失败/.test(l)), '应打日志');
});

test('⑤ 无孤儿 → 零开销 no-op（不写文件、不打扰）', (t) => {
  const home = makeHome(t);
  const { dir, file, text } = makeProfile(t, home, 'web', {
    dependencies: { '@deepseek-ai/dsh': '^0.1.2', '@deepseek-ai/dsh-mini': '^0.3.0', react: '^19.0.0' },
  });
  const logs = [];
  const r = healProfileOrphanDeps({
    appDir: null, home, log: (m) => logs.push(m),
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false);
  assert.equal(r.removedTotal, 0);
  assert.equal(r.profiles.length, 1, 'profile 仍被遍历并回报');
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.equal(fs.readdirSync(dir).length, 1, '健康 profile 目录不得多出任何文件');
  assert.equal(logs.length, 0, '健康路径零日志噪声');
});

test('⑥ 多 profile 逐个自愈，单个坏 manifest 不影响其他', (t) => {
  const home = makeHome(t);
  const a = makeProfile(t, home, 'web', { dependencies: { [ORPHAN]: '1.1.4' } });
  const b = makeProfile(t, home, 'coding', {
    dependencies: { '@deepseek-ai/dsh-third-party-thinking': '0.1.0', '@deepseek-ai/dsh': '^0.1.2' },
  });
  makeProfile(t, home, 'broken', 'not json at all {{{');
  fs.mkdirSync(path.join(home, 'profiles', 'node_modules', '@deepseek-ai'), { recursive: true });
  fs.mkdirSync(path.join(home, 'profiles', '.staging'), { recursive: true });

  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, true);
  assert.equal(r.removedTotal, 2, 'web + coding 各剪一条');
  assert.equal(r.profiles.length, 3, '三个 profile 都被遍历（farm / .staging 除外）');
  assert.ok(!fs.readFileSync(a.file, 'utf8').includes('cordis-plugin-timer'));
  assert.ok(!fs.readFileSync(b.file, 'utf8').includes('dsh-third-party-thinking'));
  assert.deepEqual(JSON.parse(fs.readFileSync(b.file, 'utf8')).dependencies, { '@deepseek-ai/dsh': '^0.1.2' },
    'coding 只剪孤儿，闭包内包保留');
  assert.equal(fs.readFileSync(path.join(home, 'profiles', 'broken', 'package.json'), 'utf8'), 'not json at all {{{');
});

// ---------------------------------------------------------------------------
// 保护面与放弃面
// ---------------------------------------------------------------------------

test('⑦ 协议 spec / bundles 仍登记 / profile 内实装 → 三种保护面都不动', (t) => {
  const home = makeHome(t);
  const { dir, file, text } = makeProfile(t, home, 'web', {
    dependencies: {
      '@deepseek-ai/dsh-local-dev': 'link:../../src/dsh-local-dev',
      '@deepseek-ai/dsh-from-tarball': 'file:../vendor/x.tgz',
      '@deepseek-ai/dsh-aliased': 'npm:@deepseek-ai/dsh@0.1.2-alpha.5',
      '@deepseek-ai/dsh-still-bundled': '^1.0.0',
      '@deepseek-ai/dsh-actually-installed': '^1.0.0',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-still-bundled'] } },
  });
  const inst = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-actually-installed');
  fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'package.json'), '{"name":"@deepseek-ai/dsh-actually-installed"}');

  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false, '三种保护面全部命中，零剪除');
  assert.equal(fs.readFileSync(file, 'utf8'), text);

  const { orphans, kept } = classifyProfileDependencies({
    manifest: { dependencies: { 'bad-name': '1.0.0' } }, closure: CLOSURE, companions: COMPANIONS, profileDir: dir,
  });
  assert.deepEqual(orphans, [], '非 @deepseek-ai scope 不判孤儿');
  assert.deepEqual(kept, ['bad-name']);
});

test('⑧ dependencies 剪空后整体移除该键（不留空对象）', (t) => {
  const home = makeHome(t);
  const { file } = makeProfile(t, home, 'web', { name: 'p', dependencies: { [ORPHAN]: '1.1.4' } });
  const r = healOneProfile({ profileDir: path.dirname(file), closure: CLOSURE, companions: COMPANIONS, log: () => {} });
  assert.deepEqual(r.removed, [ORPHAN]);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(!('dependencies' in after), '空 dependencies 键应被移除');
  assert.equal(after.name, 'p');
});

test('⑨ 闭包证据不可用 → 整体放弃，一个字节都不改', (t) => {
  const home = makeHome(t);
  const { file, text } = makeProfile(t, home, 'web', { dependencies: { [ORPHAN]: '1.1.4' } });
  for (const inject of [{ closure: null, companions: COMPANIONS }, { closure: CLOSURE, companions: null }]) {
    const r = healProfileOrphanDeps({ appDir: null, home, log: () => {}, inject });
    assert.equal(r.changed, false);
    assert.equal(r.profiles.length, 0, '放弃时不遍历 profile');
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  const r0 = healProfileOrphanDeps({ appDir: null, home: '', log: () => {} });
  assert.equal(r0.note, 'no-home');
});

test('⑩ kernelClosureNames 真实读 pin + vendor 名单（tarball 名还原包名），不可用时 null', (t) => {
  const { root } = makeAppDir(t, [
    'deepseek-ai-dsh-' + WANT + '.tgz',
    'deepseek-ai-dsh-base-' + WANT + '.tgz',
    'deepseek-ai-dsh-cordis-vlln-' + WANT + '.tgz',
    'deepseek-ai-dsh-' + '0.1.2-alpha.4' + '.tgz', // 陈旧版本 → 不入闭包
    'some-other-pkg-' + WANT + '.tgz',            // 非 @deepseek-ai 前缀 → 忽略
    'README.md',
  ]);
  const closure = kernelClosureNames({ appDir: root, log: () => {} });
  assert.ok(closure instanceof Set);
  assert.deepEqual([...closure].sort(), [
    '@deepseek-ai/dsh', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-cordis-vlln',
  ], '版本后缀必须精确剥离（含 -vlln 这类带连字符的包名）');

  // pin 不可读 / vendor 为空 → null（调用方整体放弃）
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-orphan-nopin-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  assert.equal(kernelClosureNames({ appDir: bare, log: () => {} }), null);
  const { root: emptyRoot } = makeAppDir(t, []);
  assert.equal(kernelClosureNames({ appDir: emptyRoot, log: () => {} }), null, '空名单不得据以判孤儿');
});

test('⑪ 闭包由真实 vendor 名单驱动时，#177 现场被修复且内核包保留', (t) => {
  const { root } = makeAppDir(t, ['deepseek-ai-dsh-' + WANT + '.tgz', 'deepseek-ai-dsh-base-' + WANT + '.tgz']);
  const home = makeHome(t);
  const { file } = makeProfile(t, home, 'web', {
    dependencies: {
      '@deepseek-ai/dsh-base': WANT,
      [ORPHAN]: '1.1.4',
      '@deepseek-ai/dsh-not-in-tarball': '0.2.0',
    },
  });
  const r = healProfileOrphanDeps({ appDir: root, home, log: () => {}, inject: { companions: COMPANIONS } });
  assert.equal(r.removedTotal, 2);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(after.dependencies, { '@deepseek-ai/dsh-base': WANT });
  // 幂等：二次运行 no-op
  const r2 = healProfileOrphanDeps({ appDir: root, home, log: () => {}, inject: { companions: COMPANIONS } });
  assert.equal(r2.changed, false, '二次运行必须 no-op');
  assert.equal(fs.readdirSync(path.dirname(file)).filter((f) => f.includes('heal-orphan')).length, 1, '不重复备份');
});

test('⑫ listProfileDirs 只认真实 profile 目录', (t) => {
  const home = makeHome(t);
  makeProfile(t, home, 'web', {});
  makeProfile(t, home, 'coding', {});
  fs.mkdirSync(path.join(home, 'profiles', 'node_modules', 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(home, 'profiles', '.staging'), { recursive: true });
  fs.writeFileSync(path.join(home, 'profiles', 'loose-file.txt'), 'x');
  const dirs = listProfileDirs(home);
  assert.deepEqual(dirs.map((d) => path.basename(d)), ['coding', 'web'], '排序且排除 farm / 点目录 / 文件');
  assert.deepEqual(listProfileDirs(path.join(home, 'nowhere')), [], 'home 不存在 → 空数组');
  assert.ok(KERNEL_SCOPE === '@deepseek-ai/');
  assert.ok(companionNames() === null || companionNames() instanceof Set, '配套件名单可读或明确不可用');
});

test('⑬ dryRun 只报告零落盘', (t) => {
  const home = makeHome(t);
  const { dir, file, text } = makeProfile(t, home, 'web', { dependencies: { [ORPHAN]: '1.1.4', lodash: '^4' } });
  const r = healProfileOrphanDeps({
    appDir: null, home, dryRun: true, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.deepEqual(r.profiles[0].removed, [ORPHAN], '仍报告将剪除项');
  assert.equal(fs.readFileSync(file, 'utf8'), text, '文件不得改动');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('heal-orphan')), [], '不得产生备份');
});

test('⑭ 无 package.json 的未初始化 profile → 跳过不动它', (t) => {
  const home = makeHome(t);
  fs.mkdirSync(path.join(home, 'profiles', 'fresh'), { recursive: true });
  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'manifest-unreadable');
  assert.equal(fs.readdirSync(path.join(home, 'profiles', 'fresh')).length, 0, '绝不凭空创建 manifest');
});

test('⑮ 共享 farm（安装闭包）能提供的 npm 闭包件 → 不判孤儿', (t) => {
  const home = makeHome(t);
  const { file, text } = makeProfile(t, home, 'web', {
    dependencies: {
      '@deepseek-ai/schemastery': '^3.18.2',        // 随客户端 npm 闭包分发，不在 vendor tarball
      '@deepseek-ai/cordis-plugin-group': '^1.0.2', // package.json 里登记的 cordis 家族件
      [ORPHAN]: '1.1.4',                              // farm 里没有 → 仍应剪
    },
  });
  const farm = path.join(home, 'profiles', 'node_modules', '@deepseek-ai');
  for (const n of ['schemastery', 'cordis-plugin-group']) {
    fs.mkdirSync(path.join(farm, n), { recursive: true });
    fs.writeFileSync(path.join(farm, n, 'package.json'), JSON.stringify({ name: '@deepseek-ai/' + n }));
  }
  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.deepEqual(r.profiles[0].removed, [ORPHAN], '只剪 farm 也提供不了的孤儿');
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.dependencies['@deepseek-ai/schemastery'], '^3.18.2', '可解析的闭包件不得误剪');
  assert.equal(after.dependencies['@deepseek-ai/cordis-plugin-group'], '^1.0.2');
  assert.ok(text.includes('"' + ORPHAN + '"'), '前置条件：原文件确实声明了孤儿');
});

test('⑯ farm 有货但 profile 内是坏 shadow（无 package.json）→ 仍剪声明', (t) => {
  const home = makeHome(t);
  const { dir, file } = makeProfile(t, home, 'web', { dependencies: { '@deepseek-ai/dsh-broken-shadow': '^1.0.0' } });
  const farm = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-broken-shadow');
  fs.mkdirSync(farm, { recursive: true });
  fs.writeFileSync(path.join(farm, 'package.json'), '{"name":"@deepseek-ai/dsh-broken-shadow"}');
  fs.mkdirSync(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-broken-shadow'), { recursive: true });

  const r = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.deepEqual(r.profiles[0].removed, ['@deepseek-ai/dsh-broken-shadow'],
    '坏 shadow 会抢先命中解析（NOT_FOUND 根源），farm 在位不构成保留理由');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('dsh-broken-shadow'));
  // 反向：profile 内好好装着 → 不剪（与 ⑧ 同一保护面）
  fs.writeFileSync(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-broken-shadow', 'package.json'),
    '{"name":"@deepseek-ai/dsh-broken-shadow"}');
  makeProfile(t, home, 'second', { dependencies: { '@deepseek-ai/dsh-broken-shadow': '^1.0.0' } });
  const r2 = healProfileOrphanDeps({
    appDir: null, home, log: () => {},
    inject: { closure: CLOSURE, companions: COMPANIONS },
  });
  assert.equal(r2.changed, false, '实装在位 + farm 可解析 → 零剪除');
});

