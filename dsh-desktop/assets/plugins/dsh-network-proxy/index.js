/**
 * Host half of the `@local/dsh-network-proxy` bundle.
 *
 * The launch-time proxy policy in `@deepseek-ai/dsh-http-proxy` is resolved once
 * from exported variables and cannot follow an operating-system proxy. This
 * package owns the missing runtime seam: it detects the system proxy (Windows
 * WinINET settings, macOS `scutil`, or a PAC script), installs an undici
 * dispatcher for that policy, and swaps it in place so every plain `fetch()`
 * caller — the model stack, MCP HTTP transports, web fetch and command tools —
 * starts using the new route on the next request, without a restart.
 *
 * The Client half is a General Settings row that speaks to this module over the
 * bundle's own authenticated route, `/api/network-proxy`.
 *
 * @module @local/dsh-network-proxy
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { createRequire } from 'node:module'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

/** The Connection service owns the authenticated browser channel. */
export const inject = ['connection']

/** Exact route the Client posts to; it must live under the shared `/api` channel. */
const ROUTE_PATH = '/api/network-proxy'

/** Modes the preference row can select. */
const MODES = new Set(['direct', 'system', 'custom'])

/** Loopback always bypasses the proxy: Harness's own UI and transports are local. */
const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1', '[::1]']

/** Names a child process reads for its own routing; restored when the plugin unloads. */
const PROXY_ENV_NAMES = [
  'http_proxy', 'HTTP_PROXY',
  'https_proxy', 'HTTPS_PROXY',
  'no_proxy', 'NO_PROXY',
  'NODE_USE_ENV_PROXY',
]

/** Variables the launcher resolves for the built-in proxy plugin, in any casing. */
const LAUNCH_PROXY_NAMES = [
  'http_proxy', 'HTTP_PROXY',
  'https_proxy', 'HTTPS_PROXY',
  'all_proxy', 'ALL_PROXY',
]

/** Windows WinINET settings key that "use a proxy server" writes to. */
const WININET_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

/** One IPv4 octet, so a bypass match cannot accept `127.999.1.1`. */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
/** The whole `127.0.0.0/8` block, not only its first address. */
const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)

// ------------------------------------------------------------------ settings

/** Absolute path of the persisted preference document. */
function settingsFile() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'network-proxy.json')
}

/**
 * Read the persisted preference, falling back to the follow-the-system default.
 * @returns {{ mode: 'direct' | 'system' | 'custom', custom: string }} the saved preference.
 */
function readSettings() {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    const mode = typeof raw === 'object' && raw !== null && MODES.has(raw.mode) ? raw.mode : 'system'
    const custom = typeof raw === 'object' && raw !== null && typeof raw.custom === 'string' ? raw.custom : ''
    return { mode, custom }
  } catch {
    return { mode: 'system', custom: '' }
  }
}

/**
 * Persist the preference atomically so a crash never leaves a half-written file.
 * @param {{ mode: string, custom: string }} settings - the preference to save.
 */
function writeSettings(settings) {
  const file = settingsFile()
  mkdirSync(dirname(file), { recursive: true })
  const body = JSON.stringify({ mode: settings.mode, custom: settings.custom, savedAt: Date.now() }, null, 2)
  const temporary = file + '.tmp'
  writeFileSync(temporary, body, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, file)
}

// ---------------------------------------------------------------- diagnostics

/**
 * Build an error carrying a machine-readable code the Client localizes.
 * @param {string} code - stable diagnostic code.
 * @param {string} message - English detail for logs and unknown-code fallback.
 * @returns {Error & { code: string }} the tagged error.
 */
function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** Log an unexpected failure without ever throwing out of the Host path. */
function log(message, error) {
  try {
    const detail = error instanceof Error ? `${error.message}` : String(error ?? '')
    console.error(`[network-proxy] ${message}${detail === '' ? '' : `: ${detail}`}`)
  } catch { /* a broken console must not break transport policy */ }
}

// ------------------------------------------------------------ address helpers

/**
 * Whether a hostname names this machine.
 * @param {string} hostname - URL hostname, bracketed or not.
 * @returns {boolean} true for loopback or the unspecified address.
 */
function isLoopbackHost(hostname) {
  const host = String(hostname).replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true
  const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1]
  if (mappedHigh !== undefined) return Number.parseInt(mappedHigh, 16) >>> 8 === 127
  return LOOPBACK_IPV4.test(host.startsWith('::ffff:') ? host.slice(7) : host)
}

/**
 * Split one bypass entry into its host and optional port.
 * @param {string} entry - one already-trimmed bypass entry.
 * @returns {{ host: string, port?: string }} the entry's parts.
 */
function splitHostPort(entry) {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']')
    if (close !== -1) {
      const rest = entry.slice(close + 1)
      const host = entry.slice(1, close)
      return rest.startsWith(':') ? { host, port: rest.slice(1) } : { host }
    }
  }
  const colon = entry.indexOf(':')
  if (colon !== -1 && entry.indexOf(':', colon + 1) === -1) {
    return { host: entry.slice(0, colon), port: entry.slice(colon + 1) }
  }
  // A bare IPv6 literal may carry a port (`fd00::1:8080`). Split only when the
  // tail is a port and the head is a valid IPv6 address; otherwise keep the
  // whole entry, so `fc00::/7` and `::ffff:1.2.3.4` stay intact.
  const last = entry.lastIndexOf(':')
  if (last > colon) {
    const host = entry.slice(0, last)
    const port = entry.slice(last + 1)
    if (/^\d{1,5}$/.test(port) && ipv6Value(host) !== null) return { host, port }
  }
  return { host: entry }
}

/**
 * Match one host against a glob entry such as `127.*` or `*.example.com`.
 * @param {string} host - lowercased hostname.
 * @param {string} pattern - entry containing `*`.
 * @returns {boolean} whether the host matches.
 */
function globMatch(host, pattern) {
  const source = '^' + pattern
    .split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
  try { return new RegExp(source, 'i').test(host) } catch { return false }
}

/**
 * Convert one IPv4 address to an unsigned integer.
 * @param {string} address - dotted quad.
 * @returns {number | null} the value, or null when the text is not IPv4.
 */
function ipv4Value(address) {
  const parts = String(address).split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

/**
 * Convert one IPv6 address to a big integer.
 * @param {string} address - IPv6 text, optionally bracketed or with a zone id.
 * @returns {bigint | null} the value, or null when the text is not IPv6.
 */
function ipv6Value(address) {
  let text = String(address).trim().toLowerCase()
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)
  if (text === '' || !text.includes(':')) return null
  // An embedded IPv4 tail (`::ffff:1.2.3.4`) counts as two 16-bit groups.
  const embedded = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (embedded !== null) {
    const octets = embedded[2].split('.').map(Number)
    if (octets.some((octet) => octet > 255)) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${embedded[1]}${high}:${low}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parse = (part) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  let groups
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    value = (value << 16n) | BigInt(Number.parseInt(group, 16))
  }
  return value
}

