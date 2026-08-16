'use strict';

// DSH Desktop — frameless window chrome + IPC bridge (sandbox-safe preload).
//
// 职责：
//   1. 向页面注入自绘窗口栏（36px 玻璃条）：拖拽区、圆角应用图标、
//      标题/版本、菜单按钮（⋯）、最小化/最大化/关闭按钮，替代被移除的
//      原生标题栏与 文件/视图/帮助 菜单栏。
//   2. 通过 contextBridge 暴露 window.dshDesktop（窗口控制 / 菜单动作 /
//      余额刷新），并把主进程推送的余额数据转发成 window 上的
//      "dsh-balance-changed" 事件，供 dsh-balance 插件消费。
//   3. 把 Web UI 内容下移 36px（body padding-top），保证自绘栏不遮挡界面。

const { contextBridge, ipcRenderer } = require('electron');

const BAR_ID = '__dsh_desktop_chrome__';
const BAR_HEIGHT = 36;
const FLOAT_BAR_ID = '__dsh_desktop_floatbar__';
const FLOAT_BAR_HEIGHT = 24;

// ---------------------------------------------------------------------------
// Bridge (always exposed; the balance plugin reads it, the web UI keeps the
// legacy dshDesktop.appVersion field working).
// ---------------------------------------------------------------------------

const dshDesktop = {
  appVersion: '', // 由 chrome:init 回填；旧字段保持存在
  windowControls: {
    minimize: () => ipcRenderer.invoke('chrome:window', { action: 'minimize' }),
    toggleMaximize: () => ipcRenderer.invoke('chrome:window', { action: 'toggle-maximize' }),
    close: () => ipcRenderer.invoke('chrome:window', { action: 'close' }),
    isMaximized: () => ipcRenderer.invoke('chrome:window', { action: 'is-maximized' }),
    onMaximizeChange: (cb) => {
      const listener = (_e, isMax) => { try { cb(isMax); } catch {} };
      ipcRenderer.on('chrome:maximized', listener);
      return () => ipcRenderer.removeListener('chrome:maximized', listener);
    },
  },
  menu: {
    action: (action, payload) => ipcRenderer.invoke('chrome:menu', { action, ...payload }),
  },
  getInfo: () => ipcRenderer.invoke('chrome:init'),
  refreshBalance: () => ipcRenderer.invoke('dsh:balance-refresh'),
  // WSL 后端配置（设置页 dsh-wsl-settings 插件消费）。
  wsl: {
    getConfig: () => ipcRenderer.invoke('dsh:wsl-config'),
    saveConfig: (cfg) => ipcRenderer.invoke('dsh:wsl-config-save', { cfg }),
    recheck: () => ipcRenderer.invoke('dsh:wsl-recheck'),
  },
  // 插件市场：请求主进程原地重启 dsh web 服务（安装/卸载插件后生效）。
  restartService: () => ipcRenderer.invoke('chrome:restart-service', { intent: 'restart-service' }),
  // 「文件」视图的还原请求：changes = [{path, op, oldText, newText}]（逆序）。
  revertFiles: (changes) => ipcRenderer.invoke('dsh:file-revert', { changes }),
  // 「全部文件」视图：用系统默认程序打开项目文件。
  openPath: (path) => ipcRenderer.invoke('dsh:file-open', { path }),
  // 预览面板：用系统浏览器打开 URL（端口预览等）。
  openExternal: (url) => ipcRenderer.invoke('dsh:open-external', { url }),
  // 复制文本到剪贴板（更新源地址等）。
  copyText: (text) => ipcRenderer.invoke('dsh:copy-text', { text }),
  // 赞助二维码：读取支付宝/微信收款码（data URI）。
  sponsorQr: () => ipcRenderer.invoke('dsh:sponsor-qr'),
  // 赞助小窗：打开独立「请作者喝咖啡」窗口（主进程单例）。
  sponsorWindow: () => ipcRenderer.invoke('chrome:sponsor-window'),
  // 会话浮窗（分屏）：主窗请求把某个会话弹出到独立窗口；浮窗关闭自身。
  floatWindow: {
    open: (sessionId) => ipcRenderer.invoke('chrome:float-window', { action: 'open', sessionId }),
    close: () => ipcRenderer.send('float:close'),
  },
  // 桌面宠物原生小窗（harness-pet）：主窗控制开关/状态查询/最小化自动弹出
  // 上报；小窗内关闭自身/搬窗（绝对目标位置）。
  petWindow: {
    open: () => ipcRenderer.invoke('chrome:pet-window', { action: 'open' }),
    toggle: () => ipcRenderer.invoke('chrome:pet-window', { action: 'toggle' }),
    isOpen: () => ipcRenderer.invoke('chrome:pet-window', { action: 'state' }),
    close: () => ipcRenderer.send('pet:close'),
    moveTo: (x, y) => ipcRenderer.send('pet:move-to', { x, y }),
    setAutoOpen: (enabled) => ipcRenderer.send('pet:set-auto-open', { enabled }),
  },
  // 恢复页面（assets/recovery.html）使用的动作与状态读取。
  recovery: {
    getState: () => ipcRenderer.invoke('chrome:recovery-state'),
    reload: () => ipcRenderer.invoke('chrome:recovery-reload'),
    restart: () => ipcRenderer.invoke('chrome:recovery-restart'),
    openLogs: () => ipcRenderer.invoke('chrome:recovery-open-logs'),
  },
};

contextBridge.exposeInMainWorld('dshDesktop', dshDesktop);

