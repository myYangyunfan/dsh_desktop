// 宿主侧 skills 读取层：把 ctx.skills 的目录投影成面板要的形状。
//
// 为什么需要这一层：宿主 SkillRegistry 返回的是「已生效的胜出条目」，而面板要的是
// 「可分别操作的行」——合并各查询的胜出条目、带作用域归属、能被界面直接渲染。
// 投影逻辑集中在这里，宿主契约的细节就不会漏进 UI。
//
// 本层只读：不写盘、不做启停（那些在 lib/skills-file-ops.js）。

import { access, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
// 宿主 loader 的表达式求值器（peer 依赖，两代都导出）：复用同一套语义，不自己实现 !!js。
import { interpolate } from '@deepseek-ai/cordis-plugin-loader'
import { readSkillDocument, resolveSkillTarget, SkillNotFoundError } from './skills-file-ops.js'

// 宿主的 source 标签（见 dsh-skill-filesystem 的 roots()）：project-* 属项目级，
// 其余属全局级。这是唯一可靠的作用域依据——本机就没有 ~/.dsh/skills，技能全在
// ~/.agents/skills，所以不能靠路径猜作用域。
const PROJECT_SOURCES = new Set(['project-dsh', 'project-agents'])

/** 宿主目录捆绑的固定文件名（dsh-skill-filesystem 的 discoverRoot）。 */
const BUNDLE_FILE = 'SKILL.md'

function scopeOfSource(source) {
  return PROJECT_SOURCES.has(source) ? 'project' : 'global'
}

/**
 * 宿主六级 source 的 rank（与 provider 的 *_RANK 常量、docs/skills.md 的表一致）。
 * 数值小者优先——这是宿主裁决同名技能的依据，面板的「谁生效」与去重都用它。
 */
const SKILL_SOURCE_RANK = {
  'project-dsh': 100,
  'project-agents': 200,
  custom: 300,
  'user-dsh': 400,
  'user-agents': 500,
  bundled: 600,
}

/**
 * 统一分隔符后再比较：宿主给的是**本机原生**路径（Windows 上是反斜杠），而技能根也可能来自
 * 用户配置的 customSkillDirs（两种分隔符都写得出来）。join() 不够用——它是平台相关的，
 * 拿不到「另一种分隔符」的等价形式。只用于**比较与做键**，绝不用于喂给 fs。
 */
const toSlashes = (value) => String(value).replace(/\\/g, '/')

/**
 * 一个**目录**的物理身份（realpath，统一分隔符）。
 *
 * 目录不存在时退回字面值——这时它不可能与别的根重合（都不存在，谁也指不到谁），
 * 而 realpath 会抛 ENOENT：既不能让它把整个列表读失败，也不该为它编一个值。
 */
async function physicalDirectory(path) {
  return toSlashes(await realpath(path).catch(() => path))
}

/**
 * 从宿主 summary 推出技能的**根**、**形态**与**磁盘条目**。
 *
 * 为什么必须推而不是问：`ctx.skills` **不暴露 roots()**（实测公开面只有
 * registerProvider/register/list/snapshot/get/collect/...；roots() 在 filesystem provider 内部）。
 * 能用的线索只有 `resourceBase` 与 `path`。
 *
 * ⚠️ 核心不变量：**技能名（frontmatter 的 name）不参与定位**。
 * 宿主允许磁盘条目名与之不一致（实测 `dir-name/SKILL.md` 里写 `name: dir-alias` 照收），
 * 按名字推位置会让这类技能在面板里所有操作都失败（真机实测 6 种形态里 4 种不可操作）。
 *
 * 两个字段的**口径不同**（这是真机缺陷 issue #5 的根因，不要拿它们互相做路径比较）：
 *   `resourceBase.path` = `locator.directory`      —— **展示路径**（配置原样，配置写链接就是链接）
 *   `path`              = `fs.processPath(target)` —— **realpath**（fs-local 里就是 targetKey）
 *
 * 三个字段怎么定：
 *
 *   **形态**：`path` 的末段是 `SKILL.md` → 目录捆绑；以 `.md` 结尾 → 扁平候选。
 *   宿主对目录 entry 固定构造 `<目录>/SKILL.md`，所以那个文件名是铁证；扁平则是
 *   「名字以 `.md` 结尾」（`discoverRoot` 的 `entry.name.endsWith('.md')`），**与技能名无关**。
 *
 *   **根**：两种形态都取 `resourceBase.path`（捆绑形态下再上一级——那时 resourceBase 指的是
 *   技能目录本身）。这是宿主给的**展示路径**，也正是写盘要用的那个（对 realpath 改名/删除
 *   就是动用户同步库里的数据，不是动这个链接）。
 *
 *   **条目**：
 *     · 目录捆绑：`resourceBase.path` 的末段。宿主构造的是 `directory = <根>/<条目>`，
 *       所以末段**就是磁盘目录名**（junction 时是 junction 的展示名）。
 *     · 扁平：**在根下按 realpath 匹配 `path`** 得到的那一项（见 matchFlatEntry）。
 *       不能取 `path` 的末段：文件本身是链接时，`path` 是**目标文件**的 realpath，
 *       其末段与根下那个链接名可能不同，而我们要操作的是**链接**。
 *       匹配不到（根读不了、或那个文件根本不在根下）就**不填根**——宁可不填也不猜，
 *       猜错会让启停/删除作用在错误的目录上，那是本层最危险的失败模式。
 *
 * 返回的 root 一律用**展示路径**（`resolveTargetReference` 要求它与 skillTargetsView 算出的
 * 目标精确相等，返回 realpath 会让所有文件操作对不上）。
 *
 * @param {object} summary - 宿主 SkillSummary。
 * @returns {Promise<{ root?: string, kind?: 'bundle'|'flat', entry?: string }>}
 */
async function locateSkill(summary) {
  const base = summary?.resourceBase?.path
  const path = summary?.path
  if (typeof base !== 'string' || base === '' || typeof path !== 'string' || path === '') return {}

  // 文件名取自宿主给的 realpath，只看最后一段（分隔符两种都要吃）。
  const file = lastSegment(path)

  // 目录捆绑：宿主对**目录** entry 固定构造 `<目录>/SKILL.md`，所以这个文件名是形态的铁证。
  if (file === BUNDLE_FILE) {
    const directory = lastSegment(base)
    if (directory === '') return {}
    return { root: dirname(base), kind: 'bundle', entry: directory }
  }
  if (!file.endsWith('.md')) return {}

  // 扁平：以「根下的直接条目里，有哪个的真实路径就等于宿主报的 path」为准。
  const matched = await matchFlatEntry(base, path)
  if (matched !== undefined) return { root: base, kind: 'flat', entry: matched }
  // 扫不了或没命中：只有「宿主自己的构造规则直接成立」时才认——即 path 的目录部分
  // 字面等于 base（非链接、根也没被链接改写时就是这样）。两者不一致就**不填根**，
  // 因为那时我们无法证明这个文件就在这个根下（例如宿主永远不会产出的 `a/b/c.md`）。
  if (sameDirectory(dirname(path), base)) return { root: base, kind: 'flat', entry: file }
  return {}
}

/** 路径的最后一段（两种分隔符都吃）。`'/'` 结尾会得到空串，调用方据此判不可用。 */
function lastSegment(path) {
  return toSlashes(path).split('/').pop() ?? ''
}

/**
 * 在一个根下找出**真实路径等于宿主所报 `path`** 的那个扁平条目。
 *
 * 为什么需要这一步：扁平技能的文件本身是符号链接、且链接名与目标文件名不同时，
 * 宿主报的 `path` 是目标的 realpath，无法从它反推出根下那个**链接**的名字——
 * 而写盘必须作用在链接上（对 realpath 改名/删除就是动用户同步库里的数据）。
 * 所以这里扫一遍根（宿主发现只有一层，所以只看直接子条目），把名字**查**出来。
 *
 * 这是查证不是猜测：只有 realpath 精确相等才认，认不出就返回 undefined，
 * 由调用方按「证明不了它在这个根下」处理。
 *
 * @param {string} root - 展示路径的根。
 * @param {string} target - 宿主报的 realpath。
 * @returns {Promise<string|undefined>}
 */
async function matchFlatEntry(root, target) {
  const wanted = toSlashes(target)
  let entries
  try {
    entries = await readdir(root)
  } catch {
    // 根读不了（不存在/无权限）：交给调用方走字面兜底，不在这里编一个条目。
    return undefined
  }
  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.endsWith('.md')) continue
    const real = await realpath(join(root, entry)).catch(() => undefined)
    if (real !== undefined && toSlashes(real) === wanted) return entry
  }
  return undefined
}

