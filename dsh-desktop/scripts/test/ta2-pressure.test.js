'use strict';

// ta2-pressure.test.js — TA2 压力 / 洪水 / 毒化元数据组合测试。
//
//   1) dsh-subagent-lens 提取器：600 会话 × 每会话 50 工具调用事件流，
//      提取耗时 <500ms、脏数据零异常；
//   2) session-watcher 行解析：1MB 行 ×100 流式丢弃，内存稳定 + 帧扫描容错；
//   3) hub-registry 校验器：100 份（毒化）插件清单校验耗时上界；
//   4) versions.compareVersions：随机毒化版本串 + 全序/反对称 oracle；
//   5) chunk-availability（dsh-better-sidebar）：1000 订阅者 × 退避循环，
//      单循环单定时器、退订后零 pending。
// 运行：node --test scripts/test/ta2-pressure.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const zlib = require('node:zlib');

const REPO = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xFACADE);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

// ---------------------------------------------------------------------------
// 1) subagent-lens 提取器压力：600 会话 × 50 工具调用
// ---------------------------------------------------------------------------
const LENS_SRC = fs.readFileSync(path.join(REPO, 'assets', 'plugins', 'dsh-subagent-lens', 'lib', 'client.js'), 'utf8');

function loadLensExports() {
  const loads = [];
  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => loads.push(def) } },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.createContext(sandbox);
  vm.runInContext(LENS_SRC, sandbox, { filename: 'dsh-subagent-lens/lib/client.js' });
  const reactStub = {
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {}, useMemo: (f) => f(), useRef: (v) => ({ current: v }),
    useSyncExternalStore: (_s, g) => g(), Fragment: '::F::',
  };
  const mod = loads[0].factory((spec) => {
    if (spec === 'react') return reactStub;
    if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: '::F::' };
    throw new Error('ta2: 非预期 require ' + spec);
  });
  return mod;
}

test('压力：600 会话 × 50 工具调用提取 <500ms、脏数据零异常', () => {
  const mod = loadLensExports();
  assert.equal(typeof mod.activityFromEvents, 'function');
  const TOOLS = ['Task', 'subagent', 'subagent_fork', 'bash', 'pwsh', 'read', 'write', 'edit', 'glob', '毒工具', 'unknown-x'];
  const makeSessionEvents = () => {
    const events = [];
    for (let k = 0; k < 50; k++) {
      const name = pick(TOOLS);
      let args;
      if (chance(0.05)) args = pick([null, undefined, 'str', 42, []]); // 脏参数
      else if (name === 'Task') args = chance(0.5) ? { prompt: 'x'.repeat(200), subagent_type: 'code' } : { description: 'd' };
      else if (name === 'bash' || name === 'pwsh') args = { command: chance(0.5) ? 'ls -la' : 'écho "毒"' };
      else args = { file_path: '/home/u/file-' + k + '.ts', content: chance(0.3) ? '\u0000'.repeat(10) : 'ok' };
      events.push(chance(0.05)
        ? pick([null, undefined, {}, { type: 'tool/call' }, { type: 'tool/call', data: null }, { type: 'text-chunk', data: { texts: 'bad' } }])
        : { type: 'tool/call', seq: k, data: { callId: 'c' + k, name, arguments: args } });
    }
    return events;
  };
  const sessions = [];
  for (let i = 0; i < 600; i++) sessions.push(makeSessionEvents());

  // 预热 JIT 后计时
  mod.summarizeActivity(mod.activityFromEvents(sessions[0]));
  if (global.gc) global.gc();
  const t0 = process.hrtime.bigint();
  let total = 0;
  for (const events of sessions) {
    let activity, summary;
    assert.doesNotThrow(() => { activity = mod.activityFromEvents(events); }, '脏数据零异常');
    assert.doesNotThrow(() => { summary = mod.summarizeActivity(activity); }, '汇总零异常');
    assert.ok(activity && summary);
    total++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(total, 600);
  assert.ok(ms < 500, '600 会话提取+汇总耗时 <500ms，实际 ' + ms.toFixed(1) + 'ms');
});

// ---------------------------------------------------------------------------
// 2) watcher 行解析：1MB 行 ×100 流式丢弃 + 帧扫描容错
// ---------------------------------------------------------------------------
const { scanZstdFrames, expandRow } = require(path.join(REPO, 'session-watcher.js'));

test('压力：1MB 行 ×100 流式丢弃，内存稳定（堆增长 <32MB）', () => {
  // 构造约 1MB 的行集合（每行一个 JSONL 记录，多为 text-chunks 流式丢弃型）
  const makeLine = (i) => JSON.stringify({ type: pick(['text-chunks', 'reasoning-chunks', 'tool-call-chunks', 'message']), data: { texts: ['chunk-' + i + '-' + 'x'.repeat(64)] }, t: i });
  let oneMb = '';
  for (let i = 0; oneMb.length < 1024 * 1024; i++) oneMb += makeLine(i) + '\n';
  const lines = oneMb.split('\n').filter(Boolean);

  const iterate = () => {
    let dropped = 0, kept = 0;
    for (const line of lines) {
      const out = expandRow(line); // 流式：chunks 型展开后即被消费丢弃
      if (out.length === 1 && out[0]?.type === 'text-chunks') dropped++; else kept++;
    }
    return { dropped, kept };
  };
  iterate(); // 预热
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let round = 0; round < 100; round++) iterate();
  if (global.gc) global.gc();
  const after = process.memoryUsage().heapUsed;
  assert.ok(after - before < 32 * 1024 * 1024, '100 轮 1MB 行流式丢弃后堆增长 <32MB，实际 ' + ((after - before) / 1048576).toFixed(1) + 'MB');
});

