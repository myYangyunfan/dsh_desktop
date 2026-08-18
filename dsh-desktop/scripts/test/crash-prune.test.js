'use strict';

// A-8 崩溃转储清理增量测试（node --test）：
// 超龄清理、数量上限、最新豁免、叠加去重、空输入。
// 用法：node --test scripts/test/crash-prune.test.js

const test = require('node:test');
const assert = require('node:assert');

const {
  CRASH_PRUNE_MAX_AGE_MS, CRASH_PRUNE_MAX_KEEP,
  selectCrashDumpsToRemove,
} = require('../lib/crash-prune');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function e(name, mtimeMs) {
  return { name, mtimeMs };
}

test('crash-prune: 超龄转储被删、年轻保留（旧语义不变）', () => {
  const now = 1000 * DAY;
  const out = selectCrashDumpsToRemove(
    [
      e('a.dmp', now - 20 * DAY),
      e('b.dmp', now - 14 * DAY - 1),
      e('c.dmp', now - 13 * DAY),
      e('d.dmp', now - 1 * HOUR),
    ],
    { now }
  );
  assert.deepStrictEqual(out.sort(), ['a.dmp', 'b.dmp']);
});

test('crash-prune: 数量超限删除最旧、保留最近 5 个', () => {
  const now = 1000 * DAY;
  const entries = [];
  for (let i = 0; i < 8; i++) entries.push(e('d' + i + '.dmp', now - (8 - i) * HOUR)); // d0 最旧
  const out = selectCrashDumpsToRemove(entries, { now });
  assert.deepStrictEqual(out.sort(), ['d0.dmp', 'd1.dmp', 'd2.dmp']);
  const kept = entries.map((x) => x.name).filter((n) => !out.includes(n)).sort();
  assert.deepStrictEqual(kept, ['d3.dmp', 'd4.dmp', 'd5.dmp', 'd6.dmp', 'd7.dmp']);
});

test('crash-prune: 最新 1 个豁免——N=6 只删最旧，最新永不被删', () => {
  const now = 1000 * DAY;
  const entries = [
    e('oldest.dmp', now - 6 * HOUR),
    e('old2.dmp', now - 5 * HOUR),
    e('old3.dmp', now - 4 * HOUR),
    e('mid.dmp', now - 3 * HOUR),
    e('newer.dmp', now - 2 * HOUR),
    e('newest.dmp', now - 1 * HOUR),
  ];
  const out = selectCrashDumpsToRemove(entries, { now });
  assert.deepStrictEqual(out, ['oldest.dmp']);
});

test('crash-prune: 数量恰好 5 不删；少于 5 不删', () => {
  const now = 1000 * DAY;
  const five = [e('a.dmp', now - 5 * HOUR), e('b.dmp', now - 4 * HOUR), e('c.dmp', now - 3 * HOUR), e('d.dmp', now - 2 * HOUR), e('e.dmp', now - 1 * HOUR)];
  assert.deepStrictEqual(selectCrashDumpsToRemove(five, { now }), []);
  assert.deepStrictEqual(selectCrashDumpsToRemove(five.slice(0, 2), { now }), []);
});

test('crash-prune: 空输入返回空', () => {
  assert.deepStrictEqual(selectCrashDumpsToRemove([]), []);
});

test('crash-prune: 超龄与数量叠加时同文件只删一次、无重复', () => {
  const now = 1000 * DAY;
  const entries = [
    e('aged.dmp', now - 15 * DAY),            // 超龄
    e('fresh1.dmp', now - 6 * HOUR),
    e('fresh2.dmp', now - 5 * HOUR),
    e('fresh3.dmp', now - 4 * HOUR),
    e('fresh4.dmp', now - 3 * HOUR),
    e('fresh5.dmp', now - 2 * HOUR),
    e('fresh6.dmp', now - 1 * HOUR),
  ];
  const out = selectCrashDumpsToRemove(entries, { now });
  assert.strictEqual(new Set(out).size, out.length, '不得重复');
  assert.deepStrictEqual(out.sort(), ['aged.dmp', 'fresh1.dmp']);
  const kept = entries.map((x) => x.name).filter((n) => !out.includes(n)).sort();
  assert.deepStrictEqual(kept, ['fresh2.dmp', 'fresh3.dmp', 'fresh4.dmp', 'fresh5.dmp', 'fresh6.dmp']);
});

test('crash-prune: 常量语义（14 天 / 5 个）', () => {
  assert.strictEqual(CRASH_PRUNE_MAX_AGE_MS, 14 * 24 * 3600 * 1000);
  assert.strictEqual(CRASH_PRUNE_MAX_KEEP, 5);
});
