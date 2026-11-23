'use strict';

// 单测：scripts/lib/companion-profile.js 的 removed 标记识别与补丁条目
// id 边界防御（issue #87 回归：\b 词边界把短 id 误命中同前缀长 id ——
// 现场是 dsh-terminal vs 已退役的 dsh-terminal-tab，样本见下方用例注释）。
// 运行：node --test scripts/test/unit-companion-profile.test.js

const test = require('node:test');
const assert = require('node:assert');
const {
  removedPluginIdsFromPatch,
  ensureDisabledPatchEntry,
  registerCompanionPatchEntries,
  ACP_DISABLE_BLOCK,
  ACP_SELF_DISABLE_BLOCK,
  SYNAPSE_SELF_DISABLE_BLOCK,
  SYNAPSE_DEFAULT_DISABLED_MARKER,
  BILI_SELF_DISABLE_BLOCK,
  BILI_DEFAULT_DISABLED_MARKER,
  ensureDefaultDisabledOnce,
} = require('../lib/companion-profile');
const { togglePluginInPatch } = require('../plugin-core/lib/patch-surgery');

test('removedPluginIdsFromPatch: 大小写不敏感的 removed: true 被识别（issue #87）', () => {
  for (const variant of ['true', 'True', 'TRUE', ' true ', 'TRUE ']) {
    const patch = `- id: dsh-abc\n  name: '@deepseek-ai/dsh-abc'\n  removed: ${variant}\n- id: dsh-keep\n  name: '@deepseek-ai/dsh-keep'\n`;
    const ids = removedPluginIdsFromPatch(patch);
    assert.ok(ids.has('dsh-abc'), `removed: ${variant} 必须被识别`);
    assert.ok(!ids.has('dsh-keep'), '正常条目不得被误判为 removed');
  }
});

test('removedPluginIdsFromPatch: removed: false / 无 removed 行不计入', () => {
  const patch = `- insert:\n    - id: dsh-a\n      removed: false\n- insert:\n    - id: dsh-b\n`;
  const ids = removedPluginIdsFromPatch(patch);
  assert.strictEqual(ids.size, 0);
});

test('ensureDisabledPatchEntry: id 前缀不误命中（compaction-basic vs compaction-basic-x）', () => {
  // 与 sync-companion-plugins.js 相同的边界断言模式
  const idPattern = new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-basic(?![A-Za-z0-9_.-])');
  // patch 里只有 compaction-basic-x（更长的同前缀 id）：不应被当成 compaction-basic 已存在
  const patch = '- insert:\n    - id: compaction-basic-x\n      name: x\n';
  const out = ensureDisabledPatchEntry(patch, idPattern, ACP_DISABLE_BLOCK);
  assert.strictEqual(out.changed, true, '同前缀长 id 不得阻止写入禁用条目');
  assert.ok(out.patch.includes('compaction-basic'), '应写入 compaction-basic 禁用条目');
  // 精确匹配已存在时保持幂等
  const exact = out.patch + '- insert:\n    - id: compaction-basic\n';
  const again = ensureDisabledPatchEntry(exact, idPattern, ACP_DISABLE_BLOCK);
  assert.strictEqual(again.changed, false, '精确 id 已存在时必须幂等跳过');
});

test('禁用块机器：两块默认禁用条目顺序写入同一 patch 且各自幂等', () => {
  // 原用例打的是 CARDIAN_DISABLE_BLOCK / GRAPH_MEMORY_DISABLE_BLOCK——两个默认禁用块
  // 随 cardian / graph-memory 退役从 patch-surgery 与 companion-profile 导出面删除，
  // 这里把同一台「ensureDisabledPatchEntry 机器」改锚到仍在写的两个活块：
  // ACP_DISABLE_BLOCK（compaction-basic，见上一用例）与 ACP_SELF_DISABLE_BLOCK
  // （compaction-acp 自禁用，sync-companion-plugins.js:317 的实调用点）。
  assert.match(ACP_SELF_DISABLE_BLOCK, /id:\s*compaction-acp\b/);
  assert.match(ACP_SELF_DISABLE_BLOCK, /disabled:\s*true/);

  const acpSelfPattern = new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-acp(?![A-Za-z0-9_.-])');
  const acpBasicPattern = new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*compaction-basic(?![A-Za-z0-9_.-])');

  // 验证写入全新 patch（两块顺序落同一段文本）
  const out1 = ensureDisabledPatchEntry('- insert:\n    - id: balance\n', acpSelfPattern, ACP_SELF_DISABLE_BLOCK);
  assert.strictEqual(out1.changed, true);
  assert.ok(out1.patch.includes('id: compaction-acp'));

  const out2 = ensureDisabledPatchEntry(out1.patch, acpBasicPattern, ACP_DISABLE_BLOCK);
  assert.strictEqual(out2.changed, true);
  assert.ok(out2.patch.includes('id: compaction-basic'));

  // 验证幂等：再次执行不再改动
  const out3 = ensureDisabledPatchEntry(out2.patch, acpSelfPattern, ACP_SELF_DISABLE_BLOCK);
  assert.strictEqual(out3.changed, false);
  const out4 = ensureDisabledPatchEntry(out2.patch, acpBasicPattern, ACP_DISABLE_BLOCK);
  assert.strictEqual(out4.changed, false);
});

