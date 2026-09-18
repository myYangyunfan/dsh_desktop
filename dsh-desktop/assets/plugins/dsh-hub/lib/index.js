/**
 * dsh-hub — host half（整合插件中枢：更新引擎 + 全局记忆 + graph-memory 挂载 + 市场检测）。
 *
 * 由 dsh-plugin-updates 0.2.3 引擎与 dsh-hub 0.1.0 增量合并而成：
 *  1. 插件更新引擎（原 dsh-plugin-updates）：版本对比 / 一键更新 / 启停 / 卸载 /
 *     客户端配套插件更新 / Desktop 核心包检查 / 启动自检自动修复（repairAll）
 *  2. 全局记忆（原 dsh-memory 的 5 个 memory_* 工具，数据路径不变）
 *  3. graph-memory 检测与自动装配（plugin-src 有源码且未装配时自动写入
 *     profile bundle + link + junction；已装配则只读状态与 SQLite 统计）
 *  4. dsh-community-market 检测：已装 → 状态；未装 → 设置页提醒安装
 *  5. 自身更新检查：读 GitHub 仓库 package.json 的 version 对比本地版本
 *     （raw.githubusercontent + jsDelivr CDN 双源，规避 GitHub API 限流 403）
 *
 * Remote 服务 `dshHub` 暴露给客户端设置页（10 个方法）：
 *   - status():            总览（插件列表 / Desktop / 客户端插件 / 记忆 / 图谱 / 市场 / 自更新）
 *   - checkNow():          立即全量检查插件更新
 *   - update(name):        更新单个插件（registry pnpm / GitHub 本地源码镜像下载）
 *   - updateAll():         批量更新 registry 插件
 *   - uninstall(name):     卸载插件（含 bundle 与 patch 清理）
 *   - setEnabled(name,enabled): 启停插件
 *   - updateAssetPlugin(name):  更新 Desktop 客户端配套插件
 *   - mountGraphMemory():  手动触发 graph-memory 装配（幂等）
 *   - checkUpdate():       立即检查自身更新
 *   - repairNow():         手动触发启动自检修复
 *
 * 每次宿主进程启动自动执行：启动自检修复（~0.6s）→ 插件更新检查 + graph-memory
 * 自动装配检查 + 自身更新检查（~1.5s）。
 *
 * 维护铁律（沿用 dsh-plugin-updates 手册）：
 *  - 新增 Remote 方法必须同步三处：本文件 methods 列表、lib/typert.js、
 *    lib/client.js 的 REMOTE.descriptors；
 *  - profile package.json / cordis.patch.yml 一律经 writeTextSafe() 原子写入；
 *  - 不改动 graph-memory 与 dsh-market 本体：只做检测、装配与展示（挂载）；
 *  - lib/typert.js 不可删除（否则 RPC 404）；
 *  - 进 shell 的包名必须过 validName/isValidName 白名单；
 *  - curl 必须 shell:false + -f + --ssl-no-revoke（Windows）；
 *  - reconcileBundles 只处理 dependencies 里读得到 package.json 的名字（不变量 #10）。
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import path from 'node:path'
import { symlinkSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { memoryTools, loadRecords, memoryPath } from './memory-core.js'
const PROFILE_NAME = 'web'
const CACHE_FILE = '.plugin-updates.json'
const CACHE_STALE_MS = 12 * 60 * 60 * 1000 // 缓存超过 12 小时视为过期
const CHECK_START_DELAY_MS = 1500          // 启动后稍等再检查，不挤占启动
const REPAIR_START_DELAY_MS = 600          // 启动自检修复：先于更新检查运行
const VIEW_TIMEOUT_MS = 20 * 1000          // 单包查最新版本超时
const MUTATE_TIMEOUT_MS = 5 * 60 * 1000    // 更新/卸载超时
const GITHUB_TIMEOUT_MS = 15 * 1000        // 单仓库查最新 release/tag 超时
const DOWNLOAD_TIMEOUT_MS = 120 * 1000     // 镜像下载源码包超时
const OUTPUT_CAP = 65536
const LATEST_CONCURRENCY = 6              // 单发兜底查询的并发
const GITHUB_CONCURRENCY = 6              // GitHub API 单次请求成本低，匿名限额按小时计，无需压到 2
const GITHUB_CACHE_TTL_MS = 10 * 60 * 1000
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000 // registry <pkg>/latest 清单的进程内缓存
const REGISTRY_BATCH_SIZE = 8             // 单个 curl 进程一次拉的 URL 数（同主机请求共用连接，大幅提速）
const REGISTRY_BATCH_PARALLEL = 3         // 同时跑的批数
const BACKUP_KEEP_MS = 7 * 24 * 60 * 60 * 1000  // 崩溃遗留备份的保留时长
const IS_WIN = process.platform === 'win32'     // 跨平台：外部命令名按系统选择
const CURL_BIN = IS_WIN ? 'curl.exe' : 'curl'   // Windows 用系统自带 curl.exe；unix 用 PATH 里的 curl
const TAR_BIN = IS_WIN ? 'tar.exe' : 'tar'      // Windows/macOS 的 tar 是 bsdtar（支持 zip）；Linux 是 GNU tar（不支持 zip）

/** Desktop 客户端插件更新时必须保留的加载/装配文件（新源码缺失时从旧目录补回）。 */
const ASSET_PLUGIN_PRESERVE = ['dsh.plugin.json', 'cordis.patch.yml']

/** 国内 GitHub 镜像（按顺序尝试，ghfast.top 实测可用）。 */
const GITHUB_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
]

/**
 * Security hardening 2026-09 (audit findings H-01 / H-02 / H-14).
 *
 * A source archive fetched from one of the mirrors above is anonymous
 * third-party bytes: the mirror can swap the payload, and it explicitly makes
 * no integrity promise. Every downloaded archive is therefore anchored:
 *
 *   1. a pinned sha256 for `<owner>/<repo>@<ref>` is always enforced when one
 *      exists — see `plugin-source-pins.json` in the profile directory, or the
 *      `DSH_HUB_SOURCE_PINS` env var (a JSON object with the same shape);
 *   2. for immutable refs (a tag or a commit SHA — never a branch) the sha256
 *      of the first successful OFFICIAL codeload download is remembered
 *      (trust-on-first-use) and any later mirror download of that same ref must
 *      match it;
 *   3. a mirror download with no anchor at all is refused unless the operator
 *      explicitly opts in with `DSH_HUB_ALLOW_UNVERIFIED_MIRROR=1`.
 *
 * This mirrors the fail-closed policy already implemented by
 * `scripts/plugin-core/lib/updates.js`, which refuses an update without a
 * sha512 from the registry.
 */
const SOURCE_PINS_FILE = 'plugin-source-pins.json'
const SOURCE_PINS_ENV = 'DSH_HUB_SOURCE_PINS'
const ALLOW_UNVERIFIED_MIRROR_ENV = 'DSH_HUB_ALLOW_UNVERIFIED_MIRROR'
/** Immutable git refs only: 40-hex commit SHA, or a version-like tag. */
const IMMUTABLE_REF_RE = /^(?:[0-9a-f]{40}|v?\d+\.\d+[0-9A-Za-z.+-]*)$/i
/** Install-time lifecycle hooks that must never run from a downloaded archive. */
const INSTALL_TIME_HOOKS = ['preinstall', 'install', 'postinstall']
/** Windows reserved device names (mirrors plugin-core/lib/updates.js). */
const WINDOWS_RESERVED_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
/**
 * Env keys a package manager legitimately needs (network plumbing included, so
 * proxied setups keep working). Everything else is dropped before running
 * downloaded code, so the user's API keys and registry tokens are not inherited
 * by an attacker-declared `prepare` or `build`.
 */
const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'windir', 'COMSPEC', 'ComSpec', 'PATHEXT',
  'TEMP', 'TMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'USER', 'USERNAME', 'LOGNAME',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SHELL', 'PWD', 'OS', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'HOMEDRIVE',
  'HOMEPATH', 'DSH_HOME', 'PNPM_HOME', 'COREPACK_HOME',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'NODE_PATH',
  // Network plumbing a package manager or curl legitimately needs.
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE',
]
/** Key names that look like secrets: never inherited by download/build children. */
const SECRET_ENV_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE)/i

/** 客户端安装目录候选（DSH Desktop 等；可用 DSH_CLIENT_APP_DIR 覆盖/追加）。 */
const DESKTOP_APP_DIRS = [
  ...(process.env.DSH_CLIENT_APP_DIR ? [String(process.env.DSH_CLIENT_APP_DIR).trim()] : []),
  join(process.env.LOCALAPPDATA || '', 'Programs', 'DSH Desktop', 'resources', 'app'),
  'C:\\Users\\OwO\\AppData\\Local\\Programs\\DSH Desktop\\resources\\app',
  // 常见自定义安装位置（D:\app\dsh 是 DSH Desktop 社区常见安装目录）
  'D:\\app\\dsh\\DSH Desktop\\resources\\app',
  // macOS（Electron 应用资源目录；打包成 asar 时读不到 package.json，自动跳过）
  '/Applications/DSH Desktop.app/Contents/Resources/app',
  join(homedir(), 'Applications', 'DSH Desktop.app', 'Contents/Resources', 'app'),
  // Linux（deb/AppImage 常见安装位置）
  '/usr/lib/dsh-desktop/resources/app',
  '/opt/dsh-desktop/resources/app',
  '/opt/DSH Desktop/resources/app',
]

/**
 * DSH Desktop 客户端官方仓库（GitHub 源 myYangyunfan/dsh_desktop；Gitee 为国内镜像）。
 * 与 Desktop 内置 client-updater.js 的 DEFAULT_REPOS 保持一致。
 */
const GITHUB_CLIENT_REPO = 'myYangyunfan/dsh_desktop'
const GITEE_CLIENT_REPO = 'my-yang-yunfan/dsh_desktop'
const GITEE_CLIENT_RELEASES_URL = `https://gitee.com/${GITEE_CLIENT_REPO}/releases`

/**
 * 开发者识别：可选的开发者 GitHub 用户名。
 * 通过环境变量 DSH_PLUGIN_DEV_GITHUB 配置（只用于识别，不读取任何本机信息）。
 * 若某个插件的 GitHub 来源 owner 匹配该用户名，会在 UI 上标记为“开发者”插件。
 */
const DEVELOPER_GITHUB = String(
  process.env.DSH_PLUGIN_DEV_GITHUB || process.env.DSH_PLUGIN_DEVELOPER || ''
).trim().replace(/^@/, '').toLowerCase()

/** 宿主目录：优先 $DSH_HOME，回退 ~/.dsh（与 dsh 自身一致）。 */
function homeDir() {
  const env = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return env !== '' ? env.replace(/[\\/]+$/, '') : join(homedir(), '.dsh')
}

function profileDir() {
  return join(homeDir(), 'profiles', PROFILE_NAME)
}

function manifestPath() {
  return join(profileDir(), 'package.json')
}

function patchPath() {
  return join(profileDir(), 'cordis.patch.yml')
}

function cachePath() {
  return join(profileDir(), CACHE_FILE)
}

/** profile 里已安装包的解析目录（scoped 包按 / 拆开）。 */
function packageDir(name) {
  return join(profileDir(), 'node_modules', ...name.split('/'))
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 原子落盘：先写 .tmp，留一份 .bak，再替换目标文件。
 * cordis.patch.yml 和 profile package.json 是 DSH 启动必需文件，直接 writeFileSync
 * 写一半崩溃/断电会损坏它们导致服务起不来；这样写最坏情况留下一对可恢复的副本。
 */
function writeTextSafe(path, text) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text, 'utf8')
  try { copyFileSync(path, `${path}.bak`) } catch {}
  try { rmSync(path, { force: true }) } catch {}
  renameSync(tmp, path)
}

function writeJson(path, value) {
  writeTextSafe(path, JSON.stringify(value, null, 2) + '\n')
}

/** 跑一个 pnpm/npm/curl 命令（默认在 profile 目录，可用 options.cwd 指定目录），收集受限输出。 */
function runCli(command, args, timeoutMs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? profileDir(),
      env: options.env ?? sanitizedEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options.shell ?? process.platform === 'win32',
    })
    const out = { stdout: '', stderr: '' }
    const feed = (key) => (chunk) => {
      const text = chunk.toString()
      const keep = OUTPUT_CAP - out[key].length
      if (keep > 0) out[key] += text.slice(0, keep)
    }
    child.stdout.on('data', feed('stdout'))
    child.stderr.on('data', feed('stderr'))
    let settled = false
    const settle = (value) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      settle({ code: null, stdout: out.stdout, stderr: out.stderr, timedOut: true, error: '命令执行超时' })
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      settle({ code: null, stdout: out.stdout, stderr: out.stderr, error: String((error && error.message) || error) })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      settle({ code, stdout: out.stdout, stderr: out.stderr })
    })
  })
}

function runPnpm(args) {
  return runCli('pnpm', args, MUTATE_TIMEOUT_MS)
}

function cliFailure(run, verb) {
  return (run.error || run.stderr || run.stdout || `pnpm ${verb} 失败 (exit ${run.code})`).trim().slice(0, 800)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** pnpm 在 Windows 上偶发非零退出但操作实际成功：最多重试一次，以最终状态为准。 */
async function runMutate(args) {
  let run = await runPnpm(args)
  if (run.code !== 0) {
    await sleep(800)
    run = await runPnpm(args)
  }
  return run
}

/**
 * 串行化所有会改动 profile 的写操作（pnpm / cordis.patch.yml / 备份目录）。
 * 设置页可以同时对多个插件点「更新/卸载」，并发 pnpm 会互相踩踏 lockfile 与安装状态；
 * 排队执行保证任一时刻只有一个写操作在跑（单个失败不阻断后续排队的操作）。
 */
let mutationQueue = Promise.resolve()
function runMutuallyExclusive(task) {
  const run = mutationQueue.then(task)
  mutationQueue = run.then(() => {}, () => {})
  return run
}

/** 依赖规格分类：本地链接 / git 源 / registry。 */
function classifySpec(spec) {
  const text = String(spec ?? '').trim()
  if (/^(?:link|file):/i.test(text) || /^\.{1,2}(?:[\\/]|$)/.test(text)) return 'local'
  if (/^(?:github:|git\+|git:|https?:\/\/)/i.test(text)) return 'git'
  return 'registry'
}

// --- GitHub 来源识别（本地 link 插件：repository 字段 / .git/config） ---

/** 从一个 URL/规格字符串里解析 owner/repo（支持常见 GitHub 形式）。 */
function parseGithubOwnerRepo(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  // 形式一：github.com/owner/repo 或 git@github.com:owner/repo
  let match = text.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/]|$)/i)
  // 形式二：github:owner/repo 或 owner/repo（但不能把 github.com 本身当 owner）
  if (!match) match = text.match(/^(?!github\.com[/:])(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/]|$)/i)
  if (!match) return null
  const [, owner, repo] = match
  if (!owner || !repo || owner.toLowerCase() === 'github.com' || repo.includes('..')) return null
  return { owner, repo }
}

