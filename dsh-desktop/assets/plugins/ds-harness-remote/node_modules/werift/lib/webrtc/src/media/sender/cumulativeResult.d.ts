export declare class CumulativeResult {
    numPackets: number;
    /**byte */
    totalSize: number;
    firstPacketSentAtMs: number;
    lastPacketSentAtMs: number;
    firstPacketReceivedAtMs: number;
    lastPacketReceivedAtMs: number;
    /**
     *
     * @param size byte
     * @param sentAtMs
     * @param receivedAtMs
     */
    addPacket(size: number, sentAtMs: number, receivedAtMs: number): void;
    reset(): void;
    get receiveBitrate(): number;
    get sendBitrate(): number;
}
