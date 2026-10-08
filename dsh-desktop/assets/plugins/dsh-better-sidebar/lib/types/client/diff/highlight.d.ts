/**
 * Lightweight syntax highlighting for the shared diff renderer: extension-
 * based language detection plus a single-pass line tokenizer that colors
 * comments, strings, numbers, keywords, types, functions, and preprocessor
 * directives for common languages (C/C++, Java, C#, JS/TS, Python, Go, Rust,
 * shell, batch, PowerShell, and config formats). Pure functions only — no
 * React, no DOM. Multi-line block-comment state threads across lines via
 * scanLine's inBlock parameter, so interior lines of a block comment color
 * correctly.
 */
/** Token classes mapped 1:1 to panel CSS color classes. */
export type TokenType = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'type' | 'function' | 'macro';
/** One token span: a run of one line sharing one token class. */
export interface CodeToken {
    readonly text: string;
    readonly type: TokenType;
}
/**
 * Language id for a file path's extension (the read tool's mapping): the
 * lowercase extension without its dot; dotfiles and unknown extensions map to
 * undefined (plain text).
 * @param path - the op's file path exactly as recorded.
 * @returns the language id, or undefined for plain text.
 */
export declare function langOfPath(path: string): string | undefined;
/** One line's scan output: its tokens plus whether a block comment stays open. */
export interface ScanResult {
    readonly tokens: CodeToken[];
    readonly inBlock: boolean;
}
/** Scan one line, entering from (and reporting) block-comment state. */
export declare function scanLine(line: string, lang: string | undefined, inBlock?: boolean): ScanResult;
/** Tokenize one line with no incoming block state (standalone lines). */
export declare function tokenizeLine(line: string, lang: string | undefined): CodeToken[];
/** True when the language has multi-line block-comment delimiters. */
export declare function hasBlockComment(lang: string | undefined): boolean;
/** Token classes worth wrapping in a span; plain runs join the parent text node. */
export declare function isColored(token: CodeToken): boolean;
