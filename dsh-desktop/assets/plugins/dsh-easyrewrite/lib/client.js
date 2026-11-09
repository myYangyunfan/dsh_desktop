window.__ModuleLoader__.load({
  id: "dsh-easyrewrite",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var React18 = __toESM(require("react"), 1);

// src/core/log.js
function debugEnabled() {
  try {
    if (localStorage.getItem("dsh-easyrewrite:debug") === "1") return true;
  } catch (e) {
  }
  try {
    return /\?dsh-er-debug/.test(location.search || "");
  } catch (e) {
    return false;
  }
}
var recentLogTimestamps = /* @__PURE__ */ new Map();
function log(level, tag, message, data) {
  try {
    if (debugEnabled()) {
      const prefix = "[dsh-easyrewrite][" + level + "] " + (tag ? "[" + tag + "] " : "");
      if (level === "error") console.error(prefix + message, data !== void 0 ? data : "");
      else if (level === "warn") console.warn(prefix + message, data !== void 0 ? data : "");
      else console.info(prefix + message, data !== void 0 ? data : "");
    }
    if (level !== "error") {
      const logKey = (tag || "") + ":" + (message || "");
      const now = Date.now();
      const last = recentLogTimestamps.get(logKey) || 0;
      if (now - last < 4e3) return;
      recentLogTimestamps.set(logKey, now);
      if (recentLogTimestamps.size > 200) {
        const threshold = now - 1e4;
        for (const [k, t] of recentLogTimestamps.entries()) {
          if (t < threshold) recentLogTimestamps.delete(k);
        }
      }
    }
    try {
      fetch("/bubble/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level, tag, message, data: data !== void 0 ? data : null }),
        keepalive: true
      }).catch(() => {
      });
    } catch (e) {
    }
  } catch (e) {
  }
}

// src/core/services.js
var serviceRefs = {
  ctx: null,
  conversation: null,
  uiConversation: null,
  uiWorkspace: null,
  sessions: null,
  workspaces: null,
  locale: null,
  modelDirectories: null
};
function getUiWorkspace() {
  if (serviceRefs.uiWorkspace) return serviceRefs.uiWorkspace;
  try {
    const ctx = serviceRefs.ctx;
    if (ctx) {
      const uiW = ctx.uiWorkspace || (typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null);
      if (uiW) {
        serviceRefs.uiWorkspace = uiW;
        return uiW;
      }
    }
  } catch (e) {
  }
  return null;
}
function getModelDirectories() {
  if (serviceRefs.modelDirectories) return serviceRefs.modelDirectories;
  try {
    const ctx = serviceRefs.ctx;
    if (ctx) {
      const md = ctx.modelDirectories || (typeof ctx.get === "function" ? ctx.get("modelDirectories") : null);
      if (md) {
        serviceRefs.modelDirectories = md;
        return md;
      }
    }
  } catch (e) {
  }
  return null;
}
function setServiceRefs(ctx) {
  serviceRefs.ctx = ctx || null;
  try {
    serviceRefs.conversation = ctx.conversation || (typeof ctx.get === "function" ? ctx.get("conversation") : null);
  } catch (e) {
  }
  try {
    serviceRefs.uiConversation = ctx.uiConversation || (typeof ctx.get === "function" ? ctx.get("uiConversation") : null);
  } catch (e) {
  }
  try {
    serviceRefs.uiWorkspace = ctx.uiWorkspace || (typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null);
  } catch (e) {
  }
  try {
    serviceRefs.sessions = ctx.sessions || null;
  } catch (e) {
  }
  try {
    serviceRefs.workspaces = ctx.workspaces || null;
  } catch (e) {
  }
  try {
    serviceRefs.locale = ctx.locale || null;
  } catch (e) {
  }
  try {
    serviceRefs.modelDirectories = ctx.modelDirectories || (typeof ctx.get === "function" ? ctx.get("modelDirectories") : null);
  } catch (e) {
  }
}
function clearServiceRefs() {
  serviceRefs.ctx = null;
  serviceRefs.conversation = null;
  serviceRefs.uiConversation = null;
  serviceRefs.uiWorkspace = null;
  serviceRefs.sessions = null;
  serviceRefs.workspaces = null;
  serviceRefs.locale = null;
  serviceRefs.modelDirectories = null;
}
async function resolveImageCompat(sessionId, ref, props) {
  if (props && typeof props.loadImage === "function") {
    try {
      const u1 = await props.loadImage(ref);
      if (u1) return u1;
    } catch (e1) {
    }
  }
  if (serviceRefs.conversation && typeof serviceRefs.conversation.resolveImage === "function") {
    try {
      const u2 = await serviceRefs.conversation.resolveImage(sessionId, ref);
      if (u2) return u2;
    } catch (e2) {
    }
  }
  if (serviceRefs.uiConversation && typeof serviceRefs.uiConversation.imageUrl === "function") {
    try {
      return await serviceRefs.uiConversation.imageUrl(sessionId, ref);
    } catch (e3) {
    }
  }
  return null;
}
var attachmentFileCache = /* @__PURE__ */ new Map();
var MAX_ATTACHMENT_CACHE_ITEMS = 32;
var MAX_ATTACHMENT_CACHE_BYTES = 64 * 1024 * 1024;
var attachmentFileCacheBytes = 0;
function getCachedAttachmentFile(key) {
  if (!key || !attachmentFileCache.has(key)) return null;
  const entry = attachmentFileCache.get(key);
  attachmentFileCache.delete(key);
  attachmentFileCache.set(key, entry);
  return entry && entry.file instanceof File ? entry.file : null;
}
function setCachedAttachmentFile(key, file) {
  if (!key || !(file instanceof File)) return;
  const fileSize = typeof file.size === "number" && file.size > 0 ? file.size : 0;
  if (fileSize > 32 * 1024 * 1024) return;
  if (attachmentFileCache.has(key)) {
    const prev = attachmentFileCache.get(key);
    attachmentFileCacheBytes -= prev && prev.size || 0;
    attachmentFileCache.delete(key);
  }
  while (attachmentFileCache.size >= MAX_ATTACHMENT_CACHE_ITEMS || attachmentFileCache.size > 0 && attachmentFileCacheBytes + fileSize > MAX_ATTACHMENT_CACHE_BYTES) {
    const oldestKey = attachmentFileCache.keys().next().value;
    if (oldestKey === void 0) break;
    const oldest = attachmentFileCache.get(oldestKey);
    attachmentFileCacheBytes -= oldest && oldest.size || 0;
    attachmentFileCache.delete(oldestKey);
  }
  if (attachmentFileCacheBytes < 0) attachmentFileCacheBytes = 0;
  attachmentFileCache.set(key, { file, size: fileSize });
  attachmentFileCacheBytes += fileSize;
}
function isImageFileName(filename) {
  if (!filename || typeof filename !== "string") return false;
  return /\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i.test(filename.trim());
}
function isImageMediaType(mediaType) {
  if (!mediaType || typeof mediaType !== "string") return false;
  return /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml|x-icon)/i.test(mediaType.trim());
}
function guessMimeType(filename) {
  if (!filename || typeof filename !== "string") return "application/octet-stream";
  var lower = filename.trim().toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
  if (lower.endsWith(".ts")) return "text/plain";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
async function resolveAttachmentFile(sessionId, att, props) {
  if (!att) return null;
  if (typeof File !== "undefined") {
    if (att instanceof File) return att;
    if (att.file instanceof File) return att.file;
    if (att.attachment && att.attachment.file instanceof File) return att.attachment.file;
  }
  var rawAtt = att.attachment || att;
  var attId = rawAtt.attachmentId || att.attachmentId || rawAtt.id || att.id || "";
  var name = rawAtt.name || att.name || "";
  var mediaType = rawAtt.mediaType || att.mediaType || (typeof att.type === "string" && att.type !== "file" && att.type !== "image" ? att.type : "") || "";
  var hasExplicitFileKind = !!(att.isFile || att.kind === "file" || rawAtt.kind === "file" || rawAtt.type === "file");
  var isImgByExt = isImageFileName(name);
  var isImgByMime = isImageMediaType(mediaType);
  var hasNonImgExt = !!(name && /\.[a-z0-9]+$/i.test(name.trim()) && !isImgByExt);
  var isFileKind = hasExplicitFileKind || hasNonImgExt || !isImgByExt && !isImgByMime;
  if (!name) name = isFileKind ? "file" : "image.png";
  var type = mediaType;
  if (!type) {
    if (isFileKind) {
      type = guessMimeType(name);
    } else {
      var lower = String(name).toLowerCase();
      if (/\.jpe?g$/.test(lower)) type = "image/jpeg";
      else if (lower.endsWith(".webp")) type = "image/webp";
      else if (lower.endsWith(".gif")) type = "image/gif";
      else type = "image/png";
    }
  }
  var cacheKey = attId ? attId + "::" + name : "";
  if (cacheKey) {
    var cached = getCachedAttachmentFile(cacheKey);
    if (cached instanceof File) return cached;
  }
  try {
    var conv = serviceRefs.conversation;
    if (attId && conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      var draftItem = conv.draftAttachments.get(attId);
      if (draftItem && draftItem.file instanceof File) return draftItem.file;
    }
  } catch (eDraftPool) {
  }
  var directUrl = att.url || att.dataUrl || rawAtt.url || rawAtt.dataUrl || "";
  if (typeof directUrl === "string" && (directUrl.indexOf("blob:") === 0 || directUrl.indexOf("data:") === 0)) {
    try {
      var dResp = await fetch(directUrl);
      if (dResp.ok) {
        var dBlob = await dResp.blob();
        var dFile = new File([dBlob], name, { type: type || dBlob.type || (isFileKind ? "application/octet-stream" : "image/png") });
        if (cacheKey) setCachedAttachmentFile(cacheKey, dFile);
        return dFile;
      }
    } catch (eDu) {
    }
  }
  try {
    var sessions = props && props.ctxSessions || serviceRefs.sessions;
    var session = null;
    if (sessions && typeof sessions.binding === "function" && sessionId) {
      var b = sessions.binding(sessionId);
      if (b && b.session) session = b.session;
    }
    if (!session && sessions && sessions.manager && typeof sessions.manager.get === "function") {
      session = sessions.manager.get(sessionId);
    } else if (!session && sessions && typeof sessions.get === "function") {
      session = sessions.get(sessionId);
    }
    if (session && typeof session.readAttachment === "function" && attId) {
      var res = null;
      try {
        res = await session.readAttachment({
          type: isFileKind ? "file" : "image",
          attachment: {
            attachmentId: attId,
            mediaType: type || (isFileKind ? "application/octet-stream" : "image/png")
          }
        });
      } catch (eBlock) {
        res = await session.readAttachment(attId);
      }
      if (res instanceof Uint8Array && res.byteLength > 0) {
        var f0 = new File([res], name, { type: type || (isFileKind ? "application/octet-stream" : "image/png") });
        if (cacheKey) setCachedAttachmentFile(cacheKey, f0);
        return f0;
      }
      if (res && res.ok && res.value && res.value.data) {
        var u8 = Uint8Array.from(res.value.data);
        var mType = res.value.attachment && res.value.attachment.mediaType || type || (isFileKind ? "application/octet-stream" : "image/png");
        var f1 = new File([u8], name, { type: mType });
        if (cacheKey) setCachedAttachmentFile(cacheKey, f1);
        return f1;
      }
    }
  } catch (eS) {
  }
  if (!isFileKind) {
    try {
      var url = await resolveImageCompat(sessionId, rawAtt, props);
      if (url) {
        var resp = await fetch(url);
        if (resp.ok) {
          var blob = await resp.blob();
          var f2 = new File([blob], name, { type: type || blob.type || "image/png" });
          if (cacheKey) setCachedAttachmentFile(cacheKey, f2);
          return f2;
        }
      }
    } catch (eU) {
    }
  }
  if (typeof attId === "string" && /^sha256:[0-9a-f]{64}$/i.test(attId.trim())) {
    try {
      var rawResp = await fetch("/bubble/attachment/raw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentId: attId.trim(), name })
      });
      if (rawResp && rawResp.ok) {
        var rawBlob = await rawResp.blob();
        var finalType = type || (isFileKind ? "application/octet-stream" : "image/png");
        var f3 = new File([rawBlob], name, { type: finalType });
        if (cacheKey) setCachedAttachmentFile(cacheKey, f3);
        return f3;
      }
    } catch (eRaw) {
      log("warn", "attach", "\u8BF7\u6C42 /bubble/attachment/raw \u5931\u8D25", { attachmentId: attId, name, err: String(eRaw && eRaw.message ? eRaw.message : eRaw) });
    }
  }
  return null;
}
function createDraftImagesCompat(files, sessionId) {
  if (!files || files.length === 0) return [];
  let conv = null;
  try {
    if (sessionId && serviceRefs.sessions && typeof serviceRefs.sessions.scope === "function") {
      const scope = serviceRefs.sessions.scope(sessionId);
      if (scope && typeof scope.get === "function") conv = scope.get("conversation");
    }
  } catch (e) {
  }
  if (!conv) conv = serviceRefs.conversation;
  if (!conv) return [];
  let drafts = null;
  if (typeof conv.createDrafts === "function") {
    try {
      drafts = conv.createDrafts(sessionId, files);
    } catch (e) {
      log("warn", "attach", "conv.createDrafts \u629B\u9519", { err: String(e && e.message ? e.message : e) });
    }
  }
  if (!Array.isArray(drafts) || drafts.length === 0) {
    const imgFiles = [];
    const docFiles = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      if (f && isImageFileName(f.name)) imgFiles.push(f);
      else docFiles.push(f);
    }
    drafts = [];
    if (imgFiles.length > 0 && typeof conv.createDraftImages === "function") {
      try {
        const dImgs = conv.createDraftImages(imgFiles);
        if (Array.isArray(dImgs)) drafts = drafts.concat(dImgs);
      } catch (eImg) {
        log("warn", "attach", "conv.createDraftImages \u629B\u9519", { err: String(eImg?.message ?? eImg) });
      }
    }
    if (docFiles.length > 0 && conv.draftAttachments && typeof conv.draftAttachments.set === "function") {
      for (let di = 0; di < docFiles.length; di++) {
        const df = docFiles[di];
        const dId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        const docAtt = {
          kind: "file",
          id: dId,
          file: df
        };
        conv.draftAttachments.set(dId, docAtt);
        drafts.push(docAtt);
      }
    }
  }
  if (!Array.isArray(drafts)) return [];
  return drafts.map(function(d) {
    if (!d) return null;
    var fileName = d.file && d.file.name || "";
    var isExplicitDoc = !!(d.kind === "file" || fileName && !isImageFileName(fileName));
    var isRealImg = !isExplicitDoc;
    if (conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      try {
        const rawAtt = conv.draftAttachments.get(d.id);
        if (rawAtt) {
          if (isExplicitDoc) {
            rawAtt.kind = "file";
          }
        }
      } catch (eAttKind) {
      }
    }
    if (isExplicitDoc && conv && conv.fileUploads && typeof conv.fileUploads.update === "function") {
      try {
        conv.fileUploads.update((draftMap) => {
          if (!draftMap[d.id]) {
            draftMap[d.id] = { status: "ready", loaded: d.file && d.file.size || 0, total: d.file && d.file.size || 0 };
          }
        });
      } catch (eUpd) {
      }
    }
    return {
      id: d.id,
      previewUrl: isRealImg ? d.previewUrl || d.url || (d.file && isImageFileName(d.file.name) ? URL.createObjectURL(d.file) : "") : "",
      file: d.file || null,
      kind: isRealImg ? "image" : "file"
    };
  }).filter(Boolean);
}
function addInputImagesCompat(inputActions, ids) {
  if (!inputActions || !ids || !ids.length) return false;
  try {
    if (typeof inputActions.addAttachments === "function") {
      return !!inputActions.addAttachments(ids);
    }
    if (typeof inputActions.addImages === "function") {
      return !!inputActions.addImages(ids);
    }
  } catch (e) {
    log("warn", "attach", "\u6DFB\u52A0\u8349\u7A3F\u9644\u4EF6\u5931\u8D25", { err: String(e && e.message ? e.message : e) });
  }
  return false;
}
function pruneInputImagesCompat(inputActions, keepIds) {
  if (!inputActions || !keepIds) return false;
  try {
    if (typeof inputActions.pruneAttachments === "function") {
      inputActions.pruneAttachments(keepIds);
      return true;
    }
    if (typeof inputActions.pruneImages === "function") {
      inputActions.pruneImages(keepIds);
      return true;
    }
  } catch (e) {
    log("warn", "attach", "\u88C1\u526A\u8349\u7A3F\u9644\u4EF6\u5931\u8D25", { err: String(e && e.message ? e.message : e) });
  }
  return false;
}
function getInputImageIdsCompat(inputState) {
  if (!inputState) return [];
  if (Array.isArray(inputState.attachmentIds)) return inputState.attachmentIds.slice();
  if (Array.isArray(inputState.imageIds)) return inputState.imageIds.slice();
  if (inputState.state && typeof inputState.state.getSnapshot === "function") {
    try {
      var snap = inputState.state.getSnapshot();
      if (snap) {
        if (Array.isArray(snap.attachmentIds)) return snap.attachmentIds.slice();
        if (Array.isArray(snap.imageIds)) return snap.imageIds.slice();
      }
    } catch (e) {
    }
  }
  return [];
}
function createModelSel(ctx) {
  return {
    capture: function(sessionId) {
      try {
        const md = ctx && ctx.modelDirectories ? ctx.modelDirectories : serviceRefs.modelDirectories;
        if (!md || typeof md.directoryFor !== "function") return null;
        const cur = md.directoryFor(sessionId).store.getSnapshot().current;
        if (cur && cur.provider && cur.model) {
          return { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort };
        }
      } catch (e) {
        log("warn", "model", "\u8BFB\u53D6\u5F53\u524D\u6A21\u578B/\u6321\u4F4D\u5931\u8D25\uFF08\u5C06\u6309\u9ED8\u8BA4\u53D1\u9001\uFF09", { err: String(e && e.message ? e.message : e) });
      }
      return null;
    },
    apply: function(sessionId, sel) {
      if (!sel || !sel.provider || !sel.model) return Promise.resolve(false);
      try {
        const md = ctx && ctx.modelDirectories ? ctx.modelDirectories : serviceRefs.modelDirectories;
        if (!md || typeof md.directoryFor !== "function") return Promise.resolve(false);
        return md.directoryFor(sessionId).select(sel).then(function() {
          log("info", "model", "\u65B0\u4F1A\u8BDD\u5DF2\u5E94\u7528\u539F\u6A21\u578B/\u6321\u4F4D\u9009\u62E9", { provider: sel.provider, model: sel.model });
          return true;
        }, function(e) {
          log("warn", "model", "\u5E94\u7528\u6A21\u578B/\u6321\u4F4D\u5931\u8D25\uFF08\u6309\u9ED8\u8BA4\u53D1\u9001\uFF09", { err: String(e && e.message ? e.message : e) });
          return false;
        });
      } catch (e) {
        return Promise.resolve(false);
      }
    }
  };
}

// src/core/i18n.js
var React = __toESM(require("react"), 1);
var SETTINGS_I18N = {
  zh: {
    title: "EasyRewrite",
    subtitle: "\u7B80\u5355\u6613\u7528\u7684\u64A4\u56DE\u91CD\u7F16\u8F91",
    expand: "\u5C55\u5F00",
    collapse: "\u6536\u8D77",
    rewrite: "\u6C14\u6CE1\u6846\u7F16\u8F91\uFF08\u70B9\u51FB\u6C14\u6CE1\u539F\u4F4D\u4FEE\u6539\uFF09",
    editOffShowRecall: "\u5173\u95ED\u6C14\u6CE1\u6846\u7F16\u8F91\u65F6\u663E\u793A\u64A4\u56DE\u952E",
    lockedHint: "\u9700\u5148\u5173\u95ED\u300C\u6C14\u6CE1\u6846\u7F16\u8F91\u300D\u624D\u53EF\u4FEE\u6539\u6B64\u9009\u9879",
    attachWarning: "\u6B64\u6D88\u606F\u542B\u65E0\u6CD5\u4FDD\u7559\u7684\u5185\u5BB9\uFF08\u975E\u56FE\u7247/\u6587\u4EF6\u9644\u4EF6\uFF09\uFF0C\u7F16\u8F91\u91CD\u53D1\u540E\u53EF\u80FD\u4E22\u5931",
    recallConfirm: "\u64A4\u56DE\u786E\u8BA4\u80F6\u56CA",
    hotkey: "\u64A4\u56DE\u5FEB\u6377\u952E",
    hotkeyEnable: "\u64A4\u56DE\u5FEB\u6377\u952E\uFF08Beta\uFF09",
    hotkeyNone: "\u672A\u8BBE\u7F6E",
    hotkeyHint: "\u8F93\u5165\u6846\u672A\u805A\u7126\u4E14\u6700\u8FD1\u4E00\u6761\u4E3A\u7528\u6237\u6D88\u606F\u65F6\u751F\u6548",
    hotkeyRecord: "\u5F55\u5236",
    hotkeyRecording: "\u6309\u4E0B\u65B0\u7EC4\u5408\u952E\u2026\uFF08Esc \u53D6\u6D88\uFF09",
    hotkeyInvalid: "\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u4FEE\u9970\u952E\uFF08Ctrl/\u2318/Alt/Shift\uFF09",
    visualMode: "\u64A4\u56DE\u89C6\u89C9\u6A21\u5F0F",
    visualMinimal: "\u6781\u7B80\uFF08\u65E0\u75D5\u9690\u85CF\uFF09",
    visualSimple: "\u7B80\u5355\uFF08\u7070\u5B57+\u9690\u85CF\u540E\u7EED\uFF09",
    visualInfo: "\u4FE1\u606F\uFF08\u7070\u5B57+\u4FDD\u7559\u540E\u7EED\uFF09",
    statOnlyUser: "\u64A4\u56DE\u63D0\u793A\u7EDF\u8BA1\u4EC5\u5305\u542B\u7528\u6237\u63D0\u95EE\u8BED\u53E5",
    conflictMode: "\u56DE\u586B\u51B2\u7A81\u6A21\u5F0F",
    conflictOverwriteShort: "\u8986\u76D6",
    conflictMergeShort: "\u5408\u5E76",
    conflictOverwrite: "\u8986\u76D6\uFF08\u539F\u8349\u7A3F\u53D1\u9001/\u53D6\u6D88\u540E\u6062\u590D\uFF09",
    conflictMerge: "\u5408\u5E76\uFF08\u8FFD\u52A0\u5230\u539F\u8349\u7A3F\u540E\uFF09",
    editWidth: "\u6C14\u6CE1\u6846\u7F16\u8F91\u5BBD\u5EA6",
    wCompact: "\u7D27\u51D1",
    wStandard: "\u6807\u51C6",
    wExtended: "\u6269\u5C55",
    wCustom: "\u81EA\u5B9A\u4E49",
    customWidth: "\u81EA\u5B9A\u4E49\u5BBD\u5EA6 (px)",
    placeholderCustom: "\u5982 480",
    messagePreviewSize: "\u6D88\u606F\u9884\u89C8\u5927\u5C0F",
    previewSizeSmall: "\u5C0F",
    previewSizeLarge: "\u653E\u5927",
    previewSizeHintSmall: "\u7D27\u51D1\u65B9\u6846\uFF0C\u6587\u4EF6\u50CF\u6C14\u6CE1\u7F16\u8F91\u6001\u4E00\u6837\u6536\u6210\u5C0F\u65B9\u6846",
    previewSizeHintLarge: "\u56FE\u7247\u653E\u5927\u5448\u73B0\u5B98\u65B9\u9AD8\u5EA6\uFF0C\u6587\u4EF6\u5C55\u793A\u4E3A\u5927\u5361\u7247",
    instant: "\u8BBE\u7F6E\u5373\u65F6\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F",
    pagerTitle: "\u7248\u672C\u5207\u6362\uFF08\u64A4\u56DE/\u7F16\u8F91\u91CD\u53D1\uFF09",
    pagerPrev: "\u4E0A\u4E00\u4E2A\u7248\u672C",
    pagerNext: "\u4E0B\u4E00\u4E2A\u7248\u672C",
    modifying: "\u6B63\u5728\u4FEE\u6539",
    preparingSession: "\u6B63\u5728\u51C6\u5907\u65B0\u4F1A\u8BDD\u2026",
    confirm: "\u786E\u5B9A",
    cancel: "\u53D6\u6D88",
    copied: "\u5DF2\u590D\u5236",
    copy: "\u590D\u5236",
    viewOriginal: "\u67E5\u770B\u539F\u6587",
    emptyMsg: "\uFF08\u7A7A\u6D88\u606F\uFF09",
    greyText: "\u6B63\u5728\u4FEE\u6539\u6B64\u5904\u6587\u672C\uFF08\u70B9\u51FB\u67E5\u770B\u539F\u6587\uFF09",
    clickEdit: "\u70B9\u51FB\u7F16\u8F91",
    recallText0: "\u662F\u5426\u64A4\u56DE\u8FD9\u6761\u6D88\u606F\uFF1F",
    recallTextQ: "\u64A4\u56DE\u8FD9\u6761\u6D88\u606F\u53CA\u5176\u540E {n} \u6761\u63D0\u95EE\uFF1F",
    recallTextC: "\u64A4\u56DE\u8FD9\u6761\u6D88\u606F\u53CA\u5176\u540E {n} \u6761\u5185\u5BB9\uFF1F",
    cancelRecall: "\u53D6\u6D88\u64A4\u56DE",
    errNoBoundary: "\u8BE5\u6D88\u606F\u4E4B\u524D\u6CA1\u6709\u53EF\u622A\u65AD\u7684\u95ED\u5408\u56DE\u5408\u8FB9\u754C\uFF08\u622A\u65AD/\u9996\u6761\u6D88\u606F\u65E0\u6CD5\u64A4\u56DE\u6216\u7F16\u8F91\uFF09",
    errTurnOpen: "\u8BE5\u6D88\u606F\u6240\u5728\u56DE\u5408\u5C1A\u672A\u7ED3\u675F\uFF0C\u8BF7\u7B49\u5F85\u56DE\u590D\u5B8C\u6210\u540E\u518D\u64CD\u4F5C",
    errGeneric: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
    resetNotice: "\u5BF9\u8BDD\u5904\u4E8E\u534A\u622A\u72B6\u6001\uFF0C\u5DF2\u91CD\u7F6E\u2014\u2014\u6B63\u5728\u56DE\u5230\u4E0A\u4E00\u6B21\u6A21\u578B\u56DE\u590D\u5904\uFF08\u6216\u7A7A\u767D\u65B0\u5BF9\u8BDD\uFF09",
    turnOpenNotice: "\u56DE\u590D\u4ECD\u5728\u751F\u6210\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u56DE\u590D\u5B8C\u6210\u540E\u518D\u64A4\u56DE\u3002",
    sectionUpdate: "\u66F4\u65B0",
    currentVersion: "\u5F53\u524D\u7248\u672C",
    checkUpdate: "\u68C0\u67E5\u66F4\u65B0",
    checking: "\u68C0\u67E5\u4E2D\u2026",
    upToDate: "\u5DF2\u662F\u6700\u65B0\u7248\u672C",
    newVersion: "\u53D1\u73B0\u65B0\u7248\u672C v{ver}",
    updateNow: "\u66F4\u65B0",
    updating: "\u66F4\u65B0\u4E2D\u2026",
    updateDone: "\u66F4\u65B0\u5B8C\u6210\u2014\u2014\u91CD\u542F dsh web \u540E\u751F\u6548",
    updateFailed: "\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
    autoCheckUpdate: "\u6BCF\u65E5\u68C0\u67E5\u66F4\u65B0\uFF08\u53D1\u73B0\u65B0\u7248\u672C\u65F6\u63D0\u793A\uFF09",
    updateAvailable: "\u6709\u65B0\u7248\u672C",
    sectionEdit: "\u7F16\u8F91",
    sectionRecall: "\u64A4\u56DE",
    sectionComposer: "\u56DE\u586B",
    sectionVersions: "\u7248\u672C",
    versionFamilies: "\u7248\u672C\u5BB6\u65CF\uFF08\u64A4\u56DE/\u7F16\u8F91\u91CD\u53D1\uFF09",
    versionHistory: "\u7248\u672C\u5386\u53F2\uFF08\u70B9\u51FB\u5C55\u5F00\u53EF\u624B\u52A8\u6062\u590D\u5386\u53F2\u7248\u672C\uFF09",
    versionFamilyNone: "\u6682\u65E0\u7248\u672C\u5BB6\u65CF",
    versionRestoreOpen: "\u6062\u590D\u5E76\u6253\u5F00",
    versionCount: "\u4E2A\u7248\u672C",
    modelMenu: "\u6A21\u578B",
    effortMenu: "\u63A8\u7406\u7B49\u7EA7",
    effortDefault: "Default",
    modelsLoading: "\u6B63\u5728\u5237\u65B0\u6A21\u578B\u5217\u8868\u2026",
    modelsEmpty: "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u3002",
    dshLowWarning: "\u5F53\u524D dsh\uFF08{cur}\uFF09\u4F4E\u4E8E\u672C\u63D2\u4EF6\u8981\u6C42\u7684\u6700\u4F4E\u7248\u672C\uFF08{min}\uFF09\u2014\u2014\u8BF7\u5148\u5347\u7EA7 dsh\uFF1A",
    dshNewNotice: "\u5F53\u524D dsh\uFF08{cur}\uFF09\u8F83\u65B0\uFF0C\u672C\u63D2\u4EF6\u7684\u9002\u914D\u8BC4\u4F30\u4E2D\uFF0C\u5982\u9047\u5F02\u5E38\u8BF7\u56DE\u9000 dsh \u6216\u5173\u6CE8\u66F4\u65B0",
    suggestAutoCheck: "\u5EFA\u8BAE\u5F00\u542F\u300C\u6BCF\u65E5\u68C0\u67E5\u66F4\u65B0\u300D\uFF1Adsh \u5347\u7EA7\u9891\u7E41\uFF0C\u53CA\u65F6\u66F4\u65B0\u63D2\u4EF6\u53EF\u907F\u514D\u517C\u5BB9\u95EE\u9898",
    enableNow: "\u4E00\u952E\u5F00\u542F",
    remindIgnore: "\u4E0D\u518D\u663E\u793A",
    copyUpgradeCmd: "\u590D\u5236\u5347\u7EA7\u547D\u4EE4",
    dzFull: "\u62D6\u5165\u6B64\u5904\u6DFB\u52A0\u6587\u4EF6\u81F3\u6B63\u5728\u7F16\u8F91\u7684\u6D88\u606F",
    dzCompact: "\u63D2\u5165\u6587\u4EF6",
    showOriginalImages: "\u64A4\u56DE\u5F85\u5B9A\u65F6\u67E5\u770B\u539F\u6587\u663E\u793A\u56FE\u7247",
    vaultLocation: "\u5386\u53F2\u7248\u672C\u4ED3\u50A8\u8DEF\u5F84",
    vaultGlobal: "\u5168\u5C40\u7EDF\u4E00\uFF08\u9ED8\u8BA4\uFF09",
    vaultWorkspace: "\u5DE5\u4F5C\u533A\u9694\u79BB",
    vaultGlobalHint: "\u5B58\u653E\u4E8E ~/.dsh/dsh-easyrewrite/EasyRewrited_Sessions/\uFF0C\u6240\u6709\u5DE5\u4F5C\u533A\u7EDF\u4E00\u5F71\u5B50\u4ED3\u50A8",
    vaultWorkspaceHint: "\u5B58\u653E\u4E8E\u5F53\u524D\u5DE5\u4F5C\u533A\u7684 .easyrewrite_vault/EasyRewrited_Sessions/\uFF0C\u6309\u9879\u76EE\u9694\u79BB",
    cleanLegacyArchived: "\u667A\u80FD\u8FC1\u79FB\u4E0E\u6E05\u7406\u5386\u53F2\u5F52\u6863",
    cleanLegacyArchivedHint: "\u5C06\u5386\u53F2\u64A4\u56DE\u5F52\u6863\u5B89\u5168\u8F6C\u5316\u4E3A\u5F71\u5B50\u4ED3\u50A8\u65B0\u6A21\u5F0F\uFF0C\u62D4\u9664\u6B8B\u7559\u5217\u8868\uFF0C\u4FDD\u7559\u7528\u6237\u4E3B\u52A8\u5F52\u6863",
    cleaning: "\u8FC1\u79FB\u4E2D\u2026",
    cleanDone: "\u667A\u80FD\u8FC1\u79FB\u5B8C\u6210\uFF1A\u5DF2\u8F6C\u5316 {n} \u4E2A\u5386\u53F2\u7248\u672C\u5165\u5E93\uFF0C\u4FDD\u7559 {r} \u4E2A\u7528\u6237\u4E3B\u52A8\u5F52\u6863\uFF01",
    cleanNone: "\u5386\u53F2\u5F52\u6863\u5DF2\u5168\u90E8\u5728\u65B0\u6A21\u5F0F\u4E2D\uFF0C\u65E0\u9700\u518D\u6B21\u8F6C\u5316"
  },
  en: {
    title: "EasyRewrite",
    subtitle: "Simple & easy recall and re-edit",
    expand: "Expand",
    collapse: "Collapse",
    rewrite: "Bubble edit (click bubble to edit in place)",
    editOffShowRecall: "Show recall key when bubble edit is off",
    lockedHint: 'Turn off "Bubble edit" first to change this',
    attachWarning: "This message has content that cannot be preserved (non-image/file attachments); it may be lost after editing",
    recallConfirm: "Recall confirmation capsule",
    hotkey: "Recall hotkey",
    hotkeyEnable: "Recall hotkey (Beta)",
    hotkeyNone: "Not set",
    hotkeyHint: "Works when the input is unfocused and the latest message is yours",
    hotkeyRecord: "Record",
    hotkeyRecording: "Press a new combination\u2026 (Esc to cancel)",
    hotkeyInvalid: "Needs at least one modifier (Ctrl/\u2318/Alt/Shift)",
    visualMode: "Recall visual mode",
    visualMinimal: "Minimal (hide all)",
    visualSimple: "Simple (grey text + hide rest)",
    visualInfo: "Info (grey text + keep rest)",
    statOnlyUser: "Recall count: user questions only",
    conflictMode: "Composer fill mode",
    conflictOverwriteShort: "Overwrite",
    conflictMergeShort: "Merge",
    conflictOverwrite: "Overwrite (original draft restored after send/cancel)",
    conflictMerge: "Merge (append after original draft)",
    editWidth: "Bubble edit width",
    wCompact: "Compact",
    wStandard: "Standard",
    wExtended: "Expanded",
    wCustom: "Custom",
    customWidth: "Custom width (px)",
    placeholderCustom: "e.g. 480",
    messagePreviewSize: "Message preview size",
    previewSizeSmall: "Small",
    previewSizeLarge: "Enlarged",
    previewSizeHintSmall: "Compact square cards, folding files into small boxes",
    previewSizeHintLarge: "Official full-height image gallery and large file cards",
    instant: "Settings apply instantly, no restart needed",
    pagerTitle: "Version pager (recall/edit resends)",
    pagerPrev: "Previous version",
    pagerNext: "Next version",
    modifying: "Modifying",
    preparingSession: "Preparing new session\u2026",
    confirm: "Confirm",
    cancel: "Cancel",
    copied: "Copied",
    copy: "Copy",
    viewOriginal: "View original",
    emptyMsg: "(empty)",
    greyText: "Modifying this message (click to view original)",
    clickEdit: "Click to edit",
    recallText0: "Recall this message?",
    recallTextQ: "Recall this message and {n} following questions?",
    recallTextC: "Recall this message and {n} following items?",
    cancelRecall: "Cancel recall",
    errNoBoundary: "No truncation boundary before this message (first/truncated message cannot be recalled or edited)",
    errTurnOpen: "This message's turn is still running; wait for the reply to finish",
    errGeneric: "Operation failed, please retry",
    resetNotice: "The conversation was in a truncated state and has been reset \u2014 returning to the last model reply (or a blank conversation)",
    turnOpenNotice: "A reply is still being generated. Please wait for it to finish before recalling.",
    sectionUpdate: "Update",
    currentVersion: "Current version",
    checkUpdate: "Check for updates",
    checking: "Checking\u2026",
    upToDate: "You are on the latest version",
    newVersion: "New version v{ver} available",
    updateNow: "Update",
    updating: "Updating\u2026",
    updateDone: "Update complete \u2014 restart dsh web to apply",
    updateFailed: "Update failed, please retry later",
    autoCheckUpdate: "Check for updates daily (notify when a new version is found)",
    updateAvailable: "New version",
    sectionEdit: "Editing",
    sectionRecall: "Recall",
    sectionComposer: "Composer fill",
    sectionVersions: "Versions",
    versionFamilies: "Version families (recall/edit resends)",
    versionHistory: "Version history (click to expand and restore past versions)",
    versionFamilyNone: "None yet",
    versionRestoreOpen: "Restore & open",
    versionCount: "versions",
    modelMenu: "Model",
    effortMenu: "Reasoning effort",
    effortDefault: "Default",
    modelsLoading: "Refreshing model list\u2026",
    modelsEmpty: "No models available.",
    dshLowWarning: "Your dsh ({cur}) is below the minimum required by this plugin ({min}) \u2014 please upgrade dsh first:",
    dshNewNotice: "Your dsh ({cur}) is newer than the tested range; compatibility is being evaluated",
    suggestAutoCheck: "Enable daily update checks: dsh updates frequently, keeping the plugin current avoids compatibility issues",
    enableNow: "Enable",
    remindIgnore: "Don't show again",
    copyUpgradeCmd: "Copy upgrade command",
    dzFull: "Drop to add files to the message being edited",
    dzCompact: "Insert file",
    showOriginalImages: "Show images when viewing original text while pending",
    vaultLocation: "Version Vault Location",
    vaultGlobal: "Global (Default)",
    vaultWorkspace: "Per-Workspace",
    vaultGlobalHint: "Stored in ~/.dsh/dsh-easyrewrite/EasyRewrited_Sessions/, centralized vault",
    vaultWorkspaceHint: "Stored in workspace's .easyrewrite_vault/EasyRewrited_Sessions/, isolated",
    cleanLegacyArchived: "Clean Legacy Archived Sessions",
    cleanLegacyArchivedHint: "Prune old archived session records in DSH 0.2 sidebar to avoid clutter",
    cleaning: "Cleaning\u2026",
    cleanDone: "Cleanup done: pruned {n} zombie sessions from archive!",
    cleanNone: "No legacy archived sessions found to clean"
  },
  ja: {
    title: "EasyRewrite",
    subtitle: "\u7C21\u5358\u3067\u4F7F\u3044\u3084\u3059\u3044\u64A4\u56DE\u30FB\u518D\u7DE8\u96C6",
    expand: "\u5C55\u958B",
    collapse: "\u6298\u308A\u305F\u305F\u3080",
    rewrite: "\u30D0\u30D6\u30EB\u7DE8\u96C6\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u305D\u306E\u5834\u7DE8\u96C6\uFF09",
    editOffShowRecall: "\u30D0\u30D6\u30EB\u7DE8\u96C6\u30AA\u30D5\u6642\u306B\u64A4\u56DE\u30AD\u30FC\u3092\u8868\u793A",
    lockedHint: "\u5148\u306B\u300C\u30D0\u30D6\u30EB\u7DE8\u96C6\u300D\u3092\u30AA\u30D5\u306B\u3057\u3066\u304F\u3060\u3055\u3044",
    attachWarning: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u306F\u4FDD\u6301\u3067\u304D\u306A\u3044\u5185\u5BB9\uFF08\u753B\u50CF/\u30D5\u30A1\u30A4\u30EB\u4EE5\u5916\u306E\u6DFB\u4ED8\uFF09\u304C\u3042\u308A\u307E\u3059\u3002\u7DE8\u96C6\u5F8C\u306E\u518D\u9001\u3067\u5931\u308F\u308C\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059",
    recallConfirm: "\u64A4\u56DE\u78BA\u8A8D\u30AB\u30D7\u30BB\u30EB",
    hotkey: "\u64A4\u56DE\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
    hotkeyEnable: "\u64A4\u56DE\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\uFF08Beta\uFF09",
    hotkeyNone: "\u672A\u8A2D\u5B9A",
    hotkeyHint: "\u5165\u529B\u6B04\u304C\u975E\u30D5\u30A9\u30FC\u30AB\u30B9\u304B\u3064\u76F4\u8FD1\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u30E6\u30FC\u30B6\u30FC\u6642\u306E\u307F\u6709\u52B9",
    hotkeyRecord: "\u9332\u97F3",
    hotkeyRecording: "\u65B0\u3057\u3044\u30AD\u30FC\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u2026\uFF08Esc \u3067\u30AD\u30E3\u30F3\u30BB\u30EB\uFF09",
    hotkeyInvalid: "\u4FEE\u98FE\u30AD\u30FC\uFF08Ctrl/\u2318/Alt/Shift\uFF09\u304C\u6700\u4F4E 1 \u3064\u5FC5\u8981\u3067\u3059",
    visualMode: "\u64A4\u56DE\u8868\u793A\u30E2\u30FC\u30C9",
    visualMinimal: "\u30DF\u30CB\u30DE\u30EB\uFF08\u5B8C\u5168\u975E\u8868\u793A\uFF09",
    visualSimple: "\u30B7\u30F3\u30D7\u30EB\uFF08\u30B0\u30EC\u30FC\u6587\u5B57+\u4EE5\u964D\u3092\u975E\u8868\u793A\uFF09",
    visualInfo: "\u30A4\u30F3\u30D5\u30A9\uFF08\u30B0\u30EC\u30FC\u6587\u5B57+\u4EE5\u964D\u3092\u8868\u793A\uFF09",
    statOnlyUser: "\u64A4\u56DE\u4EF6\u6570\uFF1A\u30E6\u30FC\u30B6\u30FC\u8CEA\u554F\u306E\u307F",
    conflictMode: "\u5165\u529B\u6B04\u3078\u306E\u53CD\u6620\u30E2\u30FC\u30C9",
    conflictOverwriteShort: "\u4E0A\u66F8\u304D",
    conflictMergeShort: "\u7D50\u5408",
    conflictOverwrite: "\u4E0A\u66F8\u304D\uFF08\u9001\u4FE1/\u30AD\u30E3\u30F3\u30BB\u30EB\u5F8C\u306B\u5143\u306E\u4E0B\u66F8\u304D\u3092\u5FA9\u5143\uFF09",
    conflictMerge: "\u7D50\u5408\uFF08\u5143\u306E\u4E0B\u66F8\u304D\u306B\u8FFD\u8A18\uFF09",
    editWidth: "\u30D0\u30D6\u30EB\u7DE8\u96C6\u306E\u5E45",
    wCompact: "\u30B3\u30F3\u30D1\u30AF\u30C8",
    wStandard: "\u30B9\u30BF\u30F3\u30C0\u30FC\u30C9",
    wExtended: "\u30A8\u30AF\u30B9\u30C6\u30F3\u30C9",
    wCustom: "\u30AB\u30B9\u30BF\u30E0",
    customWidth: "\u30AB\u30B9\u30BF\u30E0\u5E45 (px)",
    placeholderCustom: "\u4F8B: 480",
    messagePreviewSize: "\u30D7\u30EC\u30D3\u30E5\u30FC\u30B5\u30A4\u30BA",
    previewSizeSmall: "\u5C0F",
    previewSizeLarge: "\u62E1\u5927",
    previewSizeHintSmall: "\u30D0\u30D6\u30EB\u7DE8\u96C6\u30E2\u30FC\u30C9\u306E\u3088\u3046\u306B\u30D5\u30A1\u30A4\u30EB\u3092\u5C0F\u3055\u306A\u6B63\u65B9\u5F62\u306B\u683C\u7D0D",
    previewSizeHintLarge: "\u516C\u5F0F\u30B5\u30A4\u30BA\u306E\u753B\u50CF\u3068\u5927\u304D\u306A\u30D5\u30A1\u30A4\u30EB\u30AB\u30FC\u30C9\u3092\u8868\u793A",
    instant: "\u8A2D\u5B9A\u306F\u5373\u6642\u53CD\u6620\u3001\u518D\u8D77\u52D5\u4E0D\u8981",
    pagerTitle: "\u30D0\u30FC\u30B8\u30E7\u30F3\u5207\u66FF\uFF08\u64A4\u56DE/\u7DE8\u96C6\u518D\u9001\uFF09",
    pagerPrev: "\u524D\u306E\u30D0\u30FC\u30B8\u30E7\u30F3",
    pagerNext: "\u6B21\u306E\u30D0\u30FC\u30B8\u30E7\u30F3",
    modifying: "\u5909\u66F4\u4E2D",
    preparingSession: "\u65B0\u3057\u3044\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u6E96\u5099\u4E2D\u2026",
    confirm: "\u78BA\u5B9A",
    cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    copied: "\u30B3\u30D4\u30FC\u6E08\u307F",
    copy: "\u30B3\u30D4\u30FC",
    viewOriginal: "\u539F\u6587\u3092\u8868\u793A",
    emptyMsg: "\uFF08\u7A7A\u30E1\u30C3\u30BB\u30FC\u30B8\uFF09",
    greyText: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5909\u66F4\u4E2D\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u539F\u6587\u3092\u8868\u793A\uFF09",
    clickEdit: "\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u7DE8\u96C6",
    recallText0: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u64A4\u56DE\u3057\u307E\u3059\u304B\uFF1F",
    recallTextQ: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3068\u5F8C\u7D9A {n} \u4EF6\u306E\u8CEA\u554F\u3092\u64A4\u56DE\u3057\u307E\u3059\u304B\uFF1F",
    recallTextC: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3068\u5F8C\u7D9A {n} \u4EF6\u3092\u64A4\u56DE\u3057\u307E\u3059\u304B\uFF1F",
    cancelRecall: "\u64A4\u56DE\u3092\u30AD\u30E3\u30F3\u30BB\u30EB",
    errNoBoundary: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306E\u524D\u306B\u5207\u308A\u8A70\u3081\u5883\u754C\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u5207\u308A\u8A70\u3081\u5F8C\u30FB\u6700\u521D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306F\u64A4\u56DE/\u7DE8\u96C6\u3067\u304D\u307E\u305B\u3093\uFF09",
    errTurnOpen: "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306E\u30BF\u30FC\u30F3\u306F\u307E\u3060\u7D42\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u8FD4\u4FE1\u5B8C\u4E86\u5F8C\u306B\u304A\u8A66\u3057\u304F\u3060\u3055\u3044",
    errGeneric: "\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044",
    resetNotice: "\u4F1A\u8A71\u304C\u9014\u4E2D\u3067\u5207\u308C\u305F\u72B6\u614B\u306E\u305F\u3081\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F\u2014\u2014\u6700\u5F8C\u306E\u30E2\u30C7\u30EB\u8FD4\u4FE1\uFF08\u307E\u305F\u306F\u7A7A\u767D\u306E\u4F1A\u8A71\uFF09\u306B\u623B\u308A\u307E\u3059",
    turnOpenNotice: "\u8FD4\u4FE1\u304C\u307E\u3060\u751F\u6210\u4E2D\u3067\u3059\u3002\u8FD4\u4FE1\u304C\u5B8C\u4E86\u3057\u3066\u304B\u3089\u53D6\u308A\u6D88\u3057\u3066\u304F\u3060\u3055\u3044",
    sectionUpdate: "\u66F4\u65B0",
    currentVersion: "\u73FE\u5728\u306E\u30D0\u30FC\u30B8\u30E7\u30F3",
    checkUpdate: "\u66F4\u65B0\u3092\u78BA\u8A8D",
    checking: "\u78BA\u8A8D\u4E2D\u2026",
    upToDate: "\u6700\u65B0\u30D0\u30FC\u30B8\u30E7\u30F3\u3067\u3059",
    newVersion: "\u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3 v{ver} \u304C\u3042\u308A\u307E\u3059",
    updateNow: "\u66F4\u65B0",
    updating: "\u66F4\u65B0\u4E2D\u2026",
    updateDone: "\u66F4\u65B0\u5B8C\u4E86\u2014\u2014dsh web \u3092\u518D\u8D77\u52D5\u3059\u308B\u3068\u53CD\u6620\u3055\u308C\u307E\u3059",
    updateFailed: "\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044",
    autoCheckUpdate: "\u6BCE\u65E5\u66F4\u65B0\u3092\u78BA\u8A8D\uFF08\u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3\u304C\u3042\u308C\u3070\u901A\u77E5\uFF09",
    updateAvailable: "\u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3",
    sectionEdit: "\u7DE8\u96C6",
    sectionRecall: "\u64A4\u56DE",
    sectionComposer: "\u5165\u529B\u6B04",
    sectionVersions: "\u30D0\u30FC\u30B8\u30E7\u30F3",
    versionFamilies: "\u30D0\u30FC\u30B8\u30E7\u30F3\u30D5\u30A1\u30DF\u30EA\u30FC\uFF08\u64A4\u56DE/\u7DE8\u96C6\u518D\u9001\uFF09",
    versionHistory: "\u30D0\u30FC\u30B8\u30E7\u30F3\u5C65\u6B74\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u5C55\u958B\u3057\u904E\u53BB\u30D0\u30FC\u30B8\u30E7\u30F3\u3092\u5FA9\u5143\uFF09",
    versionFamilyNone: "\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
    versionRestoreOpen: "\u5FA9\u5143\u3057\u3066\u958B\u304F",
    versionCount: "\u30D0\u30FC\u30B8\u30E7\u30F3",
    modelMenu: "\u30E2\u30C7\u30EB",
    effortMenu: "\u63A8\u8AD6\u30EC\u30D9\u30EB",
    effortDefault: "Default",
    modelsLoading: "\u30E2\u30C7\u30EB\u4E00\u89A7\u3092\u66F4\u65B0\u4E2D\u2026",
    modelsEmpty: "\u5229\u7528\u53EF\u80FD\u306A\u30E2\u30C7\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
    dshLowWarning: "\u73FE\u5728\u306E dsh\uFF08{cur}\uFF09\u306F\u672C\u30D7\u30E9\u30B0\u30A4\u30F3\u306E\u6700\u4F4E\u8981\u4EF6\uFF08{min}\uFF09\u3092\u4E0B\u56DE\u3063\u3066\u3044\u307E\u3059\u2014\u2014\u5148\u306B dsh \u3092\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
    dshNewNotice: "\u73FE\u5728\u306E dsh\uFF08{cur}\uFF09\u306F\u691C\u8A3C\u6E08\u307F\u7BC4\u56F2\u3088\u308A\u65B0\u3057\u3044\u305F\u3081\u3001\u9069\u5408\u3092\u8A55\u4FA1\u4E2D\u3067\u3059",
    suggestAutoCheck: "\u300C\u6BCE\u65E5\u66F4\u65B0\u3092\u78BA\u8A8D\u300D\u306E\u6709\u52B9\u5316\u3092\u63A8\u5968\uFF1Adsh \u306E\u66F4\u65B0\u304C\u983B\u7E41\u306A\u305F\u3081\u3001\u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u6700\u65B0\u306B\u4FDD\u3064\u3068\u4E92\u63DB\u6027\u554F\u984C\u3092\u56DE\u907F\u3067\u304D\u307E\u3059",
    enableNow: "\u6709\u52B9\u306B\u3059\u308B",
    remindIgnore: "\u4ECA\u5F8C\u8868\u793A\u3057\u306A\u3044",
    copyUpgradeCmd: "\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u30B3\u30DE\u30F3\u30C9\u3092\u30B3\u30D4\u30FC",
    dzFull: "\u30C9\u30ED\u30C3\u30D7\u3057\u3066\u7DE8\u96C6\u4E2D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u306B\u30D5\u30A1\u30A4\u30EB\u3092\u8FFD\u52A0",
    dzCompact: "\u30D5\u30A1\u30A4\u30EB\u3092\u633F\u5165",
    showOriginalImages: "\u53D6\u308A\u6D88\u3057\u5F85\u3061\u306E\u539F\u6587\u8868\u793A\u3067\u753B\u50CF\u3092\u8868\u793A",
    vaultLocation: "\u30D0\u30FC\u30B8\u30E7\u30F3\u4FDD\u7BA1\u5EAB\u306E\u5834\u6240",
    vaultGlobal: "\u5168\u4F53\u7D71\u4E00\uFF08\u30C7\u30D5\u30A9\u30EB\u30C8\uFF09",
    vaultWorkspace: "\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u500B\u5225",
    vaultGlobalHint: "~/.dsh/dsh-easyrewrite/EasyRewrited_Sessions/ \u306B\u4FDD\u5B58",
    vaultWorkspaceHint: "\u5404\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u306E .easyrewrite_vault/EasyRewrited_Sessions/ \u306B\u4FDD\u5B58",
    cleanLegacyArchived: "\u904E\u53BB\u306E\u30A2\u30FC\u30AB\u30A4\u30D6\u5C65\u6B74\u3092\u4E00\u62EC\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7",
    cleanLegacyArchivedHint: "DSH 0.2 \u306E\u30B5\u30A4\u30C9\u30D0\u30FC\u306B\u6B8B\u308B\u904E\u53BB\u306E\u30A2\u30FC\u30AB\u30A4\u30D6\u30BB\u30C3\u30B7\u30E7\u30F3\u8A18\u9332\u3092\u6574\u7406",
    cleaning: "\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u4E2D\u2026",
    cleanDone: "\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u5B8C\u4E86\uFF1A{n} \u500B\u306E\u30BE\u30F3\u30D3\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u6574\u7406\u3057\u307E\u3057\u305F\uFF01",
    cleanNone: "\u6574\u7406\u5BFE\u8C61\u306E\u904E\u53BB\u30A2\u30FC\u30AB\u30A4\u30D6\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F"
  }
};
var localeServiceRef = null;
function useUILocaleDict() {
  var active = React.useSyncExternalStore(
    function(cb) {
      try {
        if (localeServiceRef && typeof localeServiceRef.subscribe === "function") return localeServiceRef.subscribe(cb);
      } catch (e) {
      }
      return function() {
      };
    },
    function() {
      try {
        if (localeServiceRef && typeof localeServiceRef.getSnapshot === "function") {
          var snap = localeServiceRef.getSnapshot();
          return snap && typeof snap.active === "string" ? snap.active : "zh";
        }
        return "zh";
      } catch (e) {
        return "zh";
      }
    }
  );
  return SETTINGS_I18N[active] || SETTINGS_I18N.zh;
}
function setLocaleService(service) {
  localeServiceRef = service;
}

// src/core/constants.js
var NS = "dsh-easyrewrite";
var CURRENT_VERSION = "3.0.1";
var MIN_DSH_VERSION = "0.1.2-rc.1";
var MAX_TESTED_DSH_VERSION = "0.2.5";
var SETTING_KEYS = {
  conflictMode: "dsh-easyrewrite:conflictMode",
  // "overwrite" | "merge"
  visualMode: "dsh-easyrewrite:visualMode",
  // "minimal" | "simple" | "info"
  showOriginalImages: "dsh-easyrewrite:showOriginalImages",
  rewriteOnClick: "dsh-easyrewrite:rewriteOnClick",
  editOffShowRecall: "dsh-easyrewrite:editOffShowRecall",
  recallConfirm: "dsh-easyrewrite:recallConfirm",
  debug: "dsh-easyrewrite:debug",
  shortcut: "dsh-easyrewrite:shortcut",
  pagerEnabled: "dsh-easyrewrite:pagerEnabled",
  checkUpdateDaily: "dsh-easyrewrite:checkUpdateDaily",
  lastUpdateCheckTime: "dsh-easyrewrite:lastUpdateCheckTime",
  dismissedUpdateVersion: "dsh-easyrewrite:dismissedUpdateVersion",
  editWidthMode: "dsh-easyrewrite:editWidthMode",
  messagePreviewSize: "dsh-easyrewrite:messagePreviewSize",
  // "standard" | "small"
  vaultStorageLocation: "dsh-easyrewrite:vaultStorageLocation"
  // "global" | "workspace"
};
function vaultStorageLocation() {
  return getSetting(SETTING_KEYS.vaultStorageLocation, "global");
}
function getSetting(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v;
  } catch (e) {
    return def;
  }
}
function setSetting(key, val) {
  try {
    localStorage.setItem(key, val);
    if (typeof window !== "undefined") {
      try {
        if (typeof window.StorageEvent === "function") {
          window.dispatchEvent(new window.StorageEvent("storage", { key, newValue: String(val) }));
        }
        window.dispatchEvent(new CustomEvent("dsh-easyrewrite:settings-change", { detail: { key, value: val } }));
      } catch (eEv) {
      }
    }
  } catch (e) {
  }
}
function messagePreviewSize() {
  const v = getSetting(SETTING_KEYS.messagePreviewSize, "small");
  if (v === "standard") return "small";
  return v === "large" ? "large" : "small";
}
function getBool(key, def) {
  return getSetting(key, def ? "1" : "0") !== "0";
}
function setBool(key, v) {
  setSetting(key, v ? "1" : "0");
}
function draftConflictMode() {
  return getSetting(SETTING_KEYS.conflictMode, "overwrite");
}
function recallVisualMode() {
  return getSetting(SETTING_KEYS.visualMode, "simple");
}
function showOriginalImages() {
  return getBool(SETTING_KEYS.showOriginalImages, true);
}
function rewriteOnClick() {
  return getBool(SETTING_KEYS.rewriteOnClick, true);
}
function editOffShowRecall() {
  return getBool(SETTING_KEYS.editOffShowRecall, true);
}
function recallConfirmEnabled() {
  return getBool(SETTING_KEYS.recallConfirm, true);
}
function versionGt(a, b) {
  const pa = String(a || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let vi = 0; vi < len; vi++) {
    const av = pa[vi] || 0;
    const bv = pb[vi] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}
function dshVerRank(v) {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|rc)\.(\d+))?$/);
  if (!m) return null;
  return {
    core: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)],
    pre: m[4] ? m[4] === "rc" ? 2 : 1 : 3,
    preNum: m[5] ? parseInt(m[5], 10) : 0
  };
}
function cmpDsh(a, b) {
  const va = dshVerRank(a), vb = dshVerRank(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i];
  }
  if (va.pre !== vb.pre) return va.pre - vb.pre;
  return va.preNum - vb.preNum;
}
function hasChatSnapshot(props) {
  return !!(props && (typeof props.useChat === "function" || typeof props.useSession === "function"));
}
function getChatSnapshot(props) {
  try {
    if (props && typeof props.useChat === "function") return props.useChat((s) => s);
    if (props && typeof props.useSession === "function") {
      const s = props.useSession((x) => x);
      return s && s.chat ? s.chat : s;
    }
  } catch (eSnap) {
  }
  return null;
}

// src/core/session.js
var React2 = __toESM(require("react"), 1);
function sessionLineageRoot(byId, id) {
  let cur = id;
  let guard = 0;
  while (guard++ < 64) {
    const s = byId[cur];
    const p = s && s.parentId;
    if (p === void 0 || !byId[p]) return cur;
    cur = p;
  }
  return cur;
}
function familyOfSession(sessionId, ctxSessions) {
  try {
    if (!ctxSessions || !ctxSessions.list || typeof ctxSessions.list.getSnapshot !== "function") return null;
    const snap = ctxSessions.list.getSnapshot();
    if (!snap || !snap.byId || !snap.byId[sessionId]) return null;
    const ids = Array.isArray(snap.ids) ? snap.ids : [];
    const depth = {};
    for (let pass = 0; pass < 64; pass++) {
      let changed = false;
      for (let i = 0; i < ids.length; i++) {
        const id0 = ids[i];
        if (depth[id0] !== void 0) continue;
        const s0 = snap.byId[id0];
        if (!s0) continue;
        const p0 = s0.parentId;
        if (p0 === void 0 || !snap.byId[p0]) {
          depth[id0] = 0;
          changed = true;
        } else if (depth[p0] !== void 0) {
          depth[id0] = depth[p0] + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const root = sessionLineageRoot(snap.byId, sessionId);
    const versions = [];
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const sj = snap.byId[id];
      if (sj && sj.origin === "subagent") continue;
      if (sj && sj.blank) continue;
      if (depth[id] === void 0) continue;
      let cur = id;
      let g2 = 0;
      let ok = false;
      while (g2++ < 64) {
        if (cur === root) {
          ok = true;
          break;
        }
        const s5 = snap.byId[cur];
        const pp = s5 && s5.parentId;
        if (pp === void 0 || !snap.byId[pp] || depth[pp] === void 0) break;
        cur = pp;
      }
      if (ok) versions.push(id);
    }
    if (versions.indexOf(sessionId) < 0) versions.unshift(sessionId);
    versions.sort((a, b) => {
      const da = depth[a] !== void 0 ? depth[a] : 999;
      const db = depth[b] !== void 0 ? depth[b] : 999;
      if (da !== db) return da - db;
      const sa = snap.byId[a] || {};
      const sb = snap.byId[b] || {};
      const ta = sa.updatedAt || 0;
      const tb = sb.updatedAt || 0;
      if (ta !== tb) return ta - tb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const index = versions.indexOf(sessionId);
    return { rootId: root, versions, index: index >= 0 ? index : 0 };
  } catch (e) {
    log("warn", "pager", "lineage \u6D3E\u751F\u5931\u8D25", { sessionId, err: String(e && e.message ? e.message : e) });
    return null;
  }
}
function listVersionFamilies(ctxSessions) {
  try {
    if (!ctxSessions || !ctxSessions.list) return [];
    const snap = ctxSessions.list.getSnapshot();
    if (!snap || !snap.byId) return [];
    const seen = {};
    const out = [];
    const ids = Array.isArray(snap.ids) ? snap.ids : [];
    for (let i = 0; i < ids.length; i++) {
      const root = sessionLineageRoot(snap.byId, ids[i]);
      if (seen[root]) continue;
      seen[root] = true;
      const fam = familyOfSession(ids[i], ctxSessions);
      if (fam && fam.versions.length >= 2) out.push(fam);
    }
    return out;
  } catch (e) {
    return [];
  }
}
function invokeOpenSession(ctx, id) {
  try {
    if (ctx && ctx.uiWorkspace && typeof ctx.uiWorkspace.openSession === "function") {
      ctx.uiWorkspace.openSession(id);
      return true;
    }
  } catch (e1) {
  }
  try {
    const uiW = ctx && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : null;
    if (uiW && typeof uiW.openSession === "function") {
      uiW.openSession(id);
      return true;
    }
  } catch (e2) {
  }
  try {
    if (ctx && ctx.sessions && typeof ctx.sessions.open === "function") {
      ctx.sessions.open(id);
      return true;
    }
  } catch (e4) {
  }
  try {
    if (ctx && ctx.workspaces && typeof ctx.workspaces.openSession === "function") {
      ctx.workspaces.openSession(id);
      return true;
    }
  } catch (e5) {
  }
  log("error", "session", "\u6240\u6709 openSession \u9014\u5F84\u5747\u4E0D\u53EF\u7528", { id });
  return false;
}
function useVersionFamilies(ctxSessions, props) {
  const [vaultFamilies, setVaultFamilies] = React2.useState([]);
  const [loading, setLoading] = React2.useState(true);
  const [versionTick, setVersionTick] = React2.useState(0);
  const propsRef = React2.useRef(props);
  propsRef.current = props;
  const sessionsRef = React2.useRef(ctxSessions);
  sessionsRef.current = ctxSessions;
  const isFetchingRef = React2.useRef(false);
  const fetchVault = React2.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      try {
        const r = await fetch("/bubble/vault/families", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        });
        if (r.ok) {
          const data = await r.json();
          if (data && data.ok && Array.isArray(data.families) && data.families.length > 0) {
            let snap = null;
            try {
              const sRef2 = sessionsRef.current || serviceRefs.sessions;
              snap = sRef2 && sRef2.list && typeof sRef2.list.getSnapshot === "function" ? sRef2.list.getSnapshot() : null;
            } catch (e) {
            }
            const sanitized = data.families.map((fam) => {
              let t = fam.title;
              const sid = fam.sessionId || fam.rootId || "";
              if (!t || t.startsWith("session-")) {
                const snapItem = snap && snap.byId && (snap.byId[sid] || snap.byId[sid.replace(/^session-/, "")]);
                t = snapItem?.displayTitle || snapItem?.title || "\u672A\u547D\u540D\u5BF9\u8BDD";
              }
              return Object.assign({}, fam, { title: t });
            });
            setVaultFamilies(sanitized);
            setLoading(false);
            return;
          }
        }
      } catch (e1) {
      }
      const candidates = /* @__PURE__ */ new Set();
      const sRef = sessionsRef.current || serviceRefs.sessions;
      const curProps = propsRef.current;
      try {
        const cur = sRef && sRef.current || (curProps && typeof curProps.currentSessionId === "function" ? curProps.currentSessionId() : null);
        if (cur) candidates.add(cur);
      } catch (eCur) {
      }
      try {
        const snap = sRef && sRef.list && typeof sRef.list.getSnapshot === "function" ? sRef.list.getSnapshot() : null;
        if (snap) {
          if (Array.isArray(snap.ids)) snap.ids.forEach((id) => candidates.add(id));
          if (snap.byId) Object.keys(snap.byId).forEach((id) => candidates.add(id));
        }
      } catch (eSnap) {
      }
      try {
        for (let li = 0; li < localStorage.length; li++) {
          const lk = localStorage.key(li);
          if (lk && lk.includes("session-")) {
            const lm = lk.match(/session-[0-9a-f-]{32,36}/i);
            if (lm && lm[0]) candidates.add(lm[0]);
          }
        }
      } catch (eLs) {
      }
      try {
        if (typeof window !== "undefined" && window.location) {
          const urlMatch = (window.location.pathname + window.location.hash + window.location.search).match(/session-[0-9a-f-]{32,36}/i);
          if (urlMatch && urlMatch[0]) candidates.add(urlMatch[0]);
        }
      } catch (eUrl) {
      }
      if (candidates.size > 0) {
        const sidList = Array.from(candidates);
        const fetches = sidList.map(
          (sid) => fetch("/bubble/vault/list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sid }),
            keepalive: true
          }).then((res) => res.ok ? res.json() : null).catch(() => null)
        );
        const results = await Promise.all(fetches);
        const fallbackList = [];
        const clonedFromSet = /* @__PURE__ */ new Set();
        let snap = null;
        try {
          snap = sRef && sRef.list && typeof sRef.list.getSnapshot === "function" ? sRef.list.getSnapshot() : null;
        } catch (e) {
        }
        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          const sid = sidList[i];
          if (res && res.ok && res.manifest && Array.isArray(res.manifest.versions) && res.manifest.versions.length >= 2) {
            const m = res.manifest;
            if (m.clonedFrom) clonedFromSet.add(m.clonedFrom);
            let displayTitle = m.title && !m.title.startsWith("session-") ? m.title.trim() : null;
            if (!displayTitle && snap && snap.byId) {
              const snapItem = snap.byId[sid] || snap.byId[sid.replace(/^session-/, "")];
              if (snapItem && (snapItem.displayTitle || snapItem.title)) {
                displayTitle = (snapItem.displayTitle || snapItem.title).trim();
              }
            }
            if (!displayTitle || displayTitle.startsWith("session-")) {
              displayTitle = "\u672A\u547D\u540D\u5BF9\u8BDD";
            }
            let latestTime = 0;
            m.versions.forEach((v) => {
              const t = v.updatedAt || v.createdAt || 0;
              if (t > latestTime) latestTime = t;
            });
            fallbackList.push({
              rootId: sid,
              sessionId: sid,
              clonedFrom: m.clonedFrom || null,
              workspaceId: m.workspaceId || null,
              title: displayTitle,
              updatedAt: latestTime,
              currentVersionIndex: typeof m.currentVersionIndex === "number" ? m.currentVersionIndex : m.versions.length - 1,
              isVault: true,
              versions: m.versions.map((v, idx) => ({
                versionNumber: v.versionNumber || idx + 1,
                createdAt: v.createdAt || v.updatedAt || 0,
                summary: v.summary || `\u7248\u672C ${v.versionNumber || idx + 1}`,
                isCurrent: idx === m.currentVersionIndex
              }))
            });
          }
        }
        const filteredList = fallbackList.filter((f) => !clonedFromSet.has(f.sessionId));
        if (filteredList.length > 0) {
          filteredList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setVaultFamilies(filteredList);
        }
      }
    } catch (eFallback) {
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [versionTick]);
  React2.useEffect(() => {
    fetchVault();
  }, [fetchVault]);
  React2.useEffect(() => {
    if (!ctxSessions || !ctxSessions.list || typeof ctxSessions.list.subscribe !== "function") return;
    const unsub = ctxSessions.list.subscribe(() => {
      setVersionTick((t) => t + 1);
    });
    return () => {
      try {
        unsub();
      } catch (e) {
      }
    };
  }, [ctxSessions]);
  const families = React2.useMemo(() => {
    const list = [...vaultFamilies];
    const seen = new Set(list.map((f) => f.sessionId || f.rootId));
    try {
      const lineageList = listVersionFamilies(ctxSessions);
      lineageList.forEach((lf) => {
        if (lf && Array.isArray(lf.versions) && lf.versions.length >= 2 && !seen.has(lf.rootId) && !seen.has(lf.sessionId)) {
          list.push(lf);
          seen.add(lf.rootId);
        }
      });
    } catch (e) {
    }
    return list;
  }, [vaultFamilies, ctxSessions, versionTick]);
  return { families, loading, refresh: fetchVault };
}
async function restoreSessionVersion(fam, targetVersion, props) {
  if (fam && fam.isVault) {
    const res = await fetch("/bubble/vault/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: fam.sessionId,
        workspaceId: fam.workspaceId,
        targetVersionNumber: targetVersion.versionNumber,
        storageMode: fam.storageMode
      }),
      keepalive: true
    }).then((r) => r.json()).catch(() => null);
    if (res && res.ok) {
      if (props && typeof props.openSession === "function") {
        props.openSession(fam.sessionId);
      } else {
        invokeOpenSession(null, fam.sessionId);
      }
      return { ok: true, isVault: true };
    }
    return { ok: false, error: res?.error || "restore-failed" };
  }
  const targetId = typeof targetVersion === "string" ? targetVersion : targetVersion.id || targetVersion.sessionId;
  await fetch("/bubble/unarchive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: targetId }),
    keepalive: true
  }).catch(() => {
  });
  if (props && typeof props.openSession === "function") {
    props.openSession(targetId);
  } else {
    invokeOpenSession(null, targetId);
  }
  return { ok: true, isVault: false };
}

// src/features/bundle-config/index.js
var React4 = __toESM(require("react"), 1);

// src/core/icons.js
var Primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);
function pickIcon(...icons) {
  for (let i = 0; i < icons.length; i++) {
    if (icons[i]) return icons[i];
  }
  return function EmptyIcon() {
    return null;
  };
}
var IconCheckOutline = pickIcon(Primitives.IconCheckOutline16, Primitives.IconCheckOutlineRegular);
var IconCopyOutline = pickIcon(Primitives.IconCopyOutline16, Primitives.IconCopyOutlineRegular);
var IconChevronLeftOutline = pickIcon(Primitives.IconChevronLeftOutline14, Primitives.IconChevronLeftOutlineRegular);
var IconChevronRightOutline = pickIcon(Primitives.IconChevronRightOutline14, Primitives.IconChevronRightOutlineRegular);
var ICONS = {
  edit: "data:image/png;base64,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",
  recall: "data:image/png;base64,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AruXyS9L0RkFY33ff0uK8a/E0vX03LCFfF23gt2aAg7bcLV4FseSeDz+WUVFxfPZbPYWubbnyrmDRSeRSyaTRgOOhx56KFxStHr1al2q4tl7TcABAACATck5AAC+C1fAocWvBhy250ZhTNhYVI69cePGmV/84hemU6dORorsXCKR6GDWhhtXStH9kOd52nNjjll3FkJxkLG+cKO+hRi1cX2uUp/dzuCw10bHaegxU67vxEwm8/dkMjnM9/2j5NzOopkIWrRoYU466SSjfVE0zKiK7HajogGH6+8EAAAA+K6cAwBgQ7i+qbfLUqLf6uuxfV2f61awn332mZk0aZIZPXq06du3b0yK65xZuyzlxHg8foUU3veLSVKEzywU5LaIL7UkZUvtuaHq+rmiIU80zKgx3vO85UIDIw2OtGnrxWKg2CORSLRp2rRptn379qZ3795m+PDh3vPPPx9u66szOAqzOMJ7qecK551/NwAAAMB35RwAABvCFXDYnhv67b42pSyc9ws8nc0xceJEc9ddd5krr7wy7LnRsWPHBlJc624p+5nCshSduZFOp6ekUqlSPTe0cNflFjbgsI1F6xoEuAKFclPXz2UDDrsV7Ori8b7vL0skErOTyeRbcl0fNvklQP8r9hJtWrRokevTp0/s5JNPNr///e/NfffdF27dq/dSZ9woG2joOUXAAQAAgE3BOQAANoQr4NCZGxpuaPNQXb5QGKPbwIY9Nz799FNz6623mkGDBuluKaZz584VuVxOe270FieJEWKsLksJgmC2+Faer1Oom7UhxyqzZffcUHX9XHbmRnR2S/Tf6HawczKZzNRsNjs2Ho+PNPlrrk1F24nsrrvuGpx//vnmwQcfNC+++KL54IMPvLlz54b3VYMrZQON6I4qrr8bAAAA4LtyDgCADeEKOLTg1WULOlMjUvyGMzj0+bPPPmvOPvtsbSZqEolEOhaLtfM8r5cW2vL8D3JujDzq0omvShXoZu1sjSqz7nKM+hxi1GZDAg4b/BT33NDHhXJt30ulUo8mk8mr5boPkXM/FhowVTZq1Mg75phjzD/+8Y9w297CrimevY/FS1Jq+zsAAAAAvm/OAQDgUteeG+tbqqBbjE6fPt28/vrr5rrrrjM/+clPYolEIiNFdRuxjzhRw41MJqNbwb4Rj8dnm5o9N2zRvrxwfkOXpNS3wGND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WWb9PTeiSy/qWvjXt8DD9b5Lzdqws1nWGa89N3Tmhud5003Nnhv95Lrv2LJly2bdu3cP9t9//3Ar2Ndee03vW609N4r/FpixAQAAANSNcwCAjaeuMza0v0ZkxkbYc0NDjylTppi//e1v5ne/+50ZMGCA37lz54ZSXOvMjV4mvxXsKCnCH0mlUtpzY1aJnhtVheJdw43/pufGlh5wRHtu1Bgr13VVIpGYn06nP4zH4+NNvueG3Qq2e8OGDcOeG2eccYYZOXKkefzxx82XX34ZvYdhzw1djmLvcVGQtc7fCAEHAAAAsH7OAQA2HlfAob02Fi9eXL0VbFWk58bs2bO9u+66ywwaNMjssssupkOHDpUVFRU7mPyyFO25MdIUem5IMf5VoedGqZkIdhaHnangCjBcr5cz1/suFXBEd5Sx41bL9VyQTqffz+VyT0WWpVT33OjWrVvy7LPP9saOHWumTp1qPv/88zDEKNxfz95/vc92lk5k6VHJvxECDgAAAGD9nAMAbDrFxezy5curv9nX1wvbxHpaEL/88stm2LBhpmfPnlJPm5zJL0vpLU7xfX+EFN0Px+Pxt+R4jll3WcpKU7OXxJYaaLgUf67i3iN2iYp93Z5b5HneNLm+TycSCRtuHCLnusViMe254R9++OHm1ltvNV988YXeu7BXij7qfdWZOXpfdfbG+pYnEWgAAAAAG8Y5AMD3p7bCNfptflEvhho9N959913z3HPPmRtuuMEceeSRMSmmbc+NH4mTNNxIp9MPZbPZN5LJZG09N5YblqQUfzZnz40gCGzPjQni/0yh54ac69mqVaumO++8c/CTn/zEDB8+3Lz44ot63zTYiBX4GlrZWTn6nIADAAAA+H44BwD4/rgCDi14tfDVngwaclSt7dcQNqR88803zU033WTOOeccc/TRR/tdu3bVnhvbiz6m0HNDPBKPx9/UcGM9PTe0kLc9N7b0GRyu91382TTcWFFQI+TwPG+lXNO5uhVsIpH4l8k3FLU9N7rlcrmm2nND780f//hH8+STT4bLUgr31y8Ie6fo7A2dxVGqqajr7wQAAABAac4BAL4/roBDi1777X4h4KjecWPBggXe/fffb0488UTTtWtXs+2221bIfxpu9DVre248It6SYny27/vL5HF9hf2GbAPrer2cud53qYDD7igTDThWyfVcmEqlPtCeG7osRa6tDTe050aj7bbbLv7LX/7SPPLII+HONrodbKTnRvU91kcNOdbXc8P1dwIAAACgNOcAABtPcSGrRW902YLdSUUDj4kTJ5qLL77Y7Lbbbp4U1FnR3hS2gtVlKboVrBTeb8rxbLGsqIDfkJ4bdQkG6qvizxUNeuzrqyOv2+OFYnoQBE+Lv5jCspRYLNYjmUw2qaioiB100EHmr3/9q/n000/13lXP2NB7qEGHzsqh5wYAAACw8TgHAPjvuWZsaKChRa/SQrjwmlcQ9tzQZSm63OH66683/fv3D5o2bVopxXVHsZ84yfO8UdpQNJfLac+NmXJsww3LbgNb154bpYKA+sL1vos/u+25sc42sCoWiy2Px+ML5PFDs7bnhs7c6Cd6tm7duvkee+wRP/TQQ8OeG88880zYBLYq0nND7+3XX38d0rCKgAMAAADYOJwDAPz3XAGHFr86OyOyJCVaHHtvv/22ufHGG80ZZ5xhDj/8cK979+4NgyDQrWC158bJJt9z41E591YymZwtj0tKFOp2u9OVhoCj+LOvt+eGvpZIJOZpz41UKjXO87xoz43ucr2b/uhHP0qed955YV+UcePG2dkbap2eG4qeGwAAAMDG4xwA4L9Xl4DDfrtfCDhUGHB888033pgxY8zJJ59sOnfubFq0aFGRzWY13NCeG0PFKCm6H5XHd8Qceb5cRIv04pkKde25UZegoFy53nddAw59viCZTH4g1/wpefyT7/u6LOUQ0U00btu2bXzo0KHhPdJgY86cOTV6buiMHNtjI/qcgAMAAADYOJwDAHx/igtZfYwEG2ERrL0a5s+fbyZPnmyuuOIKs9dee63TcyMIgpHacyOVSr3ped5XZu1WsDbMWFk4Z7c83ZDC3xUi1CfFn6u450aVWfcz6zVbJKb7vj9e2J4bh8l131F3S2ncuHFw4IEHmmuvvdZMmzbNLikKZ93YGRt2SUpk6dF6/w4AAAAAfHfOAQDqzjVjwzYR1cJXnxde0+JYlzOYBQsWmClTppiHH37YXHPNNWbAgAFB69atG5i1PTfCZSnJZHJsNpt9M5VKzZICfHmJot723CjVWLQuQUB9UTwjw/W67bmxstR47bmhy1Li8fgHcqxbwWq4UaPnxj777BPv37+/+f3vf2/+9a9/aSBl75/uduPrfdWQSgMODToIOAAAAIBNwzkAQN25Ag7bc0O3gtWgo2rtN/9aHHsffPBB2M9hyJAh5qCDDvK6devWIJVK6VawvcVJJr8V7KNSiL8thfhXQRAs9TyvVOFvi/gtfQbHhgYcdknKMrNuY9FV8Xh8bjabfTeTyTwp1/hPcu5McZDoLprutddeyQsuuMDceeedZsKECebjjz+299eGHJ7eZxti0XMDAAAA2HScAwDUXV0DjlI9N6Qg9p544glz6qmnmh122ME0bNgwl0qltpPC+sfiFDFCiu6xJt9zY26hUI8W9dEi385WKNV3wxUa1CcbGnDY5TvLTc3tYMOtYOPx+PvZbPafct2v933/l3LuJ6KLaNyyZcvgxBNPNA899JCZNWuWWbRokQ2pQjpzw87WiP4dEGIAAAAAm4ZzAID1cxWyeq642WRxzw2dzTFz5syw58bIkSNNr169YmZtz439xElSeI/IZDIPiTdisVi054Ytzm3RbpdebEjh7woRyk1dP1dxyFPy53met1IslOfT5fFp3/f/KM813DhYrnv3hg0bNmndunXw4x//OLw/77//frTnhq/3UGdr6H1kSQoAAACw+TgHAFg/V8Bhe25o4auzNwrnq3tuaFE8ceJEc++995oRI0aYY489NmjXrl1DKa515kYvk1+WMkoK7YczmYz23JipfSJKFPXRgKMuO6VsLQGHXapTsueG7/srtOeG+ECePy3n/mzy4cb/iK6tWrVq2qtXr/jxxx9vLr74YvPkk0+GMzcK9y8MOPS+01QUAAAA2PycAwCsnyvg0Nka2nDSfrtftTbcCBtS/vvf/zY333yzGTx4sOnbt6/XpUuXBoWtYHVZSthQVDwmxfdbQRDU1nPDNs8s1XPDFQS4AoVyU9fPZQMO23C1eBbHGrmeC+R6h1vBynMNN7TnhoYbnUWjPfbYI6E9NzSAeuGFF8KeG5EAw4veZw2y6LkBAAAAbD7OAQDWzxVw6AyOJUuWhCFH0a4pMS2Gn376afPLX/7SdOrUyctkMhXxeHw7z/M03Bji+/5IKbrHyrH23Jhj1p2FUNxfo1S/jfoaYtRmQwIOG/wU9ytRi+Uaf5ROp8clk8k/ynU+y+QbimrPjYZNmzb1jzvuOHPfffeFPTf0Hq5YsaI61NAZOXoP7fIjQgwAAABg83IOAFBTXXpuaJhRapw+161gP/3003BpyrXXXmsOOOCAmPxXIUV1B1PYCjYIgpHZbDbsuaEzN0x+BoItzG3RHl2S4mokWp/Djrp+rmjIs76eG2s8z1vu+7723Jgmxpv8VrAabvSLx+M9mjZt2qRjx46xvn37miuvvNK8+eab0Vk3Mb2HuhRFl6po6BHtqVLqb4TAAwAAANg0nAMA1FRb4arhhi5V0FkbJXpueHp+0qRJ4Tajl19+uRk4cGBs++23154b0a1gR+nMDdtzQ54vK1HUawGvsxLoubFuwFFbz43lur2uXNf3YrHYU3IuuhVsj2byX+/eveOnnHJKeH90V5s5c+bYexgr3Mcw4NDdcHTZUWRmTsm/EQIOAAAAYNNwDgBQU12WpOi3+5EdNap7bnz22Wfmb3/7mxk0aJDZZ599vE6dOjXI5XKdpLjuK4aYfM+NR8U7UoDPEevruaHFu+23QcBRc/aG7bmxqujfrNTZMJlM5i255o8kEolr5Nzp4kBT2Ap25513Tpx//vlmzJgx5rXXXgtn2hQFVeESFb2vej66Nez6/kYIOAAAAIBNwzkAQE2uGRz67b6GHJHXwxkcevzcc8+Zc845x3Tt2tXoshTf93W3FNtzY5QU3WPl/NtyPNfkZyFEi3nbRNQW7dHlGPZcfQ0xalNbwFHcg8QGP8UzOPR4nlzbd5PJ5KPiajkeKg4QGjA1lP9i/fv3N3fddVfYc8P217D3VmfmKHuOAAMAAAAoL84BwNautkJWz+m3+FoM274bhdeqm1HOmzfPfPTRR+GMgOuuu84cdNBBcSmwK01+K9je4hQpvEdlMpmHs9nsm7qEwtQMN2zxrrMSVpi1IUddZzbUt8DD9b5Lzdqws1nWGev7/jKdDeN53rty/LgYbfKzZfoGQdC5RYsWDbt27ervv//+5tJLLw2XEFVFtoHVe6jBhu6Eo8tSSu2UwowNAAAAYPNzDgC2dnWZsaHNJnVJSmGM7dfgaTGsBfOtt95qLrroIjNgwIBYp06dGklxbbeCPUVcLUW4ziqYmkqlZpXouVFlvlvPjS094LAzNlYVj9VwI5FIzJLrOjUejz9i1oYbvcX2jeS/Pn36xH7xi1/8f/buA0qKKusD+K3UcWYYsjCS0zioLIpiQoIgKBgABXRVgqjgml1Z9fNTUUwkBdZdFeHDnMlJFzGLLiBRwIAgOUdJAzjfvVX9hpqiu2sGUadn/pzzO91d/QhTzal67/Z7/0eDBg2yMzfWr1+vPkM9xl6Ooj5jTyHrqP8jKHAAAAAAAPw5fBsAlHZ+BQ5ZjiLf7ru2gs3P3Ni4caP2yiuvUPfu3en000+n2rVrl0lPT5clEa1ZHyZLJSazxTwY3xTL3EhUsFBLVFDgKFjgkOKGKv64f89BPp+bwuHw/Gg0Oi4YDA4ip6DUgtVmGTk5Odadd95J48ePl91SaPXq1XYRI/b5au7PWc3SUdvCJvo/ggIHAAAAAMCfw7cBABTkHczK8gVXoKh9jJ9r8vrLL7+ke++9l04++WQeT1NabGAtMzdu0nV9SCgUmmBZlmRubI4N0t0DeDUzoaQXNPz86nmMlzvifi3kXG7VNG2xzNxgqrgh5742H08vU6aMdtlll9mhr2vXrpXPTmWlaPIZyswc+VzjLUnx/j/w+z8DAAAAAAC/P98GAKVNsoGrHFOZG56Bb4HMjW+//ZY+++wzGjFiBPEg2kznXzywrsWay0BbihvhcHhCWlra/GAwuJGOFDfUgP0QHb0bSEktcPj9u70/m1/mxj6ZuSHFDSqYudGK36tfpUqVMo0aNdLatm1LDz30EH3xxRfyuanMDXtpkTtzQ5anoMABAAAAAFD8+TYAKG38Chwy+JXlKK4lKSpzw85rmDdvHr344osk241eeeWV+kknnZTJg+u6rCXFMjd48D0pEAgskswNy7L2xRmoq6UXKlvCr4Dh935x5vfv9v5sqviT6/09fF73B4PB9ZFIZJ7sSENHihty7uump6dntmjRwrjjjjvswFfJ3JBlKXkFMzfs7BRZeoQZHAAAAAAAqcO3AUBp41fgkEGve0eNPFfmxvbt27U333yTevToQTk5OVStWrX0tLQ0KW5cEBto52du8GB8i67rBxJkbgjvNrAocCQvcBzkc7k5FArN53M+NhAIDKQjmRuyY01G3bp1jVtvvZUmTpxIy5Yto3Xr1rkzNwp8/lK8UoGiKHAAAAAAABR/vg0ASjvvQFaKGjKLQ2VuyCO/1uQb/9mzZ9vLHho3bqzxgDrKasoAmwfeN5qmOSgcDo/ngfdCPubeClYN3NWMjcIUNApTGEhV3p/LXeiJ9746d1vYYj7PkrmhihsX6Lpej8+5hLvqF198MT333HO0atWqAjM25DOUQofMysGSFAAAAACA1OTbAKCk85uxId/iy6BXqKJGnrOkwc7dkMyNBQsW0AcffEDDhw+nzp07W+XKlcsgJ1D0fNZb0zTJ3BgfjUbtzA1+fcAzqC9q5ka8gX6q8Pt3e392lblx1DawQnaesSxLdqCRsFaZHSOzZHqTEyhav2rVqplnnHGG0aFDB7v49PHHH8vnWCBzQz7b3bt326R4hQIHAAAAAEDq8W0AUNL5FThkwCvLUeTb/diSFJW5YQ+OFy5cSCNHjiRZ+tCxY0ctJycnkwfbsiylBbueDWaTeBC+UIobpmkej8yNwhQKiiu/f7f3Z5fzIYWfozI35FggENgYiUQWyI405BQ31LKUuny+M88//3zz73//Oz3//PP0/vvv08qVK9VnmD+DQ4pYMoMDmRsAAAAAAKnLtwFASVeYAod8s+/K3MgvcPBxbezYsdS7d29q0KABnXDCCWnRaFSKG61iA+2BmqZNJCdzY7PM3PBkbnhnKhQ2c6MwhYLiyu/fnazA4d45RZ5vDQaDi9LS0ibw4yA+t3LOJVBUZs9kVK9e3bjpppto/PjxdmFj06ZNBTI35POVWTnqUT1HgQMAAAAAIPX4NgAobbwDWbVERb0vryVvY/v27TRnzhwaMGAANW3aVDI3IqwGxbaCNQxjYDQaHccD7wVS3KDEW8GqLU+LMvD3KyKkEu/P5c3cyKOCP7M6dzvYMl3Xp/K5lpkb9lawpmnW4/OekZmZqV144YX2sqHly5fLZ6cKU/mZG1K02r9/v3vpUcL/BwAAAAAAULz5NgAoafxmbEgBQ2ZtyMA3tg2syM/ckMLGN998Y+/E8fTTT1OXLl2MKlWqSOZGTdaMYstSgsHg+LS0tHmyFazsluIZ1KslKQcofrBoYQoBqSLZbBTve0JlbhyM014yNw4EAoGtpmku5dfT2XB2Ezk71dSrWrVq2XPOOUfv3LmznbkxY8YMKWaoJSl2gUM+VyluyMwcKXSgwAEAAAAAkPp8GwCUNH4FDpW5IVvByvM8T+bG0qVL7cwNWfrQvn17ydzICAaDsg3p+awXG8Qm8UB8IQ/EN0nmhqZp8Qb9ahBf0mdwFLXA4Q5cdc/iEIcsy9oSjUa/DYfDMnNDihs3k7MkqK6u62XOPfdcs1+/fvTyyy/Thx9+qDI31OdoU5+zFLGQuQEAAAAAUDL4NgAoaQpb4JBv92OZG0KKGzoPiLXJkyfbxY169epR2bJl00OhkOQ9tCBn5sZTPMiWsMvFTJaleGchxJutEC93w69okEqOpcChZrd4Mze2W5a1JBqNTgkGg8/wuZbiRhsmuScZVapU0a+//no7c2P9+vW0Y8cOu4ihPl+ZqaFm5bj/H6CIAQAAAACQ+nwbAKQ6v4GsHHMHTMoA2FXYsF/v3LmTNmzYQHPnzqWBAwfS+eefb/CAOo2OLEvpyQPvJ3jg/W44HP7GMIyNsQG6e3DuXZLiV9RI1YJHsoJGvPfjZW6odvajpmm5bBs/X8aP03Vdl5kbf2Pt+LznZGZmlq1SpYrRunVrGjJkCC1btqzAkhSVuSGzciQ/BUtSAAAAAABKHt8GAKnOr8Ahg12ZtaG2CI0dVwNke1AshY13333XHjxfddVVRvXq1cuQs1PH+awnezIQCLwXjUbnhsPhdYZh7PcM1v0yN/wKAX5FheKkKD+XKnAkzNyQ/BI+t5sty/pW07Rp5GRuSHHjQnZS5cqVKzRr1sz861//Sg8//DBNnz5dPjN3gUOXz1i2+UXmBgAAAABAyeXbACDV+RU4pKghg1+ZpRFbzqAGx6Y8/vDDD/Tiiy+SLH1o06aNdtJJJ2VGIpF65OQ+9CYnc2M8D8Tn8yB8g2mae+NkbuS5BvLxMjf8CgF+RYXipCg/l0iaucHnc3M0Gp3P53wCP5fdUvIDRVnmmWeeGZDMjbfeeos++eQTWrFihbuAoan/A/I5SyELmRsAAAAAACWTbwOAVOdX4JAlKOrbfdfg1/72n19rH3zwAd1yyy1Uv3594oF2eiAQkEBRKW7ItqSDeNA9QdO0Bfx8U2yQ7h7UewsZiTI3Uq2IkYzfzxVvBofM3silI+clL/Z8G5/fxVLcCAaDg3Rdl4JSS4plblSsWFG/5ppr6J133qGNGzfa2Sm5ubma+mzl85QtftXyIxQxAAAAAABKLt8GAKnGbyArx1TYpGrjXrIgz2Ur2FWrVtGcOXNo6NCh1Lp1a5MH1ypzoznrbVnWIB54j2PzeBC+nkpv5oYo7M/lLfLE/bM0TTugMjfYNH4+lJyCUis+7/XKly+fWbNmTf2CCy6gJ554ghYuXOiedWPIZyqzcWRWjhSv3Jkqhf1/AgAAAAAAqcW3AUCq8Ru4qswNCZuMbQMr1ABZkwHx7Nmz6dVXX6XHH3+cunXrZtauXbssObMGWpCzLGWwaZoTw+HwglAotF62go0zqJelF6Uhc0MU9udyz9hQ56VAe13X9wUCgQ3BYHCRYRhT+NjT7AZyZm7UqVSpUpkWLVrYu6UMGDCApk6dSlu3blWfoRH7HO0Ch8zKkc9Z7ZxSlP8nAAAAAACQWnwbAKQav4GrDHZl0CvhoRI46VqSYmdu/PzzzzR69Gjq2bOn7JaiNWjQoEx6enp9cnIfZKA9mE3SNG2RaZqbYpkb8XYAUUWOkp65IQr7c6mZGypz45Dn9xzk87lRZsVEo9HxgUBAMjdk5oZallLmtNNOM//+97/boa+zZs2yMzc8hSpNfc4qc8MvVBQFDgAAAACA1OfbACDV+A1cZbAr3+7LTA2VzZAXm8Ehrz/++GO68847KTs7W+MBdrphGHU0TZPixk38fDAfm8CPC/n1Fjp65w9V0FDHSkPmhihKgUMVftwzW/Jir7fwuV0UCoUkc2Mgn/f8mRusTNmyZfUuXbrQa6+9RuvXr1cFDE19zvJaqIIGChgAAAAAAKWHbwOAVJBsICvHVOZGvG/yxbZt2+jHH3+kr7/+moYNG0bt2rUzLcvKIGcr2ObsBiluRCKR8bKjB7+3MTYgdw/iZbAusxJy6UiRo7AD/1QreBTl5/IWeY5qr2nafl3XpWD0LZvMZOaGLAVqZZpmPVmW0qBBA71169b06KOPSjaKextYYRc2ZFaOBI3G2ynFr/AFAAAAAACpzbcBQCrwm7Ehg1+ZseFakqLyGjTZZWPu3Lk0ZswYevjhhyVzw+DBtGRuyDakLWMD7SGGYdiZGyxR5oZaeoECx9EFDrUV7CFveyluBAKBjXxeF1qWNYmPqUBRe1lKuXLlyrZo0cLs27cvPfnkkzRlyhSZveEucNiZG/IZS3FDZW6gwAEAAAAAULr4NgBIBckGrjLYlcKGfLsvRY5Y4GR+5sa6deu0V155hbp3705nnHGGVqdOHZW50YbdFBtwy6wCCb3czPbzoDzRwP5YMzdKeoHDvaOM+/fk6rq+KRwOz09LSxsry1LIKSi1IGf2TPrJJ59s3nXXXTRu3Dj65ptv7N1tZImR6zO2MzekkCUzN1TmBgocAAAAAACli28DgFTjHcgKmaUhRQ418GWS26DL8y+++ILuvfdeatiwIcmAOjawbsX6GIYxJBQKTTRNcxG/3kwFl6XkuQbvKmQ0VQsWv1W8ooZ7K1g55t1NRmZ0bNE0bXEgEJjoKm6ozI30jIwMuvzyy+3ZNWvXrlWfsb3bjTyXWRvyucbbJQUAAAAAAEoX3wYAxVGyb+LlmAx41bf5rjaaarNlyxZasmSJXdwYPnw4XXrppWY0GlXFjebkZG4MjUQiE9LS0hbIEgpyZiC4B/RqG1j3biDJZmWU1Bkb3vdVYUPNZDmqrWwFy+d3kxQ3+LVsBSuzZCRQtBUfr1elSpXMU089VbvwwgvtZUOyW0pewcwNTWVuyFawUsBK9H8BMzYAAAAAAEoH3wYAxVGygavK3JA8Bs+SFDuvQX7PvHnzaNSoUfbMjS5duug5OTmZ5MwaaMGuZ4N5ED45GAwuDIVCG5JkbhyMQYGjYIFDZW7ken+PZG7wed0gy1Jk5gY5xQ1ZCiQzN+plZGTYmRu33347Pf300zR16lRavXq1fIYqd8OewSHFK8nbEPFCRf3+nwAAAAAAQMni2wCgOPIrcMiyhZ07d9pFDm/mxtatW7U333yTevToQSeffDJVr149PS0trQ4dCRQdxCTscgkPxrfoun5M+lFrAAAgAElEQVQgTuaGep1sG9jSWuAQiQocB/l8bg6FQvOj0ei42LIUtRWszJ7JqF+/vnHbbbfRxIkT7Vk269at82Zu5JPPVgWKosABAAAAAFC6+TYASAXugayQb/RlUKy2hZXH3NxcTY7JVrAPPvgg/eUvf+HxNKWxmux81psH3wPD4fA4y7IWSHGDjt4K9hAlnrHhN/D3KyKkEu/P5d0G1vu+PNqZG+xb0zQl10RlbrTi816PX5fJyMgwOnToQC+88IJ31ob9GcrnJ7NysCQFAAAAAAC8fBsAFAfJBq5yTL7Fl2UpMvBVRY08Z3Bs525s3bqVFi5cSDNmzLAzNzp37myWLVtWMjdqsWasl6Zpg0Oh0Li0tLR5soSCX+d6BvVqG1j3biB+BQy/94srv3+392dXy1KO2gZWGIaxzzTNTfwoYa2yI80QOhIoWq9q1aplmzRpordv354eeugh+uSTT+RzLZC5IZ+t5G0I+axR4AAAAAAAADffBgDFgV+BQ2VuCJm9kecUNuzMDWmzYMECGjlyJEmuQ6dOnbScnJwyuq6rzI1eTGYTTJKZG1LckMwNTdPiDeqTZW74FQL8igrFid+/2/uzJ8zcYAclpDUSicznczuenOLGjeSc+zrhcDjz/PPPt+6++27697//TdOnT6eff/5Zfb4qcyN/u1+BzA0AAAAAAPDybQBQHPgVOGTQKztqCPmmP88pcEjmhsHHtPfee4969epF2dnZVLVqVXfmhuQ/DNQ0bQI/LubHzbqu7+dH9+4f7mUWyTI3/AoBfkWF4sTv3x2vwCEzW6TA4T53cnyrhLWqzA0+vwUyN2rWrGn27duXJkyYQMuXL6eNGzfawaHq85UZOWp7X3mUQod6XZT/JwAAAAAAULL5NgAojrwDWflGX2ZxqOUpMgiWQbIEjc6ZM4cGDBhAZ555ps4D6igdydy43jCMgTzwHssD7/lS3IgN0NXgXO2Sogbt3qKG38Dfr4iQSrw/l7vQk+c65i4GSXFjG1sqO9LwuR5Msa1gTdOsF4lEMviX1rZtWxoxYgT99NNPakmRvSRFhcXKkhR3nkqy/wcAAAAAAFB6+TYA+DP4zdiQAobM1HAXNfJcmRvbt2+3t4KdPHkyDRs2TLaCNStXrpxBrswNNjAUCo2XzA1+XM+D8GSZG4eoZBc4/GajeN9Pmrkhs2Asy9psmua3/HoaOVvBqpkb9apUqVL2rLPO0i+//HI78FWyUfizVIGidoFDilay5Ehm5UihAwUOAAAAAABIxrcBwJ/Br8AhxQ3ZTUMGv1LkyDvyzb89OJbtRZ9//nnq06cPdejQQc/JyckMBAL1YgPs6ym2FSwPwBdKPgQ/7k2QuaF2TSnpMziKWuBwZ264Z3GIXMuyNkaj0QXhcHiCruuquNGC1TEMo8y5555r3nPPPTRmzBi7uLFixQr1+aoilaayVWT2BjI3AAAAAADAj28DgD9DYQscsnwhFioq7FDRffv2aTJz44YbbqD69etrFSpUSOfBdl1N01rJQJsfB/Igezw/yo4em/nxgCdzw13MOOzhV8Dwe7+4OpYChwpc9Z67bZZlLeZzPiEYDA7icyuBolJYktyTjKpVqxqShzJ27Fhau3atvcONO3NDZueogobK30DmBgAAAAAA+PFtAFAceAeyapmKel+eS7Fj06ZNNHfuXHrqqafonHPOMXhArbaCbcFuME1zUCQSGRcOh+cbhrE5NkB3D+LVzAQ1cC/KwN+viJBKvD+Xu9gTt72maXLOtrNlbKqu62or2FaWZdXNyMgoU7lyZa1169Y0dOhQ+u67747K3JDZGvI5YkkKAAAAAAAUlW8DgD+Ce+DqHbyqb/LdyxVi7+VnbkiYqBQ23n33XRoyZAh169bNPPHEEzN5cF2XYsUNNjgYDE6IRqPzw+HwesMwDngG6SpU9ACV/AJHUX4uVdxQszaOai/nMhAIbLUsa6mmadP52HBytoKVmRt1q1SpknneeecZV111FT388MP0/vvvSyHDnbmhS5FKzcpBgQMAAAAAAIrKtwHAH8GvwCFFDZW5IUWOPKewkT84/uGHH+jFF1+0l6W0bdtWk8yNSCRSnwfXF5BT3JDZBJN4IJ4scyPPNYiPFyrqVwjwKyoUJ0X5uVSBQwWuemdxHLYsa0s0Gv2WTeVzK8WNm5ksCZJlKWWaNm1qZ268/vrr9NFHH8mOKaqAkZ+5Ia9l6ZF8vvKIJSkAAAAAAFAUvg0A/gh+BQ717b7squGZwaHza01mBNx8882SuUEZGRnpoVCojqZprXlwfRM/DuZB9yR+bmdu0NHBmN7tTRNlbqRaESMZv5/L+75QW+a628s52mFZ1pJIJDKVz/szuq7/jY9dyCTUNaNixYr6ddddR2+//TatX79eFak09flKMUM+U5WzgSIGAAAAAAAcC98GAL8Hv4GsWpYihQ3Vxr1kQY7LVrCrV6+mOXPm0ODBg6lly5YmOZkbtclZlnKTaZpDeOA9gS00DGNTbIDuHsTLAF0tSVGvCzvw9ysiFDeF/bm8RZ54f9bhWDjrVn6+TJalsGHkzNxoa1nWSeXLl8+sUaOGdsEFF9iZKIsWLXJnbujymcqyIyl4SMioO1OlsP9PAAAAAAAAFN8GAL8Hv4GrytyQga98wx87rsdoMpNDChtvvPGGPXi+6qqrzFq1arkzNyTccigPtCdFIpEFoVBoY5zMDRnIy1KU0pC5IQr7c6kCh9ol5aj2uq7vl6U+wWBwET+fysekuNGXyayZ7EqVKpVv3ry52bNnT3rkkUdo2rRp9m4pea5lRfKZStaGytxAgQMAAAAAAH4L3wYAvwe/gassWZDihoSHyuA3dlwGxibTV65cSaNHjyYZQPNAmho0aJCZlpZWPzbAlnBLydyYomnaYtM0N7F9cTI31GD+EJX8zA1R2J9LBYomytw4yOdzYyQSmc/nfLxlWXKubyInc0MKTJmnnXZaQDI3JPT1yy+/JPm8XIWq/HBYKWpIIUstUSnq/xMAAAAAAADFtwHA78Fv4CoDXwmblNwN18DXnsEh7SWo8s4776Ts7GwKBoNRHnDXiQ2wb9J1fXAgEJjIj9/y6y0UPzfikOtYoryNVCxiJFOUAkeiXVPk9VbDMBaFQqEJfO4HaZomIa4qUDS9bNmyepcuXezZNRs2bLDzNvjzLJC5IUUN9bmigAEAAAAAAMeDbwOA4yXZQFaOqcwNFTbpfX/btm20fPly+u9//0vPPPMMtWvXzrAsK8qD6hrsfHaDytyIRqML+Pnm2IDcPYhXS1JU0KhfQcPv/eKsKD+XN1j1qPayLIXJOV3MJpMzS8YubvDnUL9SpUoZ9evX11q3bk0DBgygb775Rj47KUrJrBuZfWMXrSRzwxMWG/f/CAoeAAAAAABQFL4NAI6XZANXKWqoGRvyGGujAik1OSaZGy+99BL179+funXrpvNgugwPrmuRU9y4XgbchmFMCofDC9kG0zT3xxnUq1BRKXCoWRxFKQT4FRWKk6L8XO5lKYe87TVN2xcMBtfzeZ3P53UiOcUNWQrUktWtUKFC2ZYtWxp9+/alJ598kqZMmUIbN250f4Z25oZ8jlLcQKgoAAAAAAAcb74NAI4XvyUpKnNDHmPLF9S3//ratWs1KW50796dmjZtSnXq1EnnX7IkogXrxQYy2Qr2W8MwNrP9cTI31MD+WDM3SmqBQ83ckNku7h1lVNtcXdclc2NeWlra2EAgIOdaQlxbkLNjTcapp55q3n333TRhwgSaO3curVq1yl6GEvt885enyOcqMzeQuQEAAAAAAMebbwOAP4IMZmVALIGiroGtDIztzI3PP/+c+vXrRw0bNiRN08KsBg+sm7FehmE8EQqF3jNNcwG/liUUKnNDkQF7vMwNFZ6ZqgWM38JbuHHP4ihQ3GBbJaw1GAxK5oYUN1TmRj1Whn/pnTp1smfXrF+/XgoXGtNVkUJmbbh3SUEBAwAAAAAAfg++DQCOVbKBrByTAa98ky+PnqKG/Vy2FV22bBnNmjWLRowYQZdccokZ5V88qK7OzmM9TNN8MhKJvJuWljYnEAhsiA3I3YN4d+ZGaV6S4n3fHSTq3SXFbiuZGzIbRoob/HoKHcncuICP1z/hhBPKnnzyyXqbNm3sZUP8OdkFqTxnSUp+5obMypGtYCVcNNH/BRQ8AAAAAADgt/JtAHCs/DI3ZMaGZG7It/ux5Qr5mRvyWkIqR40aRffffz916dJFz87OlswNWRJxPjnLUp7iQfj4YDD4TSgUWidbwcYZqMvgXYob7lkcKHAUzNxwB7HapLghBSPJ3LAsSzI3hpJT3GjB6pUpUyazRYsW5m233UZDhw6lqVOn0tq1a9VnqMfYRQ35jGXZkRSzUOAAAAAAAIDfi28DgGPlV+CQwobsqCED4NjyhfzMjc2bN9Prr79OPXr0oEaNGlHNmjXTMzIy6pITaimBorJUYrymaQt5ML7BMIy9/Nw9E+FX1yMyN45+X52XeJkbh/h8bgqFQvPT0tLGBQKBQXQkUFRyTzKzs7Ot22+/3c7cWLRoEa1Zs8YuYng/e2/mBgocAAAAAADwe/FtAHC8uAeyQr7dlyUMKmwyNhjWZGbHV199RQ888IAUNzQeUKeRs1tKC9abB99P8eB7nGVZ8zVN2xQbpLsH8AdjClPQKExhIFV5fy7vNrCqyOF+LefNztyQmRux4oaduaHrej3TNMukp6ebl1xyCb344ot2YSPvyKyN/MKV2gYWBQ0AAAAAAPij+DYAKKxkA1c5JrM0pKghXDtoFMjckNkAM2fOpOHDh1PHjh2tzMzMDHKKGxIoej0PsgeFw+Fx0Wh0nmxbygNxVdxQ1DawB6hwS1LiFQJShd+/2/uzq2UpR20DK2RZimmaWwzD+JaczA21LKUVn+f6VatWLXv66afrF110ET388MP02WefyedWIHNDPluZlSOkUIUCBwAAAAAA/FF8GwAUll+BQwa88s2+LEmRb/fzjmRu2N/+L1iwgEaOHEl33nknderUSc/JycnkgbUsS2lBzrIUmU0wybKsBcFgcKNkbsTZCrY0zeDw+3d7f3aVuaF2mclvy+fxUCAQ2ByJRBbxuZXtdqW4IctSWrA64XA4s3nz5uZdd91Fzz77LE2fPt3eCjb2+eZnbkgRS2ZwIHMDAAAAAAD+aL4NAArLr8Ahy1Hkm33ZUSNW4MjP3Ni5c6f27rvvUs+ePSk7O5uqVq1aJi0tTbYhle1IZRbBQB6ES9jlYn7cLLMNPJkbbu5tYFHgKFjgUDvKFMgr4XO5IxgMLuZzPpEfB/Prm+hI5kZGrVq1zL/97W80ceJE+uGHH2jDhg12IcP9+apZOVLkUDvjoMABAAAAAAB/FN8GAMfKO5CVQa/M4nAPhOWbfil6zJ49mx555BFq0qSJTk7mhuyW0oIH2jcYhjEwHA6P5YG3ZG5spoKZGzJQP+gatJfkgoYf788VL3PD+1rO3Q72PZ/naaZpPs3PpbjRmp/X5/NeJiMjQ2/Xrp09c2PFihXuXVI0NWNDZuZIAQsFDQAAAAAA+LP4NgBIxG/GRpLMDTt3Y9u2bTRv3jx7i9Fhw4bRlVdeaVaqVEltBduc9WaDg8GgnbkRCoXW67oeL3NDihulLXMj3r/d+37SzA3DMPZbliWZG0v59QdsBOvLWrMGkrlx1llnGZdeeik9+OCDdjYKf5ZqWZG9na/MxJHihszKQYEDAAAAAAD+TL4NABLxK3BIYUMNfmXmRt6RzA17cLx48WJ64YUXSJY+8CBaa9iwYWYgEJBlKbI0QpalDGGTTNOUzI0NPBjfGydzQ83gOEgocHjfd2duFFjOw+fxIJ/rjdFodGE4HJ6s6/pwPn4zOcWN+nyuy5533nnWPffcQ6NGjaIPPviAVq5cqT5fNYvDnsEhhQ2ZxSGfNwocAAAAAADwZ/FtAJBIYQocUtwQ8jz2nl3g2LNnjzZhwgS64YYbqEGDBlSxYsV0HmxLceMCcsItB/OgW8IuF7PNsluKJ3PDO1OhtGVu/JYCxyE+l9uCweAiPucT+HEIn2uZudGGyWeQWa1aNVM+m3HjxtHq1atpy5YtBTI33DkbMjtHQYEDAAAAAAD+LL4NAArLO5CVx1iYqE0GxFLs2Lx5M82ZM4eeeOIJOueccwxyMjdkK9gW7EbTNAdHIpHxoVBoAQ+8N8cG6Gpw7s7ciLdTil9hwK+IkEq8P5e72JOovZyzbew7PrdTmdotpY1lWQ0yMjIyK1asaLRp04aeeeYZCRRVS4rsWTdSxJBCh1qS4lp6lPD/AQAAAAAAwB/BtwGA4h64egev8lqFiMrAV57H3svP3NixYwfNnTuXxo4dS0OHDqWuXbuaWVlZmeTs1NGcYstSgsHghGg0uiAUCm3wydwo6QWOos7YSJq5IbNgDMPYyud0CTmZG7IspQ85s2YaVKxYsfxZZ51lXnHFFfTAAw/Y2Sj8manlKPZ2vvLZyue4ffv2/KVHUsSSz1sehcpdEeoYAAAAFD+YfQkAJY1vAwDFr8AhA9o9e/bYu6LIQDjvSFaD/e3/d999RyNHjrSXpbRr107PyckpGw6H68cG2CpzYzIPwhcFAoHNpmnui5O5kRcbwKvMDRQ4ChY44mZusEN8Xrfwef2WH6eQEygqmRty7uuyzMaNGwduu+02Gj16NE2bNo2WLl2qlqXYn6MEjMquNzt37rSLHFLgkNfSxk2OKd73AAAAoHiQvpoqciTr8/n1DwEAihPfBgCKX4FDbpJS4JBgUXkee8/eUlS+6ZdBc9++falevXqUwb9CoZDkPUiopWxLOpgH3ipzYws5BQz3oN49yFeD+Xi5G35Fg1RS1AKHUIGr7vZSCNrO53dJMBicaprmM/z6FjqSuZFRvnx5/ZprrqG33nqL1q5da+9wI5+lmomjOkPyubpnaGCWBgAAQOrCDA4AKGl8G0Dplaygod6XG6M7bNK1NMV+Lt/0r1mzhmbPnk2DBg2iFi1amDKgJmdZiuyWchMPuIdEIpEJbAEPwjfFBuhqcK4yN9SSlHiD+mQDf78iQiqJ97Mny9w4LMtSyCkYLeVzOz0YDA7n8/031q5MmTInZWVlla1fv75+ySWX0IgRI2jFihVq1o0Ze7Q/S+kE+f1/AQAAgNTk7fMdT35/l9+/DQCgKHwbQOnldwNSW4TKUgTXLin5W4jKEgYpbLzxxhv01FNPUbdu3cyaNWuWJWfWgNoKdqhlWROluCGZGzwI92ZuqFkJiTI3UOBInrmxWdd1mRUznR//yef6Vj7WLj09/eTGjRtX4s8keN9999lLh+bPny+fnywnkuJGIPZoxD5PAAAAKKG4H+em+ThqNme82Z3qC7C8IvYvAQB+C98GUHr53YDk5iXLGCSTQZYv5B0pbtjf/q9YsYJGjRpFvXr1opYtW2rZ2dmZ0WhUMjfUshQ7c4MH4otN00yWueEOz0SBo/AFjq2WZcm5laU/w/j1LbquX8SPOZUrV67UqVOn6IgRI8yvvvqKVq5cqfHnqYobVp5T4LBiTAAAACiRjMOHDxvcj/OSYHFdHl20OH5TvgcKHABwvPk2gNLL7wYklXmZvSGZG64qvb2lqNzQZs6cSbfffjtlZ2dTOBzO4MF2XR5cS6hlHx5oD+GB90R+XMSv1Vaw7oKEN18jXt5GSSxiJJOowOFe0iOk4LFNCkeBQGAin+dB5BSUpLDUgJXNysqyrr/+en3ChAnazp07VWFKzzuy6437OQAAAJRQ3H/TuB+XCB2rwuR7oMABAMebbwMoXZLdcOSYytlQNy1vO9k+dOXKlTRnzhwaNmwYXXjhhQYPsNN4UF2bYlvBqsyNcDg8n59vJKe44R7EywDdvSTFL0i0pBY7EhU03Lkb6nyJ/WwnW8Pmapr2biAQeIzP8bX8+hx2Igswqlq1Kl177bX28qFVq1bRxo0b7c9Ndk6RpSr//e9/7c9w0aJF9jG3JUuWFOB9HwAAAIqHZcuW2eK9t3r1antHNL++4W/lLWj8Vsn+bL9/CwCUfL4NoHRJdpOQooZMOZRlKfIYayPf9NvbwMqURBkUv/LKKzRgwAC66qqrjHr16knmhmxDqjI3ZObG5HA4vDAUCq3n5/vjDOpl8K4KHIfiDPKTFQL8igapJFGBQy3VUW1UcUPCRH9gn7JXNU17iM9vN8MwTuPXlcj1q1y5ctSqVSvq168fvfTSS/Zn9vzzz9PQoUPpscceo/79+9Ojjz5qZ6cMHjyYhgwZYj8KCYt1U8cBAACgeJH7+jPPPBP3vXfffdcudPj1DQtByzsyE9Rw476iceDAAaG7SZYHP7pRMol2fEGBAwC8fBtA6ZLsJqGWpEjmhjzyjUbd0GQNpy67pYwZM4Z69OhBZ599NtWtWzcjLS3NnbkxlE1hS3jQvYXtT5C5oQbtiZalJCsE+BUNUklhCxzyfDf7mX3BXmEPsat0XT+Dz3Flfq6T61coFKIaNWpQ06ZNqX379tShQweZbSO73NC5555rf35Cnjdr1qyA8847rwDv+wAAAFA8tGzZki644IK478ky4kmTJtlLjf36hwmofqAqaKhcD5XhZXFf0dy3b5+ZJN/DN9NDvlST4FIUOACgMHwbQOlS2BkcrpuMfXOT15999hndc8891LBhQ+KBdZQH1rIspRW7yTCMIcFgcCI/yo4eW+nIlq9qMK+WWahj7qUYfgWOkipZgUOdB3VclqZ8z6az4ew2djE7hUmBI8oMcgodFovw5xPhzynMn0mIhd34eMjFfRwAAACOn5BHsveCHoEY72tL8H3b5L6XGYlETHnOxwzd+aXxa/tLioEDB9K3334bt88nMyfihYQWRaJlJr9Fsj/f798DACWfbwMo2ZLdFOSYzNqIs9WXptps3bqVvvvuO5o1a5adudG+fXsrHA5L5kZN8mRupKWlLQgEApuoYCimmq0hS1JyXYP3ws7YKMkFj8Me6ph7Nxl1bAf7jpwCxz/Z31lXcpYGNSGn0NEw9tiYncnOYKfHXovTXBonOA4AAADHT2NKfM/1vtco5lRy7ucnk3NvFznsJJbNZPZsPXKWCNchJwetFqtBTh5XFVapatWqFXv06FHulVdeyZw9e3YZls7SWIT7deHPPvssyI8Bfm0yg+lMYyRkWfLcuXNJvXaTvuG2bdt8+6GF4A5EtQsuhZGsb4tiCEDJ5tsASrZkF3pVvZcZGzJFMNZGbjB25oa8Lze20aNH0wMPPEBdu3Y1srOzy8Zups3Z9WywruuTgsHgglAotCFO5oYaoEtxQ4WK+hUw/N4vKQpb4JDXMoPjJ/YZe52c5UD3s1vIyT65Pkae92G3xt77G+vrcXOc1wAAAHD8xbsHxzsu9+4b6cg9vSfrzq6LuYZdza5iXdgVrBO7jF3C2rO2THazO5+dzX2zM/lX4969e5/y0EMP5bD6rA6rwf26E++///4T+LECvy7LMliUhZjF9EceecTO63r44YeJXxcgS5YXLFjg2w+NQxUzjsrzkGOuHI/8/A5ZvuLO65DXni/mCtXvBYCSwbcBlGx+BQ4pbOzatSt/K9g8V+bGpk2btFdffdXO3GjcuLFRq1atzIyMDPnmoHXsJjyYTZLtSnVd32QYxj5+nqhgoZaooMBxRKICh3vpjhyT8/YLW89kCZCEjE5mb7GX2RiXl8jJ6JAiyGsur7rEew0AAADH36sU/57rPS73brmH/x97kT3P/s3+xZ5lI9gwcr7gkO3hn2SPs0fYg+x/WD92BzkFlN6sR4UKFa5q0KDBFaeddtpl7GLWmjXnft05f/nLX5rw46n8OofVY7VYFqvEyjdt2jT97LPPDjVp0sTg1+TWu3dveuedd4oyi8MbVGp6cV81P8PDnd+xf//+AtkdKpQUBQ6A0sm3AZQu3rWMUgWXm0WsuKG2idXkxiHLUu677z465ZRTTL5JZpIzHbIN66Pr+uBQKDTBsqyFmqZtpvhbwaKgkZz35453HtS53Me2s7XsR/YtW8jmxx4XuXhfq2MLE7wHAAAAv4+FFP8evNDz/gI2j81l/2WzyAkWl5mb8sXGx2wm+w85y1Xli46JbCx7m5wvNqRAMpKcpaxSCHmKnALIA+wf7E5yZnbewHqQMxtEZoF0YBeSs+xVtp2Xpa+NuH+XbZqmLH/JYhVZGRZhwdNPP9185JFH9Llz50qf0c3uV8r2tBJYL/1MOeYnXsAoAEA8vg2gZCls5oan8l0gc2Px4sX08ccf04gRI+jyyy+3MjIyyvHNrAE50x776rr+dDgclsyN+cFgcAPfAOMVN3IJmRt+ilLgkHO5l5ylKtvI2TJ2a+y5HNsVI88lr2OHYRg7LMvawZ/RjlAotN3FPqbIawAAAPhDbY/zeivbzDaydWwtW81WsZVsBfuRfc+W8D38W1kiHAgEvuHH//KxL9kn7D/8eio5BZB32RvkzBAZxZ4jZzaIFEBkFkh/cpa8SraXBJjLDN0e5CyHkeKHLH2Rmbvns6bkZIWcXL58+QZdu3at9dxzz1XjPmMVVpGVZekzZsyIvP/++4H//Oc/xkcffaRJn/KTTz6hTz/91H6U126yHHrt2rXHEniq+WV1JMvwSNaHRrEFoPjybQAli1+BQ6b1yXIUyd2QIkeeK3ND2sybN49GjhxJd911F3Xu3Nk86aSTypMTbNWOnKq/3BSn88B5Md88N5qmuS/OVrAyKD9IyNzwU9gCh8rlkCKHhLXuj3EXkI76c2W5kGEYv/Jn9Ct/XgXIMcX7HgAAAPzhDrND7CDLZfvZPraX7WG/sN1sF5MvMLbxPXwr28z3eslAW8fH1rCVbDm/lp3XlpAzS8Q7M0RmhXxMzmyQKWwcOctepQgiy2NkSczTVLAAcg85+V52AYT/zm6nnnrqZV27dm175513NmdnslNYvdtuu636LbfcUokfM++4444IHwvcfffdRr9+/auS5voAACAASURBVIgfiV8XMGTIEProo4/sWR9J+rjeJS4G92ON/fv3Cz3GXs4iuR2yK2A8anlLvGIKChwAqcG3AZQsfgUOlbkhNxFvgWP79u309ttv25kb2dnZWlZWVmZaWpokdl9MTlVfihsfsO948LxN1/UDcTI31OuibAPr935JVdgCh+LN7Cj0uZIilFuy9wAAAOBP92vMYZdDMQcFHfniw/7yg4/Jl057meR27aYjszq3x6gZoLK0eCNbx1ax5WwZOcWQOexLcgog0ueTpTBqGYy7ADI4IyPj4WrVqt3ToEGDm9l1rCNrU79+/XPr1av3F35swGrwsSo5OTnlTz311HR+DPFrg5Fy6aWX0j//+U9avnx5ov5t3FDSRAWOGBQ4AEoo3wZQsnkv1HJRd+97Lo9ywZdZHbLtV//+/SU8SidnnaXK3LhV1/URkUhkWiAQWMo3TrlJqlBMNQhXMzYKsyTFO3D3HaBDUn6FEgAAAEgtfvf+QpFiCffh8gzDKECOxchsz4MSFM92s21sI1vD761kP7Al/HoRm8tmsU/IyQGR5S9jyMn8eILdR84Obr3I2elFlreoXI/TyZkRLFvbyla2FVgGC9WoUcO6+eabjenTp+u7du3SuU+qSb9UyBdyW7ZsIfkSTp7LMem3HsNyFgAoIXwbQMkWCw3NDxH1ksyN+fPnE99UaNiwYXTllVcGK1SoIJkbsluKFDdu5pvjiGAwOC0tLU3Wem7hG527uCHUNrDyDYIUOQpzk/Z7HwrPr5MEAAAAqcHvnl9oUtwwTTMvEAjkhUKhArg/l8/7HjvMDvB7e/n37o7ldW2NZYNILshKcmZ8yNIXCUKdwSaQszvMC2w4OQUPCTe9i5xdXaTo0Y2cbW0l0LQZOUWPhpZl1W3VqlX1Rx55pPLEiRPLTZ48OX3q1KlBZkyaNInee+89GjduHMlz6a9Kv1X6r3594BgtDvs91T92U/kcfhkdhfh7AeB34tsASja5WKs9w13H8y/wixYtohdeeIFuueUWO1C0YcOGFflmeDLfcC4ipwovy1Le52MSZrWFH2VZivcmKgUOzOAAAAAAKCbU7A0pcliWVYAcU7zvedpIXtchVy6IZILI8heZzSvLXFazn9hScnZ2+4qcjA/J95CQU7WlvWx7K8GmA8jJ9LidnK1sZSeXS2vWrNmqbdu2Z/bu3fvkG2+8sXbfvn0r33zzzRn8OtizZ0+tV69e9ta00l+VrDgJxPfpA8dd1pJ3JMcj7lKWZDu6oMABUDz4NoCSTQocas9w13H7wi7T/MaPH2/fMBo0aKBXrly5XDQabUjOdmGyj/o/+eb4PjlV+q38PFcrmLnhLlIUJXPD+3t9b9IAAAAA8KdRfb1DdCT4XALPZRt72eVNcj/UTm+S8SH5HivZd+Rke0jA6cdMdneRpS1S9JAsD9nK9oFQKHRrhQoVrq1WrdplNWrUaFmnTp3T6tatW59fn8i/KvBjGrOys7P1G2+8kSZOnGj3bxP0f92BpO4iR35x49dff7XDSKV/7IYCB0Dx59sAShbvxddd4FB5G7t379Zkap9sy/XEE0/Q2WefrfHNJY3VIWcrsFtN0/ynZG7INmSapsl2pAc9NzgVbnWIji5qJLoxoqBRULxCULzz5G0HAAAAJZM3ULyoDhXCQSo489YrXqi5+3mB2SFJHGb72W4ms4BXy+4ubCH7mn3IJvKfJUtb/sUeY/1YH3KWs0iGx/nsDCah9zVZ1fPOO6/8wIED0+bPnx/YsmWLxQymSVbHunXr7C1nN27caGd3eO3cudPuC/v1pwGg+PJtAKnNW9CQR7WOUJ5LJXrv3r0as4OZfvrpJ/r888/t9YxPP/00devWzapataqEPNVizcnZ/mt4MBicHo1Gl4RCIcnckEKGe2Du3rI03lawfoN5v4F/aeHt1HiPJWrn17kBAACAksWvaOEtXLjlFoK34KH+Xnf/JL8P4873cOd5JMNt9/PjLlnyzNax5Wwx/1mz+c+cycazV8lZzjKIPUhOhsdN7Gp2KWt94oknnn311VefOmzYsDpvvPFGNVaRpbPAyy+/rL/66qv05ptv2vhYATNmzLB3a4kTUlogp4Pf17gPLUhBRgdA8eDbAFKb92IqF17J2xCuAoe+Z88eTarZss/40KFD6frrr6eLL75Yb9iwYUYoFJLiRjPWgw1kUwzDWMI3oq0JMjd+pSM3UszgOHbHWuAAAACA0sOv+FEYyQoj7nbq7/Trw+TvzuKdueHdscVz7BC/zmV72U6Z2cF/1ga2gpwcDwkulRyPmWwKOdvT/h8bxh5l/SKRSJ+TTz75qvbt21/UrVu3ZqwRq8UqXnnllWn8aFxzzTV01VVXyRd5BTz44IP0/vvv2zuyxPrSUtDw5nTYW9Du27dPZ1oMMjoAignfBpDaEi1JkYuwHJOLMF+MdVlnuH79erua3bNnT6pbty5lZmaGwuFwNXK277pWbhx8s5J1kQvZ1thNz32TS3bDdR/3vSkCAAAAQKkl/UX1ZZnMIJEsD8nx2EFOjocUPVax78kJL/2UTWava5r2b+6/Pl62bNm/V6hQ4QbWibVgfylfvnydE044obLMTq5YsaLsDKgzUlq3bk3PPPMMff/996ov7c3r0LkvrcvsjdzcXMX+4tA7i8OvTw4Avw/fBlCyxGZseIOX7EClHTt2kEzb69BBMkRJZ2XZqewKy7L+NxqNvsa+MgxDgqEOuG5Ch103oHhLUuIVNVDwAAAAAPjzFLafdqyzRwqzPOag6301W+Sof2uC3V4Ox3Zu2cHWsGXcZg45szvGslFsCPsfcnI7upCzC+C55PRv67ITWUWWzsLVqlUL9OnTx5gwYQKtWrWqgJUrV9r5Hbt27fLtb7uLGfH4tff78wEgMd8GULJIgWPPnj12kcN13C5wSMX5rbfeoosuukhCRSPk5G7IXuR3801jTHp6+hdpaWk/881jj+fG8yuhwAEAAACQSgrbTzuexQ1vroe7Xdw+oSyFluUrUtSQTA/F83o/287H1vPv+ZGcWR2yHe00craifY5iO7Kw21h31omcfq7MVD6F1eE/o0rLli0z77333tDIkSN12XJWGTVqFE2fPp1WrFgRr4+t8jnsWR4yOzreDI/CzO5AgQPgt/FtACVLggKHuijb28J27NgxyBf5SuSkUvdkI3Rd/ygcDq+MRCK/8E0mXnXdfTNDgQMAAACgeCtsP+1YJSuAFGkJs9qVxUsKH67nB7mdLGWR7WhlK9rVbDlbzL5mH7KJTO3K8gS7l5yQ0ivJKXacWaNGjXrNmjU7oX379unMYCQ6depEjz76qB3G7+lfq8KG5HOY4sCBA4Zk3MXYYf7ubWa9/XMUOACOH98GULIkWKJikyl3b7/9ttGlS5fMMmXKNCBn+y2Z1vceWxoIBCTZ+rDcRGI3HHVjUjfCRDcsFDEAAAAA4Pfi7nPKl20yQ2Q/28t2k5MdJ0usf2KL2BfkhJS+zv7JHma3sqvD4XAb7gc3iUaj9dkJLJ1ZFStW1Dp37kwvv/yyvc2spx9tf1l46NAhe4cVeYwhN8zgAPj9+TaA1KYulKpaLBfX/fv3axIqKsckJVrCRX/88UeaNWuW7KASvuSSS07ki/g5gUCgl2VZw3Vdlyl+G0zTPCTTATVNU8WMA3RkSqFfFR7FDgAAAICSydvPi9fvizfLw+u3LHOx/y6V1xFni9rDsaUsO9gatpSP/Zd9wN5gz/LvlZ1YZAnLNUxC6ZqRk9dRm1Vp1KhRufvvvz/64YcfBr/77juDkbJs2TJas2aNHeRf2P75sWR0+P3ZAKWdbwNIbXIhlKKGzNyQ17FtYvXYzin2Xt+yHdYLL7wg0+707t27l2vSpMkpmZmZHUOh0AN8sX/LMIxv+aK+R23hFdsWVm48+wmZGwAAAACl3Z9R4HAHk+b/PUkKHO78jn38uI2PrWXfsdlsJv/+8WwMe5qcWR13sOvYpaxF5cqVT7/00kvr/e///m/W008/XZYFGYnnn3+eZs6cSVu3bk3UL8/P6JC+uDejo7AzPPz6/gClnW8DSG2xgoa97k9ex2Zz6EKyOL744gt66qmn6IorrqBzzjnHysnJqV6pUqVWfNH/G1/8n+XHmXyjkDWMh6SwEStuqJuUurnEu0H53fgAAAAAoGQ4XgWOwnB/sRb336P6rN7MDnVcZiOzXD62l+1gG5hsO/sdm0fOtrNT2Rt0ZAnLbaFQ6Np69epddO65557VokWLbHYCizC68sor7S1mlyxZEq9Pnp/RwX1wc9++fQbTmRaTX+RAgQPgt/FtAKlNChxS3FCZG3xh1JjBdMncmDRpEvXu3ZuqV69OhmFE+OKewxd8CVrqb5rmO4FA4Bs+tjl2M/HeQKTAoaYEem9ofjdCAAAAAIA/mrf4In1c+cJOll5LZoeElG5kK8jJ6/iEnG1nX+A+8ROhUOjOcDh8LfeTL2JnsDqsAvelozfeeKMxdepUO9Df2yeX2dRSxFCzNLBEBeD34dsAUlsscyPetrDGjh07JFTUToXmCzNftymTncluZM9aljUjGAz+YBiGXOjd0wRV5VxNFYxX/PBW2/1uNgAAAABQOsXrM8b7Ai3ZrI5Ey1qkcOFe1uJeXl3g3+HakvZX7gPvZ9vZSjY/EAh8zO+P43Yj2ZPs76wHOaH8Z7OTW7VqVX3gwIEVPvnkk/RvvvkmxAxGYtGiRbR27dq4u6i4xWZbHwUFEIDC8W0AqS1JgUOXAsdbb71Fl19+OV+TyWAnsFasH3uDL+7f8AV9A1/oD1DBm4e6mbjXPia7UaHAAQAAAACJ/NYCh7ufmqjQccj1ftx/h1rWIkWOWF7Hr+wXttE0zRXkbDkrO7DI8hW1A8tD7BZ2dZ06ddp26dLljPvvv79B//79q7J0pjM7o+PLL79MFEKan88hy8i5jdCkrUBGB0Dh+TaA1JagwGFfRHfu3EnvvfcedevWjdLT04N8Ya5FTojSADbFsqzvg8HgTr7IqxuB90bintGR7EaFAgcAAAAAJFKUAof3tR+/nf6O4srqEJJDt4/JdrPb2Xpylq9IseNLNomcYNLBmZmZ/Ro0aND9tNNOu7hJkyZnsNqsLLOuueYaGjNmjL17oae/Lv1yQ8nNzT0qn0P68rLEBQUOAH++DSC1xcngUDTJ4Jg4cSL16tWLsrKy0vjCnMOuIic5+mPTNFcHAoF9uq57bxDqBuCd0VGkmwcAAAAAQBEVpRhSVO5ZIN5j6u+S5zK7+Re2if3A/sumcd/5Je47y/KVO8npU8vM6FNYtVNOOaXsfffdF5w1a5bmXX4ixQvJ7ZBCBooUAL+NbwNIbX4FjsmTJ5MEItWuXbtcMBg83bKs3rquP88X4q/5Ir2JL9KSMK1uFvl7jLsu8ChwAAAAAMAf5XgUOLxLWbxb0Kog/QJf7qmMDlm+EgqFxK9sN1vP/eZl5MzomMBeZI+x21k31qZMmTJNOnXqVO9f//rXCZ999lkmCzOdkViwYAFt2rTJt2/vl9ERrz1meEBp4tsAUluSAgfFdlHRbrjhhmDNmjWrWpbVjC/at+m6/gpfiBfyhXonX8APewoc3go2ChwAAAAA8Ec5HgWOeEWOeHkdBfq0KqOD+8gqo0PldMiM523cZjX7ls1iU5j0qQeze/n39m7UqNHl11xzzXn33HNPQ3YiS2fafffdR6NHj6aFCxfG68+rLWaFnpubWyCfw5vR4f39KHBAaePbAFKbX4Fj4sSJeq9evdKysrIkf6MN+wd7l33PF+99cuF2FTjUBV9d6FHgAAAAAIA/UlELHPF+nx+/f4M3p0P1k/eRs82sLF1ZwRayj9g77F/ly5d/qF69ejfk5ORcws5itVlm48aNzb59+9pLx+Pl5uXFChzcf9e5X48CB0ASvg0gtcUKHHZIkfe9WIHD6NWrV2ZWVlY2X3g7sAfZRPaTZVkHgsHgr4ZhqIu92l4r3g3E90YAAAAAAPAH8/ZXk71Oxjvb47Dnuf33qVkeTJZ572Kr2SI+/hH3qd/i55J1dw+7lrWmWEZH8+bNMwcPHhxctGiRvmfPHk0yORTZGEDIl5Z+fX+A0s63AaS2QhQ4zF69epXPysqSi2tH9iibxlZblnUQBQ4AAAAASGG/pcDhXsbizeg46GL/WWr5CvefVUaH2M+2apr2E7eZQ04/ewwbyO4gJ6Ojdc2aNRtzn7zmqFGjKkybNi3KDEZixowZ9vIVKXIk6PNrMXZgqZt7e1m/jA6/cQVAKvBtAKmtEAUOiy+mFbOysv7CF9crmSQ//4ettyzrMAocAAAAAJDCfkuBw13k8M7giBtCqooc3I92kz70LnK2mP2enF1XPmCvsiHsH+np6d3POuustldfffVpffr0qckymcHoH//4B73++uu0cuVKb19fzzuyhEUeNe/yFbXFrBQ6UOCA0sC3AaS2QhY4KmVlZTXmi2tXcqrJM9lGvhj/KhVoV4FDtsRCgQMAAAAAUkVRChzxfk8yfn+3+8+TgojaXnYLW0VORof0u980TXNoxYoV76pRo0ZX1pw1YBVY4Mwzz6R7772XPv/8c3dfXuVz5ON+vyb9flnK4oYCB5Qmvg0gtbkKHEe9FytwBHr16lU5KyvrNHKmyA0iJwxpk1ScYzM41MVZTclT6wxVVbsoF3gAAAAAgOIoWbEjUTvFuxuL+7X9+90zPNghtoP9zH3tefyeLF0ZyR5ivdnFTPrnNaPRaPnLL788Mnr0aGPFihXatm3byE22l5XlK/FCRgFKG98GkNoKUeCwYgWOeDM48uIsUUGBAwAAAABKomMtcEh/WOVx5HrYs59VcUP61658DrE3EAhs5DZL2SfsbTac3cd6kFPoaNqoUaMGt99+e+UxY8akv/POOyYjZerUqbR06VJ7NxVXX1/zsGdpeHM5vOMDzOiAVOfbAFJbIQsclTwZHDPIyeBAgQMAAAAASovCFji8bVWfON5OK/m/1zODQ5G+9n5+fxv7mZxlK1LoeJc9yx5gN1SuXPmSZs2andGlS5daf/3rX8sxg5GQ5SuTJk2i7du3q35+/tayea58DiluyJhALVtBgQNKIt8GkNoKUeCQXVQqxHZR6cQeY9PZmlgGBwocAAAAAADJeQsefu29pCAihY6d5ISRLmOfs/fYCO6T31uhQoWrK1eu3KJSpUo5lZxfYaY1b96cBg4cSEuWLFH9fHc2hz2DQ83ekFke8ogZHFBS+TaA1BYrcJAKGXVftGIFDqNXr15ls7KyTuKL5yXsYTaZrZS1gYFAwK40xy7UBbbCoiPFjXj8LuIAAAAAAKnE29dN1vf1zu5Q2RzufA713LsDy2H2C5MvHBcYhvE+OVvLPspuYpexpqwuq1ylSpW03r17W2PHjtXXrFlDYvXq1bZVq1bR2rVraffu3UeNE2Q8IGMF71ayyYocKIBAcefbAFKbX4Fj0qRJOl8Q06tXr16PL57t+MJ6P19gx/HF8ge+wB6IU+DID0oiFDgAAAAAoPQ4HgUOlcuh2DOjpcAhwf7S93blc+xjm7hP/h23+ZKc2RyybOVBdiO7lJ3D7zdo3rx55XvvvVeCSEmMGjXKNmbMGJo+fbp7i1m1+4o9q0O2kd27d6/9KLM7vMUO79gCBQ4o7nwbQGrzK3BMnjxZu/HGG0O1a9euEQwGW1iWdaeu66/zxXIxXyx38UX2ML9WF+cCSdCEAgcAAAAAlB7HWuBQRQ63o36fmsXhIctWtrO17Ftylq1MZC+w/qwPu6RGjRpNmjdvXu3SSy9NY9oll1xColOnTtS/f3/69NNPpf+vsjlMpufm5mo8HtAku0NmeLjzObCEBVKVbwNIbX4FDgkk6t27t1m9evUqhmGcxRfRPnxxHc0XyjmmaW4JBAKHPAUOd+YGChwAAAAAAP6OtZ+sZn/IzI9dbAP7gX3FZNb1P1m/SCTStWzZsuekp6fXYeWYxah8+fJ02WWX2bM51q1bp3ZUsWdwyGyNPXv22GMCmcUhhQ13cQMFDkhFvg0gtcmFS00987ynyX7ZY8eOlfRlnS+I5fji2Ih1Z/9iX1qWtT4YDObGQkbVBdZdsT4qHRoAAAAAoBRK9KVfvKJGvJkd7m1m3Tkd9u+V2RyxJSySkbeHrWML2Af8nnw5+RDrydoy2R3xRFaGBRs2bKjfc8899P7779Py5ctp48aNFG8DAi9vHoe3qJHsPYA/i28DSG0JChx25XbHjh309ttvU8eOHYkvmBG+ANZjV7CBbIZlWT8Fg8E9/J66uKrHRDM6AAAAAABKo2MtcKgihzuX46g+tqvAkcf9c3GAbWY/aJom+Ryyrexw9g92LWvFGrKqZcuWTWvbtq0m28k+99xz9MEHH9jBo56xgZt9XO264s7lcI8zUOCA4si3AaS2BAUOe9soKXC89dZbdPnllxNfNE2+AGaxdux/2VjLshbxRXNLbG9uNT3OvSwFBQ4AAAAAgN9W4FBFjoT5HCJORsd+JtvKriMnn+MT9jYbym5nHdmZpmnWqF69evqZZ55p53IMGDCAvvrqKzUuUEtWjJgCAaQqfBQFDkgVvg0gtSUrcMgSlfHjx9N1111HFStW5OsflWfnsdvY/1mW9WUwGFxlGMYvnostChwAAAAAAMdP3KKG5z1vv9vdJ99NTqFjEXuf+/EvsPv4+dWsma7r9UzTLM+/Qp07d9ZfffVV2rRpU9yxg3vWhoIlKpAqfBtAapMLklykpMghr/nio/ExQ/zyyy/00Ucf0YMPPkitW7emnJyctOrVq/8lMzPzWr4ADmFTA4HAUr4g7pCLqFSNheuC6p1CV9iqNQAAAABAaRKvXxyvnxxvVke8fI7836dmdnDf/WAwGNwWCoW+T09P/4i9xH35R8nZUvZidjqr3ahRo/L3339/6IMPPtAWLFhAyvz582nhwoW0evVqe5MC77hCihiJlquo91HwgD+bbwNIbXIBUuvnYq81fm0wXYoeS5Ysoffee4+efPJJuuOOO4IdO3asc8opp1yckZHRjy+QY9iXhmGslwupWvvnuuAeoCP7d6PAAQAAAAAQX2ELHN62apm4N5+jwO9xZXQc5v77jkgk8hP72rKsCfz+v9kD5ISQXlSpUqXGHTp0yOrXr1/0scceIyHLVsSIESNo5syZtG3bNhk76C520UN2XZExhBQ6vOMOFDigOPBtAKlNLi5qapm85ouRxhclnS9QulyY5OL1448/0ty5c2n69OkGX9hOaNeuXdOKFSteFwqFnuCL5ES+YH7PF8O9pmnm8UXyV03T1IUWBQ4AAAAAAH/HWuBwFzoS5nMosWyOg7LEnG3gfvt3fHwWOVvKjmD/4D5+1zp16pzVpEmT6k2bNk1nmuRzCNl8YPjw4bRs2TJ3LofQZOcVWeIuRQ75AjXeuAMFDviz+TaAkkUuRnv37pULlOZ9b9OmTdprr71WpkuXLvXLlSsnW0xJONEoNpttDQQCvwaDwV/5oqkurO4pcoc9/C7yAAAAAABQdPG+SFT9cXc76afvYRvZEjaDjeG+/EPcp/+raZqSvSe7KEoOX5BpNWrUoD59+tDUqVPtQoYsb4+xixZS5JCZHO5cDhQ0oDjxbQAlixQ4+GKlSZHD8579evz48eErrrjiBMuyGvNFrit7nE3XNG1lKBTaFw6HD0tlOHbRdO+s4n2e7ELsd9EGAAAAAChNCjvDQxUy3MtWVD5HLsVfvnLYNM0dgUDgB/Y5H3uTnD6+ZHN0ICebozorw20DLVu2tJetfPjhh3Y2x/r16/Nng6txg8rjkLGFPPplcviNUQCOF98GULLEChzeXVXy97x+9913jfbt26fxBa4aO5/dysZYljU7PT19Q1pamr1UJXbBVBdXJeG6QEKBAwAAAAAgkaIWOBL1w4/6syWE1DCMw9yf3879+J/52DdsEh3J5riOtWQNWMVatWoFZDvZu+66y87k+Oyzz+zxQ2y8YC9ZkVw/mREumxZIJoenAGJDgQP+DL4NoGRJUOCw97uWC9Rrr71GF110kcEXNylyZLNO7FG+II5PS0tbGI1GN/EFMtd1gUWBAwAAAADgtylsgcPbtih9bOmr72Vb2Y/sS/YeG8JuZu3YKeFwuFJWVlbwpJNOos6dO9Nzzz1HK1euVGOGAgWOXbt22eMKFDiguPBtAKnNe2GRKWSydk4qreq4bBnLx/UNGzbQ66+/TldffTWdcMIJhmVZVQzDkLV5N7Fh/HwaH1uqaZpsG+stYqhiR6LAUb8LLgAAAAAAHM2vX+193z27I9Hv3ct9+vW6ri8KBAJTIpHIcO7n38bHL2OnsSwWrV27tnHrrbfSf/7zH7uQITszuosZkschx7x5HChqwJ/FtwGktngFDveFSGZ07Nu3T5dcDilwTJ8+nfr3728nKJ9zzjnptWrVqs8XPanmygXvWfYhW8EXw19M0zwc2zZW8QaNJkt6RvEDAAAAAMBfUQocqrghM67Vjodq10O7vWtL2YOhUGhrNBr9NiMj4/1IJPI8H7+P21zNmrF63KZCmzZtQo8//rg9TpCdFyWTwzPmsDM5ZHyhxhkqm8MdRuo3TgE4HnwbQGrzXjjkIuMOA4rtqqJL6Khs+7RkyRKaNm0ajRw5kh588EGzQ4cO5SpUqJDDF7iL2R3sRfYlX+zW8EVwTzAYzIsTOuqmihzJLsR+F3UAAAAAgNKqKAUOd5FDFTYKzLyWTA5V5LAsK5f781vD4bAEkH7G70kA6VOsL7uINapdu/YJF198caBv3770zDPP0JdffuneJlaWreg8xrC/MJUlK7LsXe22Iu1UkcNvnAJwPPg2gNTmvXDElqTkH1PbxsqSFXkuFyWZyfHTTz/RzJkz6X/+53+sRo0aydZRDdml7H72Bl8M50Sj0bWys0ps21h1cXWHHiGTAwAAAADgtylMgSNR26R9bk3TfmW53J/fzY9r+dgCfpxCR9F8lwAAIABJREFUzsztO1nHcDjcuDL/ql27tnXllVfS6NGjad26dWq8oQocmvrCVAWPqpkcKHDAH8m3AZRsKpNDKqye97QtW7bYmRxdu3a1qlSpUjEtLa1xIBDoxhe6AewdvhDONgxjHTn7a8e7aCbK5PC7iAMAAAAAQHzx+tbJih/eJeTuLWbdvydX07St3N9fGg6H/2NZ1vP8+l4+fgU7g1XLzs5Ov/vuu42ZM2dq27dvt4sZrtkc9tjCb/wB8HvybQAlm1yEVIXVdVy2gJJqLM2ePZsGDRpE3bp1CzZv3rxqrVq1ztJ1/Tq+wD3G3mJz2To+to8vgnnI5PhdJSsUJavWAwAAABRWnue5t5/h11+B319hPjN3W+8ycnc+R4H2MqMjGAxuj0aj34fD4Y+4j/8SH3+QXctapKWlNbj44ovLP/HEE8Hx48fT119/bc/+9htzyCwOZHLAH8G3AZRs7kwO13Etxr5gyd7XMpOjf//+Eb6gnVimTJmzyAkfeoi9xRfCOXwhXM8XvL2eTA73MhV3wFGiiy9unMnFu5kles9bpQcAAICSI96XSIWRrLCRbLCMflrxUpjPzNs2Xt/wcLw/3zCMg4FAYIdpmiv49X/pyFayt7JL69at26ht27Yn9OzZMzB06FD66quvvOMI3cOeLS6zxuVLVZUF6B2XoMABx4NvAyjZ3Jkc8louOAcPHtTU+3Ixkulnss7uww8/1O+5555Idnb2iXxxa8quIme5ynt8AZwXjUbXB4PBfRJc5LqgeqfCHaLkF1/cOBOLdzNL9F68mxkAAACUfIn6BIWV53nu7Wf49Vfg91eYzyxRW2//8Kg/P5bLcZD9wq83GIaxiJ9P5+fPs37hcLhj+fLlG1erVq1y165dQ6+88gpt3rzZPcbQ3NQXqsjkgD+CbwMoWZJdOOSYLFfZvXs37dmzR83qKDCbY8yYMdS5c+dQlSpVTszMzGwaDAa784XuSTaOL3xzZT9tfr5XLp6uQoe6uLorxbhRAgAAAAAcf379bHeRQ/XRc2PUMbst9+cPhUKhbZFI5DvTND/iY6OY5HJ0Zk1OOeWUavfff3/ap59+asj2sYp8ObpmzRratGmTPb4o6rgE4Fj5NoCSpbAFDhELDMqfWibvz5o1iwYPHkzXXXddpHXr1tVq1qx5Ll/cerLHycnkmMPW8QVwbyAQiJfJ4Z1WWZhqs99FvLTDOQIAAIDCiPctflGXwcSbEZBMsn8D+jC/D7/z6/0/ILOsD8QccreVpeehUOhwNBrdHgwGf+Rjn7L8XI5y5co1v/zyy+s+8cQTmS+//LLF6KWXXrK98cYb9Pnnn5NsXJBXcFZHfg6gzBaPt2TFPWZBAQSKwrcBlCx+BQ4pasiFRsj0sTzXhUhINVaKHO+9957+6KOPRtu0aVM9HA6fwxe4v7KH2dt8IZzLxySTY59kcrhmcriXqbi3kPW7+fldxEs7nCMAAABwi1fIcBczVDZabhIHXfwKHyhwFC9+59f7GXj75vltpR9vmmaeZVkHDcPYzsdWsK/ZO2xQIBDom5OTc2Hbtm0bdOrUqRwzO3bsSKJ79+707LPP0pIlS9QXpkbs0S5u7Nq1y541LktXUOCA48W3AZQu3ouJVFTdO6zIc9kOSnI5ZsyYod1+++3hunXrSibHmRTL5OAL4Xt8EfwmEoms44ueZHKoi6v7Juu+Sfrd/Pwu4qUdzhEAAAAkKzK4+2DxCh6YwVG6eM9/os/W+/ukCCK5HLIkfQGbouv6iPT09FvKlSvXNjMzM6dMmTIVWZBRnTp16KabbqIpU6Zo+/fvV+Gj9hen8qWqjCmkwCHPUeCA48W3AZRsyS4cMoND0o53796t7d27V14XmFq2evVqev7556VCG65Vq1ZWpUqVmobD4e7kZHJI2vIcTdPW8uMefjwsU9wSBJD63Qz9LralRbKOg3quOiveb2W838AUpmMDAAAAxUdhCg5+fYnfW6K+yrHw/pnx/g6/fw84/M6Z+313X/KoWR3SlzcMI9c0zc2WZS2JhY/+k93GOrDGrCqLMqNFixY0cOBAezvZVatW0bZt2wrs3ijjDRU66t5GNtmYBQUPSMa3AZRsfgUOmT4m1VVXgaPAdk+yhaxsD9WnT59wu3btVCbHdexR9iabreu6zOSwt5CNk8mR6Cad6KJbmm9myToA8ig3oP1sD9vNdnjsih2XyrsUnfbw5/EL36B+4RtUAXJM8b4HAAAAf4o9MXvZPpf97ADLZQfZIXaY/cryEpFlB0q896TP5gmM9+uf+H15UtRZIN4/P15/yO/fBg6/c+Z+vzAFDvl/ksv9+y18bBmbwV5g95Ezo/tsVoNl8NhA79q1Kz3++OP06quv2oUOWZqSd2Q7WfuLU5klLuMNGXu4CyDxxiwocEAyvg2gZEt2oXAvUfFMHSuQyTF79mx76tmjjz4aadWqVTW+KZ7FF7Ru7CH2Fl8E50YikfXRaHSfBI+6Lqbum16yTI5EN7zSxn3j8Z4PeZSZGlK82MY2stVsJVse8xM56ybl2Cr+XH7mm9PPwWBwZSgUKkCOKd73AAAA4A/3M1sVs4atZetiNrCNbDPbyraznWwX+4XtYfvYASY7YkhoZJ588aSoY+73pNAhs299+iXugoY7s6Mws0hR4Pjj+J2zeOffW5DKby9FDvm/wSSUVPqd0sf8nL1BzsYD3VkzVjstLS2jfv362vnnn29ncrzwwgv0008/qeJGfiaHzBrfuXNn/pKVZGMWFDggGd8GUHp5LyRCih3urZ6kACIzOWTXlWnTplHfvn1DNWrUkGlpp5NT5BjA7EwOCR6V3VVcF0n3RdR90/NefBPd8Eob9w3Hez7kUW4yO9kGcm40C8kJgfqEfUhOdV3MjB37hG9Q4mO+QRXAxz5SvO8BAADA7+YjF/fxT9in7DP2BZvFvmJfM5ktO5fNYwvZYraUfcd+ZD+xn9katoFtZjv4Hv8LO6CWEbvJADbB7I1EhQa/wfGx8P498f5ev74TFI7fZ6E+03ifg/TfpX8vy9K/YeMMw3iC/x/14OfNWR1+nREIBIz69evTrbfeSh9++KGapZG/9F1mjktxQ2ZxYAYH/Ba+DaB0SXbhkIuNXHR27typ7du3T3MtWbEvTMuXL7eTkjt27Bg86aSTqlStWrVpKBS6jo5kcsyNXfz28kXv1zg3zkQ3Qb+LsN9Fu6RwT/087DqubjpS4JB061VsETmFDEm4HsmGsUFsIBvMnokdGx57HBEz3HVMGQ4AAAB/iHj3X7k/S8bBs+xf7Dly7u0vslHs/9jL7FX6f/bOAzyK6mvjdzdbk00oIY0kEERAlBYQsSAdBcKfGlBRQOy9ICoQulg+FTsKinRQrChgo4qACIoNG4iEXpQiAVQg5DvvzNzlZtjkJqiYTY7P83u2Df8vO7PfPe89c857zDvoiP1vE+8Qc4n3iY+EqQs+IT4Vpib7RpjtBajy3ERsFaZ55G7iV2KPMG+c5KCtlYBx/BEkRIRNo8iESCGJER26zXVB2q+g10XRk2WZ4pwXqT/t03SA2rLyl9fr3en3+78KBAJvRUVFPeJyua6nY9oQtYhYOs7bpk0bB9rbV65cKX7++WexZ8+efPsOuQ9BwqOonhy6/Q1TttAewJQtClssVNNRJDjomHwJDlRxfPzxx+Lpp58Wd911lz8jIyOV/sMI2T7C9OSYRaymxQ3llAV5chyzPYZaeMtqwCpKggNeG9nEKmEmlZ4kBhDXED2J7kSmMPsjMdr3Kuuxt/Ic9FK4kmEYhmGY00Ko+Iv4jDgNPXW1MGP6dcQNxI3EzcRtxJ1Ef+J+YjAxlBghTA32sDBvdOAGB5IkSI5MEWZC5C1iDvGhMJMgaDVABSjuxn/ndDrXezyeTcROYh8BH5C/aPOaKz070IKsAg8PZ35z+YJ0jX3DbKewKpA8cbIW5ARH0SjOeZE6M9S1Cbar4HdA2v5PtExFRkZ+TbxLvwMk6mA+mkHUJRKrV6/ugyfHiBEjxKRJk8SqVauMG6jWfgItK9hjGBXjqOjAI/YgxdmzMGUb7QFM2aKwxQLvSU+OUKVjWHx27Nghvv76azF//nwBT46LL744hRazJsJsVxlBzKIF8IuoqKjttPDBGEtdPNVF86i6eIZYaIuzMJcW1OASKsGBc3ZAmAkO3J3B3ZwhxGVEM+IcojpRjaghzGz6WdZjbeV5LetzSS2GYRiGYU4LoeIv4jPi9NnCjOXYKDYQ5rQKtASfS8D/DDeVEO9bEW2JdsLcWHYmugnzRgcSJv2EmRi5VZgJERhDDhemd8ITxAvERGImMZs2qR/SpnUZsYb4CT4gtJHdhWQHPR60NrVHVQ8PJDkKMSlVdYvKEdtre5LDnujIEydrQU5wFI3inBf7eVSvQ/A4xZfjT7r2ewhUBy0UZrURbrbhd5geCASQ5PCed955onfv3mLixImYzChvmrrwiD2FVTVepJYV3f6GKVtoD2AYib33TU5Zsao58n2Gao65c+c6rrvuOn9qaio8ORoL826E9OT4goLfdlr8DovQSQw1kOkW3rKCLsGB92EyCnNRVHDMILKEKWoaEkmEn3CIk/+LsHBaOBScDMMwDMOcFkLFX8RnF+EmPISPiBTmGM5oIoaoQMQS8cIc0ZkqzCkWZwgzWYIkSR1hJkagyWQyBO0DSIJ0FebNKCQ/biHuEeZNkoeF2SaDhMdrwmx3WSpMnYEWl5+EaWCO9ha0tqCSFFoEU92QpAil4zjxEF4UlDBStajUoepnaG/6xeVyfezz+SbQ473C1KRIzCUS3rPOOkv0799fLFmyRBqLBivDsZ9AcgNef5zEYIqD9gCm7GJPWtg/x0KEEbLSk4OOyeeG/MMPP4innnoKnhy++vXrp6Bdxev19hVmsER/6OfENmtcaa4t0y8Xx1zleUGBsKwESfs5CZVJh6CAwPiOmEfn80kCJaythSlyIIoEXQeRnJws0tPTRatWrUTr1q0F3K3PP/98ce6554qGDRuKRo0aicaNGwtk2FXwnor9c4ZhGIZh/lMiCDeBu+R+IkDEEBWISkQikUIxvCrF/DOJ2vS6HnEu0ZRoQ/qgY9WqVTP9fn8fkg03CTPhMUyYXl7wAkHC4xVhen0g6bGIWCGsthZivTA9wWBquoe0yO/EYcvD45j06tAYmhakhQrSQ3YK+/fHC3hdVinOecy1IatvjoQ4Psfj8WwIBAKLIyMjX3K5XGifCt54o99XZIcOHZzYLyxfvtzYO/z222/qfiM4uRFVHNh74LGgSnOu6GCA9gCm7KJLcGCBgSfHoUOHHH/99Zd0QQ5mXvft22dkZJ9//nlx3333RcKTo3LlypiLjV7SEcIsfVxFix3GnR2CJ4cz/zgytWJBVi2EWmjLSnCSAV39vvYAjyCDjPlWEgtf0rl9NyIiAj4c6M1FuSraU9wVKlQQzZs3h1eKGD9+vHjppZcM7xTMKB82bJgYPHiwGDJkiBg5ciRajcTo0aMN8JxhGIZhmLDESbgID+EfNWpU5PDhw6OJCvS6EpFIpBJnDBw48KzOnTvXTU1NRfvLRcK8UYJKjx7C9ALBzRN4fqC9ZZQwEx8wQp0ozMTHbGI+sYI2uF+53e6fiC3Eb0QO6ZMj0rsDj4W0s4TSQbKVOVQbi25zzgmO0BQnwWHXoOr1OOlYutYYWfwL6fylpPOnCtMbBu3T5xFVatasGZ2ZmekYNGiQmDBhgli9erU6YSXoyWHtOYyKDvbkYApDewBTdtElOPCezKZiobFcjoOZVnh17Ny508jGLliwwEkBNKpJkybJwuwVRYAcRrxKgW11VFTU1sjIyMOK6ehxcWqeHLoFPJwJFXTUksA86zXMRjH6bTcJh58osCwSpsP6fcIUJ7WSkpJirrzySjFt2jRj+s2WLVvEunXrxFdffWW4Wn/yySdGJh1B5ssvvzTex6NkzZo1+V4zDMMwDBM2OAjnF1984aSYH0G46bWH8BGRRGDx4sUxDzzwQPmLLrqoEumGBAL6raow213gA4I2A7S5IPHxP2HququF6esBvTGCQBXpBNIirxHvE0h2fEv8QtoPHh64u3+EOC5NSUXBGkjdTB9R0CU5CtNSoV6XVU4lwWFPdITS6EhcHSV9n4NRxfR8pTATYMOF2bp+YXR0dFX6L6pevXqGJwe06a5du+RNU6MyHPsNJDcOHDhgJDo4wcEUhvYAhpEUlvDAayQ6Dh8+7AD2kU779+8Xb775pujTp4+XNteJFMga0UKHXk94crxOr1dTsDPaVUIskDLZUVApom7RLq2oQUW+Dj7iTgiJhj/o3GI0L9qB4MkBV/VuycnJDa+99tqkd99910fBIjiDXLmeTqvlyMEwDMMwTNig1XMq8gaV/X14qb3zzjvimmuuEampqYI0GnAQEYQ3KioqQP/F+ny+ZHp9JlGHOI9oSWSQ9uhBOgSTXmBiOlKY01smC7OyYyGxWpgjajGedqcwx9xDA6LVFokLu5+DqveKq/3Kul78u+h0t5rgkNdLJp3Uf4NRw1vp9/GZ3++fERERMVyYVd2o7k4lourUqSMGDhwoVqxYYVRq0N7CIX+f0vsPN1B1N2GZso32AIaR6BIcWHAOHjzowIaZFiAEWWee0rKC6SqYe929e3dPkyZNktLS0prQBry3MJMcyObCsGqr0+k8RIHxeIgRsnaKklnWLdrhTEEJDgMkOFD2SecSdzd20etVdG6n0+PQhISEKzIzM89/4YUXqqxZsyZ627ZtHgoc8lrh0U14CY+Cm2EYhmGY/xxXCCIUnHn5NdgpJT/Wrl1rtK/27NnT8OtSueSSS0Tbtm1Fy5YtXUQUvVeBSCKqEbXr16/fMC4urhnpjw7CbEdAsgM+HmhnQevsy8QbxAfEx8K8EfM9aZRfSKtAC/5KHCD+II5Y0zmMVpYijJ8NVVlQ1Jtk6vu6Y8sKuvNgP9/QnagmPiJsNy3hw+L1ercEAoFPkeSga4kRxjLJUTUmJibQqVOnCHhyLFy4UHzzzTchPTmQ7MC+Q052LKjSnBMgZRPtAQwj0SU4sMAgswrHY8sJWW6WjWOwQC1dutTorxsyZIgvIyMjmYKfHCE7VJgVBp95PJ5taFexeXJg4bS3rNgz+qEWYt2iHc7IYGIPxMbnCP5SCNDrvyAY3G73SnpvJgWQUY0bN+7Vt2/f80aNGlV52rRpkd9//70qfiCWQgmpCIZhGIZh/jOcBXDKiYyC2LNnj9GyijGeSHSoPPvss4aR/JgxY8STTz6J95yElwgQFW655Zb4c889twppkZqkQeoR0HutiE7EFcL08MBUDWxwMZoWCQ9U9H5A+m8ZfDuIn4kdGEdL/AW/DmhDjWeH1EahRs8WlOiw/3tOcORHdx7snxfoyYFrRtcYvnvQpLixiaEDuNGJG55NiWq1atWK7tq1q+POO+80fOLQVpV3Yk+B/x9wYJ+BlhUMOyhoygonOMou2gMYRqJLcABkVGUm1XodDLTIsv7666/il19+EYsWLXJkZWX509PTMcoMM9wzheXJQQHs80AgsM3v9x+mTbkaZNiTIz/272lPeKjBH1NqcpA1p8CyioLKrIoVKw5LS0vLrFu3boPu3bsnUhDxwYvDul7qRBynUt2h/Z0wDMMwDBP+qLoNPl12vvvuO/Htt9+KH3/8Ub7nIJyEa8aMGZ4rr7zSHxcXFyANUl6YI2wxrh4T3WoL048NCY8uwryDDzP0IaRPxpAOhG/HG8RCaEL4iVmJjgPw7KBjjheS4LAnN1SvDk5wnBq682D/XK2aOel/j65bLipz6HG7MKfuyCRHX+LiqKiotMqVKwdq1qzp6NOnj5g1a5bYu3fvSQkOtFFJTw5OcDAq2gMYpiAKWzjUlhVkWBU3ZAPcFZg5c6a4/PLLvYn0n9/vb0Qb7yusBe4NWvg+p+AF74hQnhygIE8O3SIdzugCMs6H2vOYq7yHux25Xq/3MKbW0OvPCDhZY1xXp/j4+PpXX311wltvveXdvXs3Rv8aAUMmq1CVg9eyHFAFQYZhGIZhmLDEEQqK/1KzFVQxUmjVCFoLHnzwQXHhhReK6OhoEQgEJO5y5cr5K1WqVKF8+fIp9Flt2tCe6/F4YFbaXZitLAOIB4kXiFeJ94hPhTl+dqMwPTv2C1MjylaIv6MBy4KG/CfR6W410YFHaQx71PZvkORA4mp1ZGTkq6RTH6DXfYRpXptKRKWnpzuGDx8uPvvss5MMRuVeA79j3b6EKVtoD2CYgihKgiMnJ8eBDKs1RjaYecUxmNDx+OOPi8suu8zbrFmzytWqVTufFjeUqKFcEQENm/AtTqfzoNvtzmVPDm2CQ01yyEdZ6WKUc6K80+VyHRbmbPpPhDnODW7n3Ro3bpw+YMCABNx1Qd8j7sYgkMhrStfTgdcIMEiA4LrKxIcK3pPYP2MYhmEY5rTiKIw///zTCei5JAKQbpMtMaH8PtS21ZAVnnv37hVvv/22uOeee0SnTp1Ex44dRYcOHURGRobo0qWLyMzMFF27dvXQZ+Xatm2bePbZZ1ePiopqQHqkmTAnvuGm183CHEP7sDCTHfBrm0ssJr4gfiRts5l04i4CUzrQjntc+nVIUOkRotpD1U1Fqeyw67BQr8sKuu+tfi4rakJ6ctD1kZ4cn9Hjq3SdkNjCXsDw5IiNjQ107949Am1Q8+bNM6b44Sap9TsLJteQ9ECrCntyMEB7AMMUhC7BIT05gJVtzZflxwhZ9HZiHNSIESP8FPiSy5cvb/fkWImFj4LeQZ/Pd1zx5FCrFdTeyqIEpHClqAmOXOV5sI3H5slxUJh3QZDkmEIMSUhIyLz44ovrX3nllXGjRo1yffTRR0Yyw7peRoIKImj//v2Offv2OVCdYzlcB8cFh6rwYBiGYRim5KFWcNDrfGgqOLReH9B9P/zwg5gzZ454+eWXxUsvvSReeOEFMW7cODFp0iQxZcoU45E+c44ZM8Z7xRVXYFZonDDv3GMUbX3iIuJSopswR9DeJcx25jHEJGI2acMlpBO/JDYSvxKHMHYWXh0SeHaE8HSzt7Gorc86rcUJjqInONTzfcx+rPTkgP8eaVQYzcJ4ViY5mtJ71WrXrh3TsWNHx80332z8flAdZP3+ggk2/J5x4w2eHHjOCY6yjfYAhikIXYIDyPFj8rkVMI1jsDlGhn/btm3w5HDef//9/nPOOUd6cmCe+jBa+F7BOKmoqKjNFMQOom/PWhRDJThka0ZxF+JwoSgJDpV8CQ5g3cHAZ0fp+e9ENj1fQUyn4DKoQoUKnSpXrlynQ4cOlZ599ln3hg0b5DU1RA5E0KFDh4xJORgHrPqt2K+5vO4MwzAMw4QfOh2oA5vNXbt2Cfh7ZWdni/Xr14uff/7ZeL1161bjEaxZs8bx6KOPRjRr1sxNesRLRAnTtyOeqCLMhIes7ugoTM+Ou0jDjCaNOJ54g/iY+IbIJvYQfyKxIQ1JQ9wgOxqCUJUcBWmtUK/LCrrvHUqPStRjjOd0HY9hugo9hyfHF3St4MmBau6+RNPIyMi0uLi4qBo1ahhji1EZhArxvBCeHIATHIz2AIYpKoUtHHgPCQ0sSJYnR76+Tfg+IJufmZnpTUpKSixXrlwjr9d7hbXAzaKF7zNa8LaI0J4c6uJZlIW3tKD7nmoSSA0uuUh0eDyeXFTG0ONmeo0kx0RhzqvvWLVq1To333xz3Ny5c70QJ/v37zeun7yeSGyESm7ofiMMwzAMw5QMdLoNNyqKWZ0ZrAChf19U/w5DX6D94KabbhI1a9YUtJlViUhJSfES5eLj4ysTNUkjnksaEZUdVwqzqgNacTzxJrFImMaVG4jdxO/EH6LwSt+/o7UY/TlSEx14lJ4c9huT8OTY5vP5DE8Ol8uF6yrbVZIJX5MmTRzwdlm1apVhgIuEhuXzZ4Dfq/w9sz4tu2gPYJiioguUMsFhZVfVwGccs3LlSsOTo3fv3t7WrVvDkwPtKgheI4XVrkJsRSmbdNBWFkW1WsGegdctxLqFuaSi+7tlMLF7csgER15UVFSe3+8/6HQ6s+n9JcRLxL30WZcWLVrUz8rKgieHd8mSJUKZsCJxYEoOrivakNSgUtTfBcMwDMMw/w063YaNI2I8vDxUfy3psWW1IRteHqjqtHCCvBN31+1eHuq422BV7/fffy9efPFFceONN4orrrgCJvSiZ8+exvO+ffsaXHnlle5evXrFtGrVKjEtLa0W6ZXziEuInsQtxBBhjpydTMwhlhPfCLMl91d4upGGPErkSaRHRyH6SdWWx0Xh2qu06Mviovue6uc4j9KTw246iutxyOfzbSV9Ck+OWcJMXvUiGhOVk5KSonr06OHAfuHNN98Un3/+uVENbv2O8rVOSSNdaUrKlB20BzBMUdEFSiwyCJQglCfHjh07xIoVK8Trr78uRo0a5b/00kuTaYFD8LpMmEFrBi18q2hDjoUPpkT5xqCKU/fk0C3MJRXd3y0DSa7yPJgtV0xH8f4B4hdiqTA9OQanpqZ2gycHBZK40aNHu5cuXapmyWXLihNeHEhcQehwgoNhGIZhwgOdbrNai3VTWEJOZcnLP2FF3tTKV72rgk3qF198Id555x1jLCgm7cGj7ZVXXhFvvPGGwWuvvQacI0aM8LVp06Y8bYQTSa9UI84R5l3+9sL0cUOyYwTxPIFN8iLia7fbjXbnfcRRIg/IFhZFTx4XJ7Rkcfw5QukynU4rLei+pz3BUZgnRy7p0oOKJ8drwryWSGI1pmuWUrt27UjaI4hrr71WjB8/HskxtV0leONU3oBTKzyYsoH2AIb5p1ADqbwzIEc7AWkQBHfkBQsWOO6++25fzZo1MTO9oTA9OUbQwjeLgtFqv9+/jRa/Q/RaDSJyMx+sVChgsS0rASjU9yzonByDAzkFk03CHMU2jc7zwEAg0Dk2NrZux44d41588UWPrYrDqOBokU+dAAAgAElEQVTAXRwkOTjBwTAMwzDMqQBNCM8OJDp+++03w4geHm1oYYYuVPnggw/E7bff7jzjjDNcpFc8wvTsiBWmXweSHTAn7ULcKEzTeiQ63iKds5w2zz8QO7GJJo6FqOCwV76qVRzHxcnaSqe7SqO+LC7286befFOPkc/xGdqK4MmxmrQpqrizxIkkR1JMTIyvevXq4oYbbhBz5841KonybJXh0KXQqJzgKHtoD2CYU6WwjS3uCmDRwZ1/lDpanhzBckWYT02YMEF069bNW7Vq1aS4uLhz/X4/2lVGC2uELAUkjDrNscyJ7AuprFQIRXEWYd2iXZLQ/d2h2niMAIPz5/V6jwcCgUOWJwfKOl8W5iz6TmeeeWb9O++8M+G9997zZWdnO9D3iOunXk/pyaE+54QHwzAMw5Q+7Det7J+r/h2yercA1IoPu09HhO21oRFhWIqJLBg/SxrRoEqVKsBVrVq16Fq1alUm3XJOWlpai5SUlB4VKlS43e12YzLHROIdYbaufEfgpg58OlDF+qc4cXOsqFrr72hMnaYLZwr7nupnMskBbfqXCOHJERERsYX0//LIyMjJLpcLSQ7c8EwnEgjPxRdf7Pi///s/sXr1aqOVmvQppvwZOlS2VskWavvvlfVo6UV7AMOcKrrAh8wq7vxj8UElQJ6SeUVAXLZsmRgzZoy4/vrrfWhXoUB1vjA9OYYR04kVtBHfRBvyHNqc54bw5FArOtSER1EXZd2xJQ3d3y2Dif2uRJ705KAAgkSHHCH7MTGBuD8qKqp769atGw4aNChhwoQJvoULFxpJKOWaGuIEiSr04iKosCcHwzAMw5ROiprgkG0CQCY15GvcdQdWgiOUb4ea4Ai2tUBjwBsMG1t4dpBONNoVAIxKb7vtNs8tt9wSS5+dcdVVV6VfeOGFrWNjY9G6crsw2x2eJV4hPiQ+I34kdtAG+gBxpABfDom9wkOtRtBpx6IcUxooaoJD6lI1wZHveNL2B30+30bSp8vcbvdUem+wMKtz6hKVqlat6r3sssuM3wJamhYtWmRM6sHEPwBfGKlH8ShvwNl/w7rfOxNeaA9gmFOlsIUD70nzKttGOBjAtm/fbmRk4aw9evRoP22wk2lxwwjZ7sQgYgotfJ/6/f5NgUAA/XrqQqpu4mX/ZEHtGYUtvLpFvCSh+7vtAUVifI4EkdWLivdwN2MjsYyYRoF+aEpKSub555/foHPnzgl0PTzwS1GuqSFOjhw54jxw4ABw8JguhmEYhimd6BIceE/18JDT1+zYTCBDeXeE/L+Pu/Uwp3/vvfcMnTh79myD999/X3z44YdoY3HT88DMmTMr3X777VXq0H/CbF3JEOZkDkyNe0SYVR3ziM+9Xu8vpCX3onWlgAQH9JHqyyGxVw2fqk4rLRQ3waEmi/Idb3ly5BBbnE4nhg0gyXGvMMcF14mKiqpUq1Ytd4sWLWBCi2EFjqVLlzr27t2LBIfzjz/+cMp9BvYc0Kby98Z6tPSiPYBh/g3sgRHIMkZ5DBYkZPjhy0HBynHrrbd6q1Wrhpno9YluRBYtfDNoU74CSQ56zAmxaOJRZzpa2MKrW8TDCft3U89RvmPpvMJlPIfOKco3EVBmREREDKbg36VChQr1u3btmjBp0iTfjh07VPGBCg6UA6I80GFLXIW89rrfCcMwDMMwjB1oDFRy0CbW0Inw7gB4reDYtGmTc8KECe5OnTpFR0ZGQkPClBQ6so0wp3P0J33zOG2eXyUWE2tJA+2g91HNetSmoXJFfsNRruAoPgVp0dwQr/OU14eJrXRtPiF9+iJdpzvpdQd6XZu0agWfz+eEJwcqet59912xb98+JNCcgPQmxhYbvxdl0AHr0VKM9gCG+acobCHBYoNWFdz5xwJkb1n55ZdfxPPPPy+6dOnirlmzZnxiYmJDWswwXWWEMNtVYIwJTw4Yj+aivNC2mNqDT0HoFmLdwl2S0H0ve6tKsJUH1Rx+vz/PqozBeUW/6kRhZs27nHPOOQ0GDBiQ+P7773vXrVtnmIGpySl5jY9blTrsycEwDMMwZRddtQd0Am50Ke0roTBaWrBhzQvdzpJvioYEU+AGDhwozj//fFG7dm0vUZGoTpxHmrJjQkLCdaQdh5O+eYF4m1hB/EjvbSM9uZ/4E9qyCLrLrr10GrI4x4YzRT0HUpfKMbL2c37I7XZvIG06Pyoq6hmXy3WrMBNV1Ykor9frwHhhmI7aq4LwG0PSqyDTUftNV93vmSnZaA9gmH8KXYJDTuMIleCAYRAC1FNPPSXuuOMOb4cOHZKqVq2KmdhIcqAfD6NNl9PGHCPAcojjNk8ONctekBu2buENt4BTlO+lnpOgJwcSRBjDGxkZedzj8eAuRrYwR8hOIgZXqFChR9u2bRvde++9iWPHjvXOnz/fGPOrXFMjoJBYMXog2ZODYRiGYcoup5LgsPl1BBMceScMSUMlN05qa8FNsldffVUMHTpUDBgwADhJv0TTY+V+/frVPv/88y/0+/3wdbieGEKMJd4g/bOEdNBaa3IfqlqP2UbK2nWV3JzbDd11WqwoejScKYoelchziDagk5JKdA32BQKBn4gPXC7XM/TeTURzogpdm6hevXo5FyxYIK99cC+B39L+/fsNA1J1gmOo3yfr0fBHewDD/FMUJbjJPs1Qn2MD/dVXXwlsph944AFv8+bN4aDcgOhMDCSm0GL3aVRU1CYCgUhdSNUNfEHzzIuy8OoW8ZJEcb6XGoiNY5DkoPOZZ921QPuPHCH7CgWR4cnJyT3S09MbZGRkJDz44IOeVatWqdfMCCgkRAxPDkzLYU8OhmEYhimb6DQgwM2uomD79wX6dEh+//138f333xvm9Z988okBPXfQo3fq1Kkx/fr1SyBNU4P0DW6ctSOuJrJ8Pt9zMTExb0dHR39Gz7O9Xu8+0kVHbVXCUlOpG/Mj4oTmVJMcOi0WrnpTx6no0ZMMRwHOv9/v30/X4id6/QHxBNGPuICuUypdy8DixYvlbyKY4IAB/r59+6BHjURaYb9P1qPhj/YAhjkd2BcWBDBkW0ONIsXihPKzG264wZOamop+ynrCNB4dSsyEJwcFok20Cc8RJxs/ySBUFhIchVFQQLUHYfn8GCo5iC30fBUx3eFwDKIg3yU2NrZ+z549E2bMmOHF+Fj7NUVQUV2sC7v2ut8JwzAMwzBMcYCeVNsTVNauXSseffRR50UXXeQnXVOR9M0ZxHnCnNRxC+nJR0j7zBTmZLnvCfhzQF/KqR+hvCNyC3hdVC1WmvSmjlA6NN8NN/U1afvjmJxIWn+vMEf9ziZGEZdXrly58TXXXJMyZ84cP26syesvNSZpUdx4c3CLSulHewDD/BvoFhJshhGMfv/9d2PsKB2jzkEXP/74o3jmmWdE165d3fXr149PSUlpREEII8CGE9OE6RmxiYLVAVoMj4UY+aUGnIJMokpbgCnse8mgYq90MQy2cP4wQjYQCBymQL9V5Pfk6NqA/rv//vsT3nvvPe8333wjtm3bls+TQ15zOTZOHdNVnN8FwzAMwzClG50WgJaQ7SxIWoQA2tGYoEFaJIL+NwpsY0HLwjvvvCNuvfVWcd5554maNWv6K1asmCjMm2fwd+grzLaVccL058B0uR+IraSN9hJ/EMcLGS2r3jwqjsYs6nHhhu4chEp4oCLG8OTAebYm/kGf7qZHTL+ZQXuALEz769atW8Mnn3wyfsmSJW4kr1D9rSQ0gpN5iqNHdb9XpuShPYBh/g10wQsLDgIX/BusjbIsMzMWpv3794uPP/5YPPfcc+Lee+/1ZmRkJFWuXPlcWux6CLNdZRKx3OVyZcOTgxa/47aSQrmZx2NxWlbCmaIEFLU08CRPDhiP0jmVnhyfCPM8Z8XHx2e2bds2/a677oqnwOL96KOPhFrNYV03XMugJwdn0BmGYRiGsaPTAnJzKpMc0Ik2HBYYEareIAvp0fHdd9+JGTNmiFGjRol+/fqJhg0bemnjHEf65kyiCdGJuEGYlcLw53iLdNEyj8fzA7GL+IMw2noLuKF2zEZBFR1F1WzhjE5nF5TgAMdxbuGDYmn6P+mcbyWdj8rtqRUrVhzcqFGjrldcccU5999/f/mxY8c64d+Hym/rWgdvlMqqHvx+QrQ9sRYNc7QHMMy/gS544T11Prr9GLyPyR3oqVy4cKFjxIgRvvPPPx8Zd4z+QiBCZcEUCjjLA4HAxsjISKOSQ1k81UAjeyU5wZE/oMhzYhyDYGKZa+H9A+KEJ8dMOs9Dk5KSMjFdpX379gmPPPKI9+uvv1avmeyBhCdHcIxscX8XDMMwDMOUbnRaAO/pfDokRdESuGn2888/iy+++EJMmjRJ9OrVS8THx3tI30QTaIVGogNtKxnENcRw2li/5PV65xFfElsJtPEeUzbfeYqWOqrACY5T06NBTw4lgZRL1wGDBTa53e7ldA2mxMbG3nvGGWe0q1evXo3u3bvHjB071oFra11rQ4tikAFutMGbBUkO3Q033e+HKXloD2CY00FhwUwmO2Tpof1zLFBvv/226Nu3r7ty5cqxFFzq0uKH3kmUFE7HokdBJ5ve+12c8ORQF1M12OTa0C3E4Yrue6kB5aRjkSyiQHLIaleBJwfaglA50zkuLq4+iYPE119/3bdnz56TklTSDV1mzDmIMAzDMAxzquiSISrS4+3w4cMhp7t9+eWXRiUH2lVI6wAH4SMqkZ48MzIy8gLSPqgWvod4inhTmDd7NhC7icOKdlJ9JOzaK5QWK416U4fue6vaXD3OOLcul+sYKrVRsS1MnxSM+sVklWbVqlVLu/nmmwMffPCBE9cbewlVj6KVCZU+9t8I69HwR3sAw5wOdAkOBCH0SR44cEBYI8LylRp+++234oknnhDdunWLoKAUV7Vq1QYUgHoKs5wQI2TRM7lRenLYxnzZExuFeXKUluCj+y7ynBxTHuWdB6MMU3pyUMCH8SjO70RheXI0btw4PSsrK2HOnDmezz//XGzZsiXkWC7ZR1uUHkgOOAzDMAzD2NElONQRtNjoopLUGhnqpM/gy+HKszw69u7d63jttdfETTfdJJo3by4uvvhi0axZMzx30PNAvXr1UmJjYxuS1ukozLYVGFy+TLwnzBs+SHTsIQ6j4rUAXw5VZxWkNQvTbTqNF04U5Xur5wmPQY846HnS+7n0iMri9cK8Do8Sfem9i1q1alXloYceipo/f74DkxhR/a38PoKeHOokR50e1f0emf8e7QEMczrQJTikJ4fMuOcpixL47bffDE+OF198UdDG2tOxY8eE+Ph4BCBMV7lPmF4RS2kRNNpVfD5frlJCiAVTViuEKiEsywkOeQ7UvlEZUAxfDjqPh8QJTw4kk4YkJib2bNOmTUMSCPH/93//58VoXxIN6nV10nU13KzRroIsuq5EkIMKwzAMwzB2dAkOOYUPSQ45oQ9+YLYbZsZNMxyHKo7p06cbN84ef/xxMWbMGOP5ww8/DI8O/znnnJNAWqc2cRHRlbiFGC3MRAdGl37tdru3Ejm2G2oSeeNIHSlr15yF6TadxgsniqJHVdQKY6MdyPI+wWsklr4Rphnsw0TftLS0CzMyMlLuuOMOH4YTYFSwNaER1x5JLQd+H9hf4EYqe3KUDrQHMMzpQJfgUANUqGMQtGBquWHDBrF48WIxdOhQT3p6Ovom4cnxP+J+YrLlyZFteXLI0kF1wZQzzDnBcXJAkRjHIGBbSSK8h5Fp+Tw54uPju1WvXr1eu3bt4kkcuOGXYl0vQ1DIBAfupMgxssX5XTAMwzAMw+gSHCrSm0O2K4Q6fvfu3WLdunXGxL4ffvjBAM/XrFkj4OnQoUMHkjmeGNI78H6rJcxEB26o3Uk8Qbzldrs/I7JJa+aQXrLrrIISHOqNpcJ0mU7jhROnokfzecQpCaQ/hTnGdw3xBvGg3+/vlZiY2KhGjRrxmZmZES+99JLYvHkzrnUwwYHfglXZYzxygiP80R7AMP8FumCFzTAWIZs5kFHRsW/fPjFr1ixx+eWXu2lRi/P5fHVdLhcCj+HJQcEG01XQrpKjLpAKhXly6BbqcEUXYNSMuRpkjGPpfOZSEDnk9Xq30HlFkmOqMCtn/kfXoN4111wTN3v2bMOTA5lzNZmB5BSQfZEcRBiGYRiG+afQaUqZ8JAo3hwOBZhTGjfR7rzzTlG7dm0RFRXlJCKJJKJuTEzMpdHR0deTzkT1wExiKbGO+I34Q5ysI1XNZddhpTWhoUP3vUPpUckxt9t9MDIychs9riY9+gq9lyXMG521a9SoUe7uu+92Lly40KjWsE/0gx8H9Chr0fBHewDD/BfoghEWIOnJgQUpzywtNDKxOAZZ9scee0z07NnT3bRp0/hq1ao1pE04PDmQ5JgszHYKZNYP0CJoeHLYFleZ0FBbM0IlOHQLcbigC6bynNg9OYxzgpnkFNzBQTrPqOTA+Z0gTE+ObhdddFGDrKysxLfeesu7YsUKI3tuu7YOmbhC+Wgo4y/d74JhGIZhGMZOYdpBjpxFa4K14Q0mNPIsXw4Fo1IY7dDXXHONyMjIkLiJ2DZt2tSqW7duc9JCvUn7DBam4eVc4gun04lJH/uII3LSiq11xa6z7FXEhem2UK/DFd33sGvzfHoUk2wCgQCSHFswyleYWvR2oo3f769+6aWXRj/00EMRc+fOFatXrxY7duxQfw/B1vfCqnyYko/2AIb5L9AlOKQnh1INIIORccyuXbsEZl9PmTJFDB8+3NuhQ4fEChUqwJOjmzArCyYSy7xebzYFohx6PG4zHS3Ik6O4C3G4UNQER6jEj+HJAT8OIteqjMkWiidHcnJyZsuWLdOvvvrqeAosbpk9V64r7ozA5TroycElggzDMAzD/F2KoimhJXHzzHo/X+WG8tyY3IcbNTNmzDASHWh5sHA/8sgj5S+77LIqpHkaCXOkLExI4c0xnTbeS0hv/kjs8fl8x+BjZnlHyEQH9JSqOe2JjsJ0W6jX4Yrue6haVOr1o/J4S4/m0vk9KEzD1/nCnHaDa9GievXqae3atYu6/vrrxVNPPSVWrlypVusEhxfgNyFvuOl+X0zJQ3sAw/wX6IIRUGecW8EpmHnFooR2CEzvWLRokWPgwIHeOnXqwJOjHtFJmJ4cUzFCFp4cFGwOKD2ScjPPCY6CP1cDjHEMArR1Do8iyUFIT44ZFGyyKlas2DUlJaVehw4dKj3zzDMeZS65LP00EhvSk4MTHAzDMAzD/F2KoimLqi2gLzGJIzs7W2zatCkfn376qWv06NG+Jk2axJL2OZO4kED18EDSmy9GRUV9QHxHmug3ev2XrOSwdBT0FPw4OMFRvASHTAzZ9SjO3x56XEuPs4n/I672+/0XVqpUKblKlSqunj17GjdCrckq+RIcSGzgJqqS9GLCCO0BDFMS0AUnVHNgY4yqANuUFQeqOaZOnSoyMzMNT47o6Oj6Ho8nkxa6YcR0Ci4riGx6flBdIJWFNlSpYLgHEB2672mv4lArO45T4D6OdhUK4ptxfoU5xWYA8T8KKnUwXWXu3LkeTL9Bm5EaQGQPrF10FEV4MAzDMAzDFIROV8gbaLKiww5aWHBDJs82fQX/FtUdb7zxhujTp4+jatWqkeXKlUsmHSSrh+8hnhVmy8pXxBYCo02D1QcFUNoSGMVFl8iB7gxl1IrPDtP53x4ZGbmadOksh8Mxgt7rIcybneXPOecc58CBA40pjNCjuH7Sl8Oe4GAtGl5oD2CYkoAuGFkJDpGTk4PF6CRPjs8++8wY9XXVVVe5W7VqlQBPDmuRg/nQZGG2U2xyuVw51jxtdXHNLYDSnFHX/d0y8VNQD6ThyeH3+w+i71SYRlvog7yPgkzXZs2apWdlZcW/8sorXgQWy9FaxRAQuFOCa8ueHAzDMAzD/F10CQ7pvQD9ATN7FWusbCh/jmAFMUbMYhxpv379xCWXXOKtVatWAukebKg7CLNN4iFiBrGI+I7YRRwm3Xk8hC9HngitPYuiKXU6LlzQ6Wq12lrVpTiXuV6v9yDp0c0+n28lvZYG+LgWNcuVK1e+Y8eOnoceeki89tprYsmSJeKnn34S+/fvN7QnqonxO5BJL9WTg/VnyUZ7AMOUBHQJDmkQBSxH5GC/JICJ0PLly43pKqNGjfK2a9cuIRAINKAFroswjTAn0sK3nBbATfS+3ZNDrVZQW1Y4wZG/RDB4TpAgQpKDgjrexx2KjcJMIiG4DElJScls1qxZ/csvvzx+9OjRHgQVW++rk66pE34cqMzhueQMwzAMw/xddAkOdTMLbalim9qXT2dKMGIWvg6o5Pi///s/0a1bN29cXFwl0j41hdmygptrqOZ4mnhbmAak20l3HoZhO/STxhOuoBtsxdVx4YJOV4eqKD4m/z2dT/id5FgG+B8L0/j1VqI1nfeaZ555ZoW2bdtG9O7dWzz44INi3rx5js2bNzsOHTqEdmmnTHDIih75G2D9WbLRHsAw4YA9YMnAJD/HooQKj19//VXA4HLAgAHuWrVqoUeyjjDHR91PAWUaBZcVUVFR2RRo1Lnl6ma+rCQ4dIT6ngUF3WOKJ8dKYgad56zo6OgulSpVqtexY8f4F154watUcRiiAWWgyJ5zgoNhGIZhmJKKqkGgPVFNjJYH3FgbNmyYSE9PjyDtE0UkEOcQlxDXEQ+SNppFG+3VtAHfQptxVL3K9gpVW9krZYuiKcuK/rRXt+S74aYcg5tt6+j8vk+PY4jriZak988oV65cZHJyMlrZDeNYeMRZI2OdsmUaiQ5lsAHrzxKO9gCGKYkUtrBgI4xFCBvjQ4cOyZFfwT7Jbdu2iYkTJ4ru3btHpKSkVIqNja3n8/m6C8uTA5Uc1mb8IEyKQozxklni4yGwH1vQohxuAUf3d6tlgfZsOhytDU8Oj8ezhc6n6snRqXr16vVvv/32hPfee8+7ZcsWB8xhkdCQ11P15FCNZQu688IBh2EYhmGYU6Go1R24cYZNL3QmvBtQcWqZ3cv2FSfpGcfMmTNFr169RLVq1QRpTujOcqmpqTXosTltqvvExMQ8QFroVQIjTX8m9hB/or0iRLtKKN2p06Kh/p1O84UT6veS+lOatarJoKMRERG/+v3+rwKBwJtutxutQn2I8wgMIYi46KKLjPYiDCiwrrnRfoTrjn0FrjWuO+vPko/2AIYpiegSHNggI4MeIsFhZF8x4uuJJ54Q1113nevSSy+NP+OMM9KFWTY4SJgjZD+hwJJNG/IDGDcVwpND9Z6QmeKynOCQgUU9J8EMOtpVIiMjkeiAkSuSR2hXwXkeSO9ntmrVqtGgQYMSJ06c6EOFjRJcJEZFB/pfZQadAwzDMAzDMP8kRUlwQINIjzDoTFQII8FBOkX15jA0JzzgnnzySXHjjTeKa6+9FrpTXH/99TH0vFqnTp3Or1mz5uWkhQYT4wlUF3xN+nMbxpyG0J+q3lJvJOn0pe7zcKawBEe+70rn8g/SnNujo6M/p/M7i94bTnQlahMxTZo0cT3//PNi37598pobCQ4ktLCnwHXGNWf9WfLRHsAwJRFdAJLBx5ZpzefJsWrVKjF37lwxevRob9u2beNosasvzBGyqCyYSAvhMr/fvxGeHDAeVRZJNbAU1hNZ1hIcaoCRGJ8jQGPeOz3ivRxhJjmWE9OJYSkpKT0vuOCC9C5duiTAk2PZsmXqNTUSVCgVpAADgqZPxfldMAzDMAzDFIZOX8okh6wuhc7EplfRm/m8OVA1jFYV6M05c+YYj4Tz3XffDTz88MOVL7nkkgakMTuSFrqZeIx4k7TSKtqIb46KioL+tOutgqoUynKCQz7ab7TlO9bpdB73+XyH6Nxuo+domZ5M3Em0ItKaN28e/fLLL0dgIqN1DY0EB64tjEcJ4yYb68+Sj/YAhgk31EVGIs2B5DF4DUdsZGQ/+ugjcfvtt7uqVasGEyh4ciDJMdDy5Fju9/s30WOOOLFhV4NEYT2RpSnBocP+3WSgCXUOjrlcroMUwDEi7TNiBr3OoqDTpWLFivW7dOkSTwHGu3379nzX1Wo9MoyfuESQYRiGYZj/Gp3ugNZERQDaWKA5JfTa8eGHH3puu+222LS0tFqkhVoQ/YiHSH++6vF4PiX9mU36E94R6mZdaizpB8cJjhOPuTbU95HgQEUxJqscFqb5/QLiCaIv6dAml1xyScr48eMjSX86retnJKqgP1GpgyodvsEWHmgPYJhwoLCFRfXkQKBR5pcbmdns7Gwxbtw4QRtrV40aNSolJiY2oM12pjA9OTD1A5UG2QSMMo+FGOMVKrioC25pDDi676W28eQrpcT5o/OLMbKH4MlB70lPDkyz6XL22Wc36N+/f+L777/vW79+vWPXrl35PDnUa636c3DAYRiGYRjm36QwXSF1iazqsHlyyLaVYHXHhg0bxNixY52dO3cuR/qzGunPi0kf9SEtNFKY+hNTP9YRe0h3/mEzILWjbux1+lL3eUmmON8LyGoXeOodRzWx2+3G+3vpfH5Lz1/3er3DoqOjM1u2bNlgxIgRcQsWLHCT/hQ7d+5U9ae8lsZr1RNO95thTj/aAxgmHNAlOLBAoeQsRILDeG/p0qWGJ8ett97qbt++fWKVKlUaihOeHJOJZfDkwHQVGGaG8ORQN/Jq5UJxFmLdol6SKMr3sic3DE8OJIfoHKqeHNnEUmF6cgwqX758Ztu2bRvdd999iS+88IJv/vz5RkuR7boanhyo6GBPDoZhGIZhTgfFSXAoHnAyuZEvwQFdumTJEjFmzBgn6c9o0p9ppD/PF6b+xE0fjDT9gDbiaz0ezw5UHhTiyVFWKjqK873sCQ6jZdo6h39Z43lRKTMpKirq3jp16nTs0aPHWUOGDIkh/SkWLFig6s+glx8IMTqYKUFoD2CYcKCoAce2EAWDDNoh1qxZIz744AMxatQob/PmzYAYccQAACAASURBVOGo3ECY7Sr3EZNdLtcyjJC1eiLVckF1A68GmOIuxLpFvSRRnO9lLxc0ygQRYOgR5wrtP9nCrOSYQe8bnhyNGjVK79ixY+KDDz7ohV+Kct2MIPPXX385Dxw4YHhycMsKwzAMwzD/Njq9CeTdfeUzh/1YeTw8Or744gvoT+fIkSOjLr74YoySrUtcKkxfjidIf74TGRm5hvTnNrfb/YdNc8kbSX+JExpUpy91n5dkivO9ZIJDtpIbFdhWFfZx0qAwcv2FWEzac3zFihVvr1GjRssmTZqk/u9///M8/PDDYvXq1fL65UtwIIFlVelofzPM6Ud7AMOEO2owksh51vJz6YoNh+R58+aJG264wZ2amhonzCDThcgipsKTw+fzZVOw+V2c6Im0L6RlIcFRGKECjEx0qN9TvneMzutBq13F8OSgoJNF57grBZsGmZmZCdOnT/fu2rXLYb+umKpy+PBhB1dwMAzDMAxTkpH6U7Y9yBtwaGWB/pwzZ47juuuuwyjZ8qSFziRaEjcQj5MmepP05+e0Ed9Grw+Jk3Wmqj91+lL3ebhSkPaUSR/1WIzhPULacy/xI71+n14/TvrzKjrXDSpVqlTxsssuM8b8/vbbb7he+cxjOcFRstEewDDhhj2ZYf8cwcSaW260OOTm5sqsrFE6uG7dOvHss8/Ck8Ndt27dOAo06X6/vyctfkOIKcKcVf4LcQAVCDZPDrmYygBzzPa6NAYUoAuk9laV4PQZnD86v3mBQOCQ1+tFkgOeJ5OFWTnTrV69euloV5k3b57/22+/deBuh+rJIa+5TFIV5Mmh+10wDMMwDMMUh8J0hZy2gipT3FSD9sQ0jn379kF/Ounf5Bsp++OPP4qnn35adO7cWZD+jE5OTq7u8/mQ5LiOeIh4lVhJmnNTRETE76Sfjtg84VQ9Vhz9Gc7atLC/PTcEwWprOne5Ho/nT2I3vf6awOjYgUQ74syGDRsGBg0aFIHq7m+++UZs3LhR7N2717ieaG/HNZUVxHZPDtab/y3aAxgm3NBtZKUnBwINMul5J0rPjMwsnK4//vhj8dxzz4kBAwZ4MjIyElJSUuDJ0U2Ym+6JxFIKLtkUeA6EmFOubuaL0xMZzhQlcIby5DCSQxiDhiSH2+3GXQmMkEUSaTIxJDY2tkebNm0a3nXXXYlPPfWUF1NvYDyqXFMjq05BxpiwgoAjkxzF+V0wDMMwDMMUh8J0hXrzRVYOw3fDmsaRT3sCJD/gyYGbbPfcc4/o0KFDTOXKlauRFmpKXEkMJaa6XK5PSDOtJ/25j/Sn2jItNRe01qmOkdXpvZJGcRMc8gab4QkH01HiT3q9XZja83lhVs00i4+Pr3rppZcG+vfvD58U8dZbb4lvv/3W2CeQ3nTiJqlMcEhPDk5wlAy0BzBMuKHbyOI9qyTQ3iNpgM9gKrR27VrDYGjkyJHeCy+8ED2R9Yj/CTPJMQntKvDkiIyMzKHFMZQnBxbQI4ITHPbvLZMcsrwy6MmBbDq9xkg0JDlQyTGDzvNQCvDd69at24CCffwjjzzi/fLLL9VrZlTf/Pnnn4YnB4RDqJYV3e+CYRiGYRimOOj0pkRWc0CfYFMcSn/iM+hPbKJhsD58+HBXkyZNAqSFkolzie7EQI/HMzE6Onoh6c/1Vsu0qr2kxpKeHKGqOIqj4Uo6xUlw4JhgggPHWJ4c+Aym92hVeVeY1TK9vV7v+SkpKZXr1avnbteunRg6dKj46KOPHL/++ivaow3dKfWmbFmR15X15n+L9gCGCXd0G1sEHGTVUW5mO8boiZw9e7bo16+fOzk5uRItgnVo0esqTE+O6RRYVlCg2UQbdPuccrnoqsmNUAutujjrFvFwQZfIUas47MdiQs0xTFeh87qZXq8U5qg0JJU6x8XF1evVq1f8rFmzvBRgThrRxQGGYRiGYZiSQGH6U95sg/4EyjFGVSqqBFAx0KdPH5GUlOQh/ZkoTPN7VBMjyfESsZj05wZh3hiy6y27H5w90ZFne14aOElT2pAVHEfEyUmfo6Q/ManmMzqv04XZlo5zfTYRSExMNK7F22+/bVTa5J2YjmNU4GAPAXiqSslAewDDhDu6BAeyrygZRDCBaWXeCT8OY4wsKjmefPJJ0a1bN1fjxo3jqlatmk4LIDw5jFJBYZa0baTgcwCbc6sSQV1s1aRGYT2RhSUFwgndd5Hn5JjyKFt5jHJBjJANBAIyyfEJMUGYSY4udA3SBw0alDBnzhwfnMe3bNkS0uQJSQ7cJSmKASknQBiGYRiG+SfRJTik/sTNNEV/uvKsjTN8H9Aa0bVrV3Huued6qlSpkkC6KF2YG+8BxEvEYtKc60l77if+CuHJkSf0+rMwHafTfCWJoiQ4pOa033A87na7D5D2/CU6OnoJPce5vZ1oRiTSuXVnZmaKd999V17LoHcf9GZOTo5xLUMlOFhvnn60BzBMuKNbWGQGHZ4c2BDn2Tw59uzZY3hyjB8/XmRlZXk6duyYkJiYKD05YEY0kVhKiyHaVQ74fD7DOFNZbO3GmgW1rIRrQLGj+y4yyMhzoAYbo1XF6/Xm4Ty6XC6MkN1ILBWmJ8dgOveZbdq0Sb/lllsSHn30UQ88OWD6pFxT2bLiQLsKpqxwwGEYhmEY5nSiS3CoFcTwEcs7cXPNMB3F9I7FixeLcePGiUGDBomMjAxfAv0nzJbpDOIuYpzH4/mI9OcPpJt+g/FoCM0lqxZKuydHYbpaak9Vcx5XHuEDdyQQCOwj1pEW/YDee5S4jDiH9GiFyy+/3A3NaV3DYAUH/FX27dtn3Ci19hFF/h0w/w7aAxgm3NEtLDLIqNM31OOQYUc7xPr16w3zp2HDhnnOPfdcOUK2kzArCyZTgFlOi6LhyUELowwK9gW1ME+OcA0odnTfJVTAkRjHIEFkJYnwHpIc8OT4lJhO5zkrPj6+W40aNeq1a9cu7rHHHnN///336jWFM7mR4MCkHBiPhqrw0P0uGIZhGIZhThVdgsOuP+X78hhslnfv3m3oz4ULF4ohQ4aIhg0bekgLVSTOEua0jztIFz1H+vMDJDlIf+5V9ZSls6A/pSdHUTRnuOrRwnS1XW/K7xbUn7jB5vP5jnq9XpxDTFVBq8rdROvy5ctX79u3b7n58+dHWNdHJqSM1mi0raASh/VmyUB7AMOUNnTJDgQUVHMA5c6/Uc2BBey1114TV111lTspKakSLYL1XS4XKjnQqwdPjuWo5HA4HNiUB02MlIW3ME8O3cIdrhQWSOV5sHtyqAEn1+/3G+0qdF5XCLOS417if4mJifWuvvrq+LffftuLShvcCVGDC7LqQHp1cIBhGIZhGOa/QKc/oV+gPW1eDkZFBzTOq6++Kq644gqRkJAQQfqzImlO+EN0IO6g58+S/vyIdNJP9Hq/yL+Jz6erlOfqZj8cExrFxf49pS439LrT6TyOqX50HjFVBZpzPr33ONE3OTn5wt69e6fOmjXLv337dll1E7yWmIqDG2vsAVcy0B7AMKUNXYDBhhi9dMjEKmO8gkZCmOCBnsgePXq4MF0lLS2tIS2GPYSZ5JgsTM+IbBiP0vvHbCNk7YkNtSeyKAtxOAYgXYJDTXLIx6AnB53DvKioKPhyHKIAjkoOtKvAkwP9p10uuOCCBllZWQmzZ8/2fPrpp4Ynh+3aOqRwwLUtiieH7jfEMAzDMAxTHHT6Extm6E9g6U/gsnDAd+yxxx4T8IIg/RlRtWrVWNKY55AWak/cJswRp/PpvXWknTBC9q8CdJm8qVTUBIfu83ChoASHYTqKymFrbCw+20ePX3u93ll+v39oUlJSj3bt2qUPHz680htvvBHxySefiA0bNhi60rqG8noZr+2VOczpRXsAw5Q2dAEGG2CUmynVAMEyNLBr1y6xdOlSMWnSJLSr+Dp06JAQGxsL0ydMV0FlwURimcfjyaaN+QFaHI8X0ZOjKAtxOAaYoiY4ZJBVA2/Qk4PO53FrWs0vxMfEJGJwcnJy99atWze49tpr4x5++GEPyjhh9KRcV2dubq7hxQFPDswtDzWejRMcDMMwDMP8W+j0JzbEBehPQ4Pu3LnTaJWeOHEi9Kdo3769p0KFCrHCbFe5RJimmGNJM31I+vMHevzV4XAU5skRqmVap+N0mq8kU1CCw6jggEGr0iL9l8vl2uLz+ZYRE8uVK3dv7dq1M9q1a1ejX79+UcOHDxdz5841Wtitaxj07gNIfBQ0Dpj599EewDClDV2AAXJeuXyODbI8BgsWSgU3b94sFi1a5Bg0aJCnfv36lWgxxAjZjsT9xBS32w1Pjo20MObQYikTGOpmXq1UKOsJDpWT2nasOeV4jnN1gJ5n0yPaVeDJMTg2NrZrlSpV6lKwj3v66afd6FdVrisSGkZi48CBA0aigxMcDMMwDMOcToqqP2VbrdSi8hhsmqE/N23aBP0p7r//flGnTh0XaaFyRA3iUuJ20p/w5Hif9Of3pD/3CFNrSt2VK/KPSi2LCQ71tdoirR4Lo/vf6Ryup/O5gJ6PpXN6U1xc3IWpqakJLVq0cD300EPi66+/ltcnX4IDSSrZIq37XTD/PNoDGKa0ows4WKCsaRwy0ATL0JC5nT59urj88ssjkpKSKkZHR9ehDbf05JgWERGxjMgWplFmqCRGqOAS7gFEh+57yuSPDDjqOULLSm5kZKTqyTFJWJ4cKSkp9W644Yb4OXPmeHBtrDaj4PXEHRHZomJH9zthGIZhGIb5pyiK/kS7SihPDmicqVOnol1aJCYmOkh/liNdVFuY7Sp3kPZ8jviInsOTY5/Iv4mX2qqgG0s6nRYuFKat7d/bfi6O0/n7E1UwLpdrLb1+hxhFdCFqxcbGBq666irHrFmzxLZt2+DRB1P7oA+cmuBgvXn60R7AMKWdogYYYBvjZSQ5Vq1aZXhy9OrVK6Jly5Zx1apVS6eNNzw5Bgtz872MyMbI0xCeHLkFUJSgEq4BSPd3ywBj9+QwAi8MoODJAeNRK3kkPTnupdfdmjVrlj5kyJAECjo+tBKh0sZ2XY2KDlxXlIKyJwfDMAzDMKebouhP3Kix9Cfel54chgZduXKlePTRR6E/RYsWLZxpaWmVSH/CeBRJDrSrvECg+kB6ctjbVfIUnRWqXSXc9KWd4iY4ZHWLkQyCyT1pzsP0uJNerxSm1ryJaEqkNGnSJHLAgAFO3Oj88MMPHV9//bUDbezWsAKYjgarwfEYKtnBGvPfQXsAw5R2dAFGenIopWb5jIR27Nghli1bJl555RUxatQob7t27RKio6PhydFZmJUFkyjgLKMNOTw5cuDJYbVb5In8gUV6cnCC4+SAE7zzgASR5XKN96UnB4xdpxBDUlNTezRv3jydAn7C6NGjvZghj+tnXS8jQUWBxomqHBIN+Vyvi/q7YBiGYRiG+TsUR38qFRzBVghM84DZJfTniBEjxKWXXuoJBAJyhCzaVe4kvTnO5/MtIP35E8af0utjIfTWEXHCk4MTHJbJPbQ6khxOp/Mwvf6ZmEs8QPQk0pOSkhKbNm3qu+yyy9Au5JgxY4Zj7dq1RvXGoUOHnNCXMrGBpAdXEJ8+tAcwTFnHvgjZeyKxYCHDjlnl6IkcMGCA+6yzzoInB5yt/0fcT4vkVNqUL4+MjMymAKO2q6gLrGo6WpSgUloCkB3795LnKNSxxzCSl4LPZmFm12e63e4hMTExXePi4hpkZGQkPP/8897s7Gz1miLgGF4cnOBgGIZhGKYkAv1hv+svWyAANs2///67YX6/YMEC0b9/f1GrVq0IYXpy1CI6kEbqT7poHOnP+aQ/19N7vwtrA6/oK7v+LK360o6a4JCvgwkOBZyH3cRndD5fpsf+RIbL5apNerM86U1Hs2bNxMiRIx2Y5ofrQjjpWjmkp4psWeEEx+lBewDDlDV0GXUsUtgYo9cOG+W8Ew7XDlRzwN26e/furuTk5NiKFSvW8/l83WkhHEpMQyWHZZAJo8xjinmmXEALKhHUBRzd5yUZ3d+ttquoFS/G8RSwcwOBwCF63GJ5ckwm7iO6oF3otttuS5w3b55/69atDphzKdUccoyXQ4oIVUgU53fBMAzDMAzzdyhMZ0CfQL/ghpqlP/G+bJl2btu2zTFhwgTRrVs3UblyZSfpz4qki+oJs5p4AOmjF4kl9HwjPUKDHlV0l0x05Nqeh9KjRdFtJRXd94C2RCXL0RCfHfB4PD+R3nyPdP0Yp9N5vTBbVSoT7qpVqxoJJrQNWdcs2MqOawUfFVw/Nh09PWgPYJiyhi7BgQUK/ZAYRYrsbJ7iyYGFa/ny5eLxxx8X/fr1c7Vt2zY+LS2toTDL2eDJMVkonhy0WOYW4MlhDza6BIbu85KM7u+2B9tgggPJIYyQtTw5DtHrTcJsV5lIDKL3Mlu2bNlw8ODBiVOmTDHaVbZu3Wq/roYnByo52JODYRiGYZj/Al2CQ3pyWPoT70N/wpMDrbcOtEs/9thj4uqrrxZt2rTBpjuBtBCSHJ2IAcLyhXO73RtJf/5O+tNeqSA1p86TQ6fbSiq676FWcNg/+4v05q5y5cqtIc35mtPpHEHvYagA2oGiEhMTxT333CO++eYbec3yJTiQlMINUk5wnB60BzBMWUOX4EBQkfOtrWPyeXKgJxIZ3NmzZwt4QCDJ4fP5GgjFk4MWRnhybAwEAr+jAkFZfNUNvDpCVpfA0H1ektH93fbvppYTGp4cFKzxiM/Q/pNNLCdmEMNSU1N7XnTRRQ27deuWiOuBflXl2hoJKpQS5uTkAIcsISzO74JhGIZhGObvoNOf2Cjb9CcI6k9M80CLBPTnqFGjROvWrX2kMWNJC9URZpLjftKfU0h/LqVN+gaPx3NA0VOqvrJ7wukSA+GC7nvI754rTv5ux0lrHqbzthUt5/QarSq3CbOKIyktLc01ePBg8cMPP8hrEvRK4QTH6Ud7AMMw+VEDkEx4WO7WBniNUjRk2dETeccdd7iqV68uPTkQYAbCk4MWSnhy/GIFGHs/pJroKO0JDh2hAlKo4ANQEXPQ5XJtoeeriFfo9RAK5l0rVqzYoFOnTgkTJkzwQgRY18tITklPDhiPcoKDYRiGYZiShF17qjfc5DGq/vzoo4/EbbfdJs444wwnaSEYj9YlupP+HEK6cwrpT1RywL/sYAitVVoTHHZCJTik7laPMZ6Ttjzu8/lySFeuo9fvEQ8SXYnaZ599dvTgwYMdX3zxhbwewcQTt6icfrQHMExZR1cyaAUThzWnPJ8nx6ZNm8S4ceNEly5dXBRkKsXHxzegxREjZIcR04h8nhxOp9PuyaEGF7VNoywlNOyoAeiklhU6v8fhyUEBXHpyTBJm5UyXs846q0H//v0T3n//fe+GDRscMIZVPTnUa82eHAzDMAzD/FcURX/CZNTSn3g/2LKyceNGx/PPPy86d+6MJIeb9Gci6aPGpIV6EcOJmcQXxE7SSkdIf4aa8BdKfxam2cJdj9p1NwhqTGuK31E6Vxgb+xm9fole30g0rVOnTuVbbrnF+/rrrzvWr18vNm/eLOD7hqoNXBt6dKgmozwy9t9FewDDlHV0AQaLF/ohEWDg5ZB3IsFhbJ7REvHkk0+KW2+91d2+ffuEqlWrwpMjkxgkTK+IpRRU0A95AO0qNk8ONbAUp6IjnNF9r1DnxKiAkZ4ckZGRCEKH6D14csDzZBIxOCYmpkfr1q0b3nfffYnjxo3zzZ8/XyjVHCBY0YFgxJ4cDMMwDMP8FxRFf8ITztKfeD9oOorPli5dKp544glBG2/Rrl07H+nPZNJCTYSZ5BhFvE266RvSTb8Rf1itvlJnqXpT1Z+FabZw16P2BIfarpOHm5AulwtaE/ryZ7fbPcfn842kc9eDzm19OseV+vfv73n66aeN0b1oV8fwASQ26Bo56TE4VQXaEokPTnD8O2gPYJiyTmELD96TLSrKRvgkT47PP/9cvP/+++KBBx7wtWjRIoGCCDw5ugjLk4MWzGUYIRsVFQWXZjWAqJv44nhyhDO676V+ftJdBSSIEIAoEOE9eHIgyYFKjhn02bCUlJTMxo0bo13F8ORQHK+BkZyiIOQ8cOCAEy0rtl7XIv0uGIZhGIZh/g5F0Z/YPNtuxDjk57iBA/353nvvGSNMmzdvHkmb8xTSQ+cTfYgxpJfeI+35HbGbNux/KjpL1Zuq/ixMk4W7HrVXSedLcOAmGpIcwjwXu+jcfer1el8ibXlXTExMu2rVqtU899xzy7Vq1cpIKk2ZMkV8//33RgLqjz/+gN+bkeCQXiryurGe/OfRHsAwTMHYFyaARUtte8Bihk0yqjyQ5LjpppvgbA1PDvRDwnh0kOXJYRiP0oL5uzh5RJU9g16aAkpxsX93GYROOg90XnPpfB6yPDk+I2ZQcBpMr7vAk6Nbt24JU6dO9e3cudOhXlfrzojhy8EVHAzDMAzDlCTs2lNOWVH1JzbS0J/w5Jg3b5648cYbRWpqqp+0UBWiGXEL6aSxHo/nQ9KfP5A22itOniAiExzSk0OnyXQariRjv2kmExzSJ0/lAJ2vH71e71x6/jidx2tJX15I7yWRno9o2rSpePjhh8VXX30lW54j6Do5ZGIKFTbyBhrryX8e7QEMw+SnsIVIGgnBkwNBBotZntKy8vPPP4vnnntOdO3a1VWnTp24lJSUBhRU4MkxhJgizBGnvxAY33W0AE+OXNvzUAmP0hRwCvse8jwcC4FRzUHnF2NkD1MA3yrMSo5JxH1EV7oG6ffee28SBX7/2rVrHbjboYoDwiGFg72csKDfBAcohmEYhmH+SXQ6QzUYtfQn3pctK45169aJZ599Fp5wgrRPdHJycg3SR+1JC/UnxhGLiI3EIdKdqh9HnjhRRVyUG2y6z0sS9r/T/lqtnlZ1Nz77w+12b6dz+Dmdq1eE6a2Hm5Y1CX+tWrUcI0aMkFNV5LUwbqYhsYGpKkhIsenov4P2AIZh8lNYgMFChcAiF64826goBJ6PP/5YPPPMM+Luu+/2ZGRkJKSkpMCTozsxUJib709oY77R5/OF8uSQm3k1q1zWExxq0MnXJ4oEkcfjgfEoRsmiZzJbmEmkScTg2NjYzLZt2zaE8ejTTz/tgev4rl271GtqtBuhrJCuqUOaRXGCg2EYhmGY04VOZ0CbSP2p3KgJJjhgRrpkyRIBfwjSn84OHTpUSE5OltP9BhCThVnpuot051+W14TUWqGmqoSsnBX5NVtJ15+6BIeqK48rr/HZMXjn+f3+TXSePhZmkugGYXqcVKpVq5b7oYceMsxGlWuRL8HBU1X+PbQHMAyTn8ICDN5DkEEmPdSihfdgOPTtt98KGFw+8MAD3qZNmybQYlhPmEEGlQWTaDP+SSAQ2BgZGYkSOLUkUF1sjwhOcNi/p5oAMo5BkgNJIrSr0GuM5A16ctB5Hlq5cuXMevXqNWjfvn38ww8/7F6zZo16zYzqGwpCQU+OUC0rOuHBMAzDMAxzquh0RgH6M+gJh8+gP7/55htDf44cOdJ94YUXxooT7dJDiTeIb0kb/Uab9yOo5FB0lZrgUKuHdbpMp/H+S4qS4LBXTstkB26cHfX7/ZiC+AO9fkeYVRz/I2qmp6fHPP744xFbtmxRr4XxnCs4/n20BzAMc+rIig5b24MBsunvvvuuuOaaa9zJycnSkwPztLOIaRRclnu93mzanGNTXpAnhz3YqOVzZRH1XJz0OZ3LY3RODxGY/f4pMZW4n+hUqVKluldccUXcrFmzvL/99ttJYoKuIdqOHDIYcUKDYRiGYZiSiE5/zp49W/Tt29eVlJQUTxoIlcS9iTHEh6Q/fyKdtM/pdP4lQicy1KqGcEpoFJdQN9GCnhyocqHzhOc7iOXEWOJa4oImTZokP/jgg354cNj1pOXB4WAPjn8P7QEMwxSMbmHCIgZzUbSmYDHLO+HHgZJBw135qaeeMjw5GjZsGJ+amtqQFsuewsykT7UWzGyHw3GANue5ViWCuvCqSY1jouDNfWkKPoV9FzXDrt51CAYjjJCNjo4+SAEclRxoV5kgzPLMTo0aNao3ePDg+Hnz5nm+/PJLsXXrVuMa2q+r3ZOjuL8LhmEYhmGYU0WnM2z6E+9JDWroz7Vr14rHH39cdO7c2UvaJ+XMM89sERsbe5vb7R5HOnQRscHpdML0Phe606Y9VV+K4yK/NtNpuHAiVIID1dPGTUdocjpfOA5VHN/T89fpvGX5fL4u6enpdW699daK06ZNc3766afG+YbPGyo3kNhQExxydCzfQPvn0B7AMEzB6AIMNsAILDB+CuXJsXfvXqMn8oUXXhADBw70ZmRkJCYlJUlPDlQWTCKW0aK50e/359CimWuNqJILr8yiy/7IfO0ZBSzSugW9pFOUBIea9AkmOBCMKPjAeBTTVVAZs5FA7+REYlBiYmL3tm3bNrj99tvjKPB7UMa5Z88e9ZrKlhUH2lUQoHCNi/u7YBiGYRiGOVV0OiOE/gRB03tUqi5cuFCMHTtWDB48OOqyyy6r0aBBg/blypXrTxrpRdKbS0kz4UbQH9BOih+c3OSX1QqOYIJDtkDjPYfDsY20+sd03jCV5taqVau2adWqVfVrr702ks6vGD9+vOHBt337duOaEBgbK+TYWDyXepL1499HewDDMAWjCzB4DwtWQXf6kWHfvXu3+Omnn8SiRYvE8OHDPeedd16cMNtVpCfHZIyQjYqKyoYnBy2marZc3cSrnhyFLdK6Bb2ko0tw2INRvqoWBCRljnmOMI1H4ckxnc7zkISEhK61atWq265du7jHHnvMjay7cs2cdB2NBAcm5cB4NFSFh+53wTAMwzAMc6rodEYB+jPoyYEN9c6dO8WPP/6IG22ORx55pEL79u3Pjo2N7ej1egeQHppKWmk1aaPd9PyYVamQJ8pegkM+qgkOaTSqVrbsp3P0HZ272fTeI6TX+5CePO/MM8+MnUbPSAAAIABJREFUa9CggbNfv35i8uTJYv369UbiCd5u0tNNjo2VepL1499HewDDMEVHF2yweKE8Ddlbm7GQY//+/eKNN94QvXv3Rk9kJVoo61Fw6SbMEbLTIyIiVtB7aFc5KE5OYhwXhRuO6hbxcEX3PWUCyB6IjfNE5zcXlTEej2cznVckOTCq916iIwWmun379q301ltveXCnA3dA1GoNvJbZd53QYBiGYRiG+bcoiv4k7ekAdmNLVBPPnDnT071797jo6Oj6wqwiHiVM48wfadOOqX7q6Nig0abIfyMplAbV6biSRFH0ZMhxuXRuDpGW3OLz+aAl0WKOG5TtiKqEp1mzZkZL+oYNG+R5D1ZzQ08q0xeZfwDtAQzDFB1dgMGGOCcnx+iJpIVM7Yc0SgZhRvTEE0+IzMxM1wUXXBCflpaW7na74ckB49HJwvSMyKaNeY7L5TpmGyErN+6hAo1uES8Nwaig71moJ0dUVBQ4SM/tnhxd6Bo0yMrKSpg9e7Z35cqVxrgve2JKCgcEplATVnS/C4ZhGIZhmL+DTn9Co0B77tu3T26kgyNkccxbb71l+HGQ9kkkziOuIZ4hvbkoMjLyF2taSLByQUHVWAXdZAsXfalLcAD7NBkj2UPn5giMWek8rafX84kniauEWZEd07BhQycSHKiayTvRrm5cH1wP+KVwguOfQ3sAwzBFRxdgZE+kUoqWz5Pj119/FUuXLhUTJ04Uw4YNgydHQqVKldKFOV0FlQUTiWUej8doV0FGvQBPDnuWWbeIh1MAUtEFTxmA5HmQ58aogMG5gyeHdR7RrrKRWCrMZFIWRsi2bt26wXXXXYcRsp4FCxYYAkG5rkbLCrw44MmhTlkp6u+CYRiGYRjm76DTn+oNNkV/GgkO6JZXX31VXHrppSR9hJ+oQrQh7nK73S/HxMR8HAgEcHPtYAiNpd44KgsJDvV7yoQHWlVySUv+6ff799Lrr4mZxN1EM6JykyZNfOPGjZMaMtgqBDDpBgmOUBNvmFNDewDDMEVHF2CANBRSXgcXOWRv0Q6xceNGeHI4Bg8e7Klfvz5GeCEDjNnaKHmbQgFnOTw5fD5fDtoslIVZXYCLYzoaTgFIRRc87Z+r1S3GMUhyWGWXOFe4Q5EtLE8OuGHHxcV1TUtLq9e+ffv4p556yrNu3Tr1uqKCwyE9OZDo4AQHwzAMwzCnE53+tFpUDKxjggkOVHVMmTJFJjicRDniHKIL6c3BgUBgCmnOlaSXtgtrQ69oLGgn1QOutCc4VA0pExxG+47H48klXY5zsZn4iHiIQKv5OS1btqw4fvx4NzR+npLcAFzB8c+jPYBhmFNHF3CQUcedf/TeWf4OMqvrwCI4Y8YMcfnll8OTI5YCTF1aPKUnxzQKNMsiIiKy6fkBZbFVKSjY6Bb4cEb3PWXyR/aP5gtWFMhzIyMjD3q93i10fpHkmCzMyplOycnJ9a+//vqEd99910vXxoE7IWowkg7Y6jXnpAbDMAzDMKcbuwaBPkGFAJA3244ePRpB2sWJ8aUzZ850XHXVVaJKlSoiOjraQzooibRPY+IK0kMjSW++Sc+/EydrTmgpe9vGSTeTwpTCkjVqcsf47jBiRVUwPd/rcDhW03l7kc7bTX6/v1nLli2rPvroo1Fr1qwxEkrQkLgWuA50DQxvFOjIUNeOKT7aAxiGOXWKkuDAIgewwOXZeiJXr15tzCnv1auXq0WLFnFnnHFGOi2WmbR4DhbmCFm0U2yk92CUaffkUEvpVIqS5NAlCkoqur9bBl/Vk0OC7LvhyREZGXnIGo8GT46XifspWHVv2rRpo6ysrMTXXnvN98knn4hNmzbZr6tR0YHEBwIXe3IwDMMwDHO6sesMayNtIPUnRpUeOnTIuXPnTsf8+fOdjzzyiJHkaNOmjahVq1YUbdarkP65kLiaeIpYBG1EG3n4lh21mY6qelN9XlydVpIoVoIDGtyaNvOH0+lcR5rybZ/PN4J0Zc9GjRo1vOGGG+Kff/559+zZs8WyZcsMw1Er0eGQY2Nl8kmdfsOasfhoD2AY5tTRJTjUjLrV2pCvLw9mRFgEZ86cKUaOHOlt3759Qrly5RrQ4tlFmJUFL1OA+YSC0KZAIJBjc7lWN/BHReGeHIUt6rpjSxK6v1smONQ7DcE2HgQnJDkoQOEz3KXYKMwkBxyxh6akpPRs0aJFAxIACQ8++KAHo33hp2JdLyNBRdcUggEVHuzJwTAMwzDMaSdUgkMdG4vNNLQKKgfgC7F+/XrH4sWLHa+88op45JFHRLdu3SLi4+MDpH3SiFbC9JOYSjpzFW3Yt9LG/SBpJpnAUBMc9mRHcXVaSaI4CQ6j5dnyxculxx2kJ6HPx9PjXcnJye2aNGlSo2vXrlHXX3+9GDNmjFi4cKHYsWOHvA7BBAdujskpfaGuJaNHewDDMKeOLsEhM7Vy1CgCDy1s+Tw5UMqGBRCeHPfdd5+ndu3acSK/J8dUl8u1Ap4ctJCqI2TVzbxMcMjWjOIs6rpjSxK6v9senPIlOAASRFaS6CgFqANWJcenxEwKUkPKly/fNTExsX5GRkb82LFjvb/88ot6XZHQMLw4OMHBMAzDMMx/gV1nqK+VBEew2hSb7L179zqhN1esWCFGjBghGjVqFCFMP46zCVQPP0B6883IyMg1Pp9vB2mkPxRtJW8cFdcDriRTrASH+u9IR+4jzbiWeIeeP0r6vG9MTEzjuLi42DPPPFP06dPHaEPfsmULrgWSGxEy+SSrgK3WddaMp4D2AIZh/jl0CQ8satgYwwTK7smBao7JkydjhGxE5cqVYytUqFCPAgw8OYYKy5ODwGbcGOWlbNTlIl0UA6hQAUf3eUlG971C3W0IVrnAMCoqKsqYbU7nEkmOKcKsnOlSrVq1Brfcckvi3Llz/du3b4cwyOeADcFA19AhE1gyiVVYsouDF8MwDMMw/zbSdFTxEguaju7fv1+89tpronfv3iItLc0VGxub6Pf70apyHTGG9NBc0pvf0/N94uTNvXrjKJz1ow71BqL6XY3ndH4Oeb3ezQS0I6qAoR0vIVKIiLZt24oJEyaIXbt2yXMfHBsLLalMW2ROAe0BDMP8cxQxwWG4KVuVHEFPDnz+6aefGp4cffr0cbVp0yaeNtkYIduTyBKmIeZyItvlcsGTIzeEJ4edsp7gUJMcaqWLcTzMouDJQYH9IAUruGKjXWUiMcjn83Vv2bJlw8GDBydOmzbNu3jxYiMTb7uuRkUHKjnYk4NhGIZhmJIA9Ah0iTS2zDuR4IDudKxZs0Y8++yz4tprrxXt27ePqlmz5hmkg9qS/rmNeJ5YQuCm2h/QmlZrRp5NU4WzftQhdbT6XeVrJDiOkE7cS6yn1x8SjxGXEWcRftKPjqlTp8o253wJDryH5BMnOE4d7QEMw/xz6BIcWMyQ5AChPDm2b99uJDnefPNNMWrUKN8ll1ySQJtvJDm6CjM7PJkW1eX0XjZtzOHJoWbW1WqFwmaW2xdx3eclmaJ8LzXZEwxOOEZ6crhcLryXI0xPjmXEdGJoampqz6ZNm6ZnZmbGw5MDxqPKtTUCFl1TZ05ODjDMRznBwTAMwzDMf4k1RSXYBmFhJDfwfPfu3WLVqlUChpiPPvpoROfOncvTf2hVyRCm3pxGfEH86na7/1JuqKlVseGsH3UUluBAwgcjY/8kfhPmeZpM3EKcT8S3b9/eM2vWrJBanxMcfx/tAQzDnD7Uja5MeCjZdTlW1vDlmD9/vrjrrrvcNWrUkJ4cnYhBDodjGgWbZX6/fyNtzg/IxVbk38wXJwDpPg9n7N9LniP79zTex7Qal8u1hZ5/Rsyk8zwkKiqqW8WKFet36tQp4aWXXvJu3bpVvaYOtKnAxAvjgDnBwTAMwzDMf41dd1g32IKbbMuXw9Cby5cvF1lZWa569epBb9YXZuXwQ8Q84ifSmvusG0F2XaXeSCpt+tFeES3fkwkOVAEfJ+BT8jPxLjGMyPD5fDU7d+4cM336dGNkrP3acIvK30d7AMMw/x6FbWyR1UUGV3pyoNUhz8yuG2VsmzdvFi+++KLo2rWrq1q1apXi4+Pr06LZQ5ieHOj3W+ZwODYKy5MDi63Nk0NNbqiLdFlKaNhRs/H5nuPc0fk9HggEDrvd7q3CNB6FJ8f9RNeaNWum3/3/7J0JdBRV9sZfr+lOOiwJIQtJCMgW9rAqIwoIDJBW9kXBHVFGBZF9R8BlRkVElL8a2URRcRR1VJAdAqKgAwKCOJAAsiOQBBCQkP93q+qFl6KTCuOoWe6c8zvd1V0zk37Fqfu9r+773pAhUZ9//rknLS3NRk8/1EwONYODMzkYhmEYhvmjsOogJr1Cu6mQqaF0dWidBSdOnNACMW+//fagqlWrVoqJiWlZrly5v2Hy/jr0TyplTUAXnZXaStGaZl0VSIdZ6bKiQiDjxozskKaQ0cu0ZSyg330Ex2udTueLbrf7bozd9R06dIh57rnn3NSVDc2o7ZpIS9Rp7MloIuR1KEgvMoGxPIFhmN8PK4ODHFzq2AhkcFA3AG0hO23aNPHQQw+5cLOMrFy5cmPcSMnkGAXmgHW4qaZTJwctVzFlcqjGxrV0dBRnrH5XoDHRlqxQwaZMjuDgYFq2QoWc1p5S5slcMDY0NLRX27Ztm4waNSrqtdde8yxfvlwcPHhQvaaaUKCODtplhTM5GIZhGIb5IyiMwUETbDI4jM6B3NBROmfTpk1aJsfDDz8c0r1795pNmzbtHBUVNRGT9nc9Hs83mMgfFfqOItryXsPkUCf9pc3g0MbB0N2Zdrv9O2jHtzFWI8uUKXNbo0aN6tx9993lnnrqKcfs2bPFF198QVv1ys4NbXmz3IVPLiViTVh4LE9gGOb3w6rgyCUqykT4qkwOKjqffvqpmDJliqd169ZRuJk2xM20s9C3kJ2L41RMyrVMDgoeVW7W6iT+WjI5ijNWv0v93tx6qBUqcuRRqGQmBwWPUifHQnw2KS4urnfz5s0bde7cOerJJ58MImdeuaaaOXXhwgV7ZmamnZesMAzDMAzzR2ClN43OAU1zKrkQuQYH7fbxzTffiKVLlzpmzJgReddddzVPTEy8Nygo6FlM2j+BNtqJSX0GTewNnSS1FOlLMj4CLWEpjC4rKliZG+pv1X6LspvhBYwHLRtfhvF6Aa8PRkZG3ly3bt24m2++OahXr17i6aeftq1du1brosH4k7lhl9fKlM3HFALLExiG+XNQi5GECo+67EEWJHLdlyxZIgYOHOiqXLlyBdxM64IuYAyQmRy0uwplcgRy0UtLB4cVgQpWoLWj5M5nYzzPgYM43gzeQQEbj8JFmRwNu3XrFjVv3jwPtR2q19XozNFyOeh6ssHBMAzDMMyfiao7ZAApPZCR30u9SR0G69atCx0zZky1pKSk9tBCj4JZtAQDOugQLYmmbleHw1HSDA4zgX6D/K3mcy9hXI5CH34DFuJ4EvRiD+jH2hir0Pj4eHHPPfdoGwicPHmSrgGZGw6pAWnMSfuzwVF4LE9gGOaPo6CJLRUXWqqSkZFBSxzUJSvksIs9e/aImTNnii5dujgTExMjYmJiGno8HgqCokwOyoqg3T/SQRZ1IChbeplv1nJSn18mR0kyQAr6HXIcLimvua2W1M3h9XpzfD7fLyhYh4QePJqbyVG3bt2k4cOHa5kcO3fuFIcPH85jTqnXm64toa6zLOhJCxsgDMMwDMP8txSkI8jcIL15+vRprdvUmFjn7rDyww8/uCdPnlyxTp069YW+ix/pzH+CXdCWZ6CNLmHyLrWUukTFrC+tNFpxQurEX43jPHoa45IRFBT0H7Acxy+DB0FzEGaz2URycrKgbWOPHz+uGRzGeGvXh64F6X6ZycEa0BrLExiG+eMo6KYlMzmoW4NecU4eg4M+X7NmjXjxxRdpdxU3bpZR8fHxMpODJt1zwDpMzNM9Hk+gTI5Ak/nSbnCoxVgWLm19pZGQLTM5zgl9uQqZSHPB2LCwsJ7t2rVrNHTo0MgZM2YE0fpKMjmUa6otN7p48aLt7NmzGnRd6QlJQest2eBgGIZhGOa3UEiDg3aAk+fkTrp3795tHz9+fHBCQkIU9E4zcC+YSRoI2uiQ1+s963Q6fzU0VGk2OHJ/J8blPDTjcfBvHC8CY0F7EAuc7du3F2+88Ya29By60E55bfKhFxsc147lCQzD/HFYPbmnmxstazDtW26T39ME+rvvvtO2kJ0yZUpQy5YtKwp9S69bhZHJ4XK51vt8Pi2TA+/Vib25S4ENjryoBpB2DpkcRpgWfXZG6MGjG8BbKO7jY2JiejTAfzp27Fjxqaeecm3evFm9bppYOH/+vJ2ekpCQoHAvKmTS5AjUjsgGB8MwDMMwv4WCdARpTOo4JXOD9Ijxea7BsWXLFjFy5Eh7fHy8B3onAXQQ+pLo96GLtnq93qO0hFfkDWtXDY48WqqEoD4Mk5/J30t6MZu2jAXpOF4FpoHeoJbb7Q6+9dZbxZw5c7Rweoy9TWp9Njj+OyxPYBimaGCe2NLk19gr22b+jro5PvnkE9G/f39XbGws7VtOmRzURkiO8QLcTNfTTRaT8yzTzVjCmRyBzRxzYc516GnZD8Y0i7ZLw/FG8KbQd7PpHBYW1qB3794VFy5c6Kb2Q/O1pWJG8PpKhmEYhmH+TGTeBk2sjR1VCNk1LDZu3CjGjRsnGjakTHsRBpqA+8AMaKEvPB7PD06n86S4kkeh6kepo0qanlQ1ovkz6vq9DH1IOvE4jr8Bs8EA0DQyMjK8b9++tkWLFmkZHDnKZgIEZ3BcO5YnMAzz52D1pJ6KDrnrRiYHmRzSXdcK0Pfffy+mT59OmRwuFKGIuLi4RrixUibHBDBfGJkcNpst0+FwXFK29ZKobYSXlPeBbupq8SrOZohVR4fa5aIuWdGW+wQHB1/2+Xxn3G43dXKsE3oBo86Zbo0aNUoaM2ZM1Geffeahpx8//fST+mSEYRiGYRjmT8H8AI00Jk2qZT4YLZuA1nRQQPq3336rZb5hUi6aNm3qSUxMvC46OrqT1+sdAS00B1pzPV4PQPtQF4dZW6pLVgLpruKiIQM9AJOvOcp7zcyRy5rpQRiOd+P4n06ncwT0YrvK+M8DDzzgXbJkiT2QiWHu4GCssTyBYZg/ByuDg250dMOjZQ3GRFm665rze+rUKS2T45VXXqFWQrff749CAWqEG2t3oU+6afKdihtsOooSdR5cNgWPquaGumSloJt8oOPiRGEMDnVcJDmyeGEsL2NMqYClC91EIjNpYmRkZJ/27ds3GTRoUNTzzz/voUwOUzeHTSH3OjIMwzAMw/yemDUnaUy5VJaAzqTd3xxkeqSnp4sVK1aI1157TUyePNnWv3//8JYtWyZFRUX1wYT9CWihRdBB30H7nCRzQ3mARjoq98FQPrqruGjIwhgcUj+rBgd1tdBuMyvx2T8wTn0qV67ccODAgRGrV68OMq5HHv3HBse1Y3kCwzB/DlYGR6ACpJ5H6/doi1Lq5EAhsk2cONHTrFkzcybHPCOTY19wcHCWsa2XvHmr5obc4qu0GxzmYpanHVHJ5KAxoy156QkG7a7yHoraEzExMb3q1KnTqGPHjlH/+Mc/gigvRbmmbHAwDMMwDPOHY9acspNDvpLBgUk2hV9qy6ApK4J2iNu0aZNISUkJvuuuu+KqVavW0u123w+mQwutgPbZj9eLOM4xQu1Lm8FxVTA9BfzjmJbvbAIp0IuPVKpUqe0DDzxQbfny5WVyrujA3GtDXTPUqc0GR+GxPIFhmKJBQYYHHZPRIUMqzWZHRkaGtr/2nXfe6YyOjq7gdDrr4mZLmRzjwAIyOQAtV8kSV5sY0oWWN28zVkWguGL1O1WD46oih2Ke7fF4tC1kMa603pL2PqcMlG4VK1ZMghiIwjUJ+vnnn7UOHJXMzEwtuVxZ+1qofwcMwzAMwzD/S2TmG020zUsoSIesWbPG+dhjj5WtVq1aTaEHjg4H74Bt0JsZ0ELU2Sp1lOx8lcdqZ6yVLivKmPUi/Z6LBpehAy9DD2oIPZR+J3gfTIIm7N2nT5/Gb7/9dsSRI0ccatA8jS8ZSxRIL8eeNaA1licwDFM0sDI4qGODXHVMjrXQypwreRyaE7x161Yxbdo00aNHD+f1119fISEhIQk3WtpClkyOeULPjEi32+1ZKETmTA45cVcprMFRXM0QK4NDjskl5TV3yQrtAU9byIaEhJx3uVyHhR48SstVRoOeN9xwQ5Px48dHf/zxx94VK1bYqd1z+fLlGrS0aMeOHTYyP8ixl2tg5bU3H3OhYxiGYRjm94D0hrEkWjU4ckNHv/32W9uQIUPc0dHR1CWcBPqBF8FqaKEDXq/3HOlKQzuZHwyVGoODdi4E9N15sA96ezk+f6lcuXIP34L/TJgwIf7DDz90paamat0xJ06ckIGvdkKOvaoBra5dacXyBIZhigZWBofM5CCMJ/952tzoRrl27Vptn21MrF3JyckVIyIiqBBRJ0duJgcFZNJyFVMmhzqZVwOiCmNalGSDQ44Lvcqx0Yo0GUTUlkktiRjHX4S+XIW2kF0AJsXFxd3esWPHpg899FDMoEGDgoF49NFHNaZMmUIdN3baa57MKmoNxTW1yaVI6vZhbHAwDMMwDPN7oRgcwmRwOOj9119/LQYOHCjKli1L28bGgbZgJHjH6XT+W9k21vxg6CrtVIwJZHDkLlEhaBm4sVTnks1mO4Yx+Qb6cCHGZ2LNmjW7QxMmDhgwwDtp0iTx7rvv0oMuYXRzOAip80gDyg4Pq2tXWrE8gWGYooGVwSFNDvPEV55DN0QKtdy7d69YtWqVGDt2rDspKYm2kK0nlEwOTMo3+Hw+Ch49Q8sslBu32eAobEEq6QaHanTkeQpBHTBGFwx9Rst/ZCbHuyEhIU/ExcX1rlatWtPq1avHghBgw7FITk62Pfvss/ZNmzZdZXBII4uuJxscDMMwDMP8nsglKgEMDq2DY/Xq1eLBBx8U4eHhduibskLv4rgbTMMk/jPoye/x+rO4MtlXu4BLjcGhakK73Z4Bvb0b47IUWntGaGho/6ioqKZVq1Yt17p1azFhwgStm5f0HsbcQUidR9eCjA82OPLH8gSGYYomBU1s6TOaAFMxIoxgotwQS9pn++233xZ9+vRx0v7bKD71cJOlTo7xYAFuvBtww90v9El5oMl9fpkcgW7yJYWCDA+zAaQaHtoxitoljOtZjOtPeP0ar2/jM1oeRFv3NgOxIBiIWrVqiTFjxmjhXeZrK7NWuLgxDMMwDPO/xvzwhCDNQZNt5YGanboKKPdt5cqVYtiwYaJBgwbC5/N5oCmruFyuDtA4Q6F1UoKCgtYZ28aeD6CtVBPArLWsdFlRRtWEdJzngRjG46zH4/kJ40QPvd4EQ0FrEAVdLu677z7xySefaHov58qSc+368K4q1liewDBM0aQwBgcFVVIuB3UA5Og3R2on1Jat0OT5ueeeE71793bedNNNFatUqZKEGy5NtmUmB21xqmVy4AZ8yWirk5g7FgKZHfkVJ6vviypWBodqcshX2emi7bBCay9R6DWTQ+iZHLRcZSLoC24QusnhjYuLE6NHjxbbt2+/6tqSc08hpIarf03/LhiGYRiGYQoikMFBD1fI5JDdwpQJgYm2nTQm6clZs2aJAQMGiE6dOtmbN28eTjlvISEhvaF7JtG2sdA926FvMqiDwbT8uSCDozCasqiSn8Gh6WWMxwWPx3MS4/MDjj8FU0FnUBXjFdSrVy/b+++/r+XqQevZMe52eS1Ug4M7eQNjeQLDMEUTK4PDKEDahNiYCOfJ5Dh69KigIKMFCxaIJ554wo2iVLFcuXLUVthF6MtV5qAQpeI+m44ilYkbcbZSlMzLVdRMDqtiZPV9UaWwBke28l52c+TIom5sxXsWkMlB24QtAk+Du0BzEFO1alXPxIkTxZ49e9TrSgFTJCaoA8dOYV+B3HsudAzDMAzD/LcEMjjUJdCGvtS2jSWdeeDAAbFhwwaxaNEi8corr4ghQ4YEtWnTplJUVFQLaMf7wItOp3M19M1B2jaWQtiNpRrS4MjVSgG0VnHVjOZly6ouzDF22qMQ+iNCz2d7BdwDkoKDg8v36tXL9d577wljp73cZcpscBQOyxMYhimaWBkchAyllO/pBinPoaJ06tQpbS/zVatW2UaOHOmuU6cOZXLUFbqLPAoFaD5tIRsSEpKGG3EmLbMIcKOWBocsUFbFyOr7okphDA6VPAaH6VxarnIOBY52V/k3+FDo7n0f0LhevXrRkydPDvr+++/V60qGho2MjdOnT9tpT3Tu4GAYhmEY5n9JIINDhbQHTbopI0wGkJKePHz4sNi1a5eYN2+erV+/fqHx8fHVoSE7Op3O0dA8tCXqThxnUgC78cDsssi7tDdH5N8RXNw0YyCDQ2pm7WEXPTik8cDxNvA2eAy0io6Ojr/33nuDFy9ebKdxlcHybHAUHssTGIYpHlgZHmRo0NKGQJkcx44do4KkbSGLG2t42bJlGwQFBXUXeibHm9TJgWKUjveZ4kq7nURO5uVNPNBNvTgWJyusfpe6XCXbdKztsBIcHHwRr0dR4P4NFoKxoHuDBg0aDxs2LHrp0qXeo0eP2qjAUSeOvJ5kdPA2sQzDMAzD/NGQhiRNQpNs03faQzTa7r5///6U8UYPzZqA+8Gr4EvSPNCXvxrdrFIrSb2YY9JNVjqsKGHWhOZj+j1kbmjbxtKyb4/HQ0uXKZdkL3T2v/DZRKfT2blGjRq1Bw0aVH7FihXOQJ26586do+6ZgF28jI7lCQzDFA8KaXBomRwXL168KpNj48aNWibHXXfd5Wzbtm1klSpVGgk9AHMMmAPWgTTcfCn52ZzJoU7eLynvi7P7boXV71KNH7XbRTU4qMCdB4fxfmNISMibeD++evXqfbp3795s8uRk7LzeAAAgAElEQVTJsQsWLAhZuXKlfd++feo11Yyp7Oxsm3yKQutj87v2bIAwDMMwDPO/QO7mRp0Eyue5u6rQ7h/33HOPgK7xQu9UBbeBKeCToKCgH6BzMmipiqGVpEaSeqq0GRz0e4/Y7fY10NfTMT731q5du8XIkSMrffXVV55A488GhzWWJzAMUzywMjhoAmzaWipPJsehQ4dy11BiYu1p3759JCbcMpNjOJiDG3Cq1+tN8/l8WbgJZxtrKOWN+7/N5CiuWP0u82+XY6SdT8WNQkdpLSrtD4/xPEAmB94vDAsLm4ICd8ctt9zSvGfPnnFTp04NgWBQi5mWqI1raj9z5gzlctA6WBsbHAzDMAzD/J7kY3Dk7vSxdOlScfvttwvoHNo2tgK4ETwKaEeV9ZjY78d3ZxRtpOpFueS5JBocF8XVBgd9dxp8C009D58PrVWrVvLIkSNrffPNN2UDjT+Fu7LBUTCWJzAMUzIwL2egGyOZHvJ7WuNH3R0UaETthY899pirevXq1F5YT+ju+2iZyYGJeLrb7aZMDnUZiixSpcXgsCJQscsWgcfhstPpPIvCfxDvN6PALULheyI0NPT2sLCw5rfeemvsq6++GnLgwAGbck21Dg4qcmRysMHBMAzDMMzvTT5LVDSDg0wP2t60X79+oly5cpA0IkTo2W6UMTYV2vEDaJ2t0DknRODstuJqcJgxa0D6TdLgyDEZHBQ8vwssBlOrVq3ad9CgQU3XrFlTMUd5EClhg8MayxMYhimeFDSxlaFQtCMHFSPKdMi54r7bfvrpJ/H666+Lbt26OStXrhyB/zTwer09hJ7JMZ8yOUAa3mvBo0onh7ypq0VLXaYRyPAoKQaI1e9Ql/GoHS9apgl1cqDo/4L3h8BmoQdOTQB9qlev3nzw4MGxn332WXB6errt+PHjeYQFGR1qmKwaRmXmWv6dMAzDMAxTujHrCCNkNHfbWDq+ePGiA8cOeki2ZMkSMWzYMNG8eXMRFxcXBA2ZEBIS0haT+kcxoZ/ldrtX2e32A8KY7Jt0FH0mt421wkqXFSXUB4CX8fsvQ/PRwy36HZTDsQ9aeiVeX46NjX2kb9++refOnRu3c+dOB2lyGlfSfTTe58+fdwA7Z7Hlj+UJDMMUT6wMDnLfz5w5o7UY0gQ5R2kvpG4O2kJ22rRptK+5q0OHDpEJCQmUydETjBZ6JsdaMjlQqLTlKgEyOcwT+dJucNDn5jHJzeSQS1bwnkwO6uTYKHSTY5LP5+tLy1VGjRoVnZKS4qEOGyp4yjXVlhuRUUVrM2mnFbkcibp01CJ4Lf9OGIZhGIYp3QQyOEhbyOwvY8kKdW/YT58+LTZv3izmzJkjRo4cKe6++257u3btwmvUqNEQWqYH9OIE6MZF0DzfQ9+cod1UjB1VpE66KAJ3dpQogwP6WTM3jN/+K46PYkw24/Wt8PDw8TfddFPnRx55pMaMGTOC3nnnHfHll19qu9TQeJOZBHINDroOckcVq2tZWrA8gWGY4onVU3u6GZKRYQqnzJPJsWnTJvHpp5+KqVOnBmGCXRET8AZC30J2BJiDm3EqLVehTA4ULLXYmCfxbHDk/V41OrTzqQtG2TaN2hV/ApvAe/huamxsbJ/mzZs36ty5c+SUKVNc69evV6+pZlBRwcvMzKRtxWjZiub2m02Oa/l3wjAMwzBM6cZscEiTQ+oKw+DQlszSwxWaiG/dulWsXLlS0OR8zJgxXmjIuIiIiJYej+cB6MVXoB+/hL45TpN86mA1OoFJ/0jNaGVuFDfNqOpi7e8nzWf87my8Pw2NvQuvn3m93mlxcXF3NW7cOKldu3ZlBgwYIFJSUsT27dvleDsw9nZ5HUjnkZ5nHXcFyxMYhil5BCpWNAmmm6Q8R4aSUi4HBUY9/PDDripVqlBYFGVyUPColsmBQrWegkdxY84SV9ZMykn8ZeWGXtINDisCFWdzJod8f4mCR4FcrvIuxMD4oKCgbmFhYQ27dOkSOWfOHA+JCOW6astUqIODlh7RtSTRYV6uUtC/Bat/NwzDMAzDlG7MukEaHLSjm9STpB+pQ5h2gJs7d66jZ8+e5SMiImpjAt8FTIau+QxQF/B52lWulBkc5u8odJRy2A5gbNZjLN6A/nsEx3+Bvo5o1KiRGDt2rLYRgDHuDpBrcMiHWazjrmB5AsMwJYOCJrLyBpmZmUkOvLpkhbaRFXv37hWvvPKKwMTaWaNGjYioqKgkj8dDW8hSJsebIBXsA2cok0NpN8y9eSuoy1cKOq+4FS8zBf0O+bk5k0OuzcxBUcvx+Xy/oPDL5SpzwUjQtXbt2knDhw+PXrJkiXf37t22I0eOaGLiWv4NWJkdXCgZhmEYhrGCDI2zZ8+aQ0cJzfBYvHixrVevXpCNnkrQMC3BYPAW+A6T+FPgV8qkMPSRGjCaLQrWjEUZswZU9a/5+2yn03ke43Pc4XB8h+P3hb4cvB2IrVixon3gwIFixYoVcimKXY4tHZORRBqQMzmuYHkCwzAlAyuDQ2ZyBDI46PO1a9eK6dOni0GDBrk7deoUFR8f3xg33u5gFJgN1uHGvA836ExQUCZHQQnZpc3gCJTJQWszKXA0Jzg4OMftdtNylf1CN5HmgfHly5e/vX379s2HDx8e+/LLL4d88cUX2pIi03W1mchtY5RLVgr6N1KaCyPDMAzDMIVDGhymbWOljhQffvih6Ny5M20ZGyr0HVXuANPBSujFdNKNdrtdBo6aDQ71QZCV7ipKFMbgkMe0TOdXjMMZ0tE4XgaeEbrGrlGuXDnP/fffb6PwVtLoGG8tc40NjvyxPIFhmJKB1ZN7uW2sKahImxjTTZMm0Fu2bBE0mZ4yZYrnpptuqogbb31wKxgO5uAGvT4kJCQNZLpcLnVir07iZUI2GxxXGx25Y0JdHGQSGVvx0n7xZHJ8Bd7FOE+Ni4vr17hx4+bJyclxTz75ZPDXX3+tXlM1NFZz+mWXDhVBMjnY4GAYhmEY5reSj8Gh6Q/SHQsXLhTQKpAvwgniwF+F3qGwEJP6zeAgNM9ZRQ+p2qi4bhtbGIND/jbaSe8yxuFX6L6fcfw1mAXuBY1jYmLCBg4c6KLl4jTOarYaGxyBsTyBYZiSj/mGKDs61HZD+Tl1c/zrX/8SDzzwgBOT7DDcfOsIPXiUitWbLpcrlRx53KRlJod5Mi9TpEu6wVEQ5t+pFnP1d2vvyeRwu93nwGEcfyP09sXJ+LxPeHh48549e8a99dZbIceOHbvq2qIQasFfMkzWyujiwsgwDMMwTGEhfUGTbEUz5j5kIV0CfSJ69eolypcvD+kiKMutOegPpgcFBX0OdlLIpshfMxZHg8NMIMNDNThyoJ21LA4c7xD6Ep7HQKvExMT44cOHB69bt+4qE8OcwcE6TsfyBIZhSh5WN0AqVmRkZGRkaJPjy/p6v9xtZHft2iVmzJghunbt6mjQoEGF2NjYhrgx0xay44W+jELL5MAEPAs360tKUrS8qauho2pBK6ggFHfzo6C/XY7DJRPakhXq5KDlKj6fj8K4ZPAobSE7AdzRqFGj68eOHRtHmRybNm2y0+431NFBfPPNNyI9PT1PgKyKGkJq9e+GYRiGYZjSjVk/ko6QW9PTZ8axtm0sdf9+/PHHYsSIEaJNmzaifv36oQkJCYnlypXrAm0zJigoiMLqv4JOPEo6iLSiohdJF8mu34L0YHHQhOZO3Ty/zTA4qHOXPtuL149dLtdEjE/nxo0b13niiSfCtm7d6jBfC6ODQwt4DdSZW1qxPIFhmJKHlcFhJGLntsLlXHHjtSUrtM/56tWrxcyZM8Xw4cNdycnJUTExMY1wU+4h9CDM2SAVN2zK5MjCDVru9a3e6C+ZXku7wSFNDrPRoS1XoUwOCh6l3VXwGQWPUgvjQjA1Ojr6Tr/ff8OwYcMqTZw4MRiICRMmaLzwwgtaMBWu2VWZHERBmRwMwzAMwzAqZv1I+oF0hOwUpVdoSM3gOHXqlPj222/Fu+++K/7+97+Lxx9/3N25c+dKiYmJNwYHB98Hjfic2+1eAp2TDj1zgR7oKHqxNBoc9FsO22y2VXg/3eVy3du4ceMbn3rqqbgff/zRY74WhsFhZ4MjL5YnMAxT8rAyOKQDLye+5nPoc9q5Y8eOHdrkedKkSUHXX3+9zOS4TeiZHHNpC1mfz5eGIkadHOq6Q3UCf1EUPnS0OBUzM4UxOMxGR+6YmDI5yOSgTg5arvIBxvfpqlWr9mvYsGHzRo0axSUlJYUAQUBIULeNbffu3XkyOeS1lK2NXBgZhmEYhrHCrB8vG0slpF40Oji0rgLSFydOnBB79uzRctw+++wz+4QJE8q1bt06sWzZssmY1A/HJP4taJxt0DNZeK8t11C0UGkwOHIUg4O+Oyn0Tt350HzDGzRocNvkyZMTd+7cWcZ8LdjgCIzlCQzDlHwKMjxksaKJMGH+PjMzU0vIvvvuu50xMTHhuEnXo33OcWMeAxZQJofb7U7HTTpTXNnbXL3pqx0cxa1g/bdY/U5Z2OV4qcaH/P48OAK2oCC+j3GmTI7bcXw9iAchwF65cmXx0EMPic8//1xbdkQdG3JZCl0/1eCwMr4YhmEYhmEKwujgCLh9/U8//SRee+01b6dOnSp5vd4bhB6k+TL4Ehynjl9oRtpNTuqe3JwKkdckCPRQrChj1nz098vfRkuRLxvdzvQ96WXK4VgMnkxMTLxz6NChTVevXl1BBozKDQGMDA4HPrebNVxp1nGWJzAMU/KxMjhkJgeZGeQS51zZQlbL5Ni2bZuYNm2a6Natm7Np06YRmFQ3RIEyZ3KkG5kc5i1k1Y6Fy8prYQyO4mqGXIvBIV9lOKvWzUFuP8b4vMvlouBRcvppucok0Be0EIbJgbG233LLLeKpp57SdsChfA56kkJto1QYZfq2WiwDmR2luVAyDMMwDFM4AoSOEtryWPps/vz5znbt2pWDRkkE9EBsKvgC7Pd4PBcw0c82cjguC2W5rijhBgcZO4bBcRa/fy9Yjvczoakf7tOnz80vvfRSzKpVq2wyW400ubEpgOPixYu5Boeq46yuVUnF8gSGYUo+VgaHDJCigkWFK8eU40Dth2vWrBGvv/66GDt2rNvv91eMjIxMwo25m9CXq8wG66iTg5aroIBlK2ss1cm8nMhLk+NaC0ZxoTAGh2r25MnkoMIvTQ68/iL05SpkciwCT4N7wF+EbnKEVqlSxYZrIh599FHxzDPPiI8++khbskIBsmfPntVaG2VXh+zwYIODYRiGYZhrpSCDg7Ld3njjDVvLli3d0Ccx4GbwOHgHbIM+PBkUFHTBWI6rPgCT2uiSKIEGB3WskMlhGDvnoe0O4fgrHC8ICwsb06RJE3+vXr2qPPbYY056oEhbxh44cEA+hHRAt9mluaHqOKtrVVKxPIFhmJKPlcEhb5rqxFc9h26mx48fF//5z3/EypUrxfjx492NGjWKEHomhx+MAPOMTI59ZHIYLrW86ZsNjvwyOawKRnGhsAaHanTkV9DpezI5tOUqQm9pfAbcKYzlKhjvkOjoaHv16tUFGR3/+Mc/7F9//bVmbFAQGK6fTTr+ZGTR9WSDg2EYhmGYayWfJSpa/hflt82aNUu0bNnSBn1CXRwUUH8fmAXWBQUF7YdWPIOJvXmJrtQ7JdLgoM+U3WMuOp3OEy6Xaxs++xjj8UxYWFjvuLi4xBo1ani6d+8uXn75ZS0Hz9DnDrza1QeSUsdZXauSiuUJDMOUPgqa1BpusebOE3QzNb7TOjpOnjyppWXfcccdzqioqAper7cubtRdccMeB950OBwbcJyO91kicIEqKJOjuBoaVlj9NtUAMpse2jkoghfsdvsxsBUC4Z/BwcGTURTvwOe0xjUO+IAdxVHbrm3jxo15rhthhFVx6CjDMAzDMIXCrBnN28ZCT1CXqNZlkJaWpnX7du3aVURERECqBNeCVukB7ULdp5/g/Q5M7Clk82IAnaSaAmadaKWzihqqWSOPNaDbfsUYZEDL7cG4rMRnM4WeVdIQhNarV48eJIrNmzfLa5AbHi/1eWnXcZYnMAxT+rAyOMgZpkyOrKwsuomqmRzaDZa2BHv++edFr169nC1btoyoUqVKktPp7IUb81ihZ3KsA+m4cWfh80sFZHJISrvBIcfEnMmhLVmRO6xAGFxEQTzi8/k2lytX7p2QkJAn8B11cpDJEQ+Co6OjbcOGDRNbt2696tpSQcQ11dbIBiqM3M3BMAzDMIxKIIODdKLsIsCkm3SFg3b72L9/v/j444+1CXq3bt1crVq1iq9du3b7sLAw6vSdD034JTgo9M5UTd8oeRylxeC45HK5zkHPHcbv/1rouvlRoWu58Pj4ePvQoUPVB1VscJiwPIFhmNKHlcEh3XmaCBsdHNLk0M45evSoWLt2rZg3bx5tIevu1KlTJIoXZXJQJwcVsdkgVWZy4DVbac2TN301WDOQyWFVPIoTVr9NNX3U8dEKo8zkIJMDRfEXr9d7KDQ0dJPH45GZHHcJfblKJRRG79ixY8Xu3bvV62qj9sazZ8/aTp8+rb0qnTmF+nfBMAzDMEzpw6wN5JJmuayZlsFi0u2gJbHU5bt9+3baLlbMnj3bNnny5IiePXveUL169QegZV6Alvkc7Bb6TiKUNaZlUyg6qCQZHGonbu4x5Y9Ay9EDq0yMxff47AOh70zYFlSqUqWKa/jw4eKrr76S1yC3E5cNDh3LExiGKX1YGRxGy2FuSjO9kkMvzyHXnooYbQe2atUqMXLkSHe9evUok6MeuA2MBPNwA18fEhKSjpt4hhEoZb7pS4OjJBSzgiiMwaEiuziuOpeCqsjk8Hg8hyEM/i30wkgJ5bSFbNPatWtXmjBhgofWbirXlTI4SIDYMjIy7PTKHRwMwzAMw1hh1gbqsdrBQVuZkj6k3T+OHTumhWSuXLmyzLhx4+o1a9asOybz46FT3gbfgBOkcWjrVGia0mJwaL/L0HH02y9iTPbhs2XgKdAZVIOeDjEtUWGDw4TlCQzDMFaGB91IUbC0dGylo0ODitj8+fNFz549XdHR0RXKlClT3+12dxf6FrILcCNfD9KEnslxqYACoL6/qqXP9N8r7lj9rtxCKK4u+nK5CqVwU/Dot3h9x+l0jkfB7Fm/fv0mjz/+eMzSpUu9x48fp44N7frJ64nrl2tumEWK1b8ThmEYhmEYFTI1aHmKsaQ5z3cHDhwIfvnll6u2bt26LbTLw9Asr4C1Qt8dLtvj8ZCekdqHNM5FQ+8E0oRFGbOuyw5wnKvjaJc82jYW+vgojlOh417A+PTB53Wvv/76clOnTtWWg5t1Gmlw2iGPQ0YLcRLDMKWbQhocWiYHtSLmmDI5aJ3gc889J/r16+dq06ZNxSpVqlBqtszkmCv0YpaOG3cmLVcxZXLIbgX5ml8IaaACUlyx+h3mwi6Lfm4mBxVHFMZfwCGXy/UVRMICML5atWq3d+/evRmKY6WFCxd6V69eLWhNrHJNNWMK19VGYoR2WqEnAgV185TmIsowDMMwTP4UZHBkZGS458yZE9WhQ4cmQUFBt0O/TIVu+Re0zF7SNQEMDnXnEfUhj5Wu+rPJz+DIVo5zdZxhcJCOOw2+hS5+Dcf3YzyatmjRInLKlCnOzZs3a0YGaTTZUW02OEqrTrM8gWEYxsrgoJurTMw2nv7LDg7tnMOHD4v169eL9957T+CmHIRCVtHn81EmRxdhZHLgBp7q9XrT8XkWipyayaEaG+qSldJucKjIsdEKpczkMM4953K5fkJR/Aqv74SFhU2pXbt237Zt2zbr3bt3DK6HZnJQMTSuF5lTdlxT+5kzZ+yZmZnadrK8ZIVhGIZhmGvFMDhsgQyO48eP2994443Qjh07Vg8JCWkPnTIEk3nq7t0O/XKmFBkceR5UKQYHha3uhKZ7C+MyGJ+3btasWcLEiRNDNm7c6JDb8UqTgw0OHcsTGIZhrAjUIkc3W/m9XHOJQiZWrFghhg0b5qpRo4aayTEKN/E3cTOXmRyZ8iavFADZvlcaDA4rAv3ubBH4d19GQTyHsT2IMf4GBXKR1+t9omzZsr0rVKjQJDk5Oeb//u//gpUuDs2coqUqJEjI4CBRwgYHwzAMwzDXSkEGx549e8RLL73kvuWWW6I8Hk8zaJR7MZmnZSpfgZ8tDI7irPnMy2vU5TeqwUHHe8GHQu96vrVx48a1J06cGPbVV1+5ZAeHDHRlg0PH8gSGYRgzBd0waSJMjjJtN2pkcsglK9o2VocOHaLkbG17sNjY2Ijw8PAGKGA9cNOeAN40MjnS8T6TtspSOjkI2a2gOt/ZooDJvSi+xU/F6neo46J2vKhPArTlKjjeBN4SeqHscd111zUeNGhQzGeffeY5cOCA7cSJE9rTAHk9jUwOWrKSJ1g2v26e0lhIGYZhGIbRMWsBw+DQunzVh2B0vGXLFvHkk086mjZtWg6aJJF0Cfg7WAkOQh9eoiwKcUXzSa2TI/JqwMJopaKE+W8lI0Pr4FBCRi/b7Xb6bQfA50IPGu3TrFmzpk899VT0jh07gsxjb4SM5vtgqrRgeQLDMIwZK4ODJshnzpwRAQwO7ea7YcMGLZPj/vvvd7Vv3z4yISGBMjl6Cn0brDlgHZkcKGracpVryOSwKiDFFavfYTZ71HGR28fSk4BzOP4JfAneBONDQkJ633LLLU1Gjx4dOXv27CDqsKHdb5RrmtvRQUtVyLziTA6GYRiGYQJRGIOD8tpIK37zzTeCdgRJTEz0QJPEgfZCfwDzEdjt8XjOQgvmFypakgyO3CUqJoODvqeg0TXgJfBgixYtWk+bNq3K/v37g81jzwaHjuUJDMMwZgqayMriRYXMlOKc25pIXRy0f/fHH39MmRyetm3bRqKANRRXMjnmYFKuZXJgAp5puPeyKKgTeLlkhQ2OK6gmh3a+kslBn58V+tOAjWAhvpsUFxfX+4YbbmjYtWvXilOnTnVRXopyTTVzisQIdeXQbjlSpFzLvwuGYRiGYUo+VgYHgcm3nbTiv//9bzFhwgRRs2ZNOzRJOGgBHhH6Q5jNHo/nGHWgKppG1ULmjg4rrVSUKKzBQd/9LPTu23lgxF/+8pfO06dPr33w4MEy5rE3DA4HGxyFOIlhGKawqIVNQsVNCbHM3aebcjmWLl0qHnnkEVeVKlUqCD2Tg/b5Hk2ZHLjBryeTA69nROACpoZrlmSDw4rLAQg0Jtp3TqfzLKBODiqYC/F+LERE57CwsPpdunSJmD17tptMKPW6GkuPbGfOnMl3+zE2OBiGYRiGUVENDuVzrat3x44d4plnnhHNmjWDHBGhgB523QNmgpXQJmlut5ty2WQXR2kwOLSu26CgIPlwKgNQ6OoHYGrz5s37Pv30042+//77MPNYs8GhY3kCwzCMFQVNbOkGa5gZFFpJx+o2siItLU3MmjVLYGLtqF69eoWoqKiGRibHeDAfpIJ9IIsyOehmb8rlkBP5QORXTKzOLeoU9HfLz82ZHJoRRONHoV0+n+8ciqdcrjIHDAedExMTGwwdOjSSMjl+/PFHcfTo0TyZHGoGBz19kcFWbHgwDMMwDGNG7rSnBF/S5NtBrxQySrlsffv21ZapVK5cuWZ4eHgP6BPKm1jsdru3YbJ/QuiTf1X/SZ0jQ0etdFNRh7Ra7gM7p9OpdXFQNweOs8CPeL8Ury/WrVv3wUGDBv3lgw8+iNi1a5fYt2+f+PnnnzUDyVhO7MRY25VumVKnwyxPYBiGscLK4KDcBsrkCGRwUE7H2rVrxQsvvECdHO6OHTtGxcfHy0yOUUKffKdSJgcKHmVyXA6QyWHOnmCD4+ox0Z5+kDigpwLBwcH0Sp0x6WAtmA1GlytXrnu7du2SRowYETlr1qygZcuWadv8KtdUW2pEgoWuK2dyMAzDMAyTH0bmhrrThw26wUF68MiRI2LVqlW0k4p4/PHHnbfffnvl66+//q8VK1ak5cpzMdHfAM1HD2MoKF3LFDO6GqTBkbu1ajEnj8FB2Rv4rdLgOIfj/Thej/dz4uLihnXo0KHt0KFDY6ZPny4WLVqkZZmcPHlS09gYayfG2C4fRMktZK2uU0nC8gSGYRgrCprIyhusLG7Kdzb5PU2gaR0mLVeZMmVK0M033xyBm3p93MhvBcOEXuRSaQtZkOV2u2U7oiwKchIvt9jKd3lGAVgVn6JEYQwOs9GRO2YkDmhnFSOdm54MUIfMBvA2Cuj4SpUq9WjcuHGS3++nTA73119/bb5uWg4HdeVkZWWZs1YK9e+CYRiGYZiSj+wikJ0ERsCog4wOeshF29STBly9erV49dVXK95zzz03VK9evT80yTRowc/BbtIqpF0ok814yKUaHL8WoJeKC2o3imZsGN0q9DsvQLMdxW/fgvfvh4aGTkpISLitUaNGCW3atHEMHjxYvPfee+LAgQOyO8ZJGSc01rJ7hl6trlNJwvIEhmGY34I6yZXQ5Jie/MvvpcNMk+VPP/1UDBgwwBkXF0eZHHWFnslBidrzXS7XBo/Hk44bfaa44tirk/mCQkdLksFREPn9PvOYyM9oC7YzgIJHad/5BRARozHGXcLDw+v36NEj4q233nIfPXrUZr6utKsKdeVwBwfDMAzDMIEIoAFpRzbN4FA1ID0s2bhxY/nx48c3SEpK6gU9MgG8C7aCU2RwUBcvLd8wdEyJNTjEFb1Grxehf0/it+/C+09tNtvfMRa9MA41oIldbdu2FS+++KLYvXu3ZnAAJ7AbZlJup63VdSpJWJ7AMAxzLZgLmfl7KmTk2GdkZFCBoxux3EJWC5yiGzS1Knbp0sVZr169CrGxsZTJQctVxgk9k2MdSAOZuMGbMznUwCl1Ul8YA6M4mx0F/e25RobymmsE0fjRchUjk4NMDmqBnC30TI7b6tev32DkyJEVP/30U8+2bdvEwYMH1UwOW46yO476hEjzELEAACAASURBVMbq3wnDMAzDMKUL0gjGwxF7oEl3Wlpa6HPPPVe9WbNmHaBBBoPXhd5hetThcGRThhhlU4grD7UuiMAPvKx005+N+W81B6bKc7Ipf46CVvHb9+J4BZgB7hT6Q0AvdJqYOnWq+P777+U40hJwTZvRA0V6EKUG/ZcGLE9gGIa5FqwMDqO4aSaHkagtMzm0mzHtrLJmzRoxc+ZMMWzYMBctk4iNjU3CTbwrGAneAGtR6NJws8/EpDzblMkhl6uYzY5rLTbFCSuDQ5oc6nIeTRDITA6v10uigbaQTRe6iTQHjAoPD+/Wrl27+oMHD4544YUXXF988YUWPGpczzwGh9wtp7St9WQYhmEYxhorg+PAgQOeadOmxTRv3py2i6VJ/LPgC7APWu9iKTU4smmrXPz2g0I3e8j0GQAag7J16tQRkydP1nakMcbRLseTDQ6GYZj/AVYGh9qOGGgiTN9R6NT27dvFihUrxBNPPBF0ww03RAh9C1mZyTEHBU7L5AgODs5yOp2yIFwWeSfwMnxKLRiFLTbFicIYHKrRkWdMqIuDTCIqojim5T/pQu/kmIdxHhUTE+OvW7dunY4dO5Z/5plnHLRW1rheeQwOMq4INjgYhmEYhjFjZXDs2rXL+fTTT5dv0qQJab7bhL5E+Z9gF3TKuQAGx0VFzxQnHVdYg0PL43C73WTuHMPxN+BNMAj8BUQ0bdrUTlvt7ty5U45jri5jg4NhGOZ3oCDDQ5odtD6QbsCmc2zUzbF48WJxzz33OCtVqhSOmzy143UResFbQOnauOnvwwQ9SwQ2MdQOjkDkmN6XBAL9RvP30gC6akwgIC7RbjUY1/1C7+RIAY+CdhEREdfdcccdZd577z0nbUmmLkkhSLQQ0uAoyOhiGIZhGKbkY9aBRg6bTd1mXrJp0yb7xIkTQ5KSkqpCd7QW+kSelidvgdbLoI5TCkk39IxccquaBBIrrVTUkA+gzA+ktM9cLhdps1N4vw28B2iXmVswFrGtW7d20U6ERgZHHowMDhtncDAMw/wPsTI46KZLW8hmZGRoN+GcK1vIatvIUicH3bi7devmaNKkSUTlypUb4iZPmRzjhV70UkG6zWbLosm50YlgLhjZInDxsDICiqP5UZjfpT4pUIOtNOEQHBx82efznUFB3YPPloPpQm+HvLlp06ZVxo4dW+Zf//qXjXZX+fHHH7X9141tY22qaDEbIGx4MAzDMEzpoiCDgzSC3OmDHnZt2LDBNm7cuKBGjRpFQss1AfeCWdAfG+12+wlalmwyOOTDmhxRcg0O6lrJpodPeL8b4/ExxmCC2+1ODgkJua59+/beGTNm2EiPscGhY3kCwzDMb8HK4JAdHPllctDkmTI5Xn31VTFmzBi33++PjIqKaoSbfDcwSuiBmKm4+ad7vV4KYco29kiXBUNdsqLusFIYI6AkGxxyHPIYHGQQ0RMSjCMllZ/GZ5Ta/YnQ18HeHx0d3RLFNP7hhx/2PPnkk9r+62RC0Q44uIZ5DA4qrHIpEhscDMMwDFP6yMfgEFIr0CttHUufb9y4UUyaNMnerFkzHybwtaDtukOX/AOT+pXQdj9Bn1xQDA5VywQ6Lk4EMjhyl6zQshz67Xi/H2OxHGPyd4xDD+jeOu3atSv74osvOriD4wqWJzAMw/wWrAwOWdxkoZOfy3Popnzs2DGtU2DVqlVi4sSJ7qZNm8pMDlqfSW1681AI14eEhKQFBwdnUtK2qWCoBkd+y1YCFZuSanCoqN0c2jlkEBkmEa1tPSH0LdoWg6cxzv0iIyMbV69ePZy2JsP10K6L0YFjh0Cxy2tJT2RIsLDBwTAMwzClEyuDg4BOsJNW2Lx5sxaY2bx5cyf0Rhwm9u2h6SZgUv8JdMmP1MWg5K6pWk4elxSDg97Lh3JkcNDDJ3pPORyUkUY7qdyFsWjcunVrLQS+AIODt4llGIb5PSlokkuf0U2YujkIKn7Gd1qY5alTp8R7770n+vXr54qOjq7g8Xjq4+ZOnRzjwAIUwfXUyUHLVUTedZmyeKjmRraJ4mpoWFGQ4aEWUTleapGlVtBzwcHBByE0NmNcF+Kz0YC2b6sSExPjGTBggFiyZInafZMbbkW5KlLEWP27YBiGYRimZCN30iN9oEy6STdoy5I3bdokJkyYIBo0aACZISqCm4QeLv8uNN530H0/Q+epekXVNPJhVrbp8+KAWZvmBuUbIaOXKWAVx9RZuxm8Bh6ARmvRunXrSi+88IKHDA7zeFNnDHdwMAzD/M5YGRzkNtNyBwoYxaRZzeTQtr2iHTyef/550bNnT2eLFi0iExISGuEG30voJsc8YWRy2O32TAplMm0hay4el5RjNjiujEvuUwMU1ewyZcqcCQkJOYBxXovPZoJ7QJPg4OCIe++9N2jVqlVyS7I8BgeZVCRi2OBgGIZhGMbK4KAlKiNGjBBVqlSBzBDlQFPwNzAbem4jbZUKbXdOBO7UMBscxUnX5Wtw0OfGEhU676zQg0Ypg+5RjEnrVq1aJUAXh9AuKrIjWnbOmg2O0tJJa3kCwzDM/xIrg4NuzDJsyrghS5NDO+fo0aNi7dq1Yu7cueTye5KTkyPDw8Mpk6Or0JerzAGpmJinYVKeiYJwOZ9MDjmpD7RkxaoQFScKY3CoQV15DA5qi/T5fJe8Xm8WxpHyOGi7tjHAX6ZMmVoPPvhg2Jdffuk2rk+uuUFQJgdEjI0NDoZhGIZhrAyO9evXiyFDhojo6GjIDBEi9OXId4MXMZlf5vF4dkOXnBZXd+nmmPVLAdqnKGLuKpZb4EqDI8cwOCiH4wfwLhiBMel4880313z22WfLbtu2zU5jSw8K1Sw0NjgYhmF+Z6wMDmMtZq77bCRs59nTm4JH9+/fL1auXGkbPXq0u379+tTGKDM5RoL5KAbrMTFPQzHMxMT8V6OAqO44Gxx5x0OOwVWho16vl4wOOj4M1oCXwAOVKlW6+dFHH01ITU31BbrWtM+9DB21+nfBMAzDMEzJpgCDw0nvTR0cHlAT9ABToUc+gKbbAj1yVOgT/dJocNDxHqHnok3AmHS9+eab6z377LPh27dvd5JGZoMDw2R1AsMwzO+JleFBN+usrCybstQhdxnE8ePHxYIFC0Tv3r2d0dHR4aGhofXdbnd3oW8h+yZu/KkgDe8zjKKgFhN1cm+e6Mvvi0thvBbMv8t8LNsitacjdrud2iIvG0t9Mmw221a8f9fpdI6vWrVqz/79+zf45z//GX7w4EEtI4WWpVBBpWuHouqAkLFzyCjDMAzDMFLXmUJG7cBB72kZ8jPPPCNatWolypcv74auq+rxeJKhRUaB+dAjG6A/DkCP/GLSMDkirylgpYWKGuaHUfQ7yMTJhu7KMTI45Hf7wKfgSYxFnzZt2jSeMWNGZFpamss83rTUmx420VIVq2tTkrA8gWEY5vekMAYH5XFQLodxg5aZHNrN+uuvvxbPPfec6Nu3r7N169aRVapUaYRiQJkctIxiDqDciL0oApkoEFomBxULo6Copoa6djNQ10NJMTysfhf9/osGVFizae2nscznF4wjdcWsAC/HxsY+kpyc3Gr8+PFxCxYscFLY6NatWzXjybh2DlyzXINDXRdq9e+CYRiGYZiSBdV/6iZQd1ijHVSgDzSDY8+ePVqYPHVx9OjRw9GqVavYGjVqtAkNDX0EOuQV6BHaInUv9MhZ0nL0EIZCOA39UpIMDvotgQwOOvcnsAw8D012b/v27Vu8/vrrlU6cOBFkHm82OBiGYf4ErAwOKoTqdqM5piDLw4cPi9TUVLFw4ULxxBNPeDp06BCFQkiZHF3AcDAbxWEdCkO6z+fLom4Ek8ERKJOjtBscubuqkHAgc8MYs0sopscwht+i2C4qW7bsE7Vq1ep2yy231OzTp49n5MiR2nX44YcfpKHhAHZDwGjXkK4nGxwMwzAMU/qQDzvUBx7QBbTFvGZwYJKuPSj59NNPxfz5823jxo2r2LFjx+ujo6PvgQ75O/TIx3ilPLAzZG4YD2BKm8FxSOgP716BJvsbdG+bOXPmJGRlZXnN460YHJbXpiRheQLDMMyfiZwcy0mxkcmR+z3dtDMyMsSxY8fEihUrxLBhw9yYdEfgxl9XGJkcKA5aJkdISEg67aGOY1n8qFgEyuQoyQaHmUAGhzR9zOdmOxwOCm7dg9cVEBUzvV7v/WXLlm0cERFR5qabbtL2r6euGsO0chitp9p1o5ZUMjnY4GAYhmGY0of6UEtCnZ6YhDuM9+LMmTNa1tqhQ4fE4sWLyw8cOLBhtWrVegp9+fE74DuQCR2iLqElpMEhlxoXJ6wMjhxjm1iCMki+BLOdTuewdu3adZo1a1b1w4cPh5jHmw0OhmGYIoBVRwd1c1AmB2U9XLp0SS5ZIWxUDGfPni26d+/uqlSpUoWwsLAGKAi5mRyYkKeiUKTjfSZef6WioXRzUEFRl6iYwzetilFJMUDU367+Js34QDE9izE9jNdNOH4TDAEtQURcXJzt0UcfFatXr5bdNtp1oWtHT2soR4Wun/EdwzAMwzClGKO7kzSdPZA2+Pbbb8uMHTs2sXbt2snQGUPBXLAZnIIO0Sb9eJW6Sy6vVR9iFUddJvVo7m8xQkblbzku9DF42+FwjGvRokW3iRMn1l63bl3owYMHtS4YMonoYSCZR5SHJsP6C9LYJQnLExiGYf5IrAwOI3RU3rzzZHLQJJq2GKNMjnvvvdfVrl27yISEBFquQs4/ZXLMBakgHcUiy+12ZyvOvywq+WVyBCpApcXgkOORDSFxEYIiA687cfwRmAA6gLjw8HDXgAEDaHcbNjgYhmEYhikQaXBA0wU0OHbu3Bk8adKkqnXr1m0DnfEQeAVsAMdLk8FBWtX4ncTPdrv9O/ABeLJWrVp39OnTp+HTTz9d9s033xTLli3TlgobOpm6NxzGA8E8y4Osrk1xxvIEhmGYPxIrg4NuzHIbLOOcPJkc1MVB24x99NFHYurUqUHt2rWriALYAAWhs9AzOebQ7iperzctJCSElluorYyBMjlKu8FBn+UaPSiw2RjPC3jdj+Pl4B+AumRqxMTEhDz88MNqB0fudWGDg2EYhmEYFasOji1btgSNGzeuUp06dZpDZ9wJngUrwCFDj5Rkg0Mum86RgarGd6fxm3eBJfh8enh4+P0Yn2Zt2rQp36tXL22p8BdffKEt3caY0sM/B73SeJJ2ltvIWl2b4ozlCQzDMEUJ89pNowUv93s6pok07byyfPlyMWjQIOd1110XjoJQR+iZHKMok8Ptdq/3er3peM0UV9ZrqpN7WVxKs8EhP5MGR47xxIQ6OWgN6HrwEugH6tesWbPcsGHDbOvWrWODg2EYhmGYArEyOFJTU13Dhw+PqFWrVn2hP0yZDD4D6dAhv5YWg0P5nMhyuVx7oV9X4/2rDofj4aCgoBtDQkIqREVFiZ49e4p58+aJAwcOkE62GXlomh6jB4Skw9jgYBiG+RMpqKODiqFhZlCIkprJoS1Z2b9/v3j11VdF165dHdddd12FyMjIBl6vt4fQMznmA8rkSKNiQcGjym4hEnMORWGL5bWc+2dj/juzTcf0mhu+qoR6ncLxJozZqyi096HQNklKSooYM2aMY8OGDVcZUUbIqI1DRhmGYRimdGLWBgQ9pIKGs0mtILeRpay1ZcuWOQYPHlyuRo0aNaE5OoHR4AOwGzrkvBIyKrWKfDAl9Yz5gU1Rxawbc5cGK9/TK4WOnoXmOoDfvlHoWpaySVqDikDceOON4qWXXhJpaWk05qSJncarZm5Q4Lsa1l8SsTyBYRjmz8TK4KAbNa0zJIPDaMGTBod2I6dugmnTpom//e1vrg4dOkTGx8dTJgeZHFQkZ4N1FDyKYnHGlMadI/IWR7l0pTCmRUkzOOiJiLZtLI0PxonWg57F8Ta73T7P5XINxPjdkJSUFDVmzBgXGxwMwzAMw5j5LwwO++DBg4Nr1KiRIPRJ/GPgLdIf0CFZJdjgUHPg5Pf0SgbHeWiuo/jtW3C8CIwFfwXRQDRr1kxMnz5d7N27l8acDQ6GYZiiRkEGx2VliQq9KufkyeTYvHmz+Pzzz8WUKVM8rVq1qohiKDM5hoE5TqczNTg4eB9lclDwqFJwVGNDTvLzW7JSUKGyKmx/JlYGBx0HMjjo+AcU2rftdvsg0LJ+/foxo0aNCqKgVzY4GIZhGIZRsTI4pF6QeWsUWj5kyBBXzZo1afJOORwDwOtgE3TIz9Ajl6izVOQ1BdQHNJdFyTM4LkKrnsJv34Xjf4Ep4FYQB8TNN98sXn75Ze7gYBiGKY4EKpRyfaE8hwolFU/aeYVMjoceeshZuXJlyuSoK/RMjtGUyeFyuTZQ8KjT6ZSZHOZiYxU6WlChsipsRYlAhoc0OGQGh1zzuge8J/StYm+uW7du7MiRIz3S4FCvFRscDMMwDMOomA0O9TsyOdasWSOGDh1qr1WrVhh0Bj2culPo2V+p0CGHoUd+VXYXKc4Gh4r8LWr3iWpw/Op2u6l7ZS+Olwk97L0bSAgODhadOnUSr7/+uti3bx+NIxscDMMwRZ2COjpkkCVlctBN/LIeqmQ3EP/5z3/EzJkztUwOTMYrxMbGykyOcUJfx7gOpIEsu93+qymTQ10PeVl5DUSgYlVczA7522RRpd98QegmB+2ichmCgl7puzTwT6F3wrTGmMaPHDkyuACDQwsTY4ODYRiGYRjF4DDrBpticIhatWr5oDNqgV7gObASOuSAsaub+kDG3IVbmIdSRQ2pw1SzRn6ufedyuc653W7azW41dOoLDoejFz67LiwszN6lSxcxe/ZsQTl0l/WAUQ4ZZRiGKcoUZHDQJJpu3LRuk27iOfpSFbvxqu2sQsVyxowZ1PLoTk5OjoyNjaVMDkrmHiWMTA4Uin0omtoWsqZMDrVlUDU7SpvBkW0YHPvAh0LffrdN3bp1K7PBwTAMwzBMYSjA4LCbDI4g6IyqQu+8fRIshQ7ZCz3yi8ngUHVWSTU4Lrtcrgtut/sQ3q+32WwzoVX74rOa5cuXd5kMDjsbHAzDMEWcggwO+oxu2tR6F2i7Mfrs8OHDYtu2bRRcRXuFB914442UOl1P6OsXaaI+B0VifUhISFpwcHAm7bOuFJZLCnIrskAmR6BiVZIMjstscDAMwzAM81vIx+CgybjDZHDYoTMqCT1McyL4BDpkN/RIlqLT8jM4iuMSFSuDg5apHMX7r8CrNpvtHlAnNDTUc+utt4qUlBQ2OBiGYUoisqNDzeSQZGRkiI8++kjcd999zkqVKslMji5CT6NeQCZHUFBQusPhoEyOX9XCIq6YHepyFRUrw6MoY/676feQwREogyNNXL1ExcsZHAzDMAzDWJGPwaHlRpgMDsgMbRtU2klF2yoWOuR76JHTeM1vhztzJkdxQf4W1bDJPaal0263+xI06gkcbwZvgAdAQ5/PF+r3+3MNjpwrncza2LLBwTAMU8RRuzkCTZqpk4O2kKWlKTS5zrmyhay2jeyOHTu0rbS6du3qbNSoUYW4uLgkFAxa3zle6Jkc60E6ikmmw+GgpG41k8NsbKiBUMXJ4AhkaORncKi7qNDne8AijMlQ0KpevXrxo0aN8vAuKgzDMAzDWGE2OAyo6yDX4Bg2bJhITEwU0Blh4EahP1R5DzrkO+iRn41d3VTdIl9LgsGhdhGbDY6TOP43mAf+Bpr6fL7yfr/fxgZHIU5iGIYpilgZHHQDp2URVDgDZXL8/PPPYvXq1WLWrFkCE3M3ikJUdHS0mskxB6xzuVzachXKnqDgUVOxoeIpd1gp7JKVosS1GhyXDYODPvsB47EQ4zMYxbZlUlJS7JgxY4I2bNjABgfDMAzDMAViZXCsXbtWjBgxQtSrV09AZ5RxOp3NaWt66I83oUM2Q48cNfRIaTA4tN9iGBzZ+O0ZON4OFoLHwF98Pl8ktKxTMTgImxxvNjgYhmGKOFYGB31GN3Ei0HlUVI8ePSp++OEHba/1iRMnups2bRqBIlEfdAYjwVxM4FNRNDSTw+hckMVGNTiuJZOjKFEYg0P+NtXgOIvjbRAa8zA+f0OxbZGUlBQ9ZswYFxscDMMwDMNYUYDB4QpgcAQ7nc5G0B0PQn+kQIdsgB75Ca/nFO2So7yWZIODtNgZHO8C74MRoA20apzf7w8yGRy5sMHBMAxTzLAyO2jJCu2wQoXUFEJqO336tHj//fdFv379nNHR0RVQPOqjaNK+4uPAmyiqqZjIa8tVjCJjLkaFzeSwKmx/NoGK6q/y2MjgoJBRenLwLXgN3A+aJiYmRgwfPtyRmpoqxzf3qYHcwpcKa6AAWIZhGIZhShekB2jSTdpM0Q20jNhJmo26bIcMGSKqV68OmSE8oIGhOWZBh6yBHknHa5a4ostUnSW7a7OFuErrFGWkDjM/bNI6aaFDL0Oj0nJhMnZ+BIuFnh/3V5/PV8Xv9wcXYHDYoMNsbHAwDMMUE6wMDnpKkJWVpWVy0E0+50omh7Y+cevWrWLatGmiZ8+ezhYtWlRMSEho5HK5ehmFYw5YB9LsdnsGPr9k2kLWbGzkl8mRE+C4KJHfUwPtdxi7qFzC6zEcbwAzQD9QPzY2tuwjjzxiJ0HCBgfDMAzDMAVhZXAsX75cPPTQQyIyMhIyQ9BWsRQIfxeYDh3yBfTIj3g9LUq2wSGPzQbHeRzvBf8Ck8CtPp+vht/vD01JSbGxwcEwDFMCsDI4ZCYHQYUzx5TJcfz4ca0dkvYPHz9+fFBycnJkhQoVKJODOjloK9TZIBWFJT0kJCQTxcWcySHbIQvK5MgJcFyUCGRw5Bo1tB0bBMU5vNIWscvAM0LPLKkZHh7uHTBggI2W+xhCJTfYig0OhmEYhmFUpMFBgfCBDI6lS5fSbneiTJkykBnCDRJBH/B36JBPoEd24PVnYez0JvLqKqnJSqrBQdkjpMWWgCdBV5/PV9vv95dLSUlxsMHBMAxTArAyOGQWhJrJgeM84UsnTpwQ6enplMlhGzNmjLtBgwa0LRllctwq9EwOypxYjyKSjsKaabfb1acGsnNDmhwlxeDILbAQEhfxu0/R9mw4/lDoO850AJVjYmKcDz/8sFA6ONjgYBiGYRgmIFYdHMuWLRMPPvigqFiRpJhmcNQQ+kOVJ6BDFkGP/NvoKL2oaBapZ0q6wUHHB8SVh009oU3r+f3+8JSUFBcbHAzDMCUQK8ODlqycOXPGRoXVuNnbJNTN8dZbb4k+ffq4KJODigYKChVVmtAvcDgcqSAN7ymLwpzJkSPyz+SwKmx/NGazRTVprjoXv/k8iuphvG6y2+3zMSaPhYSE3FS2bNnIG264wTZx4kSxceNGOe4OYJPGEnXOcMgowzAMwzCE1GIBQkYdpMso02vs2LGiadOmAjrDBb1RDbrjNkzyx0CHLIAe+Rqvh4W+25v5oZHaTWulhYoSqqkhf5N8cKaGjNJnP4EV4B+gN7RqA7/fH5GSkuLev3+/zTzeHDLKMAxTzCmMwUGZHATeq5kcWlHYtGmTeO6558Qdd9zhbNWqVUTVqlUboZCqmRxrwV58lkl7klMmBxUeoxippob6FCFQ18Yf2eFh9f8lnxLI5PHLdrv9svG7qIODtsv9D37v8jJlyrxUrVq1+2688cbGnTt3Ljt48GAxf/58sXPnTrkkiARKrsFBhZXGnA0OhmEYhmFID1CnBk26pV6DbrAb+kFs375dzJ07Vzz66KPitttuo3y0BPyng9frHQpt8obL5VqHV+piOE+dDcqy4RxxtcHxe2qr/yWFNTjo+4NgFXgO3O7z+ZL8fn9kSkpKEBscDMMwJRArg4Nu8HSjV5ZNyA4O7ZwjR45oTw/efvttMXny5KBOnTpFli1bNglFpKswMjlQaNahyKSjqGTh9bLJ4AiUyVFcDA4tmAu/h0wNmTVykVpBPR7Pt2BRpUqVJv31r3/tNnLkyJoopp6PPvpIbN68Wdt61zCQHGQc0djK8ZbLg6yuHcMwDMMwJRv5AIRMDvkeusGOibiD3pMOo4dNixcvFq+//rpj6NChca1atWodHh7+MPTJy9AmK/CaDn3yC21jTzu9KTqspBsc9N0hsAa8APpBizbx+/1RpMnyMThsbHAwDMMUY6wMDllM1Qk4imyeTI5Tp06Jw4cPi1WrVtlGjBjhTkxMlJkctwk9k2M+CuqGkJCQdNqTnJ4gKAVKdnAUJ4OD/kZay6oVUoiHbHpKQMIBx+dwnIbfu9Llcs2qWrXqI/fdd1+bd955Jy4tLc1x7NgxkZGRkbsM5ZdffnGgkNrl+BZ0PRiGYRiGKV2YtQHpBdINpB/omCbjpCtIX+zZs8e+YMGCmH79+t1YqVKl/tAk04QesLkH/EK7vFE2hdLFURoMjiNC3+FvOrjT5/M18/v9MWxwFOIkhmGYkoCV4UET86ysLButBaWlFTlKRwd1JVCbZI8ePZwxMTEVypcv38Dj8chMjjdRUFMBpVlnofhcogKkPEW4LAIHjham0F7Ludf635cFVCL/zovGaw4tu8HvzCHhIPS8kW1gEZgUFxfX65FHHklat25dhUDjjXEkkVLiw6wYhmEYhvntGLvdkQ6zB/jetnbt2kjojuaVK1e+Gzrk7+ATsBucc7lcFLyp6RZD41w0KIr5ZwURSCeSuUG/RRoc2m/F8VGwHrwE7vH5fNf7/f5KKSkp3v379181hsYSlRKvyyxPYBiGKSkU0uDQtiszOjnyZHJ8+eWXWibH3Xff7Wrbtm1klSpVaLlKTzBG6JkcqWAfimwWik+2UmSJQJkchTEt/nSDw+v1ksFB31MhpScFM8GAsmXL3vTQQw9V3rhxoy/QeJ89e9YOkVLiCynDMAzDML8dxeBwBPjetmnTpojHH3+8CfTXHdAhU4S+m9suUfINDqnNzAbHCfAleAXc7/P5Wvj9/riUlJRgNjgYhmFKAVYG6S6tHAAAIABJREFUB60BpZs/ESiT49ChQ2LDhg3in//8J2VyeNq3b18Rk38yOboIPZNjrt1uXx8cHLxPZnIoBUsN78zNuBDWpsUfZXBcUl5zl6goBsdZoT8lITFBIat+fF7r3nvvLbt69WpXoPE+e/as7IaxvDYMwzAMw5RurAyO1NTU8EGDBjVMSEigh0sThN5RugOcLaUGx0nwNXgVDID2bOn3+xNSUlJ8bHAwDMMwV60FpQJAu37I741tZbVcjmXLltkee+wxZ/Xq1SugqNQVeibHaBSeN1F4yORIx2uWuFJYVTOhqBkcakdJno4OY4nKOafTSUnd1KHyMrgPNImMjIx44IEHHEuXLtXMIfN4UvcGbQ1b0gspwzAMwzC/nYIMDsqPgN4Ie/DBB+vFx8dT2Dt1zy4U+tLZ0mpw0NLhb8Ab4G8+n6+V3++vmpKSEsoGB8MwTCmkoI4O6uCgybnM5MCxXLKiFYwDBw5Qorfo1q2bo2rVquEVK1as7/V6ewg9k2M+SDWSvQNlchD55XEEoqDCZ1UYrYqm2r1xVaG12+0XUESPOJ3Ob8E7oaGho6OiojomJCRUuemmm7y0P/3KlStFZmamJj7IBJKhohRkJbthOGSUYRiGYRiVAkJG7fJYdtfSw6WPPvqo/P33318nLi7uVmiUEWAB2ArO0A4qppDRCwbFNWRU1Wn0UIx+i2pw0Hf0IO3fQl8m/YjP52vj9/urpaSklNm/f39Ak4jGlw0OhmGYEoqVwUETdOrYCGRwULGlLWSnTZsmHnroIVeHDh0iK1eu3AgFhkyO0UaxWYdCtI86OSjx2pTJIYuW2tFxSfksP6PivzE4zIVSRV2SopkwJA4MgUA5IidRRL/D37+4TJkyT9WuXfuOTp06JfXv3z9s3Lhx9rfeekts3bpVyy6hjg35ZIDGlMwOEiZscDAMwzAMY+ZaDI6TJ0/SdrFl77///ppxcXEdoFGGgHlCn+BnlVKD44zQDR56sDbY5/O18/v91VNSUsqxwcEwDFMKKWjCrS5Rkfuz5wTI5Ni8ebP47LPPxJQpU4Jat25d0eFwNBD6chXK5JiDY225SkhIyBkqSKYCJvM4qGhJk8FsQBRkVhTG4AhUKC8p0P/neWEUThIGJBIIHGfi79+NIvqJx+N5Nioq6r4OHTr8ZdKkSXEffPBB0Nq1a8WOHTu0HWZIfJAgUQ0Oeg1kbrDBwTAMwzCMlcEhPyM9QZ2in3zySWj//v2rxcXFtYVGeVToSzNoiUZmKTU4KB+NluhQJ8sQn8/3V7/fXzMlJaU8GxwMwzBMHgJNysnsoIm8PIeKrszlWLJkiRg4cKCzcuXKYSgydYSRyQHedLlcqR6PJx3F15zJIZFmgzQ0fm+Dw/y/LbtHNIODCif+5nM4TgMrUUxfBA9GR0e37tu3b9V33nmnzJEjR7S91E1LUsjgsBsBrWxoMAzDMAxTaFSDw/zd2bNn6YGSb8CAAVXi4+NbQZ8MBK+BTSAzQAZHSTc46FzSatvB22Coz+fr6Pf7a7HBUYiTGIZhSgMFTcipGNBSlczMTC04U1myohWQPXv2iJkzZ4ouXbo4EhMTK0RHRzf0eDyU8k2ZHNRCSdur7gGn7Xb7ReUJQ2EL3P+CAv8/qWg6nc5fvV4v7QCTLvS/mZ6ODAYdQkNDa/Xr1y9syZIlbmVscjtaaIkKbwvLMAzDMMx/g2FwkM6ymb8zDI7gAQMGxOM/LaFLBoBZ4CuQUYiQUfUBj5UG+zMJ1Mkrf4vZ4PgFfA/eAcN9Pl+y3+9PTElJCdu/f7/TPIYXLlyQnbZXjW9JwvIEhmGY0kJBBocMHaVuDXrFOXkyOSiDYs2aNWLGjBliyJAhruTk5EgUYMrk6A6GCX0Lr2UovLs8Hs9xFKYLpkwOc3FTt5NVuXSNmP+7eQq7zNwwWjsveb3en8uUKbM7NDR0Bf6+14X+tyeDOjgvvFevXu7PP/9cHZvcpyxscDAMwzAM899SCIPDO2DAgFjoqxZC39FtJvgSnC6lBgd1dewC74GRPp/vVr/fXyclJSWcDQ6GYRimUJkclMcRaAJP3x8+fFh89913Yvny5VomR8uWLSui4NQDHcEgMBMFeElISMh2cAzvL+ZT3H5ViplEzem4Fi4o0H9fbger/X9RoSQxgL8l2+PxnMLftatcuXJLy5Yt+zI+owAvSiqnJTcVcK6rW7du4sMPPxRyGUpO3g4ODTY4GIZhGIa5VgphcAQNGDAgOj4+vjl0yd1gBtggSq/BQZ/9ABaB0T6f7za/31+XDY5CnMQwDFPaCRSEZQRrXvUddXN88sknon///q7Y2NhwFJ1agBK/KRDrJRThf6EwbUERPiT0Lb7MRoeaj3FNy0wCIP978n/T/DlBIaPHwU78TUvxt81E8SRDxg/qAzJqPJGRkaJfv37i/fff19LMc0yhqzQWBBscDMMwDMNcK4rBkV8GBxkcUfHx8U2hS+4E08F6UTiD47doqT+SQAaHfPAVyODYDd4HY3w+X2e/31/PwuCws8HBMAxTCjGbFubvqZODim1GRgZN6m04R+ZxaEX5+++/F9OnT9cyORo2bBgWFxdXG8WIOjkeAc8JvZ1wPQrVLjI6QKbdbj+P42wqXn8AFwCZK2Rs7AVfg4+F/jSEjJhOoD6KaBT+dk+DBg1sHTp0EOPGjRNLly61HTt2zGZsC5u7ywwZPgSHjDIMwzAMc60YBocowOBwDxgwoGJ8fHxjaJQ7wDSh54WdKsDgKO4howUZHPT5j+ADMM7n83X1+/0NUlJSKuzfv99lHkMOGWUYhinFWBkcVByoCFPBNXZWkZkcmit+6tQpLZPjlVdeESNHjnQmJyeHx8TEUCdHG6E/dRgL/s/pdC4ODg7eAGg71qMoWmdpuQgVaoKK2G9F/m8p/3sXwQlAxgZtr/a50MNEJ4P+gLZfSwQV8R9Px44dxbBhw8QLL7wgPvjgA7Ft2zbN2KHfTktSpMFBr8qWumxwMAzDMAxTaAphcLgGDBgQER8fnwSN0kfoD4zWitJtcPwHfAgm+Hy+7n6/v2FKSkoEGxwMwzBMHqwMDjWTQ26Tqp5H26ceOXJE6+RYsWKFmDBhgrtZs2blUICqgCZCz7YYiIL8ZGho6Byw1OPxbEHR2g9OGiaEpXlxjVwG58ARsAOsxt+wEDwr9K4NCkSl4K7rAG1360lKSrKPGTNGULAoGRtpaWna8hT6fbQcRTU4aBzkWJjH0Gq8GYZhGIYp3RTS4KgQHx/fABqlt6Ff2OAQYjGY6PP5evj9/iQ2OApxEsMwTGmnIMNDmh0yZFOd5BPU7UC5FXfeeactOjra63Q6I+x2O3VItAZ9cTwC0NIQWkO5BnwH0sFRcApkCn0rMBkWqu6mYl6reckogpSrcc6AlqL8DA4KvZWRlqN8AmiXlIler/fekJCQthAH9UAMCAGOChUqiJ49e4q3335bHDt2TP6e3HWbMoOkpBdKhmEYhmF+fwqRwUEGR3h8fDzlg/UC/zB008kCDI5fxdXGgZXJUJQojMHxEZjk8/l6+v3+RikpKRX379/vNo8hZ3AwDMMwuVgZHNTFQFvIZmZmasU558oWslqR3rJli3j++edF9+7dxfXXX+9ISEgohwJVFQXpenCb0Pdznyj0Lc/eAp8KvWiTGbFV6CnZtKRkn9CNisNCN0COCT1H45gBff4TSBN68BTtj75F6Cnjy4S+TjMFPAUeQ6Hshb+l5Q033FCtTZs2FUBQ69atBV7FbbfdRrvBiK+++kqGieYJFSWDg560sMHBMAzDMMxvpRAGh7MUGxz0gCuQwbFHsMGRB8sTGIZhGGuDQ2ZyUEcDmR05JjOAOiBWr14tXn/9dS2oMzk52REREVEGBakSqA3+InSj424wWOhmB4VnvQoWCL39cAlYCVLBV2Az+FaBjjcKPXBrufh/9u4Duopq6wP4mXLvzE1uEnpPKNIJiFIFFaUIPINYEKyIioAi0h7F91CaFfgUQVAwUlQsqPhQUbGggA2kg1SlBBAEKQkhAZKQb++5c8Iw3DBBQUnyd63fmjuTg3LPsNZ7+885+4RWafDRYTPIRPIkGSpCYUon0jIQCFzWsmXLioMGDYp54YUXfNwYVeL+IfPmzRO7du2S3/W078Tfk7eqOI6MBQAAAPhTEHCEdbaAg1ftIuBw8RwAAADeAYfsQcFBR7hxvNph//79YuvWreLrr7+2Qo7LLrtMo/9BMkiUCB3Fyis6+H+0OezgU0xuF6EwYiAZKUJ7TXmFB28tmSlCKz24h8bb9pXvZ5Cp5AURWqXBzUy5v0ZXcqMINTnlHiA1SIVKlSoV7927d8SHH36obdmyRbDNmzfn2LFjh7UyJdycuHtuAAAAAPxZeQg4ZA8OZ8Dh1YMDAYcNAQcAAOTqbA00+RmvbOD/MWb2Fo6cLR4HDhxQuK9Fly5dROnSpQX9DxJTiBEVFRVdvHjxMsWKFatKny8jV5N/kdvI/eRh8m/yH/IYGU5G2Fe+f5QMIA+SruTmokWLtqZ/Z+Po6OiadB9LipEA0du0aaNOmDBB/PLLL/L3f9p2FP69y2aqjD/nFmqcbU4AAAAAziYPAcefWcFRWJuMIuAAAIC8y0vAwSsfjhw5YnWtzj69J4f6008/ibFjx1ohR4cOHSzc84J16tRJu+WWWyI7duxYku4rklqkIbmStCb/Ih3JzeQW0sm+8j3/045cS64gl958881V6d9Z9sYbb4yhe7/87zBeSfL5559bzVHt37/792r9j6BsKMpXuUrlXOYEAAAA4GwQcFj+bMDhXMGBgAMAAM6NV8DBIYBswmn3qDitfwUfIbto0SLx+uuvi1dffdUybdo0y8yZMy3Tp0/30X0kKUJKkwqkEqlKqpOapBapbV9r2s8vIRVJOVKC/l1RxKB/nyL/G9L8+fOtbTNhvuNpv1/+DljBAQAAABcKAg4LAo6/yHMAAACcySvgYGfrUcHhx8GDB8Xu3bvFzp07LdzMk/Ez+ZmoRCc+YhCTBEiELdJBPgvY4/z2r9Po36k4/p05uC+IY/VGnr6v1/dGwAEAAADnCgGHBQHHX+Q5AAAAvHkV/nIFBG9dcRyrKldJqNlhtoVcIOH+mwr9/hT+vblhxQYAAAD8HeyAQ+ShyeilVNB3EaHm62gyGmoy6uzBwU1Gfe45RMABAAB55hVwyC0rrmNk+X/ANZe/I+Bw/3dV+j8VKv3e+G9NhMT/J0OGHAg4AAAA4ELKY8BRMi4urj4V9LeRcWSxQMARrslouIBDsQMOz3eRn3kOAAAAb14BhzxClsMNuycHU8Lw/G+dJ2f8t92rN+TvFSs4AAAA4ELLQ8Dh79GjR6m4uLjLqaC/gzxHviWHC3HAIbeoPB4MBm9JSEioj4AjD4MAAAAAAAAALpQ8BBxGjx49ysTFxTWkgv5uMp58JxBwfEAeCwaDNyckJFyKgCMPgwAA4Nx4rejg/3HhVRK8bSUXioPqonlwj3f+u0777zj7bJztO2CVBgAAAFxIjiajZ6xotQMOs0ePHmXj4uIaU0F/D5lAvifJeWgymuXgFSr8k3JrMhou4ODnW8gcMiwYDN6UkJBQLzExsURSUpLunsPjoR4cCnpwAADAOctrwMF/U5ELxaY6aOfI+WsVh5z/Doccrm0zYb8DAg4AAAC4kPIQcAR69OhRPi4urikV9PeRF8mPovAGHPz9NpH3yH+CwWDHhISE+MTExOIIOAAA4LzyCjhkT448Uv6is/7789JjAwEHAAAAXEh5CDgievToERsXF9ecCvruZDJZIgpvwMHPNpDZZGgwGOyQkJBQBwFHHgYBAAAAAAAAXCh5DDgqxsXFXU0FfU/yMlkqCm/AcYysJ2+TwcFg8PqEhITaiYmJxRBwAAAAAAAAAPxN3CtF7YCDj61X3T9LTU0V8+bNi3zggQcqx8bGXkMF/YNkKvmJpOi6bhX+qqrKoOC4TQYa+aXJaJYL/35lWOMMOPh5OllH3iT/DgaD7RMSEmolJiYWzSXgQJNRAAAAAAAAgPPNK+Dge+4Txv3CDh06JObOnRu8//77L4mNjW1FBf3D5FWynBwppAFHGllLZpEBwWCwXUJCQs3ExMQiCDgAAAAAAAAA/iZ5CThkQ/YDBw6I//3vf9H33Xdf9djY2LZU0PcjM8hKkloIAg73FhV+nkrWkNdJv2AweF1CQkKNxMTEGAQcAAAAAAAAAH8Tr4AjzBaVmAceeKBmbGzsv6igH2gX9qtE4Q44VpPXSN9gMNgmISGhOgKOPAwCAAAAAAAAuFC48OYGo2lpaVqYnyvffPNN0d69e9epWLHiDVTQDyFvidAKhqN5aDKaX7gbjHLIwU1Gw21ROSJCK1hmkD7BYLBVQkJC1cTExOikpKQz5pC3+thNRj3fRX7mOQAAAAAAAADgQnIEHGqYnytLly4t3r9//0srV658CxX0j4nQ8ag/k7RCGnAki1APEu5F8lAwGLw2ISGhSmJiYhQCDgAAAAAAAIB/iFfA8cMPP5Ts27dvg0qVKt1OBf0o8gHZKApvwHFYhE6ReYX0CgaDVyckJFRKTEwMJiUlnTGHCDgAAAAAAAAALoCz9ODQ5D0X49xo9PDhw+qHH35Yunv37k1iY2PvpoL+afIh2UzSw/TgyLDltx4c7oCDcUjD38UZcPDYg2QJeZk8EAwGr0xISIhLTEyMTEpKUtzzbffgEAg4AAAAAAAAAM4jZ4ghP1MRrhIr4OCjYbds2SKWLFkiPv30U/WZZ54pQwV8s1KlSt1Lhf5YVVXn0fUXKu7TNU07yas4ClDAkSVyDzhO2gHHH+QHMpncHwwGm9H8xCLgyMMgAAAAAAAAgPOFQwwutnnrhFzFkZGRoRKNw45ffvmFj4YVTz31lOjdu7fWsWPH8vHx8VdHRUX1VFX1BV3X59N1KxX3x+h6krencABgBwWFIeDYR74lE0i3YDDYJCEhoXxiYmIgl4BDIOAAAAAAAAAAOM840ODtJ+np6c5tKirRuAhfunSpeOaZZ0S7du1EtWrVtPLly8fGxMS01HX9YU3TJlOhv4Cu26m4PyaLf0dQIHtwFJSAw9mD46Tdg2MPWUieJ3cFg8GGCQkJZRITE00EHAAAAAAAAAB/E3tLijh69Kj1mZ5xUc6nf+gZGRliwYIFok+fPqJixYpUvwud8Ic2pL+u66+YprmIrkl0fzxMUCBXcOT3JqP8TDYadfbg4Ge7yQIyjtweDAYvS0hIKJWYmOhPSko6Y77tLSpoMgoAAAAAAABwPsmAIzU1NWzAMX/+fHH//feLmJgYqt+tgKMK+RcZouv6TNM0f6ArF/ky4HCuzsjPAYdz9Ua2OD3gOGkHHPy9ONz5XIQarnYKBoN1ExISiicmJuoIOAAAAAAAAAD+Jl4rOL744gvxwAMPiOLFi1P9LvykGrmRPK7r+tumaS6n614R2r4hwwEZFBT0gINDnW3kExE6MrdjMBismZCQEJOYmKgi4AAAAAAAAAD4m+QScKhEk1tUHnnkEVGpUiWq34VBapHO5Cld1/9nmuZauv5hF/8yHJBBQUEPONLpnk+Q4aNyHyPtg8HgJQkJCZGJiYkCAQcAAAAAAADA30Q2GU1LS8tpMkr4iFidi/BFixaJQYMGifj4eKHruqlpWryqqndRMf9/9PlTKvI30fWQCIUY7uahmbYs1/OLXbgmo7LRqLPJ6FG630TmkEdJm2AwWDEhIcE8S8CBJqMAAAAAAAAA51teAo4hQ4aIevXqCSroAz6fr76mafdRMT+Zrl/Ts210TXGEAdmOa0EIONwnqcgVHBxw8PdeT94h/ybXBIPBcgkJCT4EHHkYBAAAAAAAAHC+eAUcCxcutFZw1KlTR2iaFlRVtREV+A9RMT+N7n+kIn83XdMcIUC2KBwBRxZ9d165sobMIo+Q5sFgsFRCQoLqCDgUmzXfCDgAAAAAAAAALgB3wGE/t5qMyoBj4MCBombNmlS/Cz5KpRnpx0W9rusrTdPcR9fjomAHHPKZM+DINAzjAN2vIDMIhz6Ng8FgsYSEBIGAIw+DAAAAAAAAAM6XXAIOq8lomICDj1K5mgwm7+q6vtY0zYN0lQ1GndtU5L37WX4gww13XxHru9g9ODIMw+DmqsvINNKDXB4MBqNdAYdqs+YWAQcAAAAAAADABZBLwGEdFesKOFQq4MuQNmQYmavr+kbTNJPpKlc5FLaAYx/dLyWvEO5LUi8YDEaECTg0Od8IOAAAAAAAAAAugFwCDqa6Ag4/FfAVSQIZTT7Vdf1X0zSP0lWGAM4tHdni1BaV/BpwuMMZa+uKvUXluGEYe+j+e/IS6UpqBYNBAwEHTZXXAAAAAAAAAIDz6RwCjggq4KuTW8gY8qWu60mmaaYX0oAj3TCMXXS/mEwkd5BqwWBQR8BBU+U1AAAAAAAAAOCvcJyUksMOOBTXcyUjI0N88803YsCAAUqNGjW4wWi8XciPJ4s0TfuNivzjdJXFvzvQyBJnhh75gfO7OJuMymuWz+dL9fv92+nzAvIcuZVUCQaDqjPg4HnkE2n4yvOPgAMAAAAAAADgPDhLwJFzz8U3P0tPTxdfffWV6Nevn16jRo2SVMA3FKFeEy+THzVN228YRkYhDDgyfD7fYb/fv5k+f6IoylOqqnbUdT2uSJEiSseOHcWrr76KgAMAAAAAAADgQvEKOLKysgSv3OAiPDU1VXz++eeib9++gerVq8eK0AkqD5PXyCpN05INw8hyBRwZomAEHLLJaLiA45jP59vn9/vX0Of3VVV9TNf19nRfvnjx4uKmm24S06dPR8ABAAAAAAAAcKF4BRxO9hYVZcCAAdE1atSoSsX8dWQQmU02aJp21DCMk3bAkS0KdsDh/Fmaz+fb7ff7+QSVN0RoTlqRMsFgUOSyRcU6KhYBBwAAAAAAAMAFwCs2qOhWjh49qvBn989/+ukn7dFHHy1eu3btOlTA30AeJx+SrbquHzdNM9vRZJTDjRPi9FUPkleo8E876SLDmkzXmCxFUY5w/w3DMBbRfSLpI0KrW3gbj2jZsqWYPHmy2L59O8+hbDJqreDgcIO3/nB45PVu8jPPAQAAAAAAAADnkx1wiNwCjvXr1/uHDx9eJj4+nvtv3E6eIV+Q3bquZxbSgCOZ+28YhvE53U8gD5CmpJjgD02bihdeeEFs3bqV55ADDj0bAQcAAAAAAADAheMIONRwAce6desCjz/+eMX4+PirqHbvLkJHon5L9nOwUUgDjoN+v3+dYRhz6f5Zche5nPBJM+KKK66wAo5t27bxHCLgAAAAAAAAADjfcunBoaSlpWnynoMO7hHBwceCBQui+vfvX61GjRrcf+MREdqS8RM5xL03XD04ZMDhDAXyIw4y3GGN82d/+Hy+lX6//x36PILcqihKXVVVo6Kjo8UNN9zgPkXFmluef/TgAAAAAAAAADgPZIDBHM1EFSq6rSL8yJEjYseOHWLFihXcYFRMnDixSJcuXeLj4uI6UiE/lAr5WWQ1fU7mYIOKfA443Cs4ClzAQd+ZydUd+3RdX+rz+fg0mSExMTE3VK5cuWaDBg2Cbdq0EYMHDxYfffSR2Lt3L88zb/3JCTi4oSuHHAg4AAAAAAAAAP4CeToKF9oy5KBiW6F7qwjfuXOnmD9/vnj++efFgAED1C5dupRs2LBho2LFit1FBf6TVNh/oKrqBirsj3DRz+GGXfhniwIccHCYY2/FYXtoDr6lZ1Po2ueSSy5p06FDhyqDBw+OGD9+vHj//ffF6tWrRXJycs7cykCDrzz/4bYDFSSeAwAAAAAAAAD+Cg4xnNsk7FUcOasM1q1bJ1588UVx8803i5o1a+oVK1YsV6xYsav9fn8vKuYn0PVzKvR/pSL/KBf+jlUN2aIABxw+n89arWL/fBf5ir77eE3T7m/cuPFVQ4cOjf3kk0/MDRs2WFtTDh06ZIVIvP2HV8fInhtyBY1c0VFQeQ4AAAAAAAAA+Cu4uOZwIy0tzdnoUjbCFEuXLhXDhg0TderwqbDCR+II998YSMX8q6ZpLqJiP4nu08SZzUNlY8783mSUf/8cbhwXoaaiHG5kc0NV++f8/T8jz+q6flerVq0aT5w4sez27dv97vnmMInmWuWgw+vdFCSeAwAAAAAAAAD+ilwCDi6+rYDj+++/F/379xflypWj+l34ySWE+28M1zTtHSryl/l8vr10ny4KT8BxkldvOAKObeQjMlLX9U7t2rW7dPr06SVSUlJ093wj4AAAAAAAAAC4AM4ScGj8+YcffhADBw4UsbGxVL+LAKlN7iDjNE37lIr8DT6f76AdAIQLODJFwQg4OKgJF3Dw8y3kXTJU1/Xr27ZtW/PVV18tcujQIc0938ePH1cQcAAAAAAAAACcZ14BB29R+e9//ytq1+ZcQ0SRy0l3MkXTtMVU5O/w+XypIhRkFMaAg1eu/EzeIH11XW9F/1R+8cUXgzt27DgjxEDAAQAAAAAAAHAByCaj6enpziajTOXrsmXLxMiRI0WjRo2EpmnFyBVU4D/CBb2qqssNw+AjUo/ZIUCWOD3AcD7zChQuNlni9N8/BzU5DVO5ySh9d35+hKwkr5JeND9XtmjRovy4cePM9evXW6ERz6tsJMqNRmmuFWeTUcnrXeVnngMAAAAAAAAAzpWzqA4XcHAxTgW4VYTzCg4OOJo0aeKjgr683+9vTUX8fxRFsY6HpWcpuq5niFMrHQpqwCH7cDgDDv78B/mB5uJFmpd76Fmja6+9ttS4ceN8a9euteaV55fnEgEHAAAAAAAAwHl0toDDDjesbSv8jJuMPvbYY0qDBg2CVMBXJzdSMf8UFfWf03UHFfTHdV13rnJwBhoFKeBgHORYW3HsgIO3rOxSFGUBzcEYv9/fOTIysm6bNm2KjB8/XuUjYnkuGVZw5GEQAAAAAAAAwLnwWsHBVy7AuRj/8ccfOeDQL7sViTN7AAAgAElEQVTsspJUzF9G7iYTyXeqqv5ORX4WFfcywJA9NwpqwJHz/eyA4yh9/kVRlHk0F3yCyg2maVZr3bp15AsvvCA2b958xly7A47CwnMAAAAAAAAAwF9hNxnlxpdhi+41a9Yoo0ePNhs0aBBHxfxV5EEyjSzXNO0QN9rkYl+cWuHgPhY2y3F/MXM3QHVuuZFjrO/iaDKaTPfryfvkUdKWVGzevLk5duxYsXHjRjmPOQ1F7WNiraDD690UJJ4DAAAAAAAAAP4Kr4Bj+/bt2rhx46IbN25ck4r3f5EhZDbZoGnaUUfAwTjcOCFOBRrOVRBeAcM/LS8Bh/XMDjgy6bsfoPtV5E3Sn7QgZerVq6ePHj1acJNRex4RcHgNAAAAAAAAAPgrHAGHGi7g2Llzp/Hcc8+VbtKkSWMq3u8gT5NPyXZN0zJyCTgy7fuCHHAco+++h+5/FPYJKoTnqGidOnWUUaNGiZ9//lnOo5pthxwIOAAAAAAAAAAuAK+AY926dcEnn3yycsOGDVuJ0PaUSWQR2aNp2skwAQc33izoAUeW3+9Ppe++g+4XitCcdCOXkmDTpk3FmDFjnFtUEHB4DQAAAAAAAAA4V/IoWEeTUfXYsWNaZmamwgX4wYMHeeWG1SRzzpw5MX369KlN/9xIxfsQKu5fo+tP5A9VVbO5F4XdZFQ24eQVHBm5hAb5CYcbzlNhTtJ3z7Y/Z/p8vmT67lvo8+eGYTxXrFix22NjY2vVrFnTvOuuu8T06dPFtm3beH4VmmuNrqpsMson1KDJKAAAAAAAAMBfJI+Claem0GeVCm+NnisHDhwQy5cvF++++66YMGGC8u9//7tku3btGlWoUOEeKuaf1jTtf6qq/kyfk7ng53CD7t0Bh1zBUWACDv6O9N35OX+XE/T5D/rua+nz3FKlSj3RtGnTm2677bYq/fr102nexNdffy1+//13nmvubcLhkSpPqOGQg69e76kg8RwAAAAAAAAAcK64uOaVGhxy2Ks5VHrGqwyUHTt2iNmzZ4u+ffuK1q1baw0bNoytXLlyy2Aw2I+K+Sk+n+9rKuy30Wc+IjWbV3FwTwpxKuDIEAUn4JAnwnC4YR0Na3/XdLr+Rt99KX2eVaNGjUe7devW9uWXX66wYMEChQOipKQkcfToUWGvitE4RJIrZ3j++er1ngoSzwEAAAAAAAAA54qDjfT0dGslgb1NhYtvK+DYsGGDeP7550XLli2FaZp+XderUnF/AxX0w6mYf8cwjGVU6HNzzXRXIFCQAw5eqcLbcWTAweHOdhHqvzG1QYMGfR9//PEWS5YsKc3BkVyhYa/YUGiuNV4hI7cESV7vqSDxHAAAAAAAAADgxV1UcwHOjS65GLefKxxy8KqC1atXixEjRojatWtT7S4iSLwInZ7yHPnMNM1NVOgfFKFmou4Aw7mtwytAuNi4v0vOdhsONXw+30nDMHirCv8shWwWodNknmvWrFn35557rmlSUlJx99xnZGRwA1eN+5wUtlUbTp4DAAAAAAAAALx4BRx2nwiV73l7xbBhw0T16tUVKt6LkEYidAQqH4X6o2mav/n9/jRxKshwnjRSWAKOQ2QNeZeMbN68+W3jx4+vv3v37iLuuUfAEeI5AAAAAAAAAMCLV8Bh9+TgrRRWwDFy5Ehx6aWX+qh4L0dakiHkfbLeNM0Uv9+fYQcBMtAoiAEHf8fcAo79ZAmZRgY0bdo0YcyYMTU3b94c5Z57BBwhngMAAAAAAAAAzpXdg0PhoMP9M+7B8X//93/i6quvjtQ0rSoV8DeQJ8h8ssM0zePci8IOAWTPjZyjVMXpKzrykywHvneu4MjmBqOGYWTbJ8ZwD5JvyATyQKNGja4ZNWpUpRUrVkS455PDI5prPqVGKWx9N5w8BwAAAAAAAACcK3sFB5/uccbPfvvtNzFlyhS9Xbt2xSMjI+tTYX+npmkvUJH/LRXz+0zTzDqHgCM/NRmVv29nwHHcvjqbjPLPd9L1U/IUua1hw4aNHn/88TI//PCDwatgjh07ZoVI8sQUZ8CBJqMAAAAAAAAA54kdcKjhAo7Dhw9r06dPD7Zv375yIBC4lgr7h1VVnUGF/Coq7JNN08wOE3DIbSruVRD5PeA4Ic4MOI6TLZqmvefz+YbSs/ZXXHFFzVGjRhVZunSpHuYUFblaBgEHAAAAAAAAwPl0toBj//79/qlTp5Zq3bp1fSrqb6Hi/nHygQidGpIeJuCQIUBBCTic/URyvpsj4EglazVNm+Hz+R6iZ82bNWsW+8QTT5grVqxQeNWGM8RAwBHiOQAAAAAAAADAi7uo5saXVHRrsujm7RQcdvD2ilWrVgWeeeaZildeeWULVVUfoOL+efIlSeKCnxttcsNNcSrQyBBnblPJD4GGmzOgkffW97J7cMgmowfo2VIymXQll11++eUlRowYoXODVvfc89zKhq5oMgoAAAAAAADwF9hHweYU2JmZmdx/Q7NP+BA7d+60Tk/54osvxCuvvBLVo0eP2vHx8R2pmB9Cxf10wieG/E4yudDXdd0dcMiTU/JTwOH+vYYLOKzvZZ+ikmUYxnGak1307GsyhvAKlxrVqlULDh06VFm6dOkZc4+AI8RzAAAAAAAAAIAXLqx5WwoX2/a9Qp81DjoOHDggFi9eLCZNmiT69esnbr/99hLNmjVrVLZs2W5U2I/Rdf1/mqb9TIX8IS766bM8SaQgBhzOI27l9ztpBxy8eiWZvvtGevYheYy0JXGxsbG+gQMHih9//FHOuSLnHgFHiOcAAAAAAAAAAC/cB4JP9pA9N06ePMm9IjS6qrt27RJvvvmmuO+++0Tt2rW1ChUqlC9WrFhL0zT7U/Ge6Pf7F1Jxv50+p3Lhz9s1XAFAQQ44LHxyCs1BumEYe1VVXUbP3iA8P1eR0lWrVlWGDBkilixZIudclXOPgCPEcwAAAAAAAACAFy6y5fGljudchCvbtm0TEydOFNdccw3V6sJPLiEdyUjyPhX1q/x+/+9U5Kd7hAL5IdQ4G2dY4/5Zpq7rR2gettM8LFRVdQrNS49gMNgoJiamyLXXXiueffZZsXr1ais8Ipp9lU1GrRU0ha2xqJPnAAAAAAAAAAC3ME1FcwIO+TwrK0vlHhybNm0SY8aMEQ0aNFCokA+SeiLUPHMi+ZoK+W1U2KdQYc8niuRs27AL/wIbcPBKFVVV+Tl/rwxN0w7qur6Bns+LiooaV61atTtatGgRf9NNN0UMGjRIzJ49W/z6669WwJGZmanxNiAZcPDqDX4HCDgAAAAAAAAAzoFXwMFFN5+gQvfKhg0brICjcePGvHqjNGlOHiGzyCrDMA74/f7jvE1DnAo43H0qClzAweEGN1Tl/ht0f4yuvD1lOX1+u1y5co//61//umHYsGGXzJw5U583b561eoP7mXCwcfz4cZ3DI9ncledbHh/r9e4KKs8BAAAAAAAAAG5eAQcX2/yMt01s2bJFTJgwQWnZsmWQCviqVMBfT4aTeWSbYRjH/H6/LPRza8RZ4AIOTdPksbD8vdLIdrKITK1evXq/hx56qNXcuXPL//bbb2L//v3iyJEj1nxywEFzrR8/flxxvgfn+yiMPAcAAAAAAAAAeLEDDmvFhvtne/bsEdOnT/d17NixVExMTANd1++iov55RVEWUzH/OxX5WX6/XzYXdYYAzu0q7s/5Iexw/17598/bcPj7WUfhmqbJQQf/7Ajh01M+IWPj4+Pve/zxx5uuXr26pHs+ebVGWlqaxnNdmJuKunkOAAAAAAAAAPBiBxwqFd2q+2e8smP27NmRnTt3rlKsWLHWfr//ESrqpyuKspKK+WTDMLLzEHA4V3EUxICDj8jl+XiL/LdevXq3jB49On7Lli0x7vlEwBGe5wAAAAAAAAAAL7kEHIr9M+29994r1alTp4bR0dF3KIryBBXxH5JfyLEwAUdOCCAKZsBhNVN1BBz8870itD1lMulZt27da0eMGFFp3bp1Afdc2wGHioDjdJ4DAAAAAAAAALzYAYcWbgXH/v37zRkzZlTp0KFD24iIiH5UwE+xi/ndJCMPAYeTV6hwMclLwHFS0zT+rjtEaHvKk6Rz7dq1Lx86dGipH374weeeTwQc4XkOAAAAAAAAAHA3sZSNROUzLro53GAcdqSkpFi9N7Zu3SoWLVoU/cQTT9Rv0aLFnVTQP00F/AdkLTnART83GOXTRBxhgNyi4l6xcbGv2ggXaLhPhMmwWVtT7Caj6XS/icwmgxVFua5WrVpVBw4cGP31119zaGQ1F5UnpTDud8JHw6LJ6CmeAwAAAAAAAADcBbQ8JYWLbn4mm4zyNpXk5GSxfv168cknn4hXXnlFHzVqVJnbbrvtmjp16vT3+XzTqaD/jiRRMX9UhFYyZNnbNJwhQEEIOJwrUOQ9fy9nwJFJc3GY7lfQ9VV61pPmo2ndunVLDxo0yPj66695TgWfmMJz7Ag4BAKO03kOAAAAAAAAAHAX0BxscIHNKwtkwMErDXjrxN69e8Vnn30mRo4cKW6++ebIq666qnqtWrVuKVGixNNUxH9CBfwmclhRFKvQp2uWvT3FGQKE67lREAIO/mw1ULUDjmM0J7/R919I98/5fL7b6Fnt+vXrB4cOHaouXrxYBkmqXDGDgCM8zwEAAAAAAAAA4QIOLrI51JDP7dUFCgccb731lrjjjjvUsmXLlvT7/U10Xe9BhXwiFfZL6f53coKKeudWDmdIUJADDvmMA44swzBSaF420/1HZATNyfWkUp06dXxDhgwR3377rZxf1TnPzoDD690VFp4DAAAAAAAAoPA526oAuWLj6NGjvGLjjJ+npqaKN998U7n++usjqGivQtqRR0Wo98Zm0zSPcHNNKuxl0S+PhHUGAvKzV6hwMZOrNTJdz63vquv6CZqHfZqmLaf7WWQAuYaUjouLUx555BHxzTffCLuRqJZtn0pjNxm1wiU0GT3FcwAAAAAAAAAUPl4BB68eSE5OVhhvU3H/+vfff9/s0KFDGSrWG5N7yPMidHLKXirqubDPdgQcJ8TpqzYKUsAh+4nw/WkrO3Rd56DnV03TvqL7ieR+0oDEFC9eXPTs2VN89dVXzoDDOqEGAUd4ngMAAAAAAACg8MljwKEePnyYT06RP1Ns6ocfflj01ltvreX3+ztQwT6YvEHWEGv1hiPgYPJY2IIacGTY984tLBm6ru+neVipadq7dD+S3EJqEjNMwKFnI+A4K88BAAAAAAAAAG4ZGRkKNxTlU1PcP9u3b5/+5ptvlu/SpcuVVKh3p4L9OfIZ2UqO8dGo9vGoMggIF3A4e1fkV+6Aw+m4rus7TdNcpGnaK3Tfn1xHKhFfrVq1xKBBgwQ3GXUEHLyKAwFHLjwHAAAAAAAAADiaiDqfc7hhFd28omPnzp1i5cqV4tNPPzWfeOKJGu3bt7+xVKlSw6iIn+X3+3+iQv53Kt4zfT7fSWY3GZVbVE6I8E1F83OTUf4+8rtZz/i0GPvEmDSaj82GYXys6/pYmqN7S5cufUXNmjXLNGrUSO3SpYuYOHGiWLVqlZx7jajyPXC4IU+w8Xp3hYXnAAAAAAAAAAAuqrmxqKvfRk7AsX//fjF//nwxbtw40a9fv6I33nhj47p16/aIjo6eFAgEFlABv5UK+lQROj0km5y2XUOcWsFRYAMODnT4u9srV5J1XV9pGMYbZGipUqU6NmvWrE63bt2KjhgxQrz88svW9pSkpCTZ1FUjOSep2EfHIuBw8BwAAAAAAAAAwAEHr9Jw9Ntg3G/DCjjWrFkjnnnmGdG2bVt/rVq14mJjY9vHxMQ8RkX8HL/fv5aK+INU3FtbNRyrGGQoIE8aKYgBB39nK+BQVfUkzQWHO/z8d7oupvsXaW56VK5cucUdd9xR8aWXXopcsmSJ2Lhxo/jtt9+sE2k4xKB5V2n+FX4PztU0CDhO8RwAAAAAAAAAhY+7yagz4JD39ooO5Y8//uBTU8Tdd98tSpUqFUPFez1yF3mBLKQiPomK+HTHqg1nkCGDgCxx8QcYXty9Q2R4YwU7vHqDm6v6fD4OPHaIUF+SJ0nnSpUqXfbQQw+V+vzzzw2eV/f7SEtLU9LT061VG17vrrDyHAAAAAAAAAAFnzvQcK8S4MKaww1ubsnbVDjU4FUG33//vZg7d67473//qzZt2jRAxXocaUkGkDfJWiroD5FMx7GwztUazmAgvwUc4VZs5BZwWNtTAoFAFs0Fb9XZQPj0FD5h5rqSJUtWefDBB6O/++47Pdz7OXr0KDd1RcBxFp4DAAAAAAAAoOALF3DInhuOgEOhQlslYt26dWL27NnKqFGjRI8ePUSbNm3McuXKlaFivSG5g4whX5CdVNgf5+Le3pZy0i74M8MEA/k94JCrU7LC3HPAcTIQCBz3+/376H4p4dNT+JSZRhERESXuu+8+/8KFCxX7nSjO98NzjoDj7DwHAAAAAAAAQMEXLuDgcMO5JYW3o3AviCNHjohFixaJESNGKC1bthSVK1fWSpUqVcwwjHgq1m8QoVUJr5Pl5BA313T03GCyqWhuKx/yi7wEHDk0TcsMBAIpPp/vV7r/XIRCoE6kRpEiRQL33nuv8tlnn8l3omQ7Qg4ON7BF5ew8BwAAAAAAAEDhI48i5cLacTQsF9zWSR4LFiwQDz30kKhQoQLV58JH+EMLVVV7GoYxPjIycj4V8lvo2VF3oS9OPxb2jCDAxStkuJjw95ENU8/4Oc3NCZqb/bqur1YU5V2an/8GAoG2UVFRsfHx8Vrfvn0FBxwpKSm8ekbNzMxU5RYhDjf4fch7J693WVh4DgAAAAAAAIDChwtpLqp5a4Q74ODP3HujZ8+eIiaGe4qKIKlNOmuaNjoYDL4XHR29ior530UoyOAC3xlaOI+Fdf+soAQc1u+fT06xe4/wFp2jPp9vB83RQpqbqRUqVOjdqFGjK9q3b1+8e/fu4sUXXxQ//PCDSE5O5nlXebWMPAqWG7zyihoEHLnzHAAAAAAAAACFj0fAoSxfvlz06dNHFC9enFdvlCVXkb5kummaPwSDwd1+vz9NnL59ozAEHDnbb3hrjq7rzPoZ3R9UVXUNXedER0c/2bRp09sfeuih+BdffDFy9uzZ4ttvvxXbt2+35j0tLU07duyYJgMOvsrPCDjC8xwAAAAAAAAAhU8uW1SY1RtiyZIlYsCAAUqlSpV4CQev3riFPE0+9fl8vwQCgSNU2MutGs4GonyVqxwKWsAhT0zJCTj8fr/FfrabLCavlChRYsBNN93U7uWXX66ybt06/549e8TBgwdz5js9Pf20gONsvN5lYeE5AAAAAAAAAAq+cIXz8ePHFSq0FdlwlJuLHjhwQOzatUvMmTNH9OrVy6hevXoFXdevJg+pqjqNivefNE3bbxhGJp+cIk4FGgXhWFg3dxAjV3BY23J4awrNg4XujxFuLvoxeaZMmTL3dOvWrem8efPKZGZmau73kZaWptLcq2gqmneeAwAAAAAAAKBgcgcavHKAC2q+MjvgUDnc2Lt3r1ixYoX4+OOPxYwZM8SwYcP8119/fcm4uLjLTdO8jTyp6/o8LuKpsE/jbRl27wm5esF5LGx+XaHhtdLEGXCcdAQc/PMUskpRlJmapg2MjY29vlevXjW/+eabmGzXkbAMAce58xwAAAAAAAAABZM73MjIyLCaWToDDi60edvEunXrlNdff10MHDhQ3HzzzaJFixYx1atXrxkTE9PB5/MNoiJ+hq7rS6mI/4OK+Cwu7h1Hw56t54ZXqHAx8Qo4ZJhjbVFxBBwceOyl+4U0R8/5/f6ulSpVatKzZ8+yX375pRHu3dCcW6tnEHDknecAAAAAAAAAKJjcAQev1OAGl47GlmpGRobGz7nnxujRo8VVV10lihQp4gsGgxWocOdjYR9UFGUCfZ6vadovInQsrDsYKEwBh+zDYZ2gYgcc3Gx1K83TR/RsGM3T9eXLl69+zz33RP3vf/9TeOuP+90g4Dh3ngMAAAAAAACgYDhbY0oupHn1Bp+awoGG/TznWNhly5aJIUOGiCpVqigidCxsHdKZPElF+/umaa7UdX0v3R+3C33ZY8NZ9Mumo2cLDrxChotJloPzmfU97YAjixyi+7VkFulDroyKiip78803+3lVDDcY5TnnFTTyGFheNSPDJq93ByGeAwAAAAAAAKBgOFuRzMU1F9XJycnW1X7O4YbVAHP9+vXiP//5jxIbG2tSgV6OtCD9yEwq5H8MBAK7dF0/Ik4FG5muz84VHG4FMeDgFRwcbqQTPj3lWzKJ3EXqkqh27dqp06ZNE7t377a2A9E7UBBw/HmeAwAAAAAAAKBg8Ao4ePXGoUOHrC0T9tGwOQHHli1blJEjR/qrV69egorzeqQLGUO+oEJ+WyAQSNV1PcMu8t0BR5bjPlxQkJ8DDnnkLd+f9l1pXo4bhnGA/Ez3H5LRJIFUInrbtm3F9OnTxe+//87zrdJ7UeX7QcBx7jwHAAAAAAAAQMHgtUXl2LFjIjU1VeGrHXAw64SPFStW6MOHD4+pX79+dSrOryP9yWtkJRXyB03TzNJ1XQYUOasYHPfulQ4FQbiAI2dbDs1LqmEYO8hiup8uQiterialY2JixK233irefvtt6+jd7FCYpMr34Q44wJvnAAAAAAAAACiY5GkprsAjp8hOSUkRO3bsED///LN45513zN69e1eoV69ec7/ffy8Zp+v654qibCPH6D5b0zRZ5Lu3pIRrxpkfVmyczIOcU1P41/DJMfbpMZl0PUDzspZ8QHPzbFRU1N3lypWrX61atSLcrHXQoEHis88+E4cPH+Z3oNG70OS74JBJnmjj9R4hxHMAAAAAAAAAFEyysahjlQCv1tDsq9iwYYN49913xZgxY5Q+ffoUv+666+pXrFixCxXsIwOBwGyfz7eai3hyUtd1bqqZ7Sr6C0vAcULec8hjBz3HaD6SDMP4xjTNlyIjI/vVrFmz7fXXX1/5wQcfDIwcOVK8+eabYvXq1dbWIHlijQw0nE1Hvd4jhHgOAAAAAAAAgIJJHgvLhbTjOQccKhfdH3/8sejbt6+48sorA/Xq1bskNja2fTAYHKwoykwq3L/z+Xy7qJBP5zDAXrUgFbYVHFbAwUEPzUk2o/sUVVV/9vv975qm+VjRokU7X3vttZcNGzasxAcffKD/+OOPYuPGjWL//v3W/NO7UI4fP67KsCmX1TVwFp4DAAAAAAAAoGDigIN7PbgCDt6iovCpKWPHjuVwg+p0tSQV702oaL+fTCRfGoaxhQr5wyL80a+5nZpysQcabl7hxhkBh9/vZ/xr95MfyEukR1RUVIuOHTtWmjZtWuTOnTsVZ4DB+BSVY8eOqWgq+ud5DgAAAAAAAID8yV0k89VZWPP2FF6pwVcOOvbu3Ss2bdokli1bJt544w1x77336uXKlYumAr0muYEMJ3PIOiri9+u6fkycah56Lqem5FdZLvxMhjnWFh1utko48NhB5pMnyc0kPiEhofg777zj49Ua2aFtQIp8V9xzg96B4gqb4Bx4DgAAAAAAAID8yR1wcLDBqzZ4lYAj4FC5sOajSr///nsxY8YMwf0hunfvrjZp0iTaMIwqVJy3JL1JogitStir63q6pmmyyM+yi3x5ckphCDhOOp5Z31tVVQ43jpNDdL+WvE0GkBakfKtWrcxZs2bJEOO0gIO3CoVZTQPnwHMAAAAAAAAA5E/ugIOLZ14pwCEHP7N7cFgBx6+//qpw8d2rVy/RpEkTUb169YgSJUpUosL8KnIfGUs+Jb+Qo4qiZDn6boQLOArqsbDOI3CdYQ4HHCdM00wm2+n+GxHaznMPuZTEtGzZUp02bZo4ePAgvw8ON3JOrLFXcCDg+As8BwAAAAAAAEDBwIEGb0nhYtp+llNkb9u2TUyaNEm0atVKaJqmUkFenFxObiejDMN4x+/3r6Aifp841XdDFvl8z9syZN8NdxNR931+4f4OMswI11+EG62m0xztJSvp/l26H07zdQPNZ5UiRYqYN910k5g+fbrYtWsXB0wqHw1LFLmaht8LenD8eZ4DAAAAAAAAIH84W1Esi+gjR45YKwXsMTkBx759+8SLL77IqzcUKs4jyCXkX2SoYRivRUdHfxcZGbmDivVUV/EvAw65giO/Bxy5NRMNF3BwY9GcE2TomuL3+7eQz2meXixWrNiD1apVu5LmtHT79u21oUOHig8//NAKOOgdqOnp6VpGRoYiV9M4j+xFwHHuPAcAAAAAAABA/uAVcHCfh0OHDinJyclyKwSHG3wsrMLBR2Jiotq8eXMON8qT5qQnmaLr+sJgMLgtEAgkU+HuXr0hAw6pMAQcJ+zrSZqPbJof/nVZqqr+7vf7l5imOTMiImJo7dq1b7z11ltrDRs2LIrDow8++ECsXr2a3wG/C4VDDm44yu+Ggw3GfVK83iWE5zkAAAAAAAAA8gevgIO3QBw+fJgDDoVXDGSfWsGhcPAxbdq0QOvWrctQsX4Z6UKeIp+QLVS0pxiGkcEnhdhBgLvRprsBZ0ENOOSxsFbAoeu6PBb2mKIov9L9PLp/JjIysuvVV199xfDhw8t9+eWX/s2bN1srNzjcsFdrnBZwMHm6jde7hPA8BwAAAAAAAED+5C6SeYUAF9ZyGwQX1Bx6pKamirVr12rjx48v1qZNmzoREREJqqoOIq9R4b6c7KeiPcvn8/E2DGeh7w4z8kuIkVfhgpucLSq8NYXDDdM0+fkRspq8TgbQ3LVr2bJljcmTJxfZtWuX5n439gk2Cl+93iPkjecAAAAAAAAAuDh5rdiQx8JyES23PmTbKzb4M29VWbNmjZg/fz5vTwk8/PDDVZo0adI6Kirq4UAgMJmK9wVUqO+ggj2dt2EwO+A4bZtGGF7BQX7hGXAYhnGS5uo43f9OFpPx5C7SoHnz5qWnTJlipqSkyONgc46F5XeSmpzrBE8AACAASURBVJqKgOM88hwAAAAAAAAAFyevgEOemsL9NewtKUz23RC8bWLGjBmib9++WufOnUtTQd6sYsWK3aloH09F+6d03UhF/GER6i+R7die4mwqWhgCDmdvkZx7Dntojk7QXB2i+03kA/Jf0o5UbtCgQcSECRO0P/74wzn31me5csZxog38RZ4DAAAAAAAA4OKUl4CDi2hXwGH13eAmo7xy4+GHH1bi4+NjypQpU6dIkSKdTdN8igr3uVS4ryN/0OcTuRT+sqmoM9QoDAGHDDk44Mj0+/1HaM54lcu3ZArpQRqTEk2aNFGff/55sWPHDjn3OQGHvUVFYAXH+eM5AAAAAAAAAPIHd+DB21IyMzO5iaUi77moPnjwoFi3bp0YP3680rJlyyAV41VIG/Jv8gZZRoX7XnLMXdTncu8OBvLzag7n712GG3K1invsCZ/Pt98wjFX0eY6u66MjIiJuLlKkSM2yZcsGb7zxRvHSSy9ZK2W498mJEyc07n8iwyc+rlcGT2gq+td5DgAAAAAAAICLg7MIDlcIc4DBKwJ424N9DCyTJ6VYqzn4mNIPP/xQ8LGl99xzT7Ay/UPF+TUidCTsZLKQJFHhnsZNRR1FvyzynVs1CkLA4f69njXg4L4bcqsOfU6lOfrFNM3PdV2fWKpUqV7169e/qn379uXuvPNO38iRI6255hUcaWlpfGqKxoEGvyd+P/yu5HtCwPHXeQ4AAAAAAACAi4NXwMHFsuy54ejtwOGGTpTt27eL1157TfTu3Vt06NDBrFevXlxUVNTVVKx3J+NE6EhY7iWRomlaFnEGAefSc6OgBRw5DVV5Tuzgh7eo7KPPS0zTnGEYxpA6derccOedd9YaM2ZM9DvvvKN89dVXYsOGDdbRsPQ+lPT0dFUGHPbqmpzmrwg4/jrPAQAAAAAAAHBxyGvAwSs1uJC2x/AKDm4qqnz99deiX79+ggpxvUiRIqWoMG9MRfo9VKyPIXNVVV1D1/0iFGa4gwB3z438FGKczTkFHLquc2NRHpdGfqE5+5iePUnuaNKkSaPHH3+87KJFi/zcWPTw4cPWNhQOMujd5AQcXu8R/hzPAQAAAAAAAPDP8CqE+ZlcDSDHcDEtf87PU1JSxJ49e8TatWvFpEmTRNu2bTUqxotQcV6L3EiG0/3siIiI5WS3pmlHXQW+3IaSYcvyCAnye+DhPhaWrznf2+fznTRNM1NRlIN0v5xMJ31Iy0aNGl0yduzYmK1bt2r2O8g5FtbuuaG4juyF88hzAAAAAAAAAPwzvAIO2XMjPT39jFNS+MqrB1atWiXee+89wad53HPPPVq1atU43KgmQk1F+5EZuq7/yOFGIBBI5a0pjkLf2XMj03HvDgUKS8Bx0u/387GwRxRF2Ur388nTpBOpQ/8Ue/bZZ/27d++W7yLn1BT7yF6Ftw4h4LgwPAcAAAAAAADAP8Mr4OAtKRxi8CoNDjnsMVxU8woCddeuXcqsWbNEr169RJs2bUR8fHxUdHR0VSrGW4lQU9EJZAEV69t1XT9KeGWCs9AP11S0MAQc7u8tA45Mn893JBAI7KJ5WkL3M0lfcjUpW61aNWPUqFHKL7/8It+RO+AQWMFx4XgOAAAAAAAAgH+GV8DB21E42OCeG/L40exQUW0V1t99950YMmSIqFu3roiIiDCpOI+lwpyL8e50HUP3H6qqup7uD4szgwlnzw1Z+OcWcBQk7oDD6TjN2T7TNNfQ/M0VodUbt5E6JHjZZZeJ0aNHizVr1sh3dFrAwWEUAo4Lx3MAAAAAAAAA/H3y0nNDnr4RblxycrJISkqyjoN96aWXxA033KAEAgEfFeClSUNyt67rT0dGRr5Hlvn9/j1cuNvFvXOlhrvnhrvYz68rNty/b/dVfvdM+Wscq1rSaO62GYbBq15eomuf4sWLt4yLi4utUaOGr1OnTtbxuxxwcPB07NgxjZuLymNheXsKmoxeOJ4DAAAAAAAA4O+Tl54bciWAPSan5wYX0RxsvP322+LZZ5/lnhvcGMKgwrwkuZTcQkZomjY7EAgs460WVLCnuop/Z8Dh7LlRkAMO5/1pAQeHG3w0LF355wdovlYYhjHL5/P9t0yZMjc1adKk7u23316kf//+4rnnnhOffvqp2LZtmxVw0HtS6T0pMpTicEOutEHAcf55DgAAAAAAAIC/j1fAweEGr9Lgfg72iSk5PTf279+vcrjRs2dPceWVV4qaNWv6Y2JiSlFhXo/cQIaQWeQnKtr38IkpVLg7t5w4i30ZbhTWgIOdVFWVT07Jpusxu1fJZ4ZhjCF30/w26dq1a9nJkycb33zzjVi+fLkVbvD74bApPT2dT01R5Pt0n3iDgOP88hwAAAAAAAAAfx+vgIO3Ochww91z46effhKPPfaYuPzyy4WmaVSTq8WpKOf+EAn0uR8V5VPo+WK630nSXYW9V8+N/BpouOU14LDmgldv0LxxwHGI7leR10l/0qZu3bqXDB48OGrx4sW8FcUKNWSAwVd3wIFQ48LyHAAAAAAAAAAXztmKXlkoc+Hs3NrgHHPo0CFly5YtYtmyZWLKlCnilltuEUWKFOGeG3wcbE3Sjor0vhERES8Gg8HP/X7/FnqW4ir4uajnPhwnRPjmml6hwcXM63s4gxw5Lifo8fl8mTR3aXTdTvdfkXHkdnJptWrVSgwbNsy/fv163iaUs1WI3wu/Lw6icCzs38dzAAAAAAAAAFw4Xis25PGivDXF3pLiLKSVNWvWKK+//roYMWKEuOuuu/goWF2Ewo1qpA15WFGUyYZhzA8EAht1XT8kzjwJhYt5DjdkU9HCFnDkrNgQp05RsT7TvKVFRUXtpbn7iebxDXo2kLQkFcqVK2cOHjxYrF+/Xr6zMwIO7sWBgOPv4TkAAAAAAAAALhyvgINXAHBPhyNHjlgrObJDBbTVc+Pw4cPqe++9p3DPjYYNG4qqVauqMTExRUUo3OAivCd5gXyuquoGTdMOUpF+IpcQwNlzozAFHPy9cws4jhuGsT86OnpdZGTkXJq/MfTsDhFq2BpTtmxZlZuL8tYg+51hBcc/yHMAAAAAAAAA/H3cvRo41ODVG3a4IbetKFxAr1ixQowaNUo0atSI6m2hkihSlVyrKEp3Ks7H+ny+j+l+PTlgF/Ky6Jc9N/IaaHj9PL9wf48zjoV1OKpp2nY+FlZV1Zfovi9pTXNbie6NSy+9VDz66KPiu+++k+9LI6qjB0fOaTfowXHheQ4AAAAAAACA8ycvPTd4WwoHGo4xihxz+PBhsXHjRvHtt9+KqVOnii5duoiSJUtyuBEklUgLKsDvN01zTGRk5BwqzlfT/X4R6rHhLPJP2ORqBa8Aw+vn+YX7uzpPTbGOheWTU+xjYXk7zxryFhlGOsXExFxao0aN4s2aNVO7du0qJk2aZJ2e4jgWVuXwSR7py+8SAcffw3MAAAAAAAAAnD9eAQcXxKmpqdb2BseWFHlSivrzzz8rM2fOFEOGDBG33XabqFevnqLrOq/cqESuIt3JOL/fP9c0zVU+n+93uj8WptCXRT0CjjDHwmqaxnO2Q4Qai/4fuYdcUbt27fJdu3Y1n3rqKTFjxgzBx8Nu377dCjPonanHjh1TZENYd3NYBBwXlucAAAAAAAAAOH+8Ag7u2ZCSkmL13OCwI/tUzw2NVwjMnTtX6dWrFwcbIjY2VkRHR8uVG1faRTj3ifhIUZS1VKzvp+txET6UCHd6SGEJONzfW4Yc8ljYTF3XeUvPSvKmCDUWbWOa5iUdOnQITp48WVm5cqXYunWr2LdvnxVG8buj96M4Aw55ZCwCjr+H5wAAAAAAAAC4cNxFLxfHvN3BPjHFunLRzKs61qxZI5555hnRrFkzqreFQiJIRdJcVdW7IyIiRlNx/p6iKKvp2T5xalsKF/Gy54Y7zCgMgYbze8gmou6eG9bPNU3LpDk8ouv6rzSPn9P9/9H9nTS3l8XHx5cYPHiwvnjx4rDvUvbcQFPRf4bnAAAAAAAAAPjzvFZsyJ4bzFEYKzbrBJV169aJL774QkyZMkXceeedoly5cjLcqEA47ehqmuYTwWDwHbouU1V1jzhzWwqvUJA9N9yrNvISDOQX4QIcJ2fAYX037rvB+LOu62k0h7v8fv8PERERMypUqDDg8ssvb9W6deuKDzzwQOC1114TSUlJZ7wnxqtvXO8R/kaeAwAAAAAAAODP8wo4uCDmLQ68QsO9JYWomzZtsnpu8HGknTp1EnxyBxXgkVSMx5IrRGhbyjM+n+99wzCW0fU3KtbTwhT+8jjUcNtSvIICr1DhYpKXgCOn5wY3E+VtKYzuT+i6/jvN7wrybsmSJUddeeWVnR988MH4559/Pubtt99W+eQafl/2O8w5FpbJ5rAIOP4ZngMAAAAAAADgz8tLwMH9NsIFHHSvfvbZZ8rDDz8s6tatK8qWLSuioqIiqCjncKMpuVNV1Sfp+gFZTZ/30s/S7SLeXfhnuXgFGF4/v1idU8BBc3aSm4oyuj9C9xv5aF2/3z+uQoUK93fu3PnKqVOnll+zZo1/165d1ik2cvsQ4RNTcgIOZ88Nrz8XcP55DgAAAAAAAIDzxx14yC0qzvu0tDRx6NAhsXbtWvH888+La665hmpvIY+CjSNXaJp2R0RExEjTNGdTUc7NMJ09N7IdhbwMM7xCjfwaaHhxhjp8z98vpweH3VT0pN/v55/vJd+RKaRPqVKl2nbr1q3GJ598Eu0MMhiv1Dhy5Aj3RlHs025yfc8IPP4engMAAAAAAAAg785W2MqeG9yIkvs1OApjudVB4RNUuJnoxx9/LCZNmiS6du0qKlWqpFHBHU0qi9BRsN2oILd6bgQCgZ+oSP9NnB5uZNsFvLPnRkENONwrNNw/lz03nEFPTsCh6/rJiIiIEySFV2/QsznkMdKR5jb+rrvuKvnll1/67fckj+zl01LEwYMHleTkZMVeeZPnPwdwYXgOAAAAAAAAgLzzCjg41OAeDhxkcJGcHSqa9Wy758bWrVutnhu8LaVDhw58HKwSGRkZQwV3VXIN6U7GaZr2gd/vX+nz+fbk0nPDWdi7w43CGHDIpqJyZYt1T/OXERUVlRwdHb2DPi+kZy+Se0lDmtdSnTp1MufNmydXb+Q0FeX3KI/zxQqOi4PnAAAAAAAAAMi7vAYcjp4bzAo3iLJgwQKlX79+Ij4+XhQrVkyNiIiIpkKbw41rSXdVVcfR/cf0eS3ZL0IrN8L13HAX/l5BQH7l9b1OCzTEqZDDouv6UZrjXWSppmlv0bOhpB2pGAwGjS5duihz5syRjUVPayrKW4mYoycH/IM8BwAAAAAAAMDpzvY38+6Ag7ekMC6C5TP5mcfzz3glwN69e62eGxMnThTXXXedQoW3j4rsoqQ6aUX3D0RGRj5Lhfhc+izDjQxXIX9C5P2klPwcduT1e0nyBBn3eH72h6Ioa0SoUeuzmqbdFR0dfXmZMmWKXX755eKRRx4RH330kfjjjz94xY3V+FW+P16Bw+SpKVix8c/yHAAAAAAAAACn8wo4ZKDBKzS434b8m37HKSmqzVoZsGrVKvH++++L8ePHi3vuuUdUrVo1QMV2KVJHhFYT9Pb5fM8Hg8G5gUBgja7r3FD0hKtYdwYczp4TeQkCvAKFi01ev5cz4OC5sVa6OI6F5a09W8kX5AXSKyYmpkWjRo3iunTpYvDRvFOnThU//vij1W8jNTVVS09PV2VTWL4yBBwXB88BAAAAAAAAcLqzFbLOcIOKYSvASE5Oto4XpXuFfg0HG7LnhpKUlCRef/110atXL165wVtTjKioqLJUbNcnN5D+5CVFUeb7fL51uq7vp8/Hcin8Za+Jgtxzg+XleznnIKfhKs1dtn0sLAdBHBQtJdNJP9K2evXq1Xr06BE1bdo0MX/+fLFixQqxe/du612mpaWp/A5lwMHv2bkaBwHHP8tzAAAAAAAAAJwurys4uN8Gr+DgfhuyGSX93LmCQ1m8eLEYNGgQNxMVwWDQNAyjnKqqDajYvpn8mwrxqVSUL6DPm8kBu1CXhb27wHcX9vk5xDibcN/rpOtn7nmwtu7QXFpHwpJkuudTUz4ko8jNNNd127ZtW3zSpEn65s2bra1DcuWNvSWFT0/JORYWgcbFxXMAAAAAAABAYecVaJxLoctjeDUHr9zg42BfeuklkZCQ4DNNk4+BjSWNya26rg+NiIh4JTIy8isqvLfQs8PCPtrU5u654S7qzxYKFKTAw/l95Bw4T5A5bbyqqlmGYRwlO+jzIprjySVLlnygYsWKVzRs2LDswIEDja+++kq+r9OaisqeG+FOTYF/nucAAAAAAACAws4r4OAVG1z0yr/pt38mjxRVHZ+tMatXrxZvv/22GDt2LPfc8NeqVau4CDUTbUG6kpGapr0eCAQWkl90XT8cpljnYt7Zc8MrwPD6eX7l/l4y3DhhX0+qqsrBhjWerumGYew2TXMJeaNKlSpDrr322nbdunWr8uijj0a89dZb4tdff5XvUHW8v5yeGzg15eLkOQAAAAAAAKCw8wo45FYU7tPg+Nt9GW5oDtZpKW+++abo2bOnaNGiha927dolixQpEk/Fd3vSi4wl7yuK8pOu6ztIMn12NxSV/mzPjcIQcPDxuRk0d3wUbDbje1VV9/n9/hWmac6Oiooa2axZsy79+/e/dNasWUUXLVqkbty40dqaYr9D+f6sgEP23JBNReHi4jkAAAAAAACgsPMKOOQqDkn+Tb9rrFUkL126VAwbNkzUr1/f9Pl8pTVNu5SK8AQqvh+h4ns8Fd8f0TM+tvR3ki5ODyScx7/K4t59X9ACDC9nW8Fh9dygeea+Gzz2CNlMzz4mYwKBwL3XXXdd8wkTJlTYtGmTwSGV3SfFemf0DrnnhoqeG/mD5wAAAAAAAIDCxivQkFtSnMVwtqNXwx9//CE2bNhgncCxcuVKCx8Fu3z5cpGYmOjv1KlTkejo6Eoi1G/jFjJQVdXJERER8yIjI9dSMb5f5H4MbM7WC3H2QMPr5/mJ+3u4A41wrH4lvDXFMIysQCCQrijKbnr2LXmZPERatm7duuq0adNiUlJSVMd7tE5KSU5OVojKfTe8+q94/ZmCC89zAAAAAAAAQGHjFXBw8cunazC7H4PzZBT1559/FrNmzRJPPvmkGDVqlBg9erR44okn+LPv/vvvL37ZZZfVpOK6NbmXjCAzqPj+yjTNn6kQ36/rergtKVzMc78NBBzhAw7Zi8QZcmRrmpYdERGRHhUV9bvP51tFz94hj5J/kRrNmjUrOnXqVB+fcmO/Y6vnBr/XlJQUDjgUBBz5g+cAAAAAAACAwsYr4OCCl/s0cFHM2xiyHb020tPTtY8//ljt06ePuOKKK0SjRo0sjRs39tG1ZN26deuULFnyeiquHyHPkzlkCdmqquoBKsiPK4qSW6HvPB3EK8Dw+nl+4hVwyC0p8kQZZ8BxIiIiYn90dPRawzA+omdjyB3kUlK0adOmvokTJ1q9Uex3bAUc/J45wOIjfnnrCgKOi5/nAAAAAAAAgMLOXcjy1hRuKCpPTbG3rSi8dYW3pjz33HPcQFRQca1QEa2SSFKO1Pf7/Qk+n68/fX6JfErWkr3kqF2gOwv7cD03CkJg8Vc5QwwZcjiPy80JPxRFSab53kTz/hndTyQP0bMWpHwgEPC1a9dOTJo0SWzdupXfIwcbGl/5PYdpHAsXMc8BAAAAAAAABY0zsHD/7bvzuWwaytsVOMxw9dzIwSs5tmzZIn788Ufx+uuvi/vvv19UrFiRw40A4SNgq5LmpDP5N5miquoXhmGsp+J7f5hVG1ycy1UJed2Skp2Hn+cXXt8jXL+NDDme55Lmlz9zk9adZDGZSgaQhNKlS9esW7du9DXXXCP69u1rHdm7detWJS0tTeUVODK44iuHHPJYWKzYuLh5DgAAAAAAAChovAIOZ6jB21F4qwL3Y0hNTeXmk86jX63GlL/88otVJA8fPlx069ZNNGnSRERERPCqjfIitBWC+z3wEbBPk9fJQirCt/h8vj90XT/OjTBzKeIzRPiVCQg4Tj8iVwYcOX03aF453OCTaJaTWWQo6RgIBOo1b968xMMPP6yPHTvWem98ss2+ffv4PStHjx5V5ZYU/jPAoZY8FhYBx8XNcwAAAAAAAEBBk9eAgwtdDjio6BWHDx9WOORwBBw6X3nsl19+KQYMGGAFG1WqVBHFihWLUBQljgrqJiJ0SsogETq5Y55dcCeRFHHmSSlnK/QRcJySKc4MOHIajOq6fszv9++jz+vIXPIk6ULqx8XFlerRo4fv3XffFevWrRPbtm2zTr3h92w3j1XkCg65gkf+GUHAcXHzHAAAAAAAAADZVvHr3KrAf7PPRTFvTeEeDm3atFF89A8V0UVJFXKloih3mKb5HzKNiu5v6H4z4SNgj+VS0LubiP7VIKCgcH9PZ88N99gT9BoOGYaxkeZ6PnlB07Tufr+/WSAQKNeqVSvjhRdesFbd2O8253hfZ28Vrz8PcPHxHAAAAAAAAJAfne1v2509Nji0cMsOFb3SGb+ee25s2rRJLFy4UMycOVP06NHDf8kllxSh4jqW1CftSA8qsp+Miop6nSym4vpXuueGl5m8JcXRc4OLdrnFQpI9N8618M+vvL6He/WKnC++yp4bcuwRmuOtpml+pWnayzExMX2rVKlyXePGjS+57rrrIocMGSI+++wzK8jIPnW0r/WeZWiFgCN/8hwAAAAAAACQH3kFHM4eG1zsSnR/2rGv2Y4CWOJtDe+8844YOnSouOOOO3xUPJeIioqqScV1C3KnCPV7eFnX9Y+o0F5Gkvx+fwrdZ7nCDcm5zaIwruDw+h5ydYsz4JDHwlrhBs0tz+sJstvn831Pc55oGMaAypUrX0//1Bo8eHDRyZMnqx999JF79UbO+5V/JuRKHchfPAcAAAAAAADkR3kJOPhv7LnPhotCP5OF72l/wy/xyg1eCdC4cWMjNja2dNGiRetqmtaeiu2e5Gkqst+i67dkMxXf+0gaPXMfAXu2Aj6vocW5jL2YeX0P9/zILSrWCg5uKur3+3llzAG6X0X3b/t8vv/Qs4716J9HHnmk5Jw5c/y//vqr2LNnj0hNTXX+eeCjYRX558LZcwPyF88BAAAAAAAAhQ0HH4cPH7ZO1jh48KCTsmXLFm3q1Knm9ddfX8wwjMpUUDcmN5J+VFiPDwQCH5DlVGzvomep4vQ+EScdhbmz34bkVfh7BQEFRbjvLefqjLG6rp8wTfMgzf8Guv+YPENuJ5fXq1evzPDhw83Vq1fLkMraesRBBgdavN2IT8mRJ6U4oalo/uI5AAAAAAAA4GLktUJD/m08hxVu9q9RXHJ+PW9V4RM2PvnkE/Hee+9Z3n//fYWuEdOmTSvRu3fvyrVr124oQse/3kceJ4l+v//TyMjIVREREXuo2HY3EpWF+glxanuFM+woTAGH10oV98+dKzbc4zNo3g8Gg8ENhmF8RvcvkAdIc1K+atWqAT6+l5vB2u/XWpXDfzZ4JcehQ4esa7htKQg48hfPAQAAAAAAABcjr4Ajtx4bxLkFRcsO02tj//794oMPPrC2odx9991SBCnfuXPnes2bN29TokSJblRA/5dMInPI96qqbqJi+3efz5ceps+GdMaxpiJvhX64+/zqzwQcMhhyB0EphmFsiYmJmR8ZGTmR3kFvetZKhE6yiSxfvrzCvVI4sLL/fOS8Z/6zkZKSghUcBYTnAAAAAAAAgIuRV8AhT0jhkMONAw6774K7z4ZV+K5Zs0Y89dRT4uqrrxZlypTRSTSpSBqTm0qUKNGHiur/owJ6NllENpK9XGyT47kU7bkV7wUltDgXXt873NzIFS/O8emEG7guDAaDk03T7KMoSlt6VoPwqTbqJZdcYgVVS5culX8+clbr8J8PDjc46AgXcED+4jkAAAAAAADgn+AMMNwhhvtn4Xj9+5OTk8WuXbssu3fvzpGUlKTMnj1b79q1a6BkyZLFqEiOI3VFaFXA3eRR8hKZp2naSl3Xd9L1CBXW7pUFzpUHcsWGfJbXLSkFxbkGGs45kuOdvzaL5vs42UOfl9L1NVVVB4rQlqHahmEUL1q0qK9s2bKidevW4umnn1aWLFkiAy5VblPiUINX9XAvjnP98wMXH88BAAAAAAAA/4S8BBy5rdKw/zbe3WPjtD4bfFQo99iYOXOmmDFjRo5p/8/efUBXVS0NHN+33zSS0HsRpCqoiEoRn4ICigXsig17RxQE9VmfjWd5dtGn4ifow4pgx4IdC1hRFERBREB6D/WbueceODncZCfYDsnftX4rtwwtua49Z87s2Q8/HB88eHBB586dtbCxq+hunIGVF4l/i1HiTfFNNBqdJxfTq/SIUj2q1HfR7m5FcbdWbMuWlIpiWwoc+v3yd2ykRCKR1emtQJNDodBT8trVoq9oK2rUq1cvvs8++5h+/fqZyy+/PDR69OjwN998E9JixsqVK0Nux4bSz4tb8KDAsX2zBgAAAADA38FW4HAHiOrdd91m4BGSi9ZMMzbcORupX/fmm2+aK6+80vTt29ccdthhruShhx5ao2vXri0aNGjwD7lYPk5cInQ7yuPidfGZ+EksEmvC4fDGUuZtZOpGKOuFvq1osD0pz7/b/Z5pUUi3+/gHi66LxWLzcnJyPsvOzn4qEoncIK8dL3Toa00R79Spkxk6dKh58sknUz/nKVOmhHSuin9Lin6O9DX3MQWO7Zs1AAAAAAD+DrYCh7eDw39KSvo1PQrU7dwoNmNj1qxZZvjw4eaggw4yhYWFpkqVKlGRJxqKXapWrdpTLp7PlIvl68X/ifHiSzFLLDbO7Af3wrukYsRGz9eNpTyvDLalwKHdG+5QUe/3bnEsFvtafj5jEonEjeFw+BR5rYtoIJK1a9c2J598snn22WdTw2KXL1+unRsh/Vzo5Lx0sgAAIABJREFUz76kLSkUNbZ/1gAAAAAA+KOUdjGZ6YKzNLY/S4/+/Pnnn83333+f2o7i9fLLL4cGDhwYa9GiRY5cFFdLXxzvJPYVRxtnO8rtcvH8TDwe/0BM16NIxVqhWyS8W1LcrRTrPI/d7Si2Iobtwn97Vt6Chr/Lpdj3LxQKrRPL5fF0+fqauF0enyb2lZ9Js+rVq1dp3Lhx6IADDjD//ve/Q9q1sWlLcSvsfi68BQ7bZwjbF2sAAAAAAPxRbAUOtxsj08knHu4WlEynoGz+/ebMmWPGjx+f6tS46667irnssssSPXv2rJqfn69Hie5mnDkbuh1loLhJjBB6Ef15IpGYJfQo0o1ik1vg8GxL0Yvw9RlQ4ChfgcOdV7LV902+3xvk+75Uvv8/hsPht+W14UKPg91P7Fi7du2C/fbbL3LaaaelTr959dVXzeLFi/3dO6nPhRY39HNEgaPisQYAAAAAwB+ltAKHd6aG3mV36bwEz/NQWlh+D/98jc0zNtTkyZP1Tn5qxsb+++/vld2lS5fazZo1axWNRrVjQweIamFD52zoANHXxCQxQyyQi+sVYp0WNdzOjQwzN0rrRChrEcAWu70pb4FDO1/cmRvFTpiRn9OK7OzsGTk5Oe/GYrGH5bVBopdoLvI7dOgQGzJkSGpbyocffmhmzpxp3C0pm3yFLy2iKQocFY81AAAAAAD+KLYODuWeblEWehGbPjGlGD0C9umnnzYnnHCCqV27djiRSERElh4fKprKhfLuWVlZB4VCobPkAvk6oRfNWtj4wmyZs7HGbH1UaVlU1IJFeW1LgWNthl9TFIlEZieTyffj8fij8jO7TF473DhH91atVq1a+LjjjksNFJ0/f74WyELr16/fqmPD/ZyUZ5sTti/WAAAAAAAoSVkKFt7CRUnzNDIVKWz0Lvwvv/yiJ2SYL7/8spi33347dO2118Y7duyYKxfBNUR90VLsaZw7/ycYpwvgDrlofjKRSLwrpovUnA332FffNhTvNgp35kam01FsF/oVtQBS1u+B+730d7sUKyTp6TRCOzrmi8niCXGlOCYWi3WoWbNm7ebNm8e0K+fGG280X3zxhX4utLCxuZNHu3+02LVy5UpvR0eJn1HbZw7BZg0AAAAAgJLYChzebScuvZvufa533FX6xBN3noZ/28lWMzaWL19u3nnnHXPfffel5i54RK+44orcvn371mrYsKFuYdjDODM2jhJni3+KO4yzHeX1eDw+WfyoMx7Eep2xkaHAsclsKXCsMxQ4Minr98AtZni/l+73MRWv3/tEIrEymUzOlZ/F5/LaM+JacYzYo2bNmvW6deuWfe6555phw4aZV155JXViyibfUFEtcOiwWd3epAWx0j6/FDi2f9YAAAAAACiJrcChF5Va0PDO0ShhpoYe4+ktbkR93ELH5iKHzll44IEHzLHHHms6duzoiomqe+21V6MWLVrsmpeXd4BxujX0VBQdHvqQeF68Y5ztKD+FQqH5Yln6lI5M8zUyXaRnKmyU5eLeVgjYnpX1e+B+/9wtKd5TZ1LxkUhkTXZ29q85OTmfx+Nx/XndLE40TgdO/V122SVr0KBB4bFjx5pJkyaljv3VYln6s7H5M+IW2PRzmKlLiAJHxWINAAAAAIC/g15wugNH/RefetH61ltvmQEDBpjmzZtH5KI3IfKNsxVl51gs1jWZTB4RjUbPk+c3iP+KF8RH4nvxq1hqnKGW7gW2v3ixwfe8LMUMZJapwOF2cPi/j2vD4fBviUTii3RxQ4e/ni66ioaFhYXZRx55pBk5cqSZN2+efjZCIuwWKdwCmtuxQQGj8rAGAAAAAKjYbF0Y7laTbeH5vdwjO0v9u+i8hGnTppmPPvrIfPDBBzpLw0yYMCH1WF+bOHGinpIRfvfdd+O33XZbTq9evQqTyWQ9ufBtJnYV3cyWrShXiXtjsdizcrH8tpgi5ojl8tp631GvLm9ngcvbYZBp4Ki/2FFZCiC2f6e/oOEWNbzFos3xui1FfiZr5WeyUJ5/I8YZp7hxVjQa7Va3bt0d27Ztm9ezZ0/zr3/9y3z88cfu58rdypQqbixbtiy1famko2ApeFRc1gAAAAAAFZutwOHdZlIS7bSQryGfTPM0Sp2rMXXqVPP444+bK6+80uixn4MGDTKXXHJJ6rG+dsUVV0Quu+yyvMGDB9c6/PDDd2jevPkucgH8D3GoOEUMFv82TsfGGPGOXDR/FY/HfxILxZpSZmy4F+X++RDe4gYFji1s/85MHRsZt6SkZ26szc7OXiA/Hy1uvCxuE6eJfQsLC5t179694KKLLgrfcccd5tVXXzW//vqr+7nZPHNDP6c6UHTVqlWpLh8KHJWLNQAAAABAxRaUAof+GTosUreddOjQwey8885mp512StHH8lqiffv2Vdu1a9dEnu/SqFGjfXNzc4+QC+BzjDM49E4xWrwuPjHOVpQ5YnEoFFoh1lpmbJR0ce5XUmxZL/wrCtu/01bg2PzrwuHw2mQyuUh+nt/G43E9rvduoUf4/kPs0KpVq7yBAwdGX3jhhdSpOXPmzEl97kr6vCpbVxIFjorHGgAAAAAA20ovIt1TVPSCVO+uL168OLWNwF8k0e6N//znP6F99903JP+F5cI2KrJEgagtrzU1W7ahaGHjTOMUNu6W9/4nXhdfiJm6zUGsSl9IZ7roLmnORsbtEyX8HhW9gFFe/u9Lpu9xscJG+rEWPRZGo9HvYrHYq/L4PjEgHA73kOfNCgoK8g499FDzyCOPpAobmzzbnXQblM7bcI+BpaBRuVkDAAAAAPz1bF0V7lwM9271nyCk5M9xLyYzsf47tCvjxx9/1LkZZvz48akOjXHjxpmXXnrJvP766+aNN95IfZX3IiNGjEieeuqpeY0bN64mF7h1RGPRxjjHvO5nnG0oJ+nFr7jGOB0bT8iF8GuJROITMU3ocMrV3m0oZusLcf+cDe9WFO+w0bJeyFcWtn/3Rh+3oJFx7obOQJGf0Rr5GenMjW+F27mhxY3e9evXb92hQ4eC3r17h6699lrz/vvvu58rtwtIjxdm5gY2swYAAAAA+OvZChyZjl/1HsPq8r+XiW4nkQvF1LaS9JGtYVf66NZMW0y820y2mqXhWrRoUaqocf3115vzzz/fnHvuueass84y55xzTmorysCBA/VrXN6r0q9fv1p77LHHDrm5uW3lIrez6CmOMU6nhs7W+Je4R4wUY8VbYrKYFovF5oglYq0obcaGy3/x7R8iSoFja7Z/t7/A4W5JWWt8Mzf05xKPx92ZG1rc0M4N/dmeK3rl5OS02Xfffatdcskl0fvuuy81c+Pnn392P1eh9Gcu9f+B+zmmgwPWAAAAAAB/vfIUOP4AW83OcMmfUVqBI9M8jWKFjq+++soMGzbMdO/e3TRt2jRlhx12UJGWLVsm27RpU9CiRYu68nrzBg0atC8oKOgWDocPN86xoFrUuFk8KJ5KXwRPFF+JH8QvYpFYIdYYpwvDdpFe2gW57QK+rBf6FZXt313mAof8jIsSicSC3NzcKfF4/NVQKKTFDT3St7to3qxZs8ILLrggpjM3fvjhh9RxsFrE8P4/oB1M3k4mW8cTBY6KzxoAAAAAoHLTi0c9lUK3Augxrl46T+O3335LXYD635s/f37omWeeCZ988smRWrVq6TyNuMgVugWlvnGOdvV3a+jxrpdHIpHbxAgxVrwnvhQzxHyxTOjWhvWWU1C8HRr+7ozSChqlFT4qW1GjNP7viff77H3u/Z7p4yKxUH5+30ajUXfmxkXy+MCsrKwW+fn5BQceeGD4/vvvNzNnztTPYLGODf0srlixIlWco6ABL2sAAJSHd0EpacEpx37hEAAA2JqspaXNxSjzfIyy0m0mn332mXnxxRfNmDFjinn++efNM888Y0aPHu19PSISTz75ZO7QoUOrdurUqbZcwDYUO4p2opM4QBwmTjDOtoSh4sb0xe4T8Xj85UQi8b74WszUu/3y2kr5ukHokaKbdCuKznHIUOTINGPDX+ygwGFn+3f73/cWlrb6Nfqzkp9ZkXz9TZ7rUbCviLvEheKgevXqtenYsWPVww47LHz11VebCRMmpLadbNpyEk9In+u8DUWBA37WAAAoD1uBQ4sbujDpgqTVd6/0nt/Uvl957oqUIgoAQEUl62FU1ssU/3tFRUVRWVdLUtbtJCVuK/H75ptvzAMPPGDOPvtsc9JJJxVz6qmnmlNOOcX069dPn4dFUuSL2vLaDvvss89OdevW3dM4Ww90SKgWNM4XlxunoKFbEx4Tz4nx4kOh3RrTo9HoL/J1oVgpj9fpBbJfKTM2vBfcpXVwbDK+C/EMMbYL/YrK9u/2v+9uSSkymWduFOXk5MzPysr6OhwOvySv32Gco2APkPdadu3ateqQIUOiI0aMSA2fnTVrlvdzuPnUFHdrFTM34GcNAIDyKEuBY316z7BOvc4g5BEGAABFET9ZR21FjJKKGSUpscixatUqo3MQzjzzTNOyZUtTt25dr0iTJk0SjRo1ypbHBaKGaCBait3r1Kmzb2Fh4SFy8apFjQvEFeIW8ZB42jh38N8XX4rp4mehd/eXmi1zNdz5DeUtLNiKFBQ47Gz/7kwFDrdzxlvg2BgKhXTmxvycnJyv5OtL4XBYT8DRzh098rd5w4YNC+QzFh07dqyZPXu2WbhwYbGZG+vTHb5uN7CLAge8rAEAAAAAgkcv7rRN351/8XvMmTMnNetAT6lIvxYSYRH57LPPorfccku8a9euCbkQTYocUShqGmeORhPRwjhbT/Q4131Eb3Gcce7O66DQG+SC9t5YLDYqGo2+IN4TXwjt0vhVLNOtC/J1Yyknn2w0WzoyvFtObFtPSrpAz1TkqGwFjPLyf4/8MzdK+jVaqPpNfq5u54YWN86Xn3nPvLy85jVq1Cjo0aNH+I477kgNFN20ZeaGbsdKFTrcLSn63P//AgUNuKwBAOBnm7HhVta1bVA7Nbw2/QX7hAEAqAyWLFliPv3009T8i8cee6yYxx9/PGXUqFFbvZfJo48+ah566CHzyCOPROR5XOSIfFH99ttvr3P88cc3aNiwYVO5KG1pnKGgWsjY2zhzNA4WR4mTjVPQGCiuMk6nxv3GOdL1ebmwfSuZTH6cSCS+EbPEb2J5PB5fp/M05L3UXA33eNcSLpbd2RqZlKXQUdrFOgWO0r9fmd53i03rMsXrFiL5+a6KxWK/hkKhL4xztO+tJr0tpW7duq323nvvwmOPPTZ87bXXmtdffz3VMbTJyQ1THUg6c2blypWpAocWOihwoDTWAADwsxU43C0oWmV3zyVPC8n7JR0157bHWv98AACwyXz//fepuRinnXaaOeKII4qRC8aUo446aqv3Mgj37ds3fthhh+X06dOnUJ7XEg1FC9GuV69ee+6000775OTk9JKL0r7G6cw4zThbToaIa4xTzLhXPCJGixfFW8Y50lUvbL8TM7VbIz1TY4XQYZMb3FkaWtjQr6V0cHgvsjeUItNFOgWOstmWAod35kaxXxOLxVbL52ZOdnb2JPnZPiuvDRP9xT7yM27WuXPnwiFDhsSeeOKJ1EDRn376yfsZT90E09yyqKiImRsoE2sAAPjZChzunA1dhPzkfX/nRpmGmwEAgC10TX311VdTQz933HFHU1hYWEytWrXCqlq1alF5HhNxkRTZIlfkiQJRTdQqKChoIJqKNvK8vegieoi+VapU6ZdMJs+QC9KL5cL0SnGTcU6+0Dka/xPPi9eNMxz0MzFVzBLzxCKxTKwyW+Zp6N3+zbMZvBfE+NuVtcCxwfPVnbnhvubGrtHODS1uJBKJZ+Tzo58bLW50EQ3r1KmT079///Bzzz2nxwmnOjS0kOF+xvVmmVvQ8LP9/4HKyxoAALaCRnkXHD23fO7cuebHH3/cilbu5WtIRERMxEUyLUtkZ5CT5n8tUwwAAH+XktavjO//8MMP2VOnTs1RnphcNWnSpLxbb701b999960iF4sFxpmJUd04czH0SNZ6xpmP0cg4MzJ0e0lz0VrsLHYRu4uOoqtxTjg5SBwujheniwHGOenkevEf8VA0GtXjW58X48V7YpJcxE4RP4q58nyxbkkQG0TqGNcybDnxztTItOXEtu3EdjFOEaV0Zf0eugWNUmduhEKhdWKlPJ4tPpXHTxnntJxT5TOxT9WqVRs3aNAg64ADDjDyGTby+db80N2Soh0bIe3WWLp0aWq7CltSUB7WAACwFTi88za0cyP9XokzNr777jujE7Lvu+++Yu6//37z4IMPRoYPH54lz/NFDVFXNBRNRFOxo2ie1gIAgIrqnnvuaXHnnXeqlvK8lWgt2oidhg0btvNxxx3XtkmTJrvKheNuooPYyzh3x/cxzskU+wvdVqKFCz2eVYsXx4oTjXMnXecg6DYT7cy4zDhbTfQu++3iPjHCONtNxohXxbvRaPTTRCKhp2B8L2aKX2Ox2EKxQi5e1+oMDS+3yFFKgUO5RQ5/gSPTXI3SihzluXDHFmX9HnqLUSXN3FifLnLNkJ+5no7zuLjWOJ+5rnXq1Nlh3333zevfv7+5/vrrU11IOksmnSOmtixrgcMdKsrMDZSXNQAAbAUOLWpoS6EuQulBosrdflJsvoZ2b7z00ktm0KBBpmfPnsX06tUrfsghhxT07t27njzfUbQTe4quYj+xv+glDhQHid5pB6f19r3mfw4AwN+pd8/S16Zi7/fo0aP3/vvvf7A4RJ4fKvqII8SRcpF4dKtWrY7Ny8vTbosTjDPgU7suzjFO0UIHfQ4SQ8U/jVO80Lvotxlne8lw8ah4QjwjxhnnyNY3xTvG2W4yWXxlnC0nP4jZoVBobnqGxhKxXKyWC9kisV6LGO48DZe+VoaZGt4L6bLO1aDA8ccpy/fQW9zQeRvulpRisdFodElWVta0nJycCbFY7BHjHAt8tNhTNNpjjz3yhgwZEtHBuB988EGqc9d3cyyVW+qNM80tmbmB8rIGAICtwOF2cbjnk7vzNtIxxTo4tA3xtttuM/vss49JJpNhERM5olp2dnbDgoKC1pKsdZTnB4i+Qvf9nibOEReIgeISMUgMTrs0bbDvNf9zAAD+ToOTpa9N/vfdmCHiMnGFuEpcI66Ti8nr03MNdHCjnkyhR29q58WDxhn2+ZhxChi6RUC7MPR4zjfEu+Ij4wz//FZMN87MjF/EXPGbWCiWiuVCtxusNsXnZ3iLDt7HtotpBE9pBY5MxSZvB4f7a/S5Fr2mJRKJN8SD4XD4UnntCON0GNWpUaNGVr9+/UJPP/106mhjd2iomyNqQUNpTrktW6ABZQ0AAD+3oJGpZVAtW7bMzJgxw3z99dfFTJkyxTz11FORM844I1mvXj3dK1zHOPuCdzJOW6220mr7rLbNXmicfb83GOdu093GOWruv+Jh4yRurhEAAFRg2mmhxYpRxhnq+aR42jidF2Oi0ehYuaB8Ubyavrh8Oz0fY6L4RJ5/lt5WMlXMED+LeWKJWCmK3JkZKtM2E8scDfci2b0AzrTVhLkafx//96ys31/vz7Sk7/cG+VxoF48WxbRYpsNmtTvoEtE3Fou1r1mzZp0dd9wxrjM3brrpJvPll19qvujO3EjN3XBnbminr7fo4c09KXigLKwBAODnztzwLUCb521ou+Hzzz+f6tS4+eabNxs2bFj8wgsvLOjatWsDSZjaGmeo2cHGaa093zj7f7V9Vo+Z02ROEzhtmX3NOEfNacvs++ID47TOuiYCAFCBabfFx+JT42wb0ZNKPjdOB8ZX0Wj0a1lXvxHfienix3g8PlPMFnPk+Vzxm1gklotVoti8DLe48TsKHO7FMQWO4ClvgcNbqCp15oZ8JrRA9ksymZyshTbjdBHpFqneYhctbuy3335ZetqP5oKvvPKKWbBggZs3FitwaHFDh4p6tqxsRoEDZWUNAAA/XXh0IfIe5bXJmbOR8t5774WuvPJKs//++5vOnTu7kqLG7rvv3qJBgwY6AE1bFs8VVxlnL/BI47TPauVfkzlN3KaIaWKmcSZx/2qc1lk1z/PYfQ4AQEU0P03vki9IW5imx7AuDoVCS8RSsUws11MsxCqxWqwRRenTLdaLjToTo7yM/UK6pIvq38N2sQ678hQ4MhU31prMMzdWRiKRn7Ozsz/Kzc0dHY/H9SbV6cY5kaelqLHbbrslBw8eHNIbX5MmTTKzZs3yzmvbTG+eeY+F9b9PgQNlZQ0AAL8SChypORu//PKLGTFihDnssMNMlSpVjCREEVFFNBC7JJPJHolE4hTjDDzTTg1tsZ1gnLtQWszQQoYmbrrvd4Vx9vy6+339SU95h48BAFDZ2C5+UfH5Pw+lfT788zY2mi0FD+9znc0yKxwOfyR5nR4drCelnGScE3yaifzCwsLoUUcdZUaNGmXmzp27ebaGmztqLqncjg0KGPgjWAMAVD7+BcY7c0Mfa3VdT0xRWuTQVsPp06ebyZMnp45/veSSS8zOO+8ckcUtS1Q3ThVfFzydon2RuCUUCj2eTCZfF5+Jn4S2za6UBXKdtsPKcwAAKjXvNpFM75Xh+NXSLngzbUHw3q33KutWk/LcdCjp4hu/X3m+p27cBt/XYnHpLp6N8nlbE4lEFukwUXmuW4e1A/dq0U90iUajO9SpU6fKTjvtFOrRo0fqKNhPPvlE80n3ZL2tZm5o54a/qEHHBraVNQBA5ZOpwOHO3PAWOFatWhVasmRJ6PPPPzejR49ODY46//zzTffu3UPVq1fPlYWunmhnnH2Yuh3lJvF/4lUxKR6PTxdzxQodbqaJmu7x1a/evcAAAFRGuh66Mr1XxrkYZb24Xb8NtqWwQYHjz1ee72mmn3+xrSha3NAjf+Uzt1Y+e79lZWVNyc7OfkWe6/D3IeJIkz4GtrCwsMp+++0XvuCCC1Kz2HTmxq+//urmmO525pAWNVauXJnKJzNtS6HAgW1lDQBQ+fgXFO3ccI/u0te0lVAeh2RRCs2fPz/00ksvmSFDhhhZ0Ezr1q1NnTp1cmQBbCgL3R7GORVFjwl7QLxinNkaOlNjoSRly9OTt9drgubd56vPAQCozEpbF7dxLkZZLoj/KttyMY6yKev31I3xdvG4RY7Ur3U/e9FoNFXcSCQSX+Xm5r6Ql5d3uzw/zzg3sfRmlp6MlyN5YGTgwIFm3Lhx5quvvkptXdZuDX+e6Q6s15zSv3XFn4tS4EB5WAMAQBcfd0uK/73FixebJ5980hxzzDGmsLAwJItbtqhvnGNfj5GF8LJkMjkiEom8I4vkD/LakvQC6l1c3cfePZ7lvRMEAAD+Gtt6QY2/h//n4/9Z6eNMW1Pc11eKOca5STU2Go3eGovFzjDOMNFWkt9VC4fDsYKCgtQMtkceecTMmTNH80T3hL1UkUILHXpKSlkGidpyU6Ak1gAAFV9pVXK3Y0PbCJVW2b3v63vPPPOMOfTQQ3XmRo5oYJw2xePj8fjV+fn5/ycL3rvZ2dkzksnkCm2p1TbHDHed3OJGpj2/mfYDZ9oT7H/Ptn8YAIC/UnnWsW1dv8q7rWRbbijYLqDx59rWn42X+7PP+GeEnJN2dNC7ntQzXbwvRhtnu7GelLKfaB4Oh6vWq1cv0r59e3PggQeaa665xrz//vuaIxabuaFdwMuWLTPLly/POHPDn4/aclegJNYAABWfrcChC5EsSql5G76TU1JefPHF8BFHHKEzNxoap3NDB01dH4lEnsrNzf0oLy9vViKRWFZKccO7CHv3gW7rnmAAACqjTMWLktiKGNt6EW27OMfvt60/G/dnr58V79GvxX6dbkmRnG11PB7/VXK2r4yzxVjnbQwVx4ouYgdRkJ+fH+3WrVtqwPw999yTmrnx888/a36onRvuzI1i3cB0cODPZA0AUPHZChy6EC1fvjy0dOnSjAWOl156Kfv444+vn5ubq8WN44QeFfaM+CKRSMxNJpOrIpHI+nLsFbYlVgAA4O9T2rptW+Px+23Lz8Zb3PJ2C633/7pwOLw6FovNicfjn0n+NlZeu12cLQ40zryNekJvbEWaN29uBgwYoDe7zLRp01IDRb1bmr25pRY5VElFDAoc+CNYAwBUPv4FJt3FEVq3bt3mfZRa6NCjvWbNmhV97LHHah5zzDG71apV6yhZFK8Qj4dCoU9l4ZsvC+Q6nfaeLm5sNFvabbflblJpC7wtGQAAAKgM/PlRpnwp03PN0ZaJWeJj8ay4JSsr68z8/PxuOTk5LXJzc6vJ17gw8lpqW8rw4cO1a8Odt5HKFXVLsxY6dHszW1LwV7IGAKh8dKHRCrt2bnhe37xo6ZCo77//3rz55puRJ554Iv+yyy5r3b1790Nr1qw5VBbBEclk8oNIJDJbF0o9wk6lCxxaxCgSa0zxfcVuay0FDgAAgOJs+VBJsd4tKVt1arjSW1K023aePJ8qJoj/E9eJ/vXr19+3U6dOzQ466KCC3r17R+SrUYcccoj55z//qflgWPJGdztK6hjYdPdvinsKX6Z8kwIH/mjWAACVj/dYWN97qQLH3LlzzXPPPRe6/PLLc0444YTG3bp16968efOL8vLyHk4mk++KWbJIrnAXTeVZSN22SLewQQcHAABAyWz5kD/WP8PMux1lq1+jxY3s7OxfJH+bLDnbC/La3eJicaToKP81GThwYP7w4cOj//3vf82DDz5oHnjgAaOPX3jhBTN9+nQ3R9yqg4OZG/irWQMAVD66KGmXRqZjYdWnn34auvrqq5OdOnWqI//tUbVq1ZNlYbwzEolMkEXyR1kgV8rjkiZzl6egYVvQy7rYAwAAbK9s+ZA/1l/g8N5c8sZq3Mp4PP5zTk7Ox5K/PRUOh/8tr50pDhBtatSoUevEE0/MevLJJyMzZ85MDRBVs2bNSpk9e7ZZunRpifmkYuYG/krWAAAVn3eBUekCR2j16tVvBB9QAAAgAElEQVSh9PyN1LyNRYsWpRazkSNHRo866qjCgoKCVrL49RaXGWeo6NRoNLo0kUi4XRsbTPGZGxtN8cLG71nAAQAAKiPbzSBbDqVFDz0CdoH4IRQKvR+JRJ6Qx9eL0ySX65abm9u8WrVqhXvvvXf0hhtuMF9++aWbN27ehpK2eXio5ovareEWNUrLN225KbCtrAEAKj63qOFOtk5vUQlpkUOfz58/33z++ed6Wop55JFHQhdeeGHubrvt1lgWwX2MU+W/xzjno8/X01J0qKinwFGU5m5HKWtHhm1xBgAAqCgyFSnKki/552xsdeyr0llomptFo9G1sVhsSSKRmCn52qfy+kvy/gPGOQJWT8LrWrNmzWZ77bVX/hFHHBEaOnSoGTt2rFm4cKGbN4Z9UkUOLWxo569ub2ZLCv5O1gAAFZ8uNLoYuUOg0kNGdUBUWIsd3377rXZtmIsvvtgcfvjhUVn0asnit7txzkJ3j4T9RqzQxTMSifhPTfEeQ1bWBZsCBwAAqCzKW+DwFjbcLShFZsuMs83xmpNpbhaLxYqSyeTC7Ozs76tUqTIhJyfnsWg0eqNxjoA9SOwmGrVv3z5/wIAB0UcffdS89tprqcHy2p3hyR2Lzdvw5pJ6s4wODvydrAEAKj53G4pW3j2LT1jpIvXhhx+aq666ynTq1MlUrVo1KQtiU1koexpnANVD4XD4XVk8f04vrv5F2HtHwbZgAwAAVEblKXBs8PEWObbq4pAcbaPkanpKyq/RaHRKIpEYn5ubOzwrK+tSeU27NvYWzUTVwsLC5LHHHhsaNWpUatbGkiVLUnPZvDmjLa8E/k7WAAAVn3tqyqpVq1KP069rVV6P/dLjv8w555xj6tatK2ufyRNtxXGyWA6TxXGsLJJfx+PxBemF1V1o3cXVO+SqLAs6AABARVOeAsZGk/nXufzD2kv687TosdI4szZmiI/EWONsLR4o+og9o9Foo4KCgtx69eqZLl26mGuvvdZMmjTJzQUjauPGjSHdvqwDRfXoV+92FHeLsz+/pGMDfwdrAICKz1bgGD9+vDnttNOMLH4hWQiri87i/HA4/EhOTs6HeXl5v8Tj8ZWm+J0Ef4GjpFNVKHAAAICKrrwFjkwFDe+pKMW2orgzNmKxmEtnbSyKRqM/yvuTxcviv+Jf4iyhnbjtRL3q1atna5duv379zBVXXGHGjBlj5s2b5+aCkbSwzmZbtmxZqsChOaN2dmgHMAUOBIk1AEDFV0KBQ4W8HRx16tSJyULYUPQSV4qxiURianZ29jJZRN2jx9wF2L8oU+AAAACV1e8pcPiPe/Xa6C1u6El2Yp1YoDmamCAxj4ubxbnicOPcqNItKTVEVtu2bXWAvHn88cfNhAkTzLRp07zbUoqdlqL5ordzg2NgETTWAAAVn63A8c4775iBAwea5s2b58pCqEfDHi1uFROi0egvyWRyrXx1F2V/McNW4AAAAKjofk+BI9NJKW7BI5VfaZFDbNBZG2Ku+FK8Ih6U16+IRCL9jHP6XWtRW2SLaF5enunTp48ZMWJEaubGypUrU10ZblFCCxn63M0PKVog6KwBACo+z5DRkHfhUrqgvffee2bIkCGRdu3aVY/H4x1isdipsmAOl4XxE1kwFyYSiQ06nTu9CLstkyUt4HRsAACAis5fpPC/V1Jcab+upD9HOzlWiPlimphonBPu7hAXS452ZO3atfdq3rx54xYtWhSIqDw28tV07tzZXH755eaDDz7Y6vhXvfmlW1JWrFiR8ehXf85oyzeBv4I1AEDFV4YCR2TIkCHZ7dq1axyPx7vFYrGLwuGwtjtOkUVzhbZD+goc6zyLMgUOAABQ2ZSlwOF939+l4cqYL+mWFM29otGoFjcWGWeI6MdinHjAOFuJ+4teubm5u3bq1Kn+KaecknvRRReFhBkwYECKztwYPXq0mTlzZmr22iZfgUOLG9rhm2nOBgUOBJE1AEDFZytwvPvuu7HBgwdXa9Omzc6hUKiPuMo4U7h/kMV1rafAodwCh/9YWP9zChwAAKCiKm+Bwzs81J21UWSK3zRK0e0omnfFYrEiycF+C4fD38rrb4hHzZYhor3F7qJpo0aNqp9++ulZjz32WEhnbHjpNuQpU6akOjX8+aHmgNq5odxZG/78kQIHgsYaAKDi8xc4vO+lCxzJQYMG1W/duvVeslCeIIaJ18SsaDS6LplMbvLM4PAXOJjBAQAAKpvyFji8+ZL7PNMpdPqe5lnLxc/i81Ao9LLkYffFYrFL5fmxoqvYUVQPh8NZ++yzT+S2224z33777eaCheZ9Smdu6Kko2q1RUo5IAQPbE2sAgIovXeAIrV69OlxCgSNn0KBBTVu3br2fce4K3C3eFnNkQV2fTCY3yFd3gXanertHl9GxAQAAKqKy5Dj+Qoe3oGH7te7wUN2SogPdV8jX3+T1meJL8aZ4Qtxas2bN89u0aXPYbrvttkf79u0bydc8Edpzzz3NeeedZ8aNG5faarLJd/RrWsgdOM/Rr9jeWQMAVHxlKHBUGTRoUKvWrVsfJIvoQPGw+Egs0MJGMpncSIEDAABUMmXJcfwdGt4jX/2D2Tdzj37VDtl4PL5Wcq1F2dnZPyYSiUny3niJGSn+LS4Wx++66677nnLKKW2uuuqqOldffXWOMPLYXHPNNeaxxx5LbUPx5HfFZm2kpTo73CNgM21JcXNGChwIMmsAgIqvDAWOgkGDBu3cunXrw2QRHSpGicliiS68FDgAAEAlVJYcx1vgcAsb+nWtKZ4zFduK4ilurEokEvNycnK+zc/Pfzs7O/uJSCRym3EKG8eI/apUqdLuyCOPbPDAAw8UfPLJJ8lPP/00LIw8TtHixoIFC8qUD2re5xY3KHBge2QNAFDxpQsc4dWrV0dKKHBUHTRo0C6tW7c+0jhTuZ80TmvkMk8Hh7so68Jd5F+oAQAAKhF/0cNfDMlUHPEWQlaJhcY5HWVSJBJ5OZFI/DccDl8lz08TPUOhUDt5Xr9t27b5l19+eWzixIkZ8zx324m3cFGSTDkiBQ1sT6wBACq+MhQ4qg0aNGi31q1b6+Cqa41ztvrXYjkFDgAAUEGUpQixyZQc4+UdGFpih4e7FSVtrVgqr88V08Qn4mXxmHG2owwQerOpa35+fouWLVtW69SpU+zUU081o0aNMnPnzvXmcO6xr5vnbaxbty60atUqZVxa/GBLCioSawCAiq+MBY7dW7dufbxxjh97TkwxFDgAAEDFUd4CR0lFDXcrylqzZUtKsbzIO2MjkUioNXrkq/heXpsoMePEf42Td11gnO0o+4q2olGbNm0KTjzxxOgNN9xgRo4caSZPnpzpJBS3yOEOEg1pjJc7UJQCByoKawCAiq8MBY7q6QJHP1lUrzdOgeMbQ4EDAABUHH9kgcM7Y2OrYaKeAseGeDy+UvwqvhLj5bX/k5gbxbmir9hbtBF1RX6W/HfwwQdH77333lRh48cffzSLFi0qUxGCLSqo6KwBACq+MhQ4tIOjvaeD41njdHAsSw8Z3eQpcDBkFAAAYGuaC3m7O5aZLdtRtGtjjLhHXBaLxU7Iy8vTAaJtsrOz64hcERJmp512MpdcconmZ26+lurSkBwutH79+tCKFStS209064nbnUGHBioLawCAiq+MBQ7vDI6njTODwy1wuKeobDIUOAAAQDD5Oy78r5UWm6lTwztnI+Of6XZqRCIRtVGskueL5L1fjNMN+54Ya5ztKNeJs0WfKlWqdGzbtm3T7t27F/bq1SvWs2dP06NHD6Nf+/fvbx5++GEzc+ZMzdV0G0o0LaIn4i1ZsiS0bNmy1KwNeb55GwoFDlQG1gAAFV8ZChzuKSpHGecUldHGOUVlqWeLCgUOAAAQZL+nwOHdfuJ2YbiKbT9R3hkb8XjcnbOxQsyR59oFq4UNHdquHRtXibNEH9FFtGncuHG94447rsqwYcMi999/v1H33Xdf6qvO3NATU5YtW+bma+6cjXBRUVFo5cqVqeIGMzZQGVkDAFR8ZShwFA4aNGin1q1bHyaL7lAxUkwWSyhwAACA7cQfUeAoqcixVSdHunNjYywWWxOPxxeJH8Un8vzFUCj0kMRcI84Qh4iOormoJap06dIlcdNNN0U+/vhj89NPP6XmbLhmzJhh5s2bl2moaCqn829LYcYGKhNrAICKL13gCGlbYwkFjvxBgwa1bN269YGy6A4UD4uPxaIMMzj8Q0a9CYEt8QAAAPi7/BE3ZTTf0VxojVhunBkbP4jPxevicXFrKBS6pEqVKsfUqFGja9WqVVuKWiJLmB122MHo0a9jxoxJzdJI52SbT0PZlD4RRWdsuMqyBYUiBioDawCAis9f4PBKFzhyL7300h123nnn/SKRyFnhcPheWZjflQV6njzfoG2XeocinRDYChx/RPIAAACgytKRUdL7/g6N9R4bPF9LzFl0K4rO19AbPWK9WCkWyHuzjDOQXbei6JGvejLKrWKwOFliDmrVqtXuvXr1anzUUUcViKgw6uSTTzZ33nmn+eKLL9xcTYsakU3pORtpqaGia9asMUq3omjOlinHo8CBysQaAKDisxU43nvvvayhQ4fW22WXXTomEokTYrHYv2Uxf00W9Z/l6zp5baOvwLHWUOAAAAB/vt9T4PBvO3FzmExHvG71Z7vDQ3XGRjKZXC+Widnia3nvHePM2LjXOFtRzhfHiP1Fh4KCghYHH3xwrRtvvDF31KhREWFco0ePTp2QMnfuXG++FsqADg7AxxoAoOIrQ4Ejfumll1Zv27Ztu2g02kcW86tl4X5eFujp8ngNBQ4AAPA3+T0FDn+hwztXY73n61ZDRFV6kOg6yY2Wi/limpgoxsl7eiqKnjynw0P7iq6ijagvqrZq1Sp38ODBsbfeeius8zS85syZY+bPn+/dngKgjKwBACo+LWLooCpZSEP+9ka9I/D2229HBgwYUKWp/CeLcndxiXhCfKOtmOkho+6C7yYG/qSBggYAALDxFx/8r/njMv2asrL9Xfzc+RqrjTNfw7sVZaJ4WTwq/i0uzs3NPa5OnTr7NmjQYOd69erVF3kiUr9+fdO3b1/z0EMPpYoZ6ZxLOzLCXuk5GyHN0bw4GQUomTUAQMVXSoEjpAvoG2+8ETrrrLOSNWrU0Mneexpn4veD4tNoNLpY2zLTBY6NhgIHAADYduUtcJTE25XhPfXEO2Njq9zE3XYSi8XcuRre+RqrNO8Rv0jc9xL/qRgvRov7xfVigDhB9GrSpEmHHj167HDKKadU79+/f0IY10033aQ3kFLbS9yca9OW+Rqb52ykO2yVcWnOpr+OAgewNWsAgIrPU+DwD6gKa4Hj9ddfN6effnqksLAwRxbsVuJo4wzKeksX+WQyuTp9TKxb4HBbOSlwAACA8vg9BQ7/TA3vlhPdPluU5s7WKJafuAND0zM1NukQdX0sX3U77hIxR0wVE2OxmHZr6OBQ7dYYJPqLw4yzFWWXcDjcbJ999ql11VVX5T377LOxsWPHGi8tbujxrxnysmIzNrRIobmYl//4V//vQYEDlZk1AEDFZytwTJgwwVx44YWmcePGEVm0G4pe4krxfDQanSpJgN7NcLs23GSBAgcAACiv31PgKK3g4e/mcHOTrYoc2sWRtk4sEbPFVPGxeFWMFP8RQyT+JPl1PcUeormoLQrq1KmT3b9//+iYMWPCCxYsMEuXLi1m4cKFZsWKFRQhgD+YNQBAxZceMpo6ZswzXFS3q0S04PHJJ5+Ym2++2fTq1cs0a9aser169ToVFBScF4vFHo5Gox8mEonZkUhktTc58CQf/kSitKQl0/sAAGD7UlpBwv/+H8X2dyrt76o3adaIVWKZ+E3MFtPFZPGWGGOc+Rq3icvEGVlZWYfWr1+/447OfzVFtggJ06NHDzNs2DAzZcoUb86lszWKbUFZv359WPKvzce9utiCAmwbawCAis9tf9Qih7tgynMdbJUqcEyfPt2MGTPG3HDDDeacc87JOeyww3baZZddjqlatepN8Xh8bCKRmKJ7UjVJcPeuhkIhTRi0qOFvA/UnI39GsgIAAP4+mdbysq79fqV1YXjnamTsFnW3negcjQxzNZSegrJC3tOixs/iW/GReMM4RY2HjbMt90pxoXHma/QWe9esWXOnbt261T/99NOrXHDBBVFhXP/617/MCy+8kOrU8ORc7iDRzQUOybPC/hkbFDiAbWcNAFDxucfBumeo6+O1a9eGi4qKIvp88eLFZtq0aebDDz80L730UmzYsGEN+/Tp061hw4YXJJPJ+xOJxFuSPMyUxX61O5grHA67SYi719U7l6OsSY4tgQIAAMHzRxU4bDM13Lka7s2UrQodeuNF8xKdp+FKz9XYIFaJheIn8aXEvyfGmi1FjSvE2eIY42zP7SLaih1E3bZt2xZefPHF2U899VTkjTfeMF7vvvuu+f7771PFigy5V7E5G/4ZG/45G5nyNgocQGbWAAAVn3ehdAscsiDrHYWIt/ihHR5Lly4Njxs3rtqZZ57ZrkmTJkeEQqF/Cj0y9nOhszg0adBODjc5cRMQChwAAFQOf1SBozT+wscG3+ub/2zt4tDOUr35Il/XiKVirpghvhRvy3tut8bNYqA4SRwsr3eW93eSx41EDaED12N5eXnhPn36hEaMGGFmz56dypG8dL6G0vzJlocB+ONYAwBUProY65GxK1euDPveS91peO+993LPPvvsRjVr1tQ7GacYZz/q62JWIpEoys7O3pg+NnaTKd4+ujFDIlLWBMkWCwAAys6/vmZab21Fhj9TiX/3dMGiNFrI0JsrOh9suVgo5opZQo93/Uy8K/QklP+Je41zxOslBQUFJzVt2vSgdu3addp1111b77HHHvU7dOiQL8/jO++8s2nbtq2Rx+Yf//iH+ec//6k5kTdP2mrGhm5BSc/YKDZnQ4sgbqeGPw+jQwPYdtYAAJWPp8AR8ry+uZXy3XffjZ166qkF2dnZTSUZ6G6cOx2PRSKRz3Jychbk5eUVaTuo2ZIcue2kWtjIeDRbCcqc7AAAgHLxr6+Z1ltbEcLGNj/DexPEa6suDJd3poZuNdF8w2eDWCXvLZK4X40zKFS7THX7yaviaeN0avxHXCcuNs4Rr9qVekC7du326NevX8vLL7+8wRVXXFH1qquuSorQ0KFDzeDBg82ll15qLrvsstRcsueff97MmjXLn0eF/YqKiooVOPTkOmZsAH8OawCAyidd4DArV670vr65wDF+/PjQiSeeGMvJycmXhKCNOFLcIAnFi7m5ud9UqVJlgTxem05GNpgtBQ7ln8lR1uTLFgsAAMruzyxw2IaC+udorPW95r0xUmz91wKHW9xIJpPe2Rrr0zM1FuvpbmKq5CKfyK8ZL0aL+42z/WSoceZqHCcOFl3FLqJ51apVGxx99NHVH3jggSofffRRloh+/PHHRn3wwQfm7bffTs3WmDhxopk0aZL56aef/LlSRlrI8CutiEGBA9h21gAAlU96Bkdqkrc+Ty+yYaWFj5dfftmcffbZpkmTJhFJNOoI3apylrhXko7XJKn4Ts+N9yQmXutN8YSltATJlpwBAIDgKa1Y4n+/tOKIf66G+1y5N030aNdFYo74QXwl3hcvCZ0RdrfkKVeL88UJ8Xi8dzKZ3DsSibST581ELZEr4u3btw9fffXV5tNPPy0xN9KtJbY8CsDfxxoAoOLLNGRU2yeVPteODh06umrVqvCSJUtSdzBuvPFG07dvX9OhQ4fcJk2atMjKyjpIkohLxHAxQfwoycIKSSA2po+NLSnxyZS0AACA7Y+t8LGZOy9DTznx8s/T0KHlYq1YJZbJr9Vj6eeL2WKGcY51/VS8LV40TreG5iLarXFZMpk8u3HjxkfvvvvuB3Tq1Gmvrl27tv7HP/7RsHPnztX23HPPHBHq2LGjkffM6aefbkaPHm0WLFjgz5W8x7tGPVJzNtauXRvyH/XKNhTg72ENAFDx+QscShdl5RY4dOHWmRzaivndd9+lujjuu+8+HbAV7dOnT7UGDRrsLInEocbZy/qQeD8Wi/2clZW1SltItcjhSWw0CXLbVv2tqf49uLZkCgAAFOfvgihNprkYmbaTlKZM8zNcWshwt5l4j291j3B1Z2vI13XpbSeL0ttOphmnQ+Mj8aZ4wTgFjQeNc6zr1cbJQ04VR4ie9erV63zooYe2u/zyy5vddNNN9YYNG1b1lltuybn55puj1113nbn22mtT8zTkPTNy5Ejz+eefl3TyiVvkcAsd7uOQ5EshnbPh3hxS3iGiFDiAv441AEDFl6nA4d0j6hY4lD5etmyZ+eWXX1Lnu+v0cEkMYp07d64uiYQWOQ4Rl4qRkpx8nJOTMzs7O3tNhgKHmwgVmeJn2HsTJQocAACUn62o8UcXOEq7SVHeAsd6sVpyiGXydb68pie0fSsmitfl1z8nHhV3in8ZJ+c4UxwjtJu0q3FmajQT9Tt27Fj9uuuuy3/nnXdyvv766+SUKVOiIiSPU3M0dDvKF198YfT5jBkzzOLFi615U1lzqdKKGBQ4gD+HNQAA3H2nyv+ezuQYN26cOfXUU2MNGzasIcnILpFIRO+aXCNGy+OPtJMjFAotSyc//mRno++1jRleAwAA25dMRRe38KH5gN7YWGOco1xXmC1bT34xztaTKWbL1hPt1BhpnONcbwqHw0MktzgrmUwel52d3Ts/P39v0S6RSDQTtUWeiNavX9+cfPLJZsyYMWbFihW2fCfkkXEwaGnDQv2/HwUM4O9hDQAA70wOz+ubk4BvvvnG3HXXXebYY49NdOnSpU6zZs1216RDkpCrxAjjzOSYKgnJPElIVuoRbtrR4e61NaUnSP4kyXYnCgCAiqy0zg3belou7owMXbO9vDMz/O953tfZGevkuXZxrhRLxUL5PX8zzkDQWcYZCvqdcbadaDHjXaFdGmONMyD0v+IO43RqDDLO6Sf96tate0iHDh3+0aNHjw49e/Zs3bt374ai+v7775/TvXv3sHw1BxxwgDn66KPNf/7zH/PVV1+VlONknK2xcePGyOrVq8Npm+druAPYvXM2tLOVAgcQHNYAANAChzuTw/deqsCxaNEi8/7775tHH31U97Jm9enTp47810GSkMPFQHGPeCEej3+mW1bECrcVVVtUSyl0eO/4ZGqFXVvC6wAAVGSZtpOUVASxFjIyKcucjEzvpd/fqNtMxBJ5Pj89P+MHMSUWi30uv/9E8ZZ4WTwv/iceFncZZzjoP8UAcbpxjnM9THQXneX32K1Lly4tL7744kb33HNP7Xvvvbfq8OHDc0RMb7bcfvvt5s477zR33323eeSRR8w777yTaWioP5cJ++lMDR0emmYyYYgoEDzWAADwzuRwn3sXbF3kFy5caGbOnKnnw4evueaaZIcOHWpLItJW9DDOEbK3SFLzdG5u7kTxoyQ9S+X5evdOTwkJlr+4sS37gQEAqEhKm5lRWreHtajhpTcedI3WYZ8WG7UzU6wTa8RysVC3p4rvxRdionhLvBiNRp+W3///xH3iFuN0ZwwVF4j+4mhxoHFmabQXrcUOop6o2aBBg6qnn3567rPPPpv1ww8/JER0xowZYZ2fobPBpkyZYqZOnWqmT59ufvrpp1RxY1uOdrXN1GDGBhBM1gAAlY9twdZEQU9TUZ5J46lujqVLl5pnnnnGnHjiibH69etXzc3N3TEej+8nSclp4gbj7KHVuzbfGGefre651f233sRtQ6ZkCwAA/CG8Wz7Xm5JvKLiDwN05Ge4xrQvEPPGrcY5rnWmcuRm63eRrs2V2hnZoPCMeE/cb56STVEEjkUicn5eX17+goOB4cZjYX3QS7apXr96sVq1atQsLC/PleZaICqO6d++e6tKYNm1aSXmMu4W2WEeG5Cup007STEnKsuWEogUQXNYAAJVPWQocOqxr+fLl7lwON5FIxeg08jvuuMOccMIJkW7duuXvuOOOzeLx+D6S0BxvnGnnup/2SfGGmCS+1wQpGo3OF0vFKqH7dje4+3m1TRYAAGyTjWK9WCeKxOr0XIxlOhtDni8Ri8QC8ZvOzEoXL34WP4np4lvxRbp48aF4J72OvyLGiWeNMzdDTzh5QNwurhdXGOfo1nPEyeKYnJycQ9q0adO9R48enQ8//PAOYmexo6jfp0+f6kcccUTuMcccE5GvRl4r5oorrjCvvvpqash5CXnMVjM1lOQrW83VWLNmTcg7V0Mfa47jdqyWlBtR4ACCyxoAoPKxFTj07oYWNjQRyHRW/G+//WY++OAD87///U+PkI0ceuihVWrUqNHIOK2mPcVJYohx7uRoIvSCJFPvJ5PJL8QP4leh+3ZXxuPxdbqfV54DAAC7jWK9WCuKxGqxUiwTi8VvYq6srb/IGjtTZ2PI82liqpgivozFYp/J2vyxeE+8aZxOjDHGmZUxQgw3zs2KYeK6dBFDh4Ceb5wjW7WQoVtNdHZGL6GdnJ3TeUDbBg0atDjuuOMa33bbbfX+7//+r7aoJvJF9sMPPxzT2RkjR440jz32mJHXinnttdfMDz/8YMtlturi2LBhQ2qeRkkdHO5MDTo4gO2bNQAA/PwLvDuE1H1fH+tWlXnz5pn33ntP77aEd91112xJaqqJJmK3dMJzonHu6twcDocfkYTqufQe3UliajQa/UnMFUvTp68U6dyO9H5f255gAAAqCu+cC10LV4tVMWdt1JkXy8QSsUj8JuaKX8UvYpb4UUwTU4UWMCbL2vqxeE+8Jc9fF6+IcWJMJBJ5StbmUeIh4wwK1xsS2o1xuXGGh2s3xiniWNEnvabvKzqmixg7ixbGmZ3RUNQVNUSByOvSpUv2sGHDEpMmTYrNnTs3KiIiLEKzZs1KzfSaM2eOkedb0cHm2m1hy1UAVE7WAACwdXRoN4duV0nP5PCeIx/SRGTUqFF6hEVS89IAAAzmSURBVKxp1KhRqE6dOklRXTQXe4mD8vLyTpaEZ7C40Th7dB83zhFxelTc+2Kycfb0ThXTjHOs3I8ZzPDI9D4AAEEyw2Reu/yPdd3TbSK6pVPXQp1jpeuiHq+q20a040K3fH5inBNKdO3UI1d1DoZ2YIw3TheGrq065FO3kuhcDC1g6Lqrp5folhLtyNB5WddEIpHLZX2+uGbNmufJWn2a6CcOFwfWrl27m+gkj9uLNqKZqC9qiIK6devmNm7cOCli8jwidP03qnnz5uaMM84w48aNK22bidlUwiwNl+QfYc8pJyWedsJJJ0DlYg0AgLIWOJS2fm7akoCkBo9OnDjR3HrrraZ///46lyM1m+PEE0/MF/V79erVumnTpp0kmTrIOHeC9MQVLXZcK/4t7k4nYDpxXe8mjRZPpRM0v6c8Mr0PAECQPGUyr13+x0rXPy1M6FqoxQnd4jlCPGKcI1b/a5zZF3o6ia6ddxqnaHGL2VK40LVVt5PoPCztoNQtJbru6iDwk40zK+sYcXiVKlUOad++fc/DDz+820knnbS32FPsIlodf/zxzUQDWc9ry/OqIlckRFgYddppp6W4z11nnXWWGT58eOq0E0v+4eYTkU3FZ2qknkv+oTM1Ms3V2DxTQ2mOUpZtJ5a/C4DthDUAAGwFDncmh94pyRQze/ZsPT7WPPfcc6kTVtSzzz4blq9Z1157bWH37t3rxmKxZsZpad1LdBMHiyNFP3FqOgE71zjHyF0oLhID0l8v8jwfkOF1AACCaIDJvHb5H+u6p+vfecZZC882zrp4RpoWKHSt1G0juv1T1063WKFr6eHGmYeha6vOwupunC0lXcSeYnexq3HWYT2WtUUz+e/UU09t8uCDDzaUNbueqC2qi4LRo0fn/e9//8t++umnE/I8KkLCuHS9f/7551O8ryvt3Jg8eXJqq4kt//AJ+elNFc1BSuMec0+BA6gcrAEAYGNLEHTrysKFC1PJzOLFi1OWLFmiX0Mvv/xy+Nxzz401atQoKQlVnnHmdOheXd232zKdbOnMjg7pJEy7PTqnkzL3axfP884ZXgcAIIg6m8xrl/+x0vVPZ1zoWriHcdbF3dN07oWulVqkaGuctXMn4xQrdC1tLvRGgjsTo56oY5y5GFVNejaGyBFZkUgkccABB8Tvvvvu2NSpU2OyZkfTIiI8b9681LwMXdt1PS8PndGlW1MyDSkHgN/LGgAAfmXp6NBuDm0T1bsruk92U/G9syE3fvr06eauu+4yBx10kNlhhx1cYZFo1qxZTqtWrfSY2aryvLqoIWqJ2mnexwAAVGS65tXcwVkLla6L1dKqphWK/LQqIlfkiGyRJRIiJiJNmzYNtWzZ0rRo0cK7/qbsuuuuZsCAAWb8+PEZj0wtgX9eRsRGcoWI5Aphj5CHyUQ7Rt25GplyENtNFwAVmzUAAPzKU+BIDx3NWNxQOrfjzTffNDfffLM599xzizn//PNTCdYFF1ygz0NCuz0iaVHP16jneSTD6wAABFHk3Mxrl/+xVzgt5LHVGmpz3nnnpdbYCy+8cKv3Bg8enBoQrjchbDlBBiUNB92qwLFu3TrvDI1weoZGqKioaHOBwztPw52pQYEDQEmsAQDgZytwaNLh7n31xIT8sUpjf/75Z/PRRx+lzrb30jtHb7zxhnn99de3eg8AAGy70tbYCRMmmG+//dYsW7bMmhOUw1YzNCRHSM3RSEsVLvwzNNzXve+XZaYGBQ6gcrIGAMCfSRMQTVgy3aUBAAB/D+3ELMf2FAAIBGsAANjYOjq8W1Y8yZO2n5a2T9e7pcXL+vcBAKCC2qoLogz8W0VsMzKiHqk5Gaud41g3byfxzsxYnT6e1aPYzAx/4URf05yAo1sB/BmsAQBgU54Ch0dpBQ5/ccP6dwAAACnlKXZYCxw6J0PWa9fm4kZRUZF/KGipw0G9KHAA+LNYAwDAxlbgcLln0XvZfm8AAPCX2mpORqb1+/cqS95Qhr8rABRjDQAAAAAAAAg6awAA/B7eOzH+uzFuV0eG+RzFZnUAAIBtYh0mWhI9jpVtJAC2N9YAAPg9ylLg0FNUtMihyZRFCAAAWNfL3405GQC2R9YAAPg9bAUOAAAQbKWt7bY8AAD+StYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAAAAAABJ01AAAAAAAAIOisAQAAAAAAAEFnDQAAAAAAAAg6awAAAAAAAEDQWQMAAAAAAACCzhoAAAAAAAAQdNYAAAAAAACAoLMGAAAA4P/blUMCAAAAhkH9Wz/C7QQCBwBQdwMAAABA3Q0AAAAAdTcAAAAA1N0AAAAAUHcDAAAAQN0NAAAAAHU3AAAAANTdAAAAAFB3AwAAAEDdDQAAAAB1NwAAAADU3QAAAABQdwMAAABA3Q0AAAAAdTcAAAAA1N0AAAAAUHcDAAAAQN0NAAAAAHU3AAAAANTdAAAAAFB3AwAAAEDdDQAAAAB1NwAAAADU3QAAAABQdwMAAABA3Q0AAAAAdTcAAAAA1A1qkOmTVsIqRAAAAABJRU5ErkJggg=="
};

// src/core/ui.js
var React3 = __toESM(require("react"), 1);

// src/features/bubble/attachments.js
var pendingAttachIds = [];
var cachedEditMsg = {};
var latestInputImageIds = [];
var cachedRebuiltFiles = {};
var stagedSessionFiles = /* @__PURE__ */ new Map();
function setBoundedObjectKey(obj, key, val, maxKeys) {
  if (!obj || !key) return;
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    delete obj[key];
  }
  const keys = Object.keys(obj);
  while (keys.length >= maxKeys) {
    const oldest = keys.shift();
    if (oldest !== void 0) delete obj[oldest];
  }
  obj[key] = val;
}
function setBoundedMapEntry(map, key, val, maxEntries) {
  if (!map || !key) return;
  if (map.has(key)) map.delete(key);
  while (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === void 0) break;
    map.delete(oldestKey);
  }
  map.set(key, val);
}
function setCachedEditMsg(key, val) {
  setBoundedObjectKey(cachedEditMsg, key, val, 150);
}
var currentDraggedAttachment = null;
function setDraggedAttachment(item) {
  currentDraggedAttachment = item;
  if (typeof window !== "undefined") {
    window.__dshEasyRewrite_draggedFile = item && item.file ? item.file : null;
    window.__dshEasyRewrite_draggedItem = item;
  }
}
function getDraggedAttachment() {
  if (currentDraggedAttachment) return currentDraggedAttachment;
  if (typeof window !== "undefined" && window.__dshEasyRewrite_draggedItem) {
    return window.__dshEasyRewrite_draggedItem;
  }
  return null;
}
function clearDraggedAttachment() {
  currentDraggedAttachment = null;
  if (typeof window !== "undefined") {
    delete window.__dshEasyRewrite_draggedFile;
    delete window.__dshEasyRewrite_draggedItem;
  }
}
function handleAttachmentDragStart(e, item, sessionId, props) {
  if (!e) return;
  var file = item && item.file;
  var dragInfo = {
    id: item.id || item.attachment && item.attachment.attachmentId,
    name: item.name || file && file.name || "file",
    file: file instanceof File ? file : null,
    isFile: !!item.isFile,
    sessionId,
    attachment: item.attachment || null
  };
  setDraggedAttachment(dragInfo);
  if (e.dataTransfer) {
    try {
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-dsh-easyrewrite-file", JSON.stringify({
        id: dragInfo.id,
        name: dragInfo.name,
        isFile: dragInfo.isFile
      }));
      e.dataTransfer.setData("text/plain", dragInfo.name);
      if (file instanceof File && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try {
          var u = URL.createObjectURL(file);
          e.dataTransfer.setData("text/uri-list", u);
          var mime = file.type || (dragInfo.isFile ? "application/octet-stream" : "image/png");
          e.dataTransfer.setData("DownloadURL", mime + ":" + dragInfo.name + ":" + u);
          setTimeout(function() {
            try {
              URL.revokeObjectURL(u);
            } catch (eU) {
            }
          }, 6e4);
        } catch (eBlob) {
        }
      }
    } catch (eDt) {
    }
  }
}
function handleAttachmentDragEnd(e) {
  clearDraggedAttachment();
}
async function rebuildDraftAttachments(attachmentRefs, props, sessionId, recordPending) {
  var added = 0;
  if (!attachmentRefs || !Array.isArray(attachmentRefs) || attachmentRefs.length === 0) return added;
  try {
    var files = [];
    for (var i = 0; i < attachmentRefs.length; i++) {
      var ref = attachmentRefs[i];
      if (!ref || typeof ref.attachmentId !== "string") {
        log("warn", "attach", "\u9644\u4EF6\u5F15\u7528\u7F3A attachmentId", { i });
        continue;
      }
      try {
        var fileObj = await resolveAttachmentFile(sessionId, ref, props);
        if (fileObj && fileObj instanceof File) {
          files.push(fileObj);
          log("info", "attach", "\u5DF2\u6784\u9020 File \u5E76\u5199\u7F13\u5B58", { name: fileObj.name, type: fileObj.type, size: fileObj.size });
        } else {
          log("warn", "attach", "resolveAttachmentFile \u8FD4\u56DE\u7A7A", { attachmentId: ref.attachmentId, name: ref.name });
        }
      } catch (e) {
        log("warn", "attach", "\u91CD\u5EFA\u5355\u4E2A\u9644\u4EF6\u5931\u8D25", { attachmentId: ref.attachmentId, err: String(e && e.message ? e.message : e) });
      }
    }
    if (files.length > 0) {
      if (sessionId) setBoundedObjectKey(cachedRebuiltFiles, sessionId, files.slice(), 8);
      var ia = props && props.inputActions;
      if (ia && typeof ia.addFiles === "function") {
        try {
          ia.addFiles(files);
          log("info", "attach", "\u901A\u8FC7 inputActions.addFiles \u539F\u751F\u91CD\u5EFA\u9644\u4EF6\u6210\u529F", { count: files.length });
          return files.length;
        } catch (eAf) {
          log("warn", "attach", "inputActions.addFiles \u629B\u9519\uFF0C\u964D\u7EA7\u81F3\u56FE\u7247\u8349\u7A3F\u63A5\u53E3", { err: String(eAf && eAf.message ? eAf.message : eAf) });
        }
      }
      try {
        var images = createDraftImagesCompat(files, sessionId);
        if (images && images.length > 0) {
          var ids = images.map(function(img) {
            return img.id;
          });
          var addOk = addInputImagesCompat(props.inputActions, ids);
          if (recordPending) {
            for (var pi = 0; pi < ids.length; pi++) pendingAttachIds.push(ids[pi]);
          }
          log("info", "attach", "createDraftImages+addImages \u6210\u529F", { count: images.length, addOk });
          added = images.length;
        } else {
          log("warn", "attach", "createDraftImages \u8FD4\u56DE\u7A7A\u6570\u7EC4", { filesLen: files.length });
        }
      } catch (e2) {
        log("error", "attach", "createDraftImages \u629B\u9519\uFF08MIME \u6821\u9A8C\u7B49\uFF09", { filesLen: files.length, err: String(e2 && e2.message ? e2.message : e2), types: files.map(function(f) {
          return f.type;
        }) });
      }
    } else {
      log("warn", "attach", "\u65E0\u53EF\u91CD\u5EFA\u6587\u4EF6\uFF08\u7F13\u5B58\u672A\u547D\u4E2D+resolveImage/fetch \u5747\u5931\u8D25\uFF09", { refsLen: attachmentRefs.length });
    }
  } catch (e) {
    log("error", "attach", "rebuildDraftAttachments \u5916\u5C42\u5F02\u5E38", { err: String(e && e.message ? e.message : e) });
  }
  return added;
}
function clearPendingAttachIds() {
  pendingAttachIds.length = 0;
}
function setLatestInputImageIds(ids) {
  latestInputImageIds.length = 0;
  if (Array.isArray(ids)) {
    for (let i = 0; i < ids.length; i++) latestInputImageIds.push(ids[i]);
  }
}
function collectOutgoingFiles(sessionId, inputState) {
  var collected = [];
  try {
    var ids = getInputImageIdsCompat(inputState);
    var conv = serviceRefs.conversation;
    if (ids.length > 0 && conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function") {
      for (var i = 0; i < ids.length; i++) {
        var item = conv.draftAttachments.get(ids[i]);
        if (item && item.file instanceof File) {
          collected.push(item.file);
        }
      }
    }
  } catch (e) {
    log("warn", "attach", "\u4ECE\u8F93\u5165\u6846\u8349\u7A3F\u6536\u96C6 File \u5931\u8D25", { err: String(e && e.message ? e.message : e) });
  }
  if (collected.length === 0 && sessionId && cachedRebuiltFiles[sessionId] && cachedRebuiltFiles[sessionId].length > 0) {
    collected = cachedRebuiltFiles[sessionId].slice();
  }
  return collected;
}
function stageOutgoingFiles(targetSessionId, files) {
  if (!targetSessionId || !Array.isArray(files) || files.length === 0) return;
  setBoundedMapEntry(stagedSessionFiles, targetSessionId, files.slice(), 12);
  log("info", "attach", "\u5DF2\u4E3A\u65B0\u4F1A\u8BDD\u6682\u5B58\u53D1\u9001\u6587\u4EF6", { targetSessionId, count: files.length });
}
function consumeStagedFiles(targetSessionId) {
  if (!targetSessionId) return [];
  var files = stagedSessionFiles.get(targetSessionId) || [];
  stagedSessionFiles.delete(targetSessionId);
  return files;
}
var stagedBottomDraftFiles = /* @__PURE__ */ new Map();
function stageBottomDraftFiles(targetSessionId, files) {
  if (!targetSessionId || !Array.isArray(files) || files.length === 0) return;
  setBoundedMapEntry(stagedBottomDraftFiles, targetSessionId, files.slice(), 12);
  log("info", "attach", "\u5DF2\u4E3A\u65B0\u4F1A\u8BDD\u6682\u5B58\u5E95\u90E8\u8349\u7A3F\u6587\u4EF6", { targetSessionId, count: files.length });
}
function consumeBottomDraftFiles(targetSessionId) {
  if (!targetSessionId) return [];
  var files = stagedBottomDraftFiles.get(targetSessionId) || [];
  stagedBottomDraftFiles.delete(targetSessionId);
  return files;
}
var stagedRecallOriginalFiles = /* @__PURE__ */ new Map();
function stageRecallOriginalFiles(sessionId, files) {
  if (!sessionId) return;
  if (Array.isArray(files) && files.length > 0) {
    setBoundedMapEntry(stagedRecallOriginalFiles, sessionId, files.slice(), 12);
    log("info", "attach", "\u5DF2\u6682\u5B58\u64A4\u56DE\u524D\u8F93\u5165\u6846\u539F\u751F\u8349\u7A3F\u6587\u4EF6", { sessionId, count: files.length });
  } else {
    stagedRecallOriginalFiles.delete(sessionId);
  }
}
function getRecallOriginalFiles(sessionId) {
  if (!sessionId) return [];
  return stagedRecallOriginalFiles.get(sessionId) || [];
}
function clearRecallOriginalFiles(sessionId) {
  if (!sessionId) return;
  stagedRecallOriginalFiles.delete(sessionId);
}
function restoreDraftFilesCompat(inputActions, files, sessionId) {
  if (!inputActions || !Array.isArray(files) || files.length === 0) return false;
  if (typeof inputActions.addFiles === "function") {
    try {
      inputActions.addFiles(files);
      log("info", "attach", "\u901A\u8FC7 inputActions.addFiles \u6062\u590D\u8349\u7A3F\u6587\u4EF6\u6210\u529F", { count: files.length });
      return true;
    } catch (eAf) {
      log("warn", "attach", "inputActions.addFiles \u629B\u9519\uFF0C\u964D\u7EA7\u81F3 createDraftImagesCompat", { err: String(eAf && eAf.message ? eAf.message : eAf) });
    }
  }
  try {
    var drafts = createDraftImagesCompat(files, sessionId);
    if (drafts && drafts.length > 0) {
      var ids = drafts.map(function(d) {
        return d.id;
      });
      var ok = addInputImagesCompat(inputActions, ids);
      log("info", "attach", "\u901A\u8FC7 createDraftImagesCompat \u6062\u590D\u8349\u7A3F\u6587\u4EF6\u6210\u529F", { count: ids.length, ok });
      return ok;
    }
  } catch (eDrafts) {
    log("warn", "attach", "createDraftImagesCompat \u6062\u590D\u6587\u4EF6\u8349\u7A3F\u5F02\u5E38", { err: String(eDrafts && eDrafts.message ? eDrafts.message : eDrafts) });
  }
  return false;
}
async function extractBottomDraftFiles(sessionId, bottomIds, props, fallbackFiles) {
  var collected = [];
  var seenKeys = /* @__PURE__ */ new Set();
  try {
    var conv = serviceRefs.conversation;
    if (conv && conv.draftAttachments && typeof conv.draftAttachments.get === "function" && Array.isArray(bottomIds)) {
      for (var i = 0; i < bottomIds.length; i++) {
        var id = bottomIds[i];
        if (!id) continue;
        var item = conv.draftAttachments.get(id);
        if (item && item.file instanceof File) {
          var k1 = item.file.name + "::" + item.file.size;
          if (!seenKeys.has(k1)) {
            collected.push(item.file);
            seenKeys.add(k1);
          }
        } else if (item && item.attachment) {
          try {
            var resF = await resolveAttachmentFile(sessionId, item, props);
            if (resF instanceof File) {
              var k2 = resF.name + "::" + resF.size;
              if (!seenKeys.has(k2)) {
                collected.push(resF);
                seenKeys.add(k2);
              }
            }
          } catch (eRes) {
          }
        }
      }
    }
  } catch (eConv) {
    log("warn", "attach", "\u4ECE draftAttachments \u63D0\u53D6\u5E95\u90E8\u6587\u4EF6\u5F02\u5E38", { err: String(eConv && eConv.message ? eConv.message : eConv) });
  }
  if (Array.isArray(fallbackFiles)) {
    for (var j = 0; j < fallbackFiles.length; j++) {
      var ff = fallbackFiles[j];
      if (ff instanceof File) {
        var k3 = ff.name + "::" + ff.size;
        if (!seenKeys.has(k3)) {
          collected.push(ff);
          seenKeys.add(k3);
        }
      }
    }
  }
  return collected;
}

// src/core/ui.js
function extractText(content) {
  var parts = [];
  if (Array.isArray(content)) {
    for (var i = 0; i < content.length; i++) {
      var b = content[i];
      if (b && b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
  }
  return parts.join("\n");
}
function contentParts(content) {
  var texts = [];
  var images = [];
  var files = [];
  var attachments = [];
  var rest = [];
  if (Array.isArray(content)) {
    for (var i = 0; i < content.length; i++) {
      var b = content[i];
      if (!b) continue;
      if (b.type === "text" && typeof b.text === "string") {
        texts.push(b.text);
      } else if (b.type === "image" && b.attachment !== void 0) {
        var imgItem = { type: "image", image: { attachment: b.attachment }, attachment: b.attachment };
        images.push({ attachment: b.attachment });
        attachments.push(imgItem);
      } else if (b.type === "file" && b.attachment !== void 0) {
        var fileItem = { type: "file", file: b.attachment, attachment: b.attachment };
        files.push(b.attachment);
        attachments.push(fileItem);
      } else {
        rest.push(b);
      }
    }
  }
  return { text: texts.join(""), images, files, attachments, rest };
}
function FallbackImageItem(itemProps) {
  var att = itemProps.attachment;
  var loadImage = itemProps.loadImage;
  var onOpenLightbox = itemProps.onOpenLightbox;
  var st = React3.useState(null);
  var url = st[0];
  var setUrl = st[1];
  var errSt = React3.useState(false);
  var failed = errSt[0];
  var setFailed = errSt[1];
  React3.useEffect(function() {
    var alive = true;
    if (typeof loadImage === "function" && att) {
      loadImage(att).then(function(u) {
        if (alive && u) setUrl(u);
      }).catch(function() {
        if (alive) setFailed(true);
      });
    }
    return function() {
      alive = false;
    };
  }, [att, loadImage]);
  if (failed) {
    return React3.createElement("div", {
      style: {
        width: "64px",
        height: "64px",
        borderRadius: "8px",
        background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        color: "var(--dsw-alias-label-tertiary)"
      }
    }, "\u56FE\u7247\u5931\u6548");
  }
  var previewSize = itemProps.previewSize || "standard";
  var isSmall = previewSize === "small";
  if (!url) {
    return React3.createElement("div", {
      style: {
        width: "64px",
        height: "64px",
        borderRadius: "8px",
        background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))"
      }
    });
  }
  return React3.createElement("img", {
    src: url,
    onClick: function(e) {
      e.stopPropagation();
      if (typeof onOpenLightbox === "function") onOpenLightbox(url);
    },
    style: {
      width: isSmall ? "64px" : "auto",
      height: isSmall ? "64px" : "auto",
      maxWidth: isSmall ? "64px" : "240px",
      maxHeight: isSmall ? "64px" : "240px",
      borderRadius: isSmall ? "8px" : "var(--dsw-radius-xl, 16px)",
      objectFit: "cover",
      cursor: "zoom-in",
      display: "block",
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))"
    }
  });
}
function FallbackImageGallery(galleryProps) {
  var images = galleryProps.images;
  var loadImage = galleryProps.loadImage;
  var previewSize = galleryProps.previewSize || "standard";
  var lbSt = React3.useState(null);
  var lightboxUrl = lbSt[0];
  var setLightboxUrl = lbSt[1];
  if (!images || images.length === 0) return null;
  return React3.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        justifyContent: "flex-end",
        marginBottom: "4px"
      }
    },
    images.map(function(item, idx) {
      var att = item.attachment || item;
      return React3.createElement(FallbackImageItem, {
        key: att.attachmentId || idx,
        attachment: att,
        loadImage,
        previewSize,
        onOpenLightbox: function(u) {
          setLightboxUrl(u);
        }
      });
    }),
    lightboxUrl ? React3.createElement("div", {
      onClick: function() {
        setLightboxUrl(null);
      },
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out"
      }
    }, React3.createElement("img", {
      src: lightboxUrl,
      style: {
        maxWidth: "90vw",
        maxHeight: "90vh",
        objectFit: "contain",
        borderRadius: "6px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
      }
    })) : null
  );
}
function renderMessageImagesCompat(images, props, previewSize) {
  if (!images || images.length === 0) return null;
  var mode = previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");
  var isLarge = mode === "large";
  if (isLarge && images.length > 1) {
    var renderedItems = [];
    for (var i = 0; i < images.length; i++) {
      var singleEl = renderMessageImagesCompat([images[i]], props, "large");
      if (singleEl) {
        renderedItems.push(React3.createElement("div", {
          key: images[i] && images[i].attachment && images[i].attachment.attachmentId || i,
          style: { display: "inline-flex", flex: "none" }
        }, singleEl));
      }
    }
    if (renderedItems.length > 0) {
      return React3.createElement("div", {
        className: "dsh-easyrewrite-images-expanded",
        style: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }
      }, renderedItems);
    }
  }
  if (props && typeof props.renderMessageImages === "function") {
    try {
      var opt = { images, align: "end" };
      if (!isLarge) opt.compact = true;
      var el = props.renderMessageImages(opt);
      if (el !== void 0 && el !== null) return el;
    } catch (e) {
      log("warn", "attach", "\u5B98\u65B9 renderMessageImages \u6E32\u67D3\u629B\u9519", { err: String(e && e.message ? e.message : e) });
    }
  }
  if (props && typeof props.renderFactorySlot === "function") {
    try {
      var slotOpt = {
        images,
        loadImage: props.loadImage,
        align: "end"
      };
      if (!isLarge) slotOpt.compact = true;
      var slotEl = props.renderFactorySlot("conversation.images.content", slotOpt);
      if (slotEl !== void 0 && slotEl !== null) return slotEl;
    } catch (e2) {
      log("warn", "attach", "renderFactorySlot \u56FE\u7247\u6E32\u67D3\u5F02\u5E38", { err: String(e2 && e2.message ? e2.message : e2) });
    }
  }
  if (props && typeof props.loadImage === "function") {
    return React3.createElement(FallbackImageGallery, { images, loadImage: props.loadImage, previewSize: mode });
  }
  log("warn", "attach", "\u5BBF\u4E3B\u65E0\u53EF\u7528\u56FE\u7247\u6E32\u67D3\u901A\u9053\uFF0C\u56FE\u7247\u65E0\u6CD5\u6E32\u67D3");
  return null;
}
function formatFileSize(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 B";
  var units = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) i = units.length - 1;
  var val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return val + " " + units[i];
}
function fileExtension(name) {
  if (typeof name !== "string") return "";
  var idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1) : "";
}
function renderFileTypeIcon(name, size) {
  var s = size || 28;
  var ext = fileExtension(name).toUpperCase().slice(0, 4) || "FILE";
  var fontSz = ext.length > 3 ? s >= 36 ? "8px" : "6px" : s >= 36 ? "10px" : "7.5px";
  var textY = s >= 36 ? "21" : "19";
  return React3.createElement(
    "svg",
    {
      width: s,
      height: s,
      viewBox: "0 0 28 28",
      fill: "none",
      style: { flex: "none", display: "block" }
    },
    React3.createElement("path", {
      d: "M6 3.5C6 2.67157 6.67157 2 7.5 2H17L22 7V24.5C22 25.3284 21.3284 26 20.5 26H7.5C6.67157 26 6 25.3284 6 24.5V3.5Z",
      fill: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
      stroke: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
      strokeWidth: "1.2"
    }),
    React3.createElement("path", {
      d: "M17 2V7H22",
      fill: "none",
      stroke: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
      strokeWidth: "1.2",
      strokeLinejoin: "round"
    }),
    React3.createElement("text", {
      x: "14",
      y: textY,
      textAnchor: "middle",
      fontSize: fontSz,
      fontWeight: "700",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fill: "var(--dsw-alias-label-secondary)",
      letterSpacing: "0.2px"
    }, ext)
  );
}
function FileCardView(props) {
  var file = props.file || {};
  var name = file.name || "file";
  var bytes = typeof file.bytes === "number" ? file.bytes : file.size || 0;
  var ext = fileExtension(name).toUpperCase().slice(0, 8);
  var meta = [ext, formatFileSize(bytes)].filter(Boolean).join(" ");
  var onRemove = props.onRemove;
  var fileObjRef = React3.useRef(file.file instanceof File ? file.file : null);
  var previewSize = props.previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");
  var isSmall = previewSize !== "large";
  React3.useEffect(function() {
    if (fileObjRef.current) return;
    var alive = true;
    resolveAttachmentFile(props.sessionId, { attachment: file, isFile: true, name }, props.props || props).then(function(f) {
      if (alive && f instanceof File) fileObjRef.current = f;
    }).catch(function() {
    });
    return function() {
      alive = false;
    };
  }, [file.attachmentId, props.sessionId]);
  var cardStyle = isSmall ? {
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
    borderRadius: "8px",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
    boxSizing: "border-box",
    flex: "none",
    width: "64px",
    height: "64px",
    padding: "6px 4px",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "4px",
    overflow: "hidden",
    position: "relative",
    userSelect: "none",
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    cursor: "grab"
  } : {
    border: "0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22))",
    borderRadius: "var(--dsw-radius-xl, 16px)",
    background: "var(--dsw-specific-input-major, rgba(128,128,128,0.06))",
    boxSizing: "border-box",
    flex: "0 0 240px",
    width: "240px",
    minHeight: "140px",
    padding: "16px 14px",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "10px",
    position: "relative",
    userSelect: "none",
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    cursor: "grab"
  };
  return React3.createElement(
    "span",
    {
      className: "dsh-easyrewrite-file-card",
      "data-dsh-easyrewrite-file-card": "1",
      "data-preview-size": isSmall ? "small" : "standard",
      draggable: true,
      style: cardStyle,
      title: name + (bytes > 0 ? " (" + formatFileSize(bytes) + ")" : ""),
      onDragStart: function(e) {
        var realFile = fileObjRef.current || (file.file instanceof File ? file.file : null);
        handleAttachmentDragStart(e, {
          id: file.attachmentId,
          name,
          file: realFile,
          attachment: file,
          isFile: true
        }, props.sessionId, props.props || props);
      },
      onDragEnd: function(e) {
        handleAttachmentDragEnd(e);
      }
    },
    React3.createElement(
      "span",
      {
        style: {
          flex: "none",
          width: isSmall ? "28px" : "42px",
          height: isSmall ? "28px" : "42px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none"
        }
      },
      renderFileTypeIcon(name, isSmall ? 28 : 42)
    ),
    React3.createElement(
      "span",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: isSmall ? "0" : "3px",
          width: "100%",
          minWidth: 0,
          userSelect: "none",
          pointerEvents: "none"
        }
      },
      React3.createElement("span", {
        style: {
          width: "100%",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          color: "var(--dsw-alias-label-primary)",
          fontSize: isSmall ? "11px" : "14px",
          fontWeight: 500,
          lineHeight: isSmall ? "14px" : "20px",
          overflow: "hidden",
          textAlign: "center",
          padding: isSmall ? "0 2px" : "0",
          userSelect: "none"
        }
      }, name),
      isSmall ? null : React3.createElement("span", {
        style: {
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.75))",
          fontSize: "12px",
          lineHeight: "16px",
          overflow: "hidden",
          textAlign: "center",
          userSelect: "none"
        }
      }, meta)
    ),
    onRemove ? React3.createElement("button", {
      type: "button",
      onClick: function(e) {
        e.stopPropagation();
        onRemove();
      },
      style: {
        position: "absolute",
        top: isSmall ? "2px" : "6px",
        right: isSmall ? "2px" : "6px",
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        border: "none",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontSize: "12px",
        lineHeight: "18px",
        textAlign: "center",
        cursor: "pointer",
        padding: "0"
      },
      title: "\u79FB\u9664\u6587\u4EF6"
    }, "\xD7") : null
  );
}
function renderMessageAttachmentsCompat(pc, props, previewSize) {
  if (!pc) return null;
  var images = pc.images || [];
  var files = pc.files || [];
  if (images.length === 0 && files.length === 0) return null;
  var pSize = previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");
  var rowStyle = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "8px",
    maxWidth: "100%",
    marginBottom: "6px"
  };
  return React3.createElement(
    "div",
    {
      className: "dsh-easyrewrite-attachment-row",
      "data-message-attachments": true,
      "data-preview-size": pSize,
      style: rowStyle
    },
    images.length > 0 ? renderMessageImagesCompat(images, props, pSize) : null,
    files.map(function(f, idx) {
      return React3.createElement(FileCardView, {
        key: f && f.attachmentId ? f.attachmentId : "file:" + idx,
        file: f,
        sessionId: props && props.sessionId,
        previewSize: pSize,
        props
      });
    })
  );
}
function iconImg(src, alt, size) {
  var s = size || 18;
  return React3.createElement("img", {
    src,
    alt,
    width: s,
    height: s,
    className: "dbe-icon-img",
    style: { display: "block" }
  });
}
function actionButton(title, ariaLabel, onClick, children, dataAttr) {
  var bs = 34;
  return React3.createElement("button", {
    type: "button",
    title,
    "aria-label": ariaLabel,
    "data-dsh-easyrewrite": dataAttr || void 0,
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      width: bs,
      height: bs,
      padding: 0,
      borderRadius: "8px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    },
    onMouseEnter: function(e) {
      e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))";
    },
    onMouseLeave: function(e) {
      e.currentTarget.style.background = "transparent";
    },
    onClick
  }, children);
}
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}
function formatClock(time) {
  if (typeof time !== "number" || !isFinite(time)) return "";
  var d = new Date(time);
  var n = /* @__PURE__ */ new Date();
  var clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
  if (d.getFullYear() === n.getFullYear()) return d.getMonth() + 1 + "/" + d.getDate() + " " + clock;
  return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + clock;
}
function CopyButton({ text }) {
  var L = useUILocaleDict();
  var copyState = React3.useState(false);
  var copied = copyState[0];
  var setCopied = copyState[1];
  function copy() {
    var done = function() {
      setCopied(true);
      setTimeout(function() {
        setCopied(false);
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function() {
        legacyCopy(text);
        done();
      });
    } else {
      legacyCopy(text);
      done();
    }
  }
  return React3.createElement("button", {
    type: "button",
    title: copied ? L.copied : L.copy,
    "aria-label": L.copy,
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      width: 34,
      height: 34,
      padding: 0,
      borderRadius: "8px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    },
    onMouseEnter: function(e) {
      e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))";
    },
    onMouseLeave: function(e) {
      e.currentTarget.style.background = "transparent";
    },
    onClick: function(e) {
      e.stopPropagation();
      copy();
    }
  }, copied ? React3.createElement(IconCheckOutline, { size: 14 }) : React3.createElement(IconCopyOutline, { size: 14 }));
}
function legacyCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch (e) {
  }
  document.body.removeChild(ta);
}

// src/features/bundle-config/index.js
function BundleConfigPage(props) {
  const L = useUILocaleDict();
  const [updateVer, setUpdateVer] = React4.useState(CURRENT_VERSION);
  const [dshVer, setDshVer] = React4.useState(null);
  const [updateMsg, setUpdateMsg] = React4.useState("");
  const [updateAvailableVer, setUpdateAvailableVer] = React4.useState("");
  const [updateChecking, setUpdateChecking] = React4.useState(false);
  const [updateUpdating, setUpdateUpdating] = React4.useState(false);
  const [autoCheckOn, setAutoCheckOn] = React4.useState(getBool("dsh-easyrewrite:autoCheckUpdate", false));
  function doCheckUpdate() {
    setUpdateChecking(true);
    setUpdateMsg("");
    fetch("/bubble/check-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then((r) => r.json()).then((d) => {
      setUpdateChecking(false);
      if (!d || !d.ok) {
        setUpdateMsg(L.updateFailed || "\u68C0\u67E5\u5931\u8D25");
        return;
      }
      setUpdateVer(d.current || CURRENT_VERSION);
      setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
      if (d.latest && versionGt(d.latest, d.current || "0")) {
        setUpdateAvailableVer(d.latest);
        try {
          localStorage.setItem("dsh-easyrewrite:updateAvailable", "1");
        } catch (e) {
        }
      } else {
        setUpdateAvailableVer("");
        setUpdateMsg(L.upToDate || "\u5DF2\u662F\u6700\u65B0\u7248\u672C");
        try {
          localStorage.removeItem("dsh-easyrewrite:updateAvailable");
        } catch (e) {
        }
      }
    }).catch(() => {
      setUpdateChecking(false);
      setUpdateMsg(L.updateFailed || "\u68C0\u67E5\u5931\u8D25");
    });
  }
  function doUpdatePlugin() {
    if (!updateAvailableVer) return;
    setUpdateUpdating(true);
    fetch("/bubble/update-plugin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then((r) => r.json()).then((d) => {
      setUpdateUpdating(false);
      if (d && d.ok) {
        setUpdateMsg(L.updateDone || "\u66F4\u65B0\u5B8C\u6210");
        setUpdateAvailableVer("");
        try {
          localStorage.removeItem("dsh-easyrewrite:updateAvailable");
        } catch (e) {
        }
      } else {
        setUpdateMsg(L.updateFailed || "\u66F4\u65B0\u5931\u8D25");
      }
    }).catch(() => {
      setUpdateUpdating(false);
      setUpdateMsg(L.updateFailed || "\u66F4\u65B0\u5931\u8D25");
    });
  }
  React4.useEffect(() => {
    doCheckUpdate();
  }, []);
  let statusText = "";
  if (updateChecking) {
    statusText = L.checking || "\u6B63\u5728\u68C0\u67E5\u2026";
  } else if (updateAvailableVer) {
    statusText = (L.newVersion || "\u53D1\u73B0\u65B0\u7248\u672C\uFF1Av{ver}").replace("{ver}", updateAvailableVer);
  } else if (updateMsg) {
    statusText = updateMsg;
  }
  return React4.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        margin: "4px 0 16px 0",
        width: "100%",
        boxSizing: "border-box"
      },
      "data-dsh-easyrewrite": "bundle-config"
    },
    // 第一行：当前版本：v3.0.0（已是最新版本）   [检查更新]
    React4.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "36px",
          gap: "12px"
        }
      },
      React4.createElement(
        "div",
        {
          style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", minWidth: 0 }
        },
        React4.createElement("span", {
          style: {
            fontSize: "13px",
            color: "var(--dsw-alias-label-primary)",
            lineHeight: "20px"
          }
        }, (L.currentVersion || "\u5F53\u524D\u7248\u672C") + "\uFF1Av" + updateVer),
        statusText ? React4.createElement("span", {
          style: {
            display: "inline-block",
            fontSize: "13px",
            transform: "scale(0.8)",
            transformOrigin: "left center",
            color: updateAvailableVer ? "var(--dsw-alias-brand-primary, #4d6bfe)" : "var(--dsw-alias-label-secondary)",
            lineHeight: "20px",
            opacity: 0.85,
            whiteSpace: "nowrap"
          }
        }, "\uFF08" + statusText + "\uFF09") : null
      ),
      updateAvailableVer ? React4.createElement("button", {
        type: "button",
        style: {
          appearance: "none",
          border: "none",
          background: "var(--dsw-static-deepseek-500, #4d6bfe)",
          color: "#ffffff",
          borderRadius: "6px",
          padding: "3px 10px",
          fontSize: "12px",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          flex: "none"
        },
        onClick: () => {
          doUpdatePlugin();
        }
      }, updateUpdating ? L.updating || "\u6B63\u5728\u66F4\u65B0\u2026" : L.updateNow || "\u7ACB\u5373\u66F4\u65B0") : React4.createElement("button", {
        type: "button",
        disabled: updateChecking,
        style: {
          appearance: "none",
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
          background: "transparent",
          color: "var(--dsw-alias-label-secondary)",
          borderRadius: "6px",
          padding: "3px 10px",
          fontSize: "12px",
          cursor: updateChecking ? "not-allowed" : "pointer",
          opacity: updateChecking ? 0.6 : 1,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          flex: "none"
        },
        onClick: () => {
          doCheckUpdate();
        }
      }, updateChecking ? L.checking || "\u6B63\u5728\u68C0\u67E5\u2026" : L.checkUpdate || "\u68C0\u67E5\u66F4\u65B0")
    ),
    // 第二行：每日检查更新（发现新版本时提示）   (switch)
    React4.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "36px",
          gap: "12px"
        }
      },
      React4.createElement("span", {
        style: {
          fontSize: "13px",
          color: "var(--dsw-alias-label-primary)",
          lineHeight: "20px"
        }
      }, L.autoCheckUpdate || "\u6BCF\u65E5\u68C0\u67E5\u66F4\u65B0\uFF08\u53D1\u73B0\u65B0\u7248\u672C\u65F6\u63D0\u793A\uFF09"),
      React4.createElement("div", {
        role: "checkbox",
        "aria-checked": !!autoCheckOn,
        style: {
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid " + (autoCheckOn ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
          background: autoCheckOn ? "#ffffff" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: autoCheckOn ? "#000000" : "transparent",
          fontSize: "13px",
          lineHeight: "13px",
          cursor: "pointer",
          flex: "none",
          boxSizing: "border-box",
          transition: "border-color .15s, background .15s, color .15s",
          userSelect: "none"
        },
        onClick: (e) => {
          e.stopPropagation();
          const next = !autoCheckOn;
          setAutoCheckOn(next);
          setBool("dsh-easyrewrite:autoCheckUpdate", next);
        }
      }, autoCheckOn ? React4.createElement(IconCheckOutline, null) : null)
    ),
    // DSH 兼容性低版本告警提示（仅当不兼容时兜底）
    (() => {
      if (!dshVer) return null;
      if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) {
        return React4.createElement(
          "div",
          {
            key: "dsh-low",
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              padding: "8px",
              margin: "6px 0",
              background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
              borderRadius: "8px"
            }
          },
          React4.createElement(
            "span",
            { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } },
            (L.dshLowWarning || "DeepSeek Harness \u7248\u672C\u8F83\u4F4E").replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)
          ),
          React4.createElement(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            React4.createElement("code", {
              style: {
                fontSize: "11px",
                color: "var(--dsw-alias-label-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: "1"
              }
            }, "npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION),
            React4.createElement("button", {
              type: "button",
              style: {
                appearance: "none",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                background: "transparent",
                color: "var(--dsw-alias-label-secondary)",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "inherit",
                flex: "none"
              },
              onClick: () => {
                try {
                  legacyCopy("npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION);
                } catch (e) {
                }
              }
            }, L.copyUpgradeCmd || "\u590D\u5236\u5347\u7EA7\u547D\u4EE4")
          )
        );
      }
      return null;
    })()
  );
}
function initAutoUpdateCheck() {
  const autoOn = getBool("dsh-easyrewrite:autoCheckUpdate", false);
  if (!autoOn) return;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  let last = null;
  try {
    last = localStorage.getItem("dsh-easyrewrite:lastUpdateCheck");
  } catch (e) {
  }
  if (last === today) return;
  try {
    localStorage.setItem("dsh-easyrewrite:lastUpdateCheck", today);
  } catch (e) {
  }
  fetch("/bubble/check-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    keepalive: true
  }).catch(() => {
  });
}

// src/features/bubble/index.js
var React12 = __toESM(require("react"), 1);

// src/features/bubble/width.js
function calcBtnRowMinWidth(cancelText, confirmText) {
  var t1 = String(cancelText || "\u53D6\u6D88");
  var t2 = String(confirmText || "\u786E\u5B9A");
  var textW = 0;
  for (var i = 0; i < t1.length; i++) textW += t1.charCodeAt(i) > 11903 ? 13 : 8;
  for (var j = 0; j < t2.length; j++) textW += t2.charCodeAt(j) > 11903 ? 13 : 8;
  return textW + 100;
}
function editWidthFor(mode, text, initW, minSafetyW) {
  var safety = Math.max(minSafetyW || 160, 160);
  if (mode === "extended") return "100%";
  if (mode === "custom") return Math.max(editWidthCustom(), safety);
  var linesArr = String(text || "").split("\n");
  var contentW = 0;
  for (var i = 0; i < linesArr.length; i++) {
    var s = linesArr[i];
    var w = 28;
    for (var c = 0; c < s.length; c++) w += s.charCodeAt(c) > 11903 ? 14 : 8;
    if (w > contentW) contentW = w;
  }
  contentW = Math.min(contentW, 360);
  if (mode === "compact") {
    var base = Math.max(initW || 200, safety);
    return Math.max(base, contentW);
  }
  return Math.max(Math.max(360, safety), contentW);
}
function editWidthMode() {
  var v = "standard";
  try {
    v = localStorage.getItem("dsh-easyrewrite:editWidth") || "standard";
  } catch (e) {
  }
  if (v === "bubble") return "compact";
  if (v === "wrap") return "standard";
  if (v === "composer") return "extended";
  return v;
}
function editWidthCustom() {
  try {
    var n = parseInt(localStorage.getItem("dsh-easyrewrite:editWidthCustom") || "", 10);
    return isFinite(n) && n > 100 && n <= 1200 ? n : 360;
  } catch (e) {
    return 360;
  }
}

// src/core/ui-settings.js
var React5 = __toESM(require("react"), 1);
function createSettingsStyles() {
  var cardStyle = {
    border: "1px solid var(--dsw-alias-border-l2)",
    background: "var(--dsw-alias-bg-layer-3)",
    borderRadius: "12px",
    listStyle: "none",
    transition: "border-color .16s, background .16s"
  };
  var cardOpenStyle = { background: "var(--dsw-alias-bg-layer-2)", borderColor: "var(--dsw-alias-label-dimmed)" };
  var headStyle = {
    appearance: "none",
    width: "100%",
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px"
  };
  var headTextStyle = { display: "flex", flexDirection: "column", flex: "1", minWidth: "0", gap: "4px" };
  var titleStyle = { color: "var(--dsw-alias-label-primary)", fontSize: "15px", fontWeight: 600, lineHeight: "1.4" };
  var subStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "1.5" };
  var chevronStyle = { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s", transform: "rotate(90deg)" };
  var chevronOpenStyle = { transform: "rotate(270deg)" };
  var bodyStyle = {
    borderTop: "1px solid var(--dsw-alias-border-l2)",
    margin: "0 16px",
    paddingTop: "14px",
    paddingBottom: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  };
  var sectionStyle = { display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "16px" };
  var groupTitleStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--dsw-alias-label-primary)",
    letterSpacing: "0.02em",
    lineHeight: "1.6"
  };
  var rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingLeft: "16px" };
  var labelStyle = { fontSize: "13px", color: "var(--dsw-alias-label-primary)" };
  var hintStyle = { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" };
  var groupStyle = { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "16px" };
  var inputStyle = {
    width: "90px",
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
    borderRadius: "8px",
    padding: "4px 8px",
    fontSize: "13px",
    background: "var(--dsw-alias-bg-base)",
    color: "var(--dsw-alias-label-primary)"
  };
  var disabledInputStyle = Object.assign({}, inputStyle, { opacity: 0.45, cursor: "not-allowed" });
  function switchRow(label, value, onChange, extraHint, disabled) {
    var checkSize = 20;
    var checkStyle = {
      width: checkSize,
      height: checkSize,
      borderRadius: "50%",
      border: "2px solid " + (value ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
      background: value ? "#ffffff" : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: value ? "#000000" : "transparent",
      fontSize: "13px",
      lineHeight: "13px",
      cursor: "pointer",
      flex: "none",
      margin: "0 2px",
      transition: "border-color .15s, background .15s, color .15s",
      userSelect: "none",
      boxSizing: "border-box"
    };
    return React5.createElement(
      "div",
      {
        style: Object.assign({}, rowStyle, disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
        "data-dsh-easyrewrite": "switch-row",
        title: disabled ? extraHint || "" : void 0
      },
      React5.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" } },
        React5.createElement("span", { style: labelStyle }, label),
        extraHint ? React5.createElement("span", { style: hintStyle }, extraHint) : null
      ),
      React5.createElement("div", {
        role: "checkbox",
        "aria-checked": !!value,
        "aria-disabled": disabled || void 0,
        style: Object.assign({}, checkStyle, disabled ? { cursor: "not-allowed" } : null),
        onClick: function(e) {
          e.stopPropagation();
          if (disabled) return;
          onChange(!value);
        }
      }, value ? React5.createElement(IconCheckOutline, null) : null)
    );
  }
  function segmentedGroup(options, value, onChange) {
    var n = options.length;
    var idx = 0;
    for (var i = 0; i < n; i++) {
      if (options[i][0] === value) {
        idx = i;
        break;
      }
    }
    var segStyle = {
      position: "relative",
      display: "flex",
      background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
      borderRadius: "999px",
      padding: "2px"
    };
    var thumbStyle = {
      position: "absolute",
      top: "2px",
      left: "calc(" + idx + " * (100% - 4px) / " + n + ")",
      width: "calc((100% - 4px) / " + n + ")",
      height: "calc(100% - 4px)",
      background: "var(--dsw-alias-bg-layer-3, #ffffff)",
      borderRadius: "999px",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12)",
      transition: "left .18s ease",
      zIndex: 1
    };
    return React5.createElement(
      "div",
      { style: segStyle, role: "radiogroup" },
      React5.createElement("div", { style: thumbStyle, "data-dsh-easyrewrite": "seg-thumb" }),
      options.map(function(opt) {
        var sel = value === opt[0];
        return React5.createElement("div", {
          key: opt[0],
          role: "radio",
          "aria-checked": sel,
          style: {
            position: "relative",
            zIndex: 2,
            flex: "1",
            padding: "3px 10px",
            textAlign: "center",
            fontSize: "13px",
            lineHeight: "20px",
            cursor: "pointer",
            borderRadius: "999px",
            color: sel ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
            transition: "color .15s",
            whiteSpace: "nowrap",
            userSelect: "none"
          },
          onClick: function() {
            onChange(opt[0]);
          }
        }, opt[1]);
      })
    );
  }
  return {
    cardStyle,
    cardOpenStyle,
    headStyle,
    headTextStyle,
    titleStyle,
    subStyle,
    chevronStyle,
    chevronOpenStyle,
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    rowStyle,
    labelStyle,
    hintStyle,
    groupStyle,
    inputStyle,
    disabledInputStyle,
    switchRow,
    segmentedGroup
  };
}

// src/features/bubble/view.js
var React11 = __toESM(require("react"), 1);

// src/features/recall/store.js
var React6 = __toESM(require("react"), 1);
var PENDING_PREFIX = "dsh-easyrewrite:pending:";
var pendingCache = {};
var pendingListeners = [];
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", function(e) {
    try {
      if (!e.key || e.key.indexOf(PENDING_PREFIX) !== 0) return;
      pendingCache[e.key.slice(PENDING_PREFIX.length)] = null;
      for (var li = 0; li < pendingListeners.length; li++) {
        try {
          pendingListeners[li]();
        } catch (err) {
        }
      }
    } catch (err) {
    }
  });
}
function loadPendingFromStorage(sessionId) {
  try {
    var raw = localStorage.getItem(PENDING_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function readPending(sessionId) {
  if (!(sessionId in pendingCache)) pendingCache[sessionId] = loadPendingFromStorage(sessionId);
  return pendingCache[sessionId];
}
function writePending(sessionId, p) {
  pendingCache[sessionId] = p;
  try {
    if (p === null) {
      localStorage.removeItem(PENDING_PREFIX + sessionId);
      try {
        fetch("/bubble/backup/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
          keepalive: true
        }).catch(function() {
        });
      } catch (e) {
      }
    } else {
      localStorage.setItem(PENDING_PREFIX + sessionId, JSON.stringify(p));
    }
  } catch (e) {
  }
  var ls = pendingListeners.slice();
  for (var i = 0; i < ls.length; i++) {
    try {
      ls[i]();
    } catch (e) {
    }
  }
}
function subscribePending(fn) {
  pendingListeners.push(fn);
  return function() {
    var i = pendingListeners.indexOf(fn);
    if (i !== -1) pendingListeners.splice(i, 1);
  };
}
function usePending(sessionId) {
  return React6.useSyncExternalStore(subscribePending, function() {
    return readPending(sessionId);
  });
}

// src/features/recall/safe-session.js
var ctxUiWorkspaceRef = null;
function setCtxUiWorkspaceRef(ref) {
  ctxUiWorkspaceRef = ref;
}
function safeOpenSession(targetId, props) {
  if (props && typeof props.openSession === "function") {
    try {
      var r1 = props.openSession(targetId);
      if (r1 !== false) return true;
    } catch (e1) {
      log("warn", "session", "props.openSession \u5931\u8D25\uFF0C\u5C1D\u8BD5\u964D\u7EA7\u901A\u9053", { targetId, err: String(e1 && e1.message ? e1.message : e1) });
    }
  }
  try {
    if (ctxUiWorkspaceRef && typeof ctxUiWorkspaceRef.openSession === "function") {
      ctxUiWorkspaceRef.openSession(targetId);
      return true;
    }
  } catch (e2) {
    log("warn", "session", "ctxUiWorkspaceRef.openSession \u5931\u8D25", { targetId, err: String(e2 && e2.message ? e2.message : e2) });
  }
  try {
    if (props && props.ctxSessions && typeof props.ctxSessions.open === "function") {
      props.ctxSessions.open(targetId);
      return true;
    }
  } catch (e3) {
    log("warn", "session", "ctxSessions.open \u5931\u8D25", { targetId, err: String(e3 && e3.message ? e3.message : e3) });
  }
  log("error", "session", "\u6240\u6709\u5207\u6362\u4F1A\u8BDD\u901A\u9053\u5747\u4E0D\u53EF\u7528", { targetId });
  return false;
}

// src/features/recall/image.js
var React7 = __toESM(require("react"), 1);
function PendingOriginalImage(props2) {
  var st = React7.useState(null);
  var url = st[0];
  var setUrl = st[1];
  var errState = React7.useState(false);
  var failed = errState[0];
  var setFailed = errState[1];
  React7.useEffect(function() {
    var alive = true;
    props2.loadImage(props2.ref).then(function(u) {
      if (alive && u) setUrl(u);
    }, function() {
      if (alive) setFailed(true);
    });
    return function() {
      alive = false;
    };
  }, []);
  if (failed || !url) return null;
  return React7.createElement("img", { src: url, style: { maxWidth: "100%", width: "auto", maxHeight: "280px", borderRadius: "12px", display: "block" } });
}

// src/features/bubble/model-picker.js
var React8 = __toESM(require("react"), 1);
function EditModelPicker(props) {
  var L = useUILocaleDict();
  var dir = null;
  try {
    var md = props.modelDirectories || getModelDirectories();
    if (md && typeof md.directoryFor === "function") dir = md.directoryFor(props.sessionId);
  } catch (eDir) {
    dir = null;
  }
  var hasStore = !!(dir && dir.store && typeof dir.store.subscribe === "function" && typeof dir.store.getSnapshot === "function");
  var snap = React8.useSyncExternalStore(
    hasStore ? function(cb) {
      return dir.store.subscribe(cb);
    } : function() {
      return function() {
      };
    },
    hasStore ? function() {
      return dir.store.getSnapshot();
    } : function() {
      return null;
    }
  );
  var menuState = React8.useState(false);
  var menuOpen = menuState[0];
  var setMenuOpen = menuState[1];
  var viewState = React8.useState("root");
  var view = viewState[0];
  var setView = viewState[1];
  var rootRef = React8.useRef(null);
  React8.useEffect(function() {
    if (!menuOpen || !dir || typeof dir.load !== "function") return;
    try {
      dir.load().catch(function() {
      });
    } catch (eLoad) {
    }
  }, [menuOpen]);
  React8.useEffect(function() {
    if (!menuOpen) return;
    function onDocClick(e) {
      try {
        if (rootRef.current && !rootRef.current.contains(e.target)) {
          setMenuOpen(false);
          setView("root");
        }
      } catch (eOut) {
      }
    }
    document.addEventListener("click", onDocClick, true);
    return function() {
      document.removeEventListener("click", onDocClick, true);
    };
  }, [menuOpen]);
  if (!hasStore || !snap) return null;
  var groups = Array.isArray(snap.groups) ? snap.groups : [];
  var cur = snap.current || null;
  var sel = props.selection || (cur ? { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort } : null);
  if (!sel && groups.length === 0) return null;
  var selChoice = null;
  for (var gi = 0; gi < groups.length; gi++) {
    var gGroup = groups[gi];
    var gModels = Array.isArray(gGroup.models) ? gGroup.models : [];
    for (var mi = 0; mi < gModels.length; mi++) {
      if (sel && gGroup.id === sel.provider && gModels[mi].id === sel.model) {
        selChoice = { group: gGroup, model: gModels[mi] };
        break;
      }
    }
    if (selChoice) break;
  }
  var reasoning = selChoice ? selChoice.model.reasoning : void 0;
  var effectiveEffort = sel && sel.reasoningEffort !== void 0 ? sel.reasoningEffort : reasoning && reasoning.defaultEffort !== void 0 ? reasoning.defaultEffort : void 0;
  var effortLabel;
  if (reasoning === void 0) effortLabel = void 0;
  else if (effectiveEffort === void 0) effortLabel = L.effortDefault;
  else {
    var lvFound = null;
    var eAll = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
    for (var li = 0; li < eAll.length; li++) {
      if (eAll[li].id === effectiveEffort) {
        lvFound = eAll[li];
        break;
      }
    }
    effortLabel = lvFound && lvFound.name || String(effectiveEffort);
  }
  var modelLabel = selChoice && selChoice.model.name ? selChoice.model.name : sel ? sel.model : L.modelMenu;
  function pickModel(gid, modelId) {
    props.onChange({ provider: gid, model: modelId });
    setMenuOpen(false);
    setView("root");
  }
  function pickEffort(effort) {
    var base = sel || (cur ? { provider: cur.provider, model: cur.model } : null);
    if (!base) return;
    var next = { provider: base.provider, model: base.model };
    if (effort !== void 0) next.reasoningEffort = effort;
    props.onChange(next);
    setView("root");
  }
  var hoverBg = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))";
  var chipStyle = { display: "flex", alignItems: "center", gap: "4px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "24px", outline: "none", height: "28px", padding: "0 4px 0 8px", fontSize: "13px", fontWeight: 500, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", minWidth: "0", maxWidth: "100%" };
  var menuStyle = { position: "absolute", top: "calc(100% + 8px)", left: "0", zIndex: 20, display: "flex", flexDirection: "column", width: "max-content", minWidth: "250px", maxWidth: "min(420px, calc(100vw - 32px))", maxHeight: "min(360px, calc(100vh - 96px))", overflowY: "auto", background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", border: "1px solid var(--dsw-alias-border-inverted, rgba(128,128,128,0.25))", borderRadius: "12px", boxShadow: "var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.35))", padding: "4px", color: "var(--dsw-alias-label-primary)" };
  var rowBase = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", minHeight: "38px", boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", padding: "6px 8px", borderRadius: "10px", font: "inherit", fontSize: "13px", lineHeight: "20px", color: "inherit", textAlign: "left" };
  function rowHover(e, on) {
    try {
      e.currentTarget.style.background = on ? hoverBg : "transparent";
    } catch (eH) {
    }
  }
  function menuRow(label, value, onClick, key) {
    return React8.createElement(
      "button",
      { key, type: "button", style: rowBase, onMouseEnter: function(e) {
        rowHover(e, true);
      }, onMouseLeave: function(e) {
        rowHover(e, false);
      }, onClick: function(e) {
        e.stopPropagation();
        onClick();
      } },
      React8.createElement("span", null, label),
      React8.createElement(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--dsw-alias-label-tertiary)" } },
        React8.createElement("span", null, value),
        React8.createElement("span", null, "\u203A")
      )
    );
  }
  function backRow(label) {
    return React8.createElement(
      "button",
      { key: "back", type: "button", style: Object.assign({}, rowBase, { minHeight: "32px", padding: "4px 8px" }), onMouseEnter: function(e) {
        rowHover(e, true);
      }, onMouseLeave: function(e) {
        rowHover(e, false);
      }, onClick: function(e) {
        e.stopPropagation();
        setView("root");
      } },
      React8.createElement(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--dsw-alias-label-secondary)" } },
        React8.createElement("span", { style: { fontSize: "18px", lineHeight: "18px", fontWeight: 500, flex: "none" } }, "\u2039"),
        React8.createElement("span", { style: { fontSize: "12px" } }, label)
      )
    );
  }
  var check = React8.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", flex: "none" } }, "\u2713");
  var chevron = React8.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    style: { color: "var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary))", flex: "none", transition: "transform .12s", transform: menuOpen ? "rotate(270deg)" : "rotate(90deg)" }
  }, React8.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
  var body;
  if (view === "root") {
    body = [
      menuRow(L.modelMenu, modelLabel, function() {
        setView("models");
      }, "row-model"),
      reasoning ? menuRow(L.effortMenu, effortLabel || L.effortDefault, function() {
        setView("efforts");
      }, "row-effort") : null
    ];
  } else if (view === "models") {
    var kids = [backRow(L.modelMenu)];
    for (var gi2 = 0; gi2 < groups.length; gi2++) {
      var g2 = groups[gi2];
      if (groups.length > 1 && g2.name) kids.push(React8.createElement("div", { key: "g" + gi2, style: { position: "sticky", top: "0", zIndex: 1, background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", padding: "5px 8px 3px", fontSize: "12px", fontWeight: 500, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" } }, g2.name));
      var g2m = Array.isArray(g2.models) ? g2.models : [];
      for (var mj = 0; mj < g2m.length; mj++) {
        (function(gid, model) {
          var selected = !!(sel && gid === sel.provider && model.id === sel.model);
          kids.push(React8.createElement(
            "button",
            { key: gid + ":" + model.id, type: "button", role: "menuitemradio", "aria-checked": selected, title: model.name, style: Object.assign({}, rowBase, { alignItems: "flex-start" }), onMouseEnter: function(e) {
              rowHover(e, true);
            }, onMouseLeave: function(e) {
              rowHover(e, false);
            }, onClick: function(e) {
              e.stopPropagation();
              pickModel(gid, model.id);
            } },
            React8.createElement(
              "span",
              { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" } },
              React8.createElement("span", null, model.name),
              model.description ? React8.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", lineHeight: "16px" } }, model.description) : null
            ),
            selected ? check : null
          ));
        })(g2.id, g2m[mj]);
      }
    }
    body = groups.length === 0 ? [backRow(L.modelMenu), React8.createElement("div", { key: "empty", style: { padding: "10px", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-tertiary)" } }, snap.status === "loading" ? L.modelsLoading : L.modelsEmpty)] : kids;
  } else {
    var effortChoices = [];
    if (reasoning !== void 0) {
      if (reasoning.defaultEffort === void 0) effortChoices.push({ effort: void 0, label: L.effortDefault });
      var eList = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
      for (var ei = 0; ei < eList.length; ei++) effortChoices.push({ effort: eList[ei].id, label: eList[ei].name });
    }
    var eKids = [backRow(L.effortMenu)];
    for (var ej = 0; ej < effortChoices.length; ej++) {
      (function(level) {
        var selected = level.effort === effectiveEffort;
        eKids.push(React8.createElement(
          "button",
          { key: String(level.effort), type: "button", role: "menuitemradio", "aria-checked": selected, style: Object.assign({}, rowBase), onMouseEnter: function(e) {
            rowHover(e, true);
          }, onMouseLeave: function(e) {
            rowHover(e, false);
          }, onClick: function(e) {
            e.stopPropagation();
            pickEffort(level.effort);
          } },
          React8.createElement("span", null, level.label),
          selected ? check : null
        ));
      })(effortChoices[ej]);
    }
    body = eKids;
  }
  return React8.createElement(
    "div",
    { ref: rootRef, style: { display: "inline-block", maxWidth: "60%", minWidth: "0" } },
    React8.createElement(
      "button",
      {
        type: "button",
        style: chipStyle,
        title: L.modelMenu + "\uFF1A" + modelLabel + (effortLabel ? " \xB7 " + effortLabel : ""),
        "aria-haspopup": "menu",
        "aria-expanded": !!menuOpen,
        onMouseEnter: function(e) {
          rowHover(e, true);
        },
        onMouseLeave: function(e) {
          rowHover(e, false);
        },
        onClick: function(e) {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
          setView("root");
        }
      },
      React8.createElement("span", { style: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0" } }, modelLabel),
      effortLabel ? React8.createElement("span", {
        style: {
          color: "var(--dsw-alias-brand-primary, #4d6bfe)",
          background: "rgba(77, 107, 254, 0.12)",
          border: "1px solid rgba(77, 107, 254, 0.30)",
          borderRadius: "999px",
          padding: "1px 6px",
          fontSize: "11px",
          fontWeight: 600,
          lineHeight: "16px",
          flex: "none",
          margin: "0 2px"
        }
      }, effortLabel) : null,
      chevron
    ),
    menuOpen ? React8.createElement("div", { role: "menu", style: menuStyle, onClick: function(e) {
      e.stopPropagation();
    } }, body) : null
  );
}

// src/features/bubble/image-utils.js
function fileToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    try {
      var fr = new FileReader();
      fr.onload = function() {
        resolve(String(fr.result));
      };
      fr.onerror = function() {
        reject(fr.error || new Error("file-read-failed"));
      };
      fr.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}
function dataUrlToFile(dataUrl, name) {
  var parts = String(dataUrl).split(",");
  var mimeMatch = parts[0].match(/:(.*?);/);
  var mime = mimeMatch && mimeMatch[1] || "image/png";
  var bstr = atob(parts[1] || "");
  var u8 = new Uint8Array(bstr.length);
  for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new File([u8], name || "image." + (mime.split("/")[1] || "png"), { type: mime });
}

// src/features/recall/buttons.js
function findPrimaryButton() {
  try {
    var card = document.querySelector("[data-composer-card]");
    if (!card) return null;
    var btns = card.querySelectorAll("button[aria-label]");
    for (var i = 0; i < btns.length; i++) {
      var al = (btns[i].getAttribute("aria-label") || "").toLowerCase();
      if (al.indexOf("\u53D1\u9001") !== -1 || al.indexOf("send") !== -1 || al.indexOf("\u505C\u6B62") !== -1 || al.indexOf("stop") !== -1) return btns[i];
    }
  } catch (e) {
  }
  return null;
}
function isStopButton(btn) {
  if (!btn) return false;
  var al = (btn.getAttribute("aria-label") || "").toLowerCase();
  return al.indexOf("\u505C\u6B62") !== -1 || al.indexOf("stop") !== -1;
}
var primaryButtonSendingTimer = null;
function setPrimaryButtonSendingState(sending) {
  try {
    var btn = findPrimaryButton();
    if (primaryButtonSendingTimer) {
      clearTimeout(primaryButtonSendingTimer);
      primaryButtonSendingTimer = null;
    }
    if (!btn) return;
    if (sending) {
      btn.setAttribute("data-dsh-easyrewrite-sending", "true");
      btn.disabled = true;
      btn.style.setProperty("opacity", "0.45", "important");
      btn.style.setProperty("pointer-events", "none", "important");
      btn.style.setProperty("cursor", "not-allowed", "important");
      btn.style.setProperty("filter", "grayscale(1)", "important");
      primaryButtonSendingTimer = setTimeout(function() {
        setPrimaryButtonSendingState(false);
      }, 15e3);
    } else {
      btn.removeAttribute("data-dsh-easyrewrite-sending");
      btn.disabled = false;
      btn.style.removeProperty("opacity");
      btn.style.removeProperty("pointer-events");
      btn.style.removeProperty("cursor");
      btn.style.removeProperty("filter");
    }
  } catch (e) {
  }
}
function readCurrentComposerText(fallbackText, props) {
  var domVal = "";
  var projVal = "";
  var snapVal = "";
  var ishell = props && props.inputState || null;
  try {
    var el = document.querySelector([
      "[data-input-scroll] [contenteditable='true']",
      "[data-input-scroll] textarea",
      "[data-composer-card='true'] [contenteditable='true']",
      "[data-composer-card='true'] textarea",
      "[data-composer-card] [contenteditable='true']",
      "[data-composer-card] textarea"
    ].join(","));
    if (!el) {
      var candidates = document.querySelectorAll("[contenteditable='true'], textarea");
      for (var ci = 0; ci < candidates.length; ci++) {
        var cand = candidates[ci];
        if (cand && typeof cand.closest === "function" && cand.closest('[data-dsh-easyrewrite="user-editing"]')) {
          continue;
        }
        el = cand;
        break;
      }
    }
    if (el) {
      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
        var t = typeof el.innerText === "string" ? el.innerText : el.textContent || "";
        domVal = t.replace(/\r?\n$/g, "");
      } else if (typeof el.value === "string") {
        domVal = el.value;
      }
    }
  } catch (eDom) {
  }
  try {
    if (ishell && ishell.projection && typeof ishell.projection.clipboardText === "string") {
      projVal = ishell.projection.clipboardText;
    }
  } catch (eProj) {
  }
  try {
    if (ishell && ishell.state && typeof ishell.state.getSnapshot === "function") {
      var snap = ishell.state.getSnapshot();
      if (snap && typeof snap.draft === "string") snapVal = snap.draft;
    } else if (ishell && typeof ishell.draft === "string") {
      snapVal = ishell.draft;
    }
  } catch (eSnap) {
  }
  var chosen = fallbackText;
  var source = "fallback";
  if (domVal !== "") {
    chosen = domVal;
    source = "dom";
  } else if (projVal !== "") {
    chosen = projVal;
    source = "projection";
  } else if (snapVal !== "") {
    chosen = snapVal;
    source = "snapshot";
  }
  log("info", "recall", "\u8F93\u5165\u6846\u6587\u672C\u8BFB\u53D6\u8BCA\u65AD", {
    source,
    chosenLen: typeof chosen === "string" ? chosen.length : 0,
    domLen: domVal.length,
    projLen: projVal.length,
    snapLen: snapVal.length
  });
  return chosen;
}

// src/features/recall/ghost.js
async function requestCleanGhostQueue(targetSessionId) {
  if (!targetSessionId) return { ok: false, cleared: 0, removedIds: [] };
  try {
    var resp = await fetch("/bubble/clean-ghost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: targetSessionId })
    });
    if (resp.ok) {
      var data = await resp.json();
      log("info", "clean-ghost", "Host \u5E7D\u7075\u961F\u5217\u6E05\u7406\u5B8C\u6210", {
        sessionId: targetSessionId,
        cleared: data.cleared,
        removedIds: data.removedIds
      });
      return data;
    }
  } catch (e) {
    log("warn", "clean-ghost", "\u8BF7\u6C42 clean-ghost \u5F02\u5E38\uFF08\u964D\u7EA7\u7EE7\u7EED\uFF09", {
      sessionId: targetSessionId,
      err: String(e && e.message ? e.message : e)
    });
  }
  return { ok: false, cleared: 0, removedIds: [] };
}

// src/features/recall/capsule.js
var React9 = __toESM(require("react"), 1);
function ConfirmCapsule({ text, onConfirm, onCancel }) {
  var L = useUILocaleDict();
  var capsuleStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--dsw-alias-bg-l2, rgba(128,128,128,0.14))",
    borderRadius: "999px",
    padding: "6px 10px 6px 16px",
    fontSize: "12px",
    lineHeight: "20px",
    color: "var(--dsw-alias-label-secondary)"
  };
  var pillBtnStyle = {
    border: "none",
    background: "#ffffff",
    color: "#000000",
    borderRadius: "999px",
    padding: "3px 9px",
    fontSize: "12px",
    lineHeight: "18px",
    cursor: "pointer",
    whiteSpace: "nowrap"
  };
  return React9.createElement(
    "div",
    { style: capsuleStyle, "data-dsh-easyrewrite": "confirm-capsule" },
    React9.createElement("span", null, text),
    React9.createElement("button", { type: "button", style: pillBtnStyle, onClick: function(e) {
      e.stopPropagation();
      onConfirm();
    } }, L.confirm),
    React9.createElement("button", { type: "button", style: pillBtnStyle, onClick: function(e) {
      e.stopPropagation();
      onCancel();
    } }, L.cancel)
  );
}

// src/features/history/pager.js
var React10 = __toESM(require("react"), 1);
function goToVersion(fam, sessionId, nextIndex, props, cleanupRef) {
  var next = fam.versions[nextIndex];
  if (!next) return;
  log("info", "pager", "\u5207\u6362\u7248\u672C", { from: sessionId, to: next, index: nextIndex + 1, count: fam.versions.length });
  try {
    fetch("/bubble/vault/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, summary: "\u5207\u6362\u7248\u672C\u524D\u81EA\u52A8\u4FDD\u5B58" }),
      keepalive: true
    }).catch(function() {
    });
  } catch (eVs) {
  }
  var doOpen = function() {
    safeOpenSession(next, props);
    if (cleanupRef.current !== null) {
      clearInterval(cleanupRef.current);
      cleanupRef.current = null;
    }
    var attempts = 0;
    cleanupRef.current = setInterval(function() {
      attempts++;
      try {
        var cur = typeof props.currentSessionId === "function" ? props.currentSessionId() : null;
        if (cur === next) {
          clearInterval(cleanupRef.current);
          cleanupRef.current = null;
          fam.versions.forEach(function(vid) {
            if (vid !== next) {
              fetch("/bubble/vault/retire-session", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: vid }),
                keepalive: true
              }).catch(function() {
              });
            }
          });
          return;
        }
      } catch (e) {
      }
      if (attempts >= 40) {
        clearInterval(cleanupRef.current);
        cleanupRef.current = null;
      }
    }, 200);
  };
  if (typeof props.restoreSession === "function") {
    try {
      props.restoreSession(next).then(function() {
        doOpen();
      }, function() {
        doOpen();
      });
      return;
    } catch (e) {
    }
  }
  doOpen();
}
async function createBlankChildSession(sessionId, props) {
  var wsId = null;
  var cwd = null;
  try {
    if (props && props.ctxWorkspaces && typeof props.ctxWorkspaces.list === "object" && typeof props.ctxWorkspaces.list.getSnapshot === "function") {
      var wsList = props.ctxWorkspaces.list.getSnapshot();
      if (wsList && Array.isArray(wsList.items)) {
        for (var wi = 0; wi < wsList.items.length; wi++) {
          var wItem = wsList.items[wi];
          if (wItem && Array.isArray(wItem.sessionIds) && wItem.sessionIds.indexOf(sessionId) >= 0) {
            wsId = wItem.workspaceId;
            cwd = wItem.path || wItem.cwd || null;
            break;
          }
        }
      }
    }
  } catch (eWs) {
  }
  try {
    if (!cwd && props && props.ctxSessions && typeof props.ctxSessions.list === "object" && typeof props.ctxSessions.list.getSnapshot === "function") {
      var sList = props.ctxSessions.list.getSnapshot();
      if (sList && Array.isArray(sList.items)) {
        for (var si = 0; si < sList.items.length; si++) {
          var sItem = sList.items[si];
          if (sItem && sItem.id === sessionId) {
            cwd = sItem.cwd || null;
            if (!wsId && sItem.workspaceId) wsId = sItem.workspaceId;
            break;
          }
        }
      }
    }
  } catch (eSess) {
  }
  if (props && props.ctxSessions && typeof props.ctxSessions.create === "function") {
    try {
      var createOpts = wsId ? { workspaceId: wsId } : cwd ? { cwd } : {};
      var createdId = await props.ctxSessions.create(createOpts);
      if (typeof createdId === "string" && createdId.length > 0) {
        log("info", "reset", "\u901A\u8FC7 ctxSessions.create \u521B\u5EFA\u7A7A\u767D\u4F1A\u8BDD\u6210\u529F", { sessionId, newId: createdId, wsId });
        return createdId;
      }
    } catch (eCreate) {
      log("warn", "reset", "ctxSessions.create \u521B\u5EFA\u7A7A\u767D\u4F1A\u8BDD\u5931\u8D25\uFF0C\u5C1D\u8BD5\u964D\u7EA7\u901A\u9053", { err: String(eCreate && eCreate.message ? eCreate.message : eCreate) });
    }
  }
  var uiWs = getUiWorkspace();
  var wsConnector = uiWs && typeof uiWs.connectWorkspace === "function" ? uiWs : props && props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function" ? props.ctxWorkspaces : null;
  if (wsId && wsConnector) {
    try {
      var connectedId = await wsConnector.connectWorkspace(wsId);
      if (typeof connectedId === "string" && connectedId.length > 0) {
        log("info", "reset", "\u901A\u8FC7 connectWorkspace \u521B\u5EFA\u7A7A\u767D\u4F1A\u8BDD\u6210\u529F", { sessionId, newId: connectedId, wsId });
        return connectedId;
      }
    } catch (eConn) {
      log("warn", "reset", "connectWorkspace \u521B\u5EFA\u7A7A\u767D\u4F1A\u8BDD\u5931\u8D25", { err: String(eConn && eConn.message ? eConn.message : eConn) });
    }
  }
  return null;
}
function goToVaultVersion(vaultManifest, sessionId, nextIndex, props, setVaultManifest, vaultManifestRef) {
  if (!vaultManifest || !Array.isArray(vaultManifest.versions)) return;
  var targetVer = vaultManifest.versions[nextIndex];
  if (!targetVer || typeof targetVer.versionNumber !== "number") return;
  log("info", "pager", "\u5207\u6362\u5F71\u5B50\u4ED3\u50A8\u7248\u672C", {
    sessionId,
    targetVersionNumber: targetVer.versionNumber,
    index: nextIndex + 1,
    count: vaultManifest.versions.length
  });
  try {
    fetch("/bubble/vault/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        targetVersionNumber: targetVer.versionNumber
      }),
      keepalive: true
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      if (data && data.ok && data.manifest) {
        if (vaultManifestRef) vaultManifestRef.current = data.manifest;
        if (typeof setVaultManifest === "function") setVaultManifest(data.manifest);
        safeOpenSession(sessionId, props);
        if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
          setTimeout(function() {
            window.location.reload();
          }, 60);
        }
      }
    }).catch(function(err) {
      log("warn", "pager", "\u5F71\u5B50\u4ED3\u50A8\u7248\u672C\u8FD8\u539F\u5931\u8D25", { err: String(err && err.message ? err.message : err) });
    });
  } catch (e) {
  }
}
function VersionPager(props) {
  var sessionId = props && props.sessionId || "";
  var L = useUILocaleDict();
  var cleanupRef = React10.useRef(null);
  var vaultState = React10.useState(null);
  var vaultManifest = vaultState[0];
  var setVaultManifest = vaultState[1];
  var vaultManifestRef = React10.useRef(null);
  var snapshot = getChatSnapshot(props);
  var isLastTail = false;
  try {
    if (snapshot && Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
      var order = snapshot.order;
      for (var oi = order.length - 1; oi >= 0; oi--) {
        var nd = snapshot.nodes.get(order[oi]);
        if (nd && nd.kind === "turn-tail") {
          if (nd.data && nd.data.closing && nd.data.closing.finalNode) {
            isLastTail = nd.data.closing.finalNode.messageId === props.messageId;
          } else if (props && props.messageId) {
            isLastTail = nd.messageId === props.messageId || nd.data && nd.data.messageId === props.messageId;
          }
          break;
        } else if (nd && (nd.kind === "assistant" || nd.kind === "bot")) {
          var mId = nd.data && nd.data.messageId || nd.messageId || nd.id;
          if (props && props.messageId && mId === props.messageId) {
            isLastTail = true;
            break;
          }
        }
      }
    } else {
      isLastTail = true;
    }
  } catch (e) {
  }
  React10.useEffect(function() {
    if (!sessionId || !isLastTail || typeof fetch !== "function") return;
    var cancelled = false;
    var retryTimer = null;
    function fetchVaultList(attempt) {
      try {
        fetch("/bubble/vault/list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId })
        }).then(function(r) {
          return r.json();
        }).then(function(data) {
          if (cancelled) return;
          if (data && data.ok && data.manifest && Array.isArray(data.manifest.versions)) {
            if (data.manifest.versions.length >= 2) {
              vaultManifestRef.current = data.manifest;
              setVaultManifest(data.manifest);
            } else if (data.manifest.versions.length === 1 && attempt < 3) {
              retryTimer = setTimeout(function() {
                fetchVaultList(attempt + 1);
              }, 350);
            }
          }
        }).catch(function() {
        });
      } catch (e) {
      }
    }
    fetchVaultList(0);
    return function() {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [sessionId, isLastTail, props && props.messageId]);
  React10.useEffect(function() {
    function onKey(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var tgt = e.target;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      var vMan = vaultManifestRef.current;
      if (vMan && Array.isArray(vMan.versions) && vMan.versions.length >= 2) {
        var vIdx = typeof vMan.currentVersionIndex === "number" ? vMan.currentVersionIndex : vMan.versions.length - 1;
        if (e.key === "ArrowLeft" && vIdx > 0) {
          e.preventDefault();
          goToVaultVersion(vMan, sessionId, vIdx - 1, props, setVaultManifest, vaultManifestRef);
        } else if (e.key === "ArrowRight" && vIdx < vMan.versions.length - 1) {
          e.preventDefault();
          goToVaultVersion(vMan, sessionId, vIdx + 1, props, setVaultManifest, vaultManifestRef);
        }
        return;
      }
      var fam = familyOfSession(sessionId, props.ctxSessions);
      if (!fam || fam.versions.length < 2) return;
      var idx = fam.index;
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        goToVersion(fam, sessionId, idx - 1, props, cleanupRef);
      } else if (e.key === "ArrowRight" && idx < fam.versions.length - 1) {
        e.preventDefault();
        goToVersion(fam, sessionId, idx + 1, props, cleanupRef);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return function() {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [sessionId]);
  if (!isLastTail) return null;
  var useVault = !!(vaultManifest && Array.isArray(vaultManifest.versions) && vaultManifest.versions.length >= 2);
  var family = useVault ? null : familyOfSession(sessionId, props.ctxSessions);
  if (!useVault && (!family || family.versions.length < 2)) return null;
  var count = useVault ? vaultManifest.versions.length : family.versions.length;
  var index = useVault ? typeof vaultManifest.currentVersionIndex === "number" ? vaultManifest.currentVersionIndex : count - 1 : family.index;
  var atFirst = index <= 0;
  var atLast = index >= count - 1;
  function go(delta) {
    if (useVault) {
      goToVaultVersion(vaultManifest, sessionId, index + delta, props, setVaultManifest, vaultManifestRef);
    } else {
      goToVersion(family, sessionId, index + delta, props, cleanupRef);
    }
  }
  var pagerStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    fontSize: "14px",
    color: "var(--dsw-alias-label-tertiary)",
    fontVariantNumeric: "tabular-nums"
  };
  var btnStyle = {
    appearance: "none",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--dsw-alias-label-secondary)",
    padding: "3px 7px",
    borderRadius: "6px",
    fontSize: "15px",
    lineHeight: "19px",
    fontFamily: "inherit"
  };
  function btnDisabled(flag) {
    return Object.assign({}, btnStyle, flag ? { opacity: 0.35, cursor: "default" } : {});
  }
  return React10.createElement(
    "span",
    { style: pagerStyle, "data-dsh-easyrewrite": "version-pager", title: L.pagerTitle },
    React10.createElement("button", {
      type: "button",
      className: "dbe-pager-btn",
      style: btnDisabled(atFirst),
      disabled: atFirst,
      "aria-label": L.pagerPrev,
      onClick: function() {
        go(-1);
      }
    }, React10.createElement(IconChevronLeftOutline, null)),
    React10.createElement("span", { style: { padding: "0 4px", fontSize: "14px", whiteSpace: "nowrap" } }, index + 1 + "/" + count),
    React10.createElement("button", {
      type: "button",
      className: "dbe-pager-btn",
      style: btnDisabled(atLast),
      disabled: atLast,
      "aria-label": L.pagerNext,
      onClick: function() {
        go(1);
      }
    }, React10.createElement(IconChevronRightOutline, null))
  );
}

// src/features/other/helpers.js
function countContentAfter(nodes, anchorSeq, seqField, onlyUser) {
  var field = seqField || "seq";
  var n = 0;
  if (!Array.isArray(nodes)) return n;
  for (var i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    if (nd === null || typeof nd !== "object") continue;
    var s = nd[field];
    if (typeof s !== "number" || s <= anchorSeq) continue;
    if (nd.kind === "turn-tail") continue;
    if (onlyUser && nd.kind !== "user") continue;
    n++;
  }
  return n;
}
var STAT_ONLY_USER_KEY = "dsh-easyrewrite:statOnlyUser";
function statOnlyUser() {
  try {
    return localStorage.getItem(STAT_ONLY_USER_KEY) !== "0";
  } catch (e) {
    return true;
  }
}

// src/features/bubble/view.js
function isImageFile(f) {
  if (!f) return false;
  var name = f.name || "";
  var type = f.type || "";
  if (name && /\.[a-z0-9]+$/i.test(name) && !isImageFileName(name)) {
    return false;
  }
  return isImageMediaType(type) || type && type.indexOf("image/") === 0 || isImageFileName(name);
}
function UserBubbleView(props) {
  var node = props.node;
  var data = node && node.data ? node.data : {};
  var text = extractText(data.content);
  var L = useUILocaleDict();
  var hasUnpreservable = false;
  try {
    if (data && Array.isArray(data.content)) {
      for (var bi = 0; bi < data.content.length; bi++) {
        var blk = data.content[bi];
        if (blk && blk.type !== "text" && blk.type !== "image" && blk.type !== "file") {
          hasUnpreservable = true;
          break;
        }
      }
    }
  } catch (e) {
  }
  var sessionId = props.sessionId;
  var myKey = node && typeof node.key === "string" ? node.key : "";
  var pending = usePending(sessionId);
  var confirmState = React11.useState(false);
  var confirming = confirmState[0];
  var setConfirming = confirmState[1];
  var draftRef = React11.useRef("");
  var inputState = typeof props.useInput === "function" ? props.useInput(function(s) {
    return s;
  }) : props.inputState || null;
  if (inputState) draftRef.current = typeof inputState.draft === "string" ? inputState.draft : "";
  try {
    var inImgs = getInputImageIdsCompat(inputState);
    if (inImgs.length > 0) setLatestInputImageIds(inImgs);
  } catch (eMir) {
  }
  try {
    if (props.inputState) {
      var pInImgs = getInputImageIdsCompat(props.inputState);
      if (pInImgs.length > 0) setLatestInputImageIds(pInImgs);
    }
  } catch (eMir2) {
  }
  var previewState = React11.useState(false);
  var showPreview = previewState[0];
  var setShowPreview = previewState[1];
  var editState = React11.useState(false);
  var editing = editState[0];
  var setEditing = editState[1];
  var editTextState = React11.useState("");
  var editText = editTextState[0];
  var setEditText = editTextState[1];
  var errState = React11.useState(null);
  var opError = errState[0];
  var setOpError = errState[1];
  var bubbleInitSizeState = React11.useState({ w: 0, h: 0 });
  var bubbleInitSize = bubbleInitSizeState[0];
  var isEditPending = pending && pending.type === "edit" && pending.targetKey === myKey;
  var sEditImgs = React11.useState([]);
  var editImages = sEditImgs[0];
  var setEditImages = sEditImgs[1];
  var editImagesRef = React11.useRef([]);
  editImagesRef.current = editImages;
  var editRestoredRef = React11.useRef(false);
  var hadEditPendingAtMount = React11.useRef(false);
  if (hadEditPendingAtMount.current === false && pending && pending.type === "edit" && pending.targetKey === myKey) hadEditPendingAtMount.current = true;
  var sEditSel = React11.useState(null);
  var editSel = sEditSel[0];
  var setEditSel = sEditSel[1];
  var sPSize = React11.useState(messagePreviewSize());
  var pSize = sPSize[0];
  var setPSize = sPSize[1];
  React11.useEffect(function() {
    function onSettingsChange(e) {
      if (!e || !e.key || e.key === "dsh-easyrewrite:messagePreviewSize" || e.detail && e.detail.key === "dsh-easyrewrite:messagePreviewSize") {
        setPSize(messagePreviewSize());
      }
    }
    window.addEventListener("storage", onSettingsChange);
    window.addEventListener("dsh-easyrewrite:settings-change", onSettingsChange);
    return function() {
      window.removeEventListener("storage", onSettingsChange);
      window.removeEventListener("dsh-easyrewrite:settings-change", onSettingsChange);
    };
  }, []);
  var sDzActive = React11.useState(false);
  var dzActive = sDzActive[0];
  var setDzActive = sDzActive[1];
  var sDzOver = React11.useState(false);
  var dzOver = sDzOver[0];
  var setDzOver = sDzOver[1];
  var sDzBottomOver = React11.useState(false);
  var dzBottomOver = sDzBottomOver[0];
  var setDzBottomOver = sDzBottomOver[1];
  var dzActiveRef = React11.useRef(false);
  var dzOverRef = React11.useRef(false);
  var dzBottomOverRef = React11.useRef(false);
  var dzWatchdogRef = React11.useRef(0);
  var stagedBottomImageIdsRef = React11.useRef([]);
  var stagedBottomFilesRef = React11.useRef([]);
  var createdBlobUrlsRef = React11.useRef([]);
  function createTrackedObjectUrl(file) {
    if (!file || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
    try {
      var u = URL.createObjectURL(file);
      if (u) createdBlobUrlsRef.current.push(u);
      return u;
    } catch (e) {
      return "";
    }
  }
  function revokeTrackedObjectUrls() {
    var urls = createdBlobUrlsRef.current;
    if (!urls || urls.length === 0) return;
    createdBlobUrlsRef.current = [];
    for (var ui = 0; ui < urls.length; ui++) {
      try {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(urls[ui]);
        }
      } catch (e) {
      }
    }
  }
  React11.useEffect(function() {
    if (!editing) {
      revokeTrackedObjectUrls();
    }
    return function() {
      revokeTrackedObjectUrls();
    };
  }, [editing]);
  function syncEditImgsToPending(items) {
    try {
      var p = readPending(sessionId);
      if (!p || p.type !== "edit") return;
      var total = 0, stripped = 0;
      var snap = items.map(function(it) {
        var du = it && it.dataUrl ? String(it.dataUrl) : null;
        if (du) total += du.length;
        return {
          id: it.id,
          dataUrl: du,
          name: it.name || void 0,
          size: it.size || void 0,
          type: it.type || void 0,
          isFile: !!it.isFile,
          isOriginal: !!(it.attachment && it.attachment.attachmentId)
        };
      });
      if (total > 4e6) {
        snap = snap.map(function(it) {
          if (it.dataUrl) {
            it.dataUrl = null;
            stripped++;
          }
          return it;
        });
        log("warn", "edit", "\u7F16\u8F91\u9644\u4EF6\u8FC7\u5927\uFF0C\u8DF3\u8FC7\u5237\u65B0\u6301\u4E45\u5316\uFF08\u672C\u6B21\u4F1A\u8BDD\u5185\u4ECD\u6709\u6548\uFF09", { stripped, total });
      }
      writePending(sessionId, Object.assign({}, p, { editImgs: snap, editImgsTrackedOriginals: true, updatedAt: Date.now() }));
    } catch (eSp) {
    }
  }
  React11.useEffect(function() {
    if (!isEditPending || editing) return;
    setEditing(true);
    setEditText(pending.draftText);
    if (!hadEditPendingAtMount.current || editRestoredRef.current) return;
    editRestoredRef.current = true;
    try {
      var _rpc = contentParts(data.content);
      var _rAtts = _rpc && Array.isArray(_rpc.attachments) ? _rpc.attachments : [];
      var savedList = pending && Array.isArray(pending.editImgs) ? pending.editImgs : [];
      var trackedOriginals = !!(pending && pending.editImgsTrackedOriginals && Array.isArray(pending.editImgs));
      var restoreInitItems = [];
      for (var _ri = 0; _ri < _rAtts.length; _ri++) {
        var _rEntry = _rAtts[_ri];
        var _rAtt = _rEntry && _rEntry.attachment;
        if (!_rAtt) continue;
        if (trackedOriginals && _rAtt.attachmentId) {
          var stillKept = savedList.some(function(sv2) {
            return sv2 && sv2.id === _rAtt.attachmentId;
          });
          if (!stillKept) continue;
        }
        var _rIsFile = _rEntry.type === "file";
        restoreInitItems.push({
          id: _rAtt.attachmentId || (_rIsFile ? "file-" : "img-") + _ri + "-" + Date.now(),
          name: _rAtt.name || (_rIsFile ? "file" : "image.png"),
          size: typeof _rAtt.bytes === "number" ? _rAtt.bytes : _rAtt.size || 0,
          type: _rAtt.mediaType || (_rIsFile ? "" : "image/png"),
          url: "",
          isFile: _rIsFile,
          file: null,
          attachment: _rAtt
        });
      }
      for (var si = 0; si < savedList.length; si++) {
        var sv = savedList[si];
        if (!sv || !sv.dataUrl || sv.isOriginal) continue;
        try {
          var sFile = dataUrlToFile(sv.dataUrl, sv.name);
          if (sv.isFile) {
            restoreInitItems.push({
              id: sv.id || "file-restored-" + si + "-" + Date.now(),
              name: sv.name || sFile.name || "file",
              size: sv.size || sFile.size || 0,
              type: sv.type || sFile.type || "",
              url: "",
              dataUrl: sv.dataUrl,
              file: sFile,
              isFile: true
            });
          } else {
            var sD = createDraftImagesCompat([sFile], sessionId);
            if (sD && sD.length > 0) {
              restoreInitItems.push({ id: sD[0].id, url: sD[0].previewUrl, dataUrl: sv.dataUrl, file: sFile, isFile: false });
            } else {
              var rBlobUrl1 = createTrackedObjectUrl(sFile);
              if (rBlobUrl1) {
                restoreInitItems.push({ id: sv.id || "img-restored-" + si, url: rBlobUrl1, dataUrl: sv.dataUrl, file: sFile, isFile: false });
              }
            }
          }
        } catch (eRa) {
          log("warn", "edit", "\u6062\u590D\u62D6\u5165\u56FE/\u6587\u4EF6\u5931\u8D25", { err: String(eRa && eRa.message ? eRa.message : eRa) });
        }
      }
      if (restoreInitItems.length > 0) {
        editImagesRef.current = restoreInitItems;
        setEditImages(restoreInitItems);
      }
      (async function() {
        for (var rbi = 0; rbi < restoreInitItems.length; rbi++) {
          var rCur = restoreInitItems[rbi];
          if (rCur.file instanceof File && (rCur.isFile || rCur.url)) continue;
          try {
            var rResolved = await resolveAttachmentFile(sessionId, rCur, props);
            var rPreview = rCur.url || "";
            if (!rCur.isFile) {
              if (rResolved instanceof File) {
                var rDrafts = createDraftImagesCompat([rResolved], sessionId);
                if (rDrafts && rDrafts.length > 0 && rDrafts[0].previewUrl) {
                  rPreview = rDrafts[0].previewUrl;
                } else {
                  rPreview = createTrackedObjectUrl(rResolved);
                }
              } else if (rCur.attachment) {
                var rUrlFallback = await resolveImageCompat(sessionId, rCur.attachment, props);
                if (rUrlFallback) rPreview = rUrlFallback;
              }
            }
            if (rResolved instanceof File || rPreview) {
              if (rResolved instanceof File) rCur.file = rResolved;
              if (rPreview) rCur.url = rPreview;
              setEditImages(function(prev) {
                var nxt = prev.map(function(x) {
                  if (x.id !== rCur.id) return x;
                  return Object.assign({}, x, {
                    file: rResolved instanceof File ? rResolved : x.file,
                    url: rPreview || x.url
                  });
                });
                editImagesRef.current = nxt;
                return nxt;
              });
            }
          } catch (eRo) {
            log("warn", "edit", "\u6062\u590D\u5355\u4E2A\u539F\u9644\u4EF6\u5931\u8D25", { err: String(eRo && eRo.message ? eRo.message : eRo) });
          }
        }
        log("info", "edit", "\u7F16\u8F91\u6001\u5237\u65B0\u6062\u590D\u5B8C\u6210", { count: restoreInitItems.length });
      })();
    } catch (eRe) {
      log("warn", "edit", "\u7F16\u8F91\u6001\u5237\u65B0\u6062\u590D\u5F02\u5E38", { err: String(eRe && eRe.message ? eRe.message : eRe) });
    }
  }, [isEditPending]);
  function getComposerToolbar(card) {
    try {
      if (!card) return null;
      var btn = card.querySelector("button[aria-label*='\u53D1\u9001'], button[aria-label*='Send'], button[data-send-button]");
      if (!btn) {
        var btns = card.querySelectorAll("button");
        if (btns.length > 0) btn = btns[btns.length - 1];
      }
      if (btn) {
        var cur = btn;
        while (cur && cur.parentNode && cur.parentNode !== card) {
          cur = cur.parentNode;
        }
        if (cur && cur.parentNode === card) return cur;
      }
    } catch (e) {
    }
    return null;
  }
  function isPointInBottomDz(e) {
    try {
      if (!e || typeof e.clientX !== "number" || typeof e.clientY !== "number") return false;
      var ov = document.querySelector("[data-easyrewrite-bottom-dz]");
      if (ov) {
        var r = ov.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
    } catch (err) {
    }
    return false;
  }
  function isTargetInComposerInput(target) {
    try {
      if (!target) return false;
      var card = target.closest("[data-composer-card='true']") || target.closest("[data-composer-card]");
      if (!card) return false;
      var toolbar = getComposerToolbar(card);
      if (toolbar && (toolbar === target || toolbar.contains(target))) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  React11.useEffect(function() {
    var card = document.querySelector("[data-composer-card='true']") || document.querySelector("[data-composer-card]");
    var scrollEl = card ? card.querySelector("[data-input-scroll]") : document.querySelector("[data-input-scroll]");
    function restoreInputBox() {
      try {
        var oldOv = document.querySelector("[data-easyrewrite-bottom-dz]");
        if (oldOv && oldOv.parentNode) {
          var pNode = oldOv.parentNode;
          oldOv.remove();
          if (pNode && pNode.dataset && pNode.dataset.easyrewriteOriginPos) {
            pNode.style.position = pNode.dataset.easyrewriteOriginPos;
            delete pNode.dataset.easyrewriteOriginPos;
          }
        }
        if (scrollEl && scrollEl.dataset && scrollEl.dataset.easyrewriteOrigMinH !== void 0) {
          scrollEl.style.minHeight = scrollEl.dataset.easyrewriteOrigMinH;
          delete scrollEl.dataset.easyrewriteOrigMinH;
          delete scrollEl.dataset.easyrewriteBaseH;
        }
      } catch (eR) {
      }
    }
    if (!editing || !dzActive) {
      restoreInputBox();
      return;
    }
    if (!card) return;
    var compStyle = window.getComputedStyle ? window.getComputedStyle(card) : null;
    if (compStyle && compStyle.position === "static") {
      card.dataset.easyrewriteOriginPos = card.style.position || "";
      card.style.position = "relative";
    }
    if (scrollEl) {
      if (!scrollEl.dataset.easyrewriteOrigMinH) {
        scrollEl.dataset.easyrewriteOrigMinH = scrollEl.style.minHeight || "";
        scrollEl.dataset.easyrewriteBaseH = String(Math.max(28, scrollEl.offsetHeight || 32));
      }
      var baseH = parseFloat(scrollEl.dataset.easyrewriteBaseH) || 32;
      var targetH = Math.min(240, Math.max(80, Math.round(baseH * 2.5)));
      scrollEl.style.transition = "min-height .15s ease";
      scrollEl.style.minHeight = targetH + "px";
    }
    var toolbar = getComposerToolbar(card);
    var bottomGap = 44;
    try {
      if (toolbar) {
        var cRect = card.getBoundingClientRect();
        var tRect = toolbar.getBoundingClientRect();
        if (tRect.top >= cRect.top && tRect.top < cRect.bottom) {
          bottomGap = Math.max(36, Math.round(cRect.bottom - tRect.top));
        }
      }
    } catch (eG) {
    }
    var ov = card.querySelector("[data-easyrewrite-bottom-dz]");
    if (!ov) {
      ov = document.createElement("div");
      ov.setAttribute("data-easyrewrite-bottom-dz", "1");
      ov.style.position = "absolute";
      ov.style.top = "6px";
      ov.style.left = "8px";
      ov.style.right = "8px";
      ov.style.bottom = bottomGap + 4 + "px";
      ov.style.zIndex = "25";
      ov.style.display = "flex";
      ov.style.alignItems = "center";
      ov.style.justifyContent = "center";
      ov.style.borderRadius = "12px";
      ov.style.boxSizing = "border-box";
      ov.style.pointerEvents = "none";
      ov.style.backdropFilter = "blur(14px)";
      ov.style.webkitBackdropFilter = "blur(14px)";
      ov.style.animation = "dshEasyRewriteDzFadeIn 0.16s ease-out";
      ov.style.transition = "border-color .12s ease, background-color .12s ease, color .12s ease";
      var txtSpan = document.createElement("span");
      txtSpan.className = "dsh-easyrewrite-bottom-dz-text";
      txtSpan.style.fontSize = "13.5px";
      txtSpan.style.fontWeight = "500";
      txtSpan.style.textAlign = "center";
      txtSpan.style.padding = "0 14px";
      txtSpan.style.maxWidth = "100%";
      txtSpan.style.overflow = "hidden";
      txtSpan.style.textOverflow = "ellipsis";
      txtSpan.style.whiteSpace = "nowrap";
      ov.appendChild(txtSpan);
      card.appendChild(ov);
    } else {
      ov.style.top = "6px";
      ov.style.bottom = bottomGap + 4 + "px";
    }
    var dzBlue = "var(--dsw-static-deepseek-500, #4d6bfe)";
    var dzGrey = "rgba(128,128,128,0.45)";
    ov.style.border = "3px dashed " + (dzBottomOver ? dzBlue : dzGrey);
    ov.style.background = dzBottomOver ? "rgba(77,107,254,0.10)" : "rgba(128,128,128,0.06)";
    var spanEl = ov.querySelector(".dsh-easyrewrite-bottom-dz-text");
    if (spanEl) {
      spanEl.textContent = dzBottomOver ? "\u677E\u5F00\u6682\u5B58\u81F3\u8F93\u5165\u6846\uFF08\u65B0\u5BF9\u8BDD\u4E2D\u4FDD\u7559\uFF09" : "\u62D6\u5165\u6B64\u5904\u6682\u5B58\u81F3\u8F93\u5165\u6846\uFF08\u65B0\u5BF9\u8BDD\u4E2D\u4FDD\u7559\uFF09";
      spanEl.style.color = dzBottomOver ? dzBlue : "rgba(128,128,128,0.85)";
    }
    return function() {
      restoreInputBox();
    };
  }, [editing, dzActive, dzBottomOver]);
  React11.useEffect(function() {
    if (!editing) return;
    function looksLikeFileDrag(e) {
      try {
        var t = e.dataTransfer;
        if (!t) return false;
        if (getDraggedAttachment()) return true;
        if (t.types) {
          var arr = Array.prototype.slice.call(t.types);
          if (arr.indexOf("Files") !== -1) return true;
          if (arr.indexOf("application/x-dsh-easyrewrite-file") !== -1) return true;
        }
        return false;
      } catch (eT) {
        return false;
      }
    }
    function suppress(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    function armWatchdog() {
      try {
        if (dzWatchdogRef.current) clearTimeout(dzWatchdogRef.current);
      } catch (eW) {
      }
      dzWatchdogRef.current = setTimeout(function() {
        dzActiveRef.current = false;
        dzOverRef.current = false;
        dzBottomOverRef.current = false;
        setDzActive(false);
        setDzOver(false);
        setDzBottomOver(false);
      }, 2500);
    }
    function onDragEnter(e) {
      if (!looksLikeFileDrag(e)) return;
      suppress(e);
      armWatchdog();
      if (!dzActiveRef.current) {
        dzActiveRef.current = true;
        setDzActive(true);
      }
      var over = false;
      try {
        over = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]"));
      } catch (eC) {
      }
      if (over !== dzOverRef.current) {
        dzOverRef.current = over;
        setDzOver(over);
      }
      var bOver = false;
      try {
        bOver = isPointInBottomDz(e) || isTargetInComposerInput(e.target);
      } catch (eBC) {
      }
      if (bOver !== dzBottomOverRef.current) {
        dzBottomOverRef.current = bOver;
        setDzBottomOver(bOver);
      }
    }
    function onDragOver(e) {
      if (!looksLikeFileDrag(e)) return;
      suppress(e);
      armWatchdog();
      if (!dzActiveRef.current) {
        dzActiveRef.current = true;
        setDzActive(true);
      }
      var over2 = false;
      try {
        over2 = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]"));
      } catch (eC2) {
      }
      if (over2 !== dzOverRef.current) {
        dzOverRef.current = over2;
        setDzOver(over2);
      }
      var bOver2 = false;
      try {
        bOver2 = isPointInBottomDz(e) || isTargetInComposerInput(e.target);
      } catch (eBC2) {
      }
      if (bOver2 !== dzBottomOverRef.current) {
        dzBottomOverRef.current = bOver2;
        setDzBottomOver(bOver2);
      }
    }
    function dzReset() {
      try {
        if (dzWatchdogRef.current) {
          clearTimeout(dzWatchdogRef.current);
          dzWatchdogRef.current = 0;
        }
      } catch (eW2) {
      }
      dzActiveRef.current = false;
      dzOverRef.current = false;
      dzBottomOverRef.current = false;
      setDzActive(false);
      setDzOver(false);
      setDzBottomOver(false);
    }
    function onDrop(e) {
      suppress(e);
      var isBubble = false;
      var isBottom = false;
      try {
        isBubble = !!(e.target && e.target.closest && e.target.closest("[data-easyrewrite-dropzone]"));
        isBottom = isPointInBottomDz(e) || isTargetInComposerInput(e.target);
      } catch (eCl) {
      }
      dzReset();
      try {
        var rawFiles = [];
        var dt = e.dataTransfer;
        if (dt && dt.files) {
          for (var di = 0; di < dt.files.length; di++) {
            if (dt.files[di]) rawFiles.push(dt.files[di]);
          }
        }
        var dragged = getDraggedAttachment();
        if (rawFiles.length === 0 && dragged) {
          if (dragged.file instanceof File) {
            rawFiles.push(dragged.file);
          }
        }
        if (rawFiles.length === 0) return;
        if (isBottom) {
          var ia = props.inputActions;
          if (ia && typeof ia.addFiles === "function") {
            try {
              ia.addFiles(rawFiles);
              log("info", "edit", "\u6587\u4EF6\u5DF2\u901A\u8FC7 ia.addFiles \u6682\u5B58\u81F3\u5B98\u65B9\u8F93\u5165\u6846", { count: rawFiles.length });
              clearDraggedAttachment();
              return;
            } catch (eAf) {
            }
          }
          var bDrafts = createDraftImagesCompat(rawFiles, sessionId);
          if (bDrafts && bDrafts.length > 0) {
            var bIds = bDrafts.map(function(im) {
              return im.id;
            });
            addInputImagesCompat(props.inputActions, bIds);
            stagedBottomImageIdsRef.current = stagedBottomImageIdsRef.current.concat(bIds);
            stagedBottomFilesRef.current = stagedBottomFilesRef.current.concat(rawFiles);
            log("info", "edit", "\u6587\u4EF6/\u56FE\u7247\u5DF2\u6210\u529F\u6DFB\u52A0\u5230\u5E95\u90E8\u8F93\u5165\u6846\u6682\u5B58\u533A", { count: bIds.length, ids: bIds });
          }
          clearDraggedAttachment();
          return;
        }
        if (!isBubble) {
          clearDraggedAttachment();
          return;
        }
        if (dragged && dragged.id && editImagesRef.current.some(function(x) {
          return x.id === dragged.id;
        })) {
          clearDraggedAttachment();
          return;
        }
        var imgFiles = [];
        var nonImgFiles = [];
        for (var fi = 0; fi < rawFiles.length; fi++) {
          var rf = rawFiles[fi];
          if (isImageFile(rf)) imgFiles.push(rf);
          else nonImgFiles.push(rf);
        }
        var addedItems = [];
        if (imgFiles.length > 0) {
          var dImgs = createDraftImagesCompat(imgFiles, sessionId);
          var imgItems = dImgs.map(function(im, idx) {
            return { id: im.id, url: im.previewUrl, dataUrl: null, file: imgFiles[idx] };
          });
          for (var ai = 0; ai < imgItems.length; ai++) {
            (function(item, srcFile) {
              fileToDataUrl(srcFile).then(function(du) {
                item.dataUrl = du;
                setEditImages(function(prev) {
                  var nxt = prev.map(function(x) {
                    return x.id === item.id ? Object.assign({}, x, { dataUrl: du }) : x;
                  });
                  syncEditImgsToPending(nxt);
                  return nxt;
                });
              }).catch(function() {
              });
            })(imgItems[ai], imgFiles[ai]);
          }
          addedItems = addedItems.concat(imgItems);
        }
        if (nonImgFiles.length > 0) {
          var fileItems = nonImgFiles.map(function(nf) {
            return {
              id: "file-" + Math.random().toString(36).slice(2) + "-" + Date.now(),
              name: nf.name || "file",
              size: nf.size || 0,
              type: nf.type || "",
              dataUrl: null,
              isFile: true,
              file: nf
            };
          });
          for (var nfi = 0; nfi < fileItems.length; nfi++) {
            (function(fItem, srcNf) {
              if (srcNf && srcNf.size <= 25e5) {
                fileToDataUrl(srcNf).then(function(du) {
                  fItem.dataUrl = du;
                  setEditImages(function(prev) {
                    var nxt = prev.map(function(x) {
                      return x.id === fItem.id ? Object.assign({}, x, { dataUrl: du }) : x;
                    });
                    editImagesRef.current = nxt;
                    syncEditImgsToPending(nxt);
                    return nxt;
                  });
                }).catch(function() {
                });
              }
            })(fileItems[nfi], nonImgFiles[nfi]);
          }
          addedItems = addedItems.concat(fileItems);
        }
        setEditImages(function(prev) {
          var nxt = prev.concat(addedItems);
          editImagesRef.current = nxt;
          syncEditImgsToPending(nxt);
          return nxt;
        });
        log("info", "edit", "\u62E6\u622A\u5230\u62D6\u5165\u6587\u4EF6\u81F3\u6C14\u6CE1", { imgs: imgFiles.length, files: nonImgFiles.length, total: addedItems.length });
        clearDraggedAttachment();
      } catch (eDr) {
        log("warn", "edit", "\u62D6\u5165\u62E6\u622A\u5F02\u5E38", { err: String(eDr && eDr.message ? eDr.message : eDr) });
        clearDraggedAttachment();
      }
    }
    function onDragLeave(e) {
      if (!looksLikeFileDrag(e)) return;
      if (e.relatedTarget === null) dzReset();
    }
    document.addEventListener("dragenter", onDragEnter, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragleave", onDragLeave, true);
    return function() {
      document.removeEventListener("dragenter", onDragEnter, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragleave", onDragLeave, true);
      try {
        if (dzWatchdogRef.current) {
          clearTimeout(dzWatchdogRef.current);
          dzWatchdogRef.current = 0;
        }
      } catch (eC3) {
      }
      dzActiveRef.current = false;
      dzOverRef.current = false;
      dzBottomOverRef.current = false;
      setDzActive(false);
      setDzOver(false);
      setDzBottomOver(false);
      try {
        var ovOld = document.querySelector("[data-easyrewrite-bottom-dz]");
        if (ovOld && ovOld.parentNode) {
          var pNode2 = ovOld.parentNode;
          ovOld.remove();
          if (pNode2 && pNode2.dataset && pNode2.dataset.easyrewriteOriginPos) {
            pNode2.style.position = pNode2.dataset.easyrewriteOriginPos;
            delete pNode2.dataset.easyrewriteOriginPos;
          }
        }
        var scOld = document.querySelector("[data-input-scroll]");
        if (scOld && scOld.dataset && scOld.dataset.easyrewriteOrigMinH !== void 0) {
          scOld.style.minHeight = scOld.dataset.easyrewriteOrigMinH;
          delete scOld.dataset.easyrewriteOrigMinH;
          delete scOld.dataset.easyrewriteBaseH;
        }
      } catch (eRem) {
      }
    };
  }, [editing]);
  var _pcCache = contentParts(data.content);
  var _attsCache = _pcCache && _pcCache.attachments ? _pcCache.attachments : [];
  if (_attsCache.length > 0) {
    var _arC = [];
    for (var _aci = 0; _aci < _attsCache.length; _aci++) {
      var _itemC = _attsCache[_aci];
      var _ca2 = _itemC && _itemC.attachment;
      if (_ca2 && typeof _ca2.attachmentId === "string") {
        _arC.push({
          attachmentId: _ca2.attachmentId,
          mediaType: _ca2.mediaType || "",
          name: _ca2.name || (_itemC.type === "file" ? "file" : "image.png"),
          isFile: _itemC.type === "file"
        });
      }
    }
    if (_arC.length > 0) setCachedEditMsg(myKey, { seq: data && typeof data.seq === "number" ? data.seq : anchorSeq, attachRefs: _arC });
  }
  var anchorSeq = node && typeof node.anchorSeq === "number" ? node.anchorSeq : node && typeof node.seq === "number" ? node.seq : 0;
  var afterCount = 0;
  var onlyUser = statOnlyUser();
  try {
    var snapshot = getChatSnapshot(props);
    if (snapshot) {
      if (Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
        var order = snapshot.order;
        var myKey = node && typeof node.key === "string" ? node.key : "";
        var myIdx = order.indexOf(myKey);
        if (myIdx !== -1) {
          for (var k = myIdx + 1; k < order.length; k++) {
            var afterNode = snapshot.nodes.get(order[k]);
            if (!afterNode || afterNode.kind === "turn-tail") continue;
            if (onlyUser && afterNode.kind !== "user") continue;
            afterCount++;
          }
        }
      }
      if (afterCount === 0 && Array.isArray(snapshot.nodes)) {
        afterCount = countContentAfter(snapshot.nodes, anchorSeq, "seq", onlyUser);
      }
      if (afterCount === 0 && snapshot.nodes && typeof snapshot.nodes.values === "function") {
        afterCount = countContentAfter(snapshot.nodes.values(), anchorSeq, "anchorSeq", onlyUser);
      }
    }
  } catch (err) {
    log("warn", "count", "\u4F1A\u8BDD\u5FEB\u7167\u8BFB\u53D6\u5931\u8D25\uFF08\u6570\u91CF\u663E\u793A 0\uFF09", { err: String(err && err.message ? err.message : err) });
  }
  var msgTime = data && typeof data.time === "number" ? data.time : typeof node.time === "number" ? node.time : 0;
  var rowStyle = { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", padding: "2px 0" };
  var bubbleStyle = {
    maxWidth: "min(80%, var(--dsh-chat-content-width, 748px))",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
    borderRadius: "14px",
    padding: "8px 14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: "var(--dsh-content-font-size, 14px)",
    lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
    color: "var(--dsw-alias-label-primary, inherit)"
  };
  var actionsStyle = { display: "flex", gap: "2px", alignItems: "center" };
  var pendingMine = pending && pending.type === "recall" && pending.targetKey === myKey;
  if (pendingMine && pending.visualMode !== "simple" && pending.visualMode !== "info") {
    return null;
  }
  if (pendingMine) {
    var grayBubbleStyle = {
      maxWidth: "min(80%, var(--dsh-chat-content-width, 748px))",
      background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.10))",
      borderRadius: "14px",
      padding: "8px 14px",
      fontSize: "var(--dsh-content-font-size, 14px)",
      lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
      cursor: "pointer",
      color: "var(--dsw-alias-label-tertiary)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    };
    var previewStyle = {
      color: "var(--dsw-alias-label-tertiary)",
      fontSize: "13px",
      lineHeight: "22px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    };
    var togglePreview = function(e) {
      e.stopPropagation();
      setShowPreview(!showPreview);
    };
    var origImages = null;
    if (showPreview && showOriginalImages()) {
      try {
        var refs = cachedEditMsg[myKey] && cachedEditMsg[myKey].attachRefs || [];
        if (refs.length > 0) {
          if (typeof props.renderMessageImages === "function") {
            var imgs = refs.map(function(r2) {
              return { attachment: r2 };
            });
            origImages = React11.createElement(
              "div",
              { key: "orig-images", onClick: togglePreview, style: { cursor: "pointer" } },
              renderMessageImagesCompat(imgs, props)
            );
          } else if (typeof props.loadImage === "function") {
            origImages = React11.createElement(
              "div",
              { key: "orig-images-self", onClick: togglePreview, style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", cursor: "pointer" } },
              refs.map(function(r3, ri3) {
                return React11.createElement(PendingOriginalImage, { key: ri3, ref: r3, loadImage: props.loadImage });
              })
            );
          }
        }
      } catch (eOi) {
        origImages = null;
      }
    }
    return React11.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", padding: "2px 0" }, "data-dsh-easyrewrite": "user-pending" },
      showPreview ? origImages : null,
      showPreview ? React11.createElement(
        "div",
        {
          className: "dsh-easyrewrite-bubble",
          style: grayBubbleStyle,
          title: L.collapse,
          onClick: togglePreview
        },
        text || L.emptyMsg
      ) : React11.createElement(
        "div",
        {
          className: "dsh-easyrewrite-bubble",
          style: grayBubbleStyle,
          title: L.viewOriginal,
          onClick: togglePreview
        },
        L.greyText
      )
    );
  }
  function enterEdit(initWidth, initHeight) {
    if (pending) {
      log("warn", "edit", "\u5DF2\u6709\u5F85\u5904\u7406\u64CD\u4F5C\uFF08\u5355\u5F85\u5B9A\u7EA6\u675F\uFF09\uFF0C\u8BF7\u5148\u5904\u7406");
      return;
    }
    var realSeq = data && typeof data.seq === "number" ? data.seq : anchorSeq;
    writePending(sessionId, { type: "edit", targetKey: myKey, targetSeq: realSeq, draftText: text, updatedAt: Date.now() });
    bubbleInitSizeState[1]({ w: initWidth && initWidth > 0 ? initWidth : 0, h: initHeight && initHeight > 0 ? initHeight : 0 });
    setEditing(true);
    setEditText(text);
    setEditSel(null);
    stagedBottomImageIdsRef.current = [];
    stagedBottomFilesRef.current = [];
    log("info", "edit", "\u8FDB\u5165\u7F16\u8F91\u6001", { sessionId, targetSeq: realSeq, initW: initWidth, initH: initHeight });
    try {
      var _epc = contentParts(data.content);
      var _rawAtts = _epc && Array.isArray(_epc.attachments) ? _epc.attachments : [];
      var initialItems = [];
      for (var _ai = 0; _ai < _rawAtts.length; _ai++) {
        var _entry = _rawAtts[_ai];
        var _att = _entry && _entry.attachment;
        if (!_att) continue;
        var _isFile = _entry.type === "file" || _att && !isImageFileName(_att.name);
        initialItems.push({
          id: _att.attachmentId || (_isFile ? "file-" : "img-") + _ai + "-" + Date.now(),
          name: _att.name || (_isFile ? "file" : "image.png"),
          size: typeof _att.bytes === "number" ? _att.bytes : _att.size || 0,
          type: _att.mediaType || (_isFile ? guessMimeType(_att.name) : "image/png"),
          url: "",
          isFile: _isFile,
          file: null,
          attachment: _att
        });
      }
      editImagesRef.current = initialItems;
      setEditImages(initialItems);
      if (initialItems.length > 0) {
        log("info", "edit", "enterEdit \u9644\u4EF6\u5DE5\u4F5C\u96C6\u5DF2\u540C\u6B65\u5C31\u7EEA", { count: initialItems.length });
        (async function() {
          for (var bi2 = 0; bi2 < initialItems.length; bi2++) {
            var curItem = initialItems[bi2];
            try {
              var resolvedFile = await resolveAttachmentFile(sessionId, curItem, props);
              var previewUrl = curItem.url || "";
              if (!curItem.isFile) {
                if (resolvedFile instanceof File) {
                  var dList = createDraftImagesCompat([resolvedFile], sessionId);
                  if (dList && dList.length > 0 && dList[0].previewUrl) {
                    previewUrl = dList[0].previewUrl;
                  } else {
                    previewUrl = createTrackedObjectUrl(resolvedFile);
                  }
                } else {
                  var fallbackUrl = await resolveImageCompat(sessionId, curItem.attachment, props);
                  if (fallbackUrl) previewUrl = fallbackUrl;
                }
              }
              if (resolvedFile instanceof File || previewUrl) {
                if (resolvedFile instanceof File) curItem.file = resolvedFile;
                if (previewUrl) curItem.url = previewUrl;
                setEditImages(function(prev) {
                  var nxt = prev.map(function(x) {
                    if (x.id !== curItem.id) return x;
                    return Object.assign({}, x, {
                      file: resolvedFile instanceof File ? resolvedFile : x.file,
                      url: previewUrl || x.url
                    });
                  });
                  editImagesRef.current = nxt;
                  return nxt;
                });
              }
            } catch (eBr) {
              log("warn", "edit", "enterEdit \u5355\u4E2A\u9644\u4EF6\u89E3\u6790\u5F02\u5E38", { id: curItem.id, err: String(eBr && eBr.message ? eBr.message : eBr) });
            }
          }
        })();
      }
    } catch (eEe) {
    }
  }
  function cancelEdit() {
    if (isEditPending) writePending(sessionId, null);
    setEditing(false);
    log("info", "edit", "\u7F16\u8F91\u53D6\u6D88\uFF08\u539F\u6837\u4E0D\u53D8\uFF09");
  }
  var editInFlightRef = React11.useRef(false);
  async function confirmEdit() {
    if (editInFlightRef.current) return;
    editInFlightRef.current = true;
    setPrimaryButtonSendingState(true);
    try {
      var newText = editText;
      var sid = sessionId;
      var realSeq = data2 && typeof data2.seq === "number" ? data2.seq : anchorSeq;
      var activeEditItems = editImagesRef.current && editImagesRef.current.length > 0 ? editImagesRef.current.slice() : editImages.slice();
      var editImgIds = activeEditItems.map(function(x) {
        return x.id;
      });
      var msel = editSel || (props.modelSel ? props.modelSel.capture(sid) : null);
      var bDraftText = "";
      try {
        bDraftText = readCurrentComposerText("");
      } catch (eBT) {
      }
      var bImgIds = [];
      try {
        bImgIds = getInputImageIdsCompat(props.inputState);
      } catch (eBImgs) {
      }
      if (bImgIds.length === 0 && stagedBottomImageIdsRef.current.length > 0) {
        bImgIds = stagedBottomImageIdsRef.current.slice();
      }
      var bottomFiles = [];
      try {
        bottomFiles = await extractBottomDraftFiles(sid, bImgIds, props, stagedBottomFilesRef.current);
      } catch (eExBf) {
        log("warn", "edit", "\u63D0\u53D6\u5E95\u90E8\u8349\u7A3F\u6587\u4EF6\u5F02\u5E38", { err: String(eExBf && eExBf.message ? eExBf.message : eExBf) });
      }
      var stagedDraftPayload = bDraftText || bottomFiles && bottomFiles.length > 0 || bImgIds && bImgIds.length > 0 ? {
        text: bDraftText,
        imageIds: bImgIds,
        hasFiles: bottomFiles.length > 0
      } : null;
      setEditing(false);
      log("info", "edit", "\u786E\u5B9A\uFF1A\u7F16\u8F91\u91CD\u53D1", { sessionId: sid, targetSeq: realSeq, len: newText.length, hasStaged: !!stagedDraftPayload });
      var resp = await fetch("/bubble/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, targetSeq: realSeq })
      });
      var data2 = await resp.json();
      var isNoBoundaryEdit = false;
      if (!data2 || !data2.ok) {
        var errCode2 = data2 && data2.error || "unknown";
        log("warn", "edit", "\u7F16\u8F91\u91CD\u53D1\u8FB9\u754C\u8FD4\u56DE\u975E\u666E\u901A\u5206\u652F", { error: errCode2 });
        if (errCode2 === "no-boundary") {
          isNoBoundaryEdit = true;
        } else if (errCode2 === "turn-open") {
          setPrimaryButtonSendingState(false);
          setEditing(true);
          setOpError(L.turnOpenNotice || L.errGeneric);
          setTimeout(function() {
            setOpError(null);
          }, 5e3);
          return;
        } else {
          setPrimaryButtonSendingState(false);
          setEditing(true);
          setOpError(L.errGeneric);
          setTimeout(function() {
            setOpError(null);
          }, 5e3);
          return;
        }
      }
      try {
        fetch("/bubble/vault/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, summary: "\u7F16\u8F91\u91CD\u53D1\u524D\u5B8C\u6574\u5FEB\u7167" }),
          keepalive: true
        }).catch(function() {
        });
      } catch (eVs) {
      }
      var newId = null;
      if (isNoBoundaryEdit) {
        newId = await createBlankChildSession(sid, props);
        if (!newId) {
          log("error", "edit", "\u9996\u6761\u6D88\u606F\u521B\u5EFA\u7A7A\u767D\u65B0\u4F1A\u8BDD\u5931\u8D25\uFF08\u7F16\u8F91\u91CD\u53D1\u4E2D\u6B62\uFF09");
          setPrimaryButtonSendingState(false);
          setEditing(true);
          setOpError(L.errGeneric);
          setTimeout(function() {
            setOpError(null);
          }, 5e3);
          return;
        }
      } else {
        try {
          newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: data2.boundary });
        } catch (e) {
          var emEdit = String(e && e.message ? e.message : e);
          log("error", "edit", "fork \u5931\u8D25", { err: emEdit });
          if (/has no completed turn to fork from/i.test(emEdit)) {
            newId = await createBlankChildSession(sid, props);
            if (!newId) {
              setPrimaryButtonSendingState(false);
              setEditing(true);
              setOpError(L.errGeneric);
              setTimeout(function() {
                setOpError(null);
              }, 5e3);
              return;
            }
          } else {
            setPrimaryButtonSendingState(false);
            setEditing(true);
            setOpError(/has not completed the turn/i.test(emEdit) ? L.turnOpenNotice || L.errGeneric : L.errGeneric);
            setTimeout(function() {
              setOpError(null);
            }, 5e3);
            return;
          }
        }
      }
      await requestCleanGhostQueue(newId);
      var editAttachRefs = [];
      try {
        var outgoingFiles = [];
        for (var ofi = 0; ofi < activeEditItems.length; ofi++) {
          var it = activeEditItems[ofi];
          if (!it) continue;
          if (it.attachment && typeof it.attachment.attachmentId === "string") {
            editAttachRefs.push({
              attachmentId: it.attachment.attachmentId,
              mediaType: it.attachment.mediaType || it.type || "",
              name: it.attachment.name || it.name || (it.isFile ? "file" : "image.png"),
              isFile: !!it.isFile
            });
          }
          if (it.file instanceof File) {
            outgoingFiles.push(it.file);
          } else {
            try {
              var fallbackFile = await resolveAttachmentFile(sid, it, props);
              if (fallbackFile && fallbackFile instanceof File) {
                it.file = fallbackFile;
                outgoingFiles.push(fallbackFile);
              }
            } catch (eFf) {
            }
          }
        }
        if (outgoingFiles.length > 0) stageOutgoingFiles(newId, outgoingFiles);
      } catch (eOf) {
      }
      if (bottomFiles && bottomFiles.length > 0) {
        stageBottomDraftFiles(newId, bottomFiles);
      }
      try {
        localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({
          draftText: newText,
          t: Date.now(),
          imageIds: editImgIds,
          attachRefs: editAttachRefs,
          sel: msel,
          stagedDraft: stagedDraftPayload
        }));
      } catch (e) {
      }
      var opened2 = safeOpenSession(newId, props);
      if (!opened2) {
        log("error", "edit", "\u6253\u5F00\u65B0\u4F1A\u8BDD\u5931\u8D25\uFF0C\u56DE\u6EDA\u72B6\u6001", { newId });
        try {
          localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId);
        } catch (e) {
        }
        setPrimaryButtonSendingState(false);
        setEditing(true);
        setOpError(L.errGeneric);
        return;
      }
      try {
        fetch("/bubble/vault/retire-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, replacementSessionId: newId }),
          keepalive: true
        }).catch(function() {
        });
      } catch (eRet) {
        log("warn", "edit", "\u79FB\u5165\u5F71\u5B50\u4ED3\u50A8\u5931\u8D25", { err: String(eRet && eRet.message ? eRet : eRet) });
      }
      log("info", "edit", "\u7F16\u8F91\u91CD\u53D1\uFF1A\u6253\u5F00\u65B0\u4F1A\u8BDD + \u539F\u4F1A\u8BDD\u79FB\u5165\u5F71\u5B50\u4ED3\u50A8", { newId });
      if (isEditPending) writePending(sid, null);
    } catch (err) {
      log("error", "edit", "\u7F16\u8F91\u91CD\u53D1\u8BF7\u6C42\u5931\u8D25", { err: String(err && err.message ? err.message : err) });
      setPrimaryButtonSendingState(false);
      setEditing(true);
    } finally {
      editInFlightRef.current = false;
    }
  }
  function onBubbleClick(e) {
    if (editing || confirming) return;
    if (!rewriteOnClick()) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && typeof sel.toString === "function" && sel.toString().length > 0) return;
    if (e.target && typeof e.target.closest === "function" && e.target.closest("a")) return;
    var el = e.currentTarget;
    enterEdit(el ? el.offsetWidth : 0, el ? el.offsetHeight : 0);
  }
  if (editing) {
    var editMode = editWidthMode();
    try {
      if (typeof document !== "undefined" && document.querySelector("style[data-dsh-easyrewrite-dz]") === null) {
        var dzSt = document.createElement("style");
        dzSt.setAttribute("data-dsh-easyrewrite-dz", "1");
        dzSt.textContent = "@keyframes dshEasyRewriteDzFadeIn{0%{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){[data-easyrewrite-dropzone-overlay]{animation:none}}";
        document.head.appendChild(dzSt);
      }
    } catch (eDzSt) {
    }
    var safetyW = calcBtnRowMinWidth(L.cancel, L.confirm);
    var editBoxW = editWidthFor(editMode, editText, bubbleInitSize.w, safetyW);
    var lineCount = (editText.match(/\n/g) || []).length + 1;
    var taRows = Math.max(1, Math.min(100, lineCount));
    var editBoxStyle = {
      width: "100%",
      maxWidth: editBoxW,
      minHeight: bubbleInitSize.h > 0 ? bubbleInitSize.h + "px" : void 0,
      boxSizing: "border-box",
      position: "relative",
      background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
      borderRadius: "14px",
      padding: "8px 14px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: "6px"
    };
    var taStyle = {
      width: "100%",
      flex: "1 1 auto",
      border: "none",
      outline: "none",
      background: "transparent",
      resize: "none",
      font: "inherit",
      fontSize: "var(--dsh-content-font-size, 14px)",
      lineHeight: "calc(22px + var(--dsh-content-font-delta, 0px))",
      color: "var(--dsw-alias-label-primary)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "70vh",
      overflowY: "auto"
    };
    var btnRowStyle = { display: "flex", justifyContent: "flex-end", gap: "8px" };
    var primaryBtnStyle = {
      border: "none",
      background: "var(--dsw-static-deepseek-500, #4d6bfe)",
      color: "#ffffff",
      borderRadius: "999px",
      padding: "4px 16px",
      fontSize: "13px",
      cursor: "pointer",
      whiteSpace: "nowrap"
    };
    var ghostBtnStyle = {
      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
      background: "transparent",
      color: "var(--dsw-alias-label-secondary)",
      borderRadius: "999px",
      padding: "4px 16px",
      fontSize: "13px",
      cursor: "pointer",
      whiteSpace: "nowrap"
    };
    var pcEd = contentParts(data.content);
    var editImgs = pcEd && pcEd.images ? pcEd.images : [];
    return React11.createElement(
      "div",
      {
        style: rowStyle,
        "data-dsh-easyrewrite": "user-editing",
        onDrop: function(e) {
          e.preventDefault();
          e.stopPropagation();
          try {
            var dt = e.dataTransfer;
            var rawFiles = [];
            if (dt && dt.files) {
              for (var di = 0; di < dt.files.length; di++) {
                if (dt.files[di]) rawFiles.push(dt.files[di]);
              }
            }
            var dragged = getDraggedAttachment();
            if (rawFiles.length === 0 && dragged) {
              if (dragged.file instanceof File) rawFiles.push(dragged.file);
            }
            if (rawFiles.length === 0) return;
            if (dragged && dragged.id && editImagesRef.current.some(function(x) {
              return x.id === dragged.id;
            })) {
              return;
            }
            var imgFiles = [];
            var nonImgFiles = [];
            for (var fi = 0; fi < rawFiles.length; fi++) {
              var df = rawFiles[fi];
              if (isImageFile(df)) imgFiles.push(df);
              else nonImgFiles.push(df);
            }
            var addedItems = [];
            if (imgFiles.length > 0) {
              var dImgs = createDraftImagesCompat(imgFiles, sessionId);
              var newImgs = dImgs.map(function(im, idx) {
                return { id: im.id, url: im.previewUrl, file: imgFiles[idx] };
              });
              addedItems = addedItems.concat(newImgs);
            }
            if (nonImgFiles.length > 0) {
              var newFiles = nonImgFiles.map(function(nf) {
                return {
                  id: "file-" + Math.random().toString(36).slice(2) + "-" + Date.now(),
                  name: nf.name || "file",
                  size: nf.size || 0,
                  type: nf.type || guessMimeType(nf.name),
                  dataUrl: null,
                  isFile: true,
                  file: nf
                };
              });
              addedItems = addedItems.concat(newFiles);
            }
            if (addedItems.length > 0) {
              setEditImages(function(prev) {
                var nxt = prev.concat(addedItems);
                editImagesRef.current = nxt;
                syncEditImgsToPending(nxt);
                return nxt;
              });
              log("info", "edit", "\u62D6\u5165\u9644\u4EF6\u5DF2\u52A0\u5165\u7F16\u8F91", { count: addedItems.length });
            }
            clearDraggedAttachment();
          } catch (eDr) {
            log("warn", "edit", "\u62D6\u5165\u5904\u7406\u5F02\u5E38", { err: String(eDr && eDr.message ? eDr.message : eDr) });
            clearDraggedAttachment();
          }
        },
        onDragOver: function(e) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      (function() {
        var dzShow = dzActive;
        var hasImgs = editImages.length > 0;
        if (!hasImgs && !dzShow) return null;
        var dzGrey = "rgba(128,128,128,0.45)";
        var dzBlue = "var(--dsw-static-deepseek-500, #4d6bfe)";
        var dzBorder = 3, dzPadX = 11, dzGap = 6;
        var dzFixedUsual = Math.max(44, Math.floor((360 - 2 * dzBorder - 3 * dzGap) / 4));
        var dzFixedDrag = Math.max(44, Math.floor((360 - 2 * dzBorder - 2 * dzPadX - 3 * dzGap) / 4));
        var dzThumbUsual = editMode === "extended" || editMode === "custom" ? dzFixedUsual : Math.max(44, Math.floor((editBoxW - 2 * dzBorder - 3 * dzGap) / 4));
        var dzThumbDrag = editMode === "extended" || editMode === "custom" ? dzFixedDrag : Math.max(44, Math.floor((editBoxW - 2 * dzBorder - 2 * dzPadX - 3 * dzGap) / 4));
        var thumbSize = dzShow ? dzThumbDrag : dzThumbUsual;
        var dzMinH = !hasImgs ? dzThumbDrag + 16 : void 0;
        return React11.createElement(
          "div",
          {
            "data-easyrewrite-dropzone": "1",
            style: {
              position: "relative",
              width: "100%",
              maxWidth: editBoxW,
              boxSizing: "border-box",
              display: "flex",
              flexWrap: "wrap",
              gap: dzGap + "px",
              alignItems: "flex-start",
              padding: dzShow ? "5px " + dzPadX + "px" : "0px",
              marginBottom: "6px",
              minHeight: dzMinH,
              borderRadius: "16px",
              border: dzBorder + "px dashed " + (dzShow ? dzOver ? dzBlue : dzGrey : "transparent"),
              transition: "border-color .12s ease, padding .15s ease"
            }
          },
          editImages.map(function(ei, eiIdx) {
            if (ei.isFile) {
              return React11.createElement(
                "div",
                {
                  key: ei.id,
                  draggable: true,
                  "data-easyrewrite-file-card": "1",
                  style: {
                    position: "relative",
                    boxSizing: "border-box",
                    width: thumbSize + "px",
                    height: thumbSize + "px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                    background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 4px",
                    gap: "4px",
                    textAlign: "center",
                    overflow: "hidden",
                    transition: "width .15s ease, height .15s ease",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    MozUserSelect: "none",
                    cursor: "grab"
                  },
                  title: ei.name || "\u6587\u4EF6",
                  onDragStart: function(e) {
                    handleAttachmentDragStart(e, ei, sessionId, props);
                  },
                  onDragEnd: function(e) {
                    handleAttachmentDragEnd(e);
                  }
                },
                React11.createElement(
                  "div",
                  { style: { flex: "none", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } },
                  renderFileTypeIcon(ei.name, 28)
                ),
                React11.createElement("span", {
                  style: {
                    width: "100%",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    fontSize: "11px",
                    lineHeight: "14px",
                    fontWeight: 500,
                    color: "var(--dsw-alias-label-primary)",
                    textAlign: "center",
                    padding: "0 2px",
                    userSelect: "none",
                    pointerEvents: "none"
                  }
                }, ei.name || "file"),
                React11.createElement("button", {
                  type: "button",
                  onClick: function(ev) {
                    ev.stopPropagation();
                    var nxtRm = editImagesRef.current.filter(function(x) {
                      return x.id !== ei.id;
                    });
                    editImagesRef.current = nxtRm;
                    setEditImages(nxtRm);
                    syncEditImgsToPending(nxtRm);
                  },
                  style: {
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.55)",
                    color: "#fff",
                    fontSize: "12px",
                    lineHeight: "18px",
                    textAlign: "center",
                    cursor: "pointer",
                    padding: "0"
                  },
                  title: "\u79FB\u9664\u6587\u4EF6"
                }, "\xD7")
              );
            }
            return React11.createElement(
              "div",
              {
                key: ei.id,
                draggable: true,
                "data-easyrewrite-img-card": "1",
                style: {
                  position: "relative",
                  boxSizing: "border-box",
                  width: thumbSize + "px",
                  height: thumbSize + "px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                  transition: "width .15s ease, height .15s ease",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  MozUserSelect: "none",
                  cursor: "grab"
                },
                onDragStart: function(e) {
                  handleAttachmentDragStart(e, ei, sessionId, props);
                },
                onDragEnd: function(e) {
                  handleAttachmentDragEnd(e);
                }
              },
              ei.url ? React11.createElement("img", { src: ei.url, draggable: false, style: { width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" } }) : React11.createElement("div", { style: { width: "100%", height: "100%", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))" } }),
              React11.createElement("button", { type: "button", onClick: function(ev) {
                ev.stopPropagation();
                var nxtRm = editImagesRef.current.filter(function(x) {
                  return x.id !== ei.id;
                });
                editImagesRef.current = nxtRm;
                setEditImages(nxtRm);
                syncEditImgsToPending(nxtRm);
              }, style: { position: "absolute", top: "2px", right: "2px", width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "12px", lineHeight: "18px", textAlign: "center", cursor: "pointer", padding: "0" }, title: "\u79FB\u9664\u56FE\u7247" }, "\xD7")
            );
          }),
          dzShow ? React11.createElement(
            "div",
            {
              "data-easyrewrite-dropzone-overlay": "1",
              style: {
                position: "absolute",
                inset: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "13px",
                background: dzOver ? "rgba(77,107,254,0.10)" : "rgba(128,128,128,0.06)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                pointerEvents: "none",
                zIndex: 5,
                boxSizing: "border-box",
                animation: "dshEasyRewriteDzFadeIn 0.16s ease-out",
                transition: "background-color .12s ease"
              }
            },
            React11.createElement(
              "div",
              { style: { color: dzOver ? dzBlue : "rgba(128,128,128,0.85)", fontSize: "13px", lineHeight: "20px", fontWeight: 500, padding: "0 12px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } },
              editMode === "compact" ? L.dzCompact : L.dzFull
            )
          ) : null
        );
      })(),
      React11.createElement(
        "div",
        { style: editBoxStyle },
        hasUnpreservable ? React11.createElement("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-warning, #b7791f)", marginBottom: "6px", lineHeight: "1.5" } }, L.attachWarning) : null,
        opError ? React11.createElement("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-error, #d9534f)", marginBottom: "6px", lineHeight: "1.5" } }, opError) : null,
        React11.createElement("textarea", {
          ref: function(taEl) {
            if (taEl && !taEl.__autoHeightDone) {
              taEl.__autoHeightDone = true;
              taEl.style.height = "auto";
              taEl.style.height = Math.max(taEl.scrollHeight, 24) + "px";
            }
          },
          value: editText,
          rows: taRows,
          autoFocus: true,
          placeholder: L.emptyMsg,
          style: taStyle,
          onChange: function(e) {
            setEditText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          },
          onKeyDown: function(e) {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancelEdit();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              confirmEdit();
            }
          },
          onPaste: function(e) {
            try {
              var items = e.clipboardData ? e.clipboardData.items : [];
              var imgFiles = [];
              for (var pi = 0; pi < items.length; pi++) {
                if (items[pi].type && items[pi].type.indexOf("image") === 0) {
                  var pf = items[pi].getAsFile();
                  if (pf) imgFiles.push(pf);
                }
              }
              if (imgFiles.length > 0) {
                e.preventDefault();
                var pImgs = createDraftImagesCompat(imgFiles, sessionId);
                if (pImgs && pImgs.length > 0) {
                  var newItems = pImgs.map(function(im, idx) {
                    return { id: im.id, url: im.previewUrl, dataUrl: null, file: imgFiles[idx] };
                  });
                  setEditImages(function(prev) {
                    var nxt = prev.concat(newItems);
                    editImagesRef.current = nxt;
                    syncEditImgsToPending(nxt);
                    return nxt;
                  });
                  imgFiles.forEach(function(f, fIdx) {
                    var targetItem = newItems[fIdx];
                    if (targetItem) {
                      fileToDataUrl(f).then(function(du) {
                        targetItem.dataUrl = du;
                        setEditImages(function(prev2) {
                          var nxt2 = prev2.map(function(x) {
                            return x.id === targetItem.id ? Object.assign({}, x, { dataUrl: du }) : x;
                          });
                          editImagesRef.current = nxt2;
                          syncEditImgsToPending(nxt2);
                          return nxt2;
                        });
                      }).catch(function() {
                      });
                    }
                  });
                }
              }
            } catch (pe) {
            }
          }
        }),
        React11.createElement(
          "div",
          { style: btnRowStyle },
          props.modelDirectories || getModelDirectories() ? React11.createElement(EditModelPicker, { sessionId, modelDirectories: props.modelDirectories || getModelDirectories(), selection: editSel, onChange: setEditSel }) : null,
          React11.createElement(
            "div",
            { style: { display: "flex", gap: "8px", marginLeft: "auto" } },
            React11.createElement("button", { type: "button", style: ghostBtnStyle, onClick: function(e) {
              e.stopPropagation();
              cancelEdit();
            } }, L.cancel),
            React11.createElement("button", { type: "button", style: primaryBtnStyle, onClick: function(e) {
              e.stopPropagation();
              confirmEdit();
            } }, L.confirm)
          )
        )
      ),
      React11.createElement(
        "div",
        { style: actionsStyle },
        actionButton("\u64A4\u56DE", "\u64A4\u56DE", function(e) {
          e.stopPropagation();
          if (isEditPending) writePending(sessionId, null);
          setEditing(false);
          setConfirming(true);
        }, iconImg(ICONS.recall, "\u64A4\u56DE"), "recall-key")
      )
    );
  }
  var timeStyle = {
    color: "var(--dsw-alias-label-tertiary)",
    whiteSpace: "nowrap",
    fontSize: "14px",
    lineHeight: "24px",
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    paddingRight: "4px"
  };
  var pc = contentParts(data.content);
  var msgImages = pc && pc.images ? pc.images : [];
  var msgFiles = pc && pc.files ? pc.files : [];
  var hasTextContent = typeof text === "string" && text.trim().length > 0;
  var hasAttachments = msgImages.length > 0 || msgFiles.length > 0;
  var shouldRenderBubble = hasTextContent || !hasAttachments;
  return React11.createElement(
    "div",
    { style: rowStyle, "data-dsh-easyrewrite": "user", "data-preview-size": pSize, "data-time-hover-root": true },
    renderMessageAttachmentsCompat(pc, props, pSize),
    shouldRenderBubble ? React11.createElement(
      "div",
      { className: "dsh-easyrewrite-bubble", style: bubbleStyle, onClick: onBubbleClick, title: L.clickEdit },
      text || L.emptyMsg
    ) : null,
    confirming ? React11.createElement(ConfirmCapsule, {
      text: afterCount === 0 ? L.recallText0 : onlyUser ? L.recallTextQ.replace("{n}", String(afterCount)) : L.recallTextC.replace("{n}", String(afterCount)),
      onConfirm: async function() {
        setConfirming(false);
        var conflictMode = draftConflictMode();
        var visualMode = recallVisualMode();
        var realSeq = data && typeof data.seq === "number" ? data.seq : anchorSeq;
        var rcAt = [];
        try {
          if (data && Array.isArray(data.content)) {
            for (var rcAi = 0; rcAi < data.content.length; rcAi++) {
              var rcAb = data.content[rcAi];
              if (rcAb && (rcAb.type === "image" || rcAb.type === "file") && rcAb.attachment && typeof rcAb.attachment.attachmentId === "string") {
                rcAt.push({
                  attachmentId: rcAb.attachment.attachmentId,
                  mediaType: rcAb.attachment.mediaType || "",
                  name: rcAb.attachment.name || (rcAb.type === "image" ? "image.png" : "file"),
                  isFile: rcAb.type === "file"
                });
              }
            }
          }
        } catch (e) {
        }
        var userOrigDraft = draftRef && typeof draftRef.current === "string" ? draftRef.current : "";
        if (!userOrigDraft && props && props.inputActions) {
          try {
            userOrigDraft = readCurrentComposerText("", props);
          } catch (eText) {
          }
        }
        var preUserImageIds = [];
        try {
          preUserImageIds = getInputImageIdsCompat(props.inputState);
        } catch (e) {
        }
        var userOrigFiles = [];
        try {
          userOrigFiles = await extractBottomDraftFiles(sessionId, preUserImageIds, props, []);
        } catch (eExBf) {
          log("warn", "recall", "\u63D0\u53D6\u539F\u8349\u7A3F\u9644\u4EF6\u6587\u4EF6\u5931\u8D25", { err: String(eExBf) });
        }
        if (userOrigFiles && userOrigFiles.length > 0) {
          stageRecallOriginalFiles(sessionId, userOrigFiles);
        } else {
          clearRecallOriginalFiles(sessionId);
        }
        writePending(sessionId, {
          type: "recall",
          targetKey: myKey,
          targetSeq: realSeq,
          draftText: text,
          originalDraft: userOrigDraft,
          hasOriginalFiles: !!(userOrigFiles && userOrigFiles.length > 0),
          conflictMode,
          visualMode,
          attachRefs: rcAt,
          preUserImageIds,
          updatedAt: Date.now()
        });
        var ia = props.inputActions;
        try {
          pruneInputImagesCompat(ia, []);
        } catch (ePrune) {
        }
        if (ia && typeof ia.setDraft === "function") {
          ia.setDraft(text);
        }
        try {
          if (rcAt.length > 0) {
            rebuildDraftAttachments(rcAt, props, sessionId, true).then(function(n) {
              log("info", "attach", "\u64A4\u56DE\u786E\u8BA4\u540E\u8F93\u5165\u6846\u56FE\u9884\u89C8\u91CD\u5EFA", { count: n, total: rcAt.length });
            });
          }
        } catch (e) {
          log("warn", "attach", "\u64A4\u56DE\u786E\u8BA4\u56FE\u5F62\u9884\u89C8\u91CD\u5EFA\u5931\u8D25", { err: String(e && e.message ? e.message : e) });
        }
        log("info", "recall", "pending set\uFF08\u53D1\u9001\u65F6\u6267\u884C\u771F\u6B63\u64A4\u56DE\uFF09", { sessionId, targetSeq: realSeq, mode: conflictMode, visual: visualMode });
      },
      onCancel: function() {
        setConfirming(false);
      }
    }) : React11.createElement(
      "div",
      { style: actionsStyle },
      React11.createElement("span", { className: "dbe-time", style: timeStyle }, formatClock(msgTime)),
      // 撤回键：rewrite 关闭且二级「关闭时显示撤回键」也关闭 → 隐藏
      !rewriteOnClick() && !editOffShowRecall() ? null : actionButton("\u64A4\u56DE", "\u64A4\u56DE", async function(e) {
        e.stopPropagation();
        if (pending && pending.type === "recall") {
          log("warn", "recall", "\u5DF2\u6709\u5F85\u5904\u7406\u64A4\u56DE\uFF08\u5355\u5F85\u5B9A\u7EA6\u675F\uFF09");
          return;
        }
        if (pending && pending.type === "edit") {
          writePending(sessionId, null);
        }
        if (recallConfirmEnabled()) {
          setConfirming(true);
        } else {
          var cMode = draftConflictMode();
          var vMode = recallVisualMode();
          var rSeq = data && typeof data.seq === "number" ? data.seq : anchorSeq;
          var rcAt2 = [];
          try {
            if (data && Array.isArray(data.content)) {
              for (var rcAi2 = 0; rcAi2 < data.content.length; rcAi2++) {
                var rcAb2 = data.content[rcAi2];
                if (rcAb2 && (rcAb2.type === "image" || rcAb2.type === "file") && rcAb2.attachment && typeof rcAb2.attachment.attachmentId === "string") {
                  rcAt2.push({
                    attachmentId: rcAb2.attachment.attachmentId,
                    mediaType: rcAb2.attachment.mediaType || "",
                    name: rcAb2.attachment.name || (rcAb2.type === "image" ? "image.png" : "file"),
                    isFile: rcAb2.type === "file"
                  });
                }
              }
            }
          } catch (eRc) {
          }
          var userOrigDraft2 = draftRef && typeof draftRef.current === "string" ? draftRef.current : "";
          if (!userOrigDraft2 && props && props.inputActions) {
            try {
              userOrigDraft2 = readCurrentComposerText("", props);
            } catch (eText2) {
            }
          }
          var preUserImageIds2 = [];
          try {
            preUserImageIds2 = getInputImageIdsCompat(props.inputState);
          } catch (ePre) {
          }
          var userOrigFiles2 = [];
          try {
            userOrigFiles2 = await extractBottomDraftFiles(sessionId, preUserImageIds2, props, []);
          } catch (eExBf2) {
            log("warn", "recall", "\u63D0\u53D6\u539F\u8349\u7A3F\u9644\u4EF6\u6587\u4EF6\u5931\u8D25", { err: String(eExBf2) });
          }
          if (userOrigFiles2 && userOrigFiles2.length > 0) {
            stageRecallOriginalFiles(sessionId, userOrigFiles2);
          } else {
            clearRecallOriginalFiles(sessionId);
          }
          writePending(sessionId, {
            type: "recall",
            targetKey: myKey,
            targetSeq: rSeq,
            draftText: text,
            originalDraft: userOrigDraft2,
            hasOriginalFiles: !!(userOrigFiles2 && userOrigFiles2.length > 0),
            conflictMode: cMode,
            visualMode: vMode,
            attachRefs: rcAt2,
            preUserImageIds: preUserImageIds2,
            updatedAt: Date.now()
          });
          var ia2 = props.inputActions;
          try {
            pruneInputImagesCompat(ia2, []);
          } catch (ePrune2) {
          }
          if (ia2 && typeof ia2.setDraft === "function") {
            ia2.setDraft(text);
          }
          try {
            if (rcAt2.length > 0) {
              rebuildDraftAttachments(rcAt2, props, sessionId, true).then(function(n) {
                log("info", "attach", "\u76F4\u63A5\u64A4\u56DE\u540E\u8F93\u5165\u6846\u56FE\u9884\u89C8\u91CD\u5EFA", { count: n, total: rcAt2.length });
              });
            }
          } catch (eAt2) {
            log("warn", "attach", "\u76F4\u63A5\u64A4\u56DE\u56FE\u5F62\u9884\u89C8\u91CD\u5EFA\u5931\u8D25", { err: String(eAt2 && eAt2.message ? eAt2.message : eAt2) });
          }
          log("info", "recall", "pending set\uFF08\u786E\u8BA4\u5173\u95ED\uFF0C\u76F4\u63A5\u5F85\u5B9A\uFF09", { targetSeq: rSeq });
        }
      }, iconImg(ICONS.recall, L.recall), "recall-key"),
      // 编辑键：rewrite 关闭时显示（与撤回键同时）
      rewriteOnClick() ? null : actionButton("\u7F16\u8F91", "\u7F16\u8F91", function(e) {
        e.stopPropagation();
        enterEdit(e.currentTarget ? e.currentTarget.offsetWidth : 0);
      }, iconImg(ICONS.edit, "\u7F16\u8F91")),
      React11.createElement(CopyButton, { text })
    )
  );
}

// src/features/bubble/theme.js
var FILE_CARD_SELECTOR = "[data-dsh-easyrewrite-file-card], .dsh-easyrewrite-file-card, [data-easyrewrite-file-card], [data-easyrewrite-img-card], [class*='_card'][class*='FileCard'], div[class*='gSkjMW_card']";
function installGlobalFileCardDragSupport() {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  if (typeof window.__dshEasyRewriteCardDragDispose === "function") {
    try {
      window.__dshEasyRewriteCardDragDispose();
    } catch (eDisp) {
    }
  }
  try {
    var pollutedCards = document.querySelectorAll("[data-composer-card][draggable]");
    for (var pci = 0; pci < pollutedCards.length; pci++) {
      pollutedCards[pci].removeAttribute("draggable");
    }
  } catch (eClean) {
  }
  window.__dshEasyRewriteCardDragInstalled = true;
  var onMouseDown = function(e) {
    try {
      var target = e.target;
      if (!target || typeof target.closest !== "function") return;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable || target.closest("textarea, input, [contenteditable='true']")) return;
      var card = target.closest(FILE_CARD_SELECTOR);
      if (card) {
        if (card.hasAttribute("data-composer-card") || card.querySelector("textarea, input, [contenteditable='true']")) return;
        if (target.tagName === "BUTTON" || target.closest("button")) return;
        if (!card.getAttribute("draggable")) card.setAttribute("draggable", "true");
      }
    } catch (eMd) {
    }
  };
  document.addEventListener("mousedown", onMouseDown, true);
  var onDragStart = function(e) {
    try {
      var target = e.target;
      var card = target && target.closest ? target.closest(FILE_CARD_SELECTOR) : null;
      if (!card || card.hasAttribute("data-composer-card")) return;
      var name = card.getAttribute("title") || "";
      if (!name) {
        var nameEl = card.querySelector("[class*='_name'], .dsh-easyrewrite-file-card span, [data-easyrewrite-file-card] span");
        if (nameEl) name = (nameEl.textContent || "").trim();
      }
      var foundFile = null;
      try {
        var conv = serviceRefs.conversation;
        if (conv && conv.draftAttachments && typeof conv.draftAttachments.forEach === "function") {
          conv.draftAttachments.forEach(function(att) {
            if (!foundFile && att && att.file instanceof File && (att.file.name === name || !name)) {
              foundFile = att.file;
            }
          });
        }
      } catch (eConv) {
      }
      if (!foundFile) {
        for (var sid in cachedRebuiltFiles) {
          var fList = cachedRebuiltFiles[sid];
          if (Array.isArray(fList)) {
            for (var fi = 0; fi < fList.length; fi++) {
              if (fList[fi] && fList[fi].name === name) {
                foundFile = fList[fi];
                break;
              }
            }
          }
          if (foundFile) break;
        }
      }
      setDraggedAttachment({
        name: name || "file",
        file: foundFile,
        isFile: true,
        id: "drag-" + Date.now()
      });
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("application/x-dsh-easyrewrite-file", JSON.stringify({ name: name || "file", isFile: true }));
        e.dataTransfer.setData("text/plain", name || "file");
        if (foundFile instanceof File && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          try {
            var u = URL.createObjectURL(foundFile);
            e.dataTransfer.setData("text/uri-list", u);
            var mime = foundFile.type || "application/octet-stream";
            e.dataTransfer.setData("DownloadURL", mime + ":" + (name || "file") + ":" + u);
            setTimeout(function() {
              try {
                URL.revokeObjectURL(u);
              } catch (eU) {
              }
            }, 6e4);
          } catch (eBlob) {
          }
        }
      }
    } catch (eDs) {
    }
  };
  document.addEventListener("dragstart", onDragStart, true);
  var onDragEnd = function() {
    clearDraggedAttachment();
  };
  document.addEventListener("dragend", onDragEnd, true);
  window.__dshEasyRewriteCardDragDispose = function() {
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("dragstart", onDragStart, true);
    document.removeEventListener("dragend", onDragEnd, true);
  };
}
function injectThemeStyle() {
  installGlobalFileCardDragSupport();
  var id = "dsh-easyrewrite-theme";
  if (document.querySelector('style[data-plugin="' + id + '"]') !== null) return null;
  var tag = document.createElement("style");
  tag.dataset.plugin = id;
  tag.textContent = `[data-dsh-easyrewrite] .dbe-icon-img{transition:filter .15s}body[data-ds-dark-theme] [data-dsh-easyrewrite] .dbe-icon-img{filter:invert(1)}@media (hover:hover){[data-dsh-easyrewrite][data-time-hover-root] .dbe-time{opacity:0;transition:opacity 80ms}[data-dsh-easyrewrite][data-time-hover-root]:hover .dbe-time,[data-dsh-easyrewrite][data-time-hover-root]:focus-within .dbe-time{opacity:1}}[data-dsh-easyrewrite="recall-bar"] .dbe-recall-x:hover .dbe-recall-x-bg{fill:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,0.28))}[data-dsh-easyrewrite="recall-bar"] .dbe-recall-x:hover .dbe-recall-x-glyph{stroke:var(--dsw-alias-label-primary)}[data-dsh-easyrewrite="version-pager"] .dbe-pager-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14));color:var(--dsw-alias-label-primary)}[data-dsh-easyrewrite-file-card],.dsh-easyrewrite-file-card,[data-easyrewrite-file-card],[data-easyrewrite-img-card],[class*='_card'][class*='FileCard'],div[class*='gSkjMW_card']{user-select:none!important;-webkit-user-select:none!important;-moz-user-select:none!important;cursor:grab!important}[data-dsh-easyrewrite-file-card] *,.dsh-easyrewrite-file-card *,[data-easyrewrite-file-card] *,[data-easyrewrite-img-card] *,div[class*='gSkjMW_card'] *{user-select:none!important;-webkit-user-select:none!important;-moz-user-select:none!important}[data-dsh-easyrewrite-file-card]:active,.dsh-easyrewrite-file-card:active,[data-easyrewrite-file-card]:active,[data-easyrewrite-img-card]:active,div[class*='gSkjMW_card']:active{cursor:grabbing!important}`;
  document.head.appendChild(tag);
  return tag;
}

// src/features/bubble/index.js
function BubbleSettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    rowStyle,
    labelStyle,
    hintStyle,
    inputStyle,
    disabledInputStyle,
    switchRow,
    segmentedGroup
  } = styles;
  const [rewrite, setRewrite] = React12.useState(rewriteOnClick());
  const [showRecall, setShowRecall] = React12.useState(editOffShowRecall());
  const [widthMode, setWidthMode] = React12.useState(editWidthMode());
  const [customW, setCustomW] = React12.useState(String(editWidthCustom()));
  if (props && props.view === "summary") {
    return L.rowBubbleDesc || "\u652F\u6301\u539F\u5730\u70B9\u51FB\u6C14\u6CE1\u7F16\u8F91\u3001\u8C03\u6574\u7F16\u8F91\u6846\u5BBD\u5EA6\u3001\u56FE\u7247\u62D6\u5165\u4E0E\u9644\u4EF6\u4FDD\u7559\u3002";
  }
  return React12.createElement(
    "div",
    {
      style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
      "data-dsh-easyrewrite": "bubble-settings"
    },
    React12.createElement(
      "div",
      { style: sectionStyle },
      React12.createElement("span", { style: groupTitleStyle }, L.rowBubbleTitle || L.sectionEdit),
      switchRow(L.rewrite, rewrite, (v) => {
        setRewrite(v);
        setBool("dsh-easyrewrite:rewriteOnClick", v);
      }),
      switchRow(L.editOffShowRecall, showRecall, (v) => {
        setShowRecall(v);
        setBool("dsh-easyrewrite:editOffShowRecall", v);
      }, rewrite ? L.lockedHint : null, rewrite),
      React12.createElement(
        "div",
        { style: groupStyle },
        React12.createElement("span", { style: labelStyle }, L.editWidth),
        segmentedGroup([
          ["compact", L.wCompact],
          ["standard", L.wStandard],
          ["extended", L.wExtended],
          ["custom", L.wCustom]
        ], widthMode, (v) => {
          setWidthMode(v);
          setSetting("dsh-easyrewrite:editWidth", v);
        }),
        React12.createElement(
          "div",
          { style: rowStyle },
          React12.createElement("span", { style: labelStyle }, L.customWidth),
          React12.createElement("input", {
            type: "number",
            min: 100,
            max: 1200,
            style: widthMode === "custom" ? inputStyle : disabledInputStyle,
            disabled: widthMode !== "custom",
            placeholder: L.placeholderCustom,
            value: customW,
            onChange: (e) => {
              setCustomW(e.target.value);
              const num = parseInt(e.target.value, 10);
              if (!isNaN(num) && num >= 100 && num <= 1200) {
                setSetting("dsh-easyrewrite:editWidthCustom", String(num));
              }
            }
          })
        )
      )
    ),
    React12.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}
function registerBubble(ctx) {
  const disposers = [];
  const styleTag = injectThemeStyle();
  const modelSel = createModelSel(ctx);
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject(
      "conversation.chat.node",
      () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "user",
        priority: -1,
        inject: (sessionId) => {
          let inputShell2 = null;
          try {
            if (sessionId && ctx.sessions && typeof ctx.sessions.scope === "function") {
              const scope2 = ctx.sessions.scope(sessionId);
              const conv2 = (scope2 && typeof scope2.get === "function" ? scope2.get("conversation") : null) || ctx.conversation;
              if (conv2 && conv2.input && typeof conv2.input.for === "function") {
                inputShell2 = conv2.input.for(scope2);
              }
            }
          } catch (eSh2) {
            inputShell2 = null;
          }
          const resolvedActions2 = inputShell2 && inputShell2.actions ? inputShell2.actions : inputShell2 && (typeof inputShell2.setDraft === "function" || typeof inputShell2.submit === "function") ? inputShell2 : null;
          const injected2 = {
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxWorkspaces: ctx.workspaces,
            ctxSessions: ctx.sessions,
            modelSel,
            modelDirectories: ctx.modelDirectories || getModelDirectories(),
            inputState: inputShell2,
            restoreSession: (id) => {
              return fetch("/bubble/unarchive", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: id }),
                keepalive: true
              }).then((r) => r.json()).then((d) => {
                log("debug", "reset", "\u6062\u590D\u5B8C\u6210\uFF08unarchive\uFF09", { sessionId: id, ok: !!(d && d.ok) });
                return !!(d && d.ok);
              }).catch(() => false);
            }
          };
          if (resolvedActions2) injected2.inputActions = resolvedActions2;
          return injected2;
        }
      }, UserBubbleView)
    );
    if (typeof d1 === "function") disposers.push(d1);
    const d2 = ctx.slots.inject(
      "plugins.row.config",
      () => ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#bubble" },
        BubbleSettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }
  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
    if (typeof window !== "undefined" && typeof window.__dshEasyRewriteCardDragDispose === "function") {
      try {
        window.__dshEasyRewriteCardDragDispose();
      } catch (e) {
      }
    }
    if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
  };
}

// src/features/recall/index.js
var React14 = __toESM(require("react"), 1);

// src/features/recall/hotkey.js
var HOTKEY_KEY = "dsh-easyrewrite:hotkey";
var HOTKEY_ENABLED_KEY = "dsh-easyrewrite:hotkeyEnabled";
var hotkeyCaptureActive = false;
function setHotkeyCaptureActive(v) {
  hotkeyCaptureActive = v;
}
function hotkeyEnabledSetting() {
  return getBool(HOTKEY_ENABLED_KEY, false);
}
function setHotkeyEnabledSetting(v) {
  setBool(HOTKEY_ENABLED_KEY, v);
}
function hotkeySetting() {
  try {
    var v = localStorage.getItem(HOTKEY_KEY);
    if (v && /^((ctrl|meta|alt|shift)\+)+(key[a-z0-9]|digit[0-9]|f[0-9]{1,2}|arrow(left|right|up|down)|space|enter|escape|backspace|delete|tab|numpad[0-9]+)$/.test(v)) return v;
  } catch (e) {
  }
  return "";
}
function setHotkeySetting(combo) {
  try {
    localStorage.setItem(HOTKEY_KEY, combo);
  } catch (e) {
  }
}
function keydownCombo(e) {
  var parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  var code = String(e.code || "").toLowerCase();
  if (!code || code.indexOf("control") === 0 || code.indexOf("meta") === 0 || code.indexOf("alt") === 0 || code.indexOf("shift") === 0) return null;
  if (parts.length === 0) return null;
  parts.push(code);
  return parts.join("+");
}
function keydownMatches(e, combo) {
  if (!combo) return false;
  var parts = combo.split("+");
  var wantCtrl = parts.indexOf("ctrl") >= 0;
  var wantMeta = parts.indexOf("meta") >= 0;
  var wantAlt = parts.indexOf("alt") >= 0;
  var wantShift = parts.indexOf("shift") >= 0;
  if (String(e.code || "").toLowerCase() !== parts[parts.length - 1]) return false;
  if (!!e.ctrlKey !== wantCtrl) return false;
  if (!!e.metaKey !== wantMeta) return false;
  if (!!e.altKey !== wantAlt) return false;
  if (!!e.shiftKey !== wantShift) return false;
  return true;
}
function formatHotkey(combo) {
  if (!combo) return "";
  var parts = combo.split("+");
  var names = parts.slice(0, -1).map(function(p) {
    if (p === "ctrl") return "Ctrl";
    if (p === "meta") return "\u2318";
    if (p === "alt") return "Alt";
    if (p === "shift") return "Shift";
    return p;
  });
  var code = parts[parts.length - 1] || "";
  var keyName = code;
  if (/^key[a-z]$/.test(code)) keyName = code.slice(3).toUpperCase();
  else if (/^digit[0-9]$/.test(code)) keyName = code.slice(5);
  else if (code === "arrowleft") keyName = "\u2190";
  else if (code === "arrowright") keyName = "\u2192";
  else if (code === "arrowup") keyName = "\u2191";
  else if (code === "arrowdown") keyName = "\u2193";
  else if (/^f([0-9]{1,2})$/.test(code)) keyName = code.toUpperCase();
  else if (/^numpad/.test(code)) keyName = code.slice(6);
  else if (code === "space") keyName = "Space";
  else if (code === "enter") keyName = "Enter";
  else if (code === "escape") keyName = "Esc";
  else if (code === "backspace") keyName = "Backspace";
  else if (code === "delete") keyName = "Del";
  else if (code === "tab") keyName = "Tab";
  else keyName = code.replace(/^key/, "").toUpperCase();
  return names.concat([keyName]).join("+");
}

// src/features/recall/banner.js
var React13 = __toESM(require("react"), 1);

// src/features/recall/tune.js
var barTune = { inset: null, size: null, radius: null, bg: null };
function barApplyCircTune(xCirc) {
  if (!xCirc) return;
  try {
    if (barTune.size !== null) {
      xCirc.style.width = barTune.size + "px";
      xCirc.style.height = barTune.size + "px";
      var svgEl = xCirc.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("width", String(barTune.size));
        svgEl.setAttribute("height", String(barTune.size));
        svgEl.setAttribute("viewBox", "0 0 " + barTune.size + " " + barTune.size);
      }
    }
  } catch (eT) {
  }
}
function barDiagnose() {
  var hits = [];
  try {
    for (var si = 0; si < document.styleSheets.length; si++) {
      var sheet = document.styleSheets[si];
      var rules;
      try {
        rules = sheet.cssRules;
      } catch (eC) {
        continue;
      }
      if (!rules) continue;
      for (var ri = 0; ri < rules.length; ri++) {
        var t = rules[ri].cssText || "";
        if (t.indexOf("dbe-recall-x") !== -1 && t.indexOf("radius") !== -1) hits.push("sheet" + si + ": " + t.slice(0, 220));
      }
    }
  } catch (eD) {
    hits.push("ERR: " + (eD && eD.message));
  }
  var out = { hits };
  try {
    var c = document.querySelector(".dbe-recall-x-circ");
    if (c) {
      var cs = getComputedStyle(c);
      out.computed = { borderRadius: cs.borderRadius, width: cs.width, height: cs.height, display: cs.display, boxSizing: cs.boxSizing };
    } else out.computed = "circ \u4E0D\u5728 DOM";
  } catch (eG) {
    out.computed = "ERR: " + (eG && eG.message);
  }
  return out;
}

// src/features/recall/banner.js
function RecallBanner(props) {
  var sessionId = props.sessionId;
  var L = useUILocaleDict();
  var pending = usePending(sessionId);
  var active = pending && pending.type === "recall";
  var sendingRef = React13.useRef(false);
  var barRef = React13.useRef(null);
  React13.useEffect(function() {
    if (!active) return;
    var scrollEl = document.querySelector("[data-input-scroll]");
    if (!scrollEl || !scrollEl.parentNode) return;
    var bar = document.createElement("div");
    barRef.current = bar;
    bar.setAttribute("data-dsh-easyrewrite", "recall-bar");
    bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:0;padding:2px 0 6px;";
    var label = document.createElement("span");
    label.style.cssText = "font-size:15.4px;color:var(--dsw-alias-label-secondary);line-height:24.2px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));border-radius:999px;padding:1.1px 13.2px;";
    var spacer = document.createElement("div");
    spacer.style.cssText = "flex:1;";
    label.textContent = L.modifying;
    var xBtn = document.createElement("button");
    xBtn.type = "button";
    xBtn.title = L.cancelRecall;
    xBtn.setAttribute("aria-label", L.cancelRecall);
    xBtn.className = "dbe-recall-x";
    xBtn.style.cssText = "border:none;cursor:pointer;transform:translateY(-1px);padding:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;flex:none;";
    var xCirc = document.createElement("span");
    xCirc.className = "dbe-recall-x-circ";
    xCirc.style.cssText = "position:relative;width:22px;height:22px;display:block;pointer-events:none;";
    var NSX = "http://www.w3.org/2000/svg";
    var xSvg = document.createElementNS(NSX, "svg");
    xSvg.setAttribute("width", "22");
    xSvg.setAttribute("height", "22");
    xSvg.setAttribute("viewBox", "0 0 26.4 26.4");
    xSvg.style.cssText = "display:block;width:100%;height:100%;";
    var xCircleEl = document.createElementNS(NSX, "circle");
    xCircleEl.setAttribute("cx", "13.2");
    xCircleEl.setAttribute("cy", "13.2");
    xCircleEl.setAttribute("r", "13.2");
    xCircleEl.setAttribute("class", "dbe-recall-x-bg");
    xCircleEl.setAttribute("fill", "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14))");
    xSvg.appendChild(xCircleEl);
    var xGlyph = document.createElementNS(NSX, "g");
    xGlyph.setAttribute("class", "dbe-recall-x-glyph");
    xGlyph.setAttribute("stroke", "var(--dsw-alias-label-secondary)");
    xGlyph.setAttribute("stroke-width", "2.2");
    xGlyph.setAttribute("stroke-linecap", "round");
    var l1 = document.createElementNS(NSX, "line");
    l1.setAttribute("x1", "8.2");
    l1.setAttribute("y1", "8.2");
    l1.setAttribute("x2", "18.2");
    l1.setAttribute("y2", "18.2");
    var l2 = document.createElementNS(NSX, "line");
    l2.setAttribute("x1", "18.2");
    l2.setAttribute("y1", "8.2");
    l2.setAttribute("x2", "8.2");
    l2.setAttribute("y2", "18.2");
    xGlyph.appendChild(l1);
    xGlyph.appendChild(l2);
    xSvg.appendChild(xGlyph);
    xCirc.appendChild(xSvg);
    xBtn.appendChild(xCirc);
    xBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      var ia = props.inputActions;
      var origText = pending && typeof pending.originalDraft === "string" ? pending.originalDraft : "";
      if (ia && typeof ia.setDraft === "function") {
        ia.setDraft(origText);
      }
      try {
        pruneInputImagesCompat(ia, []);
      } catch (ePrune) {
        log("warn", "recall", "\xD7 pruneImages \u5931\u8D25", { err: String(ePrune && ePrune.message ? ePrune.message : ePrune) });
      }
      clearPendingAttachIds();
      var origFiles = getRecallOriginalFiles(sessionId);
      if (origFiles && origFiles.length > 0) {
        try {
          restoreDraftFilesCompat(ia, origFiles, sessionId);
          log("info", "recall", "\xD7 \u53D6\u6D88\u64A4\u56DE\uFF1A\u539F\u8349\u7A3F\u9644\u4EF6\u5DF2\u6210\u529F\u6062\u590D", { count: origFiles.length });
        } catch (eRest) {
          log("warn", "recall", "\xD7 \u53D6\u6D88\u64A4\u56DE\u6062\u590D\u9644\u4EF6\u5931\u8D25", { err: String(eRest && eRest.message ? eRest.message : eRest) });
        }
      }
      clearRecallOriginalFiles(sessionId);
      writePending(sessionId, null);
      log("info", "recall", "pending cancelled\uFF08\u6062\u590D\u539F\u8349\u7A3F+\u6062\u590D\u539F\u9644\u4EF6\uFF09");
    });
    bar.appendChild(label);
    bar.appendChild(spacer);
    bar.appendChild(xBtn);
    var cardEl = null;
    try {
      cardEl = document.querySelector('[data-composer-card="true"]') || null;
    } catch (e) {
    }
    function placeBar() {
      try {
        var cEl = document.querySelector('[data-composer-card="true"]') || null;
        if (!cEl || !cEl.parentNode) return;
        if (bar.parentNode !== cEl.parentNode) cEl.parentNode.insertBefore(bar, cEl);
        var cr = cEl.getBoundingClientRect();
        bar.style.width = cr.width + "px";
        bar.style.boxSizing = "border-box";
        var TUNE_WITH_IMG = -7;
        var TUNE_TEXT_ONLY = -16;
        var inset = 16;
        try {
          var firstImg = cEl.querySelector("img");
          var cRect = cEl.getBoundingClientRect();
          var anchor = null, tune = null;
          if (firstImg) {
            anchor = firstImg.getBoundingClientRect().left - cRect.left;
            tune = TUNE_WITH_IMG;
          } else {
            anchor = parseFloat(getComputedStyle(cEl).borderTopLeftRadius) || 16;
            tune = TUNE_TEXT_ONLY;
          }
          if (anchor !== null) inset = Math.max(0, anchor + (barTune.inset !== null ? barTune.inset : tune));
        } catch (eR) {
        }
        bar.style.paddingLeft = inset + "px";
        bar.style.paddingRight = inset + "px";
        barApplyCircTune(bar.querySelector(".dbe-recall-x-circ"));
      } catch (e) {
      }
    }
    placeBar();
    var onBarTune = function() {
      try {
        placeBar();
      } catch (eBT) {
      }
    };
    document.addEventListener("dsh-easyrewrite:bar-tune", onBarTune);
    var onWinResize = function() {
      try {
        placeBar();
      } catch (e) {
      }
    };
    window.addEventListener("resize", onWinResize);
    var mo = null;
    try {
      mo = new MutationObserver(function() {
        try {
          placeBar();
        } catch (e) {
        }
      });
      var obCard = cardEl || (document.querySelector('[data-composer-card="true"]') || null);
      if (obCard) mo.observe(obCard, { childList: true, subtree: true });
    } catch (e) {
    }
    return function() {
      try {
        if (mo) mo.disconnect();
      } catch (e) {
      }
      try {
        document.removeEventListener("dsh-easyrewrite:bar-tune", onBarTune);
      } catch (eBT2) {
      }
      try {
        window.removeEventListener("resize", onWinResize);
      } catch (e4) {
      }
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      barRef.current = null;
    };
  }, [active, sessionId, pending]);
  var backupRecovered = React13.useRef({});
  React13.useEffect(function() {
    if (backupRecovered.current[sessionId]) return;
    var local = readPending(sessionId);
    if (local) return;
    backupRecovered.current[sessionId] = true;
    try {
      fetch("/bubble/backup/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
        keepalive: true
      }).then(function(resp) {
        return resp.json();
      }).then(function(data) {
        if (data && data.ok && data.pending) {
          var age = Date.now() - (typeof data.pending.updatedAt === "number" ? data.pending.updatedAt : 0);
          if (age > 24 * 3600 * 1e3) {
            log("warn", "backup", "\u5907\u4EFD\u9648\u65E7\uFF08>24h\uFF09\uFF0C\u8DF3\u8FC7\u6062\u590D", { sessionId, ageMs: age });
            return;
          }
          writePending(sessionId, data.pending);
          if (data.pending.type === "recall" && props.inputActions && typeof props.inputActions.setDraft === "function") {
            props.inputActions.setDraft(data.pending.draftText);
          }
          log("info", "backup", "\u5F02\u5E38\u9000\u51FA\u6062\u590D\uFF1A\u4ECE\u6587\u4EF6\u5907\u4EFD\u6062\u590D\u8349\u7A3F", { sessionId, type: data.pending.type });
        }
      }).catch(function() {
      });
    } catch (e) {
    }
  }, [sessionId]);
  var lastBackupMetaRef = React13.useRef({});
  React13.useEffect(function() {
    if (!active || !pending) return;
    var meta = lastBackupMetaRef.current[sessionId] || (lastBackupMetaRef.current[sessionId] = { time: 0, updatedAt: 0 });
    function backupNow() {
      try {
        var currentUpdatedAt = pending.updatedAt || 0;
        meta.time = Date.now();
        meta.updatedAt = currentUpdatedAt;
        fetch("/bubble/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, pending }),
          keepalive: true
        }).catch(function(e) {
          log("warn", "backup", "\u81EA\u52A8\u5907\u4EFD\u8BF7\u6C42\u5931\u8D25", { err: String(e && e.message ? e.message : e) });
        });
      } catch (e) {
      }
    }
    var timer = setInterval(function() {
      var age = Date.now() - (pending.updatedAt || 0);
      if (age >= 1e4 && Date.now() - meta.time >= 5e3 && pending.updatedAt !== meta.updatedAt) {
        backupNow();
      }
    }, 1e3);
    return function() {
      clearInterval(timer);
    };
  }, [active, pending, sessionId]);
  var hiddenRows = React13.useRef(/* @__PURE__ */ new Set());
  function applyHideAfter(list, targetKey) {
    var rows = list.querySelectorAll("[data-chat-anchor-key]");
    var started = false;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!started) {
        if (row.dataset && row.dataset.chatAnchorKey === targetKey) {
          started = true;
        }
        continue;
      }
      if (!hiddenRows.current.has(row)) {
        row.style.display = "none";
        hiddenRows.current.add(row);
      }
    }
  }
  function restoreHiddenRows() {
    hiddenRows.current.forEach(function(el) {
      el.style.display = "";
    });
    hiddenRows.current.clear();
  }
  React13.useEffect(function() {
    if (!active || !pending) return;
    var mode = pending.visualMode || "minimal";
    if (mode !== "minimal" && mode !== "simple") return;
    var list = document.querySelector("[data-chat-flow]");
    if (!list) return;
    applyHideAfter(list, pending.targetKey);
    var mo = new MutationObserver(function() {
      applyHideAfter(list, pending.targetKey);
    });
    mo.observe(list, { childList: true, subtree: true });
    return function() {
      mo.disconnect();
      restoreHiddenRows();
    };
  }, [active, pending, sessionId]);
  React13.useEffect(function() {
    try {
      var binding = props.ctxSessions && typeof props.ctxSessions.binding === "function" ? props.ctxSessions.binding(sessionId) : null;
      var sess = binding ? binding.session : null;
      if (!sess) return;
      var lastReported = null;
      var checkPromptErr = function() {
        try {
          var snap = typeof sess.getSnapshot === "function" ? sess.getSnapshot() : null;
          var pe = snap && snap.promptError ? snap.promptError.error : null;
          if (pe && pe !== lastReported) {
            lastReported = pe;
            var reason = pe.details && pe.details.reason ? pe.details.reason : pe.message || pe.code;
            log("error", "recall", "Host promptError \u8BE6\u7EC6\u62E6\u622A", {
              code: pe.code,
              message: pe.message,
              reason,
              details: pe.details
            });
            showRecallError("\u53D1\u9001\u88AB\u62D2: " + String(reason));
          }
        } catch (eSnap) {
        }
      };
      var unsub = typeof sess.subscribe === "function" ? sess.subscribe(checkPromptErr) : null;
      checkPromptErr();
      return function() {
        if (typeof unsub === "function") unsub();
      };
    } catch (eSub) {
    }
  }, [sessionId, props.ctxSessions]);
  function showRecallError(text) {
    try {
      var scrollEl = document.querySelector("[data-input-scroll]");
      if (!scrollEl || !scrollEl.parentNode) return;
      var bar = document.createElement("div");
      bar.setAttribute("data-dsh-easyrewrite", "recall-error");
      bar.textContent = text;
      bar.style.cssText = "margin:0 16px;padding:4px 10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d9534f);background:var(--dsw-alias-bg-l2,rgba(128,128,128,0.08));border-radius:8px;";
      scrollEl.parentNode.insertBefore(bar, scrollEl);
      setTimeout(function() {
        try {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
        } catch (e) {
        }
      }, 3500);
    } catch (e) {
    }
  }
  function computeRecallBoundary(props2, targetSeq) {
    try {
      if (!hasChatSnapshot(props2)) return null;
      var snapshot = getChatSnapshot(props2);
      if (!snapshot || !Array.isArray(snapshot.order) || !snapshot.nodes || typeof snapshot.nodes.get !== "function") return null;
      var order = snapshot.order;
      var tIdx = -1;
      for (var i = 0; i < order.length; i++) {
        var nd = snapshot.nodes.get(order[i]);
        if (!nd || nd.kind !== "user") continue;
        var sq = nd.data && typeof nd.data.seq === "number" ? nd.data.seq : typeof nd.anchorSeq === "number" ? nd.anchorSeq : -1;
        if (sq === targetSeq) {
          tIdx = i;
          break;
        }
      }
      if (tIdx === -1) return null;
      for (var k = tIdx - 1; k >= 0; k--) {
        var n2 = snapshot.nodes.get(order[k]);
        if (!n2 || n2.kind !== "turn-tail") continue;
        var cl = n2.data && n2.data.closing;
        if (cl && cl.finalNode && typeof cl.finalNode.seq === "number") return { atSeq: cl.finalNode.seq };
        if (n2.data && typeof n2.data.seq === "number") return { atSeq: n2.data.seq };
      }
      var hasMore = snapshot.hasMore === true;
      return hasMore ? { code: "host-fallback" } : { code: "no-boundary" };
    } catch (e) {
      log("warn", "recall", "\u672C\u5730\u8FB9\u754C\u8BA1\u7B97\u5F02\u5E38", { err: String(e && e.message ? e.message : e) });
      return null;
    }
  }
  async function doRecallThenSend(p) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setPrimaryButtonSendingState(true);
    try {
      if (barRef.current) {
        var labelEl = barRef.current.querySelector("span");
        if (labelEl) {
          labelEl.textContent = L.preparingSession || "\u6B63\u5728\u51C6\u5907\u65B0\u4F1A\u8BDD\u2026";
          labelEl.style.opacity = "0.75";
        }
      }
    } catch (eUi) {
    }
    try {
      var sid = props.sessionId;
      var sendText = readCurrentComposerText(p.draftText, props);
      var msel = props.modelSel ? props.modelSel.capture(sid) : null;
      log("info", "recall", "\u53D1\u9001\u5185\u5BB9\uFF08\u4FEE\u6539\u540E\uFF09", { sendLen: sendText.length, modelSel: !!msel });
      var outgoingFiles = collectOutgoingFiles(sid, props.inputState);
      var imgIds = getInputImageIdsCompat(props.inputState);
      log("info", "attach", "\u64A4\u56DE\u6536\u96C6\u5B8C\u6210\uFF08\u5F85\u53D1\u56FE\u7247\u4E0EID\uFF09", { fileCount: outgoingFiles.length, idCount: imgIds.length });
      var localB = computeRecallBoundary(props, p.targetSeq);
      var boundary = null;
      var isNoBoundary = false;
      if (localB && localB.atSeq) {
        boundary = localB.atSeq;
        log("info", "recall", "\u672C\u5730\u8FB9\u754C\u5C31\u7EEA", { targetSeq: p.targetSeq, atSeq: boundary });
      } else if (localB && localB.code === "no-boundary") {
        log("info", "recall", "\u672C\u5730\u5224\u5B9A\uFF1A\u9996\u6761\u65E0\u524D\u7F6E\u8FB9\u754C \u2192 \u521B\u5EFA\u540C\u5DE5\u4F5C\u533A\u7A7A\u767D\u65B0\u4F1A\u8BDD");
        isNoBoundary = true;
      } else {
        log("info", "recall", "\u672C\u5730\u4E0D\u53EF\u5224\u5B9A\uFF0C\u8D70 host \u8DEF\u7531", { mode: localB && localB.code });
        var resp = await fetch("/bubble/recall", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, targetSeq: p.targetSeq })
        });
        var data = await resp.json();
        if (!data || !data.ok) {
          var errCode = data && data.error || "unknown";
          log("warn", "recall", "\u64A4\u56DE\u8FB9\u754C\u8FD4\u56DE\u975E\u666E\u901A\u5206\u652F", { error: errCode });
          if (errCode === "no-boundary") {
            isNoBoundary = true;
          } else if (errCode === "turn-open") {
            showRecallError(L.turnOpenNotice || L.errGeneric);
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            return;
          } else {
            showRecallError(L.errGeneric);
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            return;
          }
        } else {
          boundary = data.boundary;
        }
      }
      try {
        fetch("/bubble/vault/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, summary: "\u64A4\u56DE\u524D\u5B8C\u6574\u5FEB\u7167" }),
          keepalive: true
        }).catch(function() {
        });
      } catch (eVs) {
      }
      var newId = null;
      if (isNoBoundary) {
        newId = await createBlankChildSession(sid, props);
        if (!newId) {
          log("error", "recall", "\u9996\u6761\u6D88\u606F\u521B\u5EFA\u7A7A\u767D\u65B0\u4F1A\u8BDD\u5931\u8D25\uFF08\u53D1\u9001\u4E2D\u6B62\uFF09");
          setPrimaryButtonSendingState(false);
          sendingRef.current = false;
          showRecallError(L.errGeneric);
          return;
        }
      } else {
        try {
          newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: boundary });
        } catch (e) {
          var em = String(e && e.message ? e.message : e);
          log("error", "recall", "fork \u5931\u8D25", { err: em });
          if (/has not completed the turn/i.test(em)) {
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            showRecallError(L.turnOpenNotice || L.errGeneric);
            return;
          } else if (/has no completed turn to fork from/i.test(em)) {
            newId = await createBlankChildSession(sid, props);
            if (!newId) {
              setPrimaryButtonSendingState(false);
              sendingRef.current = false;
              showRecallError(L.errGeneric);
              return;
            }
          } else {
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            showRecallError(L.errGeneric);
            return;
          }
        }
      }
      if (outgoingFiles.length > 0) {
        stageOutgoingFiles(newId, outgoingFiles);
      }
      var stagedUserFiles = getRecallOriginalFiles(sid);
      if (stagedUserFiles && stagedUserFiles.length > 0) {
        stageBottomDraftFiles(newId, stagedUserFiles);
      }
      clearRecallOriginalFiles(sid);
      var userOrigDraft = p && typeof p.originalDraft === "string" ? p.originalDraft : "";
      var stagedDraftPayload = userOrigDraft || stagedUserFiles && stagedUserFiles.length > 0 ? {
        text: userOrigDraft,
        imageIds: [],
        hasFiles: stagedUserFiles && stagedUserFiles.length > 0
      } : null;
      await requestCleanGhostQueue(newId);
      try {
        localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({
          draftText: sendText,
          t: Date.now(),
          imageIds: imgIds,
          attachRefs: p && Array.isArray(p.attachRefs) ? p.attachRefs : [],
          sel: msel,
          stagedDraft: stagedDraftPayload
        }));
      } catch (e) {
      }
      var opened = safeOpenSession(newId, props);
      if (!opened) {
        log("error", "recall", "\u6253\u5F00\u65B0\u4F1A\u8BDD\u5931\u8D25\uFF0C\u56DE\u6EDA\u72B6\u6001", { newId });
        try {
          localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId);
        } catch (e) {
        }
        setPrimaryButtonSendingState(false);
        sendingRef.current = false;
        showRecallError(L.errGeneric);
        return;
      }
      var retired = false;
      try {
        var retResp = await fetch("/bubble/vault/retire-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid, replacementSessionId: newId }),
          keepalive: true
        });
        var retData = await retResp.json();
        retired = !!(retData && retData.ok);
      } catch (eRet) {
        log("warn", "recall", "\u5F71\u5B50\u4ED3\u50A8\u79FB\u51FA\u4F1A\u8BDD\u5931\u8D25\uFF0C\u5C1D\u8BD5\u9759\u9ED8\u964D\u7EA7", { err: String(eRet && eRet.message ? eRet.message : eRet) });
      }
      log("info", "recall", "\u64A4\u56DE\u5B8C\u6210\uFF1A\u79FB\u5165\u5F71\u5B50\u4ED3\u50A8 + \u6253\u5F00\u65B0\u7248\u672C", { newId, retired });
      writePending(sid, null);
    } catch (err) {
      log("error", "recall", "\u64A4\u56DE\u8BF7\u6C42\u5931\u8D25\uFF08\u53D1\u9001\u4E2D\u6B62\uFF09", { err: String(err && err.message ? err.message : err) });
      setPrimaryButtonSendingState(false);
      sendingRef.current = false;
    }
  }
  React13.useEffect(function() {
    if (!active && !sendingRef.current) return;
    var p = pending;
    function onKeyDownCapture(e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      var el = document.querySelector("[data-input-scroll] [contenteditable='true'], [data-input-scroll] textarea, [data-composer-card='true'] [contenteditable='true'], [data-composer-card='true'] textarea, textarea");
      var isComposer = false;
      if (el) {
        isComposer = e.target === el || el.contains(e.target);
      } else if (e.target && (e.target.isContentEditable || e.target.tagName === "TEXTAREA")) {
        isComposer = true;
      }
      if (!isComposer) return;
      e.preventDefault();
      e.stopPropagation();
      if (sendingRef.current) return;
      if (p) doRecallThenSend(p);
    }
    function onClickCapture(e) {
      var btn = findPrimaryButton();
      if (!btn || !btn.contains(e.target)) return;
      if (isStopButton(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      if (sendingRef.current) return;
      if (p) doRecallThenSend(p);
    }
    document.addEventListener("keydown", onKeyDownCapture, true);
    document.addEventListener("click", onClickCapture, true);
    return function() {
      document.removeEventListener("keydown", onKeyDownCapture, true);
      document.removeEventListener("click", onClickCapture, true);
      setPrimaryButtonSendingState(false);
    };
  }, [active, sessionId, pending]);
  var resumeKey = "dsh-easyrewrite:resume-send:" + sessionId;
  React13.useEffect(function() {
    var raw = null;
    try {
      raw = localStorage.getItem(resumeKey);
    } catch (e) {
    }
    if (!raw) return;
    var r = null;
    try {
      r = JSON.parse(raw);
    } catch (e) {
    }
    if (!r || typeof r.draftText !== "string") {
      try {
        localStorage.removeItem(resumeKey);
      } catch (e2) {
      }
      log("warn", "recall", "resume \u6807\u8BB0\u635F\u574F\u5DF2\u6E05\u9664", { sessionId });
      return;
    }
    if (typeof r.t === "number" && Date.now() - r.t > 3e4) {
      try {
        localStorage.removeItem(resumeKey);
      } catch (e3) {
      }
      log("warn", "recall", "resume \u8FC7\u671F\uFF0830s TTL\uFF09\uFF0C\u4E0D\u81EA\u52A8\u53D1\u9001", { sessionId });
      return;
    }
    var tries = 0;
    var unmounted = false;
    var pendingTimeouts = [];
    function scheduleTimeout(fn, ms) {
      var tid = setTimeout(function() {
        if (!unmounted) fn();
      }, ms);
      pendingTimeouts.push(tid);
      return tid;
    }
    var timer = setInterval(function() {
      tries++;
      var ia = props.inputActions;
      if (!(ia && typeof ia.setDraft === "function" && typeof ia.submit === "function")) {
        if (tries >= 50) {
          clearInterval(timer);
          log("error", "recall", "resume \u653E\u5F03\uFF1Acomposer 5s \u672A\u5C31\u7EEA\uFF08\u6807\u8BB0\u4FDD\u7559\u5F85\u91CD\u8BD5\uFF09", { sessionId, tries });
        }
        return;
      }
      clearInterval(timer);
      try {
        localStorage.removeItem(resumeKey);
      } catch (e4) {
      }
      try {
        ia.setDraft(r.draftText);
        log("info", "recall", "resume\uFF1A\u56DE\u586B\u8349\u7A3F\u5E76\u81EA\u52A8\u53D1\u9001", { sessionId, tries, imgs: Array.isArray(r.imageIds) ? r.imageIds.length : 0, hasSel: !!(r.sel && props.modelSel) });
        var preparedAttachmentIds = [];
        var prepareImages = async function() {
          var stagedFiles = consumeStagedFiles(sessionId);
          if (stagedFiles && stagedFiles.length > 0) {
            try {
              var newDrafts = createDraftImagesCompat(stagedFiles, sessionId);
              if (newDrafts && newDrafts.length > 0) {
                var newIds = newDrafts.map(function(d) {
                  return d.id;
                });
                preparedAttachmentIds = newIds.slice();
                addInputImagesCompat(ia, newIds);
                log("info", "attach", "\u65B0\u4F1A\u8BDD\u8349\u7A3F\u9644\u4EF6\u5DF2\u91CD\u5EFA\u5E76\u586B\u5165", { count: newIds.length });
                await new Promise(function(res) {
                  setTimeout(res, 60);
                });
                return newIds;
              }
            } catch (eDrafts) {
              log("warn", "attach", "\u65B0\u4F1A\u8BDD\u8349\u7A3F\u9644\u4EF6\u521B\u5EFA\u5F02\u5E38", { err: String(eDrafts && eDrafts.message ? eDrafts.message : eDrafts) });
            }
          } else if (Array.isArray(r.attachRefs) && r.attachRefs.length > 0) {
            try {
              var cnt = await rebuildDraftAttachments(r.attachRefs, props, sessionId, false);
              log("info", "attach", "\u901A\u8FC7 attachRefs \u91CD\u5EFA\u5B8C\u6210", { count: cnt });
              await new Promise(function(res) {
                setTimeout(res, 60);
              });
            } catch (eRb) {
              log("warn", "attach", "\u901A\u8FC7 attachRefs \u91CD\u5EFA\u5931\u8D25", { err: String(eRb && eRb.message ? eRb.message : eRb) });
            }
          } else if (Array.isArray(r.imageIds) && r.imageIds.length > 0) {
            try {
              preparedAttachmentIds = r.imageIds.slice();
              addInputImagesCompat(ia, r.imageIds);
              await new Promise(function(res) {
                setTimeout(res, 60);
              });
            } catch (e) {
            }
          }
          return [];
        };
        var cleanGhostQueue = function() {
          return requestCleanGhostQueue(sessionId).then(function(hostRes) {
            if (hostRes && hostRes.cleared > 0) {
              log("info", "recall", "resume \u65F6 Host \u5E7D\u7075\u961F\u5217\u5DF2\u6E05\u7A7A", { sessionId, cleared: hostRes.cleared, ids: hostRes.removedIds });
            }
            try {
              var binding = props.ctxSessions && typeof props.ctxSessions.binding === "function" ? props.ctxSessions.binding(sessionId) : null;
              var sessInst = binding ? binding.session : null;
              var qItems = sessInst && typeof sessInst.getSnapshot === "function" ? sessInst.getSnapshot().queue : props.session && Array.isArray(props.session.queue) ? props.session.queue : [];
              var ghostItems = Array.isArray(qItems) ? qItems.filter(function(it) {
                return it && it.id;
              }) : [];
              if (ghostItems.length > 0) {
                log("info", "recall", "\u68C0\u6D4B\u5230 snapshot \u4E2D\u5B58\u5728\u5E7D\u7075\u961F\u5217\u9879\uFF0C\u5F00\u59CB\u5BA2\u6237\u7AEF\u6E05\u7406", {
                  sessionId,
                  count: ghostItems.length,
                  ids: ghostItems.map(function(it) {
                    return it.id;
                  })
                });
                var pList = [];
                for (var gi = 0; gi < ghostItems.length; gi++) {
                  var gId = ghostItems[gi].id;
                  if (sessInst && typeof sessInst.updateQueue === "function") {
                    try {
                      pList.push(sessInst.updateQueue(gId, { kind: "remove" }));
                    } catch (eUp) {
                      log("warn", "recall", "\u8C03\u7528 updateQueue \u5F02\u5E38", { id: gId, err: String(eUp && eUp.message ? eUp.message : eUp) });
                    }
                  } else if (typeof props.updateQueue === "function") {
                    try {
                      pList.push(props.updateQueue(gId, { kind: "remove" }));
                    } catch (eUp2) {
                      log("warn", "recall", "\u8C03\u7528 props.updateQueue \u5F02\u5E38", { id: gId, err: String(eUp2 && eUp2.message ? eUp2.message : eUp2) });
                    }
                  }
                }
                if (pList.length > 0) {
                  return Promise.allSettled(pList).then(function() {
                    log("info", "recall", "\u5BA2\u6237\u7AEF snapshot \u5E7D\u7075\u961F\u5217\u9879\u6E05\u7406\u5B8C\u6210", { count: pList.length });
                  });
                }
              }
            } catch (eClean) {
              log("warn", "recall", "\u6E05\u7406\u5BA2\u6237\u7AEF\u5E7D\u7075\u961F\u5217\u5F02\u5E38\uFF08\u7EE7\u7EED\u53D1\u9001\uFF09", { err: String(eClean && eClean.message ? eClean.message : eClean) });
            }
            return Promise.resolve();
          });
        };
        var doSubmit = function() {
          cleanGhostQueue().then(function() {
            var waitCount = 0;
            var uploadWaitCount = 0;
            var submitWhenReady = function() {
              try {
                var binding = props.ctxSessions && typeof props.ctxSessions.binding === "function" ? props.ctxSessions.binding(sessionId) : null;
                var sessInst = binding ? binding.session : null;
                var snap = sessInst && typeof sessInst.getSnapshot === "function" ? sessInst.getSnapshot() : null;
                if (snap && snap.running && waitCount < 8) {
                  waitCount++;
                  log("debug", "recall", "\u7B49\u5F85\u65B0\u4F1A\u8BDD Agent \u5C31\u7EEA", { sessionId, waitCount });
                  scheduleTimeout(submitWhenReady, 100);
                  return;
                }
                var conv = serviceRefs.conversation;
                if (conv && conv.fileUploads && typeof conv.fileUploads.getSnapshot === "function") {
                  var upSnap = conv.fileUploads.getSnapshot() || {};
                  var checkIds = preparedAttachmentIds.length > 0 ? preparedAttachmentIds : getInputImageIdsCompat(props.inputState);
                  var hasUploading = typeof conv.activeFileUploads === "number" && conv.activeFileUploads > 0;
                  if (!hasUploading && checkIds && checkIds.length > 0) {
                    for (var ui = 0; ui < checkIds.length; ui++) {
                      var uEntry = upSnap[checkIds[ui]];
                      if (uEntry && uEntry.status === "uploading") {
                        hasUploading = true;
                        break;
                      }
                    }
                  }
                  if (hasUploading && uploadWaitCount < 50) {
                    uploadWaitCount++;
                    log("debug", "recall", "\u7B49\u5F85\u65B0\u4F1A\u8BDD\u6587\u4EF6\u8349\u7A3F\u4E0A\u4F20\u5C31\u7EEA", { sessionId, uploadWaitCount });
                    scheduleTimeout(submitWhenReady, 100);
                    return;
                  }
                }
                ia.submit();
                log("info", "recall", "resume \u5DF2\u63D0\u4EA4", { sessionId, waitCount, uploadWaitCount });
                if (r.stagedDraft && (r.stagedDraft.text || Array.isArray(r.stagedDraft.imageIds) && r.stagedDraft.imageIds.length > 0 || r.stagedDraft.hasFiles)) {
                  scheduleTimeout(function() {
                    try {
                      var stg = r.stagedDraft;
                      if (typeof stg.text === "string" && stg.text.length > 0 && typeof ia.setDraft === "function") {
                        ia.setDraft(stg.text);
                      }
                      var bFiles = consumeBottomDraftFiles(sessionId);
                      if (bFiles && bFiles.length > 0) {
                        try {
                          var restored = false;
                          if (typeof restoreDraftFilesCompat === "function") {
                            restored = restoreDraftFilesCompat(ia, bFiles, sessionId);
                          }
                          if (!restored) {
                            var bDrafts = createDraftImagesCompat(bFiles, sessionId);
                            if (bDrafts && bDrafts.length > 0) {
                              var bDraftIds = bDrafts.map(function(d) {
                                return d.id;
                              });
                              addInputImagesCompat(ia, bDraftIds);
                            }
                          }
                          log("info", "recall", "resume \u7B2C\u4E8C\u9636\u6BB5\uFF1A\u5E95\u90E8\u6682\u5B58\u6587\u4EF6/\u56FE\u7247\u5728\u65B0\u4F1A\u8BDD\u4E2D\u5DF2\u6210\u529F\u91CD\u5EFA\u56DE\u586B", { count: bFiles.length });
                        } catch (eBf) {
                          log("warn", "recall", "\u5728\u65B0\u4F1A\u8BDD\u91CD\u5EFA\u5E95\u90E8\u8349\u7A3F\u6587\u4EF6\u5F02\u5E38", { err: String(eBf && eBf.message ? eBf.message : eBf) });
                        }
                      } else {
                        var stgImgs = Array.isArray(stg.imageIds) ? stg.imageIds : [];
                        if (stgImgs.length > 0) {
                          addInputImagesCompat(ia, stgImgs);
                        }
                      }
                      log("info", "recall", "resume \u7B2C\u4E8C\u9636\u6BB5\uFF1A\u5E95\u90E8\u6682\u5B58\u8349\u7A3F\u53CA\u9644\u4EF6\u5DF2\u56DE\u586B", {
                        hasText: !!(stg.text && stg.text.length > 0),
                        fileCount: bFiles ? bFiles.length : stg.imageIds ? stg.imageIds.length : 0
                      });
                    } catch (eStg) {
                      log("warn", "recall", "\u56DE\u586B\u6682\u5B58\u8349\u7A3F\u5F02\u5E38", { err: String(eStg && eStg.message ? eStg.message : eStg) });
                    }
                  }, 800);
                }
              } catch (e) {
                log("error", "recall", "\u81EA\u52A8\u53D1\u9001\u5931\u8D25\uFF08resume\uFF09", { err: String(e && e.message ? e.message : e) });
              }
            };
            scheduleTimeout(submitWhenReady, 280);
          });
        };
        prepareImages().finally(function() {
          if (unmounted) return;
          if (r.sel && props.modelSel) {
            props.modelSel.apply(sessionId, r.sel).then(doSubmit, doSubmit);
          } else {
            doSubmit();
          }
        });
      } catch (eRun) {
        log("error", "recall", "resume \u6267\u884C\u5F02\u5E38", { sessionId, err: String(eRun && eRun.message ? eRun.message : eRun) });
      }
    }, 100);
    return function() {
      unmounted = true;
      clearInterval(timer);
      for (var ti = 0; ti < pendingTimeouts.length; ti++) {
        clearTimeout(pendingTimeouts[ti]);
      }
    };
  }, [sessionId, resumeKey]);
  return null;
}

// src/features/recall/index.js
function RecallSettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    rowStyle,
    labelStyle,
    hintStyle,
    switchRow,
    segmentedGroup
  } = styles;
  const [confirmCapsule, setConfirmCapsule] = React14.useState(recallConfirmEnabled());
  const [origImg, setOrigImg] = React14.useState(showOriginalImages());
  const [visual, setVisual] = React14.useState(recallVisualMode());
  const [statOnly, setStatOnly] = React14.useState(statOnlyUser());
  const [hotkey, setHotkeyState] = React14.useState(hotkeySetting());
  const [hotkeyOn, setHotkeyOn] = React14.useState(hotkeyEnabledSetting());
  const [recording, setRecording] = React14.useState(false);
  const [hotkeyInvalid, setHotkeyInvalid] = React14.useState(false);
  React14.useEffect(() => {
    if (!recording) return;
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setHotkeyInvalid(false);
        return;
      }
      const combo = keydownCombo(e);
      if (!combo) {
        setHotkeyInvalid(true);
        return;
      }
      setHotkeyInvalid(false);
      setHotkeyState(combo);
      setHotkeySetting(combo);
      setRecording(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording]);
  if (props && props.view === "summary") {
    return L.rowRecallDesc || "\u63D0\u4F9B\u6D88\u606F\u64A4\u56DE\u64CD\u4F5C\u680F\u6309\u94AE\u3001\u64A4\u56DE\u5F85\u5B9A\u80F6\u56CA\u5012\u8BA1\u65F6\u786E\u8BA4\u3001\u4E09\u79CD\u89C6\u89C9\u6A21\u5F0F\u53CA\u5168\u5C40\u5FEB\u6377\u952E\u3002";
  }
  return React14.createElement(
    "div",
    {
      style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
      "data-dsh-easyrewrite": "recall-settings"
    },
    React14.createElement(
      "div",
      { style: sectionStyle },
      React14.createElement("span", { style: groupTitleStyle }, L.rowRecallTitle || L.sectionRecall),
      switchRow(L.recallConfirm, confirmCapsule, (v) => {
        setConfirmCapsule(v);
        setBool("dsh-easyrewrite:recallConfirm", v);
      }),
      switchRow(L.showOriginalImages, origImg, (v) => {
        setOrigImg(v);
        setBool("dsh-easyrewrite:showOriginalImages", v);
      }),
      React14.createElement(
        "div",
        { style: groupStyle },
        React14.createElement("span", { style: labelStyle }, L.visualMode),
        segmentedGroup([
          ["simple", L.visualSimple],
          ["minimal", L.visualMinimal],
          ["info", L.visualInfo]
        ], visual, (v) => {
          setVisual(v);
          setSetting("dsh-easyrewrite:visualMode", v);
        })
      ),
      switchRow(L.statOnlyUser, statOnly, (v) => {
        setStatOnly(v);
        setBool("dsh-easyrewrite:statOnlyUser", v);
      }),
      switchRow(L.hotkeyEnable, hotkeyOn, (v) => {
        setHotkeyOn(v);
        setHotkeyEnabledSetting(v);
        if (!v) setRecording(false);
      }, L.hotkeyHint),
      React14.createElement(
        "div",
        { style: rowStyle },
        React14.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "2px" } },
          React14.createElement("span", { style: labelStyle }, L.hotkey + "\uFF1A" + (hotkey ? formatHotkey(hotkey) : L.hotkeyNone)),
          React14.createElement("span", { style: hintStyle }, recording ? L.hotkeyRecording : hotkey ? null : L.hotkeyHint),
          hotkeyInvalid ? React14.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-error, #d9534f)" } }, L.hotkeyInvalid) : null
        ),
        React14.createElement("button", {
          type: "button",
          disabled: !hotkeyOn,
          style: {
            appearance: "none",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "12px",
            cursor: hotkeyOn ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            flex: "none",
            opacity: hotkeyOn ? 1 : 0.45
          },
          onClick: () => {
            setHotkeyInvalid(false);
            setRecording(!recording);
          }
        }, recording ? L.hotkeyRecording : L.hotkeyRecord)
      )
    ),
    React14.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}
function registerRecall(ctx) {
  const disposers = [];
  const barModelSel = createModelSel(ctx);
  try {
    const uiW = ctx.uiWorkspace || (typeof ctx.get === "function" ? ctx.get("uiWorkspace") || null : null);
    setCtxUiWorkspaceRef(uiW);
  } catch (e) {
  }
  function onHotkeyKeydown(e) {
    try {
      if (hotkeyCaptureActive) return;
      if (!hotkeyEnabledSetting()) return;
      const hk = hotkeySetting();
      if (!hk || !keydownMatches(e, hk)) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      let cur = null;
      try {
        const sl = ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
        cur = sl ? sl.current : null;
      } catch (err) {
        cur = null;
      }
      if (!cur) return;
      const flowItems = document.querySelectorAll('[data-chat-flow-kind="user"]');
      if (!flowItems || flowItems.length === 0) return;
      const lastUser = flowItems[flowItems.length - 1];
      const recallKey = lastUser.querySelector('[data-dsh-easyrewrite="recall-key"]');
      if (!recallKey) return;
      e.preventDefault();
      recallKey.click();
      log("info", "hotkey", "\u5FEB\u6377\u952E\u89E6\u53D1\u64A4\u56DE", { key: hotkeySetting() });
    } catch (err) {
    }
  }
  window.addEventListener("keydown", onHotkeyKeydown, true);
  disposers.push(() => window.removeEventListener("keydown", onHotkeyKeydown, true));
  try {
    if (typeof window !== "undefined") {
      if (!window.__dshEasyRewrite) window.__dshEasyRewrite = {};
      window.__dshEasyRewrite.bar = {
        _on: () => {
          try {
            return localStorage.getItem("dsh-easyrewrite:debug") === "1";
          } catch (e) {
            return false;
          }
        },
        get: () => JSON.stringify({ tune: barTune }),
        diagnose: () => barDiagnose()
      };
    }
  } catch (e) {
  }
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject(
      "conversation.input.dock",
      () => ctx.slots.register({
        name: "conversation.input.dock",
        id: "dsh-easyrewrite-recall-banner",
        order: -10,
        inject: (sessionId) => {
          let inputShell = null;
          let conversationSvc = null;
          try {
            if (typeof ctx.sessions.scope === "function" && sessionId) {
              const scope = ctx.sessions.scope(sessionId);
              conversationSvc = (scope && typeof scope.get === "function" ? scope.get("conversation") : null) || ctx.conversation;
              if (conversationSvc && conversationSvc.input && typeof conversationSvc.input.for === "function") {
                inputShell = conversationSvc.input.for(scope);
              }
            }
          } catch (eShell) {
            inputShell = null;
          }
          const resolvedActions = inputShell && inputShell.actions ? inputShell.actions : inputShell && (typeof inputShell.setDraft === "function" || typeof inputShell.submit === "function") ? inputShell : null;
          const injected = {
            sessionId,
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxWorkspaces: ctx.workspaces,
            ctxSessions: ctx.sessions,
            updateQueue: (itemId, action) => {
              try {
                if (conversationSvc && typeof conversationSvc.updateQueue === "function") {
                  return conversationSvc.updateQueue(itemId, action);
                }
                const binding = ctx.sessions && typeof ctx.sessions.binding === "function" ? ctx.sessions.binding(sessionId) : null;
                if (binding && binding.session && typeof binding.session.updateQueue === "function") {
                  return binding.session.updateQueue(itemId, action);
                }
              } catch (eQ) {
              }
              return Promise.resolve();
            },
            modelSel: barModelSel,
            inputState: inputShell || null,
            restoreSession: (id) => {
              return fetch("/bubble/unarchive", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: id }),
                keepalive: true
              }).then((r) => r.json()).then((d) => {
                log("debug", "reset", "\u6062\u590D\u5B8C\u6210\uFF08unarchive\uFF09", { sessionId: id, ok: !!(d && d.ok) });
                return !!(d && d.ok);
              }).catch(() => false);
            }
          };
          if (resolvedActions) injected.inputActions = resolvedActions;
          return injected;
        }
      }, RecallBanner)
    );
    if (typeof d1 === "function") disposers.push(d1);
    const d2 = ctx.slots.inject(
      "plugins.row.config",
      () => ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#recall" },
        RecallSettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }
  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}

// src/features/history/index.js
var React15 = __toESM(require("react"), 1);
function HistorySettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    labelStyle,
    hintStyle,
    switchRow
  } = styles;
  const [pagerOn, setPagerOn] = React15.useState(getBool("dsh-easyrewrite:pagerEnabled", true));
  const [histOpen, setHistOpen] = React15.useState(true);
  const [famOpenMap, setFamOpenMap] = React15.useState({});
  const [statusMsg, setStatusMsg] = React15.useState(null);
  const [cleaning, setCleaning] = React15.useState(false);
  const ctxSessions = props && props.ctxSessions || serviceRefs.sessions;
  if (props && props.view === "summary") {
    return L.rowHistoryDesc || "\u63D0\u4F9B\u4F1A\u8BDD\u9876\u90E8 < X / Y > \u5386\u53F2\u7248\u672C\u7FFB\u9875\u5668\u4E0E\u5386\u53F2\u7248\u672C\u6811\u5BFC\u822A\u3002";
  }
  const { families, loading, refresh } = useVersionFamilies(ctxSessions, props);
  let snap = null;
  try {
    snap = ctxSessions && ctxSessions.list && typeof ctxSessions.list.getSnapshot === "function" ? ctxSessions.list.getSnapshot() : null;
  } catch (e) {
  }
  const metaOf = (vid) => snap && snap.byId && snap.byId[vid] || {};
  const famName = (fam) => {
    if (fam && fam.title && !fam.title.startsWith("session-")) return fam.title;
    let best = null, bt = -1;
    if (Array.isArray(fam.versions)) {
      fam.versions.forEach((v) => {
        const vid = typeof v === "string" ? v : v.sessionId || v.sourceSessionId;
        const m = vid ? metaOf(vid) : {};
        const tt = m.updatedAt || (v.createdAt || 0);
        const candTitle = m.title || (v.summary && !v.summary.startsWith("\u7248\u672C ") ? v.summary : null);
        if (tt >= bt && candTitle && !candTitle.startsWith("session-")) {
          bt = tt;
          best = candTitle;
        }
      });
    }
    return best || "\u672A\u547D\u540D\u5BF9\u8BDD";
  };
  const fmtStamp = (tsv) => {
    if (!tsv) return "\u2014";
    const dd = new Date(tsv);
    const p2 = (x) => (x < 10 ? "0" : "") + x;
    return dd.getFullYear() + "-" + p2(dd.getMonth() + 1) + "-" + p2(dd.getDate()) + " " + p2(dd.getHours()) + ":" + p2(dd.getMinutes());
  };
  const chev = (openState) => React15.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    style: { flex: "none", display: "block", color: "var(--dsw-alias-label-tertiary)", transform: openState ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .12s" }
  }, React15.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
  const rowHead = { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", cursor: "pointer", borderRadius: "6px" };
  const hdrRow = { display: "flex", alignItems: "center", cursor: "pointer", padding: "4px 0" };
  return React15.createElement(
    "div",
    {
      style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
      "data-dsh-easyrewrite": "history-settings"
    },
    React15.createElement(
      "div",
      { style: sectionStyle },
      React15.createElement("span", { style: groupTitleStyle }, L.rowHistoryTitle || L.sectionVersions),
      switchRow(L.pagerTitle || "\u542F\u7528\u7FFB\u9875\u5668", pagerOn, (v) => {
        setPagerOn(v);
        setBool("dsh-easyrewrite:pagerEnabled", v);
      }),
      statusMsg ? React15.createElement("div", {
        style: { padding: "6px 10px", borderRadius: "6px", background: "rgba(77,107,254,0.12)", color: "var(--dsw-alias-brand-primary, #4d6bfe)", fontSize: "12px", marginBottom: "6px" }
      }, statusMsg) : null,
      React15.createElement(
        "div",
        { style: groupStyle },
        loading ? React15.createElement("span", { style: hintStyle }, "\u6B63\u5728\u626B\u63CF\u5386\u53F2\u7248\u672C\u5BB6\u65CF...") : families.length === 0 ? React15.createElement("span", { style: hintStyle }, L.versionFamilyNone) : React15.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React15.createElement(
            "div",
            { style: hdrRow, onClick: () => setHistOpen(!histOpen) },
            chev(histOpen),
            React15.createElement("span", { style: { fontSize: "12px", fontWeight: "600", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
            React15.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + " \u4E2A\u5BB6\u65CF")
          ),
          histOpen ? families.map((fam) => {
            const fid = fam.sessionId || fam.rootId;
            const open = !!famOpenMap[fid];
            const vList = fam.versions || [];
            return React15.createElement(
              "div",
              {
                key: fid,
                style: { display: "flex", flexDirection: "column", gap: "2px", padding: "4px 0 4px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" }
              },
              React15.createElement(
                "div",
                { style: hdrRow, onClick: () => {
                  const nm = Object.assign({}, famOpenMap);
                  nm[fid] = !open;
                  setFamOpenMap(nm);
                } },
                chev(open),
                React15.createElement("span", { style: { fontSize: "12px", fontWeight: "500", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                fam.isVault ? React15.createElement("span", { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", color: "var(--dsw-alias-label-tertiary)", marginRight: "6px" } }, "Vault") : null,
                React15.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, vList.length + " " + L.versionCount)
              ),
              open ? vList.map((ver, vi) => {
                const isVault = fam.isVault;
                const vNum = isVault ? ver.versionNumber : vi + 1;
                const vStamp = isVault ? ver.createdAt || ver.updatedAt : metaOf(ver).updatedAt;
                const isCur = isVault ? ver.isCurrent || vi === fam.currentVersionIndex : false;
                const summary = isVault && ver.summary ? ver.summary : null;
                return React15.createElement(
                  "div",
                  { key: isVault ? ver.versionNumber : ver, style: rowHead },
                  React15.createElement("span", { style: { fontSize: "11px", fontWeight: "bold", color: isCur ? "var(--dsw-alias-brand-primary, #4d6bfe)" : "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "28px" } }, "v" + vNum),
                  React15.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "115px" } }, fmtStamp(vStamp)),
                  summary ? React15.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1", minWidth: "0" }, title: summary }, summary) : React15.createElement("span", { style: { flex: "1" } }),
                  isCur ? React15.createElement("span", {
                    style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: "rgba(46,160,67,0.15)", color: "#2ea043", flex: "none", fontWeight: "500" }
                  }, "\u5F53\u524D\u7248\u672C") : React15.createElement("button", {
                    type: "button",
                    style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                    onClick: (ev) => {
                      ev.stopPropagation();
                      setStatusMsg(`\u6B63\u5728\u6062\u590D ${famName(fam)} \u5230 v${vNum}...`);
                      restoreSessionVersion(fam, ver, props).then((res) => {
                        if (res && res.ok) {
                          setStatusMsg(`\u5DF2\u6210\u529F\u6062\u590D\u81F3 v${vNum} \u5E76\u6253\u5F00\uFF01`);
                          setTimeout(() => setStatusMsg(null), 3e3);
                          refresh();
                        } else {
                          setStatusMsg(`\u6062\u590D\u5931\u8D25: ${res?.error || "unknown"}`);
                          setTimeout(() => setStatusMsg(null), 5e3);
                        }
                      }).catch((e) => {
                        setStatusMsg(`\u6062\u590D\u5F02\u5E38: ${String(e?.message || e)}`);
                        setTimeout(() => setStatusMsg(null), 5e3);
                      });
                    }
                  }, L.versionRestoreOpen)
                );
              }) : null
            );
          }) : null
        )
      ),
      // 智能迁移与清理遗留插件归档（严格保留用户主动归档会话）
      React15.createElement(
        "div",
        {
          style: Object.assign({}, groupStyle, { marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))" })
        },
        React15.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
          React15.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: 0 } },
            React15.createElement("span", { style: labelStyle }, L.cleanLegacyArchived || "\u667A\u80FD\u6E05\u7406\u9057\u7559\u63D2\u4EF6\u5F52\u6863"),
            React15.createElement("span", { style: hintStyle }, L.cleanLegacyArchivedHint || "\u5C06\u5386\u53F2\u64A4\u56DE\u5F52\u6863\u5B89\u5168\u8F6C\u5316\u4E3A\u5F71\u5B50\u4ED3\u50A8\u65B0\u6A21\u5F0F\uFF0C\u62D4\u9664\u6B8B\u7559\u5217\u8868\uFF1B\u7528\u6237\u4E3B\u52A8\u5F52\u6863 100% \u5B89\u5168\u4FDD\u7559\uFF01")
          ),
          React15.createElement("button", {
            type: "button",
            disabled: cleaning,
            style: {
              appearance: "none",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
              background: cleaning ? "rgba(128,128,128,0.1)" : "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
              color: "var(--dsw-alias-label-primary)",
              borderRadius: "6px",
              padding: "5px 14px",
              fontSize: "12px",
              cursor: cleaning ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              flex: "none",
              whiteSpace: "nowrap"
            },
            onClick: async (e) => {
              e.stopPropagation();
              setCleaning(true);
              setStatusMsg("\u6B63\u5728\u626B\u63CF\u5E76\u6E05\u7406\u9057\u7559\u63D2\u4EF6\u5F52\u6863...");
              try {
                const res = await fetch("/bubble/cleanup-legacy-archived", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({}),
                  keepalive: true
                });
                const d = await res.json();
                if (d && d.ok) {
                  const mig = d.migrated || d.migratedCount || 0;
                  const ret = d.retained || d.retainedCount || d.retainedArchived && d.retainedArchived.length || 0;
                  const msg = `\u6E05\u7406\u5B8C\u6210\uFF1A\u5DF2\u8F6C\u5316/\u62D4\u9664 ${mig} \u4E2A\u63D2\u4EF6\u5386\u53F2\u4F1A\u8BDD\uFF0C\u5B89\u5168\u4FDD\u7559 ${ret} \u4E2A\u7528\u6237\u4E3B\u52A8\u5F52\u6863\uFF01`;
                  setStatusMsg(msg);
                  setTimeout(() => refresh(), 500);
                } else {
                  setStatusMsg("\u6E05\u7406\u5B8C\u6210\uFF1A\u672A\u53D1\u73B0\u9700\u8981\u8F6C\u5316\u7684\u63D2\u4EF6\u6B8B\u7559\u5F52\u6863\uFF0C\u7528\u6237\u4E3B\u52A8\u5F52\u6863\u5DF2\u5168\u90E8\u4FDD\u7559\u3002");
                }
              } catch (err) {
                setStatusMsg(`\u6E05\u7406\u5F02\u5E38: ${err?.message || err}`);
              } finally {
                setCleaning(false);
              }
            }
          }, cleaning ? L.cleaning || "\u6E05\u7406\u4E2D\u2026" : L.cleanLegacyArchived || "\u667A\u80FD\u6E05\u7406")
        )
      )
    ),
    React15.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}
function registerHistory(ctx) {
  const disposers = [];
  try {
    const stale = [];
    for (let sk = 0; sk < localStorage.length; sk++) {
      const skey = localStorage.key(sk);
      if (skey && skey.indexOf("dsh-easyrewrite:versions:") === 0) stale.push(skey);
    }
    for (let sv = 0; sv < stale.length; sv++) localStorage.removeItem(stale[sv]);
    if (stale.length > 0) log("info", "lifecycle", "\u5DF2\u6E05\u626B\u9648\u65E7\u7248\u672C\u6811\u952E", { count: stale.length });
  } catch (e) {
  }
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject(
      "conversation.chat.assistant-actions",
      () => ctx.slots.register({
        name: "conversation.chat.assistant-actions",
        id: "dsh-easyrewrite-version-pager",
        order: 10,
        inject: () => ({
          openSession: (id) => invokeOpenSession(ctx, id),
          ctxSessions: ctx.sessions,
          archiveSession: (id) => {
            try {
              return Promise.resolve(ctx.workspaces && ctx.workspaces.archiveSession ? ctx.workspaces.archiveSession(id) : false).then((ok) => {
                log("debug", "pager", "\u5F52\u6863\u7ED3\u679C\uFF08\u5B98\u65B9\u76F4\u8C03\uFF09", { id, ok: ok !== false });
                return ok !== false;
              }).catch((e) => {
                log("warn", "pager", "\u5F52\u6863\u5931\u8D25\uFF08\u5B98\u65B9\u76F4\u8C03\uFF09", { id, err: String(e && e.message ? e.message : e) });
                return false;
              });
            } catch (e) {
              log("warn", "pager", "\u5F52\u6863\u5F02\u5E38", { id, err: String(e && e.message ? e.message : e) });
              return Promise.resolve(false);
            }
          },
          currentSessionId: () => {
            try {
              const s = ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
              if (!s) return null;
              if (s.current) return s.current;
              if (s.byId) {
                const found = Object.values(s.byId).find((r) => r && r.retainedBy && r.retainedBy.mainView > 0);
                if (found && found.id) return found.id;
              }
              return null;
            } catch (e) {
              return null;
            }
          },
          restoreSession: (id) => {
            return fetch("/bubble/unarchive", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: id }),
              keepalive: true
            }).then((r) => r.json()).then((d) => {
              if (d && d.ok && d.restored) log("info", "pager", "\u7248\u672C\u4F1A\u8BDD\u5DF2\u6062\u590D\uFF08unarchive\uFF09", { sessionId: id });
              return !!(d && d.ok);
            }).catch(() => false);
          }
        })
      }, VersionPager)
    );
    if (typeof d1 === "function") disposers.push(d1);
    const d2 = ctx.slots.inject(
      "plugins.row.config",
      () => ctx.slots.register(
        {
          name: "plugins.row.config",
          key: "dsh-easyrewrite#history",
          inject: () => ({
            openSession: (id) => invokeOpenSession(ctx, id),
            ctxSessions: ctx.sessions,
            ctxWorkspaces: ctx.workspaces,
            currentSessionId: () => {
              try {
                const s = ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
                if (!s) return null;
                if (s.current) return s.current;
                if (s.byId) {
                  const found = Object.values(s.byId).find((r) => r && r.retainedBy && r.retainedBy.mainView > 0);
                  if (found && found.id) return found.id;
                }
                return null;
              } catch (e) {
                return null;
              }
            }
          })
        },
        HistorySettingsPage
      )
    );
    if (typeof d2 === "function") disposers.push(d2);
  }
  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}

// src/features/other/index.js
var React16 = __toESM(require("react"), 1);
function OtherSettingsPage(props) {
  const L = useUILocaleDict();
  const styles = createSettingsStyles();
  const {
    bodyStyle,
    sectionStyle,
    groupTitleStyle,
    groupStyle,
    labelStyle,
    hintStyle,
    switchRow,
    segmentedGroup
  } = styles;
  const [previewSize, setPreviewSize] = React16.useState(messagePreviewSize());
  const [conflict, setConflict] = React16.useState(draftConflictMode());
  const [debugOn, setDebugOn] = React16.useState(getBool("dsh-easyrewrite:debug", false));
  if (props && props.view === "summary") {
    return L.rowOtherDesc || "\u6D88\u606F\u9884\u89C8\u5927\u5C0F\u5916\u89C2\uFF08\u5C0F/\u653E\u5927\uFF09\u3001\u8349\u7A3F\u56DE\u586B\u51B2\u7A81\u6A21\u5F0F\u914D\u7F6E\u53CA\u5E95\u5C42\u8F85\u52A9\u9009\u9879\u3002";
  }
  return React16.createElement(
    "div",
    {
      style: Object.assign({}, bodyStyle, { margin: 0, borderTop: "none", padding: "12px 16px" }),
      "data-dsh-easyrewrite": "other-settings"
    },
    React16.createElement(
      "div",
      { style: sectionStyle },
      React16.createElement("span", { style: groupTitleStyle }, L.rowOtherTitle || "\u5916\u89C2\u4E0E\u8F85\u52A9\u8BBE\u7F6E"),
      // 消息预览大小：小（收为紧凑小方框，默认） vs 放大（图片放大呈现官方高度 + 大文件卡片）
      React16.createElement(
        "div",
        { style: groupStyle },
        React16.createElement("span", { style: labelStyle }, L.messagePreviewSize),
        segmentedGroup([
          ["small", L.previewSizeSmall],
          ["large", L.previewSizeLarge]
        ], previewSize === "large" || previewSize === "standard" ? "large" : "small", (v) => {
          setPreviewSize(v);
          setSetting("dsh-easyrewrite:messagePreviewSize", v);
        }),
        React16.createElement("span", { style: hintStyle }, previewSize === "large" || previewSize === "standard" ? L.previewSizeHintLarge : L.previewSizeHintSmall)
      ),
      React16.createElement(
        "div",
        { style: groupStyle },
        React16.createElement("span", { style: labelStyle }, L.conflictMode),
        segmentedGroup([
          ["overwrite", L.conflictOverwriteShort],
          ["merge", L.conflictMergeShort]
        ], conflict, (v) => {
          setConflict(v);
          setSetting("dsh-easyrewrite:conflictMode", v);
        }),
        React16.createElement("span", { style: hintStyle }, conflict === "merge" ? L.conflictMerge : L.conflictOverwrite)
      ),
      switchRow("\u5F00\u53D1\u8005\u8C03\u8BD5\u65E5\u5FD7 (Console Debug)", debugOn, (v) => {
        setDebugOn(v);
        setBool("dsh-easyrewrite:debug", v);
      }, "\u5F00\u542F\u540E\u5728\u6D4F\u89C8\u5668\u63A7\u5236\u53F0\u6253\u5370\u8BE6\u7EC6\u8C03\u8BD5\u65E5\u5FD7\u53CA\u6302\u8F7D\u8C03\u53C2\u63A5\u53E3")
    ),
    React16.createElement("span", { style: Object.assign({}, hintStyle, { marginTop: "8px" }) }, L.instant)
  );
}
function registerOther(ctx) {
  const disposers = [];
  if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
    const d1 = ctx.slots.inject(
      "plugins.row.config",
      () => ctx.slots.register(
        { name: "plugins.row.config", key: "dsh-easyrewrite#other" },
        OtherSettingsPage
      )
    );
    if (typeof d1 === "function") disposers.push(d1);
  }
  return () => {
    for (let i = 0; i < disposers.length; i++) disposers[i]();
  };
}

// src/features/settings-card/index.js
var React17 = __toESM(require("react"), 1);
function EasyRewriteSettingsCard(props) {
  var embedded = !!(props && props.embedded);
  var L = useUILocaleDict();
  var openState = React17.useState(embedded);
  var open = openState[0];
  var setOpen = openState[1];
  var sRewrite = React17.useState(rewriteOnClick());
  var rewrite = sRewrite[0];
  var setRewrite = sRewrite[1];
  var sRecall = React17.useState(editOffShowRecall());
  var showRecall = sRecall[0];
  var setShowRecall = sRecall[1];
  var sConfirm = React17.useState(recallConfirmEnabled());
  var confirmCapsule = sConfirm[0];
  var setConfirmCapsule = sConfirm[1];
  var sHistOpen = React17.useState(false);
  var histOpen = sHistOpen[0];
  var setHistOpen = sHistOpen[1];
  var sFamOpen = React17.useState({});
  var famOpenMap = sFamOpen[0];
  var setFamOpenMap = sFamOpen[1];
  var sUpdateVer = React17.useState("");
  var updateVer = sUpdateVer[0];
  var setUpdateVer = sUpdateVer[1];
  var sDshVer = React17.useState(null);
  var dshVer = sDshVer[0];
  var setDshVer = sDshVer[1];
  var sRemindClosed = React17.useState(getBool("dsh-easyrewrite:autoCheckReminded", false));
  var remindClosed = sRemindClosed[0];
  var setRemindClosed = sRemindClosed[1];
  var sUpdateMsg = React17.useState("");
  var updateMsg = sUpdateMsg[0];
  var setUpdateMsg = sUpdateMsg[1];
  var sUpdateAvail = React17.useState("");
  var updateAvailableVer = sUpdateAvail[0];
  var setUpdateAvailableVer = sUpdateAvail[1];
  var sChecking = React17.useState(false);
  var updateChecking = sChecking[0];
  var setUpdateChecking = sChecking[1];
  var sUpdating = React17.useState(false);
  var updateUpdating = sUpdating[0];
  var setUpdateUpdating = sUpdating[1];
  var sAutoCheck = React17.useState(getBool("dsh-easyrewrite:autoCheckUpdate", false));
  var autoCheckOn = sAutoCheck[0];
  var setAutoCheckOn = sAutoCheck[1];
  function doCheckUpdate() {
    setUpdateChecking(true);
    setUpdateMsg("");
    fetch("/bubble/check-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then(function(r) {
      return r.json();
    }).then(function(d) {
      setUpdateChecking(false);
      if (!d || !d.ok) {
        setUpdateMsg(L.updateFailed);
        return;
      }
      setUpdateVer(d.current || "?");
      setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
      if (d.latest && versionGt(d.latest, d.current || "0")) {
        setUpdateAvailableVer(d.latest);
        try {
          localStorage.setItem("dsh-easyrewrite:updateAvailable", "1");
        } catch (e) {
        }
      } else {
        setUpdateAvailableVer("");
        setUpdateMsg(L.upToDate);
        try {
          localStorage.removeItem("dsh-easyrewrite:updateAvailable");
        } catch (e) {
        }
      }
    }).catch(function() {
      setUpdateChecking(false);
      setUpdateMsg(L.updateFailed);
    });
  }
  function doUpdatePlugin() {
    if (!updateAvailableVer) return;
    setUpdateUpdating(true);
    fetch("/bubble/update-plugin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true
    }).then(function(r) {
      return r.json();
    }).then(function(d) {
      setUpdateUpdating(false);
      if (d && d.ok) {
        setUpdateMsg(L.updateDone);
        setUpdateAvailableVer("");
        try {
          localStorage.removeItem("dsh-easyrewrite:updateAvailable");
        } catch (e) {
        }
      } else {
        setUpdateMsg(L.updateFailed);
      }
    }).catch(function() {
      setUpdateUpdating(false);
      setUpdateMsg(L.updateFailed);
    });
  }
  React17.useEffect(function() {
    if (!open) return;
    var now = Date.now();
    var lastCheck = 0;
    try {
      lastCheck = parseInt(localStorage.getItem("dsh-easyrewrite:lastUpdateCheckTs") || "0", 10) || 0;
    } catch (e) {
    }
    if (now - lastCheck < 5 * 60 * 1e3 && updateVer !== "") {
      return;
    }
    try {
      localStorage.setItem("dsh-easyrewrite:lastUpdateCheckTs", String(now));
    } catch (e) {
    }
    if (!updateVer) setUpdateVer("\u2026");
    doCheckUpdate();
  }, [open]);
  React17.useEffect(function() {
    var autoOn = getBool("dsh-easyrewrite:autoCheckUpdate", false);
    if (!autoOn) return;
    var today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    var last = null;
    try {
      last = localStorage.getItem("dsh-easyrewrite:lastUpdateCheck");
    } catch (e) {
    }
    if (last === today) return;
    try {
      localStorage.setItem("dsh-easyrewrite:lastUpdateCheck", today);
    } catch (e) {
    }
    doCheckUpdate();
  }, []);
  var sHotkey = React17.useState(hotkeySetting());
  var hotkey = sHotkey[0];
  var setHotkeyState = sHotkey[1];
  var sHotkeyOn = React17.useState(hotkeyEnabledSetting());
  var hotkeyOn = sHotkeyOn[0];
  var setHotkeyOn = sHotkeyOn[1];
  var sRecording = React17.useState(false);
  var recording = sRecording[0];
  var setRecording = sRecording[1];
  var sHotkeyInvalid = React17.useState(false);
  var hotkeyInvalid = sHotkeyInvalid[0];
  var setHotkeyInvalid = sHotkeyInvalid[1];
  React17.useEffect(function() {
    if (!recording) return;
    setHotkeyCaptureActive(true);
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setHotkeyInvalid(false);
        return;
      }
      var combo = keydownCombo(e);
      if (!combo) {
        setHotkeyInvalid(true);
        return;
      }
      setHotkeyInvalid(false);
      setHotkeyState(combo);
      setHotkeySetting(combo);
      setRecording(false);
    }
    window.addEventListener("keydown", onKey, true);
    return function() {
      setHotkeyCaptureActive(false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording]);
  var sVisual = React17.useState(recallVisualMode());
  var visual = sVisual[0];
  var setVisual = sVisual[1];
  var sStat = React17.useState(statOnlyUser());
  var statOnly = sStat[0];
  var setStatOnly = sStat[1];
  var sConflict = React17.useState(draftConflictMode());
  var conflict = sConflict[0];
  var setConflict = sConflict[1];
  var sWidth = React17.useState(editWidthMode());
  var widthMode = sWidth[0];
  var setWidthMode = sWidth[1];
  var sCustom = React17.useState(String(editWidthCustom()));
  var customW = sCustom[0];
  var setCustomW = sCustom[1];
  var sPreviewSize = React17.useState(messagePreviewSize());
  var previewSize = sPreviewSize[0];
  var setPreviewSize = sPreviewSize[1];
  var sOrigImg = React17.useState(showOriginalImages());
  var origImg = sOrigImg[0];
  var setOrigImg = sOrigImg[1];
  var sVaultLoc = React17.useState(vaultStorageLocation());
  var vaultLoc = sVaultLoc[0];
  var setVaultLoc = sVaultLoc[1];
  var sCleanState = React17.useState({ cleaning: false, msg: "" });
  var cleanState = sCleanState[0];
  var setCleanState = sCleanState[1];
  var famHook = useVersionFamilies(props.ctxSessions);
  var allFamilies = famHook.families;
  var refreshFamilies = famHook.refresh;
  var cardStyle = {
    border: "1px solid var(--dsw-alias-border-l2)",
    background: "var(--dsw-alias-bg-layer-3)",
    borderRadius: "12px",
    listStyle: "none",
    transition: "border-color .16s, background .16s"
  };
  var cardOpenStyle = { background: "var(--dsw-alias-bg-layer-2)", borderColor: "var(--dsw-alias-label-dimmed)" };
  var headStyle = {
    appearance: "none",
    width: "100%",
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px"
  };
  var headTextStyle = { display: "flex", flexDirection: "column", flex: "1", minWidth: "0", gap: "4px" };
  var titleStyle = { color: "var(--dsw-alias-label-primary)", fontSize: "15px", fontWeight: 600, lineHeight: "1.4" };
  var subStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "1.5" };
  var chevronStyle = { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s", transform: "rotate(90deg)" };
  var chevronOpenStyle = { transform: "rotate(270deg)" };
  var bodyStyle = {
    borderTop: "1px solid var(--dsw-alias-border-l2)",
    margin: "0 16px",
    paddingTop: "14px",
    paddingBottom: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  };
  var sectionStyle = { display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "16px" };
  var groupTitleStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--dsw-alias-label-primary)",
    letterSpacing: "0.02em",
    lineHeight: "1.6"
  };
  var rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingLeft: "16px" };
  var labelStyle = { fontSize: "13px", color: "var(--dsw-alias-label-primary)" };
  var hintStyle = { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" };
  var groupStyle = { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "16px" };
  var inputStyle = {
    width: "90px",
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
    borderRadius: "8px",
    padding: "4px 8px",
    fontSize: "13px",
    background: "var(--dsw-alias-bg-base)",
    color: "var(--dsw-alias-label-primary)"
  };
  var disabledInputStyle = Object.assign({}, inputStyle, { opacity: 0.45, cursor: "not-allowed" });
  function switchRow(label, value, onChange, extraHint, disabled) {
    var checkSize = 20;
    var checkStyle = {
      width: checkSize,
      height: checkSize,
      borderRadius: "50%",
      border: "2px solid " + (value ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
      background: value ? "#ffffff" : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: value ? "#000000" : "transparent",
      fontSize: "13px",
      lineHeight: "13px",
      cursor: "pointer",
      flex: "none",
      margin: "0 2px",
      transition: "border-color .15s, background .15s, color .15s",
      userSelect: "none",
      boxSizing: "border-box"
    };
    return React17.createElement(
      "div",
      {
        style: Object.assign({}, rowStyle, disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
        "data-dsh-easyrewrite": "switch-row",
        title: disabled ? extraHint || "" : void 0
      },
      React17.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" } },
        React17.createElement("span", { style: labelStyle }, label),
        extraHint ? React17.createElement("span", { style: hintStyle }, extraHint) : null
      ),
      React17.createElement("div", {
        role: "checkbox",
        "aria-checked": !!value,
        "aria-disabled": disabled || void 0,
        style: Object.assign({}, checkStyle, disabled ? { cursor: "not-allowed" } : null),
        onClick: function(e) {
          e.stopPropagation();
          if (disabled) return;
          onChange(!value);
        }
      }, value ? React17.createElement(IconCheckOutline, null) : null)
    );
  }
  function segmentedGroup(options, value, onChange) {
    var n = options.length;
    var idx = 0;
    for (var i = 0; i < n; i++) {
      if (options[i][0] === value) {
        idx = i;
        break;
      }
    }
    var segStyle = {
      position: "relative",
      display: "flex",
      background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
      borderRadius: "999px",
      padding: "2px"
    };
    var thumbStyle = {
      position: "absolute",
      top: "2px",
      left: "calc(" + idx + " * (100% - 4px) / " + n + ")",
      width: "calc((100% - 4px) / " + n + ")",
      height: "calc(100% - 4px)",
      background: "var(--dsw-alias-bg-layer-3, #ffffff)",
      borderRadius: "999px",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12)",
      transition: "left .18s ease",
      zIndex: 1
    };
    return React17.createElement(
      "div",
      { style: segStyle, role: "radiogroup" },
      React17.createElement("div", { style: thumbStyle, "data-dsh-easyrewrite": "seg-thumb" }),
      options.map(function(opt) {
        var sel = value === opt[0];
        return React17.createElement("div", {
          key: opt[0],
          role: "radio",
          "aria-checked": sel,
          style: {
            position: "relative",
            zIndex: 2,
            flex: "1",
            padding: "3px 10px",
            textAlign: "center",
            fontSize: "13px",
            lineHeight: "20px",
            cursor: "pointer",
            borderRadius: "999px",
            color: sel ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
            transition: "color .15s",
            whiteSpace: "nowrap",
            userSelect: "none"
          },
          onClick: function() {
            onChange(opt[0]);
          }
        }, opt[1]);
      })
    );
  }
  var cardBody = React17.createElement(
    "div",
    { style: bodyStyle },
    // —— 编辑 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.sectionEdit),
      switchRow(L.rewrite, rewrite, function(v) {
        setRewrite(v);
        setBool("dsh-easyrewrite:rewriteOnClick", v);
      }),
      switchRow(L.editOffShowRecall, showRecall, function(v) {
        setShowRecall(v);
        setBool("dsh-easyrewrite:editOffShowRecall", v);
      }, rewrite ? L.lockedHint : null, rewrite),
      // 编辑宽度：三固定 + 自定义（固定时输入框禁用置灰）
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.editWidth),
        segmentedGroup([["compact", L.wCompact], ["standard", L.wStandard], ["extended", L.wExtended], ["custom", L.wCustom]], widthMode, function(v) {
          setWidthMode(v);
          setSetting("dsh-easyrewrite:editWidth", v);
        }),
        React17.createElement(
          "div",
          { style: rowStyle },
          React17.createElement("span", { style: labelStyle }, L.customWidth),
          React17.createElement("input", {
            type: "number",
            min: 100,
            max: 1200,
            style: widthMode === "custom" ? inputStyle : disabledInputStyle,
            disabled: widthMode !== "custom",
            placeholder: L.placeholderCustom,
            value: customW,
            onChange: function(e) {
              setCustomW(e.target.value);
              setSetting("dsh-easyrewrite:editWidthCustom", e.target.value);
            }
          })
        )
      )
    ),
    // —— 撤回 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.sectionRecall),
      switchRow(L.recallConfirm, confirmCapsule, function(v) {
        setConfirmCapsule(v);
        setBool("dsh-easyrewrite:recallConfirm", v);
      }),
      switchRow(L.showOriginalImages, origImg, function(v) {
        setOrigImg(v);
        setBool("dsh-easyrewrite:showOriginalImages", v);
      }),
      // 视觉模式
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.visualMode),
        segmentedGroup([["simple", L.visualSimple], ["minimal", L.visualMinimal], ["info", L.visualInfo]], visual, function(v) {
          setVisual(v);
          setSetting("dsh-easyrewrite:visualMode", v);
        })
      ),
      switchRow(L.statOnlyUser, statOnly, function(v) {
        setStatOnly(v);
        setBool("dsh-easyrewrite:statOnlyUser", v);
      }),
      // 撤回快捷键：总开关（Beta，默认关——避免与其他插件快捷键打架）
      switchRow(L.hotkeyEnable, hotkeyOn, function(v) {
        setHotkeyOn(v);
        setHotkeyEnabledSetting(v);
        if (!v) setRecording(false);
      }, L.hotkeyHint),
      // 键位行：始终显示；总开关关闭时录制按钮禁用置灰
      React17.createElement(
        "div",
        { style: rowStyle },
        React17.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "2px" } },
          React17.createElement("span", { style: labelStyle }, L.hotkey + "\uFF1A" + (hotkey ? formatHotkey(hotkey) : L.hotkeyNone)),
          React17.createElement("span", { style: hintStyle }, recording ? L.hotkeyRecording : hotkey ? null : L.hotkeyHint),
          hotkeyInvalid ? React17.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-error, #d9534f)" } }, L.hotkeyInvalid) : null
        ),
        React17.createElement("button", {
          type: "button",
          disabled: !hotkeyOn,
          style: {
            appearance: "none",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "12px",
            cursor: hotkeyOn ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            flex: "none",
            opacity: hotkeyOn ? 1 : 0.45
          },
          onClick: function() {
            setHotkeyInvalid(false);
            setRecording(!recording);
          }
        }, recording ? L.hotkeyRecording : L.hotkeyRecord)
      )
    ),
    // —— 回填 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.sectionComposer),
      // 回填冲突模式
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.conflictMode),
        segmentedGroup([["overwrite", L.conflictOverwriteShort], ["merge", L.conflictMergeShort]], conflict, function(v) {
          setConflict(v);
          setSetting("dsh-easyrewrite:conflictMode", v);
        }),
        React17.createElement("span", { style: hintStyle }, conflict === "merge" ? L.conflictMerge : L.conflictOverwrite)
      )
    ),
    // —— 其他配置 / 外观与辅助 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.rowOtherTitle || "\u5916\u89C2\u4E0E\u8F85\u52A9\u8BBE\u7F6E"),
      // 消息预览大小：小（收为紧凑小方框，默认） vs 放大（图片放大呈现官方高度 + 大文件卡片）
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.messagePreviewSize),
        segmentedGroup([["small", L.previewSizeSmall], ["large", L.previewSizeLarge]], previewSize === "large" || previewSize === "standard" ? "large" : "small", function(v) {
          setPreviewSize(v);
          setSetting("dsh-easyrewrite:messagePreviewSize", v);
        }),
        React17.createElement("span", { style: hintStyle }, previewSize === "large" || previewSize === "standard" ? L.previewSizeHintLarge : L.previewSizeHintSmall)
      )
    ),
    // —— 版本 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.sectionVersions),
      // 影子仓储路径选择（嵌套 fork）
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.vaultLocation),
        segmentedGroup([["global", L.vaultGlobal], ["workspace", L.vaultWorkspace]], vaultLoc, function(v) {
          setVaultLoc(v);
          setSetting("dsh-easyrewrite:vaultStorageLocation", v);
          fetch("/bubble/vault/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storageMode: v }),
            keepalive: true
          }).catch(function() {
          });
        }),
        React17.createElement("span", { style: hintStyle }, vaultLoc === "workspace" ? L.vaultWorkspaceHint : L.vaultGlobalHint)
      ),
      // 一键清理历史遗留僵尸归档（解决 DSH 0.2 侧边栏展开 100+ 废会话污染）
      React17.createElement(
        "div",
        { style: rowStyle },
        React17.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" } },
          React17.createElement("span", { style: labelStyle }, L.cleanLegacyArchived),
          React17.createElement("span", { style: hintStyle }, cleanState.msg || L.cleanLegacyArchivedHint)
        ),
        React17.createElement("button", {
          type: "button",
          disabled: cleanState.cleaning,
          style: {
            appearance: "none",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "12px",
            cursor: cleanState.cleaning ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            flex: "none",
            opacity: cleanState.cleaning ? 0.45 : 1
          },
          onClick: function() {
            setCleanState({ cleaning: true, msg: L.cleaning });
            fetch("/bubble/cleanup-legacy-archived", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
              keepalive: true
            }).then(function(r) {
              return r.json();
            }).then(function(res) {
              if (res && res.ok && (res.migratedCount > 0 || res.prunedEmptyCount > 0)) {
                var totalConverted = (res.migratedCount || 0) + (res.prunedEmptyCount || 0);
                var retained = res.retainedCount || 0;
                var doneText = (L.cleanDone || "\u667A\u80FD\u8FC1\u79FB\u5B8C\u6210\uFF1A\u5DF2\u8F6C\u5316 {n} \u4E2A\u5386\u53F2\u7248\u672C\u5165\u5E93\uFF0C\u4FDD\u7559 {r} \u4E2A\u7528\u6237\u4E3B\u52A8\u5F52\u6863\uFF01").replace("{n}", String(totalConverted)).replace("{r}", String(retained));
                setCleanState({ cleaning: false, msg: doneText });
              } else {
                setCleanState({ cleaning: false, msg: L.cleanNone });
              }
            }).catch(function() {
              setCleanState({ cleaning: false, msg: L.errGeneric });
            });
          }
        }, cleanState.cleaning ? L.cleaning : L.cleanLegacyArchived)
      ),
      // 版本历史（三层折叠）：总开关默认收起 → 按对话名的家族折叠项 → 条目显最后对话时间
      // （融合影子仓储 Vault 与官方 lineage 全量版本树）
      React17.createElement(
        "div",
        { style: groupStyle },
        (function() {
          var families = allFamilies;
          if (!families || families.length === 0) return React17.createElement("span", { style: hintStyle }, L.versionFamilyNone);
          var snap = null;
          try {
            snap = props.ctxSessions && props.ctxSessions.list && props.ctxSessions.list.getSnapshot ? props.ctxSessions.list.getSnapshot() : null;
          } catch (e) {
          }
          var metaOf = function(vid) {
            return snap && snap.byId && snap.byId[vid] || {};
          };
          var famName = function(fam) {
            if (fam && fam.title) return fam.title;
            var best = null, bt = -1;
            if (Array.isArray(fam.versions)) {
              fam.versions.forEach(function(v) {
                var vid = typeof v === "string" ? v : v.sessionId || v.sourceSessionId;
                var m = vid ? metaOf(vid) : {};
                var tt = m.updatedAt || (v.createdAt || 0);
                if (tt >= bt) {
                  bt = tt;
                  best = m.title || v.summary || null;
                }
              });
            }
            return best || fam.versions.length + " " + L.versionCount;
          };
          var fmtStamp = function(tsv) {
            if (!tsv) return "\u2014";
            var dd = new Date(tsv);
            var p2 = function(x) {
              return (x < 10 ? "0" : "") + x;
            };
            return dd.getFullYear() + "-" + p2(dd.getMonth() + 1) + "-" + p2(dd.getDate()) + " " + p2(dd.getHours()) + ":" + p2(dd.getMinutes());
          };
          var chev = function(openState2) {
            return React17.createElement("svg", {
              width: "18",
              height: "18",
              viewBox: "0 0 24 24",
              style: { flex: "none", display: "block", color: "var(--dsw-alias-label-tertiary)", transform: openState2 ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .12s" }
            }, React17.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
          };
          var rowHead = { display: "flex", alignItems: "center", gap: "6px", padding: "5px 4px", cursor: "pointer", borderRadius: "6px" };
          var hdrRow = { display: "flex", alignItems: "center", cursor: "pointer" };
          return React17.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "2px" } },
            React17.createElement(
              "div",
              { style: hdrRow, onClick: function() {
                setHistOpen(!histOpen);
              } },
              chev(histOpen),
              React17.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
              React17.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + " \u4E2A\u5BB6\u65CF")
            ),
            histOpen ? families.map(function(fam) {
              var fid = fam.sessionId || fam.rootId;
              var open2 = !!famOpenMap[fid];
              var vList = fam.versions || [];
              return React17.createElement(
                "div",
                { key: fid, style: { display: "flex", flexDirection: "column", gap: "2px", padding: "2px 0 2px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" } },
                React17.createElement(
                  "div",
                  { style: hdrRow, onClick: function() {
                    var nm = {};
                    for (var ok2 in famOpenMap) nm[ok2] = famOpenMap[ok2];
                    nm[fid] = !open2;
                    setFamOpenMap(nm);
                  } },
                  chev(open2),
                  React17.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                  fam.isVault ? React17.createElement("span", { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", color: "var(--dsw-alias-label-tertiary)", marginRight: "6px" } }, "Vault") : null,
                  React17.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, vList.length + " " + L.versionCount)
                ),
                open2 ? vList.map(function(ver, vi) {
                  var isVault = fam.isVault;
                  var vNum = isVault ? ver.versionNumber : vi + 1;
                  var vStamp = isVault ? ver.createdAt || ver.updatedAt : metaOf(ver).updatedAt;
                  var isCur = isVault ? ver.isCurrent || vi === fam.currentVersionIndex : false;
                  var summary = isVault && ver.summary ? ver.summary : null;
                  return React17.createElement(
                    "div",
                    { key: isVault ? ver.versionNumber : ver, style: rowHead },
                    React17.createElement("span", { style: { fontSize: "11px", fontWeight: isCur ? "bold" : "normal", color: isCur ? "var(--dsw-alias-brand-primary, #4d6bfe)" : "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "26px" } }, "v" + vNum),
                    React17.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "110px" } }, fmtStamp(vStamp)),
                    summary ? React17.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1", minWidth: "0" }, title: summary }, summary) : React17.createElement("span", { style: { flex: "1" } }),
                    isCur ? React17.createElement("span", { style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: "rgba(46,160,67,0.15)", color: "#2ea043", flex: "none" } }, "\u5F53\u524D") : React17.createElement("button", {
                      type: "button",
                      style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                      onClick: function(ev) {
                        ev.stopPropagation();
                        restoreSessionVersion(fam, ver, props).then(function(res) {
                          if (res && res.ok && refreshFamilies) refreshFamilies();
                        });
                      }
                    }, L.versionRestoreOpen)
                  );
                }) : null
              );
            }) : null
          );
        })()
      )
    ),
    // —— 更新 ——
    React17.createElement(
      "div",
      { style: sectionStyle },
      React17.createElement("span", { style: groupTitleStyle }, L.sectionUpdate),
      // 更新检查与执行（精简版：手动检查 + 每日检测可选 + 有新版提示）
      React17.createElement(
        "div",
        { style: groupStyle },
        React17.createElement("span", { style: labelStyle }, L.currentVersion + "\uFF1A" + (updateVer || "\u2026")),
        (function() {
          if (!dshVer) return null;
          if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) return React17.createElement(
            "div",
            { key: "dsh-low", style: { display: "flex", flexDirection: "column", gap: "4px", padding: "6px 8px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", borderRadius: "8px" } },
            React17.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } }, L.dshLowWarning.replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)),
            React17.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "6px" } },
              React17.createElement("code", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, "npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION),
              React17.createElement("button", { type: "button", style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function() {
                try {
                  legacyCopy("npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION);
                } catch (eC1) {
                }
              } }, L.copyUpgradeCmd)
            )
          );
          if (cmpDsh(MAX_TESTED_DSH_VERSION, dshVer) < 0) return React17.createElement("div", { key: "dsh-new", style: { padding: "6px 8px", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))", borderRadius: "8px" } }, L.dshNewNotice.replace("{cur}", dshVer));
          return null;
        })(),
        !remindClosed && !getBool("dsh-easyrewrite:autoCheckUpdate", false) ? React17.createElement(
          "div",
          { key: "remind", style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: "rgba(77,107,254,0.08)", borderRadius: "8px" } },
          React17.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)", flex: "1", minWidth: "0" } }, L.suggestAutoCheck),
          React17.createElement("button", { type: "button", style: { appearance: "none", border: "none", background: "var(--dsw-static-deepseek-500, #4d6bfe)", color: "#ffffff", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function() {
            setBool("dsh-easyrewrite:autoCheckUpdate", true);
            setBool("dsh-easyrewrite:autoCheckReminded", true);
            setAutoCheckOn(true);
            setRemindClosed(true);
          } }, L.enableNow),
          React17.createElement("button", { type: "button", title: L.remindIgnore, style: { appearance: "none", border: "none", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function() {
            setBool("dsh-easyrewrite:autoCheckReminded", true);
            setRemindClosed(true);
          } }, L.remindIgnore)
        ) : null,
        React17.createElement(
          "div",
          { style: rowStyle },
          React17.createElement("span", { style: hintStyle, flex: "1" }, updateMsg || ""),
          React17.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
              background: "transparent",
              color: "var(--dsw-alias-label-secondary)",
              borderRadius: "6px",
              padding: "3px 10px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: function() {
              doCheckUpdate();
            }
          }, updateChecking ? L.checking : L.checkUpdate)
        ),
        updateAvailableVer ? React17.createElement(
          "div",
          { style: rowStyle },
          React17.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-brand-primary, #4d6bfe)", flex: "1" } }, L.newVersion.replace("{ver}", updateAvailableVer)),
          React17.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "none",
              background: "var(--dsw-static-deepseek-500, #4d6bfe)",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "3px 12px",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              flex: "none"
            },
            onClick: function() {
              doUpdatePlugin();
            }
          }, updateUpdating ? L.updating : L.updateNow)
        ) : null,
        switchRow(L.autoCheckUpdate, autoCheckOn, function(v) {
          setAutoCheckOn(v);
          setBool("dsh-easyrewrite:autoCheckUpdate", v);
        })
      )
    ),
    React17.createElement("span", { style: hintStyle }, L.instant)
  );
  if (embedded) return props.view === "summary" ? L.subtitle : cardBody;
  return React17.createElement(
    "li",
    { style: Object.assign({}, cardStyle, open ? cardOpenStyle : null), "data-dsh-easyrewrite": "settings-card" },
    React17.createElement(
      "button",
      {
        type: "button",
        style: headStyle,
        "aria-expanded": open,
        "aria-label": (open ? L.collapse : L.expand) + ": " + L.title,
        onClick: function() {
          setOpen(!open);
        }
      },
      React17.createElement(
        "span",
        { style: headTextStyle },
        React17.createElement("span", { style: titleStyle }, L.title),
        React17.createElement("span", { style: subStyle }, L.subtitle)
      ),
      React17.createElement(
        "svg",
        { width: "18", height: "18", viewBox: "0 0 24 24", style: Object.assign({}, chevronStyle, open ? chevronOpenStyle : null) },
        React17.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
      )
    ),
    open ? cardBody : null
  );
}

// src/index.js
function apply(ctx) {
  ctx.effect(() => {
    const disposers = [];
    function safeRun(tag, fn) {
      try {
        log("info", "boot-step", "start: " + tag);
        const res = fn();
        log("info", "boot-step", "ok: " + tag);
        return res;
      } catch (err) {
        const msg = err && err.stack || err && err.message || String(err);
        log("error", "boot-step", "FAIL [" + tag + "]: " + msg);
        try {
          console.error("[dsh-easyrewrite] Boot step " + tag + " crashed:", err);
        } catch (e) {
        }
        return null;
      }
    }
    safeRun("services-init", () => {
      setServiceRefs(ctx);
      if (ctx && ctx.locale) setLocaleService(ctx.locale);
      try {
        if (typeof ctx.locale === "object" && ctx.locale !== null && typeof ctx.locale.register === "function") {
          ctx.locale.register(NS, {});
        }
      } catch (e) {
      }
    });
    log("info", "lifecycle", "client half active (v3.0.0 modular architecture)");
    safeRun("auto-update", () => {
      initAutoUpdateCheck();
    });
    safeRun("row-labels-polish", () => {
      try {
        const styleId = "dsh-easyrewrite-row-polish";
        if (typeof document !== "undefined" && !document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            [data-plugin-package="dsh-easyrewrite"] img,
            [data-plugin-detail="dsh-easyrewrite"] img,
            [data-plugin-item="dsh-easyrewrite"] img {
              width: 44px !important;
              height: 44px !important;
              max-width: 44px !important;
              max-height: 44px !important;
              object-fit: contain;
            }

            /* \u9690\u85CF\u9876\u7EA7 bundle \u5728\u5B50\u7EC4\u4EF6\u5217\u8868\u4E2D\u7684\u5197\u4F59\u884C\uFF08\u652F\u6301\u4EFB\u610F entryId \u524D\u7F00\uFF0C\u5982 profile:web:dsh-easyrewrite \u7B49\uFF09 */
            [data-plugin-row="dsh-easyrewrite"],
            [data-plugin-row$=":dsh-easyrewrite"],
            [data-plugin-row$="/dsh-easyrewrite"],
            [data-plugin-row$="#dsh-easyrewrite"],
            [data-plugin-row*="dsh-easyrewrite"]:not([data-plugin-row*="bubble"]):not([data-plugin-row*="recall"]):not([data-plugin-row*="history"]):not([data-plugin-row*="other"]) {
              display: none !important;
            }

            /* \u7EC4\u4EF6\u5217\u8868\u884C\uFF1A\u9690\u85CF\u5168\u5C0F\u5199\u77ED ID\uFF0C\u7F8E\u5316\u6A21\u5757\u8DEF\u5F84\u4E3A\u89C4\u8303\u54C1\u724C\u5927\u5199\u683C\u5F0F\uFF08\u652F\u6301\u524D\u7F00\uFF09 */
            [data-plugin-row*="bubble"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row*="bubble"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row*="bubble"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Bubble";
              font-size: 11.5px;
            }

            [data-plugin-row*="recall"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row*="recall"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row*="recall"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Recall";
              font-size: 11.5px;
            }

            [data-plugin-row*="history"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row*="history"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row*="history"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/History";
              font-size: 11.5px;
            }

            [data-plugin-row*="other"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row*="other"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row*="other"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Other";
              font-size: 11.5px;
            }

            /* \u7EC4\u4EF6\u8BE6\u60C5\u9875\uFF1A\u540C\u6837\u89C4\u8303\u5316\u663E\u793A */
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Bubble";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Recall";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/History";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Other";
              font-size: 12px;
            }
          `;
          document.head.appendChild(style);
          disposers.push(() => {
            try {
              style.remove();
            } catch (e) {
            }
          });
        }
      } catch (e) {
      }
    });
    safeRun("bundle-config", () => {
      if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
        const dBnd = ctx.slots.inject(
          "plugins.bundle.config",
          () => ctx.slots.register(
            { name: "plugins.bundle.config", key: "dsh-easyrewrite" },
            BundleConfigPage
          )
        );
        if (typeof dBnd === "function") disposers.push(dBnd);
      }
    });
    safeRun("register-bubble", () => {
      const dBubble = registerBubble(ctx);
      if (typeof dBubble === "function") disposers.push(dBubble);
    });
    safeRun("register-recall", () => {
      const dRecall = registerRecall(ctx);
      if (typeof dRecall === "function") disposers.push(dRecall);
    });
    safeRun("register-history", () => {
      const dHistory = registerHistory(ctx);
      if (typeof dHistory === "function") disposers.push(dHistory);
    });
    safeRun("register-other", () => {
      const dOther = registerOther(ctx);
      if (typeof dOther === "function") disposers.push(dOther);
    });
    safeRun("compat-cards", () => {
      if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
        let registerCard = function(slotName, kind) {
          return ctx.slots.inject(
            slotName,
            () => ctx.slots.register(Object.assign({
              name: slotName,
              inject: () => ({
                openSession: (id) => invokeOpenSession(ctx, id),
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions
              })
            }, kind), EasyRewriteSettingsCard)
          );
        };
        const dCard1 = registerCard("settings.plugin.item", { key: "dsh-easyrewrite" });
        if (typeof dCard1 === "function") disposers.push(dCard1);
      }
    });
    return () => {
      for (let i = 0; i < disposers.length; i++) {
        try {
          if (typeof disposers[i] === "function") disposers[i]();
        } catch (e) {
        }
      }
      clearServiceRefs();
      log("info", "lifecycle", "client half unloaded");
    };
  }, "dsh-easyrewrite: modular client bundle");
}
var index_default = {
  name: "dsh-easyrewrite",
  inject: ["slots", "sessions", "workspaces", "conversation", "uiConversation", "locale", "modelDirectories"],
  apply
};
    return module.exports.default || module.exports;
  }
});
