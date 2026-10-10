'use strict';

// 「静默失败原文上身」两条诊断补丁的单测。
//
// 起因（mac 端彻查 2026-10-10）：v1.0.0/v1.0.1 连续两轮，9 个伴随插件只有
// 「failed to load — auto-isolated」一行、发送文件恒报 prompt rejected 却查不到
// 真因。静默由三段叠加而成，逐段都有字节依据：
//   ① 0.2.0-rc.2 起插件导入失败不再抛出——cordis-plugin-loader 的 Entry._init
//      只 `this.ctx.logger.error(error); return;`，条目就此没有 fiber；
//   ② cordis 默认 LoggerService 的 exporter 是**纯内存环形缓冲**（只 push 进
//      self.buffer，不打印）；
//   ③ boot() 另挂的诊断 exporter 把 warn/error 收进 startupLogs，只在抛
//      StartupError 时才由 bin.js reportStartupFailure 落盘
//      <DSH_HOME>/logs/startup-*.log——而 loader-activation-isolation 恰好让
//      非核心条目不再抛 StartupError。
// 本补丁只在两处 catch 里补一行 stderr：不改判定、不改返回值、各自 try 包裹
// （诊断绝不反噬宿主），RemoteError 的 code 与 details 不动（error-codes 契约）。
//
// 运行时用例把真实字节里的 `_init` 方法体 / `catch (error) {...}` 块**原文**取出来
// 执行，所以证的是注入后的真代码；pristine 对照面同法执行，用来证明「补丁前确实
// 一个字都不打」——这条反证就是本次彻查的机制本身。
// 本文件对 node_modules 只读，绝不改写。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LOADER_IMPORT_REPORT_MARKER,
  PROMPT_ADMISSION_REASON_MARKER,
  transformLoaderImportFailureReport,
  transformPromptAdmissionReasonReport,
} = require('../lib/loader-isolation');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { parseMarkers } = require('../plugin-core/lib/markers');

const repoRoot = path.resolve(__dirname, '..', '..');
const loaderFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js');
const sessionFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-api-session-controller', 'lib', 'index.js');

/** 捕获若干次 stderr 写入（诊断行的唯一去处），返回 chunk 数组。 */
async function captureStderr(fn) {
  const real = process.stderr.write.bind(process.stderr);
  const chunks = [];
  process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stderr.write = real;
  }
  return chunks;
}

/** dev 树已被 patch-runner 注入时，剥掉注入体得到 pristine 对照面；未注入则原样返回。
 *  仅适用于「纯插入」型注入（loader 那条）。 */
function stripInjection(src, injectStart, injectEndExclusive) {
  const i = src.indexOf(injectStart);
  if (i === -1) return src;
  const j = src.indexOf(injectEndExclusive, i);
  assert.notEqual(j, -1, '已注入态必须能定位注入体收尾');
  const out = src.slice(0, i) + src.slice(j);
  // 剥不干净就退化成「拿 patched 当 pristine 对照」，反证会静默失真（实测踩到：
  // 注入体多了一行后起始探针不再命中，三个用例一起飘）。
  assert.equal(out, out.replace(/\[loader-diagnostic\]|\[prompt-admission\]/g, ''), '对照面必须真的没有注入体');
  return out;
}

function pristineLoader() {
  return stripInjection(
    fs.readFileSync(loaderFile, 'utf8'),
    '\t\t\ttry {\n\t\t\t\tconst _ir = [];',
    '\t\t\tthis.ctx.logger.error(error);',
  );
}

// prompt 兜底那条是**整行替换**（旧的无信息 throw 换成带摘要模板 + 前置 try 写栈），
// 反推必须两步都还：删掉插入的 try 段，再把 throw 行还原成旧字面。
const PRISTINE_THROW = '\t\t\t\tthrow new RemoteError("session/agent-busy", "prompt rejected", { reason: String(error) });';
const PATCHED_THROW = '\t\t\t\tthrow new RemoteError("session/agent-busy", `prompt rejected: ${String(error && error.message ? error.message : error).slice(0, 400)}`, { reason: String(error) });';

