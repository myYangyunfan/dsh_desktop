'use strict';

// 插件集成门面（scripts/integration/index.js）单元测试（node --test）。
// 覆盖：createPluginIntegration().run() 闭包返回 { syncResult, patchReport,
// healthReport }，且 run() 解构后调用不依赖 this 绑定（门面聚合不崩）。
//
// 隔离：getHome / getUserDataDir / appDir / installAnchor 均注入 mkdtemp，
// 绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPluginIntegration } = require('../integration/index');

test('createPluginIntegration().run()：解构后调用返回 { syncResult, patchReport, healthReport }', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-ud-'));
  const anchor = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-anchor-'));
  t.after(() => {
    for (const d of [home, appDir, userDataDir, anchor]) fs.rmSync(d, { recursive: true, force: true });
  });

  const opts = {
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => false,
    log: () => {},
    loadYaml: () => null,
    loadSettings: () => ({}),
    saveSettings: () => {},
    getInstallAnchorDir: () => anchor,
    hostDetectors: { openPath: () => true, deleteSession: () => true },
  };

  const integration = createPluginIntegration(opts);
  // 解构后调用：验证 run() 不依赖 this 绑定。
  const { run } = integration;
  const result = run();

  assert.deepEqual(Object.keys(result).sort(), ['healthReport', 'patchReport', 'syncResult'], 'run() 应返回三字段');
  // patchReport 来自 applyAll：含 total/changed/degraded/warnings/errors 等结构化字段。
  assert.equal(typeof result.patchReport.total, 'number', 'patchReport.total 应为数字');
  assert.ok(Array.isArray(result.patchReport.degraded), 'patchReport.degraded 应为数组');
  assert.ok(Array.isArray(result.patchReport.errors), 'patchReport.errors 应为数组');
  // healthReport 来自 preflight：空隔离 home 无 manifest → 早退。
  assert.deepEqual(result.healthReport, { scanned: 0, unpatched: [] }, 'healthReport 应为 preflight 早退结果');
});

// boot repair 链接线回归（issue #177）：healBeforeServer 必须在内核拉起前把
// profile manifest 里的 @deepseek-ai 孤儿依赖剪掉——闭包取自合成 appDir 的
// kernel-pin.json + vendor/dsh-kernel 名单（本地确定性证据，不联网）。
test('healBeforeServer()：profile 孤儿依赖在 boot repair 步被自愈（issue #177 接线）', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-ud-'));
  const anchor = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-anchor-'));
  t.after(() => {
    for (const d of [home, appDir, userDataDir, anchor]) fs.rmSync(d, { recursive: true, force: true });
  });

  // 合成 appDir：pin=0.1.2-alpha.5 + 两个内核 tarball 名（dsh / dsh-base）。
  const WANT = '0.1.2-alpha.5';
  fs.mkdirSync(path.join(appDir, 'scripts', 'compat'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'scripts', 'compat', 'kernel-pin.json'), JSON.stringify({
    kernel: { tag: 'dsh-v' + WANT, packageVersion: WANT, acquisition: 'offline-tarball', pinPolicy: '精确 pin', vendorDir: 'vendor/dsh-kernel' },
    services: { required: [{ id: 'core', module: '@deepseek-ai/dsh' }] },
    protocols: {},
  }));
  fs.mkdirSync(path.join(appDir, 'vendor', 'dsh-kernel'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'vendor', 'dsh-kernel', 'deepseek-ai-dsh-' + WANT + '.tgz'), 'p');
  fs.writeFileSync(path.join(appDir, 'vendor', 'dsh-kernel', 'deepseek-ai-dsh-base-' + WANT + '.tgz'), 'p');

  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  const manifestFile = path.join(profileDir, 'package.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: {
      '@deepseek-ai/cordis-plugin-timer': '1.1.4', // 孤儿：闭包内没有 → 应剪
      '@deepseek-ai/dsh-base': WANT,               // 闭包内 → 保留
      '@vlln/cordis': '^1.0.0',                    // 非内核 scope → 保留
    },
  }, null, 2) + '\n');

  const logs = [];
  const integration = createPluginIntegration({
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => false,
    log: (m) => logs.push(String(m)),
    loadYaml: () => null,
    loadSettings: () => ({}),
    saveSettings: () => {},
    getInstallAnchorDir: () => anchor,
    hostDetectors: { openPath: () => true, deleteSession: () => true },
  });
  const { healBeforeServer } = integration;
  await healBeforeServer();

  const after = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.ok(!('@deepseek-ai/cordis-plugin-timer' in after.dependencies),
    'boot repair 步应已剪掉孤儿依赖（否则内核 boot 会 ERR_MODULE_NOT_FOUND 退出）');
  assert.equal(after.dependencies['@deepseek-ai/dsh-base'], WANT, '闭包内包不得动');
  assert.equal(after.dependencies['@vlln/cordis'], '^1.0.0', '用户第三方不得动');
  assert.ok(fs.readdirSync(profileDir).some((f) => f.startsWith('package.json.heal-orphan-')), '原 manifest 应留备份');
  assert.ok(logs.every((l) => !/孤儿依赖自愈异常/.test(l)), 'repair 步不得抛异常: ' + logs.join(' | '));
});

