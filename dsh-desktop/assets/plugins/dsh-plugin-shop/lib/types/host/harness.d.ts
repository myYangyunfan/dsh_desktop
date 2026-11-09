/**
 * The harness this process runs: which `@deepseek-ai/dsh` it is, and that
 * dsh's own profile-template table — the running side of the
 * `dsh.compatibility` verdict (design 2026-09-01-harness-compatibility §9.9).
 *
 * Both used to be read from somewhere that is not the running harness, and
 * both were wrong there:
 *
 * - The version was the first `node_modules/@deepseek-ai/dsh` found walking up
 *   from the profile: what the profile can IMPORT, not what RUNS. A plugin
 *   that depends on the dsh package gets its copy hoisted into
 *   `<profile>/node_modules` — the listed `dsh-claude-tui@0.1.6` pulls
 *   0.1.2-rc.1 — a second install sharing DSH_HOME re-points the link farm,
 *   and under a packaged dsh the bin-only package gets no link-farm proxy at
 *   all, so the read was dead or stale. The first was reproduced with real
 *   installs on 2026-09-25 (the design's section 9.9 amendment): every
 *   verdict said "running 0.1.2-rc.1" while 0.1.5-rc.3 ran.
 * - The templates came from the shop's own `import * as appBoot`, which
 *   resolves from the SHOP's real path: under a `link:` install that is this
 *   repository's devDependency, 0.1.1-rc.2 with two templates, while
 *   0.1.5-rc.3 with five runs — and in production a copy hoisted from some
 *   plugin's dependencies can shadow it the same way.
 *
 * Both now come from the one thing that names the running harness: the script
 * this process was started with. Resolved through symlinks, the package that
 * owns it IS the dsh CLI that is running, if it is one at all; its manifest
 * says its version, and the app-boot it imports says its templates.
 */
import { type ProfileTemplates } from './compatibility.ts';
import { type HarnessPackageLookup } from './peers.ts';
/** One package's harness peers as the running dsh judges them: app-boot's
 * `evaluatePluginCompatibility` result, in the shape 0.1.7 returns, whichever
 * name the running dsh gives its list (`peerCheckOf`). */
export interface PeerIssue {
    name: string;
    version: string;
    /** The dsh version the check judged against — app-boot's own. */
    runtimeVersion: string;
    /** What the package asked of dsh and the running one does not meet, each
     * with the range the package declared. A key is a dsh peer's package name,
     * or the literal `engines.dsh`. dsh names this list `requirements` from
     * 0.2.1 and `peers` before it (design 2026-10-19-dsh-021-readiness, section
     * 4); `refusedRequirements` reads either into this field, so every consumer
     * keeps reading the one name. */
    peers: Record<string, string>;
    /** Whether the profile holds dsh's exact-version exemption for this
     * package on this dsh, in which case dsh accepts the install anyway. */
    exempted: boolean;
}
/** The running dsh's own install-time check (app-boot, from 0.1.7): the rule
 * it refuses an install by, and the exemptions a profile holds. Taken from the
 * dsh that runs rather than reimplemented, so a verdict cannot drift from the
 * refusal it predicts (design 2026-09-26-dsh-017-readiness, B1). */
export interface PeerCheck {
    /** `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` with
     * app-boot's own version as the runtime — the version dsh's installer
     * judges by, since it passes none and the default reads app-boot's
     * manifest. That version is read once, here, rather than per call: the
     * default re-reads the file on every call, which measured 75 ms against
     * 12 ms for 2,000 manifests on 0.1.7-rc.2. The incompatible harness peers
     * of one manifest, or undefined when there are none. Throws for a manifest
     * it cannot judge.
     *
     * `engines` is passed through to the rule, which reads it in place of
     * `peerDependencies` when present (design 2026-11-02-market-borrowings §1).
     * It is optional here so a caller with no catalog `engines` — every client
     * older than that field, and every entry whose author declares none —
     * behaves exactly as before. */
    evaluate(manifest: {
        name: string;
        version: string;
        peerDependencies: Record<string, string>;
        engines?: {
            dsh: string;
        };
    }, exemptions: Record<string, string[]>): PeerIssue | undefined;
    /** `readProfileVersionExemptions(profileDir)`: exact `name@version` keys
     * mapped to the dsh versions each is exempted on. */
    exemptions(profileDir: string): Record<string, string[]>;
}
/** The running side of the `dsh.compatibility` verdict. The gateway reads it
 * once and keeps it: a running process cannot change which dsh it is. */
