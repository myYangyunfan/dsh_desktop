export type TcpCandidateType = "active" | "passive" | "so";
export declare class Candidate {
    foundation: string;
    component: number;
    transport: string;
    priority: number;
    host: string;
    port: number;
    type: string;
    relatedAddress?: string | undefined;
    relatedPort?: number | undefined;
    tcptype?: string | undefined;
    generation?: number | undefined;
    ufrag?: string | undefined;
    id: string;
    constructor(foundation: string, component: number, transport: string, priority: number, host: string, port: number, type: string, relatedAddress?: string | undefined, relatedPort?: number | undefined, tcptype?: string | undefined, generation?: number | undefined, ufrag?: string | undefined);
    refreshId(): void;
    static fromSdp(sdp: string): Candidate;
    canPairWith(other: Candidate): boolean;
    toSdp(): string;
}
export declare function candidateLocalPreference({ candidateType, transport, tcptype, otherPreference, }: {
    candidateType: string;
    transport?: string;
    tcptype?: string;
    otherPreference?: number;
}): number;
export declare function candidateFoundation(candidateType: string, candidateTransport: string, baseAddress: string): string;
export declare function candidatePriority(candidateType: string, options?: number | {
    transport?: string;
    tcptype?: string;
    localPreference?: number;
    otherPreference?: number;
}): number;
export declare function remoteTcpTypeForIncoming(localTcpType?: string): TcpCandidateType;
