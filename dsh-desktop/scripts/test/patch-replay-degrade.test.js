'use strict';

// A-4 replay 降级补丁测试（node --test）：
//   - transformReplayDegrade 合成锚点/幂等/失配；
//   - 真实 vendored 文件可补丁（只测纯函数，不落盘）；
//   - replayCopyFiles 三副本路径约定。
// 用法：node --test scripts/test/patch-replay-degrade.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  REPLAY_PKG_REL, REPLAY_MARKER, REPLAY_ANCHOR_OLD, REPLAY_PATCHED,
  transformReplayDegrade, replayCopyFiles,
} = require('../patch-replay-degrade');

const repoRoot = path.resolve(__dirname, '..', '..');

function fakeSrc() {
  return 'function toPiAssistant(message) {\n' +
    '\tconst source = message.source;\n' +
    '\t' + REPLAY_ANCHOR_OLD.trim() + '\n' +
    '}\n' +
    'other();\n';
}

test('replay-degrade: 合成锚点替换为 marker+try/catch，其余字节保留', () => {
  const out = transformReplayDegrade(fakeSrc(), 'C:\\x\\index.js');
  assert.strictEqual(out.status, 'changed');
  assert.ok(out.src.includes(REPLAY_MARKER), '应写入幂等标记');
  assert.ok(out.src.includes('try {'), '应包裹 try');
  assert.ok(out.src.includes('err.code === "INVALID_REPLAY_STATE"'), '应仅对 INVALID_REPLAY_STATE 降级');
  assert.ok(out.src.includes('return foreignAssistant(message);'), '降级路径应回落 foreignAssistant');
  assert.ok(out.src.includes('throw err;'), '其它错误应照常上抛');
  assert.ok(!out.src.includes(REPLAY_ANCHOR_OLD), '旧 return 行不得残留');
  assert.ok(out.src.includes('const source = message.source;'), '函数其余部分原样保留');
  assert.ok(out.src.includes('other();'), '锚点后代码原样保留');
  assert.ok(out.src.indexOf('function toPiAssistant') < out.src.indexOf(REPLAY_MARKER), '标记位于函数体内');
});

test('replay-degrade: 二次应用幂等（already）', () => {
  const once = transformReplayDegrade(fakeSrc(), 'C:\\x\\index.js');
  assert.strictEqual(once.status, 'changed');
  assert.deepStrictEqual(transformReplayDegrade(once.src, 'C:\\x\\index.js'), { status: 'already' });
});

test('replay-degrade: 锚点缺失跳过且不改写', () => {
  const src = 'export const x = 1;\n';
  assert.deepStrictEqual(transformReplayDegrade(src, 'C:\\x\\index.js'), {
    status: 'anchor-missing',
    detail: '未找到 toPiAssistant replay 锚点（版本可能已变更），跳过 C:\\x\\index.js',
  });
});

test('replay-degrade: 真实 vendored 文件可补丁且幂等（纯函数，不落盘）', () => {
  const file = path.join(repoRoot, 'node_modules', REPLAY_PKG_REL);
  assert.ok(fs.existsSync(file), '真实文件应存在: ' + file);
  const src0 = fs.readFileSync(file, 'utf8');
  // 安装版可能已被本补丁打过：先精确还原为上游形态再验证变换本身。
  const src = src0.includes(REPLAY_MARKER) ? src0.replace(REPLAY_PATCHED, REPLAY_ANCHOR_OLD) : src0;
  assert.ok(!src.includes(REPLAY_MARKER), '还原失败：真实副本含补丁但无法还原为上游形态');
  const out = transformReplayDegrade(src, file);
  assert.strictEqual(out.status, 'changed', '上游官方文件应可补丁');
  assert.ok(out.src.includes(REPLAY_MARKER));
  assert.ok(!out.src.includes(REPLAY_ANCHOR_OLD));
  // 幂等
  assert.deepStrictEqual(transformReplayDegrade(out.src, file), { status: 'already' });
});

test('replay-degrade: 三副本路径约定（profile fallback → 内置 → overlay agent）', () => {
  const files = replayCopyFiles('C:\\home', 'C:\\app', 'C:\\ud');
  assert.deepStrictEqual(files, [
    path.join('C:\\home', 'profiles', 'node_modules', REPLAY_PKG_REL),
    path.join('C:\\app', 'node_modules', REPLAY_PKG_REL),
    path.join('C:\\ud', 'agent', 'node_modules', REPLAY_PKG_REL),
  ]);
  assert.strictEqual(new Set(files).size, files.length, '候选路径不得重复');
  assert.strictEqual(REPLAY_PKG_REL, path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js'));
  assert.ok(REPLAY_PATCHED.includes('INVALID_REPLAY_STATE'), '产物常量含降级判定');
});
