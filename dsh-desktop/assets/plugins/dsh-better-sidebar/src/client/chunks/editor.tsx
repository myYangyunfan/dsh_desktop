/**
 * Lazy chunk entry: the code/markdown/html text editor (CodeMirror 6 + the
 * language packages). Built as `lib/client-editor.js` and registered under
 * `dsh-better-sidebar/editor` — fetched only when a text file is first
 * opened (see chunk-loader.ts and docs/plans/2026-08-12-lazy-chunks-design.md).
 * Never import this module from the core bundle: it pulls CodeMirror into
 * the startup path.
 */
import { computeReplacedText, findMatchOffsets, foldableBlocks, matchingBracketIndex } from '../editor-features.ts'
export { TextEditor } from '../TextEditor.tsx'

/** Node-vm test surface: the editor-features pure helpers
 * (scripts/test/unit-better-sidebar-editor-features.test.js). The chunk
 * loader only picks `TextEditor`, so the extra export is inert at runtime. */
export const __internals = { matchingBracketIndex, foldableBlocks, findMatchOffsets, computeReplacedText }
