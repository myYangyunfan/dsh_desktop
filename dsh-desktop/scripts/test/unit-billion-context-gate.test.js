'use strict';

// unit-billion-context-gate.test.js — 上下文压缩「接管面」机器锁（2026-11-09）。
//
// 事故面（0.2.x）：`@deepseek-ai/dsh-web-app` 的四个出厂预设各自写
// `- id: compaction / name: cordis:group / isolate: { compaction: true }` 并把自己那份
// `compaction-basic` 挂在组里，而宿主面那条 `compaction-basic` 在 `dsh-web-app/cordis.patch.yml`
// 早已 `disabled: true`。所以「装在宿主面 ≠ 接管」：旧 `billion-context-dsh` 0.2.27 只在宿主面
// insert 一个 CompactionEngine，预设会话根本看不见它，用户观感只是「多了几个工具」。
//
// 现行接管姿势（`billion-context` 0.1.213）是把这件事拆成两条：
//   ① `bili-compaction-gate` 这个 always-on 条目在 `internal/config`（`{ global: true }`）里
//      把预设 config 内层的 `@deepseek-ai/dsh-compaction-basic` 与 `@deepseek-ai/dsh-command-compact`
//      两行改写成 `disabled: true`（`tool-result-pruner` 不动，两条裁剪链并存是已知取舍）；
//   ② 四条 `preset-*` 行 `inject: [biliBasicCompactionPolicy]`，让预设等待 gate 注册的服务，
//      从而在 gate 活着时不会 pending（反之 gate 被停用＝会话创建永久 pending，见 #3662）。
//
// 这条坏形不在任何既有静态判据里（模块表 / inject 服务扫 / boot 五步全绿），只有真开机才看得见，
// 所以本套件直接跑**真产物**：假 ctx 收监听器，用预设真形状的 config 触发，断言两行被禁、
// 第三行不动、verdict 未置位时原样返回（反证），并把「pin 内核的预设仍然只挂这两行」咬住——
// 上游哪天改名或增行，这里先红，而不是用户那边静默失效。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const yaml = require('yaml');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGIN_DIR = path.join(DSH, 'assets', 'plugins', 'billion-context');
const GATE_FILE = path.join(PLUGIN_DIR, 'dist', 'agent', 'dsh-compaction-gate.js');
const PATCH_FILE = path.join(PLUGIN_DIR, 'cordis.patch.yml');
const PRESETS_DIR = path.join(DSH, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets');

const VERDICT_KEY = '__BILI_DSH_COMPACTION_VERDICT__';
const TELEMETRY_KEY = '__BILI_DSH_COMPACTION_GATE_TELEMETRY__';
const GATE_TARGETS = ['@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-command-compact'];
const PRUNER = '@deepseek-ai/dsh-compaction-tool-result-pruner';
const PRESET_ENTRY = '@deepseek-ai/dsh-agent-preset';
const GATE_LOADER_ID = 'bili-compaction-gate';
const GATE_PACKAGE_SPEC = 'billion-context/dsh-compaction-gate';

// ---- 夹具 ------------------------------------------------------------------

function resetGlobals() {
  delete globalThis[VERDICT_KEY];
  delete globalThis[TELEMETRY_KEY];
}

function readPatch() {
  // 内核那边的 `!!js` 自定义标签这里不需要语义，静默即可（未解析标签只会变成字符串）。
  return yaml.parse(fs.readFileSync(PATCH_FILE, 'utf8'), { logLevel: 'silent' });
}

function stripRows(rows) {
  return rows.map((row) => (row && typeof row === 'object' ? { id: row.id, name: row.name } : row));
}

/** 预设真形状：`compaction` 组里挂 basic + command-compact + 可选 tool-result-pruner。 */
function presetShapedConfig({ withPruner = true } = {}) {
  const config = [
    { id: 'compaction-basic', name: GATE_TARGETS[0] },
    { id: 'command-compact', name: GATE_TARGETS[1] },
  ];
  if (withPruner) {
    config.push({
      id: 'tool-result-pruner',
      name: PRUNER,
      config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
    });
  }
  return {
    id: 'standard',
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona' },
      { id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true }, config },
    ],
  };
}

/**
 * 装 gate：假 ctx 收 `internal/config` 监听器与 `reflect.provide`，
 * 返回一个按「真 resolved config」触发的调用器。
 */