/** 两个路径的**目录部分**是否字面相等（比较用，绝不喂给 fs）。 */
function sameDirectory(left, right) {
  return toSlashes(left) === toSlashes(right)
}

/**
 * 把一个 wire 上的**技能引用**解析成服务端认可的文件目标。
 *
 * wire 送的是 `{ source, root, projectPath, entry }`——**没有路径**。两道核对都在服务端：
 *   ① `root` 必须等于服务端自己算出来的某个根（resolveTargetReference）——
 *      「写入限定在技能根内」这条不变量因此不只由客户端保证；
 *   ② `entry` 必须是**单个路径段**（resolveSkillTarget 里校验）。
 *      条目名不要求是 kebab-case：宿主对磁盘条目名没有任何语法要求，收窄它会重新
 *      制造「合法的技能操作不了」那一类缺陷。
 *
 * ⚠️ `kind` 只是**提示**，不是判据：形态由 `resolveSkillTarget` **看磁盘**决定
 * （`<根>/<条目>/SKILL.md` 存在就是目录捆绑，否则那条路径本身）。wire 上的 `kind` 报错
 * 不会让操作作用到别的地方——拼哪条路径由磁盘事实说了算，越界由 `entry` + `root` 保证。
 *
 * 抽成一处：这段解析此前在 detail / setEnabled / setModelInvocable / removeSkill 里
 * 各写了一遍、四处独立演化——本轮「按技能名拼路径」的缺陷正是这样扩散出去的。
 *
 * ⚠️ 刻意做成模块级函数而**不是** gateway 的方法：这些 Remote 在用例里是用
 * `prototype.method.call({ ctx }, …)` 直接调的，挂在 `this` 上的助手在那里根本不存在
 * （真机实测报 `this.resolveSkillReference is not a function`）。依赖 `this` 的写法
 * 会让「能被单测」与「能被生产调用」变成两种形状。
 *
 * @param {object} ctx - 宿主上下文。
 * @param {object} payload - wire 载荷（含 source / root / projectPath / entry / kind）。
 * @returns {Promise<object>} resolveSkillTarget 的结果。
 */
