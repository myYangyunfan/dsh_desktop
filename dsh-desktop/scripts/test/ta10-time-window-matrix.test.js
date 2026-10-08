'use strict';

// ta10-time-window-matrix.test.js —— TA10 全壳时间窗参数化边界矩阵（JS 半边）。
//
// 手法（与 Rust 半边 dsh-tauri/src-tauri/src/app/tests/ta10_time_window_matrix.rs
// 同一套路，注入时钟，非 sleep 真等）：
//   · 可注入的纯函数/工厂直接喂合成时间（chunk-availability nextDelayMs /
//     createChunkRetryLoop({schedule})、balance-scheduler retryDelaysMs +
//     Date.now/setTimeout 假桶）；
//   · 不可注入的内联定时器（Tauri 加载页 1.8s 防抖 / synapse 700ms+300ms /
//     subagent-lens 1.2s）用「假 timer 桶 + 判定式重放 + 源码锚点」覆盖，
//     并登记为盲区（建议注入点见各用例注释）。
//
// 原「2) file-drop 1.5s 双报去重窗」一节随 v1.0.0 dsh-file-drop 退役删除（源目录
// assets/plugins/dsh-file-drop 已删，矩阵打的是那份产物里的 core.dedupeEntries，
// `now - prev <= windowMs` 的恰界形态只存在于那里）。不另寻改锚：JS 半边再无
// 「参数化 (now, windowMs) 双报去重窗」的活实现——web-crash-shield 的风暴/归因窗
// 已由 scripts/test/unit-web-crash-shield-deep.test.js 穷举覆盖，gpu-crash-guard 的
// dedupeMs 在 Electron 壳退役后无在野调用方，改锚过去只是把矩阵搬进重复用例。
// 后续小节顺次上移。
//
// 运行：node --test scripts/test/ta10-time-window-matrix.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// 假 timer 桶：把 setTimeout/setInterval 收进可手动推进的队列。
// ---------------------------------------------------------------------------
class FakeClock {
  constructor() {
    this.now = 0;
    this.timers = new Map(); // id -> {kind, at, fn, interval}
    this.nextId = 1;
    this.setTimeout = (fn, delay) => this._arm('timeout', fn, delay);
    this.setInterval = (fn, delay) => this._arm('interval', fn, delay);
    this.clearTimeout = (id) => this.timers.delete(id);
    this.clearInterval = (id) => this.timers.delete(id);
  }
  _arm(kind, fn, delay) {
    const id = this.nextId++;
    // 与宿主一致：非有限/负 delay 按 0。
    const at = this.now + (Number.isFinite(delay) && delay > 0 ? Math.floor(delay) : 0);
    this.timers.set(id, { kind, at, fn, interval: kind === 'interval' ? Math.max(1, delay | 0) : 0 });
    return id;
  }
  /** 推进到 t（绝对时刻），沿途触发所有到期回调。 */
  advanceTo(t) {
    while (this.now < t) {
      const due = [...this.timers.values()].filter((x) => x.at <= t).sort((a, b) => a.at - b.at)[0];
      if (!due) { this.now = t; return; }
      this.now = due.at;
      if (due.kind === 'interval') {
        due.at = this.now + due.interval;
      } else {
        this.timers.delete([...this.timers.entries()].find(([, v]) => v === due)[0]);
      }
      due.fn();
    }
  }
  advance(ms) { this.advanceTo(this.now + ms); }
  armedDelays() { return [...this.timers.values()].map((x) => x.at - this.now); }
}

// ===========================================================================
// 1) Tauri 加载页 1.8s 防抖（kernel-fail 终态防抖；pages.rs LOADING_HTML 内联脚本）
// ===========================================================================

const PAGES_RS = path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'src-tauri', 'src', 'app', 'src', 'pages.rs');

