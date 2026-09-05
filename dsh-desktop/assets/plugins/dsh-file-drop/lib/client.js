// dsh-file-drop — 选中上传 + 拖入文件到对话（DSH Desktop 配套插件）
//
// 浏览器半边（classic-script bundle，经 __ModuleLoader__.load 注册）：
//   1. composer 工具行「📎 附件」按钮（conversation.input.left 槽）：
//      点击弹出多选文件选择器 →
//      · 图片（内核白名单 png/jpeg/webp/gif）→ 官方草稿附件管道
//        （conversation.createDraftImages + inputActions.addImages），
//        进入内核原生附件栏（缩略图/删除/随消息发送），DeepSeek 直接看到图；
//      · 文本/代码文件 → 读取内容注入输入框（体积上限内）；
//      · 其余类型 → 就地红字提示原因（内核附件仅支持图片）。
//   2. 对话区域 dragover/drop 拦截（阻止浏览器打开文件）：
//      · 内核 ui-attachment 已接管（drop 事件 defaultPrevented）的内核白名单
//        图片让位（避免同一张图重复进附件栏）；
//      · 文本/代码 → 内容注入；图片（内核未接管时）/ 二进制 / 超大 → 路径提示。
//   3. 壳层拖放事件 client-file-drop（Tauri：Rust 侧 drag-drop → bridge 转发，
//      载荷 {files:[{path,name,size}]}；WebView2 下 HTML5 drop 不达页面，这是
//      桌面拖入的主通道）→ M3 拖拽=粘贴 统一：内核白名单图片（png/jpg/
//      jpeg/webp/gif，单图 ≤3.5MB）经宿主半边同源路由 /dsh-file-drop/
//      read-image 读成 dataUrl，与「直接粘贴图片」「📎 选择图片」走完全相同
//      的官方附件管道（conversation.createDraftImages + inputActions
//      .addImages —— 内核粘贴处理器 intakeImages 的同一落点）与同一限额
//      裁决（planPickedFiles 镜像 intakeImages：类型/张数/单图/合计）；
//      读失败/超限/非白名单/文本/二进制 → 维持既有路径提示注入，零回归。
//      载荷自带内容（dataUrl/base64）时免读直接转 File 进同一管道。
//   4. 全部交互 try/catch 静默降级（插件惯例），失败经就地红字/浮动 toast
//      给用户可见错误文案。
//
// 两代内核的读侧契约（内核换代后 input 快照不再直下槽位组件）：
//   conversation.input.left 现只下发 hook（实测 props 有 useInput/useChat/
//   inputActions/sessionId，无 input/session），故附件栏张数与草稿前缀经
//   useInput 蒸馏镜像取回（props.input 在位时优先，兼容旧内核与测试）；
//   composer 已由 <textarea> 换成 Lexical contenteditable，注入必须走
//   beforeinput 管线（execCommand insertText）并回读校验 —— 写不进去要给
//   可见提示，不再静默吞（静默失效是本族缺陷的病灶）。
//
// 内核附件 API（@deepseek-ai/dsh-attachment-local，内容制）：
//   媒体白名单 image/png|jpeg|webp|gif；默认单图 3.5MB、单条消息 20 张、
//   合计 100MB、单边 2000px —— 见 node_modules 内 lib/index.js
//   （mediaTypes 行 302-307、DEFAULT_MAX_* 行 265-279）。此处镜像为前置
//   校验，超限立即红字拒绝，不让用户白选。
//
// 纯逻辑挂在 window.__dshFileDropCore（生产无副作用），供 node 测试套件
// 直接评估本文件验证 —— 官方模块加载器只支持 classic script，不能 import。
(function () {
  'use strict';

  // ───────────────────────── 纯逻辑（可测） ─────────────────────────
  var TEXT_MAX_BYTES = 256 * 1024;
  var SNIFF_BYTES = 8192;

  var TEXT_EXT = new Set([
    '.txt', '.md', '.markdown', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
    '.php', '.sh', '.bat', '.ps1', '.sql', '.html', '.htm', '.css', '.scss',
    '.less', '.xml', '.csv', '.tsv', '.log', '.env', '.gitignore', '.npmrc',
    '.lock', '.sum', '.properties', '.editorconfig', '.vue', '.svelte',
  ]);
  var IMAGE_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif', '.ico', '.tiff',
  ]);

  // 内核附件白名单与限额（@deepseek-ai/dsh-attachment-local 默认值镜像）。
  var KERNEL_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  var KERNEL_LIMITS = {
    maxImageBytes: 3.5 * 1024 * 1024,          // 单图编码字节上限（3670016）
    maxImagesPerMessage: 20,                   // 单条消息图片数上限
    maxMessageImageBytes: 100 * 1024 * 1024,   // 单条消息图片合计上限
    maxImageDimension: 2000,                   // 单边像素上限（模型路由约束）
  };

  // 内核附件白名单：扩展名 → MIME（壳层 client-file-drop 载荷只有路径没有
  // MIME，按扩展名推导候补；真实类型以宿主读回后的魔数嗅探为准）。
  var RAIL_IMAGE_EXT_MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
  };

  function extOf(name) {
    var dot = String(name || '').lastIndexOf('.');
    if (dot <= 0) return '';
    return String(name).slice(dot).toLowerCase();
  }

  /** 文件分类：text（内容注入）/ image（附件管道或路径提示）/ binary（路径提示）。 */
  function classifyFile(name, size) {
    var ext = extOf(name);
    if (IMAGE_EXT.has(ext)) return { kind: 'image', reason: 'image' };
    if (TEXT_EXT.has(ext) || ext === '') return { kind: 'text', reason: ext === '' ? 'extensionless' : 'text' };
    return { kind: 'binary', reason: 'binary' };
  }

  /** 头部 NUL 字节嗅探：文本里出现 \0 视为二进制。 */
  function looksBinary(content) {
    var head = String(content || '').slice(0, SNIFF_BYTES);
    return head.indexOf('\u0000') !== -1;
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** 浏览器 File 的 MIME 是否落在内核附件白名单内。 */
  function isKernelImageType(mime) {
    return KERNEL_IMAGE_MEDIA_TYPES.indexOf(String(mime || '')) !== -1;
  }

  /** 单边像素是否在内核限额内（w/h 非正视为未知，放行交内核裁决）。 */
  function dimsWithinLimit(w, h, max) {
    var width = Number(w) || 0;
    var height = Number(h) || 0;
    if (width <= 0 || height <= 0) return true;
    return Math.max(width, height) <= (max || KERNEL_LIMITS.maxImageDimension);
  }

  /**
   * 构造要注入输入框的文本。
   * 内容在 TEXT_MAX_BYTES 内 → { kind: 'text', text }；
   * 超过 → { kind: 'path-hint', text }（有 path 时给完整路径让 agent 读文件）。
   */
  function buildTextInsertion(_a) {
    var name = _a.name, content = _a.content, path = _a.path, size = _a.size;
    var text = String(content || '');
    if (text.length > TEXT_MAX_BYTES || looksBinary(text)) {
      return { kind: 'path-hint', text: buildPathHint({ name: name, path: path, size: size != null ? size : text.length }) };
    }
    return {
      kind: 'text',
      text: '<!-- 拖入文件：' + name + ' -->\n' + text,
    };
  }

  /** 图片 / 二进制 / 超大文件的路径提示（agent 按路径读取或 inspect_image）。 */
  function buildPathHint(_a) {
    var name = _a.name, path = _a.path, size = _a.size;
    var label = name || '（未命名文件）';
    var sizeText = size != null ? '，大小 ' + formatSize(size) : '';
    if (path) {
      return '[拖入文件：' + label + sizeText + ']\n完整路径：' + path + '\n请读取该文件内容后继续；图片请用 inspect_image 工具分析。';
    }
    return '[拖入文件：' + label + sizeText + ']\n（无法获取完整路径，请通过文件标签页或项目目录读取该文件。）';
  }

  /**
   * 壳层拖放事件（client-file-drop）多文件合并提示块：一次拖入只注入一个
   * 块，逐文件一行（名/大小/路径），agent 逐个处理。
   */
  function buildDropHint(items) {
    var lines = ['[拖入 ' + items.length + ' 个文件]'];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var sizeText = it.size != null ? '，' + formatSize(it.size) : '';
      lines.push('- ' + (it.name || '（未命名）') + sizeText + (it.path ? '\n  完整路径：' + it.path : '（无路径）'));
    }
    lines.push('请依次读取这些文件；图片请用 inspect_image 工具分析。');
    return lines.join('\n');
  }

  /**
   * 路径净化（纯函数）：去控制字符与引号、trim、限长 4096；不合法返回 ''。
   * 壳层事件载荷不可信，注入输入框前必须过这里。
   */
  function sanitizePath(p) {
    var s = String(p == null ? '' : p);
    if (!s) return '';
    s = s.replace(/[\u0000-\u001f\u007f"']/g, '').trim();
    if (!s) return '';
    if (s.length > 4096) s = s.slice(0, 4096);
    return s;
  }

  /**
   * 载荷条目归一：path 净化、name 取传入或路径 basename、size 归一非负数；
   * 可选内容字段（dataUrl/base64/mediaType，F1 后续若随载荷带内容）透传，
   * 超长（>160MB 字符）视为损坏丢弃。
   */
  function normalizeDropEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var path = sanitizePath(raw.path);
    var name = String(raw.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!name && path) {
      var parts = path.split(/[\\/]/).filter(Boolean);
      name = parts.length > 0 ? parts[parts.length - 1].slice(0, 200) : '';
    }
    var size = Number(raw.size);
    if (!isFinite(size) || size < 0) size = null;
    if (!path && !name) return null;
    var out = { path: path, name: name, size: size };
    if (typeof raw.dataUrl === 'string' && raw.dataUrl.length > 0 && raw.dataUrl.length < 160 * 1024 * 1024) out.dataUrl = raw.dataUrl;
    if (typeof raw.base64 === 'string' && raw.base64.length > 0 && raw.base64.length < 160 * 1024 * 1024) out.base64 = raw.base64;
    if (typeof raw.mediaType === 'string' && raw.mediaType.length <= 64) out.mediaType = raw.mediaType;
    return out;
  }

  /**
   * 归一壳层 client-file-drop 载荷（宽容形态）：detail.files 数组 / detail
   * 本身是数组 / 其它 → []。逐条 sanitize，剔除无效项。
   */
  function normalizeDropPayload(detail) {
    var list = null;
    if (detail && Array.isArray(detail.files)) list = detail.files;
    else if (Array.isArray(detail)) list = detail;
    if (!list) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = normalizeDropEntry(list[i]);
      if (e) out.push(e);
    }
    return out.slice(0, 100); // 防载荷洪水：一次最多收 100 条
  }

  /** 去重键：路径在场以路径为准，否则名+大小。 */
  function dropKey(entry) {
    if (entry.path) return 'p:' + entry.path.toLowerCase();
    return 'n:' + (entry.name || '') + ':' + (entry.size != null ? entry.size : '?');
  }

  /**
   * 条目的全部去重键（带路径的条目同时占 path 键与 名+大小 键：HTML5 侧
   * 无路径、壳层侧有路径，任一命中即视为同一次物理拖放的双报）。
   */
  function dropKeys(entry) {
    var keys = [dropKey(entry)];
    if (entry.path) keys.push('n:' + (entry.name || '') + ':' + (entry.size != null ? entry.size : '?'));
    return keys;
  }

  /**
   * HTML5 drop 与壳层 client-file-drop 可能对同一次物理拖放各报一次
   *（壳配置切换期）。按键在 windowMs 内去重，返回新数组。
   */
  function dedupeEntries(entries, seen, now, windowMs) {
    var keep = [];
    for (var i = 0; i < entries.length; i++) {
      var keys = dropKeys(entries[i]);
      var dup = false;
      for (var k = 0; k < keys.length; k++) {
        var prev = seen[keys[k]];
        if (prev != null && now - prev <= (windowMs || 1500)) { dup = true; break; }
      }
      if (dup) continue;
      for (var m = 0; m < keys.length; m++) seen[keys[m]] = now;
      keep.push(entries[i]);
    }
    return keep;
  }

  /**
   * 选择器结果的分类裁决（纯函数）：
   * 输入 File 形态对象 {name,type,size,path?} 与既有附件栏数量，输出逐文件
   * 决定 —— rail（官方附件管道）/ text（内容注入）/ error（带原因文案）。
   * count / total 超限按限额整批前置拦截；limits 可注入（默认内核限额，
   * 服务端可配置更大单图上限时合计分支才会先于张数分支触发）。
   */
  function planPickedFiles(files, railCount, limits) {
    var lim = limits || KERNEL_LIMITS;
    var plan = { rail: [], text: [], errors: [] };
    if (!files || files.length === 0) return plan;
    var have = Number(railCount) || 0;
    var railBytes = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var name = String(f.name || '（未命名）');
      var size = Number(f.size) || 0;
      var cls = classifyFile(name, size);
      if (cls.kind === 'text') { plan.text.push(f); continue; }
      if (cls.kind !== 'image') {
        plan.errors.push({ name: name, message: '「' + name + '」不支持：内核附件仅支持图片（PNG/JPEG/WebP/GIF）与常见文本文件；PDF/压缩包等请放入工作区后让 agent 读取' });
        continue;
      }
      if (!isKernelImageType(f.type)) {
        plan.errors.push({ name: name, message: '「' + name + '」不支持：内核附件仅支持 PNG/JPEG/WebP/GIF（检测到 ' + (f.type || extOf(name) || '未知类型') + '）' });
        continue;
      }
      if (size > lim.maxImageBytes) {
        plan.errors.push({ name: name, message: '「' + name + '」超过单图 ' + formatSize(lim.maxImageBytes) + ' 上限（实际 ' + formatSize(size) + '），请压缩后再试' });
        continue;
      }
      if (have + plan.rail.length + 1 > lim.maxImagesPerMessage) {
        plan.errors.push({ name: name, message: '「' + name + '」超出单条消息 ' + lim.maxImagesPerMessage + ' 张图片上限' });
        continue;
      }
      if (railBytes + size > lim.maxMessageImageBytes) {
        plan.errors.push({ name: name, message: '「' + name + '」加入后图片合计超过 ' + formatSize(lim.maxMessageImageBytes) + ' 上限' });
        continue;
      }
      railBytes += size;
      plan.rail.push(f);
    }
    return plan;
  }

  /**
   * 官方附件管道执行（可注入 env，测试直呼）：createDraftImages →
   * inputActions.addImages(ids)；未接纳（发送裁决期）回滚 releaseDraftImages。
   * 返回 {ok, error?}；抛错不外溢。
   */
  function addToOfficialRail(env, files) {
    try {
      if (!env || !env.conversation || typeof env.conversation.createDraftImages !== 'function' ||
          !env.inputActions || typeof env.inputActions.addImages !== 'function') {
        return { ok: false, error: '附件通道不可用（会话未就绪）' };
      }
      var drafts = env.conversation.createDraftImages(files);
      var ids = drafts.map(function (d) { return d.id; });
      var accepted = env.inputActions.addImages(ids);
      if (!accepted) {
        try { env.conversation.releaseDraftImages(drafts); } catch (_e) { /* 已释放 */ }
        return { ok: false, error: '当前会话忙，稍后再试（图片未加入）' };
      }
      return { ok: true, ids: ids };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? String(e.message) : '加入附件失败' };
    }
  }

  /**
   * 壳层 client-file-drop 条目二分（M3 拖拽=粘贴 统一，纯函数）：
   *   rail —— 内核白名单扩展名且体积未超单图上限的图片：读内容后进官方
   *           附件管道（与粘贴 intakeImages、📎 选择器同一 ingest）；自带
   *           内容（dataUrl/base64）的条目无论扩展名一律进 rail 通道
   *          （类型过滤在 File 物化后按真实 MIME 复核，不过再回退 hint）；
   *   hint —— 其余（文本/二进制/非白名单图/超大图）：维持既有路径提示语义。
   */
  function planBridgeEntries(entries, limits) {
    var lim = limits || KERNEL_LIMITS;
    var out = { rail: [], hint: [] };
    if (!entries || entries.length === 0) return out;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      if (e.dataUrl || e.base64) { out.rail.push(e); continue; }
      var mime = RAIL_IMAGE_EXT_MIME[extOf(e.name || '')];
      var size = e.size == null ? 0 : Number(e.size) || 0;
      if (mime && size <= lim.maxImageBytes) out.rail.push(e);
      else out.hint.push(e);
    }
    return out;
  }

  // ───────── 待发送文件附件（chip）纯逻辑 ─────────
  // 非图片文件不再读内容写进输入框，而是暂存为「附件 chip」，发送时才物化：
  //   · 小文本（≤TEXT_MAX_BYTES 且非二进制）→ 物化为内容（kind:'text'）；
  //   · 大文本 / 二进制 / 无内容（桥层路径载荷）→ 物化为路径提示（kind:'path'）。
  var pendingSeq = 0;

  /** 文本文件 → chip 条目：内容可安全内联给 kind:'text'，超限/二进制回落 path。 */
  function makePendingTextEntry(name, size, path, content) {
    var text = String(content || '');
    if (text.length > TEXT_MAX_BYTES || looksBinary(text)) {
      return { id: 'f' + (++pendingSeq), name: name, size: size, kind: 'path', path: path || '' };
    }
    return { id: 'f' + (++pendingSeq), name: name, size: size, kind: 'text', content: text };
  }

  /** 二进制 / 桥层路径载荷 → chip 条目（只带路径，发送时让 agent 读文件）。 */
  function makePendingPathEntry(name, size, path) {
    return { id: 'f' + (++pendingSeq), name: name, size: size, kind: 'path', path: path || '' };
  }

  /** 发送时把待发附件物化为要追加到草稿的文本块（小内容 / 大路径）。 */
  function materializePending(list) {
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.kind === 'text') {
        parts.push('<!-- 附件：' + (it.name || '未命名') + ' -->\n' + it.content);
      } else {
        parts.push(buildPathHint({ name: it.name, path: it.path, size: it.size }));
      }
    }
    return parts.join('\n');
  }

  /**
   * InputState → 可比较字符串（喂给 useInput 的选择器）。hook 默认按
   * Object.is 判等，直接返回对象会让每轮渲染都判定为变化，故蒸馏成字符串；
   * 分隔符取 \u0000（草稿不会出现，parseInputMirror 按剩余段无损回填）。
   */
  function distillInput(state) {
    try {
      if (!state) return '';
      var n = Array.isArray(state.imageIds) ? state.imageIds.length : 0;
      return String(state.phase || '') + '\u0000' + n + '\u0000' + String(state.draft == null ? '' : state.draft);
    } catch (_e) { return ''; }
  }

  /** distillInput 的反向解析；空面返回 null（调用方按「无快照」处理）。 */
  function parseInputMirror(mirror) {
    if (typeof mirror !== 'string' || mirror === '') return null;
    var parts = mirror.split('\u0000');
    if (parts.length < 3) return null;
    var n = Number(parts[1]);
    return {
      phase: parts[0],
      imageCount: isFinite(n) && n >= 0 ? Math.floor(n) : 0,
      draft: parts.slice(2).join('\u0000'),
    };
  }

  // 选择器必须是模块级稳定身份（每次渲染新建函数会让 hook 每轮重算）。
  var INPUT_SELECTOR = function (state) { return distillInput(state); };

  // 暴露纯逻辑供测试；生产无副作用。
  var core = {
    TEXT_MAX_BYTES: TEXT_MAX_BYTES,
    KERNEL_IMAGE_MEDIA_TYPES: KERNEL_IMAGE_MEDIA_TYPES,
    KERNEL_LIMITS: KERNEL_LIMITS,
    classifyFile: classifyFile,
    looksBinary: looksBinary,
    formatSize: formatSize,
    isKernelImageType: isKernelImageType,
    dimsWithinLimit: dimsWithinLimit,
    buildTextInsertion: buildTextInsertion,
    buildPathHint: buildPathHint,
    buildDropHint: buildDropHint,
    sanitizePath: sanitizePath,
    normalizeDropEntry: normalizeDropEntry,
    normalizeDropPayload: normalizeDropPayload,
    dropKey: dropKey,
    dropKeys: dropKeys,
    dedupeEntries: dedupeEntries,
    planPickedFiles: planPickedFiles,
    planBridgeEntries: planBridgeEntries,
    RAIL_IMAGE_EXT_MIME: RAIL_IMAGE_EXT_MIME,
    addToOfficialRail: addToOfficialRail,
    makePendingTextEntry: makePendingTextEntry,
    makePendingPathEntry: makePendingPathEntry,
    materializePending: materializePending,
    distillInput: distillInput,
    parseInputMirror: parseInputMirror,
    injectIntoComposer: injectIntoComposer,
  };
  if (typeof window !== 'undefined') {
    window.__dshFileDropCore = core;
  }

  // ───────── 待发送文件附件（chip）运行时状态（按会话 inputActions 隔离） ─────────
  var pendingBySession = new Map();
  var pendingListeners = [];
  function notifyPending() {
    for (var i = 0; i < pendingListeners.length; i++) { try { pendingListeners[i](); } catch (_e) { /* 订阅者异常不外溢 */ } }
  }
  function subscribePending(fn) {
    if (typeof fn !== 'function' || pendingListeners.indexOf(fn) !== -1) return function () {};
    pendingListeners.push(fn);
    return function () { pendingListeners = pendingListeners.filter(function (x) { return x !== fn; }); };
  }
  function pendingOf(key) {
    var list = pendingBySession.get(key);
    if (!list) { list = []; pendingBySession.set(key, list); }
    return list;
  }
  function addPending(key, entry) {
    if (!key || !entry) return;
    pendingOf(key).push(entry);
    notifyPending();
  }
  function removePending(key, id) {
    if (!key) return;
    pendingBySession.set(key, pendingOf(key).filter(function (x) { return x.id !== id; }));
    notifyPending();
  }
  function clearPending(key) {
    if (!key) return;
    pendingBySession.set(key, []);
    notifyPending();
  }
  function snapshotPending(key) { return key ? pendingOf(key).slice() : []; }
  function currentSessionKey() {
    var env = currentRailEnv();
    return env && env.inputActions;
  }
  // 统一落点：有槽位（会话上下文可用）→ 存 chip；无槽位（旧内核/file:// 壳，
  // chip 无处渲染也无发送钩子）→ 回退路径提示/内容注入输入框，不丢信息。
  function pendingOrFallback(entry) {
    var key = currentSessionKey();
    if (key) { addPending(key, entry); return; }
    var text = entry && entry.kind === 'text'
      ? ('<!-- 附件：' + (entry.name || '未命名') + ' -->\n' + entry.content)
      : buildPathHint({ name: entry && entry.name, path: entry && entry.path, size: entry && entry.size });
    // 注入失败不再静默：这是「无槽位」分支唯一的出口，吞了就等于丢信息。
    if (!injectIntoComposer(findComposer(), text)) {
      showToast('无法写入输入框：「' + ((entry && entry.name) || '附件') + '」未注入，请重试或直接粘贴内容', true);
    }
  }
  if (typeof window !== 'undefined') {
    window.__dshFileDropStore = {
      snapshotPending: snapshotPending,
      addPending: addPending,
      removePending: removePending,
      clearPending: clearPending,
      subscribePending: subscribePending,
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
   * 找到当前会话输入框。两代内核两种形态都认（全部落空返回 null）：
   *   · 当前：Lexical contenteditable —— [data-composer-input] /
   *     [data-lexical-editor] 是实测在位的稳定属性（全页已无 textarea，
   *     旧选择器恒 null 正是本插件失效的一半原因）；
   *   · 旧：React 受控 textarea；焦点元素只作最后兜底（优先把提示
   *     写进真正的 composer，而不是用户正在看的其它输入框）。
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
   *     ('insertText')，经 beforeinput 管线让编辑器自己收下——实测直接改
   *     textContent 会被下一次 reconcile 回滚，而拿 textarea 原型 setter 打
   *     在 <div> 上会抛 TypeError（被上层 catch 吞成静默失效）。
   * 返回**是否真的落上**（注入后回读校验），调用须据此给可见提示。
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
          range.collapse(false); // 末尾——不劈开已有内容与引用 chip
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

  /**
   * 物化前读回草稿前缀。坐标系优先级：
   *   1. 快照 draft —— 内核 clipboard projection（引用 chip 的剪贴板形态），
   *      与 setDraft 同一坐标系，唯一不会把 chip 写坏的读法；
   *   2. DOM 文本 —— 快照缺席时的兜底（contenteditable 的 textContent 会
   *      把 chip 退化成显示文本，但好过把用户正文直接丢了）。
   */
  function readComposerDraft(snapshotDraft) {
    if (typeof snapshotDraft === 'string' && snapshotDraft !== '') return snapshotDraft;
    var text = composerText(findComposer());
    return text && text.trim() !== '' ? text : '';
  }

  /** Electron 里取拖入文件的完整路径（webUtils.getPathForFile 经 preload 暴露）。 */
  function filePathOf(file) {
    try {
      if (file && window.dshDesktop && typeof window.dshDesktop.getPathForFile === 'function') {
        var p = window.dshDesktop.getPathForFile(file);
        return typeof p === 'string' && p ? p : '';
      }
    } catch (_e) { /* 浏览器环境无此能力 */ }
    return '';
  }

  // —— 浮动 toast（非槽位路径的错误出口：壳层拖放/页面拖放在无会话上下文
  //    时也要给用户可见反馈；内核 CSS 变量优先，缺省兜底）。——
  var TOAST_ID = 'dsh-file-drop-toast';
  function showToast(message, isError) {
    try {
      if (typeof document === 'undefined' || !document.body) return;
      var host = document.getElementById(TOAST_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = TOAST_ID;
        host.setAttribute('data-plugin', 'dsh-file-drop');
        host.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
          'max-width:min(560px,86vw);padding:8px 14px;border-radius:10px;font-size:12.5px;line-height:18px;' +
          'font-family:var(--dsw-font-family,system-ui,sans-serif);pointer-events:none;' +
          'background:var(--dsw-alias-bg-layer-2,#16203a);color:var(--dsw-alias-label-primary,#e6ecff);' +
          'border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));' +
          'box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transition:opacity .18s ease;';
        document.body.appendChild(host);
      }
      if (isError) host.style.color = 'var(--dsw-alias-state-error-primary,#ff7a85)';
      else host.style.color = 'var(--dsw-alias-label-primary,#e6ecff)';
      host.textContent = message;
      host.style.opacity = '1';
      clearTimeout(showToast._t);
      showToast._t = setTimeout(function () { host.style.opacity = '0'; }, 5000);
    } catch (_e) { /* 展示失败静默 */ }
  }

  // —— 壳层 client-file-drop 消费（F1 契约：Rust 拖放 → 垫片 window
  //    CustomEvent('client-file-drop', {detail:{files:[{path,name,size}]}})，
  //    与 dsh-balance-changed 同款派发面）。宽容 detail 形态 + 与 HTML5
  //    drop 双报去重。M3 统一：白名单图片（路径载荷经宿主路由读内容 /
  //    内容载荷免读）→ 官方附件管道（与粘贴、选择器同一 ingest 与限流）；
  //    其余与全部失败项 → 合并路径提示块（既有语义）。 ——
  var dropSeen = Object.create(null);

  /** dataUrl/base64 → File（内容载荷与宿主读回共用；失败返回 null）。 */
  function fileFromContent(entry) {
    try {
      var dataUrl = entry.dataUrl || entry.base64;
      if (!dataUrl || typeof fetch !== 'function') return null;
      var url = String(dataUrl).indexOf('data:') === 0 ? String(dataUrl)
        : 'data:' + (entry.mediaType || 'application/octet-stream') + ';base64,' + dataUrl;
      // 同步占位：fetch().blob() 异步链在调用侧处理（返回 Promise）。
      return fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
        var name = entry.name || 'attachment';
        try { return new File([blob], name, { type: blob.type }); }
        catch (_e2) { var f = blob; f.name = name; return f; }
      });
    } catch (_e) { return null; }
  }

  /**
   * 路径载荷读内容：POST 同源宿主路由 /dsh-file-drop/read-image（宿主半边
   * lib/index.js 注册：回环限定 + 白名单 + 3.5MB + 魔数嗅探）→ dataUrl →
   * File。任何失败（路由缺席/file:// 残留壳/超限/类型不符）→ resolve(null)，
   * 调用侧回退路径提示，不抛错。
   */
  function readImageViaHost(entry) {
    if (!entry || !entry.path || typeof fetch !== 'function') return null;
    var job;
    try {
      job = fetch('/dsh-file-drop/read-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: entry.path, name: entry.name || '', size: entry.size }),
      });
    } catch (_e) { return null; }
    if (!job || typeof job.then !== 'function') return null;
    return job.then(function (r) { return r.json(); }).then(function (res) {
      if (!res || res.ok !== true || typeof res.dataUrl !== 'string') return null;
      return fileFromContent({ dataUrl: res.dataUrl, name: entry.name || '拖入图片', mediaType: res.mediaType });
    }).catch(function () { return null; });
  }

  /** 附件栏既有张数（内核 intakeImages 用 attachments.length 同位校验）。 */
  function railCountOf(env) {
    var n = Number(env && env.railCount);
    return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  /** 桥层非图片条目 → 待发送附件 chip（列表为空时零副作用）。 */
  function stageHintEntries(list) {
    try {
      if (!list || list.length === 0) return;
      var key = currentSessionKey();
      if (!key) {
        // 无槽位（旧内核/file:// 壳）：chip 无处渲染，回退合并路径提示注入（既有语义）。
        if (!injectIntoComposer(findComposer(), core.buildDropHint(list))) {
          showToast('无法写入输入框：' + list.length + ' 个拖入文件的路径提示未注入', true);
        }
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        addPending(key, makePendingPathEntry(it.name || '（未命名）', it.size, it.path));
      }
    } catch (_e) { /* 降级静默 */ }
  }

  function handleBridgeDrop(detail) {
    try {
      var entries = core.normalizeDropPayload(detail);
      if (entries.length === 0) return;
      entries = core.dedupeEntries(entries, dropSeen, Date.now(), 1500);
      if (entries.length === 0) return;
      var plan = core.planBridgeEntries(entries);
      var hintEntries = plan.hint.slice();
      if (plan.rail.length === 0) { stageHintEntries(hintEntries); return; }
      // rail 候选 → File：内容载荷免读直转；路径载荷经宿主路由读回。
      var railEntries = plan.rail;
      var jobs = [];
      for (var i = 0; i < railEntries.length; i++) {
        (function (entry) {
          var p = (entry.dataUrl || entry.base64) ? fileFromContent(entry) : readImageViaHost(entry);
          jobs.push(p && typeof p.then === 'function' ? p.catch(function () { return null; }) : Promise.resolve(null));
        })(railEntries[i]);
      }
      Promise.all(jobs).then(function (files) {
        var env = currentRailEnv();
        var pending = [];
        for (var j = 0; j < files.length; j++) {
          if (files[j] && core.isKernelImageType(files[j].type)) pending.push({ file: files[j], entry: railEntries[j] });
          else hintEntries.push(railEntries[j]); // 读失败/真实类型非白名单 → 回退提示
        }
        if (pending.length > 0) {
          // 与粘贴同款限额裁决（镜像 intakeImages：类型/张数/单图/合计）。
          var pick = core.planPickedFiles(pending.map(function (p) { return p.file; }), railCountOf(env));
          for (var e2 = 0; e2 < pick.errors.length; e2++) showToast(pick.errors[e2].message, true);
          var r = pick.rail.length > 0 ? core.addToOfficialRail(env, pick.rail) : { ok: true };
          if (!r.ok) showToast(r.error || '图片附件加入失败', true);
          for (var q = 0; q < pending.length; q++) {
            // 未进栏（限额拒绝/管道忙）的条目回退路径提示——拖拽本就带路径，
            // 比 paste 的纯红字拒绝多保留一条 agent 可读后路，不丢信息。
            if (pick.rail.indexOf(pending[q].file) === -1 || !r.ok) hintEntries.push(pending[q].entry);
          }
        }
        stageHintEntries(hintEntries);
      }).catch(function (_e) { stageHintEntries(hintEntries); });
    } catch (_e) { /* 整链失败静默降级 */ }
  }

  function attachBridgeDropListener() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('client-file-drop', function (ev) {
      handleBridgeDrop(ev && (ev.detail != null ? ev.detail : ev));
    }, false);
  }

  // —— HTML5 drop（Electron / 浏览器模式主通道）。内核 ui-attachment 的
  //    document 级 onDrop 会 preventDefault 并把白名单图片收进官方附件栏：
  //    defaultPrevented 时的白名单图片让位（防重复），文本/二进制照常处理
  //    （内核不会注入文本内容）。 ——
  function handleDroppedFile(file, kernelTookImages) {
    var name = file.name || '';
    var size = file.size || 0;
    var path = filePathOf(file);
    var cls = classifyFile(name, size);

    if (cls.kind === 'image' && !kernelTookImages && core.isKernelImageType(file.type)) {
      // 内核未接管（旧内核/槽位缺席）：把图片送进官方附件管道；管道缺席
      // 时退回路径提示（无路径也给可读指引）。
      var r = addToOfficialRail(currentRailEnv(), [file]);
      if (r.ok) return;
      pendingOrFallback(makePendingPathEntry(name, size, path));
      if (!path) showToast(r.error || '图片附件加入失败，已改用路径提示', true);
      return;
    }
    if (cls.kind === 'image' && kernelTookImages) return; // 官方附件栏已收，勿重复

    if (cls.kind === 'text') {
      var reader = new FileReader();
      reader.onload = function () {
        pendingOrFallback(makePendingTextEntry(name, size, path, String(reader.result || '')));
      };
      reader.onerror = function () {
        pendingOrFallback(makePendingPathEntry(name, size, path));
      };
      reader.readAsText(file);
      return;
    }

    pendingOrFallback(makePendingPathEntry(name, size, path));
  }

  function hasFiles(types) {
    if (!types) return false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }

  function dropHasKernelImage(files) {
    for (var i = 0; i < files.length; i++) {
      if (core.isKernelImageType(files[i].type)) return true;
    }
    return false;
  }

  function attachDropHandlers() {
    if (typeof document === 'undefined') return;
    document.addEventListener('dragover', function (e) {
      if (hasFiles(e.dataTransfer && e.dataTransfer.types)) e.preventDefault();
    });
    document.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      if (!dt || !hasFiles(dt.types)) return;
      // 先记内核是否已 preventDefault（本监听器随后自己也会 preventDefault，
      // 顺序颠倒会永远读到 true）。
      var kernelHandled = e.defaultPrevented === true;
      e.preventDefault();
      var kernelTookImages = kernelHandled && dropHasKernelImage(dt.files);
      var files = [];
      for (var i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
      // 与壳层 client-file-drop 双报去重：按 key 挑出本次新见的文件。
      var pairs = [];
      for (var j = 0; j < files.length; j++) {
        pairs.push({
          file: files[j],
          entry: core.normalizeDropEntry({ path: filePathOf(files[j]), name: files[j].name, size: files[j].size }),
        });
      }
      var entries = [];
      for (var n = 0; n < pairs.length; n++) if (pairs[n].entry) entries.push(pairs[n].entry);
      var fresh = core.dedupeEntries(entries, dropSeen, Date.now(), 1500);
      if (entries.length > 0 && fresh.length === 0) return; // 全是双报旧条目
      var freshSet = Object.create(null);
      for (var f = 0; f < fresh.length; f++) freshSet[core.dropKey(fresh[f])] = true;
      for (var k = 0; k < pairs.length; k++) {
        if (!pairs[k].entry) continue; // 无名无路径的条目（异常形态）跳过
        if (entries.length > 0 && !freshSet[core.dropKey(pairs[k].entry)]) continue; // 双报旧条目跳过
        try { handleDroppedFile(pairs[k].file, kernelTookImages); } catch (_e) { /* 单个文件失败不影响其余 */ }
      }
    });
  }

  // —— 官方附件管道的会话上下文（槽位组件在渲染时登记；无槽位时不可用，
  //    退回路径提示）。 ——
  var railEnvRef = null;
  function currentRailEnv() {
    return railEnvRef || {};
  }

  // ───────────────────────── 槽位注册（📎 附件按钮） ─────────────────────────

  var ATTACH_CSS = [
    '.dsh-file-drop-attach-btn{background:var(--dsw-specific-selector);width:28px;height:28px;',
    'color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:999px;',
    'flex:none;place-items:center;display:grid;padding:0}',
    '.dsh-file-drop-attach-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}',
    '.dsh-file-drop-attach-btn:disabled{opacity:.5;cursor:default}',
    '.dsh-file-drop-attach-err{font-size:12px;line-height:17px;color:var(--dsw-alias-state-error-primary,#ff7a85);',
    'max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.dsh-file-drop-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0;}',
    '.dsh-file-drop-chip{display:inline-flex;align-items:center;gap:6px;max-width:280px;padding:3px 8px;',
    'font-size:12px;line-height:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-solid,#f2f2f4);',
    'border:1px solid var(--dsw-alias-line-soft,#e2e2e6);border-radius:8px;overflow:hidden;}',
    '.dsh-file-drop-chip--path{background:var(--dsw-alias-state-warn-soft,#fff6e6);border-color:var(--dsw-alias-state-warn-primary,#e0a63c);}',
    '.dsh-file-drop-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}',
    '.dsh-file-drop-chip-size{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;}',
    '.dsh-file-drop-chip-x{flex:none;cursor:pointer;border:none;background:none;color:var(--dsw-alias-label-secondary);',
    'font-size:14px;line-height:1;padding:0 2px;}',
    '.dsh-file-drop-chip-x:hover{color:var(--dsw-alias-state-error-primary,#ff7a85);}',
  ].join('');

  function ensureCss() {
    if (typeof document === 'undefined') return;
    try {
      var tag = 'dsh-file-drop/client.css';
      if (document.querySelector('style[data-plugin-css="' + tag + '"]')) return;
      var el = document.createElement('style');
      el.dataset.plugin = 'dsh-file-drop';
      el.dataset.pluginCss = tag;
      el.textContent = ATTACH_CSS;
      (document.head || document.documentElement).appendChild(el);
    } catch (_e) { /* 样式失败不挡功能 */ }
  }

  /** 选择器 accept 值：内核图片白名单 MIME + 常见文本扩展名。 */
  function buildAccept() {
    var exts = '';
    TEXT_EXT.forEach(function (ext) { exts += (exts ? ',' : '') + ext; });
    return KERNEL_IMAGE_MEDIA_TYPES.join(',') + (exts ? ',' + exts : '');
  }

  function attachSlot(ctx, react, IconPaperclip) {
    var createElement = react.createElement;
    var useRef = react.useRef;
    var useState = react.useState;
    var useEffect = react.useEffect;

    function AttachButton(props) {
      props = props || {};
      var inputActions = props.inputActions || {};
      var input = props.input;
      // input 快照镜像：当前内核该槽只下发 hook（实机 fiber 实测 props 为
      // {useInput, useChat, useSession, useConversation, useTrajectory,
      // useProjection, inputActions, sessionId, ...}，无 input/session）。
      // hook 必须无条件调用以保持调用顺序稳定；缺席（旧内核/测试）时
      // 退化为空面，由 props.input 顶上。
      var inputMirror = '';
      try {
        if (typeof props.useInput === 'function') inputMirror = props.useInput(INPUT_SELECTOR) || '';
      } catch (_e0) { inputMirror = ''; }
      var mirror = parseInputMirror(inputMirror);
      var draft = (input && typeof input.draft === 'string') ? input.draft : (mirror ? mirror.draft : '');
      var railCount = (input && Array.isArray(input.imageIds))
        ? input.imageIds.length
        : (mirror ? mirror.imageCount : 0);
      var fileRef = useRef(null);
      var errRef = useRef(null);
      var state = useState('');
      var err = state[0];
      var setErr = state[1];

      // 会话上下文登记：drop/bridge 路径也能用官方附件管道。
      // railCount（附件栏既有张数）随每次渲染刷新——桥层图片统一进栏时
      // 与内核粘贴 intakeImages 的 attachments.length 同位校验张数上限。
      useEffect(function () {
        var env = {
          conversation: (function () {
            try { return ctx.get('conversation'); } catch (_e) { return undefined; }
          })(),
          inputActions: inputActions,
          railCount: railCount,
        };
        railEnvRef = env;
        return function () { if (railEnvRef === env) railEnvRef = null; };
      });

      // 发送钩子：非图片文件以附件 chip 暂存，发送时物化进草稿（小内容/大路径）。
      // 两条发送路径都要物化：
      //   · 点击发送按钮 → inputActions.submit()（包装它）；
      //   · 回车发送 → keyboard.submit(mode) 直接调 SessionInputShell.submit，
      //     绕过 actions.submit —— 用捕获阶段 keydown 在 React 回车处理器前物化。
      var draftRef = useRef(draft);
      useEffect(function () { draftRef.current = draft; });
      useEffect(function () {
        if (!inputActions || typeof inputActions.submit !== 'function' || typeof inputActions.setDraft !== 'function') return;
        var orig = inputActions.submit;
        function materialize() {
          var pending = snapshotPending(inputActions);
          if (pending.length === 0) return;
          var cur = readComposerDraft(draftRef.current);
          var text = materializePending(pending);
          clearPending(inputActions);
          if (text) inputActions.setDraft(cur + (cur ? '\n' : '') + text + '\n');
        }
        inputActions.submit = function () { materialize(); return orig(); };
        var onKeydown = function (e) {
          if (e && (e.key === 'Enter' || e.keyCode === 13)) materialize();
        };
        if (typeof document !== 'undefined' && document.addEventListener) {
          document.addEventListener('keydown', onKeydown, true);
        }
        return function () {
          inputActions.submit = orig;
          if (typeof document !== 'undefined' && document.removeEventListener) {
            document.removeEventListener('keydown', onKeydown, true);
          }
        };
      }, [inputActions]);

      var canAttach = !!(conversationOk(ctx) && typeof inputActions.addImages === 'function');
      var disabled = !canAttach;

      var pendingErrs = [];
      function flashErr(message) {
        // 多条错误合并展示（最多两条，避免多文件全拒时红字刷屏）。
        pendingErrs.push(String(message || ''));
        var shown = pendingErrs.slice(-2).join('；');
        setErr(shown);
        try {
          clearTimeout(flashErr._t);
          flashErr._t = setTimeout(function () { pendingErrs = []; setErr(''); }, 6000);
        } catch (_e) { /* 计时器异常不外溢 */ }
      }

      function onChange(e) {
        try {
          var files = [];
          var list = (e.target && e.target.files) || [];
          for (var i = 0; i < list.length; i++) files.push(list[i]);
          if (e.target) e.target.value = ''; // 允许重复选同一文件
          if (files.length === 0) return;
          handlePickedFiles(files, {
            conversation: (function () { try { return ctx.get('conversation'); } catch (_e2) { return undefined; } })(),
            inputActions: inputActions,
            railCount: railCount,
            onError: flashErr,
          });
        } catch (_e3) { /* 选择器异常静默 */ }
      }

      var btn = createElement('button', {
        type: 'button',
        className: 'dsh-file-drop-attach-btn',
        title: '添加附件（图片直接发送给 DeepSeek；文本/代码等文件作为附件发送）',
        'aria-label': '添加附件',
        disabled: disabled,
        onClick: function () { if (!disabled && fileRef.current) fileRef.current.click(); },
      }, IconPaperclip ? createElement(IconPaperclip, { size: 14 }) : '📎');

      return createElement(react.Fragment, null,
        createElement('input', {
          ref: fileRef,
          type: 'file',
          multiple: true,
          accept: buildAccept(),
          style: { display: 'none' },
          onChange: onChange,
        }),
        btn,
        err ? createElement('span', {
          className: 'dsh-file-drop-attach-err',
          ref: errRef,
          title: err,
        }, err) : null);
    }

    // 非图片文件附件 chip 条：文件名 + 大小 + × 移除；发送时由钩子物化。
    function FileChips(props) {
      props = props || {};
      var sessionKey = props.inputActions;
      var state = useState(0);
      var setTick = state[1];
      useEffect(function () {
        return subscribePending(function () { setTick(function (t) { return t + 1; }); });
      }, []);
      var items = snapshotPending(sessionKey);
      if (items.length === 0) return null;
      var chips = items.map(function (it) {
        return createElement('span', {
          key: it.id,
          className: 'dsh-file-drop-chip' + (it.kind === 'path' ? ' dsh-file-drop-chip--path' : ''),
          title: it.kind === 'path' ? (it.path || it.name) : (it.name + '（内容随消息发送）'),
        },
          createElement('span', { className: 'dsh-file-drop-chip-name' }, it.name),
          createElement('span', { className: 'dsh-file-drop-chip-size' }, formatSize(it.size)),
          createElement('button', {
            type: 'button',
            className: 'dsh-file-drop-chip-x',
            'aria-label': '移除 ' + it.name,
            onClick: function () { removePending(sessionKey, it.id); },
          }, '×'));
      });
      return createElement('div', { className: 'dsh-file-drop-chips' }, chips);
    }

    try {
      ctx.slots.inject('conversation.input.left', function () {
        return ctx.slots.register({
          name: 'conversation.input.left',
          id: 'dsh-file-drop-attach',
          order: 70, // dsh-vision 的 📕 按钮是 80；本按钮常驻其左
        }, AttachButton);
      }, 'dsh-file-drop: attach button');
    } catch (_e) { /* 槽位系统不可用（旧内核）：只保留拖放/粘贴路径 */ }

    // 附件 chip 条：挂进输入框左侧（与 📎 按钮同槽）。该槽 props 只有
    // inputActions 与一组 hook（useInput/useChat/…），不下发 input/session
    // 快照——内核 SlotMap 里 conversation.input.left 没声明 owner，快照值只能
    // 经 hook 取。不用 conversation.input.attachments：那是内核图片附件专用
    // 槽，props 是 {attachments,canAcceptDrop,...} 无 inputActions。
    try {
      ctx.slots.inject('conversation.input.left', function () {
        return ctx.slots.register({
          name: 'conversation.input.left',
          id: 'dsh-file-drop-chips',
          order: 71, // 紧邻 📎 按钮（70）右侧
        }, FileChips);
      }, 'dsh-file-drop: file chips');
    } catch (_e) { /* 槽位系统不可用：chip 不渲染，仅保留拖放/粘贴路径 */ }
  }

  function conversationOk(ctx) {
    try {
      var c = ctx.get('conversation');
      return !!(c && typeof c.createDraftImages === 'function');
    } catch (_e) { return false; }
  }

  /**
   * 选择器主流程（测试可直呼）：plan → 图片进官方附件栏（先异步探边，
   * 超 2000px 前置拒绝）→ 文本读内容追加草稿 → 错误逐条红字。
   */
  function handlePickedFiles(files, env) {
    var plan = core.planPickedFiles(files, env.railCount || 0);
    var onError = typeof env.onError === 'function' ? env.onError : function () {};

    // 文本文件：读内容暂存为附件 chip（发送时再物化；选择器不携带路径，
    // 超限/二进制无法给路径 → 报错提示拖入）。
    plan.text.forEach(function (file) {
      try {
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var entry = makePendingTextEntry(file.name, file.size, '', String(reader.result || ''));
            if (entry.kind === 'path') {
              onError('「' + file.name + '」超过 ' + formatSize(TEXT_MAX_BYTES) + '，且选择器不携带路径；请拖入该文件或放入工作区让 agent 读取');
              return;
            }
            addPending(env.inputActions, entry);
          } catch (_e) { onError('读取 ' + file.name + ' 失败'); }
        };
        reader.onerror = function () { onError('读取 ' + file.name + ' 失败'); };
        reader.readAsText(file);
      } catch (_e) { onError('读取 ' + file.name + ' 失败'); }
    });

    // 错误先亮出来（用户立刻看到为什么没进附件栏）。
    plan.errors.forEach(function (er) { onError(er.message); });
    if (plan.rail.length === 0) return;

    // 图片：异步探边（单边 >2000px 是内核准入线，前置拒绝免白选）。
    probeDims(plan.rail).then(function (dims) {
      var okFiles = [];
      for (var i = 0; i < plan.rail.length; i++) {
        var d = dims[i];
        if (d && !core.dimsWithinLimit(d.width, d.height, KERNEL_LIMITS.maxImageDimension)) {
          onError('「' + plan.rail[i].name + '」单边超过 ' + KERNEL_LIMITS.maxImageDimension + 'px（' + d.width + '×' + d.height + '），请缩小后再发');
          continue;
        }
        okFiles.push(plan.rail[i]);
      }
      if (okFiles.length === 0) return;
      var r = core.addToOfficialRail(env, okFiles);
      if (!r.ok) onError(r.error || '图片附件加入失败');
    }).catch(function () {
      // 探边失败（解码器不可用）：照送官方管道，内核准入兜底。
      var r2 = core.addToOfficialRail(env, plan.rail);
      if (!r2.ok) onError(r2.error || '图片附件加入失败');
    });
  }

  /** 批量探图片尺寸：createImageBitmap → Image 兜底 → null。 */
  function probeDims(files) {
    return Promise.all(files.map(function (file) {
      return new Promise(function (resolve) {
        var settled = false;
        function done(w, h) { if (!settled) { settled = true; resolve({ width: w, height: h }); } }
        try {
          if (typeof createImageBitmap === 'function') {
            createImageBitmap(file).then(function (bmp) {
              try { done(bmp.width, bmp.height); if (bmp.close) bmp.close(); }
              catch (_e) { done(bmp.width, bmp.height); }
            }).catch(function () { fallback(); });
            return;
          }
        } catch (_e) { /* 走兜底 */ }
        fallback();
        function fallback() {
          try {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { done(img.naturalWidth, img.naturalHeight); try { URL.revokeObjectURL(url); } catch (_e2) {} };
            img.onerror = function () { done(0, 0); try { URL.revokeObjectURL(url); } catch (_e2) {} };
            img.src = url;
            setTimeout(function () { done(0, 0); }, 3000);
          } catch (_e3) { done(0, 0); }
        }
      });
    }));
  }

  // ───────────────────────── 注册 ─────────────────────────
  window.__ModuleLoader__.load({
    id: 'dsh-file-drop',
    factory: function (require) {
      // RV4 A1：apply 使用 ctx.slots（📎 按钮注册）——必须在模块工厂的 inject
      // 清单里声明 "slots"，否则模块系统代理抛
      // "cannot get property 'slots' without inject"（运行时加载失败）。
      var inject = ["slots"];
      var react = null;
      var IconPaperclip = null;
      try {
        react = require("react");
        var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
        IconPaperclip = primitives && primitives.IconPaperclipOutline16;
      } catch (_e) { /* 缺 react/图标：不注册按钮，拖放/粘贴照常 */ }

      function apply(ctx) {
        attachDropHandlers();
        attachBridgeDropListener();
        if (react && ctx && ctx.slots && typeof ctx.slots.inject === 'function') {
          ensureCss();
          attachSlot(ctx, react, IconPaperclip);
        }
      }
      var module = { exports: {} };
      module.exports = { inject: inject, apply: apply, core: core };
      return module.exports;
    },
  });
})();
