'use strict';

// sync-companion-plugins.js CLI 的端到端测试（node --test，全部落在隔离临时
// 目录，绝不触碰真实 ~/.dsh）：
//   A. 空 DSH_HOME 首次同步：20 个配套包落盘、patch 条目/禁用块/bundle 登记
//      与共享实现一致；
//   B. 二次同步零写入（全树 size+mtime 不变）；
//   C. dry-run 零落盘；
//   D. --with-patches：对临时伪造的 dsh 包应用两个运行时补丁（闪跳 + 白名单），
//      二次运行幂等；补丁内容与 main.js 共用同一变换；
//   E. 用户手写 disabled 条目被尊重（不重复 insert）。
// 用法：node --test scripts/test/unit-sync-cli.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const cli = path.join(repoRoot, 'scripts', 'sync-companion-plugins.js');
const {
  FLASH_OLD, FLASH_NEW, SETTINGS_NAMESPACES,
} = require('../lib/runtime-patches');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sync-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runCli(t, home, extraArgs = []) {
  // 输出不经过管道（沙箱限制），只断言落盘结果。
  // PATH 收口到 System32：CLI 的 findDshPackageDir 会经 PATH 探测 `dsh` 命令，
  // 环境 PATH 上的真实 dsh（如 harness 安装）会被当作预设同步目标，把
  // assets/agent-presets 写进真实安装（内容相同、mtime 被改写）——测试必须
  // 封闭，绝不触碰真实环境。System32 保证 where.exe（commandLocations 用）
  // 可用。
  const res = spawnSync(process.execPath, [cli, home, ...extraArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    stdio: 'ignore',
    env: {
      ...process.env,
      DSH_HOME: '',
      PATH: process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : '',
    },
  });
  assert.strictEqual(res.status, 0, `CLI 应正常退出（signal=${res.signal}）`);
}

/** 全树 (relPath -> size:mtimeMs) 快照。 */
function snapshotTree(root) {
  const map = new Map();
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const st = fs.statSync(full);
        map.set(path.relative(root, full), st.size + ':' + st.mtimeMs);
      }
    }
  };
  walk(root);
  return map;
}

test('sync CLI: 空 DSH_HOME 首次同步落盘正确（包/条目/禁用块）', (t) => {
  const home = tmpdir(t);
  runCli(t, home);
  const profileDir = path.join(home, 'profiles', 'web');
  const nm = path.join(profileDir, 'node_modules');
  // 全部配套包落盘
  for (const p of COMPANION_PLUGINS) {
    assert.ok(fs.existsSync(path.join(nm, p.name, 'package.json')), '包应落盘: ' + p.name);
  }
  // manifest 不凭空创建（交给 dsh 首次启动初始化）
  assert.ok(!fs.existsSync(path.join(profileDir, 'package.json')), 'CLI 不得凭空创建 profile manifest');
  // patch：非 bundle 插件 insert 条目；bundle 插件不写 insert
  const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  for (const p of COMPANION_PLUGINS) {
    const isBundleDeclared = (() => {
      const pkgPath = path.join(repoRoot, 'assets', 'plugins', p.name.includes('/') ? p.name.slice(p.name.indexOf('/') + 1) : p.name, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch);
    })();
    if (isBundleDeclared) {
      assert.ok(!patch.includes(`- insert:\n    - id: ${p.id}\n`), 'bundle 插件不得写 insert: ' + p.id);
    } else {
      assert.ok(patch.includes(`- insert:\n    - id: ${p.id}\n      name: '${p.name}'`), '非 bundle 插件应写 insert: ' + p.id);
    }
  }
  // harness-pet 默认禁用块（bundle 校验通过才会写）
  assert.ok(patch.includes('- id: harness-pet\n  disabled: true'), 'harness-pet 默认禁用块应写入');
  // billion-context-dsh 缺 dist 构建产物 → 不注册 → 不写 compaction-basic 禁用块
  const acpOk = fs.existsSync(path.join(repoRoot, 'assets', 'plugins', 'billion-context-dsh', 'dist', 'index.js'));
  assert.strictEqual(patch.includes('compaction-basic'), acpOk, 'compaction-basic 禁用块只应在 ACP bundle 可装配时写入');
});

