'use strict';

// unit-better-sidebar-chunk-retry.test.js — 0.5.0 内核重启「侧栏变砖」回归：
//
// 现象：内核进程死亡/重启窗口期，页面插件 better-sidebar 的 chunk 加载在
// __DSH_MODULES__（client module system）尚未就绪时抛
// 『[dsh-better-sidebar] chunk "editor": client module system unavailable』，
// 视图直接渲染错误态（红字 + 手动重试按钮），内核回来后不会自动恢复——
// 普通用户不知道要点重试，体验即「变砖」（第二轮没法接受提示词）。
//
// 修复契约（assets/plugins/dsh-better-sidebar）：
//   1) src/client/chunk-availability.ts 的纯函数与可注入重试环——取数夹具是
//      发行产物 lib/client.js 里的 //#region 区段（0.24.1 起构建只出
//      lib/types/*.d.ts，逐文件编译镜像已不存在），提供：
//        - nextDelayMs(failedAttempts)：2s/4s/8s/16s/32s→封顶 30s，无限轮；
//        - isModuleSystemAvailable(globalLike)：__DSH_MODULES__.import 可调用
//          （rc.8+ 无该全局时回落探测插件自有的 __dshSidebarModuleSystem__）；
//        - moduleSystemUnavailableMessage(chunk)：与 loadChunk 抛错逐字同源；
//        - createChunkRetryLoop(name, {isAvailable, attemptLoad, schedule})：
//          每 chunk 单循环单定时器，退避轮询，成功即 ready 唤醒，最后一个
//          订阅者退订 / dispose() 全清（无定时器泄漏），订阅者异常互相隔离。
//   2) 编译产物 lib/client.js 与 lib/client-registry.js（同一 src 的两份并行
//      bundle，内核按 dsh.plugin.json client.main 走后者，npm 包 exports 走
//      前者）都内联了同一份逻辑：loadChunk 用探测 + 统一错误文案；
//      ensureChunkAutoRetry 注册表去重（HMR/重复加载不叠加循环）；
//      resetChunks() dispose 全部循环与 visibility 监听；LazyChunkView 失败
//      态保留手动重试 + 显示『正在等待后端就绪，将自动恢复…（第 N 次尝试）』
//      + ready 热恢复。本测试对两份产物做文本契约 + vm 物化冒烟。
//
// 运行：node --test scripts/test/unit-better-sidebar-chunk-retry.test.js
// （不依赖内核 / DOM / 网络：重试环用注入的假调度器确定性驱动。）

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-better-sidebar');
const BUNDLES = ['client.js', 'client-registry.js'].map((f) => path.join(PLUGIN_DIR, 'lib', f));

/**
 * 取数夹具见 fixtures/better-sidebar-region.js：0.24.1 起 `tsc -p tsconfig.build.json`
 * 只出 `lib/types/*.d.ts`，不再有逐文件的 `lib/<name>.js` 编译镜像，所以纯函数从
 * **发行产物本体**里取 tsdown 保留的 `//#region src/client/chunk-availability.ts`
 * 区段（自包含：纯函数 + 一个字面量表，零 import），vm 求值后交回符号。
 */
const { loadChunkAvailability } = require('./fixtures/better-sidebar-region.js');

let chunkAvailability;
/** 与旧 `import(pathToFileURL(lib/chunk-availability.js))` 同签名的取数入口。 */
const importChunkAvailability = async () => {
  if (chunkAvailability === undefined) chunkAvailability = loadChunkAvailability();
  return chunkAvailability;
};

// ---------------------------------------------------------------------------
// 可控假调度器：记录延迟、手动触发、统计取消（证明无泄漏）
// ---------------------------------------------------------------------------
function fakeScheduler() {
  const pending = new Map(); // id -> { fn, delay }
  const cancelled = [];
  let seq = 0;
  return {
    schedule(fn, delay) {
      const id = ++seq;
      pending.set(id, { fn, delay });
      return () => {
        if (pending.delete(id)) cancelled.push(id);
      };
    },
    fire() {
      const next = pending.entries().next().value;
      if (next === undefined) return false;
      pending.delete(next[0]);
      next[1].fn();
      return true;
    },
    get delays() { return [...pending.values()].map((j) => j.delay); },
    get size() { return pending.size; },
    get cancelledCount() { return cancelled.length; },
  };
}

