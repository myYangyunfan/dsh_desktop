'use strict';

// dsh-session-manager 超时守卫单测（node --test）。
//
// 回归背景（issue #122/#129，用户描述「跳出选择框的时候，点击提交没有
// 反应，显示 signal time out」）：连接层所有一元 RPC（含选择框提交的
// POST /api/respond）带 AbortSignal.timeout(30s)；后端假死（TCP 通、HTTP
// 永不响应——supervisor http_alive 定性的根形态）或事件循环被长压缩占用
// 时，Chromium 抛裸 DOMException "signal timed out"（TimeoutError）。
// b67f0a0 修复：isTimeoutError 识别 → confirm 一键走壳层受监管重启
// （window.dshDesktop.restartService）；非超时错误维持 alert 原文。
// 本文件把该行为钉进回归（此前只有 focus-guard 有单测，超时守卫裸奔）。
//
// 纯函数级测试：stub window.confirm/alert/dshDesktop，不触网不触桥。
// 插件是 "type": "module" 包，node 直接 require 会 ERR_REQUIRE_ESM，
// 故照 unit-session-manager-focus-guard.test.js 先例用 VM 沙箱加载。
//
// 用法：node --test scripts/test/unit-session-manager-timeout-guard.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CLIENT_SRC = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-session-manager', 'lib', 'client.js');

// ---------------------------------------------------------------------------
// 加载插件 client 模块（stub react / __ModuleLoader__；window 留可变 stub 位）
// ---------------------------------------------------------------------------
function loadClientModule() {
  const code = fs.readFileSync(CLIENT_SRC, 'utf8');
  const sandboxWindow = {
    __ModuleLoader__: {
      load(entry) {
        const fakeRequire = (id) => {
          if (id === 'react') return { useState: () => [], useEffect: () => {} };
          if (id === 'react/jsx-runtime') return { jsx: () => {}, jsxs: () => {} };
          if (id === '@deepseek-ai/dsh-client-web-react') return { bindSnapshotSelector: () => () => {} };
          if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Button: () => {} };
          throw new Error('unexpected require: ' + id);
        };
        loaded = entry.factory(fakeRequire);
      }
    }
  };
  let loaded = null;
  const sandbox = { console, window: sandboxWindow };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'dsh-session-manager/client.js' });
  return { client: loaded, win: sandboxWindow };
}

const { client, win } = loadClientModule();
const { isTimeoutError, reportActionError } = client.timeoutGuard;

// 每个 case 前重置 window stub（记录调用供断言）。
function resetWindow({ confirmResult = true, restartThrows = false } = {}) {
  const calls = { confirm: 0, alert: 0, restart: 0, alertMessage: null };
  win.confirm = () => { calls.confirm += 1; return confirmResult; };
  win.alert = (msg) => { calls.alert += 1; calls.alertMessage = msg; };
  win.dshDesktop = {
    restartService: () => {
      calls.restart += 1;
      if (restartThrows) throw new Error('bridge down');
    }
  };
  return calls;
}

// ---------------------------------------------------------------------------
// isTimeoutError：识别 Chromium AbortSignal.timeout 的全部报错形态
// ---------------------------------------------------------------------------
test('isTimeoutError 识别 DOMException signal timed out（选择框提交超时的用户所见）', () => {
  // Chromium/WebView2 对 AbortSignal.timeout 到期的标准报错。
  const domExc = new DOMException === 'function'
    ? { message: 'signal timed out', name: 'TimeoutError' }
    : { message: 'signal timed out' };
  assert.equal(isTimeoutError(domExc), true);
});

test('isTimeoutError 识别大小写变体与 AbortSignal 手动中止文案', () => {
  assert.equal(isTimeoutError(new Error('TimeoutError: signal timed out')), true);
  assert.equal(isTimeoutError(new Error('The operation was aborted')), true);
  assert.equal(isTimeoutError(new Error('SIGNAL TIMED OUT')), true);
});

test('isTimeoutError 对普通业务错误返回 false（HTTP 4xx/5xx、schema 失败等）', () => {
  assert.equal(isTimeoutError(new Error('transport failure for /api/respond: HTTP 500')), false);
  assert.equal(isTimeoutError(new Error('question response rejected: stale')), false);
  assert.equal(isTimeoutError(null), false);
  assert.equal(isTimeoutError(''), false);
});

test('isTimeoutError 接受裸字符串与 Error 外的对象', () => {
  assert.equal(isTimeoutError('signal timed out'), true);
  assert.equal(isTimeoutError({ message: 'signal timed out' }), true);
});

// ---------------------------------------------------------------------------
// reportActionError：超时 → confirm 重启出口；非超时 → alert 原文
// ---------------------------------------------------------------------------
test('超时错误走 confirm + 受监管重启（用户确认后）', () => {
  const calls = resetWindow({ confirmResult: true });
  reportActionError(new Error('signal timed out'));
  assert.equal(calls.confirm, 1, '应弹一次确认');
  assert.equal(calls.restart, 1, '确认后应调用 restartService');
  assert.equal(calls.alert, 0, '超时路径不得走 alert 裸报');
});

test('超时错误用户取消时不重启', () => {
  const calls = resetWindow({ confirmResult: false });
  reportActionError(new Error('signal timed out'));
  assert.equal(calls.confirm, 1);
  assert.equal(calls.restart, 0, '取消后不得重启');
});

test('超时且 Tauri 垫片 confirm 恒 true 时自动重启（垫片 polyfill 语义下的行为钉板）', () => {
  // Tauri 线 BRIDGE_SHIM_JS 的 dialog polyfill 把 confirm 固定为 true
  // （删除确认防恒取消的设计），此处钉板：该语义下超时即自动触发受监管
  // 重启，不产生游离进程（restartService 是 supervisor 的原地重启）。
  const calls = resetWindow({ confirmResult: true });
  reportActionError(new Error('TimeoutError: The operation was aborted'));
  assert.equal(calls.restart, 1);
});

test('桥不可用（无 dshDesktop）时静默不抛——修复文案里承诺的降级', () => {
  const calls = resetWindow();
  delete win.dshDesktop;
  assert.doesNotThrow(() => reportActionError(new Error('signal timed out')));
  assert.equal(calls.confirm, 1);
  assert.equal(calls.alert, 0);
});

test('restartService 抛异常时静默吞掉（桥半开不影响页面）', () => {
  const calls = resetWindow({ confirmResult: true, restartThrows: true });
  assert.doesNotThrow(() => reportActionError(new Error('signal timed out')));
  assert.equal(calls.restart, 1);
});

test('非超时错误维持 alert 原文展示', () => {
  const calls = resetWindow();
  reportActionError(new Error('transport failure: HTTP 500'));
  assert.equal(calls.alert, 1, '非超时应走 alert');
  assert.ok(String(calls.alertMessage).includes('HTTP 500'), 'alert 应带原文');
  assert.equal(calls.confirm, 0, '不得误触发重启确认');
  assert.equal(calls.restart, 0);
});
