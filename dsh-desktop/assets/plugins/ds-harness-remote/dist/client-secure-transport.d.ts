import type { RemoteTransport, SecureHandshakeTransport } from '@dsh-remote/webrtc';
import type { HostIdentity, TrustedPeer } from './identity-store.js';
/** Client-side Noise IK wrapper used by the local Harness remote-mode runtime. */
export declare class ClientSecureTransport implements RemoteTransport {
    private readonly inner;
    private readonly identity;
    private readonly host;
    private noise?;
    private unsubscribeInner?;
    private readonly incoming;
    private readonly outgoing;
    private closed;
    private lifetime?;
    private readonly sends;
    private closeError?;
    constructor(inner: SecureHandshakeTransport, identity: HostIdentity, host: TrustedPeer);
    connect(): Promise<void>;
    send(data: Uint8Array): Promise<void>;
    onMessage(handler: (data: Uint8Array) => void): () => void;
    onClose(handler: (error?: Error) => void): () => void;
    close(): Promise<void>;
    getStats(): import("@dsh-remote/protocol").TransportStats;
    private requireNoise;
}
//# sourceMappingURL=client-secure-transport.d.ts.map