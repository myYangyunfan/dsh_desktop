import type { HeaderList, OpenMessage } from './hostc/protocol/index.js';
export interface DshWebBrowserAuth {
    authenticatedUrl(origin: string): string;
    authorizeIndex(request: {
        headers: Record<string, string>;
        url: string;
        method: string;
    }, response: {
        writeHead(status: number, headers?: Readonly<Record<string, string>>): void;
        end(): void;
    }): boolean;
    requestRejection(request: {
        headers: Record<string, string>;
    }): number | undefined;
}
export type DshWebRuntime = {
    origin: URL;
    auth: DshWebBrowserAuth;
};
export type ResolveRuntime = () => DshWebRuntime | undefined;
export declare function openDshWebUpstream(resolveRuntime: ResolveRuntime, signal: AbortSignal): Promise<{
    target: URL;
    isCurrent: () => boolean;
    authorize(request: OpenMessage, browserOrigin: URL): OpenMessage | undefined;
    stripResponseHeaders: typeof stripResponseHeaders;
}>;
export declare function authorizeUpstream(request: OpenMessage, publicUrl: URL, cookie: string): OpenMessage | undefined;
declare function stripResponseHeaders(headers: HeaderList): HeaderList;
export {};
//# sourceMappingURL=dsh-web-upstream.d.ts.map