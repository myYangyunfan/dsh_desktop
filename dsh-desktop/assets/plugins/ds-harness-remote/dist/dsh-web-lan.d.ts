import { type SameLinkIpv6Pair } from '@dsh-remote/protocol';
import { type ResolveRuntime } from './dsh-web-upstream.js';
export declare class DshWebLanPeer {
    private readonly runtime;
    private readonly mode;
    private readonly address;
    private lease?;
    private disposed;
    constructor(runtime: ResolveRuntime, mode: () => unknown, address: (pair?: SameLinkIpv6Pair) => Promise<string | undefined>);
    available(): boolean;
    private listenAddress;
    onLan(): Promise<boolean>;
    open(params: unknown): Promise<{
        sessionId: `${string}-${string}-${string}-${string}-${string}`;
        url: string;
        browserGrant: string;
        expiresAt: number;
    }>;
    close(params: unknown): {
        closed: boolean;
    };
    dispose(): void;
}
//# sourceMappingURL=dsh-web-lan.d.ts.map