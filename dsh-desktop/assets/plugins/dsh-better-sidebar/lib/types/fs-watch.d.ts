/** One watched directory reporting that its contents changed. */
export interface DirectoryWatchEvent {
    /** The directory's absolute path, as it was registered. */
    dir: string;
}
/** One connection's set of directory watchers. */
export interface DirectoryWatchers {
    /**
     * Start watching one directory.
     * @param dir - absolute directory to watch; already-watched paths are a no-op.
     * @returns true when the directory is now watched (or already was).
     */
    add(dir: string): boolean;
    /**
     * Stop watching one directory; idempotent.
     * @param dir - absolute directory that was passed to {@link add}.
     */
    remove(dir: string): void;
    /** Stop watching everything. */
    close(): void;
}
/**
 * Create the watcher set of one connection.
 *
 * `fs.watch` reports a directory's own entry list changing, which is exactly
 * what re-listing that directory needs — file CONTENTS changing inside an
 * expanded folder is not observable this way and is not what the tree shows.
 * @param push - called once per debounced burst with the changed directory.
 * @param onError - called when a directory cannot be watched or its watcher
 *   fails; the directory is dropped either way, so the caller only reports it.
 * @returns the connection's watcher set.
 */
export declare function createDirectoryWatchers(push: (event: DirectoryWatchEvent) => void, onError: (dir: string, error: unknown) => void): DirectoryWatchers;
