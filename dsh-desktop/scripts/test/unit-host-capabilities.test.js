'use strict';

// host-capabilities 单元测试（node --test）。
// 验证宿主能力清单、探测报告、降级告警文案与注入桥表达式。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  HOST_CAPABILITIES,
  BRIDGE_EXPRS,
  missingBridgeWarning,
  probe,
} = require('../lib/host-capabilities');

test('清单声明 openPath（preload required）', () => {
  assert.equal(HOST_CAPABILITIES.openPath.provider, 'preload');
  assert.equal(HOST_CAPABILITIES.openPath.required, true);
});

test('桥表达式为可选链（桥缺失静默降级到 undefined）', () => {
  assert.equal(BRIDGE_EXPRS.openPath, 'window.dshDesktop?.openPath');
});

test('probe：探测器给出布尔；缺失探测器返回 null（未知）', () => {
  const r = probe({ openPath: () => true });
  assert.equal(r.openPath.available, true);
  assert.equal(r.openPath.required, true);
  const unknown = probe();
  assert.equal(unknown.openPath.available, null);
});

test('missingBridgeWarning：openPath 文案含 provider 与降级提示', () => {
  const w = missingBridgeWarning('openPath');
  assert.ok(w.includes('preload'));
  assert.ok(w.includes('降级'));
  assert.equal(missingBridgeWarning('nope'), '');
});

test('桥契约一致性：patch 脚本注入的桥字符串与清单常量一致', () => {
  const openDirSrc = fs.readFileSync(path.join(__dirname, '..', 'patch-open-project-dir.js'), 'utf8');
  assert.ok(openDirSrc.includes(BRIDGE_EXPRS.openPath), 'patch-open-project-dir 应引用 openPath 桥');
});
