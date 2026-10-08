/**
 * Submenu flip geometry for the portaled context menus.
 *
 * The primitives `Menu` clamps its main list into the viewport (portal mode,
 * 12px margin) but positions nested submenus with pure CSS — `bottom: -4px`
 * (grow UP from the parent row) and `left: calc(100% + 10px)` (open RIGHT of
 * the card) — with no viewport clamp at all. This sidebar lives docked on the
 * RIGHT edge of the window, so both defaults are the worst case here: a tall
 * "open with" submenu pokes past the viewport top when the row menu opens
 * near the top, and past the right edge whenever the panel is narrow.
 *
 * The host primitive is not ours to patch, so the fix is a body attribute
 * written while one of OUR submenu-bearing menus is open: layout.css flips
 * the submenu's growth direction per token. The attribute's lifetime IS the
 * scope — only our menus set it, and layout.css rules for
 * `div[role="menu"] div[role="menu"]` only apply while it exists, so
 * host-owned menus are never touched.
 */
/** body attribute carrying the flip tokens (whitespace-separated words). */
export declare const SUBMENU_FLIP_ATTR = "data-dsh-sidebar-submenu";
/**
 * The flip tokens for a menu opened at viewport coordinates (x, y):
 * `down` — open the submenu downward from the parent row (cursor in the
 * upper half; the sidebar's tab strip is always up there);
 * `left` — open the submenu leftward of the card (not enough right-hand
 * room). Empty string when the primitive's defaults already fit.
 */
export declare function submenuFlipTokens(x: number, y: number, vw: number, vh: number): string;
/**
 * Publish the flip tokens on <body> while the given cursor-anchored menu
 * state is open; clear them on close and on unmount (a menu left open by an
 * unmounting panel must not leave stale geometry on the shared body).
 * `menu` only needs the viewport coordinates the Menu anchored to.
 */
export declare function useSubmenuFlip(menu: {
    x: number;
    y: number;
} | null): void;