/** 收集事件的订阅者。 */
function recorder() {
  const events = [];
  return { events, onEvent: (e) => events.push({ ...e }) };
}

// ---------------------------------------------------------------------------
// 1) 纯函数：nextDelayMs 指数退避（2s 起步，封顶 30s，无限轮）
// ---------------------------------------------------------------------------
test('nextDelayMs: 2s/4s/8s/16s→封顶 30s，之后恒为 30s（无限轮）', async () => {
  const { nextDelayMs } = await importChunkAvailability();
  assert.equal(nextDelayMs(1), 2000, '第 1 次失败后等 2s');
  assert.equal(nextDelayMs(2), 4000);
  assert.equal(nextDelayMs(3), 8000);
  assert.equal(nextDelayMs(4), 16000);
  assert.equal(nextDelayMs(5), 30000, '32000 封顶到 30000');
  assert.equal(nextDelayMs(6), 30000);
  assert.equal(nextDelayMs(50), 30000, '无限轮：第 50 次仍是 30s');
});

test('nextDelayMs: 非法输入按 1 处理（绝不产生 0/NaN/Infinity 延迟）', async () => {
  const { nextDelayMs } = await importChunkAvailability();
  for (const bad of [0, -1, -100, NaN, Infinity, -Infinity]) {
    assert.equal(nextDelayMs(bad), 2000, `failedAttempts=${bad} 应按 1 处理`);
  }
  assert.equal(nextDelayMs(2.9), 4000, '小数向下取整到 2');
});

test('nextDelayMs: base/max 可注入（单测可加速，且封顶不小于起步', async () => {
  const { nextDelayMs } = await importChunkAvailability();
  assert.equal(nextDelayMs(1, 100, 1000), 100);
  assert.equal(nextDelayMs(2, 100, 1000), 200);
  assert.equal(nextDelayMs(4, 100, 1000), 800);
  assert.equal(nextDelayMs(5, 100, 1000), 1000, '1600 封顶');
  assert.equal(nextDelayMs(1, 500, 100), 500, 'max < base 时起步值不被压低');
});

// ---------------------------------------------------------------------------
// 2) 纯函数：可用性探测（__DSH_MODULES__ / __dshChunks__）
// ---------------------------------------------------------------------------
test('isModuleSystemAvailable: 只认带可调用 import 的 __DSH_MODULES__', async () => {
  const { isModuleSystemAvailable } = await importChunkAvailability();
  assert.equal(isModuleSystemAvailable(null), false);
  assert.equal(isModuleSystemAvailable(undefined), false);
  assert.equal(isModuleSystemAvailable('window'), false);
  assert.equal(isModuleSystemAvailable({}), false, '无 __DSH_MODULES__');
  assert.equal(isModuleSystemAvailable({ __DSH_MODULES__: {} }), false, 'import 缺失');
  assert.equal(isModuleSystemAvailable({ __DSH_MODULES__: { import: null } }), false, 'import 非函数');
  assert.equal(isModuleSystemAvailable({ __DSH_MODULES__: { import() {} } }), true);
  assert.equal(isModuleSystemAvailable({ __DSH_MODULES__: { import: async () => ({}) } }), true);
});

test('isModuleSystemAvailable: 缺省参数探测 globalThis（内核重启窗口 = false）', async () => {
  const { isModuleSystemAvailable, sandbox } = await importChunkAvailability();
  // 区段在 vm 沙箱里求值，模块内的 `globalThis` 就是 sandbox —— 往沙箱上挂
  // __DSH_MODULES__ 等价于往页面全局上挂，缺省参数那条分支因此可测。
  assert.equal(isModuleSystemAvailable(), false, '沙箱无 __DSH_MODULES__ 时不可用');
  sandbox.__DSH_MODULES__ = { import() {} };
  try {
    assert.equal(isModuleSystemAvailable(), true, '内核就绪后变为可用');
  } finally {
    delete sandbox.__DSH_MODULES__;
  }
  assert.equal(isModuleSystemAvailable(), false, '清理后恢复不可用');
});

