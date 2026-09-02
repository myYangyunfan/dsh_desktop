// Minimal structured logger. Diagnostics always go to stderr; stdout is
// reserved for data (CLI JSON, future MCP JSON-RPC). This mirrors basic-memory's
// discipline that stdout must never be polluted by log output.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 }

export function createLogger(opts = {}) {
  const threshold = LEVELS[opts.level ?? 'info'] ?? LEVELS.info
  const stream = opts.stream ?? process.stderr
  const format = opts.format ?? 'text'

  function emit(level, message, extra) {
    if (LEVELS[level] < threshold) return
    if (format === 'json') {
      stream.write(JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...(extra ?? {}) }) + '\n')
    } else {
      stream.write(`[cardian:${level}] ${message}\n`)
    }
  }

  return {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e),
  }
}

export const noopLogger = createLogger({ level: 'silent' })