test('sync CLI: 二次同步零写入；dry-run 零落盘', (t) => {
  const home = tmpdir(t);
  runCli(t, home);
  const before = snapshotTree(home);
  runCli(t, home);
  const after = snapshotTree(home);
  assert.deepStrictEqual(after, before, '二次同步必须零写入（全树 size+mtime 逐文件一致）');
  // dry-run：全新目录零落盘
  const dryHome = path.join(tmpdir(t), 'dry-home');
  runCli(t, dryHome, ['--dry-run']);
  assert.ok(!fs.existsSync(dryHome), 'dry-run 不得创建任何目录');
});

test('sync CLI: --with-patches 应用闪跳与白名单补丁且幂等', (t) => {
  const home = tmpdir(t);
  // 伪造两个官方包的「未打补丁」状态
  const runtimeFile = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js');
  const exposeFile = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.mkdirSync(path.dirname(exposeFile), { recursive: true });
  fs.writeFileSync(runtimeFile, `const x = ${JSON.stringify('prefix ' + FLASH_OLD + ' suffix')};\n`);
  fs.writeFileSync(exposeFile, 'const WEB_SETTINGS_NAMESPACES = [\n\t"dsh-prompt"\n];\n');
  runCli(t, home, ['--with-patches']);
  const runtime = fs.readFileSync(runtimeFile, 'utf8');
  assert.ok(runtime.includes(FLASH_NEW) && !runtime.includes(FLASH_OLD), '闪跳修复应落盘');
  const expose = fs.readFileSync(exposeFile, 'utf8');
  for (const ns of SETTINGS_NAMESPACES) {
    assert.ok(expose.includes('"' + ns + '"'), '白名单应包含 ' + ns);
  }
  // 幂等：二次运行字节级不变
  const r1 = fs.readFileSync(runtimeFile);
  const e1 = fs.readFileSync(exposeFile);
  runCli(t, home, ['--with-patches']);
  assert.deepStrictEqual(fs.readFileSync(runtimeFile), r1, '闪跳补丁二次运行不得改写');
  assert.deepStrictEqual(fs.readFileSync(exposeFile), e1, '白名单补丁二次运行不得改写');
});

test('sync CLI: 尊重用户手写 disabled 条目，不重复 insert', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'),
    '# 用户配置\n- id: balance\n  disabled: true\n');
  runCli(t, home);
  const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  assert.strictEqual((patch.match(/id: balance/g) || []).length, 1, '用户禁用的插件不得再 insert');
  assert.ok(patch.includes('disabled: true'), '用户禁用条目原样保留');
  assert.ok(patch.includes('- id: file-changes'), '其它插件照常注册');
});

test('sync CLI: 卸载标记（removed: true）的配套 bundle 从 manifest 移除，且不进隔离记录', (t) => {
  const home = tmpdir(t);
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  // 预置 manifest：核心 + 已卸载的 balance 配套（残留登记，包目录已被删）
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-balance'] } },
  }, null, 2) + '\n');
  // 卸载标记（插件管理写入的形态）
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'),
    '# dsh web profile patch（由 DSH Desktop 维护）\n- id: balance\n  removed: true\n');
  runCli(t, home);
  const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-balance'), '已卸载的配套 bundle 应从 manifest 移除');
  assert.ok(manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-base'), '核心登记不得受影响');
  assert.ok(!fs.existsSync(path.join(profileDir, 'dsh-desktop.broken-bundles.json')),
    '卸载属用户主动意图，不得写入隔离记录');
  // 幂等：二次运行 manifest 不再改动（已移除的登记不得被重新加回）
  const afterFirst = fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8');
  runCli(t, home);
  assert.strictEqual(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'), afterFirst, '二次同步 manifest 零写入');
});