async function mountGate() {
  const mod = await import(pathToFileURL(GATE_FILE).href);
  const hooks = [];
  const provided = [];
  const ctx = {
    on(event, handler, options) {
      hooks.push({ event, handler, options });
    },
    reflect: {
      provide(id, value) {
        provided.push({ id, value });
      },
    },
  };
  mod.apply(ctx);
  assert.equal(hooks.length, 1, 'apply 必须注册且只注册一个 internal/config 监听器');
  const fire = (config, entryName) => {
    const hook = hooks[0];
    const thisArg = entryName === undefined ? undefined : { entry: { options: { name: entryName } } };
    return hook.handler.call(thisArg, undefined, () => config);
  };
  return { mod, hooks, provided, fire };
}

// ---- 模块面 ----------------------------------------------------------------

test('gate 模块面：loader id / inject 空表 / apply 由产物自身声明', async () => {
  const mod = await import(pathToFileURL(GATE_FILE).href);
  assert.equal(mod.name, GATE_LOADER_ID, 'gate 的 loader id 必须与本清单条目 id 一致');
  assert.deepEqual(mod.inject, [], 'gate 不能声明 inject：它要最先起来，注入任何东西都会让它等');
  assert.equal(typeof mod.apply, 'function');
});

// ---- 注册面 ----------------------------------------------------------------

test('apply 注册：internal/config 挂 global、provide biliBasicCompactionPolicy（冻结常量）', async () => {
  resetGlobals();
  const { hooks, provided } = await mountGate();

  assert.equal(hooks[0].event, 'internal/config',
    'gate 靠内核的 internal/config 钩子改写预设 config；事件名漂移即整条接管失效');
  assert.deepEqual(hooks[0].options, { global: true },
    '必须 { global: true }：缺了它钩子只在自身 fiber 域内生效，看不到预设 realm 的 config');

  assert.equal(provided.length, 1);
  assert.equal(provided[0].id, 'biliBasicCompactionPolicy',
    '四条 preset-* 行 inject 的正是这个服务名，改名＝预设永久 pending');
  assert.equal(provided[0].value.owner, 'billion-context');
  assert.equal(provided[0].value.issue, '#3354');
  assert.ok(Object.isFrozen(provided[0].value), '策略对象是冻结常量，别让消费方就地改它');
});

// ---- 接管行为 --------------------------------------------------------------

test('接管生效：预设面的 compaction-basic / command-compact 被改写为 disabled，tool-result-pruner 不动', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  const input = presetShapedConfig();
  const out = fire(input, PRESET_ENTRY);

  assert.notEqual(out, input, '命中时必须返回新对象（cordis 会缓存 resolved config）');
  const group = out.plugins.find((row) => row.id === 'compaction');
  assert.ok(group && Array.isArray(group.config), '预设的 compaction 组必须原样保留');

  const byId = new Map(group.config.map((row) => [row.id, row]));
  assert.equal(byId.get('compaction-basic').disabled, true, '预设那份 compaction-basic 必须被禁（否则引擎还是 basic）');
  assert.equal(byId.get('command-compact').disabled, true, 'command-compact 也 inject 了 compaction，同禁不留等待者');
  assert.ok(!('disabled' in byId.get('tool-result-pruner')),
    'tool-result-pruner 不提供 compaction 服务，禁掉会白白丢掉长度裁剪');
  assert.deepEqual(byId.get('tool-result-pruner').config,
    { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
    '第三行的 config 一个字都不能动（patch 语义是整块替换，动了就是静默改阈值）');

  // 非压缩行必须原样透传
  assert.equal(out.plugins.find((row) => row.id === 'persona').disabled, undefined);
  assert.deepEqual(byId.get('compaction-basic').name, GATE_TARGETS[0]);
});

test('改写不就地变异输入：原 config 的两行仍无 disabled 字段', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  const input = presetShapedConfig();
  fire(input, PRESET_ENTRY);

  const group = input.plugins.find((row) => row.id === 'compaction');
  for (const row of group.config) {
    assert.equal(row.disabled, undefined,
      `${row.id} 被就地写上了 disabled——cordis 缓存的 resolved config 会被污染`);
  }
});

test('遥测：记录覆盖到的条目名与行数，工厂预设标记 sawFactoryPreset', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  fire(presetShapedConfig(), PRESET_ENTRY);
  assert.deepEqual(globalThis[TELEMETRY_KEY], {
    covered: [{ entry: PRESET_ENTRY, rows: 2 }],
    sawFactoryPreset: true,
  });

  // 第二次打同一 entry：合并而不是追加（行数取较大者），非工厂预设不会置 sawFactoryPreset
  fire(presetShapedConfig(), 'my-custom-preset');
  const telemetry = globalThis[TELEMETRY_KEY];
  assert.deepEqual(telemetry.covered.map((row) => row.entry), [PRESET_ENTRY, 'my-custom-preset']);
  assert.equal(telemetry.sawFactoryPreset, true, '已置位的工厂标记不得被后来的条目清掉');
});

