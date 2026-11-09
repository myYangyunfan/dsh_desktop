export type StepType = 'USER_INPUT' | 'PLANNER_RESPONSE' | 'SYSTEM';
export type StepStatus = 'RUNNING' | 'DONE' | 'ERROR';
export interface ToolCallPayload {
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    status?: 'CALLING' | 'EXECUTING' | 'SUCCESS' | 'ERROR';
}
export interface StepLogRecord {
    step_index: number;
    source?: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM';
    type: StepType;
    status: StepStatus;
    created_at: string;
    content?: string;
    thinking?: string;
    tool_calls?: ToolCallPayload[];
    truncated_fields?: string[];
}
export interface ExecutionOptions {
    /** 目标工作区或执行工作目录 */
    cwd?: string;
    /** 会话 ID，不传则启动新会话 */
    conversationId?: string;
    /** 是否续接最近一次会话 (-c) */
    continueLast?: boolean;
    /** 是否自动放行工具执行权限 (--dangerously-skip-permissions) */
    skipPermissions?: boolean;
    /** 单步执行超时时间 (毫秒) */
    timeoutMs?: number;
    /** 自定义 agy 二进制路径 */
    binaryPath?: string;
    /** 环境变量 */
    env?: NodeJS.ProcessEnv;
}
export interface AntigravityEvents {
    message: (step: {
        stepIndex: number;
        text: string;
        createdAt: string;
    }) => void;
    thinking: (step: {
        stepIndex: number;
        thinking: string;
        createdAt: string;
    }) => void;
    toolCall: (step: {
        stepIndex: number;
        toolCalls: ToolCallPayload[];
        createdAt: string;
    }) => void;
    step: (record: StepLogRecord) => void;
    error: (error: Error) => void;
    complete: (conversationId: string) => void;
}
//# sourceMappingURL=types.d.ts.map