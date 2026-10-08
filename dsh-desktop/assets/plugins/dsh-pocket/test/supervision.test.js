// 受监督宿主判定的回归测试。
//
// 钉住的是一个真实存在过的静默回归：旧实现靠 `desktopProfiles` / `desktopPnpm` 两个 cordis
// 服务是否存在来判断「是不是桌面端」，而这两个服务由我们自己的 dsh-market-desktop-bridge 提供。
// 该桥随「退役自制壳」删掉后，表达式在**官方桌面客户端里恒为 false**，
// 于是 pocket 的应用内自更新 + detached 重启宿主被悄悄重新启用 ——
// 而官方宿主有强制更新准入锁，重启它正是最坏时机的破坏动作。
import test from 'node:test';
import assert from 'node:assert/strict';
import { supervisionDecision } from '../lib/index.js';

test('官方客户端场景：两个 desktop* 服务都没了，仍必须判为受监督', () => {
  // detected=false 就是删掉 bridge 之后官方客户端的真实输入
  const r = supervisionDecision({ detected: false });
  assert.equal(r.supervised, true, '认不出宿主时默认受监督（安全侧）');
  assert.equal(r.reason, 'unconfirmed');
});

test('认出桌面宿主的四种信号都要判受监督', () => {
  for (const detected of [true]) {
    const r = supervisionDecision({ detected });
    assert.equal(r.supervised, true);
    assert.equal(r.reason, 'detected');
  }
});

test('独立跑 dsh web 时必须仍可显式打开宿主控制', () => {
  const r = supervisionDecision({ detected: false, allowHostControl: true });
  assert.equal(r.supervised, false);
  assert.equal(r.reason, 'host-control-allowed');
});

test('反证：allowHostControl 写成字符串 "true" 不算开（不能被 query/YAML 宽松 truthy 绕过）', () => {
  for (const bad of ['true', 1, {}, [1]]) {
    const r = supervisionDecision({ detected: false, allowHostControl: bad });
    assert.equal(r.supervised, true, `allowHostControl=${JSON.stringify(bad)} 不应解锁`);
  }
});

test('反证：allowHostControl 不能压过已被识别的桌面宿主', () => {
  // 已经认出是 Electron 宿主了，就算用户开了开关也不该允许重启宿主
  const r = supervisionDecision({ detected: true, allowHostControl: true });
  assert.equal(r.supervised, true);
  assert.equal(r.reason, 'detected');
});

test('测试缝隙 override 两个方向都生效，且优先于一切', () => {
  assert.deepEqual(supervisionDecision({ override: true, detected: false, allowHostControl: true }), {
    supervised: true,
    reason: 'override-desktop',
  });
  assert.deepEqual(supervisionDecision({ override: false, detected: true }), {
    supervised: false,
    reason: 'override-standalone',
  });
  // 反证：override 为 undefined 时不能误当成 false（那是「未指定」而不是「声明独立」）
  assert.equal(supervisionDecision({ override: undefined, detected: false }).supervised, true);
});

test('缺失值 / null / 假值一律算「未指定」，不得解锁重启宿主', () => {
  // 反证：早期实现写的是 override !== undefined，于是 null 会被当成
  // override=false = 「声明这是独立进程」，一个缺失值就悄悄解除了保护。
  for (const notAnOverride of [undefined, null, 0, '', NaN]) {
    const r = supervisionDecision({ override: notAnOverride, detected: false });
    assert.equal(r.supervised, true, `override=${JSON.stringify(notAnOverride)} 必须落回安全侧`);
  }
  // 只有显式 false 才是「声明独立」
  assert.equal(supervisionDecision({ override: false, detected: false }).supervised, false);
});

test('无参数调用不抛错，落回安全侧', () => {
  for (const input of [undefined, {}, { detected: null }, { allowHostControl: undefined }]) {
    const r = supervisionDecision(input);
    assert.equal(typeof r.supervised, 'boolean');
    assert.equal(typeof r.reason, 'string');
  }
});
