type Fetch = typeof globalThis.fetch;
/** Transport safety ceiling; the Host enforces its configured attachment limits. */
export declare const REMOTE_UPLOAD_MAX_BYTES: number;
/** Official upload hook: shared by browser, Desktop and IDE upload runtimes. */
export declare function createRemoteUploadFetch(original: Fetch, baseUrl: string): Fetch;
export {};
//# sourceMappingURL=remote-upload-client.d.ts.map