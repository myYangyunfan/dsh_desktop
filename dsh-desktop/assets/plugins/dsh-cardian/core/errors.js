// Typed error taxonomy. Every failure inside cardian is a CardianError carrying
// a stable machine-readable `code` plus an optional `suggestion` the agent can
// act on (12-factor-agents Factor 9: compact, actionable errors in context).

export class CardianError extends Error {
  constructor(message, opts = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = opts.code ?? 'CARDian'
    this.details = opts.details
    this.suggestion = opts.suggestion ?? null
    if (opts.cause) this.cause = opts.cause
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.suggestion ? { suggestion: this.suggestion } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

export class ValidationError extends CardianError {
  constructor(message, opts = {}) {
    super(message, { code: 'VALIDATION', ...opts })
  }
}

export class NotFoundError extends CardianError {
  constructor(message, opts = {}) {
    super(message, { code: 'NOT_FOUND', ...opts })
  }
}

export class ConfigError extends CardianError {
  constructor(message, opts = {}) {
    super(message, { code: 'CONFIG', ...opts })
  }
}

export class PathError extends CardianError {
  constructor(message, opts = {}) {
    super(message, { code: 'PATH', ...opts })
  }
}

export class StoreError extends CardianError {
  constructor(message, opts = {}) {
    super(message, { code: 'STORE', ...opts })
  }
}

export function isCardianError(err) {
  return err instanceof CardianError
}

// Reduce any thrown value to a compact structured error object.
export function toErrorPayload(err) {
  if (err instanceof CardianError) return { ok: false, error: err.toJSON() }
  return {
    ok: false,
    error: {
      code: 'INTERNAL',
      message: err?.message ?? String(err),
    },
  }
}
