'use strict';

// ta14-upgrade-dirty-home.test.js — 「老用户升级到 v0.5.3」脏现场 × 自愈矩阵。
//
// 场景（全部临时目录仿真 DSH_HOME / 安装树，绝不触碰真实 ~/.dsh）：
//   a) 0.5.0 形态 home：profile bundles 无 presets 步产物、会话引用
//      minimal-win 预设 → installBuiltinPresets 真跑 + resume 回落链（W1）；
//   b) 悬空 junction（K1 根因）：profiles/node_modules/@deepseek-ai/* 指向
//      已删除的 %TEMP% 便携安装 → compositionPreflight 重建（真建 junction）；
//   c) 真实目录占位 → broken 显式报、不删（「不删」语义）；
//   d) 半写 profile package.json → boot 链（inspectBundleDir /
//      scanProfileBundles）容错不炸、其余条目照常处理；
//   e) 旧 Electron 目录残留（%APPDATA%/DSH Desktop 形态）→ 指针文件写入：
//      本仓库为 Rust 侧（src-tauri/src/app/src/logging.rs
//      write_log_pointer_files），以静态断言 + Rust 单测真跑（见
//      ta14-report）；JS 侧做 NSIS / 卸载器保留契约静态断言；
//   f) 陈旧单实例锁（pid 已死 / 复用）：Rust shell-core single_instance
//      （ta14-upgrade-path-matrix.rs 真跑）；JS 侧无锁实现，不越界；
//   4) 卸载重装：保留 %APPDATA%/home 的现场（悬空 + 缺失 + 半写并存）→
//      重装链（installBuiltinPresets + compositionPreflight + boot 容错）
//      全量重建走通 + NSIS 段 / 卸载器保留语义静态断言。
//
// 构造手法照抄 unit-composition-preflight.test.js / unit-agent-preset-fallback.test.js
// / unit-fallback-heal-isolation.test.js。运行：node --test scripts/test/ta14-*.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { compositionPreflight } = require('../integration/fault-isolation');
const { installBuiltinPresets, installBuiltinPreset } = require('../install-minimal-win-preset');
const {
  inspectBundleDir,
  scanProfileBundles,
  BUNDLE_CHECK_CODES,
} = require('../../profile-bundle-heal');
const { transformAgentPresetFallback } = require('../lib/patch-adapters');
const { applyAll } = require('../integration/patch-runner');

const appDir = path.resolve(__dirname, '..', '..'); // dsh-desktop 根（安装副本语义）
const REPO_ROOT = path.resolve(appDir, '..');
const PAYLOAD_PRESETS_DIR = path.join(
  REPO_ROOT, 'dsh-tauri', 'package-payload', 'dsh-desktop',
  'node_modules', '@deepseek-ai', 'dsh-agent-presets'
);
const PRISTINE_INDEX = path.join(PAYLOAD_PRESETS_DIR, 'lib', 'index.js');

function tmpdir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 0.5.0 形态 home：profile 声明 bundles、无任何 presets 步产物。 */
function buildLegacyHome(t) {
  const root = tmpdir(t, 'ta14-home-');
  const home = path.join(root, 'home');
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    dependencies: {
      '@deepseek-ai/dsh-base': 'catalog:',
      '@deepseek-ai/dsh-web-app': 'catalog:',
    },
  }, null, 2));
  return home;
}

/** 安装树仿真：payload 的 dsh-agent-presets pristine 副本（回落补丁 applyAll 后）。 */
function buildInstallTree(t) {
  const tree = tmpdir(t, 'ta14-install-');
  const pkgDir = path.join(tree, 'node_modules', '@deepseek-ai', 'dsh-agent-presets');
  fs.cpSync(PAYLOAD_PRESETS_DIR, pkgDir, { recursive: true });
  const ctx = { home: path.join(tree, 'unused-home'), appDir: tree, userDataDir: path.join(tree, 'ud'), wslMode: false, logs: [], log: () => {} };
  const run = applyAll(ctx);
  assert.equal(run.errors.length, 0, 'applyAll 不应有规格级异常: ' + JSON.stringify(run.errors));
  const patched = fs.readFileSync(path.join(pkgDir, 'lib', 'index.js'), 'utf8');
  assert.ok(patched.includes('dsh-desktop fix: agent-preset-fallback'), '回落补丁必须已注入');
  return { tree, pkgDir };
}