/**
 * Whether a host is inside one CIDR block (IPv4 or IPv6).
 * @param {string} host - hostname or address.
 * @param {string} cidr - entry such as `10.0.0.0/8` or `fc00::/7`.
 * @returns {boolean} whether it matches.
 */
function inCidr(host, cidr) {
  const [network, bits = '32'] = cidr.split('/')
  const width = Number(bits)
  if (network.includes(':')) {
    const target6 = ipv6Value(host)
    const base6 = ipv6Value(network)
    if (target6 === null || base6 === null || !Number.isInteger(width) || width < 0 || width > 128) return false
    if (width === 0) return true
    const shift = BigInt(128 - width)
    return (target6 >> shift) === (base6 >> shift)
  }
  const target = ipv4Value(host)
  const base = ipv4Value(network)
  if (target === null || base === null || !Number.isInteger(width) || width < 0 || width > 32) return false
  if (width === 0) return true
  const mask = width === 32 ? 0xffffffff : (0xffffffff << (32 - width)) >>> 0
  return (target & mask) === (base & mask)
}

/**
 * Decide whether one URL bypasses the proxy list.
 * @param {string} noProxy - comma/semicolon/space separated bypass entries.
 * @param {URL} url - request URL.
 * @returns {boolean} true when the URL must connect directly.
 */
function bypassesProxy(noProxy, url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  const secure = url.protocol === 'https:' || url.protocol === 'wss:'
  const port = url.port !== '' ? url.port : secure ? '443' : '80'
  for (const raw of String(noProxy ?? '').split(/[,;\s]+/)) {
    const entry = raw.trim().toLowerCase()
    if (entry === '') continue
    if (entry === '*') return true
    if (entry === '<local>') {
      if (!host.includes('.')) return true
      continue
    }
    const { host: entryHost, port: entryPort } = splitHostPort(entry)
    if (entryPort !== undefined && entryPort !== port) continue
    if (entryHost.includes('/')) {
      if (inCidr(host, entryHost)) return true
      continue
    }
    if (entryHost.includes('*')) {
      if (globMatch(host, entryHost)) return true
      continue
    }
    const candidate = entryHost.replace(/^\*?\./, '').replace(/\.$/, '')
    if (candidate === '') continue
    if (host === candidate || host.endsWith(`.${candidate}`)) return true
    // The URL parser serializes IPv6 hosts canonically, so a literal entry such
    // as `::ffff:1.2.3.4` must be compared numerically, not as text.
    if (candidate.includes(':')) {
      const wanted = ipv6Value(candidate)
      if (wanted !== null && ipv6Value(host) === wanted) return true
    }
  }
  return false
}

/**
 * Merge the loopback bypass entries into a bypass list without dropping the user's.
 * @param {string} noProxy - the list as the operating system supplied it.
 * @returns {string} the effective list.
 */
function withLoopback(noProxy) {
  const entries = String(noProxy ?? '').split(/[,;\s]+/).map((entry) => entry.trim()).filter((entry) => entry !== '')
  if (entries.includes('*')) return '*'
  const present = new Set(entries.map((entry) => entry.toLowerCase()))
  return [...entries, ...LOOPBACK_NO_PROXY.filter((entry) => !present.has(entry))].join(',')
}

// ------------------------------------------------------------ system detection

/** Latest detection result, reused for a few seconds to avoid hammering the OS. */
let detectionCache = null

/**
 * Parse the value table `reg query` prints for the WinINET key.
 *
 * Lines carry four spaces between the name, the type and the data; a value name
 * may itself contain spaces (`User Agent`).
 * @param {string} stdout - the command output.
 * @returns {Map<string, string>} value name → textual value.
 */
function parseRegQuery(stdout) {
  const values = new Map()
  for (const line of String(stdout).split(/\r?\n/)) {
    // An empty REG_SZ may print no data column at all, so the last group is optional.
    const match = /^\s{2,}(\S.*?)\s{4}(REG_[A-Z_]+)(?:\s{4}(.*))?$/.exec(line)
    if (match === null) continue
    values.set(match[1].trim(), (match[3] ?? '').trim())
  }
  return values
}

/**
 * Run `reg.exe` and parse its value table.
 * @returns {Promise<Map<string, string>>} value name → textual value.
 */
function readWininetValues() {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', ['query', WININET_KEY], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(parseRegQuery(String(stdout)))
    })
  })
}

/**
 * Parse the `scutil --proxy` output.
 *
 * The address is reported even while its switch is off, so the row can show a
 * dormant proxy the user can enable. `ExceptionsList` is printed as an array
 * (`ExceptionsList : <array> { 0 : localhost ... }`), which a line-oriented
 * value table cannot read; parse the array body separately. `scutil` prints
 * IPv6 literals bare, while URL syntax requires brackets.
 * @param {string} text - the command output.
 * @returns {{ enabled: boolean, servers: { http: string | null, https: string | null }, bypass: string, pacUrl: string, dormant: string | null }} parsed proxy state.
 */
function parseMacProxy(text) {
  const fields = new Map()
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(line)
    if (match !== null) fields.set(match[1], match[2].trim())
  }
  const address = (scheme) => {
    const host = fields.get(`${scheme}Proxy`) ?? ''
    const port = fields.get(`${scheme}Port`) ?? ''
    if (host === '' || port === '') return null
    const authority = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
    return `http://${authority}:${port}`
  }
  // Only a scheme whose switch is on may route traffic; a disabled scheme
  // keeps its host/port fields populated in `scutil`.
  const enabledAddress = (scheme) => (fields.get(`${scheme}Enable`) === '1' ? address(scheme) : null)
  const arrayBody = /ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)\}/.exec(String(text))?.[1] ?? ''
  const bypassEntries = arrayBody.split(/\r?\n/)
    .map((line) => /^\s*\d+\s*:\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((entry) => typeof entry === 'string' && entry !== '')
  if (fields.get('ExcludeSimpleHostnames') === '1') bypassEntries.push('<local>')
  const bypass = bypassEntries.join(';')
  const pacUrl = fields.get('ProxyAutoConfigEnable') === '1' ? (fields.get('ProxyAutoConfigURLString') ?? '') : ''
  const http = enabledAddress('HTTP')
  const https = enabledAddress('HTTPS')
  return {
    enabled: http !== null || https !== null || pacUrl !== '',
    servers: { http, https },
    bypass,
    pacUrl,
    dormant: address('HTTP') ?? address('HTTPS'),
  }
}

/**
 * Read the macOS system proxy through `scutil --proxy`.
 * @returns {Promise<ReturnType<typeof parseMacProxy>>} parsed proxy state.
 */
