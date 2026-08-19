import { skillManagerClientDescriptors } from "./client-descriptors.js";
import { type AssessSkillRiskRpcRequest, type BrowseRepositoriesRpcRequest, type CheckUpdatesRpcRequest, type CreateSkillRpcRequest, type DeleteSkillRpcRequest, type DiscoverExternalRpcRequest, type ExternalSkillCandidateWire, type ImportExternalRpcRequest, type GetCapabilitiesRpcRequest, type InspectRepositoryRpcRequest, type InstallRepositoryRpcRequest, type InstallSkillRpcRequest, type ListBackupsRpcRequest, type ListSkillsRpcRequest, type ListTargetStatesRpcRequest, type ListTrashRpcRequest, type ManagedSkillWire, type ProvenanceBatchFailureWire, type RepositoryInspectionResultWire, type RepositoryInstallResultWire, type RepositoryQueryResultWire, type ResolveMediaRpcRequest, type MediaAssetWire, type RollbackSkillRpcRequest, type RestoreTrashRpcRequest, type RpcResponse, type SearchRepositoriesRpcRequest, type SetEnabledRpcRequest, type SetTargetEnabledRpcRequest, type SkillBackupWire, type SkillMutationResultWire, type SkillTargetStateWire, type SkillUpdateCheckWire, type TrashedSkillWire, type SkillProvenanceVerificationWire, type SkillManagerCapabilitiesWire, type SkillRiskAssessmentWire, type UpdateSkillRpcRequest, type VerifyProvenanceBatchRpcRequest, type VerifyProvenanceRpcRequest } from "./rpc.js";
export interface SkillManagerRemote {
    list(request: ListSkillsRpcRequest): Promise<RpcResponse<{
        skills: ManagedSkillWire[];
    }>>;
    create(request: CreateSkillRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
    setEnabled(request: SetEnabledRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
    getCapabilities?(request: GetCapabilitiesRpcRequest): Promise<RpcResponse<{
        capabilities: SkillManagerCapabilitiesWire;
    }>>;
    searchRepositories?(request: SearchRepositoriesRpcRequest): Promise<RpcResponse<{
        result: RepositoryQueryResultWire;
    }>>;
    browseRepositories?(request: BrowseRepositoriesRpcRequest): Promise<RpcResponse<{
        result: RepositoryQueryResultWire;
    }>>;
    inspectRepository?(request: InspectRepositoryRpcRequest): Promise<RpcResponse<RepositoryInspectionResultWire>>;
    installSkill?(request: InstallSkillRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
    installRepository?(request: InstallRepositoryRpcRequest): Promise<RpcResponse<{
        results: RepositoryInstallResultWire[];
    }>>;
    assessSkillRisk?(request: AssessSkillRiskRpcRequest): Promise<RpcResponse<{
        assessment: SkillRiskAssessmentWire;
    }>>;
    resolveMedia?(request: ResolveMediaRpcRequest): Promise<RpcResponse<{
        asset: MediaAssetWire;
    }>>;
    verifyProvenance?(request: VerifyProvenanceRpcRequest): Promise<RpcResponse<{
        verification: SkillProvenanceVerificationWire;
    }>>;
    verifyProvenanceBatch?(request: VerifyProvenanceBatchRpcRequest): Promise<RpcResponse<{
        results: SkillProvenanceVerificationWire[];
        failures?: ProvenanceBatchFailureWire[];
    }>>;
    checkUpdates(request: CheckUpdatesRpcRequest): Promise<RpcResponse<{
        checks: SkillUpdateCheckWire[];
    }>>;
    update(request: UpdateSkillRpcRequest): Promise<RpcResponse<SkillMutationResultWire>>;
    listBackups(request: ListBackupsRpcRequest): Promise<RpcResponse<{
        backups: SkillBackupWire[];
    }>>;
    rollback(request: RollbackSkillRpcRequest): Promise<RpcResponse<SkillMutationResultWire>>;
    delete?(request: DeleteSkillRpcRequest): Promise<RpcResponse<{
        deleted: {
            name: string;
            trashId: string;
            deletedAt: string;
        };
    }>>;
    listTrash?(request: ListTrashRpcRequest): Promise<RpcResponse<{
        trashed: TrashedSkillWire[];
    }>>;
    restoreTrash?(request: RestoreTrashRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
    discoverExternal?(request: DiscoverExternalRpcRequest): Promise<RpcResponse<{
        candidates: ExternalSkillCandidateWire[];
    }>>;
    importExternal?(request: ImportExternalRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
    listTargetStates?(request: ListTargetStatesRpcRequest): Promise<RpcResponse<{
        states: SkillTargetStateWire[];
    }>>;
    setTargetEnabled?(request: SetTargetEnabledRpcRequest): Promise<RpcResponse<{
        skill: ManagedSkillWire;
    }>>;
}
interface TypertRemoteFailure {
    ok: false;
    error: {
        code: string;
        message: string;
    };
}
interface TypertRemoteSuccess<T> {
    ok: true;
    value: T;
}
type TypertRemoteResult<T> = TypertRemoteSuccess<T> | TypertRemoteFailure;
type TypertSkillManagerRemote = {
    [Method in keyof Required<SkillManagerRemote>]: (request: Parameters<Required<SkillManagerRemote>[Method]>[0]) => Promise<TypertRemoteResult<Awaited<ReturnType<Required<SkillManagerRemote>[Method]>>>>;
};
export interface SkillManagerPanelProps {
    remote: SkillManagerRemote;
}
interface ClientContextLike {
    remote: {
        $mount(options: {
            package: string;
            descriptors: typeof skillManagerClientDescriptors;
        }): Promise<() => void | Promise<void>>;
    };
    get(name: string): unknown;
    slots: {
        inject(name: string, registration: () => unknown, label?: string): unknown;
        register(options: {
            name: string;
            id: string;
            order: number;
            label: () => string;
            inject: () => SkillManagerPanelProps;
        }, component: typeof SkillManagerPanel): unknown;
    };
}
export declare const inject: readonly ["slots", "remote"];
export declare function apply(ctx: ClientContextLike): Promise<() => Promise<void>>;
export declare function adaptTypertRemote(remote: TypertSkillManagerRemote): SkillManagerRemote;
export declare function SkillManagerPanel({ remote }: SkillManagerPanelProps): import("react").JSX.Element;
export declare function ensureSkillManagerStyles(): void;
export {};