// ---------------------------------------------------------------------------
// Renderer 心跳：每 5s 向主进程上报一次。主进程用它兜底判定「挂起但
// Chromium 未发出 unresponsive 事件」的场景（窗口不可见时页面定时器会被
// 节流，主进程只对可见窗口做判定；重新可见时立即补报一次心跳）。
// ---------------------------------------------------------------------------
{
  const beat = () => {
    try { ipcRenderer.send('dsh:renderer-heartbeat'); } catch {}
  };
  beat();
  setInterval(beat, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) beat();
  });
}

// 浮窗模式检测：preload 的 process.argv 由 webPreferences.additionalArguments 注入。
// 浮窗内注入 window.__DSH_FLOAT__ = { sessionId }，供 dsh-float-window 插件识别；
// 并注入一条更细的纯拖拽条（含关闭按钮），跳过完整自绘标题栏。
const FLOAT_ARG = process.argv.find((a) => a.startsWith('--dsh-float='));
const FLOAT_MODE = FLOAT_ARG ? { sessionId: FLOAT_ARG.slice('--dsh-float='.length) } : null;
if (FLOAT_MODE) {
  contextBridge.exposeInMainWorld('__DSH_FLOAT__', FLOAT_MODE);
  // 预置目标会话到 sessions 持久化，让 Web UI 一启动就选中目标会话。
  // 这是比「启动后再 sessions.open()」更可靠的做法：会话服务在 boot 早期
  // 尚未就绪时，open() 会抛 unknown session 导致浮窗空内容/假按键，
  // 而预置持久化让应用默认就带着目标会话首屏渲染。
  try {
    const key = 'dsh.sessions.current';
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      parsed.sessionId = String(FLOAT_MODE.sessionId);
      delete parsed.subagentAddress;
      localStorage.setItem(key, JSON.stringify(parsed));
    }
  } catch (_e) { /* 忽略持久化失败 */ }
}

