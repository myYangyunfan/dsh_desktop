/**
 * The ja (Japanese) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'ja'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Common dev-tool loanwords stay in katakana (ターミナル, ブラウザー, サンドボックス).
 * - Git vocabulary follows the GitHub Japan style guide (ステージ, コミット, ブランチ).
 * - Settings labels end in する/名/方法 to mirror the zh 「…行为/方式」 cadence.
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH) stay as-is.
 */
/** The ja dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const ja: Record<string, string>;
