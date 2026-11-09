import type { HarnessApiTransferCommitResult, HarnessApiTransferReadResult, HarnessRemoteFrameData, HarnessRemoteStreamClosedData } from '@dsh-remote/protocol';
import { z } from 'zod';
import { TerminalPolicy } from './terminal-policy.js';
import type { SafeLogger } from './logging.js';
import type { LocalTypertGateway, TypertRpcResult } from './typert-gateway-contract.js';
import { CodexWorkspaceBridge } from './codex-workspace-bridge.js';
type PublishRemoteFrame = (event: 'harness.remote.frame' | 'harness.remote.stream.closed', data: HarnessRemoteFrameData | HarnessRemoteStreamClosedData) => Promise<void>;
/** Fixed v0.1.2 Typert Remote subset exposed to authenticated peers. */
export declare const HARNESS_REMOTE_ALLOWLIST: readonly ["$events", "$events/result", "agentPresets/list", "agentPresets/read", "agentPresets/select", "commands/execute", "commands/list", "credentials/describe", "credentials/set", "credentials/unset", "directoryPicker/list", "fileReferences/list", "goals/clear", "goals/complete", "goals/create", "goals/edit", "goals/pause", "goals/resume", "job/list", "job/follow", "job/kill", "llm/discoverModels", "llm/listConfigurableProviders", "llm/listProviders", "messageFeedback/delete", "messageFeedback/list", "messageFeedback/put", "pluginInventory/list", "pluginManager/listBundles", "pluginManager/listPlugins", "pluginManager/listVersions", "pluginManager/readBundleDetail", "pluginManager/setBundleEnabled", "pluginManager/setPluginEnabled", "pluginManager/updateBundle", "permissionPresets/catalog", "schedule/list", "schedule/catalog", "schedule/history", "schedule/create", "schedule/update", "schedule/delete", "schedule/deleteInactive", "schedule/deliveryLimits", "schedule/edit", "schedule/run", "session/attachment", "session/cancel", "session/canOpenWorkspacePath", "session/control", "session/create", "session/follow", "session/fork", "session/list", "session/events", "session/modelCatalog", "session/page", "session/prompt", "remoteAccess/follow", "session/projections", "session/initializeDefaultModel", "session/workspacePathApplications", "session/rename", "session/search", "session/selectModel", "session/updateQueue", "sessionReferenceResolver/candidates", "settings/describe", "settings/mutate", "settings/replace", "settings/update", "skills/list", "subagents/interruptByParent", "subagents/list", "subagents/prompt", "userQuestions/answer", "userQuestions/attachWait", "claudeCodeMods/watchBand", "claudeCodeMods/pressBand", "workspaceFiles/list", "workspaceFiles/stat", "workspaceFiles/read", "workspaceFiles/readBytes", "workspaceFiles/readAll", "workspaceFiles/readRelated", "workspaceFiles/changes", "officeToPdf/render", "officeToPdf/generation", "toolResults/watch", "workspace/archiveSession", "workspace/create", "workspace/delete", "workspace/follow", "workspace/insertBefore", "workspace/insertSessionBefore", "workspace/rename", "workspace/unarchiveSession", "workspace/initializeDefault", "workspace/pinSession", "workspace/unpinSession"];
export type NativeWorkspaceResolver = (sessionId: string, signal: AbortSignal) => Promise<string | undefined>;
export declare const WORKSPACE_FILE_READ_ENDPOINTS: Set<string>;
/**
 * Host-owned reminder service (`ctx.schedule`). The official package exposes
 * create() only to in-process callers; this bridge is the single place an
 * authenticated Remote client may reach it, and it validates the untrusted
 * request itself before delegating.
 */
export interface ScheduleCreateService {
    create(sessionId: string, request: ScheduleCreateRequest, signal?: AbortSignal): Promise<unknown>;
}
declare const scheduleCreateArgsSchema: z.ZodObject<{
    sessionId: z.ZodString;
    title: z.ZodString;
    prompt: z.ZodString;
    after_seconds: z.ZodOptional<z.ZodNumber>;
    at: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
        date: z.ZodString;
        time: z.ZodString;
        time_zone: z.ZodString;
    }, z.core.$strict>]>>;
    every_seconds: z.ZodOptional<z.ZodNumber>;
    daily: z.ZodOptional<z.ZodObject<{
        time: z.ZodString;
        time_zone: z.ZodString;
    }, z.core.$strict>>;
    weekly: z.ZodOptional<z.ZodObject<{
        time: z.ZodString;
        time_zone: z.ZodString;
        weekdays: z.ZodArray<z.ZodNumber>;
    }, z.core.$strict>>;
    cron: z.ZodOptional<z.ZodObject<{
        expression: z.ZodString;
        time_zone: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ScheduleCreateRequest = Omit<z.infer<typeof scheduleCreateArgsSchema>, 'sessionId'>;
/** Host-side adapter from the encrypted peer channel to the official alpha Gateway carrier. */
export declare class HarnessRemoteBridge {
    private readonly gateway;
    private readonly publish;
    private readonly logger?;
    private readonly harnessVersion?;
    private readonly terminal;
    private readonly codexWorkspace?;
    private readonly resolveWorkspaceRoot?;
    private readonly schedule?;
    compactHistoryEnabled: boolean;
    private readonly streams;
    private readonly incomingTransfers;
    private readonly outgoingTransfers;
    private readonly terminalCarrier;
    constructor(gateway: LocalTypertGateway, publish: PublishRemoteFrame, logger?: SafeLogger | undefined, harnessVersion?: string | undefined, terminal?: TerminalPolicy, codexWorkspace?: CodexWorkspaceBridge | undefined, resolveWorkspaceRoot?: NativeWorkspaceResolver | undefined, schedule?: ScheduleCreateService | undefined);
    call(input: unknown): Promise<TypertRpcResult>;
    /** Validate one untrusted create request, then delegate to the Host schedule service. */
    private createSchedule;
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
    /**
     * 0.2.2 adds official third-party bundle updates. Keep the mutation available
     * to trusted devices but never let a Remote user replace this plugin (or a
     * bundle owning it) from over the encrypted channel.
     */
    private checkRemoteBundleUpdate;
    private assertAllowed;
    private pump;
    /** Keep the source paused until the Client reads and releases this exact item. */
    private transferStreamFrame;
    private pruneTransfers;
    private assertNativeWorkspaceFileCall;
    private resolveWorkspaceRootForSession;
    private verifyWorkspacePathContainment;
}
export declare function filterSessionListProjections(result: TypertRpcResult): TypertRpcResult;
export declare function filterSessionListProjections(endpoint: string, result: TypertRpcResult): TypertRpcResult;
export {};
//# sourceMappingURL=harness-remote-bridge.d.ts.map