test('isModuleSystemAvailable: rc.8+ 只认插件自有的注入全局', async () => {
  const { isModuleSystemAvailable, sandbox } = await importChunkAvailability();
  // rc.8 内核不再暴露 __DSH_MODULES__，chunk 外部解析走 ctx.modules 注入的
  // __dshSidebarModuleSystem__（见 chunk-loader.ts setChunkModuleSystem）。
  sandbox.__dshSidebarModuleSystem__ = { import() {} };
  try {
    assert.equal(isModuleSystemAvailable(sandbox), true, '注入全局在场即可用');
  } finally {
    delete sandbox.__dshSidebarModuleSystem__;
  }
  assert.equal(isModuleSystemAvailable(sandbox), false, '两代全局都缺席 → 不可用');
  assert.equal(isModuleSystemAvailable({ __DSH_MODULES__: {} }), false, '有对象但 import 不可调用 → 不可用');
});

test('moduleSystemUnavailableMessage: 与线上红字逐字一致（单一来源）', async () => {
  const { moduleSystemUnavailableMessage } = await importChunkAvailability();
  assert.equal(
    moduleSystemUnavailableMessage('editor'),
    '[dsh-better-sidebar] chunk "editor": client module system unavailable',
  );
});

// ---------------------------------------------------------------------------
// 3) 重试环：退避轮询 + 单循环单定时器 + 热恢复 + 清理无泄漏
// ---------------------------------------------------------------------------
test('重试环: 模块系统持续不可用 → 按退避无限轮询且不断更新尝试计数', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => false,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const rec = recorder();
  const off = loop.subscribe(rec.onEvent);
  // 初始失败已计 1 次 → 第一轮等 2s
  assert.deepEqual(sched.delays, [2000], '订阅后恰好一个 2s 定时器');

  const expectDelays = [4000, 8000, 16000, 30000, 30000, 30000];
  let expectAttempt = 2;
  for (const delay of expectDelays) {
    assert.ok(sched.fire(), '应有待触发的探测');
    assert.deepEqual(sched.delays, [delay], `探测失败后下一轮等 ${delay}ms`);
    const last = rec.events[rec.events.length - 1];
    assert.equal(last.attempt, expectAttempt, `尝试计数递增到 ${expectAttempt}`);
    assert.equal(last.ready, false);
    expectAttempt += 1;
  }
  // 无限轮：再手动跑 30 轮仍然存活
  for (let i = 0; i < 30; i++) assert.ok(sched.fire());
  assert.equal(loop.active, true, '永不放弃');
  assert.deepEqual(sched.delays, [30000], '封顶后恒为 30s');
  assert.equal(sched.size, 1, '任意时刻只有一个待触发定时器');
  off();
});

test('重试环: 多视图共享同一循环（一个定时器），事件广播到全部订阅者', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('terminal', {
    isAvailable: () => false,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const a = recorder();
  const b = recorder();
  const c = recorder();
  loop.subscribe(a.onEvent);
  loop.subscribe(b.onEvent);
  loop.subscribe(c.onEvent);
  assert.equal(sched.size, 1, '三个视图只有一个循环一个定时器（registry 去重的环内体现）');
  assert.ok(sched.fire());
  assert.equal(a.events.length, 1);
  assert.equal(b.events.length, 1);
  assert.equal(c.events.length, 1);
  for (const r of [a, b, c]) assert.deepEqual(r.events[0], { attempt: 2, ready: false });
});

test('重试环: 内核恢复后首次探测成功 → ready 唤醒、循环终止、无残留定时器', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  let available = false;
  const loads = [];
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => available,
    attemptLoad: async () => { loads.push(1); },
    schedule: sched.schedule,
  });
  const rec = recorder();
  const off = loop.subscribe(rec.onEvent);
  for (let i = 0; i < 3; i++) assert.ok(sched.fire(), '前 3 轮模块系统不可用');
  assert.equal(loads.length, 0, '模块系统不可用时连脚本都不拉取（廉价探测先行）');
  available = true;
  assert.ok(sched.fire(), '第 4 轮探测到恢复');
  await new Promise((resolve) => setImmediate(resolve)); // 等 attemptLoad 微任务
  const last = rec.events[rec.events.length - 1];
  assert.equal(last.ready, true, 'ready 事件唤醒视图热恢复');
  assert.equal(loads.length, 1, '恢复后真正尝试了一次加载');
  assert.equal(loop.active, false, '成功即终态');
  assert.equal(sched.size, 0, '无残留定时器');
  off();
  assert.equal(sched.cancelledCount, 0, '成功路径本身已清空（无多余取消）');
});

