//! 内嵌页面：loading（boot 进度）与 recovery（崩溃恢复）。
//!
//! 均经 preview-server 以 http://127.0.0.1 托管——与内核 Web UI 同 origin 形态，
//! 事件监听与桥调用链路完全一致。自绘标题栏 36px（对齐 Electron BAR_HEIGHT）。

/// 启动加载页：boot 步骤进度 + 内核拉起状态 + 错误展示。
///
/// 失败显示防抖 + 分级（#144「启动时报错但无影响」观感修复）：单步 !ok 只
/// 留红字步骤行不翻全局标题（warn 级步骤失败时 boot 链仍推进）；整体失败
/// 的唯一权威信号 kernel-fail 也不立刻翻标题，挂 1.8s 定时器——supervisor
/// 瀑布对首败会自动重跑 boot 链（新一轮 boot-step 到达即取消定时器并复位
/// 标题/err，N≥2 附「第 N 次尝试」），成功路径 KernelReady 换页离开本页，
/// 失败字样永不闪现；kernel-fail 本就意味着恢复页即将接管（路由先 emit 后
/// navigate），正常路径本页在防抖窗口内被换走，仅换页异常时才短暂展示终态。
///
/// 沉浸式双主题（对齐 Electron 玻璃标题栏观感）：壳页无内核主题可读，
/// 用 prefers-color-scheme 双档 CSS 变量（亮=内核 light 值 #fff/#0f1115/…，
/// 暗=Electron 同款 #0b1220/#e6ecff/…），色值与 bridge-shim 注入条一致；
/// 左上鲸鱼 = 内核 favicon.svg 同源矢量，fill:currentColor 随主题反色。
pub const LOADING_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="color-scheme" content="light dark">
<title>DSH Desktop — 启动中</title>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  :root{--bg:#ffffff;--fg:#0f1115;--fg2:#61666b;--line:rgba(0,0,0,.10);--hover:rgba(0,0,0,.06);
    --err:#c0392b;--ring-track:#e2e6ec}
  @media (prefers-color-scheme: dark){
    :root{--bg:#0b1220;--fg:#d7dde4;--fg2:#9fb0c0;--line:#232b36;--hover:#2a3341;
      --err:#ff9d9d;--ring-track:#243046}
  }
  body{font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--fg);
    display:flex;flex-direction:column;user-select:none;transition:background-color .25s ease,color .25s ease}
  #bar{height:36px;flex:0 0 36px;display:flex;align-items:center;gap:8px;padding:0 6px 0 10px;
    color:var(--fg);background:color-mix(in srgb,var(--bg) 74%,transparent);
    backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);
    border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);
    transition:background-color .25s ease,color .25s ease,border-color .25s ease}
  #bar .logo{width:20px;height:20px;fill:currentColor;flex:none}
  #bar .t{font-size:12.5px;font-weight:600;line-height:16px;letter-spacing:.2px;pointer-events:none}
  #bar .sp{flex:1}
  #bar button{width:30px;height:28px;display:grid;place-items:center;border:0;border-radius:8px;
    background:transparent;color:var(--fg);cursor:pointer;padding:0;transition:background .12s,color .12s}
  #bar button:hover{background:var(--hover)}
  #bar button.x:hover{background:#e81123;color:#fff}
  #bar button svg{width:12px;height:12px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.1;stroke-linecap:round}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px}
  .ring{width:44px;height:44px;border-radius:50%;border:3px solid var(--ring-track);border-top-color:#4f7cff;
    animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:17px;font-weight:600}
  #steps{min-width:340px;max-width:520px;font:12.5px/1.9 Consolas,monospace;color:var(--fg2)}
  .ok::before{content:"✓ ";color:#4cc38a}
  .fail::before{content:"✗ ";color:#ff6b6b}
  .run::before{content:"… ";color:#f5c451}
  .err{max-width:520px;color:var(--err);font-size:13px;white-space:pre-wrap}
  .err-exit{display:flex;gap:12px;margin-top:6px}
  .err-exit[hidden]{display:none}
  .err-exit button{padding:9px 20px;border-radius:8px;border:1px solid var(--line);
    background:var(--bg);color:var(--fg);font-size:13.5px;cursor:pointer}
  .err-exit button:hover{background:var(--hover)}
</style></head>
<body>
<div id="bar" data-tauri-drag-region>
  <svg class="logo" viewBox="0 0 50 50" aria-hidden="true"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z"/></svg>
  <span class="t">DSH Desktop</span><span class="sp"></span>
  <button onclick="B&&B.windowControls.minimize()" title="最小化" aria-label="最小化"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7"/></svg></button>
  <button onclick="B&&B.windowControls.close()" class="x" title="关闭" aria-label="关闭"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg></button>
</div>
<main>
  <div class="ring"></div>
  <h1 id="title">正在启动 DSH 内核…</h1>
  <div id="steps"></div>
  <div class="err" id="err"></div>
  <div class="err-exit" id="err-exit" hidden>
    <button onclick="doRestartKernel()">重试启动内核</button>
    <button onclick="doFullReload()">完全重新加载</button>
  </div>
</main>
<script>
(function(){
  'use strict';
  var B = window.dshDesktop;
  window.B = B;
  var el = document.getElementById('steps');
  var titleEl = document.getElementById('title');
  var errEl = document.getElementById('err');
  var exitEl = document.getElementById('err-exit');
  var DEFAULT_TITLE = '正在启动 DSH 内核…';
  var attempts = 1;      // boot 链轮次：链头 repair 重现（瀑布二/三层重跑 boot 链）即 +1
  var roundOpen = false; // 本轮是否已收到过 boot-step
  var failTimer = 0;     // 失败终态防抖句柄（0 = 无未决；页面即销毁，无需 beforeunload）
  // #154 前端兜底出口：任何 boot-step（新尝试）都会复位隐藏恢复出口——新尝试
  // 仍在推进时不给「重试」按钮（避免用户在自动重试期间手动再触发一次）。
  function hideExit(){ if (exitEl) exitEl.setAttribute('hidden',''); }
  function addLine(cls, text){
    var d = document.createElement('div');
    d.className = cls; d.textContent = text;
    el.appendChild(d);
    while (el.children.length > 10) el.removeChild(el.firstChild);
  }
  function roundTitle(){
    return attempts >= 2 ? DEFAULT_TITLE + '（第 ' + attempts + ' 次尝试）' : DEFAULT_TITLE;
  }
  // 新尝试复位：取消未决的失败终态展示；已翻的失败标题回「正在启动」（N≥2
  // 带轮次计数）；err 清空。步骤区保持追加滚动不额外清屏——✗/✓ 同屏正好
  // 比对「上轮失败、本轮自愈」的重试效果。
  function resetForNewAttempt(newRound){
    if (failTimer) { clearTimeout(failTimer); failTimer = 0; }
    if (titleEl.getAttribute('data-fail') || newRound) {
      titleEl.removeAttribute('data-fail');
      errEl.textContent = '';
      hideExit();
      titleEl.textContent = roundTitle();
    }
  }
  function listen(name, cb){
    try {
      window.__TAURI_INTERNALS__.invoke('plugin:event|listen', {
        event: name, target: { kind: 'Any' },
        // Tauri 2 事件回调收的是信封 {event, payload}（tauri-2.11.5 event/mod.rs
        // emit_js_script：fn({event, payload}, ids)）——此处统一解包再交 cb，
        // 消费方拿到的恒为 payload 本体（#144 实拍「undefined 0ms：失败」的
        // 根因就是旧代码裸读信封字段）。无 payload 形态回退 envelope 自身。
        handler: window.__TAURI_INTERNALS__.transformCallback(function (ev) {
          cb(ev && ev.payload !== undefined ? ev.payload : ev);
        })
      }).catch(function(){});
    } catch (e) {}
  }
  var NAMES = { repair:'自愈检查', sync:'伴随插件同步', patches:'运行时补丁', preflight:'就绪预检',
                'sidecar-boot':'启动链', spawn:'内核拉起', 'wsl-install':'安装内核 agent（首次需几分钟）' };
  listen('boot-step', function(p){
    // （listen() 已解包信封，p 即 payload 本体。）
    // 链头重现 = 新一轮自动重试开始（supervisor 瀑布：首拉失败后重跑 boot 链，
    // 步骤名映射对齐 data-flow.md §3 boot 时序，repair 为链首）。
    var newRound = p.name === 'repair' && roundOpen;
    if (newRound) attempts++;
    roundOpen = true;
    resetForNewAttempt(newRound);
    // 分级：单步 !ok 只保留该步红字行，不再翻全局标题——warn 级步骤失败时
    // boot 链仍在推进（sidecar 整链 ok 判定与瀑布重跑都发生在这之后），此处
    // 翻「失败」是把"步骤失败"夸大成"整体失败"（#144「报错但无影响」主源）。
    // 整体失败的唯一权威信号是 kernel-fail（见下）。
    addLine(p.ok ? 'ok' : 'fail', (NAMES[p.name] || p.name) + ' ' + (p.ms||0) + 'ms' + (p.ok ? '' : '：' + (p.error||'失败')));
  });
  listen('kernel-fail', function(p){
    // （listen() 已解包信封。）
    // 失败终态防抖（1.8s）：kernel-fail 只在 supervisor 放弃自动重试（崩溃环）
    // 时发出，且路由随即换页恢复页——正常路径本页在窗口内被换走，失败字样
    // 永不闪现；仅当换页迟迟未发生（导航异常等）才翻终态，让用户不至面对
    // 无解释的转圈。窗口内任何 boot-step（新尝试）都会取消此定时器并复位。
    // #154 前端兜底出口：防抖到点后除了翻错误标题，还显示「重试启动内核」/
    // 「完全重新加载」两个恢复按钮——换页迟迟不发生时用户有明确出口。
    if (failTimer) clearTimeout(failTimer);
    failTimer = setTimeout(function(){
      failTimer = 0;
      titleEl.setAttribute('data-fail', '1');
      titleEl.textContent = '启动失败（正在转入恢复…）';
      errEl.textContent = String(p.reason || '');
      if (exitEl) exitEl.removeAttribute('hidden');
    }, 1800);
  });
  // pet-state 空订阅（宠物窗占位）随 harness-pet 插件退役于 2026-10 移除。
  // #154 前端兜底出口（手动触发）：恢复页导航迟迟不发生时的用户出口。
  window.doRestartKernel = function(){
    try { B && B.recovery.restart(); } catch (e) {}
  };
  window.doFullReload = function(){
    try { B && B.recovery.reload(); } catch (e) {}
    setTimeout(function(){ location.reload(); }, 250);
  };
})();
</script>
</body></html>
"#;

/// 恢复页：崩溃环 / 启动失败后的用户出口（重载 / 重启 / 日志）。
///
/// 同 LOADING_HTML 的沉浸式双主题（prefers-color-scheme 双档变量 + 玻璃
/// 标题栏 + 内核同源鲸鱼 logo）。
pub const RECOVERY_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="color-scheme" content="light dark">
<title>DSH Desktop — 恢复</title>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  :root{--bg:#ffffff;--fg:#0f1115;--fg2:#61666b;--line:rgba(0,0,0,.10);--hover:rgba(0,0,0,.06);
    --btn-bg:#f2f3f5;--btn-line:rgba(0,0,0,.10);--btn-hover:#e8eaee}
  @media (prefers-color-scheme: dark){
    :root{--bg:#0b1220;--fg:#d7dde4;--fg2:#9fb0c0;--line:#232b36;--hover:#2a3341;
      --btn-bg:#1a222c;--btn-line:#32405280;--btn-hover:#243040}
  }
  body{font:14px/1.7 "Segoe UI","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--fg);
    display:flex;flex-direction:column;user-select:none;transition:background-color .25s ease,color .25s ease}
  #bar{height:36px;flex:0 0 36px;display:flex;align-items:center;gap:8px;padding:0 6px 0 10px;
    color:var(--fg);background:color-mix(in srgb,var(--bg) 74%,transparent);
    backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);
    border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);
    transition:background-color .25s ease,color .25s ease,border-color .25s ease}
  #bar .logo{width:20px;height:20px;fill:currentColor;flex:none}
  #bar .t{font-size:12.5px;font-weight:600;line-height:16px;letter-spacing:.2px;pointer-events:none}
  #bar .sp{flex:1}
  #bar button{width:30px;height:28px;display:grid;place-items:center;border:0;border-radius:8px;
    background:transparent;color:var(--fg);cursor:pointer;padding:0;transition:background .12s,color .12s}
  #bar button:hover{background:var(--hover)}
  #bar button.x:hover{background:#e81123;color:#fff}
  #bar button svg{width:12px;height:12px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.1;stroke-linecap:round}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px}
  h1{font-size:18px}
  #why{max-width:560px;color:var(--fg2);font-size:13px;white-space:pre-wrap;text-align:center}
  .btns{display:flex;gap:12px;margin-top:8px}
  .btns button{padding:9px 22px;border-radius:8px;border:1px solid var(--btn-line);background:var(--btn-bg);
    color:var(--fg);font-size:14px;cursor:pointer}
  .btns button:hover{background:var(--btn-hover)}
  .btns button.primary{background:#2b4a8f;border-color:#3a5fbf;color:#fff}
</style></head>
<body>
<div id="bar" data-tauri-drag-region>
  <svg class="logo" viewBox="0 0 50 50" aria-hidden="true"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z"/></svg>
  <span class="t">DSH Desktop</span><span class="sp"></span>
  <button onclick="B&&B.windowControls.close()" class="x" title="关闭" aria-label="关闭"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg></button>
</div>
<main>
  <h1>内核服务出现问题</h1>
  <div id="why">正在读取状态…</div>
  <div class="btns">
    <button class="primary" onclick="doRestart()">重启内核</button>
    <button onclick="doReload()">重新加载</button>
    <button onclick="doLogs()">打开日志</button>
  </div>
</main>
<script>
(function(){
  'use strict';
  var B = window.dshDesktop; window.B = B;
  function refresh(){
    B && B.recovery.getState().then(function(s){
      document.getElementById('why').textContent =
        (s && s.reason ? '原因：' + s.reason + '\n' : '') +
        (s && s.crashes ? '本次累计异常退出：' + s.crashes + ' 次\n' : '') +
        '可尝试重启内核；若反复失败请导出日志反馈。';
    }).catch(function(e){
      document.getElementById('why').textContent = '状态读取失败：' + String(e && e.message || e);
    });
  }
  window.doRestart = function(){ B && B.recovery.restart().then(refresh, refresh); };
  window.doReload  = function(){ B && B.recovery.reload(); };
  window.doLogs    = function(){ B && B.recovery.openLogs(); };
  refresh();
})();
</script>
</body></html>
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loading_page_contract_markers() {
        assert!(LOADING_HTML.contains("data-tauri-drag-region"), "PoC-B 标题栏拖拽");
        assert!(LOADING_HTML.contains("'boot-step'"), "boot 步骤事件订阅");
        assert!(LOADING_HTML.contains("'kernel-fail'"), "失败事件订阅");
        assert!(LOADING_HTML.contains("windowControls.minimize"));
        assert!(LOADING_HTML.contains("dshDesktop"), "垫片可用前提下的降级引用");
        // 步骤名映射对齐 data-flow.md §3 boot 时序。
        for (key, label) in [("repair", "自愈"), ("sync", "同步"), ("patches", "补丁"), ("preflight", "预检")] {
            assert!(LOADING_HTML.contains(key), "缺少步骤 {key}");
            assert!(LOADING_HTML.contains(label), "缺少步骤中文标签 {label}");
        }
    }

    #[test]
    fn recovery_page_contract_markers() {
        assert!(RECOVERY_HTML.contains("data-tauri-drag-region"));
        for (btn, fn_name) in [("doRestart", "restart"), ("doReload", "reload"), ("doLogs", "openLogs")] {
            assert!(RECOVERY_HTML.contains(btn), "缺按钮 {btn}");
            assert!(RECOVERY_HTML.contains(&format!("recovery.{fn_name}")), "缺 recovery.{fn_name} 契约调用");
        }
        assert!(RECOVERY_HTML.contains("crashes"), "展示崩溃计数");
    }

    /// 沉浸式双主题：壳页无内核主题可读，用 prefers-color-scheme 双档 CSS
    /// 变量（亮=内核 light 值，暗=Electron 同款深色），玻璃标题栏观感对齐
    /// Electron CHROME_CSS（color-mix 半透明 + backdrop-filter）。
    #[test]
    fn shell_pages_immersive_theme() {
        for (name, page) in [("loading", LOADING_HTML), ("recovery", RECOVERY_HTML)] {
            assert!(page.contains("color-scheme"), "{name} 缺双主题声明");
            assert!(page.contains("prefers-color-scheme: dark"), "{name} 缺系统偏好切档");
            for marker in ["color-mix", "backdrop-filter", "--bg:", "--fg:", "transition:background-color"] {
                assert!(page.contains(marker), "{name} 主题化缺 {marker}");
            }
        }
    }

    /// 鲸鱼 logo：内核 favicon.svg 同源矢量（viewBox 0 0 50 50、path 首段
    /// M48.8354 是指纹），fill:currentColor 随主题反色；替换旧渐变方块。
    #[test]
    fn shell_pages_whale_logo() {
        for (name, page) in [("loading", LOADING_HTML), ("recovery", RECOVERY_HTML)] {
            assert!(page.contains("M48.8354"), "{name} 缺鲸鱼 path（内核 favicon 同源）");
            assert!(page.contains(r#"viewBox="0 0 50 50""#), "{name} 鲸鱼 viewBox 缺失");
            assert!(page.contains("fill:currentColor"), "{name} 鲸鱼须随主题反色");
            assert!(!page.contains("linear-gradient"), "{name} 渐变方块 logo 应被鲸鱼替换");
        }
    }

    /// 失败显示防抖（#144「启动时报错但无影响」）：kernel-fail 不再立刻翻
    /// 标题——挂 1.8s 定时器，窗口内任何 boot-step（新尝试）都会 clearTimeout
    /// 取消并复位。supervisor 瀑布首败自动重跑 boot 链的成功路径上，失败字样
    /// 不再闪现；恢复页换页接管时本页直接销毁（定时器随文档回收，无需
    /// beforeunload）。到点（真终态：换页迟迟未发生）才翻标题 + 错误行。
    #[test]
    fn loading_fail_display_debounced() {
        assert!(LOADING_HTML.contains("setTimeout"), "kernel-fail 须经防抖定时器翻终态");
        assert!(LOADING_HTML.contains("clearTimeout"), "新尝试须能取消防抖定时器");
        assert!(LOADING_HTML.contains("1800"), "防抖窗口 ~1.8s");
        assert!(LOADING_HTML.contains("启动失败（正在转入恢复…）"), "kernel-fail 终态展示路径保留（防抖到点后）");
        // 终态文案只允许出现在 setTimeout 回调内（非同步路径）。
        let fail_at = LOADING_HTML.find("启动失败（正在转入恢复…）").unwrap();
        let timer_at = LOADING_HTML.find("failTimer = setTimeout").unwrap();
        assert!(fail_at > timer_at, "终态文案必须位于防抖回调内");
    }

    /// 新尝试自动复位：任何 boot-step 到达时取消未决定时器；标题处于失败态
    /// 则复位为「正在启动 DSH 内核…」（轮次 N≥2 才附「第 N 次尝试」计数）并
    /// 清空 err；链头 repair 重现（瀑布重跑 boot 链）= 新一轮。
    #[test]
    fn loading_boot_step_resets_failure_state() {
        assert!(LOADING_HTML.contains("data-fail"), "失败态标记（标记在、复位分支才有判定锚点）");
        assert!(LOADING_HTML.contains("errEl.textContent = ''"), "新尝试复位须清空 err");
        assert!(LOADING_HTML.contains("次尝试"), "重试轮次计数文案");
        assert!(LOADING_HTML.contains("attempts >= 2"), "计数 N≥2 才显示");
        assert!(LOADING_HTML.contains("resetForNewAttempt"), "复位走统一入口（boot-step 每事件都经过）");
        assert!(LOADING_HTML.contains("p.name === 'repair' && roundOpen"), "链头重现判定新一轮（listen 已解包信封，消费用 p）");
    }

    /// 分级语义：单步 !ok 只保留该步红字行，不再翻全局标题——warn 级步骤
    /// 失败时 boot 链仍在推进，「步骤失败」≠「整体失败」；整体失败的唯一
    /// 权威信号是 kernel-fail（其在 boot-step 监听之外独立翻终态）。
    #[test]
    fn loading_step_fail_graded_not_global() {
        assert!(!LOADING_HTML.contains("启动受阻"), "单步失败不再翻全局标题（旧钉死文案应移除）");
        assert!(!LOADING_HTML.contains("'启动失败'"), "旧的无修饰终态文案应替换为防抖版");
        let boot_step_body = LOADING_HTML
            .split("listen('boot-step'").nth(1).unwrap()
            .split("listen('kernel-fail'").next().unwrap();
        assert!(boot_step_body.contains("p.ok ? 'ok' : 'fail'"), "步骤红行（!ok 行级反馈）保留");
        assert!(!boot_step_body.contains("titleEl.textContent ="), "boot-step 监听内不得改全局标题（含 !ok 分支）");
    }

    /// 事件监听名不回归：boot-step / kernel-fail 两订阅稳定
    /// （supervisor 路由层 emit 名的页面侧契约；pet-state 随宠物窗退役移除）。
    #[test]
    fn loading_event_names_stable() {
        for name in ["'boot-step'", "'kernel-fail'"] {
            assert!(LOADING_HTML.contains(name), "缺事件订阅 {name}");
        }
        assert!(!LOADING_HTML.contains("'pet-state'"), "已退役的 pet-state 订阅不得复活");
    }

    /// #154 前端兜底出口：kernel-fail 防抖到点后必须展示「重试启动内核」/
    /// 「完全重新加载」两个恢复按钮（换页迟迟不发生时用户有明确出口，不再
    /// 停在无限转圈）；任何 boot-step（新尝试）复位隐藏出口。
    #[test]
    fn loading_fail_has_recovery_exit_buttons() {
        assert!(LOADING_HTML.contains("err-exit"), "缺恢复出口容器");
        assert!(LOADING_HTML.contains("doRestartKernel"), "缺「重试启动内核」按钮");
        assert!(LOADING_HTML.contains("doFullReload"), "缺「完全重新加载」按钮");
        assert!(LOADING_HTML.contains("exitEl.removeAttribute('hidden')"), "防抖到点后必须显示恢复出口");
        assert!(LOADING_HTML.contains("hideExit"), "新尝试须隐藏恢复出口（避免手动重试与自动重试叠加）");
        let fail_at = LOADING_HTML.find("exitEl.removeAttribute('hidden')").unwrap();
        let timer_at = LOADING_HTML.find("failTimer = setTimeout").unwrap();
        assert!(fail_at > timer_at, "恢复出口展示必须在防抖回调内（真终态才显示）");
        // 出口动作经 B.recovery 契约（与恢复页同源）。
        assert!(LOADING_HTML.contains("B && B.recovery.restart()"), "重试走 recovery.restart 契约");
        assert!(LOADING_HTML.contains("B && B.recovery.reload()"), "完全重新加载走 recovery.reload 契约");
        // 旧「无出口」形态不得回归（标题/err 仍在，但必须有按钮区）。
        let exit_pos = LOADING_HTML.find("id=\"err-exit\"").unwrap();
        let err_pos = LOADING_HTML.find("id=\"err\"").unwrap();
        assert!(exit_pos > err_pos, "恢复出口位于错误行之后");
    }

    /// 事件信封解包（#144 根因回归锚点）：Tauri 2 回调收 {event, payload} 信封
    /// （tauri-2.11.5 emit_js_script），listen() 必须先解包再交消费者——旧代码
    /// 裸读 ev.name/ev.ok 全 undefined，渲染成「undefined 0ms：失败」。
    #[test]
    fn loading_event_listeners_unwrap_envelope() {
        let src = include_str!("pages.rs").replace("\r\n", "\n");
        let listen_seg = src
            .split("function listen(name, cb)")
            .nth(1)
            .and_then(|s| s.split("var NAMES").next())
            .expect("listen 函数段");
        assert!(
            listen_seg.contains("ev.payload !== undefined ? ev.payload : ev"),
            "listen 必须解包信封 payload（双形态回退）: {listen_seg}"
        );
        // 消费侧不得再裸读信封字段（防回归）。
        let consumers = src
            .split("listen('boot-step'").nth(1).and_then(|s| s.split("listen('kernel-fail'").next()).unwrap_or("");
        assert!(!consumers.contains("ev.name"), "boot-step 消费必须经解包后的 p，不得裸读 ev.name");
    }
}
