import { z } from 'zod';
import type { ConnectedRemote } from './client-runtime-contract.js';
declare const session: z.ZodObject<{
    hostId: z.ZodString;
    backend: z.ZodLiteral<"harness">;
    workspaceId: z.ZodString;
    sessionId: z.ZodString;
}, z.core.$strict>;
export declare const sessionToolInputs: {
    remote_upload_file: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        sessionId: z.ZodString;
        operationId: z.ZodString;
        localPath: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    remote_download_file: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        sessionId: z.ZodString;
        path: z.ZodString;
    }, z.core.$strict>;
    remote_list_sessions: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        offset: z.ZodDefault<z.ZodNumber>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    remote_read_session: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        sessionId: z.ZodString;
        cursor: z.ZodOptional<z.ZodObject<{
            throughSeq: z.ZodNumber;
            beforeSeq: z.ZodNumber;
        }, z.core.$strict>>;
        maxMessages: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    remote_create_session: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>;
    remote_send_message: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        sessionId: z.ZodString;
        operationId: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>;
    remote_interrupt_session: z.ZodObject<{
        hostId: z.ZodString;
        backend: z.ZodLiteral<"harness">;
        workspaceId: z.ZodString;
        sessionId: z.ZodString;
        operationId: z.ZodString;
    }, z.core.$strict>;
    remote_wait_sessions: z.ZodObject<{
        targets: z.ZodArray<z.ZodObject<{
            hostId: z.ZodString;
            backend: z.ZodLiteral<"harness">;
            workspaceId: z.ZodString;
            sessionId: z.ZodString;
        }, z.core.$strict>>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    remote_get_operation: z.ZodObject<{
        operationId: z.ZodString;
    }, z.core.$strict>;
};
export type SessionToolOperation = keyof typeof sessionToolInputs;
export type SessionTarget = z.infer<typeof session>;
export type RemoteToolConnection = <T>(hostId: string, signal: AbortSignal, query: (remote: ConnectedRemote, signal: AbortSignal) => Promise<T>) => Promise<T>;
export declare class RemoteSessionToolError extends Error {
}
/** Fixed native operations over the existing carrier. No alternate Harness wire API. */
export declare class RemoteSessionTools {
    private readonly connect;
    private readonly ledger;
    private generation;
    constructor(connect: RemoteToolConnection);
    invalidate(): void;
    run(operation: SessionToolOperation, input: unknown, signal: AbortSignal): Promise<unknown>;
    private execute;
    private onHost;
    private requireWorkspace;
    private catalog;
    private requireSession;
    private mutate;
    private wait;
}
export {};
//# sourceMappingURL=remote-session-tools.d.ts.map