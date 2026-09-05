// dsh-input-fold — 会话用户提示词折叠（DSH Desktop 配套插件）
//
// 浏览器半边（classic-script bundle，经 __ModuleLoader__.load 注册）：
//   1. 定位 user 消息块：内核会话把每个节点渲染为
//      div.flowItem[data-chat-flow-kind="user"][data-chat-anchor-key]
//        └─ div.userRow[data-time-hover-root]   （旧内核；当前内核该属性已删除，
//             └─ div.userStack                   仅保留 class 词元 userRow）
//                  └─ div.bubble（[class*="bubble"]）—— 纯文本提示词所在
//      （参见 @deepseek-ai/dsh-client-ui-conversation/lib/client.js 的
//      ChatNodeSeat / UserStyleBubble；图片渲染在 bubble 之外的 userStack，
//      非文本块 JsonBlock 渲染在 bubble 内部，含 button/pre）。
//   2. 纯文本判定 + 阈值：仅当气泡内无图片/代码块/表格/JsonBlock 且
//      textContent 超过 400 字符或 8 行才折叠；短消息/富内容打
//      data-dsh-fold="off"，零 UI、零侵入。
//   3. 折叠方式：给 flow item 打 data-dsh-fold="collapsed"（React 不会移除
//      它未管理的自定义属性），CSS 对 bubble 限高 + overflow:hidden + 底部
//      「展开」渐变遮罩（伪元素，pointer-events:none）。点击折叠区展开 →
//      data-dsh-fold="expanded"，注入的「收起」按钮显示；点它收回。
//   4. 事件委托（document 单次 click 监听）+ 渲染后按需标注（rAF 首扫 +
//      1s 低频兜底扫描，querySelectorAll 只在未处理行上干活）——不用
//      MutationObserver 每帧扫描。
//   5. 全部交互 try/catch 静默降级；展开态等于原样（不丢内容、复制选中正常）。
//
// 纯逻辑挂在 window.__dshInputFoldCore（生产无副作用），供 node 测试套件
// 直接评估本文件验证 —— 官方模块加载器只支持 classic script，不能 import。
(function () {
  'use strict';

  // ───────────────────────── 常量（阈值） ─────────────────────────
  var FOLD_CHAR_THRESHOLD = 400;     // 超过 400 字符才折叠
  var FOLD_LINE_THRESHOLD = 8;       // 超过 8 行才折叠
  var COLLAPSED_HEIGHT_PX = 144;     // 折叠态气泡限高（约 6 行 × 24px）
  var SCAN_INTERVAL_MS = 1000;       // 低频兜底扫描（新消息/React 重渲染自愈）

  // ───────────────────────── 纯逻辑（可测） ─────────────────────────

  /** 行数（\r\n / \r / \n 均按一行分割；空串 0 行）。 */
  function countLines(text) {
    var t = String(text == null ? '' : text);
    if (t === '') return 0;
    return t.split(/\r\n|\r|\n/).length;
  }

  /**
   * 是否「很长」（需折叠）：字符数超过阈值 或 行数超过阈值。
   * 短消息返回 false（调用侧零侵入，不折叠、无任何 UI）。
   */
  function shouldFold(text) {
    var t = String(text == null ? '' : text);
    if (t === '') return false;
    if (t.length > FOLD_CHAR_THRESHOLD) return true;
    if (countLines(t) > FOLD_LINE_THRESHOLD) return true;
    return false;
  }

  /**
   * 折叠状态机（纯逻辑）：以消息 key 追踪「已展开」项，默认折叠
   * （不在 expanded 集合里 = collapsed）。
   */
  function createFoldController() {
    var expanded = Object.create(null);

    function norm(key) { return String(key == null ? '' : key); }

    function isExpanded(key) { return expanded[norm(key)] === true; }
    function setExpanded(key, value) {
      var k = norm(key);
      if (!k) return;
      if (value) expanded[k] = true;
      else delete expanded[k];
    }
    function expand(key) { setExpanded(key, true); }
    function collapse(key) { setExpanded(key, false); }
    function toggle(key) {
      var k = norm(key);
      if (!k) return false;
      var next = !isExpanded(k);
      setExpanded(k, next);
      return next;
    }
    function snapshot() { return Object.assign({}, expanded); }

    return {
      isExpanded: isExpanded,
      setExpanded: setExpanded,
      expand: expand,
      collapse: collapse,
      toggle: toggle,
      snapshot: snapshot,
      _state: expanded,
    };
  }

  // 暴露纯逻辑供测试；生产无副作用。
  var core = {
    FOLD_CHAR_THRESHOLD: FOLD_CHAR_THRESHOLD,
    FOLD_LINE_THRESHOLD: FOLD_LINE_THRESHOLD,
    COLLAPSED_HEIGHT_PX: COLLAPSED_HEIGHT_PX,
    SCAN_INTERVAL_MS: SCAN_INTERVAL_MS,
    countLines: countLines,
    shouldFold: shouldFold,
    createFoldController: createFoldController,
  };
  if (typeof window !== 'undefined') {
    window.__dshInputFoldCore = core;
  }

  // ───────────────────────── 运行时状态 ─────────────────────────
  var controller = createFoldController();

  var FOLD_ATTR = 'data-dsh-fold';          // flow item 上的折叠状态/处理标记
  var TOGGLE_ATTR = 'data-dsh-fold-toggle'; // 「收起」按钮标记
  var USER_ROW_SEL = '[data-chat-flow-kind="user"]';
  var BUBBLE_SEL = '[class*="bubble"]';

  function stateOf(row) { return row && row.getAttribute ? (row.getAttribute(FOLD_ATTR) || '') : ''; }

  // ───────────────────────── DOM 粘合 ─────────────────────────

  /**
   * 测量一个 user 消息块是否应折叠（纯文本且够长）。
   * 返回 { bubble, text, foldable }；不可折叠（无气泡 / 有图片 / 富内容）返回 null。
   */
  function measureRow(row) {
    if (!row || typeof row.querySelector !== 'function') return null;
    var bubble = row.querySelector(BUBBLE_SEL);
    if (!bubble) return null;
    // 图片：用户消息图片渲染在 bubble 之外的 userStack；有 <img> 即不折叠（别碰图片）。
    if (row.querySelector('img')) return null;
    // 富内容：rest 块的 JsonBlock 会渲染 button/pre；异常内容同理。不折叠（别碰代码块/表格）。
    if (bubble.querySelector('pre, code, table, button')) return null;
    var text = bubble.textContent || '';
    return { bubble: bubble, text: text, foldable: shouldFold(text) };
  }

  /** 给 flow item 打上折叠状态（或 off 标记），折叠时补「收起」按钮。 */
  function markUserMessage(row) {
    var info = measureRow(row);
    if (!info || !info.foldable) {
      row.setAttribute(FOLD_ATTR, 'off'); // 短消息 / 富内容 / 无气泡：已处理，零 UI
      return;
    }
    var key = row.getAttribute('data-chat-anchor-key') || '';
    row.setAttribute(FOLD_ATTR, controller.isExpanded(key) ? 'expanded' : 'collapsed');
    ensureToggleButton(row);
  }

  /** 「收起」按钮：追加到 userRow（React 偶尔重渲染可能移除，scan 会补回）。 */
  function ensureToggleButton(row) {
    if (!row || typeof row.querySelector !== 'function') return;
    if (row.querySelector('[' + TOGGLE_ATTR + ']')) return;
    // dsh-compat:hover-root-fallback —— [data-time-hover-root] 在当前内核已被删除
    // （实机命中 0，见行锚说明），直接退到 row 会把「收起」按钮甩到整行末尾
    // （动作条之下），与原来贴在 userStack 后面的位置不一致。中间垫一档
    // class 词元 userRow：哈希前缀会变、局部名不会变，与本文件 [class*="bubble"]
    // 同一套判定风格。
    var host = row.querySelector('[data-time-hover-root]')
      || row.querySelector('[class*="userRow"]')
      || row;
    if (!host || typeof host.appendChild !== 'function') return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(TOGGLE_ATTR, '');
    btn.className = 'dsh-input-fold-toggle';
    btn.setAttribute('aria-label', '收起');
    btn.setAttribute('title', '收起提示词');
    btn.textContent = '收起';
    host.appendChild(btn);
  }

  function expandRow(row) {
    var key = row.getAttribute('data-chat-anchor-key') || '';
    controller.expand(key);
    row.setAttribute(FOLD_ATTR, 'expanded');
    ensureToggleButton(row);
  }

  function collapseRow(row) {
    var key = row.getAttribute('data-chat-anchor-key') || '';
    controller.collapse(key);
    row.setAttribute(FOLD_ATTR, 'collapsed');
  }

  /** 渲染后按需标注：只处理未标记行；已折叠行补回可能被 React 抹掉的按钮。 */
  function scan() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    var rows = document.querySelectorAll(USER_ROW_SEL);
    for (var i = 0; i < rows.length; i++) {
      try {
        var state = stateOf(rows[i]);
        if (!state) {
          markUserMessage(rows[i]);
        } else if (state === 'collapsed' || state === 'expanded') {
          ensureToggleButton(rows[i]);
        }
        // state === 'off'：短消息/富内容，什么都不做
      } catch (_e) { /* 单条失败不影响其余 */ }
    }
  }

  /** 事件委托：点「收起」按钮收回；点折叠区（collapsed 气泡）展开。 */
  function onClick(e) {
    var target = e && e.target;
    if (!target || typeof target.closest !== 'function') return;

    var toggleBtn = target.closest('[' + TOGGLE_ATTR + ']');
    if (toggleBtn) {
      var row1 = toggleBtn.closest(USER_ROW_SEL);
      if (row1 && stateOf(row1) === 'expanded') collapseRow(row1);
      return;
    }

    var row2 = target.closest(USER_ROW_SEL + '[' + FOLD_ATTR + '="collapsed"]');
    if (row2 && target.closest(BUBBLE_SEL)) {
      expandRow(row2);
    }
  }

  var listenersAttached = false;
  function attachGlobalListeners() {
    if (listenersAttached) return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', onClick, false);
    listenersAttached = true;
  }

  var scanTimer = null;
  function scheduleScanSoon() {
    if (typeof window === 'undefined') return;
    if (typeof window.requestAnimationFrame === 'function') {
      try { window.requestAnimationFrame(scan); } catch (_e) { scan(); }
    } else {
      scan();
    }
  }
  function startScanning() {
    scheduleScanSoon();
    if (scanTimer == null && typeof setInterval === 'function') {
      scanTimer = setInterval(scan, SCAN_INTERVAL_MS);
    }
  }

  // ───────────────────────── 样式 ─────────────────────────

  var FOLD_CSS = [
    '[data-chat-flow-kind="user"][data-dsh-fold="collapsed"] [class*="bubble"]{',
    'max-height:' + COLLAPSED_HEIGHT_PX + 'px;overflow:hidden;position:relative;',
    '}',
    '[data-chat-flow-kind="user"][data-dsh-fold="collapsed"] [class*="bubble"]::after{',
    'content:"展开";',
    'position:absolute;left:0;right:0;bottom:0;height:48px;',
    'display:flex;align-items:flex-end;justify-content:center;',
    'padding-bottom:6px;box-sizing:border-box;',
    'font-size:12.5px;line-height:18px;',
    'color:var(--dsw-alias-label-secondary,#8b93b0);',
    'background:linear-gradient(180deg,transparent 0%,var(--dsw-specific-bubble,#1f2a44) 62%);',
    'pointer-events:none;',
    '}',
    '[data-dsh-fold-toggle]{',
    'display:none;appearance:none;',
    'border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));',
    'background:var(--dsw-alias-bg-layer-2,#16203a);',
    'color:var(--dsw-alias-label-secondary,#8b93b0);',
    'font-size:12px;line-height:18px;padding:2px 10px;border-radius:999px;',
    'cursor:pointer;margin-top:4px;',
    '}',
    '[data-dsh-fold="expanded"] [data-dsh-fold-toggle]{display:inline-flex;}',
  ].join('');

  var CSS_TAG = 'dsh-input-fold/client.css';
  function ensureCss() {
    if (typeof document === 'undefined') return;
    try {
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]')) return;
      var el = document.createElement('style');
      el.setAttribute('data-plugin', 'dsh-input-fold');
      el.setAttribute('data-plugin-css', CSS_TAG);
      el.textContent = FOLD_CSS;
      (document.head || document.documentElement).appendChild(el);
    } catch (_e) { /* 样式失败不挡功能 */ }
  }

  // 统一暴露运行时（测试驱动用；生产无副作用）。
  if (typeof window !== 'undefined') {
    window.__dshInputFoldStore = {
      scan: scan,
      measureRow: measureRow,
      markUserMessage: markUserMessage,
      getController: function () { return controller; },
    };
  }

  // ───────────────────────── 注册 ─────────────────────────
  window.__ModuleLoader__.load({
    id: 'dsh-input-fold',
    factory: function () {
      // 纯 DOM 方案：不依赖 react / ctx.slots，inject 为空。
      function apply() {
        attachGlobalListeners();
        ensureCss();
        startScanning();
      }
      var module = { exports: {} };
      module.exports = { inject: [], apply: apply, core: core };
      return module.exports;
    },
  });
})();
