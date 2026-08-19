import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { type CheckUpdatesRpcRequest, type AssessSkillRiskRpcRequest, type BrowseRepositoriesRpcRequest, type CreateSkillRpcRequest, type DiscoverExternalRpcRequest, type ImportExternalRpcRequest, type GetCapabilitiesRpcRequest, type InspectRepositoryRpcRequest, type InstallRepositoryRpcRequest, type InstallSkillRpcRequest, type ListBackupsRpcRequest, type ListTrashRpcRequest, type ListSkillsRpcRequest, type ListTargetStatesRpcRequest, type ResolveMediaRpcRequest, type RollbackSkillRpcRequest, type RestoreTrashRpcRequest, type SearchRepositoriesRpcRequest, type SetEnabledRpcRequest, type SetTargetEnabledRpcRequest, type SkillManagerRpcHandlers, type UpdateSkillRpcRequest, type VerifyProvenanceRpcRequest } from "./rpc.js";
export interface SkillManagerPluginConfig {
    root?: string;
    dshRoot?: string;
    codexRoot?: string;
    claudeRoot?: string;
    agentsRoot?: string;
    opencodeRoot?: string;
}
export declare class DshSkillManagerService extends TypertRemoteService {
    static inject: string[];
    readonly handlers: SkillManagerRpcHandlers;
    constructor(ctx: Context, config?: SkillManagerPluginConfig);
    list(request: ListSkillsRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skills: import("./rpc.js").ManagedSkillWire[];
    }>>;
    create(request: CreateSkillRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
    setEnabled(request: SetEnabledRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
    getCapabilities(request: GetCapabilitiesRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        capabilities: import("./rpc.js").SkillManagerCapabilitiesWire;
    }>>;
    searchRepositories(request: SearchRepositoriesRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        result: import("./rpc.js").RepositoryQueryResultWire;
    }>>;
    browseRepositories(request: BrowseRepositoriesRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        result: import("./rpc.js").RepositoryQueryResultWire;
    }>>;
    inspectRepository(request: InspectRepositoryRpcRequest): Promise<import("./rpc.js").RpcResponse<import("./rpc.js").RepositoryInspectionResultWire>>;
    installSkill(request: InstallSkillRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
    installRepository(request: InstallRepositoryRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        results: import("./rpc.js").RepositoryInstallResultWire[];
    }>>;
    assessSkillRisk(request: AssessSkillRiskRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        assessment: import("./rpc.js").SkillRiskAssessmentWire;
    }>>;
    resolveMedia(request: ResolveMediaRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        asset: import("./rpc.js").MediaAssetWire;
    }>>;
    verifyProvenance(request: VerifyProvenanceRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        verification: import("./rpc.js").SkillProvenanceVerificationWire;
    }>>;
    verifyProvenanceBatch(request: import("./rpc.js").VerifyProvenanceBatchRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        results: import("./rpc.js").SkillProvenanceVerificationWire[];
        failures?: import("./rpc.js").ProvenanceBatchFailureWire[];
    }>>;
    checkUpdates(request: CheckUpdatesRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        checks: import("./rpc.js").SkillUpdateCheckWire[];
    }>>;
    update(request: UpdateSkillRpcRequest): Promise<import("./rpc.js").RpcResponse<import("./rpc.js").SkillMutationResultWire>>;
    listBackups(request: ListBackupsRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        backups: import("./rpc.js").SkillBackupWire[];
    }>>;
    rollback(request: RollbackSkillRpcRequest): Promise<import("./rpc.js").RpcResponse<import("./rpc.js").SkillMutationResultWire>>;
    delete(request: import("./rpc.js").DeleteSkillRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        deleted: import("./rpc.js").DeletedSkillWire;
    }>>;
    listTrash(request: ListTrashRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        trashed: import("./rpc.js").TrashedSkillWire[];
    }>>;
    restoreTrash(request: RestoreTrashRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
    discoverExternal(request: DiscoverExternalRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        candidates: import("./rpc.js").ExternalSkillCandidateWire[];
    }>>;
    importExternal(request: ImportExternalRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
    listTargetStates(request: ListTargetStatesRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        states: import("./rpc.js").SkillTargetStateWire[];
    }>>;
    setTargetEnabled(request: SetTargetEnabledRpcRequest): Promise<import("./rpc.js").RpcResponse<{
        skill: import("./rpc.js").ManagedSkillWire;
    }>>;
}
export declare function resolveManagerRoot(config: SkillManagerPluginConfig, environment?: NodeJS.ProcessEnv): string;
export declare function resolveTargetRoots(config: SkillManagerPluginConfig, environment?: NodeJS.ProcessEnv): {
    codex: string;
    claude: string;
    agents: string;
    opencode: string;
};
export declare function resolveDshRoot(config: SkillManagerPluginConfig, environment?: NodeJS.ProcessEnv): string;
export * from "./rpc.js";
export { TYPERT, skillManagerDescriptors } from "./typert.host.js";
export default DshSkillManagerService;
