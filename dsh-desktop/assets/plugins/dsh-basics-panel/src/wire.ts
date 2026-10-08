/**
 * Wire helpers for the /basics JSON API: bounded body reading, response
 * writing, and the shared error envelope. Every API method returns
 * `{ok: true, value}` on success and `{ok: false, error: {code, message}}`
 * (HTTP 4xx/5xx matching the code) on failure.
 */
import type { BasicsHttpRequest, BasicsHttpResponse } from './context-types.ts'

/** Machine-readable error codes of the basics API. */
export type BasicsErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'forbidden'
  | 'method-error'
  | 'fs-error'
  | 'skill-error'
  | 'rule-error'
  | 'mcp-error'
  | 'archive-error'
  | 'conflict'
  | 'read-only'
  | 'internal'

/** One API failure with its wire code and HTTP status. */
export class BasicsError extends Error {
  constructor(
    readonly code: BasicsErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Success envelope of one API method. */
export interface BasicsOk<T> { ok: true; value: T }

/** Failure envelope of one API method. */
export interface BasicsErr { ok: false; error: { code: BasicsErrorCode; message: string } }

/** Read and parse the JSON request body (bounded; malformed → bad-request). */
export async function readJsonBody(req: BasicsHttpRequest, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > maxBodyBytes) {
      throw new BasicsError('bad-request', 'request body too large')
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BasicsError('bad-request', 'request body is not valid JSON')
  }
}

/** Write a JSON response with the given status. */
export function writeJson(res: BasicsHttpResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/** Write the success envelope. */
export function writeOk(res: BasicsHttpResponse, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

/** Write the failure envelope for any thrown value (unknown → internal 500). */
export function writeError(res: BasicsHttpResponse, error: unknown): void {
  if (error instanceof BasicsError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}

/** Narrow an unknown payload value to a non-empty string, else throw bad-request. */
export function requireString(payload: unknown, key: string): string {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  if (typeof value !== 'string' || value === '') {
    throw new BasicsError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}

/** Narrow an unknown payload value to an optional non-empty string. */
export function optionalString(payload: unknown, key: string): string | undefined {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Narrow an unknown payload value to a boolean. */
export function requireBoolean(payload: unknown, key: string): boolean {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  if (typeof value !== 'boolean') {
    throw new BasicsError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}

/**
 * Narrow an unknown payload value to a non-empty list of unique non-empty
 * strings (order preserved, duplicates dropped).
 *
 * The raw list length is checked BEFORE any de-duplication work, so an
 * oversized body cannot buy a long synchronous scan; the returned list is
 * capped by the same bound.
 * @param payload - request payload.
 * @param key - the array field name.
 * @param max - maximum accepted entries (the batch cap).
 * @returns the de-duplicated ids.
 */
export function requireStringList(payload: unknown, key: string, max: number): string[] {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw new BasicsError('bad-request', `缺少或非法的 "${key}" 列表`)
  }
  if (value.length > max) {
    throw new BasicsError('bad-request', `"${key}" 列表超过单次上限 ${max} 项，请分批操作`)
  }
  const seen = new Set<string>()
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      throw new BasicsError('bad-request', `"${key}" 列表中包含非法项`)
    }
    if (seen.has(entry)) continue
    seen.add(entry)
    ids.push(entry)
  }
  return ids
}
