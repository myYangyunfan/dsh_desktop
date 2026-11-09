/**
 * WebRTC Statistics API implementation
 * Based on: https://www.w3.org/TR/webrtc-stats/
 */
export type RTCStatsType = "codec" | "inbound-rtp" | "outbound-rtp" | "remote-inbound-rtp" | "remote-outbound-rtp" | "media-source" | "media-playout" | "peer-connection" | "data-channel" | "transport" | "candidate-pair" | "local-candidate" | "remote-candidate" | "certificate";
export interface RTCStats {
    timestamp: number;
    type: RTCStatsType;
    id: string;
}
export interface RTCRtpStreamStats extends RTCStats {
    ssrc: number;
    kind: string;
    transportId?: string;
    codecId?: string;
}
export interface RTCReceivedRtpStreamStats extends RTCRtpStreamStats {
    packetsReceived?: number;
    bytesReceived?: number;
    packetsLost?: number;
    jitter?: number;
    packetsDiscarded?: number;
    packetsRepaired?: number;
    burstPacketsLost?: number;
    burstPacketsDiscarded?: number;
    burstLossCount?: number;
    burstDiscardCount?: number;
    burstLossRate?: number;
    burstDiscardRate?: number;
    gapLossRate?: number;
    gapDiscardRate?: number;
    framesDropped?: number;
    partialFramesLost?: number;
    fullFramesLost?: number;
}
export interface RTCInboundRtpStreamStats extends RTCReceivedRtpStreamStats {
    type: "inbound-rtp";
    trackIdentifier?: string;
    mid?: string;
    remoteId?: string;
    framesDecoded?: number;
    keyFramesDecoded?: number;
    frameWidth?: number;
    frameHeight?: number;
    frameBitDepth?: number;
    framesPerSecond?: number;
    qpSum?: number;
    totalDecodeTime?: number;
    totalInterFrameDelay?: number;
    totalSquaredInterFrameDelay?: number;
    lastPacketReceivedTimestamp?: number;
    headerBytesReceived?: number;
    packetsFailedDecryption?: number;
    packetsDuplicated?: number;
    perDscpPacketsReceived?: Record<string, number>;
    nackCount?: number;
    firCount?: number;
    pliCount?: number;
    totalProcessingDelay?: number;
    estimatedPlayoutTimestamp?: number;
    jitterBufferDelay?: number;
    jitterBufferTargetDelay?: number;
    jitterBufferEmittedCount?: number;
    jitterBufferMinimumDelay?: number;
    totalSamplesReceived?: number;
    concealedSamples?: number;
    silentConcealedSamples?: number;
    concealmentEvents?: number;
    insertedSamplesForDeceleration?: number;
    removedSamplesForAcceleration?: number;
    audioLevel?: number;
    totalAudioEnergy?: number;
    totalSamplesDuration?: number;
    framesReceived?: number;
    decoderImplementation?: string;
    playoutId?: string;
    powerEfficientDecoder?: boolean;
    framesAssembledFromMultiplePackets?: number;
    totalAssemblyTime?: number;
    retransmittedPacketsReceived?: number;
    retransmittedBytesReceived?: number;
    rtxSsrc?: number;
    fecSsrc?: number;
}
export interface RTCSentRtpStreamStats extends RTCRtpStreamStats {
    packetsSent?: number;
    bytesSent?: number;
}
export interface RTCOutboundRtpStreamStats extends RTCSentRtpStreamStats {
    type: "outbound-rtp";
    mid?: string;
    mediaSourceId?: string;
    remoteId?: string;
    rid?: string;
    headerBytesSent?: number;
    retransmittedPacketsSent?: number;
    retransmittedBytesSent?: number;
    rtxSsrc?: number;
    targetBitrate?: number;
    totalEncodedBytesTarget?: number;
    frameWidth?: number;
    frameHeight?: number;
    frameBitDepth?: number;
    framesPerSecond?: number;
    framesSent?: number;
    hugeFramesSent?: number;
    framesEncoded?: number;
    keyFramesEncoded?: number;
    qpSum?: number;
    totalEncodeTime?: number;
    totalPacketSendDelay?: number;
    qualityLimitationReason?: string;
    qualityLimitationDurations?: Record<string, number>;
    qualityLimitationResolutionChanges?: number;
    perDscpPacketsSent?: Record<string, number>;
    nackCount?: number;
    firCount?: number;
    pliCount?: number;
    encoderImplementation?: string;
    powerEfficientEncoder?: boolean;
    active?: boolean;
    scalabilityMode?: string;
}
export interface RTCRemoteInboundRtpStreamStats extends RTCReceivedRtpStreamStats {
    type: "remote-inbound-rtp";
    localId?: string;
    roundTripTime?: number;
    totalRoundTripTime?: number;
    fractionLost?: number;
    roundTripTimeMeasurements?: number;
}
export interface RTCRemoteOutboundRtpStreamStats extends RTCSentRtpStreamStats {
    type: "remote-outbound-rtp";
    localId?: string;
    remoteTimestamp?: number;
    reportsSent?: number;
    roundTripTime?: number;
    totalRoundTripTime?: number;
    roundTripTimeMeasurements?: number;
}
export interface RTCMediaSourceStats extends RTCStats {
    type: "media-source";
    trackIdentifier: string;
    kind: string;
}
export interface RTCVideoSourceStats extends RTCMediaSourceStats {
    width?: number;
    height?: number;
    frames?: number;
    framesPerSecond?: number;
}
export interface RTCAudioPlayoutStats extends RTCStats {
    type: "media-playout";
    kind: "audio";
    synthesizedSamplesDuration?: number;
    synthesizedSamplesEvents?: number;
    totalSamplesDuration?: number;
    totalPlayoutDelay?: number;
    totalSamplesCount?: number;
}
export interface RTCAudioSourceStats extends RTCMediaSourceStats {
    audioLevel?: number;
    totalAudioEnergy?: number;
    totalSamplesDuration?: number;
    echoReturnLoss?: number;
    echoReturnLossEnhancement?: number;
    droppedSamplesDuration?: number;
    droppedSamplesEvents?: number;
    totalCaptureDelay?: number;
    totalSamplesCaptured?: number;
}
export interface RTCPeerConnectionStats extends RTCStats {
    type: "peer-connection";
    dataChannelsOpened?: number;
    dataChannelsClosed?: number;
}
export interface RTCDataChannelStats extends RTCStats {
    type: "data-channel";
    label?: string;
    protocol?: string;
    dataChannelIdentifier?: number;
    state: RTCDataChannelState;
    messagesSent?: number;
    bytesSent?: number;
    messagesReceived?: number;
    bytesReceived?: number;
}
export interface RTCTransportStats extends RTCStats {
    type: "transport";
    bytesSent?: number;
    packetsSent?: number;
    bytesReceived?: number;
    packetsReceived?: number;
    rtcpTransportStatsId?: string;
    iceRole?: RTCIceRole;
    iceLocalUsernameFragment?: string;
    dtlsState: RTCDtlsTransportState;
    iceState?: RTCIceTransportState;
    selectedCandidatePairId?: string;
    localCertificateId?: string;
    remoteCertificateId?: string;
    tlsVersion?: string;
    dtlsCipher?: string;
    dtlsRole?: RTCDtlsRole;
    srtpCipher?: string;
    selectedCandidatePairChanges?: number;
    iceRestarts?: number;
}
export interface RTCIceCandidateStats extends RTCStats {
    transportId?: string;
    address?: string;
    port?: number;
    protocol?: string;
    candidateType: RTCIceCandidateType;
    priority?: number;
    url?: string;
    relayProtocol?: string;
    foundation?: string;
    relatedAddress?: string;
    relatedPort?: number;
    usernameFragment?: string;
    tcpType?: RTCIceTcpCandidateType;
}
export interface RTCIceCandidatePairStats extends RTCStats {
    type: "candidate-pair";
    transportId?: string;
    localCandidateId: string;
    remoteCandidateId: string;
    state: RTCStatsIceCandidatePairState;
    nominated?: boolean;
    packetsSent?: number;
    packetsReceived?: number;
    bytesSent?: number;
    bytesReceived?: number;
    lastPacketSentTimestamp?: number;
    lastPacketReceivedTimestamp?: number;
    totalRoundTripTime?: number;
    currentRoundTripTime?: number;
    roundTripTimeMeasurements?: number;
    availableOutgoingBitrate?: number;
    availableIncomingBitrate?: number;
    requestsReceived?: number;
    requestsSent?: number;
    responsesReceived?: number;
    responsesSent?: number;
    retransmissionsReceived?: number;
    retransmissionsSent?: number;
    consentRequestsSent?: number;
    consentExpiredTimestamp?: number;
    packetsDiscardedOnSend?: number;
    bytesDiscardedOnSend?: number;
}
export interface RTCCertificateStats extends RTCStats {
    type: "certificate";
    fingerprint: string;
    fingerprintAlgorithm: string;
    base64Certificate: string;
    issuerCertificateId?: string;
}
export interface RTCCodecStats extends RTCStats {
    type: "codec";
    payloadType: number;
    transportId: string;
    mimeType: string;
    clockRate?: number;
    channels?: number;
    sdpFmtpLine?: string;
}
export type RTCDataChannelState = "connecting" | "open" | "closing" | "closed";
export type RTCDtlsTransportState = "new" | "connecting" | "connected" | "closed" | "failed";
export type RTCIceTransportState = "new" | "checking" | "connected" | "completed" | "disconnected" | "failed" | "closed";
export type RTCIceRole = "controlling" | "controlled";
export type RTCDtlsRole = "client" | "server";
export type RTCIceCandidateType = "host" | "srflx" | "prflx" | "relay";
export type RTCIceTcpCandidateType = "active" | "passive" | "so";
export type RTCStatsIceCandidatePairState = "frozen" | "waiting" | "in-progress" | "failed" | "succeeded";
/**
 * RTCStatsReport is a Map-like object that holds WebRTC statistics
 */
export declare class RTCStatsReport extends Map<string, RTCStats> {
    constructor(stats?: Array<RTCStats>);
}
/**
 * Generate a unique ID for a statistics object
 */
export declare function generateStatsId(type: string, ...parts: (string | number | undefined)[]): string;
export declare function generateCodecStatsId(transportId: string, payloadType: number, scopeId: string): string;
/**
 * Get current timestamp in milliseconds (DOMHighResTimeStamp)
 */
export declare function getStatsTimestamp(): number;
export declare function getReferencedStatsIds(stat: RTCStats): string[];
export declare function buildStatsReport(stats: Iterable<RTCStats>, rootIds?: Iterable<string>): RTCStatsReport;
