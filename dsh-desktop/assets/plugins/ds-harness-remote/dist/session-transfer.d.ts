import { z } from 'zod';
declare const history: z.ZodObject<{
    formatVersion: z.ZodLiteral<1>;
    version: z.ZodNumber;
    createdAt: z.ZodNumber;
    inheritedEventCount: z.ZodNumber;
    events: z.ZodArray<z.ZodObject<{
        seq: z.ZodNumber;
        type: z.ZodString;
        time: z.ZodNumber;
        data: z.ZodUnknown;
    }, z.core.$loose>>;
}, z.core.$strict>;
type History = z.infer<typeof history>;
export interface TransferQuery {
    readSession(id: string): Promise<{
        session: {
            version: number;
            createdAt: number;
            origin?: string;
        };
        inheritedEventCount: number;
        events: {
            type: string;
            data: unknown;
        }[];
    }>;
}
type TargetHeader = {
    id: string;
    version: number;
    createdAt: number;
    cwd: string;
    isSeeded: boolean;
};
export interface TransferPersistence {
    create(header: TargetHeader, options: {
        inheritedEventCount: number;
    }): Promise<{
        append(events: History['events']): Promise<void>;
        flush(): Promise<void>;
        close(): Promise<void>;
    }>;
}
interface TransferWorkspace {
    path: string;
    sessionIds: readonly string[];
    attachSession(id: string): Promise<void>;
}
export interface TransferServices {
    query?: TransferQuery;
    persistence?: TransferPersistence;
    sessions?: {
        prepare(id: string, options: {
            seed: History['events'];
            inheritedEventCount: number;
            meta: Pick<TargetHeader, 'cwd' | 'createdAt' | 'isSeeded'>;
        }): {
            header: TargetHeader;
        };
    };
    workspaces?: {
        get(id: string): TransferWorkspace | undefined;
    };
}
type CommitResult = {
    sessionId: string;
    workspaceAttached: boolean;
};
type Commit = {
    fingerprint: string;
    result: Promise<CommitResult>;
    expires: number;
};
export declare class SessionTransferHost {
    private readonly services;
    private readonly commits;
    constructor(services: () => TransferServices);
    peer(deviceId: string): SessionTransferPeer;
}
export declare class SessionTransferPeer {
    private readonly services;
    private readonly commits;
    private readonly deviceId;
    private outgoing?;
    private incoming?;
    private expiry?;
    private closed;
    private busy;
    constructor(services: () => TransferServices, commits: Map<string, Commit>, deviceId: string);
    capabilities(): string[];
    close(): void;
    private reset;
    call(method: string, params: unknown): Promise<unknown>;
    private workspace;
    private snapshot;
    private invoke;
    private exportState;
    private importState;
    private commitKey;
    private write;
}
export {};
//# sourceMappingURL=session-transfer.d.ts.map