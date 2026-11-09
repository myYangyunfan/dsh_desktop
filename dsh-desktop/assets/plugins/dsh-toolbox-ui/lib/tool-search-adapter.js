// 呈现端口的**宿主适配层**：唯一一处知道"这个宿主在第几步把工具声明交给模型"。
//
// 两代宿主（都真实存在，同一插件版本要同时支持）：
//
//   rc.5（legacy）—— `system-prompt/assemble` 是真正的 waterfall，入参 assembly 里
//   带 `tools`，返回值就是最终结果。在那里过滤 tools 有效。
//
//   rc.1（modern）—— waterfall 的载荷只有 sections/contexts/variables；工具声明由
//   `ToolsService` 通过 `systemPrompt.tools(provider)` 提供，宿主在 **waterfall 之后**
//   才把 provider-owned 的 `tools` 贴回最终 assembly（`{...transformed, tools}`）。
//   所以在这个版本上"在 waterfall 里改 tools"是无声无效的——目录段会出现、声明不会消失，
//   正是"面板说延迟、模型其实全看得见"那种自相矛盾。
//
// 现代代的接入点因此是：**在原 assemble 返回之后、agent loop 记录 request/header 之前**
// 对返回值做统一投影。这是明确的**方法装饰（兼容桥）**，不是宿主公开 hook：
//   - 用宿主同一份 Cordis 的 `symbols.original` 解包真实服务实例（普通代理每次读都会
//     生成新 proxy，`===` 判不了所有权）；
//   - 保存并恢复 descriptor；同一服务实例只有一个分发层（模块级 WeakMap），多消费者共享；
//   - 第三方先装/后装都能被识别：先装则链在它后面并报诊断，后装则卸载时不覆盖它；
//   - 服务重挂（HMR）时按 `internal/service` 重新绑定，旧实例解绑。
//
// 将来宿主提供正式的呈现 filter（`tools.filterPresentation`）时，只需要在这里换实现，
// 业务层（tool-search-presentation.js）不动。

/** Cordis 的公开符号：解包服务代理，拿到真实实例。两代 Cordis 都是 `Symbol.for`，跨模块实例稳定。 */
export const CORDIS_ORIGINAL = Symbol.for('cordis.original')

/** 宿主代次。`unknown` 不是"当成 legacy"，而是明确失败——猜错等于静默失效。 */
export const GENERATIONS = Object.freeze({ LEGACY: 'legacy', MODERN: 'modern', UNKNOWN: 'unknown' })

/**
 * 按**能力**判定宿主代次（不按版本号正则、不探测私有字段）。
 *
 * - modern：`tools.resolve()` + `tools.definitions(scope, toolSet)`（step 级准入 + 最终声明读取）。
 * - legacy：`presentAs` / `sdkSchemas` / `modeFor` 任一（旧宿主把呈现与 SDK 都挂在 tools 上）。
 *
 * 两者同时出现时选 modern 并报诊断：modern 的 `resolve/definitions` 是更强的契约，
 * 而且 legacy 的三个私有面在 modern 上本来就不存在——真同时出现说明有人在打补丁。
 *
 * @param {object|undefined} tools - 宿主 tools 服务（可以是代理）。
 * @returns {{generation: 'legacy'|'modern'|'unknown', reason: string, modern: boolean, legacy: boolean}}
 */
export function detectToolsGeneration(tools) {
  const modern = typeof tools?.resolve === 'function' && typeof tools?.definitions === 'function'
  const legacy = typeof tools?.presentAs === 'function'
    || typeof tools?.sdkSchemas === 'function'
    || typeof tools?.modeFor === 'function'
  if (modern && !legacy) return { generation: GENERATIONS.MODERN, reason: 'tools.resolve + tools.definitions', modern, legacy }
  if (legacy && !modern) return { generation: GENERATIONS.LEGACY, reason: 'tools.presentAs/sdkSchemas/modeFor', modern, legacy }
  if (modern && legacy) {
    return { generation: GENERATIONS.MODERN, reason: 'both capability sets are present; the step-owned toolSet wins', modern, legacy }
  }
  return { generation: GENERATIONS.UNKNOWN, reason: 'neither the legacy nor the modern tools capability set was found', modern, legacy }
}

/**
 * 同一进程里可能并存多个 root/服务实例（测试、HMR、多 profile）。
 * 键是**真实服务实例**，不是代理——代理每次读都是新对象。
 * @type {WeakMap<object, {wrapper: Function, descriptor: PropertyDescriptor|undefined, original: Function, consumers: Set<Function>, foreign: boolean}>}
 */
const registries = new WeakMap()

function unwrap(service) {
  if (service === null || typeof service !== 'object') return undefined
  return service[CORDIS_ORIGINAL] ?? service
}

/**
 * 现代宿主的呈现接入：装饰 `systemPrompt.assemble`。
 *
 * 分发层语义：
 * - 第一个消费者装 wrapper；后来的消费者只是挂进同一个 consumers 集合（**不许再套一层**：
 *   多层装饰会让一次组装跑多遍投影，第二次看到的是已经裁过的结果，目录段也会重复）。
 * - 卸载时只摘自己；最后一个消费者离开才恢复 descriptor。
 * - 若此刻 `assemble` 已经不是我们的 wrapper（第三方替换），**不动它**，只报冲突。
 *
 * @param {object} ctx - 插件 context（用来读/监听 systemPrompt 服务）。
 * @param {(assembly: object, context: object) => Promise<object>} present - 投影函数。
 * @param {{onDiagnostic?: (event: {code: string, [key: string]: unknown}) => void}} [options]
 * @returns {{dispose: () => void, status: () => object, rebind: () => void}}
 */
