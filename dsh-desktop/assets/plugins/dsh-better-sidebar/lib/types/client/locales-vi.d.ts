/**
 * The vi (Vietnamese) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'vi'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Technical terms stay in English where appropriate (Git, SSH, HTTP, URL,
 *   Markdown, PDF, VS Code, API Key, Base URL, token, etc.).
 * - Placeholders keep {name} verbatim (interpolation runs after lookup).
 * - Formal Vietnamese appropriate for software UI.
 * - Terminology is kept consistent with the DSH core vi dictionary.
 */
/** The vi dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const vi: Record<string, string>;
