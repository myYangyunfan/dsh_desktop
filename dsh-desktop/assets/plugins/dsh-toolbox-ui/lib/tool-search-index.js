// MCP ToolSearch 的检索引擎（纯函数层）。
//
// 职责边界：本模块只做"给定工具 schema 列表 + 查询语句，返回排序后的匹配"，
// 不碰 DSH 服务、不碰遮罩与激活（那些在 tool-search-runtime.js）。
// 这样 BM25 调参、查询语法、CJK 分词全部可单测，不依赖宿主。
//
// 查询语法三形态（照抄 Claude Code v2.1.72 工具描述原文，见设计文档 §3）：
//   - "select:Read,Edit,Grep"  按完整工具名精确取（含不存在的名字，原样回报）
//   - "+slack send"            要求 "slack" 出现在工具名中，其余词参与排序
//   - "notebook jupyter"       纯关键词，BM25 排序取 top-N
//
// 评分：紧凑 BM25（k1=1.2, b=0.75）over 名字+描述+参数文本，另加精确名字奖励——
// 模型用 select: 拿全量、用关键词拿候选，两类查询都必须在名字命中时明显占优。

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/
const LATIN_WORD = /[a-z0-9]+/g

/** 拉丁词按非字母数字切分；CJK 走字符二元分词（无词分词器的语言的标准近似）。 */
export function tokenize(text) {
  const source = String(text ?? '').toLowerCase()
  const tokens = []
  let cjkRun = ''
  let latinBuffer = ''
  const flushCjk = () => {
    if (cjkRun.length === 0) return
    // 单个 CJK 字符成不了二元组，原样入池（两字词如"截图"自身就是二元组）。
    if (cjkRun.length === 1) tokens.push(cjkRun)
    else for (let i = 0; i < cjkRun.length - 1; i++) tokens.push(cjkRun.slice(i, i + 2))
    cjkRun = ''
  }
  const flushLatin = () => {
    if (latinBuffer !== '') { tokens.push(latinBuffer); latinBuffer = '' }
  }
  for (const char of source) {
    if (CJK.test(char)) {
      flushLatin()
      cjkRun += char
      continue
    }
    flushCjk()
    if (/[a-z0-9]/.test(char)) latinBuffer += char
    else flushLatin()
  }
  flushCjk()
  flushLatin()
  return tokens
}

/** 工具名的可匹配变体：全名 + 去掉 mcp__<server>__ 前缀的裸名。 */
export function toolNameVariants(name) {
  const variants = [name]
  const separator = name.lastIndexOf('__')
  if (separator !== -1 && separator + 2 < name.length) variants.push(name.slice(separator + 2))
  return variants
}

/**
 * 轻量词干化：只归单复数（s-stemmer，Harman 在 1991 年《How effective is suffixing?》里
 * 提倡的那条轻量路线）。**刻意不做 Porter**——Porter 会砍掉 60+ 种后缀，把
 * references→refer、declared→declar 这类也归掉，实测均名次反而更差（4.87 vs 3.67），
 * 文献也说它 "quite aggressive ... does overstemming"。
 *
 * 为什么值得做：BM25 只做词面匹配，"symbol"（查询常用单数）与 "symbols"（描述常用复数）
 * 会被当成两个词，于是最相关的工具匹配不上。两个真实 MCP 工具集实测
 * （serena 28 工具 / chrome-devtools 32 工具）：serena 核心工具进 top5 从 67% 到 78%、
 * top10 从 94% 到 100%；chrome-devtools 无变化（它的工具名就是查询词，本来就能命中）。
 * 两个数据集上误伤都没有增加——即"有时有效、从不有害"。
 *
 * 不变量：查询侧与文档侧必须用**同一个** stemmer，否则归一半反而更匹配不上。
 */
export function stemToken(token) {
  if (token.length <= 3) return token
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y'
  if (/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('s') && !/(ss|us|is)$/.test(token)) return token.slice(0, -1)
  return token
}

