'use strict';

// 「幽灵服务 settingsScope」退役回归（node --test）。
//
// 报障现场（用户实测）：Tauri 壳启动后 web boot 半程报
//   Failed to load plugins / web boot: 2 entries did not activate
//   dsh-session-manager: pending (waiting for service: settingsScope)
//   @dsh-external/dsh-side-session: pending (waiting for service: settingsScope)
// 机制：内核 rc.2 里**没有** settingsScope 这个服务（@deepseek-ai/* 全文 0 处命中），
// boot 审计（dsh-client-web assertEntriesActive）对 inject 里解析不到的 service 判
// "pending (waiting for service: X)"，两个插件因此永不激活。真实形状是
// ctx.remote.settings（dotted 名，conversation-tweaks / subagent-lens / quest-ui 已实证）。
//
// 本测试上三层锁：
//   1. 全插件清扫：注入名/正文引用里不得再出现幽灵服务（去注释去字符串后看正文，
//      字符串面单列 inject 字面量按名解析——历史回归「exports.inject 里留着
//      "settingsScope"」正是靠这条抓）；
//   2. 受害两插件点名锁：session-manager 摘名、side-session 换 remote.settings 适配器；
//   3. 宿主半锁：Config 六字段 volatile + 导出、settings-host 垫片（代已作废的
//      ctx.settings.register）、handleAsk 的 apiKey 合并优先级（宿主本地读取胜出，
//      页内远端 describe 脱敏后 apiKey 恒为空串，不能反盖真值）。
//
// 判据边界：本清扫看的是「名字回流」，不判设置功能面——功能面由适配器行为测
// （C 段，抽源码跑 fake remote）与宿主垫片行为测（E 段）各自承担。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(DSH, 'assets', 'plugins');
const { COMPANION_PLUGINS, companionDirName } = require(path.join(DSH, 'scripts', 'lib', 'companion-plugins.js'));

const SESSION_MANAGER_CLIENT = path.join(PLUGINS, 'dsh-session-manager', 'lib', 'client.js');
const SIDE_SESSION_CLIENT = path.join(PLUGINS, 'dsh-side-session', 'lib', 'client.js');
const SIDE_SESSION_HOST = path.join(PLUGINS, 'dsh-side-session', 'lib', 'index.js');

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// 扫描器：幽灵名回流判定
// ---------------------------------------------------------------------------
// 去字符串 → 去注释 → 找标识符引用。顺序不能反：先去注释会把
// "https://…" 里的 // 当注释起点，反把字符串残留喂给后续判定。
function stripStringsAndComments(src) {
  return src
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** 正文引用（注释/字符串里提到幽灵名不算——那是给后人的注解）。 */
function findGhostRefs(src) {
  return stripStringsAndComments(src).includes('settingsScope');
}

/** inject 字面量按名解析（原文解析，字符串即字面量本体的语义在这个面上）。 */
function parseInjectArrays(src) {
  const out = [];
  for (const m of src.matchAll(/\binject\s*=\s*\[([^\]]*)\]/g)) {
    const names = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    out.push(names);
  }
  return out;
}

function hasGhostInject(src) {
  return parseInjectArrays(src).some((names) => names.includes('settingsScope'));
}

