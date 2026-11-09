import { AntigravityExecutor, type SingleExecutionResult } from './executor.js';
import { TranscriptWatcher } from './transcript-watcher.js';
import type { ExecutionOptions } from './types.js';
export declare class AntigravitySession {
    readonly conversationId: string;
    readonly watcher: TranscriptWatcher;
    private readonly executor;
    private readonly defaultOptions;
    constructor(conversationId: string, watcher: TranscriptWatcher, executor: AntigravityExecutor, defaultOptions?: ExecutionOptions);
    /**
     * 发送 Prompt 并等待完成；期间 watcher 会持续抛出思考与工具调用事件
     */
    prompt(text: string, options?: ExecutionOptions): Promise<SingleExecutionResult>;
    close(): void;
}
export declare class AntigravityService {
    private readonly executor;
    constructor(executor?: AntigravityExecutor);
    /**
     * 创建新会话并执行首轮 Prompt
     */
    createSession(initialPrompt: string, options?: ExecutionOptions): Promise<{
        session: AntigravitySession;
        result: SingleExecutionResult;
    }>;
    /**
     * 恢复已有会话
     */
    resumeSession(conversationId: string, options?: ExecutionOptions): AntigravitySession;
    /**
     * 单次无状态执行
     */
    executeOnce(prompt: string, options?: ExecutionOptions): Promise<SingleExecutionResult>;
}
//# sourceMappingURL=service.d.ts.map