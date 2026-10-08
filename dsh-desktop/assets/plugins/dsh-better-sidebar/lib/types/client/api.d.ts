import type { SidechatLiveEvent, SidechatLogEvent, SidechatThreadInfo } from '../sidechat-core.ts';
import type { SidebarCreateTeamTaskRequest, SidebarChildLiveView, SidebarSessionEvent, SidebarTeamTaskView, SidebarUpdateTeamTaskRequest } from '../context-types.ts';
import type { WorkflowRunView } from '../workflow-runs.ts';
/** One wire failure. */
export declare class SidebarApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Explorer row (host fs-tree shape). */
export interface FsEntry {
    name: string;
    path: string;
    isDir: boolean;
    hidden: boolean;
    /** Whether the row is a symlink; `isDir` then describes the link's target. */
    isSymlink: boolean;
    /** For symlinks: the target is missing or unreadable (stat failed). */
    broken: boolean;
}
/** One level of a `fs.trees` batch: a listing, or that level's failure. */
export interface FsLevel {
    path: string;
    entries: FsEntry[];
    truncated: boolean;
    /** Present only when THIS level failed (the batch itself succeeded). */
    error?: string;
}
/** Git status entry (host git shape). */
export interface GitStatusEntry {
    path: string;
    xy: string;
}
/** Git status snapshot. */
export interface GitStatusResult {
    isRepo: boolean;
    branch?: string;
    entries: GitStatusEntry[];
    /** True when the host capped `entries` (huge untracked set); the panel
     *  shows a truncation notice instead of freezing (#369). */
    truncated?: boolean;
    root?: string;
    repositories?: string[];
}
/** One linked Git checkout. */
export interface GitWorktree {
    path: string;
    branch: string;
    current: boolean;
    changes: number;
}
/** One git log row. */
export interface GitLogEntry {
    /** Short hash (7+ chars, display). */
    hash: string;
    /** Full 40-char hash (advanced operations). */
    hashFull: string;
    subject: string;
    author: string;
    /** ISO 8601 author date (`%ai`). */
    date: string;
    /** Ref decorations (--decorate=short), e.g. `HEAD -> main, origin/main`; '' when none. */
    refs: string;
}
/** Text read result. */
export interface FsTextResult {
    kind: 'text';
    content: string;
    truncated: boolean;
}
/** Binary read result (no content; images load through the media route).
 *  `head` carries the first bytes (base64) for viewer detect sniffing. */
export interface FsBinaryResult {
    kind: 'binary';
    size: number;
    truncated: boolean;
    head: string;
}
/** The `subagents.live` response: one row per tree child (and the root). */
export type SubagentLiveResult = {
    live: Record<string, SidebarChildLiveView>;
};
/** The `workflows.list` response: the tree's folded workflow runs. */
export type WorkflowsListResult = {
    runs: WorkflowRunView[];
};
/** The `teams.taskCreate` request payload (minus the rootSessionId). */
export type TeamsTaskCreateRequest = SidebarCreateTeamTaskRequest;
/** The `teams.taskUpdate` request payload (minus the rootSessionId). */
export type TeamsTaskUpdateRequest = SidebarUpdateTeamTaskRequest;
/**
 * One team-task write as CALLERS consume it. The board's READ path has no
 * route at all (it rides the Lead Session's `agentTeam` projection, see
 * team-projection.ts), and a rejected write is a RESULT rather than an
 * exception: the route answers 409 `team-conflict` for a stale revision and
 * 400 `team-error` otherwise, {@link writeTask} turns that failed envelope
 * back into `{ok:false, code, message}`, and the task window routes on the
 * code (a stale revision deserves its own wording, not "operation failed").
 */
export type TeamsTaskMutationResult = {
    ok: true;
    value: SidebarTeamTaskView;
} | {
    ok: false;
    code?: string;
    message: string;
};
/** One request's session scope: the conversation id plus its cwd when known. */
export interface SessionScope {
    sessionId: string;
    /** The session's working directory from the client list summary (optional). */
    cwd?: string;
    /** Selected Git repository when cwd is a workspace container. */
    repoRoot?: string;
}
/** One external-open request from the file tree. */
type OpenExternalPayload = {
    action: 'reveal';
    path: string;
} | {
    action: 'url';
    url: string;
};
/** The host route's success shape. */
type OpenExternalResult = {
    started: boolean;
};
/**
 * Dispatch an external-open request to the correct machine. SSH remote-editor
 * URLs stay in the synchronous user-click chain and navigate the client so
 * its registered vscode:// / cursor:// handler can launch. Everything else
 * keeps using the DSH host route.
 */
