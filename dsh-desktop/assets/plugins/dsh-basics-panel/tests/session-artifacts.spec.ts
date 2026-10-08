import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  describeSessionArtifact,
  findSessionArtifact,
  isInside,
  isSafeSessionId,
  isSessionLogName,
  removeSessionArtifact,
} from '../src/features/archived/session-artifacts.ts'

let root = ''

/** Create one session directory with the given log file names. */
async function seedSession(projectDir: string, id: string, files: string[]): Promise<string> {
  const directory = join(root, projectDir, id)
  await mkdir(directory, { recursive: true })
  for (const file of files) await writeFile(join(directory, file), 'x'.repeat(10), 'utf8')
  return directory
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'basics-artifacts-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('isSafeSessionId', () => {
  it('accepts real DSH session ids', () => {
    expect(isSafeSessionId('session-00afb9c0-ba8a-4dc3-99e1-4fbc60ddf982')).toBe(true)
    expect(isSafeSessionId('0a7a3e72-f767-42e3-b103-2670cd53c47c')).toBe(true)
  })

  it('refuses traversal, separators, blanks, and dots', () => {
    for (const bad of ['', '..', '.', 'a/b', 'a\\b', '../etc', 'a\u0000b', 'x'.repeat(129)]) {
      expect(isSafeSessionId(bad)).toBe(false)
    }
  })
})

describe('isSessionLogName', () => {
  it('accepts canonical generation logs only', () => {
    expect(isSessionLogName('session.jsonl')).toBe(true)
    expect(isSessionLogName('session.jsonl.zstd')).toBe(true)
    expect(isSessionLogName('session.v3.jsonl')).toBe(true)
    expect(isSessionLogName('session.v3.jsonl.zstd')).toBe(true)
    expect(isSessionLogName('session.jsonl.tmp')).toBe(false)
    expect(isSessionLogName('other.jsonl')).toBe(false)
    expect(isSessionLogName('session.v0.jsonl')).toBe(false)
  })
})

describe('isInside', () => {
  it('accepts a nested path and refuses the root itself and escapes', () => {
    expect(isInside(root, join(root, 'a', 'b'))).toBe(true)
    expect(isInside(root, root)).toBe(false)
    expect(isInside(root, join(root, '..', 'elsewhere'))).toBe(false)
  })
})

describe('findSessionArtifact', () => {
  it('locates a stored session across project directories', async () => {
    await seedSession('--C-Users-me-proj-a--', 'session-1', ['session.jsonl.zstd'])
    await seedSession('--C-Users-me-proj-b--', 'session-2', ['session.v3.jsonl'])
    const found = await findSessionArtifact(root, 'session-2')
    expect(found?.directory).toBe(join(root, '--C-Users-me-proj-b--', 'session-2'))
    expect(found?.logs).toHaveLength(1)
    expect(found?.bytes).toBe(10)
  })

  it('returns undefined for an unknown, unsafe, or non-artifact directory', async () => {
    await seedSession('--proj--', 'session-3', ['notes.txt'])
    expect(await findSessionArtifact(root, 'session-3')).toBeUndefined()
    expect(await findSessionArtifact(root, 'session-missing')).toBeUndefined()
    expect(await findSessionArtifact(root, '../session-3')).toBeUndefined()
    expect(await findSessionArtifact(join(root, 'nope'), 'session-3')).toBeUndefined()
  })

  it('counts every file in the session directory', async () => {
    await seedSession('--proj--', 'session-4', ['session.jsonl', 'session.jsonl.lock'])
    const found = await findSessionArtifact(root, 'session-4')
    expect(found?.logs).toHaveLength(1)
    expect(found?.bytes).toBe(20)
  })
})

describe('describeSessionArtifact', () => {
  it('refuses a directory whose basename is not the session id', async () => {
    await seedSession('--proj--', 'session-5', ['session.jsonl'])
    const other = join(root, '--proj--', 'session-5')
    expect(await describeSessionArtifact(root, 'session-6', other)).toBeUndefined()
    expect(await describeSessionArtifact(root, 'session-5', other)).toBeDefined()
  })
})

describe('removeSessionArtifact', () => {
  it('removes the session directory and reports the freed bytes', async () => {
    await seedSession('--proj--', 'session-7', ['session.jsonl.zstd'])
    const directory = join(root, '--proj--', 'session-7')
    expect(await removeSessionArtifact(root, 'session-7', directory)).toBe(10)
    await expect(stat(directory)).rejects.toThrow()
    // 项目目录保留，仅移除会话目录。
    expect(await readdir(join(root, '--proj--'))).toEqual([])
  })

  it('refuses a second removal and a directory that is not an artifact', async () => {
    await seedSession('--proj--', 'session-8', ['session.jsonl'])
    const directory = join(root, '--proj--', 'session-8')
    await removeSessionArtifact(root, 'session-8', directory)
    await expect(removeSessionArtifact(root, 'session-8', directory)).rejects.toThrow()
    await mkdir(join(root, '--proj--', 'session-9'), { recursive: true })
    await expect(removeSessionArtifact(root, 'session-9', join(root, '--proj--', 'session-9'))).rejects.toThrow()
  })

  it('refuses a directory outside the sessions root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'basics-outside-'))
    try {
      await writeFile(join(outside, 'session.jsonl'), 'x', 'utf8')
      const id = outside.split(/[\\/]/).pop() ?? ''
      await expect(removeSessionArtifact(root, id, outside)).rejects.toThrow()
      expect((await stat(outside)).isDirectory()).toBe(true)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