function readMacProxy() {
  return new Promise((resolve, reject) => {
    execFile('scutil', ['--proxy'], { timeout: 5000 }, (error, stdout) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(parseMacProxy(String(stdout)))
    })
  })
}

/**
 * Turn one `ProxyServer` value into per-scheme proxy URLs.
 * Windows writes either `host:port` or `scheme=host:port;scheme=host:port`.
 * @param {string} raw - the registry value.
 * @returns {{ http: string | null, https: string | null, socks: string | null }} parsed addresses.
 */
function parseProxyServer(raw) {
  const result = { http: null, https: null, socks: null }
  const text = String(raw ?? '').trim()
  if (text === '') return result
  const parts = text.split(';').map((part) => part.trim()).filter((part) => part !== '')
  for (const part of parts) {
    const equals = part.indexOf('=')
    if (equals === -1) {
      const url = toProxyUrl(part)
      if (url !== null) {
        if (result.http === null) result.http = url
        if (result.https === null) result.https = url
      }
      continue
    }
    const scheme = part.slice(0, equals).trim().toLowerCase()
    const value = part.slice(equals + 1).trim()
    if (scheme === 'socks' || scheme === 'socks5' || scheme === 'socks4') {
      if (result.socks === null) result.socks = value
      continue
    }
    const url = toProxyUrl(value)
    if (url === null) continue
    if (scheme === 'http') result.http = url
    else if (scheme === 'https') result.https = url
  }
  return result
}

/**
 * Normalize one proxy address to an `http://` or `https://` URL.
 * @param {string} value - `host:port`, a bracketed IPv6 authority, or a URL.
 * @returns {string | null} the normalized URL, or null when unusable.
 */
function toProxyUrl(value) {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)
  if (schemeMatch !== null) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme === 'socks' || scheme === 'socks4' || scheme === 'socks5' || scheme === 'socks5h') return null
    if (scheme !== 'http' && scheme !== 'https') return null
    try {
      const url = new URL(text)
      if (!hasValidCredentials(url)) return null
      // Keep credentials the registry wrote; only the authority is needed.
      const auth = url.username === ''
        ? ''
        : `${url.username}${url.password === '' ? '' : `:${url.password}`}@`
      const authority = url.port === '' ? `${url.host}:${scheme === 'https' ? '443' : '80'}` : url.host
      return `${scheme}://${auth}${authority}`
    } catch { return null }
  }
  if (text.startsWith('[')) {
    return /^\[[^\]]+\]:\d+$/.test(text) ? `http://${text}` : null
  }
  if (text.includes('@')) {
    // WinINET sometimes stores credentials without a scheme (`user:pass@host:port`).
    const at = text.lastIndexOf('@')
    const userinfo = text.slice(0, at)
    const authority = text.slice(at + 1)
    if (userinfo === '' || !/^(?:\[[^\]]+\]|[^:/\s]+):\d+$/.test(authority)) return null
    try {
      const url = new URL(`http://${text}`)
      if (url.username === '' || !hasValidCredentials(url)) return null
      const auth = url.password === '' ? `${url.username}@` : `${url.username}:${url.password}@`
      return `http://${auth}${authority}`
    } catch { return null }
  }
  const colon = text.indexOf(':')
  if (colon !== -1 && text.indexOf(':', colon + 1) !== -1) {
    // Bare IPv6 literal without a port is not a proxy address.
    return null
  }
  return /^[^:/\s]+:\d+$/.test(text) ? `http://${text}` : null
}

/**
 * The authority of a URL exactly as it was written, without userinfo.
 * @param {string} text - the raw URL text.
 * @returns {string} the authority, or an empty string.
 */
function rawAuthority(text) {
  const start = text.indexOf('//')
  const rest = start === -1 ? text : text.slice(start + 2)
  const end = rest.search(/[/?#]/)
  const authority = end === -1 ? rest : rest.slice(0, end)
  const at = authority.lastIndexOf('@')
  return at === -1 ? authority : authority.slice(at + 1)
}

/**
 * The port the text writes, even when it is the scheme's default.
 *
 * WHATWG parsing empties `.port` for `http://host:80`, so a typed default port
 * is otherwise indistinguishable from no port at all — and `http://host` with
 * no port must stay invalid.
 * @param {string} text - the raw URL text.
 * @returns {string | null} the port digits, or null when the authority has none.
 */
function explicitPort(text) {
  const match = /^(?:\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(rawAuthority(text))
  if (match === null) return null
  const port = Number(match[1])
  return port >= 1 && port <= 65535 ? String(port) : null
}

/**
 * Validate a user-supplied proxy URL.
 * @param {string} value - text from the settings field.
 * @returns {string | null} normalized URL, or null when invalid.
 */
function normalizeCustomProxy(value) {
  const text = String(value ?? '').trim()
  if (text === '') return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname === '') return null
    // `url.port` is empty for the scheme's default port, so recover the digits
    // from the text: `http://host:80` is a valid preference, `http://host` is not.
    const port = url.port !== '' ? url.port : explicitPort(text)
    if (port === null) return null
    if (!hasValidCredentials(url)) return null
    // `url.username`/`url.password` are already percent-encoded; re-encoding
    // them would double-encode a correctly written credential.
    const credentials = url.username === ''
      ? ''
      : `${url.username}${url.password === '' ? '' : `:${url.password}`}@`
    return `${url.protocol}//${credentials}${url.hostname}:${port}`
  } catch { return null }
}

/**
 * Strip credentials from a proxy URL before it reaches the settings row.
 * @param {string | null} value - a proxy URL.
 * @returns {string | null} the address without user info.
 */
function sanitizeProxy(value) {
  if (typeof value !== 'string' || value === '') return value ?? null
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return `${url.protocol}//${url.host}`
  } catch { return value }
}

/**
 * Whether a URL's userinfo is percent-encoded correctly.
 *
 * WHATWG URL parsing leaves malformed escapes such as `%zz` in place, but
 * undici's ProxyAgent decodes them per request and throws `URIError: URI
 * malformed`. Reject such a URL at validation time instead.
 * @param {URL} url - parsed URL.
 * @returns {boolean} true when both credential fields decode.
 */
function hasValidCredentials(url) {
  try {
    decodeURIComponent(url.username)
    decodeURIComponent(url.password)
    return true
  } catch { return false }
}

/**
 * Strip only the userinfo from a URL, keeping its path and query.
 * @param {string | null} value - an absolute URL.
 * @returns {string | null} the URL without credentials.
 */
function stripUserInfo(value) {
  if (typeof value !== 'string' || value === '') return value ?? null
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return url.href
  } catch { return value }
}

/**
 * Upper bound on a PAC script. Compiling is synchronous and cannot be
 * interrupted, but a statement-dense 1 MiB script compiles in tens of
 * milliseconds, so this cap keeps the worst case short.
 */