function pristineSession() {
  let src = fs.readFileSync(sessionFile, 'utf8');
  if (!src.includes(PROMPT_ADMISSION_REASON_MARKER)) return src;
  const start = src.indexOf('\t\t\t\ttry {\n\t\t\t\t\tconst _pr = [];');
  assert.notEqual(start, -1, '已注入态必须能定位插入段');
  const end = src.indexOf('\t\t\t\t} catch {}\n', start);
  assert.notEqual(end, -1, '已注入态必须能定位插入段收尾');
  src = src.slice(0, start) + src.slice(end + '\t\t\t\t} catch {}\n'.length);
  assert.ok(src.includes(PATCHED_THROW), '注入后的 throw 行形状变了（对照面还不回原形）');
  src = src.replace(PATCHED_THROW, PRISTINE_THROW);
  assert.equal(src.includes('[prompt-admission]'), false, '对照面必须真的没有注入体');
  assert.equal(src.includes('prompt rejected:'), false, '对照面必须真的没有带摘要报文');
  return src;
}

/** 取 `_init` 方法体原文，做成可 call(entry) 的 async 函数。 */
function extractInit(src) {
  const sig = 'async _init() {';
  const start = src.indexOf(sig);
  assert.notEqual(start, -1, 'Entry._init 必须还在');
  const open = src.indexOf('{', start + sig.length - 1);
  const close = src.indexOf('\n\t}', open);
  assert.notEqual(close, -1, '方法体闭合必须可定位');
  const body = src.slice(open + 1, close);
  const fn = new Function('return async function _init() {' + body + '\n}')();
  assert.equal(typeof fn, 'function');
  return fn;
}

/** 取 prompt 准入链的 `catch (error) {...}` 块原文，包成 try/throw 后执行。 */
function runAdmissionCatch(src, error) {
  // 探针用 'prompt rejected'（全文件唯一）而不是 remoteErrorOf——后者在别的
  // catch 里同款出现 2 次，first-index 会抓到另一个准入块。
  const at = src.indexOf('prompt rejected');
  assert.notEqual(at, -1, '准入兜底分支必须还在');
  assert.equal(src.indexOf('prompt rejected', at + 1), -1, '探针必须唯一');
  const start = src.lastIndexOf('catch (error) {', at);
  assert.notEqual(start, -1);
  const close = src.indexOf('\n\t\t\t}', at);
  assert.notEqual(close, -1, 'catch 块闭合必须可定位');
  const seg = src.slice(start, close + '\n\t\t\t}'.length);
  class RemoteError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.name = 'RemoteError'; this.details = details; }
  }
  class AttachmentError extends Error {}
  const bodyText = 'try { throw error; } ' + seg;
  const fn = new Function('RemoteError', 'AttachmentError', 'remoteErrorOf', 'error', bodyText);
  let caught = null;
  try {
    fn(RemoteError, AttachmentError, () => void 0, error);
  } catch (e) {
    caught = e;
  }
  return caught;
}

const realFailure = async () => {
  try {
    await import('dsh-diagnostic-report-no-such-package');
  } catch (e) {
    // 内核 loader 的真形状：外层包一层带 cause 的 Error（cordis _method 也会顺 cause 递归）。
    throw new Error('Failed to load plugin @deepseek-ai/dsh-settings', { cause: e });
  }
};

const makeEntry = (logged) => ({
  options: { id: 'settings', name: '@deepseek-ai/dsh-settings' },
  parent: { tree: { import: realFailure } },
  ctx: { logger: { error: (e) => logged.push(e) } },
  loader: { unwrapExports: (x) => x, showLog: () => {} },
  _patchContext: () => {},
  getOuterStack: () => [],
});

test('真实 vendored cordis-plugin-loader：导入失败锚点命中、幂等、判定面不动', () => {
  const src = fs.readFileSync(loaderFile, 'utf8');
  const pristine = pristineLoader();
  const r1 = transformLoaderImportFailureReport(pristine, loaderFile);
  assert.equal(r1.status, 'changed', 'rc.2 字节里必须命中导入失败 catch（失配=靶漂了）');
  assert.equal(transformLoaderImportFailureReport(r1.src, loaderFile).status, 'already', '幂等');
  assert.equal(r1.src.split('[loader-diagnostic] entry ').length - 1, 1, '注入体只出现一次');
  // 上游判定面一字不让动：logger.error 仍在原位、return 仍在、throw 计数不变
  // （throw 计数是 rc.2「上游原生逐条目隔离」的退役哨兵，见 unit-loader-isolation）。
  assert.ok(r1.src.includes('\t\t\tthis.ctx.logger.error(error);\n\t\t\treturn;'), '原 catch 尾部保持');
  assert.equal(r1.src.split('this.ctx.logger.error(error);').length - 1, pristine.split('this.ctx.logger.error(error);').length - 1);
  assert.equal((r1.src.match(/\bthrow\b/g) || []).length, (pristine.match(/\bthrow\b/g) || []).length);
  if (src.includes(LOADER_IMPORT_REPORT_MARKER)) {
    assert.equal(transformLoaderImportFailureReport(src, loaderFile).status, 'already');
  }
});

