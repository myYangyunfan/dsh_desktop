'use strict';

// 构建前语法预检（prepack / predist 自动执行）。
// v0.3.8 事故：main.js 中 `async` 关键字与 function 声明被注释拆开，
// 打包出启动即抛 ReferenceError: async is not defined 的安装包。
// 该类问题 node --check 查不出来（孤立 async 是合法的表达式语句，
// 错误发生在运行时），因此本脚本额外做模式扫描。
// 检查范围与 electron-builder.yml 的 files 清单保持一致（入口 js）。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { detachedHits, stripStringsAndBlockComments } = require('./lib/js-syntax-scan');

const root = path.resolve(__dirname, '..');
const entryFiles = [
  'main.js',
  'preload.js',
  'updater.js',
  'client-updater.js',
  'balance.js',
  'balance-scheduler.js',
  'session-watcher.js',
  'renderer-recovery.js',
  'wsl-backend.js',
  'watchdog.js',
  // 自愈 / 补丁模块（electron-builder files 清单内，随包分发，必须过语法门）。
  'profile-manifest.js',
  'profile-patch-heal.js',
  'profile-bundle-heal.js',
  // 统一补丁引擎与配套插件共享模块（main.js / 同步脚本 / after-pack 共用）。
  'scripts/lib/patch-io.js',
  'scripts/lib/patch-engine.js',
  'scripts/lib/companion-plugins.js',
  'scripts/lib/runtime-patches.js',
  'scripts/lib/companion-profile.js',
  'scripts/lib/profile-reconcile.js',
  'scripts/lib/versions.js',
  'scripts/lib/github-release-assets.js',
  'scripts/lib/js-syntax-scan.js',
  'scripts/lib/preset-guard.js',
  'scripts/lib/log-rotate.js',
  'scripts/lib/crash-prune.js',
  'scripts/lib/memory-observe.js',
  'scripts/lib/roots-index.js',
  'scripts/patch-web-search-baseurl.js',
  'scripts/patch-menu-viewport.js',
  'scripts/patch-session-manage.js',
  'scripts/patch-open-project-dir.js',
  'scripts/patch-replay-degrade.js',
  'scripts/patch-session-persistence.js',
  'scripts/patch-slot-compat.js',
  'scripts/gpu-crash-guard.js',
  'scripts/install-minimal-win-preset.js',
  'scripts/patch-deps.js',
  'scripts/patch-pi-ai-credits.js',
  'scripts/sync-companion-plugins.js',
  'scripts/after-pack.js',
  'scripts/patch-portable-template.js',
  'scripts/plugin-manager-patch.js',
  'scripts/plugin-manager-update.js',
  'scripts/desktop-diagnostics.js',
  'scripts/desktop-backup.js',
  'scripts/desktop-ordering.js',
  'scripts/desktop-validity.js',
  'scripts/boot-bench.js',
];

// （async/await 关键字与 function 声明之间被空行/注释行拆开的孤立关键字）
// 扫描实现收敛到 scripts/lib/js-syntax-scan.js（纯函数单测覆盖）。

const missing = entryFiles.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error('[check-syntax] 缺少入口文件: ' + missing.join(', '));
  process.exit(1);
}

let failed = 0;
for (const file of entryFiles) {
  const filePath = path.join(root, file);
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failed++;
    console.error(`[check-syntax] FAIL ${file}（node --check）`);
    if (result.stderr) console.error(result.stderr.trim());
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const scanned = stripStringsAndBlockComments(text);
  // issue #98 失明防护：preload.js 含正则字面量（如 /[&<>"']/g）。若剥离器
  // 失明复发（正则内引号当字符串起始，吞掉后续代码），非空格字符保留率会
  // 断崖下跌、真实 function 声明被成批吞掉（曾实测 77.2% 涂白 / 19 个被吞）。
  // 硬性断言防回归——失明 = 放行走私。正常基线：保留率 ~29%（字符串/注释/
  // 正则天然占 70%），function 仅字符串字面量内的文本被涂（0 个真实声明）。
  // 阈值 23% 相对基线留 6pp 余量（失明基线 22.8%，fn 吞没断言是主哨兵）。
  if (file === 'preload.js') {
    const ns0 = (text.match(/[^\s]/g) || []).length;
    const ns1 = (scanned.match(/[^\s]/g) || []).length;
    const ratio = ns0 > 0 ? ns1 / ns0 : 1;
    const fn0 = (text.match(/function\b/g) || []).length;
    const fn1 = (scanned.match(/function\b/g) || []).length;
    if (ratio < 0.23 || fn0 - fn1 > 5) {
      failed++;
      const why = ratio < 0.23
        ? `剥离保留率 ${(ratio * 100).toFixed(1)}%（阈值 23%）`
        : `function 被吞 ${fn0 - fn1} 个（阈值 5）`;
      console.error(`[check-syntax] FAIL preload.js（${why}，疑似剥离器失明）`);
      continue;
    }
  }
  const hits = detachedHits(text);
  if (hits.length > 0) {
    failed++;
    console.error(`[check-syntax] FAIL ${file}（疑似 async/await 关键字与声明被拆开）`);
    for (const hit of hits) {
      console.error(`  行 ${hit.line}: 孤立的 ${hit.keyword} 后跟 function 声明，运行时会抛 ReferenceError`);
    }
    continue;
  }
  console.log(`[check-syntax] ok   ${file}`);
}

if (failed > 0) {
  console.error(`[check-syntax] ${failed} 个文件未通过，终止打包。`);
  process.exit(1);
}
console.log('[check-syntax] 全部入口文件语法检查通过。');
