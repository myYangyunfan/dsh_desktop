'use strict';

// unit-preset-heal.test.js — scripts/lib/preset-heal.js 单测（issue #174 回归网）。
//
// 覆盖场景：
//   1) 缺失补写：空目标根 / home 不存在 → 逐槽建档补写（含 `_preset` 共享模块）；
//   2) 存在不覆盖：用户改过的文件字节级不动，同槽其它缺失文件照常补；
//   3) 容忍：源根缺失 / 目标根不可写（被同名文件占用）/ 单文件写失败 → 不抛，
//      只记 note/failed（repair 步语义：任何子失败绝不阻断启动）；
//   4) 幂等：二遍零写；补写文件 mtime 对齐源 → 与 boot presets 步的
//      size+mtime 判定交叉验证（heal 之后 installer 不再重复写盘）；
//   5) 零字节残留（上次写入被强杀）→ 备份后重写；
//   6) 真随包源端到端：dsh-desktop/assets/agent-presets 全量补进临时 DSH home，
//      断言 8 个内置预设 + `_preset` 落地，且落点正是内核发现的用户预设根
//      （<DSH_HOME>/.agent-presets，@deepseek-ai/dsh-agent-presets includeUserRoot）；
//   7) detectLegacyPresetCopy：旧版本错误落点（payload 内 dsh 包目录）可被诊断出来。
//
// 全部在临时目录里跑，绝不触碰真实 ~/.dsh 与安装目录。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  healBuiltinPresets,
  healPresetSlot,
  listPresetSlots,
  listPresetSlotFiles,
  presetSourceRoot,
  presetDestRoot,
  detectLegacyPresetCopy,
  SHARED_PRESET_DIR,
} = require('../lib/preset-heal');

// presets 步的实现（对账到源）——用它交叉验证 heal 的时间戳对齐语义。
const { installBuiltinPresets, userPresetRoot } = require('../install-minimal-win-preset');
const { slotFileAt } = require('../lib/preset-files');

const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');

const NOOP_LOG = () => {};

/** 收集日志行的 log（断言 note/告警文案用）。 */
function collectingLog() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)) };
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'dsh-preset-heal-'));
}

/** 造一棵假随包源：<root>/a（2 文件）+ b（1 文件 + 子目录，子目录不该被复制）+ _preset。 */
function seedSource(root, version = 1) {
  fs.mkdirSync(path.join(root, 'alpha'), { recursive: true });
  fs.mkdirSync(path.join(root, 'beta'), { recursive: true });
  fs.mkdirSync(path.join(root, SHARED_PRESET_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, 'alpha', 'agent.cordis.yml'), `# alpha v${version}\n- name: './a.mjs'\n`);
  fs.writeFileSync(path.join(root, 'alpha', 'preset.yml'), `name: Alpha v${version}\n`);
  fs.writeFileSync(path.join(root, 'beta', 'agent.cordis.yml'), `# beta v${version}\n`);
  fs.writeFileSync(path.join(root, SHARED_PRESET_DIR, 'shared.mjs'), `export const v = ${version};\n`);
  return root;
}

function filesOf(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort();
  } catch {
    return null;
  }
}

/** 递归列出目录下全部文件的相对路径（正斜杠、升序）——用于「落地集合 == 源集合」对账。 */
function relFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return out.sort();
}

/**
 * 造一棵带嵌套子目录的假随包源（内核出厂 cordis 预设携带 skills/ 子目录的同形态）：
 * 预设可以带任意深的资源目录，枚举必须递归到到底，否则静默丢资源。
 */