const MAX_PAC_BYTES = 1024 * 1024

/**
 * Download a PAC script with redirects, bounded by a timeout.
 * @param {string} url - PAC URL.
 * @returns {Promise<string>} the script text.
 */
function downloadText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) {
      reject(new Error('too many redirects'))
      return
    }
    let parsed
    try { parsed = new URL(url) } catch { reject(new Error('invalid PAC URL')); return }
    const client = parsed.protocol === 'https:' ? httpsGet : httpGet
    const request = client(parsed, { timeout: 8000 }, (response) => {
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && typeof response.headers.location === 'string') {
        response.resume()
        const next = new URL(response.headers.location, parsed).toString()
        downloadText(next, redirects + 1).then(resolve, reject)
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new Error(`PAC HTTP ${status}`))
        return
      }
      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_PAC_BYTES) {
          request.destroy(new Error('PAC script too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('PAC request timed out')))
    request.on('error', reject)
  })
}

/**
 * Helpers installed *inside* the PAC context. This function is serialized with
 * `toString()` and evaluated in the new realm, so every helper is a vm-realm
 * function: handing host functions to the script would expose the host
 * `Function` constructor through `helper.constructor` and make the sandbox
 * escapable.
 */
function pacHelpers() {
  globalThis.__npArgs = ['', '']
  globalThis.alert = function () {}
  globalThis.console = { log: function () {}, warn: function () {}, error: function () {} }
  globalThis.dnsResolve = function () { return '' }
  globalThis.myIpAddress = function () { return '127.0.0.1' }
  globalThis.isResolvable = function () { return true }
  globalThis.isPlainHostName = function (host) { return String(host).indexOf('.') === -1 }
  globalThis.dnsDomainIs = function (host, domain) { return String(host).endsWith(String(domain)) }
  globalThis.localHostOrDomainIs = function (host, hostdom) {
    return hostdom === host || String(hostdom).startsWith(String(host) + '.')
  }
  globalThis.isInNet = function (host, pattern, mask) {
    function value(address) {
      const parts = String(address).split('.')
      if (parts.length !== 4) return -1
      let result = 0
      for (let index = 0; index < 4; index += 1) {
        if (!/^\d{1,3}$/.test(parts[index])) return -1
        const octet = Number(parts[index])
        if (octet > 255) return -1
        result = result * 256 + octet
      }
      return result >>> 0
    }
    const address = value(host)
    const network = value(pattern)
    const netmask = value(mask)
    if (address < 0 || network < 0 || netmask < 0) return false
    return (address & netmask) === (network & netmask)
  }
  globalThis.shExpMatch = function (input, expression) {
    const source = '^' + String(expression).split('*').map(function (part) {
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('.*') + '$'
    try { return new RegExp(source, 'i').test(String(input)) } catch { return false }
  }
  globalThis.weekdayRange = function () { return true }
  globalThis.dateRange = function () { return true }
  globalThis.timeRange = function () { return true }
  globalThis.__npSetArgs = function (url, host) { __npArgs[0] = url; __npArgs[1] = host }
}

/** When a PAC evaluation last timed out or threw, for a rate-limited code. */
let pacFailureAt = 0

/**
 * Validate one `PROXY`/`HTTPS` token authority from a PAC result.
 * @param {'http' | 'https'} scheme - proxy scheme.
 * @param {string} authority - `host:port` or `user:pass@host:port`.
 * @returns {string | null} the proxy URL, or null when unusable.
 */
function proxyTokenUrl(scheme, authority) {
  try {
    const url = new URL(`${scheme}://${authority}`)
    if (url.hostname === '' || url.port === '') return null
    if (!hasValidCredentials(url)) return null
    const auth = url.username === ''
      ? ''
      : `${url.username}${url.password === '' ? '' : `:${url.password}`}@`
    return `${scheme}://${auth}${url.host}`
  } catch { return null }
}

/**
 * Compile a PAC script into a synchronous evaluator bound to one context.
 *
 * The context is created without a host sandbox object, every helper is defined
 * inside the new realm, string code generation is disabled, and each call goes
 * through a precompiled script with a timeout. Node documents `vm` as not a
 * security boundary, but a PAC can no longer reach the Host realm through a
 * host function or host object.
 * @param {string} script - PAC source.
 * @param {string} pacUrl - origin used in diagnostics and stack traces.
 * @returns {(url: URL) => { proxy: string | null, socks: boolean, failed: boolean }} the evaluator.
 */
function createPacEvaluator(script, pacUrl) {
  if (Buffer.byteLength(String(script), 'utf8') > MAX_PAC_BYTES) throw new Error('PAC script too large')
  const options = { codeGeneration: { strings: false, wasm: false }, name: 'pac' }
  const context = typeof vm.constants?.DONT_CONTEXTIFY === 'symbol'
    ? vm.createContext(vm.constants.DONT_CONTEXTIFY, options)
    : vm.createContext(Object.create(null), options)
  vm.runInContext(`(${pacHelpers.toString()})()`, context, { timeout: 1000, filename: pacUrl })
  vm.runInContext(String(script), context, { timeout: 3000, filename: pacUrl })
  const available = vm.runInContext('typeof FindProxyForURL === "function"', context, { timeout: 1000 })
  if (available !== true) throw new Error('FindProxyForURL is missing')
  const setArgs = vm.runInContext('__npSetArgs', context, { timeout: 1000 })
  const call = new vm.Script('FindProxyForURL(__npArgs[0], __npArgs[1])', { filename: pacUrl })
  return (url) => {
    let result
    try {
      setArgs(url.href, url.hostname)
      result = String(call.runInContext(context, { timeout: 100 }) ?? '')
    } catch (error) {
      pacFailureAt = Date.now()
      log('PAC evaluation failed', error)
      return { proxy: null, socks: false, failed: true }
    }
    for (const raw of result.split(';')) {
      const token = raw.trim()
      if (token === '') continue
      if (/^direct$/i.test(token)) return { proxy: null, socks: false, failed: false }
      const match = /^(proxy|https)\s+(\S+)$/i.exec(token)
      if (match !== null) {
        const scheme = match[1].toLowerCase() === 'https' ? 'https' : 'http'
        const proxy = proxyTokenUrl(scheme, match[2])
        if (proxy === null) {
          pacFailureAt = Date.now()
          log(`PAC returned an unusable ${scheme} proxy address`)
          return { proxy: null, socks: false, failed: true }
        }
        return { proxy, socks: false, failed: false }
      }
      if (/^socks/i.test(token)) return { proxy: null, socks: true, failed: false }
    }
    return { proxy: null, socks: false, failed: false }
  }
}

/** The last compiled PAC script, reused until it is a minute old or forced. */
let pacCache = null

/**
 * Download and compile one PAC script, reusing the last compilation for a
 * minute so opening the settings row does not re-fetch it.
 * @param {string} url - PAC URL.
 * @param {boolean} force - ignore the cached script.
 * @returns {Promise<{ url: string, script: string, evaluator: Function, key: string, fetchedAt: number }>} the cached record.
 */
async function loadPacScript(url, force = false) {
  const now = Date.now()
  if (!force && pacCache !== null && pacCache.url === url && now - pacCache.fetchedAt < 60_000) return pacCache
  const script = await downloadText(url)
  const evaluator = createPacEvaluator(script, url)
  const key = createHash('sha1').update(script).digest('hex')
  pacCache = { url, script, evaluator, key, fetchedAt: now }
  return pacCache
}

/**
 * Detect the operating-system proxy, caching the answer briefly.
 * @param {boolean} force - ignore the cache and re-read the OS setting.
 * @param {boolean} forcePac - re-download the PAC script instead of using the minute cache.
 * @returns {Promise<object>} the detection result.
 */
async function detectSystemProxy(force = false, forcePac = false) {
  const now = Date.now()
  if (!force && detectionCache !== null && now - detectionCache.checkedAt < 5000) return detectionCache

  const detection = {
    supported: process.platform === 'win32' || process.platform === 'darwin',
    platform: process.platform,
    enabled: false,
    server: '',
    http: null,
    https: null,
    bypass: '',
    pacUrl: '',
    pacEvaluator: null,
    pacKey: '',
    dormant: null,
    reachable: null,
    checkedAt: now,
    codes: [],
  }

  if (process.platform === 'win32') {
    let values
    try {
      values = await readWininetValues()
    } catch (error) {
      log('cannot read WinINET settings', error)
      detection.codes.push('system-unreadable')
      detectionCache = detection
      return detection
    }
    const proxyEnabled = Number.parseInt(values.get('ProxyEnable') ?? '0', 16) === 1
    const autoDetect = Number.parseInt(values.get('AutoDetect') ?? '0', 16) === 1
    const rawServer = values.get('ProxyServer') ?? ''
    const bypass = values.get('ProxyOverride') ?? ''
    const pacUrl = values.get('AutoConfigURL') ?? ''
    const servers = parseProxyServer(rawServer)
    detection.server = rawServer
    detection.bypass = bypass
    detection.pacUrl = pacUrl
    if (servers.socks !== null) detection.codes.push('socks-unsupported')
    if (proxyEnabled) {
      detection.http = servers.http
      detection.https = servers.https ?? servers.http
    }
    // A PAC script is an independent WinINET switch: honour it even while the
    // manual "use a proxy server" box is off.
    detection.enabled = proxyEnabled || pacUrl !== ''
    if (!proxyEnabled && pacUrl === '') {
      detection.codes.push('system-disabled')
      detection.dormant = servers.http ?? servers.https
    }
    if (autoDetect && pacUrl === '') detection.codes.push('wpad-unsupported')
  } else if (process.platform === 'darwin') {
    try {
      const mac = await readMacProxy()
      detection.enabled = mac.enabled
      detection.http = mac.servers.http
      detection.https = mac.servers.https
      detection.bypass = mac.bypass
      detection.pacUrl = mac.pacUrl
      if (!mac.enabled) {
        detection.codes.push('system-disabled')
        detection.dormant = mac.dormant ?? null
      }
    } catch (error) {
      log('cannot read scutil proxy', error)
      detection.codes.push('system-unreadable')
    }
  } else {
    detection.codes.push('system-unreadable')
  }

  if (detection.pacUrl !== '') {
    detection.codes.push('pac-detected')
    try {
      const pac = await loadPacScript(detection.pacUrl, forcePac)
      detection.pacEvaluator = pac.evaluator
      detection.pacKey = pac.key
      const sample = pac.evaluator(new URL('https://api.deepseek.com/'))
      if (sample.failed) detection.codes.push('pac-failed')
      if (sample.socks) detection.codes.push('socks-unsupported')
      if (detection.http === null) detection.http = sample.proxy
      if (detection.https === null) detection.https = sample.proxy ?? detection.http
    } catch (error) {
      log('PAC script failed', error)
      detection.codes.push('pac-failed')
      detection.enabled = detection.http !== null || detection.https !== null
    }
  }

  if (detection.enabled && detection.http === null && detection.https === null && detection.pacEvaluator === null) {
    detection.codes.push('system-none')
  }
  if (detection.enabled && (detection.http !== null || detection.https !== null)) {
    detection.reachable = await probeCached(detection.http ?? detection.https, force)
  }
  detectionCache = detection
  return detection
}

/**
 * Check whether a proxy endpoint accepts TCP connections.
 * @param {string | null} proxyUrl - proxy address.
 * @param {number} timeoutMs - connection budget.
 * @returns {Promise<boolean | null>} reachability, or null without an address.
 */
function probeTcp(proxyUrl, timeoutMs = 2000) {
  if (proxyUrl === null || proxyUrl === undefined) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    let socket
    const finish = (value) => {
      if (settled) return
      settled = true
      try { socket?.destroy() } catch { /* already closed */ }
      resolve(value)
    }
    try {
      const url = new URL(proxyUrl)
      const host = url.hostname.replace(/^\[|\]$/g, '')
      const port = Number(url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : url.port)
      socket = connect({ host, port })
      socket.setTimeout(timeoutMs)
      socket.once('connect', () => finish(true))
      socket.once('timeout', () => finish(false))
      socket.once('error', () => finish(false))
    } catch {
      resolve(false)
    }
  })
}

