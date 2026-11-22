// 宿主侧 skills 文件动作：启停、删除、导入、旧机制残留的迁移读取。
//
// 这一层真的动用户的文件，纪律比其它层严：
//   - 按 (根, 磁盘条目) 精确定位；找不到就报错，**绝不回退**到别的作用域
//     （否则同名技能会被误删/误停用）。
//   - bundled 根只读，拒绝写入。
//   - 启停写的是 frontmatter 的**两个调用面字段**（宿主原生），不搬文件——见 setSkillEnabled。
//
// ⚠️ 定位**不按技能名**（那是身份，不是位置）：宿主允许磁盘条目名与 frontmatter 的 name
// 不一致，按名字拼路径会让那类技能在面板里所有操作都失败。见 resolveSkillTarget。

import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { MAX_ARCHIVE_BYTES, MAX_FILE_BYTES, extractArchive } from './skills-archive.js'
import { INVOCATION_FIELDS, diagnoseSkill, setFrontmatterBoolean } from './skills-frontmatter.js'

// 与宿主同一套名字语法（dsh-skill 的 SKILL_NAME）。**导入**时用它校验 frontmatter 的 name
// （那是技能身份，宿主只接受这个语法）；条目定位**不用**它——磁盘条目名不归宿主管，见 isSafeEntry。
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const BUNDLE_FILE = 'SKILL.md'
const DISABLED_SUFFIX = '.disabled'

/**
 * 「此作用域下没有这个技能」的专用错误。
 *
 * 单独一个类型是为了让调用方能安全地按 code 判定「不存在」——否则只能靠 catch 全部错误，
 * 那会把真正的失败（权限、IO）也当成「不存在」，进而做出错误决策。
 */
export class SkillNotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SkillNotFoundError'
    this.code = 'SKILL_NOT_FOUND'
  }
}

/** 路径是否存在（不抛错）。 */
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false
    throw error
  }
}

/**
 * 定位一条技能 —— 按**宿主报告过的真实位置**，绝不按技能名拼路径。
 *
 * ⚠️ 这一层的核心不变量（本文件与 skills-registry 共用）：
 *
 *   身份（frontmatter 的 `name`）只用于显示与 wire 上的指认；**定位一律以磁盘条目为准**。
 *
 * 为什么：宿主**允许**磁盘条目名与 frontmatter 的 `name` 不一致（实测：`dir-name/SKILL.md`
 * 里写 `name: dir-alias` 照收，宿主按 frontmatter 取名）。曾经按名字拼
 * `join(root, name, 'SKILL.md')` / `join(root, `${name}.md`)`，于是这类技能在面板里
 * **所有操作都失败**（真机实测 6 种形态里 4 种完全不可操作，而宿主侧一切正常）。
 *
 * 所以入参是**条目**（该根下的直接子条目名，由宿主字段匹配得出，见 skills-registry 的
 * locateSkill）而不是技能名。宿主发现只有一层（skill-filesystem 的 discoverRoot 只 readdir
 * 一次），所以「根下的直接子条目」就是全部可能的位置，`<根>/<条目>[/SKILL.md]` 也因此在
 * 结构上不可能跳出根——越界校验仍然保留，因为这是系统边界。
 *
 * ⚠️ 写盘一律用**展示路径**（`<根>/<条目>`），**绝不用 realpath**：技能的实体常常在用户的
 * 同步库里（技能目录是 junction），对 realpath 改名/删除就是**动用户的数据**而不是动这个链接。
 *
 * @param {{ entry: string, kind: 'bundle'|'flat', scope: 'global'|'project', root: string, writable?: boolean }} input
 * @returns {Promise<object>} 带确定 kind 与 path 的目标。
 */
export async function resolveSkillTarget(input) {
  const { entry, kind, scope, root, writable = true } = input
  if (typeof entry !== 'string' || !isSafeEntry(entry)) {
    throw new Error(`非法技能条目：${JSON.stringify(entry)}（只接受单个路径段）`)
  }
  if (typeof root !== 'string' || root === '') {
    throw new Error('非法技能根目录')
  }

  // ⚠️ **形态由磁盘决定**，不信任调用方声明（也不信任 wire 上的 `kind`）。
  //
  // 祖先实现就是这么做的（那时它按技能名探 `<根>/<名>/SKILL.md` 与 `<根>/<名>.md`），
  // 中途改成「信 wire 的 kind」是一次退步：声明与磁盘不符时，算出的路径就指向别的东西
  // （例如 `kind: flat` + 一个**目录**条目 → 路径落在那个目录上）。现在把探测推广到**条目**：
  //
  //   ① `<根>/<条目>/SKILL.md`           → 目录捆绑（宿主对目录 entry 的固定构造）
  //   ② `<根>/<条目>`（且它是**文件**）    → 扁平（条目自带 `.md`）
  //   ③ ①②的 `.disabled` 变体            → 旧机制残留（一次性迁移读取）
  //
  // 探测顺序与宿主一致（`discoverRoot` 是**目录分支优先**，见 skill-filesystem/src/index.ts:735-739），
  // 所以「同名既有 `x.md` 文件又有 `x.md/` 目录」这种歧义（POSIX 上可能）会与宿主解析成同一个。
  //
  // 这条也修掉了「条目名以 .md 结尾的**目录**」被误拒的缺陷：那种技能宿主完全合法
  // （目录分支优先），而误拒会让整个 `list()` 抛错、面板技能页整块打不开。
  const bundlePath = join(root, entry, BUNDLE_FILE)
  const flatPath = join(root, entry)
  const base = { name: entry, entry, scope, root, writable, bundlePath, flatPath }

  if (await isFile(bundlePath)) return { ...base, kind: 'bundle', path: bundlePath }
  if (await isFile(flatPath)) return { ...base, kind: 'flat', path: flatPath }
  if (await isFile(`${bundlePath}${DISABLED_SUFFIX}`)) {
    return { ...base, kind: 'bundle', path: `${bundlePath}${DISABLED_SUFFIX}`, migratedDisabled: true }
  }
  if (await isFile(`${flatPath}${DISABLED_SUFFIX}`)) {
    return { ...base, kind: 'flat', path: `${flatPath}${DISABLED_SUFFIX}`, migratedDisabled: true }
  }
  // 报错时带上调用方的说法（`kind`）：它现在是**提示**而不是判据，但写进消息有助于定位
  // 「面板以为它是扁平、磁盘上却是个目录」这类不一致。
  throw new SkillNotFoundError(
    `找不到技能条目 ${entry}（作用域 ${scope}，根 ${root}${kind === undefined ? '' : `，面板当作 ${kind}`}）`,
  )
}

