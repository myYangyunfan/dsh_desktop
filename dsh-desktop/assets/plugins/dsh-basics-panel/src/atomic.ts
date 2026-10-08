/**
 * Shared filesystem helpers: atomic write (temp file + rename, so a reader
 * never sees a half-written file) and case-aware path comparison for the
 * write allowlist on Windows.
 */
import { mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/** Write `content` to `path` atomically (throws a plain Error on failure). */
export async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.dsh-basics-tmp-${process.pid}`
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

/** Compare two absolute paths, case-insensitively on Windows. */
export function samePath(left: string, right: string): boolean {
  const a = resolve(left)
  const b = resolve(right)
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase()
  return a === b
}
