'use strict';

// A-13: require 完整性校验单元测试。
// 用法：node --test scripts/test/require-integrity.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectRelativeRequires, requireTargetExists, integrityCheck } = require('../lib/require-integrity');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-reqint-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('collectRelativeRequires: 相对 require 收集（单双引号，忽略非相对）', () => {
  const src = [
    "const a = require('./scripts/x');",
    'const b = require("../shared/y.js");',
    "const c = require('js-yaml');",          // 非相对：忽略
    "const d = require(`./tpl/${x}`);",       // 模板字符串：忽略（运行时动态）
    'const e = require("./no-ext");',
    "const f = require('./sub');",
  ].join('\n');
  assert.deepStrictEqual(collectRelativeRequires(src), [
    './scripts/x', '../shared/y.js', './no-ext', './sub',
  ]);
});

test('requireTargetExists: 裸路径/+.js/index.js/package.json 四态', (t) => {
  const dir = tmpdir(t);
  fs.writeFileSync(path.join(dir, 'a.js'), '');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'index.js'), '');
  fs.mkdirSync(path.join(dir, 'pkg'));
  fs.writeFileSync(path.join(dir, 'pkg', 'package.json'), '{}');
  assert.strictEqual(requireTargetExists(dir, './a.js'), true, '裸路径');
  assert.strictEqual(requireTargetExists(dir, './a'), true, '补 .js');
  assert.strictEqual(requireTargetExists(dir, './sub'), true, '目录 index.js');
  assert.strictEqual(requireTargetExists(dir, './pkg'), true, '目录 package.json');
  assert.strictEqual(requireTargetExists(dir, './nope'), false);
  assert.strictEqual(requireTargetExists(dir, '../up'), false);
});

test('integrityCheck: 全通过时 checked 计数、missing 为空', (t) => {
  const dir = tmpdir(t);
  fs.writeFileSync(path.join(dir, 'main.js'), [
    "const { applyPatchToFiles } = require('./scripts/lib/patch-engine');",
    "const updater = require('./updater');",
    "const z = require('node:fs');",
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'updater.js'), "module.exports = {};\n");
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts', 'lib', 'patch-engine.js'), "module.exports = {};\n");
  fs.writeFileSync(path.join(dir, 'scripts', 'boot-bench.js'), "const x = require('./lib/roots-index');\n");
  fs.writeFileSync(path.join(dir, 'scripts', 'lib', 'roots-index.js'), "module.exports = {};\n");
  const r = integrityCheck(dir);
  assert.deepStrictEqual(r.missing, []);
  assert.ok(r.checked.some((c) => c.replace(/^[\\/]/, '') === 'main.js'), 'main.js 应被检查: ' + r.checked.join(' | '));
  assert.ok(r.checked.length >= 4, '应检查 main/preload 存在项 + scripts 全部 js: ' + r.checked.length);
});

test('integrityCheck: 缺失 require 报出「文件 → 相对路径」', (t) => {
  const dir = tmpdir(t);
  fs.writeFileSync(path.join(dir, 'main.js'),
    "const a = require('./scripts/patch-open-project-dir');\nconst b = require('./updater');\n");
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  const r = integrityCheck(dir);
  assert.strictEqual(r.missing.length, 2, '两处缺失都应报出');
  assert.ok(r.missing.some((m) => m.includes('patch-open-project-dir')), r.missing.join(' | '));
  assert.ok(r.missing.some((m) => m.includes('updater')), r.missing.join(' | '));
});

test('integrityCheck: 读取失败的文件静默跳过（不误报）', (t) => {
  const dir = tmpdir(t);
  fs.writeFileSync(path.join(dir, 'main.js'), "require('./scripts/x');\n");
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  if (process.platform !== 'win32') fs.chmodSync(path.join(dir, 'main.js'), 0o000); // win 无读权限可绕过
  const r = integrityCheck(dir);
  assert.ok(Array.isArray(r.missing));
  assert.ok(Array.isArray(r.checked));
});