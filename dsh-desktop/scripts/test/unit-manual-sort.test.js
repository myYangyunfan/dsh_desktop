'use strict';

// unit-manual-sort.test.js — K25 会话手动排序拖拽失效修复单测。
//
// 补丁（patch-adapters.transformManualSortFix）对内核
// @deepseek-ai/dsh-client-ui-workspace lib/client.js 做一件事：会话行
// SessionNodeItem 的 onDragStart 内，把 drag.start()（setDrag 状态提交）包进
// react-dom flushSync，解决 React 18 批处理下 drag.active 未及时更新 →
// onDragOver/onDrop 未 preventDefault → 拖拽无效、顺序未提交也未持久化的问题。
//
// 本单测分两层：
//   1) 内容契约：对真实内核 client.js 跑 transform，断言 flushSync 只注入到
//      会话行（node.id）拖拽起点、工作区行（row.key）不受影响、幂等；
//   2) 顺序逻辑（镜像内核同源纯函数）：手动排序拖拽 → 顺序写入 store + 重读
//      一致；「最近更新」排序不回归（切入时全量 recency 排序 + 活动置顶）。
//
// 运行：node --test scripts/test/unit-manual-sort.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { transformManualSortFix, toPristineSource, markers } = require('../lib/patch-adapters');
const { WORKSPACE_PKG_REL } = require('../lib/patch-target-resolver');

const MANUAL_SORT_DRAG_MARKER = markers.MANUAL_SORT_DRAG_MARKER;

/** 定位内核 workspace client.js 靶文件：dev 安装树优先，其次 payload 镜像。
 *  两处都会被 boot 链 / stage-payload 就地打补丁，取到字节后统一经
 *  toPristineSource 剥回 pristine（见 patch-adapters 内该函数的背景注释）——
 *  否则「未打补丁源应 changed」会在补丁态上报假红，真锚点漂移时同样报
 *  already，哨兵失效。 */
function resolveWorkspaceSource() {
  const candidates = [
    path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', WORKSPACE_PKG_REL),
    path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
      'node_modules', '@deepseek-ai', WORKSPACE_PKG_REL),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const WORKSPACE_PATH = resolveWorkspaceSource();
const hasSource = WORKSPACE_PATH !== null;

// ---------------------------------------------------------------------------
// 与内核同源的纯函数（镜像 dsh-client-ui-workspace 内实现，仅观测用）。
// ---------------------------------------------------------------------------
function byRecency(a, b) {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : 1;
}

function reconciledSessionOrder(sessionIds, stored) {
  if (stored === void 0) return [...sessionIds];
  const byId = new Map(sessionIds.map((id) => [id, id]));
  const ordered = [];
  const included = new Set();
  for (const key of stored) {
    const id = byId.get(key);
    if (id === void 0 || included.has(key)) continue;
    ordered.push(id);
    included.add(key);
  }
  for (const id of sessionIds) {
    if (included.has(id)) continue;
    ordered.push(id);
  }
  return ordered;
}

function compareSessionRecency(a, b, byId) {
  const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY;
  const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY;
  if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
  return a < b ? -1 : 1;
}

function nextSessionOrderAccount({ sessionIds, previousOrder, previousUpdatedAt, list, orderBy, sortByRecency }) {
  let order = reconciledSessionOrder(sessionIds, previousOrder);
  if (sortByRecency) order.sort((a, b) => compareSessionRecency(a, b, list.byId));
  else if (orderBy === 'updated') {
    const promoted = sessionIds.filter((id) => {
      const session = list.byId[id];
      return session !== void 0 && (previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]);
    }).sort((a, b) => compareSessionRecency(a, b, list.byId));
    if (promoted.length > 0) {
      const promotedIds = new Set(promoted);
      order = [...promoted, ...order.filter((id) => !promotedIds.has(id))];
    }
  }
  const updatedAt = {};
  for (const id of sessionIds) {
    const session = list.byId[id];
    if (session !== void 0) updatedAt[id] = session.updatedAt;
  }
  const orderChanged = previousOrder === void 0 || order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index]);
  const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp);
  return { order, updatedAt, changed: orderChanged || timestampsChanged };
}

