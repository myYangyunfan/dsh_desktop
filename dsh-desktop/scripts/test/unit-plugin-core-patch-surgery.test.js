'use strict';

// patch-surgery 单测：统一 id 字符集（点号）、EOL 保持、三种引号 name 改名、
// 幂等性。与历史行为逐字兼容（LF 输入输出逐字节不变）。
//
// 夹具身份（2026-10 调整）：这些机器都是通用补丁手术面，历史上用 harness-pet /
// terminal 当样本名；两条伴随件已在 v1.0.0 退役，样本换成仍随清单分发的
// better-sidebar（id `better-sidebar` / 包 `dsh-better-sidebar`）与 synapse
// （id `synapse` / 包 `dsh-synapse`）——断言的语义一条没动，只换名字。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  togglePluginInPatch, setPluginRemoved, dedupePatchEntries, dropBlocksByIds,
  healSoulMdPatchRow, healRowConfig, healPatchListSyntax, removedPluginIdsFromPatch,
  ensureDisabledPatchEntry, removeLegacyMarketplacePatchLines, registerCompanionPatchEntries,
  parsePatchRows, patchRowIds, removeBundledRowDuplicates, collectBundleEntryIds,
} = require('../plugin-core/lib/patch-surgery');

test('togglePluginInPatch: 关闭 → 移出 insert + 顶层 disabled；启用 → 移除', () => {
  const text = "- insert:\n    - id: balance\n      name: '@deepseek-ai/dsh-balance'\n";
  const off = togglePluginInPatch(text, 'balance', false, '@deepseek-ai/dsh-balance');
  assert.match(off, /- id: balance/);
  assert.match(off, /disabled: true/);
  assert.ok(!off.includes('insert'), 'insert 块被清空');
  const on = togglePluginInPatch(off, 'balance', true, '@deepseek-ai/dsh-balance');
  assert.ok(!on.includes('balance'), '启用后无 config 的条目整体移除');
});

test('togglePluginInPatch: 点号 id（历史「能写不能愈」修复）', () => {
  const text = "- insert:\n    - id: my.plugin\n      name: 'my.plugin'\n";
  const off = togglePluginInPatch(text, 'my.plugin', false, 'my.plugin');
  assert.ok(!off.includes('insert'), '点号 id 也能从 insert 移出');
  assert.match(off, /- id: my\.plugin/);
});

test('setPluginRemoved: 卸载写 disabled+removed；恢复清标记', () => {
  const text = '';
  const off = setPluginRemoved(text, 'better-sidebar', true, 'dsh-better-sidebar');
  assert.match(off, /disabled: true/);
  assert.match(off, /removed: true/);
  const on = setPluginRemoved(off, 'better-sidebar', false, 'dsh-better-sidebar');
  assert.ok(!on.includes('better-sidebar'), '恢复后无 config 条目移除（同步器重新 insert）');
});

test('dedupePatchEntries: 重复注册去重（保留首次，含点号 id）', () => {
  const text = '- insert:\n    - id: a.b\n      name: \'p\'\n    - id: a.b\n      name: \'p\'\n';
  const { text: out, removed } = dedupePatchEntries(text);
  assert.deepEqual(removed, ['a.b']);
  assert.equal(out.match(/id: a\.b/g).length, 1);
});

test('dropBlocksByIds: 整块命中删除；部分命中只删行', () => {
  const text = '- insert:\n    - id: gone\n      name: \'g\'\n    - id: keep\n      name: \'k\'\n';
  const { text: out, removed } = dropBlocksByIds(text, ['gone']);
  assert.deepEqual(removed, ['gone']);
  assert.ok(out.includes('keep'));
  assert.ok(!out.includes('gone'));
});

test('EOL 保持：CRLF 输入输出仍为 CRLF（改动文件不改换行风格）', () => {
  const crlf = '- insert:\r\n    - id: balance\r\n      name: \'@deepseek-ai/dsh-balance\'\r\n';
  const off = togglePluginInPatch(crlf, 'balance', false, '@deepseek-ai/dsh-balance');
  assert.ok(!/(^|[^\r])\n/.test(off), '无孤立 LF（每个换行都属于 CRLF）');
  assert.ok(off.includes('\r\n'));
  // 全文行尾一致：CRLF 数量 == 行数 - 1
  const lines = off.split('\r\n');
  assert.ok(lines.length > 1);
  assert.ok(!off.replace(/\r\n/g, '').includes('\n'));
});