// 宠物小窗模式检测：preload 的 process.argv 由 webPreferences.additionalArguments
// 注入（createPetWindow 传 --dsh-pet=1）。小窗内注入 window.__DSH_PET__ 供
// harness-pet 插件识别，并隐藏除宠物根节点外的全部界面（页面透明，只显示鲸鱼）。
// 样式注入延迟到 DOMContentLoaded（preload 执行时 document.head 可能尚不存在，
// 直接 append 会抛 TypeError 中断 preload 后续逻辑）。
const PET_MODE = process.argv.includes('--dsh-pet=1');
if (PET_MODE) {
  contextBridge.exposeInMainWorld('__DSH_PET__', {});
  const injectPetPageStyle = () => {
    const style = document.createElement('style');
    style.textContent = 'html,body{background:transparent!important;overflow:hidden!important}body>:not(#harness-pet-root){display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectPetPageStyle);
  else injectPetPageStyle();
}

// 页面异常 → 主进程日志（desktop.log），便于排查插件空白视图。
window.addEventListener('error', (e) => {
  try { ipcRenderer.send('dsh:page-error', 'window.onerror: ' + ((e && (e.message || e.error)) || 'unknown')); } catch {}
});
window.addEventListener('unhandledrejection', (e) => {
  try { ipcRenderer.send('dsh:page-error', 'unhandledrejection: ' + String((e && e.reason && (e.reason.message || e.reason)) || e)); } catch {}
});

// 余额推送 → window 事件（dsh-balance 插件订阅）。
ipcRenderer.on('dsh:balance', (_e, data) => {
  try { window.dispatchEvent(new CustomEvent('dsh-balance-changed', { detail: data })); } catch {}
});

// 宠物小窗状态推送（主进程 pet:state）→ 页面事件 dsh-pet-state
// （harness-pet 插件据此刷新面板按钮文案与主窗宠物互斥状态）。
ipcRenderer.on('pet:state', (_e, data) => {
  try { window.dispatchEvent(new CustomEvent('dsh-pet-state', { detail: data || {} })); } catch {}
});

// 上报「当前观看的会话」ID → 主进程（仅用于完成通知的调试日志）。
// 轮询读取 localStorage['dsh.sessions.current'].sessionId，仅在变化时发送。
{
  let lastReported = '';
  const reportCurrentSession = () => {
    try {
      const raw = localStorage.getItem('dsh.sessions.current');
      const parsed = raw ? JSON.parse(raw) : null;
      const id = parsed && typeof parsed === 'object' ? String(parsed.sessionId || '') : '';
      if (id && id !== lastReported) {
        lastReported = id;
        ipcRenderer.send('dsh:current-session', id);
      }
    } catch (_e) { /* 忽略；会话尚未就绪时无值，下次轮询再试 */ }
  };
  reportCurrentSession();
  setInterval(reportCurrentSession, 3000);
}

// ---------------------------------------------------------------------------
// Chrome DOM
// ---------------------------------------------------------------------------

const CHROME_CSS = `
#${BAR_ID}{position:fixed;top:0;left:0;right:0;height:${BAR_HEIGHT}px;z-index:2147483000;
  display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 10px;
  -webkit-app-region:drag;user-select:none;box-sizing:border-box;
  font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif);
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b1220) 74%,transparent);
  backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,rgba(255,255,255,.09)) 55%,transparent)}
#${BAR_ID} .dch-left{display:flex;align-items:center;gap:8px;min-width:0;
  -webkit-app-region:drag}
#${BAR_ID} .dch-icon{width:20px;height:20px;border-radius:6px;display:block;flex:none;
  -webkit-app-region:drag;background:#f6f8fc;box-shadow:0 1px 3px rgba(0,0,0,.35)}
#${BAR_ID} .dch-title{font-size:12.5px;font-weight:600;letter-spacing:.2px;line-height:16px;
  color:var(--dsw-alias-label-primary,#e6ecff);white-space:nowrap;-webkit-app-region:drag}
#${BAR_ID} .dch-badge{font-size:10px;line-height:14px;padding:1px 6px;border-radius:999px;
  color:var(--dsw-alias-label-tertiary,#93a5d8);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));
  white-space:nowrap;-webkit-app-region:drag;font-family:var(--ds-font-family-code,Consolas,monospace)}
#${BAR_ID} .dch-right{display:flex;align-items:center;gap:2px;-webkit-app-region:no-drag}
#${BAR_ID} .dch-btn{width:30px;height:28px;display:grid;place-items:center;border:none;border-radius:8px;
  background:transparent;color:var(--dsw-alias-label-secondary,#b8c5ea);cursor:pointer;padding:0;
  -webkit-app-region:no-drag;outline:none;transition:background .12s,color .12s}
#${BAR_ID} .dch-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.09));
  color:var(--dsw-alias-label-primary,#eef2ff)}
#${BAR_ID} .dch-btn:active{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(255,255,255,.14))}
#${BAR_ID} .dch-close:hover{background:#e81123;color:#fff}
#${BAR_ID} .dch-menu{position:fixed;top:${BAR_HEIGHT + 8}px;right:8px;width:272px;z-index:2147483001;
  -webkit-app-region:no-drag;box-sizing:border-box;padding:6px;
  background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#0b1220) 92%,white));
  border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:14px;
  box-shadow:0 12px 40px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35);
  backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5);
  color:var(--dsw-alias-label-primary,#e6ecff);font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif)}
#${BAR_ID} .dch-mh{padding:8px 10px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));
  margin-bottom:6px}
#${BAR_ID} .dch-mh-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
#${BAR_ID} .dch-mh-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b9ac4);margin-top:3px;
  line-height:16px;display:flex;gap:8px;flex-wrap:wrap}
#${BAR_ID} .dch-item{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 10px;
  border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#dbe4f8);
  font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer;-webkit-app-region:no-drag}
#${BAR_ID} .dch-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}
#${BAR_ID} .dch-item .dch-kbd{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-caption,#5f6f9c);
  font-family:var(--ds-font-family-code,Consolas,monospace)}
#${BAR_ID} .dch-item .dch-check{margin-left:auto;color:var(--dsw-alias-state-success-primary,#3ddc84);font-size:12px}
#${BAR_ID} .dch-item[data-danger="1"]{color:var(--dsw-alias-state-error-primary,#ff7a85)}
#${BAR_ID} .dch-sep{height:1px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.08));margin:5px 6px}
#${BAR_ID} .dch-repos{padding:6px 10px 10px;margin:2px 0 4px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));
  border-radius:10px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.03))}
#${BAR_ID} .dch-repos-title{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b9ac4);margin-bottom:4px}
#${BAR_ID} .dch-repo-row{display:flex;align-items:center;gap:6px;min-height:24px}
#${BAR_ID} .dch-repo-url{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary,#a9b8de);
  font-family:var(--ds-font-family-code,Consolas,monospace);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;user-select:text;cursor:text}
#${BAR_ID} .dch-copy{flex:none;appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));
  background:transparent;color:var(--dsw-alias-label-secondary,#a9b8de);border-radius:6px;padding:1px 8px;
  font-size:10.5px;cursor:pointer;font-family:inherit;line-height:16px}
#${BAR_ID} .dch-copy:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));
  color:var(--dsw-alias-label-primary,#e6ecff)}
`;

const GLYPHS = {
  menu: '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="2.4" cy="6" r="1.15"/><circle cx="6" cy="6" r="1.15"/><circle cx="9.6" cy="6" r="1.15"/></svg>',
  min: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M2.5 6h7"/></svg>',
  max: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1.4"/></svg>',
  restore: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M4.2 4.2V2.6h5.2v5.2H7.8"/><rect x="2.6" y="4.2" width="5.2" height="5.2" rx="1.2"/></svg>',
  close: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg>',
};

let menuOpen = false;
let menuEl = null;
let maxBtn = null;
let state = { appVersion: '', agentVersion: '', agentSource: '', notifyOnTurnEnd: true, closeToTray: true, showBalanceDock: true };

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderMenu() {
  if (!menuEl) return;
  menuEl.innerHTML = `
    <div class="dch-mh">
      <div class="dch-mh-title">DSH Desktop <span style="font-weight:400;color:var(--dsw-alias-label-tertiary)">v${esc(state.appVersion)}</span></div>
      <div class="dch-mh-sub"><span>agent v${esc(state.agentVersion)}</span><span>${esc(state.agentSource)}</span></div>
    </div>
    <button class="dch-item" data-act="check-agent-update">检查 dsh 更新…</button>
    <button class="dch-item" data-act="check-client-update">检查客户端更新…</button>
    <div class="dch-repos">
      <div class="dch-repos-title">更新源（点击复制）</div>
      <div class="dch-repo-row">
        <span class="dch-repo-url" title="${esc(state.repoUrls ? state.repoUrls.github : '')}">${esc(state.repoUrls ? state.repoUrls.github : '')}</span>
        <button class="dch-copy" data-copy="github" title="复制地址">复制</button>
      </div>
      <div class="dch-repo-row">
        <span class="dch-repo-url" title="${esc(state.repoUrls ? state.repoUrls.gitee : '')}">${esc(state.repoUrls ? state.repoUrls.gitee : '')}</span>
        <button class="dch-copy" data-copy="gitee" title="复制地址">复制</button>
      </div>
    </div>
    <button class="dch-item" data-act="toggle-notify"><span>会话完成通知</span>${state.notifyOnTurnEnd ? '<span class="dch-check">✓</span>' : ''}</button>
    <button class="dch-item" data-act="toggle-close-to-tray"><span>关闭时最小化到托盘</span>${state.closeToTray ? '<span class="dch-check">✓</span>' : ''}</button>
    <button class="dch-item" data-act="toggle-balance"><span>显示余额/本轮费用</span>${state.showBalanceDock ? '<span class="dch-check">✓</span>' : ''}</button>
    <div class="dch-sep"></div>
    <button class="dch-item" data-act="reload"><span>重新加载</span><span class="dch-kbd">Ctrl+R</span></button>
    <button class="dch-item" data-act="devtools"><span>开发者工具</span><span class="dch-kbd">F12</span></button>
    <button class="dch-item" data-act="fullscreen"><span>全屏</span><span class="dch-kbd">F11</span></button>
    <div class="dch-sep"></div>
    <button class="dch-item" data-act="open-browser">在浏览器中打开</button>
    <button class="dch-item" data-act="open-logs">打开日志目录</button>
    <div class="dch-sep"></div>
    <button class="dch-item" data-act="sponsor">☕ 请作者喝咖啡</button>
    <div class="dch-sep"></div>
    <button class="dch-item" data-act="about">关于 DSH Desktop</button>
    <button class="dch-item" data-danger="1" data-act="quit">退出</button>`;
  menuEl.querySelectorAll('.dch-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const act = item.dataset.act;
      if (act === 'toggle-notify' || act === 'toggle-close-to-tray' || act === 'toggle-balance') {
        const next = await dshDesktop.menu.action(act);
        if (next) state = { ...state, ...next };
        renderMenu();
        return;
      }
      closeMenu();
      if (act === 'sponsor') { dshDesktop.sponsorWindow(); return; }
      dshDesktop.menu.action(act);
    });
  });
  // 更新源复制按钮
  menuEl.querySelectorAll('.dch-copy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const kind = btn.dataset.copy;
      const url = state.repoUrls && (kind === 'github' ? state.repoUrls.github : state.repoUrls.gitee);
      if (!url) return;
      const r = await dshDesktop.copyText(url);
      if (r && r.ok) {
        const prev = btn.textContent;
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      }
    });
  });
}

