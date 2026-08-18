'use strict';

// Electron 主进程：隐藏 BrowserWindow 内运行 renderer-test.js（真实 Chromium +
// 真实 React 渲染 dsh-balance 客户端产物），渲染结果写入临时文件后退出。
//
// 隔离承诺（绝不触碰真实环境）：
//   · app.setPath('userData') → os.tmpdir() 下的临时目录；
//   · 不启动 dsh web 服务、不发起任何网络请求、不读取 ~/.dsh；
//   · 窗口 show:false，全程无可见 UI。
// 结果通道：渲染进程把断言结果写到 env.DSH_BALANCE_RENDERER_RESULT 指定文件，
// 并经 'harness-result' IPC 通知本进程退出码（0=全部通过）。

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');

app.setPath('userData', path.join(os.tmpdir(), 'dsh-balance-renderer-harness-' + Date.now()));

let settled = false;
function finish(code, detail) {
  if (settled) return;
  settled = true;
  if (detail) console.log('[renderer-harness] ' + detail);
  app.exit(code);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: { contextIsolation: false, nodeIntegration: true, sandbox: false },
  });
  ipcMain.once('harness-result', (_event, failures) => {
    finish(failures > 0 ? 1 : 0, '断言失败数：' + failures);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    finish(1, '渲染进程异常退出: ' + JSON.stringify(details));
  });
  // 渲染进程 console 转发到主进程 stdout（便于定位断言失败）
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer] ' + message);
  });
  win.loadFile(path.join(__dirname, 'page.html'));
  // 看门狗：任何卡死都在 30s 内以失败退出
  setTimeout(() => finish(1, 'TIMEOUT: 渲染层测试 30s 未完成'), 30000);
});

app.on('window-all-closed', () => {});