/** Last reachability probe, reused for a few seconds across detect and apply. */
let probeCache = null

/**
 * Probe one proxy endpoint, reusing a recent answer.
 * @param {string | null} proxyUrl - proxy address.
 * @param {boolean} force - ignore the cached answer.
 * @returns {Promise<boolean | null>} reachability, or null without an address.
 */
async function probeCached(proxyUrl, force = false) {
  if (proxyUrl === null || proxyUrl === undefined) return null
  const now = Date.now()
  if (!force && probeCache !== null && probeCache.url === proxyUrl && now - probeCache.at < 15_000) {
    return probeCache.reachable
  }
  const reachable = await probeTcp(proxyUrl)
  probeCache = { url: proxyUrl, reachable, at: now }
  return reachable
}

// -------------------------------------------------------------------- routing

/**
 * Resolve which proxy one URL goes through under one policy.
 * @param {URL} url - request URL.
 * @param {object} policy - the active policy.
 * @returns {string | null} the proxy URL, or null for a direct connection.
 */
function proxyForUrl(url, policy) {
  if (policy.kind !== 'proxy') return null
  if (isLoopbackHost(url.hostname)) return null
  if (bypassesProxy(policy.noProxy, url)) return null
  if (typeof policy.pac === 'function') {
    const result = policy.pac(url)
    if (result.socks) return null
    if (result.failed) {
      pacFailureAt = Date.now()
      // Fall back to a statically detected proxy when one exists; a PAC-only
      // policy has nothing to fall back to and goes direct with a diagnostic.
      if (url.protocol === 'https:') return policy.https ?? policy.http ?? null
      if (url.protocol === 'http:') return policy.http ?? policy.https ?? null
      return null
    }
    return result.proxy
  }
  if (url.protocol === 'https:') return policy.https ?? policy.http ?? null
  if (url.protocol === 'http:') return policy.http ?? policy.https ?? null
  return null
}

