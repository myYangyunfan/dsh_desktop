/**
 * The floating "add selection to conversation" popup shared by the text
 * viewers (markdown preview + the catch-all code viewer): a viewport-anchored
 * button portaled to `document.body`, kept alive across the selection gesture
 * and committed on click.
 *
 * Dismissal contract (fixes upstream issue #425): the popup must never
 * outlive its editor surface. The sidebar keeps every tab MOUNTED — switching
 * tabs only flips the pane cell to `display:none` and collapsing the panel
 * translates it off-screen — while the portaled `position:fixed` button stays
 * pinned to its viewport anchor, ignoring both. The caller already hides on
 * surface scrolls, selection collapse and mode flips; this hook adds the
 * global dismissal that covers everything else:
 *
 * - any `mousedown` outside the button (tab bar, composer, another pane,
 *   the collapse toggle, …) closes it;
 * - `Escape` closes it;
 * - the document going hidden (`visibilitychange`) or the window losing
 *   focus closes it;
 * - an `IntersectionObserver` on the editor surface closes it as soon as the
 *   surface leaves the viewport — the tab-switch (`display:none`) and
 *   panel-collapse (translated off-screen) paths have no DOM events of their
 *   own, so the geometry signal is the only reliable one.
 *
 * The button's own `mousedown` is never treated as an outside click: the
 * caller preventDefaults it to keep the selection/caret alive until the
 * click commits (the hook's capture-phase listener runs first and must not
 * hide for it).
 */
import { type RefObject } from 'react';
/** The floating "add to conversation" action: payload + viewport anchor. */
export interface SelectionPopup {
    insert: string;
    left: number;
    top: number;
}
export interface SelectionPopupOptions {
    /** Commit the payload into the composer draft (button click). */
    onCommit(insert: string): void;
    /**
     * The DOM surface that must stay on screen for the popup to live: the
     * markdown preview container in preview mode, the CodeMirror host
     * otherwise. Called lazily (refs are null until the content loads).
     */
    getSurface(): HTMLElement | null;
}
export interface SelectionPopupControls {
    /** The current popup (null = hidden). */
    popup: SelectionPopup | null;
    /** Attach to the portaled button element. */
    buttonRef: RefObject<HTMLButtonElement>;
    /** Anchor the popup above a selection (viewport-clamped). */
    show(insert: string, left: number, top: number): void;
    /** Hide the popup (idempotent). */
    hide(): void;
    /** The button's click: commit the stored payload, then hide. */
    commit(): void;
}
export declare function useSelectionPopup(options: SelectionPopupOptions): SelectionPopupControls;
