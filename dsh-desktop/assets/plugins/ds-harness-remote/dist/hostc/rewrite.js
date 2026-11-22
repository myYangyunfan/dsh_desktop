/**
 * Makes a public request look like it was made to the local server directly,
 * so dev servers that check Host or Origin (Vite, Next.js) accept it.
 */
export function toLocalRequestHeaders(headers, publicOrigin, target) {
    const result = [["host", target.host]];
    for (const [name, value] of headers) {
        const lower = name.toLowerCase();
        if (lower === "host") {
            continue;
        }
        if ((lower === "origin" || lower === "referer") && (value === publicOrigin || value.startsWith(publicOrigin + "/"))) {
            result.push([name, target.origin + value.slice(publicOrigin.length)]);
            continue;
        }
        result.push([name, value]);
    }
    return result;
}
/** Points redirects at the local server back at the public URL. */
export function toPublicResponseHeaders(headers, publicOrigin, target) {
    const localOrigins = localOriginsFor(target);
    return headers.map(([name, value]) => {
        if (name.toLowerCase() !== "location") {
            return [name, value];
        }
        // Parsed as browsers do, so only the origin changes and `http://localhost:3000@evil.example` is not local.
        const authority = LOCATION_AUTHORITY.exec(value)?.[0];
        const origin = authority && URL.parse(value, target.href)?.origin;
        if (authority && origin && localOrigins.includes(origin)) {
            return [name, publicOrigin + value.slice(authority.length)];
        }
        return [name, value];
    });
}
/** The start of a Location that names a host: `http://host`, `//host`. Browsers read `\\` as `/` here. */
const LOCATION_AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:)?[\\/]{2,}[^\\/?#]*/i;
/** `http://localhost:3000` is also reachable as 127.0.0.1 and [::1]; apps redirect to any of them. */
function localOriginsFor(target) {
    const origins = new Set([target.origin]);
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    if (loopback.includes(target.hostname)) {
        for (const host of loopback) {
            origins.add(`${target.protocol}//${host}${target.port ? `:${target.port}` : ""}`);
        }
    }
    return [...origins];
}
/** Node's rawHeaders format: `[name, value, name, value, ...]`. */
export function fromRawHeaders(raw) {
    const result = [];
    for (let index = 0; index + 1 < raw.length; index += 2) {
        result.push([raw[index], raw[index + 1]]);
    }
    return result;
}
export function toRawHeaders(headers) {
    return headers.flat();
}
//# sourceMappingURL=rewrite.js.map