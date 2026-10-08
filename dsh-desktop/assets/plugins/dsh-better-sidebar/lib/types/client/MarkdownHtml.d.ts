import { type ReactNode } from 'react';
import { type MarkdownCopyLabels } from './markdown-labels.tsx';
import { type AnalyzedMarkdownHtml } from './markdown-html.ts';
import type { SessionScope } from './api.ts';
/** The chunk-resident markdown renderer (mermaid lazy chunk), shared with the
 *  legacy no-HTML preview path in TextEditor. Defined in mermaid-lazy.tsx (a
 *  light module) so core-bundle consumers can import the stub without
 *  dragging DOMPurify along. */
export { LazyMermaidMarkdown } from './mermaid-lazy.tsx';
/** Everything the sanitizers need to resolve local media + scope the route. */
export interface MarkdownHtmlMedia {
    scope: SessionScope;
    path: string;
    origin: string;
}
interface MarkdownDocumentProps {
    info: AnalyzedMarkdownHtml;
    media: MarkdownHtmlMedia;
    codeLabels: MarkdownCopyLabels;
}
/**
 * The split-document renderer: markdown runs render through MarkdownSegment,
 * HTML runs render as sanitized leaves, and unclosed block elements lower the
 * following runs into themselves until their close part pops the frame (the
 * renderer's frame stack persists across segments). Stray closes at the top
 * level render nothing (the sanitizer/parser would drop them anyway), and
 * frames still open at the end of the document are closed like a browser
 * parser would. Sanitization runs once per prepared change, in a memo.
 */
export declare function MarkdownDocument({ info, media, codeLabels }: MarkdownDocumentProps): ReactNode;
