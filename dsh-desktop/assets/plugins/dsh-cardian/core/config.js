// Single source of truth for config resolution, coercion and validation.
// Follows basic-memory's "fail fast on invalid configuration, never silently
// fall back" rule: invalid values throw ConfigError naming the field.

import { ConfigError } from './errors.js'

function coerceBool(value, fallback, name) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false
  throw new ConfigError(`${name} 必须是布尔值`)
}

export function resolveConfig(raw = {}) {
  const vaultPath = raw.vaultPath ?? './cardian-vault'
  if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
    throw new ConfigError('vaultPath 必须是非空字符串')
  }

  const autoInit = coerceBool(raw.autoInit, true, 'autoInit')
  const semanticSearch = coerceBool(raw.semanticSearch, true, 'semanticSearch')
  const watchVault = coerceBool(raw.watchVault, true, 'watchVault')

  let searchAlpha = raw.searchAlpha === undefined ? 0.5 : Number(raw.searchAlpha)
  if (!Number.isFinite(searchAlpha)) throw new ConfigError('searchAlpha 必须是数字')
  searchAlpha = Math.min(1, Math.max(0, searchAlpha))

  let embedderDim = raw.embedderDim === undefined ? 256 : Number(raw.embedderDim)
  if (!Number.isInteger(embedderDim) || embedderDim <= 0) {
    throw new ConfigError('embedderDim 必须是正整数')
  }

  const _ar = Array.isArray(raw.allowedRoots) ? raw.allowedRoots.map((r) => String(r)).filter(Boolean) : []
  const trackUsage = coerceBool(raw.trackUsage, true, 'trackUsage')
  const rawExcludes = Array.isArray(raw.excludes) ? raw.excludes.map((r) => String(r)).filter(Boolean) : []
  const maxNoteChars = Number.isFinite(Number(raw.limits?.maxNoteChars))
    ? Math.max(0, Math.floor(Number(raw.limits.maxNoteChars)))
    : 0
  const maxNotesPerSection = Number.isFinite(Number(raw.limits?.maxNotesPerSection))
    ? Math.max(0, Math.floor(Number(raw.limits.maxNotesPerSection)))
    : 0
  const rawTimeout = Number(raw.backfillTimeoutMs)
  const backfillTimeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 10_000 ? Math.floor(rawTimeout) : 300_000
  return {
    vaultPath, autoInit, semanticSearch, watchVault, searchAlpha, embedderDim, allowedRoots: _ar, trackUsage,
    excludes: rawExcludes,
    backfillTimeoutMs,
    excludes: rawExcludes,
    limits: { maxNoteChars, maxNotesPerSection },
  }
}
