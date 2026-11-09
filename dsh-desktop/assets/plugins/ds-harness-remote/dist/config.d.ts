import type { Volatile, VolatileSnapshot } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
export declare const DEFAULT_REMOTE_SERVER_URL = "https://dsh.r2049.cn";
export interface Config {
    enabled?: boolean;
    role?: 'host' | 'client' | 'both';
    serverUrl?: string;
    deviceName?: string;
    terminal?: {
        enabled?: boolean;
    };
    hostControl?: {
        enabled?: boolean;
    };
    loopback?: {
        ports?: number[];
    };
    forceRelay?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    reconnect?: boolean | {
        initialDelayMs?: number;
        maxDelayMs?: number;
        jitter?: number;
    };
    /** Optional Codex domain carried by the existing authenticated Remote Plugin. */
    codex?: {
        enabled?: boolean;
        binary?: string;
    };
    /** Optional Cursor ACP domain carried by the existing authenticated Remote Plugin. */
    cursor?: {
        enabled?: boolean;
        binary?: string;
    };
    acp?: {
        enabled?: boolean;
        backends?: Array<{
            id: string;
            enabled?: boolean;
            command?: string;
            args?: string[];
            cwd?: string;
        }>;
        backend?: string;
        command?: string;
        args?: string[];
        cwd?: string;
    };
}
export interface ResolvedCodexConfig {
    enabled: boolean;
    binary: string;
}
export interface ResolvedCursorConfig {
    enabled: boolean;
    binary: string;
}
export interface ResolvedAcpBackendConfig {
    id: string;
    enabled: boolean;
    command: string;
    args: string[];
    cwd?: string;
}
export interface ResolvedAcpConfig {
    enabled: boolean;
    backends: ResolvedAcpBackendConfig[];
}
export interface ResolvedConfig {
    enabled: boolean;
    role: 'host' | 'client' | 'both';
    serverUrl?: string;
    deviceName: string;
    forceRelay: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    reconnect: {
        enabled: boolean;
        initialDelayMs: number;
        maxDelayMs: number;
        jitter: number;
    };
    terminal: {
        enabled: boolean;
    };
    hostControl?: {
        enabled: boolean;
    };
    loopback: {
        ports: number[];
    };
    codex: ResolvedCodexConfig;
    cursor: ResolvedCursorConfig;
    acp?: ResolvedAcpConfig;
}
/** The entry's volatile Cordis config: one stable reference for the whole section. */
export type EntryConfig = Volatile<Config>;
/** Config accepted by {@link resolveConfig}: the composition seed or a live snapshot. */
export type ConfigInput = Config | VolatileSnapshot<Config>;
/**
 * Mark the entry as live-editable when the host Schemastery supports the
 * 0.1.7 volatile schema mode. Older DSH releases ship an earlier Schemastery
 * where the method does not exist; their settings registry expects the plain
 * schema and must still be able to import the plugin without throwing.
 */
export declare function withVolatileSchema<T>(schema: T): T;
export declare const Config: s<Config>;
export declare function resolveConfig(input?: ConfigInput, env?: NodeJS.ProcessEnv): ResolvedConfig;
export declare function normalizeServerUrl(value: string): string;
//# sourceMappingURL=config.d.ts.map