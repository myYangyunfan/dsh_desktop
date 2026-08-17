'use strict';
// 单元测试：scripts/plugin-manager-patch.js（cordis.patch.yml 用户层 disabled 开关）
const test = require('node:test');
const assert = require('node:assert/strict');
const { togglePluginInPatch, setPluginRemoved } = require('../plugin-manager-patch');

const FIXTURE = [
  '# dsh web profile patch（由 DSH Desktop 维护）',
  '- insert:',
  '    - id: balance',
  "      name: '@deepseek-ai/dsh-balance'",
  '- insert:',
  '    - id: terminal',
  "      name: '@deepseek-ai/dsh-terminal-tab'",
  '- id: llm-deepseek',
  "  name: '@deepseek-ai/dsh-llm-deepseek'",
  '  disabled: true',
  '- id: web',
  "  name: '@deepseek-ai/dsh-web'",
  '  config:',
  '    searchProvider: opencode-mcp',
  '',
].join('\n');

function countId(text, id) {
  return (text.match(new RegExp('- id: ' + id + '\\b', 'g')) || []).length;
}

test('禁用：文件中不存在该 id 时追加顶层 disabled 条目', () => {
  const out = togglePluginInPatch(FIXTURE, 'vision', false, '@dsh-external/dsh-vision');
  assert.equal(countId(out, 'vision'), 1);
  assert.match(out, /- id: vision\s*\n\s*name: '@dsh-external\/dsh-vision'\s*\n\s*disabled: true/);
  // 既有内容与注释不受影响
  assert.ok(out.includes('# dsh web profile patch（由 DSH Desktop 维护）'));
  assert.ok(out.includes('- id: web'));
});

test('禁用：id 在 insert 块内时移出并保证只登记一处', () => {
  const out = togglePluginInPatch(FIXTURE, 'terminal', false, '@deepseek-ai/dsh-terminal-tab');
  assert.ok(!out.includes('    - id: terminal'), '应已从 insert 块移除');
  assert.equal(countId(out, 'terminal'), 1, '全文件只保留一个登记点');
  assert.match(out, /- id: terminal\s*\n\s*name: '@deepseek-ai\/dsh-terminal-tab'\s*\n\s*disabled: true/);
  // 同块其它条目与孤立空块清理
  assert.ok(out.includes('    - id: balance'));
  assert.ok(!out.includes('- insert:\n\n'), '被掏空的 insert 块应被清理');
});

test('禁用：顶层条目已存在（无 disabled 行）时就地补行', () => {
  const noDisabled = FIXTURE.replace('  disabled: true\n', '');
  const out = togglePluginInPatch(noDisabled, 'llm-deepseek', false);
  assert.ok(out.includes('  disabled: true'));
  assert.equal((out.match(/disabled\s*:/g) || []).length, 1);
});

test('禁用：已禁用条目幂等（重复调用结果一致）', () => {
  const once = togglePluginInPatch(FIXTURE, 'terminal', false, '@deepseek-ai/dsh-terminal-tab');
  const twice = togglePluginInPatch(once, 'terminal', false, '@deepseek-ai/dsh-terminal-tab');
  assert.equal(once, twice);
});

test('启用：无 config 的顶层条目整个移除', () => {
  const disabled = togglePluginInPatch(FIXTURE, 'vision', false, '@dsh-external/dsh-vision');
  const out = togglePluginInPatch(disabled, 'vision', true, '@dsh-external/dsh-vision');
  assert.equal(countId(out, 'vision'), 0);
  assert.ok(!out.includes("name: '@dsh-external/dsh-vision'"), 'vision 条目已不存在');
});

test('启用：带 config 的条目只移除 disabled 行，config 保留', () => {
  const withDisabledConfig = FIXTURE.replace('  config:\n', '  disabled: true\n  config:\n');
  const out = togglePluginInPatch(withDisabledConfig, 'web', true);
  assert.ok(out.includes('- id: web'));
  assert.ok(out.includes('  config:'));
  assert.ok(out.includes('    searchProvider: opencode-mcp'));
  // web 条目自己的 disabled 行被移除；llm-deepseek 的 disabled 保留
  assert.ok(!out.includes("name: '@deepseek-ai/dsh-web'\n  disabled: true"));
  assert.ok(out.includes("name: '@deepseek-ai/dsh-llm-deepseek'\n  disabled: true"));
});

test('往返：禁用→启用后文件回到无该条目状态（等待启动同步重新 insert）', () => {
  const disabled = togglePluginInPatch(FIXTURE, 'terminal', false, '@deepseek-ai/dsh-terminal-tab');
  const enabled = togglePluginInPatch(disabled, 'terminal', true, '@deepseek-ai/dsh-terminal-tab');
  assert.equal(countId(enabled, 'terminal'), 0);
});

