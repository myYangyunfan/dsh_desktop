export declare function useCenterColumn(
/** The bottom panel element: measureCenter writes its edges directly. */
bottomRef: {
    readonly current: HTMLDivElement | null;
}, 
/** Re-runs the whole locate/measure chain on change (opening the bottom
 *  panel re-runs the chain: a panel opened before the center column was
 *  ever found must not stay invisible forever). */
bottomOpen: boolean | undefined): {
    centerColRef: import("react").MutableRefObject<HTMLElement | null>;
    centerRectRef: import("react").MutableRefObject<{
        left: number;
        right: number;
    }>;
    centerMeasured: boolean;
    measureCenter: () => void;
    draggingRef: import("react").MutableRefObject<boolean>;
};
