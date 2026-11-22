// Purpose hints use the current scoped catalog; they never register or discover tools.
// Note: Generic source quotations, never identity/version summaries — .agents/notes/implemented/2026-11-22-toolsearch-generic-purpose-hints.md

const CUE_CHAR_LIMIT = 800
const SHORT_PARAGRAPH_LIMIT = 160
const FIRST_SENTENCE_LIMIT = 240
const SENTENCES = new Intl.Segmenter('und', { granularity: 'sentence' })
const SENTENCE_END = /\p{Sentence_Terminal}[\p{Pe}\p{Pf}"']*$/u
const MCP_EXAMPLE_LIMIT = 3 // Across all owners, not three paragraphs per server.
const HEADER = '## Deferred purpose hints\n\nNon-exhaustive metadata, not schemas or permissions. Unshown tools remain searchable.'

/** Preserve a complete first nonempty paragraph before normalizing display whitespace. */
export function descriptionParagraph(description) {
  if (typeof description !== 'string') return ''
  const paragraph = description.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).find((part) => part.trim() !== '')
  return paragraph === undefined ? '' : paragraph.replace(/\s+/g, ' ').trim()
}

function purposeFor(name, description) {
  const paragraph = descriptionParagraph(description)
  if (paragraph === '') return undefined
  if (paragraph.length <= SHORT_PARAGRAPH_LIMIT) return { name, purpose: paragraph }
  // ICU provides text boundaries, not semantic understanding or an identity check.
  const sentence = SENTENCES.segment(paragraph)[Symbol.iterator]().next().value.segment.trim()
  if (sentence.length > FIRST_SENTENCE_LIMIT || !SENTENCE_END.test(sentence)) return undefined
  return { name, purpose: sentence }
}

/**
 * @param {Map<string, object>} catalog Current, still-deferred definitions.
 * @param {{groups: {server: string, names: {name: string}[]}[], unattributed: object[]}} grouped
 * @param {(server: string) => string} [instructionsOf] Actual already-present publisher instructions.
 * @returns {{text: string, count: number, chars: number}}
 */
export function capabilityCues(catalog, grouped, instructionsOf = () => '') {
  let text = HEADER
  let count = 0
  const select = (hint, heading) => {
    const line = `- ${JSON.stringify(hint.name)} — ${JSON.stringify(hint.purpose)}`
    const addition = `${heading ? `\n\n${heading}` : ''}\n${line}`
    // Count escaped display text and headings; never crop a name, paragraph or line.
    if (text.length + addition.length > CUE_CHAR_LIMIT) return false
    text += addition
    count++
    return true
  }
  const unattributed = grouped.unattributed
    .map((tool) => purposeFor(tool.name, catalog.get(tool.name)?.description))
    .filter(Boolean)
  let hostHeading = '### Host, plugin and unattributed tools'
  for (const hint of unattributed) {
    if (select(hint, hostHeading)) hostHeading = ''
  }
  let examples = 0
  for (const group of grouped.groups) {
    if (examples === MCP_EXAMPLE_LIMIT) break
    // Presence is a conservative deduplication rule, not a semantic quality judgment.
    if (instructionsOf(group.server).trim() !== '') continue
    for (const tool of group.names) {
      const hint = purposeFor(tool.name, catalog.get(tool.name)?.description)
      if (!hint) continue
      if (select(hint, `### MCP ${JSON.stringify(group.server)} — example, not exhaustive`)) {
        examples++
        break
      }
    }
  }
  return count === 0 ? { text: '', count: 0, chars: 0 } : { text, count, chars: text.length }
}
