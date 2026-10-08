/** What the tree hands the hook. */
export interface DirectoryWatchOptions {
    /** Session whose workspace is being browsed; no socket while undefined. */
    sessionId: string | undefined;
    /** The workspace root, always watched (the tree always lists it). */
    root: string | undefined;
    /** Expanded directories below the root, in the host's absolute path form. */
    dirs: readonly string[];
    /**
     * A directory whose listing is stale.
     * @param dir - absolute directory path, exactly the form the tree keys levels by.
     */
    onStale: (dir: string) => void;
}
/**
 * Keep the file tree's expanded folders watched for the component's lifetime.
 * @param options - session, root, expanded directories, and the staleness callback.
 */
export declare function useDirectoryWatch(options: DirectoryWatchOptions): void;
