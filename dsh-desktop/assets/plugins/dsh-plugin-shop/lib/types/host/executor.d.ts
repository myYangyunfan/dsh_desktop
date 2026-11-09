/** Plugin-command executor: spawn the dsh CLI, stream its output, serialize
 * per profile. One implementation drives both `dsh plugin add` (install) and
 * `dsh plugin remove` (uninstall); the only differences are the verb and the
 * post-exit manifest confirmation. */
import type { HotRestartReason } from './hot.ts';
import type { Activation } from './activation.ts';
import type { Prefetcher, PrefetchRequest } from './prefetch.ts';
import { type InstallState } from '../shared/install-state.ts';
export type { InstallState } from '../shared/install-state.ts';
export interface InstallStatus {
    state: InstallState;
    log: string[];
    /** What the reader must do for this change to be visible (design
     * 2026-09-11-activation-model). Present only on "done". Absent means the
     * install is still running or failed, never "nothing to do". */
    activation?: Activation;
    restartReason?: HotRestartReason;
    detail?: string;
    /** The command that retries this record by hand, in the form a reader can
     * paste into a terminal (design 2026-11-02-market-borrowings §5): the line
     * it ran on the CLI path, and on the plugin-manager path the CLI line for
     * the same spec (2026-11-06 amendment). Present on a failure only: a
     * success needs no repair. The operand is quoted because a `github:` spec
     * carries `&` and `#`, which a shell would otherwise read as its own
     * syntax. */
    command?: string;
}
/** Bound one dsh command so a stalled install cannot hold the profile queue
 * forever. Tests can pass a shorter value; production stays generous. */
export declare const INSTALL_TIMEOUT_MS: number;
export interface RunningInstall {
    installId: string;
    status: () => InstallStatus;
    finished: Promise<InstallStatus>;
}
/** Run `task` in `profile`'s queue, after every command already in it: the
 * queue `spawnPluginCli` uses, shared with the plugin manager's runner so the
 * two paths are never concurrent in one profile. `ahead` is how many commands
 * were queued or running when the slot was taken. */
export declare function inProfileQueue<T>(profile: string, task: () => Promise<T>): {
    ahead: number;
    finished: Promise<T>;
};
/** An install record's log: the newest lines within MAX_LOG_LINES and
 * MAX_LOG_BYTES, never dropping the newest one. */
export declare function createBoundedLog(): {
    push(line: string): void;
    lines(): string[];
};
/**
 * Why a zero-exit install left `dsh.profile.bundles` without the entry.
 *
 * This reports EVIDENCE, never a cause. "the catalog may be stale; refresh
 * it" used to be the whole message on every branch, and on the failure that
 * prompted the rewrite it was flatly wrong — the catalog had been fetched
 * minutes earlier and was correct. The first attempt at a replacement
 * inferred the opposite cause instead, reading "the entry has a `subdir` and
 * its name is absent" as "the spec's `&path:` was eaten". That predicate does
 * not entail that cause: `install()` builds three spec forms and only one
 * carries `&path:` at all, so a tarball-rescued or npm entry could be told
 * its path had been eaten from a spec that never had one. A guess in the
 * confident direction is still a guess.
 *
 * So: the profile manifest is read before and after, and only the difference
 * is reported.
 *   - the name IS an own dependency, but not a bundle — a fact, stated
 *     without a claim about why dsh did not list it;
 *   - the name is absent and something else was added — name what was added.
 *     That is the culprit, and naming it is what lets a user clean up; the
 *     package that lands here is by construction NOT a catalog entry, so the
 *     shop's own uninstall cannot reach it and a CLI line is the only usable
 *     instruction;
 *   - the name is absent and nothing was added — nothing installed under
 *     this name, and a catalog behind the registry IS a real candidate here.
 *
 * `before` is `null` when the manifest existed but could not be read, and
 * the diff branches are then withheld. Collapsing that into an empty map is
 * not a smaller lie than the inferred cause it replaced: every pre-existing
 * dependency reads as newly added, so the second branch names an innocent
 * package and puts it in a `dsh plugin remove` line. An ABSENT manifest is
 * still `{}` — nothing WAS installed, which is the truth for a first install
 * into a fresh profile, and the branch that names what landed has to keep
 * working there. Same rule the harvest applies to `no-manifest` versus
 * `fetch-failed`: "could not read it" is never "it was not there".
 *
 * `Object.hasOwn` throughout, never an index read: these records are parsed
 * from the profile manifest and carry Object.prototype, so `deps.constructor`
 * answers with a function for a package that is not installed — and
 * `constructor` is a legal npm name (`[a-z0-9][a-z0-9._-]*`).
 *
 * Pure: every input is a value, so each branch is driven by a fixture.
 */
