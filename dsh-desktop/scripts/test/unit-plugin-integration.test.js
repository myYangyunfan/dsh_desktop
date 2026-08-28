'use strict';

// 插件集成门面（scripts/integration/index.js）单元测试（node --test）。
// 覆盖：createPluginIntegration().run() 闭包返回 { syncResult, patchReport,
// healthReport }，且 run() 解构后调用不依赖 this 绑定（门面聚合不崩）。
//
// 隔离：getHome / getUserDataDir / appDir / installAnchor 均注入 mkdtemp，
// 绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPluginIntegration } = require('../integration/index');

test('createPluginIntegration().run()：解构后调用返回 { syncResult, patchReport, healthReport }', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-ud-'));
  const anchor = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-integration-anchor-'));
  t.after(() => {
    for (const d of [home, appDir, userDataDir, anchor]) fs.rmSync(d, { recursive: true, force: true });
  });

  const opts = {
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => false,
    log: () => {},
    loadYaml: () => null,
    loadSettings: () => ({}),
    saveSettings: () => {},
    getInstallAnchorDir: () => anchor,
    hostDetectors: { openPath: () => true },
  };

  const integration = createPluginIntegration(opts);
  // 解构后调用：验证 run() 不依赖 this 绑定。
  const { run } = integration;
  const result = run();

  assert.deepEqual(Object.keys(result).sort(), ['healthReport', 'patchReport', 'syncResult'], 'run() 应返回三字段');
  // patchReport 来自 applyAll：含 total/changed/degraded/warnings/errors 等结构化字段。
  assert.equal(typeof result.patchReport.total, 'number', 'patchReport.total 应为数字');
  assert.ok(Array.isArray(result.patchReport.degraded), 'patchReport.degraded 应为数组');
  assert.ok(Array.isArray(result.patchReport.errors), 'patchReport.errors 应为数组');
  // healthReport 来自 preflight：空隔离 home 无 manifest → 早退。
  assert.deepEqual(result.healthReport, { scanned: 0, unpatched: [] }, 'healthReport 应为 preflight 早退结果');
});