declare function openExternal(payload: OpenExternalPayload): Promise<OpenExternalResult>;
/** The sidebar API surface (session scope threaded through every call). */
export declare const api: {
    sessionCwd: (scope: SessionScope, signal?: AbortSignal) => Promise<{
        sessionId: string;
        cwd: string;
        root: string;
        parent: string | null;
    }>;
    fsTree: (scope: SessionScope, path: string, signal?: AbortSignal) => Promise<{
        path: string;
        entries: FsEntry[];
        truncated: boolean;
    }>;
    /**
     * Batch listing: every requested level in ONE request (the tree's mount and
     * refresh send the expanded set instead of N `fsTree` calls). A level that
     * failed carries `error` in place — the batch itself still succeeds.
     */
    fsTrees: (scope: SessionScope, paths: readonly string[], signal?: AbortSignal) => Promise<{
        levels: FsLevel[];
    }>;
    /** Global recursive file-name search rooted at the session cwd (the editor
     *  side panel's search box); matches are cwd-relative '/'-separated paths. */
    fsSearch: (scope: SessionScope, query: string, signal?: AbortSignal) => Promise<{
        matches: string[];
        truncated: boolean;
    }>;
    fsRead: (scope: SessionScope, path: string, signal?: AbortSignal) => Promise<FsTextResult | FsBinaryResult>;
    fsWrite: (scope: SessionScope, path: string, content: string) => Promise<{
        ok: true;
    }>;
    /** Rename one tree row within its directory (single-segment name; the
     *  server refuses existing destinations, the workspace root, and — while
     *  the fence is armed — anything resolving outside the workspace). */
    fsRename: (scope: SessionScope, path: string, name: string) => Promise<{
        path: string;
    }>;
    /** Permanently delete one tree row (recursive for directories; a symlink
     *  row unlinks the link only). The UI confirms before calling this. */
    fsRemove: (scope: SessionScope, path: string) => Promise<{
        path: string;
    }>;
    /** Create one directory row inside `path` (single-segment name; the server
     *  refuses existing destinations, the workspace root, and — while the fence
     *  is armed — anything resolving outside the workspace). */
    fsMkdir: (scope: SessionScope, path: string, name: string) => Promise<{
        path: string;
    }>;
    /** Upload one file's raw bytes into `dir` (keeps the folder tree via
     *  `relativePath`); the host streams it under the session workspace. */
    uploadFile: (scope: SessionScope, dir: string, relativePath: string, body: Blob, signal?: AbortSignal) => Promise<{
        path: string;
        size: number;
    }>;
    gitWorktrees: (scope: SessionScope, signal?: AbortSignal) => Promise<GitWorktree[]>;
    gitStatus: (scope: SessionScope, worktree?: string, signal?: AbortSignal) => Promise<GitStatusResult>;
    gitDiff: (scope: SessionScope, path: string | undefined, staged: boolean, worktree?: string, signal?: AbortSignal) => Promise<{
        diff: string;
    }>;
    gitStage: (scope: SessionScope, path?: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    gitUnstage: (scope: SessionScope, path?: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    gitCommit: (scope: SessionScope, message: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    gitBranch: (scope: SessionScope, worktree?: string, signal?: AbortSignal) => Promise<{
        current: string;
        names: string[];
    }>;
    gitCheckout: (scope: SessionScope, branch: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    /** Recent commit history, lazily pageable (skip/count; defaults 0/30). */
    gitLog: (scope: SessionScope, count?: number, skip?: number, worktree?: string, signal?: AbortSignal) => Promise<GitLogEntry[]>;
    /** Full patch text of one commit (diff display for the history rows). */
    gitCommitDiff: (scope: SessionScope, hash: string, worktree?: string, signal?: AbortSignal) => Promise<{
        diff: string;
    }>;
    /** One file's content at a revision (`git show <rev>:<path>`); null when the
     *  revision has no such path. The diff views' on-demand hunk-fold expansion
     *  reads both sides' full contents through this. */
    gitShow: (scope: SessionScope, rev: string, path: string, worktree?: string, signal?: AbortSignal) => Promise<{
        content: string | null;
    }>;
    /** The session's file-tool events for the changes tab's session lens: the
     *  `tool/call` + `tool/result` rows past `afterSeq` (0 = whole window),
     *  capped to the recent window host-side. The client runtime exposes no
     *  event-log face, so the lens polls this delta route. */
    changesOps: (scope: SessionScope, afterSeq?: number, signal?: AbortSignal) => Promise<{
        events: SidebarSessionEvent[];
        lastSeq: number;
    }>;
    /** Discard the worktree changes of one file (the index is untouched). */
    gitDiscard: (scope: SessionScope, path: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    /** Revert one commit onto the current branch. */
    gitRevert: (scope: SessionScope, hash: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    /** Cherry-pick one commit onto the current branch. */
    gitCherryPick: (scope: SessionScope, hash: string, worktree?: string) => Promise<{
        ok: true;
    }>;
    /**
     * One batch live-preview fetch for the whole Subagent tree. The payload is
     * the already-resolved topology ROOT (not a session scope); the host
     * enumerates descendants once and folds every child's newest process range
     * into the main agent's merged-activity summary.
     */
    subagentsLive: (rootSessionId: string, signal?: AbortSignal) => Promise<SubagentLiveResult>;
    /**
     * The workflow runs of the whole tree, folded host-side from the
     * `tool-workflow/*` session events (the same four types the official
     * workflow-run panel folds). Empty when the tree never ran a workflow —
     * absence is the normal case, never an error.
     */
    workflowsList: (rootSessionId: string, signal?: AbortSignal) => Promise<WorkflowsListResult>;
    /** Create one shared task on the root-led team. */
    teamsTaskCreate: (rootSessionId: string, req: TeamsTaskCreateRequest) => Promise<TeamsTaskMutationResult>;
    /** CAS-mutate one shared task; a stale revision yields `team-conflict`. */
    teamsTaskUpdate: (rootSessionId: string, req: TeamsTaskUpdateRequest) => Promise<TeamsTaskMutationResult>;
    /** Create a Side Chat thread: a child session seeded with the parent's
     *  full log up to now. Empty question = immediate create (Codex-style):
     *  the thread opens empty, the first prompt carries the boundary. */
    sidechatStart: (sessionId: string, question?: string) => Promise<{
        childId: string;
    }>;
    /** Deliver one follow-up message to a Side Chat thread. */
    sidechatPrompt: (childId: string, text: string) => Promise<{
        accepted: true;
    }>;
    /** Abort a Side Chat thread's running turn (queued work is preserved). */
    sidechatCancel: (childId: string) => Promise<{
        accepted: true;
    }>;
    /** Release a Side Chat thread's live agent (history stays persisted). */
    sidechatDispose: (childId: string) => Promise<{
        accepted: true;
    }>;
    /** Live state + agent identity (provider/model/preset) of a thread. */
    sidechatInfo: (childId: string) => Promise<SidechatThreadInfo>;
    /** One transcript pull of a Side Chat thread: the thread's OWN events
     *  (the inherited seed is cut host-side and never crosses the wire).
     *  `afterSeq` narrows the response to the delta beyond it (poll tail).
     *  `live` is the thread's in-flight model deltas (DSH 0.1.5 publishes them
     *  outside the session log) — the CURRENT attempt on every pull, never a
     *  delta, so the caller replaces its live set instead of appending. */
    sidechatEvents: (childId: string, afterSeq?: number, signal?: AbortSignal) => Promise<{
        events: SidechatLogEvent[];
        live: SidechatLiveEvent[];
    }>;
    /** Read the side card preferences (plugin-global, no session scope). */
    settingsGet: () => Promise<{
        value?: unknown;
        revision?: number;
        externalDisable?: boolean;
    }>;
    /** Merge a patch into the side card preferences (revision-guarded). */
    settingsUpdate: (patch: Record<string, unknown>, expectedRevision?: number) => Promise<{
        value?: unknown;
        revision?: number;
    }>;
    /** External open for the file tree's "open with" menu. Remote SSH editor
     *  URLs are launched on the browser/client machine; reveal and local URLs
     *  keep using the host's platform opener. */
    openExternal: typeof openExternal;
};
/** Absolute URL of the media route for one path (images only). */
export declare function mediaUrl(scope: SessionScope, path: string): string;
/** Absolute URL of the download route: serves raw bytes (binary-safe) with
 *  `Content-Disposition: attachment`, so the browser saves the file. */
export declare function downloadUrl(scope: SessionScope, path: string): string;
/**
 * Start one archive build. The host fences and walks the selection, then
 * returns an id IMMEDIATELY — the zip itself is produced in the background and
 * polled through {@link api.archiveStatus}. `paths` are absolute paths in the
 * session's namespace (the same values `fsTree` / `downloadUrl` take).
 */
export declare function archiveBuild(scope: SessionScope, paths: readonly string[], name: string): Promise<{
    id: string;
    entries: number;
}>;
/** One archive build's progress (the shape `archive.status` returns). */
export interface ArchiveBuildStatus {
    state: 'building' | 'ready' | 'error';
    /** Entries finished so far. */
    done: number;
    /** Entries the archive will contain. */
    total: number;
    /** Uncompressed bytes read so far. */
    bytes: number;
    /** Present only when `state === 'error'`. */
    error?: string;
}
/** Poll one archive build (its id came from {@link archiveBuild}). */
export declare function archiveStatus(id: string): Promise<ArchiveBuildStatus>;
/**
 * Absolute URL of one FINISHED archive's bytes (the `archive.status` result
 * must be `ready` first): GET /sidebar/archive?id=…&sessionId=… The session
 * scope rides along because the host answers only the session that built it.
 */
export declare function archiveDownloadUrl(scope: SessionScope, id: string): string;
/**
 * Absolute URL of the HTML preview route (see html-route.ts): the path is
 * fully encoded so the previewed page's relative assets resolve back into
 * the same route with the session scope intact. The UNC marker is
 * platform-neutral — the host's requireAbsolute resolves the decoded
 * forward-slash `//server/share/...` form on both win32 and POSIX — so no
 * client-side platform signal is needed.
 */
export declare function htmlUrl(scope: SessionScope, path: string): string;
export {};
