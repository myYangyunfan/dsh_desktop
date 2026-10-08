'use strict';

// 单测：v1.0.0 批量退役 11 条内置插件的回收机器（表驱动，唯一实现）。
//
// 为什么必须有这台机器：摘出 COMPANION_PLUGINS 的条目会**立刻失去**「源缺失 →
// missingNames → 通用撤账」这条既有回收路径（那条路只认清单里的条目）。不主动
// 撤账，老用户 profile 里就留着指向缺失目录的注册行，装配失败表现为
// "entries did not activate"，而一次致命启动会把补丁层整体改名抹掉。
//
// 两条铁律的取证：
//  ① 撤账必做（patch 行 + manifest bundles/dependencies）；
//  ② 删目录要有镜像证据 —— npm 拒发 private:true 的包，所以 private 或
//     description 含「DSH Desktop」才是我们同步进去的那一份。graph-memory /
//     harness-pet / dsh-cardian 的上游 package.json 与镜像逐字段相同，无法区分，
//     这类只撤账不删目录（未注册目录是惰性的，不会被 loader 挂载）。
// 运行：node --test scripts/test/unit-companion-bulk-retire.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  COMPANION_PLUGINS, companionDirName, RETIRED_COMPANIONS, RETIRED_COMPANION_DIRS,
} = require('../lib/companion-plugins');
const {
  removeRetiredCompanionDirs,
  removeRetiredCompanionPatchRows,
  retiredCompanionPatchIds,
  isBuiltinCompanionMirror,
} = require('../lib/companion-profile');

function mkProfile(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bulk-retire-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

function writePkg(dir, pkg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, 'index.js'), 'export {};\n');
}

function writeManifest(profileDir, obj) {
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify(obj, null, 2) + '\n');
}

function readManifest(profileDir) {
  return JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
}

