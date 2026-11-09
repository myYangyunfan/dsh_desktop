/** A read-only ustar parser: the npm transport's only way into a tarball.
 *
 * Pure — bytes in, a path-to-bytes map out. It handles exactly what `npm
 * pack` emits and refuses everything else loudly, because the alternative to
 * a small strict reader is a fourth runtime dependency (design §4). */
/**
 * Parse an uncompressed tar archive into path → bytes.
 *
 * Directory entries and the type flags that carry no file are skipped: npm
 * packs regular files under `package/`, and a catalog tarball that needs
 * anything else is not one we published. A pax (`x`) or GNU (`L`) header is not
 * a file either, but it NAMES the next one: a path too long or too wide for a
 * ustar header arrives this way, and skipping the header without reading it
 * left its file under a truncated name, reported missing from an archive that
 * ships it ({@link pathFromPax}).
 * Each path is spelled by its bytes, one character each ({@link cstring}).
 */
export declare function readTar(buffer: Buffer): Map<string, Buffer>;