function seedNestedSource(root) {
  fs.mkdirSync(path.join(root, 'nested', 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'nested', 'skills', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nested', 'agent.cordis.yml'), "- id: prompts\n  name: './prompts/tool-annotations.yml'\n");
  fs.writeFileSync(path.join(root, 'nested', 'preset.yml'), 'name: Nested\n');
  fs.writeFileSync(path.join(root, 'nested', 'prompts', 'tool-annotations.yml'), 'anchor: |\n  hello\n');
  fs.writeFileSync(path.join(root, 'nested', 'skills', 'demo', 'SKILL.md'), '# demo skill\n');
  return root;
}

// ---------------------------------------------------------------------------
// 1) 缺失补写
// ---------------------------------------------------------------------------

test('缺失补写：空目标根 → 逐槽建档补写全部文件（含 _preset 共享模块）', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = path.join(tmpDir(), 'home'); // home 本身也不存在 → 必须容忍并建档
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  const r = healBuiltinPresets({ appDir: DESKTOP_ROOT, home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: presetDestRoot(home) } });
  assert.equal(r.changed, true);
  assert.equal(r.failed, 0);
  assert.equal(r.added, 4, 'alpha 2 + beta 1 + _preset 1');
  assert.deepEqual(filesOf(path.join(home, '.agent-presets', 'alpha')), ['agent.cordis.yml', 'preset.yml']);
  assert.deepEqual(filesOf(path.join(home, '.agent-presets', 'beta')), ['agent.cordis.yml']);
  assert.deepEqual(filesOf(path.join(home, '.agent-presets', SHARED_PRESET_DIR)), ['shared.mjs']);
});

test('缺失补写：只补缺的那个文件，槽内已有文件不重复写', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  // 先补全，再人为删一个文件（模拟上次写入中断）。
  healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  fs.rmSync(path.join(dest, 'alpha', 'preset.yml'));
  const probe = path.join(dest, 'alpha', 'agent.cordis.yml');
  const st1 = fs.statSync(probe);

  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(r.added, 1, '只补被删的那个文件');
  assert.equal(r.failed, 0);
  assert.ok(fs.existsSync(path.join(dest, 'alpha', 'preset.yml')));
  const st2 = fs.statSync(probe);
  assert.equal(Math.round(st2.mtimeMs), Math.round(st1.mtimeMs), '已存在的文件不得被重写');
});

// ---------------------------------------------------------------------------
// 2) 存在不覆盖（用户数据优先）
// ---------------------------------------------------------------------------

test('存在不覆盖：用户改过的文件字节级不动，同槽缺失文件照常补', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  fs.mkdirSync(path.join(dest, 'alpha'), { recursive: true });
  const userText = '# 我改过的预设：换成本地模型路由\n- name: ./my-router.mjs\n';
  fs.writeFileSync(path.join(dest, 'alpha', 'agent.cordis.yml'), userText);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true }); });

  const { log } = collectingLog();
  const r = healBuiltinPresets({ home, log, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(fs.readFileSync(path.join(dest, 'alpha', 'agent.cordis.yml'), 'utf8'), userText, '用户改动必须原样保留');
  assert.ok(filesOf(path.join(dest, 'alpha')).includes('preset.yml'), '同槽缺失文件仍要补');
  assert.equal(r.replacedEmpty, 0);
  const leftovers = fs.readdirSync(path.join(dest, 'alpha')).filter((n) => /\.bak-/.test(n));
  assert.deepEqual(leftovers, [], '非零字节文件不得走备份路径');
});

test('存在不覆盖：整槽已一致时零写（mtime 不变）', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true }); });

  healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  const probe = path.join(dest, 'alpha', 'agent.cordis.yml');
  const st1 = fs.statSync(probe);
  const r2 = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  const st2 = fs.statSync(probe);
  assert.equal(r2.changed, false, '二遍不得判为有改动');
  assert.equal(r2.added, 0);
  assert.equal(Math.round(st2.mtimeMs), Math.round(st1.mtimeMs), '二遍不得重写已一致文件');
});

// ---------------------------------------------------------------------------
// 2b) 嵌套子目录（预设携带 skills/ 、prompts/ 类资源目录）
// ---------------------------------------------------------------------------

