/** Catalog fetch, verification, and disk cache — the Host's only network path. */
import { type CatalogOrigin } from './origin.ts';
import type { CatalogEntry, DeniedEntry } from './types.ts';
/** Highest schemaVersion this build understands; a higher one is refused (§10).
 * 3 adds `source` and repo entries (github install channel); 4 adds `subdir`
 * for monorepo-subpackage entries (2026-08-31 hub-borrowings A); 5 adds
 * `added`, `tarball` (release rescue), the `theme` category, and
 * `denied[].replacement` (2026-08-31 market borrowings).
 *
 * 6 adds nothing. It was reserved for `peers` (2026-09-01 harness
 * compatibility), and that gate came off on 2026-09-03 without ever being
 * opened: `peers` rides 5, as every additive optional key does, because this
 * schema strips a key it does not know while a higher version NUMBER is what
 * a capped client refuses outright. Every shop built since this constant
 * became 6 accepts a 6 without knowing what one would mean, so a change those
 * shops must refuse has to be 7. */
export declare const SUPPORTED_SCHEMA_VERSION = 6;
export interface CatalogSnapshot {
    schemaVersion: number;
    builtAt: string;
    entries: CatalogEntry[];
    denied: DeniedEntry[];
    /** Names the shop-like NAME filter must not hide (registry/not-a-shop.yml).
     * Absent for a catalog built before the key existed, which is why it is
     * optional rather than defaulted here: the parse defaults it, a snapshot
     * assembled by hand need not carry it. */
    notAShop?: string[];
    /** GitHub star counts by package name; {} when the pointer names no
     * sidecar or the sidecar could not be fetched/verified (spec §5). */
    stars: Record<string, number>;
    /** sha256 → data URL for the catalogue's icons; {} when the pointer names no
     * sidecar, or it could not be fetched, verified or parsed (design
     * 2026-10-23-shop-plugin-icons §7). Optional like `notAShop`: `loadCatalog`
     * always sets it, and a snapshot assembled by hand need not carry it. */
    icons?: Record<string, string>;
}
export interface CatalogResult {
    snapshot: CatalogSnapshot;
    stale: boolean;
}
export interface CatalogFs {
    exists: (path: string) => boolean;
    read: (path: string) => string;
    write: (path: string, data: string) => void;
}
export interface LoadCatalogOptions {
    /** A single HTTP origin — the explicit-override spelling. Mutually
     * exclusive with `origins`; exactly one must be given. */
    baseUrl?: string;
    /** Origins to race (design §3). */
    origins?: CatalogOrigin[];
    cacheDir: string;
    refresh?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    fsImpl?: CatalogFs;
    sleep?: (ms: number) => Promise<void>;
}
/**
 * Load the catalog snapshot: fetch the pointer, verify the data file's sha256
 * against it, cache both on disk, and serve the cached copy with `stale: true`
 * only when the transport itself failed — the fetch threw or returned a
 * non-2xx (§10). A schemaVersion higher than this build supports, a malformed
 * pointer or data file, an absolute data URL, or a sha256 mismatch — fresh or
 * cached — throws even when a cache exists; never silently degraded. The stars
 * sidecar is the sole exception: any irregularity there, a refused url
 * included, degrades to no stars (spec §5).
 */
export declare function loadCatalog(options: LoadCatalogOptions): Promise<CatalogResult>;
/** The catalog base the shipped `cordis.patch.yml` names. A row carrying
 * exactly this value expresses no preference, so the loader races its
 * defaults; anything else is a deliberate override and is used alone. */
export declare const DEFAULT_CATALOG_URL = "https://LivXue.github.io/dsh-plugin-shop/v1/";
/** The npm package carrying the same `v1/` tree (design §2). */
export declare const CATALOG_PACKAGE = "dsh-plugin-shop-catalog";
/**
 * The origins to race for this installation (design §3).
 *
 * @param catalogUrl - the row's configured base.
 * @param npmRegistry - the user's own registry from `~/.npmrc`, or null.
 */
export declare function catalogOrigins(catalogUrl: string, fetchImpl: typeof fetch, npmRegistry: string | null): CatalogOrigin[];
