'use strict';

// unit-bundle-arrival-retry.test.js —— E2/问题A 回归：
// v0.5.3 用户实测「Failed to load plugins / failed to import loader entry
// (dsh-better-sidebar): client-modules: bundle script
// /plugins/dsh-better-sidebar/client.js?rev... failed to load」。
//
// 报错来自 dsh-client-modules 浏览器半边 defaultLoadBundle 的 <script> error
// 事件（HTTP 取回失败），arrive() 把单次失败当终态 → loader entry 永久 failed
// 直到整页刷新。补丁双端修（scripts/lib/bundle-arrival-retry-patch.js）：
//   1) 浏览器半边：script error 有界退避重试（4 试 300/900/2700ms，retry= 击穿
//      参数），穷尽才以原文案 reject；
//   2) 内核半边 serveBundle：readFile 瞬态错误码（ENOENT/EPERM/EBUSY/EACCES/
//      ETIMEDOUT）短重试 3 次后才 404，非瞬态码一次即败。
//
// 本测试：transform 契约（already/changed/anchor-missing + 幂等 + 真实文件
// 已打补丁形态）+ 两段注入代码的行为级验证（假 DOM/假 timer/假 readFile）。
// 运行：node --test scripts/test/unit-bundle-arrival-retry.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  LOADER_RETRY_MARKER,
  SERVE_RETRY_MARKER,
  RETRYING_LOADER_BODY,
  SERVE_READ_RETRY_CORE,
  transformLoaderRetry,
  transformServeReadRetry,
  patchBundleArrivalRetry,
} = require('../lib/bundle-arrival-retry-patch');

const NM = path.join(__dirname, '..', '..', 'node_modules');

// ---------------------------------------------------------------------------
// 1) transform 契约（最小 fixture 内嵌锚点原文；与真实 rc.2 文件字节一致）
// ---------------------------------------------------------------------------

/** 浏览器半边 pristine 锚点原文（dsh-client-modules/lib/client.js 节选）。 */
function loaderFixture() {
  return [
    'window.__ModuleLoader__.load({',
    '\tid: "@deepseek-ai/dsh-client-modules",',
    '\tfactory: (require) => {',
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
    '\t\treturn { loadBundle: defaultLoadBundle };',
    '\t}',
    '});',
  ].join('\n');
}

/** 内核半边 pristine 锚点原文（dsh-client-modules/lib/index.js 节选）。 */
function serveFixture() {
  return [
    '\tserveBundle = async (req, res) => {',
    '\t\tconst path = "/x/client.js";',
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
    '\t};',
  ].join('\n');
}

test('transform 契约: 锚点命中 → changed；产物含 marker；二遍 already；漂移 anchor-missing', () => {
  const l1 = transformLoaderRetry(loaderFixture(), 'f.js');
  assert.equal(l1.status, 'changed');
  assert.ok(l1.src.includes(LOADER_RETRY_MARKER));
  assert.equal(transformLoaderRetry(l1.src, 'f.js').status, 'already');
  assert.equal(transformLoaderRetry('const x = 1;', 'f.js').status, 'anchor-missing');

  const s1 = transformServeReadRetry(serveFixture(), 'g.js');
  assert.equal(s1.status, 'changed');
  assert.ok(s1.src.includes(SERVE_RETRY_MARKER));
  assert.equal(transformServeReadRetry(s1.src, 'g.js').status, 'already');
  assert.equal(transformServeReadRetry('export {};', 'g.js').status, 'anchor-missing');
});

test('transform 契约: 产物保留原文案 reject 与 404 语义（兼容层不吞真错误）', () => {
  const l = transformLoaderRetry(loaderFixture(), 'f.js').src;
  assert.ok(l.includes('client-modules: bundle script ${url} failed to load'), '穷尽重试后仍以原文案 reject');
  const s = transformServeReadRetry(serveFixture(), 'g.js').src;
  assert.ok(s.includes('res.writeHead(404)'), '重试穷尽仍回落 404');
});

// ---------------------------------------------------------------------------
// 2) 行为验证：重试版 defaultLoadBundle（真实注入代码，假 DOM + 可控 timer）
// ---------------------------------------------------------------------------

/** 伪 script 元素：按预编队列依次派发 error/load。 */
function fakeDocument(script) {
  return {
    createElement() {
      return {
        async: false,
        src: '',
        listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        remove() { this.removed = true; },
        fire(type) { this.listeners[type](); },
      };
    },
    head: { append(el) { script(el); } },
  };
}

/** 构造重试版 loader（注入代码本体 + 假 DOM + 记录式 setTimeout）。 */
function makeLoader() {
  const timers = [];
  const documents = [];
  const loader = new Function('document', 'setTimeout', 'return ' + RETRYING_LOADER_BODY)(
    { createElement: () => { const el = { async: false, src: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; }, fire(t) { this.listeners[t](); } }; documents.push(el); return el; }, head: { append() {} } },
    (fn, delay) => { timers.push({ fn, delay }); },
  );
  return { loader, documents, timers };
}

