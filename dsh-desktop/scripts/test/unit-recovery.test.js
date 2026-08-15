'use strict';

// renderer-recovery.js 状态机单元测试（node --test，无需 Electron）。
// 用法：node --test scripts/test/unit-recovery.test.js
// 覆盖：退避计算、动作分级、干净退出忽略、退出中忽略、挂起宽限、
//       心跳兜底、重建携带计数、放弃与手动恢复、稳定期清零、去重计数。

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const {
  RendererRecovery,
  computeBackoff,
  nextAction,
  DEFAULT_OPTS,
} = require('../../renderer-recovery');

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

test('computeBackoff: 首次延迟固定，后续指数退避且有上限', () => {
  assert.strictEqual(computeBackoff(1, {}), DEFAULT_OPTS.FIRST_DELAY_MS);
  assert.strictEqual(computeBackoff(0, {}), DEFAULT_OPTS.FIRST_DELAY_MS);
  const b2 = computeBackoff(2, { BACKOFF_BASE_MS: 1000, BACKOFF_MAX_MS: 8000 });
  assert.ok(b2 >= 1000 * 2 * 1.15 && b2 <= 1000 * 2 * 1.35, `b2=${b2}`);
  const bBig = computeBackoff(10, { BACKOFF_BASE_MS: 1000, BACKOFF_MAX_MS: 8000 });
  assert.ok(bBig <= 8000 * 1.35, `bBig=${bBig}`);
});

test('nextAction: 分级决策符合设计', () => {
  assert.strictEqual(nextAction(1, 'main', false), 'reload');
  assert.strictEqual(nextAction(2, 'main', false), 'reload');
  assert.strictEqual(nextAction(3, 'main', false), 'rebuild');
  assert.strictEqual(nextAction(3, 'main', true), 'reload'); // 已重建过
  assert.strictEqual(nextAction(3, 'float', false), 'reload'); // 浮窗不重建
  assert.strictEqual(nextAction(4, 'main', false), 'reload');
  assert.strictEqual(nextAction(5, 'main', false), 'give-up');
});

// ---------------------------------------------------------------------------
// 行为测试
// ---------------------------------------------------------------------------

const FAST_OPTS = {
  MAX_ATTEMPTS: 4,
  ATTEMPT_WINDOW_MS: 60 * 1000,
  STABILITY_MS: 30,
  FIRST_DELAY_MS: 10,
  BACKOFF_BASE_MS: 20,
  BACKOFF_MAX_MS: 120,
  LOAD_TIMEOUT_MS: 1500,
  UNRESPONSIVE_GRACE_MS: 30,
  HEARTBEAT_MISS_MS: 200,
  ERROR_PAGE_RELOAD_MIN_INTERVAL_MS: 0,
  SERVER_WAIT_MAX_MS: 200,
};

const WEB_URL = 'http://127.0.0.1:34567/';
let seq = 0;

function fakeWin() {
  const wc = new EventEmitter();
  wc.id = 'wc-' + (++seq);
  wc._url = '';
  wc._loadBehavior = 'ok'; // 'ok' | 'fail' | 'fail-with-event'
  wc.getURL = () => wc._url;
  wc.loadURL = (url) => {
    if (wc._loadBehavior === 'fail') return Promise.reject(new Error('ERR_FAILED'));
    if (wc._loadBehavior === 'fail-with-event') {
      // 真实 Electron 顺序：did-fail-load 事件先触发，随后 loadURL Promise 拒绝
      wc.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', url, true);
      return Promise.reject(new Error('ERR_FAILED'));
    }
    wc._url = url;
    setImmediate(() => wc.emit('did-finish-load'));
    return Promise.resolve();
  };
  wc.loadFile = (p) => {
    wc._url = pathToFileURL(p).href;
    setImmediate(() => wc.emit('did-finish-load'));
    return Promise.resolve();
  };
  wc.forcefullyCrashRenderer = () => {
    setImmediate(() => wc.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 }));
  };
  const win = new EventEmitter();
  win.id = 'win-' + seq;
  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.destroy = () => {
    if (win._destroyed) return;
    win._destroyed = true;
    wc.emit('destroyed');
  };
  win.isVisible = () => true;
  return win;
}

function makeRecovery(overrides = {}) {
  const logs = [];
  const base = {
    log: (m) => logs.push(m),
    isQuitting: () => false,
    isServerAlive: () => true,
    getTarget: () => ({ kind: 'url', url: WEB_URL }),
    loadingPage: 'C:/x/loading.html',
    recoveryPage: 'C:/x/recovery.html',
    rebuildMainWindow: () => { throw new Error('unexpected rebuild'); },
    waitServerUp: () => Promise.reject(new Error('server down')),
    onGaveUp: () => {},
    onStable: () => {},
    notify: () => {},
  };
  const r = new RendererRecovery({ ...FAST_OPTS, ...base, ...overrides });
  return { r, logs };
}

