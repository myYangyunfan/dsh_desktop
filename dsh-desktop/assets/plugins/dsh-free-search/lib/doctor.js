/**
 * "Why is this engine not being used?" in one report.
 *
 * Everything here is a local fact: configuration, whether a credential is
 * present, and what is cooling down right now. No network calls, so it is safe
 * to ask at any time and cheap enough to show in the settings page.
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined) return "session";
  if (!Number.isFinite(ms)) return "session";
  if (ms <= 0) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function buildDoctorReport({
  version = "?",
  nodeVersion = "?",
  dshHome = "",
  provider = "",
  effectiveProvider = "",
  promptLanguage = "en",
  promptChars = 0,
  promptInjected = true,
  tools = { enabled: [], disabled: [] },
  toolsKnown = [],
  engines = [],
  now = Date.now(),
} = {}) {
  const lines = [];
  lines.push(`dsh-free-search ${version}`);
  lines.push(`node ${nodeVersion}${dshHome ? ` · ${dshHome}` : ""}`);
  lines.push(
    `preferred: ${provider || "auto"}${provider ? "" : ` (resolves to ${effectiveProvider || "?"})`} · prompt ${promptLanguage}, ${promptChars} chars${promptInjected ? "" : ", not injected"}`
  );
  const enabledTools = toolsKnown.filter((id) => !tools.disabled.includes(id));
  lines.push(`tools: ${enabledTools.length}/${toolsKnown.length} on${enabledTools.length ? ` (${enabledTools.join(", ")})` : ""}`);
  lines.push("");
  lines.push("engines:");

  for (const engine of engines) {
    const flags = [];
    if (engine.disabled) flags.push("disabled");
    if (engine.credential?.required) {
      flags.push(engine.credential.configured ? `key ok (${engine.credential.envs.join("/")})` : `needs ${engine.credential.envs.join("/")}`);
    }
    if (engine.cooling?.remainingMs !== undefined && engine.cooling.remainingMs !== 0) {
      const left = engine.cooling.remainingMs === null ? "session" : formatDuration(engine.cooling.remainingMs);
      flags.push(`cooling ${left}${engine.cooling.cls ? ` [${engine.cooling.cls}]` : ""}`);
    }
    const mark = engine.disabled || engine.credential?.configured === false || (engine.cooling?.remainingMs ?? 0) > 0 ? " " : "*";
    lines.push(`  ${mark} ${engine.id.padEnd(16)} ${flags.join(" · ") || "ready"}`);
    if (engine.stats && engine.stats.calls > 0) {
      const stats = engine.stats;
      const last = stats.lastErrorClass ? ` · last ${stats.lastErrorClass}` : "";
      lines.push(
        `      calls ${stats.calls} · ok ${stats.ok} · empty ${stats.empty} · fail ${stats.fail} · avg ${stats.avgMs}ms${last}`
      );
    }
  }

  if (engines.some((engine) => engine.cooling?.reason)) {
    lines.push("");
    lines.push("cooldown reasons:");
    for (const engine of engines) {
      if (!engine.cooling?.reason) continue;
      lines.push(`  ${engine.id}: ${engine.cooling.reason}`);
    }
  }

  lines.push("");
  lines.push(`generated ${new Date(now).toISOString()}`);
  return lines.join("\n");
}