/** 从 .git/config 里解析 [remote "origin"] 的 url。 */
function originFromGitConfig(realDir) {
  const p = join(realDir, '.git', 'config')
  let text
  try {
    text = readFileSync(p, 'utf8')
  } catch {
    return null
  }
  const remote = text.match(/\[remote\s+"([^"]+)"\][\s\S]*?url\s*=\s*(\S+)/)
  if (!remote) return null
  const url = remote[2]
  if (!/github\.com/i.test(url)) return null
  return parseGithubOwnerRepo(url)
}

/** 从插件目录 README 里提取 GitHub 仓库链接（兜底线索）。 */
function githubFromReadme(realDir) {
  const names = ['README.md', 'README.MD', 'readme.md', 'README.txt', 'readme.txt']
  for (const name of names) {
    const p = join(realDir, name)
    if (!existsSync(p)) continue
    let text
    try {
      text = readFileSync(p, 'utf8')
    } catch {
      continue
    }
    const match = text.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/)\s]|$)/i)
    if (match) return parseGithubOwnerRepo(match[0])
  }
  return null
}

/**
 * 识别一个本地 link 插件对应的 GitHub 仓库（本地线索）。
 * 顺序：package.json repository → homepage/bugs → 源码目录 .git/config → README 链接。
 * @returns {{ owner, repo } | null}
 */
function resolveGithubRepo(name) {
  let pkgPath = join(packageDir(name), 'package.json')
  const pkg = readJson(pkgPath) ?? {}
  let realDir = null
  try {
    realDir = realpathSync(packageDir(name))
    pkgPath = join(realDir, 'package.json')
  } catch {
    // 目录不存在/不是链接时退回 node_modules 相对路径
  }
  const fresh = realDir !== null ? (readJson(pkgPath) ?? pkg) : pkg

  const candidates = []
  if (fresh.repository && typeof fresh.repository === 'object') candidates.push(fresh.repository.url)
  if (fresh.repository && typeof fresh.repository === 'string') candidates.push(fresh.repository)
  if (typeof fresh.homepage === 'string') candidates.push(fresh.homepage)
  if (fresh.bugs && typeof fresh.bugs === 'object' && typeof fresh.bugs.url === 'string') candidates.push(fresh.bugs.url)
  for (const value of candidates) {
    if (!/github\.com/i.test(String(value ?? ''))) continue
    const parsed = parseGithubOwnerRepo(value)
    if (parsed) return parsed
  }
  if (realDir !== null) {
    const fromGit = originFromGitConfig(realDir)
    if (fromGit) return fromGit
    const fromReadme = githubFromReadme(realDir)
    if (fromReadme) return fromReadme
  }
  return null
}

/**
 * 识别本地 link 插件的 GitHub 仓库（本地线索失败后，回退到 npm registry 上同名包的 repository/homepage）。
 * 这能救活像 dsh-advisor 这种源码里没写仓库信息、但已发布到 npm 的插件。
 */
async function resolveGithubRepoAsync(name) {
  const local = resolveGithubRepo(name)
  if (local) return local
  if (!isValidName(name)) return null
  // 快路径：registry 清单一次拿到 repository/homepage
  const manifest = await queryRegistryManifest(name)
  if (manifest !== null) return githubFromManifest(manifest)
  // 慢路径回退：npm view 逐字段查
  for (const field of ['repository.url', 'homepage']) {
    const run = await runCli('npm', ['view', name, field, '--json'], VIEW_TIMEOUT_MS)
    if (run.code !== 0) continue
    try {
      const value = JSON.parse(run.stdout)
      if (typeof value === 'string') {
        const parsed = parseGithubOwnerRepo(value)
        if (parsed) return parsed
      }
    } catch {
      // 忽略解析失败
    }
  }
  return null
}

/** 去掉版本号前导 v，只用于判断是否有更新；显示时保留原样。 */
function stripLeadingV(value) {
  return String(value ?? '').replace(/^[vV]/, '')
}

/** 规范化版本：主.次.修订 缺位补 0；带预发布/构建元数据时保留字符串部分。 */
function normalizeVersion(value) {
  const text = stripLeadingV(value).trim()
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?([-+].*)?$/)
  if (!match) return text
  const [, major, minor = '0', patch = '0', suffix = ''] = match
  return `${major}.${minor}.${patch}${suffix}`
}

/** 解析版本为 [数字三元组, suffix]；非数字版本返回 null。 */
function parseVersion(value) {
  const text = stripLeadingV(value).trim()
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)([-+].*)?$/)
  if (!match) return null
  return {
    nums: [Number(match[1]), Number(match[2]), Number(match[3])],
    suffix: match[4] ?? '',
  }
}

/**
 * 比较两个版本：-1 = a < b，0 = 相等，1 = a > b。
 * 缺位补 0；预发布（-xxx）低于正式版；构建元数据（+xxx）忽略。
 */
function versionCompare(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === null || pb === null) {
    const na = normalizeVersion(a)
    const nb = normalizeVersion(b)
    return na < nb ? -1 : na > nb ? 1 : 0
  }
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1
  }
  const aPre = pa.suffix.startsWith('-')
  const bPre = pb.suffix.startsWith('-')
  if (aPre !== bPre) return aPre ? -1 : 1
  if (!aPre && !bPre) return 0 // 两个都是 build metadata，忽略
  return comparePrerelease(pa.suffix, pb.suffix)
}

/**
 * semver 预发布段比较：按点分段，数字段按数值比较（alpha.10 > alpha.9）、
 * 数字标识低于字母标识、其余按字典序；段数少者更小（1.0.0-alpha < 1.0.0-alpha.1）。
 */
function comparePrerelease(a, b) {
  const ai = a.slice(1).split('.')
  const bi = b.slice(1).split('.')
  for (let i = 0; i < Math.max(ai.length, bi.length); i++) {
    const x = ai[i]
    const y = bi[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xd = /^\d+$/.test(x)
    const yd = /^\d+$/.test(y)
    if (xd && yd) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (xd !== yd) {
      return xd ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** 判断两个版本是否等价：去 v、补位后再比较（semver 友好）。 */
function versionsEqual(a, b) {
  return versionCompare(a, b) === 0
}

/** latest 是否严格大于 current（有真正的新版本）。 */
function hasNewerVersion(latest, current) {
  return latest !== null && versionCompare(latest, current) > 0
}

// --- GitHub 最新版本查询（release 优先，无 release 回退最新 tag） ---

/** HTTPS 请求走系统 curl（Windows 自带 curl.exe；部分机器 Node fetch 会因证书链/吊销检查失败）。
 *  --ssl-no-revoke 只对 Windows 的 schannel 后端有意义且必要，unix 构建不传。 */
async function runCurl(url, timeoutMs) {
  const args = [
    '-sS', '-f', '--max-time', String(Math.ceil(timeoutMs / 1000)),
    ...(IS_WIN ? ['--ssl-no-revoke'] : []),
    '-H', 'User-Agent: dsh-plugin-updates', '-H', 'Accept: application/vnd.github+json', url,
  ]
  return runCli(CURL_BIN, args, timeoutMs, { shell: false })
}

/** 进程内 GitHub 查询缓存（成功/失败都缓存，避免 60 req/h 匿名限流）。 */
const githubCache = new Map()

async function queryGithubTag(owner, repo) {
  const key = `${owner}/${repo}`
  const hit = githubCache.get(key)
  if (hit && Date.now() - hit.at < GITHUB_CACHE_TTL_MS) return hit.value
  const value = await (async () => {
    try {
      const release = await runCurl(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, GITHUB_TIMEOUT_MS)
      if (release.code === 0) {
        const data = JSON.parse(release.stdout)
        if (typeof data.tag_name === 'string' && data.tag_name !== '') {
          return { tag: data.tag_name, hasRelease: true }
        }
      }
      const tags = await runCurl(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`, GITHUB_TIMEOUT_MS)
      if (tags.code === 0) {
        const list = JSON.parse(tags.stdout)
        if (Array.isArray(list) && list.length > 0 && typeof list[0].name === 'string' && list[0].name !== '') {
          return { tag: list[0].name, hasRelease: false }
        }
      }
      // GitHub API 限流（匿名 60 req/h）或不可达时，回退 jsDelivr 数据接口（CDN，镜像了各仓库 tag 列表，无限流）。
      // 注意：jsDelivr 返回的版本列表顺序不可靠，必须用 versionCompare 挑最大值，不能取末位。
      const cdn = await runCurl(`https://data.jsdelivr.com/v1/package/gh/${owner}/${repo}`, GITHUB_TIMEOUT_MS)
      if (cdn.code === 0) {
        const data = JSON.parse(cdn.stdout)
        const versions = Array.isArray(data?.versions) ? data.versions : (Array.isArray(data?.tags) ? data.tags : [])
        let best = null
        for (const item of versions) {
          if (typeof item !== 'string' || item === '') continue
          if (best === null || versionCompare(item, best) > 0) best = item
        }
        if (best !== null) {
          return { tag: best, hasRelease: false }
        }
      }
    } catch {
      // 网络失败或 JSON 解析失败：当作查不到，不拖垮整次检查
    }
    return null
  })()
  githubCache.set(key, { at: Date.now(), value })
  return value
}

/** 进程内 Gitee release 查询缓存（成功/失败都缓存，避免匿名限流）。 */
const giteeCache = new Map()
/** 进程内 GitHub 客户端 release 查询缓存（api.github.com 匿名 60 req/h 限流）。 */
const githubReleaseCache = new Map()

/**
 * 查询 DSH Desktop 客户端的 Gitee 官方最新 release（与 Desktop 内置 client-updater.js
 * 同款端点 https://gitee.com/api/v5/repos/{owner}/{repo}/releases/latest，国内可达）。
 * 返回 { latest, htmlUrl }（latest 已去 v 前缀）；失败/限流返回 null（静默跳过，不阻塞检查）。
 */
async function queryGiteeRelease() {
  const key = 'client'
  const hit = giteeCache.get(key)
  if (hit && Date.now() - hit.at < GITHUB_CACHE_TTL_MS) return hit.value
  const value = await (async () => {
    try {
      const run = await runCurl(`https://gitee.com/api/v5/repos/${GITEE_CLIENT_REPO}/releases/latest`, GITHUB_TIMEOUT_MS)
      if (run.code !== 0) return null
      const data = JSON.parse(run.stdout)
      const tag = String(data.tag_name || data.tag || data.name || '').trim().replace(/^v/i, '')
      if (tag === '') return null
      const htmlUrl = String(data.html_url || '').trim() || GITEE_CLIENT_RELEASES_URL
      return { latest: tag, htmlUrl }
    } catch {
      return null
    }
  })()
  giteeCache.set(key, { at: Date.now(), value })
  return value
}

/** 查询 DSH Desktop 客户端的 GitHub 官方最新 release（内置同款端点；403 限流时返回 null）。 */
async function queryGithubRelease() {
  const key = 'client'
  const hit = githubReleaseCache.get(key)
  if (hit && Date.now() - hit.at < GITHUB_CACHE_TTL_MS) return hit.value
  const value = await (async () => {
    try {
      const run = await runCurl(`https://api.github.com/repos/${GITHUB_CLIENT_REPO}/releases/latest`, GITHUB_TIMEOUT_MS)
      if (run.code !== 0) return null
      const data = JSON.parse(run.stdout)
      const tag = String(data.tag_name || '').trim().replace(/^v/i, '')
      if (tag === '') return null
      const htmlUrl = String(data.html_url || '').trim() || null
      return { latest: tag, htmlUrl }
    } catch {
      return null
    }
  })()
  githubReleaseCache.set(key, { at: Date.now(), value })
  return value
}

/**
 * 双源查询 DSH Desktop 客户端最新 release（GitHub + Gitee，与内置 client-updater.js
 * 语义一致：取版本最高的可用源；GitHub 限流失败时 Gitee 兜底，反之亦然）。
 * 返回 { source, latest, htmlUrl, updateable } | null（两源均失败时为 null）。
 */
async function queryClientRelease(appVersion) {
  const [gitee, github] = await Promise.all([queryGiteeRelease(), queryGithubRelease()])
  const candidates = [
    gitee ? { source: 'gitee', ...gitee } : null,
    github ? { source: 'github', ...github } : null,
  ].filter(Boolean)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => versionCompare(b.latest, a.latest))
  const best = candidates[0]
  return {
    source: best.source,
    latest: best.latest,
    htmlUrl: best.htmlUrl,
    updateable: hasNewerVersion(best.latest, appVersion),
  }
}

/** 当前已安装（profile package.json dependencies）的插件快照。 */
function depsSnapshot() {
  const manifest = readJson(manifestPath()) ?? {}
  const dependencies = manifest.dependencies ?? {}
  const bundles = manifest.dsh?.profile?.bundles ?? []
  return Object.keys(dependencies).map((name) => {
    const pkg = readJson(join(packageDir(name), 'package.json')) ?? {}
    return {
      name,
      spec: String(dependencies[name] ?? ''),
      source: classifySpec(dependencies[name] ?? ''),
      current: typeof pkg.version === 'string' ? pkg.version : '',
      description: typeof pkg.description === 'string' ? pkg.description : '',
      isBundle: pkg.dsh?.bundle?.patch !== undefined,
      inBundles: bundles.includes(name),
    }
  })
}

/** 已解析的 npm registry 地址（进程内只解析一次，并发调用共享同一个 Promise）。 */
let registryBasePromise = null

/** 从 .npmrc 读 registry= 行（profile 目录与用户目录各看一次），不打 npm 进程；兼容带引号的值。 */
function registryFromNpmrc() {
  for (const file of [join(profileDir(), '.npmrc'), join(homedir(), '.npmrc')]) {
    try {
      const match = readFileSync(file, 'utf8').match(/^\s*registry\s*=\s*(\S+)/m)
      if (match) return match[1].replace(/['"]/g, '').replace(/\/+$/, '')
    } catch {}
  }
  return null
}

/** 解析 npm registry 地址：优先 NPM_CONFIG_REGISTRY，其次 .npmrc（配了国内镜像就自动用镜像），回退官方源。 */
function npmRegistryBase() {
  if (registryBasePromise === null) {
    registryBasePromise = Promise.resolve().then(() => {
      const env = String(process.env.NPM_CONFIG_REGISTRY || '').trim().replace(/\/+$/, '')
      if (env !== '') return env
      return registryFromNpmrc() ?? 'https://registry.npmjs.org'
    })
  }
  return registryBasePromise
}

/** registry <pkg>/latest 清单缓存（成功/失败都缓存 5 分钟）。 */
const registryManifestCache = new Map()

/**
 * 用 curl 直连 registry 查 <pkg>/latest 清单：一次请求同时拿到 version/repository/homepage，
 * 比每次 spawn `npm view`（npm 进程启动就要约 0.5-1s）快得多。失败返回 null（调用方回退 npm view）。
 */
async function queryRegistryManifest(name) {
  if (!isValidName(name)) return null
  const hit = registryManifestCache.get(name)
  if (hit && Date.now() - hit.at < REGISTRY_CACHE_TTL_MS) return hit.value
  const value = await (async () => {
    try {
      const base = await npmRegistryBase()
      const run = await runCurl(`${base}/${encodeURIComponent(name)}/latest`, VIEW_TIMEOUT_MS)
      if (run.code !== 0) return null
      const data = JSON.parse(run.stdout)
      if (!data || typeof data !== 'object' || typeof data.version !== 'string') return null
      const repo = data.repository
      return {
        version: data.version,
        repository: typeof repo === 'string' ? repo : (repo && typeof repo === 'object' && typeof repo.url === 'string' ? repo.url : ''),
        homepage: typeof data.homepage === 'string' ? data.homepage : '',
      }
    } catch {
      return null
    }
  })()
  registryManifestCache.set(name, { at: Date.now(), value })
  return value
}

/** 从 registry 清单的 repository/homepage 字段解析 GitHub 仓库（识别不到返回 null）。 */
function githubFromManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object') return null
  for (const value of [manifest.repository, manifest.homepage]) {
    if (typeof value === 'string' && /github\.com/i.test(value)) {
      const parsed = parseGithubOwnerRepo(value)
      if (parsed) return parsed
    }
  }
  return null
}

/**
 * 批量拉 <pkg>/latest：一个 curl 进程 + `--parallel`（进程内并发、HTTP/2 多路复用），
 * 每个 URL 用 `-o` 写独立文件对齐（--parallel 的输出顺序没有保证）。
 * curl 过旧不支持 --parallel 时整批失败，返回 null 条目由调用方走单发兜底。
 */
async function registryLatestBatch(names) {
  const result = new Map()
  const valid = names.filter((name) => isValidName(name))
  const chunks = []
  for (let i = 0; i < valid.length; i += REGISTRY_BATCH_SIZE) chunks.push(valid.slice(i, i + REGISTRY_BATCH_SIZE))
  let cursor = 0
  const workers = Array.from({ length: Math.min(REGISTRY_BATCH_PARALLEL, Math.max(1, chunks.length)) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= chunks.length) return
      const chunk = chunks[index]
      const dir = mkdtempSync(join(tmpdir(), 'dsh-pu-batch-'))
      try {
        const base = await npmRegistryBase()
        const args = [
          '-sS', '-f', '--max-time', String(Math.ceil(VIEW_TIMEOUT_MS / 1000)),
          ...(IS_WIN ? ['--ssl-no-revoke'] : []),
          '--parallel',
        ]
        const files = chunk.map((name, i) => join(dir, `p${i}.json`))
        chunk.forEach((name, i) => args.push(`${base}/${encodeURIComponent(name)}/latest`, '-o', files[i]))
        const run = await runCli(CURL_BIN, args, VIEW_TIMEOUT_MS, { shell: false })
        // 0 = 全部成功；22 = 部分 URL 4xx/5xx（-f），其余文件仍有效；其它（如 curl 不支持 --parallel）按整批失败
        const usable = run.code === 0 || run.code === 22
        chunk.forEach((name, i) => {
          let manifest = null
          if (usable) {
            try {
              const data = JSON.parse(readFileSync(files[i], 'utf8'))
              if (data && typeof data === 'object' && typeof data.version === 'string') {
                const repo = data.repository
                manifest = {
                  version: data.version,
                  repository: typeof repo === 'string' ? repo : (repo && typeof repo === 'object' && typeof repo.url === 'string' ? repo.url : ''),
                  homepage: typeof data.homepage === 'string' ? data.homepage : '',
                }
              }
            } catch {}
          }
          result.set(name, manifest)
          registryManifestCache.set(name, { at: Date.now(), value: manifest })
        })
      } catch {
        for (const name of chunk) result.set(name, null)
      } finally {
        try { rmSync(dir, { recursive: true, force: true }) } catch {}
      }
    }
  })
  await Promise.all(workers)
  return result
}

/** 一组包名的最新版本：批量快路径 + 失败单发兜底（queryLatest 内部还有 npm view 回退）。 */
async function collectLatestFor(names) {
  const found = new Map()
  if (names.length === 0) return found
  const batch = await registryLatestBatch(names)
  const missing = []
  for (const name of names) {
    const manifest = batch.get(name) ?? null
    const match = manifest !== null ? String(manifest.version).trim().match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/) : null
    if (match) found.set(name, match[1])
    else missing.push(name)
  }
  let cursor = 0
  const workers = Array.from({ length: Math.min(LATEST_CONCURRENCY, Math.max(1, missing.length)) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= missing.length) return
      const name = missing[index]
      try {
        const latest = await queryLatest(name)
        if (latest !== null) found.set(name, latest)
      } catch {
        // 单包查询失败不拖垮整次检查
      }
    }
  })
  await Promise.all(workers)
  return found
}