export declare function activationFailureDetail(args: {
    expectedName: string;
    profile: string;
    before: Readonly<Record<string, string>> | null;
    after: Readonly<Record<string, string>>;
}): string;
/** The line dsh 0.1.7 opens a refused install with (dsh-plugin-manager's
 * `rejected`), and the exemption command its CLI prints after it, one per
 * refused package (`runPlugin`). The opener is exported for the plugin
 * manager's answer, whose output carries the same block. */
export declare const REFUSAL_OPENER = "dsh: installation rejected: ";
/**
 * The one log line worth putting in front of the user, plus the recovery hint.
 *
 * The last line is the wrong choice, which is what this replaces. Measured on
 * two real failures against the live catalog (dsh 0.1.1-rc.2, 2026-09-02),
 * the last line was `dsh: pnpm failed in profile directory <a path the user
 * did not choose>` and `Node.js v26.6.0` — while the line that explained the
 * failure sat a few lines above, in the log the client already receives. A
 * user seeing either of those cannot tell a blocked build script from a
 * crash, which is exactly the report this fixes.
 *
 * Scanning from the end: a pnpm error code first, then any thrown error, then
 * the last line that is not noise.
 */
export declare function installFailureDetail(profile: string, log: readonly string[], hint?: string): string;
/**
 * Why a spawn of the dsh CLI never started.
 *
 * On Windows a bare name and a shim path fail differently and neither means
 * what the POSIX advice says. npm installs the CLI as `dsh`, `dsh.cmd` and
 * `dsh.ps1` with no `.exe`; libuv resolves a bare name against `.com` and
 * `.exe` only (ENOENT), and node has refused to spawn a `.cmd` without a
 * shell since the 2024 batfile argument-injection fix (EINVAL). `dsh-cli.ts`
 * gets past that by running the CLI's own JS entry through node, so reaching
 * here on Windows means that entry could not be located — telling the user to
 * install a dsh they already have would still be wrong. Reported from Windows
 * 2026-09-02 as "Update failed / dsh not found on PATH" on a working install.
 */
export declare function spawnFailureDetail(code: string | undefined, message: string, dshBin: string, platform: NodeJS.Platform): string;
/** The failure detail for a command stopped by the shop's deadline. */
export declare function installTimeoutDetail(profile: string, timeoutMs: number): string;
/** Kill primitives injected by tests so both platform branches are testable. */
export interface KillFns {
    killGroup: (pid: number) => void;
    killPid: (pid: number) => void;
    taskkill: (pid: number) => void;
}
/** The real kill. Exported for the tests that inject a RECORDING `KillFns`:
 * a recorder that only records asserts that a kill was requested and leaves
 * the child running, which for a `detached` fixture is an immortal node
 * process per run — see `prefetch.test.ts`'s delegating recorder. */
export declare const nodeKills: KillFns;
/** Kill a child and its descendants (process group on POSIX, taskkill tree on Windows). */
export declare function killTree(pid: number | undefined, platform: NodeJS.Platform, kills?: KillFns): void;
/** One stream's line assembler, retaining partial UTF-8 and text lines. */
export interface LineSink {
    write: (chunk: Buffer) => void;
    flush: () => void;
}
export declare function lineSink(emit: (line: string) => void): LineSink;
/**
 * The operand gate, one function for every caller: it refuses, by throwing,
 * an operand the dsh CLI would parse as a flag, and one carrying the shell
 * punctuation `UNSAFE_TARGET` names. A legitimate operand (a catalog name for
 * a removal; a `name@version`, `github:` or tarball spec for an install)
 * never begins with `-`, so the first refusal cannot reject a real install or
 * uninstall, and failing loudly beats letting the CLI reinterpret an operand
 * as an option. `spawnPluginCli` runs it before it spawns anything or takes a
 * queue slot; the gateway's plugin manager path runs it before a spec reaches
 * `installBundle` or the download phase, whose pump relies on it (see
 * `requestDownloadPhase`). Returns the operand, known to be present.
 */
export declare function gateOperand(target: string | undefined): string;
/**
 * The operand as the downstream dsh must receive it for pnpm to see it whole.
 *
 * dsh spawns pnpm with `shell: process.platform === 'win32'`
 * (`apps/cli/src/plugin.ts:137` at tag `dsh-v0.1.3-alpha.1`), and Node does
 * not escape under `shell: true` — it concatenates argv into one string for
 * cmd.exe. `&` is a cmd command separator, so a subpackage spec
 * `github:owner/repo#<sha>&path:<subdir>` is cut in half before pnpm sees it:
 * pnpm installs the repository ROOT and the tail runs as its own command. It
 * is silent because `path` happens to be a cmd builtin that succeeds and
 * prints nothing, so the chain still exits 0 and the install reports success
 * over a foreign package.
 *
 * Measured 2026-09-06, Windows 11, dsh 0.1.2-rc.1, pnpm 11.25.0, against
 * `nexu-io/open-design#c5ae629&path:packages/dsh-runtime`:
 *
 *   bare    -> `+ open-design github:nexu-io/open-design#c5ae629` (the ROOT), exit 0
 *   `^&`    -> the ROOT again; cmd consumes the caret before it re-parses
 *   `"..."` -> `+ @open-design/dsh-runtime ...&path:packages/dsh-runtime`, exit 0,
 *              and the name lands in dsh.profile.bundles
 *
 * So the quotes go on. Two constraints on doing it here:
 *
 *  - AFTER the `UNSAFE_TARGET` gate, never before. That gate refuses `"` in
 *    the operand, so every quote in the spawned command line is provably ours
 *    and catalog data cannot close one and append a command of its own.
 *  - Windows only, and only when the spec actually contains `&`. Off Windows
 *    dsh spawns pnpm with no shell, where a quote would be a literal character
 *    in the spec and would break an install that works today. Scoping to `&`
 *    holds the blast radius to exactly the specs that are broken now — and if
 *    dsh stops shelling its argv, those specs fail loudly at pnpm rather than
 *    silently installing a repository root. Reported upstream as
 *    deepseek-ai/deepseek-harness discussion #5815.
 */
