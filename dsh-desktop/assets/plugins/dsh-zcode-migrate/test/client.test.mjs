// 客户端半（设置页）的**行为**测试：用一个最小 react shim 把设置卡片真渲染出来，
// 然后像用户那样点按钮。
//
// 为什么非要有这一层：`lib/client.js` 是手写产物（无打包器、无 JSX 编译），原先只有
// 源码级断言 —— 于是「`onClick: run` 把点击事件当参数传进去」这种错法一条都没拦住：
// 事件不是数组，`ids.length` 是 undefined，批循环整个不执行，预演模式下静默「0 成功」，
// 关掉预演就死在 `ids.map is not a function`（用户实报）。源码正则看不出这个，
// 只有真渲染 + 真点击能看出来。
//
// 本文件不引入任何依赖：react 与内核 primitive 都由 shim 提供（bundle 的 factory 是
// `(require) => …`，require 由我们给），所以 `npm test` 依然零安装可跑。

import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')
// 注册名的期望值取 package.json，别写死字面量：内核是按包名向 boot graph 要这一行的，
// 写死会让测试和门禁各认一份名字（真机就是因为两边都写裸名而一起错）。
const PKG_NAME = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).name

const T = 1_760_000_000_000
const CWD = 'C:/proj-a'

/** 侦察结果的合成载荷：一个项目、三条会话（其中一条已迁移）。 */
function inspectPayload() {
  return {
    ok: true,
    dbPath: 'C:/z/db.sqlite',
    dshRoot: 'C:/dsh/sessions',
    dshRootExists: true,
    runtime: { zstd: true },
    database: { sessions: 3 },
    selected: 3,
    directories: [{ directory: CWD, sessions: 3, exists: true }],
    sessions: [
      { zcodeId: 'sess_a', dshId: 'zcode-sess_a', title: 'A', directory: CWD, directoryExists: true, createdAt: T, parentId: null, alreadyMigrated: false },
      { zcodeId: 'sess_b', dshId: 'zcode-sess_b', title: 'B', directory: CWD, directoryExists: true, createdAt: T + 1, parentId: null, alreadyMigrated: false },
      { zcodeId: 'sess_c', dshId: 'zcode-sess_c', title: 'C', directory: CWD, directoryExists: true, createdAt: T + 2, parentId: null, alreadyMigrated: true },
    ],
  }
}

/**
 * 极简 react：够跑这一个组件（createElement / useState / useRef / useMemo）。
 * setState 直接触发一次重渲染（同步），断言里就不需要 await 渲染队列。
 */
function makeReact() {
  const slots = []
  let cursor = 0
  let render = () => {}
  const react = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }
    },
    useState(init) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init
      return [slots[i], (next) => {
        const value = typeof next === 'function' ? next(slots[i]) : next
        if (Object.is(value, slots[i])) return
        slots[i] = value
        render()
      }]
    },
    useRef(init) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { current: init }
      return slots[i]
    },
    useMemo(fn) {
      cursor++ // 每次渲染都重算：这里没有重计算，省掉依赖比较
      return fn()
    },
  }
  return { react, begin() { cursor = 0 }, onRender(fn) { render = fn } }
}

/**
 * 按真实路径装载 bundle：走 `apply(ctx)`，从 settings.section 的注册里拿到卡片组件
 * （顺便验证注册形状），而不是给产物开一个测试专用的导出。
 */
async function mount() {
  const loaded = []
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (def) => loaded.push(def) } }
  try {
    await import(`${pathToFileURL(BUNDLE).href}?t=${Date.now()}`)
  } finally {
    globalThis.window = previousWindow
  }
  assert.equal(loaded.length, 1, 'bundle 必须恰好调用一次 __ModuleLoader__.load')
  assert.equal(loaded[0].id, PKG_NAME)

  const { react, begin, onRender } = makeReact()
  const require = (name) => {
    if (name === 'react') return react
    if (name === '@deepseek-ai/dsh-client-ui-primitives') {
      return { Button: (props) => react.createElement('button', props, props.children) }
    }
    throw new Error(`未预期的 require(${name})`)
  }
  const mod = loaded[0].factory(require)

  const calls = []
  let registered = null
  let slotName = null
  const ctx = {
    slots: {
      inject: (name, cb) => { slotName = name; cb() },
      register: (def, Component, note) => { registered = { def, Component, note } },
    },
  }
  mod.apply(ctx)
  assert.equal(slotName, 'settings.section', '页面必须注册到设置槽')
  assert.equal(registered.def.id, 'zcode-migrate')
  assert.ok(typeof registered.Component === 'function', '注册的必须是组件函数')

  let tree = null
  const render = () => { begin(); tree = registered.Component() }
  onRender(render)
  return { mod, calls, render, getTree: () => tree, registered }
}

/** 深度优先收集所有元素节点。 */
function nodes(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) nodes(child, out); return out }
  out.push(node)
  nodes(node.props?.children, out)
  return out
}

const textOf = (node) => (typeof node?.props?.children === 'string' ? node.props.children : '')

/** 文本里含 needle 的**可点**节点。 */
const findButton = (tree, needle) => nodes(tree).find((n) => n.props?.onClick && textOf(n).includes(needle))

/** 整棵树里是否有节点的文本含 needle（不要求可点）。 */
const hasText = (tree, needle) => nodes(tree).some((n) => textOf(n).includes(needle))

/** 「先预演（不写盘）」那个开关（页面里还有会话勾选框，不能按下标取）。 */
function dryRunSwitch(tree) {
  for (const n of nodes(tree)) {
    const kids = Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]
    const box = kids.find((k) => k?.props?.type === 'checkbox')
    if (box && kids.some((k) => textOf(k).includes('先预演'))) return box
  }
  return undefined
}