/**
 * 这个路径是不是一个**普通文件**（跟随链接）。
 *
 * 必须问「是不是文件」而不是「存不存在」：扁平的探测路径 `<根>/<条目>` 在条目是个**目录**时
 * 也存在（那是目录捆绑的目录本身），只判存在会让 `kind` 退化成一个指向目录的"技能文件"。
 */
async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * 一个**磁盘条目名**是否安全：单个路径段，且不是 `.` / `..`。
 *
 * 判据比技能名宽（技能名是 kebab-case），因为**磁盘条目名不归宿主管**：宿主只要求目录条目
 * 有 `SKILL.md`、文件条目以 `.md` 结尾，目录名本身可以是任何东西。收窄到技能名语法就会
 * 重新制造「合法的技能操作不了」这一类缺陷；放宽到允许多段则会跳出根。
 *
 * ⚠️ 刻意**不**额外拦 `:`（Windows 上它是 NTFS 备用数据流的语法）。
 * 理由是判据不能比宿主更严：POSIX 上 `foo:bar.md` 是**完全合法**的文件名，宿主也照收
 * （它只要求 `.md` 结尾）——拦掉它就会重新造出「宿主认可、面板操作不了」那类缺陷，
 * 也就是本轮 C1 的同一个坑。
 * 而放行它的实际影响很小：`entry` 仍是一个路径段、仍被限定在宿主报告过的根内，
 * 所以「删掉某个文件的备用数据流」并没有越过本层已有的权限边界（本层本来就能删这个根里的技能）。
 * 记在这里是为了让下一个人知道这是**权衡后的决定**，不是漏看。
 */
function isSafeEntry(entry) {
  return entry !== '' && entry !== '.' && entry !== '..'
    && !entry.includes('/') && !entry.includes('\\')
    && !entry.includes('\0')
}

/**
 * 启用 / 停用一条技能 —— 写宿主**原生的两个调用面字段**，不搬文件。
 *
 * 语义（与 VS Code / Copilot 官方文档里叫 “Disabled skills” 的那一档逐字同构）：
 *
 *   停用 = `disable-model-invocation: true` **且** `user-invocable: false`
 *   启用 = 两个字段都回到缺省（= 模型可调用 + 用户可调用）
 *
 * 为什么不再用「改名成 SKILL.md.disabled」这个旧机制（本插件 1.6.x 的自创做法）：
 *
 *   1. 那个形态**不是任何规范认可的东西**。用户的技能常在 `~/.agents/skills`——Agent Skills
 *      开放标准的共享位置，VS Code / Copilot、Claude Code、Codex 都扫它。我们把 `SKILL.md`
 *      改名，等于为了本面板的一个开关，把用户的技能在**别的工具里**弄坏（VS Code 会因此
 *      把它报成 Missing files）。这不是我们有权替用户做的取舍。
 *   2. 状态只存在于文件名里 → 面板必须自己扫盘才能看见被停用的技能 → **第二真值来源**，
 *      于是有了「宿主缓存与现场扫盘同身份双行」「链接目录的 Dirent 判错」这些缺陷。
 *      改用原生字段后，被停用的技能**照样出现在宿主目录里**（list 是调用无关的），
 *      面板不需要扫盘，那类缺陷在结构上消失。
 *
 * ⚠️ 代价，必须如实知道：**「启用」会把两个调用面都恢复成可调用**。若用户原本手工设了
 * `disable-model-invocation: true`（只想要「仅用户可调用」那一档），点一次「停用」再「启用」
 * 会把那档一起重置。所以面板把两个面**各自**做成一个可写开关（见 `setSkillInvocationFace`）
 * ——重置了也能在面板上拨回来，不必去编辑文件。这也正是本函数保留的意义：
 * 它是「两个面一起拨」的**快捷动作**，而不是唯一的操作方式。
 *
 * ⚠️ **旧机制残留（`migratedDisabled`）走另一条路**：那种技能的「停用」状态在**文件名**里
 * （`SKILL.md.disabled`），不在 frontmatter 里——写字段对它毫无意义（宿主看不见那个文件）。
 * 所以这个方向必须是 rename：把它改回 `SKILL.md`，宿主才会重新发现它。
 * 「停用」方向不需要特例：残留被恢复之后就是普通技能，走上面的字段路径。
 *
 * @param {object} target - resolveSkillTarget 的结果。
 * @param {boolean} enabled - true 启用、false 停用。
 */
