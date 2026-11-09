import type { LocalTypertGateway } from './typert-gateway-contract.js';
/** Resolve only through backend authority; never accept a Client cwd/path. */
export declare function workspaceUploadRootResolver(gateway: LocalTypertGateway | undefined, supportsHarnessSessions: () => boolean, codex: (threadId: string) => Promise<string | undefined>, acp: (publicId: string) => string): (sessionId: string, signal: AbortSignal) => Promise<string | undefined>;
//# sourceMappingURL=workspace-upload-authority.d.ts.map