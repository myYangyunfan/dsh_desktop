import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ExecutionOptions } from './types.js';
export interface SingleExecutionResult {
    conversationId?: string;
    output: string;
    raw: unknown;
}
export declare class AntigravityExecutor {
    private activeProcess?;
    /**
     * 非交互式调用：`agy -p "<prompt>" --output-format json`
     */
    executeOnce(prompt: string, options?: ExecutionOptions): Promise<SingleExecutionResult>;
    /**
     * 启动常驻交互式流式子进程 (stream-json 管道模式)
     */
    spawnStreamSession(options?: ExecutionOptions): ChildProcessWithoutNullStreams;
    kill(): void;
}
//# sourceMappingURL=executor.d.ts.map