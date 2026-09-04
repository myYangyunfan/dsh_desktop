'use strict';

// settings-document-heal 单元测试：settings.yaml 整文档不可解析自愈（boot repair 步）。
// 覆盖四条路径 + 安全红线：
//   - 健康 / 空文档 → no-op（零改写，字节不变）；
//   - 前导 BOM 致解析失败 → 无损剥 BOM 原样写回（内容零丢失，原件备份 .heal-bom-*）；
//   - 根非 map / 语法错 + 有合法兄弟备份 → restore-backup（损坏件备份 .broken-*，从最近合法备份恢复）；
//   - 损坏 + 无合法备份 → reset-empty（损坏件备份 .broken-*，写 recovered 头空文档，令 settings 提供方能挂载）；
//   - 备份失败 → 放弃覆盖，原文件字节不动（绝不带着坏配置或无备份覆盖用户文件）。
// 真 yaml 路径用本仓 dsh-desktop 安装根同款 yaml 库；strip-bom 分支用 inject.yaml 桩
// 强制「BOM 致 errors」形态（真实 yaml 容忍前导 BOM，不易自然触发）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  healSettingsDocument,
  isHealthySettingsDocument,
  stripLeadingBom,
  settingsFileOf,
} = require('../../scripts/lib/settings-document-heal');

const repoRoot = path.resolve(__dirname, '..', '..');
const NOOP_LOG = () => {};
const HEALTHY = 'ui-theme:\n  mode: dark\nagent-default-model:\n  model: deepseek-v4-flash\n';
const BROKEN_SYNTAX = 'ui-theme:\n  mode: [unclosed\n  : :\n';
const BROKEN_ARRAY = '- a\n- b\n- c\n';

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sdoc-heal-'));
}
function writeSettings(home, text) {
  const file = path.join(home, 'settings.yaml');
  fs.writeFileSync(file, text, 'utf8');
  return file;
}
function readBytes(file) {
  return fs.readFileSync(file);
}

// strip-bom 分支桩：含前导 BOM 即报 errors（模拟「BOM 致解析失败」），否则视为健康 map。
const BOM_FAIL_YAML = {
  parseDocument(text) {
    if (text.charCodeAt(0) === 0xFEFF) return { errors: [{ code: 'BOM' }], toJS: () => ({}) };
    return { errors: [], toJS: () => ({ a: 1 }) };
  },
};

test('settingsFileOf 拼接 home 与 settings.yaml', () => {
  assert.equal(settingsFileOf('C:/x'), path.join('C:/x', 'settings.yaml'));
});

test('stripLeadingBom 仅剥前导 U+FEFF', () => {
  assert.equal(stripLeadingBom('\uFEFFa: 1'), 'a: 1');
  assert.equal(stripLeadingBom('a: 1'), 'a: 1');
});

test('isHealthySettingsDocument: map/空文档健康，数组/语法错不健康', () => {
  const yaml = require(path.join(repoRoot, 'node_modules', 'yaml'));
  assert.equal(isHealthySettingsDocument(yaml, HEALTHY), true, '合法 map 健康');
  assert.equal(isHealthySettingsDocument(yaml, '# only comment\n'), true, '纯注释经 ?? {} 兜底为合法空 map');
  assert.equal(isHealthySettingsDocument(yaml, ''), true, '空串健康');
  assert.equal(isHealthySettingsDocument(yaml, BROKEN_ARRAY), false, '根为数组不健康');
  assert.equal(isHealthySettingsDocument(yaml, BROKEN_SYNTAX), false, '语法错不健康');
});

test('健康文件: no-op，字节不变', () => {
  const home = makeHome();
  const file = writeSettings(home, HEALTHY);
  const before = readBytes(file);
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, false, '健康不应改写');
  assert.equal(r.action, 'none');
  assert.ok(before.equals(readBytes(file)), '文件字节应完全不变');
});

test('文件缺失: no-op（settings-missing）', () => {
  const home = makeHome();
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'settings-missing');
});