test('嵌套子目录：缺失的相对路径文件逐层建档补写（与源集合完全一致）', (t) => {
  const src = seedNestedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(r.failed, 0);
  assert.equal(r.added, 4, '顶层 2 + prompts/1 + skills/demo/1');
  assert.deepEqual(relFiles(dest), relFiles(src), '落地集合必须与源逐相对路径相等');
  assert.ok(fs.statSync(path.join(dest, 'nested', 'skills', 'demo', 'SKILL.md')).isFile());

  // 二遍：递归后仍须幂等（嵌套文件 size+mtime 已对齐）。
  const r2 = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(r2.changed, false, '嵌套资源二遍不得再判有改动');
  assert.equal(r2.added, 0);
});

test('嵌套子目录：已存在的用户改动字节级保留，其余嵌套资源照常补', (t) => {
  const src = seedNestedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  const df = path.join(dest, 'nested', 'prompts', 'tool-annotations.yml');
  fs.mkdirSync(path.dirname(df), { recursive: true });
  const userText = '# 我自己写的提示词，不得被官方版覆盖\n';
  fs.writeFileSync(df, userText);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(fs.readFileSync(df, 'utf8'), userText, '嵌套目录里的用户数据同样只补不动');
  assert.equal(r.added, 3, 'agent.cordis.yml / preset.yml / skills/demo/SKILL.md');
  assert.ok(fs.existsSync(path.join(dest, 'nested', 'skills', 'demo', 'SKILL.md')));
});

test('嵌套子目录：只补不动的粒度是文件，不会整槽跳过', (t) => {
  const src = seedNestedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  // 用户删了嵌套目录里的一个文件 → 必须能单独补回（旧「只看顶层」实现做不到）。
  fs.rmSync(path.join(dest, 'nested', 'prompts', 'tool-annotations.yml'));
  const probe = path.join(dest, 'nested', 'skills', 'demo', 'SKILL.md');
  const st1 = fs.statSync(probe);
  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(r.added, 1);
  assert.ok(fs.existsSync(path.join(dest, 'nested', 'prompts', 'tool-annotations.yml')));
  assert.equal(Math.round(fs.statSync(probe).mtimeMs), Math.round(st1.mtimeMs), '同槽其它嵌套文件不得被重写');
});

// ---------------------------------------------------------------------------
// 3) 容忍：任何一处不成立都不抛
// ---------------------------------------------------------------------------

test('容忍：源根缺失 → note=source-missing，零写入不抛', (t) => {
  const home = tmpDir();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const missing = path.join(home, 'no-such-assets');
  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: missing, destRoot: presetDestRoot(home) } });
  assert.equal(r.note, 'source-missing');
  assert.equal(r.changed, false);
  assert.equal(fs.existsSync(presetDestRoot(home)), false, '源不可用时不得建目标根');
});

test('容忍：目标根不可写（被同名文件占位）→ note=dest-unwritable，不抛', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  fs.writeFileSync(dest, '我不是目录');
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  const r = healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  assert.match(String(r.note), /dest-unwritable/);
  assert.equal(r.changed, false);
  assert.equal(fs.readFileSync(dest, 'utf8'), '我不是目录', '占位文件不得被动过');
});

test('容忍：单个文件写失败 → 计入 failed，其余照常补', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });
  // 造一个「写不动」的目标：与源文件同名的目录占位（原子写 rename 必失败，
  // 跨平台可行，不依赖软链权限）。
  fs.mkdirSync(path.join(dest, 'beta', 'agent.cordis.yml'), { recursive: true });
  const { lines, log } = collectingLog();
  const r = healBuiltinPresets({ home, log, inject: { sourceRoot: src, destRoot: dest } });
  assert.ok(r.failed >= 1, '占位目标应计入 failed');
  assert.equal(r.added, 3, '其余文件（alpha 2 + _preset 1）仍要补全');
  assert.ok(lines.some((l) => l.includes('补写失败')), '要留可读日志');
  assert.equal(r.changed, true, '部分失败时其余补写仍要记为有改动');
  assert.equal(fs.statSync(path.join(dest, 'beta', 'agent.cordis.yml')).isDirectory(), true, '占位目录不得被破坏');
});

