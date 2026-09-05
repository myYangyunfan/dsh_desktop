// dsh-image-paste — 图片粘贴发送（DSH Desktop 配套插件）
//
// 浏览器半边（classic-script bundle，经 __ModuleLoader__.load 注册）：
//   · 监听对话页面的 paste 事件，从 clipboardData.items 提取图片文件
//     （kind === 'file' 且 type 以 image/ 开头）；rc.8 内核输入框原生接管
//     的粘贴（defaultPrevented）让位，仅作官方管道缺席时的降级通道；
//   · 经 preload 受控 IPC（dshDesktop.imagePaste.save）把图片保存到临时
//     目录，拿到完整路径后按 dsh-file-drop 同款格式注入输入框路径提示
//     （agent 用 inspect_image 工具分析图片后继续）；
//   · 纯文本粘贴（无图片）完全不干预，交给上游输入框处理；同时粘贴
//     文本+图片时文本照常粘贴，图片提示追加在末尾。
//
// 纯逻辑挂在 window.__dshImagePasteCore 上（生产无副作用），供 node 测试
// 套件直接评估本文件验证 —— 官方模块加载器只支持 classic script，不能 import。
//
// 降级通道的写入口适配（内核换代后）：composer 已由 <textarea> 换成 Lexical
// contenteditable，拿 textarea 原型 setter 打在 <div> 上会抛 TypeError，被外层
// .catch 吞成「粘贴石沉大海」—— 故注入按元素形态分流、注入后回读校验，
// 写不上与存盘失败都给可见提示，不再静默降级。
(function () {
  'use strict';

  // ───────────────────────── 纯逻辑（可测） ─────────────────────────
  var MAX_IMAGE_BYTES = 15 * 1024 * 1024;

  var IMAGE_MIME_EXT = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/avif': '.avif',
    'image/ico': '.ico',
    'image/tiff': '.tiff',
    'image/x-icon': '.ico',
  };

  /** 剪贴板 item 是否为图片文件。 */
  function isImageItem(item) {
    return !!item && typeof item.kind === 'string' && item.kind === 'file' &&
      typeof item.type === 'string' && item.type.indexOf('image/') === 0;
  }

  /** 从 clipboardData.items 提取图片文件列表（跳过非图片项）。 */
  function imageFilesFrom(items) {
    var out = [];
    if (!items) return out;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!isImageItem(item)) continue;
      try {
        var f = item.getAsFile();
        if (f) out.push(f);
      } catch (_e) { /* 单个 item 失败不影响其余 */ }
    }
    return out;
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** 文件名清洗：去路径分隔符与保留字，限长；空名回退默认。 */
  function sanitizeName(name) {
    var s = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 40);
    return s || '粘贴图片';
  }

  /**
   * 生成要注入输入框的文本：每张图片一行（粘贴图片：名称 + 完整路径 +
   * 大小），提示 agent 用 inspect_image 分析。
   */
  function buildPasteHint(_a) {
    var images = _a.images;
    var lines = ['[粘贴图片]'];
    for (var i = 0; i < images.length; i++) {
      var im = images[i] || {};
      var name = sanitizeName(im.name);
      var path = im.path || '';
      var sizeText = im.size != null ? '，大小 ' + formatSize(im.size) : '';
      lines.push('- ' + name + sizeText + (path ? '\n  完整路径：' + path : ''));
    }
    lines.push('请用 inspect_image 工具逐一分析这些图片后继续。');
    return lines.join('\n');
  }

  // 暴露纯逻辑供测试；生产无副作用。
  if (typeof window !== 'undefined') {
    window.__dshImagePasteCore = {
      MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
      isImageItem: isImageItem,
      imageFilesFrom: imageFilesFrom,
      sanitizeName: sanitizeName,
      buildPasteHint: buildPasteHint,
      injectIntoComposer: injectIntoComposer,
    };
  }

  // ───────────────────────── DOM 粘合 ─────────────────────────

  /** 在给定作用域里安全查询（测试桩里的“元素”可能没有 querySelector）。 */
  function queryIn(scope, selector) {
    try {
      if (scope && typeof scope.querySelector === 'function') return scope.querySelector(selector);
    } catch (_e) { /* 选择器非法/不可达 */ }
    return null;
  }

  /**
   * 找到当前会话输入框。两代内核两种形态都认：当前是 Lexical
   * contenteditable（[data-composer-input] 为实测在位的稳定属性，全页已无
   * textarea），旧版是 React 受控 textarea。粘贴时焦点常常在 body 而不
   * 是输入框，所以必须先按权威锚点找，焦点元素只作兜底。
   */
  function findComposer() {
    if (typeof document === 'undefined') return null;
    var scope = queryIn(document, '[data-slot="conversation.session"]') || document;
    return queryIn(scope, '[data-composer-input]')
      || queryIn(scope, '[data-lexical-editor]')
      || queryIn(scope, 'textarea')
      || queryIn(document, '[data-composer-input]')
      || (function () {
        var ae = document.activeElement;
        return ae && (ae.tagName === 'TEXTAREA' || ae.isContentEditable) ? ae : null;
      })();
  }

  /** 读输入框当前文本（textarea 走 value，contenteditable 走 textContent）。 */
  function composerText(el) {
    if (!el) return null;
    try {
      if (typeof el.value === 'string') return el.value;
      if (typeof el.textContent === 'string') return el.textContent;
    } catch (_e) { /* 异形元素 */ }
    return null;
  }

  /**
   * 向输入框注入文本，按元素形态分流两条写路径：
   *   · textarea（旧内核 React 受控）：native value setter + input 事件；
   *   · contenteditable（当前 Lexical）：光标移到末尾后 execCommand
   *     ('insertText')，经 beforeinput 管线让编辑器自己收下。
   * 返回是否真的落上（回读校验）：调用须据此给可见提示，不得再
   * 静默吞——旧实现拿 textarea 原型 setter 打在 <div> 上抛 TypeError 后被 .catch
   * 吞掉，就是本插件「粘了图片但输入框丝毫没有反应」的直接原因。
   */
  function injectIntoComposer(el, text) {
    if (!el || !text) return false;
    var before = composerText(el) || '';
    var payload = text.endsWith('\n') ? text : text + '\n';
    try { el.focus(); } catch (_e) { /* 不可聚焦不影响写入 */ }
    var isTextarea = el.tagName === 'TEXTAREA' || (typeof el.value === 'string' && !el.isContentEditable);
    if (isTextarea) {
      var desc = typeof HTMLTextAreaElement === 'function'
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') : null;
      if (desc && typeof desc.set === 'function') desc.set.call(el, before + payload);
      else el.value = before + payload;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_e2) { /* 桩环境无 Event */ }
    } else {
      try {
        var sel = typeof window !== 'undefined' && typeof window.getSelection === 'function' ? window.getSelection() : null;
        var range = typeof document.createRange === 'function' ? document.createRange() : null;
        if (sel && range && typeof range.selectNodeContents === 'function') {
          range.selectNodeContents(el);
          range.collapse(false); // 末尾——不劈开刚粘上的文本与引用 chip
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_e3) { /* 选区不可得仍试一次 insertText */ }
      try {
        if (!document.execCommand('insertText', false, payload)) return false;
      } catch (_e4) { return false; }
    }
    var after = composerText(el);
    if (after === null) return true; // 回读不到（异形桩元素）→ 信任写入
    return after.length > before.length && after.indexOf(text) >= 0;
  }

  var NOTICE_ID = 'dsh-image-paste-notice';

  /** 降级通道的可见错误出口（本插件无槽位也无 ctx，只能自绘浮层）。 */
  function showNotice(message) {
    try {
      if (typeof document === 'undefined' || !document.body || !document.createElement) return;
      var host = document.getElementById(NOTICE_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = NOTICE_ID;
        host.setAttribute('data-plugin', 'dsh-image-paste');
        host.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
          'max-width:min(560px,86vw);padding:8px 14px;border-radius:10px;font-size:12.5px;line-height:18px;' +
          'pointer-events:none;background:#16203a;color:#ff7a85;border:1px solid rgba(127,127,127,.35);' +
          'font-family:system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);';
        document.body.appendChild(host);
      }
      host.textContent = message;
      host.style.display = 'block';
      clearTimeout(showNotice._t);
      showNotice._t = setTimeout(function () { host.style.display = 'none'; }, 6000);
    } catch (_e) { /* 展示失败静默（不能因报错通道再报错） */ }
  }

  function saveViaBridge(file) {
    return new Promise(function (resolve, reject) {
      var b = window.dshDesktop && window.dshDesktop.imagePaste;
      if (!b || typeof b.save !== 'function') {
        reject(new Error('no bridge'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        b.save({ dataUrl: String(reader.result || ''), name: file.name || '粘贴图片' })
          .then(function (res) {
            if (res && res.ok) resolve({ name: file.name || '粘贴图片', path: res.path, size: res.size != null ? res.size : file.size });
            else reject(new Error((res && res.error) || 'save failed'));
          })
          .catch(reject);
      };
      reader.onerror = function () { reject(new Error('read failed')); };
      reader.readAsDataURL(file);
    });
  }

  function handlePastedImages(files) {
    if (!files || files.length === 0) return;
    var hints = [];
    var missing = [];
    var jobs = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if ((f.size || 0) > window.__dshImagePasteCore.MAX_IMAGE_BYTES) {
        missing.push({ name: f.name || '粘贴图片', size: f.size, path: '' });
        continue;
      }
      jobs.push(saveViaBridge(f).then(function (saved) { hints.push(saved); }));
    }
    Promise.all(jobs)
      .then(function () {
        var all = hints.concat(missing);
        if (all.length === 0) return;
        // 注入失败必须可见：图已落盘，用户拿不到路径就等于丢图。
        if (!injectIntoComposer(findComposer(), window.__dshImagePasteCore.buildPasteHint({ images: all }))) {
          showNotice('粘贴图片已存到临时目录，但没能写进输入框——请重试，或直接把路径粘给 agent');
        }
      })
      .catch(function (e) {
        // 存盘失败也给出口：静默吞会让用户以为「粘上了但模型没看到」。
        showNotice('粘贴图片降级保存失败：' + ((e && e.message) || '未知原因'));
      });
  }

  function attachPasteHandler() {
    if (typeof document === 'undefined') return;
    document.addEventListener('paste', function (e) {
      // rc.8 内核输入框已原生把粘贴图片收进官方附件栏（textarea 的 onPaste
      // → intakeImages；纯图与带文本粘贴都会 preventDefault）。本监听器在
      // document 冒泡段晚于内核处理器执行：defaultPrevented 即「官方已接
      // 手」→ 让位，避免同一张图既进原生附件栏、又追加一份路径提示文本
      //（双重处理）。官方未接手（粘贴焦点不在输入框 / 会话忙 / 旧内核）时
      // 维持原路径提示降级。
      if (e.defaultPrevented) return;
      var cd = e.clipboardData;
      if (!cd) return;
      var files = window.__dshImagePasteCore.imageFilesFrom(cd.items);
      if (files.length === 0) return; // 纯文本粘贴：不干预上游
      // 不 preventDefault：文本部分照常粘贴，图片提示追加在末尾。
      handlePastedImages(files);
    }, false);
  }

  // ───────────────────────── 注册 ─────────────────────────
  window.__ModuleLoader__.load({
    id: 'dsh-image-paste',
    factory: function (require) {
      var inject = [];
      function apply() {
        attachPasteHandler();
      }
      var module = { exports: {} };
      module.exports = { inject: inject, apply: apply };
      return module.exports;
    },
  });
})();