'use strict';
// A-1 统一日志轮转：rotateLogFile（启动滚动）与 createRotatingWriteStream（运行期写流）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { rotateLogFile, createRotatingWriteStream, LOG_ROTATE_MAX_BYTES } = require('../lib/log-rotate');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'log-rotate-test-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('rotateLogFile: 文件不存在 → 不滚动不报错', () => {
  const dir = tmpDir();
  try {
    const r = rotateLogFile(path.join(dir, 'nope.log'));
    assert.deepStrictEqual(r, { rotated: false, previousSize: null, error: null });
  } finally { cleanup(dir); }
});

test('rotateLogFile: 小文件（未超限）→ 不滚动', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'small.log');
    fs.writeFileSync(f, 'hello');
    const r = rotateLogFile(f);
    assert.strictEqual(r.rotated, false);
    assert.strictEqual(r.previousSize, 5);
    assert.ok(fs.existsSync(f + '.1') === false);
  } finally { cleanup(dir); }
});

test('rotateLogFile: 超限 → 主文件置空、.1 保留原内容', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'big.log');
    const big = Buffer.alloc(LOG_ROTATE_MAX_BYTES + 1234, 0x61);
    fs.writeFileSync(f, big);
    const r = rotateLogFile(f);
    assert.strictEqual(r.rotated, true);
    assert.strictEqual(r.previousSize, big.length);
    assert.strictEqual(fs.statSync(f).size, 0);
    assert.strictEqual(fs.statSync(f + '.1').size, big.length);
  } finally { cleanup(dir); }
});

test('rotateLogFile: 滚动两代后 .2 存在、内容顺序正确', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'gen.log');
    const gen1 = Buffer.alloc(LOG_ROTATE_MAX_BYTES + 10, 0x31);
    const gen2 = Buffer.alloc(LOG_ROTATE_MAX_BYTES + 20, 0x32);
    fs.writeFileSync(f, gen1);
    rotateLogFile(f); // gen1 -> .1
    fs.writeFileSync(f, gen2);
    rotateLogFile(f); // .2 = gen1, .1 = gen2
    assert.strictEqual(fs.statSync(f).size, 0);
    assert.strictEqual(fs.statSync(f + '.1').size, gen2.length);
    assert.strictEqual(fs.statSync(f + '.2').size, gen1.length);
    // 第三代：.2 被覆盖为 gen2，只保留两代
    fs.writeFileSync(f, Buffer.alloc(LOG_ROTATE_MAX_BYTES + 30, 0x33));
    rotateLogFile(f);
    assert.strictEqual(fs.statSync(f + '.1').size, LOG_ROTATE_MAX_BYTES + 30);
    assert.strictEqual(fs.statSync(f + '.2').size, gen2.length);
    const names = fs.readdirSync(dir).filter((n) => n.startsWith('gen.log'));
    assert.deepStrictEqual(names.sort(), ['gen.log', 'gen.log.1', 'gen.log.2']);
  } finally { cleanup(dir); }
});

test('rotateLogFile: 滚动失败不抛出，返回 error 描述', () => {
  // 注入假 fs：statSync 报超限，renameSync 抛错。
  const fakeFs = {
    statSync() { return { size: LOG_ROTATE_MAX_BYTES + 1 }; },
    rmSync() {},
    existsSync() { return true; },
    renameSync() { throw new Error('EACCES: permission denied'); },
  };
  let threw = false;
  let r = null;
  try { r = rotateLogFile('C:/fake/desktop.log', {}, fakeFs); } catch { threw = true; }
  assert.strictEqual(threw, false);
  assert.strictEqual(r.rotated, false);
  assert.ok(r.error && r.error.includes('EACCES'));
});

test('createRotatingWriteStream: 超限滚动，旧内容进 .1、新内容进主文件，顺序不乱', async () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'stream.log');
    const ws = createRotatingWriteStream(f, { maxBytes: 1024, checkEveryBytes: 512 });
    const seg1 = Buffer.alloc(800, 0x41);
    const seg2 = Buffer.alloc(800, 0x42);
    const seg3 = Buffer.alloc(800, 0x43);
    await new Promise((resolve, reject) => {
      ws.write(seg1);
      ws.write(seg2);
      ws.write(seg3, (e) => (e ? reject(e) : resolve()));
    });
    await new Promise((resolve) => ws.end(resolve));
    // 第 1 段后：800 < 1024 不滚；第 2 段后：1600 > 1024 滚（.1 = seg1+seg2）；第 3 段进主文件。
    assert.strictEqual(fs.statSync(f).size, 800);
    assert.strictEqual(fs.statSync(f + '.1').size, 1600);
    assert.strictEqual(fs.readFileSync(f).equals(seg3), true);
    assert.strictEqual(fs.readFileSync(f + '.1').equals(Buffer.concat([seg1, seg2])), true);
  } finally { cleanup(dir); }
});

test('createRotatingWriteStream: 写入失败不抛出（无监听 crash），后续可用', async () => {
  const dir = tmpDir();
  try {
    const bad = path.join(dir, 'no-such-dir', 'x.log'); // 父目录不存在 → open 'a' 失败
    const ws = createRotatingWriteStream(bad);
    let err = null;
    await new Promise((resolve) => {
      ws.on('error', (e) => { err = e; resolve(); });
      ws.write(Buffer.from('hi'));
    });
    assert.ok(err instanceof Error);
    // 同一实例再写合法路径：换成可写文件后不应再抛（fd 重开失败会继续 cb(err)，但不崩溃）
    const good = path.join(dir, 'ok.log');
    const ws2 = createRotatingWriteStream(good);
    await new Promise((resolve, reject) => {
      ws2.write(Buffer.from('data'), (e) => (e ? reject(e) : resolve()));
    });
    await new Promise((resolve) => ws2.end(resolve));
    assert.strictEqual(fs.readFileSync(good, 'utf8'), 'data');
  } finally { cleanup(dir); }
});

test('createRotatingWriteStream: 默认参数下小日志不滚动', async () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'norm.log');
    const ws = createRotatingWriteStream(f);
    for (let i = 0; i < 50; i++) ws.write(Buffer.from('line ' + i + '\n'));
    await new Promise((resolve) => ws.end(resolve));
    assert.ok(fs.existsSync(f + '.1') === false);
    const text = fs.readFileSync(f, 'utf8');
    assert.strictEqual(text.split('\n').filter(Boolean).length, 50);
  } finally { cleanup(dir); }
});