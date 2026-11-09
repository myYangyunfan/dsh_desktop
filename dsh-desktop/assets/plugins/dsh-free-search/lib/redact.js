/**
 * Secret redaction for anything that can reach the model or the logs.
 *
 * Upstream errors sometimes echo the credential back (query strings, JSON
 * bodies). We keep every key we resolve, so the same message can be scrubbed
 * before it is returned as a tool result or written to the log.
 */
const secrets = new Set();

const PATTERNS = [
  /\b(?:sk|pk|ak)-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:x-api-key|api[_-]?key|access[_-]?token|secret[_-]?key)(["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]{8,}/gi,
  /([?&](?:key|api_key|token|access_token)=)[^&\s"']{6,}/gi,
];

export function rememberSecret(value) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (text.length >= 8) secrets.add(text);
}

export function forgetSecrets() {
  secrets.clear();
}

export function redactSecrets(input, extra = []) {
  let text = String(input ?? "");
  const all = [...secrets, ...extra.filter((value) => typeof value === "string" && value.length >= 8)];
  for (const secret of all) {
    if (secret.length === 0) continue;
    if (text.includes(secret)) text = text.split(secret).join("***");
  }
  text = text.replace(PATTERNS[0], "***");
  text = text.replace(PATTERNS[1], "Bearer ***");
  text = text.replace(PATTERNS[2], (_match, prefix) => `${prefix}***`);
  text = text.replace(PATTERNS[3], (_match, prefix) => `${prefix}***`);
  return text;
}

/** Keys we can see from the environment, for ad-hoc scrubbing. */
export function environmentSecrets(env = process.env) {
  const out = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    if (!/_(?:API_?KEY|TOKEN|SECRET|BEARER)$/i.test(name)) continue;
    if (typeof value === "string" && value.length >= 8) out.push(value);
  }
  return out;
}
