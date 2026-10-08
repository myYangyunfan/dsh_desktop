#!/usr/bin/env node
/**
 * Sync this repository's published files into the DSH profile installation copy.
 *
 * The web profile depends on this package through the `file:` protocol, so pnpm
 * materializes an independent copy under
 * `<DSH_HOME>/profiles/<profile>/node_modules/<name>` at install time. DSH loads
 * both halves (host bundle and client bundle) from that copy — never from this
 * repository — which means `pnpm build` alone is invisible to DSH until the copy
 * is refreshed. Only `cordis.patch.yml` / `LICENSE` happen to be hardlinked by
 * hand, so config edits leak through while code edits do not: a silent drift.
 *
 * Usage:
 *   node scripts/sync-profile.mjs                  # sync the default profile
 *   node scripts/sync-profile.mjs --check          # report drift; exit 1 only when it affects runtime
 *   node scripts/sync-profile.mjs --profile web    # target another profile
 *
 * Environment: DSH_HOME (default `~/.dsh`), DSH_PROFILE (default `web`).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

/**
 * Entries whose bytes decide what DSH actually loads: the built bundles plus the
 * manifest and bundle patch that mount them. Drift here means DSH runs old code;
 * drift anywhere else (`src`, README, LICENSE) is cosmetic.
 */
const RUNTIME_ENTRIES = new Set(['lib', 'package.json', 'cordis.patch.yml'])

/**
 * Read `--flag value` from argv. A flag without a value is a usage error rather
 * than a silent fallback: guessing the profile would sync to the wrong install.
 */
function argValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.trim().length === 0 || value.startsWith('--')) {
    console.error(`错误：${flag} 需要一个值，例如：${flag} web`)
    process.exit(1)
  }
  return value.trim()
}

/**
 * Published top-level entries, derived from the npm `files` globs so the copy
 * keeps the exact layout pnpm would install. Bare-glob heads (e.g. a top-level
 * `*.d.ts`) name no stable entry and are skipped; `package.json` always ships.
 */
