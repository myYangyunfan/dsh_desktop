'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zstdCompressSync } = require('node:zlib');
const { patchSessionPersistence } = require('../patch-session-persistence');
const {
  PERSISTENCE_PKG_REL,
  PERSISTENCE_TORN_MARKER,
  transformPersistenceTornTail,
  PERSISTENCE_CORRUPT_MARKER,
  transformPersistenceCorruptGuard,
  transformPersistenceAll,
} = require('../lib/runtime-patches');
const {
  toPristineSource, transformSessionHeaderScanGuard, transformSessionLoadGraceful,
} = require('../lib/patch-adapters');

// 靶基准：dev node_modules 里的内核副本经 PRISTINE_FAMILIES 逆运算剥掉全部四个
// 持久化补丁后的 pristine 字节。旧实现抓 .tmp-rc2-stage 装配产物、缺省静默回退
// dev 副本 —— 而 dev 副本被 boot 链打过补丁，“基准”其实是补丁态，本文件最后
// 那条「中帧损坏仍必须致命」的用例就是这样被掩盖掉的（K6 把它吞了）。
// 行为用例把「pristine + 全链补丁」写成包内临时 .mjs 再 import：既不改真实
// 文件、也不需整棵 node_modules 拷贝（旧做法单次 47~60s），同时裸 specifier
// 仍能从包目录正常解析。
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const TARGET = path.join(DESKTOP_ROOT, 'node_modules', '@deepseek-ai', PERSISTENCE_PKG_REL);

function kernelPristine() {
  assert.ok(fs.existsSync(TARGET), '找不到内核靶文件：' + TARGET);
  return toPristineSource('session-persistence-family', fs.readFileSync(TARGET, 'utf8'));
}

/** 只写「被改的那一个文件」进临时 nmRoot（root 应用器只碰这一个路径）。 */
function tinyNmRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-persist-rec-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nmRoot = path.join(root, 'node_modules');
  const target = path.join(nmRoot, '@deepseek-ai', PERSISTENCE_PKG_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, kernelPristine());
  return { nmRoot, target };
}

/** 装载「pristine + root 应用器 + registry 文件补丁（K5/K6）」全链产物的模块。 */
async function loadFullStackKernel(t) {
  let src = kernelPristine();
  for (const step of [transformPersistenceAll, transformSessionHeaderScanGuard, transformSessionLoadGraceful]) {
    const r = step(src, TARGET);
    assert.equal(r.status, 'changed', '全链重放必须逐步 changed（得 ' + r.status + '：基准不 pristine 或上游已漂移）：' + (r.detail || ''));
    src = r.src;
  }
  const file = path.join(path.dirname(TARGET),
    'index.recovery-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(file, src);
  t.after(() => fs.rmSync(file, { force: true }));
  return import(pathToFileURL(file).href);
}

function frame(value) {
  return zstdCompressSync(Buffer.from(value, 'utf8'));
}

function fixture() {
  const header = {
    type: 'session',
    version: 0,
    id: 'session-recovery-test',
    createdAt: 1,
    cwd: 'C:/fake',
    delegationDepth: 0,
    agentPreset: 'standard',
  };
  const start = {
    type: 'turn/start',
    seq: 0,
    time: 1,
    data: { turn: 0 },
  };
  const headerFrame = frame(JSON.stringify(header) + '\n');
  return {
    headerFrame,
    start,
    header,
  };
}

test('session persistence patch is applied and idempotent', (t) => {
  const { nmRoot, target } = tinyNmRoot(t);
  const changed = patchSessionPersistence(nmRoot); // pristine 临时树 → 首遍应写盘
  assert.equal(changed, 1, '首遍应应用 1 个文件（得 ' + changed + ' 说锚点未命中）');
  const source = fs.readFileSync(target, 'utf8');
  assert.match(source, new RegExp(PERSISTENCE_TORN_MARKER));
  assert.equal(transformPersistenceTornTail(source, target).status, 'already');
  // 上游 #112：patchSessionPersistence 现经 transformPersistenceAll 同时应用
  // 「损坏会话日志容错」补丁，两个补丁都应已应用（幂等）。
  assert.match(source, new RegExp(PERSISTENCE_CORRUPT_MARKER));
  assert.equal(transformPersistenceCorruptGuard(source, target).status, 'already');
  assert.equal(patchSessionPersistence(nmRoot), 0, '二遍必须 no-op（幂等）');
  assert.equal(fs.readFileSync(target, 'utf8'), source, '二遍不得重复注入');
});

test('complete final zstd frame with torn JSONL returns a repair marker', async (t) => {
  const mod = await loadFullStackKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const { headerFrame, start } = fixture();
  const eventFrame = frame(JSON.stringify(start) + '\n{"type":"assistant/message","seq":1');

  const result = await backend.readZstdPrefix(Buffer.concat([headerFrame, eventFrame]));
  assert.deepEqual(result.events.map((event) => event.type), ['turn/start']);
  assert.deepEqual(result.tornMarker.recoveredEvents.map((event) => event.type), ['turn/start']);
  assert.equal(result.tornMarker.truncateTo, headerFrame.length);
});

test('complete newline-terminated frame keeps the normal no-marker path', async (t) => {
  const mod = await loadFullStackKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const { headerFrame, start } = fixture();
  const end = {
    type: 'turn/end',
    seq: 1,
    time: 2,
    data: { turn: 0, reason: { kind: 'completed' } },
  };

  const result = await backend.readZstdPrefix(Buffer.concat([
    headerFrame,
    frame(JSON.stringify(start) + '\n' + JSON.stringify(end) + '\n'),
  ]));
  assert.deepEqual(result.events.map((event) => event.type), ['turn/start', 'turn/end']);
  assert.equal(result.tornMarker, undefined);
});

// 本用例跑的是「pristine + root 应用器 + K5 + K6」全链，不是单看 torn-tail：
// K6（加载优雅降级）的 catch 一度不分位置地吞掉这个故意的硬抛，并把
// commitRepair 的截盘范围扩大到损坏帧之后 —— 完好历史帧被静默销毁。末帧守卫
// 落地后，中帧损坏必须回到硬抛。
test('torn JSONL in a non-final complete frame remains corruption', async (t) => {
  const mod = await loadFullStackKernel(t);
  const backend = Object.create(mod.JsonlSessionPersistence.prototype);
  const { headerFrame, start } = fixture();
  const tornFrame = frame(JSON.stringify(start) + '\n{"type":"assistant/message","seq":1');
  const followingFrame = frame(JSON.stringify({
    type: 'turn/end',
    seq: 1,
    time: 2,
    data: { turn: 0, reason: { kind: 'completed' } },
  }) + '\n');

  const warns = [];
  const originalWarn = console.warn;
  console.warn = (msg) => { warns.push(String(msg)); };
  try {
    await assert.rejects(
      backend.readZstdPrefix(Buffer.concat([headerFrame, tornFrame, followingFrame])),
      /complete frame contains a torn JSONL record/,
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warns.filter((w) => w.includes('degraded session load')).length, 0,
    '中帧损坏不得走 K6 降级通道（那会连带截盘销毁 followingFrame）');
});
