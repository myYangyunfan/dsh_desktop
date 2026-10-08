/**
 * Secret masking for MCP server config. The panel never ships a raw secret
 * across the wire: env values, header values, URL userinfo passwords, and
 * the value that follows a sensitive command-line flag are replaced with a
 * fixed marker. The host keeps the raw config in memory only.
 */

/** The display marker for a masked secret. */
export const MASK = '••••'

/** Command-line flags whose following argument is a secret. */
const SENSITIVE_FLAG = /^--?(password|passwd|pass|token|secret|api[-_]?key|authorization)$/i

/** Mask every value in an env/header-style map, keeping the keys. */
export function maskValues(map: Record<string, string> | undefined): Record<string, string> | undefined {
  if (map === undefined) return undefined
  const out: Record<string, string> = {}
  for (const key of Object.keys(map)) out[key] = MASK
  return out
}

/** Mask the argument that follows a sensitive flag; everything else verbatim. */
export function maskArgs(args: string[] | undefined): string[] | undefined {
  if (args === undefined) return undefined
  const out = [...args]
  for (let i = 0; i < out.length; i += 1) {
    const token = out[i]
    if (token !== undefined && SENSITIVE_FLAG.test(token) && i + 1 < out.length) {
      out[i + 1] = MASK
      i += 1
    }
  }
  return out
}

/** Mask the password in a URL's userinfo (e.g. http://user:pass@host). */
export function maskUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.password !== '') {
      parsed.password = MASK
      return parsed.toString()
    }
    return url
  } catch {
    return url
  }
}