function closeMenu() {
  menuOpen = false;
  if (menuEl) menuEl.hidden = true;
}

function openMenu() {
  if (!menuEl) return;
  dshDesktop.getInfo().then((info) => {
    if (info) state = { ...state, ...info };
    renderMenu();
    menuOpen = true;
    menuEl.hidden = false;
  }).catch(() => {
    renderMenu();
    menuOpen = true;
    menuEl.hidden = false;
  });
}

function setMaximized(isMax) {
  if (!maxBtn) return;
  maxBtn.innerHTML = isMax ? GLYPHS.restore : GLYPHS.max;
  maxBtn.title = isMax ? '还原' : '最大化';
  maxBtn.setAttribute('aria-label', maxBtn.title);
}

function injectFloatBar() {
  if (document.getElementById(FLOAT_BAR_ID)) return;
  const style = document.createElement('style');
  style.textContent = `
  #${FLOAT_BAR_ID}{position:fixed;top:0;left:0;right:0;height:${FLOAT_BAR_HEIGHT}px;z-index:2147483000;
    display:flex;align-items:center;justify-content:flex-end;gap:2px;padding:0 6px 0 10px;
    -webkit-app-region:drag;user-select:none;box-sizing:border-box;
    background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b1220) 70%,transparent);
    border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,rgba(255,255,255,.09)) 50%,transparent)}
  #${FLOAT_BAR_ID} button{width:26px;height:22px;display:grid;place-items:center;border:none;border-radius:7px;
    background:transparent;color:var(--dsw-alias-label-secondary,#b8c5ea);cursor:pointer;padding:0;
    -webkit-app-region:no-drag;outline:none;transition:background .12s,color .12s}
  #${FLOAT_BAR_ID} button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.09));
    color:var(--dsw-alias-label-primary,#eef2ff)}
  #${FLOAT_BAR_ID} button.df-close:hover{background:#e81123;color:#fff}`;
  document.head.appendChild(style);
  const layout = document.createElement('style');
  layout.textContent = `body{box-sizing:border-box!important;padding-top:${FLOAT_BAR_HEIGHT}px!important}`;
  document.head.appendChild(layout);
    // 向页面声明浮窗拖拽条高度：fixed 定位的侧边栏（dsh-better-sidebar）读取
    // 该属性自动下移顶部标签条，body padding 只对普通流内容生效。
    document.documentElement.setAttribute('data-dsh-title-bar-height', String(FLOAT_BAR_HEIGHT));
  const bar = document.createElement('div');
  bar.id = FLOAT_BAR_ID;
  bar.innerHTML = `<button class="df-close" title="关闭" aria-label="关闭">${GLYPHS.close}</button>`;
  document.body.appendChild(bar);
  bar.querySelector('.df-close').addEventListener('click', () => dshDesktop.floatWindow.close());
}