/** 退役条目在 patch 层的形状全集：insert 内层 / name-only 顶层 / 默认禁用顶层。 */
function patchFixture() {
  return [
    '# DSH Desktop 配套插件登记',
    '- insert:',
    '    - id: dsh-base-keep',
    "      name: '@deepseek-ai/dsh-base'",
    '- insert:',
    '    - id: harness-pet',
    '      name: harness-pet',
    '      config:',
    '        scale: 1',
    '    - id: dsh-vision',
    "      name: '@dsh-external/dsh-vision'",
    '- id: graph-memory',
    '  name: graph-memory',
    '- id: cardian',
    '  name: dsh-cardian',
    '  disabled: true',
    '# 用户自己在插件管理里改出来的合法覆盖：含 config，不得动',
    '- id: terminal',
    "  name: '@deepseek-ai/dsh-terminal-tab'",
    '  config:',
    '    theme: "dark"',
    '# dirsOnly 官方同名件：它的 disabled 行会连带禁用官方实现，不得动',
    '- id: plugin-manager',
    "  name: '@deepseek-ai/dsh-plugin-manager'",
    '  disabled: true',
    '- id: file-changes',
    "  name: '@deepseek-ai/dsh-file-changes'",
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 判据自证（先证机器本身判得对，再证它动了手）
// ---------------------------------------------------------------------------

test('isBuiltinCompanionMirror：镜像证据判据', () => {
  assert.strictEqual(isBuiltinCompanionMirror({ name: 'dsh-hub', private: true }, 'dsh-hub'), true,
    'private:true npm 拒发，只能是本地镜像副本');
  assert.strictEqual(
    isBuiltinCompanionMirror({ name: 'dsh-hub', description: 'DSH Desktop 内置配套插件' }, 'dsh-hub'), true,
    '改写过 description 加内置字样的同样是镜像');
  assert.strictEqual(isBuiltinCompanionMirror({ name: 'dsh-hub', description: 'upstream' }, 'dsh-hub'), false,
    '上游原样 package.json 不构成镜像证据');
  assert.strictEqual(isBuiltinCompanionMirror({ name: 'other', private: true }, 'dsh-hub'), false,
    '包名不符一律不认（防误删他人包）');
});

test('retiredCompanionPatchIds：含历史别名，排除 dirsOnly 官方同名件', () => {
  const ids = retiredCompanionPatchIds();
  for (const id of ['harness-pet', 'dsh-vision', 'graph-memory', 'cardian', 'community-market',
    'market-desktop-bridge', 'dsh-hub', 'file-drop', 'image-paste', 'client-file-changes', 'terminal']) {
    assert.ok(ids.includes(id), '退役 id 应被认领: ' + id);
  }
  // 老装机机器的 patch 层用过 dsh-terminal（issue #87 的 \b 边界事故就出在这对名字上）。
  assert.ok(ids.includes('dsh-terminal'), 'legacy id 必须一并认领');
  // dirsOnly：包名撞官方内核包，patch 行属于官方实现，做手术会连带禁用官方件。
  assert.ok(!ids.includes('plugin-manager'), 'dirsOnly 条目不得进 patch 手术面');
});

// ---------------------------------------------------------------------------
// patch 层回收
// ---------------------------------------------------------------------------

test('removeRetiredCompanionPatchRows：三种形状全部撤回，合法覆盖与官方同名行保留', () => {
  const r = removeRetiredCompanionPatchRows(patchFixture());
  assert.strictEqual(r.changed, true);
  for (const id of ['harness-pet', 'dsh-vision', 'graph-memory', 'cardian']) {
    assert.ok(!r.patch.includes('id: ' + id), '退役登记应被撤回: ' + id);
  }
  // legacyIds：老装机机器写的是 dsh-terminal（\b 边界事故的当事对，见 RETIRED_COMPANIONS 注释）。
  // 本夹具里 terminal 的顶层块带 config，属用户合法覆盖 → 既不删也不该进 removed。
  assert.ok(!r.removed.includes('terminal'), 'config-bearing 块不得被记为已撤回');
  assert.ok(r.patch.includes('id: dsh-base-keep'), '无关 insert 不得误伤');
  assert.ok(r.patch.includes('id: file-changes'), '在册插件的登记不得误伤');
  assert.ok(r.patch.includes('theme: "dark"'), '含 config 的用户覆盖行必须整块保留');
  assert.ok(r.patch.includes('id: plugin-manager'), 'dirsOnly 官方同名行必须原样保留');
  assert.ok(r.patch.includes('含 config，不得动'), '块尾注释属于下一个条目，不得被吃掉');
  assert.ok(r.patch.includes('连带禁用官方实现'), '保留条目及其注释一并留下');
});

test('removeRetiredCompanionPatchRows：撤回历史默认禁用块时连带摘掉点名注释', () => {
  const patch = [
    '# 桌面宠物（harness-pet）默认关闭：性能原因',
    '- id: harness-pet',
    '  name: harness-pet',
    '  disabled: true',
    '- id: balance',
    "  name: '@deepseek-ai/dsh-balance'",
    '',
  ].join('\n');
  const r = removeRetiredCompanionPatchRows(patch);
  assert.strictEqual(r.changed, true);
  assert.ok(!r.patch.includes('harness-pet'), '禁用行应被撤回');
  assert.ok(!r.patch.includes('默认关闭'), '紧邻上方点名该 id 的注释一并摘除');
  assert.ok(r.patch.includes('id: balance'), '无关条目不动');
});

test('removeRetiredCompanionPatchRows：幂等（二次调用零变更）', () => {
  const once = removeRetiredCompanionPatchRows(patchFixture());
  const twice = removeRetiredCompanionPatchRows(once.patch);
  assert.strictEqual(twice.changed, false, '二次调用必须无变更（每 boot 刷写的老病灶）');
  assert.deepStrictEqual(twice.removed, []);
  assert.strictEqual(twice.patch, once.patch);
});

test('removeRetiredCompanionPatchRows：干净补丁零写入，空文件不塌成非法 YAML', () => {
  const clean = ['- id: balance', "  name: '@deepseek-ai/dsh-balance'", ''].join('\n');
  assert.strictEqual(removeRetiredCompanionPatchRows(clean).changed, false);
  const all = removeRetiredCompanionPatchRows(
    ['- id: cardian', '  name: dsh-cardian', '  disabled: true', ''].join('\n'));
  assert.strictEqual(all.changed, true);
  assert.match(all.patch, /\[\]/, '只剩注释/空行时必须补回合法顶层数组');
});

// ---------------------------------------------------------------------------
// 目录 + profile manifest 回收
// ---------------------------------------------------------------------------

test('removeRetiredCompanionDirs：镜像证据充分 → 删目录 + 撤 bundles/dependencies', (t) => {
  const profileDir = mkProfile(t);
  const nm = path.join(profileDir, 'node_modules');
  writePkg(path.join(nm, 'dsh-community-market'), {
    name: 'dsh-community-market', version: '0.3.1', private: true,
    description: 'DSH Desktop 内置配套插件',
  });
  // 双名登记：dependencies 里既可能记全名也可能记裸名（历史两种写法都存在）。
  writeManifest(profileDir, {
    name: 'dsh-profile-web',
    dsh: { profile: { bundles: ['dsh-community-market', 'balance'] } },
    dependencies: { 'dsh-community-market': '0.3.1', '@deepseek-ai/dsh-balance': '0.1.0' },
  });

  const out = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.ok(out.removedDirs.includes('dsh-community-market'));
  assert.ok(out.retracted.includes('dsh-community-market'));
  assert.strictEqual(fs.existsSync(path.join(nm, 'dsh-community-market')), false, '镜像副本应被回收');

  const m = readManifest(profileDir);
  assert.deepStrictEqual(m.dsh.profile.bundles, ['balance'], '退役 bundle 撤账，在册 bundle 不动');
  assert.ok(!('dsh-community-market' in m.dependencies), 'dependencies 撤账');
  assert.ok('@deepseek-ai/dsh-balance' in m.dependencies, '在册依赖不得被撤（用户数据不动）');

  // 幂等：再跑一遍零动作。
  const again = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.deepStrictEqual(again.removedDirs, []);
  assert.deepStrictEqual(again.retracted, []);
});

test('反证：无镜像证据的同名目录（疑似用户自装）既不删也不撤账', (t) => {
  const profileDir = mkProfile(t);
  const dir = path.join(profileDir, 'node_modules', 'harness-pet');
  writePkg(dir, { name: 'harness-pet', version: '1.4.0', description: 'upstream pet bundle' });
  writeManifest(profileDir, {
    name: 'dsh-profile-web',
    dsh: { profile: { bundles: ['harness-pet'] } },
    dependencies: { 'harness-pet': '1.4.0' },
  });

  const out = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.ok(out.keptUserDirs.includes('harness-pet'), '应记入「保留用户目录」');
  assert.strictEqual(fs.existsSync(path.join(dir, 'package.json')), true, '用户自装目录不得被删');
  const m = readManifest(profileDir);
  assert.deepStrictEqual(m.dsh.profile.bundles, ['harness-pet'], '用户的登记一并保留（撤了等于改用户意图）');
  assert.ok('harness-pet' in m.dependencies);
});

test('scoped 退役件（@dsh-external/dsh-vision）也能认领——补齐旧回收面从不扫 @dsh-external 的缺口', (t) => {
  const profileDir = mkProfile(t);
  const dir = path.join(profileDir, 'node_modules', '@dsh-external', 'dsh-vision');
  writePkg(dir, { name: '@dsh-external/dsh-vision', version: '0.2.0', private: true });
  writeManifest(profileDir, {
    name: 'dsh-profile-web',
    dsh: { profile: { bundles: ['dsh-vision'] } },
    dependencies: { '@dsh-external/dsh-vision': '0.2.0', 'dsh-vision': '0.2.0' },
  });

  const out = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.ok(out.removedDirs.includes('@dsh-external/dsh-vision'));
  assert.strictEqual(fs.existsSync(dir), false);
  const m = readManifest(profileDir);
  assert.deepStrictEqual(m.dsh.profile.bundles, [], '裸名 bundle 同样要撤');
  assert.ok(!('dependencies' in m), '撤空后不留空 dependencies 对象');
});

test('目录缺席时仍撤账（撤账必做），残缺目录按可清理处理', (t) => {
  const profileDir = mkProfile(t);
  // graph-memory 目录已被上一代手工删掉，只剩 manifest 登记。
  writeManifest(profileDir, {
    name: 'dsh-profile-web',
    dsh: { profile: { bundles: ['graph-memory'] } },
    dependencies: { 'graph-memory': '0.1.0' },
  });
  const out = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.deepStrictEqual(out.removedDirs, []);
  assert.ok(out.retracted.includes('graph-memory'), '目录不在也要撤账，否则装配指向缺失包');

  // 残缺目录（package.json 读不出）：既有先例是可清理。
  const broken = path.join(profileDir, 'node_modules', 'dsh-hub');
  fs.mkdirSync(broken, { recursive: true });
  const second = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.ok(second.removedDirs.includes('dsh-hub'));
  assert.strictEqual(fs.existsSync(broken), false);
});

test('dryRun：只出计划不落盘', (t) => {
  const profileDir = mkProfile(t);
  const dir = path.join(profileDir, 'node_modules', 'dsh-image-paste');
  writePkg(dir, { name: 'dsh-image-paste', private: true });
  writeManifest(profileDir, { name: 'dsh-profile-web', dsh: { profile: { bundles: ['dsh-image-paste'] } } });
  const plans = [];
  const out = removeRetiredCompanionDirs(profileDir, {
    dryRun: true, log: () => {}, fail: () => {}, plan: (m) => plans.push(m),
  });
  assert.ok(plans.some((m) => m.includes('dsh-image-paste')), 'dry-run 应给出计划');
  assert.ok(plans.some((m) => m.includes('manifest')), 'dry-run 也应给出 manifest 撤账计划');
  assert.strictEqual(out.removedDirs.length, 0);
  assert.strictEqual(out.retracted.length, 0);
  assert.strictEqual(fs.existsSync(path.join(dir, 'package.json')), true, 'dry-run 不得动盘');
  assert.deepStrictEqual(readManifest(profileDir).dsh.profile.bundles, ['dsh-image-paste']);
});

test('dirsOnly 条目绝不被做目录/manifest 手术（官方同名件防线）', (t) => {
  const profileDir = mkProfile(t);
  const official = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-plugin-manager');
  writePkg(official, { name: '@deepseek-ai/dsh-plugin-manager', version: '0.2.0-rc.2' });
  writeManifest(profileDir, {
    name: 'dsh-profile-web',
    dsh: { profile: { bundles: ['plugin-manager'] } },
    dependencies: { '@deepseek-ai/dsh-plugin-manager': '0.2.0-rc.2' },
  });
  const out = removeRetiredCompanionDirs(profileDir, { log: () => {}, fail: () => {} });
  assert.strictEqual(fs.existsSync(path.join(official, 'package.json')), true, '官方实现不得被回收');
  assert.deepStrictEqual(out.removedDirs, []);
  assert.deepStrictEqual(out.retracted, []);
  assert.deepStrictEqual(readManifest(profileDir).dsh.profile.bundles, ['plugin-manager']);
});

// ---------------------------------------------------------------------------
// 接线与退役面自证
// ---------------------------------------------------------------------------

test('接线：boot 与 CLI 双入口都调用批量回收，且不再写退役插件的默认禁用块', () => {
  const boot = fs.readFileSync(path.join(__dirname, '..', 'integration', 'plugin-sync.js'), 'utf8');
  const cli = fs.readFileSync(path.join(__dirname, '..', 'sync-companion-plugins.js'), 'utf8');
  for (const [label, src] of [['boot', boot], ['CLI', cli]]) {
    assert.match(src, /removeRetiredCompanionPatchRows\(/, label + ' 入口必须调用 patch 层批量撤回');
    // 「调用方职责漏接」历史上造成过每 boot 刷缺包栈（float-window / dsh-mini）。
    assert.match(src, /syncCompanionFiles\(/, label + ' 入口必须经 syncCompanionFiles 走目录回收');
    for (const gone of ['PET_DISABLE_BLOCK', 'CARDIAN_DISABLE_BLOCK', 'GRAPH_MEMORY_DISABLE_BLOCK']) {
      assert.ok(!src.includes(gone), label + ' 仍引用已下线的 ' + gone);
    }
    assert.ok(!/ensureDisabledPatchEntry\([^;]*harness-pet/.test(src),
      label + ' 不得再给已退役插件写默认禁用行');
  }
});

test('清单：批量退役 11 条已摘出、进名单，且活动清单与退役名单互斥', () => {
  const bulk = ['client-file-changes', 'terminal', 'harness-pet', 'dsh-vision', 'graph-memory',
    'community-market', 'market-desktop-bridge', 'dsh-hub', 'file-drop', 'image-paste', 'cardian'];
  const retiredIds = new Set(RETIRED_COMPANIONS.map((p) => p.id));
  for (const id of bulk) assert.ok(retiredIds.has(id), '应进 RETIRED_COMPANIONS: ' + id);
  assert.strictEqual(RETIRED_COMPANIONS.length, 12, '11 条批量退役 + 1 条 plugin-manager（dirsOnly）');
  const listed = new Set(COMPANION_PLUGINS.map((p) => p.id));
  for (const id of retiredIds) assert.ok(!listed.has(id), '退役条目不得留在清单: ' + id);
  const dirs = new Set(COMPANION_PLUGINS.map(companionDirName));
  for (const d of RETIRED_COMPANION_DIRS) assert.ok(!dirs.has(d), '退役目录不得同时出现在清单里: ' + d);
  // 名字是回收面的唯一来源：把手工删掉的目录名留在名单里才有意义。
  assert.strictEqual(RETIRED_COMPANION_DIRS.length, RETIRED_COMPANIONS.length);
});
