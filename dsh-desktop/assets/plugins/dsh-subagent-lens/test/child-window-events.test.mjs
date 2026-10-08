// dsh-subagent-lens：子会话事件窗口读取的回归守卫（M2）。
//
// 真机背景（2026-09-26）：老实现读 `binding.session.events` 并断言它是数组。
// 页内侧（dsh-api-session-controller）的 binding 是 `{ sessionId, session,
// eventSource, ctx }`，`session.events` 是 **SessionEventStream**（异步日志流，
// 有 prepend()/open()）而不是数组 —— `Array.isArray` 恒为假，于是子代理活动
// 明细这块功能被守卫静默吞掉：不报错、不渲染、控制台干净。时间线上的真相在
// `binding.eventSource.getSnapshot().entries[i].event`。
//
// 本文件物化真实的 lib/client.js（vm 沙箱，只喂 require 桩），验证：
//   ① 真机形状（eventSource 窗口）能读出事件；
//   ② 反证：老判据（Array.isArray(binding.session.events)）在同一 binding 上
//      必然返回 null —— 功能确实是死在这条判据上，不是别处；
//   ③ 旧内核回落（session.events 数组 / session.snapshotEvents()）仍可用；
//   ④ 同一次窗口快照两次调用返回同一数组实例（activityFromEventsCached 的
//      增量扫靠数组身份，派生数组每次新建会让它退化成 O(N²) 全量重扫）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/** 物化 client.js，返回它的 exports（apply/inject + 纯函数）。 */
function loadClient() {
  let registration
  const sandbox = {
    window: { __ModuleLoader__: { load: (r) => { registration = r } } },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Symbol,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    JSON,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Error,
    isNaN,
    parseInt,
    parseFloat,
  }
  sandbox.globalThis = sandbox
  const requireStub = (spec) => {
    if (spec === 'react') return { useSyncExternalStore: () => undefined, useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: undefined }), createElement: () => undefined, Fragment: {} }
    if (spec === 'react/jsx-runtime') return { jsx: () => undefined, jsxs: () => undefined, Fragment: {} }
    throw new Error('unexpected require in sandbox: ' + spec)
  }
  vm.runInNewContext(source, sandbox, { filename: 'dsh-subagent-lens/client.js' })
  assert.equal(registration.id, '@dsh-external/dsh-subagent-lens', '注册名必须是包名（boot graph 按包名对表）')
  return registration.factory(requireStub)
}

const client = loadClient()

/** 页内真机 binding：session.events 是流对象，事件在 eventSource 的窗口里。 */
function realBinding(events) {
  const entries = events.map((event) => ({
    event,
    revision: event.seq,
    address: { mode: 'ordinary', sessionId: 'child-1' },
  }))
  return {
    sessionId: 'child-1',
    session: {
      id: 'child-1',
      // SessionEventStream：有 prepend/open，**不是**数组
      events: { prepend: () => {}, open: async () => {}, dispose: () => {} },
    },
    eventSource: { getSnapshot: () => ({ entries, hasMore: false, revision: 3, change: { kind: 'replace' } }) },
    ctx: {},
  }
}

const CALL_EVENT = {
  type: 'tool/call',
  seq: 7,
  time: 1,
  data: { callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'npm test' }) },
}

test('真机形状：事件从 binding.eventSource 的窗口读出（不再读 session.events）', () => {
  const binding = realBinding([CALL_EVENT])
  const events = client.childWindowEvents(binding)
  assert.ok(Array.isArray(events), '应当给出事件数组')
  assert.equal(events.length, 1)
  assert.equal(events[0], CALL_EVENT, '条目里的 event 本体应当原样透出')
})

test('反证：老判据在同一个 binding 上必然读不到（功能就是死在那条判据上）', () => {
  const binding = realBinding([CALL_EVENT])
  const oldRead = binding && binding.session && Array.isArray(binding.session.events) ? binding.session.events : null
  assert.equal(oldRead, null, 'Array.isArray(session.events) 恒假 ⇒ 老实现静默降级')
  assert.equal(client.childWindowEvents(binding).length, 1, '新读取口能读到同一份事件')
})

test('读出来的事件能直接喂给活动提取（端到端形状一致）', () => {
  const events = client.childWindowEvents(realBinding([CALL_EVENT]))
  const activity = client.activityFromEvents(events, { commandChars: 200 })
  assert.equal(activity.commands.length, 1, '命令清单应当被识别')
  assert.match(activity.commands[0].command, /npm test/)
})

test('回落①：旧 client-runtime 的 session.events 数组仍然可用', () => {
  const events = [CALL_EVENT]
  const binding = { sessionId: 'child-2', session: { id: 'child-2', events }, ctx: {} }
  assert.equal(client.childWindowEvents(binding), events)
})

test('回落②：session.snapshotEvents() 可用时也能读出', () => {
  const events = [CALL_EVENT]
  const binding = { sessionId: 'child-3', session: { id: 'child-3', snapshotEvents: () => events }, ctx: {} }
  assert.equal(client.childWindowEvents(binding), events)
})

test('无来源时返回 null（不是抛错，也不是空数组假装有数据）', () => {
  assert.equal(client.childWindowEvents(undefined), null)
  assert.equal(client.childWindowEvents({ sessionId: 'x', session: { id: 'x' }, ctx: {} }), null)
})

test('同一窗口快照两次调用返回同一数组实例（增量扫缓存不被派生数组打碎）', () => {
  const binding = realBinding([CALL_EVENT])
  const first = client.childWindowEvents(binding)
  const second = client.childWindowEvents(binding)
  assert.equal(first, second, '同一 entries 快照必须复用派生数组')
  const grown = realBinding([CALL_EVENT, { ...CALL_EVENT, seq: 8, data: { callId: 'c2', name: 'bash', arguments: JSON.stringify({ command: 'git status' }) } }])
  const third = client.childWindowEvents(grown)
  assert.notEqual(third, first, '窗口换新（新事件）应当重新派生')
  assert.equal(third.length, 2)
})
