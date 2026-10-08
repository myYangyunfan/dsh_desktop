/**
 * The built-in tab glyphs, in color.
 *
 * Every built-in tab type and the incoming 8th (changes) declare their icon
 * here, so the three surfaces that draw a tab's glyph — the bottom workbench's
 * tab strip, the native right Sidebar's guide capsules and its tab chips — all
 * read the same colorful glyph from `descriptor.icon`.
 *
 * The color always arrives from a theme token, never from the plugin: the
 * glyph is a VSCodicon drawn in `currentColor`, and the wrapper class supplies
 * that color. A skin therefore keeps control of everything (the guide's §12);
 * this module is what `tests/theme.spec.ts` checks for color literals.
 *
 * `files` is the one exception in kind rather than in color: it renders DSH's
 * own folder artwork (`FileTypeIcon`), matching the file rows this tab shows.
 */
import type { ReactNode } from 'react';
/** One tab type's glyph, sized by the caller's surface (14px in a strip). */
export type TabIcon = (size: number) => ReactNode;
/** The Files tab: the host's folder artwork, like the rows it opens. */
export declare const filesTabIcon: TabIcon;
/** Changes / diff: the commit glyph, green like the diff affordances. */
export declare const changesTabIcon: TabIcon;
/**
 * Tasks (subagents and background jobs) — the live-activity amber. The glyph
 * is layered sheets, not a checklist: this page lists RUNNING work (subagent
 * sessions plus the host's background jobs), not a to-do list.
 */
export declare const tasksTabIcon: TabIcon;
/** Side chat — the conversational/secondary accent. */
export declare const sidechatTabIcon: TabIcon;
/**
 * Terminal — primary ink, the shell is text. Rendered one step down from the
 * strip's 14px: the VSCodicon terminal is a wide filled rectangle and read
 * heavier than its neighbours at full size.
 */
export declare const terminalTabIcon: TabIcon;
/** Browser — the same secondary accent as the side chat's sibling surfaces. */
export declare const browserTabIcon: TabIcon;