/** 判定式重放：kernel-fail → 挂 1800ms 定时器；boot-step → clearTimeout 复位。 */
function makeLoadingDebounce(clock) {
  const st = { fired: 0, timer: 0, reason: '' };
  return {
    kernelFail(p) {
      if (st.timer) clock.clearTimeout(st.timer);
      st.timer = clock.setTimeout(() => {
        st.timer = 0;
        st.fired += 1;
        st.reason = String((p && p.reason) || '');
      }, 1800);
    },
    bootStep() {
      if (st.timer) clock.clearTimeout(st.timer);
      st.timer = 0;
    },
    state: st,
  };
}

test('ta10 loading 页 kernel-fail 1.8s 防抖边界：1799 不翻 / 恰 1800 翻 / 1801 翻；新 boot-step 取消', () => {
  const clock = new FakeClock();
  const page = makeLoadingDebounce(clock);
  page.kernelFail({ reason: 'crash-loop' });
  clock.advance(1799);
  assert.equal(page.state.fired, 0, '1799ms：失败终态仍未上屏（正常路径窗口内被换页）');
  clock.advance(1); // 恰 1800
  assert.equal(page.state.fired, 1, '恰 1800ms：翻「启动失败」终态');
  assert.equal(page.state.reason, 'crash-loop');

  // 窗口内新 boot-step（新一轮自动重试）取消定时器 → 永不翻失败。
  const clock2 = new FakeClock();
  const page2 = makeLoadingDebounce(clock2);
  page2.kernelFail({});
  clock2.advance(1799);
  page2.bootStep();
  clock2.advance(10000);
  assert.equal(page2.state.fired, 0, '窗口内新尝试取消防抖 → 失败字样永不闪现');

  // 1801 边界（重挂后）。
  const clock3 = new FakeClock();
  const page3 = makeLoadingDebounce(clock3);
  page3.kernelFail({});
  clock3.advance(1801);
  assert.equal(page3.state.fired, 1, '1801ms：终态已翻');

  // 源码锚点：pages.rs 内联脚本确为 1800ms + boot-step 取消形态。
  const src = fs.readFileSync(PAGES_RS, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes('}, 1800);'), 'pages.rs 1800ms 常量锚点');
  assert.ok(src.includes('if (failTimer) clearTimeout(failTimer);'), 'boot-step/kernel-fail 取消前次定时器锚点');
  // 盲区注记：该脚本内联在 Rust 字符串、经 data: URL 注入，无模块出口可
  // 直接驱动 UI 实例——建议注入点：把 1800 提为具名常量 FAIL_DEBOUNCE_MS
  // 并暴露到 window.__DSH_LOADING__ 供端到端测试操纵。
});

// ===========================================================================
// 2) synapse：defer 700ms（防抖重挂）+ pin 300ms 窗（判定式重放 + 锚点；
//    盲区：window.setTimeout 内联，建议注入点见下）
// ===========================================================================

const SYNAPSE_APP = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-synapse', 'app.js');

test('ta10 synapse deferCanvasRefresh 700ms：重复触发防抖，恰 700ms 执行', () => {
  const clock = new FakeClock();
  const st = { refreshes: 0, timer: null };
  // app.js deferCanvasRefresh / deferDetailRefresh 同款骨架重放：
  // clearTimeout(旧) + setTimeout(fn, delay=700)。
  function deferCanvasRefresh(delay = 700) {
    if (st.timer) clock.clearTimeout(st.timer);
    st.timer = clock.setTimeout(() => { st.timer = null; st.refreshes += 1; }, delay);
  }
  deferCanvasRefresh(); // t=0
  clock.advance(699);
  deferCanvasRefresh(); // 重挂：计时归零（防抖语义）
  clock.advance(699);
  assert.equal(st.refreshes, 0, '重挂后 699ms：未刷新（首挂已被取消）');
  clock.advance(1); // 恰 700
  assert.equal(st.refreshes, 1, '重挂后恰 700ms：刷新执行');
  deferCanvasRefresh();
  clock.advance(701);
  assert.equal(st.refreshes, 2, '701ms：已刷新');
  const src = fs.readFileSync(SYNAPSE_APP, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes('function deferCanvasRefresh(delay = 700)'), 'defer 700ms 默认参数锚点');
  assert.ok(src.includes('function deferDetailRefresh(delay = 700)'), 'detail defer 700ms 锚点');
});