// boot repair 链接线回归（mac 端 9 伴随插件 failed to load + 首启「未能保存设置」
// 真根因，2026-10-11 取证）：profile 里 pnpm `npm:` 别名链接
//   profiles/web/node_modules/@deepseek-ai/cosmokit -> <profile>/cosmokit（1.8.1，无 createVolatile）
// 会把 scoped 规格符劫持到别的包上，importer 在 ESM 链接期 SyntaxError → 条目没有
// fiber → 隔离行只剩「failed to load」。原为此写的 healProfileModuleShadowing 只在
// guard-* 子命令里跑，boot 链从不触及——本用例锁「接线」本身，防止再退回去。
test('healBeforeServer()：profile 别名链接在 boot repair 步被摘除（接线回归）', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-alias-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-alias-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-alias-ud-'));
  const anchor = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-alias-anchor-'));
  t.after(() => {
    for (const d of [home, appDir, userDataDir, anchor]) fs.rmSync(d, { recursive: true, force: true });
  });

  const writePkg = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf8');
    return dir;
  };
  // payload 闭包（健康源）+ 共享 farm 链接 + profile 里的未 scoped 副本与别名。
  const payload = writePkg(path.join(appDir, 'node_modules', '@deepseek-ai', 'cosmokit'), '@deepseek-ai/cosmokit');
  const farm = path.join(home, 'profiles', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(farm, { recursive: true });
  fs.symlinkSync(payload, path.join(farm, 'cosmokit'), 'junction');
  const profNm = path.join(home, 'profiles', 'web', 'node_modules');
  const unscoped = writePkg(path.join(profNm, 'cosmokit'), 'cosmokit');
  fs.mkdirSync(path.join(profNm, '@deepseek-ai'), { recursive: true });
  fs.symlinkSync(unscoped, path.join(profNm, '@deepseek-ai', 'cosmokit'), 'junction');

  const logs = [];
  const integration = createPluginIntegration({
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => false,
    log: (m) => logs.push(String(m)),
    loadYaml: () => null,
    loadSettings: () => ({}),
    saveSettings: () => {},
    getInstallAnchorDir: () => anchor,
    hostDetectors: { openPath: () => true, deleteSession: () => true },
  });
  await integration.healBeforeServer();

  assert.throws(() => fs.lstatSync(path.join(profNm, '@deepseek-ai', 'cosmokit')),
    'boot repair 步必须已摘除别名链接，否则 profile 永远解析到 1.8.1（本次故障本体）');
  assert.ok(fs.existsSync(path.join(profNm, 'cosmokit', 'package.json')), '未 scoped 副本是真需求，不得动');
  assert.equal(fs.realpathSync(path.join(farm, 'cosmokit')), fs.realpathSync(payload), 'farm 健康链接必须原样');
  assert.ok(logs.some((l) => /已摘除 profile \[web\] 的别名\/悬空链接 1 条/.test(l)), '必须落一行可 grep 的日志: ' + logs.join(' | '));
  assert.ok(logs.every((l) => !/别名链接自愈异常/.test(l)), 'repair 步不得抛异常: ' + logs.join(' | '));

  // 幂等：boot 每次都跑，二遍必须零动作零日志增量。
  // 判据必须带「阳性对照」，否则第二个实例若根本没跑起来（opts 传丢），断言会空转
  // 通过——integration 上没有 .opts，唯一的真 opts 句柄是 .ctx（曾在此踩过假绿）。
  const logs2 = [];
  await createPluginIntegration({ ...integration.ctx, log: (m) => logs2.push(String(m)) }).healBeforeServer();
  assert.ok(!logs2.some((l) => /别名\/悬空链接/.test(l)), '二遍不该再有摘除动作: ' + logs2.join(' | '));
  assert.ok(logs2.every((l) => !/自愈异常/.test(l)), '二遍 repair 链不得异常（异常=该实例没跑起来）: ' + logs2.join(' | '));
  // 阳性对照：把别名链接造回去，同一套 opts 必须再次摘掉并落日志——证明上面的
  // 「二遍零动作」是幂等，不是静默停摆。
  fs.symlinkSync(unscoped, path.join(profNm, '@deepseek-ai', 'cosmokit'), 'junction');
  const logs3 = [];
  await createPluginIntegration({ ...integration.ctx, log: (m) => logs3.push(String(m)) }).healBeforeServer();
  assert.ok(logs3.some((l) => /已摘除 profile \[web\] 的别名\/悬空链接 1 条/.test(l)), '阳性对照必须再次生效: ' + logs3.join(' | '));
  assert.throws(() => fs.lstatSync(path.join(profNm, '@deepseek-ai', 'cosmokit')), '阳性对照后别名必须已摘');
});
