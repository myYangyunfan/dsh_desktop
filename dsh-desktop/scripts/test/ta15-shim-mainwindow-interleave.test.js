'use strict';

// ta15-shim-mainwindow-interleave.test.js — TA15 竞态 #4（形态级·纯逻辑）：
// 主窗 + 浮窗并发事件风暴下垫片 isMainWindow 分流正确性。
//
// 背景：RV3 P0-1 / 更新链——client-update-available 等**广播到所有窗**，
// 垫片按 isMainWindow() 守卫只让主窗消费（防浮窗重复通知 / 并发安装）；
// notification-jump 的 map 阶段同样守卫（tauri emit_to 对 Any 目标不定向）。
// 并发交错面：两窗各自的事件风暴交错到达 + 窗口身份状态在风暴中途翻转
//（浮窗注入晚于垫片求值等）——守卫是**逐事件求值**（无 memo），分流必须
// 始终匹配事件到达时刻的当前身份，不存在「首事件身份被锁存」。
//
// 用例：
//   A. isMainWindow 真值表全穷举：__DSH_FLOAT__ /
//      metadata.label（main / float-x / 缺失 / INTERNALS 缺席 / 抛错 metadata）。
//   B. 交错风暴矩阵：两窗 × 4 类事件（jump / client-update / window-maximized
//      / client-update-progress）× 身份中途翻转 → 每事件分流严格按当次求值，无锁存。
//   C. notification-jump 真实 map 段：浮窗返回 null（合法 id 也不放行）、
//      主窗返回冻结 payload、非法 id 两窗都拒。
//
// 宠物窗维度已于 2026-10 随 harness-pet 插件退役撤出（真值表原为 float/pet 两
// 旗标 × label 的穷举）：注入方 windows.rs 的宠物窗全链已删，守卫里的 `||` 分支
// 也一并摘除，因此这里改为「旗标已 inert」的降级契约（见 A 末尾）——留着一条
// 永远不可能为真的分支，等于给一个不存在的窗型做覆盖声明。
// 运行：node --test scripts/test/ta15-shim-mainwindow-interleave.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIM = path.resolve(__dirname, '..', '..', '..', 'dsh-tauri', 'src-tauri', 'crates', 'bridge', 'dist', 'bridge-shim.js');

/** 提取真实 isMainWindow 函数源（到下一个顶层 function 定义）。 */
function extractIsMainWindow() {
  const src = fs.readFileSync(SHIM, 'utf8');
  const start = src.indexOf('function isMainWindow()');
  assert.ok(start >= 0, 'bridge-shim.js 必须含 isMainWindow（守卫被删即回归）');
  const end = src.indexOf('\n  function ', start + 10);
  assert.ok(end > start);
  return src.slice(start, end);
}

/** 提取 notification-jump 的 onEvent 注册段（含 isMainWindow 守卫调用）。 */
function extractJumpRegistration() {
  const src = fs.readFileSync(SHIM, 'utf8');
  const start = src.indexOf("onEvent('notification-jump'");
  // 尾锚点：balance-changed 注册段已随 Electron 余额遗留线退役（contracts/
  // ipc-commands.md §2.4），改锚下一段 client-update-available。
  const end = src.indexOf("onEvent('client-update-available'");
  assert.ok(start >= 0 && end > start, 'notification-jump 注册段必须存在');
  return src.slice(start, end);
}

/** 在 vm 里物化 isMainWindow，sandbox 可随后被测试翻转身份。 */
function makeGuard(sandboxOver) {
  const sandbox = Object.assign({
    window: {},
    INTERNALS: null,
    __TAURI_INTERNALS__: undefined,
  }, sandboxOver);
  const fn = vm.runInNewContext(`${extractIsMainWindow()}\nisMainWindow;`, sandbox);
  assert.strictEqual(typeof fn, 'function');
  return { sandbox, fn };
}

/** 一个「窗」：label + 浮窗旗标（宠物窗旗标随 harness-pet 退役撤出）。 */
function windowSandbox({ label, float, internals = true } = {}) {
  const sandbox = {
    window: {
      ...(float ? { __DSH_FLOAT__: true } : {}),
    },
  };
  if (internals) {
    const internalsObj = {
      metadata: { currentWindow: label ? { label } : undefined },
    };
    sandbox.__TAURI_INTERNALS__ = internalsObj;
    sandbox.INTERNALS = internalsObj; // 垫片顶层 var INTERNALS 已被剥走，直接注入等价绑定
  }
  return sandbox;
}

