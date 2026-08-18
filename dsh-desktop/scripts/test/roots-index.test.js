'use strict';
// P0-1 会话根索引：头部读取（含渐进放大回退）、索引 round-trip。
// 用真 zstd 帧（node:zlib zstdCompressSync）+ 真 scanZstdFrames 验证。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const ri = require('../../scripts/lib/roots-index');
const { scanZstdFrames } = require('../../session-watcher');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roots-idx-'));
}

// 构造多帧 zstd 会话文件：首帧 = header JSON（cwd），后接内容帧。
function zstdSessionFile(dir, cwd) {
  const head = zlib.zstdCompressSync(JSON.stringify({ cwd, kind: 'legacy' }) + '\n');
  const body = zlib.zstdCompressSync('{"role":"user","content":"hi"}\n');
  const p = path.join(dir, 'session.jsonl.zstd');
  fs.writeFileSync(p, Buffer.concat([head, body]));
  return p;
}

test('inflateSessionCwd: 真 zstd 帧取 cwd，垃圾帧返回 null', () => {
  const buf = zlib.zstdCompressSync(JSON.stringify({ cwd: 'D:/proj/x', kind: 'legacy' }) + '\n');
  const inflate = (b) => zlib.zstdDecompressSync(b);
  assert.strictEqual(ri.inflateSessionCwd(buf, inflate), 'D:/proj/x');
  assert.strictEqual(ri.inflateSessionCwd(Buffer.from('garbage-not-zstd'), inflate), null);
  // 无 cwd 字段的头部 → null
  const noCwd = zlib.zstdCompressSync('{"kind":"legacy"}\n');
  assert.strictEqual(ri.inflateSessionCwd(noCwd, inflate), null);
});

test('readSessionCwd: 正常多帧文件返回 cwd', () => {
  const dir = tmpdir();
  const p = zstdSessionFile(dir, '/home/u/dev/proj');
  assert.strictEqual(
    ri.readSessionCwd(p, { fs, scan: scanZstdFrames, inflate: (b) => zlib.zstdDecompressSync(b) }),
    '/home/u/dev/proj'
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSessionCwd: 空文件 / 损坏文件返回 null', () => {
  const dir = tmpdir();
  const empty = path.join(dir, 'empty.jsonl.zstd');
  fs.writeFileSync(empty, '');
  const corrupt = path.join(dir, 'corrupt.jsonl.zstd');
  fs.writeFileSync(corrupt, Buffer.alloc(4096, 0x42));
  const opts = { fs, scan: scanZstdFrames, inflate: (b) => zlib.zstdDecompressSync(b) };
  assert.strictEqual(ri.readSessionCwd(empty, opts), null);
  assert.strictEqual(ri.readSessionCwd(corrupt, opts), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSessionCwd: 不存在文件返回 null', () => {
  assert.strictEqual(ri.readSessionCwd(path.join(tmpdir(), 'nope.zstd'), { fs, scan: scanZstdFrames, inflate: (b) => zlib.zstdDecompressSync(b) }), null);
});

test('readSessionCwd: 首帧在 64KB 之外 → 渐进放大到 256KB 档命中', () => {
  // 前 100KB 为垃圾（无 zstd magic），cwd 帧在其后：64KB 头部必然 torn，
  // 256KB 档应找到完整帧。验证渐进放大逻辑（不依赖全量兜底）。
  const dir = tmpdir();
  const head = zlib.zstdCompressSync(JSON.stringify({ cwd: 'C:/big/log', kind: 'legacy' }) + '\n');
  const p = path.join(dir, 'session.jsonl.zstd');
  fs.writeFileSync(p, Buffer.concat([Buffer.alloc(100 * 1024, 0x41), head]));
  const cwd = ri.readSessionCwd(p, { fs, scan: scanZstdFrames, inflate: (b) => zlib.zstdDecompressSync(b) });
  assert.strictEqual(cwd, 'C:/big/log');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSessionCwd: 首帧永远不完整 → 兜底全量读仍可解析', () => {
  // fake scan：头部读取一律报 torn（模拟帧头超长/损坏场景），仅当 buffer
  // 等于完整文件（全量兜底分支）时返回真帧，验证兜底路径可解析成功。
  const dir = tmpdir();
  const p = zstdSessionFile(dir, 'E:/full/fallback');
  const full = fs.readFileSync(p);
  const fakeScan = (buf) => (buf.length === full.length ? scanZstdFrames(buf) : { frames: [], tornStart: 0 });
  const cwd = ri.readSessionCwd(p, { fs, scan: fakeScan, inflate: (b) => zlib.zstdDecompressSync(b) });
  assert.strictEqual(cwd, 'E:/full/fallback');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('decodeRootsIndex: 合法/坏 JSON/版本不符/entries 非对象', () => {
  const good = JSON.stringify({ v: 1, updatedAt: 123, entries: { a: { mtimeMs: 1, size: 2, cwd: 'x' } } });
  const d = ri.decodeRootsIndex(good);
  assert.ok(d && d.entries.a.cwd === 'x' && d.updatedAt === 123);
  assert.strictEqual(ri.decodeRootsIndex('not-json{'), null);
  assert.strictEqual(ri.decodeRootsIndex(JSON.stringify({ v: 99, entries: {} })), null);
  assert.strictEqual(ri.decodeRootsIndex(JSON.stringify({ v: 1, entries: [] })), null);
  assert.strictEqual(ri.decodeRootsIndex(JSON.stringify({ v: 1, entries: 'nope' })), null);
});

test('loadRootsIndex: 缺失/损坏 → 空索引', () => {
  const dir = tmpdir();
  const f = path.join(dir, 'roots-index.json');
  const idx = ri.loadRootsIndex(f, fs, path);
  assert.deepStrictEqual(idx, { v: 1, updatedAt: 0, entries: {} });
  fs.writeFileSync(f, '{corrupt', 'utf8');
  assert.deepStrictEqual(ri.loadRootsIndex(f, fs, path), { v: 1, updatedAt: 0, entries: {} });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('saveRootsIndex: round-trip 可回读；写失败返回 false 且清理 tmp', () => {
  const dir = tmpdir();
  const f = path.join(dir, 'roots-index.json');
  const idx = { v: 1, updatedAt: 0, entries: { '/s/a': { mtimeMs: 11, size: 22, cwd: '/p' } } };
  assert.strictEqual(ri.saveRootsIndex(f, idx, fs, path), true);
  const back = ri.loadRootsIndex(f, fs, path);
  assert.strictEqual(back.entries['/s/a'].cwd, '/p');
  // 无 tmp 残留
  assert.strictEqual(fs.readdirSync(dir).filter((n) => n.includes('.tmp-')).length, 0);
  // 写失败 → false
  const badFs = { ...fs, writeFileSync: () => { throw new Error('disk full'); } };
  assert.strictEqual(ri.saveRootsIndex(f, idx, badFs, path), false);
  assert.strictEqual(fs.readdirSync(dir).filter((n) => n.includes('.tmp-')).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});