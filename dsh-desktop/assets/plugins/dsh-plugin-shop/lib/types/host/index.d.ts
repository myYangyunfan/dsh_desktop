/** ShopGateway: the Host half of dsh-plugin-shop (§5.1). */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { loadCatalog, type LoadCatalogOptions } from './catalog.ts';
import type { CatalogEntry, DeniedEntry } from './types.ts';
import { type InstallArgs, type InstallRejectionCode } from './install.ts';
import { type InstallStatus } from './executor.ts';
import { hotMount, hotUnmount, type HotFs } from './hot.ts';
import { type ShopStateFs } from './state.ts';
import { type Activation } from './activation.ts';
import { type RestartOutcome } from './restart.ts';
import { type RepoPinFs } from './repo-pins.ts';
import { type InstallState } from '../shared/install-state.ts';
import { type Prefetcher } from './prefetch.ts';
import { type PeerResolver, type PeerVersionResolver } from './peers.ts';
import { type HarnessVerdict } from './compatibility.ts';
import { type RunningHarness } from './harness.ts';
export type { InstallArgs, InstallRejectionCode } from './install.ts';
export type { HotRestartReason } from './hot.ts';
export type { Activation } from './activation.ts';
export type { CatalogEntry } from './types.ts';
export type { HarnessVerdict } from './compatibility.ts';
/** One Loader inventory entry, structurally — the shop never depends on
 * cordis-plugin-loader, whose types do not reach this package's typecheck. */
export interface InventoryEntry {
    entryId: string;
    moduleName: string;
    enabled: boolean;
}
/** One boot-layer Loader entry, structurally — the surface `liveDisableIds`
 * consumes. `fiber` is the entry's live activation (present while the plugin
 * is up); `update` flips its options. */
export interface LoaderEntryLike {
    id?: string;
    options: {
        name?: string;
    };
    fiber?: unknown;
    update(options: {
        disabled: boolean | null;
    }, create?: boolean, force?: boolean): Promise<void>;
}
/** Test-only injection points; production callers pass nothing. */
export interface ShopGatewayOptions {
    catalogUrl?: string;
    cacheDir?: string;
    loadCatalog?: (options: LoadCatalogOptions) => ReturnType<typeof loadCatalog>;
    /** The profile dsh installs into; discovered from this module's own
     * location when omitted. */
    profile?: string;
    /** The profile directory the user layer lives in; discovered when omitted. */
    profileDir?: string;
    /** The Loader plugin inventory; read from `ctx` when omitted. The REAL
     * host-side service returns the bare snapshot OBJECT `{ entries: [...] }`,
     * not a bare array and not a wire envelope (hub-borrowings B assumed the
     * array and the toggle crashed on the real shape — 0.5.2 fix; the envelope
     * exists only on the remote's client side). Both shapes normalize in
     * `listInventory()`. */
    inventory?: {
        list(): Promise<{
            entries: InventoryEntry[];
        } | InventoryEntry[]>;
    };
    /** Test-only injection: the hot-mount functions; production uses the real
     * hotMount/hotUnmount. */
    hot?: {
        mount: typeof hotMount;
        unmount: typeof hotUnmount;
    };
    /** Test-only injection: the filesystem `packageHasClientHalf` reads
     * `dsh.client` through; the same seam `hot.ts` reads its patch through.
     * Production uses `nodeHotFs`. */
    hotFs?: HotFs;
    /** Test-only injection: the Loader's boot-layer entries; production reads
     * them from `ctx.loader`. */
    loaderEntries?: () => Array<LoaderEntryLike>;
    dshBin?: string;
    /** The dsh argv this process was launched with, for `shop/restart`;
     * defaults to the real `process.argv` minus node and the script path. */
    restartArgv?: string[];
    /** The JS entry `shop/restart` re-runs; defaults to `process.argv[1]`, the
     * script this dsh was started with. It is also what identifies the running
     * harness for the `dsh.compatibility` verdict: the package that owns this
     * script, through symlinks, is the dsh actually running, and its own
     * app-boot supplies the profile templates (`harness.ts`). A script owned by
     * anything else — a test runner, the desktop app's host entry — falls back
     * to the harness's `pluginPackages` service, which names the dsh this
     * process runs (2026-11-06 amendment); without that service both halves of
     * the verdict stay silent. The tests about where the running version comes
     * from pass a fixture install here, which is the production path; the rest
     * inject `readHarness`. */
    restartScript?: string;
    /** Test-only injection: how the running harness is read from
     * `restartScript`; production uses `readRunningHarness`. It exists because
     * an in-process test cannot import a module from another Windows drive
     * under vitest's module runner, and a Windows runner has the checkout on D:
     * and the temp dir, where every fixture harness lives, on C:. The read's
     * import of the fixture's app-boot fails there, and the table reads empty.
     * Production passes nothing, so the running dsh is read as before. Read
     * once and kept either way (see `harnessRead`), so like the default it
     * must never reject. */
    readHarness?: (script: string | undefined) => Promise<RunningHarness>;
    /** Test-only injection: the exit the restart calls after the response is
     * delivered. Production uses `process.exit`. */
    exit?: (code?: number) => void;
    /** The pid the restart helper waits on before exec'ing the new dsh;
     * defaults to this process. Tests point it at a dead pid so the fixture
     * runs immediately instead of waiting for the vitest worker to exit. */
    restartParentPid?: number;
    /** Test-only injection: the shop's latest-version lookup; production
     * fetches the npm packument. */
    fetchLatestVersion?: () => Promise<string | null>;
    /** Test-only injection: the version of the code this process loaded;
     * production reads it once, when own-version.ts is first evaluated. */
    runningVersion?: string;
    /** How long the gateway waits after a successful restart response before
     * exiting the old process; test-only shortening, production uses 2s. */
    restartExitDelayMs?: number;
    /** Test-only injection: the pins file's filesystem; production uses node:fs. */
    pinFs?: RepoPinFs;
    /** Test-only injection: the profile state file's filesystem (favorites and
     * rollback records, `state.ts`); production uses node:fs with a
     * write-then-rename. */
    stateFs?: ShopStateFs;
    /** Test-only injection: the explicit `allowRestart` override; production
     * reads the loader row's `config.allowRestart`. */
    allowRestart?: boolean;
    /** The environment `detectSupervisor` reads; production uses process.env. */
    env?: NodeJS.ProcessEnv;
    /** The platform the restart gate reads; production uses process.platform. */
    platform?: NodeJS.Platform;
    /** The pid `detectSupervisor` inspects; production uses process.ppid —
     * the PARENT pid (a systemd unit's main process has ppid 1). */
    ppid?: number;
    /** Test-only injection: how the release-tarball integrity check fetches
     * the release asset; production uses global fetch. */
    fetchTarball?: (url: string) => Promise<Response>;
    /** Test-only injection: answers whether a peer resolves. Production builds
     * one from the profile anchor. */
    resolvePeer?: PeerResolver;
    /** Test-only injection: answers which version a peer resolves at, for the
     * load-time self-check. Production builds one from the profile anchor. */
    resolvePeerVersion?: PeerVersionResolver;
    /** Test-only injection: the peer ranges the self-check judges against;
     * production reads them from the shipped package.json. */
    peerRanges?: Record<string, string>;
    /** Test-only injection: the download phase's pump; production builds the
     * real one. A test gateway left with the real pump spawns `pnpm store add`
     * — a live registry request — from every install that finds a command
     * already queued for its profile. */
    prefetcher?: Prefetcher;
    /** Test-only injection: the record of packages this process may already
     * have imported. Production shares one module-scope set across every
     * gateway in the process (see `importedThisProcess`), which a test file
     * building many gateways would otherwise share as well. */
    importedModules?: Set<string>;
}
/** `shop/installStart` result (§7.3): rejections are typed wire values with an
 * author-readable `detail`, not thrown RPC errors. */
