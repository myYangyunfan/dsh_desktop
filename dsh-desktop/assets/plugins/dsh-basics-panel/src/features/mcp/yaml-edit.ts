/**
 * Round-trip editing of a composition document: flip one row's `disabled`
 * flag or update one row's `config`, while preserving comments and every other
 * key. Editing works on the yaml Document node tree (never on the plain JS
 * value) so the file text other than the edited keys is byte-stable.
 *
 * A target names its scope: a profile row lives at the document's top level or
 * inside an `insert` list, while a preset row lives inside the `plugins` list
 * of an `@deepseek-ai/dsh-agent-preset` declaration (DSH ≥0.1.7 composition
 * shape). The lookup therefore descends into preset declarations and entry
 * groups, and never matches a row from a different scope than the target asks
 * for — two presets may declare servers with the same name.
 */
import { parseDocument, isMap, isSeq, isScalar, type ParsedNode, type YAMLMap, type YAMLSeq } from 'yaml'
import { isAgentPresetName, isMcpClientName } from './composition-scan.ts'

/** One row to edit: its profile-scope identity plus its owning preset, if any. */
export interface RowTarget {
  rowId?: string | null
  serverName: string
  /** Owning preset id; null/absent addresses a profile-scope row. */
  presetId?: string | null
}

/** Read a scalar node as a string (empty for non-scalars). */
function scalarString(node: unknown): string {
  if (!isScalar(node)) return ''
  const value = node.value
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** Whether the row at hand matches the target inside the scope being walked. */
function considerRow(map: YAMLMap, target: RowTarget, presetId: string | null): YAMLMap | undefined {
  if (!isMcpClientName(scalarString(map.get('name', true)))) return undefined
  if ((target.presetId ?? null) !== presetId) return undefined
  const config = map.get('config', true)
  const serverName = isMap(config) ? scalarString(config.get('serverName', true)) : ''
  if (serverName !== '' && serverName === target.serverName) return map
  if (target.rowId != null && scalarString(map.get('id', true)) === target.rowId) return map
  return undefined
}

/**
 * Locate the YAML mapping of the row matching `target`, walking insert lists,
 * entry-group child lists and preset declarations alike.
 */
function findRowNode(node: unknown, target: RowTarget, presetId: string | null): YAMLMap | undefined {
  if (isSeq(node)) {
    for (const item of node.items) {
      const found = findRowNode(item, target, presetId)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isMap(node)) return undefined
  const name = scalarString(node.get('name', true))
  if (isAgentPresetName(name)) {
    // A preset declaration: its rows live under `config.plugins`, and only a
    // target naming this preset may reach them.
    const config = node.get('config', true)
    if (!isMap(config)) return undefined
    const declared = scalarString(config.get('id', true))
    if (declared === '' || (target.presetId ?? null) !== declared) return undefined
    return findRowNode(config.get('plugins', true), target, declared)
  }
  const insert = node.get('insert', true)
  if (isSeq(insert)) {
    for (const item of insert.items) {
      const found = findRowNode(item, target, presetId)
      if (found !== undefined) return found
    }
  }
  const config = node.get('config', true)
  if (isSeq(config)) {
    // An entry group carries its children in `config`.
    const found = findRowNode(config, target, presetId)
    if (found !== undefined) return found
  }
  return considerRow(node, target, presetId)
}

/**
 * Flip one row's `disabled` flag in a composition document. `disabled === true`
 * adds the flag; `false` removes it (the Loader default). Returns the edited
 * text, or the original text with `ok: false` when the row or document is
 * unparsable/unfound.
 */
export function setRowDisabled(
  text: string,
  target: RowTarget,
  disabled: boolean,
): { ok: boolean; text: string } {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return { ok: false, text }
  const row = findRowNode(doc.contents, target, null)
  if (row === undefined) return { ok: false, text }
  if (disabled) row.set('disabled', true)
  else row.delete('disabled')
  return { ok: true, text: doc.toString() }
}

/** Editable fields on one MCP row's `config` mapping (null deletes the field). */
export interface RowConfigPatch {
  serverName?: string
  transport?: string
  command?: string | null
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string | null
  headers?: Record<string, string> | null
  cwd?: string | null
  toolCallTimeoutMs?: number | null
}

/** A new `mcp-client` row to append, as it should land in the document. */
export interface RowSeed {
  id: string
  name: string
  config: Record<string, unknown>
}

/**
 * Append a new row to a composition document. The row lands inside an existing
 * top-level `insert` list when one is present, otherwise a fresh `insert` block
 * is created; an empty document is seeded with one. Comments and every other
 * key stay byte-stable because the edit happens on the node tree.
 */
export function addRow(text: string, row: RowSeed): { ok: boolean; text: string } {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return { ok: false, text }
  // `createNode` types its result against the literal handed in, which a parsed
  // document rejects even though the runtime shape carries range/toJS/source;
  // the node tree, not the literal type, is what these edits touch.
  const node = doc.createNode(row) as unknown as ParsedNode
  const contents = doc.contents
  if (contents === null) {
    doc.contents = doc.createNode([{ insert: [row] }]) as unknown as ParsedNode
    return { ok: true, text: doc.toString() }
  }
  if (isSeq(contents)) {
    let insert: YAMLSeq | undefined
    for (const item of contents.items) {
      if (!isMap(item)) continue
      const candidate = item.get('insert', true)
      if (isSeq(candidate)) {
        insert = candidate
        break
      }
    }
    if (insert !== undefined) insert.items.push(node)
    // Bare-typed: the parsed generics would not take a freshly created node.
    else (contents as YAMLSeq).items.push(doc.createNode({ insert: [row] }))
    return { ok: true, text: doc.toString() }
  }
  if (isMap(contents)) {
    const existing = contents.get('insert', true)
    if (isSeq(existing)) existing.items.push(node)
    // Bare-typed: the parsed generics would reject both a string key and a new node.
    else (contents as YAMLMap).set('insert', doc.createNode([row]))
    return { ok: true, text: doc.toString() }
  }
  return { ok: false, text }
}

/**
 * Update one row's `config` mapping in place. A null/absent patch value is
 * skipped; an explicit null deletes the key. Values are converted through the
 * document's node factory so nested objects/arrays serialize correctly.
 */
export function setRowConfig(
  text: string,
  target: RowTarget,
  patch: RowConfigPatch,
): { ok: boolean; text: string } {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return { ok: false, text }
  const row = findRowNode(doc.contents, target, null)
  if (row === undefined) return { ok: false, text }
  const rawConfig: unknown = row.get('config', true)
  const config: YAMLMap = isMap(rawConfig) ? rawConfig : (doc.createNode({}) as YAMLMap)
  if (!isMap(rawConfig)) {
    row.set('config', config)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) config.delete(key)
    else config.set(key, doc.createNode(value))
  }
  return { ok: true, text: doc.toString() }
}