export async function resolveSkillReference(ctx, payload) {
  const target = await resolveTargetReference(ctx, {
    source: payload?.source,
    root: payload?.root,
    projectPath: payload?.projectPath,
  })
  return await resolveSkillTarget({
    entry: String(payload?.entry ?? ''),
    kind: payload?.kind,
    root: target.root,
    scope: target.scope,
    writable: target.writable !== false,
  })
}

/** 取宿主 skills 服务；宿主的服务名就是 'skills'（dsh-skill 的 super(ctx, "skills")）。 */
function skillsService(ctx) {
  return typeof ctx?.get === 'function' ? ctx.get('skills') : undefined
}

/**
 * 借一个「Agent preset 作用域」，用于读取 preset 局部注册的技能。
 *
 * 为什么必须有这一层：宿主 `dsh-web-app` **有意**把基础行 `skill-filesystem` 置为
 * `disabled: true`，改由**每个 agent preset 各自挂一份**（`presets/standard.patch.yml` 等），
 * 于是文件系统 provider 注册进的是**该 preset 的作用域层**，而 `dsh-skill` 的注册表是按层合并的：
 * 读取时只合并「全局层 + 查看作用域链」。本插件的 RPC 跑在宿主层，直接 `skills.list({})`
 * 因此**只能看到 bundled 那一个**，用户装在 `~/.agents/skills` 的技能一个都看不到。
 *
 * 宿主的官方读法（`dsh-api-session-controller` 的 `sessionSkillCatalog`）正是：
 *   `const lease = await agentPresets.acquireScope(presetId); skills.list({ cwd, scope: lease.key })`
 * 它的文档明确写着 “Resolve a live or standing preset scope **without creating an Agent**”，
 * 所以这里不违反 SPEC 约束 14（面板的读取不得依赖存在活动会话）。
 *
 * 归还：租约是 `AsyncDisposable`，必须用完就释放（它内部有 users 计数，不释放会留住那一代）。
 * 拿不到服务（旧宿主、或没装 preset 注册表）时返回 undefined，调用方退回原来的全局读取。
 *
 * @param {object} ctx - 宿主上下文（或 { get } 替身）。
 * @returns {Promise<{ scope?: object, dispose: () => Promise<void> }>} scope 为 undefined 表示不可用。
 */
async function presetScope(ctx) {
  const presets = typeof ctx?.get === 'function' ? ctx.get('agentPresets') : undefined
  if (presets === undefined || typeof presets.acquireScope !== 'function') return { scope: undefined, dispose: async () => {} }
  let lease
  try {
    // 不传 id 时宿主用 defaultId（当前选中的默认 preset）——与「用户即将开的新会话看到什么」一致。
    lease = await presets.acquireScope()
  } catch {
    // preset 未注册/损坏：退回全局读取，不让技能面板整体失败。
    return { scope: undefined, dispose: async () => {} }
  }
  if (lease === undefined || lease.key === undefined) return { scope: undefined, dispose: async () => {} }
  return {
    scope: lease.key,
    dispose: async () => {
      try {
        await lease[Symbol.asyncDispose]?.()
      } catch {
        // 释放失败不该把一个已经成功的读取变成错误。
      }
    },
  }
}

