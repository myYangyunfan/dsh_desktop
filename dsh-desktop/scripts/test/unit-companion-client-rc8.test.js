'use strict';

// unit-companion-client-rc8.test.js — issue #124 回归：
// rc.8 内核把 @deepseek-ai/dsh-client-web-react 并入
// @deepseek-ai/dsh-client-ui-renderer（且不再导出 bindSnapshotSelector），
// rc.8 web 外壳的静态种子表（dsh-web-frontend dist 中 Gd() 的返回值）也不再
// 含 web-react。配套插件的 client bundle 若仍 require 它，客户端启动即报
// 『client-modules: require("@deepseek-ai/dsh-client-web-react") missed the
// module table』并整树加载失败（无法进入客户端，重装应用也不恢复——
// profile 里的插件副本由同步器从 assets 覆写，assets 不修就永远坏）。
//
// 契约（对每个 assets/plugins/*/lib/client.js）：
//   1) 静态：文件中每个 require 的包名必须属于
//        a. rc.8 静态种子表（react 系 / cordis / ui-slots / ui-primitives），或
//        b. 自己 package.json dsh.client.external 声明的包（图行先于本插件到达），或
//        c. 唯一允许的例外：web-react 作为旧内核（rc.7-）回退分支出现——
//           同文件必须同时引用 ui-renderer 且 package.json 已声明其 external；
//   2) 动态：在 rc.8 模块表仿真（种子 ∪ 已声明 external）下物化 factory
//      不得抛错；在 rc.7 模块表仿真（种子含 web-react、不含 renderer）下
//      同样不得抛错（回退分支生效，双端兼容）；
//   3) 产物：与真实 dsh-web-frontend 外壳 bundle 交叉验证——种子表键必须
//      出现在 bundle 文本中，且 bundle 不得再含 dsh-client-web-react。
// 运行：node --test scripts/test/unit-companion-client-rc8.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGINS_ROOT = path.join(__dirname, '..', '..', 'assets', 'plugins');

// rc.8 web 外壳静态种子表（dsh-web-frontend dist/assets/index-*.js 内 Gd() 的
// 字面键集；下方「外壳交叉验证」测试会对照真实 bundle 校验这份常量）。
const RC8_SEED = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
];
// rc.7 及更早内核仍提供的旧包名（仅允许作为回退分支出现）。
const LEGACY_WEB_REACT = '@deepseek-ai/dsh-client-web-react';
const RC8_REPLACEMENT = '@deepseek-ai/dsh-client-ui-renderer';

/** 列出全部带 lib/client.js 的配套插件目录。 */
function companionClientPlugins() {
  return fs.readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(PLUGINS_ROOT, name, 'lib', 'client.js')))
    .sort();
}

/** 提取 client.js 里全部 require("...") 包名（跳过注释行，避免注释误报）。 */
function clientRequires(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const specs = [];
  for (const line of lines) {
    if (line.trim().startsWith('//')) continue;
    for (const m of line.matchAll(/require\("([^"]+)"\)/g)) specs.push(m[1]);
  }
  return specs;
}

/** 读取插件 package.json 的 dsh.client.external 声明（缺省 []）。 */
function declaredExternals(pkgFile) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const ext = pkg && pkg.dsh && pkg.dsh.client && pkg.dsh.client.external;
    return Array.isArray(ext) ? ext : [];
  } catch {
    return [];
  }
}

