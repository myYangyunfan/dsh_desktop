'use strict';
// SessionWatcher v2（事件驱动 + 兜底清扫）单元测试：
// 验证 fs.watch 事件即时通知、兜底清扫、rename 替换重新基线、监视器回收。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { SessionWatcher } = require('../../session-watcher');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSessionFile(file, id) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = JSON.stringify({
    type: 'session',
    id,
    cwd: 'C:/fake',
    title: 't',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  }) + '\n';
  fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(header, 'utf8')));
}

function appendFrame(file, records) {
  const payload = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(payload, 'utf8')));
}

test('v2: appended turn/end notifies via fs.watch event (< 3s)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sess1', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess');
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 60000, // isolate the event path
    walkSweepMs: 60000,
  });
  w.start();
  await sleep(500); // first batched scan
  w.refreshWatchList(); // attach per-file watchers (production attaches on the 30s reconcile)
  await sleep(300);
  appendFrame(file, [{ type: 'turn/start' }, { type: 'turn/end' }]);
  const deadline = Date.now() + 5000;
  while (notes.length === 0 && Date.now() < deadline) await sleep(100);
  w.stop();
  assert.strictEqual(notes.length, 1, 'expected one turn-end notification');
  assert.strictEqual(notes[0].sessionId, 'testsess');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: title-only append emits no notification', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sess2', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess');
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 60000,
    walkSweepMs: 60000,
  });
  w.start();
  await sleep(500);
  w.refreshWatchList();
  await sleep(300);
  appendFrame(file, [{ type: 'session/title', data: { title: 'hello' } }]);
  await sleep(1500);
  w.stop();
  assert.strictEqual(notes.length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: stat sweep fallback catches growth (watch-independent path)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sess3', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess');
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 500,
    walkSweepMs: 60000,
  });
  w.start();
  await sleep(700);
  appendFrame(file, [{ type: 'turn/end' }]);
  const deadline = Date.now() + 5000;
  while (notes.length === 0 && Date.now() < deadline) await sleep(100);
  w.stop();
  assert.strictEqual(notes.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: same-size rename replacement re-baselines (rename event) and notifies', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sess4', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess');
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 500,
    walkSweepMs: 60000,
  });
  w.start();
  await sleep(500);
  w.refreshWatchList(); // attach watcher
  await sleep(300);
  // replace the whole file with DIFFERENT content of the SAME size:
  // invisible to size-only comparison, but the rename event forces re-baseline.
  const repl = path.join(path.dirname(file), 'repl');
  const header = JSON.stringify({ type: 'session', id: 'testsess2', cwd: 'C:/fake', title: 't2' }) + '\n';
  const payload = header + JSON.stringify({ type: 'turn/end' }) + '\n';
  fs.writeFileSync(repl, zlib.zstdCompressSync(Buffer.from(payload, 'utf8')));
  fs.rmSync(file);
  fs.renameSync(repl, file);
  await sleep(1500); // let the event path re-baseline the replaced file
  appendFrame(file, [{ type: 'turn/end' }]);
  const deadline = Date.now() + 6000;
  while (notes.length === 0 && Date.now() < deadline) await sleep(100);
  w.stop();
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].sessionId, 'testsess2');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: stop() detaches all watchers and timers', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sess5', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess');
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: () => {}, log: () => {}, statSweepMs: 500, walkSweepMs: 500 });
  w.start();
  w.refreshWatchList();
  assert.ok(w.watchers.size > 0);
  w.stop();
  assert.strictEqual(w.watchers.size, 0);
  assert.strictEqual(w.timer, null);
  assert.strictEqual(w.walkTimer, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: newly created session is discovered and notified (reconcile + sweep)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 500,
    walkSweepMs: 1500,
  });
  w.start();
  await sleep(600);
  // create a NEW session after start: reconcile discovers it, sweep baselines it
  const file = path.join(tmp, 'p1', 'sess6', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsess6');
  await sleep(2500); // one reconcile + sweeps
  appendFrame(file, [{ type: 'turn/end' }]);
  const deadline = Date.now() + 6000;
  while (notes.length === 0 && Date.now() < deadline) await sleep(100);
  w.stop();
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].sessionId, 'testsess6');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: mid-stream garbage does not permanently lose later turn/end (incremental)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sessg', 'session.jsonl.zstd');
  makeSessionFile(file, 'testsessg');
  const notes = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: (info) => notes.push(info),
    log: () => {},
    statSweepMs: 60000,
    walkSweepMs: 60000,
  });
  w.process(file); // baseline: header frame only
  // append F1(header+turn/start), then 6 garbage bytes, then F2(turn/end)
  const f1 = zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'session', id: 'testsessg', cwd: 'C:/fake' }) + '\n' +
      JSON.stringify({ type: 'turn/start' }) + '\n', 'utf8'));
  const f2 = zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'turn/end' }) + '\n', 'utf8'));
  const buf = Buffer.concat([f1, Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]), f2]);
  fs.appendFileSync(file, buf);
  w.process(file); // should recover F2 past the garbage and notify
  w.stop();
  assert.strictEqual(notes.length, 1, 'turn/end after garbage must not be lost');
  assert.strictEqual(notes[0].sessionId, 'testsessg');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: single corrupted file (header+garbage+turn/end) notifies on first scan', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sessh', 'session.jsonl.zstd');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const f1 = zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'session', id: 'sessh', cwd: 'C:/fake', title: 't' }) + '\n' +
      JSON.stringify({ type: 'turn/start' }) + '\n', 'utf8'));
  const f2 = zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'turn/end' }) + '\n', 'utf8'));
  fs.writeFileSync(file, Buffer.concat([f1, Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]), f2]));
  const notes = [];
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: (i) => notes.push(i), log: () => {} });
  w.process(file);
  w.process(file);
  w.stop();
  assert.strictEqual(notes.length, 1, 'recovered turn/end after corruption should notify on first scan');
  assert.strictEqual(notes[0].sessionId, 'sessh');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: non-string session id does not throw away turn-end notification', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sessn', 'session.jsonl.zstd');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'session', id: 12345, cwd: 'C:/fake', title: 't' }) + '\n', 'utf8')));
  const notes = [];
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: (i) => notes.push(i), log: () => {} });
  w.process(file); // baseline
  fs.appendFileSync(file, zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'turn/end' }) + '\n', 'utf8')));
  w.process(file); // incremental
  w.stop();
  assert.strictEqual(notes.length, 1, 'numeric session id must not drop the notification');
  assert.strictEqual(notes[0].sessionId, 12345);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('P0-5: cold session (mtime > 7d) gets no watcher; active one does', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swp05-'));
  const cold = path.join(tmp, 'p1', 'cold', 'session.jsonl.zstd');
  const active = path.join(tmp, 'p1', 'hot', 'session.jsonl.zstd');
  makeSessionFile(cold, 'cold');
  makeSessionFile(active, 'hot');
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(cold, old, old);
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: () => {}, log: () => {} });
  w.refreshWatchList();
  assert.strictEqual(w.watchers.has(cold), false, '冷会话不得挂 watch');
  assert.strictEqual(w.watchers.has(active), true, '活跃会话应挂 watch');
  w.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('P0-5: revived cold session is upgraded to a watcher by scan', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swp05-'));
  const file = path.join(tmp, 'p1', 'revive', 'session.jsonl.zstd');
  makeSessionFile(file, 'revive');
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, old, old);
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: () => {}, log: () => {} });
  w.refreshWatchList(); // 冷：不挂
  assert.strictEqual(w.watchers.has(file), false);
  // 会话被写入复活（mtime 更新为 now）→ 10s 兜底清扫（scan）发现增长即升级挂 watch
  appendFrame(file, [{ type: 'session/title', data: { title: 'revived' } }]);
  w.scan();
  assert.strictEqual(w.watchers.has(file), true, '复活会话应被 scan 升级挂 watch');
  w.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('P0-5: watcher is detached once the session cools down (reconcile)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swp05-'));
  const file = path.join(tmp, 'p1', 'cool', 'session.jsonl.zstd');
  makeSessionFile(file, 'cool');
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: () => {}, log: () => {} });
  w.refreshWatchList();
  assert.strictEqual(w.watchers.has(file), true);
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, old, old);
  w.refreshWatchList(); // 变冷 → 摘除
  assert.strictEqual(w.watchers.has(file), false);
  assert.strictEqual(w.watchers.size, 0);
  w.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('v2: non-string cwd does not throw and still notifies (issue #88)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sessc', 'session.jsonl.zstd');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'session', id: 'sessc', cwd: 12345, title: 't' }) + '\n', 'utf8')));
  const notes = [];
  const w = new SessionWatcher({ sessionsDir: tmp, onTurnEnd: (i) => notes.push(i), log: () => {} });
  assert.doesNotThrow(() => w.process(file)); // baseline（emit 里 path.basename(non-string) 不应抛）
  fs.appendFileSync(file, zlib.zstdCompressSync(
    Buffer.from(JSON.stringify({ type: 'turn/end' }) + '\n', 'utf8')));
  w.process(file); // incremental
  w.stop();
  assert.strictEqual(notes.length, 1, 'numeric cwd must not drop or crash the notification');
  assert.strictEqual(notes[0].sessionId, 'sessc');
  assert.strictEqual(notes[0].cwd, 12345);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('A-11: 老会话（无写入）不误报运行中；新写入恢复 10s；写入停止后降频', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sessq', 'session.jsonl.zstd');
  makeSessionFile(file, 'sessq');
  const old = Date.now() - 3600 * 1000; // 1 小时前 = 无运行中（mtime 窗口 10 分钟）
  fs.utimesSync(file, new Date(old), new Date(old));
  const logs = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: () => {},
    log: (k, m) => logs.push(m),
    statSweepMs: 40,   // 活跃时周期（隔离用短值）
    quietMs: 200,      // 降频后周期（隔离用短值）
    walkSweepMs: 60000,
  });
  t.after(() => { w.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });
  w.start();
  await sleep(150); // 首扫后应判定无运行中
  assert.strictEqual(w.anyRunning, false);
  assert.ok(!logs.some((m) => m.includes('扫描频率')), '初始静默不应输出频率日志: ' + logs.join('|'));
  // 新写入（mtime 更新）→ 下一轮 scan 判定运行中 → 保持活跃周期
  appendFrame(file, [{ type: 'assistant/message' }]);
  await sleep(200);
  assert.strictEqual(w.anyRunning, true, 'mtime 10 分钟内应判定运行中');
  assert.ok(logs.some((m) => m.includes('扫描频率保持')), '应输出保持周期日志: ' + logs.join('|'));
  // 写入停止 + mtime 老化 → 降频
  fs.utimesSync(file, new Date(old), new Date(old));
  await sleep(300);
  assert.strictEqual(w.anyRunning, false, 'mtime 老化后应判定无运行中');
  assert.ok(logs.some((m) => m.includes('无运行中会话，兜底扫描降频')), '应输出降频日志: ' + logs.join('|'));
});