/** 内核 commitSessionDrag 的 reorder 计算（镜像 SessionTree 内实现）。 */
function reorderAfterDrag(accountSessionIds, draggedId, over, groupSessions) {
  const targetIndex = groupSessions.findIndex((session) => session.id === over.id);
  if (targetIndex === -1) return accountSessionIds;
  const anchor = over.half === 'before' ? over.id : groupSessions[targetIndex + 1]?.id;
  if (anchor === draggedId) return accountSessionIds;
  const sourceIndex = groupSessions.findIndex((session) => session.id === draggedId);
  const anchorIndex = anchor === void 0 ? groupSessions.length : groupSessions.findIndex((session) => session.id === anchor);
  if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return accountSessionIds;
  const nextOrder = accountSessionIds.filter((id) => id !== draggedId);
  const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
  nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, draggedId);
  return nextOrder;
}

// ---------------------------------------------------------------------------
// 1. 内容契约
// ---------------------------------------------------------------------------

test('K25 transform：会话行 onDragStart 注入 flushSync，工作区行不受影响，幂等', { skip: !hasSource }, () => {
  const pristine = toPristineSource('manual-sort-drag-fix', fs.readFileSync(WORKSPACE_PATH, 'utf8'));
  const r = transformManualSortFix(pristine, 'client.js');
  assert.equal(r.status, 'changed', '未打补丁源应 changed');
  const src = r.src;

  assert.ok(src.includes(MANUAL_SORT_DRAG_MARKER), '应含 marker');
  assert.ok(src.includes('let react_dom = require("react-dom");'), '应注入 react-dom require');
  assert.ok(src.includes('react_dom.flushSync(() => {'), '应注入 flushSync');
  assert.equal(src.split('react_dom.flushSync(() => {').length - 1, 1, 'flushSync 应仅注入会话行拖拽起点（1 处）');

  // 会话行（node.id）被包裹。
  const nodeIdx = src.indexOf('e.dataTransfer.setData("text/plain", node.id);');
  assert.ok(nodeIdx > 0, '应命中会话行 setData(node.id)');
  assert.ok(src.slice(nodeIdx, nodeIdx + 160).includes('react_dom.flushSync(() => {'), '会话行 drag.start 应被 flushSync 包裹');

  // 工作区行（row.key）保持原样（不引入无关变更）。
  const rowIdx = src.indexOf('e.dataTransfer.setData("text/plain", row.key);');
  assert.ok(rowIdx > 0, '应命中工作区行 setData(row.key)');
  assert.ok(!src.slice(rowIdx, rowIdx + 120).includes('flushSync'), '工作区行不应被 flushSync 包裹');

  // 幂等。
  assert.equal(transformManualSortFix(src, 'client.js').status, 'already');
});

// ---------------------------------------------------------------------------
// 2. 手动排序：拖拽 → 写入 store → 重读一致
// ---------------------------------------------------------------------------

test('手动排序：reconciledSessionOrder 保留已存顺序、追加新会话、剔除陈旧项', () => {
  assert.deepEqual(reconciledSessionOrder(['a', 'b', 'c'], undefined), ['a', 'b', 'c'], '无已存顺序时原样返回');
  assert.deepEqual(reconciledSessionOrder(['a', 'b', 'c'], ['c', 'a', 'b']), ['c', 'a', 'b'], '已存顺序优先');
  assert.deepEqual(reconciledSessionOrder(['a', 'b', 'c', 'd'], ['b', 'a']), ['b', 'a', 'c', 'd'], '新会话追加到末尾');
  assert.deepEqual(reconciledSessionOrder(['a', 'b'], ['stale', 'b', 'a']), ['b', 'a'], '陈旧项剔除');
});

test('手动排序：拖拽重排计算正确（before/after/追加/不动）', () => {
  const sessions = ['A', 'B', 'C'].map((id) => ({ id }));
  // A 拖到 C 之后。
  assert.deepEqual(reorderAfterDrag(['A', 'B', 'C'], 'A', { id: 'C', half: 'after' }, sessions), ['B', 'C', 'A']);
  // A 拖到 B 之前（原位不动）。
  assert.deepEqual(reorderAfterDrag(['A', 'B', 'C'], 'A', { id: 'B', half: 'before' }, sessions), ['A', 'B', 'C']);
  // C 拖到 A 之前。
  assert.deepEqual(reorderAfterDrag(['A', 'B', 'C'], 'C', { id: 'A', half: 'before' }, sessions), ['C', 'A', 'B']);
  // B 拖到最后（after C，anchor 为 undefined 追加）。
  assert.deepEqual(reorderAfterDrag(['A', 'B', 'C'], 'B', { id: 'C', half: 'after' }, sessions), ['A', 'C', 'B']);
});