test('scanZstdFrames：多帧 + 垃圾毒化容错不抛', () => {
  const frame = zlib.zstdCompressSync(Buffer.from('{"type":"message"}\n', 'utf8'));
  const buf = Buffer.concat([frame, Buffer.from('garbage-not-magic'), frame, Buffer.from([0]), frame]);
  let out;
  assert.doesNotThrow(() => { out = scanZstdFrames(buf); });
  assert.ok(out.frames.length >= 1);
  for (const bad of [Buffer.alloc(0), Buffer.from('x'), Buffer.alloc(8)]) {
    assert.doesNotThrow(() => scanZstdFrames(bad));
  }
});

// ---------------------------------------------------------------------------
// 3) hub-registry：100 份毒化插件清单校验耗时上界
// ---------------------------------------------------------------------------
const hubRegistry = require(path.join(REPO, 'scripts', 'lib', 'hub-registry.js'));

test('压力：100 份（毒化）插件元数据校验耗时上界 + 毒化不抛', () => {
  // 用真实 companion 插件目录做基线 + 毒化插件清单
  const realPlugins = hubRegistry.collectRegistrablePlugins
    ? null : null;
  const plugins = [];
  for (let i = 0; i < 100; i++) {
    plugins.push({
      name: chance(0.9) ? 'dsh-ta2-' + i : pick([null, undefined, '', 'BAD NAME', '毒'.repeat(80), 42]),
      version: chance(0.9) ? '0.' + i + '.0' : pick([null, '', 'x.y.z', '1', '毒.0', 99, '1.2.3-rc.1']),
      description: chance(0.9) ? 'ta2 fixture ' + i : pick([null, undefined, 42, 'x'.repeat(10_000)]),
      source: chance(0.5) ? 'bundled' : 'hotpack',
    });
  }
  // inspectCompanionMeta(dir, plugin)：目录缺失 / package.json 损坏 → ok:false 不抛
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ta2-hub-'));
  try {
    const t0 = process.hrtime.bigint();
    for (const p of plugins) {
      let r;
      assert.doesNotThrow(() => { r = hubRegistry.inspectCompanionMeta(tmp, p); }, '毒化元数据不抛: ' + JSON.stringify(p?.name));
      assert.ok(r && typeof r.ok === 'boolean' && Array.isArray(r.reasons));
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 1000, '100 份清单校验 <1s，实际 ' + ms.toFixed(1) + 'ms');
    // 一份有效 package.json → 通过 name/version 校验路径
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: plugins[0].name, version: plugins[0].version, description: 'd' }));
    const ok = hubRegistry.inspectCompanionMeta(tmp, plugins[0]);
    assert.equal(ok.ok, true, '有效清单应通过: ' + JSON.stringify(ok));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4) versions.compareVersions：随机毒化 + 序性质 oracle
// ---------------------------------------------------------------------------
const { compareVersions } = require(path.join(REPO, 'scripts', 'lib', 'versions.js'));

