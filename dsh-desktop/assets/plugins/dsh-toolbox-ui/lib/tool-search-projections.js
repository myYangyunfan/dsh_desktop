// 会话投影端口：两代宿主的 `sessionProjections` 注册/读取形状不同，这里收敛成一个入口。
//
//   rc.5（legacy）—— `register(definition)` **同步**返回 disposer；读取是
//   `stateOf(session, key)`。
//   rc.1（modern）—— `register(definition)` 返回 **thenable handle**（`{ stateOf(session),
//   dispose(): Promise }`），旧的 `stateOf(session, key)` 已标记废弃并在调用时打 warn。
//
// 为什么会出错（而不是"都兼容"）：
//   - 现代句柄没 await 就发布 = 消费者可能读到"注册前"的状态，恢复静默丢失；
//   - 卸载时不 await `dispose()` = 同一个 key 在 HMR 后重复注册，宿主直接抛错；
//   - 安装到一半失败不回收 = 半成品监听器留在会话里。
// 所以这一层必须：把注册变成"可等待的就绪"，并把释放变成"可等待的清理"。
// 晚于安装完成的注册一旦失败，**明确记诊断**，不假装恢复能力存在。

/**
 * @typedef {object} ProjectionPort
 * @property {boolean} available - 宿主是否提供 sessionProjections。
 * @property {Promise<{state: 'ready'|'failed', reason?: string}>} ready - 注册就绪。
 * @property {(session: object|undefined) => unknown} stateOf - 同步读；未就绪/不可用返回 undefined。
 * @property {() => Promise<void>} dispose - 释放（会等就绪）。
 * @property {() => object} status - 能力状态。
 */

/**
 * 安装发现集投影。
 *
 * @param {object} ctx - 插件 context（只需要可选的 `get`）。
 * @param {object} definition - 宿主 ProjectionDefinition（key/stateSchema/init/apply/stateVersion）。
 * @param {{key: string, onDiagnostic?: (event: object) => void}} options
 * @returns {ProjectionPort}
 */
export function installProjectionPort(ctx, definition, options) {
  const { key, onDiagnostic } = options
  const service = typeof ctx?.get === 'function' ? ctx.get('sessionProjections') : undefined
  const diagnostics = []
  const note = (event) => {
    diagnostics.push(event)
    onDiagnostic?.(event)
  }
  if (typeof service?.register !== 'function') {
    return {
      available: false,
      ready: Promise.resolve({ state: 'unavailable', reason: 'ctx.sessionProjections is absent' }),
      stateOf: () => undefined,
      dispose: async () => {},
      status: () => ({ state: 'unavailable', reason: 'ctx.sessionProjections is absent', legacy: false, diagnostics }),
    }
  }
  // 同步 disposer（legacy）与异步 handle（modern）在这里合流：都变成一个 thenable handle。
  let handle
  let legacy = false
  const ready = (async () => {
    try {
      const registered = service.register(definition)
      if (typeof registered === 'function') {
        legacy = true
        handle = {
          stateOf: (session) => (session === undefined ? undefined : service.stateOf(session, key)),
          dispose: async () => { registered() },
        }
        return { state: 'ready' }
      }
      if (registered === null || typeof registered !== 'object') {
        throw new Error('sessionProjections.register() returned neither a disposer nor a handle')
      }
      // 现代句柄：先 await 就绪，再让任何消费者读它。
      const resolved = await registered
      handle = resolved
      // 旧的同步 `stateOf(session, key)` 在 modern 上已废弃：有句柄就只走句柄。
      if (typeof resolved?.stateOf !== 'function') throw new Error('the projection handle exposes no stateOf()')
      return { state: 'ready' }
    } catch (error) {
      note({ code: 'PROJECTION_REGISTER_FAILED', message: error?.message ?? String(error) })
      return { state: 'failed', reason: error?.message ?? String(error) }
    }
  })()

  return {
    available: true,
    ready,
    stateOf: (session) => {
      if (session === undefined || handle === undefined) return undefined
      try {
        return handle.stateOf(session)
      } catch (error) {
        note({ code: 'PROJECTION_READ_FAILED', message: error?.message ?? String(error) })
        return undefined
      }
    },
    dispose: () => {
      // 同步注册的旧宿主：不需要等任何东西，保持"cleanup 是同步的"这条既有契约
      //（卸载期间宿主按引用判状态，晚一个微任务注销就等于 HMR 后键还挂着）。
      if (legacy && handle !== undefined) {
        const target = handle
        handle = undefined
        try {
          target.dispose()
        } catch (error) {
          note({ code: 'PROJECTION_DISPOSE_FAILED', message: error?.message ?? String(error) })
        }
        return undefined
      }
      return (async () => {
        await ready
        if (handle === undefined) return
        const target = handle
        handle = undefined
        try {
          await target.dispose()
        } catch (error) {
          note({ code: 'PROJECTION_DISPOSE_FAILED', message: error?.message ?? String(error) })
        }
      })()
    },
    status: () => ({
      state: handle === undefined ? 'pending' : 'ready',
      legacy,
      diagnostics,
    }),
  }
}