export type ShopInstallResult = {
    ok: true;
    installId: string;
    state: InstallState;
} | {
    ok: false;
    code: InstallRejectionCode;
    detail: string;
};
export interface ShopInstallStatusResult extends InstallStatus {
    found: boolean;
}
/**
 * `shop/setEnabled` result (§7.3): an unknown name is a typed wire value, not
 * a thrown RPC error.
 *
 * A union rather than one flat shape with two optional fields, so that
 * "`activation` is present exactly when `ok`" is something the compiler
 * holds instead of a sentence this comment asks every reader to hold. Every
 * `ok` answer says what the reader must do for the toggle to be visible — a
 * toggled package with a browser half needs a reload, which this result used
 * to be unable to say (design 2026-09-11-activation-model §6) — and every
 * refusal carries the detail that names why.
 *
 * The client still defaults an absent `activation` conservatively. This type
 * binds the process it is compiled into; the WIRE outlives it, because a tab
 * can reach an older in-process host for as long as one reload after a shop
 * self-update lands on disk.
 */
export type ShopSetEnabledResult = {
    ok: true;
    activation: Activation;
} | {
    ok: false;
    detail: string;
};
/** `shop/uninstallStart` result (§7.3): a name outside the catalog or not
 * installed is a typed wire value with an author-readable `detail`, not a
 * thrown RPC error. */
export type ShopUninstallResult = {
    ok: true;
    installId: string;
} | {
    ok: false;
    detail: string;
};
/** `shop/restart` result (§7.3): the restarted server's URL, or a typed
 * failure — on failure the old process is still serving. */
export type ShopRestartResult = RestartOutcome;
/** Why `shop/restart` would refuse, for a reason fixed for the life of this
 * process: the platform, the supervisor (env and ppid are read once at
 * construction), and the launch argv. Every one of them is decided before the
 * first request arrives, which is what lets `version()` advertise it and the
 * client name it without asking again.
 *
 * `restart()` carries one further refusal this deliberately omits — a running
 * install — because that one is transient: a mount-time answer about it would
 * be stale the moment the install finished, and a card would go on saying a
 * restart was impossible after it had become possible. Static here, dynamic
 * there; the split is the whole reason this is a separate predicate rather
 * than a cache of `restart()`'s answer. */
export type RestartBlockedReason = 'desktop' | 'from-default-profile' | 'windows' | 'systemd' | 'port-zero';
/** `shop/version` result (§7.3): the RUNNING shop version (from the shipped
 * package.json, not the manifest's range), the npm latest when the check
 * could answer (`null` = no answer — advisory, never an error), and the
 * comparison verdict. */
export interface ShopVersionResult {
    /** The version of the code this process is running, read when it loaded.
     * Not the file on disk now: a self-update rewrites that in place. */
    installed: string;
    latest: string | null;
    outdated: boolean;
    /** Why `shop/restart` would refuse, or null when nothing static stands in
     * its way. The client drops the restart offer on a reason and renders that
     * reason's own copy, keeping the pending-change notice either way. */
    restartBlocked: RestartBlockedReason | null;
    /**
     * The version the profile has installed when it is not the one running —
     * an update that landed and waits for a restart — or null when the running
     * code is what is installed, or the installed copy could not be read.
     *
     * This host always sends it. Absent, it comes from a host older than the
     * field, and the client reads that as a restart still pending: a client
     * newer than its host exists only because the disk holds a newer shop than
     * the process running (design §7.3, 2026-09-27 amendment).
     */
    pendingVersion?: string | null;
    /**
     * Which process answered (own-version.ts `bootId`): fixed for its life and
     * different in the next. The client compares it across a reconnect — a new
     * one is dsh restarted under the page — and across a restart's reload —
     * the same one is a restart that never happened (design §8, 2026-10-06
     * amendment).
     *
     * This host always sends it. Absent, it comes from a host older than the
     * field, and the client judges nothing by it.
     */
    bootId?: string;
    /**
     * Where this profile's self-update can run, when it cannot run here:
     * `'dsh-page'` on the desktop profile, whose app updates the shop by
     * removing and reinstalling it (dsh's `updateBundle`, the operation this
     * shop cannot call on itself while it runs). Null on every profile the
     * shop's own update button serves, and absent from a host older than the
     * field — the client reads both as "update here".
     */
    selfUpdate?: 'dsh-page' | null;
}
/** `shop/updateStart` result (§7.3): the self-update spawn, or a typed
 * refusal (a version that is not plain semver, or the desktop profile, whose
 * update belongs to dsh's own Plugins page). */
