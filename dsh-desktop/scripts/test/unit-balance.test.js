'use strict';

// balance.js 纯函数单测：峰谷定价切换、模型档位读取锚定、no-key 返回形态。
// 不发起任何网络请求；不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const balance = require('../../balance');

test('effectivePrice: 峰谷切换与旧版固定价（按 UTC 时刻精确断言）', () => {
  // 峰谷生效节点：2026-08-16 16:00 UTC。之前 = 旧版固定价。
  const legacyDate = new Date('2026-08-16T15:59:59Z');
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', legacyDate), { cacheMiss: 1, cacheHit: 0.02, output: 2 });
  // 之后：北京时间高峰（9:00-12:00、14:00-18:00）全价。
  const peakDate = new Date('2026-08-17T02:30:00Z'); // 北京 10:30
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', peakDate), { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  // 空闲时段半价。
  const offDate = new Date('2026-08-17T05:00:00Z'); // 北京 13:00
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', offDate), { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  // 未知模型：现价表回退 flash 高峰价。
  assert.deepStrictEqual(balance.effectivePrice('unknown-model', peakDate), { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  // 空模型：按 pro 兜底（与 main.js 调用方回退一致）。
  assert.deepStrictEqual(balance.effectivePrice('', peakDate), { cacheMiss: 9, cacheHit: 0.3, output: 27 });
});

test('isPeakHour: 北京时间高峰边界', () => {
  // 北京 08:59（00:59Z）非高峰；09:00（01:00Z）起高峰。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T00:59:00Z')), false);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T01:00:00Z')), true);
  // 北京 11:59 高峰；12:00 午间低谷。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T03:59:00Z')), true);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T04:00:00Z')), false);
  // 北京 13:59 低谷；14:00 起高峰。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T05:59:00Z')), false);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T06:00:00Z')), true);
  // 北京 17:59 高峰；18:00 起空闲。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T09:59:00Z')), true);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T10:00:00Z')), false);
});

test('readActiveModel: 锚定 agent-default-model 段并剥离引号', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-test-'));
  try {
    const settings = [
      'agent-default-model:',
      '  model: deepseek-v4-pro',
      '',
      'some-plugin:',
      '  model: "should-not-be-read"',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'settings.yaml'), settings, 'utf8');
    assert.equal(balance.readActiveModel(dir), 'deepseek-v4-pro');
    // 带引号的值也要剥离引号
    fs.writeFileSync(path.join(dir, 'settings.yaml'), 'agent-default-model:\n  model: \'deepseek-v4-flash\'\n', 'utf8');
    assert.equal(balance.readActiveModel(dir), 'deepseek-v4-flash');
    // 文件缺失 → 空串
    assert.equal(balance.readActiveModel(path.join(dir, 'missing')), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('queryBalance: 无密钥时返回形态一致（ok:false + balances:[]，无 prices）', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-test-'));
  try {
    const r = await balance.queryBalance(dir);
    assert.deepStrictEqual(Object.keys(r).sort(), ['balances', 'error', 'ok']);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no-key');
    assert.deepStrictEqual(r.balances, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
  }
});
