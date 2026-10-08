/**
 * Skill-file frontmatter parsing and editing. A skill file is Markdown with a
 * leading YAML frontmatter block delimited by `---` lines. This module splits
 * the block from the body, parses it, and edits it through the `yaml` package
 * Document API so unknown frontmatter keys and comments survive a save.
 *
 * Canonical keys (mirroring @deepseek-ai/dsh-skill-filesystem):
 *   name, description, whenToUse?, metadata?, disable-model-invocation?,
 *   user-invocable?
 */
import { parseDocument, isMap } from 'yaml'

/** The public skill-name grammar (mirror of dsh-skill's SKILL_NAME). */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether a string is a valid kebab-case skill name. */
export function isSkillName(name: string): boolean {
  return SKILL_NAME_RE.test(name)
}

/** The split form of a skill file: frontmatter text (without the delimiters) and body. */
export interface SkillFileParts {
  frontmatter: string
  body: string
}

/**
 * Split a raw skill file into its frontmatter text and body. Returns
 * undefined when the file has no `---`-delimited frontmatter block.
 */
export function splitSkillFile(raw: string): SkillFileParts | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1
      return {
        frontmatter: raw.slice(start, lineStart),
        body: raw.slice(bodyStart),
      }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/** Parse frontmatter text to a plain object, or undefined when it is not a mapping. */
export function parseFrontmatter(frontmatter: string): Record<string, unknown> | undefined {
  const doc = parseDocument(frontmatter)
  if (doc.errors.length > 0) return undefined
  if (!isMap(doc.contents)) return undefined
  return doc.toJS() as Record<string, unknown>
}

/** The fields the editor may change. */
export interface SkillEdit {
  description?: string
  whenToUse?: string | null
  metadata?: Record<string, unknown> | null
  modelInvocable?: boolean
  userInvocable?: boolean
  body?: string
}

/**
 * Validate an edit's frontmatter fields, returning the normalized patch to
 * apply to the YAML node. Throws a TypeError with a Chinese message on an
 * invalid field.
 */
export function normalizeSkillPatch(edit: SkillEdit): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (edit.description !== undefined) {
    if (typeof edit.description !== 'string' || edit.description.trim() === '') {
      throw new TypeError('描述不能为空')
    }
    patch.description = edit.description
  }
  if (edit.whenToUse !== undefined) {
    if (edit.whenToUse === null || edit.whenToUse === '') {
      patch.whenToUse = undefined
    } else {
      patch.whenToUse = edit.whenToUse
    }
  }
  if (edit.metadata !== undefined) {
    if (edit.metadata === null) {
      patch.metadata = undefined
    } else if (typeof edit.metadata !== 'object' || Array.isArray(edit.metadata)) {
      throw new TypeError('metadata 必须是对象')
    } else {
      patch.metadata = edit.metadata
    }
  }
  if (edit.modelInvocable !== undefined) {
    // Canonical form omits the key for the default (model-invocable = true).
    patch['disable-model-invocation'] = edit.modelInvocable ? undefined : true
  }
  if (edit.userInvocable !== undefined) {
    // Canonical form omits the key for the default (user-invocable = true).
    patch['user-invocable'] = edit.userInvocable ? undefined : false
  }
  return patch
}

/** Apply a patch map to a frontmatter YAML node, preserving unknown keys and comments. */
function applyPatch(doc: ReturnType<typeof parseDocument>, patch: Record<string, unknown>): void {
  let root = doc.contents
  if (root === null) {
    // A missing frontmatter mapping is rebuilt empty (should not happen for a valid skill).
    doc.contents = doc.createNode({})
    root = doc.contents
  }
  if (!isMap(root)) throw new TypeError('frontmatter 必须是 YAML 映射')
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) root.delete(key)
    else root.set(key, value)
  }
}

/**
 * Apply a skill edit to a raw skill file. The edit is validated, the
 * frontmatter is patched in place (round-tripped through the yaml Document so
 * unknown keys and comments survive), and the body is replaced when supplied.
 * Returns the full edited file text.
 */
export function applySkillEdit(raw: string, edit: SkillEdit): string {
  const parts = splitSkillFile(raw)
  if (parts === undefined) {
    throw new TypeError('技能文件缺少 frontmatter 块')
  }
  const patch = normalizeSkillPatch(edit)
  const doc = parseDocument(parts.frontmatter)
  if (doc.errors.length > 0) {
    throw new TypeError('frontmatter YAML 解析失败')
  }
  applyPatch(doc, patch)
  // The edited frontmatter must still carry a valid name (the editor never renames).
  const data = doc.toJS() as Record<string, unknown> | undefined
  if (typeof data?.name !== 'string' || !isSkillName(data.name)) {
    throw new TypeError('技能 name 非法（必须为 kebab-case）')
  }
  if (typeof data?.description !== 'string' || data.description.trim() === '') {
    throw new TypeError('技能 description 不能为空')
  }
  const frontmatter = doc.toString().trimEnd()
  const body = edit.body ?? parts.body
  return `---\n${frontmatter}\n---\n${body}`
}