/** 按开关把一组 token 过词干化。开关关闭时原样返回（调用方不必分支）。 */
export function applyStem(tokens, enabled) {
  return enabled ? tokens.map(stemToken) : tokens
}

/**
 * 构建可检索目录。入参是工具 schema 列表（{ name, description, parameters }），
 * 出参是名字到条目的 Map；重复名后者覆盖（与注册表语义一致）。
 * `stem` 为 true 时名字与文档 token 都过单复数归一。
 */
export function buildCatalog(schemas, stem = false) {
  const catalog = new Map()
  for (const schema of schemas ?? []) {
    if (!schema || typeof schema.name !== 'string' || schema.name === '') continue
    const description = typeof schema.description === 'string' ? schema.description : ''
    const parameters = schema.parameters ?? null
    // 参数文本参与索引：模型常用参数名里的词查询（如 "screenshot"、"timeout"）。
    const parameterText = parameters === null ? '' : JSON.stringify(parameters)
    const document = [schema.name, description, parameterText].join(' ')
    catalog.set(schema.name, {
      name: schema.name,
      description,
      parameters,
      nameTokens: new Set(applyStem(tokenize(schema.name), stem)),
      documentTokens: applyStem(tokenize(document), stem),
    })
  }
  return catalog
}

/**
 * 解析查询为内部形态。空查询返回 kind: 'empty'（由调用方决定报错还是回报空）。
 * raw 保留归一化后的原文，供"整条查询恰是工具全名/裸名"的确定性置顶判定。
 */
export function parseQuery(query) {
  const trimmed = String(query ?? '').trim()
  if (trimmed === '') return { kind: 'empty', raw: trimmed }
  if (trimmed.startsWith('select:')) {
    const names = trimmed.slice('select:'.length)
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
    return { kind: 'select', names, raw: trimmed }
  }
  const terms = tokenize(trimmed)
  if (trimmed.startsWith('+')) {
    // "+server 关键词"：+ 后第一段是名字硬约束，其余参与排序。
    // 约束段必须走**和工具名同一套**切词规则：serverName 允许 - 与 _
    // （mcp-client SERVER_NAME_PATTERN），而 mcp__<server>__<tool> 的名字按非字母数字
    // 切词，所以 "chrome-devtools" 在名字里是 ['chrome','devtools'] 两个 token。
    // 若约束只取一个拉丁词，含 -/_ 的服务器名永远匹配不上，整条查询静默返回空。
    const head = /^\+(\S+)/.exec(trimmed)
    const requiredTokens = head === null ? [] : [...new Set(tokenize(head[1]))]
    const rest = head === null ? trimmed : trimmed.slice(head[0].length)
    // 约束段的词干化在 searchCatalog 里做（那里才知道 stem 开关），这里只负责切词。
    return { kind: 'filter', requiredTokens, terms: tokenize(rest), raw: trimmed }
  }
  return { kind: 'keywords', terms, raw: trimmed }
}

const BM25_K1 = 1.2
const BM25_B = 0.75
/** 查询词精确命中工具名（或裸名）时的加分：让"按名搜"稳定压过"描述里提到"。 */
const NAME_BONUS = 12

/** Code-unit 名字比较——与区域无关，同一输入在任何机器上给出同一顺序。 */
function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** `select:` 命中一条时的返回形状（`score: Infinity` 表示"按名精确取"，不参与排序）。 */
function selectMatch(entry) {
  return { name: entry.name, description: entry.description, parameters: entry.parameters, score: Infinity, found: true }
}

/**
 * 裸名解析：公开名是 `mcp__<server>__<raw>`，目录段显示的是 `<raw>`，所以 `<raw>` 的命中判据
 * 只能是「全名以 `__<raw>` 结尾」。**不做前缀猜测、不做模糊/编辑距离匹配**（红线 R1/R2）——
 * 这里只把模型抄来的短名与全名的后缀对齐；同一 `<raw>` 在多台服务器上都有时**全部返回**，
 * 由模型按描述挑（消歧不靠猜）。
 * @param {Map<string, object>} catalog - 目录（键为公开全名）。
 * @param {string} requested - 模型写的名字，可以是全名、裸名，大小写不限。
 * @returns {object[]} 命中的目录条目；空数组表示确实不存在。
 */