/** fetch 桩：按 URL 尾部的动作名分派，记录每次调用。 */
function stubFetch(calls, bodies = {}) {
  globalThis.fetch = async (url, opts) => {
    const action = String(url).split('/').pop()
    calls.push({ action, body: JSON.parse(opts?.body ?? '{}') })
    return { ok: true, status: 200, json: async () => (bodies[action] ?? { ok: true }) }
  }
}

test('点「迁移选中」必须真的发 migrate 请求（回归：onClick 直挂 run 会吃到事件对象）', async () => {
  const { calls, render, getTree } = await mount()
  stubFetch(calls, { inspect: inspectPayload(), migrate: { ok: true, sessions: [] }, workspaces: { ok: true, results: [] } })

  render()
  await findButton(getTree(), '侦察').props.onClick({ fake: 'event' })
  render()

  // 侦察后默认勾好「未迁移」的两条（sess_a / sess_b），sess_c 已迁移不勾。
  const runBtn = findButton(getTree(), '迁移选中')
  assert.ok(runBtn, '找不到「迁移选中」按钮')
  // 关键：React 的 onClick 会把事件对象作为第一个实参传进来，这里就按事件传。
  await runBtn.props.onClick({ nativeEvent: 'click', target: {} })
  render()

  const migrate = calls.find((c) => c.action === 'migrate')
  assert.ok(migrate, '点「迁移选中」没有发出 migrate 请求（正是 ids.map 那个 bug 的表现）')
  assert.deepEqual(migrate.body.ids, ['sess_a', 'sess_b'], 'ids 必须是勾选出来的数组，不是事件对象')
  assert.equal(migrate.body.dryRun, true, '默认先预演')
  assert.equal(findButton(getTree(), '迁移中'), undefined, '不该卡在迁移中')
})

test('关掉预演后点「迁移选中」：按批迁移 + 自动登记工作区（曾死在 ids.map）', async () => {
  const { calls, render, getTree } = await mount()
  stubFetch(calls, {
    inspect: inspectPayload(),
    migrate: { ok: true, sessions: [{ status: 'migrated', zcodeId: 'sess_a' }] },
    workspaces: { ok: true, results: [{ directory: CWD, ok: true, id: 'ws-1', title: 'proj-a' }] },
  })

  render()
  await findButton(getTree(), '侦察').props.onClick()
  render()

  // 取消勾选「先预演」——唯一会走到 ids.map 那条分支的开关。
  const dry = dryRunSwitch(getTree())
  assert.ok(dry, '找不到预演开关')
  assert.equal(dry.props.checked, true, '预演默认开')
  dry.props.onChange()
  render()
  assert.equal(dryRunSwitch(getTree()).props.checked, false)

  await findButton(getTree(), '迁移选中').props.onClick({ nativeEvent: 'click' })
  render()

  const migrate = calls.find((c) => c.action === 'migrate')
  assert.ok(migrate, '没有发出 migrate 请求')
  assert.equal(migrate.body.dryRun, false)
  assert.deepEqual(migrate.body.ids, ['sess_a', 'sess_b'])
  // 真迁之后必须把会话**挂进**工作区：只 create 出空工作区的话，会话还是留在「未分组」
  // （用户实报「迁移后也没到工作区」）。所以这里断言发的是 groups + dsh 会话 id。
  const ws = calls.find((c) => c.action === 'workspaces')
  assert.ok(ws, '真迁之后必须登记工作区')
  assert.deepEqual(ws.body.groups, [{
    directory: CWD,
    sessionIds: ['zcode-sess_a', 'zcode-sess_b', 'zcode-sess_c'],
  }], '按目录带上该目录下的 dsh 会话 id（含已迁移的，顺手修历史残留）')
})

test('「登记工作区」按钮也带会话 id（不只是建空工作区）', async () => {
  const { calls, render, getTree } = await mount()
  stubFetch(calls, { inspect: inspectPayload(), workspaces: { ok: true, results: [] } })

  render()
  await findButton(getTree(), '侦察').props.onClick()
  render()
  await findButton(getTree(), '登记工作区').props.onClick()
  render()

  const ws = calls.find((c) => c.action === 'workspaces')
  assert.ok(ws, '没发出 workspaces 请求')
  assert.deepEqual(ws.body.groups, [{
    directory: CWD,
    sessionIds: ['zcode-sess_a', 'zcode-sess_b', 'zcode-sess_c'],
  }])
})

test('没勾任何会话就点迁移：只提示，不发请求', async () => {
  const { calls, render, getTree } = await mount()
  stubFetch(calls, { inspect: inspectPayload() })

  render()
  await findButton(getTree(), '侦察').props.onClick()
  render()
  await findButton(getTree(), '清空').props.onClick()
  render()
  await findButton(getTree(), '迁移选中').props.onClick({ nativeEvent: 'click' })
  render()

  assert.equal(calls.some((c) => c.action === 'migrate'), false, '空选集不得发请求')
  assert.ok(hasText(getTree(), '先勾选要迁移的会话。'), '必须提示先勾选')
})

test('「迁移此组」传数组：只迁该组未迁移的会话', async () => {
  const { calls, render, getTree } = await mount()
  stubFetch(calls, { inspect: inspectPayload(), migrate: { ok: true, sessions: [] }, workspaces: { ok: true, results: [] } })

  render()
  await findButton(getTree(), '侦察').props.onClick()
  render()
  const group = findButton(getTree(), '迁移此组')
  assert.ok(group, '找不到「迁移此组」按钮')
  assert.match(textOf(group), /迁移此组（2）/, '只数该组未迁移的')
  await group.props.onClick()
  render()

  const migrate = calls.find((c) => c.action === 'migrate')
  assert.deepEqual(migrate.body.ids, ['sess_a', 'sess_b'])
})
