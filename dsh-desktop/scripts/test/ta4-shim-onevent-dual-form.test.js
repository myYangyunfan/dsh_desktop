'use strict';

// ta4-shim-onevent-dual-form.test.js — TA4 回归锁定（事件信封修复的行为级补锁）。
//
// 修复背景：bridge 垫片 onEvent 此前把 Tauri 2 事件回调参数当裸 payload 直读，
// 而 tauri-2.11.5 emit_js_script 回调签名是 fn({event, payload}, ids)——
// notification-jump / balance-changed / pet-state / 更新进度 / 拖放转发的
// 字段全部取成 undefined（事件链静默失效）。修复统一解包 ev.payload，
// 并保留「无 payload 形态回退 envelope 自身」的双形态防御。
//（上面这份是**当时**的事件面名单：pet-state 与拖放转发两条已于 2026-10 随
// harness-pet / dsh-file-drop 退役下线，balance-changed 同日随 Electron 余额
// 遗留线整体退役（contracts/ipc-commands.md §2.4），现存事件面见
// ta13-soak-bridge-shim。本测试只验 onEvent 的信封解包形态，事件名取现存面。）
//
// pages/shim 层已有形态测（信封字段存在性）；本文件补**行为级**：
// 从 dist/bridge-shim.js 提取真实 onEvent 函数源，在 vm 里以桩 INVOKE/
// TRANSFORM 物化，直接调 handler 验证双形态解包、map 应用与订阅方异常隔离。
// 运行：node --test scripts/test/ta4-shim-onevent-dual-form.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIM = path.resolve(__dirname, '..', '..', '..', 'dsh-tauri', 'src-tauri', 'crates', 'bridge', 'dist', 'bridge-shim.js');

/** 提取真实 onEvent 函数源（定义处到首个 onEvent( 调用处之间）。 */
function extractOnEvent() {
  const src = fs.readFileSync(SHIM, 'utf8');
  const start = src.indexOf('function onEvent(name, queue, map)');
  const end = src.indexOf("onEvent('window-maximized'");
  assert.ok(start >= 0 && end > start, 'bridge-shim.js 必须含 onEvent 定义（信封修复回归即坏）');
  return src.slice(start, end);
}

/**
 * 在 vm 里物化 onEvent：INVOKE 桩捕获 handler（TRANSFORM 桩=恒等），
 * 返回 { register(name, queue, map) → handler }。
 */
function makeOnEvent() {
  const captured = { invokeArgs: null };
  const sandbox = {
    INVOKE: (cmd, args) => { captured.invokeArgs = { cmd, args }; return Promise.resolve(); },
    TRANSFORM: (f) => f,
  };
  const fn = vm.runInNewContext(`${extractOnEvent()}\nonEvent;`, sandbox);
  assert.strictEqual(typeof fn, 'function');
  return {
    handlerFor(name, queue, map) {
      fn(name, queue, map);
      assert.ok(captured.invokeArgs && captured.invokeArgs.args.event === name, 'INVOKE 须以事件名注册监听');
      return captured.invokeArgs.args.handler;
    },
  };
}

test('onEvent 双形态：信封 {event,payload} 与裸 payload 都解出 payload', () => {
  const shim = makeOnEvent();
  const got = [];
  const handler = shim.handlerFor('window-maximized', [(p) => got.push(p)], (p) => p);

  // 形态一（tauri 2.11.5 实际形态）：信封包裹。
  handler({ event: 'window-maximized', payload: { ok: true, at: 42 } });
  assert.deepEqual(got[0], { ok: true, at: 42 }, '信封形态必须取 ev.payload（修复主行为）');

  // 形态二（防御未来双形态）：裸 payload 直达。
  handler({ ok: false, at: 43 });
  assert.deepEqual(got[1], { ok: false, at: 43 }, '无 payload 字段时回退 envelope 自身');

  // 极端：undefined 回调参数也不炸（订阅方收 undefined）。
  assert.doesNotThrow(() => handler(undefined), 'undefined 回调不得抛出');
});

test('onEvent：map 应用 + 订阅方异常不外溢（其余订阅方照常收到）', () => {
  const shim = makeOnEvent();
  const got = [];
  const handler = shim.handlerFor('notification-jump', [
    () => { throw new Error('subscriber boom'); }, // 坏订阅方
    (p) => got.push(p), // 好订阅方必须照常收到
  ], (p) => (p && p.sessionId ? { sessionId: p.sessionId } : null));

  assert.doesNotThrow(() => handler({ event: 'x', payload: { sessionId: 's-1' } }), '订阅方异常不得外溢到事件系统');
  assert.deepEqual(got, [{ sessionId: 's-1' }], 'map 在解包后应用，好订阅方收到映射结果');

  // 信封缺失（payload 为 null）→ map 收 null 而非信封对象。
  handler({ event: 'x', payload: null });
  assert.strictEqual(got[1], null, 'payload:null 原样传递（map 自行兜底）');
});