/** 用 npm 查一个包的 registry 最新版本；查不到（未发布/私有）返回 null。 */
async function queryLatest(name) {
  // name 可能来自插件目录的 package.json/目录名（不可信输入），先过白名单再进 shell
  if (!isValidName(name)) return null
  // 快路径：curl 直连 registry 元数据（5 分钟缓存）
  const manifest = await queryRegistryManifest(name)
  const fast = manifest !== null ? String(manifest.version).trim().match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/) : null
  if (fast) return fast[1]
  // 慢路径回退：npm view（瞬时网络抖动重试一次，避免误显示"registry 上未发布"）
  let run = await runCli('npm', ['view', name, 'version'], VIEW_TIMEOUT_MS)
  if (run.code !== 0) {
    await sleep(400)
    run = await runCli('npm', ['view', name, 'version'], VIEW_TIMEOUT_MS)
  }
  if (run.code !== 0) return null
  const lines = String(run.stdout ?? '').trim().split(/\r?\n/)
  const match = lines[lines.length - 1].trim().match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
  return match ? match[1] : null
}

/** 并发受限地为所有 registry 依赖查 npm 最新版本（批量快路径 + 单发兜底）。 */
async function collectNpmLatest(deps) {
  const targets = deps.filter((dep) => dep.source === 'registry')
  return collectLatestFor(targets.map((dep) => dep.name))
}

/** 并发受限地为可识别 GitHub 来源的本地 link 插件与 git 源依赖查最新 release/tag。 */
async function collectGithubTags(deps) {
  // 来源识别（本地线索 + npm 回退）也可能有网络请求，与查询一样并发受限
  const locals = deps.filter((item) => item.source === 'local')
  const candidates = []
  let resolveCursor = 0
  const resolvers = Array.from({ length: Math.min(LATEST_CONCURRENCY, Math.max(1, locals.length)) }, async () => {
    while (true) {
      const index = resolveCursor++
      if (index >= locals.length) return
      const dep = locals[index]
      try {
        const repo = await resolveGithubRepoAsync(dep.name)
        if (repo) candidates.push({ dep, repo })
      } catch {
        // 单个识别失败不拖垮
      }
    }
  })
  await Promise.all(resolvers)
  // git 源依赖（github:owner/repo#branch 等）：直接从依赖规格解析仓库，展示最新版（更新仍手动）
  for (const dep of deps.filter((item) => item.source === 'git')) {
    const repo = parseGithubOwnerRepo(dep.spec)
    if (repo) candidates.push({ dep, repo })
  }
  const targets = candidates
  const found = new Map()
  let cursor = 0
  const workers = Array.from({ length: Math.min(GITHUB_CONCURRENCY, Math.max(1, targets.length)) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= targets.length) return
      const { dep, repo } = targets[index]
      try {
        const value = await queryGithubTag(repo.owner, repo.repo)
        found.set(dep.name, { repo, value })
      } catch {
        // 单仓库失败不拖垮整次检查
      }
    }
  })
  await Promise.all(workers)
  return found
}

/** 找到本机 DSH Desktop 应用的解包目录（找不到返回 null）。 */
function desktopAppDir() {
  for (const dir of DESKTOP_APP_DIRS) {
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return null
}

/** 扫描 DSH Desktop 内置 @deepseek-ai 核心包，与 npm 最新版对比（只读检查）。 */
async function collectDesktopCheck() {
  const appDir = desktopAppDir()
  if (appDir === null) return null
  const appManifest = readJson(join(appDir, 'package.json'))
  if (!appManifest) return null
  const declared = appManifest.dependencies ?? {}
  const scoped = Object.keys(declared)
    .filter((name) => name.startsWith('@deepseek-ai/'))
    .sort()
  const packages = scoped
    .map((name) => {
      const pkg = readJson(join(appDir, 'node_modules', ...name.split('/'), 'package.json')) ?? {}
      return {
        name,
        current: typeof pkg.version === 'string' ? pkg.version : String(declared[name] ?? '').replace(/^[\^~]/, ''),
        description: typeof pkg.description === 'string' ? pkg.description : '',
      }
    })
    .filter((entry) => entry.current !== '')
  const found = await collectLatestFor(packages.map((entry) => entry.name))
  // 原生适配 Gitee 版 DSH Desktop：双源（GitHub + Gitee）查客户端最新 release 并与本地
  // appVersion 对比——语义与内置 client-updater.js 一致（取版本最高的可用源）；两源均
  // 失败（如 GitHub 403 限流且 Gitee 不可达）时 clientUpdate 为 null，不影响其余检查。
  const appVersion = typeof appManifest.version === 'string' ? appManifest.version : ''
  const clientUpdate = await queryClientRelease(appVersion)
  return {
    appName: appManifest.productName || appManifest.name || 'dsh-desktop',
    appVersion,
    clientUpdate,
    packages: packages.map((entry) => {
      const latest = found.get(entry.name) ?? null
      return {
        ...entry,
        latest,
        updateable: hasNewerVersion(latest, entry.current),
      }
    }),
  }
}


/** GitHub 搜索识别缓存（避免重复请求/限流）。 */
const githubSearchCache = new Map()

/**
 * 自动识别：用 GitHub 搜索按包名找同名仓库，并验证其 package.json 的 name 是否匹配。
 * 只验证第一个候选（避免请求爆炸）；未认证限流/失败时静默返回 null。
 */
async function searchGithubRepoForName(name) {
  if (String(process.env.DSH_CLIENT_AUTO_SEARCH || '').trim() !== '1') return null // 默认关闭，避免扫描拖慢页面
  const key = 'search:' + name
  const hit = githubSearchCache.get(key)
  if (hit && Date.now() - hit.at < GITHUB_CACHE_TTL_MS) return hit.value
  const value = await (async () => {
    try {
      const shortName = String(name).includes('/') ? String(name).split('/').pop() : String(name)
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(shortName)}&per_page=5`
      const run = await runCurl(url, GITHUB_TIMEOUT_MS)
      if (run.code !== 0) return null
      const data = JSON.parse(run.stdout)
      const items = Array.isArray(data.items) ? data.items : []
      let best = null
      for (const item of items.slice(0, 5)) {
        if (!item || typeof item.full_name !== 'string') continue
        const full = item.full_name
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(full)) continue
        for (const branch of ['main', 'master']) {
          try {
            const rawUrl = `https://raw.githubusercontent.com/${full}/${branch}/package.json`
            const rawRun = await runCurl(rawUrl, GITHUB_TIMEOUT_MS)
            if (rawRun.code !== 0) continue
            const pkg = JSON.parse(rawRun.stdout)
            if (pkg && pkg.name === name) {
              const score = (Number(item.stargazers_count) || 0) - (item.fork === true ? 100000 : 0)
              if (best === null || score > best.score) {
                const [owner, repo] = full.split('/')
                best = { owner, repo, score }
              }
              break
            }
          } catch {}
        }
      }
      return best ? { owner: best.owner, repo: best.repo } : null
    } catch {
      return null
    }
  })()
  githubSearchCache.set(key, { at: Date.now(), value })
  return value
}
/** 客户端插件已知来源映射（本地副本没有 repository 字段时兜底；键为包名）。 */
const KNOWN_CLIENT_PLUGIN_REPOS = {
  '@dsh-external/dsh-vision': { owner: 'william-jin-cmu', repo: 'dsh-vision' },
}
/** 客户端插件目录（其它客户端可用 DSH_CLIENT_PLUGINS_DIR 指定；找不到返回 null 不报错）。 */
function clientPluginsDir() {
  if (process.env.DSH_CLIENT_PLUGINS_DIR) {
    const dir = String(process.env.DSH_CLIENT_PLUGINS_DIR).trim()
    return dir !== '' && existsSync(dir) ? dir : null
  }
  const appDir = desktopAppDir()
  if (!appDir) return null
  const dir = join(appDir, 'assets', 'plugins')
  return existsSync(dir) ? dir : null
}

/** 兼容旧名：客户端插件目录。 */
function assetsPluginsDir() {
  return clientPluginsDir()
}

/** 从任意插件目录解析 GitHub 来源（package.json / README / npm registry 回退）。 */
async function resolveRepoForAssetDir(dir, name) {
  const pkg = readJson(join(dir, 'package.json')) ?? {}
  const candidates = []
  if (pkg.repository && typeof pkg.repository === 'object') candidates.push(pkg.repository.url)
  if (pkg.repository && typeof pkg.repository === 'string') candidates.push(pkg.repository)
  if (typeof pkg.homepage === 'string') candidates.push(pkg.homepage)
  if (pkg.bugs && typeof pkg.bugs === 'object' && typeof pkg.bugs.url === 'string') candidates.push(pkg.bugs.url)
  for (const value of candidates) {
    if (!/github\.com/i.test(String(value ?? ''))) continue
    const parsed = parseGithubOwnerRepo(value)
    if (parsed) return parsed
  }
  const fromReadme = githubFromReadme(dir)
  if (fromReadme) return fromReadme
  // npm registry 回退（pkg.name 可能不可信，过白名单再进 shell）
  if (isValidName(name)) {
    // 快路径：registry 清单一次拿到 repository/homepage
    const manifest = await queryRegistryManifest(name)
    const fromManifest = githubFromManifest(manifest)
    if (fromManifest) return fromManifest
    // 慢路径回退：npm view 逐字段查
    if (manifest === null) {
      for (const field of ['repository.url', 'homepage']) {
        const run = await runCli('npm', ['view', name, field, '--json'], VIEW_TIMEOUT_MS)
        if (run.code !== 0) continue
        try {
          const value = JSON.parse(run.stdout)
          if (typeof value === 'string') {
            const parsed = parseGithubOwnerRepo(value)
            if (parsed) return parsed
          }
        } catch {}
      }
    }
  }
  // 已知来源映射兜底（本地副本缺少来源字段时）
  const known = KNOWN_CLIENT_PLUGIN_REPOS[name]
  if (known && known.owner && known.repo) return { owner: known.owner, repo: known.repo }
  // GitHub 自动搜索识别（验证仓库 package.json 的 name 后）
  return await searchGithubRepoForName(name)
}

