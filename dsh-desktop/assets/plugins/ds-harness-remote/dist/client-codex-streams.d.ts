import { RemoteClientCore } from '@dsh-remote/client-core';
import type { CodexAppFrameData, CodexAppStreamClosedData } from '@dsh-remote/protocol';
import type { CodexLoopbackStream, ConnectedRemote, HostAuthorizationControl } from './client-runtime-contract.js';
/** Collaborates with one ClientModeRuntime; never creates a second session or connection state. */
export interface ClientCodexStreamsContext {
    readonly activeRemote: () => ConnectedRemote | undefined;
    readonly codexStreams: Map<string, CodexLoopbackStream>;
    readonly host: HostAuthorizationControl | undefined;
}
export declare class ClientCodexStreams {
    private readonly context;
    constructor(context: ClientCodexStreamsContext);
    activeCodexRemote(): ConnectedRemote | undefined;
    openCodexStream(payload: unknown, signal?: AbortSignal): Promise<unknown>;
    readonly publishLocalCodexFrame: (event: "codex.app.frame" | "codex.app.stream.closed", data: CodexAppFrameData | CodexAppStreamClosedData) => Promise<void>;
    appendCodexFrame(stream: CodexLoopbackStream, data: unknown): void;
    localCodexAvailable(): boolean;
    requireLocalCodex(): Required<Pick<HostAuthorizationControl, 'codexCall' | 'codexRespond' | 'codexOpenStream' | 'codexCloseStream'>>;
    nextCodexFrames(payload: unknown, signal?: AbortSignal): Promise<unknown>;
    closeCodexStream(payload: unknown): Promise<unknown>;
    closeCodexStreams(client?: RemoteClientCore): Promise<void>;
}
//# sourceMappingURL=client-codex-streams.d.ts.map