test('真实 vendored dsh-api-session-controller：兜底锚点命中、幂等、code/details 不动', () => {
  const src = fs.readFileSync(sessionFile, 'utf8');
  const pristine = pristineSession();
  const r1 = transformPromptAdmissionReasonReport(pristine, sessionFile);
  assert.equal(r1.status, 'changed', 'rc.2 字节里必须命中准入兜底（失配=靶漂了）');
  assert.equal(transformPromptAdmissionReasonReport(r1.src, sessionFile).status, 'already', '幂等');
  assert.ok(r1.src.includes('{ reason: String(error) });'), 'details.reason 原样保留');
  assert.equal(r1.src.split('"session/agent-busy"').length - 1, pristine.split('"session/agent-busy"').length - 1);
  if (src.includes(PROMPT_ADMISSION_REASON_MARKER)) {
    assert.equal(transformPromptAdmissionReasonReport(src, sessionFile).status, 'already');
  }
});

test('反证：锚点失配绝不改写文件（版本漂移时的静默防线）', () => {
  const mutated = pristineLoader().replace(
    'this.parent.tree.import(this.options.name, this.getOuterStack)',
    'this.parent.tree.import(this.options.name)',
  );
  assert.notEqual(mutated, pristineLoader(), '反证必须先真的改掉锚点');
  const r = transformLoaderImportFailureReport(mutated, loaderFile);
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined, 'anchor-missing 时绝不返回改写内容');

  const smut = pristineSession().replace(
    'throw new RemoteError("session/agent-busy", "prompt rejected", { reason: String(error) });',
    'throw new RemoteError("session/agent-busy", "prompt refused", { reason: String(error) });',
  );
  assert.notEqual(smut, pristineSession(), '反证必须先真的改掉锚点');
  const sr = transformPromptAdmissionReasonReport(smut, sessionFile);
  assert.equal(sr.status, 'anchor-missing');
  assert.equal(sr.src, undefined);
});

test('CRLF 产物：归一化命中后按原 EOL 写回', () => {
  const crlf = pristineLoader().replace(/\n/g, '\r\n');
  const r = transformLoaderImportFailureReport(crlf, loaderFile);
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes('\r\n'), '必须按原 EOL 写回');
  assert.ok(!r.src.includes('\r\r'), '不得出现双重换行');
  assert.ok(r.src.replace(/\r\n/g, '\n').includes('import failed:'), 'CRLF 往返后注入体仍在');
});

test('运行时真身①：pristine 对 stderr 完全静默，patched 打出原始堆栈与 cause 链', async () => {
  const pristine = pristineLoader();
  const patched = transformLoaderImportFailureReport(pristine, loaderFile).src;
  assert.ok(patched.includes('[loader-diagnostic] entry '), '对照面必须是已注入文本');

  const loggedPristine = [];
  const chunksPristine = await captureStderr(() => extractInit(pristine).call(makeEntry(loggedPristine)));
  const loggedPatched = [];
  const chunksPatched = await captureStderr(() => extractInit(patched).call(makeEntry(loggedPatched)));

  // 反证 = 本次彻查的机制本身：补丁前真实异常只进内存缓冲，stderr 一个字节都没有。
  assert.deepEqual(chunksPristine, [], '补丁前必须完全静默，否则这条守卫就失去了意义');
  assert.equal(loggedPristine.length, 1, '补丁前只进 logger（cordis 默认 exporter 不打印）');

  // 正证：原文进 stderr，且判定面不变（不抛、logger 照旧、fiber 仍不赋）。
  assert.equal(chunksPatched.length, 1, '一次失败只写一行');
  const line = chunksPatched[0];
  assert.ok(line.startsWith('[loader-diagnostic] entry settings (@deepseek-ai/dsh-settings) import failed:'), line.slice(0, 200));
  assert.ok(line.includes('ERR_MODULE_NOT_FOUND'), '必须带上真实错误码：' + line.slice(0, 300));
  assert.ok(line.includes('dsh-diagnostic-report-no-such-package'), '必须带上缺哪个包');
  assert.ok(line.includes(' <- '), 'cause 链要串起来');
  assert.ok(line.endsWith('\n'));
  assert.ok(line.length <= 6200, '超长堆栈要截断（实际 ' + line.length + '）');
  assert.equal(loggedPatched.length, 1, 'logger.error 调用面不动');
});

