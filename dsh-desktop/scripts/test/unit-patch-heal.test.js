'use strict';

// profile-patch-heal.js 纯函数单元测试（node --test）。
// 用法：node --test scripts/test/unit-patch-heal.test.js
// 覆盖：注册行级去重（双缺/三同名/零修改/注释保留/块内重复/部分重复行级手术）、
//       config 覆盖与 disabled 禁用条目绝不删除、定向 insert 块不动、
//       loader 日志四种 id 形态解析（含 bundle 契约形态）、包名→patch id 映射、
//       bundle 迁移双登记移除（整块/部分行级/直注册条目/用户配置保留/零修改）、
//       坏 bundle 二次确认（findMissingBundleDeclarations）、manifest 直扫
//       （scanBundleContracts，不依赖日志）与
//       manifest 原子移除（removeBundlesFromProfile）。

const test = require('node:test');
const assert = require('node:assert');
const {
  dedupePatchEntries,
  dropBlocksByIds,
  parseFailedLoaderIds,
  mapPackagesToPatchIds,
  findMissingBundleDeclarations,
  scanBundleContracts,
  removeBundlesFromProfile,
} = require('../../profile-patch-heal');

test('dedupePatchEntries: 两个重复 insert 块 → 移除后出现的块', () => {
  const input = [
    '# 头部注释',
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '# 尾部注释',
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.ok(r.text.includes('# 头部注释'), '头部注释保留');
  assert.ok(r.text.includes('# 尾部注释'), '尾部注释保留');
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, 'balance 只剩一个');
  assert.ok(r.text.includes('id: terminal'), '其它条目保留');
  // 顺序：terminal 仍在 balance 之后、原相对顺序不变
  assert.ok(r.text.indexOf('id: balance') < r.text.indexOf('id: terminal'));
});

test('dedupePatchEntries: 无重复 → 零修改（返回原文本）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: terminal',
    "  name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.strictEqual(r.text, input);
  assert.deepStrictEqual(r.removed, []);
});

test('dedupePatchEntries: 无 id 条目与纯注释文件原样保留', () => {
  const comments = '# 只有注释\n# 没有条目\n';
  assert.strictEqual(dedupePatchEntries(comments).text, comments);
  const bare = '- insert: []\n';
  assert.strictEqual(dedupePatchEntries(bare).text, bare);
});

test('dedupePatchEntries: 三个同名块 → 只保留第一个', () => {
  const blocks = [];
  for (let i = 0; i < 3; i += 1) {
    blocks.push('- insert:', '    - id: balance', "      name: '@deepseek-ai/dsh-balance'");
  }
  const r = dedupePatchEntries(blocks.join('\n'));
  assert.deepStrictEqual(r.removed, ['balance', 'balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1);
});

test('dedupePatchEntries: 重复条目携带嵌套列表 config 时整棵删除（issue #73 不产孤儿列表行）', () => {
  // 被删的是第二个重复 balance（带 config 嵌套列表）；其整棵子树（config/- a/- b）
  // 必须随行删除，兄弟条目 other 原样保留，不产生悬空的 - a / - b 孤儿列表行。
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: 'balance'",
    '    - id: balance',
    "      name: 'balance'",
    '      config:',
    '        - a',
    '        - b',
    '    - id: other',
    "      name: 'other'",
    '',
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.ok(!r.text.includes('config:'), '被删条目的 config 键不得残留');
  assert.ok(!r.text.includes('- a'), '嵌套列表项 - a 不得成为孤儿行残留');
  assert.ok(!r.text.includes('- b'), '嵌套列表项 - b 不得成为孤儿行残留');
  assert.strictEqual((r.text.match(/- id: other/g) || []).length, 1, '兄弟条目 other 保留');
  assert.ok(r.text.includes("name: 'other'"));
  const remaining = r.text.split('\n').filter((l) => /^\s+-\s/.test(l) && !/^\s+- id:/.test(l));
  assert.deepStrictEqual(remaining, [], '不应残留任何悬空列表行');
});

test('dedupePatchEntries: insert 块部分重复 → 只删重复注册行，保留块内新注册', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, '重复注册的 balance 行只剩首次注册');
  assert.strictEqual((r.text.match(/- id: terminal/g) || []).length, 1, '新注册 terminal 保留');
  assert.ok(r.text.includes('- insert:'), '块头保留');
  assert.ok(r.text.includes("name: '@deepseek-ai/dsh-terminal-tab'"), 'terminal 的 name 保留');
});

