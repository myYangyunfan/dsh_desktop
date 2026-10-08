/**
 * Secret redaction for rendered file content. The tracer replays read/write
 * tool results into the DOM (diff, read view, markdown mode) — when the
 * model reads a credentials file, that plaintext must not land on screen or
 * in inspectable DOM. Two layers, both pure and unit-tested:
 *
 * 1. Path layer: files whose NAME marks them as secrets (.env, *secret*,
 *    *credential*, *token*, *api-key*, private keys, …) are masked whole —
 *    every non-empty line becomes [REDACTED].
 * 2. Content layer: for ordinary files, secret-SHAPED lines and tokens are
 *    masked in place (api_key/access_token/password assignments, sk-/AKIA/
 *    ghp_/xox prefixes, Bearer headers, PEM private-key block headers).
 *
 * Redaction is display-only: the session log and the tool results keep their
 * original bytes; this layer guarantees only that this plugin never renders
 * the secret. It is NOT a security boundary against a same-context malicious
 * plugin (which can read anything on the page or call host APIs itself) —
 * it removes the tracer's own contribution to secret exposure.
 */
/** Placeholder substituted for every secret found. */
export declare const REDACTED = "[REDACTED]";
/** Result of redacting one text: the masked text + whether anything was hit. */
export interface RedactionOutcome {
    readonly text: string;
    readonly hit: boolean;
}
/**
 * Whether a path's own name marks the file as sensitive (case-insensitive,
 * matched against the full path so .env in any directory counts).
 */
export declare function isSensitivePath(path: string): boolean;
/**
 * Redact secret-shaped content from an ordinary file's text. Only the secret
 * itself is masked; surrounding code/config stays readable.
 */
export declare function redactContentText(text: string): string;
/**
 * Apply the full two-layer redaction for one file's text. Sensitive paths
 * mask whole lines; ordinary files mask only secret-shaped spans.
 */
export declare function redactText(path: string, text: string): RedactionOutcome;