test('无名条目：this.entry.options.name 取不到时遥测仍写得出（诊断字段不许抛）', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  const out = fire(presetShapedConfig(), undefined);
  const telemetry = globalThis[TELEMETRY_KEY];
  assert.equal(telemetry.covered.length, 1);
  assert.equal(typeof telemetry.covered[0].entry, 'string');
  assert.ok(telemetry.covered[0].entry.length > 0, '兜底名也不能是空串');
  assert.equal(telemetry.sawFactoryPreset, false);
  assert.equal(out.plugins.find((row) => row.id === 'compaction').config[0].disabled, true,
    '遥测字段失灵不许影响禁用本体');
});

// ---- 反证（判据必须真的在跑） ----------------------------------------------

test('反证：verdict 未置位（bili-native 没起来 / 被 kill-switch）时 config 原样返回', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  assert.equal(globalThis[VERDICT_KEY], undefined, '前置条件：verdict 未置位');

  const input = presetShapedConfig();
  const out = fire(input, PRESET_ENTRY);
  assert.equal(out, input, '同一引用＝这条判据真的在 gate 上，而不是无条件改写');
  assert.equal(globalThis[TELEMETRY_KEY], undefined, '没接管就不该写遥测');
});

test('反证：verdict 已置位但 config 里没有压缩行时原样返回（不写遥测）', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  const input = { id: 'minimal', plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona' }] };
  const out = fire(input, PRESET_ENTRY);
  assert.equal(out, input);
  assert.equal(globalThis[TELEMETRY_KEY], undefined, '0 行命中时 noteGateCoverage 不该被调用');
});

test('反证：resolved 为 undefined / plugins 非数组 / 行为非对象，一律原样返回且不抛', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  assert.equal(fire(undefined, PRESET_ENTRY), undefined);
  const notArray = { id: 'x', plugins: 'nope' };
  assert.equal(fire(notArray, PRESET_ENTRY), notArray);
  const noPlugins = { id: 'x' };
  assert.equal(fire(noPlugins, PRESET_ENTRY), noPlugins);

  const noisy = { plugins: [null, 'row', 42, { id: 'compaction', name: 'cordis:group', group: true, config: [null, { name: GATE_TARGETS[0] }] }] };
  const out = fire(noisy, PRESET_ENTRY);
  assert.deepEqual(out.plugins[3].config[1], { name: GATE_TARGETS[0], disabled: true },
    '组内非对象行必须被跳过，压缩行照常改写');
  assert.deepEqual(out.plugins.slice(0, 3), [null, 'row', 42], '非对象行原样透传');
  assert.deepEqual(out.plugins[3].config[0], null, 'null 行不得被 map 成对象');
});

test('递归前提：只有 group:true 且 config 为数组的行才会下钻（预设必须带这面旗）', async () => {
  resetGlobals();
  const { fire } = await mountGate();
  globalThis[VERDICT_KEY] = 'active';

  // 缺 group:true 时 config 不是子插件清单，gate 不下钻 —— 上游哪天把预设的
  // `group: true` 拿掉，接管就静默失效（本条与「pin 内核预设」套件互为两侧）
  const noFlag = { plugins: [{ id: 'compaction', name: 'cordis:group', config: [{ id: 'compaction-basic', name: GATE_TARGETS[0] }] }] };
  assert.equal(fire(noFlag, PRESET_ENTRY), noFlag, '没有 group:true 的行不得被当作组改写');
});

// ---- bundle patch 形状 ------------------------------------------------------