/** 「这个技能读不到」：定位不到，或文件系统层面读不了（已被删、无权限、目录不可达）。 */
function isUnreadable(error) {
  if (error instanceof SkillNotFoundError) return true
  return typeof error?.code === 'string' && /^E[A-Z]+$/.test(error.code)
}

/**
 * 一行的调用权限——**一律来自技能文件本身**，不取宿主的发现缓存。
 *
 * 为什么不能用宿主 summary 里的那份：summary 是**发现缓存**（同一个文件被改写后它继续报旧值，
 * 真机实测复现过）。而调用权限正是本面板要**写**的东西：写盘后显示回退，用户看到的是
 * 「点了没反应」；更糟的是把缓存里的旧值当事实展示。
 * 行与详情因此都从这个文件的字节里解析——它们与用户看到的正文同源。
 *
 * 读不到就是 `null`（不知道）：宿主缓存可能指向一个已经被删/搬走的技能，此时「能不能被模型调用」
 * 没有答案，编一个布尔值就是让面板撒谎。
 *
 * @param {{ entry?: string, root?: string, kind?: 'bundle'|'flat', scope: 'global'|'project' }} row
 * @returns {Promise<{ modelInvocable: boolean|null, userInvocable: boolean|null }>}
 */
async function invocationOf(row) {
  const unknown = { modelInvocable: null, userInvocable: null }
  if (typeof row?.entry !== 'string' || typeof row?.root !== 'string' || row.root === '') return unknown
  try {
    const target = await resolveSkillTarget({
      entry: row.entry,
      kind: row.kind,
      root: row.root,
      scope: row.scope,
    })
    const { invocation } = await readSkillDocument(target)
    return {
      modelInvocable: invocation?.modelInvocable ?? null,
      userInvocable: invocation?.userInvocable ?? null,
    }
  } catch (error) {
    // 只吞「读不到」这一类；其余错误照原样抛——把 bug 说成「未知」等于把缺陷埋起来。
    if (isUnreadable(error)) return unknown
    throw error
  }
}

/**
 * 把宿主的一条 SkillSummary 投影成面板行。
 *
 * 「已停用」在本层**派生**，不另存：宿主没有 disabled 字段，而「两个调用面都关掉」
 * （`modelInvocable === false && userInvocable === false`）就是 VS Code / Copilot 官方文档里
 * 叫 “Disabled skills” 的那一档。行上的 enabled 因此是那两个值的函数——
 * **没有第三个状态要存，也就没有东西会与文件对不上**（旧版把状态存在文件名里，
 * 于是要自己扫盘、还要防两个数组同身份双行）。
 *
 * 调用权限**不读** summary.invocation：那一份来自宿主的发现缓存（见 invocationOf 的说明）。
 *
 * @param {object} summary - 宿主 SkillSummary。
 * @param {{ cwd?: string }} options - 该条目所属的查询作用域。
 * @returns {Promise<object>} 面板行。
 */