export async function setSkillEnabled(target, enabled) {
  if (target.writable === false) {
    throw new Error('该技能来自只读根（bundled），不可启停')
  }
  const on = enabled !== false
  // 锁键用 `<根>/<条目>`：与导入/删除/改写权限**同一把**（见 lockKeyOf 的说明）。
  return await withFileLock(lockKeyOf(target), async () => {
    // 旧机制残留：恢复 = 把文件名改回去。**必须真 rename**，否则面板会说「已启用」而宿主
    // 依然看不见它——用户点了没反应，还收到一条成功提示（这正是本层最贵的那类失败）。
    if (target.migratedDisabled === true) {
      if (!on) return { changed: false, enabled: false } // 它本来就处于停用态
      const enabledPath = target.path.slice(0, -DISABLED_SUFFIX.length)
      if (await exists(enabledPath)) {
        // 目标名已被占用（用户手工建过、或两次恢复并发）：不覆盖，如实报冲突。
        throw new Error(`无法恢复：${enabledPath} 已存在（请先处理那份文件，不会自动覆盖）`)
      }
      await rename(target.path, enabledPath)
      return { changed: true, enabled: true, migrated: true }
    }
    const text = await readFile(target.path, 'utf8')
    // 两个字段一次写完再落盘：中途失败会留下「模型不可调用但用户可调用」这种没人要求过的中间态。
    const next = setInvocation(text, { modelInvocable: on, userInvocable: on })
    if (next.changed) await writeTextKeepingMode(target.path, next.text)
    return { changed: next.changed, enabled: on }
  })
}

/**
 * 把两个调用面字段一次写成目标值，其余字节原样保留。
 *
 * 顺序固定为「先 user-invocable 再 disable-model-invocation」没有语义理由，只是为了确定性；
 * 真正要紧的是**两个字段的名字与缺省方向**都从 INVOCATION_FIELDS 取（那处唯一声明）。
 *
 * @param {string} text - 技能文件全文。
 * @param {{ modelInvocable: boolean, userInvocable: boolean }} invocation - 目标语义值。
 * @returns {{ text: string, changed: boolean }}
 */
function setInvocation(text, invocation) {
  let current = text
  let changed = false
  for (const [field, spec] of Object.entries(INVOCATION_FIELDS)) {
    const semantic = invocation[field] !== false
    // ⚠️ 两层映射都要做对，任何一层反了都会静默写出**语义相反**的文件：
    //   ① 策略值 → 字段值：`disable-model-invocation` 说的是「禁止」，所以它是 modelInvocable 的**反**
    //      （`inverted`）；`user-invocable` 与 userInvocable 同向。
    //   ② 字段值 + 该字段自己的缺省（`absentMeans`）→ 写还是删（由 setFrontmatterBoolean 决定）。
    // 曾经漏掉 ①，于是「停用」只写了 user-invocable，而「启用」反而写出
    // `disable-model-invocation: true`（把模型面关掉了）——两个方向都反，且都报成功。
    const fieldValue = spec.inverted ? !semantic : semantic
    const written = setFrontmatterBoolean(current, spec.key, fieldValue, spec.absentMeans)
    if (written.changed) changed = true
    current = written.text
  }
  return { text: current, changed }
}

/**
 * 原子替换一个技能文件，**保留它的权限位**。
 *
 * writeFileAtomic 是「写临时文件再 rename」，新文件的权限位会退回默认值。技能文件是用户自己的
 * 资产，动它一行不该顺手把它的权限也改掉。
 */
async function writeTextKeepingMode(path, text) {
  const { mode } = await stat(path)
  await writeFileAtomic(path, text, { mode })
}

/**
 * 扫描一个根下**旧版约定**（`SKILL.md.disabled` / `<x>.md.disabled`）留下的条目。
 *
 * ⚠️ 这是**一次性迁移读取**，不是「已停用技能」的来源。新机制下「停用」= frontmatter 里的两个
 * 调用面字段（见 setSkillEnabled），那种技能**在宿主目录里照样看得见**，不需要也不该由本层扫盘
 * 得到——扫盘正是上一版的第二真值来源（同身份双行、链接目录判错都出自那里）。
 *
 * 保留它的唯一理由：1.6.x 的用户磁盘上可能已经有 `.disabled` 文件（我们自己写进去的），
 * 面板必须能把它们**列出来并恢复**，否则那些技能就永远回不来了。用户恢复之后，
 * 想停用就走新机制；本函数与它的 wire 字段在下一个大版本可以整体删除。
 *
 * ⚠️ 「是不是目录」必须用 `stat`（跟随链接），**不能**用 `readdir` 的 `Dirent.isDirectory()`：
 * 技能目录是指向外部同步库的符号链接/junction 时，Dirent 报的是 `isSymbolicLink() === true`
 * 而 `isDirectory() === false`（实测）。用 Dirent 会让这类条目掉进扁平分支、既不匹配 `.md.disabled`
 * 又拿不到 `<dir>/SKILL.md.disabled` —— **链接技能一旦停用就从面板彻底消失，再也启用不回来**。
 *
 * @param {{ root: string, scope: 'global'|'project' }} input
 * @returns {Promise<object[]>}
 */
