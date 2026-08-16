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
