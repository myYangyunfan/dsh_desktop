// Obsidian-compatible YAML frontmatter.
//
// Cardian writes every note as:
//
//   ---
//   id: ...
//   title: ...
//   ...
//   ---
//   <markdown body>
//
// Obsidian renders this frontmatter as note properties. We keep the YAML
// subset deliberately small and lossless for the shapes cardian emits, while
// still tolerating hand edits inside Obsidian (quoted scalars, inline arrays,
// block lists and block scalars).

const BLOCK_LITERAL = '|'
const BLOCK_FOLDED = '>'

function isPlainString(value) {
  if (value === '') return false
  if (typeof value !== 'string') return false
  // A plain scalar must not look like another YAML type, must not start with a
  // reserved indicator, and must not contain structural characters.
  if (/^(true|false|null|~)$/i.test(value)) return false
  if (/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(value.trim())) return false
  if (/^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(value)) return false
  // Commas and brackets are structural in YAML flow sequences; quotes and `#`
  // (YAML comments) and backslashes must be escaped, so any scalar containing
  // them is quoted to survive a round-trip through Obsidian/js-yaml.
  if (/[,\[\]"'#\\]/.test(value)) return false
  return !/[:#](\s|$)/.test(value) && !/[\n\r]/.test(value)
}

function quote(value) {
  return JSON.stringify(value)
}

function scalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'string') {
    if (value === '') return '""'
    if (/[\n\r]/.test(value)) return null // handled by block writer
    return isPlainString(value) ? value : quote(value)
  }
  return quote(String(value))
}

function isArray(value) {
  return Array.isArray(value)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function listItems(values) {
  return values.map((v) => {
    if (isObject(v) || isArray(v)) {
      const inner = stringifyNode(v, 1)
      const [first, ...rest] = inner.trimEnd().split('\n')
      return '- ' + first + (rest.length ? '\n' + rest.map((l) => '  ' + l).join('\n') : '')
    }
    const s = scalar(v)
    return '- ' + (s === null ? '' : s)
  })
}

function stringifyNode(value, depth) {
  if (isArray(value)) {
    if (value.length === 0) return '[]'
    const indent = '  '.repeat(depth)
    return '\n' + value.map((v) => indent + '- ' + scalarValueInline(v)).join('\n')
  }
  if (isObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${scalarValueInline(v)}`)
      .join('\n')
  }
  return scalar(value)
}

function scalarValueInline(v) {
  if (isArray(v)) return '[' + v.map(scalar).join(', ') + ']'
  if (isObject(v)) return stringifyNode(v, 0)
  return scalar(v)
}

function keyValueLine(key, value) {
  if (typeof value === 'string' && /[\n\r]/.test(value)) {
    // Preserve newlines exactly with a literal block scalar.
    const lines = value.replace(/\r\n/g, '\n').split('\n')
    const last = lines[lines.length - 1]
    const content = last === '' ? lines.slice(0, -1).join('\n') : lines.join('\n')
    return `${key}: ${BLOCK_LITERAL}\n${content
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n')}`
  }
  if (isArray(value)) {
    if (value.length === 0) return `${key}: []`
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      return `${key}: [${value.map(scalar).join(', ')}]`
    }
    return `${key}:\n` + value.map((v) => `  - ${scalarValueInline(v)}`).join('\n')
  }
  if (isObject(value)) {
    const inner = Object.entries(value)
      .map(([k, v]) => `${k}: ${scalarValueInline(v)}`)
      .join('\n')
    return `${key}:\n` + inner.split('\n').map((l) => '  ' + l).join('\n')
  }
  return `${key}: ${scalar(value)}`
}

export function stringifyFrontmatter(data) {
  if (!data || Object.keys(data).length === 0) return '---\n---\n'
  const body = Object.entries(data)
    .map(([k, v]) => keyValueLine(k, v))
    .join('\n')
  return `---\n${body}\n---\n`
}

// ---------------------------------------------------------------------------
// Parsing (line based, tolerant of common Obsidian hand-edits).

function unquote(value) {
  const s = value.trim()
  if (s.length >= 2) {
    if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) {
      try {
        return JSON.parse(s)
      } catch {
        return s.slice(1, -1)
      }
    }
  }
  return s
}

function parseScalar(value) {
  const s = value.trim()
  if (s === '' || s === '~' || s === 'null') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10)
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s)
  return unquote(s)
}

function parseInlineArray(s) {
  const inner = s.slice(1, -1)
  if (inner.trim() === '') return []
  return splitFlow(inner).map(parseScalar)
}

// Split a YAML flow sequence on commas, ignoring commas inside quotes and
// honoring backslash escapes inside double-quoted strings.
function splitFlow(s) {
  const parts = []
  let cur = ''
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inDouble && c === '\\') {
      cur += c
      if (i + 1 < s.length) {
        cur += s[i + 1]
        i++
      }
      continue
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble
      cur += c
    } else if (c === "'" && !inDouble) {
      inSingle = !inSingle
      cur += c
    } else if (c === ',' && !inDouble && !inSingle) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim() !== '') parts.push(cur.trim())
  return parts
}

export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false }
  }
  const lines = normalized.split('\n')
  const end = lines.indexOf('---', 1)
  if (end === -1) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false }
  }
  const fmLines = lines.slice(1, end)
  // A leading `---` is only frontmatter if it contains at least one key line;
  // otherwise it is a horizontal rule and the whole text is body content.
  const hasKey = fmLines.some((l) => {
    const t = l.trim()
    return t !== '' && !t.startsWith('#') && /^[^:#][^:]*:/.test(t)
  })
  if (!hasKey && fmLines.length > 0) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false }
  }
  const body = lines.slice(end + 1).join('\n')
  return { frontmatter: normalizeFrontmatter(parseLines(fmLines)), body, hasFrontmatter: true }
}

// Hand-edited/imported YAML may parse `title: 2024` or `tags: [42]` into
// numbers. Titles, tags, aliases and facts are always strings in cardian's
// model, so coerce them here to keep comparisons stable.
function normalizeFrontmatter(fm) {
  if (fm.title !== undefined && fm.title !== null) fm.title = String(fm.title)
  for (const key of ['tags', 'aliases', 'facts']) {
    if (Array.isArray(fm[key])) fm[key] = fm[key].map((v) => String(v))
  }
  return fm
}

function parseLines(lines) {
  const result = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++
      continue
    }
    const m = /^([^:]+):(.*)$/.exec(line)
    if (!m) {
      i++
      continue
    }
    const key = m[1].trim()
    const rest = m[2].trim()
    if (rest === '' || rest === BLOCK_LITERAL || rest === BLOCK_FOLDED) {
      const block = rest === BLOCK_LITERAL || rest === BLOCK_FOLDED
      const list = []
      let j = i + 1
      // Consume a block scalar or an indented block list.
      if (block) {
        while (j < lines.length && (lines[j].startsWith('  ') || lines[j].trim() === '')) {
          list.push(lines[j].startsWith('  ') ? lines[j].slice(2) : lines[j])
          j++
        }
        result[key] = list.join('\n')
        i = j
        continue
      }
      while (j < lines.length && /^\s+-\s?/.test(lines[j])) {
        list.push(parseScalar(lines[j].replace(/^\s+-\s?/, '')))
        j++
      }
      result[key] = list.length ? list : null
      i = j
      continue
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      result[key] = parseInlineArray(rest)
    } else {
      result[key] = parseScalar(rest)
    }
    i++
  }
  return result
}