/** 走插件运行时 JS（跳过 node_modules / test / gui / bundles / *.min.js）。 */
function runtimeFiles(dir) {
  const out = [];
  (function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'test', 'tests', 'gui', 'bundles'].includes(e.name)) continue;
        walk(p);
        continue;
      }
      if (/\.(m?js)$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

// ---------------------------------------------------------------------------
// 1) 全插件清扫：幽灵服务不得回流（正文引用 / inject 字面量 两条独立判据）
// ---------------------------------------------------------------------------
test('全插件清扫：正文引用里不得回流出幽灵服务 settingsScope', () => {
  const offenders = [];
  let plugins = 0;
  let files = 0;
  for (const p of COMPANION_PLUGINS) {
    const dir = path.join(PLUGINS, companionDirName(p));
    const list = runtimeFiles(dir);
    if (!list.length) continue;
    plugins += 1;
    for (const file of list) {
      files += 1;
      const src = readText(file) || '';
      if (findGhostRefs(src)) offenders.push(path.relative(DSH, file).replace(/\\/g, '/'));
    }
  }
  // 判据自检（扫描器没脱靶的覆盖哨兵；精确对账另有 unit-hub-registry）：
  // 2026-10-08 实测 28 册 / 106 文件；下限按约 3/4 设（老插件退役时按比例下调，
  // 与 unit-plugin-esm-link 的 22 册口径同源）。
  assert.ok(plugins >= 22, `只扫到 ${plugins} 册插件，覆盖面已脱靶`);
  assert.ok(files >= 80, `只扫到 ${files} 个运行时文件，采集已脱靶`);
  assert.deepEqual(offenders, [], '幽灵服务 settingsScope 在正文里回流（boot 审计会按 pending 拒装）：\n  ' + offenders.join('\n  '));

  // 反证：真代码形态必须被判红（用报障现场的逐字形状），注释/字符串形态不得误伤。
  assert.equal(findGhostRefs('settingsScope = ctx.settingsScope.bind({ namespace: "dsh-side-session" });'), true,
    '反证失败：旧 bind 形态应判红');
  assert.equal(findGhostRefs('// 内核里没有 settingsScope 这个服务（幽灵）'), false,
    '反证失败：注释提及不得误伤（退役说明就写在注释里）');
  assert.equal(findGhostRefs('console.warn("settingsScope 不可用，使用内存默认配置");'), false,
    '反证失败：字符串提及不得误伤（历史 warn 文案；注入名由 inject 判据另行把关）');
});

test('全插件清扫：inject 字面量里不得再出现 "settingsScope"（历史回归的逐字形状）', () => {
  const offenders = [];
  let injectArrays = 0;
  for (const p of COMPANION_PLUGINS) {
    for (const file of runtimeFiles(path.join(PLUGINS, companionDirName(p)))) {
      const src = readText(file) || '';
      for (const names of parseInjectArrays(src)) {
        injectArrays += 1;
        if (names.includes('settingsScope')) offenders.push(path.relative(DSH, file).replace(/\\/g, '/') + ' → ' + JSON.stringify(names));
      }
    }
  }
  // 2026-10-08 实测解析到 58 个 inject 数组（client 半边 exports.inject + 宿主半边 const inject）。
  assert.ok(injectArrays >= 22, `只解析到 ${injectArrays} 个 inject 数组，采集已脱靶`);
  assert.deepEqual(offenders, [], 'inject 里留着幽灵服务名（boot 审计 pending 的直接成因）：\n  ' + offenders.join('\n  '));

  // 反证：报障现场两条 inject 的逐字形状都必须被判红。
  assert.equal(hasGhostInject('exports.inject = ["slots", "settingsScope", "workspaces", "sessions"];'), true,
    '反证失败：session-manager 旧 inject 应判红');
  assert.equal(hasGhostInject('exports.inject = ["slots", "settingsScope", "commandUi"];'), true,
    '反证失败：side-session 旧 inject 应判红');
  assert.equal(hasGhostInject('exports.inject = ["slots", "remote", "remote.settings", "commandUi"];'), false,
    '反证失败：迁移后的 inject 不得误伤');
});

// ---------------------------------------------------------------------------
// 2) 受害两插件点名锁
// ---------------------------------------------------------------------------
test('dsh-session-manager：inject 摘名（正文从未消费该服务）+ 核心面不缩水', () => {
  const src = readText(SESSION_MANAGER_CLIENT);
  assert.ok(src, 'client 产物应在位');
  const injects = parseInjectArrays(src);
  assert.ok(injects.length >= 1, '应能解析到 exports.inject');
  const names = injects[injects.length - 1];
  assert.ok(!names.includes('settingsScope'), `幽灵名回流：${JSON.stringify(names)}`);
  for (const svc of ['slots', 'workspaces', 'sessions']) {
    assert.ok(names.includes(svc), `inject 缺核心服务 "${svc}"：${JSON.stringify(names)}`);
  }
});

test('dsh-side-session 客户端：inject 换 remote.settings，适配器以 profile 条目 id 挂载', () => {
  const src = readText(SIDE_SESSION_CLIENT);
  assert.ok(src, 'client 产物应在位');
  const names = parseInjectArrays(src)[0];
  assert.ok(names, '应能解析到 exports.inject');
  for (const svc of ['slots', 'remote', 'remote.settings', 'commandUi']) {
    assert.ok(names.includes(svc), `inject 缺 "${svc}"：${JSON.stringify(names)}`);
  }
  assert.ok(!names.includes('settingsScope'), '幽灵名回流');
  // ns 必须是 profile 条目 id（cordis.patch.yml 的 `- id: side-session`），不是包名。
  assert.match(src, /var ENTRY_ID = "side-session"/, 'ENTRY_ID 必须是 profile 条目 id');
  assert.match(src, /bindSettingsScope\(ctx, ENTRY_ID\)/, '适配器必须以 ENTRY_ID 挂载');
});

test('dsh-side-session 设置卡：文本输入走草稿 + 失焦/回车落写（防逐键 mutate 踩 revision）', () => {
  const src = readText(SIDE_SESSION_CLIENT);
  for (const key of ['apiKey', 'model', 'endpoint']) {
    assert.match(src, new RegExp(`var ${key}DraftState = useState\\(`), `${key} 应有本地草稿状态`);
    assert.match(src, new RegExp(`onBlur: function \\(\\) \\{ setPluginSetting\\("${key}", ${key}Draft\\); \\}`),
      `${key} 应在失焦时落写`);
  }
  assert.ok(!/onChange: function \(e\) \{ setPluginSetting\(/.test(src),
    '受控 input 不得 onChange 直写持久化（remote mutate 带 revision，逐键写会相互踩版本）');
});

// ---------------------------------------------------------------------------
// 3) 客户端适配器行为测：抽源码跑 fake remote（ns 命中/未命中/热更/写入）
// ---------------------------------------------------------------------------
function extractFunction(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

const ADAPTER_SRC = extractFunction(readText(SIDE_SESSION_CLIENT), 'function bindSettingsScope(ctx, entryId)');
assert.ok(ADAPTER_SRC, '应从 client 源码抠出 bindSettingsScope 适配器');
const bindSettingsScope = new Function('return (' + ADAPTER_SRC + ')')();

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeRemote(opts = {}) {
  const calls = { describe: 0, mutate: [] };
  return {
    calls,
    ctx: {
      remote: {
        settings: {
          async describe() {
            calls.describe += 1;
            if (opts.describeError) throw opts.describeError;
            return {
              ok: true,
              value: { writable: true, namespaces: opts.namespaces || [] },
            };
          },
          async mutate(ns, ops, revision) {
            calls.mutate.push({ ns, ops, revision });
            return opts.mutateResult !== undefined
              ? opts.mutateResult
              : { ok: true, value: { value: { mode: '3' }, revision: 8 } };
          },
        },
      },
    },
  };
}

test('适配器：describe 命中 profile 条目 id → ready，快照带 revision', async () => {
  const { ctx } = makeRemote({
    namespaces: [{ ns: 'side-session', value: { mode: '2', model: 'deepseek-chat' }, revision: 7 }],
  });
  const scope = bindSettingsScope(ctx, 'side-session');
  assert.equal(scope.getSnapshot().status, 'loading', '构造后首帧应为 loading（describe 异步）');
  await settle();
  const snap = scope.getSnapshot();
  assert.equal(snap.status, 'ready');
  assert.equal(snap.value.mode, '2');
  assert.equal(snap.revision, 7);
  assert.equal(snap.writable, true);
});

test('适配器：ns 不命中 → missing（Config 缺 volatile 字段的显式信号，不再静默降级）', async () => {
  const { ctx } = makeRemote({ namespaces: [{ ns: 'dsh-side-session', value: {}, revision: 1 }] });
  const scope = bindSettingsScope(ctx, 'side-session');
  await settle();
  assert.equal(scope.getSnapshot().status, 'missing', '历史 NS（包名形态）不得命中，须落到 missing');
});

test('适配器：describe 抛错 → failed 且不冒未处理 rejection', async () => {
  const { ctx, calls } = makeRemote({ describeError: new Error('bridge down') });
  const scope = bindSettingsScope(ctx, 'side-session');
  await settle();
  assert.equal(scope.getSnapshot().status, 'failed');
  assert.equal(calls.describe, 1);
});

test('适配器：set → mutate(条目id, [{op,path,value}], revision)，成功后采纳返回快照', async () => {
  const { ctx, calls } = makeRemote({
    namespaces: [{ ns: 'side-session', value: { mode: '1' }, revision: 7 }],
  });
  const scope = bindSettingsScope(ctx, 'side-session');
  await settle();
  await scope.set('mode', '3');
  assert.deepEqual(calls.mutate, [
    { ns: 'side-session', ops: [{ op: 'set', path: ['mode'], value: '3' }], revision: 7 },
  ], 'mutate 的 ns/ops/revision 形状必须照内核契约');
  const snap = scope.getSnapshot();
  assert.equal(snap.value.mode, '3');
  assert.equal(snap.revision, 8, '成功后应采纳内核回传的新 revision');
});

test('适配器：写被拒 → set 抛错并重取（不吞成静默假成功）', async () => {
  const { ctx, calls } = makeRemote({
    namespaces: [{ ns: 'side-session', value: { mode: '1' }, revision: 7 }],
    mutateResult: { ok: false, error: { message: 'revision conflict' } },
  });
  const scope = bindSettingsScope(ctx, 'side-session');
  await settle();
  const before = calls.describe;
  await assert.rejects(() => scope.set('mode', '3'), /revision conflict/);
  assert.ok(calls.describe > before, '写被拒后必须重取，避免快照停在陈旧 revision');
});

test('适配器：内容相同的重复采纳抖动快照（subscribe 不被空转触发）', async () => {
  let namespaces = [{ ns: 'side-session', value: { mode: '1' }, revision: 7 }];
  const calls = { describe: 0 };
  const ctx = {
    remote: {
      settings: {
        async describe() { calls.describe += 1; return { ok: true, value: { writable: true, namespaces } }; },
        async mutate() { return { ok: true, value: { value: { mode: '1' }, revision: 8 } }; },
      },
    },
  };
  // 直接经 set 触发 adopt：内容相同 → 引用稳定。
  const scope = bindSettingsScope(ctx, 'side-session');
  await settle();
  const first = scope.getSnapshot();
  namespaces = [{ ns: 'side-session', value: { mode: '1' }, revision: 9 }];
  await scope.set('mode', '1');
  assert.equal(scope.getSnapshot(), first, '值/状态/writable 全同时快照引用必须稳定');
});

// ---------------------------------------------------------------------------
// 4) 宿主半：Config 形状与声明（volatile ×6 + 导出 + secret role）
// ---------------------------------------------------------------------------
test('宿主 Config：六字段全部 volatile 且导出（describe() 收录的前提）', async () => {
  const host = await import(pathToFileURL(SIDE_SESSION_HOST).href);
  assert.ok(host.Config, 'Config 必须导出（cordis resolveConfig 与 settings.describe 都看它）');
  const dict = host.Config.dict;
  for (const field of ['mode', 'apiKey', 'model', 'endpoint', 'contextLength', 'animMs']) {
    assert.ok(dict[field], `缺字段 ${field}`);
    assert.equal(dict[field].meta.volatile, true, `${field} 必须 volatile（否则整条目被 describe() 跳过）`);
  }
  assert.equal(dict.apiKey.meta.role, 'secret', 'apiKey 必须保持 secret role（远端脱敏面）');
});

test('宿主入口契约：inject 面齐全、权威导出面不缩水（存量单测依赖）', async () => {
  const host = await import(pathToFileURL(SIDE_SESSION_HOST).href);
  assert.deepEqual(host.inject, ['settings', 'webServer', 'llm'], 'inject 面不得缩水/截丢（openclaw 0.8.0 有前科）');
  for (const name of ['apply', 'name', 'parseSession', 'resetParseCacheForTest', 'KNOWN_PROVIDERS',
    'readProviderProfile', 'resolveProviderBase', 'resolveProviderBaseForTestHelper']) {
    assert.ok(host[name] !== undefined, `导出 ${name} 缺失（unit-side-session.test.mjs 依赖）`);
  }
});

// ---------------------------------------------------------------------------
// 5) 宿主半：settings-host 垫片 + 合并优先级静态锁（逆形态封锁）
// ---------------------------------------------------------------------------
test('宿主：settings-host 垫片在场，ctx.settings.register 幽灵 API 不得回流', () => {
  const src = readText(SIDE_SESSION_HOST);
  assert.ok(src.includes('<<BEGIN settings-host') && src.includes('<<END settings-host'),
    '垫片块必须成对完整（半边缺失 = apply 直接抛 → 设置页永久降级）');
  assert.ok(src.includes('function mountSettingsScope('), '垫片应提供 mountSettingsScope');
  assert.ok(src.includes('mountSettingsScope(ctx, config, ENTRY_ID)'), 'apply 应以官方 config + 条目 id 挂载');
  assert.ok(src.includes('ctx.on("settings/document-updated"'), '热更应订阅 settings/document-updated');
  assert.ok(!/ctx\.settings\.register\s*\(/.test(src), 'ctx.settings.register 属已作废幽灵 API，不得回流');
  assert.ok(!/settings\.registrations/.test(src), 'settings.registrations 同属幽灵面，不得回流');
  assert.match(src, /ctx\.effect\(\s*\(\) => ctx\.settings\.configure\(\{ auto: false \}/, '页内自带设置卡 ⇒ 关内核自动页（防同一设置两处）');
});

test('宿主：垫片行为（取值 / volatile 摊平 / ns 过滤 / watch 退订）', () => {
  const src = readText(SIDE_SESSION_HOST);
  const m = /\/\/ <<BEGIN settings-host[^\n]*\r?\n([\s\S]*?)\/\/ <<END settings-host/.exec(src);
  assert.ok(m, '应能抠出 settings-host 垫片块');
  const sandbox = { console, Symbol, Object, Array };
  vm.createContext(sandbox);
  const { mountSettingsScope, VOLATILE_WRITE } = vm.runInContext(
    m[1] + '\n;({ mountSettingsScope, VOLATILE_WRITE })',
    sandbox,
    { filename: 'dsh-side-session/settings-host.js' },
  );

  // 普通 profile 行 config：原样摊平；引用被内核就地改写 → document-updated 后读到新值。
  const cfg = { mode: '2', apiKey: 'k-1' };
  const listeners = [];
  const ctx = {
    on(kind, fn) {
      assert.equal(kind, 'settings/document-updated', '垫片只应订阅 document-updated');
      listeners.push(fn);
      return () => {};
    },
  };
  const scope = mountSettingsScope(ctx, cfg, 'side-session');
  assert.equal(scope.get().mode, '2', '首帧取值应等于 profile 行 config');
  let hits = 0;
  scope.watch(() => { hits += 1; });
  cfg.apiKey = 'k-2';
  for (const fn of listeners) fn('side-session');
  assert.equal(scope.get().apiKey, 'k-2', '热更应重新取值（含本地未脱敏的 apiKey）');
  assert.equal(hits, 1, 'watch 回调应触发一次');
  for (const fn of listeners) fn('some-other-entry');
  assert.equal(hits, 1, 'ns 不匹配时不得触发');

  // volatile 载体（get() 现取）：document-updated 重取时摊平到最新底层值。
  let live = 'a';
  const volatileConfig = { mode: { [VOLATILE_WRITE]: true, get: () => 'v-' + live } };
  const listeners2 = [];
  const scope2 = mountSettingsScope(
    { on: (kind, fn) => { listeners2.push(fn); return () => {}; } },
    volatileConfig,
    'side-session',
  );
  assert.equal(scope2.get().mode, 'v-a');
  live = 'b';
  for (const fn of listeners2) fn('side-session');
  assert.equal(scope2.get().mode, 'v-b', 'volatile 载体应在热更后重取新值');
});

test('宿主：mode2 apiKey 合并优先级反转（页内脱敏空串不得反盖宿主真值）', () => {
  const src = readText(SIDE_SESSION_HOST);
  assert.ok(src.includes('Object.assign({}, lastSettings, pageSettings)'),
    '页内 body 与宿主配置应显式合并（宿主侧为底）');
  assert.ok(src.includes('if (!merged.apiKey) merged.apiKey = lastSettings.apiKey || ""'),
    'apiKey 必须回填宿主本地真值（远端 describe 脱敏摘掉 secret，页内恒为空串）');
  assert.ok(!/body\.pluginSettings \|\| lastSettings/.test(src),
    '旧「body 优先」形态不得回流（那是脱敏空串反盖真值的成因）');
});
