/**
 * The tr (Turkish) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'tr'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Common dev-tool loanwords stay in Turkish (Terminal, Tarayıcı, Klasör).
 * - Git vocabulary follows standard Turkish usage ( Sahnele, İşle, Dal).
 * - Settings labels end in noun/infinitive forms to mirror the zh cadence.
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH) stay as-is.
 */
/** The tr dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const tr: Record<string, string>;
