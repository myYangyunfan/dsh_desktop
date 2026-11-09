export interface HydratedSessionEvent {
    type: 'event';
    event: {
        type: string;
        seq: number;
        time: number;
        data: unknown;
        surfaceOp?: 'append';
    };
}
export declare function cleanUserPrompt(raw?: string): string;
export declare function loadTranscriptEvents(conversationId: string, sessionId: string, baseDir?: string): Promise<HydratedSessionEvent[]>;
export interface DiscoveredSession {
    conversationId: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}
export declare function discoverAntigravityWorkspaces(dbPath?: string, baseDir?: string): Promise<string[]>;
export declare function discoverAntigravitySessions(workspacePath: string, limit?: number, baseDir?: string, dbPath?: string): Promise<DiscoveredSession[]>;
//# sourceMappingURL=transcript-loader.d.ts.map