test('属性：compareVersions 毒化不抛 + 反对称/传递（×500）', () => {
  const PARTS = ['0', '1', '2', '10', 'beta', 'rc', 'rc.1', 'alpha', '', 'x', '毒', '-1', '007'];
  const gen = () => {
    const n = 1 + Math.floor(rand() * 4);
    const segs = [];
    for (let i = 0; i < n; i++) segs.push(pick(PARTS));
    return (chance(0.3) ? 'v' : '') + segs.join('.');
  };
  const cmps = [];
  for (let i = 0; i < 500; i++) {
    const a = gen(), b = gen();
    let r;
    assert.doesNotThrow(() => { r = compareVersions(a, b); }, '毒化版本串不抛: ' + a + ' vs ' + b);
    assert.ok(r === -1 || r === 0 || r === 1, '结果 ∈ {-1,0,1}');
    // 反对称：sign(cmp(a,b)) = -sign(cmp(b,a))（0/-0 用同值判定）
    const r2 = compareVersions(b, a);
    assert.ok(r === -r2 || (r === 0 && r2 === 0), '反对称: ' + a + ' vs ' + b + ' → ' + r + '/' + r2);
    if (i % 5 === 0) cmps.push([a, b, r]);
  }
  // 传递性（随机三元组）
  for (let i = 0; i < 100; i++) {
    const [a, b] = cmps[Math.floor(rand() * cmps.length)];
    const c = gen();
    const ab = compareVersions(a, b), bc = compareVersions(b, c), ac = compareVersions(a, c);
    if (ab === 0 && bc === 0) assert.equal(ac, 0, '等价传递');
    if (ab <= 0 && bc <= 0) assert.ok(ac <= 0, '序传递: ' + [a, b, c].join('|'));
  }
  // 契约锚点
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('v0.2.3', '0.2.3'), 0);
  assert.equal(compareVersions('0.12.2', '0.2.1'), 1);
  assert.equal(compareVersions('0.2.4-beta', '0.2.3'), 1);
  assert.equal(compareVersions('0.2.3', '0.2.3-beta'), 1);
});

// ---------------------------------------------------------------------------
// 5) chunk-availability：1000 订阅者 × 退避循环
//    取数夹具见 fixtures/better-sidebar-region.js（0.24.1 起无逐文件编译镜像，
//    真实实现只在 lib/client.js 的 //#region src/client/chunk-availability.ts 里）。
// ---------------------------------------------------------------------------
const { loadChunkAvailability } = require('./fixtures/better-sidebar-region.js');

test('压力：1000 订阅者共享单循环单定时器，退订后零 pending', { timeout: 60_000 }, async () => {
  const { createChunkRetryLoop, nextDelayMs } = loadChunkAvailability({ sameRealm: true });
  // 退避序列契约
  assert.equal(nextDelayMs(1), 2000);
  assert.equal(nextDelayMs(2), 4000);
  assert.equal(nextDelayMs(5), 30000, '封顶 30s');
  assert.equal(nextDelayMs(NaN), 2000, 'NaN → 1');

  // 假调度器
  const pending = new Map();
  let scheduled = 0, cancelled = 0;
  const schedule = (fn, delay) => {
    const id = ++scheduled;
    pending.set(id, { fn, delay });
    return () => { if (pending.delete(id)) cancelled++; };
  };
  let available = false;
  const loop = createChunkRetryLoop('ta2-editor', { isAvailable: () => available, attemptLoad: async () => {}, schedule });
  const unsubs = [];
  let events = 0, readyEvents = 0;
  for (let i = 0; i < 1000; i++) {
    unsubs.push(loop.subscribe((e) => {
      events++;
      if (e.ready) readyEvents++;
      if (rand() < 0.001) throw new Error('毒化订阅者'); // 崩溃订阅者被隔离
    }));
  }
  assert.ok(pending.size <= 1, '1000 订阅者共享单循环单定时器，pending=' + pending.size);
  // 退避循环：模块系统持续不可用 ×10 轮
  const delays = [];
  for (let round = 0; round < 10; round++) {
    const [id, job] = [...pending.entries()][0];
    delays.push(job.delay);
    pending.delete(id);
    await job.fn(); // probe：不可用 → fails+1 → 再排
    assert.ok(pending.size <= 1, '每轮至多 1 个 pending 定时器');
  }
  assert.ok(delays.length >= 10 && delays[0] === 2000 && delays[1] === 4000, '指数退避序列: ' + delays.join(','));
  // 成功：唤醒全部订阅者
  available = true;
  const [id, job] = [...pending.entries()][0];
  pending.delete(id);
  await job.fn();
  assert.equal(readyEvents, 1000, '成功事件唤醒全部 1000 订阅者（崩溃者被隔离不丢事件计数）');
  assert.equal(pending.size, 0, '成功后零 pending');
  assert.equal(loop.active, false, '循环终结');

  // 新循环：全部退订 → 终结、零 pending
  const loop2 = createChunkRetryLoop('ta2-editor-2', { isAvailable: () => false, attemptLoad: async () => {}, schedule });
  const u2 = [];
  for (let i = 0; i < 1000; i++) u2.push(loop2.subscribe(() => {}));
  assert.ok(pending.size <= 1);
  for (const off of u2) off();
  assert.equal(loop2.active, false, '最后订阅者退订 → 循环终结');
  assert.equal(pending.size, 0, '退订后零 pending 定时器');
  assert.ok(cancelled >= 1, '待命定时器被取消（无泄漏）');
});
