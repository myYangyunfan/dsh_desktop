'use strict';

// profile-manifest.js 纯函数单元测试（node --test，无需 Electron）。
// 用法：node --test scripts/test/unit-manifest.test.js
// 覆盖：双缺失/单缺失补齐、模板顺序、幂等零写入、空数组、无可解析核心、
//       非字符串条目容错、重复项防护。

const test = require('node:test');
const assert = require('node:assert');
const { ensureCoreBundles, CORE_BUNDLE_NAMES } = require('../../profile-manifest');

const CORES = [...CORE_BUNDLE_NAMES];

test('双缺失：核心 bundles 补齐到最前，既有条目顺序保留', () => {
  const r = ensureCoreBundles(['@dsh-external/dsh-super-injector', 'zat-dsh-engine'], CORES);
  assert.deepStrictEqual(r.next, [...CORES, '@dsh-external/dsh-super-injector', 'zat-dsh-engine']);
  assert.deepStrictEqual(r.added, CORES);
});

test('单缺失：只补缺失的那个，且保持模板先后顺序', () => {
  const r = ensureCoreBundles(['@deepseek-ai/dsh-web-app', 'x-custom'], CORES);
  assert.deepStrictEqual(r.next, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'x-custom']);
  assert.deepStrictEqual(r.added, ['@deepseek-ai/dsh-base']);
});

test('健康（核心齐全）：返回 null，零写入', () => {
  assert.strictEqual(ensureCoreBundles([...CORES, 'zat-dsh-engine'], CORES), null);
  // 顺序不同但齐全 → 不重排、不写入
  assert.strictEqual(ensureCoreBundles(['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-base'], CORES), null);
});

test('空数组：补齐全部核心', () => {
  const r = ensureCoreBundles([], CORES);
  assert.deepStrictEqual(r.next, CORES);
  assert.deepStrictEqual(r.added, CORES);
});

test('无可解析核心：返回 null，绝不写入无法解析的名字', () => {
  assert.strictEqual(ensureCoreBundles(['zat-dsh-engine'], []), null);
  assert.strictEqual(ensureCoreBundles([], []), null);
  // 解析名单里混入非模板名 → 过滤后无可补项
  assert.strictEqual(ensureCoreBundles([], ['some-other-bundle']), null);
});

test('非字符串条目容错：不抛异常、原样保留', () => {
  const r = ensureCoreBundles([null, 42, 'zat-dsh-engine'], CORES);
  assert.deepStrictEqual(r.next, [...CORES, null, 42, 'zat-dsh-engine']);
});

test('既有条目含重复/核心重复：核心不重复补齐，原内容原样保留', () => {
  const r = ensureCoreBundles(['zat-dsh-engine', 'zat-dsh-engine'], CORES);
  assert.deepStrictEqual(r.next, [...CORES, 'zat-dsh-engine', 'zat-dsh-engine']);
  // 核心之一重复但仍缺另一个 → 只补缺失的那个
  const r2 = ensureCoreBundles([CORES[0], CORES[0], 'zat-dsh-engine'], CORES);
  assert.deepStrictEqual(r2.next, [CORES[1], CORES[0], CORES[0], 'zat-dsh-engine']);
  assert.deepStrictEqual(r2.added, [CORES[1]]);
  // 核心齐全（即使有重复）→ 不再补
  assert.strictEqual(ensureCoreBundles([CORES[0], CORES[0], CORES[1], 'zat-dsh-engine'], CORES), null);
});

test('resolvableCores 含重复：新增列表去重', () => {
  const r = ensureCoreBundles([], [CORES[0], CORES[0], CORES[1]]);
  assert.deepStrictEqual(r.added, CORES);
  assert.deepStrictEqual(r.next, CORES);
});
