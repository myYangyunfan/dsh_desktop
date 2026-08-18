'use strict';
// dsh-mini 插件单测（对齐上游 hzhz314159/dsh-mini v1.4.1）：
//   gui-ws.js  — 帧封装 / 工具卡视图 / lastEventSeq（_internal 导出）
//   zstd-log.js — zstd 帧解析 / 多帧解压 / walkSessionFiles 纯 TTL 缓存
// 说明：上游 v1.4.1 的安全模型（isLoopback 免 token + 公网模式默认关 +
// timingSafeEqual）不通过 _internal 导出，本文件只测公开可测面；
// 手机 GUI 静态资产（gui/）与公网穿透行为由上游 verify 脚本与手动验证覆盖。
// 插件 lib 为 ESM（type:module），测试文件用 CJS 外壳 + before 钩子动态 import。
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zstdCompressSync } = require('node:zlib');

const LIB = '../../assets/plugins/dsh-mini/lib/';
let gws = null;
let zlog = null;

before(async () => {
  gws = await import(LIB + 'gui-ws.js');
  zlog = await import(LIB + 'zstd-log.js');
});

// ---------------------------------------------------------------------------
// gui-ws.js（上游 _internal：frame / writeFrame / toolViewFor / lastEventSeq）
// ---------------------------------------------------------------------------
test('frame/writeFrame：server-request 封装与 method 兜底', () => {
  const { frame, writeFrame } = gws._internal;
  const f = frame({ type: 'session/event', data: { x: 1 } });
  assert.strictEqual(f.type, 'server-request');
  assert.strictEqual(f.method, 'session/event');
  assert.ok(typeof f.rpcId === 'string' && f.rpcId.length > 0);
  assert.deepStrictEqual(f.payload, { type: 'session/event', data: { x: 1 } });
  assert.strictEqual(frame(undefined).method, 'session/event');
  assert.strictEqual(frame({ foo: 1 }).method, 'session/event');
  assert.notStrictEqual(frame({ type: 'a' }).rpcId, f.rpcId, 'rpcId 应随机');

  const sent = [];
  const mockWs = {
    send(s) {
      sent.push(s);
      return true;
    },
  };
  assert.strictEqual(writeFrame(mockWs, { type: 'session/event', data: {} }), true);
  const parsed = JSON.parse(sent[0]);
  assert.strictEqual(parsed.type, 'server-request');
  assert.strictEqual(parsed.method, 'session/event');
  assert.deepStrictEqual(parsed.payload, { type: 'session/event', data: {} });
});

test('toolViewFor：tool/call|result 生成卡片视图，其余 undefined', () => {
  const { toolViewFor } = gws._internal;
  assert.deepStrictEqual(toolViewFor({ type: 'tool/call', data: { name: 'bash' } }), {
    for: 'call',
    view: { card: 'bash' },
  });
  assert.deepStrictEqual(toolViewFor({ type: 'tool/result', data: { tool: 'read' } }), {
    for: 'result',
    view: { card: 'read' },
  });
  assert.deepStrictEqual(toolViewFor({ type: 'tool/call', data: { call: { name: 'edit' } } }), {
    for: 'call',
    view: { card: 'edit' },
  });
  assert.deepStrictEqual(toolViewFor({ type: 'tool/call', data: {} }), {
    for: 'call',
    view: { card: 'tool' },
  });
  assert.strictEqual(toolViewFor({ type: 'session/event' }), undefined);
  assert.strictEqual(toolViewFor(null), undefined);
  assert.strictEqual(toolViewFor(undefined), undefined);
});

test('lastEventSeq：seq 减 1 / 事件尾 seq / 兜底 -1', () => {
  const { lastEventSeq } = gws._internal;
  assert.strictEqual(lastEventSeq({ seq: 5 }), 4);
  assert.strictEqual(lastEventSeq({ events: [{ seq: 1 }, { seq: 9 }] }), 9);
  assert.strictEqual(lastEventSeq({ events: [] }), -1);
  assert.strictEqual(lastEventSeq({}), -1);
  assert.strictEqual(lastEventSeq(null), -1);
});