test('ta10 synapse 滚动 pin 300ms 窗：299ms 内继续钉住 / 恰 300ms 关闭', () => {
  const clock = new FakeClock();
  const st = { pinning: false, closes: 0, timer: null };
  // app.js pinDetailScroll 骨架重放：布局位移重挂 stop 定时器
  //（DETAIL_SCROLL_PIN_WINDOW = 300）。
  const DETAIL_SCROLL_PIN_WINDOW = 300;
  function armStop() {
    if (st.timer) clock.clearTimeout(st.timer);
    st.timer = clock.setTimeout(() => { st.timer = null; st.pinning = false; st.closes += 1; }, DETAIL_SCROLL_PIN_WINDOW);
    st.pinning = true;
  }
  armStop();
  clock.advance(299);
  armStop(); // 布局仍在长高：重挂
  clock.advance(299);
  assert.equal(st.closes, 0, 'pin 窗内重挂：钉住未关闭');
  clock.advance(1); // 恰 300
  assert.equal(st.closes, 1, '恰 300ms 无重挂：pin 窗关闭');
  assert.equal(st.pinning, false, '停止钉住滚动位置');
  const src = fs.readFileSync(SYNAPSE_APP, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes('const DETAIL_SCROLL_PIN_WINDOW = 300'), 'pin 300ms 常量锚点');
  assert.ok(src.includes('window.setTimeout(stopDetailScrollPin, DETAIL_SCROLL_PIN_WINDOW)'), 'pin 定时器接线锚点');
  // 盲区注记：DETAIL_SCROLL_PIN_WINDOW 为模块内 const、定时器直连
  // window.setTimeout，不可外部注入——建议注入点：把窗口时长并入
  // deferCanvasRefresh 式默认参数（stopDetailScrollPin(delay = 300)）。
});

// ===========================================================================
// 3) better-sidebar chunk 重试：2/4/8/16s…封顶 30s 序列表（真实
//    nextDelayMs + createChunkRetryLoop 注入假 schedule）
// ===========================================================================

// 取数夹具见 fixtures/better-sidebar-region.js：0.24.1 起没有逐文件编译镜像，
// 真实 nextDelayMs / createChunkRetryLoop 从 lib/client.js 的 //#region
// src/client/chunk-availability.ts 区段物化。
const { loadChunkAvailability } = require('./fixtures/better-sidebar-region.js');

test('ta10 chunk nextDelayMs 序列表：2/4/8/16/30 封顶 + 脏输入回退 1', () => {
  const m = loadChunkAvailability();
  assert.equal(m.CHUNK_RETRY_BASE_DELAY_MS, 2000);
  assert.equal(m.CHUNK_RETRY_MAX_DELAY_MS, 30000);
  // 默认序列（failedAttempts 1..7）：32s 被 30s 封顶截断。
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((n) => m.nextDelayMs(n)),
    [2000, 4000, 8000, 16000, 30000, 30000, 30000],
    '序列 2/4/8/16s，第 5 次起（原生 32s）封顶 30s'
  );
  // 边界注入（base/max 可参数化）。
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => m.nextDelayMs(n, 1000, 2500)),
    [1000, 2000, 2500, 2500],
    '注入 base=1s max=2.5s：第 3 次起封顶'
  );
  // 脏输入：非正/非有限一律按 1 次处理（绝不 0/NaN/Infinity 延迟）。
  for (const bad of [0, -3, NaN, Infinity, 1.5]) {
    assert.ok(Number.isFinite(m.nextDelayMs(bad)) && m.nextDelayMs(bad) >= 2000, `脏输入 ${bad} 回退安全延迟`);
  }
});

