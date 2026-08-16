'use strict';
// 依赖层小补丁（幂等）：目录选择器 worker 无消息退出时，把真实退出码/信号带进
// 错误文案。由 postinstall / pack / dist 在打包前应用；匹配失败只告警不中断。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'index.js');

const PATCH_MARKER = 'worker.on("exit", (code, signal) => {';
const OLD_RE = /worker\.on\("exit", \(\) => \{\s*settle\(\(\) => \{\s*reject\(\/\* @__PURE__ \*\/ new Error\("win32 folder dialog worker exited before reporting a result"\)\);\s*\}\);\s*\}\);/;
const NEW_BLOCK = [
  'worker.on("exit", (code, signal) => {',
  '\t\tsettle(() => {',
  '\t\t\tconst suffix = signal ? ` (signal ${signal})` : typeof code === "number" ? ` (exit code ${code})` : "";',
  '\t\t\treject(/* @__PURE__ */ new Error(`win32 folder dialog worker exited before reporting a result${suffix}`));',
  '\t\t});',
  '\t});',
].join('\n');

function main() {
  if (!fs.existsSync(target)) {
    console.log('[patch-deps] dsh-host-directory-picker-native 不存在，跳过');
    return;
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes(PATCH_MARKER)) {
    console.log('[patch-deps] picker worker 退出码补丁已应用，跳过');
    return;
  }
  if (!OLD_RE.test(src)) {
    console.log('[patch-deps] picker-native 未匹配到目标代码（版本可能已更新），跳过');
    return;
  }
  src = src.replace(OLD_RE, NEW_BLOCK);
  fs.writeFileSync(target, src);
  console.log('[patch-deps] 已补丁 picker-native：worker 退出上报 exit code / signal');
}

main();

// 顺带应用 dsh-llm-pi-ai 余额判定补丁：opencode 等第三方 provider 余额不足时返回
// 401 + CreditsError，dsh 原本一律判 AUTH 并显示 "API key is invalid"，误导用户。
// 见 patch-pi-ai-credits.js（幂等，失败只告警不中断）。
require('./patch-pi-ai-credits.js');

// 顺带应用 Menu portal 视口补丁（issue #36）：预设很多时弹层顶部条目被裁掉。
// 开发模式（npm start）直接打 dev node_modules；打包由 after-pack 与启动时
// 运行时补丁覆盖（幂等，锚点不匹配只告警不中断）。
try {
  const { patchMenuViewport } = require('./patch-menu-viewport');
  const n = patchMenuViewport(root, (m) => console.log(m));
  if (n > 0) console.log('[patch-deps] menu-viewport 补丁已应用（dev node_modules）');
} catch (err) {
  console.log('[patch-deps] menu-viewport 补丁跳过: ' + (err && err.message ? err.message : err));
}

// 顺带应用对话删除/归档管理补丁（dsh-session-manager 前置依赖）：开发模式
// （npm start）直接打 dev node_modules；打包由 after-pack 与启动时运行时
// 补丁覆盖（幂等，锚点不匹配只告警不中断）。
try {
  const { patchSessionManage } = require('./patch-session-manage');
  const n = patchSessionManage(root, (m) => console.log(m));
  if (n > 0) console.log('[patch-deps] session-manage 补丁已应用（dev node_modules）');
} catch (err) {
  console.log('[patch-deps] session-manage 补丁跳过: ' + (err && err.message ? err.message : err));
}