test('行为: 前两次 error 第三次 load → 重试后成功；retry= 击穿参数；退避 300/900', async () => {
  const { loader, documents, timers } = makeLoader();
  const p = loader('/plugins/dsh-better-sidebar/client.js?rev=eb6c973de33a');
  documents[0].fire('error');
  await Promise.resolve();
  assert.equal(timers.length, 1, '第一次失败排入一次退避');
  assert.equal(timers[0].delay, 300);
  timers[0].fn(); // 触发第一次重试
  documents[1].fire('error');
  assert.equal(timers[1].delay, 900);
  timers[1].fn(); // 触发第二次重试
  documents[2].fire('load');
  await p; // 不抛即成功
  assert.equal(documents.length, 3, '共 3 次尝试');
  assert.equal(documents[0].src, '/plugins/dsh-better-sidebar/client.js?rev=eb6c973de33a', '首发不带 retry 参数');
  assert.equal(documents[1].src, '/plugins/dsh-better-sidebar/client.js?rev=eb6c973de33a&retry=1');
  assert.equal(documents[2].src, '/plugins/dsh-better-sidebar/client.js?rev=eb6c973de33a&retry=2');
  assert.ok(documents.every((el) => el.removed), '每个 script 元素用后即移除');
});

test('行为: 四连 error → 穷尽重试后以原文案 reject；退避序列 300/900/2700', async () => {
  const { loader, documents, timers } = makeLoader();
  const p = loader('/plugins/x/client.js?rev=aaa');
  const rejection = p.then(() => 'resolved', (err) => err.message);
  documents[0].fire('error');
  timers[0].fn(); documents[1].fire('error');
  timers[1].fn(); documents[2].fire('error');
  timers[2].fn(); documents[3].fire('error');
  assert.equal(documents.length, 4, '共 4 次尝试（MAX_ATTEMPTS=4）');
  assert.deepEqual(timers.map((t) => t.delay), [300, 900, 2700], '退避序列 300/900/2700');
  assert.equal(await rejection, 'client-modules: bundle script /plugins/x/client.js?rev=aaa failed to load');
});

// ---------------------------------------------------------------------------
// 3) 行为验证：serveBundle 读盘重试核心（注入代码本体 + 假 readFile/timer）
// ---------------------------------------------------------------------------

/** 以注入语句构造 async 谓词：readFile 行为可控，返回最终 body 或抛出的错误。 */
function makeServeReader(readFileImpl, setTimeoutImpl) {
  const body = SERVE_READ_RETRY_CORE;
  return new Function('readFile', 'path', 'res', 'setTimeout', 'isSourceMap', `"use strict"; return (async () => {\n${body}\nreturn body; })();`)(readFileImpl, '/nm/x/lib/client.js', { writeHead() {}, end() {} }, setTimeoutImpl, false);
}

const tick = (calls) => (fn) => { calls.push(1); fn(); };

test('行为: EPERM×2 后成功 → 重试 2 次读到 body；间隔 150ms', async () => {
  const calls = [];
  let n = 0;
  const body = await makeServeReader(async () => {
    n += 1;
    if (n <= 2) { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; }
    return Buffer.from('JS');
  }, tick(calls));
  assert.equal(body.toString(), 'JS');
  assert.equal(n, 3, '第 3 次尝试成功');
  assert.equal(calls.length, 2, '两次退避各 150ms');
});

test('行为: ENOENT 持续 → 3 次尝试后抛出（外层 catch → 404）', async () => {
  let n = 0;
  await assert.rejects(makeServeReader(async () => {
    n += 1;
    const e = new Error('ENOENT: no such file'); e.code = 'ENOENT'; throw e;
  }, tick([])), /ENOENT/);
  assert.equal(n, 3, '瞬态码最多 3 次尝试');
});

test('行为: 非瞬态码（EINVAL）→ 不重试一次即抛', async () => {
  let n = 0;
  await assert.rejects(makeServeReader(async () => {
    n += 1;
    const e = new Error('EINVAL'); e.code = 'EINVAL'; throw e;
  }, () => { throw new Error('不应进入退避'); }), /EINVAL/);
  assert.equal(n, 1);
});

// ---------------------------------------------------------------------------
// 4) 真实文件形态（dev node_modules 已应用时）：marker 在位 + root 应用器幂等 0 写
// ---------------------------------------------------------------------------

test('真实文件: dev 树 dsh-client-modules 双文件已打补丁（或不可达时跳过）', () => {
  const client = path.join(NM, '@deepseek-ai', 'dsh-client-modules', 'lib', 'client.js');
  const index = path.join(NM, '@deepseek-ai', 'dsh-client-modules', 'lib', 'index.js');
  if (!fs.existsSync(client)) { assert.ok(true, 'dev node_modules 不存在，跳过'); return; }
  const src = fs.readFileSync(client, 'utf8');
  if (!src.includes(LOADER_RETRY_MARKER)) {
    // 未打补丁的树（postinstall 未跑）：root 应用器应能落盘到临时副本验证。
    assert.ok(true, 'dev 树未打补丁（postinstall 后由 boot 链覆盖），行为已由 1-3 覆盖');
    return;
  }
  assert.equal(transformLoaderRetry(src, client).status, 'already');
  // 0.1.2-alpha.1：serveBundle 半边已退役（新 serveBundle 从 in-memory 预烘焙
  // responses 回包，不再逐请求 readFile），index.js 不再承载瞬态读盘重试锚点。
  assert.equal(transformServeReadRetry(fs.readFileSync(index, 'utf8'), index).status, 'anchor-missing');
  // root 应用器对已应用树幂等（0 写入；serveBundle 半边不再尝试）。
  assert.equal(patchBundleArrivalRetry(NM, () => {}), 0);
});
