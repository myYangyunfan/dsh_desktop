import type { LocalTypertGateway, RemoteTypertGatewayTarget, TypertGatewayLike, TypertGatewayRequest } from './typert-gateway-contract.js';
type RemoteInvoke = (request: TypertGatewayRequest) => Promise<unknown>;
export interface RemoteCommandSupport {
    execute: boolean;
    list: boolean;
}
/** Keeps the official Gateway object stable while its selected Host changes. */
export declare class TypertGatewaySwitch {
    private readonly runtime;
    private readonly originalInvoke;
    private readonly localInvoke;
    private readonly originalStream?;
    private readonly localStream?;
    private readonly originalDispatch?;
    private readonly localDispatch?;
    private readonly originalOpen?;
    private readonly localOpen?;
    private remoteInvoke?;
    private remoteTarget?;
    private remoteSupport;
    private target?;
    private installed;
    /** Lazily-created owner Peer supplied when a local open carries none. */
    private readonly fallbackPeer?;
    /**
     * @param gateway - official Typert Gateway service.
     * @param fallbackPeer - owner Peer factory for local opens whose caller has no
     *   per-connection Peer. Harness 0.2.2 rejects a forwarded-event open without a
     *   live Peer (`peer.signal`), so a peerless local carrier must still carry one.
     */
    constructor(gateway: TypertGatewayLike, fallbackPeer?: () => unknown);
    /** Original local dispatcher, used by the Host bridge without switch recursion. */
    local(callingPeer?: unknown): LocalTypertGateway;
    supportsCarrier(): boolean;
    status(): {
        mode: 'local' | 'remote';
        target?: {
            deviceId: string;
            name: string;
        };
    };
    install(): void;
    selectRemote(remote: RemoteInvoke | RemoteTypertGatewayTarget, support?: RemoteCommandSupport, target?: {
        deviceId: string;
        name: string;
    }): void;
    selectLocal(): void;
    /** Keep the selected authority after transport loss; only explicit exit returns local. */
    disconnectRemote(): void;
    restore(): void;
    private openRemote;
    private selectInvoke;
    private failure;
}
export {};
//# sourceMappingURL=typert-gateway-switch.d.ts.map