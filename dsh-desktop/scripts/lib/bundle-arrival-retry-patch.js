'use strict';

// bundle-arrival-retry-patch.js —— 插件 client bundle 到达的瞬态失败重试补丁
//（v0.5.3 用户实测：Failed to load plugins / failed to import loader entry
// (dsh-better-sidebar): client-modules: bundle script
// /plugins/dsh-better-sidebar/client.js?rev... failed to load）。
//
// 根因（源码定论，非猜测）：
//   · 报错文本来自 dsh-client-modules 浏览器半边 defaultLoadBundle 的 <script>
//     error 事件——是 HTTP 取回失败（404/连接失败），不是 require 模块表失败
//    （那会报 "missed the module table"，#124/PD1 形态已另有 client-compat 修）。
//   · URL 里的 ?rev= 只是缓存击穿参数，内核 serveBundle 对 rev 不做校验，
//     旧 rev 单独不会 404；页面 __DSH_BOOT__ 图行与内核 table 同源同进程，
//     同进程内 404 只剩一条路：请求时 readFile 失败——杀软扫描锁
//     （EPERM/EBUSY，安装/升级后全新文件首读正是扫描窗口，同 D3DCOMPILER
//     B1 修复的同一用户群）、或插件目录被并发替换（升级期 sync / 插件中心 /
//     hub 运行时更新做目录级替换）。另有跨进程窗口：内核重启刻意复用同端口
//     （origin 稳定），旧页面惰性 import 撞上重启间隙即连接失败。
//   · 致命的是 arrive() 把单次失败当终态：ClientModuleSystem.pendingArrival
//     finally 清除后该 id 无任何重试路径，loader entry 永久 failed，直到整页
//     刷新——用户看到的就是「插件加载失败」横幅。
//
// 修复（双端，幂等、锚点失配自动退役，风格对齐 tool-source-patch.js）：
//   · 浏览器半边（lib/client.js defaultLoadBundle）：script error 后有界退避
//     重试（4 次尝试：300/900/2700ms，retry=<n> 击穿缓存参数），重试穷尽才
//     以原文案 reject；load 成功但未注册 factory 的硬错误语义不变。
//   · 内核半边（lib/index.js serveBundle）：readFile 对瞬态错误码
//     （ENOENT/EPERM/EBUSY/EACCES/ETIMEDOUT）短重试 3 次（150ms 间隔）后才
//     404，其余错误与最终 404 语义不变。
// 两端叠加后，扫描窗口/目录替换窗口/内核换代的单次瞬态失败不再炸穿整树。

const path = require('node:path');
const fs = require('node:fs');
const { applyPatchToFiles } = require('./patch-engine');

const CLIENT_MODULES_CLIENT_REL = path.join('dsh-client-modules', 'lib', 'client.js');
const CLIENT_MODULES_INDEX_REL = path.join('dsh-client-modules', 'lib', 'index.js');

// ---------------------------------------------------------------------------
// 浏览器半边：defaultLoadBundle 瞬态取回重试
// ---------------------------------------------------------------------------
const LOADER_RETRY_MARKER = 'dsh-desktop compat: bundle script transient-fetch retry';

const LOADER_OLD = [
  '\t\t/** Default bundle-load hook: same-origin external classic script. */',
  '\t\tconst defaultLoadBundle = (url) => new Promise((resolve, reject) => {',
  '\t\t\tconst el = document.createElement("script");',
  '\t\t\tel.async = true;',
  '\t\t\tel.src = url;',
  '\t\t\tel.addEventListener("load", () => {',
  '\t\t\t\tel.remove();',
  '\t\t\t\tresolve();',
  '\t\t\t}, { once: true });',
  '\t\t\tel.addEventListener("error", () => {',
  '\t\t\t\tel.remove();',
  '\t\t\t\treject(/* @__PURE__ */ new Error(`client-modules: bundle script ${url} failed to load`));',
  '\t\t\t}, { once: true });',
  '\t\t\tdocument.head.append(el);',
  '\t\t});',
].join('\n');