// ---------------------------------------------------------------------------
// zstd-log.js
// ---------------------------------------------------------------------------
test('scanFrame/decompressZstd：识别 node zstd 帧、多帧拼接、垃圾输入', () => {
  const line1 = '{"id":"session-z1","type":"session","title":"t1"}\n';
  const line2 = '{"id":"session-z2","type":"session"}\n';
  const frame1 = zstdCompressSync(Buffer.from(line1));
  const frame2 = zstdCompressSync(Buffer.from(line2));
  assert.ok(frame1.length > 4);

  const f = zlog.scanFrame(frame1, 0);
  assert.ok(f, 'node zstd 输出应为合法 zstd 帧');
  assert.strictEqual(f.start, 0);
  assert.strictEqual(f.end, frame1.length);

  const cat = Buffer.concat([frame1, frame2]);
  const g1 = zlog.scanFrame(cat, 0);
  assert.strictEqual(g1.end, frame1.length);
  const g2 = zlog.scanFrame(cat, g1.end);
  assert.ok(g2, '第二帧应从第一帧结束处接着解析');
  assert.strictEqual(g2.end, cat.length);

  const text = zlog.decompressZstd(cat);
  assert.ok(text.includes('session-z1') && text.includes('session-z2'), '解压应还原两行 JSON');

  assert.strictEqual(zlog.scanFrame(Buffer.alloc(16, 0), 0), null, '全零字节非 zstd 帧');
  assert.strictEqual(zlog.scanFrame(Buffer.from('plain text without magic'), 0), null);
  assert.strictEqual(zlog.scanFrame(frame1, frame1.length + 10), null, '越界 offset 返回 null');
  assert.strictEqual(zlog.scanFrame(Buffer.alloc(2), 0), null, '不足 4 字节返回 null');
});

test('decompressFrames：from 偏移起解析多帧，返回 {text, end}', () => {
  const line1 = '{"id":"session-f1","type":"session"}\n';
  const line2 = '{"id":"session-f2","type":"session"}\n';
  const cat = Buffer.concat([zstdCompressSync(Buffer.from(line1)), zstdCompressSync(Buffer.from(line2))]);
  const all = zlog.decompressFrames(cat, 0);
  assert.ok(all.text.includes('session-f1') && all.text.includes('session-f2'));
  assert.strictEqual(all.end, cat.length, '全部帧解完后 end 应指缓冲尾部');
  const firstFrameEnd = zlog.scanFrame(cat, 0).end;
  const tail = zlog.decompressFrames(cat, firstFrameEnd);
  assert.ok(!tail.text.includes('session-f1') && tail.text.includes('session-f2'), 'from 之后只解后续帧');
});

test('walkSessionFiles：TTL 内复用缓存、reset 重建、缺目录不抛错', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mini-zstd-test-'));
  const sessions = path.join(tmp, 'sessions');
  const sdir = path.join(sessions, 's1');
  fs.mkdirSync(sdir, { recursive: true });
  const filePath = path.join(sdir, 'session.jsonl.zstd');
  fs.writeFileSync(filePath, zstdCompressSync(Buffer.from('{"id":"session-w1","type":"session"}\n')));
  try {
    zlog.resetFileMapCache();
    const m1 = zlog.walkSessionFiles(tmp);
    assert.ok(m1 instanceof Map);
    assert.strictEqual(m1.get('session-w1'), filePath, 'map 应映射 sessionId -> 文件路径');

    // 上游 v1.4.x 为纯 TTL 缓存（60s 内且 map 非空即复用，不做目录 mtime 短路）：
    const m2 = zlog.walkSessionFiles(tmp);
    assert.strictEqual(m2, m1, 'TTL 内 → 直接复用同一缓存引用');

    zlog.resetFileMapCache();
    const m4 = zlog.walkSessionFiles(tmp);
    assert.notStrictEqual(m4, m1, 'reset 后应重新构建');
    assert.strictEqual(m4.get('session-w1'), filePath);

    const m5pre = zlog.walkSessionFiles(path.join(tmp, 'nope'));
    assert.strictEqual(m5pre, m4, 'TTL 内且缓存非空 → 缺目录调用也直接命中缓存');
    zlog.resetFileMapCache();
    const m5 = zlog.walkSessionFiles(path.join(tmp, 'nope'));
    assert.ok(m5 instanceof Map && m5.size === 0, '缓存重建后不存在的目录 → 空 Map 不抛错');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
