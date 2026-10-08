/**
 * The plugin's reusable PERSISTENT floating window: a draggable, resizable,
 * body-portaled card with its own title bar, close button and scrolling body.
 *
 * Why a second window primitive next to {@link AnchoredPopover}: that one is a
 * POPOVER — it is anchored to an element, sized to its content, and dismissed
 * by any interaction outside it (outside mousedown, window blur, its anchor
 * leaving the viewport). That contract is exactly wrong for a surface the
 * reader WATCHES for minutes: a job's output must survive clicking elsewhere,
 * must not grow past the viewport, and must keep its place while the work
 * runs. This component therefore carries the opposite lifecycle — only the
 * close button and Escape end it — plus the two interactions a watched pane
 * needs: move it out of the way, and resize it to the log at hand.
 *
 * The body is the window's own scroll container, which is what bounds a long
 * output (the popover it replaces had no height limit at all, so a chatty job
 * simply ran off screen). Callers that follow a live tail pass `bodyRef` and
 * scroll it themselves.
 *
 * Mechanics reuse the two proven patterns of this codebase rather than
 * inventing a third: the MOVE rides window-level pointer listeners (the
 * `AnchoredPopover` drag — capture on the container would retarget the
 * derived click and kill the buttons inside), and the RESIZE rides
 * `setPointerCapture` on the handle plus a `createFrameBatcher` per-frame
 * commit (the `EditorHost` docked-panel resize; a per-event setState on a
 * streamed log is the visible drag lag of #315).
 *
 * Skin contract: tokens only (`--dsw-alias-*` / `--dsw-font-*`), the floating
 * layer keeps the app's `--dsw-shadow-lv3`, and the radius matches the Tasks
 * page's node cards (8px).
 */
import { type ReactNode, type RefObject } from 'react';
export interface FloatingWindowProps {
    /** Title-bar text (also the dialog's accessible name). */
    title: string;
    /** Close (the button, or Escape). */
    onClose(): void;
    /** Initial size; omitted → 70% × 60% of the viewport, then clamped. */
    initialSize?: {
        width: number;
        height: number;
    };
    /** Resize floor; omitted → 320 × 240. */
    minSize?: {
        width: number;
        height: number;
    };
    /**
     * Where the window first appears: just below-right of this element (the
     * row that opened it). Omitted / off-screen anchors centre it.
     */
    anchor?: HTMLElement | null;
    /** Header controls, left of the close button (a job's copy action). */
    actions?: ReactNode;
    /** Bottom action row (a job's follow switch + stop control). */
    footer?: ReactNode;
    /**
     * The scrollable body element, for callers that follow a live tail. The
     * caller scrolls it; the window owns its size and its overflow.
     */
    bodyRef?: RefObject<HTMLDivElement>;
    /**
     * How the body stacks its children. `scroll` (default) flows them from the
     * top inside the scrolling box — right for a log or a table. `fill` makes
     * the body a column whose children stretch to the window's height — right
     * for a detail view or a form, where the point of enlarging the window is
     * more room for the content, not more empty space under it.
     */
    bodyLayout?: 'scroll' | 'fill';
    children: ReactNode;
}
/**
 * Render a persistent floating window. The caller owns WHAT is shown (body,
 * header actions, footer); this component owns the frame, the geometry, the
 * two drag gestures and the dismissal contract (close button + Escape only).
 */
export declare function FloatingWindow(props: FloatingWindowProps): ReactNode;
