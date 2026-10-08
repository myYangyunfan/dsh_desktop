/**
 * The single source for the syntax color families the app's code surfaces
 * use: one-dark for the dark scheme, one-light for the light scheme. Two
 * lazy-chunk consumers assemble their theme objects from these constants —
 * the terminal's curated ANSI 16 (TerminalView.tsx) and CodeMirror's
 * highlight rules (cm-themes.ts) — so a family color is defined exactly
 * once and the two views can never drift apart.
 *
 * The palette holds only the syntax hues; surface colors (background,
 * foreground, caret, gutter) are theme-token driven and selection tints /
 * token-fallback colors stay with their consumers (they are not part of
 * the designed syntax families).
 *
 * Chunk boundary: this module is inlined into BOTH lazy chunks that import
 * it (terminal and editor) — the constants are plain strings, the per-chunk
 * copy is a few hundred bytes, and no cross-chunk import is introduced. The
 * core bundle does not (and must not) import this module.
 */
/** one-dark family (dark scheme) syntax hues. */
export declare const ONE_DARK: {
    /** Editor-background tone; ANSI black. */
    readonly black: "#282c34";
    /** Default foreground gray; ANSI white. */
    readonly gray: "#abb2bf";
    /** Comment gray; ANSI bright black. */
    readonly faintGray: "#5c6370";
    /** Pure white; ANSI bright white and the invalid-token color. */
    readonly white: "#ffffff";
    readonly red: "#e06c75";
    readonly green: "#98c379";
    readonly yellow: "#e5c07b";
    readonly blue: "#61afef";
    readonly magenta: "#c678dd";
    readonly cyan: "#56b6c2";
    /** Numbers, bools, atoms, attribute names. */
    readonly orange: "#d19a66";
};
/** one-light family (light scheme) syntax hues. */
export declare const ONE_LIGHT: {
    /** Foreground dark; ANSI black and the operator color. */
    readonly black: "#383a42";
    /** Comment gray; ANSI white. */
    readonly gray: "#a0a1a7";
    /** ANSI bright black. */
    readonly faintGray: "#4f525e";
    /** Pure white; the invalid-token color (stays white in light for contrast). */
    readonly white: "#ffffff";
    /** Off-white; ANSI bright white. */
    readonly offWhite: "#fafafa";
    readonly red: "#e45649";
    readonly green: "#50a14f";
    readonly yellow: "#c18401";
    readonly blue: "#0184bc";
    readonly magenta: "#a626a4";
    readonly cyan: "#0997b3";
    /** Numbers and attribute names. */
    readonly orange: "#986801";
    /** Markdown links — the light family's dedicated link blue (dark rides blue). */
    readonly link: "#4078f2";
};
