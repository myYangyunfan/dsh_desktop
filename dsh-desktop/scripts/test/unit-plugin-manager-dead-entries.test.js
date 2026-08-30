'use strict';
// 单元测试：无效条目体检 + 一键清理（scripts/plugin-manager-patch.js 的
// listDeadEntries / removeDeadEntriesById，唯一实现在 plugin-core/lib/patch-surgery.js）。
// 样例覆盖三类条目：正常 insert（包在安装根）、正常 disable（包在 profile 根）、
// 错拼死包 disable（真实案例 skill-filesysem）+ 疑似陈旧禁用（id 不在 collect 全量集合）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listDeadEntries, removeDeadEntriesById } = require('../plugin-manager-patch');

/** 临时目录（用完即删）。 */
function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dead-entries-'));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}

/** 样例 profile：patch 文本 + 两个「包在位」的候选根（profile 根 / 安装根）。 */
function buildFixture(dir) {
  // profile node_modules：dsh-balance（scope 包按去 scope 短名落盘的兜底面）
  fs.mkdirSync(path.join(dir, 'profile', 'node_modules', 'dsh-balance'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile', 'node_modules', 'dsh-balance', 'package.json'), '{"name":"dsh-balance","version":"1.0.0"}');
  // 安装根 node_modules：@deepseek-ai/* 核心包所在（billion-context-dsh 为 compaction-acp 声明包）
  fs.mkdirSync(path.join(dir, 'install', 'node_modules', 'billion-context-dsh'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'install', 'node_modules', 'billion-context-dsh', 'package.json'), '{"name":"billion-context-dsh","version":"1.0.0"}');
  const patch = [
    '# dsh web profile patch（由 DSH Desktop 维护）',
    '- insert:',
    '    - id: compaction-acp',
    "      name: 'billion-context-dsh'",
    '- id: dsh-balance',
    "  name: '@deepseek-ai/dsh-balance'",
    '  disabled: true',
    '- id: skill-filesysem',
    "  name: '@deepseek-ai/dsh-skill-filesysem'",
    '  disabled: true',
    '- id: ghost-plugin',
    '  disabled: true',
    '',
  ].join('\n');
  const file = path.join(dir, 'profile', 'cordis.patch.yml');
  fs.writeFileSync(file, patch);
  return { file, patch };
}

/** 体检参数：候选根 + collect() 全量 id 集合（ghost-plugin 不在其中 → 疑似陈旧）。 */
function scanOpts(dir) {
  return {
    searchRoots: [path.join(dir, 'profile', 'node_modules'), path.join(dir, 'install', 'node_modules')],
    knownIds: new Set(['compaction-acp', 'dsh-balance', 'skill-filesysem']),
  };
}

function countId(text, id) {
  return (text.match(new RegExp('- id: ' + id + '\\b', 'g')) || []).length;
}

test('体检：错拼死包进清理集，陈旧禁用只透出，正常条目不误判', (t) => {
  const dir = tmpDir(t);
  const { file } = buildFixture(dir);
  const res = listDeadEntries(file, scanOpts(dir));
  assert.equal(res.ok, true);
  assert.equal(res.patchExists, true);
  assert.deepEqual(res.dead.map((d) => d.id), ['skill-filesysem'], '只有错拼死包判死');
  assert.equal(res.dead[0].name, '@deepseek-ai/dsh-skill-filesysem');
  assert.equal(res.dead[0].disabled, true);
  assert.deepEqual(res.stale.map((s) => s.id), ['ghost-plugin'], '无 name 且 id 不在 collect 集合 → 疑似陈旧');
  // 正常 insert（包在安装根）与正常 disable（包在 profile 根）都不得判死/判陈旧
  assert.ok(!res.dead.concat(res.stale).some((d) => d.id === 'compaction-acp' || d.id === 'dsh-balance'));
});

test('体检：未传 knownIds 时跳过陈旧判定（规则 b 关闭）', (t) => {
  const dir = tmpDir(t);
  const { file } = buildFixture(dir);
  const res = listDeadEntries(file, {
    searchRoots: [path.join(dir, 'profile', 'node_modules'), path.join(dir, 'install', 'node_modules')],
  });
  assert.deepEqual(res.stale, [], 'knownIds 缺省 → 陈旧规则整体跳过');
  assert.deepEqual(res.dead.map((d) => d.id), ['skill-filesysem']);
});

test('体检：patch 文件缺失时降级为无死条目（不抛错）', (t) => {
  const dir = tmpDir(t);
  const res = listDeadEntries(path.join(dir, 'nope', 'cordis.patch.yml'), scanOpts(dir));
  assert.deepEqual(res, { ok: true, patchExists: false, dead: [], stale: [] });
});

test('清理：备份文件生成、条目整块删除、其他条目原样保留', (t) => {
  const dir = tmpDir(t);
  const { file, patch } = buildFixture(dir);
  const res = removeDeadEntriesById(file, ['skill-filesysem']);
  assert.equal(res.changed, true);
  assert.deepEqual(res.removed, ['skill-filesysem']);
  // 备份：cordis.patch.yml.bak-dead-<时间戳>，内容 = 原文
  assert.match(path.basename(res.backup), /^cordis\.patch\.yml\.bak-dead-\d{8}-\d{6}$/);
  assert.equal(fs.readFileSync(res.backup, 'utf8'), patch);
  // 主文件：死条目整块（id/name/disabled 三行）消失
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(!after.includes('skill-filesysem'), '死条目 id 应被删除');
  assert.ok(!after.includes('dsh-skill-filesysem'), '死包名应被删除');
  // 其他条目原样保留
  assert.equal(countId(after, 'compaction-acp'), 1, 'insert 内层条目保留');
  assert.ok(after.includes("name: 'billion-context-dsh'"));
  assert.equal(countId(after, 'dsh-balance'), 1, '正常 disable 条目保留');
  assert.match(after, /- id: dsh-balance\s*\n\s*name: '@deepseek-ai\/dsh-balance'\s*\n\s*disabled: true/);
  assert.equal(countId(after, 'ghost-plugin'), 1, '疑似陈旧条目不在清理集，保留');
  assert.ok(after.includes('# dsh web profile patch（由 DSH Desktop 维护）'), '头部注释保留');
});

test('清理：二遍幂等 no-op（零写入、不新增备份）', (t) => {
  const dir = tmpDir(t);
  const { file } = buildFixture(dir);
  const first = removeDeadEntriesById(file, ['skill-filesysem']);
  assert.equal(first.changed, true);
  const dirAfter = fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith('cordis.patch.yml.bak-dead-'));
  assert.equal(dirAfter.length, 1, '一遍恰好一个备份');
  const before = fs.readFileSync(file, 'utf8');
  const second = removeDeadEntriesById(file, ['skill-filesysem']);
  assert.deepEqual(second, { changed: false, removed: [], backup: null }, '二遍 no-op');
  assert.equal(fs.readFileSync(file, 'utf8'), before, '文件未被改写');
  const dirAfter2 = fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith('cordis.patch.yml.bak-dead-'));
  assert.equal(dirAfter2.length, 1, '不新增备份');
});

test('清理：未点名/非法 id 不产生任何写入（绝不扩大删除面）', (t) => {
  const dir = tmpDir(t);
  const { file, patch } = buildFixture(dir);
  const res = removeDeadEntriesById(file, ['not-in-file', '../evil']);
  assert.deepEqual(res, { changed: false, removed: [], backup: null });
  assert.equal(fs.readFileSync(file, 'utf8'), patch, '文件未被改写');
});

test('清理：删空全部条目时补 []，文件仍是合法顶层数组', (t) => {
  const dir = tmpDir(t);
  const { file } = buildFixture(dir);
  const res = removeDeadEntriesById(file, ['compaction-acp', 'dsh-balance', 'skill-filesysem', 'ghost-plugin']);
  assert.equal(res.changed, true);
  assert.deepEqual(res.removed.sort(), ['compaction-acp', 'dsh-balance', 'ghost-plugin', 'skill-filesysem']);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(!/- id:/.test(after), '条目应全部清空');
  assert.match(after, /\[\]\s*$/, '清空后应补 []（头部注释保留，仍是合法顶层数组）');
});