function injectChrome() {
  if (PET_MODE) return; // 宠物小窗模式：只显示宠物，不注入标题栏/浮窗条
  if (FLOAT_MODE) { injectFloatBar(); return; }
  if (document.getElementById(BAR_ID)) return;
  const style = document.createElement('style');
  style.textContent = CHROME_CSS;
  document.head.appendChild(style);

  // 内容区整体下移，避免遮挡 Web UI 顶部。
    // 向页面声明自绘标题栏高度：fixed 定位的侧边栏（dsh-better-sidebar）读取
    // 该属性自动下移顶部标签条，body padding 只对普通流内容生效。
    document.documentElement.setAttribute('data-dsh-title-bar-height', String(BAR_HEIGHT));
  const layout = document.createElement('style');
  layout.textContent = `body{box-sizing:border-box!important;padding-top:${BAR_HEIGHT}px!important}`;
  document.head.appendChild(layout);

  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.innerHTML = `
    <div class="dch-left">
      <img class="dch-icon" alt="" draggable="false" />
      <span class="dch-title">DSH Desktop</span>
      <span class="dch-badge" hidden></span>
    </div>
    <div class="dch-right">
      <button class="dch-btn" data-act="menu" title="菜单" aria-label="菜单">${GLYPHS.menu}</button>
      <button class="dch-btn" data-act="min" title="最小化" aria-label="最小化">${GLYPHS.min}</button>
      <button class="dch-btn" data-act="max" title="最大化" aria-label="最大化">${GLYPHS.max}</button>
      <button class="dch-btn dch-close" data-act="close" title="关闭" aria-label="关闭">${GLYPHS.close}</button>
    </div>
    <div class="dch-menu" hidden></div>`;
  document.body.appendChild(bar);

  const badge = bar.querySelector('.dch-badge');
  const icon = bar.querySelector('.dch-icon');
  maxBtn = bar.querySelector('[data-act="max"]');
  menuEl = bar.querySelector('.dch-menu');

  bar.querySelector('[data-act="min"]').addEventListener('click', () => dshDesktop.windowControls.minimize());
  bar.querySelector('[data-act="max"]').addEventListener('click', () => dshDesktop.windowControls.toggleMaximize());
  bar.querySelector('.dch-close').addEventListener('click', () => dshDesktop.windowControls.close());
  bar.querySelector('[data-act="menu"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuOpen) closeMenu(); else openMenu();
  });

  document.addEventListener('click', (e) => {
    if (menuOpen && !bar.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // 初始化状态
  dshDesktop.getInfo().then((info) => {
    if (!info) return;
    state = { ...state, ...info };
    if (info.appVersion) badge.textContent = 'v' + info.appVersion;
    if (info.agentVersion) badge.title = 'agent v' + info.agentVersion + '（' + info.agentSource + '）';
    if (info.agentVersion) { badge.hidden = false; }
    if (info.iconDataUri) icon.src = info.iconDataUri;
  }).catch(() => {});
  dshDesktop.windowControls.isMaximized().then(setMaximized).catch(() => {});
  dshDesktop.windowControls.onMaximizeChange(setMaximized);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectChrome);
} else {
  injectChrome();
}

// ---------------------------------------------------------------------------
// M3 (Material Design 3) 主题系统
// 注入 M3 主题 CSS 并在设置页面的外观选项中添加第四个主题按钮
// ---------------------------------------------------------------------------

const M3_THEME_KEY = 'dsh-desktop-m3-theme';
const M3_THEME_ATTR = 'data-m3-theme';
let m3ThemeEnabled = false;
let m3SettingsObserver = null;

function m3LoadPreference() {
  try { return localStorage.getItem(M3_THEME_KEY) === 'm3'; }
  catch { return false; }
}

function m3SavePreference(enabled) {
  try { localStorage.setItem(M3_THEME_KEY, enabled ? 'm3' : 'default'); } catch {}
}

function m3ApplyTheme(enabled) {
  m3ThemeEnabled = enabled;
  if (enabled) {
    document.body.setAttribute(M3_THEME_ATTR, 'm3');
    document.documentElement.setAttribute(M3_THEME_ATTR, 'm3');
  } else {
    document.body.removeAttribute(M3_THEME_ATTR);
    document.documentElement.removeAttribute(M3_THEME_ATTR);
  }
  window.dispatchEvent(new CustomEvent('m3-theme-change', { detail: { enabled } }));
}

function m3ToggleTheme() {
  const next = !m3ThemeEnabled;
  m3SavePreference(next);
  m3ApplyTheme(next);
  m3UpdateAllButtons();
  return next;
}

function m3GetThemeCSS() {
  return `
/* ===== M3 (Material Design 3) Theme for DSH ===== */

:root {
  --m3-primary-0: #000000;
  --m3-primary-10: #21005D;
  --m3-primary-20: #381E72;
  --m3-primary-30: #4F378B;
  --m3-primary-40: #6750A4;
  --m3-primary-50: #7F67BE;
  --m3-primary-60: #9A82DB;
  --m3-primary-70: #B69DF8;
  --m3-primary-80: #D0BCFF;
  --m3-primary-90: #EADDFF;
  --m3-primary-95: #F6EDFF;
  --m3-primary-99: #FFFBFE;
  --m3-primary-100: #FFFFFF;
  --m3-secondary-40: #625B71;
  --m3-secondary-80: #CCC2DC;
  --m3-secondary-90: #E8DEF8;
  --m3-tertiary-40: #7D5260;
  --m3-tertiary-80: #EFB8C8;
  --m3-error-40: #B3261E;
  --m3-error-80: #F9DEDC;
  --m3-neutral-10: #1C1B1F;
  --m3-neutral-20: #313033;
  --m3-neutral-40: #605D62;
  --m3-neutral-60: #939094;
  --m3-neutral-80: #CAC6CA;
  --m3-neutral-90: #E6E0E9;
  --m3-neutral-95: #F4EFF4;
  --m3-neutral-99: #FFFBFE;
  --m3-nv-30: #49454F;
  --m3-nv-50: #79747E;
  --m3-nv-60: #938F99;
  --m3-nv-80: #CAC4D0;
  --m3-nv-90: #E7E0EC;
  --m3-primary: var(--m3-primary-40);
  --m3-on-primary: var(--m3-primary-100);
  --m3-primary-container: var(--m3-primary-90);
  --m3-on-primary-container: var(--m3-primary-10);
  --m3-secondary: var(--m3-secondary-40);
  --m3-on-secondary: var(--m3-primary-100);
  --m3-secondary-container: var(--m3-secondary-90);
  --m3-on-secondary-container: #1D192B;
  --m3-tertiary: var(--m3-tertiary-40);
  --m3-on-tertiary: var(--m3-primary-100);
  --m3-tertiary-container: #FFD8E4;
  --m3-on-tertiary-container: #31111D;
  --m3-error: var(--m3-error-40);
  --m3-on-error: var(--m3-primary-100);
  --m3-error-container: var(--m3-error-90);
  --m3-on-error-container: #410E0B;
  --m3-background: var(--m3-neutral-99);
  --m3-on-background: var(--m3-neutral-10);
  --m3-surface: var(--m3-neutral-99);
  --m3-on-surface: var(--m3-neutral-10);
  --m3-surface-variant: var(--m3-nv-90);
  --m3-on-surface-variant: var(--m3-nv-30);
  --m3-surface-container-lowest: #FFFFFF;
  --m3-surface-container-low: var(--m3-neutral-95);
  --m3-surface-container: #F3EDF7;
  --m3-surface-container-high: #ECE6F0;
  --m3-surface-container-highest: #E6E0E9;
  --m3-outline: var(--m3-nv-50);
  --m3-outline-variant: var(--m3-nv-80);
  --m3-shape-xs: 4px;
  --m3-shape-sm: 8px;
  --m3-shape-md: 12px;
  --m3-shape-lg: 16px;
  --m3-shape-xl: 28px;
  --m3-shape-full: 9999px;
  --m3-motion-short: 150ms;
  --m3-motion-medium: 250ms;
  --m3-motion-long: 300ms;
  --m3-easing-standard: cubic-bezier(0.2, 0, 0, 1);
}

/* Dark Mode */
body[data-m3-theme="m3"][data-ds-dark-theme] {
  --m3-primary: var(--m3-primary-80);
  --m3-on-primary: var(--m3-primary-20);
  --m3-primary-container: var(--m3-primary-30);
  --m3-on-primary-container: var(--m3-primary-90);
  --m3-secondary: var(--m3-secondary-80);
  --m3-on-secondary: #332D41;
  --m3-secondary-container: #4A4458;
  --m3-on-secondary-container: var(--m3-secondary-90);
  --m3-tertiary: var(--m3-tertiary-80);
  --m3-on-tertiary: #492532;
  --m3-tertiary-container: #633B48;
  --m3-on-tertiary-container: #FFD8E4;
  --m3-error: #F2B8B5;
  --m3-on-error: #601410;
  --m3-error-container: #8C1D18;
  --m3-on-error-container: #F9DEDC;
  --m3-background: var(--m3-neutral-10);
  --m3-on-background: var(--m3-neutral-90);
  --m3-surface: var(--m3-neutral-10);
  --m3-on-surface: var(--m3-neutral-90);
  --m3-surface-variant: var(--m3-nv-30);
  --m3-on-surface-variant: var(--m3-nv-80);
  --m3-surface-container-lowest: #141218;
  --m3-surface-container-low: #1D1B20;
  --m3-surface-container: #211F26;
  --m3-surface-container-high: #2B2930;
  --m3-surface-container-highest: #36343B;
  --m3-outline: var(--m3-nv-60);
  --m3-outline-variant: var(--m3-nv-30);
}

/* DSW Variable Overrides - Light */
body[data-m3-theme="m3"] {
  --dsw-alias-bg-base: var(--m3-background);
  --dsw-alias-bg-layer-1: var(--m3-surface-container-low);
  --dsw-alias-bg-layer-2: var(--m3-surface-container);
  --dsw-alias-bg-layer-3: var(--m3-surface-container-high);
  --dsw-alias-bg-module-platform: var(--m3-surface-container-high);
  --dsw-alias-border-l1: var(--m3-outline-variant);
  --dsw-alias-border-l2: var(--m3-outline);
  --dsw-alias-border-l3: var(--m3-outline);
  --dsw-alias-label-primary: var(--m3-on-surface);
  --dsw-alias-label-secondary: var(--m3-on-surface-variant);
  --dsw-alias-label-tertiary: var(--m3-outline);
  --dsw-alias-label-caption: var(--m3-outline);
  --dsw-alias-brand-primary: var(--m3-primary);
  --dsw-alias-brand-primary-new-color: var(--m3-primary);
  --dsw-alias-button-primary-fill: var(--m3-primary);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--m3-primary) 88%, var(--m3-on-primary) 12%);
  --dsw-alias-button-primary-label: var(--m3-on-primary);
  --dsw-alias-button-ghost-active-border: var(--m3-outline);
  --dsw-alias-button-ghost-active-fill: var(--m3-surface-container-high);
  --dsw-alias-interactive-bg-hover: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
  --dsw-alias-interactive-bg-hover-solid: var(--m3-surface-container-high);
  --dsw-alias-interactive-bg-active: color-mix(in srgb, var(--m3-on-surface) 12%, transparent);
  --dsw-alias-state-success-primary: #2E7D32;
  --dsw-alias-state-success-secondary: #66BB6A;
  --dsw-alias-state-success-tertiary: #C8E6C9;
  --dsw-alias-state-error-primary: var(--m3-error);
  --dsw-alias-state-warn-primary: #F57C00;
  --dsw-alias-state-warn-secondary: #FFB74D;
  --dsw-alias-state-warn-tertiary: #FFE0B2;
  --dsw-alias-state-business-primary: var(--m3-tertiary);
  --dsw-alias-state-business-tertiary: var(--m3-tertiary-container);
  --dsw-specific-sidebar-fill: var(--m3-surface-container-low);
  --dsw-specific-sidebar-nav-item-active: var(--m3-secondary-container);
  --dsw-specific-sidebar-nav-item-active-accent: var(--m3-primary);
  --dsw-specific-sidebar-nav-item-hover: var(--m3-surface-container);
  --dsw-specific-input-major: var(--m3-surface-container-high);
  --dsw-specific-login-input: var(--m3-surface-container);
  --dsw-specific-bubble: var(--m3-primary-container);
  --dsw-specific-bubble-highlight: var(--m3-secondary-container);
  --dsw-specific-menu: var(--m3-surface-container-high);
  --dsw-specific-selector: var(--m3-surface-container);
  --dsw-alias-markdown-code-block: var(--m3-surface-container);
  --dsw-alias-markdown-code-block-banner: var(--m3-surface-container-high);
  --dsw-alias-markdown-inline-code: var(--m3-surface-container-high);
  --dsw-alias-markdown-tag: var(--m3-surface-container-high);
  --dsw-shadow-lv1: 0 1px 2px 0 rgba(0,0,0,.03), 0 1px 3px 0 rgba(0,0,0,.05);
  --dsw-shadow-lv2: 0 2px 4px 0 rgba(0,0,0,.04), 0 4px 8px 0 rgba(0,0,0,.06);
  --dsw-shadow-lv3: 0 4px 8px 0 rgba(0,0,0,.06), 0 8px 16px 0 rgba(0,0,0,.08);
  transition: background-color var(--m3-motion-medium) var(--m3-easing-standard),
              color var(--m3-motion-medium) var(--m3-easing-standard);
}

/* DSW Variable Overrides - Dark */
body[data-m3-theme="m3"][data-ds-dark-theme] {
  --dsw-alias-bg-base: var(--m3-background);
  --dsw-alias-bg-layer-1: var(--m3-surface-container-low);
  --dsw-alias-bg-layer-2: var(--m3-surface-container);
  --dsw-alias-bg-layer-3: var(--m3-surface-container-high);
  --dsw-alias-border-l1: var(--m3-outline-variant);
  --dsw-alias-border-l2: var(--m3-outline);
  --dsw-alias-label-primary: var(--m3-on-surface);
  --dsw-alias-label-secondary: var(--m3-on-surface-variant);
  --dsw-alias-label-tertiary: var(--m3-outline);
  --dsw-alias-button-primary-fill: var(--m3-primary);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--m3-primary) 88%, var(--m3-on-primary) 12%);
  --dsw-alias-button-primary-label: var(--m3-on-primary);
  --dsw-alias-interactive-bg-hover: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
  --dsw-alias-interactive-bg-hover-solid: var(--m3-surface-container-high);
  --dsw-specific-sidebar-fill: var(--m3-surface-container-low);
  --dsw-specific-sidebar-nav-item-active: var(--m3-secondary-container);
  --dsw-specific-sidebar-nav-item-hover: var(--m3-surface-container);
  --dsw-specific-bubble: var(--m3-primary-container);
  --dsw-specific-input-major: var(--m3-surface-container-high);
}

/* M3 Theme Button in Settings */
.m3-theme-option {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 14px;
  border: 2px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #1a1a2e);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2,0,0,1);
  font-size: 12px; font-weight: 500;
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  min-width: 64px;
}
.m3-theme-option:hover {
  border-color: var(--m3-primary, #6750A4);
  background: var(--dsw-alias-bg-layer-3, #2a2a3e);
  transform: translateY(-1px);
}
.m3-theme-option.m3-theme-active {
  border-color: var(--m3-primary, #6750A4);
  background: color-mix(in srgb, var(--m3-primary, #6750A4) 12%, var(--dsw-alias-bg-layer-2, #1a1a2e));
}
.m3-theme-preview {
  display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
  gap: 2px; width: 36px; height: 36px; border-radius: 8px; overflow: hidden;
}
.m3-preview-primary { background: #6750A4; border-radius: 4px 0 0 0; }
.m3-preview-secondary { background: #625B71; border-radius: 0 4px 0 0; }
.m3-preview-tertiary { background: #7D5260; border-radius: 0 0 0 4px; }
.m3-preview-surface { background: #FFFBFE; border-radius: 0 0 4px 0; }
body[data-m3-theme="m3"] .m3-preview-surface { background: #1C1B1F; }
.m3-theme-label { font-size: 11px; font-weight: 600; letter-spacing: 0.3px; }

/* DSH Chrome M3 overrides */
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ {
  background: color-mix(in srgb, var(--m3-surface-container-low) 85%, transparent);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  border-bottom: 1px solid var(--m3-outline-variant);
}
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-btn {
  border-radius: var(--m3-shape-md);
  transition: background-color var(--m3-motion-short) var(--m3-easing-standard);
}
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-btn:hover {
  background: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
}
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-menu {
  background: var(--m3-surface-container-high);
  border: 1px solid var(--m3-outline-variant);
  border-radius: var(--m3-shape-lg);
  box-shadow: 0 4px 8px 0 rgba(0,0,0,.08), 0 12px 32px 0 rgba(0,0,0,.12);
}
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-item {
  border-radius: var(--m3-shape-md);
  transition: background-color var(--m3-motion-short) var(--m3-easing-standard);
}
body[data-m3-theme="m3"] #__dsh_desktop_chrome__ .dch-item:hover {
  background: color-mix(in srgb, var(--m3-on-surface) 8%, transparent);
}

/* M3 shape adjustments for common elements */
body[data-m3-theme="m3"] button { border-radius: var(--m3-shape-full); }
body[data-m3-theme="m3"] input,
body[data-m3-theme="m3"] textarea,
body[data-m3-theme="m3"] select { border-radius: var(--m3-shape-md); }
body[data-m3-theme="m3"] ::-webkit-scrollbar-thumb { border-radius: var(--m3-shape-full); }
body[data-m3-theme="m3"] ::selection {
  background: color-mix(in srgb, var(--m3-primary) 30%, transparent);
  color: var(--m3-on-surface);
}
body[data-m3-theme="m3"] :focus-visible {
  outline: 2px solid var(--m3-primary);
  outline-offset: 2px;
  border-radius: var(--m3-shape-sm);
}
`;
}

function m3InjectCSS() {
  if (document.getElementById('m3-theme-inline-style')) return;
  const style = document.createElement('style');
  style.id = 'm3-theme-inline-style';
  style.textContent = m3GetThemeCSS();
  document.head.appendChild(style);
}

function m3CreateButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'm3-theme-option';
  btn.setAttribute('data-theme', 'm3');
  btn.setAttribute('aria-pressed', String(m3ThemeEnabled));
  btn.setAttribute('title', 'Material Design 3 (Material You)');
  btn.innerHTML = `
    <div class="m3-theme-preview">
      <div class="m3-preview-primary"></div>
      <div class="m3-preview-secondary"></div>
      <div class="m3-preview-tertiary"></div>
      <div class="m3-preview-surface"></div>
    </div>
    <span class="m3-theme-label">M3</span>
  `;
  btn.addEventListener('click', () => {
    m3ToggleTheme();
    m3UpdateAllButtons();
  });
  return btn;
}