export async function scanDisabledSkills(input) {
  const { root, scope } = input
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return []
    throw error
  }
  const rows = []
  for (const entry of entries) {
    if (typeof entry.name !== 'string') continue
    // 跟随链接判目录（见函数头说明）。stat 失败（悬空链接）就当它不是目录，继续按扁平判。
    const isDirectory = await stat(join(root, entry.name)).then((info) => info.isDirectory()).catch(() => false)
    if (isDirectory) {
      // 目录捆绑：<目录名>/SKILL.md.disabled
      const entryName = entry.name
      const disabled = join(root, entryName, `${BUNDLE_FILE}${DISABLED_SUFFIX}`)
      if (await exists(disabled)) {
        rows.push({ entry: entryName, kind: 'bundle', scope, root, path: disabled, migrated: true })
      }
      continue
    }
    // 扁平：<文件名>.md.disabled
    if (entry.name.endsWith(`.md${DISABLED_SUFFIX}`)) {
      // ⚠️ 报出去的 entry 是**启用态那一段**（`x.md`），不是磁盘上这个 `.disabled` 文件名：
      // 面板拿它去 resolveSkillTarget，而那里是按「启用态路径 + .disabled」两处找的
      // （见 resolveSkillTarget）。给 `.disabled` 全名会连形态校验都过不去（不以 .md 结尾）。
      const entryName = entry.name.slice(0, -DISABLED_SUFFIX.length)
      rows.push({ entry: entryName, kind: 'flat', scope, root, path: join(root, entry.name), migrated: true })
    }
  }
  return rows
}

/**
 * 读一个技能文件：正文**和它在磁盘上的调用权限**一次给出。
 *
 * 为什么合成一个入口：分两次读会读到两个版本（改动正好落在两次读之间），面板于是显示一份正文
 * 配一个不属于它的权限。调用权限一律从**这份读到的字节**里解析出来，所以它天然与正文同源。
 *
 * 解析不出来时 `invocation` 是 `null`——**不知道就说不知道**。非法 frontmatter 的技能会被宿主
 * 整条跳过，此时「模型能不能调用它」没有答案，编一个布尔值就是让面板撒谎。
 *
 * @param {object} target - resolveSkillTarget 的结果。
 * @returns {Promise<{ text: string, invocation: null | { modelInvocable: boolean, userInvocable: boolean } }>}
 */
export async function readSkillDocument(target) {
  const text = await readFile(target.path, 'utf8')
  return { text, invocation: diagnoseSkill(text).invocation ?? null }
}

/**
 * 改一个技能的**某一个调用面**——写它 frontmatter 里对应的那个字段。
 *
 * 两个面共用这一处实现（`face` 选哪个字段；字段名与缺省方向只在 `INVOCATION_FIELDS` 声明一次）：
 *   · `modelInvocable` → `disable-model-invocation`（模型能不能自动发现并调用它）
 *   · `userInvocable`  → `user-invocable`（你能不能 `/名字` 手动调用它）
 *
 * ⚠️ 为什么两个面**各自可写**，而不是只给「模型面」一个开关：宿主支持的是**两个**面，
 * 而「停用」只是「两个都关」这一种组合。面板若只暴露一个面，用户在面板里就拨不回
 * 「仅手动可调用」那一档——只能去编辑文件。补上第二个开关之后，面板与文件是 1:1 的
 * （没有第三态要存，也没有派生状态要对账），而 `setSkillEnabled` 退回它本来的身份：
 * 把两个面一起拨的**快捷动作**。
 *
 * 与启停同一套纪律：只读根拒绝、同一把锁（`lockKeyOf` = `<根>/<条目>`）、读-改-写全在锁内、
 * 原子提交（writeFileAtomic 写临时文件再 rename）。改写规则本身在 lib/skills-frontmatter.js：
 * 形状读不准时它抛错，本层**原样放行那个错误**——拒绝的原因只有那一处知道，包一层只会把
 * 「哪一行不对」这类信息丢掉。
 *
 * @param {object} target - resolveSkillTarget 的结果（已停用的技能也收，权限与启用态无关）。
 * @param {'modelInvocable'|'userInvocable'} face - 改哪一个调用面。
 * @param {boolean} invocable - true 允许该面调用，false 禁止。
 * @returns {Promise<{ changed: boolean, face: string, invocable: boolean }>}
 */
