// Map-of-Content (index) notes. Each section folder gets a `README.md` that
// links every entry with an Obsidian [[wikilink]], so the vault's graph view
// shows the knowledge center as a connected network.

function asTag(t) {
  const cleaned = String(t).trim().replace(/[\s[\]|#]+/g, '-')
  return cleaned ? cleaned : null
}

// Sanitize a title for use as a wikilink alias: strip characters that would
// break the `[[target|alias]]` syntax or inject extra links/headings.
function linkAlias(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function rebuildMoc(store, sectionDir, opts) {
  const { title, description = '', groupBy, frontmatter: extra = {} } = opts
  const files = await store.list(sectionDir)
  const entries = []
  for (const rel of files) {
    const note = await store.read(rel)
    if (note) entries.push({ rel, frontmatter: note.frontmatter })
  }

  const groups = new Map()
  for (const entry of entries) {
    const group = groupBy ? groupBy(entry.frontmatter) : '全部'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
  }

  const lines = [`# ${title}`]
  if (description) lines.push('', description)
  lines.push('', `> 共 ${entries.length} 条，由 cardian 自动维护。`)

  for (const [group, list] of [...groups.entries()].sort()) {
    lines.push('', `## ${group}`, '')
    for (const entry of list) {
      const stem = entry.rel.split('/').pop().replace(/\.md$/, '')
      const title2 = linkAlias(entry.frontmatter.title) || stem
      const tags = (entry.frontmatter.tags ?? [])
        .map(asTag)
        .filter(Boolean)
        .map((t) => `#${t}`)
        .join(' ')
      lines.push(`- [[${stem}|${title2}]]${tags ? '  ' + tags : ''}`)
    }
  }

  await store.write(`${sectionDir}/README.md`, {
    frontmatter: { title, type: 'moc', updated: new Date().toISOString(), ...extra },
    body: lines.join('\n') + '\n',
  })
}
