'use strict';

/* 价目表模型键解析回归测试（「本轮费用算错」的根因守卫）。
   缺陷一（主因）：内核真实模型 id 是 `deepseek-flash`（dsh-llm-deepseek 的
   DEFAULT_MODELS 下发），而价目表键曾只有 deepseek-v4-flash 一族——精确查表未命中
   即落回 DEFAULT_MODEL(pro)，命中价 0.3 是官方 flash 档 0.04 的 7.5 倍。
   缺陷二：官方/聚合渠道常下发带日期或版本后缀的变体名（deepseek-v4-pro-0813 /
   deepseek-v4-flash-250610 / deepseek-chat-V3），未命中同样落回 pro → flash 变体
   按 pro 计价，空闲档 4.5/0.15/13.5 对应有的 1/0.02/4，高估 4.5 倍。
   同时锁住一条不能被改坏的老行为：真正未知的模型名仍回退 pro 最高档（宁可多报不少报）。 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { pricingKeyOf, effectivePrice } = require(path.join(
  __dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'balance-core.js'));

// 固定时刻：一个高峰、一个空闲（北京时区口径由 balance-core.js 内部判定）
const PEAK = new Date('2026-09-11T03:00:00Z');     // 北京 11:00 → 高峰窗口
const OFF = new Date('2026-09-12T22:00:00Z');      // 北京周六 06:00 → 周末全天空闲

test('规范键精确命中，不被改写', () => {
  for (const m of ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner']) {
    assert.equal(pricingKeyOf(m), m);
  }
});

test('带日期/版本后缀的变体名归回其本档（回归锁）', () => {
  assert.equal(pricingKeyOf('deepseek-v4-flash-0813'), 'deepseek-v4-flash');
  assert.equal(pricingKeyOf('deepseek-v4-flash-250610'), 'deepseek-v4-flash');
  assert.equal(pricingKeyOf('deepseek-v4-pro-0813'), 'deepseek-v4-pro');
  assert.equal(pricingKeyOf('deepseek-chat-V3'), 'deepseek-chat');
  assert.equal(pricingKeyOf('deepseek-reasoner-2026-08-01'), 'deepseek-reasoner');
});

test('flash 变体的价目必须等于 flash、且明显低于 pro（高估 4.5 倍的回归锁）', () => {
  const flash = effectivePrice('deepseek-v4-flash', PEAK);
  const flashVar = effectivePrice('deepseek-v4-flash-0813', PEAK);
  const pro = effectivePrice('deepseek-v4-pro', PEAK);
  assert.deepEqual(flashVar, flash, 'flash 变体必须与 flash 同价，不得落回 pro');
  assert.notDeepEqual(flashVar, pro, 'flash 变体被按 pro 计价 → 就是本次的缺陷');
  assert.equal(pro.cacheMiss / flash.cacheMiss, 4.5, '两档差价应为 4.5 倍（本用例的前提：pro 9 / flash 2）');
  // 空闲档同样不得错档
  assert.deepEqual(effectivePrice('deepseek-v4-flash-0813', OFF), effectivePrice('deepseek-v4-flash', OFF));
});

test('内核真实模型 id `deepseek-flash` 命中 flash 档（0.1.3 根因回归锁）', () => {
  assert.equal(pricingKeyOf('deepseek-flash'), 'deepseek-flash', '真实 id 必须在价目表内有键，不得保持原值落回 pro');
  const real = effectivePrice('deepseek-flash', PEAK);
  assert.deepEqual(real, effectivePrice('deepseek-v4-flash', PEAK), 'deepseek-flash 必须与 flash 同价');
  assert.notDeepEqual(real, effectivePrice('deepseek-v4-pro', PEAK), '被按 pro 计价 → 就是本次的缺陷');
  assert.deepEqual(real, { cacheMiss: 2, cacheHit: 0.04, output: 8 }, '官方高峰价：命中 0.04 / 未命中 2 / 输出 8');
  // 带后缀变体同样归回真实 id 档；空闲档半价；旧版期取镜像旧价（不得跳 pro 旧价）
  assert.equal(pricingKeyOf('deepseek-flash-250610'), 'deepseek-flash');
  assert.deepEqual(effectivePrice('deepseek-flash', OFF), { cacheMiss: 1, cacheHit: 0.02, output: 4 });
  assert.deepEqual(effectivePrice('deepseek-flash', new Date('2026-08-16T15:59:59Z')), { cacheMiss: 1, cacheHit: 0.02, output: 2 });
});

test('未知模型仍回退 pro 最高档（这条老行为不能被改坏）', () => {
  assert.equal(pricingKeyOf('gpt-9-turbo'), 'gpt-9-turbo', '未知名保留原值（查表时自然回退）');
  assert.deepEqual(effectivePrice('gpt-9-turbo', PEAK), effectivePrice('deepseek-v4-pro', PEAK),
    '未知模型必须按最高档估算，避免少报费用');
  assert.equal(pricingKeyOf(''), 'deepseek-v4-pro', '空模型名回退 DEFAULT_MODEL');
});

test('最长前缀优先：不得把 chat 误归到更短的键', () => {
  // deepseek-chat 与 deepseek-reasoner 无前缀包含关系，但大小写/后缀混合要稳
  assert.equal(pricingKeyOf('DeepSeek-Chat-0712'), 'deepseek-chat');
  assert.equal(pricingKeyOf('deepseek-reasoner-v2'), 'deepseek-reasoner');
  // 真实 id 与 v4 前缀键并存时，各自归位（deepseek-v4-flash-* 不得被 deepseek-flash 抢走）
  assert.equal(pricingKeyOf('DeepSeek-Flash-0712'), 'deepseek-flash');
  assert.equal(pricingKeyOf('deepseek-v4-flash-x9'), 'deepseek-v4-flash');
});