test('容忍：home 为空串时不抛（调用方兜底缺省 home）', () => {
  const r = healBuiltinPresets({ appDir: DESKTOP_ROOT, home: '', log: NOOP_LOG, inject: { sourceRoot: path.join(DESKTOP_ROOT, 'definitely-missing') } });
  assert.equal(r.note, 'source-missing');
});

// ---------------------------------------------------------------------------
// 5) 零字节残留
// ---------------------------------------------------------------------------

test('零字节残留：备份后重写（半写崩溃的自愈路径）', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  fs.mkdirSync(path.join(dest, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'alpha', 'agent.cordis.yml'), ''); // 崩溃残留
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  const { lines, log } = collectingLog();
  const r = healBuiltinPresets({ home, log, inject: { sourceRoot: src, destRoot: dest } });
  assert.equal(r.replacedEmpty, 1);
  assert.ok(fs.readFileSync(path.join(dest, 'alpha', 'agent.cordis.yml'), 'utf8').includes('alpha v1'));
  assert.ok(lines.some((l) => l.includes('零字节残留补写')));
  const backups = fs.readdirSync(path.join(dest, 'alpha')).filter((n) => /\.bak-/.test(n));
  assert.equal(backups.length, 1, '被替换的零字节文件应留一份备份');
});

// ---------------------------------------------------------------------------
// 4) 与 presets 步（对账到源）的交叉语义
// ---------------------------------------------------------------------------

test('heal 补写的文件 mtime 对齐源 → presets 步 fileMatches 命中，不再重复写盘', (t) => {
  const src = seedSource(path.join(tmpDir(), 'src'));
  const home = tmpDir();
  const dest = presetDestRoot(home);
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

  healBuiltinPresets({ home, log: NOOP_LOG, inject: { sourceRoot: src, destRoot: dest } });
  const probe = path.join(dest, 'alpha', 'agent.cordis.yml');
  const before = fs.statSync(probe);
  // 手工重放 presets 步的一致性判定（install-minimal-win-preset 私有函数不可导入，
  // 按其实现同式比对 size + mtime）。
  const sst = fs.statSync(path.join(src, 'alpha', 'agent.cordis.yml'));
  assert.equal(before.size, sst.size);
  assert.equal(Math.round(before.mtimeMs), Math.round(sst.mtimeMs), 'heal 必须把时间戳带到源值');

  // 真源端到端：heal 之后再跑 installer，二遍不得改写任何文件（幂等链闭合）。
  const realHome = tmpDir('dsh-preset-heal-real-');
  t.after(() => fs.rmSync(realHome, { recursive: true, force: true }));
  healBuiltinPresets({ appDir: DESKTOP_ROOT, home: realHome, log: NOOP_LOG });
  const realProbe = path.join(realHome, '.agent-presets', 'router-standard', 'agent.cordis.yml');
  const st1 = fs.statSync(realProbe);
  installBuiltinPresets(realHome);
  const st2 = fs.statSync(realProbe);
  assert.equal(Math.round(st2.mtimeMs), Math.round(st1.mtimeMs), 'installer 不得重写 heal 装好的文件');
});

// ---------------------------------------------------------------------------
// 6) 真随包源端到端（#174 落点根红线）
// ---------------------------------------------------------------------------