// ---------------------------------------------------------------- dispatcher

/** Resolved undici module namespace, shared by every swap in this process. */
let undiciPromise = null

/**
 * Load the undici copy shipped with the running Harness.
 *
 * Node's built-in `fetch` resolves the global dispatcher from a symbol that a
 * userland undici also writes, so the exact copy the Host already uses is the
 * safest dispatcher implementation to share.
 * @returns {Promise<object>} the undici namespace.
 */
function loadUndici() {
  if (undiciPromise === null) {
    undiciPromise = (async () => {
      const candidates = []
      if (typeof process.argv[1] === 'string' && process.argv[1] !== '') candidates.push(process.argv[1])
      if (typeof process.argv[2] === 'string' && process.argv[2] !== '') {
        candidates.push(join(process.argv[2], 'package.json'))
      }
      for (const base of candidates) {
        try {
          const resolved = createRequire(base).resolve('undici')
          return await import(pathToFileURL(resolved).href)
        } catch { /* try the next anchor */ }
      }
      throw codedError('undici-unavailable', 'Could not resolve the bundled undici module')
    })()
    undiciPromise.catch(() => { undiciPromise = null })
  }
  return undiciPromise
}

/** The dispatcher originally installed before this plugin first swapped one. */
let baseline = null
/** The dispatcher this plugin currently owns. */
let current = null
/** Proxy environment values as they were before this plugin first published its own. */
let envBaseline = null

/**
 * Build the dispatcher for one policy.
 * @param {object} policy - the policy to route by.
 * @param {object} undici - the loaded undici namespace.
 * @returns {object} the dispatcher.
 */
function createDispatcher(policy, undici) {
  if (policy.kind === 'direct') return new undici.Agent()
  return new undici.Agent({
    factory(origin, options) {
      let url
      try { url = new URL(origin.toString()) } catch { return new undici.Pool(origin, options) }
      const proxy = proxyForUrl(url, policy)
      if (proxy === null) return new undici.Pool(origin, options)
      try {
        return new undici.ProxyAgent({ ...options, uri: proxy })
      } catch (error) {
        // A malformed proxy URI must not break every request in the process.
        // This is not a PAC failure; the reachability probe reports it.
        log('cannot create a ProxyAgent for the selected proxy', error)
        return new undici.Pool(origin, options)
      }
    },
  })
}

/**
 * Snapshot every proxy environment name this plugin publishes.
 * @returns {Record<string, string | undefined>} the snapshot.
 */
function snapshotProxyEnv() {
  const snapshot = {}
  for (const name of PROXY_ENV_NAMES) snapshot[name] = process.env[name]
  return snapshot
}

/**
 * Write a set of proxy environment values; `undefined` removes a name.
 * @param {Record<string, string | undefined>} values - names to apply.
 */
function writeProxyEnv(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
}

/**
 * Whether the launcher published a proxy before this plugin touched anything.
 *
 * `envBaseline` is the state the plugin first saw, so this stays true even
 * after the plugin has installed its own policy.
 * @returns {boolean} true when at least one proxy variable carries a value.
 */
function hasLaunchProxy() {
  if (envBaseline === null) envBaseline = snapshotProxyEnv()
  return LAUNCH_PROXY_NAMES.some((name) => {
    const value = envBaseline[name]
    return typeof value === 'string' && value.trim() !== ''
  })
}

/**
 * Publish the active policy to the environment command tools inherit.
 * A direct policy removes every proxy name so child processes connect directly too.
 * @param {object} policy - the policy being installed.
 */
function publishProxyEnv(policy) {
  if (envBaseline === null) envBaseline = snapshotProxyEnv()
  writeProxyEnv(envBaseline)
  if (policy.kind === 'proxy' && typeof policy.pac === 'function') {
    // A PAC route is host-dependent and cannot be flattened into one proxy
    // URL; children keep the launch environment instead of a misleading sample.
    return
  }
  if (policy.kind === 'direct') {
    writeProxyEnv(Object.fromEntries(PROXY_ENV_NAMES.map((name) => [name, undefined])))
    return
  }
  const http = policy.http ?? policy.https ?? null
  const https = policy.https ?? policy.http ?? null
  writeProxyEnv({
    http_proxy: http ?? undefined,
    HTTP_PROXY: http ?? undefined,
    https_proxy: https ?? undefined,
    HTTPS_PROXY: https ?? undefined,
    no_proxy: policy.noProxy === '' ? undefined : policy.noProxy,
    NO_PROXY: policy.noProxy === '' ? undefined : policy.noProxy,
    NODE_USE_ENV_PROXY: http === null && https === null ? undefined : '1',
  })
}

/** The fingerprint of the policy this plugin currently has installed. */
let installedKey = null

/**
 * Install one policy as the process-wide dispatcher and publish its environment.
 * @param {object} policy - the policy to install.
 * @returns {Promise<void>} resolves once the swap is live.
 */
async function installPolicy(policy) {
  const key = policyFingerprint(policy)
  if (installedKey === key) return
  if (policy.kind === 'inherit') {
    // Hand the process back to whatever ran before this plugin: its dispatcher
    // when this plugin already swapped one, and the launch environment always.
    const previous = current
    current = null
    installedKey = key
    if (baseline !== null) {
      try { baseline.undici.setGlobalDispatcher(baseline.dispatcher) } catch (error) { log('cannot restore the launch dispatcher', error) }
    }
    if (envBaseline !== null) writeProxyEnv(envBaseline)
    if (previous !== null) {
      void previous.dispatcher.close().catch(() => {})
    }
    return
  }
  const undici = await loadUndici()
  const dispatcher = createDispatcher(policy, undici)
  const previous = current
  if (baseline === null) baseline = { undici, dispatcher: undici.getGlobalDispatcher() }
  undici.setGlobalDispatcher(dispatcher)
  current = { undici, dispatcher }
  installedKey = key
  publishProxyEnv(policy)
  if (previous !== null) {
    // Do not await: an in-flight model stream may still be draining its old pool.
    void previous.dispatcher.close().catch(() => {})
  }
}

