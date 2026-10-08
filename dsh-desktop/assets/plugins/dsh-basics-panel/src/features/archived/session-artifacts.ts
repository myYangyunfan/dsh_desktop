/**
 * Session-artifact lookup and deletion (host, filesystem level).
 *
 * DSH's persistence seam has no delete operation, so the archived-sessions
 * feature removes a session's durable artifacts itself: the per-session
 * directory the JSONL backend owns (`<root>/<project-dir>/<session-id>/`,
 * holding one generation log `session[.vN].jsonl[.zstd]` plus any
 * session-local auxiliary files).
 *
 * Two rules keep this safe:
 * - the directory is FOUND by scanning the configured root for a direct child
 *   named exactly like the session id, never re-derived from a cwd (the
 *   project-directory encoding is the backend's private business) and never
 *   taken from the client;
 * - a directory is only removed after it proved to be that session's artifact
 *   (expected basename, inside the root, holds a generation log), so a miss or
 *   a shape change refuses instead of guessing.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Canonical generation log names: `session.jsonl`, `session.jsonl.zstd`,
 * `session.v3.jsonl`, … Version zero keeps the suffix-only name, so `.v0` and
 * leading-zero versions are deliberately not canonical (mirrors the backend's
 * own filename parser).
 */
const SESSION_LOG_NAME = /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/

/** The id must be one plain path segment (DSH session ids are `[session-]<uuid>`). */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/

/** One located session artifact directory. */
export interface SessionArtifact {
  /** Absolute session directory. */
  readonly directory: string
  /** Absolute generation-log paths inside the directory. */
  readonly logs: string[]
  /** Total size of the directory's files (bytes). */
  readonly bytes: number
}

/**
 * Whether a raw session id may be used as one path segment (no separators, no
 * traversal, no NUL). Mirrors the backend's "encode before use" intent: an id
 * that needs escaping is refused rather than re-encoded here.
 * @param id - candidate session id.
 * @returns true when the id is a safe single path segment.
 */
export function isSafeSessionId(id: string): boolean {
  return SAFE_SEGMENT.test(id) && id !== '.' && id !== '..'
}

/** Whether a file name is a canonical session generation log. */
export function isSessionLogName(name: string): boolean {
  return SESSION_LOG_NAME.test(name)
}

/**
 * Whether `target` is strictly inside `root` (no traversal escape).
 * @param root - container directory.
 * @param target - candidate path.
 * @returns true when the resolved target lives under the resolved root.
 */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Describe one candidate session directory, refusing anything that is not the
 * named session's artifact (wrong basename, outside the root, no generation log).
 * @param root - the configured sessions root.
 * @param sessionId - the session the directory must belong to.
 * @param directory - candidate directory (absolute).
 * @returns the artifact facts, or undefined when the candidate is refused.
 */
export async function describeSessionArtifact(
  root: string,
  sessionId: string,
  directory: string,
): Promise<SessionArtifact | undefined> {
  if (!isSafeSessionId(sessionId)) return undefined
  if (basename(resolve(directory)) !== sessionId) return undefined
  if (!isInside(root, directory)) return undefined
  let entries
  try {
    entries = await readdir(resolve(directory), { withFileTypes: true })
  } catch {
    return undefined
  }
  const logs: string[] = []
  let bytes = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(resolve(directory), entry.name)
    const info = await stat(path).catch(() => undefined)
    if (info !== undefined) bytes += info.size
    if (isSessionLogName(entry.name)) logs.push(path)
  }
  if (logs.length === 0) return undefined
  return { directory: resolve(directory), logs, bytes }
}

/**
 * Locate one session's artifact directory under the configured sessions root.
 * The scan mirrors the backend's own session-directory lookup: one level of
 * project directories, then a child named exactly like the session id.
 * @param root - the JSONL backend's sessions root (`$DSH_HOME/sessions` by default).
 * @param sessionId - the stored session id.
 * @returns the located artifact, or undefined when no project directory owns it.
 */
export async function findSessionArtifact(root: string, sessionId: string): Promise<SessionArtifact | undefined> {
  if (!isSafeSessionId(sessionId)) return undefined
  const rootResolved = resolve(root)
  let projectDirs
  try {
    projectDirs = (await readdir(rootResolved, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return undefined
  }
  for (const projectDir of projectDirs) {
    const artifact = await describeSessionArtifact(rootResolved, sessionId, join(rootResolved, projectDir, sessionId))
    if (artifact !== undefined) return artifact
  }
  return undefined
}

/**
 * Delete one located session-artifact directory recursively.
 * @param root - the sessions root the artifact was found under.
 * @param sessionId - the session the directory must belong to.
 * @param directory - the located session directory.
 * @returns the number of bytes removed.
 * @throws when the directory no longer passes the shape checks (never deletes blind).
 */
export async function removeSessionArtifact(root: string, sessionId: string, directory: string): Promise<number> {
  const fresh = await describeSessionArtifact(root, sessionId, directory)
  if (fresh === undefined) {
    throw new Error('会话目录已失效或不是有效的会话产物，已跳过删除')
  }
  await rm(fresh.directory, { recursive: true, force: true })
  return fresh.bytes
}
