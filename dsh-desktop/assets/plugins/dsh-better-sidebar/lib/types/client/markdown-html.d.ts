/**
 * Raw-HTML block detection for the markdown preview. The shared `MarkdownText`
 * renders raw HTML as literal text (a chat-security stance), so a GitHub-style
 * README (`<div align="center">` badge walls, `<details>` collapsibles with
 * markdown inside, table cells full of inline tags) previews as source soup.
 * This module's pure splitter lifts those HTML runs OUT of the markdown stream
 * before rendering: markdown runs keep flowing through `MarkdownText` (shiki /
 * KaTeX / GFM intact, mermaid chunk path unchanged) while HTML runs render as
 * sanitized DOM (see markdown-html.tsx).
 *
 * Splitting follows CommonMark's shape closely enough for real-world READMEs:
 * a line outside code fences that starts with a block-level tag (type-6 list
 * below) or `<!--` opens an HTML run that extends to the next blank line
 * (comments end at the line containing `-->`). Inline-only tags (`<b>`, `<br>`,
 * `<a>`…) never open a run — they stay in the markdown stream and are handled
 * by the inline pass instead. Unclosed block tags (`<details>` … markdown …
 * `</details>`) are surfaced by {@link analyzeHtmlSegment} as ordered parts so
 * the renderer can nest the in-between markdown inside the open element, the
 * way GitHub's linear HTML output nests.
 */
/** A run of raw HTML lines lifted out of the markdown stream. */
export interface HtmlSegment {
    kind: 'html';
    text: string;
}
/** A run of markdown source (may contain non-mermaid fences, inline HTML…). */
export interface MarkdownHtmlSegment {
    kind: 'markdown';
    text: string;
}
export type MdHtmlSegment = MarkdownHtmlSegment | HtmlSegment;
/** The doc-wide analysis the preview consumes (all pure, unit-tested here). */
export interface AnalyzedMarkdownHtml {
    /** The document split into markdown / html runs (empty input → []). */
    segments: MdHtmlSegment[];
    /** True when at least one html run was lifted out. */
    hasBlockHtml: boolean;
    /** True when the source contains any tag-like text (block OR inline). */
    hasInlineHtml: boolean;
    /** Every reference definition found in the markdown runs (`[label]: dest`
     *  lines), joined — appended to each markdown run so `[text][id]` keeps
     *  resolving across the lifted HTML runs (first-match wins makes the
     *  appended copy inert inside runs that already define it). */
    referenceDefinitions: string;
}
/**
 * CommonMark HTML-block type-6 tag names (block-level elements), lowercased.
 * A line starting with one of these (open or close) outside a fence begins an
 * HTML run. `<summary>` is CommonMark-inline but intentionally included: it is
 * the idiomatic first child of a `<details>` run in GitHub-flavored READMEs.
 */
export declare const HTML_BLOCK_TAGS: ReadonlySet<string>;
/** One structural piece of a lifted HTML run, in document order. */
export type HtmlPart = {
    kind: 'html';
    html: string;
} | {
    kind: 'open';
    tag: string;
    attrs: string;
} | {
    kind: 'close';
    tag: string;
};
/** The run's structure relative to the surrounding document nesting. */
export interface HtmlSegmentShape {
    parts: HtmlPart[];
}
/**
 * Reduce a lifted HTML run to ordered parts: balanced spans become `html`
 * leaves, unclosed open tags become `open` (a wrapper the renderer lowers
 * following markdown runs into), unmatched closes become `close` (pops one
 * wrapper level). A mismatched close pops through the matching open — the
 * HTML parser's implicit-close behavior. Runs with no structural tags reduce
 * to a single `html` part.
 */
export declare function analyzeHtmlSegment(source: string): HtmlSegmentShape;
/**
 * Split markdown source into markdown / html runs (fence-aware: an HTML-looking
 * line inside any fenced code block is content, not a run start). Blank lines
 * terminate HTML runs and are dropped between segments (they carry no markdown
 * semantics the preview needs); everything else stays byte-identical.
 */
export declare function splitHtmlBlocks(text: string): MdHtmlSegment[];
/**
 * Collect the reference definitions of every markdown run (HTML runs cannot
 * define them), in document order, newline-joined for appending.
 */
export declare function collectReferenceDefinitions(segments: readonly MdHtmlSegment[]): string;
/**
 * The whole-document gate + split the preview consumes. `hasInlineHtml` is a
 * cheap source-level regex (code-fence content may false-positive; the inline
 * pass skips rendered code blocks anyway, so a false positive only costs the
 * enhanced render path, never a behavior change).
 */
export declare function analyzeMarkdownHtml(text: string): AnalyzedMarkdownHtml;