test('SYNAPSE_SELF_DISABLE_BLOCK：会话地图默认禁用块形状、幂等与 sync 接线', () => {
  assert.match(SYNAPSE_SELF_DISABLE_BLOCK, /id:\s*synapse\b/);
  assert.match(SYNAPSE_SELF_DISABLE_BLOCK, /disabled:\s*true/);
  assert.ok(!/(?:^|\n)\s*-?\s*id:\s*synapse-x/.test(SYNAPSE_SELF_DISABLE_BLOCK), '块内只登记 synapse 自身');

  const pattern = new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*synapse(?![A-Za-z0-9_.-])');
  const out = ensureDefaultDisabledOnce('- insert:\n    - id: balance\n', pattern, SYNAPSE_SELF_DISABLE_BLOCK, SYNAPSE_DEFAULT_DISABLED_MARKER);
  assert.strictEqual(out.changed, true);
  assert.ok(out.patch.includes('id: synapse'));
  assert.ok(out.patch.includes('disabled: true'));
  assert.ok(out.patch.includes(SYNAPSE_DEFAULT_DISABLED_MARKER), '写入禁用块的同时写入一次性标记');
  assert.strictEqual(ensureDefaultDisabledOnce(out.patch, pattern, SYNAPSE_SELF_DISABLE_BLOCK, SYNAPSE_DEFAULT_DISABLED_MARKER).changed, false, '重复同步必须幂等');

  // 已存在登记点（insert 内层或用户条目）时不得再叠一条 disabled：与
  // ensureDisabledPatchEntry 的「id 已存在即跳过」契约同源，反证用 insert 内层形。
  const registered = '- insert:\n    - id: synapse\n      name: dsh-synapse\n';
  assert.strictEqual(ensureDisabledPatchEntry(registered, pattern, SYNAPSE_SELF_DISABLE_BLOCK).changed, false);

  // 用户在内置插件页开启后必须持久：toggle 会删掉 disabled 块与「关闭 synapse」注释，
  // 但一次性标记应留下，sync 看到标记不得回写禁用块（否则每次重启都回到默认关闭）。
  const enabled = togglePluginInPatch(out.patch, 'synapse', true, 'dsh-synapse');
  assert.ok(!/(?:^|\n)\s*-?\s*id:\s*synapse\b/.test(enabled), '开启后顶层注册点应被移除');
  assert.ok(enabled.includes(SYNAPSE_DEFAULT_DISABLED_MARKER), '一次性标记不得被 toggle 带走');
  const afterEnable = ensureDefaultDisabledOnce(enabled, pattern, SYNAPSE_SELF_DISABLE_BLOCK, SYNAPSE_DEFAULT_DISABLED_MARKER);
  assert.strictEqual(afterEnable.changed, false, '已标记的开启状态不得被下次同步回写');
  assert.ok(!afterEnable.patch.includes('disabled: true'));

  // 用户再次关闭仍应写入（标记只阻止「默认回写」，不阻止显式关闭）。
  const reDisabled = togglePluginInPatch(enabled, 'synapse', false, 'dsh-synapse');
  assert.ok(reDisabled.includes('disabled: true'), '显式关闭必须重新写入 disabled');

  // 接线：两个同步入口（Electron CLI 与 Tauri sidecar boot 的 integration/plugin-sync）
  // 都必须按 bundle 名条件写入该常量——只测常量形状会漏掉「没接上」；只测 CLI 入口
  // 会漏掉 Tauri 活路径（2026-10-22 实测过这个假绿）。
  const fs = require('node:fs');
  const path = require('node:path');
  for (const rel of ['sync-companion-plugins.js', 'integration/plugin-sync.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.match(src, /bundleNames\.has\('dsh-synapse'\)/, rel + ' 必须按 bundle 名判定');
    assert.match(src, /SYNAPSE_SELF_DISABLE_BLOCK/, rel + ' 必须写入 synapse 默认禁用块');
  }
});

test('BILI_SELF_DISABLE_BLOCK：上下文压缩默认禁用块只禁引擎、不碰 gate，且可持久开启', () => {
  assert.match(BILI_SELF_DISABLE_BLOCK, /id:\s*bili-native\b/);
  assert.match(BILI_SELF_DISABLE_BLOCK, /disabled:\s*true/);
  // 反证（上游 #3662）：块里绝不能出现 bili-compaction-gate 的顶层条目。gate 是四个出厂
  // 预设 `inject: [biliBasicCompactionPolicy]` 等待的服务提供者，一起禁就是会话创建永久
  // pending——而静态扫、boot 五步、单测全绿都看不出来，只有真机会话建不起来。
  assert.ok(
    !/(?:^|\n)\s*-?\s*id:\s*bili-compaction-gate\b/.test(BILI_SELF_DISABLE_BLOCK),
    'gate 条目不得写进默认禁用块',
  );
  assert.match(BILI_SELF_DISABLE_BLOCK, /bili-compaction-gate/, '块内注释必须写明 gate 不能一起禁（留给读 patch 文件的人）');

  const pattern = /(?:^|\n)\s*-?\s*id\s*:\s*bili-native(?![A-Za-z0-9_.-])/;
  const out = ensureDefaultDisabledOnce('- insert:\n    - id: balance\n', pattern, BILI_SELF_DISABLE_BLOCK, BILI_DEFAULT_DISABLED_MARKER);
  assert.strictEqual(out.changed, true);
  assert.ok(out.patch.includes('id: bili-native'));
  assert.ok(out.patch.includes('disabled: true'));
  assert.ok(out.patch.includes(BILI_DEFAULT_DISABLED_MARKER), '写入禁用块的同时写入一次性标记');
  assert.strictEqual(
    ensureDefaultDisabledOnce(out.patch, pattern, BILI_SELF_DISABLE_BLOCK, BILI_DEFAULT_DISABLED_MARKER).changed,
    false,
    '重复同步必须幂等',
  );

  // bundle 层 insert 里已有 bili-native 登记点时不再叠一条 disabled。
  const registered = '- insert:\n    - id: bili-native\n      name: billion-context\n';
  assert.strictEqual(ensureDisabledPatchEntry(registered, pattern, BILI_SELF_DISABLE_BLOCK).changed, false);

  // 用户在内置插件页开启后必须持久：toggle 删 disabled 块，但一次性标记要留下。
  const enabled = togglePluginInPatch(out.patch, 'bili-native', true, 'billion-context');
  assert.ok(!/(?:^|\n)\s*-?\s*id:\s*bili-native\b/.test(enabled), '开启后顶层注册点应被移除');
  assert.ok(enabled.includes(BILI_DEFAULT_DISABLED_MARKER), '一次性标记不得被 toggle 带走');
  assert.strictEqual(
    ensureDefaultDisabledOnce(enabled, pattern, BILI_SELF_DISABLE_BLOCK, BILI_DEFAULT_DISABLED_MARKER).changed,
    false,
    '已标记的开启状态不得被下次同步回写',
  );
  // 显式再次关闭仍要写入（标记只阻止「默认回写」）。
  assert.ok(
    togglePluginInPatch(enabled, 'bili-native', false, 'billion-context').includes('disabled: true'),
    '显式关闭必须重新写入 disabled',
  );

  // 接线：CLI 同步与 Tauri sidecar boot 的 integration/plugin-sync 两条入口都得接上——
  // 只测常量形状会漏掉「没接上」（2026-10-22 实测过这个假绿）。
  const fs = require('node:fs');
  const path = require('node:path');
  for (const rel of ['sync-companion-plugins.js', 'integration/plugin-sync.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.match(src, /bundleNames\.has\('billion-context'\)/, rel + ' 必须按 bundle 名判定');
    assert.match(src, /BILI_SELF_DISABLE_BLOCK/, rel + ' 必须写入 bili-native 默认禁用块');
  }
});

test('registerCompanionPatchEntries: 短 id 不得被同前缀长 id 挡掉（issue #87 词边界防线）', () => {
  // 现场：`\b` 缺失时长 id 的锚点会命中同前缀的更长 id，误判「已登记」而静默不写。
  // 历史样本是 dsh-terminal vs dsh-terminal-tab（后者随 terminal 退役不再是活体形态），
  // 防线本身与身份无关，故换成「活配套 file-changes + 同前缀合成兄弟行 file-changes-x」
  // （合成兄弟行与上方 compaction-basic-x 用例同款手法）。
  const patch = '- insert:\n    - id: file-changes-x\n      name: \'@deepseek-ai/dsh-file-changes-x\'\n';
  const out = registerCompanionPatchEntries(patch, {
    plugins: [{ id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' }],
    bundleNames: new Set(),
    missingNames: new Set(),
    removedIds: new Set(),
    onDrop: () => {},
    onEntry: () => {},
  });
  assert.ok(out.changed, 'file-changes 未被登记时必须插入条目（不得被 file-changes-x 挡掉）');
  assert.ok(/- id: file-changes(?![A-Za-z0-9_.-])/.test(out.patch), '应插入 file-changes 条目');
  assert.ok(!out.patch.includes('id: file-changes-x\n      name: \'@deepseek-ai/dsh-file-changes\''),
    '不得把 file-changes-x 的 name 误改成 file-changes');
});

test('registerCompanionPatchEntries: 精确 id 已存在时改名生效但不误伤前缀兄弟', () => {
  const patch = [
    '- insert:',
    "    - id: file-changes",
    "      name: '@deepseek-ai/dsh-file-changes-old'",
    "    - id: file-changes-x",
    "      name: '@deepseek-ai/dsh-file-changes-x'",
  ].join('\n');
  const out = registerCompanionPatchEntries(patch, {
    plugins: [{ id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' }],
    bundleNames: new Set(),
    missingNames: new Set(),
    removedIds: new Set(),
    onDrop: () => {},
    onEntry: () => {},
  });
  assert.ok(out.patch.includes("name: '@deepseek-ai/dsh-file-changes'"), '精确 id 的 name 应就地改名');
  assert.ok(out.patch.includes("name: '@deepseek-ai/dsh-file-changes-x'"), '前缀兄弟条目 name 不得被误改');
});
// ---------------------------------------------------------------------------
// dsh-mini 退役清理（0.6.4，dsh-pocket 等位替代）：目录 + manifest + patch 行全套

const { removeRetiredDshMiniDir, removeRetiredDshMiniPatchRows } = require('../lib/companion-profile');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function mkProfileWithMini(pkg, manifest) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mini-retired-'));
  const dir = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-mini');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(dir, 'lib.js'), 'x');
  if (manifest) fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2));
  return { profileDir, dir };
}

const BUILTIN_MINI_PKG = {
  name: '@deepseek-ai/dsh-mini', version: '1.4.2',
  dsh: { bundle: { patch: './cordis.patch.yml' } },
};

test('removeRetiredDshMiniDir: 内置装配副本被移除 + manifest bundles/dependencies 清账', () => {
  const { profileDir, dir } = mkProfileWithMini(BUILTIN_MINI_PKG, {
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-mini'] } },
    dependencies: { '@deepseek-ai/dsh-mini': 'file:../../assets/plugins/dsh-mini' },
  });
  const logs = [];
  removeRetiredDshMiniDir(profileDir, { log: (m) => logs.push(m) });
  assert.strictEqual(fs.existsSync(dir), false, '内置副本必须被移除');
  const m = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  assert.ok(!m.dsh.profile.bundles.includes('@deepseek-ai/dsh-mini'), 'manifest bundles 必须摘除 mini');
  assert.ok(m.dsh.profile.bundles.includes('@deepseek-ai/dsh-base'), '核心 bundle 不得误伤');
  assert.ok(!m.dependencies || !m.dependencies['@deepseek-ai/dsh-mini'], 'dependencies 必须摘除 mini');
  assert.ok(logs.some((x) => x.includes('dsh-mini')), '应留下清理日志');
});

test('removeRetiredDshMiniDir: 无 dsh.bundle.patch 特征的同名包（用户 npm 自装）不得误删', () => {
  const { profileDir, dir } = mkProfileWithMini({ name: '@deepseek-ai/dsh-mini', version: '9.9.9' });
  removeRetiredDshMiniDir(profileDir, {});
  assert.strictEqual(fs.existsSync(dir), true, '非内置特征的同名包必须保留');
});

test('removeRetiredDshMiniDir: 残缺目录（无 package.json）按可清理处理', () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mini-broken-'));
  const dir = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-mini');
  fs.mkdirSync(dir, { recursive: true });
  removeRetiredDshMiniDir(profileDir, {});
  assert.strictEqual(fs.existsSync(dir), false, '残缺目录应被清理');
});

test('removeRetiredDshMiniDir: 目录不存在时零动作（不创建文件）', () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mini-absent-'));
  removeRetiredDshMiniDir(profileDir, {});
  assert.strictEqual(fs.existsSync(path.join(profileDir, 'package.json')), false, '不得凭空创建 manifest');
});

test('removeRetiredDshMiniPatchRows: patch 层 dsh-mini 登记行被整块摘除', () => {
  const patch = [
    '- insert:',
    '    - id: dsh-mini',
    "      name: '@deepseek-ai/dsh-mini'",
    '      config: {}',
    '- insert:',
    '    - id: dsh-keep',
    "      name: dsh-keep",
  ].join('\n');
  const r = removeRetiredDshMiniPatchRows(patch);
  assert.strictEqual(r.changed, true);
  assert.ok(!r.patch.includes('dsh-mini'), 'mini 行必须被摘除');
  assert.ok(r.patch.includes('dsh-keep'), '保留行不得误伤');
});