export interface RunningHarness {
    /** The running dsh's own `version`, or null when this process was not
     * started by dsh's CLI or its manifest carries no non-empty string there.
     * Whether it is semver is `compatibilityMap`'s question. */
    dshVersion: string | null;
    /** That dsh's own `PROFILE_TEMPLATES`, normalized by `profileTemplatesOf`;
     * empty whenever the table could not be read. */
    templates: ProfileTemplates;
    /** Whether that dsh reads a LIST-valued `dsh.bundle.patch`: its app-boot
     * exports `bundlePatchFiles`, which 0.1.7 does and 0.1.5 does not. A dsh
     * without it joins the declaration onto a path, so a package declaring a
     * list stops the profile from starting (design 2026-09-26-dsh-017-readiness,
     * B4). Null whenever the app-boot could not be read — unknown, which forms
     * no verdict. */
    patchLists: boolean | null;
    /** That dsh's own install-time peer check, or null when its app-boot
     * exports none (before 0.1.7, which refuses no install on peers) or could
     * not be read — no verdict either way. */
    peerCheck: PeerCheck | null;
}
/**
 * Where to ask for the running dsh when the script this process started with
 * does not name it (design 2026-09-01-harness-compatibility §9.9, 2026-11-06
 * amendment).
 *
 * The desktop app boots the profile through `@deepseek-ai/dsh-desktop-host`,
 * so `process.argv[1]` owns no dsh and the script read found nothing — and
 * on that profile nothing could be found from it, which left the peer check
 * and the profile verdict silent while the shelf offered installs dsh was
 * going to refuse. The harness serves its own packages through
 * `pluginPackages` (`ctx.get('pluginPackages')`, 0.1.7 on), and the dsh
 * package is one of them: `parentURL` is the profile's `cordis.yml`, the
 * same anchor the peer resolver walks from, so the answer describes this
 * installation. Only the script-less case asks, deliberately: a script that
 * owns a dsh is that dsh, and a service cannot disagree with it.
 */
export interface HarnessLocator {
    packages: HarnessPackageLookup;
    parentURL: string;
}
/**
 * The list a refusal names, read off one answer of dsh's compatibility check
 * or of its plugin manager, under whichever name the dsh that gave the answer
 * uses: `requirements` from 0.2.1, `peers` from 0.1.7 to 0.2.0. app-boot's
 * `evaluatePluginCompatibility` and dsh-plugin-manager's `IncompatiblePlugin`
 * were renamed together (design 2026-10-19-dsh-021-readiness, section 4, read
 * off 0.2.1-rc.2's own types and code on 2026-10-19). A key is a dsh peer's
 * package name or the literal `engines.dsh`; a value is the range the package
 * declared.
 *
 * `requirements` is read first, and only when it holds an object: an answer
 * whose `requirements` is anything else is not in the newer shape, so its
 * `peers` is tried. Only the entries whose range is a string are kept, as
 * `incompatibleList` always kept them, so one malformed range costs its own
 * entry and not the rest of the list. An answer naming neither reads as an
 * empty list, never as a throw.
 */
export declare function refusedRequirements(answer: Readonly<Record<string, unknown>>): Record<string, string>;
/**
 * The harness this process runs, identified from `script` — the gateway's
 * `restartScript`, `process.argv[1]` in production — or, when that names no
 * dsh, from the harness's own package lookup (`locate`, see
 * `HarnessLocator`). Never a guess:
 *
 * 1. `script` is resolved through symlinks, because `argv[1]` is the path the
 *    shell ran — `<prefix>/bin/dsh`, a link — and only its target lies inside
 *    the dsh package. No script, or one that does not resolve: the next
 *    source decides.
 *    An empty path is no script either: `realpathSync('')` answers the
 *    working directory, which says where dsh was started, not what it is.
 * 2. The package that owns it (`owningPackage`) must be `@deepseek-ai/dsh`.
 *    A test runner, or another host embedding the shop, names no harness
 *    this way; the desktop app is that case, and there `locate` answers with
 *    the dsh package its own `pluginPackages` service serves. Without a
 *    locator, both halves of the verdict stay silent.
 * 3. `dshVersion` is that manifest's `version` when it is a non-empty string.
 * 4. `templates`, `patchLists` and `peerCheck` come from that dsh's own
 *    app-boot (`appBootFacts`). Any failure there costs all three and keeps
 *    the version.
 *
 * Never throws and never rejects: a harness nobody could identify forms no
 * verdict, and must never be the reason the catalog fails to load.
 */
export declare function readRunningHarness(script: string | undefined, locate?: HarnessLocator): Promise<RunningHarness>;
