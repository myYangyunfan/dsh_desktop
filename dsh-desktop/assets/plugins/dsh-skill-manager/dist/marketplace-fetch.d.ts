export type HostMarketplaceFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface HostMarketplaceFetchOptions {
    environment?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    readWindowsProxy?: () => string | undefined;
    directFetch?: HostMarketplaceFetch;
    createProxyFetch?: (proxy: string) => HostMarketplaceFetch;
}
export declare function createHostMarketplaceFetch(options?: HostMarketplaceFetchOptions): HostMarketplaceFetch;
export declare function readEnabledWindowsProxy(): string | undefined;
export declare function normalizeWindowsProxy(value: string | undefined): string | undefined;
