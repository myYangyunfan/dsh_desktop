'use strict';

// profile-patch-heal.js 纯函数单元测试（node --test）。
// 用法：node --test scripts/test/unit-patch-heal.test.js
// 覆盖：注册行级去重（双缺/三同名/零修改/注释保留/块内重复/部分重复行级手术）、
//       config 覆盖与 disabled 禁用条目绝不删除、定向 insert 块不动、
//       loader 日志三种 id 形态解析、包名→patch id 映射、
//       bundle 迁移双登记移除（整块/部分行级/直注册条目/用户配置保留/零修改）。

const test = require('node:test');
const assert = require('node:assert');
const { dedupePatchEntries, dropBlocksByIds, parseFailedLoaderIds, mapPackagesToPatchIds } = require('../../profile-patch-heal');

test('dedupePatchEntries: 两个重复 insert 块 → 移除后出现的块', () => {
  const input = [
    '# 头部注释',
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '# 尾部注释',
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.ok(r.text.includes('# 头部注释'), '头部注释保留');
  assert.ok(r.text.includes('# 尾部注释'), '尾部注释保留');
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, 'balance 只剩一个');
  assert.ok(r.text.includes('id: terminal'), '其它条目保留');
  // 顺序：terminal 仍在 balance 之后、原相对顺序不变
  assert.ok(r.text.indexOf('id: balance') < r.text.indexOf('id: terminal'));
});

test('dedupePatchEntries: 无重复 → 零修改（返回原文本）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: terminal',
    "  name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.strictEqual(r.text, input);
  assert.deepStrictEqual(r.removed, []);
});

test('dedupePatchEntries: 无 id 条目与纯注释文件原样保留', () => {
  const comments = '# 只有注释\n# 没有条目\n';
  assert.strictEqual(dedupePatchEntries(comments).text, comments);
  const bare = '- insert: []\n';
  assert.strictEqual(dedupePatchEntries(bare).text, bare);
});

test('dedupePatchEntries: 三个同名块 → 只保留第一个', () => {
  const blocks = [];
  for (let i = 0; i < 3; i += 1) {
    blocks.push('- insert:', '    - id: balance', "      name: '@deepseek-ai/dsh-balance'");
  }
  const r = dedupePatchEntries(blocks.join('\n'));
  assert.deepStrictEqual(r.removed, ['balance', 'balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1);
});

test('dedupePatchEntries: insert 块部分重复 → 只删重复注册行，保留块内新注册', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, '重复注册的 balance 行只剩首次注册');
  assert.strictEqual((r.text.match(/- id: terminal/g) || []).length, 1, '新注册 terminal 保留');
  assert.ok(r.text.includes('- insert:'), '块头保留');
  assert.ok(r.text.includes("name: '@deepseek-ai/dsh-terminal-tab'"), 'terminal 的 name 保留');
});

test('dedupePatchEntries: config 覆盖与 disabled 禁用条目绝不删除（用户配置保留）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: balance',
    '  disabled: true',
    '- insert:',
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '- id: terminal',
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '无重复注册 → 零写入（config/disabled 覆盖条目原样保留）');
});

test('dedupePatchEntries: 同一 insert 块内重复注册（罕见形态）→ 行级去重', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '    - id: terminal',
    "      name: '@deepseek-ai/dsh-terminal-tab'",
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, ['balance']);
  assert.strictEqual((r.text.match(/- id: balance/g) || []).length, 1, '块内重复注册行移除');
  assert.strictEqual((r.text.match(/- id: terminal/g) || []).length, 1, 'terminal 保留');
});

test('dedupePatchEntries: 定向 insert 块（- id: X + insert:）不参与去重', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: extra-group',
    '  insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dedupePatchEntries(input);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '定向 insert 块原样保留');
});

test('parseFailedLoaderIds: 三种日志形态', () => {
  const logText = [
    'failed to apply loader entry 7ee99b10 (@deepseek-ai/dsh-balance): list slot "conversation.composer.dock" already has an entry',
    '[cause]: TypeError: duplicate loader entry id: balance',
    'failed to apply loader entry abc123 (include): something else',
  ].join('\n');
  const ids = parseFailedLoaderIds(logText);
  assert.ok(ids.includes('7ee99b10'), '旧 hash 形态保留');
  assert.ok(ids.includes('balance'), 'duplicate loader entry id 形态识别');
  assert.ok(ids.includes('@deepseek-ai/dsh-balance'), '括号包名形态识别');
  assert.ok(!ids.includes('include'), 'include 条目排除');
});