test('dedupePatchEntries: config 覆盖与 disabled 禁用条目绝不删除（用户配置保留）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: balance',
    '  disabled: true',
    '- insert:',
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '- id: terminal',
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '无重复注册 → 零写入（config/disabled 覆盖条目原样保留）');
});

test('dedupePatchEntries: 同一 insert 块内重复注册（罕见形态）→ 行级去重', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, '块内重复注册行移除');
  assert.strictEqual((r.text.match(/- id: terminal/g) || []).length, 1, 'terminal 保留');
});

test('dedupePatchEntries: 定向 insert 块（- id: X + insert:）不参与去重', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: extra-group',
    '  insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '定向 insert 块原样保留');
});

test('parseFailedLoaderIds: 三种日志形态', () => {
  const logText = [
    'failed to apply loader entry 7ee99b10 (@deepseek-ai/dsh-balance): list slot "conversation.composer.dock" already has an entry',
    '[cause]: TypeError: duplicate loader entry id: balance',
    'failed to apply loader entry abc123 (include): something else',
  ].join('\n');
  const ids = parseFailedLoaderIds(logText);
  assert.ok(ids.includes('7ee99b10'), '旧 hash 形态保留');
  assert.ok(ids.includes('balance'), 'duplicate loader entry id 形态识别');
  assert.ok(ids.includes('@deepseek-ai/dsh-balance'), '括号包名形态识别');
  assert.ok(!ids.includes('include'), 'include 条目排除');
});

test('parseFailedLoaderIds: import 形态（5.4→5.5+ 内核模块表严格化，missed the module table）', () => {
  // 用户真实错误文案（@linxin666/dsh-desktop-launcher 旧版在 alpha.x 内核下）：
  // safe-boot 此前只认 apply 形态，import 失败从未被自动禁用 → 5.5/5.6 反复弹。
  const logText = [
    'failed to import loader entry 9c5ab60c (@linxin666/dsh-desktop-launcher): client-modules: require("@deepseek-ai/dsh-client-runtime/client") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)',
    'dsh web: http://127.0.0.1:1',
  ].join('\n');
  const ids = parseFailedLoaderIds(logText);
  assert.ok(ids.includes('9c5ab60c'), 'import hash 形态识别');
  assert.ok(ids.includes('@linxin666/dsh-desktop-launcher'), 'import 括号包名形态识别');
  assert.ok(!ids.includes('@deepseek-ai/dsh-client-runtime/client'), '错误详情里的 require 目标不得误抓（非失败条目）');
});

test('mapPackagesToPatchIds: 包名映射回条目 id（含重复注册场景）', () => {
  const patch = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: terminal',
    "  name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const ids = mapPackagesToPatchIds(patch, ['@deepseek-ai/dsh-balance']);
  assert.deepStrictEqual(ids, ['balance', 'balance'], '重复注册返回全部对应 id');
  assert.deepStrictEqual(mapPackagesToPatchIds(patch, ['@deepseek-ai/other']), []);
  assert.deepStrictEqual(mapPackagesToPatchIds(patch, []), []);
});

test('dropBlocksByIds: 命中 insert 块整块删除，其余条目与注释保留', () => {
  const input = [
    '# 头部注释',
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '# 尾部注释',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('id: better-sidebar'), '命中块已移除');
  assert.ok(r.text.includes('id: balance'), '未命中条目保留');
  assert.ok(r.text.includes('# 头部注释') && r.text.includes('# 尾部注释'), '注释保留');
});

test('dropBlocksByIds: 直接条目命中 → 连同兄弟行一起删除', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '- id: balance',
    "  name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('better-sidebar'), '直接条目已删除');
  assert.ok(r.text.includes('id: balance'), '其它条目保留');
});

test('dropBlocksByIds: insert 块部分命中 → 只删命中行与兄弟行，保留块内其它条目', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('better-sidebar'), '命中行已删除');
  assert.ok(r.text.includes('- insert:'), '块头保留');
  assert.ok(r.text.includes('id: balance') && r.text.includes('@deepseek-ai/dsh-balance'), '同块其它条目原样保留');
});

test('dropBlocksByIds: 无命中 → 返回原文本（零写入）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.strictEqual(r.text, input);
  assert.deepStrictEqual(r.removed, []);
  const r2 = dropBlocksByIds(input, []);
  assert.strictEqual(r2.text, input);
});

