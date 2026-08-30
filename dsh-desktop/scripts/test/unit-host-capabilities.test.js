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
  DELETE_SESSION_MENU_GUARD,
  missingBridgeWarning,
  probe,
} = require('../lib/host-capabilities');

test('清单声明 openPath（preload required）与 deleteSession（插件非 required）', () => {
  assert.equal(HOST_CAPABILITIES.openPath.provider, 'preload');
  assert.equal(HOST_CAPABILITIES.openPath.required, true);
  assert.equal(HOST_CAPABILITIES.deleteSession.provider, 'dsh-session-manager');
  assert.equal(HOST_CAPABILITIES.deleteSession.required, false);
});

test('桥表达式为可选链（桥缺失静默降级到 undefined）', () => {
  assert.equal(BRIDGE_EXPRS.openPath, 'window.dshDesktop?.openPath');
  assert.equal(BRIDGE_EXPRS.deleteSession, 'window.__dshSessionManager?.deleteSession');
});

test('deleteSession 菜单守卫在桥缺失时隐藏菜单项', () => {
  assert.equal(
    DELETE_SESSION_MENU_GUARD,
    'window.__dshSessionManager && typeof window.__dshSessionManager.deleteSession === "function"',
  );
});

test('probe：探测器给出布尔；缺失探测器返回 null（未知）', () => {
  const r = probe({ openPath: () => true, deleteSession: () => false });
  assert.equal(r.openPath.available, true);
  assert.equal(r.deleteSession.available, false);
  assert.equal(r.openPath.required, true);
  const unknown = probe();
  assert.equal(unknown.openPath.available, null);
  assert.equal(unknown.deleteSession.available, null);
});

test('missingBridgeWarning：deleteSession 文案含插件名与隐藏提示', () => {
  const w = missingBridgeWarning('deleteSession');
  assert.ok(w.includes('dsh-session-manager'));
  assert.ok(w.includes('隐藏'));
  // 未知能力返回空串。
  assert.equal(missingBridgeWarning('nope'), '');
});

test('桥契约一致性：patch 脚本注入的桥字符串与清单常量一致', () => {
  // BRIDGE_EXPRS / DELETE_SESSION_MENU_GUARD 是「单一数据源」；patch-*.js 以
  // 内联字符串注入到第三方源码。此处用契约一致性测试强制二者同步，防止漂移。
  const openDirSrc = fs.readFileSync(path.join(__dirname, '..', 'patch-open-project-dir.js'), 'utf8');
  const sessionManageSrc = fs.readFileSync(path.join(__dirname, '..', 'patch-session-manage.js'), 'utf8');
  assert.ok(openDirSrc.includes(BRIDGE_EXPRS.openPath), 'patch-open-project-dir 应引用 openPath 桥');
  assert.ok(sessionManageSrc.includes(DELETE_SESSION_MENU_GUARD), 'patch-session-manage 应引用 deleteSession 菜单守卫');
  assert.ok(sessionManageSrc.includes(BRIDGE_EXPRS.deleteSession), 'patch-session-manage 应引用 deleteSession 桥');
});
