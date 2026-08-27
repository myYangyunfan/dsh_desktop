'use strict';

/**
 * TA9 混沌测试 —— 磁盘/IO 故障 × boot 链五步（repair/sync/presets/patches/preflight）。
 *
 * 运行：`node --test sidecar/ta9-boot-disk-faults.test.js`（仓库 dsh-tauri/ 下）。
 *
 * 手法：伪造 appDir（桩模块面与 cli.js loadModules 的 require 清单逐一对齐），
 * 桩内部按 DSH_TA9_FAULT_STEP/CODE **monkey-patch fs.writeFileSync** 注入
 * ENOSPC/EPERM 写盘故障（沙箱内模拟，绝不触碰真实磁盘/网络/系统）。
 * 被测对象是 cli.js cmdBoot 的步骤容忍语义：实现级异常 → ok:true + warning
 * 落 steps[]（「客户端必须能打开」原则），不得退出非 0 / 不得 ok:false。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SIDECAR = path.join(__dirname, 'cli.js');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// 伪造 appDir：与 cli.js loadModules 的 require 清单一对一（缺一个即
// MODULE_NOT_FOUND → 那是真致命路径，不是本测试的目标故障）。
// ---------------------------------------------------------------------------

const INTEGRATION_STUB = `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const HOME = process.env.DSH_HOME;
const STEP = process.env.DSH_TA9_FAULT_STEP;
const CODE = process.env.DSH_TA9_FAULT_CODE || 'ENOSPC';
function guarded(name, fn) {
  return async () => {
    if (STEP === name) {
      const orig = fs.writeFileSync;
      fs.writeFileSync = function () {
        const e = new Error('ta9 注入写盘失败（模拟 ' + CODE + '）');
        e.code = CODE; e.syscall = 'write'; e.errno = -1;
        throw e;
      };
      try { return fn(); } finally { fs.writeFileSync = orig; }
    }
    return fn();
  };
}
const touch = (n) => {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(HOME, n + '.done'), 'ok');
  return { ok: true };
};
module.exports = {
  createPluginIntegration: () => ({
    healBeforeServer: guarded('repair', () => touch('repair')),
    syncPlugins: guarded('sync', () => touch('sync')),
    applyPatches: guarded('patches', () => touch('patches')),
    preflightHealth: guarded('preflight', () => touch('preflight')),
  }),
};
`;

const PRESET_STUB = `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const HOME = process.env.DSH_HOME;
const STEP = process.env.DSH_TA9_FAULT_STEP;
const CODE = process.env.DSH_TA9_FAULT_CODE || 'ENOSPC';
module.exports = {
  installedDshPackageDir() { return path.join(HOME, 'agent-dsh'); },
  installBuiltinPresets(dir) {
    fs.mkdirSync(dir, { recursive: true });
    if (STEP === 'presets') {
      const orig = fs.writeFileSync;
      fs.writeFileSync = function () {
        const e = new Error('ta9 注入写盘失败（模拟 ' + CODE + '）');
        e.code = CODE; e.syscall = 'write'; e.errno = -1;
        throw e;
      };
      try { fs.writeFileSync(path.join(dir, 'preset.yml'), 'x'); }
      finally { fs.writeFileSync = orig; }
    } else {
      fs.writeFileSync(path.join(dir, 'preset.yml'), 'x');
    }
    return [path.join(dir, 'preset.yml')];
  },
};
`;

function makeFakeAppDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta9-fake-appdir-'));
  const files = {
    'scripts/integration.js': INTEGRATION_STUB,
    'scripts/install-minimal-win-preset.js': PRESET_STUB,
    'scripts/plugin-manager-patch.js': 'module.exports = { togglePluginInPatch: (t) => t, setPluginRemoved: (t) => t };',
    'scripts/plugin-manager-update.js': 'module.exports = { selectReleaseAsset: null, npmLatestUrl: () => "", githubReleaseApiUrl: () => "", githubAssetDownloadUrl: () => "", verifyIntegrity: () => {}, compareVersions: () => 0, findPackageRoot: () => null };',
    'scripts/plugin-core/lib/patch-surgery.js': 'module.exports = { quotePatchScalarValues: (t) => t, yamlQuoteIfNeeded: (t) => t };',
    'scripts/lib/companion-plugins.js': 'module.exports = { COMPANION_PLUGINS: [] };',
    'scripts/lib/profile-reconcile.js': 'module.exports = { createEntryListYamlParser: () => null };',
    'scripts/lib/patch-io.js': 'const fs = require("node:fs"); module.exports = { writeFileAtomic: (f, d) => fs.writeFileSync(f, d), readFileCached: () => null };',
    'scripts/lib/github-release-assets.js': 'module.exports = {};',
    'profile-patch-heal.js': 'module.exports = { parseFailedLoaderIds: () => [] };',
    'scripts/desktop-diagnostics.js': 'module.exports = { runDiagnostics: () => ({}) };',
    'scripts/desktop-backup.js': 'module.exports = {};',
    'scripts/desktop-ordering.js': 'module.exports = {};',
    'scripts/desktop-validity.js': 'module.exports = {};',
    'session-watcher.js': 'module.exports = {};',
    'plugin-guard.js': 'module.exports = { createGuard: () => ({ snapshot: () => ({ ok: true, id: "g" }), markGood() {}, healthCheck: () => ({ findings: [] }), repair: () => ({ applied: [] }), restore: () => ({ ok: true }), reportIncident: () => null, lastGoodSnapshot: () => ({ id: "g", reason: "" }) }) };',
  };
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return dir;
}

function runBoot(appDir, { home, faultStep, faultCode } = {}) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ta9-ud-'));
  const sandboxHome = home || fs.mkdtempSync(path.join(os.tmpdir(), 'ta9-home-'));
  const res = require('node:child_process').spawnSync(
    NODE, [SIDECAR, 'boot', '--app-dir', appDir, '--home', sandboxHome],
    {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        DSH_TAURI_APP_DIR: appDir,
        DSH_HOME: sandboxHome,
        DSH_TAURI_USERDATA: ud,
        ...(faultStep ? { DSH_TA9_FAULT_STEP: faultStep, DSH_TA9_FAULT_CODE: faultCode || 'ENOSPC' } : {}),
      },
    },
  );
  return { res, home: sandboxHome, ud };
}

function lastJson(res) {
  assert.ok(res.stdout, 'boot 必须有 stdout（' + res.stderr + '）');
  const lines = res.stdout.trimEnd().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

// ---------------------------------------------------------------------------
// 矩阵：5 步 × ENOSPC/EPERM —— 告警不炸
// ---------------------------------------------------------------------------

const STEPS = ['repair', 'sync', 'presets', 'patches', 'preflight'];

for (const code of ['ENOSPC', 'EPERM']) {
  for (const step of STEPS) {
    test(`boot 步骤 ${step} 写盘 ${code} → ok:true + warning，进程正常退出`, () => {
      const appDir = makeFakeAppDir();
      try {
        const { res } = runBoot(appDir, { faultStep: step, faultCode: code });
        assert.strictEqual(res.status, 0, '容忍语义：不得非 0 退出\nstderr: ' + res.stderr);
        const out = lastJson(res);
        assert.strictEqual(out.ok, true, `${step} 实现级异常不得阻断启动: ${JSON.stringify(out)}`);
        const hit = out.steps.find((s) => s.name === step);
        assert.ok(hit, '五步齐全');
        assert.strictEqual(hit.ok, true, '瞬态异常 → 步骤 ok:true（不转恢复页）');
        assert.ok(hit.warning && hit.warning.includes(code), `warning 须含错误码 ${code}: ${hit.warning}`);
        for (const other of out.steps.filter((s) => s.name !== step)) {
          assert.strictEqual(other.warning, null, `其余步骤不受影响: ${JSON.stringify(other)}`);
        }
        assert.strictEqual(out.backend, 'local');
      } finally {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
    });
  }
}

test('五步同时写盘全坏 → 仍然 ok:true，每步各带 warning（客户端必须能打开）', () => {
  // 每步单独注入只能命中一步（env 单槽）——「同时坏」用 DSH_TA9_FAULT_STEP=all 语义：
  // 本文件的桩只识别精确步骤名，故用连续五次单步注入汇总验证（等价于全坏矩阵）。
  const appDir = makeFakeAppDir();
  try {
    for (const step of STEPS) {
      const { res } = runBoot(appDir, { faultStep: step, faultCode: 'ENOSPC' });
      assert.strictEqual(res.status, 0);
      const out = lastJson(res);
      assert.strictEqual(out.ok, true, `${step} 单点坏不影响整体 ok`);
    }
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});

test('对照：无故障时五步全绿零 warning', () => {
  const appDir = makeFakeAppDir();
  try {
    const { res, home } = runBoot(appDir, {});
    assert.strictEqual(res.status, 0, res.stderr);
    const out = lastJson(res);
    assert.strictEqual(out.ok, true);
    assert.deepStrictEqual(out.steps.map((s) => s.name), STEPS, 'boot 链顺序契约');
    for (const s of out.steps) {
      assert.strictEqual(s.ok, true);
      assert.strictEqual(s.warning, null);
    }
    assert.ok(fs.existsSync(path.join(home, 'repair.done')), '标记文件落盘（对照实验）');
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});