test('运行时真身①：诊断写不进也不能把导入失败变成崩溃（try 包裹）', () => {
  const patched = transformLoaderImportFailureReport(pristineLoader(), loaderFile).src;
  const entry = makeEntry([]);
  entry.options = null; // 让注入体自己在取 id 时炸掉
  // _init 本身必须照常返回 undefined（导入失败被隔离的语义不变）。
  return extractInit(patched).call(entry).then(
    (v) => assert.equal(v, undefined, '诊断异常不得逃逸'),
    (e) => assert.fail('诊断反噬宿主: ' + e.message),
  );
});

test('运行时真身③：pristine 报文无信息且不落日志，patched 带原因摘要 + 整栈进 stderr', async () => {
  const pristine = pristineSession();
  const patched = transformPromptAdmissionReasonReport(pristine, sessionFile).src;

  class AttachmentError extends Error {}
  void AttachmentError;
  const boom = new TypeError('Cannot read properties of undefined (reading "admitPromptContent")');
  boom.cause = new Error("EACCES: permission denied, open 'attachments/v1/ab/abc'");

  const chunksPristine = await captureStderr(async () => runAdmissionCatch(pristine, boom));
  const e0 = runAdmissionCatch(pristine, boom);
  assert.deepEqual(chunksPristine, [], '补丁前：真实异常不进 stderr');
  assert.equal(e0.message, 'prompt rejected', '补丁前的报文就是一句无信息的 prompt rejected');
  assert.equal(e0.details.reason, String(boom));

  const chunksPatched = await captureStderr(async () => runAdmissionCatch(patched, boom));
  const e1 = runAdmissionCatch(patched, boom);
  assert.equal(chunksPatched.length, 1, '一次失败只写一行');
  assert.ok(chunksPatched[0].startsWith('[prompt-admission]'), chunksPatched[0].slice(0, 200));
  assert.ok(chunksPatched[0].includes('TypeError: Cannot read properties of undefined'), 'stderr 必须是原始异常');
  assert.ok(chunksPatched[0].includes('EACCES: permission denied'), 'cause 也在（栈全文未截时）');
  assert.equal(e1.code, 'session/agent-busy', 'code 不许动（error-codes 契约 + 前端分支）');
  assert.equal(e1.details.reason, String(boom), 'details.reason 原样保留');
  assert.ok(e1.message.startsWith('prompt rejected: '), e1.message);
  assert.ok(e1.message.includes('admitPromptContent'), 'toast 上要看得见真因摘要：' + e1.message);
  assert.ok(e1.message.length <= 'prompt rejected: '.length + 400, '原因摘要必须截断');
});

test('新前缀不喂壳层标记机：quarantine 事件数不受诊断行影响', () => {
  const line = '[loader-diagnostic] entry settings (@deepseek-ai/dsh-settings) import failed: Error x <- y\n';
  assert.deepEqual(parseMarkers(line).isolations, [], '[loader-diagnostic] 不是隔离标记');
  assert.deepEqual(parseMarkers(line).attributes, []);
  const iso = '[loader-isolation] entry settings (@deepseek-ai/dsh-settings): failed to load — auto-isolated\n';
  assert.equal(parseMarkers(iso).isolations.length, 1, '在役隔离标记照常识别');
});

test('注册表接线：两条诊断补丁在 guard 组、cli:false、failPolicy warn', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const id of ['loader-import-failure-report', 'prompt-admission-reason-report']) {
    const spec = byId[id];
    assert.ok(spec, id + ' 必须登记进 PATCH_SPECS');
    assert.equal(spec.group, 'guard');
    assert.equal(spec.cli, false, '诊断补丁只走桌面壳 boot 链');
    assert.equal(spec.failPolicy, 'warn', '锚点失配只告警，绝不把启动拖崩');
    assert.equal(typeof spec.transform, 'function');
    assert.ok(spec.marker && spec.marker.startsWith('dsh-desktop isolation:'), 'marker 与注入体同源');
    assert.ok(!spec.pkgRel.includes('undefined'));
  }
  const orders = PATCH_SPECS.map((s) => s.order);
  assert.equal(new Set(orders).size, orders.length, 'order 全局唯一');
});