/** 扫描 Desktop 作者配套插件（assets/plugins），与 GitHub/npm 最新版对比。 */
async function collectDesktopPlugins() {
  const base = assetsPluginsDir()
  if (!base) return null
  let dirs
  try {
    dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return null // 目录不可读（权限/被占用）时跳过该区块，不拖垮整次检查
  }
  const targets = dirs.map((d) => {
    const dir = join(base, d.name)
    const pkg = readJson(join(dir, 'package.json')) ?? {}
    return {
      name: pkg.name || d.name,
      current: typeof pkg.version === 'string' ? pkg.version : '',
      description: typeof pkg.description === 'string' ? pkg.description : '',
      dir,
    }
  }).filter((e) => e.current !== '')
  const found = new Map()
  let cursor = 0
  const workers = Array.from({ length: Math.min(GITHUB_CONCURRENCY, Math.max(1, targets.length)) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= targets.length) return
      const entry = targets[index]
      try {
        const repo = await resolveRepoForAssetDir(entry.dir, entry.name)
        let tag = null
        let hasRelease = false
        let npmLatest = null
        if (repo) {
          const gh = await queryGithubTag(repo.owner, repo.repo)
          if (gh) { tag = gh.tag; hasRelease = gh.hasRelease }
        }
        if (!tag) npmLatest = await queryLatest(entry.name)
        found.set(entry.name, { repo, tag, hasRelease, npmLatest })
      } catch {
        // 单个失败不拖垮
      }
    }
  })
  await Promise.all(workers)
  return targets.map((entry) => {
    const info = found.get(entry.name)
    const repo = info?.repo ?? null
    const latest = info?.tag ?? info?.npmLatest ?? null
    return {
      ...entry,
      latest,
      updateable: hasNewerVersion(latest, entry.current),
      github: repo === null ? null : {
        owner: repo.owner,
        repo: repo.repo,
        latestTag: info?.tag ?? null,
        htmlUrl: `https://github.com/${repo.owner}/${repo.repo}`,
        updateUrl: `https://github.com/${repo.owner}/${repo.repo}/${info?.hasRelease ? 'releases/latest' : 'tags'}`,
      },
    }
  })
}

/** 完整执行一次检查，返回可序列化的结果。四个收集阶段互不依赖，并行执行缩短总耗时。 */
async function collectCheck() {
  const deps = depsSnapshot()
  const [npmMap, githubMap, desktop, desktopPlugins] = await Promise.all([
    collectNpmLatest(deps),
    collectGithubTags(deps),
    collectDesktopCheck(),
    collectDesktopPlugins(),
  ])
  const insertMap = patchInsertMap()
  const disableIds = patchDisableIds()
  const entries = deps.map((dep) => {
    if (dep.source === 'registry') {
      const latest = npmMap.get(dep.name) ?? null
      return {
        ...dep,
        latest,
        updateable: hasNewerVersion(latest, dep.current),
      }
    }
    if (dep.source === 'local') {
      const github = githubMap.get(dep.name)
      const repo = github?.repo ?? null
      const tag = github?.value?.tag ?? null
      const hasRelease = github?.value?.hasRelease ?? false
      const latest = tag
      return {
        ...dep,
        latest,
        updateable: hasNewerVersion(tag, dep.current),
        github: repo === null ? null : {
          owner: repo.owner,
          repo: repo.repo,
          latestTag: tag,
          htmlUrl: `https://github.com/${repo.owner}/${repo.repo}`,
          updateUrl: `https://github.com/${repo.owner}/${repo.repo}/${hasRelease ? 'releases/latest' : 'tags'}`,
        },
      }
    }
    // git 源依赖（github:owner/repo#branch）：展示 GitHub 最新 tag 供参考，更新仍手动
    if (dep.source === 'git') {
      const github = githubMap.get(dep.name)
      const repo = github?.repo ?? null
      const tag = github?.value?.tag ?? null
      return {
        ...dep,
        latest: tag,
        updateable: false,
        github: repo === null ? null : {
          owner: repo.owner,
          repo: repo.repo,
          latestTag: tag,
          htmlUrl: `https://github.com/${repo.owner}/${repo.repo}`,
          updateUrl: `https://github.com/${repo.owner}/${repo.repo}/${(github?.value?.hasRelease ?? false) ? 'releases/latest' : 'tags'}`,
        },
      }
    }
    return { ...dep, latest: null, updateable: false }
  }).map((entry) => {
    const entryId = insertMap.get(entry.name) ?? null
    return {
      ...entry,
      entryId,
      enabled: entryId === null ? true : !disableIds.has(entryId),
      isDeveloper: DEVELOPER_GITHUB !== '' && entry.github !== null && entry.github.owner.toLowerCase() === DEVELOPER_GITHUB,
    }
  })
  return { checkedAt: Date.now(), entries, desktop, desktopPlugins }
}

/** 用 curl 下载文件到磁盘（走系统证书链；Windows 下跳过吊销检查）。 */
async function downloadFile(url, dest, timeoutMs = DOWNLOAD_TIMEOUT_MS, extraCurlArgs = []) {
  const args = [
    '-sS', '-fL', '--max-time', String(Math.ceil(timeoutMs / 1000)),
    ...(IS_WIN ? ['--ssl-no-revoke'] : []),
    ...extraCurlArgs,
    '-o', dest, url,
  ]
  const run = await runCli(CURL_BIN, args, timeoutMs, { shell: false })
  return run.code === 0
}

/** SHA-256 of a file as lowercase hex. */
function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/**
 * Environment handed to package managers and download tools. Allowlist based:
 * any secret-looking key is stripped before a downloaded package could read it.
 */
function sanitizedEnv() {
  const out = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue
    if (SECRET_ENV_RE.test(key)) continue
    if (ENV_ALLOWLIST.includes(key) || /^(npm_config_|PNPM_|COREPACK_)/.test(key)) out[key] = value
  }
  return out
}

/** Pin-store key for one source coordinate. */
function sourceKey(owner, repo, ref) {
  return `${owner}/${repo}@${ref}`
}

function sourcePinsPath() {
  return join(profileDir(), SOURCE_PINS_FILE)
}

/** Pins persisted locally (trust-on-first-use of official downloads). */
function loadFilePins() {
  const value = readJson(sourcePinsPath())
  return value && typeof value === 'object' ? value : {}
}

/** Pins supplied out-of-band by the operator via env (never persisted). */
function loadEnvPins() {
  const raw = String(process.env[SOURCE_PINS_ENV] || '').trim()
  if (raw === '') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadSourcePins() {
  return { ...loadFilePins(), ...loadEnvPins() }
}

function recordSourcePin(key, sha256) {
  const pins = loadFilePins()
  if (pins[key] === sha256) return
  pins[key] = sha256
  try { writeJson(sourcePinsPath(), pins) } catch {}
}

function allowUnverifiedMirror() {
  return String(process.env[ALLOW_UNVERIFIED_MIRROR_ENV] || '').trim() === '1'
}

/**
 * Anchor one downloaded archive. Returns null when it may be used, otherwise an
 * operator-facing reason to refuse it. Fail-closed: a mirror download without
 * any anchor is rejected unless explicitly opted in.
 */
export function anchorDownload({ owner, repo, ref, official, sha256 }) {
  const key = sourceKey(owner, repo, ref)
  const pinned = loadSourcePins()[key]
  if (typeof pinned === 'string' && pinned !== '') {
    if (pinned.toLowerCase() === sha256.toLowerCase()) return null
    return `源码包校验失败：${key} 的 sha256 期望 ${pinned}，实际 ${sha256}，已拒绝安装。`
  }
  if (!official) {
    const tofu = loadFilePins()[key]
    if (typeof tofu === 'string' && tofu !== '') {
      if (tofu.toLowerCase() === sha256.toLowerCase()) return null
      return `镜像源码包校验失败：${key} 与官方源记录不一致（期望 ${tofu}，实际 ${sha256}），已拒绝安装。`
    }
    if (!allowUnverifiedMirror()) {
      return `镜像源码包 ${key} 没有任何完整性锚点（未固定 sha256，本机也从未成功从官方源下载过同一 ref），已拒绝安装。修复：用环境变量 ${SOURCE_PINS_ENV} 固定其 sha256，或临时设置 ${ALLOW_UNVERIFIED_MIRROR_ENV}=1 明确接受风险。`
    }
    console.warn(`dsh-plugin-updates: 警告：${key} 来自镜像且无完整性锚点，按 ${ALLOW_UNVERIFIED_MIRROR_ENV}=1 继续。`)
    return null
  }
  // A successful official download of an immutable ref becomes the local anchor.
  if (IMMUTABLE_REF_RE.test(String(ref))) recordSourcePin(key, sha256)
  return null
}

/** Refuse a downloaded package that declares an install-time lifecycle hook. */
function findInstallTimeHook(pkgRoot) {
  const pkg = readJson(join(pkgRoot, 'package.json'))
  const scripts = pkg && pkg.scripts
  if (!scripts || typeof scripts !== 'object') return null
  for (const hook of INSTALL_TIME_HOOKS) {
    if (typeof scripts[hook] === 'string' && scripts[hook].trim() !== '') return hook
  }
  return null
}

/** 依次尝试官方源与国内镜像，下载指定 tag 的 zip。
 *
 * 安全审计 2026-08：下载顺序改为「官方 codeload 优先，镜像兜底」——镜像
 * （ghfast.top / gh-proxy.com 等第三方）只做字节转发、不提供任何完整性承诺，
 * 排在首位等于把供应链信任锚交给匿名第三方。官方源直连用短 connect-timeout
 * （8s）探测：可达则零额外成本，不可达（国内常见）也只损失一个 TCP 连接
 * 超时，随后照旧走镜像，更新成功率不回退。
 */
async function downloadGithubZip(owner, repo, tag) {
  // jsDelivr 的版本列表去掉 v 前缀（真实 tag 为 v2.0.0 时它返回 2.0.0），而
  // codeload / archive 需要精确 tag 名：先试原 tag，再试 v+tag / 去 v，避免
  // 「查询显示有新版但下载 404、更新必失败」。
  const raw = String(tag ?? '')
  const candidates = [...new Set([
    raw,
    raw.startsWith('v') ? raw.slice(1) : 'v' + raw,
  ])].filter(Boolean)
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-updates-'))
  const zip = join(dir, `${repo}-${raw.replace(/[^A-Za-z0-9._-]/g, '-')}.zip`)
  // 官方直连的连接阶段探测上限：只约束 TCP/TLS 建连，不缩短传输阶段。
  const OFFICIAL_CONNECT_TIMEOUT_S = 8
  let lastError = ''
  try {
    for (const candidate of candidates) {
      const encodedTag = encodeURIComponent(candidate)
      // 官方 codeload 在前（信任锚），镜像兜底（可达性）。
      // Security (H-01): a full commit SHA is addressed directly, so a self-update
      // can target an immutable revision instead of the moving `main` branch.
      const isCommitSha = /^[0-9a-f]{40}$/i.test(candidate)
      const urls = isCommitSha
        ? [
            { url: `https://codeload.github.com/${owner}/${repo}/zip/${candidate}`, official: true },
            ...GITHUB_MIRRORS.map((mirror) => ({ url: `${mirror}https://github.com/${owner}/${repo}/archive/${candidate}.zip`, official: false })),
          ]
        : [
            { url: `https://codeload.github.com/${owner}/${repo}/zip/refs/tags/${encodedTag}`, official: true },
            ...GITHUB_MIRRORS.map((mirror) => ({ url: `${mirror}https://github.com/${owner}/${repo}/archive/refs/tags/${encodedTag}.zip`, official: false })),
          ]
      // main 分支：只推文件不打 tag 的仓库（如 dsh-hub 自身发布）走 refs/heads。
      if (candidate === 'main') {
        urls.push({ url: `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`, official: true })
        urls.push(...GITHUB_MIRRORS.map((mirror) => ({ url: `${mirror}https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`, official: false })))
      }
      for (const { url, official } of urls) {
        const extra = official ? ['--connect-timeout', String(OFFICIAL_CONNECT_TIMEOUT_S)] : []
        if (!(await downloadFile(url, zip, DOWNLOAD_TIMEOUT_MS, extra))) continue
        // Security (H-01): anchor every accepted artifact BEFORE it can reach the
        // extract + pnpm install/build chain. A mirror download with no anchor is
        // refused here unless the operator explicitly opted in.
        let sha256 = ''
        try { sha256 = sha256File(zip) } catch {}
        if (sha256 === '') {
          return { zip: null, dir, error: '源码包读取失败，无法计算 sha256，已拒绝安装。' }
        }
        const anchorError = anchorDownload({ owner, repo, ref: candidate, official, sha256 })
        if (anchorError) {
          lastError = anchorError
          try { rmSync(zip, { force: true }) } catch {}
          continue
        }
        console.log(`dsh-plugin-updates: 已从${official ? '官方 codeload' : '镜像'}下载 ${owner}/${repo}#${candidate}（sha256 ${sha256.slice(0, 12)}…，已校验）`)
        return { zip, dir, official, sha256, ref: candidate }
      }
    }
    return { zip: null, dir, ...(lastError !== '' ? { error: lastError } : {}) }
  } catch {
    return { zip: null, dir }
  }
}

/** 复制目录内容到目标，跳过 node_modules（保留本地依赖）。 */
function copyTreeExcludingNodeModules(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    cpSync(join(src, entry.name), join(dest, entry.name), { recursive: true, force: true })
  }
}

/** 清空目录内容但保留 node_modules。 */
function clearTreeKeepingNodeModules(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    rmSync(join(dir, entry.name), { recursive: true, force: true })
  }
}

/** 解压 zip（返回解压后顶层目录）。Windows/macOS 的 tar 是 bsdtar 直接支持 zip；
 *  Linux 的 GNU tar 不支持 zip，优先用 unzip（未安装时回退试 tar，多半失败并报错）。 */
