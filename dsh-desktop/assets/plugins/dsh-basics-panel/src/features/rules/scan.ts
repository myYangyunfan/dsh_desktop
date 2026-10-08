/**
 * Rule-file discovery (host, pure functions): mirrors the authoritative
 * discovery of @deepseek-ai/dsh-agent-instructions — a fixed user-global
 * `AGENTS.md` under the harness home, plus the candidate instruction files on
 * the project-root-to-cwd directory chain. The panel never trusts a
 * client-supplied path: every read/save/create re-resolves candidates from
 * these functions, and the service re-checks the resolved path against the
 * freshly discovered set.
 *
 * Candidates mirror the DSH defaults:
 *   base:  AGENTS.md, CLAUDE.md
 *   local: AGENTS.local.md, CLAUDE.local.md
 *   project root marker: .git
 */
import { access } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

/** The fixed user-global rule file name (mirror of dsh-agent-instructions' USER_GLOBAL_FILE). */
export const RULES_GLOBAL_FILE = 'AGENTS.md'
/** Ordered base candidates per directory (highest precedence first). */
export const RULES_BASE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md']
/** Ordered local-overlay candidates per directory (loaded after the base files). */
export const RULES_LOCAL_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md']
/** Every candidate file the panel may create. */
export const RULES_ALL_CANDIDATES = [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES]
/** Directory entries that identify the project root while walking upward. */
export const RULES_ROOT_MARKERS = ['.git']

/** A rule file's scope group. */
export type RuleScope = 'global' | 'project'

/** A discovered rule file (path facts only, no content). */
export interface RuleFile {
  scope: RuleScope
  /** The file name within its directory (e.g. AGENTS.md). */
  fileName: string
  /** Absolute path on disk. */
  absolutePath: string
  /** User-facing path (e.g. ~/.dsh/AGENTS.md, or project-root-relative). */
  displayPath: string
  /** The directory that holds the file. */
  directory: string
}

/** Probe whether a path exists on the host filesystem. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Walk upward from `cwd` to the first directory containing a root marker.
 * @returns the discovered project root, or `cwd` itself when no marker exists.
 */
export async function findProjectRoot(
  cwd: string,
  markers: readonly string[] = RULES_ROOT_MARKERS,
  exists: (path: string) => Promise<boolean> = fileExists,
): Promise<string> {
  let dir = resolve(cwd)
  for (;;) {
    for (const marker of markers) {
      if (await exists(join(dir, marker))) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return resolve(cwd)
    dir = parent
  }
}

/**
 * Build the inclusive root-to-cwd directory chain.
 * @param root - project root directory.
 * @param cwd - most-specific directory in the chain.
 * @returns directories ordered from broadest (root) to most specific (cwd).
 */
export function ancestorChain(root: string, cwd: string): string[] {
  const chain: string[] = []
  let dir = resolve(cwd)
  const rootResolved = resolve(root)
  for (;;) {
    chain.unshift(dir)
    if (dir === rootResolved) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return chain
}

/**
 * Discover every existing rule file for a session cwd: the user-global file
 * first, then the root-to-cwd chain candidates.
 * @param options - cwd, harness home, display form of the home (e.g. `~/.dsh`), probe.
 * @returns discovered files in precedence order (global first, then broadest→most specific).
 */
export async function discoverRuleFiles(options: {
  cwd: string
  dshHome: string
  /** Display form of the harness home (e.g. `~/.dsh`); defaults to the raw home. */
  displayHome?: string
  /** Pre-resolved project root (skips the upward marker walk). */
  projectRoot?: string
  exists?: (path: string) => Promise<boolean>
}): Promise<RuleFile[]> {
  const exists = options.exists ?? fileExists
  const displayHome = options.displayHome ?? options.dshHome
  const files: RuleFile[] = []

  const globalPath = join(options.dshHome, RULES_GLOBAL_FILE)
  if (await exists(globalPath)) {
    files.push({
      scope: 'global',
      fileName: RULES_GLOBAL_FILE,
      absolutePath: globalPath,
      // 展示路径统一用正斜杠（与 DSH 的 ~/.dsh/AGENTS.md 展示一致）。
      displayPath: `${displayHome.replaceAll('\\', '/')}/${RULES_GLOBAL_FILE}`,
      directory: options.dshHome,
    })
  }

  const cwd = resolve(options.cwd)
  const root = options.projectRoot ?? await findProjectRoot(cwd, RULES_ROOT_MARKERS, exists)
  for (const dir of ancestorChain(root, cwd)) {
    for (const candidate of [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES]) {
      const absolutePath = join(dir, candidate)
      if (await exists(absolutePath)) {
        files.push({
          scope: 'project',
          fileName: candidate,
          absolutePath,
          displayPath: relative(root, absolutePath).replaceAll('\\', '/'),
          directory: dir,
        })
      }
    }
  }
  return files
}

/** Where a new rule file may be created. */
export type RuleCreateScope = 'global' | 'project' | 'cwd'

/** The resolved target of a create request. */
export interface RuleCreateTarget {
  scope: RuleScope
  fileName: string
  absolutePath: string
  displayPath: string
  directory: string
}

/**
 * Resolve the target path of a create request against the allowlist.
 * @returns the resolved target, or undefined when the scope/file combo is not allowed.
 *   - `global` allows only AGENTS.md under the harness home;
 *   - `project` places the file at the project root;
 *   - `cwd` places the file at the current working directory.
 */
export async function createRulePath(options: {
  cwd: string
  dshHome: string
  displayHome?: string
  scope: RuleCreateScope
  fileName: string
  exists?: (path: string) => Promise<boolean>
}): Promise<RuleCreateTarget | undefined> {
  const { scope, fileName } = options
  if (!RULES_ALL_CANDIDATES.includes(fileName)) return undefined
  const displayHome = options.displayHome ?? options.dshHome
  const exists = options.exists ?? fileExists

  if (scope === 'global') {
    if (fileName !== RULES_GLOBAL_FILE) return undefined
    return {
      scope: 'global',
      fileName,
      absolutePath: join(options.dshHome, fileName),
      displayPath: `${displayHome.replaceAll('\\', '/')}/${fileName}`,
      directory: options.dshHome,
    }
  }

  if (scope === 'cwd') {
    const directory = resolve(options.cwd)
    return {
      scope: 'project',
      fileName,
      absolutePath: join(directory, fileName),
      displayPath: fileName,
      directory,
    }
  }

  const directory = await findProjectRoot(resolve(options.cwd), RULES_ROOT_MARKERS, exists)
  return {
    scope: 'project',
    fileName,
    absolutePath: join(directory, fileName),
    displayPath: fileName,
    directory,
  }
}

/** The starter content written for a newly created rule file. */
export function ruleTemplate(fileName: string): string {
  return `# ${fileName}

此文件由 dsh-basics-panel 创建，作为 DSH 的规则/指令文件加载。

> 作用域内规则适用于该作用域的所有会话；直接用户指令优先于一切指令。

## 规则

1.
`
}
