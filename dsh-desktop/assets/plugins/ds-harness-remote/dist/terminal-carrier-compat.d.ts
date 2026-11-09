import type { LocalTypertGateway, RemoteTypertGatewayTarget, TypertRpcResult } from './typert-gateway-contract.js';
/** Fixed terminal API changed in 0.2.1-alpha.3; other streams remain read-only. */
export declare function usesDuplexTerminal(version: string | undefined): boolean;
/** Existing Remote follow/write/resize calls terminate at the official attach stream. */
export declare class TerminalCarrierCompat {
    private readonly gateway;
    private readonly attachments;
    constructor(gateway: LocalTypertGateway);
    open(payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    call(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
}
/** Native RC.1 Client attach stream over the existing encrypted terminal subset. */
export declare function openRemoteTerminal(target: RemoteTypertGatewayTarget, payload: unknown, signal: AbortSignal, uplink: AsyncIterable<unknown>): Promise<AsyncIterable<unknown>>;
//# sourceMappingURL=terminal-carrier-compat.d.ts.map