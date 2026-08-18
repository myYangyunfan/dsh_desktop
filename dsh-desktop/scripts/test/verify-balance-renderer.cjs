'use strict';

// dsh-balance 渲染层真实环境验证驱动：用仓库自带的 Electron 在隐藏
// BrowserWindow + 真实 React 18 + 真实 DOM 中运行 renderer-balance-harness。
//
// 隔离承诺：
//   · harness 的 userData 指向 os.tmpdir() 下的临时目录（绝不触碰真实 %APPDATA%）；
//   · 无任何网络请求；不启动 dsh web 服务；不读取 ~/.dsh；窗口 show:false。
//
// 用法：node scripts/test/verify-balance-renderer.cjs

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.join(__dirname, '..', '..');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) {
  console.error('[verify-balance-renderer] 未找到 electron 可执行文件，请先安装依赖（npm install）');
  process.exit(1);
}

const harnessDir = path.join(__dirname, 'renderer-balance-harness');
const resultFile = path.join(os.tmpdir(), 'dsh-balance-renderer-result-' + process.pid + '.json');
fs.rmSync(resultFile, { force: true });

console.log('[verify-balance-renderer] 启动隐藏 Electron 渲染层测试…');
const childEnv = Object.assign({}, process.env, {
  DSH_BALANCE_RENDERER_RESULT: resultFile,
  DSH_DESKTOP_SKIP_AUTO_UPDATE: '1',
  DSH_DESKTOP_SKIP_CLIENT_UPDATE: '1',
  // 无论本机如何配置，harness 绝不使用真实端点/密钥
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_BALANCE_URL: '',
  OPENCODE_GO_API_KEY: '',
  OPENCODE_USAGE_URL: '',
});
// 防御：本机若设置了 ELECTRON_RUN_AS_NODE，Electron 会以纯 Node 模式启动，
// 此时 `require('electron')` 不返回 app API，导致 harness 直接崩溃。必须删除该变量。
delete childEnv.ELECTRON_RUN_AS_NODE;

// --disable-gpu：无 GPU 环境（VM / RDP / CI）下 Chromium GPU 进程会崩溃退出；
// 隐藏窗口渲染层测试用软件渲染即可，跨环境更稳。--no-sandbox 同理利于无沙箱的 CI。
const r = spawnSync(electron, ['--disable-gpu', '--no-sandbox', harnessDir], {
  env: childEnv,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 120000,
});

// CI 诊断落盘：无论成败都把 Electron 全量输出与结果 JSON 写进 .ci-diag，
// 失败时由 workflow 上传 artifact，避免日志域不可达时无从定位。
const diagDir = path.join(__dirname, '..', '..', '.ci-diag');
try {
  fs.mkdirSync(diagDir, { recursive: true });
  fs.writeFileSync(path.join(diagDir, 'balance-renderer.log'),
    '=== stdout ===\n' + (r.stdout || '') + '\n=== stderr ===\n' + (r.stderr || '') +
    '\n=== status: ' + r.status + (r.error ? ' error: ' + r.error.message : '') + ' ===\n');
  if (fs.existsSync(resultFile)) {
    fs.copyFileSync(resultFile, path.join(diagDir, 'balance-renderer-result.json'));
  }
} catch {}
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

if (r.error) {
  console.error('[verify-balance-renderer] 启动失败: ' + r.error.message);
  process.exit(1);
}

if (r.status !== 0) {
  console.error('[verify-balance-renderer] Electron 退出码 ' + r.status + '（详见上方渲染进程输出）');
  process.exit(1);
}

if (!fs.existsSync(resultFile)) {
  console.error('[verify-balance-renderer] 未生成结果文件（渲染进程可能提前崩溃）');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const results = payload.results || [];
let pass = 0;
for (const item of results) {
  if (item.pass) pass += 1;
}
console.log('[verify-balance-renderer] 断言 ' + results.length + ' 项，通过 ' + pass + ' 项，失败 ' + (results.length - pass) + ' 项');
for (const item of results) {
  if (!item.pass) console.error('  ✘ ' + item.name + (item.detail ? ' — ' + item.detail : ''));
}
if (payload.fatal) console.error('[verify-balance-renderer] 渲染进程致命错误：\n' + payload.fatal);

fs.rmSync(resultFile, { force: true });
if (payload.failures > 0 || results.length === 0) {
  console.error('[verify-balance-renderer] ❌ 未通过');
  process.exit(1);
}
console.log('[verify-balance-renderer] ✅ 真实环境渲染层全部通过');
process.exit(0);
