// SDK 手册（`tools:sdk` 段）的裁剪：**纯决策**，不碰任何宿主服务。
//
// 为什么能裁：宿主把 `tools:sdk` 用导出的渲染器从"可见工具的全量 schema"渲染出来
// （`renderToolsSdk` / `renderToolsSdkPy`，F3），而它是 `assembly.sections` 里普通的一段——
// 本插件本来就在改那个数组。所以"把延迟中的工具从手册里拿掉"= 重渲染一个子集，
// 不需要解析生成物（第九轮那套 `renderKey` 形态假设 / 数花括号 / 两个 map 同步删全部作废）。
//
// 不变量（B2/B3）：
// - 先自检**前提**：`render(全集) === 宿主原文`。相等才说明"我算出的输入 = 宿主渲染用的输入"。
// - 任何一步不成立都**返回失败**，调用方用宿主原文。最坏 = 今天（PTC 仍净亏，但不更坏）。
// - 自检**不是**版本漂移探测器：我们 import 的是同一个包，官方升级时两边一起变。
//   它检测的是输入/后处理不一致（别的插件改写了 section、scope 取错、宿主加了后处理）。

import * as dshTools from '@deepseek-ai/dsh-tools'
import { RUN_CODE_TOOL } from './tool-search-host.js'

/** 宿主 PTC 传输工具的规范名（`dsh-tools` 的 `RUN_CODE_NAME`；测试钉住它没写错）。 */
const RUN_CODE = RUN_CODE_TOOL
const renderersByHost = new WeakMap()

function rendererModuleFor(host, loader) {
  if (typeof host?.definitions === 'function') {
    let pending = renderersByHost.get(host)
    if (pending === undefined) {
      pending = Promise.resolve().then(() => loader())
      renderersByHost.set(host, pending)
      pending.catch(() => renderersByHost.delete(host))
    }
    return pending
  }
  return Promise.resolve(dshTools)
}

/**
 * 从当前宿主 Loader 取 renderer 模块。新旧解析树不能跨用：即使版本相同，Cordis identity
 * 仍由宿主 loader 包的模块实例决定。新版入口只在 `definitions()` 契约存在时才加载。
 * @param {{host?: object, loadNewRenderer?: () => Promise<object>}} [options]
 * @returns {Promise<object>}
 */
export function loadRenderers(options = {}) {
  return rendererModuleFor(options.host, options.loadNewRenderer ?? (() => import('@deepseek-ai/dsh-tool-executor-ptc')))
}

/**
 * 同步选择一个已加载模块的 renderer。旧宿主继续使用同一份 dsh-tools 出口。
 * @param {string|undefined} language
 * @param {object} [module]
 * @returns {Function|undefined}
 */
export function rendererFor(language, module = dshTools) {
  return language === 'python' ? module.renderToolsSdkPy : module.renderToolsSdk
}

/**
 * 同步选择语言对应的 schema->type renderer。
 * @param {string|undefined} language
 * @param {object} [module]
 * @returns {Function|undefined}
 */
export function schemaTypeRendererFor(language, module = dshTools) {
  return language === 'python' ? module.jsonSchemaToPy : module.jsonSchemaToTs
}

/**
 * 取宿主渲染 `tools:sdk` 用的**原输入**。
 *
 * 两条路（B2，F22 实测两条产物逐字节相同）：
 * - 快路径：`tools.sdkSchemas(scope)` 一次给全（≈15ms / 701 工具）。private，feature-detect。
 * - 主路：公开 `tools.schemas(scope)`（name/description/parameters/`deferLoading`）+
 *   逐工具 `tools.get(name, scope)` 补 `output.schema`（≈278ms / 701 工具）。
 *   代价是 O(n²)，所以调用方按 revision 缓存，一个 revision 只付一次。
 *
 * 两条路都排除 `run_code`（宿主的 `sdkSchemas` 同样排除它）。
 * 任一工具缺 `output.schema` → 放弃（`via: 'incomplete'`）：少一条签名的手册是**错的**，
 * 而"裁错"比"不裁"坏。
 *
 * @param {object} tools - 宿主 tools 服务。
 * @param {object|undefined} scope - 与宿主 `sdkSection` 同参（`context.scope`）。
 * @param {{sdkSchemas?: boolean}} caps - 探测结果。
 * @returns {{schemas: object[]|undefined, via: 'sdkSchemas'|'public'|'incomplete'|'none'}}
 */