export function installAssembleDecorator(ctx, present, options = {}) {
  const { onDiagnostic } = options
  let bound; // { target, wrapper } 当前绑定的服务实例
  let disposed = false

  const consumer = async (assembly, context) => present(assembly, context)

  const bind = () => {
    if (disposed) return
    const service = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
    const target = unwrap(service)
    if (target === undefined || typeof target?.assemble !== 'function') {
      onDiagnostic?.({ code: 'PRESENTATION_SERVICE_UNAVAILABLE', message: 'systemPrompt.assemble() is unavailable; deferred tools cannot be hidden in this host' })
      return
    }
    if (bound?.target === target) return
    if (bound !== undefined) unbind()
    const existing = registries.get(target)
    if (existing !== undefined) {
      existing.consumers.add(consumer)
      bound = { target, wrapper: existing.wrapper }
      return
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, 'assemble')
    const original = target.assemble
    if (typeof original !== 'function') {
      onDiagnostic?.({ code: 'PRESENTATION_SERVICE_UNAVAILABLE', message: 'systemPrompt.assemble is not callable' })
      return
    }
    const foreign = descriptor !== undefined && typeof descriptor.value === 'function'
    const consumers = new Set([consumer])
    const wrapper = async function assemble(context = {}) {
      const assembly = await original.call(this, context)
      let presented = assembly
      // 顺序按注册顺序；每个消费者看到的是上一个的输出（目前只有一个业务消费者，
      // 这条规则是为了让将来的窄扩展有确定语义，而不是让结果依赖谁先注册）。
      for (const decorate of consumers) {
        if (context?.agent === undefined) break
        presented = await decorate(presented, context)
      }
      return presented
    }
    Object.defineProperty(target, 'assemble', {
      value: wrapper,
      configurable: true,
      writable: true,
      enumerable: false,
    })
    registries.set(target, { wrapper, descriptor, original, consumers, foreign })
    bound = { target, wrapper }
    if (foreign) {
      onDiagnostic?.({
        code: 'PRESENTATION_CHAINED',
        message: 'another consumer already decorated systemPrompt.assemble(); this presentation port is chained behind it',
      })
    }
  }

  const unbind = () => {
    if (bound === undefined) return
    const { target, wrapper } = bound
    bound = undefined
    const registry = registries.get(target)
    if (registry === undefined || registry.wrapper !== wrapper) return
    registry.consumers.delete(consumer)
    if (registry.consumers.size > 0) return
    registries.delete(target)
    const current = Object.getOwnPropertyDescriptor(target, 'assemble')
    if (current === undefined || current.value !== wrapper) {
      // 第三方在我们之后替换了 assemble：**不许覆盖**它的实现。
      onDiagnostic?.({
        code: 'PRESENTATION_REPLACED',
        message: 'systemPrompt.assemble was replaced by another consumer; this port does not overwrite it on unload',
      })
      return
    }
    if (registry.descriptor === undefined) delete target.assemble
    else Object.defineProperty(target, 'assemble', registry.descriptor)
  }

  bind()
  // HMR：宿主服务重挂时拿到的是新实例；旧实例上的装饰由 unbind 摘掉。
  const offService = typeof ctx.on === 'function'
    ? ctx.on('internal/service', (name) => {
      if (name !== 'systemPrompt') return
      const service = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
      const next = unwrap(service)
      if (next === bound?.target) return
      unbind()
      bind()
    })
    : undefined

  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      try { offService?.() } catch { /* 监听器已随 ctx 释放：清冾是幂等的 */ }
      unbind()
    },
    status: () => ({
      kind: 'assemble-decorator',
      attached: bound !== undefined,
      foreign: bound === undefined ? false : registries.get(bound.target)?.foreign === true,
    }),
    /** 服务晚到时的显式重试（安装期没拿到 systemPrompt）。 */
    rebind: bind,
  }
}

/**
 * legacy 宿主的呈现接入：waterfall 里过滤 `assembly.tools`。
 * `prepend: true` 保证本插件的目录段/裁剪发生在其他消费者之前（与既有行为一致）。
 *
 * @param {object} ctx
 * @param {(assembly: object, context: object) => Promise<object>} present
 * @returns {{dispose: () => void, status: () => object}}
 */
export function installAssembleWaterfall(ctx, present) {
  const dispose = ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const resolved = await next()
    if (context?.agent === undefined) return resolved
    return present(resolved, context)
  }, { prepend: true })
  return {
    dispose: () => dispose?.(),
    status: () => ({ kind: 'assemble-waterfall', attached: true, foreign: false }),
  }
}

/**
 * 安装呈现端口。现代代用 assemble 装饰，旧代用 waterfall；未知代次**明确报错**。
 *
 * @param {object} ctx
 * @param {object} tools - 宿主 tools 服务。
 * @param {(assembly: object, context: object) => Promise<object>} present
 * @param {{onDiagnostic?: (event: object) => void, generation?: 'legacy'|'modern'}} [options]
 * @returns {{dispose: () => void, status: () => object, generation: string, reason: string}}
 */
export function installPresentationPort(ctx, tools, present, options = {}) {
  const detected = detectToolsGeneration(tools)
  const generation = options.generation ?? detected.generation
  if (generation === GENERATIONS.UNKNOWN) {
    throw new Error(`tool-search: 无法识别宿主工具契约（${detected.reason}）：拒绝在未知代次上装作延迟加载已生效`)
  }
  const handle = generation === GENERATIONS.MODERN
    ? installAssembleDecorator(ctx, present, options)
    : installAssembleWaterfall(ctx, present)
  return { ...handle, generation, reason: detected.reason }
}
