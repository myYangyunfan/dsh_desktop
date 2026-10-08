/**
 * Tool-call glyphs for the live activity lines of the Tasks page (the
 * "icon + tool + args" row on running agent nodes). A small explicit map of
 * the common tool families onto host primitive icons; anything unmapped
 * gets the generic ellipsis glyph. All icons are the host's own components
 * (currentColor — zero color literals, the theme contract stays intact).
 */
import type { ReactNode } from 'react';
/** One glyph renderer (host icon components accept a pixel size). */
type Glyph = (size: number) => ReactNode;
/**
 * The glyph of one tool name: exact match first, then a prefix match so
 * `mcp__fs__read_file`-style names still land on their family glyph. The
 * lookup is case-insensitive.
 */
export declare function toolGlyph(toolName: string): Glyph;
export {};