export function readSdkSchemas(tools, scope, caps, toolSet) {
  if (caps?.definitions === true && typeof tools?.definitions === 'function' && toolSet !== undefined) {
    try {
      const definitions = tools.definitions(scope, toolSet)
      if (!Array.isArray(definitions)) return { schemas: undefined, via: 'incomplete' }
      const admitted = typeof toolSet.view === 'function' ? toolSet.view(scope) : undefined
      const schemas = []
      for (const definition of definitions) {
        if (admitted !== undefined && !admitted.has(definition?.name)) continue
        if (definition?.name === RUN_CODE) continue
        const output = definition?.output?.schema
        if (output === undefined) return { schemas: undefined, via: 'incomplete' }
        schemas.push({
          name: definition.name,
          description: definition.description,
          parameters: definition.parameters,
          output,
        })
      }
      return { schemas, via: 'definitions' }
    } catch {
      return { schemas: undefined, via: 'incomplete' }
    }
  }
  if (caps?.sdkSchemas === true && typeof tools?.sdkSchemas === 'function') {
    const fast = tools.sdkSchemas(scope)
    if (Array.isArray(fast)) {
      return { schemas: fast.filter((entry) => entry?.name !== RUN_CODE), via: 'sdkSchemas' }
    }
  }
  if (typeof tools?.schemas !== 'function' || typeof tools?.get !== 'function') {
    return { schemas: undefined, via: 'none' }
  }
  const listed = tools.schemas(scope)
  if (!Array.isArray(listed)) return { schemas: undefined, via: 'none' }
  const schemas = []
  for (const entry of listed) {
    if (entry?.name === RUN_CODE) continue
    const definition = tools.get(entry.name, scope)
    const output = definition?.output?.schema
    if (output === undefined) return { schemas: undefined, via: 'incomplete' }
    schemas.push({ ...entry, output })
  }
  return { schemas, via: 'public' }
}

/**
 * 裁剪判定。**纯函数**：同样输入同样输出，不发任何请求、不做缓存。
 *
 * 唯一正确的顺序（顺序本身就是正确性的一部分）：
 * 1. 没有 schema → 放弃（`no-schemas`）；
 * 2. `render(全集, programFormat?)` → 与宿主原文逐字节比，不等 → `premise-mismatch`；
 * 3. 过滤掉 `drop` 里的名字；一个都没少 → `no-drop`（不做无谓替换）；
 * 4. 重渲染子集 → 成功。
 *
 * `programFormat` **有值才传**（G3）：0.2.1 起 TS 渲染器多这个参数，宿主 `sdkSection` 传的是
 * `runtime.programFormat`；不转发就会在自检这一步失败、静默退化成不裁。0.2.0 的渲染器只接
 * 一个参数，多传一个实参会被忽略——两侧默认值相同，所以"有值才传"在两种版本上都对。
 *
 * @param {{hostText: string, schemas: object[]|undefined, drop: Set<string>, render: Function, programFormat?: string}} options
 * @returns {{ok: true, text: string, dropped: number}
 *         | {ok: false, reason: 'no-schemas'|'premise-mismatch'|'no-drop'|'render-threw'}}
 */
export function trimSdkText({ hostText, schemas, drop, render, programFormat }) {
  if (!Array.isArray(schemas) || schemas.length === 0) return { ok: false, reason: 'no-schemas' }
  const renderWith = (list) => (programFormat === undefined ? render(list) : render(list, programFormat))
  let full
  try { full = renderWith(schemas) } catch { return { ok: false, reason: 'render-threw' } }
  if (typeof full !== 'string' || full !== hostText) return { ok: false, reason: 'premise-mismatch' }
  const kept = schemas.filter((entry) => !drop.has(entry?.name))
  if (kept.length === schemas.length) return { ok: false, reason: 'no-drop' }
  let text
  try { text = renderWith(kept) } catch { return { ok: false, reason: 'render-threw' } }
  if (typeof text !== 'string') return { ok: false, reason: 'render-threw' }
  return { ok: true, text, dropped: schemas.length - kept.length }
}
