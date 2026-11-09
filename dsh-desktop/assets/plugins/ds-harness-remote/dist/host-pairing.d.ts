import { type FetchImplementation } from './server-api.js';
import type { HostIdentity } from './identity-store.js';
import { type PairingCredentials, type HostPairingView } from './pairing-contract.js';
export declare function pairingProof(privateKey: string, serverKey: string, id: string, path: string, raw: string, side?: 'host' | 'mobile'): string;
export declare const fullFingerprint: (key: string) => string;
/** Host-only local workflow. No phone code retrieval, model tools or tunnel RPC. */
export declare class HostPairing {
    private readonly identity;
    private readonly descriptor;
    private readonly adopt;
    private readonly fetcher;
    private readonly path;
    private readonly serverUrl;
    private readonly lifetime;
    private queue;
    constructor(serverUrl: string, directory: string, identity: HostIdentity, descriptor: Record<string, unknown>, adopt: (value: PairingCredentials) => Promise<void>, fetcher?: FetchImplementation);
    close(): void;
    discard(): Promise<void>;
    private serial;
    start(): Promise<HostPairingView>;
    status(): Promise<HostPairingView | undefined>;
    confirm(id: string, code?: string): Promise<HostPairingView>;
    cancel(id: string): Promise<HostPairingView>;
    private load;
    private requireSession;
    private save;
    private poll;
    private assertHost;
    private accept;
    private view;
    private send;
    private request;
    private crypt;
}
//# sourceMappingURL=host-pairing.d.ts.map