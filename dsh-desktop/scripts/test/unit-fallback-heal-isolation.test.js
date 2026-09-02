'use strict';

// K1 fallback-heal-isolation 补丁测试（2026-08-22 重写）。
//
// 源选择教训：dev `node_modules` 是用户在跑实例的 boot 链实时打补丁的战场
// （pristine↔patched 随应用启停漂移，还可能有写入中途态）——测试撞上中途态
// 会得到自相矛盾的结果（marker 在而注入体缺/反之）。本测试改读应用碰不到的
// pristine 暂存树（.tmp-rc2-stage，TA6 同款来源）；缺失时回退 dev 树并按
// 双态（pristine→changed / 已打→already）分别断言，绝不对抗当场状态。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  transformFallbackHealIsolation,
  markers: { FALLBACK_HEAL_ISOLATION_MARKER },
} = require('../lib/patch-adapters');
const { kernel } = require('../compat/kernel-pin.json');

const repoRoot = path.resolve(__dirname, '..', '..');
// 0.1.2-alpha.1：fallback heal 循环重构为 `for (const entry of entries)` +
// proxy/symlink 分派，锚点已重定位。.tmp-rc2-stage（旧内核）仍是旧循环，pristine
// 源回退到 .tmp-kernel 的 0.1.2-alpha.1 消费者安装产物。
// 0.1.2-alpha.2 黄区重靶期：.tmp-kernel 消费者产物已随内核换代过期（alpha.1
// dsh-app-boot import 的 FIRST_PARTY_SECTION_ORDER 在 alpha.2 dsh-system-prompt
// 已消失，行为级测试经 junction 撞 alpha.2 依赖图即炸）——pristine 源改从
// vendored tarball 解包（与 unit-agent-preset-fallback 同款来源，随 pin 换版）。
const PRISTINE_APP_BOOT_TARBALL = path.join(
  repoRoot, 'vendor', 'dsh-kernel', `deepseek-ai-dsh-app-boot-${kernel.packageVersion}.tgz`,
);

/** 解 vendored tarball 到一次性目录，返回 pristine dsh-app-boot 路径。 */
function extractPristineAppBoot() {
  const { after } = require('node:test');
  assert.ok(fs.existsSync(PRISTINE_APP_BOOT_TARBALL), '缺 vendored alpha.3 tarball: ' + PRISTINE_APP_BOOT_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = require('node:child_process').spawnSync(tarBin, ['-xzf', PRISTINE_APP_BOOT_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package', 'lib', 'index.js');
}
const PRISTINE_APP_BOOT = extractPristineAppBoot();
const DEV_APP_BOOT = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');
const installAnchor = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');

/** 取补丁源：优先 pristine 暂存树；缺失回退 dev 树（双态容忍）。 */
function patchSource() {
  if (fs.existsSync(PRISTINE_APP_BOOT)) {
    return { file: PRISTINE_APP_BOOT, src: fs.readFileSync(PRISTINE_APP_BOOT, 'utf8'), pristine: true };
  }
  return { file: DEV_APP_BOOT, src: fs.readFileSync(DEV_APP_BOOT, 'utf8'), pristine: undefined };
}

test('fallback-heal-isolation: 锚点命中 pristine 源且幂等', () => {
  const { file, src } = patchSource();
  const already = src.includes(FALLBACK_HEAL_ISOLATION_MARKER) && src.includes('[fallback-heal] entry ');
  const r = transformFallbackHealIsolation(src, file);
  if (already) {
    assert.equal(r.status, 'already', '完整已打形态应 already');
    assert.ok(src.includes('healRetry'));
    return;
  }
  assert.equal(r.status, 'changed', `锚点应命中（${file}）: ${r.detail || ''}`);
  const r2 = transformFallbackHealIsolation(r.src, file);
  assert.equal(r2.status, 'already', '注入后幂等');
  assert.ok(r.src.includes(FALLBACK_HEAL_ISOLATION_MARKER));
  assert.ok(r.src.includes('[fallback-heal] entry '));
  // 旧「裸 ensureSymlink」循环不再存在（已被 try 包裹版本替换）。
  assert.ok(!r.src.includes('\t\tensureSymlink(link, target);\n\t}'), '裸调用已被容错版本替换');
  // 产物语法合法（app-boot 为 ESM）。
  const tmp = path.join(os.tmpdir(), `dsh-fhi-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, r.src);
  try {
    const res = require('node:child_process').spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, `产物语法合法: ${res.stderr}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('fallback-heal-isolation: 行为级——单名占位不再中断整轮 heal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-heal-'));
  const modDir = path.join(root, 'mod', 'lib');
  fs.mkdirSync(modDir, { recursive: true });
  const { file, src } = patchSource();
  const complete = src.includes(FALLBACK_HEAL_ISOLATION_MARKER) && src.includes('[fallback-heal] entry ');
  const patched = complete ? src : transformFallbackHealIsolation(src, file).src;
  // 双保险断言：写入临时副本前，产物必须确属「已注入」形态（防中场态文件
  // 让行为测试加载到 pristine 模块——重写前该场景表现为 pristine 行号栈）。
  assert.ok(patched.includes('[fallback-heal] entry '), '行为测试模块必须为已注入形态');
  fs.writeFileSync(path.join(modDir, 'index.js'), patched);
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'mod', 'node_modules'), 'junction');

  const home = path.join(root, 'home');
  const scope = path.join(home, 'profiles', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(scope, { recursive: true });
  // K1 现场：credentials-local 被真实目录占位，旧实现在此整轮抛错。
  fs.mkdirSync(path.join(scope, 'dsh-credentials-local'), { recursive: true });

  const { healProfilesModuleFallback } = await import(pathToFileURL(path.join(modDir, 'index.js')).href);

  const chunks = [];
  const origWrite = process.stderr.write;
  process.stderr.write = (c) => { chunks.push(String(c)); return true; };
  let threw = null;
  try {
    // 0.1.2-alpha.1：healProfilesModuleFallback 签名改为单 options 对象。
    await healProfilesModuleFallback({ installAnchor, home });
  } catch (error) {
    threw = error;
  } finally {
    process.stderr.write = origWrite;
  }
  assert.equal(threw, null, `单个坏名字不得让整轮 heal 抛错（K1 根因）: ${threw && threw.stack}`);
  const stderr = chunks.join('');
  assert.ok(stderr.includes('[fallback-heal] entry @deepseek-ai/dsh-credentials-local failed:'), '坏名字必须打显式标记');
  for (const name of ['dsh-base', 'dsh-web-app']) {
    const link = path.join(scope, name);
    const real = fs.realpathSync(link);
    assert.ok(fs.existsSync(path.join(real, 'package.json')), name + ' junction 应 heal 并可解析');
  }
  // 占位目录原样保留（删除交给壳层 repairProfileFallback / 用户决策）。
  assert.ok(fs.existsSync(path.join(scope, 'dsh-credentials-local', )), '占位目录不被删除');
  fs.rmSync(root, { recursive: true, force: true });
});
