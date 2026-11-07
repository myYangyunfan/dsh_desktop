'use strict';

// loader 自动隔离补丁单测。0.2.0-rc.2 起 tree-isolation 一层**已退役**（上游
// cordis-plugin-loader 1.0.5 原生逐条目隔离），本文件改为：真实产物上验证退役
// 哨兵（锚点整份失配 + 原生隔离正证）；合成夹具上保留 transform 行为契约（休眠
// 补丁的实现面回归，参照 vision-key-fix 先例）；dsh-app-boot 的激活审计与
// installFailLoud 两条仍是在役补丁，照旧做锚点命中 / 幂等 / 注入契约断言。
// 绝不修改真实 node_modules（只读断言）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LOADER_TREE_ISOLATION_MARKER,
  LOADER_ACTIVATION_ISOLATION_MARKER,
  FAIL_LOUD_ISOLATION_MARKER,
  transformLoaderTreeIsolation,
  transformLoaderActivationIsolation,
  transformFailLoudIsolation,
} = require('../lib/loader-isolation');

const repoRoot = path.resolve(__dirname, '..', '..');
const loaderFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js');
const appBootFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');

test('loader-isolation: 真实 vendored cordis-plugin-loader 已退役（rc.2 上游原生逐条目隔离）', () => {
  // 0.2.0-rc.2 判定（patch-registry 已摘除 loader-tree-isolation 规格，理由见其注释）：
  // cordis-plugin-loader 1.0.5 自己做到了 EntryGroup.update 每个 id 各自
  // .catch(logger.error)、EntryTree.await 只 Promise.allSettled，旧「聚合失败再
  // throw」的插入点不复存在 → 本层锚点整份失配（= 补丁退役，不是静默失效）。
  // 这几条断言同时是**退役哨兵**：上游若把隔离改回抛出形态，throw 计数与
  // allSettled 正证会翻红，提醒我们把补丁重新靶回去。
  const src = fs.readFileSync(loaderFile, 'utf8');
  const r = transformLoaderTreeIsolation(src, loaderFile);
  assert.equal(r.status, 'anchor-missing', 'rc.2 字节里不该再有可注入的失败分支');
  assert.equal(src.split(LOADER_TREE_ISOLATION_MARKER).length - 1, 0, '不得残留本补丁 marker');
  assert.equal(src.split('[loader-isolation]').length - 1, 0, '不得残留本补丁标记行');
  assert.ok(src.includes('Promise.allSettled'), '上游 await 走 allSettled（原生隔离正证）');
  // 0.2.2-rc.1 的 cordis-plugin-loader 1.1.0 全文件 4 处 throw（上一代 3 处；新增的是
  // `entry ${id} already exists in the target tree` 这条树结构校验，不在加载路径上）。
  // 判据不只看数量：每一处都必须仍是「条目查找 / 条目结构」错误——上游哪天把逐条目隔离
  // 改回「整体抛」，暴增的 throw 与形状检查会当场翻红，提醒把补丁重新靶回去。
  const throwLines = src.split('\n').filter((line) => /\bthrow\b/.test(line));
  assert.equal(throwLines.length, 4, '全文件 throw 只剩条目查找/结构校验 4 处（旧形态是 25 处）');
  for (const line of throwLines) {
    assert.match(
      line,
      /cannot resolve entry|is not a group|already exists in the target tree/,
      '不得出现「整份加载失败」型 throw（原生逐条目隔离会因此失效）：' + line.trim(),
    );
  }
});

