'use strict';

// unit-session-load-graceful.test.js — v0.5.4 求稳补丁（K6）单测。
//
// 根因（代码推演 + 用户反馈直接采信）：一轮对话触发自动压缩（auto-compaction）
// 后「本轮运行失败」→ 随后「历史加载失败」→ 崩溃。自动压缩把一个多事件批次
// （compaction/start、compaction/summary、user/message replace、compaction/end）
// 一次性追加落盘（append-only，非重写），帧体比单事件帧更大；中断/崩溃后除
// 「结构撕裂的最后一帧」（已被第 1 行 torn-tail 恢复兜住）外，还可能留下
// 「结构完整但校验失败 / seq 断档」的损坏帧——后者让 readZstdPrefix 抛致命错，
// 而 loadHistory 读路径不像 listArtifacts 有 corrupt-guard，于是「历史加载失败」
// 击穿并随后崩溃。
//
// 补丁（patch-adapters.transformSessionLoadGraceful）对内核
// dsh-session-persistence-jsonl/lib/index.js 的 readZstdPrefix 做：
//   解码/校验失败时降级为「加载到最后一个完整帧」——返回已解码前缀 + tornMarker
//   （指向首个损坏帧起始），由 commitRepair 截断损坏尾部并补 closers；
//   console.warn 保留告警（不掩盖真实损坏）；header 帧损坏仍致命（scanner 未建立即重抛）。
//
// 测试手法（与 unit-session-persistence-recovery / unit-session-header-scan-guard 同款）：
//   1) 锚点命中内核源 → changed、含 marker；
//   2) transform 产物 node --check 语法合法；
//   3) 幂等（二遍 already）/ marker-only 短路 / 锚点缺失 anchor-missing 不改写；
//   4) 行为（动态 import 真实内核 transform 产物）：干净日志正常读、seq 断档
//      损坏帧优雅降级（tornMarker + warn、不抛）、header 损坏仍致命；
//   5) 回归：叠加 torn-tail/corrupt-guard/K5 后本补丁仍命中、三 marker 共存；
//   6) registry 装配（layout / pkgRel / transform / marker 同源 / cli:false）。
//
// 运行：node --test scripts/test/unit-session-load-graceful.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { zstdCompressSync, constants } = require('node:zlib');

const {
  transformSessionLoadGraceful,
  transformPersistenceAll,
  transformSessionHeaderScanGuard,
  toPristineSource,
  markers,
} = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { PERSISTENCE_PKG_REL, resolvePatchTargets } = require('../lib/patch-target-resolver');

const MARKER = 'dsh-desktop compat: degrade session load to last complete frame';
// v2 = 末帧守卫形态（本补丁当前产物，也是 registry 的幂等 marker）。
const MARKER_V2 = markers.SESSION_LOAD_GRACEFUL_MARKER_V2;
const TORN_MARKER = 'dsh-desktop compat: recover complete zstd frame torn JSONL tail';
const CORRUPT_MARKER = 'dsh-desktop-corrupt-guard-v1';
const K5_MARKER = 'dsh-desktop fix: session header scan cache + bounded read';

const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// 内核源基准：靶文件本身（dev node_modules 副本）经 PRISTINE_FAMILIES 逆运算剥掉
// 全部四个持久化补丁后的字节。以前这里抓 .tmp-rc2-stage 装配产物，缺省静默回退
// dev node_modules —— 而 dev 副本会被 postinstall/patch-deps/运行时 boot 打过补丁，
// 回退后的“基准”其实是补丁态，于是 8 条 changed 断言集体退化成 already 假红，
// 且真漂移时同样只报 already（哨兵闭嘴）。逆运算对补丁态/pristine 都幂等，
// 不再依赖一次性构建目录。
const NM_TARGET = path.join(DESKTOP_ROOT, 'node_modules', '@deepseek-ai', 'dsh-session-persistence-jsonl', 'lib', 'index.js');

function kernelSourcePath() {
  assert.ok(fs.existsSync(NM_TARGET), '找不到内核靶文件：' + NM_TARGET);
  return NM_TARGET;
}