test('healSoulMdPatchRow / healRowConfig: 缺 config 补 config，幂等', () => {
  const text = "- insert:\n    - id: soul-md\n      name: 'dsh-soul-md'\n";
  const r1 = healSoulMdPatchRow(text);
  assert.deepEqual(r1.healed, ['soul-md']);
  assert.match(r1.patch, /config:/);
  const r2 = healSoulMdPatchRow(r1.patch);
  assert.deepEqual(r2.healed, []);
  assert.equal(r2.patch, r1.patch);
  const side = "- id: better-sidebar\n  name: 'dsh-better-sidebar'\n";
  const pr = healRowConfig(side, 'better-sidebar', { fullRoot: 'x' });
  assert.match(pr.patch, /fullRoot/);
});

test('healPatchListSyntax: 与列表混存的顶层 [] 移除', () => {
  const text = '[]\n- insert:\n    - id: x\n      name: \'x\'\n';
  const { text: out, healed } = healPatchListSyntax(text);
  assert.ok(healed);
  assert.ok(!out.includes('[]'));
  assert.equal(healPatchListSyntax(out).healed, false);
});

test('removedPluginIdsFromPatch: 顶层 removed 行提取，insert 块不误伤', () => {
  const text = '- id: sidebar\n  name: \'dsh-better-sidebar\'\n  disabled: true\n  removed: true\n- insert:\n    - id: x\n      name: \'x\'\n      removed: true\n';
  assert.deepEqual([...removedPluginIdsFromPatch(text)], ['sidebar']);
});

test('ensureDisabledPatchEntry: 四种形态 + 幂等', () => {
  const a = ensureDisabledPatchEntry('', /better-sidebar/, '- id: better-sidebar\n  disabled: true\n');
  assert.ok(a.changed);
  const b = ensureDisabledPatchEntry(a.patch, /better-sidebar/, '- id: better-sidebar\n  disabled: true\n');
  assert.ok(!b.changed);
  const c = ensureDisabledPatchEntry('[]', /better-sidebar/, '- id: better-sidebar\n  disabled: true\n');
  assert.match(c.patch, /- id: better-sidebar/);
});

test('registerCompanionPatchEntries: 三种引号形态 name 改名修复', () => {
  for (const quote of ["'", '"']) {
    const text = `- insert:\n    - id: synapse\n      name: ${quote}old-name${quote}\n`;
    const r = registerCompanionPatchEntries(text, {
      plugins: [{ id: 'synapse', name: 'new-name' }],
      bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(),
    });
    assert.ok(r.updated.includes('synapse'), quote + ' 引号形态应改名');
    assert.ok(r.patch.includes('new-name'));
  }
  // 无引号形态
  const bare = '- insert:\n    - id: synapse\n      name: old-name\n';
  const r2 = registerCompanionPatchEntries(bare, {
    plugins: [{ id: 'synapse', name: 'new-name' }],
    bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(),
  });
  assert.ok(r2.updated.includes('synapse'));
  assert.ok(r2.patch.includes('new-name'));
});

test('registerCompanionPatchEntries: removedIds 显式跳过注册（卸载不复活）', () => {
  const r = registerCompanionPatchEntries('', {
    plugins: [{ id: 'better-sidebar', name: 'dsh-better-sidebar' }],
    bundleNames: new Set(), missingNames: new Set(), removedIds: new Set(['better-sidebar']),
  });
  assert.ok(!r.changed);
});

test('removeBundledRowDuplicates: id 级去重（bundleEntryIds 接线）', () => {
  const patch = '- insert:\n    - id: my.id\n      name: \'forked-name\'\n';
  const { patch: out, removed } = removeBundledRowDuplicates(patch, {}, ['other-bundle'], new Set(['my.id']));
  assert.deepEqual(removed, ['my.id']);
  assert.ok(!out.includes('my.id'));
});

test('collectBundleEntryIds: 从 bundle 包自身 patch 收集条目 id', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-bundle-'));
  try {
    fs.mkdirSync(path.join(dir, 'bundle-a'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bundle-a', 'package.json'), JSON.stringify({ name: 'bundle-a', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    fs.writeFileSync(path.join(dir, 'bundle-a', 'cordis.patch.yml'), '- insert:\n    - id: inner.id\n      name: \'x\'\n');
    const ids = collectBundleEntryIds(['bundle-a'], dir);
    assert.ok(ids.has('inner.id'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePatchRows: 结构化解析（顶层 + insert 内层，损坏 YAML 仍尽力解析）', () => {
  const text = '- id: top\n  name: \'t\'\n  disabled: true\n- insert:\n    - id: inner\n      name: \'i\'\n';
  const { top, inserts } = parsePatchRows(text);
  assert.equal(top[0].id, 'top');
  assert.equal(top[0].disabled, true);
  assert.equal(inserts[0].id, 'inner');
});

test('patchRowIds: 提取全部条目 id（含点号）', () => {
  assert.deepEqual(patchRowIds('- id: a.b\n- insert:\n    - id: c\n'), ['a.b', 'c']);
});
