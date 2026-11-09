/**
 * Version of the `ds-harness-remote` distribution.
 *
 * This is reported to the Server during device registration (`clientVersion`
 * in the Device Descriptor) and again in the WebSocket `hello` frame. The
 * Harness version is read separately from `host.describe` at runtime.
 * Keep it in sync with `packages/plugin/package.json` (`version`).
 * If they diverge, `npm scripts` checks in `scripts/verify-version-sync.mjs`
 * will fail fast during build/check/test.
 */
export declare const PLUGIN_VERSION = "0.6.4";
//# sourceMappingURL=version.d.ts.map