export type ShopUpdateResult = {
    ok: true;
    installId: string;
    state: InstallState;
} | {
    ok: false;
    code?: 'desktop-manual';
    detail: string;
};
/** `shop/installed` entry (§7.3): one installed catalog plugin. The identity
 * fields distinguish same-named npm and GitHub rows; `installed` remains the
 * manifest spec or the recorded GitHub pin, and the client never does version
 * math.
 *
 * `shadowed` marks a row synthesized from the profile manifest for an
 * installed GitHub dependency whose name an npm catalog entry now holds: the
 * catalog row itself is refused `shadowed-by-npm`, so this row is the only
 * one the user can act on. It carries no catalog `latest` (hence the union)
 * and no `outdated` verdict, because there is no catalog truth to compare
 * against. */
export interface ShopInstalledEntry {
    name: string;
    source: 'npm' | 'github';
    repo?: string;
    subdir?: string;
    installed: string;
    latest: string | null;
    outdated: boolean;
    enabled: boolean;
    shadowed?: true;
}
/** What `shop/state` answers (design 2026-11-02-market-borrowings §6–§7):
 * starred install identities, and per identity the version an update
 * replaced — the version a rollback would restore. */
export interface ShopStateResult {
    favorites: string[];
    rollback: Record<string, string>;
}
/** How many bytes a release tarball may be at the integrity check. The
 * registry already refuses to publish a tarball over 32 MiB, so 64 MiB is
 * headroom, not a gate of its own. */
export declare const MAX_TARBALL_BYTES: number;
/**
 * Fetch a release tarball and verify its sha256 against the catalog record
 * (market borrowings §3.1). Returns a rejection detail, or null when the
 * bytes match. The read streams through the byte cap, so an oversized or
 * hostile body is refused without ever being buffered. Every failure — fetch
 * throw, non-2xx, unreadable body, over-cap, hash mismatch — carries the same
 * `tarball-integrity` code with a detail naming what happened, so the plugin
 * author can read the cause.
 */
export declare function verifyTarballSha256(fetchTarball: (url: string) => Promise<Response>, url: string, recordedSha256: string, maxBytes?: number): Promise<string | null>;
/** `shop/catalog` result (§7.3), plus the denied list for the install gate's UI. */
export interface ShopCatalogResult {
    schemaVersion: number;
    builtAt: string;
    stale: boolean;
    plugins: CatalogEntry[];
    denied: DeniedEntry[];
    /** Names whose shop-like NAME must not hide them from the shelf
     * (registry/not-a-shop.yml). Absent for a catalog built before the key. */
    notAShop?: string[];
    /** GitHub star counts by package name; {} when the pointer names no sidecar
     * or the sidecar could not be fetched/verified (§5). */
    stars: Record<string, number>;
    /** sha256 → data URL for the catalogue's icons; {} when the pointer names
     * none or it could not be read (design 2026-10-23-shop-plugin-icons §7). */
    icons: Record<string, string>;
    /** Install identity (`npm:<name>` / `github:<repo>#<subdir>`) → the declared
     * peers node resolution cannot find from the profile. This is the HOST half
     * of the verdict only: a module the browser's module table serves — a
     * platform seed word such as `react` — has no package on disk and is still
     * listed here, so the client removes every name its live module table
     * provides before anything renders (`client/module-table.ts`), and renders
     * no peer verdict at all on a page that offers no usable table. A key is
     * absent when the plugin runs here or when no verdict could be formed;
     * same-named entries stay independent. */
    incompatible: Record<string, string[]>;
    /** Install identity → what the entry's author declared in
     * `dsh.compatibility` that this installation does not meet (design
     * 2026-09-01-harness-compatibility §8.2), and what the running dsh itself
     * will refuse the install on (`peers`, from dsh 0.1.7; design
     * 2026-09-26-dsh-017-readiness, B1). A key is absent when nothing was
     * declared or every declared half is met, and dsh refuses nothing. A half that cannot be judged —
     * the running version unreadable, a range semver cannot parse — is left out
     * while the other is still judged, so an unknown never reads as an
     * accusation; same-named entries stay independent. A process not started
     * by dsh's CLI judges neither half: nothing then says which harness runs
     * (`harness.ts`). */
    incompatibleHarness: Record<string, HarnessVerdict>;
}
/** Remote-only service exposing the shop Remote methods of §7.3.
 *
 * @typert service shop */
