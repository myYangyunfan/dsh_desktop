'use strict';
// ---------------------------------------------------------------------------
// verify-payload-patches.js —— 打包门禁：payload 树的补丁收口核验（只读）。
//
// 拦的是什么：stage-payload.sh 是把 dsh-desktop/node_modules 整棵镜像过去，
// 所以「dev 树滞后于注册表」会原样进入发行包。2026-09-05 实测：4 枚 file 补丁
// （history-page-size / journal-prepend-continuity / chat-scroll-autoload-older /
// conversation-assembly-resilience）+ session-load-graceful 的 v2 全部没进
// 0.6.2 的 payload —— 安装包不含这些已声明的修复，而构建链与全套测试都没报。
//
// 判据与 dev 树单测共用 lib/patch-closure（单一数据源，杜绝两份判据各自漂移）。
//
// 用法：node dsh-desktop/scripts/verify-payload-patches.js [payloadDshDesktopDir]
// 退出码：0 收敛 / 1 有滞后（拒绝出包）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { checkPatchClosure } = require('./lib/patch-closure');
const { buildDevCtx } = require('./patch-deps');

const DESKTOP = path.resolve(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');

const arg = process.argv[2];
const payloadDir = arg
  ? path.resolve(arg)
  : path.join(REPO, 'dsh-tauri', 'package-payload', 'dsh-desktop');

// 允许传 .../dsh-desktop 或直接传 .../dsh-desktop/node_modules。
const appDir = path.basename(payloadDir) === 'node_modules' ? path.dirname(payloadDir) : payloadDir;
const nm = path.join(appDir, 'node_modules');

if (!fs.existsSync(nm)) {
  console.error(`[payload-patches] FATAL: 找不到 payload node_modules：${nm}（stage 未跑？）`);
  process.exit(1);
}

const report = checkPatchClosure(buildDevCtx(() => {}, appDir));
const rel = (f) => path.relative(appDir, f);

if (report.checked === 0) {
  console.error('[payload-patches] FATAL: 一个靶文件都没核到 —— 门禁当前无判定力，视为失败');
  process.exit(1);
}

for (const l of report.lags) {
  console.error(`[payload-patches] LAG  ${l.id} → ${rel(l.file)}`
    + `（${l.status === 'throw' ? 'transform 抛错 ' + l.note : '磁盘字节比代码旧' + (l.note ? '，' + l.note : '')}）`);
}
for (const id of report.noTarget) {
  // payload 是 dev 树的过滤镜像，包本身被排掉时补丁无处可打 —— 告警不拦包。
  console.warn(`[payload-patches] WARN ${id} 在 payload 无靶文件（包未随包发行？= 该补丁对此副本 no-op）`);
}

const summary = `核 ${report.checked} 个靶文件 / file 规格 ${report.fileSpecs} 项 / 滞后 ${report.lags.length}`
  + ` / 无靶 ${report.noTarget.length} / 已退役 ${report.retired.length}`;
if (report.lags.length > 0) {
  console.error(`[payload-patches] FAIL: ${summary}`);
  console.error('[payload-patches] 修法：回 dev 树跑 `node scripts/patch-deps.js` 收口，再重跑 stage-payload.sh');
  console.error('[payload-patches] 带病出包意味着这些已声明的修复不在安装包里（安装后 boot 也拿不到——补丁代码本身就没带上）');
  process.exit(1);
}
console.log(`[payload-patches] OK: ${summary}  (${appDir})`);
