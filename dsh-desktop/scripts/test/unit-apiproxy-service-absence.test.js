'use strict';

// unit-apiproxy-service-absence.test.js —— 服务缺席诊断模块（issue #176）单测。
//
// 覆盖：
//   1) 已移除服务登记表（apiProxy）事实面；
//   2) inject 源码解析（export const / exports.inject / 对象字面量 inject: /
//      多行数组 / 三种引号 / 注释与变量引用忽略 / 保序去重）；
//   3) diagnoseServiceAbsence 命中移除服务、禁用插件不产噪音、非移除服务不误报；
//   4) 诊断文案含「依赖已移除服务 / pending / 改用 typertGateway」；
//   5) scanInstalledPlugins 走真实临时目录（第三方插件包）；
//   6) runServiceAbsenceDiagnosis 产出 [service-absence] 日志并调用 log；
//   7) cliMain 退出码契约（有诊断非 0 / 无诊断 0）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  REMOVED_SERVICES,
  removedServices,
  parseInjectFromSource,
  extractStrings,
  diagnoseServiceAbsence,
  formatFindingMessage,
  defaultPluginPackageFilter,
  scanInstalledPlugins,
  runServiceAbsenceDiagnosis,
  cliMain,
} = require('../integration/service-absence');

// ---------------------------------------------------------------------------
// 1) 登记表事实面
// ---------------------------------------------------------------------------
test('removedServices：登记 apiProxy 且带版本与替代能力', () => {
  const list = removedServices();
  const api = list.find((s) => s.service === 'apiProxy');
  assert.ok(api, '应登记 apiProxy');
  assert.equal(api.removedInKernel, '0.1.2-alpha.5');
  assert.deepEqual(api.replacements, ['typertGateway', 'webServer']);
  assert.equal(REMOVED_SERVICES.apiProxy.formerPackage, '@deepseek-ai/dsh-host-apiproxy');
});

// ---------------------------------------------------------------------------
// 2) inject 解析
// ---------------------------------------------------------------------------
test('parseInjectFromSource：export const inject 数组', () => {
  const src = `export const inject = ['webServer', 'apiProxy', 'typertGateway']`;
  assert.deepEqual(parseInjectFromSource(src), ['webServer', 'apiProxy', 'typertGateway']);
});

test('parseInjectFromSource：exports.inject = [...]（双引号）', () => {
  const src = `const name='x';\nexports.inject = ["apiProxy", "slots"];\n`;
  assert.deepEqual(parseInjectFromSource(src), ['apiProxy', 'slots']);
});

test('parseInjectFromSource：对象字面量 inject: [...]（反引号 + 多行）', () => {
  const src = [
    'const plugin = {',
    "  name: 'mobile-gateway',",
    '  inject: [',
    '    `webServer`,',
    "    'apiProxy',",
    '    // 注释里的 apiProxy 不算，变量引用也不算',
    '    someVar,',
    "    'typertGateway',",
    '  ],',
    '  apply() {}',
    '}',
  ].join('\n');
  const parsed = parseInjectFromSource(src);
  assert.deepEqual(parsed, ['webServer', 'apiProxy', 'typertGateway']);
});

test('parseInjectFromSource：多处 inject 取并集且保序去重', () => {
  const src = `export const inject = ['a','b']\nfunction f(){ return { inject: ['b','c'] } }`;
  assert.deepEqual(parseInjectFromSource(src), ['a', 'b', 'c']);
});

test('parseInjectFromSource：空/非串安全', () => {
  assert.deepEqual(parseInjectFromSource(''), []);
  assert.deepEqual(parseInjectFromSource(null), []);
  assert.deepEqual(parseInjectFromSource(undefined), []);
  assert.deepEqual(parseInjectFromSource('const inject = 42'), []);
});

