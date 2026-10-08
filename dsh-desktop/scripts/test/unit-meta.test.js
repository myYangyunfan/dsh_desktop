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
  // Electron 壳退役（ee7e420）后不再有 main.js 入口；main 字段移除即正确形态，
  // 残留反而会误导按入口找 Electron 壳的工具链。dsh-desktop 现作为共享库被
  // Tauri 线（dsh-tauri）与 CLI（sync-companion-plugins）消费。
  assert.strictEqual(pkg.main, undefined, 'Electron main 入口应已移除');
  assert.strictEqual(pkg.private, true);
  assert.ok(/^\d+\.\d+\.\d+$/.test(String(pkg.version)), 'version 应为 x.y.z 形式');
});

test('workspace-anchor 插件按预期注册工作区锚点', () => {
  const anchor = fs.readFileSync(path.join(repoRoot, 'assets', 'plugins', 'dsh-workspace-anchor', 'lib', 'index.js'), 'utf8');
  assert.ok(anchor.includes('name: "dsh:workspace-anchor"'), '插件应注册 dsh:workspace-anchor 节');
  assert.ok(anchor.includes('order: 1'), '锚点应紧跟 persona（order 1）');
  assert.ok(anchor.includes('Workspace: {{cwd}}.'), '锚点应渲染会话 cwd');
  assert.ok(anchor.includes('reference material, not a new project root'), '锚点应包含「搜索命中不是新项目根」规则');
  // 另一半（6 个 complete-persona 预设的 persona 文本里写同一锚点）随 v1.0.0
  // 随包预设退役一并撤除——assets/agent-presets 已不在仓库里。
});
