import type { RtpPacket } from "../../imports/rtp";
export declare class StreamStatistics {
    base_seq?: number;
    max_seq?: number;
    cycles: number;
    packets_received: number;
    bytesReceived: number;
    headerBytesReceived: number;
    lastPacketReceivedTimestamp?: number;
    readonly clockRate: number;
    jitter_q4: number;
    private last_arrival?;
    private last_timestamp?;
    expected_prior: number;
    received_prior: number;
    constructor(clockRate: number);
    add(packet: RtpPacket, now?: number): void;
    get fraction_lost(): number;
    get jitter(): number;
    get packets_expected(): number;
    get packets_lost(): number;
}