/** 从 transform 产物抽出 resolve 方法体（与 unit-agent-preset-fallback 同手法）。 */
function makeResolve(patchedSrc) {
  const start = patchedSrc.indexOf('async resolve(id) {');
  assert.ok(start !== -1, '产物应含 resolve 方法');
  const end = patchedSrc.indexOf('\n\t\t}', start);
  const methodSrc = patchedSrc.slice(start, end + '\n\t\t}'.length);
  const warns = [];
  class UnknownPresetError extends Error {}
  const sandbox = { UnknownPresetError, warns, console: { warn: (m) => warns.push(String(m)) } };
  const fn = vm.runInNewContext('({' + methodSrc + '}).resolve', sandbox);
  return {
    warns,
    call: (presets, id) => fn.call({ list: async () => presets, defaultId: 'standard' }, id),
  };
}

/** 真实 roster：<home>/.agent-presets 实际目录（与内核 user root 同源）。 */
function rosterOf(home) {
  const dir = path.join(home, '.agent-presets');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ id: e.name, path: path.join(dir, e.name, 'agent.cordis.yml') }));
}

// ---------------------------------------------------------------------------
// a) 0.5.0 → 0.5.3：minimal-win 预设缺失的 resume 回落链 + installBuiltinPresets 真跑
// ---------------------------------------------------------------------------

