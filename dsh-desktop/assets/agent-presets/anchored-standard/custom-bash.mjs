/**
 * custom-bash — a Windows-capable `bash` tool that registers under the SAME
 * name (`bash`) as the official persistent bash, with a Minimal-compatible
 * description, but executes through `ctx.subprocess.spawn` instead of a PTY.
 *
 * WHY: DeepSeek's first-request trajectory anchor keys on the tool SCHEMA
 * matching the RL training distribution (issue #11: persistent
 * bash + str_replace_editor anchored 5/5 at maxTokens=256000, pwsh/read
 * 8/8 standard-like). The official persistent bash uses a PTY, and DSH's PTY
 * backend is linux/darwin-only — `subprocess-local` throws "terminal
 * inspection is unsupported on platform win32". A custom tool that presents
 * the same name and a Minimal-like description but spawns Git Bash through
 * the ordinary (cross-platform) subprocess seam keeps the schema anchor
 * without the PTY dependency.
 *
 * Executable resolution (config `bashPath`):
 *  - explicit absolute path (e.g. `C:\Program Files\Git\bin\bash.exe`), or
 *  - `bash` resolved through `ctx.subprocess.resolveExecutable` (PATH lookup).
 *
 * Semantics mirror the official bash tool: `bash -c <command>` in a fresh
 * process, bounded output, non-zero exit reported not thrown. A model-supplied
 * `workdir` must be absolute and realpath-resolve inside the session cwd root.
 * No sandbox confinement on Windows (the sandbox backend is linux-only); the
 * tool description says so. The bootstrap catalog pairs this with
 * `str_replace_editor` (Minimal's two tools).
 */

import fs from 'node:fs'
import path from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'custom-bash'

/** The subprocess and tools services must exist before this tool can register. */
export const inject = ['subprocess', 'tools']

const DEFAULT_TIMEOUT_MS = 120000
const DEFAULT_MAX_OUTPUT_BYTES = 64000

/** True when `child` is `root` itself or lives inside it (win32 case-insensitive). */
function isInsideRoot(root, child) {
  const from = process.platform === 'win32' ? root.toLowerCase() : root
  const to = process.platform === 'win32' ? child.toLowerCase() : child
  const rel = path.relative(from, to)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Validate a model-supplied `workdir` against the session root. It must be an
 * absolute path that realpath-resolves inside the root; anything else is
 * rejected. This is the only confinement this preset can add: the spawn itself
 * still runs without an OS sandbox (see the tool description).
 */
function resolveWorkdir(requested, sessionCwd) {
  if (typeof requested !== 'string' || requested.length === 0) return undefined
  if (typeof sessionCwd !== 'string' || sessionCwd.length === 0) {
    throw new Error(`bash: refusing workdir "${requested}": session cwd is unavailable, cannot confine it`)
  }
  if (!path.isAbsolute(requested)) {
    throw new Error(`bash: refusing relative workdir "${requested}": an absolute path inside the session root is required`)
  }
  let rootReal
  let dirReal
  try {
    rootReal = fs.realpathSync(sessionCwd)
  } catch {
    throw new Error(`bash: refusing workdir "${requested}": session root "${sessionCwd}" cannot be resolved`)
  }
  try {
    dirReal = fs.realpathSync(requested)
  } catch {
    throw new Error(`bash: refusing workdir "${requested}": path does not exist or cannot be resolved`)
  }
  if (!isInsideRoot(rootReal, dirReal)) {
    throw new Error(`bash: refusing workdir "${requested}": resolves outside the session root "${rootReal}"`)
  }
  return dirReal
}

/** Tool parameter schema for the model-facing command. */
const commandSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The bash command to execute (`bash -c` string domain).',
    },
    workdir: {
      type: 'string',
      description: 'Optional working directory; defaults to the session cwd.',
    },
  },
  required: ['command'],
  additionalProperties: false,
}

/** Register the model-facing `bash` tool. */
export function apply(ctx, config) {
  const bashPath = typeof config?.bashPath === 'string' && config.bashPath.length > 0 ? config.bashPath : 'bash'
  const timeoutMs = Number.isSafeInteger(config?.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS
  const maxOutputBytes = Number.isSafeInteger(config?.maxOutputBytes) && config.maxOutputBytes > 0 ? config.maxOutputBytes : DEFAULT_MAX_OUTPUT_BYTES

  ctx.tools.register({
    name: 'bash',
    description: [
      'Run commands in a bash shell (Git Bash on Windows)',
      '* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.',
      "* You don't have access to the internet via this tool.",
      '* You do have access to a mirror of common linux and python packages via apt and pip.',
      '* State does NOT persist across command calls: each call runs in a fresh shell.',
      "* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.",
      '* Please avoid commands that may produce a very large amount of output.',
      '* NOTE: runs without OS sandbox confinement on Windows (no landlock); treat output as untrusted.',
    ].join('\n'),
    parameters: commandSchema,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const shell = await ctx.subprocess.resolveExecutable(bashPath, undefined, exec?.signal)
      const sessionCwd = exec?.agent?.session?.header?.cwd
      // A model-supplied cwd is validated against the session root before the
      // spawn; omitting it keeps the session cwd (and no cwd when there is none).
      const workdir = typeof args.workdir === 'string' && args.workdir.length > 0
        ? resolveWorkdir(args.workdir, sessionCwd)
        : sessionCwd
      const signal = exec?.signal
      const handle = ctx.subprocess.spawn({
        argv: [shell, '-c', args.command],
        ...workdir !== undefined ? { cwd: workdir } : {},
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: maxOutputBytes },
          stderr: { maxBytes: maxOutputBytes },
        },
        ...signal !== undefined ? { signal } : {},
        graceMs: 3000,
      })
      let outcome
      try {
        outcome = await handle.done
      } catch (error) {
        // A spawn-level failure (bad executable, EPERM) surfaces as a throw,
        // which the runtime turns into an isError result.
        throw new Error(`bash spawn failed: ${String(error)}`)
      }
      let stdout = ''
      let stderr = ''
      try {
        stdout = handle.collected.stdout.readFrom(0).text
        stderr = handle.collected.stderr.readFrom(0).text
      } catch {
        // Collected readers may be unavailable on some backends; tolerate.
      }
      const text = [stdout, stderr].filter((part) => part.length > 0).join('\n')
      const tail = text.length > 0 ? text : `exit code: ${outcome.exitCode} (no output)`
      if (outcome.exitCode !== 0) {
        // Non-zero exit is a reported failure, not a throw: the model sees the
        // command output plus the exit code.
        throw new Error(tail)
      }
      return { text: tail }
    },
  })
}
