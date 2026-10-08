/**
 * The pl (Polish) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'pl'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Formal register (Pan/Pani/Państwo) for user-facing copy.
 * - Polish diacritics used throughout (ą, ć, ę, ł, ń, ó, ś, ź, ż).
 * - {placeholder} patterns kept verbatim (interpolation runs after lookup).
 * - Git vocabulary follows the English-leaning developer style
 *   (commit, branch, stage, diff, cherry-pick, hash, push, fetch, pull).
 * - English brand names (VS Code, Cursor, Zed, SSH, Mermaid, HTML, CSS,
 *   PDF, Markdown, Cursor) stay as-is.
 */
/** The pl dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const pl: Record<string, string>;