async function toView(summary, { cwd }) {
  const located = await locateSkill(summary)
  const scope = scopeOfSource(summary.source)
  const invocation = await invocationOf({ entry: located.entry, root: located.root, kind: located.kind, scope })
  const enabled = invocation.modelInvocable === false && invocation.userInvocable === false ? false
    : invocation.modelInvocable === null || invocation.userInvocable === null ? null
      : true
  return {
    name: summary.name,
    description: summary.description ?? '',
    ...(summary.whenToUse !== undefined ? { whenToUse: summary.whenToUse } : {}),
    ...invocation,
    // 派生态：三态（true / false / null=不知道）。null 不假装成「已停用」——
    // 文件读不出来时「两个面是否都关了」没有答案。
    enabled,
    source: summary.source ?? 'unknown',
    provider: summary.provider ?? 'unknown',
    scope,
    // 根/形态/条目推不出来就不填（上层据此提示「无法定位」，而不是作用在错的目录上）。
    ...(located.root !== undefined ? { root: located.root, kind: located.kind, entry: located.entry } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(summary.path !== undefined ? { path: summary.path } : {}),
    // bundled 根只读（SPEC 约束 3）：启停与删除都必须被拒。
    writable: summary.source !== 'bundled',
  }
}

/**
 * 查询一个作用域下宿主按名裁决后的技能胜出项（不是全部物理副本）。
 * @param {object} skills - 宿主 ctx.skills（或等价替身）。
 * @param {{ cwd?: string, scope?: object, signal?: AbortSignal }} options
 * @returns {Promise<object[]>}
 */
async function queryScope(skills, options) {
  // 不传 cwd 时宿主只扫用户级/自定义/bundled 根（provider 的 roots(cwd) 在
  // cwd === undefined 时不 push 项目根），这正是「全局」作用域要的。
  // `scope` 决定合并哪些**层**：preset 挂的 provider 只在该 preset 的层里，
  // 不传就只看得到宿主层的 bundled（见 presetScope 的说明）。
  const { cwd, scope, signal } = options
  const request = {
    ...(cwd === undefined ? {} : { cwd }),
    ...(scope === undefined ? {} : { scope }),
    ...(signal === undefined ? {} : { signal }),
  }
  const summaries = await skills.list(request)
  return await Promise.all(summaries.map((summary) => toView(summary, { cwd })))
}

/**
 * 列出全部作用域的技能行。
 *
 * 为什么要「先全局、再逐项目，且项目查询只取项目级条目」：宿主在传 cwd 时返回的是
 * 「项目根 + 用户根 + bundled」的**完整合并视图**（provider 的 roots(cwd) 把项目根 push
 * 进 cwd 分支，而用户根与 bundled 根的 push 在该分支之外无条件执行）。所以项目查询的
 * 结果已经包含全局技能，直接 concat 会让每个全局技能在每个项目里各重复一份。
 *
 * ⚠️ 但「按 source 过滤」只挡住了**同一根被两种查询各报一次**这一种重复。还有第二种：
 * 两个根算出来是**同一个物理目录**。真机形状（issue #5，2026-10-11 复现）：`DSH_HOME=D:\DSH\.dsh`
 * 而工作区 `D:\DSH` 本身是 git 根，于是 project-dsh 根 = `<DSH_HOME>/skills` = user-dsh 根；
 * 实测同一个文件被列成 N+1 行（全局 1 份 + 每个工作区 1 份），名字相同 → 面板互判「被遮蔽」，
 * 安装下拉里同一个目录也以两个身份各出现一次。
 *
 * 所以去重判据必须是**物理位置**，不是字符串也不只是 source：同一个文件只留一行，
 * 留 rank 更前的那份。不同查询已经返回的同名物理文件分别保留；同一次查询中被宿主裁掉的
 * 低优先级副本不会出现在这里。调用权限不参与同名裁决，skillTargetsView 也只描述可安装位置，
 * 不能拿它补成「已发现技能」或推断落选副本已经生效。
 *
 * @param {object} ctx - 宿主上下文（或 { get } 替身）。
 * @param {{ workspaces?: string[], signal?: AbortSignal }} options
 * @returns {Promise<object[]>}
 */
async function listSkillViews(ctx, options = {}) {
  const skills = skillsService(ctx)
  // 宿主可能没挂 dsh-skill（该内置插件可被用户禁用）。降级为空列表——抛错会让
  // 整个面板打不开，而空列表只影响技能这一块。
  if (!skills) return []

  const { workspaces = [], signal } = options
  // 借默认 preset 的作用域：用户技能由 preset 挂的 provider 提供，宿主层看不到（见 presetScope）。
  const lease = await presetScope(ctx)
  try {
    const globalRows = await queryScope(skills, { scope: lease.scope, signal })
    const projectGroups = await Promise.all(workspaces.map(async (cwd) => {
      const rows = await queryScope(skills, { cwd, scope: lease.scope, signal })
      // 只保留该项目真正新增的条目：按 source 归属判定，而不是按名称做差集——
      // 同名跨作用域是合法配置（DSH 按 rank 裁决谁生效），按名称差集会把项目里
      // 那份同名技能误当成重复而丢掉。
      return rows.filter((row) => row.scope === 'project')
    }))
    return dedupeByPhysicalLocation([...globalRows, ...projectGroups.flat()])
  } finally {
    await lease.dispose()
  }
}

/**
 * 同一个**物理文件**只留一行（rank 更前者胜）。
 *
 * 身份用行上的 `path`——那正是宿主给的 realpath（`fs.processPath`），所以链接与真实目录
 * 会归一到同一个键。拿不到 path 的行（旧宿主/替身）退回它的字面身份：宁可少去重一次，
 * 也不能把两行不同的技能误判成同一个。
 *
 * 为什么保留 rank 更前者：那一份才是宿主的胜出条目，也就是模型真正收到的那份；面板的
 * 「谁生效」与文件操作都该指向它。落选的那一行是**同一个文件**（不是副本），留着只会让
 * 用户看到两个都写着"已启用"、还互相说被遮蔽的行。
 *
 * @param {object[]} rows
 * @returns {object[]} 去重后的行，保持输入顺序（全局在前、项目在后）。
 */
function dedupeByPhysicalLocation(rows) {
  const winnerAt = new Map()
  const result = []
  for (const row of rows) {
    const key = physicalKeyOf(row)
    const seen = winnerAt.get(key)
    if (seen === undefined) {
      winnerAt.set(key, result.length)
      result.push(row)
      continue
    }
    // 同一物理文件：rank 更前（数值更小）的胜出，替换掉先前那份但**留在原位**。
    if (rankOfSource(row.source) < rankOfSource(result[seen].source)) result[seen] = row
  }
  return result
}

/**
 * 一行的**物理身份**：技能文件的真实路径（宿主给的 `path` 已经是 realpath）**+ 技能名**。
 *
 * 为什么必须带上名字：去重的意图是「同一个物理技能被两个根各报了一次」。而技能名来自
 * 文件自己的 frontmatter——同一个文件只可能有一条技能，所以「同路径 + 同名」才是同一个技能。
 * 只看路径会把「同路径但不同名」的两行也压掉，而那两行要么是替身数据不严谨，要么是
 * 宿主行为出了别的问题；无论哪种，静默吞掉一行都比留着它更难查。
 *
 * 拿不到 path 时退回**行的完整身份**（source + cwd + name，与 skillRowKey 同一套）：
 * 那种情况下物理位置无从得知，而「不同项目里的同名技能」必须各占一行（它们真的是两份）。
 */
function physicalKeyOf(row) {
  if (typeof row?.path === 'string' && row.path !== '') {
    return `path\u0000${toSlashes(row.path)}\u0000${row?.name ?? ''}`
  }
  return `row\u0000${row?.source ?? ''}\u0000${row?.cwd ?? ''}\u0000${row?.name ?? ''}`
}

/** source → 宿主 rank（数值小者优先）；表外的来源排在最后。 */
function rankOfSource(source) {
  return SKILL_SOURCE_RANK[source] ?? Number.MAX_SAFE_INTEGER
}

/**
 * 加载单个技能正文的旧路径：**已被 detail 的按条目读取取代**（2026-10-10）。
 *
 * 为什么删掉而不是留着：`ctx.skills.get(name)` 按 rank 返回**生效者**，与面板
 * 「(根, 条目) 精确操作」的模型（D8）冲突——点被遮蔽的那行会读到生效者的正文。
 * 现在的 detail 走 `resolveTargetReference` + `resolveSkillTarget` + `readSkillDocument`，
 * 既精确到根与条目，又能顺带从同一份字节里给出调用权限。
 */

// ── 安装目标（skillTargets）───────────────────────────────────────────────
//
// 为什么需要这一层：面板的「安装到」原来只能列**已经存在、并且已经有技能**的位置——
// 候选来自实际发现（约束 12）。于是两种真实需求无处可选：
//   · 想装到 `~/.dsh/skills`（DSH 原生位置，本机还没建）；
//   · 想给一个还没建技能目录的项目装一份。
// 用户问的正是这个（「用户没有选择的权力？」）。
//
// 为什么不能写死路径：`~` 随 DSH_HOME 走、项目根要往上找到 `.git`、custom 目录来自用户配置。
// 这些规则的**真值**在 `@deepseek-ai/dsh-skill-filesystem` 的 `roots(cwd)` 里（随宿主发布）。
// 本函数照抄那份规则，并直接从 loader 树里读**它真正在用的 config**，而不是自己另猜一份：
//   1) `providerConfig(ctx)` 按包名找到那个 provider 条目，取它的 `config`；
//   2) `resolveDshHome` 三行照抄 `@deepseek-ai/dsh-home-paths`（本仓库解析不到那个包，
//      否则就该直接 import——真值来自它的 lib/index.js）；
//   3) `findProjectRoot` 照抄 provider 的实现：往上找含 `.git` 的目录，找不到就用原路径。
// ⚠️ provider 改算法时这里要一起改；语义由 test/skill-targets.test.mjs 钉住。

const DSH_HOME_ENV = 'DSH_HOME'
const AGENTS_HOME_ENV = 'DSH_AGENTS_HOME'
const BUNDLED_SKILL_DIR_ENV = 'DSH_BUNDLED_SKILL_DIR'
const PROVIDER_PACKAGE = '@deepseek-ai/dsh-skill-filesystem'
const DSH_HOME_DIR_NAME = '.dsh'

/** 展开 `~` / `~/x` / `~\x`（与 dsh-home-paths 的 expandHomePath 同语义）。 */
function expandHomePath(path, home) {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/** 与 dsh-home-paths 的 resolveDshHome(configured, env) 同语义：配置 > DSH_HOME > ~/.dsh。 */
function resolveDshHome(configured, env = process.env) {
  const home = homedir()
  const fromEnv = env?.[DSH_HOME_ENV]
  const base = configured ?? (typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv : join(home, DSH_HOME_DIR_NAME))
  return resolve(expandHomePath(String(base), home))
}

/**
 * 与 provider 的 findProjectRoot 同语义：往上找含 `.git` 的目录，找不到就用原路径。
 *
 * ⚠️ 判据必须是**存在**（`access`），不是 `isDirectory`：git worktree 与 submodule 里
 * `.git` 是个**文件**。用 isDirectory 会继续往上走到外层仓库，于是「装到项目」会写进
 * 另一个工作树、而列表里永远不出现（本仓库自己就是这种形态）。
 */
async function findProjectRoot(cwd) {
  const start = resolve(String(cwd))
  let current = start
  for (;;) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return start
    current = parent
  }
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** 从 loader 树里取 filesystem provider 的生效 config；找不到就只剩环境变量与默认值。 */
function providerConfig(ctx) {
  const entries = ctx?.loader?.entries?.()
  // 正式 loader 返回 Generator；Array 替身也走同一个 Iterable 契约。
  if (typeof entries?.[Symbol.iterator] !== 'function') return {}
  for (const entry of entries) {
    if (entry?.disabled === true || entry?.options?.disabled === true) continue
    const name = entry?.options?.name
    if (typeof name !== 'string' || !name.includes(PROVIDER_PACKAGE)) continue
    // options.config 保留 `!!js` 原值；provider 实际收到的是**求值后**的配置。
    // 0.2.2 的 loader 把求值放在 `internal/config` 事件里，`fiber.config` 不保证已经是求值结果，
    // 于是面板会拿 `{ __jsExpr: ... }` 当路径拼成 `[object Object]`。这里用宿主自己的
    // interpolate（同一个包、同一套语义，不自己实现表达式）把残余表达式求值一次。
    const raw = entry.fiber?.config ?? entry.options.config ?? {}
    const scope = entry.fiber?.ctx ?? entry.ctx ?? ctx
    try {
      const evaluated = interpolate(scope, raw)
      return evaluated !== null && typeof evaluated === 'object' ? evaluated : {}
    } catch {
      // 表达式依赖的符号在读取侧不可见时保持原值（不猜、不崩）；调用方按"读不到生效配置"展示。
      return raw
    }
  }
  return {}
}

/**
 * 宿主支持的**全部**技能落盘位置，不管那里现在有没有技能。
 *
 * 「可以写到哪里」（决定安装能选什么）。它是**能力**而不是观察——
 * 混用会导致「没装过东西的位置就选不到」。候选项的**展示顺序**由面板决定，这里只给真值。
 *
 * @param {object} ctx - 宿主上下文（或 { loader } 替身）。
 * @param {{ workspaces?: string[] }} [options] - 要一并列出项目位置的工作区。
 * @returns {Promise<{ targets: object[] }>} 按 rank 排序；`exists` 为 false 表示尚未创建。
 */
async function skillTargetsView(ctx, options = {}) {
  const config = providerConfig(ctx)
  const includeDefaults = config.includeDefaultRoots !== false
  const dshHome = resolveDshHome(config.dshHome)
  const agentsHome = resolve(String(
    config.agentsHome
    ?? (typeof process.env?.[AGENTS_HOME_ENV] === 'string' && process.env[AGENTS_HOME_ENV] !== '' ? process.env[AGENTS_HOME_ENV] : join(homedir(), '.agents')),
  ))
  const customDirs = (Array.isArray(config.customSkillDirs) ? config.customSkillDirs : []).map((dir) => resolve(String(dir)))
  const bundledDir = config.bundledSkillDir ?? (includeDefaults ? process.env?.[BUNDLED_SKILL_DIR_ENV] : undefined)

  const targets = []
  const seen = new Set()
  const push = async (source, root, extra = {}) => {
    const key = `${source}\u0000${root}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push({
      source,
      root,
      rank: SKILL_SOURCE_RANK[source],
      scope: scopeOfSource(source),
      // bundled 是宿主随包发布的只读根：能看见，但不能往里装（装了会被升级覆盖）。
      writable: source !== 'bundled',
      exists: await isDirectory(root),
      ...extra,
    })
  }

  const workspaces = Array.isArray(options.workspaces) ? options.workspaces.map(String).filter((path) => path !== '') : []
  if (includeDefaults) {
    for (const workspace of workspaces) {
      const projectRoot = await findProjectRoot(workspace)
      // projectPath 保留原始工作区路径（可能比 projectRoot 深），面板按它显示项目名。
      await push('project-dsh', join(projectRoot, '.dsh', 'skills'), { projectPath: workspace, projectRoot })
      await push('project-agents', join(projectRoot, '.agents', 'skills'), { projectPath: workspace, projectRoot })
    }
  }
  for (const dir of customDirs) await push('custom', dir)
  if (includeDefaults) {
    await push('user-dsh', join(dshHome, 'skills'))
    await push('user-agents', join(agentsHome, 'skills'))
  }
  if (typeof bundledDir === 'string' && bundledDir !== '') await push('bundled', resolve(bundledDir))

  // 同一个**物理目录**只列一次：DSH_HOME 与工作区重合时，project-dsh 与 user-dsh 算出来是
  // 同一个目录（真机形状见 listSkillViews）。留着会让安装下拉里同一个位置出现两次，
  // 用户以为有两个可选的落点。
  //
  // ⚠️ 在**排序之前**去重，并且留 rank 更前的那份：rank 决定宿主优先采纳哪个根，
  // 而 `targets[0]` 正是安装弹窗的默认选项（见客户端的 installTargets）——留错那份会让
  // 默认落点指向一个"名字对了、身份不对"的位置。
  const unique = await dedupeTargetsByPhysicalLocation(targets)
  unique.sort((left, right) => left.rank - right.rank || left.root.localeCompare(right.root))
  return { targets: unique }
}

/**
 * 同一个物理目录的目标只留一个（rank 更前者胜）。
 *
 * 为什么单独一步而不是并进 push：`exists` 是**观察**（要问磁盘），去重是**身份**判断，
 * 混在一处会让「先问盘再决定收不收」这种顺序依赖悄悄长出来。
 */
async function dedupeTargetsByPhysicalLocation(targets) {
  const seenPhysical = new Map()
  const result = []
  for (const target of targets) {
    const physical = await physicalDirectory(target.root)
    const previous = seenPhysical.get(physical)
    if (previous === undefined) {
      seenPhysical.set(physical, result.length)
      result.push(target)
      continue
    }
    // 同一物理目录：rank 更前（数值更小）的胜出，就地替换先前那份（索引不变，
    // 顺序由后面的排序定）。
    if (target.rank < result[previous].rank) result[previous] = target
  }
  return result
}

/**
 * 把 wire 上的**目标引用**解析成服务端自己认可的目标。
 *
 * 为什么必须有这一步：`root` / `writable` 曾经直接取自 RPC 载荷，于是
 * 「写入限定在技能根内」与「bundled 只读」这两条不变量**只由客户端保证**——
 * 一个 `removeSkill {name:'<任意 kebab-case 名>', root:'<任意目录>'}` 就能递归删掉
 * `<任意目录>/<名>`（例如整个仓库），`importSkill {root:'<bundled 路径>', writable:true}`
 * 也能绕过只读根。所以现在 wire 只送一个**引用**（source + root + 可选的 projectPath），
 * 服务端拿**自己算出来的**目标集合去核对，对不上就拒；`writable` 一律以服务端那份为准，
 * 载荷里的值不再读。
 *
 * 注意这里刻意不接受「裸 root」：调用方无法凭空指定一个位置，只能引用宿主报告过的位置。
 *
 * @param {object} ctx - 宿主上下文（或 loader 替身）。
 * @param {{ source?: string, root?: string, projectPath?: string }} reference
 * @returns {Promise<object>} 服务端算出的目标（含 writable / scope / rank）。
 */
async function resolveTargetReference(ctx, reference) {
  const source = String(reference?.source ?? '')
  const root = String(reference?.root ?? '')
  const projectPath = String(reference?.projectPath ?? '')
  if (source === '' || root === '') {
    throw new Error('缺少技能目标引用（source + root）：不接受调用方直接指定路径')
  }
  const { targets } = await skillTargetsView(ctx, {
    workspaces: projectPath === '' ? [] : [projectPath],
  })
  const match = targets.find((target) => target.source === source
    && target.root === root
    // projectPath 只作为**附加**约束：给了就必须也对上（安装目标带它，行操作不带）。
    && (projectPath === '' || String(target.projectPath ?? '') === projectPath))
  if (match === undefined) {
    throw new Error(`未知的技能目标：${source} / ${root}（只能操作宿主报告过的位置）`)
  }
  return match
}

/**
 * 一行技能的**唯一身份**：`source \0 cwd \0 name`。
 *
 * ⚠️ 必须与客户端 `lib/client.js` 的 `skillIdentity` 是**同一个元组**：客户端拿它当行 key，
 * 服务端拿它保证同一个身份最多出现一行（当前只剩两条产出路径：宿主目录，以及旧机制残留的
 * 迁移读取——后者会跳过已出现过的身份）。两边各有一条用例把**同一个字面量**钉死
 * （test/skills-host.test.mjs 与 test/client-behavior.test.mjs），只改一边就会红
 * ——重复 key 的后果是静默的（生产版 React 不报警告，只是重复渲染）。
 */
const skillRowKey = (row) => `${row?.source || 'unknown'}\u0000${row?.cwd || ''}\u0000${row?.name || ''}`

export { invocationOf, listSkillViews, queryScope, resolveTargetReference, skillRowKey, skillTargetsView }