export declare class ShopGateway extends TypertRemoteService {
    private readonly options;
    /** The context this gateway was built with: the shop's own fiber. Inside an
     * RPC method `this.ctx` is NOT that — cordis hands a service out with `ctx`
     * rebound to the context that looked it up, so a call arriving over the
     * wire sees the caller's, the typert gateway's (measured on 0.1.5-rc.3 and
     * 0.1.7-rc.2). Anything whose PARENT matters is registered from here. The
     * hot tree above all: registered from the gateway's context it was owned by
     * the gateway's fiber rather than the shop's, was listed under the gateway's
     * loader entry, and — the part a reader saw — sat where dsh's client
     * registry never composed it, so a hot-installed browser half needed a
     * restart that a reload now does (design 2026-09-26-dsh-017-readiness). */
    private readonly home;
    /** The profile dsh installs into; discovered from this module's own
     * location when the caller does not supply one. */
    private readonly profile;
    private readonly profileDir?;
    private readonly inventory?;
    private readonly hot?;
    private readonly hotFs?;
    private readonly loaderEntriesInjected?;
    private readonly dshBin;
    /** The argv `shop/restart` re-spawns: the real process argv minus node and
     * the CLI script path, or a test-provided substitute. */
    private readonly restartArgv;
    /** The script the restart re-runs — this process's own entry. */
    private readonly restartScript;
    /** The exit the restart calls once the response is out; `process.exit` in
     * production, a spy in tests. */
    private readonly exit;
    private readonly restartExitDelayMs;
    private readonly restartParentPid;
    /** The restart this process committed, once it has: every later
     * `shop/restart` answers with it. A page that lost the first answer to an
     * HMR swap asks again (client/restart-monitor.ts), and inside the exit
     * delay that ask reaches this same process. */
    private committedRestart;
    private readonly latestVersion;
    private readonly pinFs;
    /** Favorites and rollback records (`state.ts`), read and written through
     * this seam so tests never touch the real profile. */
    private readonly stateFs;
    private readonly allowRestart?;
    private readonly env;
    /** The platform the restart gate reads, and the one the plugin-manager
     * path quotes its retry line for; production defaults to process.platform.
     * The two-phase handoff is POSIX-only (restart.ts). */
    private readonly platform;
    /** The parent pid `detectSupervisor` inspects; production defaults to
     * process.ppid (a systemd unit's main process has ppid 1). */
    private readonly ppid;
    /** The release-tarball fetch for the install-time integrity check; global
     * fetch in production, a fixture response in tests. */
    private readonly fetchTarball;
    /** One pump for the whole gateway: batching is per profile and lives inside
     * it, so a second instance would race the first for the same store. */
    private readonly prefetcher;
    /** What this process may already have imported (see `importedThisProcess`). */
    private readonly imported;
    /** Routes the output dsh's `pluginManager` streams to the record whose
     * request id it carries (see the constructor). */
    private readonly managerLogs;
    /** The install gate runs against the last loaded snapshot, never a fresh
     * fetch per request (§7.2: the Host's cached snapshot is the truth). */
    /** Finished install records retained, so a poll sees the true terminal
     * state (§8: done / activation / failure detail). Oldest evicted on add. */
    private static readonly MAX_FINISHED_INSTALLS;
    /** How long the gateway waits after a successful restart response before
     * exiting the old process — the browser must receive the URL first. */
    private static readonly RESTART_EXIT_DELAY_MS;
    /** The install gate runs against the last loaded snapshot, never a fresh
     * fetch per request (§7.2: the Host's cached snapshot is the truth). */
    private lastSnapshot;
    /** A cold-cache catalog load shared by concurrent RPC calls. */
    private inFlightLoad;
    /** The origin list built for the last-seen `catalogUrl`, memoised so the
     * user's npmrc is read at most once per gateway (see `originsFor`). */
    private originCache;
    /** The user's own `registry=` from `~/.npmrc`, read at most once per
     * gateway. A wrapper distinguishes a genuine `null` from an unread value. */
    private npmRegistryCache;
    /** The harness this process runs, read at most once per gateway: which dsh
     * is running cannot change while it runs, and the read imports a module. A
     * promise, so concurrent first calls share one read; `readRunningHarness`
     * never rejects, so there is no failure to retry. */
    private harnessRead;
    /** Install records, running and finished, from the CLI and from dsh's
     * `pluginManager` alike; a poll finds one here or reports not found. */
    private readonly installs;
    /** Every install id in insertion order, oldest first; finished-record eviction walks this from the front. */
    private readonly installOrder;
    constructor(ctx: Context, options?: ShopGatewayOptions);
    /**
     * Warn once, at load, about any declared peer the harness provides outside
     * its declared range. Advisory by construction: it cannot throw, and it
     * never refuses the load — losing the whole shop is a worse outcome than
     * running against a harness that moved.
     */
    private checkPeerVersions;
    /** The pins file lives in the shop's own cache, next to the catalog cache. */
    private pinsPath;
    /** The boot's Loader root directory (the active profile's `cordis.yml`
     * directory, carried on `ctx.baseUrl`), when present. A `link:` install
     * keeps this package at its source location, so the walk-up from
     * `import.meta.url` finds the repo rather than a profile; `ctx.baseUrl`
     * is the boot-provided authoritative answer. */
    private bootBaseDir;
    /** The profile directory the user layer lives in — the discovered default
     * stays lazy so `setEnabled` works in tests via the `profileDir` option
     * without requiring a real profile above this module. */
    private profileDirResolved;
    /** Where every "what can this installation's plugins import?" question
     * resolves from: the profile's own Loader root, which is where the harness
     * resolves plugins from. One definition for the peer presence check and the
     * load-time self-check, so neither can drift onto a different notion of
     * "the installation". NOT where the running harness is read from: a copy
     * of `@deepseek-ai/dsh` a plugin's dependencies hoist into the profile is
     * importable from here and is not what runs (`harness.ts`). Throws when no
     * profile directory can be discovered and none is given. */
    private profileAnchor;
    /** dsh's `pluginPackages` service, when the running harness provides one
     * (0.1.7 and later), else null. Read on each use, like `pluginInventory`.
     * It is how such a harness serves its own packages to plugins, which no
     * walk of the profile's disk can see (design
     * 2026-09-01-harness-compatibility §11). */
    private harnessPackages;
    /** dsh's `pluginManager` service, when the running harness provides all of
     * it (0.1.7 and later), else null. Never cached across calls, like
     * `pluginPackages`, but read once per RPC, at its start, and passed down:
     * read again after an await, a service disposed in between would let a
     * desktop mutation past the desktop gate and onto the CLI path, which dsh
     * refuses for that profile. Design 2026-09-26-plugin-manager-delegation,
     * section 3.1. */
    private pluginManager;
    /** Whether the running harness's profile reconcile replaces a running
     * plugin whose files changed on disk: dsh-hmr 0.2.1's `reconcileProfile`,
     * absent on 0.1.7 and 0.2.0 (whose hmr has only
     * `reconcileProfilePatches`) and on 0.1.5 (no hmr service). Read for what
     * `managerOutcome` makes of an `applied` answer on a name this process
     * imported (design 2026-10-19-dsh-021-readiness §2). A harness that offers
     * no service, or one without the method, answers false and keeps the
     * restart. */
    private reconcilesRunningPlugins;
    /** "Does this installation provide `spec`?", asked from `anchor`: the
     * harness's own resolution in front of the walk where the harness has one,
     * the walk alone where it has not. */
    private peerResolver;
    /** `peerResolver`'s twin for the versions the load-time self-check reads. */
    private peerVersionResolver;
    /** `profileDirResolved`, or null when no profile directory can be
     * discovered — for the reads that answer "cannot tell" rather than fail. */
    private profileDirOrNone;
    /** The harness this process runs, read once (see `harnessRead`). */
    private runningHarness;
    /** Where to ask for the running dsh when the script this process started
     * with does not name it: the desktop app boots the profile through
     * `@deepseek-ai/dsh-desktop-host`, whose entry owns no dsh, so
     * `process.argv[1]` names the host rather than the harness. dsh serves its
     * own packages through `pluginPackages` (0.1.7 on), and the profile's
     * `cordis.yml` is the anchor the peer resolver already walks from, so the
     * service answers with this installation's dsh (design
     * 2026-09-01-harness-compatibility, 2026-11-06 amendment). Null when the
     * harness offers no such service (0.1.5) or no profile was found — the
     * script read alone then decides, as before. */
    private harnessLocator;
    /** The inventory, through the wire remote: an envelope `{ ok, value }` or
     * `{ ok: false, error }`. Each row is re-validated before trust (same
     * discipline as the rowConfig cast). */
    private listInventory;
    /** The Loader's boot-layer entries; a harness without the loader answers
     * with an empty list (there is then nothing to live-disable). */
    private loaderEntries;
    /** Live-disable one boot-layer entry, retrying until its fiber is actually
     * down. A disable can land while the entry's init is still in flight: the
     * options flip but the finishing init brings the fiber up anyway, and a
     * plain re-update no-ops on the empty diff (dsh-market themes.ts:74-93).
     * The uninstall path is the one caller: an update used to swap its running
     * instance for a hot mount through here, and no longer mounts at all
     * (design 2026-09-26-market-borrowings §1). */
    /** The package's owned entry ids, or none when its bundle patch cannot be
     * read. For the paths where a live disable is an optimization and the
     * operation must succeed regardless; `setEnabled` reports the failure
     * instead, because there the patch IS the answer being asked for. */
    /**
     * The profile manifest's dependencies, or undefined when it cannot be read.
     *
     * `readProfileManifest` throws on an unreadable file and lets `JSON.parse`
     * throw on a malformed one, and `profileDirResolved` can throw out of
     * `discoverProfile`. An escaped exception crosses the RPC as a bare
     * transport failure and the client can only render "please retry" (the same
     * hazard `setEnabled` catches), so a profile caught mid-write would turn
     * every published rejection detail on the install path — denied,
     * not-in-catalog, version-mismatch — into that one line.
     *
     * Undefined is "cannot say", which the caller must not read as "nothing is
     * installed": it means the install proceeds ungated rather than being
     * refused over a read that did not happen.
     */
    private profileDependenciesOrNone;
    /**
     * The profile manifest's spec for one name, or undefined when the manifest
     * holds no such name — or could not be read at all.
     *
     * Through `ownDependencySpec` for the reason spelled out there: a bare index
     * read answers for `Object.prototype`, and `constructor` is a legal npm
     * name. The cost on this path is behavioural twice over — the gate would
     * weigh a function as the installed spec, and a phantom `isUpdate` would
     * refuse a hot mount to a package this process never imported.
     */
    private installedSpecOf;
    /** Add every dependency the profile manifest holds to the `imported`
     * record (see `importedThisProcess`): each is a package dsh's loader may
     * have loaded in this process, at boot or by an install since. An
     * unreadable manifest adds nothing. */
    private recordDependenciesImported;
    private ownedEntryIdsOrNone;
    /** Whether an installed package declares `dsh.client`. Reads through the
     * `hotFs` option — `HotFs` is `hot.ts`'s type, but this gateway forwards
     * the option only HERE, never into `hotMount`, which takes its own `fs`
     * from `HotDeps`. A fixture therefore drives this read alone, which is the
     * point: it is the only way to state what a package declared BEFORE an
     * update overwrote its manifest. */
    private packageHasClientHalf;
    /**
     * Bring every live entry the package owns down, best effort, and report
     * whether its host half is DOWN when this returns.
     *
     * "Nothing matched" is down: a package with no live entry is not running,
     * which is the ordinary case for removing a plugin that never loaded this
     * session. Only a matched entry whose fiber outlives the retries — or
     * whose `update` throws — leaves the plugin UP, and that is the one case
     * an uninstall must not describe as stopped.
     *
     * The old spelling answered "did any update succeed", which is a different
     * question: `update` resolving says the row was accepted, not that the
     * instance went away. The retry loop below exists precisely because those
     * two come apart, so reading the first as the second threw away the answer
     * the loop was computing.
     */
    private liveEntriesDown;
    /** Enable or disable one installed plugin, hot (§8): the write sets the
     * `disabled` key of each owned entry's row in the user layer and changes
     * nothing else there (design 2026-09-26-market-borrowings §2) — the CLI's
     * watchUserPatches applies it through HMR. The shop's own row and the
     * framework's bundles are never toggleable: disabling the host chain would
     * break HMR itself. */
    setEnabled(args: {
        name: string;
        enabled: boolean;
    }): Promise<ShopSetEnabledResult>;
    /**
     * `setEnabled` for an installed package whose bundle the profile does not
     * select.
     *
     * Switching it off writes the plugin-level rows and nothing else: none of
     * it runs, and the rows keep it off if dsh selects the bundle again.
     * Switching it on selects the bundle through dsh's own `pluginManager`, the
     * writer behind the switch that deselected it, and then clears the
     * plugin-level rows as an ordinary enable does. A harness without that
     * service gets the way back in words instead. `dsh plugin add <name>` is
     * not printed: it selects the bundle again only on 0.1.5, and it lets pnpm
     * float a registry package to `latest`.
     */
    private setDeselectedEnabled;
    /**
     * dsh's answer to a switch or a bundle selection, read the one way both
     * callers need it (R32): the change, scrubbed for a desktop reader, and the
     * detail that fails the request, or null when dsh applied it. `act` is what
     * was asked, as "switch <name>", `request` names the request itself, as
     * "the switch for <name>", and `stays` is the state the plugin keeps when
     * the request does not take effect. An application this shop does not know
     * fails rather than reading as applied: a later harness may answer
     * something new.
     *
     * `overridden` fails too (R39). dsh answers it when, after it wrote the row
     * and reloaded, the live entry still differs from the request
     * (dsh-plugin-manager 0.1.7-rc.2, setPluginEnabled), and its README names
     * what outranks the profile's own patch: home and invocation patches keep
     * their higher priority. The change is saved and the plugin runs as it
     * did, so a success would flip the client's switch over a plugin that did
     * not change, and that switch never re-reads the live state.
     * setBundleEnabled never answers it; a selection reads it the same way.
     */
    private readManagerAnswer;
    private rowConfig;
    /** The user's own registry, read once. The self-update check and catalog
     * race share this preference so neither path repeatedly touches ~/.npmrc. */
    private npmRegistry;
    /** The origins to race for this row's catalog. Read once per gateway: the
     * user's npmrc does not change under a running dsh, and re-reading it on
     * every catalog call would put a filesystem read on the hot path. */
    private originsFor;
    /** Join an in-flight load; refresh requests always start a new load. */
    private loadCatalogOnce;
    /** Return the current snapshot, loading it once when needed. */
    private snapshotNow;
    /** The explicit restart override. Only the row's `config:` sub-object is
     * passed to a plugin — a top-level `allowRestart:` beside `name:` would be
     * silently ignored by the loader (dsh-market README, #227). */
    /** Whether the two-phase handoff can run at all here. `restart.ts` drives
     * it through `sh`, `kill -0` and `sleep`, none of which Windows has. */
    private restartPlatformSupported;
    /** Why a restart would be refused for this process, or null when nothing
     * static does. One ordered list, read by `restart()` before it commits and
     * by `version()` so the client can say the same thing up front.
     *
     * The order is load-bearing for the copy a reader sees. The desktop
     * profile first: dsh itself refuses to launch it, so no platform,
     * supervisor or port could make a restart possible there, and the remedy
     * is the app. Then `from-default-profile` and Windows, both ahead of
     * systemd, because neither has an override and reporting the systemd one
     * there sends the reader to set `allowRestart: true`, which this gate would
     * still refuse. And `from-default-profile` ahead of Windows, because every
     * remedy after `desktop` is "restart dsh manually", which a reader launched
     * with the flag would do with the flag, and on 0.2.1 that recreates the
     * profile: its copy is the one that says "without that flag", and a
     * Windows, systemd or `--port 0` reader needs it as much as any other.
     *
     * - `desktop`: dsh's CLI refuses `--profile desktop` ("managed exclusively
     *   by the Electron application"), so the relaunch would exit at once and
     *   leave nothing on the port; the app restarts it.
     * - `from-default-profile`: from dsh 0.2.1, `--from-default-profile <name>`
     *   replaces an existing custom profile with a fresh copy of the shipped
     *   template on every launch, and the relaunch re-runs this argv verbatim,
     *   so it would delete every plugin in the profile, this shop included.
     *   Measured 2026-10-19 in throwaway homes: 0.2.1-rc.2 booted a relaunched
     *   profile that had held the shop with no dependencies, while 0.2.0-rc.2
     *   refused to boot an existing profile at all, so there the restarted dsh
     *   failed to come back. Both spellings are the flag:
     *   `--from-default-profile <name>` and `--from-default-profile=<name>`. It
     *   is left in the argv rather than stripped: the restarted process would no
     *   longer run the command the reader chose, and their next launch with the
     *   flag recreates the profile anyway. No override (design
     *   2026-10-19-dsh-021-readiness §3).
     * - `windows`: the handoff helper is a POSIX shell one-liner (restart.ts)
     *   and there is no `sh` on Windows. That spawn fails ASYNCHRONOUSLY, so
     *   committing would answer `ok: true`, exit this process, and leave nothing
     *   to take the port — dsh would simply be gone.
     * - `systemd`: under a unit the two-phase handoff kills itself, because the
     *   main process exiting also kills the unit's cgroup and takes the detached
     *   helper with it; the service never comes back. Overridable, and the only
     *   one that is.
     * - `port-zero`: the OS hands the NEW process a fresh port the browser
     *   cannot know, so a restart would strand the client on a dead origin. */
    private staticRestartBlock;
    private allowRestartConfigured;
    /** Browse the catalog (§7.3): cached snapshot, refreshed on demand. */
    catalog(args?: {
        refresh?: boolean;
    }): Promise<ShopCatalogResult>;
    /**
     * The installs the running dsh will refuse on their harness peers
     * (`peerVerdictsOf`), judged against the exemptions this profile holds —
     * read on every call like the other verdicts, because recording one is
     * exactly the event that must clear a card: the reader runs the command
     * the card shows, presses Refresh, and the install is allowed. Empty when
     * the running dsh has no such check (before 0.1.7) or no profile was
     * found, and when either read throws: a refusal nobody could establish is
     * never shown, least of all as a disabled button.
     */
    private refusedByHarness;
    /**
     * The bundles the profile at `profileDir` composes, or null when its
     * manifest cannot be read — which is no verdict on the profile half rather
     * than an accusation. `dsh.profile.bundles` is the same list
     * `discoverProfile` uses to recognize a profile directory, read through the
     * harness's own parser so a profile this shop was booted inside is read the
     * way dsh reads it.
     */
    private runningProfileBundles;
    /**
     * Install one cataloged version into the profile (§7.2). The rejection
     * paths run against this Host's snapshot before anything is spawned; only a
     * passing request reaches the executor.
     */
    install(args: InstallArgs): Promise<ShopInstallResult>;
    /**
     * One install of `name` through dsh's CLI, `dsh plugin --profile <p> add
     * <spec>` (§7.2): the path every install takes when dsh offers no plugin
     * manager, and the one that continues an update the manager refuses in
     * place (design 2026-10-19-dsh-021-readiness §2). `alreadyImported` is
     * whether this process may already hold the package's module, which rules
     * out a hot mount. The caller tracks the record and records any pin, once.
     */
    private startCliInstall;
    /**
     * What would stop the profile from starting now that `name`'s files are on
     * disk, or null: an entry id another installed package already declares,
     * or a bundle patch declaration this dsh cannot read. Neither is knowable
     * before the files land. The package stays on disk either way, so each
     * detail ends with `undo`, the sentence that says how to take the install
     * back on the path that made it.
     */
    private postInstallHazard;
    /** Remember a github entry's pinned commit: the manifest records only
     * `github:owner/slug`, so the pins file is how `installed()` reports
     * outdated honestly. A failed install leaves a pin behind, but the
     * manifest presence gate keeps it invisible. */
    private recordGithubPin;
    /** Forget an uninstalled package's pins: its own, and its identity pin when
     * a catalog row matched the installed spec. Both uninstall paths call this
     * once their operation has started, so a stale pin never outlives the
     * uninstall in the shop's cache either way. The plugin manager path tracks
     * its record first, so a write here that throws cannot hide an operation
     * already queued. */
    private forgetPins;
    /** What `managerOutcome` reads dsh's answer against. The gateway's own
     * facts are set here once, for every operation through the service: the
     * profile, whether it is the desktop one, and the deadline a timeout
     * detail names. */
    private outcomeContext;
    /**
     * One install-shaped operation through dsh's `pluginManager` (design
     * 2026-09-26-plugin-manager-delegation, section 6): `installBundle(spec)`
     * under the record's own id as its request id, so the output dsh streams
     * for it reaches this record, in the profile's queue with the download
     * phase the CLI path has. At the shop's deadline dsh is asked to cancel it;
     * a service that offers no `cancelInstall` gets no deadline, and its record
     * settles when dsh answers. `install` and `updateStart` differ only in the
     * mechanism line and in how they read the answer.
     */
    private startManagerInstall;
    /**
     * One update through dsh's `updateBundle` (0.2.2 on): the operation dsh's
     * own Plugins page runs, remove → install → restore. The desktop profile
     * needs it because dsh's CLI cannot manage that profile, so the CLI
     * continuation an update takes everywhere else is unavailable there; with
     * neither, every desktop update ended on dsh's `already-installed`
     * refusal (measured 2026-11-06, design 2026-11-06-desktop-updates).
     *
     * `spec` is the same `name@version` the install path builds, and only
     * warms the download phase and spells the mechanism line; the service is
     * handed the name and version `updateBundle` takes.
     */
    private startManagerUpdate;
    /**
     * What one `updateBundle` answer means to the reader: the nested change is
     * fed to `managerOutcome` exactly as an `installBundle` answer is, and
     * dsh's own restore attempt is named when the install failed after a
     * removal. Saying nothing about it would leave a reader on the failure
     * detail alone, unable to tell whether the old version is still there —
     * dsh reinstalls it, and the answer records whether that worked.
     */
    private updateOutcome;
    /** Keep a started record where `installStatus`, the restart gate and
     * eviction find it, then bound the finished ones. */
    private track;
    /** Bound retained finished records at MAX_FINISHED_INSTALLS, evicting the
     * oldest finished ones (insertion order, oldest first). Live records —
     * running AND queued — are never evicted; an id absent from the map reports
     * `found: false`. */
    private evictFinishedInstalls;
    /**
     * Write the rollback record once `running` reports done.
     *
     * The version was captured before the spawn by the caller; this only
     * decides WHEN it lands. A failed update therefore leaves the previous
     * record alone — it used to replace it with the version still installed,
     * silently losing the older rollback point (design
     * 2026-11-02-market-borrowings §6.1 says "after the flow reports success").
     *
     * Every failure here is swallowed. A rollback point is a convenience; an
     * install that would succeed must not fail because the profile directory
     * could not take a bookmark.
     */
    private rememberOnDone;
    /**
     * The version of `entry` currently on disk, or undefined when it cannot be
     * read.
     *
     * npm reads the installed package's own manifest rather than the profile's
     * dependency spec: a profile may hold a RANGE (`^1.2.3`), and recording
     * that as "the previous version" would roll a reader forward to whatever
     * the registry serves on the day they click. github reads the pin the shop
     * wrote at install time, which is the commit that actually runs.
     */
    private installedVersionOf;
    /** Whether any command this gateway started is still running — or still
     * waiting its turn. */
    private hasRunningCommand;
    /** Poll one install's progress (§7.2); unknown ids report `found: false`. */
    installStatus(args: {
        installId: string;
    }): ShopInstallStatusResult;
    /**
     * The profile manifest's dependency spec for every name it holds — exactly
     * what the install gate reads, unfiltered.
     *
     * The client cannot derive this from `installed()`. That list drops any
     * dependency no catalog entry matches, so a fork, a hand `dsh plugin add`,
     * or an entry the catalog has since dropped is invisible to it — while the
     * gate, which reads the raw manifest, still refuses over it. That gap is
     * what made the card show a plain Install button for a name the host was
     * about to refuse. Shipping the gate's own input is what makes the badge
     * and the refusal one rule rather than two implementations that agree
     * until they do not.
     *
     * `null` is "cannot say" — an unreadable manifest — and is deliberately
     * distinct from `{}`, "nothing is installed": the client must not read a
     * failed read as a clean bill of health.
     */
    installedSpecs(): Promise<Record<string, string> | null>;
    /**
     * What the shop remembers between visits: the reader's favorites and, per
     * install identity, the version an update replaced (design
     * 2026-11-02-market-borrowings §6–§7).
     *
     * `rollback` carries a VERSION rather than a spec: the client renders it as
     * the offer ("roll back to 1.2.3"), and the spec that installs it is built
     * by the host from the same record. A malformed or missing file reads as
     * empty state — losing stars must never take the page down.
     */
    shopState(): Promise<ShopStateResult>;
    /**
     * Star or unstar one install identity (§7).
     *
     * A write failure is reported rather than swallowed: the client flips its
     * star optimistically and would otherwise show a favorite that is gone on
     * the next visit. The key is stored verbatim — it is the identity the
     * catalog itself uses, and an unknown one is harmless until it matches.
     */
    setFavorite(args: {
        key: string;
        favorite: boolean;
    }): Promise<{
        ok: boolean;
        detail?: string;
    }>;
    /**
     * Re-install the version an entry was updated from (§6).
     *
     * Takes only the install identity. The spec is built by `rollbackSpec` from
     * this host's own record, so a client cannot name a version or a spec the
     * shop never wrote — the same invariant `installStart` holds by building
     * its spec from the snapshot. The install then runs through the ordinary
     * CLI path, with the same records, activation verdict and notices an
     * update gets.
     */
    rollbackStart(args: {
        key: string;
    }): Promise<ShopInstallResult>;
    /** Installed catalog plugins (§7.3): every entry of the snapshot the profile
     * manifest declares as a dependency, with the Host's `outdated` verdict
     * attached. The tab's shelf cards and its Updatable section both derive
     * from this one list. */
    installed(): Promise<ShopInstalledEntry[]>;
    /** Whether an installed dependency spec sits behind the catalog's version.
     * A spec identical to the catalog version is current by definition; a
     * pnpm-written non-semver spec like `workspace:*` is not reportable and
     * reads as current rather than killing the RPC. */
    private isBehind;
    /** Uninstall one installed catalog plugin from the profile (§7.3 follow-up
     * amendment). Removing revokes privilege rather than granting it, so there
     * is no acknowledgement gate. The name must be a catalog entry the profile
     * manifest declares as a dependency — the RPC cannot remove profile
     * dependencies the shop does not manage (the base bundle, the shop
     * itself). The same install records/polling serve the client. */
    uninstall(args: {
        name: string;
    }): Promise<ShopUninstallResult>;
    /** Restart the dsh process the shop runs in (§8 amendment, 2026-08-27):
     * commit a two-phase handoff — a detached helper waits for this pid to
     * exit, then re-runs this process's own command line — and exit once the
     * response is out. The browser monitors the origin and refreshes when the
     * new server answers. Refusals are issued before anything is torn down. */
    restart(): Promise<ShopRestartResult>;
    /** The shop's own version and whether npm has a newer one (§7.3). The
     * check is advisory: a registry that cannot answer leaves `latest` null
     * and the client shows the version alone. `installed` is the RUNNING
     * version (own-version.ts), not the manifest's range spec. */
    version(): Promise<ShopVersionResult>;
    /**
     * The version of the shop the profile has installed, when it is not the
     * one this process runs; null when they match or the copy cannot be read.
     *
     * Read from the profile's own copy — the directory `dsh plugin add` writes
     * and the next boot loads — rather than from the file beside this module.
     * For the hoisted install those are one directory, but a `link:` install
     * runs from its link target, which an update replaces in the profile and
     * never touches at the target, so reading beside the module would never see
     * the update land.
     *
     * Unreadable is null, never a throw: the version check is advisory, and a
     * missing field would tell the client this host predates it.
     */
    private pendingVersion;
    /** Update the shop itself to a published version (§7.3): the explicit pin
     * is the only install form that bypasses pnpm's release cooldown. The
     * version is re-validated as plain semver at the boundary — the spec
     * `dsh-plugin-shop@<version>` is built here, never from the wire. */
    updateStart(args: {
        version: string;
    }): Promise<ShopUpdateResult>;
    /** The shop's own update through dsh's CLI: the path when dsh offers no
     * plugin manager, and the one that continues a self-update the manager
     * refuses in place (design 2026-10-19-dsh-021-readiness §2). It passes no
     * `afterDone`, so it reports a restart: a host half cannot swap itself live
     * (§8). The caller tracks the record. */
    private startCliSelfUpdate;
}
export default ShopGateway;
