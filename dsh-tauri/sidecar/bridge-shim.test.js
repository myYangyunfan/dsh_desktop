'use strict';

/**
 * bridge-shim.js 行为级测试（vm 沙箱，无需 WebView）
 * ====================================================
 * 运行：`node --test sidecar/bridge-shim.test.js`（仓库 dsh-tauri/ 目录下）。
 *
 * 覆盖（contracts/bridge-api.md §4/§5 的页面侧行为）：
 *  - iframe 帧必须跳过全部壳机制（心跳/事件订阅/会话轮询/错误上报）——
 *    Tauri initialization_script 会注入所有同源 iframe（synapse /synapse/ 等），
 *    Electron contextBridge 只跑主框架。历史缺陷：守卫写在壳机制之后，
 *    每个 iframe 都装 5s 心跳 + 3s 会话轮询 + 4 个事件订阅（N 帧翻倍开销，
 *    且 iframe 心跳污染全局计数、掩蔽主窗假死判定）。
 *  - 主框架：心跳带窗口归属标签（main/float/pet）——假死看门狗只看主窗。
 *  - pagehide 生命周期：事件订阅必须经 plugin:event|unlisten 退订——
 *    历史缺陷：listen 只增不减，每次导航/重载在 Rust 侧监听表留死条目。
 *  - 桥对象（window.dshDesktop 48 方法）与 dialog polyfill 在所有帧可用
 *    （兼容性：iframe 内插件可能消费桥/确认框）。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIM_PATH = path.resolve(__dirname, '..', 'src-tauri', 'crates', 'bridge', 'dist', 'bridge-shim.js');
const SHIM_SRC = fs.readFileSync(SHIM_PATH, 'utf8');

/**
 * 构造最小页面沙箱并执行垫片。
 * mode: 'top'（主框架）| 'iframe'（window.top !== window.self）
 *       | 'float' / 'pet'（主框架 + 模式注入变量，同 windows.rs 真实注入序）
 * 返回 { invokes, timers, winListeners, docListeners, firePagehide,
 *        fireInterval, window }。
 */
function runShim(mode) {
  const invokes = [];           // { cmd, args }
  const timers = [];            // { id, fn, ms, cleared }
  const winListeners = {};      // type → [fn]
  const docListeners = {};
  let listenSeq = 100;          // plugin:event|listen 返回的事件 id 序列
  let cbSeq = 1;

  const sandbox = {};
  const fakeTop = mode === 'iframe' ? { __fake: 'top' } : null;

  const internals = {
    invoke: (cmd, args) => {
      invokes.push({ cmd, args: args || {} });
      if (cmd === 'plugin:event|listen') return Promise.resolve(listenSeq++);
      if (cmd === 'app_init') return Promise.resolve({ appVersion: '0.0.0-test' });
      return Promise.resolve(null);
    },
    transformCallback: (cb) => { void cb; return cbSeq++; },
  };

  const windowObj = {
    __TAURI_INTERNALS__: internals,
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
    dispatchEvent: () => true,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    MutationObserver: function MutationObserver() { this.observe = () => {}; this.disconnect = () => {}; },
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.top = fakeTop || windowObj;
  if (mode === 'float') windowObj.__DSH_FLOAT__ = Object.freeze({ sessionId: 's1' });
  if (mode === 'pet') windowObj.__DSH_PET__ = {};

  const documentObj = {
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    hidden: false,
    readyState: 'complete',
  };

  Object.assign(sandbox, {
    window: windowObj,
    document: documentObj,
    localStorage: {
      getItem: (k) => (k === 'dsh.sessions.current' ? '{"sessionId":"sess-abc"}' : null),
      setItem: () => {},
    },
    setInterval: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms, cleared: false }); return id; },
    clearInterval: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; },
    setTimeout: (fn) => { void fn; return 0; }, // 载入路径上的 setTimeout 不需要真实触发
    clearTimeout: () => {},
    console,
    Promise,
    MutationObserver: windowObj.MutationObserver,
    CustomEvent: windowObj.CustomEvent,
  });
  windowObj.setInterval = sandbox.setInterval;
  windowObj.clearInterval = sandbox.clearInterval;
  windowObj.setTimeout = sandbox.setTimeout;
  windowObj.clearTimeout = sandbox.clearTimeout;
  windowObj.console = console;
  windowObj.localStorage = sandbox.localStorage;
  windowObj.document = documentObj;

  vm.createContext(sandbox);
  vm.runInContext(SHIM_SRC, sandbox, { filename: 'bridge-shim.js' });

  return {
    invokes,
    timers,
    winListeners,
    docListeners,
    window: windowObj,
    count: (cmd) => invokes.filter((i) => i.cmd === cmd).length,
    firePagehide: () => { (winListeners.pagehide || []).forEach((fn) => fn()); },
    fireHeartbeatInterval: () => { timers.filter((t) => !t.cleared && t.ms === 5000).forEach((t) => t.fn()); },
  };
}