test('重试环: 加载仍失败（脚本 404 / 工厂未注册）→ 继续退避而不是放弃', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => true,
    attemptLoad: async () => { throw new Error('chunk script failed'); },
    schedule: sched.schedule,
  });
  const rec = recorder();
  const off = loop.subscribe(rec.onEvent);
  assert.ok(sched.fire());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rec.events.map((e) => e.ready), [false], '失败广播');
  assert.deepEqual(sched.delays, [4000], '失败后退避翻倍');
  assert.equal(loop.active, true, '继续重试');
  off();
});

test('重试环: 加载在途不叠加探测，resolve 后 ready（无双重调度）', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  let resolveLoad;
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => true,
    attemptLoad: () => new Promise((resolve) => { resolveLoad = resolve; }),
    schedule: sched.schedule,
  });
  const rec = recorder();
  const off = loop.subscribe(rec.onEvent);
  assert.ok(sched.fire(), '触发探测');
  assert.equal(sched.size, 0, '在途期间不排新定时器');
  loop.poke();
  assert.equal(rec.events.length, 0, '在途时 poke 不叠加');
  resolveLoad();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rec.events, [{ attempt: 1, ready: true }]);
  assert.equal(loop.active, false);
  off();
});

test('重试环: poke() 跳过等待立即探测（页面重新可见即时恢复）', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => true,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const rec = recorder();
  const off = loop.subscribe(rec.onEvent);
  assert.deepEqual(sched.delays, [2000], '先有 2s 等待');
  loop.poke();
  assert.equal(sched.cancelledCount, 1, 'poke 取消了待触发定时器');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rec.events, [{ attempt: 1, ready: true }], '无需等 2s 即恢复');
  off();
});

test('清理: 最后一个订阅者退订 → 定时器取消、循环终态（unmount 无泄漏）', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => false,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const offA = loop.subscribe(() => {});
  const offB = loop.subscribe(() => {});
  offA();
  assert.equal(loop.active, true, '还有视图订阅，循环继续');
  assert.equal(sched.size, 1, '定时器保留');
  assert.equal(sched.cancelledCount, 0);
  offB();
  assert.equal(loop.active, false, '最后一个视图退订 → 终态');
  assert.equal(sched.size, 0, '待触发定时器清空');
  assert.equal(sched.cancelledCount, 1, '取消动作确实施行了（无泄漏的证据）');
  assert.equal(sched.fire(), false, '再无任何回调可触发');
  // 重复退订幂等
  offB();
  assert.equal(sched.cancelledCount, 1);
});