test('dropBlocksByIds: 多个命中块全部移除', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- insert:',
    '    - id: harness-pet',
    "      name: 'harness-pet'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar', 'harness-pet']);
  assert.deepStrictEqual(r.removed, ['better-sidebar', 'harness-pet']);
  assert.ok(r.text.includes('id: balance'), '未命中条目保留');
  assert.strictEqual((r.text.match(/id: balance/g) || []).length, 1);
});

test('dropBlocksByIds: config 覆盖与 disabled 禁用条目绝不删除（bundle 迁移保留用户配置）', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- id: better-sidebar',
    '  disabled: true',
    '- id: better-sidebar',
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.strictEqual((r.text.match(/- id: better-sidebar/g) || []).length, 2, 'disabled 与 config 覆盖条目保留');
  assert.ok(!r.text.includes("name: 'dsh-better-sidebar'"), '注册行（insert 块）已移除');
  assert.ok(r.text.includes('disabled: true') && r.text.includes('width: 320'), '用户配置原样保留');
});

test('dropBlocksByIds: 直注册条目带 config 时不删除（用户配置保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '含 config 的直条目保留');
});

test('dropBlocksByIds: 直注册条目带 disabled 时不删除（用户禁用意图保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  disabled: true',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '含 disabled 的直条目保留');
});

test('dropBlocksByIds: 直注册条目带任意自定义键时不删除（用户覆盖条目保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '携带自定义键的直条目保留');
});

// ---------- 第四形态：profile bundle declares no dsh.bundle ----------

test('parseFailedLoaderIds: 第四形态（bundle 契约）裸名与 @scope 名', () => {
  const logText = [
    'Error: dsh: profile bundle "dsh-newapi-deepsseek" declares no dsh.bundle in its package.json',
    'Error: dsh: profile bundle "@scope/dsh-plugin" declares no dsh.bundle in its package.json',
    'some other line',
  ].join('\n');
  const ids = parseFailedLoaderIds(logText);
  assert.ok(ids.includes('dsh-newapi-deepsseek'), '裸包名形态识别');
  assert.ok(ids.includes('@scope/dsh-plugin'), '@scope 包名形态识别');
  assert.strictEqual((logText.match(/declares no dsh\.bundle/g) || []).length, 2);
});

// ---------- findMissingBundleDeclarations：坏 bundle 二次确认 ----------

/** 内存假 fs：初始文件 Map（路径 → 内容字符串）；键统一正斜杠（Windows path.join 会产出反斜杠）。 */
function memFs(files) {
  const norm = (p) => String(p).replace(/\\/g, '/');
  const store = new Map(files ? Object.entries(files).map(([k, v]) => [norm(k), v]) : []);
  return {
    readFileSync(p) {
      const k = norm(p);
      if (!store.has(k)) { const err = new Error('ENOENT: ' + k); err.code = 'ENOENT'; throw err; }
      return store.get(k);
    },
    writeFileSync(p, s) { store.set(norm(p), String(s)); },
    copyFileSync(a, b) {
      const ka = norm(a);
      if (!store.has(ka)) { const err = new Error('ENOENT: ' + ka); err.code = 'ENOENT'; throw err; }
      store.set(norm(b), store.get(ka));
    },
    renameSync(a, b) {
      const ka = norm(a);
      if (!store.has(ka)) { const err = new Error('ENOENT: ' + ka); err.code = 'ENOENT'; throw err; }
      store.set(norm(b), store.get(ka));
      store.delete(ka);
    },
    unlinkSync(p) { store.delete(norm(p)); },
    existsSync(p) { return store.has(norm(p)); },
    keys() { return store.keys(); },
  };
}

const mkManifest = (bundles, deps) => JSON.stringify({
  name: 'dsh-web-profile',
  dsh: { profile: { bundles } },
  dependencies: deps || {},
}, null, 2) + '\n';

test('findMissingBundleDeclarations: 日志无第四形态 → 空名单（不读文件）', () => {
  const fs = memFs({});
  assert.deepStrictEqual(findMissingBundleDeclarations('X:/profiles/web', 'normal log line', fs), []);
});

test('findMissingBundleDeclarations: 二次确认只收「bundle 清单内 + 缺 dsh.bundle.patch」的包', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-bad', 'dsh-ok', '@deepseek-ai/dsh-core']),
    [profileDir + '/node_modules/dsh-bad/package.json']: JSON.stringify({ name: 'dsh-bad', main: 'lib/index.js' }),
    [profileDir + '/node_modules/dsh-ok/package.json']: JSON.stringify({ name: 'dsh-ok', dsh: { bundle: { patch: 'cordis.yml' } } }),
    [profileDir + '/node_modules/@deepseek-ai/dsh-core/package.json']: JSON.stringify({ name: '@deepseek-ai/dsh-core', dsh: { bundle: { patch: 'cordis.yml' } } }),
  });
  const logText = 'Error: dsh: profile bundle "dsh-bad" declares no dsh.bundle in its package.json';
  const r = findMissingBundleDeclarations(profileDir, logText, fs);
  assert.deepStrictEqual(r, ['dsh-bad'], '缺声明的坏包收入名单；好包与官方包不收');
});