const tick = (ms) => new Promise((res) => setTimeout(res, ms));

test('崩溃后自动重载并在稳定期后清零', async () => {
  const { r, logs } = makeRecovery();
  let stable = 0;
  r.opts.onStable = () => { stable += 1; };
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -1073741819 });
  assert.strictEqual(r.stateOf(win).failures, 1);
  await tick(120); // 10ms 退避 + 30ms 稳定期
  assert.strictEqual(r.stateOf(win).failures, 0);
  assert.strictEqual(r.stateOf(win).gaveUp, false);
  assert.strictEqual(win.webContents.getURL(), WEB_URL, '应重新加载到 Web UI');
  assert.ok(logs.some((l) => l.includes('渲染进程异常退出')), '应记录崩溃');
  assert.ok(logs.some((l) => l.includes('界面已稳定')), '应记录稳定');
  assert.strictEqual(stable, 1);
});

test('clean-exit 与退出中不触发恢复', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
  await tick(60);
  assert.strictEqual(r.stateOf(win).failures, 0);
  assert.ok(!logs.some((l) => l.includes('安排恢复')), 'clean-exit 不应安排恢复');

  const { r: r2, logs: logs2 } = makeRecovery({ isQuitting: () => true });
  const win2 = fakeWin();
  r2.attach(win2, 'main');
  win2.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(60);
  assert.strictEqual(r2.stateOf(win2).failures, 0);
  assert.ok(!logs2.some((l) => l.includes('安排恢复')), '退出中不应安排恢复');
});

test('did-finish-load 单独不清零计数，稳定期结束才清零', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(20); // 10ms 退避后加载成功，但未到 30ms 稳定期
  assert.strictEqual(r.stateOf(win).failures, 1, '加载成功但未稳定前计数不应清零');
  assert.strictEqual(win.webContents.getURL(), WEB_URL);
  await tick(60); // 稳定期结束
  assert.strictEqual(r.stateOf(win).failures, 0, '稳定期结束应清零');
});

test('稳定期内发生新故障则保留计数（防止慢速崩溃循环无限延续）', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 }); // f=1
  await tick(25); // 10ms 退避后加载完成（atLoad=1），稳定期 30ms 尚未到
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 }); // f=2
  await tick(30); // 第一次稳定期已过 → 脏检查应保留计数
  assert.strictEqual(r.stateOf(win).failures, 2, '稳定期内有新故障应保留计数');
  assert.ok(logs.some((l) => l.includes('保留计数防止循环')), '应记录脏稳定日志');
  await tick(250); // 后续恢复链完成并再次干净稳定
  assert.strictEqual(r.stateOf(win).failures, 0);
});

test('顽固故障循环有界：连续崩溃最终放弃且不再安排恢复', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  win.webContents._loadBehavior = 'fail'; // 加载永远失败 → 无 did-finish-load → 计数不会被清零
  r.attach(win, 'main');
  for (let i = 0; i < 6; i += 1) {
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await tick(15);
  }
  await tick(300);
  const s = r.stateOf(win);
  assert.ok(s.gaveUp, '应最终放弃');
  assert.ok(s.failures >= 5, `failures=${s.failures}`);
});

test('连续失败：重建窗口继承故障计数，最终放弃并显示错误页', async () => {
  let rebuilt = 0;
  let newWin = null;
  const oldWin = fakeWin();
  oldWin.webContents._loadBehavior = 'fail';
  const { r, logs } = makeRecovery({
    rebuildMainWindow: () => {
      // 忠实模拟 main.js 契约：销毁旧窗、创建新窗（新窗同样加载失败）
      rebuilt += 1;
      oldWin.destroy();
      newWin = fakeWin();
      newWin.webContents._loadBehavior = 'fail';
      return newWin;
    },
  });
  r.attach(oldWin, 'main');
  for (let i = 0; i < 4; i += 1) {
    oldWin.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await tick(15);
  }
  await tick(400);
  assert.ok(rebuilt === 1, `应重建一次，实际=${rebuilt}`);
  assert.ok(logs.some((l) => l.includes('主窗口已重建')), '应记录重建');
  assert.ok(newWin, '重建应产生新窗口');
  assert.strictEqual(r.stateOf(newWin).gaveUp, true, '重建后仍失败应最终放弃');
  assert.strictEqual(newWin.webContents.getURL(), pathToFileURL('C:/x/recovery.html').href, '放弃后应显示错误页');
  const countSchedules = () => logs.filter((l) => l.includes('安排恢复')).length;
  const before = countSchedules();
  newWin.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(100);
  assert.strictEqual(countSchedules(), before, '放弃后不应再安排自动恢复');
});