test('清理: dispose()（HMR resetChunks 路径）全清且再订阅会显式报错', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('terminal', {
    isAvailable: () => false,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const off = loop.subscribe(() => {});
  assert.equal(sched.size, 1);
  loop.dispose();
  assert.equal(sched.size, 0);
  assert.equal(sched.cancelledCount, 1, 'dispose 取消了待触发定时器');
  assert.equal(loop.active, false);
  assert.throws(() => loop.subscribe(() => {}), /retry loop already finished/);
  off(); // dispose 后退订幂等，不炸
});

test('隔离: 单个订阅者抛错不影响其余视图与循环推进', async () => {
  const { createChunkRetryLoop } = await importChunkAvailability();
  const sched = fakeScheduler();
  const loop = createChunkRetryLoop('editor', {
    isAvailable: () => false,
    attemptLoad: async () => {},
    schedule: sched.schedule,
  });
  const rec = recorder();
  loop.subscribe(() => { throw new Error('view crashed'); });
  const off = loop.subscribe(rec.onEvent);
  assert.ok(sched.fire(), '抛错的订阅者没有杀死循环');
  assert.equal(rec.events.length, 1, '健康订阅者照常收到事件');
  assert.equal(sched.size, 1, '循环照常排下一轮');
  off();
});

// ---------------------------------------------------------------------------
// 4) 编译产物契约：两份 bundle 都带上自动重试与中文等待文案
// ---------------------------------------------------------------------------
test('产物契约: client.js 与 client-registry.js 内联重试环并接线视图', () => {
  for (const file of BUNDLES) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    assert.ok(src.includes('function nextDelayMs('), `${rel}: 内联 nextDelayMs`);
    assert.ok(src.includes('function isModuleSystemAvailable('), `${rel}: 内联探测`);
    assert.ok(src.includes('function ensureChunkAutoRetry('), `${rel}: 注册表入口`);
    assert.ok(src.includes('const retryLoops'), `${rel}: 每 chunk 单例循环注册表（HMR 去重）`);
    // v0.15.2 HMR path is revalidateChunksOnReactivate (resetChunks is a full
    // reset kept for tests/consumers and is tree-shaken out of the client
    // bundle); BOTH must dispose every retry loop so no timer outlives its
    // views across a re-activation.
    assert.ok(/function revalidateChunksOnReactivate\(\) \{[\s\S]{0,1200}?loop\.dispose\(\)/.test(src),
      `${rel}: HMR 重激活必须 dispose 全部循环（清理路径）`);
    assert.ok(src.includes('document.removeEventListener("visibilitychange"'),
      `${rel}: visibility 监听有对称移除`);
    assert.ok(src.includes('stopAutoRetry = ensureChunkAutoRetry('),
      `${rel}: 视图加载失败后订阅自动重试`);
    assert.ok(src.includes('stopAutoRetry?.()'), `${rel}: effect cleanup 退订（unmount 清理）`);
    assert.ok(src.includes('t("chunkAutoRetryWaiting", { n: state.autoAttempt })'),
      `${rel}: 等待文案使用尝试计数`);
  }
});

test('产物契约: 错误态文案 —— 中文等待说明 + 手动重试按钮保留', () => {
  for (const file of BUNDLES) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    assert.ok(src.includes('正在等待后端就绪，将自动恢复…（第 {n} 次尝试）'),
      `${rel}: 中文等待文案`);
    assert.ok(src.includes('attempt {n}'), `${rel}: 英文等待文案`);
    assert.ok(src.includes('children: t("terminalRetry")'), `${rel}: 手动重试按钮保留`);
    // 红字本体（模块系统不可用）走单一来源 helper，不再散落内联模板
    assert.ok(!src.includes('"${name}": client module system unavailable'),
      `${rel}: loadChunk 的不可用文案应改走 moduleSystemUnavailableMessage(name)`);
  }
});

// ---------------------------------------------------------------------------
// 5) vm 物化冒烟（不启内核）：仿 unit-companion-client-rc8 的假模块表，
//    证明手改后的 bundle 仍能注册并在 rc.8 种子表下完整物化
// ---------------------------------------------------------------------------
const RC8_SEED = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
];

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

test('vm 冒烟: 两份 bundle 均可注册 factory 并在 rc.8 种子表下物化（apply 可导出）', () => {
  for (const file of BUNDLES) {
    const rel = path.basename(file);
    let captured = null;
    const sandbox = { window: { __ModuleLoader__: { load: (reg) => { captured = reg; } } } };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    assert.ok(captured && typeof captured.factory === 'function', `${rel}: 应经 __ModuleLoader__.load 注册`);
    let exportsLike = null;
    const requireStub = (spec) => {
      if (!RC8_SEED.includes(spec)) {
        throw new Error(`client-modules: require("${spec}") missed the module table`);
      }
      return deepStub();
    };
    assert.doesNotThrow(() => { exportsLike = captured.factory(requireStub); },
      `${rel}: rc.8 种子表下物化失败`);
    assert.equal(typeof exportsLike.apply, 'function', `${rel}: 应导出 client apply`);
    assert.ok(Array.isArray(exportsLike.inject), `${rel}: 应导出 inject 清单`);
  }
});

