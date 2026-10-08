'use strict';

// ta13-soak-chunk-availability.test.js — TA13 极限压测（W2 退避环 soak）：
// dsh-better-sidebar 的 createChunkRetryLoop（从发行产物 lib/client.js 的
// //#region src/client/chunk-availability.ts 区段取数，见 fixtures 夹具）
// 订阅/退订 ×500 轮（每轮多退避回合，注入同步 schedule 驱动）。
//
// 断言：
//   · 终态归零：外部计时器队列为空（无泄漏的 pending timer）、全部循环
//     active === false（最后订阅者退订 → finish 自毁）；
//   · 堆稳定：末 50 轮均值 - 首 50 轮均值 < 30 MB；
//   · 事件语义正确：不可用回合发 {ready:false}，恢复回合发 {ready:true}。
// 运行：node --test scripts/test/ta13-soak-chunk-availability.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadChunkAvailability } = require('./fixtures/better-sidebar-region.js');

const ROUNDS = 500;
const HEAP_SLOPE_LIMIT_MB = 30;

function heapMB() { return process.memoryUsage().heapUsed / 1024 / 1024; }

test('chunk-availability 退避环 soak：订阅/退订 ×500 轮，计时器归零 + 堆稳定', async () => {
  const { createChunkRetryLoop } = loadChunkAvailability({ sameRealm: true });

  // 注入同步 schedule：pendingTimerCount 追踪存活计时器（泄漏探针）
  let pendingTimerCount = 0;
  const schedule = (fn, delayMs) => {
    pendingTimerCount += 1;
    let cancelled = false;
    return () => {
      if (!cancelled) { cancelled = true; pendingTimerCount -= 1; }
    };
  };
  const queueRun = (loop) => loop.__run(); // 由 harness 桥（见下）

  // 同步驱动的环：把 probe 从 timer 回调里勾出来
  function makeLoop(available, name) {
    let queued = [];
    let outs = [];
    const sched = (fn, delayMs) => {
      pendingTimerCount += 1;
      queued.push({ fn, off: false });
      let cancelled = false;
      return () => { if (!cancelled) { cancelled = true; pendingTimerCount -= 1; } };
    };
    let attemptCount = 0;
    const loop = createChunkRetryLoop(name, {
      isAvailable: () => available,
      attemptLoad: async () => { if (!available) throw new Error('down'); },
      schedule: sched,
    });
    // 计时器“触发”即不再 pending：执行时同步扣减计数（真实 setTimeout 语义）
    loop.__run = () => { const fns = queued; queued = []; for (const it of fns) { pendingTimerCount -= 1; it.fn(); } };
    loop.__pending = () => pendingTimerCount;
    loop.__events = outs;
    return loop;
  }

  const samples = [];
  let totalReadyTrue = 0;
  let totalReadyFalse = 0;

  for (let round = 0; round < ROUNDS; round++) {
    // 场景 A：模块系统一直不可用 → 3 个退避回合后退订（自毁路径）
    const down = makeLoop(false, 'down-' + round);
    const unsubs = [];
    const events = [];
    for (let v = 0; v < 5; v++) {
      unsubs.push(down.subscribe((ev) => events.push(ev)));
    }
    for (let k = 0; k < 3; k++) queueRun(down); // 3 个退避回合（同步 probe）
    assert.ok(down.active, '退订前环应活跃');
    for (const u of unsubs) u();
    assert.equal(down.active, false, '最后订阅者退订后环应 finish');

    // 场景 B：不可用 1 回合后恢复 → ready:true 终态
    let avail = false;
    const recover = createChunkRetryLoop('rec-' + round, {
      isAvailable: () => avail,
      attemptLoad: async () => { if (!avail) throw new Error('down'); },
      schedule: (fn, delayMs) => { pendingTimerCount += 1; let cancelled = false; fn.__cancel = () => { if (!cancelled) { cancelled = true; pendingTimerCount -= 1; } }; return fn.__cancel; },
    });
    const recEvents = [];
    const un = recover.subscribe((ev) => recEvents.push(ev));
    // 手动推进第一回合并恢复可用性
    recover.poke(); // 立即 probe（async）
    await Promise.resolve(); await Promise.resolve();
    avail = true;
    recover.poke();
    await Promise.resolve(); await Promise.resolve();
    un();
    for (const ev of recEvents) { if (ev.ready) totalReadyTrue += 1; else totalReadyFalse += 1; }
    assert.equal(recover.active, false, '成功后退订应终结');

    if (round % 50 === 0) {
      if (global.gc) global.gc();
      samples.push(heapMB());
    }
  }

  const first = samples.slice(0, 5);
  const last = samples.slice(-5);
  const slope = (last.reduce((a, b) => a + b, 0) / last.length) - (first.reduce((a, b) => a + b, 0) / first.length);
  console.log('[ta13-chunk-availability] heap 首', first[0].toFixed(1), 'MB 末', last[last.length - 1].toFixed(1),
    'MB 斜率', slope.toFixed(1), 'MB；pendingTimers =', pendingTimerCount,
    '；ready:true/ready:false =', totalReadyTrue, '/', totalReadyFalse, '采样', samples.map((v) => v.toFixed(1)));

  assert.equal(pendingTimerCount, 0, '所有注入计时器都应被取消（无泄漏退避 timer）');
  assert.ok(totalReadyTrue >= ROUNDS, '每轮恢复场景至少一个 ready:true');
  assert.ok(totalReadyFalse >= ROUNDS, '每轮至少一个退避回合事件');
  assert.ok(slope < HEAP_SLOPE_LIMIT_MB, `堆斜率 ${slope.toFixed(1)} MB 应 < ${HEAP_SLOPE_LIMIT_MB} MB`);
});