test('开关其它插件不影响 web 的 config 块', () => {
  const out = togglePluginInPatch(FIXTURE, 'balance', false, '@deepseek-ai/dsh-balance');
  assert.ok(out.includes('searchProvider: opencode-mcp'));
  assert.ok(out.includes('- id: web'));
  assert.ok(out.includes('config:'));
});

test('顶层条目只有 id 行（无 name）时也能补 disabled', () => {
  const bare = '# dsh web profile patch\n- id: mystery\n';
  const out = togglePluginInPatch(bare, 'mystery', false);
  assert.ok(out.includes('disabled: true'));
  assert.equal(countId(out, 'mystery'), 1);
});

test('防注入：包名含单引号时按 YAML 转义（加倍），不破坏文件', () => {
  const out = togglePluginInPatch(FIXTURE, 'quoted', false, "weird'name");
  assert.ok(out.includes("name: 'weird''name'"), '单引号应加倍转义');
  assert.ok(!out.includes("name: 'weird'name'"), '不得出现未转义的单引号串');
  assert.equal(countId(out, 'quoted'), 1);
});

test('防注入：非法 id（含空白/冒号）直接拒绝', () => {
  assert.throws(() => togglePluginInPatch(FIXTURE, 'bad id', false), TypeError);
  assert.throws(() => togglePluginInPatch(FIXTURE, 'a:b', false), TypeError);
  assert.throws(() => togglePluginInPatch(FIXTURE, 'a\nb', false), TypeError);
});

test('启用：config 块内更深缩进的 disabled 键不受影响', () => {
  const nested = [
    '# dsh web profile patch',
    '- id: gizmo',
    "  name: '@scope/gizmo'",
    '  disabled: true',
    '  config:',
    '    disabled: false',
    '    searchProvider: opencode-mcp',
    '',
  ].join('\n');
  const out = togglePluginInPatch(nested, 'gizmo', true);
  assert.ok(!out.includes("name: '@scope/gizmo'\n  disabled: true"), '条目自己的 disabled 行已移除');
  assert.ok(out.includes('    disabled: false'), 'config 内嵌 disabled 键必须保留');
  assert.ok(out.includes('searchProvider: opencode-mcp'));
});

function commentCount(text, id) {
  return (text.match(new RegExp('# [^\\n]*关闭 ' + id + '\\b', 'g')) || []).length;
}

test('注释不堆积：禁用→启用→禁用→启用，标记注释始终至多一条', () => {
  let t = FIXTURE;
  t = togglePluginInPatch(t, 'balance', false, '@deepseek-ai/dsh-balance');
  t = togglePluginInPatch(t, 'balance', true, '@deepseek-ai/dsh-balance');
  t = togglePluginInPatch(t, 'balance', false, '@deepseek-ai/dsh-balance');
  assert.equal(commentCount(t, 'balance'), 1, '禁用后恰一条注释');
  t = togglePluginInPatch(t, 'balance', true, '@deepseek-ai/dsh-balance');
  assert.equal(commentCount(t, 'balance'), 0, '启用后注释清空');
  assert.equal(countId(t, 'balance'), 0, '启用后条目移除（等待启动同步重新 insert）');
});

test('自愈：历史遗留的多条重复注释在下次禁用时收敛为一条', () => {
  const messy = FIXTURE + [
    '# 插件管理（设置页「插件」栏）：关闭 balance',
    '# 插件管理（设置页「插件」栏）：关闭 balance',
    '# 插件管理（设置页「插件」栏）：关闭 balance',
    '# 插件管理（设置页「插件」栏）：关闭 balance',
    '',
  ].join('\n');
  const out = togglePluginInPatch(messy, 'balance', false, '@deepseek-ai/dsh-balance');
  assert.equal(commentCount(out, 'balance'), 1, '四条历史注释收敛为一条');
  assert.equal(countId(out, 'balance'), 1, '且只有一份条目');
});

// --- 卸载/恢复 --------------------------------------------------------------

function removedCount(text) {
  return (text.match(/removed\s*:\s*true/g) || []).length;
}

test('卸载：insert 块条目移出，顶层条目带 disabled + removed 标记', () => {
  const out = setPluginRemoved(FIXTURE, 'terminal', true, '@deepseek-ai/dsh-terminal-tab');
  assert.ok(!out.includes('    - id: terminal'), '应已从 insert 块移除');
  assert.equal(countId(out, 'terminal'), 1, '全文件只保留一个登记点');
  assert.equal(removedCount(out), 1, '恰好一个 removed: true');
  assert.match(out, /- id: terminal[\s\S]*disabled: true[\s\S]*removed: true/);
  assert.ok(!out.includes('- insert:\n\n'), '被掏空的 insert 块应被清理');
});