test('ta10 chunk createChunkRetryLoop 假时钟全序列：2/4/8/16/30/30 后成功热恢复', async () => {
  const m = loadChunkAvailability();
  const clock = new FakeClock();
  const scheduled = []; // 每次 schedule 收到的 (fn, delay)
  const loop = m.createChunkRetryLoop('editor', {
    isAvailable: () => false, // 前 6 轮模块系统都未回来
    attemptLoad: async () => { throw new Error('unavailable'); },
    schedule: (fn, delay) => {
      scheduled.push(delay);
      const id = clock.setTimeout(fn, delay);
      return () => clock.clearTimeout(id);
    },
  });
  const events = [];
  loop.subscribe((e) => events.push(e));
  // 逐轮推进：每轮到期 → 模块系统仍不可用 → 计数 +1 → 重排更长退避。
  for (const expected of [2000, 4000, 8000, 16000, 30000, 30000]) {
    assert.equal(clock.armedDelays()[0], expected, `第 ${scheduled.length + 1} 轮退避 ${expected}ms`);
    clock.advance(expected);
  }
  assert.deepEqual(scheduled.slice(0, 6), [2000, 4000, 8000, 16000, 30000, 30000], '实排序列与 nextDelayMs 一致（30s 封顶）');
  assert.equal(clock.armedDelays()[0], 30000, '第 7 轮仍封顶 30s（无限轮）');
  assert.equal(loop.active, true, '未成功前循环仍活跃');
  // 第 7 轮改为可用且装载成功 → ready 热恢复、循环终止。
  loop.dispose();
  const clock2 = new FakeClock();
  let failRounds = 3;
  const loopB = m.createChunkRetryLoop('editor', {
    isAvailable: () => true,
    attemptLoad: async () => {
      if (failRounds > 0) { failRounds -= 1; throw new Error('load fail'); }
    },
    schedule: (fn, delay) => {
      const id = clock2.setTimeout(fn, delay);
      return () => clock2.clearTimeout(id);
    },
  });
  const ev2 = [];
  loopB.subscribe((e) => ev2.push(e));
  const tickMicrotasks = () => new Promise((r) => setImmediate(r));
  for (const d of [2000, 4000, 8000]) { // 三连败：2/4/8s
    clock2.advance(d);
    await tickMicrotasks(); // probe 是 async：让 await attemptLoad 的续体先跑
  }
  clock2.advance(16000); // 第 4 轮成功
  await tickMicrotasks();
  const last = ev2[ev2.length - 1];
  assert.equal(last.ready, true, '成功后 ready 热恢复事件');
  assert.equal(loopB.active, false, '成功即 dispose，无定时器残留');
  assert.equal(clock2.timers.size, 0, '无泄漏定时器');
});

// ===========================================================================
// 4) balance-scheduler 退避 30s→1m→2m→5min 封顶：序列表边界（真实
//    scheduleRetry 判定式注入参数验证 + 缩短序列活体驱动）
//
//    被测对象是插件产物 assets/plugins/dsh-balance/lib/balance-scheduler.js；
//    遗留 dsh-desktop/balance-scheduler.js 已随 Electron 余额线整体拆除。
// ===========================================================================

const SCHED = require(path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'balance-scheduler.js'));

test('ta10 balance-scheduler 默认退避序列边界：30s/1m/2m/5min，第 4 次起封顶', () => {
  assert.deepEqual(SCHED.DEFAULT_RETRY_DELAYS_MS, [30000, 60000, 120000, 300000], '默认退避序列常量');
  assert.equal(SCHED.DEFAULT_THROTTLE_MS, 30000, '30s 节流窗常量');
  // scheduleRetry 判定式重放：idx = min(max(failures-1, 0), len-1)。
  const delayFor = (failures) =>
    SCHED.DEFAULT_RETRY_DELAYS_MS[
      Math.min(Math.max(failures - 1, 0), SCHED.DEFAULT_RETRY_DELAYS_MS.length - 1)
    ];
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 100].map(delayFor),
    [30000, 30000, 60000, 120000, 300000, 300000, 300000],
    '失败 1→30s、2→60s、3→120s、≥4→300s 封顶（0 次安全钳到首档）'
  );
  // 源码锚点：重排式与「新失败按最新计数重排」（clearTimeout 旧定时器）。
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'balance-scheduler.js'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  assert.ok(
    src.includes('const idx = Math.min(Math.max(consecutiveFailures - 1, 0), retryDelaysMs.length - 1);'),
    '退避索引判定式锚点'
  );
  assert.ok(src.includes('if (retryTimer) clearTimeout(retryTimer);'), '重排前清旧定时器锚点（不叠加）');
});

