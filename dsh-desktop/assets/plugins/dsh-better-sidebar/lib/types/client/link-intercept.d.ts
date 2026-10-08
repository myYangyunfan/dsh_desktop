/**
 * External-link interception: clicking an http(s) link that a REGISTERED tab
 * type CLAIMS through `urlTarget` opens that type in the sidebar. Everything
 * else is left alone — the plugin never `preventDefault`s a link it cannot
 * serve, because the destination of a chat link is not the plugin's call:
 * since DSH 0.1.7 the host's `ui-chat` `openExternalLink` applies the user's
 * `linkOpening` setting and the host's own browser tab (a kind the Web
 * profile disables), and inside plugin-drawn markdown (sidechat
 * transcripts, editor previews, HTML previews, diff panes) the anchor's own
 * default (`window.open`) applies.
 *
 * A Ctrl/Cmd/Shift/Alt-modified click always bypasses the takeover so the
 * user can still force a real browser tab.
 *
 * Only the GUI's OWN document is watched — links inside a sandboxed iframe
 * live in another document and never bubble here (and their clicks must keep
 * working inside the sidebar).
 */
/** The pure decision: the URL a click may hand to the sidebar, or null to let
 *  the click fall through. Extracted so the policy is unit-testable without a
 *  DOM. `anchorHref` must be the ABSOLUTE href (`<a>.href` already is).
 *  The protocol/same-origin policy lives HERE; whether some enabled tab type
 *  actually claims the URL is the caller's `takeoverEnabled` callback. */
export declare function shouldInterceptLink(anchorHref: string, selfOrigin: string): string | null;
/** Whether a left-click may be taken over (unmodified left click only). */
export declare function isPlainLeftClick(event: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}): boolean;
/**
 * The caller-side gate: take a link over only when the sidebar is not
 * suspended AND some enabled tab type claims the URL. An unclaimed link is
 * the host's to route (its `openExternalLink` / the anchor's own default).
 */
export declare function shouldTakeOverLink(url: URL, opts: {
    /** Another panel provider owns the right column — the sidebar must not act. */
    suspended: boolean;
    /** The tab type claiming this URL through `urlTarget` (enabled tabs only). */
    resolveTarget: (url: URL) => string | undefined;
}): boolean;
/**
 * Whether a claimed type is still on offer at OPEN time: registered in the
 * tab registry AND not switched off in the settings. The claim (gate) and the
 * open are two separate turns of the event loop, so the type may disappear in
 * between — a plugin unloaded, the user disabled it, the registry reset.
 */
export declare function isTargetAvailable(type: string, tabs: readonly {
    id: string;
}[], tabsEnabled: Record<string, boolean>): boolean;
/**
 * Open an intercepted link: the sidebar tab when the claimed type is still
 * available, a real browser tab otherwise. The fallback is not decoration —
 * the plugin's own `openTab` silently ignores an unknown / disabled type
 * (service.ts returns early), so without it a taken-over click would do
 * nothing at all. Returns the path taken (tests assert the fallback).
 */
export declare function openInterceptedLink(url: string, deps: {
    /** The tab type claiming this URL through `urlTarget` (enabled tabs only). */
    resolveTarget: (url: URL) => string | undefined;
    /** Whether that type is still registered and enabled ({@link isTargetAvailable}). */
    isAvailable: (type: string) => boolean;
    /** The plugin's own tab service (`ctx.get('betterSidebar')`), when attached. */
    sidebar: {
        openTab: (seed: {
            type: string;
            url: string;
            title?: string;
        }) => void;
    } | undefined;
}): 'sidebar' | 'window';
/**
 * Register the document-level click capture that funnels CLAIMED external
 * links into the sidebar. Returns the disposer (HMR-safe).
 */
export declare function registerLinkInterception(opts: {
    /** Whether the takeover may happen for THIS url (the caller's gate —
     *  {@link shouldTakeOverLink}: not suspended and claimed by an enabled
     *  tab type). */
    takeoverEnabled: (url: URL) => boolean;
    /** Open the URL — the caller resolves the claimed type and falls back to a
     *  real browser tab when it is gone ({@link openInterceptedLink}). */
    openInSidebar: (url: string) => void;
    /** The GUI's own origin (window.location.origin at registration). */
    selfOrigin: string;
}): () => void;
