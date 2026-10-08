/**
 * Pure URL vocabulary of the /sidebar/html route (HTML previewer).
 *
 * Why path-encoded parameters instead of a query string: the previewed
 * page resolves its relative assets (./style.css, img/x.png) against the
 * document URL, and the WHATWG URL algorithm DROPS the query of a
 * path-relative reference — `/sidebar/html?a=1&path=/a/b/` + `./style.css`
 * would lose the session scope and the route would reject the asset.
 * Encoding everything into the URL path keeps relative resolution inside
 * the same route with every request self-contained:
 *
 *   /sidebar/html/<sessionId>/<absolute-path segments, encodeURIComponent'd>
 *   /sidebar/html/S/Users/me/proj/index.html
 *     + ./style.css → /sidebar/html/S/Users/me/proj/style.css
 *   Windows: C:\Users\me\a.html → /sidebar/html/S/C%3A/Users/me/a.html
 *   UNC (\\server\share\... or //server/share/...):
 *     → /sidebar/html/S//server/share/proj/a.html  ('//' right after the
 *       sessionId marks the UNC prefix; the WHATWG URL keeps '//' intact so
 *       relative assets still resolve inside the same route)
 *
 * The decoder rebuilds the marker as a forward-slash `//server/share/...`
 * path. That form is intentionally platform-neutral: `node:path` resolves it
 * to `\\server\share\...` on win32 and `/server/share/...` on POSIX, so the
 * host's existing requireAbsolute + isWithin fence needs no platform signal
 * (a leading `//` is a legal POSIX absolute path, so no data is lost on
 * either platform).
 *
 * This module is intentionally dependency-free (no node imports, no wire
 * helpers) so the client bundle can import `encodeHtmlUrl` without tripping
 * the build-time purity gate; the host converts decode failures into
 * SidebarError responses at the route boundary.
 */
/** One decoded route reference. */
export interface HtmlRouteRef {
    sessionId: string;
    /** Absolute file path (leading slash; Windows drives keep their colon). */
    path: string;
}
/** Decode outcome: the reference, or a client-error description. */
export type HtmlDecodeResult = {
    ok: true;
    ref: HtmlRouteRef;
} | {
    ok: false;
    status: 400 | 404;
    message: string;
};
/** The route prefix both encoders/decoders agree on. */
export declare const HTML_ROUTE_PREFIX = "/sidebar/html/";
/** Build the route URL for one absolute file path (client + tests). */
export declare function encodeHtmlUrl(sessionId: string, path: string): string;
/**
 * Decode a route pathname into the session + absolute file path. Rejects
 * a wrong prefix (404), an empty path, malformed percent encoding, and a
 * missing sessionId or file path (400). The caller still must bound the
 * decoded path with the workspace real-path guard — a decoded `..`
 * segment resolves outside the cwd and is refused there.
 */
export declare function decodeHtmlUrl(pathname: string): HtmlDecodeResult;