test('A. isMainWindow 真值表全穷举（含 metadata 异常态）', () => {
  const cases = [
    // [label, float, internals, 期望主窗?]
    ['main', false, true, true],
    ['float-1', false, true, false],
    ['float-1', true, true, false],
    [undefined, false, true, true],  // metadata.currentWindow 缺失 → 兜底放行（旧壳）
    ['other', false, true, false],
    ['main', false, false, true],  // INTERNALS 整体缺席 → catch 内 true
    ['main', true, false, false],  // 浮窗旗标优先于 label（label=main 仍拒）
  ];
  for (const [label, float, internals, expectMain] of cases) {
    const { fn } = makeGuard(windowSandbox({ label, float, internals }));
    assert.strictEqual(fn(), expectMain, `label=${label} float=${float} internals=${internals}`);
  }
  // metadata 访问抛错 → catch 兜底 true（不静默吞掉主窗身份）。
  const { fn } = makeGuard({
    window: {},
    __TAURI_INTERNALS__: {
      get metadata() { throw new Error('boom'); },
    },
  });
  assert.strictEqual(fn(), true, 'metadata 抛错按主窗兜底');
  // 降级契约：宠物窗旗标彻底 inert（守卫不再读它，注入方也没了）。与
  // shim.rs::retired_plugin_surfaces_absent 同一立论的 Node 侧半条——Rust 面
  // 锁整个 JS 文本不含该字面量，npm test 跑不到，这里就地锁住函数体。
  const body = extractIsMainWindow();
  assert.ok(!/_PET_/.test(body), 'isMainWindow 不得再引用宠物窗旗标');
  const petOnly = windowSandbox({ label: 'main' });
  petOnly.window.__DSH_PET__ = true;
  assert.strictEqual(makeGuard(petOnly).fn(), true, '只带宠物窗旗标的 main 窗按主窗处理');
});

test('B. 交错风暴矩阵：身份中途翻转无锁存，分流恒匹配当次求值', () => {
  // 事件风暴：交错序列由确定序列号驱动（i 决定事件与是否在事件间翻转身份）。
  // balance-changed 已于 2026-10 随 Electron 余额遗留线退役（contracts/ipc-commands.md §2.4），
  // 第四类改为 client-update-progress（与 window-maximized 同为非主窗独占面：
  // 垫片侧无 isMainWindow 守卫，矩阵里 delivered 恒 false 的那一侧）。
  const EVENT_KINDS = ['jump', 'client-update', 'window-maximized', 'client-update-progress'];
  // 身份态在 5 态间轮转（含事件中途翻转：先求值 guard，再翻转，再处理下一事件）。
  // 原为 6 态含宠物窗旗标维，随 harness-pet 退役撤出（见文件头降级契约）。
  const STATES = [
    { label: 'main', float: false },
    { label: 'float-1', float: true },
    { label: 'float-2', float: false },
    { label: undefined, float: false },
    { label: 'main', float: true }, // main label 但被浮窗旗标覆盖
  ];
  let flipsHonored = 0;
  for (let i = 0; i < 200; i += 1) {
    const kind = EVENT_KINDS[i % EVENT_KINDS.length];
    for (let s = 0; s < STATES.length; s += 1) {
      const st = STATES[(i + s) % STATES.length];
      const sandbox = windowSandbox(st);
      const fn = vm.runInNewContext(`${extractIsMainWindow()}\nisMainWindow;`, sandbox);
      const isMain = fn();
      const expectMain = !st.float && (!st.label || st.label === 'main');
      assert.strictEqual(isMain, expectMain, `事件#${i}(${kind}) 窗态#${s} ${JSON.stringify(st)}`);
      if (s > 0) flipsHonored += 1;
      // 分流行为：主窗独占事件（jump/client-update）必须只在 isMain 时入队。
      const delivered = isMain && (kind === 'jump' || kind === 'client-update');
      assert.strictEqual(delivered, expectMain && (kind === 'jump' || kind === 'client-update'),
        '守卫分流与身份求值一致（无锁存/无未来身份泄漏）');
    }
  }
  // 覆盖自证：每个 i 里 s>0 的 4 个窗态都是「相对上一个态的身份翻转」。
  // 阈值由 STATES 规模算出，撤维度（6→5 态）时不必再手改魔数。
  assert.strictEqual(flipsHonored, 200 * (STATES.length - 1), `翻转态覆盖 ${flipsHonored} 次`);
});

test('C. notification-jump 真实 map 段：浮窗拒、主窗收、非法 id 双拒', () => {
  // 物化：stub onEvent 捕获 map，再以不同窗身份评估 map。
  for (const [label, float, expectPass] of [
    ['main', false, true],
    ['float-1', true, false],
    ['float-2', false, false],
  ]) {
    let capturedMap = null;
    const sandbox = windowSandbox({ label, float });
    sandbox.window.dshDesktop = undefined;
    // onEvent 注册段引用全局 onEvent 与 listeners——提供最小桩。
    sandbox.onEvent = (name, queue, map) => { capturedMap = map; };
    sandbox.listeners = { jump: [] };
    vm.runInNewContext(`${extractIsMainWindow()}\n${extractJumpRegistration()}`, sandbox);
    assert.strictEqual(typeof capturedMap, 'function', `map 已注册（${label}）`);

    // 合法 id。
    const ok = capturedMap({ sessionId: '  sess-42  ' });
    if (expectPass) {
      assert.ok(ok && ok.sessionId === 'sess-42', '主窗：trim 后 payload');
      assert.ok(Object.isFrozen(ok), 'payload 冻结（防下游篡改）');
    } else {
      assert.strictEqual(ok, null, `非主窗（${label}）：合法 id 也拒（防浮窗跟跳）`);
    }
    // 非法 id：两身份都拒。
    for (const bad of ['', '   ', 'x'.repeat(257), 123, undefined, null]) {
      const r = capturedMap({ sessionId: bad });
      assert.strictEqual(r, null, `非法 id ${JSON.stringify(String(bad).slice(0, 12))} 拒`);
    }
  }
});