test('iframe：全部壳机制跳过（零 IPC），桥对象与 dialog polyfill 仍可用', () => {
  const s = runShim('iframe');
  // 历史缺陷实证锚点：守卫次序错误时 iframe 会装 4 个事件订阅 + 心跳 + 会话轮询。
  assert.strictEqual(s.count('plugin:event|listen'), 0, `iframe 不得注册事件订阅，实际: ${JSON.stringify(s.invokes.map((i) => i.cmd))}`);
  assert.strictEqual(s.count('renderer_heartbeat'), 0, 'iframe 不得发心跳（污染全局计数 → 掩蔽主窗假死判定）');
  assert.strictEqual(s.count('current_session'), 0, 'iframe 不得起会话轮询（主框架已在跑，N 帧重复上报）');
  assert.strictEqual(s.invokes.length, 0, `iframe 载入路径不得有任何 IPC（兼容保留的 getInfo 自初始化也归主框架）: ${JSON.stringify(s.invokes.map((i) => i.cmd))}`);
  assert.strictEqual(s.timers.length, 0, 'iframe 不得注册任何定时器');
  // 桥对象与 polyfill 必须保留（兼容性：iframe 内插件可能消费）。
  assert.ok(s.window.dshDesktop, 'window.dshDesktop 必须在 iframe 内可用');
  assert.strictEqual(typeof s.window.dshDesktop.copyText, 'function');
  assert.strictEqual(s.window.confirm(), true, 'confirm polyfill 必须在场（删除确认不得恒取消）');
});

test('主框架：心跳带 main 标签；4 事件订阅；会话上报；getInfo 自初始化', () => {
  const s = runShim('top');
  const beats = s.invokes.filter((i) => i.cmd === 'renderer_heartbeat');
  assert.ok(beats.length >= 1, '主框架载入即发首拍心跳');
  for (const b of beats) {
    assert.strictEqual(b.args.window, 'main', `心跳必须带窗口归属标签 main: ${JSON.stringify(b.args)}`);
  }
  assert.strictEqual(s.count('plugin:event|listen'), 4, '主框架注册 4 个事件订阅');
  assert.strictEqual(s.count('current_session'), 1, 'localStorage 变化上报一次');
  assert.strictEqual(s.count('app_init'), 1, 'getInfo 自初始化');
  // 心跳 interval 继续带标签。
  s.fireHeartbeatInterval();
  assert.strictEqual(s.invokes.filter((i) => i.cmd === 'renderer_heartbeat' && i.args.window === 'main').length, beats.length + 1);
});

test('浮窗/宠物窗：心跳分别带 float / pet 标签（不参与主窗假死判定）', () => {
  const f = runShim('float');
  const fbeats = f.invokes.filter((i) => i.cmd === 'renderer_heartbeat');
  assert.ok(fbeats.length >= 1);
  for (const b of fbeats) assert.strictEqual(b.args.window, 'float', `浮窗心跳标签: ${JSON.stringify(b.args)}`);

  const p = runShim('pet');
  const pbeats = p.invokes.filter((i) => i.cmd === 'renderer_heartbeat');
  assert.ok(pbeats.length >= 1);
  for (const b of pbeats) assert.strictEqual(b.args.window, 'pet', `宠物窗心跳标签: ${JSON.stringify(b.args)}`);
});

test('pagehide：4 个事件订阅全部经 plugin:event|unlisten 退订；定时器清除', async () => {
  const s = runShim('top');
  const listened = s.invokes.filter((i) => i.cmd === 'plugin:event|listen');
  assert.strictEqual(listened.length, 4);
  // listen 的 Promise 在微任务队列解析——退订闭包注册需等一拍。
  await new Promise((r) => setImmediate(r));
  assert.ok(s.winListeners.pagehide && s.winListeners.pagehide.length > 0, '必须挂 pagehide 生命周期收尾');
  s.firePagehide();
  await new Promise((r) => setImmediate(r));
  const unlistens = s.invokes.filter((i) => i.cmd === 'plugin:event|unlisten');
  assert.strictEqual(unlistens.length, 4, `pagehide 必须退订全部 4 个订阅（历史缺陷：只增不减）: ${JSON.stringify(s.invokes.map((i) => i.cmd))}`);
  const ids = unlistens.map((u) => u.args.id);
  for (const id of ids) assert.ok(Number.isInteger(id), `unlisten 必须带 listen 返回的事件 id: ${JSON.stringify(ids)}`);
  assert.strictEqual(new Set(ids).size, 4, '事件 id 不得重复');
  // 定时器（心跳/会话轮询）在 pagehide 后清除。
  const live = s.timers.filter((t) => !t.cleared);
  assert.strictEqual(live.length, 0, `pagehide 后不得残留定时器: ${JSON.stringify(s.timers)}`);
});
