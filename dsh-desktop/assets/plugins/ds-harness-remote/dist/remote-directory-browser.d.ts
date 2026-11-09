interface DirectoryEntry {
    name: string;
    path: string;
    hidden: boolean;
}
export interface DirectoryListing {
    path: string;
    home: string;
    crumbs: DirectoryEntry[];
    entries: DirectoryEntry[];
    truncated: boolean;
}
/**
 * Native Harness `workspace/create` realpath's the folder and fails with ENOENT
 * when parent directories are missing. Create them on the Host before forwarding.
 * Only absolute, non-root paths are accepted.
 */
export declare function ensureHostWorkspaceDirectory(path: string | undefined): Promise<void>;
/** Read-only fallback used only over an authenticated Host channel when Harness has a native-only picker. */
export declare function listRemoteDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing>;
export {};
//# sourceMappingURL=remote-directory-browser.d.ts.map