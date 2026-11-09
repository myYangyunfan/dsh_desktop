import type { AgentAcpFrameData, AgentAcpStreamClosedData, AgentAcpTransferCommitResult, AgentAcpTransferReadResult, AcpSessionArchivedData } from '@dsh-remote/protocol';
import type { PeerConnectionContext } from '../connection-controller.js';
import type { SafeLogger } from '../logging.js';
import type { AcpRemoteGateway } from './gateway.js';
export type PublishAcpFrame = (event: 'agent.acp.frame' | 'agent.acp.stream.closed' | 'agent.acp.catalog.changed', data: AgentAcpFrameData | AgentAcpStreamClosedData | AcpSessionArchivedData) => Promise<void>;
/** Per-authenticated-connection state for the Cursor Remote domain. */
export declare class AcpPeerBridge {
    private readonly domain;
    private readonly context;
    private readonly publish;
    private readonly logger?;
    compactHistoryEnabled: boolean;
    private readonly toolControllers;
    private readonly streams;
    private readonly incomingTransfers;
    private readonly outgoingTransfers;
    private closed;
    constructor(domain: AcpRemoteGateway, context: PeerConnectionContext, publish: PublishAcpFrame, logger?: SafeLogger | undefined);
    call(input: unknown): Promise<unknown>;
    publishArchived(data: AcpSessionArchivedData): Promise<void>;
    private callDomain;
    respond(input: unknown): Promise<{
        resolved: true;
    }>;
    openStream(input: unknown): Promise<{
        opened: true;
        streamId: string;
        sessionId: string;
    }>;
    private followTool;
    /** Whether this peer has at least one live stream observing the session. */
    hasStreamFor(sessionId: string): boolean;
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
    commitTransfer(input: unknown): Promise<AgentAcpTransferCommitResult>;
    readTransfer(input: unknown): AgentAcpTransferReadResult;
    closeTransfer(input: unknown): {
        closed: boolean;
        transferId: string;
    };
    publishInbound(sessionId: string, frame: {
        method: string;
        params: unknown;
    }): Promise<void>;
    failStreams(reason?: AgentAcpStreamClosedData['reason'], sessions?: ReadonlySet<string>): Promise<void>;
    closeAll(): Promise<void>;
    private pruneTransfers;
    private requireOpen;
}
//# sourceMappingURL=peer-bridge.d.ts.map