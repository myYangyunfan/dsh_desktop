'use strict';

// unit-vendored-upstream-plugins.test.js — 2026-10-22 随包内置的五个上游插件。
//
// 这些件不是本仓库源码，产物即交付物；一旦上游文件被误删 / 包名被改 / loader id 漂移，
// boot 期只会在内核日志里留一行 `failed to load`（loader-isolation 默认静默）。本套件
// 把「清单 ↔ 包 ↔ bundle patch ↔ 客户端入口 ↔ 我们的随包改动」钉死。
//
// 覆盖：
//   1) COMPANION_PLUGINS 五条 id/name 与磁盘 package.json 逐字一致；
//   2) 每条 bundle 层 cordis.patch.yml 的 id == 清单 id（issue #104 的机器锁）；
//   3) 客户端入口 exports["./client"] 在磁盘存在（0.2.1 不看 dsh.client.entry）；
//   4) shop 的 typert 加载期硬依赖 lib/typert.host.js 在位；
//   5) toolbox 的 smol-toml 依赖在 package.json + VENDOR_DEPS 双处可达；
//   6) free-search 缓存落点 DSH_HOME 优先、network-proxy 0600 与 snapshot.active、
//      notify private:true —— 三处 DSH Desktop 随包改动都有反证（删掉改动字符串必须红）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(DSH, 'assets', 'plugins');

const PLUGIN_MODULE_TABLE = require('../lib/plugin-module-table');

const FIVE = [
  ['web-search-free', 'dsh-free-search', '0.9.39', 'MIT'],
  ['shop', 'dsh-plugin-shop', '0.9.3', 'Apache-2.0'],
  ['network-proxy', '@local/dsh-network-proxy', '1.0.0', 'MIT'],
  ['mcp-manager-ui', 'dsh-toolbox-ui', '1.10.1', 'MIT'],
  ['dsh-notify', '@bittersmilezzz/dsh-notify', '0.4.5', 'MIT'],
];