test('卸载：重复卸载幂等', () => {
  const once = setPluginRemoved(FIXTURE, 'balance', true, '@deepseek-ai/dsh-balance');
  const twice = setPluginRemoved(once, 'balance', true, '@deepseek-ai/dsh-balance');
  assert.equal(once, twice);
});

test('恢复：移除 removed/disabled，无 config 条目整体消失（等待启动同步恢复）', () => {
  const removed = setPluginRemoved(FIXTURE, 'terminal', true, '@deepseek-ai/dsh-terminal-tab');
  const out = setPluginRemoved(removed, 'terminal', false);
  assert.equal(countId(out, 'terminal'), 0, '条目已移除');
  assert.equal(removedCount(out), 0, 'removed 标记已清');
});

test('恢复：带 config 的条目只清标记，config 保留', () => {
  const withConfig = FIXTURE.replace('  config:\n', '  removed: true\n  disabled: true\n  config:\n');
  const out = setPluginRemoved(withConfig, 'web', false);
  assert.ok(out.includes('- id: web'));
  assert.ok(out.includes('  config:'));
  assert.ok(out.includes('    searchProvider: opencode-mcp'));
  assert.equal(removedCount(out), 0, 'removed 行已移除');
  assert.ok(!out.includes("name: '@deepseek-ai/dsh-web'\n  disabled: true"), 'disabled 行已移除');
});

test('卸载→恢复→卸载 往返不堆积注释', () => {
  let t = FIXTURE;
  t = setPluginRemoved(t, 'balance', true, '@deepseek-ai/dsh-balance');
  t = setPluginRemoved(t, 'balance', false);
  t = setPluginRemoved(t, 'balance', true, '@deepseek-ai/dsh-balance');
  assert.equal(commentCount(t, 'balance'), 0, '卸载注释');
  assert.ok((t.match(/卸载 balance/g) || []).length <= 1, '卸载注释至多一条');
  assert.equal(countId(t, 'balance'), 1);
  assert.equal(removedCount(t), 1);
});

// #66：insert 同块兄弟条目不得被贪婪续行组吞掉（issue #66）
test('#66 禁用：同 insert 块的兄弟条目保留（续行组不吞兄弟）', () => {
  const text = [
    '- insert:',
    '    - id: terminal',
    '      name: terminal',
    '    - id: file-changes',
    '      name: file-changes',
    '',
  ].join('\n');
  const out = togglePluginInPatch(text, 'terminal', false);
  assert.ok(out.includes('    - id: file-changes'), '兄弟条目 file-changes 必须保留');
  assert.ok(!out.includes('    - id: terminal'), '目标条目已从 insert 块移除');
  assert.match(out, /- id: terminal\s*\n\s*name: '?terminal'?\s*\n\s*disabled: true/);
});

test('#66 禁用：目标条目在块中间时前后兄弟都保留', () => {
  const text = [
    '- insert:',
    '    - id: a',
    '      name: a',
    '    - id: terminal',
    '      name: terminal',
    '    - id: c',
    '      name: c',
    '',
  ].join('\n');
  const out = togglePluginInPatch(text, 'terminal', false);
  assert.ok(out.includes('    - id: a'), '前置兄弟 a 保留');
  assert.ok(out.includes('    - id: c'), '后置兄弟 c 保留');
  assert.ok(!out.includes('    - id: terminal'), '目标条目已移除');
});

test('#66 禁用：id 前缀不误删（terminal 不匹配 terminal-tab）', () => {
  const text = [
    '- insert:',
    '    - id: terminal-tab',
    '      name: terminal-tab',
    '',
  ].join('\n');
  const out = togglePluginInPatch(text, 'terminal', false);
  assert.ok(out.includes('    - id: terminal-tab'), 'terminal-tab 不得被 terminal 误删');
  assert.match(out, /- id: terminal\s*\n/, '无现成条目时按预期追加顶层条目');
});

test('#66 卸载：同 insert 块的兄弟条目保留', () => {
  const text = [
    '- insert:',
    '    - id: terminal',
    '      name: terminal',
    '    - id: file-changes',
    '      name: file-changes',
    '',
  ].join('\n');
  const out = setPluginRemoved(text, 'terminal', true);
  assert.ok(out.includes('    - id: file-changes'), '卸载时兄弟条目 file-changes 必须保留');
  assert.equal(removedCount(out), 1);
});
