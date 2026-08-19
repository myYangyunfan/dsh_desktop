import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
const INTERNET_SETTINGS_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const TRANSIENT_RETRY_DELAYS_MS = [150, 350];
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const TRANSIENT_ERROR_CODES = new Set([
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ECONNRESET",
    "EPIPE",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT"
]);
export function createHostMarketplaceFetch(options = {}) {
    const environment = options.environment ?? process.env;
    const explicitProxy = firstNonEmpty(environment.HTTPS_PROXY, environment.https_proxy, environment.HTTP_PROXY, environment.http_proxy, environment.ALL_PROXY, environment.all_proxy);
    const windowsProxy = explicitProxy === undefined && (options.platform ?? process.platform) === "win32"
        ? (options.readWindowsProxy ?? readEnabledWindowsProxy)()
        : undefined;
    const proxy = explicitProxy ?? windowsProxy;
    const transport = proxy === undefined
        ? options.directFetch ?? globalThis.fetch.bind(globalThis)
        : (options.createProxyFetch ?? createProxyFetch)(proxy);
    return withTransientGetRetry(transport);
}
export function readEnabledWindowsProxy() {
    try {
        const enabled = execFileSync("reg.exe", [
            "query",
            INTERNET_SETTINGS_KEY,
            "/v",
            "ProxyEnable"
        ], { encoding: "utf8", windowsHide: true });
        if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/iu.test(enabled))
            return undefined;
        const server = execFileSync("reg.exe", [
            "query",
            INTERNET_SETTINGS_KEY,
            "/v",
            "ProxyServer"
        ], { encoding: "utf8", windowsHide: true });
        const value = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/iu.exec(server)?.[1]?.trim();
        return normalizeWindowsProxy(value);
    }
    catch {
        return undefined;
    }
}
export function normalizeWindowsProxy(value) {
    if (value === undefined || value.length === 0)
        return undefined;
    const entries = value.split(";").map((entry) => entry.trim()).filter(Boolean);
    const mapped = new Map(entries.flatMap((entry) => {
        const separator = entry.indexOf("=");
        return separator < 0 ? [] : [[entry.slice(0, separator).toLowerCase(), entry.slice(separator + 1)]];
    }));
    const candidate = mapped.get("https") ?? mapped.get("http") ?? (mapped.size === 0 ? entries[0] : undefined);
    if (candidate === undefined || !/^[A-Za-z0-9.-]+:\d{1,5}$/u.test(candidate))
        return undefined;
    return `http://${candidate}`;
}
function createProxyFetch(proxy) {
    const agent = new HttpsProxyAgent(proxy, { keepAlive: true });
    return (input, init) => fetchThroughProxy(agent, input, init);
}
async function fetchThroughProxy(agent, input, init = {}) {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? input.toString());
    if (url.protocol !== "https:")
        throw new TypeError("Marketplace proxy transport accepts HTTPS URLs only.");
    const method = (init.method ?? request?.method ?? "GET").toUpperCase();
    if (method !== "GET")
        throw new TypeError("Marketplace proxy transport accepts GET requests only.");
    const headers = new Headers(request?.headers);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const signal = init.signal ?? request?.signal;
    return await new Promise((resolve, reject) => {
        const outgoing = httpsRequest(url, {
            method,
            agent,
            headers: Object.fromEntries(headers),
            ...(signal === undefined || signal === null ? {} : { signal })
        }, (incoming) => {
            const chunks = [];
            let totalBytes = 0;
            incoming.on("data", (chunk) => {
                const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
                totalBytes += bytes.byteLength;
                if (totalBytes > MAX_RESPONSE_BYTES) {
                    incoming.destroy(Object.assign(new Error("Marketplace response exceeded the transport size limit."), {
                        code: "ERR_DSM_RESPONSE_TOO_LARGE"
                    }));
                    return;
                }
                chunks.push(bytes);
            });
            incoming.on("end", () => {
                const responseHeaders = new Headers();
                for (const [name, value] of Object.entries(incoming.headers)) {
                    if (Array.isArray(value))
                        value.forEach((entry) => responseHeaders.append(name, entry));
                    else if (value !== undefined)
                        responseHeaders.set(name, String(value));
                }
                resolve(new Response(Buffer.concat(chunks), {
                    status: incoming.statusCode ?? 500,
                    statusText: incoming.statusMessage ?? "",
                    headers: responseHeaders
                }));
            });
            incoming.on("error", reject);
        });
        outgoing.on("error", reject);
        outgoing.end();
    });
}
function withTransientGetRetry(transport) {
    return async (input, init) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        for (let attempt = 0;; attempt += 1) {
            try {
                return await (init === undefined ? transport(input) : transport(input, init));
            }
            catch (error) {
                const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
                if (method !== "GET" || signal?.aborted || delay === undefined || !isTransientTransportError(error)) {
                    throw error;
                }
                await waitForRetry(delay, signal);
            }
        }
    };
}
function isTransientTransportError(error, seen = new Set()) {
    if (error === null || typeof error !== "object" || seen.has(error))
        return false;
    seen.add(error);
    const value = error;
    if (typeof value.code === "string" && TRANSIENT_ERROR_CODES.has(value.code))
        return true;
    if (isTransientTransportError(value.cause, seen))
        return true;
    return Array.isArray(value.errors) && value.errors.some((entry) => isTransientTransportError(entry, seen));
}
async function waitForRetry(delayMs, signal) {
    if (signal?.aborted)
        throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, delayMs);
        const abort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        };
        signal?.addEventListener("abort", abort, { once: true });
    });
}
function firstNonEmpty(...values) {
    for (const value of values) {
        const normalized = value?.trim();
        if (normalized)
            return normalized;
    }
    return undefined;
}