export async function setSkillInvocationFace(target, face, invocable) {
  // ⚠️ 必须用 `Object.hasOwn` 而不是 `INVOCATION_FIELDS[face]` 直接取：
  // 面名来自 wire，而 `INVOCATION_FIELDS` 是个普通对象字面量——`'constructor'` / `'toString'`
  // 这类名字会沿原型链取到函数（truthy），于是绕过白名单、继续走到 `spec.key === undefined`，
  // 最后按 `undefined` 去写 frontmatter（实测：报错点从「未知的调用面」漂到一个看不懂的 YAML 错误）。
  const spec = Object.hasOwn(INVOCATION_FIELDS, face) ? INVOCATION_FIELDS[face] : undefined
  if (spec === undefined) {
    // 白名单而不是「按面名拼一个字段名」：拼错会写出一个宿主不认识的键，
    // 那既不改行为、又污染用户的 frontmatter。
    throw new Error(`未知的调用面：${JSON.stringify(face)}（只接受 ${Object.keys(INVOCATION_FIELDS).join(' / ')}）`)
  }
  if (target.writable === false) {
    throw new Error('该技能来自只读根（bundled），不可修改调用权限')
  }
  const next = invocable !== false
  // 锁键与启停/删除/导入一致（见 lockKeyOf）：同一物理文件上的这些操作必须彼此串行，
  // 否则「读到旧内容 → 写回」会把另一次操作的结果覆盖掉。
  return await withFileLock(lockKeyOf(target), async () => {
    const text = await readFile(target.path, 'utf8')
    // ⚠️ 两层映射都要做对，任何一层反了都会静默写出**语义相反**的文件：
    //   ① 语义值 → 字段值：`disable-model-invocation` 说的是「禁止」，所以它是 modelInvocable 的**反**
    //      （`inverted`）；`user-invocable` 与 userInvocable 同向。
    //   ② 字段值 + 该字段自己的缺省（`absentMeans`）→ 写还是删（由 setFrontmatterBoolean 决定：
    //      等于缺省就删掉那一行，于是「开→关→开」能逐字节还原原文）。
    const fieldValue = spec.inverted ? !next : next
    const written = setFrontmatterBoolean(text, spec.key, fieldValue, spec.absentMeans)
    if (written.changed) await writeTextKeepingMode(target.path, written.text)
    return { changed: written.changed, face, invocable: next }
  })
}

/**
 * 改「模型自动调用」权限（`setSkillInvocationFace` 的具名包装，保留原有调用形状与返回字段）。
 * @param {object} target - resolveSkillTarget 的结果。
 * @param {boolean} modelInvocable - true 允许模型自动调用，false 禁止。
 * @returns {Promise<{ changed: boolean, modelInvocable: boolean }>}
 */
export async function setSkillModelInvocable(target, modelInvocable) {
  const result = await setSkillInvocationFace(target, 'modelInvocable', modelInvocable)
  return { changed: result.changed, modelInvocable: result.invocable }
}

/**
 * 改「用户可调用」权限（`/名字` 手动调用那个面）。
 * @param {object} target - resolveSkillTarget 的结果。
 * @param {boolean} userInvocable - true 允许手动调用，false 禁止。
 * @returns {Promise<{ changed: boolean, userInvocable: boolean }>}
 */
export async function setSkillUserInvocable(target, userInvocable) {
  const result = await setSkillInvocationFace(target, 'userInvocable', userInvocable)
  return { changed: result.changed, userInvocable: result.invocable }
}

/**
 * 删除一个技能（目录捆绑删整个目录，扁平删文件）。
 *
 * ⚠️ 只删**根下的那个条目**（`<根>/<条目>`），因此对「技能目录是 junction」的形态而言
 * 删掉的是**链接本身**，外部同步库里的真实内容一个字节都不动——渲染端与门面都承诺过这一条，
 * 而删错方向是本套动作里唯一不可逆的一步。
 *
 * 旧版约定留下的 `.disabled` 残骸一并清掉：用户对一条旧态技能点「删除」，期待的是
 * 「这条技能不在了」，而不是「留下一个面板再也不显示的残骸」。
 *
 * @param {object} target - resolveSkillTarget 的结果。
 */
// ── 外部源技能的来源记录（R14）──
//
// 为什么跟着技能文件走，而不是建一个 <root>/.hub/ 目录：
//   · bundle 的 .hub.json 在目录里 ⇒ **删除技能时连带删掉**，不需要额外清理代码；
//   · flat 用 <name>.md.hub.json（挂在技能文件后面）⇒ **不会被当成技能条目**：
//     宿主与本模块只认 *.md 与 <dir>/SKILL.md，这个后缀两者都不匹配。
//   · 换成"多一个目录"的方案就要操心那个目录会不会被扫描当成技能、删技能时要不要清空——
//     那是白送的风险。
const HUB_SOURCE_SUFFIX = '.hub.json'

/** 某个已落盘技能对应的来源记录路径。result 是 importSkill 的返回（含 kind/path）。 */
export function hubSourcePath(result) {
  if (result?.kind === 'bundle') return join(dirname(result.path), HUB_SOURCE_SUFFIX)
  if (typeof result?.path === 'string' && result.path !== '') return result.path + HUB_SOURCE_SUFFIX
  throw new Error('无法定位来源记录：缺少 kind/path')
}

/**
 * 写下外部源技能的来源（slug / version / pageUrl / installedAt）。
 *
 * 失败**不吞**：来源是用户判断"这技能从哪来、能不能更新"的唯一依据，写不进去要让人知道。
 * 调用方（skillHubInstall）会把"技能已经落盘"与"来源没记住"分开报。
 */
export async function writeHubSource(result, source) {
  const record = {
    slug: String(source?.slug ?? ''),
    version: source?.version === undefined || source?.version === null ? '' : String(source.version),
    pageUrl: String(source?.pageUrl ?? ''),
    installedAt: new Date().toISOString(),
  }
  if (record.slug === '') throw new Error('外部源技能缺少 slug，无法记录来源')
  await writeFile(hubSourcePath(result), JSON.stringify(record, null, 2) + '\n', 'utf8')
  return record
}

