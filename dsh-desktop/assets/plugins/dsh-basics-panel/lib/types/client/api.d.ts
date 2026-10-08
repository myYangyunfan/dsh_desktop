/**
 * Typed fetch wrapper over the /basics JSON API. Every call posts to
 * `/basics/api/<method>`. Skill methods carry the current session id and cwd
 * (the host prefers its attached session header and uses the summary cwd only
 * while the session is still hydrating). Failures surface as
 * {@link BasicsApiError} with the wire code.
 */
import type { Context } from '../context-types.ts';
export declare class BasicsApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The current session id and cwd read from the client sessions feed. */
export interface SessionRef {
    sessionId: string;
    cwd?: string;
}
/** Read the current session ref for skill scoping. */
export declare function currentSession(ctx: Context): SessionRef;
export interface SkillRow {
    name: string;
    description: string;
    whenToUse?: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    source: string;
    provider: string;
    location?: string;
    editable: boolean;
}
export interface SkillGroup {
    scope: 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other';
    skills: SkillRow[];
}
export interface SkillsList {
    groups: SkillGroup[];
    complete: boolean;
    /** How the host resolved the skill scope ('fallback' → another live session was used). */
    scopeSource?: 'session' | 'fallback' | 'none';
    /** The session whose scope the list reflects. */
    sessionId?: string;
}
export interface SkillDetail {
    name: string;
    description: string;
    whenToUse?: string;
    metadata?: Record<string, unknown>;
    modelInvocable: boolean;
    userInvocable: boolean;
    body: string;
    path?: string;
    source: string;
    provider: string;
    editable: boolean;
    mtime?: number;
}
export interface SkillEdit {
    description: string;
    whenToUse?: string | null;
    metadata?: Record<string, unknown> | null;
    modelInvocable: boolean;
    userInvocable: boolean;
    body: string;
}
export interface McpServerRow {
    rowId: string | null;
    serverName: string;
    transport: 'stdio' | 'streamable-http' | 'unknown';
    disabled: boolean;
    editable: boolean;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    toolCallTimeoutMs?: number;
    /** Live status plus how it was observed ('unknown' → the host cannot tell). */
    runtime: {
        mounted: boolean;
        toolCount: number;
        probe: 'global' | 'preset' | 'unknown';
    };
}
export interface McpGroup {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    path: string;
    readOnly: boolean;
    servers: McpServerRow[];
}
export interface McpConfigPatch {
    serverName?: string;
    transport?: string;
    command?: string | null;
    args?: string[] | null;
    env?: Record<string, string> | null;
    url?: string | null;
    headers?: Record<string, string> | null;
    cwd?: string | null;
    toolCallTimeoutMs?: number | null;
}
export interface McpList {
    groups: McpGroup[];
}
/** One new server to append (`path` null lets the host pick the patch layer). */
export interface McpCreateInput {
    serverName: string;
    transport: 'stdio' | 'streamable-http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}
export interface RuleRow {
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    directory: string;
    size?: number;
    mtime?: number;
    editable: boolean;
}
export interface RuleGroup {
    scope: 'global' | 'project';
    rules: RuleRow[];
}
export interface RulesList {
    groups: RuleGroup[];
    cwd: string;
    projectRoot: string;
}
export interface RuleDetail {
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    content: string;
    mtime?: number;
    editable: boolean;
}
export type RuleCreateScope = 'global' | 'project' | 'cwd';
/** One archived-session row. */
export interface ArchivedRow {
    id: string;
    cwd?: string;
    createdAt?: number;
    sizeBytes?: number;
    eventCount?: number;
    /** The session object is loaded in this process's in-memory session store. */
    loaded: boolean;
    /** The session's Agent is draining turns right now. */
    running: boolean;
    /** A durable artifact exists for the id. */
    stored: boolean;
    restorable: boolean;
    deletable: boolean;
}
/** The archived-sessions list payload. */
export interface ArchivedList {
    rows: ArchivedRow[];
    archivedIds: string[];
    totalBytes: number;
    writable: boolean;
    mounted: boolean;
    readOnly: boolean;
    deleteEnabled: boolean;
    maxBatchIds: number;
    listingFailed: boolean;
    sessionsRoot: string;
}
/** One skipped id with its reason. */
export interface ArchivedSkip {
    id: string;
    reason: string;
}
/** The restore/delete result. */
export interface ArchivedMutation {
    ok: true;
    changed: string[];
    skipped: ArchivedSkip[];
    archivedIds: string[];
    freedBytes: number;
    staleSnapshot: boolean;
    warning?: string;
}
export declare const api: {
    skillsList(ref: SessionRef): Promise<SkillsList>;
    skillsGet(ref: SessionRef, name: string): Promise<SkillDetail>;
    skillsSave(ref: SessionRef, name: string, expectedMtime: number | undefined, edit: SkillEdit): Promise<{
        ok: true;
        mtime?: number;
    }>;
    mcpList(): Promise<McpList>;
    mcpSetEnabled(path: string, rowId: string | null, serverName: string, enabled: boolean, presetId?: string): Promise<{
        ok: true;
        disabled: boolean;
        takesEffect: "live" | "new-session";
    }>;
    mcpSave(path: string, rowId: string | null, serverName: string, patch: McpConfigPatch, presetId?: string): Promise<{
        ok: true;
    }>;
    mcpCreate(path: string | null, input: McpCreateInput): Promise<{
        ok: true;
        serverName: string;
        path: string;
    }>;
    rulesList(ref: SessionRef): Promise<RulesList>;
    rulesGet(ref: SessionRef, key: string): Promise<RuleDetail>;
    rulesSave(ref: SessionRef, key: string, expectedMtime: number | undefined, content: string): Promise<{
        ok: true;
        mtime?: number;
    }>;
    rulesCreate(ref: SessionRef, scope: RuleCreateScope, fileName: string): Promise<{
        ok: true;
        key: string;
        scope: "global" | "project";
        fileName: string;
        displayPath: string;
        mtime?: number;
    }>;
    archivedList(): Promise<ArchivedList>;
    archivedRestore(ids: string[]): Promise<ArchivedMutation>;
    archivedDelete(ids: string[]): Promise<ArchivedMutation>;
};