test('extractStrings：去引号转义', () => {
  assert.deepEqual(extractStrings(`'a', "b", \`c\``), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// 3) 诊断核心
// ---------------------------------------------------------------------------
test('diagnoseServiceAbsence：命中 apiProxy → 一条 removed 诊断', () => {
  const findings = diagnoseServiceAbsence([
    { id: 'mobile-gateway', name: 'dsh-plugin-mobile-gateway', inject: ['webServer', 'apiProxy', 'typertGateway'] },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].service, 'apiProxy');
  assert.equal(findings[0].kind, 'removed');
  assert.equal(findings[0].plugin.name, 'dsh-plugin-mobile-gateway');
});

test('diagnoseServiceAbsence：非移除服务不误报（webServer/typertGateway 全在位）', () => {
  const findings = diagnoseServiceAbsence([
    { id: 'ok-plugin', inject: ['webServer', 'typertGateway', 'agentDefaultModel'] },
  ]);
  assert.equal(findings.length, 0);
});

test('diagnoseServiceAbsence：禁用插件不产噪音', () => {
  const findings = diagnoseServiceAbsence([
    { id: 'p', inject: ['apiProxy'], enabled: false },
  ]);
  assert.equal(findings.length, 0);
});

test('diagnoseServiceAbsence：inject 传源码文本也能解析', () => {
  const findings = diagnoseServiceAbsence([
    { id: 'p', name: 'x', inject: `export const inject = ['apiProxy']` },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].service, 'apiProxy');
});

// ---------------------------------------------------------------------------
// 4) 诊断文案
// ---------------------------------------------------------------------------
test('formatFindingMessage：含服务名 / pending / 替代能力关键字', () => {
  const msg = formatFindingMessage({
    plugin: { name: 'dsh-plugin-mobile-gateway' },
    service: 'apiProxy',
    removed: REMOVED_SERVICES.apiProxy,
  });
  assert.match(msg, /dsh-plugin-mobile-gateway/);
  assert.match(msg, /apiProxy/);
  assert.match(msg, /pending/);
  assert.match(msg, /typertGateway/);
  assert.match(msg, /webServer/);
  assert.match(msg, /已被内核移除/);
});

// ---------------------------------------------------------------------------
// 5) 安装态扫描（真实临时目录）
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-absence-'));
  const nm = path.join(root, 'node_modules');
  // 命中：第三方插件包（inject apiProxy）
  const bad = path.join(nm, 'dsh-plugin-mobile-gateway', 'lib');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(
    path.join(nm, 'dsh-plugin-mobile-gateway', 'package.json'),
    JSON.stringify({ name: 'dsh-plugin-mobile-gateway', version: '0.6.5', main: 'lib/index.js' }),
  );
  fs.writeFileSync(
    path.join(bad, 'index.js'),
    `const name = 'dsh-plugin-mobile-gateway'\nexport const inject = ['webServer', 'apiProxy', 'typertGateway']\nexport function apply(){}\n`,
  );
  // 未命中：不匹配过滤器的普通内核包（即便 inject apiProxy 也应被过滤）
  const kern = path.join(nm, '@deepseek-ai', 'dsh-foo', 'lib');
  fs.mkdirSync(kern, { recursive: true });
  fs.writeFileSync(path.join(nm, '@deepseek-ai', 'dsh-foo', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-foo', main: 'lib/index.js' }));
  fs.writeFileSync(path.join(kern, 'index.js'), `export const inject = ['apiProxy']`);
  // 干净插件：不依赖移除服务
  const good = path.join(nm, 'dsh-plugin-clean', 'lib');
  fs.mkdirSync(good, { recursive: true });
  fs.writeFileSync(path.join(nm, 'dsh-plugin-clean', 'package.json'), JSON.stringify({ name: 'dsh-plugin-clean', main: 'lib/index.js' }));
  fs.writeFileSync(path.join(good, 'index.js'), `export const inject = ['slots','webServer']`);
  return root;
}

test('scanInstalledPlugins：只诊断第三方插件、忽略核心包与干净插件', () => {
  const root = makeFixtureRoot();
  try {
    const { plugins, findings } = scanInstalledPlugins({ roots: [path.join(root, 'node_modules')] });
    const pluginNames = plugins.map((p) => p.name).sort();
    assert.deepEqual(pluginNames, ['dsh-plugin-clean', 'dsh-plugin-mobile-gateway']);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].plugin.name, 'dsh-plugin-mobile-gateway');
    assert.equal(findings[0].service, 'apiProxy');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('defaultPluginPackageFilter：识别 dsh-plugin-* 与 scope 变体', () => {
  assert.equal(defaultPluginPackageFilter('dsh-plugin-mobile-gateway'), true);
  assert.equal(defaultPluginPackageFilter('@foo/dsh-plugin-bar'), true);
  assert.equal(defaultPluginPackageFilter('@deepseek-ai/dsh-foo'), false);
  assert.equal(defaultPluginPackageFilter('some-lib'), false);
});

// ---------------------------------------------------------------------------
// 6) boot 便捷入口
// ---------------------------------------------------------------------------
test('runServiceAbsenceDiagnosis：产出 [service-absence] 日志并调用 log', () => {
  const root = makeFixtureRoot();
  try {
    const lines = [];
    const res = runServiceAbsenceDiagnosis({ appDir: root, log: (m) => lines.push(m) });
    assert.equal(res.findings.length, 1);
    assert.equal(res.logLines.length, 1);
    assert.match(res.logLines[0], /^\[service-absence\] /);
    assert.match(res.logLines[0], /apiProxy/);
    assert.deepEqual(lines, res.logLines);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7) CLI 退出码契约
// ---------------------------------------------------------------------------
test('cliMain：命中诊断退出码非 0，无诊断退出 0', () => {
  const root = makeFixtureRoot();
  const origWrite = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try {
    const badCode = cliMain(['--app-dir', root], { runServiceAbsenceDiagnosis: (o) => runServiceAbsenceDiagnosis(o) });
    assert.notEqual(badCode, 0);
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.findings.length, 1);
    assert.equal(parsed.findings[0].service, 'apiProxy');

    // 无诊断（注入空实现）→ 退出 0
    out = '';
    const okCode = cliMain(['--app-dir', root], { runServiceAbsenceDiagnosis: () => ({ findings: [], logLines: [] }) });
    assert.equal(okCode, 0);
    assert.equal(JSON.parse(out).ok, true);
  } finally {
    process.stdout.write = origWrite;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