/** pristine 内核字节（从在野副本逆运算还原）。 */
function kernelSource() {
  return toPristineSource('session-persistence-family', fs.readFileSync(kernelSourcePath(), 'utf8'));
}

/** 在野副本原文（可能是 v1 形态，用作“升级产物 == 全新应用产物”的对账）。 */
function kernelShippedSource() {
  return fs.readFileSync(kernelSourcePath(), 'utf8');
}

/** pristine + 持久化族全链重放（= 真实运行时应得到的字节）。 */
function kernelFullyPatched() {
  const srcFile = kernelSourcePath();
  let src = kernelSource();
  for (const step of [transformPersistenceAll, transformSessionHeaderScanGuard, transformSessionLoadGraceful]) {
    const r = step(src, srcFile);
    assert.equal(r.status, 'changed', '全链重放逐步必须 changed（得 ' + r.status + ' 说基准不 pristine 或上游已漂移）：' + (r.detail || ''));
    src = r.src;
  }
  return src;
}

function frame(value) {
  return zstdCompressSync(Buffer.from(value, 'utf8'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
}

function tmpdir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'dsh-k6-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 把内核源 transform 后写到包内 lib 目录（保证裸 specifier 可解析），动态 import 回来。 */
async function loadTransformedKernel(t) {
  const srcFile = kernelSourcePath();
  // pristine 源上先应用 torn-tail + corrupt-guard（与运行时 root 应用器后的形态
  // 一致），再叠加本补丁，保证「结构撕裂最后一帧回归」等行为测试在 pristine 源上
  // 也能复现 torn-tail 恢复语义（load-graceful 锚点特意取「pristine 与 torn-tail
  // 已应用形态共有的稳定行」，可叠加）。
  let src = kernelSource();
  const base = transformPersistenceAll(src, srcFile);
  assert.equal(base.status, 'changed', 'pristine 基准应未被 torn-tail 打过（否则逆运算没剥干净）');
  src = base.src;
  const r = transformSessionLoadGraceful(src, srcFile);
  assert.equal(r.status, 'changed', '内核源应命中本补丁锚点');
  const file = path.join(path.dirname(srcFile), 'index.k6test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(file, r.src);
  t.after(() => fs.rmSync(file, { force: true }));
  return import(pathToFileURL(file).href);
}

function headerLine() {
  return JSON.stringify({ type: 'session', version: 0, id: 'k6-session', createdAt: 1, cwd: 'C:/fake', delegationDepth: 0, agentPreset: 'standard' }) + '\n';
}

// ---------------------------------------------------------------------------
// 1-3：锚点命中 / 语法合法 / 幂等。
// ---------------------------------------------------------------------------

test('锚点命中内核源 → changed，含 marker（内容契约）', () => {
  // pristine 基准上先应用 torn-tail + corrupt-guard（与运行时 root 应用器后的
  // 形态一致），再应用本补丁，使「frameIndex 应改为赋值」等 torn-tail 组合断言
  // 在 pristine 源上同样成立（不依赖 dev 树已被打过补丁）。
  const srcFile = kernelSourcePath();
  let base = kernelSource();
  const prep = transformPersistenceAll(base, srcFile);
  assert.equal(prep.status, 'changed', 'pristine 基准应未被 torn-tail 打过');
  base = prep.src;
  const r = transformSessionLoadGraceful(base, srcFile);
  assert.equal(r.status, 'changed', '内核源应命中三个锚点');
  assert.ok(r.src.includes(MARKER_V2), '产物应含 v2 marker');
  assert.ok(r.src.includes('let scanner;'), '应提升 scanner 声明');
  assert.ok(r.src.includes('scanner = new SessionLogScanner(headerFrame.value);'), '应改为赋值而非 const 声明');
  assert.ok(r.src.includes('frameIndex = 1;'), 'frameIndex 应改为赋值');
  assert.ok(r.src.includes('degraded session load to last complete frame'), '应含降级告警文案');
  assert.ok(r.src.includes('recoveredEvents: []'), '降级 tornMarker 应含 recoveredEvents: []');
  assert.ok(r.src.includes('throw error;'), 'header 损坏仍重抛');
  // v2 收窄：降级必须要求「损坏帧就是最后一个帧」（本补丁的修复点）。
  assert.ok(r.src.includes('loadFrameIndex >= frames.length - 1'),
    'catch 守卫必须含末帧判定，否则中帧损坏会被降级 + 截盘销毁完好帧');
});

test('升级通道：在野 v1 副本就地补守卫，产物与「pristine 全新应用」逐字节相同', (t) => {
  // 幂等判定靠 marker 短路，所以单改注入体文本是修不了在野副本的：已带 v1 catch
  // 体的文件里 catch 锚点已被吃掉，再跑一遍只会得到 already —— 包括重新 stage
  // 出来的 payload 与用户 profile 里的副本。本用例钉住升级分支存在且收敛。
  const shipped = kernelShippedSource();
  const hasV1 = shipped.includes(MARKER) && !shipped.includes(MARKER_V2);
  const normalized = hasV1 ? (() => {
    const r = transformSessionLoadGraceful(shipped, NM_TARGET);
    assert.equal(r.status, 'changed', '在野 v1 副本必须走升级通道（不得被 marker 短路拦成 already）');
    assert.equal(r.note, 'v1-repair');
    assert.ok(r.src.includes(MARKER_V2), '升级后应带 v2 marker');
    assert.ok(r.src.includes('loadFrameIndex >= frames.length - 1'), '升级后应带末帧守卫');
    return r.src;
  })() : shipped;
  assert.equal(transformSessionLoadGraceful(normalized, NM_TARGET).status, 'already', '升级后二遍必须幂等');
  if (shipped.includes(K5_MARKER)) {
    // 在野副本带齐全链时，规范化后的字节必须等于「pristine 重放全链」的产物；
    // 不等则说明逆运算推的历史与在野形态有出入（或者升级分支漏改了文本）。
    assert.equal(normalized, kernelFullyPatched(),
      '升级产物必须与「pristine 全新应用」逐字节相同');
  } else {
    t.diagnostic('在野副本未带 K5（环境差异），跳过全链逐字节对账');
  }
});

test('transform 产物语法合法（node --check）', (t) => {
  const r = transformSessionLoadGraceful(kernelSource(), NM_TARGET);
  assert.equal(r.status, 'changed');
  const dir = tmpdir(t, 'dsh-k6-check-');
  const checkFile = path.join(dir, 'index.mjs');
  fs.writeFileSync(checkFile, r.src);
  const res = spawnSync(process.execPath, ['--check', checkFile], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, '补丁产物必须语法合法: ' + (res.stderr || ''));
});

test('幂等：第二遍 already / marker-only 短路 / 锚点缺失 anchor-missing 不改写', () => {
  const changed = transformSessionLoadGraceful(kernelSource(), NM_TARGET);
  assert.equal(changed.status, 'changed');
  assert.equal(transformSessionLoadGraceful(changed.src, NM_TARGET).status, 'already');
  assert.equal(transformSessionLoadGraceful('// ' + MARKER_V2 + '\n', 't.js').status, 'already');
  // 只带 v1 marker、不带 v1 守卫行的文本：既不能当 already（那是旧补丁的形态），
  // 也不能被重注（会双份注入），必须落 anchor-missing 让上层告警退役。
  assert.equal(transformSessionLoadGraceful('// ' + MARKER + '\n', 't.js').status, 'anchor-missing');
  const miss = transformSessionLoadGraceful('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变更'));
  assert.equal(miss.src, undefined, '失配时不得返回改写源');
});

// ---------------------------------------------------------------------------
// 4：行为（动态 import 真实内核 transform 产物）。
// ---------------------------------------------------------------------------

test('干净日志：正常读回事件、无 tornMarker', async (t) => {
  const mod = await loadTransformedKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const hf = frame(headerLine());
  const ef = frame(
    JSON.stringify({ type: 'turn/start', seq: 0, time: 1, data: { turn: 0 } }) + '\n' +
    JSON.stringify({ type: 'turn/end', seq: 1, time: 2, data: { turn: 0, reason: { kind: 'completed' } } }) + '\n',
  );
  const result = await backend.readZstdPrefix(Buffer.concat([hf, ef]), undefined);
  assert.deepEqual(result.events.map((e) => e.type), ['turn/start', 'turn/end']);
  assert.equal(result.tornMarker, undefined);
});

test('seq 断档损坏帧：优雅降级为 tornMarker、不抛致命错、且告警', async (t) => {
  const mod = await loadTransformedKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const hf = frame(headerLine());
  // seq=5 与 scanner 期望的 seq=0 断档 → SessionLogScanner 标记 issue →
  // 帧级 committedBytes !== inputBytes → 原实现抛「complete frame contains a torn JSONL record」。
  const ef = frame(JSON.stringify({ type: 'turn/start', seq: 5, time: 1, data: { turn: 0 } }) + '\n');
  const warns = [];
  const originalWarn = console.warn;
  console.warn = (msg) => { warns.push(String(msg)); };
  t.after(() => { console.warn = originalWarn; });
  try {
    const result = await backend.readZstdPrefix(Buffer.concat([hf, ef]), undefined);
    assert.deepEqual(result.events, [], '断档帧内事件不得进入已解码前缀');
    assert.ok(result.tornMarker, '应返回 tornMarker 而非抛错');
    assert.equal(result.tornMarker.truncateTo, hf.length, 'truncateTo 应指向损坏帧起始（header 帧之后）');
    assert.deepEqual(result.tornMarker.recoveredEvents, []);
    assert.equal(warns.length, 1, '降级应 emit 一条 console.warn 告警');
    assert.ok(warns[0].includes('degraded session load to last complete frame'), '告警应含降级文案');
  } finally {
    console.warn = originalWarn;
  }
});

test('结构撕裂最后一帧回归：既有 torn-tail 恢复仍生效（无致命错）', async (t) => {
  const mod = await loadTransformedKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const hf = frame(headerLine());
  // 完整 turn/start 帧后接一个被截断的帧（结构撕裂）。
  const ef = frame(JSON.stringify({ type: 'turn/start', seq: 0, time: 1, data: { turn: 0 } }) + '\n');
  const torn = ef.subarray(0, ef.length - 10);
  const result = await backend.readZstdPrefix(Buffer.concat([hf, torn]), undefined);
  assert.ok(Array.isArray(result.events), '结构撕裂帧不得导致抛错');
  assert.ok(result.tornMarker, '结构撕裂帧应返回 tornMarker');
  assert.equal(result.tornMarker.truncateTo, hf.length, 'truncateTo 应指向撕裂帧起始');
});

test('header 帧损坏仍致命：scanner 未建立即重抛', async (t) => {
  const mod = await loadTransformedKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  // 合法 zstd 帧但内容不是 JSON header → SessionLogScanner 构造失败，scanner 未建立 → 重抛。
  const badHdr = frame('garbage not json\n');
  await assert.rejects(
    backend.readZstdPrefix(badHdr, undefined),
    /corrupt session log: header line is not valid JSON/,
    'header 帧损坏必须保持致命（不能降级为无 header 的会话）',
  );
});

// 中帧损坏（损坏帧不是最后一个帧）：v1 不设位置守卫，中帧损坏也会返回
// tornMarker，而上游 commitRepair 拿到 marker 后是 `repair(meta, truncateTo)`
// —— 按字节截磁盘文件。后果：损坏帧之后的完好帧被连带销毁，而且是在用户
// 下次打开历史时静默发生。torn-tail 自身声明 earlier frame 的撕裂记录仍是硬
// 错误，所以“仅末帧才降级”同时满足两边的契约。
test('中帧损坏（末帧之前）：仍硬抛，不得降级截盘销毁其后完好帧', async (t) => {
  const mod = await loadTransformedKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const hf = frame(headerLine());
  const goodFrame = frame(JSON.stringify({ type: 'turn/end', seq: 9, time: 3, data: { turn: 0, reason: { kind: 'completed' } } }) + '\n');
  const cases = [
    ['结构完整但帧内 JSONL 撕裂', frame(JSON.stringify({ type: 'turn/start', seq: 0, time: 1, data: { turn: 0 } }) + '\n{"type":"assistant/message","seq":1')],
    ['结构完整但 seq 断档', frame(JSON.stringify({ type: 'turn/start', seq: 5, time: 1, data: { turn: 0 } }) + '\n')],
  ];
  for (const [name, midBad] of cases) {
    const warns = [];
    const originalWarn = console.warn;
    console.warn = (msg) => { warns.push(String(msg)); };
    try {
      await assert.rejects(
        backend.readZstdPrefix(Buffer.concat([hf, midBad, goodFrame]), undefined),
        /complete frame contains a torn JSONL record/,
        name + '：中帧损坏必须硬抛（上游 torn-tail 明文契约）',
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warns.filter((w) => w.includes('degraded session load')).length, 0,
      name + '：中帧损坏不得 emit 降级告警（那意味着 commitRepair 会截盘销毁完好帧）');
  }
});

// ---------------------------------------------------------------------------
// 5：回归 —— torn-tail / corrupt-guard / K5 语义共存。
// ---------------------------------------------------------------------------

test('回归：叠加 torn-tail/corrupt-guard/K5 后本补丁仍命中、三 marker 共存', () => {
  let base = kernelSource();
  const all = transformPersistenceAll(base, NM_TARGET);
  if (all.status === 'changed') base = all.src;
  const k5 = transformSessionHeaderScanGuard(base, NM_TARGET);
  if (k5.status === 'changed') base = k5.src;
  const k6 = transformSessionLoadGraceful(base, NM_TARGET);
  assert.equal(k6.status, 'changed', '叠加既有补丁后本补丁仍应命中');
  const out = k6.src;
  assert.ok(out.includes(TORN_MARKER), 'torn-tail marker 应保留');
  assert.ok(out.includes(CORRUPT_MARKER), 'corrupt-guard marker 应保留');
  assert.ok(out.includes(K5_MARKER), 'K5 header 扫描缓存 marker 应保留');
  assert.ok(out.includes(MARKER), '本补丁 marker 应存在');
  assert.ok(out.includes('} catch (corruptError) {'), 'corrupt-guard catch 应保留');
  assert.ok(out.includes('skipping corrupt session log'), 'corrupt-guard warn 跳过文案应保留');
});

// ---------------------------------------------------------------------------
// 6：registry 装配。
// ---------------------------------------------------------------------------

test('registry：session-load-graceful 规格装配与布局正确', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'session-load-graceful');
  assert.ok(spec, '注册表应含 session-load-graceful');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, false, 'cli:false（对齐 session-header-scan-guard 先例，不动 CLI 清单）');
  assert.equal(spec.transform, transformSessionLoadGraceful, 'transform 与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER_V2, '幂等 marker 必须是 v2（用 v1 会把在野副本拦在升级通道外）');
  assert.equal(markers.SESSION_LOAD_GRACEFUL_MARKER_V2, MARKER_V2, 'marker 单一数据源导出');
  assert.equal(PERSISTENCE_PKG_REL.split(path.sep).join('/'), 'dsh-session-persistence-jsonl/lib/index.js', '目标文件为会话持久化运行时入口');
  assert.ok(!getSpecsByCli().some((s) => s.id === 'session-load-graceful'), 'cli:false 不进 CLI 清单');
});

test('registry：runtime-local / wsl 布局落点覆盖内核可加载副本', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'session-load-graceful');
  const ctx = { home: 'C:\\h', appDir: 'C:\\app', userDataDir: 'C:\\ud', wslMode: false };
  const local = resolvePatchTargets(ctx, { ...spec, pkgRel: PERSISTENCE_PKG_REL });
  const norm = (f) => f.split(path.sep).join('/');
  assert.ok(local.some((f) => norm(f) === 'C:/app/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js'), '本地副本须含 appDir 内核副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/h/profiles/node_modules/')), '含 profile fallback 副本');
  assert.ok(local.some((f) => norm(f).startsWith('C:/ud/agent/node_modules/')), '含 agent overlay 副本');
  const wsl = resolvePatchTargets({ ...ctx, wslMode: true }, { ...spec, pkgRel: PERSISTENCE_PKG_REL });
  assert.ok(wsl.some((f) => norm(f) === 'C:/h/agent/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js'), 'WSL 布局须含 UNC agent 副本');
});
