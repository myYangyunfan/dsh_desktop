import { RpcError } from './safe-error.js';
// Cordis returns a fresh tracing proxy on each context lookup.
const cordisOriginal = Symbol.for('cordis.original');
function originalAuth(auth) {
    return Reflect.get(auth, cordisOriginal) ?? auth;
}
export async function openDshWebUpstream(resolveRuntime, signal) {
    const runtime = resolveRuntime();
    if (!runtime)
        throw new RpcError('DSH_WEB_NOT_READY', 'The DSH Web GUI is unavailable.', undefined, true);
    const authInstance = originalAuth(runtime.auth);
    const cookie = browserCookie(runtime);
    const local = await fetch(runtime.origin, { headers: { cookie }, redirect: 'manual', signal });
    await local.body?.cancel();
    if (!local.ok || !local.headers.get('content-type')?.startsWith('text/html'))
        throw new RpcError('DSH_WEB_NOT_READY', 'The local Web GUI did not respond.', undefined, true);
    const isCurrent = () => {
        const current = resolveRuntime();
        return current?.origin.href === runtime.origin.href && originalAuth(current.auth) === authInstance;
    };
    return {
        target: runtime.origin,
        isCurrent,
        authorize(request, browserOrigin) {
            if (!isCurrent())
                return;
            return authorizeUpstream(request, browserOrigin, cookie);
        },
        stripResponseHeaders,
    };
}
function browserCookie({ origin, auth }) {
    const bootstrap = new URL(auth.authenticatedUrl(origin.href));
    let cookie;
    auth.authorizeIndex({ method: 'GET', url: '/' + bootstrap.search, headers: { host: origin.host } }, {
        writeHead(status, headers) { if (status === 303)
            cookie = headers?.['set-cookie']?.split(';')[0]; },
        end() { },
    });
    if (!cookie || auth.requestRejection({ headers: { host: origin.host, cookie } }) !== undefined)
        throw new RpcError('DSH_WEB_NOT_READY', 'The local Web GUI authentication is unavailable.', undefined, true);
    return cookie;
}
export function authorizeUpstream(request, publicUrl, cookie) {
    let path;
    try {
        path = decodeURIComponent(request.path.split('?')[0] ?? '');
    }
    catch {
        return;
    }
    if (!path.startsWith('/') || path.startsWith('//') || /[%\\\u0000-\u0020\u007f?#]/.test(path)
        || path.split('/').some(segment => segment === '.' || segment === '..')
        || /^\/(ds-harness-remote|__remote|connect)(\/|$)/i.test(path)
        || new URL(request.path, publicUrl).searchParams.has('token')
        || !/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(request.method))
        return;
    const headers = [];
    for (const [name, value] of request.headers) {
        const lower = name.toLowerCase();
        if (lower === 'origin' && value !== publicUrl.origin)
            return;
        if (lower === 'sec-fetch-site' && value === 'cross-site')
            return;
        if (lower === 'cookie' || lower === 'authorization' || lower === 'forwarded' || lower.startsWith('x-forwarded-'))
            continue;
        headers.push([name, value]);
    }
    headers.push(['cookie', cookie]);
    return { ...request, headers };
}
function stripResponseHeaders(headers) {
    return headers.filter(([name, value]) => name.toLowerCase() !== 'set-cookie'
        && !(name.toLowerCase() === 'location' && /[?&]token=/i.test(value)));
}
//# sourceMappingURL=dsh-web-upstream.js.map