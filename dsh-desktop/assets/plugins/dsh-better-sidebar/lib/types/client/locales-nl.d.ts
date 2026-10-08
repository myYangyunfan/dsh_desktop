/**
 * The nl (Dutch) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'nl'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Formal "u" form for user-facing text.
 * - Technical loanwords stay in English (Git, SSH, HTTP, URL, Markdown, PDF, VS Code).
 * - Git vocabulary follows English-derived conventions (stagen, unstagen, commit, branch).
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH) stay as-is.
 */
export declare const nl: Record<string, string>;