test('findMissingBundleDeclarations: 日志点名但不在 bundles 清单 → 不收', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-ok']),
    [profileDir + '/node_modules/dsh-other/package.json']: JSON.stringify({ name: 'dsh-other' }),
  });
  const logText = 'Error: dsh: profile bundle "dsh-other" declares no dsh.bundle in its package.json';
  assert.deepStrictEqual(findMissingBundleDeclarations(profileDir, logText, fs), []);
});

test('findMissingBundleDeclarations: 包目录缺失（cannot-resolve 家族）→ 不收', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-gone']),
  });
  const logText = 'Error: dsh: profile bundle "dsh-gone" declares no dsh.bundle in its package.json';
  assert.deepStrictEqual(findMissingBundleDeclarations(profileDir, logText, fs), [], '二级确认读不到 package.json → 交给 cannot-resolve 路线');
});

test('findMissingBundleDeclarations: @deepseek-ai/* 官方包即使缺声明也被过滤', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['@deepseek-ai/dsh-core']),
    [profileDir + '/node_modules/@deepseek-ai/dsh-core/package.json']: JSON.stringify({ name: '@deepseek-ai/dsh-core' }),
  });
  const logText = 'Error: dsh: profile bundle "@deepseek-ai/dsh-core" declares no dsh.bundle in its package.json';
  assert.deepStrictEqual(findMissingBundleDeclarations(profileDir, logText, fs), []);
});

// ---------- scanBundleContracts：不依赖日志的 manifest 直扫 ----------

test('scanBundleContracts: 不依赖日志，直接扫清单收缺声明包（好包/官方包不收）', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-bad', 'dsh-ok', '@deepseek-ai/dsh-core']),
    [profileDir + '/node_modules/dsh-bad/package.json']: JSON.stringify({ name: 'dsh-bad', main: 'lib/index.js' }),
    [profileDir + '/node_modules/dsh-ok/package.json']: JSON.stringify({ name: 'dsh-ok', dsh: { bundle: { patch: 'cordis.yml' } } }),
    [profileDir + '/node_modules/@deepseek-ai/dsh-core/package.json']: JSON.stringify({ name: '@deepseek-ai/dsh-core' }),
  });
  // 关键：日志为空也能发现（日志轮转/截断场景）
  assert.deepStrictEqual(scanBundleContracts(profileDir, fs), ['dsh-bad']);
});

test('scanBundleContracts: 声明存在但值为非字符串（对象/数字）也视为缺声明', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-obj', 'dsh-num']),
    [profileDir + '/node_modules/dsh-obj/package.json']: JSON.stringify({ name: 'dsh-obj', dsh: { bundle: { patch: { file: 'cordis.yml' } } } }),
    [profileDir + '/node_modules/dsh-num/package.json']: JSON.stringify({ name: 'dsh-num', dsh: { bundle: { patch: 42 } } }),
  });
  assert.deepStrictEqual(scanBundleContracts(profileDir, fs).sort(), ['dsh-num', 'dsh-obj']);
});

test('scanBundleContracts: 包目录缺失（cannot-resolve 家族）→ 不收', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({
    [profileDir + '/package.json']: mkManifest(['dsh-gone']),
  });
  assert.deepStrictEqual(scanBundleContracts(profileDir, fs), [], '二级确认读不到 package.json → 交给 cannot-resolve 路线');
});

test('scanBundleContracts: manifest 缺失/读失败 → 空名单（不抛错）', () => {
  const profileDir = 'X:/profiles/web';
  const fs = memFs({});
  assert.deepStrictEqual(scanBundleContracts(profileDir, fs), []);
});

// ---------- removeBundlesFromProfile：manifest 原子移除 ----------
// 兼容函数已收口到 ManifestStore（写锁 + 原子写 + 备份保留）：
// 返回 Promise<string[]>；测试改用真实临时目录（真实 fs 语义）。

const os = require('node:os');
const nodePath = require('node:path');
const nodeFs = require('node:fs');