export declare function shellSafeTarget(target: string, platform: NodeJS.Platform): string;
/**
 * The command that would retry this operation by hand, or undefined when no
 * shell can carry it (design 2026-11-02-market-borrowings §5).
 *
 * POSIX: single-quoted. `&` is a control operator there too, so
 * `github:owner/slug#sha&path:dir` unquoted would run `path:dir` as its own
 * command; `gateOperand` refuses `'`, so the quoting cannot be broken out of.
 *
 * Windows: offered only for an operand with no `&`. The quotes a reader types
 * are consumed by cmd and never reach dsh, which then joins argv UNQUOTED
 * into its own shell (the defect `shellSafeTarget` exists for on our own
 * spawn) — so a quoted `&path:` still splits, and the measured outcome is an
 * install of the repository ROOT that exits 0. A line that installs
 * something else is worse than no line, so that case reports none.
 *
 * The desktop profile: none on either platform. dsh's CLI refuses it in any
 * letter case (`isDesktopProfile`), so the line would fail at once, and a
 * desktop reader is never handed a `dsh plugin` command. The CLI path never
 * runs there; the plugin-manager path asks for a line on every profile
 * (2026-11-06), which is why the refusal lives in this one builder.
 */
export declare function retryCommand(platform: NodeJS.Platform, profile: string, verb: string | undefined, target: string): string | undefined;
/**
 * Ask the pump to warm `spec` while an operation waits its turn, and say in
 * that operation's log why there is no download phase when there is none.
 * Shared by the CLI executor and the plugin manager runner.
 */
export declare function requestDownloadPhase(options: {
    prefetcher: Prefetcher;
    profile: string;
    spec: string;
    env?: NodeJS.ProcessEnv;
    log: (line: string) => void;
}): PrefetchRequest | null;
/**
 * Run one `dsh plugin --profile <profile> add <spec>` and track it.
 * When `expectedName` is given, a zero exit is confirmed against the profile
 * manifest (§7.2 step 6) before the install reports `done`.
 * The confirm compares the profile's dependencies before and after the spawn,
 * so a miss can name what actually landed instead of guessing at a cause; the
 * executor takes both snapshots itself. `alsoConfirm` adds a second post-exit
 * check, run only once that one has passed.
 * When `afterDone` is given, the terminal `done` waits for it to settle
 * (§D hot mount).
 */
export declare function startInstall(options: {
    profile: string;
    spec: string;
    dshBin?: string;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    expectedName?: string;
    /** The download phase, when the caller has one — see `spawnPluginCli`.
     * An uninstall has nothing to fetch and `startUninstall` takes none. */
    prefetcher?: Prefetcher;
    /** A further post-exit check, run only once the bundle-activation confirm
     * has passed. Returning a detail fails the install with it. The package is
     * on disk by then, so this is for facts that are unreadable until it is —
     * see `collidingEntryId` — and the failure carries no retry line. */
    alsoConfirm?: (home: string | undefined) => string | null;
    afterDone?: (home: string | undefined) => Promise<{
        activation: Activation;
        restartReason?: HotRestartReason;
    } | void>;
    onStatus?: (status: InstallStatus) => void;
    timeoutMs?: number;
}): RunningInstall;
/**
 * Run one `dsh plugin --profile <profile> remove <name>` and track it.
 * When `expectedName` is given, a zero exit is confirmed against the profile
 * manifest — the bundle must actually have LEFT `dsh.profile.bundles` — before
 * the uninstall reports `done`. When `afterDone` is given, the terminal `done`
 * waits for it to settle (§D hot mount).
 */
export declare function startUninstall(options: {
    profile: string;
    name: string;
    dshBin?: string;
    env?: NodeJS.ProcessEnv;
    expectedName?: string;
    afterDone?: (home: string | undefined) => Promise<{
        activation: Activation;
        restartReason?: HotRestartReason;
    } | void>;
    onStatus?: (status: InstallStatus) => void;
    timeoutMs?: number;
}): RunningInstall;