/** 深层惰性 stub：任意属性访问/调用都返回可继续链式使用的代理。 */
function deepStub() {
  const fn = function () { return deepStub(); };
  // React/ReactDOM named exports rolldown's __toESM(react, 1) + __copyProps must
  // copy onto the ESM wrapper so `class extends react.Component` and hook calls
  // resolve to a constructable/callable stub instead of undefined.
  const stubKeys = [
    'Component', 'PureComponent', 'Fragment', 'createElement', 'memo',
    'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback',
    'useSyncExternalStore', 'createRoot', 'default',
  ];
  return new Proxy(fn, {
    get: (target, key) => {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === Symbol.iterator) return function* iter() {}();
      return deepStub();
    },
    apply: () => deepStub(),
    ownKeys: (target) => [...new Set([...Reflect.ownKeys(target), ...stubKeys])],
    getOwnPropertyDescriptor: (target, key) => {
      if (stubKeys.includes(key)) return { configurable: true, enumerable: true, value: deepStub() };
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

/**
 * 构造与 rc.8 dsh-client-modules makeRequire 同语义的 require：
 * 种子 ∪ 已到达（声明过 external 的图行）之外一律抛出与真实 loader 逐字
// 一致的错误。seed 与 arrived 分开传，便于仿真 rc.7（种子含 web-react）。
 */
function makeClientRequire({ seed, arrived }) {
  const table = new Set([...seed, ...arrived]);
  return (spec) => {
    if (table.has(spec)) return deepStub();
    // 与 dsh-client-modules/lib/client.js 的 makeRequire 报错逐字一致（#124 原文）
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`);
  };
}

/** 在 sandbox 里执行 client.js，捕获 __ModuleLoader__.load 的注册。 */
function loadFactory(file) {
  let captured = null;
  const sandbox = { window: { __ModuleLoader__: { load: (reg) => { captured = reg; } } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return captured;
}

// ---------------------------------------------------------------------------
// 1) 静态契约：require 的包名必须可解析（种子 / external / web-react 回退例外）
// ---------------------------------------------------------------------------

test('静态契约: 配套插件 client bundle 的每个 require 都能被 rc.8 模块表解析（#124）', () => {
  const plugins = companionClientPlugins();
  assert.ok(plugins.length >= 20, '应扫描到至少 20 个带 client.js 的配套插件');
  const violations = [];
  for (const name of plugins) {
    const file = path.join(PLUGINS_ROOT, name, 'lib', 'client.js');
    const ext = declaredExternals(path.join(PLUGINS_ROOT, name, 'package.json'));
    const src = fs.readFileSync(file, 'utf8');
    const hasRendererRef = src.includes(RC8_REPLACEMENT);
    for (const spec of clientRequires(file)) {
      if (RC8_SEED.includes(spec)) continue;
      if (ext.includes(spec) || ext.includes(spec.replace(/\/client$/, ''))) continue;
      if (spec === LEGACY_WEB_REACT && hasRendererRef && ext.includes(RC8_REPLACEMENT)) continue; // rc.7 回退分支
      violations.push(`${name}: require("${spec}") 不在 rc.8 种子表也未声明 external`);
    }
  }
  assert.deepEqual(violations, [], '存在无法解析的客户端 require（会在 rc.8 内核上触发 #124 整树加载失败）');
});

test('静态契约: web-react 只允许作为 ui-renderer 的回退分支出现', () => {
  for (const name of companionClientPlugins()) {
    const file = path.join(PLUGINS_ROOT, name, 'lib', 'client.js');
    const requiresWebReact = clientRequires(file).includes(LEGACY_WEB_REACT);
    if (!requiresWebReact) continue; // 字符串清单里的提及（如 CHUNK_EXTERNALS 超集）不受本条约束
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(src.includes(RC8_REPLACEMENT),
      `${name}: require ${LEGACY_WEB_REACT} 时必须同时引用 ${RC8_REPLACEMENT}（回退分支结构）`);
    const ext = declaredExternals(path.join(PLUGINS_ROOT, name, 'package.json'));
    assert.ok(ext.includes(RC8_REPLACEMENT),
      `${name}: 回退结构必须在 dsh.client.external 声明 ${RC8_REPLACEMENT}`);
  }
});

// ---------------------------------------------------------------------------
// 2) 动态契约：rc.8 / rc.7 两种模块表下 factory 都能物化
// ---------------------------------------------------------------------------

test('动态契约: rc.8 模块表仿真下全部配套插件 client factory 物化成功（#124 修后）', () => {
  for (const name of companionClientPlugins()) {
    const file = path.join(PLUGINS_ROOT, name, 'lib', 'client.js');
    const ext = declaredExternals(path.join(PLUGINS_ROOT, name, 'package.json'));
    const reg = loadFactory(file);
    assert.ok(reg && typeof reg.factory === 'function', `${name}: client.js 应经 __ModuleLoader__.load 注册 factory`);
    assert.doesNotThrow(() => reg.factory(makeClientRequire({ seed: RC8_SEED, arrived: ext })),
      `${name}: rc.8 模块表下物化失败（#124 形态）`);
  }
});

test('动态契约: rc.7 模块表仿真下（种子含 web-react）同样物化成功（回退分支）', () => {
  const rc7Seed = [...RC8_SEED, LEGACY_WEB_REACT];
  for (const name of companionClientPlugins()) {
    const file = path.join(PLUGINS_ROOT, name, 'lib', 'client.js');
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes(LEGACY_WEB_REACT)) continue; // 无回退分支的插件与 rc.7 无关
    const reg = loadFactory(file);
    assert.doesNotThrow(() => reg.factory(makeClientRequire({ seed: rc7Seed, arrived: [] })),
      `${name}: rc.7 模块表下回退分支物化失败`);
  }
});

// ---------------------------------------------------------------------------
// 3) 与真实 rc.8 外壳 bundle 交叉验证种子表常量（bundle 缺失时跳过）
// ---------------------------------------------------------------------------

test('外壳交叉验证: rc.8 web 外壳 bundle 含全部种子键且不再含 web-react', () => {
  const distDir = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets');
  let bundle = null;
  try {
    bundle = fs.readdirSync(distDir).filter((f) => /^index-.*\.js$/.test(f))
      .map((f) => fs.readFileSync(path.join(distDir, f), 'utf8')).join('\n');
  } catch {
    assert.ok(true, '内核 web-frontend dist 不存在（源码检出环境），跳过交叉验证');
    return;
  }
  for (const seed of RC8_SEED) {
    // 压缩产物的对象键可能是裸标识符（react:）或带引号（"react/jsx-runtime"）。
    const bare = seed.replace(/[^A-Za-z0-9_$]/g, '') === seed;
    const hit = bare ? new RegExp(`[,{;\\s]${seed}:`).test(bundle) : bundle.includes(`"${seed}"`);
    assert.ok(hit, `外壳 bundle 应含静态种子键 "${seed}"（种子表常量过期？）`);
  }
  assert.ok(!bundle.includes(LEGACY_WEB_REACT),
    `rc.8 外壳 bundle 不得再含 ${LEGACY_WEB_REACT}（若含，说明内核未迁移，需复核本测试的种子表）`);
});

// ---------------------------------------------------------------------------
// 4) 修复内容自检：bindSnapshotSelector 等价重建存在于需要它的插件
// ---------------------------------------------------------------------------

test('修复自检: 使用 bindSnapshotSelector 的插件都带 rc.8 等价重建', () => {
  const users = companionClientPlugins().filter((name) => {
    const src = fs.readFileSync(path.join(PLUGINS_ROOT, name, 'lib', 'client.js'), 'utf8');
    return /bindSnapshotSelector\(/.test(src.replace(/^\s*\/\/.*$/gm, ''));
  });
  // 成员点名而不是「≥N」：点名能在「某个插件的阶梯被整体删掉」时立刻指出是谁，
  // 而下限哨兵会放过去（2026-10 远端更新实测：dsh-prompt-custom 0.3.5 换成
  // 「独立移植版，不依赖内核 settings API」，自带选择器阶梯随之外移，消费面 5→4）。
  const EXPECTED_USERS = [
    'dsh-conversation-tweaks',
    'dsh-openclaw-bridge',
    'dsh-quest-ui',
    'dsh-subagent-lens',
  ];
  assert.deepStrictEqual(users, EXPECTED_USERS,
    '消费 bindSnapshotSelector 的插件集合发生漂移（新增要确认阶梯正确，减少要确认它真的不再需要 settings 快照）');
  for (const name of users) {
    const src = fs.readFileSync(path.join(PLUGINS_ROOT, name, 'lib', 'client.js'), 'utf8');
    assert.ok(src.includes('useSyncExternalStoreWithSelector'),
      `${name}: 消费 bindSnapshotSelector 但未含 rc.8 等价重建（useSyncExternalStoreWithSelector）`);
  }
});