function resolveBareName(catalog, requested) {
  const wanted = requested.toLowerCase()
  const suffix = `__${wanted}`
  const hits = []
  for (const entry of catalog.values()) {
    const name = entry.name.toLowerCase()
    if (name === wanted || name.endsWith(suffix)) hits.push(entry)
  }
  return hits
}

/** 按名字取条目，大小写不敏感（先用精确键走 Map，未中再线性扫一次）。 */
function entryByName(catalog, name) {
  const exact = catalog.get(name)
  if (exact !== undefined) return exact
  const wanted = name.toLowerCase()
  for (const entry of catalog.values()) {
    if (entry.name.toLowerCase() === wanted) return entry
  }
  return undefined
}

/**
 * 把模型**自己拼出来的名字**还原成目录里真实存在的全名。
 *
 * 为什么值得做：目录把服务器放在组头、裸名放在列表项，模型很自然地连成
 * `browser.take_screenshot` / `browser take_screenshot` / `browser_take_screenshot`。这属于
 * **我们已经知道答案**的情形——拼回 `mcp__<server>__<tool>` 查一下在不在就知道了，不该靠提示词
 * 去劝它别这么写（靠模型的措辞没有确定性）。
 *
 * 为什么不是猜（红线 R2）——判据有两条，缺一不可：
 * ① **分隔符必须是"合法名字里不可能出现的字符"**。宿主把模型可见的工具名归一化成
 *    `[A-Za-z0-9_-]`（`mcp-client/src/tools.ts:51,83`：非法字符替换成 `_`），所以 `.` 与空格
 *    **不可能**是名字的一部分 ⇒ 用它们拆分只有**一种**解释，不存在"在两种意思里挑一个"。
 *    单个 `_` 是合法名字字符（`repo_read_file` 可能就是一张真工具的名字），所以**不认**——
 *    认了就是策略不是事实（早期版本认过，是错误）。
 * ② **反拼出来的名字必须真的在目录里**。不依赖服务器名单、不解析 `mcp__`/`__` 的结构；
 *    拼不回去就一个字都不返回，绝不返回"最像的那个"；同一串有多种拆法且都能对上时**全部返回**
 *    （消歧交给模型按描述挑，与裸名解析同一处置）。
 *
 * @param {Map<string, object>} catalog - 目录（键为公开全名）。
 * @param {string} requested - 模型写的名字（可能用 `.` 或空格把服务器与工具连起来）。
 * @returns {object[]} 命中的目录条目；空数组表示这种拼法对不上任何现有工具。
 */
function resolveJoinedName(catalog, requested) {
  const hits = []
  // 只有这两个：它们在 `[A-Za-z0-9_-]` 之外，所以拆法唯一（见上方注释）。`_` 故意不在其中。
  for (const separator of ['.', ' ']) {
    for (let index = requested.indexOf(separator); index > 0; index = requested.indexOf(separator, index + 1)) {
      const entry = entryByName(catalog, `mcp__${requested.slice(0, index)}__${requested.slice(index + 1)}`)
      if (entry !== undefined && !hits.includes(entry)) hits.push(entry)
    }
  }
  return hits
}

/**
 * 在目录上执行一次检索。select 形态按请求顺序原样回报（缺失的也回报，标注 found:false）；
 * 其余形态返回按分数降序的至多 maxResults 条。
 *
 * `stem` 必须与 buildCatalog 时用同一个值：查询侧与文档侧只归一半会比不归更糟
 * （"symbols"归成 "symbol" 而查询还是 "symbols"，照样对不上）。
 */