test('端到端：随包 8 个内置预设补进 <DSH_HOME>/.agent-presets（内核发现的用户预设根）', (t) => {
  const home = tmpDir('dsh-preset-heal-e2e-');
  const { lines, log } = collectingLog();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const r = healBuiltinPresets({ appDir: DESKTOP_ROOT, home, log });
  assert.equal(r.failed, 0, '真源不应有任何文件补写失败: ' + lines.join(' | '));
  const dest = presetDestRoot(home);
  assert.equal(dest, userPresetRoot(home), 'heal 落点与 installer 的用户预设根同式（同一目录）');
  const ids = listPresetSlots(dest).filter((n) => n !== SHARED_PRESET_DIR).sort();
  assert.deepEqual(ids, [
    'anchored-standard',
    'minimal-win',
    'router-standard',
    'v4-flash-godmode-opencode-go',
    'warmupbetter',
    'warmupbetter-replay',
    'whoami-standard',
    'zero-anchored-standard',
  ].sort(), '8 个内置预设全部出现在可发现根');
  for (const id of ids) {
    assert.ok(fs.existsSync(path.join(dest, id, 'agent.cordis.yml')), id + ' 缺 composition（内核会判 broken 并从选择器剔除）');
    assert.ok(fs.existsSync(path.join(dest, id, 'preset.yml')), id + ' 缺显示名文件');
  }
  // 共享模块目录必须一并落地（zero/whoami 系的 ../_preset/*.mjs 相对引用）。
  assert.ok(filesOf(path.join(dest, SHARED_PRESET_DIR)).length >= 5, '_preset 共享模块缺失');
});

test('端到端：heal 与 installer 共用单一枚举——两条链落地集合逐相对路径相等', (t) => {
  // 预设一旦开始携带子目录（内核 cordis 出厂预设的 skills/ 形态），两份枚举
  // 就会不一致：自愈补了、安装没补（或反之）一遇升级就对不齐。同一份枚举钉死在这里。
  const srcRoot = presetSourceRoot(DESKTOP_ROOT);
  const healedHome = tmpDir('dsh-preset-heal-set-');
  const installedHome = tmpDir('dsh-preset-install-set-');
  t.after(() => {
    fs.rmSync(healedHome, { recursive: true, force: true });
    fs.rmSync(installedHome, { recursive: true, force: true });
  });

  const r = healBuiltinPresets({ appDir: DESKTOP_ROOT, home: healedHome, log: NOOP_LOG });
  assert.equal(r.failed, 0);
  const fromSource = relFiles(srcRoot);
  assert.ok(fromSource.length > 50, '真源文件清单本身要有量（当前 56）');
  assert.deepEqual(relFiles(presetDestRoot(healedHome)), fromSource, 'heal 必须递归补齐源内每一个文件');
  installBuiltinPresets(installedHome);
  assert.deepEqual(relFiles(presetDestRoot(installedHome)), fromSource, 'installer 与 heal 落地同一集合');
  // 时戳也对齐：二遍 boot（presets 步 fileMatches）不得再写盘。
  for (const rel of ['router-standard/agent.cordis.yml', '_preset/skill-search.mjs']) {
    const a = fs.statSync(slotFileAt(presetDestRoot(healedHome), rel));
    const b = fs.statSync(slotFileAt(presetDestRoot(installedHome), rel));
    assert.equal(Math.round(a.mtimeMs), Math.round(b.mtimeMs), rel + ' 两条链时戳必一致');
  }
});

