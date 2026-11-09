/**
 * Cooldown store: which engines (and which API keys) are resting, for how long,
 * and why. Two lessons from modsearch that this replaces:
 *
 *  - the cool-off is keyed per API key, not just per engine, so a spent key
 *    does not freeze an engine that still has credit on another key;
 *  - it survives restarts, and a quota message that names a reset time is
 *    honoured instead of a fixed guess.
 *
 * Session-long cooldowns (a rejected key, a bad configuration) are kept in
 * memory only: they describe this process, not the outside world.
 */
import fs from "node:fs";
import path from "node:path";

export const SESSION = Number.POSITIVE_INFINITY;
export const SHORT_COOLDOWN_MS = 60_000;
export const DEFAULT_QUOTA_COOLDOWN_MS = 45 * 60_000;
export const MONTHLY_COOLDOWN_MS = 24 * 60 * 60_000;
export const REGION_COOLDOWN_MS = 24 * 60 * 60_000;

const REGION_LOCKED = /eligibility check failed|not (?:currently )?available in your (?:location|region|country)/i;
const MONTHLY_HINT = /monthly|per month|this month|monthly quota|monthly limit/i;

export function isRegionLocked(message) {
  return REGION_LOCKED.test(String(message ?? ""));
}

/** Milliseconds from a small set of human/upstream spellings, or null. */
export function parseResetDelay(message, now = Date.now()) {
  const text = String(message ?? "");
  if (text.length === 0) return null;

  const retry = /retry[- ]?after[:\s]+(\d{1,7})\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hours?)?/i.exec(text);
  if (retry !== null) {
    const amount = Number(retry[1]);
    const unit = String(retry[2] ?? "s").toLowerCase();
    const scale = unit.startsWith("ms") ? 1 : unit.startsWith("h") ? 3_600_000 : unit.startsWith("m") ? 60_000 : 1_000;
    return clampDelay(amount * scale);
  }

  const inAmount = /reset[s]?\s+in\s+(\d{1,4})\s*(second|sec|minute|min|hour|hr|day)s?/i.exec(text);
  if (inAmount !== null) {
    const amount = Number(inAmount[1]);
    const unit = String(inAmount[2]).toLowerCase();
    const scale = unit.startsWith("day") ? 86_400_000 : unit.startsWith("h") ? 3_600_000 : unit.startsWith("m") ? 60_000 : 1_000;
    return clampDelay(amount * scale);
  }

  const at = /reset[s]?\s+(?:at|on)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:]{5,8}(?:\.[0-9]+)?Z?)/i.exec(text);
  if (at !== null) {
    const stamp = Date.parse(at[1].includes("T") ? at[1] : at[1].replace(" ", "T"));
    if (Number.isFinite(stamp)) return clampDelay(stamp - now);
  }

  if (MONTHLY_HINT.test(text)) return MONTHLY_COOLDOWN_MS;
  return null;
}

function clampDelay(ms) {
  if (!Number.isFinite(ms)) return null;
  if (ms < 5_000) return 5_000;
  if (ms > 7 * 86_400_000) return 7 * 86_400_000;
  return Math.floor(ms);
}

/** 12 hex chars of a key, enough to tell siblings apart without keeping secrets. */
export function keyFingerprint(key) {
  const text = String(key ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const tail = text.length >= 4 ? text.slice(-4) : "";
  return `${hash.toString(16).padStart(8, "0")}${tail.length ? `-${tail}` : ""}`;
}

/** How long a failure of this class should rest, honouring an explicit reset when given. */
export function cooldownDelayFor(cls, message) {
  if (isRegionLocked(message)) return REGION_COOLDOWN_MS;
  const reset = parseResetDelay(message);
  if (cls === "auth") return SESSION;
  if (cls === "quota") return reset ?? DEFAULT_QUOTA_COOLDOWN_MS;
  if (cls === "bot-wall") return reset ?? SHORT_COOLDOWN_MS;
  if (cls === "transient") return reset;
  return null;
}
export function keyCooldownId(envName, key) {
  return `key:${envName}:${keyFingerprint(key)}`;
}

export function createCooldownStore({ statePath = null, now = Date.now, logger = null } = {}) {
  /** @type {Map<string, { until: number, reason: string, cls: string }>} */
  const entries = new Map();
  let loaded = false;

  const load = () => {
    if (loaded) return;
    loaded = true;
    if (statePath === null) return;
    try {
      const raw = fs.readFileSync(statePath, "utf8");
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
      const stamp = now();
      for (const entry of list) {
        if (typeof entry?.id !== "string" || !Number.isFinite(entry?.until)) continue;
        if (entry.until <= stamp) continue;
        entries.set(entry.id, { until: entry.until, reason: String(entry.reason ?? ""), cls: String(entry.cls ?? "") });
      }
    } catch {
      // A missing or corrupt file is just "no state".
    }
  };

  const persist = () => {
    if (statePath === null) return;
    const stamp = now();
    const out = [];
    for (const [id, entry] of entries) {
      if (!Number.isFinite(entry.until) || entry.until <= stamp) continue;
      out.push({ id, until: entry.until, reason: entry.reason, cls: entry.cls });
    }
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const temp = `${statePath}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, entries: out }), "utf8");
      fs.renameSync(temp, statePath);
    } catch (error) {
      logger?.warn?.(`free-search: could not persist cooldowns (${error?.message ?? error})`);
    }
  };

  const prune = () => {
    const stamp = now();
    for (const [id, entry] of entries) {
      if (Number.isFinite(entry.until) && entry.until <= stamp) entries.delete(id);
    }
  };

  return {
    isCooling(id) {
      load();
      const entry = entries.get(id);
      if (entry === undefined) return false;
      if (entry.until > now()) return true;
      entries.delete(id);
      return false;
    },
    remaining(id) {
      load();
      const entry = entries.get(id);
      if (entry === undefined) return 0;
      const left = entry.until - now();
      return Number.isFinite(left) && left > 0 ? left : 0;
    },
    isSession(id) {
      load();
      return entries.get(id)?.until === SESSION;
    },
    reasonFor(id) {
      load();
      return entries.get(id)?.reason ?? "";
    },
    set(id, ms, { reason = "", cls = "" } = {}) {
      load();
      const until = ms === SESSION ? SESSION : now() + Math.max(1_000, ms);
      entries.set(id, { until, reason, cls });
      persist();
      return until;
    },
    clear(id) {
      load();
      if (id === undefined) {
        entries.clear();
        persist();
        return true;
      }
      const removed = entries.delete(id);
      if (removed) persist();
      return removed;
    },
    clearAll() {
      entries.clear();
      persist();
    },
    snapshot() {
      load();
      prune();
      const stamp = now();
      return [...entries.entries()].map(([id, entry]) => ({
        id,
        reason: entry.reason,
        cls: entry.cls,
        remainingMs: Number.isFinite(entry.until) ? Math.max(0, entry.until - stamp) : null,
      }));
    },
    size() {
      load();
      prune();
      return entries.size;
    },
  };
}
