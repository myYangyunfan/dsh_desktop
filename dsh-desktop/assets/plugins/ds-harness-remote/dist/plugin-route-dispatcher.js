/** Resolve lazily: Connection may activate after the Remote plugin. */
export function createPluginRouteDispatcher(readConnection, readPort, peer) {
    let cookie;
    return async (route, body, signal) => {
        signal.throwIfAborted();
        const connection = readConnection();
        const handler = connection?.createSharedFetchHandler?.('/api');
        const upload = route === 'api/session/uploadFileBinary'
            ? body.payload : undefined;
        const query = upload === undefined ? '' : `?${new URLSearchParams({ sessionId: upload.sessionId, ...(upload.mediaType === undefined ? {} : { mediaType: upload.mediaType }),
            ...(upload.name === undefined ? {} : { name: upload.name }) })}`;
        const contentType = upload === undefined ? 'application/json' : 'application/octet-stream';
        const requestBody = upload === undefined ? JSON.stringify(body ?? {}) : Buffer.from(upload.data, 'base64');
        let response;
        if (handler !== undefined) {
            // The authenticated Remote channel has already admitted this peer. Invoke
            // the official local Fetch carrier, including on Desktop without HTTP.
            response = await withSignal(handler.fetch(new Request(`http://127.0.0.1/${route}${query}`, {
                method: 'POST',
                headers: { 'content-type': contentType },
                body: requestBody,
                signal,
            }), peer), signal);
        }
        else {
            const port = readPort();
            if (connection?.authenticatedUrl === undefined || typeof port !== 'number') {
                return { status: 503, json: { ok: false, error: { code: 'gateway/unavailable', message: 'The local plugin route carrier is unavailable.' } } };
            }
            const origin = `http://127.0.0.1:${port}`;
            if (cookie === undefined) {
                const launch = await fetch(connection.authenticatedUrl(`${origin}/`), { redirect: 'manual', signal });
                const setCookie = typeof launch.headers.getSetCookie === 'function' ? launch.headers.getSetCookie() : [];
                cookie = setCookie.map(item => item.split(';', 1)[0]).join('; ') || undefined;
            }
            response = await fetch(`${origin}/${route}${query}`, {
                method: 'POST',
                headers: { 'content-type': contentType, ...(cookie === undefined ? {} : { cookie }) },
                body: requestBody,
                signal,
            });
            if (response.status === 401)
                cookie = undefined;
        }
        const text = await response.text();
        let json = null;
        if (text !== '') {
            try {
                json = JSON.parse(text);
            }
            catch {
                json = text;
            }
        }
        return { status: response.status, json };
    };
}
function withSignal(pending, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted)
            onAbort();
        void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}
//# sourceMappingURL=plugin-route-dispatcher.js.map