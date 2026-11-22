import type { LogLevel } from './logging.js';
export type PluginLogFilter = 'all' | 'warn';
export interface PluginLogEntry {
    seq: number;
    timestamp: string;
    level: LogLevel;
    line: string;
}
export interface HostLogReadOptions {
    filter?: PluginLogFilter;
    limit?: number;
}
export interface HostLogSnapshot {
    entries: PluginLogEntry[];
    totalBuffered: number;
    filePath?: string;
    fileError?: string;
}
export interface HostLogStoreOptions {
    filePath?: string;
    maxEntries?: number;
    maxFileBytes?: number;
    maxBackups?: number;
}
export interface ResolveHostLogPathOptions {
    env?: NodeJS.ProcessEnv;
    homeDirectory?: string;
    profile?: string;
}
export declare function resolveHostLogPath(options?: ResolveHostLogPathOptions): string;
export declare class HostLogStore {
    readonly filePath?: string;
    private readonly maxEntries;
    private readonly maxFileBytes;
    private readonly maxBackups;
    private liveEntries;
    private persistedEntries;
    private nextSeq;
    private currentBytes;
    private fileError?;
    private writeChain;
    private readonly initPromise;
    private clearedBeforeInit;
    private sizeVerified;
    private dirEnsured;
    private pendingDiskLines;
    private diskFlushScheduled;
    constructor(options?: HostLogStoreOptions);
    record(level: LogLevel, message: string, now?: Date): void;
    snapshot(options?: HostLogReadOptions): Promise<HostLogSnapshot>;
    clear(): Promise<HostLogSnapshot>;
    flush(): Promise<void>;
    private scheduleDiskFlush;
    private enqueueWrite;
    private loadInitialFile;
    private appendToDisk;
    private rotateFiles;
    private clearDisk;
    private combinedEntries;
    private trimInMemory;
}
//# sourceMappingURL=host-log-store.d.ts.map