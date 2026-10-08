'use strict';

// patch-surgery 深测：开关/卸载文本手术的翻转与幂等、EOL、无尾换行、点号/引号、
// 行级解析契约、去重/块移除/配套注册/隔离默认禁用/自愈工具。纯文本，零文件系统
// （bundlePatchEntryIds / collectBundleEntryIds 除外）。
//
// 夹具身份（2026-10 调整）：历史上这些通用手术面拿 harness-pet 当样本名、并用
// PET_DISABLE_BLOCK 验默认禁用块；harness-pet 已在 v1.0.0 退役、该常量随之下线，
// 样本换成仍随清单分发的 better-sidebar（id `better-sidebar` / 包 `dsh-better-sidebar`），
// 禁用块改锚到仍存在的 ACP_SELF_DISABLE_BLOCK（compaction-acp 自身禁用）。
// 断言语义一条没动，只换名字与块。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PATCH_HEADER, ACP_DISABLE_BLOCK, ACP_SELF_DISABLE_BLOCK,
  parsePatchRows, patchRowIds, togglePluginInPatch, setPluginRemoved,
  dedupePatchEntries, dropBlocksByIds, topLevelBlocks, ensurePatchArray,
  configLinesFor, normalizeRowConfigIndent, healSoulMdPatchRow, healRowConfig,
  bundlePatchEntryIds, collectBundleEntryIds, removeBundledRowDuplicates,
  healPatchListSyntax, removedPluginIdsFromPatch, removeLegacyMarketplacePatchLines,
  ensureDisabledPatchEntry, registerCompanionPatchEntries,
  needsYamlScalarQuote, quotePatchScalarValues, yamlQuoteIfNeeded,
} = require('../plugin-core/lib/patch-surgery');

// ── 1. togglePluginInPatch ─────────────────────────────────────────────────

test('toggle: 关闭时 disabled:false 翻转为 true（修复锚定）', () => {
  const out = togglePluginInPatch("- id: x\n  name: 'p'\n  disabled:false\n", 'x', false, 'p');
  assert.match(out, /disabled:true/);
  assert.ok(!/disabled\s*:\s*false/.test(out));
});

test('toggle: 关闭时 `disabled: false`（冒号后含空格）也翻转为 true（修复锚定）', () => {
  const out = togglePluginInPatch("- id: x\n  name: 'p'\n  disabled: false\n", 'x', false, 'p');
  assert.match(out, /disabled:\s*true/);
  assert.ok(!/disabled\s*:\s*false/.test(out));
});

test('toggle: 大小写变体 `disabled: False` 也翻转为 true，不产生重复键（issue #87 口径对齐）', () => {
  const out = togglePluginInPatch("- id: x\n  name: 'p'\n  disabled: False\n", 'x', false, 'p');
  assert.match(out, /disabled:\s*true/i);
  assert.ok(!/disabled\s*:\s*false/i.test(out), '不得残留 False');
  const keys = (out.match(/disabled\s*:/g) || []).length;
  assert.equal(keys, 1, '不得产生重复 disabled 键');
});

test('toggle: 关闭时已 disabled:true → 不变（零写入、幂等）', () => {
  const text = "- id: x\n  name: 'p'\n  disabled: true\n";
  const out = togglePluginInPatch(text, 'x', false, 'p');
  assert.equal(out, text);
});

test('toggle: 启用移除 disabled 行（无 config 则整条目移除）', () => {
  const text = "- id: x\n  name: 'p'\n  disabled: true\n";
  const out = togglePluginInPatch(text, 'x', true, 'p');
  assert.ok(!out.includes('x'));
});

test('toggle: 启用带 config 条目 → config 保留', () => {
  const text = "- id: x\n  name: 'p'\n  disabled: true\n  config:\n    a: 1\n";
  const out = togglePluginInPatch(text, 'x', true, 'p');
  assert.match(out, /config:/);
  assert.match(out, /a: 1/);
  assert.ok(!/disabled/.test(out));
});

test('toggle: 关闭两次输出与一次相同', () => {
  const text = '';
  const once = togglePluginInPatch(text, 'x', false, 'p');
  const twice = togglePluginInPatch(once, 'x', false, 'p');
  assert.equal(twice, once);
});

