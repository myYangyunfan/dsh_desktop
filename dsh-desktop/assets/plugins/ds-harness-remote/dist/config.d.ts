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
    remoteTools?: {
        enabled?: boolean;
    };
    /** Where the Desktop client shows the Remote entry: beside Settings or in the account row. */
    sidebar?: {
        entry?: 'standard' | 'compact';
    };
    hostControl?: {
        enabled?: boolean;
    };
    loopback?: {
        ports?: number[];
    };
    forceRelay?: boolean;
    /**
     * When a known peer device presents a NEW identity key after re-authorizing with the
     * same account membership (e.g. the peer reinstalled the Harness), rotate the pinned
     * key instead of rejecting the connection. The new key is validated against the
     * account directory before this policy applies. Default: false (pin strictly).
     */
    rotatePinnedPeerKey?: boolean;
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
    rotatePinnedPeerKey: boolean;
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
    remoteTools?: {
        enabled: boolean;
    };
    sidebar: {
        entry: 'standard' | 'compact';
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
 * Schemastery schema for the plugin entry. On DSH 0.1.7-rc.1 and newer the
 * whole section is `.volatile()` (DSH-0.1.7-RC1-04): the Loader hands `apply`
 * a single live reference whose `.get()` always returns the latest committed
 * value, and the settings service persists edits in the active profile's
 * `cordis.patch.yml` under this entry id. On older hosts the helper above keeps
 * the plain schema required by the namespace-registration API.
 */
export declare const entryConfigSchema: s<Schemastery.ObjectS<NoInfer<{
    enabled: s<boolean, boolean, "plain">;
    role: s<"host" | "client" | "both", "host" | "client" | "both", "plain">;
    serverUrl: s<string, string, "plain">;
    deviceName: s<string, string, "plain">;
    terminal: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    remoteTools: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    sidebar: s<Schemastery.ObjectS<NoInfer<{
        entry: s<"standard" | "compact", "standard" | "compact", "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        entry: s<"standard" | "compact", "standard" | "compact", "plain">;
    }>>, "plain">;
    hostControl: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    loopback: s<Schemastery.ObjectS<NoInfer<{
        ports: s<number[], number[], "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        ports: s<number[], number[], "plain">;
    }>>, "plain">;
    forceRelay: s<boolean, boolean, "plain">;
    rotatePinnedPeerKey: s<boolean, boolean, "plain">;
    logLevel: s<"error" | "debug" | "info" | "warn", "error" | "debug" | "info" | "warn", "plain">;
    reconnect: s<boolean | ({
        initialDelayMs?: number | null | undefined;
        maxDelayMs?: number | null | undefined;
        jitter?: number | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict), boolean | Schemastery.ObjectT<NoInfer<{
        initialDelayMs: s<number, number, "plain">;
        maxDelayMs: s<number, number, "plain">;
        jitter: s<number, number, "plain">;
    }>>, "plain">;
    codex: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, "plain">;
    cursor: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, "plain">;
    acp: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        backends: s<({
            id?: string | null | undefined;
            enabled?: boolean | null | undefined;
            command?: string | null | undefined;
            args?: string[] | null | undefined;
            cwd?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "plain">;
            enabled: s<boolean, boolean, "plain">;
            command: s<string, string, "plain">;
            args: s<string[], string[], "plain">;
            cwd: s<string, string, "plain">;
        }>>[], "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        backends: s<({
            id?: string | null | undefined;
            enabled?: boolean | null | undefined;
            command?: string | null | undefined;
            args?: string[] | null | undefined;
            cwd?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "plain">;
            enabled: s<boolean, boolean, "plain">;
            command: s<string, string, "plain">;
            args: s<string[], string[], "plain">;
            cwd: s<string, string, "plain">;
        }>>[], "plain">;
    }>>, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: s<boolean, boolean, "plain">;
    role: s<"host" | "client" | "both", "host" | "client" | "both", "plain">;
    serverUrl: s<string, string, "plain">;
    deviceName: s<string, string, "plain">;
    terminal: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    remoteTools: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    sidebar: s<Schemastery.ObjectS<NoInfer<{
        entry: s<"standard" | "compact", "standard" | "compact", "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        entry: s<"standard" | "compact", "standard" | "compact", "plain">;
    }>>, "plain">;
    hostControl: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
    }>>, "plain">;
    loopback: s<Schemastery.ObjectS<NoInfer<{
        ports: s<number[], number[], "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        ports: s<number[], number[], "plain">;
    }>>, "plain">;
    forceRelay: s<boolean, boolean, "plain">;
    rotatePinnedPeerKey: s<boolean, boolean, "plain">;
    logLevel: s<"error" | "debug" | "info" | "warn", "error" | "debug" | "info" | "warn", "plain">;
    reconnect: s<boolean | ({
        initialDelayMs?: number | null | undefined;
        maxDelayMs?: number | null | undefined;
        jitter?: number | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict), boolean | Schemastery.ObjectT<NoInfer<{
        initialDelayMs: s<number, number, "plain">;
        maxDelayMs: s<number, number, "plain">;
        jitter: s<number, number, "plain">;
    }>>, "plain">;
    codex: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, "plain">;
    cursor: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        binary: s<string, string, "plain">;
    }>>, "plain">;
    acp: s<Schemastery.ObjectS<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        backends: s<({
            id?: string | null | undefined;
            enabled?: boolean | null | undefined;
            command?: string | null | undefined;
            args?: string[] | null | undefined;
            cwd?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "plain">;
            enabled: s<boolean, boolean, "plain">;
            command: s<string, string, "plain">;
            args: s<string[], string[], "plain">;
            cwd: s<string, string, "plain">;
        }>>[], "plain">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: s<boolean, boolean, "plain">;
        backends: s<({
            id?: string | null | undefined;
            enabled?: boolean | null | undefined;
            command?: string | null | undefined;
            args?: string[] | null | undefined;
            cwd?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "plain">;
            enabled: s<boolean, boolean, "plain">;
            command: s<string, string, "plain">;
            args: s<string[], string[], "plain">;
            cwd: s<string, string, "plain">;
        }>>[], "plain">;
    }>>, "plain">;
}>>, "plain">;
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