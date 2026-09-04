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
const { detachedHits } = require('./lib/js-syntax-scan');

const root = path.resolve(__dirname, '..');
const entryFiles = [
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
  // 内置预设落点自愈（boot repair 步接线，issue #174）与预设槽递归枚举
  // （heal 与 installer 共用单一实现）——随包分发，必须过语法门。
  'scripts/lib/preset-files.js',
  'scripts/lib/preset-heal.js',
  // llm-pi-ai settings 自愈（boot repair 步接线，随包分发，必须过语法门）。
  'scripts/lib/pi-ai-settings-heal.js',
  // settings.yaml 整文档不可解析自愈（boot repair 步接线，「settings service is
  // absent」弹窗根治，随包分发，必须过语法门）。
  'scripts/lib/settings-document-heal.js',
  // profile manifest 孤儿依赖自愈（boot repair 步接线，issue #177）。
  'scripts/lib/profile-orphan-dep-heal.js',
  'scripts/integration/index.js',
  'scripts/patch-web-search-baseurl.js',
  'scripts/patch-menu-viewport.js',
  'scripts/patch-open-project-dir.js',
  'scripts/patch-session-persistence.js',
  'scripts/patch-session-manage.js',
  'scripts/patch-slot-compat.js',
  'scripts/patch-pi-ai-opencode-go-models.js',
  'scripts/gpu-crash-guard.js',
  'scripts/install-minimal-win-preset.js',
  'scripts/patch-deps.js',
  'scripts/patch-pi-ai-credits.js',
  'scripts/sync-companion-plugins.js',
  'scripts/plugin-manager-patch.js',
  'scripts/plugin-manager-update.js',
  'scripts/desktop-diagnostics.js',
  'scripts/desktop-backup.js',
  'scripts/desktop-ordering.js',
  'scripts/desktop-validity.js',
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
