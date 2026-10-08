/** One archive member: a file to read, or a directory to record. */
export interface ZipEntry {
    /** Absolute filesystem path (source of the bytes). Ignored for a directory
     *  entry (`isDir: true`), which only contributes its own header row. */
    path: string;
    /** In-archive name: '/'-separated and relative. A directory name must end
     *  with '/'. */
    name: string;
    /** Write a directory entry (zero-length name + trailing '/') instead of
     *  reading the path as a file. */
    isDir?: boolean;
}
/** One progress report: entries finished, entries total, bytes read so far. */
export interface ZipProgress {
    /** Entries fully processed (payload read, compressed, hashed). */
    done: number;
    /** Entries the archive will contain (known up front: the entries array). */
    total: number;
    /** Uncompressed bytes accumulated so far. */
    bytes: number;
}
/** The archive bounds and the optional progress hook. */
export interface ZipOptions {
    /** Total uncompressed byte bound; exceeding it throws fs-error. */
    maxBytes?: number;
    /** Entry-count bound (directory entries included); exceeding it throws
     *  fs-error. */
    maxEntries?: number;
    /** Called once per finished entry, in archive order (never for a failed
     *  one). A throw from the hook aborts the build. */
    onProgress?: (progress: ZipProgress) => void;
}
/** Default total uncompressed payload bound of one archive (256 MiB). */
export declare const ZIP_MAX_BYTES: number;
/** Default entry-count bound of one archive. */
export declare const ZIP_MAX_ENTRIES = 10000;
/** CRC-32 of one buffer. */
export declare function crc32(data: Uint8Array): number;
/**
 * Build one ZIP archive from the given entries.
 * @param entries - files to read and/or directory rows to record; a directory
 *  row contributes its own header, its children are separate entries.
 * @param opts - entry-count and total-byte bounds ({@link ZipOptions}).
 * @returns the ZIP bytes.
 * @throws {SidebarError} bad-request for malformed entry names/paths,
 *  fs-error when an entry cannot be read or a bound is exceeded.
 */
export declare function buildZip(entries: readonly ZipEntry[], opts?: ZipOptions): Promise<Buffer>;