test('loader-isolation: 合成夹具锚点命中（与真实产物无关的漂移防线）', () => {
  const LOADER_UPDATE_OUTCOMES_OLD = [
    '\t\t\tconst outcomes = await Promise.allSettled(config.map((options) => this.create(options)));',
    '\t\t\tif (this.ctx.fiber.uid === null) return;',
    '\t\t\tconst failures = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
    '\t\t\tif (failures.length === 1) throw failures[0];',
    '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader entries failed to apply");',
  ].join('\n');
  const LOADER_AWAIT_FAILURES_OLD = [
    '\t\t\tconst failures = (await Promise.allSettled([...this.entries()].map((entry) => entry._await()))).filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
    '\t\t\tif (failures.length === 1) throw failures[0];',
    '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader fibers failed");',
  ].join('\n');
  const fixture = LOADER_UPDATE_OUTCOMES_OLD + '\nfunction updateError(stage, options, cause) { return 1; }\n' + LOADER_AWAIT_FAILURES_OLD;
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes('isolateEntryApplyFailures'));
  assert.ok(r.src.includes('isolateFiberFailures'));
});

test('loader-isolation: 真实 vendored dsh-app-boot 激活审计锚点命中且幂等', () => {
  const src = fs.readFileSync(appBootFile, 'utf8');
  if (src.includes(LOADER_ACTIVATION_ISOLATION_MARKER)) {
    const r = transformLoaderActivationIsolation(src, appBootFile);
    assert.equal(r.status, 'already');
    assert.ok(src.includes('isolateInactiveEntries'));
    return;
  }
  const r1 = transformLoaderActivationIsolation(src, appBootFile);
  assert.equal(r1.status, 'changed');
  const r2 = transformLoaderActivationIsolation(r1.src, appBootFile);
  assert.equal(r2.status, 'already');
  assert.ok(r1.src.includes('isolateInactiveEntries'), '审计替换为隔离审计');
  assert.ok(r1.src.includes('auto-isolated (other plugins unaffected)'), '隔离语义文案');
  assert.ok(r1.src.includes('core plugin(s) failed'), '受保护核心仍 fatal');
  // 原审计调用点被替换（boot 不再 await 原 assertEntriesActivated）
  const callCount = (r1.src.match(/await isolateInactiveEntries\(ctx, binName\);/g) || []).length;
  assert.equal(callCount, 1);
});

test('loader-isolation: installFailLoud 就绪后隔离锚点命中且幂等', () => {
  const src = fs.readFileSync(appBootFile, 'utf8');
  if (src.includes(FAIL_LOUD_ISOLATION_MARKER)) {
    const r = transformFailLoudIsolation(src, appBootFile);
    assert.equal(r.status, 'already');
    assert.ok(src.includes('DSH_CRASH_SHIELD_ARMED'));
    return;
  }
  const r1 = transformFailLoudIsolation(src, appBootFile);
  assert.equal(r1.status, 'changed');
  const r2 = transformFailLoudIsolation(r1.src, appBootFile);
  assert.equal(r2.status, 'already');
  assert.ok(r1.src.includes('DSH_CRASH_SHIELD_ARMED'), '武装标记判断已注入');
  assert.ok((r1.src.match(/DSH_CRASH_SHIELD_ARMED === "1"/g) || []).length >= 2, '两个 exit 分支均隔离');
  assert.ok(r1.src.includes('[crash-shield] isolated fatal load failure'), '隔离日志已注入');
});

test('loader-isolation: 锚点缺失时返回 anchor-missing 且不改写', () => {
  const r = transformLoaderTreeIsolation('export const x = 1;', 'fake.js');
  assert.equal(r.status, 'anchor-missing');
  const r2 = transformLoaderActivationIsolation('export const x = 1;', 'fake.js');
  assert.equal(r2.status, 'anchor-missing');
  const r3 = transformFailLoudIsolation('export const x = 1;', 'fake.js');
  assert.equal(r3.status, 'anchor-missing');
});

test('loader-isolation: marker 常量与 patch-adapters 单一数据源', () => {
  const { markers } = require('../lib/patch-adapters');
  assert.equal(markers.LOADER_TREE_ISOLATION_MARKER, LOADER_TREE_ISOLATION_MARKER);
  assert.equal(markers.LOADER_ACTIVATION_ISOLATION_MARKER, LOADER_ACTIVATION_ISOLATION_MARKER);
  assert.equal(markers.FAIL_LOUD_ISOLATION_MARKER, FAIL_LOUD_ISOLATION_MARKER);
});