test('前导 BOM 致解析失败: 无损剥 BOM 原样写回，原件备份 .heal-bom-*', () => {
  const home = makeHome();
  const file = writeSettings(home, '\uFEFF' + HEALTHY);
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG, inject: { yaml: BOM_FAIL_YAML } });
  assert.equal(r.changed, true, '应触发自愈');
  assert.equal(r.action, 'strip-bom');
  assert.ok(r.backup && r.backup.startsWith(file + '.heal-bom-'), '备份命名 .heal-bom-');
  assert.ok(fs.existsSync(r.backup), '备份文件应存在');
  assert.equal(readBytes(r.backup)[0], 0xEF, '备份应仍含 BOM（EF BB BF 首字节）');
  const after = fs.readFileSync(file, 'utf8');
  assert.equal(after.charCodeAt(0), 'u'.charCodeAt(0), '新文件首字符应为 u（BOM 已剥）');
  assert.ok(after.includes('mode: dark'), '内容应零丢失');
});

test('根为数组 + 无合法备份: reset-empty，损坏件备份 .broken-*，新文件健康', () => {
  const home = makeHome();
  const file = writeSettings(home, BROKEN_ARRAY);
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, true);
  assert.equal(r.action, 'reset-empty');
  assert.ok(r.backup && r.backup.startsWith(file + '.broken-'), '损坏原件应备份为 .broken-*');
  assert.ok(fs.readFileSync(r.backup, 'utf8').includes('- a'), '备份应含原坏内容');
  const yaml = require(path.join(repoRoot, 'node_modules', 'yaml'));
  assert.equal(isHealthySettingsDocument(yaml, fs.readFileSync(file, 'utf8')), true, '重置后应为合法文档');
  assert.ok(fs.readFileSync(file, 'utf8').includes('recovered by DSH Desktop'), '重置应含 recovered 头');
});

test('语法错 + 有合法兄弟备份: restore-backup，从备份恢复且损坏件留档', () => {
  const home = makeHome();
  const file = writeSettings(home, BROKEN_SYNTAX);
  const goodBackup = path.join(home, 'settings.yaml.bak-good');
  fs.writeFileSync(goodBackup, HEALTHY, 'utf8');
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, true);
  assert.equal(r.action, 'restore-backup');
  assert.equal(r.restoredFrom, goodBackup, '应从合法备份恢复');
  assert.ok(r.backup && r.backup.startsWith(file + '.broken-'), '损坏原件应备份 .broken-*');
  assert.equal(fs.readFileSync(file, 'utf8'), HEALTHY, '恢复后内容应等于合法备份');
  assert.ok(fs.readFileSync(r.backup, 'utf8').includes('unclosed'), '损坏备份应保留坏内容供取证');
});

test('多个兄弟备份: 跳过不合法者，取最近一个合法备份', () => {
  const home = makeHome();
  const file = writeSettings(home, BROKEN_SYNTAX);
  const newerBad = path.join(home, 'settings.yaml.bak-newer-bad');
  const olderGood = path.join(home, 'settings.yaml.bak-older-good');
  fs.writeFileSync(newerBad, BROKEN_ARRAY, 'utf8');
  fs.writeFileSync(olderGood, HEALTHY, 'utf8');
  const now = Date.now();
  fs.utimesSync(newerBad, new Date(now - 1000), new Date(now - 1000)); // 较新，但坏
  fs.utimesSync(olderGood, new Date(now - 5000), new Date(now - 5000)); // 较旧，但合法
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, true);
  assert.equal(r.action, 'restore-backup');
  assert.equal(r.restoredFrom, olderGood, '应跳过不合法的较新备份，恢复较旧的合法备份');
});

test('幂等: 修复后二次调用对健康文件 no-op', () => {
  const home = makeHome();
  writeSettings(home, BROKEN_ARRAY);
  const first = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(first.changed, true);
  const second = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(second.changed, false, '二次应 no-op');
  assert.equal(second.action, 'none');
});

test('备份失败: 放弃覆盖，原文件字节不动（绝不无备份覆盖用户配置）', () => {
  const home = makeHome();
  const file = writeSettings(home, BROKEN_ARRAY);
  const before = readBytes(file);
  const failingFs = {
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    readdirSync: (p) => fs.readdirSync(p),
    statSync: (p) => fs.statSync(p),
    renameSync: () => { throw new Error('EACCES rename'); },
    copyFileSync: () => { throw new Error('EACCES copy'); },
  };
  const r = healSettingsDocument({ appDir: repoRoot, home, log: NOOP_LOG, inject: { fs: failingFs } });
  assert.equal(r.changed, false, '备份失败应放弃修改');
  assert.ok(String(r.note).startsWith('backup-failed'), '应记 backup-failed');
  assert.ok(before.equals(readBytes(file)), '原文件字节应完全不动');
});
