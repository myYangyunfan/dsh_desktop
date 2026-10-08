//! PoC 页（Phase 0 验收界面）。
//!
//! PoC-A：远程 http 页上 `window.dshDesktop` 垫片可用（invoke 双向 + 事件下行）。
//! PoC-B：36px 自绘标题栏（`data-tauri-drag-region` 拖拽 + 最小化/最大化/关闭）。
//! 页面经 preview-server 以 `http://127.0.0.1:<port>/poc.html` 提供——
//! 与内核 Web UI 完全同形态的远程页，IPC 验证逼真度即来自于此。

pub const POC_PAGE_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DSH Desktop — Tauri PoC</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", sans-serif;
    background: #101418; color: #d7dde4;
    display: flex; flex-direction: column; height: 100vh;
  }
  /* ---- PoC-B：36px 自绘标题栏（对齐 Electron 版 BAR_HEIGHT=36）---- */
  #titlebar {
    height: 36px; flex: 0 0 36px;
    display: flex; align-items: center; gap: 8px;
    padding: 0 4px 0 12px;
    background: rgba(24, 30, 38, .92); border-bottom: 1px solid #232b36;
    user-select: none;
  }
  #titlebar .logo { width: 18px; height: 18px; border-radius: 5px;
    background: linear-gradient(135deg, #4f7cff, #36d1dc); }
  #titlebar .title { font-weight: 600; pointer-events: none; }
  #titlebar .ver { color: #7d8894; font-size: 12px; pointer-events: none; }
  #titlebar .spacer { flex: 1; }
  #titlebar button {
    width: 44px; height: 36px; border: 0; background: transparent;
    color: #d7dde4; font-size: 15px; cursor: pointer;
  }
  #titlebar button:hover { background: #2a3341; }
  #titlebar button.close:hover { background: #c0392b; color: #fff; }
  main { flex: 1; overflow: auto; padding: 20px 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #7d8894; margin-bottom: 18px; }
  table { border-collapse: collapse; width: 100%; max-width: 900px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232b36; vertical-align: top; }
  th { color: #9fb0c0; font-weight: 600; white-space: nowrap; }
  td.detail { font-family: Consolas, monospace; font-size: 12px; color: #9fb0c0; word-break: break-all; }
  .pass { color: #4cc38a; font-weight: 700; }
  .fail { color: #ff6b6b; font-weight: 700; }
  .info { color: #f5c451; font-weight: 700; }
  .row-btns button { margin: 2px 6px 2px 0; padding: 4px 12px; border-radius: 6px;
    border: 1px solid #32405280; background: #1a222c; color: #d7dde4; cursor: pointer; }
  .row-btns button:hover { background: #243040; }
  #summary { margin-top: 16px; font-size: 15px; }
</style>
</head>
<body>
  <div id="titlebar" data-tauri-drag-region>
    <span class="logo"></span>
    <span class="title">DSH Desktop</span>
    <span class="ver" id="ver">（Tauri PoC）</span>
    <span class="spacer"></span>
    <button id="btn-min" title="最小化">&#x2500;</button>
    <button id="btn-max" title="最大化/还原">&#x25A1;</button>
    <button id="btn-close" class="close" title="关闭">&#x2715;</button>
  </div>
  <main>
    <h1>Phase 0 PoC 验收</h1>
    <div class="sub">本页经 http://127.0.0.1 提供（与内核 Web UI 同形态的远程页）。自动用例跑完前请勿最小化。</div>
    <table id="cases"><thead><tr><th>#</th><th>用例</th><th>结果</th><th class="detail">详情</th></tr></thead><tbody></tbody></table>
    <div class="row-btns" style="margin-top:14px">
      <button onclick="manualNote('拖拽标题栏可移动窗口；双击 Spacer 区域请勿有反应')">验证拖拽（手动）</button>
      <button onclick="runAll()">重跑自动用例</button>
      <button onclick="toggleMax()">最大化切换（手动）</button>
    </div>
    <div id="summary"></div>
  </main>
<script>
(function () {
  'use strict';
  var rows = {};
  function add(name) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (Object.keys(rows).length + 1) + '</td><td>' + name + '</td><td class="r">…</td><td class="detail d"></td>';
    document.querySelector('#cases tbody').appendChild(tr);
    rows[name] = { r: tr.querySelector('.r'), d: tr.querySelector('.d') };
    return rows[name];
  }
  function done(name, ok, detail) {
    var c = rows[name]; if (!c) return;
    c.r.textContent = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO';
    c.r.className = 'r ' + (ok === true ? 'pass' : ok === false ? 'fail' : 'info');
    if (detail !== undefined) c.d.textContent = typeof detail === 'string' ? detail : JSON.stringify(detail);
    summary();
  }
  function summary() {
    var pass = 0, fail = 0;
    Object.keys(rows).forEach(function (k) {
      if (rows[k].r.textContent === 'PASS') pass++;
      if (rows[k].r.textContent === 'FAIL') fail++;
    });
    document.getElementById('summary').innerHTML = (fail === 0
      ? '<span class="pass">✓ ' + pass + ' 项通过</span>'
      : '<span class="fail">✗ ' + fail + ' 项失败</span>') + '（含手动项）';
  }
  window.manualNote = function (t) { var c = add('手动'); done('手动', true, t); };

  var B = window.dshDesktop;

  async function runAll() {
    document.querySelector('#cases tbody').innerHTML = ''; rows = {};

    // A1 宿主检测
    var a1 = add('A1 __TAURI_INTERNALS__ 注入');
    done('A1 __TAURI_INTERNALS__ 注入', !!window.__TAURI_INTERNALS__,
      window.__TAURI_INTERNALS__ ? '远程页 IPC 基座存在' : '缺失（capability remote.urls 未生效）');

    // A2 桥对象存在 + 形状抽查
    var a2 = add('A2 window.dshDesktop 形状');
    if (!B) { done('A2 window.dshDesktop 形状', false, '垫片未注入'); return; }
    // 面清单随宠物窗（petWindow）2026-10 裁撤同步收缩。
    var need = ['windowControls', 'menu', 'wsl', 'pluginManager', 'diagBackup', 'recovery',
      'getInfo', 'restartService', 'getPathForFile', 'onNotificationJump'];
    var miss = need.filter(function (k) { return !(k in B); });
    done('A2 window.dshDesktop 形状', miss.length === 0, miss.length ? '缺: ' + miss : need.length + ' 个命名空间/方法齐备');

    // A3 invoke 双向（app_init）
    var a3 = add('A3 app_init invoke');
    try {
      var info = await B.getInfo();
      document.getElementById('ver').textContent = 'v' + info.appVersion + ' (Tauri)';
      done('A3 app_init invoke', !!info.appVersion, 'appVersion=' + info.appVersion + ' shell=' + info.shell);
    } catch (e) { done('A3 app_init invoke', false, String(e.message || e)); }

    // A4 事件下行（window-maximized，自动 toggle 两轮触发再还原）。
    // （原 A4 监听 balance-changed 已废：v0.5.1 起该事件由余额轮询环生产、
    //   PoC 模式不启动 supervisor 故恒失败；2026-10 事件与轮询环随 Electron
    //   余额遗留线整体退役，见 contracts/ipc-commands.md §2.4。）
    var a4 = add('A4 事件下行 window-maximized');
    var got4 = false;
    B.windowControls.onMaximizeChange(function (isMax) {
      if (!got4) { got4 = true; done('A4 事件下行 window-maximized', typeof isMax === 'boolean', 'isMaximized=' + isMax); }
    });
    try {
      await B.windowControls.toggleMaximize();
      await new Promise(function (r) { setTimeout(r, 600); });
      await B.windowControls.toggleMaximize();
    } catch (e) {}
    setTimeout(function () { if (!got4) done('A4 事件下行 window-maximized', false, '4s 内未收到事件'); }, 4000);

    // A5 onMaximizeChange 订阅
    var a5 = add('A5 onMaximizeChange 订阅');
    var un = B.windowControls.onMaximizeChange(function (isMax) {
      done('A5 onMaximizeChange 订阅', typeof isMax === 'boolean', 'isMaximized=' + isMax);
      un();
    });
    done('A5 onMaximizeChange 订阅', null, '已订阅；点「最大化切换」后应回填（返回 unsub=' + typeof un + '）');

    // A6 is-maximized 查询
    var a6 = add('A6 isMaximized 查询');
    try { done('A6 isMaximized 查询', typeof (await B.windowControls.isMaximized()) === 'boolean', 'ok'); }
    catch (e) { done('A6 isMaximized 查询', false, String(e.message || e)); }

    // A7 check-client-update 双源 latest 检查（v0.5.3 起替代退役的 npm 内核
    // 比对链：回 {ok,upToDate} 或 {ok,current,next,notes,asset,source}；
    // 需网络访问 GitHub/Gitee，离线时该项报失败属预期）
    var a7 = add('A7 check-client-update 更新检查');
    try {
      var upd = await B.menu.action('check-client-update');
      var hasShape = !!(upd && upd.ok && (('upToDate' in upd) || ('next' in upd)));
      done('A7 check-client-update 更新检查', hasShape,
        'upToDate=' + upd.upToDate + ' current=' + upd.current + ' next=' + upd.next + ' source=' + upd.source);
    } catch (e) { done('A7 check-client-update 更新检查', false, String(e.message || e)); }

    // A8 未注册 command 的错误形态（用一个保证不存在的命令名）
    var a8 = add('A8 未注册 command 报错形态');
    try { await window.__TAURI_INTERNALS__.invoke('definitely_not_a_command', {}); done('A8 未注册 command 报错形态', false, '不应成功'); }
    catch (e) { done('A8 未注册 command 报错形态', true, String(e.message || e).slice(0, 80)); }

    // A9 参数序列化双向（echo）
    var a9 = add('A9 参数序列化（echo_json）');
    try {
      var payload = { arr: [1, 2, { k: '中文' }], n: 3.5, b: true };
      var out = await window.__TAURI_INTERNALS__.invoke('poc_echo_json', { payload: payload });
      var ok = JSON.stringify(out) === JSON.stringify(payload);
      done('A9 参数序列化（echo_json）', ok, ok ? '往返一致' : JSON.stringify(out));
    } catch (e) { done('A9 参数序列化（echo_json）', false, String(e.message || e)); }

    // B1 标题栏按钮（手动触发也可）——bind
    bindChrome();
    done('B1 标题栏按钮绑定', true, 'min/max/close → windowControls');
    summary();
  }

  function bindChrome() {
    document.getElementById('btn-min').onclick = function () { B && B.windowControls.minimize(); };
    document.getElementById('btn-close').onclick = function () { B && B.windowControls.close(); };
    document.getElementById('btn-max').onclick = toggleMax;
  }
  window.toggleMax = function () { B && B.windowControls.toggleMaximize(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runAll);
  else runAll();
})();
</script>
</body>
</html>
"#;
