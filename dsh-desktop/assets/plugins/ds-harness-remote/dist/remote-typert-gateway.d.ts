import { type RemoteClientCore } from '@dsh-remote/client-core';
import { type SessionFormatCompatibility } from './session-format-compat.js';
import type { RemoteTypertGatewayTarget, TypertGatewayRequest, TypertRpcResult } from './typert-gateway-contract.js';
/** Client-side alpha Gateway carrier over the authenticated Remote channel. */
export declare class RemoteTypertGateway implements RemoteTypertGatewayTarget {
    private readonly client;
    private readonly compatibility?;
    private readonly harnessVersion?;
    private frameTransfers?;
    constructor(client: RemoteClientCore, compatibility?: SessionFormatCompatibility | undefined, harnessVersion?: string | undefined);
    invoke(request: TypertGatewayRequest): Promise<unknown>;
    dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
    private legacyWelcomeAcknowledged;
    private settingsDescribeValue?;
    /** DSH <=0.1.6 cannot persist the 0.1.7 welcome acknowledgement remotely. */
    private normalizeLegacyWelcomeSettings;
    open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    private iterate;
    private callTransferred;
    private readTransferred;
}
//# sourceMappingURL=remote-typert-gateway.d.ts.map