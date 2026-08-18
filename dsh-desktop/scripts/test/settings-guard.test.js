'use strict';

// A-12: settings.yaml 写后校验与自动回写（settings-guard 纯函数）单元测试。
// 用法：node --test scripts/test/settings-guard.test.js
// 不依赖真 js-yaml：注入假 yaml（{(load)} 或裸函数），或不行级降级路径。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULT_REQUIRED_SECTIONS, validateSettingsYaml, guardSettingsChange } = require('../lib/settings-guard');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sguard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---------------------------------------------------------------------------
// validateSettingsYaml
// ---------------------------------------------------------------------------

test('validateSettingsYaml: yaml 对象形态通过/缺段/顶层非对象', () => {
  const objYaml = { load: (t) => JSON.parse(t) };
  assert.deepStrictEqual(validateSettingsYaml('{"agent-default-model":{"provider":"x"}}', { yaml: objYaml }), { ok: true });
  assert.deepStrictEqual(
    validateSettingsYaml('{"agent-default-model":{"provider":"x"}}', { yaml: objYaml, requiredSections: ['agent-default-model', 'llm-pi-ai'] }),
    { ok: false, missing: ['llm-pi-ai'], error: '缺少必需配置段: llm-pi-ai' }
  );
  assert.strictEqual(validateSettingsYaml('["not","obj"]', { yaml: objYaml }).ok, false, '顶层数组应失败');
  assert.strictEqual(validateSettingsYaml('null', { yaml: objYaml }).ok, false, 'null 应失败');
});

test('validateSettingsYaml: yaml 函数形态与解析抛错/空文本', () => {
  assert.deepStrictEqual(validateSettingsYaml('{"agent-default-model":{}}', { yaml: (t) => JSON.parse(t) }), { ok: true });
  const bad = validateSettingsYaml('{broken', { yaml: (t) => JSON.parse(t) });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.error.includes('YAML 解析失败'), '解析错误应带原因: ' + bad.error);
  assert.strictEqual(validateSettingsYaml('', {}).ok, false, '空文本失败');
  assert.strictEqual(validateSettingsYaml('   \n  ', { yaml: { load: (t) => ({}) } }).ok, false, '纯空白失败');
});

test('validateSettingsYaml: yaml 缺失走行级降级（必需段行存在/缺失）', () => {
  const good = 'agent-default-model:\n  provider: opencode\nllm-pi-ai:\n  x: 1\n';
  assert.deepStrictEqual(validateSettingsYaml(good, {}), { ok: true });
  const onlyModel = 'agent-default-model:\n  provider: opencode\n';
  assert.deepStrictEqual(
    validateSettingsYaml(onlyModel, { requiredSections: ['agent-default-model', 'llm-pi-ai'] }),
    { ok: false, missing: ['llm-pi-ai'], error: '缺少必需配置段: llm-pi-ai' }
  );
  assert.strictEqual(validateSettingsYaml('random: 1\n', {}).ok, false, '无必需段应失败');
});

// ---------------------------------------------------------------------------
// guardSettingsChange
// ---------------------------------------------------------------------------

test('guardSettingsChange: 校验通过时备份缓存更新、文件不动', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'settings.yaml');
  const backup = path.join(dir, 'backup.json');
  const good = 'agent-default-model:\n  provider: opencode\n';
  fs.writeFileSync(file, good);
  const r = guardSettingsChange(file, { backupFile: backup, yaml: { load: (x) => ({ 'agent-default-model': {} }) } });
  assert.deepStrictEqual(r, { ok: true, changed: false });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), good, '通过校验时文件不受影响');
  assert.strictEqual(fs.readFileSync(backup, 'utf8'), good, '应为最近通过校验的内容');
});

test('guardSettingsChange: 损坏内容从备份原子回写', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'settings.yaml');
  const backup = path.join(dir, 'backup.json');
  fs.writeFileSync(file, 'agent-default-model:\n  provider: opencode\n');
  const yaml = { load: (x) => ({ 'agent-default-model': {} }) };
  guardSettingsChange(file, { backupFile: backup, yaml }); // 通过 → 备份
  fs.writeFileSync(file, 'broken: [unclosed\n'); // 模拟坏写
  const r = guardSettingsChange(file, { backupFile: backup, yaml: { load: (x) => { throw new Error('syntax'); } } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.recovered, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'agent-default-model:\n  provider: opencode\n', '回写内容应与备份一致');
  const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.tmp'));
  assert.deepStrictEqual(leftovers, [], '回写后不得残留 tmp 文件');
});

test('guardSettingsChange: 无备份时只报告不回写', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'settings.yaml');
  const backup = path.join(dir, 'backup.json');
  fs.writeFileSync(file, 'broken: [unclosed\n');
  const r = guardSettingsChange(file, { backupFile: backup, yaml: { load: (x) => { throw new Error('syntax'); } } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.recovered, false);
  assert.ok(r.error.includes('syntax'));
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'broken: [unclosed\n', '无备份不得改动文件');
});

test('guardSettingsChange: 文件读失败返回 readError 且不动作', (t) => {
  const dir = tmpdir(t);
  const backup = path.join(dir, 'backup.json');
  const r = guardSettingsChange(path.join(dir, 'nope.yaml'), { backupFile: backup, yaml: { load: (x) => ({}) } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.changed, false);
  assert.ok(r.readError, '应带 readError');
  assert.strictEqual(r.error, undefined);
});

test('guardSettingsChange: 回写 rename 失败时报告回写失败', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'settings.yaml');
  const backup = path.join(dir, 'backup.json');
  fs.writeFileSync(file, 'agent-default-model:\n  provider: opencode\n');
  const yaml = { load: (x) => ({ 'agent-default-model': {} }) };
  guardSettingsChange(file, { backupFile: backup, yaml }); // 先存备份
  fs.writeFileSync(file, 'broken: [unclosed\n');
  // 注入假 fs：仅 renameSync 抛错（模拟目标被占用/权限拒绝），其余走真实 fs。
  const fakeFs = { ...fs, renameSync: () => { throw new Error('EPERM: locked'); } };
  const r = guardSettingsChange(file, { backupFile: backup, yaml: { load: (x) => { throw new Error('syntax'); } }, fs: fakeFs });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.recovered, false);
  assert.ok(r.error.includes('回写失败'), '应含回写失败原因: ' + r.error);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'broken: [unclosed\n', '回写失败时文件保持原样');
});

test('guardSettingsChange: 必需段自定义与线级降级路径', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'settings.yaml');
  const backup = path.join(dir, 'backup.json');
  fs.writeFileSync(file, 'agent-default-model:\n  provider: opencode\n');
  // 无 yaml → 行级：通过
  const r1 = guardSettingsChange(file, { backupFile: backup });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(fs.readFileSync(backup, 'utf8'), 'agent-default-model:\n  provider: opencode\n');
  // 行级缺段
  fs.writeFileSync(file, 'other: 1\n');
  const r2 = guardSettingsChange(file, { backupFile: backup });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.changed, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'agent-default-model:\n  provider: opencode\n', '行级失败同样回写');
});

test('settings-guard: DEFAULT_REQUIRED_SECTIONS 常量', () => {
  assert.deepStrictEqual(DEFAULT_REQUIRED_SECTIONS, ['agent-default-model']);
});