test('mapPackagesToPatchIds: 包名映射回条目 id（含重复注册场景）', () => {
  const patch = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '- id: terminal',
    "  name: '@deepseek-ai/dsh-terminal-tab'",
  ].join('\n');
  const ids = mapPackagesToPatchIds(patch, ['@deepseek-ai/dsh-balance']);
  assert.deepStrictEqual(ids, ['balance', 'balance'], '重复注册返回全部对应 id');
  assert.deepStrictEqual(mapPackagesToPatchIds(patch, ['@deepseek-ai/other']), []);
  assert.deepStrictEqual(mapPackagesToPatchIds(patch, []), []);
});

test('dropBlocksByIds: 命中 insert 块整块删除，其余条目与注释保留', () => {
  const input = [
    '# 头部注释',
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
    '# 尾部注释',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('id: better-sidebar'), '命中块已移除');
  assert.ok(r.text.includes('id: balance'), '未命中条目保留');
  assert.ok(r.text.includes('# 头部注释') && r.text.includes('# 尾部注释'), '注释保留');
});

test('dropBlocksByIds: 直接条目命中 → 连同兄弟行一起删除', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '- id: balance',
    "  name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('better-sidebar'), '直接条目已删除');
  assert.ok(r.text.includes('id: balance'), '其它条目保留');
});

test('dropBlocksByIds: insert 块部分命中 → 只删命中行与兄弟行，保留块内其它条目', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.ok(!r.text.includes('better-sidebar'), '命中行已删除');
  assert.ok(r.text.includes('- insert:'), '块头保留');
  assert.ok(r.text.includes('id: balance') && r.text.includes('@deepseek-ai/dsh-balance'), '同块其它条目原样保留');
});

test('dropBlocksByIds: 无命中 → 返回原文本（零写入）', () => {
  const input = [
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.strictEqual(r.text, input);
  assert.deepStrictEqual(r.removed, []);
  const r2 = dropBlocksByIds(input, []);
  assert.strictEqual(r2.text, input);
});

test('dropBlocksByIds: 多个命中块全部移除', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- insert:',
    '    - id: harness-pet',
    "      name: 'harness-pet'",
    '- insert:',
    '    - id: balance',
    "      name: '@deepseek-ai/dsh-balance'",
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar', 'harness-pet']);
  assert.deepStrictEqual(r.removed, ['better-sidebar', 'harness-pet']);
  assert.ok(r.text.includes('id: balance'), '未命中条目保留');
  assert.strictEqual((r.text.match(/id: balance/g) || []).length, 1);
});

test('dropBlocksByIds: config 覆盖与 disabled 禁用条目绝不删除（bundle 迁移保留用户配置）', () => {
  const input = [
    '- insert:',
    '    - id: better-sidebar',
    "      name: 'dsh-better-sidebar'",
    '- id: better-sidebar',
    '  disabled: true',
    '- id: better-sidebar',
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, ['better-sidebar']);
  assert.strictEqual((r.text.match(/- id: better-sidebar/g) || []).length, 2, 'disabled 与 config 覆盖条目保留');
  assert.ok(!r.text.includes("name: 'dsh-better-sidebar'"), '注册行（insert 块）已移除');
  assert.ok(r.text.includes('disabled: true') && r.text.includes('width: 320'), '用户配置原样保留');
});

test('dropBlocksByIds: 直注册条目带 config 时不删除（用户配置保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  config:',
    '    width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '含 config 的直条目保留');
});

test('dropBlocksByIds: 直注册条目带 disabled 时不删除（用户禁用意图保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  disabled: true',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '含 disabled 的直条目保留');
});

test('dropBlocksByIds: 直注册条目带任意自定义键时不删除（用户覆盖条目保留）', () => {
  const input = [
    '- id: better-sidebar',
    "  name: 'dsh-better-sidebar'",
    '  width: 320',
  ].join('\n');
  const r = dropBlocksByIds(input, ['better-sidebar']);
  assert.deepStrictEqual(r.removed, []);
  assert.strictEqual(r.text, input, '携带自定义键的直条目保留');
});