test('端到端：预设 composition 里引用的 @deepseek-ai/* 包在 payload 内可解析', (t) => {
  // 落点对了但包解析不到的话，内核 discovery 会把整行判 broken，用户照样「看不到」。
  const src = presetSourceRoot(DESKTOP_ROOT);
  assert.ok(fs.existsSync(src), '随包预设源必须在位');
  const missing = new Set();
  for (const id of listPresetSlots(src)) {
    if (id === SHARED_PRESET_DIR) continue;
    let text = '';
    try { text = fs.readFileSync(path.join(src, id, 'agent.cordis.yml'), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/name:\s*'(@deepseek-ai\/[a-z0-9-]+)'/g)) {
      if (!fs.existsSync(path.join(DESKTOP_ROOT, 'node_modules', ...m[1].split('/'), 'package.json'))) missing.add(`${id}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing], [], 'composition 引用的内核包必须能在 payload node_modules 解析');
  void t;
});

test('端到端：composition 里的相对引用（./ 与 ../_preset/）在落地目录都能命中文件', (t) => {
  // 内核 discovery 把「预设目录内引用不到」的行判为 broken 并从选择器剔除：
  // 预设一旦开始携带嵌套资源，丢目录就等于丢预设（哪怕落点根是对的）。
  const home = tmpDir('dsh-preset-heal-rel-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  healBuiltinPresets({ appDir: DESKTOP_ROOT, home, log: NOOP_LOG });
  const dest = presetDestRoot(home);
  const missing = [];
  let checked = 0;
  for (const id of listPresetSlots(dest)) {
    if (id === SHARED_PRESET_DIR) continue;
    const dir = path.join(dest, id);
    let text = '';
    try { text = fs.readFileSync(path.join(dir, 'agent.cordis.yml'), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/^\s*name:\s*'?(\.\.?[\/][^'\s]*)'?\s*$/gm)) {
      checked += 1;
      if (!fs.existsSync(path.resolve(dir, m[1]))) missing.push(id + ': ' + m[1]);
    }
  }
  assert.ok(checked >= 10, '真源应有足够多的相对引用被检到（多份预设用不带引号的 ./x.mjs）');
  assert.deepEqual(missing, [], '每条相对引用都必须落在真实文件上');
});

// ---------------------------------------------------------------------------
// 7) 单元面 + 旧落点诊断
// ---------------------------------------------------------------------------

test('listPresetSlots 忽略不存在的根、返回升序目录名', () => {
  assert.deepEqual(listPresetSlots(path.join(os.tmpdir(), 'definitely-not-a-preset-root-' + process.pid)), []);
  const src = seedSource(path.join(tmpDir(), 'src'));
  // '_' (0x5F) 排序在小写字母之前。
  assert.deepEqual(listPresetSlots(src), ['_preset', 'alpha', 'beta']);
  fs.rmSync(src, { recursive: true, force: true });
});

test('listPresetSlotFiles 递归返回相对路径（正斜杠、升序、跳过 node_modules）', () => {
  const src = seedNestedSource(path.join(tmpDir(), 'src'));
  fs.mkdirSync(path.join(src, 'nested', 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(src, 'nested', 'node_modules', 'x', 'index.js'), '// 污染\n');
  assert.deepEqual(listPresetSlotFiles(path.join(src, 'nested')), [
    'agent.cordis.yml',
    'preset.yml',
    'prompts/tool-annotations.yml',
    'skills/demo/SKILL.md',
  ]);
  fs.rmSync(src, { recursive: true, force: true });
});

test('healPresetSlot 不为目标空槽建档（源槽无文件时零副作用）', (t) => {
  const src = path.join(tmpDir(), 'src');
  fs.mkdirSync(path.join(src, 'empty-slot'), { recursive: true });
  const dest = presetDestRoot(tmpDir());
  t.after(() => { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true }); });

  const r = healPresetSlot(path.join(src, 'empty-slot'), path.join(dest, 'empty-slot'), NOOP_LOG);
  assert.equal(r.createdDir, false, '空槽不得留下空目录（内核会报 missing composition）');
  assert.equal(fs.existsSync(path.join(dest, 'empty-slot')), false);
});

test('detectLegacyPresetCopy 指旧版本错误落点（payload 内 dsh 包目录）', (t) => {
  const appDir = tmpDir('dsh-preset-heal-app-');
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  assert.equal(detectLegacyPresetCopy(appDir), '', '干净 payload 不得误报');
  const legacy = path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh', '.agent-presets');
  fs.mkdirSync(legacy, { recursive: true });
  assert.equal(detectLegacyPresetCopy(appDir), legacy);
  assert.equal(detectLegacyPresetCopy(''), '');
});