function syncEntries() {
  const topLevel = new Set(['package.json'])
  for (const glob of pkg.files ?? []) {
    const head = glob.replace(/^\.\//, '').split('/')[0]
    if (head.length === 0 || head.includes('*')) continue
    topLevel.add(head)
  }
  const entries = [...topLevel].filter((entry) => existsSync(join(repoRoot, entry)))
  // Runtime-critical entries first: if a later entry fails, what DSH loads is current.
  return entries.sort((left, right) => Number(RUNTIME_ENTRIES.has(right)) - Number(RUNTIME_ENTRIES.has(left)))
}

/** Collect every regular file below `root`, as paths relative to it. */
function walk(root, current = root, collected = []) {
  for (const dirent of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, dirent.name)
    if (dirent.isDirectory()) walk(root, absolute, collected)
    else if (dirent.isFile()) collected.push(relative(root, absolute))
  }
  return collected
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** Compare one entry between repository and installation copy. */
function compareEntry(entry, targetRoot) {
  const source = join(repoRoot, entry)
  const target = join(targetRoot, entry)
  if (!existsSync(target)) return [{ entry, kind: 'missing', detail: '安装副本中不存在' }]
  if (statSync(source).isDirectory()) {
    const sourceFiles = walk(source).sort()
    const targetFiles = walk(target).sort()
    const targetSet = new Set(targetFiles)
    const sourceSet = new Set(sourceFiles)
    const diffs = []
    for (const file of sourceFiles) {
      if (!targetSet.has(file)) diffs.push({ entry: join(entry, file), kind: 'missing', detail: '安装副本中不存在' })
      else if (sha256(join(source, file)) !== sha256(join(target, file))) {
        diffs.push({ entry: join(entry, file), kind: 'stale', detail: '内容与仓库文件不一致' })
      }
    }
    for (const file of targetFiles) {
      if (!sourceSet.has(file)) diffs.push({ entry: join(entry, file), kind: 'extra', detail: '安装副本中多出的文件' })
    }
    return diffs
  }
  return sha256(source) === sha256(target)
    ? []
    : [{ entry, kind: 'stale', detail: '内容与仓库文件不一致' }]
}

/** Whether a diff row belongs to an entry DSH actually loads. */
function isRuntimeDiff(diff) {
  return RUNTIME_ENTRIES.has(diff.entry.split(sep)[0])
}

function reportDiffs(diffs, sink) {
  for (const diff of diffs.slice(0, 20)) sink(`  - [${diff.kind}] ${diff.entry}（${diff.detail}）`)
  if (diffs.length > 20) sink(`  ... 另有 ${diffs.length - 20} 处差异`)
}

const profile = argValue('--profile') ?? ((process.env.DSH_PROFILE ?? '').trim() || 'web')
const dshHome = resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'))
const targetRoot = join(dshHome, 'profiles', profile, 'node_modules', pkg.name)
const checkOnly = process.argv.includes('--check')
const entries = syncEntries()

console.log(`来源：${repoRoot}`)
console.log(`目标：${targetRoot}`)

if (!existsSync(join(repoRoot, 'lib', 'index.js')) || !existsSync(join(repoRoot, 'lib', 'client.js'))) {
  console.error('错误：未找到构建产物 lib/index.js 与 lib/client.js，请先运行 pnpm build。')
  process.exit(1)
}
if (!existsSync(targetRoot) || !existsSync(join(targetRoot, 'package.json'))) {
  console.error(
    `错误：profile「${profile}」尚未安装 ${pkg.name}。\n` +
      `      请先运行：dsh plugin --profile ${profile} add file:${repoRoot}`,
  )
  process.exit(1)
}

if (checkOnly) {
  const diffs = entries.flatMap((entry) => compareEntry(entry, targetRoot))
  if (diffs.length === 0) {
    console.log(`校验通过：安装副本与仓库文件一致（${pkg.name}@${pkg.version}）。`)
    process.exit(0)
  }
  const runtimeDiffs = diffs.filter(isRuntimeDiff)
  if (runtimeDiffs.length > 0) {
    console.error(`校验失败：安装副本与仓库文件存在 ${diffs.length} 处差异，其中 ${runtimeDiffs.length} 处影响运行——DSH 加载的是旧代码。`)
    reportDiffs(runtimeDiffs, (line) => { console.error(line) })
    const cosmetic = diffs.filter((diff) => !isRuntimeDiff(diff))
    if (cosmetic.length > 0) {
      console.error(`  另有 ${cosmetic.length} 处非运行文件差异：`)
      reportDiffs(cosmetic, (line) => { console.error(line) })
    }
    console.error(`      运行 node scripts/sync-profile.mjs --profile ${profile} 同步后再重启 DSH。`)
    process.exit(1)
  }
  console.log(`校验通过：仅 ${diffs.length} 处非运行文件（文档 / 许可 / 源码）与仓库不同，不影响 DSH 运行。`)
  reportDiffs(diffs, (line) => { console.log(line) })
  console.log('  运行 pnpm run sync 可一并刷新这些文件。')
  process.exit(0)
}

for (const entry of entries) {
  const source = join(repoRoot, entry)
  const target = join(targetRoot, entry)
  const staging = `${target}.sync-tmp`
  try {
    if (statSync(source).isDirectory()) {
      // Replace a directory as a whole through a temporary sibling: the copy (the slow
      // part) completes while the live directory is still intact, so the swap is one
      // fast rename. pnpm may hardlink these files, hence remove-then-copy instead of
      // overwriting through a shared inode, which would write into the repository.
      rmSync(staging, { recursive: true, force: true })
      cpSync(source, staging, { recursive: true })
      rmSync(target, { recursive: true, force: true })
      renameSync(staging, target)
      console.log(`  已同步 ${entry}${sep}`)
    } else {
      // Plain overwrite keeps an existing hardlink to the repository alive — that link
      // is what makes cordis.patch.yml edits reach the copy without this script.
      copyFileSync(source, target)
      console.log(`  已同步 ${entry}`)
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    console.error(`错误：同步 ${entry} 失败（${error.code ?? error.message}）。`)
    console.error('      通常是 DSH 进程或编辑器仍占用安装副本中的文件：请完全退出 DSH 后重试。')
    console.error(`      若副本已被破坏，可用 dsh plugin --profile ${profile} add file:${repoRoot} 重新安装。`)
    process.exit(1)
  }
}

const remaining = entries.flatMap((entry) => compareEntry(entry, targetRoot))
if (remaining.length > 0) {
  console.error(`错误：同步后仍存在 ${remaining.length} 处差异，安装副本可能被占用。`)
  reportDiffs(remaining, (line) => { console.error(line) })
  process.exit(1)
}

console.log(`同步完成：${pkg.name}@${pkg.version} -> profile「${profile}」。`)
console.log('请重启 DSH 进程（宿主半边在启动时载入），然后硬刷新浏览器（Ctrl+F5）载入新的客户端 bundle。')