test('手动排序：拖拽 → 写入 store + 重读一致（workspace 账号）', () => {
  const sessions = { A: { id: 'A', updatedAt: 1000 }, B: { id: 'B', updatedAt: 2000 }, C: { id: 'C', updatedAt: 3000 } };
  const list = { byId: sessions };

  // 模拟 store 状态（sessionOrderByAccount / sessionUpdatedAtByAccount）。
  const store = {
    sessionOrderByAccount: {},
    sessionUpdatedAtByAccount: {},
  };
  const setSessionOrder = (key, order) => { store.sessionOrderByAccount[key] = order; };
  const syncSessionOrderAccount = (key, order, updatedAt) => {
    store.sessionOrderByAccount[key] = order;
    store.sessionUpdatedAtByAccount[key] = updatedAt;
  };

  const accountKey = 'ws-1';
  let workspaceSessionIds = ['C', 'B', 'A']; // 后端初始（recency）顺序。

  // 切入 manual：首次 effect 同步出初始顺序。
  {
    const sessionIds = workspaceSessionIds.filter((id) => list.byId[id] !== void 0);
    const next = nextSessionOrderAccount({ sessionIds, previousOrder: store.sessionOrderByAccount[accountKey], previousUpdatedAt: store.sessionUpdatedAtByAccount[accountKey] ?? {}, list, orderBy: 'manual', sortByRecency: false });
    if (next.changed) syncSessionOrderAccount(accountKey, next.order, next.updatedAt);
  }
  assert.deepEqual(store.sessionOrderByAccount[accountKey], ['C', 'B', 'A'], 'manual 首同步保留后端顺序');

  // 拖拽 A 到 C 之前。
  const nextOrder = reorderAfterDrag(store.sessionOrderByAccount[accountKey], 'A', { id: 'C', half: 'before' }, ['C', 'B', 'A'].map((id) => ({ id })));
  setSessionOrder(accountKey, nextOrder);
  assert.deepEqual(store.sessionOrderByAccount[accountKey], ['A', 'C', 'B'], '拖拽后顺序写入 store');

  // effect 重跑（sessionOrderByAccount 变化）：manual 不再重排，重读一致。
  {
    const sessionIds = workspaceSessionIds.filter((id) => list.byId[id] !== void 0);
    const next = nextSessionOrderAccount({ sessionIds, previousOrder: store.sessionOrderByAccount[accountKey], previousUpdatedAt: store.sessionUpdatedAtByAccount[accountKey] ?? {}, list, orderBy: 'manual', sortByRecency: false });
    if (next.changed) syncSessionOrderAccount(accountKey, next.order, next.updatedAt);
  }
  assert.deepEqual(store.sessionOrderByAccount[accountKey], ['A', 'C', 'B'], 'effect 重跑后 manual 顺序不重置');

  // 模拟重载：store 重读（rehydrate）+ 后端顺序更新为 [A,C,B]。
  workspaceSessionIds = ['A', 'C', 'B'];
  {
    const sessionIds = workspaceSessionIds.filter((id) => list.byId[id] !== void 0);
    const next = nextSessionOrderAccount({ sessionIds, previousOrder: store.sessionOrderByAccount[accountKey], previousUpdatedAt: store.sessionUpdatedAtByAccount[accountKey] ?? {}, list, orderBy: 'manual', sortByRecency: false });
    if (next.changed) syncSessionOrderAccount(accountKey, next.order, next.updatedAt);
  }
  assert.deepEqual(store.sessionOrderByAccount[accountKey], ['A', 'C', 'B'], '重载后 manual 顺序保持');
});