test('removeBundlesFromProfile: 只移出 bundle 启动栈，保留依赖包并备份原文件', async () => {
  const profileDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dsh-heal-rmb-'));
  const pkgFile = nodePath.join(profileDir, 'package.json');
  nodeFs.writeFileSync(pkgFile, mkManifest(['dsh-bad', 'dsh-ok'], { 'dsh-bad': '1.0.0', 'dsh-ok': '1.0.0' }));
  const before = nodeFs.readFileSync(pkgFile, 'utf8');
  const r = await removeBundlesFromProfile(profileDir, ['dsh-bad']);
  assert.deepStrictEqual(r, ['dsh-bad'], '返回实际移除名单');
  const after = JSON.parse(nodeFs.readFileSync(pkgFile, 'utf8'));
  assert.deepStrictEqual(after.dsh.profile.bundles, ['dsh-ok'], 'bundles 剔除坏包');
  assert.deepStrictEqual(Object.keys(after.dependencies), ['dsh-bad', 'dsh-ok'], '依赖保留，兼容纯客户端插件挂载');
  const baks = nodeFs.readdirSync(profileDir).filter((p) => p.startsWith('package.json.bak-'));
  assert.strictEqual(baks.length, 1, '备份文件存在');
  assert.strictEqual(nodeFs.readFileSync(nodePath.join(profileDir, baks[0]), 'utf8'), before, '备份内容是原 manifest');
  nodeFs.rmSync(profileDir, { recursive: true, force: true });
});

test('removeBundlesFromProfile: 官方 bundle 即使被点名也拒绝移除', async () => {
  const profileDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dsh-heal-rmb-'));
  const pkgFile = nodePath.join(profileDir, 'package.json');
  nodeFs.writeFileSync(pkgFile, mkManifest(['@deepseek-ai/dsh-base', 'dsh-ok']));
  assert.deepStrictEqual(await removeBundlesFromProfile(profileDir, ['@deepseek-ai/dsh-base']), []);
  assert.deepStrictEqual(JSON.parse(nodeFs.readFileSync(pkgFile, 'utf8')).dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dsh-ok']);
  nodeFs.rmSync(profileDir, { recursive: true, force: true });
});

test('removeBundlesFromProfile: 原子替换失败时原 manifest 保持不变', { skip: process.platform !== 'win32' }, async () => {
  // Windows：目标文件只读（readonly 属性）→ tmp+rename 替换失败 → 抛错且原文件完好。
  const profileDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dsh-heal-rmb-'));
  const pkgFile = nodePath.join(profileDir, 'package.json');
  nodeFs.writeFileSync(pkgFile, mkManifest(['dsh-bad', 'dsh-ok']));
  const before = nodeFs.readFileSync(pkgFile, 'utf8');
  try {
    nodeFs.chmodSync(pkgFile, 0o444);
    await assert.rejects(() => removeBundlesFromProfile(profileDir, ['dsh-bad']));
    assert.strictEqual(nodeFs.readFileSync(pkgFile, 'utf8'), before);
    assert.strictEqual(nodeFs.readdirSync(profileDir).filter((p) => p.includes('.tmp-')).length, 0, '临时文件已清理');
  } finally {
    nodeFs.chmodSync(pkgFile, 0o666);
    nodeFs.rmSync(profileDir, { recursive: true, force: true });
  }
});

test('removeBundlesFromProfile: 空名单/无命中 → 零写入', async () => {
  const profileDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dsh-heal-rmb-'));
  const pkgFile = nodePath.join(profileDir, 'package.json');
  nodeFs.writeFileSync(pkgFile, mkManifest(['dsh-ok']));
  assert.deepStrictEqual(await removeBundlesFromProfile(profileDir, []), []);
  assert.deepStrictEqual(await removeBundlesFromProfile(profileDir, ['dsh-other']), []);
  assert.strictEqual(nodeFs.readdirSync(profileDir).filter((p) => p.startsWith('package.json.bak-')).length, 0, '无变化不产生备份');
  assert.ok(nodeFs.readFileSync(pkgFile, 'utf8').includes('dsh-ok'));
  nodeFs.rmSync(profileDir, { recursive: true, force: true });
});

test('removeBundlesFromProfile: manifest 缺失 → 空名单（不抛错）', async () => {
  const profileDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'dsh-heal-rmb-'));
  assert.deepStrictEqual(await removeBundlesFromProfile(profileDir, ['dsh-bad']), []);
  nodeFs.rmSync(profileDir, { recursive: true, force: true });
});