const dirOf = (name) => (name.includes('/') ? name.slice(name.indexOf('/') + 1) : name);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** cordis.patch.yml 里第一个 `- id:` 的裸值（与 unit-hub-registry 的解析口径同向）。 */
function loaderIdOf(dir) {
  const text = fs.readFileSync(path.join(PLUGINS, dir, 'cordis.patch.yml'), 'utf8');
  const m = /^\s*-\s*id:\s*['"]?([A-Za-z0-9._/-]+)['"]?\s*$/m.exec(text);
  return m ? m[1] : '';
}

test('清单与磁盘：五个上游件的 id / 包名 / 版本 / 许可逐字一致', () => {
  const companions = require('../lib/companion-plugins');
  for (const [id, name, version, license] of FIVE) {
    const entry = companions.COMPANION_PLUGINS.find((p) => p.id === id);
    assert.ok(entry, `COMPANION_PLUGINS 缺 ${id}`);
    assert.equal(entry.name, name, `${id} 的包名漂移`);
    const dir = dirOf(name);
    const pkg = readJson(path.join(PLUGINS, dir, 'package.json'));
    assert.equal(pkg.name, name, `${dir}/package.json 的 name 与清单不一致`);
    assert.equal(pkg.version, version, `${dir} 版本漂移`);
    assert.equal(pkg.license, license, `${dir} 许可漂移`);
    assert.ok(fs.existsSync(path.join(PLUGINS, dir, 'LICENSE')), `${dir} 缺 LICENSE`);
    assert.equal(loaderIdOf(dir), id, `${dir} 的 bundle loader id 必须是清单 id（issue #104）`);
  }
});

test('客户端入口：五个上游件都声明 exports["./client"] 且产物在磁盘存在', () => {
  for (const [id, name] of FIVE) {
    const dir = dirOf(name);
    const pkg = readJson(path.join(PLUGINS, dir, 'package.json'));
    const client = (pkg.dsh && pkg.dsh.client) || {};
    assert.equal(client.platform, 'web', `${id} 的 dsh.client.platform 必须是 web`);
    const exp = pkg.exports && pkg.exports['./client'];
    assert.ok(exp, `${id} 缺 exports["./client"]（0.2.1 的 bundle 解析只看它）`);
    const rel = typeof exp === 'string' ? exp : (exp.default || exp.import);
    assert.ok(rel && fs.existsSync(path.join(PLUGINS, dir, rel)),
      `${id} 的客户端入口 ${rel} 不在磁盘上`);
  }
});

test('shop：typert 加载期硬依赖 lib/typert.host.js 在位，且 bundle 声明可自挂载', () => {
  const dir = path.join(PLUGINS, 'dsh-plugin-shop');
  assert.ok(fs.existsSync(path.join(dir, 'lib', 'typert.host.js')), '缺 lib/typert.host.js（typert-loader 会 import）');
  assert.ok(fs.existsSync(path.join(dir, 'lib', 'index.js')), '缺宿主入口 lib/index.js');
  assert.ok(fs.existsSync(path.join(dir, 'lib', 'client.js')), '缺客户端产物 lib/client.js');
  const pkg = readJson(path.join(dir, 'package.json'));
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(fs.existsSync(path.join(dir, 'cordis.patch.yml')));
});

test('toolbox：smol-toml 在内核依赖清单与 VENDOR_DEPS 双处可达', () => {
  const rootPkg = readJson(path.join(DSH, 'package.json'));
  assert.ok(rootPkg.dependencies && rootPkg.dependencies['smol-toml'],
    'dsh-desktop/package.json 必须声明 smol-toml（否则 stage-payload 后 profile 解析不到）');
  const src = fs.readFileSync(path.join(DSH, 'scripts', 'lib', 'companion-profile.js'), 'utf8');
  assert.ok(src.includes("'smol-toml'"), 'VENDOR_DEPS 必须包含 smol-toml');
  const mcp = fs.readFileSync(path.join(PLUGINS, 'dsh-toolbox-ui', 'lib', 'mcp-import-sources.js'), 'utf8');
  assert.ok(mcp.includes("from 'smol-toml'"), '夹具已漂移：toolbox 不再静态导入 smol-toml？');
});

test('free-search：research 缓存落点 DSH_HOME 优先（反证：删掉 DSH_HOME 分支必须红）', () => {
  const file = path.join(PLUGINS, 'dsh-free-search', 'lib', 'cache.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.ok(src.includes('process.env.DSH_HOME'), 'cache.js 必须读 DSH_HOME');
  assert.ok(/DSH_HOME[\s\S]{0,120}cache[\s\S]{0,40}dsh-free-search/.test(src),
    'DSH_HOME 分支必须落到 <home>/cache/dsh-free-search');
  // 反证：剥掉代码里的 DSH_HOME 条件后判据确实不成立（先剥注释，避免注释里的名字造成假绿）。
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const mutated = code.replace(/process\.env\.DSH_HOME[\s\S]{0,140}?dsh-free-search"\)/, '');
  assert.ok(!mutated.includes('process.env.DSH_HOME'), '反证变异没生效：DSH_HOME 分支仍在');
});

test('network-proxy：凭据 0600 与 locale 快照 active（两处随包改动带反证）', () => {
  const index = fs.readFileSync(path.join(PLUGINS, 'dsh-network-proxy', 'index.js'), 'utf8');
  assert.ok(index.includes('mode: 0o600'), 'network-proxy.json 必须按 0600 写');
  assert.ok(!index.includes("writeFileSync(temporary, body, 'utf8')"),
    '旧的 0644 writeFileSync 形态还在，随包改动没生效');
  const client = fs.readFileSync(path.join(PLUGINS, 'dsh-network-proxy', 'client.js'), 'utf8');
  assert.ok(client.includes('snapshot.active'), '客户端 locale 快照必须读 snapshot.active');
  assert.ok(!/const id = String\(\(snapshot && \(snapshot\.id \?\? snapshot\.locale\)\)/.test(client),
    'rc.2 幽灵字段 snapshot.id ?? snapshot.locale 仍在（代码行）');
});

test('notify：scoped 包必须 private，宿主半边空 apply + inject=[]，客户端不依赖 dshDesktop', () => {
  const dir = path.join(PLUGINS, 'dsh-notify');
  const pkg = readJson(path.join(dir, 'package.json'));
  assert.equal(pkg.private, true, 'scoped 伴随包必须 private:true（unit-hub-registry 硬锁）');
  const host = fs.readFileSync(path.join(dir, 'lib', 'index.js'), 'utf8');
  assert.ok(/export const inject = \[\];/.test(host), '宿主半边必须显式空 inject');
  assert.ok(host.includes('export function apply('), '宿主半边必须保留空 apply');
  const client = fs.readFileSync(path.join(dir, 'lib', 'client.js'), 'utf8');
  assert.ok(!client.includes('window.dshDesktop'),
    'notify 客户端不得依赖桌面桥（同一份包也要能在 Web 端工作）');
});

test('模块表：五个新件的宿主入口都能被解析（防入口写错时静默跳过）', () => {
  const ctx = PLUGIN_MODULE_TABLE.makeContext({ root: DSH });
  for (const [id, name] of FIVE) {
    const dir = dirOf(name);
    const rows = PLUGIN_MODULE_TABLE.clientEntryFiles(readJson(path.join(PLUGINS, dir, 'package.json')));
    assert.ok(Array.isArray(rows) && rows.length > 0, `${id} 的客户端入口解析为空`);
    const pkg = readJson(path.join(PLUGINS, dir, 'package.json'));
    const hostExp = pkg.exports && pkg.exports['.'];
    const hostRel = typeof hostExp === 'string' ? hostExp : (hostExp && (hostExp.default || hostExp.import));
    assert.ok(hostRel, `${id} 缺宿主入口（exports["."] / main）`);
    assert.ok(fs.existsSync(path.join(PLUGINS, dir, hostRel)), `${id} 的宿主入口 ${hostRel} 不存在`);
  }
  assert.ok(ctx, '模块表上下文必须可构造');
});

test('ds-bot：Bot 团队内置件的包/loader/许可与 vendored patch 边界', () => {
  const dir = 'ds-bot';
  const companions = require('../lib/companion-plugins');
  const entry = companions.COMPANION_PLUGINS.find((p) => p.id === 'bot');
  assert.ok(entry, 'COMPANION_PLUGINS 缺 bot（DeepSeek-Bot）');
  assert.equal(entry.name, 'ds-bot');
  const pkg = readJson(path.join(PLUGINS, dir, 'package.json'));
  assert.equal(pkg.name, 'ds-bot');
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.ok(fs.existsSync(path.join(PLUGINS, dir, 'LICENSE')), '缺 Apache-2.0 LICENSE');
  assert.equal(loaderIdOf(dir), 'bot', 'bundle loader id 必须是 bot');
  assert.ok(fs.existsSync(path.join(PLUGINS, dir, 'client.js')), '缺客户端产物 client.js');

  // vendored patch 的边界：只挂 Bot 本体，不接管 web.searchProvider。
  // 上游 patch 同时插入 web-search-auto 并整行覆盖 web 配置；随包与 dsh-free-search
  // 共存时，两套 provider 会静默互相覆盖（详见 patch 顶部注释）。
  const patch = fs.readFileSync(path.join(PLUGINS, dir, 'cordis.patch.yml'), 'utf8');
  const yaml = patch.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.match(yaml, /^\s*-\s*id:\s*bot\s*$/m);
  assert.ok(!/web-search-auto/.test(yaml), '不得重新插入 web-search-auto');
  assert.ok(!/searchProvider\s*:\s*auto/.test(yaml), '不得覆盖 web.searchProvider');
  assert.ok(!/^\s*-\s*id:\s*web\s*$/m.test(yaml), '不得整行覆盖 web 配置');
});

test('反证：把清单里 shop 的 id 改成包名后，bundle loader id 判据必须转红', () => {
  const dir = 'dsh-plugin-shop';
  const real = loaderIdOf(dir);
  assert.equal(real, 'shop');
  // 同一份解析函数喂一个「包名当 id」的合成 patch，必须拿到不同值。
  const fake = '- insert:\n    - id: dsh-plugin-shop\n      name: \'dsh-plugin-shop\'\n';
  const m = /^\s*-\s*id:\s*['"]?([A-Za-z0-9._/-]+)['"]?\s*$/m.exec(fake);
  assert.equal(m[1], 'dsh-plugin-shop');
  assert.notEqual(m[1], real, 'id 与包名混淆时判据失明');
});
