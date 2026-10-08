export interface BottomPushInput {
    /** Whether the bottom workbench is expanded. */
    open: boolean;
    /** Committed (or mid-drag) bottom height in px. */
    height: number;
    /** Viewport height the cap is measured against (visual viewport when known). */
    viewportHeight: number;
}
/** Compute the live layout-push height for the bottom workbench. */
export declare function bottomPushHeight(input: BottomPushInput): number;