// 重试版 loader 主体（= 之后的部分，含 baked 缩进；单测直接 eval 此常量做
// 行为验证——成功重试 / 穷尽拒绝 / 退避序列 / retry 击穿参数）。
const RETRYING_LOADER_BODY = [
  '(url) => new Promise((resolve, reject) => {',
  '\t\t\t// ' + LOADER_RETRY_MARKER + '. serveBundle reads each bundle from disk per',
  '\t\t\t// request; an AV scan lock or a concurrent plugin-directory replacement',
  '\t\t\t// (upgrade sync / plugin manager / hub runtime update) turns one request',
  '\t\t\t// into a 404, and a kernel restart (the port is deliberately reused)',
  '\t\t\t// makes one fetch die on a refused connection — arrive() treats that',
  '\t\t\t// single failure as terminal and the loader entry stays failed until a',
  '\t\t\t// full page reload. Retry the script fetch with bounded backoff before',
  '\t\t\t// giving up; load-without-registration stays a hard error upstream.',
  '\t\t\tconst MAX_ATTEMPTS = 4;',
  '\t\t\tconst RETRY_DELAYS_MS = [300, 900, 2700];',
  '\t\t\tconst loadOnce = (attempt) => {',
  '\t\t\t\tconst el = document.createElement("script");',
  '\t\t\t\tel.async = true;',
  '\t\t\t\tel.src = attempt === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;',
  '\t\t\t\tel.addEventListener("load", () => {',
  '\t\t\t\t\tel.remove();',
  '\t\t\t\t\tresolve();',
  '\t\t\t\t}, { once: true });',
  '\t\t\t\tel.addEventListener("error", () => {',
  '\t\t\t\t\tel.remove();',
  '\t\t\t\t\tif (attempt + 1 < MAX_ATTEMPTS) {',
  '\t\t\t\t\t\tsetTimeout(() => loadOnce(attempt + 1), RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);',
  '\t\t\t\t\t\treturn;',
  '\t\t\t\t\t}',
  '\t\t\t\t\treject(/* @__PURE__ */ new Error(`client-modules: bundle script ${url} failed to load`));',
  '\t\t\t\t}, { once: true });',
  '\t\t\t\tdocument.head.append(el);',
  '\t\t\t};',
  '\t\t\tloadOnce(0);',
  '\t\t})',
].join('\n');

const LOADER_NEW = [
  '\t\t/** Default bundle-load hook: same-origin external classic script. */',
  '\t\tconst defaultLoadBundle = ' + RETRYING_LOADER_BODY + ';',
].join('\n');

