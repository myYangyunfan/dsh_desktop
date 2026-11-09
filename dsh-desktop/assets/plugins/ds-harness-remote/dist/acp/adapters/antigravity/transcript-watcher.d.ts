import { EventEmitter } from 'node:events';
import type { AntigravityEvents } from './types.js';
export declare class TranscriptWatcher extends EventEmitter {
    readonly conversationId: string;
    readonly baseDir: string;
    private offset;
    private lineRemainder;
    private pollTimer?;
    private closed;
    private readonly transcriptPath;
    private readonly transcriptFullPath;
    constructor(conversationId: string, baseDir?: string);
    on<U extends keyof AntigravityEvents>(event: U, listener: AntigravityEvents[U]): this;
    emit<U extends keyof AntigravityEvents>(event: U, ...args: Parameters<AntigravityEvents[U]>): boolean;
    /**
     * 启动增量文件监听
     */
    start(intervalMs?: number): void;
    stop(): void;
    /**
     * 立即触发一次读取（同步/主动检查）
     */
    flush(): Promise<void>;
    private readNewLines;
    private parseAndDispatch;
    private enrichFromFullTranscript;
}
//# sourceMappingURL=transcript-watcher.d.ts.map