test('浮窗崩溃后重载；顽固失败直接关闭浮窗', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  r.attach(win, 'float');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(120);
  assert.ok(!win.isDestroyed(), '单次崩溃应重载恢复而不是关闭');
  assert.strictEqual(r.stateOf(win).failures, 0);

  const win2 = fakeWin();
  win2.webContents._loadBehavior = 'fail';
  const { r: r2 } = makeRecovery();
  r2.attach(win2, 'float');
  for (let i = 0; i < 6; i += 1) {
    win2.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await tick(15);
  }
  await tick(300);
  assert.ok(win2.isDestroyed(), '浮窗顽固故障应被关闭');
});

test('挂起：宽限期内恢复响应则取消；持续无响应则强制终结并恢复', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  win.webContents._url = WEB_URL;
  r.attach(win, 'main');
  win.webContents.emit('did-finish-load');
  await tick(80); // 等稳定期结束（挂起判定通常发生在页面稳定之后）
  // 场景 1：宽限期内恢复响应
  win.webContents.emit('unresponsive');
  assert.ok(logs.some((l) => l.includes('检测到界面无响应')));
  await tick(10);
  win.webContents.emit('responsive');
  await tick(80);
  assert.ok(!win.isDestroyed());
  assert.ok(!logs.some((l) => l.includes('界面持续无响应')), '恢复响应后不应强制终结');

  // 场景 2：持续无响应 → 强制终结 → render-process-gone → 重载恢复
  const { r: r2, logs: logs2 } = makeRecovery();
  const win2 = fakeWin();
  win2.webContents._url = WEB_URL;
  r2.attach(win2, 'main');
  win2.webContents.emit('did-finish-load');
  await tick(80); // 稳定期结束
  win2.webContents.emit('unresponsive');
  await tick(200); // 30ms 宽限 → 强制终结 → 重载 → 30ms 稳定
  assert.ok(logs2.some((l) => l.includes('界面持续无响应')), '宽限期到应强制终结');
  assert.ok(logs2.some((l) => l.includes('渲染进程异常退出')), '强制终结应产生崩溃事件');
  assert.strictEqual(r2.stateOf(win2).failures, 0, '恢复成功后计数清零');
  assert.strictEqual(win2.webContents.getURL(), WEB_URL);
});

test('心跳兜底：失联视为挂起，恢复心跳则取消', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  win.webContents._url = WEB_URL;
  r.attach(win, 'main');
  win.emit('show'); // 窗口已显示（show 事件驱动可见性追踪）
  win.webContents.emit('did-finish-load');
  r.checkHeartbeats(); // 从未有心跳 → 不计（视为未初始化）
  assert.ok(!logs.some((l) => l.includes('心跳丢失')));
  r.noteHeartbeat(win.webContents.id);
  await tick(300); // 超过 HEARTBEAT_MISS_MS=200
  r.checkHeartbeats();
  assert.ok(logs.some((l) => l.includes('心跳丢失')), '心跳超时应判定为挂起');
  await tick(150);
  assert.ok(logs.some((l) => l.includes('界面持续无响应')), '心跳失联最终强制恢复');
  assert.strictEqual(r.stateOf(win).failures, 0, '强制恢复后应回归健康');

  // 隐藏（托盘/最小化）窗口不判定
  const { r: r2, logs: logs2 } = makeRecovery();
  const win2 = fakeWin();
  win2.webContents._url = WEB_URL;
  r2.attach(win2, 'main');
  win2.emit('show');
  win2.emit('hide'); // 隐藏到托盘
  win2.webContents.emit('did-finish-load');
  r2.noteHeartbeat(win2.webContents.id);
  await tick(300);
  r2.checkHeartbeats();
  assert.ok(!logs2.some((l) => l.includes('心跳丢失')), '隐藏窗口不应误判挂起');
});

