import { type LanUploadOffer } from '@dsh-remote/protocol';
import type { HostIdentity } from './identity-store.js';
import type { WorkspaceUploadHost } from './workspace-upload.js';
export interface LanUploadOwner {
    connectionId: string;
    peerIdentityKey: string;
    identity: () => HostIdentity;
    mode: () => string | undefined;
}
/** One authenticated control connection owns every listener, ticket and upload below. */
export declare class LanUploadHost {
    private readonly upload;
    private readonly owner;
    private readonly localAddresses;
    private closed;
    private entries;
    constructor(upload: WorkspaceUploadHost, owner: LanUploadOwner, localAddresses?: () => readonly string[]);
    open(input: unknown): Promise<LanUploadOffer>;
    closeAll(): Promise<void>;
    private live;
    private attach;
    private dispose;
}
//# sourceMappingURL=lan-upload.d.ts.map