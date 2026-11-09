export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogSink {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export declare class SafeLogger {
    private readonly sink;
    private readonly threshold;
    constructor(sink: LogSink, threshold?: LogLevel);
    debug(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
    private write;
}
//# sourceMappingURL=logging.d.ts.map