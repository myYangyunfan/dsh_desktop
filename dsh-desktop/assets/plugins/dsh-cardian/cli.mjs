#!/usr/bin/env node
// cardian CLI — offline usage of the knowledge center without a DSH host.
//
//   node cli.mjs status --vault ./cardian-vault
//   node cli.mjs card add "闭包" "闭包=函数+词法环境" --tags js,基础 --category frontend
//   node cli.mjs search "闭包" --top 5
//   node cli.mjs wiki ingest ./src --name cardian
//   node cli.mjs export --file backup.json
//
// Global flags: --vault <path>  --dry-run  --quiet

import { createCardian } from './core/index.js'
import { isCardianError, ValidationError } from './core/errors.js'

const BOOLEAN_FLAGS = new Set(['dry-run', 'quiet', 'help'])

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
      } else if (BOOLEAN_FLAGS.has(a.slice(2))) {
        flags[a.slice(2)] = true
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[a.slice(2)] = argv[i + 1]
        i++
      } else {
        flags[a.slice(2)] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { flags, positional }
}

function csv(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function requireArg(rest, usageText) {
  if (!rest[0]) throw new ValidationError(`缺少参数，用法: ${usageText}`)
}

const usage = `cardian 知识中心 CLI
用法: node cli.mjs <command> [args] [--vault <path>] [--dry-run] [--quiet]

命令:
  status                            状态总览
  doctor                            健康检查
  schema                            frontmatter 字段一览
  sync <repoPath> [--name n] [--no-prune]   RepoWiki 双向同步（新增/变更/剪孤儿）
  graph <repoName>                  代码图谱（依赖边 + 被引计数）
  skill <name> [--refs a,b| --section s --group g]   导出可复用技能单元
  search <query> [--section s] [--top n]   混合检索
  recall <query> [--section s] [--scope s] [--top n] [--min-confidence n]   精简召回
  tagcloud [--section s]           标签云
  backlinks <ref>                  反向链接
  related <ref>                    相关条目
  card add <title> <content> [--tags a,b] [--category c] [--source s] [--front q] [--back a] [--deck d]
  card list [--category c] [--tag t]
  card get <ref>
  card due [--deck d]
  card review <ref> [--grade n]
  card rm <ref>
  memory commit <title> <content> [--scope s] [--facts a,b] [--importance n]
  memory list [--scope s]
  wiki ingest <path> [--name n] [--max n]
  export [--file out.json]
  import <file.json>
  import-md <dir> [--category c]
`

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  const [cmd, ...rest] = positional
  if (!cmd || flags.help) {
    console.log(usage)
    return
  }
  const vault = flags.vault ?? './cardian-vault'
  const dryRun = Boolean(flags['dry-run'])
  const quiet = Boolean(flags.quiet)
  const cardian = createCardian({ vaultPath: vault })
  await cardian.init()
  const out = (value) => console.log(JSON.stringify(value, null, 2))
  const read = async (fn) => {
    if (!quiet) console.error(`[cardian] ${cmd} → ${vault}`)
    out(await fn())
  }

  const SECTION = { wiki: 'wiki', cards: 'card', memory: 'memory' }

  switch (cmd) {
    case 'status':
      await read(() => cardian.status())
      break
    case 'doctor':
      await read(() => cardian.doctor())
      break
    case 'schema':
      await read(() => cardian.schema())
      break
    case 'sync':
      requireArg(rest, 'sync <repoPath> [--name n] [--no-prune] [--max n]')
      await read(() =>
        cardian.wiki.sync(rest[0], {
          repoName: flags.name,
          pruneOrphans: !flags['no-prune'],
          maxFiles: Number(flags.max) || 100,
        })
      )
      break
    case 'graph':
      requireArg(rest, 'graph <repoName>')
      await read(() => cardian.wiki.graph(rest[0]))
      break
    case 'skill':
      requireArg(rest, "skill <name> [--desc d] [--refs a,b] [--section cards|memory|wiki] [--group g]")
      await read(() =>
        cardian.exportSkill({
          name: rest[0],
          description: flags.desc,
          refs: csv(flags.refs),
          section: flags.section,
          group: flags.group,
        })
      )
      break
    case 'search':
      requireArg(rest, 'search <query>')
      await read(() =>
        cardian.search(rest[0], {
          type: SECTION[flags.section] ?? null,
          topK: Number(flags.top) || 20,
        })
      )
      break
    case 'recall':
      requireArg(rest, 'recall <query>')
      await read(() =>
        cardian.recall(rest[0], {
          type: SECTION[flags.section] ?? null,
          scope: flags.scope,
          topK: Number(flags.top) || 4,
          minConfidence: flags['min-confidence'] != null ? Number(flags['min-confidence']) : null,
        })
      )
      break
    case 'tagcloud':
      await read(() => cardian.tagCloud({ type: SECTION[flags.section] ?? null }))
      break
    case 'backlinks':
      requireArg(rest, 'backlinks <ref>')
      await read(() => cardian.backlinks(rest[0]))
      break
    case 'related':
      requireArg(rest, 'related <ref>')
      await read(() => cardian.related(rest[0]))
      break
    case 'export':
      if (dryRun) {
        out({ 'dry-run': 'export', to: flags.file ?? '<stdout>' })
      } else {
        const data = await cardian.exportJson()
        if (flags.file) {
          const { writeFile } = await import('node:fs/promises')
          await writeFile(flags.file, JSON.stringify(data, null, 2), 'utf8')
          if (!quiet) console.error(`[cardian] exported ${data.count} notes → ${flags.file}`)
        } else {
          out(data)
        }
      }
      break
    case 'import':
      requireArg(rest, 'import <file.json>')
      if (dryRun) out({ 'dry-run': 'import', file: rest[0] })
      else {
        const { readFile } = await import('node:fs/promises')
        const data = JSON.parse(await readFile(rest[0], 'utf8'))
        out(await cardian.importJson(data))
      }
      break
    case 'import-md':
      requireArg(rest, 'import-md <dir>')
      if (dryRun) out({ 'dry-run': 'import-md', dir: rest[0] })
      else out(await cardian.importMarkdownFolder(rest[0], { category: flags.category }))
      break
    case 'card':
      await handleCard()
      break
    case 'memory':
      await handleMemory()
      break
    case 'wiki':
      await handleWiki()
      break
    default:
      console.error(`未知命令: ${cmd}\n`)
      console.log(usage)
      process.exitCode = 1
  }

  async function handleCard() {
    const [sub, ...a] = rest
    if (sub === 'add') {
      if (dryRun) return out({ 'dry-run': 'card.add', title: a[0], content: a[1] })
      out(
        await cardian.cards.upsert({
          title: a[0],
          content: a[1],
          tags: csv(flags.tags),
          category: flags.category,
          source: flags.source,
          front: flags.front,
          back: flags.back,
          deck: flags.deck,
        })
      )
    } else if (sub === 'list') {
      out(await cardian.cards.list({ group: flags.category, tag: flags.tag }))
    } else if (sub === 'get') {
      out(await cardian.cards.get(a[0]))
    } else if (sub === 'due') {
      out(await cardian.cards.due({ deck: flags.deck }))
    } else if (sub === 'review') {
      if (dryRun) return out({ 'dry-run': 'card.review', ref: a[0], grade: flags.grade })
      out(await cardian.cards.review(a[0], Number(flags.grade) || 2))
    } else if (sub === 'rm') {
      if (dryRun) return out({ 'dry-run': 'card.rm', ref: a[0] })
      out({ deleted: await cardian.cards.remove(a[0]) })
    } else throw new ValidationError(`card 子命令: add|list|get|due|review|rm`)
  }

  async function handleMemory() {
    const [sub, ...a] = rest
    if (sub === 'commit') {
      if (dryRun) return out({ 'dry-run': 'memory.commit', title: a[0], content: a[1] })
      out(await cardian.memory.upsert({ title: a[0], content: a[1], scope: flags.scope, facts: csv(flags.facts), importance: Number(flags.importance) || 3, tags: csv(flags.tags) }))
    } else if (sub === 'list') {
      out(await cardian.memory.list({ group: flags.scope, tag: flags.tag }))
    } else if (sub === 'get') {
      out(await cardian.memory.get(a[0]))
    } else if (sub === 'rm') {
      if (dryRun) return out({ 'dry-run': 'memory.rm', ref: a[0] })
      out({ deleted: await cardian.memory.remove(a[0]) })
    } else throw new ValidationError(`memory 子命令: commit|list|get|rm`)
  }

  async function handleWiki() {
    const [sub, ...a] = rest
    if (sub === 'ingest') {
      if (dryRun) return out({ 'dry-run': 'wiki.ingest', path: a[0] })
      out(await cardian.wiki.ingest(a[0], { repoName: flags.name, maxFiles: Number(flags.max) || 50 }))
    } else if (sub === 'list') {
      if (flags.name) out(await cardian.wiki.list({ group: flags.name }))
      else out({ repos: await cardian.wiki.listRepos(), entries: await cardian.wiki.list() })
    } else throw new ValidationError(`wiki 子命令: ingest|list`)
  }
}

const EXIT_CODES = { VALIDATION: 2, NOT_FOUND: 3, CONFIG: 4, PATH: 5, STORE: 6 }

main().catch((err) => {
  console.error('[cardian]', err?.message ?? err)
  process.exitCode = isCardianError(err) ? EXIT_CODES[err.code] ?? 1 : 1
})
