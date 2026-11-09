import type { Terminal } from '@xterm/headless';
import { RpcError } from './safe-error.js';
import type { TypertRpcResult } from './typert-gateway-contract.js';
import { type RemoteTerminalProcess, type RemoteTerminalSpawner, type TerminalShell } from './remote-terminal-provider.js';
type Frame = Record<string, unknown>;
type ScopeError = (code: string, message: string) => RpcError;
/** Slow followers fail; detaching never keeps an unbounded output journal. */
declare class TerminalFollower implements AsyncIterable<Frame> {
    private readonly detach;
    private values;
    private bytes;
    private wake?;
    private finished;
    private closed;
    private failure?;
    constructor(detach: () => void);
    push(value: Frame): void;
    finish(): void;
    close(): void;
    [Symbol.asyncIterator](): AsyncIterator<Frame>;
}
/** One Host-owned terminal. All screen/output/input transitions are serialized. */
declare class OwnedTerminal {
    readonly sessionId: string;
    readonly id: string;
    readonly cwd: string;
    cols: number;
    rows: number;
    private readonly removed;
    readonly allocation: AbortController;
    readonly screen: Terminal;
    private readonly serializer;
    readonly followers: Set<TerminalFollower>;
    readonly holders: Set<TerminalFollower>;
    pending?: Promise<void>;
    process?: RemoteTerminalProcess;
    shell?: TerminalShell;
    title: string;
    controller?: TerminalFollower;
    controllerId?: string;
    sequence: number;
    state: 'running' | 'exited' | 'failed';
    exitCode: number | null;
    error?: string;
    closing: boolean;
    private disposed;
    private operations;
    private cleanup?;
    private timer?;
    private idle?;
    private activityEpoch;
    constructor(sessionId: string, id: string, cwd: string, cols: number, rows: number, removed: () => void);
    info(): Frame;
    enqueue<T>(operation: () => T | Promise<T>): Promise<T>;
    emit(value: Frame): void;
    invalidate(): void;
    pump(): Promise<void>;
    snapshot(): string;
    monitor(): void;
    private observe;
    /** Failed cleanup remains owned and closed to input, allowing a later retry. */
    close(): Promise<void>;
}
/** Shared across encrypted connections; backend disposal also fences pending creations. */
export declare class RemoteTerminalState {
    readonly onRemoved: (key: string) => void;
    readonly terminals: Map<string, OwnedTerminal>;
    revision: number;
    constructor(onRemoved?: (key: string) => void);
    dispose(matches?: (sessionId: string) => boolean): Promise<void>;
}
/** Official terminal shapes over backend-owned IDs, without creating Harness Agents. */
export declare class RemoteTerminalController {
    private readonly shared;
    private readonly spawn;
    private readonly enabled;
    private readonly scopeError;
    private readonly subscriptions;
    constructor(shared: RemoteTerminalState, spawn: RemoteTerminalSpawner, enabled: () => boolean, scopeError: ScopeError);
    call(endpoint: string, sessionId: string, cwd: string, args: Record<string, unknown>, signal: AbortSignal): Promise<TypertRpcResult>;
    open(endpoint: string, sessionId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AsyncIterable<Frame>>;
    /** A connection only disposes its subscriptions; the Host still owns the shells. */
    closeAll(): void;
    private shells;
    private create;
    private check;
    private requireTerminal;
}
export {};
//# sourceMappingURL=remote-terminal-controller.d.ts.map