test('手动排序：单列表（flat）账号顺序本地持久 + 新会话追加', () => {
  const FLAT = '__flat_session_order__';
  let sessions = { A: { id: 'A', updatedAt: 1000 }, B: { id: 'B', updatedAt: 2000 }, C: { id: 'C', updatedAt: 3000 } };
  const list = { byId: sessions };
  const store = { sessionOrderByAccount: {}, sessionUpdatedAtByAccount: {} };
  const sync = (key, order, updatedAt) => { store.sessionOrderByAccount[key] = order; store.sessionUpdatedAtByAccount[key] = updatedAt; };
  const setOrder = (key, order) => { store.sessionOrderByAccount[key] = order; };
  const recencyIds = () => Object.values(sessions).sort(byRecency).map((s) => s.id);

  // manual 首同步（flat 的 sessionIds 恒为 recency 派生）。
  {
    const n = nextSessionOrderAccount({ sessionIds: recencyIds(), previousOrder: store.sessionOrderByAccount[FLAT], previousUpdatedAt: store.sessionUpdatedAtByAccount[FLAT] ?? {}, list, orderBy: 'manual', sortByRecency: false });
    if (n.changed) sync(FLAT, n.order, n.updatedAt);
  }
  assert.deepEqual(store.sessionOrderByAccount[FLAT], ['C', 'B', 'A'], 'flat manual 首同步为 recency 顺序');

  // 拖拽 A 到 C 之前 → 写入本地 store。
  const rows = reconciledSessionOrder(recencyIds(), store.sessionOrderByAccount[FLAT]);
  const nextOrder = reorderAfterDrag(rows, 'A', { id: 'C', half: 'before' }, rows.map((id) => ({ id })));
  setOrder(FLAT, nextOrder);
  assert.deepEqual(store.sessionOrderByAccount[FLAT], ['A', 'C', 'B'], 'flat 拖拽后顺序写入');

  // 新增会话 D（updatedAt 最新）→ 追加到末尾，不重排已存顺序。
  sessions = { ...sessions, D: { id: 'D', updatedAt: 4000 } };
  list.byId = sessions;
  {
    const n = nextSessionOrderAccount({ sessionIds: recencyIds(), previousOrder: store.sessionOrderByAccount[FLAT], previousUpdatedAt: store.sessionUpdatedAtByAccount[FLAT] ?? {}, list, orderBy: 'manual', sortByRecency: false });
    if (n.changed) sync(FLAT, n.order, n.updatedAt);
  }
  assert.deepEqual(store.sessionOrderByAccount[FLAT], ['A', 'C', 'B', 'D'], '新会话追加到末尾、已存 manual 顺序不回归');
});

// ---------------------------------------------------------------------------
// 3. 「最近更新」排序不回归
// ---------------------------------------------------------------------------

test('最近更新：切入时全量 recency 排序，活动会话置顶一次', () => {
  const sessions = { A: { id: 'A', updatedAt: 1000 }, B: { id: 'B', updatedAt: 2000 }, C: { id: 'C', updatedAt: 3000 } };
  const list = { byId: sessions };
  const accountKey = 'ws-1';

  // 切入 updated（sortByRecency=true）：全量 recency 排序。
  let prevOrder;
  let prevUpdatedAt = {};
  {
    const n = nextSessionOrderAccount({ sessionIds: ['A', 'B', 'C'], previousOrder: prevOrder, previousUpdatedAt: prevUpdatedAt, list, orderBy: 'updated', sortByRecency: true });
    prevOrder = n.order;
    prevUpdatedAt = n.updatedAt;
  }
  assert.deepEqual(prevOrder, ['C', 'B', 'A'], '切入 updated 全量 recency 排序');

  // A 产生新活动（updatedAt 提升）→ 仅置顶 A 一次（promotion，不整体重排）。
  sessions.A.updatedAt = 5000;
  list.byId = sessions;
  {
    const n = nextSessionOrderAccount({ sessionIds: ['A', 'B', 'C'], previousOrder: prevOrder, previousUpdatedAt: prevUpdatedAt, list, orderBy: 'updated', sortByRecency: false });
    prevOrder = n.order;
    prevUpdatedAt = n.updatedAt;
  }
  assert.deepEqual(prevOrder, ['A', 'C', 'B'], 'updated 模式活动会话置顶一次，其余保持');
});

test('最近更新：无活动时顺序稳定（不因 effect 重跑而漂移）', () => {
  const sessions = { A: { id: 'A', updatedAt: 1000 }, B: { id: 'B', updatedAt: 2000 }, C: { id: 'C', updatedAt: 3000 } };
  const list = { byId: sessions };
  let prevOrder = ['C', 'B', 'A'];
  let prevUpdatedAt = { A: 1000, B: 2000, C: 3000 };

  const n = nextSessionOrderAccount({ sessionIds: ['A', 'B', 'C'], previousOrder: prevOrder, previousUpdatedAt: prevUpdatedAt, list, orderBy: 'updated', sortByRecency: false });
  assert.deepEqual(n.order, ['C', 'B', 'A'], '无活动时顺序稳定');
  assert.equal(n.changed, false, '无变化时 changed=false（避免无谓写入）');
});