/** Restore the launch-time dispatcher and environment. */
async function restorePolicy() {
  const owned = current
  current = null
  installedKey = null
  if (baseline !== null) {
    try { baseline.undici.setGlobalDispatcher(baseline.dispatcher) } catch (error) { log('cannot restore dispatcher', error) }
    baseline = null
  }
  if (envBaseline !== null) {
    writeProxyEnv(envBaseline)
    envBaseline = null
  }
  // A reload must not reuse a PAC script, a probe answer, or a detection that
  // belongs to the previous lifetime of the plugin.
  detectionCache = null
  probeCache = null
  pacCache = null
  pacFailureAt = 0
  if (owned !== null) {
    // Drain in-flight requests without delaying an unload past their lifetime.
    void owned.dispatcher.close().catch(() => {})
  }
}

// --------------------------------------------------------------------- state

/** The preference currently in force. */
let settings = readSettings()

/** What the last apply produced, exposed to the Client row. */
let status = {
  active: false,
  source: 'direct',
  http: null,
  https: null,
  sample: null,
  noProxy: '',
  pac: false,
  reachable: null,
  updatedAt: 0,
  codes: [],
}

/** Serialize applies so two browser actions cannot interleave two swaps. */
let queue = Promise.resolve()

/**
 * Run one operation after every previously queued operation.
 * @param {() => Promise<unknown>} operation - the operation.
 * @returns {Promise<unknown>} its result.
 */
function enqueue(operation) {
  const run = queue.then(operation, operation)
  queue = run.then(() => undefined, () => undefined)
  return run
}

/**
 * Build the policy one preference selects.
 * @param {{ mode: string, custom: string }} preference - the saved preference.
 * @param {object} detection - the latest system detection.
 * @param {boolean} [fallbackToLaunch] - keep the launcher's proxy when the OS has none.
 * @returns {object} the policy.
 */
function buildPolicy(preference, detection, fallbackToLaunch = false) {
  if (preference.mode === 'custom') {
    const url = normalizeCustomProxy(preference.custom)
    if (url === null) throw codedError('invalid-custom', 'The custom proxy must be an http:// or https:// URL with a port')
    return { kind: 'proxy', http: url, https: url, noProxy: withLoopback(''), source: 'custom' }
  }
  if (preference.mode === 'system') {
    if (detection.enabled) {
      const noProxy = withLoopback(detection.bypass)
      if (typeof detection.pacEvaluator === 'function') {
        // A PAC route decides per URL, even when the sample also produced a
        // static address for the status line.
        return {
          kind: 'proxy',
          http: detection.http ?? null,
          https: detection.https ?? null,
          noProxy,
          pac: detection.pacEvaluator,
          pacKey: detection.pacKey,
          pacUrl: detection.pacUrl,
          source: 'system',
        }
      }
      if (detection.http !== null || detection.https !== null) {
        return { kind: 'proxy', http: detection.http, https: detection.https, noProxy, source: 'system' }
      }
    }
    // The OS names no usable proxy. Rather than forcing every request direct —
    // which would discard a policy the launcher resolved from the environment —
    // system mode inherits whatever dispatcher was installed before this plugin.
    if (fallbackToLaunch) return { kind: 'inherit', noProxy: '' }
  }
  return { kind: 'direct', noProxy: '' }
}

/**
 * Identify one resolved policy, so a repeated apply with the same result does
 * not replace the dispatcher and reset every pooled connection.
 * @param {object} policy - the resolved policy.
 * @returns {string} a stable key.
 */
function policyFingerprint(policy) {
  if (policy.kind === 'inherit') return 'inherit'
  if (policy.kind !== 'proxy') return 'direct'
  // A PAC route decides per URL; its sampled http/https addresses are display
  // values and must not make an otherwise identical policy look different.
  if (typeof policy.pac === 'function') {
    return `proxy|pac:${policy.pacUrl ?? ''}:${policy.pacKey ?? ''}|${policy.noProxy ?? ''}`
  }
  return `proxy|static|${policy.http ?? ''}|${policy.https ?? ''}|${policy.noProxy ?? ''}`
}

/**
 * Resolve one policy's display address for PAC-backed routes.
 * @param {object} policy - the policy.
 * @returns {string | null} a representative proxy address.
 */
function policySample(policy) {
  if (policy.kind !== 'proxy') return null
  if (policy.http !== null && policy.http !== undefined) return policy.http
  if (policy.https !== null && policy.https !== undefined) return policy.https
  if (typeof policy.pac === 'function') {
    try {
      const result = policy.pac(new URL('https://api.deepseek.com/'))
      return result.proxy
    } catch { return null }
  }
  return null
}

/**
 * Apply one preference: detect, install, publish, and record the result.
 * @param {{ mode: string, custom: string }} next - the preference to apply.
 * @param {{ persist?: boolean, forceDetect?: boolean }} options - side effects.
 * @returns {Promise<void>} resolves once the new policy is live.
 */
async function applySettings(next, options = {}) {
  // Detection is only needed to resolve the system policy and its status; a
  // direct/custom apply must not re-read the OS or re-download a PAC script.
  const forceDetect = options.forceDetect === true
  const detection = next.mode === 'system'
    ? await detectSystemProxy(forceDetect, options.forcePac === true)
    : detectionCache
  const policy = buildPolicy(next, detection ?? { enabled: false }, next.mode === 'system' && hasLaunchProxy())
  const codes = next.mode === 'system' ? [...(detection?.codes ?? [])] : []
  let reachable = null

  await installPolicy(policy)

  const bypassAll = policy.kind === 'proxy' && policy.noProxy === '*'
  if (bypassAll) codes.push('bypass-all')
  const sample = policySample(policy)
  if (policy.kind === 'proxy' && !bypassAll) {
    if (sample === null) {
      // A PAC route may legitimately answer DIRECT for the sample; only a
      // policy with no usable address at all is a reachability failure.
      if (typeof policy.pac !== 'function') codes.push('proxy-unreachable')
    } else {
      const detected = detection !== null && detection !== undefined && (sample === detection.http || sample === detection.https)
      reachable = detected && detection.reachable !== null ? detection.reachable : await probeCached(sample)
      if (reachable === false) codes.push('proxy-unreachable')
    }
  }

  settings = next
  const active = policy.kind === 'proxy' && !bypassAll
  status = {
    active,
    source: active ? policy.source : policy.kind === 'inherit' ? 'launch' : 'direct',
    http: sanitizeProxy(policy.http ?? null),
    https: sanitizeProxy(policy.https ?? null),
    sample: sanitizeProxy(sample),
    noProxy: policy.noProxy ?? '',
    pac: typeof policy.pac === 'function',
    reachable,
    updatedAt: Date.now(),
    codes: [...new Set(codes)],
  }
  if (options.persist === true) {
    try {
      writeSettings(next)
    } catch (error) {
      log('cannot persist settings', error)
      status.codes = [...new Set([...status.codes, 'persist-failed'])]
    }
  }
}