test('a-050-form：无 presets 步产物，minimal-win 缺失时 resume 回落 minimal（warn 降级不硬失败）', (t) => {
  const home = buildLegacyHome(t);
  const { pkgDir } = buildInstallTree(t);
  // 0.5.0 现场：只装了 shipped roster（cordis/minimal/ptc/standard），无
  // minimal-win 步产物。回落逻辑只依赖 roster 数组（vm 执行注入产物），
  // 直接用新版 shipped roster 仿真。
  const shipped = ['cordis', 'minimal', 'ptc', 'standard']
    .map((id) => ({ id, path: `/<root>/${id}/agent.cordis.yml` }));
  const resolve = makeResolve(fs.readFileSync(path.join(pkgDir, 'lib', 'index.js'), 'utf8'));
  const preset = resolve.call(shipped, 'minimal-win');
  return preset.then((p) => {
    assert.equal(p.id, 'minimal', 'minimal-win 应回落 minimal');
    assert.equal(resolve.warns.length, 1, '回落必须告警一次');
    // home 的 profile 仍是 0.5.0 声明形态（未被破坏）。
    const pkg = JSON.parse(fs.readFileSync(path.join(home, 'profiles', 'web', 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
  });
});

test('a-upgrade：installBuiltinPresets 真跑后 minimal-win 直通（无告警、无需回落）', (t) => {
  const home = buildLegacyHome(t);
  const { pkgDir } = buildInstallTree(t);
  const dests = installBuiltinPresets(home);
  assert.ok(dests.length >= 1, '至少装出 minimal-win');
  const ids = rosterOf(home).map((p) => p.id);
  assert.ok(ids.includes('minimal-win'), '升级后 roster 必须含 minimal-win: ' + ids.join(','));
  // 预设完整性：agent.cordis.yml + preset.yml 双文件。
  const dest = path.join(home, '.agent-presets', 'minimal-win');
  assert.ok(fs.existsSync(path.join(dest, 'agent.cordis.yml')));
  assert.ok(fs.existsSync(path.join(dest, 'preset.yml')));
  const resolve = makeResolve(fs.readFileSync(path.join(pkgDir, 'lib', 'index.js'), 'utf8'));
  const roster = rosterOf(home);
  return resolve.call(roster, 'minimal-win').then((p) => {
    assert.equal(p.id, 'minimal-win', '升级后 minimal-win 直通');
    assert.equal(resolve.warns.length, 0, '已知 id 不得告警');
  });
});

test('a-idempotent：installBuiltinPresets 二遍幂等（已一致跳过写盘）', (t) => {
  const home = buildLegacyHome(t);
  const { pkgDir } = buildInstallTree(t);
  installBuiltinPresets(home);
  const probe = path.join(home, '.agent-presets', 'minimal-win', 'agent.cordis.yml');
  const st1 = fs.statSync(probe);
  installBuiltinPresets(home);
  const st2 = fs.statSync(probe);
  assert.equal(Math.round(st2.mtimeMs), Math.round(st1.mtimeMs), '二遍不得重写已一致文件');
  // 单预设入口（老调用方形态）同样可用。
  const d = installBuiltinPreset(home, 'minimal-win');
  assert.equal(d, path.join(home, '.agent-presets', 'minimal-win'));
});

// ---------------------------------------------------------------------------
// b) K1：悬空 junction 指向已删除的 %TEMP% 便携安装 → compositionPreflight 重建
// ---------------------------------------------------------------------------

test('b-dangling-junction：指向已删 %TEMP% 安装 → 重建指向本安装（真建 junction）', (t) => {
  const home = buildLegacyHome(t);
  const scope = path.join(home, 'profiles', 'node_modules', '@deepseek-ai');
  // 便携安装目录先建、链接、再删模拟「安装被清理后 junction 悬空」。
  const tempInstall = path.join(tmpdir(t, 'ta14-temp-install-'), 'node_modules', '@deepseek-ai', 'dsh-credentials-local');
  fs.mkdirSync(tempInstall, { recursive: true });
  fs.writeFileSync(path.join(tempInstall, 'package.json'), '{"name":"@deepseek-ai/dsh-credentials-local"}');
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(tempInstall, path.join(scope, 'dsh-credentials-local'), 'junction');
  fs.rmSync(path.dirname(path.dirname(path.dirname(tempInstall))), { recursive: true, force: true });
  // 悬空现场成立。
  assert.ok(!fs.existsSync(path.join(scope, 'dsh-credentials-local', 'package.json')), '前置：junction 应悬空');

  const logs = [];
  const report = compositionPreflight({ home, appDir, log: (m) => logs.push(m) });
  assert.equal(report.broken.length, 0, '悬空必须可修: ' + JSON.stringify(report.broken));
  assert.equal(report.repaired.length, 1);
  assert.equal(report.repaired[0].from, 'stale/dangling junction');
  const real = fs.realpathSync(path.join(scope, 'dsh-credentials-local'));
  assert.ok(fs.existsSync(path.join(real, 'package.json')), '重建后必须可解析到本安装副本');
  assert.ok(logs.some((m) => m.includes('已修复')), '修复必须显式日志');
  // 幂等：修复后再跑是健康态。
  const again = compositionPreflight({ home, appDir, log: () => {} });
  assert.deepEqual(again, { checked: ['credentials'], repaired: [], broken: [] });
});

test('b-missing-junction：缺失（0.5.0 从未建过 fallback 树）→ 重建', (t) => {
  const home = buildLegacyHome(t);
  fs.mkdirSync(path.join(home, 'profiles', 'node_modules', '@deepseek-ai'), { recursive: true });
  const report = compositionPreflight({ home, appDir, log: () => {} });
  assert.equal(report.repaired.length, 1);
  assert.equal(report.repaired[0].from, 'missing junction');
  assert.equal(report.broken.length, 0);
});

// ---------------------------------------------------------------------------
// c) 真实目录占位 → broken 显式报、绝不删除
// ---------------------------------------------------------------------------

test('c-real-dir-placeholder：占位目录显式 broken、内容原样保留', (t) => {
  const home = buildLegacyHome(t);
  const placeholder = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-credentials-local');
  fs.mkdirSync(placeholder, { recursive: true });
  fs.writeFileSync(path.join(placeholder, 'sentinel.txt'), 'user data must survive');
  const logs = [];
  const report = compositionPreflight({ home, appDir, log: (m) => logs.push(m) });
  assert.equal(report.repaired.length, 0, '占位不得被「修复」');
  assert.equal(report.broken.length, 1, '占位必须显式 broken');
  assert.ok(report.broken[0].reason.includes('不是 symlink'), '指引必须说明占位与解法');
  assert.ok(logs.some((m) => m.includes('自检失败')), '不可修复必须显式告警');
  assert.ok(fs.statSync(placeholder).isDirectory(), '占位目录不得被删除');
  assert.equal(fs.readFileSync(path.join(placeholder, 'sentinel.txt'), 'utf8'), 'user data must survive', '占位内容不得被动');
});

// ---------------------------------------------------------------------------
// d) 半写 profile package.json → boot 链容错
// ---------------------------------------------------------------------------

test('d-half-written-package-json：截断 JSON 的 bundle → boot 判定「源缺失」不炸', (t) => {
  const home = buildLegacyHome(t);
  const bundlesDir = path.join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai');
  // 好包 + 半写包并存。
  const good = path.join(bundlesDir, 'dsh-web-app');
  const bad = path.join(bundlesDir, 'dsh-base');
  for (const d of [good, bad]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(good, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-web-app',
    dsh: { bundle: { patch: 'patches/entry-list.yml' } },
  }));
  fs.mkdirSync(path.join(good, 'patches'), { recursive: true });
  fs.writeFileSync(path.join(good, 'patches', 'entry-list.yml'), '- name: ok\n');
  fs.writeFileSync(path.join(bad, 'package.json'), '{"name":"@deepseek-ai/dsh-base","dsh":{"bundle":{"pat'); // 半写

  // inspectBundleDir：半写 → 结构化失败码（boot 守卫按「源缺失」跳过，而非崩溃）。
  const r = inspectBundleDir(bad);
  assert.equal(r.ok, false);
  assert.equal(r.code, BUNDLE_CHECK_CODES.PACKAGE_JSON_INVALID);
  assert.ok(r.reason.includes('不是合法 JSON'), 'reason 应说明 JSON 损坏');
  // 好包不受牵连。
  assert.equal(inspectBundleDir(good).ok, true, '半写包不得拖垮相邻 bundle 判定');

  // scanProfileBundles：半写包 try/catch continue，扫描不抛、返回其余合法项。
  const scanned = scanProfileBundles(path.join(home, 'profiles', 'web', 'node_modules'), new Set());
  const names = scanned.map((s) => s.name);
  assert.ok(!names.includes('@deepseek-ai/dsh-base'), '半写包应被跳过');
  assert.ok(names.length === 0 || names.every((n) => n !== '@deepseek-ai/dsh-base'), '不得把半写包当合法 bundle 登记');
});

// ---------------------------------------------------------------------------
// 4) 卸载重装：保留 home 现场（悬空 + 缺失 + 半写并存）→ 重装链全量重建
// ---------------------------------------------------------------------------

test('reinstall：脏现场并存 → installBuiltinPresets + compositionPreflight + boot 容错全量走通', (t) => {
  const home = buildLegacyHome(t);
  // 脏现场 1：悬空 junction（卸载删除了安装目录）。
  const scope = path.join(home, 'profiles', 'node_modules', '@deepseek-ai');
  fs.mkdirSync(scope, { recursive: true });
  const ghost = path.join(tmpdir(t, 'ta14-ghost-'), 'gone');
  fs.mkdirSync(ghost, { recursive: true });
  fs.symlinkSync(ghost, path.join(scope, 'dsh-credentials-local'), 'junction');
  fs.rmSync(path.dirname(ghost), { recursive: true, force: true });
  // 脏现场 2：半写 bundle package.json。
  const bad = path.join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-base');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'package.json'), '{"name":"trunc');
  // 脏现场 3：profile 自身 package.json 半写（boot 扫描链不得抛）。
  fs.writeFileSync(path.join(home, 'profiles', 'web', 'package.json'), '{"dsh": {"profile": {"bund');

  // 重装链 1：预设全量重装（写入 <home>/.agent-presets）。
  installBuiltinPresets(home);
  assert.ok(rosterOf(home).some((p) => p.id === 'minimal-win'));
  // 重装链 2：fallback junction 重建。
  const report = compositionPreflight({ home, appDir, log: () => {} });
  assert.equal(report.broken.length, 0, '悬空必须被重建: ' + JSON.stringify(report.broken));
  assert.equal(report.repaired.length, 1);
  assert.ok(fs.existsSync(fs.realpathSync(path.join(scope, 'dsh-credentials-local', 'package.json'))));
  // 重装链 3：boot 容错半写包被跳过而非崩溃。
  assert.equal(inspectBundleDir(bad).code, BUNDLE_CHECK_CODES.PACKAGE_JSON_INVALID);
  assert.doesNotThrow(() => scanProfileBundles(path.join(home, 'profiles', 'web', 'node_modules'), new Set()));
});

test('reinstall-static：NSIS 升级链与卸载器保留契约（静态断言）', () => {
  // 靶迁移（2026-09-05 定性）：本项原本读 dsh-desktop/uninstaller/{installer.nsh,
  // DSH_Desktop_Uninstaller.cs}，而整目录已被 commit 02981194（一个无关的
  // workspace-chip flash 修复）连带删除且未搬家 ⇒ 本用例从那天起始终 ENOENT。
  // Electron 线的自定义卸载器已不再是交付面；保数据契约现在的活体实现是
  // Tauri 侧 installer-template.nsi 的 $UpdateMode 守卫（menu.rs 注释亦指向它）。
  const nsi = path.join(REPO_ROOT, 'dsh-tauri', 'src-tauri', 'src', 'app', 'nsis', 'installer-template.nsi');
  assert.ok(fs.existsSync(nsi), `升级链模板不在位：${nsi}`);
  const src = fs.readFileSync(nsi, 'utf8');

  // 1) /UPDATE 开关必须被安装与卸载两侧都解析（只一侧 = 升级时被当成真卸载）。
  const getOpts = (src.match(/\$\{GetOptions\} \$CMDLINE "\/UPDATE" \$UpdateMode/g) || []).length;
  assert.ok(getOpts >= 2, `/UPDATE 应被安装与卸载两侧解析，实际 ${getOpts} 处`);

  // 2) 升级时回头复跑旧卸载器必须带 /UPDATE（不带 → 旧卸载器清用户数据）。
  assert.match(src, /StrCpy \$R1 "\$R1 \/UPDATE"/, '复跑旧卸载器必须追加 /UPDATE');

  // 3) 删用户数据必须同时满足「用户勾选」+「非升级」两个条件（只看勾选是
  //    v0.5.0 实错根因：升级静默走到卸载尾段就把 %APPDATA% 清了）。
  const andIdx = src.indexOf('${AndIf} $UpdateMode <> 1');
  const rmIdx = src.indexOf('RmDir /r "$APPDATA');
  assert.ok(andIdx > 0, '删数据分支必须带 $UpdateMode <> 1 的 AndIf 守卫');
  assert.ok(rmIdx > andIdx, '$APPDATA 删除必须落在该守卫之后（不得先删后判）');

  // 4) 自启项在升级时必须保留（否则升级后开机不自启，静默行为变更）。
  assert.match(src, /\$\{If\} \$UpdateMode <> 1\s*\n\s*DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run"/,
    'Run 键清理应被 $UpdateMode <> 1 包裹');
});

// ---------------------------------------------------------------------------
// e) JS 侧静态断言：Rust write_log_pointer_files 与本仓库目录分裂契约同源
// ---------------------------------------------------------------------------

test('e-electron-remnant-static：write_log_pointer_files 存在且指向 logs 四件套', () => {
  const rust = path.join(REPO_ROOT, 'dsh-tauri', 'src-tauri', 'src', 'app', 'src', 'logging.rs');
  assert.ok(fs.existsSync(rust), 'logging.rs 应存在');
  const src = fs.readFileSync(rust, 'utf8');
  assert.ok(src.includes('pub fn write_log_pointer_files'), '指针文件函数应存在');
  assert.ok(src.includes('"DSH Desktop"'), '必须识别旧 Electron userData 目录名');
  assert.ok(src.includes('日志在哪里-LOGS-LOCATION.txt'), '中文指路 README 文件名锁死');
  assert.ok(src.includes('boot-early.log') && src.includes('desktop.log') && src.includes('dsh-web.log'), '指路内容必须覆盖三个真实日志文件');
  // 真跑断言在该 crate 单测（pointer_file_written_into_sibling_electron_dir）。
  assert.ok(src.includes('fn pointer_file_written_into_sibling_electron_dir'), 'in-crate 真跑单测应存在');
});
