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
 *  1. 签名与 Electron 版 preload.js 逐字段一致（53 方法，硬契约）；
 *  2. 无 Tauri 内部件时降级为「浏览器模式」：方法返回 rejected Promise、
 *     getPathForFile 返回 ''（与 Electron 版浏览器降级同语义）；
 *  3. 错误统一 Error('[CODE] message')（contracts/error-codes.md）；
 *  4. 同步 send 语义的 4 个方法保持同步返回 void（内部 fire-and-forget）。
 */
(function () {
  if (window.dshDesktop) return; // 幂等（重复注入防御）
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

  // ---- 事件（主进程 → 页面）----
  var listeners = { maximize: [], jump: [], balance: [], pet: [], clientUpdate: [], updProgress: [] };
  function onEvent(name, queue, map) {
    if (!INVOKE || !TRANSFORM) return;
    try {
      INVOKE('plugin:event|listen', {
        event: name,
        target: { kind: 'Any' },
        // Tauri 2 事件回调收的是信封 {event, payload}（tauri-2.11.5 event/mod.rs
        // emit_js_script：fn({event, payload}, ids)）——此前按裸 payload 直读，
        // notification-jump/balance-changed/pet-state/更新进度/拖放转发的字段
        // 全部取成 undefined（事件链静默失效）。统一解包后交 map；无 payload
        // 形态回退 envelope 自身，防御未来双形态。
        handler: TRANSFORM(function (ev) {
          var payload = ev && ev.payload !== undefined ? ev.payload : ev;
          for (var i = 0; i < queue.length; i++) {
            try { queue[i](map ? map(payload) : payload); } catch (e) { /* 订阅方异常不外溢 */ }
          }
        })
      }).catch(function () { /* 事件系统不可用时静默（浏览器模式） */ });
    } catch (e) { /* 同上 */ }
  }
  onEvent('window-maximized', listeners.maximize, Boolean);
  onEvent('notification-jump', listeners.jump, function (p) {
    // RV3 P0-1：Tauri 2 的 emit_to(label) 对 Any 目标 JS 监听**不具备定向性**
    //（tauri-2.11.5 listener.rs match_any_or_filter：注册目标 Any 即无条件
    // 放行）——浮窗注入同一垫片且 dsh-float-window 消费 jump，会跟着主窗
    // 跳会话。Electron 母本只向 mainWindow.webContents 发送；此处按当前窗
    // label 守卫，等价复刻定向语义。
    if (!isMainWindow()) return null;
    var id = p && typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    return id && id.length <= 256 ? Object.freeze({ sessionId: id }) : null;
  });
  onEvent('balance-changed', listeners.balance, function (p) { return p; });
  onEvent('pet-state', listeners.pet, function (p) { return p || {}; });
  // 客户端更新链（v0.5.3）：available = 启动自动检查命中（红点 badge +
  // 一次系统通知 + autoInstallUpdates 时的自动安装）；progress = 下载进度
  //（菜单行尾就地显示百分比，避免整面板重渲染抖动）。
  onEvent('client-update-available', listeners.clientUpdate, function (p) { return p || {}; });
  onEvent('client-update-progress', listeners.updProgress, function (p) { return p || {}; });

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

  // ---- 心跳：5s + visibilitychange 补报（契约 §4）----
  // F3（2026-08）：心跳载荷携带页面自报可见性（document.hidden）。原生窗口
  // 可见 ≠ 页面可见：被其他窗口完全遮挡/锁屏/RDP 断开时，Win32 is_visible
  // 恒真，而 WebView2（Chromium 原生遮挡跟踪）会把页面判 hidden，5 分钟后
  // 进入 intensive throttling——5s 心跳定时器退化 ~1/min（甚至冻结）。壳侧
  // 若不知情会按「心跳停摆」误 location.reload()，且每次重载后 5 分钟节流
  // 宽限一过又复发（v0.5.3 用户实测「隔几分钟重新加载一遍」）。壳侧据此
  // 豁免失联计数（lib.rs stall_exempt / renderer_heartbeat 命令）。
  function heartbeat() { send('renderer_heartbeat', { hidden: !!(document && document.hidden) }); }
  heartbeat();
  setInterval(heartbeat, 5000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) heartbeat();
  });

  // ---- 页面异常上报（契约 §4）----
  window.addEventListener('error', function (e) {
    send('page_error', { message: 'window.onerror: ' + ((e && (e.message || e.error)) || 'unknown') });
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('page_error', { message: 'unhandledrejection: ' + String((e && e.reason && (e.reason.message || e.reason)) || e) });
  });

  // ---- 当前会话上报：3s 轮询 localStorage，变化才发（契约 §4）----
  // currentSessionId 同时供客户端更新安装链做「有会话运行时提醒中断」判定
  //（垫片不能弹原生 confirm——下方 polyfill 恒 true，改用按钮二次点击确认）。
  var currentSessionId = '';
  (function () {
    var last = '';
    var tick = function () {
      try {
        var raw = localStorage.getItem('dsh.sessions.current');
        var parsed = raw ? JSON.parse(raw) : null;
        var id = parsed && typeof parsed === 'object' ? String(parsed.sessionId || '') : '';
        currentSessionId = id || '';
        if (id && id !== last) { last = id; send('current_session', { sessionId: id }); }
      } catch (e) { /* 会话未就绪时无值 */ }
    };
    tick();
    setInterval(tick, 3000);
  })();

  // ---- 桥对象（53 方法，签名见 contracts/bridge-api.md）----
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
      // ⋯ 菜单动作分发（v0.5.3 起更新项统一为 check-client-update /
      // install-client-update——壳侧 updater_client 双源 GitHub/Gitee 链，
      // 就地回显结果；npm 内核检查动作已随「内核随客户端分发」的设计退役）。
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
      save: function (payload) { return call('image_paste_save', { payload: payload || {} }); }
    },
    sponsorQr: function () { return call('sponsor_qr'); },
    sponsorWindow: function () { return call('sponsor_window'); },
    floatWindow: {
      open: function (sessionId) { return call('float_window', { action: 'open', sessionId: sessionId }); },
      close: function () { send('float_close'); } // 同步语义（契约 §6）
    },
    pluginManager: {
      list: function () { return call('plugin_list'); },
      // 无效条目体检 + 一键清理（Tauri 原生新增，无 Electron 母本；旧壳缺方法
      // 时插件管理页以可选链调用静默降级）。
      listDeadEntries: function () { return call('plugin_list_dead_entries'); },
      removeDeadEntries: function (ids) { return call('plugin_remove_dead_entries', { ids: Array.isArray(ids) ? ids : [] }); },
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
    guard: {
      // 插件保护中心交互面（guard:action 分发）。只读面 + 轻量解；写动作
      // （snapshot/restore/repair）仍走守护瀑布自动面，不在垫片面暴露。
      status: function () { return call('guard_action', { action: 'status' }); },
      check: function () { return call('guard_action', { action: 'check' }); },
      incident: function (id) { return call('guard_action', { action: 'incident', id: String(id || '') }); },
      resolveIncident: function (id) { return call('guard_action', { action: 'resolve-incident', id: String(id || '') }); }
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
  //  - 平台门（与 windows.rs 主窗 decorations 平台门配套，改一侧必须同步）：
  //    仅 Windows 主窗自绘（decorations:false）注入全宽控制条；mac/linux 用
  //    原生标题栏（mac 用户只认红绿灯/全屏钮，实测「找不到关闭和全屏按钮」；
  //    linux 防 WebKitGTK 白屏）→ 不注入条（否则双份标题栏 + body 下推
  //    破坏布局），降级为仅注入右上 ⋯ 菜单悬浮钮（injectMenuBall）：菜单里
  //    的更新检查/通知开关/退出等功能不丢。UA 判定：Windows UA 不含
  //    Macintosh/Linux 两词，mac/linux UA 均含其一。
  //  - 初始化脚本先于页面脚本运行，DOM 未建：MutationObserver 等 body 出现
  //    再注入；内核 SPA/插件可能移除 body 直接子元素 → 观察 body childList，
  //    被移除就重注（幂等：先查 #dsh-tauri-chrome）。
  //  - 样式走 <style> 元素 + SVG 图形用 DOM API 构造（内核页 CSP 不放行内联
  //    style 属性/可能的 img-src 限制）；全程 try/catch，注入失败绝不影响桥
  //    主流程。
  var CHROME_ID = 'dsh-tauri-chrome';
  var CHROME_H = 36;
  var MENU_ID = 'dsh-tauri-menu'; // ⋯ 下拉菜单面板（挂在控制条内，fixed 溢出条本体）
  // 原生标题栏平台（mac/linux）：主窗 decorations 为原生（见 windows.rs 平台
  // 门）→ 控制条降级为 ⋯ 菜单悬浮钮。UA 判定须在 initialization_script 里
  // 可用（navigator.userAgent 恒可用，无时序问题）。
  var NATIVE_TITLE_BAR = /(Macintosh|Linux)/.test(navigator.userAgent || '');
  var BALL_ID = 'dsh-tauri-menu-ball'; // ⋯ 菜单悬浮钮（原生标题栏平台专用）
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
  // 结构（相对 Electron，v0.5.3 更新项改造）：「检查客户端更新…」为唯一
  // 更新项（壳侧 updater_client 双源 GitHub/Gitee Releases 链；原「检查
  // dsh 更新…」npm 内核链退役——内核随客户端整体分发）。交互照就地回显
  // 模式：点击→检查中…→「可更新 vX.Y.Z（源：Gitee/GitHub）[下载并安装]」
  // 或「已是最新」或「检查失败：<原因>」；下载中行尾显示百分比
  // （client-update-progress 事件驱动）；安装前有会话运行时弹显式确认
  // 「确认继续？[继续安装]/[取消]」防误中断（原生 confirm 被 polyfill 恒
  // true，不可用）。
  // 开关类 toggle-* 经 menu_action 持久化到 settings.json 后重渲染；
  // sponsor 走 sponsorWindow；其余项点击后关菜单再发动作。点击面板外 /
  // Escape 关闭。
  var menuPanel = null; // 当前菜单面板（控制条子元素，自愈重注后回到关闭态）
  var menuOpen = false;
  var menuState = { appVersion: '', agentVersion: '', agentSource: '', notifyOnTurnEnd: true, closeToTray: true, showBalanceDock: true, autoInstallUpdates: false, clientUpdate: null, repoUrls: null };
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function menuItemHtml(act, label, right, danger) {
    return '<button class="dch-item"' + (danger ? ' data-danger="1"' : '') + ' data-act="' + act + '">' +
      '<span>' + escHtml(label) + '</span>' + (right || '') + '</button>';
  }
  // 更新源标签归一（壳侧 source 为 'github'/'gitee'，展示形 Gitee/GitHub）。
  function normSource(src) {
    var s = String(src || '').toLowerCase();
    if (s === 'gitee') return 'Gitee';
    if (s === 'github') return 'GitHub';
    return s;
  }
  // 系统通知（壳内既有的 tauri-plugin-notification IPC 通道——lib.rs 已注册
  // 插件、capabilities 放行 notifications:default；失败静默：通知是增强，
  // 不是功能面）。必须直走 INVOKE（不经 call()：plugin 命令不在 bridge
  // CHANNELS 表内，且错误形态不同）。
  function shellNotify(title, body) {
    try {
      if (INVOKE) INVOKE('plugin:notification|notify', {
        options: { title: String(title || 'DSH Desktop'), body: String(body || '') }
      }).catch(function () { /* 权限拒绝/无宿主：静默 */ });
    } catch (e) { /* 同上 */ }
  }
  // 主窗判定（client-update-available 广播到所有窗，红点/通知/自动安装只
  // 归主窗，防浮窗/宠物窗重复通知与并发安装）。
  function isMainWindow() {
    try {
      if (window.__DSH_FLOAT__ || window.__DSH_PET__) return false;
      var meta = INTERNALS && INTERNALS.metadata;
      var label = meta && meta.currentWindow && meta.currentWindow.label;
      return !label || label === 'main'; // metadata 缺席的旧壳兜底放行
    } catch (e) { return true; }
  }
  // ⋯ 按钮红点（发现新版本未处理时；自愈重注后按 updateDotOn 重打）。
  // 两种形态兼容：全宽条（Windows）查条内的 dch-menu-btn；悬浮钮
  // （mac/linux）钮本体即按钮。幂等：两种形态互斥（同一窗口只存在其一），
  // 找到即打/摘，两处都找不到静默。
  var updateDotOn = false;
  function markUpdateDot(on) {
    updateDotOn = !!on;
    try {
      var bar = document.getElementById(CHROME_ID);
      var btn = bar && bar.querySelector('button.dch-menu-btn');
      if (!btn) btn = document.getElementById(BALL_ID);
      if (btn) { if (updateDotOn) btn.classList.add('dch-dot'); else btn.classList.remove('dch-dot'); }
    } catch (e) {}
  }
  /// 客户端更新检查的就地回显行（状态机全在 menuState.clientUpdate）：
  /// null=未查 | {next,sourceLabel}=可更新(+安装按钮) | {uptodate}=已是最新 |
  /// {downloading,pct}=下载中 | {installing}=安装中(Windows 进程即将退出) |
  /// {done:'manual'|'replaced'}=mac/linux 降级形态 | {error,errorKind}=失败 |
  /// {armed}=有会话运行时的显式确认态。
  function updRowHtml() {
    var cu = menuState.clientUpdate;
    if (!cu) {
      return menuItemHtml('check-client-update', '检查客户端更新…', '<span class="dch-kbd dch-upd"></span>');
    }
    if (cu.error) {
      return menuItemHtml('check-client-update', '检查客户端更新…',
        '<span class="dch-upd-info dch-upd-err">' + escHtml((cu.errorKind === 'install' ? '更新失败：' : '检查失败：') + cu.error) + '</span>');
    }
    var label;
    if (cu.downloading) {
      label = (cu.pct >= 100 || cu.installing) ? '下载完成，正在安装…' : ('下载中 ' + (cu.pct || 0) + '%');
    } else if (cu.installing) {
      label = '下载完成，正在安装…';
    } else if (cu.done === 'manual') {
      label = '已下载 v' + (cu.next || '?') + '，请拖入 Applications 完成更新';
    } else if (cu.done === 'replaced') {
      label = '已更新到 v' + (cu.next || '?') + '，重启应用后生效';
    } else if (cu.uptodate) {
      label = '已是最新';
    } else {
      label = '可更新 v' + (cu.next || '?') + (cu.sourceLabel ? '（源：' + cu.sourceLabel + '）' : '');
    }
    var main = '<button class="dch-item dch-upd-item" data-act="check-client-update">' +
        '<span>检查客户端更新…</span><span class="dch-upd-info">' + escHtml(label) + '</span>' +
      '</button>';
    // 有会话运行时安装会中断会话并重启应用：不再用隐晦的「再点一次确认」按钮
    // 文案（用户体感「点了没反应」），改为明确的提示 + [继续安装]/[取消]。
    if (cu.armed) {
      return '<div class="dch-upd-col">' +
        '<div class="dch-upd-row">' + main + '</div>' +
        '<div class="dch-upd-confirm">' +
          '<div class="dch-upd-confirm-msg">安装会中断当前会话并重启应用，确认继续？</div>' +
          '<div class="dch-upd-confirm-btns">' +
            '<button class="dch-install dch-confirm-go" data-act="install-client-update">继续安装</button>' +
            '<button class="dch-install dch-confirm-cancel" data-act="cancel-install-confirm">取消</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    // 安装按钮：仅「可更新」态显示。
    var btn = (!cu.downloading && !cu.installing && !cu.done && !cu.uptodate)
      ? '<button class="dch-install" data-act="install-client-update">下载并安装</button>'
      : '';
    return '<div class="dch-upd-row">' + main + btn + '</div>';
  }
  // 触发安装（auto=true 为 autoInstallUpdates 自动链——设置即授权，无页内
  // 二次确认；手动链的会话提醒在 armOrInstall）。
  function startClientUpdateInstall(auto) {
    var cu = menuState.clientUpdate || {};
    cu.downloading = true; cu.pct = 0; cu.armed = false; cu.auto = !!auto;
    cu.uptodate = false; cu.done = null; cu.installing = false; cu.error = null; cu.errorKind = null;
    menuState.clientUpdate = cu;
    renderMenu();
    dshDesktop.menu.action('install-client-update').then(function (r) {
      var cur = menuState.clientUpdate || {};
      cur.downloading = false;
      if (r && r.upToDate) cur.uptodate = true;
      else if (r && r.manual) cur.done = 'manual';
      else if (r && r.replaced) cur.done = 'replaced';
      else if (r && r.installing) cur.installing = true;
      if (r && r.version) cur.next = String(r.version);
      menuState.clientUpdate = cur;
      renderMenu();
      if (cur.done === 'manual') shellNotify('DSH Desktop', '已下载 v' + (cur.next || '?') + '，请将 DSH Desktop 拖入 Applications 完成更新');
      if (cur.done === 'replaced') shellNotify('DSH Desktop', '已更新到 v' + (cur.next || '?') + '，重启应用后生效');
    }).catch(function (e) {
      var cur = menuState.clientUpdate || {};
      cur.downloading = false;
      cur.errorKind = 'install';
      cur.error = (e && e.message) ? String(e.message).replace(/^\[[A-Z_]+\]\s*/, '') : '未知错误';
      menuState.clientUpdate = cur;
      renderMenu();
    });
  }
  function armOrInstall() {
    var cu = menuState.clientUpdate;
    if (!cu || cu.downloading || cu.installing || cu.done || cu.uptodate) return;
    if (!currentSessionId || cu.armed) { startClientUpdateInstall(false); return; }
    // 有会话运行：安装会杀内核中断会话——转 armed 态弹显式确认（updRowHtml
    // 渲染提示 + [继续安装]/[取消]），点「继续安装」/「取消」解除。
    cu.armed = true;
    renderMenu();
  }
  // client-update-available 消费（仅主窗）：红点 + 一次系统通知（同版本去重）
  // + autoInstallUpdates=true 时自动安装（有会话运行则只提醒不自动装——
  // 自动链路无页内确认，中断会话必须留给用户手动决策）。
  var notifiedUpdateVersion = '';
  function handleClientUpdateAvailable(info) {
    if (!isMainWindow()) return;
    var next = String((info && (info.next || info.version)) || '');
    if (!next) return;
    menuState.clientUpdate = { next: next, sourceLabel: normSource(info && info.source) };
    markUpdateDot(true);
    if (notifiedUpdateVersion !== next) {
      notifiedUpdateVersion = next;
      shellNotify('DSH Desktop', '发现新版本 v' + next + '，点击右上角 ⋯ 菜单查看并安装');
    }
    if (menuState.autoInstallUpdates === true && !currentSessionId) {
      startClientUpdateInstall(true);
    }
    if (menuOpen) renderMenu();
  }
  // 下载进度：直接改行尾文本（不整面板重渲染）；100% 转「正在安装…」
  //（Windows 下进程即将退出，页面随之消亡）。
  listeners.updProgress.push(function (p) {
    var received = p && typeof p.received === 'number' ? p.received : 0;
    var total = p && typeof p.total === 'number' ? p.total : 0;
    var pct = total > 0 ? Math.floor(received * 100 / total) : 0;
    if (pct > 100) pct = 100;
    var cu = menuState.clientUpdate;
    if (cu && cu.downloading) {
      cu.pct = pct;
      if (pct >= 100) cu.installing = true;
      try {
        var span = document.getElementById(MENU_ID);
        span = span && span.querySelector('.dch-upd-info');
        if (span) span.textContent = pct >= 100 ? '下载完成，正在安装…' : ('下载中 ' + pct + '%');
      } catch (e) {}
    }
  });
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
      updRowHtml() +
      '<div class="dch-repos">' +
        '<div class="dch-repos-title">更新源（点行内「复制」拷贝地址）</div>' +
        '<div class="dch-repo-row"><span class="dch-repo-url" title="' + escHtml(repos.github || '') + '">' + escHtml(repos.github || '') + '</span><button class="dch-copy" data-copy="github" title="复制地址">复制</button></div>' +
        '<div class="dch-repo-row"><span class="dch-repo-url" title="' + escHtml(repos.gitee || '') + '">' + escHtml(repos.gitee || '') + '</span><button class="dch-copy" data-copy="gitee" title="复制地址">复制</button></div>' +
      '</div>' +
      menuItemHtml('toggle-notify', '会话完成通知', s.notifyOnTurnEnd ? check : '') +
      menuItemHtml('toggle-close-to-tray', '关闭时最小化到托盘', s.closeToTray ? check : '') +
      menuItemHtml('toggle-balance', '显示余额/本轮费用', s.showBalanceDock ? check : '') +
      menuItemHtml('toggle-auto-update', '自动安装客户端更新', s.autoInstallUpdates ? check : '') +
      '<div class="dch-sep"></div>' +
      menuItemHtml('set-custom-icon', '自定义图标…', '') +
      menuItemHtml('reset-custom-icon', '恢复默认图标', '') +
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
    var items = menuPanel.querySelectorAll('button[data-act]');
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.onclick = function () {
          var act = el.getAttribute('data-act');
          if (act === 'toggle-notify' || act === 'toggle-close-to-tray' || act === 'toggle-balance' || act === 'toggle-auto-update') {
            // 开关类：menu_action 读改写 settings.json 返回新值（单键），merge 后重渲染。
            dshDesktop.menu.action(act).then(function (next) {
              if (next && typeof next === 'object') { for (var k in next) menuState[k] = next[k]; }
              renderMenu();
            }).catch(function () { /* 失败维持现值 */ });
            return;
          }
          if (act === 'check-client-update') {
            // 就地反馈（不关菜单）：检查中… → 可更新 vX（源）/ 已是最新 / 检查失败。
            var st = el.querySelector('.dch-upd, .dch-upd-info, .dch-upd-err');
            if (st) st.textContent = '检查中…';
            dshDesktop.menu.action('check-client-update').then(function (r) {
              if (r && r.ok && r.upToDate) {
                menuState.clientUpdate = { uptodate: true };
                markUpdateDot(false);
              } else if (r && r.ok && r.next) {
                menuState.clientUpdate = { next: String(r.next), sourceLabel: normSource(r.source) };
                markUpdateDot(true);
              } else {
                menuState.clientUpdate = { error: '返回形态异常' };
              }
              renderMenu();
            }).catch(function (e) {
              menuState.clientUpdate = {
                error: (e && e.message) ? String(e.message).replace(/^\[[A-Z_]+\]\s*/, '') : '未知错误',
                errorKind: 'check'
              };
              renderMenu();
            });
            return;
          }
          if (act === 'install-client-update') { armOrInstall(); return; }
          if (act === 'cancel-install-confirm') {
            // 取消有会话运行时的安装确认：回到「下载并安装」态，不关菜单、不发安装。
            if (menuState.clientUpdate) menuState.clientUpdate.armed = false;
            renderMenu();
            return;
          }
          if (act === 'set-custom-icon') { closeMenu(); applyCustomIconPick(); return; }
          if (act === 'reset-custom-icon') { closeMenu(); applyCustomIconReset(); return; }
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
    if (menuState.clientUpdate) menuState.clientUpdate.armed = false; // 关菜单解除二次确认态
    if (menuPanel) menuPanel.hidden = true;
  }
  // ---- 自定义桌面图标（⋯ 菜单「自定义图标…」/「恢复默认图标」）----
  // 无 dialog 插件、无 Host 文件选择通道：经 <input type=file>（WebView2
  // 原生文件选择）读 bytes → base64 data URL → menu_action('set-custom-icon')
  // 交壳侧魔数白名单校验/解码/落盘/设置主窗+托盘。用户取消静默；失败经
  // shellNotify 轻提示（增强面，不阻断主线）。
  var CUSTOM_ICON_MAX_BYTES = 15 * 1024 * 1024;
  function pickCustomIconFile() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/x-icon,image/vnd.microsoft.icon,.png,.ico';
      input.style.display = 'none';
      var settled = false;
      function cleanup() {
        try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (e) {}
        try { window.removeEventListener('focus', onFocus); } catch (e) {}
      }
      var onFocus = function () {
        // 原生文件对话框关闭后窗口焦点回归：change 未触发即用户取消。
        setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(null);
        }, 300);
      };
      input.onchange = function () {
        settled = true;
        cleanup();
        var f = (input.files && input.files[0]) || null;
        if (!f) { resolve(null); return; }
        if (f.size > CUSTOM_ICON_MAX_BYTES) { reject(new Error('图片超过 15MB 上限')); return; }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取图片失败')); };
        reader.onload = function () {
          var dataUrl = reader.result;
          if (typeof dataUrl !== 'string' || !dataUrl) { reject(new Error('读取图片失败')); return; }
          resolve(dataUrl);
        };
        reader.readAsDataURL(f);
      };
      try {
        (document.body || document.documentElement).appendChild(input);
        window.addEventListener('focus', onFocus);
        input.click();
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  }
  function iconActionError(e) {
    return e && e.message ? String(e.message).replace(/^\[[A-Z_]+\]\s*/, '') : '未知错误';
  }
  function applyCustomIconPick() {
    pickCustomIconFile().then(function (dataUrl) {
      if (!dataUrl) return; // 用户取消
      return dshDesktop.menu.action('set-custom-icon', { dataUrl: dataUrl }).then(function (r) {
        if (r && r.ok) shellNotify('DSH Desktop', '自定义图标已生效');
      });
    }).catch(function (e) {
      shellNotify('DSH Desktop', '自定义图标设置失败：' + iconActionError(e));
    });
  }
  function applyCustomIconReset() {
    dshDesktop.menu.action('reset-custom-icon').then(function (r) {
      if (r && r.ok) shellNotify('DSH Desktop', '已恢复默认图标');
    }).catch(function (e) {
      shellNotify('DSH Desktop', '恢复默认图标失败：' + iconActionError(e));
    });
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
        // 点击宿主（条或悬浮钮）内不关菜单（否则悬浮钮形态下点钮即关，
        // 菜单永远打不开）；点其余任何地方关闭。
        var bar = document.getElementById(CHROME_ID) || document.getElementById(BALL_ID);
        if (!bar || !bar.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
    } catch (e2) { /* 兜底挂不上时菜单仍可用（⋯ 再点切换） */ }
  }
  // ---- ⋯ 菜单悬浮钮（原生标题栏平台：mac/linux，见 NATIVE_TITLE_BAR）----
  // 主窗用原生标题栏（mac 红绿灯 / linux 防白屏）时不注入全宽控制条（否则
  // 双份标题栏 + body 下推 36px 破坏布局），降级为右上角小悬浮钮：只含 ⋯
  // 一个钮 + 菜单面板，保住菜单功能面（更新检查/通知开关/图标/退出等）。
  // 主题跟随复用 themeBar 机制（themeBar 指向钮，浅色档定义在钮上，菜单
  // 面板是钮子元素继承 --dch-* 兑底变量）。自愈重注与条同策略（injectChromeBar
  // 统一入口 + watch observer，钮的幂等查 BALL_ID）。
  function injectMenuBall() {
    try {
      var head = document.head || document.documentElement;
      // 菜单面板样式与全宽条形态共用同一份（style data-for=CHROME_ID 幂等；
      // 条专属选择器都挂在 #CHROME_ID 下，对钮形态不命中，冗余无害）。
      var css = document.querySelector('style[data-for="' + CHROME_ID + '"]');
      if (!css) {
        css = document.createElement('style');
        css.setAttribute('data-for', CHROME_ID);
        css.textContent =
          '#' + BALL_ID + '{position:fixed;top:10px;right:10px;z-index:2147483000;width:32px;height:32px;' +
          'display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,rgba(127,127,127,.25)) 60%,transparent);' +
          'border-radius:9px;padding:0;outline:none;cursor:pointer;user-select:none;box-sizing:border-box;' +
          '--dch-bg:#0b1220;--dch-fg:#e6ecff;--dch-fg2:#b8c5ea;--dch-fg3:#93a5d8;--dch-line:rgba(255,255,255,.09);--dch-hover:rgba(255,255,255,.09);' +
          'color:var(--dsw-alias-label-secondary,var(--dch-fg2));' +
          'background:color-mix(in srgb,var(--dsw-alias-bg-base,var(--dch-bg)) 62%,transparent);' +
          'backdrop-filter:blur(12px) saturate(1.4);-webkit-backdrop-filter:blur(12px) saturate(1.4);' +
          'font-family:var(--dsw-font-family,"Segoe UI",system-ui,sans-serif);' +
          'transition:background-color .25s ease,color .25s ease}' +
          // 浅色兑底档（与全宽条同款内核 light 值）：面板是钮子元素，继承换档。
          '#' + BALL_ID + '[data-dsh-theme="light"]{--dch-bg:#ffffff;--dch-fg:#0f1115;--dch-fg2:#61666b;--dch-fg3:#81858c;' +
          '--dch-line:rgba(0,0,0,.10);--dch-hover:rgba(0,0,0,.06)}' +
          '#' + BALL_ID + ':hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover));color:var(--dsw-alias-label-primary,var(--dch-fg))}' +
          '#' + BALL_ID + ' svg{width:14px;height:14px;display:block;fill:currentColor;stroke:none}' +
          // 红点：与条形态 dch-dot 同款（markUpdateDot 直接打在钮上）。
          '#' + BALL_ID + '.dch-dot::after{content:"";position:absolute;top:2px;right:2px;width:7px;height:7px;' +
          'border-radius:50%;background:#ff5f57;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-bg-base,var(--dch-bg,#0b1220)) 88%,transparent)}';
        head.appendChild(css);
      }
      var ball = document.createElement('button');
      ball.id = BALL_ID;
      ball.type = 'button';
      ball.title = '菜单';
      ball.setAttribute('aria-label', '菜单');
      var ic = svgEl('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' });
      var spec = GLYPHS.menu;
      for (var i = 0; i < spec.length; i++) ic.appendChild(svgEl(spec[i].t, spec[i].a));
      ball.appendChild(ic);
      if (updateDotOn) ball.classList.add('dch-dot');
      ball.onclick = function () { try { if (menuOpen) closeMenu(); else openMenu(); } catch (e2) {} };
      // ⋯ 菜单面板：钮的子元素（fixed 溢出钮本体渲染，与条形态同位）。
      var mDiv = document.createElement('div');
      mDiv.id = MENU_ID;
      mDiv.className = 'dch-menu';
      mDiv.hidden = true;
      ball.appendChild(mDiv);
      menuPanel = mDiv;
      menuOpen = false;
      installMenuHooks();
      document.body.appendChild(ball);
      // 主题档位：与条形态同机制（watchTheme 幂等）。
      themeBar = ball;
      applyTheme();
      watchTheme();
    } catch (e) { /* 注入失败不影响页面主流程 */ }
  }
  function injectChromeBar() {
    try {
      // 幂等（两种形态互斥统一防重；重复注入/重注防御）。
      if (document.getElementById(CHROME_ID) || document.getElementById(BALL_ID)) return;
      if (window.__DSH_FLOAT__ || window.__DSH_PET__) return; // 专属窗形态，各有各的条
      if (/(^|\/)(loading|recovery|poc)\.html$/.test(location.pathname)) return; // 壳页自带标题栏
      var shellBar = document.getElementById('bar');
      if ((shellBar && shellBar.hasAttribute('data-tauri-drag-region')) || document.getElementById('titlebar')) return;
      // 平台门：原生标题栏平台（mac/linux）不注入全宽条，降级为 ⋯ 悬浮钮
      // （与 windows.rs decorations 平台门配套，防双份标题栏 + body 下推）。
      if (NATIVE_TITLE_BAR) { injectMenuBall(); return; }

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
        '#' + MENU_ID + ' .dch-copy{flex:none;appearance:none;border-radius:4px;padding:2px 8px;font-size:10.5px;line-height:16px;' +
          'min-width:fit-content;white-space:nowrap;box-sizing:border-box;' +
          'cursor:pointer;font-family:inherit;border:1px solid var(--dsw-alias-border-l2,var(--dch-line));' +
          'background:transparent;color:var(--dsw-alias-label-secondary,var(--dch-fg2))}' +
        '#' + MENU_ID + ' .dch-copy:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover));' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg))}' +
        // 客户端更新行：主行（可更新信息）+ [下载并安装] 按钮并排；
        // 错误/长文案可换行（.dch-kbd 的 110px 截断不适合整句回显）。
        '#' + MENU_ID + ' .dch-upd-row{display:flex;align-items:center;gap:4px;padding:2px 0}' +
        '#' + MENU_ID + ' .dch-upd-row .dch-upd-item{flex:1;min-width:0}' +
        '#' + MENU_ID + ' .dch-upd-info{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-caption,var(--dch-fg3));' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:132px;' +
          'font-family:var(--ds-font-family-code,Consolas,monospace)}' +
        '#' + MENU_ID + ' .dch-upd-err{color:var(--dsw-alias-state-error-primary,#ff7a85);white-space:normal;' +
          'max-width:150px;line-height:14px;font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif)}' +
        '#' + MENU_ID + ' .dch-install{flex:none;appearance:none;border-radius:6px;padding:3px 8px;font-size:10.5px;' +
          'line-height:16px;cursor:pointer;font-family:inherit;white-space:nowrap;min-width:fit-content;box-sizing:border-box;' +
          'border:1px solid var(--dsw-alias-border-l2,var(--dch-line));' +
          'background:transparent;color:var(--dsw-alias-label-secondary,var(--dch-fg2))}' +
        '#' + MENU_ID + ' .dch-install:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dch-hover));' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg))}' +
        '#' + MENU_ID + ' .dch-upd-col{display:flex;flex-direction:column;gap:4px;padding:2px 0}' +
        '#' + MENU_ID + ' .dch-upd-confirm{padding:7px 8px;border:1px solid var(--dsw-alias-state-warning-primary,#ffb86c);' +
          'border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#ffb86c) 8%,transparent)}' +
        '#' + MENU_ID + ' .dch-upd-confirm-msg{font-size:11px;line-height:16px;' +
          'color:var(--dsw-alias-label-primary,var(--dch-fg,#e6ecff));margin-bottom:6px}' +
        '#' + MENU_ID + ' .dch-upd-confirm-btns{display:flex;gap:6px;justify-content:flex-end}' +
        '#' + MENU_ID + ' .dch-install.dch-confirm-go{color:var(--dsw-alias-state-warning-primary,#ffb86c);' +
          'border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#ffb86c) 55%,transparent)}' +
        // ⋯ 图形是实心三点：覆盖条按钮的线性 stroke 缺省。
        '#' + CHROME_ID + ' button.dch-menu-btn svg{fill:currentColor;stroke:none}' +
        // ⋯ 按钮红点：启动自动检查发现新版本（client-update-available）时打点，
        // 用户检查/确认处理后摘除。
        '#' + CHROME_ID + ' button.dch-menu-btn{position:relative}' +
        '#' + CHROME_ID + ' button.dch-menu-btn.dch-dot::after{content:"";position:absolute;top:3px;right:3px;' +
          'width:7px;height:7px;border-radius:50%;background:#ff5f57;' +
          'box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-bg-base,var(--dch-bg,#0b1220)) 88%,transparent)}';
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
      })); // ⋯ 在 min/max/close 左边（Electron 同序）；红点（dch-dot）由
      // markUpdateDot 动态打/摘——捕获元素引用，自愈重注后按 updateDotOn 重打。
      var menuBtnEl = btns.querySelector('button.dch-menu-btn');
      if (menuBtnEl && updateDotOn) menuBtnEl.classList.add('dch-dot');
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
  // iframe 守卫（用户实测「会话地图双层壳」根治）：Tauri initialization_script
  // 会注入同源所有 iframe（synapse /synapse/ 等），而 Electron contextBridge
  // 只跑主框架——主框架独占壳（标题栏/菜单/拖拽），iframe 里全部跳过。
  if (window.top !== window.self) return;

  // ---- 外链点击委托（K15 / #149 / #162）：<a target="_blank"> http(s) 外链走系统浏览器 ----
  // WebView2 导航围栏（windows.rs on_navigation）只放行 127.0.0.1 / tauri://，
  // 内核页里 target="_blank" 的 http(s) 外链（余额充值 top_up、Go opencode.ai
  // 等）被原生新窗导航拦掉 → 用户点了没反应。此处全局捕获点击：命中
  // <a target="_blank"> 且 href 为 http(s)（排除内核同源 127.0.0.1）时
  // preventDefault 原生导航、改走 dshDesktop.openExternal（系统默认浏览器）。
  // 保守面：不碰无 target 的同站导航、不碰 window.open（JS 弹窗不走点击）、
  // 不碰 127.0.0.1 内核内链（放行原生导航）；只 preventDefault 不
  // stopPropagation（不干扰页内其它 click 处理器，如 ⋯ 菜单关闭）。
  var externalLinkDelegated = false;
  function installExternalLinkDelegation() {
    if (externalLinkDelegated) return;
    externalLinkDelegated = true;
    try {
      document.addEventListener('click', function (e) {
        var anchor = null;
        try {
          var node = e && e.target;
          while (node && node.nodeType === 1) {
            if (String(node.tagName).toUpperCase() === 'A') { anchor = node; break; }
            node = node.parentNode;
          }
        } catch (e2) { anchor = null; }
        if (!anchor) return;
        var target = '';
        try { target = String((anchor.getAttribute && anchor.getAttribute('target')) || anchor.target || ''); } catch (e2) {}
        if (target.toLowerCase() !== '_blank') return;
        var href = '';
        try { href = String((anchor.getAttribute && anchor.getAttribute('href')) || anchor.href || ''); } catch (e2) {}
        var lower = href.toLowerCase();
        if (lower.slice(0, 7) !== 'http://' && lower.slice(0, 8) !== 'https://') return;
        if (lower.indexOf('http://127.0.0.1') === 0 || lower.indexOf('https://127.0.0.1') === 0) return;
        if (e && e.preventDefault) { try { e.preventDefault(); } catch (e2) {} }
        if (window.dshDesktop && typeof window.dshDesktop.openExternal === 'function') {
          try { window.dshDesktop.openExternal(href); } catch (e2) {}
        }
      }, true);
    } catch (e) { /* 委托失败不阻断桥 */ }
  }
  installExternalLinkDelegation();

  onBodyReady(function () {
    injectChromeBar();
    try {
      // 内核 SPA/插件重挂载防御：控制条/悬浮钮是 body 直接子元素，childList
      //（无需 subtree）即可精确感知「被移除」→ 重注（injectChromeBar 自身
      // 幂等，两种形态互斥统一防重）。
      var watch = new MutationObserver(function () {
        if (!document.getElementById(CHROME_ID) && !document.getElementById(BALL_ID)) injectChromeBar();
      });
      watch.observe(document.body, { childList: true });
    } catch (e) { /* 同上：防御性兜底 */ }
  });

  // 自初始化：回填 appVersion（失败静默——浏览器模式常见）+ 订阅客户端
  // 更新事件（启动自动检查命中：红点/通知/自动安装，仅主窗——见
  // handleClientUpdateAvailable 的守卫说明）。
  // RV3 P1-1：getInfo 结果必须 merge 进 menuState——否则 autoInstallUpdates
  // 恒为缺省 false，重启后「自动安装客户端更新」永不触发（除非本会话先
  // 开过一次 ⋯ 菜单触发 openMenu 的 getInfo）。
  try {
    dshDesktop.getInfo().then(function (info) {
      if (info && typeof info === 'object') {
        for (var k in info) {
          try { menuState[k] = info[k]; } catch (e) { /* 只读字段跳过 */ }
        }
      }
    }).catch(function () {});
  } catch (e) {}
  listeners.clientUpdate.push(handleClientUpdateAvailable);

  // ---- 文件拖放转发（F1，2026-08）----------------------------------------
  // dragDropEnabled 默认 true：wry 在 WebView2 上注册 OLE DropTarget 并
  // SetAllowExternalDrop(false)，页面 HTML5 drop 收不到外部文件。壳侧
  // lib.rs 的 DragDropEvent（带完整路径）经 Tauri 事件 `client-file-drop`
  // 广播到本页，这里转发为页面级 window CustomEvent `client-file-drop`
  //（与 dsh-balance-changed 同款派发面；dsh-file-drop 插件经
  // window.addEventListener('client-file-drop') 消费）。detail 契约
  //（与 lib.rs 对齐；插件 normalizeDropPayload 取 detail.files，多余键
  // 被其 sanitizer 忽略）：
  //   { type: 'enter', count: N }
  //   { type: 'leave' }
  //   { type: 'drop',
  //     files: [{ path, name, ext, size, kind: 'image'|'text'|'binary' }],
  //     skipped: [{ path, name, reason }] }
  // enter/leave 同时驱动全屏悬停提示层（drop 后移除）——纯增强，失败不
  // 影响转发。
  listeners.fileDrop = [];
  onEvent('client-file-drop', listeners.fileDrop, function (p) { return p || {}; });
  listeners.fileDrop.push(function (payload) {
    try { window.dispatchEvent(new CustomEvent('client-file-drop', { detail: payload })); } catch (e) {}
    if (!payload || typeof payload.type !== 'string') return;
    if (payload.type === 'enter') showDropHover(payload.count || 0);
    else if (payload.type === 'leave' || payload.type === 'drop') hideDropHover();
  });
  // 悬停提示层（幂等）：enter 创建、leave/drop 移除；body 未就绪（理论上
  // 拖放必在页面加载后）静默跳过。
  var DROP_HINT_ID = '__dsh_drop_hint__';
  function showDropHover(count) {
    try {
      if (!document.body || document.getElementById(DROP_HINT_ID)) return;
      var d = document.createElement('div');
      d.id = DROP_HINT_ID;
      d.textContent = '松开投喂 ' + (count > 0 ? count + ' 个文件' : '文件');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font:14px "Segoe UI","Microsoft YaHei",sans-serif;color:#e6ecff;' +
        'background:rgba(11,18,32,.35);border:3px dashed rgba(120,160,255,.7);box-sizing:border-box';
      document.body.appendChild(d);
    } catch (e) { /* 提示失败不影响转发 */ }
  }
  function hideDropHover() {
    try {
      var d = document.getElementById(DROP_HINT_ID);
      if (d && d.parentNode) d.parentNode.removeChild(d);
    } catch (e) {}
  }
})();
