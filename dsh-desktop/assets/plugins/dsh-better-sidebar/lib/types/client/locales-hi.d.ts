/**
 * The hi (Hindi) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'hi'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Technical terms (Git, SSH, HTTP, URL, Markdown, PDF, VS Code, API, etc.) stay in English.
 * - Common dev-tool terms use Devanagari transliterations (टर्मिनल, ब्राउज़र, सैंडबॉक्स).
 * - Git vocabulary follows English loanwords (स्टेज, कमिट, ब्रांच, चेरी-पिक).
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH, Chrome) stay as-is.
 */
/** The hi dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const hi: Record<string, string>;