test('bundle patch：两条 insert 行、gate 行不得带 disabled、四条 preset 行带 inject', () => {
  const rows = readPatch();
  const insert = rows.find((row) => row && row.insert);
  assert.ok(insert, 'cordis.patch.yml 必须有一个顶层 insert 块');

  const inserted = insert.insert.map((row) => ({ id: row.id, name: row.name }));
  assert.deepEqual(inserted, [
    { id: 'bili-native', name: 'billion-context' },
    { id: GATE_LOADER_ID, name: GATE_PACKAGE_SPEC },
  ], 'gate 必须是独立条目：并进 bili-native 就是 #3662 那种「kill-switch 把预设挂死」');

  const gateRow = insert.insert.find((row) => row.id === GATE_LOADER_ID);
  assert.ok(!('disabled' in gateRow),
    'gate 条目绝不能被停用——它承载四条预设 inject 等待的服务，停用＝会话创建永久 pending');

  const presets = rows.filter((row) => row && typeof row.id === 'string' && row.id.startsWith('preset-'));
  assert.deepEqual(presets.map((row) => row.id), ['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'],
    '四个出厂预设逐个要挂 inject（漏一个＝那个预设的会话创建永久 pending）');
  for (const row of presets) {
    assert.deepEqual(row.inject, ['biliBasicCompactionPolicy'],
      `${row.id} 的 inject 名单必须正好是 gate 注册的服务名`);
  }

  const hostBasic = rows.find((row) => row && row.id === 'compaction-basic');
  assert.ok(hostBasic, '宿主面 compaction-basic 仍要写 auto:false（无预设的 headless/ACP 会话走这条）');
  assert.equal(hostBasic.config.auto, false);

  for (const id of ['llm-deepseek', 'llm-deepseek-account']) {
    const row = rows.find((item) => item && item.id === id);
    assert.ok(row, `缺 ${id} 的 retryPolicy 行（#2605：默认白名单漏 MALFORMED_RESPONSE）`);
    const codes = row.config.retryPolicy.retryableCodes;
    assert.equal(row.config.retryPolicy.mode, 'normal');
    for (const code of ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'MALFORMED_RESPONSE']) {
      assert.ok(codes.includes(code), `${id} 的 retryableCodes 丢不得 ${code}（patch 是整块替换）`);
    }
  }
});

// ---- 与 pin 内核的耦合 -----------------------------------------------------

test('pin 内核的四个预设：compaction 组里挂的正是 gate 硬编码的那两个包名', () => {
  const files = fs.readdirSync(PRESETS_DIR).filter((name) => name.endsWith('.patch.yml'));
  assert.ok(files.length >= 4, `预设目录只剩 ${files.length} 个文件，判据面已失真`);

  const seen = [];
  for (const file of files) {
    const rows = yaml.parse(fs.readFileSync(path.join(PRESETS_DIR, file), 'utf8'), { logLevel: 'silent' });
    const insert = rows.find((row) => row && row.insert);
    const preset = insert && insert.insert.find((row) => row.name === PRESET_ENTRY);
    assert.ok(preset, `${file} 里没有 ${PRESET_ENTRY} 行`);
    const group = preset.config.plugins.find((row) => row.id === 'compaction');
    assert.ok(group && Array.isArray(group.config), `${file} 的 compaction 组形状变了（gate 靠组内 name 命中）`);
    assert.equal(group.group, true);
    assert.deepEqual(group.isolate && group.isolate.compaction, true,
      `${file} 的 isolation 一旦取消，gate 这套改写就白做（届时可以直接在宿主面接管）`);

    const names = group.config.map((row) => row.name);
    for (const target of GATE_TARGETS) {
      assert.ok(names.includes(target), `${file} 不再挂 ${target}——gate 的硬编码名单要跟着改`);
    }
    assert.ok(!names.some((name) => !GATE_TARGETS.includes(name) && name !== PRUNER),
      `${file} 的 compaction 组多了 gate 没覆盖的行：${stripRows(group.config).map((row) => row.name).join(', ')}`);
    seen.push({ file, names });
  }

  // 第三条裁剪行在多数预设里真实存在：证明「gate 不动它」不是空断言
  const withPruner = seen.filter((row) => row.names.includes(PRUNER));
  assert.ok(withPruner.length >= 3, `只有 ${withPruner.length} 个预设带 tool-result-pruner，夹具与内核脱钩`);
});

test('载体：gate 包的 exports 落点在盘，且 loader id 与产物导出的 name 同名', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'));
  const exp = pkg.exports && pkg.exports['./dsh-compaction-gate'];
  assert.equal(exp, './dist/agent/dsh-compaction-gate.js', 'exports 键漂移＝loader 解析不到 gate 包');
  assert.ok(fs.existsSync(path.join(PLUGIN_DIR, exp)), 'gate 产物不在盘上');

  // 代理子进程另走 `main`：只抄 exports 会让子进程 Cannot find module（父进程只说 proxy child exited）
  assert.equal(pkg.main, 'dist/index.js');
  assert.ok(fs.existsSync(path.join(PLUGIN_DIR, pkg.main)), 'proxy 子进程入口 dist/index.js 必须在盘上');

  const mod = await import(pathToFileURL(path.join(PLUGIN_DIR, exp)).href);
  assert.equal(mod.name, GATE_LOADER_ID);
});