/**
 * Load the saved preference on activation and install it.
 * @returns {Promise<void>} resolves after the first apply attempt.
 */
async function bootstrap() {
  const saved = readSettings()
  try {
    await applySettings(saved, { persist: false, forceDetect: true, forcePac: true })
  } catch (error) {
    log('cannot apply the saved proxy preference', error)
    try {
      await applySettings({ mode: 'direct', custom: saved.custom }, { persist: false })
      status.codes = [...new Set([...(error?.code === 'invalid-custom' ? ['invalid-custom'] : []), ...status.codes])]
    } catch (fallbackError) {
      log('cannot install the direct fallback', fallbackError)
    }
  }
}

/** The activation-time apply, so the first Client `get` never sees a placeholder. */
let bootstrapPromise = null

/** Wait for the initial apply, bounded so a slow PAC cannot hang the row. */
async function whenReady() {
  if (bootstrapPromise === null) return
  await Promise.race([
    bootstrapPromise.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 8_000)),
  ])
}

// --------------------------------------------------------------------- route

/**
 * The public detection shape: everything except the compiled PAC evaluator.
 * @param {object | null} detection - a detection result.
 * @returns {object | null} the serializable subset.
 */
function publicDetection(detection) {
  if (detection === null) return null
  return {
    supported: detection.supported,
    platform: detection.platform,
    enabled: detection.enabled,
    server: sanitizeProxy(detection.server),
    http: sanitizeProxy(detection.http),
    https: sanitizeProxy(detection.https),
    bypass: detection.bypass,
    pacUrl: stripUserInfo(detection.pacUrl),
    dormant: sanitizeProxy(detection.dormant),
    reachable: detection.reachable,
    checkedAt: detection.checkedAt,
    codes: detection.codes,
  }
}

/**
 * Compose one successful response body.
 * @param {object | null} detection - the detection to include.
 * @returns {object} the response body.
 */
function snapshot(detection) {
  const codes = new Set(status.codes)
  // A PAC failure is only meaningful while a PAC route is the active policy;
  // it must not linger on the row after the user switches to direct/custom.
  if (status.pac && pacFailureAt !== 0 && Date.now() - pacFailureAt < 60_000) codes.add('pac-failed')
  const effective = codes.size === status.codes.length ? status : { ...status, codes: [...codes] }
  return { ok: true, settings, status: effective, detection: publicDetection(detection) }
}

/**
 * Answer with a JSON body.
 * @param {unknown} payload - the body.
 * @param {number} statusCode - HTTP status.
 * @returns {Response} the response.
 */
function json(payload, statusCode = 200) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Budget for one Client action, below the Client's own 15 s abort. */
const ACTION_DEADLINE_MS = 12_000

/** Sentinel the deadline race resolves with when the action runs long. */
const ACTION_TIMEOUT = Symbol('network-proxy timeout')

/**
 * Race one operation against the action budget.
 * @param {Promise<unknown>} operation - the work.
 * @returns {Promise<unknown | typeof ACTION_TIMEOUT>} the result or the sentinel.
 */
async function withDeadline(operation) {
  let timer = null
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(ACTION_TIMEOUT), ACTION_DEADLINE_MS)
    timer.unref?.()
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * Run one action, resolving to its response.
 * @param {string} action - the requested action.
 * @param {Record<string, unknown>} payload - the request body.
 * @returns {Promise<Response>} the response.
 */
async function runAction(action, payload) {
  await whenReady()
  if (action === 'get') {
    const detection = await detectSystemProxy(false)
    return json(snapshot(detection))
  }
  if (action === 'detect') {
    const detection = await detectSystemProxy(true, true)
    return json(snapshot(detection))
  }
  if (action === 'set') {
    const mode = payload.mode
    if (typeof mode !== 'string' || !MODES.has(mode)) {
      return json({ ok: false, error: { code: 'invalid-mode', message: `Unknown mode ${String(mode)}` } }, 400)
    }
    const custom = mode === 'custom'
      ? String(typeof payload.custom === 'string' ? payload.custom : settings.custom).trim()
      : String(settings.custom ?? '')
    if (mode === 'custom' && normalizeCustomProxy(custom) === null) {
      return json({ ok: false, error: { code: 'invalid-custom', message: 'The custom proxy must be an http:// or https:// URL with a port' } }, 400)
    }
    const forceDetect = mode === 'system'
    const forcePac = forceDetect && payload.refresh === true
    await enqueue(() => applySettings({ mode, custom }, { persist: true, forceDetect, forcePac }))
    return json(snapshot(detectionCache))
  }
  return json({ ok: false, error: { code: 'bad-request', message: `Unknown action ${String(action)}` } }, 400)
}

/**
 * Handle one authenticated Client request.
 *
 * The whole action runs under a budget below the Client's own abort, so a slow
 * registry read or PAC download answers with `timeout` instead of a dropped
 * connection. The queued apply keeps running and its result shows on the next
 * request.
 * @param {Request} request - the posted request.
 * @returns {Promise<Response>} the result.
 */
async function handleRequest(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, error: { code: 'bad-request', message: 'Expected a JSON body.' } }, 400)
  }
  const action = payload !== null && typeof payload === 'object' ? payload.action : undefined

  try {
    const result = await withDeadline(runAction(action, payload !== null && typeof payload === 'object' ? payload : {}))
    if (result === ACTION_TIMEOUT) {
      log(`action ${String(action)} exceeded ${ACTION_DEADLINE_MS}ms`)
      return json({
        ok: false,
        error: { code: 'timeout', message: 'The Host took too long to answer; the operation may still finish.' },
      }, 504)
    }
    return result
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'apply-failed'
    log(`action ${String(action)} failed`, error)
    return json({ ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } }, code === 'invalid-custom' ? 400 : 500)
  }
}

// --------------------------------------------------------------------- plugin

/**
 * Host plugin body: install the saved policy and serve the preference route.
 * @param {object} ctx - Host context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const disposeRoute = ctx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => handleRequest(request),
    })
    bootstrapPromise = enqueue(() => bootstrap())
    void bootstrapPromise.catch((error) => log('bootstrap failed', error))
    return async () => {
      // Unregister first: a Client request arriving while the teardown awaits
      // must not apply a policy after the dispatcher was restored.
      await disposeRoute()
      await enqueue(() => restorePolicy())
    }
  }, 'network-proxy: route and dispatcher')
}

/**
 * Pure helpers exported for the Host verification harness. They are not part of
 * the plugin contract and the Loader ignores extra exports.
 * @internal
 */
export const __test = {
  bypassesProxy,
  buildPolicy,
  createPacEvaluator,
  explicitPort,
  installPolicy,
  normalizeCustomProxy,
  parseMacProxy,
  parseProxyServer,
  parseRegQuery,
  policyFingerprint,
  proxyForUrl,
  sanitizeProxy,
  toProxyUrl,
}