function extractZip(zip, workDir) {
  // Security (H-14): a mirrored archive could carry `../` entries or link
  // entries and write outside workDir (e.g. over the kernel payload that runs on
  // the next start). Validate names and types BEFORE handing it to the extractor.
  try {
    const { names, types } = listArchive(zip)
    assertArchiveSafe(names, types)
  } catch (error) {
    console.error(`dsh-plugin-updates: 归档预检失败，已拒绝解压。${String(error?.message ?? error)}`)
    return null
  }
  let ok = false
  if (process.platform === 'linux') ok = runCliSync('unzip', ['-o', zip, '-d', workDir])
  if (!ok) ok = runCliSync(TAR_BIN, ['-xf', zip, '-C', workDir])
  if (!ok) {
    if (process.platform === 'linux') {
      console.error('dsh-plugin-updates: 解压 zip 失败。Linux 下 GNU tar 不支持 zip，请安装 unzip（如 sudo apt install unzip）后重试。')
    }
    return null
  }
  if (treeHasLinks(workDir)) {
    console.error('dsh-plugin-updates: 解压结果包含符号链接/硬链接，已拒绝安装。')
    return null
  }
  const entries = readdirSync(workDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  if (entries.length === 0) return null
  return join(workDir, entries[0].name)
}

/** 同步跑一次命令（tar 解压小文件用）。 */
function runCliSync(command, args, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  const result = spawnSync(command, args, {
    cwd: profileDir(),
    env: sanitizedEnv(),
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
  })
  return result.status === 0
}

/** Same as runCliSync but returns captured stdout/stderr (archive listing). */
function runCliCapture(command, args, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  const result = spawnSync(command, args, {
    cwd: profileDir(),
    env: sanitizedEnv(),
    windowsHide: true,
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
  })
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

function splitArchiveLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
}

/**
 * Archive entry-name validation (H-14). Same rules as
 * `scripts/plugin-core/lib/updates.js`: rejects absolute paths, `..` segments,
 * drive letters, NTFS alternative data streams and reserved Windows names.
 */
export function validateArchiveEntryName(name) {
  const n = String(name || '')
  if (n === '') return false
  if (n.includes('\0')) return false
  if (n.startsWith('/') || n.startsWith('\\')) return false
  if (/^[A-Za-z]:[\\/]/.test(n)) return false
  for (const rawSeg of n.split(/[\\/]/)) {
    if (rawSeg === '' || rawSeg === '.') continue
    if (rawSeg === '..') return false
    // Windows strips trailing dots/spaces, so `.. ` normalizes to `..`.
    const seg = rawSeg.replace(/[. ]+$/, '')
    if (seg === '..' || seg === '') return false
    if (seg.includes(':')) return false
    const dotIdx = seg.indexOf('.')
    const stem = (dotIdx >= 0 ? seg.slice(0, dotIdx) : seg).replace(/[. ]+$/, '')
    if (stem === '') continue
    if (WINDOWS_RESERVED_RE.test(stem)) return false
  }
  return true
}

/** Pre-flight check over entry names and entry type flags. Throws on violation. */
export function assertArchiveSafe(names, types) {
  for (const name of names) {
    if (!validateArchiveEntryName(name)) throw new Error(`归档包含越界条目: ${name}`)
  }
  for (const type of types) {
    if (/[lhcbp]/.test(type)) throw new Error(`归档包含链接/设备条目（类型 ${type}），已拒绝`)
  }
  return true
}

/** List an archive's entry names and type flags. Throws when it cannot. */
function listArchive(archive) {
  // bsdtar (Windows/macOS built-in) reads zip too; GNU tar on Linux cannot.
  const tarNames = runCliCapture(TAR_BIN, ['-tf', archive])
  const tarTypes = tarNames.ok ? runCliCapture(TAR_BIN, ['-tvf', archive]) : { ok: false }
  if (tarNames.ok && tarTypes.ok) {
    return {
      names: splitArchiveLines(tarNames.stdout),
      types: splitArchiveLines(tarTypes.stdout).map((line) => line[0] || ''),
    }
  }
  const zipNames = runCliCapture('unzip', ['-Z1', archive])
  const zipTypes = zipNames.ok ? runCliCapture('unzip', ['-Z', archive]) : { ok: false }
  if (zipNames.ok && zipTypes.ok) {
    return {
      names: splitArchiveLines(zipNames.stdout),
      types: splitArchiveLines(zipTypes.stdout).filter((line) => /^[-dlbcps?]/.test(line)).map((line) => line[0]),
    }
  }
  throw new Error('无法列出归档条目（tar/unzip 均不可用），已拒绝解压。')
}

/** True when a tree contains any symlink or hardlink (defence in depth). */
function treeHasLinks(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    try {
      const info = lstatSync(full)
      if (info.isSymbolicLink()) return true
      if (info.isDirectory() && treeHasLinks(full)) return true
    } catch {
      return true
    }
  }
  return false
}

/** 复制目录全部内容（含 node_modules，zip 一般没有）。 */
function copyDirContents(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    cpSync(join(src, entry.name), join(dest, entry.name), { recursive: true, force: true })
  }
}

/** 从 package.json 解析插件入口相对路径（main 或 exports["."].default）。 */
function entryPathOf(pkg) {
  if (!pkg) return ''
  const direct = pkg.main
  const dot = pkg.exports && pkg.exports['.'] && (pkg.exports['.'].default || pkg.exports['.'])
  const raw = typeof dot === 'string' ? dot : direct
  return String(raw || '').replace(/^\.\//, '')
}

/** 在插件目录尝试构建：先 pnpm install（触发 prepare），再 pnpm run build。返回 { ok, error? }。
 *
 * Security (H-02): the package being built was just downloaded from GitHub or a
 * mirror, so its `package.json` is attacker-controlled. Install-time lifecycle
 * hooks (preinstall/install/postinstall) are refused outright, the install runs
 * with `--ignore-scripts` so nothing of the sort can execute, and the child
 * process gets a scrubbed environment instead of the full `process.env`.
 * The explicit `pnpm run build` is what this update path legitimately needs.
 */
async function tryBuildPlugin(realDir) {
  const hook = findInstallTimeHook(realDir)
  if (hook) {
    return { ok: false, error: `下载的插件声明了安装期脚本 "${hook}"，出于安全考虑已拒绝执行。` }
  }
  const install = await runCli('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], MUTATE_TIMEOUT_MS, { cwd: realDir })
  if (install.code === 0) return { ok: true }
  const installErr = cliFailure(install, 'install')
  const build = await runCli('pnpm', ['run', 'build'], MUTATE_TIMEOUT_MS, { cwd: realDir })
  if (build.code === 0) return { ok: true }
  return { ok: false, error: `pnpm install 失败：${installErr} | pnpm build 失败：${cliFailure(build, 'build')}` }
}

/** 用备份完整恢复插件目录（兼容新备份格式：node_modules 存放在备份内的 __node_modules__）。 */
function rollbackPlugin(realDir, backupDir) {
  // 更新中途可能已把 node_modules 移回插件目录（依赖未变的快路径）；回滚前先归位到备份，避免随 rm 被删
  const nmDir = join(realDir, 'node_modules')
  const nmStore = join(backupDir, '__node_modules__')
  if (existsSync(nmDir) && !existsSync(nmStore)) {
    try { renameSync(nmDir, nmStore) } catch {}
  }
  rmSync(realDir, { recursive: true, force: true })
  mkdirSync(realDir, { recursive: true })
  copyDirContents(backupDir, realDir)
  if (existsSync(nmStore)) {
    try {
      renameSync(nmStore, join(realDir, 'node_modules'))
    } catch {
      copyDirContents(nmStore, join(realDir, 'node_modules'))
    }
  }
}

/**
 * 从国内镜像自动下载 GitHub 新版本并替换本地源码。
 *
 * 安全策略（修复 2026-08-16）：
 *  1. 完整备份整个插件目录（含 node_modules）到 profile 下的持久备份目录；
 *  2. 解压后先检查新版 package.json 与入口文件；
 *  3. 清空并复制新内容；
 *  4. 如果源码包不含构建产物（lib/dist 常见于 git 源码包），自动运行 pnpm install/build；
 *  5. 最终验证入口文件存在，否则回滚并报错；
 *  6. 任何异常都会回滚到完整备份；回滚失败时保留备份并在错误信息里给出路径。
 * 备份目录：<profile>/.plugin-updates-backups/（持久位置，进程崩溃也不会随 %TEMP% 清理丢失）。
 * 更新完成或成功回滚后删除备份；崩溃遗留的备份保留 7 天后自动清理（pruneOldBackups）。
 *
 * 注意：覆盖会丢弃本地未提交的源码改动（本机无 git 无法 merge）。
 * @returns {{ ok: boolean, version?: string, error?: string }}
 */
/** 持久备份根目录（profile 内，独立于 %TEMP%）。 */
function backupsRoot() {
  return join(profileDir(), '.plugin-updates-backups')
}

/** 清理超过保留期的崩溃遗留备份。 */
function pruneOldBackups() {
  const root = backupsRoot()
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  const deadline = Date.now() - BACKUP_KEEP_MS
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      if (statSync(join(root, entry.name)).mtimeMs < deadline) {
        rmSync(join(root, entry.name), { recursive: true, force: true })
      }
    } catch {}
  }
}

