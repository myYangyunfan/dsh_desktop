/**
 * The file tree's "open with" vocabulary: which external editors / file
 * managers the context menu can hand a row's path to, how the per-user
 * configuration (custom editors, SSH host, pinned ids) is parsed out of the
 * persisted blob, and how the external URL is built (local `file` URLs and
 * VSCode-family SSH-remote URLs).
 *
 * Pure by design (no React / no `api`), so the whole surface is unit-testable
 * without a DOM or a host route. The menu and the settings panel only consume
 * the exported types and functions.
 */
import type { CopyKey } from './locales.ts';
/** One user-configured editor (persisted in `pluginSettings['editor'].openWith`). */
export interface CustomEditor {
    id: string;
    /** Human label shown in the menu (e.g. "Windsurf"). */
    name: string;
    /** URL template with a `{path}` placeholder (e.g. `cursor://file/{path}`). */
    urlTemplate: string;
    /** Whether the editor speaks the VSCode URL dialect — the only editors
     *  with an SSH-remote form (`<scheme>://vscode-remote/ssh-remote+<host>/…`). */
    isVscodeFamily: boolean;
}
/** The per-user "open with" configuration (one key of the editor blob). */
export interface OpenWithConfig {
    /** SSH host (user@host or an ~/.ssh/config alias); '' = local workspace. */
    sshHost: string;
    /** User-defined editors, appended after the built-ins. */
    customEditors: CustomEditor[];
    /** Ids of open-with targets pinned to the menu's top level
     *  ('explorer' | 'vscode' | 'cursor' | 'zed' | 'custom:<id>'). */
    pinned: string[];
}
/** One menu-visible open target (built-in or custom, SSH-filtered). */
export interface OpenWithTarget {
    /** Stable id (`explorer` / `vscode` / `cursor` / `zed` / `custom:<id>`). */
    id: string;
    /** Locale key of a built-in label (custom editors carry `name` instead). */
    nameKey?: CopyKey;
    /** User-defined label (custom editors only; '' for built-ins). */
    name: string;
    /** 'reveal' = show in the OS file manager; 'url' = open a URL. */
    kind: 'reveal' | 'url';
    /** URL template with `{path}`; undefined for reveal targets. */
    urlTemplate?: string;
    /** Whether the editor talks the VSCode URL dialect. */
    isVscodeFamily: boolean;
    /** Hidden in SSH mode (a host-local opener cannot reach a remote path). */
    localOnly: boolean;
}
/** The default open-with configuration (fresh documents). */
export declare const OPEN_WITH_DEFAULTS: OpenWithConfig;
/** The built-in open targets, in menu order. */
export declare const OPEN_WITH_BUILTINS: readonly OpenWithTarget[];
/**
 * Parse the persisted `openWith` blob (tolerant): malformed fields fall back
 * to the defaults, malformed custom-editor rows are dropped, and pinned ids
 * are kept verbatim (unknown ids are pruned when the targets are resolved —
 * the menu is the only consumer of the resolved list).
 */
export declare function parseOpenWithConfig(raw: unknown): OpenWithConfig;
/**
 * The menu-visible open targets, in order (built-ins then custom editors).
 * In SSH mode the local-only URL openers (Zed, custom editors without the
 * VSCode dialect) are dropped — they cannot reach a remote path. The
 * `explorer` target is NOT dropped: it reveals a path in the file manager of
 * the machine that owns the workspace, which is exactly where the host half
 * runs, and it is the only reveal left when the DSH host's own open-in-app
 * capability is unavailable (older host, no desktop session). A headless
 * remote cannot raise a file manager anyway — that is the same silent
 * no-op the other external launches already have. Unknown pinned ids are
 * pruned here too.
 */
export declare function resolveOpenWithTargets(config: OpenWithConfig): OpenWithTarget[];
/** The SSH hint appended to a target's label in remote mode. */
export declare function openWithSshActive(config: OpenWithConfig): boolean;
/**
 * The URL to open for one resolved target, or undefined when the target has
 * no URL form (reveal) or the template is malformed. The path is inserted
 * RAW into the template (browsers percent-encode as needed; VSCode-family
 * URL parsers consume the absolute path with its leading slash, e.g.
 * `vscode://file//home/u/f.ts` or `vscode://file/C:/Users/u/f.ts`).
 */
export declare function openWithUrl(target: OpenWithTarget, path: string, config: OpenWithConfig): string | undefined;
/** Normalize a filesystem path for embedding in a URL (backslashes → '/'). */
export declare function normalizeUrlPath(path: string): string;
/** A fresh custom-editor id (uuid when available, time-based fallback). */
export declare function newCustomEditorId(): string;
/** Validate one custom-editor row before the settings panel accepts it. */
export declare function isValidCustomEditor(row: {
    name: string;
    urlTemplate: string;
}): boolean;
