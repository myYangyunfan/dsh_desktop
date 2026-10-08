/**
 * Wire helpers for the /sidebar JSON API: bounded body reading, response
 * writing, and the shared error envelope. Every API method returns
 * `{ok: true, value}` on success and `{ok: false, error: {code, message}}`
 * (HTTP 4xx/5xx matching the code) on failure.
 */
import type { SidebarHttpRequest, SidebarHttpResponse } from './context-types.ts';
/** Machine-readable error codes of the sidebar API. */
export type SidebarErrorCode = 'bad-request' | 'not-found' | 'forbidden' | 'method-error' | 'too-large' | 'fs-error' | 'git-error' | 'job-error' | 'team-error' | 'team-conflict' | 'sidechat-error' | 'subagents-unavailable' | 'settings-rejected' | 'settings-conflict' | 'internal';
/** One API failure with its wire code and HTTP status. */
export declare class SidebarError extends Error {
    readonly code: SidebarErrorCode;
    readonly status: number;
    /** Optional structured context carried alongside the code. */
    readonly meta?: Record<string, string> | undefined;
    constructor(code: SidebarErrorCode, message: string, status?: number, 
    /** Optional structured context carried alongside the code. */
    meta?: Record<string, string> | undefined);
}
/** Success envelope of one API method. */
export interface SidebarOk<T> {
    ok: true;
    value: T;
}
/** Failure envelope of one API method. */
export interface SidebarErr {
    ok: false;
    error: {
        code: SidebarErrorCode;
        message: string;
    };
}
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
export declare function readJsonBody(req: SidebarHttpRequest): Promise<unknown>;
/** Write a JSON response with the given status. */
export declare function writeJson(res: SidebarHttpResponse, status: number, body: unknown): void;
/** Write the success envelope. */
export declare function writeOk(res: SidebarHttpResponse, value: unknown): void;
/** Write the failure envelope for any thrown value (unknown → internal 500). */
export declare function writeError(res: SidebarHttpResponse, error: unknown): void;
/** Narrow an unknown payload value to a string, else throw bad-request. */
export declare function requireString(payload: unknown, key: string): string;
