/**
 * Return the Markdown source used by preview renderers.
 *
 * A closed YAML frontmatter block is metadata, but the shared MarkdownText
 * parser treats its delimiters as a thematic break and a setext heading. Hide
 * only a block that starts on the first line and has its own closing `---`
 * line. Unclosed or non-leading delimiters remain byte-for-byte unchanged so
 * ordinary Markdown is never truncated. The editor and save path keep using
 * the original source; this helper is preview-only.
 */
export declare function markdownPreviewSource(source: string): string;
