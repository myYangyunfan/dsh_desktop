import { describe, it, expect } from 'vitest'
import { maskArgs, maskValues, maskUrl, MASK } from '../src/features/mcp/secret-mask.ts'

describe('maskArgs', () => {
  it('masks the value after a sensitive flag', () => {
    const out = maskArgs(['cmd', '/c', 'npx', '--password', 'secret123', '--host', 'h'])
    expect(out).toEqual(['cmd', '/c', 'npx', '--password', MASK, '--host', 'h'])
  })

  it('masks --pass and --token forms', () => {
    expect(maskArgs(['--pass', 'pw'])).toEqual(['--pass', MASK])
    expect(maskArgs(['--api-key', 'k'])).toEqual(['--api-key', MASK])
  })

  it('leaves a bare -p (port shorthand) untouched', () => {
    expect(maskArgs(['-p', '22'])).toEqual(['-p', '22'])
  })

  it('leaves ordinary args untouched', () => {
    expect(maskArgs(['--host', 'h', '--port', '22'])).toEqual(['--host', 'h', '--port', '22'])
  })
})

describe('maskValues', () => {
  it('masks every value, keeping keys', () => {
    expect(maskValues({ TAVILY_API_KEY: 'k', PATH: 'p' })).toEqual({ TAVILY_API_KEY: MASK, PATH: MASK })
  })
  it('returns undefined for undefined', () => {
    expect(maskValues(undefined)).toBeUndefined()
  })
})

describe('maskUrl', () => {
  it('masks userinfo password', () => {
    const masked = maskUrl('http://user:pass@example.com/x') ?? ''
    expect(masked).not.toContain(':pass@')
    expect(masked).toContain('@example.com')
  })
  it('keeps a passwordless URL verbatim', () => {
    expect(maskUrl('https://example.com/x')).toBe('https://example.com/x')
  })
})
