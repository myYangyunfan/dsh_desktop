'use strict';

// unit-file-changes-diff.test.js — 文件变更「diff 记录」单测（host 投影半边）。
//
// 覆盖 dsh-file-changes 投影把 tool/result 的 meta.diffs 折叠成
// { seq, time, path, op, oldText, newText } 的 before→after 历史：
//  - op 分类（空 oldText=create、空 newText=delete、其余=edit）；
//  - 改动前后全文保留（演示高亮的唯一数据源）；
//  - 非 tool/result / 空 diffs / 非法条目不产生记录且原 state 引用返回（幂等）；
//  - 多次变更按 seq 顺序累计；wire.view 恒等。
//
// 2026-10 随内置插件批量退役，本文件另一半（dsh-client-file-changes 的
// diffRows / diffStats / diffKindClass / groupChanges 与 bundle 内联 CSS 契约）
// 已下线——该插件不再随壳分发，内核侧同名件由官方包提供。
//
// 运行：node --test scripts/test/unit-file-changes-diff.test.js
//（不依赖内核 / DOM / 网络；投影用动态 import。）

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'assets', 'plugins');
const HOST_INDEX = path.join(PLUGIN_DIR, 'dsh-file-changes', 'lib', 'index.js');

// ---------------------------------------------------------------------------
// diff 记录：fileChanges 投影（host）折叠 tool/result meta.diffs
// ---------------------------------------------------------------------------
const importHost = () => import(pathToFileURL(HOST_INDEX).href);

function fakeHostCtx() {
  let def = null;
  const applyCtx = {
    sessionProjections: { register: (d) => { def = d; } },
    webServer: { register: () => () => {} },
  };
  return { applyCtx, getDef: () => def };
}

function mkEvent(seq, time, diffs) {
  return { type: 'tool/result', seq, time, data: { meta: { diffs } } };
}

test('fileChanges 投影: meta.diffs → 记录 before→after 历史 + op 分类正确', async () => {
  const host = await importHost();
  const { applyCtx, getDef } = fakeHostCtx();
  const dispose = host.apply(applyCtx);
  const def = getDef();
  assert.ok(def, '投影定义应已注册');
  assert.deepEqual(def.init(), { changes: [], truncated: false });

  const s1 = def.apply(def.init(), mkEvent(10, 1000, [
    { path: '/create.js', oldText: '', newText: 'hi\n' },
    { path: '/edit.js', oldText: 'a\nb', newText: 'a\nB' },
    { path: '/delete.js', oldText: 'gone', newText: '' },
  ]));

  assert.equal(s1.changes.length, 3, '三笔 meta.diffs 各落一条记录');
  assert.equal(s1.changes[0].op, 'create');
  assert.equal(s1.changes[1].op, 'edit');
  assert.equal(s1.changes[2].op, 'delete');
  assert.equal(s1.changes[0].seq, 10);
  assert.equal(s1.changes[0].time, 1000);

  // 改动前后对比正确（before→after 全文保留）
  assert.equal(s1.changes[0].oldText, '');
  assert.equal(s1.changes[0].newText, 'hi\n');
  assert.equal(s1.changes[1].oldText, 'a\nb');
  assert.equal(s1.changes[1].newText, 'a\nB');
  assert.equal(s1.changes[2].oldText, 'gone');
  assert.equal(s1.changes[2].newText, '');

  dispose();
});

test('fileChanges 投影: 非 tool/result 或无 diffs → 不产生记录（原 state 引用返回）', async () => {
  const host = await importHost();
  const { applyCtx, getDef } = fakeHostCtx();
  const dispose = host.apply(applyCtx);
  const def = getDef();

  const base = def.apply(def.init(), mkEvent(1, 1, [{ path: '/a', oldText: 'x', newText: 'y' }]));
  assert.equal(base.changes.length, 1);

  assert.equal(def.apply(base, { type: 'message', seq: 2, time: 2, data: {} }), base, '非 tool/result 忽略');
  assert.equal(def.apply(base, mkEvent(3, 3, null)), base, '无 diffs 忽略');
  assert.equal(def.apply(base, mkEvent(4, 4, [])), base, '空 diffs 忽略');

  // 路径缺失 / 非法 diffs 元素被跳过，不影响已有 state
  const s2 = def.apply(base, mkEvent(5, 5, [{ path: '  ', oldText: 'a', newText: 'b' }]));
  assert.equal(s2, base, '空白路径跳过');

  // wire.view 恒等（客户端可见即为持久化 state）
  assert.equal(def.wire.view(base), base);

  dispose();
});

test('fileChanges 投影: 追加多次变更按 seq 顺序累计', async () => {
  const host = await importHost();
  const { applyCtx, getDef } = fakeHostCtx();
  const dispose = host.apply(applyCtx);
  const def = getDef();

  const s1 = def.apply(def.init(), mkEvent(1, 100, [{ path: '/a', oldText: '', newText: 'one' }]));
  const s2 = def.apply(s1, mkEvent(2, 200, [{ path: '/a', oldText: 'one', newText: 'one\ntwo' }]));
  assert.equal(s2.changes.length, 2, '同一文件两次改动各留一条历史');
  assert.equal(s2.changes[0].oldText, '');
  assert.equal(s2.changes[0].newText, 'one');
  assert.equal(s2.changes[1].oldText, 'one');
  assert.equal(s2.changes[1].newText, 'one\ntwo');
  assert.deepEqual(s2.changes.map((c) => c.seq), [1, 2], '按 seq 顺序累计');

  dispose();
});