test('ta10 balance-scheduler 活体退避梯（注入缩短序列 [20,40,80,160] + 假 setTimeout 桶）', async () => {
  const delays = [20, 40, 80, 160];
  const scheduled = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const pending = new Map();
  let nextId = 1;
  // 假桶：不真等，回调挂起待手动驱动（也覆盖 clearTimeout 语义）。
  globalThis.setTimeout = (fn, d) => {
    const id = nextId++;
    scheduled.push(d);
    pending.set(id, fn);
    return id;
  };
  globalThis.clearTimeout = (id) => pending.delete(id);
  const flush = () => { for (const [id, fn] of [...pending.entries()]) { pending.delete(id); fn(); } };
  let failuresLeft = 5; // 前 5 次刷新失败，第 6 次成功
  const sched = SCHED.createBalanceScheduler({
    getHome: () => '/tmp/dsh',
    getSettings: () => ({}),
    queryBalance: async () => {
      if (failuresLeft > 0) { failuresLeft -= 1; throw new Error('boom'); }
      return { ok: true, balances: [] };
    },
    queryOpencodeUsage: async () => ({ ok: true }),
    readActiveModel: () => 'm',
    effectivePrice: () => ({}),
    priceTable: () => ({}),
    isPeakHour: () => false,
    push: () => {},
    retryDelaysMs: delays,
    pollMs: 0,
  });
  try {
    await sched.refresh(); // 失败 1 → scheduleRetry 延迟 20
    flush(); await sched.refresh(); // 失败 2 → 40
    flush(); await sched.refresh(); // 失败 3 → 80
    flush(); await sched.refresh(); // 失败 4 → 160
    flush(); await sched.refresh(); // 失败 5 → 封顶 160
    flush(); await sched.refresh(); // 成功 → consecutiveFailures=0、清定时器
    assert.deepEqual(
      scheduled,
      [20, 40, 80, 160, 160],
      '退避梯按注入序列走，第 4 次失败起封顶末档；成功后不再排定时器'
    );
    assert.equal(sched.state().consecutiveFailures, 0, '成功清零失败计数');
    assert.equal(pending.size, 0, '成功路径 clearTimeout 生效（无残留重试定时器）');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    sched.stop();
  }
});

// ===========================================================================
// 5) subagent-lens 1.2s 低频轮询（判定式重放 + 锚点；盲区：interval 字面量）
// ===========================================================================

const LENS = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-subagent-lens', 'lib', 'client.js');

test('ta10 subagent-lens 1.2s 轮询节拍：1199ms 无 tick / 恰 1200ms tick / 卸载清定时器', () => {
  const clock = new FakeClock();
  let tick = 0;
  const id = clock.setInterval(() => { tick += 1; }, 1200);
  clock.advance(1199);
  assert.equal(tick, 0, '1199ms：尚无重渲染 tick');
  clock.advance(1);
  assert.equal(tick, 1, '恰 1200ms：首个 tick（子会话事件不触发重渲染，靠它刷新）');
  clock.advance(1200);
  assert.equal(tick, 2, '每 1200ms 一个 tick');
  clock.clearInterval(id); // React effect cleanup：卸载清定时器
  clock.advance(10000);
  assert.equal(tick, 2, '卸载后不再 tick（无泄漏）');
  // 源码锚点 + 触发门：仅「子代理运行中且行已展开」才挂轮询。
  const src = fs.readFileSync(LENS, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(src.includes('}, 1200);'), '1200ms interval 常量锚点');
  assert.ok(src.includes('if (!expanded || !childRunning) return undefined;'), '轮询触发门锚点（展开 && 运行中）');
  // 盲区注记：1200 为 useEffect 内字面量、直连 setInterval，不可注入——
  // 建议注入点：提为模块常量 POLL_INTERVAL_MS = 1200 并允许 ctx 配置覆盖。
});
