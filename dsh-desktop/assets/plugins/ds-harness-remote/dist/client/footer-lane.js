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
export const FOOTER_ICON_WIDTH = 36;
/** Capacity estimate for one labelled seat; not a style constraint. */
export const FOOTER_MAX_LABEL_BOX = 112;
/** More than this many occupants in one row always render the icon form. */
export const FOOTER_COUNT_LIMIT = 2;
/** Visual gap between two neighbours: both sides contribute a 2px inline margin. */
export const FOOTER_ROW_GAP = 4;
/** Host row furniture (sidebar inline padding on both sides). */
export const FOOTER_ROW_PADDING = 16;
const NO_FACTS = { row: null, lane: false, wrapped: false, count: 0, rowWidth: Number.NaN };
/** Width one row needs to keep the label form for `count` occupants. */
export function footerRequiredWidth(count) {
    if (count <= 0)
        return 0;
    return count * FOOTER_MAX_LABEL_BOX + (count - 1) * FOOTER_ROW_GAP + FOOTER_ROW_PADDING;
}
/**
 * Resolve the form from stable inputs only.
 *
 * `count > FOOTER_COUNT_LIMIT` is an icon regardless of width; a width that
 * could not be measured resolves to the compact icon form rather than the
 * overflowing label form (the text stays in `title` / `aria-label`).
 */
export function resolveFooterForm(count, rowWidth) {
    if (count <= 0)
        return 'label';
    if (count > FOOTER_COUNT_LIMIT)
        return 'icon';
    if (!Number.isFinite(rowWidth))
        return 'icon';
    return rowWidth >= footerRequiredWidth(count) ? 'label' : 'icon';
}
/** An entry occupies lane space unless it is an overlay or renders at zero size. */
export function occupiesFooterSeat(entry) {
    if (entry === null || entry === undefined)
        return false;
    if (entry.position === 'fixed' || entry.position === 'absolute')
        return false;
    return (entry.width ?? 0) > 0 && (entry.height ?? 0) > 0;
}
/**
 * Measure the facts of the flex row that contains `entry`.
 *
 * The entry is the anchor: the slot outlet is a `display: contents` shell with
 * no box of its own, so the walk climbs until it finds a laid-out box, and lane
 * entries are collected through the same expansion. A single-child plain wrapper
 * is not the row either. This function reads layout only; it never mutates the
 * host DOM (injecting `flex-wrap` here would push the settings row down).
 */
export function measureFooterSeat(entry, view = globalThis) {
    const styleOf = view !== undefined && typeof view.getComputedStyle === 'function' ? view.getComputedStyle.bind(view) : null;
    if (entry === null || entry === undefined || styleOf === null)
        return { ...NO_FACTS };
    let node = entry;
    while (node !== null && node.parentElement != null) {
        const row = node.parentElement;
        const style = styleOf(row);
        if (style.display === 'contents') {
            node = row;
            continue;
        }
        if (style.display !== 'flex' && style.display !== 'inline-flex') {
            if (row.children.length === 1) {
                node = row;
                continue;
            }
            return { ...NO_FACTS };
        }
        const facts = {
            row,
            lane: style.flexDirection.startsWith('row'),
            wrapped: style.flexWrap !== 'nowrap',
            count: 1,
            rowWidth: row.clientWidth,
        };
        if (!facts.lane)
            return facts;
        const collect = (container) => {
            for (const child of Array.from(container.children)) {
                const childStyle = styleOf(child);
                if (childStyle.display === 'contents') {
                    collect(child);
                    continue;
                }
                if (child.contains(entry))
                    continue;
                const rect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : { width: 0, height: 0 };
                if (!occupiesFooterSeat({ position: childStyle.position, width: rect.width, height: rect.height }))
                    continue;
                facts.count += 1;
            }
        };
        collect(row);
        return facts;
    }
    return { ...NO_FACTS };
}
/**
 * Map measured facts to one of the two forms.
 *
 * The rail (collapsed sidebar) is always the icon target. A host row that turned
 * vertical or wraps is a container shape, not a capacity decision: the label form
 * keeps the occupant on its own full line. Otherwise the shared capacity rule
 * decides, so every occupant of the row reaches the same answer independently.
 */
export function footerFormFor(facts, wide) {
    if (!wide)
        return 'icon';
    if (facts.row === null)
        return 'label';
    if (!facts.lane || facts.wrapped)
        return 'label';
    return resolveFooterForm(facts.count, facts.rowWidth);
}
/**
 * Keep one entry's form in sync with the live footer row.
 *
 * `ResizeObserver` follows the row width and the entry itself, `MutationObserver`
 * follows neighbours mounting or leaving (both are attributed to the row's
 * subtree, which is the only signal an occupant gets), and `window resize`
 * covers the sidebar being dragged. The callback fires only when the resolved
 * form changes, so a re-render cannot feed itself.
 */
export function watchFooterLane(entry, wide, onForm, view = globalThis) {
    let reported;
    let row = null;
    let resize;
    let mutation;
    let disposed = false;
    const sync = () => {
        if (disposed)
            return;
        const facts = measureFooterSeat(entry, view);
        const nextForm = footerFormFor(facts, wide());
        if (nextForm !== reported) {
            reported = nextForm;
            onForm(nextForm);
        }
        if (facts.row === row)
            return;
        resize?.disconnect();
        mutation?.disconnect();
        resize = undefined;
        mutation = undefined;
        row = facts.row;
        if (row === null)
            return;
        if (typeof ResizeObserver === 'function') {
            resize = new ResizeObserver(sync);
            resize.observe(row);
            resize.observe(entry);
        }
        if (typeof MutationObserver === 'function') {
            mutation = new MutationObserver(sync);
            mutation.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        }
    };
    sync();
    if (typeof window !== 'undefined')
        window.addEventListener('resize', sync);
    return () => {
        disposed = true;
        resize?.disconnect();
        mutation?.disconnect();
        if (typeof window !== 'undefined')
            window.removeEventListener('resize', sync);
    };
}
//# sourceMappingURL=footer-lane.js.map