declare global {
    interface Window {
        __ModuleLoader__: {
            load(input: {
                id: string;
                factory: (require: (id: string) => unknown) => unknown;
            }): void;
        };
        __DS_HARNESS_REMOTE_CLIENT_ACTIVE__?: boolean;
    }
}
export {};
//# sourceMappingURL=client.d.ts.map