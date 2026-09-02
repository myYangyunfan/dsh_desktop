'use strict';

// vendor-kernel-heal 单元测试：boot repair 步清理 vendor/dsh-kernel 里非 pin
// 版本的内核 tarball（NSIS 覆盖安装累积旧包 → compat-pin 版本混装 fail-closed
// 拒启的根治）。
//
// 断言红线：
//   - 混装（有匹配版本 + 有陈旧件）→ 陈旧件移出、compat-pin validate 由 FAIL 转 PASS；
//   - 干净 → no-op 零改动；
//   - 无匹配版本（全是陈旧件）→ 绝不剪（否则掏空 vendor，反把「版本不符」变「无 tarball」）；
//   - vendor 缺失 → 跳过（交给 compat-pin 暴露真问题）；
//   - 幂等：二次运行 no-op 并清理上一轮隔离目录。
// 隔离：全部对 mkdtemp 合成 appDir 操作，绝不触碰真实安装根。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { healVendorStaleKernels, QUARANTINE_DIR_NAME } = require('../lib/vendor-kernel-heal');
const { run: runValidate } = require('../compat/validate-pin');

const WANT = '0.1.2-alpha.5';
const STALE = '0.1.2-alpha.4';

/** 造一个含 kernel-pin.json + vendor/dsh-kernel/<files> 的合成 appDir。 */
function makeAppDir(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-vkh-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pinDir = path.join(root, 'scripts', 'compat');
  fs.mkdirSync(pinDir, { recursive: true });
  const pin = {
    kernel: {
      tag: 'dsh-v' + WANT,
      packageVersion: WANT,
      acquisition: 'offline-tarball',
      pinPolicy: '精确 pin 禁止浮动',
      vendorDir: path.join('vendor', 'dsh-kernel'),
    },
    services: { required: [{ id: 'core', module: '@deepseek-ai/dsh' }], removed: [] },
    protocols: { tui: 'dsh://x' },
  };
  fs.writeFileSync(path.join(pinDir, 'kernel-pin.json'), JSON.stringify(pin, null, 2));
  const vdir = path.join(root, pin.kernel.vendorDir);
  fs.mkdirSync(vdir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(vdir, f), 'payload');
  return { root, vdir };
}

test('混装（3 匹配 + 2 陈旧）→ 移出陈旧件，validate-pin 由 FAIL 转 PASS', (t) => {
  const { root, vdir } = makeAppDir(t, [
    'deepseek-ai-dsh-' + WANT + '.tgz',
    'deepseek-ai-dsh-agent-' + WANT + '.tgz',
    'deepseek-ai-dsh-acp-' + WANT + '.tgz',
    'deepseek-ai-dsh-' + STALE + '.tgz',
    'deepseek-ai-dsh-agent-' + STALE + '.tgz',
  ]);
  assert.equal(runValidate(root).ok, false, '混装前 validate 应 FAIL');

  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, true, '应发生剪除');
  assert.equal(r.pruned.length, 2, '应剪掉 2 个 alpha.4');

  const remain = fs.readdirSync(vdir).filter((f) => f.endsWith('.tgz'));
  assert.equal(remain.length, 3, 'vendor 应只剩 3 个 alpha.5');
  assert.ok(remain.every((f) => f.includes(WANT)), '剩余全为匹配版本');

  const qdir = path.join(path.dirname(vdir), QUARANTINE_DIR_NAME);
  assert.ok(fs.existsSync(qdir), '隔离目录应建立');
  assert.equal(fs.readdirSync(qdir).length, 2, '隔离目录应含 2 个陈旧件');

  assert.equal(runValidate(root).ok, true, '剪除后 validate 应 PASS');
});

test('干净（全匹配）→ no-op 零改动', (t) => {
  const { root, vdir } = makeAppDir(t, ['a-' + WANT + '.tgz', 'b-' + WANT + '.tgz']);
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false);
  assert.equal(r.pruned.length, 0);
  assert.equal(fs.readdirSync(vdir).filter((f) => f.endsWith('.tgz')).length, 2);
});

test('全是陈旧件（无匹配版本）→ 绝不剪，保留文件', (t) => {
  const { root, vdir } = makeAppDir(t, ['a-' + STALE + '.tgz', 'b-' + STALE + '.tgz']);
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'refusing-to-prune-no-matching');
  assert.equal(fs.readdirSync(vdir).filter((f) => f.endsWith('.tgz')).length, 2, '文件保留不掏空');
});

test('vendor 目录缺失 → 跳过（note=vendor-missing）', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-vkh-novendor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pinDir = path.join(root, 'scripts', 'compat');
  fs.mkdirSync(pinDir, { recursive: true });
  const pin = {
    kernel: { tag: 'dsh-v' + WANT, packageVersion: WANT, acquisition: 'offline-tarball', pinPolicy: '精确', vendorDir: 'vendor/dsh-kernel' },
    services: { required: [{ id: 'core', module: '@deepseek-ai/dsh' }] },
    protocols: {},
  };
  fs.writeFileSync(path.join(pinDir, 'kernel-pin.json'), JSON.stringify(pin));
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'vendor-missing');
});

test('幂等：二次运行 no-op 并清理上一轮隔离目录', (t) => {
  const { root, vdir } = makeAppDir(t, ['a-' + WANT + '.tgz', 'b-' + STALE + '.tgz']);
  const r1 = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r1.changed, true);
  const qdir = path.join(path.dirname(vdir), QUARANTINE_DIR_NAME);
  assert.ok(fs.existsSync(qdir), '首轮建立隔离目录');

  const r2 = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r2.changed, false, '次轮 no-op');
  assert.ok(!fs.existsSync(qdir), '次轮清理上轮隔离目录');
});
