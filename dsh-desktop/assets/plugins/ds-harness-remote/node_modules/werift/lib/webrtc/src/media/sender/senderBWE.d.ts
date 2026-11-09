import { Event } from "../../imports/common";
import { type TransportWideCC } from "../../imports/rtp";
export declare class SenderBandwidthEstimator {
    congestion: boolean;
    readonly onAvailableBitrate: Event<[number]>;
    /**congestion occur or not */
    readonly onCongestion: Event<[boolean]>;
    readonly onCongestionScore: Event<[number]>;
    private congestionCounter;
    private cumulativeResult;
    private sentInfos;
    private _congestionScore;
    /**1~10 big is worth*/
    get congestionScore(): number;
    set congestionScore(v: number);
    private _availableBitrate;
    get availableBitrate(): number;
    set availableBitrate(v: number);
    constructor();
    receiveTWCC(feedback: TransportWideCC): void;
    rtpPacketSent(sentInfo: SentInfo): void;
}
export interface SentInfo {
    wideSeq: number;
    /**
     * byte
     */
    size: number;
    isProbation?: boolean;
    sendingAtMs: number;
    sentAtMs: number;
}