/** 用一份解压好的新源码替换插件目录：完整备份 → 替换 → pnpm install/build → 验证入口 → 失败回滚。 */
async function applyNewSource(realDir, root, preserveFiles = []) {
  const newPkg = readJson(join(root, 'package.json')) ?? {}
  if (!newPkg.version) {
    return { ok: false, error: '下载的新版本缺少 package.json，已取消更新。' }
  }
  // Security (H-02): refuse install-time lifecycle hooks declared by the
  // downloaded package before anything is copied over the live plugin.
  const installHook = findInstallTimeHook(root)
  if (installHook) {
    return { ok: false, error: `下载的新版本声明了安装期脚本 "${installHook}"，出于安全考虑已拒绝更新。` }
  }
  let backupDir = null
  try {
    pruneOldBackups()
    backupDir = join(backupsRoot(), `${slugOf(basename(realDir))}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    mkdirSync(backupDir, { recursive: true })
    // 先把 node_modules 改名移进备份（瞬时，替代逐文件复制的完整备份）；
    // 新版依赖规格没变时更新完移回去、直接跳过 pnpm install（省 10-60s 的重装）。
    const nmDir = join(realDir, 'node_modules')
    const nmStore = join(backupDir, '__node_modules__')
    let nmMoved = false
    if (existsSync(nmDir)) {
      try { renameSync(nmDir, nmStore); nmMoved = true } catch {}
    }
    const oldPkg = readJson(join(realDir, 'package.json')) ?? {}
    copyDirContents(realDir, backupDir)
    const depsUnchanged = nmMoved
      && JSON.stringify(oldPkg.dependencies ?? {}) === JSON.stringify(newPkg.dependencies ?? {})
    rmSync(realDir, { recursive: true, force: true })
    mkdirSync(realDir, { recursive: true })
    copyDirContents(root, realDir)
    // 客户端插件更新时，新源码可能没带 Desktop 专用装配文件（dsh.plugin.json / cordis.patch.yml），
    // 从旧目录备份里补回，避免插件因缺文件而 UI 不加载/报错。
    for (const rel of preserveFiles) {
      const target = join(realDir, rel)
      const saved = join(backupDir, rel)
      if (!existsSync(target) && existsSync(saved)) {
        mkdirSync(dirname(target), { recursive: true })
        cpSync(saved, target, { recursive: true, force: true })
      }
    }
    if (depsUnchanged) {
      try { renameSync(nmStore, nmDir) } catch { /* 移不回去就照常走 pnpm install */ }
    }

    // 依赖已保留且入口存在时跳过安装；否则 pnpm install（pnpm 11 可能因安全策略忽略部分
    // build scripts 而返回非零，但依赖本体通常已装好，因此只要入口存在且 node_modules 存在，就继续）。
    const entryExistsNow = () => {
      const pkg = readJson(join(realDir, 'package.json')) ?? {}
      const entry = entryPathOf(pkg)
      if (entry !== '' && !existsSync(join(realDir, entry))) return false
      // main 指向 .ts/.tsx 源码 = 未构建的源码仓库：构建产物缺失，必须跑 build，
      // 否则更新后插件入口（dist/*.js）被删、插件直接崩溃。
      if (/\.tsx?$/.test(entry)) return false
      return true
    }
    let installErr = ''
    if (!(depsUnchanged && existsSync(nmDir) && entryExistsNow())) {
      // Security (H-02): --ignore-scripts keeps install-time hooks of the freshly
      // downloaded package from running; the env is already scrubbed by runCli.
      const install = await runCli('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], MUTATE_TIMEOUT_MS, { cwd: realDir })
      installErr = install.code === 0 ? '' : cliFailure(install, 'install')
    }

    let finalPkg = readJson(join(realDir, 'package.json')) ?? {}
    // 版本倒退保护：仓库 tag 与 package.json version 可能不一致（如 tag v2.0.0 的包里
    // version 是 1.5.0），装上会让版本倒退且可能破坏装配，直接回滚并明确报错。
    const finalVersion = typeof finalPkg.version === 'string' ? finalPkg.version : ''
    if (typeof oldPkg.version === 'string' && finalVersion !== '' && versionCompare(finalVersion, oldPkg.version) < 0) {
      rollbackPlugin(realDir, backupDir)
      rmSync(backupDir, { recursive: true, force: true })
      return { ok: false, error: `下载的仓库版本号（${finalVersion}）低于当前版本（${oldPkg.version}），疑似错误 tag，已回滚。` }
    }
    let finalEntry = entryPathOf(finalPkg)
    let finalEntryOk = finalEntry === '' || existsSync(join(realDir, finalEntry))
    if (!finalEntryOk) {
      const build = await runCli('pnpm', ['run', 'build'], MUTATE_TIMEOUT_MS, { cwd: realDir })
      if (build.code !== 0) {
        rollbackPlugin(realDir, backupDir)
        rmSync(backupDir, { recursive: true, force: true })
        return { ok: false, error: `更新后依赖安装/构建失败，已回滚。详情：pnpm install 失败：${installErr} | pnpm build 失败：${cliFailure(build, 'build')}` }
      }
      finalPkg = readJson(join(realDir, 'package.json')) ?? {}
      finalEntry = entryPathOf(finalPkg)
      finalEntryOk = finalEntry === '' || existsSync(join(realDir, finalEntry))
    }
    if (!finalEntryOk) {
      rollbackPlugin(realDir, backupDir)
      rmSync(backupDir, { recursive: true, force: true })
      return { ok: false, error: '更新后插件入口文件缺失（构建未生成产物），已回滚。请稍后重试或手动到仓库下载构建版。' }
    }
    if (!existsSync(join(realDir, 'node_modules'))) {
      rollbackPlugin(realDir, backupDir)
      rmSync(backupDir, { recursive: true, force: true })
      return { ok: false, error: `更新后依赖安装失败（node_modules 缺失），已回滚。详情：${installErr}` }
    }
    rmSync(backupDir, { recursive: true, force: true })
    return { ok: true, version: typeof finalPkg.version === 'string' ? finalPkg.version : '' }
  } catch (error) {
    if (backupDir && existsSync(backupDir)) {
      try {
        rollbackPlugin(realDir, backupDir)
        rmSync(backupDir, { recursive: true, force: true })
        return { ok: false, error: `更新失败，已回滚：${String(error?.message ?? error)}` }
      } catch {
        return { ok: false, error: `更新失败且回滚不完整，完整备份保留在 ${backupDir}，可手动复制回插件目录恢复。错误：${String(error?.message ?? error)}` }
      }
    }
    return { ok: false, error: `更新失败：${String(error?.message ?? error)}` }
  }
}

/** 安全审计 2026-08：GitHub archive 顶层目录锚点纯校验。
 * codeload 生成的源码包顶层目录恒为 `<repo>-<ref>`（镜像转发的也是同一
 * archive）。顶层目录对不上说明下载物不是请求的仓库（镜像串包/被替换），
 * updateLocalFromGithub 据此拒绝安装；抽出为纯函数供单测覆盖。 */
export function archiveRootMatchesRepo(repo, rootBase) {
  return typeof repo === 'string'
    && typeof rootBase === 'string'
    && repo.length > 0
    && rootBase.startsWith(repo + '-')
}

/**
 * Resolve a branch or tag to an immutable commit SHA (security H-01). Returns ''
 * when the API is unreachable, in which case callers fall back to the moving ref
 * (and mirror downloads then require an explicit pin).
 */
export async function resolveCommitSha(owner, repo, ref) {
  try {
    const run = await runCurl(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, GITHUB_TIMEOUT_MS)
    if (run.code !== 0) return ''
    const data = JSON.parse(run.stdout)
    const sha = typeof data?.sha === 'string' ? data.sha : ''
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : ''
  } catch {
    return ''
  }
}

async function updateLocalFromGithub(name, owner, repo, tag, realDirOverride, preserveFiles = []) {
  let realDir
  try {
    realDir = realDirOverride || realpathSync(packageDir(name))
  } catch {
    return { ok: false, error: '找不到插件源码目录（link 失效？）' }
  }
  const { zip, dir, error: downloadError } = await downloadGithubZip(owner, repo, tag)
  if (!zip) {
    rmSync(dir, { recursive: true, force: true })
    return { ok: false, error: downloadError || `镜像下载失败，请稍后重试或手动到 https://github.com/${owner}/${repo}/releases 下载。` }
  }
  try {
    const extractDir = join(dir, 'extract')
    mkdirSync(extractDir, { recursive: true })
    const root = extractZip(zip, extractDir)
    if (!root) return { ok: false, error: '源码包解压失败（文件可能损坏）。' }
    // 安全审计 2026-08：结构锚点校验（见 archiveRootMatchesRepo 注释）。
    // 顶层目录对不上说明下载物不是请求的仓库源码包（镜像串包/被替换/错误页
    // 被 -f 漏放），直接拒绝——宁可让用户重试，也不把来路不明的目录整进
    // 插件位置执行构建。
    const rootBase = basename(root)
    if (!archiveRootMatchesRepo(repo, rootBase)) {
      return { ok: false, error: `源码包顶层目录异常（期望 ${repo}-<tag>，实际 ${rootBase}），已拒绝安装。请重试；持续失败请手动到 https://github.com/${owner}/${repo}/releases 下载。` }
    }
    return await applyNewSource(realDir, root, preserveFiles)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 从 npm registry 下载指定版本 tarball 并替换插件目录（用于 GitHub 无 release/tag 但有 npm 发布的插件）。
 * 安全：npm 命令在 Windows 下经 shell 执行（npm.cmd 无法 shell:false 直接 spawn；unix 下相反，
 *   shell:false 即可），存在 shell 注入面；调用方必须传入已校验的包名（validName），version 必须通过
 *   下方 semver 白名单。后续硬化可改为定位 npm-cli.js 后用 node 直接执行，彻底去掉 shell。 */
async function updateDirFromNpm(realDir, name, version, preserveFiles = []) {
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(String(name || ''))) {
    return { ok: false, error: '非法的 npm 包名，已拒绝更新。' }
  }
  if (!/^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(String(version || ''))) {
    return { ok: false, error: '非法的 npm 版本号，已拒绝更新。' }
  }
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-updates-npm-'))
  try {
    const pack = await runCli('npm', ['pack', `${name}@${version}`, '--pack-destination', dir, '--json'], DOWNLOAD_TIMEOUT_MS)
    if (pack.code !== 0) return { ok: false, error: `npm 下载失败：${cliFailure(pack, 'pack')}` }
    let tgz = null
    try {
      const arr = JSON.parse(pack.stdout)
      if (Array.isArray(arr) && arr[0] && arr[0].filename) tgz = join(dir, arr[0].filename)
    } catch {}
    if (!tgz || !existsSync(tgz)) return { ok: false, error: 'npm 下载文件未找到' }
    const extractDir = join(dir, 'extract')
    mkdirSync(extractDir, { recursive: true })
    // npm pack 产出的是 .tgz，所有平台的 tar 都支持
    if (!runCliSync(TAR_BIN, ['-xf', tgz, '-C', extractDir])) return { ok: false, error: 'npm 包解压失败' }
    const root = join(extractDir, 'package')
    if (!existsSync(join(root, 'package.json'))) return { ok: false, error: 'npm 包缺少 package.json' }
    return await applyNewSource(realDir, root, preserveFiles)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 包名白名单校验（npm 命名规则），拒绝任何可注入 shell 的形状。 */
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** 非抛出的白名单校验：用于查询路径（queryLatest / npm view 回退）里的不可信输入。 */
function isValidName(value) {
  return NPM_NAME_RE.test(String(value ?? '').trim())
}

/** 包名白名单校验（npm 命名规则），拒绝任何可注入 shell 的形状。 */
function validName(value) {
  const name = String(value ?? '').trim()
  if (!NPM_NAME_RE.test(name)) throw new Error('无效的包名 ' + JSON.stringify(name))
  return name
}

/** 按 slug 移除 cordis.patch.yml 中市场/更新页加过的激活行（与内置市场同规则）。 */
function slugOf(name) {
  return name.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
}

function removeRow(name) {
  const path = patchPath()
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const id = `pm-${slugOf(name)}`
  const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 兼容带/不带 config 行两种写法，避免卸载后残留孤立的 config: {} 行
  const row = new RegExp(
    `- insert:\\n    - id: ${esc(id)}\\n      name: '${esc(name)}'\\n(?:      config: \\{[^\\n}]*\\}\\n)?`,
    'g',
  )
  if (!row.test(text)) return
  writeTextSafe(path, text.replace(row, ''))
}

// --- cordis.patch.yml 解析：entry id / disable（用于启用/停用插件） ---

/** 解析 patch 中 insert 块：插件名 -> loader entry id。 */
function patchInsertMap() {
  const path = patchPath()
  if (!existsSync(path)) return new Map()
  const text = readFileSync(path, 'utf8')
  const map = new Map()
  const blocks = text.split(/^- insert:/m).slice(1)
  for (const block of blocks) {
    const idMatch = block.match(/^\s*- id:\s*(\S+)/m)
    const nameMatch = block.match(/^\s*name:\s*['"]([^'"]+)['"]/m)
    if (idMatch && nameMatch) map.set(nameMatch[1], idMatch[1])
  }
  return map
}

/** 解析 patch 中所有被 disable 的 entry id。 */
function patchDisableIds() {
  const path = patchPath()
  if (!existsSync(path)) return new Set()
  const text = readFileSync(path, 'utf8')
  const set = new Set()
  const blocks = text.split(/^- disable:/m).slice(1)
  for (const block of blocks) {
    const idMatch = block.match(/^\s*- id:\s*(\S+)/m)
    if (idMatch) set.add(idMatch[1])
  }
  return set
}

/** 按插件名找它在 cordis.patch.yml 里的 entry id（找不到返回 null）。 */
function findEntryIdForName(name) {
  return patchInsertMap().get(name) ?? null
}

/** 启用或停用一个插件（修改 cordis.patch.yml 的 disable 块）。 */
function setPluginEnabled(name, enabled) {
  const id = findEntryIdForName(name)
  if (!id) return { ok: false, error: '找不到该插件的激活 entry（它可能不是通过 cordis.patch.yml 安装的，无法安全启停）' }
  const path = patchPath()
  let text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const block = `- disable:\n    - id: ${id}\n`
  if (enabled) {
    if (!text.includes(block)) return { ok: true, id, enabled: true, already: true }
    writeTextSafe(path, text.split(block).join(''))
    return { ok: true, id, enabled: true, needsRestart: true }
  }
  if (text.includes(block)) return { ok: true, id, enabled: false, already: true }
  text = text.replace(/\s+$/, '') + '\n' + block
  writeTextSafe(path, text)
  return { ok: true, id, enabled: false, needsRestart: true }
}

/** 卸载时同时移除对应的 disable 块，避免残留孤儿条目。 */
function removeDisableForId(id) {
  const path = patchPath()
  if (!existsSync(path) || !id) return
  const text = readFileSync(path, 'utf8')
  const block = `- disable:\n    - id: ${id}\n`
  if (text.includes(block)) writeTextSafe(path, text.split(block).join(''))
}

/**
 * 与 dsh plugin 命令相同的校对逻辑：依赖里声明了 dsh.bundle 的包应进入
 * dsh.profile.bundles，失去该声明的包应离开（更新后包可能新获得 bundle 声明）。
 * 注意：bundles 里还可能合法存在不在 dependencies 中的应用内置项（dsh-base、dsh-web-app 等），
 * 本函数只处理 dependencies 里的名字，绝不碰其它条目；包信息读不到时跳过该名字，防瞬时误删。
 */
function reconcileBundles() {
  const path = manifestPath()
  const manifest = readJson(path)
  if (!manifest) return
  const dependencies = Object.keys(manifest.dependencies ?? {})
  const plugins = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  let changed = false
  for (const name of dependencies) {
    const pkg = readJson(join(packageDir(name), 'package.json'))
    if (pkg === null) continue
    const isBundle = pkg.dsh?.bundle?.patch !== undefined
    if (isBundle && !plugins.includes(name)) {
      plugins.push(name)
      changed = true
    } else if (!isBundle && plugins.includes(name)) {
      plugins.splice(plugins.indexOf(name), 1)
      changed = true
    }
  }
  if (changed) {
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: plugins } }
    writeJson(path, manifest)
  }
}

// --- 启动自检与自动修复 ---
// 原则：只做安全的本地修复（原子写残留恢复、patch 清理去重、缓存重建、bundle 校对、
// 从更新备份恢复损坏插件、自激活行自保）；绝不删除依赖、绝不自动跑 pnpm、绝不碰 DSH 本体。

function isValidJsonText(text) {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * 修复 writeTextSafe 的崩溃残留：目标缺失（或 JSON 模式下损坏）时，优先用 .tmp
 * （崩溃前已完整写好的新内容），其次 .bak（上次写入前的内容）恢复；目标完好则只清理残留 .tmp。
 * @param {{ json?: boolean }} options JSON 文件会先校验内容合法才恢复
 */
function recoverAtomicWrite(path, options = {}) {
  const actions = []
  const json = options.json === true
  const tmp = `${path}.tmp`
  const bak = `${path}.bak`
  let targetOk = false
  try {
    targetOk = existsSync(path) && (!json || isValidJsonText(readFileSync(path, 'utf8')))
  } catch {
    targetOk = false
  }
  if (!targetOk) {
    const candidates = []
    if (existsSync(tmp)) candidates.push(tmp)
    if (existsSync(bak)) candidates.push(bak)
    for (const source of candidates) {
      try {
        const text = readFileSync(source, 'utf8')
        if (json && !isValidJsonText(text)) continue
        writeTextSafe(path, text)
        actions.push(`已从 ${basename(source)} 恢复 ${basename(path)}`)
        break
      } catch {}
    }
    if (actions.length === 0 && candidates.length > 0) {
      actions.push(`${basename(path)} 损坏且 .tmp/.bak 副本不可用，未能自动恢复`)
    }
  } else if (existsSync(tmp)) {
    try {
      rmSync(tmp, { force: true })
      actions.push(`清理了残留的 ${basename(tmp)}`)
    } catch {}
  }
  return actions
}

/** 清理 cordis.patch.yml：孤立 config 行、同名 insert / 同 id disable 的重复块，并保证末尾换行。 */
function repairPatchFile(path = patchPath()) {
  if (!existsSync(path)) return []
  const actions = []
  const text = readFileSync(path, 'utf8')

  // 1) 孤立的 config: {} 行（前面不是 name/id 行——旧版卸载功能残留的 bug 形状）
  const kept = []
  let prevKind = 'other'
  for (const line of text.split('\n')) {
    if (/^\s*config:\s*\{[^}]*\}\s*$/.test(line) && prevKind !== 'name' && prevKind !== 'id') {
      actions.push('清理了 cordis.patch.yml 里孤立的 config 行')
      prevKind = 'removed'
      continue
    }
    if (/^\s*name:\s*['"]/.test(line)) prevKind = 'name'
    else if (/^\s*- id:/.test(line)) prevKind = 'id'
    else if (line.trim() !== '' && prevKind !== 'name' && prevKind !== 'id') prevKind = 'other'
    kept.push(line)
  }
  let out = kept.join('\n')

  // 2) 同名 insert / 同 id disable 的重复块，只保留第一个
  const dedupeBlocks = (marker, keyOf) => {
    const parts = out.split(new RegExp(`(?=^- ${marker}:)`, 'm'))
    const seen = new Set()
    const result = []
    let removed = 0
    for (const part of parts) {
      if (!part.startsWith(`- ${marker}:`)) {
        result.push(part)
        continue
      }
      const key = keyOf(part)
      if (key !== null && seen.has(key)) {
        removed += 1
        continue
      }
      if (key !== null) seen.add(key)
      result.push(part)
    }
    if (removed > 0) actions.push(`移除了 ${removed} 个重复的 ${marker} 块`)
    return result.join('')
  }
  out = dedupeBlocks('insert', (block) => {
    const m = block.match(/^\s*name:\s*['"]([^'"]+)['"]/m)
    return m ? m[1] : null
  })
  out = dedupeBlocks('disable', (block) => {
    const m = block.match(/^\s*- id:\s*(\S+)/m)
    return m ? m[1] : null
  })

  // 3) 保证末尾换行
  if (!out.endsWith('\n')) out += '\n'
  if (out !== text) {
    writeTextSafe(path, out)
    if (actions.length === 0) actions.push('规范了 cordis.patch.yml 的格式')
  }
  return actions
}

/** 更新检查缓存损坏（非法 JSON）时删除，下次检查自动重建。 */
function repairCacheFile(path = cachePath()) {
  if (!existsSync(path)) return []
  try {
    if (isValidJsonText(readFileSync(path, 'utf8'))) return []
    rmSync(path, { force: true })
    return ['重建了损坏的更新缓存文件']
  } catch {
    return []
  }
}

/** 依赖里有本插件但激活行丢失时补回（自保：行没了下次启动就不加载本插件了）。 */
function ensureSelfActivation(deps, path = patchPath()) {
  if (!deps.some((entry) => entry.name === 'dsh-plugin-updates')) return []
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (/name:\s*['"]dsh-plugin-updates['"]/.test(text)) return []
  try {
    writeTextSafe(path, text.replace(/\s+$/, '') + "\n- insert:\n    - id: plugin-updates\n      name: 'dsh-plugin-updates'\n      config: {}\n")
    return ['补回了 dsh-plugin-updates 自身的激活行']
  } catch {
    return []
  }
}

/**
 * 依赖存在但入口文件缺失 / package.json 缺失（更新被打断等）：持久备份目录里有对应备份
 * 就自动恢复完整目录（备份含 node_modules）；没有备份只报告，不动其它东西。
 */
function repairBrokenPlugins() {
  const actions = []
  let backups
  try {
    backups = readdirSync(backupsRoot(), { withFileTypes: true })
  } catch {
    backups = []
  }
  for (const dep of depsSnapshot()) {
    let realDir = null
    try {
      realDir = realpathSync(packageDir(dep.name))
    } catch {
      actions.push(`发现 ${dep.name} 的安装目录缺失（可尝试重新安装）`)
      continue
    }
    const pkg = readJson(join(realDir, 'package.json')) ?? {}
    const entry = entryPathOf(pkg)
    const broken = typeof pkg.version !== 'string' || (entry !== '' && !existsSync(join(realDir, entry)))
    if (!broken) continue
    const prefix = `${slugOf(basename(realDir))}-`
    const matches = backups
      .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
      .sort((a, b) => (a.name < b.name ? 1 : -1)) // 目录名带时间戳，字典序即时间序，取最新
    if (matches.length === 0) {
      actions.push(`发现 ${dep.name} 入口缺失且无备份可恢复（可尝试重新安装或更新）`)
      continue
    }
    try {
      rollbackPlugin(realDir, join(backupsRoot(), matches[0].name))
      actions.push(`从备份恢复了 ${dep.name}（其入口文件曾缺失）`)
    } catch {
      actions.push(`${dep.name} 入口缺失且从备份恢复失败，备份保留在 ${join(backupsRoot(), matches[0].name)}`)
    }
  }
  return actions
}

/**
 * 启动自检 + 自动修复。任何方式启动宿主（DSH Desktop 客户端或终端 dsh web）都会加载本插件，
 * 加载后约 0.6s 运行（先于 1.5s 的更新检查）。返回 { at, actions } 供 UI 展示。
 */
function repairAll() {
  const actions = []
  actions.push(...recoverAtomicWrite(patchPath()))
  actions.push(...recoverAtomicWrite(manifestPath(), { json: true }))
  actions.push(...repairPatchFile())
  actions.push(...repairCacheFile())
  actions.push(...ensureSelfActivation(depsSnapshot()))
  actions.push(...repairBrokenPlugins())
  try {
    pruneOldBackups()
  } catch {}
  return { at: Date.now(), actions }
}


//#region dsh-hub 集成：记忆 / graph-memory / dsh-market / 自身更新

/** 自身更新检查的 GitHub 仓库（dsh-hub 发布仓库，原名 DSH_Automatic-update-plugin，已改名 dsh-hub-DSH）。 */
const UPDATE_REPO = 'ARFCON/dsh-hub-DSH'
const UPDATE_SOURCES = [
  `https://raw.githubusercontent.com/${UPDATE_REPO}/main/package.json`,
  // 国内可达的 raw 代理（GitHub 官方 raw 被墙时的兜底；镜像本身可能不稳定，排在 jsDelivr 前可拿到实时版本）
  `https://ghfast.top/https://raw.githubusercontent.com/${UPDATE_REPO}/main/package.json`,
  `https://gh-proxy.com/https://raw.githubusercontent.com/${UPDATE_REPO}/main/package.json`,
  // jsDelivr CDN：缓存兜底（发布后缓存刷新有延迟，可能短暂返回旧版本）
  `https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@main/package.json`,
]
/** 更新检查结果 6 小时内复用。 */
const UPDATE_CACHE_STALE_MS = 6 * 60 * 60 * 1000
/** 启动后稍等再跑后台任务。 */
const START_DELAY_MS = 1500
/** 单次版本查询超时。 */
const FETCH_TIMEOUT_MS = 10 * 1000
const GRAPH_MEMORY_PKG = 'graph-memory'
const MARKET_PKG = 'dsh-community-market'

/** 本插件版本（动态读包内 package.json，避免与发布流程双维护）。 */
function selfVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** graph-memory 源码目录（plugin-src）。 */
function gmSourceDir() {
  return path.join(homeDir(), 'plugin-src', GRAPH_MEMORY_PKG)
}

/** graph-memory SQLite 数据库路径（与 graph-memory 插件默认配置一致）。 */
function gmDbPath() {
  return path.join(homeDir(), 'graph-memory', 'graph-memory.db')
}

/** 读 profile manifest（不存在返回空对象）。 */
function manifestOf() {
  return readJson(manifestPath()) ?? {}
}

/** 原子写 JSON（红线⑤：经 writeTextSafe）。 */
function writeJsonSafe(p, obj) {
  writeTextSafe(p, JSON.stringify(obj, null, 2) + '\n')
}

/** graph-memory 源码存在性 + 版本（plugin-src 用户源码，或随壳内置副本）。 */
function gmSourceStatus() {
  const pkgPath = path.join(gmSourceDir(), 'package.json')
  if (existsSync(pkgPath)) {
    const meta = readJson(pkgPath)
    return { present: true, version: meta?.version ?? null, dir: gmSourceDir(), source: 'plugin-src', entryOk: existsSync(path.join(gmSourceDir(), 'dist', 'index.js')) }
  }
  // 随 DSH Desktop 内置分发：companion 同步器把 assets/plugins/graph-memory 复制进
  // profile node_modules 并登记 bundles，无需 plugin-src 源码目录。
  const bundledDir = path.join(profileDir(), 'node_modules', GRAPH_MEMORY_PKG)
  const bundledPkg = path.join(bundledDir, 'package.json')
  if (existsSync(bundledPkg)) {
    let isJunction = false
    try { isJunction = lstatSync(bundledDir).isSymbolicLink() } catch { /* 目录不可读按非 junction 处理 */ }
    if (!isJunction) {
      const meta = readJson(bundledPkg)
      return { present: true, version: meta?.version ?? null, dir: bundledDir, source: 'bundled', entryOk: existsSync(path.join(bundledDir, 'dist', 'index.js')) }
    }
  }
  return { present: false }
}

/** profile 装配状态（bundles / dependencies link / node_modules junction）。 */
function gmInstalledStatus() {
  const manifest = manifestOf()
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const inBundles = bundles.includes(GRAPH_MEMORY_PKG)
  const dep = manifest.dependencies?.[GRAPH_MEMORY_PKG]
  const linked = typeof dep === 'string' && dep.startsWith('link:')
  const nodeModules = existsSync(path.join(profileDir(), 'node_modules', GRAPH_MEMORY_PKG))
  // bundled 装配（companion 同步）是真实目录而非 link junction，因此不要求 linked。
  return { inBundles, linked, nodeModules, installed: inBundles && nodeModules }
}

/** 读 graph-memory SQLite 统计（node:sqlite 只读打开，不依赖 graph-memory 本体）。 */
function gmDbStats() {
  const p = gmDbPath()
  if (!existsSync(p)) return null
  let db = null
  try {
    db = new DatabaseSync(p, { readOnly: true })
    const one = (sql) => {
      try {
        const row = db.prepare(sql).get()
        const value = row?.c ?? row?.['COUNT(*)'] ?? 0
        return Number(value)
      } catch {
        return null
      }
    }
    return {
      nodes: one("SELECT COUNT(*) AS c FROM gm_nodes WHERE status='active'"),
      edges: one('SELECT COUNT(*) AS c FROM gm_edges'),
      communities: one("SELECT COUNT(DISTINCT community_id) AS c FROM gm_nodes WHERE status='active' AND community_id IS NOT NULL"),
      dbSize: statSync(p).size,
    }
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已损坏时忽略 */ }
  }
}

/**
 * 自动装配 graph-memory（幂等，红线⑤原子写）：
 *  plugin-src 有源码但 profile 未装配 → 原子写 bundles + dependencies link，
 *  再建 node_modules junction；已装配则直接返回 already。
 */
export function mountGraphMemoryLocked() {
  const src = gmSourceStatus()
  if (!src.present) {
    return { ok: false, reason: 'missing-source', message: '未找到 graph-memory 源码（plugin-src/graph-memory 不存在）' }
  }
  if (src.present && !src.entryOk) {
    // 入口缺失（dist/index.js）：装配后启动 dsh web 会 ERR_MODULE_NOT_FOUND 直接失败，
    // 比不装配更糟（issue #65）；明确报错让用户更新应用而不是静默挂载。
    return { ok: false, reason: 'missing-entry', message: 'graph-memory 入口缺失（dist/index.js 不存在），请更新 DSH Desktop 后重试' }
  }
  const current = gmInstalledStatus()
  if (current.installed) {
    return { ok: true, already: true, restartNeeded: false, source: src.version ?? null }
  }
  const manifest = manifestOf()
  manifest.dependencies ??= {}
  manifest.dependencies[GRAPH_MEMORY_PKG] = `link:${gmSourceDir().replace(/\\/g, '/')}`
  manifest.dsh ??= {}
  manifest.dsh.profile ??= {}
  manifest.dsh.profile.bundles ??= []
  if (!manifest.dsh.profile.bundles.includes(GRAPH_MEMORY_PKG)) {
    manifest.dsh.profile.bundles.push(GRAPH_MEMORY_PKG)
  }
  writeJsonSafe(manifestPath(), manifest)
  const linkPath = path.join(profileDir(), 'node_modules', GRAPH_MEMORY_PKG)
  if (!existsSync(linkPath)) {
    mkdirSync(path.dirname(linkPath), { recursive: true })
    symlinkSync(gmSourceDir(), linkPath, 'junction')
  }
  return { ok: true, already: false, restartNeeded: true, source: src.version ?? null }
}

/** dsh-community-market（内置市场）检测：已装 → 状态；未装 → 安装提示。 */
function dshMarketStatus() {
  const manifest = manifestOf()
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const inBundles = bundles.includes(MARKET_PKG)
  const pkgPath = path.join(profileDir(), 'node_modules', MARKET_PKG, 'package.json')
  const pkg = existsSync(pkgPath) ? readJson(pkgPath) : null
  const srcPkgPath = path.join(homeDir(), 'plugin-src', MARKET_PKG, 'package.json')
  const srcPkg = existsSync(srcPkgPath) ? readJson(srcPkgPath) : null
  const version = pkg?.version ?? srcPkg?.version ?? null
  return {
    installed: inBundles || pkg !== null,
    version,
    inBundles,
    nodeModules: pkg !== null,
    installHint: `dsh plugin --profile ${PROFILE_NAME} add ${MARKET_PKG}`,
    repo: 'https://github.com/anywhere-labs/deepseek-harness-desktop/tree/master/dsh-community-market',
  }
}

/** 自身更新缓存（6 小时内复用）。 */
let updateCache = { checkedAt: 0, latest: null, current: null, hasUpdate: false, error: null }

/** 依次尝试各更新源，返回远端 package.json 的 version 字符串。 */
async function fetchLatestVersion() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    for (const url of UPDATE_SOURCES) {
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'dsh-hub/update-check', Accept: 'application/json' },
        })
        if (!res.ok) continue
        const data = await res.json()
        if (data && typeof data.version === 'string' && data.version.trim() !== '') {
          return data.version.trim()
        }
      } catch {
        // 换下一个源
      }
    }
    throw new Error('无法从 GitHub 读取版本信息（raw + jsDelivr 均失败）')
  } finally {
    clearTimeout(timer)
  }
}

