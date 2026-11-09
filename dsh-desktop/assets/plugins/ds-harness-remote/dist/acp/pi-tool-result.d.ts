/** Browser-safe decoding of published pi-acp tool result notifications. */
export declare function piToolResult(update: Record<string, any>): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError: boolean;
};
//# sourceMappingURL=pi-tool-result.d.ts.map