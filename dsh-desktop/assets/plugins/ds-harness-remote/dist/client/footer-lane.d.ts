/**
 * Footer action capacity contract shared by every `sidebar.footer.action`
 * occupant.
 *
 * The sidebar footer is a single flex row owned by the host. Several plugins
 * seat their own button there, and the host gives an occupant neither a row gap
 * nor its peer count: each plugin has to derive its own form from the same
 * stable inputs, or neighbours end up measuring each other and oscillate
 * (A expands -> B narrows -> B shrinks -> A expands again).
 *
 * The contract therefore only takes "occupant count" and "row width", both of
 * which are observable without reading a peer's chosen form, and it is
 * all-or-nothing: when the row cannot hold one labelled seat per occupant every
 * occupant renders the icon form. Two forms exist, matching the host's own
 * sidebar geometry -- a 42px label row and a 36x36 icon target, both using the
 * host's 12px radius and inline paint inset.
 */
/** Icon-form target, identical to the host's rail controls (36x36, 12px radius). */
export declare const FOOTER_ICON_WIDTH = 36;
/** Capacity estimate for one labelled seat; not a style constraint. */
export declare const FOOTER_MAX_LABEL_BOX = 112;
/** More than this many occupants in one row always render the icon form. */
export declare const FOOTER_COUNT_LIMIT = 2;
/** Visual gap between two neighbours: both sides contribute a 2px inline margin. */
export declare const FOOTER_ROW_GAP = 4;
/** Host row furniture (sidebar inline padding on both sides). */
export declare const FOOTER_ROW_PADDING = 16;
export type FooterForm = 'label' | 'icon';
/** Facts measured from the real footer row; `row` stays null when there is no row. */
export interface FooterSeatFacts {
    row: Element | null;
    /** The row lays its occupants out horizontally. */
    lane: boolean;
    /** The row currently wraps, so every occupant may occupy a full line. */
    wrapped: boolean;
    /** Occupants sharing the lane, including this button; 0 while no lane was found. */
    count: number;
    /** Row content width; NaN when it could not be measured. */
    rowWidth: number;
}
/** Minimal computed-style surface, injected so tests can supply a fake view. */
export interface FooterSeatView {
    getComputedStyle(element: Element): {
        readonly display: string;
        readonly flexDirection: string;
        readonly flexWrap: string;
        readonly position: string;
    };
}
/** Width one row needs to keep the label form for `count` occupants. */
export declare function footerRequiredWidth(count: number): number;
/**
 * Resolve the form from stable inputs only.
 *
 * `count > FOOTER_COUNT_LIMIT` is an icon regardless of width; a width that
 * could not be measured resolves to the compact icon form rather than the
 * overflowing label form (the text stays in `title` / `aria-label`).
 */
export declare function resolveFooterForm(count: number, rowWidth: number): FooterForm;
/** An entry occupies lane space unless it is an overlay or renders at zero size. */
export declare function occupiesFooterSeat(entry: {
    position?: string;
    width?: number;
    height?: number;
} | null | undefined): boolean;
/**
 * Measure the facts of the flex row that contains `entry`.
 *
 * The entry is the anchor: the slot outlet is a `display: contents` shell with
 * no box of its own, so the walk climbs until it finds a laid-out box, and lane
 * entries are collected through the same expansion. A single-child plain wrapper
 * is not the row either. This function reads layout only; it never mutates the
 * host DOM (injecting `flex-wrap` here would push the settings row down).
 */
export declare function measureFooterSeat(entry: Element | null | undefined, view?: FooterSeatView | undefined): FooterSeatFacts;
/**
 * Map measured facts to one of the two forms.
 *
 * The rail (collapsed sidebar) is always the icon target. A host row that turned
 * vertical or wraps is a container shape, not a capacity decision: the label form
 * keeps the occupant on its own full line. Otherwise the shared capacity rule
 * decides, so every occupant of the row reaches the same answer independently.
 */
export declare function footerFormFor(facts: FooterSeatFacts, wide: boolean): FooterForm;
/**
 * Keep one entry's form in sync with the live footer row.
 *
 * `ResizeObserver` follows the row width and the entry itself, `MutationObserver`
 * follows neighbours mounting or leaving (both are attributed to the row's
 * subtree, which is the only signal an occupant gets), and `window resize`
 * covers the sidebar being dragged. The callback fires only when the resolved
 * form changes, so a re-render cannot feed itself.
 */
export declare function watchFooterLane(entry: Element, wide: () => boolean, onForm: (form: FooterForm) => void, view?: FooterSeatView | undefined): () => void;
//# sourceMappingURL=footer-lane.d.ts.map