/** 立即检查自身更新并写缓存（去重）。 */
export async function checkUpdateLocked() {
  const current = selfVersion()
  try {
    const latest = await fetchLatestVersion()
    updateCache = { checkedAt: Date.now(), latest, current, hasUpdate: hasNewerVersion(latest, current), error: null }
  } catch (error) {
    updateCache = { checkedAt: Date.now(), latest: null, current, hasUpdate: false, error: String((error && error.message) || error) }
  }
  return updateCache
}
//#endregion

class HubGateway extends TypertRemoteService {
  /** 进行中的检查（同一时刻只跑一个）。 */
  checking = null

  /** 最近一次启动自检修复结果（供 status() 返回给 UI 展示）。 */
  lastRepair = null

  /** 进行中的启动修复（去重）。 */
  repairing = null

  /** 最近一次自动/手动 graph-memory 装配结果（供 status() 展示）。 */
  mountResult = null

  constructor(ctx) {
    super(ctx, 'dshHub')
    // 不用装饰器语法：运行时给实例方法打 Remote 标记（与内置市场同法）。
    // 新增 Remote 方法时需同步三处：本列表、lib/typert.js 的 invocations、lib/client.js 的 REMOTE.descriptors。
    const methods = ['status', 'checkNow', 'update', 'updateAll', 'uninstall', 'setEnabled', 'updateAssetPlugin', 'mountGraphMemory', 'checkUpdate', 'updateSelf', 'repairNow']
    for (const method of methods) {
      const decorator = Remote(method)
      decorator(HubGateway.prototype[method], {
        name: method,
        private: false,
        static: false,
        addInitializer: (initializer) => initializer.call(this),
      })
    }
    // 启动自检修复：任何方式启动宿主（客户端/终端）都会加载本插件，加载后先修复再检查更新。
    const repairTimer = setTimeout(() => {
      this.runStartupRepair().catch(() => {})
    }, REPAIR_START_DELAY_MS)
    if (typeof repairTimer.unref === 'function') repairTimer.unref()
    // 每次宿主启动都后台检查一次插件更新（用户要求：每次启动时检查更新）。
    const timer = setTimeout(() => {
      this.refresh().catch(() => {})
    }, CHECK_START_DELAY_MS)
    if (typeof timer.unref === 'function') timer.unref()
    // 每次宿主启动：自动装配 graph-memory（若源码存在且未装配）+ 检查自身更新。
    const hubTimer = setTimeout(() => {
      this.startup().catch(() => {})
    }, START_DELAY_MS)
    if (typeof hubTimer.unref === 'function') hubTimer.unref()
  }

  /** 启动自检修复（去重）；做了修复动作时顺带刷新一次状态让 UI 反映修复结果。 */
  runStartupRepair() {
    if (this.repairing) return this.repairing
    const run = Promise.resolve().then(() => {
      this.lastRepair = repairAll()
      if (this.lastRepair.actions.length > 0) this.refresh().catch(() => {})
      return this.lastRepair
    })
    this.repairing = run.finally(() => {
      this.repairing = null
    })
    return run
  }

  readCache() {
    return readJson(cachePath())
  }

  saveCache(snapshot) {
    try {
      writeJson(cachePath(), snapshot)
    } catch {
      // 缓存写失败不影响检查结果本身
    }
  }

  /** 后台刷新（去重），结果写缓存文件。 */
  refresh() {
    if (this.checking) return this.checking
    const run = collectCheck().then((snapshot) => {
      this.saveCache(snapshot)
      return snapshot
    })
    this.checking = run.finally(() => {
      this.checking = null
    })
    return run
  }

  /** 打开设置页时先读缓存；缓存缺失或过期则触发后台刷新。 */
  async status() {
    const cached = this.readCache()
    if (!cached || Date.now() - Number(cached.checkedAt ?? 0) > CACHE_STALE_MS) {
      this.refresh().catch(() => {})
    }
    let records = 0
    try {
      records = (await loadRecords()).length
    } catch {
      records = -1
    }
    const base = cached
      ? { ...cached, checking: this.checking !== null, repair: this.lastRepair }
      : {
          checkedAt: null,
          checking: true,
          repair: this.lastRepair,
          entries: depsSnapshot().map((dep) => ({ ...dep, latest: null, updateable: false })),
        }
    return {
      ...base,
      self: { name: 'dsh-hub', version: selfVersion() },
      memory: { records, file: memoryPath() },
      graphMemory: {
        source: gmSourceStatus(),
        installed: gmInstalledStatus(),
        db: gmDbStats(),
        mountResult: this.mountResult,
      },
      dshMarket: dshMarketStatus(),
      update: updateCache,
    }
  }

  /** 立即重新检查并等待结果（网络失败时仍返回本机可读到的版本信息）。 */
  async checkNow() {
    try {
      return { ...(await this.refresh()), error: null }
    } catch (error) {
      const snapshot = {
        checkedAt: Date.now(),
        entries: depsSnapshot().map((dep) => ({ ...dep, latest: null, updateable: false })),
      }
      this.saveCache(snapshot)
      return { ...snapshot, error: String((error && error.message) || error) }
    }
  }

  /** 更新一个插件：registry 包走 pnpm；GitHub 来源的本地源码从国内镜像自动下载并覆盖。 */
  async update(name) {
    const safeName = validName(name)
    return runMutuallyExclusive(() => this.updateLocked(safeName))
  }

