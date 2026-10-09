/**
 * Editor feature pack (side-ed): bracket matching / code folding / find & replace.
 *
 * Self-contained by construction: it relies only on @codemirror/state +
 * @codemirror/view core machinery (ViewPlugin / Decoration / WidgetType /
 * GutterMarker / keymap — all already inside the editor chunk bundle), because
 * @codemirror/search is not part of the built chunk. The find panel is therefore
 * a hand-rolled DOM overlay hosted by a ViewPlugin, and folding is
 * indentation-based (the language-agnostic fallback editors use when no folder
 * provider exists).
 *
 * CSS is injected at runtime as one <style data-plugin-css> tag (the K28
 * file-changes-highlight pattern) instead of css-module hashing, so the class
 * names stay stable across rebuilds instead of being rewritten by the bundler.
 * Colors derive from `currentColor` + color-mix so both schemes read fine.
 *
 * The pure helpers (matchingBracketIndex / foldableBlocks / findMatchOffsets /
 * computeReplacedText) ship as `__internals` on the chunk export, so
 * scripts/test/unit-better-sidebar-editor-features.test.js can vm-evaluate the
 * shipped lib/client-editor.js and test the released bytes directly. (An earlier
 * regime hand-inlined an equivalent section between `dsh-editor-features`
 * markers in lib because the chunk could not be rebuilt; that is gone now that
 * `npm run build` works — keep it that way, having both is a duplicate
 * declaration.)
 */
import { type Extension } from '@codemirror/state';
/** A resolved cursor-adjacent bracket pair: `bracket` + its partner `match`. */
export interface BracketPair {
    bracket: number;
    match: number;
}
/**
 * The bracket pair adjacent to `head`, or null: `bracket` is the offset of
 * the bracket at the cursor and `match` its partner. The char BEFORE the
 * cursor wins (cursor resting right after a bracket — editor convention),
 * then the char AT the cursor. Plain depth-counted scan: language-agnostic,
 * bounded by BRACKET_SCAN_LIMIT per direction.
 */
export declare function matchingBracketIndex(text: string, head: number): BracketPair | null;
/** One foldable block: 1-based header line and 1-based last line. */
export interface FoldBlock {
    fromLine: number;
    toLine: number;
}
/**
 * Indentation-based foldable blocks (the language-agnostic fallback). A
 * non-empty line whose following lines are all deeper-indented (blank lines
 * never interrupt, trailing blanks excluded) opens one block ending at the
 * last such line. Nested blocks are emitted per header line, so the result
 * covers every foldable level in one pass.
 */
export declare function foldableBlocks(text: string): FoldBlock[];
/** All non-overlapping match offsets of `query` in `text` ('' query → []). */
export declare function findMatchOffsets(text: string, query: string, caseSensitive: boolean): number[];
/** Replace every match in one pass; returns the new text and match count. */
export declare function computeReplacedText(text: string, query: string, replacement: string, caseSensitive: boolean): {
    text: string;
    count: number;
};
/** Idempotently inject the feature styles (theme-agnostic currentColor mixes). */
export declare function ensureEditorFeaturesCss(): void;
/** Cursor-adjacent bracket matching: rescans on selection/doc changes and
 * marks both the bracket and its partner with `dsh-editor-bracket-match`. */
export declare function bracketMatchExtension(): Extension;
/** Full folding feature: field + gutter + fold/unfold keymap. */
export declare function foldExtension(): Extension;
/** The find & replace overlay: Mod-f opens, F3 / Shift-F3 navigate, Enter /
 * Shift-Enter inside the inputs navigate, Escape closes. Live match count;
 * replace current + replace all. Pure scan via findMatchOffsets. */
export declare function findPanelExtension(): Extension;
/** Aggregate: bracket matching + folding + find & replace. Wire it into the
 * editor's extension list BEFORE the default keymap so Mod-f / Escape win. */
export declare function editorFeatures(): Extension;
