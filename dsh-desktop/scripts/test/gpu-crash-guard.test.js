'use strict';

// 单测：scripts/gpu-crash-guard.js 的连续崩溃阈值与去重逻辑。
// 运行：node --test scripts/test/gpu-crash-guard.test.js

const test = require('node:test');
const assert = require('node:assert');
const { createGpuCrashGuard } = require('../gpu-crash-guard');

function fakeNow(clock) {
  return () => clock.now;
}

test('默认阈值：窗口内第 3 次崩溃触发降级', () => {
  const clock = { now: 1000 };
  const guard = createGpuCrashGuard({ now: fakeNow(clock) });
  assert.strictEqual(guard.record(), false);
  clock.now += 10000;
  assert.strictEqual(guard.record(), false);
  clock.now += 10000;
  assert.strictEqual(guard.record(), true);
  assert.strictEqual(guard.count(), 3);
});

test('去重：同一时刻的双事件触发只计一次', () => {
  const clock = { now: 1000 };
  const guard = createGpuCrashGuard({ now: fakeNow(clock) });
  // gpu-process-crashed 与 child-process-gone(type=GPU) 几乎同时到达
  assert.strictEqual(guard.record(), false);
  assert.strictEqual(guard.record(), false); // 去重窗口内，忽略
  assert.strictEqual(guard.count(), 1);
  clock.now += 5000;
  assert.strictEqual(guard.record(), false);
  clock.now += 5000;
  assert.strictEqual(guard.record(), true); // 第 3 次真实崩溃
  assert.strictEqual(guard.count(), 3);
});

test('滑动窗口：超过窗口期的旧崩溃过期不计', () => {
  const clock = { now: 1000 };
  const guard = createGpuCrashGuard({ now: fakeNow(clock) });
  guard.record();                       // t=1s
  clock.now += 30 * 1000;               // t=31s
  guard.record();                       // 未过期，count=2
  clock.now += 40 * 1000;               // t=71s
  guard.record();                       // 第一次(1s)已超出 60s 窗口被丢弃，count=2
  assert.strictEqual(guard.count(), 2);
  clock.now += 10 * 1000;               // t=81s
  assert.strictEqual(guard.record(), true); // 31s/71s/81s 都在窗口内，第 3 次触发
  assert.strictEqual(guard.count(), 3);
});

test('自定义阈值与 reset', () => {
  const clock = { now: 1000 };
  const guard = createGpuCrashGuard({ limit: 2, now: fakeNow(clock) });
  assert.strictEqual(guard.record(), false);
  clock.now += 5000;
  assert.strictEqual(guard.record(), true);
  guard.reset();
  assert.strictEqual(guard.count(), 0);
  clock.now += 5000;
  assert.strictEqual(guard.record(), false);
});