  /** update 的执行体（已持有写锁，避免并发 pnpm 互相踩踏）。 */
  async updateLocked(safeName) {
    const dep = depsSnapshot().find((entry) => entry.name === safeName)
    if (!dep) return { ok: false, name: safeName, error: '该插件不在本 profile 的依赖里' }
    if (dep.source === 'local') {
      const repo = await resolveGithubRepoAsync(safeName)
      if (!repo) {
        return { ok: false, name: safeName, error: '无法识别该本地插件的来源仓库，请到源码目录手动更新。' }
      }
      const tag = (await queryGithubTag(repo.owner, repo.repo))?.tag
      if (!tag) {
        return { ok: false, name: safeName, error: '没查到该仓库的最新 release/tag，无法自动更新。' }
      }
      if (!hasNewerVersion(tag, dep.current)) {
        return { ok: false, name: safeName, error: '当前已经是最新版本，无需更新。' }
      }
      const result = await updateLocalFromGithub(safeName, repo.owner, repo.repo, tag)
      if (!result.ok) {
        return { ok: false, name: safeName, error: result.error }
      }
      this.refresh().catch(() => {})
      return { ok: true, name: safeName, version: result.version ?? '', needsRestart: true }
    }
    if (dep.source !== 'registry') {
      return { ok: false, name: safeName, error: 'Git 源插件请到源码仓库手动更新，这里只支持 npm registry 插件一键更新。' }
    }
    // 显式版本 pnpm add：@latest 会被 pnpm 11 的 minimumReleaseAge 供应链策略静默抑制
    // （新发布包回退 lockfile 旧版并输出 "Already up to date"，版本停留）。显式版本 pnpm
    // 会自动把该版本加入 minimumReleaseAgeExclude 并安装。queryLatest 走同一 registry。
    const latest = await queryLatest(safeName)
    if (!latest) return { ok: false, name: safeName, error: '无法获取该插件在 npm 的最新版本，请稍后重试。' }
    if (!hasNewerVersion(latest, dep.current)) {
      return { ok: false, name: safeName, error: '当前已经是最新版本，无需更新。' }
    }
    // 版本进 shell 前过 semver 白名单（npm 强制 semver，防 registry 返回异常字符串注入）
    if (!/^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(String(latest))) {
      return { ok: false, name: safeName, error: `registry 返回了异常的版本号（${latest}），已拒绝更新。` }
    }
    const run = await runMutate(['add', `${safeName}@${latest}`])
    const after = depsSnapshot().find((entry) => entry.name === safeName)
    // pnpm 偶发非零退出但实际成功：版本已变化即视为成功。
    if (run.code !== 0 && after?.current === dep.current) {
      return { ok: false, name: safeName, error: cliFailure(run, 'update') }
    }
    if (after?.current === dep.current) {
      return { ok: false, name: safeName, error: `更新后版本未变化（仍为 ${dep.current}），请检查 registry 是否已同步最新版本。` }
    }
    reconcileBundles()
    this.refresh().catch(() => {})
    return { ok: true, name: safeName, version: after?.current ?? '', needsRestart: true }
  }

  /** 批量更新：一条 pnpm add 更新所有可更新的 registry 插件（一个进程替代 N 个，快得多）。 */
  async updateAll() {
    return runMutuallyExclusive(() => this.updateAllLocked())
  }

  /** updateAll 的执行体（已持有写锁）。只处理 registry 插件；本地/GitHub/客户端插件由前端逐个走 update。 */
  async updateAllLocked() {
    const deps = depsSnapshot().filter((entry) => entry.source === 'registry')
    if (deps.length === 0) return { ok: true, results: [] }
    const latestMap = await collectLatestFor(deps.map((entry) => entry.name))
    const targets = deps.filter((entry) => hasNewerVersion(latestMap.get(entry.name) ?? null, entry.current))
    if (targets.length === 0) return { ok: true, results: [] }
    const before = new Map(deps.map((entry) => [entry.name, entry.current]))
    // 显式版本而非 @latest：规避 pnpm 11 minimumReleaseAge 对新发布包的静默抑制（见 updateLocked）。
    // 版本进 shell 前过 semver 白名单（npm 强制 semver，防异常版本字符串注入）。
    const SEMVER_RE = /^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/
    for (const entry of targets) {
      if (!SEMVER_RE.test(String(latestMap.get(entry.name) ?? ''))) {
        return { ok: false, error: `registry 返回了异常的版本号（${entry.name}@${latestMap.get(entry.name)}），已取消批量更新。`, results: [] }
      }
    }
    const specs = targets.map((entry) => `${validName(entry.name)}@${latestMap.get(entry.name)}`)
    const run = await runMutate(['add', ...specs])
    const after = new Map(depsSnapshot().map((entry) => [entry.name, entry.current]))
    const anyChanged = targets.some((entry) => after.get(entry.name) !== before.get(entry.name))
    // pnpm 偶发非零退出但实际成功：只要有版本变化就按成功处理；
    // 显式版本下全部未变一定是异常（registry 未同步等），不再返回假的成功。
    if (!anyChanged) {
      const detail = run.code === 0
        ? '批量更新后版本均未变化（可能 registry 尚未同步最新版本），请稍后重试。'
        : cliFailure(run, 'updateAll')
      return { ok: false, error: detail, results: [] }
    }
    reconcileBundles()
    this.refresh().catch(() => {})
    return {
      ok: true,
      needsRestart: true,
      results: targets.map((entry) => {
        const version = after.get(entry.name) ?? ''
        const changed = version !== before.get(entry.name)
        return { ok: changed, name: entry.name, version, needsRestart: changed }
      }),
    }
  }

  /** 启用/停用一个插件（通过 cordis.patch.yml 的 disable 块，需重启生效）。 */
  setEnabled(name, enabled) {
    const safeName = validName(name)
    return runMutuallyExclusive(() => this.setEnabledLocked(safeName, enabled))
  }

  /** setEnabled 的执行体（已持有写锁）。 */
  setEnabledLocked(safeName, enabled) {
    const dep = depsSnapshot().find((entry) => entry.name === safeName)
    if (!dep) return { ok: false, name: safeName, error: '该插件不在本 profile 的依赖里' }
    const result = setPluginEnabled(safeName, Boolean(enabled))
    if (!result.ok) return { ok: false, name: safeName, error: result.error }
    this.refresh().catch(() => {})
    return { ok: true, name: safeName, id: result.id, enabled: result.enabled, needsRestart: true }
  }

  /** 更新一个 Desktop 作者配套插件（assets/plugins，GitHub 来源）。 */
  async updateAssetPlugin(name) {
    const safeName = validName(name)
    return runMutuallyExclusive(() => this.updateAssetPluginLocked(safeName))
  }

  /** updateAssetPlugin 的执行体（已持有写锁）。 */
  async updateAssetPluginLocked(safeName) {
    const base = assetsPluginsDir()
    if (!base) return { ok: false, name: safeName, error: '未找到 Desktop 作者配套插件目录' }
    let dir = null
    let subdirs = []
    try {
      subdirs = readdirSync(base, { withFileTypes: true }).filter((x) => x.isDirectory())
    } catch {
      // 目录不可读时按"未找到"处理
    }
    for (const d of subdirs) {
      const pkg = readJson(join(base, d.name, 'package.json')) ?? {}
      if (pkg.name === safeName || d.name === safeName) { dir = join(base, d.name); break }
    }
    if (!dir) return { ok: false, name: safeName, error: '未找到该配套插件' }
    const current = readJson(join(dir, 'package.json'))?.version ?? ''
    const repo = await resolveRepoForAssetDir(dir, safeName)
    if (!repo) {
      // 无 GitHub 来源时回退 npm registry（UI 的 updateable 判定同样来自 npm latest 对比，
      // 两者必须一致，否则出现「有更新按钮但点更新必失败」的版本停留）。
      const npmLatest = await queryLatest(safeName)
      if (npmLatest && hasNewerVersion(npmLatest, current)) {
        const result = await updateDirFromNpm(dir, safeName, npmLatest, ASSET_PLUGIN_PRESERVE)
        if (!result.ok) return { ok: false, name: safeName, error: result.error }
        this.refresh().catch(() => {})
        return { ok: true, name: safeName, version: result.version ?? '', needsRestart: true }
      }
      return { ok: false, name: safeName, error: '该配套插件没有可识别的 GitHub 来源，且 npm 无更新可用，无法自动更新' }
    }
    const gh = await queryGithubTag(repo.owner, repo.repo)
    if (gh && gh.tag && hasNewerVersion(gh.tag, current)) {
      const result = await updateLocalFromGithub(safeName, repo.owner, repo.repo, gh.tag, dir, ASSET_PLUGIN_PRESERVE)
      if (!result.ok) return { ok: false, name: safeName, error: result.error }
      this.refresh().catch(() => {})
      return { ok: true, name: safeName, version: result.version ?? '', needsRestart: true }
    }
    // GitHub 无可用 tag 时回退 npm registry 更新
    const npmLatest = await queryLatest(safeName)
    if (npmLatest && hasNewerVersion(npmLatest, current)) {
      const result = await updateDirFromNpm(dir, safeName, npmLatest, ASSET_PLUGIN_PRESERVE)
      if (!result.ok) return { ok: false, name: safeName, error: result.error }
      this.refresh().catch(() => {})
      return { ok: true, name: safeName, version: result.version ?? '', needsRestart: true }
    }
    return { ok: false, name: safeName, error: '当前已经是最新版本，或查不到可用的更新源。' }
  }

  /** 卸载一个插件，并清理 bundle 数组与 cordis.patch.yml 激活行。 */
  async uninstall(name) {
    const safeName = validName(name)
    return runMutuallyExclusive(() => this.uninstallLocked(safeName))
  }

  /** uninstall 的执行体（已持有写锁）。 */
  async uninstallLocked(safeName) {
    const dep = depsSnapshot().find((entry) => entry.name === safeName)
    if (!dep) return { ok: false, name: safeName, error: '该插件不在本 profile 的依赖里' }
    // 卸载前先记下源码目录（卸载后 node_modules 条目就没了，备份目录名要从这里推）
    let realDir = null
    try {
      realDir = realpathSync(packageDir(safeName))
    } catch {}
    const run = await runMutate(['remove', safeName])
    const stillThere = depsSnapshot().some((entry) => entry.name === safeName)
    // pnpm 偶发非零退出但实际成功：依赖已消失即视为成功。
    if (run.code !== 0 && stillThere) {
      return { ok: false, name: safeName, error: cliFailure(run, 'uninstall') }
    }
    const path = manifestPath()
    const manifest = readJson(path)
    if (manifest && Array.isArray(manifest.dsh?.profile?.bundles)) {
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((bundle) => bundle !== safeName)
      writeJson(path, manifest)
    }
    // 先解析 entry id 再删行：removeRow 会改写 patch，之后 findEntryIdForName
    // 就找不到 insert 行了，导致 disable 块残留成孤儿条目（卸载不彻底）。
    const entryId = findEntryIdForName(safeName)
    removeRow(safeName)
    removeDisableForId(entryId)
    try {
      const cache = this.readCache()
      if (cache && Array.isArray(cache.entries)) {
        cache.entries = cache.entries.filter((entry) => entry.name !== safeName)
        this.saveCache(cache)
      }
    } catch {}
    // 顺带清理该插件遗留的更新备份（目录都已卸载，备份没有保留价值）
    if (realDir !== null) {
      try {
        const prefix = `${slugOf(basename(realDir))}-`
        for (const entry of readdirSync(backupsRoot(), { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.startsWith(prefix)) {
            rmSync(join(backupsRoot(), entry.name), { recursive: true, force: true })
          }
        }
      } catch {}
    }
    return { ok: true, name: safeName, needsRestart: true }
  }

  /** 每次宿主启动的后台任务：graph-memory 自动装配 + 自身更新检查（失败不影响其余功能）。 */
  async startup() {
    try {
      const mount = mountGraphMemoryLocked()
      if (!mount.already) this.mountResult = mount
    } catch (error) {
      this.mountResult = { ok: false, reason: 'mount-failed', message: String((error && error.message) || error) }
    }
    try {
      if (Date.now() - Number(updateCache.checkedAt ?? 0) > UPDATE_CACHE_STALE_MS) {
        await checkUpdateLocked()
      }
    } catch {
      // 更新检查失败不影响插件其余功能
    }
  }

  /** 手动触发 graph-memory 装配（幂等；返回 restartNeeded 供客户端提示）。 */
  async mountGraphMemory() {
    try {
      const result = mountGraphMemoryLocked()
      if (!result.already) this.mountResult = result
      return result
    } catch (error) {
      const result = { ok: false, reason: 'mount-failed', message: String((error && error.message) || error) }
      this.mountResult = result
      return result
    }
  }

  /** 立即检查自身更新。 */
  async checkUpdate() {
    return checkUpdateLocked()
  }

  /** 一键更新自身：从发布仓库 main 分支下载，覆盖本插件目录（保留 node_modules），成功即本地版本为最新。 */
  updateSelf() {
    return runMutuallyExclusive(() => this.updateSelfLocked())
  }

  /** updateSelf 的执行体（已持有写锁）。 */
  async updateSelfLocked() {
    const current = selfVersion()
    let latest
    try {
      latest = await fetchLatestVersion()
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) }
    }
    if (!hasNewerVersion(latest, current)) {
      return { ok: false, error: '当前已经是最新版本，无需更新。' }
    }
    const [owner, repo] = UPDATE_REPO.split('/')
    if (!owner || !repo) {
      return { ok: false, error: `更新源配置异常（${UPDATE_REPO}）。` }
    }
    const selfDir = fileURLToPath(new URL('..', import.meta.url))
    // Security (H-01): resolve `main` to an immutable commit SHA before
    // downloading, so the artifact can be pinned/anchored. A branch hash changes
    // on every commit and can never serve as a stable trust anchor.
    const selfSha = await resolveCommitSha(owner, repo, 'main')
    // 复用旧引擎的本地源码更新链路：镜像下载 zip → 解压 → 备份 → 版本倒退保护 →
    // 入口检查 → 失败回滚。
    const result = await updateLocalFromGithub('dsh-hub', owner, repo, selfSha || 'main', selfDir)
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    const applied = selfVersion()
    // 更新成功后本地版本即最新：清掉「有新版本」提示，避免重启前仍显示旧版本。
    updateCache = { checkedAt: Date.now(), latest: applied, current: applied, hasUpdate: false, error: null }
    return { ok: true, version: applied, restart: true }
  }

  /** 手动触发启动自检修复（返回 { at, actions } 供 UI 展示）。 */
  repairNow() {
    return this.runStartupRepair()
  }
}


export const name = 'dsh-hub'
export const inject = ['tools']

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = memoryTools.map((tool) => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-hub: memory tools')
  // 注册 Remote 网关（构造时启动后台任务：自检修复 + 插件更新检查 + 图谱装配 + 自更新检查）。
  new HubGateway(ctx)
}

export {
  HubGateway,
  resolveGithubRepo,
  resolveGithubRepoAsync,
  queryGithubTag,
  queryClientRelease,
  parseGithubOwnerRepo,
  runCurl,
  versionsEqual,
  hasNewerVersion,
  desktopAppDir,
  collectDesktopCheck,
  assetsPluginsDir,
  resolveRepoForAssetDir,
  collectDesktopPlugins,
  searchGithubRepoForName,
  downloadGithubZip,
  updateLocalFromGithub,
  updateDirFromNpm,
  applyNewSource,
  repairAll,
  recoverAtomicWrite,
  repairPatchFile,
}
export default HubGateway

