'use strict';

// A-9 内存观测环形写测试（node --test）：
// 追加/环形截断/损坏容错/不可序列化/目录缺失。
// 用法：node --test scripts/test/memory-observe.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MEMORY_WATCH_MAX_LINES, ringAppendJsonl } = require('../lib/memory-observe');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-obs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('memory-observe: 追加新行并保持 JSONL 合法', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'samples.jsonl');
  ringAppendJsonl(file, { at: 't1', mainRssMB: 100 }, {}, fs);
  ringAppendJsonl(file, { at: 't2', mainRssMB: 120 }, {}, fs);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(JSON.parse(lines[0]), { at: 't1', mainRssMB: 100 });
  assert.deepStrictEqual(JSON.parse(lines[1]), { at: 't2', mainRssMB: 120 });
});

test('memory-observe: 超限环形截断——只保留尾部 maxLines', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'samples.jsonl');
  for (let i = 0; i < 10; i++) {
    ringAppendJsonl(file, { n: i }, { maxLines: 5 }, fs);
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 5);
  assert.deepStrictEqual(JSON.parse(lines[0]), { n: 5 }, '最旧 5 行被丢弃');
  assert.deepStrictEqual(JSON.parse(lines[4]), { n: 9 }, '最新行保留在尾部');
});

test('memory-observe: 损坏文件容错——从新行重新开始', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'samples.jsonl');
  fs.writeFileSync(file, '{broken json\nnot json at all\n');
  const ok = ringAppendJsonl(file, { n: 1 }, {}, fs);
  assert.strictEqual(ok, true);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(JSON.parse(lines[0]), { n: 1 });
});

test('memory-observe: 不可序列化行被丢弃且不影响已有内容', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'samples.jsonl');
  ringAppendJsonl(file, { ok: 1 }, {}, fs);
  const cyclic = {};
  cyclic.self = cyclic;
  const ok = ringAppendJsonl(file, cyclic, {}, fs);
  assert.strictEqual(ok, false);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
});

test('memory-observe: 目录缺失返回 false 不抛异常', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'no-such-dir', 'samples.jsonl');
  const ok = ringAppendJsonl(file, { n: 1 }, {}, fs);
  assert.strictEqual(ok, false);
});

test('memory-observe: 默认行上限常量 2000', () => {
  assert.strictEqual(MEMORY_WATCH_MAX_LINES, 2000);
});