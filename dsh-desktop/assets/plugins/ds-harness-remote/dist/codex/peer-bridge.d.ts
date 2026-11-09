import type { CodexAppFrameData, CodexAppStreamClosedData, CodexAppTransferCommitResult, CodexAppTransferReadResult } from '@dsh-remote/protocol';
import type { PeerConnectionContext } from '../connection-controller.js';
import type { SafeLogger } from '../logging.js';
import type { CodexRemoteDomain } from './domain.js';
export type PublishCodexFrame = (event: 'codex.app.frame' | 'codex.app.stream.closed', data: CodexAppFrameData | CodexAppStreamClosedData) => Promise<void>;
/** Per-authenticated-connection state for the Codex Remote domain. */
export declare class CodexPeerBridge {
    private readonly domain;
    private readonly context;
    private readonly publish;
    private readonly logger?;
    compactHistoryEnabled: boolean;
    private readonly streams;
    private readonly incomingTransfers;
    private readonly outgoingTransfers;
    private closed;
    constructor(domain: CodexRemoteDomain, context: PeerConnectionContext, publish: PublishCodexFrame, logger?: SafeLogger | undefined);
    call(input: unknown): Promise<unknown>;
    private callDomain;
    respond(input: unknown): Promise<{
        resolved: true;
    }>;
    openStream(input: unknown): Promise<{
        opened: true;
        streamId: string;
        threadId: string;
    }>;
    closeStream(input: unknown): {
        closed: true;
        streamId: string;
    };
    openTransfer(input: unknown): {
        opened: true;
        transferId: string;
    };
    appendTransfer(input: unknown): {
        accepted: true;
        transferId: string;
        index: number;
    };
    commitTransfer(input: unknown): Promise<CodexAppTransferCommitResult>;
    readTransfer(input: unknown): CodexAppTransferReadResult;
    closeTransfer(input: unknown): {
        closed: boolean;
        transferId: string;
    };
    hasThreadSubscription(threadId: string): boolean;
    removeThreadSubscriptions(threadId: string): void;
    publishInbound(threadId: string, frame: {
        method: string;
        params: unknown;
    }): Promise<void>;
    failStreams(reason?: CodexAppStreamClosedData['reason']): Promise<void>;
    closeAll(): Promise<void>;
    private pruneTransfers;
    private requireOpen;
}
//# sourceMappingURL=peer-bridge.d.ts.map