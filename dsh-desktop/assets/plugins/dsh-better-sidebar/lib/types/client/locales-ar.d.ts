/**
 * The ar (Arabic) dictionary for the betterSidebar namespace.
 *
 * Mirrors the key set of `zh` in `locales.ts`. The sidebar's `t()`
 * consults this dict when `attachBetterLocale(store)` has been called
 * with an active better-locale store whose `active` is `'ar'`; absent
 * that, the existing zh/en chain runs unchanged.
 *
 * Translation conventions:
 * - Modern Standard Arabic (فصحى); UI text is RTL-ready (the framework
 *   handles direction).
 * - Git vocabulary follows standard Arabic localizations (إدراج، تثبيت، فرع).
 * - Placeholders keep `{name}` verbatim (interpolation runs after lookup).
 * - English brand names (VS Code, Cursor, Zed, SSH, Git, HTML, PDF, Markdown)
 *   stay as-is.
 */
/** The ar dictionary (key-set-equal to zh, enforced by the type annotation in locales.ts). */
export declare const ar: Record<string, string>;
