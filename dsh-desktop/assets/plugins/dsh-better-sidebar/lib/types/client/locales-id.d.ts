/**
 * The id (Indonesian) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'id'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Git vocabulary stays close to the English form (stage, commit, branch, fork).
 * - Settings labels mirror the zh cadence (… perilaku / … cara).
 * - Placeholders keep {name} verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH) stay as-is.
 */
export declare const id: Record<string, string>;