/** 读来源记录；没有就返回 null（本机导入的技能没有来源，那不是错误）。 */
export async function readHubSource(result) {
  try {
    const text = await readFile(hubSourcePath(result), 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      slug: String(parsed.slug ?? ''),
      version: String(parsed.version ?? ''),
      pageUrl: String(parsed.pageUrl ?? ''),
      installedAt: String(parsed.installedAt ?? ''),
    }
  } catch (error) {
    // 文件不存在 = 本机导入的技能，返回 null；JSON 坏掉则**明确报错**——静默当成"没有来源"
    // 会让用户以为这个技能是手工装的，从而永远不去更新它。
    if (error?.code === 'ENOENT') return null
    throw new Error('来源记录损坏：' + String(error?.message ?? error))
  }
}

export async function removeSkill(target) {
  if (target.writable === false) {
    throw new Error('该技能来自只读根（bundled），不可删除')
  }
  // 与启停/导入同一把锁：删除与「正在导入的同名技能」不能交错。
  return await withFileLock(lockKeyOf(target), async () => {
    // 展示路径（<根>/<条目>）——不是 realpath。见 resolveSkillTarget 的说明。
    const item = join(target.root, target.entry)
    if (target.kind === 'bundle') {
      // 目录捆绑连同它的 resources（scripts/references/assets）一起删，
      // 否则会在根里留下无主的资源目录。
      await rm(item, { recursive: true, force: true })
      return { changed: true, removed: item }
    }
    await rm(item, { force: true })
    // 扁平技能的旧态残骸（同一个条目的 .disabled 变体）。
    await rm(`${item}${DISABLED_SUFFIX}`, { force: true })
    // 来源记录也一起清（R14）：留着它会指向一个已经不存在的技能。
    await rm(`${item}${HUB_SOURCE_SUFFIX}`, { force: true })
    return { changed: true, removed: item }
  })
}

/**
 * 一把锁的键：**根下那个条目的展示路径**（`<根>/<条目>`）。
 *
 * 为什么不是实体的 realpath：锁必须让「创建」与「后续操作」用同一把钥匙，
 * 而创建（importSkill）此刻还没有实体、只能用展示路径算键。若操作侧改用 realpath，
 * 技能目录是 junction 时两者立刻分叉——导入与删除/启停就会互相插队，正是这把锁要防的事。
 *
 * 「同一个物理文件被两个根指到」的情形（DSH_HOME 落在工作区里）由 skills-registry 的
 * 物理位置去重在上游消除：面板因此只会拿**其中一个**根去寻址同一个文件，不会有两个键。
 */
function lockKeyOf(target) {
  return join(target.root, target.entry)
}

// ---------------------------------------------------------------------------
// 导入
//
// 落盘名必须取自 **frontmatter 的 name**，而不是源文件/目录/压缩包内层的名字：宿主的技能
// 身份就来自 frontmatter（dsh-skill-filesystem 的 parsed.name），它完全忽略外层名字。
// 若按外层名落盘，导入结果的名字与用户看到的技能名就对不上——而**定位**不受影响：
// 定位走「根下的条目」（见 resolveSkillTarget），条目名与技能名本来就不必一致。
// ---------------------------------------------------------------------------

/** 列出一个技能树里所有 SKILL.md 的相对路径（正斜杠）。 */
async function findSkillFiles(directory) {
  const found = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name === BUNDLE_FILE) found.push(relative(directory, full).replace(/\\/g, '/'))
    }
  }
  await walk(directory)
  return found
}

/**
 * 拒绝技能树里的符号链接，与压缩包路径同一纪律（skills-archive 拒链接）。
 *
 * 理由：克隆下来的技能仓库可以带符号链接，而 `fs.cp` 默认保留链接（dereference: false）。
 * 原样复制的话，技能里的 `references/x.md` 就可能指向技能根之外的文件——技能正文会把
 * 读者引向不该读的内容。宁可整包拒绝，也不静默解引用（那会把外部文件的内容复制进用户的技能）。
 *
 * @param {string} directory - 技能树根。
 */
async function assertNoSymlinks(directory) {
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`技能目录含符号链接，已拒绝：${full}`)
      if (entry.isDirectory()) await walk(full)
    }
  }
  await walk(directory)
}

/**
 * 从若干 SKILL.md 里挑出唯一的技能根，挑不出就报错。
 *
 * 取**最浅**的那个（压缩包常见的外层包装目录因此被自然剥掉）；最浅层若仍有两个不同目录，
 * 说明这个包装了多个技能——静默挑一个等于猜，而导入的目标必须是确定的。
 *
 * @param {string[]} candidates - 相对路径清单。
 * @returns {string} 技能根相对路径（空串表示就是顶层）。
 */
function pickSkillRoot(candidates) {
  if (candidates.length === 0) throw new Error(`导入内容里没有 ${BUNDLE_FILE}，不是一个技能`)
  const depth = (path) => path.split('/').length
  const shallowest = Math.min(...candidates.map(depth))
  const top = candidates.filter((path) => depth(path) === shallowest)
  const roots = new Set(top.map((path) => path.split('/').slice(0, -1).join('/')))
  if (roots.size > 1) {
    throw new Error(`导入内容含多个技能（${[...roots].join('、')}），无法确定要导入哪一个`)
  }
  return [...roots][0]
}

