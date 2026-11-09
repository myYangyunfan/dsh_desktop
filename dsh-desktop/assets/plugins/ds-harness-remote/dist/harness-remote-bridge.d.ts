import type { HarnessApiTransferCommitResult, HarnessApiTransferReadResult, HarnessRemoteFrameData, HarnessRemoteStreamClosedData } from '@dsh-remote/protocol';
import { TerminalPolicy } from './terminal-policy.js';
import type { SafeLogger } from './logging.js';
import type { LocalTypertGateway, TypertRpcResult } from './typert-gateway-contract.js';
import { CodexWorkspaceBridge } from './codex-workspace-bridge.js';
type PublishRemoteFrame = (event: 'harness.remote.frame' | 'harness.remote.stream.closed', data: HarnessRemoteFrameData | HarnessRemoteStreamClosedData) => Promise<void>;
/** Fixed v0.1.2 Typert Remote subset exposed to authenticated peers. */
export declare const HARNESS_REMOTE_ALLOWLIST: readonly ["$events", "$events/result", "agentPresets/list", "agentPresets/read", "agentPresets/select", "commands/execute", "commands/list", "credentials/describe", "credentials/set", "credentials/unset", "directoryPicker/list", "fileReferences/list", "goals/clear", "goals/complete", "goals/create", "goals/edit", "goals/pause", "goals/resume", "job/list", "job/follow", "llm/discoverModels", "llm/listConfigurableProviders", "llm/listProviders", "messageFeedback/delete", "messageFeedback/list", "messageFeedback/put", "pluginInventory/list", "pluginManager/listBundles", "pluginManager/listPlugins", "pluginManager/setBundleEnabled", "pluginManager/setPluginEnabled", "permissionPresets/catalog", "schedule/list", "schedule/catalog", "schedule/history", "schedule/update", "schedule/delete", "session/attachment", "session/cancel", "session/canOpenWorkspacePath", "session/control", "session/create", "session/follow", "session/fork", "session/list", "session/modelCatalog", "session/page", "session/prompt", "remoteAccess/follow", "session/projections", "session/initializeDefaultModel", "session/workspacePathApplications", "session/rename", "session/search", "session/selectModel", "session/updateQueue", "sessionReferenceResolver/candidates", "settings/describe", "settings/mutate", "settings/replace", "settings/update", "skills/list", "subagents/interruptByParent", "subagents/list", "subagents/prompt", "userQuestions/answer", "userQuestions/attachWait", "claudeCodeMods/watchBand", "claudeCodeMods/pressBand", "workspaceFiles/list", "workspaceFiles/stat", "workspaceFiles/read", "workspaceFiles/readBytes", "workspaceFiles/readAll", "workspaceFiles/readRelated", "workspaceFiles/changes", "officeToPdf/render", "officeToPdf/generation", "workspace/archiveSession", "workspace/create", "workspace/delete", "workspace/follow", "workspace/insertBefore", "workspace/insertSessionBefore", "workspace/rename", "workspace/unarchiveSession", "workspace/initializeDefault", "workspace/pinSession", "workspace/unpinSession"];
/** Host-side adapter from the encrypted peer channel to the official alpha Gateway carrier. */
export declare class HarnessRemoteBridge {
    private readonly gateway;
    private readonly publish;
    private readonly logger?;
    private readonly harnessVersion?;
    private readonly terminal;
    private readonly codexWorkspace?;
    compactHistoryEnabled: boolean;
    private readonly streams;
    private readonly incomingTransfers;
    private readonly outgoingTransfers;
    private readonly terminalCarrier;
    constructor(gateway: LocalTypertGateway, publish: PublishRemoteFrame, logger?: SafeLogger | undefined, harnessVersion?: string | undefined, terminal?: TerminalPolicy, codexWorkspace?: CodexWorkspaceBridge | undefined);
    call(input: unknown): Promise<TypertRpcResult>;
    private directoryList;
    openTransfer(input: unknown): {
        opened: true;
        transferId: string;
    };
    appendTransfer(input: unknown): {
        accepted: true;
        transferId: string;
        index: number;
    };
    commitTransfer(input: unknown): Promise<HarnessApiTransferCommitResult>;
    readTransfer(input: unknown): HarnessApiTransferReadResult;
    closeTransfer(input: unknown): {
        closed: boolean;
        transferId: string;
    };
    openStream(input: unknown): Promise<{
        opened: true;
        streamId: string;
    }>;
    closeStream(input: unknown): {
        closed: boolean;
        streamId: string;
    };
    closeAll(reason?: HarnessRemoteStreamClosedData['reason']): Promise<void>;
    private checkPluginManagement;
    private assertAllowed;
    private pump;
    /** Keep the source paused until the Client reads and releases this exact item. */
    private transferStreamFrame;
    private pruneTransfers;
}
export {};
//# sourceMappingURL=harness-remote-bridge.d.ts.map