// ---------------------------------------------------------------------------
// 6) F1 三连修回归契约（V17）：编辑器主机的三类自愈兜底都必须内联进两份 bundle
// ---------------------------------------------------------------------------
//
//   F1-1 fsRead 网络类错误指数退避重试：内核重启窗口期 api.fsRead 抛
//         network/http 类错误时，不留在死错误态，而是按 nextDelayMs 退避自动
//         重拉，直到读到为止（与 chunk loader 共用同一退避曲线）。
//   F1-2 error 态 tab 重新可见触发重拉：同一个文件标签在错误态被切走再切回
//         时（visible false→true），必须重新发起读取，绝不卡死在过期红字上。
//   F1-3 chunk 失败内联 <pre> 预览兜底：编辑器 chunk 加载失败时，用只读 <pre>
//         呈现已取到的文本（fsRead 内容已在 props），保证文件始终可见。

test('F1-1: fsRead 网络类错误（network/http）按指数退避自动重试', () => {
  for (const file of BUNDLES) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    // 仅 network/http 类错误视为可重试（其它错误不自动重试）
    assert.ok(
      src.includes('error instanceof SidebarApiError && (error.code === "network" || error.code === "http")'),
      `${rel}: 网络类错误判定（network/http）`,
    );
    // 与 chunk loader 共用同一指数退避曲线（2s→30s 封顶，无限轮）
    assert.ok(src.includes('nextDelayMs(failCountRef.current)'), `${rel}: 退避调用 nextDelayMs`);
    // 退避定时器有对称清理（unmount / effect 重跑不泄漏）
    assert.ok(src.includes('retryTimer = window.setTimeout'), `${rel}: 退避定时器`);
    assert.ok(src.includes('window.clearTimeout(retryTimer)'), `${rel}: 退避定时器清理`);
    // 等待文案携带第 N 次尝试计数
    assert.ok(src.includes('autoAttempt: retryable'), `${rel}: 可重试错误记录 autoAttempt`);
  }
});

test('F1-2: error 态 tab 重新可见（visible false→true）触发重拉', () => {
  for (const file of BUNDLES) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    // 重新可见且当前是 error 态时才 bump 序列 → effect 重跑重新读取。
    // 判据咬合（而非两个独立 includes）：0.24.1 上游的手动刷新同样调
    // setReloadSeq，只有「error 态条件」与「bump」相邻出现才证明是重拉路径。
    assert.ok(
      /!prevVisibleRef\.current && visible && loadRef\.current\.status === "error"\)\s*setReloadSeq\(\(sequence\) => sequence \+ 1\)/.test(src),
      `${rel}: error 态重新可见 → setReloadSeq 重拉（条件与 bump 相邻）`,
    );
    // bump 复用同一读取 effect：reloadSeq 必须在该 effect 的依赖数组里
    assert.ok(/\bisDir,\s*reloadSeq\s*\]/.test(src), `${rel}: 读取 effect 依赖数组含 reloadSeq`);
  }
});

test('F1-3: chunk 加载失败时内联 <pre> 只读预览兜底（文件始终可见）', () => {
  for (const file of BUNDLES) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    // 只读兜底组件存在
    assert.ok(src.includes('function TextFallback'), `${rel}: 只读兜底组件 TextFallback`);
    // 内联 <pre> 呈现已取到的文本（fsRead 内容在 props 里）
    assert.ok(src.includes('jsx)("pre"'), `${rel}: 兜底内联 <pre>`);
    assert.ok(src.includes('whiteSpace: "pre-wrap"'), `${rel}: <pre> 预格式化换行`);
    // 降级提示 banner + 兜底渲染接线
    assert.ok(src.includes('t("chunkFallbackNotice")'), `${rel}: 降级提示文案`);
    assert.ok(src.includes('fallback(props)'), `${rel}: fallback 渲染接线`);
    // 编辑器 chunk 明确挂上兜底
    assert.ok(
      src.includes('lazyChunkComponent("editor", (mod) => mod.TextEditor, TextFallback)'),
      `${rel}: editor chunk 挂接 TextFallback`,
    );
  }
});