/**
 * 校验待导入的技能原文，返回它的 frontmatter 名字。
 *
 * 导入时就挡住非法 frontmatter：宿主对非法技能只 warn + 跳过，放进来只会得到一条
 * 「看不见的技能」，用户会以为导入成功。
 */
function requireImportableName(text, sourcePath) {
  const diagnosed = diagnoseSkill(text)
  if (!diagnosed.ok) {
    const first = diagnosed.issues.find((issue) => issue.level === 'error')
    throw new Error(`技能 frontmatter 不合格（${sourcePath}）：${first.message}`)
  }
  const { name } = diagnosed
  // name 此刻即将被拼进路径，而它来自外部文件——边界处再挡一次，不依赖上游校验。
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
    throw new Error(`非法技能名：${JSON.stringify(name)}（只接受 kebab-case）`)
  }
  return name
}

/** 确认目标名字在该作用域下完全空闲，避免静默覆盖用户已有的技能。 */
async function assertSkillVacant(root, name) {
  const candidates = [
    join(root, name),
    join(root, `${name}.md`),
    join(root, `${name}.md${DISABLED_SUFFIX}`),
  ]
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      throw new Error(`技能 ${name} 在该作用域已存在：${candidate}（请先删除或改名，不会自动覆盖）`)
    }
  }
}

/**
 * 把一个技能导入到指定作用域的根。
 *
 * 支持三种来源（与主流 skills CLI 的范围一致）：
 *   - `{ type: 'file', path }`     单个 `.md` → 落成扁平技能 `<name>.md`
 *   - `{ type: 'directory', path }` 目录捆绑 → 落成 `<name>/`（连同 resources）
 *   - `{ type: 'archive', path }`  zip / tar / tar.gz / tgz → 落成 `<name>/`
 *
 * 「先全部校验、再落盘」：任何一步失败都不应该在用户的技能根里留下残骸。
 *
 * @param {{ root: string, scope: 'global'|'project', writable?: boolean,
 *   source: { type: 'file'|'directory'|'archive', path: string }
 *     | { type: 'file', content: string }
 *     | { type: 'archive', archiveBase64: string } }} input
 *   `content` / `archiveBase64` 是**浏览器上传**用的形式：浏览器拿不到宿主机路径，只能给内容。
 *   两者会在入口处落到 system tmp 再走**同一条**导入路径（zip-slip、符号链接、锁、原子提交全部复用）。
 * @returns {Promise<{ name: string, kind: 'flat'|'bundle', scope: string, root: string, path: string }>}
 */
export async function importSkill(input) {
  const { root, scope, source, writable = true } = input ?? {}
  if (typeof root !== 'string' || root === '') throw new Error('非法技能根目录')
  if (writable === false) throw new Error('该技能来自只读根（bundled），不可导入')
  if (source === null || typeof source !== 'object') throw new Error('缺少导入源')
  // ── 浏览器上传：内容 → 暂存文件，再重入本函数走既有路径 ────────────────────
  // 为什么不在下面各分支里加 if：那会变成两套导入实现（一套读盘、一套读内存），
  // 而 zip-slip / 符号链接 / 锁 / 原子提交这四道关卡都在**读盘那条**上。
  // 归一化一次，之后仍只有一条路径。
  if (source.content !== undefined || source.archiveBase64 !== undefined) {
    const isArchive = source.archiveBase64 !== undefined
    const staging = await mkdtemp(join(tmpdir(), 'dsh-skill-upload-'))
    try {
      let bytes
      if (isArchive) {
        if (typeof source.archiveBase64 !== 'string') throw new Error('压缩包内容必须是 base64 字符串')
        // 先卡 base64 长度再解码：解码 32MB 上限的 base64 会一次性占两份内存，
        // 而一个恶意的大字符串可以在解码前就被拒。
        const maxBase64 = Math.ceil(MAX_ARCHIVE_BYTES / 3) * 4
        if (source.archiveBase64.length > maxBase64) throw new Error(`压缩包过大（上限 ${MAX_ARCHIVE_BYTES} 字节）`)
        bytes = Buffer.from(source.archiveBase64, 'base64')
        // Buffer.from 对非法 base64 是**宽容**的（静默丢掉非法字符），所以必须回验：
        // 不校验的话，一个损坏的上传会被当成"能解码但解压失败"，错误信息会指向解压而不是输入。
        if (bytes.toString('base64').replace(/=+$/, '') !== source.archiveBase64.replace(/=+$/, '')) {
          throw new Error('压缩包内容不是合法的 base64')
        }
      } else {
        if (typeof source.content !== 'string') throw new Error('技能文件内容必须是字符串')
        bytes = Buffer.from(source.content, 'utf8')
        // 文本没有"输入路径"可查大小，所以在这里卡：超限内容连暂存文件都不该写出来。
        if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`技能文件过大（${bytes.byteLength} 字节，上限 ${MAX_FILE_BYTES} 字节）`)
      }
      const staged = join(staging, isArchive ? 'upload.zip' : 'upload.md')
      await writeFile(staged, bytes)
      // 重入：source 已经只有 path，不会再进这个分支。
      return await importSkill({ root, scope, writable, source: { type: isArchive ? 'archive' : 'file', path: staged } })
    } finally {
      // 暂存目录里是用户技能的原文，不管成败都必须删。
      await rm(staging, { recursive: true, force: true })
    }
  }
  const { type, path: sourcePath } = source
  if (typeof sourcePath !== 'string' || sourcePath === '') throw new Error('缺少导入源路径')
  if (!(await exists(sourcePath))) throw new Error(`导入源不存在：${sourcePath}`)

  if (type === 'file') {
    const text = await readFile(sourcePath, 'utf8')
    const name = requireImportableName(text, sourcePath)
    await mkdir(root, { recursive: true })
    // 锁 + 原子提交：临时名**刻意不带 `.md`**（宿主的扁平规则只认 `*.md`，所以它在扫描里不可见），
    // 写完 rename 到位。并发同名导入因此不会互相踩，中途失败也不会留下半个技能文件。
    // 锁键与后续操作同一处算（lockKeyOf）：导入进来的条目，之后启停/删除要用同一把锁。
    return await withFileLock(await lockKeyOf({ root, entry: name }), async () => {
      await assertSkillVacant(root, name)
      return await commitFlatSkill(root, name, text, scope)
    })
  }

  if (type !== 'directory' && type !== 'archive') {
    throw new Error(`不支持的导入源类型：${JSON.stringify(type)}`)
  }

  // 压缩包先解到临时目录再挑技能根；目录来源直接原地读，不复制一份。
  // 临时目录放在系统 tmp 而不是技能根里：宿主会扫描技能根的每个子目录
  // （只跳过 .system），暂存目录会被它当成一条技能。
  const staging = type === 'archive' ? await mkdtemp(join(tmpdir(), 'dsh-skill-import-')) : undefined
  try {
    let tree = sourcePath
    if (type === 'archive') {
      // 先卡**输入**大小：限额判定发生在解压之后，而这里会把整包读进内存。
      await assertArchiveInputSize(sourcePath)
      tree = join(staging, 'extracted')
      await extractArchive(await readFile(sourcePath), tree)
    }

    const bundleSource = join(tree, pickSkillRoot(await findSkillFiles(tree)))
    // ⚠️ 树根**自身**也要查：只从内部走会漏掉「调用方给的路径本身就是链接/junction」那种情形
    // （Windows 上 cp 会 EPERM，POSIX 上会把链接原样复制进用户的技能根）。
    await assertNoSymlink(bundleSource)
    await assertNoSymlinks(bundleSource)
    const text = await readFile(join(bundleSource, BUNDLE_FILE), 'utf8')
    const name = requireImportableName(text, sourcePath)
    await mkdir(root, { recursive: true })
    // 锁 + 原子提交（与启停/删除同一把锁键，见 lockKeyOf）。
    return await withFileLock(await lockKeyOf({ root, entry: name }), async () => {
      await assertSkillVacant(root, name)
      return await commitBundleSkill(root, name, bundleSource, scope)
    })
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true })
  }
}

