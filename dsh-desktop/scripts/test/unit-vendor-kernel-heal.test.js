'use strict';

// vendor-kernel-heal 单元测试：boot repair 步按 vendor/dsh-kernel/SHA256SUMS 的
// 名单清理 vendor/dsh-kernel 里陈旧的内核 tarball（NSIS 覆盖安装累积旧包 →
// compat-pin 未收录于清单 fail-closed 拒启的根治）。
//
// 断言红线：
//   - 混装（清单收录的当前集 + 未收录的陈旧件）→ 陈旧件移出、compat-pin validate
//     由 FAIL 转 PASS；
//   - 干净（磁盘 tgz 全在清单内）→ no-op 零改动；
//   - SHA256SUMS 缺失 → fail-safe 绝不剪，且 compat-pin fail-closed 报错；
//   - 清单收录的 tgz 一个都不在磁盘（全是未收录件）→ 绝不剪（否则掏空 vendor，
//     反把「版本不符」变「无 tarball」）；
//   - vendor 缺失 → 跳过（交给 compat-pin 暴露真问题）；
//   - 幂等：二次运行 no-op 并清理上一轮隔离目录。
// 隔离：全部对 mkdtemp 合成 appDir 操作，绝不触碰真实安装根。

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { healVendorStaleKernels, QUARANTINE_DIR_NAME } = require('../lib/vendor-kernel-heal');
const { run: runValidate } = require('../compat/validate-pin');

const WANT = '0.1.2-alpha.5';
const STALE = '0.1.2-alpha.4';
const CURRENT_A = 'deepseek-ai-dsh-' + WANT + '.tgz';
const CURRENT_B = 'deepseek-ai-dsh-agent-' + WANT + '.tgz';
const CURRENT_C = 'deepseek-ai-dsh-acp-' + WANT + '.tgz';
const STALE_A = 'deepseek-ai-dsh-' + STALE + '.tgz';
const STALE_B = 'deepseek-ai-dsh-agent-' + STALE + '.tgz';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * 造一个含 kernel-pin.json + vendor/dsh-kernel/<files> + SHA256SUMS 的合成 appDir。
 * @param {string[]} diskFiles 写到磁盘的 .tgz（内容逐文件不同）。
 * @param {{listed?: string[], manifest?: boolean}} [opts] listed=清单收录名单
 *   （默认= diskFiles）；manifest=false 时不写 SHA256SUMS。listed 里可以包含
 *   磁盘上并不存在的名字（digest 用合成内容计算，仅名字参与 heal 归类）。
 */
function makeAppDir(t, diskFiles, opts = {}) {
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
  for (const f of diskFiles) fs.writeFileSync(path.join(vdir, f), 'payload:' + f);
  if (opts.manifest !== false) {
    const listed = opts.listed ?? diskFiles;
    const lines = listed.map((f) => {
      const p = path.join(vdir, f);
      const content = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.from('absent:' + f);
      return `${sha256(content)}  ${f}`;
    });
    fs.writeFileSync(path.join(vdir, 'SHA256SUMS'), lines.join('\n') + '\n');
  }
  return { root, vdir };
}

const tgzOnDisk = (vdir) => fs.readdirSync(vdir).filter((f) => f.endsWith('.tgz')).sort();

test('混装（3 当前 + 2 陈旧）→ 移出陈旧件，validate-pin 由 FAIL 转 PASS', (t) => {
  const { root, vdir } = makeAppDir(
    t,
    [CURRENT_A, CURRENT_B, CURRENT_C, STALE_A, STALE_B],
    { listed: [CURRENT_A, CURRENT_B, CURRENT_C] },
  );
  assert.equal(runValidate(root).ok, false, '混装前 validate 应 FAIL');

  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, true, '应发生剪除');
  assert.equal(r.pruned.length, 2, '应剪掉 2 个未收录于 SHA256SUMS 的 tgz');

  const remain = tgzOnDisk(vdir);
  assert.equal(remain.length, 3, 'vendor 应只剩 3 个当前集 tgz');
  assert.ok(remain.every((f) => f.endsWith('-' + WANT + '.tgz')), '剩余全为当前集');

  const qdir = path.join(path.dirname(vdir), QUARANTINE_DIR_NAME);
  assert.ok(fs.existsSync(qdir), '隔离目录应建立');
  assert.equal(fs.readdirSync(qdir).length, 2, '隔离目录应含 2 个陈旧件');

  assert.equal(runValidate(root).ok, true, '剪除后 validate 应 PASS');
});

test('framework 包不同版本线但收录于清单 → 不剪（H-16 回归）', (t) => {
  // cordis/cosmokit 等 framework tarball 版本线与内核 pin 不同，但属于当前集。
  const { root, vdir } = makeAppDir(t, [
    CURRENT_A,
    'deepseek-ai-cordis-4.0.2.tgz',
    'deepseek-ai-cosmokit-1.8.3.tgz',
    STALE_A,
  ], { listed: [CURRENT_A, 'deepseek-ai-cordis-4.0.2.tgz', 'deepseek-ai-cosmokit-1.8.3.tgz'] });

  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, true);
  assert.deepEqual(r.pruned, [STALE_A], '只剪未收录件，framework 包必须保留');
  assert.equal(tgzOnDisk(vdir).length, 3, 'framework 包未被误剪');
  assert.equal(runValidate(root).ok, true);
});

test('干净（全在清单内）→ no-op 零改动', (t) => {
  const { root, vdir } = makeAppDir(t, [CURRENT_A, CURRENT_B]);
  assert.equal(runValidate(root).ok, true, '干净树 validate 应 PASS');
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false);
  assert.equal(r.pruned.length, 0);
  assert.equal(tgzOnDisk(vdir).length, 2);
});

test('SHA256SUMS 缺失 → heal fail-safe 不剪 + validate-pin fail-closed', (t) => {
  const { root, vdir } = makeAppDir(t, [CURRENT_A, STALE_A], { manifest: false });
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false, '清单缺失时绝不剪除');
  assert.equal(r.note, 'manifest-missing');
  assert.equal(tgzOnDisk(vdir).length, 2, '文件全部保留');
  assert.ok(!fs.existsSync(path.join(path.dirname(vdir), QUARANTINE_DIR_NAME)), '不得建立隔离目录');

  const v = runValidate(root);
  assert.equal(v.ok, false, '清单缺失必须 fail-closed');
  assert.ok(v.errors.some((m) => /SHA256SUMS 不可用/.test(m)), `须报清单缺失: ${JSON.stringify(v.errors)}`);
});

test('清单收录件全不在磁盘（全是未收录件）→ 绝不剪，保留文件', (t) => {
  const { root, vdir } = makeAppDir(t, [STALE_A, STALE_B], { listed: [CURRENT_A] });
  const r = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'refusing-to-prune-no-matching');
  assert.equal(tgzOnDisk(vdir).length, 2, '文件保留不掏空');
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
  const { root, vdir } = makeAppDir(t, [CURRENT_A, STALE_A], { listed: [CURRENT_A] });
  const r1 = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r1.changed, true);
  const qdir = path.join(path.dirname(vdir), QUARANTINE_DIR_NAME);
  assert.ok(fs.existsSync(qdir), '首轮建立隔离目录');

  const r2 = healVendorStaleKernels({ appDir: root, log: () => {} });
  assert.equal(r2.changed, false, '次轮 no-op');
  assert.ok(!fs.existsSync(qdir), '次轮清理上轮隔离目录');
});
