/**
 * The shop's own per-profile state: the plugins a reader starred, and the
 * version each installed plugin was updated from (design
 * 2026-11-02-market-borrowings §6–§7).
 *
 * One file, `<profile>/.dsh-shop/state.json`, beside the hot-mount inputs but
 * not among them: `cleanHotDir` wipes `hot-<n>.yml` only, so this survives a
 * boot. It is deliberately NOT part of the profile manifest: favorites are a
 * reading aid, and a `dsh plugin add` that rewrote `package.json` must never
 * be able to take them down.
 *
 * Every read is forgiving and every write is atomic. Losing this file costs a
 * reader their stars and one rollback offer; taking the page down over it
 * would be the worse bug, so a malformed file reads as empty state rather
 * than throwing. The next write replaces it with a valid one.
 */
/** The filesystem this module needs, injected so tests never touch disk. The
 * production `write` is temp-then-rename: an interrupted write leaves the
 * previous state rather than half of a new one, the same pattern
 * `profile.ts` uses for the profile manifest. */
export interface ShopStateFs {
    read: (path: string) => string;
    write: (path: string, data: string) => void;
}
/** The operations the writer needs, injected so the Windows-only retry can be
 * driven on any platform: `renameSync` over a held-open target throws `EPERM`
 * there and succeeds on POSIX, and every state test injects `memHotFs`, so the
 * production path had no coverage at all. */
export interface ShopStateIo {
    read: (path: string) => string;
    mkdir: (path: string) => void;
    writeFile: (path: string, data: string) => void;
    rename: (from: string, to: string) => void;
    remove: (path: string) => void;
    wait: (ms: number) => void;
    processId: number;
}
/**
 * A writer over `io`, temp-then-rename.
 *
 * The temp name carries the process id and a per-write counter: a fixed
 * `.tmp` gave two dsh processes on one profile the same scratch file.
 *
 * `rename` is retried on `EPERM`/`EBUSY`, which is what Windows reports when
 * another handle (an antivirus scan, a backup agent, a second dsh) holds the
 * target; measured 2026-11-02, a read-only target throws it too. Any other
 * code, or the last try, removes the scratch file and rethrows.
 */
export declare function shopStateFsFor(io: ShopStateIo): ShopStateFs;
export declare const nodeShopStateFs: ShopStateFs;
/**
 * What is known about one installed plugin's previous version, enough to
 * rebuild the exact install spec the shop would have used for it.
 *
 * `source`, `repo` and `subdir` are what the catalog said when the record was
 * written — the shop's own values, not the client's. A record whose shape is
 * not one of the two below is dropped on read: a rollback the shop cannot
 * spell is not offered.
 */
export interface ShopRollbackRecord {
    source: 'npm' | 'github';
    /** The installed plugin's package name. */
    name: string;
    /** github only: `owner/slug`, exactly as the catalog wrote it. */
    repo?: string;
    /** github only: the subpackage directory, when the entry installed one. */
    subdir?: string;
    /** The version that was installed before the update: an npm version, or a
     * github commit (40 lowercase hex). */
    version: string;
}
export interface ShopState {
    /** Install identities (`identityKey`) the reader starred. */
    favorites: string[];
    /** Install identity → the version it was updated from. */
    previous: Record<string, ShopRollbackRecord>;
}
/**
 * A fresh empty state.
 *
 * A function, never a shared constant: both writers mutate what
 * `readShopState` returns, so handing every missing file the same object made
 * one profile's failed save visible to the next caller — and a test that
 * compared against the constant could not see it.
 */
export declare function emptyShopState(): ShopState;
/** Most favorites one file may hold. Far past any real shelf, and a bound
 * nonetheless: the file is the reader's, and a hand-edited one must not turn
 * every card render into a set lookup over a million rows. */
export declare const FAVORITES_MAX = 5000;
/** Most rollback records one file may hold — one per installed plugin. */
export declare const PREVIOUS_MAX = 2000;
export declare function statePath(profileDir: string): string;
/**
 * The state file's contents, or empty state when it is missing, unreadable or
 * malformed.
 *
 * Each half is validated on its own, so a corrupt `previous` map never costs
 * the reader their favorites: the parts that parse are kept, the parts that
 * do not are dropped. That is the opposite of the catalog's rule — a catalog
 * this code did not write is a five-alarm fire, while this file is a reading
 * aid whose loss is measured in stars.
 */
export declare function readShopState(fs: ShopStateFs, profileDir: string): ShopState;
/** Write one state document, bounded and normalized. Throws on a write
 * failure: the caller decides what a lost favorite costs, and swallowing here
 * would report a save that did not happen. */
export declare function writeShopState(fs: ShopStateFs, profileDir: string, state: ShopState): void;
/**
 * The spec a rollback re-installs, built from a record this host wrote.
 *
 * Never from client input: the RPC takes only the identity, and everything
 * here comes from the file above. `undefined` for a record whose version is
 * not the shape its channel can install — a hand-edited record, or one
 * written by a future rule — because a spec the shop cannot spell is not
 * offered as a button.
 */
export declare function rollbackSpec(record: ShopRollbackRecord): string | undefined;