export function searchCatalog(catalog, query, maxResults = 5, stem = false) {
  const limit = Math.max(1, Math.floor(maxResults) || 1)
  const parsed = parseQuery(query)
  if (parsed.kind === 'empty' || catalog.size === 0) return []

  if (parsed.kind === 'select') {
    const matches = []
    const seen = new Set()
    for (const requested of parsed.names) {
      if (seen.has(requested)) continue
      seen.add(requested)
      const entry = catalog.get(requested)
      if (entry !== undefined) {
        matches.push(selectMatch(entry))
        continue
      }
      // 裸名：目录段显示的是剥掉 `mcp__<server>__` 之后的那一段，模型会照着它写 select:。
      // 不吃裸名的话，目录改格式就把这条主路径废掉了。
      const resolved = resolveBareName(catalog, requested)
      // 裸名对不上时再试"自己拼出来的名字"：能拼回目录里存在的全名就认，拼不回去才算不存在。
      const hits = resolved.length > 0 ? resolved : resolveJoinedName(catalog, requested)
      if (hits.length === 0) {
        matches.push({ name: requested, found: false })
        continue
      }
      for (const hit of hits) matches.push(selectMatch(hit))
    }
    return matches
  }

  const documents = [...catalog.values()]
  const averageLength = documents.reduce((sum, doc) => sum + doc.documentTokens.length, 0) / documents.length
  const documentFrequency = new Map()
  for (const doc of documents) {
    for (const token of new Set(doc.documentTokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }
  const idf = (token) => {
    const df = documentFrequency.get(token) ?? 0
    return Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
  }

  const scored = []
  // 整条查询恰是某个工具的全名/裸名时确定性置顶：模型从目录 section 抄名字来搜是
  // 设计的常见路径，不能靠 BM25 分数浮动——名字都对上了就没有"再排一排"的意义。
  const rawLower = parsed.raw.toLowerCase()
  const isExactName = (doc) => toolNameVariants(doc.name).some((variant) => variant.toLowerCase() === rawLower)
  for (const doc of documents) {
    if (parsed.kind === 'filter' && parsed.requiredTokens.length > 0) {
      // 名字硬约束：约束段切出的每个词都必须出现在名字的 token 里
      //（+chrome-devtools → mcp__chrome-devtools__* 全体）。
      // 约束词与 nameTokens 必须过同一个 stemmer，否则 "服务器名是复数形式" 时恒不匹配。
      const required = applyStem(parsed.requiredTokens, stem)
      if (!required.every((token) => doc.nameTokens.has(token))) continue
    }
    if (isExactName(doc)) {
      scored.push({ entry: doc, score: Infinity })
      continue
    }
    const terms = applyStem(parsed.terms, stem)
    if (terms.length === 0) {
      // 只有约束词没有排序词（如 "+slack"）：按目录序给中性分，全部候选平权返回。
      scored.push({ entry: doc, score: 0 })
      continue
    }
    const frequency = new Map()
    for (const token of doc.documentTokens) frequency.set(token, (frequency.get(token) ?? 0) + 1)
    let score = 0
    let nameHit = false
    for (const token of terms) {
      const tf = frequency.get(token) ?? 0
      if (tf === 0) continue
      const norm = tf * (BM25_K1 + 1) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * doc.documentTokens.length / averageLength))
      score += idf(token) * norm
      if (doc.nameTokens.has(token)) nameHit = true
      // 精确全名/裸名命中：整条查询就是工具名（模型从目录 section 抄名字时最常见）。
      if (toolNameVariants(doc.name).includes(token)) nameHit = true
    }
    if (nameHit) score += NAME_BONUS
    if (score > 0) scored.push({ entry: doc, score })
  }

  // 平手按 code-unit 序：localeCompare 依赖 ICU/区域，混合大小写会给出不同序，
  // 目录 section 因此不是字节稳定的（宿主 compareToolNames 用同一理由避开它）。
  scored.sort((left, right) => right.score - left.score || compareNames(left.entry.name, right.entry.name))
  return scored.slice(0, limit).map(({ entry, score }) => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters,
    score,
    found: true,
  }))
}
