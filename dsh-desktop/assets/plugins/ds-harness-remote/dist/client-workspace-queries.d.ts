import type { RemoteWorkspaceView } from './client-runtime-contract.js';
import { RemoteTypertGateway } from './remote-typert-gateway.js';
export declare function readRemoteWorkspaceBaseline(gateway: RemoteTypertGateway, signal?: AbortSignal): Promise<RemoteWorkspaceView[]>;
export declare function workspaceRecordId(value: unknown): string;
export declare function remoteWorkspaceTitle(path: string): string;
//# sourceMappingURL=client-workspace-queries.d.ts.map