test('toggle: CRLF 输入输出仍为 CRLF', () => {
  const crlf = "- id: x\r\n  name: 'p'\r\n  disabled: false\r\n";
  const out = togglePluginInPatch(crlf, 'x', false, 'p');
  assert.ok(out.includes('\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(out), '无孤立 LF');
});

test('toggle: 无尾换行文件在追加时补上换行', () => {
  const text = "- id: other\n  name: 'o'";
  const out = togglePluginInPatch(text, 'x', false, 'pkg');
  assert.ok(out.endsWith('\n'), '输出以换行结尾');
  assert.match(out, /- id: x/);
});

test('toggle: 点号 id', () => {
  const text = "- insert:\n    - id: my.plugin\n      name: 'my.plugin'\n";
  const out = togglePluginInPatch(text, 'my.plugin', false, 'my.plugin');
  assert.ok(!out.includes('insert'));
  assert.match(out, /- id: my\.plugin/);
  assert.match(out, /disabled: true/);
});

test('toggle: name 单引号转义（yamlQuote）；双引号 name 行识别', () => {
  const out = togglePluginInPatch('', 'x', false, "dsh-it's");
  assert.ok(out.includes("name: 'dsh-it''s'"), '单引号加倍');
  const text = '- id: x\n  name: "pkg"\n';
  const off = togglePluginInPatch(text, 'x', false, 'pkg');
  assert.match(off, /name: "pkg"/);
  assert.match(off, /disabled: true/);
});

// ── 2. setPluginRemoved ───────────────────────────────────────────────────

test('setPluginRemoved: 卸载时 removed:false 与 disabled:false 均翻转为 true', () => {
  const r = setPluginRemoved("- id: x\n  name: 'p'\n  removed:false\n", 'x', true, 'p');
  assert.match(r, /removed:\s*true/);
  assert.match(r, /disabled:\s*true/);
  const d = setPluginRemoved("- id: x\n  name: 'p'\n  disabled:false\n", 'x', true, 'p');
  assert.match(d, /removed:\s*true/);
  assert.match(d, /disabled:\s*true/);
});

test('setPluginRemoved: 卸载时 `removed: false`（冒号后含空格）也翻转为 true（修复锚定）', () => {
  const r = setPluginRemoved("- id: x\n  name: 'p'\n  removed: false\n", 'x', true, 'p');
  assert.match(r, /removed:\s*true/);
  assert.ok(!/removed\s*:\s*false/.test(r));
});

test('setPluginRemoved: 大小写变体 `removed: False`/`disabled: False` 也翻转为 true（issue #87 口径对齐）', () => {
  const r = setPluginRemoved("- id: x\n  name: 'p'\n  disabled: False\n  removed: False\n", 'x', true, 'p');
  assert.match(r, /disabled:\s*true/i);
  assert.match(r, /removed:\s*true/i);
  assert.ok(!/false/i.test(r), '不得残留 False/false');
});

test('setPluginRemoved: 恢复移除 removed/disabled 行（无 config 整条目移除）', () => {
  const off = setPluginRemoved('', 'x', true, 'p');
  const on = setPluginRemoved(off, 'x', false, 'p');
  assert.ok(!on.includes('x'));
  assert.ok(!on.includes('removed'));
  assert.ok(!on.includes('disabled'));
});

test('setPluginRemoved: 恢复带 config 条目保留条目', () => {
  const text = "- id: x\n  name: 'p'\n  removed: true\n  disabled: true\n  config:\n    a: 1\n";
  const on = setPluginRemoved(text, 'x', false, 'p');
  assert.match(on, /- id: x/);
  assert.match(on, /config:/);
  assert.ok(!/removed/.test(on));
  assert.ok(!/disabled/.test(on));
});

test('setPluginRemoved: 恢复幂等、重复卸载幂等', () => {
  const off = setPluginRemoved('', 'x', true, 'p');
  const off2 = setPluginRemoved(off, 'x', true, 'p');
  assert.equal(off2, off, '重复卸载输出相同');
  const on = setPluginRemoved(off, 'x', false, 'p');
  const on2 = setPluginRemoved(on, 'x', false, 'p');
  assert.equal(on2, on, '恢复幂等');
});

test('setPluginRemoved/toggle: 反复操作标记注释不堆积', () => {
  let t = togglePluginInPatch('', 'x', false, 'p');
  t = togglePluginInPatch(t, 'x', true, 'p');
  t = togglePluginInPatch(t, 'x', false, 'p');
  t = togglePluginInPatch(t, 'x', false, 'p');
  const closeCount = (t.match(/关闭 x/g) || []).length;
  assert.equal(closeCount, 1, '关闭注释不堆积');
  let u = setPluginRemoved('', 'x', true, 'p');
  u = setPluginRemoved(u, 'x', false, 'p');
  u = setPluginRemoved(u, 'x', true, 'p');
  const uninstallCount = (u.match(/卸载 x/g) || []).length;
  assert.equal(uninstallCount, 1, '卸载注释不堆积');
});

// ── 3. parsePatchRows ─────────────────────────────────────────────────────

test('parsePatchRows: 顶层/insert 分类、引号三形态、大小写不敏感、hasConfig、损坏容忍', () => {
  const text = [
    "- id: top",
    "  name: 'single'",
    "  disabled: True",
    "- insert:",
    '    - id: inner',
    '      name: "double"',
    '      removed: TRUE',
    '      config:',
    '        a: 1',
    '- id: bare',
    '  name: bare-name',
  ].join('\n') + '\n';
  const { top, inserts } = parsePatchRows(text);
  assert.equal(top[0].id, 'top');
  assert.equal(top[0].name, 'single');
  assert.equal(top[0].disabled, true);
  assert.equal(top[0].removed, false);
  assert.equal(inserts[0].id, 'inner');
  assert.equal(inserts[0].name, 'double');
  assert.equal(inserts[0].removed, true);
  assert.equal(inserts[0].hasConfig, true);
  const bare = top.find((r) => r.id === 'bare');
  assert.equal(bare.name, 'bare-name');
});

test('parsePatchRows: tab 缩进 insert（两 tab = 4 列）归入 insert', () => {
  const text = '- insert:\n\t\t- id: deep\n\t\t  name: \'d\'\n';
  const { top, inserts } = parsePatchRows(text);
  assert.equal(top.length, 0);
  assert.equal(inserts[0].id, 'deep');
  assert.equal(inserts[0].name, 'd');
});

test('parsePatchRows: 损坏 YAML 仍尽力解析', () => {
  const text = '- id: top\n  garbage: [unclosed\n  name: \'still-parsed\'\n';
  const { top } = parsePatchRows(text);
  assert.equal(top[0].id, 'top');
  assert.equal(top[0].name, 'still-parsed');
});

test('parsePatchRows: 手写 `Removed: true` 大小写不敏感契约', () => {
  const text = '- id: x\n  Removed: true\n';
  const { top } = parsePatchRows(text);
  assert.equal(top[0].removed, true);
});

// ── 4. removedPluginIdsFromPatch ──────────────────────────────────────────

test('removedPluginIdsFromPatch: 大小写不敏感、忽略 false、多条目、点号 id', () => {
  const patch = [
    '- id: a.b',
    '  removed: true',
    '- id: c',
    '  removed: False',
    '- id: d',
    '  removed: True',
    '- id: e',
    '  removed: false',
  ].join('\n') + '\n';
  assert.deepEqual([...removedPluginIdsFromPatch(patch)], ['a.b', 'd']);
});

// ── 5. dedupePatchEntries / ensurePatchArray ──────────────────────────────

test('dedupePatchEntries: 重复条目去重并删除子树（保留首次含 config）', () => {
  const text = [
    '- insert:',
    '    - id: a',
    "      name: 'p'",
    '      config:',
    '        x: 1',
    '    - id: a',
    "      name: 'p'",
    '      config:',
    '        y: 2',
  ].join('\n') + '\n';
  const { text: out, removed } = dedupePatchEntries(text);
  assert.deepEqual(removed, ['a']);
  assert.equal((out.match(/id: a/g) || []).length, 1);
  assert.ok(out.includes('x: 1'));
  assert.ok(!out.includes('y: 2'));
});

test('ensurePatchArray: 仅剩注释/空行时补 []，有条目时不动', () => {
  assert.deepEqual(ensurePatchArray(['# comment']), ['# comment', '[]']);
  assert.deepEqual(ensurePatchArray([]), ['[]']);
  assert.deepEqual(ensurePatchArray(['- id: x']), ['- id: x']);
});

test('dropBlocksByIds: 全部条目移除后文件补 []（ensurePatchArray 接线）', () => {
  const text = "- insert:\n    - id: gone\n      name: 'g'\n";
  const { text: out, removed } = dropBlocksByIds(text, ['gone']);
  assert.deepEqual(removed, ['gone']);
  assert.ok(out.includes('[]'), 'comments-only 文件补 []');
});

// ── 6. dropBlocksByIds ────────────────────────────────────────────────────

test('dropBlocksByIds: name-only 非 insert 条目整块移除', () => {
  const text = "- id: x\n  name: 'pkg'\n";
  const { text: out, removed } = dropBlocksByIds(text, ['x']);
  assert.deepEqual(removed, ['x']);
  assert.ok(!out.includes('x'));
});

test('dropBlocksByIds: insert 部分命中只删该行及子树，保留其它 id', () => {
  const text = "- insert:\n    - id: gone\n      name: 'g'\n    - id: keep\n      name: 'k'\n";
  const { text: out, removed } = dropBlocksByIds(text, ['gone']);
  assert.deepEqual(removed, ['gone']);
  assert.ok(out.includes('keep'));
  assert.ok(!out.includes('gone'));
});

test('dropBlocksByIds: 非 insert 带 config 条目保留（不误删）', () => {
  const text = "- id: x\n  name: 'pkg'\n  config:\n    a: 1\n";
  const { text: out, removed } = dropBlocksByIds(text, ['x']);
  assert.deepEqual(removed, []);
  assert.ok(out.includes('x'));
  assert.ok(out.includes('config'));
});

// ── 7. registerCompanionPatchEntries ──────────────────────────────────────

test('registerCompanionPatchEntries: 三种引号形态改名', () => {
  for (const quote of ["'", '"']) {
    const text = `- insert:\n    - id: terminal\n      name: ${quote}old-name${quote}\n`;
    const r = registerCompanionPatchEntries(text, {
      plugins: [{ id: 'terminal', name: 'new-name' }],
      bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(),
    });
    assert.ok(r.updated.includes('terminal'));
    assert.ok(r.patch.includes('new-name'));
  }
  const bare = '- insert:\n    - id: terminal\n      name: old-name\n';
  const r2 = registerCompanionPatchEntries(bare, {
    plugins: [{ id: 'terminal', name: 'new-name' }],
    bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(),
  });
  assert.ok(r2.updated.includes('terminal'));
  assert.ok(r2.patch.includes('new-name'));
});

test('registerCompanionPatchEntries: 缺失条目新增（带 insert 块）', () => {
  const r = registerCompanionPatchEntries('', {
    plugins: [{ id: 'x', name: 'pkg-x' }],
    bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(),
  });
  assert.deepEqual(r.added, ['x']);
  assert.ok(r.patch.includes('- insert:'));
  assert.ok(r.patch.includes('- id: x'));
  assert.ok(r.patch.includes("name: 'pkg-x'"));
});

test('registerCompanionPatchEntries: bundle 名单跳过注册', () => {
  const r = registerCompanionPatchEntries('', {
    plugins: [{ id: 'x', name: 'bundle-name' }],
    bundleNames: new Set(['bundle-name']), missingNames: new Set(), removedIds: new Set(),
  });
  assert.deepEqual(r.added, []);
  assert.ok(!r.patch.includes('x'));
  assert.equal(r.changed, false);
});

test('registerCompanionPatchEntries: removedIds 跳过注册（卸载不复活）', () => {
  const r = registerCompanionPatchEntries('', {
    plugins: [{ id: 'better-sidebar', name: 'dsh-better-sidebar' }],
    bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(['better-sidebar']),
  });
  assert.ok(!r.changed);
  assert.deepEqual(r.added, []);
});

test('registerCompanionPatchEntries: missingNames 移除存量条目且不重加', () => {
  const patch = "- insert:\n    - id: gone\n      name: 'old-name'\n";
  const r = registerCompanionPatchEntries(patch, {
    plugins: [{ id: 'gone', name: 'missing-pkg' }],
    bundleNames: new Set(), missingNames: new Set(['missing-pkg']), removedIds: new Set(),
  });
  assert.ok(r.dropped.includes('gone'));
  assert.deepEqual(r.added, []);
  assert.ok(!r.patch.includes('gone'));
});

// ── 8. removeBundledRowDuplicates ─────────────────────────────────────────

test('removeBundledRowDuplicates: name 级兜底（bundleEntryIds 缺失）', () => {
  const patch = "- insert:\n    - id: my.id\n      name: 'pkg-name'\n";
  const { patch: out, removed } = removeBundledRowDuplicates(patch, { 'my.id': 'pkg-name' }, ['pkg-name'], undefined);
  assert.deepEqual(removed, ['my.id']);
  assert.ok(!out.includes('my.id'));
});

test('removeBundledRowDuplicates: 非重复 insert 保留', () => {
  const patch = "- insert:\n    - id: keep\n      name: 'other'\n";
  const { patch: out, removed } = removeBundledRowDuplicates(patch, {}, ['pkg-name'], new Set());
  assert.deepEqual(removed, []);
  assert.ok(out.includes('keep'));
});

// ── 9. 自愈 / 默认禁用 / 旧市场清理 / config 工具 / bundle id 收集 ───────

test('healPatchListSyntax: 移除与列表混存的顶层 []，幂等；纯 [] 不动', () => {
  const text = '[]\n- insert:\n    - id: x\n      name: \'x\'\n';
  const { text: out, healed } = healPatchListSyntax(text);
  assert.ok(healed);
  assert.ok(!out.includes('[]'));
  assert.equal(healPatchListSyntax(out).healed, false);
  assert.equal(healPatchListSyntax('[]').healed, false);
});

test('ensureDisabledPatchEntry: 两块互不相关的默认禁用块 + 幂等', () => {
  const acp = ensureDisabledPatchEntry('', /compaction-basic/, ACP_DISABLE_BLOCK);
  assert.ok(acp.changed);
  assert.ok(acp.patch.includes('compaction-basic'));
  assert.ok(acp.patch.includes('disabled: true'));
  assert.equal(ensureDisabledPatchEntry(acp.patch, /compaction-basic/, ACP_DISABLE_BLOCK).changed, false);

  // 旧此处用 PET_DISABLE_BLOCK + harness-pet 验第二块；两块随插件退役下线，
  // 换仍存在的 ACP_SELF_DISABLE_BLOCK（compaction-acp 自身默认禁用）承担「第二块」角色。
  const self = ensureDisabledPatchEntry('', /compaction-acp(?![A-Za-z0-9_.-])/, ACP_SELF_DISABLE_BLOCK);
  assert.ok(self.changed);
  assert.ok(self.patch.includes('compaction-acp'));
  assert.equal(ensureDisabledPatchEntry(self.patch, /compaction-acp(?![A-Za-z0-9_.-])/, ACP_SELF_DISABLE_BLOCK).changed, false);

  const bare = ensureDisabledPatchEntry('[]', /compaction-acp(?![A-Za-z0-9_.-])/, ACP_SELF_DISABLE_BLOCK);
  assert.ok(bare.changed);
  assert.ok(bare.patch.includes('compaction-acp'));
  assert.ok(!bare.patch.includes('[]'));
});

test('removeLegacyMarketplacePatchLines: 移除旧市场 insert 且幂等', () => {
  const patch = "- insert:\n    - id: plugin-marketplace\n      name: '@deepseek-ai/dsh-plugin-marketplace'\n";
  const r = removeLegacyMarketplacePatchLines(patch);
  assert.ok(r.changed);
  assert.ok(!r.patch.includes('plugin-marketplace'));
  assert.equal(removeLegacyMarketplacePatchLines(r.patch).changed, false);
});

test('configLinesFor: 序列化 config 行（默认 4 缩进）', () => {
  const out = configLinesFor({ a: 1, b: 'x' });
  assert.ok(out.includes('config:'));
  assert.ok(out.includes('a: 1'));
  assert.ok(out.includes('b: "x"'));
  assert.ok(out.startsWith('      config:\n'), 'baseIndent 4 → config 缩进 6');
});

test('normalizeRowConfigIndent: 对齐 config 缩进且幂等', () => {
  const patch = "- id: soul-md\n  name: 'dsh-soul-md'\n    config:\n      path: soul.md\n";
  const out = normalizeRowConfigIndent(patch, 'soul-md');
  assert.ok(out.includes('\n  config:\n    path: soul.md\n'), 'config 对齐到 id+2，键对齐到 +4');
  assert.equal(normalizeRowConfigIndent(out, 'soul-md'), out, '幂等');
});

test('healSoulMdPatchRow / healRowConfig: 缺 config 补 config，幂等、空输入无副作用', () => {
  const s = healSoulMdPatchRow("- id: soul-md\n  name: 'dsh-soul-md'\n", { path: 'other.md' });
  assert.deepEqual(s.healed, ['soul-md']);
  assert.ok(s.patch.includes('other.md'));
  assert.deepEqual(healSoulMdPatchRow(s.patch).healed, []);
  assert.deepEqual(healSoulMdPatchRow(''), { patch: '', healed: [] });

  // config 键用 better-sidebar 真实存在的 config.shell（其 bundle cordis.patch.yml 注释即此）。
  const h = healRowConfig("- id: better-sidebar\n  name: 'dsh-better-sidebar'\n", 'better-sidebar', { shell: '/bin/zsh' });
  assert.match(h.patch, /shell/);
  assert.deepEqual(healRowConfig(h.patch, 'better-sidebar', { shell: '/bin/zsh' }).healed, []);
  const noop = healRowConfig(h.patch, 'better-sidebar', null);
  assert.deepEqual(noop.healed, []);
  assert.equal(noop.patch, h.patch);
});

test('bundlePatchEntryIds: 缺失/合法/损坏', () => {
  assert.equal(bundlePatchEntryIds(undefined).size, 0);
  assert.equal(bundlePatchEntryIds('/nonexistent/dir').size, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-bpe-'));
  try {
    // 合法：dsh.bundle.patch 字符串形态
    fs.mkdirSync(path.join(dir, 'ok'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ok', 'package.json'), JSON.stringify({ name: 'ok', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    fs.writeFileSync(path.join(dir, 'ok', 'cordis.patch.yml'), '- insert:\n    - id: inner.id\n      name: \'x\'\n');
    assert.ok(bundlePatchEntryIds(path.join(dir, 'ok')).has('inner.id'));
    // dsh.bundle 字符串形态
    fs.mkdirSync(path.join(dir, 'str'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'str', 'package.json'), JSON.stringify({ name: 'str', dsh: { bundle: 'cordis.patch.yml' } }));
    fs.writeFileSync(path.join(dir, 'str', 'cordis.patch.yml'), '- id: direct\n');
    assert.ok(bundlePatchEntryIds(path.join(dir, 'str')).has('direct'));
    // 损坏 package.json
    fs.mkdirSync(path.join(dir, 'bad'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bad', 'package.json'), '{ bad json');
    assert.equal(bundlePatchEntryIds(path.join(dir, 'bad')).size, 0);
    // patch 文件缺失
    fs.mkdirSync(path.join(dir, 'nopatch'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nopatch', 'package.json'), JSON.stringify({ name: 'nopatch', dsh: { bundle: { patch: './missing.yml' } } }));
    assert.equal(bundlePatchEntryIds(path.join(dir, 'nopatch')).size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('collectBundleEntryIds: scope 名路径、缺失 bundle 不贡献', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cbe-'));
  try {
    fs.mkdirSync(path.join(dir, '@scope', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(dir, '@scope', 'pkg', 'package.json'), JSON.stringify({ name: '@scope/pkg', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    fs.writeFileSync(path.join(dir, '@scope', 'pkg', 'cordis.patch.yml'), '- insert:\n    - id: scoped.id\n');
    const ids = collectBundleEntryIds(['@scope/pkg', 'missing-bundle'], dir);
    assert.ok(ids.has('scoped.id'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('topLevelBlocks / patchRowIds: 形状契约', () => {
  const lines = ['- insert:', '    - id: a', '      name: \'p\'', '- id: top'];
  const blocks = topLevelBlocks(lines);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].insert, true);
  assert.equal(blocks[1].insert, false);
  assert.deepEqual(patchRowIds('- id: a.b\n- insert:\n    - id: c\n'), ['a.b', 'c']);
});

// ── 10. YAML 标量引号化（#155 根因二：@deepseek-ai 裸包名解析失败）─────────

test('needsYamlScalarQuote: @ 开头/含特殊字符须引号，安全 id 不引号', () => {
  assert.equal(needsYamlScalarQuote('@deepseek-ai/dsh-foo'), true, '@ 开头包名必须引号');
  assert.equal(needsYamlScalarQuote('@deepseek-ai/dsh-host-directory-picker-browse'), true);
  assert.equal(needsYamlScalarQuote('plain-pkg'), false, '字母/连字符安全');
  assert.equal(needsYamlScalarQuote('a.b_c-2'), false, '点/下划线/连字符/数字安全');
  assert.equal(needsYamlScalarQuote('"@deepseek-ai/x"'), false, '已带引号不重复引号');
  assert.equal(needsYamlScalarQuote("'@deepseek-ai/x'"), false, '已带单引号不重复引号');
});

test('quotePatchScalarValues: 裸 @ 包名补引号，健康文件零改写（幂等）', () => {
  // ① 裸 @ id → 单引号。
  const r1 = quotePatchScalarValues('- id: @deepseek-ai/dsh-host-directory-picker\n  disabled: true\n');
  assert.equal(r1.changed, true);
  assert.ok(r1.text.includes("- id: '@deepseek-ai/dsh-host-directory-picker'"));
  // ② insert 内层裸 @ name → 单引号。
  const r2 = quotePatchScalarValues('- insert:\n    - id: dsh-balance\n      name: @deepseek-ai/dsh-balance\n');
  assert.equal(r2.changed, true);
  assert.ok(r2.text.includes("name: '@deepseek-ai/dsh-balance'"));
  // ③ 健康文件：全为安全 id → 零改写（零写入幂等）。
  const healthy = '- id: dsh-balance\n  disabled: true\n- insert:\n    - id: dsh-pocket\n      name: dsh-pocket\n';
  const r3 = quotePatchScalarValues(healthy);
  assert.equal(r3.changed, false);
  assert.equal(r3.text, healthy);
  // ④ 已引号 → 零改写。
  const r4 = quotePatchScalarValues("- id: '@deepseek-ai/x'\n");
  assert.equal(r4.changed, false);
  // ⑤ 幂等：补引号后再跑零改写。
  const r5 = quotePatchScalarValues(r1.text);
  assert.equal(r5.changed, false);
  // ⑥ CRLF 保持。
  const crlf = '- id: @deepseek-ai/x\r\n  disabled: true\r\n';
  const r6 = quotePatchScalarValues(crlf);
  assert.equal(r6.changed, true);
  assert.ok(r6.text.includes('\r\n'), 'CRLF 输入必须保持 CRLF');
  assert.ok(r6.text.includes("- id: '@deepseek-ai/x'"));
});

test('yamlQuoteIfNeeded: 安全 id 裸标量，@ 开头补单引号（sidecar safe-overlay 用）', () => {
  assert.equal(yamlQuoteIfNeeded('bad-plugin-x'), 'bad-plugin-x');
  assert.equal(yamlQuoteIfNeeded('ghost.bundle_1'), 'ghost.bundle_1');
  assert.equal(yamlQuoteIfNeeded('@deepseek-ai/dsh-foo'), "'@deepseek-ai/dsh-foo'");
  assert.equal(yamlQuoteIfNeeded("it's"), "'it''s'", '单引号转义（yamlQuote 语义）');
});
