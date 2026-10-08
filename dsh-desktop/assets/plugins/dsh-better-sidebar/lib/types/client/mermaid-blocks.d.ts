/**
 * Markdown/mermaid fence detection for the markdown preview. The preview
 * renders the WHOLE document through one DSH `MarkdownText` pass (so
 * cross-fence semantics — reference-style links, footnotes, list
 * continuity — stay intact) and the mermaid lazy chunk then swaps the
 * rendered `language-mermaid` code blocks for diagrams. This module's pure
 * splitter exists to detect whether the source contains a mermaid fence at
 * all, so the mermaid chunk is only fetched when needed (unit-tested in
 * tests/mermaid-blocks.spec.ts).
 */
import type { MarkdownCopyLabels } from './markdown-labels.tsx';
/** One fenced mermaid diagram lifted out of the markdown source. */
export interface MermaidBlock {
    kind: 'mermaid';
    /** The raw diagram source between the fences (info string stripped). */
    code: string;
}
/** A span of plain markdown source (may itself contain non-mermaid fences). */
export interface MarkdownBlock {
    kind: 'markdown';
    text: string;
}
export type MdBlock = MarkdownBlock | MermaidBlock;
/** Props of the chunk-resident `MermaidMarkdown` component (shared contract). */
export interface MermaidMarkdownProps {
    /** The full markdown source (rendered in a single MarkdownText pass). */
    text: string;
    codeLabels: MarkdownCopyLabels;
}
/** CommonMark opening fence: 0-3 spaces indent + a run of 3+ backticks or tildes. */
export declare const OPEN_FENCE_RE: RegExp;
/** A closing-fence line: 0-3 spaces indent + 3+ backticks/tildes + trailing spaces only. */
export declare const CLOSE_FENCE_RE: RegExp;
/** Parse the info string from the line tail after the fence run; null when invalid. */
export declare function fenceInfo(rest: string, fence: string): string | null;
/**
 * Split markdown source into md/mermaid blocks for detection: only fences
 * whose info string names mermaid are lifted; every other line stays in the
 * markdown stream untouched. CommonMark fence rules are honored — opening
 * fences of 3+ backticks OR tildes, and a closing fence must use the same
 * character with at least as many characters as the opening fence. An
 * unterminated mermaid fence swallows the rest of the file (the same
 * recovery CommonMark applies to open fences).
 */
export declare function splitMermaidBlocks(text: string): MdBlock[];
