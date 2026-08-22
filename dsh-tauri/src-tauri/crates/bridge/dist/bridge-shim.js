/* eslint-disable */
'use strict';
/**
 * DSH Desktop（Tauri 版）—— window.dshDesktop 桥垫片
 * ==================================================
 *
 * contracts/bridge-api.md 的页面侧实现。经 Tauri `initialization_script` 注入
 * 每一个页面（含远程内核页 http://127.0.0.1:<port>）。
 *
 * 设计约束：
 *  1. 签名与 Electron 版 preload.js 逐字段一致（48 方法，硬契约）；
 *  2. 无 Tauri 内部件时降级为「浏览器模式」：方法返回 rejected Promise、
 *     getPathForFile 返回 ''（与 Electron 版浏览器降级同语义）；
 *  3. 错误统一 Error('[CODE] message')（contracts/error-codes.md）；
 *  4. 同步 send 语义的 4 个方法保持同步返回 void（内部 fire-and-forget）。
 */
(function () {
  if (window.dshDesktop) return; // 幂等（重复注入防御）
  // ---- 帧定位（必须在任何壳机制之前）----------------------------------
  // Tauri initialization_script 会注入同源所有 iframe（synapse /synapse/ 等），
  // 而 Electron contextBridge 只跑主框架。守卫必须先于事件订阅/心跳/会话
  // 轮询/错误上报/控制条注入——历史缺陷：守卫写在壳机制之后，每个 iframe
  // 都装 5s 心跳 + 3s 会话轮询 + 4 个事件订阅（开销随帧数翻倍，且 iframe
  // 心跳污染全局计数、掩蔽主窗假死判定）。
  // 桥对象（window.dshDesktop）与 dialog polyfill 保留在所有帧（兼容性：
  // iframe 内插件可能消费桥/确认框；Electron 时代 iframe 本无桥，只会更好）。
  var IS_TOP = false;
  try { IS_TOP = window.top === window.self; } catch (e) { /* 跨源受限帧按 iframe 处理 */ }
  // 窗口归属标签：假死看门狗只统计主窗（main）心跳；浮窗/宠物窗独立标签，
  // 不再与主窗共用一个全局计数（浮窗活着 ≠ 主窗活着）。
  var WINDOW_LABEL = 'main';
  try {
    if (window.__DSH_FLOAT__) WINDOW_LABEL = 'float';
    else if (window.__DSH_PET__) WINDOW_LABEL = 'pet';
  } catch (e) {}

  // ---- 页面生命周期收尾（防跨导航累积）-------------------------------
  // Tauri 的 plugin:event|listen 在 Rust 侧监听表登记，页面导航/重载后旧
  // 回调死亡但表项残留（emit 仍向死句柄派发）——pagehide 统一退订 + 清
  // 定时器（listen 的 Promise 未决时先挂起，resolve 后补位退订）。
  var lifecycleTimers = [];
  var eventUnsubscribers = [];
  var pageHidden = false;
  function armLifecycleTimer(id) { if (id !== undefined) lifecycleTimers.push(id); return id; }
  function onEventDone(registered, name) {
    if (!registered || typeof registered.then !== 'function') return;
    eventUnsubscribers.push(registered.then(function (id) {
      var unsub = function () {
        try { INVOKE('plugin:event|unlisten', { event: name, id: id }).catch(function () {}); } catch (e) {}
      };
      if (pageHidden) unsub(); // pagehide 先于注册完成：立即补位退订
      return unsub;
    }).catch(function () { /* 注册失败即无退订义务 */ }));
  }
  function onPageHide() {
    if (pageHidden) return;
    pageHidden = true;
    while (eventUnsubscribers.length) {
      var entry = eventUnsubscribers.pop();
      if (entry && typeof entry.then === 'function') {
        entry.then(function (unsub) { try { if (typeof unsub === 'function') unsub(); } catch (e) {} });
      }
    }
    while (lifecycleTimers.length) {
      try { clearInterval(lifecycleTimers.pop()); } catch (e) {}
    }
  }

  // ---- WebView2 原生 dialog polyfill ---------------------------------
  // Tauri/wry (WebView2) 不弹原生 confirm/alert/prompt：confirm 恒 false、
  // alert/prompt 静默。dsh-session-manager 的删除确认走 window.confirm →
  // 永远被「取消」＝删不掉会话（用户实测 bug）。桌面壳内用户点击按钮即意图，
  // confirm 放行 true（服务端另有「运行中会话拒绝删除」保护）；alert 转桥
  // 上报（消息不丢）；prompt 返回 null（内核 UI 不依赖，防御性兜底）。
  try {
    if (!window.__dshDialogPolyfilled) {
      window.__dshDialogPolyfilled = true;
      window.confirm = function () { return true; };
      window.alert = function (msg) {
        try { window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke('page_error', { message: '[alert] ' + msg }); } catch (e) {}
        if (window.console) console.warn('[dshDesktop alert]', msg);
      };
      window.prompt = function () { return null; };
    }
  } catch (e) { /* polyfill 失败不阻断桥 */ }


  var INTERNALS = window.__TAURI_INTERNALS__ || null;
  var INVOKE = INTERNALS && typeof INTERNALS.invoke === 'function' ? INTERNALS.invoke : null;
  var TRANSFORM = INTERNALS && typeof INTERNALS.transformCallback === 'function'
    ? INTERNALS.transformCallback : null;

  // ---- 错误归一：{code,message} → Error('[code] message')；字符串原样 ----
  function toError(raw) {
    if (raw instanceof Error) return raw;
    var code = raw && typeof raw === 'object' && typeof raw.code === 'string' ? raw.code : null;
    var msg = raw && typeof raw === 'object' && raw.message !== undefined ? String(raw.message)
      : typeof raw === 'string' ? raw : JSON.stringify(raw);
    return new Error(code ? '[' + code + '] ' + msg : (msg || 'unknown bridge error'));
  }
  function call(cmd, args) {
    if (!INVOKE) return Promise.reject(toError({ code: 'E_NO_HOST', message: '桌面桥不可用（浏览器模式）' }));
    try {
      return INVOKE(cmd, args || {}).then(null, function (raw) { throw toError(raw); });
    } catch (e) {
      return Promise.reject(toError(e));
    }
  }
  function send(cmd, args) { call(cmd, args).catch(function () { /* fire-and-forget：失败只静默 */ }); }

  // ---- 事件（主进程 → 页面；仅主框架订阅，见帧定位守卫）----
  var listeners = { maximize: [], jump: [], balance: [], pet: [] };
  function onEvent(name, queue, map) {
    if (!INVOKE || !TRANSFORM) return;
    try {
      var registered = INVOKE('plugin:event|listen', {
        event: name,
        target: { kind: 'Any' },
        handler: TRANSFORM(function (payload) {
          for (var i = 0; i < queue.length; i++) {
            try { queue[i](map ? map(payload) : payload); } catch (e) { /* 订阅方异常不外溢 */ }
          }
        })
      });
      if (registered && typeof registered.catch === 'function') {
        registered.catch(function () { /* 事件系统不可用时静默（浏览器模式） */ });
      }
      onEventDone(registered, name);
    } catch (e) { /* 同上 */ }
  }

  // ---- 桥对象（48 方法，签名见 contracts/bridge-api.md）----

  // ---- 桥对象（48 方法，签名见 contracts/bridge-api.md）----
  var dshDesktop = {
    appVersion: '', // app_init 回填
    windowControls: {
      minimize: function () { return call('window_control', { action: 'minimize' }); },
      toggleMaximize: function () { return call('window_control', { action: 'toggle-maximize' }); },
      close: function () { return call('window_control', { action: 'close' }); },
      isMaximized: function () { return call('window_control', { action: 'is-maximized' }); },
      onMaximizeChange: function (cb) {
        if (typeof cb !== 'function') return function () {};
        listeners.maximize.push(cb);
        return function () {
          var i = listeners.maximize.indexOf(cb);
          if (i >= 0) listeners.maximize.splice(i, 1);
        };
      }
    },
    menu: {
      // check-agent-update（检查 dsh 更新）经 menu_action 走壳侧 npm latest
      // 对比链（就地回显结果）；check-client-update 通道壳侧保留（updater
      // 插件发版链），但 ⋯ 菜单不展示该项。
      action: function (action, payload) {
        return call('menu_action', { action: action, payload: payload || {} });
      }
    },
    getInfo: function () {
      return call('app_init').then(function (info) {
        if (info && typeof info.appVersion === 'string') dshDesktop.appVersion = info.appVersion;
        return info;
      });
    },
    refreshBalance: function () { return call('balance_refresh'); },
    onNotificationJump: function (cb) {
      if (typeof cb !== 'function') return function () {};
      var wrapped = function (jump) { if (jump) { try { cb(jump); } catch (e) {} } };
      listeners.jump.push(wrapped);
      if (pendingJump) { var p = pendingJump; pendingJump = null; wrapped(p); }
      return function () {
        var i = listeners.jump.indexOf(wrapped);
        if (i >= 0) listeners.jump.splice(i, 1);
      };
    },
    wsl: {
      getConfig: function () { return call('wsl_config_get'); },
      saveConfig: function (cfg) { return call('wsl_config_save', { cfg: cfg }); },
      recheck: function () { return call('wsl_recheck'); }
    },
    restartService: function () { return call('restart_service', { intent: 'restart-service' }); },
    revertFiles: function (changes) { return call('file_revert', { changes: changes || [] }); },
    openPath: function (path) { return call('file_open', { path: String(path || '') }); },
    openExternal: function (url) { return call('open_external', { url: String(url || '') }); },
    copyText: function (text) { return call('copy_text', { text: String(text == null ? '' : text) }); },
    // 浏览器 File → 磁盘路径：Tauri 无直接等价（bridge-api.md §6-R1）。
    // Phase 2 由 drag-drop 事件回填 file.path；过渡期返回 ''（插件已有降级）。
    getPathForFile: function (file) {
      try { return (file && typeof file.path === 'string') ? file.path : ''; } catch (e) { return ''; }
    },
    imagePaste: {
      save: function (payload) { return call('image_paste_save', payload || {}); }
    },
    sponsorQr: function () { return call('sponsor_qr'); },
    sponsorWindow: function () { return call('sponsor_window'); },
    floatWindow: {
      open: function (sessionId) { return call('float_window', { action: 'open', sessionId: sessionId }); },
      close: function () { send('float_close'); } // 同步语义（契约 §6）
    },
    pluginManager: {
      list: function () { return call('plugin_list'); },
      setEnabled: function (id, enabled) { return call('plugin_set_enabled', { id: id, enabled: !!enabled }); },
      uninstall: function (id) { return call('plugin_uninstall', { id: id }); },
      restore: function (id) { return call('plugin_restore', { id: id }); },
      checkUpdates: function () { return call('plugin_check_updates'); },
      update: function (id) { return call('plugin_update', { id: id }); }
    },
    diagBackup: {
      runDiagnostics: function () { return call('diag_run'); },
      exportBackup: function (label) { return call('backup_export', { label: label }); },
      previewRestore: function () { return call('backup_restore', { preview: true }); },
      restore: function (token) { return call('backup_restore', { preview: false, token: token }); },
      exportDiagnostics: function () { return call('diag_export'); },
      validatePlugins: function () { return call('diag_validate'); },
      removeBundle: function (names) { return call('diag_remove_bundle', { names: names || [] }); },
      analyzeOrder: function () { return call('diag_order'); },
      applyOrder: function (order) { return call('diag_order_apply', { order: order }); }
    },
    petWindow: {
      open: function () { return call('pet_window', { action: 'open' }); },
      toggle: function () { return call('pet_window', { action: 'toggle' }); },
      isOpen: function () { return call('pet_window', { action: 'state' }); },
      close: function () { send('pet_close'); },
      moveTo: function (x, y) { send('pet_move_to', { x: Number(x) || 0, y: Number(y) || 0 }); },
      setAutoOpen: function (enabled) { send('pet_set_auto_open', { enabled: !!enabled }); }
    },
    recovery: {
      getState: function () { return call('recovery_state'); },
      reload: function () { return call('recovery_reload'); },
      restart: function () { return call('recovery_restart'); },
      openLogs: function () { return call('recovery_open_logs'); }
    }
  };

  Object.defineProperty(window, 'dshDesktop', { value: dshDesktop, writable: false, configurable: false });

  // ---- 壳机制（仅主框架；iframe 全跳过——开销不随帧数翻倍，心跳不污染主窗计数）----
  if (IS_TOP) {
    onEvent('window-maximized', listeners.maximize, Boolean);
    onEvent('notification-jump', listeners.jump, function (p) {
      var id = p && typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
      return id && id.length <= 256 ? Object.freeze({ sessionId: id }) : null;
    });
    onEvent('balance-changed', listeners.balance, function (p) { return p; });
    onEvent('pet-state', listeners.pet, function (p) { return p || {}; });

    // ---- 余额 / 宠物状态 → window CustomEvent（契约 §3，dsh-balance / harness-pet 消费）----
    listeners.balance.push(function (data) {
      try { window.dispatchEvent(new CustomEvent('dsh-balance-changed', { detail: data })); } catch (e) {}
    });
    listeners.pet.push(function (data) {
      try { window.dispatchEvent(new CustomEvent('dsh-pet-state', { detail: data })); } catch (e) {}
    });

    // ---- 通知跳转补发（订阅前收到的最后一次保留）----
    var pendingJump = null;
    listeners.jump.push(function (jump) { if (jump) pendingJump = jump; });

    // ---- 心跳：5s + visibilitychange 补报（契约 §4，带窗口归属标签）----
    send('renderer_heartbeat', { window: WINDOW_LABEL });
    armLifecycleTimer(setInterval(function () { send('renderer_heartbeat', { window: WINDOW_LABEL }); }, 5000));
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) send('renderer_heartbeat', { window: WINDOW_LABEL });
    });

    // ---- 页面异常上报（契约 §4）----
    window.addEventListener('error', function (e) {
      send('page_error', { message: 'window.onerror: ' + ((e && (e.message || e.error)) || 'unknown') });
    });
    window.addEventListener('unhandledrejection', function (e) {
      send('page_error', { message: 'unhandledrejection: ' + String((e && e.reason && (e.reason.message || e.reason)) || e) });
    });

    // ---- 当前会话上报：3s 轮询 localStorage，变化才发（契约 §4）----
    (function () {
      var last = '';
      var tick = function () {
        try {
          var raw = localStorage.getItem('dsh.sessions.current');
          var parsed = raw ? JSON.parse(raw) : null;
          var id = parsed && typeof parsed === 'object' ? String(parsed.sessionId || '') : '';
          if (id && id !== last) { last = id; send('current_session', { sessionId: id }); }
        } catch (e) { /* 会话未就绪时无值 */ }
      };
      tick();
      armLifecycleTimer(setInterval(tick, 3000));
    })();

    // pagehide 收尾（事件退订 + 定时器清除，见「页面生命周期收尾」段）。
    window.addEventListener('pagehide', onPageHide);
  }

  // ---- 窗口控制条注入（内核页，沉浸式双主题）--------------------------
  // 主窗 decorations:false：loading/recovery/poc 壳页自带标题栏，但内核
  // Web UI 只认识 Electron 的 -webkit-app-region（WebView2 不支持）→ 导航
  // 到内核页后既不能拖动也没有窗口按钮（用户实测 bug）。对齐 Electron
  // preload 的 injectChrome/CHROME_CSS：注入全宽 36px 玻璃标题栏，body
  // 下推 36px，并声明 data-dsh-title-bar-height 供内核生态里 fixed 定位的
  // 侧边栏（dsh-better-sidebar）自行下移。
  //  沉浸式主题（对齐 Electron 的适配方式）：颜色全部消费内核
  //  --dsw-alias-* 设计变量（内核 CSS 按 body[data-ds-dark-theme] 等运行时
  //  切换定义）→ 内核切主题时本条经 CSS 变量级联即时换色，无需 JS 轮询；
  //  变量未定义（页面极早期/非内核页）时按 data-dsh-theme 档位兜底：
  //  检测优先级 body[data-ds-dark-theme] → 常见主题 class/属性 → 系统
  //  prefers-color-scheme，MutationObserver 观察 html/body 属性 + matchMedia
  //  change 即时换档。浅色=白底（内核 light 值 #fff/#0f1115/…），深色=黑底
  //  （Electron 同款 fallback #0b1220/#e6ecff/…），切换有 CSS transition。
  //  左上鲸鱼 = 内核 favicon.svg 同源单 path 矢量（viewBox 0 0 50 50），
  //  fill:currentColor 跟随标题色 → 随主题自动反色；按钮为 Electron 同款
  //  12px 线性 SVG（menu/min/max/restore/close），30x28 圆角 hover。右侧
  //  ⋯（menu）按钮弹出下拉菜单（见下方「⋯ 菜单」段），Electron 版同位。
  //  - 拖拽/双击最大化交给 Tauri 内置 data-tauri-drag-region 脚本（mousedown
  //    → start_dragging；detail===2 → internal_toggle_maximize），垫片不另挂
  //    dblclick（会双重切换）；bare 属性只对「直接命中该元素」生效，故左侧
  //    每个装饰子元素都带属性，右侧按钮天然阻断。
  //  - 浮窗（__DSH_FLOAT__，自带浮窗条）/宠物窗（__DSH_PET__）/壳页
  //    （loading|recovery|poc.html 自带 #bar/#titlebar）跳过，防重复控制条。
  //  - 初始化脚本先于页面脚本运行，DOM 未建：MutationObserver 等 body 出现
  //    再注入；内核 SPA/插件可能移除 body 直接子元素 → 观察 body childList，
  //    被移除就重注（幂等：先查 #dsh-tauri-chrome）。
  //  - 样式走 <style> 元素 + SVG 图形用 DOM API 构造（内核页 CSP 不放行内联
  //    style 属性/可能的 img-src 限制）；全程 try/catch，注入失败绝不影响桥
  //    主流程。
  var CHROME_ID = 'dsh-tauri-chrome';
  var CHROME_H = 36;
  var MENU_ID = 'dsh-tauri-menu'; // ⋯ 下拉菜单面板（挂在控制条内，fixed 溢出条本体）
  // 内核 favicon.svg（dsh-web-frontend/dist）的鲸鱼单 path。原文件 light=
  // fill #000、@media(prefers-color-scheme:dark) 覆盖 #fff；这里去掉内联
  // fill，由 CSS fill:currentColor 跟随标题色，内核运行时切主题即时反色。
  var WHALE_D = "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z";
  // Electron preload GLYPHS 同款 12x12 按钮图形（线性 stroke:currentColor；
  // menu 是实心三点，CSS 单独覆盖为 fill）。
  var GLYPHS = {
    menu: [
      { t: 'circle', a: { cx: '2.4', cy: '6', r: '1.15' } },
      { t: 'circle', a: { cx: '6', cy: '6', r: '1.15' } },
      { t: 'circle', a: { cx: '9.6', cy: '6', r: '1.15' } }
    ],
    min: [{ t: 'path', a: { d: 'M2.5 6h7' } }],
    max: [{ t: 'rect', a: { x: '2.6', y: '2.6', width: '6.8', height: '6.8', rx: '1.4' } }],
    restore: [
      { t: 'path', a: { d: 'M4.2 4.2V2.6h5.2v5.2H7.8' } },
      { t: 'rect', a: { x: '2.6', y: '4.2', width: '5.2', height: '5.2', rx: '1.2' } }
    ],
    close: [{ t: 'path', a: { d: 'M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8' } }]
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  // 主题档位检测：'light' | 'dark'（详见上方注释的优先级链）。
  function detectTheme() {
    try {
      var h = document.documentElement, b = document.body;
      if (b && b.hasAttribute('data-ds-dark-theme')) return 'dark';
      var sig = ((((h && h.className) || '') + ' ' + ((b && b.className) || ''))).toLowerCase();
      var attrs = ['data-theme', 'data-color-scheme', 'data-color-mode'];
      for (var i = 0; i < attrs.length; i++) {
        if (h) sig += ' ' + String(h.getAttribute(attrs[i]) || '');
        if (b) sig += ' ' + String(b.getAttribute(attrs[i]) || '');
      }
      if (/(^|[^a-z])dark([^a-z]|$)/.test(sig)) return 'dark';
      if (/(^|[^a-z])light([^a-z]|$)/.test(sig)) return 'light';
    } catch (e2) { /* 检测异常退系统偏好 */ }
    try {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    } catch (e2) { return 'dark'; }
  }
  var themeBar = null; // 始终指向当前在场的控制条（自愈重注后自动跟新）
  var maxGlyphUnsub = null; // 控制条的 maximize 订阅退订器（自愈重注前先退旧，防 listeners.maximize 累积）
  function applyTheme() {
    if (!themeBar) return;
    try { themeBar.setAttribute('data-dsh-theme', detectTheme()); } catch (e2) {}
  }
  var themeWatched = false;
  function watchTheme() {
    if (themeWatched) return; // 自愈重注不重复挂观察器（防累积）
    themeWatched = true;
    try {
      var mo = new MutationObserver(applyTheme);
      var opts = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-color-mode', 'data-ds-dark-theme'] };
      mo.observe(document.documentElement, opts);
      if (document.body) mo.observe(document.body, opts);
    } catch (e2) { /* 观察器不可用则维持初始档位 */ }
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
      else if (mq && mq.addListener) mq.addListener(applyTheme); // 旧 WebView2 兜底
    } catch (e2) { /* 同上 */ }
  }

  // ---- ⋯ 菜单（Electron preload renderMenu 的复刻）-----------------------
  // 结构差异（相对 Electron）：保留「检查 dsh 更新…」（壳侧 npm latest 对比，
  // 结果就地回显在行尾）；去掉「检查客户端更新…」（Tauri 客户端更新走发版
  // 通道，唯一不展示的更新项）。开关类 toggle-* 经 menu_action 持久化到
  // settings.json 后重渲染；sponsor 走 sponsorWindow；其余项点击后关菜单再
  // 发动作。点击面板外 / Escape 关闭。
  var menuPanel = null; // 当前菜单面板（控制条子元素，自愈重注后回到关闭态）
  var menuOpen = false;
  var menuState = { appVersion: '', agentVersion: '', agentSource: '', notifyOnTurnEnd: true, closeToTray: true, showBalanceDock: true, repoUrls: null };
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function menuItemHtml(act, label, right, danger) {
    return '<button class="dch-item"' + (danger ? ' data-danger="1"' : '') + ' data-act="' + act + '">' +
      '<span>' + escHtml(label) + '</span>' + (right || '') + '</button>';
  }
  function renderMenu() {
    if (!menuPanel) return;
    var s = menuState;
    var repos = s.repoUrls || {};
    var check = '<span class="dch-check">✓</span>';
    menuPanel.innerHTML =
      '<div class="dch-mh">' +
        '<div class="dch-mh-title">DSH Desktop <span class="dch-mh-ver">v' + escHtml(s.appVersion || '?') + '</span></div>' +
        '<div class="dch-mh-sub"><span>agent v' + escHtml(s.agentVersion || '未知') + '</span><span>' + escHtml(s.agentSource || 'bundled') + '</span></div>' +
      '</div>' +
      menuItemHtml('check-agent-update', '检查 dsh 更新…', '<span class="dch-kbd dch-upd"></span>') +
      '<div class="dch-repos">' +
        '<div class="dch-repos-title">更新源（点击复制）</div>' +
        '<div class="dch-repo-row"><span class="dch-repo-url" title="' + escHtml(repos.github || '') + '">' + escHtml(repos.github || '') + '</span><button class="dch-copy" data-copy="github" title="复制地址">复制</button></div>' +
        '<div class="dch-repo-row"><span class="dch-repo-url" title="' + escHtml(repos.gitee || '') + '">' + escHtml(repos.gitee || '') + '</span><button class="dch-copy" data-copy="gitee" title="复制地址">复制</button></div>' +
      '</div>' +
      menuItemHtml('toggle-notify', '会话完成通知', s.notifyOnTurnEnd ? check : '') +
      menuItemHtml('toggle-close-to-tray', '关闭时最小化到托盘', s.closeToTray ? check : '') +
      menuItemHtml('toggle-balance', '显示余额/本轮费用', s.showBalanceDock ? check : '') +
      '<div class="dch-sep"></div>' +
      menuItemHtml('reload', '重新加载', '<span class="dch-kbd">Ctrl+R</span>') +
      menuItemHtml('devtools', '开发者工具', '<span class="dch-kbd">F12</span>') +
      menuItemHtml('fullscreen', '全屏', '<span class="dch-kbd">F11</span>') +
      '<div class="dch-sep"></div>' +
      menuItemHtml('open-browser', '在浏览器中打开', '') +
      menuItemHtml('open-logs', '打开日志目录', '') +
      '<div class="dch-sep"></div>' +
      menuItemHtml('sponsor', '☕ 请作者喝咖啡', '') +
      '<div class="dch-sep"></div>' +
      menuItemHtml('about', '关于 DSH Desktop', '') +
      menuItemHtml('quit', '退出', '', true);
    var items = menuPanel.querySelectorAll('.dch-item');
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.onclick = function () {
          var act = el.getAttribute('data-act');
          if (act === 'toggle-notify' || act === 'toggle-close-to-tray' || act === 'toggle-balance') {
            // 开关类：menu_action 读改写 settings.json 返回新值（单键），merge 后重渲染。
            dshDesktop.menu.action(act).then(function (next) {
              if (next && typeof next === 'object') { for (var k in next) menuState[k] = next[k]; }
              renderMenu();
            }).catch(function () { /* 失败维持现值 */ });
            return;
          }
          if (act === 'check-agent-update') {
            // 就地反馈（不关菜单）：检查中… → 可更新 vX / 已是最新 / 检查失败。
            var st = el.querySelector('.dch-upd');
            if (st) st.textContent = '检查中…';
            dshDesktop.menu.action(act).then(function (r) {
              if (st) st.textContent = (r && r.hasUpdate) ? ('可更新 v' + (r.latest || '?')) : '已是最新';
            }).catch(function () {
              if (st) st.textContent = '检查失败';
            });
            return;
          }
          closeMenu();
          if (act === 'sponsor') { try { dshDesktop.sponsorWindow(); } catch (e2) {} return; }
          try { dshDesktop.menu.action(act).catch(function () {}); } catch (e2) {}
        };
      })(items[i]);
    }
    var copies = menuPanel.querySelectorAll('.dch-copy');
    for (var j = 0; j < copies.length; j++) {
      (function (btn) {
        btn.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var kind = btn.getAttribute('data-copy');
          var url = menuState.repoUrls ? (kind === 'github' ? menuState.repoUrls.github : menuState.repoUrls.gitee) : '';
          if (!url) return;
          // copy_text 成功 resolve（无返回体）/ 失败 reject——与 Electron {ok} 口径不同。
          dshDesktop.copyText(url).then(function () {
            var prev = btn.textContent;
            btn.textContent = '已复制 ✓';
            setTimeout(function () { btn.textContent = prev; }, 1200);
          }).catch(function () {});
        };
      })(copies[j]);
    }
  }
  function closeMenu() {
    menuOpen = false;
    if (menuPanel) menuPanel.hidden = true;
  }
  function openMenu() {
    if (!menuPanel) return;
    var show = function () { renderMenu(); menuOpen = true; menuPanel.hidden = false; };
    try {
      // 拉最新面板状态（版本/来源/三开关/更新源；失败也照常开——兜底缺省值）。
      dshDesktop.getInfo().then(function (info) {
        if (info && typeof info === 'object') { for (var k in info) menuState[k] = info[k]; }
        show();
      }).catch(show);
    } catch (e2) { show(); }
  }
  var menuHooksInstalled = false;
  function installMenuHooks() {
    if (menuHooksInstalled) return; // 自愈重注不重复挂 document 监听（防累积）
    menuHooksInstalled = true;
    try {
      document.addEventListener('click', function (e) {
        if (!menuOpen) return;
        var bar = document.getElementById(CHROME_ID);
        if (!bar || !bar.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
    } catch (e2) { /* 兜底挂不上时菜单仍可用（⋯ 再点切换） */ }
  }
  function injectChromeBar() {
    try {
      if (document.getElementById(CHROME_ID)) return; // 幂等（重复注入/重注防御）
      if (window.__DSH_FLOAT__ || window.__DSH_PET__) return; // 专属窗形态，各有各的条
      if (/(^|\/)(loading|recovery|poc)\.html$/.test(location.pathname)) return; // 壳页自带标题栏
      var shellBar = document.getElementById('bar');
      if ((shellBar && shellBar.hasAttribute('data-tauri-drag-region')) || document.getElementById('titlebar')) return;

      var head = document.head || document.documentElement;
      // 样式幂等：自愈重注只补条本体，<head> 里的样式不动（SPA 反复摘条
      // 不得在 head 里无限叠 <style>——data-for 与条同 id 查重）。
      var css = document.querySelector('style[data-for="' + CHROME_ID + '"]');
      if (!css) {
        css = document.createElement('style');
        css.setAttribute('data-for', CHROME_ID);
        css.textContent =
        // 深色兜底档（Electron CHROME_CSS 同款 fallback 值）；内核
        // --dsw-alias-* 变量在场时全部被变量取代（像素级跟随内核主题）。
        '#' + CHROME_ID + '{position:fixed;top:0;left:0;right:0;height:' + CHROME_H + 'px;z-index:2147483000;' +
          'display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 10px;user-select:none;box-sizing:border-box;' +
          'font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif);' +
          '--dch-bg:#0b1220;--dch-fg:#e6ecff;--dch-fg2:#b8c5ea;--dch-fg3:#93a5d8;' +
          '--dch-line:rgba(255,255,255,.09);--dch-hover:rgba(255,255,255,.09);' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg));' +
          'background:color-mix(in srgb,var(--dsw-alias-bg-base,var(--dch-bg)) 74%,transparent);' +
          'backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);' +
          'border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,var(--dch-line)) 55%,transparent);' +
          'transition:background-color .25s ease,color .25s ease,border-color .25s ease}' +
        // 浅色兜底档：内核 light 值（--dsh-boot-* 同源：#fff/#0f1115/#61666b/#81858c）。
        '#' + CHROME_ID + '[data-dsh-theme="light"]{--dch-bg:#ffffff;--dch-fg:#0f1115;--dch-fg2:#61666b;--dch-fg3:#81858c;' +
          '--dch-line:rgba(0,0,0,.10);--dch-hover:rgba(0,0,0,.06)}' +
        '#' + CHROME_ID + ' .dch-left{display:flex;align-items:center;gap:8px;min-width:0}' +
        '#' + CHROME_ID + ' .dch-whale{width:20px;height:20px;display:block;flex:none;fill:currentColor}' +
        '#' + CHROME_ID + ' .dch-title{font-size:12.5px;font-weight:600;letter-spacing:.2px;line-height:16px;white-space:nowrap}' +
        '#' + CHROME_ID + ' .dch-badge{font-size:10px;line-height:14px;padding:1px 6px;border-radius:999px;' +
          'margin-left:8px;white-space:nowrap;color:var(--dsw-alias-label-tertiary,var(--dch-fg3));' +
          'border:1px solid var(--dsw-alias-border-l1,var(--dch-line));' +
          'font-family:var(--ds-font-family-code,Consolas,monospace)}' +
        '#' + CHROME_ID + ' .dch-right{display:flex;align-items:center;gap:2px}' +
        '#' + CHROME_ID + ' button{width:30px;height:28px;display:grid;place-items:center;border:none;border-radius:8px;' +
          'background:transparent;color:var(--dsw-alias-label-secondary,var(--dch-fg2));cursor:pointer;padding:0;outline:none;' +
          'transition:background .12s,color .12s}' +
        '#' + CHROME_ID + ' button:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover));' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg))}' +
        '#' + CHROME_ID + ' button:active{background:var(--dsw-alias-interactive-bg-hover-solid,var(--dch-hover))}' +
        '#' + CHROME_ID + ' button.dch-close:hover{background:#e81123;color:#fff}' +
        '#' + CHROME_ID + ' button svg{width:12px;height:12px;display:block;fill:none;stroke:currentColor;' +
          'stroke-width:1.1;stroke-linecap:round}' +
        '#' + CHROME_ID + ' .dch-max .ic-restore{display:none}' +
        '#' + CHROME_ID + ' .dch-max[data-maximized="1"] .ic-max{display:none}' +
        '#' + CHROME_ID + ' .dch-max[data-maximized="1"] .ic-restore{display:block}' +
        // ⋯ 菜单面板（Electron dch-menu 同款观感）：颜色同条消费内核
        // --dsw-alias-*；兜底走条上 --dsh-theme 档位的 --dch-*（面板是条的
        // 子元素，自定义属性继承即自动跟随换档）。
        '#' + MENU_ID + '{position:fixed;top:' + (CHROME_H + 8) + 'px;right:8px;width:272px;z-index:2147483001;' +
          'box-sizing:border-box;padding:6px;border-radius:14px;' +
          'background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dch-bg,#0b1220) 92%,white));' +
          'border:1px solid var(--dsw-alias-border-l1,var(--dch-line,rgba(255,255,255,.1)));' +
          'box-shadow:0 12px 40px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35);' +
          'backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5);' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg,#e6ecff));' +
          'font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif)}' +
        '#' + MENU_ID + ' .dch-mh{padding:8px 10px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,var(--dch-line));margin-bottom:6px}' +
        '#' + MENU_ID + ' .dch-mh-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}' +
        '#' + MENU_ID + ' .dch-mh-ver{font-weight:400;color:var(--dsw-alias-label-tertiary,var(--dch-fg3))}' +
        '#' + MENU_ID + ' .dch-mh-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dch-fg3));margin-top:3px;line-height:16px;display:flex;gap:8px;flex-wrap:wrap}' +
        '#' + MENU_ID + ' .dch-item{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 10px;' +
          'border:none;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font:inherit;' +
          'font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-primary,var(--dch-fg,#dbe4f8))}' +
        '#' + MENU_ID + ' .dch-item:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover))}' +
        '#' + MENU_ID + ' .dch-item .dch-kbd{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-caption,var(--dch-fg3));' +
          'font-family:var(--ds-font-family-code,Consolas,monospace)}' +
        '#' + MENU_ID + ' .dch-item .dch-upd{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#' + MENU_ID + ' .dch-item .dch-check{margin-left:auto;color:var(--dsw-alias-state-success-primary,#3ddc84);font-size:12px}' +
        '#' + MENU_ID + ' .dch-item[data-danger="1"]{color:var(--dsw-alias-state-error-primary,#ff7a85)}' +
        '#' + MENU_ID + ' .dch-sep{height:1px;background:var(--dsw-alias-border-l2,var(--dch-line));margin:5px 6px}' +
        '#' + MENU_ID + ' .dch-repos{padding:6px 10px 10px;margin:2px 0 4px;border-radius:10px;' +
          'border:1px solid var(--dsw-alias-border-l2,var(--dch-line));' +
          'background:var(--dsw-alias-bg-layer-3,color-mix(in srgb,var(--dch-bg,#0b1220) 97%,white))}' +
        '#' + MENU_ID + ' .dch-repos-title{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dch-fg3));margin-bottom:4px}' +
        '#' + MENU_ID + ' .dch-repo-row{display:flex;align-items:center;gap:6px;min-height:24px}' +
        '#' + MENU_ID + ' .dch-repo-url{flex:1;min-width:0;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
          'user-select:text;cursor:text;color:var(--dsw-alias-label-secondary,var(--dch-fg2));' +
          'font-family:var(--ds-font-family-code,Consolas,monospace)}' +
        '#' + MENU_ID + ' .dch-copy{flex:none;appearance:none;border-radius:6px;padding:1px 8px;font-size:10.5px;line-height:16px;' +
          'cursor:pointer;font-family:inherit;border:1px solid var(--dsw-alias-border-l2,var(--dch-line));' +
          'background:transparent;color:var(--dsw-alias-label-secondary,var(--dch-fg2))}' +
        '#' + MENU_ID + ' .dch-copy:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover));' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg))}' +
        // ⋯ 图形是实心三点：覆盖条按钮的线性 stroke 缺省。
        '#' + CHROME_ID + ' button.dch-menu-btn svg{fill:currentColor;stroke:none}';
        head.appendChild(css);
      }
      // 内容区整体下移（对齐 Electron：普通流走 padding，fixed 侧边栏走属性声明）。
      var layout = document.querySelector('style[data-for="' + CHROME_ID + '-layout"]');
      if (!layout) {
        layout = document.createElement('style');
        layout.setAttribute('data-for', CHROME_ID + '-layout');
        layout.textContent = 'body{box-sizing:border-box!important;padding-top:' + CHROME_H + 'px!important}';
        head.appendChild(layout);
      }
      try { document.documentElement.setAttribute('data-dsh-title-bar-height', String(CHROME_H)); } catch (e2) {}

      function dragEl(el) { el.setAttribute('data-tauri-drag-region', ''); return el; }
      function glyphSvg(kind, cls) {
        var s = svgEl('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' });
        if (cls) s.setAttribute('class', cls);
        var spec = GLYPHS[kind];
        for (var i = 0; i < spec.length; i++) s.appendChild(svgEl(spec[i].t, spec[i].a));
        return s;
      }
      function mkBtn(cls, kind, tip, fn) {
        var b = document.createElement('button');
        b.className = cls; b.title = tip; b.setAttribute('aria-label', tip);
        b.appendChild(glyphSvg(kind));
        b.onclick = function () { try { fn(); } catch (e2) { /* 桥不可用时静默 */ } };
        return b;
      }
      var bar = dragEl(document.createElement('div'));
      bar.id = CHROME_ID;
      var left = dragEl(document.createElement('div'));
      left.className = 'dch-left';
      var whale = dragEl(svgEl('svg', { viewBox: '0 0 50 50', 'aria-hidden': 'true' }));
      whale.setAttribute('class', 'dch-whale');
      whale.appendChild(svgEl('path', { d: WHALE_D }));
      var title = dragEl(document.createElement('span'));
      title.className = 'dch-title'; title.textContent = 'DSH Desktop';
      var badge = dragEl(document.createElement('span'));
      badge.className = 'dch-badge'; badge.style.display = 'none';
      left.appendChild(whale); left.appendChild(title); left.appendChild(badge);
      var btns = document.createElement('div');
      btns.className = 'dch-right';
      var maxBtn = mkBtn('dch-max', 'max', '最大化', function () { dshDesktop.windowControls.toggleMaximize(); });
      maxBtn.setAttribute('data-maximized', '0');
      maxBtn.firstChild.setAttribute('class', 'ic-max'); // 最大化态藏 □ 显 ❐（CSS 按 class 切换）
      maxBtn.appendChild(glyphSvg('restore', 'ic-restore'));
      btns.appendChild(mkBtn('dch-menu-btn', 'menu', '菜单', function () {
        if (menuOpen) closeMenu(); else openMenu();
      })); // ⋯ 在 min/max/close 左边（Electron 同序）
      btns.appendChild(mkBtn('dch-min', 'min', '最小化', function () { dshDesktop.windowControls.minimize(); }));
      btns.appendChild(maxBtn);
      btns.appendChild(mkBtn('dch-close', 'close', '关闭', function () { dshDesktop.windowControls.close(); }));
      bar.appendChild(left); bar.appendChild(btns);
      // ⋯ 菜单面板：条的子元素（fixed 溢出条本体渲染），随条自愈重注一并重建。
      var mDiv = document.createElement('div');
      mDiv.id = MENU_ID;
      mDiv.className = 'dch-menu';
      mDiv.hidden = true;
      bar.appendChild(mDiv);
      menuPanel = mDiv;
      menuOpen = false;
      installMenuHooks();
      document.body.appendChild(bar);

      // 主题档位：注入即定档，之后观察器跟随内核/系统切换（watchTheme 幂等）。
      themeBar = bar;
      applyTheme();
      watchTheme();

      // 最大化/还原图标状态（失败静默——浏览器模式常见）。
      function setMaxGlyph(max) {
        try {
          maxBtn.setAttribute('data-maximized', max ? '1' : '0');
          maxBtn.title = max ? '还原' : '最大化';
          maxBtn.setAttribute('aria-label', maxBtn.title);
        } catch (e2) {}
      }
      try { dshDesktop.windowControls.isMaximized().then(setMaxGlyph).catch(function () {}); } catch (e2) {}
      // 自愈重注防累积：旧条的 maximize 订阅先退订（闭包持有已摘除的旧
      // maxBtn，不退则 listeners.maximize 随重注次数线性增长）。
      if (maxGlyphUnsub) { try { maxGlyphUnsub(); } catch (e2) {} }
      try { maxGlyphUnsub = dshDesktop.windowControls.onMaximizeChange(setMaxGlyph); } catch (e2) {}
      // 版本徽章回填（getInfo 失败仅无徽章，不影响条本身）。
      try {
        dshDesktop.getInfo().then(function (info) {
          if (info && typeof info.appVersion === 'string' && info.appVersion) {
            badge.textContent = 'v' + info.appVersion; badge.style.display = '';
          }
        }).catch(function () {});
      } catch (e2) {}
    } catch (e) { /* 注入失败不影响页面主流程 */ }
  }
  function onBodyReady(cb) {
    if (document.body) { cb(); return; }
    try {
      var mo = new MutationObserver(function () {
        if (document.body) { mo.disconnect(); cb(); }
      });
      mo.observe(document.documentElement, { childList: true });
    } catch (e) {
      // 观察器不可用的极端环境：退化到 DOMContentLoaded / 立即执行。
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { cb(); });
      else cb();
    }
  }
  // 控制条注入与自初始化同样只属主框架（帧定位守卫见文件首；历史形态
  // 「会话地图双层壳」的根治语义不变——iframe 不注入第二层壳）。
  if (IS_TOP) {
    onBodyReady(function () {
      injectChromeBar();
      try {
        // 内核 SPA/插件重挂载防御：控制条是 body 直接子元素，childList（无需
        // subtree）即可精确感知「被移除」→ 重注（injectChromeBar 自身幂等）。
        var watch = new MutationObserver(function () {
          if (!document.getElementById(CHROME_ID)) injectChromeBar();
        });
        watch.observe(document.body, { childList: true });
      } catch (e) { /* 同上：防御性兜底 */ }
    });

    // 自初始化：回填 appVersion（失败静默——浏览器模式常见）。
    try { dshDesktop.getInfo().catch(function () {}); } catch (e) {}
  }
})();
