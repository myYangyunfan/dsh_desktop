'use strict';

// 仓库元数据卫生测试（node --test）：
//   - package.json description 必须是无乱码的正确 UTF-8 中文（历史 GBK 乱码回归防线）；
//   - COMPANION_PLUGINS 清单与共享模块的一致性由 unit-patch-engine.test.js 覆盖。
// 用法：node --test scripts/test/unit-meta.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

test('package.json description 为正确 UTF-8 文案（无 GBK 乱码）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.strictEqual(typeof pkg.description, 'string');
  assert.strictEqual(
    pkg.description,
    'DeepSeek Harness (dsh) 开箱即用的 Windows 桌面客户端：内置 dsh CLI 与 Node 运行时，一键启动 Web UI',
    'description 必须与预期文案逐字一致'
  );
  // 历史 GBK 乱码特征字符（寮€/绠卞嵆鐢 等）不得出现。
  assert.ok(!/[\u5bee\u20ac\u7ba0\u4e0b\u5d86\u9432]/.test(pkg.description), '不得包含 GBK 乱码特征字符');
});

test('package.json 关键字段完整（版本/入口/私有标记）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'dsh-desktop');
  assert.strictEqual(pkg.main, 'main.js');
  assert.strictEqual(pkg.private, true);
  assert.ok(/^\d+\.\d+\.\d+$/.test(String(pkg.version)), 'version 应为 x.y.z 形式');
});
