import type { AcpAuthDiagnostic, AcpAuthMethod, AcpAvailableCommand } from '@dsh-remote/protocol';
export interface AcpInitializeMetadata {
    agentInfo?: {
        name?: string;
        version?: string;
    };
    agentCapabilities: {
        loadSession?: boolean;
        promptCapabilities?: {
            image?: boolean;
            audio?: boolean;
            embeddedContext?: boolean;
        };
        sessionCapabilities?: {
            list?: boolean;
            fork?: boolean;
            delete?: boolean;
            resume?: boolean;
            close?: boolean;
            additionalDirectories?: boolean;
        };
        steering?: boolean;
    };
    authMethods: AcpAuthMethod[];
}
export declare function parseInitializeMetadata(result: unknown): AcpInitializeMetadata;
export declare function detectUpstreamAuthFailure(backend: string, errorValue: unknown, authMethods?: readonly AcpAuthMethod[]): AcpAuthDiagnostic | undefined;
export declare function buildAuthDiagnosticFromMetadata(backend: string, metadata: AcpInitializeMetadata | undefined, lastDiagnostic: AcpAuthDiagnostic | undefined, ready: boolean): AcpAuthDiagnostic;
export declare function parseAvailableCommands(update: unknown): AcpAvailableCommand[];
export declare function extractSafeHttpsUrl(text: string): string | undefined;
export declare function redactPaths(text: string): string;
//# sourceMappingURL=auth-diagnostics.d.ts.map