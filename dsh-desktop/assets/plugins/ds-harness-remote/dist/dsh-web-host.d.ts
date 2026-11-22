import { type DshWebGrant } from '@dsh-remote/protocol';
import { type DshWebRequest, type HostServerApi } from './server-api.js';
import { type ResolveRuntime } from './dsh-web-upstream.js';
export { authorizeUpstream, type DshWebBrowserAuth, type DshWebRuntime } from './dsh-web-upstream.js';
type WebSessionApi = Pick<HostServerApi, 'dshWebRequest' | 'closeDshWeb'>;
type Peer = Pick<DshWebRequest, 'clientDeviceId' | 'connectionId'>;
export declare class DshWebPeer {
    private readonly api;
    private readonly peer;
    private readonly resolveRuntime;
    private active?;
    private opening?;
    private openingStop?;
    private closing?;
    private readonly lifetime;
    constructor(api: WebSessionApi, peer: Peer, resolveRuntime: ResolveRuntime);
    available(): boolean;
    open(): Promise<DshWebGrant>;
    close(): Promise<void>;
    private closeActive;
    dispose(): Promise<void>;
    private start;
    private monitor;
}
//# sourceMappingURL=dsh-web-host.d.ts.map