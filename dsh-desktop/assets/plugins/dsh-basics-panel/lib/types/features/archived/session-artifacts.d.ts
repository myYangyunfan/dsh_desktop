/** One located session artifact directory. */
export interface SessionArtifact {
    /** Absolute session directory. */
    readonly directory: string;
    /** Absolute generation-log paths inside the directory. */
    readonly logs: string[];
    /** Total size of the directory's files (bytes). */
    readonly bytes: number;
}
/**
 * Whether a raw session id may be used as one path segment (no separators, no
 * traversal, no NUL). Mirrors the backend's "encode before use" intent: an id
 * that needs escaping is refused rather than re-encoded here.
 * @param id - candidate session id.
 * @returns true when the id is a safe single path segment.
 */
export declare function isSafeSessionId(id: string): boolean;
/** Whether a file name is a canonical session generation log. */
export declare function isSessionLogName(name: string): boolean;
/**
 * Whether `target` is strictly inside `root` (no traversal escape).
 * @param root - container directory.
 * @param target - candidate path.
 * @returns true when the resolved target lives under the resolved root.
 */
export declare function isInside(root: string, target: string): boolean;
/**
 * Describe one candidate session directory, refusing anything that is not the
 * named session's artifact (wrong basename, outside the root, no generation log).
 * @param root - the configured sessions root.
 * @param sessionId - the session the directory must belong to.
 * @param directory - candidate directory (absolute).
 * @returns the artifact facts, or undefined when the candidate is refused.
 */
export declare function describeSessionArtifact(root: string, sessionId: string, directory: string): Promise<SessionArtifact | undefined>;
/**
 * Locate one session's artifact directory under the configured sessions root.
 * The scan mirrors the backend's own session-directory lookup: one level of
 * project directories, then a child named exactly like the session id.
 * @param root - the JSONL backend's sessions root (`$DSH_HOME/sessions` by default).
 * @param sessionId - the stored session id.
 * @returns the located artifact, or undefined when no project directory owns it.
 */
export declare function findSessionArtifact(root: string, sessionId: string): Promise<SessionArtifact | undefined>;
/**
 * Delete one located session-artifact directory recursively.
 * @param root - the sessions root the artifact was found under.
 * @param sessionId - the session the directory must belong to.
 * @param directory - the located session directory.
 * @returns the number of bytes removed.
 * @throws when the directory no longer passes the shape checks (never deletes blind).
 */
export declare function removeSessionArtifact(root: string, sessionId: string, directory: string): Promise<number>;