test('did-fail-load：目标页加载失败计故障并恢复；服务已死时不动作', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  win.webContents._url = WEB_URL;
  r.attach(win, 'main');
  win.webContents.emit('did-finish-load');
  win.webContents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', WEB_URL, true);
  await tick(150);
  assert.ok(logs.some((l) => l.includes('目标页加载失败')));
  assert.strictEqual(r.stateOf(win).failures, 0, '服务健在时重载成功应恢复');
  assert.strictEqual(win.webContents.getURL(), WEB_URL);

  // ERR_ABORTED 忽略
  const { r: r2, logs: logs2 } = makeRecovery();
  const win2 = fakeWin();
  win2.webContents._url = WEB_URL;
  r2.attach(win2, 'main');
  win2.webContents.emit('did-finish-load');
  win2.webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', WEB_URL, true);
  await tick(60);
  assert.ok(!logs2.some((l) => l.includes('目标页加载失败')), 'ERR_ABORTED 应忽略');

  // 服务已死：不动作（交给既有对话框）
  const { r: r3, logs: logs3 } = makeRecovery({ isServerAlive: () => false });
  const win3 = fakeWin();
  win3.webContents._url = WEB_URL;
  r3.attach(win3, 'main');
  win3.webContents.emit('did-finish-load');
  win3.webContents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', WEB_URL, true);
  await tick(60);
  assert.ok(!logs3.some((l) => l.includes('安排恢复')), '服务已死不应安排恢复');
});

test('did-fail-load 事件与 loadURL Promise 拒绝不重复计数', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  win.webContents._loadBehavior = 'fail-with-event';
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 }); // 计 1
  await tick(40); // 10ms 退避 + 恢复加载失败（事件被在途标记吸收，Promise 拒绝计 1）
  assert.strictEqual(r.stateOf(win).failures, 2, '崩溃 1 次 + 加载失败 1 次，事件不应重复计数');
});

test('retryNow 重置放弃状态并立即恢复', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents._url = WEB_URL;
  win.webContents.emit('did-finish-load');
  r._states.get(win.id).gaveUp = true; // 人为置为放弃状态（白盒）
  assert.ok(r.stateOf(win).gaveUp);
  assert.strictEqual(r.retryNow(win), true);
  await tick(120);
  assert.ok(!r.stateOf(win).gaveUp, 'retryNow 应清除放弃状态');
  assert.strictEqual(win.webContents.getURL(), WEB_URL);
});

test('放弃后迟到的 Web 加载不会撤销放弃状态', async () => {
  const { r, logs } = makeRecovery();
  const win = fakeWin();
  win.webContents._loadBehavior = 'fail';
  r.attach(win, 'main');
  for (let i = 0; i < 6; i += 1) {
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await tick(15);
  }
  await tick(300);
  assert.ok(r.stateOf(win).gaveUp, '应处于放弃状态');
  assert.strictEqual(win.webContents.getURL(), pathToFileURL('C:/x/recovery.html').href, '应显示恢复页');
  // 模拟在途的旧恢复尝试在放弃后才完成 Web 加载
  win.webContents._url = WEB_URL;
  win.webContents.emit('did-finish-load');
  await tick(60);
  assert.ok(r.stateOf(win).gaveUp, '迟到的 Web 加载不应撤销放弃状态');
  assert.ok(logs.some((l) => l.includes('忽略迟到的 Web 加载')), '应记录忽略日志');
  assert.strictEqual(win.webContents.getURL(), pathToFileURL('C:/x/recovery.html').href, '应切回恢复页');
});

test('getTarget 为空（启动早期）时主窗回加载页，浮窗关闭', async () => {
  const { r } = makeRecovery({ getTarget: () => null });
  const win = fakeWin();
  r.attach(win, 'main');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(120);
  assert.strictEqual(win.webContents.getURL(), pathToFileURL('C:/x/loading.html').href, '应回加载页');

  const fwin = fakeWin();
  const { r: r2 } = makeRecovery({ getTarget: () => null });
  r2.attach(fwin, 'float');
  fwin.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  await tick(80);
  assert.ok(fwin.isDestroyed(), '无目标时浮窗应直接关闭');
});

test('挂起计数不与强制崩溃事件重复计数', async () => {
  const { r } = makeRecovery();
  const win = fakeWin();
  win.webContents._url = WEB_URL;
  r.attach(win, 'main');
  win.webContents.emit('did-finish-load');
  await tick(80); // 稳定期结束
  win.webContents.emit('unresponsive');
  await tick(40); // 宽限 30ms 到 → 强制终结（setImmediate）
  await tick(5); // render-process-gone 已发出，恢复动作尚未开始
  const s = r.stateOf(win);
  assert.strictEqual(s.failures, 1, '挂起 + 强制崩溃应只计一次故障');
  await tick(150);
  assert.strictEqual(r.stateOf(win).failures, 0);
});
