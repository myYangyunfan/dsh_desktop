/**
 * CodeMirror 6 theme pieces for the sidebar editor. The editor surface
 * (background, caret, gutter) rides the DSH theme tokens so it blends with
 * the panel in both schemes; only the syntax token colors need concrete
 * values, and those come from the same designed syntax families the app's
 * code surfaces use — one-dark for dark, one-light for light
 * (one-dark-palette.ts, shared with the terminal's ANSI palette). The
 * scheme flip reconfigures these via a compartment (see TextEditor), so
 * the document, undo history and scroll survive re-theming.
 */
import { Compartment } from '@codemirror/state';
/** Token-driven surface shared by both schemes (pure CSS values). */
export declare const cmSurfaceTheme: import("@codemirror/state").Extension;
/**
 * A Compartment holding the two scheme-dependent extensions. Created once
 * per editor view; a scheme flip dispatches `reconfigure(dark)` on it, so
 * the document, undo history, scroll and keymaps survive re-theming.
 */
export declare class CmThemeCompartment {
    private readonly compartment;
    /** `of(...)` payload for EditorState.create. */
    of(dark: boolean): ReturnType<Compartment['of']>;
    /** Reconfigure for a new scheme. */
    reconfigure(dark: boolean): ReturnType<Compartment['reconfigure']>;
}
