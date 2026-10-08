/**
 * Wire helpers for the /basics JSON API: bounded body reading, response
 * writing, and the shared error envelope. Every API method returns
 * `{ok: true, value}` on success and `{ok: false, error: {code, message}}`
 * (HTTP 4xx/5xx matching the code) on failure.
 */
import type { BasicsHttpRequest, BasicsHttpResponse } from './context-types.ts';
/** Machine-readable error codes of the basics API. */
export type BasicsErrorCode = 'bad-request' | 'not-found' | 'forbidden' | 'method-error' | 'fs-error' | 'skill-error' | 'rule-error' | 'mcp-error' | 'archive-error' | 'conflict' | 'read-only' | 'internal';
/** One API failure with its wire code and HTTP status. */
export declare class BasicsError extends Error {
    readonly code: BasicsErrorCode;
    readonly status: number;
    constructor(code: BasicsErrorCode, message: string, status?: number);
}
/** Success envelope of one API method. */
export interface BasicsOk<T> {
    ok: true;
    value: T;
}
/** Failure envelope of one API method. */
export interface BasicsErr {
    ok: false;
    error: {
        code: BasicsErrorCode;
        message: string;
    };
}
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
export declare function readJsonBody(req: BasicsHttpRequest, maxBodyBytes: number): Promise<unknown>;
/** Write a JSON response with the given status. */
export declare function writeJson(res: BasicsHttpResponse, status: number, body: unknown): void;
/** Write the success envelope. */
export declare function writeOk(res: BasicsHttpResponse, value: unknown): void;
/** Write the failure envelope for any thrown value (unknown → internal 500). */
export declare function writeError(res: BasicsHttpResponse, error: unknown): void;
/** Narrow an unknown payload value to a non-empty string, else throw bad-request. */
export declare function requireString(payload: unknown, key: string): string;
/** Narrow an unknown payload value to an optional non-empty string. */
export declare function optionalString(payload: unknown, key: string): string | undefined;
/** Narrow an unknown payload value to a boolean. */
export declare function requireBoolean(payload: unknown, key: string): boolean;
/**
 * Narrow an unknown payload value to a non-empty list of unique non-empty
 * strings (order preserved, duplicates dropped).
 *
 * The raw list length is checked BEFORE any de-duplication work, so an
 * oversized body cannot buy a long synchronous scan; the returned list is
 * capped by the same bound.
 * @param payload - request payload.
 * @param key - the array field name.
 * @param max - maximum accepted entries (the batch cap).
 * @returns the de-duplicated ids.
 */
export declare function requireStringList(payload: unknown, key: string, max: number): string[];
