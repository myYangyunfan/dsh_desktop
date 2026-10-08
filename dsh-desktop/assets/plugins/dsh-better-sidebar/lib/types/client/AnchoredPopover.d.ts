/**
 * The anchored floating popover of the Tasks page (node details, job output,
 * workflow run detail): a viewport-anchored card portaled to `document.body`,
 * positioned below its anchor and flipped above when the viewport bottom
 * would clip it. Dismissal follows the proven selection-popup contract
 * (fixes upstream issue #425): outside mousedown, Escape, document hidden,
 * window blur, and the ANCHOR leaving the viewport (tab switches flip the
 * pane to display:none, which has no DOM event — the IntersectionObserver
 * geometry signal is the only reliable one).
 *
 * DRAGGABLE mode: the job-output popover must be movable (a long log needs to
 * sit wherever the reader puts it). While `draggable`, dragging the card (or
 * its `data-popover-handle` area) moves it; the offset is clamped to the
 * viewport and a double click re-anchors it. The card stays portaled and
 * viewport-positioned — DSH 0.1.5 has no host free-window API, so the drag
 * is implemented here rather than reaching for a platform window.
 */
import { type ReactNode } from 'react';
export interface AnchoredPopoverProps {
    /** The anchor element (null = closed). */
    anchor: HTMLElement | null;
    /** Dismiss (outside click / Escape / anchor off-screen). */
    onClose(): void;
    /** Allow dragging the card (default false = pinned to the anchor). */
    draggable?: boolean;
    /** Card width in px before viewport clamping (default 264). */
    width?: number;
    children: ReactNode;
}
/**
 * Render a viewport-anchored popover. The caller owns WHAT is shown inside;
 * this component owns geometry, dragging and dismissal. Changing the anchor
 * re-measures and resets any drag offset.
 */
export declare function AnchoredPopover(props: AnchoredPopoverProps): ReactNode;