function m3UpdateAllButtons() {
  document.querySelectorAll('.m3-theme-option').forEach(btn => {
    btn.setAttribute('aria-pressed', String(m3ThemeEnabled));
    btn.classList.toggle('m3-theme-active', m3ThemeEnabled);
  });
}

function m3FindAppearanceSection() {
  // dsh 0.1.0-rc.6 的外观行使用稳定的 CSS module 类；先用精确选择器，
  // 再退回 class 子串选择器。旧实现的全文档 textContent 扫描在高频 DOM
  // 变更（流式会话 / 设置页重渲染）下会明显拖慢页面，因此不再使用。
  const selectors = [
    '._8HJdBW_cubeRow',
    '[class*="appearance"]', '[class*="Appearance"]',
    '[class*="theme-section"]', '[class*="themeSection"]',
    '[data-section="appearance"]', '[data-testid="appearance"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function m3InjectSettingButton() {
  if (document.querySelector('.m3-theme-option')) return false;
  const section = m3FindAppearanceSection();
  if (!section) return false;
  
  const buttons = section.querySelectorAll('button, [role="button"]');
  if (buttons.length >= 2) {
    const lastBtn = buttons[buttons.length - 1];
    const m3Btn = m3CreateButton();
    lastBtn.parentNode.insertBefore(m3Btn, lastBtn.nextSibling);
    m3UpdateAllButtons();
    return true;
  }
  return false;
}

function m3StartSettingsObserver() {
  if (m3SettingsObserver) return;
  // 设置页/会话流会产生高频 DOM 变更；若每次都同步做全文档
  // querySelector 会明显拖慢页面。这里合并为 300ms 内的最后一次变更。
  let pending = null;
  m3SettingsObserver = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      m3InjectSettingButton();
    }, 300);
  });
  m3SettingsObserver.observe(document.body, { childList: true, subtree: true });
}

function m3InitTheme() {
  // 注入 CSS
  m3InjectCSS();
  
  // 读取偏好
  const saved = m3LoadPreference();
  
  // 应用主题
  m3ApplyTheme(saved);
  
  // 监听设置页面
  m3StartSettingsObserver();
  
  // 监听系统主题变化
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (m3ThemeEnabled) m3ApplyTheme(true);
    });
  }
  
  // 暴露 API
  window.__m3Theme = {
    isEnabled: () => m3ThemeEnabled,
    toggle: m3ToggleTheme,
    set: (v) => { m3SavePreference(v); m3ApplyTheme(v); m3UpdateAllButtons(); },
  };
}

// 初始化 M3 主题
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', m3InitTheme);
} else {
  m3InitTheme();
}