function transformLoaderRetry(src, file) {
  if (src.includes(LOADER_RETRY_MARKER)) return { status: 'already' };
  if (!src.includes(LOADER_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 defaultLoadBundle 锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(LOADER_OLD, LOADER_NEW) };
}

// ---------------------------------------------------------------------------
// 内核半边：serveBundle 瞬态读盘重试
// ---------------------------------------------------------------------------
const SERVE_RETRY_MARKER = 'dsh-desktop compat: serveBundle transient-read retry';

const SERVE_OLD = [
  '\t\ttry {',
  '\t\t\tconst body = await readFile(path);',
  '\t\t\tres.writeHead(200, {',
  '\t\t\t\t"content-type": isSourceMap ? "application/json; charset=utf-8" : "text/javascript; charset=utf-8",',
  '\t\t\t\t"cache-control": "no-cache"',
  '\t\t\t});',
  '\t\t\tres.end(body);',
  '\t\t} catch {',
  '\t\t\tres.writeHead(404);',
  '\t\t\tres.end();',
  '\t\t}',
].join('\n');

// 读重试核心语句（无前导缩进；单测以 async 包裹 + 桩 readFile/timer 做行为验证）。
const SERVE_READ_RETRY_CORE = [
  'let body;',
  '// ' + SERVE_RETRY_MARKER + '. The bundle file is read from disk on every',
  '// request; an AV scan lock (EPERM/EBUSY/EACCES) or a concurrent',
  '// plugin-directory replacement makes a single readFile fail, and that one',
  '// 404 kills the plugin client-bundle arrival (arrive() is terminal until a',
  '// full page reload). Retry transient codes briefly before answering 404.',
  'for (let attempt = 0; attempt < 3; attempt++) {',
  '\ttry {',
  '\t\tbody = await readFile(path);',
  '\t\tbreak;',
  '\t} catch (error) {',
  '\t\tconst code = error && error.code;',
  '\t\tconst transient = code === "ENOENT" || code === "EPERM" || code === "EBUSY" || code === "EACCES" || code === "ETIMEDOUT";',
  '\t\tif (!transient || attempt === 2) throw error;',
  '\t\tawait new Promise((resolve) => setTimeout(resolve, 150));',
  '\t}',
  '}',
].join('\n');

const SERVE_NEW = [
  '\t\ttry {',
  ...SERVE_READ_RETRY_CORE.split('\n').map((l) => (l ? '\t\t\t' + l : l)),
  '\t\t\tres.writeHead(200, {',
  '\t\t\t\t"content-type": isSourceMap ? "application/json; charset=utf-8" : "text/javascript; charset=utf-8",',
  '\t\t\t\t"cache-control": "no-cache"',
  '\t\t\t});',
  '\t\t\tres.end(body);',
  '\t\t} catch {',
  '\t\t\tres.writeHead(404);',
  '\t\t\tres.end();',
  '\t\t}',
].join('\n');

function transformServeReadRetry(src, file) {
  if (src.includes(SERVE_RETRY_MARKER)) return { status: 'already' };
  if (!src.includes(SERVE_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 serveBundle readFile 锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(SERVE_OLD, SERVE_NEW) };
}

// ---------------------------------------------------------------------------
// 应用入口（patch-session-persistence.js 同款契约：返回变更文件数）
// ---------------------------------------------------------------------------
function patchBundleArrivalRetry(nmRoot, log = () => {}, stats, options = {}) {
  let changed = 0;
  // CLI 场景经 applyRoot 透传 options：donePrefix=false 输出无前缀单行、
  // anchorLog=warn 把失配走告警通道、dryRun 只判定不落盘；stats 回流
  // anchorMissing/failed 计数。缺省保持原默认（log / true）。
  const donePrefix = options && options.donePrefix;
  const anchorLog = (options && options.anchorLog) || log;
  const dryRun = options && options.dryRun;
  const clientFile = path.join(nmRoot, '@deepseek-ai', CLIENT_MODULES_CLIENT_REL);
  if (fs.existsSync(clientFile)) {
    changed += applyPatchToFiles({
      prefix: 'bundle 到达重试补丁',
      files: [clientFile],
      log,
      transform: transformLoaderRetry,
      alreadyLog: (f) => '已应用，跳过 ' + f,
      doneLog: (f) => '已应用 bundle script 取回重试 ' + f,
      anchorLog,
      failLog: (f, err) => 'bundle script 取回重试失败(' + f + '): ' + err.message,
      donePrefix,
      dryRun,
      dryRunChangedLog: (f) => 'dry-run: 将应用 bundle script 取回重试 ' + f,
      stats,
    });
  }
  // 0.1.2-alpha.1 退役内核半边（serveBundle transient-read retry）：新 serveBundle
  // 从预烘焙的 in-memory responses 表直接回包，不再逐请求 readFile——瞬态读盘
  // 失败→404 的窗口已由上游消除，故 serveBundle 半边锚点自然退役，不再应用。
  return changed;
}

module.exports = {
  CLIENT_MODULES_CLIENT_REL,
  CLIENT_MODULES_INDEX_REL,
  LOADER_RETRY_MARKER,
  SERVE_RETRY_MARKER,
  RETRYING_LOADER_BODY,
  SERVE_READ_RETRY_CORE,
  transformLoaderRetry,
  transformServeReadRetry,
  patchBundleArrivalRetry,
};