test('A-11: turn/start 未配对时即使 mtime 老化也保持运行中，turn/end 后降频', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const file = path.join(tmp, 'p1', 'sesst', 'session.jsonl.zstd');
  makeSessionFile(file, 'sesst');
  const old = Date.now() - 3600 * 1000;
  const logs = [];
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: () => {},
    log: (k, m) => logs.push(m),
    statSweepMs: 40,
    quietMs: 200,
    walkSweepMs: 60000,
  });
  t.after(() => { w.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });
  w.process(file); // 基线（只解析头部，不推断历史轮次）
  // 运行期观察到 turn/start 且无配对 turn/end → 增量路径标记进行中
  appendFrame(file, [{ type: 'turn/start' }]);
  fs.utimesSync(file, new Date(old), new Date(old));
  w.process(file); // 增量：turn/start → turnOpen
  assert.strictEqual(w.files.get(file).turnOpen, true, '增量解析应标记进行中轮次');
  w.start();
  await sleep(150);
  assert.strictEqual(w.anyRunning, true, 'turn/start 未配对时保持运行中（即使 mtime 老化）');
  // 配对 turn/end（mtime 保持老化）→ 降频
  appendFrame(file, [{ type: 'turn/end' }]);
  fs.utimesSync(file, new Date(old), new Date(old));
  await sleep(300);
  assert.strictEqual(w.files.get(file).turnOpen, false, 'turn/end 应清除进行中标记');
  assert.strictEqual(w.anyRunning, false, '无运行中后应降频');
  assert.ok(logs.some((m) => m.includes('无运行中会话，兜底扫描降频')), '应输出降频日志: ' + logs.join('|'));
});

test('A-11: stop 后 updateRunningFlag 不重建定时器', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swv2-'));
  const w = new SessionWatcher({
    sessionsDir: tmp,
    onTurnEnd: () => {},
    log: () => {},
    statSweepMs: 40,
    quietMs: 200,
    walkSweepMs: 60000,
  });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  w.start();
  await sleep(100);
  w.stop();
  const timerBefore = w.timer;
  w.anyRunning = true; // 模拟状态翻转
  w.updateRunningFlag();
  assert.strictEqual(w.timer, timerBefore, 'stop 后不得重建定时器');
});
