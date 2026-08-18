'use strict';

// A-13: bench-gate 对比逻辑单元测试（纯函数，无需真基准数据）。
// 用法：node --test scripts/test/bench-gate.test.js

const test = require('node:test');
const assert = require('node:assert');

const { BENCH_DEFAULT_TOLERANCE, compareBench, formatReport } = require('../bench-gate');

test('bench-gate: p50 不超容差 → ok，无违规', () => {
  const base = { totalP50: 10000, p50: { 'boot:ready': 10000, 'boot:patches': 1000 } };
  const bench = { totalP50: 11000, p50: { 'boot:ready': 11000, 'boot:patches': 1100 } };
  const r = compareBench(base, bench, 1.2);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.violations, []);
  assert.strictEqual(r.totalP50, 11000);
  assert.strictEqual(r.baselineTotalP50, 10000);
});

test('bench-gate: 单阶段超容差 → 违规列出并 ok=false', () => {
  const base = { totalP50: 10000, p50: { 'boot:ready': 10000, 'boot:patches': 1000, 'boot:spawn': 500 } };
  const bench = { totalP50: 12100, p50: { 'boot:ready': 12100, 'boot:patches': 1300, 'boot:spawn': 450 } };
  const r = compareBench(base, bench, 1.2);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.violations.length, 2, 'boot:ready 与 boot:patches 均超 1.2x');
  assert.deepStrictEqual(r.violations.map((v) => v.stage).sort(), ['boot:patches', 'boot:ready']);
  assert.strictEqual(r.violations[0].pct, 121, '百分比应取整 121%');
});

test('bench-gate: 缺阶段数据/非数值/基线条目为 0 → 跳过不误报', () => {
  const base = { totalP50: 10000, p50: { 'boot:ready': 10000, 'boot:spawn': 0, 'boot:load': 500 } };
  // load 为 null（非数值）、spawn 基线条目为 0（跳过）、ready 仅 1.1x → 全部不违规
  const bench = { totalP50: 11000, p50: { 'boot:ready': 11000, 'boot:load': null } };
  const r = compareBench(base, bench, 1.2);
  assert.strictEqual(r.ok, true, 'spawn 基线为 0 与 load 缺失都应跳过');
  assert.deepStrictEqual(r.violations, []);
});

test('bench-gate: 非法容差回落默认 1.2；精确边界不告警', () => {
  const base = { totalP50: 100, p50: { 'boot:ready': 100 } };
  const at = compareBench(base, { totalP50: 120, p50: { 'boot:ready': 120 } }, 1.2);
  assert.strictEqual(at.ok, true, '恰好 120% 不超容差');
  const over = compareBench(base, { totalP50: 121, p50: { 'boot:ready': 121 } }, null);
  assert.strictEqual(over.ok, false, '非法容差回落默认 1.2 后 121% 应违规');
  assert.strictEqual(BENCH_DEFAULT_TOLERANCE, 1.2);
});

test('bench-gate: formatReport 输出 PASS/告警/缺基线文案', () => {
  const pass = formatReport({ missingBaseline: false, ok: true, violations: [], totalP50: 11000, baselineTotalP50: 10000 });
  assert.ok(pass.includes('PASS'), pass);
  const warn = formatReport({ missingBaseline: false, ok: false, violations: [{ stage: 'boot:ready', benchP50: 15000, baseP50: 10000, pct: 150 }], totalP50: 15000, baselineTotalP50: 10000 });
  assert.ok(warn.includes('告警') && warn.includes('150%'), warn);
  const missing = formatReport({ missingBaseline: true, violations: [], totalP50: 11000, baselineTotalP50: null });
  assert.ok(missing.includes('未找到基线文件'), missing);
});