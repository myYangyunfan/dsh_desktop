/** Parse the public CodeX session identity without treating it as a Harness agent id. */
export declare function parseCodexSessionId(value: unknown): {
    sessionId: string;
    threadId: string;
} | undefined;
export declare function requireCodexSessionId(value: unknown): {
    sessionId: string;
    threadId: string;
};
//# sourceMappingURL=session-id.d.ts.map