/**
 * 扁平技能的原子提交。
 *
 * 临时名**不带 `.md`**：宿主判定扁平技能是 `name.endsWith('.md')`，所以
 * `.dsh-import-<随机>` 在它眼里根本不存在——放置期间不会闪出一条幽灵技能。
 */
async function commitFlatSkill(root, name, text, scope) {
  const destination = join(root, `${name}.md`)
  const temp = join(root, `.dsh-import-${randomBytes(6).toString('hex')}`)
  try {
    await writeFile(temp, text)
    await rename(temp, destination)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  return { name, kind: 'flat', scope, root, path: destination }
}

/**
 * 目录捆绑的原子提交：先复制到技能根里的**两层暂存结构**，再 rename 到位。
 *
 * 为什么不能直接 `cp` 到 `<root>/<name>`：`cp` 是合并语义，两次并发导入会互相踩
 * （实测过：一条的失败清理会删掉另一条正在写的目录）；中途失败还会在用户根里留半棵树。
 * 暂存用 `<root>/.dsh-import-<随机>/skill`：宿主判定技能看的是 `<dir>/SKILL.md`，
 * 外层没有 SKILL.md，所以放置期间它对宿主不可见（也不会被当成扁平技能——那要求 `*.md`）。
 */
async function commitBundleSkill(root, name, bundleSource, scope) {
  const holder = join(root, `.dsh-import-${randomBytes(6).toString('hex')}`)
  const staged = join(holder, 'skill')
  const destination = join(root, name)
  try {
    await mkdir(holder, { recursive: true })
    await cp(bundleSource, staged, { recursive: true })
    // 复制结果里不得出现链接：`cp` 的 dereference:false 会把链接当链接搬过来。
    await assertNoSymlinks(staged)
    await rename(staged, destination)
    return { name, kind: 'bundle', scope, root, path: join(destination, BUNDLE_FILE) }
  } finally {
    // 成功时 holder 只剩空壳；失败时它带着半成品一起被清掉。
    await rm(holder, { recursive: true, force: true })
  }
}

/** 该路径**本身**是不是链接/junction（`lstat` 不跟随链接，`stat` 会）。 */
async function assertNoSymlink(path) {
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`拒绝导入符号链接/联结：${path}`)
}

/** 压缩包**输入**大小上限：在把它读进内存之前卡一道（解压限额在解压之后才生效）。 */
async function assertArchiveInputSize(sourcePath) {
  const info = await stat(sourcePath)
  if (info.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`压缩包过大（${info.size} 字节，上限 ${MAX_ARCHIVE_BYTES} 字节）`)
  }
}
