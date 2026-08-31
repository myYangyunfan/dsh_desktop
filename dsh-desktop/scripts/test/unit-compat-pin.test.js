'use strict';

// unit-compat-pin.test.js — 兼容层 kernel-pin 校验器单测（M1 骨架）。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validatePin, validateVendorDir, loadPin } = require('../compat/validate-pin.js');

const ROOT = path.resolve(__dirname, '..', '..');

function validPin() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'compat', 'kernel-pin.json'), 'utf8'));
}

test('kernel-pin 清单本身通过校验（自洽）', () => {
  const { pin } = loadPin(ROOT);
  assert.deepEqual(validatePin(pin), [], '当前清单必须自洽（否则兼容层 M1 骨架即坏）');
});

test('validatePin：结构/语义非法逐项报错', () => {
  const e1 = validatePin(null);
  assert.ok(e1.length > 0 && /不是对象/.test(e1[0]));
  const e2 = validatePin({ kernel: { tag: 'not-official', packageVersion: 'x', acquisition: 'floating' }, services: { required: [] } });
  assert.ok(e2.some((m) => /dsh-v\*/.test(m)), 'tag 形态校验');
  assert.ok(e2.some((m) => /packageVersion/.test(m)));
  assert.ok(e2.some((m) => /acquisition 非法/.test(m)));
  assert.ok(e2.some((m) => /精确 pin/.test(m)), 'pinPolicy 禁止浮动');
  assert.ok(e2.some((m) => /required 缺失或为空/.test(m)));
});

test('validatePin：required 条目 id 唯一 + module 必须 @deepseek-ai 包', () => {
  const p = validPin();
  p.services.required.push({ id: 'credentials', module: '@deepseek-ai/dsh-credentials-local' });
  const e = validatePin(p);
  assert.ok(e.some((m) => /id 重复: credentials/.test(m)));
  const q = validPin();
  q.services.required.push({ id: 'x', module: 'not-deepseek/pkg' });
  const e2 = validatePin(q);
  assert.ok(e2.some((m) => /非 @deepseek-ai 包/.test(m)));
});

test('validatePin：removed 与 required 互斥', () => {
  const p = validPin();
  p.services.removed.push({ id: p.services.required[0].id, reason: 'x' });
  const e = validatePin(p);
  assert.ok(e.some((m) => /自相矛盾/.test(m)));
});

test('validateVendorDir：版本混装防线', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-pin-'));
  const p = JSON.parse(JSON.stringify(validPin()));
  p.kernel.vendorDir = dir;
  // 空目录 → 报无 tarball
  let e = validateVendorDir(ROOT, p);
  assert.ok(e.some((m) => /无 tarball/.test(m)));
  // 版本不符的 tarball → 混装拒绝
  fs.writeFileSync(path.join(dir, 'deepseek-ai-dsh-0.1.2-alpha.1.tgz'), 'x');
  fs.writeFileSync(path.join(dir, 'deepseek-ai-dsh-0.0.9-ancient.tgz'), 'x');
  e = validateVendorDir(ROOT, p);
  assert.ok(e.some((m) => /版本混装防线/.test(m)), `混装须报错: ${JSON.stringify(e)}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadPin：pin 文件缺失报 fs 错（fail-closed）', () => {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-pin-missing-'));
  assert.throws(() => loadPin(fakeRoot));
  fs.rmSync(fakeRoot, { recursive: true, force: true });
});
